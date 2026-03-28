"""
parli.rag — Retrieval-Augmented Generation over Australian parliamentary data.

Retrieves relevant speeches, donations, and voting records from the parli.db
database, constructs a context prompt, and queries Claude to generate an
evidence-based answer with citations.

Usage:
    python -m parli.rag "Which MPs spoke most about gambling reform but voted against restrictions?"
    python -m parli.rag --context-only "donations to the Liberal Party from mining companies"
"""

import json
import re
import textwrap
from collections import defaultdict

from anthropic import Anthropic

from parli.schema import get_db
from parli.search import hybrid_search


SYSTEM_PROMPT = textwrap.dedent("""\
    You are OPAX, an investigative parliamentary analyst for the Open
    Parliamentary Accountability eXchange. You expose governance blind spots
    by cross-referencing what Australian politicians say, how they vote, and
    who funds them.

    Your style is direct investigative journalism. Follow these rules:

    1. LEAD WITH THE MOST DAMNING FINDING. Start your answer with the single
       most striking contradiction, largest undisclosed connection, or most
       newsworthy fact from the data. Don't bury the lede.

    2. ALWAYS CITE SPECIFICS. Every claim must include:
       - Speaker name and exact date for Hansard quotes (e.g., "Peter Dutton, 14 Mar 2023")
       - Dollar amounts for donations (e.g., "$2.3M from Tabcorp to the ALP")
       - Vote counts and division names for parliamentary votes
       - Policy agreement percentages from TheyVoteForYou where available

    3. CROSS-REFERENCE RHETORIC vs RECORD. When an MP speaks on a topic,
       compare what they said to how they actually voted. Flag contradictions
       explicitly: "Despite calling for X, [MP] voted against Y."

    4. FOLLOW THE MONEY. When donation data is available:
       - Always state total industry donations to each party
       - Name the top donors and amounts
       - Connect donations to voting patterns where the data supports it

    5. NAME NAMES. Don't hide behind vague language like "some MPs" or
       "certain parties." If the data identifies them, name them.

    6. END WITH A BOTTOM LINE. Close every answer with a "**Bottom line:**"
       paragraph that gives the reader the single most important takeaway
       in 1-2 sentences.

    7. ONLY use the parliamentary data provided below. Do not use outside
       knowledge. If the data is insufficient, say so explicitly and explain
       what additional data would be needed.

    8. Use plain language. No hedging unless the data genuinely conflicts.
""")


def _extract_keywords(question: str) -> list[str]:
    """Extract likely search keywords from a question for donation/vote queries."""
    stopwords = {
        "which", "what", "who", "how", "why", "when", "where", "did", "does",
        "do", "is", "are", "was", "were", "the", "a", "an", "and", "or", "but",
        "in", "on", "at", "to", "for", "of", "with", "by", "from", "about",
        "most", "many", "much", "more", "has", "have", "had", "been", "their",
        "them", "they", "that", "this", "those", "these", "any", "some", "all",
        "not", "against", "voted", "spoke", "said", "spoke", "speaking",
        "took", "money", "mps", "senators", "members",
    }
    words = re.findall(r"[a-zA-Z]+", question.lower())
    return [w for w in words if w not in stopwords and len(w) > 2]


# Map topic keywords to known donor names and division keywords
TOPIC_DONOR_MAP = {
    "gambling": ["tabcorp", "sportsbet", "clubs nsw", "clubs australia",
                 "star entertainment", "crown", "aristocrat", "pokies",
                 "gaming", "wagering", "betting", "responsible wagering",
                 "bet365", "entain", "flutter", "ladbrokes", "lotteries", "tatts"],
    "mining": ["bhp", "rio tinto", "glencore", "woodside", "santos",
               "mineral", "coal", "fortescue", "hancock"],
    "fossil": ["bhp", "woodside", "santos", "coal", "petroleum", "gas",
               "fossil", "energy producers"],
    "housing": ["property", "developer", "real estate", "construction",
                "housing industry"],
    "climate": ["fossil", "coal", "petroleum", "renewable", "carbon"],
    "media": ["news corp", "nine entertainment", "seven west", "foxtel"],
}

TOPIC_DIVISION_MAP = {
    "gambling": ["gambling", "gaming", "wagering", "poker machine", "betting"],
    "climate": ["carbon", "climate", "emissions", "renewable", "fossil fuel"],
    "housing": ["housing", "affordable", "rent", "homelessness"],
    "corruption": ["corruption", "integrity", "icac", "anti-corruption"],
    "media": ["media", "broadcasting", "ownership"],
}


