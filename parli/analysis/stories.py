"""
parli.analysis.stories — Cross-cutting narrative discovery engine for OPAX.

Finds the kinds of insights that make journalists take notice:
  1. Flip-floppers: MPs who dramatically shifted topic focus between periods
  2. Donation spikes before votes: industry donation surges before key divisions
  3. Revolving door indicators: MPs who talked up companies that won contracts
  4. Silent beneficiaries: parties taking big donations but rarely speaking on the industry
  5. Most controversial divisions: highest rebellion counts
  6. Cross-party agreement: topics where all parties vote together despite rhetoric

Results are stored in analysis_cache as JSON (key = "stories_{type}").

Usage:
    python -m parli.analysis.stories
    python -m parli.analysis.stories --type flip_floppers
"""

import json
import sys
from collections import Counter, defaultdict
from datetime import datetime

from parli.db import get_db, is_postgres
from parli.schema import init_db


def _gc_distinct(col: str, sep: str = ",") -> str:
    """GROUP_CONCAT(DISTINCT col) -> STRING_AGG(DISTINCT col, sep) on PG."""
    if is_postgres():
        return f"STRING_AGG(DISTINCT {col}, '{sep}')"
    return f"GROUP_CONCAT(DISTINCT {col})"


def _gc(expr: str, sep: str = ",") -> str:
    """GROUP_CONCAT(expr) -> STRING_AGG(expr, sep) on PG."""
    if is_postgres():
        return f"STRING_AGG({expr}, '{sep}')"
    return f"GROUP_CONCAT({expr})"


def _get_db():
    db = get_db()
    if not is_postgres():
        db.execute("PRAGMA busy_timeout = 300000")
    init_db(db)
    return db


def _cache(db, key: str, value):
    """Store result in analysis_cache with retry on lock."""
    import time
    for attempt in range(5):
        try:
            if is_postgres():
                db.execute(
                    """INSERT INTO analysis_cache(key, value, updated_at) VALUES (%s, %s, NOW())
                       ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()""",
                    (key, json.dumps(value, default=str)),
                )
            else:
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


# ── 1. Flip-floppers ────────────────────────────────────────────────────────

def find_flip_floppers(db) -> list[dict]:
    """
    Find MPs who dramatically changed topic focus between parliamentary terms.
    Compare speech topic distributions in two periods:
      - Period A: before 2019
      - Period B: 2019 onwards
    Look for topics that an MP spoke about heavily in one period but abandoned.
    """
    print("\n=== FLIP-FLOPPERS: MPs who shifted topic focus ===\n")

    rows = db.execute("""
        WITH period_counts AS (
            SELECT
                m.person_id,
                m.full_name,
                m.party,
                t.name AS topic_name,
                SUM(CASE WHEN s.date < '2019-01-01' THEN 1 ELSE 0 END) AS pre_count,
                SUM(CASE WHEN s.date >= '2019-01-01' THEN 1 ELSE 0 END) AS post_count
            FROM speech_topics st
            JOIN speeches s ON s.speech_id = st.speech_id
            JOIN topics t ON t.topic_id = st.topic_id
            JOIN members m ON m.person_id = s.person_id
            WHERE s.person_id IS NOT NULL
              AND m.full_name IS NOT NULL
            GROUP BY m.person_id, m.full_name, m.party, t.name
            HAVING (SUM(CASE WHEN s.date < '2019-01-01' THEN 1 ELSE 0 END) >= 20
                 OR SUM(CASE WHEN s.date >= '2019-01-01' THEN 1 ELSE 0 END) >= 20)
        ),
        mp_totals AS (
            SELECT
                person_id,
                SUM(pre_count) AS total_pre,
                SUM(post_count) AS total_post
            FROM period_counts
            GROUP BY person_id
            HAVING SUM(pre_count) >= 50 AND SUM(post_count) >= 50
        )
        SELECT
            pc.person_id,
            pc.full_name,
            pc.party,
            pc.topic_name,
            pc.pre_count,
            pc.post_count,
            mt.total_pre,
            mt.total_post,
            ROUND(1.0 * pc.pre_count / mt.total_pre, 4) AS pre_pct,
            ROUND(1.0 * pc.post_count / mt.total_post, 4) AS post_pct,
            ROUND(
                ABS(1.0 * pc.pre_count / mt.total_pre - 1.0 * pc.post_count / mt.total_post),
                4
            ) AS shift
        FROM period_counts pc
        JOIN mp_totals mt ON mt.person_id = pc.person_id
        WHERE (1.0 * pc.pre_count / mt.total_pre) > 0.05
           OR (1.0 * pc.post_count / mt.total_post) > 0.05
        ORDER BY shift DESC
        LIMIT 50
    """).fetchall()

    results = []
    for r in rows:
        entry = {
            "person_id": r["person_id"],
            "full_name": r["full_name"],
            "party": r["party"],
            "topic": r["topic_name"],
            "pre_2019_speeches": r["pre_count"],
            "post_2019_speeches": r["post_count"],
            "pre_2019_pct": round(r["pre_pct"] * 100, 1),
            "post_2019_pct": round(r["post_pct"] * 100, 1),
            "shift_pct": round(r["shift"] * 100, 1),
            "direction": "dropped" if r["pre_pct"] > r["post_pct"] else "picked_up",
        }
        results.append(entry)

    for i, e in enumerate(results[:10]):
        direction = "DROPPED" if e["direction"] == "dropped" else "PICKED UP"
        print(f"  {i+1}. {e['full_name']} ({e['party']})")
        print(f"     {direction} '{e['topic']}': {e['pre_2019_pct']}% -> {e['post_2019_pct']}% (shift: {e['shift_pct']}pp)")

    _cache(db, "stories_flip_floppers", results)
    print(f"\n  Cached {len(results)} flip-flopper entries.")
    return results


