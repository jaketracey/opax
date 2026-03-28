"""
parli.analysis.pork_barrel -- Pork-barreling detection engine for OPAX.

Combines electoral margins with government grant spending to detect
suspicious patterns: marginal seats getting disproportionate funding,
grant recipients who also donate, pre-election spending spikes.

Key metrics:
  - Pork barrel ratio: grants_per_capita in marginal seats / grants_per_capita in safe seats
  - Outlier electorates: those getting disproportionate grants relative to peers
  - Donor-grant overlap: grant recipients who also donated to the governing party
  - Pre-election spike: grants in the 2 years before an election vs other periods

Results are stored in analysis_cache as 'stories_pork_barreling'.

Usage:
    python -m parli.analysis.pork_barrel
    python -m parli.analysis.pork_barrel --year 2022
"""

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime

from parli.schema import get_db, init_db


def _get_db():
    db = get_db()
    db.execute("PRAGMA busy_timeout = 600000")
    init_db(db)
    return db


def _cache(db, key: str, value):
    """Store result in analysis_cache with retry on lock."""
    import time
    for attempt in range(5):
        try:
            db.execute(
                "INSERT OR REPLACE INTO analysis_cache(key, value, updated_at) VALUES (?, ?, ?)",
                (key, json.dumps(value, default=str), datetime.now().isoformat()),
            )
            db.commit()
            return
        except Exception as e:
            if "locked" in str(e).lower() and attempt < 4:
                time.sleep(2 * (attempt + 1))
            else:
                raise


# ---------------------------------------------------------------------------
# Core analysis functions
# ---------------------------------------------------------------------------

def grants_by_electorate(db, start_date: str = None, end_date: str = None,
                         grant_types: list[str] = None) -> dict:
    """Sum grant spending by electorate within a date window.

    Returns {electorate_name: {total: float, count: int, grants: [...]}}
    """
    conditions = ["electorate IS NOT NULL AND electorate != ''"]
    params = []

    if start_date:
        conditions.append("start_date >= ?")
        params.append(start_date)
    if end_date:
        conditions.append("start_date <= ?")
        params.append(end_date)
    if grant_types:
        placeholders = ",".join("?" * len(grant_types))
        conditions.append(f"grant_type IN ({placeholders})")
        params.extend(grant_types)

    where = " AND ".join(conditions)

    rows = db.execute(f"""
        SELECT electorate, SUM(amount) as total, COUNT(*) as cnt,
               AVG(amount) as avg_amount, MAX(amount) as max_grant
        FROM government_grants
        WHERE {where} AND amount > 0
        GROUP BY electorate
        ORDER BY total DESC
    """, params).fetchall()

    result = {}
    for r in rows:
        result[r["electorate"]] = {
            "total": r["total"],
            "count": r["cnt"],
            "avg_amount": r["avg_amount"],
            "max_grant": r["max_grant"],
        }
    return result


