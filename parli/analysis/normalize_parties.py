"""
parli.analysis.normalize_parties -- Normalize party name variants across all tables.

Problem: Major parties have 6+ name variants that break cross-table joins.
Solution: Map all variants to canonical names, add canonical columns, create
a lookup table for future use.

Canonical parties:
  - "Labor"      (ALP, Australian Labor Party, state branches, etc.)
  - "Liberal"    (LP, Liberal Party of Australia, state divisions, etc.)
  - "Greens"     (AG, Australian Greens, The Greens, state branches, etc.)
  - "Nationals"  (NP, National Party, Country Party, state branches, etc.)
  - "LNP"        (Liberal National Party of Queensland)
  - "Independent" (IND, Ind., independent)
  - Others kept as-is or mapped to known minor parties

Usage:
    python -m parli.analysis.normalize_parties          # dry-run report
    python -m parli.analysis.normalize_parties --apply  # apply changes
"""

import re
import sqlite3
from collections import defaultdict
from pathlib import Path

DB_PATH = Path("~/.cache/autoresearch/parli.db").expanduser()


# ---------------------------------------------------------------------------
# Canonical mapping rules
# ---------------------------------------------------------------------------

# Each entry: canonical_name -> list of patterns (case-insensitive substring
# or exact match). Order matters: first match wins.

# Use a list of tuples to preserve match order. More specific patterns MUST
# come before broader ones (e.g., "Liberal National Party" before "Liberal Party",
# "Democratic Labor Party" before "Labor").
CANONICAL_MAP_ORDERED: list[tuple[str, list[str]]] = [
    # --- Specific parties that contain major party substrings (must be first) ---
    ("LNP", [
        "Liberal National Party of Queensland",
        "Liberal National Party",
        "LNP",
    ]),
    ("Country Liberal Party", [
        "Country Liberal Party",
        "CLP",
    ]),
    ("Liberal Democratic Party", [
        "Liberal Democratic Party",
    ]),
    ("Democratic Labor Party", [
        "Democratic Labor Party",
        "DLP",
    ]),

    # --- Major parties ---
    ("Labor", [
        "Australian Labor Party",
        "ALP",
        "Labor Holdings",
        "Canberra Labor Club",
        "Labor",
    ]),
    ("Liberal", [
        "Liberal Party of Australia",
        "Liberal Party",
        "LP",
        "LIB",
        "Liberal",
    ]),
    ("Greens", [
        "Australian Greens",
        "Queensland Greens",
        "The Greens",
        "Greens",
        "AG",
        "GRN",
    ]),
    ("Nationals", [
        "National Party of Australia",
        "National Party",
        "Nationals",
        "Nats",
        "NATS",
        "NAT",
        "NP",
        "NPA",
        "NCP/NP",
        "NCP",
        "Country Party",
        "CP",
        "FSU",
    ]),

    # --- Minor parties ---
    ("Independent", [
        "Independent",
        "IND",
        "Ind.",
        "Ind",
    ]),
    ("One Nation", [
        "Pauline Hanson's One Nation",
        "One Nation",
        "PHON",
    ]),
    ("United Australia Party", [
        "United Australia Party",
        "Palmer United Party",
        "PUP",
    ]),
    ("Katter's Australian Party", [
        "Katter's Australian Party",
        "KAP",
    ]),
    ("Australian Democrats", [
        "Australian Democrats",
    ]),
    ("Centre Alliance", [
        "Centre Alliance",
        "Nick Xenophon Team",
        "NXT",
        "CA",
    ]),
    ("Jacqui Lambie Network", [
        "Jacqui Lambie Network",
        "JLN",
    ]),
    ("Family First", [
        "Family First",
    ]),

    # --- Historical parties ---
    ("Protectionist", [
        "Protectionist",
        "PROT",
    ]),
    ("Free Trade", [
        "Free Trade",
        "FT",
    ]),
    ("Anti-Socialist", [
        "ANTI-SOC",
        "Anti-Socialist Party",
        "Anti-Soc",
    ]),
]

# Build a dict for convenience (used by alias table population)
CANONICAL_MAP = dict(CANONICAL_MAP_ORDERED)

