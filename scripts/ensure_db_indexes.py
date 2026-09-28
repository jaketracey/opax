#!/usr/bin/env python3
"""Create the indexes the refresh needs that parli.db does not ship with.

    python3 scripts/ensure_db_indexes.py            # create what is missing (idempotent)
    python3 scripts/ensure_db_indexes.py --check    # report only

The refresh's queries were written against a desktop where a full scan of `speeches` (29 GB) is
seconds; on a network disk (EBS gp3, about 130 MB/s) it is 3.5 minutes, and a night was doing dozens.
Each index below answers one family of them from the index alone:

  idx_speeches_source_date   (source, date)   the row counts daily_refresh.sh takes before and after each
                                              step, its closing GROUP BY source / MAX(date), and every
                                              loader's per-source dedup window
  idx_speeches_date          (date)           the federal loader's dedup window (all sources, dated on or
                                              after --since)
  idx_speeches_hearing_id    (hearing_id)     the committee loader's "which hearings are already in?"
  (partial, hearing_id IS NOT NULL)

Building each is one full scan plus a sort (about 4 minutes each on gp3, once) and adds tens of MB. They
are additive: no query returns different rows. daily_refresh.sh runs this when OPAX_ENSURE_INDEXES=1,
which nightly.sh sets; the desktop, which does not need them, is untouched.
"""
import argparse
import os
import sqlite3
import sys
import time

# (table, index name, columns, partial-index WHERE or None)
INDEXES = [
    ("speeches", "idx_speeches_source_date", "source, date", None),
    ("speeches", "idx_speeches_date", "date", None),
    ("speeches", "idx_speeches_hearing_id", "hearing_id", "hearing_id IS NOT NULL"),
]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--db", default=os.path.expanduser("~/.cache/autoresearch/parli.db"))
    ap.add_argument("--check", action="store_true", help="report only; create nothing")
    args = ap.parse_args()
    db = sqlite3.connect(args.db, timeout=600)
    try:
        missing = 0
        for table, name, columns, where in INDEXES:
            have = db.execute("SELECT 1 FROM sqlite_master WHERE type='index' AND name=?", (name,)).fetchone()
            if have:
                print(f"{name}: present")
                continue
            table_cols = {r[1] for r in db.execute(f"PRAGMA table_info({table})")}
            wanted = {c.strip() for c in columns.split(",")}
            if not wanted <= table_cols:
                print(f"{name}: skipped ({table} has no column {sorted(wanted - table_cols)})")
                continue
            missing += 1
            if args.check:
                print(f"{name}: MISSING")
                continue
            print(f"{name}: creating on {table}({columns}){' WHERE ' + where if where else ''}; "
                  "this is one full scan of the table...", flush=True)
            t0 = time.time()
            db.execute(f"CREATE INDEX {name} ON {table}({columns})" + (f" WHERE {where}" if where else ""))
            db.commit()
            print(f"{name}: created in {time.time() - t0:.0f}s")
        return 1 if (args.check and missing) else 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
