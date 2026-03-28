"""
Fetch individual vote records for each division from TheyVoteForYou API.

The divisions table has 3,634 divisions but votes table has 0 rows.
This script fetches the detail endpoint for each division and inserts
individual vote records.

Rate limit: 1 req/sec.
Resume: skips divisions that already have votes.

Usage:
    python parli/ingest/fetch_division_votes.py
"""

import json
import sqlite3
import sys
import time
import urllib.error
import urllib.request

DB_PATH = "/home/jake/.cache/autoresearch/parli.db"
API_BASE = "https://theyvoteforyou.org.au/api/v1"
API_KEY = "b%2BiPzux7zTSPPV33hrKE"
RATE_LIMIT = 1.0
MAX_RETRIES = 3


def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=300)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=300000")  # 5 min busy timeout
    conn.execute("PRAGMA foreign_keys=OFF")  # historical MPs may be missing
    # Track which divisions have been fetched (including those with 0 votes)
    for attempt in range(10):
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS division_votes_fetched (
                    division_id INTEGER PRIMARY KEY
                )
            """)
            conn.commit()
            break
        except sqlite3.OperationalError as e:
            if "locked" in str(e) and attempt < 9:
                print(f"DB locked, retrying in {(attempt+1)*5}s...")
                time.sleep((attempt + 1) * 5)
            else:
                raise
    return conn


def get_pending_division_ids(db):
    """Get division_ids that haven't been fetched yet."""
    rows = db.execute("""
        SELECT d.division_id
        FROM divisions d
        WHERE d.division_id NOT IN (
            SELECT division_id FROM division_votes_fetched
        )
        ORDER BY d.division_id
    """).fetchall()
    return [r[0] for r in rows]


def fetch_division_detail(division_id):
    """Fetch division detail from API. Returns parsed JSON or None."""
    url = f"{API_BASE}/divisions/{division_id}.json?key={API_KEY}"
    req = urllib.request.Request(url, headers={"User-Agent": "ParliIntel/1.0"})

    for attempt in range(MAX_RETRIES):
        try:
            resp = urllib.request.urlopen(req, timeout=30)
            return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                print(f"  Division {division_id}: 404 not found, skipping")
                return None
            if e.code == 429 or e.code >= 500:
                wait = (attempt + 1) * 5
                print(f"  Division {division_id}: HTTP {e.code}, retry in {wait}s")
                time.sleep(wait)
                continue
            print(f"  Division {division_id}: HTTP {e.code}, skipping")
            return None
        except Exception as e:
            wait = (attempt + 1) * 5
            print(f"  Division {division_id}: {e}, retry in {wait}s")
            time.sleep(wait)

    print(f"  Division {division_id}: failed after {MAX_RETRIES} retries")
    return None


def insert_votes(db, division_id, votes_data):
    """Insert vote records for a division. Returns count inserted."""
    count = 0
    for v in votes_data:
        member = v.get("member", {})
        # person_id is stored as text in the DB, sourced from member.person.id
        person_info = member.get("person", {})
        person_id = person_info.get("id") if person_info else None
        if not person_id:
            # fallback: try member.id directly
            person_id = member.get("id")
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
                "INSERT OR IGNORE INTO votes (division_id, person_id, vote) "
                "VALUES (?, ?, ?)",
                (division_id, str(person_id), vote_val),
            )
            count += 1
        except Exception as e:
            print(f"    Vote insert error div={division_id} person={person_id}: {e}")

    return count


def safe_commit(db, max_retries=10):
    """Commit with retry on database lock."""
    for attempt in range(max_retries):
        try:
            db.commit()
            return
        except sqlite3.OperationalError as e:
            if "locked" in str(e) and attempt < max_retries - 1:
                time.sleep(2 * (attempt + 1))
            else:
                raise


def safe_execute(db, sql, params=None, max_retries=10):
    """Execute with retry on database lock."""
    for attempt in range(max_retries):
        try:
            if params:
                return db.execute(sql, params)
            return db.execute(sql)
        except sqlite3.OperationalError as e:
            if "locked" in str(e) and attempt < max_retries - 1:
                time.sleep(2 * (attempt + 1))
            else:
                raise


def main():
    db = get_db()

    # Backfill tracking table for divisions that already have votes
    safe_execute(db, """
        INSERT OR IGNORE INTO division_votes_fetched (division_id)
        SELECT DISTINCT division_id FROM votes
    """)
    safe_commit(db)

    pending = get_pending_division_ids(db)
    total = len(pending)

    if total == 0:
        print("All divisions already have votes. Nothing to do.")
        return

    # Count already-done divisions for display
    all_count = db.execute("SELECT COUNT(*) FROM divisions").fetchone()[0]
    done_count = all_count - total
    print(f"Divisions total: {all_count}, already done: {done_count}, pending: {total}")
    print(f"Estimated time: ~{total} seconds ({total // 60} minutes)")
    sys.stdout.flush()

    total_votes_inserted = 0

    for i, div_id in enumerate(pending, 1):
        data = fetch_division_detail(div_id)
        time.sleep(RATE_LIMIT)

        if data is None:
            # Mark 404/failed divisions as fetched so we don't retry
            try:
                safe_execute(db,
                    "INSERT OR IGNORE INTO division_votes_fetched (division_id) VALUES (?)",
                    (div_id,))
                safe_commit(db)
            except Exception:
                pass
            if i % 100 == 0 or i == total:
                print(f"[{i}/{total}] division {div_id}: no data")
                sys.stdout.flush()
            continue

        votes_data = data.get("votes", [])

        try:
            count = insert_votes(db, div_id, votes_data)
            total_votes_inserted += count

            # Mark division as fetched (even if 0 votes)
            safe_execute(db,
                "INSERT OR IGNORE INTO division_votes_fetched (division_id) VALUES (?)",
                (div_id,),
            )

            # Commit every 10 divisions (more frequent to reduce lock window)
            if i % 10 == 0:
                safe_commit(db)
        except sqlite3.OperationalError as e:
            print(f"  Division {div_id}: DB error: {e}, will retry on next run")
            sys.stdout.flush()
            try:
                db.rollback()
            except Exception:
                pass
            # Reconnect
            try:
                db.close()
            except Exception:
                pass
            db = get_db()
            continue

        # Progress every 100 divisions
        if i % 100 == 0 or i == total or i == 1:
            try:
                vote_total = db.execute("SELECT COUNT(*) FROM votes").fetchone()[0]
            except Exception:
                vote_total = -1
            print(f"[{i}/{total}] division {div_id}: +{count} votes "
                  f"(total votes in DB: {vote_total})")
            sys.stdout.flush()

    safe_commit(db)

    vote_total = db.execute("SELECT COUNT(*) FROM votes").fetchone()[0]
    print(f"\nDone. Inserted {total_votes_inserted} vote records.")
    print(f"Total votes in DB: {vote_total}")


if __name__ == "__main__":
    main()
