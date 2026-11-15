#!/usr/bin/env python3
"""
Export portal/public/people/firsts.json: for each person in the shipped roster
(portal/public/parliamentarians.json), the first speech and the first division
the record holds for them, each with its date and its source.

  OPAX_DB=~/.cache/autoresearch/parli.db python3 scripts/export_people_firsts.py > portal/public/people/firsts.json

Read-only: parli.db is opened with mode=ro and never written, and the roster is
read, never rewritten. The roster's bytes and the curated roster scripts are not
touched; this is a side file the roster's readers never see.

What counts

  first speech    the earliest speech under the corpus rule the roster itself is
                  counted under (parli/ingest/arag_sync.py: on or after
                  DEFAULT_SINCE, MIN_SPEECH_CHARS or longer, the junk and dedupe
                  predicates), spoken in a chamber. Committee hearings and
                  witness testimony are never counted. The speech belongs to a
                  roster row when its speaker (the roster's own rule: the
                  evidenced identity, else normalize_speaker) is that row's
                  name, one of its `aliases` or one of its `prints`, AND the
                  speech's parliament and chamber are among the row's own
                  `states` and `chambers`, AND no other roster row can claim it
                  the same way. A row with a `speech_scope` (a namesake split by
                  service dates) or `roster_only` gets none.
  first division  the earliest division in which the person is recorded voting
                  aye or no. Federal: the legacy votes/divisions tables
                  (They Vote For You), joined on the roster row's numeric `pid`.
                  State: ext_votes/ext_divisions, joined on the normalised name
                  with the same parliament-and-chamber and one-claimant rule. A
                  division with no https source address is not published, nor
                  a federal one with no number (its address would be the whole
                  sitting day's page, not the division).

"First" is a claim, so it is made only when the record can carry it

  Each fact names the chamber it happened in, and meta.coverage gives, per chamber, the date the record of
  speeches and the record of divisions start. That date is read from the database, never a constant, with a
  density floor so one stray early row cannot move it: it is the first date held in the first calendar year
  that has at least COVERAGE_MIN_DAYS distinct days of rows for that chamber. A chamber with no such year has
  no coverage start (and so no firsts). meta.coverage_earliest_row gives the bare earliest date beside it, so
  the two can be compared.

  A fact is marked `"first": true` only when ALL of these hold:

    - the roster row has a `pid`, and exactly one Parliamentary Handbook person (ext_handbook_people, loaded by
      parli/ingest/handbook.py) is matched to it. The Handbook's service history start is the person's
      first-ever entry to the federal parliament, whichever chamber and however many times they returned. The
      members table is NOT used for this: it holds one row per person, with the dates and chamber of their
      latest membership, so a member who returned or changed chamber would look newly arrived;
    - the Handbook lists that person in one chamber only, the fact's chamber (a person who sat in both is
      never marked: their first in one chamber is not their first in parliament);
    - the service start is on or after that chamber's coverage start (their whole service is inside the record);
    - the members table does not date their entry before the Handbook's start (the two sources must not disagree
      that way);
    - the fact is on or after the service start, and within FIRST_WINDOW_DAYS of it. A first speech or division
      long after the start means the record was thin when they arrived, and it cannot say this was their first.

  Two limits, for whoever reviews an export. The coverage floor is per calendar year: it does not prove the
  record has no gap inside one person's first FIRST_WINDOW_DAYS, so a first can still be a speech the record
  happens to hold after one it lost. And the rule rests on the Handbook's service history start being the
  first-ever entry; check that against returning members in the first real export.

  The Handbook table holds people who sat in recent parliaments only, so earlier members, and every state
  member, are never marked. Anything not marked is published without `first`: readers call it the earliest
  speech or division in the OPAX record and say from when (meta.coverage for the fact's chamber), or leave it
  out, and never call it a first. Nothing here ranks or compares people.

Output (compact JSON; by_pid and by_name are written in key order, so an unchanged database writes the same
bytes apart from meta.generated):

  {"meta": {"schema": 1, "generated": "2026-11-15", "roster_generated": "2026-11-14",
            "speeches_since": "1993-03-13",               # the corpus rule's floor
            "coverage": {"speeches": {"representatives": "1998-03-02", "nsw_la": "..."},
                         "divisions": {"representatives": "2006-02-07", "senate": "..."}},
            "coverage_earliest_row": {"speeches": {...}, "divisions": {...}},   # the bare earliest date, to compare
            "coverage_min_days": 10, "first_window_days": 366,
            "people": 1234, "first_speeches": 1200, "first_divisions": 800,   # facts held, first or earliest
            "marked_first": {"speeches": 300, "divisions": 250},
            "sources": {"speech": "Hansard, as held in the OPAX record",
                        "divisions": {"theyvoteforyou": "They Vote For You", ...}},
            "notes": [...]},
   "by_pid":  {"10007": {"service_from": "2007-11-24",
                         "first_speech": {"date": "2008-02-12", "chamber": "representatives", "first": true,
                                          "slug": "speech-123"},
                         "first_division": {"date": "2008-02-13", "chamber": "representatives", "first": true,
                                            "source": "theyvoteforyou",
                                            "url": "https://theyvoteforyou.org.au/divisions/representatives/2008-02-13/1"}}},
   "by_name": {"A Person With No Roster Id": {"first_speech": {"date": "...", "chamber": "nsw_la", "slug": "..."}}}}

A roster row with a `pid` is under by_pid and nowhere else; a row without one is under by_name by its exact
roster `name` (and, having no entry date, is never marked first). A person with neither fact is absent.
`slug` is the speech's document (/doc/<slug> on the site and in the apps). The keys `first_speech` and
`first_division` name the slot, not the claim: only `"first": true` makes the claim.
Fields are only ever added; a reader must ignore what it does not know.
"""