# ── 2. Donation spikes before votes ─────────────────────────────────────────

INDUSTRY_DIVISION_KEYWORDS = {
    "gambling": ["gambling", "gaming", "wagering", "poker machine", "pokies", "betting", "casino"],
    "mining": ["mining", "mineral", "coal", "iron ore", "quarry", "mining tax"],
    "fossil_fuels": ["petroleum", "oil", "gas", "fossil fuel", "carbon tax", "carbon", "emissions", "energy"],
    "property": ["housing", "property", "real estate", "affordable housing", "negative gearing", "capital gains", "rent"],
    "finance": ["banking", "bank", "financial", "superannuation", "insurance", "credit", "franking"],
    "health": ["health", "hospital", "medicare", "pharmaceutical", "aged care", "ndis"],
    "tech": ["technology", "digital", "cyber", "data", "privacy", "telecommunications", "internet"],
    "media": ["media", "broadcasting", "press", "journalism", "abc", "sbs"],
    "agriculture": ["agriculture", "farming", "drought", "water", "rural", "pastoral"],
    "education": ["education", "university", "school", "student", "teacher", "tafe"],
}


def find_donation_spikes_before_votes(db) -> list[dict]:
    """
    For each industry, compare donations in the financial year before a major
    division to the average annual donation level. Flag spikes > 2x average.
    """
    print("\n=== DONATION SPIKES BEFORE VOTES ===\n")

    # Get annual donations by industry and party
    annual_donations = db.execute("""
        SELECT
            industry,
            recipient,
            financial_year,
            SUM(amount) AS total
        FROM donations
        WHERE industry IS NOT NULL
          AND LENGTH(financial_year) = 7 AND financial_year LIKE '____-__'
          AND amount > 0
        GROUP BY industry, recipient, financial_year
        ORDER BY industry, recipient, financial_year
    """).fetchall()

    # Build lookup: (industry, recipient) -> {year: total}
    donation_map = defaultdict(dict)
    for r in annual_donations:
        donation_map[(r["industry"], r["recipient"])][r["financial_year"]] = r["total"]

    results = []

    for industry, keywords in INDUSTRY_DIVISION_KEYWORDS.items():
        # Find divisions matching this industry
        where_clauses = " OR ".join(
            f"LOWER(name) LIKE '%{kw}%'" for kw in keywords
        )
        divisions = db.execute(f"""
            SELECT division_id, name, date, aye_votes, no_votes, rebellions
            FROM divisions
            WHERE ({where_clauses})
            ORDER BY date
        """).fetchall()

        if not divisions:
            continue

        for div in divisions:
            div_year = str(div["date"])[:4]
            # The financial year before: if division is in 2020, the prior FY is 2019-20
            prior_fy = f"{int(div_year)-1}-{div_year[2:]}"

            # Check each party's donations
            for (ind, recipient), year_totals in donation_map.items():
                if ind != industry:
                    continue
                if prior_fy not in year_totals:
                    continue

                spike_amount = year_totals[prior_fy]
                # Calculate average across all years for this pair
                avg_amount = sum(year_totals.values()) / len(year_totals) if year_totals else 0
                if avg_amount == 0:
                    continue

                ratio = spike_amount / avg_amount
                if ratio >= 2.0 and spike_amount >= 50000:
                    results.append({
                        "industry": industry,
                        "party": recipient,
                        "division_name": div["name"],
                        "division_date": div["date"],
                        "division_id": div["division_id"],
                        "prior_fy": prior_fy,
                        "donation_in_prior_fy": round(spike_amount),
                        "avg_annual_donation": round(avg_amount),
                        "spike_ratio": round(ratio, 2),
                        "aye_votes": div["aye_votes"],
                        "no_votes": div["no_votes"],
                        "rebellions": div["rebellions"],
                    })

    # Sort by spike ratio descending, keep top 100
    results.sort(key=lambda x: x["spike_ratio"], reverse=True)
    results = results[:100]

    for i, e in enumerate(results[:10]):
        print(f"  {i+1}. {e['industry'].upper()} -> {e['party']}")
        print(f"     Division: {e['division_name'][:80]} ({e['division_date']})")
        print(f"     Donations in {e['prior_fy']}: ${e['donation_in_prior_fy']:,} "
              f"(avg: ${e['avg_annual_donation']:,}, {e['spike_ratio']}x spike)")

    _cache(db, "stories_donation_spikes", results)
    print(f"\n  Cached {len(results)} donation spike entries.")
    return results


