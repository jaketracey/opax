"""Populate derived speech-hygiene fields without overwriting source evidence.

Back up ``parli.db`` before running with ``--apply``. The default is a read-only
plan that prints the exact affected-row and per-rule counts.

    python3 -m parli.ingest.speech_repair --db ~/.cache/autoresearch/parli.db
    python3 -m parli.ingest.speech_repair --db ~/.cache/autoresearch/parli.db --apply
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterator

from parli.ingest.speech_hygiene import (
    clean_party,
    clean_speaker_name,
    clean_speech_text_with_rules,
)


DERIVED_COLUMNS = {
    "text_clean": "TEXT",
    "text_clean_rules": "TEXT",
    "speaker_name_clean": "TEXT",
    "party_canonical": "TEXT",
}


def table_columns(db: sqlite3.Connection) -> set[str]:
    return {row[1] for row in db.execute("PRAGMA table_info(speeches)")}


def ensure_columns(db: sqlite3.Connection) -> list[str]:
    existing = table_columns(db)
    added: list[str] = []
    for name, sql_type in DERIVED_COLUMNS.items():
        if name not in existing:
            db.execute(f"ALTER TABLE speeches ADD COLUMN {name} {sql_type}")
            added.append(name)
    return added


def batches(cursor: sqlite3.Cursor, size: int) -> Iterator[list[sqlite3.Row]]:
    while True:
        rows = cursor.fetchmany(size)
        if not rows:
            return
        yield rows


def desired_values(row: sqlite3.Row) -> tuple[str | None, str | None, str | None, str | None, tuple[str, ...]]:
    cleaned = clean_speech_text_with_rules(
        row["text"], row["source"] or "", row["topic"], row["speaker_name"]
    )
    text_clean = cleaned.text if cleaned.text != row["text"] else None
    rules = ",".join(cleaned.rules) if text_clean is not None else None
    speaker = clean_speaker_name(row["speaker_name"])
    party = clean_party(row["party"])
    return text_clean, rules, speaker, party, cleaned.rules


def repair(db_path: Path, *, apply: bool, batch_size: int, limit: int | None) -> dict[str, Any]:
    if apply:
        db = sqlite3.connect(str(db_path))
        added = ensure_columns(db)
        db.commit()
    else:
        db = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        added = []
    db.row_factory = sqlite3.Row
    existing = table_columns(db)

    selected = [
        "speech_id", "speaker_name", "party", "source", "topic", "text",
        *(name for name in DERIVED_COLUMNS if name in existing),
    ]
    sql = f"SELECT {', '.join(selected)} FROM speeches ORDER BY speech_id"
    params: tuple[Any, ...] = ()
    if limit is not None:
        sql += " LIMIT ?"
        params = (limit,)

    counts: Counter[str] = Counter()
    rule_counts: Counter[str] = Counter()
    text_by_source: Counter[str] = Counter()
    examples: dict[str, int] = {}
    t0 = time.time()

    cursor = db.execute(sql, params)
    for rows in batches(cursor, batch_size):
        updates: list[tuple[Any, ...]] = []
        for row in rows:
            counts["scanned"] += 1
            text_clean, rules, speaker, party, applied_rules = desired_values(row)
            for rule in applied_rules:
                rule_counts[rule] += 1
                examples.setdefault(rule, row["speech_id"])
            if text_clean is not None:
                counts["text_changed"] += 1
                text_by_source[row["source"] or "(missing)"] += 1
            if speaker is not None:
                counts["speaker_name_clean_nonnull"] += 1
            if party is not None:
                counts["party_canonical_nonnull"] += 1
            if "\ufffd" in row["text"]:
                counts["irrecoverable_replacement_character"] += 1

            current = tuple(row[name] if name in row.keys() else None for name in DERIVED_COLUMNS)
            wanted = (text_clean, rules, speaker, party)
            if current != wanted:
                counts["rows_needing_update"] += 1
                if apply:
                    updates.append((*wanted, row["speech_id"]))

        if apply and updates:
            db.executemany(
                """UPDATE speeches
                      SET text_clean=?, text_clean_rules=?,
                          speaker_name_clean=?, party_canonical=?
                    WHERE speech_id=?""",
                updates,
            )
            db.commit()
            counts["rows_updated"] += len(updates)
        if counts["scanned"] % 100_000 < len(rows):
            print(
                f"[speech-repair] {counts['scanned']:,} scanned; "
                f"{counts['text_changed']:,} text changes; "
                f"{counts['rows_needing_update']:,} derived-row changes",
                file=sys.stderr,
            )

    result = {
        "mode": "apply" if apply else "plan",
        "database": str(db_path),
        "columns_added": added,
        "counts": dict(counts),
        "text_changed_by_source": dict(sorted(text_by_source.items())),
        "rule_counts": dict(sorted(rule_counts.items())),
        "rule_example_speech_ids": dict(sorted(examples.items())),
        "elapsed_seconds": round(time.time() - t0, 3),
    }
    db.close()
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default="~/.cache/autoresearch/parli.db")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--batch-size", type=int, default=2_000)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    if args.apply and args.limit:
        parser.error("--limit is plan/test-only; an applied migration must cover the whole table")
    result = repair(
        Path(args.db).expanduser(),
        apply=args.apply,
        batch_size=args.batch_size,
        limit=args.limit,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