def _detect_topics(question: str) -> list[str]:
    """Detect which policy topics a question relates to."""
    q = question.lower()
    topics = []
    topic_keywords = {
        "gambling": ["gambling", "gambl", "pokies", "poker machine", "betting", "wagering", "casino"],
        "mining": ["mining", "mineral", "coal", "iron ore"],
        "fossil": ["fossil fuel", "oil", "gas", "petroleum"],
        "housing": ["housing", "rent", "homelessness", "affordable home", "property"],
        "climate": ["climate", "carbon", "emissions", "renewable", "global warming", "net zero"],
        "immigration": ["immigration", "visa", "migration", "refugee", "asylum", "border"],
        "health": ["health", "hospital", "medicare", "medical", "pharmaceutical", "mental health", "ndis"],
        "education": ["education", "school", "university", "student", "teacher", "tafe"],
        "economy": ["economy", "budget", "gdp", "inflation", "interest rate", "employment", "unemployment"],
        "defence": ["defence", "defense", "military", "army", "navy", "aukus", "veteran", "national security"],
        "indigenous_affairs": ["indigenous", "aboriginal", "first nations", "closing the gap", "native title"],
        "corruption": ["corruption", "integrity", "icac", "anti-corruption", "nacc", "transparency"],
        "media": ["media", "broadcasting", "news corp", "abc funding", "press freedom"],
        "environment": ["environment", "biodiversity", "conservation", "pollution", "reef"],
        "taxation": ["taxation", "tax", "gst", "income tax", "capital gains", "superannuation"],
        "infrastructure": ["infrastructure", "road", "rail", "transport", "nbn", "broadband"],
        "foreign_affairs": ["foreign affairs", "diplomacy", "trade agreement", "china", "pacific"],
        "cost_of_living": ["cost of living", "grocery", "energy price", "fuel", "electricity", "affordability"],
    }
    for topic, kws in topic_keywords.items():
        if any(kw in q for kw in kws):
            topics.append(topic)
    return topics


def _get_donation_context(question: str, limit: int = 15) -> tuple[str, dict]:
    """Query donations table for data relevant to the question.

    Returns (formatted_text, metadata) where metadata contains aggregated stats.
    """
    db = get_db()
    conditions = []
    params = []
    metadata: dict = {"total_amount": 0, "donor_count": 0, "top_donors": [], "by_industry": {}}

    # First check topic-specific donor names
    topics = _detect_topics(question)
    for topic in topics:
        donor_names = TOPIC_DONOR_MAP.get(topic, [])
        for name in donor_names:
            conditions.append("LOWER(donor_name) LIKE ?")
            params.append(f"%{name}%")

    # Also try generic keyword matching as fallback
    if not conditions:
        keywords = _extract_keywords(question)
        if not keywords:
            return "", metadata
        for kw in keywords:
            like = f"%{kw}%"
            conditions.append(
                "(donor_name LIKE ? OR recipient LIKE ? OR industry LIKE ?)"
            )
            params.extend([like, like, like])

    if not conditions:
        return "", metadata

    where = " OR ".join(conditions)

    # Get aggregated totals by industry to each party
    agg_rows = db.execute(
        f"""
        SELECT industry, recipient, SUM(amount) AS total, COUNT(*) AS cnt
        FROM donations
        WHERE ({where}) AND industry IS NOT NULL AND industry != '' AND amount IS NOT NULL
        GROUP BY industry, recipient
        ORDER BY total DESC
        LIMIT 30
        """,
        params,
    ).fetchall()

    # Get top 5 individual donors
    top_donor_rows = db.execute(
        f"""
        SELECT donor_name, SUM(amount) AS total, recipient,
               COUNT(*) AS donation_count,
               MIN(financial_year) AS first_year,
               MAX(financial_year) AS last_year
        FROM donations
        WHERE {where} AND amount IS NOT NULL
        GROUP BY donor_name
        ORDER BY total DESC
        LIMIT 5
        """,
        params,
    ).fetchall()

    # Get year-over-year totals
    yoy_rows = db.execute(
        f"""
        SELECT financial_year, SUM(amount) AS total, COUNT(*) AS cnt
        FROM donations
        WHERE ({where}) AND financial_year IS NOT NULL AND amount IS NOT NULL
        GROUP BY financial_year
        ORDER BY financial_year
        """,
        params,
    ).fetchall()

    if not agg_rows and not top_donor_rows:
        return "", metadata

    lines = ["## Relevant Donation Records\n"]

    # Industry-to-party aggregation
    if agg_rows:
        lines.append("### Total Donations by Industry to Each Party\n")
        industry_party: dict[str, dict[str, float]] = {}
        grand_total = 0.0
        for r in agg_rows:
            ind = r["industry"]
            recip = r["recipient"]
            if ind not in industry_party:
                industry_party[ind] = {}
            industry_party[ind][recip] = r["total"]
            grand_total += r["total"]

        for ind, parties in sorted(industry_party.items(), key=lambda x: -sum(x[1].values())):
            ind_total = sum(parties.values())
            parts = ", ".join(
                f"${v:,.0f} to {k}" for k, v in sorted(parties.items(), key=lambda x: -x[1])
            )
            lines.append(f"- **{ind}** (${ind_total:,.0f} total): {parts}")
            metadata["by_industry"][ind] = {
                "total": ind_total,
                "parties": {k: v for k, v in parties.items()},
            }

        metadata["total_amount"] = grand_total
        lines.append("")

    # Top 5 donors
    if top_donor_rows:
        lines.append("### Top 5 Individual Donors\n")
        for r in top_donor_rows:
            amt = f"${r['total']:,.0f}" if r["total"] else "undisclosed"
            year_range = f"{r['first_year'] or '?'}-{r['last_year'] or '?'}"
            lines.append(
                f"- **{r['donor_name']}**: {amt} to {r['recipient']} "
                f"({r['donation_count']} donations, {year_range})"
            )
            metadata["top_donors"].append({
                "name": r["donor_name"],
                "total": r["total"],
                "recipient": r["recipient"],
            })
        metadata["donor_count"] = len(top_donor_rows)
        lines.append("")

    # Year-over-year trend
    if yoy_rows and len(yoy_rows) > 1:
        lines.append("### Year-over-Year Trend\n")
        for r in yoy_rows:
            lines.append(f"- {r['financial_year']}: ${r['total']:,.0f} ({r['cnt']} donations)")
        lines.append("")

    return "\n".join(lines), metadata


