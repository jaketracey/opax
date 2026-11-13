#!/usr/bin/env python3
"""Publish the federal sitting calendar for the app's Today line.

Writes portal/public/parliament/sitting-days.json from the Parliament of Australia's
published sitting calendars (one iCalendar file per year on static.aph.gov.au), for the
current and the next calendar year in Sydney. A year whose calendar is not yet published
is recorded as such and left out of the coverage; nothing is guessed. See
docs/DATA-SITTING-DAYS.md.

    python scripts/build_sitting_days.py                     # fetch current and next year
    python scripts/build_sitting_days.py --ics 2026=cal.ics  # offline, from a saved file

Requests use the OPAX agent (parli/ingest/user-agent.json), one at a time, at least a
second apart, and follow no redirect. A refusal (HTTP 401/403 or a challenge page) stops
the run with exit 4 and leaves the published file untouched.
"""
from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta
from email.utils import parsedate_to_datetime
import hashlib
import json
from pathlib import Path
import re
import sys
import time
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "portal/public/parliament/sitting-days.json"
TIMEZONE = "Australia/Sydney"
PUBLISHER = "Parliament of Australia"
CALENDAR_PAGE = "https://www.aph.gov.au/About_Parliament/Sitting_Calendar"
URL_TEMPLATE = ("https://static.aph.gov.au/-/media/05_About_Parliament/58_Sitting_Calendars/"
                "{year}/Parliamentary_Sittings_{year}.ics")
REQUEST_INTERVAL = 1.0
MIN_SITTING_DAYS = 20  # a whole published year has had 60 to 70; fewer means a broken parse

# The calendar's DESCRIPTION says which chamber sits; SUMMARY must agree.
CHAMBERS = {
    "house of representatives and senate sitting days": (True, True),
    "house of representatives sitting days": (True, False),
    "senate sitting days": (False, True),
}
SUMMARY_CHAMBERS = (
    (re.compile(r"\bboth houses\b", re.I), (True, True)),
    (re.compile(r"\bhouse sitting only\b", re.I), (True, False)),
    (re.compile(r"\bsenate sitting only\b", re.I), (False, True)),
)


class CalendarError(ValueError):
    """The source text is not a calendar this builder understands; publish nothing."""


def unfold(text: str) -> list[str]:
    """RFC 5545 lines: CRLF or LF, a leading space or tab continues the previous line."""
    lines: list[str] = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)
    return [line for line in lines if line.strip()]


def unescape(value: str) -> str:
    return re.sub(r"\\([\\;,nN])", lambda m: "\n" if m.group(1) in "nN" else m.group(1), value).strip()


def parse_line(line: str) -> tuple[str, dict[str, str], str]:
    head, sep, value = line.partition(":")
    if not sep:
        raise CalendarError(f"malformed calendar line: {line[:80]!r}")
    name, *params = head.split(";")
    return name.upper(), {k.upper(): v for k, _, v in (p.partition("=") for p in params)}, value


def event_date(params: dict[str, str], value: str, field: str) -> date:
    if params.get("VALUE", "DATE").upper() != "DATE" or not re.fullmatch(r"\d{8}", value):
        raise CalendarError(f"{field} {value!r} is not an all-day date")
    try:
        return datetime.strptime(value, "%Y%m%d").date()
    except ValueError as exc:
        raise CalendarError(f"{field} {value!r} is not a calendar date") from exc


