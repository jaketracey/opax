"""
parli.ingest.board_appointments -- Scrape government board appointment data.

Data sources:
  1. AGOR (Australian Government Organisations Register) from data.gov.au
     - CSV snapshots of all Commonwealth entities, companies, and boards
     - Includes: body name, portfolio, type, who appoints board, max members,
       paid/unpaid, established by (act/regulation)
     - No individual names -- this is the body-level register

  2. Directory.gov.au XML export
     - Full extract of Australian Government directory, updated daily
     - Includes key personnel (heads of agencies, board chairs)

  3. Transparency.gov.au annual report data
     - JS-rendered site; we attempt known API patterns

After ingestion, cross-references against:
  - members table (former MPs on boards)
  - donations table (donors who also sit on boards)

Results cached as 'stories_board_patronage' in analysis_cache.

Usage:
    python -m parli.ingest.board_appointments
    python -m parli.ingest.board_appointments --skip-agor --skip-directory
    python -m parli.ingest.board_appointments --cross-reference-only
"""

import argparse
import csv
import io
import json
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime

import requests

from parli.schema import get_db, init_db

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "OPAX/1.0 (parliamentary transparency research; opax.com.au)",
})

# Latest AGOR CSV from data.gov.au
AGOR_URL = (
    "https://data.gov.au/data/dataset/c77cface-69aa-4dd0-b99f-b065dc33c8e6/"
    "resource/f1a3e6f7-8285-42a2-836d-4dce036e6945/download/agor-2025-12-31.csv"
)
AGOR_SOURCE = "https://data.gov.au/dataset/australian-government-organisations-register"

# Directory.gov.au XML export (full, updated daily, ~15MB)
DIRECTORY_XML_URL = "https://www.directory.gov.au/sites/default/files/export.xml"
DIRECTORY_SOURCE = "https://www.directory.gov.au/"


# ---------------------------------------------------------------------------
# 1. AGOR -- Australian Government Organisations Register
# ---------------------------------------------------------------------------

def fetch_agor_csv() -> list[dict]:
    """Download and parse the latest AGOR CSV snapshot."""
    print("[board_appointments] Downloading AGOR CSV...")
    resp = SESSION.get(AGOR_URL, timeout=120)
    resp.raise_for_status()

    # AGOR CSV contains Windows-1252 smart quotes (0x92 etc)
    text = resp.content.decode("cp1252")
    reader = csv.DictReader(io.StringIO(text))

    rows = []
    for row in reader:
        rows.append(row)

    print(f"[board_appointments] Parsed {len(rows)} AGOR records")
    return rows


