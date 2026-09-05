"""
parli.ingest.grant_recipients -- one entity per grant recipient, tied to the donor register.

Grants name their recipients the way the agency typed them ("THE TWYFORD HALL
COMPLEX LIMITED", "Twyford Hall Complex Ltd", "Anglicare"), so before any
"who gets the money" table can be honest the names have to become entities and
the entities have to be looked up against the donors. This module reads every
recipient in

    ext_grants          Commonwealth awards (GrantConnect, parli.ingest.grantconnect)
    ext_grant_details   the awards whose detail page has been fetched: the ABN
                        the agency recorded (scripts/grantconnect_details.py)
    government_grants   Queensland Government Investment Portal expenditure
                        (parli.ingest.grants --qld; every row carries an ABN)

and writes two additive tables:

    ext_grant_recipients      one row per recipient entity: canonical name, kind,
                              ABN (+ ABR legal name / status / entity type when
                              known), the donor-register entity it resolves to
                              (ext_donor_entities.entity_id) with the method and a
                              confidence, and per-jurisdiction totals
    ext_grant_recipient_keys  (source, key_type, key_value) -> recipient_id, so an
                              export can join a grant row by its ABN when the row
                              has one, else by its raw recipient string, without
                              re-implementing any normaliser

How a recipient gets an ABN, in order:
  source        the grant row carried it (all QLD rows; federal rows whose detail
                page was fetched)
  abr_*         parli.ingest.abr_match.match_entity against the ABN Bulk Extract
                index (CC BY 3.0 AU): unique main-name match on the exact key, then
                on the legal-suffix-stripped key, then a unique business / trading
                name whose owner shares the first significant word. Ambiguous names
                (several active ABNs with that main name) get no ABN.
Individuals never get an ABN: sole traders are not in the index and a person's
ABN is not something the site should attach.

How a recipient is tied to a donor, in order (organisations only; people are
never matched by name -- a "John Smith" who received an arts grant is not
evidence about a "John Smith" who gave to a party):
  abn           the recipient's ABN is a donor entity's ABN            (1.0)
  name_exact    norm_exact of a recipient spelling equals a donor alias  (0.95)
  name_rule     norm_rule (legal suffix / branch off) equals a donor alias (0.85);
                only spellings with two or more significant words, and only when
                exactly one donor entity owns that key
  abr_name      one of the ABN's registered names (main, business, trading)
                keys to exactly one donor entity                        (0.8)
Government bodies and party units on the donor side are never linked.

Runs on the box that holds parli.db and the ABR index (the package is synced
there; nothing here needs more than the stdlib):

    rsync -a --exclude __pycache__ parli/ desktop:~/opax-sync/parli/
    ssh desktop 'cd ~/opax-sync && PYTHONPATH=. python3 -m parli.ingest.grant_recipients \
        --db ~/.cache/autoresearch/parli.db --abr-dir ~/.cache/autoresearch/abr'
    ... --report      # counts only, no writes
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from parli.ingest.abr_match import INDEX_NAME, Index, match_entity
from parli.ingest.donor_entities import (
    STOPWORDS, guess_kind, looks_like_person, norm_exact, norm_person, norm_rule, pretty, pretty_person,
)
from parli.ingest.ext_common import ExtWriter, log

SOURCE = "grant_recipients"
DEFAULT_DB = "/home/jake/.cache/autoresearch/parli.db"
DEFAULT_ABR = "~/.cache/autoresearch/abr"

DDL = """
CREATE TABLE IF NOT EXISTS ext_grant_recipients (
    recipient_id TEXT PRIMARY KEY,
    canonical_name TEXT NOT NULL,
    kind TEXT NOT NULL,
    abn TEXT,
    abn_method TEXT,
    abr_name TEXT,
    abr_status TEXT,
    abr_etype TEXT,
    abr_state TEXT,
    abr_postcode TEXT,
    donor_entity_id TEXT,
    donor_method TEXT,
    donor_confidence REAL,
    donor_matched_on TEXT,
    federal_total REAL,
    federal_count INTEGER,
    qld_total REAL,
    qld_count INTEGER,
    first_year TEXT,
    last_year TEXT,
    alias_count INTEGER,
    aliases TEXT,
    source TEXT NOT NULL,
    ingested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ext_gr_abn ON ext_grant_recipients(abn);
CREATE INDEX IF NOT EXISTS idx_ext_gr_donor ON ext_grant_recipients(donor_entity_id);
CREATE INDEX IF NOT EXISTS idx_ext_gr_kind ON ext_grant_recipients(kind);
"""
COLS = ("recipient_id", "canonical_name", "kind", "abn", "abn_method", "abr_name", "abr_status",
        "abr_etype", "abr_state", "abr_postcode", "donor_entity_id", "donor_method",
        "donor_confidence", "donor_matched_on", "federal_total", "federal_count", "qld_total",
        "qld_count", "first_year", "last_year", "alias_count", "aliases", "source", "ingested_at")

KEYS_DDL = """
CREATE TABLE IF NOT EXISTS ext_grant_recipient_keys (
    source TEXT NOT NULL,
    key_type TEXT NOT NULL,
    key_value TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    rows INTEGER,
    total REAL,
    ingested_at TEXT NOT NULL,
    PRIMARY KEY (source, key_type, key_value)
);
CREATE INDEX IF NOT EXISTS idx_ext_grk_rid ON ext_grant_recipient_keys(recipient_id);
"""
KEY_COLS = ("source", "key_type", "key_value", "recipient_id", "rows", "total", "ingested_at")

# Placeholder recipients: kept as one undisclosed bucket per source so totals
# still reconcile, never matched, never ranked.
PLACEHOLDER_RX = re.compile(
    r"^(n/?a|na|none|nil|multiple|multiple recipients|various|various recipients|confidential|"
    r"withheld|not applicable|not disclosed|not yet assigned|undisclosed|tbc|tba|-+|\.+|0)$", re.I)

# ABR entity-type codes -> the site's recipient kinds. The code list is the
# ABR's "EntityTypeInd"; families share a prefix (CG* Commonwealth government,
# SG* state, TG* territory, LG* local).
ETYPE_KIND = {
    "PRV": "company", "PUB": "company", "COP": "co-operative", "LPT": "partnership",
    "FPT": "partnership", "PTR": "partnership",
    "OIE": "association", "UIE": "association",
    "DIT": "trust", "DTT": "trust", "FUT": "trust", "TRT": "trust", "FXT": "trust", "HYT": "trust",
    "DST": "trust", "PQT": "trust", "PUT": "trust", "CTT": "trust", "CUT": "trust", "FHT": "trust",
    "SMF": "super fund", "SAF": "super fund", "ARF": "super fund", "NRF": "super fund", "PST": "super fund",
    "CSS": "super fund", "CSP": "super fund", "IND": "individual", "DES": "other",
}

UNIVERSITY_RX = re.compile(r"\buniversit(y|ies)\b|\btafe\b|\binstitute of technology\b", re.I)
COUNCIL_RX = re.compile(r"\b(city|shire|regional|rural|town|municipal|district|aboriginal shire)\s+council\b|"
                        r"\bcouncil of the (city|shire)\b|\bcity of\b|\bshire of\b|\bmunicipality\b", re.I)
HEALTH_RX = re.compile(r"\bhospital\b|\bhealth (service|district|network)\b|\blocal health\b|\bhospital and health service\b", re.I)


def kind_of(name: str, abr_etype: str | None, qld_type: str | None) -> str:
    if abr_etype:
        code = abr_etype.upper()
        if code[:2] == "LG":
            return "council"
        if code[:2] in ("CG", "SG", "TG"):
            if UNIVERSITY_RX.search(name):
                return "university"
            if HEALTH_RX.search(name):
                return "health service"
            return "government"
        k = ETYPE_KIND.get(code)
        if k:
            if k in ("association", "company", "other") and UNIVERSITY_RX.search(name):
                return "university"
            if k in ("association", "company", "other") and COUNCIL_RX.search(name):
                return "council"
            return k
    if looks_like_person(name):
        return "individual"
    if COUNCIL_RX.search(name):
        return "council"
    if UNIVERSITY_RX.search(name):
        return "university"
    if HEALTH_RX.search(name):
        return "health service"
    g = guess_kind(name)
    if g in ("company", "association", "union", "government"):
        return g
    q = (qld_type or "").lower()
    if q == "local_government":
        return "council"
    if q == "nfp":
        return "association"
    if q == "business":
        return "company"
    if q == "individual":
        return "individual"
    if q == "government":
        return "government"
    if re.search(r"\b(ltd|limited|pty)\b", name, re.I):
        return "company"
    if re.search(r"\b(inc|incorporated|association|society|club|foundation|trust)\b", name, re.I):
        return "association"
    return "other"


def is_placeholder(name: str | None) -> bool:
    s = (name or "").strip()
    return not s or bool(PLACEHOLDER_RX.match(s)) or len(norm_exact(s)) < 3


def _shouting(word: str) -> bool:
    core = re.sub(r"[^A-Za-z]", "", word)
    return len(core) > 4 and core.isupper()


def display_name(spellings: Counter, abr_name: str | None) -> str:
    """The commonest spelling of the commonest form, preferring a variant that is
    not shouting ("University of NEW South Wales" loses to "University of New
    South Wales"); ALL-CAPS filings are title-cased. The ABR legal name is used
    only when it is the same name spelled out, so "Anglicare" never becomes
    "ANGLICAN COMMUNITY SERVICES"."""
    top = spellings.most_common(1)[0][0]
    key = norm_exact(top)
    variants = [(sp, n) for sp, n in spellings.items() if norm_exact(sp) == key]

    def score(item):
        sp, n = item
        shout = sum(1 for w in sp.split() if _shouting(w))
        return (0 if sp.isupper() else 1, -shout, n)

    variants.sort(key=score, reverse=True)
    best = variants[0][0] if variants else top
    clean = not best.isupper() and not any(_shouting(w) for w in best.split())
    if abr_name and norm_rule(abr_name) == norm_rule(best):
        if clean:
            return best
        return pretty(abr_name) if abr_name.isupper() else abr_name
    if looks_like_person(best):
        return pretty_person(best)
    return best if clean else pretty(best.upper())


def significant(key: str) -> list[str]:
    return [t for t in key.split() if t not in STOPWORDS]


# ── donor index ──────────────────────────────────────────────────────────────

class DonorIndex:
    """ext_donor_entities / ext_donor_aliases as lookup maps."""

    def __init__(self, db: sqlite3.Connection):
        self.by_abn: dict[str, list[tuple[str, float]]] = defaultdict(list)
        self.kind: dict[str, str] = {}
        self.name: dict[str, str] = {}
        for eid, name, kind, abn, total in db.execute(
                "SELECT entity_id, canonical_name, kind, abn, COALESCE(total_amount, 0) FROM ext_donor_entities"):
            self.kind[eid] = kind
            self.name[eid] = name
            if abn:
                self.by_abn[re.sub(r"\D", "", abn)].append((eid, total))
        self.exact: dict[str, set[str]] = defaultdict(set)
        self.rule: dict[str, set[str]] = defaultdict(set)
        for raw, eid in db.execute("SELECT alias_raw, entity_id FROM ext_donor_aliases"):
            if eid not in self.kind or self.kind[eid] in ("individual", "government", "party_unit"):
                continue
            if looks_like_person(raw):
                continue
            self.exact[norm_exact(raw)].add(eid)
            rk = norm_rule(raw)
            if len(significant(rk)) >= 2:
                self.rule[rk].add(eid)
        for eid, name in self.name.items():
            if self.kind[eid] in ("individual", "government", "party_unit") or looks_like_person(name):
                continue
            self.exact[norm_exact(name)].add(eid)
            rk = norm_rule(name)
            if len(significant(rk)) >= 2:
                self.rule[rk].add(eid)

    def linkable(self, eid: str) -> bool:
        return self.kind.get(eid) not in (None, "government", "party_unit")

    def by_abn_unique(self, abn: str | None):
        if not abn:
            return None
        cands = [(e, t) for e, t in self.by_abn.get(abn, []) if self.linkable(e)]
        if not cands:
            return None
        cands.sort(key=lambda x: -x[1])
        return cands[0][0]

    def by_name(self, spellings: list[str]):
        """(entity_id, method, matched spelling) or None; exact tier first."""
        for sp in spellings:
            if looks_like_person(sp):
                continue
            ids = {e for e in self.exact.get(norm_exact(sp), ()) if self.linkable(e)}
            if len(ids) == 1:
                return next(iter(ids)), "name_exact", sp
        for sp in spellings:
            if looks_like_person(sp):
                continue
            rk = norm_rule(sp)
            if len(significant(rk)) < 2:
                continue
            ids = {e for e in self.rule.get(rk, ()) if self.linkable(e)}
            if len(ids) == 1:
                return next(iter(ids)), "name_rule", sp
        return None


# ── recipients ───────────────────────────────────────────────────────────────

class Rec:
    __slots__ = ("rid", "spellings", "abn", "abn_method", "abr", "qld_types", "fed_total", "fed_count",
                 "qld_total", "qld_count", "years", "keys", "donor", "kind")

    def __init__(self, rid):
        self.rid = rid
        self.spellings: Counter = Counter()
        self.abn = None
        self.abn_method = None
        self.abr = None
        self.qld_types: Counter = Counter()
        self.fed_total = 0.0
        self.fed_count = 0
        self.qld_total = 0.0
        self.qld_count = 0
        self.years: set = set()
        self.keys: list = []
        self.donor = None
        self.kind = "other"


def read_federal(db) -> tuple[list, dict]:
    """(rows grouped by raw name, {raw name: Counter(abn)}) from ext_grants (+details)."""
    names = db.execute("""
        SELECT recipient_name, COUNT(*), COALESCE(SUM(value), 0), MIN(financial_year), MAX(financial_year)
        FROM ext_grants GROUP BY recipient_name""").fetchall()
    abns: dict[str, Counter] = defaultdict(Counter)
    have_details = db.execute("SELECT name FROM sqlite_master WHERE name = 'ext_grant_details'").fetchone()
    if have_details:
        for name, abn, n in db.execute("""
                SELECT g.recipient_name, d.recipient_abn, COUNT(*)
                FROM ext_grant_details d JOIN ext_grants g ON g.ga_id = d.ga_id
                WHERE d.recipient_abn IS NOT NULL GROUP BY 1, 2"""):
            abns[name][abn] += n
    return names, abns


def read_federal_abn_rows(db) -> list:
    """Per (ABN, raw name): rows whose detail page carried the ABN -- these key by ABN."""
    if not db.execute("SELECT name FROM sqlite_master WHERE name = 'ext_grant_details'").fetchone():
        return []
    return db.execute("""
        SELECT d.recipient_abn, g.recipient_name, COUNT(*), COALESCE(SUM(g.value), 0),
               MIN(g.financial_year), MAX(g.financial_year)
        FROM ext_grant_details d JOIN ext_grants g ON g.ga_id = d.ga_id
        WHERE d.recipient_abn IS NOT NULL GROUP BY 1, 2""").fetchall()


def read_qld(db) -> list:
    return db.execute("""
        SELECT recipient_abn, recipient, recipient_type, COUNT(*), COALESCE(SUM(amount), 0),
               MIN(financial_year), MAX(financial_year)
        FROM government_grants WHERE source = 'qld_expenditure' GROUP BY 1, 2, 3""").fetchall()


def build(db_path: str, abr_dir: Path, report_only: bool) -> tuple[list, list, dict]:
    t0 = time.time()
    db = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    db.execute("PRAGMA busy_timeout = 600000")
    idx = Index(abr_dir / INDEX_NAME)
    donors = DonorIndex(db)
    log(f"  donor index: {len(donors.kind):,} entities, {len(donors.exact):,} exact keys, "
        f"{len(donors.rule):,} rule keys, {len(donors.by_abn):,} ABNs ({time.time() - t0:.0f}s)")

    recs: dict[str, Rec] = {}
    stats: Counter = Counter()

    def rec_for(rid: str) -> Rec:
        r = recs.get(rid)
        if r is None:
            r = recs[rid] = Rec(rid)
        return r

    def add_rows(r: Rec, source: str, raw: str, n: int, total: float, fy0, fy1, key_type: str, key_value: str):
        r.spellings[raw] += n
        if source == "grantconnect":
            r.fed_total += total
            r.fed_count += n
        else:
            r.qld_total += total
            r.qld_count += n
        for fy in (fy0, fy1):
            if fy:
                r.years.add(fy)
        r.keys.append((source, key_type, key_value, n, total))

    # -- QLD: every row carries an ABN ('0' means several recipients) ----------
    for abn, raw, qtype, n, total, fy0, fy1 in read_qld(db):
        abn = re.sub(r"\D", "", abn or "")
        raw = (raw or "").strip()
        # A real ABN identifies the recipient whatever the name column says;
        # only the rows with no ABN ('0' is the portal's "several recipients")
        # go to the undisclosed bucket, keyed by their name string.
        if abn in ("", "0") or len(abn) != 11:
            r = rec_for("undisclosed:qld")
            add_rows(r, "qld_expenditure", raw or "Multiple", n, total, fy0, fy1, "name", raw or "Multiple")
            r.qld_types[qtype or ""] += n
            stats["qld_placeholder_rows"] += n
            continue
        r = rec_for(f"abn:{abn}")
        if not r.abn:
            r.abn, r.abn_method = abn, "source"
        r.qld_types[qtype or ""] += n
        add_rows(r, "qld_expenditure", raw, n, total, fy0, fy1, "abn", abn)
        stats["qld_rows"] += n

    # -- federal rows whose detail page carried an ABN --------------------------
    for abn, raw, n, total, fy0, fy1 in read_federal_abn_rows(db):
        raw = (raw or "").strip()
        r = rec_for(f"abn:{abn}")
        if not r.abn:
            r.abn, r.abn_method = abn, "source"
        add_rows(r, "grantconnect", raw, n, total, fy0, fy1, "abn", abn)
        stats["federal_abn_rows"] += n

    # -- federal rows keyed by name ---------------------------------------------
    names, name_abns = read_federal(db)
    abn_rows_by_name: dict[str, int] = defaultdict(int)
    for abn, raw, n, *_ in read_federal_abn_rows(db):
        abn_rows_by_name[(raw or "").strip()] += n
    matched = 0
    for raw, n, total, fy0, fy1 in names:
        raw = (raw or "").strip()
        n_named = n - abn_rows_by_name.get(raw, 0)   # the rows without a detail ABN
        if n_named <= 0:
            continue
        # the totals here approximate the named share by count (the export sums the real rows)
        share = n_named / n if n else 0
        t_named = total * share
        if is_placeholder(raw):
            r = rec_for("undisclosed:federal")
            add_rows(r, "grantconnect", raw or "n/a", n_named, t_named, fy0, fy1, "name", raw)
            stats["federal_placeholder_rows"] += n_named
            continue
        if looks_like_person(raw):
            r = rec_for(f"person:{norm_person(raw)}")
            add_rows(r, "grantconnect", raw, n_named, t_named, fy0, fy1, "name", raw)
            stats["federal_person_rows"] += n_named
            continue
        # 1. this exact name's detail pages agree on one ABN
        abn = None
        method = None
        c = name_abns.get(raw)
        if c:
            top, top_n = c.most_common(1)[0]
            if top_n / sum(c.values()) >= 0.8:
                abn, method = top, "source_same_name"
        # 2. the ABR index
        if not abn:
            m = match_entity(idx, raw, [])
            if m and m.get("abn"):
                abn, method = m["abn"], "abr_" + m["method"]
                matched += 1
                r = rec_for(f"abn:{abn}")
                if not r.abr:
                    r.abr = m
            elif m:
                stats["federal_abr_ambiguous"] += 1
        if abn:
            r = rec_for(f"abn:{abn}")
            if not r.abn:
                r.abn, r.abn_method = abn, method
            add_rows(r, "grantconnect", raw, n_named, t_named, fy0, fy1, "name", raw)
            stats["federal_named_rows_with_abn"] += n_named
        else:
            r = rec_for(f"name:{norm_rule(raw)}")
            add_rows(r, "grantconnect", raw, n_named, t_named, fy0, fy1, "name", raw)
            stats["federal_named_rows_no_abn"] += n_named
    log(f"  {len(recs):,} recipients; ABR matched {matched:,} federal names ({time.time() - t0:.0f}s)")

    # -- ABR record for ABNs that came from the source (legal name, type, status)
    for r in recs.values():
        if r.abn and not r.abr:
            row = idx.db.execute("SELECT * FROM names WHERE abn = ? AND ntype = 'MN' LIMIT 1", (r.abn,)).fetchone()
            if row:
                r.abr = {"abn": r.abn, "name": row["name"], "status": row["status"], "entity_type": row["etype"],
                         "state": row["state"], "postcode": row["postcode"], "method": "abn_lookup"}

    # -- kinds --------------------------------------------------------------------
    for rid, r in recs.items():
        if rid.startswith("undisclosed:"):
            r.kind = "undisclosed"
        elif rid.startswith("person:"):
            r.kind = "individual"
        else:
            top = r.spellings.most_common(1)[0][0]
            qtype = r.qld_types.most_common(1)[0][0] if r.qld_types else None
            r.kind = kind_of(top, (r.abr or {}).get("entity_type"), qtype)
        stats["kind:" + r.kind] += 1

    # -- donor links ----------------------------------------------------------
    for rid, r in recs.items():
        if r.kind in ("individual", "undisclosed", "government"):
            continue
        eid = donors.by_abn_unique(r.abn)
        if eid:
            r.donor = (eid, "abn", 1.0, r.abn)
        else:
            spellings = [s for s, _ in r.spellings.most_common()]
            if r.abr and r.abr.get("name"):
                spellings.append(r.abr["name"])
            hit = donors.by_name(spellings)
            if hit:
                eid, method, on = hit
                r.donor = (eid, method, 0.95 if method == "name_exact" else 0.85, on)
            elif r.abn:
                # every registered name of the ABN (business / trading names too)
                regs = [row["name"] for row in idx.db.execute(
                    "SELECT DISTINCT name FROM names WHERE abn = ? AND ntype IN ('MN','BN','TRD','OTN')", (r.abn,))]
                hit = donors.by_name([x for x in regs if x not in spellings])
                if hit:
                    eid, method, on = hit
                    r.donor = (eid, "abr_name", 0.8, on)
        if r.donor:
            stats["donor:" + r.donor[1]] += 1
    stats["donor_linked"] = sum(1 for r in recs.values() if r.donor)
    stats["donor_linked_federal_dollars"] = round(sum(r.fed_total for r in recs.values() if r.donor))
    stats["donor_linked_qld_dollars"] = round(sum(r.qld_total for r in recs.values() if r.donor))
    stats["with_abn"] = sum(1 for r in recs.values() if r.abn)
    stats["recipients"] = len(recs)
    log(f"  donor-linked: {stats['donor_linked']:,} recipients "
        f"(${stats['donor_linked_federal_dollars']/1e9:.2f}B federal, ${stats['donor_linked_qld_dollars']/1e9:.2f}B QLD) "
        f"({time.time() - t0:.0f}s)")

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = []
    key_map: dict[tuple, list] = {}    # (source, key_type, key_value) -> [rid, rows, total]
    for rid, r in recs.items():
        abr = r.abr or {}
        years = sorted(y for y in r.years if y)
        name = ("Not disclosed (multiple or withheld recipients)" if r.kind == "undisclosed"
                else display_name(r.spellings, abr.get("name")))
        aliases = [s for s, _ in r.spellings.most_common(12) if s != name]
        rows.append([
            rid, name, r.kind, r.abn, r.abn_method, abr.get("name"), abr.get("status"),
            abr.get("entity_type"), abr.get("state"), abr.get("postcode"),
            r.donor[0] if r.donor else None, r.donor[1] if r.donor else None,
            r.donor[2] if r.donor else None, r.donor[3] if r.donor else None,
            round(r.fed_total, 2), r.fed_count, round(r.qld_total, 2), r.qld_count,
            years[0] if years else None, years[-1] if years else None,
            len(r.spellings), json.dumps(aliases, ensure_ascii=False), SOURCE, stamp,
        ])
        for source, kt, kv, n, total in r.keys:
            k = (source, kt, kv)
            cur = key_map.get(k)
            if cur is None:
                key_map[k] = [rid, n, total]
            elif cur[0] == rid:
                cur[1] += n
                cur[2] += total
            else:
                # one key string pointing at two recipients: keep the one it
                # sent more rows to, and count the clash
                stats["key_clash"] += 1
                if n > cur[1]:
                    key_map[k] = [rid, n, total]
    key_rows = [[source, kt, kv, rid, n, round(total, 2), stamp]
                for (source, kt, kv), (rid, n, total) in key_map.items()]
    db.close()
    return rows, key_rows, dict(stats)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--abr-dir", default=DEFAULT_ABR)
    ap.add_argument("--report", action="store_true", help="build and print counts; write nothing")
    args = ap.parse_args()
    abr_dir = Path(args.abr_dir).expanduser()
    log(f"grant recipients from {args.db} + {abr_dir / INDEX_NAME}")
    rows, key_rows, stats = build(args.db, abr_dir, args.report)
    log("  " + json.dumps(stats, sort_keys=True))
    if args.report:
        return
    writer = ExtWriter(db_path=args.db)
    notes = json.dumps(stats, sort_keys=True)
    writer.replace("ext_grant_recipients", DDL, COLS, rows, SOURCE, notes=notes)
    writer.replace("ext_grant_recipient_keys", KEYS_DDL, KEY_COLS, key_rows, SOURCE,
                   delete_where="1 = 1", delete_params=[], notes=notes)


if __name__ == "__main__":
    main()