def _get_voting_context(question: str, limit: int = 10) -> tuple[str, dict]:
    """Query divisions/votes for data relevant to the question.

    Returns (formatted_text, metadata) with vote counts.
    """
    db = get_db()
    conditions = []
    params = []
    metadata: dict = {"division_count": 0}

    # Topic-specific division keywords
    topics = _detect_topics(question)
    for topic in topics:
        div_keywords = TOPIC_DIVISION_MAP.get(topic, [])
        for kw in div_keywords:
            conditions.append("(d.name LIKE ? OR d.summary LIKE ?)")
            params.extend([f"%{kw}%", f"%{kw}%"])

    # Fallback to generic keywords
    if not conditions:
        keywords = _extract_keywords(question)
        if not keywords:
            return "", metadata
        for kw in keywords:
            conditions.append("(d.name LIKE ? OR d.summary LIKE ?)")
            params.extend([f"%{kw}%", f"%{kw}%"])

    if not conditions:
        return "", metadata

    where = " OR ".join(conditions)
    rows = db.execute(
        f"""
        SELECT d.name, d.date, d.aye_votes, d.no_votes, d.rebellions, d.summary
        FROM divisions d
        WHERE {where}
        ORDER BY d.date DESC
        LIMIT ?
        """,
        params + [limit],
    ).fetchall()

    if not rows:
        return "", metadata

    metadata["division_count"] = len(rows)

    lines = ["## Relevant Parliamentary Votes\n"]
    for r in rows:
        summary = (r["summary"] or "")[:200]
        lines.append(
            f"- {r['name']} ({r['date']}): "
            f"Ayes {r['aye_votes'] or '?'}, Noes {r['no_votes'] or '?'}, "
            f"Rebellions {r['rebellions'] or 0}"
        )
        if summary:
            lines.append(f"  Summary: {summary}")
    return "\n".join(lines), metadata


def _extract_mp_names(question: str) -> list[dict]:
    """Try to find MP names mentioned in the question by matching against members table."""
    db = get_db()
    words = question.split()
    matches = []
    # Try two-word and three-word combinations as potential names
    for n in (3, 2):
        for i in range(len(words) - n + 1):
            candidate = " ".join(words[i:i + n])
            # Skip very short or stopword-heavy candidates
            if len(candidate) < 5:
                continue
            row = db.execute(
                "SELECT person_id, full_name, party FROM members WHERE full_name LIKE ? LIMIT 1",
                (f"%{candidate}%",),
            ).fetchone()
            if row and row["person_id"] not in [m["person_id"] for m in matches]:
                matches.append(dict(row))
    return matches


