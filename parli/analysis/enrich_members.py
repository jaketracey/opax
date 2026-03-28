"""
parli.analysis.enrich_members -- Fill gaps in the members table using data
already present in the database (speeches, speaker names) and heuristics.

Addresses:
  - 100% null gender and entered_house/left_house
  - 71.5% null party
  - 52.1% null electorate
  - 46.3% null first_name
  - Orphan members with no linked data

Enrichment strategy (all from existing DB data, no external API calls):
  1. Fill party from speeches table
  2. Fill electorate from speeches table
  3. Fill first_name from speaker_name in speeches
  4. Fill gender from speaker_name title (Mr/Mrs/Ms/Miss)
  5. Fill entered_house/left_house from speech date ranges
  6. Fill chamber from speeches table
  7. Mark orphan members (no speeches, no votes) as inactive

Usage:
    uv run python -m parli.analysis.enrich_members
    uv run python -m parli.analysis.enrich_members --dry-run
"""

from __future__ import annotations

import argparse
import re
import sqlite3
from datetime import date, datetime

from parli.schema import get_db

# ── Name-gender mapping for common Australian first names ──────────────────
# Used as fallback when speaker_name title is not available.
# Only high-confidence names included; ambiguous names omitted.
MALE_NAMES = {
    "adam", "alan", "albert", "alexander", "andrew", "anthony", "arthur",
    "barry", "ben", "benjamin", "bob", "brian", "bruce", "carl", "charles",
    "chris", "christopher", "colin", "craig", "daniel", "darren", "david",
    "dean", "dennis", "derek", "donald", "douglas", "duncan", "edward",
    "eric", "frank", "fred", "gary", "geoffrey", "george", "gordon",
    "graham", "grant", "greg", "gregory", "harold", "harry", "henry",
    "howard", "hugh", "ian", "jack", "james", "jason", "jeff", "jeffrey",
    "jim", "joe", "john", "jonathan", "joseph", "joshua", "julian",
    "keith", "ken", "kenneth", "kevin", "lance", "larry", "laurie",
    "lawrence", "len", "leo", "leon", "leslie", "liam", "luke", "malcolm",
    "mark", "martin", "matt", "matthew", "max", "michael", "mike", "neil",
    "nick", "nicholas", "nigel", "noel", "norman", "oliver", "patrick",
    "paul", "peter", "philip", "ralph", "ray", "raymond", "reg", "richard",
    "robert", "roger", "ron", "ronald", "ross", "russell", "ryan", "sam",
    "samuel", "scott", "sean", "simon", "stephen", "steve", "steven",
    "stuart", "terry", "thomas", "tim", "timothy", "tom", "tony", "trevor",
    "victor", "vincent", "warren", "wayne", "william",
}

FEMALE_NAMES = {
    "alice", "amanda", "amy", "andrea", "angela", "ann", "anna", "anne",
    "bridget", "bronwyn", "carol", "caroline", "catherine", "charlotte",
    "cheryl", "christine", "claire", "clare", "dawn", "deborah", "diana",
    "diane", "donna", "dorothy", "edith", "eileen", "elaine", "elizabeth",
    "emily", "emma", "fiona", "frances", "gabrielle", "gail", "gemma",
    "gillian", "grace", "hannah", "heather", "helen", "hilary", "irene",
    "jackie", "jacqueline", "jane", "janet", "janice", "jean", "jennifer",
    "jenny", "jessica", "jill", "joan", "joanna", "joanne", "josephine",
    "joy", "judith", "julia", "julie", "justine", "karen", "kate",
    "katherine", "kathleen", "kathryn", "katy", "kay", "kelly", "kerri",
    "kim", "kristina", "laura", "lauren", "leanne", "linda", "lisa",
    "lorraine", "louise", "lucy", "lydia", "lynn", "margaret", "maria",
    "marian", "marie", "marilyn", "marlene", "mary", "maureen", "megan",
    "melissa", "michelle", "monica", "nadia", "natalie", "natasha",
    "nicola", "nicole", "nola", "olivia", "pamela", "patricia", "pauline",
    "penny", "philippa", "rachel", "rebecca", "robyn", "rosemary", "ruth",
    "sally", "samantha", "sandra", "sarah", "sharon", "sheila", "shirley",
    "sophie", "stephanie", "susan", "sussan", "suzanne", "sylvia", "tanya",
    "teresa", "theresa", "tina", "tracey", "ursula", "valerie", "vanessa",
    "vicki", "victoria", "virginia", "vivian", "wendy", "yvonne", "zali",
}


