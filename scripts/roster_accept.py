#!/usr/bin/env python3
"""The reviewed accept list for roster re-exports (scripts/roster_accept.json): what a review let through.

scripts/roster_overlay.py keeps every shipped roster record exactly as shipped. This list is the one way a change
from the box export reaches it, per record and per field. Each entry is a group of fields that apply together, with
the value main had (`from`) and the value the reviewed export showed (`to`), and the evidence that permits it:

  "records": {"Anthony Albanese": [{"evidence": "hansard-growth", "fields": {"speeches": [5343, 5381]}}], ...},
  "new":     {"Amanda Stoker": {"evidence": "aph-handbook", "url": "...", "note": "...", "row": {...}}},

A field absent from a record is written null (the roster never holds a JSON null; the iOS decoder rejects one).

  - A group applies only when the export shows every `to` value exactly and the shipped record still holds `from`
    (or `was`, the value an earlier accepted group installed). A later export that moves a field again holds that
    group again: the shipped value stays. `from` is always the value before any accept list (what revert()
    restores), so a later review replaces a group rather than stacking on it.
  - Every group is checked before it applies, and one that fails is held, never applied (group_problem): corpus
    evidence is re-checked by rule (corpus_reason: a count may only rise, a fall needs a presiding officer named in
    the evidence, a witness partition must conserve the transcript aggregate, only committee chambers may be added,
    no identity field); identity evidence needs a source URL and a check date; no group removes an identity value,
    and none touches what a curated record pins (protected: a witness split, a fold, a reviewed alias or pinned
    party in scripts/roster_service.json, a dated party, a neutral committee namesake); and a shipped record that
    holds neither `from` nor `to` was curated after the review, so its group is held.
  - A new row applies only when it is a complete parliamentary identity (new_row_problem: full name, pid or Handbook
    id, a house chamber, jurisdiction, and service dates from the evidence that cover its years; no witness rows),
    the export's row is exactly the reviewed row, and the shipped roster lacks the name.
  - A file that cannot be read, or is not shaped like an accept list, holds everything (read()).

revert() undoes the applied groups, so scripts/audit_roster_changes.py and scripts/test_roster_main_preservation.py
keep judging the curated roster against main's fixture with their existing categories.

  python3 scripts/roster_accept.py --propose raw-export.json   # a review: rewrite the list, print what stays held
  python3 scripts/roster_overlay.py --directory raw-export.json  # then lay it on (installs the accepted groups)
  python3 scripts/roster_accept.py --check                       # validate the list against the shipped roster
"""
import argparse
import copy
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACCEPT = ROOT / "scripts" / "roster_accept.json"
SHIPPED = ROOT / "portal" / "public" / "parliamentarians.json"

# Fields a corpus re-count may move; everything else on a record is identity.
CORPUS_FIELDS = {"speeches", "first", "last", "witness_rows", "chambers", "states"}
PARTITION_FIELDS = CORPUS_FIELDS | {"transcript", "separated_witnesses"}
IDENTITY_FIELDS = {"party", "parties", "recorded_parties", "full", "representation", "current", "party_now", "pid",
                   "prints", "aliases", "affiliations", "identity_evidence", "identity_basis", "speech_scope",
                   "speech_count_basis"}
# What a curated record pins, by kind (protected()).
PARTY_FIELDS = {"party", "parties", "party_now", "recorded_parties", "affiliations"}
FOLD_FIELDS = {"prints", "pid", "full", "party", "parties", "party_now", "current", "representation"}
ALIAS_FIELDS = PARTY_FIELDS | {"full", "pid", "representation", "aliases", "identity_basis", "identity_evidence"}
NEUTRAL_FIELDS = PARTY_FIELDS | {"pid", "full", "current", "representation"}
EVERY_FIELD = None  # a pinned witness split: nothing on it may change


def empty():
    return {"records": {}, "new": {}, "evidence": {}}


def load(path=ACCEPT):
    """The list, strictly (tests and the audit): a missing file is an empty list, a broken one raises."""
    if not Path(path).exists():
        return empty()
    return json.loads(Path(path).read_text(encoding="utf-8"))


