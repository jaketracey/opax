#!/usr/bin/env python3
"""Who a roster row is: the verified person id for a printed name.

The roster's `pid` used to be the dominant person_id on a name's speeches, and the speech linker gives
some prints the id of a namesake (a 1990s member gets a later member's with the same surname) or of a
member whose surname is their first name ("Patrick Conaghan" -> 10903, Rex Patrick). Every join keyed
on that id then shows the other person: face, votes, pay, expenses, interests, sitting status
(docs/PHOTOS.md, "Identity check"). verify() keeps an id only on evidence:

  1. scripts/person_identity.json `same_person` lists the print for that id (checked by hand); or
  2. one of the row's own speech ids belongs to a member whose name agrees with the print: surname
     equal (however many words), a first name that is a prefix of one of theirs either way
     (Phil/Phillip), initials that agree; or
  3. a full-name print with no agreeing speech id: exactly one federal member agrees by name and sat
     in the print's years ("Patrick Conaghan" -> Pat Conaghan, 10922).

A surname-only or initials print ("Cox", "T Smith") takes an id only when the row is one person: federal
only, no committee-witness rows, no other member's id on its speeches, every year inside that member's
term, and no chamber the member never sat in (committees aside). Otherwise the row is mixed and gets no
id, so no face and no single-person record ("Cox" holds David Cox's Kingston years and Dorinda Cox's).

export_parliamentarians.py feeds it the members table. When the database is out of reach,

  python3 scripts/roster_identity.py --pinned     # rewrites portal/public/parliamentarians.json

re-verifies the shipped roster against the repository's own exports instead: TheyVoteForYou names
(votes.json), pay records whose name agrees with them (pay.json), and electorate seat periods. Its
answer for a row can differ from the database's only where those exports know less about a term.
"""
import argparse
import glob
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from parli.ingest.speaker_names import normalize_speaker
PUBLIC = ROOT / "portal" / "public"
IDENTITY = ROOT / "scripts" / "person_identity.json"
TITLES = {"hon", "the", "dr", "mr", "mrs", "ms", "sir", "jr", "am", "ao", "mp", "mlc", "mla", "kc", "qc"}
COMMITTEES = {"senate_committee", "house_committee", "joint_committee"}
FEDERAL = {"representatives", "senate"}


def witness_row(row):
    """Either witness marker is authoritative, even with a stale MP link."""
    return bool(row.get('witness_name')) or row.get('speaker_type') == 'witness'


def parts(name):
    s = "".join(c for c in unicodedata.normalize("NFKD", str(name or "")) if not unicodedata.combining(c))
    s = s.lower().replace("’", "'").replace("‘", "'").replace("`", "'").replace(".", " ")
    return [t for t in re.split(r"[\s,]+", s) if t and t not in TITLES]


def weak(name):
    """A print with no real first name: "Burke", "T Smith", "K.J. Maher"."""
    return all(len(t) == 1 for t in parts(name)[:-1])


def alias_name(name):
    """Use the ingest display casing, never a source's all-capital byline."""
    return normalize_speaker(str(name or '')) or ''


def usable_alias(name):
    """Member stubs can contain a byline or compact initials, not a given name."""
    tokens = str(name or '').split()
    if (len(tokens) < 2 or weak(name) or alias_name(name) != name
            or tokens[0].casefold() in {'by','in','an'}):
        return False
    return tokens[0].casefold() not in {'sm', 'gj', 'lm', 'ml', 'aj', 'pt', 'mt', 'sj', 'de', 'mc', 'cd', 'maj'}


def parliamentary_speakers_dominate(row):
    """A parliamentary identity needs strictly more speaker rows than witnesses.

    Ties are neutral. This is an identity/display guard, never attribution of
    witness testimony; mixed aggregates still cannot carry a numeric MP pid.
    """
    total=row.get('speeches',0)
    witnesses=row.get('witness_rows',0)
    return total > 0 and 0 <= witnesses < total / 2


