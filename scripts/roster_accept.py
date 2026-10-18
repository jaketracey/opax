#!/usr/bin/env python3
"""The reviewed accept list for roster re-exports (scripts/roster_accept.json): what a review let through.

scripts/roster_overlay.py keeps every shipped roster record exactly as shipped. This list is the one way a change
from the box export reaches it, per record and per field. Each entry is a group of fields that apply together, with
the value main had (`from`) and the value the reviewed export showed (`to`), and the evidence that permits it:

  "records": {"Anthony Albanese": [{"evidence": "hansard-growth", "fields": {"speeches": [5343, 5381]}}], ...},
  "new":     {"Amanda Stoker": {"evidence": "aph-handbook", "url": "...", "note": "...", "row": {...}}},

A field absent from a record is written null (the roster never holds a JSON null; the iOS decoder rejects one).

  - A group applies only when the export shows every `to` value exactly and the shipped record still holds `from`.
    A later export that moves a field again holds that group again: the shipped value stays. `from` is always the
    value before any accept list (what revert() restores). An installed group is never replaced by the overlay:
    --propose keeps it as it is and lists the moved value as held, and a later review that wants the new value edits
    the group's `to` and the roster together, by hand, in one reviewed commit.
  - judge() is the one gate: validate() reports what it holds and apply() installs only what it passes. It reads
    the shipped, unmodified record for every group (never one an earlier group changed), and across a record's
    groups, two that touch the same field, or one that touches a protection field (PROTECTION_FIELDS: name, full,
    prints, speech scope and basis, dated party, identity basis, aliases, identity evidence), hold every group on
    the record. Each group on its own (group_problem): every value is type-checked (value_problem); corpus
    evidence is re-checked by rule (corpus_reason: a count may only rise, a fall needs a presiding officer named in
    the evidence, a witness partition must conserve the transcript aggregate, only committee chambers may be added,
    no identity field); identity evidence needs a source URL and a check date; no group removes an identity value,
    and none touches what a curated record pins (protected: a witness split, a fold, a reviewed alias or pinned
    party in scripts/roster_service.json, a dated party, a neutral committee namesake); and a shipped record that
    holds neither `from` nor `to` was curated after the review, so its group is held.
  - A new row applies only when it is a complete parliamentary identity (new_row_problem: full name, pid or Handbook
    id, a house chamber, jurisdiction, and service dates from the evidence that cover its years; no witness rows),
    the export's row is exactly the reviewed row, and the shipped roster lacks the name.
  - A file that cannot be read, or is not shaped like an accept list, holds everything (read()); so do curated
    evidence files that cannot be read or are malformed (read_curated()). Every field the checks read is type-checked:
    a wrongly typed entry is held with a reason, never raised; and scripts/roster_overlay.py runs the whole accept
    step under a fail-closed handler, so any error in it keeps the shipped roster byte for byte and exits 0.

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
# Fields that decide which protections a record has (protected(), curated pins by name and `full`). A group that
# touches one would clear or move a protection for later nights, so every group on that record is held.
PROTECTION_FIELDS = {"name", "full", "prints", "speech_scope", "speech_count_basis", "affiliations", "identity_basis",
                     "aliases", "identity_evidence"}
# The fields an accepted value may hold, each with its type (value_problem); anything else is held.
_COUNT = {"speeches", "first", "last", "witness_rows"}
_TEXT = {"party", "full", "party_now", "pid", "speech_count_basis", "identity_basis"}
_TEXTS = {"chambers", "states", "parties", "recorded_parties", "prints", "aliases"}
_RECORDS = {"representation", "affiliations", "identity_evidence"}
_SUMMARIES = {"transcript", "separated_witnesses", "speech_scope"}
FIELD_TYPES = _COUNT | _TEXT | _TEXTS | _RECORDS | _SUMMARIES | {"current"}
NEW_ROW_FIELDS = {"name", "speeches", "party", "parties", "states", "chambers", "first", "last", "pid", "current",
                  "party_now", "representation", "full", "recorded_parties"}


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


CURATED_FILES = ("scripts/roster_service.json", "scripts/roster_witness_service.json")


def read_curated(root=ROOT):
    """({name: protected fields}, None) for the people the repo's reviewed evidence pins, or (None, why) when either
    file cannot be read or is not shaped as expected; then nothing is installed. Reviewed aliases and same-person
    careers, dated service and history, pinned and corrected parties (scripts/roster_service.json); the QLD witness
    splits (scripts/roster_witness_service.json)."""
    docs = []
    for rel in CURATED_FILES:
        try:
            docs.append(json.loads((Path(root) / rel).read_text(encoding="utf-8")))
        except (OSError, ValueError) as err:
            return None, f"{rel} unreadable ({type(err).__name__})"
    service, witness = docs
    named = lambda rows: isinstance(rows, list) and all(isinstance(r, dict) and isinstance(r.get("name"), str) for r in rows)  # noqa: E731
    texts = lambda rows: isinstance(rows, list) and all(isinstance(r, str) for r in rows)  # noqa: E731
    if not (isinstance(service, dict) and all(isinstance(service.get(k, {}), dict) and
                                              all(isinstance(v, dict) and isinstance(v.get("name", ""), str)
                                                  for v in service.get(k, {}).values())
                                              for k in ("aliases", "same_person"))
            and named(service.get("service", [])) and named(service.get("history", []))
            and texts(service.get("party_from_pinned_roster", [])) and texts(service.get("party_corrections", []))):
        return None, f"{CURATED_FILES[0]} is malformed"
    if not (isinstance(witness, dict) and named(witness.get("services", []))
            and all(isinstance(r.get("print"), str) for r in witness.get("services", []))):
        return None, f"{CURATED_FILES[1]} is malformed"
    names = {}
    for key, v in {**service.get("aliases", {}), **service.get("same_person", {})}.items():
        for n in (key, v.get("name")):
            names[n] = ALIAS_FIELDS
    for n in ([r["name"] for r in service.get("service", []) + service.get("history", [])]
              + service.get("party_from_pinned_roster", []) + service.get("party_corrections", [])):
        names.setdefault(n, PARTY_FIELDS)
    for r in witness.get("services", []):
        for n in (r["print"], r["name"]):
            names[n] = EVERY_FIELD
    names.pop(None, None)
    return names, None


def curated_names(root=ROOT):
    """read_curated()'s names, or None when the evidence cannot be used."""
    return read_curated(root)[0]


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


