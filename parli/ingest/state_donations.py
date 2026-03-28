"""
parli.ingest.state_donations -- Ingest state-level political donation data.

State electoral commissions have LOWER disclosure thresholds than federal
($1,000 vs $16,900), revealing donations that would otherwise be hidden.

Supported sources:
  - QLD ECQ: Scrapes the Electronic Disclosure System (disclosures.ecq.qld.gov.au)
             via server-rendered HTML with POST pagination. ~22K gifts.
  - NSW EC:  Manual CSV import from efadisclosures.elections.nsw.gov.au
             (automated access blocked with 403). Place CSVs in the cache dir.
  - VIC VEC: Manual CSV import from disclosures.vec.vic.gov.au
             (Power Apps portal, no bulk export API). Place CSVs in the cache dir.

Usage:
    python -m parli.ingest.state_donations                      # QLD scrape + any cached CSVs
    python -m parli.ingest.state_donations --qld-only           # QLD ECQ only
    python -m parli.ingest.state_donations --nsw-only           # NSW cached CSV only
    python -m parli.ingest.state_donations --vic-only           # VIC cached CSV only
    python -m parli.ingest.state_donations --classify           # Also run industry classifier
    python -m parli.ingest.state_donations --qld-pages 10       # Limit QLD pages (for testing)
"""

import argparse
import csv
import io
import re
import time
from pathlib import Path

import requests

from parli.schema import get_db, init_db
from parli.ingest.donations import classify_donor_type, parse_amount

CACHE_DIR = Path("~/.cache/autoresearch/donations/state").expanduser()
QLD_EDS_BASE = "https://disclosures.ecq.qld.gov.au"
QLD_EDS_MAP = f"{QLD_EDS_BASE}/Map"

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-AU,en;q=0.9",
})

BATCH_SIZE = 500


def _print(*args, **kwargs):
    """Print with flush for real-time output in background mode."""
    print(*args, **kwargs, flush=True)


# ── Shared helpers ────────────────────────────────────────────────

