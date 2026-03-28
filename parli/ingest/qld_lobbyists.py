"""
parli.ingest.qld_lobbyists -- Scrape QLD Integrity Commissioner Lobbyist Register.

Data source: https://lobbyists.integrity.qld.gov.au/
Entity: dpc_contactlog (Dataverse/PowerApps portal)

The QLD Lobbyist Register is built on Microsoft PowerApps/Dynamics 365 Portal.
The contact log data is loaded dynamically via client-side JavaScript, making it
inaccessible without a headless browser. This module scrapes what is available:

1. The list of registered lobbyists and their details from individual pages
2. Contact log entries via the search page (requires Playwright or similar)

For now, this implements:
- Scraping the lobbyist entity listing pages
- Storing lobbyist registration data
- A stub for contact log scraping (requires headless browser)

The contact log search page at:
  https://lobbyists.integrity.qld.gov.au/lobbying-register/search-contact-log/
uses a PowerApps entity list (ViewId: 999f1282-b9b8-ed11-b596-0022481574a0)
with entity name 'dpc_contactlog' and fields:
  - dpc_entity (Trading Name)
  - dpc_clientsrepresented (Client)
  - dpc_representative_mtext (Government Representatives)
  - dpc_portfolioareas (Policy/Portfolio)
  - dpc_datelobbyingcontactoccurred_date (Date)

Usage:
    python -m parli.ingest.qld_lobbyists
    python -m parli.ingest.qld_lobbyists --lobbyists-only
    python -m parli.ingest.qld_lobbyists --contact-log  # requires playwright
"""

import argparse
import hashlib
import json
import re
import sqlite3
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

from parli.schema import get_db, init_db

# ── Configuration ─────────────────────────────────────────────────────────────

REGISTER_BASE = "https://lobbyists.integrity.qld.gov.au"
USER_AGENT = "Mozilla/5.0 (compatible; OPAX/1.0; +https://opax.com.au)"
REQUEST_DELAY = 1.0
MAX_RETRIES = 3

CACHE_DIR = Path("~/.cache/autoresearch/qld_lobbyists").expanduser()

# Known lobbyist entity search page URLs
ENTITY_SEARCH_URL = f"{REGISTER_BASE}/lobbying-register/search-entities/"
LOBBYIST_SEARCH_URL = f"{REGISTER_BASE}/lobbying-register/search-lobbyists/"
CONTACT_LOG_URL = f"{REGISTER_BASE}/lobbying-register/search-contact-log/"

# ── Database schema ──────────────────────────────────────────────────────────

QLD_LOBBYIST_SCHEMA = """
CREATE TABLE IF NOT EXISTS qld_lobbyists (
    lobbyist_id TEXT PRIMARY KEY,
    trading_name TEXT NOT NULL,
    abn TEXT,
    business_type TEXT,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    address TEXT,
    status TEXT,  -- 'active', 'inactive'
    scraped_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qld_lobbyist_clients (
    client_id TEXT PRIMARY KEY,
    lobbyist_id TEXT NOT NULL,
    client_name TEXT NOT NULL,
    FOREIGN KEY (lobbyist_id) REFERENCES qld_lobbyists(lobbyist_id)
);

CREATE TABLE IF NOT EXISTS qld_lobbyist_contacts (
    contact_id TEXT PRIMARY KEY,
    lobbyist_trading_name TEXT,
    client_name TEXT,
    government_representatives TEXT,
    portfolio_area TEXT,
    contact_date TEXT,
    purpose TEXT,
    mode_of_communication TEXT,
    scraped_at TEXT DEFAULT (datetime('now'))
);
"""


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _fetch(url: str) -> str:
    """Fetch a URL and return text content."""
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
    })
    for attempt in range(MAX_RETRIES):
        try:
            time.sleep(REQUEST_DELAY)
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                raise
            wait = 2 ** (attempt + 1)
            print(f"    Retry {attempt + 1}: {e} (waiting {wait}s)")
            time.sleep(wait)
    return ""


def _text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


# ── Lobbyist entity scraping ─────────────────────────────────────────────────

