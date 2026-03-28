"""
parli.ingest.federal_lobbyists -- Ingest the Australian Government Register of Lobbyists.

Data source: https://lobbyists.ag.gov.au/
Maintained by: Attorney-General's Department

The Federal Lobbyist Register is a JavaScript SPA (Angular) that loads data from
a JSON API at https://api.lobbyists.ag.gov.au/. This module calls the API directly
(no browser needed) to extract:

1. Registered lobbyist organisations (trading name, ABN, registration dates, status)
2. Individual lobbyists per org, including former government representatives
3. Clients represented by each lobbyist organisation

After ingesting, cross-references are computed:
- Lobbyist clients matched against donation donors
- Lobbyist clients matched against AusTender contractors
- Former govt reps matched against the members table

Usage:
    python -m parli.ingest.federal_lobbyists
    python -m parli.ingest.federal_lobbyists --dry-run
    python -m parli.ingest.federal_lobbyists --cross-reference-only
"""

import argparse
import hashlib
import json
import re
import sqlite3
import time
from datetime import datetime
from pathlib import Path

import requests

from parli.schema import get_db, init_db

# ── Configuration ─────────────────────────────────────────────────────────────

REGISTER_URL = "https://lobbyists.ag.gov.au"
API_BASE = "https://api.lobbyists.ag.gov.au"
CACHE_DIR = Path("~/.cache/autoresearch/federal_lobbyists").expanduser()

# Headers required by the API (CORS origin check)
API_HEADERS = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Origin": "https://lobbyists.ag.gov.au",
    "Referer": "https://lobbyists.ag.gov.au/",
    "User-Agent": "Mozilla/5.0 (compatible; OPAX/1.0; +https://opax.com.au)",
}

# ── Database schema ──────────────────────────────────────────────────────────

FEDERAL_LOBBYIST_SCHEMA = """
CREATE TABLE IF NOT EXISTS federal_lobbyists (
    lobbyist_id TEXT PRIMARY KEY,
    trading_name TEXT NOT NULL,
    abn TEXT,
    business_entity TEXT,
    former_govt_role TEXT,
    registration_date TEXT,
    status TEXT  -- 'active', 'suspended', 'deregistered'
);

CREATE INDEX IF NOT EXISTS idx_fed_lob_name ON federal_lobbyists(trading_name);
CREATE INDEX IF NOT EXISTS idx_fed_lob_status ON federal_lobbyists(status);
CREATE INDEX IF NOT EXISTS idx_fed_lob_abn ON federal_lobbyists(abn);

CREATE TABLE IF NOT EXISTS federal_lobbyist_clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lobbyist_id TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_abn TEXT,
    FOREIGN KEY (lobbyist_id) REFERENCES federal_lobbyists(lobbyist_id),
    UNIQUE(lobbyist_id, client_name)
);

CREATE INDEX IF NOT EXISTS idx_fed_lob_client_name ON federal_lobbyist_clients(client_name);
CREATE INDEX IF NOT EXISTS idx_fed_lob_client_lobbyist ON federal_lobbyist_clients(lobbyist_id);
"""


def _text_hash(text: str) -> str:
    """Generate a short deterministic ID from text."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


# ── Schema init ──────────────────────────────────────────────────────────────

def init_federal_lobbyist_tables(db: sqlite3.Connection) -> None:
    """Create federal lobbyist tables if they don't exist."""
    db.executescript(FEDERAL_LOBBYIST_SCHEMA)


# ── API scraping ─────────────────────────────────────────────────────────────