def _get_mp_speech_vote_crossref(question: str, speeches: list[dict]) -> str:
    """Cross-reference speeches with voting records for mentioned MPs.

    When an MP spoke on a topic, find how they voted on related divisions.
    This enables Claude to spot contradictions between rhetoric and action.
    """
    db = get_db()

    # Collect unique speaker person_ids from speeches
    speaker_ids = set()
    speaker_names: dict[str, str] = {}  # person_id -> name
    for s in speeches:
        pid = s.get("person_id")
        if pid:
            speaker_ids.add(pid)
            speaker_names[pid] = s.get("speaker_name", "Unknown")

    # Also check for explicitly mentioned MPs
    mentioned = _extract_mp_names(question)
    for m in mentioned:
        speaker_ids.add(m["person_id"])
        speaker_names[m["person_id"]] = m["full_name"]

    if not speaker_ids:
        return ""

    # Find relevant divisions based on topic
    topics = _detect_topics(question)
    div_conditions = []
    div_params = []
    for topic in topics:
        div_keywords = TOPIC_DIVISION_MAP.get(topic, [])
        for kw in div_keywords:
            div_conditions.append("(d.name LIKE ? OR d.summary LIKE ?)")
            div_params.extend([f"%{kw}%", f"%{kw}%"])

    if not div_conditions:
        keywords = _extract_keywords(question)
        for kw in keywords[:5]:
            div_conditions.append("(d.name LIKE ? OR d.summary LIKE ?)")
            div_params.extend([f"%{kw}%", f"%{kw}%"])

    if not div_conditions:
        return ""

    div_where = " OR ".join(div_conditions)

    lines = ["## Speech-to-Vote Cross-Reference\n"]
    lines.append("How MPs who spoke on this topic actually voted:\n")
    found_any = False

    for pid in list(speaker_ids)[:15]:  # Cap to avoid huge queries
        name = speaker_names.get(pid, "Unknown")

        # Find this MP's votes on relevant divisions
        try:
            vote_rows = db.execute(
                f"""
                SELECT d.name AS division_name, d.date, v.vote
                FROM votes v
                JOIN divisions d ON d.division_id = v.division_id
                WHERE v.person_id = ? AND ({div_where})
                ORDER BY d.date DESC
                LIMIT 5
                """,
                [pid] + div_params,
            ).fetchall()
        except Exception:
            continue

        if vote_rows:
            found_any = True
            lines.append(f"### {name}")
            for vr in vote_rows:
                vote_str = vr["vote"].upper()
                lines.append(
                    f"- Voted **{vote_str}** on: {vr['division_name']} ({vr['date']})"
                )
            lines.append("")

    return "\n".join(lines) if found_any else ""


def _get_legal_context(question: str, limit: int = 5) -> str:
    """Search the legal corpus for legislation/court decisions relevant to the question."""
    legal_indicators = [
        "legislation", "law", "act", "bill", "regulation", "statute",
        "court", "ruling", "judgment", "decision", "legal", "amend",
        "section", "clause", "provision", "offence", "penalty",
        "passed", "enacted", "reform", "repeal",
    ]
    q_lower = question.lower()

    topic_legal_triggers = [
        "gambling", "gaming", "wagering",
        "immigration", "visa", "migration",
        "climate", "emissions", "carbon",
        "corruption", "integrity", "anti-corruption",
        "housing", "tenancy", "rental",
        "health", "pharmaceutical", "medical",
        "taxation", "tax",
        "environment", "conservation", "biodiversity",
    ]

    has_legal_indicator = any(ind in q_lower for ind in legal_indicators)
    has_topic_trigger = any(t in q_lower for t in topic_legal_triggers)

    if not has_legal_indicator and not has_topic_trigger:
        return ""

    db = get_db()

    table_exists = db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='legal_documents'"
    ).fetchone()
    if not table_exists:
        return ""

    fts_exists = db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='legal_documents_fts'"
    ).fetchone()
    if not fts_exists:
        return ""

    keywords = _extract_keywords(question)
    if not keywords:
        return ""

    fts_query = " OR ".join(f'"{kw}"' for kw in keywords)

    try:
        rows = db.execute(
            """
            SELECT ld.doc_id, ld.title, ld.jurisdiction, ld.doc_type,
                   ld.date, ld.citation, ld.url,
                   SUBSTR(ld.text, 1, 1500) AS text_preview,
                   rank
            FROM legal_documents_fts
            JOIN legal_documents ld ON ld.doc_id = legal_documents_fts.rowid
            WHERE legal_documents_fts MATCH ?
            ORDER BY rank
            LIMIT ?
            """,
            (fts_query, limit),
        ).fetchall()
    except Exception:
        return ""

    if not rows:
        return ""

    lines = ["## Relevant Legislation & Legal Documents\n"]
    for r in rows:
        title = r["title"] or "Untitled"
        jurisdiction = (r["jurisdiction"] or "unknown").upper()
        doc_type = r["doc_type"] or "unknown"
        date = r["date"] or "unknown date"
        citation = r["citation"] or ""

        lines.append(f"### {title}")
        lines.append(f"Type: {doc_type} | Jurisdiction: {jurisdiction} | Date: {date}")
        if citation:
            lines.append(f"Citation: {citation}")
        if r["url"]:
            lines.append(f"URL: {r['url']}")
        preview = (r["text_preview"] or "")[:1200]
        if preview:
            lines.append(f"\n{preview}")
        lines.append("")

    return "\n".join(lines)


