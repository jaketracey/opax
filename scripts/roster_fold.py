#!/usr/bin/env python3
"""Fold a surname-only roster print into the one full-name parliamentarian it certainly is.

Hansard prints many members by surname alone ("Senator SHOEBRIDGE"), so the speech export carries a
row "Shoebridge" (4,769 speeches, no portrait) beside "David Shoebridge" (1,649, sitting senator), and
the stub outranked the person on /subject/person. A print folds into a full-name row only when every
test holds; otherwise it keeps its own row. Two people are never merged (fail closed):

  - the print is one word, carries a party, and is not a reviewed witness split (speech_scope), a
    row holding committee-witness testimony (witness_rows: the surname may be a private witness's) or
    a row with a recorded seat of its own (its published roster-profile record would be orphaned);
  - exactly one full-name person in the roster has that surname with an overlapping jurisdiction and
    overlapping years (twin spellings, O'Connor/O’Connor, count as one person: the slug holder wins);
  - that person has the print's party (party, party_now or a recorded party);
  - every jurisdiction and every own-house chamber of the print is the person's, a committee print
    belongs to a federal member with a verified id, and the print's years sit inside the person's
    (one year either way);
  - the print's own id and members-register name, where it has them, are the person's;
  - no other member of that surname served in that jurisdiction in those years, by the members
    register (the SQL dump, dated) and the electorate release's people (dated terms where it has them).

The merge sums the speeches, joins states, chambers and years, and keeps the person's name, slug, id,
seats, portrait and status; a person printed by initials also takes the print's members-register name. The print is kept in `prints`, so the person's page and
searches also read the speeches the knowledge box still holds under the bare surname, and the old
/subject/person/<surname> address forwards to the person.

  python3 scripts/roster_fold.py --directory portal/public/parliamentarians.json [--members members.json]

scripts/vm/export_people.sh runs it on the enriched export, so the nightly keeps the folds; run by hand
it rewrites the committed roster in place and prints what folded and what was left, with the reason.
"""
import argparse
import json
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.roster_identity import COMMITTEES, FEDERAL, agrees, parts  # noqa: E402

PUBLIC = ROOT / "portal" / "public"
SPLIT_FIELDS = ("speech_scope", "separated_witnesses", "transcript")
# Wragge's historic Hansard ends before the corpus starts (1993): a member known only by a wragge id
# sat before then. Anyone who also served later has a dated or numeric record of their own.
WRAGGE_LAST_YEAR = 1992


def name_key(name):
    """personNameKey's fold: accents, apostrophes, dots and case do not separate two spellings."""
    s = "".join(c for c in unicodedata.normalize("NFKD", str(name or "")) if not unicodedata.combining(c))
    return " ".join(s.replace("’", "'").replace("‘", "'").replace(".", " ").casefold().split())


def surname(name):
    tokens = parts(name)
    return tokens[-1].replace("'", "") if tokens else ""


def is_print(row):
    return " " not in str(row.get("name") or "").strip()


def _year(value):
    try:
        return int(str(value)[:4])
    except (TypeError, ValueError):
        return None


def overlaps(a_first, a_last, b_first, b_last):
    """Year spans overlap; an unknown bound is open (fail closed: it may overlap)."""
    return (b_last is None or a_first is None or a_first <= b_last) and (b_first is None or a_last is None or b_first <= a_last)


def same_name(a, b):
    return bool(a and b) and (name_key(a) == name_key(b) or agrees(a, b) or agrees(b, a))


def registry_from_members(rows):
    """The members table as scripts/vm/export_people.sh dumps it (full_name, state, chamber, dates)."""
    out = []
    for m in rows:
        chamber = m.get("chamber") or ""
        place = "federal" if chamber in FEDERAL | COMMITTEES else str(m.get("state") or "").lower()
        out.append({"names": [m.get("full_name") or ""], "jurisdiction": place,
                    "first": _year(m.get("entered_house")), "last": _year(m.get("left_house")), "open": not m.get("left_house")})
    return out