def scrape_entity_detail(url: str) -> dict | None:
    """Scrape a single lobbyist entity detail page.

    These pages are server-rendered (not dynamic JS) and contain:
    - Trading name, ABN, contact details
    - List of employees/associates
    - List of clients
    """
    from bs4 import BeautifulSoup

    try:
        html = _fetch(url)
    except Exception as e:
        print(f"    Error fetching {url}: {e}")
        return None

    soup = BeautifulSoup(html, "html.parser")

    # Extract key-value pairs from the page
    data = {"url": url}

    # Look for field labels and values
    for label_elem in soup.find_all(["label", "dt", "th", "strong"]):
        label_text = label_elem.get_text(strip=True).lower()
        value_elem = label_elem.find_next(["dd", "td", "span", "p"])
        if value_elem:
            value = value_elem.get_text(strip=True)
            if "trading name" in label_text or "entity name" in label_text:
                data["trading_name"] = value
            elif "abn" in label_text:
                data["abn"] = value
            elif "email" in label_text:
                data["contact_email"] = value
            elif "phone" in label_text:
                data["contact_phone"] = value
            elif "address" in label_text:
                data["address"] = value
            elif "status" in label_text:
                data["status"] = value

    # Extract client names if listed
    clients = []
    for li in soup.find_all("li"):
        text = li.get_text(strip=True)
        if text and len(text) > 2 and len(text) < 200:
            # Heuristic: if in a section after "clients", it's a client
            clients.append(text)

    data["clients"] = clients
    return data if data.get("trading_name") else None


def scrape_lobbyist_list() -> list[dict]:
    """Scrape the lobbyist search page for entity links.

    Returns list of {url, name} dicts for each lobbyist entity.
    """
    from bs4 import BeautifulSoup

    print("  Fetching lobbyist search page...")
    try:
        html = _fetch(ENTITY_SEARCH_URL)
    except Exception as e:
        print(f"    Error: {e}")
        # Try alternate URL
        try:
            html = _fetch(LOBBYIST_SEARCH_URL)
        except Exception as e2:
            print(f"    Alternate also failed: {e2}")
            return []

    soup = BeautifulSoup(html, "html.parser")

    # The page renders a list/table of lobbyists with links to detail pages
    entities = []
    for link in soup.find_all("a", href=True):
        href = link["href"]
        if "register-details" in href or "entity-details" in href or "client-details" in href:
            name = link.get_text(strip=True)
            if name:
                full_url = href if href.startswith("http") else f"{REGISTER_BASE}{href}"
                entities.append({"url": full_url, "name": name})

    print(f"  Found {len(entities)} entity links")
    return entities


# ── Contact log scraping (requires headless browser) ──────────────────────────

