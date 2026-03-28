"""
parli.ingest.committee_hearings -- Ingest Australian committee hearing transcripts
(Senate Estimates, Senate/House/Joint committee hearings) from ParlInfo.

Data source: parlinfo.aph.gov.au
  - Estimates Transcript Schedule page for hearing discovery
  - ParlInfo display pages for transcript content
  - Direct ID enumeration for broader discovery

The OAI-PMH endpoint (parlinfo.aph.gov.au/parlInfo/OAI/OAI.w3p) is no longer
available (returns 404 as of 2026). This ingestor uses HTML scraping instead.

Usage:
    python -m parli.ingest.committee_hearings --limit 10
    python -m parli.ingest.committee_hearings --set estimate --limit 50
    python -m parli.ingest.committee_hearings --set commsen --limit 100
    python -m parli.ingest.committee_hearings --discover --id-start 29300 --id-end 29400
"""

import argparse
import hashlib
import re
import sqlite3
import time
from dataclasses import dataclass, field
from urllib.parse import quote, unquote

import requests

from parli.schema import get_db, init_db

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PARLINFO_BASE = "https://parlinfo.aph.gov.au"
ESTIMATES_SCHEDULE_URL = (
    "https://www.aph.gov.au/Parliamentary_Business/Hansard/"
    "Estimates_Transcript_Schedule"
)

# Dataset prefixes in ParlInfo IDs
DATASET_MAP = {
    "estimate": "committee_senate",   # Senate Estimates (highest value)
    "commsen": "committee_senate",    # Other Senate committee hearings
    "commrep": "committee_house",     # House committee hearings
    "commjnt": "committee_joint",     # Joint committee hearings
}

CHAMBER_MAP = {
    "estimate": "senate_committee",
    "commsen": "senate_committee",
    "commrep": "house_committee",
    "commjnt": "joint_committee",
}

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"
)

RATE_LIMIT_SECS = 1.0  # Minimum seconds between requests
REQUEST_TIMEOUT = 45   # Seconds

BATCH_SIZE = 200

# HTML parsing patterns
HTML_TAG_RE = re.compile(r"<[^>]+>")
MULTI_SPACE_RE = re.compile(r"[ \t]+")

# Speaker CSS classes in ParlInfo committee transcript HTML
SPEAKER_PATTERNS = [
    # (pattern, speaker_type)
    (re.compile(r'class="HPS-OfficeCommittee"[^>]*>(.*?)</span>', re.DOTALL), "chair"),
    (re.compile(r'class="HPS-MemberContinuation"[^>]*>(.*?)</span>', re.DOTALL), "member"),
    (re.compile(r'class="HPS-MemberInterjecting"[^>]*>(.*?)</span>', re.DOTALL), "member"),
    (re.compile(r'class="HPS-MemberQuestion"[^>]*>(.*?)</span>', re.DOTALL), "member"),
    (re.compile(r'class="HPS-MemberWitness"[^>]*>(.*?)</span>', re.DOTALL), "member"),
    (re.compile(r'class="HPS-WitnessName"[^>]*>(.*?)</span>', re.DOTALL), "witness"),
]


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class HearingMetadata:
    """Metadata for a committee hearing."""
    hearing_id: str           # e.g. "committees/estimate/29359"
    dataset: str              # e.g. "estimate", "commsen"
    title: str = ""
    committee_name: str = ""
    date: str = ""            # YYYY-MM-DD
    url: str = ""
    fragment_ids: list[str] = field(default_factory=list)


@dataclass
class SpeechRecord:
    """A single speech/exchange from a committee hearing."""
    speaker_name: str
    speaker_type: str         # "chair", "member", "witness"
    text: str
    hearing_id: str
    committee_name: str
    date: str
    topic: str                # Sub-topic / department being examined
    dataset: str


# ---------------------------------------------------------------------------
# Rate-limited HTTP session
# ---------------------------------------------------------------------------

