"""
parli.ingest.qld_parliament -- Ingest Queensland Parliament data into the OPAX
database: members, Hansard speeches (from PDFs), and tabled papers metadata.

Data sources:
  1. QLD Parliament Open Data API (https://data.parliament.qld.gov.au/api)
     - /api/members/current  -- current MPs with committee/ministry activities
     - /api/members/former   -- former MPs
     - /api/members/{id}     -- detailed member info
     - /api/tabledpaper      -- tabled papers (petitions, reports, etc.)
     - /api/parliaments      -- list of all parliaments and sessions
  2. QLD Hansard PDFs
     - URL pattern: documents.parliament.qld.gov.au/events/han/YYYY/YYYY_MM_DD_A.PDF
     - Text extracted via pdfminer, then split into speeches by speaker detection

Notes:
  - QLD Parliament is unicameral (Legislative Assembly only, no upper house).
  - The Open Data API does NOT serve Hansard text or division/voting records.
  - Division records are embedded within the Hansard PDF text (recorded divisions).
  - API versioning: ?api-version=v1
  - Max page size is 200 per request.

Usage:
    python -m parli.ingest.qld_parliament
    python -m parli.ingest.qld_parliament --members-only
    python -m parli.ingest.qld_parliament --hansard-only --start 2024-01-01
    python -m parli.ingest.qld_parliament --dry-run
"""

import argparse
import hashlib
import io
import json
import re
import sqlite3
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

from parli.schema import get_db, init_db

# ── Configuration ─────────────────────────────────────────────────────────────

API_BASE = "https://data.parliament.qld.gov.au/api"
API_VERSION = "v1"
HANSARD_PDF_BASE = "https://documents.parliament.qld.gov.au/events/han"
USER_AGENT = "Mozilla/5.0 (compatible; OPAX/1.0; +https://opax.com.au)"

# Rate limiting
API_DELAY = 0.3      # seconds between API calls
PDF_DELAY = 2.0      # seconds between PDF downloads (heavier)
MAX_RETRIES = 3

# QLD is unicameral
CHAMBER_CODE = "qld_la"  # Queensland Legislative Assembly
STATE = "qld"
SOURCE_HANSARD = "qld_hansard"
SOURCE_MEMBERS = "qld_parliament_api"

# Progress / cache
CACHE_DIR = Path("~/.cache/autoresearch/qld_parliament").expanduser()
PROGRESS_FILE = CACHE_DIR / "hansard_progress.txt"
PDF_CACHE_DIR = CACHE_DIR / "pdfs"

# Parsing
HTML_TAG_RE = re.compile(r"<[^>]+>")
MULTI_SPACE_RE = re.compile(r"\s+")
MIN_SPEECH_LEN = 50
BATCH_SIZE = 500

# Speaker detection pattern for QLD Hansard PDFs
# Typical format: "Mr SPEAKER:", "Mr SMITH (Electorate—Party) (12:34):",
# "Hon. JG MILES (Minister for X) (12:34):"
# "Mr CRISAFULLI (9.43 am):" - name with timestamp only
SPEAKER_RE = re.compile(
    r"^("
    r"(?:Hon\.?\s+|Dr\s+|Mr\s+|Mrs\s+|Ms\s+|Miss\s+)"
    r"[A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)*"
    r")"
    r"(?:\s*\(([^)]+)\))?"    # optional (Electorate—Party) or (Minister for X)
    r"(?:\s*\(\d{1,2}[.:]\d{2}\s*(?:am|pm)?\))?"  # optional timestamp like (9.43 am)
    r"\s*:"                    # colon after name
)

# Division detection
DIVISION_RE = re.compile(
    r"DIVISION.*?Resolved in the (?:affirmative|negative)",
    re.DOTALL | re.IGNORECASE,
)
AYES_RE = re.compile(r"Ayes,?\s*(\d+)", re.IGNORECASE)
NOES_RE = re.compile(r"Noes?,?\s*(\d+)", re.IGNORECASE)