def _fetch_organisation_list(include_deregistered: bool = True) -> list[dict]:
    """Fetch all organisation records from the lobbyist register API.

    Uses POST /search/organisations with pagination (100 per page).
    Returns list of org summary dicts with id, displayName, tradingName, abn, etc.
    """
    all_orgs = []

    for is_dereg in ([False, True] if include_deregistered else [False]):
        page_num = 1
        label = "deregistered" if is_dereg else "active"

        while True:
            body = {
                "entity": "organisation",
                "query": "",
                "pageNumber": page_num,
                "pagingCookie": None,
                "count": 100,
                "sortCriteria": {"fieldName": "name", "sortOrder": 0},
                "isDeregistered": is_dereg,
            }

            try:
                resp = requests.post(
                    f"{API_BASE}/search/organisations",
                    json=body,
                    headers=API_HEADERS,
                    timeout=30,
                )
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                print(f"  ERROR fetching {label} page {page_num}: {e}")
                break

            result_set = data.get("resultSet", [])
            total = data.get("totalRecords", 0)

            if page_num == 1:
                print(f"  {label.capitalize()} organisations: {total} total")

            if not result_set:
                break

            for org in result_set:
                org["_is_deregistered"] = is_dereg
            all_orgs.extend(result_set)

            # Check if we have all records
            if len(all_orgs) >= total or len(result_set) < 100:
                # For active orgs, we may have fetched enough
                if not is_dereg and len([o for o in all_orgs if not o["_is_deregistered"]]) >= total:
                    break
                elif is_dereg and len([o for o in all_orgs if o["_is_deregistered"]]) >= total:
                    break
                # Safety: if result set was < count, no more pages
                if len(result_set) < 100:
                    break

            page_num += 1
            time.sleep(0.2)  # Be polite

    return all_orgs


def _fetch_organisation_profile(org_id: str) -> dict | None:
    """Fetch full profile for a single organisation.

    GET /search/organisations/{id}/profile
    Returns dict with keys: summary, lobbyists, clients, stakeholders
    """
    try:
        resp = requests.get(
            f"{API_BASE}/search/organisations/{org_id}/profile",
            headers=API_HEADERS,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"    ERROR fetching profile {org_id}: {e}")
        return None


def scrape_register(include_deregistered: bool = True) -> list[dict]:
    """Scrape the federal lobbyist register via its JSON API.

    1. Fetches all organisation listings (active + deregistered)
    2. Fetches full profile for each organisation (lobbyists, clients)
    3. Returns normalized list of lobbyist dicts

    Returns list of dicts with keys:
        trading_name, abn, business_entity, former_govt_role,
        registration_date, status, clients
    """
    print(f"  Fetching organisation listings from {API_BASE}...")
    orgs = _fetch_organisation_list(include_deregistered=include_deregistered)
    print(f"  Found {len(orgs)} organisations total")

    if not orgs:
        return []

    # Cache the org list
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_DIR / "organisations_list.json"
    cache_path.write_text(json.dumps(orgs, indent=2, default=str))

    # Fetch full profiles for each organisation
    lobbyists = []
    print(f"  Fetching profiles for {len(orgs)} organisations...")

    for i, org in enumerate(orgs):
        org_id = org.get("id")
        if not org_id:
            continue

        if (i + 1) % 50 == 0:
            print(f"    ... {i + 1}/{len(orgs)} profiles fetched")

        profile = _fetch_organisation_profile(org_id)
        if not profile:
            # Fall back to summary-only data
            entry = _normalize_org_summary(org)
            if entry.get("trading_name"):
                lobbyists.append(entry)
            continue

        entry = _normalize_profile(org, profile)
        if entry.get("trading_name"):
            lobbyists.append(entry)

        time.sleep(0.15)  # Rate limit: ~6 req/sec

    # Cache the full dataset
    cache_path = CACHE_DIR / "lobbyists_full.json"
    cache_path.write_text(json.dumps(lobbyists, indent=2, default=str))
    print(f"  Cached full dataset to {cache_path}")

    print(f"  Extracted {len(lobbyists)} lobbyist entries")
    return lobbyists


def _normalize_org_summary(org: dict) -> dict:
    """Normalize an org listing record (no profile detail)."""
    is_dereg = org.get("_is_deregistered", org.get("isDeregistered", False))
    return {
        "trading_name": (org.get("displayName") or "").strip(),
        "abn": (org.get("abn") or "").strip(),
        "business_entity": "",
        "former_govt_role": "",
        "registration_date": (org.get("registeredOn") or "")[:10],
        "status": "deregistered" if is_dereg else "active",
        "clients": [],
    }


