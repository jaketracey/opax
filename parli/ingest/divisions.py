"""
parli.ingest.divisions -- Download voting records from TheyVoteForYou API.

Iterates month-by-month from 2006-01 to 2026-03 for both chambers.
For each division, fetches detail to get individual votes.
Inserts into divisions and votes tables.

Rate limit: 1 req/sec.
Resume capability: skips months where we already have divisions in that date range.

Usage:
    python -m parli.ingest.divisions
    python -m parli.ingest.divisions --since 2023-01-01
"""

import os
import time
from datetime import date, timedelta

import requests

from parli.schema import get_db, init_db

TVFY_API = "https://theyvoteforyou.org.au/api/v1"
RATE_LIMIT = 1.0

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "ParliIntel/1.0"})


def get_api_key() -> str:
    """Read TheyVoteForYou API key from environment."""
    key = os.environ.get("TVFY_API_KEY", "")
    if not key:
        print("ERROR: TVFY_API_KEY environment variable not set.")
        print("Register at https://theyvoteforyou.org.au to get a key,")
        print("then: export TVFY_API_KEY=your_key_here")
    return key


def month_ranges(start_year: int, start_month: int,
                 end_year: int, end_month: int):
    """Yield (start_date, end_date) strings for each month in range."""
    y, m = start_year, start_month
    while (y, m) <= (end_year, end_month):
        start = date(y, m, 1)
        # End of month: go to next month day 1, subtract 1 day
        if m == 12:
            end = date(y + 1, 1, 1) - timedelta(days=1)
        else:
            end = date(y, m + 1, 1) - timedelta(days=1)
        yield start.isoformat(), end.isoformat()
        if m == 12:
            y += 1
            m = 1
        else:
            m += 1


def has_divisions_in_range(db, house: str, start_date: str, end_date: str) -> bool:
    """Check if we already have divisions for this house in this date range."""
    row = db.execute(
        """
        SELECT COUNT(*) FROM divisions
        WHERE house = ? AND date >= ? AND date <= ?
        """,
        (house, start_date, end_date),
    ).fetchone()
    return row[0] > 0


def fetch_divisions_list(api_key: str, house: str,
                         start_date: str, end_date: str) -> list[dict]:
    """Fetch list of divisions for a house in a date range."""
    params = {
        "key": api_key,
        "house": house,
        "start_date": start_date,
        "end_date": end_date,
    }
    try:
        resp = SESSION.get(
            f"{TVFY_API}/divisions.json", params=params, timeout=30
        )
        resp.raise_for_status()
        time.sleep(RATE_LIMIT)
        data = resp.json()
        return data if isinstance(data, list) else []
    except Exception as e:
        print(f"    Error fetching divisions list: {e}")
        return []


def fetch_division_detail(api_key: str, division_id: int) -> dict | None:
    """Fetch detailed division info including per-member votes."""
    try:
        resp = SESSION.get(
            f"{TVFY_API}/divisions/{division_id}.json",
            params={"key": api_key},
            timeout=30,
        )
        resp.raise_for_status()
        time.sleep(RATE_LIMIT)
        return resp.json()
    except Exception as e:
        print(f"    Error fetching division {division_id}: {e}")
        return None


def insert_division(db, div: dict, house: str) -> bool:
    """Insert a single division and its votes. Returns True on success."""
    division_id = div.get("id")
    if not division_id:
        return False

    # Check if already exists
    existing = db.execute(
        "SELECT division_id FROM divisions WHERE division_id = ?",
        (division_id,),
    ).fetchone()
    if existing:
        return False

    db.execute(
        """
        INSERT OR IGNORE INTO divisions
        (division_id, house, name, date, number, aye_votes, no_votes,
         possible_turnout, rebellions, summary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            division_id,
            house,
            div.get("name", ""),
            div.get("date", ""),
            div.get("number"),
            div.get("aye_votes"),
            div.get("no_votes"),
            div.get("possible_turnout"),
            div.get("rebellions"),
            div.get("summary", ""),
        ),
    )

    # Insert individual votes from the "votes" list in the detail response
    votes = div.get("votes", [])
    for v in votes:
        person_id = v.get("member", {}).get("id")
        if not person_id:
            # Try alternate structure
            person_id = v.get("person_id") or v.get("id")
        if not person_id:
            continue

        # Map vote values
        raw_vote = str(v.get("vote", "")).lower()
        if raw_vote in ("aye", "yes"):
            vote_val = "aye"
        elif raw_vote in ("no", "nay"):
            vote_val = "no"
        elif raw_vote in ("abstention", "abstain"):
            vote_val = "abstention"
        else:
            vote_val = "absent"

        try:
            db.execute(
                """
                INSERT OR IGNORE INTO votes (division_id, person_id, vote)
                VALUES (?, ?, ?)
                """,
                (division_id, str(person_id), vote_val),
            )
        except Exception:
            pass

    return True


def ingest_divisions(db, api_key: str, since: str | None = None):
    """Main ingestion loop: iterate month-by-month, both chambers."""
    start_year, start_month = 2006, 1
    end_year, end_month = 2026, 3

    if since:
        parts = since.split("-")
        if len(parts) >= 2:
            start_year = int(parts[0])
            start_month = int(parts[1])

    chambers = ["representatives", "senate"]
    total_divisions = 0

    for house in chambers:
        print(f"\nFetching divisions for {house}...")
        house_count = 0

        for start_date, end_date in month_ranges(
            start_year, start_month, end_year, end_month
        ):
            # Resume capability: skip if we already have data for this range
            if has_divisions_in_range(db, house, start_date, end_date):
                continue

            divisions = fetch_divisions_list(api_key, house, start_date, end_date)
            if not divisions:
                continue

            print(f"  {start_date[:7]}: {len(divisions)} division(s)")

            for div_summary in divisions:
                div_id = div_summary.get("id")
                if not div_id:
                    continue

                # Fetch detail for individual votes
                detail = fetch_division_detail(api_key, div_id)
                if not detail:
                    continue

                if insert_division(db, detail, house):
                    house_count += 1

            db.commit()

        print(f"  Inserted {house_count} divisions for {house}")
        total_divisions += house_count

    return total_divisions


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Download voting records from TheyVoteForYou API."
    )
    parser.add_argument("--since", type=str, default=None,
                        help="Start from this date (YYYY-MM-DD), default 2006-01")
    args = parser.parse_args()

    api_key = get_api_key()
    if not api_key:
        return

    db = get_db()
    init_db(db)

    total = ingest_divisions(db, api_key, since=args.since)

    db_total = db.execute("SELECT COUNT(*) FROM divisions").fetchone()[0]
    vote_total = db.execute("SELECT COUNT(*) FROM votes").fetchone()[0]
    print(f"\nDone. Inserted {total} new divisions this run.")
    print(f"Total divisions in DB: {db_total}")
    print(f"Total individual votes in DB: {vote_total}")


if __name__ == "__main__":
    main()
