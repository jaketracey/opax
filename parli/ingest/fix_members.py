"""
parli.ingest.fix_members -- Fix blank member names by re-extracting from cached
TVFY API responses in analysis_cache.

The original cache_apis.py read names from the wrong JSON path
(detail.get("first_name")) when they are actually nested at
detail["latest_member"]["name"]["first"].

This script reads all tvfy_person_* entries from analysis_cache and updates
the members table with correct names and metadata.

Usage:
    python -m parli.ingest.fix_members
"""

import json
import logging

from parli.schema import get_db, init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


def fix_members() -> None:
    db = get_db()
    init_db(db)

    # Read all tvfy_person_* entries from analysis_cache
    rows = db.execute(
        "SELECT key, value FROM analysis_cache WHERE key LIKE 'tvfy_person_%'"
    ).fetchall()
    log.info("Found %d tvfy_person_* cache entries", len(rows))

    updated = 0
    skipped = 0
    errors = 0

    for row in rows:
        cache_key = row["key"]
        # Extract person_id from cache key: tvfy_person_12345
        person_id = cache_key.replace("tvfy_person_", "")

        try:
            detail = json.loads(row["value"])
        except (json.JSONDecodeError, TypeError):
            log.warning("Bad JSON for %s", cache_key)
            errors += 1
            continue

        # Extract names from the correct path
        # Try latest_member.name.first/last first (the correct TVFY structure)
        latest = detail.get("latest_member", {}) or {}
        name_obj = latest.get("name", {}) or {}

        first_name = name_obj.get("first", "")
        last_name = name_obj.get("last", "")

        # Fallback: try top-level (in case some entries have it there)
        if not first_name and not last_name:
            first_name = detail.get("first_name", "")
            last_name = detail.get("last_name", "")

        # Fallback: try latest_member.name as a string
        if not first_name and not last_name:
            name_str = name_obj if isinstance(name_obj, str) else ""
            if name_str:
                parts = name_str.split(None, 1)
                first_name = parts[0] if parts else ""
                last_name = parts[1] if len(parts) > 1 else ""

        full_name = f"{first_name} {last_name}".strip()

        if not full_name:
            log.debug("No name found for person %s", person_id)
            skipped += 1
            continue

        # Extract additional metadata
        party = latest.get("party", "") or ""
        electorate = latest.get("electorate", "") or ""
        house = latest.get("house", "") or ""

        # Normalize chamber
        chamber = ""
        if house:
            h = house.lower()
            if "rep" in h:
                chamber = "representatives"
            elif "sen" in h:
                chamber = "senate"
            else:
                chamber = h

        # Extract gender if available (sometimes at top level or in latest_member)
        gender = detail.get("gender", "") or latest.get("gender", "") or ""

        try:
            db.execute(
                """
                UPDATE members SET
                    first_name = ?,
                    last_name = ?,
                    full_name = ?,
                    party = CASE WHEN ? != '' THEN ? ELSE party END,
                    electorate = CASE WHEN ? != '' THEN ? ELSE electorate END,
                    chamber = CASE WHEN ? != '' THEN ? ELSE chamber END,
                    gender = CASE WHEN ? != '' THEN ? ELSE gender END
                WHERE person_id = ?
                """,
                (
                    first_name, last_name, full_name,
                    party, party,
                    electorate, electorate,
                    chamber, chamber,
                    gender, gender,
                    person_id,
                ),
            )
            if db.execute("SELECT changes()").fetchone()[0] > 0:
                updated += 1
            else:
                # Member not in table yet -- insert
                db.execute(
                    """
                    INSERT OR IGNORE INTO members
                    (person_id, first_name, last_name, full_name, party, electorate, chamber, gender)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (person_id, first_name, last_name, full_name, party, electorate, chamber, gender),
                )
                if db.execute("SELECT changes()").fetchone()[0] > 0:
                    updated += 1
                    log.debug("Inserted new member %s: %s", person_id, full_name)
        except Exception as e:
            log.warning("Failed to update member %s: %s", person_id, e)
            errors += 1

    db.commit()

    # Report results
    total_members = db.execute("SELECT COUNT(*) FROM members").fetchone()[0]
    named_members = db.execute(
        "SELECT COUNT(*) FROM members WHERE full_name IS NOT NULL AND full_name != ''"
    ).fetchone()[0]
    blank_members = db.execute(
        "SELECT COUNT(*) FROM members WHERE full_name IS NULL OR full_name = ''"
    ).fetchone()[0]

    log.info("=== Fix Members Results ===")
    log.info("  Updated/inserted: %d", updated)
    log.info("  Skipped (no name in cache): %d", skipped)
    log.info("  Errors: %d", errors)
    log.info("  Total members in DB: %d", total_members)
    log.info("  Members with names: %d", named_members)
    log.info("  Members still blank: %d", blank_members)

    # Show sample of fixed members
    samples = db.execute(
        "SELECT person_id, full_name, party, electorate, chamber FROM members "
        "WHERE full_name IS NOT NULL AND full_name != '' LIMIT 10"
    ).fetchall()
    log.info("Sample fixed members:")
    for s in samples:
        log.info("  %s | %s | %s | %s | %s",
                 s["person_id"], s["full_name"], s["party"],
                 s["electorate"], s["chamber"])

    db.close()


if __name__ == "__main__":
    fix_members()
