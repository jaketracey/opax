#!/usr/bin/env python3
"""Publish the "On this day" index: divisions and speeches by calendar date.

Writes portal/public/parliament/on-this-day/MM-DD.json, one small file for each of the
366 calendar dates, from the bill files already in this repo (portal/public/bills/*.json,
written by scripts/export_bills.py). Each file lists every division and every speech the
bill files record on that month and day, in any year, in date order. Nothing is chosen
or ranked here; only a speech with no date or no named speaker is left out. The reader's
app picks by date alone. A date with no record still gets a file, with empty lists, so a
reader gets a definite answer.

    python scripts/build_on_this_day.py            # rebuild from portal/public/bills
    python scripts/build_on_this_day.py --check    # exit 1 if the published files are stale

A file is rewritten only when its records change; its generated_at is the bills index's
stamp at that rebuild. It is run by hand after a bills refresh; the nightly does not run it.

No network and no database. See docs/DATA-ON-THIS-DAY.md.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
BILLS = ROOT / "portal/public/bills"
OUT = ROOT / "portal/public/parliament/on-this-day"
SCHEMA_VERSION = 1
DATE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")
DAYS_IN_MONTH = (31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
NOTE = ("Every division, and every dated speech with a named speaker, recorded on a bill on "
        "this month and day, in any year, oldest first. Nothing is ranked.")
SOURCES = {
    "divisions": {"publisher": "They Vote For You", "url": "https://theyvoteforyou.org.au/"},
    "speeches": {"publisher": "Hansard", "via": "OPAX bill records"},
}


class IndexError_(ValueError):
    """The bill files are not in the shape this builder understands; publish nothing."""


def natural(key: str) -> list:
    """Sort keys so "r9" comes before "r10": digit runs compare as numbers."""
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", key)]


def all_days() -> list[str]:
    return [f"{m:02d}-{d:02d}" for m, n in enumerate(DAYS_IN_MONTH, 1) for d in range(1, n + 1)]


def bill_name(bill: dict) -> str:
    return (bill.get("short_title") or bill.get("title") or bill["key"]).strip()


def collect(bills: list[dict]) -> dict[str, dict]:
    """Month-day -> {"divisions": [...], "speeches": [...], "bills": {key: name}}.

    Each division and speech is listed once, oldest first.

    A division or speech recorded under several bills (a cognate debate) is listed once,
    under the first of those bills in register order, so a rebuild never changes it.
    """
    divisions: dict[str, dict] = {}
    speeches: dict[str, dict] = {}
    names = {bill["key"]: bill_name(bill) for bill in bills}
    for bill in sorted(bills, key=lambda b: natural(b["key"])):
        for row in bill.get("divisions") or []:
            key, date = row.get("key"), row.get("date") or ""
            if not key or not DATE.match(date):
                raise IndexError_(f"{bill['key']}: a division without a key or date")
            divisions.setdefault(key, {
                "key": key, "date": date[:10], "house": row.get("house"),
                "stage": (row.get("stage") or None), "bill": bill["key"],
                "url": row.get("url"),
            })
        for row in bill.get("speeches") or []:
            slug, date = row.get("slug"), row.get("date") or ""
            if not slug or not DATE.match(date) or not (row.get("speaker") or "").strip():
                continue  # an undated or unattributed speech has no place in a dated index
            speeches.setdefault(slug, {
                "slug": slug, "date": date[:10], "speaker": row["speaker"].strip(),
                "bill": bill["key"],
            })
    days: dict[str, dict] = {day: {"divisions": [], "speeches": [], "bills": {}}
                             for day in all_days()}
    for kind, rows, ident in (("divisions", divisions, "key"), ("speeches", speeches, "slug")):
        for row in sorted(rows.values(), key=lambda r: (r["date"], natural(r[ident]))):
            day = row["date"][5:10]
            if day not in days:
                raise IndexError_(f"{row[ident]}: {row['date']} is not a calendar date")
            days[day][kind].append(row)
            # Each bill's name once a file, not once a row.
            days[day]["bills"][row["bill"]] = names[row["bill"]]
    for lists in days.values():
        lists["bills"] = dict(sorted(lists["bills"].items(), key=lambda kv: natural(kv[0])))
    return days


def render(day: str, lists: dict, generated_at: str) -> str:
    return json.dumps({
        "schema_version": SCHEMA_VERSION, "day": day, "generated_at": generated_at,
        "note": NOTE, "sources": SOURCES,
        "bills": lists["bills"],
        "divisions": lists["divisions"], "speeches": lists["speeches"],
    }, ensure_ascii=False, separators=(",", ":")) + "\n"


def changed(path: Path, text: str) -> bool:
    """Whether the published file differs from `text` in anything but its stamp.

    `generated_at` follows the bills index, which moves whenever any bill changes. A date
    whose records did not change keeps its file, old stamp and all, so a rebuild rewrites
    only the dates that gained or lost a record.
    """
    try:
        old = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return True
    new = json.loads(text)
    if not isinstance(old, dict):
        return True
    return ({k: v for k, v in old.items() if k != "generated_at"}
            != {k: v for k, v in new.items() if k != "generated_at"})


def load_bills(folder: Path) -> tuple[list[dict], str]:
    index = json.loads((folder / "index.json").read_text(encoding="utf-8"))
    generated_at = index.get("generated_at")
    if not isinstance(generated_at, str) or not DATE.match(generated_at):
        raise IndexError_("bills/index.json has no generated_at")
    bills = [json.loads(p.read_text(encoding="utf-8"))
             for p in sorted(folder.glob("*.json")) if p.name != "index.json"]
    if not bills:
        raise IndexError_("no bill files")
    return bills, generated_at


def build(folder: Path = BILLS) -> dict[str, str]:
    """File name -> text for every calendar date."""
    bills, generated_at = load_bills(folder)
    return {f"{day}.json": render(day, lists, generated_at)
            for day, lists in collect(bills).items()}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--bills", type=Path, default=BILLS)
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument("--check", action="store_true",
                        help="write nothing; exit 1 if the published files differ")
    args = parser.parse_args(argv)
    try:
        files = build(args.bills)
    except (IndexError_, KeyError, json.JSONDecodeError) as error:
        print(f"build_on_this_day: {error}; nothing written", file=sys.stderr)
        return 2
    stale = [name for name, text in files.items() if changed(args.out / name, text)]
    extra = sorted(p.name for p in args.out.glob("*.json") if p.name not in files) \
        if args.out.is_dir() else []
    if args.check:
        if stale or extra:
            print(f"build_on_this_day: {len(stale)} stale, {len(extra)} unexpected", file=sys.stderr)
            return 1
        return 0
    args.out.mkdir(parents=True, exist_ok=True)
    for name in stale:
        tmp = args.out / (name + ".tmp")
        tmp.write_text(files[name], encoding="utf-8")
        tmp.replace(args.out / name)
    for name in extra:
        (args.out / name).unlink()
    total = sum(len(text.encode("utf-8")) for text in files.values())
    print(f"build_on_this_day: {len(files)} files, {total:,} bytes, {len(stale)} rewritten")
    return 0


if __name__ == "__main__":
    sys.exit(main())