def _get_mp_policy_scores(question: str) -> str:
    """Look up TVFY policy scores for any MP mentioned in the question."""
    mps = _extract_mp_names(question)
    if not mps:
        return ""

    topics = _detect_topics(question)
    tvfy_policy_map = {
        "gambling": 39, "housing": 117, "climate": 3, "immigration": 4,
        "health": 262, "education": 25, "economy": 290, "defence": 161,
        "indigenous_affairs": 160, "corruption": 86, "media": 68,
        "environment": 83, "taxation": 92, "infrastructure": 38,
        "foreign_affairs": 142, "cost_of_living": 294,
    }
    relevant_ids = set()
    if topics:
        for t in topics:
            pid = tvfy_policy_map.get(t)
            if pid:
                relevant_ids.add(pid)

    db = get_db()
    lines = ["## MP Policy Scores (TheyVoteForYou)\n"]
    found_any = False

    for mp in mps:
        cache_row = db.execute(
            "SELECT value FROM analysis_cache WHERE key = ?",
            (f"tvfy_person_{mp['person_id']}",),
        ).fetchone()
        if not cache_row:
            continue

        data = json.loads(cache_row[0])
        comparisons = data.get("policy_comparisons", [])
        if not comparisons:
            continue

        if relevant_ids:
            filtered = [c for c in comparisons if c["policy"]["id"] in relevant_ids and c.get("voted")]
        else:
            filtered = [c for c in comparisons if c.get("voted")][:10]

        if not filtered:
            continue

        found_any = True
        lines.append(f"### {mp['full_name']} ({mp['party']})")
        for c in filtered:
            lines.append(
                f"- {c['policy']['name']}: {c['agreement']}% agreement"
            )
        lines.append("")

    return "\n".join(lines) if found_any else ""


def _get_contract_context(question: str, limit: int = 15) -> str:
    """Search the contracts table when the question mentions procurement/tenders."""
    contract_indicators = [
        "contract", "tender", "procurement", "austender", "government spend",
        "awarded", "outsourc", "supplier", "contractor", "consulting",
        "won contract", "public money", "taxpayer",
    ]
    q_lower = question.lower()

    donation_contract_triggers = [
        "donated", "donation", "donor", "pay to play", "conflict of interest",
        "corruption", "lobbying",
    ]

    has_contract_indicator = any(ind in q_lower for ind in contract_indicators)
    has_donation_trigger = any(t in q_lower for t in donation_contract_triggers)

    if not has_contract_indicator and not has_donation_trigger:
        return ""

    db = get_db()

    table_exists = db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='contracts'"
    ).fetchone()
    if not table_exists:
        return ""

    count = db.execute("SELECT COUNT(*) FROM contracts").fetchone()[0]
    if count == 0:
        return ""

    keywords = _extract_keywords(question)
    sections = []

    if keywords:
        conditions = []
        params = []
        for kw in keywords:
            like = f"%{kw}%"
            conditions.append(
                "(title LIKE ? OR description LIKE ? OR supplier_name LIKE ? OR agency LIKE ?)"
            )
            params.extend([like, like, like, like])

        where = " OR ".join(conditions)
        rows = db.execute(
            f"""
            SELECT contract_id, title, description, supplier_name, agency,
                   amount, start_date, end_date, procurement_method
            FROM contracts
            WHERE {where}
            ORDER BY amount DESC
            LIMIT ?
            """,
            params + [limit],
        ).fetchall()

        if rows:
            lines = ["## Relevant Government Contracts (AusTender)\n"]
            for r in rows:
                amt = f"${r['amount']:,.0f}" if r["amount"] else "undisclosed"
                lines.append(
                    f"- **{r['contract_id']}**: {r['title'] or r['description'] or 'No title'}\n"
                    f"  Supplier: {r['supplier_name']} | Agency: {r['agency']} | "
                    f"Value: {amt} | Method: {r['procurement_method'] or '?'} | "
                    f"Period: {r['start_date'] or '?'} to {r['end_date'] or '?'}"
                )
            sections.append("\n".join(lines))

    # Cross-reference: find companies in both donations and contracts tables
    donations_exist = db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='donations'"
    ).fetchone()
    if donations_exist:
        matches = db.execute(
            """
            SELECT DISTINCT
                c.supplier_name,
                d.donor_name,
                d.recipient AS party,
                SUM(d.amount) AS donation_total,
                COUNT(DISTINCT d.donation_id) AS donation_count,
                (SELECT SUM(c2.amount) FROM contracts c2
                 WHERE UPPER(REPLACE(REPLACE(REPLACE(c2.supplier_name,
                       ' PTY LTD',''),' PTY. LTD.',''),' LIMITED',''))
                     = UPPER(REPLACE(REPLACE(REPLACE(c.supplier_name,
                       ' PTY LTD',''),' PTY. LTD.',''),' LIMITED',''))
                ) AS contract_total
            FROM contracts c
            JOIN donations d ON
                UPPER(REPLACE(REPLACE(REPLACE(c.supplier_name,
                    ' PTY LTD',''),' PTY. LTD.',''),' LIMITED',''))
                LIKE '%' || UPPER(REPLACE(REPLACE(REPLACE(d.donor_name,
                    ' PTY LTD',''),' PTY. LTD.',''),' LIMITED','')) || '%'
                OR
                UPPER(REPLACE(REPLACE(REPLACE(d.donor_name,
                    ' PTY LTD',''),' PTY. LTD.',''),' LIMITED',''))
                LIKE '%' || UPPER(REPLACE(REPLACE(REPLACE(c.supplier_name,
                    ' PTY LTD',''),' PTY. LTD.',''),' LIMITED','')) || '%'
            WHERE LENGTH(d.donor_name) > 5 AND LENGTH(c.supplier_name) > 5
            GROUP BY c.supplier_name, d.donor_name, d.recipient
            ORDER BY contract_total DESC
            LIMIT 20
            """,
        ).fetchall()

        if matches:
            lines = ["\n## Donor-Contractor Connections (Pay to Play Analysis)\n"]
            for m in matches:
                d_total = f"${m['donation_total']:,.0f}" if m["donation_total"] else "?"
                c_total = f"${m['contract_total']:,.0f}" if m["contract_total"] else "?"
                lines.append(
                    f"- **{m['supplier_name']}** (contractor) matches **{m['donor_name']}** (donor)\n"
                    f"  Donated {d_total} ({m['donation_count']}x) to {m['party']}\n"
                    f"  Won {c_total} in government contracts"
                )
            sections.append("\n".join(lines))

    return "\n\n".join(sections) if sections else ""