class RateLimitedSession:
    """HTTP session with automatic rate limiting."""

    def __init__(self, rate_limit: float = RATE_LIMIT_SECS):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml",
        })
        self.rate_limit = rate_limit
        self._last_request_time = 0.0

    def get(self, url: str, **kwargs) -> requests.Response:
        elapsed = time.time() - self._last_request_time
        if elapsed < self.rate_limit:
            time.sleep(self.rate_limit - elapsed)
        kwargs.setdefault("timeout", REQUEST_TIMEOUT)
        self._last_request_time = time.time()
        return self.session.get(url, **kwargs)


# ---------------------------------------------------------------------------
# Schema migration
# ---------------------------------------------------------------------------

def migrate_committee_columns(db: sqlite3.Connection) -> None:
    """Add committee-related columns to the speeches table if needed."""
    # Ensure no pending transaction before ALTER TABLE
    try:
        db.commit()
    except sqlite3.OperationalError:
        pass
    cols = {row[1] for row in db.execute("PRAGMA table_info(speeches)").fetchall()}
    for col, default in [
        ("hearing_type", "NULL"),
        ("witness_name", "NULL"),
        ("hearing_id", "NULL"),
    ]:
        if col not in cols:
            try:
                db.execute(
                    f"ALTER TABLE speeches ADD COLUMN {col} TEXT DEFAULT {default}"
                )
                db.commit()
                print(f"  Added '{col}' column to speeches")
            except sqlite3.OperationalError as e:
                if "duplicate column" not in str(e).lower():
                    raise


# ---------------------------------------------------------------------------
# Discovery: find hearing IDs
# ---------------------------------------------------------------------------

def discover_from_estimates_schedule(http: RateLimitedSession) -> list[HearingMetadata]:
    """Scrape the Estimates Transcript Schedule page for hearing links."""
    print("Discovering hearings from Estimates Transcript Schedule...")
    resp = http.get(ESTIMATES_SCHEDULE_URL)
    resp.raise_for_status()
    html = resp.text

    # Extract ParlInfo display links
    pattern = re.compile(
        r'href="((?:https?://)?parlinfo\.aph\.gov\.au/parlInfo/search/display/'
        r'display\.w3p[^"]*)"',
        re.IGNORECASE,
    )
    hearings: dict[str, HearingMetadata] = {}
    for match in pattern.finditer(html):
        url = match.group(1)
        if not url.startswith("http"):
            url = PARLINFO_BASE + url

        # Extract the committee ID from the URL
        id_match = re.search(
            r'committees/(estimate|commsen|commrep|commjnt)/(\d+)/(\d+)', url
        )
        if not id_match:
            # Try URL-encoded version
            decoded = unquote(url)
            id_match = re.search(
                r'committees/(estimate|commsen|commrep|commjnt)/(\d+)/(\d+)',
                decoded,
            )
        if not id_match:
            continue

        dataset = id_match.group(1)
        hearing_num = id_match.group(2)
        hearing_id = f"committees/{dataset}/{hearing_num}"

        if hearing_id not in hearings:
            hearings[hearing_id] = HearingMetadata(
                hearing_id=hearing_id,
                dataset=dataset,
                url=url,
            )

    result = list(hearings.values())
    print(f"  Found {len(result)} hearings from Estimates Schedule")
    return result


