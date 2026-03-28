"""
parli.ingest.legal_corpus — Download and ingest the Open Australian Legal Corpus
into the parli SQLite database.

Dataset: https://huggingface.co/datasets/umarbutler/open-australian-legal-corpus
Contains ~229,122 legal documents (legislation, court decisions, regulations)
from all Australian jurisdictions with 1.4 billion tokens.

Usage:
    # Full ingest
    python -m parli.ingest.legal_corpus

    # Test with a small subset
    python -m parli.ingest.legal_corpus --limit 1000

    # Skip download (use cached data)
    python -m parli.ingest.legal_corpus --skip-download

    # Custom database path
    python -m parli.ingest.legal_corpus --db /path/to/parli.db
"""

import argparse
import sqlite3
import sys
import time
from pathlib import Path

CACHE_DIR = Path("~/.cache/autoresearch/legal").expanduser()
HF_DATASET_ID = "umarbutler/open-australian-legal-corpus"

# Map dataset 'type' field to our doc_type schema
DOC_TYPE_MAP = {
    "primary_legislation": "legislation",
    "secondary_legislation": "regulation",
    "bill": "legislation",
    "decision": "court_decision",
}

# Map dataset 'jurisdiction' field to our lowercase short form
JURISDICTION_MAP = {
    "commonwealth": "commonwealth",
    "new_south_wales": "nsw",
    "new south wales": "nsw",
    "nsw": "nsw",
    "queensland": "qld",
    "victoria": "vic",
    "western_australia": "wa",
    "western australia": "wa",
    "south_australia": "sa",
    "south australia": "sa",
    "tasmania": "tas",
    "norfolk_island": "norfolk_island",
    "norfolk island": "norfolk_island",
    "northern_territory": "nt",
    "northern territory": "nt",
    "australian_capital_territory": "act",
    "australian capital territory": "act",
}


LEGAL_DOCUMENTS_SQL = """
CREATE TABLE IF NOT EXISTS legal_documents (
    doc_id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id TEXT UNIQUE,
    title TEXT,
    jurisdiction TEXT,
    doc_type TEXT,
    date TEXT,
    citation TEXT,
    url TEXT,
    text TEXT,
    source TEXT DEFAULT 'open_australian_legal_corpus'
);
"""

LEGAL_FTS_SQL = """
CREATE VIRTUAL TABLE IF NOT EXISTS legal_documents_fts USING fts5(
    title, citation, text,
    content=legal_documents, content_rowid=doc_id,
    tokenize='porter unicode61'
);
"""

# Triggers to keep FTS index in sync with the main table
LEGAL_FTS_TRIGGERS_SQL = """
CREATE TRIGGER IF NOT EXISTS legal_documents_ai AFTER INSERT ON legal_documents BEGIN
    INSERT INTO legal_documents_fts(rowid, title, citation, text)
    VALUES (new.doc_id, new.title, new.citation, new.text);
END;

CREATE TRIGGER IF NOT EXISTS legal_documents_ad AFTER DELETE ON legal_documents BEGIN
    INSERT INTO legal_documents_fts(legal_documents_fts, rowid, title, citation, text)
    VALUES ('delete', old.doc_id, old.title, old.citation, old.text);
END;

CREATE TRIGGER IF NOT EXISTS legal_documents_au AFTER UPDATE ON legal_documents BEGIN
    INSERT INTO legal_documents_fts(legal_documents_fts, rowid, title, citation, text)
    VALUES ('delete', old.doc_id, old.title, old.citation, old.text);
    INSERT INTO legal_documents_fts(rowid, title, citation, text)
    VALUES (new.doc_id, new.title, new.citation, new.text);
END;
"""


def init_legal_schema(db: sqlite3.Connection) -> None:
    """Create the legal_documents table and FTS5 index if they don't exist."""
    db.executescript(LEGAL_DOCUMENTS_SQL)
    db.executescript(LEGAL_FTS_SQL)
    db.executescript(LEGAL_FTS_TRIGGERS_SQL)
    db.commit()


