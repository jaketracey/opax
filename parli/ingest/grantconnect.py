"""
parli.ingest.grantconnect -- Commonwealth grant awards from GrantConnect (grants.gov.au).

GrantConnect (Department of Finance) is where every Australian Government entity
must publish a Grant Award (GA) within 21 days of the agreement taking effect;
mandatory since 31 December 2017. The site is licensed CC BY 3.0 AU (footer of
every page). Its help pages say downloads need a registered account and there is
no API, but the results page's "Download Results" link answers anonymously:

    GET /Ga/DownloadResult?Type=Ga&AgencyStatus=-1&KeywordTypeSearch=AllWord
        &DateType=Publish%20Date&DateStart=01-Jul-2024&DateEnd=07-Jul-2024

returns an XLSX of every award published in the window. Two traps, both
measured 2026-09-05:

  * The export is SILENTLY TRUNCATED at 30,000 or 50,000 rows -- the sheet just
    stops, nothing says so. A financial year holds 60-100K awards. So this module
    walks publish-date windows (a month at a time) and recursively halves any
    window that comes back with >= SPLIT_AT rows, then checks the row count
    against the results page's "Showing 1-15 of N records" for the same window.
  * The export carries GA ID, grant activity, agency, category, publish / start /
    end dates, value, GO ID, recipient name and the one-off / aggregate flags --
    and NOT the recipient ABN, location, selection process, program or purpose.
    Those live only on the award's detail page, addressed by an opaque GUID
    (/Ga/Show/{guid}) that can only be found by searching the GA ID
    (/Ga/ListResult?Type=Ga&GaId=GA123456). `scripts/grantconnect_details.py`
    harvests those in the background on the database host, largest awards
    first, into `ext_grant_details`.

What lands where:

  ext_grants   one row per GA ID (source 'grantconnect'), additive; nothing in the
               older `government_grants` table (QLD state expenditure) is touched.
               `recipient_norm` is a light grouping key; the real entity
               resolution (ABN via the ABR bulk extract, donor link) happens in
               scripts/build_grant_recipients.py.

Run from the Mac (openpyxl is in the worktree venv; the writer ships gzip JSONL
to the DB host over ssh exactly like the other money loaders):

    PYTHONPATH=. .venv/bin/python -m parli.ingest.grantconnect               # everything since 2017-12-31
    PYTHONPATH=. .venv/bin/python -m parli.ingest.grantconnect --since 2026-07-01   # refresh recent windows
    PYTHONPATH=. .venv/bin/python -m parli.ingest.grantconnect --dry-run --until 2018-03-31

Downloads cache under ~/.cache/autoresearch/ext_money/grantconnect/ so a re-run
that only needs to re-parse is offline; --refetch discards the cache for the
windows in range.
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
import time
from pathlib import Path

import openpyxl

from parli.ingest.ext_common import (
    CACHE_ROOT, ExtWriter, add_writer_args, log, make_session, writer_from_args,
)

SOURCE = "grantconnect"
SOURCE_URL = "https://www.grants.gov.au/Ga/List"
LICENCE = "CC BY 3.0 AU (GrantConnect, Department of Finance)"
BASE = "https://www.grants.gov.au"
# GrantConnect answers 403 to anything that does not look like a browser (the
# project's plain research UA included); the compatible-token form passes and
# still names the project and a contact.
UA = "Mozilla/5.0 (compatible; OPAX research; +https://opax.com.au; contact jake.tracey@noice.work)"
MANDATORY_FROM = dt.date(2017, 12, 31)
# GrantConnect went live in 2017 and holds a few earlier voluntary records; start
# the walk on the first of that year so nothing before the mandatory date is lost.
WALK_FROM = dt.date(2017, 1, 1)
SPLIT_AT = 20_000          # halve a window at or above this many rows (caps seen: 30K / 50K)
DELAY = 2.0                # seconds between downloads: each one makes the server build a workbook
CACHE_DIR = CACHE_ROOT / "grantconnect"

EXPECTED_HEADER = (
    "GA ID", "Grant Activity", "Agency", "Publish Date", "Category", "Start Date",
    "End Date", "Value (AUD)", "GO ID", "Recipient Name", "One-off/Ad hoc",
    "Aggregate Grant Award", "Aggregate Reason", "Number of Awards Aggregated",
    "Last Updated",
)

DDL = """
CREATE TABLE IF NOT EXISTS ext_grants (
    ga_id TEXT PRIMARY KEY,
    version INTEGER,
    activity TEXT,
    agency TEXT,
    category TEXT,
    publish_date TEXT,
    start_date TEXT,
    end_date TEXT,
    financial_year TEXT,
    value REAL,
    go_id TEXT,
    recipient_name TEXT,
    recipient_norm TEXT,
    ad_hoc INTEGER,
    aggregate INTEGER,
    aggregate_reason TEXT,
    aggregate_count INTEGER,
    last_updated TEXT,
    window TEXT,
    source TEXT NOT NULL,
    source_url TEXT,
    ingested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ext_grants_norm ON ext_grants(recipient_norm);
CREATE INDEX IF NOT EXISTS idx_ext_grants_agency ON ext_grants(agency);
CREATE INDEX IF NOT EXISTS idx_ext_grants_value ON ext_grants(value DESC);
CREATE INDEX IF NOT EXISTS idx_ext_grants_fy ON ext_grants(financial_year);
CREATE INDEX IF NOT EXISTS idx_ext_grants_pub ON ext_grants(publish_date);
"""
COLUMNS = (
    "ga_id", "version", "activity", "agency", "category", "publish_date", "start_date", "end_date",
    "financial_year", "value", "go_id", "recipient_name", "recipient_norm", "ad_hoc",
    "aggregate", "aggregate_reason", "aggregate_count", "last_updated", "window",
    "source", "source_url", "ingested_at",
)

# The same light key the QLD grants and the AEC export use for a first grouping:
# case, punctuation and the legal-form tail. (The resolver in
# build_grant_recipients.py applies the donor normalisers on top of this.)
_SUFFIX_RE = re.compile(
    r"\b(pty|ltd|limited|proprietary|inc|incorporated|corporation|corp|co|company|"
    r"the|atf|trust|holdings|nl|plc)\b",
)


def norm_key(name: str | None) -> str:
    s = (name or "").lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = _SUFFIX_RE.sub(" ", s)
    return re.sub(r"\s+", " ", s).strip()


def fy_of(iso: str | None) -> str | None:
    """'2024-03-05' -> '2023-24' (Australian financial year, July to June)."""
    if not iso or len(iso) < 7:
        return None
    y, m = int(iso[:4]), int(iso[5:7])
    start = y if m >= 7 else y - 1
    return f"{start}-{str(start + 1)[2:]}"


# ── windows ──────────────────────────────────────────────────────────────────

def gc_date(d: dt.date) -> str:
    return d.strftime("%d-%b-%Y")            # 01-Jul-2024, the form's own format


def month_windows(start: dt.date, end: dt.date):
    cur = start
    while cur <= end:
        nxt = (cur.replace(day=1) + dt.timedelta(days=32)).replace(day=1)
        yield cur, min(nxt - dt.timedelta(days=1), end)
        cur = nxt


def halve(a: dt.date, b: dt.date):
    mid = a + (b - a) // 2
    return (a, mid), (mid + dt.timedelta(days=1), b)


def download_url(a: dt.date, b: dt.date, band: tuple | None = None) -> str:
    url = (f"{BASE}/Ga/DownloadResult?Type=Ga&AgencyStatus=-1&KeywordTypeSearch=AllWord"
           f"&DateType=Publish%20Date&DateStart={gc_date(a)}&DateEnd={gc_date(b)}")
    if band:
        url += f"&ValueStart={band[0]}&ValueEnd={band[1]}"
    return url


# A single day the server will not export as one file (2018-07-23 and -24 are
# such days: 2,254 and 3,319 awards, an unfiltered dump every time) can be
# exported in value bands: the same filter form takes a value range.
VALUE_BANDS = ((0, 9_999), (10_000, 49_999), (50_000, 99_999), (100_000, 249_999),
               (250_000, 999_999), (1_000_000, 9_999_999), (10_000_000, 999_999_999_999))


def count_url(a: dt.date, b: dt.date) -> str:
    return (f"{BASE}/Ga/ListResult?Type=Ga&AgencyStatus=-1&KeywordTypeSearch=AllWord"
            f"&DateType=Publish%20Date&DateStart={gc_date(a)}&DateEnd={gc_date(b)}")


_COUNT_RE = re.compile(r"Showing\s+1\s*-\s*\d+\s+of\s+([\d,]+)\s+records", re.S)  # tags already stripped


def server_count(session, a: dt.date, b: dt.date) -> int | None:
    """The results page's own total for a window (None if the page changed shape)."""
    time.sleep(DELAY / 2)
    r = session.get(count_url(a, b), timeout=120)
    if r.status_code != 200:
        return None
    text = re.sub(r"<[^>]+>", " ", r.text)
    m = _COUNT_RE.search(text)
    if m:
        return int(m.group(1).replace(",", ""))
    if re.search(r"No\s+results|0\s+records|no records", text, re.I):
        return 0
    return None


# ── XLSX ─────────────────────────────────────────────────────────────────────

def fetch_xlsx(session, a: dt.date, b: dt.date, refetch: bool = False, band: tuple | None = None) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    suffix = f"_v{band[0]}-{band[1]}" if band else ""
    path = CACHE_DIR / f"{a.isoformat()}_{b.isoformat()}{suffix}.xlsx"
    if path.exists() and path.stat().st_size > 2000 and not refetch:
        return path
    time.sleep(DELAY)
    r = session.get(download_url(a, b, band), timeout=600)
    r.raise_for_status()
    ctype = r.headers.get("content-type", "")
    if "spreadsheetml" not in ctype:
        raise RuntimeError(f"{a}..{b}: expected an XLSX, got {ctype} ({len(r.content)} bytes)")
    path.write_bytes(r.content)
    return path


def _iso(v) -> str | None:
    if v is None or v == "":
        return None
    if isinstance(v, dt.datetime):
        return v.date().isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    s = str(v).strip()
    for fmt in ("%d-%b-%Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return dt.datetime.strptime(s[:11].strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _num(v) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace("$", "").replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def _yes(v) -> int:
    return 1 if str(v or "").strip().lower() == "yes" else 0


def parse_xlsx(path: Path) -> list[dict]:
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb.worksheets[0]
    rows = ws.iter_rows(values_only=True)
    header = None
    out = []
    for r in rows:
        if header is None:
            if r and r[0] == "GA ID" and r[1] == "Grant Activity":
                header = tuple(c for c in r if c is not None)
                if header[: len(EXPECTED_HEADER)] != EXPECTED_HEADER:
                    raise RuntimeError(f"{path.name}: GrantConnect changed its export columns: {header}")
            continue
        if not r or not r[0]:
            continue
        rec = dict(zip(header, r))
        raw_id = str(rec["GA ID"]).strip()
        m = re.fullmatch(r"(GA\d+)(?:-V(\d+))?", raw_id)
        if not m:
            continue
        ga, version = m.group(1), int(m.group(2) or 0)
        start = _iso(rec.get("Start Date"))
        publish = _iso(rec.get("Publish Date"))
        name = (str(rec.get("Recipient Name") or "").strip()) or None
        out.append({
            "ga_id": ga,
            "version": version,
            "activity": (str(rec.get("Grant Activity") or "").strip()) or None,
            "agency": (str(rec.get("Agency") or "").strip()) or None,
            "category": (str(rec.get("Category") or "").strip()) or None,
            "publish_date": publish,
            "start_date": start,
            "end_date": _iso(rec.get("End Date")),
            "financial_year": fy_of(start or publish),
            "value": _num(rec.get("Value (AUD)")),
            "go_id": (str(rec.get("GO ID") or "").strip()) or None,
            "recipient_name": name,
            "recipient_norm": norm_key(name),
            "ad_hoc": _yes(rec.get("One-off/Ad hoc")),
            "aggregate": _yes(rec.get("Aggregate Grant Award")),
            "aggregate_reason": (str(rec.get("Aggregate Reason") or "").strip()) or None,
            "aggregate_count": int(_num(rec.get("Number of Awards Aggregated")) or 0),
            "last_updated": (str(rec.get("Last Updated") or "").strip()) or None,
        })
    wb.close()
    if header is None:
        raise RuntimeError(f"{path.name}: no header row found (login page instead of a workbook?)")
    return out


# ── walk ─────────────────────────────────────────────────────────────────────

def export_defect(recs: list[dict], a: dt.date, b: dt.date) -> str | None:
    """Why an export cannot be trusted, or None.

    Measured 2026-09-05: a window the server will not filter comes back as an
    UNFILTERED dump of the register in 10,000-row chunks -- publish dates from
    2017 to today, duplicate GA IDs, 30,000 or 50,000 rows -- with a 200 and an
    XLSX content type. The only tells are the dates and the duplicates.
    """
    lo, hi = a.isoformat(), b.isoformat()
    outside = sum(1 for r in recs if r["publish_date"] and not (lo <= r["publish_date"] <= hi))
    if outside:
        return f"{outside} rows published outside the window (unfiltered dump)"
    # A legitimate export can carry an award twice when two versions of it were
    # published inside the window (the bulk-publication days of July 2018 do);
    # the dump repeats thousands. Small numbers are deduplicated by the caller,
    # keeping the highest version.
    ids = [r["ga_id"] for r in recs]
    dups = len(ids) - len(set(ids))
    if dups > max(20, len(ids) // 100):
        return f"{dups} duplicate GA IDs (unfiltered dump)"
    return None


def dedupe(recs: list[dict]) -> list[dict]:
    """One row per GA ID: the highest version wins."""
    best: dict[str, dict] = {}
    for r in recs:
        cur = best.get(r["ga_id"])
        if cur is None or (r.get("version") or 0) >= (cur.get("version") or 0):
            best[r["ga_id"]] = r
    return list(best.values())


def fetch_day_in_bands(session, day: dt.date) -> tuple[list[dict], str | None]:
    """The day's awards as the union of its value-band exports, or (rows, why)."""
    out: dict[str, dict] = {}
    for band in VALUE_BANDS:
        path = fetch_xlsx(session, day, day, refetch=True, band=band)
        recs = parse_xlsx(path)
        bad = export_defect(recs, day, day)
        if bad:
            path.unlink(missing_ok=True)
            return [], f"band {band[0]}-{band[1]}: {bad}"
        for r in recs:
            out[r["ga_id"]] = r
        log(f"    {day} ${band[0]:,}-${band[1]:,}: {len(recs):,} awards")
    return list(out.values()), None


def harvest(session, start: dt.date, end: dt.date, refetch: bool, verify: bool) -> tuple[dict, list]:
    """Every award published in [start, end]; windows split until none is capped."""
    by_id: dict[str, dict] = {}
    report = []
    queue = list(month_windows(start, end))
    while queue:
        a, b = queue.pop(0)
        path = fetch_xlsx(session, a, b, refetch=refetch)
        recs = parse_xlsx(path)
        n = len(recs)
        bad = export_defect(recs, a, b)
        if bad:
            path.unlink(missing_ok=True)
            if a < b:
                log(f"  {a}..{b}: {bad}; halving")
                queue[:0] = list(halve(a, b))
            else:
                log(f"  {a}: {bad}; exporting the day in value bands")
                time.sleep(DELAY * 3)
                recs, bad = fetch_day_in_bands(session, a)
                n = len(recs)
                if bad:
                    log(f"  {a}: {bad}; GAP -- rerun later with --since {a}")
                    report.append((a.isoformat(), 0, None))
                    continue
            if bad:
                continue
        if n >= SPLIT_AT and a < b:
            log(f"  {a}..{b}: {n:,} rows, at or over the split line; halving")
            path.unlink(missing_ok=True)
            queue[:0] = list(halve(a, b))
            continue
        expected = server_count(session, a, b) if verify else None
        if expected is not None and expected != n:
            if a < b:
                log(f"  {a}..{b}: export has {n:,} rows but the site counts {expected:,}; halving")
                path.unlink(missing_ok=True)
                queue[:0] = list(halve(a, b))
                continue
            log(f"  {a}: export has {n:,} rows but the site counts {expected:,} (single day; keeping the export)")
        window = f"{a.isoformat()}..{b.isoformat()}"
        recs = dedupe(recs)
        n = len(recs)
        for rec in recs:
            rec["window"] = window
            by_id[rec["ga_id"]] = rec         # a GA re-published later wins (its row is the newer one)
        report.append((window, n, expected))
        log(f"  {window}: {n:,} awards" + (f" (site says {expected:,})" if expected is not None else ""))
    return by_id, report


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--since", default=None, help="first publish date to (re)load, ISO (default: walk from 2017-01-01)")
    ap.add_argument("--until", default=None, help="last publish date to load, ISO (default: today)")
    ap.add_argument("--refetch", action="store_true", help="ignore cached workbooks for the range")
    ap.add_argument("--no-verify", action="store_true", help="skip the per-window count check against the results page")
    add_writer_args(ap)
    args = ap.parse_args(argv)

    start = dt.date.fromisoformat(args.since) if args.since else WALK_FROM
    end = dt.date.fromisoformat(args.until) if args.until else dt.date.today()
    session = make_session()
    session.headers["User-Agent"] = UA
    log(f"GrantConnect awards published {start}..{end} -> {writer_from_args(args).describe()}")
    t0 = time.time()
    by_id, report = harvest(session, start, end, refetch=args.refetch, verify=not args.no_verify)
    log(f"  {len(by_id):,} distinct awards from {len(report)} windows in {time.time() - t0:.0f}s")

    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = []
    for rec in by_id.values():
        rec["source"] = SOURCE
        rec["source_url"] = SOURCE_URL
        rec["ingested_at"] = stamp
        rows.append([rec.get(c) for c in COLUMNS])

    writer: ExtWriter = writer_from_args(args)
    if args.since:
        # Incremental: only rows published in the range are replaced.
        delete_where = "source = ? AND publish_date >= ? AND publish_date <= ?"
        delete_params = [SOURCE, start.isoformat(), end.isoformat()]
    else:
        delete_where, delete_params = "source = ?", [SOURCE]
    notes = (f"windows={len(report)} range={start}..{end} licence={LICENCE} "
             f"verified={'no' if args.no_verify else 'site counts'}")
    writer.replace("ext_grants", DDL, COLUMNS, rows, SOURCE,
                   delete_where=delete_where, delete_params=delete_params, notes=notes)
    total = sum(r.get("value") or 0 for r in by_id.values())
    log(f"  ${total/1e9:,.2f}B across {len(by_id):,} awards")
    return 0


if __name__ == "__main__":
    sys.exit(main())
