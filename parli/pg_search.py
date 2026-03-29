"""
parli.pg_search -- Search module with PostgreSQL tsvector + pgvector support.

Drop-in replacement for parli.search that auto-detects the database backend
and uses the appropriate search strategy:
  - PostgreSQL: tsvector + ts_rank for keyword, pgvector <=> for semantic
  - SQLite: FTS5 for keyword, numpy for semantic (original behavior)

Usage:
    from parli.pg_search import semantic_search, keyword_search, hybrid_search

    # Or from CLI:
    python -m parli.pg_search "gambling industry donations"
    python -m parli.pg_search --mode semantic "climate change policy"
"""

import re

import numpy as np

from parli.db import get_db, is_postgres


def _speech_row_to_dict(row, score: float, text_limit: int = 500) -> dict:
    """Convert a database row (dict or sqlite3.Row) to a result dict."""
    # Handle both dict (psycopg) and sqlite3.Row
    if hasattr(row, "keys"):
        keys = row.keys()
    else:
        keys = row.keys() if callable(getattr(row, "keys", None)) else []

    return {
        "speech_id": row["speech_id"],
        "person_id": row["person_id"] if "person_id" in keys else None,
        "speaker_name": row["speaker_name"],
        "party": row["party"],
        "date": str(row["date"]),
        "topic": row["topic"],
        "text": row["text"][:text_limit] if row["text"] else "",
        "similarity_score": score,
    }


# ---------------------------------------------------------------------------
# PostgreSQL search implementations
# ---------------------------------------------------------------------------


def _pg_keyword_search(query: str, top_k: int = 20, text_limit: int = 500) -> list[dict]:
    """Full-text search using PostgreSQL tsvector + ts_rank."""
    db = get_db()
    try:
        # Sanitize query for tsquery
        sanitized = re.sub(r'[^\w\s]', ' ', query)
        terms = [t.strip() for t in sanitized.split() if t.strip()]
        if not terms:
            return []

        # Use plainto_tsquery for simple term matching (handles stemming)
        # Also try websearch_to_tsquery for more flexible parsing
        rows = db.execute(
            """
            SELECT s.speech_id, s.person_id, s.speaker_name, s.party, s.date,
                   s.topic, s.text,
                   ts_rank(s.search_vector, plainto_tsquery('english', %s)) AS rank_score
            FROM speeches s
            WHERE s.search_vector @@ plainto_tsquery('english', %s)
            ORDER BY rank_score DESC
            LIMIT %s
            """,
            (query, query, top_k),
        ).fetchall()

        results = []
        for i, row in enumerate(rows):
            score = float(row["rank_score"]) if row["rank_score"] else 1.0 / (1 + i)
            results.append(_speech_row_to_dict(row, score, text_limit=text_limit))
        return results
    finally:
        if hasattr(db, 'close'):
            db.close()


def _pg_semantic_search(query: str, top_k: int = 20, text_limit: int = 500) -> list[dict]:
    """Semantic search using pgvector cosine distance.

    Falls back to numpy-based search if the embedding column is empty.
    """
    db = get_db()
    try:
        # Check if any embeddings exist in pgvector
        try:
            has_embeddings = db.execute(
                "SELECT EXISTS(SELECT 1 FROM speeches WHERE embedding IS NOT NULL LIMIT 1)"
            ).fetchone()
            has_emb = False
            if isinstance(has_embeddings, dict):
                has_emb = list(has_embeddings.values())[0]
            elif has_embeddings:
                has_emb = has_embeddings[0]
        except Exception:
            has_emb = False

        if not has_emb:
            # Fall back to numpy-based semantic search
            # Close db before calling fallback (which gets its own connection)
            db.close()
            db = None  # Prevent double-close in finally
            return _numpy_semantic_search(query, top_k, text_limit)

        # Embed the query
        from parli.embeddings import embed_texts
        query_emb = embed_texts([query])  # (1, 384)
        vec_str = "[" + ",".join(f"{v:.6f}" for v in query_emb[0]) + "]"

        # pgvector cosine distance: <=> operator (lower = more similar)
        # Convert to similarity score: 1 - distance
        rows = db.execute(
            """
            SELECT s.speech_id, s.person_id, s.speaker_name, s.party, s.date,
                   s.topic, s.text,
                   1 - (s.embedding <=> %s::vector) AS similarity
            FROM speeches s
            WHERE s.embedding IS NOT NULL
            ORDER BY s.embedding <=> %s::vector
            LIMIT %s
            """,
            (vec_str, vec_str, top_k),
        ).fetchall()

        results = []
        for row in rows:
            score = float(row["similarity"]) if row["similarity"] else 0.0
            results.append(_speech_row_to_dict(row, score, text_limit=text_limit))
        return results
    finally:
        if db is not None and hasattr(db, 'close'):
            db.close()


