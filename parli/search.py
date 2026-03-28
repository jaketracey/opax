"""
parli.search — Semantic, keyword, and hybrid search over Hansard speeches.

Provides three search strategies:
  - semantic_search: cosine similarity over sentence-transformer embeddings
  - keyword_search: SQLite FTS5 full-text search
  - hybrid_search: Reciprocal Rank Fusion (RRF) combining both

Usage:
    python -m parli.search "gambling industry donations"
    python -m parli.search --mode semantic "climate change policy"
    python -m parli.search --mode keyword "poker machines"
"""

import numpy as np

from parli.embeddings import embed_texts, load_embeddings
from parli.schema import get_db


def _speech_row_to_dict(row, score: float, text_limit: int = 500) -> dict:
    """Convert a sqlite3.Row to a result dict."""
    return {
        "speech_id": row["speech_id"],
        "person_id": row["person_id"] if "person_id" in row.keys() else None,
        "speaker_name": row["speaker_name"],
        "party": row["party"],
        "date": row["date"],
        "topic": row["topic"],
        "text": row["text"][:text_limit],
        "similarity_score": score,
    }


def semantic_search(query: str, top_k: int = 20, text_limit: int = 500) -> list[dict]:
    """Find speeches most similar to the query using embedding cosine similarity."""
    query_emb = embed_texts([query])  # (1, 384), already L2-normalized
    embeddings, ids = load_embeddings()

    # Cosine similarity via dot product (embeddings are L2-normalized)
    scores = embeddings @ query_emb.T  # (N, 1)
    scores = scores.squeeze()

    top_indices = np.argsort(scores)[-top_k:][::-1]

    db = get_db()
    results = []
    for idx in top_indices:
        speech_id = int(ids[idx])
        score = float(scores[idx])
        row = db.execute(
            "SELECT speech_id, person_id, speaker_name, party, date, topic, text "
            "FROM speeches WHERE speech_id = ?",
            (speech_id,),
        ).fetchone()
        if row:
            results.append(_speech_row_to_dict(row, score, text_limit=text_limit))
    return results


def keyword_search(query: str, top_k: int = 20, text_limit: int = 500) -> list[dict]:
    """Full-text search over speeches using SQLite FTS5."""
    db = get_db()
    # FTS5 match query — sanitize special chars and quote each term
    import re
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
        # FTS5 rank is negative (more negative = better match); normalize to 0-1
        score = 1.0 / (1 + i)  # simple rank-based score
        results.append(_speech_row_to_dict(row, score, text_limit=text_limit))
    return results


def hybrid_search(query: str, top_k: int = 20, text_limit: int = 500) -> list[dict]:
    """Combine semantic and keyword search using Reciprocal Rank Fusion (RRF).

    RRF score = sum(1 / (k + rank)) across retrieval methods.
    k=60 is the standard constant from the original RRF paper.
    """
    k = 60  # RRF constant

    # Fetch more candidates from each method, then fuse
    fetch_k = top_k * 2
    semantic_results = semantic_search(query, top_k=fetch_k, text_limit=text_limit)
    keyword_results = keyword_search(query, top_k=fetch_k, text_limit=text_limit)

    # Build RRF scores keyed by speech_id
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

    # Sort by RRF score descending
    ranked = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)[:top_k]

    results = []
    for sid, score in ranked:
        entry = result_map[sid].copy()
        entry["similarity_score"] = score
        results.append(entry)
    return results


def format_results(results: list[dict]) -> str:
    """Format search results for display."""
    lines = []
    for i, r in enumerate(results, 1):
        lines.append(
            f"{i:2d}. [{r['similarity_score']:.4f}] "
            f"{r['speaker_name'] or 'Unknown'} ({r['party'] or '?'}) "
            f"— {r['date']}"
        )
        if r["topic"]:
            lines.append(f"    Topic: {r['topic']}")
        lines.append(f"    {r['text'][:120]}...")
        lines.append("")
    return "\n".join(lines)


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Search Hansard speeches")
    parser.add_argument("query", type=str, help="Search query")
    parser.add_argument("--mode", choices=["semantic", "keyword", "hybrid"], default="hybrid")
    parser.add_argument("--top-k", type=int, default=20)
    args = parser.parse_args()

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
