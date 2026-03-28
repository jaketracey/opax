"""
parli.analysis.contract_speech_links -- Contract-Speech Cross-Referencing

The "smoking gun" feature: connects the dots between political donations,
parliamentary speeches, and government contracts.

For each company that BOTH donated to a party AND won government contracts,
search Hansard for speeches where MPs mentioned that company. Flag cases
where the speaking MP's party received donations from the company.

Results are stored in the `contract_speech_links` table for the API to serve.

Usage:
    python -m parli.analysis.contract_speech_links
    python -m parli.analysis.contract_speech_links --rebuild
    python -m parli.analysis.contract_speech_links --dry-run
"""

import argparse
import re
import sqlite3
import time
from datetime import datetime

from parli.schema import get_db, init_db


# ---------------------------------------------------------------------------
# Table creation
# ---------------------------------------------------------------------------

CONTRACT_SPEECH_LINKS_SQL = """
CREATE TABLE IF NOT EXISTS contract_speech_links (
    link_id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id TEXT NOT NULL,
    speech_id INTEGER NOT NULL,
    person_id TEXT,
    company_name TEXT NOT NULL,
    supplier_name TEXT,
    donor_name TEXT,
    contract_amount REAL,
    donation_amount REAL,
    party TEXT,
    recipient_party TEXT,
    match_type TEXT NOT NULL,
        -- 'party_match': MP's party received donations from this company
        -- 'other_party': MP mentioned company but their party did NOT receive donations
        -- 'no_party': MP has no party affiliation recorded
    speech_date TEXT,
    speech_snippet TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(contract_id, speech_id)
);

CREATE INDEX IF NOT EXISTS idx_csl_company ON contract_speech_links(company_name);
CREATE INDEX IF NOT EXISTS idx_csl_party ON contract_speech_links(party);
CREATE INDEX IF NOT EXISTS idx_csl_person ON contract_speech_links(person_id);
CREATE INDEX IF NOT EXISTS idx_csl_match_type ON contract_speech_links(match_type);
CREATE INDEX IF NOT EXISTS idx_csl_contract_amount ON contract_speech_links(contract_amount DESC);
"""


def ensure_table(db: sqlite3.Connection) -> None:
    """Create the contract_speech_links table if it doesn't exist."""
    db.executescript(CONTRACT_SPEECH_LINKS_SQL)


# ---------------------------------------------------------------------------
# Name normalisation (shared logic with austender.py)
# ---------------------------------------------------------------------------

STRIP_SUFFIXES = [
    " PTY LTD", " PTY. LTD.", " PTY LIMITED", " LIMITED",
    " LTD", " INC", " INCORPORATED", " CORP", " CORPORATION",
    " AUSTRALIA", " GROUP", " HOLDINGS", " SERVICES",
]


def normalise_name(name: str) -> str:
    """Strip common corporate suffixes and normalise for matching."""
    n = name.upper().strip()
    for suffix in STRIP_SUFFIXES:
        n = n.replace(suffix, "")
    return n.strip()


def build_fts_query(name: str) -> str:
    """Build an FTS5 query from a company name.

    Takes a normalised company name and builds a quoted phrase query.
    Falls back to AND-ing significant words if the name is multi-word.
    """
    # Clean the name for FTS5 — remove special characters
    cleaned = re.sub(r"[^a-zA-Z0-9\s]", "", name)
    words = cleaned.split()

    if not words:
        return ""

    # Use a quoted phrase for exact matching
    phrase = " ".join(words)
    return f'"{phrase}"'


def build_fts_fallback(name: str) -> str:
    """Build a looser FTS5 query using AND of significant words.

    Used when the exact phrase query returns no results.
    Filters out very short words to reduce false positives.
    """
    cleaned = re.sub(r"[^a-zA-Z0-9\s]", "", name)
    words = [w for w in cleaned.split() if len(w) >= 3]

    if len(words) < 2:
        return ""

    return " AND ".join(words)