def _text(value):
    return isinstance(value, str) and bool(value.strip())


def _strs(value):
    return isinstance(value, list) and bool(value) and all(_text(v) for v in value)


def _int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _summary_ok(value):
    """A transcript, separated-witness or speech-scope summary: an object of counts, years, lists of text, text."""
    return isinstance(value, dict) and all(
        (_int(v) and v >= 0) if k in _COUNT else _strs(v) or v == [] if k in ("states", "chambers") else
        isinstance(v, (str, list, dict, int)) and not isinstance(v, bool) for k, v in value.items())


def value_problem(field, value):
    """None when `value` (None = absent) may be written into roster `field`, else why not."""
    if field not in FIELD_TYPES:
        return f"{field!r} is not a roster field an accepted change may write"
    if value is None:
        return None
    ok = ((_int(value) and value >= 0) if field in _COUNT else _text(value) if field in _TEXT else
          (isinstance(value, list) and all(_text(v) for v in value) and (bool(value) or field not in ("chambers", "states")))
          if field in _TEXTS else
          isinstance(value, list) and all(isinstance(r, dict) and all(isinstance(v, (str, type(None))) for v in r.values())
                                          for r in value) if field in _RECORDS else
          _summary_ok(value) if field in _SUMMARIES else isinstance(value, bool))
    return None if ok else f"{field} holds a {type(value).__name__} of the wrong shape"


def _shaped(group):
    return (isinstance(group, dict) and isinstance(group.get("evidence"), str) and isinstance(group.get("fields"), dict)
            and group["fields"] and all(isinstance(f, str) and isinstance(v, list) and len(v) == 2
                                        for f, v in group["fields"].items())
            and "was" not in group  # an installed value is never replaced by the overlay (module docstring)
            and all(group.get(k) is None or _text(group[k]) for k in ("url", "checked", "note")))


