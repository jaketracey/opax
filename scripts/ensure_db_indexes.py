#!/usr/bin/env python3
"""Create the one index the refresh needs that parli.db does not ship with.

    python3 scripts/ensure_db_indexes.py            # create it if missing (idempotent)
    python3 scripts/ensure_db_indexes.py --check    # report only

daily_refresh.sh counts rows before and after each step (`SELECT COUNT(*) FROM speeches WHERE
source = ?`) and finishes with `SELECT source, MAX(date), COUNT(*) FROM speeches GROUP BY source`.
speeches has no index on source, so each of those is a full scan of the 29 GB table: seconds on
the desktop's NVMe, about 3.5 minutes on an EBS gp3 volume (about 130 MB/s), and the refresh does
a dozen of them. An index on (source, date) answers all of them from a few tens of megabytes.

Building it is one full scan plus a sort (5-10 minutes on gp3, once) and adds roughly 50 MB. It is
additive: nothing reads the table differently. daily_refresh.sh runs this when OPAX_ENSURE_INDEXES=1,
which nightly.sh sets; the desktop, which does not need it, is untouched.
"""
import argparse
import os
import sqlite3
import sys
import time

INDEXES = [("speeches", "idx_speeches_source_date", "source, date")]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--db", default=os.path.expanduser("~/.cache/autoresearch/parli.db"))
    ap.add_argument("--check", action="store_true", help="report only; create nothing")
    args = ap.parse_args()
    db = sqlite3.connect(args.db, timeout=600)
    try:
        missing = 0
        for table, name, column in INDEXES:
            have = db.execute("SELECT 1 FROM sqlite_master WHERE type='index' AND name=?", (name,)).fetchone()
            if have:
                print(f"{name}: present")
                continue
            missing += 1
            if args.check:
                print(f"{name}: MISSING")
                continue
            print(f"{name}: creating on {table}({column}); this is one full scan of the table...", flush=True)
            t0 = time.time()
            db.execute(f"CREATE INDEX {name} ON {table}({column})")
            db.commit()
            print(f"{name}: created in {time.time() - t0:.0f}s")
        return 1 if (args.check and missing) else 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
