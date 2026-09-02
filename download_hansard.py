#!/usr/bin/env python3
"""
Download Australian parliamentary Hansard data from the OpenAustralia API.

Fetches debate transcripts for a date range, scrapes full speech text from
individual debate pages, and saves as JSONL files (one per sitting day).
"""

import argparse
import json
import os
import re
import time
from datetime import date, datetime, timedelta
from pathlib import Path

import requests
from bs4 import BeautifulSoup

API_BASE = "https://www.openaustralia.org.au/api/"
API_KEY = os.environ.get("OPENAUSTRALIA_API_KEY", "")
SITE_BASE = "https://www.openaustralia.org.au"
OUTPUT_DIR = Path(os.path.expanduser("~/.cache/autoresearch/hansard/modern"))
DEFAULT_START = "2023-01-01"
DEFAULT_END = "2026-03-28"
RATE_LIMIT_SECONDS = 1.0

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "AutoResearch-Hansard/1.0"})


def rate_limit():
    """Sleep to respect rate limiting."""
    time.sleep(RATE_LIMIT_SECONDS)


def get_debates(chamber: str, date_str: str) -> list:
    """Call the getDebates API endpoint for a given chamber and date."""
    url = f"{API_BASE}getDebates"
    params = {
        "type": chamber,
        "date": date_str,
        "output": "json",
        "key": API_KEY,
    }
    try:
        resp = SESSION.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, list):
            return data
        # Sometimes the API returns an error dict
        if isinstance(data, dict) and "error" in data:
            print(f"  API error for {chamber} {date_str}: {data['error']}")
            return []
        return []
    except requests.exceptions.RequestException as e:
        print(f"  Request failed for {chamber} {date_str}: {e}")
        return []
    except json.JSONDecodeError:
        print(f"  Invalid JSON for {chamber} {date_str}")
        return []


def scrape_debate_page(listurl: str) -> list[dict]:
    """
    Scrape a full debate page to extract complete speeches.

    Returns a list of dicts with keys: speaker, party, electorate, text.
    """
    url = f"{SITE_BASE}{listurl}"
    try:
        resp = SESSION.get(url, timeout=30)
        resp.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"    Failed to fetch {url}: {e}")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    speeches = []

    main = soup.find("div", class_="main")
    if not main:
        return speeches

    # The page structure is flat inside div.main:
    #   <p class="speaker"><a ...><strong>Name</strong></a> <small>(Electorate, Party) | ...</small>
    #   <p>speech paragraph 1</p>
    #   <p>speech paragraph 2</p>
    #   <p class="speaker">... next speaker ...
    #
    # We iterate through all elements inside main, splitting on p.speaker tags.

    children = list(main.children)

    current_speaker = ""
    current_party = ""
    current_electorate = ""
    current_paragraphs = []

    def _flush():
        """Save the current speech if it has text."""
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

        # Check if this is a speaker tag
        if el.name == "p" and "speaker" in (el.get("class") or []):
            # Flush previous speech
            _flush()
            current_paragraphs = []

            # Parse speaker name from <strong> tag
            strong = el.find("strong")
            current_speaker = strong.get_text(strip=True) if strong else ""

            # Parse party/electorate from <small> tag
            # Format: "(Electorate, Party, Optional Title) | Hansard source"
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

            # The p.speaker tag itself can contain nested <p> children
            # with the first paragraph of speech text
            inner_ps = el.find_all("p")
            for ip in inner_ps:
                ip_classes = ip.get("class") or []
                if "speaker" in ip_classes:
                    continue
                ip_text = ip.get_text(strip=True)
                if ip_text:
                    current_paragraphs.append(ip_text)

            continue

        # Regular paragraph - part of current speech
        if el.name == "p":
            el_classes = el.get("class") or []
            # Skip timestamps like "10:01 am"
            el_text = el.get_text(strip=True)
            if re.match(r"^\d{1,2}:\d{2}\s*(am|pm)$", el_text):
                continue
            if el_text:
                current_paragraphs.append(el_text)

    # Flush the last speech
    _flush()

    # If no speeches found with speaker tags, fall back to collecting all <p> text
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


