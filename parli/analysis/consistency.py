"""
parli.analysis.consistency — Speech-Vote Consistency Analysis ("Hypocrisy Tracker")

Cross-references what MPs say in speeches with how they actually vote.

Method:
  1. For a given topic (e.g. "gambling"), find all speeches mentioning related keywords.
  2. Classify each speech as "supportive of reform" or "opposed to reform" using
     simple keyword-pattern matching (no ML needed yet).
  3. Find all divisions (votes) related to that topic by matching division names
     against topic keywords.
  4. Check if each MP's speech stance matches their vote (aye/no).
  5. Calculate a consistency score per MP per topic (0-100%).

Output:
  - Per-MP-per-topic consistency score
  - Summary of most/least consistent MPs
  - Cached in analysis_cache table as JSON

Usage:
    python -m parli.analysis.consistency
    python -m parli.analysis.consistency --topic gambling
    python -m parli.analysis.consistency --member 12345

Database note:
    The actual DB schema uses person_id (TEXT) as the key linking speeches,
    votes and members (not integer member_id).  Speeches have columns:
    person_id, speaker_name, text, date, topic.  Divisions have: division_id,
    name, summary.  Votes have: division_id, person_id, vote.  Members have:
    person_id, full_name, party.
"""

from __future__ import annotations

import json
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime
from typing import Any

from parli.schema import get_db, init_db


# ---------------------------------------------------------------------------
# Topic keyword definitions -- maps topic name to discovery keywords,
# pro-reform signals, and anti-reform signals.
# ---------------------------------------------------------------------------

