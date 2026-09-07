#!/usr/bin/env python3
"""Hand-written machine briefs for speeches: a queue harness for parallel workers.

A brief is the one-or-two-sentence text field `da-summary-t-body` that the
portal shows under a speech on time-machine cards and search results (via
/api/brief). The platform's own `ask` task wrote 500 of them for the sample in
2026-09-01; this harness lets a fleet of reading agents write the rest by hand,
newest speeches first, with the same guards the topic-label harness grew.

  python3 scripts/summary_workers.py enumerate --out RIDS.json   # walk the box, newest first
  python3 scripts/summary_workers.py init --rids RIDS.json
  python3 scripts/summary_workers.py next --worker W --n 30 --out W-sbatch.json
  python3 scripts/summary_workers.py submit --worker W --summaries W-summaries.json
  python3 scripts/summary_workers.py status | release --worker W | retry-errors

The queue lives in SQLite in the session scratchpad (SUMMARY_QUEUE_DB overrides).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
from label_workers import Kb, POOL  # noqa: E402  (the 429-patient client, shared pacing)

DEFAULT_DB = Path(os.environ.get("SUMMARY_QUEUE_DB") or Path.home() / ".cache" / "opax" / "summaries_queue.sqlite")
STOP_FILE = DEFAULT_DB.with_name("summaries_stop")
SAMPLE_RIDS = ROOT / "scripts" / "harness_runs" / "enrich_sample_rids.json"
FIELD = "da-summary-t-body"
STALE_CLAIM_S = 45 * 60
TEXT_HEAD, TEXT_TAIL = 12000, 1800   # a brief needs the whole argument; only very long speeches are clipped
MIN_CHARS, MAX_CHARS = 40, 800
RATE_STOP = 400                      # briefs per worker per ten minutes: beyond this nobody is reading
SPEECH = {"prop": "label", "labelset": "kind", "label": "speech"}
INDEX_SPAN = ("2026-09-01T03:40:00Z", None)   # the corpus was indexed 2026-09-01 .. 09-03; walk from there to now


def db(path: Path = DEFAULT_DB) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, timeout=60)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("""CREATE TABLE IF NOT EXISTS queue (
        rid TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'pending', worker TEXT,
        claimed_at REAL, done_at REAL, slug TEXT, head TEXT, summary TEXT, error TEXT)""")
    con.execute("CREATE INDEX IF NOT EXISTS queue_status ON queue(status)")
    con.execute("CREATE TABLE IF NOT EXISTS log (ts REAL, worker TEXT, rid TEXT, slug TEXT, nchars INTEGER)")
    return con


def clip(text: str) -> str:
    text = " ".join(text.split())
    if len(text) <= TEXT_HEAD + TEXT_TAIL + 40:
        return text
    return text[:TEXT_HEAD] + " […] " + text[-TEXT_TAIL:]


# ---------------------------------------------------------------- enumerate

def cmd_enumerate(a: argparse.Namespace) -> None:
    """Walk every speech in the box, windowed on the platform `created` stamp
    (offset paging over the whole set degrades to 40 s a page), and write the
    rids newest-first by the sitting date carried in the title."""
    out = Path(a.out)
    prog = out.with_suffix(".progress.json")
    state = json.loads(prog.read_text()) if prog.exists() else {"cursor": a.since or INDEX_SPAN[0], "rows": []}
    rows: list[list] = state["rows"]
    kb = Kb()
    if not state.get("complete"):
        cur = datetime.fromisoformat(state["cursor"].replace("Z", "+00:00"))
        end = (datetime.fromisoformat(a.until.replace("Z", "+00:00")) if a.until
               else datetime.now(timezone.utc) + timedelta(hours=1))
        step = timedelta(minutes=a.window)
        windows = 0
        while cur < end:
            nxt = cur + step
            win = {"prop": "created", "since": cur.strftime("%Y-%m-%dT%H:%M:%SZ"), "until": nxt.strftime("%Y-%m-%dT%H:%M:%SZ")}
            fe = {"resource": {"and": [SPEECH, win]}}
            page = 0
            while True:
                r = kb.call("POST", "/catalog", {"query": "", "filter_expression": fe, "page_size": 200,
                                                  "page_number": page, "sort": {"field": "created", "order": "asc"}})
                res = r.get("resources") or {}
                for rid, v in res.items():
                    rows.append([rid, v.get("slug"), v.get("title") or ""])
                if not (r.get("fulltext") or {}).get("next_page") or not res:
                    break
                page += 1
            cur = nxt
            windows += 1
            if windows % 24 == 0:
                state.update(cursor=cur.strftime("%Y-%m-%dT%H:%M:%SZ"), rows=rows)
                prog.write_text(json.dumps(state))
                print(f"  {win['until']}: {len(rows):,} speeches so far", flush=True)
        state.update(cursor=cur.strftime("%Y-%m-%dT%H:%M:%SZ"), rows=rows, complete=True)
        prog.write_text(json.dumps(state))
    sample = set(json.loads(SAMPLE_RIDS.read_text())) if SAMPLE_RIDS.exists() else set()
    seen: set[str] = set()
    dated: list[tuple[str, str, str]] = []
    for rid, slug, title in rows:
        if rid in seen or rid in sample:
            continue
        seen.add(rid)
        m = re.search(r"(\d{4}-\d{2}-\d{2})\s*$", title or "")
        dated.append((m.group(1) if m else "", rid, slug or ""))
    dated.sort(key=lambda t: t[0], reverse=True)
    out.write_text(json.dumps([{"rid": r, "slug": s, "date": d} for d, r, s in dated]))
    by_year: dict[str, int] = {}
    for d, _, _ in dated:
        by_year[d[:4] or "undated"] = by_year.get(d[:4] or "undated", 0) + 1
    print(f"{len(dated):,} speeches without a sample brief (of {len(rows):,} walked, {len(sample)} in the sample); "
          f"written newest-first to {out}")
    print("by year: " + ", ".join(f"{y} {n:,}" for y, n in sorted(by_year.items(), reverse=True)))


# ---------------------------------------------------------------- queue

def cmd_init(a: argparse.Namespace) -> None:
    rids = json.load(open(a.rids))
    rids = [r if isinstance(r, str) else r.get("rid") for r in rids][a.skip:]
    con = db()
    con.executemany("INSERT OR IGNORE INTO queue(rid) VALUES (?)", [(r,) for r in rids if r])
    con.commit()
    print(f"queued {len(rids)} rids (skipped the first {a.skip}); total rows {con.execute('SELECT COUNT(*) FROM queue').fetchone()[0]}")


def _rate_stop(con: sqlite3.Connection, worker: str) -> bool:
    n = con.execute("SELECT COUNT(*) FROM log WHERE worker=? AND ts > ?", (worker, time.time() - 600)).fetchone()[0]
    return n > RATE_STOP


def fetch_item(kb: Kb, rid: str) -> dict:
    d = kb.resource(rid)
    texts = (d.get("data") or {}).get("texts") or {}
    body = ""
    for name, v in texts.items():
        if "summary" in str(name).lower():
            continue
        candidate = ((v.get("value") or {}).get("body") or "")
        if len(candidate) > len(body):
            body = candidate
    existing = (((texts.get(FIELD) or {}).get("value") or {}).get("body") or "").strip()
    cls = (d.get("usermetadata") or {}).get("classifications") or []
    tags = {c.get("labelset"): c.get("label") for c in cls if c.get("labelset") in ("state", "party", "chamber")}
    return {
        "rid": rid,
        "slug": d.get("slug"),
        "title": d.get("title") or "",
        "state": tags.get("state"),
        "party": tags.get("party"),
        "words": len(body.split()),
        "text": clip(body),
        "_existing": existing,
        "_head": " ".join(body.split())[:240],
    }


def cmd_next(a: argparse.Namespace) -> None:
    if STOP_FILE.exists():
        print("STOP")
        return
    con = db()
    if _rate_stop(con, a.worker):
        print("STOP: this worker has written more briefs in ten minutes than anyone can read; nothing more will be handed to it.")
        return
    with con:
        con.execute("UPDATE queue SET status='pending', worker=NULL, claimed_at=NULL WHERE status='claimed' AND claimed_at < ?",
                    (time.time() - STALE_CLAIM_S,))
    kb = Kb()
    items: list[dict] = []
    rounds = 0
    while len(items) < a.n and rounds < 4:
        rounds += 1
        want = a.n - len(items)
        with con:
            rids = [r[0] for r in con.execute("SELECT rid FROM queue WHERE status='pending' ORDER BY rowid LIMIT ?", (want,)).fetchall()]
            if not rids:
                break
            con.executemany("UPDATE queue SET status='claimed', worker=?, claimed_at=? WHERE rid=? AND status='pending'",
                            [(a.worker, time.time(), r) for r in rids])
        with ThreadPoolExecutor(max_workers=POOL) as pool:
            fetched = list(pool.map(lambda r: _safe(fetch_item, kb, r), rids))
        for rid, it in zip(rids, fetched):
            with con:
                if isinstance(it, Exception):
                    con.execute("UPDATE queue SET status='error', error=? WHERE rid=?", (str(it)[:200], rid))
                elif it["_existing"]:
                    con.execute("UPDATE queue SET status='done', done_at=?, slug=?, summary=? WHERE rid=?",
                                (time.time(), it["slug"], "(existing)", rid))
                elif it["words"] < 3:
                    con.execute("UPDATE queue SET status='done', done_at=?, slug=?, summary=? WHERE rid=?",
                                (time.time(), it["slug"], "(no text)", rid))
                else:
                    con.execute("UPDATE queue SET slug=?, head=? WHERE rid=?", (it["slug"], it["_head"], rid))
                    items.append({k: v for k, v in it.items() if not k.startswith("_")})
    if not items and not con.execute("SELECT 1 FROM queue WHERE status='pending' LIMIT 1").fetchone():
        print("NONE")
        return
    Path(a.out).write_text(json.dumps(items, ensure_ascii=False, indent=1))
    print(f"batch {len(items)} speeches -> {a.out}")


def _safe(fn, *args):
    try:
        return fn(*args)
    except Exception as err:  # noqa: BLE001
        return err


_BAD_OPENERS = ("in this speech", "this speech", "summary:", "the speaker says", "the member says", "the senator says")


def _clean(s) -> tuple[str, str | None]:
    """Return (summary, problem)."""
    if not isinstance(s, str):
        return "", "not a string"
    s = " ".join(s.split()).strip()
    if "{context}" in s or "{" in s and "}" in s:
        return s, "placeholder text"
    if len(s) < MIN_CHARS:
        return s, f"too short ({len(s)} chars)"
    if len(s) > MAX_CHARS:
        return s, f"too long ({len(s)} chars)"
    low = s.lower()
    if low.startswith(_BAD_OPENERS):
        return s, "framing opener"
    if len(re.findall(r"[.!?](\s|$)", s)) > 4:
        return s, "more than three sentences"
    return s, None


def cmd_submit(a: argparse.Namespace) -> None:
    summaries: dict[str, str] = json.load(open(a.summaries))
    con = db()
    if _rate_stop(con, a.worker):
        print("STOP: this worker has written more briefs in ten minutes than anyone can read; nothing was written.")
        return
    with con:
        con.execute(
            "UPDATE queue SET claimed_at=? WHERE worker=? AND status='claimed' AND rid IN (%s)" % ",".join("?" * len(summaries)),
            [time.time(), a.worker, *summaries],
        )
    rows = {r[0]: (r[1], r[2], r[3], r[4]) for r in con.execute(
        "SELECT rid, slug, head, status, worker FROM queue WHERE rid IN (%s)" % ",".join("?" * len(summaries)), list(summaries))}
    # A batch of identical briefs, or briefs that are the speech's own opening
    # sentence, was not written from reading. Refuse it whole.
    cleaned: dict[str, str] = {}
    problems: list[str] = []
    copied = 0
    for rid, s in summaries.items():
        s, problem = _clean(s)
        if problem:
            problems.append(f"{rid[:8]}: {problem}")
            continue
        head = (rows.get(rid) or ("", "", "", ""))[1] or ""
        if len(s) >= 60 and s[:60].lower() in head.lower():
            copied += 1
            problems.append(f"{rid[:8]}: copies the speech's opening")
            continue
        cleaned[rid] = s
    n_in = len(summaries)
    counts: dict[str, int] = {}
    for s in cleaned.values():
        counts[s] = counts.get(s, 0) + 1
    if n_in >= 10 and (max(counts.values(), default=0) >= 3 or copied > 0.2 * n_in):
        print("REJECTED: repeated briefs or briefs copied from the speech openings; a brief is written from reading the whole speech. "
              "Reread and submit again; your claims are kept.")
        return
    kb = Kb()
    jobs = [(rid, s) for rid, s in cleaned.items() if rid in rows and rows[rid][2] == "claimed" and rows[rid][3] == a.worker]
    bad = len(cleaned) - len(jobs)

    def write(job):
        rid, s = job
        with db() as lease:
            owned = lease.execute(
                "UPDATE queue SET claimed_at=? WHERE rid=? AND status='claimed' AND worker=?",
                (time.time(), rid, a.worker),
            ).rowcount
        if not owned:
            return rid, False
        kb.call("PATCH", f"/resource/{rid}", {"texts": {FIELD: {"body": s, "format": "PLAIN"}}})
        return rid, True

    done, failed = 0, 0
    with ThreadPoolExecutor(max_workers=POOL) as pool:
        for job, res in zip(jobs, pool.map(lambda j: _safe(write, j), jobs)):
            rid, s = job
            with con:
                if isinstance(res, Exception):
                    failed += 1
                    con.execute("UPDATE queue SET status='error', error=? WHERE rid=? AND status='claimed' AND worker=?", (str(res)[:200], rid, a.worker))
                elif not res[1]:
                    bad += 1
                else:
                    changed = con.execute("UPDATE queue SET status='done', done_at=?, summary=? WHERE rid=? AND status='claimed' AND worker=?",
                                          (time.time(), s, rid, a.worker)).rowcount
                    if changed:
                        done += 1
                        con.execute("INSERT INTO log VALUES (?,?,?,?,?)", (time.time(), a.worker, rid, rows[rid][0], len(s)))
                    else:
                        bad += 1
    msg = f"submitted {done}, failed {failed}, not claimed by you {bad}"
    if problems:
        msg += f", rejected {len(problems)} (still claimed; fix and resubmit only those): " + "; ".join(problems[:8])
    print(msg)


def cmd_status(a: argparse.Namespace) -> None:
    con = db()
    counts = dict(con.execute("SELECT status, COUNT(*) FROM queue GROUP BY status").fetchall())
    hour = con.execute("SELECT COUNT(*) FROM log WHERE ts > ?", (time.time() - 3600,)).fetchone()[0]
    workers = dict(con.execute("SELECT worker, COUNT(*) FROM log WHERE ts > ? GROUP BY worker", (time.time() - 3600,)).fetchall())
    pending = counts.get("pending", 0) + counts.get("claimed", 0)
    print(json.dumps({"counts": counts, "done_last_hour": hour, "workers_last_hour": workers,
                      "eta_at_current_rate": f"{pending / hour:.1f} h" if hour else "n/a", "stop_file": STOP_FILE.exists()}, indent=1))


def cmd_release(a: argparse.Namespace) -> None:
    con = db()
    with con:
        n = con.execute("UPDATE queue SET status='pending', worker=NULL, claimed_at=NULL WHERE status='claimed' AND worker=?", (a.worker,)).rowcount
    print(f"released {n} claims held by {a.worker}")


def cmd_retry_errors(a: argparse.Namespace) -> None:
    con = db()
    with con:
        n = con.execute("UPDATE queue SET status='pending', worker=NULL, claimed_at=NULL, error=NULL WHERE status='error'").rowcount
    print(f"re-queued {n} errored rids")


def cmd_verify(a: argparse.Namespace) -> None:
    con = db()
    rows = con.execute(
        "SELECT rid, slug, summary FROM queue WHERE status='done' AND summary NOT LIKE '(%' ORDER BY done_at DESC LIMIT ?",
        (a.n,),
    ).fetchall()
    kb = Kb()
    for rid, slug, submitted in rows:
        d = kb.call("GET", f"/resource/{rid}/text/{FIELD}")
        live = (((d.get("value") or {}).get("body")) or "").strip()
        print(f"{slug}: {'ok' if live == submitted else 'MISMATCH'} ({len(live)} chars)")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("enumerate"); s.add_argument("--out", required=True); s.add_argument("--window", type=int, default=5)
    s.add_argument("--since"); s.add_argument("--until"); s.set_defaults(fn=cmd_enumerate)
    s = sub.add_parser("init"); s.add_argument("--rids", required=True); s.add_argument("--skip", type=int, default=0); s.set_defaults(fn=cmd_init)
    s = sub.add_parser("next"); s.add_argument("--worker", required=True); s.add_argument("--n", type=int, default=30); s.add_argument("--out", required=True); s.set_defaults(fn=cmd_next)
    s = sub.add_parser("submit"); s.add_argument("--worker", required=True); s.add_argument("--summaries", required=True); s.set_defaults(fn=cmd_submit)
    s = sub.add_parser("status"); s.set_defaults(fn=cmd_status)
    s = sub.add_parser("release"); s.add_argument("--worker", required=True); s.set_defaults(fn=cmd_release)
    s = sub.add_parser("retry-errors"); s.set_defaults(fn=cmd_retry_errors)
    s = sub.add_parser("verify"); s.add_argument("--n", type=int, default=5); s.set_defaults(fn=cmd_verify)
    a = p.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
