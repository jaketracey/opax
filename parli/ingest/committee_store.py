"""
parli.ingest.committee_store -- the tables the committee-hearing ingest keeps beside `speeches`.

  ext_committee_hearings   one row per hearing the ingest has synced: dataset, committee, inquiry, date, transcript
                           status (Proof | Final), a content hash, and when it was first seen / last checked / last
                           changed. The Proof -> Final refresh reads it to decide what to fetch again.
  ext_committee_fragments  one row per stored fragment with the hash of what it says, so a refresh can tell in one
                           comparison whether a re-fetched fragment changed.
  committee_kb_queue       rows whose text changed, or that a Final dropped, waiting to be sent to the knowledge box.

Both are small (a few thousand rows) and never touched by other steps.
"""

from __future__ import annotations

import gzip
import sqlite3
from pathlib import Path

from parli.ingest.kb_text_patch import QUEUE_DDL as KB_QUEUE_DDL

# Rows of an already-pushed hearing whose text changed (Proof -> Final) or that the Final no longer contains, waiting
# for the knowledge box: parli.ingest.kb_text_patch sends them (the ACT Hansard loader queues the same way).
KB_QUEUE = "committee_kb_queue"

# the `source` values of committee rows, as an SQL list. Queries say `source IN (...)`, not `source LIKE 'committee%'`:
# LIKE cannot use the (source, date) index, so on the 29 GB table it reads every row.
COMMITTEE_SOURCES_SQL = "'committee_senate', 'committee_house', 'committee_joint'"

# rows written by the pre-2026-09-29 estimates-only ingest have no entry here (or parser_version 1)
PARSER_VERSION = 2

HEARINGS_DDL = """
CREATE TABLE IF NOT EXISTS ext_committee_hearings (
    hearing_base       TEXT PRIMARY KEY,          -- committees/commrep/29882
    dataset            TEXT NOT NULL,             -- estimate | commsen | commrep | commjnt
    committee_name     TEXT,
    inquiry_title      TEXT,
    hearing_date       TEXT,                      -- YYYY-MM-DD
    category           TEXT,                      -- the listing's kind label, e.g. "HoR Committee Hansard"
    status             TEXT,                      -- Proof | Final | NULL when the page did not say
    fragments_expected INTEGER,
    fragments_ok       INTEGER,
    turns_stored       INTEGER,
    content_hash       TEXT,
    parser_version     INTEGER NOT NULL DEFAULT 2,
    first_seen         TEXT NOT NULL,
    last_checked       TEXT,
    last_changed       TEXT,
    final_seen         TEXT,
    refresh_count      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ext_committee_hearings_due ON ext_committee_hearings(status, last_checked);
CREATE TABLE IF NOT EXISTS ext_committee_fragments (
    hearing_base TEXT NOT NULL,
    fragment     TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    turns        INTEGER,
    fetched_at   TEXT NOT NULL,
    PRIMARY KEY (hearing_base, fragment)
);
"""

# columns the ingest adds to `speeches` (TEXT, default NULL); existing DBs get them by ALTER TABLE, which in SQLite
# only rewrites the schema, never the 29 GB of rows.
SPEECH_COLUMNS = (
    "hearing_type", "witness_name", "hearing_id",
    "speaker_type", "witness_position", "witness_organisation",   # parli.ingest.committee_witnesses
    "handbook_id",                                                # Parliamentary Handbook id of a linked member label
)


def ensure_tables(db: sqlite3.Connection) -> None:
    db.executescript(HEARINGS_DDL + KB_QUEUE_DDL.format(table=KB_QUEUE))


def ensure_speech_columns(db: sqlite3.Connection, say=print) -> list[str]:
    """Add the committee columns to `speeches` when missing. Returns the columns added."""
    try:
        db.commit()
    except sqlite3.OperationalError:
        pass
    have = {row[1] for row in db.execute("PRAGMA table_info(speeches)")}
    added = []
    for col in SPEECH_COLUMNS:
        if col in have:
            continue
        try:
            db.execute(f"ALTER TABLE speeches ADD COLUMN {col} TEXT DEFAULT NULL")
            db.commit()
            added.append(col)
            say(f"  Added '{col}' column to speeches")
        except sqlite3.OperationalError as e:
            if "duplicate column" not in str(e).lower():
                raise
    return added


# ---------------------------------------------------------------------------
# The raw-page cache: one gzip file per fragment, <dir>/committees-commrep-29882-0001.html.gz.
# (Plain .html files written by earlier versions of committee_witnesses are still read.)
# ---------------------------------------------------------------------------

def cache_paths(cache_dir: Path, base: str, frag: str) -> tuple[Path, Path]:
    stem = base.replace("/", "-") + f"-{frag}"
    return cache_dir / f"{stem}.html.gz", cache_dir / f"{stem}.html"


def read_cached_page(cache_dir: Path, base: str, frag: str) -> str | None:
    gz, plain = cache_paths(cache_dir, base, frag)
    try:
        if gz.exists():
            return gzip.decompress(gz.read_bytes()).decode("utf-8", errors="replace")
        if plain.exists() and plain.stat().st_size > 5000:
            return plain.read_text(encoding="utf-8", errors="replace")
    except (OSError, EOFError, gzip.BadGzipFile):
        return None
    return None


def write_cached_page(cache_dir: Path, base: str, frag: str, page: str) -> None:
    gz, plain = cache_paths(cache_dir, base, frag)
    cache_dir.mkdir(parents=True, exist_ok=True)
    tmp = gz.with_suffix(".tmp")
    tmp.write_bytes(gzip.compress(page.encode("utf-8"), compresslevel=6))
    tmp.replace(gz)
    if plain.exists():
        plain.unlink()
