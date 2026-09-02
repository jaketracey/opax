#!/usr/bin/env python3
"""
Fast async Hansard downloader using asyncio + aiohttp.

Same logic as download_hansard.py but scrapes individual debate pages
concurrently (up to N workers), giving ~10x speedup on page scraping.

API calls (getDebates) are still rate-limited to 1 req/sec.
Page scraping uses a semaphore pool with 0.2s between requests.

Usage:
    uv run download_hansard_fast.py --backfill-all --workers 10
    uv run download_hansard_fast.py --start 2024-01-01 --end 2024-12-31 --chamber senate
    uv run download_hansard_fast.py --test
"""

import argparse
import asyncio
import json
import os
import re
import time
from datetime import date, datetime, timedelta
from pathlib import Path

import aiohttp
from bs4 import BeautifulSoup

API_BASE = "https://www.openaustralia.org.au/api/"
API_KEY = os.environ.get("OPENAUSTRALIA_API_KEY", "")
SITE_BASE = "https://www.openaustralia.org.au"
OUTPUT_DIR = Path(os.path.expanduser("~/.cache/autoresearch/hansard/modern"))
DEFAULT_START = "2023-01-01"
DEFAULT_END = "2026-03-28"
BACKFILL_START = "2006-02-07"
BACKFILL_END = "2026-03-28"
API_RATE_LIMIT = 1.0  # seconds between API calls
SCRAPE_RATE_LIMIT = 0.2  # seconds between scrape requests per worker
USER_AGENT = "AutoResearch-Hansard/2.0 (async)"


# ---------------------------------------------------------------------------
# HTML parsing — identical to download_hansard.py
# ---------------------------------------------------------------------------

def parse_debate_html(html: str) -> list[dict]:
    """
    Parse a debate page HTML to extract complete speeches.

    Returns a list of dicts with keys: speaker, party, electorate, text.
    This is the exact same logic as scrape_debate_page() in the sync version.
    """
    soup = BeautifulSoup(html, "html.parser")
    speeches = []

    main = soup.find("div", class_="main")
    if not main:
        return speeches

    children = list(main.children)

    current_speaker = ""
    current_party = ""
    current_electorate = ""
    current_paragraphs = []

    def _flush():
        if current_paragraphs:
            text = "\n\n".join(current_paragraphs)
            if text.strip():
                speeches.append(
                    {
                        "speaker": current_speaker,
                        "party": current_party,
                        "electorate": current_electorate,
                        "text": text,
                    }
                )

    for el in children:
        if not hasattr(el, "name") or el.name is None:
            continue

        if el.name == "p" and "speaker" in (el.get("class") or []):
            _flush()
            current_paragraphs = []

            strong = el.find("strong")
            current_speaker = strong.get_text(strip=True) if strong else ""

            current_party = ""
            current_electorate = ""
            small = el.find("small")
            if small:
                small_text = small.get_text(strip=True)
                paren = re.search(r"\(([^)]+)\)", small_text)
                if paren:
                    parts = [p.strip() for p in paren.group(1).split(",")]
                    if len(parts) >= 2:
                        current_electorate = parts[0]
                        current_party = parts[1]
                    elif len(parts) == 1:
                        current_party = parts[0]

            inner_ps = el.find_all("p")
            for ip in inner_ps:
                ip_classes = ip.get("class") or []
                if "speaker" in ip_classes:
                    continue
                ip_text = ip.get_text(strip=True)
                if ip_text:
                    current_paragraphs.append(ip_text)

            continue

        if el.name == "p":
            el_text = el.get_text(strip=True)
            if re.match(r"^\d{1,2}:\d{2}\s*(am|pm)$", el_text):
                continue
            if el_text:
                current_paragraphs.append(el_text)

    _flush()

    if not speeches:
        all_ps = main.find_all("p")
        all_text = "\n\n".join(
            p.get_text(strip=True)
            for p in all_ps
            if p.get_text(strip=True) and "speaker" not in (p.get("class") or [])
        )
        if all_text:
            speeches.append(
                {
                    "speaker": "",
                    "party": "",
                    "electorate": "",
                    "text": all_text,
                }
            )

    return speeches


# ---------------------------------------------------------------------------
# Async network helpers
# ---------------------------------------------------------------------------

