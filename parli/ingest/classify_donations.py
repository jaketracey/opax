"""
parli.ingest.classify_donations -- Classify donations by industry based on donor name.

Updates the `industry` column in the donations table using keyword matching
against donor_name. Each donation is assigned to the first matching industry.
Falls back to LLM-based classification for remaining unclassified donors.

Usage:
    python -m parli.ingest.classify_donations
    python -m parli.ingest.classify_donations --llm          # LLM pass only
    python -m parli.ingest.classify_donations --llm --batch-size 100
"""

import argparse
import json
import os
import time
from collections import defaultdict

import anthropic

from parli.schema import get_db, init_db

# Keyword-to-industry mapping. Keywords are matched case-insensitively
# against donor_name. Order within each industry does not matter.
INDUSTRY_KEYWORDS: dict[str, list[str]] = {
    "gambling": [
        "tabcorp", "sportsbet", "clubs nsw", "clubs australia",
        "star entertainment", "crown", "aristocrat", "gaming", "wagering",
        "betting", "responsible wagering", "bet365", "entain", "flutter",
        "ladbrokes", "lotteries", "tatts", "pokies",
        "clubs association", "clubsnsw", "registered clubs",
    ],
    "mining": [
        "bhp", "rio tinto", "glencore", "fortescue", "hancock",
        "mineral", "coal", "iron ore", "queensland nickel",
        "newcrest", "south32", "whitehaven", "yancoal",
        "mt thorley", "warkworth", "manildra", "hunter valley united",
        "saxonvale", "centennial coal", "peabody", "anglo american",
        "newmont", "evolution mining", "northern star", "oz minerals",
        "iluka", "lynas", "sandfire", "pilbara",
    ],
    "fossil_fuels": [
        "woodside", "santos", "petroleum", "oil", "gas", "fossil",
        "energy producers", "chevron", "shell", "bp",
        "origin energy", "energy australia", "country energy",
        "agl energy", "stanwell", "ampol", "caltex",
    ],
    "property": [
        "property", "developer", "real estate", "construction",
        "lendlease", "meriton", "mirvac", "stockland",
        "leighton", "baulderstone", "thiess", "transurban",
        "plenary group", "westfield", "pratt holdings",
        "multiplex", "brookfield", "dexus", "charter hall",
        "goodman group", "scentre", "vicinity",
        "springfield land", "australand", "costain",
        "nrma", "national roads & motorists",
    ],
    "finance": [
        "bank", "macquarie", "westpac", "commonwealth bank", "anz",
        "nab", "insurance", "axa",
        "financial", "investment", "capital", "superannuation",
        "australian super", "pricewaterhousecoopers", "pwc",
        "deloitte", "ernst & young", "kpmg", "accountant", "audit",
        "morgans", "rbs morgans", "coverforce", "u-cover",
        "suncorp", "abn amro", "citibank", "hsbc", "zurich",
    ],
    "lobbying": [
        "government relations", "public affairs", "advocacy services",
        "hawker britton", "lobbyist", "lobbying",
        "gra advisory", "capitalhill advisory",
        "barton deakin", "newgate", "crosby textor",
        "gci", "nexus apac", "capita", "public policy",
        "anacta strategies", "climate 200",
    ],
    "legal": [
        "solicitor", "barrister", "law firm", "lawyers",
        "clayton utz", "holding redlich", "maurice blackburn",
        "minter ellison", "allens", "ashurst", "king & wood",
        "herbert smith", "norton rose", "gilbert + tobin",
        "corrs", "freehills", "baker mckenzie",
        "slater & gordon", "john connolly and partners",
    ],
    "hospitality": [
        "hotels association", "australian hotels",
        "hotel", "pub", "restaurant", "catering",
        "star city", "merivale", "alo group",
    ],
    "media": [
        "news corp", "nine entertainment", "seven west", "foxtel",
        "sky news", "village roadshow", "publishing", "broadcast",
        "stokes", "packer",
    ],
    "unions": [
        "union", "actu", "cfmeu", "maritime", "workers",
        "staff association", "incolink",
        "nurses", "midwives", "teachers federation",
        "firefighters", "ambulance", "police assoc",
        "sda", "cepu", "amwu", "asu", "hsu", "usu",
        "electrical trades", "plumbing", "meat workers",
        "textile", "shearers", "cpsu", "psu group",
    ],
    "telecom": [
        "telstra", "optus", "singtel", "vodafone", "tpg telecom",
        "nbn co", "telecommunications",
    ],
    "pharmacy": [
        "pharmacy", "chemist", "pharmaceutical",
        "pfizer", "medicines australia",
        "medtronic", "sanofi", "novartis", "roche", "johnson & johnson",
        "abbott lab", "astrazeneca", "merck", "gsk", "glaxosmith",
    ],
    "alcohol": [
        "breweries", "liquor", "distill", "wine", "beer",
    ],
    "tobacco": [
        "philip morris", "tobacco", "british american",
    ],
    "tech": [
        "google", "meta", "facebook", "microsoft", "apple", "amazon",
        "visa", "mastercard", "cardtronics", "tyro payments",
        "smartpay", "atm", "payments", "fat zebra",
        "ecash", "pospoint",
    ],
    "health": [
        "hospital", "medical", "health fund", "bupa", "medibank",
        "health care", "healthcare", "dental", "pathology",
    ],
    "agriculture": [
        "agri", "farm", "pastoral", "rural", "grain",
        "meat", "wool", "dairy", "sugar", "cotton", "cattle",
        "national farmers", "woolworths", "grazier",
    ],
    "retail": [
        "coles", "wesfarmers", "retail guild",
        "kmart", "target", "bunnings", "harvey norman", "jb hi-fi",
    ],
    "government": [
        "electoral commission", "department of", "treasury",
        "parliament", "public service", "legislative assembly",
        "legislative council", "city council", "shire council",
        "local government", "state government",
    ],
    "party_internal": [
        "labor holdings", "liberal party", "national party",
        "labor club", "labour club", "progressive business",
        "branch alp", "alp national", "australian labor party",
        "australian greens", "socialist", "country liberal",
        "democrats", "one nation", "family first",
        "liberal democratic", "united australia party",
        "liberal party of australia",
        "emily's list",
        "cormack foundation", "1973 foundation",
        "chisind", "lewiac", "premiernational",
        "john curtin house", "menzies research",
        "enterprise foundation", "free enterprise",
    ],
    "security": [
        "prosegur", "armaguard", "securit", "linfox armaguard",
        "brinks", "g4s",
    ],
    "transport": [
        "qantas", "virgin australia", "regional express",
        "airline", "aviation", "airport", "toll holdings",
        "pacific national", "aurizon", "shipping", "freight",
        "linfox", "taxi council", "tourism and transport",
    ],
    "defence": [
        "bae systems", "thales", "raytheon", "lockheed",
        "northrop", "boeing", "defence", "rheinmetall",
        "tenix",
    ],
    "waste_management": [
        "jj richards", "cleanaway", "veolia", "suez",
        "remondis", "waste",
    ],
    "education": [
        "university", "insearch", "education",
        "tafe", "college", "school",
    ],
    "adult_entertainment": [
        "eros association", "adult entertainment",
    ],
}


