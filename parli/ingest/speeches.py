"""
parli.ingest.speeches -- Load Hansard speeches into the parli database.

Data sources:
  1. Zenodo Parquet historical corpus
     (~/.cache/autoresearch/hansard/hansard-corpus.zip)
  2. Modern JSONL files from download_hansard.py
     (~/.cache/autoresearch/hansard/modern/*.jsonl)

For each speech, inserts into the speeches table with word_count calculated.
Skips very short speeches (<50 chars). Strips HTML tags.
Deduplicates by (speaker_name, date, text hash).

Usage:
    python -m parli.ingest.speeches                # load all available data
    python -m parli.ingest.speeches --modern-only   # skip historical Zenodo data
    python -m parli.ingest.speeches --since 2024-01-01  # only speeches after date
"""

import glob
import hashlib
import json
import os
import re
import zipfile
from io import BytesIO
from pathlib import Path

import pyarrow.parquet as pq

from parli.schema import get_db, init_db

CACHE_DIR = Path("~/.cache/autoresearch/hansard").expanduser()
MODERN_DIR = CACHE_DIR / "modern"
ZENODO_ZIP = CACHE_DIR / "hansard-corpus.zip"

HTML_TAG_RE = re.compile(r"<[^>]+>")
MULTI_SPACE_RE = re.compile(r"[ \t]+")

BATCH_SIZE = 1000


def clean_text(text: str) -> str | None:
    """Strip HTML, collapse whitespace. Return None if too short (<50 chars)."""
    text = HTML_TAG_RE.sub("", text)
    text = MULTI_SPACE_RE.sub(" ", text).strip()
    if len(text) < 50:
        return None
    return text


def text_hash(text: str) -> str:
    """Return a short SHA-256 hex digest for deduplication."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def load_zenodo_parquet(db, seen: set[str]) -> int:
    """Load speeches from Zenodo historical corpus. Returns count inserted."""
    if not ZENODO_ZIP.exists():
        print(f"  Zenodo zip not found: {ZENODO_ZIP}")
        return 0

    count = 0
    pending = 0
    with zipfile.ZipFile(str(ZENODO_ZIP), "r") as zf:
        parquet_names = [n for n in zf.namelist() if n.endswith(".parquet")]
        print(f"  Found {len(parquet_names)} parquet file(s) in zip")
        for pq_name in sorted(parquet_names):
            print(f"  Processing {pq_name}...")
            with zf.open(pq_name) as f:
                data = f.read()
            table = pq.read_table(BytesIO(data))
            columns = table.column_names

            # Detect columns -- the corpus uses "body" for speech text
            text_col = next(
                (c for c in ["body", "speech", "text", "speech_text"]
                 if c in columns),
                None,
            )
            if not text_col:
                print(f"    No text column found in {pq_name}, skipping")
                continue

            speaker_col = next(
                (c for c in ["name", "speaker", "speaker_name"] if c in columns),
                None,
            )
            party_col = next(
                (c for c in ["party", "party_name", "party_abbrev"] if c in columns),
                None,
            )
            electorate_col = next(
                (c for c in ["electorate", "constituency"] if c in columns),
                None,
            )
            date_col = next(
                (c for c in ["date", "speech_date", "sitting_date"] if c in columns),
                None,
            )
            chamber_col = next(
                (c for c in ["chamber", "house"] if c in columns),
                None,
            )

            for i in range(len(table)):
                raw = table.column(text_col)[i].as_py()
                if not raw:
                    continue
                text = clean_text(raw)
                if not text:
                    continue

                speaker = (
                    table.column(speaker_col)[i].as_py() if speaker_col else None
                ) or ""
                party = (
                    table.column(party_col)[i].as_py() if party_col else None
                ) or ""
                electorate = (
                    table.column(electorate_col)[i].as_py() if electorate_col else None
                ) or ""
                speech_date = (
                    str(table.column(date_col)[i].as_py()) if date_col else "1901-01-01"
                )
                chamber = (
                    table.column(chamber_col)[i].as_py() if chamber_col else ""
                ) or ""
                chamber = chamber.lower().strip()
                if chamber not in ("representatives", "senate"):
                    chamber = "representatives"

                # Deduplicate
                dedup_key = f"{speaker}|{speech_date}|{text_hash(text)}"
                if dedup_key in seen:
                    continue
                seen.add(dedup_key)

                word_count = len(text.split())

                db.execute(
                    """
                    INSERT INTO speeches
                    (person_id, speaker_name, party, electorate, chamber,
                     date, topic, text, word_count, source)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        None,
                        speaker,
                        party,
                        electorate,
                        chamber,
                        speech_date,
                        None,
                        text,
                        word_count,
                        "zenodo",
                    ),
                )
                count += 1
                pending += 1

                if pending >= BATCH_SIZE:
                    db.commit()
                    pending = 0
                    print(f"    ... {count} speeches loaded")

    db.commit()
    return count