def parse_calendar(text: str, year: int) -> dict[str, dict[str, bool]]:
    """Map ISO date -> {house, senate} for every sitting day in one year's calendar."""
    lines = unfold(text)
    if not lines or lines[0].strip().upper() != "BEGIN:VCALENDAR":
        raise CalendarError("not an iCalendar file")
    events: list[dict[str, tuple[dict[str, str], str]]] = []
    current: dict[str, tuple[dict[str, str], str]] | None = None
    for line in lines:
        name, params, value = parse_line(line)
        if name == "X-WR-TIMEZONE" and value.strip() != TIMEZONE:
            raise CalendarError(f"calendar timezone is {value.strip()!r}, expected {TIMEZONE}")
        if name == "BEGIN" and value.upper() == "VEVENT":
            current = {}
        elif name == "END" and value.upper() == "VEVENT":
            if current is None:
                raise CalendarError("END:VEVENT without BEGIN")
            events.append(current)
            current = None
        elif current is not None:
            current[name] = (params, value)
    if current is not None:
        raise CalendarError("unterminated VEVENT")

    days: dict[str, dict[str, bool]] = {}
    for event in events:
        summary = unescape(event.get("SUMMARY", ({}, ""))[1])
        description = unescape(event.get("DESCRIPTION", ({}, ""))[1])
        chamber = CHAMBERS.get(description.split(" - ", 1)[0].strip().lower())
        if chamber is None:
            if "sitting" in summary.lower() or "sitting" in description.lower():
                raise CalendarError(f"unrecognised sitting event: {summary!r} / {description!r}")
            continue  # public holidays, estimates hearings, Senate cut-off dates
        by_summary = next((c for pattern, c in SUMMARY_CHAMBERS if pattern.search(summary)), None)
        if by_summary != chamber:
            raise CalendarError(f"summary {summary!r} disagrees with description {description!r}")
        if "DTSTART" not in event:
            raise CalendarError(f"sitting event without a start date: {summary!r}")
        start = event_date(*event["DTSTART"], "DTSTART")
        end = event_date(*event["DTEND"], "DTEND") if "DTEND" in event else start + timedelta(days=1)
        if end <= start or (end - start).days > 14:
            raise CalendarError(f"implausible sitting span {start}..{end}")
        day = start
        while day < end:  # DTEND is exclusive for all-day events
            if day.year != year:
                raise CalendarError(f"{day} is outside the {year} calendar")
            flags = days.setdefault(day.isoformat(), {"house": False, "senate": False})
            flags["house"] |= chamber[0]
            flags["senate"] |= chamber[1]
            day += timedelta(days=1)
    return dict(sorted(days.items()))