async def get_debates(session: aiohttp.ClientSession, chamber: str, date_str: str) -> list:
    """Call the getDebates API endpoint for a given chamber and date."""
    url = f"{API_BASE}getDebates"
    params = {
        "type": chamber,
        "date": date_str,
        "output": "json",
        "key": API_KEY,
    }
    try:
        async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            resp.raise_for_status()
            data = await resp.json(content_type=None)
            if isinstance(data, list):
                return data
            if isinstance(data, dict) and "error" in data:
                print(f"  API error for {chamber} {date_str}: {data['error']}")
                return []
            return []
    except (aiohttp.ClientError, asyncio.TimeoutError) as e:
        print(f"  Request failed for {chamber} {date_str}: {e}")
        return []
    except json.JSONDecodeError:
        print(f"  Invalid JSON for {chamber} {date_str}")
        return []


async def scrape_debate_page(
    session: aiohttp.ClientSession,
    semaphore: asyncio.Semaphore,
    listurl: str,
    stats: dict,
) -> list[dict]:
    """Scrape a single debate page with concurrency control."""
    url = f"{SITE_BASE}{listurl}"
    async with semaphore:
        await asyncio.sleep(SCRAPE_RATE_LIMIT)
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                resp.raise_for_status()
                html = await resp.text()
                stats["pages_scraped"] += 1
                return parse_debate_html(html)
        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            print(f"    Failed to fetch {url}: {e}")
            stats["pages_failed"] += 1
            return []


# ---------------------------------------------------------------------------
# Day processing
# ---------------------------------------------------------------------------