def _get_news_context(question: str, limit: int = 10) -> str:
    """Search news articles for coverage relevant to the question."""
    db = get_db()

    table_exists = db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='news_articles'"
    ).fetchone()
    if not table_exists:
        return ""

    count = db.execute("SELECT COUNT(*) FROM news_articles").fetchone()[0]
    if count == 0:
        return ""

    keywords = _extract_keywords(question)
    if not keywords:
        return ""

    fts_exists = db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='news_articles_fts'"
    ).fetchone()

    rows = []
    if fts_exists:
        fts_query = " OR ".join(f'"{kw}"' for kw in keywords)
        try:
            rows = db.execute(
                """
                SELECT na.article_id, na.title, na.date, na.section, na.url,
                       SUBSTR(na.body_text, 1, 800) AS body_preview, rank
                FROM news_articles_fts
                JOIN news_articles na ON na.rowid = news_articles_fts.rowid
                WHERE news_articles_fts MATCH ?
                ORDER BY rank
                LIMIT ?
                """,
                (fts_query, limit),
            ).fetchall()
        except Exception:
            rows = []

    if not rows:
        conditions = []
        params = []
        for kw in keywords:
            like = f"%{kw}%"
            conditions.append("(title LIKE ? OR body_text LIKE ?)")
            params.extend([like, like])

        where = " OR ".join(conditions)
        rows = db.execute(
            f"""
            SELECT article_id, title, date, section, url,
                   SUBSTR(body_text, 1, 800) AS body_preview
            FROM news_articles
            WHERE {where}
            ORDER BY date DESC
            LIMIT ?
            """,
            params + [limit],
        ).fetchall()

    if not rows:
        return ""

    lines = ["## Relevant News Coverage\n"]
    for r in rows:
        lines.append(
            f"### {r['title']}\n"
            f"Date: {r['date']} | Section: {r['section'] or '?'}\n"
            f"URL: {r['url']}\n"
            f"{r['body_preview'] or ''}\n"
        )

    return "\n".join(lines)


def _deduplicate_speeches(speeches: list[dict]) -> list[dict]:
    """Remove near-duplicate speeches from the same speaker.

    If the same speaker has multiple speeches with highly overlapping text,
    keep only the highest-scored one.
    """
    seen: dict[str, list[dict]] = defaultdict(list)
    for s in speeches:
        key = s.get("person_id") or s.get("speaker_name") or "unknown"
        seen[key].append(s)

    deduped = []
    for key, speaker_speeches in seen.items():
        if len(speaker_speeches) <= 1:
            deduped.extend(speaker_speeches)
            continue

        # Sort by score descending
        speaker_speeches.sort(key=lambda x: x.get("similarity_score", 0), reverse=True)
        kept = [speaker_speeches[0]]

        for candidate in speaker_speeches[1:]:
            # Check if this speech's text is too similar to any already-kept speech
            candidate_text = candidate["text"][:200].lower()
            is_duplicate = False
            for k in kept:
                kept_text = k["text"][:200].lower()
                # Simple overlap check: if first 200 chars share >60% words
                c_words = set(candidate_text.split())
                k_words = set(kept_text.split())
                if c_words and k_words:
                    overlap = len(c_words & k_words) / max(len(c_words), len(k_words))
                    if overlap > 0.6:
                        is_duplicate = True
                        break
            if not is_duplicate:
                kept.append(candidate)

        deduped.extend(kept)

    # Re-sort by score
    deduped.sort(key=lambda x: x.get("similarity_score", 0), reverse=True)
    return deduped


