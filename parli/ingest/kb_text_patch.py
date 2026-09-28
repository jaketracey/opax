"""
parli.ingest.kb_text_patch -- keep the knowledge box in step with speeches whose text changed (or that were removed)
after arag_sync pushed them.

arag_sync pushes each speech once, by speech_id above a checkpoint (arag_sync_state.json). A loader that later rewrites a
row in place (a transcript published as a Proof and replaced by its Final) or deletes it must tell the box itself. A
loader queues each such row in its own table, and this module sends them. Shared by parli.ingest.act_hansard
(act_hansard_kb_queue) and parli.ingest.committee_hearings (committee_kb_queue); the loop was act_hansard's.

    queue(db, "committee_kb_queue", speech_id, "patch", "proof_to_final")
    send_queued(db, kb, "committee_kb_queue", label="committee", checkpoint=None)

A queue table has: speech_id PRIMARY KEY, op ('patch' | 'delete'), reason, queued_at, done_at, error (QUEUE_DDL).

  patch   row above the checkpoint: nothing to send (the next push carries the new text);
          row at or below it: PATCH the text field only (labels, origin, summaries the enrichment Worker wrote are
          untouched); a 404 means it was never pushed (it was under 200 characters as a Proof): create it if the new
          text now qualifies.
  delete  DELETE the resource (a 404 counts as done).
"""

from __future__ import annotations

import collections
import sqlite3
from datetime import datetime, timezone

QUEUE_DDL = """
CREATE TABLE IF NOT EXISTS {table} (
    speech_id  INTEGER PRIMARY KEY,
    op         TEXT NOT NULL,               -- 'patch' (text changed) | 'delete' (turn no longer in the Final)
    reason     TEXT,
    queued_at  TEXT NOT NULL,
    done_at    TEXT,
    error      TEXT
);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def queue(db: sqlite3.Connection, table: str, speech_id: int, op: str, reason: str, stamp: str | None = None) -> None:
    """Queue (or re-queue: done_at is cleared) one row for the box."""
    db.execute(f"INSERT OR REPLACE INTO {table} (speech_id, op, reason, queued_at) VALUES (?, ?, ?, ?)",
               (speech_id, op, reason, stamp or now_iso()))


def send_queued(db: sqlite3.Connection, kb=None, table: str = "", *, label: str = "KB", limit: int = 500,
                dry_run: bool = False, checkpoint: int | None = None) -> dict:
    """Send the queued changes to the knowledge box. Returns a count per outcome
    (patched, created, deleted, not-pushed, not-in-corpus, gone, failed, would-patch)."""
    from parli.ingest import arag_sync as sync

    if checkpoint is None:
        state = sync.load_state()
        checkpoint = int(state.get("tables", {}).get("speeches", {}).get("after", 0))
    rows = db.execute(f"SELECT * FROM {table} WHERE done_at IS NULL ORDER BY speech_id LIMIT ?", (limit,)).fetchall()
    out = collections.Counter()
    for q in rows:
        sid, op = q["speech_id"], q["op"]
        slug = f"speech-{sid}"
        status, err = "done", None
        try:
            if op == "delete":
                if not dry_run and sid <= checkpoint:
                    kb.delete_resource_by_slug(slug)
                status = "deleted" if sid <= checkpoint else "not-pushed"
            else:
                srow = db.execute("SELECT * FROM speeches WHERE speech_id=?", (sid,)).fetchone()
                if srow is None:
                    status = "gone"
                elif sid > checkpoint:
                    status = "not-pushed"
                elif not dry_run:
                    try:
                        kb.patch_resource_by_slug(slug, {"texts": sync._texts(sync.map_speech(srow)["texts"]["body"]["body"])})
                        status = "patched"
                    except sync.AragError as e:
                        if e.status != 404:
                            raise
                        eligible = db.execute(
                            "SELECT 1 FROM speeches WHERE speech_id=? AND LENGTH(text) >= ? AND date >= ? "
                            + sync.JUNK_PREDICATES, (sid, sync.MIN_SPEECH_CHARS, sync.DEFAULT_SINCE)).fetchone()
                        if eligible:
                            kb.create_resource(sync.map_speech(srow))
                            status = "created"
                        else:
                            status = "not-in-corpus"
                else:
                    status = "would-patch"
        except Exception as e:  # noqa: BLE001 - record and carry on
            status, err = "failed", f"{type(e).__name__}: {e}"[:300]
        out[status] += 1
        if not dry_run and status != "failed":
            db.execute(f"UPDATE {table} SET done_at=?, error=NULL WHERE speech_id=?", (now_iso(), sid))
        elif err:
            db.execute(f"UPDATE {table} SET error=? WHERE speech_id=?", (err, sid))
    db.commit()
    print(f"{label} KB patch: {dict(out)} (checkpoint speech_id {checkpoint})")
    return dict(out)