def _normalize_profile(org: dict, profile: dict) -> dict:
    """Normalize a full profile response into our standard format."""
    summary = profile.get("summary", {})
    is_dereg = summary.get("isDeregistered", org.get("_is_deregistered", False))

    # Extract former government representatives from lobbyists list
    former_roles = []
    for lob in profile.get("lobbyists", []):
        if lob.get("isFormerRepresentative"):
            name = (lob.get("displayName") or "").strip()
            position = (lob.get("previousPositionOther") or lob.get("previousPosition") or "").strip()
            level = (lob.get("previousPositionLevel") or "").strip()
            cessation = (lob.get("cessationDate") or "")[:10]
            notes = (lob.get("additionalNotes") or "").strip()

            parts = [name]
            if position:
                parts.append(position)
            if level:
                parts.append(f"({level})")
            if cessation:
                parts.append(f"left {cessation}")
            if notes:
                parts.append(f"[{notes}]")
            former_roles.append(" -- ".join(parts))

    # Extract clients from both "clients" and "stakeholders" fields
    clients = []
    for client in profile.get("clients", []):
        name = (
            client.get("displayName")
            or client.get("businessName")
            or client.get("lastName")
            or ""
        ).strip()
        if name:
            clients.append({
                "name": name,
                "abn": (client.get("abn") or "").strip(),
            })

    for stakeholder in profile.get("stakeholders", []):
        name = (
            stakeholder.get("displayName")
            or stakeholder.get("businessName")
            or stakeholder.get("lastName")
            or ""
        ).strip()
        if name and not any(c["name"] == name for c in clients):
            clients.append({
                "name": name,
                "abn": "",
            })

    return {
        "trading_name": (summary.get("displayName") or org.get("displayName") or "").strip(),
        "abn": (summary.get("abn") or org.get("abn") or "").strip(),
        "business_entity": "",
        "former_govt_role": "; ".join(former_roles) if former_roles else "",
        "registration_date": (summary.get("registeredOn") or "")[:10],
        "status": "deregistered" if is_dereg else "active",
        "clients": clients,
    }


# ── Database operations ───────────────────────────────────────────────────────

