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
                  division with no https source address is not published.

Nothing here ranks or compares people. The dates say when the RECORD starts for
a person, not when their service did: speeches are held from meta.speeches_since
and divisions from the dates in meta.divisions_since, so the apps and the site
label them "First speech in the record" and "First division in the record".

Output (compact JSON, keys sorted, so an unchanged database writes the same
bytes apart from meta.generated):

  {"meta": {"schema": 1, "generated": "2026-11-15", "roster_generated": "2026-11-14",
            "speeches_since": "1993-03-13",
            "divisions_since": {"federal": "2006-02-07", "nsw": "..."},
            "people": 1234, "first_speeches": 1200, "first_divisions": 800,
            "sources": {"speech": "Hansard, as held in the OPAX record",
                        "divisions": {"theyvoteforyou": "They Vote For You", ...}},
            "notes": [...]},
   "by_pid":  {"10007": {"first_speech": {"date": "1996-05-06", "slug": "speech-123"},
                         "first_division": {"date": "2006-02-07", "source": "theyvoteforyou",
                                            "url": "https://theyvoteforyou.org.au/divisions/representatives/2006-02-07/1"}}},
   "by_name": {"A Person With No Roster Id": {...}}}

A roster row with a `pid` is under by_pid and nowhere else; a row without one is
under by_name by its exact roster `name`. A person with neither fact is absent.
`slug` is the speech's document (/doc/<slug> on the site and in the apps).
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
    "Dates say when the record starts for a person, not when their service did.",
    "Speeches are those made in a chamber; committee hearings and witness testimony are not counted.",
    "A division counts when the person is recorded voting aye or no.",
]


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
    """{roster index: (date, speech_id)} under the corpus rule; see the module docstring."""
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
    best = {}
    for speaker, pid, party, state, chamber, day, speaker_type, source, electorate, speech_id in rows:
        if not DATE_RE.match(day or ""):
            continue
        person = identity_for(dict(speaker_name=speaker, person_id=pid, party=party, state=state, chamber=chamber,
                                   date=day, source=source, electorate=electorate, speaker_type=speaker_type,
                                   witness_name=None))
        name = person["name"] if person else normalize_speaker(speaker)
        if not name:
            continue
        i = claimant(index, roster, name, state, chamber)
        if i is None or i in barred:
            continue
        found = (day, speech_id)
        if i not in best or found < best[i]:
            best[i] = found
    return best


def _tables(db):
    return {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}


def first_divisions(db, roster):
    """({roster index: (date, number, id, source, url)}, {jurisdiction: earliest division date held})."""
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
        held = db.execute(f"SELECT MIN(substr(d.date, 1, 10)) FROM divisions d WHERE d.date IS NOT NULL AND {federal} "
                          f"AND d.house IN {FEDERAL_HOUSES!r}").fetchone()[0]
        if held and DATE_RE.match(held):
            since["federal"] = held
        for pid, day, number, division_id, house in db.execute(f"""
                SELECT v.person_id, substr(d.date, 1, 10), COALESCE(d.number, 0), d.division_id, d.house
                FROM votes v JOIN divisions d ON d.division_id = v.division_id
                WHERE v.vote IN ('aye', 'no') AND d.date IS NOT NULL AND {federal}"""):
            if not DATE_RE.match(day or "") or house not in FEDERAL_HOUSES:
                continue
            i = by_pid.get(str(pid))
            if i is None:
                continue
            url = f"https://theyvoteforyou.org.au/divisions/{house}/{day}" + (f"/{number}" if number else "")
            offer(i, (day, number, f"{division_id:012d}" if isinstance(division_id, int) else str(division_id),
                      "theyvoteforyou", url))
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
            if day < since.get(jurisdiction, "9"):
                since[jurisdiction] = day
            if source not in DIVISION_SOURCES or not URL_RE.match(url or ""):
                continue
            i = claimant(index, roster, name, jurisdiction, house)
            if i is not None:
                offer(i, (day, number, str(division_id), source, url))
    return best, since


def build(db, roster_doc, today=None):
    roster = roster_doc["people"]
    speeches = first_speeches(db, roster)
    divisions, since = first_divisions(db, roster)
    by_pid, by_name = {}, {}
    for i, row in enumerate(roster):
        entry = {}
        if i in speeches:
            day, speech_id = speeches[i]
            entry["first_speech"] = {"date": day, "slug": f"speech-{speech_id}"}
        if i in divisions:
            day, _, _, source, url = divisions[i]
            entry["first_division"] = {"date": day, "source": source, "url": url}
        if not entry:
            continue
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
            "divisions_since": dict(sorted(since.items())),
            "people": len(by_pid) + len(by_name),
            "first_speeches": len(speeches),
            "first_divisions": len(divisions),
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
          f"speeches, {m['first_divisions']:,} first divisions, {len(text.encode()):,} bytes", file=sys.stderr)


if __name__ == "__main__":
    main()
