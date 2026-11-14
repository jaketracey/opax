#!/usr/bin/env python3
"""
Project the bill registry into the static files the portal serves:
`portal/public/bills/index.json` and one `portal/public/bills/<key>.json` per
bill. Shapes are fixed by docs/BILLS-CONTRACT.md; docs/BILLS-EXPOSURE.md
explains every field and how to rerun this.

The database lives on the data box (24 GB), so the projection runs there and
the files come back:

    scp scripts/export_bills.py desktop:/tmp/
    ssh desktop 'python3 /tmp/export_bills.py --legacy --out /tmp/bills'
    rsync -a desktop:/tmp/bills/ portal/public/bills/

Two registry modes, one code path:

  default    `bills_v2` + `bill_events` + `bill_sources` + `bill_summaries`
             + `bill_links` -- the tables the registry and summaries agents
             build. Divisions, speeches and Acts come from `bill_links`.
  --legacy   the existing `bills` + `bill_progress` (ALRC) tables, keyed
             `au-federal-alrc-<bill_id>`, with divisions, speeches and Acts
             joined by the title rule audited in docs/SCOPE-BILLS.md section 4.
             Nothing here writes to the database.

Speech briefs are a second phase, because the box credentials are not on the
data box and the projection does not need them:

    python3 scripts/export_bills.py --fill-briefs portal/public/bills

reads every bill file, fetches the knowledge box's `da-summary-t-body` field
for each speech slug (cached in --brief-cache so a rerun costs nothing) and
writes the briefs back into the files. A speech with no brief yet is cached as
null and asked about again on later runs (bounded; see BRIEF_RECHECK_* below),
because the enrichment Worker writes briefs onto recent speeches after the
first export.

Read-only throughout: the connection is opened `mode=ro` with
`PRAGMA query_only=ON`, and the whole read runs in one transaction.
"""

import argparse
import bisect
import collections
import hashlib
import html
import json
import os
import re
import sqlite3
import sys
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import roster_identity  # noqa: E402
import vote_parties  # noqa: E402
from bills_registry.bills_stages import BILL_STAGE_ORDER  # noqa: E402,F401 -- shared export vocabulary
from corrections.apply import apply as apply_corrections  # noqa: E402

DB_PATH = os.environ.get("OPAX_DB") or os.path.expanduser("~/.cache/autoresearch/parli.db")
DB_URI = f"file:{DB_PATH}?mode=ro"
BRIEF_FIELD = "da-summary-t-body"
DEFAULT_BRIEF_CACHE = Path.home() / ".cache" / "autoresearch" / "bill_speech_briefs.json"
SPEECH_CAP = 24

# Openings of the 39th to 48th Parliaments, the list the section 4 audit used.
# Both the parliament number and the candidate date window depend on it, so it
# is reproduced verbatim rather than extended: a bill introduced before the
# first entry gets parliament null (see PARLIAMENT_FLOOR) instead of a guess.
PARLIAMENT_STARTS = [
    "1998-11-10", "2002-02-12", "2004-11-16", "2008-02-12", "2010-09-28",
    "2013-11-12", "2016-08-30", "2019-07-02", "2022-07-26", "2025-07-22",
]
PARLIAMENT_FLOOR = 38  # everything before PARLIAMENT_STARTS[0]
TODAY = datetime.now(timezone.utc).date().isoformat()

LICENCE_APH = "CC BY-NC-ND 4.0 (Parliament of Australia)"
LICENCE_FRL = "CC BY 4.0 (Federal Register of Legislation)"
DATASET_KIND = {"billhome": "billhome", "ems": "em", "billsdgs": "digest", "bills": "text"}

# Exposure drafts live in the repo, not the database: a department releases a
# draft for consultation before ParlInfo has a number for it, so there is no
# billhome row to key on. docs/BILLS-EXPOSURE.md "Exposure drafts".
DRAFTS_PATH = Path(__file__).resolve().parent / "bills_registry" / "exposure_drafts.json"
DRAFT_STATUS = "exposure_draft"

# Registry rows that are not published, each with the record that replaces it
# and the source that shows they are one bill (bills-008). /bill/<key> for a
# suppressed key redirects to its replacement through index.json `redirects`.
SUPPRESSED_PATH = Path(__file__).resolve().parent / "bills_registry" / "suppressed.json"

# A bill the chamber voted down. ParlInfo's status for these is "Not
# Proceeding", the same as for a bill that lapsed at a dissolution, so the
# outcome is read from the final recorded event instead (bills-003).
NEGATIVED_STATUS = "negatived"
_NEGATIVED_EVENT = re.compile(r"\bnegatived\b", re.I)

HOUSE_CODE = {
    "house of representatives": "representatives",
    "representatives": "representatives",
    "reps": "representatives",
    "senate": "senate",
}


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# Title normalisation and the audited match rule (docs/SCOPE-BILLS.md s4)
# ---------------------------------------------------------------------------

_REPRINT_YEAR = re.compile(r"\[(?:19|20)\d{2}\]")
_FISCAL_YEAR = re.compile(r"((?:19|20)\d{2})[–-](\d{2})\b")
_NON_WORD = re.compile(r"[^\w]+")


def norm(title: str | None) -> str:
    """NFKC + casefold, `&` to `and`, drop bracketed reprint years only, expand
    a fiscal year (`2005-06` -> `2005 2006`), then collapse to word tokens.
    `[No. 2]` survives, which is what keeps a reintroduction distinct."""
    t = unicodedata.normalize("NFKC", title or "").casefold().replace("&", " and ")
    t = _REPRINT_YEAR.sub(" ", t)
    t = _FISCAL_YEAR.sub(lambda m: f"{m[1]} {m[1][:2]}{m[2]}", t)
    return _NON_WORD.sub(" ", t).strip()


def parliament_of(date: str | None) -> int:
    return PARLIAMENT_FLOOR + bisect.bisect_right(PARLIAMENT_STARTS, date or "")


def parliament_label(date: str | None) -> int | None:
    """The parliament number, or None before the audited list starts."""
    p = parliament_of(date)
    return None if p <= PARLIAMENT_FLOOR else p


def window_end(introduced: str | None) -> str:
    """A candidate stays live until the next parliament opens. Deliberately
    conservative: resumed Senate bills and post-assent references are missed
    rather than mis-assigned (docs/SCOPE-BILLS.md s4)."""
    p = parliament_of(introduced)
    if 39 <= p < 48:
        return PARLIAMENT_STARTS[p - PARLIAMENT_FLOOR]
    return PARLIAMENT_STARTS[0] if p < 39 else TODAY


class TitleMatcher:
    """Match full registry titles as contiguous token runs inside a heading.

    A base title is refused when the next token is `no`, so "X Bill 2015" never
    swallows a division about "X Bill (No. 2) 2015". A title that resolves to
    more than one live bill is ambiguous and emits nothing.
    """

    def __init__(self, bills: list[dict]):
        self.index: dict[str, list[dict]] = collections.defaultdict(list)
        for b in bills:
            if b["title"]:
                self.index[norm(b["title"])].append(b)
        self.trie: dict = {}
        for key in self.index:
            node = self.trie
            for word in key.split():
                node = node.setdefault(word, {})
            node["$"] = key
        self.ambiguous: collections.Counter = collections.Counter()

    def _keys(self, text: str) -> list[str]:
        words = norm(text).split()
        found: set[str] = set()
        for i in range(len(words)):
            node = self.trie
            for j, word in enumerate(words[i:], i):
                node = node.get(word)
                if node is None:
                    break
                if "$" in node and not (j + 1 < len(words) and words[j + 1] == "no"):
                    found.add(node["$"])
        return sorted(found)

    def match(self, text: str | None, date: str | None) -> list[str]:
        """Bill keys named by `text` and live on `date`. Federal only."""
        if not text or not date:
            return []
        hits: list[str] = []
        for key in self._keys(text):
            live = [
                b for b in self.index[key]
                if b["introduced"] and b["introduced"] <= date < window_end(b["introduced"])
                and (not b.get("assent") or date <= b["assent"])
            ]
            if len(live) == 1:
                hits.append(live[0]["key"])
            elif len(live) > 1:
                self.ambiguous[key] += 1
        return sorted(set(hits))


# ---------------------------------------------------------------------------
# Division naming (the vocabulary scripts/export_votes.py already reads)
# ---------------------------------------------------------------------------

CATEGORY_STAGE = {
    "motions": "Motion", "business": "Business motion", "documents": "Documents",
    "notices": "Notice of motion", "matters of urgency": "Urgency motion",
    "matters of public importance": "Matter of public importance",
    "questions without notice": "Question time",
    "questions without notice: additional answers": "Question time",
    "committees": "Committee motion", "statements": "Statement", "bills": "Bill",
}
STAGE_CASE = {
    "second reading": "Second reading", "third reading": "Third reading",
    "in committee": "In committee", "consideration in detail": "Consideration in detail",
    "consideration of senate message": "Consideration of Senate message",
    "consideration of house of representatives message": "Consideration of House message",
    "limitation of debate": "Limitation of debate",
}
HANSARD_STAGE = re.compile(
    r";\s*((?:Second|Third) Reading|Consideration in Detail|In Committee|Limitation of Debate|"
    r"Consideration of (?:Senate|House of Representatives) Message)\s*$", re.I)
WS = re.compile(r"\s+")


def division_stage(raw: str | None) -> str | None:
    """The stage a division name declares, or None. Never inferred from the
    fact that a bill matched: an unnamed stage stays unnamed."""
    if not raw:
        return None
    name = WS.sub(" ", raw).strip()
    if "...." in name:
        return None
    name = HANSARD_STAGE.sub(lambda m: f" - {m.group(1)}", name)
    parts = [p.strip() for p in re.split(r"\s+[-—]\s+", name) if p.strip()]
    if len(parts) < 2:
        return None
    head = parts[0]
    if " bill" in head.lower() or head.lower().endswith("bill"):
        stage = parts[1]
    elif head.lower() in CATEGORY_STAGE:
        stage = parts[2] if CATEGORY_STAGE[head.lower()] == "Bill" and len(parts) >= 3 \
            else CATEGORY_STAGE[head.lower()]
    elif len(parts) >= 3:
        stage = head
    else:
        stage = parts[1]
    return STAGE_CASE.get(stage.lower(), stage[:1].upper() + stage[1:]) or None


DIVISION_TITLE_CASE = {
    **STAGE_CASE,
    "first reading": "First reading",
    "committee of the whole": "Committee of the whole",
    "report from federation chamber": "Report from Federation Chamber",
    "reference to committee": "Reference to committee",
    "refer to committee": "Refer to committee",
    "adoption of report": "Adoption of report",
    "declaration of urgency": "Declaration of urgency",
    "motion to dissent from ruling": "Motion to dissent from ruling",
    "agreed to amendment": "Agreed to amendment",
    "motion to suspend standing orders": "Motion to suspend standing orders",
}


