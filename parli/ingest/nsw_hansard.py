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

from parli.ingest import http as source_http

import argparse
import fcntl
import hashlib
import json
import os
import re
import sqlite3
import time
import urllib.request
import urllib.error
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

from parli.ingest import fts
from parli.ingest.dedup import build_seen
from parli.schema import get_db, init_db

API_BASE = "https://api.parliament.nsw.gov.au/api/hansard/search"
USER_AGENT = "opax-improve-audit"

# Map chamber names from the API to our DB codes
CHAMBER_MAP = {
    "Legislative Assembly": "nsw_la",
    "Legislative Council": "nsw_lc",
}

# Rate limiting: seconds between API calls
REQUEST_DELAY = 1.0
_next_request_at = 0.0
# The bounded backfill sets this for discovery and every fragment request.
REQUEST_DEADLINE: float | None = None


class BudgetSpent(Exception):
    """A clean checkpoint boundary, never a completed day."""


def check_budget(reserve: float = 0.0) -> None:
    if REQUEST_DEADLINE is not None and time.monotonic() + reserve >= REQUEST_DEADLINE:
        raise BudgetSpent("NSW backfill time budget spent")

# HTML tag stripping
HTML_TAG_RE = re.compile(r"<[^>]+>")
MULTI_SPACE_RE = re.compile(r"\s+")

# Minimum speech length (characters) to store
MIN_SPEECH_LEN = 50

BATCH_SIZE = 500

# Progress tracking file
PROGRESS_DIR = Path("~/.cache/autoresearch/nsw_hansard").expanduser()


def _read_body(response) -> bytes:
    """Read success and error bodies at deadline checkpoints."""
    chunks = []
    while True:
        check_budget()
        chunk = response.read1(65536)
        check_budget()
        if not chunk:
            return b"".join(chunks)
        chunks.append(chunk)


def _api_get(url: str, accept: str = "application/json", retries: int = 2) -> bytes:
    """NSW API only, one request per second, at most one retry, no redirects.

    Use the shared challenge/redirect guards without its additional retry loop
    or User-Agent override. A refusal exits through broad record handlers.
    """
    global _next_request_at
    if not url.startswith(API_BASE + "/") or urlsplit(url).hostname != "api.parliament.nsw.gov.au":
        raise ValueError("NSW Hansard requests must use the NSW Parliament API")
    req = source_http.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": accept,
    })
    # This reviewed NSW lane explicitly requires this identifying audit agent.
    # Request() otherwise forces the repository's normal OPAXBot identity.
    req.remove_header("User-agent")
    req.add_header("User-Agent", USER_AGENT)
    for attempt in range(min(retries, 2)):
        wait = max(0.0, _next_request_at - time.monotonic())
        check_budget(wait)
        time.sleep(wait)
        check_budget()
        _next_request_at = time.monotonic() + REQUEST_DELAY
        timeout = 60 if REQUEST_DEADLINE is None else min(60, REQUEST_DEADLINE - time.monotonic())
        try:
            with source_http.build_opener().open(req, timeout=timeout) as resp:
                body = _read_body(resp)
                source_http.check_response(url, resp.status, body, resp.headers,
                                           expected_json="json" in accept)
                if not 200 <= resp.status < 300:
                    raise urllib.error.HTTPError(url, resp.status, "non-2xx", resp.headers, None)
                return body
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            if isinstance(error, urllib.error.HTTPError):
                try:
                    # Check refusal headers before waiting for any error body.
                    source_http.check_response(url, error.code, headers=error.headers)
                    source_http.check_response(url, error.code, _read_body(error), error.headers)
                    delay = source_http.retry_after(error.headers.get("Retry-After"))
                finally:
                    error.close()
            else:
                delay = 0
            if attempt + 1 >= min(retries, 2):
                raise source_http.SourceRefused(url, f"NSW API failed after one retry: {error}") from error
            _next_request_at = max(_next_request_at, time.monotonic() + max(1, delay))
            print(f"  NSW API retry 1/1: {error}", flush=True)
    raise ValueError("At least one request attempt is required")


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


IN_REPLY_RE = re.compile(r"\(?\s*In reply to\b", re.I)

SPEAKER_HEADINGS = frozenset({
    "MemberSpeech-H", "MemberUpper-H", "MemberLower-H", "MemberQuestion-H", "MemberAnswer-H",
    "OfficeSpeech-H", "OfficeUpper-H", "OfficeLower-H",
})