# QLD party aliases
QLD_PARTY_ALIASES = {
    "LNP": "LNP",
    "Liberal National Party": "LNP",
    "Liberal National Party of Queensland": "LNP",
    "Lib": "LNP",
    "NP": "LNP",
    "ALP": "Labor",
    "Labor": "Labor",
    "Australian Labor Party": "Labor",
    "Grn": "Greens",
    "Greens": "Greens",
    "Queensland Greens": "Greens",
    "The Greens": "Greens",
    "KAP": "Katter's Australian Party",
    "Katter's Australian Party": "Katter's Australian Party",
    "PHON": "One Nation",
    "One Nation": "One Nation",
    "Pauline Hanson's One Nation": "One Nation",
    "Ind": "Independent",
    "Independent": "Independent",
}


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _make_request(url: str, accept: str = "application/json",
                  delay: float = API_DELAY) -> bytes:
    """HTTP GET with rate limiting, retries, and user-agent."""
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": accept,
    })
    for attempt in range(MAX_RETRIES):
        try:
            time.sleep(delay)
            with urllib.request.urlopen(req, timeout=120) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return b""
            if attempt == MAX_RETRIES - 1:
                raise
            wait = 2 ** (attempt + 1)
            print(f"    Retry {attempt + 1}/{MAX_RETRIES}: HTTP {e.code} (waiting {wait}s)")
            time.sleep(wait)
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                raise
            wait = 2 ** (attempt + 1)
            print(f"    Retry {attempt + 1}/{MAX_RETRIES}: {e} (waiting {wait}s)")
            time.sleep(wait)
    return b""


def _api_json(endpoint: str, **params) -> dict | list:
    """Fetch JSON from the QLD Parliament Open Data API."""
    params["api-version"] = API_VERSION
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    url = f"{API_BASE}/{endpoint}?{qs}"
    data = _make_request(url, accept="application/json")
    if not data:
        return {}
    return json.loads(data)


def _api_paged(endpoint: str, page_size: int = 200, **extra_params) -> list[dict]:
    """Fetch all pages from a paginated API endpoint."""
    all_items = []
    page = 0
    while True:
        result = _api_json(endpoint, page=page, pageSize=page_size, **extra_params)
        items = result.get("data", [])
        if not items:
            break
        all_items.extend(items)
        if not result.get("hasNextPage", False):
            break
        page += 1
        print(f"    Page {page}, {len(all_items)} items so far...")
    return all_items


# ── Utility ───────────────────────────────────────────────────────────────────