async def process_day(
    session: aiohttp.ClientSession,
    semaphore: asyncio.Semaphore,
    date_str: str,
    chamber: str,
    stats: dict,
) -> list[dict]:
    """Process all debates for a single day and chamber, scraping pages concurrently."""
    debates = await get_debates(session, chamber, date_str)
    await asyncio.sleep(API_RATE_LIMIT)

    if not debates:
        return []

    # Collect unique pages to scrape
    pages_to_scrape = []
    for section in debates:
        entry = section.get("entry", {})
        topic = entry.get("body", "Unknown topic")
        topic = BeautifulSoup(topic, "html.parser").get_text(strip=True) if topic else "Unknown topic"

        subs = section.get("subs", [])
        for sub in subs:
            listurl = sub.get("listurl", "")
            excerpt = sub.get("excerpt", "")
            if listurl:
                pages_to_scrape.append(
                    {"topic": topic, "listurl": listurl, "excerpt": excerpt}
                )

    if not pages_to_scrape:
        return []

    # Deduplicate by listurl
    seen_urls = set()
    unique_pages = []
    for page in pages_to_scrape:
        if page["listurl"] not in seen_urls:
            seen_urls.add(page["listurl"])
            unique_pages.append(page)

    stats["pages_total"] += len(unique_pages)

    # Scrape all pages concurrently (limited by semaphore)
    tasks = [
        scrape_debate_page(session, semaphore, page["listurl"], stats)
        for page in unique_pages
    ]
    results = await asyncio.gather(*tasks)

    # Build records
    records = []
    for page, speeches in zip(unique_pages, results):
        if speeches:
            for speech in speeches:
                records.append(
                    {
                        "date": date_str,
                        "chamber": chamber,
                        "speaker": speech["speaker"],
                        "party": speech["party"],
                        "electorate": speech.get("electorate", ""),
                        "topic": page["topic"],
                        "text": speech["text"],
                    }
                )
        else:
            # Fallback to excerpt
            if page["excerpt"]:
                excerpt_text = BeautifulSoup(page["excerpt"], "html.parser").get_text(strip=True)
                if excerpt_text:
                    records.append(
                        {
                            "date": date_str,
                            "chamber": chamber,
                            "speaker": "",
                            "party": "",
                            "electorate": "",
                            "topic": page["topic"],
                            "text": excerpt_text,
                        }
                    )

    return records


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def save_records(records: list[dict], date_str: str, chamber: str):
    """Save records as a JSONL file."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filepath = OUTPUT_DIR / f"{date_str}_{chamber}.jsonl"
    with open(filepath, "w", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")


def output_exists(date_str: str, chamber: str) -> bool:
    """Check if output file already exists for resume capability."""
    return (OUTPUT_DIR / f"{date_str}_{chamber}.jsonl").exists()


def daterange(start: date, end: date):
    """Yield dates from start to end (inclusive), skipping weekends."""
    current = start
    while current <= end:
        if current.weekday() < 5:  # Skip weekends
            yield current
        current += timedelta(days=1)


def format_duration(seconds: float) -> str:
    """Format seconds into human-readable duration."""
    if seconds < 60:
        return f"{seconds:.0f}s"
    elif seconds < 3600:
        return f"{seconds / 60:.1f}m"
    else:
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        return f"{h}h{m:02d}m"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def run(args):
    """Main async entry point."""
    if args.backfill_all:
        start_date = datetime.strptime(BACKFILL_START, "%Y-%m-%d").date()
        end_date = datetime.strptime(BACKFILL_END, "%Y-%m-%d").date()
        chambers = ["representatives", "senate"]
        print(f"BACKFILL MODE: full 20-year download")
    else:
        start_date = datetime.strptime(args.start, "%Y-%m-%d").date()
        end_date = datetime.strptime(args.end, "%Y-%m-%d").date()
        chambers = (
            ["representatives", "senate"]
            if args.chamber == "both"
            else [args.chamber]
        )

    if args.test:
        end_date = start_date
        print("TEST MODE: processing only one day.")

    workers = args.workers
    semaphore = asyncio.Semaphore(workers)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}")
    print(f"Date range: {start_date} to {end_date}")
    print(f"Chambers: {', '.join(chambers)}")
    print(f"Workers: {workers}")
    print()

    # Build work list
    work = []
    skipped = 0
    for current_date in daterange(start_date, end_date):
        date_str = current_date.strftime("%Y-%m-%d")
        for chamber in chambers:
            if output_exists(date_str, chamber):
                skipped += 1
            else:
                work.append((date_str, chamber))

    total_tasks = len(work)
    print(f"Tasks: {total_tasks} chamber-days to process, {skipped} already downloaded")
    if total_tasks == 0:
        print("Nothing to do.")
        return
    print()

    stats = {
        "pages_total": 0,
        "pages_scraped": 0,
        "pages_failed": 0,
        "records_total": 0,
        "days_processed": 0,
        "days_empty": 0,
    }

    t_start = time.monotonic()

    connector = aiohttp.TCPConnector(limit=workers + 5)
    async with aiohttp.ClientSession(
        connector=connector,
        headers={"User-Agent": USER_AGENT},
    ) as session:
        for i, (date_str, chamber) in enumerate(work):
            elapsed = time.monotonic() - t_start
            rate = stats["pages_scraped"] / elapsed if elapsed > 0 else 0

            if i > 0 and stats["days_processed"] > 0:
                avg_per_task = elapsed / (i)
                remaining = avg_per_task * (total_tasks - i)
                eta = format_duration(remaining)
            else:
                eta = "?"

            print(
                f"[{i + 1}/{total_tasks}] {date_str} {chamber}"
                f"  |  {rate:.1f} pages/sec  |  ETA {eta}"
            )

            records = await process_day(session, semaphore, date_str, chamber, stats)

            if records:
                save_records(records, date_str, chamber)
                stats["records_total"] += len(records)
                stats["days_processed"] += 1
                print(f"  -> {len(records)} records saved")
            else:
                save_records([], date_str, chamber)
                stats["days_empty"] += 1

    elapsed_total = time.monotonic() - t_start
    print()
    print("=" * 65)
    print(f"Done in {format_duration(elapsed_total)}")
    print(f"  Days processed:  {stats['days_processed']} with data, {stats['days_empty']} empty")
    print(f"  Pages scraped:   {stats['pages_scraped']} ({stats['pages_failed']} failed)")
    print(f"  Records saved:   {stats['records_total']}")
    print(f"  Throughput:      {stats['pages_scraped'] / elapsed_total:.1f} pages/sec")
    print(f"  Skipped:         {skipped} (already downloaded)")
    print(f"  Output:          {OUTPUT_DIR}")


def main():
    parser = argparse.ArgumentParser(
        description="Fast async Hansard downloader (asyncio + aiohttp)."
    )
    parser.add_argument(
        "--start",
        default=DEFAULT_START,
        help=f"Start date YYYY-MM-DD (default: {DEFAULT_START})",
    )
    parser.add_argument(
        "--end",
        default=DEFAULT_END,
        help=f"End date YYYY-MM-DD (default: {DEFAULT_END})",
    )
    parser.add_argument(
        "--chamber",
        choices=["representatives", "senate", "both"],
        default="both",
        help="Which chamber to download (default: both)",
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Test mode: only download one day",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=10,
        help="Max concurrent page scrapes (default: 10)",
    )
    parser.add_argument(
        "--backfill-all",
        action="store_true",
        help="Download everything: both chambers, 2006-02-07 to 2026-03-28",
    )
    args = parser.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
