"""
parli.ingest.tvfy_refresh -- fill the federal divisions / votes gap from the
TheyVoteForYou API (OpenAustralia Foundation, ODbL). Audit and plan: docs/VOTES.md.

Why a new fetcher: parli/ingest/divisions.py skipped a whole month as soon as
one division existed in it and never handled the list endpoint's silent
100-row cap, so parli.db held 3,651 of TVFY's 10,575 divisions. This script

  phase A  lists every division month by month for both houses, splitting any
           window that returns 100 rows until it does not, and INSERT OR IGNOREs
           into the legacy `divisions` table (state='federal'). Months that
           ended more than 45 days ago are remembered as done in a state file;
           recent months are always re-listed.
  phase B  fetches divisions/{id}.json for every federal division not yet in
           `division_votes_fetched` (newest first), INSERT OR IGNOREs the votes,
           adds members the `members` table has never seen (INSERT OR IGNORE,
           existing rows are never changed), stores the detail's bills[] in the
           additive `division_bills` table, fills NULL summary / number /
           possible_turnout / rebellions on the division row, and marks the
           division fetched. Transient failures are NOT marked fetched, so the
           next run retries them; a 404 is.

Every raw response is cached under ~/.cache/autoresearch/tvfy/ (the fallback
when TVFY is unavailable). One request per second, identified as OPAX research.
Stdlib only: runs under the system python3 on `desktop`, where parli.db lives.

  cd /tmp/arag_mig && nohup python3 -m parli.ingest.tvfy_refresh > logs/tvfy_refresh.log 2>&1 &
  python3 -m parli.ingest.tvfy_refresh --since 2026-08-01 --limit 3     # smoke run
  python3 -m parli.ingest.tvfy_refresh --detail-only                    # resume the votes fetch

Key: TVFY_API_KEY in the environment or a .env file (cwd, repo root, ~); the
key that was checked into fetch_division_votes.py is the last resort.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

API = "https://theyvoteforyou.org.au/api/v1"
USER_AGENT = "OPAX research (opax.com.au; contact jake.tracey@noice.work)"
DB_PATH = Path("~/.cache/autoresearch/parli.db").expanduser()
CACHE = Path("~/.cache/autoresearch/tvfy").expanduser()
STATE_PATH = CACHE / "refresh_state.json"
RATE_SECONDS = 1.0
LIST_CAP = 100          # the list endpoint silently truncates at 100 rows
SETTLED_DAYS = 45       # a month older than this is not re-listed
HOUSES = ("representatives", "senate")
TVFY_FIRST = date(2006, 1, 1)

PARTY_CANONICAL = {}
for _canon, _aliases in {
    "Labor": ["ALP", "Australian Labor Party", "Labor"],
    "Liberal": ["LP", "LIB", "Liberal Party", "Liberal"],
    "Nationals": ["NP", "Nats", "NPA", "National Party", "The Nationals", "Nationals"],
    "LNP": ["LNP", "Liberal National Party"],
    "Independent": ["IND", "Ind", "Independent"],
    "Greens": ["AG", "Australian Greens", "Greens"],
    "Country Liberal Party": ["CLP", "Country Liberal Party"],
    "Katter's Australian Party": ["KAP", "Katter's Australian Party"],
    "Centre Alliance": ["NXT", "CA", "Centre Alliance", "Nick Xenophon Team"],
    "United Australia Party": ["PUP", "UAP", "United Australia Party", "Palmer United Party"],
    "One Nation": ["One Nation", "PHON", "Pauline Hanson's One Nation"],
    "Australian Democrats": ["Australian Democrats", "AD"],
    "DLP": ["DLP", "Democratic Labor Party"],
    "Family First": ["Family First", "FF"],
    "JLN": ["JLN", "Jacqui Lambie Network"],
}.items():
    for _a in _aliases:
        PARTY_CANONICAL[_a.casefold()] = _canon

BILLS_DDL = """
CREATE TABLE IF NOT EXISTS division_bills (
    division_id  INTEGER NOT NULL,          -- divisions.division_id (TVFY id)
    bill_id      INTEGER,                   -- TVFY bill id
    official_id  TEXT NOT NULL,             -- ParlInfo id, e.g. r7456 / s1468
    title        TEXT,
    url          TEXT,
    PRIMARY KEY (division_id, official_id)
);
CREATE INDEX IF NOT EXISTS ix_division_bills_official ON division_bills (official_id);
"""


def log(*a) -> None:
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def api_key() -> str:
    k = os.environ.get("TVFY_API_KEY", "").strip()
    if k:
        return k
    for p in (Path(".env"), Path(__file__).resolve().parents[2] / ".env", Path("~/.env").expanduser()):
        try:
            for line in p.read_text().splitlines():
                if line.startswith("TVFY_API_KEY="):
                    v = line.split("=", 1)[1].strip().strip('"').strip("'")
                    if v:
                        return v
        except OSError:
            continue
    raise SystemExit("TVFY_API_KEY is not set: export it or put it in .env (see .env.example)")


_KEY: str | None = None


def key() -> str:
    """The API key, read on first use so importing the module never exits."""
    global _KEY
    if _KEY is None:
        _KEY = api_key()
    return _KEY
_last_request = 0.0


class TvfyError(Exception):
    pass


def get(path: str, params: dict) -> object:
    """GET {API}/{path} with the key, paced to one request per second. Returns
    parsed JSON, None on 404, raises TvfyError after five failed attempts."""
    global _last_request
    url = f"{API}/{path}?{urllib.parse.urlencode(dict(params, key=key()))}"
    for attempt in range(5):
        wait = RATE_SECONDS - (time.time() - _last_request)
        if wait > 0:
            time.sleep(wait)
        _last_request = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            retry_after = e.headers.get("Retry-After") if e.headers else None
            back = float(retry_after) if retry_after and retry_after.isdigit() else 10.0 * (attempt + 1)
            if e.code == 429:
                back = max(back, 60.0)
            log(f"  HTTP {e.code} on {path}; sleeping {back:.0f}s (attempt {attempt + 1}/5)")
            time.sleep(back)
        except Exception as e:  # noqa: BLE001 - network hiccups, JSON truncation
            log(f"  {type(e).__name__} on {path}: {e}; sleeping {10 * (attempt + 1)}s (attempt {attempt + 1}/5)")
            time.sleep(10.0 * (attempt + 1))
    raise TvfyError(f"gave up on {path}")


def connect(db_path: Path) -> sqlite3.Connection:
    db = sqlite3.connect(str(db_path), timeout=600)
    db.execute("PRAGMA busy_timeout = 600000")
    db.execute("PRAGMA journal_mode = WAL")
    db.execute("PRAGMA foreign_keys = OFF")
    db.execute("CREATE TABLE IF NOT EXISTS division_votes_fetched (division_id INTEGER PRIMARY KEY)")
    db.executescript(BILLS_DDL)
    db.commit()
    return db


def commit(db: sqlite3.Connection) -> None:
    for attempt in range(20):
        try:
            db.commit()
            return
        except sqlite3.OperationalError as e:
            if "locked" not in str(e) and "busy" not in str(e):
                raise
            time.sleep(3.0 * (attempt + 1))
    db.commit()


def load_state() -> dict:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text())
    return {"months_done": {h: [] for h in HOUSES}}


def save_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=1))
    tmp.replace(STATE_PATH)


# ---------------------------------------------------------------------------
# Phase A: list
# ---------------------------------------------------------------------------


def month_windows(since: date, until: date):
    y, m = since.year, since.month
    while (y, m) <= (until.year, until.month):
        first = date(y, m, 1)
        nxt = date(y + (m == 12), 1 if m == 12 else m + 1, 1)
        yield max(first, since), min(nxt - timedelta(days=1), until)
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def fetch_window(house: str, s: date, e: date, out: list) -> int:
    """Append every division in [s, e] to `out`, splitting the window whenever
    the endpoint returns its 100-row cap. Returns the number of requests made."""
    data = get("divisions.json", {"house": house, "start_date": s.isoformat(), "end_date": e.isoformat()})
    if not isinstance(data, list):
        return 1
    if len(data) >= LIST_CAP and e > s:
        mid = s + (e - s) // 2
        return 1 + fetch_window(house, s, mid, out) + fetch_window(house, mid + timedelta(days=1), e, out)
    out.extend(data)
    return 1


def upsert_listed(db: sqlite3.Connection, house: str, rows: list) -> int:
    inserted = 0
    for d in rows:
        if not d.get("id") or not d.get("date"):
            continue
        cur = db.execute(
            "INSERT OR IGNORE INTO divisions (division_id, house, name, date, number, aye_votes, no_votes, "
            "possible_turnout, rebellions, summary, state) VALUES (?,?,?,?,?,?,?,?,?,NULL,'federal')",
            (d["id"], house, d.get("name", ""), d["date"], d.get("number"), d.get("aye_votes"),
             d.get("no_votes"), d.get("possible_turnout"), d.get("rebellions")))
        inserted += cur.rowcount
        # Older rows are missing number (Senate) and possible_turnout (nearly all): fill NULLs only.
        db.execute(
            "UPDATE divisions SET number = COALESCE(number, ?), possible_turnout = COALESCE(possible_turnout, ?), "
            "rebellions = COALESCE(rebellions, ?), aye_votes = COALESCE(aye_votes, ?), no_votes = COALESCE(no_votes, ?) "
            "WHERE division_id = ?",
            (d.get("number"), d.get("possible_turnout"), d.get("rebellions"), d.get("aye_votes"), d.get("no_votes"), d["id"]))
    return inserted


def phase_list(db: sqlite3.Connection, since: date, relist: bool) -> None:
    state = load_state()
    today = date.today()
    settled_before = today - timedelta(days=SETTLED_DAYS)
    listed = inserted = requests = 0
    t0 = time.time()
    for s, e in month_windows(since, today):
        ym = s.strftime("%Y-%m")
        for house in HOUSES:
            done = state["months_done"].setdefault(house, [])
            if ym in done and not relist:
                continue
            rows: list = []
            try:
                requests += fetch_window(house, s, e, rows)
            except TvfyError as ex:
                log(f"[list] {ym} {house}: {ex}; will retry next run")
                continue
            n_new = upsert_listed(db, house, rows)
            (CACHE / "list").mkdir(parents=True, exist_ok=True)
            (CACHE / "list" / f"{house}_{ym}.json").write_text(json.dumps(rows))
            commit(db)
            listed += len(rows)
            inserted += n_new
            if e < settled_before and ym not in done:
                done.append(ym)
                save_state(state)
            if n_new or s.month in (1, 7):
                log(f"[list] {ym} {house}: {len(rows)} listed, {n_new} new "
                    f"(total listed {listed}, new {inserted}, {requests} req, {time.time() - t0:.0f}s)")
    save_state(state)
    total = db.execute("SELECT COUNT(*) FROM divisions WHERE COALESCE(state,'federal')='federal'").fetchone()[0]
    log(f"[list] done: {listed} listed, {inserted} new rows, {requests} requests; federal divisions now {total}")


# ---------------------------------------------------------------------------
# Phase B: detail (votes, members, bills)
# ---------------------------------------------------------------------------


def vote_value(raw: object) -> str:
    v = str(raw or "").lower()
    if v in ("aye", "yes"):
        return "aye"
    if v in ("no", "nay"):
        return "no"
    if v in ("abstention", "abstain"):
        return "abstention"
    return "absent"


def store_detail(db: sqlite3.Connection, div_id: int, d: dict, known_members: set) -> tuple[int, int]:
    house = d.get("house") or ""
    votes_in = members_in = 0
    for v in d.get("votes") or []:
        m = v.get("member") or {}
        pid = (m.get("person") or {}).get("id") or m.get("id")
        if not pid:
            continue
        pid = str(pid)
        cur = db.execute("INSERT OR IGNORE INTO votes (division_id, person_id, vote) VALUES (?,?,?)",
                         (div_id, pid, vote_value(v.get("vote"))))
        votes_in += cur.rowcount
        if pid not in known_members:
            first, last = (m.get("first_name") or "").strip(), (m.get("last_name") or "").strip()
            party = (m.get("party") or "").strip() or None
            cur = db.execute(
                "INSERT OR IGNORE INTO members (person_id, first_name, last_name, full_name, party, electorate, "
                "chamber, state, party_original, party_canonical) VALUES (?,?,?,?,?,?,?,'federal',?,?)",
                (pid, first, last, f"{first} {last}".strip(), party, m.get("electorate"), house or None,
                 party, PARTY_CANONICAL.get((party or "").casefold())))
            members_in += cur.rowcount
            known_members.add(pid)
    for b in d.get("bills") or []:
        if b.get("official_id"):
            db.execute("INSERT OR IGNORE INTO division_bills (division_id, bill_id, official_id, title, url) VALUES (?,?,?,?,?)",
                       (div_id, b.get("id"), b["official_id"], b.get("title"), b.get("url")))
    db.execute(
        "UPDATE divisions SET summary = COALESCE(NULLIF(summary, ''), ?), number = COALESCE(number, ?), "
        "possible_turnout = COALESCE(possible_turnout, ?), rebellions = COALESCE(rebellions, ?), "
        "aye_votes = COALESCE(aye_votes, ?), no_votes = COALESCE(no_votes, ?), "
        "name = CASE WHEN COALESCE(name, '') = '' THEN ? ELSE name END WHERE division_id = ?",
        (d.get("summary") or None, d.get("number"), d.get("possible_turnout"), d.get("rebellions"),
         d.get("aye_votes"), d.get("no_votes"), d.get("name") or "", div_id))
    db.execute("INSERT OR IGNORE INTO division_votes_fetched (division_id) VALUES (?)", (div_id,))
    return votes_in, members_in


def phase_detail(db: sqlite3.Connection, limit: int | None) -> None:
    pending = [r[0] for r in db.execute(
        "SELECT division_id FROM divisions WHERE COALESCE(state,'federal')='federal' "
        "AND division_id NOT IN (SELECT division_id FROM division_votes_fetched) "
        "ORDER BY date DESC, division_id DESC")]
    if limit:
        pending = pending[:limit]
    known_members = {r[0] for r in db.execute("SELECT person_id FROM members")}
    log(f"[detail] {len(pending)} divisions to fetch (~{len(pending) * RATE_SECONDS / 60:.0f} min at {RATE_SECONDS:.0f} req/s); "
        f"{len(known_members)} members known")
    (CACHE / "division").mkdir(parents=True, exist_ok=True)
    votes_total = members_total = failed = missing = 0
    t0 = time.time()
    for i, div_id in enumerate(pending, 1):
        cache_file = CACHE / "division" / f"{div_id}.json"
        try:
            d = get(f"divisions/{div_id}.json", {})
        except TvfyError as ex:
            failed += 1
            log(f"  division {div_id}: {ex}")
            continue
        if d is None:
            missing += 1
            db.execute("INSERT OR IGNORE INTO division_votes_fetched (division_id) VALUES (?)", (div_id,))
            commit(db)
            log(f"  division {div_id}: 404, marked fetched")
            continue
        cache_file.write_text(json.dumps(d))
        v, m = store_detail(db, div_id, d, known_members)
        votes_total += v
        members_total += m
        if i % 10 == 0 or i == len(pending):
            commit(db)
        if i % 50 == 0 or i == len(pending) or i == 1:
            elapsed = time.time() - t0
            eta = (len(pending) - i) * (elapsed / i) / 60 if i else 0
            log(f"[detail] {i}/{len(pending)} (id {div_id}, {d.get('date')}) +{votes_total} votes, "
                f"+{members_total} members, {failed} failed, {missing} 404; ETA {eta:.0f} min")
    commit(db)
    n_votes = db.execute("SELECT COUNT(*) FROM votes").fetchone()[0]
    n_fetched = db.execute("SELECT COUNT(*) FROM division_votes_fetched").fetchone()[0]
    n_bills = db.execute("SELECT COUNT(*) FROM division_bills").fetchone()[0]
    log(f"[detail] done: +{votes_total} votes (table {n_votes}), +{members_total} members, {n_bills} division-bill links, "
        f"{n_fetched} divisions fetched, {failed} failed (retry with --detail-only), {missing} 404")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=str(DB_PATH))
    ap.add_argument("--since", default=TVFY_FIRST.isoformat(), help="first month to list (default: TVFY's first, 2006-01)")
    ap.add_argument("--list-only", action="store_true")
    ap.add_argument("--detail-only", action="store_true")
    ap.add_argument("--relist", action="store_true", help="ignore the months-done state and re-list everything")
    ap.add_argument("--limit", type=int, default=None, help="cap the number of detail fetches (smoke runs)")
    args = ap.parse_args()

    db = connect(Path(args.db).expanduser())
    log(f"tvfy_refresh: db={args.db} key=env/.env "
        f"cache={CACHE}")
    if not args.detail_only:
        phase_list(db, date.fromisoformat(args.since), args.relist)
    if not args.list_only:
        phase_detail(db, args.limit)
    db.close()


if __name__ == "__main__":
    main()