def division_title(stage: str | None) -> str | None:
    """A display title from the recorded stage alone, never the question or
    outcome. An unrecorded stage has no title; unfamiliar labels are retained."""
    stage = WS.sub(" ", stage or "").strip()
    if not stage:
        return None
    # Some recorded stages include a run-in detail after an en/em dash.
    head = re.split(r"\s+[–—-]\s+", stage, maxsplit=1)[0]
    return DIVISION_TITLE_CASE.get(head.casefold(), stage[:1].upper() + stage[1:])


_OFFICER_PREFIX = re.compile(
    r"^(?:The\s+)?(?:(?:Acting|Temporary|Deputy)\s+)*"
    r"(?:President|Speaker|Chair(?:man|person)?)"
    r"(?:\s*\([^)]*\)|\s*[—–-]\s*(?:Senator|Mr|Mrs|Ms|Dr)\.?\s+"
    r"(?-i:[A-Z][\w'’.-]+(?:\s+[A-Z][\w'’.-]+){0,3}))?"
    r"(?:\s*:\s*|\s+)(?=(?:put|puts|The question|the question|I\b))", re.I,
)
_NAMED_QUESTION_PREFIX = re.compile(
    r"^(?:(?:Senator|Mr|Mrs|Ms|Dr)\.?\s+)?"
    r"[A-Z][\w'’.-]+(?:\s+[A-Z][\w'’.-]+){1,3}"
    r"\s*(?::\s*|\s+)(?=(?:The question|the question)\b)",
)


@lru_cache(maxsize=1)
def _speaker_prefix(speaker_names: tuple[str, ...]) -> re.Pattern:
    names = "|".join(re.escape(name) for name in sorted(set(speaker_names), key=lambda n: (-len(n), n)))
    return re.compile(r"^(?:(?:Senator|Mr|Mrs|Ms|Dr)\.?\s+)?(?:" + (names or r"(?!)")
                      + r")(?:\s*:\s*|\s+)(?=\S)")


def clean_division_question(question: str | None, speaker_names: tuple[str, ...] = ()) -> str | None:
    """Remove only a leading speaker label; retain the speaker's words, later
    names, quotations and markdown. Bare names use recorded member identities
    (longest first), rather than guessing where a capitalised name ends."""
    if question is None:
        return None
    text = question.strip()
    cleaned = _OFFICER_PREFIX.sub("", text, count=1)
    if cleaned != text:
        return cleaned
    match = _speaker_prefix(speaker_names).match(text)
    if match:
        return text[match.end():]
    return _NAMED_QUESTION_PREFIX.sub("", text, count=1)


_SPEECH_STAGE = re.compile(
    r"\b(second reading|third reading|first reading|in committee|"
    r"consideration in detail|committee of the whole)\b", re.I)


def speech_stage_hint(topic: str | None) -> str | None:
    """Only what the topic string itself says. Section 3 measured zero explicit
    second-reading federal topics, so this is null for federal speeches until
    the Hansard debate hierarchy is recovered."""
    m = _SPEECH_STAGE.search(topic or "")
    return STAGE_CASE.get(m.group(1).lower(), m.group(1).title()) if m else None


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------


def connect(uri: str) -> sqlite3.Connection:
    db = sqlite3.connect(uri, uri=True)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA query_only=ON")
    db.execute("BEGIN")
    return db


def has_table(db: sqlite3.Connection, name: str) -> bool:
    return db.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def house_code(raw: str | None) -> str | None:
    """A chamber code, or None. The legacy progress table writes "Assent" in the
    house column of an assent row; that is not a chamber, so it is not passed
    through (bills-012)."""
    return HOUSE_CODE.get((raw or "").strip().lower())


# --- sponsor metadata -------------------------------------------------------

# ParlInfo's billhome page carries each sponsor in a hidden tag,
# <sponsor id=".." party="..">NAME</sponsor>. The party attribute is free text:
# mostly a party name, sometimes entity-encoded and quoted (&#34;ALP&#34;),
# truncated at a bracket ("United Australia Party (Clive Palmer"), or not a
# party at all ("independent candidate for the federal seat of Bass, Tas",
# "monarchist", "xx"), and the visible aph.gov.au page prints no party. A value
# is published only when it names a known party; anything else is dropped and
# the party recorded for that person on the introduction date stands in, or
# nothing does (bills-001, bills-002). The map gives OPAX's party token for each
# label, so one party has one party page. Labels are folded with casefold().
SPONSOR_PARTY_TOKENS = {
    "alp": "Labor",
    "australian labor party": "Labor",
    "labor": "Labor",
    "liberal party of australia": "Liberal",
    "liberal": "Liberal",
    "nationals": "Nationals",
    "the nationals": "Nationals",
    "national party of australia": "Nationals",
    "liberal national party of queensland": "LNP",
    "lnp": "LNP",
    "australian greens": "Greens",
    "queensland greens": "Greens",  # the Queensland branch of the Australian Greens
    "greens": "Greens",
    "independent": "Independent",
    "independent member": "Independent",
    "independent members": "Independent",
    "pauline hanson's one nation": "One Nation",
    "pauline hansons one nation": "One Nation",
    "one nation": "One Nation",
    "katter's australian party": "Katter's Australian Party",
    "centre alliance": "Centre Alliance",
    "nick xenophon team": "Nick Xenophon Team",
    "rex patrick team": "Rex Patrick Team",
    "jacqui lambie network": "Jacqui Lambie Network",
    "liberal democratic party": "Liberal Democratic Party",
    "palmer united party": "Palmer United Party",
    "united australia party": "United Australia Party",
    "united australia party (clive palmer": "United Australia Party",  # truncated in the source
    "country liberals (northern territory": "Country Liberal Party",  # truncated in the source
    "country liberal party": "Country Liberal Party",
    "democratic labour party (dlp": "DLP",  # truncated in the source
    "democratic labor party (dlp": "DLP",  # truncated in the source
    "democratic labor party": "DLP",
    "derryn hinch's justice party": "Derryn Hinch's Justice Party",
    "australia's voice": "Australia's Voice",
    "australian motoring enthusiast party": "Australian Motoring Enthusiast Party",
    "family first": "Family First",
    "australian democrats": "Australian Democrats",
    "australian conservatives": "Australian Conservatives",
    "gerard rennick people first": "Gerard Rennick People First",
}
SPONSOR_PARTY_TOKEN_SET = frozenset(SPONSOR_PARTY_TOKENS.values())
# Values `speeches.party_canonical` can give the dated fallback that are not
# themselves tokens (Hansard abbreviations). validate_data.py accepts a
# published party only from these two sets; a new party fails validation until
# it is reviewed and added here.
TIMELINE_ONLY_PARTIES = frozenset({"JLN", "LP"})
PUBLISHED_PARTIES = SPONSOR_PARTY_TOKEN_SET | TIMELINE_ONLY_PARTIES


def source_text(raw: str | None) -> str | None:
    """A ParlInfo attribute or print as text: entities decoded (twice, for the
    double-escaped rows), one pair of surrounding quotes removed, whitespace
    collapsed."""
    if raw is None:
        return None
    s = html.unescape(html.unescape(str(raw)))
    s = WS.sub(" ", s).strip()
    if len(s) >= 2 and s[0] == s[-1] == '"':
        s = s[1:-1].strip()
    return s or None


def sponsor_party_token(raw: str | None) -> str | None:
    """The party token a source party label names, or None when it names none."""
    s = source_text(raw)
    if not s:
        return None
    return SPONSOR_PARTY_TOKENS.get(s.replace("’", "'").casefold())


# A private member's bill in the legacy ALRC table carries its sponsors in the
# portfolio slot, run together: "(s) ENTSCH, Warren, MPGAMBARO, Teresa, MP".
_PRIVATE_PORTFOLIO = re.compile(r"^\(s\)\s*", re.I)
_MEMBER_BOUNDARY = re.compile(r"(?<=,\sMP)(?=\S)|(?<=,\sSenator)(?=\S)|(?<=,\sSen)(?=[A-Z])")


def portfolio_sponsors(portfolio: str | None) -> list[str] | None:
    """The member prints a "(s) ..." portfolio string names, or None when the
    string is a real portfolio."""
    raw = (portfolio or "").strip()
    if not _PRIVATE_PORTFOLIO.match(raw):
        return None
    rest = source_text(_PRIVATE_PORTFOLIO.sub("", raw)) or ""
    return [p.strip() for p in _MEMBER_BOUNDARY.split(rest) if p.strip()]


def negatived_event(event: dict) -> bool:
    return bool(_NEGATIVED_EVENT.search(event.get("event_raw") or ""))


def final_status(status: str | None, events: list[dict]) -> str | None:
    """`negatived` for a dead bill whose last recorded event is a negatived
    vote; otherwise the registry's status unchanged. Only a dead ('lapsed')
    status changes: a bill negatived at one stage and later recommitted and
    passed (r5738, r5269, r5270) keeps `passed`, and one restored to the
    Notice Paper and still before parliament keeps its status."""
    if status != "lapsed":
        return status
    dated = [e for e in events if e.get("date")]
    if not dated:
        return status
    last = max(e["date"] for e in dated)
    negatived = [e["date"] for e in dated if negatived_event(e)]
    return NEGATIVED_STATUS if negatived and max(negatived) == last else status


def key_dates(events: list[dict]) -> list[dict]:
    """The published stage rows: every recorded event with the source's own
    wording (`event_raw`), a negatived vote marked as such, and an exact repeat
    of a row dropped (bills-004, bills-005)."""
    out, seen = [], set()
    for e in events:
        row = {"stage": e["stage"], "date": e["date"], "house": e["house"], "url": e["url"],
               "event_raw": e.get("event_raw")}
        if negatived_event(e):
            row["negatived"] = True
        sig = tuple(row.get(k) for k in ("stage", "date", "house", "url", "event_raw"))
        if sig in seen:
            continue
        seen.add(sig)
        out.append(row)
    return out


def registry_sponsors(row: dict, extras: dict, portfolio_prints: list[str] | None) -> list[dict]:
    """Every sponsor the source lists, first sponsor first. ParlInfo rows read
    the scraper's `sponsors` list when the row carries one; the legacy "(s)"
    portfolio string stands in when it names the same first sponsor."""
    listed = extras.get("sponsors") if isinstance(extras.get("sponsors"), list) else None
    out: list[dict] = []
    if listed:
        for s in listed:
            if isinstance(s, dict) and source_text(s.get("name")):
                out.append({"name": source_text(s.get("name")), "party": sponsor_party_token(s.get("party")),
                            "_party_raw": source_text(s.get("party"))})
    elif row.get("sponsor_name"):
        out.append({"name": source_text(row["sponsor_name"]), "party": sponsor_party_token(extras.get("sponsor_party")),
                    "_party_raw": source_text(extras.get("sponsor_party"))})
        if portfolio_prints and len(portfolio_prints) > 1:
            first = (sponsor_print({"sponsor": portfolio_prints[0]}) or "").casefold()
            if first and first == (sponsor_print({"sponsor": out[0]["name"]}) or "").casefold():
                out += [{"name": p, "party": None, "_party_raw": None} for p in portfolio_prints[1:]]
    elif portfolio_prints:
        out = [{"name": p, "party": None, "_party_raw": None} for p in portfolio_prints]
    seen, unique = set(), []
    for s in out:
        if s["name"] not in seen:
            seen.add(s["name"])
            unique.append(s)
    return unique


