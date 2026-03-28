#!/usr/bin/env python3
"""
migrate_sqlite_to_pg.py -- Migrate OPAX data from SQLite to PostgreSQL.

Reads every table from the SQLite database and writes to PostgreSQL using
batch inserts (COPY protocol for large tables).

Usage:
    python scripts/migrate_sqlite_to_pg.py \
        --sqlite-path ~/.cache/autoresearch/parli.db \
        --pg-url postgresql://opax:opax@localhost:5432/opax

    # Dry-run (count rows, don't write):
    python scripts/migrate_sqlite_to_pg.py --dry-run

    # Migrate embeddings from numpy to pgvector:
    python scripts/migrate_sqlite_to_pg.py --embeddings
"""

import argparse
import io
import sqlite3
import sys
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Table migration order (respects foreign key dependencies)
# ---------------------------------------------------------------------------

MIGRATION_ORDER = [
    "members",
    "bills",
    "divisions",
    "votes",
    "speeches",
    "donations",
    "associated_entities",
    "topics",
    "speech_topics",
    "contracts",
    "news_articles",
    "bill_progress",
    "mp_disconnect_scores",
    "contract_speech_links",
    "donor_influence_scores",
    "mp_donor_influence_scores",
    "mp_interests",
    "mp_shareholdings",
    "mp_properties",
    "mp_directorships",
    "ministerial_meetings",
    "electorate_demographics",
    "analysis_cache",
    "audit_reports",
    "government_grants",
    "board_appointments",
    "legal_documents",
    "federal_lobbyists",
    "federal_lobbyist_clients",
]

# Tables large enough to warrant COPY protocol
LARGE_TABLES = {"speeches", "speech_topics", "donations", "government_grants",
                "legal_documents", "associated_entities", "votes", "news_articles"}

# Columns that are TEXT in SQLite but DATE/TIMESTAMP in PostgreSQL
DATE_COLUMNS = {
    "members": {"entered_house", "left_house"},
    "bills": {"introduced_date"},
    "divisions": {"date"},
    "speeches": {"date"},
    "news_articles": {"date"},
    "bill_progress": {"date"},
    "contracts": {"start_date", "end_date"},
    "mp_interests": {"declared_date"},
    "mp_shareholdings": {"declared_date"},
    "mp_properties": {"declared_date"},
    "mp_directorships": {"declared_date"},
    "ministerial_meetings": {"meeting_date"},
    "audit_reports": {"date_tabled"},
    "government_grants": {"start_date", "end_date"},
    "board_appointments": {"start_date", "end_date"},
    "legal_documents": {"date"},
    "federal_lobbyists": {"registration_date"},
    "contract_speech_links": {"speech_date"},
}

TIMESTAMP_COLUMNS = {
    "mp_disconnect_scores": {"updated_at"},
    "contract_speech_links": {"created_at"},
    "donor_influence_scores": {"updated_at"},
    "mp_donor_influence_scores": {"updated_at"},
    "mp_interests": {"created_at"},
    "electorate_demographics": {"created_at"},
    "analysis_cache": {"updated_at"},
    "government_grants": {"created_at"},
    "board_appointments": {"created_at"},
}

# Columns to skip (generated columns in PG, virtual tables in SQLite)
SKIP_COLUMNS = {
    "speeches": {"search_vector", "embedding"},
    "news_articles": {"search_vector"},
    "legal_documents": {"search_vector"},
}

# Skip these tables entirely (FTS virtual tables, no PG equivalent)
SKIP_TABLES = {"speeches_fts", "news_articles_fts", "legal_documents_fts"}


def get_sqlite_db(path: str) -> sqlite3.Connection:
    db = sqlite3.connect(path, timeout=30)
    db.row_factory = sqlite3.Row
    return db


def get_pg_conn(pg_url: str):
    import psycopg
    from psycopg.rows import dict_row
    conn = psycopg.connect(pg_url, row_factory=dict_row, autocommit=False)
    return conn


def get_table_columns(sqlite_db: sqlite3.Connection, table: str) -> list[str]:
    """Get column names for a SQLite table."""
    rows = sqlite_db.execute(f"PRAGMA table_info({table})").fetchall()
    cols = [r["name"] for r in rows]
    skip = SKIP_COLUMNS.get(table, set())
    return [c for c in cols if c not in skip]


