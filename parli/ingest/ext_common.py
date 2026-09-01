"""
parli.ingest.ext_common -- shared plumbing for the ext_* MONEY ingesters.

The ext_* tables are additive: they never touch the legacy `donations`,
`mp_expenses`, `ministerial_meetings` or `*_lobbyists` tables. Every row
carries a `source` key and a `source_url`; every load is a per-source
replace (DELETE WHERE source=? then INSERT), so re-running one source never
disturbs another.

Where the rows go
-----------------
parli.db lives on the WSL box (`desktop`, ~/.cache/autoresearch/parli.db) and
the repo lives on the laptop, so a writer has two backends:

  ExtWriter(db_path=...)       -- open the SQLite file directly (tests, or when
                                  running on the box itself)
  ExtWriter(ssh_host="desktop") -- gzip the rows as JSONL, scp them over, and run
                                  a tiny stdlib loader with `ssh HOST python3 -`

Both paths run the same DDL / DELETE / INSERT / post-SQL sequence and log the
load into `ext_ingest_log`.

Everything here identifies itself as OPAX research (opax.com.au) and rate
limits by default.
"""

from __future__ import annotations

import base64
import gzip
import json
import os
import re
import sqlite3
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Sequence

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

USER_AGENT = "OPAX research (opax.com.au; contact jake.tracey@noice.work)"
DEFAULT_DB_HOST = os.environ.get("OPAX_DB_HOST", "desktop")
DEFAULT_REMOTE_DB = os.environ.get("OPAX_REMOTE_DB", "/home/jake/.cache/autoresearch/parli.db")
CACHE_ROOT = Path(os.environ.get("OPAX_CACHE", "~/.cache/autoresearch/ext_money")).expanduser()

MONTHS = ["january", "february", "march", "april", "may", "june",
          "july", "august", "september", "october", "november", "december"]


def log(*args) -> None:
    print(*args, flush=True)


# ── HTTP ─────────────────────────────────────────────────────────────────────

def make_session(total_retries: int = 4, backoff: float = 1.5) -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en-AU,en;q=0.9"})
    retry = Retry(total=total_retries, backoff_factor=backoff,
                  status_forcelist=(429, 500, 502, 503, 504),
                  allowed_methods=frozenset(["GET", "POST"]))
    s.mount("https://", HTTPAdapter(max_retries=retry))
    s.mount("http://", HTTPAdapter(max_retries=retry))
    return s


def polite_get(session: requests.Session, url: str, delay: float = 0.7, **kw) -> requests.Response:
    time.sleep(delay)
    kw.setdefault("timeout", 90)
    r = session.get(url, **kw)
    r.raise_for_status()
    return r


def cached_bytes(session: requests.Session, url: str, cache_path: Path, delay: float = 0.7,
                 min_size: int = 200) -> bytes | None:
    """Download once; keep the bytes under cache_path. Returns None on 404."""
    if cache_path.exists() and cache_path.stat().st_size >= min_size:
        return cache_path.read_bytes()
    time.sleep(delay)
    r = session.get(url, timeout=120)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_bytes(r.content)
    return r.content


# ── Dates / money ────────────────────────────────────────────────────────────

_DATE_FORMATS = {
    "dmy_dash": "%d-%m-%Y",
    "dmy_slash": "%d/%m/%Y",
    "dmy_dot": "%d.%m.%Y",
    "dmy_dot2": "%d.%m.%y",
    "mdy_slash": "%m/%d/%Y",
    "iso": "%Y-%m-%d",
    "d_month_y": "%d %B %Y",
    "d_mon_y": "%d %b %Y",
}


def parse_date(text: str | None, formats: Sequence[str]) -> str | None:
    """Parse with the named formats in order; return ISO yyyy-mm-dd or None."""
    if not text:
        return None
    t = text.strip()
    t = re.sub(r"\s+", " ", t)
    if "T" in t and len(t) >= 10 and t[4] == "-":
        t = t[:10]
    for name in formats:
        try:
            return datetime.strptime(t, _DATE_FORMATS[name]).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def au_financial_year(iso_date: str | None) -> str | None:
    """'2026-08-28' -> '2026-27' (AEC-style label)."""
    if not iso_date or len(iso_date) < 7:
        return None
    y, m = int(iso_date[:4]), int(iso_date[5:7])
    start = y if m >= 7 else y - 1
    return f"{start}-{str(start + 1)[2:]}"


