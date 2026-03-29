"""
parli.analysis.donor_influence — Donor-Vote Correlation Analysis

Answers: "Do parties vote more favorably for industries that donate to them?"

For each party and each donor industry:
  1. Sum total donations from that industry to the party
  2. Find divisions related to that industry (keyword matching on name/summary)
  3. Calculate the party's voting alignment on those divisions
  4. Compute an influence_score correlating donation size with favorable voting

Also computes per-MP breakdowns: does an individual MP vote more favorably on
issues where their party receives big donations from that industry?

Results are stored in the `donor_influence_scores` table and cached for the API.

Usage:
    python -m parli.analysis.donor_influence
    python -m parli.analysis.donor_influence --party "Australian Labor Party"
    python -m parli.analysis.donor_influence --industry gambling
"""

import json
import math
import re
from collections import defaultdict
from datetime import datetime

from parli.db import is_postgres
from parli.schema import get_db, init_db


# ── Industry-to-division keyword map ─────────────────────────────────────
# Maps each industry (as stored in donations.industry) to keywords that
# appear in division names or summaries for related legislation.

INDUSTRY_DIVISION_KEYWORDS: dict[str, list[str]] = {
    "gambling": [
        "gambling", "gaming", "wagering", "poker machine", "pokies",
        "betting", "casino", "lottery", "lotteries", "interactive gambling",
    ],
    "mining": [
        "mining", "mineral", "minerals", "coal", "iron ore", "quarry",
        "mining tax", "mineral resource rent",
    ],
    "fossil_fuels": [
        "petroleum", "oil", "gas", "fossil fuel", "carbon tax", "carbon",
        "emissions", "clean energy", "energy", "fuel excise",
    ],
    "property": [
        "housing", "property", "real estate", "affordable housing",
        "first home", "negative gearing", "capital gains",
        "homelessness", "rent", "tenant",
    ],
    "finance": [
        "banking", "bank", "financial", "superannuation", "insurance",
        "credit", "franking", "hayne", "royal commission into misconduct",
    ],
    "health": [
        "health", "hospital", "medicare", "pharmaceutical", "medicine",
        "therapeutic goods", "aged care", "disability", "ndis",
    ],
    "education": [
        "education", "school", "university", "universities", "student",
        "tafe", "vocational", "childcare", "preschool",
    ],
    "agriculture": [
        "agriculture", "farm", "farming", "livestock", "dairy",
        "wheat", "grain", "fisheries", "drought", "water",
    ],
    "media": [
        "media", "broadcasting", "television", "press", "news",
        "digital platforms", "abc", "sbs",
    ],
    "telecom": [
        "telecom", "nbn", "broadband", "spectrum", "communications",
    ],
    "transport": [
        "transport", "road", "rail", "aviation", "shipping", "freight",
        "airport", "infrastructure",
    ],
    "defence": [
        "defence", "defense", "military", "army", "navy", "aukus",
        "veterans", "national security",
    ],
    "alcohol": [
        "alcohol", "liquor", "spirits", "wine", "beer", "alcopops",
    ],
    "tobacco": [
        "tobacco", "cigarette", "smoking", "vaping", "e-cigarette",
    ],
    "unions": [
        "workplace relations", "fair work", "industrial relations",
        "union", "worker", "enterprise bargaining", "penalty rates",
    ],
    "tech": [
        "digital", "technology", "cyber", "artificial intelligence",
        "data", "privacy", "surveillance",
    ],
    "lobbying": [
        "lobbying", "lobbyist", "integrity", "transparency",
    ],
    "legal": [
        "legal", "court", "judiciary", "attorney",
    ],
    "hospitality": [
        "hospitality", "tourism", "hotel",
    ],
}