def get_context(question: str, top_k: int = 10) -> tuple[str, dict]:
    """Retrieve and format all relevant context for a question.

    Returns (formatted_context, metadata) where metadata contains structured
    information about what was found for confidence scoring and response metadata.
    """
    metadata: dict = {
        "speech_count": 0,
        "unique_speakers": 0,
        "topics_detected": [],
        "mps_mentioned": [],
        "donation_total": 0,
        "donation_data": {},
        "division_count": 0,
        "confidence": "low",
    }

    # Detect topics and MPs upfront
    metadata["topics_detected"] = _detect_topics(question)
    mentioned_mps = _extract_mp_names(question)
    metadata["mps_mentioned"] = [m["full_name"] for m in mentioned_mps]

    # Hybrid search over speeches — use 10 results with 800-char excerpts
    speeches = hybrid_search(question, top_k=top_k, text_limit=800)

    # Deduplicate similar speeches from the same speaker
    speeches = _deduplicate_speeches(speeches)

    # Limit to top_k after dedup
    speeches = speeches[:top_k]

    sections = []

    # Build context summary section first
    summary_parts = []

    # Speech context
    if speeches:
        unique_speakers = set()
        for s in speeches:
            name = s.get("speaker_name") or "Unknown"
            unique_speakers.add(name)

        metadata["speech_count"] = len(speeches)
        metadata["unique_speakers"] = len(unique_speakers)

        lines = ["## Relevant Hansard Speeches\n"]
        for i, s in enumerate(speeches, 1):
            lines.append(
                f"### Speech {i}: {s['speaker_name'] or 'Unknown'} "
                f"({s['party'] or '?'}), {s['date']}"
            )
            if s["topic"]:
                lines.append(f"Topic: {s['topic']}")
            lines.append(s["text"])
            lines.append("")
        sections.append("\n".join(lines))
        summary_parts.append(f"{len(speeches)} speeches from {len(unique_speakers)} MPs")

    # Donation context (with aggregation)
    donation_ctx, donation_meta = _get_donation_context(question)
    if donation_ctx:
        sections.append(donation_ctx)
        metadata["donation_total"] = donation_meta.get("total_amount", 0)
        metadata["donation_data"] = donation_meta
        amt = donation_meta.get("total_amount", 0)
        if amt:
            summary_parts.append(f"${amt:,.0f} in related donations")

    # Voting context
    voting_ctx, voting_meta = _get_voting_context(question)
    if voting_ctx:
        sections.append(voting_ctx)
        metadata["division_count"] = voting_meta.get("division_count", 0)
        summary_parts.append(f"{voting_meta.get('division_count', 0)} relevant votes")

    # Speech-to-vote cross-reference
    if speeches:
        crossref_ctx = _get_mp_speech_vote_crossref(question, speeches)
        if crossref_ctx:
            sections.append(crossref_ctx)

    # Legal corpus context
    legal_ctx = _get_legal_context(question)
    if legal_ctx:
        sections.append(legal_ctx)

    # Government contract context
    contract_ctx = _get_contract_context(question)
    if contract_ctx:
        sections.append(contract_ctx)

    # News article context
    news_ctx = _get_news_context(question)
    if news_ctx:
        sections.append(news_ctx)

    # MP-specific policy scores
    mp_ctx = _get_mp_policy_scores(question)
    if mp_ctx:
        sections.append(mp_ctx)

    # TVFY policy context (cached voting scores per MP)
    topics = _detect_topics(question)
    tvfy_policy_map = {
        "gambling": "39",
        "housing": "117",
        "climate": "3",
        "immigration": "4",
        "health": "262",
        "education": "25",
        "economy": "290",
        "defence": "161",
        "indigenous_affairs": "160",
        "corruption": "86",
        "media": "68",
        "environment": "83",
        "taxation": "92",
        "infrastructure": "38",
        "foreign_affairs": "142",
        "cost_of_living": "294",
    }
    for topic in topics:
        policy_id = tvfy_policy_map.get(topic)
        if policy_id:
            db = get_db()
            row = db.execute(
                "SELECT value FROM analysis_cache WHERE key=?",
                (f"tvfy_policy_{policy_id}",)
            ).fetchone()
            if row:
                policy = json.loads(row[0])
                people = policy.get("people_comparisons", [])
                if people:
                    voted = [p for p in people if p.get("voted")]
                    voted.sort(key=lambda x: float(x.get("agreement", 0)))
                    lines = [f"## TheyVoteForYou: Voting Record on '{policy.get('name', topic)}'\n"]
                    lines.append(f"Policy: {policy.get('description', '')}\n")
                    lines.append("### MPs LEAST supportive (voted AGAINST):")
                    for p in voted[:15]:
                        m = p["person"]["latest_member"]
                        lines.append(
                            f"- {m['name']['first']} {m['name']['last']} "
                            f"({m['party']}, {m.get('electorate', '?')}): "
                            f"{p['agreement']}% agreement"
                        )
                    lines.append("\n### MPs MOST supportive (voted FOR):")
                    for p in voted[-10:]:
                        m = p["person"]["latest_member"]
                        lines.append(
                            f"- {m['name']['first']} {m['name']['last']} "
                            f"({m['party']}, {m.get('electorate', '?')}): "
                            f"{p['agreement']}% agreement"
                        )
                    sections.append("\n".join(lines))

    if not sections:
        return "No relevant parliamentary data found for this question.", metadata

    # Compute confidence based on how much data we found
    data_signals = sum([
        metadata["speech_count"] >= 3,
        metadata["speech_count"] >= 7,
        metadata["unique_speakers"] >= 3,
        metadata["donation_total"] > 0,
        metadata["division_count"] > 0,
        bool(legal_ctx),
        bool(mp_ctx),
    ])
    if data_signals >= 5:
        metadata["confidence"] = "high"
    elif data_signals >= 3:
        metadata["confidence"] = "medium"
    else:
        metadata["confidence"] = "low"

    # Prepend context summary
    if summary_parts:
        summary = "## Context Summary\n\nData retrieved: " + ", ".join(summary_parts) + ".\n"
        sections.insert(0, summary)

    return "\n\n---\n\n".join(sections), metadata