# ── 3. Revolving door indicators ────────────────────────────────────────────

def find_revolving_door(db) -> list[dict]:
    """
    MPs who spoke favorably about companies that later won government contracts.
    Uses contract_speech_links where match_type = 'party_match', grouped by MP.
    """
    print("\n=== REVOLVING DOOR INDICATORS ===\n")

    gc_suppliers = _gc_distinct("csl.supplier_name")
    rows = db.execute(f"""
        SELECT
            csl.person_id,
            m.full_name,
            csl.party,
            csl.company_name,
            COUNT(*) AS link_count,
            SUM(csl.contract_amount) AS total_contract_value,
            SUM(csl.donation_amount) AS total_donations,
            {gc_suppliers} AS suppliers,
            MIN(csl.speech_date) AS earliest_speech,
            MAX(csl.speech_date) AS latest_speech
        FROM contract_speech_links csl
        LEFT JOIN members m ON m.person_id = csl.person_id
        WHERE csl.match_type = 'party_match'
          AND csl.person_id IS NOT NULL
        GROUP BY csl.person_id, m.full_name, csl.party, csl.company_name
        HAVING COUNT(*) >= 2
        ORDER BY total_contract_value DESC
        LIMIT 50
    """).fetchall()

    results = []
    for r in rows:
        entry = {
            "person_id": r["person_id"],
            "full_name": r["full_name"],
            "party": r["party"],
            "company": r["company_name"],
            "speech_count": r["link_count"],
            "total_contract_value": round(r["total_contract_value"] or 0),
            "total_donations": round(r["total_donations"] or 0),
            "suppliers": r["suppliers"],
            "speech_date_range": f"{r['earliest_speech']} to {r['latest_speech']}",
        }
        results.append(entry)

    for i, e in enumerate(results[:10]):
        print(f"  {i+1}. {e['full_name']} ({e['party']})")
        print(f"     Company: {e['company']}")
        print(f"     {e['speech_count']} speeches, ${e['total_contract_value']:,} in contracts, "
              f"${e['total_donations']:,} in donations")

    _cache(db, "stories_revolving_door", results)
    print(f"\n  Cached {len(results)} revolving door entries.")
    return results