def discover_by_id_range(
    http: RateLimitedSession,
    dataset: str = "estimate",
    id_start: int = 29300,
    id_end: int = 29400,
) -> list[HearingMetadata]:
    """Discover hearings by probing ParlInfo with sequential IDs."""
    print(f"Probing ParlInfo for {dataset} IDs {id_start}-{id_end}...")
    hearings = []
    for i in range(id_start, id_end + 1):
        hearing_id = f"committees/{dataset}/{i}"
        url = (
            f"{PARLINFO_BASE}/parlInfo/search/display/display.w3p;"
            f"query=Id%3A%22{quote(hearing_id, safe='')}/0000%22"
        )
        try:
            resp = http.get(url)
            if resp.status_code == 200 and "Not Found" not in resp.text[:500]:
                hearings.append(HearingMetadata(
                    hearing_id=hearing_id,
                    dataset=dataset,
                    url=url,
                ))
                print(f"  Found: {hearing_id}")
            else:
                pass  # Not found, skip silently
        except requests.RequestException:
            pass  # Network error, skip

    print(f"  Found {len(hearings)} hearings by ID probing")
    return hearings


# ---------------------------------------------------------------------------
# Fetch hearing metadata (TOC page)
# ---------------------------------------------------------------------------

def fetch_hearing_toc(
    http: RateLimitedSession, hearing: HearingMetadata
) -> HearingMetadata:
    """Fetch the TOC page (fragment 0000) and extract metadata + fragment list."""
    # Build URL for the TOC page
    toc_url = (
        f"{PARLINFO_BASE}/parlInfo/search/display/display.w3p;"
        f"query=Id%3A%22{quote(hearing.hearing_id, safe='')}/0000%22"
    )
    resp = http.get(toc_url)
    resp.raise_for_status()
    html = resp.text

    # Extract title from <title> tag
    title_match = re.search(r"<title>ParlInfo - (.*?)</title>", html)
    if title_match:
        hearing.title = title_match.group(1).strip()

    # Extract committee name from metadata
    committee_match = re.search(
        r'<dt class="mdLabel">Committee Name</dt>\s*'
        r'<dd class="mdValue"><p class="mdItem">(.*?)</p>',
        html, re.DOTALL,
    )
    if committee_match:
        hearing.committee_name = HTML_TAG_RE.sub("", committee_match.group(1)).strip()

    # Extract date from metadata
    date_match = re.search(
        r'<dt class="mdLabel">Date</dt>\s*'
        r'<dd class="mdValue"><p class="mdItem">(\d{2})-(\d{2})-(\d{4})</p>',
        html, re.DOTALL,
    )
    if date_match:
        hearing.date = f"{date_match.group(3)}-{date_match.group(2)}-{date_match.group(1)}"

    # If no committee name from metadata, try title
    if not hearing.committee_name and hearing.title:
        parts = hearing.title.split(" : ")
        if parts:
            hearing.committee_name = parts[0].strip()

    # Extract fragment links from the TOC
    fragment_pattern = re.compile(
        rf'id={quote(hearing.hearing_id, safe="").replace("/", "%2F")}%2F(\d{{4}})',
        re.IGNORECASE,
    )
    fragment_ids = set()
    for m in fragment_pattern.finditer(html):
        frag_id = m.group(1)
        if frag_id != "0000":  # Skip TOC itself
            fragment_ids.add(frag_id)

    # Also try unquoted pattern
    unquoted_pattern = re.compile(
        rf'id=committees(?:%2F|/){re.escape(hearing.dataset)}'
        rf'(?:%2F|/)\d+(?:%2F|/)(\d{{4}})',
        re.IGNORECASE,
    )
    for m in unquoted_pattern.finditer(html):
        frag_id = m.group(1)
        if frag_id != "0000":
            fragment_ids.add(frag_id)

    hearing.fragment_ids = sorted(fragment_ids)
    return hearing


# ---------------------------------------------------------------------------
# Parse a transcript fragment
# ---------------------------------------------------------------------------