def extract_speeches_from_fragment(xml_root: ET.Element) -> list[dict]:
    """A named byline always starts a turn. Explicit byline IDs beat anchors.

    Never inherit the preceding speaker when a new byline is unresolved. Source
    IDs can occur on spans as well as anchors, including questions and answers.
    """
    from parli.ingest.speaker_names import normalize_speaker
    chamber = xml_root.findtext(".//hansard.header/chamber", "").strip()
    data = xml_root.find(".//fragment.data")
    fragment = xml_root.find(".//fragment.text")
    if fragment is None:
        return []
    body = next((e for e in fragment if e.tag.rsplit("}", 1)[-1] == "body"), None)
    if body is None:
        return []
    topic = "; ".join(t.text.strip() for t in data.findall(".//topicinfo/text") if t.text) if data is not None else ""
    talkers = []
    if data is not None:
        for t in data.iter("talker"):
            info = {"id": t.findtext("id", "").strip(), "name": t.findtext("name", "").strip(),
                    "electorate": t.findtext("electorate", "").strip()}
            if info not in talkers:
                talkers.append(info)
    empty = {"id": "", "name": "", "electorate": ""}
    current = dict(talkers[0]) if len(talkers) == 1 else dict(empty)
    parts, speeches = [], []
    pending_id = None

    def flush():
        text = clean_html(" ".join(parts))
        if len(text) >= MIN_SPEECH_LEN:
            speeches.append({"speaker_name": current["name"], "speaker_id": current["id"],
                             "electorate": current["electorate"], "topic": topic,
                             "text": text, "chamber": chamber})
        parts.clear()

    for element in body.iter():
        tag = element.tag.rsplit("}", 1)[-1]
        if tag == "a" and element.get("data-mode") == "member":
            flush()
            pending_id = element.get("data-value", "")
            current = {**empty, "id": pending_id}
        elif tag == "p":
            if element.get("class", "") in ("SubDebate-H", "SubSubDebate-H"):
                continue
            # "In reply to <asker> (date)." heads a deferred answer. Its byline
            # names the asker, not a speaker, so it is not a turn. Close the
            # previous turn and start the next one with no speaker, so nothing
            # after the header is credited to the asker.
            if IN_REPLY_RE.match(clean_html(" ".join(element.itertext()))):
                flush()
                current, pending_id = dict(empty), None
                continue
            unknown = {e.get('class') for e in element.iter()
                       if e.get('class', '').startswith(('Member', 'Office'))
                       and e.get('class') not in SPEAKER_HEADINGS}
            if unknown:
                raise ValueError(f"Unrecognised NSW speaker heading: {sorted(unknown)}")
            bylines = [e for e in element.iter() if e.get("class") in SPEAKER_HEADINGS
                       and any(c.isalpha() for c in "".join(e.itertext()))]
            # Offices can have a second span naming their occupant in brackets.
            # It remains an office turn, never a second guessed personal turn.
            if len(bylines) > 1 and not all(e.get("class", "").startswith("Office") for e in bylines):
                raise ValueError("Multiple NSW speaker bylines in one paragraph require review")
            if bylines:
                flush()
                byline = bylines[0]
                name = clean_html(" ".join(byline.itertext())).rstrip(": ")
                sid = byline.get("data-value") if byline.get("data-mode") == "member" else pending_id
                normal = (normalize_speaker(name) or "").casefold()
                matches = [t for t in talkers if normal and (normalize_speaker(t["name"]) or "").casefold() == normal]
                if not sid and len(matches) == 1:
                    sid = matches[0]["id"]
                # The byline supplies the name even when an ID matched metadata.
                current = {"id": sid or "", "name": name,
                           "electorate": matches[0]["electorate"] if len(matches) == 1 else ""}
                pending_id = None
            parts.append(ET.tostring(element, encoding="unicode", method="text").strip())
    flush()
    return speeches


def get_sitting_days(start_date: date, end_date: date) -> list[dict]:
    """Fetch all sitting days with their document IDs for a date range.

    Returns list of dicts: {date, chamber, toc_doc_id, pdf_doc_id}
    """
    if start_date > end_date:
        raise ValueError("NSW sitting calendar start must precede end")
    results = []
    years = range(start_date.year, end_date.year + 1)

    for year in years:
        print(f"  Fetching sitting days for {year}...")
        data = _api_json(f"{API_BASE}/year/{year}")
        if not isinstance(data, list) or not data:
            raise ValueError(f"NSW calendar {year}: missing or invalid year discovery")

        recognised = False
        for entry in data:
            sitting_date = entry["date"][:10]  # "YYYY-MM-DD"
            if date.fromisoformat(sitting_date).year != year or not isinstance(entry.get("Events"), list):
                raise ValueError(f"NSW calendar {year}: invalid sitting entry")
            for event in entry.get("Events", []):
                chamber = event.get("Chamber", "")
                if chamber not in CHAMBER_MAP:
                    continue
                recognised = True
                if not event.get("TocDocId"):
                    raise ValueError(f"NSW calendar {year}: missing chamber TOC for {sitting_date}")
                if sitting_date < str(start_date) or sitting_date > str(end_date):
                    continue
                results.append({
                    "date": sitting_date,
                    "chamber": chamber,
                    "chamber_code": CHAMBER_MAP[chamber],
                    "toc_doc_id": event.get("TocDocId", ""),
                    "pdf_doc_id": event.get("PdfDocId", ""),
                })
        if not recognised:
            raise ValueError(f"NSW calendar {year}: no recognised chamber in year discovery")

    results.sort(key=lambda x: (x["date"], x["chamber"]))
    return results