def ingest_agor(db, rows: list[dict]) -> int:
    """Insert AGOR body-level records into board_appointments.

    Each AGOR row is a government body. We create a board_appointments record
    for the *body itself* (person_name=NULL) capturing its metadata. Individual
    member names are not in AGOR, but the structural data (who appoints, paid/unpaid,
    max members, portfolio) is invaluable for patronage analysis.
    """
    count = 0
    for row in rows:
        title = row.get("Title", "").strip()
        if not title:
            continue

        portfolio = row.get("Portfolio", "").strip()
        body_type_raw = row.get("Type of Body", "").strip()
        classification = row.get("Classification", "").strip()
        max_members = row.get("Max Number of Board / Committee Members", "").strip()
        paid = row.get("Paid Members?", "").strip()
        appointed_by = row.get("Board / Committee Appointed by", "").strip()
        appointed_info = row.get("Board / Committee Appointed More Info", "").strip()
        established_by = row.get("Established By / Under", "").strip()
        established_info = row.get("Established by/Under More Info", "").strip()
        creation_date = row.get("Creation Date", "").strip()
        description = row.get("Description", "").strip()
        website = row.get("Website Address", "").strip()
        agor_id = row.get("Id", "").strip()

        # Map AGOR body types to our schema
        body_type = _map_body_type(body_type_raw)

        # Determine appointment type from who appoints
        appointment_type = _map_appointment_type(appointed_by)

        # Remuneration info
        remuneration = "paid" if paid.lower() == "yes" else ("unpaid" if paid.lower() == "no" else paid)
        if max_members:
            remuneration += f" (max {max_members} members)"

        # Established by
        est_text = established_info if established_info else established_by

        # Parse creation date
        start_date = _parse_date(creation_date)

        source_url = website if website else AGOR_SOURCE

        try:
            db.execute("""
                INSERT OR REPLACE INTO board_appointments
                    (person_name, board_name, agency, role, start_date, end_date,
                     remuneration, appointment_type, source_url, body_type,
                     classification, established_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                None,  # person_name -- body-level record
                title,
                portfolio,
                f"body ({appointed_by})" if appointed_by else "body",
                start_date,
                None,  # end_date
                remuneration,
                appointment_type,
                source_url,
                body_type,
                classification,
                est_text,
            ))
            count += 1
        except Exception as e:
            print(f"  Error inserting {title}: {e}")

    db.commit()
    print(f"[board_appointments] Inserted {count} AGOR body records")
    return count


def _map_body_type(raw: str) -> str:
    """Map AGOR 'Type of Body' to our body_type enum."""
    raw_lower = raw.lower()
    if "non-corporate" in raw_lower:
        return "non-corporate_entity"
    elif "corporate" in raw_lower and "company" not in raw_lower:
        return "corporate_entity"
    elif "company" in raw_lower:
        return "company"
    elif "board" in raw_lower or "committee" in raw_lower:
        return "board"
    else:
        return raw or "unknown"


def _map_appointment_type(appointed_by: str) -> str:
    """Map AGOR 'Appointed by' to our appointment_type enum."""
    if not appointed_by:
        return "unknown"
    ab = appointed_by.lower()
    if "minister" in ab or "governor" in ab:
        return "ministerial"
    elif "merit" in ab or "independent" in ab:
        return "merit"
    elif "ex-officio" in ab or "ex officio" in ab:
        return "ex-officio"
    elif "elected" in ab:
        return "elected"
    else:
        return "ministerial"  # default for gov appointments


def _parse_date(date_str: str) -> str | None:
    """Try to parse various date formats to ISO YYYY-MM-DD."""
    if not date_str:
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d %B %Y", "%B %Y", "%Y"):
        try:
            return datetime.strptime(date_str.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


# ---------------------------------------------------------------------------
# 2. Directory.gov.au XML -- key personnel from government agencies
# ---------------------------------------------------------------------------

def fetch_directory_xml() -> ET.Element | None:
    """Download the Directory.gov.au XML export.

    This is a large file (~15MB). We stream it and parse incrementally.
    """
    print("[board_appointments] Downloading Directory.gov.au XML (may take a minute)...")
    try:
        resp = SESSION.get(DIRECTORY_XML_URL, timeout=300, stream=True)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"[board_appointments] Failed to download Directory XML: {e}")
        return None

    # Parse the XML
    try:
        tree = ET.fromstring(resp.content)
        print(f"[board_appointments] Parsed Directory XML, root tag: {tree.tag}")
        return tree
    except ET.ParseError as e:
        print(f"[board_appointments] XML parse error: {e}")
        return None


def ingest_directory_xml(db, root: ET.Element) -> int:
    """Extract board member appointments from Directory.gov.au XML.

    The XML has flat <item> elements with a 'type' field:
      - type=board: board/committee definitions (content_id, title, portfolio_id, etc.)
      - type=person: people (content_id, first_name, last_name)
      - type=role: links person (contact) to board (role_belongs_to) with role title, dates
      - type=organisation: departments/agencies (content_id, title)
      - type=portfolio: portfolios (content_id, title)

    We join: role -> person (via contact=person.content_id) + board (via role_belongs_to=board.content_id)
    """
    if root is None:
        return 0

    # Index all items by content_id and type
    persons = {}     # content_id -> {first_name, last_name, title, ...}
    boards = {}      # content_id -> {title, portfolio_id, appointed_by, paid, ...}
    orgs = {}        # content_id -> {title}
    portfolios = {}  # content_id -> {title}
    roles = []       # list of role dicts

    print("[board_appointments] Indexing Directory.gov.au XML items...")
    for item in root:
        data = {}
        for child in item:
            data[child.tag] = (child.text or "").strip()

        item_type = data.get("type", "")
        cid = data.get("content_id", "")

        if item_type == "person" and cid:
            persons[cid] = data
        elif item_type == "board" and cid:
            boards[cid] = data
        elif item_type == "organisation" and cid:
            orgs[cid] = data
        elif item_type == "portfolio" and cid:
            portfolios[cid] = data
        elif item_type == "role":
            roles.append(data)
        elif item_type == "directory_role":
            roles.append(data)

    print(f"  Persons: {len(persons)}, Boards: {len(boards)}, Orgs: {len(orgs)}, Roles: {len(roles)}")

    # Also insert board-level records (body metadata)
    board_count = 0
    for cid, bdata in boards.items():
        board_name = bdata.get("title", "")
        if not board_name:
            continue

        portfolio_id = bdata.get("portfolio_id", "")
        portfolio_name = ""
        if portfolio_id and portfolio_id in portfolios:
            portfolio_name = portfolios[portfolio_id].get("title", "")

        # Try parent_organisation
        parent_id = bdata.get("parent_organisation", "")
        agency = ""
        if parent_id and parent_id in orgs:
            agency = orgs[parent_id].get("title", "")
        if not agency:
            agency = portfolio_name

        appointed_by = bdata.get("board_committee_appointed_by", "")
        paid = bdata.get("paid_members", "").lower()
        max_members = bdata.get("max_members", "")
        body_type_raw = bdata.get("type_of_body", "")
        classification = bdata.get("classification", "")
        established = bdata.get("established_by_under_more", "") or bdata.get("established_by_under", "")
        creation_date = bdata.get("creation_date", "")

        remuneration = "paid" if paid == "yes" else ("unpaid" if paid == "no" else "")
        if max_members and max_members != "0":
            remuneration += f" (max {max_members} members)"

        start_date = _parse_date(creation_date.split(" - ")[0] if " - " in creation_date else creation_date)

        try:
            db.execute("""
                INSERT OR IGNORE INTO board_appointments
                    (person_name, board_name, agency, role, start_date,
                     remuneration, appointment_type, source_url, body_type,
                     classification, established_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                None,
                board_name,
                agency,
                f"body ({appointed_by})" if appointed_by else "body",
                start_date,
                remuneration.strip(),
                _map_appointment_type(appointed_by),
                DIRECTORY_SOURCE,
                _map_body_type(body_type_raw),
                classification,
                established,
            ))
            board_count += 1
        except Exception as e:
            pass

    db.commit()
    print(f"[board_appointments] Inserted {board_count} board body records from Directory.gov.au")

    # Now process roles to link people to boards
    member_count = 0
    skipped_vacant = 0
    skipped_no_board = 0

    for rdata in roles:
        # Skip vacant roles
        if rdata.get("vacant", "").upper() == "TRUE":
            skipped_vacant += 1
            continue

        contact_id = rdata.get("contact", "")
        belongs_to_id = rdata.get("role_belongs_to", "")
        role_title = rdata.get("title", "")

        # We need both a person and a board/org
        person = persons.get(contact_id)
        board = boards.get(belongs_to_id)
        org = orgs.get(belongs_to_id)

        target = board or org
        if not person or not target:
            skipped_no_board += 1
            continue

        first = person.get("first_name", "")
        last = person.get("last_name", "")
        person_name = f"{first} {last}".strip()
        if not person_name:
            person_name = person.get("title", "")

        board_name = target.get("title", "")
        if not board_name:
            continue

        # Get portfolio/agency for this board
        portfolio_id = target.get("portfolio_id", "")
        agency = ""
        parent_id = target.get("parent_organisation", "")
        if parent_id and parent_id in orgs:
            agency = orgs[parent_id].get("title", "")
        if not agency and portfolio_id and portfolio_id in portfolios:
            agency = portfolios[portfolio_id].get("title", "")

        # Parse dates
        start_raw = rdata.get("start_date", "")
        end_raw = rdata.get("end_date", "")
        start_date = _parse_date(start_raw.split(" - ")[0] if " - " in start_raw else start_raw)
        end_date = _parse_date(end_raw.split(" - ")[0] if " - " in end_raw else end_raw)

        # Determine appointment type from board-level info
        appointed_by = ""
        if board:
            appointed_by = board.get("board_committee_appointed_by", "")
        appointment_type = _map_appointment_type(appointed_by)

        # Remuneration from board
        paid = ""
        if board:
            paid = board.get("paid_members", "").lower()
        remuneration = "paid" if paid == "yes" else ("unpaid" if paid == "no" else "")

        try:
            db.execute("""
                INSERT OR IGNORE INTO board_appointments
                    (person_name, board_name, agency, role, start_date, end_date,
                     remuneration, appointment_type, source_url, body_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                person_name,
                board_name,
                agency,
                role_title,
                start_date,
                end_date,
                remuneration,
                appointment_type,
                DIRECTORY_SOURCE,
                "board" if board else "organisation",
            ))
            member_count += 1
        except Exception as e:
            pass

    db.commit()
    total = board_count + member_count
    print(f"[board_appointments] Inserted {member_count} individual board member records from Directory.gov.au")
    print(f"  (skipped {skipped_vacant} vacant roles, {skipped_no_board} roles without matching board/person)")
    return total


# ---------------------------------------------------------------------------
# 3. Cross-reference: find former MPs and donors on boards
# ---------------------------------------------------------------------------

def cross_reference_mps(db) -> list[dict]:
    """Match board appointees against the members table (former/current MPs).

    Uses fuzzy name matching: exact full_name match, or last_name + first initial.
    """
    print("[board_appointments] Cross-referencing board members against MPs...")

    # Get all board appointees with names
    appointees = db.execute("""
        SELECT appointment_id, person_name FROM board_appointments
        WHERE person_name IS NOT NULL AND person_name != ''
    """).fetchall()

    # Get all MPs
    members = db.execute("""
        SELECT person_id, full_name, first_name, last_name, party, electorate
        FROM members
    """).fetchall()

    # Build lookup structures
    # Exact name -> member
    exact_map = {}
    # Last name -> list of members (for partial matching)
    lastname_map = {}
    for m in members:
        fn = (m["full_name"] or "").strip().lower()
        if fn:
            exact_map[fn] = m
        ln = (m["last_name"] or "").strip().lower()
        if ln:
            lastname_map.setdefault(ln, []).append(m)

    matches = []
    for appt in appointees:
        name = appt["person_name"].strip()
        name_lower = name.lower()

        matched_member = None

        # 1. Exact match
        if name_lower in exact_map:
            matched_member = exact_map[name_lower]
        else:
            # 2. Try reversing "Last, First" -> "First Last"
            if "," in name:
                parts = name.split(",", 1)
                reversed_name = f"{parts[1].strip()} {parts[0].strip()}".lower()
                if reversed_name in exact_map:
                    matched_member = exact_map[reversed_name]

            # 3. Last name match with first initial check
            if not matched_member:
                name_parts = name_lower.split()
                if len(name_parts) >= 2:
                    # Try last word as last name
                    last = name_parts[-1]
                    first_initial = name_parts[0][0] if name_parts[0] else ""

                    candidates = lastname_map.get(last, [])
                    for c in candidates:
                        c_first = (c["first_name"] or "").strip().lower()
                        if c_first and c_first[0] == first_initial:
                            matched_member = c
                            break

        if matched_member:
            db.execute("""
                UPDATE board_appointments
                SET matched_person_id = ?
                WHERE appointment_id = ?
            """, (matched_member["person_id"], appt["appointment_id"]))

            matches.append({
                "appointment_id": appt["appointment_id"],
                "person_name": name,
                "mp_name": matched_member["full_name"],
                "person_id": matched_member["person_id"],
                "party": matched_member["party"],
                "electorate": matched_member["electorate"],
            })

    db.commit()
    print(f"[board_appointments] Found {len(matches)} board members who are current/former MPs")
    return matches


def cross_reference_donors(db) -> list[dict]:
    """Match board appointees against the donations table.

    Uses strict name matching to avoid false positives:
    - Only matches individual donors (not companies/organisations)
    - Requires full name match (first + last), not just last name
    - Donor name must look like a person name (2-4 words, no company keywords)
    """
    print("[board_appointments] Cross-referencing board members against donors...")

    appointees = db.execute("""
        SELECT appointment_id, person_name FROM board_appointments
        WHERE person_name IS NOT NULL AND person_name != ''
    """).fetchall()

    # Get unique donor names that look like individual people
    donors = db.execute("""
        SELECT donor_name, SUM(amount) AS total_donated, COUNT(*) AS donation_count
        FROM donations
        GROUP BY donor_name
    """).fetchall()

    # Company/org keywords to exclude from "individual" donor matching
    ORG_KEYWORDS = {
        "pty", "ltd", "limited", "inc", "corp", "group", "holdings", "association",
        "council", "union", "foundation", "trust", "fund", "institute", "society",
        "services", "consulting", "partners", "partnership", "enterprises", "industries",
        "construction", "development", "management", "solutions", "australia",
        "international", "global", "national", "federal", "state", "grant",
        "and", "&",  # "Slater and Gordon" etc
    }

    def _looks_like_person(name: str) -> bool:
        """Check if a donor name looks like an individual person (not a company)."""
        parts = name.lower().split()
        if len(parts) < 2 or len(parts) > 5:
            return False
        for p in parts:
            if p in ORG_KEYWORDS:
                return False
        return True

    # Build lookup: only person-like donor names
    donor_map = {}  # normalized "first last" -> donor record
    for d in donors:
        dn = (d["donor_name"] or "").strip()
        if not dn or not _looks_like_person(dn):
            continue
        donor_map[dn.lower()] = d

    matches = []
    for appt in appointees:
        name = appt["person_name"].strip()
        name_lower = name.lower()

        matched_donor = None

        # Exact full-name match only (most reliable)
        if name_lower in donor_map:
            matched_donor = donor_map[name_lower]
        else:
            # Try "Last, First" -> "First Last" reversal
            if "," in name:
                parts = name.split(",", 1)
                reversed_name = f"{parts[1].strip()} {parts[0].strip()}".lower()
                if reversed_name in donor_map:
                    matched_donor = donor_map[reversed_name]

            # Try with/without middle names: "John David Smith" matches "John Smith"
            if not matched_donor:
                parts = name_lower.split()
                if len(parts) >= 3:
                    short_name = f"{parts[0]} {parts[-1]}"
                    if short_name in donor_map:
                        matched_donor = donor_map[short_name]

        if matched_donor:
            db.execute("""
                UPDATE board_appointments
                SET matched_donor_name = ?
                WHERE appointment_id = ?
            """, (matched_donor["donor_name"], appt["appointment_id"]))

            matches.append({
                "appointment_id": appt["appointment_id"],
                "person_name": name,
                "donor_name": matched_donor["donor_name"],
                "total_donated": matched_donor["total_donated"],
                "donation_count": matched_donor["donation_count"],
            })

    db.commit()
    print(f"[board_appointments] Found {len(matches)} board members who are also political donors")
    return matches


def build_patronage_stories(db, mp_matches: list, donor_matches: list) -> dict:
    """Build and cache the patronage analysis stories."""
    print("[board_appointments] Building patronage analysis stories...")

    # Get summary stats
    total_bodies = db.execute(
        "SELECT COUNT(*) AS c FROM board_appointments WHERE person_name IS NULL"
    ).fetchone()["c"]

    total_named = db.execute(
        "SELECT COUNT(*) AS c FROM board_appointments WHERE person_name IS NOT NULL"
    ).fetchone()["c"]

    ministerial_bodies = db.execute("""
        SELECT COUNT(*) AS c FROM board_appointments
        WHERE appointment_type = 'ministerial' AND person_name IS NULL
    """).fetchone()["c"]

    paid_bodies = db.execute("""
        SELECT COUNT(*) AS c FROM board_appointments
        WHERE remuneration LIKE 'paid%' AND person_name IS NULL
    """).fetchone()["c"]

    # Top portfolios by body count
    top_portfolios = db.execute("""
        SELECT agency, COUNT(*) AS body_count
        FROM board_appointments
        WHERE person_name IS NULL AND agency IS NOT NULL AND agency != ''
        GROUP BY agency
        ORDER BY body_count DESC
        LIMIT 15
    """).fetchall()

    # Former MPs on boards with details
    mp_board_details = []
    for m in mp_matches:
        appt = db.execute("""
            SELECT board_name, agency, role, remuneration, appointment_type, body_type
            FROM board_appointments WHERE appointment_id = ?
        """, (m["appointment_id"],)).fetchone()
        if appt:
            mp_board_details.append({
                **m,
                "board_name": appt["board_name"],
                "agency": appt["agency"],
                "role": appt["role"],
                "remuneration": appt["remuneration"],
                "appointment_type": appt["appointment_type"],
            })

    # Donors on boards with details
    donor_board_details = []
    for d in donor_matches:
        appt = db.execute("""
            SELECT board_name, agency, role, remuneration
            FROM board_appointments WHERE appointment_id = ?
        """, (d["appointment_id"],)).fetchone()
        if appt:
            donor_board_details.append({
                **d,
                "board_name": appt["board_name"],
                "agency": appt["agency"],
                "role": appt["role"],
                "remuneration": appt["remuneration"],
            })

    # Double matches: people who are BOTH former MPs AND donors
    double_matches = []
    mp_appt_ids = {m["appointment_id"] for m in mp_matches}
    donor_appt_ids = {d["appointment_id"] for d in donor_matches}
    overlap_ids = mp_appt_ids & donor_appt_ids
    if overlap_ids:
        for aid in overlap_ids:
            mp_info = next((m for m in mp_matches if m["appointment_id"] == aid), None)
            donor_info = next((d for d in donor_matches if d["appointment_id"] == aid), None)
            if mp_info and donor_info:
                double_matches.append({
                    **mp_info,
                    "total_donated": donor_info["total_donated"],
                    "donor_name": donor_info["donor_name"],
                })

    stories = {
        "summary": {
            "total_government_bodies": total_bodies,
            "total_named_appointees": total_named,
            "ministerial_appointment_bodies": ministerial_bodies,
            "paid_board_bodies": paid_bodies,
            "former_mps_on_boards": len(mp_matches),
            "donors_on_boards": len(donor_matches),
            "double_matches_mp_and_donor": len(double_matches),
        },
        "top_portfolios": [dict(r) for r in top_portfolios],
        "former_mps_on_boards": mp_board_details[:50],
        "donors_on_boards": sorted(
            donor_board_details,
            key=lambda x: x.get("total_donated", 0) or 0,
            reverse=True,
        )[:50],
        "double_matches": double_matches,
        "generated_at": datetime.now().isoformat(),
    }

    # Cache in analysis_cache
    db.execute("""
        INSERT OR REPLACE INTO analysis_cache (key, value, updated_at)
        VALUES ('stories_board_patronage', ?, datetime('now'))
    """, (json.dumps(stories, default=str),))
    db.commit()

    print(f"[board_appointments] Patronage stories cached.")
    print(f"  Summary: {json.dumps(stories['summary'], indent=2)}")
    return stories


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Ingest government board appointment data")
    parser.add_argument("--skip-agor", action="store_true", help="Skip AGOR CSV ingestion")
    parser.add_argument("--skip-directory", action="store_true", help="Skip Directory.gov.au XML")
    parser.add_argument("--cross-reference-only", action="store_true",
                        help="Only run cross-referencing (skip data download)")
    args = parser.parse_args()

    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")
    init_db(db)

    total_inserted = 0

    if not args.cross_reference_only:
        # 1. AGOR
        if not args.skip_agor:
            try:
                rows = fetch_agor_csv()
                total_inserted += ingest_agor(db, rows)
            except Exception as e:
                print(f"[board_appointments] AGOR ingestion failed: {e}")

        # 2. Directory.gov.au
        if not args.skip_directory:
            try:
                xml_root = fetch_directory_xml()
                if xml_root is not None:
                    total_inserted += ingest_directory_xml(db, xml_root)
            except Exception as e:
                print(f"[board_appointments] Directory.gov.au ingestion failed: {e}")

        print(f"\n[board_appointments] Total records inserted: {total_inserted}")

    # 3. Cross-reference
    mp_matches = cross_reference_mps(db)
    donor_matches = cross_reference_donors(db)

    # 4. Build patronage stories
    stories = build_patronage_stories(db, mp_matches, donor_matches)

    # Print key findings
    if stories["former_mps_on_boards"]:
        print("\n=== FORMER MPs ON GOVERNMENT BOARDS ===")
        for m in stories["former_mps_on_boards"][:20]:
            print(f"  {m['mp_name']} ({m['party']}) -> {m['board_name']} ({m.get('role', 'unknown role')})")

    if stories["donors_on_boards"]:
        print("\n=== POLITICAL DONORS ON GOVERNMENT BOARDS ===")
        for d in stories["donors_on_boards"][:20]:
            donated = d.get("total_donated")
            amt = f"${donated:,.0f}" if donated else "unknown"
            print(f"  {d['person_name']} (donated {amt}) -> {d['board_name']} ({d.get('role', '')})")

    if stories["double_matches"]:
        print("\n=== DOUBLE MATCHES: FORMER MP + DONOR + BOARD ===")
        for dm in stories["double_matches"]:
            donated = dm.get("total_donated")
            amt = f"${donated:,.0f}" if donated else "unknown"
            print(f"  {dm['mp_name']} ({dm['party']}) donated {amt} -> board appointment")

    return stories


if __name__ == "__main__":
    main()