class PartyTimeline:
    """Party affiliation on a given day, from the record rather than from today.

    `ext_votes.party` and `members.party` both hold one party per person -- the
    member's last recorded affiliation. Using either for a 2006 division puts
    Katter's Australian Party, founded in 2011, on both sides of it. Hansard
    does carry the date: every speech row records the party the speaker sat for
    that day, and `party_canonical` cleans it ("IND"/"Independent"/"AUS" ->
    Independent, then Katter's Australian Party from 2017). Collapsing those
    observations per person gives a dated timeline to read a division against.

    Every answer says how it was reached, so the projection can show its own
    coverage instead of implying the whole split is dated evidence:

      dated     an observation on or before the division
      earliest  only later observations; their earliest recorded party stands in
      member    no speech observation at all; the members row stands in
      unknown   nothing recorded
    """

    def __init__(self, runs: dict[str, tuple[list[str], list[str]]], member_party: dict[str, str]):
        self.runs = runs
        self.member_party = member_party

    @classmethod
    def load(cls, db: sqlite3.Connection) -> "PartyTimeline":
        # Parallel date and party lists per person, so a lookup bisects the
        # dates directly. party_canonical is in the ORDER BY as well as the
        # date: a person appearing under two parties on one sitting day would
        # otherwise arrive in an arbitrary order, and an unsorted list breaks
        # the bisect. With it, the last party recorded for that day wins, the
        # same way on every run.
        runs: dict[str, tuple[list[str], list[str]]] = {}
        last: dict[str, str] = {}
        for r in db.execute(
            "SELECT person_id, date, party_canonical party FROM speeches "
            "WHERE state='federal' AND person_id IS NOT NULL AND date IS NOT NULL "
            "AND party_canonical IS NOT NULL AND party_canonical != '' "
            "GROUP BY person_id, date, party_canonical "
            "ORDER BY person_id, date, party_canonical"
        ):
            pid, date, party = r["person_id"], r["date"], r["party"]
            if last.get(pid) == party:
                continue  # only transitions; a run's start date is what matters
            last[pid] = party
            dates, parties = runs.setdefault(pid, ([], []))
            dates.append(date)
            parties.append(party)
        member_party = {}
        for r in db.execute(
            "SELECT person_id, COALESCE(party_canonical, party) p FROM members "
            "WHERE COALESCE(party_canonical, party) IS NOT NULL"
        ):
            member_party[r["person_id"]] = r["p"]
        log(f"party timeline: {len(runs)} people, "
            f"{sum(len(d) for d, _ in runs.values())} runs, {len(member_party)} member rows")
        return cls(runs, member_party)

    def at(self, person_id: str | None, date: str | None) -> tuple[str, str]:
        """(party, how) for one person on one day."""
        if not person_id:
            return "Unknown", "unknown"
        pid = person_id[5:] if person_id.startswith("tvfy_") else person_id
        run = self.runs.get(pid)
        if run:
            dates, parties = run
            if date:
                k = bisect.bisect_right(dates, date)
                return (parties[k - 1], "dated") if k else (parties[0], "earliest")
            return parties[0], "earliest"
        party = self.member_party.get(pid)
        return (party, "member") if party else ("Unknown", "unknown")


# --- registry rows ----------------------------------------------------------


_ASSENT_ACT_NUMBER = re.compile(
    r"\bAct\s+(?:no\.?|number)\s*[:.]?\s*(\d+)"
    r"(?:\s*(?:of|,|/)\s*((?:18|19|20)\d{2}))?\b", re.I)


def lifecycle_fields(events: list[dict]) -> dict:
    """Project explicit progress evidence. Missing events and Act numbers stay
    null; neither a bill's status nor its dates supply an unrecorded fact."""
    assent_events = [e for e in events if e.get("stage") == "royal_assent"]
    assent_dates = {e["date"] for e in assent_events if e.get("date")}
    passed_events = [e for e in events if e.get("stage") == "passed"]
    passed_dates = {e["date"] for e in passed_events if e.get("date")}
    numbers = set()
    for event in assent_events:
        for match in _ASSENT_ACT_NUMBER.finditer(event.get("event_raw") or ""):
            number, year = match.groups()
            numbers.add(f"{number} of {year}" if year else number)
    return {
        "passed_both_houses": True if passed_events else None,
        "passed_both_houses_date": next(iter(passed_dates)) if len(passed_dates) == 1 else None,
        "royal_assent": next(iter(assent_dates)) if len(assent_dates) == 1 else None,
        "act_number": next(iter(numbers)) if len(numbers) == 1 else None,
    }


def load_legacy_bills(db: sqlite3.Connection) -> list[dict]:
    """`bills` + `bill_progress`. Keys are provisional (`au-federal-alrc-<id>`)
    because these rows carry no billhome id to key on."""
    events: dict[int, list[dict]] = collections.defaultdict(list)
    for r in db.execute(
        "SELECT bill_id, stage, date, house, event_raw FROM bill_progress "
        "WHERE bill_id IS NOT NULL ORDER BY bill_id, date, progress_id"
    ):
        events[r["bill_id"]].append({
            "stage": r["stage"], "date": r["date"],
            "house": house_code(r["house"]), "url": None,
            "event_raw": r["event_raw"],
        })
    bills = []
    for r in db.execute(
        "SELECT bill_id, title, status, portfolio, introduced_date, house FROM bills "
        "ORDER BY bill_id"
    ):
        evs = events.get(r["bill_id"], [])
        lifecycle = lifecycle_fields(evs)
        last = max((e["date"] for e in evs if e["date"]), default=None)
        prints = portfolio_sponsors(r["portfolio"])
        sponsors = registry_sponsors({}, {}, prints)
        bills.append({
            "key": f"au-federal-alrc-{r['bill_id']}",
            "legacy_bill_id": r["bill_id"],
            "source_system": "alrc",
            "source_id": str(r["bill_id"]),
            "jurisdiction": "federal",
            "title": r["title"],
            "short_title": None,
            "aliases": [],
            "parliament": parliament_label(r["introduced_date"]),
            "session": None,
            "introduced": r["introduced_date"],
            "originating_house": house_code(r["house"]),
            "sponsor": sponsors[0]["name"] if sponsors else None,
            "sponsors": sponsors,
            "sponsor_party": None,
            "sponsor_person_id": None,
            # A "(s) MEMBER" string is the sponsor, now carried there (bills-007).
            "portfolio": None if prints is not None else (r["portfolio"] or None),
            "status": final_status(r["status"], evs),
            "status_raw": r["status"],
            "status_as_of": last,
            "assent": lifecycle["royal_assent"],
            **lifecycle,
            "key_dates": key_dates(evs),
        })
    return bills


def load_v2_bills(db: sqlite3.Connection) -> list[dict]:
    """`bills_v2` + `bill_events`, the registry agent's tables."""
    events: dict[str, list[dict]] = collections.defaultdict(list)
    if has_table(db, "bill_events"):
        for r in db.execute(
            "SELECT bill_key, stage, date, house, source_url, event_raw FROM bill_events "
            "ORDER BY bill_key, date"
        ):
            events[r["bill_key"]].append({
                "stage": r["stage"], "date": r["date"],
                "house": house_code(r["house"]), "url": r["source_url"],
                "event_raw": r["event_raw"],
            })
    bills = []
    for r in db.execute("SELECT * FROM bills_v2 ORDER BY bill_key"):
        row = dict(r)
        evs = events.get(row["bill_key"], [])
        lifecycle = lifecycle_fields(evs)
        # aliases_json is a list of alias titles per the contract, but the
        # registry currently writes an object of listing extras for ParlInfo
        # rows. Read either, retaining the source party for the dated check in
        # fill_sponsor_parties rather than treating it as current affiliation.
        extras: dict = {}
        aliases: list = []
        try:
            parsed = json.loads(row.get("aliases_json") or "[]")
        except (TypeError, ValueError):
            parsed = []
        if isinstance(parsed, list):
            aliases = [a for a in parsed if isinstance(a, str)]
        elif isinstance(parsed, dict):
            extras = parsed
            listed = parsed.get("aliases")
            if isinstance(listed, list):
                aliases = [a for a in listed if isinstance(a, str)]
            other = parsed.get("listing_title")
            if isinstance(other, str) and other and other != row.get("title"):
                aliases.append(other)
        # A "(s) MEMBER, Name, MP" portfolio is a sponsor print, not a portfolio:
        # the legacy ALRC table wrote private members' bills that way, and the
        # reconcile copied it onto ParlInfo rows whose own page has no portfolio
        # (bills-007). It becomes the sponsor where the row has none, and the
        # portfolio is published empty.
        prints = portfolio_sponsors(row.get("portfolio"))
        sponsors = registry_sponsors(row, extras, prints)
        bills.append({
            "key": row["bill_key"],
            "legacy_bill_id": row.get("legacy_bill_id"),
            "source_system": row.get("source_system"),
            "source_id": row.get("source_id"),
            "jurisdiction": row.get("jurisdiction") or "federal",
            "title": row.get("title"),
            "short_title": row.get("short_title"),
            "aliases": aliases if isinstance(aliases, list) else [],
            "parliament": row.get("parliament") or parliament_label(row.get("introduced_date")),
            "session": row.get("session"),
            "introduced": row.get("introduced_date"),
            "originating_house": house_code(row.get("originating_house")),
            "sponsor": source_text(row.get("sponsor_name")) or (sponsors[0]["name"] if sponsors else None),
            "sponsors": sponsors,
            # The source's party label only when it names a known party; the
            # dated party record checks it at introduction (fill_sponsor_parties).
            "sponsor_party": sponsors[0]["party"] if sponsors else None,
            "sponsor_person_id": row.get("sponsor_person_id"),
            "portfolio": None if prints is not None else row.get("portfolio"),
            "status": final_status(row.get("status"), evs),
            "status_raw": row.get("status_raw"),
            "status_as_of": row.get("status_as_of") or max((e["date"] for e in evs if e["date"]), default=None),
            "assent": lifecycle["royal_assent"],
            **lifecycle,
            "key_dates": key_dates(evs),
        })
    return bills


SPONSOR_WORDS = {"sen", "sen.", "senator", "mp", "jnr", "snr"}


def sponsor_print(bill: dict) -> str | None:
    """The printed sponsor as "Given Surname": the registry's "WANG, Sen Zhenya", or a
    legacy portfolio's "(s) KATTER, Bob, Jnr, MP" when it names exactly one member."""
    raw = bill.get("sponsor")
    if not raw:
        portfolio = (bill.get("portfolio") or "").strip()
        if not portfolio.lower().startswith("(s)"):
            return None
        raw = portfolio[3:].strip()
        if len(re.findall(r",\s*(?:MP|Senator|Sen\.?)(?=\s*[A-Z]|\s*$)", raw)) != 1:
            return None
    raw = raw.replace("&#39;", "'").replace("&#34;", '"').replace("&quot;", '"')
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if len(parts) > 1:
        parts = parts[1:] + parts[:1]
    words = [w for w in " ".join(parts).split() if w.lower() not in SPONSOR_WORDS]
    return " ".join(words) or None