def classify_donations(db) -> dict[str, int]:
    """Classify donations by industry. Returns {industry: count_updated}."""
    counts: dict[str, int] = defaultdict(int)

    for industry, keywords in INDUSTRY_KEYWORDS.items():
        # Build a single UPDATE with OR conditions for all keywords
        conditions = " OR ".join(
            ["LOWER(donor_name) LIKE ?" for _ in keywords]
        )
        params = [f"%{kw.lower()}%" for kw in keywords]

        cursor = db.execute(
            f"""
            UPDATE donations
            SET industry = ?
            WHERE industry IS NULL
              AND ({conditions})
            """,
            [industry] + params,
        )
        counts[industry] = cursor.rowcount
        db.commit()
        print(f"  {industry:20s}: {cursor.rowcount:>6,} donations classified")

    # Second pass: classify junk/placeholder donor names as 'unidentified'
    cursor = db.execute(
        """
        UPDATE donations SET industry = 'unidentified'
        WHERE industry IS NULL
          AND (
            donor_name IN ('0', '1', '2', '3', '-', '--', 'n/a', 'N/A', '')
            OR LENGTH(TRIM(donor_name)) <= 2
            OR donor_name IS NULL
          )
        """
    )
    counts["unidentified"] = cursor.rowcount
    db.commit()
    print(f"  {'unidentified':20s}: {cursor.rowcount:>6,} donations classified")

    # Third pass: classify remaining recipients that are clearly party entities
    # (matches on recipient name when donor_name is an individual)
    cursor = db.execute(
        """
        UPDATE donations SET industry = 'individual'
        WHERE industry IS NULL
          AND donor_type = 'individual'
        """
    )
    counts["individual"] = cursor.rowcount
    db.commit()
    print(f"  {'individual':20s}: {cursor.rowcount:>6,} donations classified")

    return dict(counts)


VALID_INDUSTRIES = set(INDUSTRY_KEYWORDS.keys()) | {
    "unidentified", "individual", "other",
}

LLM_SYSTEM_PROMPT = """You classify Australian political donation donors by industry.
Given a JSON array of donor names, return a JSON object mapping each donor name to one of these industries:

gambling, mining, fossil_fuels, property, finance, lobbying, legal, hospitality,
media, unions, telecom, pharmacy, alcohol, tobacco, tech, health, agriculture,
retail, government, party_internal, security, transport, defence, waste_management,
education, adult_entertainment, other

Rules:
- "other" = a real entity that doesn't fit any category
- Shell companies (ACN/ABN numbers only) → "other"
- Individual person names → "individual"
- Unions and employee associations → "unions"
- Party-affiliated trusts/holdings/foundations → "party_internal"
- Be concise: return ONLY the JSON object, no explanation."""