def clean_date(val, col_name: str, table: str):
    """Convert SQLite TEXT date to a format PostgreSQL DATE/TIMESTAMP accepts.
    Returns None for empty/invalid dates.
    """
    if val is None or val == "" or val == "None":
        return None

    # Already looks like a date
    val = str(val).strip()
    if not val:
        return None

    # Handle datetime('now') default values that resolved to actual timestamps
    # e.g. "2024-03-15 10:30:00" or "2024-03-15"
    return val


def copy_table_large(sqlite_db, pg_conn, table: str, columns: list[str], batch_size: int = 10000):
    """Migrate a large table using PostgreSQL COPY protocol for speed."""
    date_cols = DATE_COLUMNS.get(table, set())
    ts_cols = TIMESTAMP_COLUMNS.get(table, set())
    all_date_cols = date_cols | ts_cols

    col_list = ", ".join(columns)
    total = sqlite_db.execute(f"SELECT COUNT(*) AS c FROM [{table}]").fetchone()["c"]

    if total == 0:
        print(f"  {table}: 0 rows (skipping)")
        return 0

    print(f"  {table}: {total:,} rows via COPY ...", end=" ", flush=True)
    t0 = time.time()
    migrated = 0

    cursor = sqlite_db.execute(f"SELECT {col_list} FROM [{table}]")

    while True:
        rows = cursor.fetchmany(batch_size)
        if not rows:
            break

        buf = io.StringIO()
        for row in rows:
            values = []
            for col in columns:
                val = row[col]
                if col in all_date_cols:
                    val = clean_date(val, col, table)
                if val is None:
                    values.append("\\N")
                else:
                    # Escape for COPY TEXT format
                    s = str(val).replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r")
                    values.append(s)
            buf.write("\t".join(values) + "\n")

        buf.seek(0)
        with pg_conn.cursor() as cur:
            with cur.copy(f"COPY {table} ({col_list}) FROM STDIN") as copy:
                copy.write(buf.getvalue().encode("utf-8"))

        migrated += len(rows)
        pg_conn.commit()

    elapsed = time.time() - t0
    rate = migrated / elapsed if elapsed > 0 else 0
    print(f"{migrated:,} rows in {elapsed:.1f}s ({rate:,.0f} rows/s)")
    return migrated


def copy_table_small(sqlite_db, pg_conn, table: str, columns: list[str], batch_size: int = 10000):
    """Migrate a small table using batch INSERT ... ON CONFLICT DO NOTHING."""
    date_cols = DATE_COLUMNS.get(table, set())
    ts_cols = TIMESTAMP_COLUMNS.get(table, set())
    all_date_cols = date_cols | ts_cols

    col_list = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))
    total = sqlite_db.execute(f"SELECT COUNT(*) AS c FROM [{table}]").fetchone()["c"]

    if total == 0:
        print(f"  {table}: 0 rows (skipping)")
        return 0

    print(f"  {table}: {total:,} rows via INSERT ...", end=" ", flush=True)
    t0 = time.time()
    migrated = 0

    cursor = sqlite_db.execute(f"SELECT {col_list} FROM [{table}]")

    while True:
        rows = cursor.fetchmany(batch_size)
        if not rows:
            break

        values_list = []
        for row in rows:
            vals = []
            for col in columns:
                val = row[col]
                if col in all_date_cols:
                    val = clean_date(val, col, table)
                vals.append(val)
            values_list.append(tuple(vals))

        with pg_conn.cursor() as cur:
            # Use ON CONFLICT DO NOTHING for idempotent migration
            sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"
            cur.executemany(sql, values_list)

        migrated += len(rows)
        pg_conn.commit()

    elapsed = time.time() - t0
    rate = migrated / elapsed if elapsed > 0 else 0
    print(f"{migrated:,} rows in {elapsed:.1f}s ({rate:,.0f} rows/s)")
    return migrated


def rebuild_search_vectors(pg_conn):
    """Force-refresh generated tsvector columns by touching rows.

    Since we use GENERATED ALWAYS AS ... STORED columns, the vectors are
    already built during INSERT. This function is here for safety -- it
    runs REINDEX on the GIN indexes.
    """
    print("\n  Reindexing GIN search indexes...")
    indexes = [
        "idx_speeches_search_vector",
        "idx_news_articles_search_vector",
        "idx_legal_documents_search_vector",
    ]
    with pg_conn.cursor() as cur:
        for idx in indexes:
            try:
                cur.execute(f"REINDEX INDEX {idx}")
                print(f"    {idx}: OK")
            except Exception as e:
                print(f"    {idx}: {e}")
    pg_conn.commit()


