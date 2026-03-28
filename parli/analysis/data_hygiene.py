"""
parli.analysis.data_hygiene -- Data deduplication and normalization across OPAX tables.

Finds and removes duplicate records in donations, contracts, speeches, and
government_grants. Normalizes donor names using the entity_aliases table for
canonical names, falling back to standard title-case normalization.

Usage:
    python -m parli.analysis.data_hygiene --dry-run   # preview changes
    python -m parli.analysis.data_hygiene --fix        # apply changes
    python -m parli.analysis.data_hygiene --fix --skip-speeches  # skip slow speech dedup
"""

import argparse
import hashlib
import json
import sqlite3
import sys
import time
from datetime import datetime
from typing import Optional

from parli.schema import get_db, init_db


def _print(msg: str) -> None:
    print(msg)
    sys.stdout.flush()


def _retry_write(db: sqlite3.Connection, fn, max_retries: int = 60, delay: float = 5.0):
    """Retry a write operation that may fail due to DB locks."""
    for attempt in range(max_retries):
        try:
            return fn()
        except sqlite3.OperationalError as e:
            if "locked" in str(e).lower() and attempt < max_retries - 1:
                if attempt % 6 == 0:
                    _print(f"  DB locked, retrying in {delay}s (attempt {attempt+1}/{max_retries})...")
                time.sleep(delay)
            else:
                raise


# ---------------------------------------------------------------------------
# 1. Find and remove duplicate donations
# ---------------------------------------------------------------------------

def find_donation_duplicates(db: sqlite3.Connection) -> dict:
    """Find duplicate donation rows.

    Returns stats dict with:
      - exact_dupes: same name, recipient, amount, financial_year, source
      - case_dupes: same after UPPER(), different original casing
      - exact_dupe_rows: list of (keep_rowid, delete_rowids) tuples
      - case_dupe_rows: list of (keep_rowid, delete_rowids, canonical_name) tuples
    """
    _print("\n[1/6] Finding donation duplicates...")

    # Exact duplicates: same donor_name, recipient, amount, financial_year, source
    # Keep the row with the most non-null fields (or lowest rowid as tiebreaker)
    _print("  Scanning for exact duplicates...")
    exact_groups = db.execute("""
        SELECT donor_name, recipient, amount, financial_year, COALESCE(source, ''),
               GROUP_CONCAT(donation_id) as ids, COUNT(*) as cnt
        FROM donations
        GROUP BY donor_name, recipient, amount, financial_year, COALESCE(source, '')
        HAVING cnt > 1
    """).fetchall()

    exact_dupe_delete_ids = []
    for row in exact_groups:
        ids = [int(x) for x in row[5].split(",")]
        # For each group, pick the "best" row to keep (most non-null fields)
        best_id = None
        best_score = -1
        for did in ids:
            r = db.execute(
                "SELECT donor_type, industry, state, entity_id FROM donations WHERE donation_id = ?",
                (did,)
            ).fetchone()
            if r:
                score = sum(1 for v in r if v is not None)
                if score > best_score or (score == best_score and (best_id is None or did < best_id)):
                    best_score = score
                    best_id = did
        if best_id is not None:
            exact_dupe_delete_ids.extend(did for did in ids if did != best_id)

    _print(f"  Found {len(exact_groups)} exact duplicate groups -> {len(exact_dupe_delete_ids)} rows to delete")

    # Case-different duplicates: UPPER(donor_name) matches but donor_name differs
    # These are found AFTER removing exact dupes (conceptually)
    _print("  Scanning for case-different duplicates...")
    case_groups = db.execute("""
        SELECT UPPER(donor_name) as uname, recipient, amount, financial_year,
               COALESCE(source, ''),
               GROUP_CONCAT(donation_id) as ids,
               GROUP_CONCAT(donor_name, '|||') as names,
               COUNT(*) as cnt
        FROM donations
        GROUP BY UPPER(donor_name), recipient, amount, financial_year, COALESCE(source, '')
        HAVING cnt > 1
          AND COUNT(DISTINCT donor_name) > 1
    """).fetchall()

    case_dupe_delete_ids = []
    case_dupe_renames = []  # (donation_id, new_name)
    for row in case_groups:
        ids = [int(x) for x in row[5].split(",")]
        names = row[6].split("|||")

        # Pick the best name variant: prefer title case over ALL CAPS
        name_variants = list(set(names))
        best_name = _pick_best_name_variant(name_variants)

        # Keep one row, delete the rest (same logic as exact)
        best_id = None
        best_score = -1
        for did in ids:
            r = db.execute(
                "SELECT donor_type, industry, state, entity_id FROM donations WHERE donation_id = ?",
                (did,)
            ).fetchone()
            if r:
                score = sum(1 for v in r if v is not None)
                if score > best_score or (score == best_score and (best_id is None or did < best_id)):
                    best_score = score
                    best_id = did
        if best_id is not None:
            case_dupe_delete_ids.extend(did for did in ids if did != best_id)
            # Rename the kept row to the best name
            case_dupe_renames.append((best_id, best_name))

    _print(f"  Found {len(case_groups)} case-different groups -> {len(case_dupe_delete_ids)} rows to delete")

    return {
        "exact_dupe_groups": len(exact_groups),
        "exact_dupe_delete_count": len(exact_dupe_delete_ids),
        "exact_dupe_delete_ids": exact_dupe_delete_ids,
        "case_dupe_groups": len(case_groups),
        "case_dupe_delete_count": len(case_dupe_delete_ids),
        "case_dupe_delete_ids": case_dupe_delete_ids,
        "case_dupe_renames": case_dupe_renames,
    }