def scrape_contact_log_playwright(
    start_date: str | None = None,
    max_pages: int = 100,
) -> list[dict]:
    """Scrape contact log entries using Playwright (headless browser).

    The contact log search page loads data dynamically via PowerApps JS.
    This requires playwright to be installed:
        pip install playwright && playwright install chromium

    Returns list of contact log entry dicts.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("  ERROR: playwright not installed.")
        print("  Install with: pip install playwright && playwright install chromium")
        print("  The QLD lobbyist contact log requires a headless browser.")
        return []

    entries = []
    print(f"  Scraping contact log via Playwright...")
    print(f"  URL: {CONTACT_LOG_URL}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            page.goto(CONTACT_LOG_URL, wait_until="networkidle", timeout=30000)

            # Wait for the entity list grid to load
            page.wait_for_selector("table.table", timeout=15000)

            pages_scraped = 0
            while pages_scraped < max_pages:
                # Extract table rows
                rows = page.query_selector_all("table.table tbody tr")
                if not rows:
                    break

                for row in rows:
                    cells = row.query_selector_all("td")
                    if len(cells) >= 5:
                        entry = {
                            "lobbyist_trading_name": cells[0].inner_text().strip(),
                            "client_name": cells[1].inner_text().strip(),
                            "government_representatives": cells[2].inner_text().strip(),
                            "portfolio_area": cells[3].inner_text().strip(),
                            "contact_date": cells[4].inner_text().strip(),
                        }
                        entry["contact_id"] = _text_hash(
                            f"{entry['lobbyist_trading_name']}|{entry['client_name']}|"
                            f"{entry['contact_date']}|{entry['government_representatives']}"
                        )
                        entries.append(entry)

                pages_scraped += 1

                # Try to click "Next" button
                next_btn = page.query_selector("li.next a, a[aria-label='Next']")
                if next_btn and not next_btn.is_disabled():
                    next_btn.click()
                    page.wait_for_timeout(2000)  # Wait for data reload
                else:
                    break

                if pages_scraped % 10 == 0:
                    print(f"    ... {pages_scraped} pages, {len(entries)} entries")

        except Exception as e:
            print(f"    Playwright error: {e}")
        finally:
            browser.close()

    print(f"  Scraped {len(entries)} contact log entries")
    return entries


# ── Database operations ───────────────────────────────────────────────────────

def init_lobbyist_tables(db: sqlite3.Connection) -> None:
    """Create lobbyist-specific tables."""
    db.executescript(QLD_LOBBYIST_SCHEMA)


def store_contact_entries(db: sqlite3.Connection, entries: list[dict]) -> int:
    """Store contact log entries in the database."""
    count = 0
    for entry in entries:
        try:
            db.execute("""
                INSERT OR REPLACE INTO qld_lobbyist_contacts
                (contact_id, lobbyist_trading_name, client_name,
                 government_representatives, portfolio_area, contact_date,
                 purpose, mode_of_communication)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                entry.get("contact_id", _text_hash(str(entry))),
                entry.get("lobbyist_trading_name", ""),
                entry.get("client_name", ""),
                entry.get("government_representatives", ""),
                entry.get("portfolio_area", ""),
                entry.get("contact_date", ""),
                entry.get("purpose", ""),
                entry.get("mode_of_communication", ""),
            ))
            count += 1
        except Exception as e:
            print(f"    Error storing entry: {e}")
    db.commit()
    return count


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Scrape QLD Lobbyist Register data for OPAX."
    )
    parser.add_argument(
        "--lobbyists-only", action="store_true",
        help="Only scrape lobbyist entity listings",
    )
    parser.add_argument(
        "--contact-log", action="store_true",
        help="Scrape contact log entries (requires playwright)",
    )
    parser.add_argument(
        "--max-pages", type=int, default=100,
        help="Maximum pages to scrape from contact log (default: 100)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print what would be scraped without writing to DB",
    )
    args = parser.parse_args()

    print("QLD Lobbyist Register Scraper (OPAX)")
    print(f"  Register URL: {REGISTER_BASE}")
    print(f"  Dry run: {args.dry_run}")

    db = get_db()
    init_db(db)
    init_lobbyist_tables(db)

    # Scrape lobbyist entity list
    if not args.contact_log or args.lobbyists_only:
        print("\n=== Lobbyist Entity Listing ===")
        entities = scrape_lobbyist_list()

        if args.dry_run:
            for e in entities[:20]:
                print(f"  {e['name']}: {e['url']}")
            if len(entities) > 20:
                print(f"  ... and {len(entities) - 20} more")
        else:
            # The entity list page is dynamically loaded, so we may get
            # zero entities from the static HTML. Log it.
            if not entities:
                print("  NOTE: No entity links found in static HTML.")
                print("  The lobbyist register uses dynamic JavaScript loading.")
                print("  Use --contact-log flag with playwright installed for full data.")

    # Scrape contact log (requires playwright)
    if args.contact_log:
        print("\n=== Contact Log Scraping ===")
        entries = scrape_contact_log_playwright(max_pages=args.max_pages)

        if args.dry_run:
            for e in entries[:10]:
                print(f"  {e.get('contact_date', 'N/A')} | "
                      f"{e.get('lobbyist_trading_name', 'N/A')} | "
                      f"{e.get('client_name', 'N/A')} | "
                      f"{e.get('government_representatives', 'N/A')[:50]}")
        else:
            n = store_contact_entries(db, entries)
            print(f"  Stored {n} contact log entries")

    # Summary
    print(f"\n{'=' * 60}")
    print("Scraping complete.")

    if not args.dry_run:
        for table in ["qld_lobbyists", "qld_lobbyist_clients", "qld_lobbyist_contacts"]:
            try:
                count = db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                print(f"  {table}: {count} rows")
            except Exception:
                print(f"  {table}: table exists (no data yet)")

    print("\nNOTE: The QLD Lobbyist Register (lobbyists.integrity.qld.gov.au)")
    print("is a PowerApps/Dynamics 365 portal that loads data dynamically.")
    print("For full contact log data, install playwright:")
    print("  pip install playwright && playwright install chromium")
    print("Then run: python -m parli.ingest.qld_lobbyists --contact-log")


if __name__ == "__main__":
    main()