def fill_sponsor_ids(bills: list[dict], members: dict[str, dict]) -> int:
    """`sponsor_person_id` where the registry left it empty (new ParlInfo rows, every legacy
    row): the one member of the bill's house whose name agrees with the print and who sat in
    the year it was introduced -- roster_identity.sole_member(), the people export's own join.
    Two candidates or none leave it empty. Returns how many were filled."""
    filled = 0
    for b in bills:
        year = (b.get("introduced") or "")[:4]
        if not year.isdigit():
            continue
        if not b.get("sponsor_person_id"):
            pid = roster_identity.sole_member(sponsor_print(b), members, b.get("originating_house"), int(year))
            if pid:
                b["sponsor_person_id"] = pid
                filled += 1
        # Co-sponsors by the same rule; the first listed sponsor is `sponsor`.
        for i, s in enumerate(b.get("sponsors") or []):
            if "person_id" in s:
                continue
            s["person_id"] = b.get("sponsor_person_id") if i == 0 else roster_identity.sole_member(
                sponsor_print({"sponsor": s["name"]}), members, b.get("originating_house"), int(year))
    return filled


# Naming rule: a person's own registered party beats the parliamentary label
# Independent, whichever side holds it. These are the personal parties in the
# reviewed sponsor audit, not aliases for Independent. This rule supplies no
# party's foundation date and does not preserve a former Liberal/Nationals
# affiliation over a dated move to Independent.
# Ownership, not membership: another person's membership of one of these
# parties cannot override their later dated move to Independent (e.g. Anning).
PERSONAL_SPONSOR_PARTIES = {
    "Rex Patrick Team": "10903", "Nick Xenophon Team": "10717",
    "Jacqui Lambie Network": "10830", "Australian Conservatives": "10038",
    "Katter's Australian Party": "10352",
}
# The accepted roster's Sam McMahon row records Country Liberal Party. Only
# when both source and dated labels are its parliamentary naming variants may
# this registered label bridge Liberal/Nationals; it supplies no service dates.
SPONSOR_REGIONAL_PARTIES = {("senate", "10948"): "Country Liberal Party"}


class SponsorPartyRecords:
    """The division resolver's bounded roster periods, applied to bill sponsors.

    A conflicting, missing or held period cannot replace a source label.
    Speech observations and today's member row never override one either.
    """

    def __init__(self, evidence=None, *, strict=True):
        self.evidence = vote_parties.load_evidence() if evidence is None else evidence
        self.strict = strict
        if strict:
            self.require_available()
        self.resolver = vote_parties.Resolver(self.evidence)

    def require_available(self) -> None:
        if not getattr(self.evidence, "check_labels", True):
            raise RuntimeError("Bill export aborted: electorate release unavailable; published bills must be kept")
        if ("federal", "senate") in getattr(self.evidence, "frozen", ()):
            raise RuntimeError("Bill export aborted: Senate Handbook unavailable; published bills must be kept")

    def check(self, bill: dict, sponsor: dict | None = None) -> dict:
        if self.strict:
            self.require_available()
        member = sponsor if sponsor is not None else {
            "name": bill.get("sponsor"), "person_id": bill.get("sponsor_person_id"),
            "party": bill.get("sponsor_party")}
        source = member.get("party")
        kept = {"party": source, "source_party": source}
        day, house = vote_parties.iso(bill.get("introduced")), bill.get("originating_house")
        if not day:
            return {**kept, "reason": "no-date"}
        record = {"house": house, "jurisdiction": bill.get("jurisdiction", "federal")}
        if self.evidence.is_frozen(record) or (source and not self.evidence.check_labels):
            return {**kept, "reason": "records-unavailable"}
        name = sponsor_print({"sponsor": member.get("name")})
        rule, hits = self.resolver.match(house, day, name, member.get("person_id"), set())
        surname_mismatch = source and rule == "pid" and hits and (not vote_parties.surname(name) or not any(
            vote_parties.surname(name) in hit["surnames"] for hit in hits))
        if surname_mismatch and source != "Rex Patrick Team":
            return {**kept, "reason": "pid-surname-mismatch"}
        party, basis, url = self.resolver.party_on(
            hits, day, same=vote_parties.same_party, allow_bracket=bool(source)) if hits else (
            None, rule, None)
        if not party:
            return {**kept, "reason": basis}
        dated = sponsor_party_token(party)
        if not dated:
            return {**kept, "reason": "unrecognised-dated-party", "record_party": party}
        if surname_mismatch:
            # Keep the identity guard, but expose the same reviewed source/group
            # disagreement as main even when the printed surname disagrees.
            return {**kept, "reason": "pid-surname-mismatch", "dated_party": dated}
        result = {**kept, "dated_party": dated, "record_party": party,
                  "basis": basis, "url": url, "rule": rule}
        pid = str(member.get("person_id") or "").removeprefix("tvfy_")
        if not pid:
            matched_pids = {p.removeprefix("tvfy_") for hit in hits for p in hit["pids"]}
            if len(matched_pids) == 1:
                pid = matched_pids.pop()
        regional = SPONSOR_REGIONAL_PARTIES.get((house, pid))
        if not source:
            chosen, reason = dated, "filled"
        elif source == "Rex Patrick Team" and dated == "Independent":
            # Preserve the reviewed source/group hold without requiring an owner id.
            chosen, reason = source, "convention"
        elif "Independent" in (source, dated) and any(
                PERSONAL_SPONSOR_PARTIES.get(p) == pid for p in (source, dated)):
            chosen = source if PERSONAL_SPONSOR_PARTIES.get(source) == pid else dated
            reason = "convention" if chosen == source else "corrected"
        elif regional and all(vote_parties.same_party(p, regional) for p in (source, dated)):
            chosen, reason = regional, "convention"
        elif vote_parties.same_party(source, dated):
            chosen, reason = source, "agrees" if source == dated else "alias"
        else:
            chosen, reason = dated, "corrected"
        renamed = vote_parties.dated_name(getattr(self.evidence, "renames", ()), chosen, day)
        if renamed and renamed != chosen:
            result["rename_from"] = chosen
            chosen = renamed
            if reason != "corrected":
                reason = "renamed"
        return {**result, "party": chosen, "reason": reason}


def fill_sponsor_parties(bills: list[dict], timeline: PartyTimeline | None = None,
                         evidence=None, *, records: SponsorPartyRecords | None = None) -> list[dict]:
    """Resolve all sponsors at introduction and return held naming disagreements.

    Evidence remains the third positional argument and supports evidence= for
    build/retained-refresh callers. records= supplies an explicit, strict Records
    projection using the same resolution and mutation path. Frozen supplied
    evidence keeps retained labels; fresh builds and strict projections abort
    when their evidence is unavailable, before any publication.

    Kept personal-party/Independent naming disagreements remain in the return
    value for review. Speech/member observations only fill missing labels.
    """
    if records is not None and evidence is not None:
        raise ValueError("Supply evidence or records, not both")
    if records is None:
        records = SponsorPartyRecords(evidence, strict=evidence is None)
    held = []

    def dated(bill, sponsor, source):
        outcome = records.check(bill, {**sponsor, "party": source})
        review = outcome["reason"] == "convention" or (
            outcome["reason"] == "pid-surname-mismatch" and source == "Rex Patrick Team"
            and outcome.get("dated_party") == "Independent")
        if review and source != outcome.get("dated_party") \
                and "Independent" in (source, outcome.get("dated_party")):
            held.append({"key": bill["key"], "sponsor": sponsor.get("name"),
                         "date": vote_parties.iso(bill.get("introduced")),
                         "source_party": source, "dated_party": outcome["dated_party"]})
        party = outcome["party"]
        pid = sponsor.get("person_id")
        if party or not pid or timeline is None:
            return party
        party, how = timeline.at(pid, bill.get("introduced"))
        return None if how == "unknown" else party

    for b in bills:
        sponsors = b.get("sponsors") or []
        first = sponsors[0] if sponsors else {}
        primary = {"name": b.get("sponsor") or first.get("name"),
                   "person_id": b.get("sponsor_person_id") or first.get("person_id")}
        b["sponsor_party"] = dated(b, primary, b.get("sponsor_party") or first.get("party"))
        for i, s in enumerate(sponsors):
            # The first print is the primary sponsor, including its reviewed hold.
            s["party"] = b.get("sponsor_party") if i == 0 else dated(b, s, s.get("party"))
    for row in held:
        log(f"sponsor party held for review: {row['key']} {row['date']} "
            f"{row['source_party']} / dated parliamentary group {row['dated_party']}")
    return held


def published_sponsors(b: dict) -> list[dict]:
    """sponsors[] as published: name, person id and party, in the source's order."""
    return [{"name": s["name"], "person_id": s.get("person_id"), "party": s.get("party")}
            for s in b.get("sponsors") or []]


def log_sponsor_party_labels(bills: list[dict]) -> None:
    """Say which source party labels were not published, so a new label is
    reviewed and added to SPONSOR_PARTY_TOKENS rather than silently lost."""
    dropped = collections.Counter(
        s["_party_raw"] for b in bills for s in b.get("sponsors") or []
        if s.get("_party_raw") and not sponsor_party_token(s["_party_raw"]))
    for label, n in dropped.most_common():
        log(f"sponsor party label not a known party, not published: {label!r} x{n}")


# --- divisions --------------------------------------------------------------


def load_divisions(db: sqlite3.Connection, timeline: PartyTimeline) -> dict[str, dict]:
    """Every federal division with its party splits, keyed by `ext_divisions.id`
    (the same id the knowledge box slug `division-<id>` carries). Each voter's
    party is read at the division's own date, and `party_coverage` says how many
    of that division's votes rest on dated evidence."""
    dates: dict[str, str] = {}
    for r in db.execute("SELECT id, date FROM ext_divisions WHERE jurisdiction='federal'"):
        dates[r["id"]] = r["date"]

    splits: dict[str, dict] = collections.defaultdict(lambda: collections.defaultdict(
        lambda: {"ayes": 0, "noes": 0}))
    coverage: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    paired: collections.Counter = collections.Counter()
    for r in db.execute(
        "SELECT division_id, person_id, vote FROM ext_votes WHERE jurisdiction='federal'"
    ):
        did = r["division_id"]
        if r["vote"] == "paired":
            paired[did] += 1
            continue
        if r["vote"] not in ("aye", "no"):
            continue
        party, how = timeline.at(r["person_id"], dates.get(did))
        coverage[did][how] += 1
        splits[did][party]["ayes" if r["vote"] == "aye" else "noes"] += 1

    speaker_names = tuple(sorted({
        WS.sub(" ", r["full_name"]).strip()
        for r in db.execute("SELECT full_name FROM members WHERE full_name IS NOT NULL")
        if r["full_name"].strip()
    }, key=lambda name: (-len(name), name)))
    out: dict[str, dict] = {}
    for r in db.execute(
        "SELECT id, house, date, name, question, ayes_count, noes_count, result, source_url "
        "FROM ext_divisions WHERE jurisdiction='federal'"
    ):
        stage = division_stage(r["name"])
        title = division_title(stage)
        out[r["id"]] = {
            "key": r["id"],
            "date": r["date"],
            "house": r["house"],
            "question": clean_division_question(
                (r["question"] or r["name"] or "").strip() or None, speaker_names),
            "stage": stage,
            **({"title": title} if title else {}),
            "ayes": r["ayes_count"],
            "noes": r["noes_count"],
            "outcome": r["result"],
            "party_splits": {k: dict(v) for k, v in sorted(splits.get(r["id"], {}).items())},
            "party_coverage": dict(coverage.get(r["id"], {})),
            "paired": paired.get(r["id"], 0),
            "url": r["source_url"],
            "_name": r["name"],
        }
    return out