def text_hash(text: str) -> str:
    """Short SHA-256 hex digest for deduplication."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def clean_text(text: str) -> str:
    """Strip HTML, collapse whitespace."""
    text = HTML_TAG_RE.sub(" ", text)
    text = MULTI_SPACE_RE.sub(" ", text).strip()
    return text


def normalize_party(raw: str) -> str:
    """Normalize QLD party abbreviations."""
    return QLD_PARTY_ALIASES.get(raw.strip(), raw.strip())


def infer_gender(title: str) -> str | None:
    """Infer gender from title."""
    t = title.strip().lower().rstrip(".")
    if t in ("mr", "sir", "hon"):
        return "M"
    if t in ("ms", "mrs", "miss", "dame"):
        return "F"
    return None


# ── Progress tracking ─────────────────────────────────────────────────────────

def load_progress() -> set[str]:
    """Load set of completed Hansard dates from progress file."""
    if not PROGRESS_FILE.exists():
        return set()
    with open(PROGRESS_FILE, "r") as f:
        return {line.strip() for line in f if line.strip()}


def save_progress(key: str) -> None:
    """Append a completed date key to progress file."""
    PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(PROGRESS_FILE, "a") as f:
        f.write(key + "\n")


# ── Members ingestion ─────────────────────────────────────────────────────────

def fetch_all_members() -> list[dict]:
    """Fetch current and former QLD Parliament members from the API."""
    members = []

    for status in ("current", "former"):
        print(f"  Fetching {status} members...")
        raw = _api_paged(f"members/{status}")
        print(f"    Got {len(raw)} {status} members")

        for item in raw:
            member_id = item["id"]
            title = item.get("title", "") or ""
            first_name = item.get("preferredName") or item.get("firstName", "")
            last_name = item.get("lastName", "")
            display_name = item.get("displayName", f"{first_name} {last_name}")

            members.append({
                "person_id": f"qld_{member_id}",
                "name": display_name,
                "first_name": first_name,
                "last_name": last_name,
                "party": "",  # not in list endpoint
                "chamber": CHAMBER_CODE,
                "electorate": "",  # not in list endpoint
                "state": STATE,
                "gender": infer_gender(title),
                "term_start": None,
                "term_end": None,
                "qld_api_id": member_id,
                "title": title,
                "status": status,
            })

    return members


def fetch_member_details(member: dict) -> dict:
    """Fetch detailed member info including activities (committees, ministries)."""
    api_id = member.get("qld_api_id", "")
    if not api_id:
        return member

    detail = _api_json(f"members/{api_id}")
    if not detail:
        return member

    activities = detail.get("activities", [])

    # Extract electorate from most recent Electorate activity
    for act in sorted(activities, key=lambda a: a.get("startDate", ""), reverse=True):
        if act.get("activityType") == "Electorate":
            member["electorate"] = act.get("name", "")
            member["term_start"] = (act.get("startDate") or "")[:10] or None
            member["term_end"] = (act.get("endDate") or "")[:10] or None
            break

    # Extract party from most recent PoliticalParty activity
    for act in sorted(activities, key=lambda a: a.get("startDate", ""), reverse=True):
        if act.get("activityType") == "PoliticalParty":
            member["party"] = normalize_party(act.get("name", ""))
            break

    return member


def upsert_members(db: sqlite3.Connection, members: list[dict]) -> int:
    """Insert or update QLD members."""
    count = 0
    for m in members:
        try:
            db.execute("""
                INSERT INTO members (person_id, first_name, last_name, full_name,
                                     party, electorate, chamber, gender,
                                     entered_house, left_house, state)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(person_id) DO UPDATE SET
                    first_name=excluded.first_name,
                    last_name=excluded.last_name,
                    full_name=excluded.full_name,
                    party=excluded.party,
                    electorate=excluded.electorate,
                    gender=excluded.gender,
                    entered_house=excluded.entered_house,
                    left_house=excluded.left_house,
                    state=excluded.state
            """, (
                m["person_id"],
                m["first_name"],
                m["last_name"],
                m["name"],
                m["party"],
                m["electorate"],
                CHAMBER_CODE,
                m["gender"],
                m.get("term_start"),
                m.get("term_end"),
                STATE,
            ))
            count += 1
        except sqlite3.IntegrityError as e:
            print(f"    Skipping member {m['person_id']}: {e}")
    db.commit()
    return count


def ingest_members(db: sqlite3.Connection, fetch_details: bool = True) -> int:
    """Fetch and store all QLD Parliament members."""
    print("\n=== QLD Parliament Members ===")
    members = fetch_all_members()
    print(f"  Total members fetched: {len(members)}")

    if fetch_details:
        # Only fetch details for current members (API load)
        current = [m for m in members if m.get("status") == "current"]
        print(f"  Fetching details for {len(current)} current members...")
        for i, m in enumerate(current, 1):
            fetch_member_details(m)
            if i % 10 == 0:
                print(f"    ... {i}/{len(current)}")

    n = upsert_members(db, members)
    print(f"  Upserted {n} members")
    return n


# ── Hansard PDF ingestion ─────────────────────────────────────────────────────

def get_sitting_dates(start: date, end: date) -> list[date]:
    """Get QLD Parliament sitting dates by checking the sitting calendar API."""
    sitting_dates = set()

    for year in range(start.year, end.year + 1):
        print(f"    Checking sitting calendar for {year}...")
        events = _api_json("sittingcalendar", year=year)
        if isinstance(events, list):
            for ev in events:
                name = ev.get("name", "")
                if "Legislative Assembly" in name:
                    # The calendar API doesn't include date fields directly,
                    # but we can use the ID to look up. Instead, generate candidate
                    # dates from the tabled papers which have actual dates.
                    pass

    # Fallback: generate candidate dates from tabled papers + known sitting patterns
    # QLD typically sits Tue-Thu during sitting weeks
    print(f"    Scanning tabled papers for sitting dates...")
    papers = _api_paged("tabledpaper", page_size=200)
    for paper in papers:
        paper_date = (paper.get("date") or "")[:10]
        is_sitting = paper.get("isSittingDay", False)
        if is_sitting and paper_date:
            d = date.fromisoformat(paper_date)
            if start <= d <= end:
                sitting_dates.add(d)

    return sorted(sitting_dates)


def generate_candidate_dates(start: date, end: date) -> list[date]:
    """Generate all weekday dates in range as PDF download candidates.

    QLD Hansard PDFs exist for each sitting day. We try to download
    and skip 404s (non-sitting days).
    """
    dates = []
    current = start
    while current <= end:
        # Only weekdays (Mon=0 to Fri=4)
        if current.weekday() < 5:
            dates.append(current)
        current += timedelta(days=1)
    return dates


def download_hansard_pdf(sitting_date: date) -> bytes | None:
    """Download a QLD Hansard PDF for a given sitting date.

    Tries multiple URL suffixes: _A, _WEEKLY, _B, _C.
    Returns PDF bytes or None if not found.
    """
    date_str = sitting_date.strftime("%Y_%m_%d")
    year_str = sitting_date.strftime("%Y")

    # Try different suffixes used by QLD Parliament
    suffixes = ["_WEEKLY", "_A", "_B", "_C", ""]
    for suffix in suffixes:
        url = f"{HANSARD_PDF_BASE}/{year_str}/{date_str}{suffix}.PDF"
        try:
            data = _make_request(url, accept="application/pdf", delay=0.5)
            if data and len(data) > 1000:  # Valid PDF should be > 1KB
                return data
        except Exception:
            continue
    return None


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from PDF bytes using pdfminer."""
    from pdfminer.high_level import extract_text as pdfminer_extract

    return pdfminer_extract(io.BytesIO(pdf_bytes))


