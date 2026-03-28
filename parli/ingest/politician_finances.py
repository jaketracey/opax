"""
parli.ingest.politician_finances -- Ingest pre-parsed Australian politician
financial data from two sources:

1. icacpls.github.io  -- Federal MP expenses, interests, and donations
   (CSV files downloaded from Google Drive)
2. QLD Ministerial Gifts Register -- Structured CSV data from data.qld.gov.au

Tables created/populated:
  - mp_expenses         (icacpls expenses -- travel, office, car costs)
  - mp_interests        (icacpls interests merged into existing table)
  - donations           (icacpls donations merged into existing table)
  - qld_ministerial_gifts (QLD gift register)

Usage:
    python -m parli.ingest.politician_finances
    python -m parli.ingest.politician_finances --download-only
    python -m parli.ingest.politician_finances --skip-download
"""

import argparse
import csv
import io
import os
import re
import sys
from html import unescape
from pathlib import Path

import requests

from parli.schema import get_db, init_db

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DATA_DIR = Path("~/.cache/autoresearch/politician_finances").expanduser()

GDRIVE_FILES = {
    "expenses": "1RY1JmV11N2hnSzeQl-K7AwEIe-kFgns1",
    "interests": "1XvZ_5ucb-qVHmVFneWBSVEq9wSuSbZYQ",
    "donations": "1vJSNAArbbV6UYOCcxA9E0PrXQhzzNqHz",
}

QLD_GIFT_CSVS = [
    ("gifts_oct_dec_2017.csv",
     "https://www.premiers.qld.gov.au/right-to-info/published-info/assets/ministerial-gifts-oct-to-dec-2017.csv"),
    ("gifts_jul_sep_2017.csv",
     "https://www.premiers.qld.gov.au/right-to-info/published-info/assets/ministerial-gifts-jul-to-sep-2017.csv"),
    ("gifts_oct_dec_2016.csv",
     "https://www.premiers.qld.gov.au/right-to-info/published-info/assets/ministerial-gifts-oct-dec-16.csv"),
    ("gifts_jan_mar_2016.csv",
     "https://www.premiers.qld.gov.au/right-to-info/published-info/assets/ministerial-gifts-31-march-16.csv"),
    ("gifts_oct_dec_2015.csv",
     "https://www.premiers.qld.gov.au/right-to-info/published-info/assets/ministerial-gifts-and-benefits-register-december-2015.csv"),
    ("gifts_jul_sep_2015.csv",
     "https://www.premiers.qld.gov.au/right-to-info/published-info/assets/ministerial-gifts-and-benefits-register-september-2015.csv"),
]