# --- speeches ---------------------------------------------------------------


SPEECH_CANDIDATE_SQL = """
SELECT speech_id, person_id, COALESCE(speaker_name_clean, speaker_name) speaker,
       party_canonical, state, date, topic
FROM speeches
WHERE state = 'federal'
  AND (LOWER(topic) LIKE '%bill%' OR LOWER(topic) LIKE '%second reading%')
ORDER BY date, speech_id
"""


def load_speech_candidates(db: sqlite3.Connection) -> list[dict]:
    return [dict(r) for r in db.execute(SPEECH_CANDIDATE_SQL)]


SPEECH_BY_ID_SQL = """
SELECT speech_id, person_id, COALESCE(speaker_name_clean, speaker_name) speaker,
       party_canonical, state, date, topic
FROM speeches WHERE speech_id IN ({placeholders})
"""


def load_speeches_by_ids(db: sqlite3.Connection, ids: set[str]) -> dict[str, dict]:
    """Speech rows for exactly the ids `bill_links` names, with no topic
    filter. The registry's speech join matches on speech text corroborated by
    a same-day progress event (see bills_speeches_ready), not on `topic` --
    federal Hansard topics from 2013 on are almost always the bare string
    "Bills" or, for most of the rows this join actually names, NULL. The
    `SPEECH_CANDIDATE_SQL` topic filter above is for the legacy title-matching
    path only; applying it here silently drops the great majority of linked
    speeches (measured: 930 of 12,247 linked ids carry a topic matching that
    filter)."""
    out: dict[str, dict] = {}
    if not ids:
        return out
    ids_list = list(ids)
    chunk_size = 500  # stay well under SQLite's default variable limit
    for i in range(0, len(ids_list), chunk_size):
        chunk = ids_list[i:i + chunk_size]
        sql = SPEECH_BY_ID_SQL.format(placeholders=",".join("?" for _ in chunk))
        for r in db.execute(sql, chunk):
            out[str(r["speech_id"])] = dict(r)
    return out


def speech_entry(row: dict, timeline: PartyTimeline) -> dict:
    """The speech row's own `party_canonical` is already the party the speaker
    sat for that day; the timeline only stands in when the row has none."""
    party = row.get("party_canonical") or None
    if not party:
        party, how = timeline.at(row.get("person_id"), row.get("date"))
        if how == "unknown":
            party = None
    return {
        "slug": f"speech-{row['speech_id']}",
        "speaker": row["speaker"] or None,
        "party": party,
        "state": row["state"] or "federal",
        "date": row["date"],
        "stage_hint": speech_stage_hint(row["topic"]),
        "brief": None,
    }


# --- Acts -------------------------------------------------------------------

_TRAILING_YEAR = re.compile(r"\b(?:19|20)\d{2}$")


def act_key(title: str | None) -> str:
    """Normalised base title with the terminal year removed, so a 2015 Bill can
    reach the 2016 Act it became."""
    return _TRAILING_YEAR.sub("", norm(title)).strip()


def load_acts(db: sqlite3.Connection) -> tuple[dict[str, list[dict]], dict[str, dict]]:
    """(base title -> candidates, act_id -> act). `bill_links` names an Act by
    its FRL id, so the id map is what turns a link into a readable row."""
    idx: dict[str, list[dict]] = collections.defaultdict(list)
    by_id: dict[str, dict] = {}
    for r in db.execute(
        "SELECT act_id, name, making_date, bill_code FROM ext_frl_acts WHERE name IS NOT NULL"
    ):
        act = {
            "act_id": r["act_id"], "title": r["name"],
            "assent_date": r["making_date"], "bill_code": r["bill_code"],
            "frl_uri": f"https://www.legislation.gov.au/{r['act_id']}",
        }
        idx[act_key(r["name"])].append(act)
        by_id[r["act_id"]] = act
    # FRL's makingDate stands in for the assent date, and for a few Acts it is
    # not the date the Act's own text gives. Reviewed corrections cite that
    # text (scripts/corrections/bill_acts.json, bills-014).
    if by_id:
        applied = apply_corrections("bill_acts", by_id.values(), key="act_id")
        log(f"acts: {len(applied)} reviewed assent date corrections")
    return idx, by_id


def acts_for_bill(bill: dict, act_index: dict[str, list[dict]]) -> list[dict]:
    """Bill -> Act on base title plus the bill's exact recorded assent date. A
    title that resolves to more than one Act on that date emits nothing."""
    if not bill.get("assent"):
        return []
    key = act_key(re.sub(r"\bBill\b", "Act", bill["title"] or "", flags=re.I))
    cands = [a for a in act_index.get(key, []) if a["assent_date"] == bill["assent"]]
    if len(cands) != 1:
        return []
    a = cands[0]
    return [{"title": a["title"], "frl_uri": a["frl_uri"], "assent_date": a["assent_date"]}]


# --- sources ----------------------------------------------------------------


def load_sources(db: sqlite3.Connection, bills: list[dict], legacy: bool) -> dict[str, list[dict]]:
    """`bill_sources` in full mode; `ext_parlinfo_docs` in legacy mode, joined
    on the `bill_id` the fetcher already resolved and otherwise on an exact
    normalised title inside the bill's own life window."""
    out: dict[str, list[dict]] = collections.defaultdict(list)
    if not legacy and has_table(db, "bill_sources"):
        for r in db.execute(
            "SELECT bill_key, kind, url, document_date, licence FROM bill_sources "
            "ORDER BY bill_key, document_date"
        ):
            out[r["bill_key"]].append({
                "kind": r["kind"], "url": r["url"],
                "document_date": r["document_date"],
                "licence": r["licence"] or LICENCE_APH,
            })
        return out

    by_legacy_id = {b["legacy_bill_id"]: b for b in bills if b.get("legacy_bill_id")}
    by_title: dict[str, list[dict]] = collections.defaultdict(list)
    for b in bills:
        by_title[norm(b["title"])].append(b)
    for r in db.execute(
        "SELECT dataset, title, date, display_url, bill_id FROM ext_parlinfo_docs "
        "WHERE dataset IN ('billhome','ems','billsdgs','bills') ORDER BY date"
    ):
        bill = by_legacy_id.get(r["bill_id"]) if r["bill_id"] else None
        if bill is None:
            cands = [
                b for b in by_title.get(norm(r["title"]), [])
                if b["introduced"] and r["date"] and b["introduced"] <= r["date"]
                and (not b["assent"] or r["date"] <= b["assent"])
            ]
            if len(cands) != 1:
                continue
            bill = cands[0]
        out[bill["key"]].append({
            "kind": DATASET_KIND.get(r["dataset"], r["dataset"]),
            "url": r["display_url"],
            "document_date": r["date"],
            "licence": LICENCE_APH,
        })
    return out


# --- summaries --------------------------------------------------------------

ATTRIBUTION = {
    "em": "Written by a model from the explanatory memorandum; not the record",
    "digest": "Written by a model from the Bills Digest; not the record",
    # Bills with no memorandum (a lapsed private member's bill, say) are summarised
    # from the bill text as introduced or, failing that, a second reading speech.
    "text": "Written by a model from the bill text as introduced; not the record",
    "speech": "Written by a model from a second reading speech; not the record",
}


def load_summaries(db: sqlite3.Connection) -> dict[str, dict]:
    """The newest `ok` summary per bill. A draft or flagged summary is never
    projected: the portal shows reviewed model text or nothing."""
    if not has_table(db, "bill_summaries"):
        return {}
    out: dict[str, dict] = {}
    for r in db.execute(
        "SELECT * FROM bill_summaries WHERE review_state='ok' "
        "AND (superseded_by IS NULL OR superseded_by='') ORDER BY bill_key, version"
    ):
        row = dict(r)
        try:
            payload = json.loads(row.get("summary_json") or "{}")
        except (TypeError, ValueError):
            continue
        sentences = payload.get("sentences") or []
        changes = payload.get("changes") or []
        if len(sentences) != 3 or not (3 <= len(changes) <= 6):
            continue  # the contract's shape, or it does not ship
        out[row["bill_key"]] = {
            "version": row.get("version"),
            "basis": row.get("basis"),
            "attribution": ATTRIBUTION.get(row.get("basis"), ATTRIBUTION["em"]),
            "describes_version": row.get("describes_version"),
            "as_of": row.get("as_of"),
            "sentences": sentences,
            "changes": changes,
            "affected": payload.get("affected") or "",
            "model": row.get("model"),
            "generated_at": row.get("generated_at"),
        }
    return out


# --- links ------------------------------------------------------------------


def load_links(db: sqlite3.Connection) -> dict[str, dict[str, list[str]]]:
    """`bill_links` grouped bill -> kind -> target keys, minus anything an
    audit marked wrong."""
    out: dict[str, dict[str, list[str]]] = collections.defaultdict(
        lambda: collections.defaultdict(list))
    if not has_table(db, "bill_links"):
        return out
    rows = [{"id": f"{r['bill_key']}|{r['kind']}|{r['target_key']}", "bill_key": r["bill_key"],
             "kind": r["kind"], "target_key": r["target_key"]}
            for r in db.execute(
                "SELECT bill_key, kind, target_key FROM bill_links "
                "WHERE COALESCE(audited,'') != 'wrong'")]
    # A link the source got wrong moves to the bill the original record names,
    # by reviewed correction (scripts/corrections/bill_links.json, bills-009).
    if rows:
        applied = apply_corrections("bill_links", rows, key="id")
        if applied:
            log(f"bill_links: {len(applied)} reviewed link corrections")
    for r in rows:
        targets = out[r["bill_key"]][r["kind"]]
        if r["target_key"] not in targets:
            targets.append(r["target_key"])
    return out


def load_suppressed(path: Path = SUPPRESSED_PATH) -> list[dict]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data.get("suppressed") if isinstance(data, dict) else data
    for r in rows or []:
        for field in ("key", "duplicate_of", "reason", "evidence_url", "evidence", "finding", "reviewed"):
            if not r.get(field):
                raise ValueError(f"{path.name}: {r.get('key')!r} has no {field}")
    return rows or []