# Party name normalization: map recipient strings and member party strings
# to a canonical short name for joining donations to votes.
PARTY_ALIASES: dict[str, list[str]] = {
    "ALP": [
        "labor", "alp", "australian labor",
    ],
    "LIB": [
        "liberal party", "liberal",
    ],
    "NAT": [
        "national party", "nationals", "national",
    ],
    "LNP": [
        "liberal national", "lnp",
    ],
    "GRN": [
        "greens", "australian greens", "green",
    ],
    "IND": [
        "independent",
    ],
    "PHON": [
        "one nation", "pauline hanson",
    ],
    "UAP": [
        "united australia", "palmer",
    ],
    "CLP": [
        "country liberal",
    ],
    "CA": [
        "centre alliance",
    ],
    "JLN": [
        "jacqui lambie",
    ],
    "KAP": [
        "katter",
    ],
}


def normalize_party(name: str | None) -> str | None:
    """Normalize a party name or donation recipient to a canonical short form."""
    if not name:
        return None
    lower = name.lower().strip()
    for canonical, aliases in PARTY_ALIASES.items():
        for alias in aliases:
            if alias in lower:
                return canonical
    return None


def _build_division_keyword_pattern(keywords: list[str]) -> re.Pattern:
    """Build a compiled regex pattern from a list of keywords."""
    escaped = [re.escape(kw) for kw in keywords]
    return re.compile(r"\b(?:" + "|".join(escaped) + r")", re.IGNORECASE)


# ── Core analysis functions ───────────────────────────────────────────────

def get_donations_by_party_industry(db) -> dict[tuple[str, str], float]:
    """Sum donations grouped by (normalized_party, industry).

    Returns dict mapping (party, industry) -> total_amount.
    """
    rows = db.execute("""
        SELECT recipient, industry, SUM(amount) as total
        FROM donations
        WHERE industry IS NOT NULL AND industry != ''
          AND amount IS NOT NULL AND amount > 0
        GROUP BY recipient, industry
    """).fetchall()

    result: dict[tuple[str, str], float] = defaultdict(float)
    for row in rows:
        party = normalize_party(row["recipient"])
        if party:
            result[(party, row["industry"])] += row["total"]

    return dict(result)


def find_industry_divisions(db, industry: str) -> list[dict]:
    """Find divisions related to an industry via keyword matching.

    Searches both division name and summary fields.
    Returns list of division dicts with id, name, date, aye_votes, no_votes.
    """
    keywords = INDUSTRY_DIVISION_KEYWORDS.get(industry, [])
    if not keywords:
        return []

    # Build WHERE clause with LIKE conditions
    conditions = []
    params = []
    for kw in keywords:
        like = f"%{kw}%"
        conditions.append("(LOWER(d.name) LIKE ? OR LOWER(d.summary) LIKE ?)")
        params.extend([like, like])

    where = " OR ".join(conditions)
    rows = db.execute(f"""
        SELECT d.division_id, d.name, d.date, d.aye_votes, d.no_votes,
               d.possible_turnout, d.rebellions, d.summary, d.house
        FROM divisions d
        WHERE {where}
        ORDER BY d.date DESC
    """, params).fetchall()

    return [dict(r) for r in rows]


def compute_party_voting_on_divisions(
    db, party: str, division_ids: list[int]
) -> dict:
    """Compute how a party's members voted on a set of divisions.

    Returns dict with:
      - total_votes: total individual votes cast
      - aye_count, no_count, other_count
      - aye_pct: percentage of aye votes (our proxy for "favorable")
      - divisions_with_votes: how many of the divisions had any party member votes
    """
    if not division_ids:
        return {
            "total_votes": 0,
            "aye_count": 0,
            "no_count": 0,
            "other_count": 0,
            "aye_pct": 0.0,
            "divisions_with_votes": 0,
        }

    placeholders = ",".join("?" * len(division_ids))

    # Get all canonical party aliases to match member.party
    aliases = PARTY_ALIASES.get(party, [])
    if not aliases:
        return {
            "total_votes": 0, "aye_count": 0, "no_count": 0,
            "other_count": 0, "aye_pct": 0.0, "divisions_with_votes": 0,
        }

    party_conditions = []
    party_params = []
    for alias in aliases:
        party_conditions.append("LOWER(m.party) LIKE ?")
        party_params.append(f"%{alias}%")

    party_where = " OR ".join(party_conditions)

    rows = db.execute(f"""
        SELECT v.division_id, v.vote, COUNT(*) as cnt
        FROM votes v
        JOIN members m ON m.person_id = v.person_id
        WHERE v.division_id IN ({placeholders})
          AND ({party_where})
        GROUP BY v.division_id, v.vote
    """, division_ids + party_params).fetchall()

    aye = 0
    no = 0
    other = 0
    divisions_seen = set()

    for row in rows:
        divisions_seen.add(row["division_id"])
        if row["vote"] == "aye":
            aye += row["cnt"]
        elif row["vote"] == "no":
            no += row["cnt"]
        else:
            other += row["cnt"]

    total = aye + no + other
    aye_pct = (aye / total * 100) if total > 0 else 0.0

    return {
        "total_votes": total,
        "aye_count": aye,
        "no_count": no,
        "other_count": other,
        "aye_pct": round(aye_pct, 2),
        "divisions_with_votes": len(divisions_seen),
    }


