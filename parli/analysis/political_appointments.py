"""
parli.analysis.political_appointments — "Jobs for the Boys" investigation.

Exposes political patronage patterns:
  1. Parliamentary speeches about appointment scandals
  2. Former MPs who became lobbyists (revolving door)
  3. Donors who later appear in government roles
  4. Revolving door timeline for MPs who left parliament
  5. Narrative report cached as 'stories_jobs_for_the_boys'

Usage:
    python -m parli.analysis.political_appointments
    python -m parli.analysis.political_appointments --rebuild
"""

import json
import time
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


# ── 1. Appointment scandal speeches ────────────────────────────────────────

FTS_QUERIES = [
    # Trade commissioner / political appointments
    '"trade commissioner" OR "political appointment" OR "jobs for the boys" OR "jobs for mates"',
    # Ambassador appointments
    'ambassador AND (appointment OR appointed)',
    # Board appointments
    '"board appointment" OR "government board"',
    # The archetype case
    'Barilaro',
    # Revolving door
    '"revolving door"',
]


def find_appointment_speeches(db) -> list[dict]:
    """
    Search speeches via FTS5 for mentions of political appointment scandals.
    Returns deduplicated, scored results grouped by theme.
    """
    print("\n=== APPOINTMENT SCANDAL SPEECHES ===\n")

    seen_ids = set()
    results = []

    themes = {
        0: "trade_commissioner",
        1: "ambassador_appointment",
        2: "board_appointment",
        3: "barilaro_affair",
        4: "revolving_door",
    }

    for idx, query in enumerate(FTS_QUERIES):
        theme = themes[idx]
        try:
            rows = db.execute(
                """
                SELECT s.speech_id, s.person_id, s.speaker_name, s.party,
                       s.date, s.topic,
                       substr(s.text, 1, 600) AS text_snippet,
                       s.word_count
                FROM speeches_fts fts
                JOIN speeches s ON s.speech_id = fts.rowid
                WHERE speeches_fts MATCH ?
                ORDER BY s.date DESC
                LIMIT 200
                """,
                (query,),
            ).fetchall()
        except Exception as e:
            print(f"  FTS query failed for theme '{theme}': {e}")
            continue

        for r in rows:
            sid = r["speech_id"]
            if sid in seen_ids:
                continue
            seen_ids.add(sid)
            results.append({
                "speech_id": sid,
                "person_id": r["person_id"],
                "speaker_name": r["speaker_name"],
                "party": r["party"],
                "date": r["date"],
                "topic": r["topic"],
                "text_snippet": r["text_snippet"],
                "word_count": r["word_count"],
                "theme": theme,
            })

        print(f"  {theme}: {len(rows)} speeches found")

    # Sort by date descending
    results.sort(key=lambda x: x["date"] or "", reverse=True)
    print(f"\n  Total unique speeches: {len(results)}")
    return results


# ── 2. Former MPs who became lobbyists ─────────────────────────────────────

