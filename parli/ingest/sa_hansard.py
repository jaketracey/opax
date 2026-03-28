"""
parli.ingest.sa_hansard -- Ingest South Australian Parliament Hansard speeches
via the SA Parliament Hansard Search website.

Endpoints used:
  - /search/calendar/{year}            -> sitting dates (parsed from HTML)
  - /daily/{ch}/{date}/download/toc    -> XML table of contents with topic refs
  - /daily/{ch}/{date}/extract/{ref}/download -> XML speech extract

Chamber codes: lh = House of Assembly, uh = Legislative Council
Coverage: All 55 parliaments (1857-present), digitised records vary.
No authentication required.

Usage:
    python -m parli.ingest.sa_hansard --since 2020-01-01
    python -m parli.ingest.sa_hansard --since 2024-01-01 --limit 500
    python -m parli.ingest.sa_hansard --since 2020-01-01 --chamber sa_ha --dry-run
"""

import argparse
import functools
import hashlib
import re
import sqlite3
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime
from pathlib import Path

# Force unbuffered output for background/nohup runs
print = functools.partial(print, flush=True)

from parli.schema import get_db, init_db

BASE_URL = "https://hansardsearch.parliament.sa.gov.au"
USER_AGENT = "Mozilla/5.0 (compatible; OPAX/1.0; +https://opax.com.au)"

# Map SA chamber codes to our DB codes
CHAMBER_MAP = {
    "lh": "sa_ha",  # Lower House -> House of Assembly
    "uh": "sa_lc",  # Upper House -> Legislative Council
}

# Reverse: DB code -> SA site code
SA_CHAMBER = {
    "sa_ha": "lh",
    "sa_lc": "uh",
}

# Rate limiting: seconds between API calls
REQUEST_DELAY = 0.15

# HTML/XML tag stripping
HTML_TAG_RE = re.compile(r"<[^>]+>")
MULTI_SPACE_RE = re.compile(r"\s+")

# Minimum speech length (characters) to store
MIN_SPEECH_LEN = 50

BATCH_SIZE = 500

# Progress tracking
PROGRESS_DIR = Path("~/.cache/autoresearch/sa_hansard").expanduser()


def _api_get(url: str, retries: int = 3) -> bytes:
    """Make a GET request with rate limiting and retries."""
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "*/*",
    })
    for attempt in range(retries):
        try:
            time.sleep(REQUEST_DELAY)
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read()
        except Exception as e:
            if attempt == retries - 1:
                raise
            wait = 2 ** (attempt + 1)
            print(f"  Retry {attempt + 1}/{retries} after error: {e} (waiting {wait}s)")
            time.sleep(wait)
    return b""