def compute_influence_score(
    total_donated: float,
    favorable_vote_pct: float,
    divisions_with_votes: int,
) -> float:
    """Compute a heuristic influence score.

    Formula: log10(total_donated + 1) * (favorable_vote_pct / 100) * confidence_weight

    The confidence_weight penalizes scores based on few divisions:
      - < 3 divisions: weight = 0.3
      - 3-9 divisions: weight = 0.6
      - 10+: weight = 1.0

    Returns a score from 0 to ~8 (higher = stronger apparent correlation).
    """
    if total_donated <= 0 or divisions_with_votes == 0:
        return 0.0

    if divisions_with_votes < 3:
        confidence = 0.3
    elif divisions_with_votes < 10:
        confidence = 0.6
    else:
        confidence = 1.0

    score = math.log10(total_donated + 1) * (favorable_vote_pct / 100) * confidence
    return round(score, 3)


def run_party_analysis(db) -> list[dict]:
    """Run the full party-level donor-influence analysis.

    For each (party, industry) pair with donations, finds related divisions
    and computes voting alignment. Returns list of result dicts.
    """
    print("[donor_influence] Computing donations by party and industry...")
    donations = get_donations_by_party_industry(db)

    # Deduplicate: collect all unique industries
    industries = sorted(set(ind for _, ind in donations.keys()))
    print(f"[donor_influence] Found {len(industries)} industries across {len(donations)} party-industry pairs")

    # Pre-compute divisions for each industry
    print("[donor_influence] Finding related divisions per industry...")
    industry_divisions: dict[str, list[dict]] = {}
    for industry in industries:
        divs = find_industry_divisions(db, industry)
        if divs:
            industry_divisions[industry] = divs
            print(f"  {industry}: {len(divs)} related divisions")
        else:
            industry_divisions[industry] = []

    # Compute party voting for each (party, industry) pair
    print("[donor_influence] Computing party voting alignment...")
    results = []

    for (party, industry), total_donated in sorted(donations.items(), key=lambda x: -x[1]):
        divs = industry_divisions.get(industry, [])
        division_ids = [d["division_id"] for d in divs]

        voting = compute_party_voting_on_divisions(db, party, division_ids)

        score = compute_influence_score(
            total_donated,
            voting["aye_pct"],
            voting["divisions_with_votes"],
        )

        results.append({
            "party": party,
            "industry": industry,
            "total_donated": round(total_donated, 2),
            "relevant_divisions": len(division_ids),
            "divisions_with_votes": voting["divisions_with_votes"],
            "total_votes_cast": voting["total_votes"],
            "aye_count": voting["aye_count"],
            "no_count": voting["no_count"],
            "favorable_vote_pct": voting["aye_pct"],
            "influence_score": score,
        })

    return results