def parse_amount(text) -> float | None:
    if text is None:
        return None
    if isinstance(text, (int, float)):
        return float(text)
    s = re.sub(r"[$,\s]", "", str(text))
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()")
    if not s or s == "-":
        return None
    try:
        v = float(s)
    except ValueError:
        return None
    return -v if neg else v


def clean_ws(text: str | None) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


# ── Classification helpers (reuse the AEC rules) ─────────────────────────────

def classify_industry(donor_name: str | None, donor_type: str | None = None) -> str | None:
    """Keyword pass identical to parli.ingest.classify_donations, then the
    'individual' fallback the SQL pass applies. None = needs the LLM pass."""
    from parli.ingest.classify_donations import classify_donor_name
    ind = classify_donor_name(donor_name)
    if ind:
        return ind
    if donor_type == "individual":
        return "individual"
    return None


def classify_donor_type(donor_name: str | None) -> str:
    from parli.ingest.donations import classify_donor_type as _cdt
    return _cdt(donor_name or "")


_PARTY_CANON = [
    (re.compile(r"liberal national party|\blnp\b", re.I), "LNP"),
    (re.compile(r"australian labor party|\balp\b|\blabor\b", re.I), "Labor"),
    (re.compile(r"\bgreens?\b", re.I), "Greens"),
    (re.compile(r"national party|\bnationals\b|\bnational\b(?! trust)", re.I), "Nationals"),
    (re.compile(r"liberal", re.I), "Liberal"),
    (re.compile(r"one nation", re.I), "One Nation"),
    (re.compile(r"katter", re.I), "Katter's Australian Party"),
    (re.compile(r"united australia party|\buap\b|palmer united", re.I), "United Australia Party"),
    (re.compile(r"family first", re.I), "Family First"),
    (re.compile(r"legalise cannabis", re.I), "Legalise Cannabis"),
    (re.compile(r"animal justice", re.I), "Animal Justice Party"),
    (re.compile(r"shooters", re.I), "Shooters, Fishers and Farmers"),
    (re.compile(r"australian christians|christian democrat", re.I), "Australian Christians"),
    (re.compile(r"reason party|sex party", re.I), "Reason Party"),
    (re.compile(r"country liberal", re.I), "Country Liberal Party"),
]


def canonical_party(recipient: str | None) -> str | None:
    """Coarse party bucket for a recipient string; None for candidates/others.
    LNP is tested before Labor/Liberal so 'Liberal National Party' is not
    split. This mirrors export_money_graph's party-word grammar."""
    if not recipient:
        return None
    for rx, canon in _PARTY_CANON:
        if rx.search(recipient):
            return canon
    return None


# ── Microsoft Power Pages entity-list grid client ────────────────────────────

class PowerPagesGrid:
    """Read the JSON behind a Power Pages 'entity list' (the grid widget used by
    VEC Disclosures, the WAEC public dashboard and the QLD lobbying register).

    The page embeds each list's view configuration (base64 JSON, including a
    signed `Base64SecureConfiguration`) and a `data-get-url` pointing at
    /_services/entity-grid-data.json/{website-id}. POSTing that configuration
    back with a page size returns rows; the server honours page sizes up to at
    least 5000 (probed 2026-09-02). ItemCount is capped at 5000 by the
    platform, so paginate until a short page comes back.
    """

    def __init__(self, page_url: str, session: requests.Session | None = None, delay: float = 1.0):
        self.page_url = page_url
        self.base = re.match(r"https?://[^/]+", page_url).group(0)
        self.s = session or make_session()
        self.delay = delay
        self._lists: list[dict] | None = None
        self._token: str | None = None

    def _load(self) -> None:
        from bs4 import BeautifulSoup
        r = polite_get(self.s, self.page_url, delay=self.delay)
        soup = BeautifulSoup(r.text, "lxml")
        lists = []
        for el in soup.select("[data-get-url]"):
            layouts = json.loads(base64.b64decode(el["data-view-layouts"]).decode("utf-8"))
            for lay in layouts:
                cfg = lay.get("Configuration", {})
                lists.append({
                    "get_url": el["data-get-url"],
                    "view_id": lay.get("Id"),
                    "selected": lay.get("Id") == el.get("data-selected-view"),
                    "entity": cfg.get("EntityName"),
                    "secure": lay["Base64SecureConfiguration"],
                })
        self._lists = lists
        tok = polite_get(self.s, self.base + "/_layout/tokenhtml", delay=0.3).text
        m = re.search(r'value="([^"]+)"', tok)
        self._token = m.group(1) if m else ""

    @property
    def lists(self) -> list[dict]:
        if self._lists is None:
            self._load()
        return self._lists

    def fetch_all(self, entity: str | None = None, view_id: str | None = None,
                  page_size: int = 5000, max_pages: int = 200,
                  search: str = "", sort: str = "") -> list[dict]:
        """Return every record of one entity list as {logical_name: display_or_value}."""
        cands = [l for l in self.lists if (entity is None or l["entity"] == entity)
                 and (view_id is None or l["view_id"] == view_id)]
        if not cands:
            raise RuntimeError(f"no entity list for entity={entity} view={view_id} on {self.page_url}")
        lst = cands[0]
        out: list[dict] = []
        hdrs = {"Content-Type": "application/json; charset=utf-8",
                "__RequestVerificationToken": self._token or "",
                "X-Requested-With": "XMLHttpRequest", "Referer": self.page_url}
        for page in range(1, max_pages + 1):
            body = {"base64SecureConfiguration": lst["secure"], "sortExpression": sort, "search": search,
                    "page": page, "pageSize": page_size, "filter": None, "metaFilter": None,
                    "timezoneOffset": -600, "customParameters": []}
            time.sleep(self.delay)
            r = self.s.post(self.base + lst["get_url"], json=body, headers=hdrs, timeout=300)
            r.raise_for_status()
            j = r.json()
            recs = j.get("Records", [])
            for rec in recs:
                row = {"_id": rec.get("Id")}
                for a in rec.get("Attributes", []):
                    disp = a.get("DisplayValue")
                    row[a["Name"]] = disp if disp not in (None, "") else a.get("Value")
                out.append(row)
            log(f"    {lst['entity']}: page {page} -> {len(recs)} rows (total {len(out)})")
            if len(recs) < page_size or not j.get("MoreRecords", False):
                break
        return out


