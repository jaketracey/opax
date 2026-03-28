"""
parli.ingest.ministerial_diaries -- Scrape Australian ministerial diary disclosures.

Ministerial diaries show who government ministers meet with -- crucial for
tracking lobbying influence and donor access.

Currently supports:
  - QLD: Monthly PDF diaries published at cabinet.qld.gov.au
  - NSW: Stub for future implementation

QLD diary structure:
  Each minister has a page at cabinet.qld.gov.au/ministers-portfolios/{slug}.aspx
  with links to monthly PDF diaries. PDFs contain tables with columns:
    Date of Meeting | Name of Organisation/s or Person/s | Purpose of Meeting

Usage:
    # Scrape all current QLD ministers
    python -m parli.ingest.ministerial_diaries

    # Scrape a specific minister
    python -m parli.ingest.ministerial_diaries --minister david-crisafulli

    # Scrape former government period
    python -m parli.ingest.ministerial_diaries --period 2020-2024

    # Cross-reference meetings with donations
    python -m parli.ingest.ministerial_diaries --cross-reference

    # Dry run (don't write to DB)
    python -m parli.ingest.ministerial_diaries --dry-run
"""

import argparse
import io
import json
import re
import sqlite3
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import requests

from parli.schema import get_db, init_db

# ── Configuration ─────────────────────────────────────────────────────────────

CABINET_BASE = "https://cabinet.qld.gov.au"
MINISTERS_URL = f"{CABINET_BASE}/ministers-portfolios.aspx"
USER_AGENT = "Mozilla/5.0 (compatible; OPAX/1.0; +https://opax.com.au)"
REQUEST_DELAY = 1.0  # seconds between requests
MAX_RETRIES = 3

CACHE_DIR = Path("~/.cache/autoresearch/ministerial_diaries/qld").expanduser()

# Former government pages
FORMER_GOVERNMENTS = {
    "2020-2024": f"{CABINET_BASE}/ministers-portfolios/cabinet-2020-2024.aspx",
    "2017-2020": f"{CABINET_BASE}/ministers-portfolios/cabinet-2017-2020.aspx",
    "2015-2017": f"{CABINET_BASE}/ministers-portfolios/cabinet-2015-2017.aspx",
    "2013-2015": f"{CABINET_BASE}/ministers-portfolios/cabinet-2013-2015.aspx",
}

# Month names for URL construction
MONTHS = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
]


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _get(url: str, binary: bool = False) -> Optional[bytes | str]:
    """Fetch a URL with retries and rate limiting."""
    headers = {"User-Agent": USER_AGENT}
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, headers=headers, timeout=30)
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            time.sleep(REQUEST_DELAY)
            return resp.content if binary else resp.text
        except requests.RequestException as e:
            if attempt < MAX_RETRIES - 1:
                wait = 2 ** (attempt + 1)
                print(f"  Retry {attempt+1}/{MAX_RETRIES} for {url}: {e}, waiting {wait}s")
                time.sleep(wait)
            else:
                print(f"  FAILED: {url}: {e}")
                return None
    return None


# ── QLD minister discovery ────────────────────────────────────────────────────

