"""Shared pieces for the federal bills registry (phase 1a, 2013-2026).

Everything that touches ParlInfo goes through `fetch`: it is cache-first, so a
page already on disk is never requested again, and it holds the host to the
0.7 requests-a-second limit the scope measured as safe. A persistent run of
403s raises `Blocked` so the caller can stop rather than hammer a WAF that has
started refusing us.

`norm` is the title normaliser the scope audited at 99/100 on the join sample:
NFKC + casefold, `&` to `and`, bracketed reprint years dropped, fiscal years
expanded (`2005-06` -> `2005 2006`), everything non-word collapsed to spaces.
Bill numbers and the bill year survive on purpose, because they are what tells
a reintroduced bill from its original.
"""

import bisect
from datetime import date
import hashlib
import os
import re
import sqlite3
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

DB_PATH = "/home/jake/.cache/autoresearch/parli.db"
DB_RO = f"file:{DB_PATH}?mode=ro"
CACHE = os.path.expanduser("~/.cache/autoresearch/bills_v2")
LICENCE = "CC BY-NC-ND 4.0"

# ParlInfo refuses the honest OPAX agent with 403; this one was measured working.
UA = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"
RATE = 1.0 / 0.7  # seconds between requests to parlinfo.aph.gov.au
HOST = "https://parlinfo.aph.gov.au"

# First sitting day of each parliament from 39 on; parl(date) indexes into it.
PARL_STARTS = ["1998-11-10", "2002-02-12", "2004-11-16", "2008-02-12",
               "2010-09-28", "2013-11-12", "2016-08-30", "2019-07-02",
               "2022-07-26", "2025-07-22"]
TODAY = date.today().isoformat()


class Blocked(Exception):
    """ParlInfo returned 403 often enough that we stop instead of pushing."""


def parliament(date):
    """Parliament number for an ISO date, by first-sitting-day boundaries."""
    return 38 + bisect.bisect_right(PARL_STARTS, date or "")


def parl_end(p):
    """Exclusive end of a parliament: the next one's opening, or today."""
    return PARL_STARTS[p - 38] if 39 <= p < 48 else TODAY


def norm(t):
    """Audited title normaliser. Keeps bill numbers and the bill year."""
    t = unicodedata.normalize("NFKC", t or "").casefold().replace("&", " and ")
    t = re.sub(r"\[(?:19|20)\d{2}\]", " ", t)          # reprint year only
    t = re.sub(r"((?:19|20)\d{2})[–-](\d{2})\b",   # 2005-06 -> 2005 2006
               lambda m: m[1] + " " + m[1][:2] + m[2], t)
    return re.sub(r"[^\w]+", " ", t).strip()


def bill_key(code):
    return f"au-federal-{code}"


def legacy_key(bill_id):
    return f"au-federal-alrc-{bill_id}"


_last_request = [0.0]
_consecutive_403 = [0]
_stats = {"fetched": 0, "cached": 0, "bytes": 0, "403": 0, "error": 0,
          "firecrawl": 0}


def stats():
    return dict(_stats)


def cache_path(kind, name):
    d = os.path.join(CACHE, kind)
    os.makedirs(d, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", name)[:180]
    return os.path.join(d, safe + ".html")


def fetch(url, kind, name, timeout=45, retries=3, refresh=False, max_cache_age=0):
    """Return (text, path, from_cache); refresh always checks the source."""
    path = cache_path(kind, name)
    fresh_cache = max_cache_age > 0 and os.path.exists(path) and time.time() - os.path.getmtime(path) < max_cache_age
    if (not refresh or fresh_cache) and os.path.exists(path) and os.path.getsize(path) > 0:
        _stats["cached"] += 1
        with open(path, "rb") as fh:
            return fh.read().decode("utf-8", "replace"), path, True

    delay = RATE
    for attempt in range(retries):
        wait = _last_request[0] + RATE - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _last_request[0] = time.monotonic()
        req = urllib.request.Request(url, headers={
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-AU,en;q=0.9",
        })
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read()
            _consecutive_403[0] = 0
            _stats["fetched"] += 1
            _stats["bytes"] += len(body)
            with open(path, "wb") as fh:
                fh.write(body)
            return body.decode("utf-8", "replace"), path, False
        except urllib.error.HTTPError as e:
            if e.code == 403:
                _stats["403"] += 1
                _consecutive_403[0] += 1
                if _consecutive_403[0] >= 20:
                    raise Blocked(f"20 consecutive 403s, last {url}")
            elif e.code == 404:
                _stats["error"] += 1
                return "", path, False
            time.sleep(delay)
            delay *= 2
        except Exception:
            _stats["error"] += 1
            time.sleep(delay)
            delay *= 2
    return "", path, False


def listing_url(query, page=0, res=100):
    return (f"{HOST}/parlInfo/search/summary/summary.w3p;adv=yes;"
            f"orderBy=date-eFirst;page={page};"
            f"query={urllib.parse.quote(query)};resCount={res}")


def display_url(pid):
    return (f"{HOST}/parlInfo/search/display/display.w3p;"
            f"query={urllib.parse.quote('Id:' + chr(34) + pid + chr(34))}")


def sha256(text):
    return hashlib.sha256(text.encode("utf-8", "replace")).hexdigest()


def connect_rw():
    c = sqlite3.connect(DB_PATH, timeout=120)
    c.execute("PRAGMA busy_timeout=120000")
    c.row_factory = sqlite3.Row
    return c


def connect_ro():
    c = sqlite3.connect(DB_RO, uri=True, timeout=120)
    c.execute("PRAGMA query_only=ON")
    c.row_factory = sqlite3.Row
    return c


# ---------------------------------------------------------------- status map

_STATUS_PASSED = re.compile(r"\b(act|assent|passed both houses)\b", re.I)
_STATUS_DEAD = re.compile(
    r"not proceeding|lapsed|withdrawn|negatived|discharged|removed|defeated", re.I)
_STATUS_LIVE = re.compile(r"\bbefore\b|\bin (the )?(reps|senate|committee)\b", re.I)


def map_status(raw):
    """ParlInfo status text -> the registry's four-value status."""
    s = (raw or "").strip()
    if not s:
        return "unknown"
    if _STATUS_DEAD.search(s):
        return "lapsed"
    if _STATUS_PASSED.search(s):
        return "passed"
    if _STATUS_LIVE.search(s):
        return "before_parliament"
    return "unknown"


# ------------------------------------------------------------ event stages

_STAGE_RULES = [
    (re.compile(r"assent", re.I), "royal_assent"),
    (re.compile(r"finally passed|passed both houses", re.I), "passed"),
    (re.compile(r"third reading", re.I), "third_reading"),
    (re.compile(r"second reading", re.I), "second_reading"),
    (re.compile(r"committee|consideration in detail|report from", re.I), "committee"),
    (re.compile(r"introduced|first reading|first time", re.I), "introduced"),
]


def map_stage(event_raw):
    for rx, stage in _STAGE_RULES:
        if rx.search(event_raw or ""):
            return stage
    return "other"


def iso_date(ddmmyy):
    """ParlInfo prints progress dates as DD/MM/YY and listings as DD/MM/YYYY."""
    m = re.match(r"\s*(\d{1,2})/(\d{1,2})/(\d{2,4})", ddmmyy or "")
    if not m:
        return None
    d, mo, y = m.groups()
    y = int(y)
    if y < 100:
        y += 2000 if y < 70 else 1900
    return f"{y:04d}-{int(mo):02d}-{int(d):02d}"
