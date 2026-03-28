"""
parli.ingest.historical_members -- Load historical MPs from cached TVFY policy data.

The TheyVoteForYou /people endpoint only returns current MPs, but every cached
policy (tvfy_policy_*) contains people_comparisons that include historical MPs
who voted on that policy. By scanning all 366+ cached policies we can recover
members who left parliament years ago (Howard, Gillard, Rudd, Abbott, etc.).

Usage:
    python -m parli.ingest.historical_members
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

# Normalize party names to canonical short forms
PARTY_ALIASES = {
    "Australian Labor Party": "Labor",
    "ALP": "Labor",
    "Liberal Party of Australia": "Liberal",
    "Liberal Party": "Liberal",
    "The Nationals": "Nationals",
    "National Party of Australia": "Nationals",
    "National Party": "Nationals",
    "Australian Greens": "Greens",
    "Independent": "Independent",
    "Pauline Hanson's One Nation Party": "One Nation",
    "Centre Alliance": "Centre Alliance",
    "Jacqui Lambie Network": "Jacqui Lambie Network",
    "United Australia Party": "United Australia Party",
    "Katter's Australian Party": "Katter's Australian Party",
    "Country Liberal Party": "Country Liberal Party",
    "Family First Party": "Family First",
    "Nick Xenophon Team": "Nick Xenophon Team",
    "Palmer United Party": "Palmer United Party",
    "Australian Democrats": "Australian Democrats",
    "Democratic Labor Party": "Democratic Labor Party",
}


def normalize_party(raw: str) -> str:
    return PARTY_ALIASES.get(raw.strip(), raw.strip())


def extract_people_from_cache(db) -> dict:
    """Extract all unique people from tvfy_policy_* cache entries.

    Returns dict mapping person_id -> {first, last, party, electorate, house}.
    """
    rows = db.execute(
        "SELECT value FROM analysis_cache WHERE key LIKE 'tvfy_policy_%'"
    ).fetchall()
    log.info("Scanning %d cached policies for historical members...", len(rows))

    all_people = {}
    for row in rows:
        policy = json.loads(row[0])
        for pc in policy.get("people_comparisons", []):
            person = pc.get("person", {})
            pid = str(person.get("id", ""))
            if not pid:
                continue
            # Keep the first occurrence (or overwrite -- data is consistent)
            member = person.get("latest_member", {})
            all_people[pid] = {
                "first": member.get("name", {}).get("first", ""),
                "last": member.get("name", {}).get("last", ""),
                "party": member.get("party", ""),
                "electorate": member.get("electorate", ""),
                "house": member.get("house", ""),
            }

    log.info("Found %d unique people across all policies", len(all_people))
    return all_people


def insert_historical_members(db, all_people: dict) -> int:
    """Insert historical members not already present in the members table.

    Returns count of new members inserted.
    """
    existing = set(
        r[0] for r in db.execute("SELECT person_id FROM members").fetchall()
    )
    log.info("Existing members in DB: %d", len(existing))

    inserted = 0
    for pid, p in all_people.items():
        if pid in existing:
            continue

        first = p["first"]
        last = p["last"]
        full_name = f"{first} {last}".strip()
        party = normalize_party(p["party"])
        house = p["house"]
        chamber = "senate" if house == "senate" else "representatives"
        electorate = p["electorate"]

        db.execute(
            """INSERT OR IGNORE INTO members
               (person_id, first_name, last_name, full_name, party, electorate, chamber)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (pid, first, last, full_name, party, electorate, chamber),
        )
        inserted += 1

    db.commit()
    log.info("Inserted %d new historical members", inserted)
    return inserted


def main():
    db = get_db()
    init_db(db)

    all_people = extract_people_from_cache(db)
    inserted = insert_historical_members(db, all_people)

    total = db.execute("SELECT COUNT(*) FROM members").fetchone()[0]
    log.info("Total members now in DB: %d (added %d historical)", total, inserted)
    db.close()


if __name__ == "__main__":
    main()
