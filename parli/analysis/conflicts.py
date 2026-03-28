"""
parli.analysis.conflicts -- Conflict of interest detector for OPAX.

Cross-references MP declared interests (shareholdings, properties,
directorships) with their parliamentary voting record to flag potential
conflicts of interest:

  1. Shareholding conflicts: MP holds shares in Company X AND voted on
     legislation affecting that company or its industry.
  2. Property conflicts: MP owns investment properties AND voted on
     housing / negative gearing / CGT legislation.
  3. Directorship conflicts: MP holds a directorship AND voted on
     legislation affecting that company or industry.

Results are stored in analysis_cache as 'stories_conflicts_of_interest'.

Usage:
    python -m parli.analysis.conflicts
    python -m parli.analysis.conflicts --person-id 10007
"""

import json
import re
import sys
import time
from collections import defaultdict
from datetime import datetime

from parli.schema import get_db, init_db


# ---------------------------------------------------------------------------
# Company-to-industry mapping and division keyword matching
# ---------------------------------------------------------------------------

# Maps well-known company names (lowercase) to industry keywords that
# would appear in division names/summaries.
COMPANY_INDUSTRY_MAP: dict[str, list[str]] = {
    # Mining / resources
    "bhp": ["mining", "mineral", "minerals", "coal", "iron ore", "mining tax", "resource rent"],
    "rio tinto": ["mining", "mineral", "minerals", "coal", "iron ore", "mining tax", "resource rent"],
    "fortescue": ["mining", "mineral", "minerals", "iron ore", "mining tax", "resource rent"],
    "newcrest": ["mining", "mineral", "gold", "mining tax"],
    "south32": ["mining", "mineral", "coal", "alumina"],
    "santos": ["petroleum", "oil", "gas", "fossil fuel", "carbon", "emissions", "energy"],
    "woodside": ["petroleum", "oil", "gas", "fossil fuel", "carbon", "emissions", "energy"],
    "origin energy": ["energy", "gas", "petroleum", "carbon", "emissions", "electricity"],
    "agl": ["energy", "electricity", "gas", "carbon", "emissions", "clean energy"],
    "whitehaven coal": ["coal", "mining", "carbon", "emissions"],
    # Banks / finance
    "commonwealth bank": ["banking", "bank", "financial", "superannuation", "franking", "hayne"],
    "cba": ["banking", "bank", "financial", "superannuation", "franking", "hayne"],
    "westpac": ["banking", "bank", "financial", "superannuation", "franking", "hayne"],
    "anz": ["banking", "bank", "financial", "superannuation", "franking"],
    "nab": ["banking", "bank", "financial", "superannuation", "franking"],
    "national australia bank": ["banking", "bank", "financial", "superannuation", "franking"],
    "macquarie": ["banking", "bank", "financial", "infrastructure"],
    # Insurance
    "qbe": ["insurance", "financial"],
    "iag": ["insurance", "financial"],
    "suncorp": ["insurance", "banking", "financial"],
    # Property / construction
    "lendlease": ["housing", "property", "construction", "infrastructure", "real estate"],
    "stockland": ["housing", "property", "real estate", "negative gearing", "capital gains"],
    "mirvac": ["housing", "property", "real estate", "negative gearing"],
    "dexus": ["property", "real estate"],
    # Telecommunications
    "telstra": ["telecommunications", "broadband", "nbn", "digital", "spectrum"],
    "optus": ["telecommunications", "broadband", "digital", "spectrum"],
    "tpg": ["telecommunications", "broadband", "digital"],
    # Health / pharma
    "csl": ["health", "pharmaceutical", "therapeutic goods", "medicine"],
    "cochlear": ["health", "medical", "therapeutic goods"],
    "resmed": ["health", "medical", "therapeutic goods"],
    "ramsay health": ["health", "hospital", "aged care"],
    "ansell": ["health", "medical"],
    # Gambling
    "tabcorp": ["gambling", "gaming", "wagering", "betting"],
    "crown resorts": ["gambling", "gaming", "casino"],
    "star entertainment": ["gambling", "gaming", "casino"],
    "aristocrat": ["gambling", "gaming", "poker machine", "pokies"],
    "ainsworth": ["gambling", "gaming", "poker machine"],
    # Retail
    "woolworths": ["retail", "grocery", "pokies", "gambling", "liquor"],
    "wesfarmers": ["retail", "mining", "industrial"],
    "coles": ["retail", "grocery"],
    # Tech
    "atlassian": ["technology", "digital"],
    "xero": ["technology", "digital", "tax"],
    # Transport
    "qantas": ["aviation", "transport", "airline"],
    "transurban": ["infrastructure", "roads", "toll", "transport"],
    # Agriculture
    "elders": ["agriculture", "farming", "rural"],
    "graincorp": ["agriculture", "farming", "grain"],
    # Media
    "news corp": ["media", "broadcasting", "press", "digital platforms"],
    "nine entertainment": ["media", "broadcasting", "press"],
    "seven west": ["media", "broadcasting", "press"],
}