def discover_qld_ministers(period: Optional[str] = None) -> list[dict]:
    """Scrape the QLD cabinet page to find all ministers and their page slugs."""
    from bs4 import BeautifulSoup

    url = FORMER_GOVERNMENTS.get(period, MINISTERS_URL) if period else MINISTERS_URL
    print(f"[qld] Fetching minister listing from {url}")
    html = _get(url)
    if not html:
        print("[qld] ERROR: Could not fetch ministers page")
        return []

    soup = BeautifulSoup(html, "html.parser")
    ministers = []

    # Minister links follow pattern: /ministers-portfolios/{slug}.aspx
    for link in soup.find_all("a", href=True):
        href = link["href"]
        if "ministers-portfolios/" in href and href.endswith(".aspx"):
            # Skip navigation/archive links
            slug_match = re.search(r"ministers-portfolios/([a-z][a-z0-9-]+)\.aspx", href)
            if not slug_match:
                continue
            slug = slug_match.group(1)
            # Skip known non-minister pages
            if slug.startswith("cabinet-") or slug in ("index",):
                continue

            name = link.get_text(strip=True)
            if not name or len(name) < 3:
                continue

            # Clean up name: remove "Hon", "MP", titles
            clean_name = re.sub(r"\b(Hon|MP|Dr|Professor|Prof)\b", "", name).strip()
            clean_name = re.sub(r"\s+", " ", clean_name)

            ministers.append({
                "slug": slug,
                "name": name,
                "clean_name": clean_name,
                "url": f"{CABINET_BASE}/ministers-portfolios/{slug}.aspx",
            })

    # Deduplicate by slug
    seen = set()
    unique = []
    for m in ministers:
        if m["slug"] not in seen:
            seen.add(m["slug"])
            unique.append(m)

    print(f"[qld] Found {len(unique)} ministers")
    return unique


def discover_diary_links(minister_url: str) -> list[dict]:
    """Scrape a minister's page to find all diary PDF links."""
    from bs4 import BeautifulSoup

    html = _get(minister_url)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    diaries = []

    for link in soup.find_all("a", href=True):
        href = link["href"]
        # Strip query string before checking extension
        href_clean = href.split("?")[0]
        if "diary" in href.lower() and href_clean.lower().endswith(".pdf"):
            # Resolve relative URLs
            if href.startswith("/"):
                full_url = f"{CABINET_BASE}{href}"
            elif href.startswith("http"):
                full_url = href
            else:
                # Relative to minister page directory
                base_dir = minister_url.rsplit("/", 1)[0]
                full_url = f"{base_dir}/{href}"

            # Strip query string for caching/dedup
            clean_url = full_url.split("?")[0]

            # Try to extract year/month from URL
            year_match = re.search(r"/(\d{4})/", href)
            month_match = re.search(r"/(" + "|".join(MONTHS) + r")/", href, re.IGNORECASE)

            year = int(year_match.group(1)) if year_match else None
            month = month_match.group(1).lower() if month_match else None

            link_text = link.get_text(strip=True)

            diaries.append({
                "url": clean_url,
                "full_url": full_url,
                "year": year,
                "month": month,
                "link_text": link_text,
            })

    return diaries


# ── PDF parsing ───────────────────────────────────────────────────────────────

def parse_diary_pdf(pdf_bytes: bytes, minister_name: str, source_url: str) -> list[dict]:
    """Extract meeting entries from a QLD ministerial diary PDF.

    QLD diary PDFs contain tables with variable column structures:
    - 3-col: Date | Organisation | Purpose
    - More cols with None padding (pdfplumber artifact)

    Multi-line rows have None in the date column for continuation lines.
    """
    import pdfplumber

    meetings = []
    current_date = None
    current_org_parts = []
    current_purpose_parts = []

    try:
        pdf = pdfplumber.open(io.BytesIO(pdf_bytes))
    except Exception as e:
        print(f"  ERROR parsing PDF: {e}")
        return []

    for page in pdf.pages:
        tables = page.extract_tables()
        if not tables:
            continue

        for table in tables:
            for row in table:
                if not row:
                    continue

                # Filter out None values to get actual cell contents
                cells = [c for c in row if c is not None]

                if not cells:
                    continue

                # Skip header rows
                if any("date of meeting" in str(c).lower() for c in cells if c):
                    continue
                if any("name of organisation" in str(c).lower() for c in cells if c):
                    continue

                # Determine if this is a new entry (has a date) or continuation
                first_cell = str(cells[0]).strip() if cells[0] else ""

                # Check if first cell looks like a date
                is_date = bool(re.match(r"\d{1,2}\s+\w+\s+\d{4}", first_cell))

                if is_date:
                    # Save previous entry if exists
                    if current_date and (current_org_parts or current_purpose_parts):
                        meetings.append(_make_meeting(
                            current_date, current_org_parts, current_purpose_parts,
                            minister_name, source_url
                        ))

                    # Start new entry
                    current_date = first_cell
                    current_org_parts = []
                    current_purpose_parts = []

                    if len(cells) >= 3:
                        current_org_parts.append(cells[1].strip())
                        current_purpose_parts.append(cells[-1].strip())
                    elif len(cells) == 2:
                        # Could be org or purpose
                        current_org_parts.append(cells[1].strip())
                else:
                    # Continuation row -- append to current entry
                    if not current_date:
                        continue
                    for c in cells:
                        text = str(c).strip()
                        if not text:
                            continue
                        # Heuristic: short text is likely purpose, long is org
                        # But mostly continuations are org names
                        current_org_parts.append(text)

            # After each page, check for entries spanning page boundary
            # (don't flush -- the next page might continue)

    # Flush last entry
    if current_date and (current_org_parts or current_purpose_parts):
        meetings.append(_make_meeting(
            current_date, current_org_parts, current_purpose_parts,
            minister_name, source_url
        ))

    pdf.close()
    return meetings


