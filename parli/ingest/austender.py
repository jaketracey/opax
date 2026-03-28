"""
parli.ingest.austender -- Fetch and load AusTender government contract data.

Uses the AusTender OCDS (Open Contracting Data Standard) API to download
contract notices from the Australian Government's procurement system.

Focus: Contracts > $1M AUD — the most interesting for corruption/transparency
analysis and cross-referencing against political donation data.

API docs: https://api.tenders.gov.au/
No authentication required. Data is CC-BY 3.0 AU licensed.

Usage:
    python -m parli.ingest.austender --limit 1000
    python -m parli.ingest.austender --start-date 2020-01-01 --min-amount 5000000
"""

import argparse
import time
from datetime import datetime, timedelta

import requests

from parli.schema import get_db, init_db

API_BASE = "https://api.tenders.gov.au/ocds"

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "OPAX/1.0 (parliamentary transparency research)"})

BATCH_SIZE = 500


def fetch_contracts_by_date_range(
    start_date: str,
    end_date: str,
    min_amount: float = 1_000_000,
) -> list[dict]:
    """Fetch contracts published in a date range from AusTender OCDS API.

    Args:
        start_date: ISO date string (YYYY-MM-DD).
        end_date: ISO date string (YYYY-MM-DD).
        min_amount: Minimum contract value in AUD to include.

    Returns:
        List of parsed contract dicts ready for DB insertion.
    """
    url = (
        f"{API_BASE}/findByDates/contractPublished/"
        f"{start_date}T00:00:00Z/{end_date}T23:59:59Z"
    )
    try:
        resp = SESSION.get(url, timeout=60)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"  API error for {start_date} to {end_date}: {e}")
        return []

    data = resp.json()
    releases = data.get("releases", [])
    contracts = []

    for release in releases:
        parties = release.get("parties", [])
        supplier = next(
            (p for p in parties if "supplier" in p.get("roles", [])), {}
        )
        buyer = next(
            (p for p in parties if "procuringEntity" in p.get("roles", [])), {}
        )
        tender = release.get("tender", {})

        for contract in release.get("contracts", []):
            value = contract.get("value", {})
            try:
                amount = float(value.get("amount", 0))
            except (ValueError, TypeError):
                amount = 0.0

            if amount < min_amount:
                continue

            period = contract.get("period", {})
            start = period.get("startDate", "")[:10] if period.get("startDate") else None
            end = period.get("endDate", "")[:10] if period.get("endDate") else None

            contracts.append({
                "contract_id": contract.get("id", ""),
                "title": contract.get("description") or contract.get("title", ""),
                "description": contract.get("description", ""),
                "supplier_name": supplier.get("name", ""),
                "agency": buyer.get("name", ""),
                "amount": amount,
                "start_date": start,
                "end_date": end,
                "procurement_method": tender.get("procurementMethodDetails")
                    or tender.get("procurementMethod", ""),
            })

    return contracts


def fetch_contracts(
    limit: int = 1000,
    start_date: str | None = None,
    min_amount: float = 1_000_000,
    days_per_chunk: int = 7,
) -> list[dict]:
    """Fetch contracts from AusTender, paginating by date chunks.

    The API returns results per date range, so we iterate backwards from
    today in weekly chunks until we hit the limit or the start_date.

    Args:
        limit: Maximum number of contracts to fetch.
        start_date: Earliest date to fetch from (YYYY-MM-DD). Default: 5 years ago.
        min_amount: Minimum contract value in AUD.
        days_per_chunk: Days per API request (to stay within response limits).

    Returns:
        List of contract dicts.
    """
    if start_date:
        dt_start = datetime.strptime(start_date, "%Y-%m-%d")
    else:
        dt_start = datetime.now() - timedelta(days=5 * 365)

    dt_end = datetime.now()
    all_contracts = []

    print(f"Fetching contracts > ${min_amount:,.0f} from {dt_start.date()} to {dt_end.date()}")

    chunk_end = dt_end
    while chunk_end > dt_start and len(all_contracts) < limit:
        chunk_start = max(chunk_end - timedelta(days=days_per_chunk), dt_start)
        s = chunk_start.strftime("%Y-%m-%d")
        e = chunk_end.strftime("%Y-%m-%d")

        contracts = fetch_contracts_by_date_range(s, e, min_amount=min_amount)
        if contracts:
            all_contracts.extend(contracts)
            print(f"  {s} to {e}: {len(contracts)} contracts (total: {len(all_contracts)})")

        chunk_end = chunk_start - timedelta(days=1)

        # Rate limiting — be polite to the API
        time.sleep(0.5)

    return all_contracts[:limit]