def shape(accept):
    """None when `accept` is shaped like an accept list, else why not (then nothing in it can be trusted)."""
    if not isinstance(accept, dict):
        return "not a JSON object"
    for key in ("records", "new", "evidence"):
        if not isinstance(accept.get(key, {}), dict):
            return f'"{key}" is not an object'
    if not all(isinstance(v, dict) for v in accept.get("evidence", {}).values()):
        return "an evidence entry is not an object"
    return None


def read(path=ACCEPT):
    """(accept list, None), or (an empty list, why) when the file cannot be used at all: the overlay's loader,
    which must hold everything rather than crash the people step."""
    try:
        accept = load(path)
    except (OSError, ValueError) as err:
        return empty(), f"unreadable ({type(err).__name__}: {str(err)[:80]})"
    why = shape(accept)
    return (empty(), why) if why else (accept, None)


def curated_names(root=ROOT):
    """{name: protected fields} for the people the repo's reviewed evidence pins, or None when it cannot be read
    (then every identity group is held). Reviewed aliases and same-person careers, dated service and history,
    pinned and corrected parties (scripts/roster_service.json); the QLD witness splits
    (scripts/roster_witness_service.json)."""
    try:
        service = json.loads((root / "scripts" / "roster_service.json").read_text(encoding="utf-8"))
        witness = json.loads((root / "scripts" / "roster_witness_service.json").read_text(encoding="utf-8"))
        names = {}
        for key, v in {**service.get("aliases", {}), **service.get("same_person", {})}.items():
            for n in (key, v.get("name")):
                names[n] = ALIAS_FIELDS
        for n in ([r.get("name") for r in service.get("service", []) + service.get("history", [])]
                  + list(service.get("party_from_pinned_roster", [])) + list(service.get("party_corrections", []))):
            names.setdefault(n, PARTY_FIELDS)
        for r in witness.get("services", []):
            for n in (r.get("print"), r.get("name")):
                names[n] = EVERY_FIELD
        names.pop(None, None)
        return names
    except (OSError, ValueError, AttributeError, TypeError):
        return None


def protected(row, curated):
    """[(fields, why)] a curated shipped record pins; fields None = every field."""
    out = []
    if row.get("speech_scope") or row.get("speech_count_basis"):
        out.append((EVERY_FIELD, "a pinned witness split"))
    if row.get("prints"):
        out.append((FOLD_FIELDS, "a folded person"))
    for n in (row.get("name"), row.get("full")):
        if curated and n in curated:
            out.append((curated[n], "pinned in the reviewed roster evidence"))
    if row.get("affiliations") or row.get("identity_basis"):
        out.append((PARTY_FIELDS, "a dated party"))
    if not any(row.get(k) for k in ("pid", "full", "party", "parties", "party_now", "current")) and not row.get("representation"):
        out.append((NEUTRAL_FIELDS, "a neutral namesake"))
    return out


def _get(row, field):
    return row.get(field) if row is not None else None


def _put(row, field, value):
    if value is None:
        row.pop(field, None)
    else:
        row[field] = copy.deepcopy(value)


def _committee(chamber):
    return chamber.endswith("_committee")


