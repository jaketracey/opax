"""
parli.analysis.topic_insights — Generate compelling data insights per topic.

For each topic in the database, computes:
  1. Key statistics (total speeches, unique MPs, date range, peak year, trend)
  2. Top quote (most impactful speech snippet)
  3. Biggest disconnect MPs (talk a lot but vote against reform)
  4. Follow the money (top donors in related industries)
  5. Party breakdown (speech count by party)
  6. Pay-to-play flags (contract_speech_links in related industries)
  7. Trend data (speeches per year, last 10 years)

Results cached in analysis_cache as JSON (key = "topic_insights_{topic_name}").

Usage:
    python -m parli.analysis.topic_insights              # generate all
    python -m parli.analysis.topic_insights --topic gambling  # single topic
    python -m parli.analysis.topic_insights --list        # list available topics
"""

import json
import sqlite3
import time
from datetime import datetime

from parli.db import get_db, is_postgres
from parli.schema import DEFAULT_DB_PATH


def _year_from_date(col: str) -> str:
    if is_postgres():
        return f"EXTRACT(YEAR FROM {col})::TEXT"
    return f"substr({col}, 1, 4)"


def _year_from_date_int(col: str) -> str:
    if is_postgres():
        return f"EXTRACT(YEAR FROM {col})::INTEGER"
    return f"CAST(substr({col}, 1, 4) AS INTEGER)"


def _gc_distinct(col: str, sep: str = ",") -> str:
    if is_postgres():
        return f"STRING_AGG(DISTINCT {col}, '{sep}')"
    return f"GROUP_CONCAT(DISTINCT {col})"


def _gc(col: str, sep: str = ",") -> str:
    if is_postgres():
        return f"STRING_AGG({col}, '{sep}')"
    return f"GROUP_CONCAT({col})"


def _pg_safe_pragma(db):
    if not is_postgres():
        _pg_safe_pragma(db)

# Map topics to donation industries for "follow the money"
TOPIC_INDUSTRY_MAP = {
    "gambling": ["gambling"],
    "housing": ["property"],
    "climate": ["mining", "energy"],
    "immigration": [],
    "health": ["health"],
    "education": ["education"],
    "economy": ["finance"],
    "defence": ["defence"],
    "indigenous_affairs": [],
    "corruption": [],
    "media": ["media"],
    "environment": ["mining", "agriculture"],
    "taxation": ["finance", "mining"],
    "infrastructure": ["transport", "property"],
    "foreign_affairs": ["defence"],
    "cost_of_living": ["retail", "energy"],
    "security": ["defence", "tech"],
    "indigenous": [],
    "technology": ["tech"],
    "israel_palestine": ["defence"],
}


def _commit_retry(db, retries: int = 5, delay: float = 2.0):
    for attempt in range(retries):
        try:
            db.commit()
            return
        except Exception as e:
            if "locked" in str(e).lower() and attempt < retries - 1:
                time.sleep(delay)
            else:
                raise


