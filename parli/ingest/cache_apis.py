import os
"""
parli.ingest.cache_apis -- Pre-fetch ALL data from TheyVoteForYou and
OpenAustralia APIs into the local SQLite database so the dashboard never
needs to make live API calls.

Usage:
    python -m parli.ingest.cache_apis                   # default: policies only
    python -m parli.ingest.cache_apis --policies-only   # fetch all policies
    python -m parli.ingest.cache_apis --people-only     # fetch all people
    python -m parli.ingest.cache_apis --divisions-only  # fetch all divisions
    python -m parli.ingest.cache_apis --all             # fetch everything
"""

import argparse
import calendar
import json
import logging
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

from parli.schema import get_db, init_db

# ── Configuration ─────────────────────────────────────────────────────────────

TVFY_API_BASE = "https://theyvoteforyou.org.au/api/v1"
TVFY_API_KEY = os.environ.get("TVFY_API_KEY", "")

RATE_LIMIT_SEC = 1.0

PRIORITY_POLICY_IDS = [39, 85, 86, 117, 3, 250, 68]

USER_AGENT = "ParliIntel/1.0 (cache_apis)"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── HTTP helpers (stdlib only) ────────────────────────────────────────────────


def _api_get(url: str, params: dict | None = None, retries: int = 3) -> dict | list | None:
    """GET a JSON endpoint with rate-limiting and retries."""
    if params is None:
        params = {}
    params["key"] = TVFY_API_KEY
    qs = urllib.parse.urlencode(params)
    full_url = f"{url}?{qs}"

    req = urllib.request.Request(full_url, headers={"User-Agent": USER_AGENT})

    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            time.sleep(RATE_LIMIT_SEC)
            return data
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 5 * attempt
                log.warning("Rate-limited (429). Waiting %ds before retry %d/%d", wait, attempt, retries)
                time.sleep(wait)
            elif e.code >= 500:
                wait = 3 * attempt
                log.warning("Server error %d. Waiting %ds before retry %d/%d", e.code, wait, attempt, retries)
                time.sleep(wait)
            else:
                log.error("HTTP %d for %s", e.code, full_url)
                return None
        except Exception as e:
            wait = 3 * attempt
            log.warning("Request error: %s. Retry %d/%d in %ds", e, attempt, retries, wait)
            time.sleep(wait)

    log.error("Failed after %d retries: %s", retries, full_url)
    return None


def _cache_get(db: sqlite3.Connection, key: str) -> str | None:
    """Return cached value for key, or None."""
    row = db.execute("SELECT value FROM analysis_cache WHERE key = ?", (key,)).fetchone()
    return row[0] if row else None


def _cache_set(db: sqlite3.Connection, key: str, value: str) -> None:
    """Upsert a value into analysis_cache."""
    db.execute(
        "INSERT INTO analysis_cache (key, value, updated_at) VALUES (?, ?, datetime('now')) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        (key, value),
    )


# ── 1. Policies ──────────────────────────────────────────────────────────────


def fetch_all_policies(db: sqlite3.Connection) -> None:
    """Fetch ALL policies and their detail from TheyVoteForYou."""
    log.info("=== Fetching TheyVoteForYou Policies ===")

    # Fetch policy list
    cached_list = _cache_get(db, "tvfy_policies_list")
    if cached_list:
        policies = json.loads(cached_list)
        log.info("Policy list already cached (%d policies)", len(policies))
    else:
        log.info("Fetching policy list...")
        policies = _api_get(f"{TVFY_API_BASE}/policies.json")
        if not policies or not isinstance(policies, list):
            log.error("Failed to fetch policy list")
            return
        _cache_set(db, "tvfy_policies_list", json.dumps(policies))
        db.commit()
        log.info("Fetched and cached policy list: %d policies", len(policies))

    # Sort so priority policies come first
    priority_set = set(PRIORITY_POLICY_IDS)
    policies_sorted = sorted(policies, key=lambda p: (p.get("id") not in priority_set, p.get("id")))

    # Fetch each policy's detail
    total = len(policies_sorted)
    fetched = 0
    skipped = 0

    for i, policy in enumerate(policies_sorted, 1):
        pid = policy.get("id")
        if pid is None:
            continue

        cache_key = f"tvfy_policy_{pid}"
        if _cache_get(db, cache_key) is not None:
            skipped += 1
            continue

        is_priority = pid in priority_set
        label = " [PRIORITY]" if is_priority else ""
        log.info("  [%d/%d] Fetching policy %d%s: %s", i, total, pid, label, policy.get("name", "?"))

        detail = _api_get(f"{TVFY_API_BASE}/policies/{pid}.json")
        if detail:
            _cache_set(db, cache_key, json.dumps(detail))
            fetched += 1
            if fetched % 10 == 0:
                db.commit()
        else:
            log.warning("  Failed to fetch policy %d", pid)

    db.commit()
    log.info("Policies done: %d fetched, %d skipped (already cached), %d total", fetched, skipped, total)


