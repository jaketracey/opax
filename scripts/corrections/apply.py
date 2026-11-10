#!/usr/bin/env python3
"""Reviewed, evidenced one-off corrections for published datasets.

A correction file is scripts/corrections/<dataset>.json: a JSON list of entries

    {"id": "<record id>", "field": "<field>", "from": <published value>,
     "to": <corrected value>, "evidence_url": "<original source URL>",
     "evidence": "<what the source says>", "finding": "<finding id>",
     "reviewed": "YYYY-MM-DD"}

An exporter calls load(dataset) once and apply(dataset, records, key=...) on
the records it is about to publish, before any publication guard runs. apply
changes a field only while it still holds the reviewed `from` value. When it
holds anything else (the source was fixed, the record changed, or the record
is gone) apply raises CorrectionError and changes nothing, so a stale
correction forces a fresh review instead of silently overwriting new data.

`field` is a top-level key or a dotted path into nested objects
("_meta.duplicate_of"). A part `name[key=value]` selects the one element of
the list `name` whose `key` equals `value` ("sources[label=As presented].url").
A missing key reads as null, so `"from": null` adds a field and `"to": null`
clears one (the key is kept, holding null).

Rules for writing entries are in scripts/corrections/README.md. Never write a
correction from memory or model knowledge: evidence_url is the original
public source, and evidence says what that source records.
"""
from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path
from typing import Any, Callable, Iterable

DIRECTORY = Path(__file__).resolve().parent
FIELDS = ("id", "field", "from", "to", "evidence_url", "evidence", "finding", "reviewed")
DATASET = re.compile(r"[a-z0-9][a-z0-9_-]{0,63}")
_SEGMENT = r"[A-Za-z_][A-Za-z0-9_]*(?:\[[A-Za-z_][A-Za-z0-9_]*=[^\[\]]*\])?"
FIELD_PATH = re.compile(_SEGMENT + r"(?:\." + _SEGMENT + r")*")
SELECTOR = re.compile(r"([A-Za-z_][A-Za-z0-9_]*)\[([A-Za-z_][A-Za-z0-9_]*)=([^\[\]]*)\]")
_MISSING = object()


class CorrectionError(ValueError):
    """A correction file is malformed or no longer matches the data it corrects."""


CorrectionMismatch = CorrectionError  # the name the bills exporter's first copy used


def path_for(dataset: str, directory: Path | None = None) -> Path:
    if not isinstance(dataset, str) or not DATASET.fullmatch(dataset):
        raise CorrectionError(f"invalid correction dataset name: {dataset!r}")
    return Path(directory or DIRECTORY) / f"{dataset}.json"


def _check_entry(entry: Any, where: str) -> None:
    if not isinstance(entry, dict):
        raise CorrectionError(f"{where}: an entry must be an object")
    missing = [f for f in FIELDS if f not in entry]
    extra = sorted(set(entry) - set(FIELDS))
    if missing or extra:
        raise CorrectionError(f"{where}: missing fields {missing} or unknown fields {extra}")
    for name in ("id", "field", "evidence_url", "evidence", "finding", "reviewed"):
        if not isinstance(entry[name], str) or not entry[name].strip():
            raise CorrectionError(f"{where}: {name} must be a non-empty string")
    if not FIELD_PATH.fullmatch(entry["field"]):
        raise CorrectionError(f"{where}: field {entry['field']!r} is not a key or dotted path")
    if not re.match(r"https?://[^\s/]+\.[^\s]+$", entry["evidence_url"]):
        raise CorrectionError(f"{where}: evidence_url must be the original source's http(s) URL")
    try:
        date.fromisoformat(entry["reviewed"])
    except ValueError:
        raise CorrectionError(f"{where}: reviewed must be an ISO date (YYYY-MM-DD)") from None
    if not re.fullmatch(r"\d{4}-\d\d-\d\d", entry["reviewed"]):
        raise CorrectionError(f"{where}: reviewed must be an ISO date (YYYY-MM-DD)")
    if entry["from"] == entry["to"]:
        raise CorrectionError(f"{where}: from and to are equal, so there is nothing to correct")