# ---------------------------------------------------------------------------
# Core analysis
# ---------------------------------------------------------------------------

def find_donor_contractor_matches(db: sqlite3.Connection) -> list[dict]:
    """Find companies that donated AND won contracts (reuses austender logic).

    Returns list of dicts with supplier_name, donor_name, party (recipient),
    donation_total, contract_total, plus lists of individual contract_ids.
    """
    suppliers = db.execute(
        "SELECT DISTINCT supplier_name FROM contracts WHERE supplier_name != ''"
    ).fetchall()

    donors = db.execute(
        "SELECT DISTINCT donor_name FROM donations WHERE donor_name != ''"
    ).fetchall()

    # Build normalised donor lookup
    donor_lookup: dict[str, list[str]] = {}
    for row in donors:
        norm = normalise_name(row["donor_name"])
        if len(norm) < 3:
            continue
        donor_lookup.setdefault(norm, []).append(row["donor_name"])

    matches = []
    for row in suppliers:
        norm_supplier = normalise_name(row["supplier_name"])
        if norm_supplier not in donor_lookup:
            continue

        # Get all contracts for this supplier
        contracts = db.execute(
            "SELECT contract_id, amount FROM contracts WHERE supplier_name = ?",
            (row["supplier_name"],),
        ).fetchall()

        for donor_name in donor_lookup[norm_supplier]:
            # Get donation totals by recipient party
            donations = db.execute(
                """SELECT recipient, SUM(amount) as total, COUNT(*) as count
                   FROM donations WHERE donor_name = ? GROUP BY recipient""",
                (donor_name,),
            ).fetchall()

            for d in donations:
                matches.append({
                    "supplier_name": row["supplier_name"],
                    "donor_name": donor_name,
                    "recipient_party": d["recipient"],
                    "donation_total": d["total"] or 0,
                    "donation_count": d["count"],
                    "contracts": [
                        {"contract_id": c["contract_id"], "amount": c["amount"]}
                        for c in contracts
                    ],
                })

    return matches


def search_speeches_for_company(
    db: sqlite3.Connection,
    company_name: str,
) -> list[dict]:
    """Search speeches_fts for mentions of a company name.

    Tries exact phrase first, then falls back to AND of significant words.
    Returns list of speech dicts with speech_id, person_id, party, date, snippet.
    """
    norm = normalise_name(company_name)
    fts_query = build_fts_query(norm)
    if not fts_query:
        return []

    results = []

    # Try exact phrase match first
    try:
        rows = db.execute(
            """
            SELECT s.speech_id, s.person_id, s.speaker_name, s.party,
                   s.date, s.topic, snippet(speeches_fts, 2, '>>>', '<<<', '...', 40) as snippet
            FROM speeches_fts
            JOIN speeches s ON s.speech_id = speeches_fts.rowid
            WHERE speeches_fts MATCH ?
            ORDER BY rank
            LIMIT 50
            """,
            (fts_query,),
        ).fetchall()
        results = [dict(r) for r in rows]
    except sqlite3.OperationalError:
        # FTS5 query syntax error — skip exact match
        pass

    # If exact phrase gave nothing, try fallback AND query
    if not results:
        fallback_query = build_fts_fallback(norm)
        if fallback_query:
            try:
                rows = db.execute(
                    """
                    SELECT s.speech_id, s.person_id, s.speaker_name, s.party,
                           s.date, s.topic,
                           snippet(speeches_fts, 2, '>>>', '<<<', '...', 40) as snippet
                    FROM speeches_fts
                    JOIN speeches s ON s.speech_id = speeches_fts.rowid
                    WHERE speeches_fts MATCH ?
                    ORDER BY rank
                    LIMIT 50
                    """,
                    (fallback_query,),
                ).fetchall()
                results = [dict(r) for r in rows]
            except sqlite3.OperationalError:
                pass

    return results


