"""
parli.ingest.vic_parliament -- Ingest Victorian Parliament Hansard transcripts.

Scrapes the Parliament of Victoria website for Legislative Assembly and
Legislative Council sitting day transcripts. Uses the undocumented JSON API
at /api/search/debate to discover sitting days, then scrapes each Hansard
detail page for structured speech data.

Data is stored in the shared `speeches` table with:
    source   = 'vic_hansard'
    chamber  = 'vic_la' (Legislative Assembly) or 'vic_lc' (Legislative Council)
    state    = 'vic'

Resume capability: tracks ingested sitting days in a progress table so
interrupted runs can be restarted without duplication.

Usage:
    python -m parli.ingest.vic_parliament                      # ingest all available
    python -m parli.ingest.vic_parliament --since 2024-01-01   # from date
    python -m parli.ingest.vic_parliament --house la           # assembly only
    python -m parli.ingest.vic_parliament --house lc           # council only
    python -m parli.ingest.vic_parliament --test               # one sitting day only
    python -m parli.ingest.vic_parliament --max-days 10        # limit days
"""

import argparse
import hashlib
import re
import sqlite3
import sys
import time
from datetime import datetime

import requests
from bs4 import BeautifulSoup

from parli.schema import get_db, init_db

# --------------------------------------------------------------------------- #
# Constants
# --------------------------------------------------------------------------- #

BASE_URL = "https://www.parliament.vic.gov.au"
DEBATE_API = f"{BASE_URL}/api/search/debate"

# House IDs in the Parliament of Victoria API
HOUSE_LA = "10"  # Legislative Assembly
HOUSE_LC = "20"  # Legislative Council

CHAMBER_MAP = {
    HOUSE_LA: "vic_la",
    HOUSE_LC: "vic_lc",
}

HOUSE_LABEL = {
    HOUSE_LA: "Legislative Assembly",
    HOUSE_LC: "Legislative Council",
}

# Regex helpers
HTML_TAG_RE = re.compile(r"<[^>]+>")
MULTI_SPACE_RE = re.compile(r"[ \t]+")
SPEAKER_TIME_RE = re.compile(r"\((\d{1,2}:\d{2})\)\s*:?\s*$")
SPEAKER_ELECTORATE_RE = re.compile(r"^(.+?)\s*\(([^)]+)\)\s*(?:\((\d{1,2}:\d{2})\))?\s*:?\s*$")

BATCH_SIZE = 500
REQUEST_DELAY = 0.15  # seconds between page fetches

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "OPAX-VicHansardIngestor/1.0 (opax.com.au; research)",
    "Accept": "text/html,application/json",
})


# --------------------------------------------------------------------------- #
# Database helpers
# --------------------------------------------------------------------------- #

def configure_db(db: sqlite3.Connection) -> None:
    """Set pragmas for reliable ingestion."""
    db.execute("PRAGMA busy_timeout = 120000")  # 2 minute wait for locks


def ensure_state_column(db: sqlite3.Connection) -> None:
    """Add 'state' column to key tables if not present."""
    for table in ("speeches", "divisions", "members", "donations"):
        try:
            cols = {row[1] for row in db.execute(f"PRAGMA table_info({table})").fetchall()}
        except Exception:
            continue
        if "state" not in cols:
            db.execute(f"ALTER TABLE {table} ADD COLUMN state TEXT DEFAULT 'federal'")
            db.commit()
            print(f"  Added 'state' column to {table}")


def ensure_progress_table(db: sqlite3.Connection) -> None:
    """Create ingestion progress table for resume capability."""
    db.execute("""
        CREATE TABLE IF NOT EXISTS vic_hansard_progress (
            sitting_date TEXT NOT NULL,
            chamber TEXT NOT NULL,
            entry_id TEXT NOT NULL,
            speeches_count INTEGER DEFAULT 0,
            ingested_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (sitting_date, chamber)
        )
    """)
    db.commit()


