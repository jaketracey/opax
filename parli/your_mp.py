"""
parli.your_mp -- "Enter your postcode" backend.

Comprehensive single-query endpoint that returns everything a voter needs
to know about their MP and electorate.

Usage:
    from parli.your_mp import get_your_mp, get_all_postcodes
    result = get_your_mp(db, "2000")
    postcodes = get_all_postcodes(db)
"""

import json
import sqlite3
from datetime import datetime

from parli.db import is_postgres


def get_your_mp(db, postcode: str) -> dict:
    """Return comprehensive MP/electorate data for a given postcode.

    Returns dict with keys:
        postcode, electorate, mp, say_vs_vote, who_funds_them,
        follow_the_money, electorate_vs_mp, conflicts_of_interest,
        grant_spending, career_stats, key_quote
    """
    if not is_postgres():
        db.execute("PRAGMA busy_timeout = 600000")

    # ------------------------------------------------------------------
    # 0. Check cache first
    # ------------------------------------------------------------------
    cache_key = f"your_mp_{postcode}"
    cached = db.execute(
        "SELECT value, updated_at FROM analysis_cache WHERE key = ?",
        (cache_key,),
    ).fetchone()
    if cached:
        # Cache for 24 hours
        try:
            updated_at = cached["updated_at"]
            if hasattr(updated_at, 'isoformat'):
                updated = updated_at  # Already a datetime on PG
            else:
                updated = datetime.fromisoformat(str(updated_at))
            if (datetime.now() - updated).total_seconds() < 86400:
                val = cached["value"]
                return json.loads(val) if isinstance(val, str) else val
        except (ValueError, TypeError):
            pass

    # ------------------------------------------------------------------
    # 1. Resolve postcode -> electorate(s)
    # ------------------------------------------------------------------
    try:
        electorates = db.execute(
            """SELECT pe.electorate_name, pe.state, pe.ratio,
                      e.margin_pct, e.winning_party, e.winning_candidate,
                      e.swing, e.seat_type, e.year as election_year
               FROM postcode_electorates pe
               LEFT JOIN electorates e ON LOWER(e.electorate_name) = LOWER(pe.electorate_name)
               WHERE pe.postcode = ?
           ORDER BY pe.ratio DESC""",
            (postcode,),
        ).fetchall()
    except Exception:
        # postcode_electorates table may not exist on this database
        electorates = []

    if not electorates:
        return {"error": f"No electorate found for postcode {postcode}", "postcode": postcode}

    # Use the electorate with the highest ratio (most coverage)
    primary = dict(electorates[0])
    electorate_name = primary["electorate_name"]

    electorate_info = {
        "electorate_name": electorate_name,
        "state": primary["state"],
        "margin_pct": primary["margin_pct"],
        "winning_party": primary["winning_party"],
        "winning_candidate": primary["winning_candidate"],
        "swing": primary["swing"],
        "seat_type": primary["seat_type"],
        "election_year": primary["election_year"],
    }

    if len(electorates) > 1:
        others = []
        seen = {electorate_name.lower()}
        for e in electorates[1:]:
            ename = dict(e)["electorate_name"]
            if ename.lower() not in seen:
                seen.add(ename.lower())
                others.append({"electorate_name": ename, "ratio": dict(e)["ratio"]})
        if others:
            electorate_info["other_electorates"] = others

    # ------------------------------------------------------------------
    # 2. Find the MP for this electorate
    # ------------------------------------------------------------------
    # Try current members first (no left_house), then most recent
    mp = db.execute(
        """SELECT person_id, first_name, last_name, full_name, party,
                  electorate, chamber, gender, entered_house, left_house
           FROM members
           WHERE LOWER(electorate) = LOWER(?)
             AND chamber = 'representatives'
             AND (left_house IS NULL OR left_house = '')
           ORDER BY entered_house DESC
           LIMIT 1""",
        (electorate_name,),
    ).fetchone()

    if not mp:
        # Fallback: most recent member for this electorate
        mp = db.execute(
            """SELECT person_id, first_name, last_name, full_name, party,
                      electorate, chamber, gender, entered_house, left_house
               FROM members
               WHERE LOWER(electorate) = LOWER(?)
                 AND chamber = 'representatives'
               ORDER BY entered_house DESC
               LIMIT 1""",
            (electorate_name,),
        ).fetchone()

    if not mp:
        return {
            "error": f"No MP found for electorate {electorate_name}",
            "postcode": postcode,
            "electorate": electorate_info,
        }

    mp_dict = dict(mp)
    person_id = mp_dict["person_id"]
    party = mp_dict["party"] or ""
    mp_dict["photo_url"] = f"https://www.openaustralia.org.au/images/mpsL/{person_id}.jpg"

    # ------------------------------------------------------------------
    # 3. Say vs Vote: top disconnect scores
    # ------------------------------------------------------------------
    disconnect = db.execute(
        """SELECT topic_name, disconnect_score, speech_count,
                  pro_reform_speeches, anti_reform_speeches,
                  relevant_divisions, aligned_votes, misaligned_votes,
                  vote_alignment
           FROM mp_disconnect_scores
           WHERE person_id = ?
           ORDER BY disconnect_score DESC
           LIMIT 3""",
        (person_id,),
    ).fetchall()
    say_vs_vote = [dict(d) for d in disconnect]

    # ------------------------------------------------------------------
    # 4. Who funds them: top donors by industry + influence scores
    # ------------------------------------------------------------------
    # Match party name flexibly
    party_like = f"%{party.split()[0]}%" if party else "%"

    top_donors = db.execute(
        """SELECT industry, SUM(amount) as total_amount,
                  COUNT(DISTINCT donor_name) as donor_count
           FROM donations
           WHERE recipient LIKE ?
             AND industry IS NOT NULL AND industry != ''
           GROUP BY industry
           ORDER BY total_amount DESC
           LIMIT 10""",
        (party_like,),
    ).fetchall()
    who_funds = []
    for d in top_donors:
        entry = dict(d)
        # Get top 3 donors for this industry
        top3 = db.execute(
            """SELECT donor_name, SUM(amount) as total
               FROM donations
               WHERE recipient LIKE ? AND industry = ?
               GROUP BY donor_name
               ORDER BY total DESC
               LIMIT 3""",
            (party_like, d["industry"]),
        ).fetchall()
        entry["top_donors"] = [r["donor_name"] for r in top3]
        who_funds.append(entry)

    # Add donor influence scores for this MP
    mp_influence = db.execute(
        """SELECT industry, party_donations_from_industry,
                  favorable_vote_pct, influence_score,
                  divisions_voted, aye_count, no_count
           FROM mp_donor_influence_scores
           WHERE person_id = ?
           ORDER BY influence_score DESC
           LIMIT 10""",
        (person_id,),
    ).fetchall()
    donor_influence = [dict(d) for d in mp_influence]

    # Merge influence scores with donation data
    influence_by_industry = {d["industry"]: d for d in donor_influence}
    for d in who_funds:
        inf = influence_by_industry.get(d["industry"])
        if inf:
            d["favorable_vote_pct"] = inf["favorable_vote_pct"]
            d["influence_score"] = inf["influence_score"]

    # ------------------------------------------------------------------
    # 5. Follow the money: contract-speech links
    # ------------------------------------------------------------------
    contract_links = db.execute(
        """SELECT company_name, supplier_name, donor_name,
                  contract_amount, donation_amount,
                  party, recipient_party, match_type,
                  speech_date, speech_snippet
           FROM contract_speech_links
           WHERE person_id = ?
           ORDER BY contract_amount DESC
           LIMIT 10""",
        (person_id,),
    ).fetchall()
    follow_the_money = [dict(c) for c in contract_links]

    # ------------------------------------------------------------------
    # 6. Electorate demographics vs MP voting
    # ------------------------------------------------------------------
    demographics = db.execute(
        """SELECT * FROM electorate_demographics
           WHERE LOWER(electorate_name) = LOWER(?)
           ORDER BY year DESC LIMIT 1""",
        (electorate_name,),
    ).fetchone()
    demo_dict = dict(demographics) if demographics else {}

    # National averages for comparison
    national_avg = db.execute(
        """SELECT
             AVG(median_income) as avg_median_income,
             AVG(unemployment_rate) as avg_unemployment,
             AVG(homeownership_pct) as avg_homeownership,
             AVG(rental_pct) as avg_rental,
             AVG(median_rent_weekly) as avg_rent,
             AVG(median_mortgage_monthly) as avg_mortgage,
             AVG(median_household_income_weekly) as avg_household_income,
             AVG(university_pct) as avg_university
           FROM electorate_demographics"""
    ).fetchone()
    nat_dict = dict(national_avg) if national_avg else {}

    # MP's voting record on cost-of-living, housing, economy topics
    relevant_topics = ["cost_of_living", "housing", "economy", "taxation"]
    topic_votes = {}
    for topic in relevant_topics:
        row = db.execute(
            """SELECT topic_name, speech_count, pro_reform_speeches,
                      anti_reform_speeches, vote_alignment, disconnect_score
               FROM mp_disconnect_scores
               WHERE person_id = ? AND topic_name = ?""",
            (person_id, topic),
        ).fetchone()
        if row:
            topic_votes[topic] = dict(row)

    electorate_vs_mp = {
        "demographics": demo_dict,
        "national_averages": nat_dict,
        "mp_votes_on_key_issues": topic_votes,
    }

    # ------------------------------------------------------------------
    # 7. Conflicts of interest
    # ------------------------------------------------------------------
    interests = db.execute(
        """SELECT interest_type, entity_name, description, declared_date
           FROM mp_interests
           WHERE person_id = ?
           ORDER BY declared_date DESC""",
        (person_id,),
    ).fetchall()

    shareholdings = db.execute(
        """SELECT company_name, share_type, declared_date
           FROM mp_shareholdings
           WHERE person_id = ?""",
        (person_id,),
    ).fetchall()

    directorships = db.execute(
        """SELECT company_name, role, declared_date
           FROM mp_directorships
           WHERE person_id = ?""",
        (person_id,),
    ).fetchall()

    properties = db.execute(
        """SELECT property_description, location, purpose, declared_date
           FROM mp_properties
           WHERE person_id = ?""",
        (person_id,),
    ).fetchall()

    conflicts = {
        "interests": [dict(i) for i in interests],
        "shareholdings": [dict(s) for s in shareholdings],
        "directorships": [dict(d) for d in directorships],
        "properties": [dict(p) for p in properties],
    }

    # ------------------------------------------------------------------
    # 8. Grant spending in this electorate
    # ------------------------------------------------------------------
    grant_total = db.execute(
        """SELECT SUM(amount) as total, COUNT(*) as grant_count,
                  AVG(amount) as avg_grant
           FROM government_grants
           WHERE LOWER(electorate) = LOWER(?)""",
        (electorate_name,),
    ).fetchone()

    # National average per electorate
    national_grant_avg = db.execute(
        """SELECT AVG(total) as avg_total, AVG(grant_count) as avg_count
           FROM (
               SELECT electorate, SUM(amount) as total, COUNT(*) as grant_count
               FROM government_grants
               WHERE electorate IS NOT NULL AND electorate != ''
               GROUP BY electorate
           )"""
    ).fetchone()

    # Top programs in this electorate
    top_programs = db.execute(
        """SELECT program, SUM(amount) as total, COUNT(*) as count
           FROM government_grants
           WHERE LOWER(electorate) = LOWER(?)
             AND program IS NOT NULL
           GROUP BY program
           ORDER BY total DESC
           LIMIT 5""",
        (electorate_name,),
    ).fetchall()

    margin = primary.get("margin_pct")
    grant_dict = dict(grant_total) if grant_total else {}
    nat_grant_dict = dict(national_grant_avg) if national_grant_avg else {}

    # Pork-barrel indicator: ratio of this electorate's grants to national average
    pork_ratio = None
    if grant_dict.get("total") and nat_grant_dict.get("avg_total") and nat_grant_dict["avg_total"] > 0:
        pork_ratio = round(grant_dict["total"] / nat_grant_dict["avg_total"], 2)

    grant_spending = {
        "electorate_total": grant_dict.get("total"),
        "electorate_grant_count": grant_dict.get("grant_count"),
        "electorate_avg_grant": grant_dict.get("avg_grant"),
        "national_avg_total": nat_grant_dict.get("avg_total"),
        "national_avg_count": nat_grant_dict.get("avg_count"),
        "pork_barrel_ratio": pork_ratio,
        "margin_pct": margin,
        "top_programs": [dict(p) for p in top_programs],
    }

    # ------------------------------------------------------------------
    # 9. Career stats
    # ------------------------------------------------------------------
    speech_stats = db.execute(
        """SELECT COUNT(*) as total_speeches,
                  MIN(date) as first_speech,
                  MAX(date) as last_speech,
                  SUM(word_count) as total_words
           FROM speeches WHERE person_id = ?""",
        (person_id,),
    ).fetchone()

    # Years active
    entered = str(mp_dict.get("entered_house", "") or "")
    first_speech = str(speech_stats["first_speech"] or "") if speech_stats else None
    start_year = None
    if entered:
        try:
            start_year = int(str(entered)[:4])
        except (ValueError, TypeError):
            pass
    if not start_year and first_speech:
        try:
            start_year = int(str(first_speech)[:4])
        except (ValueError, TypeError):
            pass

    years_active = (datetime.now().year - start_year) if start_year else None

    # Top topics from speech_topics join
    top_topics = db.execute(
        """SELECT t.name, COUNT(*) as count
           FROM speech_topics st
           JOIN topics t ON t.topic_id = st.topic_id
           JOIN speeches s ON s.speech_id = st.speech_id
           WHERE s.person_id = ?
           GROUP BY t.name
           ORDER BY count DESC
           LIMIT 5""",
        (person_id,),
    ).fetchall()

    # Attendance rate from TVFY cache
    attendance_rate = None
    votes_attended = None
    votes_possible = None
    tvfy_cache = db.execute(
        "SELECT value FROM analysis_cache WHERE key = ?",
        (f"tvfy_person_{person_id}",),
    ).fetchone()
    if tvfy_cache:
        try:
            tvfy = json.loads(tvfy_cache["value"])
            votes_attended = tvfy.get("votes_attended")
            votes_possible = tvfy.get("votes_possible")
            if votes_attended and votes_possible and votes_possible > 0:
                attendance_rate = round(votes_attended / votes_possible * 100, 1)
        except (json.JSONDecodeError, TypeError):
            pass

    career_stats = {
        "total_speeches": speech_stats["total_speeches"] if speech_stats else 0,
        "total_words": speech_stats["total_words"] if speech_stats else 0,
        "first_speech": speech_stats["first_speech"] if speech_stats else None,
        "last_speech": speech_stats["last_speech"] if speech_stats else None,
        "entered_house": entered,
        "years_active": years_active,
        "top_topics": [dict(t) for t in top_topics],
        "votes_attended": votes_attended,
        "votes_possible": votes_possible,
        "attendance_rate": attendance_rate,
    }

    # ------------------------------------------------------------------
    # 10. Key quote: most substantive speech snippet from top topic
    # ------------------------------------------------------------------
    key_quote = None
    if top_topics:
        top_topic_name = top_topics[0]["name"]
        quote_row = db.execute(
            """SELECT s.text, s.date, s.topic, s.word_count
               FROM speeches s
               JOIN speech_topics st ON st.speech_id = s.speech_id
               JOIN topics t ON t.topic_id = st.topic_id
               WHERE s.person_id = ? AND t.name = ?
                 AND s.word_count > 50
               ORDER BY s.word_count DESC
               LIMIT 1""",
            (person_id, top_topic_name),
        ).fetchone()
        if quote_row:
            text = quote_row["text"]
            # Extract first ~300 chars at sentence boundary
            snippet = text[:500]
            last_period = snippet.rfind(".")
            if last_period > 100:
                snippet = snippet[: last_period + 1]
            key_quote = {
                "text": snippet,
                "date": quote_row["date"],
                "topic": quote_row["topic"],
                "topic_category": top_topic_name,
                "word_count": quote_row["word_count"],
            }

    # ------------------------------------------------------------------
    # Assemble result
    # ------------------------------------------------------------------
    result = {
        "postcode": postcode,
        "electorate": electorate_info,
        "mp": mp_dict,
        "say_vs_vote": say_vs_vote,
        "who_funds_them": who_funds,
        "donor_influence": donor_influence,
        "follow_the_money": follow_the_money,
        "electorate_vs_mp": electorate_vs_mp,
        "conflicts_of_interest": conflicts,
        "grant_spending": grant_spending,
        "career_stats": career_stats,
        "key_quote": key_quote,
        "generated_at": datetime.now().isoformat(),
    }

    # ------------------------------------------------------------------
    # Cache the result
    # ------------------------------------------------------------------
    try:
        if is_postgres():
            db.execute(
                """INSERT INTO analysis_cache (key, value, updated_at)
                   VALUES (%s, %s, NOW())
                   ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()""",
                (cache_key, json.dumps(result, default=str)),
            )
        else:
            db.execute(
                """INSERT OR REPLACE INTO analysis_cache (key, value, updated_at)
                   VALUES (?, ?, datetime('now'))""",
                (cache_key, json.dumps(result, default=str)),
            )
        db.commit()
    except Exception:
        pass  # Don't fail the request if caching fails

    return result


def get_all_postcodes(db) -> list[dict]:
    """Return all valid postcodes with their electorate names for autocomplete."""
    if not is_postgres():
        db.execute("PRAGMA busy_timeout = 600000")
    try:
        rows = db.execute(
            """SELECT DISTINCT pe.postcode, pe.electorate_name, pe.state
               FROM postcode_electorates pe
               ORDER BY pe.postcode"""
        ).fetchall()
        return [dict(r) for r in rows]
    except Exception:
        return []