import json
import os
import re
import sqlite3
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from parli.ingest.arag_sync import (  # noqa: E402
    DEDUPE_PREDICATES, DEFAULT_SINCE, JUNK_PREDICATES, MIN_SPEECH_CHARS, prepare_dedupe,
)
from parli.ingest.speaker_identity import identity_for  # noqa: E402
from parli.ingest.speaker_names import normalize_speaker  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = "file:" + (os.environ.get("OPAX_DB") or os.path.expanduser("~/.cache/autoresearch/parli.db")) + "?mode=ro"
ROSTER = os.environ.get("OPAX_ROSTER_PREVIOUS") or os.path.join(ROOT, "portal", "public", "parliamentarians.json")

SCHEMA = 1
# How long after entering a chamber a speech or division can still be called the person's first (see the docstring).
FIRST_WINDOW_DAYS = 366
# A chamber's record starts in the first calendar year with at least this many distinct days of rows.
COVERAGE_MIN_DAYS = 10
SPEECH_SOURCE = "Hansard, as held in the OPAX record"
# ext_divisions.source / the legacy federal tables -> who published the division.
DIVISION_SOURCES = {
    "theyvoteforyou": "They Vote For You",
    "nsw_hansard_api": "Parliament of New South Wales Hansard",
    "vic_hansard_pdf": "Parliament of Victoria Hansard",
    "qld_record_of_proceedings_pdf": "Queensland Parliament Record of Proceedings",
}
FEDERAL_HOUSES = ("representatives", "senate")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
URL_RE = re.compile(r"^https://[^\s\"<>]+$")
NOTES = [
    "A fact is marked first only when the person first entered parliament on or after the date its chamber's record starts.",
    "Any other fact is the earliest the record holds, not a first; coverage gives the date each record starts.",
    "Speeches are those made in a chamber; committee hearings and witness testimony are not counted.",
    "A division counts when the person is recorded voting aye or no.",
    "A record's start is the first day of its first year with enough days of rows; gaps after that are not checked.",
]


def coverage_start(days, floor=None):
    """(the coverage start, the bare earliest day) for one chamber's set of ISO days; the start is None when no
    calendar year holds `floor` distinct days. See "First is a claim" in the module docstring."""
    floor = COVERAGE_MIN_DAYS if floor is None else floor
    by_year = {}
    for day in days:
        by_year.setdefault(day[:4], set()).add(day)
    dense = sorted(year for year, held in by_year.items() if len(held) >= floor)
    return (min(by_year[dense[0]]) if dense else None), (min(days) if days else None)


