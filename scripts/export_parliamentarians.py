#!/usr/bin/env python3
"""
Export the parliamentarians directory the portal's Parliamentarians index
(#/subject/person) lists. Runs ON the data box (the staged package at
/tmp/arag_mig supplies the sync's corpus rules and the speaker normaliser);
the portal serves the output as a static file and never touches the DB.

  scp scripts/export_parliamentarians.py desktop:/tmp/arag_mig/
  ssh desktop 'python3 /tmp/arag_mig/export_parliamentarians.py' > portal/public/parliamentarians.json

Read-only: parli.db is opened with mode=ro and never written.

Corpus rule: exactly the migration's (parli/ingest/arag_sync.py): speeches
dated on or after the 1993 federal election, 200+ characters, the junk
predicates P1-P7, wragge/openaustralia/window dedupe. Names are
normalize_speaker() output, the same function that produced every
origin.collaborators value, so each `name` is an entry-page URL
(#/subject/person/<name>) and a photos/people.json key once lowercased.

People who appear ONLY as committee witnesses (speeches.witness_name set on
every one of their rows) are not parliamentarians and are left out; their
number is reported in meta.witnesses_excluded. A surname shared by a senator
and a witness ("Cook") stays in, with every row counted, because that is what
the entry page and the speaker filter show for that name.

Party is the dominant canonical label on the person's speeches (the sync's
clean_party vocabulary); when the speeches carry none, the members table's
canonical party for the person's dominant person_id stands in.

Names below the floor (fewer than FLOOR speeches, the speaker resolver's own
floor) or that fail the name shape (OCR fragments, timestamps, run-on
sentences) are dropped and counted in meta.below_floor / meta.malformed.

Output (compact JSON, people sorted by speeches desc):

  {"meta": {"generated", "since", "min_chars", "floor", "people", "speeches",
            "witnesses_excluded", "below_floor", "malformed", "source"},
   "people": [{"name": "Anthony Albanese", "speeches": 5343, "party": "Labor",
               "parties": ["Labor", "Independent"],   # only when more than one
               "states": ["federal"], "chambers": ["representatives"],
               "first": 1996, "last": 2026,
               "pid": "10007",                        # federal TVFY id when known
               "full": "David Shoebridge"},           # surname-only prints: the
              ...]}                                   # members-table full name

Portrait ids (photos/people.json) and voting records (votes.json) are joined
CLIENT-SIDE by lowercased name, so this export stays a pure function of the
corpus and the two other files can be regenerated independently.
"""

import json
import re
import sqlite3
import sys
import time
from collections import Counter
from datetime import date

sys.path.insert(0, "/tmp/arag_mig")
from parli.ingest.arag_sync import (  # noqa: E402
    DEDUPE_PREDICATES, DEFAULT_SINCE, JUNK_PREDICATES, MIN_SPEECH_CHARS,
    clean_party, prepare_dedupe,
)
from parli.ingest.speaker_names import normalize_speaker  # noqa: E402

DB = "file:/home/jake/.cache/autoresearch/parli.db?mode=ro"
FLOOR = 5

# Letters (any script), spaces, hyphens, apostrophes, dots; 2-5 tokens; not a
# sentence. "Shoebridge" (one token) passes: surname-only Hansard prints are
# real collaborator values with entry pages of their own.
NAME_RE = re.compile(r"^[^\W\d_][\w'’.\-]*(?: [^\W\d_][\w'’.\-]*){0,4}$", re.UNICODE)

# speeches.party_canonical spells two parties out where the sync's canonical
# vocabulary (clean_party) abbreviates them.
CANON_FIX = {"Democratic Labor Party": "DLP", "Jacqui Lambie Network": "JLN"}


def canon_party(raw, canonical):
    return clean_party(raw) or clean_party(canonical) or CANON_FIX.get(canonical or "") or None