def find_mp_lobbyists(db) -> list[dict]:
    """
    Cross-reference federal_lobbyists with members table.
    Also search lobbyist former_govt_role field for indicators.
    """
    print("\n=== MP -> LOBBYIST REVOLVING DOOR ===\n")

    results = []

    # Method 1: Match lobbyist names against MP names
    lobbyists = db.execute(
        "SELECT * FROM federal_lobbyists WHERE status = 'active' OR status IS NULL"
    ).fetchall()

    if lobbyists:
        members = db.execute(
            "SELECT person_id, full_name, first_name, last_name, party, chamber FROM members"
        ).fetchall()
        member_lookup = {}
        for m in members:
            if m["full_name"]:
                member_lookup[m["full_name"].lower().strip()] = dict(m)
            if m["first_name"] and m["last_name"]:
                key = f"{m['first_name']} {m['last_name']}".lower().strip()
                member_lookup[key] = dict(m)

        for lob in lobbyists:
            trading = lob["trading_name"] or ""
            former_role = lob["former_govt_role"] or ""

            # Check if lobbyist name matches an MP
            matched_mp = member_lookup.get(trading.lower().strip())

            # Get clients for this lobbyist
            clients = db.execute(
                "SELECT client_name FROM federal_lobbyist_clients WHERE lobbyist_id = ?",
                (lob["lobbyist_id"],),
            ).fetchall()
            client_list = [c["client_name"] for c in clients]

            if matched_mp or former_role:
                results.append({
                    "lobbyist_id": lob["lobbyist_id"],
                    "trading_name": trading,
                    "abn": lob["abn"],
                    "former_govt_role": former_role,
                    "registration_date": lob["registration_date"],
                    "status": lob["status"],
                    "matched_mp": matched_mp,
                    "clients": client_list[:20],  # cap to avoid huge payloads
                })

    # Method 2: Search former_govt_role for any entries indicating gov background
    gov_role_lobbyists = db.execute(
        """
        SELECT fl.*, GROUP_CONCAT(flc.client_name, '; ') AS clients_str
        FROM federal_lobbyists fl
        LEFT JOIN federal_lobbyist_clients flc ON flc.lobbyist_id = fl.lobbyist_id
        WHERE fl.former_govt_role IS NOT NULL
          AND fl.former_govt_role != ''
        GROUP BY fl.lobbyist_id
        LIMIT 100
        """
    ).fetchall()

    seen_ids = {r["lobbyist_id"] for r in results}
    for r in gov_role_lobbyists:
        if r["lobbyist_id"] not in seen_ids:
            results.append({
                "lobbyist_id": r["lobbyist_id"],
                "trading_name": r["trading_name"],
                "abn": r["abn"],
                "former_govt_role": r["former_govt_role"],
                "registration_date": r["registration_date"],
                "status": r["status"],
                "matched_mp": None,
                "clients": (r["clients_str"] or "").split("; ")[:20],
            })

    print(f"  Found {len(results)} lobbyists with government connections")
    return results


# ── 3. Donor-to-appointee connections ──────────────────────────────────────

def find_donor_appointee_links(db) -> list[dict]:
    """
    Find donors who later appeared on government boards or as lobbyists.
    Cross-references donations.donor_name against board_appointments.person_name
    and federal_lobbyists.trading_name.
    """
    print("\n=== DONOR -> APPOINTEE LINKS ===\n")

    results = []

    # Donors who appear on boards
    board_matches = db.execute(
        """
        SELECT DISTINCT
            d.donor_name,
            d.recipient,
            SUM(d.amount) AS total_donated,
            COUNT(*) AS donation_count,
            MIN(d.financial_year) AS first_donation,
            MAX(d.financial_year) AS last_donation,
            ba.board_name,
            ba.role AS board_role,
            ba.agency,
            ba.start_date AS appointment_date,
            ba.appointment_type
        FROM donations d
        JOIN board_appointments ba
            ON LOWER(TRIM(d.donor_name)) = LOWER(TRIM(ba.person_name))
        WHERE d.amount > 1000
        GROUP BY d.donor_name, ba.board_name
        ORDER BY total_donated DESC
        LIMIT 50
        """
    ).fetchall()

    for r in board_matches:
        results.append({
            "donor_name": r["donor_name"],
            "recipient_party": r["recipient"],
            "total_donated": round(r["total_donated"] or 0),
            "donation_count": r["donation_count"],
            "donation_period": f"{r['first_donation']}-{r['last_donation']}",
            "board_name": r["board_name"],
            "board_role": r["board_role"],
            "agency": r["agency"],
            "appointment_date": r["appointment_date"],
            "appointment_type": r["appointment_type"],
            "link_type": "donor_to_board",
        })

    # Donors who appear as lobbyists
    lobbyist_matches = db.execute(
        """
        SELECT DISTINCT
            d.donor_name,
            d.recipient,
            SUM(d.amount) AS total_donated,
            COUNT(*) AS donation_count,
            MIN(d.financial_year) AS first_donation,
            MAX(d.financial_year) AS last_donation,
            fl.trading_name,
            fl.former_govt_role,
            fl.registration_date
        FROM donations d
        JOIN federal_lobbyists fl
            ON LOWER(TRIM(d.donor_name)) = LOWER(TRIM(fl.trading_name))
        WHERE d.amount > 1000
        GROUP BY d.donor_name, fl.lobbyist_id
        ORDER BY total_donated DESC
        LIMIT 50
        """
    ).fetchall()

    for r in lobbyist_matches:
        results.append({
            "donor_name": r["donor_name"],
            "recipient_party": r["recipient"],
            "total_donated": round(r["total_donated"] or 0),
            "donation_count": r["donation_count"],
            "donation_period": f"{r['first_donation']}-{r['last_donation']}",
            "lobbyist_name": r["trading_name"],
            "former_govt_role": r["former_govt_role"],
            "registration_date": r["registration_date"],
            "link_type": "donor_to_lobbyist",
        })

    print(f"  Found {len(results)} donor-appointee links")
    return results