def mixed_print(row):
    """A print needing independent resolution, aligned with the portrait guard.

    A state's two-house transcript does not by itself establish two people.
    Multi-parliament and witness prints may still have one uniquely evidenced
    parliamentary identity; repair() resolves that before calling guard_print.
    """
    return weak(row["name"]) and (len(set(row.get("states") or [])) > 1
                                 or bool(row.get("witness_rows")))


def guard_print(row, resolved=False, force=False):
    """Keep the transcript aggregate, but no single person's identity, seat or party.

    Speech party labels are retained as recorded_parties. A flat party facet would
    otherwise combine a federal Labor era with an unrelated state chamber.
    """
    if not mixed_print(row) and not force:
        return
    if resolved:
        # Dated evidence identifies the parliamentarian, not every committee
        # witness's speech. Never give such an aggregate their numeric pid.
        for field in ("pid", "current", "party_now"):
            row.pop(field, None)
        return
    labels = list(dict.fromkeys([row.get("party"), *(row.get("parties") or []),
                                *(row.get("recorded_parties") or [])]))
    if any(labels):
        row["recorded_parties"] = [p for p in labels if p]
    for field in ("pid", "current", "party_now", "full", "party", "parties",
                  "identity_evidence", "identity_basis", "affiliations"):
        row.pop(field, None)
    if "representation" in row:
        row["representation"] = []


def state_member_matches(row, m):
    """A state fallback must belong to this print's jurisdiction, house and name.

    Known dates must overlap; absent state-stub dates are not a contradiction.
    A dominant speech id alone is never evidence of a person's identity.
    """
    if mixed_print(row) or not agrees(row["name"], m["name"]):
        return False
    if set(row.get("states") or []) != {m.get("state")}:
        return False
    if m.get("chamber") not in set(row.get("chambers") or []) - COMMITTEES:
        return False
    if weak(row["name"]):
        start, end = _year(m.get("start")), _year(m.get("end"))
        return ((start is None or row.get("last") is not None and start <= row['last'])
                and (end is None or row.get("first") is not None and row['first'] <= end))
    return True


def agrees(name, owner):
    """The name agrees with the owner's name: same surname (however many words), and a first name that
    is a prefix of one of the owner's either way (Phil/Phillip), or initials that agree. The JavaScript
    twin is nameAgrees() in scripts/photo_identity.mjs."""
    n, o = parts(name), parts(owner)
    if not n or not o or n[-1] != o[-1]:
        return False
    tail = 1
    while tail < len(n) and tail < len(o) and n[-1 - tail] == o[-1 - tail]:
        tail += 1
    given, owner_given = n[:-tail], o[:-tail]
    if not given:
        return True
    if not owner_given:
        return False
    if all(len(t) == 1 for t in given):
        a, b = "".join(given), "".join(t[0] for t in owner_given)
        return a.startswith(b) or b.startswith(a)
    first = given[0]
    return any(t == first or (min(len(t), len(first)) >= 3 and (t.startswith(first) or first.startswith(t)))
               for t in owner_given)


def same_person(path=IDENTITY):
    """print -> pid, the hand-checked list in scripts/person_identity.json."""
    data = json.loads(Path(path).read_text()) if Path(path).exists() else {}
    return {name: v["key"] for name, v in (data.get("same_person") or {}).items() if str(v.get("key", "")).isdigit()}


def member(pid, names, chamber, start=None, end=None):
    """A federal member: start/end are years; end None means still sitting; start None means unknown."""
    return {"pid": str(pid), "names": [n for n in names if n], "chamber": chamber, "start": start, "end": end}


def _year(value):
    return int(str(value)[:4]) if value and str(value)[:4].isdigit() else None


