"""When a loader may rebuild the speeches_fts full-text index.

`INSERT INTO speeches_fts(speeches_fts) VALUES('rebuild')` re-reads and re-tokenises every speech
(1.3M rows, 29 GB): a few minutes on a desktop NVMe, over half an hour on a network disk, for a
handful of new rows. The loaders used to do it at the end of every run. It is now OFF unless asked
for, and new rows are indexed incrementally by scripts/fts_sync.py, which the daily refresh runs once
after all the loaders.

    --rebuild-fts, or OPAX_FTS_REBUILD=1     rebuild from the loader (a manual full re-index)
"""
import os


def add_argument(parser) -> None:
    parser.add_argument("--rebuild-fts", action="store_true",
                        help="rebuild the whole speeches_fts index at the end (slow; default: leave it to "
                             "scripts/fts_sync.py, which indexes only new rows)")


def rebuild_wanted(flag: bool = False) -> bool:
    return bool(flag) or os.environ.get("OPAX_FTS_REBUILD") == "1"
