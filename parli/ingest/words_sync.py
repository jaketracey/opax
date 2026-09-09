"""Audit and publish licence-clean external statements to the OPAX knowledge box.

The acquisition fetchers write ``ext_press_releases`` with stable natural keys.
This module applies the public-corpus gates, removes exact duplicate bodies, and
maps accepted rows through ``map_press_release`` before creating KB resources.
It is dry-run by default and never starts enrichment tasks.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse

from parli.arag import AragConfig, AragError, KbClient, load_dotenv
from parli.ingest.words_press_releases import SOURCES, map_press_release


MIN_BODY_CHARS = 200
SAFETY_LIMIT = 100
SOURCE_HOSTS = {
    "pmtranscripts": "pmtranscripts.pmc.gov.au",
    "nsw": "www.nsw.gov.au",
    "qld": "statements.qld.gov.au",
    "vic": "www.premier.vic.gov.au",
    "treasury": "ministers.treasury.gov.au",
}


def _body_key(text: str) -> str:
    clean = re.sub(r"\s+", " ", text).strip().casefold()
    return hashlib.sha256(clean.encode()).hexdigest()


def _has_disallowed_control(text: str) -> bool:
    return any(unicodedata.category(char) == "Cc" and char not in "\t\n\r" for char in text)


def audit_rows(rows: Iterable[sqlite3.Row], *, since: str) -> tuple[list[sqlite3.Row], dict]:
    accepted: list[sqlite3.Row] = []
    rejected: dict[str, int] = {}
    bodies: set[str] = set()
    today = date.today().isoformat()

    def reject(reason: str) -> None:
        rejected[reason] = rejected.get(reason, 0) + 1

    for row in rows:
        source = row["source"] or ""
        body = row["body_text"] or ""
        when = row["date"] or ""
        parsed = urlparse(row["url"] or "")
        if source not in SOURCES:
            reject("unknown_source")
        elif len(body.strip()) < MIN_BODY_CHARS:
            reject("short_body")
        elif not re.fullmatch(r"\d{4}-\d{2}-\d{2}", when) or when < since or when > today:
            reject("invalid_date")
        elif parsed.scheme != "https" or parsed.hostname != SOURCE_HOSTS[source]:
            reject("invalid_source_url")
        elif not (row["licence"] or "").startswith("CC BY 4.0"):
            reject("licence_not_public")
        elif _has_disallowed_control(body):
            reject("control_character")
        else:
            key = _body_key(body)
            if key in bodies:
                reject("duplicate_body")
                continue
            bodies.add(key)
            accepted.append(row)
    return accepted, rejected


def select_rows(rows: Iterable[sqlite3.Row], *, after_rowid: int, limit: int) -> list[sqlite3.Row]:
    return [row for row in rows if row["rowid"] > after_rowid][:limit]


def _create(kb: KbClient, row: sqlite3.Row) -> tuple[str, str | None]:
    body = map_press_release(row)
    try:
        kb.create_resource(body)
        return "created", None
    except AragError as exc:
        if exc.status == 409:
            return "existing", None
        return "failed", f"{exc.status}: {exc.detail[:160]}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True)
    parser.add_argument("--source", choices=sorted(SOURCES), required=True)
    parser.add_argument("--since", default="1993-03-13")
    parser.add_argument("--limit", type=int, default=SAFETY_LIMIT)
    parser.add_argument("--after-rowid", type=int, default=0, help="resume after this source-table rowid")
    parser.add_argument("--full", action="store_true", help="allow more than 100 accepted rows")
    parser.add_argument("--apply", action="store_true", help="create accepted resources; default is audit only")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("--limit must be positive")
    if args.limit > SAFETY_LIMIT and not args.full:
        parser.error(f"--limit above {SAFETY_LIMIT} requires --full")

    db_path = Path(args.db).expanduser()
    db = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    rows = db.execute(
        "SELECT rowid, * FROM ext_press_releases WHERE source=? ORDER BY "
        "rowid",
        (args.source,),
    ).fetchall()
    accepted, rejected = audit_rows(rows, since=args.since)
    selected = select_rows(accepted, after_rowid=args.after_rowid, limit=args.limit)
    result = {
        "source": args.source,
        "examined": len(rows),
        "accepted": len(accepted),
        "selected": len(selected),
        "after_rowid": args.after_rowid,
        "next_after_rowid": max((row["rowid"] for row in selected), default=args.after_rowid),
        "rejected": rejected,
        "mode": "apply" if args.apply else "audit",
        "created": 0,
        "existing": 0,
        "failed": 0,
        "errors": [],
    }
    if args.apply:
        load_dotenv()
        cfg = AragConfig.from_env()
        if not cfg.kb_configured:
            sys.exit("ARAG_KB_ID / ARAG_KB_TOKEN not set")
        kb = KbClient(cfg)
        with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 8))) as pool:
            futures = [pool.submit(_create, kb, row) for row in selected]
            for completed, future in enumerate(as_completed(futures), 1):
                status, error = future.result()
                result[status] += 1
                if error and len(result["errors"]) < 20:
                    result["errors"].append(error)
                if completed % 250 == 0 or completed == len(futures):
                    print(
                        f"[{args.source}] {completed:,}/{len(futures):,}: "
                        f"created={result['created']:,} existing={result['existing']:,} "
                        f"failed={result['failed']:,}",
                        file=sys.stderr,
                        flush=True,
                    )
    print(json.dumps(result, indent=2, sort_keys=True))
    if result["failed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