TOPIC_PROFILES: dict[str, dict[str, Any]] = {
    "gambling": {
        "discovery_keywords": [
            "gambling", "gaming", "pokies", "poker machine", "slot machine",
            "betting", "wagering", "casino", "lotteries",
        ],
        "pro_reform": [
            "harm", "reform", "protect", "addiction", "regulate",
            "vulnerable", "predatory", "losses", "problem gambling",
            "mandatory pre-commitment", "harm reduction", "limit",
            "public health", "safeguard",
        ],
        "anti_reform": [
            "jobs", "industry", "freedom", "choice", "personal responsibility",
            "tourism", "revenue", "employment", "hospitality",
            "nanny state", "overregulation", "individual liberty",
        ],
    },
    "climate": {
        "discovery_keywords": [
            "climate", "emissions", "renewable", "carbon", "net zero",
            "paris agreement", "coal", "global warming", "greenhouse",
        ],
        "pro_reform": [
            "crisis", "emergency", "transition", "renewable", "solar",
            "wind", "clean energy", "decarbonise", "net zero", "sustainable",
            "future generations", "science", "paris", "action",
        ],
        "anti_reform": [
            "jobs", "coal", "gas", "baseload", "reliable", "affordable",
            "energy security", "industry", "export", "economic growth",
            "cost", "premature",
        ],
    },
    "housing": {
        "discovery_keywords": [
            "housing", "rent", "mortgage", "home ownership", "affordable housing",
            "negative gearing", "homelessness", "property",
        ],
        "pro_reform": [
            "crisis", "affordable", "reform", "first home buyer", "help",
            "social housing", "public housing", "renters", "homelessness",
            "negative gearing", "capital gains discount", "supply",
        ],
        "anti_reform": [
            "investor", "market", "property rights", "confidence",
            "self-funded", "aspiration", "supply side only",
            "government interference",
        ],
    },
    "immigration": {
        "discovery_keywords": [
            "immigration", "migration", "visa", "refugee", "asylum",
            "border", "citizenship", "intake",
        ],
        "pro_reform": [
            "humanitarian", "compassion", "welcome", "diversity",
            "multicultural", "skilled", "contribution", "protection",
            "human rights", "resettle", "pathway",
        ],
        "anti_reform": [
            "border security", "illegal", "queue", "sovereignty",
            "congestion", "infrastructure", "reduce", "cap",
            "national interest", "threat",
        ],
    },
    "health": {
        "discovery_keywords": [
            "health", "hospital", "medicare", "doctor", "nurse",
            "mental health", "bulk billing", "pharmaceutical", "aged care",
            "ndis", "disability",
        ],
        "pro_reform": [
            "invest", "fund", "strengthen", "universal", "access",
            "bulk billing", "workforce", "reform", "improve",
            "public health", "equity", "quality",
        ],
        "anti_reform": [
            "private", "choice", "competition", "waste", "blowout",
            "efficiency", "unsustainable", "cost", "overhaul",
        ],
    },
    "education": {
        "discovery_keywords": [
            "education", "school", "university", "student", "teacher",
            "tafe", "hecs", "curriculum", "childcare",
        ],
        "pro_reform": [
            "fund", "invest", "access", "equity", "free",
            "gonski", "reduce fees", "workforce", "quality",
            "public school", "inclusive",
        ],
        "anti_reform": [
            "choice", "independent", "private", "standards", "discipline",
            "back to basics", "parental rights", "competition",
        ],
    },
    "technology": {
        "discovery_keywords": [
            "technology", "digital", "artificial intelligence", "AI",
            "social media", "privacy", "data", "automation", "misinformation",
        ],
        "pro_reform": [
            "regulate", "safety", "protect", "privacy", "transparency",
            "accountability", "children", "harm", "oversight",
            "responsible", "ethical",
        ],
        "anti_reform": [
            "innovation", "freedom", "growth", "industry", "investment",
            "competitiveness", "red tape", "overregulation",
        ],
    },
    "indigenous": {
        "discovery_keywords": [
            "indigenous", "aboriginal", "torres strait", "first nations",
            "voice", "reconciliation", "closing the gap",
        ],
        "pro_reform": [
            "voice", "treaty", "truth", "self-determination", "justice",
            "reconciliation", "closing the gap", "rights",
            "constitutional recognition", "listen",
        ],
        "anti_reform": [
            "division", "separate", "race-based", "equal", "all australians",
            "constitution", "unity", "bureaucracy",
        ],
    },
    "economy": {
        "discovery_keywords": [
            "economy", "budget", "deficit", "surplus", "gdp", "tax",
            "fiscal", "debt", "productivity", "trade",
        ],
        "pro_reform": [
            "reform", "invest", "fair", "progressive", "worker",
            "minimum wage", "equality", "public", "spend", "stimulus",
        ],
        "anti_reform": [
            "debt", "deficit", "waste", "tax cut", "deregulate",
            "small business", "free market", "surplus", "fiscal discipline",
        ],
    },
    "security": {
        "discovery_keywords": [
            "defence", "defense", "military", "security", "aukus",
            "pacific", "intelligence", "cyber", "terrorism", "submarine",
        ],
        "pro_reform": [
            "invest", "strengthen", "alliance", "capability", "modernise",
            "aukus", "preparedness", "sovereignty", "deter",
        ],
        "anti_reform": [
            "waste", "cost", "accountability", "overreach", "diplomacy",
            "peace", "proportion", "excessive",
        ],
    },
}


# ---------------------------------------------------------------------------
# Keyword-based stance detection
# ---------------------------------------------------------------------------

def _count_keyword_hits(text_lower: str, keywords: list[str]) -> int:
    """Count how many times any of the keywords appear in text (case-insensitive)."""
    hits = 0
    for kw in keywords:
        hits += len(re.findall(re.escape(kw.lower()), text_lower))
    return hits


