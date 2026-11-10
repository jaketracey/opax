"""Reviewed one-off corrections to published records.

Each dataset has a file `scripts/corrections/<dataset>.json`: a list of entries

    {"id": "<record id>", "field": "<field>", "from": <published value>,
     "to": <corrected value>, "evidence_url": "<original source URL>",
     "evidence": "<what the source says>", "finding": "<finding id>",
     "reviewed": "YYYY-MM-DD"}

`apply(dataset, records, key=...)` sets `record[field] = to` on the record whose
key is `id`, but only while the record still carries `from`. When the record is
missing, or its value is neither `from` nor already `to`, it raises
CorrectionMismatch: a source that has been fixed, or a record that has changed,
forces a review instead of a silent overwrite.

Every entry must name an original public source. Corrections never come from
model knowledge.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Callable, Iterable

DIR = Path(__file__).resolve().parent
REQUIRED = ("id", "field", "from", "to", "evidence_url", "evidence", "finding", "reviewed")


class CorrectionMismatch(ValueError):
    """A correction no longer matches the record it was reviewed against."""


def load(dataset: str, directory: Path = DIR) -> list[dict]:
    path = directory / f"{dataset}.json"
    if not path.exists():
        return []
    entries = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(entries, list):
        raise CorrectionMismatch(f"{path.name}: expected a list of corrections")
    for i, entry in enumerate(entries):
        missing = [k for k in REQUIRED if k not in entry]
        if missing:
            raise CorrectionMismatch(f"{path.name}[{i}]: missing {', '.join(missing)}")
        if not str(entry["evidence_url"]).startswith("https://"):
            raise CorrectionMismatch(f"{path.name}[{i}]: evidence_url must be an https source URL")
    return entries


def apply(dataset: str, records: Iterable[dict], key: str | Callable[[dict], str] = "id",
          directory: Path = DIR, entries: list[dict] | None = None) -> list[dict]:
    """Apply every correction for `dataset` to `records` in place.

    Returns the entries applied. An entry whose record already carries `to` is
    counted as applied (a rerun is a no-op); anything else that does not match
    raises CorrectionMismatch."""
    entries = load(dataset, directory) if entries is None else entries
    keyof = key if callable(key) else (lambda r: r.get(key))
    by_id: dict[str, list[dict]] = {}
    for record in records:
        by_id.setdefault(str(keyof(record)), []).append(record)
    applied = []
    for entry in entries:
        matches = by_id.get(str(entry["id"]), [])
        if len(matches) != 1:
            raise CorrectionMismatch(
                f"{dataset}: {entry['id']} ({entry['finding']}) matches {len(matches)} records, expected 1")
        record, field = matches[0], entry["field"]
        current = record.get(field)
        if current == entry["to"]:
            applied.append(entry)
            continue
        if current != entry["from"]:
            raise CorrectionMismatch(
                f"{dataset}: {entry['id']}.{field} is {current!r}, reviewed as {entry['from']!r} "
                f"({entry['finding']}); review the correction")
        record[field] = entry["to"]
        applied.append(entry)
    return applied
