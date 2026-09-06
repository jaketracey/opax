"""
parli.ingest.text_hygiene -- re-clean the rows a new text rule changes, and
queue them for the knowledge box.

`speech_hygiene.clean_speech_text_with_rules` is the one cleaner; the sync
applies it at push time and `text_clean` holds its output only where a repair
has run. When a rule is added (2026-09-06: `glued_capitalised_word` for
openaustralia's dropped spaces, "theAustralian" -> "the Australian"), the rows
already in the box keep the old text until re-sent. This module walks one
source, runs the cleaner, and where the named rule fired writes `text_clean`
and `text_clean_rules` and queues the slug in `ext_kb_patch_queue` with reason
`text:<rule>`; scripts/arag_patch_speakers.py sends the text for those.

    PYTHONPATH=. python3 -m parli.ingest.text_hygiene --db ~/.cache/autoresearch/parli.db --source openaustralia --rule glued_capitalised_word --dry-run
    PYTHONPATH=. python3 -m parli.ingest.text_hygiene --db ... --source openaustralia --rule glued_capitalised_word
"""

from __future__ import annotations

import argparse
import os
import sqlite3
from collections import Counter
from datetime import datetime, timezone

from parli.ingest.speech_hygiene import clean_speech_text_with_rules

SOURCE = "text_hygiene"


def log(*a):
    print(datetime.now().strftime("%H:%M:%S"), *a, flush=True)


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--db", default=os.path.expanduser("~/.cache/autoresearch/parli.db"))
    ap.add_argument("--source", required=True)
    ap.add_argument("--rule", required=True, help="only rows where this rule fired are written")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    db = sqlite3.connect(args.db, timeout=600)
    db.execute("PRAGMA busy_timeout = 600000")
    db.row_factory = sqlite3.Row
    cols = {r[1] for r in db.execute("PRAGMA table_info(speeches)")}
    for col in ("text_clean", "text_clean_rules"):
        if col not in cols and not args.dry_run:
            db.execute(f"ALTER TABLE speeches ADD COLUMN {col} TEXT")
    db.commit()
    db.executescript("""
    CREATE TABLE IF NOT EXISTS ext_kb_patch_queue (
        slug TEXT PRIMARY KEY, reason TEXT, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
        error TEXT, queued_at TEXT NOT NULL, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS ext_ingest_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT NOT NULL, source TEXT NOT NULL,
        rows_loaded INTEGER, rows_deleted INTEGER, loaded_at TEXT NOT NULL, notes TEXT);
    """)
    sql = "SELECT speech_id, text, topic, speaker_name, source FROM speeches WHERE source = ? AND text IS NOT NULL"
    if args.limit:
        sql += f" LIMIT {int(args.limit)}"
    stats = Counter()
    updates = []
    samples = []
    for r in db.execute(sql, (args.source,)):
        stats["scanned"] += 1
        c = clean_speech_text_with_rules(r["text"], r["source"] or "", r["topic"], r["speaker_name"])
        if args.rule not in c.rules:
            continue
        stats["rule_fired"] += 1
        updates.append((c.text, ",".join(c.rules), r["speech_id"]))
        if len(samples) < 6:
            i = 0
            samples.append((r["speech_id"], c.text[:160].replace("\n", " ")))
    log("  " + ", ".join(f"{k}={v:,}" for k, v in sorted(stats.items())))
    for sid, t in samples:
        log(f"    {sid}: {t}")
    if args.dry_run:
        return
    stamp = now_iso()
    cur = db.cursor()
    cur.execute("BEGIN")
    for i in range(0, len(updates), 5000):
        cur.executemany("UPDATE speeches SET text_clean = ?, text_clean_rules = ? WHERE speech_id = ?", updates[i:i + 5000])
    cur.executemany(
        "INSERT INTO ext_kb_patch_queue (slug, reason, status, queued_at) VALUES (?, ?, 'pending', ?) "
        "ON CONFLICT(slug) DO UPDATE SET status = 'pending', reason = excluded.reason, queued_at = excluded.queued_at",
        [(f"speech-{u[2]}", f"text:{args.rule}", stamp) for u in updates])
    cur.execute("INSERT INTO ext_ingest_log (table_name, source, rows_loaded, rows_deleted, loaded_at, notes) VALUES (?,?,?,?,?,?)",
                ("speeches", SOURCE, len(updates), 0, stamp, f"source={args.source} rule={args.rule} " + ", ".join(f"{k}={v}" for k, v in sorted(stats.items()))))
    cur.execute("COMMIT")
    log(f"  wrote text_clean on {len(updates):,} rows and queued them")


if __name__ == "__main__":
    main()