# Extra schema for mp_expenses and qld_ministerial_gifts
EXTRA_SCHEMA = """
CREATE TABLE IF NOT EXISTS mp_expenses (
    expense_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    member_type TEXT,        -- 'Representative' or 'Senator'
    electorate TEXT,
    state TEXT,
    party TEXT,
    category TEXT NOT NULL,  -- 'Travelling Allowance', 'Office Facilities', etc.
    subcategory TEXT,
    period TEXT,
    date_from TEXT,
    date_to TEXT,
    location TEXT,
    purpose TEXT,
    nights INTEGER,
    rate REAL,
    amount REAL,
    date TEXT,
    details TEXT,
    notes TEXT,
    spouse TEXT,
    expense_type TEXT,       -- renamed from 'Type' to avoid SQL keyword
    value TEXT,
    points TEXT,
    source TEXT DEFAULT 'icacpls'
);

CREATE INDEX IF NOT EXISTS idx_mp_expenses_name ON mp_expenses(name);
CREATE INDEX IF NOT EXISTS idx_mp_expenses_party ON mp_expenses(party);
CREATE INDEX IF NOT EXISTS idx_mp_expenses_category ON mp_expenses(category);
CREATE INDEX IF NOT EXISTS idx_mp_expenses_amount ON mp_expenses(amount DESC);

CREATE TABLE IF NOT EXISTS qld_ministerial_gifts (
    gift_id INTEGER PRIMARY KEY AUTOINCREMENT,
    registration_no TEXT,
    gift_description TEXT,
    donor_recipient TEXT,
    minister_lastname TEXT,
    minister_firstname TEXT,
    location TEXT,
    date_received TEXT,
    gift_value REAL,
    quarter TEXT,            -- e.g. 'Q3 2017'
    source TEXT DEFAULT 'qld_gifts_register'
);

CREATE INDEX IF NOT EXISTS idx_qld_gifts_minister ON qld_ministerial_gifts(minister_lastname);
CREATE INDEX IF NOT EXISTS idx_qld_gifts_value ON qld_ministerial_gifts(gift_value DESC);
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def strip_html(s: str) -> str:
    """Remove HTML tags and unescape entities."""
    if not s:
        return s
    s = unescape(s)
    s = re.sub(r"<[^>]+>", "", s)
    return s.strip()


def parse_amount(s: str) -> float | None:
    """Parse dollar amount string like '$1,234.56' or '1234.56' to float."""
    if not s:
        return None
    s = s.strip().replace("$", "").replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def parse_int(s: str) -> int | None:
    if not s:
        return None
    try:
        return int(s)
    except ValueError:
        return None


def download_gdrive_csv(file_id: str, dest: Path) -> Path:
    """Download a CSV (possibly zipped) from Google Drive.

    Handles Google's virus-scan confirmation page for large files by
    using confirm=t and session cookies.
    """
    import zipfile

    session = requests.Session()
    url = f"https://drive.google.com/uc?export=download&id={file_id}"
    print(f"  Downloading {dest.name} from Google Drive...")
    resp = session.get(url, allow_redirects=True, timeout=120)
    resp.raise_for_status()

    # If we got a virus scan warning page, retry with confirm=t
    if resp.content[:2] != b"PK" and b"confirm" in resp.content[:5000]:
        print("    Handling virus scan confirmation...")
        resp = session.get(f"{url}&confirm=t", allow_redirects=True, timeout=120)
        resp.raise_for_status()

    raw = resp.content
    # Check if it's a ZIP (PK header)
    if raw[:2] == b"PK":
        zf = zipfile.ZipFile(io.BytesIO(raw))
        names = zf.namelist()
        csv_name = [n for n in names if n.endswith(".csv")][0]
        raw = zf.read(csv_name)
        print(f"    Extracted {csv_name} from zip ({len(raw):,} bytes)")

    dest.write_bytes(raw)
    return dest


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

def download_all():
    """Download all source files to DATA_DIR."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # icacpls Google Drive CSVs
    for name, fid in GDRIVE_FILES.items():
        dest = DATA_DIR / f"icacpls_{name}.csv"
        if dest.exists() and dest.stat().st_size > 1000:
            print(f"  {dest.name} already exists ({dest.stat().st_size:,} bytes), skipping")
            continue
        download_gdrive_csv(fid, dest)

    # QLD ministerial gifts CSVs
    qld_dir = DATA_DIR / "qld"
    qld_dir.mkdir(exist_ok=True)
    for fname, url in QLD_GIFT_CSVS:
        dest = qld_dir / fname
        if dest.exists() and dest.stat().st_size > 100:
            print(f"  {fname} already exists, skipping")
            continue
        try:
            print(f"  Downloading {fname}...")
            resp = requests.get(url, timeout=15)
            if resp.status_code == 200 and len(resp.content) > 100:
                dest.write_bytes(resp.content)
                print(f"    OK ({len(resp.content):,} bytes)")
            else:
                print(f"    Skipped (status {resp.status_code})")
        except Exception as e:
            print(f"    Failed: {e}")


# ---------------------------------------------------------------------------
# Ingest: icacpls expenses
# ---------------------------------------------------------------------------