# Keywords for property-related divisions
PROPERTY_DIVISION_KEYWORDS = [
    "housing", "negative gearing", "capital gains", "property",
    "real estate", "affordable housing", "first home", "rent",
    "tenant", "homelessness", "residential tenancy", "stamp duty",
    "land tax", "foreign investment in residential",
]

# Keywords for general financial conflicts
FINANCE_DIVISION_KEYWORDS = [
    "banking", "bank", "financial", "superannuation", "insurance",
    "credit", "franking", "hayne", "royal commission into misconduct",
    "prudential", "apra", "asic",
]


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


def _match_company_to_keywords(company_name: str) -> list[str]:
    """Map a company name to division search keywords.

    First checks the hardcoded map, then falls back to using the company
    name itself as a keyword (useful for less common companies).
    """
    name_lower = company_name.lower().strip()

    # Direct lookup
    for key, keywords in COMPANY_INDUSTRY_MAP.items():
        if key in name_lower or name_lower in key:
            return keywords

    # Fuzzy: check if any map key is a substring of the company name
    for key, keywords in COMPANY_INDUSTRY_MAP.items():
        # Match "BHP Group" to "bhp", "Commonwealth Bank of Australia" to "commonwealth bank"
        key_parts = key.split()
        if all(part in name_lower for part in key_parts):
            return keywords

    # Fallback: use the company name itself (first two significant words)
    # Strip common suffixes
    cleaned = re.sub(
        r'\b(ltd|limited|pty|inc|group|holdings|corporation|corp|aust|australia|nz)\b',
        '', name_lower, flags=re.IGNORECASE,
    ).strip()
    words = [w for w in cleaned.split() if len(w) > 2]
    if words:
        return words[:2]
    return [name_lower]


def _find_matching_divisions(db, keywords: list[str]) -> list[dict]:
    """Find divisions whose name or summary matches any of the given keywords."""
    if not keywords:
        return []

    # Build WHERE clause with OR conditions
    conditions = []
    params = []
    for kw in keywords:
        conditions.append("(LOWER(d.name) LIKE ? OR LOWER(COALESCE(d.summary, '')) LIKE ?)")
        params.extend([f"%{kw.lower()}%", f"%{kw.lower()}%"])

    sql = f"""
        SELECT DISTINCT d.division_id, d.house, d.name, d.date, d.summary,
               d.aye_votes, d.no_votes
        FROM divisions d
        WHERE {' OR '.join(conditions)}
        ORDER BY d.date DESC
    """
    rows = db.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def _get_mp_vote(db, person_id: str, division_id: int) -> str | None:
    """Get how an MP voted on a specific division."""
    row = db.execute(
        "SELECT vote FROM votes WHERE division_id = ? AND person_id = ?",
        (division_id, person_id),
    ).fetchone()
    return row["vote"] if row else None


# ---------------------------------------------------------------------------
# 1. Shareholding conflicts
# ---------------------------------------------------------------------------