def split_into_speeches(full_text: str, sitting_date: str) -> list[dict]:
    """Split Hansard PDF text into individual speeches by speaker.

    Returns list of dicts with: speaker_name, topic, text, electorate, party
    """
    speeches = []
    lines = full_text.split("\n")

    current_speaker = ""
    current_electorate = ""
    current_party = ""
    current_topic = ""
    current_parts: list[str] = []

    # Detect topic headings - usually ALL CAPS lines
    topic_re = re.compile(r"^[A-Z][A-Z\s,;:\-\(\)]+$")

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Collapse double/triple spaces from PDF extraction
        line = re.sub(r"\s{2,}", " ", line)

        # Skip page headers/footers
        if re.match(r"^\d+\s*$", line):
            continue
        if "Record of Proceedings" in line or "Legislative Assembly" in line:
            continue
        if re.match(r"^\d{1,2}\s+[A-Z][a-z]+\s+\d{4}$", line):
            continue

        # Check for topic heading (ALL CAPS line, >= 5 chars)
        if topic_re.match(line) and len(line) >= 5 and len(line) < 200:
            # Save previous speech
            if current_parts and current_speaker:
                text = clean_text(" ".join(current_parts))
                if len(text) >= MIN_SPEECH_LEN:
                    speeches.append({
                        "speaker_name": current_speaker,
                        "electorate": current_electorate,
                        "party": current_party,
                        "topic": current_topic,
                        "text": text,
                    })
                current_parts = []
            current_topic = line.strip().title()
            continue

        # Check for speaker change
        speaker_match = SPEAKER_RE.match(line)
        if speaker_match:
            # Save previous speech
            if current_parts and current_speaker:
                text = clean_text(" ".join(current_parts))
                if len(text) >= MIN_SPEECH_LEN:
                    speeches.append({
                        "speaker_name": current_speaker,
                        "electorate": current_electorate,
                        "party": current_party,
                        "topic": current_topic,
                        "text": text,
                    })
                current_parts = []

            # Parse new speaker
            current_speaker = speaker_match.group(1).strip()
            qualifier = speaker_match.group(2) or ""

            # Try to extract electorate and party from qualifier
            # Format: "Electorate—Party" or "Minister for X"
            # Ignore timestamps like "9.43 am"
            current_electorate = ""
            current_party = ""
            if qualifier and not re.match(r"\d{1,2}[.:]\d{2}", qualifier):
                # Try split on em-dash or hyphen
                parts = re.split(r"[—–\-]", qualifier, maxsplit=1)
                if len(parts) == 2:
                    current_electorate = parts[0].strip()
                    current_party = normalize_party(parts[1].strip())
                elif not qualifier.startswith("Minister"):
                    current_electorate = qualifier.strip()

            # Remainder of line after the speaker marker is speech text
            remainder = line[speaker_match.end():].strip()
            if remainder:
                current_parts.append(remainder)
            continue

        # Regular content line
        current_parts.append(line)

    # Don't forget last speech
    if current_parts and current_speaker:
        text = clean_text(" ".join(current_parts))
        if len(text) >= MIN_SPEECH_LEN:
            speeches.append({
                "speaker_name": current_speaker,
                "electorate": current_electorate,
                "party": current_party,
                "topic": current_topic,
                "text": text,
            })

    return speeches


