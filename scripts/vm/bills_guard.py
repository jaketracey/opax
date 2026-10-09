#!/usr/bin/env python3
"""Offline bill publication guard, delta summary and reviewed refresh calendar."""
from __future__ import annotations

import argparse
from datetime import date
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile

BILLS = "portal/public/bills"
# Reviewed remaining 2026 sittings supplied for the ops lane. Extend before 2027;
# unknown dates retain the Sunday cadence without requesting APH's calendar.
SITTING_RANGES = (
    ("2026-10-12", "2026-10-15"),
    ("2026-10-26", "2026-10-29"),
    ("2026-11-16", "2026-11-19"),
    ("2026-11-23", "2026-11-26"),
)


def cadence(day: str, catch_up: bool = False) -> str:
    today = date.fromisoformat(day)
    if catch_up:
        return "catch-up"
    if any(date.fromisoformat(start) <= today <= date.fromisoformat(end)
           for start, end in SITTING_RANGES):
        return "sitting"
    return "weekly" if today.isoweekday() == 7 else "skip"


def git(*args: str) -> bytes:
    result = subprocess.run(["git", *args], capture_output=True)
    if result.returncode:
        # Do not include process arguments or potentially sensitive stderr.
        raise ValueError("cannot read committed bills from git")
    return result.stdout


def read_head() -> dict[str, bytes]:
    # One git operation for ~3,000 files, rather than a subprocess per bill.
    with tarfile.open(fileobj=io.BytesIO(git("archive", "HEAD", "--", BILLS))) as archive:
        return {member.name: archive.extractfile(member).read()
                for member in archive if member.isfile() and member.name.endswith(".json")}


def projection(files: dict[str, bytes]) -> tuple[dict, dict[str, dict]]:
    index = json.loads(files[f"{BILLS}/index.json"])
    rows = index["bills"]
    keys = [row["key"] for row in rows]
    if (type(index["count"]) is not int or index["count"] != len(keys)
            or len(set(keys)) != len(keys)):
        raise ValueError("bill index count or unique keys do not match its rows")
    docs = {}
    for key in keys:
        if not isinstance(key, str) or Path(key).name != key:
            raise ValueError("invalid bill key")
        path = f"{BILLS}/{key}.json"
        if path not in files:
            raise ValueError(f"bill file missing: {key}")
        doc = json.loads(files[path])
        if doc["key"] != key:
            raise ValueError(f"bill file identity mismatch: {key}")
        docs[key] = doc
    return index, docs


def check() -> str:
    head = read_head()
    current = {p.as_posix(): p.read_bytes() for p in Path(BILLS).glob("*.json")}
    old_index, old = projection(head)
    new_index, new = projection(current)
    if new_index["count"] < old_index["count"]:
        raise ValueError(f"bill count shrank: {old_index['count']} -> {new_index['count']}")
    missing = set(old) - set(new)
    missing_files = set(head) - set(current)
    if missing or missing_files:
        raise ValueError(f"existing bills disappeared: {len(missing)} keys, {len(missing_files)} files")
    added = len(set(new) - set(old))
    changed = sum(current[f"{BILLS}/{key}.json"] != head[f"{BILLS}/{key}.json"] for key in old)
    titles = sponsors = 0
    for key, doc in new.items():
        prior = old.get(key, {})
        sponsors += bool(doc.get("sponsor_person_id") and not prior.get("sponsor_person_id"))
        divisions = {d["key"]: d for d in prior.get("divisions", [])}
        titles += sum(bool(d.get("title") and not divisions.get(d["key"], {}).get("title"))
                      for d in doc.get("divisions", []))
    return (f"bills: {added} new, {changed} changed, {titles} titles filled, "
            f"{sponsors} sponsor IDs filled")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--date", help="choose cadence for this Sydney date instead of checking bills")
    ap.add_argument("--catch-up", action="store_true")
    args = ap.parse_args()
    try:
        print(cadence(args.date, args.catch_up) if args.date else check())
        return 0
    except (ValueError, KeyError, TypeError, OSError, tarfile.TarError) as exc:
        print(f"REFUSED bills: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
