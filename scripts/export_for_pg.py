#!/usr/bin/env python3
"""Export SQLite tables as gzipped CSVs for PostgreSQL COPY import.

Usage:
    uv run python scripts/export_for_pg.py [--output /tmp/opax-export] [--tables speeches,votes]
"""

import csv
import gzip
import io
import os
import sqlite3
import sys
import time
import argparse
from pathlib import Path

DB_PATH = os.path.expanduser("~/.cache/autoresearch/parli.db")
DEFAULT_OUTPUT = "/tmp/opax-export"

# FTS shadow tables and internal tables to skip
SKIP_SUFFIXES = ("_fts", "_fts_config", "_fts_data", "_fts_docsize", "_fts_idx")
SKIP_TABLES = {"sqlite_sequence"}

# Batch size for reading rows
BATCH_SIZE = 50_000


def get_tables(db: sqlite3.Connection) -> list[tuple[str, int, list[str]]]:
    """Return list of (table_name, row_count, [col_names]) for exportable tables."""
    tables = db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).fetchall()

    result = []
    for (name,) in tables:
        # Skip FTS shadow tables
        if any(name.endswith(s) for s in SKIP_SUFFIXES):
            continue
        if name in SKIP_TABLES:
            continue

        count = db.execute(f"SELECT COUNT(*) FROM [{name}]").fetchone()[0]
        cols = db.execute(f"PRAGMA table_info([{name}])").fetchall()
        col_names = [c[1] for c in cols]
        result.append((name, count, col_names))

    return result


def export_table(
    db: sqlite3.Connection,
    table: str,
    col_names: list[str],
    row_count: int,
    output_dir: str,
) -> tuple[int, int]:
    """Export a single table to gzipped CSV. Returns (rows_written, compressed_bytes)."""
    out_path = os.path.join(output_dir, f"{table}.csv.gz")

    rows_written = 0
    t0 = time.time()

    with gzip.open(out_path, "wt", encoding="utf-8", compresslevel=6, newline="") as gz:
        writer = csv.writer(gz, quoting=csv.QUOTE_MINIMAL)
        # Header row
        writer.writerow(col_names)

        # Stream rows in batches using LIMIT/OFFSET for memory efficiency
        # For large tables, use rowid-based pagination if available
        cursor = db.execute(f"SELECT * FROM [{table}]")
        while True:
            rows = cursor.fetchmany(BATCH_SIZE)
            if not rows:
                break
            for row in rows:
                # Convert None to empty string for CSV (PostgreSQL COPY handles '' vs NULL via options)
                writer.writerow(["" if v is None else v for v in row])
            rows_written += len(rows)

            if row_count > 100_000:
                elapsed = time.time() - t0
                pct = rows_written / row_count * 100
                rate = rows_written / elapsed if elapsed > 0 else 0
                print(
                    f"  {table}: {rows_written:,}/{row_count:,} ({pct:.1f}%) - {rate:,.0f} rows/sec",
                    end="\r",
                    flush=True,
                )

    compressed_size = os.path.getsize(out_path)
    elapsed = time.time() - t0
    rate = rows_written / elapsed if elapsed > 0 else 0

    print(
        f"  {table}: {rows_written:,} rows -> {compressed_size / 1024 / 1024:.1f} MB "
        f"({elapsed:.1f}s, {rate:,.0f} rows/sec)"
        + " " * 20  # clear trailing chars from progress line
    )

    return rows_written, compressed_size


def main():
    parser = argparse.ArgumentParser(description="Export SQLite to gzipped CSVs for PostgreSQL")
    parser.add_argument("--output", "-o", default=DEFAULT_OUTPUT, help="Output directory")
    parser.add_argument("--tables", "-t", default=None, help="Comma-separated list of tables to export (default: all)")
    parser.add_argument("--db", default=DB_PATH, help="SQLite database path")
    args = parser.parse_args()

    output_dir = args.output
    os.makedirs(output_dir, exist_ok=True)

    print(f"Connecting to {args.db} ...")
    db = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    db.execute("PRAGMA busy_timeout = 600000")
    db.execute("PRAGMA cache_size = -256000")  # 256MB cache for faster reads

    all_tables = get_tables(db)

    if args.tables:
        filter_set = set(args.tables.split(","))
        all_tables = [(n, c, cols) for n, c, cols in all_tables if n in filter_set]
        missing = filter_set - {n for n, _, _ in all_tables}
        if missing:
            print(f"Warning: tables not found: {missing}")

    # Sort by row count descending (export biggest first for better progress visibility)
    all_tables.sort(key=lambda x: -x[1])

    total_rows = sum(c for _, c, _ in all_tables)
    print(f"\nExporting {len(all_tables)} tables ({total_rows:,} total rows) to {output_dir}/\n")

    grand_total_rows = 0
    grand_total_bytes = 0
    t_start = time.time()

    for table, count, col_names in all_tables:
        if count == 0:
            print(f"  {table}: 0 rows (skipped)")
            continue
        rows, size = export_table(db, table, col_names, count, output_dir)
        grand_total_rows += rows
        grand_total_bytes += size

    db.close()
    elapsed = time.time() - t_start

    print(f"\n{'='*60}")
    print(f"Export complete!")
    print(f"  Tables exported: {len([t for t, c, _ in all_tables if c > 0])}")
    print(f"  Total rows:      {grand_total_rows:,}")
    print(f"  Compressed size: {grand_total_bytes / 1024 / 1024:.1f} MB ({grand_total_bytes / 1024 / 1024 / 1024:.2f} GB)")
    print(f"  Time elapsed:    {elapsed:.1f}s")
    print(f"  Output dir:      {output_dir}/")

    # Also note embeddings
    emb_dir = os.path.expanduser("~/.cache/autoresearch/hansard/embeddings")
    if os.path.isdir(emb_dir):
        emb_files = []
        for f in os.listdir(emb_dir):
            fp = os.path.join(emb_dir, f)
            if os.path.isfile(fp):
                emb_files.append((f, os.path.getsize(fp)))
        if emb_files:
            print(f"\nEmbedding files at {emb_dir}/:")
            for name, size in sorted(emb_files):
                print(f"  {name}: {size / 1024 / 1024:.1f} MB")
            total_emb = sum(s for _, s in emb_files)
            print(f"  Total: {total_emb / 1024 / 1024:.1f} MB")
            print(f"\nTo compress embeddings for transfer:")
            print(f"  gzip -k {emb_dir}/speeches.npy")
            print(f"  # or tar: tar czf /tmp/opax-export/embeddings.tar.gz -C {emb_dir} .")


if __name__ == "__main__":
    main()
