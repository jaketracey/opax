"""
parli.ingest.nsw_hansard -- Ingest NSW Parliament Hansard speeches via the
official NSW Parliament API.

API base: https://api.parliament.nsw.gov.au/api/hansard/search/
Endpoints used:
  - /year/{year}         -> list of sitting days with TocDocId per chamber
  - /daily/tableofcontents/{TocDocId}  -> XML table of contents with topic UIDs
  - /daily/fragment/{uid}              -> XML fragment with full speech text

Coverage: September 1991 to present.
No authentication required.

Usage:
    python -m parli.ingest.nsw_hansard --start 2020-01-01 --end 2026-03-28
    python -m parli.ingest.nsw_hansard --start 2024-01-01 --end 2024-01-31 --dry-run
"""

import argparse
import hashlib
import json
import re
import sqlite3
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

from parli.schema import get_db, init_db

API_BASE = "https://api.parliament.nsw.gov.au/api/hansard/search"
USER_AGENT = "Mozilla/5.0 (compatible; OPAX/1.0; +https://opax.com.au)"

# Map chamber names from the API to our DB codes
CHAMBER_MAP = {
    "Legislative Assembly": "nsw_la",
    "Legislative Council": "nsw_lc",
}

# Rate limiting: seconds between API calls
REQUEST_DELAY = 0.1

# HTML tag stripping
HTML_TAG_RE = re.compile(r"<[^>]+>")
MULTI_SPACE_RE = re.compile(r"\s+")

# Minimum speech length (characters) to store
MIN_SPEECH_LEN = 50

BATCH_SIZE = 500

# Progress tracking file
PROGRESS_DIR = Path("~/.cache/autoresearch/nsw_hansard").expanduser()


def _api_get(url: str, accept: str = "application/json", retries: int = 3) -> bytes:
    """Make a GET request with rate limiting and retries."""
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": accept,
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


def _api_json(url: str) -> list | dict:
    """Fetch JSON from the API."""
    data = _api_get(url, accept="application/json")
    return json.loads(data)


def _api_xml(url: str) -> ET.Element:
    """Fetch XML from the API and parse it."""
    data = _api_get(url, accept="application/xml")
    return ET.fromstring(data)


