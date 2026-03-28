import os
"""
parli.ingest.members — Fetch and store MP/Senator data.

Data sources:
  1. OpenAustralia API (getRepresentatives, getSenators)
  2. APH (aph.gov.au) for richer metadata (gender, ministerial titles)

This module fetches current and historical members, resolves stable
person_id values, and upserts into the members table.

Usage:
    python -m parli.ingest.members              # fetch all current + recent
    python -m parli.ingest.members --historical  # include historical members
"""

import json
import re
import time
from datetime import date

import requests

from parli.schema import get_db, init_db

API_BASE = "https://www.openaustralia.org.au/api/"
API_KEY = os.environ.get("OPENAUSTRALIA_API_KEY", "")  # public OpenAustralia key
RATE_LIMIT = 1.0

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "ParliIntel/1.0"})

# ── Party name normalization ────────────────────────────────────────────────

PARTY_ALIASES = {
    "Australian Labor Party": "Labor",
    "ALP": "Labor",
    "Labor": "Labor",
    "Liberal Party of Australia": "Liberal",
    "Liberal Party": "Liberal",
    "Liberal": "Liberal",
    "The Nationals": "Nationals",
    "National Party": "Nationals",
    "National Party of Australia": "Nationals",
    "Australian Greens": "Greens",
    "Greens": "Greens",
    "Independent": "Independent",
    "Pauline Hanson's One Nation Party": "One Nation",
    "Centre Alliance": "Centre Alliance",
    "Jacqui Lambie Network": "Jacqui Lambie Network",
    "United Australia Party": "United Australia Party",
    "Katter's Australian Party": "Katter's Australian Party",
}


def normalize_party(raw: str) -> str:
    """Normalize party name to canonical short form."""
    return PARTY_ALIASES.get(raw.strip(), raw.strip())


# ── Gender inference from titles/first names ────────────────────────────────
# OpenAustralia doesn't provide gender directly, but we can infer from
# titles (Mr/Mrs/Ms) or maintain a manual override table.

def infer_gender(name: str, title: str | None = None) -> str | None:
    """Best-effort gender inference. Returns 'M', 'F', or None."""
    if title:
        t = title.strip().lower().rstrip(".")
        if t in ("mr", "sir"):
            return "M"
        if t in ("ms", "mrs", "miss", "dame"):
            return "F"
    return None


# ── OpenAustralia API ───────────────────────────────────────────────────────

def fetch_members_oa(chamber: str) -> list[dict]:
    """Fetch members from OpenAustralia API for a chamber."""
    endpoint = "getRepresentatives" if chamber == "representatives" else "getSenators"
    params = {"output": "json", "key": API_KEY}

    resp = SESSION.get(f"{API_BASE}{endpoint}", params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    time.sleep(RATE_LIMIT)

    if not isinstance(data, list):
        print(f"  Unexpected response for {chamber}: {type(data)}")
        return []

    members = []
    for item in data:
        person_id = item.get("person_id", "")
        full_name = item.get("name", "Unknown")
        party = normalize_party(item.get("party", "Unknown"))
        constituency = item.get("constituency", "")

        # Parse first/last name
        parts = full_name.split(",", 1) if "," in full_name else full_name.rsplit(" ", 1)
        if len(parts) == 2 and "," in full_name:
            last_name, first_name = parts[0].strip(), parts[1].strip()
        elif len(parts) == 2:
            first_name, last_name = parts[0].strip(), parts[1].strip()
        else:
            first_name, last_name = "", full_name

        members.append({
            "person_id": str(person_id),
            "name": full_name,
            "first_name": first_name,
            "last_name": last_name,
            "party": party,
            "chamber": chamber,
            "electorate": constituency if chamber == "representatives" else None,
            "state": constituency if chamber == "senate" else None,
            "gender": infer_gender(full_name),
            "term_start": item.get("entered_house"),
            "term_end": item.get("left_house") or None,
        })

    return members


def upsert_members(db, members: list[dict]) -> int:
    """Insert or update members. Returns count of upserted rows."""
    count = 0
    for m in members:
        db.execute("""
            INSERT INTO members (person_id, name, first_name, last_name, party,
                                 chamber, electorate, state, gender, term_start, term_end)
            VALUES (:person_id, :name, :first_name, :last_name, :party,
                    :chamber, :electorate, :state, :gender, :term_start, :term_end)
            ON CONFLICT(person_id, term_start) DO UPDATE SET
                name=excluded.name, party=excluded.party,
                electorate=excluded.electorate, state=excluded.state,
                gender=excluded.gender, term_end=excluded.term_end
        """, m)
        count += 1
    db.commit()
    return count


def main():
    db = get_db()
    init_db(db)

    total = 0
    for chamber in ["representatives", "senate"]:
        print(f"Fetching {chamber}...")
        members = fetch_members_oa(chamber)
        print(f"  Got {len(members)} members")
        n = upsert_members(db, members)
        total += n
        print(f"  Upserted {n} rows")

    print(f"\nDone. Total members in DB: {total}")


if __name__ == "__main__":
    main()