def find_shareholding_conflicts(db, person_id: str | None = None) -> list[dict]:
    """Find MPs who hold shares and voted on related legislation."""
    where = "WHERE s.person_id = ?" if person_id else ""
    params = [person_id] if person_id else []

    rows = db.execute(f"""
        SELECT s.person_id, s.company_name, s.share_type, s.declared_date,
               m.full_name, m.party, m.electorate
        FROM mp_shareholdings s
        JOIN members m ON m.person_id = s.person_id
        {where}
        ORDER BY m.full_name, s.company_name
    """, params).fetchall()

    if not rows:
        return []

    # Group shareholdings by MP
    mp_holdings: dict[str, list[dict]] = defaultdict(list)
    mp_info: dict[str, dict] = {}
    for r in rows:
        r = dict(r)
        mp_holdings[r["person_id"]].append({
            "company_name": r["company_name"],
            "share_type": r["share_type"],
            "declared_date": r["declared_date"],
        })
        mp_info[r["person_id"]] = {
            "full_name": r["full_name"],
            "party": r["party"],
            "electorate": r["electorate"],
        }

    conflicts = []
    for pid, holdings in mp_holdings.items():
        info = mp_info[pid]
        for holding in holdings:
            keywords = _match_company_to_keywords(holding["company_name"])
            matching_divs = _find_matching_divisions(db, keywords)

            for div in matching_divs:
                vote = _get_mp_vote(db, pid, div["division_id"])
                if vote and vote in ("aye", "no"):
                    conflicts.append({
                        "conflict_type": "shareholding",
                        "person_id": pid,
                        "full_name": info["full_name"],
                        "party": info["party"],
                        "electorate": info["electorate"],
                        "interest": holding["company_name"],
                        "share_type": holding.get("share_type"),
                        "declared_date": holding.get("declared_date"),
                        "division_id": div["division_id"],
                        "division_name": div["name"],
                        "division_date": div["date"],
                        "division_house": div["house"],
                        "vote": vote,
                        "matched_keywords": keywords[:5],
                        "severity": "high",
                    })

    return conflicts


# ---------------------------------------------------------------------------
# 2. Interest-type conflicts (from mp_interests)
# ---------------------------------------------------------------------------

def find_interest_conflicts(db, person_id: str | None = None) -> list[dict]:
    """Find conflicts from the general mp_interests table.

    Covers shareholding, directorship, partnership, trust entries
    that reference company/entity names matchable to divisions.
    """
    interest_types_of_concern = (
        "'shareholding'", "'directorship'", "'partnership'", "'trust'",
        "'bond'",
    )
    type_filter = f"AND i.interest_type IN ({','.join(interest_types_of_concern)})"

    where = f"WHERE i.person_id = ? {type_filter}" if person_id else f"WHERE 1=1 {type_filter}"
    params = [person_id] if person_id else []

    rows = db.execute(f"""
        SELECT i.interest_id, i.person_id, i.interest_type, i.entity_name,
               i.description, i.declared_date,
               m.full_name, m.party, m.electorate
        FROM mp_interests i
        JOIN members m ON m.person_id = i.person_id
        {where}
        ORDER BY m.full_name
    """, params).fetchall()

    if not rows:
        return []

    conflicts = []
    seen = set()  # (person_id, entity_name, division_id) to deduplicate

    for r in rows:
        r = dict(r)
        entity = r["entity_name"] or r["description"] or ""
        if not entity or len(entity) < 3:
            continue
        # Skip generic/non-informative entries
        entity_lower = entity.lower().strip()
        skip_terms = {"not applicable", "n/a", "nil", "none", "na", "vehicle",
                      "digital currency", "superannuation", "membership",
                      "salary", "salary for employment", "wages",
                      "sole trader", "freelance", "employment income",
                      "spouse", "partner"}
        if entity_lower in skip_terms or any(s in entity_lower for s in
            ["salary for", "sole trader for", "paid parental", "spouse receiving"]):
            continue

        keywords = _match_company_to_keywords(entity)
        matching_divs = _find_matching_divisions(db, keywords)

        for div in matching_divs:
            dedup_key = (r["person_id"], entity, div["division_id"])
            if dedup_key in seen:
                continue
            seen.add(dedup_key)

            vote = _get_mp_vote(db, r["person_id"], div["division_id"])
            if vote and vote in ("aye", "no"):
                conflicts.append({
                    "conflict_type": f"interest_{r['interest_type']}",
                    "person_id": r["person_id"],
                    "full_name": r["full_name"],
                    "party": r["party"],
                    "electorate": r["electorate"],
                    "interest": entity,
                    "interest_type": r["interest_type"],
                    "declared_date": r.get("declared_date"),
                    "division_id": div["division_id"],
                    "division_name": div["name"],
                    "division_date": div["date"],
                    "division_house": div["house"],
                    "vote": vote,
                    "matched_keywords": keywords[:5],
                    "severity": "medium" if r["interest_type"] in ("trust", "bond") else "high",
                })

    return conflicts