def _db_execute_with_retry(db, sql, params=None, max_retries=10):
    """Execute SQL with retry on database lock."""
    for attempt in range(max_retries):
        try:
            if params:
                return db.execute(sql, params)
            return db.execute(sql)
        except Exception as e:
            if "locked" in str(e) and attempt < max_retries - 1:
                time.sleep(1 + attempt)
                continue
            raise


def _db_commit_with_retry(db, max_retries=10):
    """Commit with retry on database lock."""
    for attempt in range(max_retries):
        try:
            db.commit()
            return
        except Exception as e:
            if "locked" in str(e) and attempt < max_retries - 1:
                time.sleep(1 + attempt)
                continue
            raise


def classify_donations_llm(db, batch_size: int = 100, max_batches: int = 0) -> dict[str, int]:
    """Classify remaining unclassified donations using Claude Haiku."""
    client = anthropic.Anthropic()
    counts: dict[str, int] = defaultdict(int)

    # Increase SQLite timeout for concurrent access
    db.execute("PRAGMA busy_timeout = 60000")

    # Get distinct unclassified donor names with their donation counts
    rows = db.execute(
        """SELECT donor_name, COUNT(*) as cnt
           FROM donations
           WHERE industry IS NULL AND donor_name IS NOT NULL AND TRIM(donor_name) != ''
           GROUP BY donor_name
           ORDER BY cnt DESC"""
    ).fetchall()

    if not rows:
        print("No unclassified donors remaining.")
        return dict(counts)

    donor_names = [r[0] for r in rows]
    total_donors = len(donor_names)
    total_donations = sum(r[1] for r in rows)
    print(f"LLM classifying {total_donors:,} unique donors ({total_donations:,} donations)...")

    batches = [donor_names[i:i + batch_size] for i in range(0, len(donor_names), batch_size)]
    if max_batches > 0:
        batches = batches[:max_batches]

    classified_donors = 0
    classified_donations = 0

    for i, batch in enumerate(batches):
        try:
            response = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=4096,
                system=LLM_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": json.dumps(batch)}],
            )
            text = response.content[0].text.strip()
            # Extract JSON from response (handle markdown code blocks)
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            results = json.loads(text)

            for donor_name, industry in results.items():
                industry = industry.lower().strip()
                if industry not in VALID_INDUSTRIES:
                    industry = "other"
                cursor = _db_execute_with_retry(
                    db,
                    "UPDATE donations SET industry = ? WHERE donor_name = ? AND industry IS NULL",
                    [industry, donor_name],
                )
                counts[industry] += cursor.rowcount
                classified_donors += 1
                classified_donations += cursor.rowcount

            _db_commit_with_retry(db)
            print(f"  Batch {i+1}/{len(batches)}: classified {len(results)}/{len(batch)} donors ({classified_donations:,} donations so far)", flush=True)

        except (json.JSONDecodeError, KeyError) as e:
            print(f"  Batch {i+1}/{len(batches)}: parse error ({e}), skipping", flush=True)
            continue
        except anthropic.RateLimitError:
            print(f"  Rate limited, waiting 30s...", flush=True)
            time.sleep(30)
            # Retry this batch
            i -= 1
            continue

    print(f"\nLLM classification complete: {classified_donors:,} donors, {classified_donations:,} donations")
    for industry, count in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"  {industry:20s}: {count:>6,}")

    return dict(counts)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--llm", action="store_true", help="Run LLM classification pass")
    parser.add_argument("--llm-only", action="store_true", help="Skip keyword pass, LLM only")
    parser.add_argument("--batch-size", type=int, default=100, help="Donors per LLM batch")
    parser.add_argument("--max-batches", type=int, default=0, help="Limit number of batches (0=all)")
    args = parser.parse_args()

    db = get_db()
    init_db(db)

    total = db.execute("SELECT COUNT(*) FROM donations").fetchone()[0]
    print(f"Total donations: {total:,}")

    already = db.execute(
        "SELECT COUNT(*) FROM donations WHERE industry IS NOT NULL"
    ).fetchone()[0]
    print(f"Already classified: {already:,}")
    print(f"Unclassified: {total - already:,}")
    print()

    if not args.llm_only:
        print("Pass 1: Keyword classification...")
        counts = classify_donations(db)
        total_classified = sum(counts.values())
        print(f"Keyword pass: {total_classified:,} newly classified\n")

    remaining = db.execute(
        "SELECT COUNT(*) FROM donations WHERE industry IS NULL"
    ).fetchone()[0]

    if (args.llm or args.llm_only) and remaining > 0:
        print(f"Pass 2: LLM classification ({remaining:,} remaining)...")
        classify_donations_llm(db, batch_size=args.batch_size, max_batches=args.max_batches)

    remaining = db.execute(
        "SELECT COUNT(*) FROM donations WHERE industry IS NULL"
    ).fetchone()[0]
    classified = total - remaining
    print(f"\nFinal: {classified:,}/{total:,} classified ({classified / total * 100:.1f}%)")
    print(f"Remaining unclassified: {remaining:,}")


if __name__ == "__main__":
    main()