# Patterns for donation recipients that are clearly party recipients
# (not unions, clubs, associated entities). Used for donations.recipient normalization.
DONATION_PARTY_PATTERNS = {
    "Labor": [
        r"Australian Labor Party",
        r"^Labor$",
        r"^ALP$",
    ],
    "Liberal": [
        r"Liberal Party of Australia",
        r"Liberal Party \(",     # Liberal Party (W.A. Division) etc.
        r"^Liberal Party$",
    ],
    "LNP": [
        r"Liberal National Party of Queensland",
        r"^Liberal National Party$",
        r"^LNP$",
    ],
    "Greens": [
        r"Australian Greens",
        r"Queensland Greens",
        r"The Greens",
        r"^Greens$",
    ],
    "Nationals": [
        r"National Party of Australia",
        r"^National Party$",
        r"^Nationals$",
    ],
    "Country Liberal Party": [
        r"Country Liberal Party",
    ],
    "One Nation": [
        r"Pauline Hanson.s One Nation",
        r"One Nation",
    ],
    "United Australia Party": [
        r"United Australia Party",
        r"Palmer United Party",
    ],
    "Katter's Australian Party": [
        r"Katter.s Australian Party",
    ],
    "Centre Alliance": [
        r"Centre Alliance",
        r"Nick Xenophon Team",
    ],
    "Family First": [
        r"Family First",
    ],
}


def _extract_state_division(name: str) -> str | None:
    """Extract state division info from a party name like 'Liberal Party of Australia, NSW Division'."""
    VALID_STATES = {
        "N.S.W.": "NSW", "NSW": "NSW", "NEW SOUTH WALES": "NSW",
        "VIC": "VIC", "VICTORIAN": "VIC", "VICTORIA": "VIC",
        "QLD": "QLD", "QUEENSLAND": "QLD",
        "W.A.": "WA", "WA": "WA", "WESTERN AUSTRALIAN": "WA", "WESTERN AUSTRALIA": "WA",
        "S.A.": "SA", "SA": "SA", "SOUTH AUSTRALIAN": "SA", "SOUTH AUSTRALIA": "SA",
        "TAS": "TAS", "TASMANIAN": "TAS", "TASMANIA": "TAS",
        "NT": "NT", "NORTHERN TERRITORY": "NT",
        "ACT": "ACT",
        "NATIONAL": "NATIONAL",
        "FEDERAL": "NATIONAL",
    }
    patterns = [
        r"\((?:State of )?(\w[\w\s.]*?)\s*(?:Branch|Division)\)",
        r",\s*(\w[\w.]*?)\s*(?:Division|Branch)",
        r"-\s+(\w{2,3})$",  # trailing " - NSW" etc.
    ]
    for pat in patterns:
        m = re.search(pat, name, re.IGNORECASE)
        if m:
            state = m.group(1).strip().upper()
            mapped = VALID_STATES.get(state)
            if mapped:
                return mapped
    return None


def _normalize_party_name(name: str | None) -> str | None:
    """
    Map a party name to its canonical form.

    Returns None if the name cannot be mapped (e.g., ministerial titles,
    empty strings, compound historical party strings with semicolons).
    """
    if name is None or name.strip() == "":
        return None

    name_stripped = name.strip()

    # Skip compound historical strings like "ALP; FLP from 1931; ALP from 1936"
    # These encode party transitions and need special handling
    if ";" in name_stripped:
        # Try to match the first party in the compound string
        first_party = name_stripped.split(";")[0].strip()
        result = _match_canonical(first_party)
        return result

    # Skip ministerial/procedural titles
    procedural = {
        "Speaker", "SPK", "President", "PRES", "Deputy-Speaker",
        "Deputy-President", "DPRES", "CWM",
        "Manager of Government Business in the Senate",
        "Manager of Opposition Business in the Senate",
        "Leader of the Government in the Senate",
        "Leader of the Opposition in the Senate",
        "Deputy Leader of the Government in the Senate",
        "Deputy Leader of the Opposition in the Senate",
        "Leader of The Nationals in the Senate",
        "Assistant Treasurer",
    }
    if name_stripped in procedural:
        return None

    # Skip if it looks like a ministerial title
    if any(kw in name_stripped for kw in [
        "Minister for", "Shadow Minister", "Parliamentary Secretary",
        "Shadow Assistant", "Shadow Attorney", "Shadow Parliamentary",
        "Deputy Leader of"
    ]):
        return None

    return _match_canonical(name_stripped)


