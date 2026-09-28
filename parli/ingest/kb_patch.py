"""
parli.ingest.kb_patch -- send changed speech fields or text to resources already in the knowledge box.

`ext_kb_patch_queue` holds the slugs (`speech-<speech_id>`) waiting for a PATCH and, in `reason`, what kind:

  reason 'text:<why>'   send the cleaned body text only ({"texts": ...}). Nothing else on the resource is touched, so the
                        labels and the summary that the enrichment Worker has written since the push survive.
  any other reason      send title, origin (collaborators), classifications and extra metadata as
                        parli.ingest.arag_sync.map_speech builds them, never the text. WARNING: the box replaces
                        `usermetadata.classifications` wholesale, so this drops labels it did not send (the enrichment
                        Worker's `topic` labels). It predates the Worker. Do not run it over enriched resources until
                        it reads the resource's classifications and merges them (see docs/COMMITTEE-WITNESSES.md).

A slug the box does not hold is `missing`: the next bulk push (parli.ingest.arag_sync) creates it from the database row.
scripts/arag_patch_speakers.py drains the whole queue; `drain_text_patches` drains only the text ones, which is what the
committee-hearing refresh uses when a Proof transcript is replaced by its Final.
"""

from __future__ import annotations

import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from parli.arag import AragError, KbClient
from parli.ingest.arag_sync import map_speech


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def patch_one(kb: KbClient, row: sqlite3.Row, reason: str | None = None, mapper=None) -> tuple[str, str | None]:
    """PATCH one resource. Returns ('patched' | 'missing' | 'failed', error). `mapper` builds the resource body
    from the row (default: arag_sync.map_speech)."""
    doc = (mapper or map_speech)(row)
    body = {k: doc[k] for k in ("title", "origin", "usermetadata", "extra")}
    # A text repair sends the cleaned body and nothing else: labels and other enrichment written since the
    # source database was last synced must be preserved.
    if reason and reason.startswith("text:"):
        body = {"texts": doc["texts"]}
    slug = doc["slug"]
    backoff = 2.0
    for attempt in range(5):
        try:
            kb.patch_resource_by_slug(slug, body)
            return "patched", None
        except AragError as exc:
            if exc.status == 404:
                return "missing", None
            if exc.status in (429, 500, 502, 503, 504) and attempt < 4:
                time.sleep(backoff)
                backoff = min(backoff * 2, 60)
                continue
            return "failed", f"{exc.status}: {exc.detail[:200]}"
        except Exception as exc:  # network
            if attempt < 4:
                time.sleep(backoff)
                backoff = min(backoff * 2, 60)
                continue
            return "failed", str(exc)[:200]
    return "failed", "gave up"


def drain_text_patches(db: sqlite3.Connection, kb: KbClient, slugs: list[str] | None = None,
                       threads: int = 4, say=print) -> dict[str, int]:
    """PATCH the text of every pending 'text:' queue entry (or just `slugs`) and mark each patched / missing / failed."""
    db.row_factory = sqlite3.Row
    if slugs is None:
        slugs = [r[0] for r in db.execute(
            "SELECT slug FROM ext_kb_patch_queue WHERE status = 'pending' AND reason LIKE 'text:%' ORDER BY slug")]
    done = {"patched": 0, "missing": 0, "failed": 0}
    if not slugs:
        return done

    # rows are read on this thread (a sqlite connection is not shared across threads); only the HTTP calls fan out
    rows = {}
    for slug in slugs:
        sid = int(slug.split("-", 1)[1])
        rows[slug] = db.execute("SELECT * FROM speeches WHERE speech_id = ?", (sid,)).fetchone()

    def send(slug: str):
        row = rows[slug]
        if row is None:
            return slug, "failed", "no such speech row"
        status, err = patch_one(kb, row, "text:")
        return slug, status, err

    with ThreadPoolExecutor(max_workers=threads) as pool:
        results = list(pool.map(send, slugs))
    stamp = now_iso()
    for slug, status, err in results:
        done[status] += 1
        db.execute("UPDATE ext_kb_patch_queue SET status = ?, attempts = attempts + 1, error = ?, updated_at = ? WHERE slug = ?",
                   (status, err, stamp, slug))
    db.commit()
    say(f"  knowledge box text patches: {done}")
    return done
