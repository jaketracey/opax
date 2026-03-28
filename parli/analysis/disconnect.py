"""
parli.analysis.disconnect -- Speech-Vote Disconnect Scoring Engine

The core OPAX metric: measuring the gap between what MPs SAY (speeches)
and how they VOTE.

Disconnect score formula:
  - For each MP on each topic, we measure:
    1. speech_count: how many speeches they gave on the topic (via speech_topics)
    2. vote_alignment: how often their votes align with their speech stance (0.0-1.0)
    3. disconnect_score: combines high speech activity with low vote alignment

  disconnect_score = speech_intensity * (1 - vote_alignment)

  Where speech_intensity = min(speech_count / SPEECH_NORMALISER, 1.0)
  This caps the speech contribution so prolific speakers don't dominate.

  Score range: 0.0 (perfect alignment) to 1.0 (maximum disconnect).
  A high score means: "talks a lot about this topic but votes the opposite way."

Usage:
    python -m parli.analysis.disconnect
    python -m parli.analysis.disconnect --topic gambling
    python -m parli.analysis.disconnect --member 10001
    python -m parli.analysis.disconnect --rebuild
"""

from __future__ import annotations

import json
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime
from typing import Any

from parli.schema import get_db, init_db

# Reuse the stance classification and topic profiles from consistency module
from parli.analysis.consistency import (
    TOPIC_PROFILES,
    classify_speech_stance,
    vote_to_stance_directed,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Normaliser: an MP with this many speeches on a topic gets speech_intensity=1.0
SPEECH_NORMALISER = 20

# Minimum speeches required to compute a disconnect score
MIN_SPEECHES = 5

# Table name for persisted scores
TABLE_NAME = "mp_disconnect_scores"


# ---------------------------------------------------------------------------
# Schema: mp_disconnect_scores table
# ---------------------------------------------------------------------------

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS mp_disconnect_scores (
    person_id TEXT NOT NULL,
    topic_id INTEGER NOT NULL,
    topic_name TEXT NOT NULL,
    speech_count INTEGER NOT NULL DEFAULT 0,
    pro_reform_speeches INTEGER NOT NULL DEFAULT 0,
    anti_reform_speeches INTEGER NOT NULL DEFAULT 0,
    relevant_divisions INTEGER NOT NULL DEFAULT 0,
    aligned_votes INTEGER NOT NULL DEFAULT 0,
    misaligned_votes INTEGER NOT NULL DEFAULT 0,
    vote_alignment REAL NOT NULL DEFAULT 0.0,
    disconnect_score REAL NOT NULL DEFAULT 0.0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (person_id, topic_id),
    FOREIGN KEY (person_id) REFERENCES members(person_id),
    FOREIGN KEY (topic_id) REFERENCES topics(topic_id)
);
"""

CREATE_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_disconnect_score
    ON mp_disconnect_scores(disconnect_score DESC);
CREATE INDEX IF NOT EXISTS idx_disconnect_person
    ON mp_disconnect_scores(person_id);
CREATE INDEX IF NOT EXISTS idx_disconnect_topic
    ON mp_disconnect_scores(topic_id);
"""


def ensure_table(db: sqlite3.Connection) -> None:
    """Create the mp_disconnect_scores table if it doesn't exist."""
    db.executescript(CREATE_TABLE_SQL + CREATE_INDEX_SQL)


# ---------------------------------------------------------------------------
# Core analysis
# ---------------------------------------------------------------------------

def _get_topic_id(db: sqlite3.Connection, topic_name: str) -> int | None:
    """Look up the topic_id for a given topic name."""
    row = db.execute(
        "SELECT topic_id FROM topics WHERE name = ?", (topic_name,)
    ).fetchone()
    return row["topic_id"] if row else None


def _find_speeches_via_speech_topics(
    db: sqlite3.Connection, topic_id: int
) -> list[sqlite3.Row]:
    """Find speeches linked to a topic through the speech_topics table."""
    return db.execute(
        """
        SELECT s.speech_id, s.person_id, s.text, s.date, st.relevance
        FROM speeches s
        JOIN speech_topics st ON st.speech_id = s.speech_id
        WHERE st.topic_id = ?
          AND s.person_id IS NOT NULL
        """,
        (topic_id,),
    ).fetchall()


def _find_topic_divisions(
    db: sqlite3.Connection, topic_name: str
) -> list[sqlite3.Row]:
    """Find divisions related to a topic by keyword matching name/summary."""
    profile = TOPIC_PROFILES.get(topic_name)
    if not profile:
        return []

    keywords = profile["discovery_keywords"]
    like_clauses = []
    params: list[str] = []
    for kw in keywords:
        like_clauses.append("d.name LIKE ?")
        params.append(f"%{kw}%")
        like_clauses.append("d.summary LIKE ?")
        params.append(f"%{kw}%")

    where = " OR ".join(like_clauses)
    return db.execute(
        f"""
        SELECT d.division_id, d.name AS division_name, d.date
        FROM divisions d
        WHERE {where}
        """,
        params,
    ).fetchall()


def compute_disconnect_for_topic(
    topic_name: str, db: sqlite3.Connection
) -> list[dict[str, Any]]:
    """Compute disconnect scores for all MPs on a single topic.

    Returns a list of dicts with all fields needed for the mp_disconnect_scores table.
    Only includes MPs with >= MIN_SPEECHES speeches on the topic.
    """
    topic_name = topic_name.lower().strip()
    if topic_name not in TOPIC_PROFILES:
        return []

    topic_id = _get_topic_id(db, topic_name)
    if topic_id is None:
        return []

    # Step 1: Get speeches via speech_topics join
    speeches = _find_speeches_via_speech_topics(db, topic_id)
    if not speeches:
        return []

    # Aggregate per MP: count speeches and classify stances
    mp_data: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "speech_count": 0,
        "pro_reform": 0,
        "anti_reform": 0,
    })

    for sp in speeches:
        pid = str(sp["person_id"])
        mp_data[pid]["speech_count"] += 1
        stance, _conf = classify_speech_stance(sp["text"], topic_name)
        if stance == "pro_reform":
            mp_data[pid]["pro_reform"] += 1
        elif stance == "anti_reform":
            mp_data[pid]["anti_reform"] += 1

    # Filter to MPs with enough speeches
    qualifying_mps = {
        pid: data for pid, data in mp_data.items()
        if data["speech_count"] >= MIN_SPEECHES
    }

    if not qualifying_mps:
        return []

    # Step 2: Find related divisions
    divisions = _find_topic_divisions(db, topic_name)
    division_ids = [d["division_id"] for d in divisions]
    division_names = {d["division_id"]: d["division_name"] or "" for d in divisions}

    # Step 3: Get votes for qualifying MPs on those divisions
    mp_votes: dict[str, list[tuple[str, int]]] = defaultdict(list)

    if division_ids:
        placeholders = ",".join("?" for _ in division_ids)
        vote_rows = db.execute(
            f"""
            SELECT v.person_id, v.vote, v.division_id
            FROM votes v
            WHERE v.division_id IN ({placeholders})
              AND v.vote NOT IN ('abstain', 'absent')
            """,
            division_ids,
        ).fetchall()

        for vr in vote_rows:
            pid = str(vr["person_id"])
            if pid in qualifying_mps:
                div_name = division_names.get(vr["division_id"], "")
                stance = vote_to_stance_directed(vr["vote"], div_name)
                if stance != "unclear":
                    mp_votes[pid].append((stance, vr["division_id"]))

    # Step 4: Fetch member metadata for qualifying MPs
    member_info: dict[str, dict[str, str]] = {}
    if qualifying_mps:
        pids = list(qualifying_mps.keys())
        placeholders = ",".join("?" for _ in pids)
        member_rows = db.execute(
            f"""
            SELECT person_id, full_name, party, electorate, chamber
            FROM members WHERE person_id IN ({placeholders})
            """,
            pids,
        ).fetchall()
        for r in member_rows:
            member_info[str(r["person_id"])] = {
                "full_name": r["full_name"] or "Unknown",
                "party": r["party"] or "Unknown",
                "electorate": r["electorate"] or "",
                "chamber": r["chamber"] or "",
            }

    # Step 5: Compute disconnect scores
    results: list[dict[str, Any]] = []
    now = datetime.now().isoformat()

    for pid, data in qualifying_mps.items():
        # Determine dominant speech stance
        if data["pro_reform"] > data["anti_reform"]:
            dominant = "pro_reform"
        elif data["anti_reform"] > data["pro_reform"]:
            dominant = "anti_reform"
        else:
            dominant = "unclear"

        # Count aligned/misaligned votes
        aligned = 0
        misaligned = 0
        votes_for_mp = mp_votes.get(pid, [])

        for vote_stance, _div_id in votes_for_mp:
            if dominant == "unclear":
                # If stance is unclear, we can't determine alignment;
                # count all votes as half-aligned for a neutral score
                aligned += 1
                continue
            if vote_stance == dominant:
                aligned += 1
            else:
                misaligned += 1

        total_comparable = aligned + misaligned
        if total_comparable > 0:
            vote_alignment = aligned / total_comparable
        else:
            # No voting data available: assume neutral alignment (0.5)
            # This avoids penalising MPs who simply haven't had a chance to vote
            vote_alignment = 0.5

        # Disconnect score: high speech activity + low vote alignment = high disconnect
        speech_intensity = min(data["speech_count"] / SPEECH_NORMALISER, 1.0)
        disconnect_score = round(speech_intensity * (1.0 - vote_alignment), 4)

        info = member_info.get(pid, {})
        results.append({
            "person_id": pid,
            "full_name": info.get("full_name"),
            "party": info.get("party"),
            "topic_id": topic_id,
            "topic_name": topic_name,
            "speech_count": data["speech_count"],
            "pro_reform_speeches": data["pro_reform"],
            "anti_reform_speeches": data["anti_reform"],
            "relevant_divisions": len(set(d for _, d in votes_for_mp)),
            "aligned_votes": aligned,
            "misaligned_votes": misaligned,
            "vote_alignment": round(vote_alignment, 4),
            "disconnect_score": disconnect_score,
            "updated_at": now,
        })

    # Sort by disconnect score descending (worst offenders first)
    results.sort(key=lambda r: -r["disconnect_score"])
    return results