def _pick_best_name_variant(variants: list[str]) -> str:
    """Pick the best name variant from a list of case-different versions."""
    def _score(name):
        # Prefer: mixed case > title case > all lower > ALL CAPS
        is_upper = name == name.upper()
        is_lower = name == name.lower()
        is_title = name == name.title()
        mixed = not is_upper and not is_lower
        return (mixed, not is_upper, is_title, len(name))

    return max(variants, key=_score)


def fix_donation_duplicates(db: sqlite3.Connection, dupes: dict) -> dict:
    """Delete duplicate donation rows and rename case variants."""
    deleted = 0
    renamed = 0

    # Delete exact duplicates in batches
    all_delete_ids = set(dupes["exact_dupe_delete_ids"]) | set(dupes["case_dupe_delete_ids"])
    if all_delete_ids:
        _print(f"  Deleting {len(all_delete_ids)} duplicate donation rows...")
        batch_size = 500
        id_list = list(all_delete_ids)
        for i in range(0, len(id_list), batch_size):
            batch = id_list[i:i + batch_size]
            placeholders = ",".join("?" * len(batch))
            def _do_delete(b=batch, ph=placeholders):
                cur = db.execute(f"DELETE FROM donations WHERE donation_id IN ({ph})", b)
                db.commit()
                return cur.rowcount
            deleted += _retry_write(db, _do_delete)

    # Rename kept rows from case-different groups
    if dupes["case_dupe_renames"]:
        _print(f"  Renaming {len(dupes['case_dupe_renames'])} kept rows to best name variant...")
        for did, new_name in dupes["case_dupe_renames"]:
            if did not in all_delete_ids:
                def _do_rename(d=did, n=new_name):
                    db.execute("UPDATE donations SET donor_name = ? WHERE donation_id = ?", (n, d))
                    db.commit()
                    return 1
                renamed += _retry_write(db, _do_rename)

    _print(f"  Deleted {deleted} rows, renamed {renamed} rows")
    return {"deleted": deleted, "renamed": renamed}


# ---------------------------------------------------------------------------
# 2. Normalize donor names using entity_aliases
# ---------------------------------------------------------------------------