def parse_fragment(
    html: str, hearing: HearingMetadata, fragment_id: str
) -> list[SpeechRecord]:
    """Parse a transcript fragment HTML into speech records."""
    # Find the document content div
    content_start = html.find('id="documentContent"')
    if content_start < 0:
        return []
    content_html = html[content_start:]

    # Extract sub-topic from the sumLink span
    topic = ""
    sum_match = re.search(
        r'class="sumLink">(.*?)</span>', content_html, re.DOTALL
    )
    if sum_match:
        parts = HTML_TAG_RE.sub(" ", sum_match.group(1)).strip()
        parts = MULTI_SPACE_RE.sub(" ", parts)
        # The sumLink has: Committee Name <br/> Date <br/> Estimates <br/> PORTFOLIO <br/> Department
        pieces = [p.strip() for p in parts.split("\n") if p.strip()]
        if not pieces:
            pieces = [p.strip() for p in re.split(r'\s{2,}', parts) if p.strip()]
        # Topic is everything after the date
        topic = " - ".join(pieces[2:]) if len(pieces) > 2 else parts

    # Find the docDiv with actual transcript content
    doc_div_start = content_html.find('class="docDiv"')
    if doc_div_start < 0:
        return []
    doc_html = content_html[doc_div_start:]

    # Parse paragraph by paragraph
    speeches: list[SpeechRecord] = []
    paragraphs = re.findall(
        r'<p class="HPS-Normal"[^>]*>(.*?)</p>', doc_html, re.DOTALL
    )

    for para_html in paragraphs:
        speaker_name = ""
        speaker_type = ""

        # Try each speaker pattern
        for pattern, stype in SPEAKER_PATTERNS:
            match = pattern.search(para_html)
            if match:
                raw_name = HTML_TAG_RE.sub("", match.group(1)).strip()
                # Clean up speaker name
                raw_name = raw_name.rstrip(":").strip()
                if raw_name:
                    speaker_name = raw_name
                    speaker_type = stype
                    break

        # Extract the full text of the paragraph
        text = HTML_TAG_RE.sub("", para_html)
        text = MULTI_SPACE_RE.sub(" ", text).strip()

        # Remove the speaker prefix from text if present
        if speaker_name and text.startswith(speaker_name):
            text = text[len(speaker_name):].lstrip(":").strip()

        # Skip very short content (timestamps, procedural notes)
        if len(text) < 20:
            continue

        # Skip if it's just a timestamp like [09:03]
        if re.match(r"^\[\d{2}:\d{2}\]$", text):
            continue

        if not speaker_name:
            # Try to attach to previous speech as continuation
            if speeches:
                speeches[-1].text += " " + text
                continue
            else:
                speaker_name = "UNKNOWN"
                speaker_type = "unknown"

        speeches.append(SpeechRecord(
            speaker_name=speaker_name,
            speaker_type=speaker_type,
            text=text,
            hearing_id=f"{hearing.hearing_id}/{fragment_id}",
            committee_name=hearing.committee_name,
            date=hearing.date,
            topic=f"{hearing.committee_name} - {topic}" if topic else hearing.committee_name,
            dataset=hearing.dataset,
        ))

    return speeches


def fetch_and_parse_fragment(
    http: RateLimitedSession,
    hearing: HearingMetadata,
    fragment_id: str,
) -> list[SpeechRecord]:
    """Fetch a single transcript fragment and parse it."""
    url = (
        f"{PARLINFO_BASE}/parlInfo/search/display/display.w3p;"
        f"db=COMMITTEES;"
        f"id={quote(hearing.hearing_id, safe='').replace('/', '%2F')}%2F{fragment_id};"
        f"query=Id%3A%22{quote(hearing.hearing_id, safe='').replace('/', '%2F')}%2F0000%22"
    )
    try:
        resp = http.get(url)
        if resp.status_code != 200:
            return []
        return parse_fragment(resp.text, hearing, fragment_id)
    except requests.RequestException as e:
        print(f"    Error fetching fragment {fragment_id}: {e}")
        return []


# ---------------------------------------------------------------------------
# Database operations
# ---------------------------------------------------------------------------

