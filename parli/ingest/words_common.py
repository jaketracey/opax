"""
Shared plumbing for the WORDS-corpus extension fetchers (words_*.py).

These fetchers acquire what politicians said OUTSIDE the chamber (press
releases, transcripts, speeches) and the documents they debated (bill
summaries, committee reports) into NEW parli.db tables prefixed `ext_`.
They never touch existing tables and never push to the ARAG knowledge box —
KB ingestion costs money and is a separate, user-gated step (see
docs/DATA-WORDS.md).

Run on the machine that holds parli.db (the WSL box `desktop`).
"""

import json
import re
import sqlite3
import sys
import threading
import time
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable, Optional

import requests

DB_PATH = Path("~/.cache/autoresearch/parli.db").expanduser()

# Honest identification. Some hosts (aph.gov.au / parlinfo.aph.gov.au behind
# Azure WAF) reject any non-browser UA outright; those fetchers require an
# explicit opt-in flag before they will send BROWSER_UA instead.
USER_AGENT = "OPAX research (opax.com.au)"
BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"


class PoliteSession:
    """requests.Session with a global minimum interval between requests,
    retry/backoff on 429 + 5xx + connection errors, and Retry-After support.
    The interval lock is shared across threads so a thread pool never exceeds
    the configured rate."""

    def __init__(self, min_interval: float = 1.0, ua: str = USER_AGENT,
                 timeout: int = 45, retries: int = 4):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": ua, "Accept-Language": "en-AU,en;q=0.8"})
        self.min_interval = min_interval
        self.timeout = timeout
        self.retries = retries
        self._lock = threading.Lock()
        self._next_at = 0.0
        self.requests_made = 0

    def _wait_turn(self) -> None:
        with self._lock:
            now = time.monotonic()
            if now < self._next_at:
                time.sleep(self._next_at - now)
                now = time.monotonic()
            self._next_at = now + self.min_interval
            self.requests_made += 1

    def get(self, url: str, **kwargs) -> requests.Response:
        kwargs.setdefault("timeout", self.timeout)
        delay = 2.0
        last_exc: Optional[BaseException] = None
        for attempt in range(self.retries + 1):
            self._wait_turn()
            try:
                resp = self.session.get(url, **kwargs)
            except requests.RequestException as e:
                last_exc = e
                time.sleep(delay)
                delay = min(delay * 2, 60)
                continue
            if resp.status_code == 429 or resp.status_code >= 500:
                retry_after = resp.headers.get("Retry-After")
                wait = float(retry_after) if retry_after and retry_after.isdigit() else delay
                time.sleep(min(wait, 120))
                delay = min(delay * 2, 60)
                last_exc = None
                continue
            return resp
        if last_exc:
            raise last_exc
        return resp  # last 429/5xx response, let the caller decide


# ---------------------------------------------------------------------------
# HTML -> text
# ---------------------------------------------------------------------------

_BLOCK_TAGS = {
    "p", "div", "br", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6",
    "tr", "table", "blockquote", "section", "article", "header", "footer",
    "dd", "dt", "dl", "pre", "hr",
}
_SKIP_TAGS = {"script", "style", "noscript", "template", "svg"}


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in _SKIP_TAGS:
            self._skip += 1
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in _SKIP_TAGS:
            self._skip = max(0, self._skip - 1)
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self._skip:
            self.parts.append(data)


def html_to_text(fragment: Optional[str]) -> str:
    """Block-aware HTML to plain text; also fine on already-plain text."""
    if not fragment:
        return ""
    if "<" not in fragment:
        text = unescape(fragment)
    else:
        p = _TextExtractor()
        p.feed(fragment)
        p.close()
        text = "".join(p.parts)
    text = text.replace("\xa0", " ").replace("\r", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ---------------------------------------------------------------------------
# Dates
# ---------------------------------------------------------------------------

_MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august",
     "september", "october", "november", "december"], 1)}


