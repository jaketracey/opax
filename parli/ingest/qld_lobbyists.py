"""
parli.ingest.qld_lobbyists -- Scrape QLD Integrity Commissioner Lobbyist Register.

Data source: https://lobbyists.integrity.qld.gov.au/
Entity: dpc_contactlog (Dataverse/PowerApps portal)

The QLD Lobbyist Register is built on Microsoft PowerApps/Dynamics 365 Portal.
The register's activity grid is loaded by client-side JavaScript. Fetch only
static records exposed to the honest HTTP agent. If a complete table is not
available, pause the contact-log source and keep its last good data.

The contact log search page at:
  https://lobbyists.integrity.qld.gov.au/Lobbying-Register/Search-lobbying-activity/
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
    python -m parli.ingest.qld_lobbyists --contact-log
"""

from parli.ingest import http as source_http

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
USER_AGENT = source_http.USER_AGENT
REQUEST_DELAY = 1.0
MAX_RETRIES = 3

CACHE_DIR = Path("~/.cache/autoresearch/qld_lobbyists").expanduser()

# Known lobbyist entity search page URLs
ENTITY_SEARCH_URL = f"{REGISTER_BASE}/lobbying-register/search-entities/"
LOBBYIST_SEARCH_URL = f"{REGISTER_BASE}/lobbying-register/search-lobbyists/"
CONTACT_LOG_URL = f"{REGISTER_BASE}/Lobbying-Register/Search-lobbying-activity/"

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
    req = source_http.Request(url, headers={
        "User-Agent": source_http.USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
    })
    for attempt in range(MAX_RETRIES):
        try:
            time.sleep(REQUEST_DELAY)
            with source_http.urlopen(req, timeout=60) as resp:
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


# ── Contact log scraping through the honest transport ────────────────────────

def scrape_contact_log(start_date: str | None = None, max_pages: int = 100) -> list[dict]:
    """Acquire a complete static contact log, or preserve the retained snapshot."""
    from bs4 import BeautifulSoup
    from urllib.parse import urljoin, urlsplit

    entries, seen = [], set()
    url = CONTACT_LOG_URL
    for _ in range(max_pages):
        if url in seen:
            raise source_http.SourceRefused(CONTACT_LOG_URL, "contact-log pagination is incomplete")
        seen.add(url)
        response = source_http.get(url, headers={"Accept": "text/html"})
        if not response.ok:
            raise source_http.SourceRefused(url, f"HTTP {response.status_code}; contact log unavailable")
        soup = BeautifulSoup(response.content, "html.parser")
        rows = soup.select("table.table tbody tr")
        if not rows:
            raise source_http.SourceRefused(url, "no complete static contact log exposed to the honest agent; permission requested")
        for row in rows:
            cells = row.find_all("td")
            if len(cells) < 5:
                raise source_http.SourceRefused(url, "contact-log table is incomplete")
            entry = dict(zip(("lobbyist_trading_name", "client_name", "government_representatives",
                              "portfolio_area", "contact_date"), (c.get_text(strip=True) for c in cells[:5])))
            entry["contact_id"] = _text_hash("|".join(entry.values()))
            entries.append(entry)
        following = soup.select_one("li.next:not(.disabled) a, a[aria-label='Next']:not([aria-disabled='true'])")
        if not following:
            return entries
        href = following.get("href", "")
        next_url = urljoin(url, href)
        if not href or href.startswith(("#", "javascript:")) or urlsplit(next_url).netloc != urlsplit(CONTACT_LOG_URL).netloc:
            raise source_http.SourceRefused(url, "contact-log next page is not available through direct HTTP")
        url = next_url
    raise source_http.SourceRefused(CONTACT_LOG_URL, "contact-log page limit reached; existing data kept")


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
        help="Fetch static contact log entries with the honest agent",
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
                print("  Existing registration data kept; no static entity list available.")

    # Acquire the contact log before storing anything.
    if args.contact_log:
        print("\n=== Contact Log Scraping ===")
        entries = scrape_contact_log(max_pages=args.max_pages)

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
    print("Contact-log data refreshes only when a complete static table is available.")


if __name__ == "__main__":
    main()