def _blank(value):
    return value is None or value in ("", [], {})


def group_problem(name, group, evidence, row, curated, roster=True):
    """None when `group`, on its own, may apply to the shipped, unmodified `row` (None: no such record; roster
    False: no roster to check against), else why it is held. judge() adds the rules across a record's groups."""
    if not _shaped(group):
        return "malformed group"
    ev = evidence.get(group["evidence"])
    if not isinstance(ev, dict) or ev.get("kind") not in ("corpus", "identity"):
        return f"unknown evidence {group['evidence']!r}"
    fields = group["fields"]
    for f, (a, b) in fields.items():
        why = value_problem(f, a) or value_problem(f, b)
        if why:
            return "malformed value: " + why
    try:
        if ev["kind"] == "corpus":
            why = corpus_reason(name, fields, ev)
            if why:
                return "corpus evidence fails its rule: " + why
        elif not (_text(group.get("url") or ev.get("url")) and _text(group.get("checked") or ev.get("checked"))):
            return "identity evidence without a source URL and check date"
    except (TypeError, KeyError, ValueError, AttributeError):
        return "malformed group values"
    if any(f in IDENTITY_FIELDS and not _blank(a) and _blank(b) for f, (a, b) in fields.items()):
        return "it removes an identity value"
    if not roster:
        return None
    if row is None:
        return "not a shipped record"
    if curated is None:
        return "the reviewed roster evidence files cannot be used"
    for pinned, why in protected(row, curated):
        touched = set(fields) if pinned is EVERY_FIELD else set(fields) & pinned
        if touched and (pinned is EVERY_FIELD or ev["kind"] == "identity" or touched & IDENTITY_FIELDS):
            return f"{why}: {', '.join(sorted(touched))} stay as shipped"
    if state(row, group) == "conflict":
        return "the shipped record has moved since the review (neither the original nor the accepted value)"
    return None


def _year(value):
    return int(str(value)[:4]) if value else None


def new_row_problem(name, entry, evidence, shipped_names=()):
    """None when a new row is a complete parliamentary identity the evidence vouches for, else why it is held.
    Every value read is type-checked first; a wrongly typed entry is held, never raised."""
    try:
        return _new_row_problem(name, entry, evidence, shipped_names)
    except (TypeError, ValueError, KeyError, AttributeError) as err:
        return f"malformed entry values ({type(err).__name__})"


def _new_row_problem(name, entry, evidence, shipped_names):
    if not isinstance(entry, dict) or not isinstance(entry.get("row"), dict):
        return "malformed entry"
    row, service = entry["row"], entry.get("service")
    if not isinstance(entry.get("evidence"), str) or not all(entry.get(k) is None or _text(entry[k]) for k in ("url", "checked", "phid", "note")):
        return "malformed entry: evidence, url, checked, phid and note must be text"
    ev = evidence.get(entry["evidence"])
    if not isinstance(ev, dict) or ev.get("kind") != "identity" or not (_text(entry.get("url")) and _text(entry.get("checked") or ev.get("checked"))):
        return "a new row needs identity evidence with a source URL and check date"
    parts = name.split()
    if row.get("name") != name or len(parts) < 2 or not any(c.islower() for c in parts[0]) or len(parts[0].strip(".")) < 2:
        return "a new row needs a full name (not a surname or initials print)"
    extra = sorted(set(row) - NEW_ROW_FIELDS)
    if extra:
        return "a new row may not carry " + ", ".join(extra)
    for f, v in row.items():
        why = f != "name" and value_problem(f, v)
        if why:
            return "malformed value: " + why
    if not (_strs(row.get("chambers")) and _strs(row.get("states")) and _int(row.get("first")) and _int(row.get("last"))
            and _int(row.get("speeches"))):
        return "a new row needs chambers and states (lists of text), and numeric first, last and speeches"
    if not (isinstance(service, dict) and _text(service.get("chamber")) and _text(service.get("jurisdiction"))
            and _text(service.get("start")) and (service.get("end") is None or _text(service.get("end")))):
        return "a new row needs its service (chamber, jurisdiction, start, end) from the evidence"
    if name in shipped_names:
        return "the name is already a shipped record"
    if not (str(row.get("pid") or "").isdigit() or entry.get("phid")):
        return "a new row needs a pid or a Handbook id"
    houses = [c for c in row["chambers"] if not _committee(c)]
    if not houses:
        return "a committee-only or chamberless row is not a parliamentary identity"
    try:
        start, end = _year(service["start"]), _year(service.get("end"))
    except ValueError:
        return "malformed service dates"
    if service["chamber"] not in houses or service["jurisdiction"] not in row["states"]:
        return "the evidence's service is not the row's house and jurisdiction"
    if row["first"] < start or (end is not None and row["last"] > end):
        return "the row's years fall outside the evidence's service"
    return None


