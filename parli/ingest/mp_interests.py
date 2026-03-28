"""
parli.ingest.mp_interests -- Download and extract MP Register of Interests.

Scrapes the APH website for Register of Members' Interests PDFs (House of
Representatives) and Senators' Interests Register PDFs (Senate), downloads
them, extracts text via pdfplumber, then uses Claude Haiku for structured
extraction of financial disclosures.

Data is stored in:
  - mp_interests (general catch-all)
  - mp_shareholdings (Section 1)
  - mp_properties (Section 3: Real estate)
  - mp_directorships (Section 4)

Usage:
    python -m parli.ingest.mp_interests
    python -m parli.ingest.mp_interests --limit 20
    python -m parli.ingest.mp_interests --cache-only   # skip download, parse cached PDFs
    python -m parli.ingest.mp_interests --download-only # download only, no extraction
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from difflib import SequenceMatcher
from urllib.parse import urljoin

import requests
import pdfplumber

from parli.schema import get_db, init_db

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

CACHE_DIR = Path("~/.cache/autoresearch/mp_interests").expanduser()

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "OPAX/1.0 (opax.com.au; parliamentary research)",
})

# APH index pages
REPS_INDEX = "https://www.aph.gov.au/Senators_and_Members/Members/Register"
SENATE_INDEX = "https://www.aph.gov.au/Parliamentary_Business/Committees/Senate/Senators_Interests/Senators_Interests_Register"

# Haiku model for extraction
HAIKU_MODEL = "claude-3-haiku-20240307"

# Interest type mapping from sections
SECTION_TYPE_MAP = {
    "1": "shareholding",
    "2": "trust",
    "3": "property",
    "4": "directorship",
    "5": "partnership",
    "6": "liability",
    "7": "bond",
    "8": "savings",
    "9": "income",
    "10": "gift",
    "11": "travel",
}


# ---------------------------------------------------------------------------
# Step 1: Discover PDF links from APH index pages
# ---------------------------------------------------------------------------

def discover_pdf_links() -> list[dict]:
    """Scrape APH index pages for Register of Interests PDF links.

    Returns list of dicts with keys: url, chamber, mp_name (if parseable).
    """
    pdfs = []

    for label, index_url in [("representatives", REPS_INDEX), ("senate", SENATE_INDEX)]:
        print(f"[discover] Fetching {label} index: {index_url}")
        try:
            resp = SESSION.get(index_url, timeout=30)
            resp.raise_for_status()
        except Exception as e:
            print(f"  [warn] Could not fetch {label} index: {e}")
            continue

        html = resp.text
        # Find all PDF links
        # APH uses various link patterns; look for .pdf hrefs
        pdf_pattern = re.compile(
            r'href=["\']([^"\']*?\.pdf)["\']',
            re.IGNORECASE,
        )

        found = 0
        for match in pdf_pattern.finditer(html):
            href = match.group(1)
            # Build absolute URL
            if href.startswith("//"):
                url = "https:" + href
            elif href.startswith("/"):
                url = "https://www.aph.gov.au" + href
            elif href.startswith("http"):
                url = href
            else:
                url = urljoin(index_url, href)

            # Try to extract MP name from URL or surrounding text
            mp_name = _extract_mp_name_from_url(url)

            pdfs.append({
                "url": url,
                "chamber": label,
                "mp_name": mp_name,
            })
            found += 1

        print(f"  Found {found} PDF links for {label}")

    # Also try known direct PDF URL patterns for the current parliament
    # APH often hosts individual MP PDFs at predictable URLs
    if not pdfs:
        print("[discover] No PDFs found via index scraping, trying alternative approaches...")
        pdfs.extend(_discover_via_member_pages())

    return pdfs


def _extract_mp_name_from_url(url: str) -> str | None:
    """Try to extract an MP name from the PDF URL path."""
    # Common patterns: /Register/MPs_name.pdf, /Senators/lastname_firstname.pdf
    filename = url.rsplit("/", 1)[-1].replace(".pdf", "").replace(".PDF", "")
    # Clean up underscores and hyphens
    name = filename.replace("_", " ").replace("-", " ")
    # Remove common prefixes/suffixes
    for prefix in ["register", "senator", "member", "hon", "the"]:
        name = re.sub(rf"^{prefix}\s+", "", name, flags=re.IGNORECASE)
    # If it looks like a name (2-4 words, all alpha), return it
    parts = name.strip().split()
    if 2 <= len(parts) <= 5 and all(p.isalpha() for p in parts):
        return name.strip().title()
    return None


def _discover_via_member_pages() -> list[dict]:
    """Alternative: discover PDFs by visiting individual member pages."""
    pdfs = []
    # Try the main register page which sometimes has a single combined PDF
    combined_urls = [
        "https://www.aph.gov.au/Parliamentary_Business/Committees/Senate/Senators_Interests/~/media/Committees/Senate/committee/interests_ctte/Register/Register.pdf",
        "https://www.aph.gov.au/~/media/03%20Senators%20and%20Members/31%20Senators/Interests/register.pdf",
    ]
    for url in combined_urls:
        try:
            resp = SESSION.head(url, timeout=15, allow_redirects=True)
            if resp.status_code == 200:
                pdfs.append({"url": url, "chamber": "senate", "mp_name": None})
                print(f"  Found combined register: {url}")
        except Exception:
            pass

    return pdfs


# ---------------------------------------------------------------------------
# Step 2: Download PDFs
# ---------------------------------------------------------------------------

def download_pdfs(pdf_links: list[dict], limit: int | None = None) -> list[Path]:
    """Download PDF files to cache directory. Returns list of local paths."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    downloaded = []

    to_download = pdf_links[:limit] if limit else pdf_links

    for i, info in enumerate(to_download):
        url = info["url"]
        # Create a safe filename from URL
        filename = url.rsplit("/", 1)[-1]
        filename = re.sub(r'[^\w\-.]', '_', filename)
        if not filename.lower().endswith(".pdf"):
            filename += ".pdf"

        local_path = CACHE_DIR / info["chamber"] / filename
        local_path.parent.mkdir(parents=True, exist_ok=True)

        if local_path.exists() and local_path.stat().st_size > 1000:
            print(f"  [{i+1}/{len(to_download)}] Cached: {filename}")
            downloaded.append(local_path)
            continue

        print(f"  [{i+1}/{len(to_download)}] Downloading: {filename}")
        try:
            resp = SESSION.get(url, timeout=60)
            resp.raise_for_status()
            local_path.write_bytes(resp.content)
            downloaded.append(local_path)
            time.sleep(0.5)  # Be polite
        except Exception as e:
            print(f"    [error] {e}")

    print(f"[download] {len(downloaded)} PDFs ready")
    return downloaded