def suppress(bills: list[dict], suppressed: list[dict]) -> tuple[list[dict], dict[str, str]]:
    """Drop reviewed duplicate rows; return the kept bills and the redirects.
    A replacement that is not in the registry is refused, so a redirect never
    points at nothing."""
    keys = {b["key"] for b in bills}
    redirects: dict[str, str] = {}
    for s in suppressed:
        if s["duplicate_of"] not in keys:
            raise ValueError(f"suppressed {s['key']}: replacement {s['duplicate_of']} is not in the registry")
        redirects[s["key"]] = s["duplicate_of"]
        log(f"suppressed {s['key']} ({s['reason']}, {s['finding']}): see {s['duplicate_of']}"
            + ("" if s["key"] in keys else "; not in the registry any more"))
    return [b for b in bills if b["key"] not in redirects], redirects


TERMINAL_STATUSES = ("passed", "lapsed", NEGATIVED_STATUS)


def links_after_last_event(docs: list[dict]) -> list[dict]:
    """Division links dated after a finished bill's last recorded event. They
    are listed for review in index.json meta, never dropped: most are real
    (a later procedural vote that names the bill), and some are links to the
    wrong bill (bills-009)."""
    out = []
    for d in docs:
        if d.get("status") not in TERMINAL_STATUSES:
            continue
        last = max((e["date"] for e in d.get("key_dates") or [] if e.get("date")), default=None)
        if not last:
            continue
        for v in d.get("divisions") or []:
            if v.get("date") and v["date"] > last:
                out.append({"bill": d["key"], "status": d["status"], "last_event": last,
                            "division": v["key"], "division_date": v["date"]})
    return out


# ---------------------------------------------------------------------------
# Projection
# ---------------------------------------------------------------------------


def build(db: sqlite3.Connection, legacy: bool) -> tuple[list[dict], dict]:
    timeline = PartyTimeline.load(db)

    bills = load_legacy_bills(db) if legacy else load_v2_bills(db)
    log(f"registry: {len(bills)} bills")
    redirects: dict[str, str] = {}
    if not legacy:
        bills, redirects = suppress(bills, load_suppressed())
    if has_table(db, "members"):
        filled = fill_sponsor_ids(bills, roster_identity.federal_members(db))
        log(f"sponsor ids: {filled} filled from the members table")
    sponsor_evidence = vote_parties.load_evidence(db=db)
    SponsorPartyRecords(sponsor_evidence).require_available()
    fill_sponsor_parties(bills, timeline, sponsor_evidence)
    log_sponsor_party_labels(bills)
    log(f"status: {sum(b['status'] == NEGATIVED_STATUS for b in bills)} bills negatived on their final event")

    divisions = load_divisions(db, timeline)
    log(f"divisions: {len(divisions)} federal")
    act_index, acts_by_id = load_acts(db)
    sources = load_sources(db, bills, legacy)
    summaries = load_summaries(db)
    links = load_links(db)
    log(f"summaries: {len(summaries)} ok; links: {len(links)} bills")

    bill_divisions: dict[str, list[dict]] = collections.defaultdict(list)
    bill_speeches: dict[str, list[dict]] = collections.defaultdict(list)
    matcher = TitleMatcher(bills)

    if legacy or not links:
        speeches = load_speech_candidates(db)
        log(f"speech candidates: {len(speeches)}")
        for d in divisions.values():
            for key in matcher.match(d["_name"], d["date"]):
                bill_divisions[key].append(d)
        for s in speeches:
            for key in matcher.match(s["topic"], s["date"]):
                if len(bill_speeches[key]) < SPEECH_CAP:
                    bill_speeches[key].append(speech_entry(s, timeline))
        log(f"title match: {len(bill_divisions)} bills with divisions, "
            f"{len(bill_speeches)} with speeches, {len(matcher.ambiguous)} ambiguous titles")
    else:
        # bill_links names a speech by speeches.speech_id. The join that put
        # it there matches on speech text corroborated by a same-day progress
        # event, not on topic (see bills_speeches_ready), so the rows it names
        # must be read directly by id -- SPEECH_CANDIDATE_SQL's topic filter
        # would silently drop most of them.
        speech_ids = {str(t) for kinds in links.values() for t in kinds.get("speech", [])}
        by_speech_id = load_speeches_by_ids(db, speech_ids)
        log(f"speech rows: {len(by_speech_id)} of {len(speech_ids)} linked speech ids resolved")
        for key, kinds in links.items():
            for target in kinds.get("division", []):
                if target in divisions:
                    bill_divisions[key].append(divisions[target])
            for target in kinds.get("speech", []):
                row = by_speech_id.get(str(target))
                if row and len(bill_speeches[key]) < SPEECH_CAP:
                    bill_speeches[key].append(speech_entry(row, timeline))
        log(f"bill_links: {len(bill_divisions)} bills with divisions, "
            f"{len(bill_speeches)} with speeches")

    docs: list[dict] = []
    for b in bills:
        divs = sorted(bill_divisions.get(b["key"], []), key=lambda d: (d["date"] or "", d["key"]))
        spk = sorted(bill_speeches.get(b["key"], []), key=lambda s: (s["date"] or "", s["slug"]))
        acts = acts_for_bill(b, act_index)
        if not acts and not legacy:
            # bill_links names an Act by its FRL id (C2013A00009), so read the
            # title and the assent date off ext_frl_acts rather than printing
            # the id where a title belongs.
            acts = [
                {"title": a["title"], "frl_uri": a["frl_uri"], "assent_date": a["assent_date"]}
                for a in (acts_by_id.get(t) for t in links.get(b["key"], {}).get("act", []))
                if a
            ]
        summary = summaries.get(b["key"])
        docs.append({
            "key": b["key"],
            "title": b["title"],
            "short_title": b["short_title"],
            "aliases": b["aliases"],
            "jurisdiction": b["jurisdiction"],
            "parliament": b["parliament"],
            "introduced": b["introduced"],
            "originating_house": b["originating_house"],
            "sponsor": b["sponsor"],
            "sponsors": published_sponsors(b),
            "sponsor_party": b["sponsor_party"],
            "sponsor_person_id": b["sponsor_person_id"],
            "portfolio": b["portfolio"],
            "status": b["status"],
            "status_as_of": b["status_as_of"],
            "passed_both_houses": b["passed_both_houses"],
            "passed_both_houses_date": b["passed_both_houses_date"],
            "royal_assent": b["royal_assent"],
            "act_number": b["act_number"],
            "key_dates": b["key_dates"],
            "sources": sources.get(b["key"], []),
            "summary": summary,
            "divisions": [{k: v for k, v in d.items() if not k.startswith("_")} for d in divs],
            "speeches": spk,
            "acts": acts,
        })

    totals: collections.Counter = collections.Counter()
    for d in divisions.values():
        totals.update(d["party_coverage"])
    review = links_after_last_event(docs)
    log(f"review: {len(review)} division links dated after a finished bill's last event "
        f"({len({r['bill'] for r in review})} bills), listed in index meta")

    generated = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    index = {
        "generated_at": generated,
        "count": len(docs),
        "meta": {
            "mode": "legacy" if legacy else "registry",
            "party_basis": "speech-record",
            "party_basis_note": (
                "A division's party splits read each voter's party at the division's "
                "own date, from the party recorded against that person's speeches. "
                "party_coverage on each division counts the votes that rest on an "
                "observation on or before the day (dated), on that person's earliest "
                "recorded party (earliest), on the members table (member), or on "
                "nothing at all (unknown)."
            ),
            "party_coverage": dict(totals),
            "speech_cap": SPEECH_CAP,
            "match_rule": "docs/SCOPE-BILLS.md s4 title rule" if (legacy or not links) else "bill_links",
            "parliament_floor": PARLIAMENT_STARTS[0],
            "suppressed": len(redirects),
            "review_links_after_last_event": review,
        },
        "bills": sorted([index_row(d) for d in docs], key=index_sort_key, reverse=True),
    }
    if redirects:
        index["redirects"] = dict(sorted(redirects.items()))
    drafts = load_drafts(DRAFTS_PATH)
    if drafts:
        docs, index = merge_drafts(docs, index, drafts)
    return docs, index


def index_row(d: dict) -> dict:
    return {
        "key": d["key"], "title": d["title"], "short_title": d["short_title"],
        "jurisdiction": d["jurisdiction"], "parliament": d["parliament"],
        "introduced": d["introduced"], "originating_house": d["originating_house"],
        "status": d["status"], "status_as_of": d["status_as_of"],
        "passed_both_houses": d.get("passed_both_houses"),
        "passed_both_houses_date": d.get("passed_both_houses_date"),
        "royal_assent": d.get("royal_assent"), "act_number": d.get("act_number"),
        "sponsor": d["sponsor"], "sponsor_party": d["sponsor_party"],
        "sponsor_person_id": d.get("sponsor_person_id"),
        "sponsor_count": len(d.get("sponsors") or []),
        "portfolio": d["portfolio"],
        "has_summary": d["summary"] is not None,
        "summary_version": d["summary"]["version"] if d["summary"] else None,
        "divisions": len(d["divisions"]),
        "speeches": len(d["speeches"]),
        "acts": len(d["acts"]),
    }


def index_sort_key(b: dict) -> tuple:
    return (b["introduced"] or "", b["key"])


# ---------------------------------------------------------------------------
# Exposure drafts (repo file, no database)
# ---------------------------------------------------------------------------


def load_drafts(path: Path) -> list[dict]:
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    drafts = data.get("drafts") if isinstance(data, dict) else data
    return [d for d in (drafts or []) if d.get("key") and d.get("title")]


def draft_doc(d: dict) -> dict:
    """A draft in the projection's own shape. `introduced` carries the release
    date so the index sorts it with the bills; status says what it really is."""
    released = d.get("released")
    consultation = d.get("consultation") or {}
    key_dates = [{
        "stage": "Exposure draft released", "date": released, "house": None,
        "url": consultation.get("url") or next((s.get("url") for s in d.get("sources") or []), None),
    }] if released else []
    if consultation.get("closes"):
        key_dates.append({"stage": "Consultation closes", "date": consultation["closes"], "house": None,
                          "url": consultation.get("url")})
    return {
        "key": d["key"],
        "title": d["title"],
        "short_title": d.get("short_title") or d["title"],
        "aliases": d.get("aliases") or [],
        "jurisdiction": d.get("jurisdiction") or "federal",
        "parliament": d.get("parliament"),
        "introduced": released,
        "originating_house": None,
        "sponsor": d.get("sponsor"),
        "sponsor_party": d.get("sponsor_party"),
        "sponsor_person_id": d.get("sponsor_person_id"),
        "sponsors": ([{"name": d["sponsor"], "person_id": d.get("sponsor_person_id"),
                       "party": d.get("sponsor_party")}] if d.get("sponsor") else []),
        "portfolio": d.get("portfolio"),
        "status": DRAFT_STATUS,
        "status_as_of": d.get("status_as_of") or released,
        "passed_both_houses": None,
        "passed_both_houses_date": None,
        "royal_assent": None,
        "act_number": None,
        "key_dates": key_dates,
        "sources": d.get("sources") or [],
        "summary": d.get("summary"),
        "divisions": [],
        "speeches": [],
        "acts": [],
        "consultation": consultation or None,
        "related": d.get("related") or [],
        "became": d.get("became"),
    }


