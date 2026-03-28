"""
parli.ingest.ipea_expenses -- Ingest IPEA (Independent Parliamentary Expenses
Authority) quarterly expense data from data.gov.au into the mp_expenses table.

IPEA publishes quarterly CSV extracts covering all parliamentarian expenditure
from April 2017 onwards.  Each quarter has up to 5 CSVs:
  - expenses (transactional detail)
  - repayments
  - certifications
  - office costs by state
  - adjustments

This module:
  1. Discovers all IPEA datasets via the CKAN API on data.gov.au
  2. Downloads only the main expenses CSVs (the newsworthy line-items)
  3. Maps columns to the existing mp_expenses table schema
  4. Links records to the members table via name matching
  5. Is safe to re-run (idempotent: deletes source='ipea' before reload)

Usage:
    python -m parli.ingest.ipea_expenses                # download + ingest all
    python -m parli.ingest.ipea_expenses --download-only
    python -m parli.ingest.ipea_expenses --skip-download
    python -m parli.ingest.ipea_expenses --since 2023   # only quarters >= 2023
"""

import argparse
import csv
import io
import os
import re
import sys
import time
from pathlib import Path

import requests

from parli.schema import get_db, init_db

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DATA_DIR = Path("~/.cache/autoresearch/ipea").expanduser()

CKAN_API = "https://data.gov.au/data/api/3/action/package_search"
CKAN_ORG = "ipea"

# Categories that are most newsworthy for transparency reporting
NEWSWORTHY_CATEGORIES = {
    "travel",
    "charter",
    "family",
    "overseas",
    "domestic",
    "car",
    "office",
    "comcar",
    "flights",
    "allowance",
}

# Map IPEA HighLevelCategory / MajorSubCategory to icacpls-compatible category
CATEGORY_MAP = {
    # Travel
    ("Travel", "Domestic Scheduled Fares"): "Domestic Scheduled Fares",
    ("Travel", "Unscheduled Transport"): "Unscheduled Transport",
    ("Travel", "Charter Transport"): "Charter",
    ("Travel", "Overseas Travel"): "Overseas Travel",
    ("Travel", "Travelling Allowance"): "Travelling Allowance",
    ("Travel", "Comcar"): "Car Costs",
    ("Travel", "Private Vehicle Allowance"): "Car Costs",
    ("Travel", "Car Transport"): "Car Costs",
    ("Travel", "Family Travel"): "Family Travel Costs",
    # Office
    ("Office Administration", "Office Consumables and Services"): "Office Consumables and Services",
    ("Office Administration", "Office Facilities"): "Office Facilities",
    ("Office Administration", "Publications"): "Publications",
    ("Office Administration", "Printing and Communications"): "Printing and Communications",
    ("Office Administration", "Telecommunications"): "Telecommunications",
    # Employee
    ("Employee Costs", None): "Employee Costs",
}


def map_category(high: str, major: str) -> str:
    """Map IPEA categories to icacpls-compatible category names."""
    key = (high, major)
    if key in CATEGORY_MAP:
        return CATEGORY_MAP[key]
    # Try with None major
    if (high, None) in CATEGORY_MAP:
        return CATEGORY_MAP[(high, None)]
    # Fall back to major subcategory or high level
    return major if major else high


# ---------------------------------------------------------------------------
# CKAN API discovery
# ---------------------------------------------------------------------------