# ---------------------------------------------------------------------------
# Step 3: Extract text from PDFs
# ---------------------------------------------------------------------------

def extract_pdf_text(pdf_path: Path) -> str:
    """Extract text from a PDF using pdfplumber, falling back to OCR for scanned images."""
    text_parts = []
    needs_ocr = False

    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text and page_text.strip():
                    text_parts.append(page_text)
                elif page.images:
                    needs_ocr = True
    except Exception as e:
        print(f"  [error] Failed to open PDF {pdf_path.name}: {e}")
        return ""

    # If we got text from embedded chars, use it
    if text_parts and not needs_ocr:
        return "\n\n".join(text_parts)

    # Fall back to OCR for scanned PDFs
    print(f"  [ocr] Scanned PDF detected, running OCR...")
    try:
        import pypdfium2 as pdfium
        import pytesseract
        from PIL import Image

        doc = pdfium.PdfDocument(str(pdf_path))
        ocr_parts = []
        for i in range(len(doc)):
            page = doc[i]
            # Render at 300 DPI for good OCR quality
            bitmap = page.render(scale=300 / 72)
            pil_image = bitmap.to_pil()
            page_text = pytesseract.image_to_string(pil_image)
            if page_text and page_text.strip():
                ocr_parts.append(page_text)
        doc.close()

        if ocr_parts:
            return "\n\n".join(ocr_parts)
    except ImportError as e:
        print(f"  [warn] OCR dependencies missing: {e}")
    except Exception as e:
        print(f"  [error] OCR failed for {pdf_path.name}: {e}")

    return "\n\n".join(text_parts) if text_parts else ""