def federal_members(db):
    """pid -> member() for every federal member in the members table: what export_parliamentarians.py
    verifies a roster row's pid against, and export_bills.py a bill sponsor's."""
    return {str(r[0]): member(r[0], [r[1], f"{r[2] or ''} {r[3] or ''}".strip()], r[4], _year(r[5]), _year(r[6]))
            for r in db.execute(
                "SELECT person_id, full_name, first_name, last_name, chamber, entered_house, left_house "
                "FROM members WHERE chamber IN ('representatives', 'senate') AND person_id GLOB '[0-9]*'")}


def sole_member(name, members, chamber, year):
    """The one federal member of `chamber` whose name agrees with a full-name print and who sat in
    `year` (rule 3 of verify()), or None: no such member, two of them, or a surname/initials print."""
    if not name or weak(name):
        return None
    found = [p for p, m in members.items() if m.get("chamber") == chamber and _agrees_member(name, m)
             and (m.get("start") is None or m["start"] <= year) and (m.get("end") is None or m["end"] >= year)]
    return found[0] if len(found) == 1 else None


def _agrees_member(name, m):
    return any(agrees(name, n) for n in m["names"])


def mixed(row, pid, ids, m, now_year):
    """Why a surname or initials print is more than this one member, or None when it is only them."""
    states = row.get("states") or []
    if set(states) != {"federal"}:
        return "spans " + "+".join(states)
    if row.get("witness_rows"):
        return f"includes {row['witness_rows']} committee-witness rows"
    others = [p for p, n in ids if p != pid and n]
    if others:
        return "speeches linked to " + ", ".join(others[:3])
    first, last = row.get("first"), row.get("last")
    end = now_year if m.get("end") is None else m["end"]
    if first is None or (m.get("start") is not None and first < m["start"]) or last > end:
        return f"{first}-{last} outside {m['start'] or '?'}-{'now' if m.get('end') is None else m['end']}"
    foreign = sorted(set(row.get("chambers") or []) - COMMITTEES - {m.get("chamber")})
    if foreign:
        return "chamber " + ",".join(foreign)
    return None


def verify(row, ids, members, same, now_year):
    """(pid or None, why) for a roster row. ids: Counter of the row's speech person_ids;
    members: pid -> member(); same: print -> pid."""
    name = row["name"]
    if witness_row(row):
        return None, "committee witness"
    key = name.strip().lower()
    if key in same:
        return same[key], "listed as the same person"
    numeric = [(str(p), n) for p, n in Counter(ids).most_common() if str(p).isdigit()]
    pid = next((p for p, _ in numeric if p in members and _agrees_member(name, members[p])), None)
    how = "speech id"
    if pid is None and not weak(name) and row.get("first") is not None:
        found = [p for p, m in members.items() if m.get("chamber") in FEDERAL and _agrees_member(name, m)
                 and (m.get("start") is None or m["start"] <= row["last"])
                 and (m.get("end") is None or m["end"] >= row["first"])]
        if len(found) == 1:
            pid, how = found[0], "the only member of that name in those years"
    if pid is None:
        return None, "no member's name agrees"
    if weak(name):
        why = mixed(row, pid, numeric, members[pid], now_year)
        if why:
            return None, f"mixed: {why}"
    return pid, how


# --- --pinned: re-verify the shipped roster from the repository's exports ---------------------------