def fold(name):
    return (name or "").casefold()


def claims(roster):
    """folded name -> the roster rows that answer to it (name, aliases, prints), for the one-claimant rule."""
    index = {}
    for i, row in enumerate(roster):
        for name in {row.get("name"), *(row.get("aliases") or ()), *(row.get("prints") or ())}:
            if isinstance(name, str) and name:
                index.setdefault(fold(name), []).append(i)
    return index


def claimant(index, roster, name, state, chamber):
    """The one roster row this name can mean in this parliament and chamber, else None."""
    found = [i for i in index.get(fold(name), ())
             if state in (roster[i].get("states") or ()) and chamber in (roster[i].get("chambers") or ())]
    return found[0] if len(found) == 1 else None


def first_speeches(db, roster):
    """({roster index: (date, speech_id, chamber)}, {chamber: set of days with a speech}) under the corpus rule."""
    stdout, sys.stdout = sys.stdout, sys.stderr  # prepare_dedupe prints its progress line
    try:
        prepare_dedupe(db, DEFAULT_SINCE)
    finally:
        sys.stdout = stdout
    columns = {r[1] for r in db.execute("PRAGMA table_info(speeches)")}
    opt = lambda c: c if c in columns else "NULL"  # noqa: E731
    # COALESCE throughout: a NULL in either column must not turn the whole NOT (...) into NULL and drop the row.
    witness = "COALESCE(witness_name, '') != ''" if "witness_name" in columns else "0"
    if "speaker_type" in columns:
        witness += " OR COALESCE(speaker_type, '') = 'witness'"
    where = (f"text IS NOT NULL AND LENGTH(text) >= {MIN_SPEECH_CHARS} AND date >= {DEFAULT_SINCE!r} "
             f"{JUNK_PREDICATES} {DEDUPE_PREDICATES} AND NOT ({witness}) "
             "AND COALESCE(chamber, '') != '' AND COALESCE(chamber, '') NOT LIKE '%committee%'")
    rows = db.execute(f"""
        SELECT speaker_name, person_id, party, COALESCE(state, 'federal'), chamber, substr(date, 1, 10),
               {opt('speaker_type')}, {opt('source')}, {opt('electorate')}, MIN(speech_id)
        FROM speeches WHERE {where}
        GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9""")
    index = claims(roster)
    barred = {i for i, row in enumerate(roster) if row.get("speech_scope") or row.get("roster_only")}
    best, coverage = {}, {}
    for speaker, pid, party, state, chamber, day, speaker_type, source, electorate, speech_id in rows:
        if not DATE_RE.match(day or ""):
            continue
        coverage.setdefault(chamber, set()).add(day)
        person = identity_for(dict(speaker_name=speaker, person_id=pid, party=party, state=state, chamber=chamber,
                                   date=day, source=source, electorate=electorate, speaker_type=speaker_type,
                                   witness_name=None))
        name = person["name"] if person else normalize_speaker(speaker)
        if not name:
            continue
        i = claimant(index, roster, name, state, chamber)
        if i is None or i in barred:
            continue
        found = (day, speech_id, chamber)
        if i not in best or found < best[i]:
            best[i] = found
    return best, coverage


def _tables(db):
    return {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}


