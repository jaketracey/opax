#!/usr/bin/env python3
"""
Export the parliamentarians directory the portal's Parliamentarians index
(#/subject/person) lists. Runs ON the data box (the staged package at
/tmp/arag_mig supplies the sync's corpus rules and the speaker normaliser);
the portal serves the output as a static file and never touches the DB.

  bash scripts/vm/export_people.sh > portal/public/parliamentarians.json   # on the refresh VM, from a checkout

It imports scripts/roster_identity.py and reads scripts/person_identity.json, so
run it from a checkout (the weekly x_people step does), not as a lone copy.

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
               "pid": "10007",                        # federal TVFY id, verified
               "full": "David Shoebridge"},           # surname-only prints: the
              ...]}                                   # members-table full name

`pid` (and with it `current`, `party_now` and `full`) is the person id the row
is verified to be, not merely the dominant person_id on its speeches: the speech
linker gives some prints a namesake's id ("Graeme Campbell" -> George Campbell's
10098, "Patrick Conaghan" -> Rex Patrick's 10903). scripts/roster_identity.py
says what counts as evidence; a surname-only print that holds more than one
person ("Cox": David Cox's Kingston years and Dorinda Cox's) gets no pid at all.
The portal joins votes, expenses, interests and pay by this pid, and photos by
lowercased name (docs/PHOTOS.md, "Identity check").
"""

import os
import json
import re
import sqlite3
import sys
import time
from collections import Counter
from datetime import date

sys.path.insert(0, "/tmp/arag_mig")  # legacy desktop staging dir (harmless elsewhere)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # this checkout wins: VM / laptop
from parli.ingest.arag_sync import (  # noqa: E402
    DEDUPE_PREDICATES, DEFAULT_SINCE, JUNK_PREDICATES, MIN_SPEECH_CHARS,
    clean_party, prepare_dedupe,
)
from parli.ingest.speaker_names import normalize_speaker  # noqa: E402
from scripts.roster_identity import guard_print, member, same_person, state_member_matches, verify, weak  # noqa: E402

DB = "file:" + (os.environ.get("OPAX_DB") or os.path.expanduser("~/.cache/autoresearch/parli.db")) + "?mode=ro"
FLOOR = 5

# The safety net (docs/PHOTOS.md, "Nightly safety net"). A new export may not replace the roster the site
# ships now if it would take a sitting member's id or seat, change the identity of more than
# MAX_IDENTITY_CHANGES rows, or drop rows, and it is held just the same when the shipped roster cannot be read
# or is not a roster (fail closed): the export exits HELD with the reasons on stderr, so
# scripts/vm/export_step.sh keeps the shipped file and weekly_refresh.sh logs the step STALE (STALE_OK) with a
# "Roster held:" line the nightly status repeats. OPAX_ROSTER_ACCEPT=1 ships a reviewed change, or a first
# export with no baseline, anyway.
PREVIOUS = os.environ.get("OPAX_ROSTER_PREVIOUS") or os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "portal", "public", "parliamentarians.json")
IDENTITY_FIELDS = ("pid", "current", "party_now", "full")
MAX_IDENTITY_CHANGES = 25
HELD = 3

# Letters (any script), spaces, hyphens, apostrophes, dots; 2-5 tokens; not a
# sentence. "Shoebridge" (one token) passes: surname-only Hansard prints are
# real collaborator values with entry pages of their own.
NAME_RE = re.compile(r"^[^\W\d_][\w'’.\-]*(?: [^\W\d_][\w'’.\-]*){0,4}$", re.UNICODE)

# speeches.party_canonical spells two parties out where the sync's canonical
# vocabulary (clean_party) abbreviates them.
CANON_FIX = {"Democratic Labor Party": "DLP", "Jacqui Lambie Network": "JLN"}

