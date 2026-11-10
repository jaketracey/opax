"""Reviewed one-off corrections for published datasets.

Each dataset has a file scripts/corrections/<dataset>.json: a list of entries

    {"id": "<record id>", "field": "<field>", "from": <published value>,
     "to": <corrected value>, "evidence_url": "<original source URL>",
     "evidence": "<what the source says>", "finding": "<finding id>",
     "reviewed": "YYYY-MM-DD"}

`field` is a top-level field name, or a dotted path into nested lists and
objects. A path segment `name[key=value]` selects the one element of the list
`name` whose `key` equals `value` (for example "sources[label=As presented].url").

`apply` fails loudly when a record, a path or a `from` value no longer matches,
so a fixed source or a changed record forces a fresh review instead of a silent
overwrite. Every entry must carry an original source URL and the evidence.
"""
from __future__ import annotations

import json
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
REQUIRED = ("id", "field", "from", "to", "evidence_url", "evidence", "finding", "reviewed")
SEGMENT = re.compile(r"^([^\[\].]+)(?:\[([^=\]]+)=([^\]]*)\])?$")


class CorrectionError(ValueError):
    pass


def load(dataset, root=HERE):
    path = Path(root) / f"{dataset}.json"
    if not path.is_file():
        return []
    entries = json.loads(path.read_bytes())
    if not isinstance(entries, list):
        raise CorrectionError(f"{path}: a list of corrections is required")
    for i, entry in enumerate(entries):
        missing = [k for k in REQUIRED if k not in entry]
        if missing:
            raise CorrectionError(f"{path} entry {i}: missing {', '.join(missing)}")
        if not re.match(r"https?://", str(entry["evidence_url"])):
            raise CorrectionError(f"{path} entry {i}: evidence_url must be the original source URL")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(entry["reviewed"])):
            raise CorrectionError(f"{path} entry {i}: reviewed must be an ISO date")
    return entries


def _segments(field):
    parts = []
    for part in field.split("."):
        match = SEGMENT.match(part)
        if not match:
            raise CorrectionError(f"unreadable correction field path {field!r}")
        parts.append(match.groups())
    return parts


def _parent(record, field):
    """(container, final name) for the field path, failing on any ambiguity."""
    node = record
    parts = _segments(field)
    for i, (name, key, value) in enumerate(parts):
        last = i == len(parts) - 1
        if key is None:
            if last:
                return node, name
            if not isinstance(node, dict) or name not in node:
                raise CorrectionError(f"path {field!r}: no {name!r}")
            node = node[name]
            continue
        items = node.get(name) if isinstance(node, dict) else None
        if not isinstance(items, list):
            raise CorrectionError(f"path {field!r}: {name!r} is not a list")
        hits = [x for x in items if isinstance(x, dict) and str(x.get(key)) == value]
        if len(hits) != 1:
            raise CorrectionError(f"path {field!r}: {len(hits)} elements of {name!r} have {key}={value!r}, one required")
        if last:
            raise CorrectionError(f"path {field!r} must end in a field name")
        node = hits[0]
    raise CorrectionError(f"empty correction field path {field!r}")


def apply(dataset, records, key="id", root=HERE, entries=None):
    """Apply the dataset's reviewed corrections in place; return the entries applied.

    Raises CorrectionError when a record id is absent, a path does not resolve or
    the current value is not the reviewed `from` value.
    """
    entries = load(dataset, root) if entries is None else entries
    by_id = {}
    for record in records:
        by_id.setdefault(record.get(key), []).append(record)
    applied = []
    for entry in entries:
        found = by_id.get(entry["id"], [])
        if len(found) != 1:
            raise CorrectionError(f"{dataset}: {len(found)} records with {key}={entry['id']!r}, one required ({entry['finding']})")
        container, name = _parent(found[0], entry["field"])
        if not isinstance(container, dict) or name not in container:
            raise CorrectionError(f"{dataset} {entry['id']}: no field {entry['field']!r} ({entry['finding']})")
        if container[name] != entry["from"]:
            raise CorrectionError(f"{dataset} {entry['id']} {entry['field']}: current value {container[name]!r} "
                                  f"is not the reviewed 'from' {entry['from']!r}; review the correction ({entry['finding']})")
        container[name] = entry["to"]
        applied.append(entry)
    return applied