# ---------------------------------------------------------------------------
# 3. Property conflicts
# ---------------------------------------------------------------------------

def find_property_conflicts(db, person_id: str | None = None) -> list[dict]:
    """Find MPs with investment properties who voted on housing legislation."""
    where = "WHERE p.person_id = ?" if person_id else ""
    params = [person_id] if person_id else []

    rows = db.execute(f"""
        SELECT p.person_id, p.property_description, p.location, p.purpose,
               p.declared_date,
               m.full_name, m.party, m.electorate
        FROM mp_properties p
        JOIN members m ON m.person_id = p.person_id
        {where}
        ORDER BY m.full_name
    """, params).fetchall()

    # Also check mp_interests for property-type entries
    int_where = "WHERE i.person_id = ? AND i.interest_type = 'property'" if person_id else "WHERE i.interest_type = 'property'"
    int_params = [person_id] if person_id else []

    interest_rows = db.execute(f"""
        SELECT i.person_id, i.entity_name AS property_description,
               i.description AS location, 'investment' AS purpose,
               i.declared_date,
               m.full_name, m.party, m.electorate
        FROM mp_interests i
        JOIN members m ON m.person_id = i.person_id
        {int_where}
        ORDER BY m.full_name
    """, int_params).fetchall()

    all_rows = [dict(r) for r in rows] + [dict(r) for r in interest_rows]
    if not all_rows:
        return []

    # Filter to investment properties (not primary residences)
    investment_mps: dict[str, list[dict]] = defaultdict(list)
    mp_info: dict[str, dict] = {}

    for r in all_rows:
        purpose = (r.get("purpose") or "").lower()
        desc = (r.get("property_description") or "").lower()
        # Include investment/commercial properties; skip if clearly primary residence
        if "primary" in purpose or "family home" in desc:
            continue
        investment_mps[r["person_id"]].append(r)
        mp_info[r["person_id"]] = {
            "full_name": r["full_name"],
            "party": r["party"],
            "electorate": r["electorate"],
        }

    # Find housing-related divisions
    housing_divs = _find_matching_divisions(db, PROPERTY_DIVISION_KEYWORDS)

    conflicts = []
    for pid, properties in investment_mps.items():
        info = mp_info[pid]
        for div in housing_divs:
            vote = _get_mp_vote(db, pid, div["division_id"])
            if vote and vote in ("aye", "no"):
                prop_summary = "; ".join(
                    f"{p.get('property_description', 'Property')} ({p.get('location', 'unknown')})"
                    for p in properties[:3]
                )
                conflicts.append({
                    "conflict_type": "property",
                    "person_id": pid,
                    "full_name": info["full_name"],
                    "party": info["party"],
                    "electorate": info["electorate"],
                    "interest": prop_summary,
                    "property_count": len(properties),
                    "division_id": div["division_id"],
                    "division_name": div["name"],
                    "division_date": div["date"],
                    "division_house": div["house"],
                    "vote": vote,
                    "matched_keywords": ["housing", "property", "negative gearing"],
                    "severity": "medium",
                })

    return conflicts


# ---------------------------------------------------------------------------
# 4. Directorship conflicts
# ---------------------------------------------------------------------------