def _make_meeting(
    date_str: str,
    org_parts: list[str],
    purpose_parts: list[str],
    minister_name: str,
    source_url: str,
) -> dict:
    """Construct a meeting dict from parsed parts."""
    # Parse date
    parsed_date = None
    try:
        parsed_date = datetime.strptime(date_str.strip(), "%d %B %Y").strftime("%Y-%m-%d")
    except ValueError:
        try:
            parsed_date = datetime.strptime(date_str.strip(), "%d %b %Y").strftime("%Y-%m-%d")
        except ValueError:
            parsed_date = date_str.strip()

    # Join multi-line org/purpose, cleaning up
    org_text = " ".join(org_parts).strip()
    org_text = re.sub(r"\s+", " ", org_text)

    purpose_text = " ".join(purpose_parts).strip()
    purpose_text = re.sub(r"\s+", " ", purpose_text)

    # If purpose ended up in org (common when table parsing is messy),
    # try to split on known purpose keywords
    if not purpose_text and org_text:
        # Check if the last part looks like a purpose
        for part in reversed(org_parts):
            part = part.strip()
            if part and len(part) < 80 and not any(
                title in part for title in ["MP,", "Hon ", "Director", "CEO", "Minister"]
            ):
                purpose_text = part
                org_text = org_text.replace(part, "").strip().rstrip(",").strip()
                break

    return {
        "minister_name": minister_name,
        "meeting_date": parsed_date,
        "organisation": org_text,
        "purpose": purpose_text,
        "source_url": source_url,
        "state": "qld",
    }


# ── Improved PDF parsing using text extraction ────────────────────────────────

