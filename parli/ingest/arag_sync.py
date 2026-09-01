"""
Migrate the OPAX text corpus from parli.db into the Progress Agentic RAG
knowledge box. Resumable, backpressure-aware, cost-guarded.

What migrates here is the TEXT corpus only:
  speeches         1.19M rows, ~4.4B chars   -> resource slug speech-{speech_id}
  legal_documents  232K rows,  ~9.2B chars   -> resource slug legal-{doc_id}
  news_articles    ~4K rows                  -> resource slug news-{id}

Structured tables (votes, donations, contracts, members, ...) stay in
Postgres/SQLite — they are relational analytics, not retrieval documents.

COST GUARD: a full run pushes ~13.6 GB of text through platform processing.
The script refuses to run more than --limit 100 per table unless --full is
passed. No enrichment (DA) task is ever registered or started from here.

Run on the machine that has parli.db (the WSL box):
  uv run python -m parli.ingest.arag_sync --tables speeches --limit 25   # smoke test
  uv run python -m parli.ingest.arag_sync --tables speeches,legal_documents --full

Checkpoint: ~/.cache/autoresearch/arag_sync_state.json (per-table last rowid
+ failed ids). Re-running skips everything already pushed; --retry-failed
re-attempts recorded failures.
"""

import argparse
import json
import sqlite3
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Iterator, Optional

from parli.arag import AragConfig, AragError, KbClient, load_dotenv

STATE_PATH = Path("~/.cache/autoresearch/arag_sync_state.json").expanduser()
DB_PATH = Path("~/.cache/autoresearch/parli.db").expanduser()

# Corpus cutoff: nothing predating any currently serving parliamentarian.
# The members table is too dirty to derive this (1901 senators linked to
# current members), so it's pinned to the March 1993 federal election — the
# entry of the longest-serving current federal MP (Bob Katter). Speeches
# under 200 chars are procedural fragments ("business start") — excluded.
# Together these halve the speech corpus: 627K rows / 2.22 GB kept.
DEFAULT_SINCE = "1993-03-13"
MIN_SPEECH_CHARS = 200

# A single text field caps out well below this; split anything bigger into
# continuation fields on the same resource (legal docs reach 100s of KB).
MAX_FIELD_CHARS = 900_000

SAFETY_LIMIT = 100  # per-table cap unless --full

WORKERS = 6  # modest parallelism; global backpressure pause still applies


# ---------------------------------------------------------------------------
# Row -> resource mapping
# ---------------------------------------------------------------------------


def _classifications(pairs: list[tuple[str, Optional[str]]]) -> list[dict]:
    return [
        {"labelset": labelset, "label": str(label)}
        for labelset, label in pairs
        if label not in (None, "", "None")
    ]


def _texts(body: str) -> dict[str, dict]:
    """Split oversized bodies into numbered continuation fields."""
    if len(body) <= MAX_FIELD_CHARS:
        return {"body": {"body": body, "format": "PLAIN"}}
    fields = {}
    for i in range(0, len(body), MAX_FIELD_CHARS):
        key = "body" if i == 0 else f"body-{i // MAX_FIELD_CHARS}"
        fields[key] = {"body": body[i : i + MAX_FIELD_CHARS], "format": "PLAIN"}
    return fields


def map_speech(row: sqlite3.Row) -> dict:
    date = row["date"] or ""
    decade = f"{date[:3]}0s" if len(date) >= 4 and date[:4].isdigit() else None
    title_bits = [b for b in (row["speaker_name"], row["topic"], date) if b]
    return {
        "slug": f"speech-{row['speech_id']}",
        "title": " — ".join(title_bits) or f"Speech {row['speech_id']}",
        "texts": _texts(row["text"]),
        "origin": {
            "source_id": "opax-parli",
            "collaborators": [row["speaker_name"]] if row["speaker_name"] else [],
            **({"created": f"{date}T00:00:00Z"} if len(date) == 10 else {}),
        },
        "usermetadata": {
            "classifications": _classifications([
                ("kind", "speech"),
                ("source", row["source"]),
                ("state", row["state"] or "federal"),
                ("party", row["party"]),
                ("chamber", row["chamber"]),
                ("decade", decade),
            ])
        },
        "extra": {
            "metadata": {
                "speech_id": row["speech_id"],
                "person_id": row["person_id"],
                "electorate": row["electorate"],
                "word_count": row["word_count"],
                "date": date,
            }
        },
    }