def find_directorship_conflicts(db, person_id: str | None = None) -> list[dict]:
    """Find MPs with directorships who voted on related legislation."""
    where = "WHERE d.person_id = ?" if person_id else ""
    params = [person_id] if person_id else []

    rows = db.execute(f"""
        SELECT d.person_id, d.company_name, d.role, d.declared_date,
               m.full_name, m.party, m.electorate
        FROM mp_directorships d
        JOIN members m ON m.person_id = d.person_id
        {where}
        ORDER BY m.full_name, d.company_name
    """, params).fetchall()

    if not rows:
        return []

    conflicts = []
    for r in rows:
        r = dict(r)
        keywords = _match_company_to_keywords(r["company_name"])
        matching_divs = _find_matching_divisions(db, keywords)

        for div in matching_divs:
            vote = _get_mp_vote(db, r["person_id"], div["division_id"])
            if vote and vote in ("aye", "no"):
                conflicts.append({
                    "conflict_type": "directorship",
                    "person_id": r["person_id"],
                    "full_name": r["full_name"],
                    "party": r["party"],
                    "electorate": r["electorate"],
                    "interest": r["company_name"],
                    "role": r.get("role"),
                    "declared_date": r.get("declared_date"),
                    "division_id": div["division_id"],
                    "division_name": div["name"],
                    "division_date": div["date"],
                    "division_house": div["house"],
                    "vote": vote,
                    "matched_keywords": keywords[:5],
                    "severity": "high",
                })

    return conflicts


# ---------------------------------------------------------------------------
# Main entry: run all detectors and cache results
# ---------------------------------------------------------------------------

def run_all(db=None, person_id: str | None = None) -> dict:
    """Run all conflict detectors, cache results, return summary."""
    if db is None:
        db = _get_db()

    print("=== CONFLICT OF INTEREST DETECTOR ===\n")

    # Report data availability
    n_interests = db.execute("SELECT COUNT(*) AS c FROM mp_interests").fetchone()["c"]
    n_shareholdings = db.execute("SELECT COUNT(*) AS c FROM mp_shareholdings").fetchone()["c"]
    n_properties = db.execute("SELECT COUNT(*) AS c FROM mp_properties").fetchone()["c"]
    n_directorships = db.execute("SELECT COUNT(*) AS c FROM mp_directorships").fetchone()["c"]
    n_divisions = db.execute("SELECT COUNT(*) AS c FROM divisions").fetchone()["c"]
    n_votes = db.execute("SELECT COUNT(*) AS c FROM votes").fetchone()["c"]

    print(f"Data available:")
    print(f"  mp_interests:     {n_interests:,}")
    print(f"  mp_shareholdings: {n_shareholdings:,}")
    print(f"  mp_properties:    {n_properties:,}")
    print(f"  mp_directorships: {n_directorships:,}")
    print(f"  divisions:        {n_divisions:,}")
    print(f"  votes:            {n_votes:,}")
    print()

    # Run detectors
    print("[1/4] Checking shareholding conflicts...")
    shareholding = find_shareholding_conflicts(db, person_id)
    print(f"  Found {len(shareholding)} potential conflicts")

    print("[2/4] Checking interest-type conflicts (from mp_interests)...")
    interest = find_interest_conflicts(db, person_id)
    print(f"  Found {len(interest)} potential conflicts")

    print("[3/4] Checking property conflicts...")
    property_c = find_property_conflicts(db, person_id)
    print(f"  Found {len(property_c)} potential conflicts")

    print("[4/4] Checking directorship conflicts...")
    directorship = find_directorship_conflicts(db, person_id)
    print(f"  Found {len(directorship)} potential conflicts")

    all_conflicts = shareholding + interest + property_c + directorship
    total = len(all_conflicts)
    print(f"\nTotal potential conflicts: {total}")

    # Deduplicate: same person + same division = keep highest severity
    severity_rank = {"high": 3, "medium": 2, "low": 1}
    deduped: dict[tuple, dict] = {}
    for c in all_conflicts:
        key = (c["person_id"], c["division_id"], c.get("interest", ""))
        existing = deduped.get(key)
        if not existing or severity_rank.get(c["severity"], 0) > severity_rank.get(existing["severity"], 0):
            deduped[key] = c
    all_conflicts = sorted(deduped.values(), key=lambda x: (
        -severity_rank.get(x["severity"], 0),
        x["full_name"],
        x["division_date"],
    ))

    # Summary by MP
    mp_summary: dict[str, dict] = {}
    for c in all_conflicts:
        pid = c["person_id"]
        if pid not in mp_summary:
            mp_summary[pid] = {
                "person_id": pid,
                "full_name": c["full_name"],
                "party": c["party"],
                "electorate": c["electorate"],
                "total_conflicts": 0,
                "high_severity": 0,
                "conflict_types": set(),
                "interests_flagged": set(),
            }
        mp_summary[pid]["total_conflicts"] += 1
        if c["severity"] == "high":
            mp_summary[pid]["high_severity"] += 1
        mp_summary[pid]["conflict_types"].add(c["conflict_type"])
        mp_summary[pid]["interests_flagged"].add(c.get("interest", ""))

    # Convert sets to lists for JSON serialization
    for s in mp_summary.values():
        s["conflict_types"] = sorted(s["conflict_types"])
        s["interests_flagged"] = sorted(s["interests_flagged"])

    mp_ranking = sorted(
        mp_summary.values(),
        key=lambda x: (-x["high_severity"], -x["total_conflicts"]),
    )

    result = {
        "generated_at": datetime.now().isoformat(),
        "data_counts": {
            "mp_interests": n_interests,
            "mp_shareholdings": n_shareholdings,
            "mp_properties": n_properties,
            "mp_directorships": n_directorships,
            "divisions": n_divisions,
            "votes": n_votes,
        },
        "total_conflicts": len(all_conflicts),
        "by_severity": {
            "high": sum(1 for c in all_conflicts if c["severity"] == "high"),
            "medium": sum(1 for c in all_conflicts if c["severity"] == "medium"),
        },
        "by_type": {
            "shareholding": len(shareholding),
            "interest": len(interest),
            "property": len(property_c),
            "directorship": len(directorship),
        },
        "mp_ranking": mp_ranking[:50],
        "conflicts": all_conflicts[:500],  # Cap at 500 for cache size
    }

    # Print top conflicts
    if all_conflicts:
        print(f"\n--- Top conflicts (showing up to 20) ---\n")
        for c in all_conflicts[:20]:
            print(f"  [{c['severity'].upper()}] {c['full_name']} ({c['party']})")
            print(f"    Interest: {c['interest']}")
            print(f"    Division: {c['division_name']}")
            print(f"    Vote: {c['vote']} on {c['division_date']}")
            print()
    else:
        print("\nNo conflicts found.")
        if n_interests == 0 and n_shareholdings == 0:
            print("  NOTE: mp_interests and mp_shareholdings tables are empty.")
            print("  Ingest register-of-interests data first to detect conflicts.")

    # Cache results
    _cache(db, "stories_conflicts_of_interest", result)
    print(f"Cached as 'stories_conflicts_of_interest'")

    return result


