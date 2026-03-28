"""
parli.ingest.bills -- Load ALRC Commonwealth Bills data into the parli database.

Data sources:
  - Status of Commonwealth Bills (XLSX)
  - Progress of Commonwealth Bills through Parliament (XLSX)

Covers bills introduced between the 39th (1998) and 46th (2022) Parliaments.

Usage:
    python -m parli.ingest.bills              # download and ingest both files
    python -m parli.ingest.bills --skip-download  # use cached XLSX files only
"""

import argparse
import re
import urllib.request
from pathlib import Path

import pandas as pd

from parli.schema import get_db, init_db

CACHE_DIR = Path("~/.cache/autoresearch/bills").expanduser()

STATUS_URL = (
    "https://www.alrc.gov.au/wp-content/uploads/2022/12/"
    "Status-of-Commonwealth-Bills.xlsx"
)
PROGRESS_URL = (
    "https://www.alrc.gov.au/wp-content/uploads/2022/12/"
    "Progress-of-Commonwealth-Bills-through-Parliament.xlsx"
)

USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) OPAX/1.0"

# Map raw event strings to normalised stage names
STAGE_MAP = {
    "introduced": "introduced",
    "introduced and read a first time": "introduced",
    "second reading moved": "second_reading",
    "second reading debate": "second_reading",
    "second reading agreed to": "second_reading",
    "second reading negatived": "second_reading",
    "second reading amendment agreed to": "second_reading",
    "second reading amendment negatived": "second_reading",
    "committee of the whole debate": "committee",
    "consideration in detail debate": "committee",
    "referred to committee": "committee",
    "referred to federation chamber": "committee",
    "referred to main committee": "committee",
    "negatived in committee of the whole": "committee",
    "reported from federation chamber": "committee",
    "reported from main committee": "committee",
    "third reading moved": "third_reading",
    "third reading debated": "third_reading",
    "third reading agreed to": "third_reading",
    "third reading negatived": "third_reading",
    "finally passed both houses": "passed",
    "text of bill as passed both houses": "passed",
    "assent": "royal_assent",
}

# Map raw ALRC status to our normalised status values
STATUS_MAP = {
    "Act": "passed",
    "Not Proceeding": "lapsed",
}

# Extract a date from the event string
DATE_IN_EVENT_RE = re.compile(r"(\d{4}-\d{2}-\d{2})$")