def extract_divisions(full_text: str, sitting_date: str) -> list[dict]:
    """Extract recorded divisions (votes) from Hansard PDF text.

    Returns list of dicts with: name, date, aye_votes, no_votes, summary
    """
    divisions = []
    for i, match in enumerate(DIVISION_RE.finditer(full_text)):
        block = match.group(0)
        ayes_m = AYES_RE.search(block)
        noes_m = NOES_RE.search(block)

        aye_count = int(ayes_m.group(1)) if ayes_m else 0
        no_count = int(noes_m.group(1)) if noes_m else 0

        # Get a short summary from the text before the division
        pre_text = full_text[max(0, match.start() - 500):match.start()]
        # Find the last topic or question before the division
        summary_lines = [l.strip() for l in pre_text.split("\n") if l.strip()]
        summary = summary_lines[-1] if summary_lines else "Division"

        divisions.append({
            "name": summary[:200],
            "date": sitting_date,
            "number": i + 1,
            "aye_votes": aye_count,
            "no_votes": no_count,
            "summary": block[:500],
        })

    return divisions


def ingest_hansard_day(
    db: sqlite3.Connection,
    sitting_date: date,
    seen: set[str],
    dry_run: bool = False,
) -> tuple[int, int]:
    """Download and ingest Hansard for one sitting day.

    Returns (speech_count, division_count).
    """
    date_str = sitting_date.isoformat()

    # Check PDF cache first
    cache_file = PDF_CACHE_DIR / f"{date_str}.pdf"
    if cache_file.exists():
        pdf_bytes = cache_file.read_bytes()
    else:
        pdf_bytes = download_hansard_pdf(sitting_date)
        if not pdf_bytes:
            return 0, 0
        # Cache the PDF
        PDF_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file.write_bytes(pdf_bytes)

    # Extract text
    try:
        full_text = extract_text_from_pdf(pdf_bytes)
    except Exception as e:
        print(f"      PDF extraction error: {e}")
        return 0, 0

    if len(full_text) < 100:
        return 0, 0

    # Split into speeches
    speeches = split_into_speeches(full_text, date_str)

    # Extract divisions
    divisions = extract_divisions(full_text, date_str)

    speech_count = 0
    pending = 0

    for speech in speeches:
        dedup_key = f"{speech['speaker_name']}|{date_str}|{text_hash(speech['text'])}"
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        word_count = len(speech["text"].split())

        if dry_run:
            print(f"      {speech['speaker_name']}: "
                  f"{(speech['topic'] or 'No topic')[:50]}... ({word_count} words)")
            speech_count += 1
            continue

        db.execute("""
            INSERT INTO speeches
            (person_id, speaker_name, party, electorate, chamber,
             date, topic, text, word_count, source, state)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            None,
            speech["speaker_name"],
            speech.get("party", ""),
            speech.get("electorate", ""),
            CHAMBER_CODE,
            date_str,
            speech.get("topic") or None,
            speech["text"],
            word_count,
            SOURCE_HANSARD,
            STATE,
        ))
        speech_count += 1
        pending += 1

        if pending >= BATCH_SIZE:
            db.commit()
            pending = 0

    # Insert divisions
    div_count = 0
    for div in divisions:
        if dry_run:
            print(f"      DIVISION: Ayes {div['aye_votes']}, Noes {div['no_votes']}")
            div_count += 1
            continue

        # Use a generated division_id: date + number
        div_id_str = f"qld_{date_str}_{div['number']}"
        div_id = int(hashlib.sha256(div_id_str.encode()).hexdigest()[:8], 16)

        try:
            db.execute("""
                INSERT OR IGNORE INTO divisions
                (division_id, house, name, date, number,
                 aye_votes, no_votes, possible_turnout, rebellions, summary, state)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                div_id,
                CHAMBER_CODE,
                div["name"],
                date_str,
                div["number"],
                div["aye_votes"],
                div["no_votes"],
                None,
                None,
                div["summary"],
                STATE,
            ))
            div_count += 1
        except sqlite3.IntegrityError:
            pass  # Already exists

    if pending > 0 and not dry_run:
        db.commit()
    if div_count > 0 and not dry_run:
        db.commit()

    return speech_count, div_count