def normalize_donor_names(db: sqlite3.Connection, dry_run: bool = True) -> dict:
    """Normalize donor_name values.

    Only normalizes ALL-CAPS names to smart title case. Entity alias
    resolution is handled separately by entity_resolution.py via entity_id
    (renaming donor_name to a canonical from a different entity group would
    lose provenance and merge distinct branches/states).
    """
    _print("\n[2/6] Normalizing donor names...")

    # Find all unique donor names that are ALL CAPS
    donor_names = db.execute(
        "SELECT DISTINCT donor_name FROM donations WHERE donor_name IS NOT NULL"
    ).fetchall()
    _print(f"  Found {len(donor_names)} unique donor names")

    changes = []
    for (name,) in donor_names:
        new_name = None

        # Only normalize ALL CAPS names to title case
        if name == name.upper() and len(name) > 4 and any(c.isalpha() for c in name):
            new_name = _smart_title_case(name)

        if new_name and new_name != name:
            changes.append((name, new_name))

    _print(f"  Found {len(changes)} names to normalize")
    if changes:
        _print(f"  Sample changes:")
        for old, new in changes[:10]:
            _print(f"    {old!r} -> {new!r}")

    if not dry_run and changes:
        _print(f"  Applying {len(changes)} name normalizations...")
        updated = 0
        for old_name, new_name in changes:
            def _do_update(o=old_name, n=new_name):
                cur = db.execute("UPDATE donations SET donor_name = ? WHERE donor_name = ?", (n, o))
                db.commit()
                return cur.rowcount
            updated += _retry_write(db, _do_update)
        _print(f"  Updated {updated} donation rows")
        return {"names_normalized": len(changes), "rows_updated": updated}

    return {"names_normalized": len(changes), "rows_updated": 0}


def _smart_title_case(name: str) -> str:
    """Convert ALL CAPS name to smart title case, preserving acronyms and known patterns."""
    # Known terms to keep uppercase
    keep_upper = {
        "PTY", "LTD", "ABN", "ACN", "ATF", "NSW", "VIC", "QLD", "WA", "SA",
        "NT", "ACT", "TAS", "NZ", "USA", "UK", "BHP", "CBA", "NAB", "ANZ",
        "AMP", "IAG", "QBE", "ASX", "AFL", "NRL", "ABC", "SBS", "NBN",
        "CFMEU", "AWU", "SDA", "AMWU", "HSU", "TWU", "ALP", "AMA", "CEO",
        "IT", "IP", "AI", "HR", "PR", "TV", "FM", "AM", "GP", "MP", "MLC",
        "MLA", "MHR", "JP", "OAM", "AO", "AC", "AM", "II", "III", "IV",
    }

    words = name.split()
    result = []
    for w in words:
        stripped = w.strip(".,()-/")
        if stripped.upper() in keep_upper:
            result.append(w)  # Keep original (usually already upper)
        elif len(stripped) <= 2 and stripped.isalpha():
            result.append(w.upper())  # Short words stay upper (likely acronyms)
        elif stripped.startswith("MC") and len(stripped) > 2:
            # McDonald, McPherson etc
            result.append(w[:2] + w[2:].title())
        elif "'" in w:
            # O'Brien, D'Arcy
            parts = w.split("'")
            result.append("'".join(p.title() for p in parts))
        else:
            result.append(w.title())

    return " ".join(result)


# ---------------------------------------------------------------------------
# 3. Deduplicate contracts
# ---------------------------------------------------------------------------

def find_contract_duplicates(db: sqlite3.Connection) -> dict:
    """Find duplicate contract records."""
    _print("\n[3/6] Finding contract duplicates...")

    groups = db.execute("""
        SELECT UPPER(supplier_name) as uname, agency, amount, start_date,
               GROUP_CONCAT(contract_id) as ids, COUNT(*) as cnt
        FROM contracts
        WHERE supplier_name IS NOT NULL
        GROUP BY UPPER(supplier_name), agency, amount, start_date
        HAVING cnt > 1
    """).fetchall()

    delete_ids = []
    for row in groups:
        ids = row[4].split(",")
        # Keep the first, delete the rest
        delete_ids.extend(ids[1:])

    _print(f"  Found {len(groups)} duplicate contract groups -> {len(delete_ids)} rows to delete")
    return {
        "dupe_groups": len(groups),
        "delete_count": len(delete_ids),
        "delete_ids": delete_ids,
    }


def fix_contract_duplicates(db: sqlite3.Connection, dupes: dict) -> int:
    """Delete duplicate contract rows."""
    if not dupes["delete_ids"]:
        return 0

    deleted = 0
    batch_size = 500
    id_list = dupes["delete_ids"]
    for i in range(0, len(id_list), batch_size):
        batch = id_list[i:i + batch_size]
        placeholders = ",".join("?" * len(batch))
        def _do_delete(b=batch, ph=placeholders):
            cur = db.execute(f"DELETE FROM contracts WHERE contract_id IN ({ph})", b)
            db.commit()
            return cur.rowcount
        deleted += _retry_write(db, _do_delete)

    _print(f"  Deleted {deleted} duplicate contract rows")
    return deleted


