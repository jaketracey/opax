"""
parli.ingest.austender_full -- every AusTender contract notice, with the supplier's ABN.

AusTender's OCDS feed (api.tenders.gov.au, CC BY 3.0 AU, no key) lists the
contract notices published in a date window, at most 100 per response with a
`links.next` cursor for the rest. The earlier loader (parli.ingest.austender)
asked for a week at a time and never followed the cursor, so it kept about a
hundred notices a week and only the supplier's name. This one asks for one day
at a time, follows every page, and keeps what the feed carries for each
contract: the supplier's ABN (an `AU-ABN` additional identifier on the party),
its address, the buying agency and its ABN, the UNSPSC category, the value, the
period, the procurement method, and the amendment lineage (a variation is a
notice of its own, "CN1234-A2", parented to "CN1234").

Resumable: `ext_contract_fetch_log` records each finished day; a rerun skips
them and re-fetches the last two days, which may still be filling. Days are
walked newest first so a partial load already covers the years that matter.

    PYTHONPATH=. python3 -m parli.ingest.austender_full --db ~/.cache/autoresearch/parli.db [--since 2007-01-01] [--until today]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

SOURCE = "austender_ocds"
UA = "OPAX research (https://opax.com.au; contact jake.tracey@noice.work)"
API = "https://api.tenders.gov.au/ocds/findByDates/contractPublished/{d}T00:00:00Z/{d}T23:59:59Z"
PAUSE = 0.25          # between requests
RETRIES = 6

DDL = """
CREATE TABLE IF NOT EXISTS ext_contracts (
    release_id TEXT PRIMARY KEY, ocid TEXT, cn_id TEXT, parent_cn TEXT, published TEXT,
    supplier_name TEXT, supplier_abn TEXT, supplier_locality TEXT, supplier_region TEXT,
    supplier_postcode TEXT, supplier_country TEXT, agency TEXT, agency_abn TEXT,
    title TEXT, description TEXT, unspsc TEXT, amount REAL, currency TEXT,
    start_date TEXT, end_date TEXT, date_signed TEXT, procurement_method TEXT,
    procurement_method_details TEXT, award_id TEXT, status TEXT, tags TEXT, atm_id TEXT,
    fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_contracts_abn ON ext_contracts (supplier_abn);
CREATE INDEX IF NOT EXISTS ix_contracts_supplier ON ext_contracts (supplier_name);
CREATE INDEX IF NOT EXISTS ix_contracts_agency ON ext_contracts (agency);
CREATE INDEX IF NOT EXISTS ix_contracts_start ON ext_contracts (start_date);
CREATE INDEX IF NOT EXISTS ix_contracts_parent ON ext_contracts (parent_cn);
CREATE TABLE IF NOT EXISTS ext_contract_fetch_log (
    day TEXT PRIMARY KEY, releases INTEGER NOT NULL, contracts INTEGER NOT NULL, pages INTEGER NOT NULL,
    fetched_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ext_ingest_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT NOT NULL, source TEXT NOT NULL,
    rows_loaded INTEGER, rows_deleted INTEGER, loaded_at TEXT NOT NULL, notes TEXT
);
"""

AMEND_RE = re.compile(r"^(CN\d+)-A\d+$", re.I)


def log(*a):
    print(datetime.now().strftime("%H:%M:%S"), *a, flush=True)


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    for attempt in range(RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            if e.code == 400:
                # a day with nothing published is a 400 "No Records found", not an error
                body = e.read().decode("utf-8", "replace") if e.fp else ""
                if "No Records found" in body:
                    return {}
            if e.code in (429, 500, 502, 503, 504) and attempt < RETRIES - 1:
                time.sleep(3 * (attempt + 1) ** 2)
                continue
            raise
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
            if attempt == RETRIES - 1:
                raise
            time.sleep(3 * (attempt + 1) ** 2)
    return {}


def abn_of(party: dict) -> str | None:
    for ident in [party.get("identifier") or {}] + list(party.get("additionalIdentifiers") or []):
        if (ident.get("scheme") or "").upper() == "AU-ABN":
            digits = re.sub(r"\D", "", str(ident.get("id") or ""))
            if len(digits) == 11:
                return digits
    return None


def rows_of(release: dict, stamp: str) -> list[tuple]:
    parties = release.get("parties") or []
    supplier = next((p for p in parties if "supplier" in (p.get("roles") or [])), {})
    buyer = next((p for p in parties if "procuringEntity" in (p.get("roles") or []) or "buyer" in (p.get("roles") or [])), {})
    tender = release.get("tender") or {}
    addr = supplier.get("address") or {}
    tags = json.dumps(release.get("tag") or [])
    out = []
    contracts = release.get("contracts") or []
    for i, c in enumerate(contracts):
        value = c.get("value") or {}
        try:
            amount = float(value.get("amount") or 0)
        except (TypeError, ValueError):
            amount = 0.0
        period = c.get("period") or {}
        items = c.get("items") or []
        unspsc = ((items[0].get("classification") or {}).get("id") if items else None)
        cn = c.get("id") or ""
        m = AMEND_RE.match(cn)
        rid = release.get("id") or release.get("ocid") or cn
        if len(contracts) > 1:
            rid = f"{rid}#{i}"
        out.append((
            rid, release.get("ocid"), cn, m.group(1) if m else None, (release.get("date") or "")[:10] or None,
            supplier.get("name"), abn_of(supplier), addr.get("locality"), addr.get("region"),
            addr.get("postalCode"), addr.get("countryName"), buyer.get("name"), abn_of(buyer),
            c.get("title"), c.get("description"), unspsc, amount, value.get("currency"),
            (period.get("startDate") or "")[:10] or None, (period.get("endDate") or "")[:10] or None,
            (c.get("dateSigned") or "")[:10] or None, tender.get("procurementMethod"),
            tender.get("procurementMethodDetails"), c.get("awardID"), c.get("status"), tags, tender.get("id"),
            stamp,
        ))
    return out


def fetch_day(day: str) -> tuple[list[dict], int]:
    """All releases published on `day`, following the cursor; (releases, pages)."""
    url = API.format(d=day)
    releases: list[dict] = []
    pages = 0
    seen_urls = set()
    while url and url not in seen_urls:
        seen_urls.add(url)
        data = get_json(url)
        pages += 1
        releases.extend(data.get("releases") or [])
        url = (data.get("links") or {}).get("next")
        time.sleep(PAUSE)
    return releases, pages


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=os.path.expanduser("~/.cache/autoresearch/parli.db"))
    ap.add_argument("--since", default="2007-01-01")
    ap.add_argument("--until", default=date.today().isoformat())
    ap.add_argument("--max-days", type=int, default=0, help="stop after this many days (testing)")
    args = ap.parse_args()

    db = sqlite3.connect(args.db, timeout=600)
    db.execute("PRAGMA busy_timeout = 600000")
    db.executescript(DDL)
    done = {r[0] for r in db.execute("SELECT day FROM ext_contract_fetch_log")}
    today = date.today()
    d0 = date.fromisoformat(args.since)
    d1 = min(date.fromisoformat(args.until), today)
    # the last two days may still be filling on the feed's side
    refetch = {(today - timedelta(days=k)).isoformat() for k in (0, 1, 2)}
    days = []
    d = d1
    while d >= d0:
        s = d.isoformat()
        if s not in done or s in refetch:
            days.append(s)
        d -= timedelta(days=1)
    if args.max_days:
        days = days[:args.max_days]
    log(f"{len(days):,} days to fetch ({days[0] if days else '-'} back to {days[-1] if days else '-'}); {len(done):,} already done")
    total_rel = total_rows = 0
    t0 = time.time()
    stamp = now_iso()
    for i, day in enumerate(days, 1):
        try:
            releases, pages = fetch_day(day)
        except Exception as e:  # noqa: BLE001
            log(f"  {day}: FAILED {e!s:.120}")
            time.sleep(10)
            continue
        rows = [r for rel in releases for r in rows_of(rel, stamp)]
        cur = db.cursor()
        cur.execute("BEGIN")
        cur.executemany("INSERT OR REPLACE INTO ext_contracts VALUES (" + ",".join("?" * 28) + ")", rows)
        cur.execute("INSERT OR REPLACE INTO ext_contract_fetch_log VALUES (?,?,?,?,?)",
                    (day, len(releases), len(rows), pages, stamp))
        cur.execute("COMMIT")
        total_rel += len(releases)
        total_rows += len(rows)
        if i % 50 == 0 or i == len(days):
            rate = i / max(time.time() - t0, 1)
            log(f"  {i:,}/{len(days):,} days · {day} · {total_rows:,} contracts · {rate * 3600:.0f} days/h · "
                f"~{(len(days) - i) / max(rate, 1e-6) / 3600:.1f} h left")
    n = db.execute("SELECT COUNT(*), COUNT(DISTINCT supplier_abn), ROUND(SUM(amount)/1e9, 1) FROM ext_contracts").fetchone()
    db.execute("INSERT INTO ext_ingest_log (table_name, source, rows_loaded, rows_deleted, loaded_at, notes) VALUES (?,?,?,?,?,?)",
               ("ext_contracts", SOURCE, total_rows, 0, stamp, f"days={len(days)} releases={total_rel}; table now {n[0]} rows, {n[1]} ABNs, ${n[2]}B"))
    db.commit()
    log(f"done: {total_rows:,} contracts from {total_rel:,} releases; table {n[0]:,} rows, {n[1]:,} supplier ABNs, ${n[2]}B")


if __name__ == "__main__":
    main()
