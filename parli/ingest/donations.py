"""
parli.ingest.donations -- Download and load AEC donation data.

Downloads bulk CSV ZIP files from the AEC transparency portal at
https://transparency.aec.gov.au/Download, extracts CSVs, and parses
donor name, recipient (party), amount, and financial year into the
donations table.

Supports:
  - Annual returns (Detailed Receipts, Donations Made, Donor Donations Received,
    Third Party Donations Received, Capital Contributions, Discretionary Benefits)
  - Election returns (Donor Donations Made/Received, Candidate Donations,
    Third Party Donations Made/Received)
  - Referendum returns (Donations Made, Entity Donations Received)
  - Associated entity data ("dark money" channels: Cormack Foundation,
    Labor Holdings, union entities, etc.)

State data status (as of 2026-03):
  - NSW: elections.nsw.gov.au blocks automated access (403), no bulk CSV
  - VIC: disclosures.vec.vic.gov.au is Power Apps portal, no export API
  - QLD: disclosures.ecq.qld.gov.au has interactive CSV export but no bulk API;
         historical data at ecq.qld.gov.au/disclosurereturnarchives behind
         SharePoint auth. Manual download required.

Usage:
    python -m parli.ingest.donations
    python -m parli.ingest.donations --cache-only
    python -m parli.ingest.donations --download-only
"""

import csv
import io
import re
import zipfile
from pathlib import Path

import requests

from parli.schema import get_db, init_db

AEC_DOWNLOAD_BASE = "https://transparency.aec.gov.au/Download"
CACHE_DIR = Path("~/.cache/autoresearch/donations").expanduser()

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "OPAX/1.0 (opax.com.au; parliamentary research)"})

BATCH_SIZE = 1000

# Known AEC download endpoints
AEC_ZIPS = {
    "AllAnnualData":     f"{AEC_DOWNLOAD_BASE}/AllAnnualData",
    "AllElectionsData":  f"{AEC_DOWNLOAD_BASE}/AllElectionsData",
    "AllReferendumData": f"{AEC_DOWNLOAD_BASE}/AllReferendumData",
}


def classify_donor_type(donor_name: str) -> str:
    """Classify donor as individual, organisation, or other."""
    if not donor_name:
        return "other"
    name = donor_name.lower().strip()
    org_keywords = [
        "pty", "ltd", "limited", "inc", "corp", "association", "union",
        "council", "trust", "foundation", "group", "holdings", "services",
        "industries", "company", "society", "institute", "club", "fund",
    ]
    for kw in org_keywords:
        if kw in name:
            return "organisation"
    parts = name.split()
    if 1 < len(parts) <= 4 and all(p.isalpha() for p in parts):
        return "individual"
    return "other"


def parse_amount(value: str) -> float | None:
    """Parse a dollar amount string into a float."""
    if not value:
        return None
    cleaned = re.sub(r"[$,\s]", "", value.strip())
    if not cleaned or cleaned == "-":
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def download_zip(url: str) -> bytes | None:
    """Download a ZIP file from the given URL. Returns bytes or None."""
    try:
        print(f"  Downloading {url}...")
        resp = SESSION.get(url, timeout=120)
        if resp.status_code == 200 and resp.content[:2] == b"PK":
            return resp.content
        print(f"    Not a valid ZIP (status {resp.status_code})")
        return None
    except Exception as e:
        print(f"    Download error: {e}")
        return None


# ── CSV-specific parsers ───────────────────────────────────────────

