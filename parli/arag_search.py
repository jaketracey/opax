"""
parli.arag_search -- retrieval adapter: OPAX API shapes over the Agentic RAG KB.

Feature-flagged: nothing routes here unless ARAG_SEARCH=1 (and the KB binding
is configured). The existing SQLite/Postgres search stack stays the default,
so cutover is an env change, and rollback is unsetting it.

Result mapping keeps the exact dict shape the frontend already consumes
(parli.search._speech_row_to_dict), with speech_id recovered from the
resource slug (speech-{id}) and speaker/party/date/topic from extra.metadata.
"""

import math
import os
import re
from functools import lru_cache
from typing import Optional

from parli.arag import AragConfig, KbClient, load_dotenv

_SLUG_RE = re.compile(r"^(speech|legal|news)-(\d+)$")


def arag_enabled() -> bool:
    if os.environ.get("ARAG_SEARCH", "").strip() not in ("1", "true", "yes"):
        return False
    return AragConfig.from_env().kb_configured


@lru_cache(maxsize=1)
def _kb() -> KbClient:
    load_dotenv()
    return KbClient(AragConfig.from_env())


def _calibrate(score: float, score_type: str) -> float:
    """/find mixes scales: semantic ~0-1, BM25 unbounded (5-30 typical).
    Squash anything >1 logistically so the UI's percentage bar stays honest."""
    if score_type in ("VECTOR", "BOTH") or score <= 1.0:
        return min(max(score, 0.0), 1.0)
    return 1.0 / (1.0 + math.exp(-(score - 8.0) / 4.0))


_FEATURES = {
    "semantic": ["semantic"],
    "keyword": ["keyword"],
    "hybrid": ["keyword", "semantic"],
}


def search(query: str, top_k: int = 20, text_limit: int = 500,
           mode: str = "hybrid", kind: Optional[str] = "speech") -> list[dict]:
    """Query /find, return rows shaped like parli.search results."""
    filter_expression = (
        {"field": {"prop": "label", "labelset": "kind", "label": kind}} if kind else None
    )
    found = _kb().find(
        query, top_k=top_k,
        features=_FEATURES.get(mode),
        filter_expression=filter_expression,
    )

    results = []
    for rid, resource in (found.get("resources") or {}).items():
        slug = resource.get("slug") or ""
        m = _SLUG_RE.match(slug)
        meta = ((resource.get("extra") or {}).get("metadata")) or {}
        best_text, best_score, best_type = "", 0.0, "BM25"
        for field in (resource.get("fields") or {}).values():
            for para in (field.get("paragraphs") or {}).values():
                if para.get("score", 0) >= best_score:
                    best_score = para.get("score", 0)
                    best_text = para.get("text", "")
                    best_type = para.get("score_type", "BM25")
        results.append({
            "speech_id": int(m.group(2)) if m and m.group(1) == "speech" else None,
            "person_id": meta.get("person_id"),
            "speaker_name": _collaborator(resource) or resource.get("title"),
            "party": _label(resource, "party"),
            "date": meta.get("date"),
            "topic": None,
            "text": best_text[:text_limit],
            "similarity_score": round(_calibrate(best_score, best_type), 4),
            "arag_resource": rid,
            "arag_slug": slug,
        })
    results.sort(key=lambda r: r["similarity_score"], reverse=True)
    return results[:top_k]


def _collaborator(resource: dict) -> Optional[str]:
    collabs = (resource.get("origin") or {}).get("collaborators") or []
    return collabs[0] if collabs else None


def _label(resource: dict, labelset: str) -> Optional[str]:
    for c in ((resource.get("usermetadata") or {}).get("classifications")) or []:
        if c.get("labelset") == labelset:
            return c.get("label")
    return None


def ask(question: str, top_k: int = 20) -> dict:
    """Grounded /ask mapped onto the /api/ask response contract.

    Citations only — never combined with answer_json_schema (platform bug:
    the pair 500s). DA-generated fields must not be cited; exclude any
    da-* field ids defensively even though no enrichment runs yet."""
    res = _kb().ask(question, citations=True, top_k=top_k)
    answer = res.get("answer") or ""

    sources = []
    retrieval = (res.get("retrieval_results") or {}).get("resources") or {}
    for rid, resource in retrieval.items():
        slug = resource.get("slug") or ""
        if slug.startswith("da-") or "/t/da-" in slug:
            continue
        meta = ((resource.get("extra") or {}).get("metadata")) or {}
        sources.append({
            "speech_id": meta.get("speech_id"),
            "title": resource.get("title"),
            "speaker_name": _collaborator(resource),
            "date": meta.get("date"),
            "slug": slug,
            "resource": rid,
        })

    return {
        "answer": answer,
        "sources": sources,
        "context": None,  # retrieval happened platform-side; no local context blob
        "metadata": {
            "engine": "arag",
            "citations": res.get("citations") or {},
            "speech_count": len(sources),
            "confidence": None,  # REMi scoring is a follow-up (needs full context)
        },
    }