def ingest_expenses(db):
    """Load MP expenses from icacpls CSV into mp_expenses table."""
    path = DATA_DIR / "icacpls_expenses.csv"
    if not path.exists():
        print("  [expenses] CSV not found, skipping")
        return 0

    # Clear existing icacpls data
    db.execute("DELETE FROM mp_expenses WHERE source = 'icacpls'")

    count = 0
    batch = []
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            batch.append((
                row.get("Name", "").strip(),
                row.get("MemberType", "").strip(),
                row.get("Electorate", "").strip(),
                row.get("State", "").strip(),
                row.get("Party", "").strip(),
                row.get("Category", "").strip(),
                row.get("Subcategory", "").strip(),
                row.get("Period", "").strip(),
                row.get("Date From", "").strip(),
                row.get("Date To", "").strip(),
                row.get("Location", "").strip(),
                row.get("Purpose", "").strip(),
                parse_int(row.get("Nights", "")),
                parse_amount(row.get("Rate", "")),
                parse_amount(row.get("Amount", "")),
                row.get("Date", "").strip(),
                row.get("Details", "").strip(),
                row.get("Notes", "").strip(),
                row.get("Spouse", "").strip(),
                row.get("Type", "").strip(),
                row.get("Value", "").strip(),
                row.get("Points", "").strip(),
                "icacpls",
            ))
            if len(batch) >= 5000:
                db.executemany(
                    """INSERT INTO mp_expenses
                       (name, member_type, electorate, state, party, category,
                        subcategory, period, date_from, date_to, location, purpose,
                        nights, rate, amount, date, details, notes, spouse,
                        expense_type, value, points, source)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    batch,
                )
                count += len(batch)
                batch = []
                if count % 100000 == 0:
                    print(f"    {count:,} expenses loaded...")

    if batch:
        db.executemany(
            """INSERT INTO mp_expenses
               (name, member_type, electorate, state, party, category,
                subcategory, period, date_from, date_to, location, purpose,
                nights, rate, amount, date, details, notes, spouse,
                expense_type, value, points, source)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            batch,
        )
        count += len(batch)

    db.commit()
    print(f"  [expenses] Loaded {count:,} expense records")
    return count


# ---------------------------------------------------------------------------
# Ingest: icacpls interests -> mp_interests
# ---------------------------------------------------------------------------

# Map icacpls categories to our interest_type enum
INTEREST_TYPE_MAP = {
    "Shareholdings": "shareholding",
    "Real Estate": "property",
    "Directorships": "directorship",
    "Gifts": "gift",
    "Travel": "travel",
    "Liabilities": "liability",
    "Trusts - Beneficial Interest": "trust",
    "Trusts - Trustee": "trust",
    "Partnerships": "partnership",
    "Bonds": "bond",
    "Accounts": "savings",
    "Other Income": "income",
    "Other Assets": "other",
    "Other Interests": "other",
    "Memberships": "other",
}


def ingest_interests(db):
    """Load MP interests from icacpls CSV into mp_interests table."""
    path = DATA_DIR / "icacpls_interests.csv"
    if not path.exists():
        print("  [interests] CSV not found, skipping")
        return 0

    # Clear existing icacpls data
    db.execute("DELETE FROM mp_interests WHERE source_url = 'icacpls'")

    count = 0
    batch = []
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row.get("Name", "").strip()
            category = row.get("Category", "").strip()
            interest_type = INTEREST_TYPE_MAP.get(category, "other")

            # Build description from available fields
            parts = []
            for field in ("Nature", "BeneficialInterest", "BeneficialTrustee",
                          "Location", "Purpose", "Activities", "Creditor",
                          "Body", "Institution", "Details"):
                val = strip_html(row.get(field, ""))
                if val:
                    parts.append(f"{field}: {val}")
            description = "; ".join(parts) if parts else None

            entity_name = strip_html(row.get("InterestName", ""))
            held_by = row.get("HeldBy", "").strip()
            if held_by and entity_name:
                entity_name = f"{entity_name} ({held_by})"
            elif held_by:
                entity_name = held_by

            declared_date = row.get("Updated", "").strip()

            batch.append((
                interest_type,
                entity_name or None,
                description,
                declared_date or None,
                None,  # parliament_number
                name,  # store MP name in raw_text for matching
                "icacpls",  # source_url used as source tag
            ))

    if batch:
        db.executemany(
            """INSERT INTO mp_interests
               (interest_type, entity_name, description, declared_date,
                parliament_number, raw_text, source_url)
               VALUES (?,?,?,?,?,?,?)""",
            batch,
        )
        count = len(batch)

    db.commit()
    print(f"  [interests] Loaded {count:,} interest records")
    return count


# ---------------------------------------------------------------------------
# Ingest: icacpls donations -> donations
# ---------------------------------------------------------------------------

def ingest_donations(db):
    """Load donations from icacpls CSV into donations table."""
    path = DATA_DIR / "icacpls_donations.csv"
    if not path.exists():
        print("  [donations] CSV not found, skipping")
        return 0

    # Clear existing icacpls data
    db.execute("DELETE FROM donations WHERE source = 'icacpls'")

    count = 0
    batch = []
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            donor = row.get("Donor", "").strip()
            party = row.get("Party", "").strip().lstrip("#")
            amount = parse_amount(row.get("Amount", ""))
            period = row.get("Period", "").strip()
            dtype = row.get("DonationType", "").strip()

            batch.append((
                donor,
                party,
                amount,
                period,
                "organisation" if "pty" in donor.lower() or "ltd" in donor.lower() else "other",
                None,  # industry
                "icacpls",
            ))

    if batch:
        db.executemany(
            """INSERT INTO donations
               (donor_name, recipient, amount, financial_year, donor_type, industry, source)
               VALUES (?,?,?,?,?,?,?)""",
            batch,
        )
        count = len(batch)

    db.commit()
    print(f"  [donations] Loaded {count:,} donation records")
    return count


