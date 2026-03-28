"""
parli.generate_investigation -- Automated investigation page generator for OPAX.

Queries the parliamentary database for a given topic, uses Claude to generate
narrative text, and outputs a complete Next.js page file.

Usage:
    python -m parli.generate_investigation --topic "media ownership" --output opax/src/app/media/page.tsx
    python -m parli.generate_investigation --topic "indigenous affairs" --output opax/src/app/indigenous/page.tsx
"""

from __future__ import annotations

import argparse
import json
import os
import re
import textwrap
from pathlib import Path

from anthropic import Anthropic

from parli.schema import get_db, SEED_TOPICS


# ── Topic mapping: human-readable names -> DB topic keys ──

TOPIC_KEY_MAP: dict[str, str] = {
    "media ownership": "media",
    "media": "media",
    "indigenous affairs": "indigenous_affairs",
    "indigenous": "indigenous_affairs",
    "gambling": "gambling",
    "housing": "housing",
    "climate": "climate",
    "healthcare": "health",
    "health": "health",
    "education": "education",
    "economy": "economy",
    "defence": "defence",
    "corruption": "corruption",
    "environment": "environment",
    "taxation": "taxation",
    "infrastructure": "infrastructure",
    "foreign affairs": "foreign_affairs",
    "cost of living": "cost_of_living",
    "immigration": "immigration",
}

# Industries to search for donations by topic
TOPIC_DONATION_INDUSTRIES: dict[str, list[str]] = {
    "media": ["media", "broadcasting", "entertainment", "news", "publishing",
              "news corp", "nine entertainment", "seven west", "foxtel",
              "digital", "tech"],
    "indigenous_affairs": ["mining", "resources", "indigenous", "land",
                           "aboriginal", "native title"],
    "gambling": ["gambling", "gaming", "wagering", "casino", "betting",
                 "pokies", "tabcorp", "crown", "sportsbet", "star"],
    "housing": ["property", "developer", "real estate", "construction",
                "housing"],
    "climate": ["fossil", "coal", "petroleum", "gas", "mining", "oil",
                "energy", "renewable"],
    "health": ["pharmaceutical", "medical", "health", "hospital", "aged care",
               "private health"],
    "education": ["education", "university", "school", "vocational"],
    "corruption": ["lobbying", "consulting", "legal", "accounting"],
    "environment": ["mining", "forestry", "agriculture", "water"],
    "immigration": ["migration", "settlement", "multicultural"],
    "defence": ["defence", "military", "arms", "aerospace", "security"],
    "taxation": ["finance", "banking", "insurance", "superannuation",
                 "accounting"],
    "infrastructure": ["construction", "engineering", "transport", "roads",
                       "rail", "aviation"],
    "economy": ["banking", "finance", "business", "industry"],
    "foreign_affairs": ["trade", "export", "foreign", "international"],
    "cost_of_living": ["retail", "energy", "grocery", "fuel", "utilities"],
}

# TVFY policy IDs by topic key
TVFY_POLICY_MAP: dict[str, int] = {
    "gambling": 39,
    "housing": 117,
    "climate": 3,
    "immigration": 4,
    "health": 262,
    "education": 25,
    "economy": 290,
    "defence": 161,
    "indigenous_affairs": 160,
    "corruption": 86,
    "media": 68,
    "environment": 83,
    "taxation": 92,
    "infrastructure": 38,
    "foreign_affairs": 142,
    "cost_of_living": 294,
}

# ── Data query functions ──


def _resolve_topic_key(topic: str) -> str:
    """Convert a human-readable topic name to a database topic key."""
    key = TOPIC_KEY_MAP.get(topic.lower().strip())
    if key:
        return key
    # Fuzzy fallback: try matching against SEED_TOPICS keys
    normed = topic.lower().strip().replace(" ", "_")
    if normed in SEED_TOPICS:
        return normed
    # Try partial match on keywords
    for k, kws in SEED_TOPICS.items():
        if any(w in topic.lower() for w in kws.split(",")):
            return k
    raise ValueError(
        f"Unknown topic: {topic!r}. Known topics: {', '.join(SEED_TOPICS.keys())}"
    )


def _get_topic_keywords(topic_key: str) -> list[str]:
    """Get search keywords for a topic."""
    kws = SEED_TOPICS.get(topic_key, "")
    return [k.strip() for k in kws.split(",") if k.strip()]


def query_speech_timeline(topic_key: str) -> list[dict]:
    """Get speech counts by year and party for a topic using FTS."""
    db = get_db()
    keywords = _get_topic_keywords(topic_key)
    if not keywords:
        return []

    # Use FTS for more precise matching -- only use multi-word or longer keywords
    # to avoid overly broad matches (e.g., "abc", "sbs", "news" alone)
    fts_terms = [kw for kw in keywords if len(kw) > 3 or " " in kw]
    if not fts_terms:
        fts_terms = keywords[:3]

    fts_query = " OR ".join(f'"{kw}"' for kw in fts_terms)

    try:
        rows = db.execute(
            """
            SELECT
                SUBSTR(s.date, 1, 4) AS year,
                CASE
                    WHEN s.party IN ('Australian Labor Party', 'ALP', 'Labor') THEN 'ALP'
                    WHEN s.party IN ('Liberal Party', 'LP', 'Liberal', 'LIB', 'Liberal National Party', 'LNP') THEN 'COA'
                    WHEN s.party IN ('National Party', 'NAT', 'Nationals', 'NP', 'The Nationals') THEN 'COA'
                    WHEN s.party IN ('Australian Greens', 'AG', 'Greens') THEN 'GRN'
                    WHEN s.party IN ('Independent', 'IND', 'Ind', 'Ind.') THEN 'IND'
                    ELSE 'Other'
                END AS party_group,
                COUNT(*) AS cnt
            FROM speeches_fts
            JOIN speeches s ON s.speech_id = speeches_fts.rowid
            WHERE speeches_fts MATCH ?
              AND s.date IS NOT NULL
              AND LENGTH(s.date) >= 4
            GROUP BY year, party_group
            ORDER BY year
            """,
            (fts_query,),
        ).fetchall()
    except Exception:
        # Fallback to LIKE with only longer keywords
        long_kws = [kw for kw in keywords if len(kw) > 5][:5]
        if not long_kws:
            long_kws = keywords[:3]
        conditions = " OR ".join(["(s.topic LIKE ? OR s.text LIKE ?)"] * len(long_kws))
        params: list[str] = []
        for kw in long_kws:
            params.extend([f"%{kw}%", f"%{kw}%"])
        rows = db.execute(
            f"""
            SELECT
                SUBSTR(s.date, 1, 4) AS year,
                CASE
                    WHEN s.party IN ('Australian Labor Party', 'ALP', 'Labor') THEN 'ALP'
                    WHEN s.party IN ('Liberal Party', 'LP', 'Liberal', 'LIB', 'Liberal National Party', 'LNP') THEN 'COA'
                    WHEN s.party IN ('National Party', 'NAT', 'Nationals', 'NP', 'The Nationals') THEN 'COA'
                    WHEN s.party IN ('Australian Greens', 'AG', 'Greens') THEN 'GRN'
                    WHEN s.party IN ('Independent', 'IND', 'Ind', 'Ind.') THEN 'IND'
                    ELSE 'Other'
                END AS party_group,
                COUNT(*) AS cnt
            FROM speeches s
            WHERE ({conditions})
              AND s.date IS NOT NULL
              AND LENGTH(s.date) >= 4
            GROUP BY year, party_group
            ORDER BY year
            """,
            params,
        ).fetchall()

    # Pivot into year -> {ALP, COA, GRN, IND, Other}
    year_data: dict[str, dict[str, int]] = {}
    for r in rows:
        y = r["year"]
        if not y or len(y) < 4:
            continue
        if y not in year_data:
            year_data[y] = {"ALP": 0, "COA": 0, "GRN": 0, "IND": 0, "Other": 0}
        year_data[y][r["party_group"]] += r["cnt"]

    return [
        {"year": y, **counts}
        for y, counts in sorted(year_data.items())
        if 1998 <= int(y) <= 2025
    ]