def _insert_donation(db, donor: str, recipient: str, amount: float | None,
                     fy: str | None, source: str, state: str = "federal"):
    """Insert a single donation row."""
    donor_type = classify_donor_type(donor)
    db.execute(
        """INSERT INTO donations
           (donor_name, recipient, amount, financial_year, donor_type, industry, source, state)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (donor, recipient, amount, fy, donor_type, None, source, state),
    )


def load_annual_detailed_receipts(db, text: str) -> int:
    """AllAnnualData / Detailed Receipts.csv
    Columns: Financial Year, Return Type, Recipient Name, Received From, Receipt Type, Value
    """
    count = 0
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        donor = (row.get("Received From") or "").strip()
        recipient = (row.get("Recipient Name") or "").strip()
        if not donor or not recipient:
            continue
        amount = parse_amount(row.get("Value", ""))
        fy = (row.get("Financial Year") or "").strip() or None
        _insert_donation(db, donor, recipient, amount, fy, "aec_annual")
        count += 1
        if count % BATCH_SIZE == 0:
            db.commit()
    db.commit()
    return count


def load_annual_donations_made(db, text: str) -> int:
    """AllAnnualData / Donations Made.csv
    Columns: Financial Year, Donor Name, Donation Made To, Date, Value
    """
    count = 0
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        donor = (row.get("Donor Name") or "").strip()
        recipient = (row.get("Donation Made To") or "").strip()
        if not donor or not recipient:
            continue
        amount = parse_amount(row.get("Value", ""))
        fy = (row.get("Financial Year") or "").strip() or None
        _insert_donation(db, donor, recipient, amount, fy, "aec_annual")
        count += 1
        if count % BATCH_SIZE == 0:
            db.commit()
    db.commit()
    return count


def load_annual_donor_donations_received(db, text: str) -> int:
    """AllAnnualData / Donor Donations Received.csv
    Columns: Financial Year, Name, Donation Received From, Date, Value
    """
    count = 0
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        donor = (row.get("Donation Received From") or "").strip()
        recipient = (row.get("Name") or "").strip()
        if not donor or not recipient:
            continue
        amount = parse_amount(row.get("Value", ""))
        fy = (row.get("Financial Year") or "").strip() or None
        _insert_donation(db, donor, recipient, amount, fy, "aec_annual")
        count += 1
        if count % BATCH_SIZE == 0:
            db.commit()
    db.commit()
    return count


def load_annual_third_party_received(db, text: str) -> int:
    """AllAnnualData / Third Party Donations Received.csv
    Columns: Financial Year, Name, Donation Received From, Date, Value
    """
    count = 0
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        donor = (row.get("Donation Received From") or "").strip()
        recipient = (row.get("Name") or "").strip()
        if not donor or not recipient:
            continue
        amount = parse_amount(row.get("Value", ""))
        fy = (row.get("Financial Year") or "").strip() or None
        _insert_donation(db, donor, recipient, amount, fy, "aec_annual")
        count += 1
        if count % BATCH_SIZE == 0:
            db.commit()
    db.commit()
    return count


def _classify_entity_type(name: str) -> str:
    """Classify an associated entity by name heuristics."""
    nl = name.lower()
    if any(k in nl for k in ["club", "club limited", "club inc"]):
        return "club"
    elif any(k in nl for k in ["union", "workers", "cfmeu", "cfmmeu", "amwu", "awu"]):
        return "union"
    elif any(k in nl for k in ["foundation", "minderoo"]):
        return "foundation"
    elif any(k in nl for k in ["trust", "trustee"]):
        return "trust"
    elif any(k in nl for k in ["holding", "pty ltd", "pty. ltd", "limited", "ltd"]):
        return "holding_company"
    return "other"


def load_annual_associated_entities(db, text: str) -> int:
    """AllAnnualData / Associated Entity Returns.csv
    Columns: Financial Year, Name, Lodged on behalf of, AssociatedParties,
             Total Receipts, Total Payments, Total Debts, ...
    These are the "dark money" channels -- Cormack Foundation, Labor Holdings, etc.

    IMPORTANT: These are total revenue/expenditure disclosures for party-linked
    entities (clubs, unions, foundations, trusts), NOT political donations.
    They go into the associated_entities table, not donations.
    """
    count = 0
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        entity = (row.get("Name") or "").strip()
        parties_raw = (row.get("AssociatedParties") or "").strip()
        if not entity or not parties_raw:
            continue
        total_receipts = parse_amount(row.get("Total Receipts", ""))
        total_payments = parse_amount(row.get("Total Payments", ""))
        fy = (row.get("Financial Year") or "").strip() or None
        entity_type = _classify_entity_type(entity)

        # Split associated parties (semicolon-separated)
        parties = [p.strip().rstrip(";").strip() for p in parties_raw.split(";") if p.strip()]

        for party in parties:
            if not party:
                continue
            # Record receipts flowing through this entity to the party
            if total_receipts and total_receipts > 0:
                db.execute(
                    """INSERT INTO associated_entities
                       (entity_name, associated_party, amount, financial_year,
                        entity_type, source)
                       VALUES (?, ?, ?, ?, ?, 'aec_assoc_entity')""",
                    (entity, party, total_receipts / len(parties), fy, entity_type),
                )
                count += 1
            # Also record total payments as expenditure (entity paying out)
            if total_payments and total_payments > 0:
                db.execute(
                    """INSERT INTO associated_entities
                       (entity_name, associated_party, amount, financial_year,
                        entity_type, source)
                       VALUES (?, ?, ?, ?, ?, 'aec_assoc_entity')""",
                    (entity, party, total_payments / len(parties), fy, entity_type),
                )
                count += 1

        if count % BATCH_SIZE == 0:
            db.commit()
    db.commit()
    return count


def load_annual_capital_contributions(db, text: str) -> int:
    """AllAnnualData / Capital Contributions.csv
    Columns: Financial Year, Return Type, Name, Contributor, Value
    """
    count = 0
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        donor = (row.get("Contributor") or "").strip()
        recipient = (row.get("Name") or "").strip()
        if not donor or not recipient:
            continue
        amount = parse_amount(row.get("Value", ""))
        fy = (row.get("Financial Year") or "").strip() or None
        _insert_donation(db, donor, recipient, amount, fy, "aec_annual")
        count += 1
        if count % BATCH_SIZE == 0:
            db.commit()
    db.commit()
    return count


def load_annual_discretionary_benefits(db, text: str) -> int:
    """AllAnnualData / Detailed Discretionary Benefits.csv
    Columns: Financial Year, Return Type, Name, Received From, Date, Value
    """
    count = 0
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        donor = (row.get("Received From") or "").strip()
        recipient = (row.get("Name") or "").strip()
        if not donor or not recipient:
            continue
        amount = parse_amount(row.get("Value", ""))
        fy = (row.get("Financial Year") or "").strip() or None
        _insert_donation(db, donor, recipient, amount, fy, "aec_annual")
        count += 1
        if count % BATCH_SIZE == 0:
            db.commit()
    db.commit()
    return count


# ── Election-specific CSVs ─────────────────────────────────────────

def load_election_donor_donations_made(db, text: str) -> int:
    """AllElectionsData / Donor Donations Made.csv
    Columns: Event, Donor Code, Donor Name, Donated To, Donated To Date Of Gift, Donated To Gift Value
    """
    count = 0
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        donor = (row.get("Donor Name") or "").strip()
        recipient = (row.get("Donated To") or "").strip()
        if not donor or not recipient:
            continue
        amount = parse_amount(row.get("Donated To Gift Value", ""))
        fy = (row.get("Event") or "").strip() or None  # e.g. "2025 Federal Election"
        _insert_donation(db, donor, recipient, amount, fy, "aec_election")
        count += 1
        if count % BATCH_SIZE == 0:
            db.commit()
    db.commit()
    return count


def load_election_donor_donations_received(db, text: str) -> int:
    """AllElectionsData / Donor Donations Received.csv
    Columns: Event, Donor Code, Donor Name, Gift From Name, Gift From Date Of Gift, Gift From Gift Value
    """
    count = 0
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        donor = (row.get("Gift From Name") or "").strip()
        recipient = (row.get("Donor Name") or "").strip()
        if not donor or not recipient:
            continue
        amount = parse_amount(row.get("Gift From Gift Value", ""))
        fy = (row.get("Event") or "").strip() or None
        _insert_donation(db, donor, recipient, amount, fy, "aec_election")
        count += 1
        if count % BATCH_SIZE == 0:
            db.commit()
    db.commit()
    return count


def load_election_candidate_donations(db, text: str) -> int:
    """AllElectionsData / Senate Groups and Candidate Donations.csv
    Columns: Event, Return Type, Name, Donor Name, Date Of Gift, Gift Value
    """
    count = 0
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        donor = (row.get("Donor Name") or "").strip()
        recipient = (row.get("Name") or "").strip()
        if not donor or not recipient:
            continue
        amount = parse_amount(row.get("Gift Value", ""))
        fy = (row.get("Event") or "").strip() or None
        _insert_donation(db, donor, recipient, amount, fy, "aec_election")
        count += 1
        if count % BATCH_SIZE == 0:
            db.commit()
    db.commit()
    return count


def load_election_third_party_made(db, text: str) -> int:
    """AllElectionsData / Third Party Return Donations Made.csv
    Columns: Event, Third Party Code, Third Party Name, Client ID, Name, Date Of Donation, Donation Value
    """
    count = 0
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        donor = (row.get("Third Party Name") or "").strip()
        recipient = (row.get("Name") or "").strip()
        if not donor or not recipient:
            continue
        amount = parse_amount(row.get("Donation Value", ""))
        fy = (row.get("Event") or "").strip() or None
        _insert_donation(db, donor, recipient, amount, fy, "aec_election")
        count += 1
        if count % BATCH_SIZE == 0:
            db.commit()
    db.commit()
    return count


def load_election_third_party_received(db, text: str) -> int:
    """AllElectionsData / Third Party Return Donations Received.csv
    Columns: Event, Third Party Code, Third Party Name, Donor Id, Donor Name, Date Of Gift, Gift Value
    """
    count = 0
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        donor = (row.get("Donor Name") or "").strip()
        recipient = (row.get("Third Party Name") or "").strip()
        if not donor or not recipient:
            continue
        amount = parse_amount(row.get("Gift Value", ""))
        fy = (row.get("Event") or "").strip() or None
        _insert_donation(db, donor, recipient, amount, fy, "aec_election")
        count += 1
        if count % BATCH_SIZE == 0:
            db.commit()
    db.commit()
    return count


# ── Referendum-specific CSVs ────────────────────────────────────────

def load_referendum_donations_made(db, text: str) -> int:
    """AllReferendumData / Referendum Donations Made.csv
    Columns: Event, Donor Name, Donated to name, Date, Value
    """
    count = 0
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        donor = (row.get("Donor Name") or "").strip()
        recipient = (row.get("Donated to name") or "").strip()
        if not donor or not recipient:
            continue
        amount = parse_amount(row.get("Value", ""))
        fy = (row.get("Event") or "").strip() or None
        _insert_donation(db, donor, recipient, amount, fy, "aec_referendum")
        count += 1
        if count % BATCH_SIZE == 0:
            db.commit()
    db.commit()
    return count


def load_referendum_entity_received(db, text: str) -> int:
    """AllReferendumData / Referendum Entity Donations Received.csv
    Columns: Event, Name, Donor name, Date, Value
    """
    count = 0
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        donor = (row.get("Donor name") or "").strip()
        recipient = (row.get("Name") or "").strip()
        if not donor or not recipient:
            continue
        amount = parse_amount(row.get("Value", ""))
        fy = (row.get("Event") or "").strip() or None
        _insert_donation(db, donor, recipient, amount, fy, "aec_referendum")
        count += 1
        if count % BATCH_SIZE == 0:
            db.commit()
    db.commit()
    return count


# ── Dispatch tables ────────────────────────────────────────────────

# Map CSV filename -> loader function for each ZIP
ANNUAL_CSV_LOADERS = {
    "Detailed Receipts.csv":              load_annual_detailed_receipts,
    "Donations Made.csv":                 load_annual_donations_made,
    "Donor Donations Received.csv":       load_annual_donor_donations_received,
    "Third Party Donations Received.csv": load_annual_third_party_received,
    "Associated Entity Returns.csv":      load_annual_associated_entities,
    "Capital Contributions.csv":          load_annual_capital_contributions,
    "Detailed Discretionary Benefits.csv": load_annual_discretionary_benefits,
}

ELECTION_CSV_LOADERS = {
    "Donor Donations Made.csv":                         load_election_donor_donations_made,
    "Donor Donations Received.csv":                     load_election_donor_donations_received,
    "Senate Groups and Candidate Donations.csv":        load_election_candidate_donations,
    "Third Party Return Donations Made.csv":            load_election_third_party_made,
    "Third Party Return Donations Received.csv":        load_election_third_party_received,
}

REFERENDUM_CSV_LOADERS = {
    "Referendum Donations Made.csv":            load_referendum_donations_made,
    "Referendum Entity Donations Received.csv": load_referendum_entity_received,
}

ZIP_LOADERS = {
    "AllAnnualData":     ANNUAL_CSV_LOADERS,
    "AllElectionsData":  ELECTION_CSV_LOADERS,
    "AllReferendumData": REFERENDUM_CSV_LOADERS,
}


def _read_csv_text(zf: zipfile.ZipFile, name: str) -> str:
    """Read a CSV from a ZipFile, handling encoding."""
    with zf.open(name) as f:
        raw = f.read()
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("latin-1")


def process_zip(db, zip_data: bytes, zip_key: str) -> int:
    """Process a ZIP using the dispatch table for zip_key. Returns count inserted."""
    loaders = ZIP_LOADERS.get(zip_key, {})
    if not loaders:
        print(f"  No loaders configured for {zip_key}")
        return 0

    total = 0
    try:
        with zipfile.ZipFile(io.BytesIO(zip_data), "r") as zf:
            csv_names = [n for n in zf.namelist() if n.lower().endswith(".csv")]
            print(f"  {zip_key}: {len(csv_names)} CSV files in ZIP")

            for csv_name in sorted(csv_names):
                loader = loaders.get(csv_name)
                if loader is None:
                    continue
                print(f"    Loading {csv_name}...")
                text = _read_csv_text(zf, csv_name)
                n = loader(db, text)
                print(f"      -> {n:,} donations")
                total += n
    except zipfile.BadZipFile:
        print(f"  Invalid ZIP: {zip_key}")
    return total


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Download and load AEC donation data."
    )
    parser.add_argument("--cache-only", action="store_true",
                        help="Only load from cached ZIPs, don't download")
    parser.add_argument("--download-only", action="store_true",
                        help="Download ZIPs to cache but don't load")
    parser.add_argument("--no-clear", action="store_true",
                        help="Don't clear existing donations before loading")
    args = parser.parse_args()

    db = get_db()
    init_db(db)

    # Record pre-load count
    pre_count = db.execute("SELECT COUNT(*) FROM donations").fetchone()[0]
    print(f"Donations before: {pre_count:,}")

    # Clear existing data for a clean reload (unless --no-clear)
    if not args.no_clear:
        db.execute("DELETE FROM donations")
        db.commit()
        print("Cleared existing donations for clean reload.")

    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # Download phase
    if not args.cache_only:
        for key, url in AEC_ZIPS.items():
            cache_path = CACHE_DIR / f"{key}.zip"
            if cache_path.exists() and cache_path.stat().st_size > 100:
                print(f"  {key}: already cached ({cache_path.stat().st_size:,} bytes)")
                continue
            zip_data = download_zip(url)
            if zip_data:
                cache_path.write_bytes(zip_data)
                print(f"  Cached {key} ({len(zip_data):,} bytes)")

    if args.download_only:
        print("Download complete.")
        return

    # Load phase
    total = 0
    for key in ZIP_LOADERS:
        cache_path = CACHE_DIR / f"{key}.zip"
        if not cache_path.exists():
            print(f"  {key}: not cached, skipping")
            continue
        zip_data = cache_path.read_bytes()
        n = process_zip(db, zip_data, key)
        total += n

    post_count = db.execute("SELECT COUNT(*) FROM donations").fetchone()[0]

    # Summary by source
    print(f"\n{'='*50}")
    print(f"Loaded {total:,} donations this run.")
    print(f"Total donations in DB: {post_count:,}")
    print(f"\nBy source:")
    for row in db.execute(
        "SELECT source, COUNT(*) as cnt FROM donations GROUP BY source ORDER BY cnt DESC"
    ).fetchall():
        print(f"  {row['source'] or 'unknown':25s}: {row['cnt']:>8,}")

    print(f"\nBy financial year / event (top 15):")
    for row in db.execute(
        "SELECT financial_year, COUNT(*) as cnt FROM donations GROUP BY financial_year ORDER BY cnt DESC LIMIT 15"
    ).fetchall():
        print(f"  {(row['financial_year'] or 'NULL'):35s}: {row['cnt']:>8,}")


if __name__ == "__main__":
    main()