def load_modern_jsonl(db, seen: set[str], since: str | None = None) -> int:
    """Load speeches from modern JSONL files. Returns count inserted."""
    if not MODERN_DIR.exists():
        print(f"  Modern dir not found: {MODERN_DIR}")
        return 0

    files = sorted(glob.glob(str(MODERN_DIR / "*.jsonl")))
    if not files:
        print(f"  No JSONL files in {MODERN_DIR}")
        return 0

    count = 0
    pending = 0
    for filepath in files:
        filename = os.path.basename(filepath)
        # filename format: YYYY-MM-DD_chamber.jsonl
        parts = filename.replace(".jsonl", "").split("_", 1)
        if len(parts) != 2:
            continue
        file_date, chamber = parts

        if since and file_date < since:
            continue

        chamber = chamber.lower().strip()
        if chamber not in ("representatives", "senate"):
            chamber = "representatives"

        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue

                raw_text = record.get("text", "")
                text = clean_text(raw_text)
                if not text:
                    continue

                speaker = record.get("speaker", "") or ""
                party = record.get("party", "") or ""
                electorate = record.get("electorate", "") or ""
                topic = record.get("topic", "") or ""

                # Deduplicate
                dedup_key = f"{speaker}|{file_date}|{text_hash(text)}"
                if dedup_key in seen:
                    continue
                seen.add(dedup_key)

                word_count = len(text.split())

                db.execute(
                    """
                    INSERT INTO speeches
                    (person_id, speaker_name, party, electorate, chamber,
                     date, topic, text, word_count, source)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        None,
                        speaker,
                        party,
                        electorate,
                        chamber,
                        file_date,
                        topic if topic else None,
                        text,
                        word_count,
                        "openaustralia",
                    ),
                )
                count += 1
                pending += 1

                if pending >= BATCH_SIZE:
                    db.commit()
                    pending = 0
                    print(f"    ... {count} speeches loaded")

    db.commit()
    return count


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Load Hansard speeches into the parli database."
    )
    parser.add_argument("--modern-only", action="store_true",
                        help="Skip historical Zenodo data")
    parser.add_argument("--since", type=str, default=None,
                        help="Only load speeches after this date (YYYY-MM-DD)")
    args = parser.parse_args()

    db = get_db()
    init_db(db)

    # Build dedup set from existing speeches
    print("Building deduplication index from existing speeches...")
    seen: set[str] = set()
    rows = db.execute(
        "SELECT speaker_name, date, text FROM speeches"
    ).fetchall()
    for row in rows:
        key = f"{row['speaker_name'] or ''}|{row['date']}|{text_hash(row['text'])}"
        seen.add(key)
    print(f"  {len(seen)} existing speeches indexed")

    if not args.modern_only:
        print("\nLoading Zenodo historical speeches...")
        n_zenodo = load_zenodo_parquet(db, seen)
        print(f"  Loaded {n_zenodo} historical speeches")

    print("\nLoading modern JSONL speeches...")
    n_modern = load_modern_jsonl(db, seen, since=args.since)
    print(f"  Loaded {n_modern} modern speeches")

    total = db.execute("SELECT COUNT(*) FROM speeches").fetchone()[0]
    print(f"\nTotal speeches in DB: {total}")

    # Rebuild FTS5 index so full-text search works correctly
    print("\nRebuilding FTS5 index...")
    db.execute("INSERT INTO speeches_fts(speeches_fts) VALUES('rebuild')")
    db.commit()
    fts_count = db.execute(
        "SELECT COUNT(*) FROM speeches_fts WHERE speeches_fts MATCH '\"the\"'"
    ).fetchone()[0]
    print(f"  FTS5 index rebuilt ({fts_count} entries match test query)")


if __name__ == "__main__":
    main()