def text_hash(text: str) -> str:
    """Short SHA-256 hex digest for deduplication."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def clean_html(text: str) -> str:
    """Strip HTML/XML tags and collapse whitespace."""
    text = HTML_TAG_RE.sub(" ", text)
    text = MULTI_SPACE_RE.sub(" ", text).strip()
    return text


def extract_text_from_body(body_elem: ET.Element) -> str:
    """Extract plain text from the <body> element of a fragment.

    The body contains XHTML <p> elements with nested <span> elements.
    We extract all text content, skipping purely structural elements.
    """
    # Get all text recursively
    parts = []
    for elem in body_elem.iter():
        # Skip class-only elements that are just formatting markers
        cls = elem.get("class", "")
        # Skip headings that duplicate topic info
        if cls in ("SubDebate-H", "SubSubDebate-H"):
            continue
        if elem.text:
            parts.append(elem.text)
        if elem.tail:
            parts.append(elem.tail)

    raw = " ".join(parts)
    return clean_html(raw)


def extract_speeches_from_fragment(xml_root: ET.Element) -> list[dict]:
    """Parse a fragment XML and extract individual speeches.

    Returns a list of dicts with keys:
      speaker_name, speaker_id, electorate, topic, text
    """
    speeches = []

    # Get header info
    header = xml_root.find(".//hansard.header")
    chamber_name = ""
    if header is not None:
        ch = header.find("chamber")
        if ch is not None and ch.text:
            chamber_name = ch.text.strip()

    # Get fragment data for topic and speaker info
    frag_data = xml_root.find(".//fragment.data")
    frag_text = xml_root.find(".//fragment.text")

    if frag_text is None:
        return speeches

    body = frag_text.find("body")
    if body is None:
        # Sometimes the body has a namespace
        for child in frag_text:
            if child.tag == "body" or child.tag.endswith("}body"):
                body = child
                break
    if body is None:
        return speeches

    # Extract topic from fragment data
    topic = ""
    if frag_data is not None:
        topic_info = frag_data.find(".//topicinfo")
        if topic_info is not None:
            # Collect all text elements as topic parts
            topic_parts = []
            for t in topic_info.findall("text"):
                if t.text:
                    topic_parts.append(t.text.strip())
            topic = "; ".join(topic_parts) if topic_parts else ""

    # Extract speakers from fragment data
    speakers_in_fragment = []
    if frag_data is not None:
        for speech_elem in frag_data.iter("speech"):
            talker = speech_elem.find(".//talker")
            if talker is not None:
                speaker_info = {
                    "id": (talker.findtext("id") or "").strip(),
                    "name": (talker.findtext("name") or "").strip(),
                    "electorate": (talker.findtext("electorate") or "").strip(),
                }
                speakers_in_fragment.append(speaker_info)

        # Also check for questions/answers
        for qa_tag in ("question", "answer"):
            for qa_elem in frag_data.iter(qa_tag):
                talker = qa_elem.find(".//talker")
                if talker is not None:
                    speaker_info = {
                        "id": (talker.findtext("id") or "").strip(),
                        "name": (talker.findtext("name") or "").strip(),
                        "electorate": (talker.findtext("electorate") or "").strip(),
                    }
                    speakers_in_fragment.append(speaker_info)

    # Now parse the HTML body to split by speaker
    # Speakers are identified by <span class="MemberSpeech-H"> elements
    # We split text at each speaker marker
    current_speaker = speakers_in_fragment[0] if speakers_in_fragment else {
        "id": "", "name": "", "electorate": ""
    }
    current_parts = []
    speaker_changes = []

    # Iterate through all elements in body to find speaker markers
    for elem in body.iter():
        cls = elem.get("class", "")
        data_article = elem.get("data-article", "")

        if cls == "MemberSpeech-H" or (
            data_article in ("speech", "question", "answer", "interjection")
        ):
            # This is a speaker marker
            speaker_name = (elem.text or "").strip()
            speaker_id = elem.get("data-value", "")

            # Save current speech if we have one
            if current_parts:
                text = clean_html(" ".join(current_parts))
                if len(text) >= MIN_SPEECH_LEN:
                    speaker_changes.append((dict(current_speaker), text))
                current_parts = []

            # Find matching speaker info
            matched = False
            for si in speakers_in_fragment:
                if si["id"] == speaker_id or si["name"] == speaker_name:
                    current_speaker = si
                    matched = True
                    break
            if not matched and speaker_name:
                current_speaker = {
                    "id": speaker_id,
                    "name": speaker_name,
                    "electorate": "",
                }

            # Get the electorate from the following span if present
            # (handled by the fragment data speakers list above)
            continue

        # Skip structural headings
        if cls in ("SubDebate-H", "SubSubDebate-H"):
            continue

    # Collect all the text, split by speakers using a different approach
    # Walk through <p> elements and accumulate text per speaker
    all_paragraphs = list(body.iter("{http://www.w3.org/1999/xhtml}p"))
    if not all_paragraphs:
        # Try without namespace
        all_paragraphs = list(body.iter("p"))

    current_speaker = speakers_in_fragment[0] if speakers_in_fragment else {
        "id": "", "name": "", "electorate": ""
    }
    current_parts = []

    for p in all_paragraphs:
        cls = p.get("class", "")

        # Skip heading paragraphs
        if cls in ("SubDebate-H", "SubSubDebate-H"):
            continue

        # Check for speaker change within this paragraph
        new_speaker = None
        for span in p.iter("{http://www.w3.org/1999/xhtml}span"):
            span_cls = span.get("class", "")
            if span_cls == "MemberSpeech-H":
                speaker_name = (span.text or "").strip()
                speaker_id = span.get("data-value", "")
                new_speaker = {"id": speaker_id, "name": speaker_name, "electorate": ""}
                # Try to find electorate from speakers list
                for si in speakers_in_fragment:
                    if si["id"] == speaker_id or si["name"] == speaker_name:
                        new_speaker["electorate"] = si["electorate"]
                        break
        # Also try without namespace
        if new_speaker is None:
            for span in p.iter("span"):
                span_cls = span.get("class", "")
                if span_cls == "MemberSpeech-H":
                    speaker_name = (span.text or "").strip()
                    speaker_id = span.get("data-value", "")
                    new_speaker = {"id": speaker_id, "name": speaker_name, "electorate": ""}
                    for si in speakers_in_fragment:
                        if si["id"] == speaker_id or si["name"] == speaker_name:
                            new_speaker["electorate"] = si["electorate"]
                            break

        if new_speaker is not None:
            # Save current speech
            if current_parts:
                text = clean_html(" ".join(current_parts))
                if len(text) >= MIN_SPEECH_LEN:
                    speeches.append({
                        "speaker_name": current_speaker["name"],
                        "speaker_id": current_speaker["id"],
                        "electorate": current_speaker["electorate"],
                        "topic": topic,
                        "text": text,
                        "chamber": chamber_name,
                    })
                current_parts = []
            current_speaker = new_speaker

        # Get all text from this paragraph
        para_text = ET.tostring(p, encoding="unicode", method="text")
        if para_text and para_text.strip():
            current_parts.append(para_text.strip())

    # Don't forget the last speech
    if current_parts:
        text = clean_html(" ".join(current_parts))
        if len(text) >= MIN_SPEECH_LEN:
            speeches.append({
                "speaker_name": current_speaker["name"],
                "speaker_id": current_speaker["id"],
                "electorate": current_speaker["electorate"],
                "topic": topic,
                "text": text,
                "chamber": chamber_name,
            })

    # If no speaker-split speeches found, treat the whole fragment as one speech
    if not speeches:
        full_text = extract_text_from_body(body)
        if len(full_text) >= MIN_SPEECH_LEN:
            speaker = speakers_in_fragment[0] if speakers_in_fragment else {
                "id": "", "name": "", "electorate": ""
            }
            speeches.append({
                "speaker_name": speaker.get("name", ""),
                "speaker_id": speaker.get("id", ""),
                "electorate": speaker.get("electorate", ""),
                "topic": topic,
                "text": full_text,
                "chamber": chamber_name,
            })

    return speeches


def get_sitting_days(start_date: date, end_date: date) -> list[dict]:
    """Fetch all sitting days with their document IDs for a date range.

    Returns list of dicts: {date, chamber, toc_doc_id, pdf_doc_id}
    """
    results = []
    years = range(start_date.year, end_date.year + 1)

    for year in years:
        print(f"  Fetching sitting days for {year}...")
        try:
            data = _api_json(f"{API_BASE}/year/{year}")
        except Exception as e:
            print(f"    Error fetching year {year}: {e}")
            continue

        for entry in data:
            sitting_date = entry["date"][:10]  # "YYYY-MM-DD"
            if sitting_date < str(start_date) or sitting_date > str(end_date):
                continue

            for event in entry.get("Events", []):
                chamber = event.get("Chamber", "")
                if chamber not in CHAMBER_MAP:
                    continue
                results.append({
                    "date": sitting_date,
                    "chamber": chamber,
                    "chamber_code": CHAMBER_MAP[chamber],
                    "toc_doc_id": event.get("TocDocId", ""),
                    "pdf_doc_id": event.get("PdfDocId", ""),
                })

    results.sort(key=lambda x: (x["date"], x["chamber"]))
    return results


def get_fragment_uids(toc_doc_id: str) -> list[str]:
    """Fetch table of contents and extract all topic/fragment UIDs."""
    try:
        xml_root = _api_xml(f"{API_BASE}/daily/tableofcontents/{toc_doc_id}")
    except Exception as e:
        print(f"    Error fetching TOC {toc_doc_id}: {e}")
        return []

    uids = []
    for topic in xml_root.iter("topic"):
        uid = topic.get("uid")
        if uid:
            uids.append(uid)
    return uids


def load_progress(progress_file: Path) -> set[str]:
    """Load set of completed TOC doc IDs from progress file."""
    if not progress_file.exists():
        return set()
    with open(progress_file, "r") as f:
        return {line.strip() for line in f if line.strip()}


def save_progress(progress_file: Path, toc_doc_id: str) -> None:
    """Append a completed TOC doc ID to the progress file."""
    progress_file.parent.mkdir(parents=True, exist_ok=True)
    with open(progress_file, "a") as f:
        f.write(toc_doc_id + "\n")


def ingest_day(
    db: sqlite3.Connection,
    sitting: dict,
    seen: set[str],
    dry_run: bool = False,
) -> int:
    """Ingest all speeches for one sitting day + chamber.

    Returns count of speeches inserted.
    """
    toc_id = sitting["toc_doc_id"]
    chamber_code = sitting["chamber_code"]
    sitting_date = sitting["date"]

    # Get all fragment UIDs from table of contents
    uids = get_fragment_uids(toc_id)
    if not uids:
        return 0

    count = 0
    pending = 0

    for uid in uids:
        try:
            xml_root = _api_xml(f"{API_BASE}/daily/fragment/{uid}")
        except Exception as e:
            print(f"      Error fetching fragment {uid}: {e}")
            continue

        speeches = extract_speeches_from_fragment(xml_root)

        for speech in speeches:
            # Dedup key
            dedup_key = f"{speech['speaker_name']}|{sitting_date}|{text_hash(speech['text'])}"
            if dedup_key in seen:
                continue
            seen.add(dedup_key)

            word_count = len(speech["text"].split())

            if dry_run:
                print(f"      [{chamber_code}] {speech['speaker_name']}: "
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
                    "",  # party not directly in fragment data
                    speech["electorate"],
                    chamber_code,
                    sitting_date,
                    speech["topic"] or None,
                    speech["text"],
                    word_count,
                    "nsw_hansard",
                    "nsw",
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


def build_dedup_set(db: sqlite3.Connection) -> set[str]:
    """Build deduplication set from existing NSW Hansard speeches."""
    seen: set[str] = set()
    rows = db.execute(
        "SELECT speaker_name, date, text FROM speeches WHERE source = 'nsw_hansard'"
    ).fetchall()
    for row in rows:
        key = f"{row['speaker_name'] or ''}|{row['date']}|{text_hash(row['text'])}"
        seen.add(key)
    return seen


def main():
    parser = argparse.ArgumentParser(
        description="Ingest NSW Parliament Hansard speeches into the parli database."
    )
    parser.add_argument(
        "--start", type=str, default="2020-01-01",
        help="Start date (YYYY-MM-DD), default 2020-01-01",
    )
    parser.add_argument(
        "--end", type=str, default=str(date.today()),
        help="End date (YYYY-MM-DD), default today",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print what would be ingested without writing to DB",
    )
    parser.add_argument(
        "--chamber", type=str, default=None,
        choices=["nsw_la", "nsw_lc"],
        help="Ingest only one chamber (default: both)",
    )
    parser.add_argument(
        "--no-resume", action="store_true",
        help="Ignore progress file and re-ingest everything",
    )
    args = parser.parse_args()

    start = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end)

    print(f"NSW Hansard Ingestor")
    print(f"  Date range: {start} to {end}")
    print(f"  Chamber: {args.chamber or 'both'}")
    print(f"  Dry run: {args.dry_run}")

    db = get_db()
    db.close()
    # Reopen with a longer timeout to handle concurrent access
    from parli.schema import DEFAULT_DB_PATH
    db = sqlite3.connect(str(DEFAULT_DB_PATH), timeout=120)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode = WAL")
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA busy_timeout = 120000")
    init_db(db)

    # Progress tracking
    progress_file = PROGRESS_DIR / "progress.txt"
    if args.no_resume:
        completed = set()
        print("  Resume: disabled (--no-resume)")
    else:
        completed = load_progress(progress_file)
        print(f"  Resume: {len(completed)} sitting days already completed")

    # Build dedup set
    print("\nBuilding deduplication index...")
    seen = build_dedup_set(db)
    print(f"  {len(seen)} existing NSW speeches indexed")

    # Get all sitting days
    print("\nFetching sitting day calendar...")
    sittings = get_sitting_days(start, end)
    print(f"  Found {len(sittings)} sitting day/chamber combinations")

    if args.chamber:
        sittings = [s for s in sittings if s["chamber_code"] == args.chamber]
        print(f"  After chamber filter: {len(sittings)}")

    # Filter out already completed
    sittings = [s for s in sittings if s["toc_doc_id"] not in completed]
    print(f"  After resume filter: {len(sittings)} remaining")

    total_speeches = 0
    total_days = 0

    for i, sitting in enumerate(sittings, 1):
        label = f"[{i}/{len(sittings)}] {sitting['date']} {sitting['chamber']}"
        print(f"\n{label}")

        try:
            n = ingest_day(db, sitting, seen, dry_run=args.dry_run)
        except Exception as e:
            print(f"  ERROR: {e}")
            continue

        total_speeches += n
        total_days += 1
        print(f"  -> {n} speeches")

        if not args.dry_run:
            save_progress(progress_file, sitting["toc_doc_id"])

    # Summary
    print(f"\n{'=' * 60}")
    print(f"Ingestion complete.")
    print(f"  Days processed: {total_days}")
    print(f"  Speeches ingested: {total_speeches}")

    if not args.dry_run:
        total_nsw = db.execute(
            "SELECT COUNT(*) FROM speeches WHERE source = 'nsw_hansard'"
        ).fetchone()[0]
        total_all = db.execute("SELECT COUNT(*) FROM speeches").fetchone()[0]
        print(f"  Total NSW speeches in DB: {total_nsw}")
        print(f"  Total speeches in DB: {total_all}")

        # Rebuild FTS5 index
        print("\nRebuilding FTS5 index...")
        try:
            db.execute("INSERT INTO speeches_fts(speeches_fts) VALUES('rebuild')")
            db.commit()
            print("  Done.")
        except sqlite3.OperationalError as e:
            print(f"  FTS rebuild skipped (DB busy): {e}")
            print("  Run manually later: python -c \"from parli.schema import *; db=get_db(); db.execute(\\\"INSERT INTO speeches_fts(speeches_fts) VALUES('rebuild')\\\"); db.commit()\"")



if __name__ == "__main__":
    main()