def classify_speech_stance(text: str, topic_name: str) -> tuple[str, float]:
    """Classify a speech's stance on a topic as pro-reform or anti-reform.

    Returns:
        (stance, confidence) where stance is "pro_reform", "anti_reform", or "unclear".
        Confidence is a float in [0.0, 1.0].
    """
    profile = TOPIC_PROFILES.get(topic_name)
    if profile is None:
        return "unclear", 0.0

    text_lower = text.lower()
    pro_hits = _count_keyword_hits(text_lower, profile["pro_reform"])
    anti_hits = _count_keyword_hits(text_lower, profile["anti_reform"])
    total = pro_hits + anti_hits

    if total == 0:
        return "unclear", 0.0

    if pro_hits > anti_hits:
        return "pro_reform", pro_hits / total
    elif anti_hits > pro_hits:
        return "anti_reform", anti_hits / total
    else:
        return "unclear", 0.0


# ---------------------------------------------------------------------------
# Vote-to-stance mapping
# ---------------------------------------------------------------------------

_REFORM_SIGNALS = re.compile(
    r"reform|regulat|protect|amend|strengthen|oversight|safeguard|limit",
    re.IGNORECASE,
)


def is_reform_bill(subject: str) -> bool:
    """Return True if the division subject text signals a pro-reform direction."""
    return bool(_REFORM_SIGNALS.search(subject))


def vote_to_stance_directed(vote: str, division_name: str) -> str:
    """Map vote to stance accounting for whether the bill is pro-reform or not.

    If the bill/division name contains reform/regulation keywords:
        aye -> pro_reform, no -> anti_reform
    Otherwise we apply the same default (aye = supportive, no = opposing).
    This can be refined later with more nuanced bill-direction detection.
    """
    if vote in ("aye", "teller_aye"):
        return "pro_reform"
    elif vote in ("no", "teller_no"):
        return "anti_reform"
    return "unclear"


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def _table_exists(db: sqlite3.Connection, table_name: str) -> bool:
    """Check if a table exists in the database."""
    row = db.execute(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,),
    ).fetchone()
    return row[0] > 0


