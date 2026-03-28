"""
parli.ingest.grants -- Ingest government grants data for pork-barreling analysis.

Government grants are a major corruption vector (sports rorts, car park rorts, etc.).
This module ingests from multiple sources:

1. QLD Government Investment Portal -- open CSV data with ABN, amounts, recipients
2. GrantConnect CSV import -- for manually downloaded GrantConnect exports
3. data.gov.au CKAN API -- searches for additional grant datasets

Focus is on discretionary/ad-hoc grants (not formula-based) as these are
corruption-prone and most interesting for cross-referencing with donation data.

Usage:
    # Ingest QLD expenditure data (works out of the box)
    python -m parli.ingest.grants --qld

    # Import a GrantConnect CSV export
    python -m parli.ingest.grants --csv /path/to/grantconnect_export.csv

    # Run cross-reference analysis (pork-barreling detection)
    python -m parli.ingest.grants --analyze

    # Full pipeline
    python -m parli.ingest.grants --qld --analyze
"""

import argparse
import csv
import io
import json
import re
import sqlite3
import time
from datetime import datetime
from pathlib import Path

import requests

from parli.schema import get_db, init_db

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "OPAX/1.0 (parliamentary transparency research; https://opax.com.au)"
})

BATCH_SIZE = 500

# QLD Government Investment Portal expenditure CSVs (data.qld.gov.au)
# These contain grants with ABN, recipient, amount, agency, program, location
QLD_EXPENDITURE_URLS = {
    "2024-25": "https://www.data.qld.gov.au/dataset/b102c881-2c7f-484a-a8b6-b056fe318964/resource/1c1786e3-16b7-4fc0-ac3f-4d9314e59bdf/download/2024-25-expenditure-consolidated.csv",
    "2023-24": "https://www.data.qld.gov.au/dataset/b102c881-2c7f-484a-a8b6-b056fe318964/resource/66bfd607-0bb5-4c28-bc1e-1c40f2e9c2c1/download/2023-24-expenditure-pq-consolidate.csv",
    "2022-23": "https://www.data.qld.gov.au/dataset/b102c881-2c7f-484a-a8b6-b056fe318964/resource/991a217c-a57a-4125-81db-763ed79955f5/download/2022-23-expenditure-consolidated.csv",
    "2021-22": "https://www.data.qld.gov.au/dataset/b102c881-2c7f-484a-a8b6-b056fe318964/resource/8c6d2513-7728-4173-bb53-f521daf2b3c0/download/21-22-expenditure-data-consolidated.csv",
    "2020-21": "https://www.data.qld.gov.au/dataset/b102c881-2c7f-484a-a8b6-b056fe318964/resource/99f2c9a4-0ddc-4434-95b4-1a9472aa88cf/download/20-21-expenditure-data-consolidated-updated-dtmr-data-16122022.csv",
    "2019-20": "https://www.data.qld.gov.au/dataset/b102c881-2c7f-484a-a8b6-b056fe318964/resource/644128d1-a836-4e1f-94b5-bacac234baf6/download/19-20-expenditure-data-consolidated.csv",
    "2018-19": "https://www.data.qld.gov.au/dataset/b102c881-2c7f-484a-a8b6-b056fe318964/resource/ba12f307-9d88-4690-b959-d9f7f88af7bf/download/18-19-expenditure-data-consolidated.csv",
    "2017-18": "https://www.data.qld.gov.au/dataset/b102c881-2c7f-484a-a8b6-b056fe318964/resource/8b34919d-430b-4d91-ae0d-e6e6273cd246/download/consolidated-expenditure-data-17-18.csv",
}

# Known formula-based / non-discretionary patterns to filter out
FORMULA_PATTERNS = [
    r"financial assistance grant",
    r"fa[g]s?\b",  # Financial Assistance Grants
    r"road.*maintenance",
    r"per capita",
    r"formula.*based",
    r"recurrent.*funding",
    r"base.*allocation",
    r"pensioner.*concession",
    r"natural disaster",
    r"disaster.*relief",
]