# ── 4. Silent beneficiaries ─────────────────────────────────────────────────

def find_silent_beneficiaries(db) -> list[dict]:
    """
    Parties that receive large donations from an industry but rarely speak
    about that industry. High donation, low speech count = silent beneficiary.
    """
    print("\n=== SILENT BENEFICIARIES: Big donations, quiet voices ===\n")

    # Get donations by party and industry
    donation_rows = db.execute("""
        SELECT
            CASE
                WHEN recipient LIKE '%Labor%' OR recipient LIKE '%ALP%' THEN 'Australian Labor Party'
                WHEN recipient LIKE '%Liberal%' THEN 'Liberal Party'
                WHEN recipient LIKE '%National%' THEN 'National Party'
                WHEN recipient LIKE '%Green%' THEN 'Australian Greens'
                ELSE recipient
            END AS party_norm,
            industry,
            SUM(amount) AS total_donated,
            COUNT(*) AS donation_count
        FROM donations
        WHERE industry IS NOT NULL AND amount > 0
        GROUP BY party_norm, industry
        HAVING total_donated > 100000
        ORDER BY total_donated DESC
    """).fetchall()

    # Map donation industry to topic name in the topics table
    industry_to_topic = {
        "gambling": "gambling",
        "mining": "environment",  # closest topic
        "fossil_fuels": "climate",
        "property": "housing",
        "finance": "economy",
        "health": "health",
        "tech": "technology",
        "media": "media",
        "agriculture": "environment",
        "education": "education",
        "transport": "infrastructure",
        "security": "security",
    }

    # Pre-compute speech counts by party-group and topic in one query
    party_topic_speech_counts = {}
    speech_rows = db.execute("""
        SELECT
            CASE
                WHEN s.party LIKE '%Labor%' OR s.party LIKE '%ALP%' THEN 'Australian Labor Party'
                WHEN s.party LIKE '%Liberal%' THEN 'Liberal Party'
                WHEN s.party LIKE '%National%' THEN 'National Party'
                WHEN s.party LIKE '%Green%' THEN 'Australian Greens'
                ELSE s.party
            END AS party_norm,
            t.name AS topic_name,
            COUNT(*) AS cnt
        FROM speech_topics st
        JOIN speeches s ON s.speech_id = st.speech_id
        JOIN topics t ON t.topic_id = st.topic_id
        WHERE s.party IS NOT NULL
        GROUP BY party_norm, t.name
    """).fetchall()
    for sr in speech_rows:
        party_topic_speech_counts[(sr["party_norm"], sr["topic_name"])] = sr["cnt"]

    results = []
    for r in donation_rows:
        party = r["party_norm"]
        industry = r["industry"]
        topic_name = industry_to_topic.get(industry)
        if not topic_name:
            continue

        speech_count = party_topic_speech_counts.get((party, topic_name), 0)

        # Ratio: donations per speech (higher = more silent)
        ratio = r["total_donated"] / max(speech_count, 1)

        results.append({
            "party": party,
            "industry": industry,
            "mapped_topic": topic_name,
            "total_donated": round(r["total_donated"]),
            "donation_count": r["donation_count"],
            "speech_count": speech_count,
            "dollars_per_speech": round(ratio),
        })

    # Sort by dollars_per_speech descending
    results.sort(key=lambda x: x["dollars_per_speech"], reverse=True)
    results = results[:50]

    for i, e in enumerate(results[:10]):
        speeches_label = f"{e['speech_count']} speeches" if e['speech_count'] > 0 else "NO speeches"
        print(f"  {i+1}. {e['party']} <- {e['industry'].upper()}")
        print(f"     ${e['total_donated']:,} donated, {speeches_label}")
        print(f"     = ${e['dollars_per_speech']:,} per speech")

    _cache(db, "stories_silent_beneficiaries", results)
    print(f"\n  Cached {len(results)} silent beneficiary entries.")
    return results


# ── 5. Most controversial divisions ─────────────────────────────────────────