def compute_pork_barrel_scores(db, election_year: int = 2022,
                                pre_election_years: int = 2) -> dict:
    """Main pork-barreling analysis.

    For each electorate:
    1. Sum government grants in the N years before the election
    2. Compare marginal vs safe seat spending
    3. Calculate pork barrel score
    4. Find outliers

    Returns a comprehensive analysis dict.
    """
    print(f"\n=== PORK-BARREL ANALYSIS: {election_year} election ===\n")

    # 1. Get electorate data for this election
    electorates = db.execute("""
        SELECT electorate_name, state, margin_pct, winning_party,
               winning_candidate, swing, seat_type
        FROM electorates
        WHERE year = ?
    """, (election_year,)).fetchall()

    if not electorates:
        print(f"  No electorate data for {election_year}. Run aec_results ingest first.")
        return {}

    electorate_map = {r["electorate_name"]: dict(r) for r in electorates}
    print(f"  Loaded {len(electorate_map)} electorates for {election_year}")

    # Date window: N years before the election
    # Australian federal elections are typically in May
    end_date = f"{election_year}-05-31"
    start_date = f"{election_year - pre_election_years}-01-01"
    print(f"  Grant window: {start_date} to {end_date}")

    # 2. Sum grants by electorate in the pre-election window
    grant_totals = grants_by_electorate(db, start_date=start_date, end_date=end_date)
    print(f"  Found grants in {len(grant_totals)} electorates")

    # 3. Categorise by seat type
    by_seat_type = defaultdict(lambda: {"total": 0.0, "count": 0, "electorates": []})

    electorate_scores = []
    for e_name, e_data in electorate_map.items():
        grants = grant_totals.get(e_name, {"total": 0, "count": 0, "avg_amount": 0, "max_grant": 0})
        seat_type = e_data["seat_type"]

        entry = {
            "electorate": e_name,
            "state": e_data["state"],
            "margin_pct": e_data["margin_pct"],
            "winning_party": e_data["winning_party"],
            "winning_candidate": e_data["winning_candidate"],
            "swing": e_data["swing"],
            "seat_type": seat_type,
            "grant_total": grants["total"],
            "grant_count": grants["count"],
            "avg_grant": grants["avg_amount"],
            "max_grant": grants["max_grant"],
        }
        electorate_scores.append(entry)

        by_seat_type[seat_type]["total"] += grants["total"]
        by_seat_type[seat_type]["count"] += 1
        by_seat_type[seat_type]["electorates"].append(e_name)

    # 4. Calculate per-seat-type averages
    seat_type_stats = {}
    for st, data in by_seat_type.items():
        avg = data["total"] / data["count"] if data["count"] > 0 else 0
        seat_type_stats[st] = {
            "total_grants": data["total"],
            "num_electorates": data["count"],
            "avg_per_electorate": avg,
        }

    # 5. Pork barrel ratio: marginal avg / safe avg
    marginal_avg = seat_type_stats.get("marginal", {}).get("avg_per_electorate", 0)
    safe_avg = seat_type_stats.get("safe", {}).get("avg_per_electorate", 0)
    fairly_safe_avg = seat_type_stats.get("fairly_safe", {}).get("avg_per_electorate", 0)
    pork_barrel_ratio = marginal_avg / safe_avg if safe_avg > 0 else 0

    print(f"\n  Seat type averages:")
    for st in ["marginal", "fairly_safe", "safe"]:
        stats = seat_type_stats.get(st, {})
        print(f"    {st}: ${stats.get('avg_per_electorate', 0):,.0f} avg "
              f"({stats.get('num_electorates', 0)} seats, "
              f"${stats.get('total_grants', 0):,.0f} total)")

    print(f"\n  PORK BARREL RATIO: {pork_barrel_ratio:.2f}x")
    print(f"    (marginal seats get {pork_barrel_ratio:.1f}x the grants of safe seats)")

    # 6. Find outlier electorates (highest grant totals in marginal seats)
    electorate_scores.sort(key=lambda e: e["grant_total"], reverse=True)

    # Overall average for z-score-like outlier detection
    all_totals = [e["grant_total"] for e in electorate_scores if e["grant_total"] > 0]
    if all_totals:
        overall_avg = sum(all_totals) / len(all_totals)
        # Simple outlier: those with >2x the average
        outliers = [
            e for e in electorate_scores
            if e["grant_total"] > overall_avg * 2 and e["seat_type"] in ("marginal", "fairly_safe")
        ]
    else:
        overall_avg = 0
        outliers = []

    print(f"\n  OUTLIER ELECTORATES (>2x avg, marginal/fairly safe):")
    for o in outliers[:15]:
        print(f"    {o['electorate']} ({o['winning_party']}, {o['seat_type']}, "
              f"margin {o['margin_pct']:.1f}%): ${o['grant_total']:,.0f} "
              f"({o['grant_count']} grants)")

    # 7. By party analysis
    party_stats = defaultdict(lambda: {
        "marginal_total": 0, "marginal_count": 0,
        "safe_total": 0, "safe_count": 0,
        "all_total": 0, "all_count": 0,
    })
    for e in electorate_scores:
        party = e["winning_party"]
        party_stats[party]["all_total"] += e["grant_total"]
        party_stats[party]["all_count"] += 1
        if e["seat_type"] == "marginal":
            party_stats[party]["marginal_total"] += e["grant_total"]
            party_stats[party]["marginal_count"] += 1
        elif e["seat_type"] == "safe":
            party_stats[party]["safe_total"] += e["grant_total"]
            party_stats[party]["safe_count"] += 1

    party_ratios = {}
    for party, stats in party_stats.items():
        m_avg = stats["marginal_total"] / stats["marginal_count"] if stats["marginal_count"] > 0 else 0
        s_avg = stats["safe_total"] / stats["safe_count"] if stats["safe_count"] > 0 else 0
        ratio = m_avg / s_avg if s_avg > 0 else 0
        party_ratios[party] = {
            "marginal_avg": m_avg,
            "safe_avg": s_avg,
            "pork_barrel_ratio": round(ratio, 2),
            "marginal_seats": stats["marginal_count"],
            "safe_seats": stats["safe_count"],
            "total_grants": stats["all_total"],
        }

    print(f"\n  PARTY PORK-BARREL RATIOS:")
    for party, pr in sorted(party_ratios.items(), key=lambda x: x[1]["pork_barrel_ratio"], reverse=True):
        if pr["marginal_seats"] > 0 or pr["safe_seats"] > 0:
            print(f"    {party}: {pr['pork_barrel_ratio']:.2f}x "
                  f"(marginal ${pr['marginal_avg']:,.0f}, safe ${pr['safe_avg']:,.0f}, "
                  f"{pr['marginal_seats']} marginal / {pr['safe_seats']} safe seats)")

    return {
        "election_year": election_year,
        "window": {"start": start_date, "end": end_date},
        "pork_barrel_ratio": round(pork_barrel_ratio, 3),
        "seat_type_stats": seat_type_stats,
        "party_ratios": party_ratios,
        "outlier_electorates": outliers[:20],
        "top_electorates": electorate_scores[:30],
        "all_electorates": electorate_scores,
        "overall_avg_grants": round(overall_avg, 2),
    }