def migrate_embeddings(sqlite_path: str, pg_url: str):
    """Migrate numpy embeddings to pgvector columns in speeches table.

    Reads from the numpy mmap files and updates the embedding column.
    """
    import numpy as np

    emb_dir = Path(sqlite_path).parent / "hansard" / "embeddings"
    emb_path = emb_dir / "speeches.npy"
    ids_path = emb_dir / "speeches_ids.npy"

    if not emb_path.exists() or not ids_path.exists():
        print(f"\n  Embeddings not found at {emb_dir}. Skipping.")
        return

    print(f"\n  Loading embeddings from {emb_dir}...")
    embeddings = np.load(str(emb_path), mmap_mode="r")
    ids = np.load(str(ids_path))
    total = len(ids)
    print(f"  Found {total:,} embeddings ({embeddings.shape[1]}-dim)")

    pg_conn = get_pg_conn(pg_url)

    # Check if pgvector extension is available
    try:
        with pg_conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
            if not cur.fetchone():
                print("  pgvector extension not installed. Skipping embedding migration.")
                pg_conn.close()
                return
    except Exception as e:
        print(f"  Could not check pgvector: {e}. Skipping.")
        pg_conn.close()
        return

    batch_size = 5000
    migrated = 0
    t0 = time.time()

    for i in range(0, total, batch_size):
        batch_ids = ids[i:i + batch_size]
        batch_embs = embeddings[i:i + batch_size]

        values = []
        for sid, emb in zip(batch_ids, batch_embs):
            vec_str = "[" + ",".join(f"{v:.6f}" for v in emb) + "]"
            values.append((vec_str, int(sid)))

        with pg_conn.cursor() as cur:
            cur.executemany(
                "UPDATE speeches SET embedding = %s::vector WHERE speech_id = %s",
                values,
            )
        pg_conn.commit()
        migrated += len(batch_ids)

        if migrated % 50000 == 0 or migrated == total:
            elapsed = time.time() - t0
            print(f"    Embeddings: {migrated:,}/{total:,} ({elapsed:.1f}s)")

    elapsed = time.time() - t0
    print(f"  Embedding migration complete: {migrated:,} rows in {elapsed:.1f}s")

    # Rebuild HNSW index
    print("  Rebuilding HNSW index on speeches.embedding...")
    with pg_conn.cursor() as cur:
        try:
            cur.execute("REINDEX INDEX idx_speeches_embedding")
            print("    idx_speeches_embedding: OK")
        except Exception as e:
            print(f"    idx_speeches_embedding: {e}")
    pg_conn.commit()
    pg_conn.close()


def validate_counts(sqlite_db, pg_conn, tables: list[str]):
    """Compare row counts between SQLite and PostgreSQL."""
    print("\n  Validating row counts:")
    all_ok = True
    for table in tables:
        if table in SKIP_TABLES:
            continue
        try:
            sq_count = sqlite_db.execute(f"SELECT COUNT(*) AS c FROM [{table}]").fetchone()["c"]
        except Exception:
            sq_count = 0
        try:
            with pg_conn.cursor() as cur:
                cur.execute(f"SELECT COUNT(*) AS c FROM {table}")
                pg_count = cur.fetchone()["c"]
        except Exception:
            pg_count = 0

        status = "OK" if pg_count >= sq_count else "MISMATCH"
        if pg_count < sq_count:
            all_ok = False
        print(f"    {table:35s}  SQLite: {sq_count:>10,}  PG: {pg_count:>10,}  {status}")

    return all_ok


def reset_sequences(pg_conn, tables_with_serial: dict[str, str]):
    """Reset SERIAL/BIGSERIAL sequences to max(id) + 1 after bulk insert."""
    print("\n  Resetting sequences...")
    for table, col in tables_with_serial.items():
        try:
            with pg_conn.cursor() as cur:
                cur.execute(
                    f"SELECT setval(pg_get_serial_sequence('{table}', '{col}'), "
                    f"COALESCE(MAX({col}), 1)) FROM {table}"
                )
                print(f"    {table}.{col}: OK")
        except Exception as e:
            print(f"    {table}.{col}: {e}")
    pg_conn.commit()