def find_controversial_divisions(db) -> list[dict]:
    """Divisions with the highest rebellion counts."""
    print("\n=== MOST CONTROVERSIAL DIVISIONS ===\n")

    rows = db.execute("""
        SELECT
            d.division_id,
            d.house,
            d.name,
            d.date,
            d.aye_votes,
            d.no_votes,
            d.rebellions,
            d.summary,
            (SELECT COUNT(DISTINCT v.person_id) FROM votes v WHERE v.division_id = d.division_id) AS total_voters
        FROM divisions d
        WHERE d.rebellions > 0
        ORDER BY d.rebellions DESC
        LIMIT 50
    """).fetchall()

    results = []
    for r in rows:
        # Get the rebels
        rebels = db.execute("""
            SELECT
                v.person_id,
                m.full_name,
                m.party,
                v.vote
            FROM votes v
            JOIN members m ON m.person_id = v.person_id
            WHERE v.division_id = ?
        """, (r["division_id"],)).fetchall()

        # Determine majority vote by party to identify rebels
        party_votes = defaultdict(list)
        for rebel_row in rebels:
            party_votes[rebel_row["party"]].append((rebel_row["full_name"], rebel_row["vote"]))

        rebel_names = []
        for party, votes_list in party_votes.items():
            vote_counter = Counter(v for _, v in votes_list)
            majority_vote = vote_counter.most_common(1)[0][0] if vote_counter else None
            for name, vote in votes_list:
                if vote != majority_vote and vote not in ("absent",):
                    rebel_names.append(f"{name} ({party}, voted {vote})")

        entry = {
            "division_id": r["division_id"],
            "house": r["house"],
            "name": r["name"],
            "date": r["date"],
            "aye_votes": r["aye_votes"],
            "no_votes": r["no_votes"],
            "rebellions": r["rebellions"],
            "total_voters": r["total_voters"],
            "summary": r["summary"],
            "rebels": rebel_names[:20],
        }
        results.append(entry)

    for i, e in enumerate(results[:10]):
        print(f"  {i+1}. [{e['house']}] {e['name'][:90]}")
        print(f"     Date: {e['date']}, Rebellions: {e['rebellions']}, "
              f"Ayes: {e['aye_votes']}, Noes: {e['no_votes']}")
        if e["rebels"]:
            print(f"     Rebels: {', '.join(e['rebels'][:5])}")

    _cache(db, "stories_controversial_divisions", results)
    print(f"\n  Cached {len(results)} controversial division entries.")
    return results


# ── 6. Cross-party agreement ────────────────────────────────────────────────

