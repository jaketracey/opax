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
writes the briefs back into the files.

Read-only throughout: the connection is opened `mode=ro` with
`PRAGMA query_only=ON`, and the whole read runs in one transaction.
"""

import argparse
import bisect
import collections
import hashlib
import json
import os
import re
import sqlite3
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

DB_URI = "file:/home/jake/.cache/autoresearch/parli.db?mode=ro"
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
    return HOUSE_CODE.get((raw or "").strip().lower()) or (raw or None)


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
        assent = max((e["date"] for e in evs if e["stage"] == "royal_assent" and e["date"]), default=None)
        last = max((e["date"] for e in evs if e["date"]), default=None)
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
            "sponsor": None,
            "sponsor_party": None,
            "sponsor_person_id": None,
            "portfolio": r["portfolio"] or None,
            "status": r["status"],
            "status_raw": r["status"],
            "status_as_of": last,
            "assent": assent,
            "key_dates": [
                {"stage": e["stage"], "date": e["date"], "house": e["house"], "url": e["url"]}
                for e in evs
            ],
        })
    return bills


def load_v2_bills(db: sqlite3.Connection) -> list[dict]:
    """`bills_v2` + `bill_events`, the registry agent's tables."""
    events: dict[str, list[dict]] = collections.defaultdict(list)
    if has_table(db, "bill_events"):
        for r in db.execute(
            "SELECT bill_key, stage, date, house, source_url FROM bill_events "
            "ORDER BY bill_key, date"
        ):
            events[r["bill_key"]].append({
                "stage": r["stage"], "date": r["date"],
                "house": house_code(r["house"]), "url": r["source_url"],
            })
    bills = []
    for r in db.execute("SELECT * FROM bills_v2 ORDER BY bill_key"):
        row = dict(r)
        evs = events.get(row["bill_key"], [])
        assent = max(
            (e["date"] for e in evs
             if e["date"] and "assent" in (e["stage"] or "").lower()),
            default=None,
        )
        # aliases_json is a list of alias titles per the contract, but the
        # registry currently writes an object of listing extras for ParlInfo
        # rows. Read either, and take the source's own sponsor party when the
        # object carries one -- that is the party as the bill page printed it,
        # which beats anything derived here.
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
            "sponsor": row.get("sponsor_name"),
            "sponsor_party": extras.get("sponsor_party") or None,
            "sponsor_person_id": row.get("sponsor_person_id"),
            "portfolio": row.get("portfolio"),
            "status": row.get("status"),
            "status_raw": row.get("status_raw"),
            "status_as_of": row.get("status_as_of") or max((e["date"] for e in evs if e["date"]), default=None),
            "assent": assent,
            "key_dates": [
                {"stage": e["stage"], "date": e["date"], "house": e["house"], "url": e["url"]}
                for e in evs
            ],
        })
    return bills


def fill_sponsor_parties(bills: list[dict], timeline: PartyTimeline) -> None:
    """The sponsor's party on the day they introduced the bill, for the
    `sponsor_party/<party>` label."""
    for b in bills:
        if not b.get("sponsor_party") and b.get("sponsor_person_id"):
            party, how = timeline.at(b["sponsor_person_id"], b.get("introduced"))
            b["sponsor_party"] = None if how == "unknown" else party


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

    out: dict[str, dict] = {}
    for r in db.execute(
        "SELECT id, house, date, name, question, ayes_count, noes_count, result, source_url "
        "FROM ext_divisions WHERE jurisdiction='federal'"
    ):
        out[r["id"]] = {
            "key": r["id"],
            "date": r["date"],
            "house": r["house"],
            "question": (r["question"] or r["name"] or "").strip() or None,
            "stage": division_stage(r["name"]),
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
    for r in db.execute(
        "SELECT bill_key, kind, target_key FROM bill_links "
        "WHERE COALESCE(audited,'') != 'wrong'"
    ):
        out[r["bill_key"]][r["kind"]].append(r["target_key"])
    return out


# ---------------------------------------------------------------------------
# Projection
# ---------------------------------------------------------------------------


def build(db: sqlite3.Connection, legacy: bool) -> tuple[list[dict], dict]:
    timeline = PartyTimeline.load(db)

    bills = load_legacy_bills(db) if legacy else load_v2_bills(db)
    log(f"registry: {len(bills)} bills")
    fill_sponsor_parties(bills, timeline)

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
            "sponsor_party": b["sponsor_party"],
            "sponsor_person_id": b["sponsor_person_id"],
            "portfolio": b["portfolio"],
            "status": b["status"],
            "status_as_of": b["status_as_of"],
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
        },
        "bills": sorted(
            [
                {
                    "key": d["key"], "title": d["title"], "short_title": d["short_title"],
                    "jurisdiction": d["jurisdiction"], "parliament": d["parliament"],
                    "introduced": d["introduced"], "originating_house": d["originating_house"],
                    "status": d["status"], "status_as_of": d["status_as_of"],
                    "sponsor": d["sponsor"], "sponsor_party": d["sponsor_party"],
                    "portfolio": d["portfolio"],
                    "has_summary": d["summary"] is not None,
                    "summary_version": d["summary"]["version"] if d["summary"] else None,
                    "divisions": len(d["divisions"]),
                    "speeches": len(d["speeches"]),
                    "acts": len(d["acts"]),
                }
                for d in docs
            ],
            key=lambda b: (b["introduced"] or "", b["key"]),
            reverse=True,
        ),
    }
    return docs, index


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
    """One bill per line inside an ordinary JSON array. Indenting five thousand
    rows would add a megabyte the browser has to download and the reviewer has
    to scroll; one line each keeps the file small and still diffs cleanly."""
    head = {k: v for k, v in index.items() if k != "bills"}
    body = json.dumps(head, ensure_ascii=False, indent=1)[:-2].rstrip()  # drop closing brace
    rows = ",\n  ".join(
        json.dumps(b, ensure_ascii=False, separators=(",", ":")) for b in index["bills"]
    )
    path.write_text(f"{body},\n \"bills\": [\n  {rows}\n ]\n}}\n")


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
        (out / f"{d['key']}.json").write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
        written += 1
    log(f"wrote {written} bill files + index.json to {out}")