def load_contracts(contracts: list[dict], db=None) -> int:
    """Insert contracts into the database.

    Returns count of new contracts inserted.
    """
    if db is None:
        db = get_db()
    init_db(db)

    inserted = 0
    for i in range(0, len(contracts), BATCH_SIZE):
        batch = contracts[i : i + BATCH_SIZE]
        for c in batch:
            try:
                db.execute(
                    """
                    INSERT OR IGNORE INTO contracts
                    (contract_id, title, description, supplier_name, agency,
                     amount, start_date, end_date, procurement_method)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        c["contract_id"],
                        c["title"],
                        c["description"],
                        c["supplier_name"],
                        c["agency"],
                        c["amount"],
                        c["start_date"],
                        c["end_date"],
                        c["procurement_method"],
                    ),
                )
                inserted += 1
            except Exception as e:
                print(f"  Error inserting {c['contract_id']}: {e}")
        db.commit()

    return inserted


def find_donor_contractor_matches(db=None) -> list[dict]:
    """Find companies that appear in BOTH the donations and contracts tables.

    This is the 'pay to play' detection — companies that donated to political
    parties and also won government contracts.

    Uses fuzzy matching: normalises names by stripping PTY, LTD, etc. and
    comparing the core company name.
    """
    if db is None:
        db = get_db()

    # Get distinct supplier names from contracts
    suppliers = db.execute(
        "SELECT DISTINCT supplier_name FROM contracts WHERE supplier_name != ''"
    ).fetchall()

    # Get distinct donor names from donations
    donors = db.execute(
        "SELECT DISTINCT donor_name FROM donations WHERE donor_name != ''"
    ).fetchall()

    def normalise(name: str) -> str:
        """Strip common suffixes and normalise for matching."""
        n = name.upper().strip()
        for suffix in [
            " PTY LTD", " PTY. LTD.", " PTY LIMITED", " LIMITED",
            " LTD", " INC", " INCORPORATED", " CORP", " CORPORATION",
            " AUSTRALIA", " GROUP", " HOLDINGS", " SERVICES",
        ]:
            n = n.replace(suffix, "")
        return n.strip()

    # Build lookup from normalised donor names
    donor_lookup: dict[str, list[str]] = {}
    for row in donors:
        norm = normalise(row["donor_name"])
        if len(norm) < 3:
            continue
        donor_lookup.setdefault(norm, []).append(row["donor_name"])

    matches = []
    for row in suppliers:
        norm_supplier = normalise(row["supplier_name"])
        if norm_supplier in donor_lookup:
            # Found a match — get details
            for donor_name in donor_lookup[norm_supplier]:
                donations = db.execute(
                    "SELECT SUM(amount) as total, COUNT(*) as count, recipient "
                    "FROM donations WHERE donor_name = ? GROUP BY recipient",
                    (donor_name,),
                ).fetchall()
                contracts_data = db.execute(
                    "SELECT SUM(amount) as total, COUNT(*) as count "
                    "FROM contracts WHERE supplier_name = ?",
                    (row["supplier_name"],),
                ).fetchone()

                for d in donations:
                    matches.append({
                        "supplier_name": row["supplier_name"],
                        "donor_name": donor_name,
                        "party": d["recipient"],
                        "donation_total": d["total"],
                        "donation_count": d["count"],
                        "contract_total": contracts_data["total"],
                        "contract_count": contracts_data["count"],
                    })

    # Sort by contract value descending
    matches.sort(key=lambda m: m.get("contract_total") or 0, reverse=True)
    return matches


def main():
    parser = argparse.ArgumentParser(
        description="Fetch AusTender government contracts into parli.db"
    )
    parser.add_argument(
        "--limit", type=int, default=1000,
        help="Maximum number of contracts to fetch (default: 1000)",
    )
    parser.add_argument(
        "--start-date", type=str, default=None,
        help="Earliest date to fetch from (YYYY-MM-DD, default: 5 years ago)",
    )
    parser.add_argument(
        "--min-amount", type=float, default=1_000_000,
        help="Minimum contract value in AUD (default: 1000000)",
    )
    parser.add_argument(
        "--match-donors", action="store_true",
        help="After loading, find donor-contractor matches",
    )
    args = parser.parse_args()

    print("=== AusTender Contract Ingestion ===")
    contracts = fetch_contracts(
        limit=args.limit,
        start_date=args.start_date,
        min_amount=args.min_amount,
    )
    print(f"\nFetched {len(contracts)} contracts > ${args.min_amount:,.0f}")

    if contracts:
        db = get_db()
        init_db(db)
        inserted = load_contracts(contracts, db)
        print(f"Inserted {inserted} new contracts into database")

        total = db.execute("SELECT COUNT(*) FROM contracts").fetchone()[0]
        print(f"Total contracts in database: {total}")

        # Always try to find matches if we have both tables populated
        if args.match_donors:
            print("\n=== Donor-Contractor Matching ===")
            matches = find_donor_contractor_matches(db)
            if matches:
                print(f"Found {len(matches)} donor-contractor connections:\n")
                for m in matches[:30]:
                    d_total = f"${m['donation_total']:,.0f}" if m["donation_total"] else "?"
                    c_total = f"${m['contract_total']:,.0f}" if m["contract_total"] else "?"
                    print(
                        f"  {m['supplier_name']}\n"
                        f"    Donated {d_total} ({m['donation_count']}x) to {m['party']}\n"
                        f"    Won {c_total} in contracts ({m['contract_count']}x)\n"
                    )
            else:
                print("No matches found between donors and contractors.")
    else:
        print("No contracts fetched.")


if __name__ == "__main__":
    main()