def generate_topic_insights(db: sqlite3.Connection, topic_id: int, topic_name: str) -> dict:
    """Generate all insights for a single topic. Returns the insights dict."""

    insights: dict = {
        "topic_id": topic_id,
        "topic_name": topic_name,
        "generated_at": datetime.now().isoformat(),
    }

    # ── 1. Key Statistics ─────────────────────────────────────────────────
    stats_row = db.execute(
        """
        SELECT
            COUNT(DISTINCT s.speech_id) AS total_speeches,
            COUNT(DISTINCT s.person_id) AS unique_mps,
            MIN(s.date) AS earliest_date,
            MAX(s.date) AS latest_date
        FROM speech_topics st
        JOIN speeches s ON s.speech_id = st.speech_id
        WHERE st.topic_id = ?
        """,
        (topic_id,),
    ).fetchone()

    total_speeches = stats_row["total_speeches"] or 0
    insights["key_stats"] = {
        "total_speeches": total_speeches,
        "unique_mps": stats_row["unique_mps"] or 0,
        "earliest_date": stats_row["earliest_date"],
        "latest_date": stats_row["latest_date"],
    }

    # Peak year
    year_expr = _year_from_date("s.date")
    peak_row = db.execute(
        f"""
        SELECT {year_expr} AS year, COUNT(*) AS cnt
        FROM speech_topics st
        JOIN speeches s ON s.speech_id = st.speech_id
        WHERE st.topic_id = ?
        GROUP BY year
        ORDER BY cnt DESC
        LIMIT 1
        """,
        (topic_id,),
    ).fetchone()
    insights["key_stats"]["peak_year"] = peak_row["year"] if peak_row else None
    insights["key_stats"]["peak_year_count"] = peak_row["cnt"] if peak_row else 0

    # Speech trend: compare last 3 years average to prior 3 years
    current_year = datetime.now().year
    recent_count = db.execute(
        """
        SELECT COUNT(*) AS cnt
        FROM speech_topics st
        JOIN speeches s ON s.speech_id = st.speech_id
        WHERE st.topic_id = ? AND s.date >= ?
        """,
        (topic_id, f"{current_year - 3}-01-01"),
    ).fetchone()["cnt"]

    prior_count = db.execute(
        """
        SELECT COUNT(*) AS cnt
        FROM speech_topics st
        JOIN speeches s ON s.speech_id = st.speech_id
        WHERE st.topic_id = ? AND s.date >= ? AND s.date < ?
        """,
        (topic_id, f"{current_year - 6}-01-01", f"{current_year - 3}-01-01"),
    ).fetchone()["cnt"]

    if prior_count > 0 and recent_count > prior_count * 1.2:
        trend = "growing"
    elif prior_count > 0 and recent_count < prior_count * 0.8:
        trend = "declining"
    else:
        trend = "stable"
    insights["key_stats"]["trend"] = trend
    insights["key_stats"]["recent_3yr_count"] = recent_count
    insights["key_stats"]["prior_3yr_count"] = prior_count

    # ── 2. Top Quote ─────────────────────────────────────────────────────
    # Find the longest speech with high relevance (proxy for impactful content)
    quote_row = db.execute(
        """
        SELECT s.speech_id, s.speaker_name, s.party, s.date, s.topic,
               substr(s.text, 1, 800) AS text_snippet, s.word_count,
               st.relevance
        FROM speech_topics st
        JOIN speeches s ON s.speech_id = st.speech_id
        WHERE st.topic_id = ?
          AND s.word_count > 200
          AND s.speaker_name IS NOT NULL
          AND s.speaker_name != ''
        ORDER BY st.relevance DESC, s.word_count DESC
        LIMIT 1
        """,
        (topic_id,),
    ).fetchone()

    if quote_row:
        insights["top_quote"] = {
            "speaker": quote_row["speaker_name"],
            "party": quote_row["party"],
            "date": quote_row["date"],
            "topic": quote_row["topic"],
            "text": quote_row["text_snippet"],
            "word_count": quote_row["word_count"],
            "relevance": quote_row["relevance"],
        }
    else:
        # Fallback: any speech
        fallback = db.execute(
            """
            SELECT s.speaker_name, s.party, s.date, s.topic,
                   substr(s.text, 1, 800) AS text_snippet, s.word_count
            FROM speech_topics st
            JOIN speeches s ON s.speech_id = st.speech_id
            WHERE st.topic_id = ? AND s.speaker_name IS NOT NULL
            ORDER BY s.word_count DESC
            LIMIT 1
            """,
            (topic_id,),
        ).fetchone()
        if fallback:
            insights["top_quote"] = {
                "speaker": fallback["speaker_name"],
                "party": fallback["party"],
                "date": fallback["date"],
                "topic": fallback["topic"],
                "text": fallback["text_snippet"],
                "word_count": fallback["word_count"],
                "relevance": None,
            }
        else:
            insights["top_quote"] = None

    # ── 3. Biggest Disconnect MPs ─────────────────────────────────────────
    disconnect_rows = db.execute(
        """
        SELECT d.person_id, m.full_name, m.party, m.electorate,
               d.speech_count, d.disconnect_score,
               d.pro_reform_speeches, d.anti_reform_speeches,
               d.aligned_votes, d.misaligned_votes,
               d.relevant_divisions, d.vote_alignment
        FROM mp_disconnect_scores d
        JOIN members m ON m.person_id = d.person_id
        WHERE d.topic_id = ?
          AND d.speech_count >= 3
          AND d.disconnect_score > 0
        ORDER BY d.disconnect_score DESC
        LIMIT 3
        """,
        (topic_id,),
    ).fetchall()

    insights["biggest_disconnects"] = [
        {
            "person_id": r["person_id"],
            "name": r["full_name"],
            "party": r["party"],
            "electorate": r["electorate"],
            "speech_count": r["speech_count"],
            "disconnect_score": round(r["disconnect_score"], 3),
            "pro_reform_speeches": r["pro_reform_speeches"],
            "anti_reform_speeches": r["anti_reform_speeches"],
            "aligned_votes": r["aligned_votes"],
            "misaligned_votes": r["misaligned_votes"],
            "relevant_divisions": r["relevant_divisions"],
            "vote_alignment": round(r["vote_alignment"], 3) if r["vote_alignment"] else 0,
        }
        for r in disconnect_rows
    ]

    # ── 4. Follow the Money ───────────────────────────────────────────────
    industries = TOPIC_INDUSTRY_MAP.get(topic_name, [])
    if industries:
        placeholders = ",".join("?" for _ in industries)
        # Top 5 donors
        gc_recipients = _gc_distinct("recipient")
        donor_rows = db.execute(
            f"""
            SELECT donor_name, SUM(amount) AS total_donated,
                   COUNT(*) AS donation_count,
                   {gc_recipients} AS recipients,
                   MAX(industry) AS industry
            FROM donations
            WHERE industry IN ({placeholders})
              AND amount IS NOT NULL
            GROUP BY donor_name
            ORDER BY total_donated DESC
            LIMIT 5
            """,
            industries,
        ).fetchall()

        insights["follow_the_money"] = {
            "industries_searched": industries,
            "top_donors": [
                {
                    "donor_name": r["donor_name"],
                    "total_donated": round(r["total_donated"], 2) if r["total_donated"] else 0,
                    "donation_count": r["donation_count"],
                    "recipients": r["recipients"],
                    "industry": r["industry"],
                }
                for r in donor_rows
            ],
        }

        # Total by party for these industries
        party_donation_rows = db.execute(
            f"""
            SELECT recipient, SUM(amount) AS total, COUNT(*) AS cnt
            FROM donations
            WHERE industry IN ({placeholders})
              AND amount IS NOT NULL
            GROUP BY recipient
            ORDER BY total DESC
            LIMIT 10
            """,
            industries,
        ).fetchall()

        insights["follow_the_money"]["by_party"] = [
            {
                "party": r["recipient"],
                "total": round(r["total"], 2) if r["total"] else 0,
                "donation_count": r["cnt"],
            }
            for r in party_donation_rows
        ]

        # Grand total
        grand_total = db.execute(
            f"""
            SELECT SUM(amount) AS total
            FROM donations
            WHERE industry IN ({placeholders}) AND amount IS NOT NULL
            """,
            industries,
        ).fetchone()
        insights["follow_the_money"]["grand_total"] = (
            round(grand_total["total"], 2) if grand_total["total"] else 0
        )
    else:
        insights["follow_the_money"] = {
            "industries_searched": [],
            "top_donors": [],
            "by_party": [],
            "grand_total": 0,
            "note": "No industry mapping defined for this topic",
        }

    # ── 5. Party Breakdown ────────────────────────────────────────────────
    party_rows = db.execute(
        """
        SELECT s.party, COUNT(*) AS speech_count
        FROM speech_topics st
        JOIN speeches s ON s.speech_id = st.speech_id
        WHERE st.topic_id = ?
          AND s.party IS NOT NULL AND s.party != ''
        GROUP BY s.party
        ORDER BY speech_count DESC
        """,
        (topic_id,),
    ).fetchall()

    insights["party_breakdown"] = [
        {"party": r["party"], "speech_count": r["speech_count"]}
        for r in party_rows
    ]

    # ── 6. Pay-to-Play Flags ─────────────────────────────────────────────
    # Use a two-step approach: first get donor names from the industry, then
    # match against contract_speech_links by donor_name (avoids expensive
    # cross-join with LIKE on 200K+ rows).
    if industries:
        placeholders = ",".join("?" for _ in industries)
        # Get top donor names in these industries
        industry_donors = db.execute(
            f"""
            SELECT DISTINCT LOWER(donor_name) AS dn
            FROM donations
            WHERE industry IN ({placeholders}) AND donor_name IS NOT NULL
            ORDER BY amount DESC
            LIMIT 200
            """,
            industries,
        ).fetchall()
        donor_names = {r["dn"] for r in industry_donors}

        # Find contract_speech_links where donor_name matches
        ptf_rows = []
        if donor_names:
            # Use the indexed donor_name column on contract_speech_links
            # Batch in chunks to avoid oversized IN clauses
            donor_list = list(donor_names)[:100]
            dn_placeholders = ",".join("?" for _ in donor_list)
            gc_parties = _gc_distinct("party")
            ptf_rows = db.execute(
                f"""
                SELECT company_name, MAX(supplier_name) AS supplier_name, MAX(donor_name) AS donor_name,
                       SUM(contract_amount) AS total_contracts,
                       SUM(donation_amount) AS total_donations,
                       {gc_parties} AS parties,
                       COUNT(*) AS link_count,
                       MAX(match_type) AS match_type
                FROM contract_speech_links
                WHERE LOWER(donor_name) IN ({dn_placeholders})
                   OR LOWER(company_name) IN ({dn_placeholders})
                GROUP BY company_name
                ORDER BY total_contracts DESC
                LIMIT 10
                """,
                donor_list + donor_list,
            ).fetchall()

        insights["pay_to_play"] = [
            {
                "company": r["company_name"],
                "supplier": r["supplier_name"],
                "donor_name": r["donor_name"],
                "total_contracts": round(r["total_contracts"], 2) if r["total_contracts"] else 0,
                "total_donations": round(r["total_donations"], 2) if r["total_donations"] else 0,
                "parties": r["parties"],
                "link_count": r["link_count"],
                "match_type": r["match_type"],
            }
            for r in ptf_rows
        ]
    else:
        # For topics without industry mapping, try keyword match on company_name
        keywords_row = db.execute(
            "SELECT keywords FROM topics WHERE topic_id = ?", (topic_id,)
        ).fetchone()
        ptf_results = []
        if keywords_row and keywords_row["keywords"]:
            kw_list = [k.strip() for k in keywords_row["keywords"].split(",")][:3]
            for kw in kw_list:
                gc_p = _gc_distinct("party")
                rows = db.execute(
                    f"""
                    SELECT company_name, SUM(contract_amount) AS total_contracts,
                           SUM(donation_amount) AS total_donations,
                           {gc_p} AS parties,
                           COUNT(*) AS link_count
                    FROM contract_speech_links
                    WHERE LOWER(company_name) LIKE ?
                    GROUP BY company_name
                    ORDER BY total_contracts DESC
                    LIMIT 5
                    """,
                    (f"%{kw}%",),
                ).fetchall()
                for r in rows:
                    ptf_results.append({
                        "company": r["company_name"],
                        "total_contracts": round(r["total_contracts"], 2) if r["total_contracts"] else 0,
                        "total_donations": round(r["total_donations"], 2) if r["total_donations"] else 0,
                        "parties": r["parties"],
                        "link_count": r["link_count"],
                        "keyword_match": kw,
                    })
        insights["pay_to_play"] = ptf_results

    # ── 7. Trend Data (speeches per year, last 10 years) ──────────────────
    year_int_expr = _year_from_date_int("s.date")
    trend_rows = db.execute(
        f"""
        SELECT {year_expr} AS year, COUNT(*) AS speech_count
        FROM speech_topics st
        JOIN speeches s ON s.speech_id = st.speech_id
        WHERE st.topic_id = ?
          AND {year_int_expr} >= ?
        GROUP BY year
        ORDER BY year
        """,
        (topic_id, current_year - 10),
    ).fetchall()

    insights["trend_data"] = [
        {"year": r["year"], "speech_count": r["speech_count"]}
        for r in trend_rows
    ]

    return insights