def map_legal(row: sqlite3.Row) -> dict:
    date = row["date"] or ""
    return {
        "slug": f"legal-{row['doc_id']}",
        "title": row["title"] or row["citation"] or f"Legal document {row['doc_id']}",
        "texts": _texts(row["text"] or ""),
        "origin": {
            "source_id": "open-australian-legal-corpus",
            **({"url": row["url"]} if row["url"] else {}),
            **({"created": f"{date[:10]}T00:00:00Z"} if len(date) >= 10 else {}),
        },
        "usermetadata": {
            "classifications": _classifications([
                ("kind", "legal"),
                ("doc_type", row["doc_type"]),
                ("jurisdiction", row["jurisdiction"]),
            ])
        },
        "extra": {
            "metadata": {
                "doc_id": row["doc_id"],
                "citation": row["citation"],
                "date": date,
            }
        },
    }


def map_news(row: sqlite3.Row) -> dict:
    cols = row.keys()
    text_col = next((c for c in ("content", "body", "text", "summary") if c in cols), None)
    date_col = next((c for c in ("date", "published", "published_at") if c in cols), None)
    date = (row[date_col] or "") if date_col else ""
    return {
        "slug": f"news-{row[0]}",
        "title": (row["title"] if "title" in cols else None) or f"Article {row[0]}",
        "texts": _texts((row[text_col] or "") if text_col else ""),
        "origin": {
            "source_id": "news",
            **({"url": row["url"]} if "url" in cols and row["url"] else {}),
            **({"created": f"{date[:10]}T00:00:00Z"} if len(date) >= 10 else {}),
        },
        "usermetadata": {"classifications": _classifications([("kind", "news")])},
        "extra": {"metadata": {"article_id": row[0], "date": date}},
    }


TABLES: dict[str, dict[str, Any]] = {
    "speeches": {
        "pk": "speech_id",
        "select": "SELECT * FROM speeches WHERE speech_id > ? AND text IS NOT NULL "
                  f"AND LENGTH(text) >= {MIN_SPEECH_CHARS} AND date >= {{since!r}} "
                  "ORDER BY speech_id LIMIT ?",
        "map": map_speech,
    },
    "legal_documents": {
        "pk": "doc_id",
        "select": "SELECT * FROM legal_documents WHERE doc_id > ? AND text IS NOT NULL "
                  "ORDER BY doc_id LIMIT ?",
        "map": map_legal,
    },
    "news_articles": {
        "pk": "rowid",
        "select": "SELECT rowid, * FROM news_articles WHERE rowid > ? ORDER BY rowid LIMIT ?",
        "map": map_news,
    },
}


# ---------------------------------------------------------------------------
# Checkpoint state
# ---------------------------------------------------------------------------


def load_state() -> dict:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text())
    return {"tables": {}}


def save_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=1))
    tmp.replace(STATE_PATH)


# ---------------------------------------------------------------------------
# Sync loop
# ---------------------------------------------------------------------------


def _push_one(kb: KbClient, body: dict) -> tuple[str, Optional[str]]:
    """Returns (slug, error). A 409 slug conflict counts as already-done."""
    try:
        kb.create_resource(body)
        return body["slug"], None
    except AragError as e:
        if e.status == 409:
            return body["slug"], None
        return body["slug"], f"{e.status}: {e.detail[:200]}"


def _batches(db: sqlite3.Connection, spec: dict, after: int, remaining: int,
             since: str, batch_size: int = 200) -> Iterator[list[sqlite3.Row]]:
    select = spec["select"].format(since=since)
    while remaining > 0:
        rows = db.execute(select, (after, min(batch_size, remaining))).fetchall()
        if not rows:
            return
        yield rows
        after = rows[-1][0] if spec["pk"] == "rowid" else rows[-1][spec["pk"]]
        remaining -= len(rows)