def is_day_ingested(db: sqlite3.Connection, sitting_date: str, chamber: str) -> bool:
    """Check if a sitting day has already been ingested."""
    row = db.execute(
        "SELECT 1 FROM vic_hansard_progress WHERE sitting_date = ? AND chamber = ?",
        (sitting_date, chamber),
    ).fetchone()
    return row is not None


def mark_day_ingested(
    db: sqlite3.Connection, sitting_date: str, chamber: str,
    entry_id: str, count: int,
) -> None:
    """Mark a sitting day as successfully ingested."""
    db.execute(
        """INSERT OR REPLACE INTO vic_hansard_progress
           (sitting_date, chamber, entry_id, speeches_count)
           VALUES (?, ?, ?, ?)""",
        (sitting_date, chamber, entry_id, count),
    )
    db.commit()


# --------------------------------------------------------------------------- #
# API: discover sitting days
# --------------------------------------------------------------------------- #

def fetch_sitting_days(
    house_id: str,
    since: str | None = None,
    max_pages: int = 500,
) -> list[dict]:
    """
    Fetch sitting day metadata from the Parliament of Victoria API.

    Returns list of dicts with keys:
        id, date, title, category, status, online_href, chamber
    """
    days = []
    page = 1

    while page <= max_pages:
        params = {"page": page, "pageSize": 20, "hansard-house": house_id}
        try:
            r = SESSION.get(DEBATE_API, params=params, timeout=30)
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            print(f"  API error on page {page}: {e}")
            break

        hits = data.get("result", {}).get("hits", [])
        if not hits:
            break

        for hit in hits:
            if not hit:
                continue
            date_str = hit.get("date1", "")
            if date_str:
                # Parse ISO date to YYYY-MM-DD
                try:
                    dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                    date_ymd = dt.strftime("%Y-%m-%d")
                except (ValueError, TypeError):
                    date_ymd = date_str[:10]
            else:
                continue

            if since and date_ymd < since:
                # Results are in reverse chronological order; stop early
                return days

            online_btn = hit.get("onlineButton")
            online = online_btn.get("href", "") if online_btn else ""
            if not online:
                continue

            days.append({
                "id": hit.get("id", ""),
                "date": date_ymd,
                "title": hit.get("title", ""),
                "category": hit.get("category", ""),
                "status": hit.get("status", ""),
                "online_href": online,
                "chamber": CHAMBER_MAP.get(house_id, "vic_la"),
            })

        page += 1
        time.sleep(0.2)

    return days


# --------------------------------------------------------------------------- #
# Scraping: extract speeches from a sitting day
# --------------------------------------------------------------------------- #

def clean_text(text: str) -> str | None:
    """Strip HTML, collapse whitespace. Return None if too short."""
    text = HTML_TAG_RE.sub("", text)
    text = MULTI_SPACE_RE.sub(" ", text).strip()
    if len(text) < 50:
        return None
    return text


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def _parse_speaker_attribution(text: str) -> tuple[str, str]:
    """
    Parse 'Speaker NAME (Electorate) (HH:MM):' into (name, electorate).
    Returns (name, electorate) or (text, '') if no match.
    """
    m = SPEAKER_ELECTORATE_RE.match(text.strip().rstrip(":").strip())
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return text.strip().rstrip(":").strip(), ""


