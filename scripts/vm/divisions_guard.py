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
from bills_guard import BILLS, cadence, projection, read_head
from mobile_votes_contract import validate_votes

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
    people = validate_votes(new)
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
    if any((after.get(jur) or "") < dt for jur, dt in before.items() if dt):
        raise ValueError("votes.json latest division date went backwards")


def index_keys(index: dict) -> set[str]:
    rows = index["divisions"]
    keys = {r["key"] for r in rows}
    if type(index["count"]) is not int or index["count"] != len(rows) or len(keys) != len(rows):
        raise ValueError("division index count or unique keys do not match")
    return keys


def restore_bill_links() -> str:
    """Restore the division relationship field, retaining other bill updates.

    The bill index carries the relationship count too. HEAD is the same
    accepted snapshot used by the division rollback; no DB is touched.
    """
    _, old_docs = projection(read_head())
    index_path = Path(BILLS) / "index.json"
    index = json.loads(index_path.read_text())
    changed = 0
    for row in index["bills"]:
        path = Path(BILLS) / f"{row['key']}.json"
        doc = json.loads(path.read_text())
        prior = old_docs.get(row["key"], {})
        if doc.get("divisions", []) != prior.get("divisions", []):
            if "divisions" in prior or row["key"] not in old_docs:
                doc["divisions"] = prior.get("divisions", [])
            else:
                doc.pop("divisions", None)
            path.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n")
            changed += 1
        if "divisions" in row:
            row["divisions"] = len(prior.get("divisions", []))
    if changed or index != json.loads(index_path.read_text()):
        index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n")
    return f"bill division relationships restored in {changed} bill(s)"


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
    # Also catch later validation/portal-gate rollbacks of the divisions group.
    recent = json.loads(Path("portal/public/seo/recent-votes.json").read_text())
    slugs = {row["slug"] for row in new["divisions"]}
    for person in recent.get("people", {}).values():
        if any(row["division_slug"] not in slugs for row in person["recent"]):
            raise ValueError("SEO recent vote points to an unpublished division")
    for row in json.loads(Path(f"{BILLS}/index.json").read_text())["bills"]:
        bill = json.loads(Path(f"{BILLS}/{row['key']}.json").read_text())
        if any(d["key"] not in new_keys for d in bill.get("divisions", [])):
            raise ValueError("bill relationship points to an unpublished division")
    federal = [r for r in new["divisions"] if r["key"].startswith("federal-")]
    return f"divisions: {len(new_keys - old_keys)} new; federal latest {max((r['date'] for r in federal), default='unavailable')}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--date")
    ap.add_argument("--since-date")
    ap.add_argument("--catch-up", action="store_true")
    ap.add_argument("--votes-only", action="store_true")
    ap.add_argument("--restore-bill-links", action="store_true")
    args = ap.parse_args()
    try:
        result = restore_bill_links() if args.restore_bill_links else cadence(args.date, args.catch_up) if args.date else since(args.since_date, args.catch_up) \
            if args.since_date else check(args.votes_only)
        print(result)
        return 0
    except (ValueError, KeyError, TypeError, OSError) as exc:
        print(f"REFUSED divisions: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