def parse_diary_pdf_v2(pdf_bytes: bytes, minister_name: str, source_url: str) -> list[dict]:
    """Alternative parser: extract tables more carefully with pdfplumber.

    This version handles the variable column widths better by looking at
    all cells in each row and using the date column as the anchor.
    """
    import pdfplumber

    meetings = []

    try:
        pdf = pdfplumber.open(io.BytesIO(pdf_bytes))
    except Exception as e:
        print(f"  ERROR parsing PDF: {e}")
        return []

    current_date = None
    current_org = ""
    current_purpose = ""

    for page_num, page in enumerate(pdf.pages):
        tables = page.extract_tables()
        if not tables:
            continue

        for table in tables:
            for row in table:
                if not row:
                    continue

                # Skip headers
                row_text = " ".join(str(c) for c in row if c)
                if "date of meeting" in row_text.lower():
                    continue

                # Get non-None cells
                cells = [str(c).strip() if c else "" for c in row]

                # Remove empty trailing cells
                while cells and not cells[-1]:
                    cells.pop()

                if not cells or not any(cells):
                    continue

                # Check if first non-empty cell is a date
                first_nonempty = next((c for c in cells if c), "")
                is_new_date = bool(re.match(r"\d{1,2}\s+\w+\s+\d{4}", first_nonempty))

                if is_new_date:
                    # Save previous entry
                    if current_date and current_org:
                        meetings.append(_make_meeting_v2(
                            current_date, current_org, current_purpose,
                            minister_name, source_url
                        ))

                    current_date = first_nonempty
                    # Find org and purpose from remaining cells
                    remaining = [c for c in cells if c and c != first_nonempty]
                    if len(remaining) >= 2:
                        current_org = remaining[0]
                        current_purpose = remaining[-1]
                    elif len(remaining) == 1:
                        current_org = remaining[0]
                        current_purpose = ""
                    else:
                        current_org = ""
                        current_purpose = ""
                else:
                    # Continuation -- append non-empty cells to org
                    # (purpose rarely spans multiple rows)
                    nonempty = [c for c in cells if c]
                    if nonempty and current_date:
                        # Last cell might be purpose if it differs from org pattern
                        current_org += " " + " ".join(nonempty)

    # Flush last entry
    if current_date and current_org:
        meetings.append(_make_meeting_v2(
            current_date, current_org, current_purpose,
            minister_name, source_url
        ))

    pdf.close()
    return meetings


def _make_meeting_v2(
    date_str: str, org: str, purpose: str,
    minister_name: str, source_url: str,
) -> dict:
    """Construct meeting dict, cleaning up text."""
    parsed_date = None
    try:
        parsed_date = datetime.strptime(date_str.strip(), "%d %B %Y").strftime("%Y-%m-%d")
    except ValueError:
        parsed_date = date_str.strip()

    org = re.sub(r"\s+", " ", org).strip()
    purpose = re.sub(r"\s+", " ", purpose).strip()

    return {
        "minister_name": minister_name,
        "meeting_date": parsed_date,
        "organisation": org,
        "purpose": purpose,
        "source_url": source_url,
        "state": "qld",
    }


# ── Database operations ───────────────────────────────────────────────────────

