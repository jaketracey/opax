#!/usr/bin/env python3
"""Drain ext_kb_patch_queue: re-send each queued speech's speaker fields to the
knowledge box, leaving its text alone.

parli.ingest.committee_witnesses rewrites who spoke (a witness's full name,
position and organisation; a senator's full name; the speaker_type label) in
parli.db and queues the slugs here. For each one this script rebuilds the
resource's title, origin (collaborators), classifications and extra metadata
exactly as parli.ingest.arag_sync.map_speech would push them, and PATCHes the
resource by slug. Texts are never sent. A slug the box does not hold yet is
marked `missing`: the bulk sync will create it with the corrected fields.

A field patch READ-MERGE-WRITES the classifications (2026-09-29). The box replaces `usermetadata.classifications`
wholesale, and the enrichment Worker writes `topic` labels there after the push (enrich/src/write.ts), so sending the
row's own list would drop them. Instead, immediately before the write, the script reads the resource's current
classifications, replaces only the labelsets a speaker patch owns (OWNED_LABELSETS: `party`, `speaker_type`), keeps every
other label (topic, kind, source, state, chamber, decade, ...) as read, refuses the write when the read has no `kind`
label or when a label it does not own would be dropped, reads back after the PATCH and re-sends once if a label went
missing. Text patches ("text:..." reasons) send the body only and read nothing.

Runs on the database host, in the background, resumable:

    rsync -a --exclude __pycache__ parli/ desktop:~/opax-sync/parli/
    scp scripts/arag_patch_speakers.py desktop:~/opax-sync/scripts/
    ssh desktop 'cd ~/opax-sync && nohup env PYTHONPATH=. python3 scripts/arag_patch_speakers.py \
        --env ~/opax/.env > /tmp/kb_patch.log 2>&1 & echo $! > /tmp/kb_patch.pid'
    ssh desktop 'tail -2 /tmp/kb_patch.log'

Then bump CACHE_EPOCH in portal/wrangler.jsonc and deploy (MIGRATION-ARAG.md,
"A corpus change is not finished until CACHE_EPOCH is bumped").
"""

from __future__ import annotations

import argparse
import os
import signal
import sqlite3
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from parli.arag import AragConfig, AragError, KbClient, load_dotenv
from parli.ingest.arag_sync import _texts, map_speech

stop = False


def on_signal(*_):
    global stop
    stop = True


def log(*a):
    print(datetime.now().strftime("%H:%M:%S"), *a, flush=True)


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


OWNED_LABELSETS = frozenset({"party", "speaker_type"})     # what a speaker patch may rewrite; every other label is kept


def read_classifications(resource) -> list[dict]:
    """The classifications a resource carries, as {labelset, label} (a cancelled one keeps its flag): the port of
    enrich/src/classify.ts readClassifications."""
    raw = ((resource or {}).get("usermetadata") or {}).get("classifications") if isinstance(resource, dict) else None
    out = []
    for c in raw if isinstance(raw, list) else []:
        if not isinstance(c, dict) or not isinstance(c.get("labelset"), str) or not isinstance(c.get("label"), str):
            continue
        if not c["labelset"] or not c["label"]:
            continue
        entry = {"labelset": c["labelset"], "label": c["label"]}
        if c.get("cancelled_by_user") is True:
            entry["cancelled_by_user"] = True
        out.append(entry)
    return out


def merge_owned(existing: list[dict], new_labels: list[dict]) -> list[dict]:
    """Every existing classification outside OWNED_LABELSETS, then the owned ones the row now has."""
    return [c for c in existing if c["labelset"] not in OWNED_LABELSETS] + \
           [{"labelset": c["labelset"], "label": str(c["label"])} for c in new_labels
            if c.get("labelset") in OWNED_LABELSETS and c.get("label") not in (None, "", "None")]


def dropped_non_owned(before: list[dict], after: list[dict]) -> list[dict]:
    """Labels in `before`, outside OWNED_LABELSETS, that `after` does not have (enrich/src/classify.ts
    droppedNonTopicLabels, with the owned labelsets in place of `topic`)."""
    have = {(c["labelset"], c["label"]) for c in after}
    return [c for c in before if c["labelset"] not in OWNED_LABELSETS and (c["labelset"], c["label"]) not in have]


def _with_retry(call):
    """('ok', value) | ('missing', None) | ('failed', why), retrying rate limits, 5xx and network errors."""
    backoff = 2.0
    for attempt in range(5):
        try:
            return "ok", call()
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