def build_dedup_set(db: sqlite3.Connection) -> set[str]:
    """Build deduplication set from existing QLD Hansard speeches."""
    seen: set[str] = set()
    try:
        rows = db.execute(
            "SELECT speaker_name, date, text FROM speeches WHERE source = ?",
            (SOURCE_HANSARD,),
        ).fetchall()
        for row in rows:
            key = f"{row['speaker_name'] or ''}|{row['date']}|{text_hash(row['text'])}"
            seen.add(key)
    except Exception:
        pass
    return seen


def ingest_hansard(
    db: sqlite3.Connection,
    start: date,
    end: date,
    dry_run: bool = False,
    no_resume: bool = False,
    use_sitting_dates: bool = True,
) -> tuple[int, int]:
    """Ingest QLD Hansard speeches from PDF downloads.

    Returns (total_speeches, total_divisions).
    """
    print(f"\n=== QLD Hansard Speeches ({start} to {end}) ===")

    # Progress tracking
    if no_resume:
        completed = set()
        print("  Resume: disabled")
    else:
        completed = load_progress()
        print(f"  Resume: {len(completed)} dates already completed")

    # Build dedup set
    print("  Building deduplication index...")
    seen = build_dedup_set(db)
    print(f"  {len(seen)} existing QLD speeches indexed")

    # Get candidate dates
    if use_sitting_dates:
        print("  Fetching sitting dates from tabled papers...")
        candidate_dates = get_sitting_dates(start, end)
        if not candidate_dates:
            print("  No sitting dates found from API, using weekday scan")
            candidate_dates = generate_candidate_dates(start, end)
    else:
        candidate_dates = generate_candidate_dates(start, end)

    print(f"  {len(candidate_dates)} candidate dates")

    # Filter completed
    candidate_dates = [d for d in candidate_dates if d.isoformat() not in completed]
    print(f"  {len(candidate_dates)} remaining after resume filter")

    total_speeches = 0
    total_divisions = 0
    days_with_data = 0

    for i, d in enumerate(candidate_dates, 1):
        label = f"[{i}/{len(candidate_dates)}] {d.isoformat()}"

        try:
            n_speeches, n_divs = ingest_hansard_day(db, d, seen, dry_run=dry_run)
        except Exception as e:
            print(f"  {label} ERROR: {e}")
            save_progress(d.isoformat())
            continue

        if n_speeches > 0 or n_divs > 0:
            days_with_data += 1
            total_speeches += n_speeches
            total_divisions += n_divs
            print(f"  {label} -> {n_speeches} speeches, {n_divs} divisions")

        if not dry_run:
            save_progress(d.isoformat())

    return total_speeches, total_divisions


# ── Tabled Papers ingestion ───────────────────────────────────────────────────