def http_date(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return parsedate_to_datetime(value).astimezone(ZoneInfo(TIMEZONE)).date().isoformat()
    except (TypeError, ValueError, OverflowError):
        return None


def fetch_year(session, year: int, url: str) -> dict:
    """One GET, no redirect. Returns {'status': 'published', ...} or {'status': 'not_published'}."""
    response = session.get(url, allow_redirects=False, timeout=60,
                           headers={"Accept": "text/calendar, application/octet-stream;q=0.9"})
    location = response.headers.get("Location", "")
    if response.status_code == 404 or (response.is_redirect and "404" in location):
        return {"status": "not_published"}
    if response.status_code != 200:
        raise SystemExit(f"{url}: HTTP {response.status_code}{' to ' + location if location else ''}; nothing written")
    return {"status": "published", "body": response.content,
            "last_modified": http_date(response.headers.get("Last-Modified"))}


def build(years: dict[int, dict], today: date, min_days: int = MIN_SITTING_DAYS) -> dict:
    """years: {year: {'status', 'url', 'body'?, 'last_modified'?}} -> the published document."""
    ordered = sorted(years)
    if not ordered or years[ordered[0]]["status"] != "published":
        raise CalendarError(f"the {ordered[0] if ordered else today.year} calendar is not available; nothing to publish")
    entries, days, covered = [], {}, []
    for year in ordered:
        item = years[year]
        if item["status"] != "published":
            entries.append({"year": year, "status": "not_published", "checked": today.isoformat(), "url": item["url"]})
            continue
        if covered and covered[-1] != year - 1:
            raise CalendarError(f"{year} is published but {year - 1} is not; coverage must be continuous")
        body: bytes = item["body"]
        parsed = parse_calendar(body.decode("utf-8-sig"), year)
        if len(parsed) < min_days:
            raise CalendarError(f"{year}: only {len(parsed)} sitting days parsed (minimum {min_days})")
        days.update(parsed)
        covered.append(year)
        entries.append({
            "year": year, "status": "published",
            "sitting_days": {"house": sum(d["house"] for d in parsed.values()),
                             "senate": sum(d["senate"] for d in parsed.values()),
                             "either": len(parsed)},
            "source": {"publisher": PUBLISHER, "title": f"Parliamentary Sittings {year}",
                       "url": item["url"], "page": CALENDAR_PAGE,
                       "published": item.get("last_modified"),
                       "retrieved": today.isoformat(),
                       "sha256": hashlib.sha256(body).hexdigest()},
        })
    last = date(covered[-1], 12, 31).isoformat()
    return {
        "schema_version": 1,
        "published": today.isoformat(),
        "timezone": TIMEZONE,
        "coverage": {"first": date(covered[0], 1, 1).isoformat(), "last": last},
        "expires": last,
        "note": ("Dates are calendar days in Australia/Sydney. A date inside coverage that is not listed in days "
                 "is a day neither house sits. Outside coverage, or after expires, sitting is unknown. "
                 "The Parliament can change its calendar; this file is rebuilt from the published calendar."),
        "years": entries,
        "days": [{"date": d, **flags} for d, flags in days.items()],
    }


def guard_shrink(previous: dict | None, document: dict) -> None:
    """Never drop a year the previous file published because a fetch came back empty."""
    if not previous:
        return
    before = {y["year"] for y in previous.get("years", []) if y.get("status") == "published"}
    after = {y["year"] for y in document["years"] if y["status"] == "published"}
    # A past year rolling out of coverage on 1 January is expected; losing a current or future one is not.
    lost = sorted(y for y in before - after if y >= int(document["coverage"]["first"][:4]))
    if lost:
        raise CalendarError(f"previously published year(s) {lost} are no longer available; refusing to shrink coverage")


def sydney_today() -> date:
    return datetime.now(ZoneInfo(TIMEZONE)).date()


def pair(value: str) -> tuple[int, str]:
    year, sep, rest = value.partition("=")
    if not sep or not re.fullmatch(r"\d{4}", year):
        raise argparse.ArgumentTypeError("expected YEAR=VALUE")
    return int(year), rest


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--today", type=date.fromisoformat, help="Sydney date of the build (default: now)")
    ap.add_argument("--ics", type=pair, action="append", default=[], metavar="YEAR=PATH",
                    help="use a saved calendar for YEAR instead of fetching it")
    ap.add_argument("--url", type=pair, action="append", default=[], metavar="YEAR=URL",
                    help="calendar URL for YEAR when APH publishes it under another name")
    ap.add_argument("--allow-shrink", action="store_true", help="accept losing a previously published year")
    args = ap.parse_args(argv)

    today = args.today or sydney_today()
    urls = {today.year: URL_TEMPLATE.format(year=today.year), today.year + 1: URL_TEMPLATE.format(year=today.year + 1)}
    for year, url in args.url:
        if year not in urls or not url.startswith("https://static.aph.gov.au/"):
            ap.error(f"--url {year}: only {sorted(urls)} on https://static.aph.gov.au/")
        urls[year] = url
    saved = dict(args.ics)
    if set(saved) - set(urls):
        ap.error(f"--ics years must be among {sorted(urls)}")

    years: dict[int, dict] = {}
    session = None
    for year, url in urls.items():
        if year in saved:
            path = Path(saved[year])
            years[year] = {"status": "published", "url": url, "body": path.read_bytes(), "last_modified": None}
            continue
        if session is None:
            sys.path.insert(0, str(ROOT))
            from parli.ingest import http as source_http  # honest agent, refusal handling, no proxies
            session = source_http.Session()
        else:
            time.sleep(REQUEST_INTERVAL)
        years[year] = {"url": url, **fetch_year(session, year, url)}
        print(f"{year}: {years[year]['status']} ({url})", flush=True)

    try:
        document = build(years, today)
        previous = json.loads(args.out.read_text()) if args.out.exists() else None
        if not args.allow_shrink:
            guard_shrink(previous, document)
    except CalendarError as exc:
        print(f"sitting days: {exc}; {args.out} left unchanged", file=sys.stderr)
        return 1
    args.out.parent.mkdir(parents=True, exist_ok=True)
    tmp = args.out.with_suffix(".tmp")
    tmp.write_text(json.dumps(document, indent=1, ensure_ascii=False) + "\n")
    tmp.replace(args.out)
    published = [y for y in document["years"] if y["status"] == "published"]
    print(f"wrote {args.out}: {len(document['days'])} sitting days, coverage "
          f"{document['coverage']['first']}..{document['coverage']['last']}, "
          f"{', '.join(str(y['year']) for y in published)} published")
    return 0


if __name__ == "__main__":
    sys.exit(main())