def first_divisions(db, roster):
    """({roster index: (date, number, id, source, url, house)}, {house: set of days with a division})."""
    best, since = {}, {}

    def offer(i, found):
        if i not in best or found[:3] < best[i][:3]:
            best[i] = found

    tables = _tables(db)
    if {"votes", "divisions"} <= tables:
        federal = ("COALESCE(d.state, 'federal') = 'federal'"
                   if "state" in {r[1] for r in db.execute("PRAGMA table_info(divisions)")} else "1")
        by_pid = {row["pid"]: i for i, row in enumerate(roster)
                  if isinstance(row.get("pid"), str) and row["pid"].isdigit()}
        for house, held in db.execute(f"SELECT DISTINCT d.house, substr(d.date, 1, 10) FROM divisions d "
                                      f"WHERE d.date IS NOT NULL AND {federal} AND d.house IN {FEDERAL_HOUSES!r}"):
            if held and DATE_RE.match(held):
                since.setdefault(house, set()).add(held)
        for pid, day, number, division_id, house in db.execute(f"""
                SELECT v.person_id, substr(d.date, 1, 10), COALESCE(d.number, 0), d.division_id, d.house
                FROM votes v JOIN divisions d ON d.division_id = v.division_id
                WHERE v.vote IN ('aye', 'no') AND d.date IS NOT NULL AND {federal}"""):
            if not DATE_RE.match(day or "") or house not in FEDERAL_HOUSES:
                continue
            i = by_pid.get(str(pid))
            if i is None:
                continue
            if not number:
                continue  # the address would be the sitting day's page, not this division
            url = f"https://theyvoteforyou.org.au/divisions/{house}/{day}/{number}"
            offer(i, (day, number, f"{division_id:012d}" if isinstance(division_id, int) else str(division_id),
                      "theyvoteforyou", url, house))
    if {"ext_votes", "ext_divisions"} <= tables:
        index = claims(roster)
        for jurisdiction, house, name, day, number, division_id, source, url in db.execute("""
                SELECT v.jurisdiction, v.house, v.person_name, substr(v.date, 1, 10), COALESCE(d.number, 0), d.id,
                       d.source, d.source_url
                FROM ext_votes v JOIN ext_divisions d ON d.id = v.division_id
                WHERE v.jurisdiction != 'federal' AND v.vote IN ('aye', 'no')
                GROUP BY v.jurisdiction, v.house, v.person_name, v.date, d.number, d.id"""):
            if not DATE_RE.match(day or ""):
                continue
            since.setdefault(house, set()).add(day)
            if source not in DIVISION_SOURCES or not URL_RE.match(url or ""):
                continue
            i = claimant(index, roster, name, jurisdiction, house)
            if i is not None:
                offer(i, (day, number, str(division_id), source, url, house))
    return best, since


def _iso(value):
    value = (value or "")[:10]
    if not DATE_RE.match(value):
        return None
    try:
        date.fromisoformat(value)
    except ValueError:
        return None
    return value


def service_starts(db, roster):
    """{roster index: (first-ever entry to parliament, the one chamber sat in or "both")} from the Parliamentary
    Handbook table, for roster rows with a `pid` that exactly one Handbook person is matched to. A row whose
    members-table entry date is earlier than the Handbook's start is left out: the sources disagree."""
    tables = _tables(db)
    if "ext_handbook_people" not in tables:
        return {}
    by_pid = {row["pid"]: i for i, row in enumerate(roster) if isinstance(row.get("pid"), str) and row["pid"]}
    matched = {}
    for pid, chamber, start in db.execute(
            "SELECT person_id, chamber, service_start FROM ext_handbook_people WHERE person_id IS NOT NULL"):
        matched.setdefault(str(pid), []).append((_iso(start), chamber))
    entered = {}
    if "members" in tables and {"person_id", "entered_house"} <= {r[1] for r in db.execute("PRAGMA table_info(members)")}:
        entered = {str(pid): _iso(day) for pid, day in db.execute("SELECT person_id, entered_house FROM members")}
    found = {}
    for pid, people in matched.items():
        i = by_pid.get(pid)
        if i is None or len(people) != 1:
            continue
        start, chamber = people[0]
        if not start or not chamber or (entered.get(pid) and entered[pid] < start):
            continue
        found[i] = (start, chamber)
    return found


def is_first(day, chamber, service, coverage):
    """Whether the record can call this fact the person's first; see "First is a claim" in the docstring.
    `service` is (first-ever entry, chamber) and `coverage` {chamber: start or None}."""
    if not service or not coverage.get(chamber):
        return False
    entered, entered_chamber = service
    return (entered_chamber == chamber and coverage[chamber] <= entered <= day
            and (date.fromisoformat(day) - date.fromisoformat(entered)).days <= FIRST_WINDOW_DAYS)


