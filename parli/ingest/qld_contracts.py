"""
parli.ingest.qld_contracts -- Queensland's contract disclosure reports, every agency, one table.

Queensland agencies publish contract disclosure reports (contracts of $10,000
and over) as CSV or spreadsheet files on data.qld.gov.au, one dataset per
agency and usually one file per financial year: about 370 datasets and 900
files with one recurring header ("Agency (Dept or Stat Body), Agency address,
Contract description/name, Award contract date, Contract value, Supplier name,
Supplier address, Variation to contract, ..., Procurement method, Contract
reference number") that drifts a little between agencies and years. Some
files carry a Supplier ABN; most do not.

This loader catalogues every dataset whose title or tags say "contract
disclosure", downloads each CSV/XLSX/XLS file once (cached under --cache),
maps columns by their header words, and writes `ext_state_contracts` with
jurisdiction 'qld'. A row is one disclosed contract or variation; duplicates
of the same (agency, supplier, date, value, description) across overlapping
files are kept once. Values are AUD; the award date is ISO.

    PYTHONPATH=. python3 -m parli.ingest.qld_contracts --db ~/.cache/autoresearch/parli.db [--cache ~/.cache/autoresearch/qld_contracts] [--limit N]
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

SOURCE = "qld_contract_disclosure"
UA = "OPAX research (https://opax.com.au; contact jake.tracey@noice.work)"
CKAN = "https://www.data.qld.gov.au/api/3/action/package_search"
QUERIES = ["contract disclosure", "contracts disclosure", "contract disclosure report"]

DDL = """
CREATE TABLE IF NOT EXISTS ext_state_contracts (
    row_key TEXT PRIMARY KEY, jurisdiction TEXT NOT NULL, dataset TEXT, resource TEXT, agency TEXT,
    supplier_name TEXT, supplier_abn TEXT, supplier_address TEXT, description TEXT, award_date TEXT,
    financial_year TEXT, amount REAL, variation INTEGER, procurement_method TEXT, reference TEXT,
    category TEXT, source_url TEXT, ingested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_state_contracts_jur ON ext_state_contracts (jurisdiction);
CREATE INDEX IF NOT EXISTS ix_state_contracts_supplier ON ext_state_contracts (supplier_name);
CREATE INDEX IF NOT EXISTS ix_state_contracts_abn ON ext_state_contracts (supplier_abn);
CREATE TABLE IF NOT EXISTS ext_state_contracts_current (
    row_key TEXT PRIMARY KEY, jurisdiction TEXT NOT NULL, agency TEXT, supplier_name TEXT, supplier_abn TEXT,
    description TEXT, award_date TEXT, financial_year TEXT, amount REAL, notices INTEGER NOT NULL,
    reference TEXT, procurement_method TEXT, category TEXT
);
CREATE INDEX IF NOT EXISTS ix_state_current_jur ON ext_state_contracts_current (jurisdiction);
CREATE INDEX IF NOT EXISTS ix_state_current_supplier ON ext_state_contracts_current (supplier_name);
CREATE INDEX IF NOT EXISTS ix_state_current_abn ON ext_state_contracts_current (supplier_abn);
CREATE TABLE IF NOT EXISTS ext_state_contract_files (
    jurisdiction TEXT NOT NULL, dataset TEXT NOT NULL, resource_url TEXT NOT NULL, format TEXT, rows INTEGER,
    header TEXT, status TEXT, fetched_at TEXT NOT NULL, PRIMARY KEY (jurisdiction, resource_url)
);
CREATE TABLE IF NOT EXISTS ext_ingest_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT NOT NULL, source TEXT NOT NULL,
    rows_loaded INTEGER, rows_deleted INTEGER, loaded_at TEXT NOT NULL, notes TEXT
);
"""

# header words -> field; first match wins, in this order
COLUMN_RULES = [
    ("supplier_abn", re.compile(r"\babn\b", re.I)),
    ("supplier_name", re.compile(r"supplier\s*(name)?$|^supplier$|contractor\s*name|vendor\s*name|supplier/contractor", re.I)),
    ("supplier_address", re.compile(r"supplier.*address|address.*supplier|vendor.*address", re.I)),
    ("agency", re.compile(r"^agency(\s*\(|\s*name|$)|department|entity\s*name", re.I)),
    ("award_date", re.compile(r"award.*date|date.*award|posting\s*date|^date$|contract\s*date|commencement", re.I)),
    ("amount", re.compile(r"contract\s*value|^value|total\s*value|amount|price", re.I)),
    ("description", re.compile(r"description|contract\s*name|title|purpose|goods|services", re.I)),
    ("variation", re.compile(r"variation", re.I)),
    ("procurement_method", re.compile(r"procurement\s*method|method|tender", re.I)),
    ("reference", re.compile(r"reference|contract\s*(no|number|id)|\bcn\b", re.I)),
    ("category", re.compile(r"category", re.I)),
]


def log(*a):
    print(datetime.now().strftime("%H:%M:%S"), *a, flush=True)


def get(url: str, tries: int = 4) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            # a file the portal no longer has is gone; only a busy server earns a retry
            if e.code not in (429, 500, 502, 503, 504) or attempt == tries - 1:
                raise
            time.sleep(3 * (attempt + 1))
        except Exception:  # noqa: BLE001
            if attempt == tries - 1:
                raise
            time.sleep(3 * (attempt + 1))
    return b""


def catalogue() -> list[dict]:
    seen = set()
    out = []
    for q in QUERIES:
        start = 0
        while True:
            d = json.loads(get(f"{CKAN}?{urllib.parse.urlencode({'q': q, 'rows': 200, 'start': start})}"))
            res = d["result"]["results"]
            for r in res:
                text = (r.get("title") or "") + " " + r.get("name", "") + " " + " ".join(t.get("name", "") for t in r.get("tags", []))
                if not re.search(r"contracts?\s*disclosure", text, re.I):
                    continue
                for x in r.get("resources", []):
                    fmt = (x.get("format") or "").upper()
                    url = x.get("url") or ""
                    if fmt not in ("CSV", "XLSX", "XLS") or not url or url in seen:
                        continue
                    seen.add(url)
                    out.append({"dataset": r["name"], "org": (r.get("organization") or {}).get("title"),
                                "resource": x.get("name") or "", "format": fmt, "url": url})
            start += 200
            if start >= d["result"]["count"]:
                break
    return out


def map_columns(header: list[str]) -> dict[str, int]:
    cols: dict[str, int] = {}
    for i, h in enumerate(header):
        h = (h or "").strip()
        if not h:
            continue
        for field, rx in COLUMN_RULES:
            if field in cols:
                continue
            if rx.search(h):
                cols[field] = i
                break
    return cols


def parse_amount(s) -> float | None:
    if s is None:
        return None
    if isinstance(s, (int, float)):
        return float(s)
    t = re.sub(r"[^\d.\-()]", "", str(s))
    if not t or t in ("-", "."):
        return None
    neg = t.startswith("(") and t.endswith(")")
    t = t.strip("()")
    try:
        v = float(t)
    except ValueError:
        return None
    return -v if neg else v


DATE_FORMATS = ["%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d", "%d-%m-%Y", "%d %b %Y", "%d %B %Y", "%d.%m.%Y", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y %H:%M"]


def parse_date(s) -> str | None:
    if s is None:
        return None
    if isinstance(s, datetime):
        return s.date().isoformat()
    t = str(s).strip()
    if not t:
        return None
    for f in DATE_FORMATS:
        try:
            return datetime.strptime(t, f).date().isoformat()
        except ValueError:
            continue
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", t)
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else None


def fy_of(iso: str | None) -> str | None:
    if not iso:
        return None
    y, m = int(iso[:4]), int(iso[5:7])
    a = y if m >= 7 else y - 1
    return f"{a}-{str(a + 1)[-2:]}"


def read_rows(path: Path, fmt: str) -> tuple[list[str], list[list]]:
    """(header, rows) for a CSV or spreadsheet; the header is the first row that names a supplier."""
    if fmt == "CSV":
        raw = path.read_bytes()
        for enc in ("utf-8-sig", "cp1252", "latin-1"):
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        rows = list(csv.reader(io.StringIO(text)))
    else:
        try:
            import openpyxl  # noqa: PLC0415
        except ImportError:
            return [], []
        if fmt == "XLS":
            return [], []
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        rows = []
        for ws in wb.worksheets[:1]:
            for r in ws.iter_rows(values_only=True):
                rows.append(["" if v is None else v for v in r])
    for i, r in enumerate(rows[:15]):
        if any(re.search(r"supplier|contractor|vendor", str(c), re.I) for c in r):
            return [str(c) for c in r], rows[i + 1:]
    return [], []


def _gkey(s: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def build_current(db: sqlite3.Connection, jur: str) -> tuple[int, float]:
    """One row per contract. A variation row in these registers restates the
    contract's whole value (Queensland Rail's $10.4B service contract appears
    on every variation), so summing rows counts a varied contract several
    times over. Rows sharing an agency and reference number are one contract;
    rows without a reference fold by agency, supplier and description when any
    of them is a variation. The row kept is the largest value, the varied total."""
    rows = db.execute(
        "SELECT row_key, agency, supplier_name, supplier_abn, description, award_date, financial_year, amount, "
        "variation, reference, procurement_method, category FROM ext_state_contracts WHERE jurisdiction = ?", (jur,)).fetchall()
    groups: dict[tuple, list] = {}
    for r in rows:
        ref = (r[9] or "").strip()
        if ref:
            k = ("ref", _gkey(r[1]), ref.lower())
        else:
            k = ("desc", _gkey(r[1]), _gkey(r[2]), _gkey(r[4])[:80])
        groups.setdefault(k, []).append(r)
    out = []
    for k, rs in groups.items():
        if k[0] == "desc" and not any(r[8] for r in rs):
            # no variation among them: separate contracts that happen to read alike
            for r in rs:
                out.append((r[0], jur, r[1], r[2], r[3], r[4], r[5], r[6], r[7], 1, r[9], r[10], r[11]))
            continue
        best = max(rs, key=lambda r: (r[7] or 0, r[5] or ""))
        dated = [r[5] for r in rs if r[5]]
        first = min(dated) if dated else best[5]
        fy = fy_of(first) if first else best[6]
        out.append((best[0], jur, best[1], best[2], best[3] or next((r[3] for r in rs if r[3]), None), best[4],
                    first, fy, best[7], len(rs), best[9], best[10], best[11]))
    db.execute("DELETE FROM ext_state_contracts_current WHERE jurisdiction = ?", (jur,))
    db.executemany("INSERT OR REPLACE INTO ext_state_contracts_current VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", out)
    return len(out), sum(r[8] or 0 for r in out)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=os.path.expanduser("~/.cache/autoresearch/parli.db"))
    ap.add_argument("--cache", default=os.path.expanduser("~/.cache/autoresearch/qld_contracts"))
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--current-only", action="store_true", help="rebuild ext_state_contracts_current from the loaded rows")
    args = ap.parse_args()
    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(args.db, timeout=600)
    db.execute("PRAGMA busy_timeout = 600000")
    db.executescript(DDL)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if args.current_only:
        n, total = build_current(db, "qld")
        db.commit()
        log(f"current: {n:,} contracts, ${total/1e9:.1f}B after folding variations")
        return

    files = catalogue()
    if args.limit:
        files = files[:args.limit]
    log(f"{len(files):,} files across {len({f['dataset'] for f in files}):,} datasets")
    stats: Counter = Counter()
    rows_out = []
    for i, f in enumerate(files, 1):
        ext = f["format"].lower()
        path = cache / (hashlib.sha1(f["url"].encode()).hexdigest()[:16] + "." + ext)
        status = "ok"
        if not path.exists():
            try:
                path.write_bytes(get(f["url"]))
                time.sleep(0.2)
            except Exception as e:  # noqa: BLE001
                status = f"download failed: {e!s:.60}"
                stats["download_failed"] += 1
        header, rows = ([], [])
        if status == "ok":
            try:
                header, rows = read_rows(path, f["format"])
            except Exception as e:  # noqa: BLE001
                status = f"parse failed: {e!s:.60}"
                stats["parse_failed"] += 1
        cols = map_columns(header) if header else {}
        n = 0
        if "supplier_name" in cols and "amount" in cols:
            for r in rows:
                def cell(field):
                    j = cols.get(field)
                    return (str(r[j]).strip() if j is not None and j < len(r) and r[j] not in (None, "") else "")
                supplier = cell("supplier_name")
                amount = parse_amount(r[cols["amount"]] if cols["amount"] < len(r) else None)
                if not supplier or amount is None:
                    continue
                date = parse_date(r[cols["award_date"]] if "award_date" in cols and cols["award_date"] < len(r) else None)
                agency = cell("agency") or f["org"] or ""
                desc = cell("description")
                abn = re.sub(r"\D", "", cell("supplier_abn"))
                key = hashlib.sha1("|".join([agency.lower(), supplier.lower(), date or "", f"{amount:.2f}", desc.lower()[:80]]).encode()).hexdigest()
                rows_out.append((key, "qld", f["dataset"], f["resource"], agency, supplier, abn if len(abn) == 11 else None,
                                 cell("supplier_address"), desc, date, fy_of(date), amount,
                                 1 if re.match(r"^y", cell("variation"), re.I) else 0, cell("procurement_method"),
                                 cell("reference"), cell("category"), f["url"], stamp))
                n += 1
        elif status == "ok":
            status = "no supplier/value columns" if header else ("spreadsheet unreadable (no openpyxl)" if ext != "csv" else "no header")
            stats["unmapped"] += 1
        stats["rows"] += n
        db.execute("INSERT OR REPLACE INTO ext_state_contract_files VALUES (?,?,?,?,?,?,?,?)",
                   ("qld", f["dataset"], f["url"], f["format"], n, json.dumps(header[:20], ensure_ascii=False), status, stamp))
        if i % 100 == 0 or i == len(files):
            log(f"  {i:,}/{len(files):,} files · {stats['rows']:,} rows · unmapped {stats['unmapped']} · failed {stats['download_failed'] + stats['parse_failed']}")
    db.commit()   # the per-file log rows above opened an implicit transaction
    cur = db.cursor()
    cur.execute("BEGIN")
    cur.execute("DELETE FROM ext_state_contracts WHERE jurisdiction = 'qld'")
    cur.executemany("INSERT OR REPLACE INTO ext_state_contracts VALUES (" + ",".join("?" * 18) + ")", rows_out)
    kept = cur.execute("SELECT COUNT(*), ROUND(SUM(amount)/1e9, 2), COUNT(DISTINCT supplier_name), SUM(supplier_abn IS NOT NULL) "
                       "FROM ext_state_contracts WHERE jurisdiction = 'qld'").fetchone()
    cur.execute("INSERT INTO ext_ingest_log (table_name, source, rows_loaded, rows_deleted, loaded_at, notes) VALUES (?,?,?,?,?,?)",
                ("ext_state_contracts", SOURCE, kept[0], 0, stamp, f"files={len(files)} " + ", ".join(f"{k}={v}" for k, v in sorted(stats.items()))))
    cur.execute("COMMIT")
    n, total = build_current(db, "qld")
    db.commit()
    log(f"done: {kept[0]:,} rows (${kept[1]}B) from {kept[2]:,} supplier names, {kept[3]:,} rows with an ABN; "
        f"{n:,} contracts (${total/1e9:.1f}B) after folding variations; "
        f"unmapped files {stats['unmapped']}, failed {stats['download_failed'] + stats['parse_failed']}")


if __name__ == "__main__":
    main()
