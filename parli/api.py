"""
parli.api — FastAPI backend for the OPAX frontend.

Thin wrapper around parli.search, parli.rag, and the SQLite database.

Usage:
    uvicorn parli.api:app --host 0.0.0.0 --port 8000
"""

import json
import os
from contextlib import asynccontextmanager
from typing import Optional

from pathlib import Path

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from parli.schema import get_db


# ---------------------------------------------------------------------------
# Lifespan: preload embeddings + model on startup
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm up the sentence-transformer model and embeddings on startup
    try:
        from parli.embeddings import embed_texts, load_embeddings
        print("[api] Loading embeddings and model...")
        load_embeddings()
        embed_texts(["warmup"])
        print("[api] Embeddings ready.")
    except Exception as e:
        print(f"[api] Warning: could not preload embeddings: {e}")
    yield


app = FastAPI(
    title="OPAX API",
    description="Open Parliamentary Accountability eXchange — API backend",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (Tailscale, localhost, production)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class AskRequest(BaseModel):
    question: str
    top_k: int = 10
    stream: bool = False


# ---------------------------------------------------------------------------
# GET /api/stats — Live database counts and date ranges
# ---------------------------------------------------------------------------

@app.get("/api/stats")
def stats():
    db = get_db()
    speeches = db.execute("SELECT COUNT(*) AS c FROM speeches").fetchone()["c"]
    members = db.execute("SELECT COUNT(*) AS c FROM members").fetchone()["c"]
    donations_count = db.execute("SELECT COUNT(*) AS c FROM donations").fetchone()["c"]
    divisions = db.execute("SELECT COUNT(*) AS c FROM divisions").fetchone()["c"]
    topics = db.execute("SELECT COUNT(*) AS c FROM topics").fetchone()["c"]
    date_range = db.execute(
        "SELECT MIN(date) AS min_date, MAX(date) AS max_date FROM speeches"
    ).fetchone()
    return {
        "speeches": speeches,
        "members": members,
        "donations": donations_count,
        "divisions": divisions,
        "topics": topics,
        "date_range": [date_range["min_date"], date_range["max_date"]],
    }


# ---------------------------------------------------------------------------
# GET /api/search — semantic, keyword, or hybrid search
# ---------------------------------------------------------------------------

@app.get("/api/search")
def search(
    q: str = Query(..., min_length=1, description="Search query"),
    mode: str = Query("hybrid", pattern="^(semantic|keyword|hybrid)$"),
    limit: int = Query(20, ge=1, le=100),
):
    from parli.search import semantic_search, keyword_search, hybrid_search

    search_fn = {
        "semantic": semantic_search,
        "keyword": keyword_search,
        "hybrid": hybrid_search,
    }[mode]

    results = search_fn(q, top_k=limit)
    return {"results": results, "query": q, "mode": mode, "count": len(results)}


# ---------------------------------------------------------------------------
# GET /api/speeches — filter speeches by topic, speaker, party
# ---------------------------------------------------------------------------

@app.get("/api/speeches")
def speeches(
    topic: Optional[str] = None,
    speaker: Optional[str] = None,
    party: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
):
    db = get_db()
    conditions = []
    params = []

    if topic:
        conditions.append("topic LIKE ?")
        params.append(f"%{topic}%")
    if speaker:
        conditions.append("speaker_name LIKE ?")
        params.append(f"%{speaker}%")
    if party:
        conditions.append("party LIKE ?")
        params.append(f"%{party}%")

    where = " AND ".join(conditions) if conditions else "1=1"
    rows = db.execute(
        f"""
        SELECT speech_id, person_id, speaker_name, party, date, topic,
               substr(text, 1, 500) AS text, word_count
        FROM speeches
        WHERE {where}
        ORDER BY date DESC
        LIMIT ?
        """,
        params + [limit],
    ).fetchall()

    return {"speeches": [dict(r) for r in rows], "count": len(rows)}


# ---------------------------------------------------------------------------
# GET /api/mp/{person_id} — MP details + stats
# ---------------------------------------------------------------------------

@app.get("/api/mp/{person_id}")
def get_mp(person_id: str):
    db = get_db()

    member = db.execute(
        "SELECT * FROM members WHERE person_id = ?", (person_id,)
    ).fetchone()
    if not member:
        return {"error": "MP not found"}, 404

    result = dict(member)

    # Speech count and top topics
    speech_stats = db.execute(
        """
        SELECT COUNT(*) as speech_count,
               MIN(date) as first_speech,
               MAX(date) as last_speech
        FROM speeches WHERE person_id = ?
        """,
        (person_id,),
    ).fetchone()
    result["speech_count"] = speech_stats["speech_count"]
    result["first_speech"] = speech_stats["first_speech"]
    result["last_speech"] = speech_stats["last_speech"]

    # Top topics
    top_topics = db.execute(
        """
        SELECT topic, COUNT(*) as count
        FROM speeches
        WHERE person_id = ? AND topic IS NOT NULL AND topic != ''
        GROUP BY topic
        ORDER BY count DESC
        LIMIT 10
        """,
        (person_id,),
    ).fetchall()
    result["top_topics"] = [dict(r) for r in top_topics]

    # Voting record (count of ayes/noes)
    vote_summary = db.execute(
        """
        SELECT vote, COUNT(*) as count
        FROM votes
        WHERE person_id = ?
        GROUP BY vote
        """,
        (person_id,),
    ).fetchall()
    result["votes"] = {r["vote"]: r["count"] for r in vote_summary}

    # Check analysis_cache for TVFY data
    cache_row = db.execute(
        "SELECT value FROM analysis_cache WHERE key LIKE ?",
        (f"%{person_id}%",),
    ).fetchone()
    if cache_row:
        try:
            result["cached_analysis"] = json.loads(cache_row["value"])
        except (json.JSONDecodeError, TypeError):
            pass

    return result


# ---------------------------------------------------------------------------
# GET /api/mp/{person_id}/profile — Full MP profile
# ---------------------------------------------------------------------------

@app.get("/api/mp/{person_id}/profile")
def get_mp_profile(person_id: str):
    db = get_db()

    member = db.execute(
        "SELECT * FROM members WHERE person_id = ?", (person_id,)
    ).fetchone()
    if not member:
        return {"error": "MP not found"}, 404

    result = dict(member)
    result["photo_url"] = f"https://www.openaustralia.org.au/images/mpsL/{person_id}.jpg"

    # Speech count
    speech_stats = db.execute(
        """
        SELECT COUNT(*) as speech_count,
               MIN(date) as first_speech,
               MAX(date) as last_speech
        FROM speeches WHERE person_id = ?
        """,
        (person_id,),
    ).fetchone()
    result["speech_count"] = speech_stats["speech_count"]
    result["first_speech"] = speech_stats["first_speech"]
    result["last_speech"] = speech_stats["last_speech"]

    # Top topics from speech_topics
    top_topics = db.execute(
        """
        SELECT t.name, COUNT(*) as count
        FROM speech_topics st
        JOIN topics t ON t.topic_id = st.topic_id
        JOIN speeches s ON s.speech_id = st.speech_id
        WHERE s.person_id = ?
        GROUP BY t.name
        ORDER BY count DESC
        LIMIT 10
        """,
        (person_id,),
    ).fetchall()
    result["top_topics"] = [dict(r) for r in top_topics]

    # Policy scores from analysis_cache
    cache_row = db.execute(
        "SELECT value FROM analysis_cache WHERE key = ?",
        (f"tvfy_person_{person_id}",),
    ).fetchone()
    if cache_row:
        try:
            tvfy_data = json.loads(cache_row["value"])
            comparisons = tvfy_data.get("policy_comparisons", [])
            voted = [c for c in comparisons if c.get("voted")]
            result["policy_scores"] = [
                {
                    "policy_id": c["policy"]["id"],
                    "policy_name": c["policy"]["name"],
                    "agreement": c["agreement"],
                }
                for c in voted
            ]
            result["rebellions"] = tvfy_data.get("rebellions")
            result["votes_attended"] = tvfy_data.get("votes_attended")
            result["votes_possible"] = tvfy_data.get("votes_possible")
        except (json.JSONDecodeError, TypeError):
            result["policy_scores"] = []
    else:
        result["policy_scores"] = []

    # Top donors to this MP's party
    if result.get("party"):
        top_donors = db.execute(
            """
            SELECT donor_name, SUM(amount) as total, COUNT(*) as donation_count,
                   industry
            FROM donations
            WHERE recipient LIKE ?
            GROUP BY donor_name
            ORDER BY total DESC
            LIMIT 10
            """,
            (f"%{result['party'].split()[0]}%",),
        ).fetchall()
        result["top_party_donors"] = [dict(r) for r in top_donors]

    # Voting record summary
    vote_summary = db.execute(
        """
        SELECT vote, COUNT(*) as count
        FROM votes
        WHERE person_id = ?
        GROUP BY vote
        """,
        (person_id,),
    ).fetchall()
    result["votes"] = {r["vote"]: r["count"] for r in vote_summary}

    return result


# ---------------------------------------------------------------------------
# GET /api/mp/{person_id}/speeches — Paginated speeches for an MP
# ---------------------------------------------------------------------------

@app.get("/api/mp/{person_id}/speeches")
def get_mp_speeches(
    person_id: str,
    topic: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    db = get_db()
    conditions = ["s.person_id = ?"]
    params: list = [person_id]

    if topic:
        conditions.append(
            """s.speech_id IN (
                SELECT st.speech_id FROM speech_topics st
                JOIN topics t ON t.topic_id = st.topic_id
                WHERE t.name LIKE ?
            )"""
        )
        params.append(f"%{topic}%")

    where = " AND ".join(conditions)
    rows = db.execute(
        f"""
        SELECT s.speech_id, s.speaker_name, s.party, s.date, s.topic,
               substr(s.text, 1, 500) AS text, s.word_count
        FROM speeches s
        WHERE {where}
        ORDER BY s.date DESC
        LIMIT ? OFFSET ?
        """,
        params + [limit, offset],
    ).fetchall()

    total = db.execute(
        f"SELECT COUNT(*) AS c FROM speeches s WHERE {where}", params
    ).fetchone()["c"]

    return {
        "speeches": [dict(r) for r in rows],
        "count": len(rows),
        "total": total,
        "offset": offset,
        "limit": limit,
    }


# ---------------------------------------------------------------------------
# GET /api/mps — list MPs with optional search
# ---------------------------------------------------------------------------

@app.get("/api/mps")
def list_mps(
    search: Optional[str] = None,
    party: Optional[str] = None,
    chamber: Optional[str] = None,
    state: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
):
    db = get_db()
    conditions = []
    params = []

    if search:
        conditions.append("(full_name LIKE ? OR first_name LIKE ? OR last_name LIKE ?)")
        like = f"%{search}%"
        params.extend([like, like, like])
    if party:
        conditions.append("party LIKE ?")
        params.append(f"%{party}%")
    if chamber:
        conditions.append("m.chamber = ?")
        params.append(chamber)
    if state:
        conditions.append("m.electorate LIKE ?")
        params.append(f"%{state}%")

    where = " AND ".join(conditions) if conditions else "1=1"
    rows = db.execute(
        f"""
        SELECT m.person_id, m.full_name, m.party, m.electorate, m.chamber,
               COUNT(s.speech_id) as speech_count
        FROM members m
        LEFT JOIN speeches s ON s.person_id = m.person_id
        WHERE {where}
        GROUP BY m.person_id
        ORDER BY speech_count DESC
        LIMIT ?
        """,
        params + [limit],
    ).fetchall()

    return {"mps": [dict(r) for r in rows], "count": len(rows)}


# ---------------------------------------------------------------------------
# GET /api/topic/{topic_name} — topic analysis
# ---------------------------------------------------------------------------

@app.get("/api/topic/{topic_name}")
def get_topic(topic_name: str):
    db = get_db()

    # Speech count
    speech_count = db.execute(
        "SELECT COUNT(*) as count FROM speeches WHERE topic LIKE ?",
        (f"%{topic_name}%",),
    ).fetchone()["count"]

    # Party breakdown
    party_breakdown = db.execute(
        """
        SELECT party, COUNT(*) as count
        FROM speeches
        WHERE topic LIKE ? AND party IS NOT NULL AND party != ''
        GROUP BY party
        ORDER BY count DESC
        LIMIT 20
        """,
        (f"%{topic_name}%",),
    ).fetchall()

    # Top speakers
    top_speakers = db.execute(
        """
        SELECT speaker_name, party, COUNT(*) as count
        FROM speeches
        WHERE topic LIKE ? AND speaker_name IS NOT NULL
        GROUP BY speaker_name
        ORDER BY count DESC
        LIMIT 15
        """,
        (f"%{topic_name}%",),
    ).fetchall()

    # Related divisions
    divisions = db.execute(
        """
        SELECT division_id, name, date, aye_votes, no_votes, rebellions
        FROM divisions
        WHERE name LIKE ?
        ORDER BY date DESC
        LIMIT 10
        """,
        (f"%{topic_name}%",),
    ).fetchall()

    return {
        "topic": topic_name,
        "speech_count": speech_count,
        "party_breakdown": [dict(r) for r in party_breakdown],
        "top_speakers": [dict(r) for r in top_speakers],
        "divisions": [dict(r) for r in divisions],
    }


# ---------------------------------------------------------------------------
# GET /api/topic/{topic_name}/timeline — Speeches per year by party
# ---------------------------------------------------------------------------

@app.get("/api/topic/{topic_name}/timeline")
def topic_timeline(topic_name: str):
    db = get_db()
    rows = db.execute(
        """
        SELECT
            CAST(s.date AS TEXT) AS year,
            CASE
                WHEN s.party LIKE '%Labor%' OR s.party LIKE '%ALP%' THEN 'ALP'
                WHEN s.party LIKE '%Liberal%' THEN 'LIB'
                WHEN s.party LIKE '%National%' THEN 'NAT'
                WHEN s.party LIKE '%Green%' THEN 'GRN'
                WHEN s.party LIKE '%Independent%' OR s.party LIKE '%IND%' THEN 'IND'
                ELSE 'Other'
            END as party_group,
            COUNT(*) as count
        FROM speeches s
        JOIN speech_topics st ON st.speech_id = s.speech_id
        JOIN topics t ON t.topic_id = st.topic_id
        WHERE t.name LIKE ?
        GROUP BY year, party_group
        ORDER BY year
        """,
        (f"%{topic_name}%",),
    ).fetchall()

    timeline: dict[str, dict] = {}
    for r in rows:
        yr = r["year"]
        if yr not in timeline:
            timeline[yr] = {"year": yr, "ALP": 0, "LIB": 0, "NAT": 0, "GRN": 0, "IND": 0, "Other": 0}
        timeline[yr][r["party_group"]] = r["count"]

    return {"topic": topic_name, "timeline": list(timeline.values())}


# ---------------------------------------------------------------------------
# GET /api/topic/{topic_name}/mps — Top MPs by speech count for a topic
# ---------------------------------------------------------------------------

@app.get("/api/topic/{topic_name}/mps")
def topic_mps(
    topic_name: str,
    limit: int = Query(20, ge=1, le=100),
):
    db = get_db()
    rows = db.execute(
        """
        SELECT m.person_id, m.full_name, m.party, m.electorate, m.chamber,
               COUNT(*) as speech_count
        FROM speeches s
        JOIN speech_topics st ON st.speech_id = s.speech_id
        JOIN topics t ON t.topic_id = st.topic_id
        JOIN members m ON m.person_id = s.person_id
        WHERE t.name LIKE ?
        GROUP BY m.person_id
        ORDER BY speech_count DESC
        LIMIT ?
        """,
        (f"%{topic_name}%", limit),
    ).fetchall()

    return {
        "topic": topic_name,
        "mps": [
            {
                **dict(r),
                "photo_url": f"https://www.openaustralia.org.au/images/mpsL/{r['person_id']}.jpg",
            }
            for r in rows
        ],
        "count": len(rows),
    }


# ---------------------------------------------------------------------------
# GET /api/stories — Cross-cutting narrative discovery
# ---------------------------------------------------------------------------

@app.get("/api/stories")
def stories(
    type: str = Query(..., description="Story type: flip_floppers, donation_spikes, revolving_door, silent_beneficiaries, controversial_divisions, cross_party_agreement"),
):
    from parli.analysis.stories import VALID_TYPES, get_stories
    if type not in VALID_TYPES:
        return {"error": f"Invalid type. Must be one of: {VALID_TYPES}", "results": []}
    db = get_db()
    results = get_stories(type, db)
    return {"type": type, "count": len(results), "results": results}


# ---------------------------------------------------------------------------
# GET /api/gambling/stats — gambling-specific deep dive data
# ---------------------------------------------------------------------------

@app.get("/api/gambling/stats")
def gambling_stats():
    db = get_db()

    # Speeches by year by party
    timeline = db.execute(
        """
        SELECT
            CAST(date AS TEXT) AS year,
            CASE
                WHEN party LIKE '%Labor%' OR party LIKE '%ALP%' THEN 'ALP'
                WHEN party LIKE '%Liberal%' THEN 'LIB'
                WHEN party LIKE '%Green%' THEN 'GRN'
                WHEN party LIKE '%Independent%' OR party LIKE '%IND%' THEN 'IND'
                ELSE 'Other'
            END as party_group,
            COUNT(*) as count
        FROM speeches
        WHERE topic LIKE '%gambl%'
           OR topic LIKE '%poker%'
           OR topic LIKE '%pokie%'
           OR topic LIKE '%betting%'
           OR topic LIKE '%wagering%'
           OR topic LIKE '%casino%'
           OR text LIKE '%gambling%'
        GROUP BY year, party_group
        ORDER BY year
        """
    ).fetchall()

    # Pivot into timeline format
    timeline_dict: dict[str, dict[str, int]] = {}
    for r in timeline:
        yr = r["year"]
        if yr not in timeline_dict:
            timeline_dict[yr] = {"year": yr, "ALP": 0, "LIB": 0, "GRN": 0, "IND": 0, "Other": 0}
        timeline_dict[yr][r["party_group"]] = r["count"]
    timeline_data = list(timeline_dict.values())

    # Top gambling donors
    top_donors = db.execute(
        """
        SELECT donor_name, MAX(recipient) as recipient, SUM(amount) as total_amount,
               MIN(financial_year) as first_year, MAX(financial_year) as last_year,
               COUNT(*) as donation_count
        FROM donations
        WHERE industry LIKE '%gambl%'
           OR industry LIKE '%betting%'
           OR industry LIKE '%gaming%'
           OR donor_name LIKE '%Tabcorp%'
           OR donor_name LIKE '%Clubs NSW%'
           OR donor_name LIKE '%Sportsbet%'
           OR donor_name LIKE '%Star Entertainment%'
           OR donor_name LIKE '%wagering%'
        GROUP BY donor_name
        ORDER BY total_amount DESC
        LIMIT 10
        """
    ).fetchall()

    # Total gambling speeches and unique MPs
    speech_stats = db.execute(
        """
        SELECT COUNT(*) as count, COUNT(DISTINCT person_id) as mp_count
        FROM speeches
        WHERE topic LIKE '%gambl%'
           OR topic LIKE '%poker%'
           OR topic LIKE '%pokie%'
           OR topic LIKE '%betting%'
        """
    ).fetchone()
    total_speeches = speech_stats["count"]
    total_mps = speech_stats["mp_count"]

    # Total gambling donation amount
    donation_total_row = db.execute(
        """
        SELECT COALESCE(SUM(amount), 0) as total FROM donations
        WHERE industry = 'gambling'
        """
    ).fetchone()
    total_donation_amount = donation_total_row["total"]

    # Top gambling donors (aggregated by canonical name, limit 15)
    top_donors_aggregated = db.execute(
        """
        SELECT donor_name, SUM(amount) as total_amount,
               COUNT(*) as donation_count,
               MIN(financial_year) as first_year, MAX(financial_year) as last_year
        FROM donations
        WHERE industry = 'gambling'
        GROUP BY donor_name
        ORDER BY total_amount DESC
        LIMIT 15
        """
    ).fetchall()

    # Gambling divisions
    divisions = db.execute(
        """
        SELECT division_id, name, date, aye_votes, no_votes, rebellions
        FROM divisions
        WHERE name LIKE '%gambl%' OR name LIKE '%betting%' OR name LIKE '%poker%'
        ORDER BY date DESC
        """
    ).fetchall()

    # Party voting breakdown from analysis_cache (TVFY policy 39)
    party_support = None
    cache_row = db.execute(
        "SELECT value FROM analysis_cache WHERE key = 'gambling_party_support'"
    ).fetchone()
    if cache_row:
        try:
            party_support = json.loads(cache_row["value"])
        except (json.JSONDecodeError, TypeError):
            pass

    # Fallback hardcoded TVFY policy 39 data
    if not party_support:
        party_support = [
            {"party": "Greens", "support": 98.8, "color": "#00843D"},
            {"party": "Labor", "support": 67.4, "color": "#E13A3A"},
            {"party": "Independent", "support": 61.1, "color": "#888888"},
            {"party": "Nationals", "support": 4.7, "color": "#006644"},
            {"party": "Liberal", "support": 4.7, "color": "#1C4FA0"},
        ]

    # Disconnect rankings for gambling topic
    disconnect_data = []
    try:
        disconnect_rows = db.execute(
            """
            SELECT m.full_name as name, m.party, m.person_id,
                   d.disconnect_score, d.speech_count, d.vote_alignment,
                   d.pro_reform_speeches, d.anti_reform_speeches,
                   d.aligned_votes, d.misaligned_votes
            FROM mp_disconnect_scores d
            JOIN members m ON d.person_id = m.person_id
            WHERE d.topic_name = 'gambling'
            ORDER BY d.disconnect_score DESC
            LIMIT 10
            """
        ).fetchall()
        disconnect_data = [dict(r) for r in disconnect_rows]
    except Exception:
        pass  # Table may not exist

    return {
        "timeline": timeline_data,
        "top_donors": [dict(r) for r in top_donors],
        "top_donors_aggregated": [dict(r) for r in top_donors_aggregated],
        "total_speeches": total_speeches,
        "total_mps": total_mps,
        "total_donation_amount": total_donation_amount,
        "divisions": [dict(r) for r in divisions],
        "party_support": party_support,
        "disconnect_rankings": disconnect_data,
    }


# ---------------------------------------------------------------------------
# GET /api/stats — overall database statistics
# ---------------------------------------------------------------------------

@app.get("/api/stats")
def stats():
    db = get_db()

    def safe_count(sql: str) -> int:
        try:
            return db.execute(sql).fetchone()[0]
        except Exception:
            return 0

    def safe_row(sql: str):
        try:
            return db.execute(sql).fetchone()
        except Exception:
            return None

    # Core counts
    speeches = safe_count("SELECT COUNT(*) FROM speeches")
    members = safe_count("SELECT COUNT(*) FROM members")
    donations = safe_count("SELECT COUNT(*) FROM donations")
    votes = safe_count("SELECT COUNT(*) FROM votes")
    divisions = safe_count("SELECT COUNT(*) FROM divisions")
    contracts = safe_count("SELECT COUNT(*) FROM contracts")
    grants = safe_count("SELECT COUNT(*) FROM government_grants")
    expenses = safe_count("SELECT COUNT(*) FROM mp_expenses")
    lobbyist_firms = safe_count("SELECT COUNT(*) FROM federal_lobbyists")
    lobbyist_clients = safe_count("SELECT COUNT(*) FROM federal_lobbyist_clients")
    ministerial_meetings = safe_count("SELECT COUNT(*) FROM ministerial_meetings")
    board_appointments = safe_count("SELECT COUNT(*) FROM board_appointments")
    audit_reports = safe_count("SELECT COUNT(*) FROM audit_reports")
    news_articles = safe_count("SELECT COUNT(*) FROM news_articles")
    mp_interests = safe_count("SELECT COUNT(DISTINCT person_id) FROM mp_interests")
    electorates = safe_count("SELECT COUNT(*) FROM electorate_demographics")
    postcodes = safe_count("SELECT COUNT(*) FROM postcode_electorates")

    # Donation industry coverage
    donation_industry_pct = 0.0
    try:
        classified = db.execute(
            "SELECT COUNT(*) FROM donations WHERE industry IS NOT NULL AND industry != ''"
        ).fetchone()[0]
        if donations > 0:
            donation_industry_pct = round(classified / donations * 100, 1)
    except Exception:
        pass

    # Speech date range
    date_range_row = safe_row(
        "SELECT MIN(date) as min_date, MAX(date) as max_date FROM speeches WHERE date IS NOT NULL"
    )
    speech_min_date = date_range_row["min_date"] if date_range_row else None
    speech_max_date = date_range_row["max_date"] if date_range_row else None

    # Donation industry count
    donation_industries = safe_count(
        "SELECT COUNT(DISTINCT industry) FROM donations WHERE industry IS NOT NULL AND industry != ''"
    )

    return {
        "speeches": speeches,
        "members": members,
        "donations": donations,
        "votes": votes,
        "divisions": divisions,
        "contracts": contracts,
        "grants": grants,
        "expenses": expenses,
        "lobbyist_firms": lobbyist_firms,
        "lobbyist_clients": lobbyist_clients,
        "ministerial_meetings": ministerial_meetings,
        "board_appointments": board_appointments,
        "audit_reports": audit_reports,
        "news_articles": news_articles,
        "mp_interests": mp_interests,
        "electorates": electorates,
        "postcodes": postcodes,
        "donation_industries": donation_industries,
        "donation_industry_pct": donation_industry_pct,
        "speech_date_range": [speech_min_date, speech_max_date],
    }


# ---------------------------------------------------------------------------
# GET /api/donor-influence — party-industry donor-vote correlation scores
# ---------------------------------------------------------------------------

@app.get("/api/donor-influence")
def donor_influence(
    industry: Optional[str] = None,
    min_score: float = Query(0.0, ge=0.0),
    limit: int = Query(100, ge=1, le=500),
):
    """All party-industry donor-vote correlation scores."""
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    conditions = ["influence_score >= ?"]
    params: list = [min_score]

    if industry:
        conditions.append("industry = ?")
        params.append(industry)

    where = " AND ".join(conditions)
    rows = db.execute(
        f"""
        SELECT party, industry, total_donated, relevant_divisions,
               divisions_with_votes, total_votes_cast, aye_count, no_count,
               favorable_vote_pct, influence_score, updated_at
        FROM donor_influence_scores
        WHERE {where}
        ORDER BY influence_score DESC
        LIMIT ?
        """,
        params + [limit],
    ).fetchall()

    # Also return industry summary
    industry_summary = db.execute("""
        SELECT industry,
               AVG(influence_score) as avg_score,
               SUM(total_donated) as total_donated,
               AVG(favorable_vote_pct) as avg_aye_pct,
               COUNT(*) as party_count
        FROM donor_influence_scores
        WHERE divisions_with_votes > 0
        GROUP BY industry
        ORDER BY avg_score DESC
    """).fetchall()

    return {
        "scores": [dict(r) for r in rows],
        "count": len(rows),
        "industry_summary": [dict(r) for r in industry_summary],
    }


# ---------------------------------------------------------------------------
# GET /api/donor-influence/mp/{person_id} — per-MP donor-vote breakdown
# (must be registered BEFORE the {party} route to avoid "mp" matching as party)
# ---------------------------------------------------------------------------

@app.get("/api/donor-influence/mp/{person_id}")
def donor_influence_mp(person_id: str):
    """Donor-vote correlation scores for a specific MP."""
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    rows = db.execute(
        """
        SELECT person_id, full_name, party, industry,
               party_donations_from_industry, divisions_voted,
               aye_count, no_count, favorable_vote_pct, influence_score,
               updated_at
        FROM mp_donor_influence_scores
        WHERE person_id = ?
        ORDER BY influence_score DESC
        """,
        (person_id,),
    ).fetchall()

    if not rows:
        return {"error": f"No data for MP '{person_id}'", "scores": []}

    return {
        "person_id": person_id,
        "full_name": rows[0]["full_name"] if rows else None,
        "party": rows[0]["party"] if rows else None,
        "scores": [dict(r) for r in rows],
        "count": len(rows),
    }


# ---------------------------------------------------------------------------
# GET /api/donor-influence/{party} — specific party donor-vote breakdown
# ---------------------------------------------------------------------------

@app.get("/api/donor-influence/{party}")
def donor_influence_party(
    party: str,
    min_score: float = Query(0.0, ge=0.0),
):
    """Donor-vote correlation scores for a specific party."""
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    rows = db.execute(
        """
        SELECT party, industry, total_donated, relevant_divisions,
               divisions_with_votes, total_votes_cast, aye_count, no_count,
               favorable_vote_pct, influence_score, updated_at
        FROM donor_influence_scores
        WHERE UPPER(party) = UPPER(?) AND influence_score >= ?
        ORDER BY influence_score DESC
        """,
        (party, min_score),
    ).fetchall()

    if not rows:
        return {"error": f"No data for party '{party}'", "scores": []}

    # Per-MP breakdown for this party
    mp_rows = db.execute(
        """
        SELECT person_id, full_name, party, industry,
               party_donations_from_industry, divisions_voted,
               aye_count, no_count, favorable_vote_pct, influence_score
        FROM mp_donor_influence_scores
        WHERE UPPER(party) = UPPER(?)
        ORDER BY influence_score DESC
        LIMIT 50
        """,
        (party,),
    ).fetchall()

    return {
        "party": party,
        "scores": [dict(r) for r in rows],
        "count": len(rows),
        "top_mps": [dict(r) for r in mp_rows],
    }


# ---------------------------------------------------------------------------
# GET /api/donations — query donations
# ---------------------------------------------------------------------------

@app.get("/api/donations")
def donations(
    donor: Optional[str] = None,
    recipient: Optional[str] = None,
    industry: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
):
    db = get_db()
    conditions = []
    params = []

    if donor:
        conditions.append("donor_name LIKE ?")
        params.append(f"%{donor}%")
    if recipient:
        conditions.append("recipient LIKE ?")
        params.append(f"%{recipient}%")
    if industry:
        conditions.append("industry LIKE ?")
        params.append(f"%{industry}%")

    where = " AND ".join(conditions) if conditions else "1=1"
    rows = db.execute(
        f"""
        SELECT donation_id, donor_name, recipient, amount, financial_year,
               donor_type, industry
        FROM donations
        WHERE {where}
        ORDER BY amount DESC
        LIMIT ?
        """,
        params + [limit],
    ).fetchall()

    return {"donations": [dict(r) for r in rows], "count": len(rows)}


# ---------------------------------------------------------------------------
# GET /api/compare — side-by-side MP comparison
# ---------------------------------------------------------------------------

@app.get("/api/compare")
def compare_mps(
    a: str = Query(..., description="person_id of first MP"),
    b: str = Query(..., description="person_id of second MP"),
):
    """Return profiles, speech counts by topic, policy scores, and donors
    for two MPs in a single response."""
    db = get_db()

    def _build_profile(person_id: str) -> dict:
        member = db.execute(
            "SELECT * FROM members WHERE person_id = ?", (person_id,)
        ).fetchone()
        if not member:
            return {"error": f"MP {person_id} not found"}

        result = dict(member)
        result["photo_url"] = (
            f"https://www.openaustralia.org.au/images/mpsL/{person_id}.jpg"
        )

        # Speech stats
        speech_stats = db.execute(
            """
            SELECT COUNT(*) as speech_count,
                   MIN(date) as first_speech,
                   MAX(date) as last_speech
            FROM speeches WHERE person_id = ?
            """,
            (person_id,),
        ).fetchone()
        result["speech_count"] = speech_stats["speech_count"]
        result["first_speech"] = speech_stats["first_speech"]
        result["last_speech"] = speech_stats["last_speech"]

        # Top topics by speech count (from speech_topics join)
        top_topics = db.execute(
            """
            SELECT t.name, COUNT(*) as count
            FROM speech_topics st
            JOIN topics t ON t.topic_id = st.topic_id
            JOIN speeches s ON s.speech_id = st.speech_id
            WHERE s.person_id = ?
            GROUP BY t.name
            ORDER BY count DESC
            LIMIT 10
            """,
            (person_id,),
        ).fetchall()
        result["top_topics"] = [dict(r) for r in top_topics]

        # Policy scores from TVFY cache
        cache_row = db.execute(
            "SELECT value FROM analysis_cache WHERE key = ?",
            (f"tvfy_person_{person_id}",),
        ).fetchone()
        if cache_row:
            try:
                tvfy_data = json.loads(cache_row["value"])
                comparisons = tvfy_data.get("policy_comparisons", [])
                voted = [c for c in comparisons if c.get("voted")]
                result["policy_scores"] = [
                    {
                        "policy_id": c["policy"]["id"],
                        "policy_name": c["policy"]["name"],
                        "agreement": c["agreement"],
                    }
                    for c in voted
                ]
                result["rebellions"] = tvfy_data.get("rebellions")
                result["votes_attended"] = tvfy_data.get("votes_attended")
                result["votes_possible"] = tvfy_data.get("votes_possible")
            except (json.JSONDecodeError, TypeError):
                result["policy_scores"] = []
        else:
            result["policy_scores"] = []

        # Voting record summary
        vote_summary = db.execute(
            """
            SELECT vote, COUNT(*) as count
            FROM votes
            WHERE person_id = ?
            GROUP BY vote
            """,
            (person_id,),
        ).fetchall()
        result["votes"] = {r["vote"]: r["count"] for r in vote_summary}

        # Top donors to this MP's party
        if result.get("party"):
            top_donors = db.execute(
                """
                SELECT donor_name, SUM(amount) as total, COUNT(*) as donation_count,
                       industry
                FROM donations
                WHERE recipient LIKE ?
                GROUP BY donor_name
                ORDER BY total DESC
                LIMIT 10
                """,
                (f"%{result['party'].split()[0]}%",),
            ).fetchall()
            result["top_party_donors"] = [dict(r) for r in top_donors]

        return result

    mp_a = _build_profile(a)
    mp_b = _build_profile(b)

    return {"a": mp_a, "b": mp_b}


# ---------------------------------------------------------------------------
# POST /api/ask — RAG question answering
# ---------------------------------------------------------------------------

@app.post("/api/ask")
def ask(req: AskRequest):
    from parli.rag import get_context

    context, metadata = get_context(req.question, top_k=req.top_k)

    # If ANTHROPIC_API_KEY is set, call the full RAG pipeline
    if os.environ.get("ANTHROPIC_API_KEY"):
        # Streaming mode: return Server-Sent Events
        if req.stream:
            def _generate_sse():
                from parli.rag import query_stream
                try:
                    for chunk in query_stream(req.question, top_k=req.top_k):
                        if isinstance(chunk, dict):
                            # Final metadata chunk
                            yield f"event: metadata\ndata: {json.dumps(chunk, default=str)}\n\n"
                            yield "event: done\ndata: {}\n\n"
                        else:
                            yield f"data: {json.dumps(chunk)}\n\n"
                except Exception as e:
                    yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

            return StreamingResponse(
                _generate_sse(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "X-Accel-Buffering": "no",
                },
            )

        # Non-streaming mode
        try:
            from parli.rag import query as rag_query
            result = rag_query(req.question, top_k=req.top_k)
            return {
                "answer": result["answer"],
                "sources": result["sources"],
                "context": result["context_used"],
                "metadata": {
                    "topics_detected": result["metadata"]["topics_detected"],
                    "mps_mentioned": result["metadata"]["mps_mentioned"],
                    "donation_total": result["metadata"]["donation_total"],
                    "confidence": result["metadata"]["confidence"],
                    "speech_count": result["metadata"]["speech_count"],
                    "unique_speakers": result["metadata"]["unique_speakers"],
                    "division_count": result["metadata"]["division_count"],
                },
            }
        except Exception as e:
            # Fall back to context-only mode
            return {
                "answer": None,
                "error": str(e),
                "context": context,
                "sources": [],
                "metadata": metadata,
            }

    # Context-only mode — let the frontend handle the LLM call
    return {
        "answer": None,
        "context": context,
        "sources": [],
        "metadata": metadata,
    }


# ---------------------------------------------------------------------------
# GET /api/electorates — list all electorates with current MP
# ---------------------------------------------------------------------------

@app.get("/api/electorates")
def list_electorates():
    db = get_db()
    rows = db.execute(
        """
        SELECT m.electorate, m.full_name, m.party, m.person_id,
               COUNT(s.speech_id) as speech_count
        FROM members m
        LEFT JOIN speeches s ON s.person_id = m.person_id
        WHERE m.electorate IS NOT NULL AND m.chamber = 'representatives'
        GROUP BY m.electorate
        ORDER BY m.electorate
        """
    ).fetchall()

    return {
        "electorates": [
            {
                "electorate": r["electorate"],
                "mp": r["full_name"],
                "party": r["party"],
                "personId": r["person_id"],
                "speeches": r["speech_count"],
            }
            for r in rows
        ],
        "count": len(rows),
    }


# ---------------------------------------------------------------------------
# GET /api/electorate/{name} — electorate detail with MP, topics, donations
# ---------------------------------------------------------------------------

@app.get("/api/electorate/{name}")
def get_electorate(name: str):
    db = get_db()

    # Find the member for this electorate (representatives only)
    member = db.execute(
        """
        SELECT * FROM members
        WHERE electorate = ? AND chamber = 'representatives'
        LIMIT 1
        """,
        (name,),
    ).fetchone()

    if not member:
        return {"error": "Electorate not found"}

    person_id = member["person_id"]
    result_mp = dict(member)
    result_mp["photo_url"] = (
        f"https://www.openaustralia.org.au/images/mpsL/{person_id}.jpg"
    )

    # Speech count and date range
    speech_stats = db.execute(
        """
        SELECT COUNT(*) as speech_count,
               MIN(date) as first_speech,
               MAX(date) as last_speech
        FROM speeches WHERE person_id = ?
        """,
        (person_id,),
    ).fetchone()
    result_mp["speech_count"] = speech_stats["speech_count"]
    result_mp["first_speech"] = speech_stats["first_speech"]
    result_mp["last_speech"] = speech_stats["last_speech"]

    # Top topics
    top_topics = db.execute(
        """
        SELECT topic, COUNT(*) as count
        FROM speeches
        WHERE person_id = ? AND topic IS NOT NULL AND topic != ''
        GROUP BY topic
        ORDER BY count DESC
        LIMIT 10
        """,
        (person_id,),
    ).fetchall()
    result_mp["top_topics"] = [dict(r) for r in top_topics]

    # Voting record
    vote_summary = db.execute(
        """
        SELECT vote, COUNT(*) as count
        FROM votes
        WHERE person_id = ?
        GROUP BY vote
        """,
        (person_id,),
    ).fetchall()
    result_mp["votes"] = {r["vote"]: r["count"] for r in vote_summary}

    # Donations to this MP's party
    donations: list[dict] = []
    if member["party"]:
        party_keyword = member["party"].split()[0]
        if party_keyword in ("Australian", "Pauline", "Katter's"):
            party_keyword = member["party"]
        top_donors = db.execute(
            """
            SELECT donor_name, SUM(amount) as total, COUNT(*) as donation_count,
                   industry
            FROM donations
            WHERE recipient LIKE ?
            GROUP BY donor_name
            ORDER BY total DESC
            LIMIT 10
            """,
            (f"%{party_keyword}%",),
        ).fetchall()
        donations = [dict(r) for r in top_donors]

    # Include demographics if available
    demographics = db.execute(
        "SELECT * FROM electorate_demographics WHERE electorate_name = ?",
        (name,),
    ).fetchone()

    return {
        "electorate": name,
        "mp": result_mp,
        "donations": donations,
        "demographics": dict(demographics) if demographics else None,
    }


# ---------------------------------------------------------------------------
# GET /api/electorates/{name}/demographics — Electorate demographic profile
# ---------------------------------------------------------------------------

@app.get("/api/electorates/{name}/demographics")
def get_electorate_demographics(name: str):
    db = get_db()

    row = db.execute(
        "SELECT * FROM electorate_demographics WHERE electorate_name = ?",
        (name,),
    ).fetchone()

    if not row:
        # Try case-insensitive match
        row = db.execute(
            "SELECT * FROM electorate_demographics WHERE LOWER(electorate_name) = LOWER(?)",
            (name,),
        ).fetchone()

    if not row:
        return {"error": f"No demographic data found for electorate '{name}'"}

    demographics = dict(row)

    # Find the MP for this electorate
    member = db.execute(
        """
        SELECT person_id, full_name, party FROM members
        WHERE electorate = ? AND chamber = 'representatives'
        LIMIT 1
        """,
        (name,),
    ).fetchone()

    if not member:
        # Try case-insensitive
        member = db.execute(
            """
            SELECT person_id, full_name, party FROM members
            WHERE LOWER(electorate) = LOWER(?) AND chamber = 'representatives'
            LIMIT 1
            """,
            (name,),
        ).fetchone()

    mp_info = None
    if member:
        mp_info = {
            "personId": member["person_id"],
            "name": member["full_name"],
            "party": member["party"],
        }

    # Compare to national averages
    averages = db.execute(
        """
        SELECT
            ROUND(AVG(median_income), 0) as avg_income,
            ROUND(AVG(median_age), 1) as avg_age,
            ROUND(AVG(unemployment_rate), 1) as avg_unemployment,
            ROUND(AVG(homeownership_pct), 1) as avg_homeownership,
            ROUND(AVG(rental_pct), 1) as avg_rental,
            ROUND(AVG(born_overseas_pct), 1) as avg_overseas,
            ROUND(AVG(university_pct), 1) as avg_university,
            ROUND(AVG(indigenous_pct), 1) as avg_indigenous
        FROM electorate_demographics
        """
    ).fetchone()

    # Rank this electorate among all electorates
    total = db.execute("SELECT COUNT(*) as n FROM electorate_demographics").fetchone()["n"]

    income_rank = db.execute(
        "SELECT COUNT(*) + 1 as rank FROM electorate_demographics WHERE median_income > ?",
        (demographics.get("median_income") or 0,),
    ).fetchone()["rank"]

    unemployment_rank = db.execute(
        "SELECT COUNT(*) + 1 as rank FROM electorate_demographics WHERE unemployment_rate > ?",
        (demographics.get("unemployment_rate") or 0,),
    ).fetchone()["rank"]

    # Check for representation gap stories
    stories = db.execute(
        "SELECT value FROM analysis_cache WHERE key = 'stories_unrepresentative'"
    ).fetchone()

    representation_gaps = []
    if stories:
        import json
        data = json.loads(stories["value"])
        for story in data.get("stories", []):
            for mp in story.get("mps", []):
                if mp.get("electorate", "").lower() == name.lower():
                    representation_gaps.append({
                        "type": story["type"],
                        "division": story["division"],
                        "date": story.get("division_date"),
                        "description": story["description"],
                    })

    return {
        "electorate": name,
        "demographics": demographics,
        "mp": mp_info,
        "national_averages": dict(averages) if averages else None,
        "rankings": {
            "income_rank": income_rank,
            "unemployment_rank": unemployment_rank,
            "total_electorates": total,
        },
        "representation_gaps": representation_gaps,
    }


# ---------------------------------------------------------------------------
# GET /api/network — Influence network: donors -> parties -> policy outcomes
# ---------------------------------------------------------------------------

@app.get("/api/network")
def network(
    industry: Optional[str] = Query(None, description="Filter by industry (gambling, mining, etc.)"),
    min_amount: float = Query(500000, description="Minimum total donation amount"),
    limit: int = Query(40, ge=1, le=100),
):
    db = get_db()
    conditions = ["industry IS NOT NULL"]
    params: list = []

    if industry and industry != "all":
        conditions.append("industry LIKE ?")
        params.append(f"%{industry}%")

    where = " AND ".join(conditions)

    # Get donor -> party edges, normalising party names
    rows = db.execute(
        f"""
        SELECT donor_name,
               CASE
                   WHEN recipient LIKE '%Labor%' OR recipient LIKE '%ALP%' THEN 'ALP'
                   WHEN recipient LIKE '%Liberal%' OR recipient LIKE '%LIB%' THEN 'Liberal'
                   WHEN recipient LIKE '%National%' OR recipient LIKE '%NAT%' THEN 'Nationals'
                   WHEN recipient LIKE '%Green%' OR recipient LIKE '%GRN%' THEN 'Greens'
                   WHEN recipient LIKE '%United Australia%' OR recipient LIKE '%Palmer%' THEN 'UAP'
                   WHEN recipient LIKE '%One Nation%' THEN 'One Nation'
                   ELSE 'Other'
               END as party,
               SUM(amount) as total,
               industry,
               COUNT(*) as donation_count,
               MIN(financial_year) as first_year,
               MAX(financial_year) as last_year
        FROM donations
        WHERE {where}
        GROUP BY donor_name, party, industry
        HAVING total >= ? AND party != 'Other'
        ORDER BY total DESC
        LIMIT ?
        """,
        params + [min_amount, limit],
    ).fetchall()

    # Build unique nodes and edges
    nodes = []
    edges = []
    seen_donors: set[str] = set()
    seen_parties: set[str] = set()

    party_colors = {
        "ALP": "#E13A3A",
        "Liberal": "#1C4FA0",
        "Nationals": "#006644",
        "Greens": "#00843D",
        "UAP": "#FFD700",
        "One Nation": "#FF6600",
    }

    industry_colors = {
        "mining": "#F59E0B",
        "finance": "#3B82F6",
        "gambling": "#10B981",
        "property": "#8B5CF6",
        "fossil_fuels": "#374151",
        "unions": "#EF4444",
        "health": "#EC4899",
        "pharmacy": "#06B6D4",
        "tobacco": "#78716C",
        "tech": "#6366F1",
        "alcohol": "#D97706",
        "media": "#14B8A6",
    }

    for r in rows:
        donor_id = r["donor_name"].lower().replace(" ", "_").replace(".", "")[:40]
        party_id = r["party"].lower().replace(" ", "_")
        ind = r["industry"]

        if donor_id not in seen_donors:
            seen_donors.add(donor_id)
            nodes.append({
                "id": donor_id,
                "type": "donor",
                "label": r["donor_name"],
                "industry": ind,
                "color": industry_colors.get(ind, "#8b949e"),
            })

        if party_id not in seen_parties:
            seen_parties.add(party_id)
            nodes.append({
                "id": party_id,
                "type": "party",
                "label": r["party"],
                "color": party_colors.get(r["party"], "#8b949e"),
            })

        # Format amount label
        total = r["total"]
        if total >= 1_000_000_000:
            label = f"${total / 1_000_000_000:.1f}B"
        elif total >= 1_000_000:
            label = f"${total / 1_000_000:.1f}M"
        elif total >= 1_000:
            label = f"${total / 1_000:.0f}K"
        else:
            label = f"${total:,.0f}"

        edges.append({
            "from": donor_id,
            "to": party_id,
            "amount": total,
            "label": label,
            "donation_count": r["donation_count"],
            "years": f"{r['first_year'] or '?'}-{r['last_year'] or '?'}",
            "industry": ind,
        })

    # Also return available industries for the filter dropdown
    industries = db.execute(
        """
        SELECT industry, COUNT(*) as cnt, SUM(amount) as total
        FROM donations
        WHERE industry IS NOT NULL
        GROUP BY industry
        ORDER BY total DESC
        """
    ).fetchall()

    return {
        "nodes": nodes,
        "edges": edges,
        "industries": [{"name": r["industry"], "count": r["cnt"], "total": r["total"]} for r in industries],
    }


# ---------------------------------------------------------------------------
# GET /api/mp/{person_id}/insights — RAG-powered investigative summary
# ---------------------------------------------------------------------------

@app.get("/api/mp/{person_id}/insights")
def mp_insights(person_id: str):
    """Return speech stats, top topics, notable quotes, speech timeline,
    and policy scores for an MP.  Results are cached in analysis_cache."""
    db = get_db()

    member = db.execute(
        "SELECT full_name, party FROM members WHERE person_id = ?",
        (person_id,),
    ).fetchone()
    if not member:
        return {"error": "not found"}

    # Check cache first
    cache_key = f"mp_insights_{person_id}"
    cached = db.execute(
        "SELECT value FROM analysis_cache WHERE key = ?", (cache_key,)
    ).fetchone()
    if cached:
        try:
            return json.loads(cached["value"])
        except (json.JSONDecodeError, TypeError):
            pass

    # Speech count
    speech_count = db.execute(
        "SELECT COUNT(*) AS c FROM speeches WHERE person_id = ?",
        (person_id,),
    ).fetchone()["c"]

    # Top topics via speech_topics join
    top_topics = db.execute(
        """
        SELECT t.name, COUNT(*) AS cnt
        FROM speeches s
        JOIN speech_topics st ON s.speech_id = st.speech_id
        JOIN topics t ON st.topic_id = t.topic_id
        WHERE s.person_id = ?
        GROUP BY t.name
        ORDER BY cnt DESC
        LIMIT 10
        """,
        (person_id,),
    ).fetchall()

    # Notable quotes — longest substantive speeches
    quotes = db.execute(
        """
        SELECT date, topic, substr(text, 1, 300) AS excerpt
        FROM speeches
        WHERE person_id = ? AND length(text) > 200
        ORDER BY length(text) DESC
        LIMIT 5
        """,
        (person_id,),
    ).fetchall()

    # Speech timeline — speeches per year
    timeline = db.execute(
        """
        SELECT CAST(date AS TEXT) AS year, COUNT(*) AS count
        FROM speeches
        WHERE person_id = ? AND date IS NOT NULL
        GROUP BY year
        ORDER BY year
        """,
        (person_id,),
    ).fetchall()

    # Policy scores from TVFY cache
    policy_scores = []
    tvfy_row = db.execute(
        "SELECT value FROM analysis_cache WHERE key = ?",
        (f"tvfy_person_{person_id}",),
    ).fetchone()
    if tvfy_row:
        try:
            tvfy_data = json.loads(tvfy_row["value"])
            comparisons = tvfy_data.get("policy_comparisons", [])
            policy_scores = [
                {
                    "policy_name": c["policy"]["name"],
                    "agreement": c["agreement"],
                }
                for c in comparisons
                if c.get("voted")
            ]
        except (json.JSONDecodeError, TypeError):
            pass

    result = {
        "person_id": person_id,
        "full_name": member["full_name"],
        "party": member["party"],
        "speech_count": speech_count,
        "top_topics": [{"name": r["name"], "count": r["cnt"]} for r in top_topics],
        "notable_quotes": [
            {"date": r["date"], "topic": r["topic"], "excerpt": r["excerpt"]}
            for r in quotes
        ],
        "speech_timeline": [
            {"year": r["year"], "count": r["count"]} for r in timeline
        ],
        "policy_scores": policy_scores,
    }

    # Cache it
    db.execute(
        "INSERT OR REPLACE INTO analysis_cache(key, value) VALUES (?, ?)",
        (cache_key, json.dumps(result)),
    )
    db.commit()
    return result


# ---------------------------------------------------------------------------
# GET /api/mp/{person_id}/speeches/highlights — Best quotes per topic
# ---------------------------------------------------------------------------

@app.get("/api/mp/{person_id}/speeches/highlights")
def mp_speech_highlights(person_id: str):
    """For each of an MP's top topics, return their longest substantive speech
    excerpt — i.e. the quote that best represents their position."""
    db = get_db()

    member = db.execute(
        "SELECT full_name FROM members WHERE person_id = ?",
        (person_id,),
    ).fetchone()
    if not member:
        return {"error": "not found"}

    # Get top 5 topics for this MP
    top_topics = db.execute(
        """
        SELECT t.name, t.topic_id, COUNT(*) AS cnt
        FROM speeches s
        JOIN speech_topics st ON s.speech_id = st.speech_id
        JOIN topics t ON st.topic_id = t.topic_id
        WHERE s.person_id = ?
        GROUP BY t.name
        ORDER BY cnt DESC
        LIMIT 5
        """,
        (person_id,),
    ).fetchall()

    highlights = []
    for t in top_topics:
        # Find their longest speech on this topic
        best = db.execute(
            """
            SELECT s.date, s.topic, substr(s.text, 1, 400) AS excerpt,
                   s.word_count
            FROM speeches s
            JOIN speech_topics st ON s.speech_id = st.speech_id
            WHERE s.person_id = ? AND st.topic_id = ?
                  AND length(s.text) > 100
            ORDER BY length(s.text) DESC
            LIMIT 1
            """,
            (person_id, t["topic_id"]),
        ).fetchone()

        highlights.append({
            "topic": t["name"],
            "speech_count": t["cnt"],
            "best_quote": {
                "date": best["date"],
                "hansard_topic": best["topic"],
                "excerpt": best["excerpt"],
                "word_count": best["word_count"],
            } if best else None,
        })

    return {
        "person_id": person_id,
        "full_name": member["full_name"],
        "highlights": highlights,
    }


# ---------------------------------------------------------------------------
# GET /api/mp/{person_id}/consistency — Say-vs-do consistency per topic
# ---------------------------------------------------------------------------

@app.get("/api/mp/{person_id}/consistency")
def mp_consistency(person_id: str):
    """Return speech-vs-vote consistency for an MP across all analysed topics.

    Uses the precomputed consistency analysis (analysis_cache), falling back
    to live computation via parli.analysis.consistency if needed."""
    db = get_db()

    member = db.execute(
        "SELECT full_name, party FROM members WHERE person_id = ?",
        (person_id,),
    ).fetchone()
    if not member:
        return {"error": "not found"}

    # Try the cached per-MP report first
    cache_key = f"mp_consistency_{person_id}"
    cached = db.execute(
        "SELECT value FROM analysis_cache WHERE key = ?", (cache_key,)
    ).fetchone()
    if cached:
        try:
            return json.loads(cached["value"])
        except (json.JSONDecodeError, TypeError):
            pass

    # Compute live
    try:
        from parli.analysis.consistency import get_mp_consistency_report
        report = get_mp_consistency_report(person_id, db=db)
    except Exception:
        report = {"topics": {}, "overall_consistency": -1}

    # Also pull TVFY policy scores to pair with speech topics
    policy_scores: dict[str, float] = {}
    tvfy_row = db.execute(
        "SELECT value FROM analysis_cache WHERE key = ?",
        (f"tvfy_person_{person_id}",),
    ).fetchone()
    if tvfy_row:
        try:
            tvfy_data = json.loads(tvfy_row["value"])
            for c in tvfy_data.get("policy_comparisons", []):
                if c.get("voted"):
                    policy_scores[c["policy"]["name"].lower()] = c["agreement"]
        except (json.JSONDecodeError, TypeError):
            pass

    # Build per-topic consistency items
    items = []
    for topic_name, data in report.get("topics", {}).items():
        # Try to match a TVFY policy score to this topic
        tvfy_score = None
        for pname, score in policy_scores.items():
            if topic_name.lower() in pname or pname in topic_name.lower():
                tvfy_score = score
                break

        consistency_score = data.get("consistency_score", -1)
        if consistency_score >= 75:
            badge = "ALIGNED"
        elif consistency_score >= 40:
            badge = "MIXED"
        elif consistency_score >= 0:
            badge = "DISCONNECT"
        else:
            badge = "INSUFFICIENT_DATA"

        items.append({
            "topic": topic_name,
            "speeches_count": data.get("speeches_count", 0),
            "supportive_speeches": data.get("supportive_speeches", 0),
            "opposing_speeches": data.get("opposing_speeches", 0),
            "consistency_score": consistency_score,
            "tvfy_agreement": tvfy_score,
            "badge": badge,
        })

    result = {
        "person_id": person_id,
        "full_name": member["full_name"],
        "party": member["party"],
        "overall_consistency": report.get("overall_consistency", -1),
        "topics": items,
        "policy_scores": [
            {"policy_name": k, "agreement": v}
            for k, v in policy_scores.items()
        ],
    }

    # Cache it
    db.execute(
        "INSERT OR REPLACE INTO analysis_cache(key, value) VALUES (?, ?)",
        (cache_key, json.dumps(result)),
    )
    db.commit()
    return result


# ---------------------------------------------------------------------------
# GET /api/bills — search and filter bills
# ---------------------------------------------------------------------------

@app.get("/api/bills")
def list_bills(
    status: Optional[str] = Query(None, description="Filter by status: passed, lapsed, before_parliament"),
    search: Optional[str] = Query(None, description="Search bill titles"),
    portfolio: Optional[str] = Query(None, description="Filter by portfolio"),
    house: Optional[str] = Query(None, description="Filter by originating house"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    db = get_db()
    conditions = []
    params: list = []

    if status:
        conditions.append("b.status = ?")
        params.append(status)
    if search:
        conditions.append("b.title LIKE ?")
        params.append(f"%{search}%")
    if portfolio:
        conditions.append("b.portfolio LIKE ?")
        params.append(f"%{portfolio}%")
    if house:
        conditions.append("b.house LIKE ?")
        params.append(f"%{house}%")

    where = " AND ".join(conditions) if conditions else "1=1"

    rows = db.execute(
        f"""
        SELECT b.bill_id, b.title, b.status, b.portfolio, b.introduced_date, b.house
        FROM bills b
        WHERE {where}
        ORDER BY b.introduced_date DESC
        LIMIT ? OFFSET ?
        """,
        params + [limit, offset],
    ).fetchall()

    total = db.execute(
        f"SELECT COUNT(*) AS c FROM bills b WHERE {where}", params
    ).fetchone()["c"]

    # Summary stats
    bill_stats = {}
    bill_stats["total"] = db.execute("SELECT COUNT(*) AS c FROM bills").fetchone()["c"]

    status_counts = db.execute(
        "SELECT status, COUNT(*) AS c FROM bills GROUP BY status ORDER BY c DESC"
    ).fetchall()
    bill_stats["by_status"] = {r["status"]: r["c"] for r in status_counts}

    top_portfolios = db.execute(
        """
        SELECT portfolio, COUNT(*) AS c FROM bills
        WHERE portfolio IS NOT NULL
        GROUP BY portfolio ORDER BY c DESC LIMIT 15
        """
    ).fetchall()
    bill_stats["top_portfolios"] = [{"portfolio": r["portfolio"], "count": r["c"]} for r in top_portfolios]

    return {
        "bills": [dict(r) for r in rows],
        "count": len(rows),
        "total": total,
        "offset": offset,
        "limit": limit,
        "stats": bill_stats,
    }


# ---------------------------------------------------------------------------
# GET /api/bills/{bill_id} — full bill detail with progress stages
# ---------------------------------------------------------------------------

@app.get("/api/bills/{bill_id}")
def get_bill(bill_id: int):
    db = get_db()

    bill = db.execute(
        "SELECT * FROM bills WHERE bill_id = ?", (bill_id,)
    ).fetchone()
    if not bill:
        return {"error": "Bill not found"}, 404

    result = dict(bill)

    # Progress stages
    progress = db.execute(
        """
        SELECT progress_id, stage, date, house, event_raw
        FROM bill_progress
        WHERE bill_id = ?
        ORDER BY date ASC, progress_id ASC
        """,
        (bill_id,),
    ).fetchall()
    result["progress"] = [dict(r) for r in progress]

    # Related speeches (match bill title keywords against speech topics)
    title_words = [
        w for w in result["title"].split()
        if len(w) > 3 and w.lower() not in (
            "bill", "amendment", "the", "and", "for", "act",
            "2019", "2020", "2021", "2022", "1998", "1999",
            "2000", "2001", "2002", "2003", "2004", "2005",
            "2006", "2007", "2008", "2009", "2010", "2011",
            "2012", "2013", "2014", "2015", "2016", "2017",
            "2018", "no.",
        )
    ]
    related_speeches = []
    if title_words:
        search_terms = title_words[:3]
        like_clause = " AND ".join(["topic LIKE ?" for _ in search_terms])
        like_params = [f"%{w}%" for w in search_terms]
        related_speeches = db.execute(
            f"""
            SELECT speech_id, speaker_name, party, date, topic,
                   substr(text, 1, 300) AS text
            FROM speeches
            WHERE {like_clause}
            ORDER BY date DESC
            LIMIT 10
            """,
            like_params,
        ).fetchall()
    result["related_speeches"] = [dict(r) for r in related_speeches]

    return result


# ---------------------------------------------------------------------------
# Postcode -> electorate mapping (top ~50 major postcodes)
# ---------------------------------------------------------------------------

POSTCODE_TO_ELECTORATE = {
    # Melbourne CBD & inner
    "3000": "Melbourne", "3001": "Melbourne", "3002": "Melbourne Ports",
    "3003": "Melbourne", "3004": "Higgins", "3006": "Melbourne Ports",
    "3008": "Melbourne", "3010": "Melbourne", "3011": "Gellibrand",
    "3031": "Maribyrnong", "3053": "Melbourne", "3065": "Melbourne",
    "3121": "Higgins", "3141": "Higgins", "3161": "Goldstein",
    "3181": "Higgins", "3182": "Goldstein", "3183": "Goldstein",
    "3205": "Melbourne Ports", "3206": "Melbourne Ports",
    # Melbourne outer
    "3128": "Kooyong", "3144": "Kooyong", "3146": "Kooyong",
    "3168": "Hotham", "3170": "Hotham", "3150": "Bruce",
    "3175": "Isaacs", "3195": "Isaacs",
    # Sydney CBD & inner
    "2000": "Sydney", "2001": "Sydney", "2010": "Sydney",
    "2011": "Sydney", "2015": "Kingsford Smith", "2016": "Wentworth",
    "2017": "Barton", "2020": "Kingsford Smith",
    "2021": "Wentworth", "2025": "Wentworth", "2026": "Wentworth",
    "2027": "Wentworth", "2028": "Wentworth", "2030": "Wentworth",
    "2031": "Kingsford Smith",
    "2040": "Grayndler", "2042": "Grayndler", "2043": "Grayndler",
    "2044": "Barton", "2050": "Grayndler",
    # Sydney outer
    "2060": "North Sydney", "2065": "North Sydney",
    "2070": "Bradfield", "2075": "Bradfield", "2076": "Bradfield",
    "2100": "Mackellar", "2099": "Warringah", "2095": "Warringah",
    "2145": "Greenway", "2150": "Parramatta", "2151": "Parramatta",
    "2170": "Werriwa", "2171": "Werriwa",
    "2200": "Watson", "2205": "Barton",
    "2750": "Lindsay", "2560": "Macarthur",
    # Brisbane
    "4000": "Brisbane", "4001": "Brisbane", "4005": "Brisbane",
    "4006": "Brisbane", "4051": "Ryan", "4064": "Ryan",
    "4101": "Griffith", "4102": "Griffith", "4120": "Griffith",
    "4151": "Griffith", "4169": "Griffith",
    "4211": "Fadden", "4217": "McPherson", "4220": "McPherson",
    # Perth
    "6000": "Perth", "6003": "Perth", "6005": "Curtin",
    "6008": "Curtin", "6009": "Curtin", "6050": "Perth",
    "6100": "Swan", "6151": "Tangney", "6155": "Tangney",
    # Adelaide
    "5000": "Adelaide", "5001": "Adelaide", "5006": "Adelaide",
    "5031": "Hindmarsh", "5034": "Boothby", "5042": "Boothby",
    "5045": "Hindmarsh", "5061": "Boothby",
    # Hobart
    "7000": "Clark", "7001": "Clark", "7004": "Clark",
    "7005": "Clark", "7009": "Clark", "7010": "Franklin",
    # Canberra
    "2600": "Canberra", "2601": "Canberra", "2602": "Canberra",
    "2604": "Canberra", "2606": "Canberra",
    "2611": "Bean", "2614": "Fenner", "2615": "Fenner",
    # Darwin
    "0800": "Solomon", "0801": "Solomon", "0810": "Solomon",
    "0820": "Solomon",
}


# ---------------------------------------------------------------------------
# GET /api/who-funds/{query} — Who funds your MP?
# ---------------------------------------------------------------------------

@app.get("/api/who-funds/{query}")
def who_funds(query: str):
    """Return MP details, party donation breakdown by industry, top donors,
    and key policy voting connections for an electorate or postcode."""
    db = get_db()

    # Resolve postcode to electorate name
    electorate = POSTCODE_TO_ELECTORATE.get(query.strip(), None)
    if not electorate:
        # Try as direct electorate name (title-case)
        electorate = query.strip().title()

    # Find the member for this electorate (representatives only, most recent)
    member = db.execute(
        """
        SELECT * FROM members
        WHERE electorate = ? AND chamber = 'representatives'
        ORDER BY entered_house DESC
        LIMIT 1
        """,
        (electorate,),
    ).fetchone()

    if not member:
        # Try case-insensitive search
        member = db.execute(
            """
            SELECT * FROM members
            WHERE LOWER(electorate) = LOWER(?) AND chamber = 'representatives'
            ORDER BY entered_house DESC
            LIMIT 1
            """,
            (electorate,),
        ).fetchone()

    if not member:
        # Fuzzy: try LIKE match
        member = db.execute(
            """
            SELECT * FROM members
            WHERE electorate LIKE ? AND chamber = 'representatives'
            ORDER BY entered_house DESC
            LIMIT 1
            """,
            (f"%{electorate}%",),
        ).fetchone()

    if not member:
        return {"error": f"No MP found for '{query}'"}

    person_id = member["person_id"]
    party = member["party"] or ""
    result_mp = dict(member)
    result_mp["photo_url"] = (
        f"https://www.openaustralia.org.au/images/mpsL/{person_id}.jpg"
    )

    # Normalise party for donation lookup
    party_patterns = []
    if "Labor" in party or "ALP" in party:
        party_patterns = ["%Labor%", "%ALP%"]
    elif "Liberal National" in party:
        party_patterns = ["%Liberal%", "%National%", "%LNP%"]
    elif "Liberal" in party:
        party_patterns = ["%Liberal%", "%LIB%"]
    elif "National" in party:
        party_patterns = ["%National%", "%NAT%"]
    elif "Green" in party:
        party_patterns = ["%Green%", "%GRN%"]
    elif "One Nation" in party:
        party_patterns = ["%One Nation%"]
    else:
        party_patterns = [f"%{party.split()[0]}%"] if party else []

    # Build OR clause for party patterns
    if party_patterns:
        or_clause = " OR ".join(["recipient LIKE ?" for _ in party_patterns])
        party_where = f"({or_clause})"
    else:
        party_where = "1=0"

    # Donation breakdown by industry
    industry_breakdown = []
    if party_patterns:
        rows = db.execute(
            f"""
            SELECT industry, SUM(amount) as total FROM donations
            WHERE industry IS NOT NULL AND {party_where}
            GROUP BY industry ORDER BY total DESC
            """,
            party_patterns,
        ).fetchall()
        industry_breakdown = [
            {"industry": r["industry"], "total": r["total"]} for r in rows
        ]

    # Top 5 donors (excluding government bodies)
    top_donors = []
    if party_patterns:
        rows = db.execute(
            f"""
            SELECT donor_name, SUM(amount) as total, industry FROM donations
            WHERE {party_where}
            AND donor_name NOT LIKE '%Electoral Commission%'
            AND donor_name NOT LIKE '%Taxation Office%'
            GROUP BY donor_name ORDER BY total DESC LIMIT 5
            """,
            party_patterns,
        ).fetchall()
        top_donors = [
            {"name": r["donor_name"], "total": r["total"], "industry": r["industry"]}
            for r in rows
        ]

    # Policy scores from TVFY cache
    policy_scores = []
    cache_row = db.execute(
        "SELECT value FROM analysis_cache WHERE key = ?",
        (f"tvfy_person_{person_id}",),
    ).fetchone()
    if cache_row:
        try:
            tvfy_data = json.loads(cache_row["value"])
            comparisons = tvfy_data.get("policy_comparisons", [])
            voted = [c for c in comparisons if c.get("voted")]
            policy_scores = [
                {
                    "policy_id": c["policy"]["id"],
                    "policy_name": c["policy"]["name"],
                    "agreement": c["agreement"],
                }
                for c in voted
            ]
        except (json.JSONDecodeError, TypeError):
            pass

    # Build fact cards: connect top industries to voting records
    fact_cards = []
    industry_policy_map = {
        "gambling": {
            "keywords": ["gambling", "restriction", "poker", "betting"],
            "label": "gambling reform",
            "icon": "dice",
        },
        "mining": {
            "keywords": ["mining", "coal", "mineral"],
            "label": "mining regulation",
            "icon": "mountain",
        },
        "fossil_fuels": {
            "keywords": ["carbon", "climate", "emission", "coal", "fossil"],
            "label": "climate action",
            "icon": "factory",
        },
        "finance": {
            "keywords": ["banking", "financial", "bank"],
            "label": "banking regulation",
            "icon": "bank",
        },
        "property": {
            "keywords": ["housing", "property", "rent", "home"],
            "label": "housing affordability",
            "icon": "home",
        },
        "unions": {
            "keywords": ["union", "workplace", "worker", "trade union"],
            "label": "workers' rights",
            "icon": "people",
        },
    }

    for ind_data in industry_breakdown[:6]:
        ind = ind_data["industry"]
        if ind not in industry_policy_map:
            continue
        mapping = industry_policy_map[ind]
        for ps in policy_scores:
            pname = ps["policy_name"].lower()
            if any(kw in pname for kw in mapping["keywords"]):
                fact_cards.append({
                    "industry": ind,
                    "industry_label": ind.replace("_", " ").title(),
                    "icon": mapping["icon"],
                    "donation_total": ind_data["total"],
                    "policy_name": ps["policy_name"],
                    "agreement": ps["agreement"],
                    "description": mapping["label"],
                })
                break
        if len(fact_cards) >= 3:
            break

    return {
        "mp": result_mp,
        "industry_breakdown": industry_breakdown,
        "top_donors": top_donors,
        "policy_scores": policy_scores,
        "fact_cards": fact_cards,
        "electorate": member["electorate"],
    }


# ---------------------------------------------------------------------------
# GET /api/who-funds-electorates — list all electorates for search
# ---------------------------------------------------------------------------

@app.get("/api/who-funds-electorates")
def who_funds_electorates():
    db = get_db()
    rows = db.execute(
        """
        SELECT DISTINCT m.electorate, m.full_name, m.party, m.person_id
        FROM members m
        WHERE m.electorate IS NOT NULL AND m.chamber = 'representatives'
        ORDER BY m.electorate
        """
    ).fetchall()
    return {
        "electorates": [
            {
                "electorate": r["electorate"],
                "mp": r["full_name"],
                "party": r["party"],
                "person_id": r["person_id"],
            }
            for r in rows
        ],
    }


# ---------------------------------------------------------------------------
# GET /api/pay-to-play — Contract-speech-donation cross-references
# ---------------------------------------------------------------------------

@app.get("/api/pay-to-play")
def pay_to_play(
    company: Optional[str] = None,
    party: Optional[str] = None,
    mp: Optional[str] = None,
    match_type: Optional[str] = Query(
        None, pattern="^(party_match|other_party|no_party)$"
    ),
    min_contract: Optional[float] = None,
    min_donation: Optional[float] = None,
    sort: str = Query("contract_amount", pattern="^(contract_amount|donation_amount|speech_date|company_name)$"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Return linked contracts-speeches-donations.

    Each result represents an MP who mentioned a company in parliament,
    where that company both donated to a political party AND won government
    contracts. The match_type field indicates whether the MP's own party
    received the donations ('party_match' = smoking gun).
    """
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    conditions = []
    params: list = []

    if company:
        conditions.append("(csl.company_name LIKE ? OR csl.supplier_name LIKE ?)")
        like = f"%{company}%"
        params.extend([like, like])
    if party:
        conditions.append("csl.party LIKE ?")
        params.append(f"%{party}%")
    if mp:
        conditions.append(
            "(csl.person_id = ? OR m.full_name LIKE ?)"
        )
        params.extend([mp, f"%{mp}%"])
    if match_type:
        conditions.append("csl.match_type = ?")
        params.append(match_type)
    if min_contract:
        conditions.append("csl.contract_amount >= ?")
        params.append(min_contract)
    if min_donation:
        conditions.append("csl.donation_amount >= ?")
        params.append(min_donation)

    where = " AND ".join(conditions) if conditions else "1=1"

    sort_col = {
        "contract_amount": "csl.contract_amount DESC",
        "donation_amount": "csl.donation_amount DESC",
        "speech_date": "csl.speech_date DESC",
        "company_name": "csl.company_name ASC",
    }.get(sort, "csl.contract_amount DESC")

    rows = db.execute(
        f"""
        SELECT csl.link_id, csl.contract_id, csl.speech_id, csl.person_id,
               csl.company_name, csl.supplier_name, csl.donor_name,
               csl.contract_amount, csl.donation_amount,
               csl.party, csl.recipient_party, csl.match_type,
               csl.speech_date, csl.speech_snippet,
               m.full_name as mp_name, m.electorate,
               c.title as contract_title, c.agency
        FROM contract_speech_links csl
        LEFT JOIN members m ON m.person_id = csl.person_id
        LEFT JOIN contracts c ON c.contract_id = csl.contract_id
        WHERE {where}
        ORDER BY {sort_col}
        LIMIT ? OFFSET ?
        """,
        params + [limit, offset],
    ).fetchall()

    total = db.execute(
        f"SELECT COUNT(*) AS c FROM contract_speech_links csl LEFT JOIN members m ON m.person_id = csl.person_id WHERE {where}",
        params,
    ).fetchone()["c"]

    # Summary stats
    summary = db.execute(
        """
        SELECT
            COUNT(*) as total_links,
            COUNT(DISTINCT company_name) as unique_companies,
            COUNT(DISTINCT person_id) as unique_mps,
            SUM(CASE WHEN match_type = 'party_match' THEN 1 ELSE 0 END) as party_matches,
            MAX(contract_amount) as max_contract,
            SUM(DISTINCT contract_amount) as total_contract_value
        FROM contract_speech_links
        """
    ).fetchone()

    return {
        "links": [dict(r) for r in rows],
        "count": len(rows),
        "total": total,
        "offset": offset,
        "limit": limit,
        "summary": {
            "total_links": summary["total_links"],
            "unique_companies": summary["unique_companies"],
            "unique_mps": summary["unique_mps"],
            "party_matches": summary["party_matches"],
            "max_contract": summary["max_contract"],
            "total_contract_value": summary["total_contract_value"],
        } if summary["total_links"] else {
            "total_links": 0,
            "unique_companies": 0,
            "unique_mps": 0,
            "party_matches": 0,
            "max_contract": 0,
            "total_contract_value": 0,
        },
    }


# ---------------------------------------------------------------------------
# GET /api/disconnect — Disconnect scores for a single MP
# GET /api/disconnect/rankings — Top MPs by disconnect score
# GET /api/disconnect/summary — High-level summary across all topics
# ---------------------------------------------------------------------------

@app.get("/api/disconnect")
def disconnect_scores(
    person_id: str = Query(..., description="MP person_id"),
):
    """Get disconnect scores for a single MP across all topics."""
    from parli.analysis.disconnect import get_mp_disconnect, ensure_table

    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")
    ensure_table(db)
    scores = get_mp_disconnect(person_id, db)

    if not scores:
        return {"person_id": person_id, "scores": [], "count": 0}

    # Compute average disconnect across topics
    valid = [s for s in scores if s["speech_count"] >= 5]
    avg_disconnect = (
        round(sum(s["disconnect_score"] for s in valid) / len(valid), 4)
        if valid else 0.0
    )

    return {
        "person_id": person_id,
        "full_name": scores[0].get("full_name"),
        "party": scores[0].get("party"),
        "scores": scores,
        "count": len(scores),
        "avg_disconnect": avg_disconnect,
    }


@app.get("/api/disconnect/rankings")
def disconnect_rankings(
    topic: Optional[str] = Query(None, description="Filter by topic name"),
    limit: int = Query(50, ge=1, le=200),
    min_speeches: int = Query(5, ge=1),
):
    """Get MPs ranked by disconnect score (highest disconnect first)."""
    from parli.analysis.disconnect import get_disconnect_rankings, ensure_table

    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")
    ensure_table(db)
    rankings = get_disconnect_rankings(db, topic=topic, limit=limit, min_speeches=min_speeches)

    return {
        "rankings": rankings,
        "count": len(rankings),
        "topic": topic,
        "min_speeches": min_speeches,
    }


@app.get("/api/disconnect/summary")
def disconnect_summary():
    """Get high-level summary of disconnect scores across all topics."""
    from parli.analysis.disconnect import get_disconnect_summary, ensure_table

    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")
    ensure_table(db)
    return get_disconnect_summary(db)


# ---------------------------------------------------------------------------
# GET /api/topic-insights/{topic_name} — Cached topic insights
# ---------------------------------------------------------------------------

@app.get("/api/topic-insights/{topic_name}")
def topic_insights(topic_name: str, regenerate: bool = Query(False)):
    """Return precomputed insights for a topic. Set regenerate=true to recompute."""
    from parli.analysis.topic_insights import get_cached_insights, generate_topic_insights

    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    if regenerate:
        topic_row = db.execute(
            "SELECT topic_id, name FROM topics WHERE name = ?", (topic_name,)
        ).fetchone()
        if not topic_row:
            return {"error": f"Topic '{topic_name}' not found"}, 404
        insights = generate_topic_insights(db, topic_row["topic_id"], topic_row["name"])
        db.execute(
            """
            INSERT INTO analysis_cache (key, value, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            """,
            (f"topic_insights_{topic_name}", json.dumps(insights, default=str)),
        )
        db.commit()
        return insights

    cached = get_cached_insights(db, topic_name)
    if cached:
        return cached

    return {"error": f"No cached insights for '{topic_name}'. Run: python -m parli.analysis.topic_insights --topic {topic_name}"}, 404


@app.get("/api/topic-insights")
def all_topic_insights():
    """Return list of all topics with cached insights availability."""
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")
    topics = db.execute("SELECT topic_id, name FROM topics ORDER BY topic_id").fetchall()
    result = []
    for t in topics:
        cache_row = db.execute(
            "SELECT updated_at FROM analysis_cache WHERE key = ?",
            (f"topic_insights_{t['name']}",),
        ).fetchone()
        result.append({
            "topic_id": t["topic_id"],
            "name": t["name"],
            "has_insights": cache_row is not None,
            "last_updated": cache_row["updated_at"] if cache_row else None,
        })
    return {"topics": result, "count": len(result)}


# ---------------------------------------------------------------------------
# GET /api/mp-insights/{person_id} — Comprehensive MP profile insights
# ---------------------------------------------------------------------------

@app.get("/api/mp-insights/{person_id}")
def mp_profile_insights(
    person_id: str,
    force: bool = Query(False, description="Force regeneration, ignoring cache"),
):
    """Return a comprehensive insight profile for an MP, including career stats,
    signature topic, disconnect, donor exposure, notable quote, voting record,
    and peer comparison.  Cached in analysis_cache."""
    from parli.analysis.mp_insights import get_mp_insight, generate_mp_insights, _parliament_topic_averages

    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    if force:
        parliament_avg = _parliament_topic_averages(db)
        result = generate_mp_insights(db, person_id, parliament_avg, force=True)
    else:
        result = get_mp_insight(db, person_id)

    if not result:
        return {"error": "MP not found or insufficient data (< 50 speeches)"}

    return result


# ---------------------------------------------------------------------------
# GET /api/mp-interests/shareholdings — all shareholdings across all MPs
# NOTE: This route must be registered BEFORE /api/mp-interests/{person_id}
#       to avoid the path parameter capturing "shareholdings" as a person_id.
# ---------------------------------------------------------------------------

@app.get("/api/mp-interests/shareholdings")
def all_shareholdings(
    company: Optional[str] = None,
    limit: int = Query(200, ge=1, le=1000),
):
    """List all MP shareholdings, optionally filtered by company name.
    Useful for cross-referencing with voting records."""
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    conditions = []
    params = []
    if company:
        conditions.append("s.company_name LIKE ?")
        params.append(f"%{company}%")

    where = " AND ".join(conditions) if conditions else "1=1"

    rows = db.execute(
        f"""SELECT s.shareholding_id, s.person_id, s.company_name,
                   s.share_type, s.declared_date,
                   m.full_name, m.party, m.electorate, m.chamber
            FROM mp_shareholdings s
            LEFT JOIN members m ON s.person_id = m.person_id
            WHERE {where}
            ORDER BY s.company_name, m.full_name
            LIMIT ?""",
        params + [limit],
    ).fetchall()

    return {
        "shareholdings": [dict(r) for r in rows],
        "count": len(rows),
    }


# ---------------------------------------------------------------------------
# GET /api/mp-interests/{person_id} — all registered interests for an MP
# ---------------------------------------------------------------------------

@app.get("/api/mp-interests/{person_id}")
def mp_interests(person_id: str):
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    # General interests
    interests = db.execute(
        """SELECT interest_id, interest_type, entity_name, description,
                  declared_date, parliament_number, source_url
           FROM mp_interests WHERE person_id = ?
           ORDER BY interest_type, entity_name""",
        (person_id,),
    ).fetchall()

    # Shareholdings
    shareholdings = db.execute(
        """SELECT shareholding_id, company_name, share_type, declared_date
           FROM mp_shareholdings WHERE person_id = ?
           ORDER BY company_name""",
        (person_id,),
    ).fetchall()

    # Properties
    properties = db.execute(
        """SELECT property_id, property_description, location, purpose, declared_date
           FROM mp_properties WHERE person_id = ?""",
        (person_id,),
    ).fetchall()

    # Directorships
    directorships = db.execute(
        """SELECT directorship_id, company_name, role, declared_date
           FROM mp_directorships WHERE person_id = ?
           ORDER BY company_name""",
        (person_id,),
    ).fetchall()

    # Member info
    member = db.execute(
        "SELECT full_name, party, electorate, chamber FROM members WHERE person_id = ?",
        (person_id,),
    ).fetchone()

    return {
        "person_id": person_id,
        "member": dict(member) if member else None,
        "interests": [dict(r) for r in interests],
        "shareholdings": [dict(r) for r in shareholdings],
        "properties": [dict(r) for r in properties],
        "directorships": [dict(r) for r in directorships],
        "counts": {
            "interests": len(interests),
            "shareholdings": len(shareholdings),
            "properties": len(properties),
            "directorships": len(directorships),
        },
    }


# ---------------------------------------------------------------------------
# GET /api/ministerial-meetings — Search ministerial diary meetings
# ---------------------------------------------------------------------------

@app.get("/api/ministerial-meetings")
def ministerial_meetings(
    minister: Optional[str] = Query(None, description="Filter by minister name (substring match)"),
    organisation: Optional[str] = Query(None, description="Filter by organisation (substring match)"),
    purpose: Optional[str] = Query(None, description="Filter by meeting purpose (substring match)"),
    state: Optional[str] = Query(None, description="Filter by state (qld, nsw, vic, federal)"),
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    """Search ministerial meeting diary entries with optional filters."""
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    conditions = []
    params = []

    if minister:
        conditions.append("minister_name LIKE ?")
        params.append(f"%{minister}%")
    if organisation:
        conditions.append("organisation LIKE ?")
        params.append(f"%{organisation}%")
    if purpose:
        conditions.append("purpose LIKE ?")
        params.append(f"%{purpose}%")
    if state:
        conditions.append("state = ?")
        params.append(state)
    if date_from:
        conditions.append("meeting_date >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("meeting_date <= ?")
        params.append(date_to)

    where = " AND ".join(conditions) if conditions else "1=1"

    total = db.execute(
        f"SELECT COUNT(*) AS c FROM ministerial_meetings WHERE {where}", params
    ).fetchone()["c"]

    rows = db.execute(
        f"""SELECT meeting_id, minister_name, person_id, meeting_date,
                   organisation, attendee_name, purpose, portfolio, state, source_url
            FROM ministerial_meetings
            WHERE {where}
            ORDER BY meeting_date DESC
            LIMIT ? OFFSET ?""",
        params + [limit, offset],
    ).fetchall()

    # Stats
    stats = db.execute(f"""
        SELECT COUNT(DISTINCT minister_name) as ministers,
               COUNT(DISTINCT organisation) as organisations,
               MIN(meeting_date) as earliest,
               MAX(meeting_date) as latest
        FROM ministerial_meetings WHERE {where}
    """, params).fetchone()

    return {
        "meetings": [dict(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
        "stats": dict(stats) if stats else {},
    }


# ---------------------------------------------------------------------------
# GET /api/ministerial-meetings/xref — Donation/contract cross-references
# ---------------------------------------------------------------------------

@app.get("/api/ministerial-meetings/xref")
def ministerial_meetings_xref():
    """Return cached cross-references between ministerial meetings and donations/contracts."""
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    cached = db.execute(
        "SELECT value, updated_at FROM analysis_cache WHERE key = 'ministerial_meeting_xref'"
    ).fetchone()

    if cached:
        return {
            "data": json.loads(cached["value"]),
            "updated_at": cached["updated_at"],
        }

    return {"data": None, "message": "No cross-reference data. Run: python -m parli.ingest.ministerial_diaries --cross-reference"}


# ---------------------------------------------------------------------------
# MP Expenses (icacpls data)
# ---------------------------------------------------------------------------

@app.get("/api/mp-expenses")
def mp_expenses_list(
    name: Optional[str] = None,
    party: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = Query(default=100, le=1000),
    offset: int = 0,
):
    """List MP expense records with optional filters."""
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    conditions = []
    params = []
    if name:
        conditions.append("name LIKE ?")
        params.append(f"%{name}%")
    if party:
        conditions.append("party LIKE ?")
        params.append(f"%{party}%")
    if category:
        conditions.append("category LIKE ?")
        params.append(f"%{category}%")

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    total = db.execute(
        f"SELECT COUNT(*) FROM mp_expenses {where}", params
    ).fetchone()[0]

    rows = db.execute(
        f"""SELECT expense_id, name, member_type, electorate, state, party,
                   category, subcategory, period, date_from, date_to,
                   location, purpose, nights, rate, amount, date
            FROM mp_expenses {where}
            ORDER BY amount DESC NULLS LAST
            LIMIT ? OFFSET ?""",
        params + [limit, offset],
    ).fetchall()

    return {"total": total, "expenses": [dict(r) for r in rows]}


@app.get("/api/mp-expenses/summary")
def mp_expenses_summary():
    """Aggregate expense stats by party and category."""
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    by_party = db.execute(
        """SELECT party, COUNT(*) as record_count,
                  SUM(amount) as total_amount, AVG(amount) as avg_amount
           FROM mp_expenses
           WHERE amount IS NOT NULL
           GROUP BY party
           ORDER BY total_amount DESC"""
    ).fetchall()

    by_category = db.execute(
        """SELECT category, COUNT(*) as record_count,
                  SUM(amount) as total_amount, AVG(amount) as avg_amount
           FROM mp_expenses
           WHERE amount IS NOT NULL
           GROUP BY category
           ORDER BY total_amount DESC"""
    ).fetchall()

    top_spenders = db.execute(
        """SELECT name, party, COUNT(*) as record_count,
                  SUM(amount) as total_amount
           FROM mp_expenses
           WHERE amount IS NOT NULL
           GROUP BY name
           ORDER BY total_amount DESC
           LIMIT 50"""
    ).fetchall()

    return {
        "by_party": [dict(r) for r in by_party],
        "by_category": [dict(r) for r in by_category],
        "top_spenders": [dict(r) for r in top_spenders],
    }


@app.get("/api/mp-expenses/{name}")
def mp_expenses_by_mp(
    name: str,
    limit: int = Query(default=100, le=1000),
):
    """Get all expense records for a specific MP (by exact name match)."""
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    rows = db.execute(
        """SELECT expense_id, name, member_type, electorate, state, party,
                  category, subcategory, period, date_from, date_to,
                  location, purpose, nights, rate, amount, date
           FROM mp_expenses
           WHERE name = ?
           ORDER BY amount DESC NULLS LAST
           LIMIT ?""",
        (name, limit),
    ).fetchall()

    summary = db.execute(
        """SELECT category, COUNT(*) as count, SUM(amount) as total
           FROM mp_expenses WHERE name = ?
           GROUP BY category ORDER BY total DESC""",
        (name,),
    ).fetchall()

    return {
        "name": name,
        "expenses": [dict(r) for r in rows],
        "by_category": [dict(r) for r in summary],
    }


# ---------------------------------------------------------------------------
# QLD Ministerial Gifts
# ---------------------------------------------------------------------------

@app.get("/api/qld-ministerial-gifts")
def qld_ministerial_gifts(
    minister: Optional[str] = None,
    limit: int = Query(default=100, le=1000),
    offset: int = 0,
):
    """List QLD ministerial gift records."""
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    conditions = []
    params = []
    if minister:
        conditions.append("(minister_lastname LIKE ? OR minister_firstname LIKE ?)")
        params.extend([f"%{minister}%", f"%{minister}%"])

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    total = db.execute(
        f"SELECT COUNT(*) FROM qld_ministerial_gifts {where}", params
    ).fetchone()[0]

    rows = db.execute(
        f"""SELECT gift_id, registration_no, gift_description, donor_recipient,
                   minister_lastname, minister_firstname, location,
                   date_received, gift_value, quarter
            FROM qld_ministerial_gifts {where}
            ORDER BY gift_value DESC NULLS LAST
            LIMIT ? OFFSET ?""",
        params + [limit, offset],
    ).fetchall()

    return {"total": total, "gifts": [dict(r) for r in rows]}


# ---------------------------------------------------------------------------
# ANAO Audit Reports
# ---------------------------------------------------------------------------

@app.get("/api/audits")
def audits(
    agency: Optional[str] = None,
    type: Optional[str] = Query(default=None, alias="type"),
    q: Optional[str] = None,
    limit: int = Query(default=50, le=500),
    offset: int = 0,
):
    """List ANAO audit reports with optional filters."""
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    conditions = []
    params = []

    if agency:
        conditions.append("agency_audited LIKE ?")
        params.append(f"%{agency}%")
    if type:
        conditions.append("audit_type = ?")
        params.append(type)
    if q:
        conditions.append("(title LIKE ? OR summary LIKE ? OR full_text LIKE ?)")
        params.extend([f"%{q}%", f"%{q}%", f"%{q}%"])

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    total = db.execute(
        f"SELECT COUNT(*) FROM audit_reports {where}", params
    ).fetchone()[0]

    rows = db.execute(
        f"""SELECT audit_id, title, report_number, audit_type, agency_audited,
                   date_tabled, summary, findings_count, recommendations_count, url
            FROM audit_reports {where}
            ORDER BY date_tabled DESC NULLS LAST
            LIMIT ? OFFSET ?""",
        params + [limit, offset],
    ).fetchall()

    # Aggregate stats
    stats = db.execute(
        f"""SELECT COUNT(*) as total_reports,
                   SUM(recommendations_count) as total_recommendations,
                   SUM(findings_count) as total_findings,
                   COUNT(DISTINCT agency_audited) as agencies_audited
            FROM audit_reports {where}""",
        params,
    ).fetchone()

    return {
        "total": total,
        "stats": dict(stats) if stats else {},
        "reports": [dict(r) for r in rows],
    }


@app.get("/api/audits/{audit_id}")
def audit_detail(audit_id: int):
    """Get full detail for a single audit report."""
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    row = db.execute(
        """SELECT * FROM audit_reports WHERE audit_id = ?""",
        (audit_id,),
    ).fetchone()

    if not row:
        return {"error": "Audit report not found"}

    result = dict(row)

    # Find related contracts from the same agency
    if result.get("agency_audited"):
        contracts = db.execute(
            """SELECT contract_id, title, supplier_name, amount, start_date
               FROM contracts WHERE agency LIKE ?
               ORDER BY amount DESC NULLS LAST LIMIT 10""",
            (f"%{result['agency_audited']}%",),
        ).fetchall()
        result["related_contracts"] = [dict(c) for c in contracts]

    return result


@app.get("/api/audits/xref")
def audit_xref():
    """Get cross-reference data: audited agencies vs contracts vs donations."""
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    cached = db.execute(
        "SELECT value FROM analysis_cache WHERE key = 'anao_agency_xref'"
    ).fetchone()

    if cached:
        return json.loads(cached["value"])

    return {"error": "Cross-reference data not yet generated. Run: python -m parli.ingest.anao"}


# ---------------------------------------------------------------------------
# Federal Lobbyist Register
# ---------------------------------------------------------------------------

@app.get("/api/lobbyists")
def federal_lobbyists(
    client: Optional[str] = None,
    former_role: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = Query(default=100, le=1000),
    offset: int = 0,
):
    """List federal lobbyists with optional filters.

    Query params:
        client      - filter by client name (fuzzy match)
        former_role - filter by former government role (fuzzy match)
        status      - filter by registration status
        q           - general search across trading name, clients, former roles
        limit/offset - pagination
    """
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    # Check tables exist
    tables = {r[0] for r in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()}
    if "federal_lobbyists" not in tables:
        return {"total": 0, "lobbyists": [], "cross_references": {}}

    conditions = []
    params = []

    if q:
        conditions.append("""(
            fl.trading_name LIKE ?
            OR fl.former_govt_role LIKE ?
            OR fl.lobbyist_id IN (
                SELECT lobbyist_id FROM federal_lobbyist_clients
                WHERE client_name LIKE ?
            )
        )""")
        params.extend([f"%{q}%", f"%{q}%", f"%{q}%"])

    if client:
        conditions.append("""fl.lobbyist_id IN (
            SELECT lobbyist_id FROM federal_lobbyist_clients
            WHERE client_name LIKE ?
        )""")
        params.append(f"%{client}%")

    if former_role:
        conditions.append("fl.former_govt_role LIKE ?")
        params.append(f"%{former_role}%")

    if status:
        conditions.append("fl.status = ?")
        params.append(status)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    total = db.execute(
        f"SELECT COUNT(*) FROM federal_lobbyists fl {where}", params
    ).fetchone()[0]

    rows = db.execute(
        f"""SELECT fl.lobbyist_id, fl.trading_name, fl.abn,
                   fl.business_entity, fl.former_govt_role,
                   fl.registration_date, fl.status
            FROM federal_lobbyists fl {where}
            ORDER BY fl.trading_name
            LIMIT ? OFFSET ?""",
        params + [limit, offset],
    ).fetchall()

    # Enrich each lobbyist with their clients
    lobbyists = []
    for row in rows:
        lob = dict(row)
        clients = db.execute(
            "SELECT client_name, client_abn FROM federal_lobbyist_clients WHERE lobbyist_id = ?",
            (lob["lobbyist_id"],),
        ).fetchall()
        lob["clients"] = [dict(c) for c in clients]
        lobbyists.append(lob)

    # Include cross-reference summaries from cache
    cross_refs = {}
    for key in [
        "federal_lobbyist_summary",
        "federal_lobbyist_donor_matches",
        "federal_lobbyist_contractor_matches",
        "federal_lobbyist_revolving_door",
    ]:
        try:
            cached = db.execute(
                "SELECT value FROM analysis_cache WHERE key = ?", (key,)
            ).fetchone()
            if cached:
                cross_refs[key] = json.loads(cached["value"])
        except Exception:
            pass

    return {
        "total": total,
        "lobbyists": lobbyists,
        "cross_references": cross_refs,
    }


# ---------------------------------------------------------------------------
# Government Grants
# ---------------------------------------------------------------------------

@app.get("/api/grants")
def grants(
    electorate: Optional[str] = None,
    agency: Optional[str] = None,
    program: Optional[str] = None,
    state: Optional[str] = None,
    recipient: Optional[str] = None,
    grant_type: Optional[str] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    q: Optional[str] = None,
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
):
    """List government grants with filtering.

    Query params:
    - electorate: filter by electorate name (partial match)
    - agency: filter by funding agency (partial match)
    - program: filter by program name (partial match)
    - state: filter by state ('qld', 'nsw', 'federal', etc.)
    - recipient: filter by recipient name (partial match)
    - grant_type: filter by type ('discretionary', 'formula', 'one_off', etc.)
    - min_amount / max_amount: filter by grant value
    - q: free-text search across title, recipient, program
    """
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    conditions = []
    params = []

    if electorate:
        conditions.append("electorate LIKE ?")
        params.append(f"%{electorate}%")
    if agency:
        conditions.append("agency LIKE ?")
        params.append(f"%{agency}%")
    if program:
        conditions.append("program LIKE ?")
        params.append(f"%{program}%")
    if state:
        conditions.append("state = ?")
        params.append(state.lower())
    if recipient:
        conditions.append("recipient LIKE ?")
        params.append(f"%{recipient}%")
    if grant_type:
        conditions.append("grant_type = ?")
        params.append(grant_type)
    if min_amount is not None:
        conditions.append("amount >= ?")
        params.append(min_amount)
    if max_amount is not None:
        conditions.append("amount <= ?")
        params.append(max_amount)
    if q:
        conditions.append("(title LIKE ? OR recipient LIKE ? OR program LIKE ? OR description LIKE ?)")
        params.extend([f"%{q}%"] * 4)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    total = db.execute(
        f"SELECT COUNT(*) FROM government_grants {where}", params
    ).fetchone()[0]

    rows = db.execute(
        f"""SELECT grant_id, title, description, recipient, recipient_abn,
                   amount, agency, program, electorate, state,
                   start_date, end_date, grant_type, suburb, postcode,
                   category, recipient_type, financial_year, source
            FROM government_grants {where}
            ORDER BY amount DESC NULLS LAST
            LIMIT ? OFFSET ?""",
        params + [limit, offset],
    ).fetchall()

    return {"total": total, "grants": [dict(r) for r in rows]}


@app.get("/api/grants/stats")
def grants_stats():
    """Summary statistics for government grants data."""
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    stats = db.execute("""
        SELECT
            COUNT(*) AS total_grants,
            SUM(amount) AS total_amount,
            COUNT(DISTINCT agency) AS agency_count,
            COUNT(DISTINCT recipient) AS recipient_count,
            COUNT(DISTINCT program) AS program_count,
            SUM(CASE WHEN grant_type != 'formula' THEN 1 ELSE 0 END) AS discretionary_count,
            SUM(CASE WHEN grant_type != 'formula' THEN amount ELSE 0 END) AS discretionary_amount
        FROM government_grants
        WHERE amount > 0
    """).fetchone()

    by_agency = db.execute("""
        SELECT agency, COUNT(*) AS cnt, SUM(amount) AS total
        FROM government_grants
        WHERE amount > 0 AND grant_type != 'formula'
        GROUP BY agency
        ORDER BY total DESC
        LIMIT 20
    """).fetchall()

    by_type = db.execute("""
        SELECT grant_type, COUNT(*) AS cnt, SUM(amount) AS total
        FROM government_grants
        WHERE amount > 0
        GROUP BY grant_type
        ORDER BY total DESC
    """).fetchall()

    return {
        "summary": dict(stats) if stats else {},
        "by_agency": [dict(r) for r in by_agency],
        "by_type": [dict(r) for r in by_type],
    }


@app.get("/api/grants/pork-barreling")
def grants_pork_barreling():
    """Get cached pork-barreling analysis results."""
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    cached = db.execute(
        "SELECT value, updated_at FROM analysis_cache WHERE key = 'stories_pork_barreling'"
    ).fetchone()

    if cached:
        return {
            "data": json.loads(cached["value"]),
            "updated_at": cached["updated_at"],
        }
    return {"data": None, "message": "No pork-barreling analysis cached. Run: python -m parli.ingest.grants --analyze"}


# ---------------------------------------------------------------------------
# GET /api/board-appointments — Government board appointment data
# ---------------------------------------------------------------------------

@app.get("/api/board-appointments")
def board_appointments(
    person: Optional[str] = Query(None, description="Filter by person name (partial match)"),
    agency: Optional[str] = Query(None, description="Filter by agency/portfolio (partial match)"),
    board: Optional[str] = Query(None, description="Filter by board name (partial match)"),
    mp_only: bool = Query(False, description="Only show appointments matched to MPs"),
    donor_only: bool = Query(False, description="Only show appointments matched to donors"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    """Query government board appointments with optional filters."""
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    conditions = []
    params = []

    if person:
        conditions.append("person_name LIKE ?")
        params.append(f"%{person}%")
    if agency:
        conditions.append("agency LIKE ?")
        params.append(f"%{agency}%")
    if board:
        conditions.append("board_name LIKE ?")
        params.append(f"%{board}%")
    if mp_only:
        conditions.append("matched_person_id IS NOT NULL")
    if donor_only:
        conditions.append("matched_donor_name IS NOT NULL")

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    total = db.execute(
        f"SELECT COUNT(*) AS c FROM board_appointments {where}", params
    ).fetchone()["c"]

    rows = db.execute(
        f"""SELECT appointment_id, person_name, board_name, agency, role,
                   start_date, end_date, remuneration, appointment_type,
                   source_url, body_type, classification, established_by,
                   matched_person_id, matched_donor_name, created_at
            FROM board_appointments {where}
            ORDER BY board_name, person_name
            LIMIT ? OFFSET ?""",
        params + [limit, offset],
    ).fetchall()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "results": [dict(r) for r in rows],
    }


@app.get("/api/board-appointments/patronage")
def board_patronage():
    """Get cached board patronage analysis (former MPs + donors on boards)."""
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    cached = db.execute(
        "SELECT value, updated_at FROM analysis_cache WHERE key = 'stories_board_patronage'"
    ).fetchone()

    if cached:
        return {
            "data": json.loads(cached["value"]),
            "updated_at": cached["updated_at"],
        }
    return {
        "data": None,
        "message": "No board patronage analysis cached. Run: python -m parli.ingest.board_appointments",
    }


# ---------------------------------------------------------------------------
# GET /api/jobs-for-the-boys — Political appointments investigation
# ---------------------------------------------------------------------------

@app.get("/api/jobs-for-the-boys")
def jobs_for_the_boys(rebuild: bool = False):
    """Get 'Jobs for the Boys' investigation data (political patronage & revolving door)."""
    db = get_db()
    db.execute("PRAGMA busy_timeout = 600000")

    if not rebuild:
        cached = db.execute(
            "SELECT value, updated_at FROM analysis_cache WHERE key = 'stories_jobs_for_the_boys'"
        ).fetchone()
        if cached:
            return {
                "data": json.loads(cached["value"]),
                "updated_at": cached["updated_at"],
            }

    # Generate fresh report
    from parli.analysis.political_appointments import generate_report
    report = generate_report(db)
    return {
        "data": report,
        "updated_at": report.get("generated_at"),
    }


# ---------------------------------------------------------------------------
# GET /api/timeline/top — Entities with the most cross-table connections
# (Must be registered BEFORE the {entity_name} route to avoid capture)
# ---------------------------------------------------------------------------

@app.get("/api/timeline/top")
def timeline_top(limit: int = Query(30, ge=1, le=100)):
    """Return entities ranked by cross-table connection score.

    Best investigation targets: entities that appear across donations,
    contracts, speeches, meetings, lobbying, and appointments.
    """
    from parli.analysis.timeline import get_top_entities

    db = get_db()
    db.execute("PRAGMA busy_timeout = 600000")
    entities = get_top_entities(db, limit=limit)
    return {"entities": entities, "count": len(entities)}


# ---------------------------------------------------------------------------
# GET /api/timeline/{entity_name} — Follow the Money timeline for an entity
# ---------------------------------------------------------------------------

@app.get("/api/timeline/{entity_name}")
def timeline_entity(entity_name: str):
    """Build a chronological 'Follow the Money' timeline for an entity.

    Returns all events across donations, contracts, speeches, meetings,
    pay-to-play links, board appointments, and lobbying registrations.
    """
    from parli.analysis.timeline import build_timeline

    db = get_db()
    db.execute("PRAGMA busy_timeout = 600000")
    result = build_timeline(db, entity_name)
    return result


# ---------------------------------------------------------------------------
# GET /api/electorates/{name}/grants — Grants flowing to an electorate
# ---------------------------------------------------------------------------

@app.get("/api/electorates/{name}/grants")
def electorate_grants(
    name: str,
    limit: int = Query(100, ge=1, le=1000),
    min_amount: float = Query(0.0, ge=0.0),
):
    """Return government grants for a specific electorate, plus electorate metadata."""
    db = get_db()
    db.execute("PRAGMA busy_timeout = 600000")

    # Get electorate info (most recent election)
    electorate_info = db.execute("""
        SELECT electorate_name, state, margin_pct, winning_party,
               winning_candidate, year, swing, seat_type
        FROM electorates
        WHERE electorate_name = ? COLLATE NOCASE
        ORDER BY year DESC LIMIT 1
    """, (name,)).fetchone()

    # Get grants for this electorate
    grants = db.execute("""
        SELECT grant_id, title, description, recipient, recipient_abn,
               amount, agency, program, start_date, end_date,
               grant_type, category, financial_year
        FROM government_grants
        WHERE electorate = ? COLLATE NOCASE
          AND amount >= ?
        ORDER BY amount DESC
        LIMIT ?
    """, (name, min_amount, limit)).fetchall()

    # Summary stats
    stats = db.execute("""
        SELECT SUM(amount) as total, COUNT(*) as cnt,
               AVG(amount) as avg_amount, MAX(amount) as max_grant,
               COUNT(DISTINCT program) as distinct_programs,
               COUNT(DISTINCT recipient) as distinct_recipients
        FROM government_grants
        WHERE electorate = ? COLLATE NOCASE AND amount > 0
    """, (name,)).fetchone()

    # Top programs
    top_programs = db.execute("""
        SELECT program, SUM(amount) as total, COUNT(*) as cnt
        FROM government_grants
        WHERE electorate = ? COLLATE NOCASE AND amount > 0
        GROUP BY program
        ORDER BY total DESC LIMIT 10
    """, (name,)).fetchall()

    return {
        "electorate": dict(electorate_info) if electorate_info else {"electorate_name": name},
        "grants": [dict(g) for g in grants],
        "stats": dict(stats) if stats else {},
        "top_programs": [dict(p) for p in top_programs],
        "count": len(grants),
    }


# ---------------------------------------------------------------------------
# GET /api/pork-barrel — Ranked electorates by suspicious grant patterns
# ---------------------------------------------------------------------------

@app.get("/api/pork-barrel")
def pork_barrel(
    year: int = Query(2022, ge=2000, le=2030),
    seat_type: Optional[str] = None,
    party: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
):
    """Pork-barreling analysis: ranked electorates by suspicious grant patterns.

    Returns cached analysis results plus real-time filtering.
    """
    db = get_db()
    db.execute("PRAGMA busy_timeout = 600000")

    # Try cached results first
    cached = db.execute(
        "SELECT value FROM analysis_cache WHERE key = 'stories_pork_barreling'"
    ).fetchone()

    if cached:
        data = json.loads(cached["value"])
        electorates = data.get("all_electorates") or data.get("top_electorates", [])

        # Apply filters
        if seat_type:
            electorates = [e for e in electorates if e.get("seat_type") == seat_type]
        if party:
            electorates = [e for e in electorates
                           if party.lower() in (e.get("winning_party") or "").lower()]

        electorates = electorates[:limit]

        return {
            "election_year": data.get("election_year", year),
            "pork_barrel_ratio": data.get("pork_barrel_ratio", 0),
            "seat_type_stats": data.get("seat_type_stats", {}),
            "party_ratios": data.get("party_ratios", {}),
            "outlier_electorates": data.get("outlier_electorates", [])[:20],
            "electorates": electorates,
            "donor_grant_overlaps": data.get("donor_grant_overlaps", [])[:20],
            "pre_election_spike": data.get("pre_election_spike", {}),
            "summary": data.get("summary", ""),
            "count": len(electorates),
            "generated_at": data.get("generated_at"),
        }

    # No cached results -- run analysis on the fly
    from parli.analysis.pork_barrel import run_full_analysis
    result = run_full_analysis(db, election_year=year)

    electorates = result.get("all_electorates") or result.get("top_electorates", [])
    if seat_type:
        electorates = [e for e in electorates if e.get("seat_type") == seat_type]
    if party:
        electorates = [e for e in electorates
                       if party.lower() in (e.get("winning_party") or "").lower()]

    return {
        "election_year": result.get("election_year", year),
        "pork_barrel_ratio": result.get("pork_barrel_ratio", 0),
        "seat_type_stats": result.get("seat_type_stats", {}),
        "party_ratios": result.get("party_ratios", {}),
        "outlier_electorates": result.get("outlier_electorates", [])[:20],
        "electorates": electorates[:limit],
        "donor_grant_overlaps": result.get("donor_grant_overlaps", [])[:20],
        "pre_election_spike": result.get("pre_election_spike", {}),
        "summary": result.get("summary", ""),
        "count": len(electorates),
        "generated_at": result.get("generated_at"),
    }


# ---------------------------------------------------------------------------
# GET /api/conflicts — Conflict of interest detection
# ---------------------------------------------------------------------------

@app.get("/api/conflicts")
def conflicts(
    person_id: Optional[str] = Query(None, description="Filter by MP person_id"),
):
    """Detect conflicts of interest: MP shareholdings/interests vs voting record."""
    from parli.analysis.conflicts import get_conflicts

    db = get_db()
    db.execute("PRAGMA busy_timeout = 600000")
    result = get_conflicts(db, person_id=person_id)
    return result


# ---------------------------------------------------------------------------
# GET /api/your-mp/{postcode} — Comprehensive "Enter your postcode" endpoint
# ---------------------------------------------------------------------------

@app.get("/api/your-mp/{postcode}")
def your_mp(postcode: str):
    """Return everything a voter needs to know about their MP and electorate.

    Resolves postcode -> electorate -> MP, then returns:
    electorate info, MP profile, say-vs-vote disconnect, donor influence,
    contract-speech links, demographics comparison, conflicts of interest,
    grant spending analysis, career stats, and a key quote.

    Results are cached in analysis_cache for 24 hours.
    """
    from parli.your_mp import get_your_mp

    db = get_db()
    return get_your_mp(db, postcode)


# ---------------------------------------------------------------------------
# GET /api/postcodes — All valid postcodes for autocomplete
# ---------------------------------------------------------------------------

@app.get("/api/postcodes")
def postcodes():
    """Return all valid postcodes with electorate names for search autocomplete."""
    from parli.your_mp import get_all_postcodes

    db = get_db()
    results = get_all_postcodes(db)
    return {"postcodes": results, "count": len(results)}


# ---------------------------------------------------------------------------
# Entity Resolution API
# ---------------------------------------------------------------------------

@app.get("/api/entities/search")
def entities_search(
    q: str = Query(..., min_length=1, description="Search query for entity name"),
    limit: int = Query(20, ge=1, le=100),
):
    """Fuzzy search for resolved entities by name. Searches both canonical names and aliases."""
    from parli.analysis.entity_resolution import search_entities

    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")
    results = search_entities(db, q, limit=limit)
    return {"query": q, "results": results, "count": len(results)}


@app.get("/api/entities/stats")
def entities_stats():
    """Summary statistics for entity resolution."""
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")

    try:
        total = db.execute("SELECT COUNT(*) AS c FROM entities").fetchone()["c"]
        aliases = db.execute("SELECT COUNT(*) AS c FROM entity_aliases").fetchone()["c"]
        multi_table = db.execute(
            "SELECT COUNT(*) AS c FROM entities WHERE tables_present LIKE '%,%'"
        ).fetchone()["c"]

        by_type = db.execute("""
            SELECT entity_type, COUNT(*) as cnt
            FROM entities GROUP BY entity_type ORDER BY cnt DESC
        """).fetchall()

        top_donors = db.execute("""
            SELECT entity_id, canonical_name, entity_type, total_donated, tables_present, alias_count
            FROM entities WHERE total_donated > 0
            ORDER BY total_donated DESC LIMIT 20
        """).fetchall()

        top_contractors = db.execute("""
            SELECT entity_id, canonical_name, entity_type, total_contracts, tables_present, alias_count
            FROM entities WHERE total_contracts > 0
            ORDER BY total_contracts DESC LIMIT 20
        """).fetchall()

        return {
            "total_entities": total,
            "total_aliases": aliases,
            "multi_table_entities": multi_table,
            "by_type": [dict(r) for r in by_type],
            "top_donors": [dict(r) for r in top_donors],
            "top_contractors": [dict(r) for r in top_contractors],
        }
    except Exception as e:
        return {"error": str(e), "message": "Entity resolution tables may not exist. Run: python -m parli.analysis.entity_resolution"}


@app.get("/api/entities/{entity_id}")
def entity_detail(entity_id: int):
    """Get full detail for a resolved entity across all tables (donations, contracts, speeches)."""
    from parli.analysis.entity_resolution import get_entity_detail

    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")
    result = get_entity_detail(db, entity_id)
    if not result:
        return {"error": "Entity not found", "entity_id": entity_id}
    return result


# ---------------------------------------------------------------------------
# GET /api/photos/{person_id} — Serve cached MP headshot or placeholder
# ---------------------------------------------------------------------------

PHOTOS_DIR = Path("~/.cache/autoresearch/photos").expanduser()

@app.get("/api/photos/{person_id}")
def get_photo(person_id: str):
    """Serve a cached MP photo or placeholder image.

    Returns the 200x200 JPEG headshot for the given person_id.
    Falls back to a grey silhouette placeholder if no photo is available.
    Browser-cacheable via Cache-Control headers.
    """
    # Sanitize: only allow alphanumeric person_ids
    if not person_id.replace("-", "").replace("_", "").isalnum():
        photo_path = PHOTOS_DIR / "placeholder.webp"
    else:
        # Try WebP first, fall back to JPG
        photo_path = PHOTOS_DIR / f"{person_id}.webp"
        if not photo_path.exists():
            photo_path = PHOTOS_DIR / f"{person_id}.jpg"

    if not photo_path.exists():
        photo_path = PHOTOS_DIR / "placeholder.webp"
        if not photo_path.exists():
            photo_path = PHOTOS_DIR / "placeholder.jpg"

    if not photo_path.exists():
        # Create placeholder on-the-fly if missing
        PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
        from parli.ingest.photos import create_placeholder
        create_placeholder(photo_path)

    return FileResponse(
        path=str(photo_path),
        media_type="image/jpeg",
        headers={
            "Cache-Control": "public, max-age=604800, immutable",  # 7 days
        },
    )