def ingest_tabled_papers(
    db: sqlite3.Connection,
    dry_run: bool = False,
    max_pages: int = 50,
) -> int:
    """Fetch and store tabled papers metadata.

    The QLD Parliament has ~130,000+ tabled papers going back decades.
    By default, fetches only the first max_pages pages (most recent first).
    Set max_pages=0 for unlimited (will take a long time).
    """
    print(f"\n=== QLD Tabled Papers (max {max_pages} pages) ===")

    # Create tabled papers table if it doesn't exist
    db.execute("""
        CREATE TABLE IF NOT EXISTS qld_tabled_papers (
            paper_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            date TEXT,
            house TEXT,
            type TEXT,
            received_by TEXT,
            received_by_id TEXT,
            parliament_session_id TEXT,
            registered_number TEXT,
            has_attachments INTEGER DEFAULT 0,
            state TEXT DEFAULT 'qld'
        )
    """)
    db.commit()

    print("  Fetching tabled papers...")
    # Use manual paging to respect max_pages limit
    papers = []
    page = 0
    while max_pages == 0 or page < max_pages:
        result = _api_json("tabledpaper", page=page, pageSize=200)
        items = result.get("data", [])
        if not items:
            break
        papers.extend(items)
        if not result.get("hasNextPage", False):
            break
        page += 1
        if page % 10 == 0:
            print(f"    Page {page}, {len(papers)} papers so far...")
    print(f"  Got {len(papers)} tabled papers (of ~{result.get('total', '?')} total)")

    if dry_run:
        for p in papers[:10]:
            print(f"    {p.get('date', '')[:10]} | {p.get('type', '')} | {p.get('title', '')[:80]}")
        print(f"    ... and {len(papers) - 10} more")
        return len(papers)

    count = 0
    for p in papers:
        try:
            db.execute("""
                INSERT OR REPLACE INTO qld_tabled_papers
                (paper_id, title, date, house, type, received_by,
                 received_by_id, parliament_session_id, registered_number,
                 has_attachments, state)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                p.get("id", ""),
                p.get("title", ""),
                (p.get("date") or "")[:10],
                p.get("houseName", "Legislative Assembly"),
                p.get("type", ""),
                p.get("receivedBy", ""),
                p.get("receivedById", ""),
                p.get("parliamentSessionId", ""),
                p.get("registeredNumber", ""),
                1 if p.get("hasAttachments") else 0,
                STATE,
            ))
            count += 1
        except Exception as e:
            print(f"    Error inserting paper {p.get('id')}: {e}")

    db.commit()
    print(f"  Stored {count} tabled papers")
    return count


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Ingest Queensland Parliament data into the OPAX database."
    )
    parser.add_argument(
        "--start", type=str, default="2024-01-01",
        help="Start date for Hansard (YYYY-MM-DD), default 2024-01-01",
    )
    parser.add_argument(
        "--end", type=str, default=str(date.today()),
        help="End date for Hansard (YYYY-MM-DD), default today",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print what would be ingested without writing to DB",
    )
    parser.add_argument(
        "--members-only", action="store_true",
        help="Only ingest member data (skip Hansard)",
    )
    parser.add_argument(
        "--hansard-only", action="store_true",
        help="Only ingest Hansard speeches (skip members)",
    )
    parser.add_argument(
        "--papers-only", action="store_true",
        help="Only ingest tabled papers",
    )
    parser.add_argument(
        "--no-resume", action="store_true",
        help="Ignore progress file and re-process everything",
    )
    parser.add_argument(
        "--no-details", action="store_true",
        help="Skip fetching detailed member info (faster)",
    )
    parser.add_argument(
        "--scan-weekdays", action="store_true",
        help="Scan all weekdays for Hansard PDFs (not just API sitting dates)",
    )
    args = parser.parse_args()

    start_date = date.fromisoformat(args.start)
    end_date = date.fromisoformat(args.end)

    print("QLD Parliament Ingestor (OPAX)")
    print(f"  Date range: {start_date} to {end_date}")
    print(f"  Dry run: {args.dry_run}")

    db = get_db()
    init_db(db)

    do_members = not args.hansard_only and not args.papers_only
    do_hansard = not args.members_only and not args.papers_only
    do_papers = not args.members_only and not args.hansard_only

    if args.members_only:
        do_members, do_hansard, do_papers = True, False, False
    if args.hansard_only:
        do_members, do_hansard, do_papers = False, True, False
    if args.papers_only:
        do_members, do_hansard, do_papers = False, False, True

    # Members
    if do_members:
        ingest_members(db, fetch_details=not args.no_details)

    # Tabled papers
    if do_papers:
        ingest_tabled_papers(db, dry_run=args.dry_run)

    # Hansard
    if do_hansard:
        n_speeches, n_divs = ingest_hansard(
            db, start_date, end_date,
            dry_run=args.dry_run,
            no_resume=args.no_resume,
            use_sitting_dates=not args.scan_weekdays,
        )

    # Summary
    print(f"\n{'=' * 60}")
    print("Ingestion complete.")

    if not args.dry_run:
        for table, source_filter in [
            ("speeches", f"source = '{SOURCE_HANSARD}'"),
            ("members", f"state = '{STATE}'"),
            ("divisions", f"state = '{STATE}'"),
        ]:
            try:
                count = db.execute(
                    f"SELECT COUNT(*) FROM {table} WHERE {source_filter}"
                ).fetchone()[0]
                print(f"  QLD {table}: {count}")
            except Exception:
                pass

        try:
            count = db.execute(
                "SELECT COUNT(*) FROM qld_tabled_papers"
            ).fetchone()[0]
            print(f"  QLD tabled_papers: {count}")
        except Exception:
            pass

        # Rebuild FTS5 index
        print("\nRebuilding FTS5 index...")
        try:
            db.execute("INSERT INTO speeches_fts(speeches_fts) VALUES('rebuild')")
            db.commit()
            print("  Done.")
        except Exception as e:
            print(f"  FTS rebuild error: {e}")


if __name__ == "__main__":
    main()