def parse_date(value) -> Optional[str]:
    """Best-effort -> 'YYYY-MM-DD'. Accepts ISO strings (any time suffix),
    dd/mm/yyyy, dd-mm-yyyy, '1 September 2026', 'Thursday, 07 August, 1997 at
    12:00 AM', and unix epochs (int or numeric string)."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc).strftime("%Y-%m-%d")
    s = str(value).strip()
    if not s:
        return None
    if re.fullmatch(r"\d{9,11}", s):
        return datetime.fromtimestamp(int(s), tz=timezone.utc).strftime("%Y-%m-%d")
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.match(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", s)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    m = re.search(r"(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})", s)
    if m and m.group(2).lower() in _MONTHS:
        return f"{m.group(3)}-{_MONTHS[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"
    return None


def decade_of(date: Optional[str]) -> Optional[str]:
    return f"{date[:3]}0s" if date and len(date) >= 4 and date[:4].isdigit() else None


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# SQLite (ext_ tables only)
# ---------------------------------------------------------------------------


def connect_db(path: Path = DB_PATH) -> sqlite3.Connection:
    """Autocommit connection: several fetchers write parli.db concurrently
    (and arag_sync reads it), so every write goes through write_txn(), which
    takes the write lock up front with BEGIN IMMEDIATE. A SELECT cursor left
    open on a deferred transaction would otherwise fail with 'database is
    locked' the moment another process commits (SQLITE_BUSY_SNAPSHOT is not
    covered by busy_timeout)."""
    db = sqlite3.connect(str(path), timeout=60, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA busy_timeout = 60000")
    return db


def write_txn(db: sqlite3.Connection, statements, retries: int = 12) -> None:
    """Run [(sql, params-or-list-of-params), ...] in one IMMEDIATE transaction,
    retrying on lock contention with backoff (up to ~2.5 min)."""
    last: Optional[BaseException] = None
    for attempt in range(retries):
        try:
            db.execute("BEGIN IMMEDIATE")
            for sql, params in statements:
                if params and isinstance(params, list) and params and isinstance(params[0], (tuple, list)):
                    db.executemany(sql, params)
                else:
                    db.execute(sql, params or ())
            db.execute("COMMIT")
            return
        except sqlite3.OperationalError as e:
            try:
                db.execute("ROLLBACK")
            except sqlite3.OperationalError:
                pass
            if "locked" not in str(e) and "busy" not in str(e):
                raise
            last = e
            time.sleep(min(1.0 + attempt * 2.0, 20.0))
    raise last  # type: ignore[misc]


def ensure_table(db: sqlite3.Connection, name: str, ddl: str, indexes: Iterable[str] = ()) -> None:
    """Create an ext_ table if missing. Refuses non-ext_ names: these fetchers
    must never create or mutate the existing corpus tables."""
    if not name.startswith("ext_"):
        raise ValueError(f"refusing to manage non-ext_ table {name!r}")
    write_txn(db, [(ddl, ())] + [(idx, ()) for idx in indexes])


def upsert(db: sqlite3.Connection, table: str, rows: list[dict]) -> int:
    if not rows:
        return 0
    if not table.startswith("ext_"):
        raise ValueError(f"refusing to write non-ext_ table {table!r}")
    cols = list(rows[0].keys())
    sql = (f"INSERT OR REPLACE INTO {table} ({', '.join(cols)}) "
           f"VALUES ({', '.join('?' for _ in cols)})")
    write_txn(db, [(sql, [tuple(_sql_value(r.get(c)) for c in cols) for r in rows])])
    return len(rows)


def _sql_value(v):
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, bool):
        return int(v)
    return v


def existing_ids(db: sqlite3.Connection, table: str, key_col: str, where: str = "",
                 params: tuple = ()) -> set:
    sql = f"SELECT {key_col} FROM {table}" + (f" WHERE {where}" if where else "")
    return {r[0] for r in db.execute(sql, params)}


def print_table_stats(db: sqlite3.Connection, table: str, group_col: str) -> None:
    total = db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    print(f"[{table}] {total:,} rows")
    for r in db.execute(
        f"SELECT {group_col}, COUNT(*), MIN(date), MAX(date), "
        f"ROUND(AVG(LENGTH(COALESCE(body_text,''))))"
        f" FROM {table} GROUP BY {group_col} ORDER BY 2 DESC"
    ):
        print(f"  {str(r[0]):24s} {r[1]:>8,}  {r[2]} .. {r[3]}  avg body {int(r[4] or 0):,} chars")


def id_range(spec: str) -> range:
    """'45000-46500' -> range(45000, 46501); '100' -> range(100, 101)."""
    if "-" in spec:
        a, b = spec.split("-", 1)
        return range(int(a), int(b) + 1)
    return range(int(spec), int(spec) + 1)


def log(msg: str) -> None:
    print(msg, flush=True)


def warn(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)