# ── 4. Revolving door timeline ─────────────────────────────────────────────

def build_revolving_door_timeline(db) -> list[dict]:
    """
    Find MPs who left parliament and then appeared as lobbyists, board members,
    or in contract_speech_links. Build a timeline for each.
    """
    print("\n=== REVOLVING DOOR TIMELINE ===\n")

    results = []

    # MPs who left parliament
    former_mps = db.execute(
        """
        SELECT person_id, full_name, first_name, last_name, party, chamber,
               entered_house, left_house
        FROM members
        WHERE left_house IS NOT NULL AND left_house != ''
        """
    ).fetchall()

    mp_lookup = {}
    for mp in former_mps:
        if mp["full_name"]:
            mp_lookup[mp["full_name"].lower().strip()] = dict(mp)

    # Check if any former MPs appear as lobbyists
    for name_key, mp_info in mp_lookup.items():
        timeline_events = []

        # Check lobbyist register
        lob = db.execute(
            "SELECT * FROM federal_lobbyists WHERE LOWER(TRIM(trading_name)) = ?",
            (name_key,),
        ).fetchone()
        if lob:
            clients = db.execute(
                "SELECT client_name FROM federal_lobbyist_clients WHERE lobbyist_id = ?",
                (lob["lobbyist_id"],),
            ).fetchall()
            timeline_events.append({
                "type": "became_lobbyist",
                "date": lob["registration_date"],
                "detail": f"Registered as lobbyist: {lob['trading_name']}",
                "clients": [c["client_name"] for c in clients][:10],
            })

        # Check board appointments
        boards = db.execute(
            "SELECT * FROM board_appointments WHERE matched_person_id = ? OR LOWER(TRIM(person_name)) = ?",
            (mp_info["person_id"], name_key),
        ).fetchall()
        for b in boards:
            timeline_events.append({
                "type": "board_appointment",
                "date": b["start_date"],
                "detail": f"Appointed to {b['board_name']} as {b['role'] or 'member'}",
                "agency": b["agency"],
            })

        # Check contract_speech_links for this MP's companies
        csl_summary = db.execute(
            """
            SELECT company_name, COUNT(*) AS mentions,
                   SUM(contract_amount) AS total_contracts,
                   SUM(donation_amount) AS total_donations
            FROM contract_speech_links
            WHERE person_id = ?
            GROUP BY company_name
            ORDER BY total_contracts DESC
            LIMIT 5
            """,
            (mp_info["person_id"],),
        ).fetchall()
        if csl_summary:
            for c in csl_summary:
                timeline_events.append({
                    "type": "contract_speech_link",
                    "detail": f"Mentioned {c['company_name']} ({c['mentions']}x) - contracts worth ${c['total_contracts']:,.0f}" if c["total_contracts"] else f"Mentioned {c['company_name']} ({c['mentions']}x)",
                })

        if timeline_events:
            results.append({
                "person_id": mp_info["person_id"],
                "full_name": mp_info["full_name"],
                "party": mp_info["party"],
                "chamber": mp_info["chamber"],
                "entered_house": mp_info["entered_house"],
                "left_house": mp_info["left_house"],
                "events": timeline_events,
            })

    # Also find contract_speech_links grouped by MP even without left_house
    # These are current/former MPs who spoke about companies getting contracts
    if not results:
        top_csl_mps = db.execute(
            """
            SELECT
                csl.person_id,
                m.full_name,
                m.party,
                m.chamber,
                m.entered_house,
                m.left_house,
                COUNT(DISTINCT csl.company_name) AS companies,
                COUNT(*) AS total_links,
                SUM(csl.contract_amount) AS total_contract_value,
                SUM(csl.donation_amount) AS total_donation_value
            FROM contract_speech_links csl
            JOIN members m ON m.person_id = csl.person_id
            WHERE csl.match_type = 'party_match'
              AND csl.person_id IS NOT NULL
            GROUP BY csl.person_id
            HAVING total_links >= 3
            ORDER BY total_contract_value DESC
            LIMIT 30
            """
        ).fetchall()

        for r in top_csl_mps:
            # Get company details
            companies = db.execute(
                """
                SELECT company_name, COUNT(*) AS mentions,
                       SUM(contract_amount) AS contracts,
                       SUM(donation_amount) AS donations
                FROM contract_speech_links
                WHERE person_id = ? AND match_type = 'party_match'
                GROUP BY company_name
                ORDER BY contracts DESC
                LIMIT 5
                """,
                (r["person_id"],),
            ).fetchall()

            events = []
            for c in companies:
                events.append({
                    "type": "contract_speech_link",
                    "detail": f"Spoke about {c['company_name']} ({c['mentions']}x), contracts worth ${c['contracts']:,.0f}" if c["contracts"] else f"Spoke about {c['company_name']} ({c['mentions']}x)",
                    "contract_value": round(c["contracts"] or 0),
                    "donation_value": round(c["donations"] or 0),
                })

            results.append({
                "person_id": r["person_id"],
                "full_name": r["full_name"],
                "party": r["party"],
                "chamber": r["chamber"],
                "entered_house": r["entered_house"],
                "left_house": r["left_house"],
                "total_contract_value": round(r["total_contract_value"] or 0),
                "total_donation_value": round(r["total_donation_value"] or 0),
                "companies": r["companies"],
                "events": events,
            })

    print(f"  Found {len(results)} revolving door cases")
    return results