def split_by_member(full_text: str, filename: str = "") -> list[dict]:
    """Split a combined register PDF into per-member chunks.

    For individual MP PDFs (e.g. Albanese_48P.pdf), returns one chunk with
    the MP name extracted from the filename. For combined register PDFs,
    splits by member headers.
    """
    # Check if this is an individual MP PDF (filename pattern: Surname_48P.pdf)
    individual_match = re.match(r'^([A-Za-z]+)_\d+P\.pdf$', filename, re.IGNORECASE)
    if individual_match:
        surname = individual_match.group(1).title()
        # Try to find first name in the text
        # Look for "FAMILY NAME X" / "GIVEN NAMES Y" or "SURNAME, First"
        first_name = None
        fn_match = re.search(r'GIVEN\s+NAMES?\s+([A-Z][a-zA-Z\s]+)', full_text)
        if fn_match:
            first_name = fn_match.group(1).strip().title()
        if not fn_match:
            fn_match = re.search(rf'{surname.upper()}\s*,\s*([A-Za-z\s]+)', full_text)
            if fn_match:
                first_name = fn_match.group(1).strip().title()

        name = f"{first_name} {surname}" if first_name else surname
        return [{"name": name, "text": full_text}]

    # For combined register PDFs, look for "Statement of Registrable Interests"
    # sections preceded by member names
    member_pattern = re.compile(
        r'(?:^|\n)FAMILY\s+NAME\s+([A-Z][A-Z\s\'-]+)',
        re.IGNORECASE,
    )

    matches = list(member_pattern.finditer(full_text))

    if len(matches) < 2:
        return [{"name": None, "text": full_text}]

    chunks = []
    for i, m in enumerate(matches):
        name = m.group(1).strip().title()
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(full_text)
        chunk_text = full_text[start:end].strip()
        if len(chunk_text) > 100:
            chunks.append({"name": name, "text": chunk_text})

    return chunks if chunks else [{"name": None, "text": full_text}]


# ---------------------------------------------------------------------------
# Step 4: Claude Haiku structured extraction
# ---------------------------------------------------------------------------

EXTRACTION_PROMPT = """You are extracting structured financial disclosure data from an Australian MP's Register of Interests.

The text below is from an official parliamentary disclosure PDF. Extract all declared interests into JSON.

Return a JSON object with these fields:
{
  "mp_name": "Full Name as it appears",
  "declared_date": "YYYY-MM-DD or null if not found",
  "parliament_number": null or integer,
  "interests": [
    {
      "section": "1-11 number",
      "interest_type": "shareholding|trust|property|directorship|partnership|liability|bond|savings|income|gift|travel|other",
      "entity_name": "company/entity name or null",
      "description": "brief description of the interest",
      "details": {}
    }
  ],
  "shareholdings": [
    {"company_name": "...", "share_type": "ordinary|preference|other"}
  ],
  "properties": [
    {"description": "...", "location": "suburb/state or null", "purpose": "residential|investment|commercial|rural|other"}
  ],
  "directorships": [
    {"company_name": "...", "role": "director|chair|non-executive director|other"}
  ]
}

Rules:
- Extract EVERY declared interest, even if vague ("nil" sections should be omitted)
- For shareholdings, try to identify the company name and share type
- For properties, extract location and purpose if stated
- For directorships, identify the company and role
- If a section says "nil" or "none", skip it entirely
- Be precise with entity/company names -- use the exact text
- declared_date: look for "as at" dates or statement dates
- Return ONLY valid JSON, no markdown formatting

MP Register Text:
"""


