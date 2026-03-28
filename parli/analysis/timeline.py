"""
parli.analysis.timeline -- Follow the Money timeline builder.

For a given entity (company, organisation, or person), queries across all
data tables to build a chronological timeline of their interactions with
the Australian political system:

- Donations to political parties
- Government contracts awarded
- Mentions in parliamentary speeches (via FTS5)
- Ministerial meetings
- Contract-speech cross-links (pay-to-play connections)
- Board appointments
- Lobbying registrations

Each event carries: date, type, description, amount, people involved, party.

Usage:
    python -m parli.analysis.timeline "Tabcorp"
    python -m parli.analysis.timeline --top 20
"""

import argparse
import sqlite3
from collections import defaultdict

from parli.schema import get_db


# ---------------------------------------------------------------------------
# Entity timeline builder
# ---------------------------------------------------------------------------

def build_timeline(db: sqlite3.Connection, entity: str) -> dict:
    """Build a chronological timeline for a given entity name.

    Searches across donations, contracts, speeches, ministerial meetings,
    contract_speech_links, board appointments, and lobbyist registrations.

    Returns dict with:
      - entity: the search term
      - events: list of event dicts sorted by date
      - summary: aggregate totals
    """
    db.execute("PRAGMA busy_timeout = 600000")
    events = []
    like_pattern = f"%{entity}%"

    # 1. Donations
    rows = db.execute("""
        SELECT donation_id, donor_name, recipient, amount, financial_year,
               donor_type, industry, source
        FROM donations
        WHERE donor_name LIKE ? OR recipient LIKE ?
        ORDER BY financial_year
    """, (like_pattern, like_pattern)).fetchall()

    for r in rows:
        fy = r["financial_year"] or ""
        # Convert financial year like "2019-20" to a sortable date
        year_str = fy[:4] if len(fy) >= 4 else "0000"
        events.append({
            "date": f"{year_str}-07-01",  # mid-financial year
            "date_display": f"FY {fy}" if fy else "Unknown",
            "type": "donation",
            "title": f"Donation: {r['donor_name']} to {r['recipient']}",
            "description": f"{r['donor_name']} donated to {r['recipient']}"
                           + (f" ({r['industry']})" if r['industry'] else ""),
            "amount": r["amount"],
            "people": [],
            "party": r["recipient"] or "",
            "source_id": r["donation_id"],
            "extra": {
                "donor_name": r["donor_name"],
                "recipient": r["recipient"],
                "donor_type": r["donor_type"],
                "industry": r["industry"],
                "source": r["source"],
            },
        })

    # 2. Contracts
    rows = db.execute("""
        SELECT contract_id, title, description, supplier_name, agency,
               amount, start_date, end_date, procurement_method
        FROM contracts
        WHERE supplier_name LIKE ? OR title LIKE ? OR description LIKE ?
        ORDER BY start_date
    """, (like_pattern, like_pattern, like_pattern)).fetchall()

    for r in rows:
        events.append({
            "date": r["start_date"] or "0000-01-01",
            "date_display": r["start_date"] or "Unknown",
            "type": "contract",
            "title": f"Contract: {_truncate(r['title'] or r['description'] or 'Government contract', 80)}",
            "description": f"{r['supplier_name']} awarded contract by {r['agency']}"
                           + (f": {_truncate(r['title'] or '', 120)}" if r['title'] else ""),
            "amount": r["amount"],
            "people": [],
            "party": "",
            "source_id": r["contract_id"],
            "extra": {
                "supplier_name": r["supplier_name"],
                "agency": r["agency"],
                "procurement_method": r["procurement_method"],
                "end_date": r["end_date"],
                "full_title": r["title"],
                "full_description": r["description"],
            },
        })

    # 3. Speeches via FTS5
    try:
        rows = db.execute("""
            SELECT s.speech_id, s.person_id, s.speaker_name, s.party,
                   s.date, s.topic, substr(s.text, 1, 300) AS snippet,
                   s.word_count
            FROM speeches_fts fts
            JOIN speeches s ON s.speech_id = fts.rowid
            WHERE speeches_fts MATCH ?
            ORDER BY s.date DESC
            LIMIT 500
        """, (_fts5_escape(entity),)).fetchall()
    except sqlite3.OperationalError:
        rows = []

    for r in rows:
        events.append({
            "date": r["date"] or "0000-01-01",
            "date_display": r["date"] or "Unknown",
            "type": "speech",
            "title": f"Speech: {r['speaker_name'] or 'Unknown MP'} on {_truncate(r['topic'] or 'parliamentary business', 60)}",
            "description": _truncate(r["snippet"] or "", 200),
            "amount": None,
            "people": [r["speaker_name"]] if r["speaker_name"] else [],
            "party": r["party"] or "",
            "source_id": r["speech_id"],
            "extra": {
                "person_id": r["person_id"],
                "speaker_name": r["speaker_name"],
                "topic": r["topic"],
                "word_count": r["word_count"],
                "snippet": r["snippet"],
            },
        })

    # 4. Ministerial meetings
    rows = db.execute("""
        SELECT meeting_id, minister_name, person_id, meeting_date,
               organisation, attendee_name, purpose, portfolio, state
        FROM ministerial_meetings
        WHERE organisation LIKE ? OR attendee_name LIKE ? OR purpose LIKE ?
        ORDER BY meeting_date
    """, (like_pattern, like_pattern, like_pattern)).fetchall()

    for r in rows:
        events.append({
            "date": r["meeting_date"] or "0000-01-01",
            "date_display": r["meeting_date"] or "Unknown",
            "type": "meeting",
            "title": f"Meeting: {r['minister_name']} met {r['organisation'] or r['attendee_name'] or 'unknown'}",
            "description": f"Minister {r['minister_name']} ({r['portfolio'] or 'unknown portfolio'}) "
                           f"met with {r['organisation'] or 'unknown'}"
                           + (f" — {r['purpose']}" if r['purpose'] else ""),
            "amount": None,
            "people": [r["minister_name"]] + ([r["attendee_name"]] if r["attendee_name"] else []),
            "party": "",
            "source_id": r["meeting_id"],
            "extra": {
                "minister_name": r["minister_name"],
                "person_id": r["person_id"],
                "organisation": r["organisation"],
                "attendee_name": r["attendee_name"],
                "purpose": r["purpose"],
                "portfolio": r["portfolio"],
                "state": r["state"],
            },
        })

    # 5. Contract-speech links
    rows = db.execute("""
        SELECT link_id, contract_id, speech_id, person_id, company_name,
               supplier_name, donor_name, contract_amount, donation_amount,
               party, recipient_party, match_type, speech_date, speech_snippet
        FROM contract_speech_links
        WHERE company_name LIKE ? OR supplier_name LIKE ? OR donor_name LIKE ?
        ORDER BY speech_date
    """, (like_pattern, like_pattern, like_pattern)).fetchall()

    for r in rows:
        events.append({
            "date": r["speech_date"] or "0000-01-01",
            "date_display": r["speech_date"] or "Unknown",
            "type": "pay_to_play",
            "title": f"Pay-to-Play Link: {r['company_name']}",
            "description": f"Company {r['company_name']} donated "
                           f"and received contracts — MP spoke about them in parliament"
                           + (f" (match: {r['match_type']})" if r['match_type'] else ""),
            "amount": r["contract_amount"],
            "people": [],
            "party": r["party"] or "",
            "source_id": r["link_id"],
            "extra": {
                "person_id": r["person_id"],
                "contract_id": r["contract_id"],
                "speech_id": r["speech_id"],
                "contract_amount": r["contract_amount"],
                "donation_amount": r["donation_amount"],
                "match_type": r["match_type"],
                "speech_snippet": r["speech_snippet"],
                "recipient_party": r["recipient_party"],
            },
        })

    # 6. Board appointments
    rows = db.execute("""
        SELECT appointment_id, person_name, board_name, agency, role,
               start_date, end_date, remuneration, appointment_type,
               matched_person_id, matched_donor_name
        FROM board_appointments
        WHERE person_name LIKE ? OR board_name LIKE ? OR agency LIKE ?
           OR matched_donor_name LIKE ?
        ORDER BY start_date
    """, (like_pattern, like_pattern, like_pattern, like_pattern)).fetchall()

    for r in rows:
        events.append({
            "date": r["start_date"] or "0000-01-01",
            "date_display": r["start_date"] or "Unknown",
            "type": "appointment",
            "title": f"Board Appointment: {r['person_name']} to {_truncate(r['board_name'] or '', 50)}",
            "description": f"{r['person_name']} appointed as {r['role'] or 'member'} of {r['board_name']}"
                           + (f" ({r['agency']})" if r['agency'] else ""),
            "amount": None,
            "people": [r["person_name"]] if r["person_name"] else [],
            "party": "",
            "source_id": r["appointment_id"],
            "extra": {
                "board_name": r["board_name"],
                "agency": r["agency"],
                "role": r["role"],
                "remuneration": r["remuneration"],
                "appointment_type": r["appointment_type"],
                "matched_person_id": r["matched_person_id"],
                "matched_donor_name": r["matched_donor_name"],
            },
        })

    # 7. Lobbyist registrations
    rows = db.execute("""
        SELECT fl.lobbyist_id, fl.trading_name, fl.abn, fl.business_entity,
               fl.former_govt_role, fl.registration_date, fl.status,
               flc.client_name
        FROM federal_lobbyists fl
        LEFT JOIN federal_lobbyist_clients flc ON fl.lobbyist_id = flc.lobbyist_id
        WHERE fl.trading_name LIKE ? OR flc.client_name LIKE ?
           OR fl.business_entity LIKE ?
        ORDER BY fl.registration_date
    """, (like_pattern, like_pattern, like_pattern)).fetchall()

    for r in rows:
        events.append({
            "date": r["registration_date"] or "0000-01-01",
            "date_display": r["registration_date"] or "Unknown",
            "type": "lobbying",
            "title": f"Lobbyist: {r['trading_name']}" + (f" (client: {r['client_name']})" if r['client_name'] else ""),
            "description": f"Lobbyist {r['trading_name']} registered"
                           + (f", representing {r['client_name']}" if r['client_name'] else "")
                           + (f" — former govt role: {r['former_govt_role']}" if r['former_govt_role'] else ""),
            "amount": None,
            "people": [],
            "party": "",
            "source_id": r["lobbyist_id"],
            "extra": {
                "trading_name": r["trading_name"],
                "abn": r["abn"],
                "business_entity": r["business_entity"],
                "former_govt_role": r["former_govt_role"],
                "status": r["status"],
                "client_name": r["client_name"],
            },
        })

    # Sort by date
    events.sort(key=lambda e: e["date"] or "0000-01-01")

    # Build summary
    total_donated = sum(e["amount"] or 0 for e in events if e["type"] == "donation")
    total_contracts = sum(e["amount"] or 0 for e in events if e["type"] == "contract")
    type_counts = defaultdict(int)
    all_parties = set()
    all_people = set()
    for e in events:
        type_counts[e["type"]] += 1
        if e["party"]:
            all_parties.add(e["party"])
        for p in e.get("people", []):
            if p:
                all_people.add(p)

    summary = {
        "total_events": len(events),
        "total_donated": total_donated,
        "total_contracts": total_contracts,
        "speech_count": type_counts.get("speech", 0),
        "donation_count": type_counts.get("donation", 0),
        "contract_count": type_counts.get("contract", 0),
        "meeting_count": type_counts.get("meeting", 0),
        "pay_to_play_count": type_counts.get("pay_to_play", 0),
        "appointment_count": type_counts.get("appointment", 0),
        "lobbying_count": type_counts.get("lobbying", 0),
        "parties_involved": sorted(all_parties),
        "people_involved": sorted(list(all_people)[:50]),  # cap at 50
        "event_types": dict(type_counts),
        "date_range": [
            events[0]["date"] if events else None,
            events[-1]["date"] if events else None,
        ],
    }

    return {
        "entity": entity,
        "events": events,
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# Top investigation targets
# ---------------------------------------------------------------------------

def get_top_entities(db: sqlite3.Connection, limit: int = 30) -> list[dict]:
    """Find entities with the most cross-table connections.

    Scores entities by how many different data tables they appear in,
    weighted by the significance of each connection type.
    """
    db.execute("PRAGMA busy_timeout = 600000")
    entities: dict[str, dict] = {}

    # Donors with total amounts
    rows = db.execute("""
        SELECT donor_name, SUM(amount) AS total, COUNT(*) AS cnt
        FROM donations
        WHERE donor_name IS NOT NULL AND donor_name != ''
        GROUP BY donor_name
        HAVING cnt >= 2
        ORDER BY total DESC
        LIMIT 500
    """).fetchall()
    for r in rows:
        name = _normalize_entity(r["donor_name"])
        if name not in entities:
            entities[name] = _empty_entity(name, r["donor_name"])
        entities[name]["donation_total"] += r["total"] or 0
        entities[name]["donation_count"] += r["cnt"]
        entities[name]["tables"].add("donations")

    # Contract suppliers
    rows = db.execute("""
        SELECT supplier_name, SUM(amount) AS total, COUNT(*) AS cnt
        FROM contracts
        WHERE supplier_name IS NOT NULL AND supplier_name != ''
        GROUP BY supplier_name
        HAVING cnt >= 1
        ORDER BY total DESC
        LIMIT 500
    """).fetchall()
    for r in rows:
        name = _normalize_entity(r["supplier_name"])
        if name not in entities:
            entities[name] = _empty_entity(name, r["supplier_name"])
        entities[name]["contract_total"] += r["total"] or 0
        entities[name]["contract_count"] += r["cnt"]
        entities[name]["tables"].add("contracts")

    # Contract-speech links (companies)
    rows = db.execute("""
        SELECT company_name, COUNT(*) AS cnt,
               SUM(contract_amount) AS contract_total,
               SUM(donation_amount) AS donation_total
        FROM contract_speech_links
        WHERE company_name IS NOT NULL AND company_name != ''
        GROUP BY company_name
        ORDER BY cnt DESC
        LIMIT 200
    """).fetchall()
    for r in rows:
        name = _normalize_entity(r["company_name"])
        if name not in entities:
            entities[name] = _empty_entity(name, r["company_name"])
        entities[name]["pay_to_play_count"] += r["cnt"]
        entities[name]["tables"].add("contract_speech_links")

    # Ministerial meetings (organisations)
    rows = db.execute("""
        SELECT organisation, COUNT(*) AS cnt
        FROM ministerial_meetings
        WHERE organisation IS NOT NULL AND organisation != ''
        GROUP BY organisation
        HAVING cnt >= 2
        ORDER BY cnt DESC
        LIMIT 200
    """).fetchall()
    for r in rows:
        name = _normalize_entity(r["organisation"])
        if name not in entities:
            entities[name] = _empty_entity(name, r["organisation"])
        entities[name]["meeting_count"] += r["cnt"]
        entities[name]["tables"].add("ministerial_meetings")

    # Board appointments (matched donors)
    rows = db.execute("""
        SELECT matched_donor_name, COUNT(*) AS cnt
        FROM board_appointments
        WHERE matched_donor_name IS NOT NULL AND matched_donor_name != ''
        GROUP BY matched_donor_name
        ORDER BY cnt DESC
        LIMIT 200
    """).fetchall()
    for r in rows:
        name = _normalize_entity(r["matched_donor_name"])
        if name not in entities:
            entities[name] = _empty_entity(name, r["matched_donor_name"])
        entities[name]["appointment_count"] += r["cnt"]
        entities[name]["tables"].add("board_appointments")

    # Lobbyist clients
    rows = db.execute("""
        SELECT client_name, COUNT(*) AS cnt
        FROM federal_lobbyist_clients
        WHERE client_name IS NOT NULL AND client_name != ''
        GROUP BY client_name
        ORDER BY cnt DESC
        LIMIT 200
    """).fetchall()
    for r in rows:
        name = _normalize_entity(r["client_name"])
        if name not in entities:
            entities[name] = _empty_entity(name, r["client_name"])
        entities[name]["lobbying_count"] += r["cnt"]
        entities[name]["tables"].add("federal_lobbyist_clients")

    # Score each entity
    for e in entities.values():
        table_count = len(e["tables"])
        # Base score: number of distinct tables (max ~6)
        # Bonus for cross-table connections (the real "follow the money" signal)
        e["score"] = (
            table_count * 10
            + min(e["donation_count"], 20)
            + min(e["contract_count"], 20)
            + min(e["meeting_count"], 10) * 2
            + min(e["pay_to_play_count"], 10) * 3
            + min(e["appointment_count"], 5) * 2
            + min(e["lobbying_count"], 5)
        )
        e["table_count"] = table_count
        e["tables"] = sorted(e["tables"])

    # Sort by score, then by table_count
    ranked = sorted(entities.values(), key=lambda x: (-x["score"], -x["table_count"]))
    return ranked[:limit]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _truncate(s: str, max_len: int) -> str:
    if len(s) <= max_len:
        return s
    return s[:max_len - 3] + "..."


def _fts5_escape(term: str) -> str:
    """Escape a search term for FTS5 MATCH queries."""
    # Wrap in double quotes to treat as a phrase
    escaped = term.replace('"', '""')
    return f'"{escaped}"'


def _normalize_entity(name: str) -> str:
    """Normalize entity name for deduplication."""
    return name.strip().lower()


def _empty_entity(normalized: str, display_name: str) -> dict:
    return {
        "name": display_name,
        "normalized": normalized,
        "donation_total": 0,
        "donation_count": 0,
        "contract_total": 0,
        "contract_count": 0,
        "meeting_count": 0,
        "pay_to_play_count": 0,
        "appointment_count": 0,
        "lobbying_count": 0,
        "score": 0,
        "table_count": 0,
        "tables": set(),
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Follow the Money timeline builder")
    parser.add_argument("entity", nargs="?", help="Entity name to investigate")
    parser.add_argument("--top", type=int, default=0, help="Show top N investigation targets")
    args = parser.parse_args()

    db = get_db()

    if args.top:
        print(f"\nTop {args.top} investigation targets:\n")
        targets = get_top_entities(db, limit=args.top)
        for i, t in enumerate(targets, 1):
            tables_str = ", ".join(t["tables"])
            print(f"  {i:3d}. {t['name']}")
            print(f"       Score: {t['score']}, Tables: {t['table_count']} ({tables_str})")
            if t["donation_total"]:
                print(f"       Donated: ${t['donation_total']:,.0f} ({t['donation_count']} records)")
            if t["contract_total"]:
                print(f"       Contracts: ${t['contract_total']:,.0f} ({t['contract_count']} records)")
            if t["meeting_count"]:
                print(f"       Meetings: {t['meeting_count']}")
            if t["pay_to_play_count"]:
                print(f"       Pay-to-play links: {t['pay_to_play_count']}")
            print()
    elif args.entity:
        result = build_timeline(db, args.entity)
        print(f"\nTimeline for '{args.entity}':")
        print(f"  Total events: {result['summary']['total_events']}")
        print(f"  Total donated: ${result['summary']['total_donated']:,.0f}")
        print(f"  Total contracts: ${result['summary']['total_contracts']:,.0f}")
        print(f"  Speeches: {result['summary']['speech_count']}")
        print(f"  Meetings: {result['summary']['meeting_count']}")
        print(f"  Date range: {result['summary']['date_range']}")
        print()
        for e in result["events"][:30]:
            amt = f" ${e['amount']:,.0f}" if e["amount"] else ""
            print(f"  {e['date_display']:12s} [{e['type']:12s}]{amt}")
            print(f"               {e['title']}")
    else:
        parser.print_help()
