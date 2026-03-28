"""
parli.ingest.anao -- Scrape Australian National Audit Office (ANAO) reports.

ANAO performance audits expose waste, mismanagement, and corruption in
government agencies. This scraper collects report metadata, executive
summaries, findings, and recommendations from the ANAO website.

After ingestion, cross-references audited agencies against:
  - AusTender contracts awarded by those agencies
  - Political donations from companies contracting with those agencies

Usage:
    python -m parli.ingest.anao
    python -m parli.ingest.anao --limit 50
    python -m parli.ingest.anao --pages 5
    python -m parli.ingest.anao --audit-type financial
"""

import argparse
import json
import re
import subprocess
import time
from datetime import datetime

from bs4 import BeautifulSoup

from parli.schema import get_db, init_db

BASE_URL = "https://www.anao.gov.au"

USER_AGENT = "Mozilla/5.0 (compatible; OPAX/1.0)"


def fetch_url(url: str, timeout: int = 120) -> str | None:
    """Fetch a URL using curl (works reliably with ANAO's Akamai CDN).

    Python requests times out against this CDN, but curl handles it fine.
    """
    try:
        result = subprocess.run(
            ["curl", "-s", "--max-time", str(timeout), "-A", USER_AGENT, url],
            capture_output=True, text=True, timeout=timeout + 10,
        )
        if result.returncode == 0 and result.stdout:
            return result.stdout
        return None
    except (subprocess.TimeoutExpired, Exception) as e:
        print(f"  curl error for {url}: {e}")
        return None

# Mapping from URL path segment to our audit_type field
AUDIT_TYPE_MAP = {
    "performance-audit": "performance",
    "financial-statement-audit": "financial",
    "performance-statements-audit": "compliance",
}

# Listing page URL patterns per audit type
LISTING_URLS = {
    "performance": "/pubs/performance-audit",
    "financial": "/pubs/financial-statement-audit",
    "compliance": "/pubs/performance-statements-audit",
}