def judge(accept, shipped_people=None, root=ROOT, curated=False):
    """The one gate, for validate() and apply() alike: (blocked, groups, new rows).

    blocked: why nothing may be installed (a malformed list, unusable curated evidence), else None.
    groups: [(name, index, group, why)] and new rows: [(name, entry, why)], why None for a change that may apply.
    Every check reads the shipped, unmodified record, never one other groups have changed; and across a record's
    groups, two that touch the same field, or one that touches a protection field (PROTECTION_FIELDS), hold every
    group on the record. With shipped_people None, only what can be judged without a roster is."""
    why = shape(accept)
    if why:
        return why, [], []
    if curated is False:
        curated, why = read_curated(root)
        if why:
            return why, [], []
    evidence = accept.get("evidence", {})
    have = None if shipped_people is None else {p["name"]: p for p in shipped_people}
    groups = []
    for name, entries in accept.get("records", {}).items():
        if not isinstance(entries, list):
            groups.append((name, None, entries, "malformed record entry"))
            continue
        row = have.get(name) if have is not None else None
        verdicts = []
        for i, g in enumerate(entries):
            try:
                why = group_problem(name, g, evidence, row, curated, roster=have is not None)
            except Exception as err:  # noqa: BLE001 - a group that cannot be judged is held
                why = f"malformed group ({type(err).__name__})"
            verdicts.append((name, i, g, why))
        fields = [f for g in entries if _shaped(g) for f in g["fields"]]
        whole = ("two groups touch the same field, so every group on the record is held" if len(fields) != len(set(fields))
                 else "a group touches a protection field (" + ", ".join(sorted(set(fields) & PROTECTION_FIELDS)) +
                 "), so every group on the record is held" if set(fields) & PROTECTION_FIELDS else None)
        groups += [(n, i, g, why or whole) for n, i, g, why in verdicts]
    new = []
    for name, entry in accept.get("new", {}).items():
        try:
            installed = have is not None and name in have
            why = (None if installed and isinstance(entry, dict) and have[name] == entry.get("row") and
                   new_row_problem(name, entry, evidence) is None else
                   "the name is already a shipped record" if installed else new_row_problem(name, entry, evidence))
        except Exception as err:  # noqa: BLE001
            why = f"malformed entry ({type(err).__name__})"
        new.append((name, entry, why))
    return None, groups, new


def validate(accept, shipped_people=None, curated=False, detail=False, root=ROOT):
    """Every reason something in the list would be held (judge()): text lines, or with detail
    [(name, group index or None, why)]."""
    blocked, groups, new = judge(accept, shipped_people, root, curated)
    if blocked:
        return [("roster_accept.json", None, blocked)] if detail else [blocked]
    out = [(n, i, why) for n, i, g, why in groups if why] + [(n, None, why) for n, e, why in new if why]
    return out if detail else [f"{n}: {why}" for n, i, why in out]


def state(row, group):
    """'applied', 'pending' (row still has from) or 'conflict'."""
    fields = group["fields"]
    if all(_get(row, f) == b for f, (a, b) in fields.items()):
        return "applied"
    if all(_get(row, f) in (a, b) for f, (a, b) in fields.items()):
        return "pending"
    return "conflict"