def extract_interests_with_haiku(text: str, api_key: str) -> dict | None:
    """Send PDF text to Claude Haiku for structured extraction."""
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)

    # Truncate very long texts to fit in context
    max_chars = 80000
    if len(text) > max_chars:
        text = text[:max_chars] + "\n...[truncated]"

    try:
        response = client.messages.create(
            model=HAIKU_MODEL,
            max_tokens=4096,
            messages=[
                {"role": "user", "content": EXTRACTION_PROMPT + text},
            ],
        )

        if not response.content:
            print(f"    [warn] Empty response from Haiku (stop={response.stop_reason})")
            return None
        content = response.content[0].text.strip()
        if not content:
            print(f"    [warn] Empty text in response (stop={response.stop_reason})")
            return None

        # Strip markdown code fences if present
        if content.startswith("```"):
            content = re.sub(r'^```(?:json)?\s*', '', content)
            content = re.sub(r'\s*```$', '', content)

        # Extract JSON object even if preceded by explanatory text
        json_match = re.search(r'\{', content)
        if json_match:
            # Find the matching closing brace
            json_str = content[json_match.start():]
            # Find the last closing brace
            last_brace = json_str.rfind('}')
            if last_brace >= 0:
                json_str = json_str[:last_brace + 1]
            return json.loads(json_str)

        return json.loads(content)

    except json.JSONDecodeError as e:
        print(f"    [warn] JSON parse error from Haiku: {e}")
        print(f"    [debug] Raw response: {content[:500]}")
        return None
    except Exception as e:
        print(f"    [error] Haiku API call failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Step 5: Match to existing members and store in database
# ---------------------------------------------------------------------------

def match_member(name: str, db) -> str | None:
    """Match an extracted MP name to the members table.

    Tries exact match, then fuzzy matching on full_name.
    """
    if not name:
        return None

    # Normalize: "SURNAME, First" -> "First Surname"
    name_clean = name.strip()
    if "," in name_clean:
        parts = name_clean.split(",", 1)
        name_clean = f"{parts[1].strip()} {parts[0].strip()}"

    # Try exact match
    row = db.execute(
        "SELECT person_id FROM members WHERE full_name = ? COLLATE NOCASE",
        (name_clean,),
    ).fetchone()
    if row:
        return row["person_id"]

    # Try LIKE match
    row = db.execute(
        "SELECT person_id, full_name FROM members WHERE full_name LIKE ? COLLATE NOCASE",
        (f"%{name_clean}%",),
    ).fetchone()
    if row:
        return row["person_id"]

    # Try last name match
    last_name = name_clean.split()[-1] if name_clean.split() else name_clean
    candidates = db.execute(
        "SELECT person_id, full_name FROM members WHERE last_name = ? COLLATE NOCASE",
        (last_name,),
    ).fetchall()

    if len(candidates) == 1:
        return candidates[0]["person_id"]

    # Fuzzy match
    if candidates:
        best_score = 0
        best_id = None
        for c in candidates:
            score = SequenceMatcher(None, name_clean.lower(), c["full_name"].lower()).ratio()
            if score > best_score:
                best_score = score
                best_id = c["person_id"]
        if best_score > 0.6:
            return best_id

    # Last resort: fuzzy across all members
    all_members = db.execute("SELECT person_id, full_name FROM members").fetchall()
    best_score = 0
    best_id = None
    for m in all_members:
        score = SequenceMatcher(None, name_clean.lower(), m["full_name"].lower()).ratio()
        if score > best_score:
            best_score = score
            best_id = m["person_id"]

    if best_score > 0.65:
        return best_id

    return None


def store_interests(data: dict, person_id: str | None, source_url: str, db):
    """Store extracted interests into the database tables."""
    declared_date = data.get("declared_date")
    parliament_number = data.get("parliament_number")

    # Retry wrapper for database lock issues
    max_retries = 3
    for attempt in range(max_retries):
        try:
            return _store_interests_inner(data, person_id, source_url, db,
                                          declared_date, parliament_number)
        except Exception as e:
            if "locked" in str(e).lower() and attempt < max_retries - 1:
                print(f"    [retry] DB locked, attempt {attempt + 2}/{max_retries}...")
                time.sleep(5)
            else:
                raise


def _store_interests_inner(data, person_id, source_url, db, declared_date, parliament_number):
    """Inner store function."""

    # General interests
    for interest in data.get("interests", []):
        db.execute(
            """INSERT INTO mp_interests
               (person_id, interest_type, entity_name, description,
                declared_date, parliament_number, raw_text, source_url)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                person_id,
                interest.get("interest_type", "other"),
                interest.get("entity_name"),
                interest.get("description"),
                declared_date,
                parliament_number,
                json.dumps(interest.get("details")) if interest.get("details") else None,
                source_url,
            ),
        )

    # Shareholdings
    for sh in data.get("shareholdings", []):
        company = sh.get("company_name") or "Unknown"
        db.execute(
            """INSERT INTO mp_shareholdings
               (person_id, company_name, share_type, declared_date)
               VALUES (?, ?, ?, ?)""",
            (
                person_id,
                company,
                sh.get("share_type"),
                declared_date,
            ),
        )

    # Properties
    for prop in data.get("properties", []):
        db.execute(
            """INSERT INTO mp_properties
               (person_id, property_description, location, purpose, declared_date)
               VALUES (?, ?, ?, ?, ?)""",
            (
                person_id,
                prop.get("description"),
                prop.get("location"),
                prop.get("purpose"),
                declared_date,
            ),
        )

    # Directorships
    for d in data.get("directorships", []):
        company = d.get("company_name") or "Unknown"
        db.execute(
            """INSERT INTO mp_directorships
               (person_id, company_name, role, declared_date)
               VALUES (?, ?, ?, ?)""",
            (
                person_id,
                company,
                d.get("role"),
                declared_date,
            ),
        )

    db.commit()


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def run_pipeline(
    limit: int | None = None,
    cache_only: bool = False,
    download_only: bool = False,
):
    """Run the full MP interests ingestion pipeline."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key and not download_only:
        # Try loading from .env
        env_path = Path(__file__).resolve().parent.parent.parent / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("ANTHROPIC_API_KEY="):
                    api_key = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
        if not api_key:
            print("[error] ANTHROPIC_API_KEY not set and .env not found")
            sys.exit(1)

    # Initialize database
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")
    init_db(db)

    # Step 1: Discover PDFs
    if not cache_only:
        print("\n=== Step 1: Discovering PDF links ===")
        pdf_links = discover_pdf_links()
        if not pdf_links:
            print("[warn] No PDF links discovered from index pages.")
            print("[info] Trying direct member page scraping...")
            pdf_links = _discover_individual_member_pdfs(db)

        if not pdf_links:
            print("[error] No PDFs found. APH may have changed their page structure.")
            print("[info] You can manually place PDFs in:")
            print(f"  {CACHE_DIR}/representatives/")
            print(f"  {CACHE_DIR}/senate/")
            cache_only = True

        # Step 2: Download
        if pdf_links:
            print(f"\n=== Step 2: Downloading {len(pdf_links)} PDFs ===")
            downloaded = download_pdfs(pdf_links, limit=limit)
    else:
        downloaded = []

    if download_only:
        print("[done] Download complete.")
        return

    # Gather all cached PDFs
    all_pdfs = []
    for chamber_dir in [CACHE_DIR / "representatives", CACHE_DIR / "senate"]:
        if chamber_dir.exists():
            all_pdfs.extend(sorted(chamber_dir.glob("*.pdf")))

    if not all_pdfs:
        print("[warn] No PDFs in cache to process.")
        return

    if limit:
        all_pdfs = all_pdfs[:limit]

    print(f"\n=== Step 3: Extracting text from {len(all_pdfs)} PDFs ===")

    total_interests = 0
    total_members = 0
    unmatched = []

    for i, pdf_path in enumerate(all_pdfs):
        print(f"\n[{i+1}/{len(all_pdfs)}] Processing: {pdf_path.name}")

        # Skip non-MP files (explanatory notes, historical resolutions, etc.)
        skip_patterns = ["explanatory", "9oct1984", "notes", "resolution", "booklet"]
        if any(pat in pdf_path.name.lower() for pat in skip_patterns):
            print("  [skip] Not an MP interests PDF")
            continue

        # Extract text
        text = extract_pdf_text(pdf_path)
        if not text or len(text) < 50:
            print("  [skip] No usable text extracted")
            continue

        print(f"  Extracted {len(text)} chars from {pdf_path.name}")

        # Split by member if combined PDF
        member_chunks = split_by_member(text, pdf_path.name)
        print(f"  Found {len(member_chunks)} member section(s)")

        for chunk in member_chunks:
            chunk_name = chunk["name"]
            chunk_text = chunk["text"]

            if len(chunk_text) < 50:
                continue

            # Extract with Haiku
            print(f"  Extracting interests for: {chunk_name or 'unknown'}...")
            extracted = extract_interests_with_haiku(chunk_text, api_key)

            if not extracted:
                print("    [skip] No structured data extracted")
                continue

            mp_name = extracted.get("mp_name") or chunk_name
            n_interests = len(extracted.get("interests", []))
            n_sh = len(extracted.get("shareholdings", []))
            n_prop = len(extracted.get("properties", []))
            n_dir = len(extracted.get("directorships", []))

            print(f"    Found: {n_interests} interests, {n_sh} shareholdings, "
                  f"{n_prop} properties, {n_dir} directorships")

            # Match to members table
            person_id = match_member(mp_name, db) if mp_name else None
            if person_id:
                member_row = db.execute(
                    "SELECT full_name FROM members WHERE person_id = ?",
                    (person_id,),
                ).fetchone()
                print(f"    Matched to: {member_row['full_name']} ({person_id})")
                total_members += 1
            else:
                print(f"    [warn] Could not match '{mp_name}' to members table")
                unmatched.append(mp_name)

            # Determine source URL
            source_url = pdf_path.name

            # Store
            store_interests(extracted, person_id, source_url, db)
            total_interests += n_interests + n_sh + n_prop + n_dir

            # Rate limit Haiku calls
            time.sleep(0.3)

    # Summary
    print(f"\n{'='*60}")
    print(f"Pipeline complete!")
    print(f"  Members matched: {total_members}")
    print(f"  Total interest records: {total_interests}")
    if unmatched:
        print(f"  Unmatched names ({len(unmatched)}): {', '.join(unmatched[:10])}")

    # Print table counts
    for table in ["mp_interests", "mp_shareholdings", "mp_properties", "mp_directorships"]:
        count = db.execute(f"SELECT COUNT(*) as c FROM {table}").fetchone()["c"]
        print(f"  {table}: {count} rows")


def _discover_individual_member_pdfs(db) -> list[dict]:
    """Try to find individual MP register PDFs by constructing URLs from member names."""
    pdfs = []

    # Get current members
    members = db.execute(
        "SELECT person_id, full_name, first_name, last_name, chamber FROM members LIMIT 50"
    ).fetchall()

    if not members:
        return pdfs

    print(f"[discover] Trying constructed URLs for {len(members)} members...")

    # APH URL patterns for the register
    base_patterns = [
        # House of Reps - individual statements
        "https://www.aph.gov.au/~/media/03%20Senators%20and%20Members/31%20Members/Register/{last}_{first}.pdf",
        "https://www.aph.gov.au/~/media/03%20Senators%20and%20Members/Register/{last}_{first}.pdf",
    ]

    for m in members[:20]:  # Try first 20
        first = m["first_name"] or ""
        last = m["last_name"] or ""
        if not first or not last:
            continue

        for pattern in base_patterns:
            url = pattern.format(
                first=first.replace(" ", "%20"),
                last=last.replace(" ", "%20"),
            )
            try:
                resp = SESSION.head(url, timeout=10, allow_redirects=True)
                if resp.status_code == 200:
                    chamber = m["chamber"] or "representatives"
                    pdfs.append({
                        "url": url,
                        "chamber": chamber,
                        "mp_name": m["full_name"],
                    })
                    print(f"  Found: {m['full_name']}")
                    break
            except Exception:
                pass
            time.sleep(0.2)

    return pdfs


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest MP Register of Interests")
    parser.add_argument("--limit", type=int, help="Max PDFs to process")
    parser.add_argument("--cache-only", action="store_true", help="Only process cached PDFs")
    parser.add_argument("--download-only", action="store_true", help="Only download PDFs")
    args = parser.parse_args()

    run_pipeline(
        limit=args.limit,
        cache_only=args.cache_only,
        download_only=args.download_only,
    )