def generate_all_insights(db: sqlite3.Connection, topic_filter: str | None = None) -> list[dict]:
    """Generate insights for all topics (or a single topic) and cache them."""
    _pg_safe_pragma(db)

    topics = db.execute("SELECT topic_id, name FROM topics ORDER BY topic_id").fetchall()

    if topic_filter:
        topics = [t for t in topics if t["name"] == topic_filter]
        if not topics:
            print(f"[topic_insights] Topic '{topic_filter}' not found in database.")
            return []

    results = []
    for t in topics:
        topic_id = t["topic_id"]
        topic_name = t["name"]
        print(f"[topic_insights] Generating insights for '{topic_name}' (id={topic_id})...")
        start = time.time()

        try:
            insights = generate_topic_insights(db, topic_id, topic_name)
            results.append(insights)

            # Cache in analysis_cache
            cache_key = f"topic_insights_{topic_name}"
            now_sql = "NOW()" if is_postgres() else "datetime('now')"
            db.execute(
                f"""
                INSERT INTO analysis_cache (key, value, updated_at)
                VALUES (?, ?, {now_sql})
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                """,
                (cache_key, json.dumps(insights, default=str)),
            )
            _commit_retry(db)

            elapsed = time.time() - start
            speeches = insights["key_stats"]["total_speeches"]
            disconnects = len(insights["biggest_disconnects"])
            donors = len(insights.get("follow_the_money", {}).get("top_donors", []))
            ptp = len(insights.get("pay_to_play", []))
            print(
                f"  -> {speeches:,} speeches, {disconnects} disconnects, "
                f"{donors} top donors, {ptp} pay-to-play flags ({elapsed:.1f}s)"
            )
        except Exception as e:
            print(f"  -> ERROR: {e}")
            import traceback
            traceback.print_exc()

    return results