MOVED = "the export moved again"


def apply(shipped_people, fresh_people, accept, root=ROOT):
    """(people, report): the shipped rows with every change judge() passes that the export still shows, and
    nothing else; report["held"] is [(name, why)]. When judge() blocks, nothing is installed and report["blocked"]
    says why. Values are written into copies; judge() read the shipped rows."""
    report = {"applied": 0, "unchanged": 0, "held": [], "blocked": None}
    blocked, groups, new = judge(accept, shipped_people, root)
    people = [copy.deepcopy(p) for p in shipped_people]
    if blocked:
        report["blocked"] = blocked
        return people, report
    shipped = {p["name"]: p for p in shipped_people}
    by = {p["name"]: p for p in people}
    fresh = {p["name"]: p for p in fresh_people if isinstance(p, dict) and isinstance(p.get("name"), str)}
    for name, i, g, why in groups:
        q = fresh.get(name)
        if why:
            report["held"].append((name, why))
        elif state(shipped[name], g) == "applied":
            report["unchanged"] += 1
        elif q is not None and all(_get(q, f) == b for f, (a, b) in g["fields"].items()):
            for f, (a, b) in g["fields"].items():
                _put(by[name], f, b)
            report["applied"] += 1
        else:
            report["held"].append((name, MOVED))
    for name, entry, why in new:
        if why:
            report["held"].append((name, why))
        elif name in shipped:
            report["unchanged"] += 1
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


def propose(shipped_people, fresh_people, accept, current=None):
    """(accept list, held): the reviewed identity groups and new rows kept where the export still shows them, and a
    corpus group proposed for every other difference the corpus rules allow. `held` lists the rest, with reasons.
    A reviewer adds identity groups and new rows by hand, with their evidence; this never proposes one.
    `shipped_people` is the roster before any list (revert()); `current`, the committed one. A group `current` has
    installed is kept exactly as it is; if the export has moved its fields again, that is listed as held, for a
    reviewer to edit by hand (the group's `to` and the roster together). A group whose record was curated since is
    dropped and listed."""
    evidence = accept["evidence"]
    rule = {ev["rule"]: key for key, ev in evidence.items() if ev["kind"] == "corpus"}
    fresh = {p["name"]: p for p in fresh_people}
    out = {**accept, "records": {}, "new": {}}
    held = []
    for p in shipped_people:
        name = p["name"]
        q = fresh.get(name, p)  # a row the export dropped has nothing new to accept
        diff = {f for f in p.keys() | q.keys() if p.get(f) != q.get(f)}
        groups = []
        now = (current or {}).get(name)
        for g in accept.get("records", {}).get(name, []):
            installed = now is not None and state(now, g)
            if installed == "applied":
                groups.append(g)
                moved = sorted(f for f, (a, b) in g["fields"].items() if _get(q, f) != b)
                if moved:
                    held.append((name, moved, "an installed accepted value moved again: edit the group and the roster by hand"))
                diff -= set(g["fields"])
            elif installed == "conflict":
                held.append((name, sorted(g["fields"]), "curated since the review: the group is dropped"))
                diff -= set(g["fields"])
            elif evidence[g["evidence"]]["kind"] == "identity" and all(_get(q, f) == b for f, (a, b) in g["fields"].items()):
                groups.append(g)
                diff -= set(g["fields"])
        if not diff:
            if groups:
                out["records"][name] = groups
            continue
        fields = lambda keys: {f: [_get(p, f), _get(q, f)] for f in sorted(keys)}  # noqa: E731
        if p.get("speech_count_basis") or p.get("speech_scope"):
            held.append((name, sorted(diff), "pinned witness split: the own-house count stays pending"))
            diff = set()
        elif "prints" in diff:
            # the counts include the folded print's, whose own row stays: a fold needs its own review (roster_fold.py)
            held.append((name, sorted(diff), "a new fold: the counts carry a print whose row is kept"))
            diff = set()
        elif q.get("separated_witnesses") and not p.get("separated_witnesses") and diff & PARTITION_FIELDS:
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