def find_donor_grant_overlap(db, election_year: int = 2022) -> list[dict]:
    """Find grant recipients who also donated to political parties.

    Cross-references government_grants recipients with the donations table
    using fuzzy name matching.

    Returns list of suspicious overlaps.
    """
    print(f"\n=== DONOR-GRANT OVERLAP ANALYSIS ===\n")

    # Get all grant recipients with significant amounts
    grant_recipients = db.execute("""
        SELECT recipient, recipient_abn, SUM(amount) as total_grants,
               COUNT(*) as grant_count, GROUP_CONCAT(DISTINCT program) as programs,
               GROUP_CONCAT(DISTINCT electorate) as electorates
        FROM government_grants
        WHERE amount > 10000 AND recipient IS NOT NULL
        GROUP BY COALESCE(recipient_abn, recipient)
        HAVING total_grants > 50000
        ORDER BY total_grants DESC
        LIMIT 500
    """).fetchall()

    print(f"  Checking {len(grant_recipients)} significant grant recipients against donors...")

    # Pre-build a set of donor name tokens for faster matching
    all_donors = db.execute("""
        SELECT donor_name, recipient AS party, SUM(amount) as total_donated,
               COUNT(*) as donation_count,
               GROUP_CONCAT(DISTINCT financial_year) as years
        FROM donations
        WHERE amount > 1000
        GROUP BY donor_name, recipient
        ORDER BY total_donated DESC
        LIMIT 2000
    """).fetchall()

    # Build index of cleaned donor names
    donor_index = {}
    for d in all_donors:
        clean = d["donor_name"].upper()
        for suffix in [" PTY LTD", " PTY. LTD.", " LIMITED", " LTD", " INC",
                       " INCORPORATED", " CORPORATION", " CORP", " CO"]:
            clean = clean.replace(suffix, "")
        clean = clean.strip()
        if len(clean) >= 4:
            if clean not in donor_index:
                donor_index[clean] = []
            donor_index[clean].append(dict(d))

    overlaps = []
    for gr in grant_recipients:
        recipient_name = gr["recipient"] or ""

        clean_name = recipient_name.upper()
        for suffix in [" PTY LTD", " PTY. LTD.", " LIMITED", " LTD", " INC",
                       " INCORPORATED", " CORPORATION", " CORP", " CO"]:
            clean_name = clean_name.replace(suffix, "")
        clean_name = clean_name.strip()

        if len(clean_name) < 4:
            continue

        # Check exact match in donor index
        matched_donors = donor_index.get(clean_name, [])

        # Also check substring matches (grant recipient name in donor name or vice versa)
        if not matched_donors:
            for dk, dv in donor_index.items():
                if clean_name in dk or dk in clean_name:
                    matched_donors.extend(dv)
                    if len(matched_donors) >= 5:
                        break

        donations = matched_donors[:5]

        if donations:
            for d in donations:
                overlaps.append({
                    "grant_recipient": recipient_name,
                    "grant_total": gr["total_grants"],
                    "grant_count": gr["grant_count"],
                    "grant_programs": gr["programs"],
                    "grant_electorates": gr["electorates"],
                    "donor_name": d.get("donor_name", ""),
                    "donation_recipient_party": d.get("party", ""),
                    "total_donated": d.get("total_donated", 0),
                    "donation_count": d.get("donation_count", 0),
                    "donation_years": d.get("years", ""),
                    "combined_flow": gr["total_grants"] + (d.get("total_donated", 0) or 0),
                })

    overlaps.sort(key=lambda x: x["combined_flow"], reverse=True)

    print(f"  Found {len(overlaps)} donor-grant overlaps")
    for o in overlaps[:10]:
        print(f"    {o['grant_recipient']}: "
              f"${o['grant_total']:,.0f} in grants, "
              f"${o['total_donated']:,.0f} donated to {o['donation_recipient_party']}")

    return overlaps