# ── 2. People ────────────────────────────────────────────────────────────────


def fetch_all_people(db: sqlite3.Connection) -> None:
    """Fetch ALL people from TheyVoteForYou and insert into members + cache."""
    log.info("=== Fetching TheyVoteForYou People ===")

    # Fetch people list
    log.info("Fetching people list...")
    people = _api_get(f"{TVFY_API_BASE}/people.json")
    if not people or not isinstance(people, list):
        log.error("Failed to fetch people list")
        return
    log.info("Got %d people from API", len(people))

    fetched = 0
    skipped = 0

    for i, person in enumerate(people, 1):
        pid = person.get("id")
        if pid is None:
            continue

        cache_key = f"tvfy_person_{pid}"
        if _cache_get(db, cache_key) is not None:
            skipped += 1
            continue

        if i % 50 == 0 or i == 1:
            log.info("  [%d/%d] Fetching person detail...", i, len(people))

        detail = _api_get(f"{TVFY_API_BASE}/people/{pid}.json")
        if not detail:
            log.warning("  Failed to fetch person %d", pid)
            continue

        # Store full detail in cache
        _cache_set(db, cache_key, json.dumps(detail))

        # Extract fields for the members table
        # Names are nested at latest_member.name.first / .last in TVFY API
        latest = detail.get("latest_member", {}) or {}
        name_obj = latest.get("name", {}) or {}
        first_name = name_obj.get("first", "")
        last_name = name_obj.get("last", "")
        # Fallback to top-level fields (in case API format varies)
        if not first_name and not last_name:
            first_name = detail.get("first_name", "")
            last_name = detail.get("last_name", "")
        full_name = f"{first_name} {last_name}".strip()

        # The latest_member entry has party/electorate/chamber
        party = latest.get("party", "")
        electorate = latest.get("electorate", "")
        house = latest.get("house", "")

        # Normalize chamber name
        chamber = ""
        if house:
            h = house.lower()
            if "rep" in h:
                chamber = "representatives"
            elif "sen" in h:
                chamber = "senate"
            else:
                chamber = h

        try:
            db.execute(
                """
                INSERT INTO members (person_id, first_name, last_name, full_name,
                                     party, electorate, chamber)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(person_id) DO UPDATE SET
                    first_name = excluded.first_name,
                    last_name = excluded.last_name,
                    full_name = excluded.full_name,
                    party = excluded.party,
                    electorate = excluded.electorate,
                    chamber = excluded.chamber
                """,
                (str(pid), first_name, last_name, full_name, party, electorate, chamber),
            )
        except Exception as e:
            log.warning("  Could not upsert member %s: %s", pid, e)

        fetched += 1
        if fetched % 20 == 0:
            db.commit()

    db.commit()
    log.info("People done: %d fetched, %d skipped (already cached), %d total", fetched, skipped, len(people))


# ── 3. Divisions ─────────────────────────────────────────────────────────────


def _month_ranges(start_year: int, start_month: int, end_year: int, end_month: int):
    """Yield (start_date, end_date) ISO strings for each month in range."""
    y, m = start_year, start_month
    while (y, m) <= (end_year, end_month):
        start = date(y, m, 1)
        last_day = calendar.monthrange(y, m)[1]
        end = date(y, m, last_day)
        yield start.isoformat(), end.isoformat()
        if m == 12:
            y += 1
            m = 1
        else:
            m += 1


def _has_divisions_in_range(db: sqlite3.Connection, house: str, start_date: str, end_date: str) -> bool:
    """Check if we already have divisions for this house in this date range."""
    row = db.execute(
        "SELECT COUNT(*) FROM divisions WHERE house = ? AND date >= ? AND date <= ?",
        (house, start_date, end_date),
    ).fetchone()
    return row[0] > 0


def _insert_division(db: sqlite3.Connection, div: dict, house: str) -> bool:
    """Insert a single division and its votes. Returns True if inserted."""
    division_id = div.get("id")
    if not division_id:
        return False

    # Skip if exists
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

    # Insert individual votes
    votes = div.get("votes", [])
    for v in votes:
        # Try multiple structures the API might use
        member = v.get("member", {})
        person_id = member.get("id") if isinstance(member, dict) else None
        if not person_id:
            person_id = v.get("person_id") or v.get("id")
        if not person_id:
            continue

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
                "INSERT OR IGNORE INTO votes (division_id, person_id, vote) VALUES (?, ?, ?)",
                (division_id, str(person_id), vote_val),
            )
        except Exception:
            pass

    return True