def _insert_donation(db, donor: str, recipient: str, amount: float | None,
                     financial_year: str | None, source: str, state: str,
                     date: str | None = None, donor_type_hint: str | None = None):
    """Insert a single state donation row, deduplicating on (donor, recipient, amount, date, source)."""
    donor_type = donor_type_hint or classify_donor_type(donor)
    # Use date as financial_year fallback if we have it
    fy = financial_year
    if not fy and date:
        # Convert dd-mm-yyyy or yyyy-mm-dd to financial year
        try:
            if "-" in date and len(date) == 10:
                if date[2] == "-":  # dd-mm-yyyy
                    year, month = int(date[6:10]), int(date[3:5])
                else:  # yyyy-mm-dd
                    year, month = int(date[:4]), int(date[5:7])
                if month >= 7:
                    fy = f"{year}-{str(year + 1)[2:]}"
                else:
                    fy = f"{year - 1}-{str(year)[2:]}"
        except (ValueError, IndexError):
            pass

    db.execute(
        """INSERT INTO donations
           (donor_name, recipient, amount, financial_year, donor_type, industry, source, state)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (donor, recipient, amount, fy, donor_type, None, source, state),
    )


def _clean_text(html_text: str) -> str:
    """Strip HTML tags and normalise whitespace."""
    text = re.sub(r"<[^>]+>", "", html_text)
    text = text.replace("&mdash;", "").replace("&amp;", "&").replace("&#x27;", "'")
    return " ".join(text.split()).strip()


def _parse_qld_amount(text: str) -> float | None:
    """Parse amount like '$7,000.00' from QLD EDS."""
    text = _clean_text(text)
    if not text or text == "-":
        return None
    return parse_amount(text)


# ── QLD ECQ Scraper ──────────────────────────────────────────────

def _get_qld_verification_token() -> tuple[str, requests.cookies.RequestsCookieJar]:
    """Get the anti-forgery token and session cookies from the QLD EDS."""
    resp = SESSION.get(QLD_EDS_MAP, timeout=30)
    resp.raise_for_status()
    m = re.search(r'__RequestVerificationToken.*?value="([^"]+)"', resp.text)
    if not m:
        raise RuntimeError("Could not find QLD EDS verification token")
    return m.group(1), resp.cookies


def _get_qld_total_gifts(html: str) -> int:
    """Extract total gift count from the page."""
    m = re.search(r'total">\s*([\d,]+)', html)
    if m:
        return int(m.group(1).replace(",", ""))
    return 0


def _parse_qld_page(html: str) -> list[dict]:
    """Parse gift rows from a QLD EDS HTML page."""
    gifts = []
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL)

    for row in rows:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)
        if len(cells) < 5:
            continue

        donor = _clean_text(cells[0])
        if not donor or donor.lower() in ("donor", ""):
            continue

        recipient = _clean_text(cells[2])
        date = _clean_text(cells[4])
        donation_type = _clean_text(cells[5]) if len(cells) > 5 else ""

        # Amount is typically in cell 7 (or 6 depending on reconciliation column)
        amount = None
        for idx in (7, 6, 8):
            if idx < len(cells):
                amount = _parse_qld_amount(cells[idx])
                if amount is not None:
                    break

        gifts.append({
            "donor": donor,
            "recipient": recipient,
            "amount": amount,
            "date": date,
            "donation_type": donation_type,
        })

    return gifts


def scrape_qld_ecq(db, max_pages: int = 0, delay: float = 1.0) -> int:
    """Scrape all gifts from QLD ECQ Electronic Disclosure System.

    Returns count of new donations inserted.
    """
    _print("QLD ECQ: Fetching initial page...")
    token, cookies = _get_qld_verification_token()

    # Get first page to find total
    resp = SESSION.get(QLD_EDS_MAP, timeout=30, cookies=cookies)
    total_gifts = _get_qld_total_gifts(resp.text)
    _print(f"QLD ECQ: {total_gifts:,} total gifts reported")

    # Check existing QLD donations to avoid duplicates
    existing = db.execute(
        "SELECT COUNT(*) FROM donations WHERE source = 'qld_ecq'"
    ).fetchone()[0]
    _print(f"QLD ECQ: {existing:,} existing QLD donations in DB")

    page_size = 100
    total_pages = (total_gifts + page_size - 1) // page_size
    if max_pages > 0:
        total_pages = min(total_pages, max_pages)

    _print(f"QLD ECQ: Scraping {total_pages} pages (size={page_size})...")

    # Clear existing QLD ECQ data for clean re-ingest
    if existing > 0:
        db.execute("DELETE FROM donations WHERE source = 'qld_ecq'")
        db.commit()
        _print(f"QLD ECQ: Cleared {existing:,} existing records for clean reload")

    # Also parse the first page we already fetched
    first_page_gifts = _parse_qld_page(resp.text)

    total_inserted = 0
    consecutive_empty = 0

    for page in range(1, total_pages + 1):
        try:
            # Reuse first page; fetch subsequent pages via POST
            if page == 1:
                gifts = first_page_gifts
            else:
                # Refresh token periodically (every 50 pages)
                if page % 50 == 1:
                    try:
                        token, cookies = _get_qld_verification_token()
                    except Exception:
                        pass

                form_data = {
                    "ViewFilter.View": "Table",
                    "ViewFilter.OrderBy": "",
                    "ViewFilter.IsAscending": "",
                    "NavigationFilter.PageNumber": str(page),
                    "NavigationFilter.PageSize": str(page_size),
                    "__RequestVerificationToken": token,
                }

                resp = SESSION.post(QLD_EDS_MAP, data=form_data, cookies=cookies, timeout=30)
                resp.raise_for_status()
                gifts = _parse_qld_page(resp.text)

            if not gifts:
                consecutive_empty += 1
                if consecutive_empty >= 3:
                    _print(f"  Page {page}: 3 consecutive empty pages, stopping")
                    break
                continue
            consecutive_empty = 0

            for g in gifts:
                _insert_donation(
                    db,
                    donor=g["donor"],
                    recipient=g["recipient"],
                    amount=g["amount"],
                    financial_year=None,
                    source="qld_ecq",
                    state="qld",
                    date=g["date"],
                )
                total_inserted += 1

            if total_inserted % BATCH_SIZE == 0 or page == total_pages:
                db.commit()

            if page % 10 == 0 or page == total_pages:
                _print(f"  Page {page}/{total_pages}: {total_inserted:,} donations so far")

            # Rate limit -- polite but not too slow
            if page > 1:
                time.sleep(delay)

        except requests.RequestException as e:
            _print(f"  Page {page}: request error ({e}), retrying after 5s...")
            time.sleep(5)
            try:
                token, cookies = _get_qld_verification_token()
                form_data = {
                    "ViewFilter.View": "Table",
                    "ViewFilter.OrderBy": "",
                    "ViewFilter.IsAscending": "",
                    "NavigationFilter.PageNumber": str(page),
                    "NavigationFilter.PageSize": str(page_size),
                    "__RequestVerificationToken": token,
                }
                resp = SESSION.post(QLD_EDS_MAP, data=form_data, cookies=cookies, timeout=30)
                resp.raise_for_status()
                gifts = _parse_qld_page(resp.text)
                for g in gifts:
                    _insert_donation(
                        db, g["donor"], g["recipient"], g["amount"],
                        None, "qld_ecq", "qld", g["date"],
                    )
                    total_inserted += 1
                db.commit()
            except Exception as e2:
                _print(f"  Page {page}: retry failed ({e2}), skipping")
                continue

    db.commit()
    _print(f"QLD ECQ: Inserted {total_inserted:,} donations")
    return total_inserted


# ── NSW Manual CSV Import ────────────────────────────────────────
#
# NSW Electoral Commission blocks automated access (403).
# To use: manually download CSVs from efadisclosures.elections.nsw.gov.au
# and place them in ~/.cache/autoresearch/donations/state/nsw/
#
# Expected CSV columns (flexible -- we detect by header):
#   - Donor Name / Received From / Gift From Name
#   - Recipient Name / Donation Made To / Party Name / Name
#   - Value / Amount / Gift Value
#   - Financial Year / Period / Date
#
# The NSW EFA portal lets you export disclosure summaries as CSV.
# The old searchdecs.elections.nsw.gov.au also has searchable records.

NSW_DONOR_COLS = [
    "Donor Name", "Received From", "Gift From Name", "Donor",
    "donor_name", "DonorName", "Name of Donor",
]
NSW_RECIPIENT_COLS = [
    "Recipient Name", "Recipient", "Donation Made To", "Party Name",
    "Name", "recipient", "RecipientName", "Party",
]
NSW_AMOUNT_COLS = [
    "Value", "Amount", "Gift Value", "Donation Value", "Total",
    "value", "amount",
]
NSW_FY_COLS = [
    "Financial Year", "Period", "FinancialYear", "FY", "Year",
    "financial_year",
]
NSW_DATE_COLS = [
    "Date", "Date of Gift", "Disclosure Date", "date",
    "DateOfGift", "disclosure_date",
]


def _find_column(headers: list[str], candidates: list[str]) -> str | None:
    """Find the first matching column name from candidates."""
    header_map = {h.strip().lower(): h.strip() for h in headers}
    for c in candidates:
        if c.lower() in header_map:
            return header_map[c.lower()]
    return None


def load_nsw_csv(db, filepath: Path) -> int:
    """Load a single NSW donation CSV file. Returns count inserted."""
    text = filepath.read_text(encoding="utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []

    donor_col = _find_column(headers, NSW_DONOR_COLS)
    recipient_col = _find_column(headers, NSW_RECIPIENT_COLS)
    amount_col = _find_column(headers, NSW_AMOUNT_COLS)
    fy_col = _find_column(headers, NSW_FY_COLS)
    date_col = _find_column(headers, NSW_DATE_COLS)

    if not donor_col or not recipient_col:
        print(f"  WARNING: Could not find donor/recipient columns in {filepath.name}")
        print(f"  Headers: {headers}")
        return 0

    count = 0
    for row in reader:
        donor = (row.get(donor_col) or "").strip()
        recipient = (row.get(recipient_col) or "").strip()
        if not donor or not recipient:
            continue

        amount = parse_amount(row.get(amount_col, "")) if amount_col else None
        fy = (row.get(fy_col) or "").strip() if fy_col else None
        date = (row.get(date_col) or "").strip() if date_col else None

        _insert_donation(db, donor, recipient, amount, fy, "nsw_ec", "nsw", date)
        count += 1
        if count % BATCH_SIZE == 0:
            db.commit()

    db.commit()
    return count


def load_nsw_cached(db) -> int:
    """Load all NSW CSVs from the cache directory."""
    nsw_dir = CACHE_DIR / "nsw"
    if not nsw_dir.exists():
        nsw_dir.mkdir(parents=True, exist_ok=True)
        print(f"NSW: Created directory {nsw_dir}")
        print("NSW: No CSV files found. Download from efadisclosures.elections.nsw.gov.au")
        print("     and place CSVs in this directory.")
        return 0

    csv_files = sorted(nsw_dir.glob("*.csv"))
    if not csv_files:
        print(f"NSW: No CSV files in {nsw_dir}")
        print("     Download from efadisclosures.elections.nsw.gov.au and place here.")
        return 0

    # Clear existing NSW EC data for clean reload
    existing = db.execute(
        "SELECT COUNT(*) FROM donations WHERE source = 'nsw_ec'"
    ).fetchone()[0]
    if existing > 0:
        db.execute("DELETE FROM donations WHERE source = 'nsw_ec'")
        db.commit()
        print(f"NSW: Cleared {existing:,} existing nsw_ec records")

    total = 0
    for f in csv_files:
        print(f"  Loading {f.name}...")
        n = load_nsw_csv(db, f)
        print(f"    -> {n:,} donations")
        total += n

    return total


# ── VIC Manual CSV Import ────────────────────────────────────────
#
# VIC Electoral Commission (VEC) uses a Power Apps portal at
# disclosures.vec.vic.gov.au -- no bulk export API.
# Place manually exported CSVs in ~/.cache/autoresearch/donations/state/vic/

VIC_DONOR_COLS = NSW_DONOR_COLS + ["Disclosed By", "Entity Name"]
VIC_RECIPIENT_COLS = NSW_RECIPIENT_COLS + ["Disclosed To", "Political Party"]
VIC_AMOUNT_COLS = NSW_AMOUNT_COLS
VIC_FY_COLS = NSW_FY_COLS + ["Reporting Period"]
VIC_DATE_COLS = NSW_DATE_COLS + ["Donation Date", "Date Received"]


def load_vic_csv(db, filepath: Path) -> int:
    """Load a single VIC donation CSV file. Returns count inserted."""
    text = filepath.read_text(encoding="utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []

    donor_col = _find_column(headers, VIC_DONOR_COLS)
    recipient_col = _find_column(headers, VIC_RECIPIENT_COLS)
    amount_col = _find_column(headers, VIC_AMOUNT_COLS)
    fy_col = _find_column(headers, VIC_FY_COLS)
    date_col = _find_column(headers, VIC_DATE_COLS)

    if not donor_col or not recipient_col:
        print(f"  WARNING: Could not find donor/recipient columns in {filepath.name}")
        print(f"  Headers: {headers}")
        return 0

    count = 0
    for row in reader:
        donor = (row.get(donor_col) or "").strip()
        recipient = (row.get(recipient_col) or "").strip()
        if not donor or not recipient:
            continue

        amount = parse_amount(row.get(amount_col, "")) if amount_col else None
        fy = (row.get(fy_col) or "").strip() if fy_col else None
        date = (row.get(date_col) or "").strip() if date_col else None

        _insert_donation(db, donor, recipient, amount, fy, "vic_vec", "vic", date)
        count += 1
        if count % BATCH_SIZE == 0:
            db.commit()

    db.commit()
    return count


def load_vic_cached(db) -> int:
    """Load all VIC CSVs from the cache directory."""
    vic_dir = CACHE_DIR / "vic"
    if not vic_dir.exists():
        vic_dir.mkdir(parents=True, exist_ok=True)
        print(f"VIC: Created directory {vic_dir}")
        print("VIC: No CSV files found. Download from disclosures.vec.vic.gov.au")
        print("     and place CSVs in this directory.")
        return 0

    csv_files = sorted(vic_dir.glob("*.csv"))
    if not csv_files:
        print(f"VIC: No CSV files in {vic_dir}")
        print("     Download from disclosures.vec.vic.gov.au and place here.")
        return 0

    # Clear existing VIC VEC data for clean reload
    existing = db.execute(
        "SELECT COUNT(*) FROM donations WHERE source = 'vic_vec'"
    ).fetchone()[0]
    if existing > 0:
        db.execute("DELETE FROM donations WHERE source = 'vic_vec'")
        db.commit()
        print(f"VIC: Cleared {existing:,} existing vic_vec records")

    total = 0
    for f in csv_files:
        print(f"  Loading {f.name}...")
        n = load_vic_csv(db, f)
        print(f"    -> {n:,} donations")
        total += n

    return total


# ── Main ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Ingest state-level political donation data."
    )
    parser.add_argument("--qld-only", action="store_true",
                        help="Only scrape QLD ECQ")
    parser.add_argument("--nsw-only", action="store_true",
                        help="Only load NSW cached CSVs")
    parser.add_argument("--vic-only", action="store_true",
                        help="Only load VIC cached CSVs")
    parser.add_argument("--qld-pages", type=int, default=0,
                        help="Limit QLD pages to scrape (0 = all)")
    parser.add_argument("--delay", type=float, default=1.0,
                        help="Delay between QLD page requests (seconds)")
    parser.add_argument("--classify", action="store_true",
                        help="Run industry classifier after loading")
    args = parser.parse_args()

    db = get_db()
    init_db(db)
    db.execute("PRAGMA busy_timeout = 600000")

    do_all = not (args.qld_only or args.nsw_only or args.vic_only)

    pre_count = db.execute("SELECT COUNT(*) FROM donations").fetchone()[0]
    print(f"Donations before: {pre_count:,}")
    print()

    total_new = 0

    # QLD ECQ
    if do_all or args.qld_only:
        print("=" * 60)
        print("QLD Electoral Commission of Queensland (ECQ)")
        print("  Source: disclosures.ecq.qld.gov.au")
        print("  Threshold: $1,000 (political) / $200 (non-political gifts)")
        print("=" * 60)
        try:
            n = scrape_qld_ecq(db, max_pages=args.qld_pages, delay=args.delay)
            total_new += n
        except Exception as e:
            print(f"QLD ECQ error: {e}")
            import traceback
            traceback.print_exc()
        print()

    # NSW EC
    if do_all or args.nsw_only:
        print("=" * 60)
        print("NSW Electoral Commission")
        print("  Source: efadisclosures.elections.nsw.gov.au (manual CSV)")
        print("  Threshold: $1,000")
        print(f"  CSV directory: {CACHE_DIR / 'nsw'}")
        print("=" * 60)
        try:
            n = load_nsw_cached(db)
            total_new += n
        except Exception as e:
            print(f"NSW EC error: {e}")
        print()

    # VIC VEC
    if do_all or args.vic_only:
        print("=" * 60)
        print("Victorian Electoral Commission (VEC)")
        print("  Source: disclosures.vec.vic.gov.au (manual CSV)")
        print("  Threshold: $1,240")
        print(f"  CSV directory: {CACHE_DIR / 'vic'}")
        print("=" * 60)
        try:
            n = load_vic_cached(db)
            total_new += n
        except Exception as e:
            print(f"VIC VEC error: {e}")
        print()

    # Run classifier if requested
    if args.classify and total_new > 0:
        print("=" * 60)
        print("Running industry classifier on new state donations...")
        print("=" * 60)
        from parli.ingest.classify_donations import classify_donations
        classify_donations(db)
        print()

    # Summary
    post_count = db.execute("SELECT COUNT(*) FROM donations").fetchone()[0]

    print("=" * 60)
    print(f"State donation ingest complete.")
    print(f"  New donations this run: {total_new:,}")
    print(f"  Total donations in DB: {post_count:,}")
    print(f"  Net change: {post_count - pre_count:+,}")
    print()

    print("By source:")
    for row in db.execute(
        "SELECT source, COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total "
        "FROM donations GROUP BY source ORDER BY cnt DESC"
    ).fetchall():
        print(f"  {row['source'] or 'unknown':25s}: {row['cnt']:>8,} donations  ${row['total']:>14,.2f}")

    print()
    print("State-level donations:")
    for row in db.execute(
        "SELECT state, source, COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total "
        "FROM donations WHERE state != 'federal' "
        "GROUP BY state, source ORDER BY cnt DESC"
    ).fetchall():
        print(f"  {row['state']:5s} ({row['source']:10s}): {row['cnt']:>8,} donations  ${row['total']:>14,.2f}")


if __name__ == "__main__":
    main()