def query_total_speeches(topic_key: str) -> int:
    """Get total speech count for a topic."""
    timeline = query_speech_timeline(topic_key)
    return sum(d["ALP"] + d["COA"] + d["GRN"] + d["IND"] + d["Other"] for d in timeline)


def query_top_speakers(topic_key: str, limit: int = 10) -> list[dict]:
    """Get top speakers for a topic using FTS."""
    db = get_db()
    keywords = _get_topic_keywords(topic_key)
    if not keywords:
        return []

    fts_terms = [kw for kw in keywords if len(kw) > 3 or " " in kw]
    if not fts_terms:
        fts_terms = keywords[:3]
    fts_query = " OR ".join(f'"{kw}"' for kw in fts_terms)

    try:
        rows = db.execute(
            """
            SELECT
                s.speaker_name,
                s.party,
                s.person_id,
                COUNT(*) AS speech_count
            FROM speeches_fts
            JOIN speeches s ON s.speech_id = speeches_fts.rowid
            WHERE speeches_fts MATCH ?
              AND s.speaker_name IS NOT NULL
              AND s.speaker_name != ''
            GROUP BY s.speaker_name, s.party
            ORDER BY speech_count DESC
            LIMIT ?
            """,
            (fts_query, limit),
        ).fetchall()
    except Exception:
        long_kws = [kw for kw in keywords if len(kw) > 5][:5]
        if not long_kws:
            long_kws = keywords[:3]
        conditions = " OR ".join(["(s.topic LIKE ? OR s.text LIKE ?)"] * len(long_kws))
        params: list[str] = []
        for kw in long_kws:
            params.extend([f"%{kw}%", f"%{kw}%"])
        rows = db.execute(
            f"""
            SELECT
                s.speaker_name,
                s.party,
                s.person_id,
                COUNT(*) AS speech_count
            FROM speeches s
            WHERE ({conditions})
              AND s.speaker_name IS NOT NULL
              AND s.speaker_name != ''
            GROUP BY s.speaker_name, s.party
            ORDER BY speech_count DESC
            LIMIT ?
            """,
            params + [str(limit)],
        ).fetchall()

    return [dict(r) for r in rows]


def query_top_quotes(topic_key: str, limit: int = 8) -> list[dict]:
    """Get notable quotes on a topic -- prefer longer, more substantive speeches."""
    db = get_db()
    keywords = _get_topic_keywords(topic_key)
    if not keywords:
        return []

    # Use FTS for more targeted results
    fts_query = " OR ".join(f'"{kw}"' for kw in keywords[:5])

    try:
        rows = db.execute(
            """
            SELECT
                s.speech_id,
                s.speaker_name,
                s.party,
                s.date,
                s.person_id,
                SUBSTR(s.text, 1, 600) AS text_preview,
                s.word_count
            FROM speeches_fts
            JOIN speeches s ON s.speech_id = speeches_fts.rowid
            WHERE speeches_fts MATCH ?
              AND s.speaker_name IS NOT NULL
              AND s.word_count > 40
            ORDER BY rank
            LIMIT ?
            """,
            (fts_query, limit * 3),
        ).fetchall()
    except Exception:
        # Fallback to LIKE-based search
        conditions = " OR ".join(["(s.topic LIKE ? OR s.text LIKE ?)"] * len(keywords[:3]))
        params: list[str] = []
        for kw in keywords[:3]:
            params.extend([f"%{kw}%", f"%{kw}%"])
        rows = db.execute(
            f"""
            SELECT
                s.speech_id,
                s.speaker_name,
                s.party,
                s.date,
                s.person_id,
                SUBSTR(s.text, 1, 600) AS text_preview,
                s.word_count
            FROM speeches s
            WHERE ({conditions})
              AND s.speaker_name IS NOT NULL
              AND s.word_count > 40
            ORDER BY s.word_count DESC
            LIMIT ?
            """,
            params + [str(limit * 3)],
        ).fetchall()

    # Deduplicate by speaker, prefer longer quotes
    seen_speakers: set[str] = set()
    results = []
    for r in rows:
        name = r["speaker_name"]
        if name in seen_speakers:
            continue
        seen_speakers.add(name)
        results.append(dict(r))
        if len(results) >= limit:
            break

    return results