def text_hash(text: str) -> str:
    """Short SHA-256 hex digest for deduplication."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def clean_text(text: str) -> str:
    """Strip XML/HTML tags and collapse whitespace."""
    text = HTML_TAG_RE.sub(" ", text)
    text = MULTI_SPACE_RE.sub(" ", text).strip()
    return text


# ---------------------------------------------------------------------------
# Step 1: Discover sitting dates from the calendar
# ---------------------------------------------------------------------------

def get_sitting_dates_for_year(year: int) -> list[str]:
    """Fetch sitting dates for a given year from the calendar page.

    Returns dates as YYYY-MM-DD strings.
    """
    url = f"{BASE_URL}/search/calendar/{year}"
    try:
        html = _api_get(url).decode("utf-8", errors="replace")
    except Exception as e:
        print(f"  Error fetching calendar for {year}: {e}")
        return []

    # Parse getEvents("DD/MM/YYYY", ...) calls from the HTML
    pattern = re.compile(r'getEvents\("(\d{2}/\d{2}/\d{4})"')
    dates = set()
    for match in pattern.finditer(html):
        raw = match.group(1)  # DD/MM/YYYY
        try:
            dt = datetime.strptime(raw, "%d/%m/%Y")
            dates.add(dt.strftime("%Y-%m-%d"))
        except ValueError:
            continue

    return sorted(dates)


def get_sitting_dates(since: date, until: date) -> list[str]:
    """Get all sitting dates in a date range."""
    all_dates = []
    for year in range(since.year, until.year + 1):
        print(f"  Fetching sitting dates for {year}...")
        year_dates = get_sitting_dates_for_year(year)
        for d in year_dates:
            if since.isoformat() <= d <= until.isoformat():
                all_dates.append(d)
    return sorted(all_dates)


# ---------------------------------------------------------------------------
# Step 2: Fetch TOC and extract topic refs for a sitting day
# ---------------------------------------------------------------------------

def get_toc(chamber: str, date_str: str) -> list[dict]:
    """Fetch the XML table of contents for a chamber/date.

    Args:
        chamber: SA site chamber code ('lh' or 'uh')
        date_str: date as YYYY-MM-DD

    Returns list of dicts: {ref, uid, topic, proceeding}
    """
    url = f"{BASE_URL}/daily/{chamber}/{date_str}/download/toc"
    try:
        data = _api_get(url)
    except Exception as e:
        print(f"    Error fetching TOC {chamber}/{date_str}: {e}")
        return []

    try:
        # Strip the leading XML comment if present
        text = data.decode("utf-8", errors="replace")
        # Find the start of the XML root element
        root = ET.fromstring(text[text.index("<hansard"):] if "<hansard" in text else text)
    except (ET.ParseError, ValueError) as e:
        print(f"    Error parsing TOC XML {chamber}/{date_str}: {e}")
        return []

    topics = []
    for proc in root.iter("proceeding"):
        proc_name = ""
        proc_info = proc.find("proceedinginfo")
        if proc_info is not None:
            t = proc_info.find("text")
            if t is not None and t.text:
                proc_name = t.text.strip()

        for topic in proc.findall("topic"):
            ref = topic.get("ref", "")
            uid = topic.get("uid", "")
            topic_name = ""
            ti = topic.find("topicinfo")
            if ti is not None:
                t = ti.find("text")
                if t is not None and t.text:
                    topic_name = t.text.strip()

            if ref:
                topics.append({
                    "ref": ref,
                    "uid": uid,
                    "topic": topic_name,
                    "proceeding": proc_name,
                })

    return topics


# ---------------------------------------------------------------------------
# Step 3: Fetch and parse individual speech extracts
# ---------------------------------------------------------------------------

def _extract_text_from_elem(elem: ET.Element) -> str:
    """Recursively extract text content from an XML element."""
    parts = []
    if elem.text:
        parts.append(elem.text.strip())
    for child in elem:
        # Skip <by> elements (speaker attribution lines) and <event> (interjections etc)
        if child.tag == "by":
            if child.tail:
                parts.append(child.tail.strip())
            continue
        if child.tag == "event":
            if child.tail:
                parts.append(child.tail.strip())
            continue
        if child.tag == "timeStamp":
            if child.tail:
                parts.append(child.tail.strip())
            continue
        child_text = _extract_text_from_elem(child)
        if child_text:
            parts.append(child_text)
        if child.tail:
            parts.append(child.tail.strip())
    return " ".join(p for p in parts if p)


def fetch_extract(chamber: str, date_str: str, ref: str) -> list[dict]:
    """Fetch a speech extract XML and parse individual speeches.

    Returns list of dicts:
        {speaker_name, speaker_id, party, electorate, topic, proceeding, text}
    """
    url = f"{BASE_URL}/daily/{chamber}/{date_str}/extract/{ref}/download"
    try:
        data = _api_get(url)
    except Exception as e:
        print(f"      Error fetching extract {chamber}/{date_str}/{ref}: {e}")
        return []

    try:
        text = data.decode("utf-8", errors="replace")
        # Find the XML root
        if "<hansard" in text:
            xml_text = text[text.index("<hansard"):]
        else:
            xml_text = text
        root = ET.fromstring(xml_text)
    except (ET.ParseError, ValueError) as e:
        print(f"      Error parsing extract XML {chamber}/{date_str}/{ref}: {e}")
        return []

    speeches = []

    # Extract topic name from the <subject> or <proceeding> level
    topic = ""
    for subject in root.iter("subject"):
        name_elem = subject.find("name")
        if name_elem is not None and name_elem.text:
            topic = name_elem.text.strip()
            break
    if not topic:
        for proc in root.iter("proceeding"):
            name_elem = proc.find("name")
            if name_elem is not None and name_elem.text:
                topic = name_elem.text.strip()
                break

    # Parse each <talker> element as a speech
    for talker in root.iter("talker"):
        speaker_name = ""
        speaker_id = talker.get("id", "")
        electorate = ""
        party = ""

        name_elem = talker.find("name")
        if name_elem is not None and name_elem.text:
            speaker_name = name_elem.text.strip()

        elec_elem = talker.find("electorate")
        if elec_elem is not None and elec_elem.text:
            electorate = elec_elem.text.strip()

        party_elem = talker.find("party")
        if party_elem is not None and party_elem.text:
            party = party_elem.text.strip()

        # Collect all <text> elements within this talker
        text_parts = []
        for text_elem in talker.findall("text"):
            t = _extract_text_from_elem(text_elem)
            if t:
                text_parts.append(t)

        full_text = " ".join(text_parts).strip()
        full_text = clean_text(full_text)

        if len(full_text) < MIN_SPEECH_LEN:
            continue

        # Skip purely procedural speakers (The Speaker, The President, clerks)
        role = talker.get("role", "")
        kind = talker.get("kind", "")
        if role == "office" and kind == "speech" and not full_text:
            continue

        speeches.append({
            "speaker_name": speaker_name,
            "speaker_id": speaker_id,
            "party": party,
            "electorate": electorate,
            "topic": topic,
            "text": full_text,
        })

    return speeches


# ---------------------------------------------------------------------------
# Step 4: Ingest into database
# ---------------------------------------------------------------------------

def load_progress(progress_file: Path) -> set[str]:
    """Load set of completed day+chamber keys from progress file."""
    if not progress_file.exists():
        return set()
    with open(progress_file, "r") as f:
        return {line.strip() for line in f if line.strip()}


def save_progress(progress_file: Path, key: str) -> None:
    """Append a completed key to the progress file."""
    progress_file.parent.mkdir(parents=True, exist_ok=True)
    with open(progress_file, "a") as f:
        f.write(key + "\n")


def build_dedup_set(db: sqlite3.Connection) -> set[str]:
    """Build deduplication set from existing SA Hansard speeches."""
    seen: set[str] = set()
    rows = db.execute(
        "SELECT speaker_name, date, text FROM speeches WHERE source = 'sa_hansard'"
    ).fetchall()
    for row in rows:
        key = f"{row['speaker_name'] or ''}|{row['date']}|{text_hash(row['text'])}"
        seen.add(key)
    return seen


def ingest_day_chamber(
    db: sqlite3.Connection,
    date_str: str,
    sa_chamber: str,
    seen: set[str],
    dry_run: bool = False,
    limit: int | None = None,
    total_so_far: int = 0,
) -> int:
    """Ingest all speeches for one sitting day + chamber.

    Returns count of speeches inserted.
    """
    db_chamber = CHAMBER_MAP[sa_chamber]
    toc = get_toc(sa_chamber, date_str)
    if not toc:
        return 0

    count = 0
    pending = 0

    for entry in toc:
        if limit is not None and (total_so_far + count) >= limit:
            break

        ref = entry["ref"]
        speeches = fetch_extract(sa_chamber, date_str, ref)

        for speech in speeches:
            if limit is not None and (total_so_far + count) >= limit:
                break

            # Dedup
            dedup_key = f"{speech['speaker_name']}|{date_str}|{text_hash(speech['text'])}"
            if dedup_key in seen:
                continue
            seen.add(dedup_key)

            word_count = len(speech["text"].split())

            if dry_run:
                print(f"      [{db_chamber}] {speech['speaker_name']}: "
                      f"{speech['topic'][:60]}... ({word_count} words)")
                count += 1
                continue

            db.execute(
                """
                INSERT INTO speeches
                (person_id, speaker_name, party, electorate, chamber,
                 date, topic, text, word_count, source, state)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    None,
                    speech["speaker_name"],
                    speech["party"],
                    speech["electorate"],
                    db_chamber,
                    date_str,
                    speech["topic"] or entry["topic"] or None,
                    speech["text"],
                    word_count,
                    "sa_hansard",
                    "sa",
                ),
            )
            count += 1
            pending += 1

            if pending >= BATCH_SIZE:
                db.commit()
                pending = 0

    if pending > 0 and not dry_run:
        db.commit()

    return count


