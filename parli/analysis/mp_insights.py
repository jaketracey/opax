"""
parli.analysis.mp_insights -- Comprehensive MP profile insight generator.

For each MP with sufficient speech history, generates a rich profile covering:
  1. Career stats (total speeches, active years, speeches/year)
  2. Signature topic (their most-spoken topic vs parliament average)
  3. Biggest disconnect (topic they talk about but vote against)
  4. Donor exposure (top industries donating to their party + favorable vote %)
  5. Notable quote (longest speech snippet on signature topic)
  6. Voting record summary (attendance, rebellions, party loyalty)
  7. Peer comparison (vs party average on volume, disconnect, attendance)

Results are cached in analysis_cache as JSON (key = "mp_insights_{person_id}").

Usage:
    python -m parli.analysis.mp_insights
    python -m parli.analysis.mp_insights --person-id 10001
    python -m parli.analysis.mp_insights --limit 50
    python -m parli.analysis.mp_insights --rebuild
"""

from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime
from typing import Any

from parli.schema import get_db, init_db


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MIN_SPEECHES = 50
DEFAULT_TOP_N = 200
CACHE_KEY_PREFIX = "mp_insights_"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _dict_row(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row else None


def _dict_rows(rows: list[sqlite3.Row]) -> list[dict]:
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# 1. Career stats
# ---------------------------------------------------------------------------

def _career_stats(db: sqlite3.Connection, person_id: str) -> dict[str, Any]:
    """Total speeches, first/last dates, years active, speeches per year."""
    row = db.execute(
        """
        SELECT COUNT(*) AS total_speeches,
               MIN(date) AS first_speech,
               MAX(date) AS last_speech
        FROM speeches
        WHERE person_id = ?
        """,
        (person_id,),
    ).fetchone()

    total = row["total_speeches"]
    first = row["first_speech"]
    last = row["last_speech"]

    years_active = 0
    speeches_per_year = 0.0
    if first and last:
        first_year = int(first[:4]) if len(first) >= 4 else None
        last_year = int(last[:4]) if len(last) >= 4 else None
        if first_year and last_year:
            years_active = max(last_year - first_year + 1, 1)
            speeches_per_year = round(total / years_active, 1)

    return {
        "total_speeches": total,
        "first_speech": first,
        "last_speech": last,
        "years_active": years_active,
        "speeches_per_year": speeches_per_year,
    }


# ---------------------------------------------------------------------------
# 2. Signature topic
# ---------------------------------------------------------------------------

def _signature_topic(
    db: sqlite3.Connection, person_id: str, parliament_avg: dict[int, float]
) -> dict[str, Any] | None:
    """The topic the MP speaks about most, with comparison to parliament average."""
    row = db.execute(
        """
        SELECT t.topic_id, t.name, COUNT(*) AS cnt
        FROM speeches s
        JOIN speech_topics st ON s.speech_id = st.speech_id
        JOIN topics t ON st.topic_id = t.topic_id
        WHERE s.person_id = ?
        GROUP BY t.topic_id
        ORDER BY cnt DESC
        LIMIT 1
        """,
        (person_id,),
    ).fetchone()

    if not row:
        return None

    avg = parliament_avg.get(row["topic_id"], 0.0)
    return {
        "topic_id": row["topic_id"],
        "topic_name": row["name"],
        "speech_count": row["cnt"],
        "parliament_avg": round(avg, 1),
        "ratio_vs_avg": round(row["cnt"] / avg, 2) if avg > 0 else None,
    }


# ---------------------------------------------------------------------------
# 3. Biggest disconnect
# ---------------------------------------------------------------------------

def _biggest_disconnect(db: sqlite3.Connection, person_id: str) -> dict[str, Any] | None:
    """Topic with the highest disconnect score for this MP."""
    row = db.execute(
        """
        SELECT topic_name, disconnect_score, speech_count,
               vote_alignment, aligned_votes, misaligned_votes
        FROM mp_disconnect_scores
        WHERE person_id = ?
        ORDER BY disconnect_score DESC
        LIMIT 1
        """,
        (person_id,),
    ).fetchone()

    if not row or row["disconnect_score"] == 0:
        return None

    return {
        "topic_name": row["topic_name"],
        "disconnect_score": row["disconnect_score"],
        "speech_count": row["speech_count"],
        "vote_alignment": row["vote_alignment"],
        "aligned_votes": row["aligned_votes"],
        "misaligned_votes": row["misaligned_votes"],
    }


# ---------------------------------------------------------------------------
# 4. Donor exposure
# ---------------------------------------------------------------------------

def _donor_exposure(db: sqlite3.Connection, person_id: str, party: str) -> dict[str, Any]:
    """Top industries donating to the MP's party, plus favorable vote % from
    mp_donor_influence_scores."""
    # Top industries by donation amount to the party
    top_industries = db.execute(
        """
        SELECT industry, SUM(amount) AS total_donated, COUNT(*) AS donation_count
        FROM donations
        WHERE recipient LIKE ?
          AND industry IS NOT NULL
          AND industry != ''
        GROUP BY industry
        ORDER BY total_donated DESC
        LIMIT 5
        """,
        (f"%{party.split()[0]}%",),
    ).fetchall()

    industries = []
    for ind in top_industries:
        # Check if there's an influence score for this MP + industry
        influence = db.execute(
            """
            SELECT favorable_vote_pct, influence_score, divisions_voted
            FROM mp_donor_influence_scores
            WHERE person_id = ? AND industry = ?
            """,
            (person_id, ind["industry"]),
        ).fetchone()

        entry: dict[str, Any] = {
            "industry": ind["industry"],
            "total_donated_to_party": ind["total_donated"],
            "donation_count": ind["donation_count"],
        }
        if influence:
            entry["favorable_vote_pct"] = influence["favorable_vote_pct"]
            entry["influence_score"] = influence["influence_score"]
            entry["divisions_voted"] = influence["divisions_voted"]

        industries.append(entry)

    return {
        "party": party,
        "top_industries": industries,
    }


# ---------------------------------------------------------------------------
# 5. Notable quote
# ---------------------------------------------------------------------------

def _notable_quote(
    db: sqlite3.Connection, person_id: str, signature_topic_name: str | None
) -> dict[str, Any] | None:
    """Longest speech snippet on signature topic (or overall if no topic)."""
    if signature_topic_name:
        row = db.execute(
            """
            SELECT s.date, s.topic, substr(s.text, 1, 300) AS excerpt,
                   length(s.text) AS text_len
            FROM speeches s
            JOIN speech_topics st ON s.speech_id = st.speech_id
            JOIN topics t ON st.topic_id = t.topic_id
            WHERE s.person_id = ? AND t.name = ? AND length(s.text) > 200
            ORDER BY length(s.text) DESC
            LIMIT 1
            """,
            (person_id, signature_topic_name),
        ).fetchone()
    else:
        row = None

    # Fallback to any topic if no match
    if not row:
        row = db.execute(
            """
            SELECT date, topic, substr(text, 1, 300) AS excerpt,
                   length(text) AS text_len
            FROM speeches
            WHERE person_id = ? AND length(text) > 200
            ORDER BY length(text) DESC
            LIMIT 1
            """,
            (person_id,),
        ).fetchone()

    if not row:
        return None

    return {
        "date": row["date"],
        "topic": row["topic"],
        "excerpt": row["excerpt"],
        "text_length": row["text_len"],
    }


# ---------------------------------------------------------------------------
# 6. Voting record summary
# ---------------------------------------------------------------------------

def _voting_record(db: sqlite3.Connection, person_id: str) -> dict[str, Any]:
    """Attendance rate, rebellion count, party loyalty %."""
    # Vote breakdown
    vote_counts = db.execute(
        """
        SELECT vote, COUNT(*) AS cnt
        FROM votes
        WHERE person_id = ?
        GROUP BY vote
        """,
        (person_id,),
    ).fetchall()

    breakdown = {r["vote"]: r["cnt"] for r in vote_counts}
    total_possible = sum(breakdown.values())
    total_attended = total_possible - breakdown.get("absent", 0)
    attendance_rate = round(total_attended / total_possible, 4) if total_possible > 0 else None

    # Rebellions from TVFY cache
    rebellions = 0
    votes_attended_tvfy = None
    votes_possible_tvfy = None
    tvfy_row = db.execute(
        "SELECT value FROM analysis_cache WHERE key = ?",
        (f"tvfy_person_{person_id}",),
    ).fetchone()
    if tvfy_row:
        try:
            tvfy = json.loads(tvfy_row["value"])
            rebellions = tvfy.get("rebellions", 0) or 0
            votes_attended_tvfy = tvfy.get("votes_attended")
            votes_possible_tvfy = tvfy.get("votes_possible")
        except (json.JSONDecodeError, TypeError):
            pass

    # Party loyalty: derive from TVFY rebellions data if available,
    # otherwise compute from votes table using a lightweight approach.
    party_loyalty_pct = None
    if votes_attended_tvfy and rebellions is not None:
        attended = votes_attended_tvfy if votes_attended_tvfy > 0 else 1
        party_loyalty_pct = round(1.0 - (rebellions / attended), 4)
    elif total_attended > 0 and rebellions is not None:
        party_loyalty_pct = round(1.0 - (rebellions / total_attended), 4)

    return {
        "vote_breakdown": breakdown,
        "total_divisions": total_possible,
        "total_attended": total_attended,
        "attendance_rate": attendance_rate,
        "rebellions": rebellions,
        "party_loyalty_pct": party_loyalty_pct,
        "votes_attended_tvfy": votes_attended_tvfy,
        "votes_possible_tvfy": votes_possible_tvfy,
    }


# ---------------------------------------------------------------------------
# 7. Peer comparison
# ---------------------------------------------------------------------------

def _precompute_party_averages(db: sqlite3.Connection) -> dict[str, dict[str, float]]:
    """Precompute party-level averages for speeches, disconnect, attendance.

    Returns {party: {"avg_speeches": ..., "avg_disconnect": ..., "avg_attendance": ...}}
    This is called once per batch run to avoid per-MP queries.
    """
    party_avgs: dict[str, dict[str, float]] = {}

    # Party average speeches
    rows = db.execute(
        """
        SELECT m.party, AVG(cnt) AS avg_speeches
        FROM (
            SELECT s.person_id, COUNT(*) AS cnt
            FROM speeches s
            WHERE s.person_id IS NOT NULL
            GROUP BY s.person_id
        ) sc
        JOIN members m ON m.person_id = sc.person_id
        WHERE m.party IS NOT NULL
        GROUP BY m.party
        """
    ).fetchall()
    for r in rows:
        party_avgs.setdefault(r["party"], {})["avg_speeches"] = r["avg_speeches"]

    # Party average disconnect
    rows = db.execute(
        """
        SELECT m.party, AVG(avg_dc) AS avg_disconnect
        FROM (
            SELECT ds.person_id, AVG(ds.disconnect_score) AS avg_dc
            FROM mp_disconnect_scores ds
            WHERE ds.speech_count >= 5
            GROUP BY ds.person_id
        ) mp_dc
        JOIN members m ON m.person_id = mp_dc.person_id
        WHERE m.party IS NOT NULL
        GROUP BY m.party
        """
    ).fetchall()
    for r in rows:
        party_avgs.setdefault(r["party"], {})["avg_disconnect"] = r["avg_disconnect"]

    # Party average attendance
    rows = db.execute(
        """
        SELECT m.party, AVG(att_rate) AS avg_attendance
        FROM (
            SELECT v.person_id,
                   1.0 - (CAST(SUM(CASE WHEN v.vote = 'absent' THEN 1 ELSE 0 END) AS REAL)
                          / COUNT(*)) AS att_rate
            FROM votes v
            GROUP BY v.person_id
        ) va
        JOIN members m ON m.person_id = va.person_id
        WHERE m.party IS NOT NULL
        GROUP BY m.party
        """
    ).fetchall()
    for r in rows:
        party_avgs.setdefault(r["party"], {})["avg_attendance"] = r["avg_attendance"]

    return party_avgs


def _peer_comparison(
    db: sqlite3.Connection,
    person_id: str,
    party: str,
    career: dict,
    voting: dict,
    party_avgs: dict[str, dict[str, float]] | None = None,
) -> dict[str, Any]:
    """Compare MP to their party average on speech volume, disconnect, attendance."""

    # If party_avgs not precomputed, compute just for this party
    if party_avgs is None:
        party_avgs = _precompute_party_averages(db)

    pavg = party_avgs.get(party, {})

    # MP's own average disconnect
    mp_avg_disconnect_row = db.execute(
        """
        SELECT AVG(disconnect_score) AS avg_dc
        FROM mp_disconnect_scores
        WHERE person_id = ? AND speech_count >= 5
        """,
        (person_id,),
    ).fetchone()
    mp_avg_disconnect = (
        round(mp_avg_disconnect_row["avg_dc"], 4)
        if mp_avg_disconnect_row and mp_avg_disconnect_row["avg_dc"] is not None
        else None
    )

    result: dict[str, Any] = {}

    avg_speeches = pavg.get("avg_speeches")
    if avg_speeches is not None:
        avg_s = round(avg_speeches, 1)
        result["speech_volume"] = {
            "mp_value": career["total_speeches"],
            "party_avg": avg_s,
            "above_avg": career["total_speeches"] > avg_s,
        }

    avg_disconnect = pavg.get("avg_disconnect")
    if avg_disconnect is not None:
        avg_dc = round(avg_disconnect, 4)
        result["disconnect"] = {
            "mp_value": mp_avg_disconnect,
            "party_avg": avg_dc,
            "above_avg": (mp_avg_disconnect or 0) > avg_dc,
        }

    avg_attendance = pavg.get("avg_attendance")
    if avg_attendance is not None:
        pavg_att = round(avg_attendance, 4)
        result["attendance"] = {
            "mp_value": voting["attendance_rate"],
            "party_avg": pavg_att,
            "above_avg": (voting["attendance_rate"] or 0) > pavg_att,
        }

    return result


# ---------------------------------------------------------------------------
# Parliament-wide averages (precomputed once per run)
# ---------------------------------------------------------------------------

def _parliament_topic_averages(db: sqlite3.Connection) -> dict[int, float]:
    """Average speech count per topic per MP across parliament."""
    rows = db.execute(
        """
        SELECT st.topic_id, AVG(cnt) AS avg_speeches
        FROM (
            SELECT st2.topic_id, s.person_id, COUNT(*) AS cnt
            FROM speech_topics st2
            JOIN speeches s ON s.speech_id = st2.speech_id
            WHERE s.person_id IS NOT NULL
            GROUP BY st2.topic_id, s.person_id
        ) st
        GROUP BY st.topic_id
        """
    ).fetchall()
    return {r["topic_id"]: r["avg_speeches"] for r in rows}


# ---------------------------------------------------------------------------
# Main insight generator
# ---------------------------------------------------------------------------

def generate_mp_insights(
    db: sqlite3.Connection,
    person_id: str,
    parliament_avg: dict[int, float],
    force: bool = False,
    party_avgs: dict[str, dict[str, float]] | None = None,
) -> dict[str, Any] | None:
    """Generate full insight profile for a single MP.

    Returns None if the MP doesn't exist or has too few speeches.
    Results are cached in analysis_cache.
    """
    cache_key = f"{CACHE_KEY_PREFIX}{person_id}"

    # Check cache unless forced
    if not force:
        cached = db.execute(
            "SELECT value FROM analysis_cache WHERE key = ?", (cache_key,)
        ).fetchone()
        if cached:
            try:
                return json.loads(cached["value"])
            except (json.JSONDecodeError, TypeError):
                pass

    # Validate member exists
    member = db.execute(
        "SELECT full_name, party, electorate, chamber FROM members WHERE person_id = ?",
        (person_id,),
    ).fetchone()
    if not member:
        return None

    party = member["party"] or "Unknown"

    # 1. Career stats
    career = _career_stats(db, person_id)
    if career["total_speeches"] < MIN_SPEECHES:
        return None

    # 2. Signature topic
    sig_topic = _signature_topic(db, person_id, parliament_avg)

    # 3. Biggest disconnect
    disconnect = _biggest_disconnect(db, person_id)

    # 4. Donor exposure
    donor_exp = _donor_exposure(db, person_id, party)

    # 5. Notable quote
    sig_topic_name = sig_topic["topic_name"] if sig_topic else None
    quote = _notable_quote(db, person_id, sig_topic_name)

    # 6. Voting record
    voting = _voting_record(db, person_id)

    # 7. Peer comparison
    peers = _peer_comparison(db, person_id, party, career, voting, party_avgs=party_avgs)

    result = {
        "person_id": person_id,
        "full_name": member["full_name"],
        "party": party,
        "electorate": member["electorate"],
        "chamber": member["chamber"],
        "generated_at": datetime.now().isoformat(),
        "career_stats": career,
        "signature_topic": sig_topic,
        "biggest_disconnect": disconnect,
        "donor_exposure": donor_exp,
        "notable_quote": quote,
        "voting_record": voting,
        "peer_comparison": peers,
    }

    # Cache it
    db.execute(
        "INSERT OR REPLACE INTO analysis_cache(key, value, updated_at) VALUES (?, ?, datetime('now'))",
        (cache_key, json.dumps(result, default=str)),
    )
    db.commit()

    return result


def generate_top_mp_insights(
    db: sqlite3.Connection,
    limit: int = DEFAULT_TOP_N,
    force: bool = False,
) -> list[dict[str, Any]]:
    """Generate insights for the top N most active MPs (by speech count).

    Returns list of insight dicts for MPs with >= MIN_SPEECHES speeches.
    """
    # Find top MPs by speech volume
    top_mps = db.execute(
        """
        SELECT s.person_id, COUNT(*) AS cnt
        FROM speeches s
        WHERE s.person_id IS NOT NULL
        GROUP BY s.person_id
        HAVING cnt >= ?
        ORDER BY cnt DESC
        LIMIT ?
        """,
        (MIN_SPEECHES, limit),
    ).fetchall()

    print(f"[mp_insights] Found {len(top_mps)} MPs with >= {MIN_SPEECHES} speeches (limit {limit})")

    # Precompute parliament-wide topic averages once
    parliament_avg = _parliament_topic_averages(db)
    print(f"[mp_insights] Precomputed parliament averages for {len(parliament_avg)} topics")

    # Precompute party averages once (speeches, disconnect, attendance)
    party_avgs = _precompute_party_averages(db)
    print(f"[mp_insights] Precomputed party averages for {len(party_avgs)} parties")

    results = []
    for i, mp in enumerate(top_mps):
        pid = mp["person_id"]
        try:
            insight = generate_mp_insights(db, pid, parliament_avg, force=force, party_avgs=party_avgs)
            if insight:
                results.append(insight)
                if (i + 1) % 25 == 0:
                    print(f"[mp_insights] Processed {i + 1}/{len(top_mps)} MPs...")
        except Exception as e:
            print(f"[mp_insights] Error processing {pid}: {e}")

    print(f"[mp_insights] Generated {len(results)} MP insight profiles")
    return results


def get_mp_insight(
    db: sqlite3.Connection, person_id: str
) -> dict[str, Any] | None:
    """Retrieve a cached MP insight profile, or generate it on-demand."""
    cache_key = f"{CACHE_KEY_PREFIX}{person_id}"
    cached = db.execute(
        "SELECT value FROM analysis_cache WHERE key = ?", (cache_key,)
    ).fetchone()
    if cached:
        try:
            return json.loads(cached["value"])
        except (json.JSONDecodeError, TypeError):
            pass

    # Generate on the fly
    parliament_avg = _parliament_topic_averages(db)
    return generate_mp_insights(db, person_id, parliament_avg, force=True)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Generate comprehensive MP insight profiles"
    )
    parser.add_argument(
        "--person-id", type=str, default=None,
        help="Generate insights for a single MP (by person_id).",
    )
    parser.add_argument(
        "--limit", type=int, default=DEFAULT_TOP_N,
        help=f"Number of top MPs to process (default: {DEFAULT_TOP_N}).",
    )
    parser.add_argument(
        "--rebuild", action="store_true",
        help="Force regeneration, ignoring cache.",
    )
    parser.add_argument(
        "--json", action="store_true",
        help="Output raw JSON instead of summary.",
    )
    args = parser.parse_args()

    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")
    init_db(db)

    if args.person_id:
        parliament_avg = _parliament_topic_averages(db)
        result = generate_mp_insights(db, args.person_id, parliament_avg, force=args.rebuild)
        if not result:
            print(f"No insight generated for {args.person_id} (not found or < {MIN_SPEECHES} speeches).")
            db.close()
            sys.exit(1)
        if args.json:
            print(json.dumps(result, indent=2, default=str))
        else:
            _print_insight(result)
    else:
        results = generate_top_mp_insights(db, limit=args.limit, force=args.rebuild)
        if args.json:
            print(json.dumps(results, indent=2, default=str))
        else:
            for r in results:
                _print_insight(r)
                print()

    db.close()


