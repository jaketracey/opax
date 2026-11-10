#!/usr/bin/env python3
"""Offline bill publication guard, delta summary and reviewed refresh calendar."""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import date, datetime, timedelta
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bills_registry.bills_stages import BILL_STAGE_ORDER, lifecycle, stage_signature  # noqa: E402

BILLS = "portal/public/bills"
SCRIPTS = Path(__file__).resolve().parents[1]
# Reviewed removals the guard accepts rather than holds. Each file carries a
# source URL per entry; nothing outside them may disappear.
SUPPRESSED = SCRIPTS / "bills_registry/suppressed.json"
LINK_CORRECTIONS = SCRIPTS / "corrections/bill_links.json"
SYDNEY = ZoneInfo("Australia/Sydney")
MAX_HELD = 5
MAX_HELD_PERCENT = 2
# Store actual sitting days, not refresh dates. Extend before the 2027 sittings;
# unknown dates retain the Sunday cadence without requesting APH's calendar.
SITTING_CALENDAR = Path(__file__).resolve().parents[1] / "hubs/sitting-2026.json"
SITTING_RANGES = tuple(
    (period["start"], period["end"])
    for period in json.loads(SITTING_CALENDAR.read_text())["periods"]
    if period.get("refresh_bills")
)


def cadence(day: str | datetime, catch_up: bool = False) -> str:
    if isinstance(day, datetime):
        if day.tzinfo is None:
            raise ValueError("cadence timestamp must include a timezone")
        today = day.astimezone(SYDNEY).date()
    else:
        today = date.fromisoformat(day)
    if catch_up:
        return "catch-up"
    yesterday = today - timedelta(days=1)
    if any(date.fromisoformat(start) <= yesterday <= date.fromisoformat(end)
           for start, end in SITTING_RANGES):
        return "after-sitting"
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


def stage_records(doc: dict) -> Counter:
    # Event signatures identify corrections for logging, not removals.
    # URL/title enrichment and event reordering do not change a signature.
    # Multiple recorded events can share a normalised stage/house/date.
    return Counter((s.get("stage"), s.get("house"), s.get("date")) for s in doc.get("key_dates", []))


def latest_stage_date(doc: dict) -> date | None:
    dates = [date.fromisoformat(s[2]) for s in stage_records(doc) if s[2]]
    return max(dates, default=None)


def reviewed_suppressions(path: Path = SUPPRESSED) -> set[str]:
    if not path.exists():
        return set()
    return {row["key"] for row in json.loads(path.read_text())["suppressed"]}


def reviewed_moves(path: Path = LINK_CORRECTIONS) -> set[tuple[str, str]]:
    """(bill key, division key) pairs that a reviewed correction moved to
    another bill. Losing one of these from its old bill is not a regression."""
    if not path.exists():
        return set()
    moves = set()
    for entry in json.loads(path.read_text()):
        bill, kind, target = entry["id"].split("|", 2)
        if kind == "division" and entry["field"] == "bill_key" and entry["from"] == bill:
            moves.add((bill, target))
    return moves


def regressions(old: dict, new: dict, moved: set[tuple[str, str]] = frozenset()) -> list[str]:
    reasons = []
    for name, was, now in (
        ("latest stage date", latest_stage_date(old), latest_stage_date(new)),
        ("status_as_of", old.get("status_as_of"), new.get("status_as_of")),
    ):
        if was and (not now or now < was):
            reasons.append(f"{name} went backwards ({was} -> {now or 'missing'})")
    # Check the status's lifecycle rank too: retained stage history must not
    # conceal a degraded status such as passed -> before_parliament.
    if BILL_STAGE_ORDER.get(new.get("status"), -2) < BILL_STAGE_ORDER.get(old.get("status"), -2):
        reasons.append(f"status went backwards ({old.get('status')} -> {new.get('status')})")
    # A stage now flagged negatived (bills-004) was never passage, so rank the
    # HEAD copy with the same flags rather than reading the flag as a regression.
    negatived = {stage_signature(s) for s in new.get("key_dates", []) if s.get("negatived")}
    if lifecycle(new) < lifecycle(old, negatived):
        reasons.append("bill lifecycle went backwards")
    removed_stages = len(old.get("key_dates", [])) - len(new.get("key_dates", []))
    if removed_stages > 0:
        reasons.append(f"{removed_stages} recorded stages removed")
    old_divisions = [d for d in old.get("divisions", []) if (old.get("key"), d["key"]) not in moved]
    new_divisions = new.get("divisions", [])
    if len(new_divisions) < len(old_divisions):
        reasons.append(f"division count decreased ({len(old_divisions)} -> {len(new_divisions)})")
    removed_divisions = {d["key"] for d in old_divisions} - {d["key"] for d in new_divisions}
    if removed_divisions:
        reasons.append(f"{len(removed_divisions)} divisions removed")
    return reasons


