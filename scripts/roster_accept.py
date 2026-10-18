#!/usr/bin/env python3
"""The reviewed accept list for roster re-exports (scripts/roster_accept.json): what a review let through.

scripts/roster_overlay.py keeps every shipped roster record exactly as shipped. This list is the one way a change
from the box export reaches it, per record and per field. Each entry is a group of fields that apply together, with
the value main had (`from`) and the value the reviewed export showed (`to`), and the evidence that permits it:

  "records": {"Anthony Albanese": [{"evidence": "hansard-growth", "fields": {"speeches": [5343, 5381]}}], ...},
  "new":     {"Amanda Stoker": {"evidence": "aph-handbook", "url": "...", "note": "...", "row": {...}}},

A field absent from a record is written null (the roster never holds a JSON null; the iOS decoder rejects one).

  - A group applies only when the export shows every `to` value exactly. A later export that moves a field again
    holds that group again: the shipped value stays. `from` is always the value before any accept list (what
    revert() restores), so a later review replaces a group rather than stacking on it; validate() checks that the
    committed roster holds either `from` or `to` for every group.
  - A new row applies only when the export's row is exactly the reviewed row and the shipped roster lacks the name.
  - Corpus evidence (EVIDENCE kind "corpus") is re-checked by rule (corpus_reason) on every load: a count may only
    rise, a fall needs a presiding officer named in the evidence, a witness partition must conserve the transcript
    aggregate, and only committee chambers may be added. Identity evidence needs a source URL and a check date.

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


def load(path=ACCEPT):
    if not Path(path).exists():
        return {"records": {}, "new": {}, "evidence": {}}
    return json.loads(Path(path).read_text(encoding="utf-8"))


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


def validate(accept, shipped_people=None):
    """Reasons the accept list is malformed. With shipped_people, also each group's from/to against that roster."""
    problems = []
    evidence = accept.get("evidence", {})
    have = {p["name"]: p for p in shipped_people or []}
    for name, groups in accept.get("records", {}).items():
        seen = set()
        for g in groups:
            ev = evidence.get(g.get("evidence"))
            if ev is None:
                problems.append(f"{name}: unknown evidence {g.get('evidence')!r}")
                continue
            if seen & set(g["fields"]):
                problems.append(f"{name}: a field is accepted twice")
            seen |= set(g["fields"])
            if ev["kind"] == "corpus":
                why = corpus_reason(name, g["fields"], ev)
                if why:
                    problems.append(f"{name}: {why}")
            elif not ((g.get("url") or ev.get("url")) and (g.get("checked") or ev.get("checked"))):
                problems.append(f"{name}: identity evidence without a source URL and check date")
            if name in have and state(have[name], g) == "conflict":
                problems.append(f"{name}: shipped record holds neither the accepted nor the original value")
        if have and name not in have:
            problems.append(f"{name}: not a shipped record")
    for name, entry in accept.get("new", {}).items():
        ev = evidence.get(entry.get("evidence"))
        if not ev or ev["kind"] != "identity" or not (entry.get("url") and (entry.get("checked") or ev.get("checked"))):
            problems.append(f"{name}: a new row needs identity evidence with a source URL and check date")
        row = entry.get("row") or {}
        if row.get("name") != name or " " not in name or not row.get("chambers") or not row.get("states") or not row.get("first"):
            problems.append(f"{name}: a new row needs a full name, chamber, jurisdiction and service years")
    return problems


def state(row, group):
    """'applied', 'pending' (row still has from) or 'conflict' for one group on one shipped row."""
    fields = group["fields"]
    if all(_get(row, f) == b for f, (a, b) in fields.items()):
        return "applied"
    if all(_get(row, f) in (a, b) for f, (a, b) in fields.items()):
        return "pending"
    return "conflict"


def apply(shipped_people, fresh_people, accept):
    """(people, report): the shipped rows with every accepted group the export still shows, plus accepted new rows."""
    fresh = {p["name"]: p for p in fresh_people}
    people = [copy.deepcopy(p) for p in shipped_people]
    names = {p["name"] for p in people}
    report = {"applied": 0, "unchanged": 0, "held": []}
    for row in people:
        for g in accept.get("records", {}).get(row["name"], []):
            q = fresh.get(row["name"])
            if state(row, g) == "applied":
                report["unchanged"] += 1
            elif q is not None and all(_get(q, f) == b for f, (a, b) in g["fields"].items()):
                for f, (a, b) in g["fields"].items():
                    _put(row, f, b)
                report["applied"] += 1
            else:
                report["held"].append(row["name"])
    for name, entry in accept.get("new", {}).items():
        if name in names:
            report["unchanged"] += 1
        elif fresh.get(name) == entry["row"]:
            people.append(copy.deepcopy(entry["row"]))
            report["applied"] += 1
        else:
            report["held"].append(name)
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
            if state(p, g) == "applied":
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


def propose(shipped_people, fresh_people, accept):
    """(accept list, held): the reviewed identity groups and new rows kept where the export still shows them, and a
    corpus group proposed for every other difference the corpus rules allow. `held` lists the rest, with reasons.
    A reviewer adds identity groups and new rows by hand, with their evidence; this never proposes one."""
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
        accept, held = propose(revert(people, accept), fresh["people"], accept)
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
