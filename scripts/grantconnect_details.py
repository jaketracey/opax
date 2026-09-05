#!/usr/bin/env python3
"""GrantConnect award detail pages -> ext_grant_details, largest awards first.

The XLSX export behind `parli.ingest.grantconnect` has no ABN, location,
selection process, program or purpose. Each of those is on the award's detail
page, which has an opaque GUID address that only a GA-ID search reveals:

    GET /Ga/ListResult?Type=Ga&AgencyStatus=-1&GaId=GA578028   -> /Ga/Show/{guid}
    GET /Ga/Show/{guid}                                        -> the fields

Two requests per award, ~1.2 awards a second at the polite pace below, so the
whole register (~600K awards) is days of background work. The queue is ordered
by value, so the first hour already covers the money that matters; the site is
CC BY 3.0 AU and its robots.txt allows /Ga/*.

Runs ON the database host (stdlib + requests; nothing else), because it writes
straight into parli.db in short transactions:

    scp scripts/grantconnect_details.py desktop:/tmp/
    ssh desktop 'nohup python3 /tmp/grantconnect_details.py --min-value 10000 \
        > /tmp/gc_details.log 2>&1 & echo $! > /tmp/gc_details.pid'
    ssh desktop 'tail -3 /tmp/gc_details.log; kill -0 $(cat /tmp/gc_details.pid) && echo RUNNING'

It resumes by itself: awards that already have a row in ext_grant_details are
skipped unless --refresh-days says the row is stale. Stop it with the pidfile;
nothing is lost, every 25 awards are committed.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import signal
import sqlite3
import sys
import time
from datetime import datetime, timezone

import requests

DB = os.path.expanduser("~/.cache/autoresearch/parli.db")
BASE = "https://www.grants.gov.au"
# GrantConnect answers 403 to anything that does not look like a browser; the
# compatible-token form still names the project and a contact.
UA = "Mozilla/5.0 (compatible; OPAX research; +https://opax.com.au; contact jake.tracey@noice.work)"
DELAY = 0.5              # between requests; two per award, so about one award a second
COMMIT_EVERY = 25
SOURCE = "grantconnect_details"

DDL = """
CREATE TABLE IF NOT EXISTS ext_grant_details (
    ga_id TEXT PRIMARY KEY,
    guid TEXT,
    approval_date TEXT,
    pbs_program TEXT,
    program TEXT,
    activity TEXT,
    purpose TEXT,
    go_id TEXT,
    internal_ref TEXT,
    selection_process TEXT,
    confidential_contract INTEGER,
    confidential_outputs INTEGER,
    recipient_name TEXT,
    recipient_abn TEXT,
    recipient_suburb TEXT,
    recipient_town TEXT,
    recipient_postcode TEXT,
    recipient_state TEXT,
    recipient_country TEXT,
    delivery_state TEXT,
    delivery_postcode TEXT,
    delivery_country TEXT,
    value REAL,
    http_status INTEGER,
    fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ext_gd_abn ON ext_grant_details(recipient_abn);
CREATE INDEX IF NOT EXISTS idx_ext_gd_postcode ON ext_grant_details(delivery_postcode);
CREATE INDEX IF NOT EXISTS idx_ext_gd_sel ON ext_grant_details(selection_process);
CREATE TABLE IF NOT EXISTS ext_ingest_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    source TEXT NOT NULL,
    rows_loaded INTEGER,
    rows_deleted INTEGER,
    loaded_at TEXT NOT NULL,
    notes TEXT
);
"""

COLS = ("ga_id", "guid", "approval_date", "pbs_program", "program", "activity", "purpose", "go_id",
        "internal_ref", "selection_process", "confidential_contract", "confidential_outputs",
        "recipient_name", "recipient_abn", "recipient_suburb", "recipient_town", "recipient_postcode",
        "recipient_state", "recipient_country", "delivery_state", "delivery_postcode",
        "delivery_country", "value", "http_status", "fetched_at")

stop = False


def on_signal(*_):
    global stop
    stop = True


def log(*a):
    print(datetime.now().strftime("%H:%M:%S"), *a, flush=True)


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ── HTTP ─────────────────────────────────────────────────────────────────────

class Client:
    def __init__(self):
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": UA, "Accept-Language": "en-AU,en;q=0.9"})
        self.requests = 0

    def get(self, url: str) -> requests.Response | None:
        backoff = 5
        for attempt in range(6):
            time.sleep(DELAY)
            self.requests += 1
            try:
                r = self.s.get(url, timeout=60, allow_redirects=False)
            except requests.RequestException as e:
                log(f"  network error {e.__class__.__name__} on {url[-60:]}; sleeping {backoff}s")
                time.sleep(backoff)
                backoff = min(backoff * 2, 300)
                continue
            if r.status_code in (403, 429) or r.status_code >= 500:
                wait = 600 if r.status_code in (403, 429) else backoff
                log(f"  HTTP {r.status_code} on {url[-60:]}; sleeping {wait}s")
                time.sleep(wait)
                backoff = min(backoff * 2, 300)
                continue
            return r
        return None


# ── parsing ──────────────────────────────────────────────────────────────────

_GUID_RE = re.compile(r'href="/Ga/Show/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"', re.I)
_DESC_RE = re.compile(
    r'<div class="list-desc">\s*<span>(.*?)</span>\s*(?:<div class="list-desc-inner">(.*?)</div>)?',
    re.S,
)
_TAG_RE = re.compile(r"<[^>]+>")


def clean(s: str | None) -> str | None:
    if s is None:
        return None
    s = html.unescape(_TAG_RE.sub(" ", s))
    s = re.sub(r"\s+", " ", s).strip()
    return s or None


def iso(d: str | None) -> str | None:
    if not d:
        return None
    for fmt in ("%d-%b-%Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(d.strip(), fmt).date().isoformat()
        except ValueError:
            pass
    return None


def parse_detail(page: str) -> dict:
    """Walk the labelled blocks in order; the two location blocks reuse labels."""
    out: dict = {}
    section = "main"
    for label_raw, value_raw in _DESC_RE.findall(page):
        label = clean(label_raw) or ""
        if "<h2>" in label_raw:
            if "Recipient Location" in label:
                section = "recipient"
            elif "Delivery Location" in label:
                section = "delivery"
            elif "Recipient Details" in label:
                section = "recipient_details"
            continue
        label = label.rstrip(":").strip()
        value = clean(value_raw)
        key = (section, label)
        if key not in out:
            out[key] = value
    g = lambda sec, lab: out.get((sec, lab))  # noqa: E731
    abn = g("recipient_details", "Recipient ABN") or g("main", "Recipient ABN")
    abn_digits = re.sub(r"\D", "", abn or "") or None
    if abn_digits and len(abn_digits) != 11:
        abn_digits = None
    yes = lambda v: None if v is None else (1 if v.lower().startswith("y") else 0)  # noqa: E731
    return {
        "approval_date": iso(g("main", "Approval Date")),
        "pbs_program": g("main", "PBS Program Name"),
        "program": g("main", "Grant Program"),
        "activity": g("main", "Grant Activity"),
        "purpose": g("main", "Purpose"),
        "go_id": g("main", "GO ID"),
        "internal_ref": g("main", "InternalReferenceId") or g("main", "Internal Reference ID"),
        "selection_process": g("main", "Selection Process"),
        "confidential_contract": yes(g("main", "Confidentiality - Contract")),
        "confidential_outputs": yes(g("main", "Confidentiality - Outputs")),
        "recipient_name": g("recipient_details", "Recipient Name") or g("main", "Recipient Name"),
        "recipient_abn": abn_digits,
        "recipient_suburb": g("recipient", "Suburb"),
        "recipient_town": g("recipient", "Town/City"),
        "recipient_postcode": g("recipient", "Postcode"),
        "recipient_state": g("recipient", "State/Territory"),
        "recipient_country": g("recipient", "Country"),
        "delivery_state": g("delivery", "State/Territory"),
        "delivery_postcode": g("delivery", "Postcode"),
        "delivery_country": g("delivery", "Country"),
    }


# ── main loop ────────────────────────────────────────────────────────────────

def queue(db: sqlite3.Connection, min_value: float, limit: int | None, refresh_days: int | None,
          ids: list[str] | None) -> list[tuple[str, float]]:
    if ids:
        ph = ",".join("?" for _ in ids)
        return db.execute(f"SELECT ga_id, value FROM ext_grants WHERE ga_id IN ({ph})", ids).fetchall()
    stale = ""
    params: list = [min_value]
    if refresh_days:
        stale = "OR d.fetched_at < ?"
        params.append(datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")[:10])
    sql = f"""
        SELECT g.ga_id, g.value FROM ext_grants g
        LEFT JOIN ext_grant_details d ON d.ga_id = g.ga_id
        WHERE COALESCE(g.value, 0) >= ? AND (d.ga_id IS NULL {stale})
          AND g.aggregate = 0
        ORDER BY g.value DESC
    """
    if limit:
        sql += f" LIMIT {int(limit)}"
    return db.execute(sql, params).fetchall()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=DB)
    ap.add_argument("--min-value", type=float, default=0, help="only awards worth at least this (AUD)")
    ap.add_argument("--limit", type=int, default=None, help="stop after this many awards")
    ap.add_argument("--refresh-days", type=int, default=None, help="also refetch rows older than this")
    ap.add_argument("--ids", nargs="*", default=None, help="specific GA IDs")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGINT, on_signal)

    db = sqlite3.connect(args.db, timeout=600)
    db.execute("PRAGMA busy_timeout = 600000")
    db.executescript(DDL)
    todo = queue(db, args.min_value, args.limit, args.refresh_days, args.ids)
    log(f"{len(todo):,} awards to fetch (min value {args.min_value:,.0f}) -> {args.db}")
    if not todo:
        return 0

    client = Client()
    t0 = time.time()
    done = failed = 0
    pending: list[tuple] = []
    insert = f"INSERT OR REPLACE INTO ext_grant_details ({','.join(COLS)}) VALUES ({','.join('?' for _ in COLS)})"

    def flush():
        nonlocal pending
        if not pending:
            return
        for attempt in range(5):
            try:
                db.executemany(insert, pending)
                db.commit()
                break
            except sqlite3.OperationalError as e:
                log(f"  db busy ({e}); retrying")
                time.sleep(15)
        pending = []

    for ga_id, value in todo:
        if stop:
            break
        rec = {"ga_id": ga_id, "value": value, "fetched_at": now(), "guid": None, "http_status": None}
        r = client.get(f"{BASE}/Ga/ListResult?Type=Ga&AgencyStatus=-1&GaId={ga_id}")
        if r is None:
            failed += 1
            log(f"  {ga_id}: search failed")
            continue
        m = _GUID_RE.search(r.text)
        if not m:
            rec["http_status"] = 404
            pending.append(tuple(rec.get(c) for c in COLS))
            failed += 1
        else:
            guid = m.group(1)
            rec["guid"] = guid
            r2 = client.get(f"{BASE}/Ga/Show/{guid}")
            if r2 is None or r2.status_code != 200:
                rec["http_status"] = r2.status_code if r2 is not None else 0
                pending.append(tuple(rec.get(c) for c in COLS))
                failed += 1
            else:
                rec["http_status"] = 200
                rec.update(parse_detail(r2.text))
                pending.append(tuple(rec.get(c) for c in COLS))
                done += 1
        if args.dry_run:
            print(json.dumps(rec, default=str)[:600])
            pending = []
        elif len(pending) >= COMMIT_EVERY:
            flush()
        if (done + failed) % 100 == 0:
            el = time.time() - t0
            rate = (done + failed) / el if el else 0
            left = len(todo) - done - failed
            log(f"  {done:,} ok / {failed:,} failed of {len(todo):,}; {rate:.2f}/s; "
                f"~{left / rate / 3600:.1f} h left" if rate else f"  {done:,} ok / {failed:,} failed")
    flush()
    if not args.dry_run:
        db.execute("INSERT INTO ext_ingest_log (table_name, source, rows_loaded, rows_deleted, loaded_at, notes) "
                   "VALUES (?,?,?,?,?,?)",
                   ("ext_grant_details", SOURCE, done, 0, now(),
                    f"failed={failed} requests={client.requests} min_value={args.min_value} "
                    f"stopped={'signal' if stop else 'done'} seconds={int(time.time() - t0)}"))
        db.commit()
    log(f"finished: {done:,} ok, {failed:,} failed, {client.requests:,} requests, {int(time.time() - t0)}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
