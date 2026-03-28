import os
"""
parli.ingest.load_votes -- Populate the votes table from cached policy data
and, if needed, from the TheyVoteForYou API.

Strategy:
  1. Extract votes from cached tvfy_policy_* entries in analysis_cache.
     Each policy detail has policy_divisions[].division with id and votes[].
  2. For any divisions still missing votes, fetch from TVFY API directly.
  3. INSERT OR IGNORE to handle duplicates gracefully.
  4. Foreign key: skip voters not in the members table (with warning).

Usage:
    python -m parli.ingest.load_votes
"""

import json
import logging
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request

from parli.schema import get_db, init_db

TVFY_API_BASE = "https://theyvoteforyou.org.au/api/v1"
TVFY_API_KEY = os.environ.get("TVFY_API_KEY", "")
RATE_LIMIT_SEC = 1.0
USER_AGENT = "ParliIntel/1.0 (load_votes)"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


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


def _normalize_vote(raw: str) -> str:
    """Normalize vote string to one of: aye, no, abstention, absent."""
    v = raw.strip().lower()
    if v in ("aye", "yes", "aye3"):
        return "aye"
    if v in ("no", "nay", "no3"):
        return "no"
    if v in ("abstention", "abstain"):
        return "abstention"
    return "absent"


def _get_known_member_ids(db: sqlite3.Connection) -> set[str]:
    """Return set of all person_id values in the members table."""
    rows = db.execute("SELECT person_id FROM members").fetchall()
    return {str(row[0]) for row in rows}


def _get_division_ids(db: sqlite3.Connection) -> set[int]:
    """Return set of all division_ids in the divisions table."""
    rows = db.execute("SELECT division_id FROM divisions").fetchall()
    return {row[0] for row in rows}


def _get_divisions_with_votes(db: sqlite3.Connection) -> set[int]:
    """Return set of division_ids that already have at least one vote."""
    rows = db.execute("SELECT DISTINCT division_id FROM votes").fetchall()
    return {row[0] for row in rows}


def _insert_vote(db: sqlite3.Connection, division_id: int, person_id: str,
                 vote: str, known_members: set[str], stats: dict) -> None:
    """Insert a single vote, respecting FK constraint on members."""
    person_id = str(person_id)
    if person_id not in known_members:
        stats["skipped_no_member"] += 1
        return

    try:
        db.execute(
            "INSERT OR IGNORE INTO votes (division_id, person_id, vote) VALUES (?, ?, ?)",
            (division_id, person_id, vote),
        )
        stats["inserted"] += 1
    except sqlite3.IntegrityError:
        stats["duplicates"] += 1
    except Exception as e:
        log.warning("Error inserting vote div=%d person=%s: %s", division_id, person_id, e)
        stats["errors"] += 1


def extract_votes_from_cache(db: sqlite3.Connection, known_members: set[str],
                             known_divisions: set[int], stats: dict) -> set[int]:
    """Extract votes from cached tvfy_policy_* entries.

    Returns set of division_ids for which we found votes.
    """
    log.info("=== Phase 1: Extracting votes from cached policy data ===")

    rows = db.execute(
        "SELECT key, value FROM analysis_cache WHERE key LIKE 'tvfy_policy_%'"
    ).fetchall()
    log.info("Found %d cached policy entries", len(rows))

    divisions_with_votes = set()
    policies_processed = 0

    for row in rows:
        key = row[0]
        try:
            policy = json.loads(row[1])
        except (json.JSONDecodeError, TypeError):
            log.warning("Could not parse JSON for %s", key)
            continue

        policy_divisions = policy.get("policy_divisions", [])
        if not policy_divisions:
            continue

        policies_processed += 1

        for pd in policy_divisions:
            # The division data can be nested under "division" key or at top level
            division = pd.get("division", pd)
            div_id = division.get("id")
            if not div_id:
                continue

            # Only insert votes for divisions we have in the divisions table
            if div_id not in known_divisions:
                continue

            votes = division.get("votes", [])
            if not votes:
                continue

            for v in votes:
                # Try multiple structures
                member = v.get("member", {})
                if isinstance(member, dict):
                    person_id = member.get("id")
                else:
                    person_id = None

                if not person_id:
                    person_id = v.get("person_id") or v.get("id")
                if not person_id:
                    continue

                raw_vote = str(v.get("vote", ""))
                vote_val = _normalize_vote(raw_vote)
                _insert_vote(db, div_id, person_id, vote_val, known_members, stats)
                divisions_with_votes.add(div_id)

    db.commit()
    log.info("Phase 1 complete: processed %d policies, found votes for %d divisions",
             policies_processed, len(divisions_with_votes))
    return divisions_with_votes