def main() -> None:
    t0 = time.time()
    db = sqlite3.connect(DB, uri=True)
    # prepare_dedupe prints its progress line; stdout is the JSON document.
    sys.stdout, real_stdout = sys.stderr, sys.stdout
    try:
        prepare_dedupe(db, DEFAULT_SINCE)
    finally:
        sys.stdout = real_stdout
    where = (f"text IS NOT NULL AND LENGTH(text) >= {MIN_SPEECH_CHARS} AND date >= {DEFAULT_SINCE!r} "
             f"{JUNK_PREDICATES} {DEDUPE_PREDICATES}")
    rows = db.execute(f"""
        SELECT speaker_name, person_id, party, party_canonical, state, chamber,
               substr(date, 1, 4) AS yr,
               (witness_name IS NOT NULL AND witness_name != '') AS is_witness,
               COUNT(*) AS n
        FROM speeches WHERE {where}
        GROUP BY 1, 2, 3, 4, 5, 6, 7, 8""").fetchall()
    members = {r[0]: (r[1], canon_party(r[2], r[3]))
               for r in db.execute("SELECT person_id, full_name, party, party_canonical FROM members")}
    print(f"[export] {len(rows):,} speaker groups ({time.time() - t0:.0f}s)", file=sys.stderr)

    people = {}
    for speaker, pid, party, canonical, state, chamber, yr, is_witness, n in rows:
        name = normalize_speaker(speaker)
        if not name:
            continue
        p = people.get(name)
        if p is None:
            p = people[name] = {
                "n": 0, "witness": 0, "parties": Counter(), "states": Counter(),
                "chambers": Counter(), "years": [], "pids": Counter(),
            }
        p["n"] += n
        if is_witness:
            p["witness"] += n
        label = canon_party(party, canonical)
        if label:
            p["parties"][label] += n
        p["states"][state or "federal"] += n
        if chamber:
            p["chambers"][chamber] += n
        if yr and yr.isdigit():
            p["years"].append(int(yr))
        if pid:
            p["pids"][pid] += n

    out, witnesses, below, malformed, speeches_total = [], 0, 0, 0, 0
    for name, p in people.items():
        if p["witness"] == p["n"]:
            witnesses += 1
            continue
        if p["n"] < FLOOR:
            below += 1
            continue
        if not NAME_RE.match(name) or len(name) > 40:
            malformed += 1
            continue
        speeches_total += p["n"]
        # Parties: the dominant label first; others only when they carry real
        # weight (a stray mislabelled row is not a party switch).
        ranked = [lab for lab, c in p["parties"].most_common() if c >= max(5, 0.02 * p["n"])]
        if not ranked and p["parties"]:
            ranked = [p["parties"].most_common(1)[0][0]]
        top_pid = p["pids"].most_common(1)[0][0] if p["pids"] else None
        if not ranked and top_pid and members.get(top_pid, ("", None))[1]:
            # State Hansard rows seldom carry a party; the members table does.
            ranked = [members[top_pid][1]]
        rec = {"name": name, "speeches": p["n"]}
        if ranked:
            rec["party"] = ranked[0]
            if len(ranked) > 1:
                rec["parties"] = ranked
        rec["states"] = [s for s, _ in p["states"].most_common()]
        rec["chambers"] = [c for c, _ in p["chambers"].most_common()]
        if p["years"]:
            rec["first"], rec["last"] = min(p["years"]), max(p["years"])
        if top_pid and top_pid.isdigit():
            rec["pid"] = top_pid
        # Surname-only prints ("Shoebridge"): the members table knows the person.
        if " " not in name and top_pid:
            full = members.get(top_pid, ("", None))[0] or ""
            if " " in full and full.split()[-1].lower() == name.lower().split()[-1]:
                rec["full"] = full
        if p["witness"]:
            rec["witness_rows"] = p["witness"]
        out.append(rec)

    out.sort(key=lambda r: (-r["speeches"], r["name"]))
    doc = {
        "meta": {
            "generated": date.today().isoformat(),
            "since": DEFAULT_SINCE,
            "min_chars": MIN_SPEECH_CHARS,
            "floor": FLOOR,
            "people": len(out),
            "speeches": speeches_total,
            "witnesses_excluded": witnesses,
            "below_floor": below,
            "malformed": malformed,
            "source": "parli.db speeches under the arag_sync corpus rule; names via normalize_speaker",
        },
        "people": out,
    }
    json.dump(doc, sys.stdout, ensure_ascii=False, separators=(",", ":"))
    print(f"[export] {len(out):,} people, {witnesses:,} witness-only excluded, "
          f"{below:,} below floor, {malformed:,} malformed ({time.time() - t0:.0f}s)", file=sys.stderr)


if __name__ == "__main__":
    main()