def get_cached_insights(db: sqlite3.Connection, topic_name: str) -> dict | None:
    """Retrieve cached insights for a topic. Returns None if not cached."""
    _pg_safe_pragma(db)
    row = db.execute(
        "SELECT value, updated_at FROM analysis_cache WHERE key = ?",
        (f"topic_insights_{topic_name}",),
    ).fetchone()
    if row:
        val = row["value"]
        data = json.loads(val) if isinstance(val, str) else val
        data["cached_at"] = str(row["updated_at"]) if row["updated_at"] else None
        return data
    return None


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate topic insights for OPAX")
    parser.add_argument("--topic", type=str, default=None, help="Generate for a single topic")
    parser.add_argument("--list", action="store_true", help="List available topics")
    args = parser.parse_args()

    db = get_db()
    _pg_safe_pragma(db)

    if args.list:
        topics = db.execute("SELECT topic_id, name FROM topics ORDER BY topic_id").fetchall()
        print(f"\n{len(topics)} topics in database:")
        for t in topics:
            count = db.execute(
                "SELECT COUNT(*) AS c FROM speech_topics WHERE topic_id = ?",
                (t["topic_id"],),
            ).fetchone()["c"]
            print(f"  {t['topic_id']:3d}  {t['name']:<25s}  {count:>8,} classified speeches")
        print()
    else:
        print(f"[topic_insights] Starting insight generation...")
        print(f"[topic_insights] Database: {DEFAULT_DB_PATH}")
        results = generate_all_insights(db, topic_filter=args.topic)
        print(f"\n[topic_insights] Done. Generated insights for {len(results)} topics.")

        # Print summary
        for r in results:
            name = r["topic_name"]
            speeches = r["key_stats"]["total_speeches"]
            trend = r["key_stats"]["trend"]
            money = r.get("follow_the_money", {}).get("grand_total", 0)
            print(f"  {name:<25s}  {speeches:>8,} speeches  trend={trend:<10s}  donations=${money:>14,.0f}")