def download_dataset(cache_dir: Path, streaming: bool = False):
    """Download the Open Australian Legal Corpus from HuggingFace.

    Returns a datasets.Dataset object.
    """
    from datasets import load_dataset

    print(f"Loading dataset '{HF_DATASET_ID}' from HuggingFace...")
    print(f"  Cache directory: {cache_dir}")

    ds = load_dataset(
        HF_DATASET_ID,
        cache_dir=str(cache_dir),
        streaming=streaming,
    )

    # The dataset may have a single split or 'corpus' split
    if hasattr(ds, "keys"):
        # DatasetDict — pick the first available split
        split_name = list(ds.keys())[0]
        print(f"  Using split: {split_name}")
        return ds[split_name]
    return ds


def _extract_title_from_citation(citation: str | None) -> str | None:
    """Extract a human-readable title from the citation string."""
    if not citation:
        return None
    # Many citations look like "Act Name YYYY (Jurisdiction)" or similar
    return citation.strip()


def _normalise_jurisdiction(raw: str | None) -> str:
    """Map raw jurisdiction string to our short form."""
    if not raw:
        return "unknown"
    return JURISDICTION_MAP.get(raw.lower().strip(), raw.lower().strip())


def _normalise_doc_type(raw: str | None) -> str:
    """Map raw document type to our schema types."""
    if not raw:
        return "unknown"
    return DOC_TYPE_MAP.get(raw.lower().strip(), raw.lower().strip())


def _normalise_date(raw: str | None) -> str | None:
    """Extract just the date portion (YYYY-MM-DD) if present."""
    if not raw:
        return None
    # The dataset uses "YYYY-MM-DD HH:MM:SS" format
    return raw[:10] if len(raw) >= 10 else raw


def ingest(
    db: sqlite3.Connection,
    cache_dir: Path = CACHE_DIR,
    limit: int | None = None,
    skip_download: bool = False,
    batch_size: int = 5000,
    force: bool = False,
) -> int:
    """Download and ingest the legal corpus into SQLite.

    Args:
        db: Database connection.
        cache_dir: Directory for HuggingFace cache files.
        limit: Maximum number of documents to ingest (None = all).
        skip_download: If True, assume data is already cached.
        batch_size: Number of rows per INSERT batch.

    Returns:
        Number of documents inserted.
    """
    init_legal_schema(db)

    # Check how many documents already exist
    existing = db.execute("SELECT COUNT(*) FROM legal_documents").fetchone()[0]
    if existing > 0 and not force:
        print(f"  legal_documents table already has {existing:,} rows.")
        print("  Use --force to add more documents.")
        return 0

    # Use streaming mode when no limit is set (memory efficient for 229k docs)
    use_streaming = limit is None or limit > 50_000
    ds = download_dataset(cache_dir, streaming=use_streaming)

    total_inserted = 0
    batch = []
    t0 = time.time()

    print(f"Ingesting documents (limit={limit or 'all'})...")

    for i, row in enumerate(ds):
        if limit and i >= limit:
            break

        version_id = row.get("version_id")
        citation = row.get("citation")
        title = _extract_title_from_citation(citation)
        jurisdiction = _normalise_jurisdiction(row.get("jurisdiction"))
        doc_type = _normalise_doc_type(row.get("type"))
        date = _normalise_date(row.get("date"))
        url = row.get("url")
        text = row.get("text", "")

        batch.append((
            version_id, title, jurisdiction, doc_type,
            date, citation, url, text,
        ))

        if len(batch) >= batch_size:
            _insert_batch(db, batch)
            total_inserted += len(batch)
            elapsed = time.time() - t0
            rate = total_inserted / elapsed if elapsed > 0 else 0
            print(
                f"  {total_inserted:>8,} docs ingested "
                f"({elapsed:.0f}s, {rate:.0f} docs/s)"
            )
            batch = []

    # Final batch
    if batch:
        _insert_batch(db, batch)
        total_inserted += len(batch)

    elapsed = time.time() - t0
    print(f"Done: {total_inserted:,} documents ingested in {elapsed:.1f}s")

    # Optimize FTS index
    print("Optimizing FTS index...")
    db.execute("INSERT INTO legal_documents_fts(legal_documents_fts) VALUES('optimize')")
    db.commit()
    print("FTS index optimized.")

    return total_inserted