def infer_gender_from_name(first_name: str | None) -> str | None:
    """Infer gender from first name using lookup tables."""
    if not first_name:
        return None
    name = first_name.strip().lower()
    if name in MALE_NAMES:
        return "M"
    if name in FEMALE_NAMES:
        return "F"
    return None


def infer_gender_from_speaker(speaker_name: str) -> str | None:
    """Infer gender from speaker_name title prefix (Mr/Mrs/Ms/Miss)."""
    if not speaker_name:
        return None
    s = speaker_name.strip()
    # Match title at start: "Mr SMITH", "Mrs Jones", "Ms Lee,MP"
    m = re.match(r"^(Mr|Mrs|Ms|Miss|Dame|Sir)\b", s, re.IGNORECASE)
    if not m:
        return None
    title = m.group(1).lower()
    if title in ("mr", "sir"):
        return "M"
    if title in ("ms", "mrs", "miss", "dame"):
        return "F"
    return None


def extract_first_name_from_speaker(speaker_name: str) -> str | None:
    """Try to extract a first name from speaker_name patterns.

    Patterns handled:
      - "Andrew, Neil, MP" -> "Neil" (but this is ambiguous)
      - "Mr SMITH" -> None (no first name)
      - "Anthony Albanese" -> "Anthony"
    """
    if not speaker_name:
        return None
    s = speaker_name.strip()

    # Remove trailing ", MP" or ",MP"
    s = re.sub(r",?\s*MP$", "", s, flags=re.IGNORECASE).strip()

    # Remove title prefix
    s = re.sub(r"^(Mr|Mrs|Ms|Miss|Dame|Sir|Dr|Hon|Senator)\s+", "", s, flags=re.IGNORECASE).strip()

    # If it's a single word (just last name), no first name to extract
    if " " not in s and "," not in s:
        return None

    # "LastName, FirstName" pattern
    if "," in s:
        parts = s.split(",", 1)
        if len(parts) == 2:
            candidate = parts[1].strip()
            if candidate and candidate[0].isupper() and len(candidate) > 1:
                return candidate
        return None

    # "FirstName LastName" pattern -- only if first word looks like a name
    parts = s.split()
    if len(parts) >= 2:
        candidate = parts[0]
        if candidate[0].isupper() and candidate[1:].islower() and len(candidate) > 1:
            return candidate

    return None


def create_indexes(db: sqlite3.Connection) -> None:
    """Create temporary indexes to speed up enrichment queries."""
    print("Creating indexes for enrichment...")
    db.execute("CREATE INDEX IF NOT EXISTS idx_speeches_person_id ON speeches(person_id)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_speeches_person_party ON speeches(person_id, party)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_speeches_person_electorate ON speeches(person_id, electorate)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_speeches_person_date ON speeches(person_id, date)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_votes_person_id ON votes(person_id)")
    db.commit()
    print("  Indexes ready.")


def snapshot_null_counts(db: sqlite3.Connection) -> dict[str, int]:
    """Return current null/empty counts for key columns."""
    cols = ["gender", "entered_house", "left_house", "party", "electorate",
            "first_name", "chamber"]
    counts = {}
    total = db.execute("SELECT COUNT(*) FROM members").fetchone()[0]
    counts["_total"] = total
    for col in cols:
        n = db.execute(
            f"SELECT COUNT(*) FROM members WHERE {col} IS NULL OR {col} = ''"
        ).fetchone()[0]
        counts[col] = n
    return counts