# State roster rows contaminated by historic federal surname matches. Guard
# each repair by ID, full name, jurisdiction, chamber AND the known bad label;
# this must neither relabel the historic federal member nor pin a future party.
# The exporter is read-only, so these repairs also cover an uncorrected DB snapshot.
MEMBER_PARTY_CORRECTIONS = {
    ("vic_annabelle_cleeland", "Annabelle Cleeland", "vic", "vic_la"):
        ("Labor", "Nationals", "https://www.parliament.vic.gov.au/members/annabelle-cleeland/"),
    ("sa_harvey", "Richard Manuel Harvey", "sa", "sa_ha"):
        ("Labor", "Liberal", "https://hansardsearch.parliament.sa.gov.au/daily/uh/2018-05-16/35"),
}


def canon_party(raw, canonical):
    return clean_party(raw) or clean_party(canonical) or CANON_FIX.get(canonical or "") or None


def member_party(pid, name, state, chamber, raw, canonical):
    label = canon_party(raw, canonical)
    correction = MEMBER_PARTY_CORRECTIONS.get((pid, name, state, chamber))
    if correction and label == correction[0]:
        # A subsequently verified canonical party supersedes the stale raw ALP.
        verified = canon_party(None, canonical)
        return verified if verified and verified != correction[0] else correction[1]
    return label


def refusals(previous, new, max_changes=MAX_IDENTITY_CHANGES):
    """Why the `new` roster rows must not replace the `previous` (shipped) ones; empty when they may.
    Rows are matched by name, the roster's key."""
    reasons = []
    if len(new) < len(previous):
        reasons.append(f"the row count drops from {len(previous):,} to {len(new):,}")
    now = {p["name"]: p for p in new}
    lost = []
    for p in previous:
        if not p.get("current"):
            continue
        q = now.get(p["name"])
        if q is None:
            lost.append(f"{p['name']} (row gone)")
        elif q.get("pid") != p.get("pid"):
            lost.append(f"{p['name']} ({p.get('pid') or 'no id'} -> {q.get('pid') or 'no id'})")
        elif not q.get("current"):
            lost.append(f"{p['name']} (no longer sitting)")
    if lost:
        more = f" and {len(lost) - 8} more" if len(lost) > 8 else ""
        reasons.append(f"{len(lost)} sitting member row(s) lose their id or seat: {', '.join(lost[:8])}{more}")
    changed = [p["name"] for p in previous if p["name"] in now
               and any(p.get(f) != now[p["name"]].get(f) for f in IDENTITY_FIELDS)]
    if len(changed) > max_changes:
        reasons.append(f"{len(changed)} rows change {'/'.join(IDENTITY_FIELDS)} (more than {max_changes}): "
                       f"{', '.join(changed[:8])} and {len(changed) - 8} more")
    return reasons