def query(question: str, top_k: int = 10, model: str = "claude-sonnet-4-20250514") -> dict:
    """Answer a question using RAG over parliamentary data.

    Args:
        question: Natural language question about Australian politics.
        top_k: Number of speeches to retrieve.
        model: Claude model to use.

    Returns:
        {"answer": str, "sources": list[dict], "context_used": str, "metadata": dict}
    """
    context, metadata = get_context(question, top_k=top_k)

    user_message = (
        f"## Question\n{question}\n\n"
        f"## Parliamentary Data\n{context}"
    )

    client = Anthropic()
    response = client.messages.create(
        model=model,
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    answer = response.content[0].text

    # Extract sources from the speeches used
    speeches = hybrid_search(question, top_k=top_k, text_limit=200)
    sources = [
        {
            "speech_id": s["speech_id"],
            "speaker_name": s["speaker_name"],
            "party": s["party"],
            "date": s["date"],
            "topic": s["topic"],
        }
        for s in speeches
    ]

    return {
        "answer": answer,
        "sources": sources,
        "context_used": context,
        "metadata": metadata,
    }


def query_stream(question: str, top_k: int = 10, model: str = "claude-sonnet-4-20250514"):
    """Stream an answer using RAG over parliamentary data.

    Yields text chunks as they arrive from the Claude API.
    Also yields a final metadata dict.

    Usage:
        for chunk in query_stream("question"):
            if isinstance(chunk, dict):
                metadata = chunk  # final metadata
            else:
                print(chunk, end="")
    """
    context, metadata = get_context(question, top_k=top_k)

    user_message = (
        f"## Question\n{question}\n\n"
        f"## Parliamentary Data\n{context}"
    )

    client = Anthropic()

    with client.messages.stream(
        model=model,
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    ) as stream:
        for text in stream.text_stream:
            yield text

    # Yield metadata as final item
    speeches = hybrid_search(question, top_k=top_k, text_limit=200)
    sources = [
        {
            "speech_id": s["speech_id"],
            "speaker_name": s["speaker_name"],
            "party": s["party"],
            "date": s["date"],
            "topic": s["topic"],
        }
        for s in speeches
    ]
    metadata["sources"] = sources
    yield metadata


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="RAG query engine over Australian parliamentary data"
    )
    parser.add_argument("question", type=str, help="Question to answer")
    parser.add_argument("--context-only", action="store_true",
                        help="Print retrieved context without calling the LLM")
    parser.add_argument("--top-k", type=int, default=10,
                        help="Number of speeches to retrieve")
    args = parser.parse_args()

    if args.context_only:
        context, metadata = get_context(args.question, top_k=args.top_k)
        print(context)
        print("\n--- Metadata ---")
        print(json.dumps(metadata, indent=2, default=str))
    else:
        print(f"Querying: {args.question!r}\n")
        print("Retrieving context...")
        result = query(args.question, top_k=args.top_k)
        print("\n" + "=" * 72)
        print("ANSWER")
        print("=" * 72)
        print(result["answer"])
        print("\n" + "-" * 72)
        print(f"SOURCES ({len(result['sources'])} speeches retrieved)")
        print("-" * 72)
        for s in result["sources"][:10]:
            print(f"  - {s['speaker_name']} ({s['party']}), {s['date']}: {s['topic']}")
        print("\n--- Metadata ---")
        print(f"Confidence: {result['metadata']['confidence']}")
        print(f"Topics: {', '.join(result['metadata']['topics_detected']) or 'none detected'}")
        print(f"MPs mentioned: {', '.join(result['metadata']['mps_mentioned']) or 'none detected'}")


if __name__ == "__main__":
    main()