def store_meetings(db: sqlite3.Connection, meetings: list[dict]) -> int:
    """Insert meetings into the database, skipping duplicates.
    Retries on database lock with exponential backoff."""
    inserted = 0
    max_retries = 5
    for m in meetings:
        for attempt in range(max_retries):
            try:
                db.execute("""
                    INSERT INTO ministerial_meetings
                        (minister_name, meeting_date, organisation, attendee_name,
                         purpose, portfolio, state, source_url)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    m["minister_name"],
                    m["meeting_date"],
                    m["organisation"],
                    m.get("attendee_name"),
                    m["purpose"],
                    m.get("portfolio"),
                    m.get("state", "qld"),
                    m["source_url"],
                ))
                inserted += 1
                break
            except sqlite3.IntegrityError:
                break
            except sqlite3.OperationalError as e:
                if "locked" in str(e) and attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                else:
                    raise
    for attempt in range(max_retries):
        try:
            db.commit()
            break
        except sqlite3.OperationalError as e:
            if "locked" in str(e) and attempt < max_retries - 1:
                time.sleep(2 ** attempt)
            else:
                raise
    return inserted


def link_ministers_to_members(db: sqlite3.Connection) -> int:
    """Try to match minister_name to members.person_id using fuzzy name matching."""
    unlinked = db.execute("""
        SELECT DISTINCT minister_name FROM ministerial_meetings
        WHERE person_id IS NULL
    """).fetchall()

    linked = 0
    for row in unlinked:
        name = row["minister_name"]
        # Try exact match on full_name
        member = db.execute(
            "SELECT person_id FROM members WHERE full_name = ? LIMIT 1",
            (name,)
        ).fetchone()

        if not member:
            # Try matching last name + first initial
            parts = name.split()
            if len(parts) >= 2:
                last = parts[-1]
                first_initial = parts[0][0]
                member = db.execute(
                    "SELECT person_id FROM members WHERE last_name = ? AND first_name LIKE ? LIMIT 1",
                    (last, f"{first_initial}%")
                ).fetchone()

        if member:
            db.execute(
                "UPDATE ministerial_meetings SET person_id = ? WHERE minister_name = ?",
                (member["person_id"], name)
            )
            linked += 1

    db.commit()
    return linked


# ── Cross-referencing ─────────────────────────────────────────────────────────

def cross_reference_donations(db: sqlite3.Connection) -> list[dict]:
    """Find organisations that both met ministers AND donated to parties.

    Uses fuzzy matching on organisation names vs donor names.
    Returns list of matches and stores in analysis_cache.
    """
    print("[xref] Cross-referencing ministerial meetings with donations...")

    # Get unique organisations from meetings
    orgs = db.execute("""
        SELECT DISTINCT organisation FROM ministerial_meetings
        WHERE organisation IS NOT NULL AND organisation != ''
    """).fetchall()

    # Get unique donors
    donors = db.execute("""
        SELECT DISTINCT donor_name, recipient, SUM(amount) as total_donated
        FROM donations
        GROUP BY donor_name, recipient
    """).fetchall()

    # Build donor lookup (normalised name -> records)
    donor_lookup = {}
    for d in donors:
        norm = _normalise_org_name(d["donor_name"])
        if norm not in donor_lookup:
            donor_lookup[norm] = []
        donor_lookup[norm].append({
            "donor_name": d["donor_name"],
            "recipient": d["recipient"],
            "total_donated": d["total_donated"],
        })

    matches = []
    for org_row in orgs:
        org = org_row["organisation"]
        norm_org = _normalise_org_name(org)

        # Check exact normalised match
        if norm_org in donor_lookup:
            for donor in donor_lookup[norm_org]:
                # Get meeting details
                meetings = db.execute("""
                    SELECT minister_name, meeting_date, purpose
                    FROM ministerial_meetings
                    WHERE organisation = ?
                    ORDER BY meeting_date DESC LIMIT 10
                """, (org,)).fetchall()

                matches.append({
                    "organisation": org,
                    "donor_name": donor["donor_name"],
                    "recipient_party": donor["recipient"],
                    "total_donated": donor["total_donated"],
                    "meetings": [
                        {"minister": m["minister_name"], "date": m["meeting_date"],
                         "purpose": m["purpose"]}
                        for m in meetings
                    ],
                    "match_type": "exact",
                })
            continue

        # Check substring match (org name contained in donor name or vice versa)
        # Require minimum 10 chars to avoid false positives on short names
        for norm_donor, donor_list in donor_lookup.items():
            if len(norm_org) < 10 or len(norm_donor) < 10:
                continue
            # Skip if either looks like a person name (contains MP, Hon, Minister)
            if any(x in org.lower() for x in ["mp,", "hon ", "minister", "ministerial staff"]):
                continue
            if norm_org in norm_donor or norm_donor in norm_org:
                meetings = db.execute("""
                    SELECT minister_name, meeting_date, purpose
                    FROM ministerial_meetings
                    WHERE organisation = ?
                    ORDER BY meeting_date DESC LIMIT 10
                """, (org,)).fetchall()

                for donor in donor_list:
                    matches.append({
                        "organisation": org,
                        "donor_name": donor["donor_name"],
                        "recipient_party": donor["recipient"],
                        "total_donated": donor["total_donated"],
                        "meetings": [
                            {"minister": m["minister_name"], "date": m["meeting_date"],
                             "purpose": m["purpose"]}
                            for m in meetings
                        ],
                        "match_type": "substring",
                    })

    # Also cross-reference with contracts
    contract_matches = cross_reference_contracts(db)

    result = {
        "donation_matches": matches,
        "contract_matches": contract_matches,
        "generated_at": datetime.now().isoformat(),
    }

    # Store in analysis_cache
    db.execute("""
        INSERT OR REPLACE INTO analysis_cache (key, value, updated_at)
        VALUES ('ministerial_meeting_xref', ?, datetime('now'))
    """, (json.dumps(result, default=str),))
    db.commit()

    print(f"[xref] Found {len(matches)} donation matches, {len(contract_matches)} contract matches")
    return matches


def cross_reference_contracts(db: sqlite3.Connection) -> list[dict]:
    """Find organisations that met ministers AND won government contracts."""
    # Check if contracts table has data
    count = db.execute("SELECT COUNT(*) AS c FROM contracts").fetchone()["c"]
    if count == 0:
        print("[xref] No contracts data available, skipping contract cross-reference")
        return []

    orgs = db.execute("""
        SELECT DISTINCT organisation FROM ministerial_meetings
        WHERE organisation IS NOT NULL AND organisation != ''
    """).fetchall()

    matches = []
    for org_row in orgs:
        org = org_row["organisation"]
        norm_org = _normalise_org_name(org)

        # Search contracts by supplier name
        contracts = db.execute("""
            SELECT contract_id, title, supplier_name, agency, amount, start_date
            FROM contracts
            WHERE LOWER(supplier_name) LIKE ?
            ORDER BY amount DESC LIMIT 10
        """, (f"%{norm_org}%",)).fetchall()

        if contracts:
            meetings = db.execute("""
                SELECT minister_name, meeting_date, purpose
                FROM ministerial_meetings WHERE organisation = ?
                ORDER BY meeting_date DESC LIMIT 10
            """, (org,)).fetchall()

            for c in contracts:
                matches.append({
                    "organisation": org,
                    "supplier_name": c["supplier_name"],
                    "contract_title": c["title"],
                    "contract_amount": c["amount"],
                    "agency": c["agency"],
                    "contract_start": c["start_date"],
                    "meetings": [
                        {"minister": m["minister_name"], "date": m["meeting_date"],
                         "purpose": m["purpose"]}
                        for m in meetings
                    ],
                })

    return matches


def _normalise_org_name(name: str) -> str:
    """Normalise an organisation name for fuzzy matching."""
    name = name.lower().strip()
    # Remove common suffixes
    for suffix in ["pty ltd", "pty. ltd.", "limited", "ltd", "inc", "incorporated",
                   "australia", "group", "holdings"]:
        name = name.replace(suffix, "")
    # Remove punctuation
    name = re.sub(r"[^a-z0-9\s]", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


# ── Main scraper orchestration ────────────────────────────────────────────────

def scrape_qld(
    db: sqlite3.Connection,
    minister_slug: Optional[str] = None,
    period: Optional[str] = None,
    dry_run: bool = False,
) -> int:
    """Scrape QLD ministerial diaries and store in database.

    Args:
        db: Database connection
        minister_slug: If set, only scrape this minister
        period: Government period like '2020-2024' (default: current)
        dry_run: If True, parse but don't write to DB

    Returns:
        Total number of meetings ingested
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    ministers = discover_qld_ministers(period)
    if minister_slug:
        ministers = [m for m in ministers if m["slug"] == minister_slug]
        if not ministers:
            print(f"[qld] Minister '{minister_slug}' not found")
            return 0

    total_meetings = 0
    total_pdfs = 0

    for minister in ministers:
        print(f"\n[qld] Processing: {minister['name']} ({minister['slug']})")
        diary_links = discover_diary_links(minister["url"])
        print(f"  Found {len(diary_links)} diary PDFs")

        for diary in diary_links:
            url = diary["full_url"]
            label = f"{diary.get('month', '?')}/{diary.get('year', '?')}"

            # Check if we already have meetings from this URL
            if not dry_run:
                existing = db.execute(
                    "SELECT COUNT(*) AS c FROM ministerial_meetings WHERE source_url = ?",
                    (diary["url"],)
                ).fetchone()["c"]
                if existing > 0:
                    print(f"  Skip {label}: already have {existing} meetings")
                    continue

            # Check cache
            cache_file = CACHE_DIR / f"{minister['slug']}_{diary.get('year', 'unk')}_{diary.get('month', 'unk')}.pdf"

            if cache_file.exists():
                pdf_bytes = cache_file.read_bytes()
            else:
                print(f"  Downloading {label}: {url}")
                pdf_bytes = _get(url, binary=True)
                if not pdf_bytes:
                    print(f"  SKIP {label}: download failed")
                    continue
                cache_file.write_bytes(pdf_bytes)

            # Parse PDF
            meetings = parse_diary_pdf_v2(pdf_bytes, minister["clean_name"], diary["url"])
            if not meetings:
                # Fallback to v1 parser
                meetings = parse_diary_pdf(pdf_bytes, minister["clean_name"], diary["url"])

            print(f"  Parsed {label}: {len(meetings)} meetings")
            total_pdfs += 1

            if dry_run:
                for m in meetings[:3]:
                    print(f"    {m['meeting_date']} | {m['organisation'][:60]} | {m['purpose'][:40]}")
                if len(meetings) > 3:
                    print(f"    ... and {len(meetings)-3} more")
            else:
                n = store_meetings(db, meetings)
                print(f"  Stored {n} new meetings")
                total_meetings += n

    print(f"\n[qld] Done: {total_pdfs} PDFs processed, {total_meetings} meetings stored")
    return total_meetings


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Scrape Australian ministerial diary disclosures"
    )
    parser.add_argument(
        "--minister", type=str, default=None,
        help="Only scrape this minister (slug, e.g. 'david-crisafulli')"
    )
    parser.add_argument(
        "--period", type=str, default=None,
        help="Government period (e.g. '2020-2024'). Default: current government"
    )
    parser.add_argument(
        "--cross-reference", action="store_true",
        help="After scraping, cross-reference meetings with donations and contracts"
    )
    parser.add_argument(
        "--cross-reference-only", action="store_true",
        help="Only run cross-referencing (skip scraping)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Parse PDFs but don't write to database"
    )
    args = parser.parse_args()

    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")
    init_db(db)

    if not args.cross_reference_only:
        total = scrape_qld(
            db,
            minister_slug=args.minister,
            period=args.period,
            dry_run=args.dry_run,
        )
        print(f"\nTotal meetings ingested: {total}")

        if not args.dry_run:
            linked = link_ministers_to_members(db)
            print(f"Linked {linked} ministers to member records")

    if args.cross_reference or args.cross_reference_only:
        matches = cross_reference_donations(db)
        if matches:
            print(f"\n{'='*70}")
            print("TOP DONOR-MEETING MATCHES")
            print(f"{'='*70}")
            # Sort by donation amount
            sorted_matches = sorted(matches, key=lambda x: x.get("total_donated") or 0, reverse=True)
            for m in sorted_matches[:20]:
                print(f"  {m['organisation']}")
                print(f"    Donated ${m['total_donated']:,.0f} to {m['recipient_party']}")
                print(f"    Met with: {', '.join(set(mt['minister'] for mt in m['meetings']))}")
                print()

    # Print summary stats
    if not args.dry_run:
        stats = db.execute("""
            SELECT
                COUNT(*) as total_meetings,
                COUNT(DISTINCT minister_name) as ministers,
                MIN(meeting_date) as earliest,
                MAX(meeting_date) as latest
            FROM ministerial_meetings
            WHERE state = 'qld'
        """).fetchone()
        print(f"\nQLD Diary Stats:")
        print(f"  Total meetings: {stats['total_meetings']}")
        print(f"  Ministers: {stats['ministers']}")
        print(f"  Date range: {stats['earliest']} to {stats['latest']}")


if __name__ == "__main__":
    main()