def classify_match(
    mp_party: str | None,
    recipient_party: str | None,
) -> str:
    """Determine the match_type based on MP party vs donation recipient.

    Returns:
        'party_match'  — MP's party received donations from this company
        'other_party'  — MP mentioned company but their party did NOT receive
        'no_party'     — MP has no party affiliation recorded
    """
    if not mp_party:
        return "no_party"
    if not recipient_party:
        return "other_party"

    # Normalise party names for comparison
    mp_norm = mp_party.upper().strip()
    recip_norm = recipient_party.upper().strip()

    # Check if the MP's party matches the donation recipient
    # Handles variations like "Australian Labor Party" matching "Labor"
    party_keywords = {
        "LABOR": ["LABOR", "ALP"],
        "LIBERAL": ["LIBERAL", "LIB"],
        "NATIONAL": ["NATIONAL", "NAT", "NATIONALS"],
        "GREEN": ["GREEN", "GREENS", "AUSTRALIAN GREENS"],
    }

    for _base, keywords in party_keywords.items():
        mp_match = any(kw in mp_norm for kw in keywords)
        recip_match = any(kw in recip_norm for kw in keywords)
        if mp_match and recip_match:
            return "party_match"

    # Direct substring check for less common parties
    if mp_norm in recip_norm or recip_norm in mp_norm:
        return "party_match"

    return "other_party"