# ---------------------------------------------------------------------------
# Phase two: speech briefs from the knowledge box
# ---------------------------------------------------------------------------


def fill_briefs(out: Path, cache_path: Path, workers: int = 8) -> None:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from parli.arag import AragConfig, AragError, KbClient, load_dotenv  # noqa: E402

    load_dotenv()
    kb = KbClient(AragConfig.from_env())

    cache: dict[str, str | None] = {}
    if cache_path.exists():
        cache = json.loads(cache_path.read_text())
    files = sorted(p for p in out.glob("*.json") if p.name != "index.json")
    wanted: list[str] = []
    for p in files:
        for s in json.loads(p.read_text()).get("speeches", []):
            if s["slug"] not in cache and s["slug"] not in wanted:
                wanted.append(s["slug"])
    log(f"{len(files)} bill files; {len(cache)} briefs cached, {len(wanted)} to fetch")

    def fetch(slug: str) -> tuple[str, str | None]:
        try:
            data = kb.get_text_field_by_slug(slug, BRIEF_FIELD)
        except AragError as e:
            if e.status in (404, 422):
                return slug, None  # no brief on that speech, or no such resource
            raise
        return slug, (((data.get("value") or {}).get("body")) or "").strip() or None

    if wanted:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            for i, (slug, brief) in enumerate(pool.map(fetch, wanted), 1):
                cache[slug] = brief
                if i % 200 == 0:
                    log(f"  {i}/{len(wanted)}")
                    cache_path.parent.mkdir(parents=True, exist_ok=True)
                    cache_path.write_text(json.dumps(cache, ensure_ascii=False))
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(cache, ensure_ascii=False))

    touched = filled = 0
    for p in files:
        doc = json.loads(p.read_text())
        changed = False
        for s in doc.get("speeches", []):
            brief = cache.get(s["slug"])
            if brief != s.get("brief"):
                s["brief"] = brief
                changed = True
            if brief:
                filled += 1
        if changed:
            p.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n")
            touched += 1
    log(f"briefs: {filled} attached across {len(files)} files ({touched} rewritten)")


# ---------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser(description="Project the bill registry into portal/public/bills/")
    ap.add_argument("--db", default=DB_URI, help="read-only sqlite URI")
    ap.add_argument("--out", default="portal/public/bills", help="output directory")
    ap.add_argument("--legacy", action="store_true",
                    help="read bills/bill_progress and join by title (before bills_v2 lands)")
    ap.add_argument("--sample", type=int, default=None,
                    help="write only N bill files (index.json still lists every bill)")
    ap.add_argument("--fill-briefs", metavar="DIR",
                    help="second phase: attach knowledge-box speech briefs to an existing export")
    ap.add_argument("--brief-cache", default=str(DEFAULT_BRIEF_CACHE))
    args = ap.parse_args()

    if args.fill_briefs:
        fill_briefs(Path(args.fill_briefs), Path(args.brief_cache))
        return 0

    db = connect(args.db)
    try:
        if not args.legacy and not has_table(db, "bills_v2"):
            log("bills_v2 is not in the database yet -- rerun with --legacy, or wait "
                "for the registry agent")
            return 2
        docs, index = build(db, args.legacy)
        write_out(docs, index, Path(args.out), args.sample)
    finally:
        db.rollback()
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