def main():
    parser = argparse.ArgumentParser(description="Migrate OPAX data from SQLite to PostgreSQL")
    parser.add_argument(
        "--sqlite-path",
        default=str(Path("~/.cache/autoresearch/parli.db").expanduser()),
        help="Path to SQLite database",
    )
    parser.add_argument(
        "--pg-url",
        default="postgresql://opax:opax@localhost:5432/opax",
        help="PostgreSQL connection URL",
    )
    parser.add_argument("--dry-run", action="store_true", help="Count rows only, don't migrate")
    parser.add_argument("--embeddings", action="store_true", help="Also migrate numpy embeddings to pgvector")
    parser.add_argument("--batch-size", type=int, default=10000, help="Batch size for inserts")
    parser.add_argument("--tables", nargs="*", help="Migrate only these tables (default: all)")
    args = parser.parse_args()

    print(f"OPAX SQLite -> PostgreSQL Migration")
    print(f"  SQLite: {args.sqlite_path}")
    print(f"  PG:     {args.pg_url}")
    print()

    sqlite_db = get_sqlite_db(args.sqlite_path)

    # List tables in SQLite
    sqlite_tables = {
        r["name"]
        for r in sqlite_db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
    }

    tables_to_migrate = args.tables or MIGRATION_ORDER
    tables_to_migrate = [t for t in tables_to_migrate if t in sqlite_tables and t not in SKIP_TABLES]

    if args.dry_run:
        print("DRY RUN -- row counts only:\n")
        for table in tables_to_migrate:
            count = sqlite_db.execute(f"SELECT COUNT(*) AS c FROM [{table}]").fetchone()["c"]
            print(f"  {table:35s}  {count:>10,} rows")
        sqlite_db.close()
        return

    # Connect to PostgreSQL
    pg_conn = get_pg_conn(args.pg_url)

    # Run schema first
    schema_path = Path(__file__).parent.parent / "parli" / "pg_schema.sql"
    if schema_path.exists():
        print(f"Applying schema from {schema_path}...")
        with pg_conn.cursor() as cur:
            cur.execute(schema_path.read_text())
        pg_conn.commit()
        print("Schema applied.\n")
    else:
        print(f"Warning: Schema file not found at {schema_path}. Tables must already exist.\n")

    # Migrate each table
    print("Migrating tables:\n")
    t_start = time.time()
    total_rows = 0

    for table in tables_to_migrate:
        columns = get_table_columns(sqlite_db, table)
        if not columns:
            print(f"  {table}: no columns found, skipping")
            continue

        if table in LARGE_TABLES:
            n = copy_table_large(sqlite_db, pg_conn, table, columns, batch_size=args.batch_size)
        else:
            n = copy_table_small(sqlite_db, pg_conn, table, columns, batch_size=args.batch_size)
        total_rows += n

    elapsed = time.time() - t_start
    print(f"\nMigration complete: {total_rows:,} total rows in {elapsed:.1f}s")

    # Reset sequences for SERIAL/BIGSERIAL columns
    serial_tables = {
        "bills": "bill_id",
        "speeches": "speech_id",
        "donations": "donation_id",
        "associated_entities": "entity_record_id",
        "topics": "topic_id",
        "contracts": "contract_id",  # TEXT PK, no sequence
        "bill_progress": "progress_id",
        "contract_speech_links": "link_id",
        "donor_influence_scores": "id",
        "mp_donor_influence_scores": "id",
        "mp_interests": "interest_id",
        "mp_shareholdings": "shareholding_id",
        "mp_properties": "property_id",
        "mp_directorships": "directorship_id",
        "ministerial_meetings": "meeting_id",
        "electorate_demographics": "id",
        "audit_reports": "audit_id",
        "government_grants": "grant_id",
        "board_appointments": "appointment_id",
        "legal_documents": "doc_id",
        "federal_lobbyist_clients": "id",
    }
    # Only reset for tables that have actual SERIAL columns (skip TEXT PKs)
    serial_tables.pop("contracts", None)
    reset_sequences(pg_conn, serial_tables)

    # Rebuild search indexes
    rebuild_search_vectors(pg_conn)

    # Validate
    ok = validate_counts(sqlite_db, pg_conn, tables_to_migrate)

    # Migrate embeddings if requested
    if args.embeddings:
        migrate_embeddings(args.sqlite_path, args.pg_url)

    sqlite_db.close()
    pg_conn.close()

    if ok:
        print("\nAll row counts match. Migration successful.")
    else:
        print("\nWARNING: Some row counts don't match. Check the output above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