# ── Writer ───────────────────────────────────────────────────────────────────

INGEST_LOG_DDL = """
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

# Runs on the box that holds parli.db (stdlib only). argv[1] = gz jsonl path.
_REMOTE_LOADER = r'''
import gzip, json, sqlite3, sys, os, time
path = sys.argv[1]
with gzip.open(path, "rt", encoding="utf-8") as f:
    meta = json.loads(f.readline())
    rows = [json.loads(line) for line in f if line.strip()]
db = sqlite3.connect(meta["db_path"], timeout=600)
db.execute("PRAGMA busy_timeout = 600000")
db.execute("PRAGMA journal_mode = WAL")
db.executescript(meta["ddl"])
db.executescript(meta["log_ddl"])
cols = meta["columns"]
placeholders = ",".join("?" for _ in cols)
insert = "INSERT INTO %s (%s) VALUES (%s)" % (meta["table"], ",".join(cols), placeholders)
cur = db.cursor()
cur.execute("BEGIN")
deleted = cur.execute("DELETE FROM %s WHERE %s" % (meta["table"], meta["delete_where"]), meta["delete_params"]).rowcount
cur.executemany(insert, rows)
for stmt in meta.get("post_sql", []):
    cur.execute(stmt)
cur.execute("INSERT INTO ext_ingest_log (table_name, source, rows_loaded, rows_deleted, loaded_at, notes) VALUES (?,?,?,?,?,?)",
            (meta["table"], meta["source"], len(rows), deleted, meta["loaded_at"], meta.get("notes")))
cur.execute("COMMIT")
total = db.execute("SELECT COUNT(*) FROM %s" % meta["table"]).fetchone()[0]
src_total = db.execute("SELECT COUNT(*) FROM %s WHERE %s" % (meta["table"], meta["delete_where"]), meta["delete_params"]).fetchone()[0]
print(json.dumps({"table": meta["table"], "source": meta["source"], "inserted": len(rows), "deleted": deleted,
                  "source_rows_now": src_total, "table_rows_now": total}))
db.close()
os.remove(path)
'''


class ExtWriter:
    """Load rows into an ext_* table, locally or on the remote DB host."""

    def __init__(self, db_path: str | Path | None = None, ssh_host: str | None = None,
                 remote_db: str = DEFAULT_REMOTE_DB, dry_run: bool = False):
        if db_path is None and ssh_host is None:
            ssh_host = DEFAULT_DB_HOST
        self.db_path = Path(db_path).expanduser() if db_path else None
        self.ssh_host = ssh_host
        self.remote_db = remote_db
        self.dry_run = dry_run

    def describe(self) -> str:
        if self.dry_run:
            return "dry-run (no writes)"
        return f"sqlite:{self.db_path}" if self.db_path else f"ssh:{self.ssh_host}:{self.remote_db}"

    def replace(self, table: str, ddl: str, columns: Sequence[str], rows: Iterable[Sequence],
                source: str, delete_where: str = "source = ?", delete_params: Sequence | None = None,
                post_sql: Sequence[str] = (), notes: str | None = None) -> dict:
        rows = [list(r) for r in rows]
        if delete_params is None:
            delete_params = [source]
        meta = {
            "table": table, "ddl": ddl, "log_ddl": INGEST_LOG_DDL, "columns": list(columns),
            "delete_where": delete_where, "delete_params": list(delete_params),
            "post_sql": list(post_sql), "source": source, "notes": notes,
            "loaded_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        if self.dry_run:
            log(f"  [dry-run] {table} <- {len(rows):,} rows for source={source}")
            return {"table": table, "source": source, "inserted": len(rows), "dry_run": True}
        if self.db_path:
            return self._replace_local(meta, rows)
        return self._replace_remote(meta, rows)

    def _replace_local(self, meta: dict, rows: list) -> dict:
        db = sqlite3.connect(str(self.db_path), timeout=600)
        db.execute("PRAGMA busy_timeout = 600000")
        db.executescript(meta["ddl"])
        db.executescript(meta["log_ddl"])
        cols = meta["columns"]
        insert = f"INSERT INTO {meta['table']} ({','.join(cols)}) VALUES ({','.join('?' for _ in cols)})"
        cur = db.cursor()
        cur.execute("BEGIN")
        deleted = cur.execute(f"DELETE FROM {meta['table']} WHERE {meta['delete_where']}", meta["delete_params"]).rowcount
        cur.executemany(insert, rows)
        for stmt in meta["post_sql"]:
            cur.execute(stmt)
        cur.execute("INSERT INTO ext_ingest_log (table_name, source, rows_loaded, rows_deleted, loaded_at, notes) VALUES (?,?,?,?,?,?)",
                    (meta["table"], meta["source"], len(rows), deleted, meta["loaded_at"], meta.get("notes")))
        cur.execute("COMMIT")
        total = db.execute(f"SELECT COUNT(*) FROM {meta['table']}").fetchone()[0]
        db.close()
        res = {"table": meta["table"], "source": meta["source"], "inserted": len(rows), "deleted": deleted, "table_rows_now": total}
        log(f"  loaded {res}")
        return res

    def _replace_remote(self, meta: dict, rows: list) -> dict:
        meta = dict(meta, db_path=self.remote_db)
        with tempfile.NamedTemporaryFile("wb", suffix=".jsonl.gz", delete=False) as tmp:
            local_path = tmp.name
        with gzip.open(local_path, "wt", encoding="utf-8") as f:
            f.write(json.dumps(meta) + "\n")
            for r in rows:
                f.write(json.dumps(r, default=str) + "\n")
        # pid + random suffix: two loaders for the same table/source running in the
        # same second must not share a remote file (a 2026-09-02 IPEA run read a
        # half-overwritten file and died in json.loads)
        remote_path = f"/tmp/opax_{meta['table']}_{meta['source']}_{int(time.time())}_{os.getpid()}_{os.urandom(3).hex()}.jsonl.gz"
        try:
            subprocess.run(["scp", "-q", local_path, f"{self.ssh_host}:{remote_path}"], check=True, timeout=1800)
            proc = subprocess.run(["ssh", self.ssh_host, "python3", "-", remote_path],
                                  input=_REMOTE_LOADER, capture_output=True, text=True, timeout=3600)
        finally:
            os.remove(local_path)
        if proc.returncode != 0:
            raise RuntimeError(f"remote load failed: {proc.stderr[-2000:]}")
        res = json.loads(proc.stdout.strip().splitlines()[-1])
        log(f"  loaded {res}")
        return res


def add_writer_args(parser) -> None:
    parser.add_argument("--db", default=None, help="Write to this local SQLite file instead of the remote parli.db")
    parser.add_argument("--host", default=DEFAULT_DB_HOST, help="ssh host holding parli.db (default: %(default)s)")
    parser.add_argument("--remote-db", default=DEFAULT_REMOTE_DB, help="parli.db path on --host")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and parse but write nothing")


def writer_from_args(args) -> ExtWriter:
    return ExtWriter(db_path=args.db, ssh_host=None if args.db else args.host,
                     remote_db=args.remote_db, dry_run=args.dry_run)