def scrape_sitting_day(online_href: str, chamber: str, sitting_date: str) -> list[dict]:
    """
    Scrape all speeches from a single sitting day.

    Follows the 'Read online' link which points to the first entry of the day.
    That page contains sidebar links to all entries for the day. We scrape the
    single page which contains all the speeches for that entry (one entry =
    one topic/debate block).

    Strategy:
      1. Fetch the first entry page.
      2. Collect all unique entry IDs from the sidebar links.
      3. Fetch each entry page and extract speeches.
    """
    url = BASE_URL + online_href
    try:
        r = SESSION.get(url, timeout=30)
        r.raise_for_status()
    except Exception as e:
        print(f"    Error fetching {url}: {e}")
        return []

    soup = BeautifulSoup(r.text, "html.parser")

    # Collect all entry IDs for this sitting day from sidebar links
    entry_ids = set()
    for a_tag in soup.find_all("a", href=True):
        href = a_tag["href"]
        m = re.search(r"HANSARD-(\d+)-(\d+)", href, re.IGNORECASE)
        if m:
            full_id = f"HANSARD-{m.group(1)}-{m.group(2)}"
            entry_ids.add(full_id)

    # Sort entry IDs by the numeric suffix (order of proceedings)
    sorted_entries = sorted(entry_ids, key=lambda x: int(x.rsplit("-", 1)[-1]))

    all_speeches = []

    # Extract speeches from the first page we already have
    first_id = online_href.rsplit("/", 1)[-1].upper()
    page_speeches = _extract_speeches_from_page(soup, chamber, sitting_date)
    all_speeches.extend(page_speeches)
    processed = {first_id}

    # Fetch remaining entry pages
    to_fetch = [e for e in sorted_entries if e.upper() not in processed]
    for idx, entry_id in enumerate(to_fetch):
        processed.add(entry_id.upper())

        entry_url = f"{BASE_URL}/parliamentary-activity/hansard/hansard-details/{entry_id}"
        try:
            time.sleep(REQUEST_DELAY)
            r = SESSION.get(entry_url, timeout=30)
            r.raise_for_status()
        except requests.exceptions.HTTPError as e:
            if r.status_code == 404:
                continue  # some IDs are PDF references, not pages
            print(f"\n    Error fetching {entry_url}: {e}")
            continue
        except Exception as e:
            print(f"\n    Error fetching {entry_url}: {e}")
            continue

        entry_soup = BeautifulSoup(r.text, "html.parser")
        page_speeches = _extract_speeches_from_page(entry_soup, chamber, sitting_date)
        all_speeches.extend(page_speeches)

        if (idx + 1) % 20 == 0:
            print(f" [{idx+1}/{len(to_fetch)}]", end="", flush=True)

    return all_speeches


def _extract_speeches_from_page(
    soup: BeautifulSoup, chamber: str, sitting_date: str,
) -> list[dict]:
    """Extract speech records from a single Hansard detail page."""
    hansard_div = soup.find("div", class_="HpsHansard")
    if not hansard_div:
        return []

    speeches = []
    current_topic = ""
    current_proceeding = ""

    # Track proceeding and topic headings as we traverse
    for el in hansard_div.children:
        if not hasattr(el, "name") or not el.name:
            continue

        # Check for heading spans in <p> tags
        if el.name == "p":
            proc_span = el.find("span", class_="HpsProceedingHeading")
            if proc_span:
                current_proceeding = proc_span.text.strip()
                continue

            subj_span = el.find("span", class_="HpsSubjectHeading")
            if subj_span:
                current_topic = subj_span.text.strip()
                continue

            subproc_span = el.find("span", class_="HpsSubproceedingHeading")
            if subproc_span:
                # Sub-proceeding (e.g. "Second reading") -- append to topic
                sub = subproc_span.text.strip()
                if sub and current_topic and sub not in current_topic:
                    current_topic = f"{current_topic} - {sub}"
                continue

        # Speech wrappers
        if el.name == "div" and el.get("data-js-hook") == "speech-wrapper":
            speech = _extract_single_speech(
                el, hansard_div, chamber, sitting_date,
                current_topic, current_proceeding,
            )
            if speech:
                speeches.append(speech)

    return speeches