def _insert_batch(db: sqlite3.Connection, batch: list[tuple], retries: int = 3) -> None:
    """Insert a batch of documents, skipping duplicates by version_id."""
    for attempt in range(retries):
        try:
            db.executemany(
                """
                INSERT OR IGNORE INTO legal_documents
                    (version_id, title, jurisdiction, doc_type, date, citation, url, text)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                batch,
            )
            db.commit()
            return
        except sqlite3.OperationalError as e:
            if "locked" in str(e) and attempt < retries - 1:
                print(f"  Database locked, retrying ({attempt + 1}/{retries})...")
                time.sleep(2)
            else:
                raise


def search_legal(
    db: sqlite3.Connection,
    query: str,
    jurisdiction: str | None = None,
    doc_type: str | None = None,
    limit: int = 10,
) -> list[dict]:
    """Search legal documents using FTS5.

    Args:
        db: Database connection.
        query: Search query string.
        jurisdiction: Filter by jurisdiction (e.g. 'commonwealth', 'nsw').
        doc_type: Filter by document type (e.g. 'legislation', 'court_decision').
        limit: Maximum results to return.

    Returns:
        List of matching documents as dicts.
    """
    # Build FTS query — escape special characters for FTS5
    fts_query = query.replace('"', '""')

    conditions = ["legal_documents_fts MATCH ?"]
    params: list = [fts_query]

    if jurisdiction:
        conditions.append("ld.jurisdiction = ?")
        params.append(jurisdiction)
    if doc_type:
        conditions.append("ld.doc_type = ?")
        params.append(doc_type)

    where = " AND ".join(conditions)
    params.append(limit)

    rows = db.execute(
        f"""
        SELECT ld.doc_id, ld.version_id, ld.title, ld.jurisdiction,
               ld.doc_type, ld.date, ld.citation, ld.url,
               SUBSTR(ld.text, 1, 2000) AS text_preview,
               rank
        FROM legal_documents_fts
        JOIN legal_documents ld ON ld.doc_id = legal_documents_fts.rowid
        WHERE {where}
        ORDER BY rank
        LIMIT ?
        """,
        params,
    ).fetchall()

    return [dict(r) for r in rows]


def main():
    parser = argparse.ArgumentParser(
        description="Ingest the Open Australian Legal Corpus into parli.db"
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Maximum number of documents to ingest (default: all ~229k)",
    )
    parser.add_argument(
        "--skip-download", action="store_true",
        help="Skip download, use cached HuggingFace data",
    )
    parser.add_argument(
        "--db", type=str, default=None,
        help="Path to SQLite database (default: ~/.cache/autoresearch/parli.db)",
    )
    parser.add_argument(
        "--batch-size", type=int, default=5000,
        help="Number of rows per INSERT batch (default: 5000)",
    )
    parser.add_argument(
        "--test-search", type=str, default=None,
        help="Run a test search query after ingest",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Force ingest even if documents already exist",
    )
    args = parser.parse_args()

    from parli.schema import get_db, DEFAULT_DB_PATH

    db_path = args.db or DEFAULT_DB_PATH
    db = get_db(db_path)
    # Increase timeout for long ingest operations
    db.execute("PRAGMA busy_timeout = 60000")

    count = ingest(
        db,
        cache_dir=CACHE_DIR,
        limit=args.limit,
        skip_download=args.skip_download,
        batch_size=args.batch_size,
        force=args.force,
    )

    # Print summary
    total = db.execute("SELECT COUNT(*) FROM legal_documents").fetchone()[0]
    print(f"\nTotal documents in legal_documents: {total:,}")

    # Jurisdiction breakdown
    rows = db.execute(
        "SELECT jurisdiction, COUNT(*) as cnt FROM legal_documents GROUP BY jurisdiction ORDER BY cnt DESC"
    ).fetchall()
    print("\nBy jurisdiction:")
    for r in rows:
        print(f"  {r['jurisdiction']:25s} {r['cnt']:>8,}")

    # Type breakdown
    rows = db.execute(
        "SELECT doc_type, COUNT(*) as cnt FROM legal_documents GROUP BY doc_type ORDER BY cnt DESC"
    ).fetchall()
    print("\nBy document type:")
    for r in rows:
        print(f"  {r['doc_type']:25s} {r['cnt']:>8,}")

    # Test search
    if args.test_search:
        print(f"\nTest search: {args.test_search!r}")
        results = search_legal(db, args.test_search, limit=5)
        for r in results:
            print(f"  [{r['jurisdiction']}] {r['title']} ({r['date']})")
            print(f"    {r['text_preview'][:200]}...")
            print()


if __name__ == "__main__":
    main()