# ---------------------------------------------------------------------------
# SQLite search implementations (original behavior from parli/search.py)
# ---------------------------------------------------------------------------


def _numpy_semantic_search(query: str, top_k: int = 20, text_limit: int = 500) -> list[dict]:
    """Semantic search using numpy embeddings (SQLite or PG fallback)."""
    from parli.embeddings import embed_texts, load_embeddings

    query_emb = embed_texts([query])  # (1, 384), L2-normalized
    embeddings, ids = load_embeddings()

    scores = embeddings @ query_emb.T
    scores = scores.squeeze()

    top_indices = np.argsort(scores)[-top_k:][::-1]

    db = get_db()
    results = []
    try:
        for idx in top_indices:
            speech_id = int(ids[idx])
            score = float(scores[idx])
            row = db.execute(
                "SELECT speech_id, person_id, speaker_name, party, date, topic, text "
                "FROM speeches WHERE speech_id = %s" if is_postgres() else
                "SELECT speech_id, person_id, speaker_name, party, date, topic, text "
                "FROM speeches WHERE speech_id = ?",
                (speech_id,),
            ).fetchone()
            if row:
                results.append(_speech_row_to_dict(row, score, text_limit=text_limit))
    finally:
        if is_postgres() and hasattr(db, 'close'):
            db.close()
    return results


def _sqlite_keyword_search(query: str, top_k: int = 20, text_limit: int = 500) -> list[dict]:
    """Full-text search using SQLite FTS5 (original implementation)."""
    db = get_db()
    sanitized = re.sub(r'[^\w\s]', ' ', query)
    terms = [t.strip() for t in sanitized.split() if t.strip()]
    if not terms:
        return []
    fts_query = " OR ".join(f'"{t}"' for t in terms)
    rows = db.execute(
        """
        SELECT s.speech_id, s.person_id, s.speaker_name, s.party, s.date, s.topic, s.text,
               rank AS fts_rank
        FROM speeches_fts fts
        JOIN speeches s ON s.speech_id = fts.rowid
        WHERE speeches_fts MATCH ?
        ORDER BY rank
        LIMIT ?
        """,
        (fts_query, top_k),
    ).fetchall()

    results = []
    for i, row in enumerate(rows):
        score = 1.0 / (1 + i)
        results.append(_speech_row_to_dict(row, score, text_limit=text_limit))
    return results


# ---------------------------------------------------------------------------
# Public API -- auto-dispatches based on backend
# ---------------------------------------------------------------------------


def semantic_search(query: str, top_k: int = 20, text_limit: int = 500) -> list[dict]:
    """Find speeches most similar to the query using embedding cosine similarity.

    Uses pgvector on PostgreSQL (with numpy fallback) or numpy on SQLite.
    """
    if is_postgres():
        return _pg_semantic_search(query, top_k, text_limit)
    else:
        return _numpy_semantic_search(query, top_k, text_limit)


def keyword_search(query: str, top_k: int = 20, text_limit: int = 500) -> list[dict]:
    """Full-text search over speeches.

    Uses tsvector on PostgreSQL or FTS5 on SQLite.
    """
    if is_postgres():
        return _pg_keyword_search(query, top_k, text_limit)
    else:
        return _sqlite_keyword_search(query, top_k, text_limit)