FORMULA_RE = re.compile("|".join(FORMULA_PATTERNS), re.IGNORECASE)


def is_discretionary(row: dict) -> bool:
    """Heuristic: is this grant likely discretionary rather than formula-based?

    Discretionary grants are chosen by ministers/agencies and are the
    corruption-prone ones (sports rorts, car park rorts, etc.).
    """
    # Check assistance type if available
    assistance = row.get("assistance_type", "") or row.get("Assistance type1", "") or ""
    if "grant" not in assistance.lower() and assistance:
        return False  # Not a grant (could be service agreement, etc.)

    # Check if title/program matches formula-based patterns
    text = " ".join([
        row.get("program", "") or "",
        row.get("title", "") or "",
        row.get("description", "") or "",
        row.get("purpose", "") or "",
    ])
    if FORMULA_RE.search(text):
        return False

    return True


def classify_grant_type(row: dict) -> str:
    """Classify grant as discretionary, multi_year, one_off, or formula."""
    duration = row.get("duration", "") or row.get("Funding agreement duration", "") or ""
    if duration:
        dur_lower = duration.lower()
        if "multi" in dur_lower or "year" in dur_lower:
            return "multi_year"
        if "one" in dur_lower or "1 year or less" in dur_lower:
            return "one_off"

    text = " ".join([
        row.get("program", "") or "",
        row.get("title", "") or "",
    ])
    if FORMULA_RE.search(text):
        return "formula"
    return "discretionary"


def parse_date_au(date_str: str | None) -> str | None:
    """Parse Australian date formats (DD/MM/YYYY) to ISO (YYYY-MM-DD)."""
    if not date_str:
        return None
    date_str = date_str.strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return date_str  # Return as-is if unparseable