def _extract_single_speech(
    wrapper, hansard_div, chamber: str, sitting_date: str,
    topic: str, proceeding: str,
) -> dict | None:
    """
    Extract a single speech from a speech-wrapper div.

    Handles continuation wrappers (id like "51X1", "51X2") by merging them
    into the primary speech wrapper.
    """
    wrapper_id = wrapper.get("id", "")
    if not wrapper_id:
        return None

    # Skip continuation wrappers -- they'll be merged into the primary
    if "X" in str(wrapper_id) and wrapper_id.split("X")[0].isdigit():
        return None

    # Skip interjections (no speaker name, short text)
    speaker_el = wrapper.find("a", attrs={"data-speaker-name": True})

    # Try to get speaker name from the HpsBy span if no data attribute
    speaker_name = ""
    electorate = ""

    if speaker_el:
        speaker_name = speaker_el.get("data-speaker-name", "")
        # Parse electorate from the link text
        link_text = speaker_el.text.strip()
        _, electorate = _parse_speaker_attribution(link_text)
    else:
        # Try HpsBy span
        by_span = wrapper.find("span", class_="HpsBy")
        if by_span:
            by_link = by_span.find("a")
            if by_link:
                speaker_name = by_link.text.strip().rstrip(":")
                _, electorate = _parse_speaker_attribution(by_link.text)

    if not speaker_name:
        return None

    # Collect text from this wrapper and all continuations
    text_parts = _collect_speech_text(wrapper)

    # Find and merge continuation wrappers (id pattern: {base_id}X{n})
    base_id = wrapper_id
    for sibling in wrapper.find_next_siblings("div", attrs={"data-js-hook": "speech-wrapper"}):
        sib_id = sibling.get("id", "")
        if sib_id.startswith(f"{base_id}X"):
            text_parts.extend(_collect_speech_text(sibling))
        elif sib_id == base_id or (sib_id and not sib_id.startswith(f"{base_id}X")):
            # Different speaker or a new primary wrapper
            break

    full_text = " ".join(text_parts)

    # Clean the speaker name prefix from text
    # The text often starts with "Speaker NAME (Electorate) (HH:MM): ..."
    full_text = re.sub(
        r"^" + re.escape(speaker_name) + r"\s*(?:\([^)]*\)\s*)*:?\s*",
        "",
        full_text,
    )

    cleaned = clean_text(full_text)
    if not cleaned:
        return None

    # Normalize speaker name: "Matthew GUY" -> "Matthew Guy"
    normalized_name = _normalize_name(speaker_name)

    word_count = len(cleaned.split())

    return {
        "speaker_name": normalized_name,
        "electorate": electorate,
        "chamber": chamber,
        "date": sitting_date,
        "topic": topic if topic else proceeding,
        "text": cleaned,
        "word_count": word_count,
    }


def _collect_speech_text(wrapper) -> list[str]:
    """Collect readable text from all <p> elements in a speech wrapper."""
    parts = []
    for p in wrapper.find_all("p"):
        # Get all HpsNormal spans (main speech text)
        normals = p.find_all("span", class_="HpsNormal")
        if normals:
            for span in normals:
                # Remove the speaker image/menu elements
                for img in span.find_all("span", attrs={"data-js-hook": "speaker-info"}):
                    img.decompose()
                text = span.get_text(separator=" ").strip()
                if text:
                    parts.append(text)
        else:
            # Fallback: get direct text from <p>
            text = p.get_text(separator=" ").strip()
            if text and not text.startswith("Members interjecting"):
                parts.append(text)
    return parts


def _normalize_name(name: str) -> str:
    """
    Normalize Victorian Hansard speaker names.
    E.g. 'Matthew GUY' -> 'Matthew Guy', 'The SPEAKER' -> 'The Speaker'
    """
    words = name.split()
    result = []
    for w in words:
        if w.isupper() and len(w) > 1:
            result.append(w.capitalize())
        else:
            result.append(w)
    return " ".join(result)


# --------------------------------------------------------------------------- #
# Main ingestion loop
# --------------------------------------------------------------------------- #