def process_day(date_str: str, chamber: str) -> list[dict]:
    """Process all debates for a single day and chamber."""
    records = []

    print(f"  Fetching debates for {chamber} on {date_str}...")
    debates = get_debates(chamber, date_str)
    rate_limit()

    if not debates:
        print(f"  No debates found (non-sitting day or empty response).")
        return records

    print(f"  Found {len(debates)} debate sections.")

    # Collect all unique listurls from subs, along with their topic
    pages_to_scrape = []
    for section in debates:
        entry = section.get("entry", {})
        topic = entry.get("body", "Unknown topic")
        # Clean HTML from topic
        topic = BeautifulSoup(topic, "html.parser").get_text(strip=True) if topic else "Unknown topic"

        subs = section.get("subs", [])
        for sub in subs:
            listurl = sub.get("listurl", "")
            excerpt = sub.get("excerpt", "")
            gid = sub.get("gid", "")
            if listurl:
                pages_to_scrape.append(
                    {
                        "topic": topic,
                        "listurl": listurl,
                        "excerpt": excerpt,
                        "gid": gid,
                    }
                )

    if not pages_to_scrape:
        print(f"  No debate sub-items with URLs found.")
        return records

    # Deduplicate by listurl (multiple subs can point to same page)
    seen_urls = set()
    unique_pages = []
    for page in pages_to_scrape:
        url = page["listurl"]
        if url not in seen_urls:
            seen_urls.add(url)
            unique_pages.append(page)

    print(f"  Scraping {len(unique_pages)} unique debate pages...")

    for i, page in enumerate(unique_pages):
        if (i + 1) % 10 == 0 or i == 0:
            print(f"    Page {i + 1}/{len(unique_pages)}: {page['topic'][:60]}...")

        speeches = scrape_debate_page(page["listurl"])
        rate_limit()

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
            # Fall back to the excerpt from the API if scraping yielded nothing
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


def save_records(records: list[dict], date_str: str, chamber: str):
    """Save records as a JSONL file."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filepath = OUTPUT_DIR / f"{date_str}_{chamber}.jsonl"
    with open(filepath, "w", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    print(f"  Saved {len(records)} records to {filepath}")


def output_exists(date_str: str, chamber: str) -> bool:
    """Check if output file already exists for resume capability."""
    filepath = OUTPUT_DIR / f"{date_str}_{chamber}.jsonl"
    return filepath.exists()


def daterange(start: date, end: date):
    """Yield dates from start to end (inclusive)."""
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def main():
    parser = argparse.ArgumentParser(
        description="Download Australian Hansard data from OpenAustralia API."
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
        help="Test mode: only download one day to verify the pipeline works",
    )
    args = parser.parse_args()

    start_date = datetime.strptime(args.start, "%Y-%m-%d").date()
    end_date = datetime.strptime(args.end, "%Y-%m-%d").date()

    if args.test:
        # In test mode, just do one day
        end_date = start_date
        print("TEST MODE: processing only one day.")

    chambers = (
        ["representatives", "senate"]
        if args.chamber == "both"
        else [args.chamber]
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}")
    print(f"Date range: {start_date} to {end_date}")
    print(f"Chambers: {', '.join(chambers)}")
    print()

    total_records = 0
    days_processed = 0
    days_skipped = 0

    for current_date in daterange(start_date, end_date):
        date_str = current_date.strftime("%Y-%m-%d")

        # Skip weekends as a quick optimization (parliament rarely sits)
        if current_date.weekday() >= 5:
            continue

        for chamber in chambers:
            if output_exists(date_str, chamber):
                days_skipped += 1
                continue

            print(f"[{date_str}] {chamber}")
            records = process_day(date_str, chamber)

            if records:
                save_records(records, date_str, chamber)
                total_records += len(records)
                days_processed += 1
            else:
                # Save empty file to mark this date as processed
                save_records([], date_str, chamber)
                days_processed += 1

            print()

    print("=" * 60)
    print(f"Done. Processed {days_processed} chamber-days, skipped {days_skipped} (already downloaded).")
    print(f"Total records saved: {total_records}")
    print(f"Output: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