def parse_amount(val) -> float | None:
    """Parse currency amounts, handling commas, $, negative values."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace("$", "").replace(",", "").replace(" ", "")
    if not s or s == "-" or s.lower() == "n/a":
        return None
    try:
        return float(s)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# QLD Government Investment Portal
# ---------------------------------------------------------------------------

def fetch_qld_expenditure(year: str, url: str) -> list[dict]:
    """Download and parse a QLD expenditure CSV into grant records."""
    print(f"  Fetching QLD {year} expenditure data...")
    try:
        resp = SESSION.get(url, timeout=120)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"    Error fetching {year}: {e}")
        return []

    content = resp.content.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(content))
    grants = []

    for row in reader:
        # Map QLD columns to our schema
        amount = parse_amount(
            row.get("Financial year expenditure")
            or row.get("Total funding under this agreement to date")
        )
        if amount is None or amount <= 0:
            continue

        grant_type = classify_grant_type({
            "duration": row.get("Funding agreement duration", ""),
            "program": row.get("Program title", ""),
            "title": row.get("Sub-program title", ""),
        })

        # Check if discretionary
        if not is_discretionary({
            "assistance_type": row.get("Assistance type1", ""),
            "program": row.get("Program title", ""),
            "title": row.get("Sub-program title", ""),
            "purpose": row.get("Purpose", ""),
        }):
            grant_type = "formula"

        grants.append({
            "title": row.get("Sub-program title") or row.get("Program title", ""),
            "description": row.get("Purpose", ""),
            "recipient": row.get("Legal entity name") or row.get("Service provider name", ""),
            "recipient_abn": (row.get("Australian Business Number (ABN)") or "").strip() or None,
            "amount": amount,
            "agency": row.get("Funding agency", ""),
            "program": row.get("Program title", ""),
            "electorate": None,  # QLD data doesn't have federal electorates
            "state": "qld",
            "start_date": parse_date_au(row.get("Funding agreement start")),
            "end_date": parse_date_au(row.get("Funding agreement end")),
            "grant_type": grant_type,
            "source_url": url,
            "suburb": row.get("Service delivery suburb/locality")
                or row.get("Legal entity suburb/locality", ""),
            "postcode": row.get("Service delivery postcode")
                or row.get("Legal entity postcode", ""),
            "category": row.get("Category1", ""),
            "recipient_type": _map_recipient_type(row.get("Recipient type", "")),
            "financial_year": year,
            "source": "qld_expenditure",
        })

    print(f"    Parsed {len(grants)} grants for {year}")
    return grants


def _map_recipient_type(raw: str) -> str:
    """Map QLD recipient type to our standard types."""
    raw = (raw or "").lower()
    if "local government" in raw:
        return "local_government"
    if "not for profit" in raw or "community" in raw or "nfp" in raw:
        return "nfp"
    if "business" in raw or "private" in raw:
        return "business"
    if "individual" in raw:
        return "individual"
    if "government" in raw:
        return "government"
    return raw or "other"


def ingest_qld_expenditure(db=None, years: list[str] | None = None) -> int:
    """Ingest QLD Government Investment Portal expenditure data.

    Returns total grants inserted.
    """
    if db is None:
        db = get_db()
    init_db(db)
    db.execute("PRAGMA busy_timeout = 300000")

    if years is None:
        years = list(QLD_EXPENDITURE_URLS.keys())

    total_inserted = 0
    for year in years:
        url = QLD_EXPENDITURE_URLS.get(year)
        if not url:
            print(f"  No URL for year {year}, skipping")
            continue

        grants = fetch_qld_expenditure(year, url)
        inserted = _load_grants(grants, db)
        total_inserted += inserted
        print(f"    Loaded {inserted} new grants for {year}")
        time.sleep(1)  # Be polite

    return total_inserted


# ---------------------------------------------------------------------------
# GrantConnect CSV import (manual download)
# ---------------------------------------------------------------------------

def import_grantconnect_csv(csv_path: str, db=None) -> int:
    """Import a GrantConnect CSV export file.

    GrantConnect (grants.gov.au) blocks automated access, so users must
    manually download CSV exports from the portal and feed them here.

    Expected columns (GrantConnect format):
    - Grant ID, Grant Title, Grant Description
    - Recipient Legal Name, Recipient ABN
    - Value (AUD), Agency, Program
    - Location/Electorate, State
    - Start Date, End Date

    The importer is flexible and will try to match common column name variants.
    """
    if db is None:
        db = get_db()
    init_db(db)
    db.execute("PRAGMA busy_timeout = 300000")

    path = Path(csv_path)
    if not path.exists():
        print(f"File not found: {csv_path}")
        return 0

    print(f"Importing GrantConnect CSV: {csv_path}")
    content = path.read_text(encoding="utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(content))

    grants = []
    # Column name mapping -- GrantConnect uses various column names
    col_map = _detect_columns(reader.fieldnames or [])

    for row in reader:
        amount = parse_amount(row.get(col_map.get("amount", ""), ""))
        if amount is None or amount <= 0:
            continue

        grants.append({
            "title": row.get(col_map.get("title", ""), ""),
            "description": row.get(col_map.get("description", ""), ""),
            "recipient": row.get(col_map.get("recipient", ""), ""),
            "recipient_abn": row.get(col_map.get("abn", ""), "") or None,
            "amount": amount,
            "agency": row.get(col_map.get("agency", ""), ""),
            "program": row.get(col_map.get("program", ""), ""),
            "electorate": row.get(col_map.get("electorate", ""), "") or None,
            "state": row.get(col_map.get("state", ""), "") or "federal",
            "start_date": parse_date_au(row.get(col_map.get("start_date", ""), "")),
            "end_date": parse_date_au(row.get(col_map.get("end_date", ""), "")),
            "grant_type": "discretionary",
            "source_url": None,
            "suburb": row.get(col_map.get("suburb", ""), ""),
            "postcode": row.get(col_map.get("postcode", ""), ""),
            "category": row.get(col_map.get("category", ""), ""),
            "recipient_type": None,
            "financial_year": None,
            "source": "grantconnect",
        })

    inserted = _load_grants(grants, db)
    print(f"  Imported {inserted} grants from GrantConnect CSV")
    return inserted


def _detect_columns(headers: list[str]) -> dict:
    """Auto-detect column mapping from CSV headers."""
    mapping = {}
    header_lower = {h: h for h in headers}
    header_search = {h.lower().strip(): h for h in headers}

    patterns = {
        "title": ["grant title", "title", "sub-program title", "program title", "grant name"],
        "description": ["description", "grant description", "purpose"],
        "recipient": ["recipient", "recipient legal name", "legal entity name",
                       "service provider name", "organisation", "organization"],
        "abn": ["abn", "recipient abn", "australian business number"],
        "amount": ["value", "amount", "value (aud)", "grant amount",
                    "financial year expenditure", "total funding"],
        "agency": ["agency", "funding agency", "department", "portfolio"],
        "program": ["program", "program title", "grant program"],
        "electorate": ["electorate", "location"],
        "state": ["state", "state/territory", "jurisdiction"],
        "start_date": ["start date", "commencement date", "funding agreement start"],
        "end_date": ["end date", "completion date", "funding agreement end"],
        "suburb": ["suburb", "locality", "service delivery suburb"],
        "postcode": ["postcode", "service delivery postcode", "legal entity postcode"],
        "category": ["category", "category1", "sector"],
    }

    for field, candidates in patterns.items():
        for candidate in candidates:
            if candidate in header_search:
                mapping[field] = header_search[candidate]
                break

    return mapping


# ---------------------------------------------------------------------------
# data.gov.au CKAN API search for additional grant datasets
# ---------------------------------------------------------------------------

def search_data_gov_au(query: str = "grants awarded", limit: int = 10) -> list[dict]:
    """Search data.gov.au CKAN for grant datasets and return resource info."""
    url = f"https://data.gov.au/data/api/3/action/package_search?q={query}&rows={limit}"
    try:
        resp = SESSION.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"  data.gov.au search error: {e}")
        return []

    datasets = []
    for pkg in data.get("result", {}).get("results", []):
        for res in pkg.get("resources", []):
            fmt = (res.get("format") or "").upper()
            if fmt in ("CSV", "XLS", "XLSX"):
                datasets.append({
                    "title": pkg.get("title", ""),
                    "resource_name": res.get("name", ""),
                    "format": fmt,
                    "url": res.get("url", ""),
                    "description": pkg.get("notes", "")[:200],
                })
    return datasets


# ---------------------------------------------------------------------------
# Cross-reference analysis: pork-barreling detection
# ---------------------------------------------------------------------------

def analyze_pork_barreling(db=None) -> dict:
    """Cross-reference grants with donations and electoral margins.

    Finds:
    1. Grant recipients who also donated to the governing party
    2. Concentration of discretionary grants in marginal electorates
    3. Grants to entities connected to party donors

    Results stored in analysis_cache as 'stories_pork_barreling'.
    """
    if db is None:
        db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    stories = {
        "donor_grant_matches": [],
        "top_grant_recipients": [],
        "grants_by_agency": [],
        "discretionary_stats": {},
        "generated_at": datetime.now().isoformat(),
    }

    # 1. Find grant recipients who also appear in donations table
    # Two-phase approach for performance: first get unique grant recipients,
    # then match against donors in Python
    print("  Finding donor-grant recipient matches...")

    # Phase 1: Get aggregated grant recipients (discretionary only, > $10k)
    grant_recipients = db.execute("""
        SELECT
            UPPER(recipient) AS recipient_upper,
            recipient,
            recipient_abn,
            COUNT(*) AS grant_count,
            SUM(amount) AS total_grant_amount,
            GROUP_CONCAT(DISTINCT program) AS programs,
            GROUP_CONCAT(DISTINCT agency) AS agencies,
            state,
            MIN(start_date) AS earliest_grant
        FROM government_grants
        WHERE grant_type != 'formula'
          AND amount > 10000
          AND LENGTH(recipient) > 10
          AND recipient NOT IN ('Multiple', 'MULTIPLE', 'Various', 'VARIOUS',
                                 'Not Applicable', 'N/A', 'Confidential',
                                 'Not yet assigned', 'Department of')
        GROUP BY UPPER(recipient)
        HAVING SUM(amount) > 50000
        ORDER BY total_grant_amount DESC
    """).fetchall()

    # Phase 2: Get all donors
    donors = db.execute("""
        SELECT
            UPPER(donor_name) AS donor_upper,
            donor_name,
            recipient AS political_recipient,
            SUM(amount) AS total_donated,
            GROUP_CONCAT(DISTINCT financial_year) AS donation_years
        FROM donations
        WHERE amount > 1000
          AND LENGTH(donor_name) > 10
        GROUP BY UPPER(donor_name), recipient
    """).fetchall()

    # Phase 3: Match in Python (much faster than SQL LIKE cross-join)
    donor_lookup = {}
    for d in donors:
        key = d["donor_upper"]
        if key not in donor_lookup:
            donor_lookup[key] = []
        donor_lookup[key].append(d)

    for gr in grant_recipients:
        gr_upper = gr["recipient_upper"]
        # Exact name match
        if gr_upper in donor_lookup:
            for d in donor_lookup[gr_upper]:
                stories["donor_grant_matches"].append({
                    "recipient": gr["recipient"],
                    "recipient_abn": gr["recipient_abn"],
                    "grant_amount": gr["total_grant_amount"],
                    "grant_count": gr["grant_count"],
                    "program": gr["programs"],
                    "agency": gr["agencies"],
                    "state": gr["state"],
                    "grant_date": gr["earliest_grant"],
                    "donor_name": d["donor_name"],
                    "political_recipient": d["political_recipient"],
                    "donation_amount": d["total_donated"],
                    "donation_year": d["donation_years"],
                })
            continue

        # Fuzzy containment match (only for longer names to avoid false positives)
        if len(gr_upper) > 15:
            for donor_upper, d_list in donor_lookup.items():
                if len(donor_upper) > 15 and (
                    gr_upper in donor_upper or donor_upper in gr_upper
                ):
                    for d in d_list:
                        stories["donor_grant_matches"].append({
                            "recipient": gr["recipient"],
                            "recipient_abn": gr["recipient_abn"],
                            "grant_amount": gr["total_grant_amount"],
                            "grant_count": gr["grant_count"],
                            "program": gr["programs"],
                            "agency": gr["agencies"],
                            "state": gr["state"],
                            "grant_date": gr["earliest_grant"],
                            "donor_name": d["donor_name"],
                            "political_recipient": d["political_recipient"],
                            "donation_amount": d["total_donated"],
                            "donation_year": d["donation_years"],
                        })

    # Sort by grant amount and deduplicate
    stories["donor_grant_matches"].sort(key=lambda x: x["grant_amount"], reverse=True)
    # Deduplicate on (recipient, political_recipient)
    seen = set()
    deduped = []
    for m in stories["donor_grant_matches"]:
        key = (m["recipient"].upper(), m["political_recipient"])
        if key not in seen:
            seen.add(key)
            deduped.append(m)
    stories["donor_grant_matches"] = deduped[:500]

    print(f"    Found {len(stories['donor_grant_matches'])} donor-grant matches")

    # 2. Top grant recipients by total amount (discretionary only)
    print("  Finding top grant recipients...")
    top_recipients = db.execute("""
        SELECT
            recipient,
            recipient_abn,
            COUNT(*) AS grant_count,
            SUM(amount) AS total_amount,
            GROUP_CONCAT(DISTINCT agency) AS agencies,
            GROUP_CONCAT(DISTINCT program) AS programs
        FROM government_grants
        WHERE grant_type != 'formula'
          AND amount > 0
        GROUP BY COALESCE(recipient_abn, recipient)
        ORDER BY total_amount DESC
        LIMIT 50
    """).fetchall()

    stories["top_grant_recipients"] = [dict(r) for r in top_recipients]

    # 3. Grants by agency (to spot agencies with most discretionary spending)
    print("  Analyzing grants by agency...")
    by_agency = db.execute("""
        SELECT
            agency,
            COUNT(*) AS grant_count,
            SUM(amount) AS total_amount,
            AVG(amount) AS avg_amount,
            SUM(CASE WHEN grant_type != 'formula' THEN amount ELSE 0 END) AS discretionary_amount,
            SUM(CASE WHEN grant_type != 'formula' THEN 1 ELSE 0 END) AS discretionary_count
        FROM government_grants
        WHERE amount > 0
        GROUP BY agency
        ORDER BY discretionary_amount DESC
        LIMIT 30
    """).fetchall()

    stories["grants_by_agency"] = [dict(r) for r in by_agency]

    # 4. Overall discretionary stats
    stats = db.execute("""
        SELECT
            COUNT(*) AS total_grants,
            SUM(amount) AS total_amount,
            SUM(CASE WHEN grant_type != 'formula' THEN 1 ELSE 0 END) AS discretionary_count,
            SUM(CASE WHEN grant_type != 'formula' THEN amount ELSE 0 END) AS discretionary_amount,
            COUNT(DISTINCT agency) AS agency_count,
            COUNT(DISTINCT recipient) AS recipient_count
        FROM government_grants
        WHERE amount > 0
    """).fetchone()

    stories["discretionary_stats"] = dict(stats) if stats else {}

    # Store in analysis_cache
    db.execute(
        "INSERT OR REPLACE INTO analysis_cache (key, value, updated_at) VALUES (?, ?, datetime('now'))",
        ("stories_pork_barreling", json.dumps(stories, default=str)),
    )
    db.commit()

    print(f"\n  Pork-barreling analysis complete:")
    print(f"    Total grants: {stories['discretionary_stats'].get('total_grants', 0)}")
    print(f"    Discretionary grants: {stories['discretionary_stats'].get('discretionary_count', 0)}")
    print(f"    Donor-grant matches: {len(stories['donor_grant_matches'])}")
    print(f"    Results cached as 'stories_pork_barreling'")

    return stories


# ---------------------------------------------------------------------------
# DB loading
# ---------------------------------------------------------------------------

def _load_grants(grants: list[dict], db: sqlite3.Connection) -> int:
    """Insert grants into the database. Returns count of new rows."""
    inserted = 0
    for i in range(0, len(grants), BATCH_SIZE):
        batch = grants[i : i + BATCH_SIZE]
        for g in batch:
            try:
                db.execute(
                    """
                    INSERT OR IGNORE INTO government_grants
                    (title, description, recipient, recipient_abn, amount,
                     agency, program, electorate, state, start_date, end_date,
                     grant_type, source_url, suburb, postcode, category,
                     recipient_type, financial_year, source)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        g["title"],
                        g["description"],
                        g["recipient"],
                        g["recipient_abn"],
                        g["amount"],
                        g["agency"],
                        g["program"],
                        g["electorate"],
                        g["state"],
                        g["start_date"],
                        g["end_date"],
                        g["grant_type"],
                        g["source_url"],
                        g["suburb"],
                        g["postcode"],
                        g["category"],
                        g["recipient_type"],
                        g["financial_year"],
                        g["source"],
                    ),
                )
                if db.execute("SELECT changes()").fetchone()[0] > 0:
                    inserted += 1
            except Exception as e:
                print(f"  Error inserting grant '{g.get('title', '?')}': {e}")
        db.commit()

    return inserted


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Ingest government grants data for OPAX pork-barreling analysis"
    )
    parser.add_argument("--qld", action="store_true",
                        help="Ingest QLD Government Investment Portal expenditure data")
    parser.add_argument("--qld-years", nargs="*", default=None,
                        help="Specific QLD years to ingest (e.g., 2024-25 2023-24)")
    parser.add_argument("--csv", type=str, default=None,
                        help="Path to a GrantConnect CSV export to import")
    parser.add_argument("--search-data-gov", action="store_true",
                        help="Search data.gov.au for additional grant datasets")
    parser.add_argument("--analyze", action="store_true",
                        help="Run cross-reference pork-barreling analysis")
    parser.add_argument("--stats", action="store_true",
                        help="Print current grants table statistics")

    args = parser.parse_args()

    if not any([args.qld, args.csv, args.search_data_gov, args.analyze, args.stats]):
        parser.print_help()
        print("\nExample: python -m parli.ingest.grants --qld --analyze")
        return

    db = get_db()
    init_db(db)
    db.execute("PRAGMA busy_timeout = 300000")

    if args.stats:
        _print_stats(db)

    if args.qld:
        print("=== Ingesting QLD Government expenditure data ===")
        total = ingest_qld_expenditure(db, years=args.qld_years)
        print(f"  Total new grants loaded: {total}\n")

    if args.csv:
        print(f"=== Importing GrantConnect CSV: {args.csv} ===")
        total = import_grantconnect_csv(args.csv, db)
        print(f"  Total grants imported: {total}\n")

    if args.search_data_gov:
        print("=== Searching data.gov.au for grant datasets ===")
        datasets = search_data_gov_au()
        for ds in datasets:
            print(f"  {ds['title']} [{ds['format']}]")
            print(f"    URL: {ds['url']}")
            print(f"    {ds['description']}")
        print(f"  Found {len(datasets)} downloadable grant datasets\n")

    if args.analyze:
        print("=== Running pork-barreling cross-reference analysis ===")
        analyze_pork_barreling(db)

    _print_stats(db)