def main():
    parser = argparse.ArgumentParser(
        description="Ingest SA Parliament Hansard speeches into the parli database."
    )
    parser.add_argument(
        "--since", type=str, default="2020-01-01",
        help="Start date (YYYY-MM-DD), default 2020-01-01",
    )
    parser.add_argument(
        "--until", type=str, default=str(date.today()),
        help="End date (YYYY-MM-DD), default today",
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Maximum number of speeches to ingest",
    )
    parser.add_argument(
        "--chamber", type=str, default=None,
        choices=["sa_ha", "sa_lc"],
        help="Ingest only one chamber (default: both)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print what would be ingested without writing to DB",
    )
    parser.add_argument(
        "--no-resume", action="store_true",
        help="Ignore progress file and re-ingest everything",
    )
    args = parser.parse_args()

    since = date.fromisoformat(args.since)
    until = date.fromisoformat(args.until)

    chambers_to_ingest = ["lh", "uh"]
    if args.chamber:
        chambers_to_ingest = [SA_CHAMBER[args.chamber]]

    print("SA Hansard Ingestor")
    print(f"  Date range: {since} to {until}")
    print(f"  Chambers: {[CHAMBER_MAP[c] for c in chambers_to_ingest]}")
    print(f"  Limit: {args.limit or 'none'}")
    print(f"  Dry run: {args.dry_run}")

    db = get_db()
    db.close()
    # Reopen with a longer timeout for concurrent access
    from parli.schema import DEFAULT_DB_PATH
    db = sqlite3.connect(str(DEFAULT_DB_PATH), timeout=120)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode = WAL")
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA busy_timeout = 300000")
    init_db(db)

    # Progress tracking
    progress_file = PROGRESS_DIR / "progress.txt"
    if args.no_resume:
        completed = set()
        print("  Resume: disabled (--no-resume)")
    else:
        completed = load_progress(progress_file)
        print(f"  Resume: {len(completed)} day/chamber combos already completed")

    # Build dedup set
    print("\nBuilding deduplication index...")
    seen = build_dedup_set(db)
    print(f"  {len(seen)} existing SA speeches indexed")

    # Discover sitting dates
    print("\nFetching sitting day calendar...")
    sitting_dates = get_sitting_dates(since, until)
    print(f"  Found {len(sitting_dates)} sitting dates")

    total_speeches = 0
    total_days = 0
    hit_limit = False

    for i, date_str in enumerate(sitting_dates, 1):
        if hit_limit:
            break

        for sa_ch in chambers_to_ingest:
            if hit_limit:
                break

            progress_key = f"{sa_ch}/{date_str}"
            if progress_key in completed:
                continue

            db_ch = CHAMBER_MAP[sa_ch]
            label = f"[{i}/{len(sitting_dates)}] {date_str} {db_ch}"
            print(f"\n{label}")

            try:
                n = ingest_day_chamber(
                    db, date_str, sa_ch, seen,
                    dry_run=args.dry_run,
                    limit=args.limit,
                    total_so_far=total_speeches,
                )
            except Exception as e:
                print(f"  ERROR: {e}")
                import traceback
                traceback.print_exc()
                continue

            total_speeches += n
            total_days += 1
            print(f"  -> {n} speeches (total: {total_speeches})")

            if not args.dry_run:
                save_progress(progress_file, progress_key)

            if args.limit and total_speeches >= args.limit:
                print(f"\n  Reached limit of {args.limit} speeches.")
                hit_limit = True

    # Summary
    print(f"\n{'=' * 60}")
    print(f"Ingestion complete.")
    print(f"  Days processed: {total_days}")
    print(f"  Speeches ingested: {total_speeches}")

    if not args.dry_run:
        total_sa = db.execute(
            "SELECT COUNT(*) FROM speeches WHERE source = 'sa_hansard'"
        ).fetchone()[0]
        total_all = db.execute("SELECT COUNT(*) FROM speeches").fetchone()[0]
        print(f"  Total SA speeches in DB: {total_sa}")
        print(f"  Total speeches in DB: {total_all}")

        # Rebuild FTS5 index
        print("\nRebuilding FTS5 index...")
        try:
            db.execute("INSERT INTO speeches_fts(speeches_fts) VALUES('rebuild')")
            db.commit()
            print("  Done.")
        except sqlite3.OperationalError as e:
            print(f"  FTS rebuild skipped: {e}")

    db.close()


if __name__ == "__main__":
    main()