def run_mp_analysis(db, party_filter: str | None = None) -> list[dict]:
    """Run per-MP donor-influence analysis.

    For each MP, looks at industries donating to their party, finds related
    divisions, and checks whether this MP voted aye on those divisions.

    This allows comparison: do MPs whose parties receive big gambling donations
    vote more favorably on gambling-related legislation than their peers?
    """
    print("[donor_influence] Running per-MP analysis...")

    # Get party-industry donation totals
    donations = get_donations_by_party_industry(db)

    # Pre-compute industry divisions
    industries = sorted(set(ind for _, ind in donations.keys()))
    industry_divisions: dict[str, list[int]] = {}
    for industry in industries:
        divs = find_industry_divisions(db, industry)
        industry_divisions[industry] = [d["division_id"] for d in divs]

    # Get all MPs with their party
    conditions = []
    params = []
    if party_filter:
        conditions.append("LOWER(m.party) LIKE ?")
        params.append(f"%{party_filter.lower()}%")

    where = " AND ".join(conditions) if conditions else "1=1"
    members = db.execute(f"""
        SELECT m.person_id, m.full_name, m.party
        FROM members m
        WHERE {where} AND m.party IS NOT NULL AND m.party != ''
    """, params).fetchall()

    print(f"[donor_influence] Analyzing {len(members)} MPs...")

    # Pre-fetch all votes into memory for speed
    print("[donor_influence] Loading vote data...")
    all_votes: dict[tuple[str, int], str] = {}
    vote_rows = db.execute("""
        SELECT person_id, division_id, vote FROM votes
    """).fetchall()
    for vr in vote_rows:
        all_votes[(vr["person_id"], vr["division_id"])] = vr["vote"]
    print(f"[donor_influence] Loaded {len(all_votes)} individual votes")

    results = []
    for member in members:
        person_id = member["person_id"]
        mp_party = normalize_party(member["party"])
        if not mp_party:
            continue

        # For each industry that donates to this MP's party
        for industry in industries:
            donated = donations.get((mp_party, industry), 0)
            if donated <= 0:
                continue

            div_ids = industry_divisions.get(industry, [])
            if not div_ids:
                continue

            # Count this MP's votes on these divisions
            aye = 0
            no = 0
            other = 0
            for div_id in div_ids:
                vote = all_votes.get((person_id, div_id))
                if vote == "aye":
                    aye += 1
                elif vote == "no":
                    no += 1
                elif vote is not None:
                    other += 1

            total = aye + no + other
            if total == 0:
                continue  # MP didn't vote on any related divisions

            aye_pct = round(aye / total * 100, 2)
            score = compute_influence_score(donated, aye_pct, total)

            results.append({
                "person_id": person_id,
                "full_name": member["full_name"],
                "party": mp_party,
                "industry": industry,
                "party_donations_from_industry": round(donated, 2),
                "divisions_voted": total,
                "aye_count": aye,
                "no_count": no,
                "favorable_vote_pct": aye_pct,
                "influence_score": score,
            })

    print(f"[donor_influence] Generated {len(results)} MP-industry records")
    return results


# ── Database storage ──────────────────────────────────────────────────────

def create_tables(db) -> None:
    """Create the donor_influence_scores tables if they don't exist."""
    if is_postgres():
        # On PG, tables are managed by migrations; verify they exist
        try:
            db.execute("SELECT 1 FROM donor_influence_scores LIMIT 0")
            db.execute("SELECT 1 FROM mp_donor_influence_scores LIMIT 0")
            return
        except Exception:
            pass
        now_default = "NOW()"
        serial = "SERIAL"
    else:
        now_default = "(datetime('now'))"
        serial = "INTEGER PRIMARY KEY AUTOINCREMENT"

    db.executescript(f"""
        CREATE TABLE IF NOT EXISTS donor_influence_scores (
            id {serial},
            party TEXT NOT NULL,
            industry TEXT NOT NULL,
            total_donated REAL,
            relevant_divisions INTEGER,
            divisions_with_votes INTEGER,
            total_votes_cast INTEGER,
            aye_count INTEGER,
            no_count INTEGER,
            favorable_vote_pct REAL,
            influence_score REAL,
            updated_at TEXT DEFAULT {now_default},
            UNIQUE(party, industry)
        );

        CREATE TABLE IF NOT EXISTS mp_donor_influence_scores (
            id {serial},
            person_id TEXT NOT NULL,
            full_name TEXT,
            party TEXT NOT NULL,
            industry TEXT NOT NULL,
            party_donations_from_industry REAL,
            divisions_voted INTEGER,
            aye_count INTEGER,
            no_count INTEGER,
            favorable_vote_pct REAL,
            influence_score REAL,
            updated_at TEXT DEFAULT {now_default},
            UNIQUE(person_id, industry)
        );
    """)