def merge_drafts(docs: list[dict], index: dict, drafts: list[dict]) -> tuple[list[dict], dict]:
    """Replace every draft in the projection with the current drafts file.
    Registry docs are untouched; a draft no longer in the file disappears."""
    draft_keys = {d["key"] for d in drafts}
    kept = [d for d in docs if d.get("status") != DRAFT_STATUS and d["key"] not in draft_keys]
    draft_docs = [draft_doc(d) for d in drafts]
    docs = kept + draft_docs
    rows = [b for b in index["bills"] if b.get("status") != DRAFT_STATUS and b["key"] not in draft_keys]
    rows += [index_row(d) for d in draft_docs]
    index = {**index, "count": len(rows), "bills": sorted(rows, key=index_sort_key, reverse=True)}
    index["meta"] = {**index.get("meta", {}), "exposure_drafts": len(draft_docs)}
    return docs, index


def merge_drafts_into_dir(out: Path, drafts: list[dict]) -> None:
    """Merge drafts into an existing projection without reading the database:
    the committed portal/public/bills is what is deployed, and drafts change
    more often than the registry is re-exported."""
    index_path = out / "index.json"
    index = json.loads(index_path.read_text())
    stale = [b["key"] for b in index["bills"] if b.get("status") == DRAFT_STATUS]
    for key in stale:
        path = out / f"{key}.json"
        if path.exists():
            path.unlink()
    _, index = merge_drafts([], index, drafts)
    write_index(index_path, index)
    for d in drafts:
        doc = draft_doc(d)
        (out / f"{doc['key']}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n")
    log(f"merged {len(drafts)} exposure draft(s) into {out} (removed {len(stale)} stale)")


def sample_keys(index: dict, n: int) -> set[str]:
    """A spread the UI can build against: every shape at least once, then the
    richest remaining bills, then a stride through the rest. Deterministic."""
    rows = index["bills"]
    if n >= len(rows):
        return {r["key"] for r in rows}
    picked: list[str] = []
    seen: set[str] = set()

    def take(key: str) -> None:
        if key not in seen and len(picked) < n:
            seen.add(key)
            picked.append(key)

    for pred in (
        lambda r: r["has_summary"],
        lambda r: r["divisions"] and r["speeches"] and r["acts"],
        lambda r: r["divisions"] and not r["speeches"],
        lambda r: r["speeches"] and not r["divisions"],
        lambda r: r["acts"],
        lambda r: not (r["divisions"] or r["speeches"] or r["acts"]),
    ):
        for r in rows:
            if pred(r):
                take(r["key"])
                break
    by_year: dict[str, list[dict]] = collections.defaultdict(list)
    for r in rows:
        by_year[(r["introduced"] or "")[:4]].append(r)
    for year in sorted(by_year, reverse=True):
        take(by_year[year][0]["key"])
    for r in sorted(rows, key=lambda r: -(r["divisions"] + r["speeches"])):
        take(r["key"])
    stride = max(1, len(rows) // max(1, n - len(picked) or 1))
    for r in rows[::stride]:
        take(r["key"])
    for r in rows:
        take(r["key"])
    return set(picked)


def write_index(path: Path, index: dict) -> None:
    """Write index.json in the layout that is committed: `json.dumps(indent=1,
    ensure_ascii=False)` plus a newline, so a rerun diffs only where a bill did.

    `generated_at` is a build stamp, not data. If the previous file is identical
    apart from that stamp, its stamp is kept, so a night on which nothing about
    any bill changed leaves the file byte-identical and nothing is committed."""
    if path.exists():
        try:
            previous = json.loads(path.read_text())
        except (OSError, ValueError):
            previous = None
        if isinstance(previous, dict) and previous.get("generated_at"):
            rest = {k: v for k, v in previous.items() if k != "generated_at"}
            if rest == {k: v for k, v in index.items() if k != "generated_at"}:
                index["generated_at"] = previous["generated_at"]
    path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n")


def division_record(directory: Path, key: str) -> dict:
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", key):
        raise ValueError(f"Invalid division key: {key}")
    record = json.loads((directory / f"division-{key}.json").read_text())
    if record.get("key") != key:
        raise ValueError(f"Division identity mismatch: {key}")
    return record


def reconcile_divisions(docs: list[dict], directory: Path) -> None:
    """Refresh shared facts from the published division projection, never the
    older bill/DB copy. Keep bill-only annotations such as stage and title.
    Missing identities fail before anything is written.
    """
    for doc in docs:
        for division in doc.get("divisions", []):
            key = division["key"]
            record = division_record(directory, key)
            for field in list(division):
                if field in record:
                    division[field] = record[field]
            division["ayes"] = record.get("ayes")
            division["noes"] = record.get("noes")
            division["outcome"] = record.get("result")
            division["url"] = record.get("source_url")


def retained_bills(directory: Path) -> tuple[list[dict], dict[str, str]]:
    """Read the indexed snapshot and verify file identities before publication."""
    index = json.loads((directory / "index.json").read_text())
    docs, previous = [], {}
    for row in index["bills"]:
        key = row["key"]
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", key):
            raise ValueError(f"Invalid bill key: {key}")
        path = directory / f"{key}.json"
        previous[key] = path.read_text()
        doc = json.loads(previous[key])
        if doc.get("key") != key:
            raise ValueError(f"Bill identity mismatch: {key}")
        docs.append(doc)
    return docs, previous


def write_retained_bills(directory: Path, docs: list[dict], previous: dict[str, str]) -> int:
    changed = 0
    for doc in docs:
        if doc != json.loads(previous[doc["key"]]):
            content = json.dumps(doc, ensure_ascii=False, indent=1) + "\n"
            (directory / f"{doc['key']}.json").write_text(content)
            changed += 1
    return changed


def normalise_sponsor_labels(directory: Path) -> int:
    """Only decode/map existing labels. Never infer a new sponsor affiliation."""
    def canonical(raw):
        return raw if raw in PUBLISHED_PARTIES else sponsor_party_token(raw)

    docs, previous = retained_bills(directory)
    for doc in docs:
        if "sponsor_party" in doc:
            doc["sponsor_party"] = canonical(doc["sponsor_party"])
        for sponsor in doc.get("sponsors") or []:
            if "party" in sponsor:
                sponsor["party"] = canonical(sponsor["party"])
    index_path = directory / "index.json"
    index = json.loads(index_path.read_text())
    prior_index = json.loads(index_path.read_text())
    by_key = {doc["key"]: doc for doc in docs}
    for row in index["bills"]:
        if "sponsor_party" in row:
            row["sponsor_party"] = by_key[row["key"]].get("sponsor_party")
    changed = write_retained_bills(directory, docs, previous)
    if index != prior_index:
        index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n")
    log(f"normalised existing sponsor party labels in {changed} bill files")
    return changed


def refresh_sponsor_parties(directory: Path, evidence=None) -> tuple[int, list[dict]]:
    """Recheck the retained snapshot without a database, fetch or registry refresh."""
    directory = Path(directory)
    docs, previous = retained_bills(directory)
    # A manual retained refresh keeps main's frozen-evidence behaviour. Fresh
    # database builds and explicit Records projections still require all evidence.
    evidence = vote_parties.load_evidence() if evidence is None else evidence
    held = fill_sponsor_parties(docs, evidence=evidence)
    index_path = directory / "index.json"
    index = json.loads(index_path.read_text())
    by_key = {doc["key"]: doc for doc in docs}
    changed_index = False
    for row in index["bills"]:
        party = by_key[row["key"]].get("sponsor_party")
        if row.get("sponsor_party") != party:
            row["sponsor_party"] = party
            changed_index = True
    changed = write_retained_bills(directory, docs, previous)
    if changed_index:
        index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n")
    log(f"refreshed dated sponsor parties in {changed} bill files; {len(held)} held for review")
    return changed, held


def write_sponsor_party_aliases(path: Path) -> None:
    """One explicit alias table for browser and Worker party URL resolution."""
    block = ("// sponsor-party-aliases:begin\n"
             "// Generated from scripts/export_bills.py SPONSOR_PARTY_TOKENS.\n"
             "const SPONSOR_PARTY_ALIASES = "
             + json.dumps(SPONSOR_PARTY_TOKENS, ensure_ascii=False, indent=2, sort_keys=True)
             + ";\n// sponsor-party-aliases:end")
    text, count = re.subn(r"// sponsor-party-aliases:begin.*?// sponsor-party-aliases:end",
                          lambda _: block, path.read_text(), flags=re.S)
    if count != 1:
        raise ValueError(f"Expected one sponsor party alias block in {path}")
    path.write_text(text)


def check_division_facts(directory: Path, divisions: Path) -> tuple[int, int]:
    """Fail publication when a persisted embedded tally differs from its source."""
    docs, _ = retained_bills(directory)
    records = {}
    bills_checked = links_checked = 0
    for doc in docs:
        if doc.get("divisions"):
            bills_checked += 1
        for embedded in doc.get("divisions", []):
            key = embedded["key"]
            if key not in records:
                records[key] = division_record(divisions, key)
            for field, source_field in (("ayes", "ayes"), ("noes", "noes"), ("outcome", "result")):
                if embedded.get(field) != records[key].get(source_field):
                    raise ValueError(f"Bill division drift: {doc['key']}/{key}/{field}")
            links_checked += 1
    log(f"validated division facts across {bills_checked} bills and {links_checked} links")
    return bills_checked, links_checked


def refresh_division_facts(directory: Path, divisions: Path) -> int:
    """Reconcile and validate the retained snapshot after standalone publication.
    No source acquisition, database access or new source-check timestamp.
    Validate every join before writing any bill file, then check persisted facts.
    """
    docs, previous = retained_bills(directory)
    reconcile_divisions(docs, divisions)
    changed = write_retained_bills(directory, docs, previous)
    check_division_facts(directory, divisions)
    log(f"reconciled division facts in {changed} bill files")
    return changed


def write_out(docs: list[dict], index: dict, out: Path, sample: int | None) -> None:
    out.mkdir(parents=True, exist_ok=True)
    keys = sample_keys(index, sample) if sample else None
    if keys is not None:
        index["meta"]["sample"] = {
            "files": len(keys),
            "note": "A fixture: index.json lists every bill, only these keys have a file.",
        }
    write_index(out / "index.json", index)
    written = 0
    for d in docs:
        if keys is not None and d["key"] not in keys:
            continue
        path = out / f"{d['key']}.json"
        if path.exists():
            preserve_speech_briefs(d, json.loads(path.read_text()))
        path.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
        written += 1
    # A suppressed duplicate (bills-008) leaves the projection; its address
    # redirects through index.json, so its old file must not linger.
    for key, target in sorted((index.get("redirects") or {}).items()):
        path = out / f"{key}.json"
        if path.exists():
            path.unlink()
            log(f"removed {path.name}: reviewed duplicate of {target}")
    log(f"wrote {written} bill files + index.json to {out}")


def preserve_speech_briefs(doc: dict, previous: dict) -> None:
    """Registry refreshes do not produce briefs; retain them for the same speech.

    Removed or reassigned speech links are never restored, and a supplied new
    brief wins. Identity/date/speaker checks prevent a brief crossing records.
    """
    if previous.get('key') != doc.get('key'):
        return
    prior = {s.get('slug'): s for s in previous.get('speeches', []) if s.get('slug')}
    for speech in doc.get('speeches', []):
        old = prior.get(speech.get('slug'), {})
        if (not speech.get('brief') and old.get('brief')
                and all(speech.get(k) == old.get(k) for k in ('speaker', 'date', 'state'))):
            speech['brief'] = old['brief']


# ---------------------------------------------------------------------------
# Phase two: speech briefs from the knowledge box
# ---------------------------------------------------------------------------


# A speech with no brief yet is cached as None. The enrichment Worker writes
# briefs onto recent speeches after the first export, so None is not final:
# each run re-asks the box for the speeches that are still empty, but bounded.
#   tier A  speeches dated in the last RECENT_DAYS: every one, each run
#           (enrichment works newest-first, so these are the ones about to land)
#   tier B  older empty speeches: the RECHECK_LIMIT least recently checked
# Neither tier re-asks about a slug checked within RECHECK_HOURS. The time a
# None was last checked lives beside the cache (<cache>.checked.json) so the
# cache file itself keeps its {slug: brief-or-null} shape.
BRIEF_RECHECK_HOURS = 20
BRIEF_RECHECK_LIMIT = 1500
BRIEF_RECENT_DAYS = 60
BRIEF_RECENT_CAP = 4000
BRIEF_FETCH_ATTEMPTS = 3


def _read_json_dict(path: Path) -> dict:
    if not path.exists():
        return {}
    data = json.loads(path.read_text())
    return data if isinstance(data, dict) else {}


def _write_json_atomic(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False))
    os.replace(tmp, path)