def build(db, roster_doc, today=None):
    roster = roster_doc["people"]
    speeches, speech_days = first_speeches(db, roster)
    divisions, division_days = first_divisions(db, roster)
    starts = {kind: {chamber: coverage_start(days) for chamber, days in sorted(held.items())}
              for kind, held in (("speeches", speech_days), ("divisions", division_days))}
    speech_coverage = {chamber: start for chamber, (start, _) in starts["speeches"].items() if start}
    division_coverage = {chamber: start for chamber, (start, _) in starts["divisions"].items() if start}
    service = service_starts(db, roster)
    by_pid, by_name = {}, {}
    marked = {"speeches": 0, "divisions": 0}
    for i, row in enumerate(roster):
        entry = {}
        if i in speeches:
            day, speech_id, chamber = speeches[i]
            entry["first_speech"] = {"date": day, "chamber": chamber, "slug": f"speech-{speech_id}"}
            if is_first(day, chamber, service.get(i), speech_coverage):
                entry["first_speech"]["first"] = True
                marked["speeches"] += 1
        if i in divisions:
            day, _, _, source, url, house = divisions[i]
            entry["first_division"] = {"date": day, "chamber": house, "source": source, "url": url}
            if is_first(day, house, service.get(i), division_coverage):
                entry["first_division"]["first"] = True
                marked["divisions"] += 1
        if not entry:
            continue
        if i in service:
            entry["service_from"] = service[i][0]
        pid = row.get("pid")
        if isinstance(pid, str) and pid:
            if pid in by_pid:
                raise SystemExit(f"two roster rows share pid {pid}")
            by_pid[pid] = entry
        else:
            if row["name"] in by_name:
                raise SystemExit(f"two roster rows without a pid share the name {row['name']}")
            by_name[row["name"]] = entry
    return {
        "meta": {
            "schema": SCHEMA,
            "generated": today or date.today().isoformat(),
            "roster_generated": (roster_doc.get("meta") or {}).get("generated"),
            "speeches_since": DEFAULT_SINCE,
            "coverage": {"speeches": speech_coverage, "divisions": division_coverage},
            "coverage_earliest_row": {kind: {chamber: earliest for chamber, (_, earliest) in held.items()}
                                      for kind, held in starts.items()},
            "coverage_min_days": COVERAGE_MIN_DAYS,
            "first_window_days": FIRST_WINDOW_DAYS,
            "people": len(by_pid) + len(by_name),
            "first_speeches": len(speeches),
            "first_divisions": len(divisions),
            "marked_first": marked,
            "sources": {"speech": SPEECH_SOURCE, "divisions": DIVISION_SOURCES},
            "notes": NOTES,
        },
        "by_pid": dict(sorted(by_pid.items())),
        "by_name": dict(sorted(by_name.items())),
    }


def dumps(doc):
    return json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n"


def main() -> None:
    with open(ROSTER, encoding="utf-8") as f:
        roster_doc = json.load(f)
    db = sqlite3.connect(DB, uri=True)
    doc = build(db, roster_doc)
    text = dumps(doc)
    sys.stdout.write(text)
    m = doc["meta"]
    print(f"[firsts] {m['people']:,} of {len(roster_doc['people']):,} roster people: {m['first_speeches']:,} first "
          f"speeches ({m['marked_first']['speeches']:,} marked first), {m['first_divisions']:,} first divisions "
          f"({m['marked_first']['divisions']:,} marked first), {len(text.encode()):,} bytes", file=sys.stderr)
    for kind in ("speeches", "divisions"):
        for chamber, earliest in m["coverage_earliest_row"][kind].items():
            start = m["coverage"][kind].get(chamber)
            print(f"[firsts] coverage {kind} {chamber}: "
                  + (f"from {start}" if start else f"none (no year with {COVERAGE_MIN_DAYS} days of rows)")
                  + f"; earliest row {earliest}", file=sys.stderr)


if __name__ == "__main__":
    main()