def pinned_members(public=PUBLIC):
    """pid -> member() from the repository's exports: TheyVoteForYou names and division years (votes.json),
    pay records whose name agrees with them (pay.json; its ids came through the old roster, so "David Cox"
    on Dorinda Cox's 10964 is ignored), and electorate seat periods. pay.json starts at 1999-12-07 and
    TheyVoteForYou at 2006, so a start at either is "already sitting", not an entry date."""
    EARLY, SITTING = -1, 10**4
    votes = json.loads((public / "votes.json").read_text())
    pay = json.loads((public / "pay.json").read_text())
    names, chamber, starts, ends = {}, {}, {}, {}
    def add(pid, name=None, house=None, start=None, end=None):
        names.setdefault(pid, [])
        if name and name not in names[pid]:
            names[pid].append(name)
        if house and pid not in chamber:
            chamber[pid] = house
        if start is not None:
            starts.setdefault(pid, []).append(start)
        if end is not None:
            ends.setdefault(pid, []).append(end)
    for pid, v in votes.items():
        if pid.isdigit() and isinstance(v, dict) and v.get("name") and v.get("house") in FEDERAL:
            y0, y1 = (v.get("years") or [None, None])[:2]
            add(pid, v["name"], v["house"], EARLY if not y0 or y0 <= 2006 else y0, y1)
    for rec in pay.get("people", {}).values():
        pid = str(rec.get("pid") or "")
        if not pid.isdigit() or (pid in names and not any(agrees(rec["name"], n) for n in names[pid])):
            continue
        add(pid, rec["name"], rec.get("chamber"),
            EARLY if (rec.get("from") or "") <= "1999-12-07" else _year(rec["from"]),
            SITTING if rec.get("sitting") or not rec.get("to") else _year(rec["to"]))
    release = sorted(glob.glob(str(public / "electorates" / "releases" / "*" / "people.json")))
    if release:
        ref = json.loads((Path(release[-1]).parent / "reference.json").read_text())
        by_hash = {p["person_id"]: str(p["legacy_person_id"]) for p in ref["people"]
                   if str(p.get("legacy_person_id", "")).isdigit()}
        for p in json.loads(Path(release[-1]).read_text())["people"]:
            pid = by_hash.get(p["person_id"], "")
            if pid not in names or not any(agrees(p["name"], n) for n in names[pid]):
                continue
            for e in p.get("electorates") or []:
                if e.get("jurisdiction") != "federal":
                    continue
                for period in e.get("periods") or []:
                    add(pid, start=_year(period.get("start")),
                        end=SITTING if period.get("end") is None else _year(period.get("end")))
    out = {}
    for pid, ns in names.items():
        s, e = min(starts.get(pid) or [EARLY]), max(ends.get(pid) or [SITTING])
        out[pid] = member(pid, ns, chamber.get(pid), None if s == EARLY else s, None if e == SITTING else e)
    return out


def reverify(doc, members, same):
    """Re-verify every row of a shipped roster in place; returns [(name, old pid, new pid, why)]."""
    rows = doc["people"]
    now_year = _year(doc.get("meta", {}).get("generated")) or 9999
    status = {}  # pid -> (current, party_now), a function of the pid in the export
    for r in rows:
        if r.get("pid") and r.get("current"):
            status[str(r["pid"])] = (True, r.get("party_now"))
    changes = []
    for r in rows:
        old = str(r["pid"]) if r.get("pid") else None
        pid, why = verify(r, Counter({old: 1}) if old else Counter(), members, same, now_year)
        if pid == old:
            continue
        changes.append((r["name"], old, pid, why))
        for field in ("pid", "current", "party_now"):
            r.pop(field, None)
        if old != pid and weak(r["name"]):
            r.pop("full", None)
        if pid:
            r["pid"] = pid
            if pid in status:
                r["current"] = True
                if status[pid][1]:
                    r["party_now"] = status[pid][1]
    return changes


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--pinned", action="store_true", help="re-verify portal/public/parliamentarians.json in place")
    args = ap.parse_args()
    if not args.pinned:
        ap.error("nothing to do: export_parliamentarians.py calls verify(); use --pinned to re-verify the shipped file")
    path = PUBLIC / "parliamentarians.json"
    doc = json.loads(path.read_text())
    changes = reverify(doc, pinned_members(), same_person())
    for name, old, new, why in changes:
        print(f"  {name!r}: {old or '-'} -> {new or '-'} ({why})", file=sys.stderr)
    # The format scripts/enrich_profile_jurisdictions.py writes, so an unchanged row is an unchanged byte.
    path.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"[roster] {len(changes)} rows re-verified -> {path}", file=sys.stderr)


if __name__ == "__main__":
    main()