def run_analysis(
    db: sqlite3.Connection,
    rebuild: bool = False,
    dry_run: bool = False,
) -> dict:
    """Run the full contract-speech cross-referencing analysis.

    Args:
        db: Database connection.
        rebuild: If True, drop and recreate the links table.
        dry_run: If True, print results but don't write to DB.

    Returns:
        Summary dict with counts.
    """
    db.execute("PRAGMA busy_timeout = 300000")

    if rebuild:
        db.execute("DROP TABLE IF EXISTS contract_speech_links")
        print("Dropped existing contract_speech_links table")

    ensure_table(db)

    # Step 1: Find donor-contractor matches
    print("Finding donor-contractor matches...")
    matches = find_donor_contractor_matches(db)
    print(f"  Found {len(matches)} donor-contractor-party connections")

    if not matches:
        print("No donor-contractor matches found. Ensure both contracts and donations are loaded.")
        return {"matches": 0, "links_created": 0, "party_matches": 0}

    # Step 2: For each match, search speeches
    total_links = 0
    party_match_count = 0
    companies_with_speeches = 0
    seen_companies = set()

    for i, match in enumerate(matches):
        company = match["supplier_name"]

        # Avoid searching the same company multiple times
        # (a company may donate to multiple parties)
        if company not in seen_companies:
            seen_companies.add(company)
            speeches = search_speeches_for_company(db, company)
            if speeches:
                companies_with_speeches += 1
                if not dry_run:
                    print(
                        f"  [{i+1}/{len(matches)}] {company}: "
                        f"{len(speeches)} speeches found"
                    )
        else:
            # Re-use cached speech results — search again for consistent inserts
            speeches = search_speeches_for_company(db, company)

        if not speeches:
            continue

        # Step 3: Create links
        for speech in speeches:
            match_type = classify_match(
                speech.get("party"),
                match["recipient_party"],
            )

            if match_type == "party_match":
                party_match_count += 1

            # Pick the largest contract for this supplier as representative
            max_contract = max(
                match["contracts"],
                key=lambda c: c["amount"] or 0,
            )

            if dry_run:
                flag = " *** PARTY MATCH ***" if match_type == "party_match" else ""
                print(
                    f"    {speech.get('speaker_name', '?')} ({speech.get('party', '?')}) "
                    f"on {speech.get('date', '?')}{flag}"
                )
                total_links += 1
                continue

            for _attempt in range(15):
                try:
                    db.execute(
                        """
                        INSERT OR IGNORE INTO contract_speech_links
                        (contract_id, speech_id, person_id, company_name,
                         supplier_name, donor_name,
                         contract_amount, donation_amount,
                         party, recipient_party, match_type,
                         speech_date, speech_snippet)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            max_contract["contract_id"],
                            speech["speech_id"],
                            speech.get("person_id"),
                            normalise_name(company),
                            match["supplier_name"],
                            match["donor_name"],
                            max_contract["amount"],
                            match["donation_total"],
                            speech.get("party"),
                            match["recipient_party"],
                            match_type,
                            speech.get("date"),
                            speech.get("snippet", "")[:500],
                        ),
                    )
                    total_links += 1
                    break
                except sqlite3.IntegrityError:
                    break  # Duplicate
                except sqlite3.OperationalError as e:
                    if "locked" in str(e) and _attempt < 14:
                        time.sleep(3 * (_attempt + 1))
                    else:
                        raise

        # Commit in batches to avoid holding locks too long
        if not dry_run and (i + 1) % 10 == 0:
            db.commit()

    if not dry_run:
        db.commit()

    summary = {
        "donor_contractor_matches": len(matches),
        "companies_searched": len(seen_companies),
        "companies_with_speeches": companies_with_speeches,
        "links_created": total_links,
        "party_matches": party_match_count,
    }

    return summary


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Cross-reference government contracts with parliamentary speeches and donations"
    )
    parser.add_argument(
        "--rebuild", action="store_true",
        help="Drop and recreate the contract_speech_links table",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print matches but don't write to the database",
    )
    args = parser.parse_args()

    print("=== Contract-Speech Cross-Reference Analysis ===")
    print(f"Started at {datetime.now().isoformat()}\n")

    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")
    init_db(db)

    # Print current data counts
    n_contracts = db.execute("SELECT COUNT(*) FROM contracts").fetchone()[0]
    n_donations = db.execute("SELECT COUNT(*) FROM donations").fetchone()[0]
    n_speeches = db.execute("SELECT COUNT(*) FROM speeches").fetchone()[0]
    print(f"Database: {n_contracts} contracts, {n_donations} donations, {n_speeches} speeches\n")

    if n_contracts == 0:
        print("No contracts in database. Run: python -m parli.ingest.austender --limit 1000")
        return
    if n_donations == 0:
        print("No donations in database. Ingest donation data first.")
        return

    summary = run_analysis(db, rebuild=args.rebuild, dry_run=args.dry_run)

    print(f"\n=== Summary ===")
    print(f"  Donor-contractor connections: {summary['donor_contractor_matches']}")
    print(f"  Companies searched:           {summary['companies_searched']}")
    print(f"  Companies mentioned in Hansard: {summary['companies_with_speeches']}")
    print(f"  Total links created:          {summary['links_created']}")
    print(f"  Party matches (smoking guns): {summary['party_matches']}")

    if not args.dry_run and summary["links_created"] > 0:
        # Show top party matches
        top = db.execute(
            """
            SELECT company_name, party, recipient_party,
                   contract_amount, donation_amount,
                   COUNT(*) as mention_count
            FROM contract_speech_links
            WHERE match_type = 'party_match'
            GROUP BY company_name, party
            ORDER BY contract_amount DESC
            LIMIT 15
            """,
        ).fetchall()

        if top:
            print(f"\n=== Top Party Matches (MPs mentioning companies that donated to their party) ===")
            for r in top:
                c_amt = f"${r['contract_amount']:,.0f}" if r["contract_amount"] else "?"
                d_amt = f"${r['donation_amount']:,.0f}" if r["donation_amount"] else "?"
                print(
                    f"  {r['company_name']}\n"
                    f"    {r['party']} MPs mentioned {r['mention_count']}x | "
                    f"Contracts: {c_amt} | Donated {d_amt} to {r['recipient_party']}\n"
                )

    print(f"\nCompleted at {datetime.now().isoformat()}")


if __name__ == "__main__":
    main()