def load(dataset: str, directory: Path | None = None) -> list[dict]:
    """The validated entries for `dataset`; [] when it has no correction file."""
    path = path_for(dataset, directory)
    if not path.is_file():
        return []
    try:
        entries = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as exc:
        raise CorrectionError(f"{path.name}: not valid JSON ({exc})") from None
    if not isinstance(entries, list):
        raise CorrectionError(f"{path.name}: must be a JSON list of correction entries")
    seen = set()
    for n, entry in enumerate(entries):
        where = f"{path.name}[{n}]"
        _check_entry(entry, where)
        identity = (entry["id"], entry["field"])
        if identity in seen:
            raise CorrectionError(f"{where}: a second correction for {entry['id']} {entry['field']}")
        seen.add(identity)
    return entries


def _select(items: Any, key: str, value: str, field: str) -> Any:
    """The one element of the list `items` whose `key` equals `value` (as text)."""
    if not isinstance(items, list):
        return _MISSING
    hits = [x for x in items if isinstance(x, dict) and str(x.get(key)) == value]
    if len(hits) > 1:
        raise CorrectionError(f"{field}: {len(hits)} elements have {key}={value}, expected one")
    return hits[0] if hits else _MISSING


def _step(value: Any, part: str, field: str) -> Any:
    selector = SELECTOR.fullmatch(part)
    name = selector.group(1) if selector else part
    if not isinstance(value, dict) or name not in value:
        return _MISSING
    value = value[name]
    return _select(value, selector.group(2), selector.group(3), field) if selector else value


def _get(record: dict, field: str) -> Any:
    value: Any = record
    for part in field.split("."):
        value = _step(value, part, field)
        if value is _MISSING:
            return None
    return value


def _set(record: dict, field: str, value: Any) -> None:
    """Set `field`. A dotted part creates a missing object; a `name[key=value]`
    part must already select exactly one list element (it is never created)."""
    parts = field.split(".")
    target = record
    for part in parts[:-1]:
        if SELECTOR.fullmatch(part):
            child = _step(target, part, field)
            if child is _MISSING:
                raise CorrectionError(f"cannot set {field}: {part} selects no element")
        else:
            child = target.get(part, _MISSING)
            if child is _MISSING or child is None:
                child = target[part] = {}
        if not isinstance(child, dict):
            raise CorrectionError(f"cannot set {field}: {part} is not an object")
        target = child
    if SELECTOR.fullmatch(parts[-1]):
        raise CorrectionError(f"cannot set {field}: the last part must name a field")
    target[parts[-1]] = value


def _index(records: dict | Iterable[dict], key: str | Callable[[dict], Any]) -> dict:
    if isinstance(records, dict):
        return records
    get = key if callable(key) else (lambda r: r.get(key))
    indexed = {}
    for record in records:
        rid = get(record)
        if rid in indexed:
            raise CorrectionError(f"two records share the id {rid!r}")
        indexed[rid] = record
    return indexed


def apply(dataset: str, records: dict | Iterable[dict], key: str | Callable[[dict], Any] = "id",
          entries: list[dict] | None = None, directory: Path | None = None) -> list[dict]:
    """Apply every correction for `dataset` to `records`, all or none.

    `records` is a dict of id -> record, or an iterable of record dicts whose
    id is `key` (a field name or a function of the record). `entries` defaults
    to load(dataset). Returns the applied entries, in file order; the caller
    may log them or carry them on the record. Raises CorrectionError, before
    changing anything, when any entry's record is missing or its field no
    longer holds `from`.
    """
    entries = load(dataset, directory) if entries is None else entries
    if not entries:
        return []
    for n, entry in enumerate(entries):
        _check_entry(entry, f"{dataset}[{n}]")
    indexed = _index(records, key)
    problems = []
    for entry in entries:
        record = indexed.get(entry["id"])
        if not isinstance(record, dict):
            problems.append(f"{entry['id']}: record not found ({entry['finding']})")
            continue
        current = _get(record, entry["field"])
        if current != entry["from"]:
            state = "already holds the corrected value; remove the correction" if current == entry["to"] \
                else f"now holds {json.dumps(current, ensure_ascii=False)[:120]}"
            problems.append(f"{entry['id']} {entry['field']}: expected "
                            f"{json.dumps(entry['from'], ensure_ascii=False)[:120]} but it {state} ({entry['finding']})")
    if problems:
        raise CorrectionError(f"{len(problems)} {dataset} correction(s) need review: " + "; ".join(problems))
    for entry in entries:
        _set(indexed[entry["id"]], entry["field"], entry["to"])
    return list(entries)


if __name__ == "__main__":
    import sys
    names = sys.argv[1:] or sorted(p.stem for p in DIRECTORY.glob("*.json"))
    for name in names:
        print(f"{name}: {len(load(name))} valid correction(s)")