def store_lobbyists(db: sqlite3.Connection, lobbyists: list[dict]) -> tuple[int, int]:
    """Store lobbyist data in the database.

    Returns (lobbyist_count, client_count).
    """
    db.execute("PRAGMA busy_timeout = 600000")
    lob_count = 0
    client_count = 0

    for entry in lobbyists:
        trading_name = entry.get("trading_name", "").strip()
        if not trading_name:
            continue

        lobbyist_id = _text_hash(trading_name.lower())

        try:
            db.execute("""
                INSERT OR REPLACE INTO federal_lobbyists
                (lobbyist_id, trading_name, abn, business_entity,
                 former_govt_role, registration_date, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                lobbyist_id,
                trading_name,
                entry.get("abn", ""),
                entry.get("business_entity", ""),
                entry.get("former_govt_role", ""),
                entry.get("registration_date", ""),
                entry.get("status", ""),
            ))
            lob_count += 1

            # Store clients
            clients = entry.get("clients", [])
            for client in clients:
                if isinstance(client, dict):
                    client_name = client.get("name", "").strip()
                    client_abn = client.get("abn", "")
                elif isinstance(client, str):
                    client_name = client.strip()
                    client_abn = ""
                else:
                    continue

                if not client_name:
                    continue

                try:
                    db.execute("""
                        INSERT OR IGNORE INTO federal_lobbyist_clients
                        (lobbyist_id, client_name, client_abn)
                        VALUES (?, ?, ?)
                    """, (lobbyist_id, client_name, client_abn))
                    client_count += 1
                except sqlite3.IntegrityError:
                    pass

        except Exception as e:
            print(f"    Error storing {trading_name}: {e}")

    db.commit()
    return lob_count, client_count


# ── Cross-referencing ─────────────────────────────────────────────────────────

def cross_reference(db: sqlite3.Connection) -> dict:
    """Cross-reference lobbyist data with donations, contracts, and members.

    Stores results in analysis_cache and returns a summary dict.
    """
    db.execute("PRAGMA busy_timeout = 600000")
    results = {
        "donor_lobbyist_matches": [],
        "contractor_lobbyist_matches": [],
        "revolving_door_matches": [],
    }

    # 1. Match lobbyist clients with donation donors (Python-side fuzzy match)
    print("  Cross-referencing lobbyist clients with donation donors...")
    try:
        # Load client names with lobbyist info
        clients = db.execute("""
            SELECT flc.client_name, fl.trading_name AS lobbyist_name, flc.lobbyist_id
            FROM federal_lobbyist_clients flc
            JOIN federal_lobbyists fl ON fl.lobbyist_id = flc.lobbyist_id
            WHERE LENGTH(TRIM(flc.client_name)) > 4
        """).fetchall()

        # Build a set of normalized client names for fast lookup
        client_map = {}  # lower_name -> (client_name, lobbyist_name)
        for c in clients:
            key = c["client_name"].strip().lower()
            # Skip very generic names
            if len(key) > 4 and key not in ("smith", "other", "trust", "group"):
                client_map[key] = (c["client_name"], c["lobbyist_name"])

        # Load distinct donor names with aggregated amounts
        donors = db.execute("""
            SELECT donor_name, recipient, SUM(amount) as amount,
                   GROUP_CONCAT(DISTINCT financial_year) as financial_year,
                   industry
            FROM donations
            WHERE LENGTH(TRIM(donor_name)) > 4
            GROUP BY LOWER(TRIM(donor_name)), recipient
            ORDER BY SUM(amount) DESC NULLS LAST
        """).fetchall()

        donor_matches = []
        for d in donors:
            donor_lower = d["donor_name"].strip().lower()
            for client_key, (client_name, lobbyist_name) in client_map.items():
                if client_key in donor_lower or donor_lower in client_key:
                    donor_matches.append({
                        "client_name": client_name,
                        "lobbyist_name": lobbyist_name,
                        "donor_name": d["donor_name"],
                        "recipient": d["recipient"],
                        "amount": d["amount"],
                        "financial_year": d["financial_year"],
                        "industry": d["industry"],
                    })
                    if len(donor_matches) >= 500:
                        break
            if len(donor_matches) >= 500:
                break

        results["donor_lobbyist_matches"] = donor_matches
        print(f"    Found {len(donor_matches)} lobbyist-client / donor matches")
    except Exception as e:
        print(f"    Donor cross-ref error: {e}")

    # 2. Match lobbyist clients with AusTender contractors (Python-side)
    print("  Cross-referencing lobbyist clients with AusTender contractors...")
    try:
        contracts = db.execute("""
            SELECT contract_id, title, supplier_name, agency, amount, start_date
            FROM contracts
            WHERE LENGTH(TRIM(supplier_name)) > 4
            ORDER BY amount DESC NULLS LAST
        """).fetchall()

        contractor_matches = []
        for c in contracts:
            supplier_lower = c["supplier_name"].strip().lower()
            for client_key, (client_name, lobbyist_name) in client_map.items():
                if client_key in supplier_lower or supplier_lower in client_key:
                    contractor_matches.append({
                        "client_name": client_name,
                        "lobbyist_name": lobbyist_name,
                        "contract_id": c["contract_id"],
                        "contract_title": c["title"],
                        "supplier_name": c["supplier_name"],
                        "agency": c["agency"],
                        "contract_amount": c["amount"],
                        "start_date": c["start_date"],
                    })
                    if len(contractor_matches) >= 500:
                        break
            if len(contractor_matches) >= 500:
                break

        results["contractor_lobbyist_matches"] = contractor_matches
        print(f"    Found {len(contractor_matches)} lobbyist-client / contractor matches")
    except Exception as e:
        print(f"    Contractor cross-ref error: {e}")

    # 3. Match former govt reps with members table (revolving door)
    print("  Cross-referencing former govt representatives with MP records...")
    try:
        # Get all lobbyists with former govt roles
        lobbyists_with_roles = db.execute("""
            SELECT lobbyist_id, trading_name, former_govt_role
            FROM federal_lobbyists
            WHERE former_govt_role IS NOT NULL AND former_govt_role != ''
        """).fetchall()

        revolving_door = []
        for lob in lobbyists_with_roles:
            role_text = lob["former_govt_role"]
            # Try to match names from the role text against members
            # Split on common delimiters
            names = re.split(r"[;]", role_text)
            for name_part in names:
                name_part = name_part.strip()
                if len(name_part) < 3:
                    continue
                # Extract just the name part (before " -- " role description)
                name_clean = name_part.split(" -- ")[0].strip()
                if len(name_clean) < 3:
                    continue

                # Search members table
                member_matches = db.execute("""
                    SELECT person_id, full_name, party, electorate, chamber
                    FROM members
                    WHERE LOWER(full_name) LIKE ?
                    LIMIT 5
                """, (f"%{name_clean.lower()}%",)).fetchall()

                for m in member_matches:
                    revolving_door.append({
                        "lobbyist_name": lob["trading_name"],
                        "lobbyist_id": lob["lobbyist_id"],
                        "former_role_raw": name_part,
                        "matched_mp": m["full_name"],
                        "person_id": m["person_id"],
                        "party": m["party"],
                        "electorate": m["electorate"],
                        "chamber": m["chamber"],
                    })

        results["revolving_door_matches"] = revolving_door
        print(f"    Found {len(revolving_door)} revolving door matches")

    except Exception as e:
        print(f"    Revolving door cross-ref error: {e}")

    # Store all results in analysis_cache
    now = datetime.now().isoformat()

    for key, data in [
        ("federal_lobbyist_donor_matches", results["donor_lobbyist_matches"]),
        ("federal_lobbyist_contractor_matches", results["contractor_lobbyist_matches"]),
        ("federal_lobbyist_revolving_door", results["revolving_door_matches"]),
    ]:
        try:
            db.execute("""
                INSERT OR REPLACE INTO analysis_cache (key, value, updated_at)
                VALUES (?, ?, ?)
            """, (key, json.dumps(data), now))
        except Exception as e:
            print(f"    Error caching {key}: {e}")

    # Summary stats
    summary = {
        "total_lobbyists": db.execute(
            "SELECT COUNT(*) FROM federal_lobbyists"
        ).fetchone()[0],
        "total_clients": db.execute(
            "SELECT COUNT(*) FROM federal_lobbyist_clients"
        ).fetchone()[0],
        "donor_matches": len(results["donor_lobbyist_matches"]),
        "contractor_matches": len(results["contractor_lobbyist_matches"]),
        "revolving_door_matches": len(results["revolving_door_matches"]),
        "updated_at": now,
    }

    db.execute("""
        INSERT OR REPLACE INTO analysis_cache (key, value, updated_at)
        VALUES ('federal_lobbyist_summary', ?, ?)
    """, (json.dumps(summary), now))

    db.commit()
    print(f"\n  Summary: {json.dumps(summary, indent=2)}")
    return results


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Ingest Federal Lobbyist Register for OPAX."
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print what would be scraped without writing to DB",
    )
    parser.add_argument(
        "--cross-reference-only", action="store_true",
        help="Skip scraping, just run cross-referencing on existing data",
    )
    parser.add_argument(
        "--no-deregistered", action="store_true",
        help="Skip deregistered organisations",
    )
    args = parser.parse_args()

    print("Federal Lobbyist Register Ingester (OPAX)")
    print(f"  API: {API_BASE}")
    print(f"  Dry run: {args.dry_run}")

    db = get_db()
    db.execute("PRAGMA busy_timeout = 600000")
    init_db(db)
    init_federal_lobbyist_tables(db)

    if not args.cross_reference_only:
        print("\n=== Fetching Federal Lobbyist Register ===")

        lobbyists = scrape_register(
            include_deregistered=not args.no_deregistered,
        )

        if args.dry_run:
            for entry in lobbyists[:20]:
                clients = entry.get("clients", [])
                client_str = f" ({len(clients)} clients)" if clients else ""
                former = entry.get("former_govt_role", "")
                former_str = f" [REVOLVING DOOR: {former[:80]}]" if former else ""
                print(f"  {entry.get('trading_name', 'N/A')}{client_str}{former_str}")
            if len(lobbyists) > 20:
                print(f"  ... and {len(lobbyists) - 20} more")
        else:
            if lobbyists:
                lob_n, client_n = store_lobbyists(db, lobbyists)
                print(f"  Stored {lob_n} lobbyists and {client_n} client relationships")
            else:
                print("  No lobbyist data extracted.")

    # Cross-reference
    if not args.dry_run:
        print("\n=== Cross-Referencing ===")
        cross_reference(db)

    # Final counts
    print(f"\n{'=' * 60}")
    for table in ["federal_lobbyists", "federal_lobbyist_clients"]:
        try:
            count = db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            print(f"  {table}: {count} rows")
        except Exception:
            print(f"  {table}: table created (no data yet)")

    # Show analysis cache entries
    for key in [
        "federal_lobbyist_summary",
        "federal_lobbyist_donor_matches",
        "federal_lobbyist_contractor_matches",
        "federal_lobbyist_revolving_door",
    ]:
        try:
            row = db.execute(
                "SELECT value FROM analysis_cache WHERE key = ?", (key,)
            ).fetchone()
            if row:
                data = json.loads(row["value"])
                if isinstance(data, list):
                    print(f"  {key}: {len(data)} entries")
                else:
                    print(f"  {key}: {json.dumps(data)}")
        except Exception:
            pass


if __name__ == "__main__":
    main()