def query_donations(topic_key: str) -> dict:
    """Get donation data related to a topic.

    Returns:
        {
            "top_donors": [...],
            "party_totals": [...],
            "donor_flow": [...],
            "total_amount": float,
        }
    """
    db = get_db()
    industries = TOPIC_DONATION_INDUSTRIES.get(topic_key, [])
    if not industries:
        return {"top_donors": [], "party_totals": [], "donor_flow": [], "total_amount": 0}

    conditions = " OR ".join(
        ["(LOWER(d.donor_name) LIKE ? OR LOWER(d.industry) LIKE ?)"] * len(industries)
    )
    params: list[str] = []
    for ind in industries:
        params.extend([f"%{ind.lower()}%", f"%{ind.lower()}%"])

    # Top donors
    top_donors = db.execute(
        f"""
        SELECT
            d.donor_name,
            SUM(d.amount) AS total,
            COUNT(*) AS donations,
            MIN(d.financial_year) AS first_year,
            MAX(d.financial_year) AS last_year
        FROM donations d
        WHERE ({conditions}) AND d.amount IS NOT NULL
        GROUP BY d.donor_name
        ORDER BY total DESC
        LIMIT 8
        """,
        params,
    ).fetchall()

    # Party totals
    party_totals = db.execute(
        f"""
        SELECT
            d.recipient AS party,
            SUM(d.amount) AS total
        FROM donations d
        WHERE ({conditions}) AND d.amount IS NOT NULL
        GROUP BY d.recipient
        ORDER BY total DESC
        LIMIT 10
        """,
        params,
    ).fetchall()

    # Donor -> party flow (top donors by party)
    donor_flow = db.execute(
        f"""
        SELECT
            d.donor_name AS donor,
            d.recipient AS party,
            SUM(d.amount) AS amount
        FROM donations d
        WHERE ({conditions}) AND d.amount IS NOT NULL
        GROUP BY d.donor_name, d.recipient
        HAVING amount > 50000
        ORDER BY amount DESC
        LIMIT 30
        """,
        params,
    ).fetchall()

    total_amount = sum(r["total"] for r in party_totals) if party_totals else 0

    return {
        "top_donors": [dict(r) for r in top_donors],
        "party_totals": [dict(r) for r in party_totals],
        "donor_flow": [dict(r) for r in donor_flow],
        "total_amount": total_amount,
    }


def query_tvfy_policy(topic_key: str) -> list[dict]:
    """Get TVFY voting scores for a topic's policy."""
    db = get_db()
    policy_id = TVFY_POLICY_MAP.get(topic_key)
    if not policy_id:
        return []

    row = db.execute(
        "SELECT value FROM analysis_cache WHERE key=?",
        (f"tvfy_policy_{policy_id}",),
    ).fetchone()
    if not row:
        return []

    policy = json.loads(row["value"])
    people = policy.get("people_comparisons", [])
    voted = [p for p in people if p.get("voted")]
    voted.sort(key=lambda x: float(x.get("agreement", 0)))

    # Build party aggregation
    party_scores: dict[str, list[float]] = {}
    for p in voted:
        m = p["person"]["latest_member"]
        party = m.get("party", "Unknown")
        if party not in party_scores:
            party_scores[party] = []
        party_scores[party].append(float(p.get("agreement", 0)))

    results = []
    for party, scores in party_scores.items():
        avg = sum(scores) / len(scores)
        results.append({
            "party": party,
            "support": round(avg, 1),
            "mps": len(scores),
        })
    results.sort(key=lambda x: x["support"], reverse=True)
    return results


def query_mp_count(topic_key: str) -> int:
    """Count distinct MPs who spoke on a topic using FTS."""
    db = get_db()
    keywords = _get_topic_keywords(topic_key)
    if not keywords:
        return 0

    fts_terms = [kw for kw in keywords if len(kw) > 3 or " " in kw]
    if not fts_terms:
        fts_terms = keywords[:3]
    fts_query = " OR ".join(f'"{kw}"' for kw in fts_terms)

    try:
        row = db.execute(
            """
            SELECT COUNT(DISTINCT s.speaker_name) AS cnt
            FROM speeches_fts
            JOIN speeches s ON s.speech_id = speeches_fts.rowid
            WHERE speeches_fts MATCH ?
              AND s.speaker_name IS NOT NULL
              AND s.speaker_name != ''
            """,
            (fts_query,),
        ).fetchone()
    except Exception:
        long_kws = [kw for kw in keywords if len(kw) > 5][:5]
        if not long_kws:
            long_kws = keywords[:3]
        conditions = " OR ".join(["(s.topic LIKE ? OR s.text LIKE ?)"] * len(long_kws))
        params: list[str] = []
        for kw in long_kws:
            params.extend([f"%{kw}%", f"%{kw}%"])
        row = db.execute(
            f"""
            SELECT COUNT(DISTINCT s.speaker_name) AS cnt
            FROM speeches s
            WHERE ({conditions})
              AND s.speaker_name IS NOT NULL
              AND s.speaker_name != ''
            """,
            params,
        ).fetchone()
    return row["cnt"] if row else 0


# ── Claude narrative generation ──