def get_fragment_uids(toc_doc_id: str) -> list[str]:
    """Fetch table of contents and extract all topic/fragment UIDs."""
    xml_root = _api_xml(f"{API_BASE}/daily/tableofcontents/{toc_doc_id}")

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
        xml_root = _api_xml(f"{API_BASE}/daily/fragment/{uid}")

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


def build_dedup_set(db: sqlite3.Connection, since: str | None = None) -> set[str]:
    """Build deduplication set from existing NSW Hansard speeches (only those dated `since` or
    later when given: a run writes rows dated inside its own window, and the key has the date)."""
    return build_seen(db, text_hash, sources=["nsw_hansard"], since=since)


def main():
    parser = argparse.ArgumentParser(
        description="Ingest NSW Parliament Hansard speeches into the parli database."
    )
    parser.add_argument(
        "--start", type=str, default=None,
        help="Start date (YYYY-MM-DD), default 2020-01-01",
    )
    parser.add_argument(
        "--end", type=str, default=None,
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
    parser.add_argument("--backfill-missing-days", action="store_true",
                        help="Bounded, checkpointed repair of the reviewed NSW gap; requires OPAX_DB")
    parser.add_argument("--coverage-json", type=Path)
    parser.add_argument("--receipt-json", type=Path)
    parser.add_argument("--publication-state", type=Path)
    parser.add_argument("--growth-guard", action="store_true",
                        help="Nightly: read KB counters and enforce the shared growth ledger")
    fts.add_argument(parser)
    args = parser.parse_args()

    if args.backfill_missing_days:
        from parli.ingest import nsw_backfill
        from parli.ingest import backfill_guard as growth
        if not growth.enabled('nsw'):
            print('NSW backfill disabled by OPAX_NSW_BACKFILL=0')
            return
        guard = growth.Guard()
        guard.ensure_running()
        if args.dry_run or args.chamber or args.no_resume:
            parser.error("Bounded repair uses its own atomic checkpoints; select a separate OPAX_DB for rehearsal")
        db_path = os.environ.get("OPAX_DB")
        if not db_path or os.environ.get("DATABASE_URL"):
            parser.error("Bounded NSW repair requires an explicit SQLite OPAX_DB and no DATABASE_URL")
        start = date.fromisoformat(args.start) if args.start else nsw_backfill.START
        end = date.fromisoformat(args.end) if args.end else nsw_backfill.END
        nsw_backfill.bounds(start, end)
        cap = int(os.environ.get("OPAX_BACKFILL_NSW_CAP", nsw_backfill.DEFAULT_CAP))
        budget = float(os.environ.get("OPAX_BACKFILL_NSW_BUDGET_S", nsw_backfill.DEFAULT_BUDGET_S))
        kb = None
        if args.growth_guard:
            from parli.arag import AragConfig, KbClient, load_dotenv
            load_dotenv()
            kb = KbClient(AragConfig.from_env())
            guard.check(kb, 'nsw')
        # Open an existing database only. Never initialise the legacy default.
        path = Path(db_path).expanduser().resolve()
        with Path(str(path) + ".nsw-backfill.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with sqlite3.connect(path.as_uri() + "?mode=rw", uri=True, timeout=5) as db:
                db.execute("PRAGMA foreign_keys=ON")
                nsw_backfill.run(db, start=start, end=end, cap=cap, budget_s=budget,
                                 coverage_path=args.coverage_json, receipt_path=args.receipt_json,
                                 publication_state_path=args.publication_state,
                                 guard=guard if args.growth_guard else None, kb=kb)
        return

    start = date.fromisoformat(args.start or "2020-01-01")
    end = date.fromisoformat(args.end) if args.end else date.today()

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
    seen = build_dedup_set(db, since=start.isoformat())
    print(f"  {len(seen)} existing NSW speeches indexed (dated {start} or later)")

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

        # Rebuild FTS5 index (opt-in: scripts/fts_sync.py indexes new rows)
        if fts.rebuild_wanted(args.rebuild_fts):
            print("\nRebuilding FTS5 index...")
            try:
                db.execute("INSERT INTO speeches_fts(speeches_fts) VALUES('rebuild')")
                db.commit()
                print("  Done.")
            except sqlite3.OperationalError as e:
                print(f"  FTS rebuild skipped (DB busy): {e}")
        else:
            print("\nFTS5 index not rebuilt (scripts/fts_sync.py indexes new rows; --rebuild-fts for a full rebuild)")


if __name__ == "__main__":
    main()