def patch_one(kb: KbClient, row: sqlite3.Row, reason: str | None = None) -> tuple[str, str | None]:
    doc = map_speech(row)
    slug = doc["slug"]
    if reason and reason.startswith("text:"):
        # Text repairs send the cleaned body and nothing else, so labels and other enrichment written since the source
        # database was last synced are preserved.
        status, err = _with_retry(lambda: kb.patch_resource_by_slug(slug, {"texts": doc["texts"]}))
        return ("patched", None) if status == "ok" else (status, err)

    # A speaker patch: read the classifications now, replace only the labelsets it owns, write, read back.
    status, basic = _with_retry(lambda: kb.get_resource_by_slug(slug, show="basic"))
    if status != "ok":
        return status, basic
    before = read_classifications(basic)
    # Every OPAX resource carries a kind label; without one the read is suspect (partial response, wrong shape)
    # and a write could wipe the real list.
    if not any(c["labelset"] == "kind" for c in before):
        return "failed", "refusing to write: the resource read back with no kind classification"
    merged = merge_owned(before, doc["usermetadata"]["classifications"])
    lost = dropped_non_owned(before, merged)
    if lost:
        return "failed", "refusing to write: the list would drop " + ", ".join(f"{c['labelset']}/{c['label']}" for c in lost)
    body = {"title": doc["title"], "origin": doc["origin"], "extra": doc["extra"], "usermetadata": {"classifications": merged}}
    status, err = _with_retry(lambda: kb.patch_resource_by_slug(slug, body))
    if status != "ok":
        return status, err
    # Read back; re-send once if a label outside the ones we own went missing.
    status, after = _with_retry(lambda: kb.get_resource_by_slug(slug, show="basic"))
    if status != "ok":
        return "failed", f"patched, but the read-back failed: {after}"
    missing = dropped_non_owned(before, read_classifications(after))
    if missing:
        status, err = _with_retry(lambda: kb.patch_resource_by_slug(slug, {"usermetadata": {"classifications": merged}}))
        if status != "ok":
            return "failed", f"labels went missing after the patch and the re-send failed: {err}"
        status, after = _with_retry(lambda: kb.get_resource_by_slug(slug, show="basic"))
        missing = dropped_non_owned(before, read_classifications(after)) if status == "ok" else missing
        if missing:
            return "failed", "labels still missing after a re-send: " + ", ".join(f"{c['labelset']}/{c['label']}" for c in missing)
    return "patched", None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--db", default=os.environ.get("OPAX_DB") or os.path.expanduser("~/.cache/autoresearch/parli.db"))
    ap.add_argument("--env", default=os.path.expanduser("~/opax/.env"))
    ap.add_argument("--threads", type=int, default=6)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--retry-failed", action="store_true")
    args = ap.parse_args()
    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGINT, on_signal)

    load_dotenv(args.env)
    cfg = AragConfig.from_env()
    if not cfg.kb_configured:
        sys.exit("ARAG_KB_ID / ARAG_KB_TOKEN not set")
    kb = KbClient(cfg)

    db = sqlite3.connect(args.db, timeout=600)
    db.execute("PRAGMA busy_timeout = 600000")
    db.row_factory = sqlite3.Row
    statuses = ("pending", "failed") if args.retry_failed else ("pending",)
    slugs = [(r[0], r[1]) for r in db.execute(
        f"SELECT slug, reason FROM ext_kb_patch_queue WHERE status IN ({','.join('?' for _ in statuses)}) ORDER BY slug", statuses)]
    if args.limit:
        slugs = slugs[:args.limit]
    log(f"{len(slugs):,} slugs to patch with {args.threads} threads")
    if not slugs:
        return 0

    lock = threading.Lock()
    done = {"patched": 0, "missing": 0, "failed": 0}
    pending_writes: list[tuple] = []
    t0 = time.time()

    def flush():
        nonlocal pending_writes
        if not pending_writes:
            return
        with lock:
            batch, pending_writes = pending_writes, []
        for _ in range(5):
            try:
                db.executemany(
                    "UPDATE ext_kb_patch_queue SET status = ?, attempts = attempts + 1, error = ?, updated_at = ? WHERE slug = ?",
                    batch)
                db.commit()
                return
            except sqlite3.OperationalError:
                time.sleep(10)

    # One read-only connection per worker thread: a connection shared across
    # threads fails mid-run with "bad parameter or other API misuse".
    local = threading.local()

    def reader() -> sqlite3.Connection:
        conn = getattr(local, "db", None)
        if conn is None:
            conn = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
            conn.execute("PRAGMA busy_timeout = 600000")
            conn.row_factory = sqlite3.Row
            local.db = conn
        return conn

    def work(item):
        slug, reason = item
        sid = int(slug.split("-", 1)[1])
        row = reader().execute("SELECT * FROM speeches WHERE speech_id = ?", (sid,)).fetchone()
        if row is None:
            return slug, "failed", "no such speech row"
        status, err = patch_one(kb, row, reason)
        return slug, status, err

    i = 0
    with ThreadPoolExecutor(max_workers=args.threads) as ex:
        futures = {}
        it = iter(slugs)
        # keep a bounded window of work in flight so a stop lands quickly
        for _ in range(args.threads * 4):
            s = next(it, None)
            if s is None:
                break
            futures[ex.submit(work, s)] = s
        while futures:
            for fut in as_completed(list(futures)):
                futures.pop(fut)
                slug, status, err = fut.result()
                i += 1
                done[status] += 1
                with lock:
                    pending_writes.append((status, err, now_iso(), slug))
                if len(pending_writes) >= 200:
                    flush()
                if i % 1000 == 0:
                    rate = i / max(1, time.time() - t0)
                    log(f"  {i:,}/{len(slugs):,} · {done} · {rate:.1f}/s · ~{(len(slugs) - i) / max(rate, 0.01) / 60:.0f} min left")
                if not stop:
                    s = next(it, None)
                    if s is not None:
                        futures[ex.submit(work, s)] = s
                break
            if stop and not futures:
                break
    flush()
    db.execute("INSERT INTO ext_ingest_log (table_name, source, rows_loaded, rows_deleted, loaded_at, notes) VALUES (?,?,?,?,?,?)",
               ("kb", "arag_patch_speakers", done["patched"], 0, now_iso(),
                f"missing={done['missing']} failed={done['failed']} stopped={'signal' if stop else 'done'} seconds={int(time.time() - t0)}"))
    db.commit()
    log(f"finished: {done} in {int(time.time() - t0)}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