def print_report(before: dict[str, int], after: dict[str, int]) -> None:
    """Print before/after enrichment report."""
    total = before["_total"]
    print(f"\n{'='*60}")
    print(f" ENRICHMENT REPORT  ({total} members)")
    print(f"{'='*60}")
    print(f"{'Column':<18} {'Before':>10} {'After':>10} {'Filled':>10} {'Rate':>10}")
    print(f"{'-'*60}")
    for col in ["party", "electorate", "first_name", "gender", "chamber",
                 "entered_house", "left_house"]:
        b = before.get(col, 0)
        a = after.get(col, 0)
        filled = b - a
        pct_before = f"{b/total*100:.1f}%"
        pct_after = f"{a/total*100:.1f}%"
        print(f"{col:<18} {b:>6} ({pct_before:>6}) {a:>6} ({pct_after:>6}) {filled:>10}")
    print(f"{'='*60}")


def enrich(db: sqlite3.Connection, dry_run: bool = False) -> None:
    """Run all enrichment steps."""

    before = snapshot_null_counts(db)
    print(f"Members table: {before['_total']} rows")
    print(f"Before enrichment:")
    for col, n in before.items():
        if col.startswith("_"):
            continue
        print(f"  {col}: {n} null ({n/before['_total']*100:.1f}%)")

    if not dry_run:
        create_indexes(db)

    # ── Step 1: Fill party from speeches ──────────────────────────────────
    print("\n[1/7] Filling party from speeches...")
    if not dry_run:
        cur = db.execute("""
            UPDATE members SET party = (
                SELECT s.party FROM speeches s
                WHERE s.person_id = members.person_id
                  AND s.party IS NOT NULL AND s.party != ''
                ORDER BY s.date DESC
                LIMIT 1
            )
            WHERE (party IS NULL OR party = '')
              AND EXISTS (
                SELECT 1 FROM speeches s2
                WHERE s2.person_id = members.person_id
                  AND s2.party IS NOT NULL AND s2.party != ''
              )
        """)
        db.commit()
        print(f"  Updated {cur.rowcount} rows")
    else:
        n = db.execute("""
            SELECT COUNT(*) FROM members
            WHERE (party IS NULL OR party = '')
              AND EXISTS (
                SELECT 1 FROM speeches s2
                WHERE s2.person_id = members.person_id
                  AND s2.party IS NOT NULL AND s2.party != ''
              )
        """).fetchone()[0]
        print(f"  Would update {n} rows")

    # ── Step 2: Fill electorate from speeches ─────────────────────────────
    print("\n[2/7] Filling electorate from speeches...")
    if not dry_run:
        cur = db.execute("""
            UPDATE members SET electorate = (
                SELECT s.electorate FROM speeches s
                WHERE s.person_id = members.person_id
                  AND s.electorate IS NOT NULL AND s.electorate != ''
                ORDER BY s.date DESC
                LIMIT 1
            )
            WHERE (electorate IS NULL OR electorate = '')
              AND EXISTS (
                SELECT 1 FROM speeches s2
                WHERE s2.person_id = members.person_id
                  AND s2.electorate IS NOT NULL AND s2.electorate != ''
              )
        """)
        db.commit()
        print(f"  Updated {cur.rowcount} rows")
    else:
        n = db.execute("""
            SELECT COUNT(*) FROM members
            WHERE (electorate IS NULL OR electorate = '')
              AND EXISTS (
                SELECT 1 FROM speeches s2
                WHERE s2.person_id = members.person_id
                  AND s2.electorate IS NOT NULL AND s2.electorate != ''
              )
        """).fetchone()[0]
        print(f"  Would update {n} rows")

    # ── Step 3: Fill first_name ───────────────────────────────────────────
    # Strategy: parse from full_name first, then from speaker_name in speeches
    print("\n[3/7] Filling first_name...")
    if not dry_run:
        # 3a: Parse from full_name (e.g. "Anthony Albanese" -> "Anthony")
        cur = db.execute("""
            UPDATE members SET first_name = SUBSTR(full_name, 1, INSTR(full_name, ' ') - 1)
            WHERE (first_name IS NULL OR first_name = '')
              AND full_name LIKE '% %'
              AND INSTR(full_name, ' ') > 1
        """)
        db.commit()
        print(f"  From full_name: {cur.rowcount} rows")

        # 3b: From speaker_name in speeches (requires Python processing)
        rows = db.execute("""
            SELECT m.person_id, s.speaker_name
            FROM members m
            JOIN speeches s ON s.person_id = m.person_id
            WHERE (m.first_name IS NULL OR m.first_name = '')
              AND s.speaker_name IS NOT NULL AND s.speaker_name != ''
            GROUP BY m.person_id
        """).fetchall()
        count = 0
        for person_id, speaker_name in rows:
            fn = extract_first_name_from_speaker(speaker_name)
            if fn:
                db.execute("UPDATE members SET first_name = ? WHERE person_id = ? AND (first_name IS NULL OR first_name = '')",
                           (fn, person_id))
                count += 1
        db.commit()
        print(f"  From speaker_name: {count} rows")
    else:
        n1 = db.execute("""
            SELECT COUNT(*) FROM members
            WHERE (first_name IS NULL OR first_name = '')
              AND full_name LIKE '% %'
              AND INSTR(full_name, ' ') > 1
        """).fetchone()[0]
        print(f"  Would update from full_name: {n1} rows")

    # ── Step 4: Fill gender ───────────────────────────────────────────────
    # Strategy: title from speaker_name first, then first_name lookup
    print("\n[4/7] Filling gender...")
    if not dry_run:
        # 4a: From speaker_name title (Mr/Mrs/Ms/Miss)
        rows = db.execute("""
            SELECT DISTINCT m.person_id, s.speaker_name
            FROM members m
            JOIN speeches s ON s.person_id = m.person_id
            WHERE (m.gender IS NULL OR m.gender = '')
              AND s.speaker_name IS NOT NULL
            GROUP BY m.person_id
        """).fetchall()
        count_title = 0
        for person_id, speaker_name in rows:
            g = infer_gender_from_speaker(speaker_name)
            if g:
                db.execute("UPDATE members SET gender = ? WHERE person_id = ?", (g, person_id))
                count_title += 1
        db.commit()
        print(f"  From speaker_name title: {count_title} rows")

        # 4b: From first_name lookup (for remaining nulls)
        rows = db.execute("""
            SELECT person_id, first_name FROM members
            WHERE (gender IS NULL OR gender = '')
              AND first_name IS NOT NULL AND first_name != ''
        """).fetchall()
        count_name = 0
        for person_id, first_name in rows:
            g = infer_gender_from_name(first_name)
            if g:
                db.execute("UPDATE members SET gender = ? WHERE person_id = ?", (g, person_id))
                count_name += 1
        db.commit()
        print(f"  From first_name lookup: {count_name} rows")
    else:
        print("  (dry-run: skipping gender inference)")

    # ── Step 5: Fill entered_house / left_house from speech dates ─────────
    print("\n[5/7] Filling entered_house / left_house from speech dates...")
    if not dry_run:
        # entered_house = earliest speech date for that member
        cur = db.execute("""
            UPDATE members SET entered_house = (
                SELECT MIN(s.date) FROM speeches s
                WHERE s.person_id = members.person_id
                  AND s.date IS NOT NULL AND s.date != ''
            )
            WHERE (entered_house IS NULL OR entered_house = '')
              AND EXISTS (
                SELECT 1 FROM speeches s2
                WHERE s2.person_id = members.person_id
                  AND s2.date IS NOT NULL AND s2.date != ''
              )
        """)
        db.commit()
        print(f"  entered_house: {cur.rowcount} rows")

        # left_house = latest speech date, but ONLY if they haven't spoken
        # in the last 2 years (otherwise they're still active)
        cutoff = str(date.today().year - 2) + "-01-01"
        cur = db.execute("""
            UPDATE members SET left_house = (
                SELECT MAX(s.date) FROM speeches s
                WHERE s.person_id = members.person_id
                  AND s.date IS NOT NULL AND s.date != ''
            )
            WHERE (left_house IS NULL OR left_house = '')
              AND EXISTS (
                SELECT 1 FROM speeches s2
                WHERE s2.person_id = members.person_id
                  AND s2.date IS NOT NULL AND s2.date != ''
              )
              AND (
                SELECT MAX(s3.date) FROM speeches s3
                WHERE s3.person_id = members.person_id
                  AND s3.date IS NOT NULL
              ) < ?
        """, (cutoff,))
        db.commit()
        print(f"  left_house (inactive >2yr): {cur.rowcount} rows")
    else:
        print("  (dry-run: skipping date enrichment)")

    # ── Step 6: Fill chamber from speeches ────────────────────────────────
    print("\n[6/7] Filling chamber from speeches...")
    if not dry_run:
        cur = db.execute("""
            UPDATE members SET chamber = (
                SELECT s.chamber FROM speeches s
                WHERE s.person_id = members.person_id
                  AND s.chamber IS NOT NULL AND s.chamber != ''
                ORDER BY s.date DESC
                LIMIT 1
            )
            WHERE (chamber IS NULL OR chamber = '')
              AND EXISTS (
                SELECT 1 FROM speeches s2
                WHERE s2.person_id = members.person_id
                  AND s2.chamber IS NOT NULL AND s2.chamber != ''
              )
        """)
        db.commit()
        print(f"  Updated {cur.rowcount} rows")
    else:
        print("  (dry-run: skipping chamber fill)")

    # ── Step 7: Mark orphan members ───────────────────────────────────────
    print("\n[7/7] Identifying orphan members...")
    orphan_count = db.execute("""
        SELECT COUNT(*) FROM members m
        WHERE NOT EXISTS (SELECT 1 FROM speeches s WHERE s.person_id = m.person_id)
          AND NOT EXISTS (SELECT 1 FROM votes v WHERE v.person_id = m.person_id)
    """).fetchone()[0]
    print(f"  Orphan members (no speeches, no votes): {orphan_count}")

    if not dry_run and orphan_count > 0:
        # Mark them with left_house = 'unknown' to indicate historical/inactive
        # and set chamber to 'unknown' if also null
        cur = db.execute("""
            UPDATE members SET
                left_house = COALESCE(NULLIF(left_house, ''), 'unknown'),
                chamber = COALESCE(NULLIF(chamber, ''), 'unknown')
            WHERE NOT EXISTS (SELECT 1 FROM speeches s WHERE s.person_id = members.person_id)
              AND NOT EXISTS (SELECT 1 FROM votes v WHERE v.person_id = members.person_id)
              AND (left_house IS NULL OR left_house = '' OR chamber IS NULL OR chamber = '')
        """)
        db.commit()
        print(f"  Marked {cur.rowcount} orphans as historical/inactive")

    # ── Report ────────────────────────────────────────────────────────────
    after = snapshot_null_counts(db)
    print_report(before, after)


def main():
    parser = argparse.ArgumentParser(description="Enrich members table from existing DB data")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without writing")
    parser.add_argument("--db", type=str, default=None, help="Path to parli.db")
    args = parser.parse_args()

    db = get_db(args.db)
    db.execute("PRAGMA busy_timeout = 600000")
    enrich(db, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