def checked_path(cache_path: Path) -> Path:
    return cache_path.with_name(cache_path.stem + ".checked.json")


def plan_brief_fetches(speeches: dict[str, str], cache: dict, checked: dict, now: float,
                       today: str, recheck_hours: float = BRIEF_RECHECK_HOURS,
                       recheck_limit: int = BRIEF_RECHECK_LIMIT,
                       recent_days: int = BRIEF_RECENT_DAYS,
                       recent_cap: int = BRIEF_RECENT_CAP) -> tuple[list[str], list[str]]:
    """Which slugs to ask the box about: (never asked, empty and due a recheck)."""
    new = [slug for slug in speeches if slug not in cache]
    due = [slug for slug, brief in cache.items()
           if brief is None and slug in speeches
           and now - float(checked.get(slug, 0)) >= recheck_hours * 3600]
    cutoff = (datetime.fromisoformat(today) - timedelta(days=recent_days)).date().isoformat()
    recent = sorted((s for s in due if (speeches[s] or "") >= cutoff),
                    key=lambda s: speeches[s], reverse=True)[:recent_cap]
    older = sorted((s for s in due if (speeches[s] or "") < cutoff),
                   key=lambda s: (float(checked.get(s, 0)), s))[:recheck_limit]
    return new, recent + older


def fill_briefs(out: Path, cache_path: Path, workers: int = 8,
                recheck_hours: float = BRIEF_RECHECK_HOURS,
                recheck_limit: int = BRIEF_RECHECK_LIMIT,
                recent_days: int = BRIEF_RECENT_DAYS, kb=None, now: float | None = None) -> dict:
    """Attach the box's speech briefs to every bill file. Returns counters; `failed`
    is the number of slugs the box could not answer for (their files are left as
    they were, never blanked)."""
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from parli.arag import AragConfig, AragError, KbClient, load_dotenv  # noqa: E402

    if kb is None:
        load_dotenv()
        kb = KbClient(AragConfig.from_env())

    now = time.time() if now is None else now
    today = datetime.fromtimestamp(now, timezone.utc).date().isoformat()
    cache: dict[str, str | None] = _read_json_dict(cache_path)
    checked: dict[str, float] = _read_json_dict(checked_path(cache_path))
    files = sorted(p for p in out.glob("*.json") if p.name != "index.json")
    speeches: dict[str, str] = {}
    for p in files:
        for s in json.loads(p.read_text()).get("speeches", []):
            speeches.setdefault(s["slug"], s.get("date") or "")
    new, recheck = plan_brief_fetches(speeches, cache, checked, now, today, recheck_hours,
                                      recheck_limit, recent_days)
    wanted = new + recheck
    log(f"{len(files)} bill files; {len(cache)} briefs cached, {len(new)} new to fetch, "
        f"{len(recheck)} empty ones to recheck")

    def fetch(slug: str) -> tuple[str, str | None, bool]:
        for attempt in range(BRIEF_FETCH_ATTEMPTS):
            try:
                data = kb.get_text_field_by_slug(slug, BRIEF_FIELD)
            except AragError as e:
                if e.status in (404, 422):
                    return slug, None, True  # no brief on that speech, or no such resource
                if attempt + 1 < BRIEF_FETCH_ATTEMPTS:
                    time.sleep(2 ** attempt)
                    continue
                log(f"  brief fetch failed for {slug}: {e}")
                return slug, None, False
            return slug, (((data.get("value") or {}).get("body")) or "").strip() or None, True
        return slug, None, False

    def save() -> None:
        _write_json_atomic(cache_path, cache)
        _write_json_atomic(checked_path(cache_path), checked)

    failed = filled_now = 0
    if wanted:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            for i, (slug, brief, ok) in enumerate(pool.map(fetch, wanted), 1):
                if not ok:
                    failed += 1
                elif brief is None:
                    cache[slug] = None
                    checked[slug] = now
                else:
                    if cache.get(slug) is None and slug in cache:
                        filled_now += 1
                    cache[slug] = brief
                    checked.pop(slug, None)
                if i % 200 == 0:
                    log(f"  {i}/{len(wanted)}")
                    save()
        save()

    touched = filled = 0
    for p in files:
        doc = json.loads(p.read_text())
        changed = False
        for s in doc.get("speeches", []):
            if s["slug"] not in cache:
                continue  # the box did not answer; keep what the file already has
            brief = cache[s["slug"]]
            if brief != s.get("brief"):
                s["brief"] = brief
                changed = True
            if brief:
                filled += 1
        if changed:
            p.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n")
            touched += 1
    log(f"briefs: {filled} attached across {len(files)} files ({touched} rewritten); "
        f"{filled_now} empty speeches gained a brief; {failed} fetches failed")
    return {"files": len(files), "attached": filled, "rewritten": touched,
            "new": len(new), "rechecked": len(recheck), "gained": filled_now, "failed": failed}


# ---------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser(description="Project the bill registry into portal/public/bills/")
    ap.add_argument("--db", default=DB_URI, help="read-only sqlite URI")
    ap.add_argument("--out", default="portal/public/bills", help="output directory")
    ap.add_argument("--divisions", default="portal/public/divisions",
                    help="standalone division projection supplying shared bill facts")
    ap.add_argument("--party-tokens", type=Path, default=Path("portal/public/facts/sponsor-parties.json"),
                    help="canonical sponsor party tokens consumed by the portal")
    ap.add_argument("--refresh-division-facts", type=Path, metavar="DIR",
                    help="refresh retained bill division facts from standalone records, without a DB or fetch")
    ap.add_argument("--check-division-facts", type=Path, metavar="DIR",
                    help="verify all retained bill tallies against standalone records, without a DB or fetch")
    ap.add_argument("--normalise-sponsor-labels", type=Path, metavar="DIR",
                    help="decode/map existing sponsor party labels without inferring affiliations or fetching")
    ap.add_argument("--refresh-sponsor-parties", type=Path, metavar="DIR",
                    help="check retained sponsor labels against held dated records, without a DB or fetch")
    ap.add_argument("--party-aliases", type=Path, default=Path("portal/public/party-page.js"),
                    help="party URL module containing the generated sponsor party aliases")
    ap.add_argument("--legacy", action="store_true",
                    help="read bills/bill_progress and join by title (before bills_v2 lands)")
    ap.add_argument("--sample", type=int, default=None,
                    help="write only N bill files (index.json still lists every bill)")
    ap.add_argument("--fill-briefs", metavar="DIR",
                    help="second phase: attach knowledge-box speech briefs to an existing export")
    ap.add_argument("--brief-cache", default=str(DEFAULT_BRIEF_CACHE))
    ap.add_argument("--recheck-hours", type=float, default=BRIEF_RECHECK_HOURS,
                    help="fill-briefs: do not re-ask about an empty speech checked more recently than this")
    ap.add_argument("--recheck-limit", type=int, default=BRIEF_RECHECK_LIMIT,
                    help="fill-briefs: at most this many older empty speeches are re-asked per run")
    ap.add_argument("--recent-days", type=int, default=BRIEF_RECENT_DAYS,
                    help="fill-briefs: speeches dated within this many days are always re-asked")
    ap.add_argument("--max-failures", type=int, default=25,
                    help="fill-briefs: exit 1 if more than this many fetches failed")
    ap.add_argument("--merge-drafts", metavar="DIR",
                    help="merge scripts/bills_registry/exposure_drafts.json into an existing export (no database)")
    ap.add_argument("--drafts", default=str(DRAFTS_PATH), help="exposure drafts file")
    args = ap.parse_args()

    if args.refresh_sponsor_parties:
        refresh_sponsor_parties(args.refresh_sponsor_parties)
        write_sponsor_party_aliases(args.party_aliases)
        return 0
    if args.normalise_sponsor_labels:
        normalise_sponsor_labels(args.normalise_sponsor_labels)
        return 0
    if args.check_division_facts:
        check_division_facts(args.check_division_facts, Path(args.divisions))
        return 0
    if args.refresh_division_facts:
        refresh_division_facts(args.refresh_division_facts, Path(args.divisions))
        return 0
    if args.fill_briefs:
        stats = fill_briefs(Path(args.fill_briefs), Path(args.brief_cache),
                            recheck_hours=args.recheck_hours, recheck_limit=args.recheck_limit,
                            recent_days=args.recent_days)
        return 1 if stats["failed"] > args.max_failures else 0
    if args.merge_drafts:
        merge_drafts_into_dir(Path(args.merge_drafts), load_drafts(Path(args.drafts)))
        return 0

    db = connect(args.db)
    try:
        if not args.legacy and not has_table(db, "bills_v2"):
            log("bills_v2 is not in the database yet -- rerun with --legacy, or wait "
                "for the registry agent")
            return 2
        docs, index = build(db, args.legacy)
        write_out(docs, index, Path(args.out), args.sample)
        args.party_tokens.parent.mkdir(parents=True, exist_ok=True)
        args.party_tokens.write_text(json.dumps(sorted(PUBLISHED_PARTIES), ensure_ascii=False, indent=1) + "\n")
        write_sponsor_party_aliases(args.party_aliases)
    finally:
        db.rollback()
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