def hybrid_search(query: str, top_k: int = 20, text_limit: int = 500) -> list[dict]:
    """Combine semantic and keyword search using Reciprocal Rank Fusion (RRF).

    RRF score = sum(1 / (k + rank)) across retrieval methods.
    k=60 is the standard constant from the original RRF paper.
    """
    k = 60
    fetch_k = top_k * 2

    semantic_results = semantic_search(query, top_k=fetch_k, text_limit=text_limit)
    keyword_results = keyword_search(query, top_k=fetch_k, text_limit=text_limit)

    rrf_scores: dict[int, float] = {}
    result_map: dict[int, dict] = {}

    for rank, r in enumerate(semantic_results):
        sid = r["speech_id"]
        rrf_scores[sid] = rrf_scores.get(sid, 0) + 1.0 / (k + rank + 1)
        result_map[sid] = r

    for rank, r in enumerate(keyword_results):
        sid = r["speech_id"]
        rrf_scores[sid] = rrf_scores.get(sid, 0) + 1.0 / (k + rank + 1)
        if sid not in result_map:
            result_map[sid] = r

    ranked = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)[:top_k]

    results = []
    for sid, score in ranked:
        entry = result_map[sid].copy()
        entry["similarity_score"] = score
        results.append(entry)
    return results


# ---------------------------------------------------------------------------
# News article search (PostgreSQL only for now)
# ---------------------------------------------------------------------------


def search_news(query: str, top_k: int = 20) -> list[dict]:
    """Full-text search over news articles.

    Uses tsvector on PostgreSQL, FTS5 on SQLite.
    """
    db = get_db()
    try:
        if is_postgres():
            rows = db.execute(
                """
                SELECT article_id, title, date, section, url,
                       LEFT(body_text, 500) AS snippet,
                       ts_rank(search_vector, plainto_tsquery('english', %s)) AS rank_score
                FROM news_articles
                WHERE search_vector @@ plainto_tsquery('english', %s)
                ORDER BY rank_score DESC
                LIMIT %s
                """,
                (query, query, top_k),
            ).fetchall()
        else:
            sanitized = re.sub(r'[^\w\s]', ' ', query)
            terms = [t.strip() for t in sanitized.split() if t.strip()]
            if not terms:
                return []
            fts_query = " OR ".join(f'"{t}"' for t in terms)
            rows = db.execute(
                """
                SELECT n.article_id, n.title, n.date, n.section, n.url,
                       SUBSTR(n.body_text, 1, 500) AS snippet,
                       rank AS rank_score
                FROM news_articles_fts fts
                JOIN news_articles n ON n.rowid = fts.rowid
                WHERE news_articles_fts MATCH ?
                ORDER BY rank
                LIMIT ?
                """,
                (fts_query, top_k),
            ).fetchall()

        return [dict(row) if hasattr(row, "keys") else dict(row) for row in rows]
    finally:
        if is_postgres() and hasattr(db, 'close'):
            db.close()


# ---------------------------------------------------------------------------
# Display + CLI
# ---------------------------------------------------------------------------


def format_results(results: list[dict]) -> str:
    """Format search results for display."""
    lines = []
    for i, r in enumerate(results, 1):
        lines.append(
            f"{i:2d}. [{r['similarity_score']:.4f}] "
            f"{r['speaker_name'] or 'Unknown'} ({r['party'] or '?'}) "
            f"-- {r['date']}"
        )
        if r["topic"]:
            lines.append(f"    Topic: {r['topic']}")
        text = r["text"][:120] if r["text"] else ""
        lines.append(f"    {text}...")
        lines.append("")
    return "\n".join(lines)


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Search Hansard speeches (PG + SQLite)")
    parser.add_argument("query", type=str, help="Search query")
    parser.add_argument("--mode", choices=["semantic", "keyword", "hybrid"], default="hybrid")
    parser.add_argument("--top-k", type=int, default=20)
    args = parser.parse_args()

    from parli.db import get_backend_info
    info = get_backend_info()
    print(f"Backend: {info['backend']}")

    search_fn = {
        "semantic": semantic_search,
        "keyword": keyword_search,
        "hybrid": hybrid_search,
    }[args.mode]

    print(f"Searching ({args.mode}): {args.query!r}\n")
    results = search_fn(args.query, top_k=args.top_k)
    print(format_results(results))
    print(f"{len(results)} results returned.")


if __name__ == "__main__":
    main()