def _has_column(db: sqlite3.Connection, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    try:
        cols = db.execute(f"PRAGMA table_info({table_name})").fetchall()
        return any(c["name"] == column_name for c in cols)
    except Exception:
        return False


def _tables_ready(db: sqlite3.Connection) -> bool:
    """Return True if the minimum required tables exist.

    We only require speeches, divisions, votes and members.  The topics and
    analysis_cache tables are created by init_db and are optional for the core
    analysis (we create analysis_cache entries opportunistically).
    """
    required = ["speeches", "divisions", "votes", "members"]
    return all(_table_exists(db, t) for t in required)


# ---------------------------------------------------------------------------
# Core analysis: per-topic consistency
# ---------------------------------------------------------------------------

def _find_topic_speeches(
    db: sqlite3.Connection,
    topic_name: str,
) -> list[sqlite3.Row]:
    """Find all speeches that mention keywords for a given topic.

    Adapts to the actual DB schema: the speeches table may have person_id
    (actual ingested data) or member_id (schema.py canonical definition).
    """
    profile = TOPIC_PROFILES.get(topic_name)
    if profile is None:
        return []

    keywords = profile["discovery_keywords"]

    # Determine which column links speeches to members
    if _has_column(db, "speeches", "person_id"):
        id_col = "person_id"
    elif _has_column(db, "speeches", "member_id"):
        id_col = "member_id"
    else:
        return []

    conditions = " OR ".join("s.text LIKE ?" for _ in keywords)
    params = [f"%{kw}%" for kw in keywords]

    query = f"""
        SELECT s.speech_id, s.{id_col} AS person_key, s.text, s.date
        FROM speeches s
        WHERE s.{id_col} IS NOT NULL
          AND ({conditions})
    """
    return db.execute(query, params).fetchall()


def _find_topic_divisions(
    db: sqlite3.Connection,
    topic_name: str,
) -> list[sqlite3.Row]:
    """Find all divisions related to a topic by matching name/subject/summary."""
    profile = TOPIC_PROFILES.get(topic_name)
    if profile is None:
        return []

    keywords = profile["discovery_keywords"]

    # Adapt to actual schema: divisions may have 'name' or 'subject'
    name_col = "name" if _has_column(db, "divisions", "name") else "subject"
    has_summary = _has_column(db, "divisions", "summary")

    like_clauses = []
    params: list[str] = []
    for kw in keywords:
        like_clauses.append(f"d.{name_col} LIKE ?")
        params.append(f"%{kw}%")
        if has_summary:
            like_clauses.append("d.summary LIKE ?")
            params.append(f"%{kw}%")

    where = " OR ".join(like_clauses)
    query = f"""
        SELECT d.division_id, d.{name_col} AS division_name, d.date
        FROM divisions d
        WHERE {where}
    """
    return db.execute(query, params).fetchall()


def analyze_topic_consistency(topic_name: str, db: sqlite3.Connection | None = None) -> list[dict]:
    """Analyse speech-vote consistency for all MPs on a single topic.

    Returns a list of dicts, one per MP who has relevant data::

        [{"person_id": str, "full_name": str, "party": str, "topic": str,
          "speeches_count": int, "supportive_speeches": int,
          "opposing_speeches": int, "aligned_votes": int,
          "misaligned_votes": int, "consistency_score": float}, ...]

    A consistency_score of -1.0 means insufficient data (spoke but did not
    vote, or voted but did not speak, or stance was unclear).
    """
    close_db = False
    if db is None:
        db = get_db()
        init_db(db)
        close_db = True

    try:
        if not _tables_ready(db):
            return []

        topic_name = topic_name.lower().strip()
        if topic_name not in TOPIC_PROFILES:
            return []

        # ---- Step 1: find speeches mentioning this topic ----
        speeches = _find_topic_speeches(db, topic_name)
        if not speeches:
            return []

        # Aggregate speech stances per person_key
        # person_key -> {pro_reform: int, anti_reform: int, unclear: int, total: int}
        member_speech_stances: dict[str, dict[str, int]] = defaultdict(
            lambda: {"pro_reform": 0, "anti_reform": 0, "unclear": 0, "total": 0}
        )
        for sp in speeches:
            pk = sp["person_key"]
            if pk is None:
                continue
            pk = str(pk)
            stance, _confidence = classify_speech_stance(sp["text"], topic_name)
            member_speech_stances[pk][stance] += 1
            member_speech_stances[pk]["total"] += 1

        # ---- Step 2: find related divisions ----
        divisions = _find_topic_divisions(db, topic_name)
        division_ids = [d["division_id"] for d in divisions]
        division_names = {d["division_id"]: d["division_name"] for d in divisions}

        # ---- Step 3: get individual votes for those divisions ----
        # Adapt to schema: votes may use person_id or member_id
        if _has_column(db, "votes", "person_id"):
            vote_id_col = "person_id"
        elif _has_column(db, "votes", "member_id"):
            vote_id_col = "member_id"
        else:
            vote_id_col = "person_id"

        member_vote_stances: dict[str, list[tuple[str, int]]] = defaultdict(list)

        if division_ids:
            placeholders = ",".join("?" for _ in division_ids)
            vote_rows = db.execute(f"""
                SELECT v.{vote_id_col} AS person_key, v.vote, v.division_id
                FROM votes v
                WHERE v.division_id IN ({placeholders})
                  AND v.vote NOT IN ('abstain', 'absent')
            """, division_ids).fetchall()

            for vr in vote_rows:
                pk = str(vr["person_key"])
                div_name = division_names.get(vr["division_id"], "")
                stance = vote_to_stance_directed(vr["vote"], div_name)
                if stance != "unclear":
                    member_vote_stances[pk].append((stance, vr["division_id"]))

        # ---- Step 4: collect all person keys and fetch metadata ----
        all_person_keys = set(member_speech_stances.keys()) | set(member_vote_stances.keys())
        if not all_person_keys:
            return []

        # Determine member-table columns
        has_full_name = _has_column(db, "members", "full_name")
        name_col = "full_name" if has_full_name else "name"

        if _has_column(db, "members", "person_id"):
            mem_id_col = "person_id"
        elif _has_column(db, "members", "member_id"):
            mem_id_col = "member_id"
        else:
            mem_id_col = "person_id"

        placeholders = ",".join("?" for _ in all_person_keys)
        member_rows = db.execute(f"""
            SELECT {mem_id_col} AS pid, {name_col} AS display_name, party
            FROM members
            WHERE {mem_id_col} IN ({placeholders})
        """, list(all_person_keys)).fetchall()

        member_info: dict[str, dict[str, str]] = {}
        for r in member_rows:
            pid = str(r["pid"])
            member_info[pid] = {
                "person_id": pid,
                "full_name": r["display_name"] or "Unknown",
                "party": r["party"] or "Unknown",
            }

        # For person keys not found in members (e.g. speakers with no member
        # record), we still include them with placeholder metadata.
        for pk in all_person_keys:
            if pk not in member_info:
                member_info[pk] = {
                    "person_id": pk,
                    "full_name": "Unknown",
                    "party": "Unknown",
                }

        # ---- Step 5: calculate consistency ----
        results: list[dict] = []

        for pk in all_person_keys:
            info = member_info[pk]
            ss = member_speech_stances.get(pk, {"pro_reform": 0, "anti_reform": 0, "unclear": 0, "total": 0})
            vs = member_vote_stances.get(pk, [])

            # Determine dominant speech stance
            if ss["pro_reform"] > ss["anti_reform"]:
                dominant_speech_stance = "pro_reform"
            elif ss["anti_reform"] > ss["pro_reform"]:
                dominant_speech_stance = "anti_reform"
            else:
                dominant_speech_stance = "unclear"

            # Count aligned / misaligned votes
            aligned = 0
            misaligned = 0
            for vote_stance, _div_id in vs:
                if dominant_speech_stance == "unclear":
                    continue
                if vote_stance == dominant_speech_stance:
                    aligned += 1
                else:
                    misaligned += 1

            total_comparable = aligned + misaligned
            if total_comparable > 0:
                consistency_score = round(aligned / total_comparable * 100, 1)
            else:
                # Insufficient data: spoke but never voted, voted but never spoke,
                # or speech stance was unclear.
                consistency_score = -1.0

            results.append({
                "person_id": info["person_id"],
                "full_name": info["full_name"],
                "party": info["party"],
                "topic": topic_name,
                "speeches_count": ss["total"],
                "supportive_speeches": ss["pro_reform"],
                "opposing_speeches": ss["anti_reform"],
                "aligned_votes": aligned,
                "misaligned_votes": misaligned,
                "consistency_score": consistency_score,
            })

        # Sort: scored results first (ascending), then unscored (-1) at the end
        results.sort(key=lambda r: (r["consistency_score"] < 0, r["consistency_score"]))

        # ---- Cache results ----
        cache_key = f"consistency:{topic_name}"
        if _table_exists(db, "analysis_cache"):
            try:
                db.execute("""
                    INSERT OR REPLACE INTO analysis_cache
                    (cache_key, analysis_type, result_json, params_json)
                    VALUES (?, 'consistency', ?, ?)
                """, (
                    cache_key,
                    json.dumps(results, default=str),
                    json.dumps({"topic": topic_name, "computed_at": datetime.now().isoformat()}),
                ))
                db.commit()
            except sqlite3.OperationalError:
                pass  # cache write is best-effort

        return results

    finally:
        if close_db:
            db.close()


# ---------------------------------------------------------------------------
# All-topics analysis
# ---------------------------------------------------------------------------

def get_all_topic_consistencies(db: sqlite3.Connection | None = None) -> dict[str, list[dict]]:
    """Run consistency analysis for every topic in TOPIC_PROFILES.

    Returns ``{topic_name: [per-MP result dicts]}``.
    """
    close_db = False
    if db is None:
        db = get_db()
        init_db(db)
        close_db = True

    try:
        results: dict[str, list[dict]] = {}
        for topic_name in TOPIC_PROFILES:
            topic_results = analyze_topic_consistency(topic_name, db=db)
            if topic_results:
                results[topic_name] = topic_results
        return results
    finally:
        if close_db:
            db.close()


# ---------------------------------------------------------------------------
# Per-MP report across all topics
# ---------------------------------------------------------------------------

def get_mp_consistency_report(person_id: str, db: sqlite3.Connection | None = None) -> dict:
    """Generate a full consistency report for one MP across all topics.

    Returns::

        {
            "person_id": str,
            "full_name": str | None,
            "party": str | None,
            "topics": {
                topic_name: {
                    "speeches_count": int,
                    "supportive_speeches": int,
                    "opposing_speeches": int,
                    "aligned_votes": int,
                    "misaligned_votes": int,
                    "consistency_score": float,
                }
            },
            "overall_consistency": float,  # average across topics with data
        }
    """
    close_db = False
    if db is None:
        db = get_db()
        init_db(db)
        close_db = True

    try:
        all_topic_results = get_all_topic_consistencies(db=db)

        report: dict[str, Any] = {
            "person_id": person_id,
            "full_name": None,
            "party": None,
            "topics": {},
            "overall_consistency": -1.0,
        }

        scored_topics: list[float] = []

        for topic_name, mp_results in all_topic_results.items():
            for mp in mp_results:
                if str(mp["person_id"]) == str(person_id):
                    if report["full_name"] is None:
                        report["full_name"] = mp["full_name"]
                        report["party"] = mp["party"]

                    report["topics"][topic_name] = {
                        "speeches_count": mp["speeches_count"],
                        "supportive_speeches": mp["supportive_speeches"],
                        "opposing_speeches": mp["opposing_speeches"],
                        "aligned_votes": mp["aligned_votes"],
                        "misaligned_votes": mp["misaligned_votes"],
                        "consistency_score": mp["consistency_score"],
                    }

                    if mp["consistency_score"] >= 0:
                        scored_topics.append(mp["consistency_score"])

                    break

        if scored_topics:
            report["overall_consistency"] = round(
                sum(scored_topics) / len(scored_topics), 1
            )

        return report

    finally:
        if close_db:
            db.close()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _print_summary_table(results: list[dict], topic_name: str, limit: int = 20) -> None:
    """Pretty-print a summary table of consistency results."""
    scored = [r for r in results if r["consistency_score"] >= 0]
    unscored = [r for r in results if r["consistency_score"] < 0]

    if not scored:
        print(f"\n  No MPs with comparable speech and vote data for '{topic_name}'.")
        if unscored:
            print(f"  ({len(unscored)} MPs had speeches or votes but not both.)")
        return

    print(f"\n{'=' * 80}")
    print(f"  CONSISTENCY ANALYSIS: {topic_name.upper()}")
    print(f"  {len(scored)} MPs with comparable data, {len(unscored)} with insufficient data")
    print(f"{'=' * 80}")

    # Least consistent
    least = sorted(scored, key=lambda r: r["consistency_score"])[:limit]
    print(f"\n  LEAST CONSISTENT MPs (potential speech-vote mismatches):")
    print(f"  {'Name':30s} {'Party':20s} {'Score':>6s}  {'Speeches':>8s}  {'Aligned':>7s}  {'Misaligned':>10s}")
    print(f"  {'-' * 30} {'-' * 20} {'-' * 6}  {'-' * 8}  {'-' * 7}  {'-' * 10}")
    for r in least:
        print(
            f"  {r['full_name']:30s} {r['party']:20s} "
            f"{r['consistency_score']:5.1f}%  "
            f"{r['speeches_count']:8d}  "
            f"{r['aligned_votes']:7d}  "
            f"{r['misaligned_votes']:10d}"
        )

    # Most consistent
    most = sorted(scored, key=lambda r: -r["consistency_score"])[:limit]
    print(f"\n  MOST CONSISTENT MPs:")
    print(f"  {'Name':30s} {'Party':20s} {'Score':>6s}  {'Speeches':>8s}  {'Aligned':>7s}  {'Misaligned':>10s}")
    print(f"  {'-' * 30} {'-' * 20} {'-' * 6}  {'-' * 8}  {'-' * 7}  {'-' * 10}")
    for r in most:
        print(
            f"  {r['full_name']:30s} {r['party']:20s} "
            f"{r['consistency_score']:5.1f}%  "
            f"{r['speeches_count']:8d}  "
            f"{r['aligned_votes']:7d}  "
            f"{r['misaligned_votes']:10d}"
        )


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Speech-Vote Consistency Analysis (Hypocrisy Tracker)"
    )
    parser.add_argument(
        "--topic", type=str, default=None,
        help="Analyse a single topic (e.g. 'gambling', 'climate'). "
             "If omitted, analyses all topics.",
    )
    parser.add_argument(
        "--member", type=str, default=None,
        help="Show consistency report for a single MP (by person_id).",
    )
    parser.add_argument(
        "--top", type=int, default=20,
        help="Number of most/least consistent MPs to display (default: 20).",
    )
    args = parser.parse_args()

    db = get_db()
    init_db(db)

    if not _tables_ready(db):
        print("Database tables not yet populated. Run the ingest pipeline first.")
        db.close()
        sys.exit(1)

    # --- Single-member report ---
    if args.member:
        report = get_mp_consistency_report(args.member, db=db)
        if report["full_name"] is None:
            print(f"No data found for person_id '{args.member}'.")
        else:
            print(json.dumps(report, indent=2, default=str))
        db.close()
        return

    # --- Single topic ---
    if args.topic:
        topic = args.topic.lower().strip()
        if topic not in TOPIC_PROFILES:
            print(f"Unknown topic '{topic}'. Available: {', '.join(sorted(TOPIC_PROFILES))}")
            db.close()
            sys.exit(1)
        results = analyze_topic_consistency(topic, db=db)
        _print_summary_table(results, topic, limit=args.top)
        db.close()
        return

    # --- All topics ---
    print("Running consistency analysis for all topics...")
    all_results = get_all_topic_consistencies(db=db)

    if not all_results:
        print("No results. The database may be empty or lack speech/vote data.")
        db.close()
        return

    for topic_name, results in sorted(all_results.items()):
        _print_summary_table(results, topic_name, limit=args.top)

    # Cross-topic summary
    print(f"\n{'=' * 80}")
    print(f"  CROSS-TOPIC SUMMARY: MPs with lowest average consistency")
    print(f"{'=' * 80}")

    mp_scores: dict[str, dict] = {}
    for topic_name, results in all_results.items():
        for r in results:
            if r["consistency_score"] < 0:
                continue
            pid = r["person_id"]
            if pid not in mp_scores:
                mp_scores[pid] = {
                    "full_name": r["full_name"],
                    "party": r["party"],
                    "scores": [],
                }
            mp_scores[pid]["scores"].append(r["consistency_score"])

    mp_avg = []
    for pid, info in mp_scores.items():
        if info["scores"]:
            avg = sum(info["scores"]) / len(info["scores"])
            mp_avg.append({
                "person_id": pid,
                "full_name": info["full_name"],
                "party": info["party"],
                "avg_consistency": round(avg, 1),
                "topics_scored": len(info["scores"]),
            })

    mp_avg.sort(key=lambda r: r["avg_consistency"])

    print(f"\n  {'Name':30s} {'Party':20s} {'Avg Score':>9s}  {'Topics':>6s}")
    print(f"  {'-' * 30} {'-' * 20} {'-' * 9}  {'-' * 6}")
    for r in mp_avg[:args.top]:
        print(
            f"  {r['full_name']:30s} {r['party']:20s} "
            f"{r['avg_consistency']:8.1f}%  "
            f"{r['topics_scored']:6d}"
        )

    db.close()


if __name__ == "__main__":
    main()