def _fetch_divisions_for_range(db: sqlite3.Connection, house: str,
                               start_date: str, end_date: str) -> int:
    """Fetch divisions for a date range, narrowing if we get 100 results.
    Returns number of new divisions inserted."""
    divisions = _api_get(
        f"{TVFY_API_BASE}/divisions.json",
        params={"house": house, "start_date": start_date, "end_date": end_date},
    )
    if divisions is None:
        return 0
    if not isinstance(divisions, list):
        return 0

    # If we hit the 100-result cap, split the range in half and recurse
    if len(divisions) >= 100:
        sd = date.fromisoformat(start_date)
        ed = date.fromisoformat(end_date)
        if sd == ed:
            # Cannot split further, just process what we have
            pass
        else:
            mid = sd + (ed - sd) // 2
            log.info("    Got 100 results for %s to %s, splitting range", start_date, end_date)
            count = _fetch_divisions_for_range(db, house, sd.isoformat(), mid.isoformat())
            count += _fetch_divisions_for_range(db, house, (mid + timedelta(days=1)).isoformat(), ed.isoformat())
            return count

    inserted = 0
    for div_summary in divisions:
        div_id = div_summary.get("id")
        if not div_id:
            continue

        # Check if already in DB
        existing = db.execute(
            "SELECT division_id FROM divisions WHERE division_id = ?", (div_id,)
        ).fetchone()
        if existing:
            continue

        detail = _api_get(f"{TVFY_API_BASE}/divisions/{div_id}.json")
        if not detail:
            continue

        if _insert_division(db, detail, house):
            inserted += 1

    return inserted


def fetch_all_divisions(db: sqlite3.Connection) -> None:
    """Fetch ALL divisions month-by-month from 2006-01 to 2026-03."""
    log.info("=== Fetching TheyVoteForYou Divisions ===")

    chambers = ["representatives", "senate"]
    grand_total = 0

    for house in chambers:
        log.info("Fetching divisions for %s...", house)
        house_count = 0

        for start_date, end_date in _month_ranges(2006, 1, 2026, 3):
            # Resume: skip months already in DB
            if _has_divisions_in_range(db, house, start_date, end_date):
                continue

            inserted = _fetch_divisions_for_range(db, house, start_date, end_date)
            if inserted > 0:
                log.info("  %s %s: +%d divisions", house, start_date[:7], inserted)
                house_count += inserted
                db.commit()

        log.info("  %s: %d new divisions inserted", house, house_count)
        grand_total += house_count

    db.commit()

    db_total = db.execute("SELECT COUNT(*) FROM divisions").fetchone()[0]
    vote_total = db.execute("SELECT COUNT(*) FROM votes").fetchone()[0]
    log.info("Divisions done: %d new this run. Total in DB: %d divisions, %d votes",
             grand_total, db_total, vote_total)


# ── CLI ───────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Pre-fetch TheyVoteForYou/OpenAustralia API data into local SQLite cache.",
    )
    parser.add_argument("--all", action="store_true",
                        help="Fetch everything (policies, people, divisions)")
    parser.add_argument("--policies-only", action="store_true",
                        help="Fetch policies only (default when no flag given)")
    parser.add_argument("--people-only", action="store_true",
                        help="Fetch people only")
    parser.add_argument("--divisions-only", action="store_true",
                        help="Fetch divisions only")

    args = parser.parse_args()

    # If no flag given, default to policies-only
    if not any([args.all, args.policies_only, args.people_only, args.divisions_only]):
        args.policies_only = True

    db = get_db()
    init_db(db)

    start = time.time()

    if args.all:
        fetch_all_policies(db)
        fetch_all_people(db)
        fetch_all_divisions(db)
    else:
        if args.policies_only:
            fetch_all_policies(db)
        if args.people_only:
            fetch_all_people(db)
        if args.divisions_only:
            fetch_all_divisions(db)

    elapsed = time.time() - start
    minutes = int(elapsed // 60)
    seconds = int(elapsed % 60)
    log.info("Completed in %dm %ds", minutes, seconds)

    # Print summary
    for table in ["members", "divisions", "votes", "analysis_cache"]:
        try:
            count = db.execute(f"SELECT COUNT(*) FROM [{table}]").fetchone()[0]
            log.info("  %s: %d rows", table, count)
        except Exception:
            pass

    db.close()


if __name__ == "__main__":
    main()
