"""
parli.ingest.donor_entities -- canonical donor entities for the money data.

The AEC and state registers spell the same donor many ways ("Westpac Banking
Corporation", "Westpac Bank", "WESTPAC BANKING CORP", "Westpac - Bundaberg"),
and every donor total on the site was wrong because of it. This module
resolves every distinct `donor_name` in `donations` (AEC) and `ext_donations`
(QLD/VIC/WA) to one entity and writes two additive tables:

  ext_donor_entities  one row per entity: entity_id, canonical_name, kind
                      (company | union | association | individual | party_unit |
                      government | other), abn (+ ABR legal name / status when the
                      bulk extract matched), notes
  ext_donor_aliases   one row per distinct raw donor string: alias_raw (exactly as
                      stored in the source table, so exports join on it without
                      re-implementing the normaliser), alias_norm, entity_id,
                      branch ("Vic Branch", "NSW", "of Employees Queensland" ...),
                      seen_in, confidence, method

Three tiers, recorded per alias in `method`:

  exact    the alias differs from the canonical name only by case, punctuation,
           whitespace, "&" vs "and" or an apostrophe            (confidence 1.0)
  rule     the alias also needed a legal-form suffix dropped (Pty Ltd, Limited,
           Inc, Corporation, Group, Holdings, leading "The"), an abbreviation
           expanded (Assn, Aust, Dept) or a trailing branch / state suffix removed
           ("(NSW)", "- Vic Branch", "Queensland Branch", "of Employees
           Queensland"). Never applied to person-shaped names.  (confidence 0.9)
  curated  hand-reviewed in parli/ingest/donor_aliases.json, which covers every
           donor that appears on the site (the top 250 per money file plus every
           donor in access.json). Curated merges beat both automatic tiers; a
           curated entity with no aliases pins a name so the rule tier cannot
           merge it into a look-alike.                               (confidence 1.0)

Individuals only ever merge on the exact tier. Government departments merge
("Dept of Finance" / "Dept Finance"). Union branches roll up to the parent union
with `branch` kept on the alias so a donor page can list "given as: Vic Branch,
SA Branch". Ambiguous look-alikes stay separate with a note.

Run on the box that holds parli.db (the read side is read-only; the write goes
through ExtWriter -- short transactions, busy_timeout 600 s, retry on lock):

    PYTHONPATH=. python -m parli.ingest.donor_entities --report          # dry run + tier counts
    PYTHONPATH=. python -m parli.ingest.donor_entities --db ~/.cache/autoresearch/parli.db
    PYTHONPATH=. python -m parli.ingest.donor_entities --db ... --abr ~/.cache/autoresearch/abr/matches.json

`--abr` takes the output of parli.ingest.abr_match (ABN Bulk Extract, CC BY 3.0
AU). Without it `abn` stays NULL.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
import time
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from parli.ingest.ext_common import ExtWriter, log

SOURCE = "donor_entities"
SOURCE_URL = "https://github.com/jaketracey/opax/blob/main/parli/ingest/donor_aliases.json"
CURATED_PATH = Path(__file__).with_name("donor_aliases.json")
DEFAULT_DB = "/home/jake/.cache/autoresearch/parli.db"

KINDS = ("company", "union", "association", "individual", "party_unit", "government", "other")

# ── normalisation ────────────────────────────────────────────────────────────

# Legal-form and generic suffix tokens dropped from the END of a name (rule tier).
ORG_SUFFIX = {
    "pty", "ltd", "limited", "proprietary", "inc", "incorporated", "corporation", "corp",
    "co", "company", "coy", "pl", "plc", "nl", "llc", "group", "holdings", "holding", "the",
}
STOPWORDS = {"of", "and", "the", "for", "in"}
ABBREV = {
    "assn": "association", "assoc": "association", "assocn": "association", "assocation": "association",
    "aust": "australia", "austn": "australian", "corp": "corporation", "dept": "department",
    "bros": "brothers", "intl": "international", "mgmt": "management", "svcs": "services",
    "coy": "company", "org": "organisation", "fed": "federation", "natl": "national",
    "indust": "industries", "invest": "investments", "devt": "development", "devel": "development",
    "constr": "construction", "constrn": "construction", "cons": "construction",
    "p": "p",  # keep initials
}

STATE_WORDS = (
    r"nsw|n\.?s\.?w\.?|new south wales|vic|victoria|victorian|qld|q\'?ld|queensland|wa|w\.?a\.?|"
    r"western australia|western australian|sa|s\.?a\.?|south australia|south australian|tas|"
    r"tasmania|tasmanian|nt|northern territory|act|a\.?c\.?t\.?|australian capital territory|"
    r"nsw\s*(?:/|&|and|-)\s*act|qld\s*(?:/|&|and|-)\s*nt|vic\s*(?:/|&|and|-)\s*tas|wa\s*(?:/|&|and|-)\s*sa|"
    r"nsw\s*(?:/|&|and|-)\s*qld|sa\s*(?:/|&|and|-)\s*nt|nt\s*(?:/|&|and|-)\s*qld"
)
UNIT_WORDS = r"branch|division|state branch|state office|state council|office|region|district|sub-branch|sub branch"
# 1. separator + state/branch tail:  "X (NSW)", "X - Vic Branch", "X, Queensland Branch", "X - National Office"
_BRANCH_SEP = re.compile(
    rf"\s*[-–—,(\[]\s*(?:the\s+)?((?:{STATE_WORDS}|national|federal|state|newcastle|northern|western|eastern|southern|central|metropolitan)"
    rf"(?:\s+(?:{UNIT_WORDS}))?)\s*[)\]]?\s*$",
    re.I,
)
# 2. no separator, but the unit word is explicit: "X Queensland Branch", "X NSW Division", "X National Office"
_BRANCH_UNIT = re.compile(
    rf"\s+((?:{STATE_WORDS}|national|federal|state)\s+(?:{UNIT_WORDS}))\s*$", re.I,
)
# 3. registered-organisation style: "Australian Workers Union of Employees Queensland",
#    "... Union of Employees, Queensland", "... Employees Union Queensland Branch"
_BRANCH_EMPLOYEES = re.compile(
    rf"\s+((?:of\s+)?employees,?\s+(?:{STATE_WORDS})(?:\s+(?:{UNIT_WORDS}))?)\s*$", re.I,
)
# 4. bare trailing state after an organisation keyword: "Australian Hotels Association Queensland".
_ORG_KEYWORD_THEN_STATE = re.compile(
    rf"^(.*\b(?:union|association|assn|assoc|society|guild|federation|institute|council|chamber|alliance|"
    rf"league|congress|employees|workers|teachers|nurses|officers|brotherhood))\s+((?:{STATE_WORDS}))\s*$",
    re.I,
)
# Parenthesised tail that is only a state (rule 1 already covers "(NSW)"; this catches "(N.S.W. Branch)").
_PAREN_TAIL = re.compile(r"\s*\(([^()]{1,40})\)\s*$")

# Tokens that mark an organisation (blocks the person heuristic).
ORG_KEYWORDS = {
    "pty", "ltd", "limited", "proprietary", "inc", "incorporated", "corporation", "corp", "co", "company",
    "group", "holdings", "trust", "trustee", "fund", "foundation", "association", "assn", "assoc", "society",
    "union", "guild", "federation", "institute", "council", "chamber", "alliance", "league", "club", "bank",
    "banking", "investments", "investment", "enterprises", "enterprise", "industries", "industry", "nominees",
    "developments", "development", "constructions", "construction", "resorts", "resort", "energy", "mining",
    "resources", "properties", "property", "capital", "partners", "consulting", "communications", "media",
    "services", "service", "international", "australia", "australian", "national", "department", "dept",
    "commission", "office", "agency", "authority", "party", "committee", "campaign", "forum", "network",
    "centre", "center", "hotel", "hotels", "hospital", "school", "university", "college", "church", "parish",
    "shire", "city", "town", "estate", "farms", "farm", "station", "vineyard", "winery", "brewery", "motors",
    "transport", "logistics", "engineering", "systems", "solutions", "technologies", "technology", "pharmacy",
    "medical", "health", "care", "legal", "lawyers", "solicitors", "accountants", "advisory", "management",
    "marketing", "advertising", "productions", "entertainment", "gaming", "casino", "racing", "workers",
    "employees", "teachers", "nurses", "officers", "brotherhood", "collective", "cooperative", "co-op",
    "incorporated", "institute", "ministry", "electoral", "elections", "and", "&", "of", "the",
    "family", "super", "superannuation", "wealth", "finance", "financial", "insurance", "assurance",
    "brothers", "sons", "son", "daughters", "unit", "units", "branch", "division",
}
UNION_RX = re.compile(
    r"\bunions?\b|\bworkers'?\b|\bemployees'?\b|\bcfme?u\b|\bcepu\b|\betu\b|\bawu\b|\bamwu\b|\bmua\b|"
    r"\bnuw\b|\btwu\b|\brtbu\b|\bcpsu\b|\bpsa\b|\bhsu\b|\banmf\b|\bnteu\b|\bsda\b|\bhacsu\b|\bmeaa\b|"
    r"\bunited voice\b|\bunited workers\b|\bunions? nsw\b|\btrades hall\b|\btrades and labou?r council\b|"
    r"\blabou?r council\b|\btogether queensland\b|\bprofessionals australia\b|\bteachers federation\b|"
    r"\bnurses( and midwives)? (federation|association|union)\b|\bfinance sector union\b|\bfsu\b|"
    r"\bindependent education union\b|\bieu\b|\bpolice (association|union|federation)\b|"
    r"\bfire ?fighters union\b|\bambulance employees\b|\bemployees association\b|\bemployees federation\b|"
    r"\bplumbers\b|\belectrical trades\b|\bmaritime union\b|\brail tram and bus\b|\bcommunications electrical\b|"
    r"\bconstruction forestry\b|\bmanufacturing workers\b|\btransport workers\b|\bservices union\b|"
    r"\bpublic sector union\b|\bhealth services union\b|\bmeat industry employees\b|\bshop distributive\b|"
    r"\bclerks\b|\bmisc(ellaneous)? workers\b|\bliquor hospitality\b|\blhmu\b|\bnational union of\b",
    re.I,
)
GOVERNMENT_RX = re.compile(
    r"\bdept\b|\bdepartment\b|\belectoral commission\b|\belections? (act|nsw|wa|sa|tas|vic|qld|nt)\b|"
    r"\belectoral office\b|\bcommonwealth of australia\b|\baustralian taxation office\b|\bato\b|"
    r"\baec\b|\becq\b|\bvec\b|\bwaec\b|\bpublic funding\b|\bcity council\b|\bshire council\b|"
    r"\bregional council\b|\bstate government\b|\bgovernment of\b|\bcommonwealth government\b|"
    r"\bministry (of|for)\b|\bparliament(ary)? (of|services)\b|\bofficial development\b|\btreasury\b",
    re.I,
)
PARTY_RX = re.compile(
    r"\blabor\b|\bliberal\b|\bliberals\b|\bgreens\b|\bnationals\b|\bone nation\b|\bunited australia\b|"
    r"\bkatter\b|\bfamily first\b|\bcentre alliance\b|\bcountry liberal\b|\blnp\b|\balp\b|"
    r"\bcormack foundation\b|\bjohn curtin house\b|\bfree enterprise foundation\b|\bnational party\b|"
    r"\bdemocrats\b|\bsocialist alliance\b|\banimal justice party\b|\breason party\b|"
    # "shooters" alone is a gun shop, a shooting club and the Sporting Shooters
    # Association long before it is a party, so the party words must be present.
    r"\bshooters,?\s*(?:and\s+|&\s*)?fishers\b|\bshooters party\b|"
    r"\blegalise cannabis\b|\bfusion party\b|\bsustainable australia\b|\bpalmer united\b|"
    r"\bteal independents?\b",
    re.I,
)
ASSOCIATION_RX = re.compile(
    r"\bassociation\b|\bassn\b|\bassoc\b|\bsociety\b|\bguild\b|\bfederation\b|\binstitute\b|\bcouncil\b|"
    r"\bchamber\b|\balliance\b|\bleague\b|\bclub\b|\bfoundation\b|\bforum\b|\bnetwork\b|\bcongress\b|"
    r"\bcollective\b|\bcommittee\b|\bcoalition\b|\bcampaign\b|\bmovement\b|\bfriends of\b|\binc\b|"
    r"\bincorporated\b|\bchurch\b|\bparish\b|\bdiocese\b|\bsynod\b|\bcooperative\b|\bco-op\b|\bunited voice\b",
    re.I,
)
COMPANY_RX = re.compile(
    r"\bpty\b|\bltd\b|\blimited\b|\bproprietary\b|\bcorporation\b|\bcorp\b|\bgroup\b|\bholdings?\b|\bbank\b|"
    r"\binvestments?\b|\benterprises?\b|\bindustries\b|\bnominees\b|\bdevelopments?\b|\bconstructions?\b|"
    r"\bresorts?\b|\benergy\b|\bmining\b|\bresources\b|\bproperties\b|\bcapital\b|\bpartners\b|\bconsulting\b|"
    r"\bcommunications\b|\bmedia\b|\bservices\b|\bplc\b|\bnl\b|\bllc\b|\binc\b|\btrust\b|\btrustee\b|"
    r"\bp/l\b|\bcompany\b|\bco\b|\b& sons?\b|\bbrothers\b|\bbros\b|\bmotors\b|\bfarms?\b|\bwinery\b|"
    r"\bvineyards?\b|\bhotels?\b|\bcasino\b|\bracing\b|\bgaming\b|\bsuperannuation\b|\bsuper\b|\bwealth\b|"
    r"\bfinance\b|\bfinancial\b|\binsurance\b|\bengineering\b|\blogistics\b|\btransport\b|\bsystems\b|"
    r"\bsolutions\b|\btechnolog(y|ies)\b|\bpharmac(y|ies)\b|\blawyers\b|\bsolicitors\b|\baccountants\b|"
    r"\badvisory\b|\bmanagement\b|\bmarketing\b|\badvertising\b|\bproductions\b|\bentertainment\b|"
    r"\bestates?\b|\bagencies\b|\bagency\b|\bstudios?\b|\bfoods?\b|\bmeats?\b|\bseafoods?\b",
    re.I,
)
HONORIFIC_RX = re.compile(r"^(mr|mrs|ms|miss|dr|prof|professor|hon|the hon|sir|dame|lady|rev|fr|cr|hon\.)\b\.?\s+", re.I)
SURNAME_FIRST_RX = re.compile(r"^[A-Za-z'’`\-\. ]{2,40},\s*[A-Za-z'’`\-\. ]{1,60}$")
INITIALS_RX = re.compile(r"^(?:[A-Z]\.?\s*){1,3}[A-Z][a-z'’\-]+$|^[A-Z][a-z'’\-]+\s+(?:[A-Z]\.?\s*){1,3}$")


def _ascii(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")


def norm_exact(name: str) -> str:
    """Case, punctuation, whitespace, '&'->'and', apostrophes joined."""
    s = _ascii(name or "").lower()
    s = s.replace("&", " and ").replace("+", " and ")
    s = re.sub(r"['’`´]", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def strip_branch(raw: str) -> tuple[str, str | None]:
    """Return (stem, branch) -- the branch/state tail as written, or None."""
    s = (raw or "").strip()
    branch_parts: list[str] = []
    for _ in range(3):
        m = _BRANCH_EMPLOYEES.search(s) or _BRANCH_UNIT.search(s) or _BRANCH_SEP.search(s)
        if m and m.start() > 0:
            stem = s[: m.start()].rstrip(" -–—,(")
            if stem and len(stem) >= 3:
                branch_parts.insert(0, m.group(1).strip())
                s = stem
                continue
        m = _ORG_KEYWORD_THEN_STATE.match(s)
        if m:
            branch_parts.insert(0, m.group(2).strip())
            s = m.group(1).strip()
            continue
        m = _PAREN_TAIL.search(s)
        if m and m.start() > 0 and re.fullmatch(rf"(?:the\s+)?(?:{STATE_WORDS})(?:\s+(?:{UNIT_WORDS}))?", m.group(1).strip(), re.I):
            branch_parts.insert(0, m.group(1).strip())
            s = s[: m.start()].strip()
            continue
        break
    return s, (" ".join(branch_parts) or None)


def looks_like_person(name: str) -> bool:
    """Two-to-four alphabetic words with no organisation word, 'Surname, Given',
    initials, or an honorific. Person-shaped names never take the rule tier."""
    s = (name or "").strip()
    if not s:
        return False
    if HONORIFIC_RX.match(s):
        return True
    if SURNAME_FIRST_RX.match(s) and not any(t in ORG_KEYWORDS for t in norm_exact(s).split()):
        return True
    if INITIALS_RX.match(s):
        return True
    toks = norm_exact(s).split()
    if not (2 <= len(toks) <= 4):
        return False
    if any(t in ORG_KEYWORDS for t in toks):
        return False
    if any(any(ch.isdigit() for ch in t) for t in toks):
        return False
    return True


def norm_rule(name: str) -> str:
    """Rule tier key: branch tail off, abbreviations expanded, stopwords and
    trailing legal-form/generic suffixes dropped. Persons get norm_exact."""
    if looks_like_person(name):
        return norm_exact(name)
    stem, _ = strip_branch(name)
    toks = norm_exact(stem).split()
    toks = [ABBREV.get(t, t) for t in toks]
    toks = [t for t in toks if t not in STOPWORDS]
    while len(toks) > 1 and toks[-1] in ORG_SUFFIX:
        toks.pop()
    while len(toks) > 1 and toks[0] == "the":
        toks.pop(0)
    return " ".join(toks) or norm_exact(name)


def guess_kind(name: str, donor_type: str | None = None) -> str:
    """Kind from the name; `donor_type` (state registers say individual/organisation) tips ties."""
    if PARTY_RX.search(name):
        return "party_unit"
    if GOVERNMENT_RX.search(name):
        return "government"
    if UNION_RX.search(name):
        return "union"
    if ASSOCIATION_RX.search(name):
        return "association"
    if COMPANY_RX.search(name):
        return "company"
    dt = (donor_type or "").lower()
    if looks_like_person(name):
        return "individual"
    if dt.startswith("individual"):
        return "individual"
    if dt.startswith("organisation") or dt.startswith("organization"):
        return "company"
    return "other"


_SMALL = {"and", "of", "the", "for", "in", "on", "at", "to", "by", "a", "an", "de", "la", "van", "von"}


def pretty(name: str) -> str:
    """Title-case ALL-CAPS filings for display; keep short acronyms and fix legal suffixes."""
    s = re.sub(r"\s+", " ", (name or "").strip())
    if s.isupper() and len(s) > 5:
        words = []
        for i, w in enumerate(s.split(" ")):
            core = re.sub(r"[^A-Za-z]", "", w)
            if core.lower() in _SMALL and i > 0:
                words.append(w.lower())
            elif len(core) <= 4 and core.isupper() and core.lower() not in {"pty", "ltd", "inc", "the", "and", "co", "of", "for", "bank", "club", "wine", "farm", "east", "west", "gold", "coal", "iron", "port", "city", "land", "life", "care", "home", "auto", "food", "fund", "law", "tax", "oil", "gas"}:
                words.append(w)  # acronym: CFMEU, AWU, NSW
            else:
                words.append(w[:1].upper() + w[1:].lower() if core else w)
        s = " ".join(words)
    s = re.sub(r"\bPTY\b", "Pty", s)
    s = re.sub(r"\bLTD\b", "Ltd", s)
    s = re.sub(r"\bLIMITED\b", "Limited", s)
    s = re.sub(r"\bPty\.?\s+Ltd\.?", "Pty Ltd", s)
    return s


def slug(s: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", norm_exact(s))).strip("-") or "x"


# ── source names ─────────────────────────────────────────────────────────────

class RawName:
    __slots__ = ("raw", "seen_in", "count", "total", "donor_type", "industry")

    def __init__(self, raw: str):
        self.raw = raw
        self.seen_in: set[str] = set()
        self.count = 0
        self.total = 0.0
        self.donor_type: str | None = None
        self.industry: str | None = None


def read_names_from_db(db_path: str) -> dict[str, RawName]:
    db = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    db.execute("PRAGMA busy_timeout = 600000")
    names: dict[str, RawName] = {}

    def take(table: str, rows):
        for raw, cnt, tot, dt, ind in rows:
            if raw is None or raw == "":
                continue
            n = names.get(raw)
            if n is None:
                n = names[raw] = RawName(raw)
            n.seen_in.add(table)
            n.count += cnt or 0
            n.total += float(tot or 0)
            if dt and not n.donor_type:
                n.donor_type = dt
            if ind and (not n.industry or n.industry in ("other", "unidentified")):
                n.industry = ind

    take("donations", db.execute(
        "SELECT donor_name, COUNT(*), SUM(amount), MAX(donor_type), MAX(industry) FROM donations GROUP BY donor_name"))
    take("ext_donations", db.execute(
        "SELECT donor_name, COUNT(*), SUM(amount), MAX(donor_type), MAX(industry) FROM ext_donations GROUP BY donor_name"))
    db.close()
    return names


def read_names_from_tsv(path: str) -> dict[str, RawName]:
    """Local dev: JSON lines ["fed"|"ext", donor_name, source, count, total, donor_type, industry]
    dumped from the two tables (see --from-tsv)."""
    names: dict[str, RawName] = {}
    for line in open(path, encoding="utf-8"):
        if not line.strip():
            continue
        kind, raw, src, cnt, tot, dt, ind = json.loads(line)[:7]
        if not raw:
            continue
        n = names.get(raw)
        if n is None:
            n = names[raw] = RawName(raw)
        n.seen_in.add("donations" if kind == "fed" else "ext_donations")
        n.count += int(cnt or 0)
        n.total += float(tot or 0)
        if dt and not n.donor_type:
            n.donor_type = dt
        if ind and (not n.industry or n.industry in ("other", "unidentified")):
            n.industry = ind
    return names


# ── curated file ─────────────────────────────────────────────────────────────

def load_curated(path: Path = CURATED_PATH) -> list[dict]:
    if not path.exists():
        return []
    data = json.load(open(path, encoding="utf-8"))
    ents = data["entities"] if isinstance(data, dict) else data
    seen_ids = set()
    for e in ents:
        e.setdefault("id", slug(e["canonical"]))
        e.setdefault("kind", "company")
        e.setdefault("aliases", [])
        e.setdefault("notes", None)
        e.setdefault("abn", None)
        if e["kind"] not in KINDS:
            raise SystemExit(f"donor_aliases.json: bad kind {e['kind']!r} for {e['canonical']!r}")
        if e["id"] in seen_ids:
            raise SystemExit(f"donor_aliases.json: duplicate id {e['id']!r}")
        seen_ids.add(e["id"])
        norm_aliases = []
        for a in e["aliases"]:
            if isinstance(a, str):
                norm_aliases.append({"name": a, "branch": None})
            else:
                norm_aliases.append({"name": a["name"], "branch": a.get("branch")})
        e["aliases"] = norm_aliases
    return ents


# ── resolution ───────────────────────────────────────────────────────────────

class Entity:
    __slots__ = ("entity_id", "canonical", "kind", "abn", "notes", "method", "members", "total", "curated")

    def __init__(self, entity_id, canonical, kind, method, curated=None):
        self.entity_id = entity_id
        self.canonical = canonical
        self.kind = kind
        self.abn = None
        self.notes = None
        self.method = method
        self.members: list[tuple[RawName, str | None, str]] = []  # (name, branch, method)
        self.total = 0.0
        self.curated = curated


def resolve(names: dict[str, RawName], curated: list[dict]) -> tuple[dict[str, Entity], dict]:
    """Assign every raw name to an entity. Returns ({entity_id: Entity}, stats)."""
    stats = defaultdict(int)
    by_exact: dict[str, str] = {}   # norm_exact(curated alias) -> entity id
    by_rule: dict[str, str] = {}    # norm_rule(curated alias)  -> entity id
    branch_of: dict[str, str | None] = {}
    entities: dict[str, Entity] = {}
    for c in curated:
        ent = Entity(c["id"], c["canonical"], c["kind"], "curated", curated=c)
        ent.abn = c.get("abn")
        ent.notes = c.get("notes")
        entities[ent.entity_id] = ent
        for a in [{"name": c["canonical"], "branch": None}] + c["aliases"]:
            ne = norm_exact(a["name"])
            if ne in by_exact and by_exact[ne] != ent.entity_id:
                raise SystemExit(f"donor_aliases.json: {a['name']!r} claimed by both {by_exact[ne]} and {ent.entity_id}")
            by_exact[ne] = ent.entity_id
            branch_of[ne] = a["branch"]
            if not looks_like_person(a["name"]):
                nr = norm_rule(a["name"])
                # first claim wins at the rule level; an exact claim elsewhere overrides it per name
                by_rule.setdefault(nr, ent.entity_id)

    groups: dict[str, list[RawName]] = defaultdict(list)
    assigned: dict[str, tuple[str, str | None]] = {}  # raw -> (entity_id, branch)
    for raw, n in names.items():
        ne = norm_exact(raw)
        if ne in by_exact:
            assigned[raw] = (by_exact[ne], branch_of.get(ne) or strip_branch(raw)[1])
            stats["curated_exact"] += 1
            continue
        if not looks_like_person(raw):
            nr = norm_rule(raw)
            if nr in by_rule:
                assigned[raw] = (by_rule[nr], strip_branch(raw)[1])
                stats["curated_rule"] += 1
                continue
        groups[norm_rule(raw)].append(n)

    # Automatic entities: one per rule key; canonical = highest-dollar spelling.
    for key, members in groups.items():
        members.sort(key=lambda m: (-m.total, -m.count, m.raw))
        head = members[0]
        eid = slug(key)
        if eid in entities:  # a curated id happens to equal this key: fold the group into it
            ent = entities[eid]
        else:
            person = looks_like_person(head.raw)
            kind = guess_kind(head.raw, head.donor_type)
            if person and kind in ("company", "other"):
                kind = "individual"
            ent = entities[eid] = Entity(eid, pretty(head.raw), kind, "exact")
        head_exact = norm_exact(strip_branch(ent.canonical)[0])
        for m in members:
            stem, branch = strip_branch(m.raw)
            method = "exact" if norm_exact(m.raw) == norm_exact(ent.canonical) else "rule"
            if method == "rule":
                ent.method = "rule"
            ent.members.append((m, branch, method))
            ent.total += m.total

    for raw, (eid, branch) in assigned.items():
        n = names[raw]
        ent = entities[eid]
        method = "exact" if norm_exact(raw) == norm_exact(ent.canonical) else "curated"
        ent.members.append((n, branch, method))
        ent.total += n.total

    # Drop curated entities that matched nothing (typo in the file) but report them.
    for eid in [e for e, ent in entities.items() if not ent.members]:
        stats["curated_unmatched"] += 1
        log(f"  curated entity matched no donor string: {eid} ({entities[eid].canonical})")
        del entities[eid]
    for ent in entities.values():
        for _, _, method in ent.members:
            stats[f"alias_{method}"] += 1
    stats["entities"] = len(entities)
    stats["entities_curated"] = sum(1 for e in entities.values() if e.curated)
    stats["names"] = len(names)
    return entities, dict(stats)


# ── ABN attachment ───────────────────────────────────────────────────────────

def attach_abns(entities: dict[str, Entity], abr_path: str) -> dict:
    """parli.ingest.abr_match output: {entity_id: {abn, name, status, entity_type, method}}."""
    data = json.load(open(abr_path, encoding="utf-8"))
    matches = data.get("matches", data)
    n = 0
    for eid, m in matches.items():
        ent = entities.get(eid)
        if not ent or not m or not m.get("abn"):
            continue
        if ent.abn and ent.abn != m["abn"]:
            continue  # the curated file wins
        ent.abn = m["abn"]
        ent.abn_info = m  # type: ignore[attr-defined]
        n += 1
    return {"abn_attached": n, "abn_source": data.get("meta", {}).get("source")}


# ── write ────────────────────────────────────────────────────────────────────

ENTITIES_DDL = """
CREATE TABLE IF NOT EXISTS ext_donor_entities (
    entity_id TEXT PRIMARY KEY,
    canonical_name TEXT NOT NULL,
    kind TEXT NOT NULL,
    abn TEXT,
    abn_name TEXT,
    abn_status TEXT,
    abn_entity_type TEXT,
    abn_method TEXT,
    method TEXT NOT NULL,
    alias_count INTEGER NOT NULL,
    total_amount REAL,
    notes TEXT,
    source TEXT NOT NULL,
    source_url TEXT,
    ingested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_ext_donor_entities_kind ON ext_donor_entities(kind);
CREATE INDEX IF NOT EXISTS ix_ext_donor_entities_abn ON ext_donor_entities(abn);
"""

ALIASES_DDL = """
CREATE TABLE IF NOT EXISTS ext_donor_aliases (
    alias_raw TEXT NOT NULL,
    alias_norm TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    branch TEXT,
    seen_in TEXT NOT NULL,
    confidence REAL NOT NULL,
    method TEXT NOT NULL,
    source TEXT NOT NULL,
    source_url TEXT,
    ingested_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ext_donor_aliases_raw ON ext_donor_aliases(alias_raw);
CREATE INDEX IF NOT EXISTS ix_ext_donor_aliases_entity ON ext_donor_aliases(entity_id);
CREATE INDEX IF NOT EXISTS ix_ext_donor_aliases_norm ON ext_donor_aliases(alias_norm);
"""

CONFIDENCE = {"exact": 1.0, "rule": 0.9, "curated": 1.0}


def rows_for(entities: dict[str, Entity]):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    ent_rows, alias_rows = [], []
    for ent in entities.values():
        info = getattr(ent, "abn_info", None) or {}
        ent_rows.append([
            ent.entity_id, ent.canonical, ent.kind, ent.abn,
            info.get("name"), info.get("status"), info.get("entity_type"),
            info.get("method") or ("curated" if ent.abn else None),
            ent.method, len(ent.members), round(ent.total, 2), ent.notes,
            SOURCE, SOURCE_URL, now,
        ])
        for n, branch, method in ent.members:
            alias_rows.append([
                n.raw, norm_exact(n.raw), ent.entity_id, branch, ",".join(sorted(n.seen_in)),
                CONFIDENCE[method], method, SOURCE, SOURCE_URL, now,
            ])
    return ent_rows, alias_rows


ENTITY_COLS = ["entity_id", "canonical_name", "kind", "abn", "abn_name", "abn_status", "abn_entity_type",
               "abn_method", "method", "alias_count", "total_amount", "notes", "source", "source_url", "ingested_at"]
ALIAS_COLS = ["alias_raw", "alias_norm", "entity_id", "branch", "seen_in", "confidence", "method",
              "source", "source_url", "ingested_at"]


def write_with_retry(writer: ExtWriter, table, ddl, cols, rows, notes, attempts=8):
    for i in range(attempts):
        try:
            return writer.replace(table, ddl, cols, rows, source=SOURCE, notes=notes)
        except sqlite3.OperationalError as e:
            if "locked" not in str(e).lower() and "busy" not in str(e).lower():
                raise
            wait = 15 * (i + 1)
            log(f"  {table}: database is locked, retrying in {wait}s ({i + 1}/{attempts})")
            time.sleep(wait)
    raise RuntimeError(f"{table}: database stayed locked")


# ── report ───────────────────────────────────────────────────────────────────

def report(entities: dict[str, Entity], stats: dict, site_names: list[str] | None = None) -> None:
    log(f"distinct donor strings: {stats['names']:,}")
    log(f"entities: {stats['entities']:,} (curated {stats['entities_curated']:,})")
    log("aliases by method: " + ", ".join(f"{k[6:]}={v:,}" for k, v in sorted(stats.items()) if k.startswith("alias_")))
    log(f"curated hits: exact {stats.get('curated_exact', 0):,}, rule {stats.get('curated_rule', 0):,}; "
        f"unmatched curated entities {stats.get('curated_unmatched', 0)}")
    kinds = defaultdict(int)
    for e in entities.values():
        kinds[e.kind] += 1
    log("entities by kind: " + ", ".join(f"{k}={v:,}" for k, v in sorted(kinds.items(), key=lambda kv: -kv[1])))
    merged = [e for e in entities.values() if len(e.members) > 1]
    log(f"entities with more than one spelling: {len(merged):,}; with an ABN: {sum(1 for e in entities.values() if e.abn):,}")
    if site_names:
        # Site labels are prettified export spellings, so match on norm_exact.
        by_exact = {norm_exact(m.raw): e for e in entities.values() for m, _, _ in e.members}
        missing = [s for s in site_names if norm_exact(s) not in by_exact]
        uncurated = sorted({by_exact[norm_exact(s)].canonical for s in site_names
                            if norm_exact(s) in by_exact and not by_exact[norm_exact(s)].curated})
        log(f"site donors: {len(site_names)}; not found as a raw string: {len(missing)}; "
            f"resolved to an UNCURATED entity: {len(uncurated)}")
        for c in uncurated[:400]:
            log("   uncurated:", c)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--db", default=None, help="parli.db path (read names from it and write the ext_ tables to it)")
    ap.add_argument("--read-db", default=None, help="read names from this parli.db but do not write (with --report)")
    ap.add_argument("--from-tsv", default=None, help="local dev: read names from a TSV dump instead of the DB")
    ap.add_argument("--abr", default=None, help="parli.ingest.abr_match output JSON to attach ABNs")
    ap.add_argument("--report", action="store_true", help="print tier counts; with no --db, write nothing")
    ap.add_argument("--site-names", default=None, help="JSON list of donor labels shown on the site (coverage check)")
    ap.add_argument("--dump", default=None, help="write the resolved entities as JSON here (review aid)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if args.from_tsv:
        names = read_names_from_tsv(args.from_tsv)
    else:
        names = read_names_from_db(args.db or args.read_db or DEFAULT_DB)
    curated = load_curated()
    log(f"curated entities in {CURATED_PATH.name}: {len(curated)}")
    entities, stats = resolve(names, curated)
    if args.abr:
        stats.update(attach_abns(entities, args.abr))
    site = json.load(open(args.site_names)) if args.site_names else None
    report(entities, stats, site)

    if args.dump:
        out = []
        for e in sorted(entities.values(), key=lambda e: -e.total):
            out.append({"id": e.entity_id, "canonical": e.canonical, "kind": e.kind, "abn": e.abn, "method": e.method,
                        "curated": bool(e.curated), "total": round(e.total), "notes": e.notes,
                        "aliases": [{"raw": m.raw, "branch": b, "method": meth, "total": round(m.total), "seen_in": sorted(m.seen_in)}
                                    for m, b, meth in sorted(e.members, key=lambda t: -t[0].total)]})
        json.dump(out, open(args.dump, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        log(f"wrote {args.dump}")

    if not args.db or args.dry_run:
        return
    ent_rows, alias_rows = rows_for(entities)
    writer = ExtWriter(db_path=args.db, dry_run=args.dry_run)
    log(f"writing to {writer.describe()}")
    notes = json.dumps({k: v for k, v in stats.items() if isinstance(v, (int, str))})
    write_with_retry(writer, "ext_donor_entities", ENTITIES_DDL, ENTITY_COLS, ent_rows, notes)
    write_with_retry(writer, "ext_donor_aliases", ALIASES_DDL, ALIAS_COLS, alias_rows, notes)


if __name__ == "__main__":
    main()