def corpus_reason(name, fields, evidence):
    """None when the group's from/to values satisfy the corpus rule its evidence names, else why not."""
    kind = evidence.get("rule")
    if kind == "reorder":
        for f, (a, b) in fields.items():
            if f not in CORPUS_FIELDS or not isinstance(a, list) or sorted(map(json.dumps, a)) != sorted(map(json.dumps, b)):
                return f"{f} is not a reordering"
        return None
    if kind in ("growth", "presiding"):
        if set(fields) - CORPUS_FIELDS:
            return "identity fields under corpus evidence: " + ", ".join(sorted(set(fields) - CORPUS_FIELDS))
        fall = kind == "presiding"
        if fall and name not in evidence.get("people", {}):
            return "not a presiding officer named in the evidence"
        for f, (a, b) in fields.items():
            if f in ("speeches", "witness_rows"):
                if not isinstance(b, int) or (a is None and f == "speeches"):
                    return f"{f} must stay a number"
                if not fall and b < (a or 0):
                    return f"{f} falls"
            elif f == "first":
                if b > a or b < evidence.get("earliest", a):
                    return "first year moves outside the new corpus"
            elif f == "last":
                if b < a and not fall:
                    return "last year moves earlier"
            elif f == "chambers":
                if set(a) - set(b) or any(not _committee(c) for c in set(b) - set(a)):
                    return "chambers lose a house or gain a non-committee house"
            elif f == "states":
                if set(a) != set(b):
                    return "states change"
        return None
    if kind == "partition":
        if set(fields) - PARTITION_FIELDS:
            return "identity fields under partition evidence"
        new = {f: b for f, (a, b) in fields.items()}
        old = {f: a for f, (a, b) in fields.items()}
        t, w = new.get("transcript"), new.get("separated_witnesses")
        if not t or not w or old.get("transcript") or old.get("separated_witnesses"):
            return "not a new partition"
        mp, before = new.get("speeches"), old.get("speeches")
        if not isinstance(mp, int) or not isinstance(before, int):
            return "counts must be numbers"
        if "chambers" in fields and (set(old["chambers"]) - set(t["chambers"]) or
                                     any(not _committee(c) for c in set(old["chambers"]) - set(new["chambers"]))):
            return "the partition drops a house"
        if "states" in fields and set(old["states"]) - set(t["states"]):
            return "the partition drops a jurisdiction the transcript lacks"
        if mp + w["speeches"] != t["speeches"] or w["speeches"] != t["witness_rows"]:
            return "partition does not add up to the transcript aggregate"
        if t["speeches"] < before or t["witness_rows"] < (old.get("witness_rows") or 0):
            return "transcript aggregate falls"
        if w.get("speaker_type") != "witness" or set(w) - {"name", "speaker_type", "speeches", "states", "chambers", "first", "last"}:
            return "separated testimony carries more than counts"
        if new.get("witness_rows") is not None:
            return "a partitioned record keeps witness rows"
        return None
    return f"unknown corpus rule {kind!r}"


def _shaped(group):
    return (isinstance(group, dict) and isinstance(group.get("evidence"), str) and isinstance(group.get("fields"), dict)
            and group["fields"] and all(isinstance(f, str) and isinstance(v, list) and len(v) == 2
                                        for f, v in group["fields"].items())
            and isinstance(group.get("was", {}), dict))


def group_problem(name, group, evidence, row, curated):
    """None when `group` may apply to the shipped `row` (None: no such record), else why it is held."""
    if not _shaped(group):
        return "malformed group"
    ev = evidence.get(group["evidence"])
    if not isinstance(ev, dict) or ev.get("kind") not in ("corpus", "identity"):
        return f"unknown evidence {group['evidence']!r}"
    fields = group["fields"]
    try:
        if ev["kind"] == "corpus":
            why = corpus_reason(name, fields, ev)
            if why:
                return "corpus evidence fails its rule: " + why
        elif not ((group.get("url") or ev.get("url")) and (group.get("checked") or ev.get("checked"))):
            return "identity evidence without a source URL and check date"
    except (TypeError, KeyError, ValueError, AttributeError):
        return "malformed group values"
    if any(f in IDENTITY_FIELDS and a is not None and b is None for f, (a, b) in fields.items()):
        return "it removes an identity value"
    if row is None:
        return "not a shipped record"
    if curated is None and ev["kind"] == "identity":
        return "the reviewed roster evidence files cannot be read"
    for pinned, why in protected(row, curated or {}):
        touched = set(fields) if pinned is EVERY_FIELD else set(fields) & pinned
        if touched and (pinned is EVERY_FIELD or ev["kind"] == "identity" or touched & IDENTITY_FIELDS):
            return f"{why}: {', '.join(sorted(touched))} stay as shipped"
    if state(row, group) == "conflict":
        return "the shipped record has moved since the review (neither the original nor the accepted value)"
    return None


def _year(value):
    return int(str(value)[:4]) if value else None