def check(apply_holds: bool = False, held_report: Path | None = None) -> str:
    head = read_head()
    current = {p.as_posix(): p.read_bytes() for p in Path(BILLS).glob("*.json")}
    old_index, old = projection(head)
    new_index, new = projection(current)
    # A reviewed suppression (bills-008) removes a duplicate record only when it
    # is listed in suppressed.json and the new index redirects it to a kept bill.
    redirects = new_index.get("redirects") or {}
    reviewed = reviewed_suppressions()
    suppressed = {key for key in set(old) - set(new)
                  if key in reviewed and redirects.get(key) in new}
    if new_index["count"] < old_index["count"] - len(suppressed):
        raise ValueError(f"bill count shrank: {old_index['count']} -> {new_index['count']}")
    missing = set(old) - set(new) - suppressed
    missing_files = set(head) - set(current) - {f"{BILLS}/{key}.json" for key in suppressed}
    if missing or missing_files:
        raise ValueError(f"existing bills disappeared: {len(missing)} keys, {len(missing_files)} files")
    for key in sorted(suppressed):
        print(f"bill {key}: suppressed as a reviewed duplicate of {redirects[key]}", file=sys.stderr)
    old = {key: doc for key, doc in old.items() if key not in suppressed}
    moved = reviewed_moves()
    held = {key: reasons for key in sorted(old) if (reasons := regressions(old[key], new[key], moved))}
    if held_report is not None:
        held_report.write_text(json.dumps(held, indent=1) + "\n")
    for key, reasons in held.items():
        print(f"HELD bill {key}: {'; '.join(reasons)}", file=sys.stderr)
    if len(held) > MAX_HELD or len(held) * 100 > len(old) * MAX_HELD_PERCENT:
        print(f"WARNING: HOLD ALL BILLS: {len(held)}/{len(old)} bills regress; "
              f"limit is {MAX_HELD} bills and {MAX_HELD_PERCENT}% of HEAD", file=sys.stderr)
        raise ValueError("degraded source: whole bills update held")
    if held and not apply_holds:
        raise ValueError("regressed copies remain in the bills update")
    if held:
        old_rows = {row["key"]: row for row in old_index["bills"]}
        for key in held:
            path = f"{BILLS}/{key}.json"
            Path(path).write_bytes(head[path])
            current[path], new[key] = head[path], old[key]
        # Holding a document must also retain its HEAD status/counts in the index.
        new_index["bills"] = sorted(
            [old_rows.get(row["key"], row) if row["key"] in held else row for row in new_index["bills"]],
            key=lambda row: (row.get("introduced") or "", row["key"]), reverse=True)
        Path(f"{BILLS}/index.json").write_text(json.dumps(new_index, ensure_ascii=False, indent=1) + "\n")
        print(f"WARNING bills: retained {len(held)} regressed bills from HEAD", file=sys.stderr)
    for key in sorted(set(old) - set(held)):
        before, after = stage_records(old[key]), stage_records(new[key])
        replaced, corrected = before - after, after - before
        if replaced and corrected:
            # Events have no stable IDs. Log the unmatched old/new signatures
            # together rather than guessing how multiple corrections pair up.
            print(f"bill {key}: stage event corrected: "
                  f"{json.dumps(list(replaced.elements()))} -> {json.dumps(list(corrected.elements()))}",
                  file=sys.stderr)
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
    ap.add_argument("--apply-holds", action="store_true", help="retain HEAD documents/index rows for isolated regressions")
    ap.add_argument("--held-report", type=Path, help="write held bill keys and reasons for the nightly warning")
    args = ap.parse_args()
    try:
        print(cadence(args.date, args.catch_up) if args.date else check(args.apply_holds, args.held_report))
        return 0
    except (ValueError, KeyError, TypeError, OSError, tarfile.TarError) as exc:
        print(f"REFUSED bills: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