def _print_stats(db):
    """Print summary statistics for the grants table."""
    print("\n=== Government Grants Statistics ===")
    stats = db.execute("""
        SELECT
            COUNT(*) AS total,
            SUM(amount) AS total_amount,
            COUNT(DISTINCT agency) AS agencies,
            COUNT(DISTINCT recipient) AS recipients,
            COUNT(DISTINCT program) AS programs,
            MIN(start_date) AS earliest,
            MAX(start_date) AS latest
        FROM government_grants
        WHERE amount > 0
    """).fetchone()

    if stats and stats["total"]:
        print(f"  Total grants: {stats['total']:,}")
        total_amt = stats['total_amount'] or 0
        print(f"  Total amount: ${total_amt:,.0f}")
        print(f"  Agencies: {stats['agencies']}")
        print(f"  Recipients: {stats['recipients']}")
        print(f"  Programs: {stats['programs']}")
        print(f"  Date range: {stats['earliest']} to {stats['latest']}")
    else:
        print("  No grants data loaded yet.")

    # By type
    by_type = db.execute("""
        SELECT grant_type, COUNT(*) AS cnt, SUM(amount) AS total
        FROM government_grants
        GROUP BY grant_type
        ORDER BY total DESC
    """).fetchall()

    if by_type:
        print("\n  By grant type:")
        for row in by_type:
            total = row['total'] or 0
            print(f"    {row['grant_type'] or 'unknown'}: {row['cnt']:,} grants (${total:,.0f})")

    # By source
    by_source = db.execute("""
        SELECT source, COUNT(*) AS cnt, SUM(amount) AS total
        FROM government_grants
        GROUP BY source
        ORDER BY total DESC
    """).fetchall()

    if by_source:
        print("\n  By source:")
        for row in by_source:
            total = row['total'] or 0
            print(f"    {row['source'] or 'unknown'}: {row['cnt']:,} grants (${total:,.0f})")


if __name__ == "__main__":
    main()