def store_party_results(db, results: list[dict]) -> int:
    """Store party-level results, replacing any existing data."""
    db.execute("DELETE FROM donor_influence_scores")
    now_sql = "NOW()" if is_postgres() else "datetime('now')"
    count = 0
    for r in results:
        db.execute(f"""
            INSERT INTO donor_influence_scores
            (party, industry, total_donated, relevant_divisions,
             divisions_with_votes, total_votes_cast, aye_count, no_count,
             favorable_vote_pct, influence_score, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, {now_sql})
        """, (
            r["party"], r["industry"], r["total_donated"],
            r["relevant_divisions"], r["divisions_with_votes"],
            r["total_votes_cast"], r["aye_count"], r["no_count"],
            r["favorable_vote_pct"], r["influence_score"],
        ))
        count += 1
    db.commit()
    return count


def store_mp_results(db, results: list[dict]) -> int:
    """Store MP-level results, replacing any existing data."""
    db.execute("DELETE FROM mp_donor_influence_scores")
    now_sql = "NOW()" if is_postgres() else "datetime('now')"
    count = 0
    for r in results:
        db.execute(f"""
            INSERT INTO mp_donor_influence_scores
            (person_id, full_name, party, industry,
             party_donations_from_industry, divisions_voted,
             aye_count, no_count, favorable_vote_pct, influence_score,
             updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, {now_sql})
        """, (
            r["person_id"], r["full_name"], r["party"], r["industry"],
            r["party_donations_from_industry"], r["divisions_voted"],
            r["aye_count"], r["no_count"], r["favorable_vote_pct"],
            r["influence_score"],
        ))
        count += 1
    db.commit()
    return count


