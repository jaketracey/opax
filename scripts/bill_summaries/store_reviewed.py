#!/usr/bin/env python3
"""Insert independently checked bill summaries into `bill_summaries` as `ok` rows.

    python3 store_reviewed.py --db ~/.cache/autoresearch/parli.db \
        --accepted <pack root>/accepted --fetched <pack root>/fetched.json \
        --receipt <pack root>/store-<host>-<date>.json [--dry-run]

Before any write it dumps the whole `bill_summaries` table and the touched
`bill_sources` rows to `<accepted>/backup-<host>-<stamp>.json`. Then, per
accepted summary (see collect_accepted.py):

  * a bill that already has a projected `ok` summary is skipped (never
    overwrite a published summary from here);
  * the same payload under the same prompt_version is skipped (idempotent);
  * for an `em` or `digest` basis the summary's source must match a
    `bill_sources` row by (bill_key, kind, source_id). A row that was
    registered but never fetched gains its content hash and cache path; a bill
    with no row at all (a legacy ALRC bill resolved during this run) gets its
    billhome and EM rows from the fetch sidecar. A hash mismatch is refused;
  * the row is inserted with the next version, `review_state='ok'`, and the
    writer's model, provider, prompt_version and generated_at.

Run it against the desktop registry and the refresh VM's copy of parli.db so
the nightly export keeps the summaries.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import socket
import sqlite3
import sys
from pathlib import Path


def projected_ok(db: sqlite3.Connection) -> set[str]:
    out = set()
    for r in db.execute("SELECT bill_key, summary_json FROM bill_summaries WHERE review_state='ok' "
                        "AND (superseded_by IS NULL OR superseded_by='')"):
        try:
            p = json.loads(r[1] or "{}")
        except (TypeError, ValueError):
            continue
        if len(p.get("sentences") or []) == 3 and 3 <= len(p.get("changes") or []) <= 6:
            out.add(r[0])
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.path.expanduser("~/.cache/autoresearch/parli.db"))
    ap.add_argument("--accepted", required=True)
    ap.add_argument("--fetched")
    ap.add_argument("--receipt", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    acc = Path(args.accepted)
    manifest = json.loads((acc / "manifest.json").read_text())
    fetched = json.loads(Path(args.fetched).read_text()) if args.fetched and Path(args.fetched).exists() else {}
    docs = {k: json.loads((acc / f"{k}.summary.json").read_text()) for k in manifest}
    host = socket.gethostname()
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    db = sqlite3.connect(args.db, timeout=180)
    db.row_factory = sqlite3.Row
    keys = sorted(docs)
    marks = ",".join("?" * len(keys))
    backup = {
        "host": host, "db": args.db, "taken_at": stamp,
        "bill_summaries": [dict(r) for r in db.execute("SELECT * FROM bill_summaries")],
        "bill_sources": [dict(r) for r in db.execute(f"SELECT * FROM bill_sources WHERE bill_key IN ({marks})", keys)],
    }
    bpath = acc / f"backup-{host}-{stamp}.json"
    bpath.write_text(json.dumps(backup, ensure_ascii=False), encoding="utf-8")
    print(f"backup: {bpath} ({len(backup['bill_summaries'])} summary rows, {len(backup['bill_sources'])} source rows)")

    already = projected_ok(db)
    receipt = {"host": host, "db": args.db, "started": stamp, "dry_run": args.dry_run, "inserted": {}, "skipped": {}, "sources_added": {}}
    with db:
        for key in keys:
            doc = docs[key]
            p = doc["summary_json"]
            assert len(p["sentences"]) == 3 and 3 <= len(p["changes"]) <= 6 and p["affected"] and not p.get("flags")
            if key in already:
                receipt["skipped"][key] = "already has a projected ok summary"
                continue
            same = db.execute("SELECT version, summary_json FROM bill_summaries WHERE bill_key=? AND prompt_version=? AND review_state='ok'",
                              (key, doc["prompt_version"])).fetchone()
            if same and json.loads(same["summary_json"]) == p:
                receipt["skipped"][key] = f"identical payload already stored as version {same['version']}"
                continue
            src = p["source"]
            if doc["basis"] in ("em", "digest"):
                row = db.execute("SELECT * FROM bill_sources WHERE bill_key=? AND kind=? AND source_id=?",
                                 (key, src["kind"], src["id"])).fetchone()
                if row is None:
                    side = fetched.get(key) or {}
                    if not side.get("em") or side["em"].get("source_id") != src["id"]:
                        receipt["skipped"][key] = "no bill_sources row and no fetch sidecar for the source"
                        continue
                    home = side.get("billhome")
                    adds = []
                    if home and not db.execute("SELECT 1 FROM bill_sources WHERE bill_key=? AND kind='billhome'", (key,)).fetchone():
                        adds.append((key, "billhome", home["source_id"], home["url"], home.get("record_date"), side["em"].get("fetched_at"),
                                     "CC BY-NC-ND 4.0", home.get("content_hash"), home.get("cache_path")))
                    adds.append((key, side["em"]["kind"], side["em"]["source_id"], side["em"]["url"], None, side["em"].get("fetched_at"),
                                 "CC BY-NC-ND 4.0", side["em"].get("content_hash"), side["em"].get("cache_path")))
                    if not args.dry_run:
                        db.executemany("INSERT OR IGNORE INTO bill_sources (bill_key, kind, source_id, url, document_date, fetched_at, "
                                       "licence, content_hash, cache_path, outline_text) VALUES (?,?,?,?,?,?,?,?,?,NULL)", adds)
                    receipt["sources_added"][key] = [a[1] for a in adds]
                elif not row["content_hash"]:
                    if not args.dry_run:
                        db.execute("UPDATE bill_sources SET content_hash=?, cache_path=COALESCE(cache_path, ?), fetched_at=COALESCE(fetched_at, ?) "
                                   "WHERE bill_key=? AND kind=? AND source_id=?",
                                   (src["content_hash"], src.get("cache_path"), src.get("fetched_at"), key, src["kind"], src["id"]))
                    receipt["sources_added"][key] = ["hash recorded on the registered row"]
                elif row["content_hash"] != src["content_hash"]:
                    receipt["skipped"][key] = "source content hash differs from the registry row"
                    continue
            version = db.execute("SELECT COALESCE(MAX(version),0)+1 FROM bill_summaries WHERE bill_key=?", (key,)).fetchone()[0]
            if not args.dry_run:
                db.execute(
                    "INSERT INTO bill_summaries (bill_key, version, basis, describes_version, as_of, summary_json, model, provider, "
                    "prompt_version, input_tokens, output_tokens, generated_at, review_state, superseded_by) "
                    "VALUES (?,?,?,?,?,?,?,?,?,NULL,NULL,?,'ok',NULL)",
                    (key, version, doc["basis"], doc["describes_version"], doc["as_of"], json.dumps(p, ensure_ascii=False),
                     doc["model"], doc["provider"], doc["prompt_version"], doc["generated_at"]))
            receipt["inserted"][key] = version
    after = projected_ok(db)
    receipt["projected_ok_before"] = len(already)
    receipt["projected_ok_after"] = len(after)
    receipt["finished"] = dt.datetime.now(dt.timezone.utc).isoformat()
    Path(args.receipt).write_text(json.dumps(receipt, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: (len(v) if isinstance(v, dict) else v) for k, v in receipt.items()}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