def pre_election_spike_analysis(db, election_year: int = 2022) -> dict:
    """Compare grant spending in the 2 years before an election vs other years.

    Detects pre-election spending spikes that might indicate pork-barreling.
    """
    print(f"\n=== PRE-ELECTION SPENDING SPIKE ANALYSIS ===\n")

    # Pre-election window: 2 years before
    pre_start = f"{election_year - 2}-01-01"
    pre_end = f"{election_year}-05-31"

    # Comparison window: 2 years before that
    comp_start = f"{election_year - 4}-01-01"
    comp_end = f"{election_year - 2}-01-01"

    pre_election = db.execute("""
        SELECT SUM(amount) as total, COUNT(*) as cnt,
               AVG(amount) as avg_amount
        FROM government_grants
        WHERE start_date >= ? AND start_date <= ?
          AND amount > 0
    """, (pre_start, pre_end)).fetchone()

    comparison = db.execute("""
        SELECT SUM(amount) as total, COUNT(*) as cnt,
               AVG(amount) as avg_amount
        FROM government_grants
        WHERE start_date >= ? AND start_date <= ?
          AND amount > 0
    """, (comp_start, comp_end)).fetchone()

    pre_total = pre_election["total"] or 0
    comp_total = comparison["total"] or 0
    spike_ratio = pre_total / comp_total if comp_total > 0 else 0

    # By program: which programs spiked most before the election?
    program_spikes = db.execute("""
        WITH pre AS (
            SELECT program, SUM(amount) as pre_total, COUNT(*) as pre_count
            FROM government_grants
            WHERE start_date >= ? AND start_date <= ? AND amount > 0
            GROUP BY program
        ),
        comp AS (
            SELECT program, SUM(amount) as comp_total, COUNT(*) as comp_count
            FROM government_grants
            WHERE start_date >= ? AND start_date <= ? AND amount > 0
            GROUP BY program
        )
        SELECT p.program, p.pre_total, COALESCE(c.comp_total, 0) as comp_total,
               p.pre_count, COALESCE(c.comp_count, 0) as comp_count,
               CASE WHEN COALESCE(c.comp_total, 0) > 0
                    THEN p.pre_total * 1.0 / c.comp_total
                    ELSE 999 END as spike_ratio
        FROM pre p
        LEFT JOIN comp c ON p.program = c.program
        WHERE p.pre_total > 100000
        ORDER BY spike_ratio DESC
        LIMIT 20
    """, (pre_start, pre_end, comp_start, comp_end)).fetchall()

    print(f"  Pre-election ({pre_start} to {pre_end}): ${pre_total:,.0f} across {pre_election['cnt'] or 0} grants")
    print(f"  Comparison ({comp_start} to {comp_end}): ${comp_total:,.0f} across {comparison['cnt'] or 0} grants")
    print(f"  SPIKE RATIO: {spike_ratio:.2f}x")

    print(f"\n  TOP PROGRAM SPIKES:")
    for ps in [dict(r) for r in program_spikes][:10]:
        print(f"    {ps['program']}: {ps['spike_ratio']:.1f}x "
              f"(${ps['pre_total']:,.0f} vs ${ps['comp_total']:,.0f})")

    return {
        "election_year": election_year,
        "pre_election_window": {"start": pre_start, "end": pre_end},
        "comparison_window": {"start": comp_start, "end": comp_end},
        "pre_election_total": pre_total,
        "comparison_total": comp_total,
        "spike_ratio": round(spike_ratio, 3),
        "pre_election_count": pre_election["cnt"] or 0,
        "comparison_count": comparison["cnt"] or 0,
        "program_spikes": [dict(r) for r in program_spikes],
    }


