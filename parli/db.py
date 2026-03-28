"""
parli.db -- Unified database connection management for OPAX.

Supports both PostgreSQL (primary) and SQLite (fallback).
The active backend is selected by the DATABASE_URL environment variable:
  - Set DATABASE_URL=postgresql://... for PostgreSQL (uses psycopg v3 pool)
  - Unset or empty DATABASE_URL falls back to SQLite (parli.schema.get_db)

Usage:
    from parli.db import get_db, get_db_dep

    # Direct usage
    conn = get_db()

    # FastAPI dependency
    @app.get("/endpoint")
    def endpoint(db=Depends(get_db_dep)):
        ...
"""

import os
import sqlite3
from contextlib import contextmanager
from typing import Any, Generator

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DATABASE_URL = os.environ.get(
    "DATABASE_URL", ""
).strip()

_USE_PG = DATABASE_URL.startswith("postgresql://") or DATABASE_URL.startswith("postgres://")

# ---------------------------------------------------------------------------
# PostgreSQL connection pool (lazy-initialized)
# ---------------------------------------------------------------------------

_pg_pool = None


def _get_pg_pool():
    """Lazily create and return the psycopg ConnectionPool."""
    global _pg_pool
    if _pg_pool is not None:
        return _pg_pool

    from psycopg_pool import ConnectionPool
    from psycopg.rows import dict_row

    _pg_pool = ConnectionPool(
        conninfo=DATABASE_URL,
        min_size=5,
        max_size=20,
        kwargs={"row_factory": dict_row},
        open=True,
    )
    return _pg_pool


def close_pool():
    """Shut down the PostgreSQL connection pool (call on app shutdown)."""
    global _pg_pool
    if _pg_pool is not None:
        _pg_pool.close()
        _pg_pool = None


# ---------------------------------------------------------------------------
# Unified get_db() -- returns a connection (PG or SQLite)
# ---------------------------------------------------------------------------


class _PgConnectionWrapper:
    """Thin wrapper around a psycopg connection to provide a sqlite3.Row-like
    interface so existing code that does row["column"] keeps working.

    The psycopg dict_row factory already returns dicts, so the main thing this
    wrapper adds is execute() convenience that returns fetchall-able results,
    plus commit/close lifecycle management via the pool.
    """

    def __init__(self, conn):
        self._conn = conn
        self._pool = _get_pg_pool()

    # -- Query helpers -------------------------------------------------------

    def execute(self, sql: str, params=None):
        """Execute SQL and return a cursor.

        Translates SQLite-style ? placeholders to PostgreSQL %s placeholders.
        """
        sql = _translate_placeholders(sql)
        cur = self._conn.execute(sql, params)
        return _CursorWrapper(cur)

    def executemany(self, sql: str, seq_of_params):
        sql = _translate_placeholders(sql)
        cur = self._conn.cursor()
        cur.executemany(sql, seq_of_params)
        return _CursorWrapper(cur)

    def executescript(self, sql: str):
        """Execute a multi-statement SQL script."""
        self._conn.execute(sql)

    # -- Transaction helpers -------------------------------------------------

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        """Return connection to the pool."""
        self._pool.putconn(self._conn)

    # -- Context manager -----------------------------------------------------

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.rollback()
        else:
            self.commit()
        self.close()

    # -- Expose underlying connection for advanced use -----------------------

    @property
    def pg_conn(self):
        """Access the raw psycopg connection (e.g., for COPY)."""
        return self._conn


class _CursorWrapper:
    """Wraps a psycopg cursor to expose fetchone/fetchall that return dicts."""

    def __init__(self, cursor):
        self._cursor = cursor

    def fetchone(self):
        return self._cursor.fetchone()

    def fetchall(self):
        return self._cursor.fetchall()

    def __iter__(self):
        return iter(self._cursor)


def _translate_placeholders(sql: str) -> str:
    """Convert SQLite-style ? placeholders to PostgreSQL-style %s.

    This is a simple conversion that handles the common case. It does NOT
    handle ? inside string literals (unlikely in our codebase).
    """
    return sql.replace("?", "%s")


def get_db():
    """Get a database connection.

    Returns a PostgreSQL pooled connection (wrapped) if DATABASE_URL is set,
    otherwise falls back to the SQLite connection from parli.schema.
    """
    if _USE_PG:
        pool = _get_pg_pool()
        conn = pool.getconn()
        return _PgConnectionWrapper(conn)
    else:
        from parli.schema import get_db as sqlite_get_db
        return sqlite_get_db()


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------


def get_db_dep() -> Generator[Any, None, None]:
    """FastAPI Depends() dependency that yields a connection and cleans up.

    Usage:
        from parli.db import get_db_dep
        from fastapi import Depends

        @app.get("/foo")
        def foo(db=Depends(get_db_dep)):
            rows = db.execute("SELECT ...").fetchall()
    """
    db = get_db()
    try:
        yield db
    finally:
        if _USE_PG and isinstance(db, _PgConnectionWrapper):
            db.close()
        # SQLite connections are long-lived singletons; don't close them.


# ---------------------------------------------------------------------------
# Utility: check which backend is active
# ---------------------------------------------------------------------------

def is_postgres() -> bool:
    """Return True if the active backend is PostgreSQL."""
    return _USE_PG


def get_backend_info() -> dict:
    """Return a dict describing the active database backend."""
    if _USE_PG:
        # Mask password in URL for display
        import re
        safe_url = re.sub(r"://[^@]+@", "://***@", DATABASE_URL)
        return {"backend": "postgresql", "url": safe_url}
    else:
        from parli.schema import DEFAULT_DB_PATH
        return {"backend": "sqlite", "path": str(DEFAULT_DB_PATH)}