def get_conflicts(db, person_id: str | None = None) -> dict:
    """Get conflicts for a specific MP or all MPs.

    Tries cache first; runs analysis if cache miss and person_id is None.
    For per-MP queries, filters cached results or runs fresh.
    """
    if person_id:
        # Run fresh for individual MP queries (fast enough)
        return run_all(db, person_id=person_id)

    # Try cache for full results
    row = db.execute(
        "SELECT value FROM analysis_cache WHERE key = 'stories_conflicts_of_interest'"
    ).fetchone()
    if row:
        return json.loads(row["value"])

    # No cache, run fresh
    return run_all(db)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Conflict of interest detector")
    parser.add_argument("--person-id", help="Analyze a specific MP by person_id")
    args = parser.parse_args()

    db = _get_db()
    result = run_all(db, person_id=args.person_id)

    print(f"\n=== SUMMARY ===")
    print(f"Total conflicts: {result['total_conflicts']}")
    print(f"  High severity: {result['by_severity'].get('high', 0)}")
    print(f"  Medium severity: {result['by_severity'].get('medium', 0)}")
    print(f"By type: {json.dumps(result['by_type'], indent=2)}")
    if result['mp_ranking']:
        print(f"\nTop MPs by conflict count:")
        for mp in result['mp_ranking'][:10]:
            print(f"  {mp['full_name']} ({mp['party']}): {mp['total_conflicts']} conflicts ({mp['high_severity']} high)")