def run_full_analysis(db, election_year: int = 2022) -> dict:
    """Run the complete pork-barreling analysis and cache results."""

    # 1. Core pork-barrel scores
    scores = compute_pork_barrel_scores(db, election_year=election_year)

    # 2. Donor-grant overlap
    overlaps = find_donor_grant_overlap(db, election_year=election_year)

    # 3. Pre-election spike
    spike = pre_election_spike_analysis(db, election_year=election_year)

    # 4. Assemble final result
    result = {
        "generated_at": datetime.now().isoformat(),
        "election_year": election_year,
        "pork_barrel_ratio": scores.get("pork_barrel_ratio", 0),
        "seat_type_stats": scores.get("seat_type_stats", {}),
        "party_ratios": scores.get("party_ratios", {}),
        "outlier_electorates": scores.get("outlier_electorates", []),
        "top_electorates": scores.get("top_electorates", []),
        "overall_avg_grants": scores.get("overall_avg_grants", 0),
        "donor_grant_overlaps": overlaps[:50],
        "pre_election_spike": spike,
        "summary": _generate_summary(scores, overlaps, spike),
    }

    # Cache
    _cache(db, "stories_pork_barreling", result)
    print(f"\n  Cached results as 'stories_pork_barreling'")

    return result


def _generate_summary(scores: dict, overlaps: list, spike: dict) -> str:
    """Generate a human-readable summary of findings."""
    parts = []

    ratio = scores.get("pork_barrel_ratio", 0)
    if ratio > 1.5:
        parts.append(
            f"Marginal seats received {ratio:.1f}x more grant funding per electorate "
            f"than safe seats in the 2 years before the {scores.get('election_year', '?')} election."
        )
    elif ratio > 1.0:
        parts.append(
            f"Marginal seats received {ratio:.1f}x more grant funding per electorate "
            f"than safe seats -- a modest disparity."
        )
    else:
        parts.append("No significant disparity found between marginal and safe seat grant funding.")

    outliers = scores.get("outlier_electorates", [])
    if outliers:
        top_3 = outliers[:3]
        names = ", ".join(f"{o['electorate']} ({o['winning_party']})" for o in top_3)
        parts.append(f"Biggest outliers: {names}.")

    if overlaps:
        parts.append(
            f"Found {len(overlaps)} cases where grant recipients also donated to political parties."
        )
        top_overlap = overlaps[0]
        parts.append(
            f"Largest overlap: {top_overlap['grant_recipient']} received "
            f"${top_overlap['grant_total']:,.0f} in grants and donated "
            f"${top_overlap['total_donated']:,.0f} to {top_overlap['donation_recipient_party']}."
        )

    spike_ratio = spike.get("spike_ratio", 0)
    if spike_ratio > 1.3:
        parts.append(
            f"Pre-election spending was {spike_ratio:.1f}x higher than the comparison period."
        )

    return " ".join(parts)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Pork-barreling detection analysis")
    parser.add_argument("--year", type=int, default=2022,
                        help="Election year to analyze (default: 2022)")
    args = parser.parse_args()

    db = _get_db()
    result = run_full_analysis(db, election_year=args.year)

    print(f"\n{'='*60}")
    print(f"SUMMARY: {result.get('summary', 'No summary')}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