def new_row_problem(name, entry, evidence, shipped_names=()):
    """None when a new row is a complete parliamentary identity the evidence vouches for, else why it is held."""
    if not isinstance(entry, dict) or not isinstance(entry.get("row"), dict):
        return "malformed entry"
    ev = evidence.get(entry.get("evidence"))
    if not isinstance(ev, dict) or ev.get("kind") != "identity" or not (entry.get("url") and (entry.get("checked") or ev.get("checked"))):
        return "a new row needs identity evidence with a source URL and check date"
    row, service = entry["row"], entry.get("service")
    parts = name.split()
    if row.get("name") != name or len(parts) < 2 or not any(c.islower() for c in parts[0]) or len(parts[0].strip(".")) < 2:
        return "a new row needs a full name (not a surname or initials print)"
    if name in shipped_names:
        return "the name is already a shipped record"
    if not (str(row.get("pid") or "").isdigit() or entry.get("phid")):
        return "a new row needs a pid or a Handbook id"
    houses = [c for c in row.get("chambers") or [] if isinstance(c, str) and not _committee(c)]
    if not houses:
        return "a committee-only or chamberless row is not a parliamentary identity"
    if row.get("separated_witnesses") or row.get("witness_rows") or row.get("speaker_type") == "witness":
        return "the row carries committee-witness testimony"
    if not row.get("states") or not row.get("first") or not row.get("last"):
        return "a new row needs a jurisdiction and service years"
    if not isinstance(service, dict) or not service.get("start"):
        return "a new row needs its service (chamber, jurisdiction, start, end) from the evidence"
    try:
        start, end = _year(service["start"]), _year(service.get("end"))
        if service.get("chamber") not in houses or service.get("jurisdiction") not in row["states"]:
            return "the evidence's service is not the row's house and jurisdiction"
        if row["first"] < start or (end is not None and row["last"] > end):
            return "the row's years fall outside the evidence's service"
    except (TypeError, ValueError):
        return "malformed service dates"
    return None


def validate(accept, shipped_people=None, curated=False):
    """Every reason something in the list would be held. With shipped_people, also each group against that
    roster (curated defaults to the repo's evidence files)."""
    why = shape(accept)
    if why:
        return [why]
    if curated is False:
        curated = curated_names()
    problems = []
    evidence = accept.get("evidence", {})
    have = {p["name"]: p for p in shipped_people or []}
    for name, groups in accept.get("records", {}).items():
        if not isinstance(groups, list):
            problems.append(f"{name}: malformed record entry")
            continue
        seen = set()
        for g in groups:
            if _shaped(g):
                if seen & set(g["fields"]):
                    problems.append(f"{name}: a field is accepted twice")
                seen |= set(g["fields"])
            why = group_problem(name, g, evidence, have.get(name), curated)
            if why and (have or why != "not a shipped record"):
                problems.append(f"{name}: {why}")
    for name, entry in accept.get("new", {}).items():
        why = new_row_problem(name, entry, evidence)
        if why:
            problems.append(f"{name}: {why}")
    return problems


def state(row, group):
    """'applied', 'pending' (row still has from, or the `was` an earlier list installed) or 'conflict'."""
    fields, was = group["fields"], group.get("was", {})
    if all(_get(row, f) == b for f, (a, b) in fields.items()):
        return "applied"
    if all(_get(row, f) in (a, b, was.get(f, a)) for f, (a, b) in fields.items()):
        return "pending"
    return "conflict"


MOVED = "the export moved again"