def _match_canonical(name: str) -> str | None:
    """Match a single party name string against CANONICAL_MAP_ORDERED."""
    name_upper = name.upper().strip()

    # Two-pass: exact match first (higher priority), then substring
    for canonical, patterns in CANONICAL_MAP_ORDERED:
        for pattern in patterns:
            if name_upper == pattern.upper():
                return canonical

    for canonical, patterns in CANONICAL_MAP_ORDERED:
        for pattern in patterns:
            pat_upper = pattern.upper()
            # Substring match for longer variants (e.g., state divisions)
            if len(pattern) > 3 and pat_upper in name_upper:
                return canonical

    # UAP is ambiguous: historical (1930s) vs modern (Palmer).
    # Both map to "United Australia Party" for now.
    if name_upper == "UAP":
        return "United Australia Party"

    # AUS (Australian Party?) -- too ambiguous, skip
    return None


def _normalize_donation_recipient(recipient: str) -> str | None:
    """
    Map a donation recipient name to canonical party name.
    Only matches clear party recipients, not unions/clubs/associated entities.
    Returns None if not a recognizable party recipient.
    """
    if not recipient:
        return None

    for canonical, patterns in DONATION_PARTY_PATTERNS.items():
        for pat in patterns:
            if re.search(pat, recipient, re.IGNORECASE):
                return canonical
    return None


def get_db() -> sqlite3.Connection:
    """Open the database with appropriate settings."""
    db = sqlite3.connect(str(DB_PATH), timeout=300)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode = WAL")
    db.execute("PRAGMA busy_timeout = 600000")
    db.execute("PRAGMA synchronous = NORMAL")
    db.execute("PRAGMA cache_size = -64000")
    return db


def report(db: sqlite3.Connection) -> dict:
    """Generate a report on party name variants and what normalization would do."""
    stats = {}

    # --- Members ---
    members_parties = db.execute(
        "SELECT party, COUNT(*) as cnt FROM members GROUP BY party ORDER BY cnt DESC"
    ).fetchall()
    members_mapping = {}
    for row in members_parties:
        canonical = _normalize_party_name(row["party"])
        if canonical:
            members_mapping[row["party"]] = (canonical, row["cnt"])
    stats["members"] = {
        "distinct_before": len(members_parties),
        "mapping": members_mapping,
    }

    # --- Speeches ---
    speech_parties = db.execute(
        "SELECT party, COUNT(*) as cnt FROM speeches GROUP BY party ORDER BY cnt DESC"
    ).fetchall()
    speech_mapping = {}
    for row in speech_parties:
        canonical = _normalize_party_name(row["party"])
        if canonical:
            speech_mapping[row["party"]] = (canonical, row["cnt"])
    stats["speeches"] = {
        "distinct_before": len(speech_parties),
        "mapping": speech_mapping,
    }

    # --- Donations ---
    donation_recipients = db.execute(
        "SELECT recipient, COUNT(*) as cnt FROM donations GROUP BY recipient ORDER BY cnt DESC"
    ).fetchall()
    donation_mapping = {}
    for row in donation_recipients:
        canonical = _normalize_donation_recipient(row["recipient"])
        if canonical:
            donation_mapping[row["recipient"]] = (canonical, row["cnt"])
    stats["donations"] = {
        "distinct_before": len(donation_recipients),
        "mapping": donation_mapping,
    }

    return stats