def generate_narrative(
    topic: str,
    topic_key: str,
    total_speeches: int,
    mp_count: int,
    timeline: list[dict],
    top_speakers: list[dict],
    donations: dict,
    tvfy_scores: list[dict],
    quotes: list[dict],
    model: str = "claude-sonnet-4-20250514",
) -> dict:
    """Call Claude to generate narrative text for the investigation page.

    Returns a dict with keys:
        title, subtitle, intro, human_cost_items (list of {stat, label, src}),
        human_cost_context, timeline_narrative, donations_narrative,
        key_moments (list of {year, title, desc, outcome, outcomeColor}),
        action_items (list of {title, desc, link, linkText}),
        footer_note
    """
    client = Anthropic()

    # Build data summary for Claude
    timeline_summary = json.dumps(timeline[:10], indent=2) if timeline else "No timeline data"
    speakers_summary = json.dumps(top_speakers[:8], indent=2) if top_speakers else "No speaker data"
    donations_summary = json.dumps({
        "total_amount": donations.get("total_amount", 0),
        "top_donors": donations.get("top_donors", [])[:6],
        "party_totals": donations.get("party_totals", [])[:5],
    }, indent=2)
    tvfy_summary = json.dumps(tvfy_scores[:8], indent=2) if tvfy_scores else "No voting data"
    quotes_summary = json.dumps([
        {"speaker": q["speaker_name"], "party": q["party"], "date": q["date"],
         "text": q["text_preview"][:300]}
        for q in quotes[:6]
    ], indent=2) if quotes else "No quotes"

    prompt = textwrap.dedent(f"""\
    You are writing content for an investigative journalism page on the OPAX
    (Open Parliamentary Accountability eXchange) platform about "{topic}" in
    Australian politics.

    Here is the data from our parliamentary database:

    TOTAL SPEECHES: {total_speeches}
    DISTINCT MPs WHO SPOKE: {mp_count}
    TIMELINE (speeches by year, sample): {timeline_summary}
    TOP SPEAKERS: {speakers_summary}
    DONATIONS DATA: {donations_summary}
    VOTING SCORES (TVFY - higher = more supportive): {tvfy_summary}
    SAMPLE QUOTES: {quotes_summary}

    Generate the following as a JSON object. Be factual, citing real data above.
    Use an investigative journalism tone -- direct, evidence-based, no hedging.
    Australian English spelling.

    Return ONLY valid JSON with these keys:
    {{
      "title": "Short punchy title for the investigation (3-6 words)",
      "subtitle": "One-sentence tagline (investigative tone)",
      "intro": "2-3 sentence introduction paragraph describing the gap between rhetoric and action",
      "human_cost_items": [
        {{"stat": "e.g. 24K+", "label": "description of what this number means", "src": "data source"}}
      ],
      "human_cost_heading": "Section heading for the human cost / impact section",
      "human_cost_context": "A paragraph of context about why this topic matters to ordinary Australians",
      "timeline_narrative": "2-3 sentences describing what the timeline chart shows -- call out the peak year and any notable patterns",
      "donations_narrative": "2-3 sentences describing the donation patterns -- who gives to whom and what it means",
      "key_moments": [
        {{"year": "YYYY", "title": "Event name", "desc": "What happened and why it matters", "outcome": "Result (e.g. Passed, Blocked, Under review)", "outcomeColor": "#00843D for positive, #DC2626 for negative, #FFD700 for mixed"}}
      ],
      "action_items": [
        {{"title": "Action name", "desc": "Why and how to do this", "link": "URL", "linkText": "Link text"}}
      ],
      "footer_note": "Data sources attribution paragraph"
    }}

    IMPORTANT:
    - human_cost_items should have exactly 3 items with real statistics
    - key_moments should have 4-6 items spanning the timeline
    - action_items should have 4-6 items with real URLs where possible
    - Base everything on the data provided. If donation data is sparse, acknowledge it.
    - Do NOT invent statistics not supported by the data above.
    """)

    response = client.messages.create(
        model=model,
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text
    # Extract JSON from response (handle markdown code blocks)
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if json_match:
        text = json_match.group(1)
    # Try to parse
    return json.loads(text.strip())


# ── Select top quotes for the page via Claude ──


def select_quotes_via_claude(
    topic: str,
    quotes: list[dict],
    model: str = "claude-sonnet-4-20250514",
) -> list[dict]:
    """Use Claude to select and clean up the best quotes for display.

    Returns list of {speaker, party, date, text, context}.
    """
    if not quotes:
        return []

    client = Anthropic()

    quotes_data = json.dumps([
        {"speaker": q["speaker_name"], "party": q["party"], "date": q["date"],
         "text": q["text_preview"]}
        for q in quotes
    ], indent=2)

    prompt = textwrap.dedent(f"""\
    From these parliamentary speech excerpts about "{topic}", select the 6 most
    compelling and quotable passages. For each, extract a single powerful sentence
    or two that would work as a pull-quote on an investigation page.

    SPEECHES:
    {quotes_data}

    Return ONLY valid JSON -- an array of objects:
    [
      {{
        "speaker": "Full Name",
        "party": "Party Name (Labor/Liberal/Greens/Independent/etc)",
        "date": "DD Month YYYY",
        "text": "The extracted quote -- 1-3 sentences, verbatim from the speech where possible",
        "context": "for" or "against" (whether they spoke FOR reform/action or AGAINST it)
      }}
    ]

    Choose quotes that show a range of perspectives. Prefer quotes that are
    specific and data-driven over vague rhetoric.
    """)

    response = client.messages.create(
        model=model,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if json_match:
        text = json_match.group(1)
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        # Fallback: return raw quotes
        return [
            {
                "speaker": q["speaker_name"],
                "party": q["party"] or "Unknown",
                "date": q["date"] or "Unknown date",
                "text": q["text_preview"][:250],
                "context": "for",
            }
            for q in quotes[:6]
        ]


# ── Page template rendering ──


PARTY_COLORS = {
    "ALP": ("#E13A3A", "Labor"),
    "COA": ("#1C4FA0", "Coalition"),
    "GRN": ("#00843D", "Greens"),
    "IND": ("#888888", "Independent"),
    "Other": ("#7C3AED", "Other"),
}

PARTY_CHART_COLORS = {
    "Labor": "#E13A3A",
    "Liberal": "#1C4FA0",
    "Greens": "#00843D",
    "Nationals": "#006644",
    "Independent": "#888888",
    "Democrats": "#FFD700",
    "One Nation": "#F97316",
    "LNP": "#1C4FA0",
    "UAP": "#7C3AED",
}


def _fmt_money(amount: float) -> str:
    """Format a dollar amount for display."""
    if amount >= 1_000_000_000:
        return f"${amount / 1_000_000_000:.1f}B"
    if amount >= 1_000_000:
        return f"${amount / 1_000_000:.1f}M"
    if amount >= 1_000:
        return f"${amount / 1_000:.0f}K"
    return f"${amount:,.0f}"


def _escape_tsx(s: str) -> str:
    """Escape a string for use in TSX."""
    return (
        s.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("'", "\\'")
        .replace("`", "\\`")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _escape_tsx_text(s: str) -> str:
    """Escape a string for TSX text content (between tags)."""
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("'", "&apos;")
        .replace('"', "&quot;")
    )


def render_page(
    topic: str,
    topic_key: str,
    narrative: dict,
    timeline: list[dict],
    top_speakers: list[dict],
    donations: dict,
    tvfy_scores: list[dict],
    selected_quotes: list[dict],
    total_speeches: int,
    mp_count: int,
) -> str:
    """Render a complete Next.js page file."""

    # ── Build data constants ──
    timeline_json = json.dumps(timeline, indent=2)

    # Build donation flow data
    donor_flow = donations.get("donor_flow", [])
    donation_flow_json = json.dumps(
        [{"donor": d["donor"], "party": d["party"], "amount": round(d["amount"])}
         for d in donor_flow[:20]],
        indent=2,
    )

    top_donors_list = donations.get("top_donors", [])
    top_donors_json = json.dumps(
        [{"name": d["donor_name"], "total": round(d["total"]),
          "donations": d["donations"],
          "period": f"{d.get('first_year', '?')}-{d.get('last_year', '?')}"}
         for d in top_donors_list[:6]],
        indent=2,
    )

    # Party donation totals with colors
    party_totals = donations.get("party_totals", [])
    party_donations_json = json.dumps(
        [{"party": p["party"], "amount": round(p["total"]),
          "color": PARTY_CHART_COLORS.get(p["party"], "#888888")}
         for p in party_totals[:6]],
        indent=2,
    )

    # Quotes
    quotes_json = json.dumps(
        [{"speaker": q["speaker"], "party": q["party"], "photoId": "",
          "date": q["date"], "text": q["text"],
          "context": q.get("context", "for")}
         for q in selected_quotes[:6]],
        indent=2,
    )

    # Top speakers
    speakers_json = json.dumps(
        [{"name": s["speaker_name"], "party": s["party"] or "Unknown",
          "speeches": s["speech_count"], "photoId": ""}
         for s in top_speakers[:10]],
        indent=2,
    )

    # TVFY scores
    tvfy_json = json.dumps(
        [{"party": s["party"],
          "support": s["support"],
          "color": PARTY_CHART_COLORS.get(s["party"], "#888888"),
          "mps": s["mps"]}
         for s in tvfy_scores[:10]],
        indent=2,
    )

    # Key moments from narrative
    key_moments = narrative.get("key_moments", [])
    key_moments_json = json.dumps(key_moments, indent=2)

    # Human cost items
    human_cost_items = narrative.get("human_cost_items", [])
    human_cost_json = json.dumps(human_cost_items, indent=2)

    # Action items
    action_items = narrative.get("action_items", [])
    action_items_json = json.dumps(action_items, indent=2)

    # Escaped narrative strings
    title = narrative.get("title", topic.title())
    subtitle = narrative.get("subtitle", f"An OPAX investigation into {topic}")
    intro = narrative.get("intro", "")
    human_cost_heading = narrative.get("human_cost_heading", "The Human Cost")
    human_cost_context = narrative.get("human_cost_context", "")
    timeline_narrative = narrative.get("timeline_narrative", "")
    donations_narrative = narrative.get("donations_narrative", "")
    footer_note = narrative.get("footer_note", "")
    total_donations_fmt = _fmt_money(donations.get("total_amount", 0))

    has_donations = bool(donations.get("total_amount", 0) > 0)

    # Determine investigation number based on topic
    inv_numbers = {
        "gambling": "001", "housing": "002", "climate": "003",
        "media": "004", "indigenous_affairs": "005", "health": "006",
        "education": "007", "corruption": "008", "environment": "009",
    }
    inv_num = inv_numbers.get(topic_key, "010")

    # ── Render the page ──

    # Build the donation sections conditionally
    donation_section = ""
    if has_donations:
        donation_section = f"""
      {{/* -- Follow the Dollar -- */}}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Follow the Dollar
        </h2>
        <p className="text-sm text-[#8b949e] mb-2 max-w-2xl leading-relaxed">
          {_escape_tsx_text(donations_narrative)}
        </p>
        <p className="text-xs text-[#8b949e]/60 mb-6">
          Source: AEC annual returns. Amounts are declared donations only.
        </p>

        {{/* Stacked bar: donors by party */}}
        <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6 mb-6">
          <ResponsiveContainer width="100%" height={{340}}>
            <BarChart data={{donorByParty}} layout="vertical" margin={{{{ top: 4, right: 16, bottom: 4, left: 100 }}}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={{false}} />
              <XAxis type="number" tick={{{{ fill: "#8b949e", fontSize: 11 }}}} tickLine={{false}} axisLine={{false}} tickFormatter={{(v) => `${{(Number(v) / 1_000_000).toFixed(0)}}M`}} />
              <YAxis type="category" dataKey="donor" tick={{{{ fill: "#e6edf3", fontSize: 12 }}}} tickLine={{false}} axisLine={{false}} width={{100}} />
              <Tooltip contentStyle={{{{ backgroundColor: "#12121a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e6edf3", fontSize: 13 }}}} formatter={{(v) => `$${{Number(v).toLocaleString()}}`}} />
              <Legend wrapperStyle={{{{ fontSize: 12 }}}} iconType="square" iconSize={{10}} />
              {{donorParties.map((p: string) => (
                <Bar key={{p}} dataKey={{p}} stackId="a" fill={{partyColors[p] || "#888"}} name={{p}} />
              ))}}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {{/* Party totals */}}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {{PARTY_DONATIONS.slice(0, 3).map((p: {{ party: string; amount: number; color: string }}) => (
            <div key={{p.party}} className="rounded-xl border border-white/5 bg-[#12121a] p-5">
              <div className="flex items-center gap-2 mb-2">
                <PartyBadge party={{p.party}} />
              </div>
              <p className="text-2xl font-bold" style={{{{ color: p.color }}}}>
                {{`$${{(p.amount / 1_000_000).toFixed(1)}}M`}}
              </p>
              <p className="text-xs text-[#8b949e] mt-1">Total related donations received</p>
            </div>
          ))}}
        </div>

        {{/* Top donors list */}}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {{TOP_DONORS.map((d: {{ name: string; total: number; donations: number; period: string }}) => (
            <div key={{d.name}} className="rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-[#FFD700]/20 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-base font-semibold text-[#e6edf3]">{{d.name}}</h3>
                <span className="text-lg font-bold text-[#FFD700] shrink-0 ml-2">
                  {{`$${{(d.total / 1_000_000).toFixed(1)}}M`}}
                </span>
              </div>
              <p className="text-xs text-[#8b949e]">{{d.donations.toLocaleString()}} donations over {{d.period}}</p>
            </div>
          ))}}
        </div>
      </Section>"""

    tvfy_section = ""
    if tvfy_scores:
        tvfy_section = f"""
      {{/* -- Party Voting Record -- */}}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          How They Actually Vote
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
          Voting record scores from TheyVoteForYou.org.au. Higher percentage
          means more supportive of policy action on this issue.
        </p>
        <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
          <ResponsiveContainer width="100%" height={{Math.max(300, TVFY_SCORES.length * 48)}}>
            <BarChart data={{TVFY_SCORES}} layout="vertical" margin={{{{ top: 4, right: 24, bottom: 4, left: 100 }}}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={{false}} />
              <XAxis type="number" domain={{[0, 100]}} tick={{{{ fill: "#8b949e", fontSize: 11 }}}} tickLine={{false}} axisLine={{false}} tickFormatter={{(v) => `${{v}}%`}} />
              <YAxis type="category" dataKey="party" tick={{{{ fill: "#e6edf3", fontSize: 12 }}}} tickLine={{false}} axisLine={{false}} width={{100}} />
              <Tooltip contentStyle={{{{ backgroundColor: "#12121a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e6edf3", fontSize: 13 }}}} formatter={{(v) => `${{v}}% support`}} />
              <Bar dataKey="support" name="Support %">
                {{TVFY_SCORES.map((entry: {{ party: string; color: string }}, idx: number) => (
                  <Cell key={{idx}} fill={{entry.color}} />
                ))}}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-[#8b949e]/60 mt-3">
          Source: TheyVoteForYou.org.au. Scores based on parliamentary division voting records.
        </p>
      </Section>"""

    page = f'''"use client";

import {{ useState, useEffect, useRef }} from "react";
import {{
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
}} from "recharts";
import {{ PartyBadge }} from "@/components/party-badge";

/* == Data generated from parli.db == */

const TIMELINE = {timeline_json};

const DONATION_FLOW = {donation_flow_json};

const TOP_DONORS = {top_donors_json};

const PARTY_DONATIONS = {party_donations_json};

const REAL_QUOTES = {quotes_json};

const TOP_SPEAKERS = {speakers_json};

const TVFY_SCORES = {tvfy_json};

const KEY_MOMENTS = {key_moments_json};

const HUMAN_COST = {human_cost_json};

const ACTION_ITEMS = {action_items_json};

/* == Scroll-triggered visibility hook == */
function useScrollReveal() {{
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {{
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {{ if (entry.isIntersecting) {{ setVisible(true); obs.disconnect(); }} }},
      {{ threshold: 0.12 }}
    );
    obs.observe(el);
    return () => obs.disconnect();
  }}, []);
  return {{ ref, visible }};
}}

function Section({{ children, className = "" }}: {{ children: React.ReactNode; className?: string }}) {{
  const {{ ref, visible }} = useScrollReveal();
  return (
    <section
      ref={{ref}}
      className={{`py-14 transition-all duration-700 ease-out ${{visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}} ${{className}}`}}
    >
      {{children}}
    </section>
  );
}}

/* == Helpers == */
const partyColors: Record<string, string> = {{
  Labor: "#E13A3A", Liberal: "#1C4FA0", Greens: "#00843D",
  Nationals: "#006644", Independent: "#888888", ALP: "#E13A3A",
  "One Nation": "#F97316", Democrats: "#FFD700", LNP: "#1C4FA0",
  UAP: "#7C3AED", COA: "#1C4FA0",
}};

/* == Stacked bar data for Follow the Dollar == */
function buildDonorByParty() {{
  const donors = [...new Set(DONATION_FLOW.map((d: {{ donor: string }}) => d.donor))];
  return donors.map((donor) => {{
    const row: Record<string, string | number> = {{ donor }};
    let total = 0;
    for (const entry of DONATION_FLOW.filter((d: {{ donor: string }}) => d.donor === donor)) {{
      row[entry.party] = entry.amount;
      total += entry.amount;
    }}
    row.total = total;
    return row;
  }}).sort((a, b) => (b.total as number) - (a.total as number));
}}

export default function InvestigationPage() {{
  const donorByParty = buildDonorByParty();
  const donorParties = [...new Set(DONATION_FLOW.map((d: {{ party: string }}) => d.party))];
  const maxSpeaker = TOP_SPEAKERS.length > 0 ? TOP_SPEAKERS[0].speeches : 1;

  return (
    <div className="mx-auto max-w-6xl px-6">
      {{/* -- Hero -- */}}
      <section className="pt-16 pb-12 animate-fade-in-up">
        <p className="text-sm uppercase tracking-[0.2em] text-[#FFD700] mb-4 font-medium">
          Deep Dive &mdash; Investigation {inv_num}
        </p>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#e6edf3] leading-[1.1] mb-4 max-w-4xl">
          {_escape_tsx_text(title)}
        </h1>
        <p className="text-lg text-[#8b949e] max-w-2xl leading-relaxed mb-10">
          {_escape_tsx_text(subtitle)}
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">{total_speeches:,}</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">Speeches</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">{mp_count}</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">MPs Spoke</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">{total_donations_fmt}</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">Related Donations</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-[#FFD700]">{timeline[0]["year"] if timeline else "?"}&ndash;{timeline[-1]["year"] if timeline else "?"}</p>
            <p className="text-xs text-[#8b949e] mt-1 uppercase tracking-wider">Time Span</p>
          </div>
        </div>
      </section>

      {{/* -- The Human Cost / Impact -- */}}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          {_escape_tsx_text(human_cost_heading)}
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          {_escape_tsx_text(intro)}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {{HUMAN_COST.map((d: {{ stat: string; label: string; src: string }}) => (
            <div key={{d.stat}} className="rounded-xl border border-white/5 bg-[#12121a] p-6 group hover:border-[#DC2626]/20 transition-colors">
              <p className="text-3xl md:text-4xl font-bold text-[#DC2626] mb-2">{{d.stat}}</p>
              <p className="text-sm text-[#e6edf3]/80 leading-relaxed mb-3">{{d.label}}</p>
              <p className="text-xs text-[#8b949e]/60">{{d.src}}</p>
            </div>
          ))}}
        </div>
        <div className="mt-6 rounded-xl border border-[#DC2626]/10 bg-[#DC2626]/5 p-5">
          <p className="text-sm text-[#e6edf3]/70 leading-relaxed">
            {_escape_tsx_text(human_cost_context)}
          </p>
        </div>
      </Section>

      {{/* -- Timeline -- */}}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Parliamentary Debate Over Time
        </h2>
        <p className="text-sm text-[#8b949e] mb-2 max-w-2xl leading-relaxed">
          {_escape_tsx_text(timeline_narrative)}
        </p>
        <p className="text-xs text-[#8b949e]/60 mb-6">
          Source: Hansard (parlinfo.aph.gov.au)
        </p>
        <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
          <ResponsiveContainer width="100%" height={{380}}>
            <BarChart data={{TIMELINE}} margin={{{{ top: 8, right: 8, bottom: 0, left: -16 }}}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={{false}} />
              <XAxis dataKey="year" tick={{{{ fill: "#8b949e", fontSize: 11 }}}} tickLine={{false}} axisLine={{{{ stroke: "rgba(255,255,255,0.1)" }}}} interval={{2}} />
              <YAxis tick={{{{ fill: "#8b949e", fontSize: 11 }}}} tickLine={{false}} axisLine={{false}} />
              <Tooltip contentStyle={{{{ backgroundColor: "#12121a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e6edf3", fontSize: 13 }}}} cursor={{{{ fill: "rgba(255,215,0,0.05)" }}}} labelFormatter={{(l) => `Year: ${{l}}`}} />
              <Legend wrapperStyle={{{{ fontSize: 12, color: "#8b949e" }}}} iconType="square" iconSize={{10}} />
              <Bar dataKey="ALP" stackId="a" fill="#E13A3A" name="Labor" />
              <Bar dataKey="COA" stackId="a" fill="#1C4FA0" name="Coalition" />
              <Bar dataKey="GRN" stackId="a" fill="#00843D" name="Greens" />
              <Bar dataKey="IND" stackId="a" fill="#888888" name="Independent" />
              <Bar dataKey="Other" stackId="a" fill="#7C3AED" name="Other" radius={{[3, 3, 0, 0]}} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {{/* -- Key Moments -- */}}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Key Moments
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          The turning points, broken promises, and moments of progress.
        </p>
        <div className="relative pl-8 md:pl-12">
          <div className="absolute left-3 md:left-5 top-0 bottom-0 w-px bg-gradient-to-b from-[#FFD700]/60 via-[#FFD700]/20 to-transparent" />
          <div className="space-y-8">
            {{KEY_MOMENTS.map((m: {{ year: string; title: string; desc: string; outcome: string; outcomeColor: string }}) => (
              <div key={{m.year}} className="relative group">
                <div
                  className="absolute -left-[21px] md:-left-[29px] top-1 w-3 h-3 rounded-full border-2 border-[#0a0a0f]"
                  style={{{{ backgroundColor: m.outcomeColor }}}}
                />
                <div className="rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm font-bold text-[#FFD700]">{{m.year}}</span>
                    <h3 className="text-base font-semibold text-[#e6edf3]">{{m.title}}</h3>
                  </div>
                  <p className="text-sm text-[#8b949e] leading-relaxed mb-3">{{m.desc}}</p>
                  <span
                    className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide"
                    style={{{{ color: m.outcomeColor, backgroundColor: `${{m.outcomeColor}}15` }}}}
                  >
                    {{m.outcome}}
                  </span>
                </div>
              </div>
            ))}}
          </div>
        </div>
      </Section>
{donation_section}
{tvfy_section}

      {{/* -- In Their Own Words -- */}}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          In Their Own Words
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          Direct quotes from the parliamentary record &mdash; sourced from Hansard.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {{REAL_QUOTES.map((q: {{ speaker: string; party: string; photoId: string; date: string; text: string; context: string }}, i: number) => {{
            const ctxColor = q.context === "for" ? "#00843D" : "#DC2626";
            const ctxBg = q.context === "for" ? "rgba(0,132,61,0.1)" : "rgba(220,38,38,0.1)";
            const ctxLabel = q.context === "for" ? "Spoke FOR action" : "Spoke AGAINST action";
            return (
              <div key={{i}} className="rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-white/10 transition-colors">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[#e6edf3]">{{q.speaker}}</span>
                      <PartyBadge party={{q.party}} />
                    </div>
                    <p className="text-xs text-[#8b949e]">{{q.date}}</p>
                  </div>
                </div>
                <blockquote className="text-sm text-[#e6edf3]/80 italic leading-relaxed mb-4 pl-4 border-l-2 border-[#FFD700]/30">
                  &ldquo;{{q.text}}&rdquo;
                </blockquote>
                <span
                  className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide"
                  style={{{{ color: ctxColor, backgroundColor: ctxBg }}}}
                >
                  {{ctxLabel}}
                </span>
              </div>
            );
          }})}}
        </div>
      </Section>

      {{/* -- Who Spoke Most -- */}}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          Who Spoke Most?
        </h2>
        <p className="text-sm text-[#8b949e] mb-6 max-w-2xl leading-relaxed">
          The MPs who spoke most frequently on this issue. Speaking volume does
          not equal commitment to action.
        </p>
        <div className="rounded-xl border border-white/5 bg-[#12121a] p-4 md:p-6">
          <div className="space-y-3">
            {{TOP_SPEAKERS.map((mp: {{ name: string; party: string; speeches: number; photoId: string }}, i: number) => {{
              const barWidth = (mp.speeches / maxSpeaker) * 100;
              return (
                <div key={{mp.name}} className="flex items-center gap-3 group">
                  <span className="text-xs text-[#8b949e] w-4 shrink-0 text-right">{{i + 1}}</span>
                  <div className="w-7 h-7 rounded-full bg-white/5 shrink-0" />
                  <div className="w-36 shrink-0">
                    <span className="text-sm text-[#e6edf3] font-medium">{{mp.name}}</span>
                  </div>
                  <PartyBadge party={{mp.party}} />
                  <div className="flex-1 relative">
                    <div className="h-5 rounded bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded transition-all duration-700"
                        style={{{{
                          width: `${{barWidth}}%`,
                          backgroundColor: partyColors[mp.party] || "#888",
                          opacity: 0.7,
                        }}}}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-[#e6edf3] w-8 text-right shrink-0">{{mp.speeches}}</span>
                </div>
              );
            }})}}
          </div>
        </div>
      </Section>

      {{/* -- What Can You Do? -- */}}
      <Section className="pb-20">
        <h2 className="text-2xl md:text-3xl font-bold text-[#e6edf3] mb-2">
          What Can You Do?
        </h2>
        <p className="text-sm text-[#8b949e] mb-8 max-w-2xl leading-relaxed">
          This data is a tool for citizen engagement. Here is how you can act.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {{ACTION_ITEMS.map((a: {{ title: string; desc: string; link: string; linkText: string }}) => (
            <a
              key={{a.title}}
              href={{a.link}}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-xl border border-white/5 bg-[#12121a] p-5 hover:border-[#FFD700]/30 transition-all hover:bg-[#16161f]"
            >
              <h3 className="text-base font-semibold text-[#e6edf3] mb-2 group-hover:text-[#FFD700] transition-colors">
                {{a.title}}
              </h3>
              <p className="text-sm text-[#8b949e] leading-relaxed mb-3">{{a.desc}}</p>
              <span className="text-sm text-[#FFD700] font-medium group-hover:underline">
                {{a.linkText}} &rarr;
              </span>
            </a>
          ))}}
        </div>

        {{/* Footer note */}}
        <div className="mt-12 border-t border-white/5 pt-8 text-center">
          <p className="text-xs text-[#8b949e]/60 max-w-xl mx-auto leading-relaxed">
            {_escape_tsx_text(footer_note)}
          </p>
        </div>
      </Section>
    </div>
  );
}}
'''

    return page


# ── Main entry point ──


def _generate_fallback_narrative(
    topic: str,
    topic_key: str,
    total_speeches: int,
    mp_count: int,
    timeline: list[dict],
    top_speakers: list[dict],
    donations: dict,
    tvfy_scores: list[dict],
    quotes: list[dict],
) -> dict:
    """Generate fallback narrative data without calling Claude API."""
    total_donations_fmt = _fmt_money(donations.get("total_amount", 0))
    peak_year = max(timeline, key=lambda d: sum(v for k, v in d.items() if k != "year")) if timeline else {"year": "?"}
    topic_title = topic.title()

    return {
        "title": f"{topic_title}: Follow the Record",
        "subtitle": f"{total_speeches:,} speeches. {total_donations_fmt} in related donations. What changed?",
        "intro": (
            f"For over two decades, Australian MPs have debated {topic.lower()} in Parliament. "
            f"{total_speeches:,} speeches from {mp_count} MPs tell a story of rhetoric that often "
            f"outpaces legislative action."
        ),
        "human_cost_items": [
            {"stat": f"{total_speeches:,}", "label": f"Parliamentary speeches about {topic.lower()}", "src": "Hansard parliamentary record"},
            {"stat": str(mp_count), "label": f"Distinct MPs who spoke on {topic.lower()}", "src": "Hansard parliamentary record"},
            {"stat": total_donations_fmt, "label": f"In related industry donations to political parties", "src": "AEC annual returns"},
        ],
        "human_cost_heading": "Why It Matters",
        "human_cost_context": (
            f"The parliamentary record on {topic.lower()} reveals a pattern common across Australian politics: "
            f"passionate debate in the chamber paired with limited legislative progress. "
            f"Understanding this gap is the first step toward accountability."
        ),
        "timeline_narrative": (
            f"Speeches about {topic.lower()} peaked in {peak_year['year']}, "
            f"driven by major policy debates of the era. The volume of parliamentary discussion "
            f"has fluctuated significantly, often spiking around elections and key legislative moments."
        ),
        "donations_narrative": (
            f"A total of {total_donations_fmt} in related donations flowed to political parties. "
            f"The data reveals which industries have the deepest financial ties to the parties "
            f"that shape policy on this issue."
        ),
        "key_moments": [
            {"year": str(timeline[0]["year"]) if timeline else "1998", "title": f"Early {topic_title} Debates",
             "desc": f"Parliamentary discussion of {topic.lower()} begins in earnest.",
             "outcome": "Ongoing debate", "outcomeColor": "#FFD700"},
            {"year": str(peak_year["year"]), "title": f"Peak Parliamentary Interest",
             "desc": f"The year with the most speeches on {topic.lower()}, reflecting heightened public concern.",
             "outcome": "Heightened scrutiny", "outcomeColor": "#FFD700"},
            {"year": str(timeline[-1]["year"]) if timeline else "2022", "title": "Current State",
             "desc": f"Where the parliamentary debate on {topic.lower()} stands today.",
             "outcome": "Under review", "outcomeColor": "#FFD700"},
        ],
        "action_items": [
            {"title": "Contact Your MP", "desc": f"Tell your representative you care about {topic.lower()} policy.",
             "link": "https://www.openaustralia.org.au/", "linkText": "Find your MP"},
            {"title": "Check Donation Records", "desc": "See who funds your local member.",
             "link": "https://transparency.aec.gov.au/", "linkText": "AEC Transparency Register"},
            {"title": "Read the Hansard", "desc": f"Read what your MP actually said about {topic.lower()}.",
             "link": "https://www.aph.gov.au/Parliamentary_Business/Hansard", "linkText": "Parliamentary Hansard"},
            {"title": "Share This Investigation", "desc": "Help others understand the gap between rhetoric and action.",
             "link": "#", "linkText": "Copy link"},
        ],
        "footer_note": (
            f"This investigation uses data from Hansard (parlinfo.aph.gov.au), the "
            f"Australian Electoral Commission transparency register, and TheyVoteForYou.org.au. "
            f"All speech data is sourced from the official parliamentary record. "
            f"OPAX is an independent, non-partisan project."
        ),
    }


def _generate_fallback_quotes(quotes: list[dict]) -> list[dict]:
    """Generate fallback quote selection without calling Claude API."""
    return [
        {
            "speaker": q["speaker_name"],
            "party": q["party"] or "Unknown",
            "date": q["date"] or "Unknown date",
            "text": q["text_preview"][:250],
            "context": "for",
        }
        for q in quotes[:6]
    ]


def run(topic: str, output: str, model: str = "claude-sonnet-4-20250514",
        dry_run: bool = False) -> None:
    """Run the full investigation page generation pipeline."""
    topic_key = _resolve_topic_key(topic)
    print(f"Generating investigation for topic: {topic!r} (key: {topic_key})")

    # 1. Query all data
    print("  Querying speech timeline...")
    timeline = query_speech_timeline(topic_key)
    total_speeches = sum(
        d["ALP"] + d["COA"] + d["GRN"] + d["IND"] + d["Other"]
        for d in timeline
    )
    print(f"    {total_speeches:,} speeches across {len(timeline)} years")

    print("  Querying MP count...")
    mp_count = query_mp_count(topic_key)
    print(f"    {mp_count} distinct MPs")

    print("  Querying top speakers...")
    top_speakers = query_top_speakers(topic_key)
    print(f"    Top speaker: {top_speakers[0]['speaker_name'] if top_speakers else 'N/A'}")

    print("  Querying quotes...")
    quotes = query_top_quotes(topic_key)
    print(f"    {len(quotes)} candidate quotes")

    print("  Querying donations...")
    donations = query_donations(topic_key)
    print(f"    {_fmt_money(donations['total_amount'])} total donations, "
          f"{len(donations['top_donors'])} top donors")

    print("  Querying TVFY voting scores...")
    tvfy_scores = query_tvfy_policy(topic_key)
    print(f"    {len(tvfy_scores)} party scores")

    # 2. Generate narrative (Claude API or fallback)
    if dry_run:
        print("  Generating fallback narrative (dry-run, no API call)...")
        narrative = _generate_fallback_narrative(
            topic=topic, topic_key=topic_key,
            total_speeches=total_speeches, mp_count=mp_count,
            timeline=timeline, top_speakers=top_speakers,
            donations=donations, tvfy_scores=tvfy_scores, quotes=quotes,
        )
        print("  Selecting quotes (dry-run, no API call)...")
        selected_quotes = _generate_fallback_quotes(quotes)
    else:
        print(f"  Generating narrative via Claude ({model})...")
        narrative = generate_narrative(
            topic=topic,
            topic_key=topic_key,
            total_speeches=total_speeches,
            mp_count=mp_count,
            timeline=timeline,
            top_speakers=top_speakers,
            donations=donations,
            tvfy_scores=tvfy_scores,
            quotes=quotes,
            model=model,
        )
        print(f"    Title: {narrative.get('title', 'N/A')}")

        print("  Selecting best quotes via Claude...")
        selected_quotes = select_quotes_via_claude(topic, quotes, model=model)
    print(f"    Selected {len(selected_quotes)} quotes")

    # 4. Render the page
    print("  Rendering page...")
    page_content = render_page(
        topic=topic,
        topic_key=topic_key,
        narrative=narrative,
        timeline=timeline,
        top_speakers=top_speakers,
        donations=donations,
        tvfy_scores=tvfy_scores,
        selected_quotes=selected_quotes,
        total_speeches=total_speeches,
        mp_count=mp_count,
    )

    # 5. Write the file
    output_path = Path(output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(page_content)
    print(f"\n  Written to: {output_path}")
    print(f"  File size: {len(page_content):,} bytes")
    print("  Done!")


def main():
    parser = argparse.ArgumentParser(
        description="Generate an OPAX investigation page from parliamentary data"
    )
    parser.add_argument(
        "--topic", required=True,
        help="Topic name (e.g., 'media ownership', 'indigenous affairs')",
    )
    parser.add_argument(
        "--output", required=True,
        help="Output path for the generated page (e.g., opax/src/app/media/page.tsx)",
    )
    parser.add_argument(
        "--model", default="claude-sonnet-4-20250514",
        help="Claude model to use for narrative generation",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Generate page with fallback narrative (no API call)",
    )
    args = parser.parse_args()
    run(args.topic, args.output, args.model, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