# ---------------------------------------------------------------------------
# Ingest: QLD ministerial gifts
# ---------------------------------------------------------------------------

def ingest_qld_gifts(db):
    """Load QLD ministerial gifts from CSVs."""
    qld_dir = DATA_DIR / "qld"
    if not qld_dir.exists():
        print("  [qld_gifts] No QLD data directory, skipping")
        return 0

    # Clear existing
    db.execute("DELETE FROM qld_ministerial_gifts WHERE source = 'qld_gifts_register'")

    count = 0
    for csv_file in sorted(qld_dir.glob("*.csv")):
        # Derive quarter label from filename
        quarter = csv_file.stem.replace("gifts_", "").replace("_", " ").title()

        rows = csv_file.read_text(encoding="utf-8-sig", errors="replace").split("\n")

        # Find the header row (contains "Registration No")
        header_idx = None
        for i, line in enumerate(rows):
            if "Registration No" in line:
                header_idx = i
                break

        if header_idx is None:
            print(f"    {csv_file.name}: no header found, skipping")
            continue

        # Parse from header row onwards
        data_text = "\n".join(rows[header_idx:])
        reader = csv.DictReader(io.StringIO(data_text))

        file_count = 0
        for row in reader:
            # Normalize column names (they vary between files)
            reg_no = (row.get("Registration No") or "").strip()
            desc = (row.get("Gift Description") or "").strip()
            donor = (row.get("Donor/Recipient") or "").strip()

            # Last name field varies
            lastname = (row.get("Minister/Staff Lastname")
                        or row.get("Last Name")
                        or row.get("Minister/Staff Last Name")
                        or "").strip()
            firstname = (row.get("Minister/Staff Firstname")
                         or row.get("First Name")
                         or row.get("Minister/Staff First Name")
                         or "").strip()
            location = (row.get("Location") or "").strip()
            date_recv = (row.get("Date Received") or "").strip()
            value = parse_amount(row.get("Gift Value") or "")

            if not desc and not reg_no:
                continue

            db.execute(
                """INSERT INTO qld_ministerial_gifts
                   (registration_no, gift_description, donor_recipient,
                    minister_lastname, minister_firstname, location,
                    date_received, gift_value, quarter, source)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (reg_no, desc, donor, lastname, firstname, location,
                 date_recv, value, quarter, "qld_gifts_register"),
            )
            file_count += 1

        count += file_count
        print(f"    {csv_file.name}: {file_count} gifts")

    db.commit()
    print(f"  [qld_gifts] Loaded {count:,} gift records total")
    return count


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Ingest politician financial data")
    parser.add_argument("--download-only", action="store_true",
                        help="Only download files, don't ingest")
    parser.add_argument("--skip-download", action="store_true",
                        help="Skip download, use existing files")
    parser.add_argument("--db", type=str, default=None,
                        help="Database path (default: ~/.cache/autoresearch/parli.db)")
    args = parser.parse_args()

    # Download
    if not args.skip_download:
        print("=== Downloading data files ===")
        download_all()

    if args.download_only:
        print("Download complete.")
        return

    # Connect to database
    print("\n=== Ingesting into database ===")
    db = get_db(args.db)
    db.execute("PRAGMA busy_timeout = 300000")
    init_db(db)

    # Create extra tables
    db.executescript(EXTRA_SCHEMA)
    print("  Tables created/verified")

    # Ingest each source
    totals = {}
    totals["expenses"] = ingest_expenses(db)
    totals["interests"] = ingest_interests(db)
    totals["donations"] = ingest_donations(db)
    totals["qld_gifts"] = ingest_qld_gifts(db)

    print("\n=== Summary ===")
    for source, count in totals.items():
        print(f"  {source}: {count:,} records")
    print(f"  Total: {sum(totals.values()):,} records")
    print("Done.")


if __name__ == "__main__":
    main()