def registry_from_reference(reference):
    """The electorate release's people: every member it knows, with dated terms where it has them."""
    terms = {}
    for t in reference.get("terms") or []:
        terms.setdefault(t["person_id"], []).append((_year(t.get("start")), _year(t.get("end"))))
    out = []
    for p in reference.get("people") or []:
        names = [p.get("name") or "", *(p.get("aliases") or [])]
        spans = terms.get(p.get("person_id"))
        legacy = str(p.get("legacy_person_id") or "")
        if not spans and legacy.startswith("wragge_"):
            spans = [(None, WRAGGE_LAST_YEAR)]
        for first, last in spans or [(None, None)]:
            out.append({"names": names, "jurisdiction": p.get("jurisdiction"), "first": first, "last": last,
                        "open": last is None, "pid": legacy})
    return out


def default_registry(public=PUBLIC):
    manifest = json.loads((public / "electorates/manifest.json").read_text())
    return registry_from_reference(json.loads((public / manifest["reference_url"].lstrip("/")).read_text()))


def _parties(row):
    return {name_key(p) for p in (row.get("party"), row.get("party_now"), *(row.get("parties") or []),
                                  *(row.get("recorded_parties") or [])) if p}


def _registry_conflict(stub, target, registry):
    """Another member of the surname in the print's jurisdictions and years: the print may be them."""
    sur = surname(stub["name"])
    for m in registry:
        if m.get("jurisdiction") not in stub.get("states", []):
            continue
        names = [n for n in m["names"] if len(parts(n)) >= 2 and parts(n)[0] not in {"by", "in", "an"}]
        if not names or not any(surname(n) == sur for n in names):
            continue
        if target.get("pid") and m.get("pid") == target["pid"]:
            continue
        if any(same_name(n, target["name"]) or same_name(n, target.get("full")) for n in names):
            continue
        if overlaps(stub.get("first"), stub.get("last"), m.get("first"), None if m.get("open") else m.get("last")):
            return names[0]
    return None


def decide(stub, people, registry):
    """(target row, None) when the print certainly is one person, else (None, why)."""
    if any(stub.get(k) for k in SPLIT_FIELDS):
        return None, "a reviewed witness-split record"
    if stub.get("witness_rows"):
        return None, f"holds {stub['witness_rows']} committee-witness rows under the surname"
    if not stub.get("party"):
        return None, "no party recorded on the print"
    sur = surname(stub["name"])
    same = [p for p in people if not is_print(p) and surname(p["name"]) == sur]
    if not same:
        return None, "no full-name row with this surname"
    near = [p for p in same if set(p.get("states") or []) & set(stub.get("states") or [])
            and overlaps(stub.get("first"), stub.get("last"), p.get("first"), p.get("last"))]
    if not near:
        return None, "no full-name row in the same jurisdiction and years"
    persons = {}
    for p in near:
        persons.setdefault(name_key(p["name"]), []).append(p)
    if len(persons) > 1:
        return None, "several people: " + ", ".join(sorted(v[0]["name"] for v in persons.values()))
    # Twin spellings fold to one person: the spelling with more speeches holds the slug.
    target = max(next(iter(persons.values())), key=lambda p: (p.get("speeches") or 0))
    if any(target.get(k) for k in SPLIT_FIELDS):
        return None, f"{target['name']} is a reviewed witness-split record"
    stub_parties = {name_key(p) for p in (stub.get("party"), *(stub.get("parties") or [])) if p}
    if not stub_parties <= _parties(target):
        return None, f"party differs from {target['name']} ({stub['party']} vs {target.get('party_now') or target.get('party') or 'none recorded'})"
    if not set(stub.get("states") or []) <= set(target.get("states") or []):
        return None, f"jurisdictions outside {target['name']}'s"
    own = set(stub.get("chambers") or []) - COMMITTEES
    if not own <= set(target.get("chambers") or []):
        return None, f"chambers outside {target['name']}'s"
    # A committee print needs a federal member with a verified id: the apps admit a full-name row with a
    # senate_committee chamber only when it has a pid (the identity guard), and so does this fold.
    if set(stub.get("chambers") or []) & COMMITTEES and not (set(target.get("chambers") or []) & FEDERAL and target.get("pid")):
        return None, f"committee speeches, but {target['name']} has no verified federal seat"
    if None in (stub.get("first"), stub.get("last"), target.get("first"), target.get("last")) or not (
            target["first"] - 1 <= stub["first"] and stub["last"] <= target["last"] + 1):
        return None, f"years outside {target['name']}'s"
    if stub.get("pid") and stub["pid"] != target.get("pid"):
        return None, f"person id differs from {target['name']}'s"
    if stub.get("full") and not (same_name(stub["full"], target["name"]) or same_name(stub["full"], target.get("full"))):
        return None, f"members-register name {stub['full']} is not {target['name']}"
    other = _registry_conflict(stub, target, registry)
    if other:
        return None, f"the members register also holds {other} in those years"
    if stub.get("representation") or stub.get("affiliations"):
        # Its seat is a published roster-profile record of its own; folding it would orphan that record.
        return None, f"would fold into {target['name']}, but has its own recorded seat (a roster-profile record)"
    return target, None