def ingest_house(
    db: sqlite3.Connection,
    house_id: str,
    since: str | None = None,
    max_days: int | None = None,
    test_mode: bool = False,
) -> int:
    """Ingest all sitting days for one house. Returns speech count."""
    chamber = CHAMBER_MAP[house_id]
    label = HOUSE_LABEL[house_id]
    db.execute("PRAGMA busy_timeout = 300000")  # 5 min wait for locks
    print(f"\n{'='*60}")
    print(f"Fetching sitting day index for {label}...")

    days = fetch_sitting_days(house_id, since=since)
    print(f"  Found {len(days)} sitting days")

    if test_mode:
        days = days[:1]
        print("  TEST MODE: processing only the most recent day")
    elif max_days:
        days = days[:max_days]
        print(f"  Limited to {max_days} days")

    total_speeches = 0
    pending = 0
    skipped = 0

    for i, day in enumerate(days):
        sitting_date = day["date"]

        # Resume: skip already ingested days
        if is_day_ingested(db, sitting_date, chamber):
            skipped += 1
            continue

        print(f"  [{i+1}/{len(days)}] {sitting_date} ({day['status']})...", end="", flush=True)

        speeches = scrape_sitting_day(day["online_href"], chamber, sitting_date)

        day_count = 0
        for speech in speeches:
            row = (
                None,
                speech["speaker_name"],
                "",  # party -- could be enriched later
                speech["electorate"],
                speech["chamber"],
                speech["date"],
                speech["topic"],
                speech["text"],
                speech["word_count"],
                "vic_hansard",
                "vic",
            )
            for attempt in range(10):
                try:
                    db.execute(
                        """INSERT INTO speeches
                           (person_id, speaker_name, party, electorate, chamber,
                            date, topic, text, word_count, source, state)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        row,
                    )
                    day_count += 1
                    pending += 1
                    break
                except sqlite3.IntegrityError:
                    break  # duplicate
                except sqlite3.OperationalError as e:
                    if "locked" in str(e) and attempt < 9:
                        time.sleep(2 * (attempt + 1))
                        continue
                    raise

            if pending >= BATCH_SIZE:
                db.commit()
                pending = 0

        db.commit()
        mark_day_ingested(db, sitting_date, chamber, day["id"], day_count)
        total_speeches += day_count
        print(f" {day_count} speeches")

    if skipped:
        print(f"  Skipped {skipped} already-ingested days")

    return total_speeches


def main():
    parser = argparse.ArgumentParser(
        description="Ingest Victorian Parliament Hansard into the OPAX database.",
    )
    parser.add_argument(
        "--since", type=str, default=None,
        help="Only ingest sitting days after this date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--house", type=str, default=None, choices=["la", "lc"],
        help="Only ingest one house: 'la' (Assembly) or 'lc' (Council)",
    )
    parser.add_argument(
        "--test", action="store_true",
        help="Test mode: process only the most recent sitting day per house",
    )
    parser.add_argument(
        "--max-days", type=int, default=None,
        help="Maximum number of sitting days to process per house",
    )
    parser.add_argument(
        "--reset", action="store_true",
        help="Clear progress tracking and re-ingest all days",
    )
    parser.add_argument(
        "--db", type=str, default=None,
        help="Path to SQLite database (default: shared parli.db)",
    )
    args = parser.parse_args()

    db = get_db(args.db)
    init_db(db)
    configure_db(db)
    ensure_state_column(db)
    ensure_progress_table(db)

    if args.reset:
        db.execute("DELETE FROM vic_hansard_progress")
        db.commit()
        print("Progress tracking cleared.")

    houses = []
    if args.house == "la":
        houses = [HOUSE_LA]
    elif args.house == "lc":
        houses = [HOUSE_LC]
    else:
        houses = [HOUSE_LA, HOUSE_LC]

    grand_total = 0
    for house_id in houses:
        count = ingest_house(
            db,
            house_id,
            since=args.since,
            max_days=args.max_days,
            test_mode=args.test,
        )
        grand_total += count

    # Summary
    print(f"\n{'='*60}")
    print(f"Ingestion complete. {grand_total} new speeches added.")

    vic_total = db.execute(
        "SELECT COUNT(*) FROM speeches WHERE source = 'vic_hansard'"
    ).fetchone()[0]
    print(f"Total VIC Hansard speeches in DB: {vic_total}")

    for ch_label, ch_code in [("Legislative Assembly", "vic_la"), ("Legislative Council", "vic_lc")]:
        n = db.execute(
            "SELECT COUNT(*) FROM speeches WHERE chamber = ?", (ch_code,)
        ).fetchone()[0]
        if n:
            print(f"  {ch_label}: {n}")

    progress = db.execute(
        "SELECT COUNT(*) FROM vic_hansard_progress"
    ).fetchone()[0]
    print(f"Sitting days tracked: {progress}")


if __name__ == "__main__":
    main()
