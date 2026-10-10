#!/usr/bin/env python3
"""Offline federal division cadence, catch-up window and publication guard."""
from __future__ import annotations

import argparse
from datetime import date, timedelta
import json
from pathlib import Path
import subprocess
import sys

# Use the very same sitting days and Sydney timezone as the bill refresh.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from bills_guard import cadence

VOTES = "portal/public/votes.json"
DIVISIONS = "portal/public/divisions"
CATCH_UP_SINCE = "2026-08-20"


def head(path: str) -> dict:
    result = subprocess.run(["git", "show", f"HEAD:{path}"], capture_output=True)
    if result.returncode:
        raise ValueError("cannot read committed division exports")
    return json.loads(result.stdout)


def since(day: str, catch_up: bool = False) -> str:
    if catch_up:
        return CATCH_UP_SINCE
    lookback = (date.fromisoformat(day) - timedelta(days=60)).isoformat()
    rows = head(f"{DIVISIONS}/index.json")["divisions"]
    # A slow source must never fall outside the rolling lookback. Re-list from
    # each chamber's last published day too, including the whole day.
    latest = [max((r["date"] for r in rows if r["key"].startswith(f"federal-{house}-")),
                  default=CATCH_UP_SINCE) for house in ("representatives", "senate")]
    return min(lookback, *latest)


def votes_guard(old: dict, new: dict) -> None:
    if type(new.get("_meta", {}).get("schema")) is not int or new["_meta"]["schema"] != 1:
        raise ValueError("votes.json must retain mobile schema 1")
    people = {k: p for k, p in new.items() if not k.startswith("_")}
    allowed = {"name", "party", "jurisdiction", "house", "ayes", "noes", "divisions_total", "years", "for", "against"}
    for key, person in people.items():
        if not isinstance(person, dict) or set(person) - allowed or not person.get("name") \
                or not isinstance(person.get("for"), list) or not isinstance(person.get("against"), list):
            raise ValueError("votes.json person shape changed")
    for key, prior in old.items():
        if key.startswith("_"):
            continue
        if key not in people:
            raise ValueError("votes.json lost a published identity")
        for field in ("ayes", "noes", "divisions_total"):
            if field in prior and (type(people[key].get(field)) is not int or people[key][field] < prior[field]):
                raise ValueError(f"votes.json {field} shrank for a published identity")
    before = old.get("_meta", {}).get("latest_division_date_by_jurisdiction", {})
    after = new["_meta"].get("latest_division_date_by_jurisdiction", {})
    if any(after.get(jur, "") < dt for jur, dt in before.items()):
        raise ValueError("votes.json latest division date went backwards")


def index_keys(index: dict) -> set[str]:
    rows = index["divisions"]
    keys = {r["key"] for r in rows}
    if type(index["count"]) is not int or index["count"] != len(rows) or len(keys) != len(rows):
        raise ValueError("division index count or unique keys do not match")
    return keys


def check(votes_only: bool = False) -> str:
    votes_guard(head(VOTES), json.loads(Path(VOTES).read_text()))
    if votes_only:
        return "votes.json: schema 1; published identities and totals retained"
    old = head(f"{DIVISIONS}/index.json")
    new = json.loads(Path(f"{DIVISIONS}/index.json").read_text())
    old_keys, new_keys = index_keys(old), index_keys(new)
    if old_keys - new_keys:
        raise ValueError("published divisions vanished")
    for row in new["divisions"]:
        if row["slug"] != f"division-{row['key']}" or Path(row["slug"]).name != row["slug"]:
            raise ValueError("invalid division identity")
        if not Path(f"{DIVISIONS}/{row['slug']}.json").is_file():
            raise ValueError("published division file vanished")
    federal = [r for r in new["divisions"] if r["key"].startswith("federal-")]
    return f"divisions: {len(new_keys - old_keys)} new; federal latest {max((r['date'] for r in federal), default='unavailable')}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--date")
    ap.add_argument("--since-date")
    ap.add_argument("--catch-up", action="store_true")
    ap.add_argument("--votes-only", action="store_true")
    args = ap.parse_args()
    try:
        result = cadence(args.date, args.catch_up) if args.date else since(args.since_date, args.catch_up) \
            if args.since_date else check(args.votes_only)
        print(result)
        return 0
    except (ValueError, KeyError, TypeError, OSError) as exc:
        print(f"REFUSED divisions: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