# ── 5. Generate narrative report ───────────────────────────────────────────

def generate_report(db) -> dict:
    """
    Build a comprehensive 'Jobs for the Boys' report and cache it
    as 'stories_jobs_for_the_boys'.
    """
    print("\n" + "=" * 70)
    print("JOBS FOR THE BOYS — Full Investigation Report")
    print("=" * 70)

    speeches = find_appointment_speeches(db)
    lobbyists = find_mp_lobbyists(db)
    donor_links = find_donor_appointee_links(db)
    timeline = build_revolving_door_timeline(db)

    # Extract key quotes from speeches
    key_quotes = []
    seen_speakers = set()
    for s in speeches:
        speaker = s["speaker_name"]
        if speaker and speaker not in seen_speakers and s["text_snippet"]:
            # Prefer speeches with strong language
            text = s["text_snippet"].lower()
            is_strong = any(w in text for w in [
                "jobs for the boys", "mates", "revolving door",
                "political appointment", "cronyism", "patronage",
                "Barilaro", "barilaro", "trade commissioner",
                "corruption", "nepotism",
            ])
            if is_strong:
                key_quotes.append({
                    "speaker_name": s["speaker_name"],
                    "party": s["party"],
                    "date": s["date"],
                    "text": s["text_snippet"],
                    "theme": s["theme"],
                    "person_id": s["person_id"],
                })
                seen_speakers.add(speaker)
            if len(key_quotes) >= 20:
                break

    # If we don't have enough strong quotes, fill with any
    if len(key_quotes) < 10:
        for s in speeches:
            if s["speaker_name"] not in seen_speakers and s["text_snippet"]:
                key_quotes.append({
                    "speaker_name": s["speaker_name"],
                    "party": s["party"],
                    "date": s["date"],
                    "text": s["text_snippet"],
                    "theme": s["theme"],
                    "person_id": s["person_id"],
                })
                seen_speakers.add(s["speaker_name"])
                if len(key_quotes) >= 20:
                    break

    # Speech stats by theme
    theme_counts = defaultdict(int)
    for s in speeches:
        theme_counts[s["theme"]] += 1

    # Speech stats by year
    year_counts = defaultdict(int)
    for s in speeches:
        if s["date"]:
            year_counts[s["date"][:4]] += 1

    # Speeches by party
    party_counts = defaultdict(int)
    for s in speeches:
        p = s["party"] or "Unknown"
        if "Labor" in p or "ALP" in p:
            party_counts["Labor"] += 1
        elif "Liberal" in p:
            party_counts["Liberal"] += 1
        elif "Green" in p:
            party_counts["Greens"] += 1
        elif "National" in p:
            party_counts["Nationals"] += 1
        elif "Independent" in p or "IND" in p:
            party_counts["Independent"] += 1
        else:
            party_counts["Other"] += 1

    # Top speakers on this topic
    speaker_counts = defaultdict(lambda: {"count": 0, "party": "", "person_id": ""})
    for s in speeches:
        name = s["speaker_name"] or "Unknown"
        speaker_counts[name]["count"] += 1
        speaker_counts[name]["party"] = s["party"]
        speaker_counts[name]["person_id"] = s["person_id"]
    top_speakers = sorted(
        [{"name": k, **v} for k, v in speaker_counts.items()],
        key=lambda x: x["count"],
        reverse=True,
    )[:15]

    report = {
        "summary": {
            "total_speeches": len(speeches),
            "total_lobbyists_with_govt_links": len(lobbyists),
            "total_donor_appointee_links": len(donor_links),
            "total_revolving_door_cases": len(timeline),
            "themes": dict(theme_counts),
            "speeches_by_year": dict(sorted(year_counts.items())),
            "speeches_by_party": dict(party_counts),
        },
        "top_speakers": top_speakers,
        "key_quotes": key_quotes,
        "appointment_speeches": speeches[:100],  # top 100 for the frontend
        "mp_lobbyists": lobbyists,
        "donor_appointee_links": donor_links,
        "revolving_door_timeline": timeline[:30],
        "generated_at": datetime.now().isoformat(),
    }

    _cache(db, "stories_jobs_for_the_boys", report)
    print(f"\n  Report cached as 'stories_jobs_for_the_boys'")
    print(f"  Speeches: {len(speeches)}, Quotes: {len(key_quotes)}, "
          f"Lobbyists: {len(lobbyists)}, Donor links: {len(donor_links)}, "
          f"Revolving door: {len(timeline)}")

    return report


# ── CLI ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Jobs for the Boys investigation")
    parser.add_argument("--rebuild", action="store_true", help="Force rebuild of cached data")
    args = parser.parse_args()

    db = _get_db()

    if not args.rebuild:
        cached = db.execute(
            "SELECT value FROM analysis_cache WHERE key = 'stories_jobs_for_the_boys'"
        ).fetchone()
        if cached:
            data = json.loads(cached["value"])
            print(f"Cached report found ({data.get('generated_at', 'unknown')})")
            print(f"  Speeches: {data['summary']['total_speeches']}")
            print(f"  Quotes: {len(data['key_quotes'])}")
            print(f"  Use --rebuild to regenerate")
            exit(0)

    report = generate_report(db)