def parse_date(date_str: str) -> str | None:
    """Parse ANAO date strings like 'Published: Wednesday 18 March 2026' to ISO date."""
    if not date_str:
        return None
    # Strip prefix
    date_str = re.sub(r"^Published:\s*", "", date_str.strip())
    # Remove day name
    date_str = re.sub(r"^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+", "", date_str)
    for fmt in ("%d %B %Y", "%d %b %Y", "%B %Y"):
        try:
            return datetime.strptime(date_str.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def parse_report_number(text: str) -> str | None:
    """Extract report number from text like '(Auditor-General Report No. 25 of 2025-26)'."""
    if not text:
        return None
    m = re.search(r"No\.?\s*(\d+)\s+of\s+([\d–\-]+)", text)
    if m:
        return f"No. {m.group(1)} of {m.group(2)}"
    return text.strip("() ")


def scrape_listing_page(audit_type: str = "performance", page: int = 0, per_page: int = 60) -> list[dict]:
    """Scrape one page of the ANAO audit listing.

    Returns list of dicts with keys: title, url, date, report_number, summary, audit_type.
    """
    path = LISTING_URLS.get(audit_type, LISTING_URLS["performance"])
    url = f"{BASE_URL}{path}?items_per_page={per_page}&page={page}"
    print(f"  Fetching listing: {url}")

    html = fetch_url(url)
    if not html:
        print(f"  Failed to fetch listing page {page}")
        return []

    soup = BeautifulSoup(html, "html.parser")
    rows = soup.find_all("div", class_="views-row")
    results = []

    for row in rows:
        item = {"audit_type": audit_type}

        # Report number
        rn_span = row.find(class_="report_no_text")
        if rn_span:
            item["report_number"] = parse_report_number(rn_span.get_text(strip=True))

        # Date
        date_span = row.find(class_="report_date")
        if date_span:
            item["date"] = parse_date(date_span.get_text(strip=True))

        # Title + URL
        h2 = row.find("h2")
        if h2:
            a = h2.find("a")
            if a:
                item["title"] = a.get_text(strip=True)
                href = a.get("href", "")
                item["url"] = href if href.startswith("http") else f"{BASE_URL}{href}"

        # Summary from listing
        obj = row.find(class_="audit-objective-summary")
        if obj:
            item["summary"] = obj.get_text(strip=True)

        if item.get("title") and item.get("url"):
            results.append(item)

    return results


def scrape_report_detail(url: str) -> dict:
    """Scrape an individual ANAO report page for detailed information.

    Returns dict with: agency, summary, full_text, findings_count, recommendations_count.
    """
    print(f"    Fetching detail: {url}")
    html = fetch_url(url)
    if not html:
        print(f"    Failed to fetch detail page")
        return {}

    soup = BeautifulSoup(html, "html.parser")
    detail = {}

    # Agency / entity audited
    entity_div = soup.find("div", class_=re.compile(r"field--name-field-report-entity"))
    if entity_div:
        # Strip the label text ("Entity")
        label = entity_div.find(class_=re.compile(r"field__label"))
        entity_text = entity_div.get_text(strip=True)
        if label:
            entity_text = entity_text.replace(label.get_text(strip=True), "", 1).strip()
        detail["agency"] = entity_text

    # Sector/activity for additional context
    sector_div = soup.find("div", class_=re.compile(r"field--name-field-report-sector"))
    if sector_div:
        label = sector_div.find(class_=re.compile(r"field__label"))
        sector_text = sector_div.get_text(strip=True)
        if label:
            sector_text = sector_text.replace(label.get_text(strip=True), "", 1).strip()
        detail["sector"] = sector_text

    # Conclusion text (the most important summary)
    main = soup.find("main") or soup
    conclusion_text = ""
    for h in main.find_all(["h2", "h3"]):
        if "conclusion" in h.get_text(strip=True).lower():
            nxt = h.find_next_sibling()
            parts = []
            while nxt and nxt.name not in ["h2", "h3"]:
                txt = nxt.get_text(strip=True)
                if txt:
                    parts.append(txt)
                nxt = nxt.find_next_sibling()
            conclusion_text = " ".join(parts)
            break

    if conclusion_text:
        detail["conclusion"] = conclusion_text

    # Count recommendations
    page_text = soup.get_text()
    rec_numbers = re.findall(r"Recommendation no\.\s*(\d+)", page_text)
    if rec_numbers:
        # Deduplicate (they appear twice in text -- summary table + body)
        detail["recommendations_count"] = max(int(n) for n in rec_numbers)
    else:
        # Fallback: count "Recommendation" headings
        rec_headings = [h for h in main.find_all(["h3", "h4"])
                        if re.match(r"Recommendation\s+\d+", h.get_text(strip=True))]
        detail["recommendations_count"] = len(rec_headings)

    # Count findings (numbered paragraphs in Supporting findings section)
    finding_nums = re.findall(r"Supporting finding[s]?", page_text)
    # Count numbered paragraphs that look like findings
    finding_paras = re.findall(r"(?:^|\n)\s*(\d+)\.\s*(?:The |ANAO |In |For |There )", page_text)
    if finding_paras:
        detail["findings_count"] = len(set(finding_paras))
    else:
        detail["findings_count"] = len(finding_nums)

    # Build full_text from the Summary and recommendations chapter
    full_text_parts = []
    if conclusion_text:
        full_text_parts.append(f"CONCLUSION: {conclusion_text}")

    # Get supporting findings text
    for h in main.find_all(["h3"]):
        heading = h.get_text(strip=True)
        if "supporting finding" in heading.lower():
            nxt = h.find_next_sibling()
            parts = []
            while nxt and nxt.name not in ["h2", "h3"]:
                txt = nxt.get_text(strip=True)
                if txt:
                    parts.append(txt)
                nxt = nxt.find_next_sibling()
            if parts:
                full_text_parts.append(f"FINDINGS: {' '.join(parts)}")
            break

    # Get recommendations text
    for h in main.find_all(["h3"]):
        heading = h.get_text(strip=True)
        if heading.lower() == "recommendations":
            nxt = h.find_next_sibling()
            parts = []
            while nxt and nxt.name not in ["h2", "h3"]:
                txt = nxt.get_text(strip=True)
                if txt:
                    parts.append(txt)
                nxt = nxt.find_next_sibling()
            if parts:
                full_text_parts.append(f"RECOMMENDATIONS: {' '.join(parts)}")
            break

    # Key messages
    key_msg_div = soup.find("div", class_=re.compile(r"field--name-field-key-learnings-insert"))
    if key_msg_div:
        full_text_parts.append(f"KEY MESSAGES: {key_msg_div.get_text(strip=True)[:2000]}")

    detail["full_text"] = "\n\n".join(full_text_parts) if full_text_parts else None

    return detail


def scrape_all_reports(
    audit_type: str = "performance",
    max_pages: int = 200,
    limit: int | None = None,
    per_page: int = 60,
    delay: float = 1.0,
) -> list[dict]:
    """Scrape all ANAO reports of a given type across paginated listing pages.

    Args:
        audit_type: 'performance', 'financial', or 'compliance'
        max_pages: Maximum number of listing pages to fetch.
        limit: Stop after this many reports (None = all).
        per_page: Items per listing page (ANAO supports 10, 30, 60, 120).
        delay: Seconds between requests (be polite).

    Returns:
        List of report dicts ready for DB insertion.
    """
    all_reports = []
    seen_urls = set()

    for page_num in range(max_pages):
        items = scrape_listing_page(audit_type, page=page_num, per_page=per_page)
        if not items:
            print(f"  No more items on page {page_num}, done.")
            break

        for item in items:
            url = item.get("url", "")
            if url in seen_urls:
                continue
            seen_urls.add(url)

            # Fetch detail page
            time.sleep(delay)
            detail = scrape_report_detail(url)
            item.update(detail)
            all_reports.append(item)

            if limit and len(all_reports) >= limit:
                print(f"  Reached limit of {limit} reports.")
                return all_reports

        time.sleep(delay)

    return all_reports


def ingest_reports(reports: list[dict], db=None) -> int:
    """Insert scraped reports into the audit_reports table.

    Returns count of new reports inserted.
    """
    if db is None:
        db = get_db()

    db.execute("PRAGMA busy_timeout = 300000")
    init_db(db)
    inserted = 0

    for r in reports:
        try:
            db.execute(
                """INSERT OR IGNORE INTO audit_reports
                   (title, report_number, audit_type, agency_audited,
                    date_tabled, summary, findings_count, recommendations_count,
                    url, full_text)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    r.get("title"),
                    r.get("report_number"),
                    r.get("audit_type"),
                    r.get("agency"),
                    r.get("date"),
                    r.get("summary") or r.get("conclusion"),
                    r.get("findings_count", 0),
                    r.get("recommendations_count", 0),
                    r.get("url"),
                    r.get("full_text"),
                ),
            )
            if db.execute("SELECT changes()").fetchone()[0] > 0:
                inserted += 1
        except Exception as e:
            print(f"  Error inserting report '{r.get('title', '?')}': {e}")

    db.commit()
    return inserted


def cross_reference_agencies(db=None) -> dict:
    """Cross-reference audited agencies with AusTender contracts and donations.

    Finds:
      1. Contracts awarded by audited agencies
      2. Companies that both contract with those agencies AND donate to parties

    Results are stored in analysis_cache with key 'anao_agency_xref'.
    """
    if db is None:
        db = get_db()

    db.execute("PRAGMA busy_timeout = 300000")

    # Get all audited agencies
    agencies = db.execute(
        "SELECT DISTINCT agency_audited FROM audit_reports WHERE agency_audited IS NOT NULL"
    ).fetchall()

    if not agencies:
        print("  No audited agencies found for cross-reference.")
        return {}

    xref = {}

    for (agency_name,) in agencies:
        agency_key = agency_name.strip()
        # Build LIKE patterns: match full name or key words
        words = [w for w in agency_key.split() if len(w) > 3 and w.lower() not in
                 ("the", "and", "for", "department", "australian")]
        if not words:
            continue

        # Find contracts from this agency
        like_pattern = f"%{agency_key}%"
        contracts = db.execute(
            """SELECT contract_id, title, supplier_name, amount, start_date
               FROM contracts
               WHERE agency LIKE ?
               ORDER BY amount DESC NULLS LAST
               LIMIT 20""",
            (like_pattern,),
        ).fetchall()

        if not contracts:
            # Try matching on key words
            for word in words[:3]:
                contracts = db.execute(
                    """SELECT contract_id, title, supplier_name, amount, start_date
                       FROM contracts
                       WHERE agency LIKE ?
                       ORDER BY amount DESC NULLS LAST
                       LIMIT 20""",
                    (f"%{word}%",),
                ).fetchall()
                if contracts:
                    break

        # Find suppliers who also donate
        donor_contractors = []
        for c in contracts:
            supplier = c["supplier_name"]
            if not supplier:
                continue
            # Check donations table for this supplier
            donations = db.execute(
                """SELECT donor_name, recipient, SUM(amount) as total_donated
                   FROM donations
                   WHERE donor_name LIKE ?
                   GROUP BY donor_name, recipient
                   ORDER BY total_donated DESC
                   LIMIT 5""",
                (f"%{supplier}%",),
            ).fetchall()
            if donations:
                donor_contractors.append({
                    "supplier": supplier,
                    "contract_amount": c["amount"],
                    "contract_title": c["title"],
                    "donations": [dict(d) for d in donations],
                })

        # Get audit reports for this agency
        audits = db.execute(
            """SELECT title, report_number, date_tabled, recommendations_count, url
               FROM audit_reports
               WHERE agency_audited = ?
               ORDER BY date_tabled DESC""",
            (agency_key,),
        ).fetchall()

        total_contract_value = sum(c["amount"] or 0 for c in contracts)

        xref[agency_key] = {
            "audit_count": len(audits),
            "audits": [dict(a) for a in audits],
            "contract_count": len(contracts),
            "total_contract_value": total_contract_value,
            "top_contracts": [dict(c) for c in contracts[:10]],
            "donor_contractors": donor_contractors,
            "donor_contractor_count": len(donor_contractors),
        }

    # Store in analysis_cache
    db.execute(
        """INSERT OR REPLACE INTO analysis_cache (key, value, updated_at)
           VALUES ('anao_agency_xref', ?, datetime('now'))""",
        (json.dumps(xref, default=str),),
    )
    db.commit()

    return xref


def main():
    parser = argparse.ArgumentParser(description="Scrape ANAO audit reports")
    parser.add_argument("--limit", type=int, default=None, help="Max reports to scrape")
    parser.add_argument("--pages", type=int, default=200, help="Max listing pages to fetch")
    parser.add_argument("--audit-type", default="performance",
                        choices=["performance", "financial", "compliance"],
                        help="Type of audit to scrape")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between requests (seconds)")
    parser.add_argument("--no-xref", action="store_true", help="Skip cross-referencing step")
    parser.add_argument("--per-page", type=int, default=60, help="Items per listing page")
    args = parser.parse_args()

    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")
    init_db(db)

    print(f"=== ANAO {args.audit_type} audit scraper ===")
    print(f"Database: {db.execute('PRAGMA database_list').fetchone()[2]}")

    # Check existing count
    existing = db.execute("SELECT COUNT(*) FROM audit_reports WHERE audit_type = ?",
                          (args.audit_type,)).fetchone()[0]
    print(f"Existing {args.audit_type} reports in DB: {existing}")

    # Scrape
    reports = scrape_all_reports(
        audit_type=args.audit_type,
        max_pages=args.pages,
        limit=args.limit,
        per_page=args.per_page,
        delay=args.delay,
    )
    print(f"\nScraped {len(reports)} reports from ANAO website.")

    # Ingest
    inserted = ingest_reports(reports, db)
    print(f"Inserted {inserted} new reports into audit_reports table.")

    total = db.execute("SELECT COUNT(*) FROM audit_reports").fetchone()[0]
    print(f"Total audit reports in database: {total}")

    # Cross-reference
    if not args.no_xref:
        print("\n=== Cross-referencing audited agencies ===")
        xref = cross_reference_agencies(db)
        agencies_with_contracts = sum(1 for v in xref.values() if v["contract_count"] > 0)
        agencies_with_donors = sum(1 for v in xref.values() if v["donor_contractor_count"] > 0)
        print(f"Cross-referenced {len(xref)} agencies:")
        print(f"  {agencies_with_contracts} agencies have AusTender contracts")
        print(f"  {agencies_with_donors} agencies have contractors who also donate")

        # Print the juicy findings
        for agency, data in sorted(xref.items(), key=lambda x: x[1]["donor_contractor_count"], reverse=True):
            if data["donor_contractor_count"] > 0:
                print(f"\n  {agency}:")
                print(f"    Audits: {data['audit_count']}, Contracts: {data['contract_count']} "
                      f"(${data['total_contract_value']:,.0f})")
                for dc in data["donor_contractors"][:3]:
                    total_don = sum(d["total_donated"] or 0 for d in dc["donations"])
                    print(f"    -> {dc['supplier']}: contract ${dc['contract_amount'] or 0:,.0f}, "
                          f"donated ${total_don:,.0f}")

    # Summary stats
    print("\n=== Summary ===")
    stats = db.execute("""
        SELECT audit_type, COUNT(*) as cnt,
               SUM(recommendations_count) as total_recs,
               SUM(findings_count) as total_findings
        FROM audit_reports GROUP BY audit_type
    """).fetchall()
    for row in stats:
        print(f"  {row['audit_type']}: {row['cnt']} reports, "
              f"{row['total_recs'] or 0} recommendations, "
              f"{row['total_findings'] or 0} findings")

    db.close()


if __name__ == "__main__":
    main()