def shipped_roster(path=None):
    """(people rows, None) for the roster the site ships now, or (None, why) when there is no usable one.
    A missing, unreadable or malformed baseline is a reason to hold, never permission to ship: only
    OPAX_ROSTER_ACCEPT=1 lets an export through without one (a deliberate first run)."""
    path = path or PREVIOUS
    try:
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
    except FileNotFoundError:
        return None, f"no shipped roster at {path} to compare with"
    except (OSError, ValueError) as err:
        return None, f"the shipped roster at {path} cannot be read ({type(err).__name__}: {err})"
    people = doc.get("people") if isinstance(doc, dict) else None
    if not isinstance(people, list) or not people:
        return None, f"the shipped roster at {path} has no people to compare with"
    if not all(isinstance(p, dict) and isinstance(p.get("name"), str) and p["name"] for p in people):
        return None, f"the shipped roster at {path} has rows without a name"
    return people, None


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
    members = {r[0]: {"name": r[1], "party": member_party(*r[:6]), "state": r[2] or "federal",
                       "chamber": r[3], "start": r[6], "end": r[7]} for r in db.execute(
        "SELECT person_id, full_name, state, chamber, party, party_canonical, entered_house, left_house FROM members")}
    # Federal members with their terms: what a row's pid is verified against.
    federal = {str(r[0]): member(r[0], [r[1], f"{r[2] or ''} {r[3] or ''}".strip()], r[4],
                                 int(r[5][:4]) if r[5] and r[5][:4].isdigit() else None,
                                 int(r[6][:4]) if r[6] and r[6][:4].isdigit() else None)
               for r in db.execute(
                   "SELECT person_id, full_name, first_name, last_name, chamber, entered_house, left_house "
                   "FROM members WHERE chamber IN ('representatives', 'senate') AND person_id GLOB '[0-9]*'")}
    same = same_person()
    now_year = date.today().year
    # Sitting federal parliamentarians and the party they sit for today (members.left_house is
    # NULL only for the current 150 + 76 after the APH sweep of 2026-09-04). The speech-dominant
    # "party" stays as the history; "party_now" is what the page should lead with.
    current = {r[0]: (canon_party(r[2], r[1]) or r[1] or r[2], r[3]) for r in db.execute(
        "SELECT person_id, party_canonical, party, chamber FROM members "
        "WHERE left_house IS NULL AND chamber IN ('representatives', 'senate') "
        "AND (person_id GLOB '[0-9]*' OR person_id LIKE 'aph_%')")}
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
        rec = {"name": name, "speeches": p["n"]}
        rec["states"] = [s for s, _ in p["states"].most_common()]
        rec["chambers"] = [c for c, _ in p["chambers"].most_common()]
        if p["years"]:
            rec["first"], rec["last"] = min(p["years"]), max(p["years"])
        if p["witness"]:
            rec["witness_rows"] = p["witness"]
        # The federal id only on evidence; a state member's id (non-numeric, name-built) still
        # supplies a missing party.
        pid, _why = verify(rec, p["pids"], federal, same, now_year)
        top_pid = p["pids"].most_common(1)[0][0] if p["pids"] else None
        state_pid = (top_pid if top_pid and not top_pid.isdigit() and top_pid in members
                     and state_member_matches(rec, members[top_pid])
                     and (not weak(name) or (len(p['pids'])==1 and sum(
                         state_member_matches(rec,m) for m in members.values())==1)) else None)
        party_pid = pid or state_pid
        if not ranked and party_pid and members.get(party_pid, {}).get("party"):
            # State Hansard rows seldom carry a party; the members table does.
            ranked = [members[party_pid]["party"]]
        if ranked:
            rec["party"] = ranked[0]
            if len(ranked) > 1:
                rec["parties"] = ranked
        if pid:
            rec["pid"] = pid
        if pid in current:
            rec["current"] = True
            if current[pid][0]:
                rec["party_now"] = current[pid][0]
        # Surname-only prints ("Shoebridge"): the members table knows the person.
        if " " not in name and party_pid:
            full = members.get(party_pid, {}).get("name") or ""
            if " " in full and full.split()[-1].lower() == name.lower().split()[-1]:
                rec["full"] = full
        guard_print(rec)
        # Key order as before: name, speeches, party, parties, states, chambers, first, last, pid, ...
        order = ["name", "speeches", "party", "parties", "states", "chambers", "first", "last", "pid",
                 "current", "party_now", "full", "witness_rows", "recorded_parties"]
        out.append({k: rec[k] for k in order if k in rec})

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
    previous, unusable = shipped_roster()
    if os.environ.get("OPAX_ROSTER_ACCEPT") == "1":
        held = []
    else:
        held = [unusable] if unusable else refusals(previous, out)
    if held:
        print("ROSTER HELD: " + "; ".join(held), file=sys.stderr)
        print(f"[export] not shipped: {PREVIOUS} is kept. If the change is right, rerun with "
              "OPAX_ROSTER_ACCEPT=1 (docs/PHOTOS.md, \"Nightly safety net\")", file=sys.stderr)
        sys.exit(HELD)
    json.dump(doc, sys.stdout, ensure_ascii=False, separators=(",", ":"))
    print(f"[export] {len(out):,} people, {witnesses:,} witness-only excluded, "
          f"{below:,} below floor, {malformed:,} malformed ({time.time() - t0:.0f}s)", file=sys.stderr)


if __name__ == "__main__":
    main()