def sync_table(kb: KbClient, db: sqlite3.Connection, table: str, spec: dict,
               state: dict, limit: int, dry_run: bool, since: str) -> None:
    tstate = state["tables"].setdefault(table, {"after": 0, "pushed": 0, "failed": {}})
    after = tstate["after"]
    print(f"[{table}] resuming after {spec['pk']}={after}, "
          f"{tstate['pushed']:,} already pushed, {len(tstate['failed'])} failed")

    for rows in _batches(db, spec, after, limit, since):
        bodies = [spec["map"](r) for r in rows]
        if dry_run:
            # Never advance or persist the checkpoint on a dry run.
            for b in bodies:
                size = sum(len(f["body"]) for f in b["texts"].values())
                print(f"  DRY {b['slug']:20s} {size:>9,} chars  {b['title'][:70]!r}")
            return

        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            futures = {pool.submit(_push_one, kb, b): b for b in bodies}
            for fut in as_completed(futures):
                slug, err = fut.result()
                if err:
                    tstate["failed"][slug] = err
                    print(f"  FAIL {slug}: {err}", file=sys.stderr)
                else:
                    tstate["pushed"] += 1
                    tstate["failed"].pop(slug, None)

        tstate["after"] = rows[-1][0] if spec["pk"] == "rowid" else rows[-1][spec["pk"]]
        save_state(state)
        done = tstate["pushed"]
        if done and done % 1000 < len(rows):
            print(f"[{table}] {done:,} pushed (checkpoint {spec['pk']}={tstate['after']})")

    save_state(state)
    print(f"[{table}] done: {tstate['pushed']:,} pushed, {len(tstate['failed'])} failed")


def retry_failed(kb: KbClient, db: sqlite3.Connection, state: dict) -> None:
    for table, spec in TABLES.items():
        tstate = state["tables"].get(table)
        if not tstate or not tstate["failed"]:
            continue
        slugs = list(tstate["failed"])
        print(f"[{table}] retrying {len(slugs)} failed")
        for slug in slugs:
            pk_val = int(slug.rsplit("-", 1)[1])
            if spec["pk"] == "rowid":
                row = db.execute(
                    f"SELECT rowid, * FROM {table} WHERE rowid = ?", (pk_val,)
                ).fetchone()
            else:
                row = db.execute(
                    f"SELECT * FROM {table} WHERE {spec['pk']} = ?", (pk_val,)
                ).fetchone()
            if row is None:
                tstate["failed"].pop(slug)
                continue
            _, err = _push_one(kb, spec["map"](row))
            if err is None:
                tstate["pushed"] += 1
                tstate["failed"].pop(slug)
            else:
                tstate["failed"][slug] = err
        save_state(state)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tables", default="speeches",
                        help="comma-separated: speeches,legal_documents,news_articles")
    parser.add_argument("--limit", type=int, default=SAFETY_LIMIT,
                        help=f"max rows per table this run (default {SAFETY_LIMIT})")
    parser.add_argument("--full", action="store_true",
                        help="lift the safety cap and sync everything remaining")
    parser.add_argument("--dry-run", action="store_true",
                        help="map and print, push nothing")
    parser.add_argument("--retry-failed", action="store_true",
                        help="re-attempt previously failed resources, then exit")
    parser.add_argument("--since", default=DEFAULT_SINCE,
                        help=f"speech date cutoff (default {DEFAULT_SINCE}: the 1993 "
                             "election — no data predating any current federal MP)")
    parser.add_argument("--db", default=str(DB_PATH))
    args = parser.parse_args()

    load_dotenv()
    cfg = AragConfig.from_env()
    if not args.dry_run and not cfg.kb_configured:
        sys.exit("ARAG_KB_ID / ARAG_KB_TOKEN not set — run scripts/arag_provision.py create")

    limit = 10**12 if args.full else args.limit
    if not args.full and args.limit > SAFETY_LIMIT:
        sys.exit(f"--limit above {SAFETY_LIMIT} needs --full (cost guard: a full corpus "
                 f"push processes ~13.6 GB of text — see MIGRATION-ARAG.md §Costs)")

    db = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    kb = None if args.dry_run else KbClient(cfg)
    state = load_state()

    if args.retry_failed:
        retry_failed(kb, db, state)
        return

    t0 = time.time()
    for table in args.tables.split(","):
        table = table.strip()
        if table not in TABLES:
            sys.exit(f"Unknown table {table!r} (choose from {', '.join(TABLES)})")
        sync_table(kb, db, table, TABLES[table], state, limit, args.dry_run, args.since)
    print(f"Elapsed {time.time() - t0:.0f}s. State: {STATE_PATH}")


if __name__ == "__main__":
    main()
