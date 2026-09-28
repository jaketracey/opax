#!/usr/bin/env python3
"""Index new speeches in the speeches_fts full-text table without re-reading the old ones.

    python3 scripts/fts_sync.py                # add every speech newer than the newest indexed one
    python3 scripts/fts_sync.py --check        # report how far behind it is; change nothing
    python3 scripts/fts_sync.py --rebuild      # full re-index of every speech (slow; see below)

speeches_fts is an external-content FTS5 table (content=speeches, content_rowid=speech_id) with no triggers,
so nothing keeps it current: each loader used to end with
`INSERT INTO speeches_fts(speeches_fts) VALUES('rebuild')`, re-tokenising all 1.3 million speeches (29 GB) for
a handful of new ones. On a network disk that ran for over half an hour and was random-I/O bound. Now the
loaders leave it alone and this runs once, after all of them.

How it finds the new rows: the FTS shadow table speeches_fts_docsize has one row per indexed rowid, so
`max(id)` is the newest speech already indexed and everything with a larger speech_id is new (speech_id is an
integer primary key, never reused). It indexes those in batches, committing each, so an interrupted run
resumes where it stopped.

What it does not do: it does not notice a speech whose text was edited after it was indexed, or one that was
deleted (an external-content table needs the old values to delete). Nothing in the nightly reads speeches_fts
(the site searches the knowledge box), so this only matters for the old local search. Run --rebuild when it
does, e.g. once a month, ideally from the desktop or with a throughput-boosted disk.

Exit status: 0 done / up to date; 2 speeches_fts is missing or has no docsize table (nothing to do).
"""
import argparse
import os
import sqlite3
import sys
import time


def state(db) -> dict:
    last = db.execute("SELECT COALESCE(MAX(id), 0) FROM speeches_fts_docsize").fetchone()[0]
    indexed = db.execute("SELECT COUNT(*) FROM speeches_fts_docsize").fetchone()[0]
    newest = db.execute("SELECT COALESCE(MAX(speech_id), 0) FROM speeches").fetchone()[0]
    new = db.execute("SELECT COUNT(*) FROM speeches WHERE speech_id > ?", (last,)).fetchone()[0]
    total = db.execute("SELECT COUNT(*) FROM speeches").fetchone()[0]
    return {"last_indexed": last, "indexed_rows": indexed, "newest_speech": newest, "new_rows": new,
            "speeches": total, "unindexed_gap": total - new - indexed}


def sync(db, batch: int = 20000, log=print) -> int:
    """Index rows newer than the newest indexed one. Returns how many were added."""
    st = state(db)
    if not st["new_rows"]:
        return 0
    added = 0
    lo = st["last_indexed"]
    t0 = time.time()
    while True:
        row = db.execute(
            "SELECT MAX(speech_id) FROM (SELECT speech_id FROM speeches WHERE speech_id > ? "
            "ORDER BY speech_id LIMIT ?)", (lo, batch)).fetchone()
        hi = row[0]
        if hi is None:
            break
        cur = db.execute(
            "INSERT INTO speeches_fts(rowid, speaker_name, topic, text) "
            "SELECT speech_id, speaker_name, topic, text FROM speeches WHERE speech_id > ? AND speech_id <= ?",
            (lo, hi))
        added += cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
        db.commit()
        log(f"  indexed up to speech_id {hi} ({added:,} rows, {time.time() - t0:.0f}s)")
        lo = hi
    return added


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--db", default=os.path.expanduser("~/.cache/autoresearch/parli.db"))
    ap.add_argument("--check", action="store_true", help="report only")
    ap.add_argument("--rebuild", action="store_true", help="full re-index (slow)")
    ap.add_argument("--batch", type=int, default=20000, help="rows per transaction (default 20000)")
    args = ap.parse_args()

    db = sqlite3.connect(args.db, timeout=600)
    db.execute("PRAGMA busy_timeout = 600000")
    try:
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'speeches_fts%'")}
        if not {"speeches_fts", "speeches_fts_docsize"} <= tables:
            print("speeches_fts (or its docsize table) does not exist: nothing to index")
            return 2
        if args.rebuild:
            t0 = time.time()
            print("rebuilding speeches_fts from every speech...", flush=True)
            db.execute("INSERT INTO speeches_fts(speeches_fts) VALUES('rebuild')")
            db.commit()
            print(f"rebuilt in {time.time() - t0:.0f}s")
            return 0
        st = state(db)
        print(f"speeches_fts: {st['indexed_rows']:,} rows indexed up to speech_id {st['last_indexed']:,}; "
              f"speeches: {st['speeches']:,} rows, newest speech_id {st['newest_speech']:,}; "
              f"{st['new_rows']:,} not yet indexed")
        if st["unindexed_gap"]:
            print(f"note: {abs(st['unindexed_gap']):,} rows "
                  f"{'older than the newest indexed one are missing from' if st['unindexed_gap'] > 0 else 'in the index no longer exist in'} "
                  "speeches; only --rebuild fixes that")
        if args.check:
            return 0
        added = sync(db, args.batch)
        st = state(db)
        print(f"done: {added:,} speeches added; {st['new_rows']:,} left unindexed")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