def apply(shipped_people, fresh_people, accept, curated=False):
    """(people, report): the shipped rows with every valid accepted group the export still shows, plus valid
    accepted new rows. Each group is judged on its own (group_problem) and held with a reason when it fails, so one
    bad entry never blocks the others; report["held"] is [(name, why)]."""
    report = {"applied": 0, "unchanged": 0, "held": []}
    why = shape(accept)
    if why:
        report["held"].append(("roster_accept.json", why))
        return [copy.deepcopy(p) for p in shipped_people], report
    if curated is False:
        curated = curated_names()
    evidence = accept.get("evidence", {})
    fresh = {p["name"]: p for p in fresh_people}
    people = [copy.deepcopy(p) for p in shipped_people]
    by = {p["name"]: p for p in people}
    for name, groups in accept.get("records", {}).items():
        if not isinstance(groups, list):
            report["held"].append((name, "malformed record entry"))
            continue
        row, q = by.get(name), fresh.get(name)
        for g in groups:
            why = group_problem(name, g, evidence, row, curated)
            if why:
                report["held"].append((name, why))
            elif state(row, g) == "applied":
                report["unchanged"] += 1
            elif q is not None and all(_get(q, f) == b for f, (a, b) in g["fields"].items()):
                for f, (a, b) in g["fields"].items():
                    _put(row, f, b)
                report["applied"] += 1
            else:
                report["held"].append((name, MOVED))
    for name, entry in accept.get("new", {}).items():
        if name in by:
            report["unchanged"] += 1
            continue
        why = new_row_problem(name, entry, evidence, by)
        if why:
            report["held"].append((name, why))
        elif fresh.get(name) == entry["row"]:
            people.append(copy.deepcopy(entry["row"]))
            report["applied"] += 1
        else:
            report["held"].append((name, MOVED))
    return people, report


def revert(people, accept):
    """The roster as it was before the accept list: applied groups back to `from`, accepted new rows removed."""
    new = accept.get("new", {})
    out = []
    for p in people:
        if p["name"] in new and p == new[p["name"]]["row"]:
            continue
        p = copy.deepcopy(p)
        for g in accept.get("records", {}).get(p["name"], []):
            if state(p, g) != "conflict":  # applied, or still holding `from` or an earlier list's `was`
                for f, (a, b) in g["fields"].items():
                    _put(p, f, a)
        out.append(p)
    return out


def ordered(people):
    """Speeches descending, as the export writes them; a stable sort, so an unchanged roster keeps its order."""
    return sorted(people, key=lambda p: -(p.get("speeches") or 0))


def recount(meta, people):
    """The shipped meta with its derived totals recomputed for `people`."""
    meta = dict(meta)
    meta["people"] = len(people)
    meta["speeches"] = sum(p.get("speeches") or 0 for p in people)
    for key, value in (("witness_speeches_separated", sum((p.get("separated_witnesses") or {}).get("speeches", 0) for p in people)),
                       ("speech_counts_pending", sum(1 for p in people if p.get("speech_count_basis"))),
                       ("prints_folded", sum(len(p.get("prints") or []) for p in people))):
        if key in meta:
            meta[key] = value
    return meta


def _order_only(a, b):
    return isinstance(a, list) and isinstance(b, list) and a != b and sorted(map(json.dumps, a)) == sorted(map(json.dumps, b))