def find_cross_party_agreement(db) -> list[dict]:
    """
    Topics where all major parties actually vote together despite heated rhetoric.
    Look for divisions where ALP, Liberal, and Greens all predominantly voted
    the same way, then check if there are heated speeches on that topic.
    """
    print("\n=== CROSS-PARTY AGREEMENT: United votes, divided rhetoric ===\n")

    # Find divisions where major parties voted the same way
    rows = db.execute(f"""
        WITH party_division_votes AS (
            SELECT
                v.division_id,
                CASE
                    WHEN m.party LIKE '%Labor%' OR m.party LIKE '%ALP%' THEN 'ALP'
                    WHEN m.party LIKE '%Liberal%' THEN 'LIB'
                    WHEN m.party LIKE '%Green%' THEN 'GRN'
                    WHEN m.party LIKE '%National%' THEN 'NAT'
                    ELSE 'Other'
                END AS party_group,
                v.vote,
                COUNT(*) AS vote_count
            FROM votes v
            JOIN members m ON m.person_id = v.person_id
            WHERE v.vote IN ('aye', 'no')
            GROUP BY v.division_id, party_group, v.vote
        ),
        party_majority AS (
            SELECT
                division_id,
                party_group,
                vote AS majority_vote,
                vote_count,
                ROW_NUMBER() OVER (PARTITION BY division_id, party_group ORDER BY vote_count DESC) AS rn
            FROM party_division_votes
            WHERE party_group IN ('ALP', 'LIB', 'GRN')
        ),
        agreed_divisions AS (
            SELECT
                division_id,
                {_gc("party_group || ':' || majority_vote")} AS votes_detail,
                COUNT(DISTINCT party_group) AS parties_voting,
                COUNT(DISTINCT majority_vote) AS distinct_votes
            FROM party_majority
            WHERE rn = 1
            GROUP BY division_id
            HAVING COUNT(DISTINCT party_group) >= 3 AND COUNT(DISTINCT majority_vote) = 1
        )
        SELECT
            ad.division_id,
            d.name,
            d.date,
            d.house,
            d.aye_votes,
            d.no_votes,
            d.rebellions,
            ad.votes_detail,
            ad.parties_voting
        FROM agreed_divisions ad
        JOIN divisions d ON d.division_id = ad.division_id
        ORDER BY d.date DESC
        LIMIT 50
    """).fetchall()

    results = []
    for r in rows:
        # Count related speeches to gauge rhetoric intensity
        div_name = r["name"] or ""
        # Extract a keyword from the division name for speech matching
        words = [w for w in div_name.split() if len(w) > 5 and w.lower() not in
                 ("second", "reading", "third", "agree", "bills", "bill's")]
        keyword = words[0] if words else None

        speech_count = 0
        if keyword:
            try:
                speech_count = db.execute(
                    "SELECT COUNT(*) AS c FROM speeches WHERE topic LIKE ?",
                    (f"%{keyword}%",)
                ).fetchone()["c"]
            except Exception:
                pass

        entry = {
            "division_id": r["division_id"],
            "name": r["name"],
            "date": r["date"],
            "house": r["house"],
            "aye_votes": r["aye_votes"],
            "no_votes": r["no_votes"],
            "rebellions": r["rebellions"],
            "votes_detail": r["votes_detail"],
            "parties_agreeing": r["parties_voting"],
            "related_speech_count": speech_count,
        }
        results.append(entry)

    # Sort by speech count descending (most rhetoric despite agreement)
    results.sort(key=lambda x: x["related_speech_count"], reverse=True)

    for i, e in enumerate(results[:10]):
        print(f"  {i+1}. {e['name'][:90]}")
        print(f"     Date: {e['date']}, House: {e['house']}")
        print(f"     All 3 parties agreed ({e['votes_detail']})")
        print(f"     Related speeches: {e['related_speech_count']}")

    _cache(db, "stories_cross_party_agreement", results)
    print(f"\n  Cached {len(results)} cross-party agreement entries.")
    return results


# ── Main ─────────────────────────────────────────────────────────────────────

STORY_TYPES = {
    "flip_floppers": find_flip_floppers,
    "donation_spikes": find_donation_spikes_before_votes,
    "revolving_door": find_revolving_door,
    "silent_beneficiaries": find_silent_beneficiaries,
    "controversial_divisions": find_controversial_divisions,
    "cross_party_agreement": find_cross_party_agreement,
}

VALID_TYPES = list(STORY_TYPES.keys())


def run_all(db=None):
    """Run all story analyses and cache results."""
    if db is None:
        db = _get_db()
    all_results = {}
    for name, fn in STORY_TYPES.items():
        print(f"\n{'='*70}")
        print(f"Running: {name}")
        print(f"{'='*70}")
        try:
            all_results[name] = fn(db)
        except Exception as e:
            print(f"  ERROR in {name}: {e}")
            import traceback
            traceback.print_exc()
            all_results[name] = []

    # Store a summary index
    summary = {
        name: len(results) for name, results in all_results.items()
    }
    _cache(db, "stories_index", summary)
    print(f"\n\nStory index cached: {summary}")
    return all_results


def get_stories(story_type: str, db=None) -> list[dict]:
    """Retrieve cached stories by type."""
    if db is None:
        db = _get_db()
    key = f"stories_{story_type}"
    row = db.execute(
        "SELECT value FROM analysis_cache WHERE key = ?", (key,)
    ).fetchone()
    if row:
        val = row["value"]
        # PG may auto-deserialize JSONB columns; only parse if still a string
        if isinstance(val, str):
            return json.loads(val)
        return val
    return []


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="OPAX Story Discovery Engine")
    parser.add_argument("--type", choices=VALID_TYPES, help="Run only this story type")
    args = parser.parse_args()

    db = _get_db()

    if args.type:
        fn = STORY_TYPES[args.type]
        fn(db)
    else:
        run_all(db)