def discover_datasets() -> list[dict]:
    """Query data.gov.au CKAN API to find all IPEA expense datasets.

    Returns list of dicts with keys: quarter_id, title, expenses_url, and
    URLs for supplementary CSVs (repayments, certifications, etc).
    """
    datasets = []
    offset = 0
    rows_per_page = 50

    while True:
        print(f"  Querying CKAN API (offset={offset})...")
        resp = requests.get(CKAN_API, params={
            "q": f"organization:{CKAN_ORG}",
            "rows": rows_per_page,
            "start": offset,
            "sort": "metadata_created desc",
        }, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        results = data["result"]["results"]
        total = data["result"]["count"]

        if not results:
            break

        for ds in results:
            title = ds["title"]
            resources = ds.get("resources", [])

            entry = {"title": title, "expenses_url": None,
                     "repayments_url": None, "certifications_url": None,
                     "office_costs_url": None, "adjustments_url": None,
                     "quarter_id": None}

            for r in resources:
                url = r.get("url", "")
                fmt = r.get("format", "").upper().strip(".")
                name = r.get("name", "").lower()

                if fmt != "CSV":
                    continue

                fname = url.split("/")[-1].lower()

                # Extract quarter ID from filename (e.g. 2025q03)
                qmatch = re.search(r"(\d{4}q\d{2})", fname)
                if qmatch and not entry["quarter_id"]:
                    entry["quarter_id"] = qmatch.group(1)

                # Classify the resource
                if "repayment" in fname or "repayment" in name:
                    entry["repayments_url"] = url
                elif "certification" in fname or "certification" in name:
                    entry["certifications_url"] = url
                elif "officecost" in fname or "office cost" in name:
                    entry["office_costs_url"] = url
                elif "adjustment" in fname or "adjustment" in name:
                    entry["adjustments_url"] = url
                elif "dataextract" in fname or "expense" in name:
                    entry["expenses_url"] = url

            if entry["expenses_url"]:
                datasets.append(entry)

        offset += rows_per_page
        if offset >= total:
            break

    # Sort by quarter_id
    datasets.sort(key=lambda d: d.get("quarter_id") or "")
    return datasets


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

def download_csvs(datasets: list[dict], since: str | None = None) -> list[Path]:
    """Download expense CSVs to DATA_DIR. Returns list of downloaded paths."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    downloaded = []

    for ds in datasets:
        qid = ds.get("quarter_id", "unknown")

        # Filter by --since
        if since and qid < since:
            continue

        url = ds["expenses_url"]
        fname = url.split("/")[-1]
        dest = DATA_DIR / fname

        if dest.exists() and dest.stat().st_size > 1000:
            print(f"  {fname} already exists ({dest.stat().st_size:,} bytes), skipping download")
            downloaded.append(dest)
            continue

        print(f"  Downloading {fname} ({ds['title']})...")
        try:
            resp = requests.get(url, timeout=120)
            resp.raise_for_status()
            dest.write_bytes(resp.content)
            print(f"    OK ({len(resp.content):,} bytes)")
            downloaded.append(dest)
            time.sleep(0.5)  # Be polite to data.gov.au
        except Exception as e:
            print(f"    FAILED: {e}")

    return downloaded


# ---------------------------------------------------------------------------
# Name matching to members table
# ---------------------------------------------------------------------------

def build_name_index(db) -> dict[str, str]:
    """Build lookup from normalized name -> person_id for member matching."""
    rows = db.execute(
        "SELECT person_id, first_name, last_name, full_name FROM members"
    ).fetchall()

    index = {}
    for r in rows:
        pid = r[0]
        first = (r[1] or "").strip().lower()
        last = (r[2] or "").strip().lower()
        full = (r[3] or "").strip().lower()

        if full:
            index[full] = pid
        if first and last:
            # "firstname lastname"
            index[f"{first} {last}"] = pid
            # "lastname, firstname"
            index[f"{last}, {first}"] = pid

    return index


def match_person(name_index: dict, surname: str, firstname: str,
                 full_name_with_title: str) -> str | None:
    """Try to match an IPEA record to a members person_id."""
    # Clean title prefix from full name
    clean = re.sub(
        r"^(The\s+)?(Rt\s+)?(Hon\s+)?(Senator\s+)?(Dr\s+)?(Mr\s+)?(Mrs\s+)?(Ms\s+)?",
        "", full_name_with_title or "", flags=re.IGNORECASE
    ).strip()
    # Remove "MP" / "AM" suffixes
    clean = re.sub(r"\s+(MP|AM|AC|AO|OAM|QC|SC)$", "", clean, flags=re.IGNORECASE).strip()

    # Try full cleaned name
    key = clean.lower()
    if key in name_index:
        return name_index[key]

    # Try firstname lastname
    fn = (firstname or "").strip().lower()
    ln = (surname or "").strip().lower()
    if fn and ln:
        key = f"{fn} {ln}"
        if key in name_index:
            return name_index[key]
        key = f"{ln}, {fn}"
        if key in name_index:
            return name_index[key]

    return None


# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------

def parse_amount(s: str) -> float | None:
    """Parse dollar amount, handling negatives and parentheses."""
    if not s:
        return None
    s = s.strip().replace("$", "").replace(",", "").strip()
    # Handle accounting-style negatives: (123.45)
    neg = False
    if s.startswith("(") and s.endswith(")"):
        neg = True
        s = s[1:-1]
    try:
        val = float(s)
        return -val if neg else val
    except ValueError:
        return None


def parse_int(s: str) -> int | None:
    if not s:
        return None
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return None


def ingest_expenses(db, csv_paths: list[Path], since: str | None = None) -> int:
    """Load IPEA expense CSVs into the mp_expenses table.

    Clears existing source='ipea' data first (idempotent).
    """
    # Add person_id column if table exists without it (older schema)
    try:
        db.execute("ALTER TABLE mp_expenses ADD COLUMN person_id TEXT")
        db.commit()
        print("  Added person_id column to mp_expenses")
    except Exception:
        pass  # Column already exists or table doesn't exist yet

    # Create indexes (safe to run repeatedly)
    for idx_sql in [
        "CREATE INDEX IF NOT EXISTS idx_mp_expenses_person_id ON mp_expenses(person_id)",
        "CREATE INDEX IF NOT EXISTS idx_mp_expenses_source ON mp_expenses(source)",
        "CREATE INDEX IF NOT EXISTS idx_mp_expenses_period ON mp_expenses(period)",
    ]:
        try:
            db.execute(idx_sql)
        except Exception:
            pass
    db.commit()

    # Clear existing IPEA data
    deleted = db.execute("DELETE FROM mp_expenses WHERE source = 'ipea'").rowcount
    if deleted:
        print(f"  Cleared {deleted:,} existing IPEA records")

    # Build name matching index
    name_index = build_name_index(db)
    print(f"  Name index: {len(name_index)} entries from members table")

    total = 0
    matched = 0
    unmatched_names = set()

    for csv_path in sorted(csv_paths):
        fname = csv_path.name

        # Extract quarter from filename
        qmatch = re.search(r"(\d{4})q(\d{2})", fname)
        if not qmatch:
            print(f"  Skipping {fname} (can't parse quarter)")
            continue

        year = qmatch.group(1)
        qnum = int(qmatch.group(2))

        if since and f"{year}q{qnum:02d}" < since:
            continue

        # Map quarter number to period label
        quarter_labels = {
            1: f"1 January - 31 March {year}",
            2: f"1 April - 30 June {year}",
            3: f"1 July - 30 September {year}",
            4: f"1 October - 31 December {year}",
        }
        period = quarter_labels.get(qnum, f"Q{qnum} {year}")

        batch = []
        file_count = 0
        file_matched = 0

        try:
            raw = csv_path.read_bytes()
            # Handle BOM
            text = raw.decode("utf-8-sig", errors="replace")
            reader = csv.DictReader(io.StringIO(text))

            for row in reader:
                full_name = (row.get("FullNameWithTitle") or "").strip()
                surname = (row.get("Surname") or "").strip()
                firstname = (row.get("FirstName") or "").strip()
                party = (row.get("Party") or "").strip()
                electorate_val = (row.get("Electorate") or "").strip()
                state_val = (row.get("StateOrTerritory") or "").strip()
                role = (row.get("Role") or "").strip()

                high_cat = (row.get("HighLevelCategory") or "").strip()
                major_sub = (row.get("MajorSubCategory") or "").strip()
                minor_sub = (row.get("MinorSubCategory") or "").strip()
                category = map_category(high_cat, major_sub)

                from_date = (row.get("FromDate") or "").strip()
                to_date = (row.get("ToDate") or "").strip()
                nights = parse_int(row.get("NumberNights") or "")
                nightly_rate = parse_amount(row.get("NightlyRate") or "")
                amount = parse_amount(row.get("Amount") or "")
                description = (row.get("Description") or "").strip()
                from_loc = (row.get("FromLocation") or "").strip()
                to_loc = (row.get("ToLocation") or "").strip()
                reason = (row.get("ReasonForTravel") or "").strip()
                notes = (row.get("PublishableNotes") or "").strip()

                # Build location string
                locations = []
                if from_loc:
                    locations.append(from_loc)
                if to_loc:
                    locations.append(to_loc)
                location = " -> ".join(locations) if locations else ""

                # Build purpose from reason + description
                purpose_parts = []
                if reason:
                    purpose_parts.append(reason)
                if description and description != reason:
                    purpose_parts.append(description)
                purpose = "; ".join(purpose_parts) if purpose_parts else ""

                # Determine member_type from role
                member_type = ""
                if "senator" in full_name.lower() or "senate" in role.lower():
                    member_type = "Senator"
                elif electorate_val:
                    member_type = "Representative"

                # Build name for display (without title)
                display_name = f"{firstname} {surname}".strip()
                if not display_name:
                    display_name = full_name

                # Detect family/spouse travel
                user_surname = (row.get("UserSurname") or "").strip()
                user_firstname = (row.get("UserFirstName") or "").strip()
                is_family = (
                    "family" in category.lower() or
                    "family" in high_cat.lower() or
                    "family" in major_sub.lower() or
                    (user_surname and user_surname.lower() != surname.lower())
                )
                spouse = ""
                if is_family and user_surname:
                    spouse = f"{user_firstname} {user_surname}".strip()

                # Match to members table
                person_id = match_person(name_index, surname, firstname, full_name)
                if person_id:
                    file_matched += 1
                elif display_name:
                    unmatched_names.add(display_name)

                batch.append((
                    display_name,
                    member_type,
                    electorate_val,
                    state_val,
                    party,
                    category,
                    minor_sub,       # subcategory
                    period,
                    from_date,
                    to_date,
                    location,
                    purpose,
                    nights,
                    nightly_rate,
                    amount,
                    from_date or "",  # date field
                    description,      # details
                    notes,
                    spouse,
                    role,             # expense_type
                    "",               # value
                    "",               # points
                    "ipea",
                    person_id,
                ))

                if len(batch) >= 5000:
                    db.executemany(
                        """INSERT INTO mp_expenses
                           (name, member_type, electorate, state, party, category,
                            subcategory, period, date_from, date_to, location, purpose,
                            nights, rate, amount, date, details, notes, spouse,
                            expense_type, value, points, source, person_id)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                        batch,
                    )
                    file_count += len(batch)
                    batch = []

            if batch:
                db.executemany(
                    """INSERT INTO mp_expenses
                       (name, member_type, electorate, state, party, category,
                        subcategory, period, date_from, date_to, location, purpose,
                        nights, rate, amount, date, details, notes, spouse,
                        expense_type, value, points, source, person_id)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    batch,
                )
                file_count += len(batch)

            total += file_count
            matched += file_matched
            print(f"  {fname}: {file_count:,} rows ({file_matched:,} matched to members)")

        except Exception as e:
            print(f"  ERROR processing {fname}: {e}")
            import traceback
            traceback.print_exc()

    db.commit()

    # Summary
    match_rate = (matched / total * 100) if total > 0 else 0
    print(f"\n  Total: {total:,} IPEA expense records ingested")
    print(f"  Member matching: {matched:,}/{total:,} ({match_rate:.1f}%)")
    if unmatched_names:
        top_unmatched = sorted(unmatched_names)[:20]
        print(f"  Sample unmatched names ({len(unmatched_names)} unique): {top_unmatched}")

    return total


# ---------------------------------------------------------------------------
# Stats / verification
# ---------------------------------------------------------------------------

def print_stats(db):
    """Print summary statistics for IPEA expenses."""
    print("\n=== IPEA Expense Statistics ===")

    # Total by source
    rows = db.execute(
        "SELECT source, COUNT(*) as cnt, SUM(amount) as total "
        "FROM mp_expenses GROUP BY source ORDER BY cnt DESC"
    ).fetchall()
    for r in rows:
        print(f"  {r[0]}: {r[1]:,} records, ${r[2]:,.0f}" if r[2] else f"  {r[0]}: {r[1]:,} records")

    # IPEA by period
    print("\n  IPEA by quarter:")
    rows = db.execute(
        "SELECT period, COUNT(*) as cnt, SUM(amount) as total "
        "FROM mp_expenses WHERE source = 'ipea' "
        "GROUP BY period ORDER BY period"
    ).fetchall()
    for r in rows:
        total = f"${r[2]:,.0f}" if r[2] else "$0"
        print(f"    {r[0]}: {r[1]:,} records, {total}")

    # Top categories
    print("\n  Top IPEA categories:")
    rows = db.execute(
        "SELECT category, COUNT(*) as cnt, SUM(amount) as total "
        "FROM mp_expenses WHERE source = 'ipea' "
        "GROUP BY category ORDER BY total DESC LIMIT 15"
    ).fetchall()
    for r in rows:
        total = f"${r[2]:,.0f}" if r[2] else "$0"
        print(f"    {r[0]}: {r[1]:,} records, {total}")

    # Top spenders
    print("\n  Top 10 IPEA spenders:")
    rows = db.execute(
        "SELECT name, party, SUM(amount) as total, COUNT(*) as cnt "
        "FROM mp_expenses WHERE source = 'ipea' AND amount > 0 "
        "GROUP BY name ORDER BY total DESC LIMIT 10"
    ).fetchall()
    for r in rows:
        print(f"    {r[0]} ({r[1]}): ${r[2]:,.0f} across {r[3]:,} items")

    # Newsworthy: charter flights
    print("\n  Charter flights (all IPEA):")
    rows = db.execute(
        "SELECT name, party, SUM(amount) as total, COUNT(*) as cnt "
        "FROM mp_expenses WHERE source = 'ipea' AND category = 'Charter' "
        "GROUP BY name ORDER BY total DESC LIMIT 10"
    ).fetchall()
    for r in rows:
        print(f"    {r[0]} ({r[1]}): ${r[2]:,.0f} ({r[3]} flights)")

    # Newsworthy: family travel
    print("\n  Family travel (all IPEA):")
    rows = db.execute(
        "SELECT name, party, SUM(amount) as total, COUNT(*) as cnt "
        "FROM mp_expenses WHERE source = 'ipea' "
        "AND (category LIKE '%Family%' OR spouse != '') "
        "GROUP BY name ORDER BY total DESC LIMIT 10"
    ).fetchall()
    for r in rows:
        print(f"    {r[0]} ({r[1]}): ${r[2]:,.0f} ({r[3]} items)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Ingest IPEA parliamentary expense data from data.gov.au"
    )
    parser.add_argument("--download-only", action="store_true",
                        help="Only download CSV files, don't ingest")
    parser.add_argument("--skip-download", action="store_true",
                        help="Skip download, use existing files")
    parser.add_argument("--since", type=str, default=None,
                        help="Only process quarters >= this (e.g. '2023' or '2023q01')")
    parser.add_argument("--stats-only", action="store_true",
                        help="Just print statistics, no download or ingest")
    parser.add_argument("--db", type=str, default=None,
                        help="Database path (default: ~/.cache/autoresearch/parli.db)")
    args = parser.parse_args()

    db = get_db(args.db)
    db.execute("PRAGMA busy_timeout = 300000")
    init_db(db)

    if args.stats_only:
        print_stats(db)
        db.close()
        return

    # Discover datasets
    if not args.skip_download:
        print("=== Discovering IPEA datasets on data.gov.au ===")
        datasets = discover_datasets()
        print(f"  Found {len(datasets)} quarterly expense datasets")
        for ds in datasets:
            print(f"    {ds.get('quarter_id', '?')}: {ds['title']}")

        # Download
        print("\n=== Downloading CSVs ===")
        since_filter = args.since if args.since else None
        csv_paths = download_csvs(datasets, since=since_filter)
        print(f"  {len(csv_paths)} files ready")

        if args.download_only:
            print("Download complete.")
            db.close()
            return
    else:
        # Use existing files
        csv_paths = sorted(DATA_DIR.glob("*_dataextract*.csv"))
        # Filter out supplementary CSVs
        csv_paths = [p for p in csv_paths
                     if not any(x in p.name for x in
                                ["repayment", "certification", "officecost", "adjustment"])]
        print(f"  Found {len(csv_paths)} existing CSV files in {DATA_DIR}")

    # Ingest
    print("\n=== Ingesting into mp_expenses table ===")
    count = ingest_expenses(db, csv_paths, since=args.since)

    # Print stats
    print_stats(db)

    db.close()
    print(f"\nDone. {count:,} IPEA expense records ingested.")


if __name__ == "__main__":
    main()