def text_hash(text: str) -> str:
    """Short SHA-256 hex digest for deduplication."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def build_dedup_index(db: sqlite3.Connection) -> set[str]:
    """Build a set of dedup keys from existing committee speeches."""
    seen: set[str] = set()
    rows = db.execute(
        "SELECT speaker_name, date, text FROM speeches "
        "WHERE source IN ('committee_senate', 'committee_house', 'committee_joint')"
    ).fetchall()
    for row in rows:
        key = f"{row['speaker_name'] or ''}|{row['date']}|{text_hash(row['text'])}"
        seen.add(key)
    return seen


def get_ingested_hearings(db: sqlite3.Connection) -> set[str]:
    """Get the set of hearing IDs already ingested."""
    try:
        rows = db.execute(
            "SELECT DISTINCT hearing_id FROM speeches "
            "WHERE hearing_id IS NOT NULL"
        ).fetchall()
        return {row["hearing_id"].rsplit("/", 1)[0] for row in rows if row["hearing_id"]}
    except sqlite3.OperationalError:
        return set()


def _execute_with_retry(db: sqlite3.Connection, sql: str, params: tuple, retries: int = 15) -> None:
    """Execute SQL with retry on database lock."""
    for attempt in range(retries):
        try:
            db.execute(sql, params)
            return
        except sqlite3.OperationalError as e:
            if "locked" in str(e).lower() and attempt < retries - 1:
                time.sleep(3 * (attempt + 1))
            else:
                raise


def _commit_with_retry(db: sqlite3.Connection, retries: int = 5) -> None:
    """Commit with retry on database lock."""
    for attempt in range(retries):
        try:
            db.commit()
            return
        except sqlite3.OperationalError as e:
            if "locked" in str(e).lower() and attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
            else:
                raise


def save_speeches(
    db: sqlite3.Connection,
    speeches: list[SpeechRecord],
    seen: set[str],
) -> int:
    """Insert speeches into the database. Returns count inserted."""
    count = 0
    for sp in speeches:
        if len(sp.text) < 50:
            continue

        dedup_key = f"{sp.speaker_name}|{sp.date}|{text_hash(sp.text)}"
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        source = DATASET_MAP.get(sp.dataset, "committee_senate")
        chamber = CHAMBER_MAP.get(sp.dataset, "senate_committee")
        word_count = len(sp.text.split())

        witness_name = sp.speaker_name if sp.speaker_type == "witness" else None

        _execute_with_retry(
            db,
            """
            INSERT INTO speeches
            (person_id, speaker_name, party, electorate, chamber,
             date, topic, text, word_count, source, state,
             hearing_type, witness_name, hearing_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                None,                # person_id (link later)
                sp.speaker_name,
                None,                # party
                None,                # electorate
                chamber,
                sp.date,
                sp.topic,
                sp.text,
                word_count,
                source,
                "federal",
                "estimates" if sp.dataset == "estimate" else "committee",
                witness_name,
                sp.hearing_id,
            ),
        )
        count += 1

    return count


# ---------------------------------------------------------------------------
# Main ingestion pipeline
# ---------------------------------------------------------------------------

def ingest_hearing(
    http: RateLimitedSession,
    db: sqlite3.Connection,
    hearing: HearingMetadata,
    seen: set[str],
) -> int:
    """Ingest a single hearing. Returns number of speeches inserted."""
    # Fetch TOC to get metadata and fragment list
    try:
        hearing = fetch_hearing_toc(http, hearing)
    except requests.RequestException as e:
        print(f"  Error fetching TOC for {hearing.hearing_id}: {e}")
        return 0

    if not hearing.fragment_ids:
        print(f"  No fragments found for {hearing.hearing_id}")
        return 0

    print(
        f"  {hearing.hearing_id}: {hearing.committee_name or 'Unknown'} "
        f"({hearing.date or 'no date'}) - {len(hearing.fragment_ids)} fragments"
    )

    total_speeches = 0
    pending = 0

    for frag_id in hearing.fragment_ids:
        speeches = fetch_and_parse_fragment(http, hearing, frag_id)
        if speeches:
            n = save_speeches(db, speeches, seen)
            total_speeches += n
            pending += n

            if pending >= BATCH_SIZE:
                _commit_with_retry(db)
                pending = 0

    if pending > 0:
        _commit_with_retry(db)

    print(f"    -> {total_speeches} speeches saved")
    return total_speeches