# ── CLI entry point ───────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(
        description="Donor-vote correlation analysis for OPAX"
    )
    parser.add_argument(
        "--party", type=str, default=None,
        help="Filter to a specific party (for MP analysis)"
    )
    parser.add_argument(
        "--industry", type=str, default=None,
        help="Filter output to a specific industry"
    )
    parser.add_argument(
        "--skip-mp", action="store_true",
        help="Skip per-MP analysis (faster)"
    )
    parser.add_argument(
        "--top", type=int, default=30,
        help="Show top N results"
    )
    args = parser.parse_args()

    db = get_db()
    if not is_postgres():
        db.execute("PRAGMA busy_timeout = 300000")
    init_db(db)
    create_tables(db)

    # ── Party-level analysis ──────────────────────────────────────────
    print("\n" + "=" * 70)
    print("PARTY-LEVEL DONOR-VOTE CORRELATION ANALYSIS")
    print("=" * 70)

    party_results = run_party_analysis(db)

    if args.industry:
        party_results = [r for r in party_results if r["industry"] == args.industry]

    # Store
    store_party_results(db, party_results)
    print(f"\n[donor_influence] Stored {len(party_results)} party-industry scores")

    # Display top results
    # Sort by influence score descending
    top = sorted(party_results, key=lambda r: -r["influence_score"])[:args.top]
    print(f"\nTop {len(top)} party-industry correlations (by influence score):\n")
    print(f"{'Party':<6} {'Industry':<18} {'Donated':>14} {'Divs':>5} {'Votes':>6} "
          f"{'Aye%':>6} {'Score':>7}")
    print("-" * 70)
    for r in top:
        print(
            f"{r['party']:<6} {r['industry']:<18} "
            f"${r['total_donated']:>12,.0f} {r['divisions_with_votes']:>5} "
            f"{r['total_votes_cast']:>6} {r['favorable_vote_pct']:>5.1f}% "
            f"{r['influence_score']:>7.3f}"
        )

    # Summary: which industries have the strongest apparent influence?
    print(f"\n{'=' * 70}")
    print("INDUSTRY INFLUENCE SUMMARY (averaged across parties)")
    print("=" * 70)

    industry_agg: dict[str, list[dict]] = defaultdict(list)
    for r in party_results:
        if r["divisions_with_votes"] > 0:
            industry_agg[r["industry"]].append(r)

    industry_summary = []
    for industry, records in industry_agg.items():
        avg_score = sum(r["influence_score"] for r in records) / len(records)
        total_donated = sum(r["total_donated"] for r in records)
        avg_aye_pct = sum(r["favorable_vote_pct"] for r in records) / len(records)
        industry_summary.append({
            "industry": industry,
            "avg_influence_score": round(avg_score, 3),
            "total_donated_all_parties": round(total_donated, 2),
            "avg_favorable_vote_pct": round(avg_aye_pct, 2),
            "parties_analyzed": len(records),
        })

    industry_summary.sort(key=lambda x: -x["avg_influence_score"])
    print(f"\n{'Industry':<18} {'Avg Score':>10} {'Total Donated':>16} {'Avg Aye%':>9} {'Parties':>8}")
    print("-" * 65)
    for s in industry_summary:
        print(
            f"{s['industry']:<18} {s['avg_influence_score']:>10.3f} "
            f"${s['total_donated_all_parties']:>14,.0f} "
            f"{s['avg_favorable_vote_pct']:>8.1f}% {s['parties_analyzed']:>8}"
        )

    # ── Per-MP analysis ───────────────────────────────────────────────
    if not args.skip_mp:
        print(f"\n{'=' * 70}")
        print("PER-MP DONOR-VOTE CORRELATION ANALYSIS")
        print("=" * 70)

        mp_results = run_mp_analysis(db, party_filter=args.party)

        if args.industry:
            mp_results = [r for r in mp_results if r["industry"] == args.industry]

        store_mp_results(db, mp_results)
        print(f"\n[donor_influence] Stored {len(mp_results)} MP-industry scores")

        # Show top MPs by influence score
        top_mps = sorted(mp_results, key=lambda r: -r["influence_score"])[:args.top]
        print(f"\nTop {len(top_mps)} MP-industry correlations:\n")
        print(f"{'MP':<30} {'Party':<6} {'Industry':<16} {'Donated':>14} "
              f"{'Divs':>5} {'Aye%':>6} {'Score':>7}")
        print("-" * 90)
        for r in top_mps:
            name = (r["full_name"] or "Unknown")[:28]
            print(
                f"{name:<30} {r['party']:<6} {r['industry']:<16} "
                f"${r['party_donations_from_industry']:>12,.0f} "
                f"{r['divisions_voted']:>5} {r['favorable_vote_pct']:>5.1f}% "
                f"{r['influence_score']:>7.3f}"
            )

    # Cache summary in analysis_cache
    summary = {
        "party_results_count": len(party_results),
        "mp_results_count": len(mp_results) if not args.skip_mp else 0,
        "industries_analyzed": len(industry_summary),
        "top_industry_correlations": industry_summary[:10],
        "updated_at": datetime.now().isoformat(),
    }
    if is_postgres():
        db.execute("""
            INSERT INTO analysis_cache (key, value, updated_at)
            VALUES ('donor_influence_summary', %s, NOW())
            ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        """, (json.dumps(summary, default=str),))
    else:
        db.execute("""
            INSERT OR REPLACE INTO analysis_cache (key, value, updated_at)
            VALUES ('donor_influence_summary', ?, datetime('now'))
        """, (json.dumps(summary, default=str),))
    db.commit()

    print(f"\n[donor_influence] Analysis complete. Summary cached in analysis_cache.")


if __name__ == "__main__":
    main()