# ---------------------------------------------------------------------------
# 4. Deduplicate speeches
# ---------------------------------------------------------------------------

def find_speech_duplicates(db: sqlite3.Connection) -> dict:
    """Find duplicate speeches: same person_id, date, and text hash."""
    _print("\n[4/6] Finding speech duplicates...")

    # Use SUBSTR for a text fingerprint -- full text comparison is too slow for 1M+ rows
    groups = db.execute("""
        SELECT person_id, date, SUBSTR(text, 1, 300) as txt_prefix,
               GROUP_CONCAT(speech_id) as ids, COUNT(*) as cnt
        FROM speeches
        WHERE person_id IS NOT NULL
        GROUP BY person_id, date, txt_prefix
        HAVING cnt > 1
    """).fetchall()

    delete_ids = []
    for row in groups:
        ids = [int(x) for x in row[3].split(",")]
        # Keep the lowest speech_id (first ingested), delete the rest
        ids.sort()
        delete_ids.extend(ids[1:])

    _print(f"  Found {len(groups)} duplicate speech groups -> {len(delete_ids)} rows to delete")
    return {
        "dupe_groups": len(groups),
        "delete_count": len(delete_ids),
        "delete_ids": delete_ids,
    }


def fix_speech_duplicates(db: sqlite3.Connection, dupes: dict) -> int:
    """Delete duplicate speech rows and clean up related tables."""
    if not dupes["delete_ids"]:
        return 0

    deleted = 0
    batch_size = 500
    id_list = dupes["delete_ids"]

    _print(f"  Deleting {len(id_list)} duplicate speech rows in batches...")
    for i in range(0, len(id_list), batch_size):
        batch = id_list[i:i + batch_size]
        placeholders = ",".join("?" * len(batch))

        def _do_delete(b=batch, ph=placeholders):
            # Delete from speech_topics first (FK)
            db.execute(f"DELETE FROM speech_topics WHERE speech_id IN ({ph})", b)
            cur = db.execute(f"DELETE FROM speeches WHERE speech_id IN ({ph})", b)
            db.commit()
            return cur.rowcount
        deleted += _retry_write(db, _do_delete)

        if (i // batch_size) % 20 == 0 and i > 0:
            _print(f"    Deleted {deleted} so far ({i}/{len(id_list)})...")

    _print(f"  Deleted {deleted} duplicate speech rows")
    return deleted


# ---------------------------------------------------------------------------
# 5. Deduplicate government grants
# ---------------------------------------------------------------------------

def find_grant_duplicates(db: sqlite3.Connection) -> dict:
    """Find duplicate government grant records."""
    _print("\n[5/6] Finding government grant duplicates...")

    groups = db.execute("""
        SELECT recipient, program, amount, start_date,
               GROUP_CONCAT(grant_id) as ids, COUNT(*) as cnt
        FROM government_grants
        WHERE recipient IS NOT NULL
        GROUP BY recipient, program, amount, start_date
        HAVING cnt > 1
    """).fetchall()

    delete_ids = []
    for row in groups:
        ids = [int(x) for x in row[4].split(",")]
        ids.sort()
        # Keep the first, delete the rest
        delete_ids.extend(ids[1:])

    _print(f"  Found {len(groups)} duplicate grant groups -> {len(delete_ids)} rows to delete")
    return {
        "dupe_groups": len(groups),
        "delete_count": len(delete_ids),
        "delete_ids": delete_ids,
    }


def fix_grant_duplicates(db: sqlite3.Connection, dupes: dict) -> int:
    """Delete duplicate grant rows."""
    if not dupes["delete_ids"]:
        return 0

    deleted = 0
    batch_size = 500
    id_list = dupes["delete_ids"]
    for i in range(0, len(id_list), batch_size):
        batch = id_list[i:i + batch_size]
        placeholders = ",".join("?" * len(batch))
        def _do_delete(b=batch, ph=placeholders):
            cur = db.execute(f"DELETE FROM government_grants WHERE grant_id IN ({ph})", b)
            db.commit()
            return cur.rowcount
        deleted += _retry_write(db, _do_delete)

    _print(f"  Deleted {deleted} duplicate grant rows")
    return deleted


# ---------------------------------------------------------------------------
# 6. Data hygiene report
# ---------------------------------------------------------------------------

def generate_report(db: sqlite3.Connection, results: dict) -> dict:
    """Generate and store a data hygiene report in analysis_cache."""
    _print("\n[6/6] Generating data hygiene report...")

    # Current table counts
    table_counts = {}
    for table in ["donations", "contracts", "speeches", "government_grants"]:
        cnt = db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        table_counts[table] = cnt

    # Data quality score: 0-100 based on remaining duplicates
    # Check how many dupes remain after fixes
    remaining_donation_dupes = db.execute("""
        SELECT COUNT(*) FROM (
            SELECT donor_name, recipient, amount, financial_year, COALESCE(source, ''), COUNT(*) as cnt
            FROM donations
            GROUP BY donor_name, recipient, amount, financial_year, COALESCE(source, '')
            HAVING cnt > 1
        )
    """).fetchone()[0]

    total_donations = table_counts["donations"]
    dupe_ratio = remaining_donation_dupes / max(total_donations, 1)
    quality_score = round(max(0, 100 * (1 - dupe_ratio * 10)), 1)  # penalize heavily

    report = {
        "generated_at": datetime.now().isoformat(),
        "table_counts": table_counts,
        "donations": {
            "exact_dupe_groups_found": results.get("donation_exact_dupe_groups", 0),
            "exact_dupe_rows_deleted": results.get("donation_exact_deleted", 0),
            "case_dupe_groups_found": results.get("donation_case_dupe_groups", 0),
            "case_dupe_rows_deleted": results.get("donation_case_deleted", 0),
            "names_normalized": results.get("donation_names_normalized", 0),
            "normalization_rows_updated": results.get("donation_normalization_rows", 0),
            "remaining_dupe_groups": remaining_donation_dupes,
        },
        "contracts": {
            "dupe_groups_found": results.get("contract_dupe_groups", 0),
            "rows_deleted": results.get("contract_deleted", 0),
        },
        "speeches": {
            "dupe_groups_found": results.get("speech_dupe_groups", 0),
            "rows_deleted": results.get("speech_deleted", 0),
        },
        "government_grants": {
            "dupe_groups_found": results.get("grant_dupe_groups", 0),
            "rows_deleted": results.get("grant_deleted", 0),
        },
        "data_quality_score": quality_score,
        "mode": results.get("mode", "dry-run"),
    }

    # Store in analysis_cache
    if results.get("mode") == "fix":
        def _write_cache():
            db.execute(
                "INSERT OR REPLACE INTO analysis_cache (key, value) VALUES (?, ?)",
                ("data_hygiene_report", json.dumps(report, indent=2)),
            )
            db.commit()
        _retry_write(db, _write_cache)
        _print("  Report stored in analysis_cache as 'data_hygiene_report'")

    _print(f"\n{'=' * 60}")
    _print(f"DATA HYGIENE REPORT ({results.get('mode', 'dry-run').upper()})")
    _print(f"{'=' * 60}")
    _print(f"Generated: {report['generated_at']}")
    _print(f"Data quality score: {quality_score}/100")
    _print(f"\nTable row counts:")
    for t, c in table_counts.items():
        _print(f"  {t}: {c:,}")
    _print(f"\nDonations:")
    _print(f"  Exact duplicate groups: {report['donations']['exact_dupe_groups_found']:,}")
    _print(f"  Exact dupe rows deleted: {report['donations']['exact_dupe_rows_deleted']:,}")
    _print(f"  Case-different groups: {report['donations']['case_dupe_groups_found']:,}")
    _print(f"  Case dupe rows deleted: {report['donations']['case_dupe_rows_deleted']:,}")
    _print(f"  Names normalized: {report['donations']['names_normalized']:,}")
    _print(f"  Remaining dupe groups: {report['donations']['remaining_dupe_groups']:,}")
    _print(f"\nContracts:")
    _print(f"  Duplicate groups: {report['contracts']['dupe_groups_found']:,}")
    _print(f"  Rows deleted: {report['contracts']['rows_deleted']:,}")
    _print(f"\nSpeeches:")
    _print(f"  Duplicate groups: {report['speeches']['dupe_groups_found']:,}")
    _print(f"  Rows deleted: {report['speeches']['rows_deleted']:,}")
    _print(f"\nGovernment grants:")
    _print(f"  Duplicate groups: {report['government_grants']['dupe_groups_found']:,}")
    _print(f"  Rows deleted: {report['government_grants']['rows_deleted']:,}")

    return report


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def run_hygiene(db: sqlite3.Connection, dry_run: bool = True, skip_speeches: bool = False) -> dict:
    """Run the full data hygiene pipeline.

    Args:
        db: Database connection
        dry_run: If True, only report findings without making changes
        skip_speeches: If True, skip the (slow) speech deduplication step
    """
    mode = "dry-run" if dry_run else "fix"
    _print(f"\n{'=' * 60}")
    _print(f"OPAX DATA HYGIENE {'(DRY RUN)' if dry_run else '(APPLYING FIXES)'}")
    _print(f"{'=' * 60}")

    t0 = time.time()
    results = {"mode": mode}

    # 1. Donation duplicates
    donation_dupes = find_donation_duplicates(db)
    results["donation_exact_dupe_groups"] = donation_dupes["exact_dupe_groups"]
    results["donation_case_dupe_groups"] = donation_dupes["case_dupe_groups"]

    if not dry_run:
        fix_result = fix_donation_duplicates(db, donation_dupes)
        results["donation_exact_deleted"] = fix_result["deleted"]
        results["donation_case_deleted"] = 0  # counted in the combined delete above
    else:
        results["donation_exact_deleted"] = 0
        results["donation_case_deleted"] = 0
        _print(f"  [DRY RUN] Would delete {donation_dupes['exact_dupe_delete_count'] + donation_dupes['case_dupe_delete_count']:,} donation rows")

    # 2. Normalize donor names
    norm_result = normalize_donor_names(db, dry_run=dry_run)
    results["donation_names_normalized"] = norm_result["names_normalized"]
    results["donation_normalization_rows"] = norm_result["rows_updated"]

    # 3. Contract duplicates
    contract_dupes = find_contract_duplicates(db)
    results["contract_dupe_groups"] = contract_dupes["dupe_groups"]

    if not dry_run:
        results["contract_deleted"] = fix_contract_duplicates(db, contract_dupes)
    else:
        results["contract_deleted"] = 0
        _print(f"  [DRY RUN] Would delete {contract_dupes['delete_count']:,} contract rows")

    # 4. Speech duplicates
    if skip_speeches:
        _print("\n[4/6] Skipping speech deduplication (--skip-speeches)")
        results["speech_dupe_groups"] = 0
        results["speech_deleted"] = 0
    else:
        speech_dupes = find_speech_duplicates(db)
        results["speech_dupe_groups"] = speech_dupes["dupe_groups"]

        if not dry_run:
            results["speech_deleted"] = fix_speech_duplicates(db, speech_dupes)
        else:
            results["speech_deleted"] = 0
            _print(f"  [DRY RUN] Would delete {speech_dupes['delete_count']:,} speech rows")

    # 5. Grant duplicates
    grant_dupes = find_grant_duplicates(db)
    results["grant_dupe_groups"] = grant_dupes["dupe_groups"]

    if not dry_run:
        results["grant_deleted"] = fix_grant_duplicates(db, grant_dupes)
    else:
        results["grant_deleted"] = 0
        _print(f"  [DRY RUN] Would delete {grant_dupes['delete_count']:,} grant rows")

    # 6. Generate report
    report = generate_report(db, results)

    elapsed = time.time() - t0
    _print(f"\nCompleted in {elapsed:.1f}s")

    # Rebuild FTS5 indexes if we made changes
    if not dry_run and results.get("speech_deleted", 0) > 0:
        _print("\nRebuilding FTS5 index for speeches...")
        def _rebuild_fts():
            db.execute("INSERT INTO speeches_fts(speeches_fts) VALUES('rebuild')")
            db.commit()
        _retry_write(db, _rebuild_fts)
        _print("  FTS5 rebuild complete")

    return report


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="OPAX Data Hygiene: deduplicate and normalize database records"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true", help="Show what would change without modifying data")
    group.add_argument("--fix", action="store_true", help="Apply deduplication and normalization fixes")
    parser.add_argument("--skip-speeches", action="store_true", help="Skip speech deduplication (slow on large DBs)")

    args = parser.parse_args()

    db = get_db()
    db.execute("PRAGMA busy_timeout = 600000")
    init_db(db)

    run_hygiene(db, dry_run=args.dry_run, skip_speeches=args.skip_speeches)


if __name__ == "__main__":
    main()