def print_report(stats: dict) -> None:
    """Pretty-print the normalization report."""
    for table_name, info in stats.items():
        print(f"\n{'='*70}")
        print(f"  {table_name.upper()}")
        print(f"{'='*70}")
        print(f"  Distinct party values before: {info['distinct_before']}")

        # Count records per canonical party
        canonical_counts = defaultdict(int)
        for original, (canonical, count) in info["mapping"].items():
            canonical_counts[canonical] += count

        total_normalized = sum(canonical_counts.values())
        print(f"  Records that will be normalized: {total_normalized:,}")

        if canonical_counts:
            print(f"\n  Canonical party breakdown:")
            for party, count in sorted(canonical_counts.items(), key=lambda x: -x[1]):
                variants = [
                    orig for orig, (can, _) in info["mapping"].items()
                    if can == party and orig != party
                ]
                print(f"    {party}: {count:,} records")
                if variants:
                    for v in variants[:8]:
                        c = info["mapping"][v][1]
                        print(f"      <- {v!r} ({c:,})")
                    if len(variants) > 8:
                        print(f"      ... and {len(variants) - 8} more variants")

        # Estimate distinct after
        mapped_originals = set(info["mapping"].keys())
        unmapped = info["distinct_before"] - len(mapped_originals)
        distinct_after = len(set(
            can for _, (can, _) in info["mapping"].items()
        )) + unmapped
        print(f"\n  Distinct party values after (estimated): {distinct_after}")