def _print_insight(ins: dict) -> None:
    """Pretty-print a single MP insight profile."""
    print(f"{'=' * 80}")
    print(f"  {ins['full_name']} ({ins['party']})")
    print(f"  {ins.get('electorate', '')} | {ins.get('chamber', '')}")
    print(f"{'=' * 80}")

    cs = ins["career_stats"]
    print(f"\n  Career: {cs['total_speeches']} speeches over {cs['years_active']} years "
          f"({cs['speeches_per_year']}/yr)")
    print(f"  Active: {cs['first_speech']} to {cs['last_speech']}")

    sig = ins.get("signature_topic")
    if sig:
        ratio = f" ({sig['ratio_vs_avg']}x parliament avg)" if sig.get("ratio_vs_avg") else ""
        print(f"\n  Signature topic: {sig['topic_name']} "
              f"({sig['speech_count']} speeches{ratio})")

    dc = ins.get("biggest_disconnect")
    if dc:
        print(f"\n  Biggest disconnect: {dc['topic_name']} "
              f"(score {dc['disconnect_score']:.3f}, "
              f"alignment {dc['vote_alignment']:.1%})")

    donor = ins.get("donor_exposure", {})
    if donor.get("top_industries"):
        print(f"\n  Donor exposure ({donor['party']}):")
        for ind in donor["top_industries"][:3]:
            fav = f", favorable vote {ind['favorable_vote_pct']:.0%}" if ind.get("favorable_vote_pct") is not None else ""
            print(f"    - {ind['industry']}: ${ind['total_donated_to_party']:,.0f}{fav}")

    quote = ins.get("notable_quote")
    if quote:
        excerpt = quote["excerpt"][:120].replace("\n", " ")
        print(f"\n  Notable quote ({quote['date']}, {quote['topic']}):")
        print(f"    \"{excerpt}...\"")

    vr = ins.get("voting_record", {})
    if vr.get("attendance_rate") is not None:
        print(f"\n  Voting: attendance {vr['attendance_rate']:.1%}, "
              f"rebellions {vr['rebellions']}, "
              f"loyalty {vr['party_loyalty_pct']:.1%}" if vr.get("party_loyalty_pct") is not None
              else f"\n  Voting: attendance {vr['attendance_rate']:.1%}, "
              f"rebellions {vr['rebellions']}")

    peers = ins.get("peer_comparison", {})
    if peers:
        print(f"\n  Peer comparison (vs party avg):")
        for key, label in [("speech_volume", "Speeches"), ("disconnect", "Disconnect"), ("attendance", "Attendance")]:
            p = peers.get(key)
            if p:
                direction = "above" if p["above_avg"] else "below"
                print(f"    - {label}: {p['mp_value']} vs {p['party_avg']} ({direction} avg)")


if __name__ == "__main__":
    main()