def _join(a, b):
    return list(a or []) + [x for x in (b or []) if x not in (a or [])]


def merge(target, stub):
    """The person's row, now holding the print's speeches. Identity fields stay the person's."""
    target["speeches"] = (target.get("speeches") or 0) + (stub.get("speeches") or 0)
    target["states"] = _join(target.get("states"), stub.get("states"))
    target["chambers"] = _join(target.get("chambers"), stub.get("chambers"))
    target["first"] = min(target["first"], stub["first"])
    target["last"] = max(target["last"], stub["last"])
    if stub.get("full") and not target.get("full") and stub["full"] != target["name"]:
        # The print's members-register name ("Vincent Tarzia" for "V.A. Tarzia"; decide() checked they agree).
        target["full"] = stub["full"]
    target["prints"] = sorted({*target.get("prints", []), *stub.get("prints", []), stub["name"]})
    return target


def fold(people, registry=()):
    """(people with the certain prints folded, [(print, person)], [(print, why)]). Rows are not copied."""
    registry = list(registry)
    folded, skipped, gone = [], [], set()
    # Every print is judged against the roster as exported, before any merge widens a person's row.
    decisions = [(stub, *decide(stub, people, registry)) for stub in people if is_print(stub)]
    for stub, target, why in decisions:
        if target is None:
            skipped.append((stub["name"], why))
            continue
        merge(target, stub)
        gone.add(id(stub))
        folded.append((stub["name"], target["name"]))
    out = [p for p in people if id(p) not in gone]
    out.sort(key=lambda r: (-(r.get("speeches") or 0), r["name"]))
    return out, folded, skipped


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--directory", type=Path, default=PUBLIC / "parliamentarians.json")
    ap.add_argument("--members", type=Path, help="the members table dump (export_people.sh); adds dated terms")
    ap.add_argument("--report", type=Path, help="write the folded and skipped prints as JSON")
    a = ap.parse_args(argv)
    doc = json.loads(a.directory.read_text())
    registry = default_registry()
    if a.members:
        registry += registry_from_members(json.loads(a.members.read_text() or "[]"))
    doc["people"], folded, skipped = fold(doc["people"], registry)
    doc["meta"]["people"] = len(doc["people"])
    doc["meta"]["prints_folded"] = sum(len(p.get("prints") or []) for p in doc["people"])
    a.directory.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
    if a.report:
        a.report.write_text(json.dumps({"folded": folded, "skipped": skipped}, ensure_ascii=False, indent=1) + "\n")
    print(f"[fold] {len(folded)} surname prints folded into their person, {len(skipped)} left as they are", file=sys.stderr)


if __name__ == "__main__":
    main()