def apply_normalization(db: sqlite3.Connection) -> dict:
    """
    Apply party name normalization to the database.

    1. Add party_canonical columns to members and speeches
    2. Add recipient_canonical column to donations
    3. Create party_aliases lookup table
    4. Populate all canonical columns
    5. Update members.party to canonical form (keep original in party_original)

    Returns counts of records updated per table.
    """
    results = {}

    # --- Step 1: Schema changes ---
    print("\n[1/5] Adding canonical columns...")

    # members: add party_original and party_canonical
    member_cols = {r[1] for r in db.execute("PRAGMA table_info(members)").fetchall()}
    if "party_original" not in member_cols:
        db.execute("ALTER TABLE members ADD COLUMN party_original TEXT")
        print("  Added members.party_original")
    if "party_canonical" not in member_cols:
        db.execute("ALTER TABLE members ADD COLUMN party_canonical TEXT")
        print("  Added members.party_canonical")

    # speeches: add party_canonical
    speech_cols = {r[1] for r in db.execute("PRAGMA table_info(speeches)").fetchall()}
    if "party_canonical" not in speech_cols:
        db.execute("ALTER TABLE speeches ADD COLUMN party_canonical TEXT")
        print("  Added speeches.party_canonical")

    # donations: add recipient_canonical and recipient_state_division
    don_cols = {r[1] for r in db.execute("PRAGMA table_info(donations)").fetchall()}
    if "recipient_canonical" not in don_cols:
        db.execute("ALTER TABLE donations ADD COLUMN recipient_canonical TEXT")
        print("  Added donations.recipient_canonical")
    if "recipient_state_division" not in don_cols:
        db.execute("ALTER TABLE donations ADD COLUMN recipient_state_division TEXT")
        print("  Added donations.recipient_state_division")

    db.commit()

    # --- Step 2: Create party_aliases lookup table ---
    print("\n[2/5] Creating party_aliases table...")
    db.execute("""
        CREATE TABLE IF NOT EXISTS party_aliases (
            alias TEXT PRIMARY KEY,
            canonical TEXT NOT NULL,
            context TEXT DEFAULT 'general'  -- 'general', 'donation_recipient', 'historical'
        )
    """)
    db.execute("CREATE INDEX IF NOT EXISTS idx_party_aliases_canonical ON party_aliases(canonical)")

    # Populate from CANONICAL_MAP
    alias_count = 0
    for canonical, patterns in CANONICAL_MAP.items():
        for pattern in patterns:
            try:
                db.execute(
                    "INSERT OR REPLACE INTO party_aliases (alias, canonical, context) VALUES (?, ?, ?)",
                    (pattern, canonical, "general"),
                )
                alias_count += 1
            except sqlite3.IntegrityError:
                pass

    # Add donation-specific aliases
    for canonical, patterns in DONATION_PARTY_PATTERNS.items():
        for pat in patterns:
            # Store the regex pattern for reference
            try:
                db.execute(
                    "INSERT OR REPLACE INTO party_aliases (alias, canonical, context) VALUES (?, ?, ?)",
                    (f"regex:{pat}", canonical, "donation_recipient"),
                )
                alias_count += 1
            except sqlite3.IntegrityError:
                pass

    db.commit()
    print(f"  Inserted {alias_count} aliases")
    results["aliases"] = alias_count

    # --- Step 3: Normalize members ---
    print("\n[3/5] Normalizing members table...")

    # First, preserve original party values
    db.execute("UPDATE members SET party_original = party WHERE party_original IS NULL")

    # Get all distinct party values and compute mappings
    member_parties = db.execute("SELECT DISTINCT party FROM members").fetchall()
    member_updates = 0
    for row in member_parties:
        original = row["party"]
        canonical = _normalize_party_name(original)
        if canonical:
            cursor = db.execute(
                "UPDATE members SET party_canonical = ?, party = ? WHERE party = ? OR (party IS NULL AND ? IS NULL)",
                (canonical, canonical, original, original),
            )
            member_updates += cursor.rowcount

    db.commit()
    results["members"] = member_updates
    print(f"  Updated {member_updates:,} member records")

    # --- Step 4: Normalize speeches ---
    print("\n[4/5] Normalizing speeches table...")

    speech_parties = db.execute("SELECT DISTINCT party FROM speeches").fetchall()
    speech_updates = 0
    for row in speech_parties:
        original = row["party"]
        canonical = _normalize_party_name(original)
        if canonical:
            cursor = db.execute(
                "UPDATE speeches SET party_canonical = ? WHERE party = ? OR (party IS NULL AND ? IS NULL)",
                (canonical, original, original),
            )
            speech_updates += cursor.rowcount

    db.commit()
    results["speeches"] = speech_updates
    print(f"  Updated {speech_updates:,} speech records")

    # --- Step 5: Normalize donations ---
    print("\n[5/5] Normalizing donations table...")

    donation_recipients = db.execute("SELECT DISTINCT recipient FROM donations").fetchall()
    donation_updates = 0
    for row in donation_recipients:
        original = row["recipient"]
        canonical = _normalize_donation_recipient(original)
        if canonical:
            state = _extract_state_division(original)
            cursor = db.execute(
                "UPDATE donations SET recipient_canonical = ?, recipient_state_division = ? WHERE recipient = ?",
                (canonical, state, original),
            )
            donation_updates += cursor.rowcount

    db.commit()
    results["donations"] = donation_updates
    print(f"  Updated {donation_updates:,} donation records")

    # --- Final report ---
    print("\n" + "=" * 70)
    print("  POST-NORMALIZATION SUMMARY")
    print("=" * 70)

    for table, col in [
        ("members", "party"),
        ("members", "party_canonical"),
        ("speeches", "party_canonical"),
        ("donations", "recipient_canonical"),
    ]:
        distinct = db.execute(
            f"SELECT COUNT(DISTINCT {col}) FROM {table} WHERE {col} IS NOT NULL AND {col} != ''"
        ).fetchone()[0]
        print(f"  {table}.{col}: {distinct} distinct values")

    # party_aliases count
    alias_total = db.execute("SELECT COUNT(*) FROM party_aliases").fetchone()[0]
    canonical_total = db.execute("SELECT COUNT(DISTINCT canonical) FROM party_aliases").fetchone()[0]
    print(f"  party_aliases: {alias_total} aliases -> {canonical_total} canonical parties")

    return results


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Normalize party names across OPAX database")
    parser.add_argument("--apply", action="store_true", help="Apply changes (default is dry-run report)")
    parser.add_argument("--db", type=str, default=None, help="Database path (default: ~/.cache/autoresearch/parli.db)")
    args = parser.parse_args()

    global DB_PATH
    if args.db:
        DB_PATH = Path(args.db).expanduser()

    db = get_db()

    if args.apply:
        print("Applying party name normalization...")
        results = apply_normalization(db)
        print(f"\nDone. Total records updated: {sum(results.values()):,}")
    else:
        print("DRY RUN -- Party name normalization report")
        print("Run with --apply to make changes\n")
        stats = report(db)
        print_report(stats)

    db.close()


if __name__ == "__main__":
    main()