def main():
    parser = argparse.ArgumentParser(
        description="Ingest Australian committee hearing transcripts from ParlInfo."
    )
    parser.add_argument(
        "--set",
        choices=["estimate", "commsen", "commrep", "commjnt", "all"],
        default="all",
        help="Dataset to ingest (default: all). 'estimate' = Senate Estimates.",
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Maximum number of hearings to process.",
    )
    parser.add_argument(
        "--discover", action="store_true",
        help="Use ID range probing to discover hearings (slower).",
    )
    parser.add_argument(
        "--id-start", type=int, default=29300,
        help="Start of ID range for discovery (default: 29300).",
    )
    parser.add_argument(
        "--id-end", type=int, default=29400,
        help="End of ID range for discovery (default: 29400).",
    )
    parser.add_argument(
        "--skip-ingested", action="store_true", default=True,
        help="Skip hearings already in the database (default: True).",
    )
    parser.add_argument(
        "--no-skip-ingested", action="store_false", dest="skip_ingested",
        help="Re-ingest hearings even if already in the database.",
    )
    args = parser.parse_args()

    # Set up database (use longer timeout for concurrent access)
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")  # 5 min timeout for locked DB
    init_db(db)
    migrate_committee_columns(db)

    # Build dedup index
    print("Building deduplication index...")
    seen = build_dedup_index(db)
    print(f"  {len(seen)} existing committee speeches indexed")

    ingested_hearings = get_ingested_hearings(db) if args.skip_ingested else set()
    if ingested_hearings:
        print(f"  {len(ingested_hearings)} hearings already ingested")

    # Discover hearings
    http = RateLimitedSession()
    hearings: list[HearingMetadata] = []

    if args.discover:
        # ID range probing
        datasets = (
            [args.set] if args.set != "all"
            else ["estimate", "commsen", "commrep", "commjnt"]
        )
        for ds in datasets:
            hearings.extend(
                discover_by_id_range(http, ds, args.id_start, args.id_end)
            )
    else:
        # Estimates Schedule page (primary method)
        schedule_hearings = discover_from_estimates_schedule(http)
        hearings.extend(schedule_hearings)

    # Filter by dataset if specified
    if args.set != "all":
        hearings = [h for h in hearings if h.dataset == args.set]

    # Filter out already-ingested hearings
    if args.skip_ingested:
        before = len(hearings)
        hearings = [h for h in hearings if h.hearing_id not in ingested_hearings]
        skipped = before - len(hearings)
        if skipped:
            print(f"  Skipping {skipped} already-ingested hearings")

    # Apply limit
    if args.limit:
        hearings = hearings[:args.limit]

    print(f"\nWill process {len(hearings)} hearings")

    # Ingest
    total_speeches = 0
    for i, hearing in enumerate(hearings, 1):
        print(f"\n[{i}/{len(hearings)}] Processing {hearing.hearing_id}...")
        n = ingest_hearing(http, db, hearing, seen)
        total_speeches += n

    # Summary
    print(f"\n{'='*60}")
    print(f"Ingestion complete: {total_speeches} speeches from {len(hearings)} hearings")

    total_committee = db.execute(
        "SELECT COUNT(*) FROM speeches "
        "WHERE source IN ('committee_senate', 'committee_house', 'committee_joint')"
    ).fetchone()[0]
    print(f"Total committee speeches in DB: {total_committee}")

    total_all = db.execute("SELECT COUNT(*) FROM speeches").fetchone()[0]
    print(f"Total speeches in DB (all sources): {total_all}")


if __name__ == "__main__":
    main()