def fetch_votes_from_api(db: sqlite3.Connection, known_members: set[str],
                         known_divisions: set[int],
                         divisions_already_done: set[int], stats: dict) -> None:
    """Fetch division details from TVFY API for divisions missing votes."""
    missing = known_divisions - divisions_already_done
    if not missing:
        log.info("=== Phase 2: All divisions already have votes, skipping API fetch ===")
        return

    log.info("=== Phase 2: Fetching %d divisions from TVFY API ===", len(missing))

    for i, div_id in enumerate(sorted(missing), 1):
        if i % 20 == 0 or i == 1:
            log.info("  [%d/%d] Fetching division %d...", i, len(missing), div_id)

        detail = _api_get(f"{TVFY_API_BASE}/divisions/{div_id}.json")
        if not detail:
            log.warning("  Failed to fetch division %d", div_id)
            continue

        votes = detail.get("votes", [])
        for v in votes:
            member = v.get("member", {})
            if isinstance(member, dict):
                person_id = member.get("id")
            else:
                person_id = None

            if not person_id:
                person_id = v.get("person_id") or v.get("id")
            if not person_id:
                continue

            raw_vote = str(v.get("vote", ""))
            vote_val = _normalize_vote(raw_vote)
            _insert_vote(db, div_id, person_id, vote_val, known_members, stats)

        if i % 20 == 0:
            db.commit()

    db.commit()
    log.info("Phase 2 complete")


def report(db: sqlite3.Connection, stats: dict) -> None:
    """Print final statistics."""
    total_votes = db.execute("SELECT COUNT(*) FROM votes").fetchone()[0]
    unique_divisions = db.execute("SELECT COUNT(DISTINCT division_id) FROM votes").fetchone()[0]
    unique_members = db.execute("SELECT COUNT(DISTINCT person_id) FROM votes").fetchone()[0]

    log.info("=" * 60)
    log.info("FINAL REPORT")
    log.info("=" * 60)
    log.info("  Total votes in DB:          %d", total_votes)
    log.info("  Unique divisions with votes: %d", unique_divisions)
    log.info("  Unique members who voted:    %d", unique_members)
    log.info("  Votes inserted this run:     %d", stats["inserted"])
    log.info("  Duplicates (ignored):        %d", stats["duplicates"])
    log.info("  Skipped (member not in DB):  %d", stats["skipped_no_member"])
    log.info("  Errors:                      %d", stats["errors"])

    # Show breakdown by vote type
    for vote_type in ("aye", "no", "abstention", "absent"):
        count = db.execute(
            "SELECT COUNT(*) FROM votes WHERE vote = ?", (vote_type,)
        ).fetchone()[0]
        log.info("  Votes '%s': %d", vote_type, count)


def main():
    db = get_db()
    init_db(db)

    # Temporarily disable foreign keys for bulk insert performance,
    # but we enforce them manually via known_members check
    db.execute("PRAGMA foreign_keys = OFF")

    known_members = _get_known_member_ids(db)
    known_divisions = _get_division_ids(db)

    log.info("Members in DB: %d", len(known_members))
    log.info("Divisions in DB: %d", len(known_divisions))

    # Check existing votes
    existing_votes = db.execute("SELECT COUNT(*) FROM votes").fetchone()[0]
    log.info("Existing votes in DB: %d", existing_votes)

    stats = {
        "inserted": 0,
        "duplicates": 0,
        "skipped_no_member": 0,
        "errors": 0,
    }

    # Phase 1: Extract from cached policy data
    divisions_done = extract_votes_from_cache(db, known_members, known_divisions, stats)

    # Also count divisions that already had votes before this run
    divisions_done |= _get_divisions_with_votes(db)

    # Phase 2: Fetch from API for divisions still missing votes
    fetch_votes_from_api(db, known_members, known_divisions, divisions_done, stats)

    # Re-enable foreign keys
    db.execute("PRAGMA foreign_keys = ON")

    report(db, stats)
    db.close()


if __name__ == "__main__":
    main()