def compute_all_topics(db: sqlite3.Connection) -> dict[str, list[dict]]:
    """Compute disconnect scores for all topics. Returns {topic_name: [results]}."""
    all_results: dict[str, list[dict]] = {}
    for topic_name in TOPIC_PROFILES:
        topic_results = compute_disconnect_for_topic(topic_name, db)
        if topic_results:
            all_results[topic_name] = topic_results
    return all_results


# ---------------------------------------------------------------------------
# Persist to database
# ---------------------------------------------------------------------------

def save_scores(db: sqlite3.Connection, results: list[dict]) -> int:
    """Write disconnect scores to the mp_disconnect_scores table.

    Uses INSERT OR REPLACE so re-runs update existing rows.
    Returns the number of rows written.
    """
    if not results:
        return 0

    ensure_table(db)

    db.executemany(
        """
        INSERT OR REPLACE INTO mp_disconnect_scores
            (person_id, topic_id, topic_name, speech_count,
             pro_reform_speeches, anti_reform_speeches,
             relevant_divisions, aligned_votes, misaligned_votes,
             vote_alignment, disconnect_score, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                r["person_id"], r["topic_id"], r["topic_name"],
                r["speech_count"], r["pro_reform_speeches"], r["anti_reform_speeches"],
                r["relevant_divisions"], r["aligned_votes"], r["misaligned_votes"],
                r["vote_alignment"], r["disconnect_score"], r["updated_at"],
            )
            for r in results
        ],
    )
    db.commit()
    return len(results)


def run_full_analysis(db: sqlite3.Connection, topic: str | None = None) -> int:
    """Run disconnect analysis and persist results. Returns total rows written."""
    ensure_table(db)
    total = 0

    if topic:
        results = compute_disconnect_for_topic(topic, db)
        total += save_scores(db, results)
    else:
        all_results = compute_all_topics(db)
        for topic_name, results in all_results.items():
            total += save_scores(db, results)

    return total


# ---------------------------------------------------------------------------
# Query helpers (used by API endpoints)
# ---------------------------------------------------------------------------

def get_mp_disconnect(
    person_id: str, db: sqlite3.Connection
) -> list[dict]:
    """Get all disconnect scores for a single MP."""
    ensure_table(db)
    rows = db.execute(
        """
        SELECT ds.*, m.full_name, m.party, m.electorate, m.chamber
        FROM mp_disconnect_scores ds
        LEFT JOIN members m ON m.person_id = ds.person_id
        WHERE ds.person_id = ?
        ORDER BY ds.disconnect_score DESC
        """,
        (person_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def get_disconnect_rankings(
    db: sqlite3.Connection,
    topic: str | None = None,
    limit: int = 50,
    min_speeches: int = MIN_SPEECHES,
) -> list[dict]:
    """Get disconnect rankings across all MPs, optionally filtered by topic.

    Returns MPs ordered by disconnect score (highest first).
    """
    ensure_table(db)
    conditions = ["ds.speech_count >= ?"]
    params: list[Any] = [min_speeches]

    if topic:
        conditions.append("ds.topic_name = ?")
        params.append(topic.lower().strip())

    where = " AND ".join(conditions)
    rows = db.execute(
        f"""
        SELECT ds.*, m.full_name, m.party, m.electorate, m.chamber
        FROM mp_disconnect_scores ds
        LEFT JOIN members m ON m.person_id = ds.person_id
        WHERE {where}
        ORDER BY ds.disconnect_score DESC
        LIMIT ?
        """,
        params + [limit],
    ).fetchall()
    return [dict(r) for r in rows]


def get_disconnect_summary(db: sqlite3.Connection) -> dict:
    """Get a high-level summary of disconnect scores across all topics."""
    ensure_table(db)

    # Per-topic stats
    topic_stats = db.execute(
        """
        SELECT topic_name,
               COUNT(*) as mp_count,
               AVG(disconnect_score) as avg_disconnect,
               MAX(disconnect_score) as max_disconnect,
               AVG(vote_alignment) as avg_alignment,
               SUM(speech_count) as total_speeches
        FROM mp_disconnect_scores
        WHERE speech_count >= ?
        GROUP BY topic_name
        ORDER BY avg_disconnect DESC
        """,
        (MIN_SPEECHES,),
    ).fetchall()

    # Overall worst disconnects
    worst = db.execute(
        """
        SELECT ds.person_id, ds.topic_name, ds.disconnect_score,
               ds.speech_count, ds.vote_alignment,
               m.full_name, m.party
        FROM mp_disconnect_scores ds
        LEFT JOIN members m ON m.person_id = ds.person_id
        WHERE ds.speech_count >= ?
        ORDER BY ds.disconnect_score DESC
        LIMIT 20
        """,
        (MIN_SPEECHES,),
    ).fetchall()

    # MPs with highest average disconnect across topics
    worst_avg = db.execute(
        """
        SELECT ds.person_id, m.full_name, m.party,
               AVG(ds.disconnect_score) as avg_disconnect,
               COUNT(ds.topic_name) as topics_scored,
               SUM(ds.speech_count) as total_speeches
        FROM mp_disconnect_scores ds
        LEFT JOIN members m ON m.person_id = ds.person_id
        WHERE ds.speech_count >= ?
        GROUP BY ds.person_id
        HAVING topics_scored >= 2
        ORDER BY avg_disconnect DESC
        LIMIT 20
        """,
        (MIN_SPEECHES,),
    ).fetchall()

    return {
        "topic_stats": [dict(r) for r in topic_stats],
        "worst_disconnects": [dict(r) for r in worst],
        "worst_avg_by_mp": [dict(r) for r in worst_avg],
        "computed_at": datetime.now().isoformat(),
    }


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _print_results(results: list[dict], topic_name: str, limit: int = 20) -> None:
    """Pretty-print disconnect results for a topic."""
    if not results:
        print(f"\n  No MPs with sufficient data for '{topic_name}'.")
        return

    print(f"\n{'=' * 90}")
    print(f"  DISCONNECT SCORES: {topic_name.upper()}")
    print(f"  {len(results)} MPs with >= {MIN_SPEECHES} speeches")
    print(f"{'=' * 90}")

    print(f"\n  {'Name':30s} {'Party':18s} {'Score':>6s}  {'Speeches':>8s}  "
          f"{'Alignment':>9s}  {'Aligned':>7s}  {'Mis':>5s}")
    print(f"  {'-' * 30} {'-' * 18} {'-' * 6}  {'-' * 8}  "
          f"{'-' * 9}  {'-' * 7}  {'-' * 5}")

    for r in results[:limit]:
        # Fetch name from result or use person_id
        name = r.get("full_name") or r["person_id"]
        party = r.get("party") or "?"
        print(
            f"  {name:30s} {party:18s} "
            f"{r['disconnect_score']:5.3f}   "
            f"{r['speech_count']:8d}  "
            f"{r['vote_alignment']:8.1%}  "
            f"{r['aligned_votes']:7d}  "
            f"{r['misaligned_votes']:5d}"
        )


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Speech-Vote Disconnect Scoring Engine"
    )
    parser.add_argument(
        "--topic", type=str, default=None,
        help="Analyse a single topic (e.g. 'gambling'). If omitted, analyses all.",
    )
    parser.add_argument(
        "--member", type=str, default=None,
        help="Show disconnect scores for a single MP (by person_id).",
    )
    parser.add_argument(
        "--rebuild", action="store_true",
        help="Drop and rebuild the mp_disconnect_scores table.",
    )
    parser.add_argument(
        "--top", type=int, default=20,
        help="Number of top results to display (default: 20).",
    )
    parser.add_argument(
        "--summary", action="store_true",
        help="Show high-level summary of disconnect scores.",
    )
    args = parser.parse_args()

    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")
    init_db(db)

    # Rebuild if requested
    if args.rebuild:
        print("Dropping mp_disconnect_scores table...")
        db.execute(f"DROP TABLE IF EXISTS {TABLE_NAME}")
        db.commit()
        ensure_table(db)
        print("Table recreated.")

    # Single member report
    if args.member:
        scores = get_mp_disconnect(args.member, db)
        if not scores:
            print(f"No disconnect data for person_id '{args.member}'.")
            print("Run without --member first to compute scores.")
        else:
            print(json.dumps(scores, indent=2, default=str))
        db.close()
        return

    # Summary
    if args.summary:
        summary = get_disconnect_summary(db)
        print(json.dumps(summary, indent=2, default=str))
        db.close()
        return

    # Run analysis
    if args.topic:
        topic = args.topic.lower().strip()
        if topic not in TOPIC_PROFILES:
            print(f"Unknown topic '{topic}'. Available: {', '.join(sorted(TOPIC_PROFILES))}")
            db.close()
            sys.exit(1)
        print(f"Computing disconnect scores for topic: {topic}...")
        results = compute_disconnect_for_topic(topic, db)
        saved = save_scores(db, results)
        print(f"  Saved {saved} scores to {TABLE_NAME}")
        _print_results(results, topic, limit=args.top)
    else:
        print("Computing disconnect scores for all topics...")
        all_results = compute_all_topics(db)
        total_saved = 0
        for topic_name, results in sorted(all_results.items()):
            saved = save_scores(db, results)
            total_saved += saved
            _print_results(results, topic_name, limit=args.top)
        print(f"\nTotal: {total_saved} scores saved to {TABLE_NAME}")

    db.close()


if __name__ == "__main__":
    main()