def download_files(force: bool = False) -> tuple[Path, Path]:
    """Download both XLSX files to the cache directory. Returns paths."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    status_path = CACHE_DIR / "status.xlsx"
    progress_path = CACHE_DIR / "progress.xlsx"

    for url, path, label in [
        (STATUS_URL, status_path, "Status"),
        (PROGRESS_URL, progress_path, "Progress"),
    ]:
        if path.exists() and not force:
            print(f"  [{label}] Using cached {path}")
            continue
        print(f"  [{label}] Downloading from {url} ...")
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
        path.write_bytes(data)
        print(f"  [{label}] Saved {path} ({len(data):,} bytes)")

    return status_path, progress_path


def _parse_date(val) -> str | None:
    """Convert a pandas Timestamp or string to ISO date string."""
    if pd.isna(val):
        return None
    if hasattr(val, "strftime"):
        return val.strftime("%Y-%m-%d")
    s = str(val).strip()
    return s[:10] if s else None


def _normalise_status(raw: str | None) -> str:
    if not raw or pd.isna(raw):
        return "before_parliament"
    return STATUS_MAP.get(str(raw).strip(), "before_parliament")


def _extract_event_date(event_str: str) -> str | None:
    if not event_str:
        return None
    m = DATE_IN_EVENT_RE.search(event_str.strip())
    return m.group(1) if m else None


def _normalise_stage(event_str: str) -> str | None:
    if not event_str:
        return None
    clean = DATE_IN_EVENT_RE.sub("", event_str).strip().lower()
    return STAGE_MAP.get(clean)


def _extract_portfolio(sponsor) -> str | None:
    if not sponsor or pd.isna(sponsor):
        return None
    s = str(sponsor).strip()
    s = re.sub(r"\s+[Pp]ortfolio$", "", s)
    return s if s else None


def ingest_bills(status_path: Path, progress_path: Path) -> dict:
    """Load bills from status XLSX and progress XLSX into the database."""
    db = get_db()
    db.execute("PRAGMA busy_timeout = 120000")  # wait up to 120s for locks
    init_db(db)

    # Ensure bill_progress table exists
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS bill_progress (
            progress_id INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_id INTEGER,
            stage TEXT,
            date TEXT,
            house TEXT,
            event_raw TEXT,
            FOREIGN KEY (bill_id) REFERENCES bills(bill_id)
        )
        """
    )
    db.commit()

    # ── Load status data (vectorised) ────────────────────────────────
    print("[bills] Reading status XLSX ...")
    df_status = pd.read_excel(status_path, sheet_name="Data", engine="openpyxl")
    print(f"  {len(df_status)} rows in status file")

    # Preprocess into tuples
    bill_rows = []
    for _, row in df_status.iterrows():
        title = str(row.get("billName", "")).strip()
        if not title:
            continue
        bill_rows.append((
            title,
            _normalise_status(row.get("status")),
            _extract_portfolio(row.get("sponsor")),
            _parse_date(row.get("billDate")),
            str(row.get("originatingHouse", "")).strip() or None,
        ))

    # Build existing bills lookup (title, date) -> bill_id
    existing_bills = db.execute(
        "SELECT bill_id, title, introduced_date FROM bills"
    ).fetchall()
    bill_lookup: dict[tuple[str, str], int] = {
        (r["title"], r["introduced_date"] or ""): r["bill_id"]
        for r in existing_bills
    }

    # Insert only new bills
    to_insert = []
    for title, status, portfolio, intro_date, house in bill_rows:
        key = (title, intro_date or "")
        if key not in bill_lookup:
            to_insert.append((title, status, portfolio, intro_date, house))

    bills_inserted = 0
    if to_insert:
        db.executemany(
            "INSERT INTO bills (title, status, portfolio, introduced_date, house) VALUES (?, ?, ?, ?, ?)",
            to_insert,
        )
        db.commit()
        bills_inserted = len(to_insert)

        # Refresh lookup after inserts
        new_bills = db.execute(
            "SELECT bill_id, title, introduced_date FROM bills"
        ).fetchall()
        bill_lookup = {
            (r["title"], r["introduced_date"] or ""): r["bill_id"]
            for r in new_bills
        }

    bills_skipped = len(bill_rows) - bills_inserted
    print(f"  Bills: {bills_inserted} inserted, {bills_skipped} already existed")

    # ── Load progress data (vectorised) ──────────────────────────────
    print("[bills] Reading progress XLSX ...")
    df_progress = pd.read_excel(progress_path, sheet_name="Data", engine="openpyxl")
    print(f"  {len(df_progress)} rows in progress file")

    # Clear existing progress data
    print("  Clearing old progress data ...")
    db.execute("DELETE FROM bill_progress")
    db.commit()

    # First pass: find bills in progress that aren't in status, and insert them
    new_from_progress = []
    for _, row in df_progress.iterrows():
        title = str(row.get("billName", "")).strip()
        if not title:
            continue
        intro_date = _parse_date(row.get("billDate"))
        key = (title, intro_date or "")
        if key not in bill_lookup:
            bill_lookup[key] = -1  # placeholder
            new_from_progress.append((
                title,
                _normalise_status(row.get("status")),
                _extract_portfolio(row.get("sponsor")),
                intro_date,
                str(row.get("originatingHouse", "")).strip() or None,
            ))

    if new_from_progress:
        db.executemany(
            "INSERT INTO bills (title, status, portfolio, introduced_date, house) VALUES (?, ?, ?, ?, ?)",
            new_from_progress,
        )
        db.commit()
        bills_inserted += len(new_from_progress)

        # Refresh lookup
        all_bills = db.execute(
            "SELECT bill_id, title, introduced_date FROM bills"
        ).fetchall()
        bill_lookup = {
            (r["title"], r["introduced_date"] or ""): r["bill_id"]
            for r in all_bills
        }
        print(f"  Additional bills from progress file: {len(new_from_progress)}")

    # Second pass: build all progress rows in memory, then batch insert
    progress_batch = []
    progress_skipped = 0

    for _, row in df_progress.iterrows():
        title = str(row.get("billName", "")).strip()
        if not title:
            continue

        intro_date = _parse_date(row.get("billDate"))
        key = (title, intro_date or "")
        bill_id = bill_lookup.get(key)
        if bill_id is None:
            continue

        event_raw = str(row.get("event", "")).strip()
        stage = _normalise_stage(event_raw)
        if not stage:
            progress_skipped += 1
            continue

        event_date = _extract_event_date(event_raw) or _parse_date(row.get("eventDate"))
        house = str(row.get("house", "")).strip() or None

        progress_batch.append((bill_id, stage, event_date, house, event_raw))

    # Batch insert all progress rows
    BATCH_SIZE = 5000
    progress_inserted = 0
    for i in range(0, len(progress_batch), BATCH_SIZE):
        chunk = progress_batch[i : i + BATCH_SIZE]
        db.executemany(
            "INSERT INTO bill_progress (bill_id, stage, date, house, event_raw) VALUES (?, ?, ?, ?, ?)",
            chunk,
        )
        db.commit()
        progress_inserted += len(chunk)
        if i % 10000 == 0 and i > 0:
            print(f"    ... {progress_inserted} progress events inserted")

    print(f"  Progress events: {progress_inserted} inserted, {progress_skipped} skipped (unrecognised stage)")

    # ── Summary ──────────────────────────────────────────────────────
    total_bills = db.execute("SELECT COUNT(*) AS c FROM bills").fetchone()["c"]
    total_progress = db.execute("SELECT COUNT(*) AS c FROM bill_progress").fetchone()["c"]

    status_dist = db.execute(
        "SELECT status, COUNT(*) AS c FROM bills GROUP BY status ORDER BY c DESC"
    ).fetchall()

    print(f"\n[bills] Summary:")
    print(f"  Total bills in DB: {total_bills}")
    print(f"  Total progress events: {total_progress}")
    print(f"  Status distribution:")
    for r in status_dist:
        print(f"    {r['status']}: {r['c']}")

    return {
        "bills_inserted": bills_inserted,
        "progress_inserted": progress_inserted,
        "total_bills": total_bills,
        "total_progress": total_progress,
    }


def main():
    parser = argparse.ArgumentParser(description="Ingest ALRC bills data")
    parser.add_argument(
        "--skip-download",
        action="store_true",
        help="Use cached XLSX files, don't re-download",
    )
    parser.add_argument(
        "--force-download",
        action="store_true",
        help="Re-download XLSX files even if cached",
    )
    args = parser.parse_args()

    if args.skip_download:
        status_path = CACHE_DIR / "status.xlsx"
        progress_path = CACHE_DIR / "progress.xlsx"
        if not status_path.exists() or not progress_path.exists():
            print("Cached files not found, downloading...")
            status_path, progress_path = download_files(force=True)
    else:
        status_path, progress_path = download_files(force=args.force_download)

    result = ingest_bills(status_path, progress_path)
    print(f"\nDone. {result['bills_inserted']} bills, {result['progress_inserted']} progress events ingested.")


if __name__ == "__main__":
    main()