def propose(shipped_people, fresh_people, accept, current=None):
    """(accept list, held): the reviewed identity groups and new rows kept where the export still shows them, and a
    corpus group proposed for every other difference the corpus rules allow. `held` lists the rest, with reasons.
    A reviewer adds identity groups and new rows by hand, with their evidence; this never proposes one.
    `shipped_people` is the roster before any list (revert()); `current`, the committed one: where it holds a value
    an earlier list installed, the group records it as `was`, so the overlay may replace it."""
    evidence = accept["evidence"]
    rule = {ev["rule"]: key for key, ev in evidence.items() if ev["kind"] == "corpus"}
    fresh = {p["name"]: p for p in fresh_people}
    out = {**accept, "records": {}, "new": {}}
    held = []
    for p in shipped_people:
        name, q = p["name"], fresh.get(p["name"])
        if q is None or q == p:
            continue
        diff = {f for f in p.keys() | q.keys() if p.get(f) != q.get(f)}
        groups = []
        for g in accept.get("records", {}).get(name, []):
            if evidence[g["evidence"]]["kind"] == "identity" and all(_get(q, f) == b for f, (a, b) in g["fields"].items()):
                groups.append(g)
                diff -= set(g["fields"])
        fields = lambda keys: {f: [_get(p, f), _get(q, f)] for f in sorted(keys)}  # noqa: E731
        if p.get("speech_count_basis") or p.get("speech_scope"):
            held.append((name, sorted(diff), "pinned witness split: the own-house count stays pending"))
            diff = set()
        elif "prints" in diff:
            # the counts include the folded print's, whose own row stays: a fold needs its own review (roster_fold.py)
            held.append((name, sorted(diff), "a new fold: the counts carry a print whose row is kept"))
            diff = set()
        elif q.get("separated_witnesses") and not p.get("separated_witnesses"):
            if diff & IDENTITY_FIELDS - {"recorded_parties"}:
                held.append((name, sorted(diff), "the partition comes with identity changes"))
                diff = set()
            else:
                g = {"evidence": rule["partition"], "fields": fields(diff & PARTITION_FIELDS)}
                why = corpus_reason(name, g["fields"], evidence[g["evidence"]])
                held.append((name, sorted(diff & PARTITION_FIELDS), why)) if why else groups.append(g)
                diff -= PARTITION_FIELDS
        elif diff & CORPUS_FIELDS:
            keys = diff & CORPUS_FIELDS
            kind = ("reorder" if all(_order_only(p.get(f), q.get(f)) for f in keys) else
                    "presiding" if name in evidence[rule["presiding"]].get("people", {}) else "growth")
            g = {"evidence": rule[kind], "fields": fields(keys)}
            why = corpus_reason(name, g["fields"], evidence[g["evidence"]])
            held.append((name, sorted(keys), why)) if why else groups.append(g)
            diff -= keys
        if diff:
            held.append((name, sorted(diff), "identity: no reviewed evidence"))
        now = (current or {}).get(name)
        for g in groups:
            was = {f: _get(now, f) for f, (a, b) in g["fields"].items() if now is not None and _get(now, f) not in (a, b)}
            g.pop("was", None)
            if was:
                g["was"] = was
        if groups:
            out["records"][name] = groups
    shipped = {p["name"] for p in shipped_people}
    for name, q in fresh.items():
        if name in shipped:
            continue
        entry = accept.get("new", {}).get(name)
        if entry and entry["row"] == q:
            out["new"][name] = entry
        else:
            held.append((name, ["new row"], "new row: no reviewed evidence"))
    return out, held


def dump(accept):
    """One record per line, so a review diff reads record by record."""
    head = {k: v for k, v in accept.items() if k not in ("records", "new")}
    lines = json.dumps(head, ensure_ascii=False, indent=2)[:-2].rstrip() + ",\n"
    for key in ("records", "new"):
        items = sorted(accept[key].items())
        body = ",\n".join(f"    {json.dumps(n, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)}" for n, v in items)
        lines += f'  "{key}": {{\n{body}\n  }}' + (",\n" if key == "records" else "\n")
    return lines + "}\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="validate the list against the shipped roster")
    ap.add_argument("--propose", type=Path, metavar="EXPORT",
                    help="rewrite the list for a raw export (OPAX_ROSTER_ACCEPT=1 export_people.sh): keep the reviewed "
                         "identity groups it still shows, propose corpus groups, print what stays held")
    ap.add_argument("--accept", type=Path, default=ACCEPT)
    ap.add_argument("--shipped", type=Path, default=SHIPPED)
    a = ap.parse_args(argv)
    accept = load(a.accept)
    people = json.loads(a.shipped.read_text(encoding="utf-8"))["people"]
    if a.propose:
        fresh = json.loads(a.propose.read_text(encoding="utf-8"))
        accept, held = propose(revert(people, accept), fresh["people"], accept, {p["name"]: p for p in people})
        accept["export"] = {"generated": fresh["meta"].get("generated"), "people": len(fresh["people"]),
                            "sha256": hashlib.sha256(a.propose.read_bytes()).hexdigest()}
        a.accept.write_text(dump(accept), encoding="utf-8")
        for name, fields, why in held:
            print(f"HELD\t{name}\t{','.join(fields)}\t{why}")
    problems = validate(accept, people)
    groups = [g for gs in accept.get("records", {}).values() for g in gs]
    applied = sum(state(p, g) == "applied" for p in people for g in accept.get("records", {}).get(p["name"], []))
    print(f"roster accept list: {len(accept.get('records', {}))} records, {len(groups)} groups ({applied} applied), "
          f"{len(accept.get('new', {}))} new rows; {len(problems)} problem(s)")
    for why in problems:
        print("  " + why, file=sys.stderr)
    if problems:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
