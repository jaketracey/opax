"""
parli.analysis.entity_resolution -- Unified entity resolution across OPAX data.

Resolves fragmented company/organization names across donations, contracts,
and contract_speech_links into canonical entities with aliases.

Pipeline:
  1. Normalize names (strip suffixes, uppercase, expand abbreviations)
  2. Group similar names via fuzzy matching (SequenceMatcher >= 0.85)
  3. Create canonical entities + alias mappings
  4. Link source tables via entity_id foreign keys
  5. Cross-reference entities appearing in multiple tables

Usage:
    python -m parli.analysis.entity_resolution
    python -m parli.analysis.entity_resolution --rebuild
    python -m parli.analysis.entity_resolution --dry-run
    python -m parli.analysis.entity_resolution --threshold 0.90
"""

import argparse
import json
import re
import sqlite3
import sys
import time
from collections import defaultdict
from difflib import SequenceMatcher
from datetime import datetime
from typing import Optional

from parli.schema import get_db, init_db


def _print(msg: str) -> None:
    """Print with immediate flush (important for long-running pipelines)."""
    print(msg)
    sys.stdout.flush()


def _retry_write(db: sqlite3.Connection, fn, max_retries: int = 120, delay: float = 5.0):
    """Retry a write operation that may fail due to DB locks.

    With max_retries=120 and delay=5s, this will try for up to 10 minutes.
    """
    for attempt in range(max_retries):
        try:
            result = fn()
            return result
        except sqlite3.OperationalError as e:
            if "locked" in str(e).lower() and attempt < max_retries - 1:
                if attempt % 6 == 0:  # Print every 30s
                    _print(f"  DB locked, retrying in {delay}s (attempt {attempt+1}/{max_retries})...")
                time.sleep(delay)
            else:
                raise


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

ENTITY_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS entities (
    entity_id INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_name TEXT NOT NULL UNIQUE,
    entity_type TEXT,  -- 'company', 'union', 'individual', 'government', 'party', 'association', 'other'
    abn TEXT,
    industry TEXT,
    alias_count INTEGER DEFAULT 0,
    total_donated REAL DEFAULT 0,
    total_contracts REAL DEFAULT 0,
    tables_present TEXT,  -- comma-separated: 'donations,contracts,contract_speech_links'
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(canonical_name);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_industry ON entities(industry);

CREATE TABLE IF NOT EXISTS entity_aliases (
    alias_id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id INTEGER NOT NULL,
    alias_name TEXT NOT NULL,
    normalized_name TEXT,
    source_table TEXT,  -- 'donations', 'contracts', 'contract_speech_links'
    row_count INTEGER DEFAULT 0,
    FOREIGN KEY (entity_id) REFERENCES entities(entity_id),
    UNIQUE(alias_name, source_table)
);

CREATE INDEX IF NOT EXISTS idx_entity_aliases_entity ON entity_aliases(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_aliases_name ON entity_aliases(alias_name);
CREATE INDEX IF NOT EXISTS idx_entity_aliases_normalized ON entity_aliases(normalized_name);
"""


def ensure_schema(db: sqlite3.Connection) -> None:
    """Create entity resolution tables if they don't exist."""
    _retry_write(db, lambda: db.executescript(ENTITY_SCHEMA_SQL))

    # Add entity_id columns to source tables if missing
    for table in ("donations", "contracts", "contract_speech_links"):
        cols = {row[1] for row in db.execute(f"PRAGMA table_info({table})").fetchall()}
        if "entity_id" not in cols:
            try:
                _retry_write(db, lambda t=table: db.execute(
                    f"ALTER TABLE {t} ADD COLUMN entity_id INTEGER REFERENCES entities(entity_id)"))
                _print(f"  Added entity_id column to {table}")
            except sqlite3.OperationalError as e:
                if "duplicate column" not in str(e).lower():
                    raise
    _retry_write(db, lambda: db.commit())


# ---------------------------------------------------------------------------
# Name normalization
# ---------------------------------------------------------------------------

# Suffixes to strip (order matters: longest first to avoid partial matches)
_SUFFIXES = [
    r"\(ABN\s*[\d\s]+\)",
    r"\bINCORPORATED\b",
    r"\bLIMITED\b",
    r"\bPTY\s+LTD\b",
    r"\bPTY\b",
    r"\bLTD\b",
    r"\bINC\b",
    r"\bCO\b",
    r"\bCORP\b",
    r"\bCORPORATION\b",
    r"\bGROUP\b",
    r"\bHOLDINGS\b",
    r"\bENTERPRISES\b",
    r"\bSERVICES\b",
    r"\bAUSTRALIA\b",
    r"\bAUSTRALIAN\b",
    r"\bA\.C\.N\.?\s*[\d\s]+",
    r"\bACN\s*[\d\s]+",
    r"\bABN\s*[\d\s]+",
    r"\bATF\b",
    r"\bAS\s+TRUSTEE\s+FOR\b",
    r"\bTRUSTEE\s+FOR\b",
    r"\bt/?a(?:s)?\b",  # t/a, ta, tas (trading as)
]

_SUFFIX_RE = re.compile(r"\s*(?:" + "|".join(_SUFFIXES) + r")\s*", re.IGNORECASE)

# Abbreviation expansions (applied after uppercasing)
_ABBREVIATIONS = {
    "AUST": "AUSTRALIA",
    "AUST.": "AUSTRALIA",
    "AUSTRAL": "AUSTRALIA",
    "ASSOC": "ASSOCIATION",
    "ASSN": "ASSOCIATION",
    "DEPT": "DEPARTMENT",
    "GOVT": "GOVERNMENT",
    "INTL": "INTERNATIONAL",
    "INT'L": "INTERNATIONAL",
    "NATL": "NATIONAL",
    "NAT'L": "NATIONAL",
    "MGMT": "MANAGEMENT",
    "MGT": "MANAGEMENT",
    "SVCS": "SERVICES",
    "SVC": "SERVICE",
    "COMM": "COMMITTEE",
    "CTR": "CENTRE",
    "CNTR": "CENTRE",
    "TECH": "TECHNOLOGY",
    "TELECOMM": "TELECOMMUNICATIONS",
    "TELECOM": "TELECOMMUNICATIONS",
    "ENGG": "ENGINEERING",
    "ENGR": "ENGINEERING",
    "DEVT": "DEVELOPMENT",
    "DEV": "DEVELOPMENT",
    "PROP": "PROPERTIES",
    "PROPS": "PROPERTIES",
    "INVEST": "INVESTMENTS",
    "CONSULT": "CONSULTING",
    "MFG": "MANUFACTURING",
    "MANUF": "MANUFACTURING",
    "FIN": "FINANCIAL",
    "SEC": "SECURITIES",
    "INS": "INSURANCE",
    "CONSTR": "CONSTRUCTION",
    "BLDG": "BUILDING",
    "DIST": "DISTRIBUTION",
    "TRANS": "TRANSPORT",
}

# Words to strip from abbreviation boundary (not entire word removal)
_ABBREV_RE = re.compile(
    r"\b(" + "|".join(re.escape(k) for k in sorted(_ABBREVIATIONS.keys(), key=len, reverse=True)) + r")\b"
)

# Entity type detection patterns
_TYPE_PATTERNS = {
    "union": re.compile(
        r"\b(union|workers|awu|cfmeu|amwu|sda|hsu|usu|nurses|teachers|maritime|electrical trades|ettu|twu|nteu|cpsu|cepu)\b",
        re.IGNORECASE,
    ),
    "party": re.compile(
        r"\b(labor party|liberal party|national party|greens|one nation|united australia|family first|palmer|clive|democrats)\b",
        re.IGNORECASE,
    ),
    "government": re.compile(
        r"\b(department of|dept of|state government|council|municipality|shire|city of)\b"
        r"|\bcommonwealth\b(?!.*\b(bank|insurance|securities|financial|super))",
        re.IGNORECASE,
    ),
    "association": re.compile(
        r"\b(association|institute|foundation|society|council|chamber of commerce|federation|league)\b",
        re.IGNORECASE,
    ),
    "individual": re.compile(
        r"^(mr|mrs|ms|dr|prof|hon|sir|dame)\s",
        re.IGNORECASE,
    ),
}


def normalize_name(name: str) -> str:
    """Normalize a company/org name for comparison.

    Steps: uppercase, strip suffixes/ABNs, expand abbreviations,
    collapse whitespace, strip punctuation edges.
    """
    if not name:
        return ""

    s = name.upper().strip()

    # Remove ABN/ACN patterns first (they contain digits that confuse later steps)
    s = re.sub(r"\(?\bA[BC]N[\s.:]*[\d\s]+\)?", " ", s)

    # Strip known suffixes iteratively (some names have multiple)
    for _ in range(3):
        prev = s
        s = _SUFFIX_RE.sub(" ", s)
        if s == prev:
            break

    # Expand abbreviations
    def _expand(m):
        return _ABBREVIATIONS.get(m.group(1), m.group(1))
    s = _ABBREV_RE.sub(_expand, s)

    # Collapse whitespace
    s = re.sub(r"\s+", " ", s).strip()

    # Strip leading/trailing punctuation and whitespace
    s = re.sub(r"^[\s,.\-/()]+|[\s,.\-/()]+$", "", s)

    return s


def detect_entity_type(name: str) -> str:
    """Guess entity type from the original name."""
    for etype, pattern in _TYPE_PATTERNS.items():
        if pattern.search(name):
            return etype
    return "company"  # default


# ---------------------------------------------------------------------------
# Fuzzy grouping
# ---------------------------------------------------------------------------

def _similarity(a: str, b: str) -> float:
    """Compute similarity between two normalized names."""
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def _blocking_keys(norm: str) -> list[str]:
    """Generate blocking keys for a normalized name.

    Returns multiple keys to increase recall while keeping comparison count manageable.
    Uses prefix blocking (first 3 and 4 chars) plus first-word blocking.
    """
    keys = []
    if len(norm) >= 3:
        keys.append(norm[:3])
    if len(norm) >= 4:
        keys.append(norm[:4])
    # First word (for multi-word names)
    first_word = norm.split()[0] if norm.split() else ""
    if len(first_word) >= 3:
        keys.append(f"W:{first_word}")
    return keys


def group_names(names_with_sources: list[tuple[str, str, str, int]],
                threshold: float = 0.85,
                progress_interval: int = 5000) -> list[list[tuple[str, str, str, int]]]:
    """Group similar names using greedy fuzzy matching with blocking.

    Input: list of (original_name, normalized_name, source_table, row_count)
    Returns: list of groups, each group is a list of (original, normalized, source, count)

    Uses blocking (prefix + first-word) to avoid O(N^2) comparisons,
    then greedy fuzzy matching within blocks.
    Names are sorted by frequency (descending) so the most common variant
    becomes the canonical name.
    """
    # Sort by row_count descending so most-used name is first in each group
    sorted_names = sorted(names_with_sources, key=lambda x: -x[3])

    groups: list[list[tuple[str, str, str, int]]] = []
    # Map from normalized canonical -> group index for fast lookup
    canonical_to_group: dict[str, int] = {}
    # Keep exact-match index for O(1) dedup
    exact_match: dict[str, int] = {}
    # Blocking index: key -> set of (canonical_norm, group_idx)
    block_index: dict[str, list[tuple[str, int]]] = defaultdict(list)

    total = len(sorted_names)
    t0 = time.time()

    for i, (orig, norm, src, cnt) in enumerate(sorted_names):
        if i > 0 and i % progress_interval == 0:
            elapsed = time.time() - t0
            rate = i / elapsed if elapsed > 0 else 0
            _print(f"  Grouping: {i}/{total} ({rate:.0f}/sec, {len(groups)} groups)")

        if not norm or len(norm) < 2:
            # Skip empty/tiny names -- they create bad merges
            groups.append([(orig, norm, src, cnt)])
            continue

        # Fast path: exact normalized match
        if norm in exact_match:
            groups[exact_match[norm]].append((orig, norm, src, cnt))
            continue

        # Use blocking to find candidate groups
        best_idx = -1
        best_score = 0.0
        candidates_checked = set()  # avoid checking same group twice

        for bkey in _blocking_keys(norm):
            for canon, gidx in block_index.get(bkey, []):
                if gidx in candidates_checked:
                    continue
                candidates_checked.add(gidx)
                # Quick length filter
                if abs(len(canon) - len(norm)) > max(len(canon), len(norm)) * (1 - threshold):
                    continue
                score = _similarity(canon, norm)
                if score > best_score:
                    best_score = score
                    best_idx = gidx
                    if score >= 0.98:
                        break
            if best_score >= 0.98:
                break

        if best_score >= threshold and best_idx >= 0:
            groups[best_idx].append((orig, norm, src, cnt))
            exact_match[norm] = best_idx
        else:
            # New group
            gidx = len(groups)
            groups.append([(orig, norm, src, cnt)])
            canonical_to_group[norm] = gidx
            exact_match[norm] = gidx
            # Add to block index
            for bkey in _blocking_keys(norm):
                block_index[bkey].append((norm, gidx))

    elapsed = time.time() - t0
    _print(f"  Grouping complete: {total} names -> {len(groups)} groups in {elapsed:.1f}s")
    return groups


# ---------------------------------------------------------------------------
# Main resolution pipeline
# ---------------------------------------------------------------------------

def collect_names(db: sqlite3.Connection) -> list[tuple[str, str, str, int]]:
    """Collect unique names from all source tables.

    Returns: list of (original_name, normalized_name, source_table, row_count)
    """
    results = []

    # Donations
    rows = db.execute(
        "SELECT donor_name, COUNT(*) as cnt FROM donations GROUP BY donor_name"
    ).fetchall()
    for r in rows:
        name = r[0]
        if name:
            results.append((name, normalize_name(name), "donations", r[1]))
    _print(f"  Collected {len(rows)} unique donor names")

    # Contracts
    rows = db.execute(
        "SELECT supplier_name, COUNT(*) as cnt FROM contracts GROUP BY supplier_name"
    ).fetchall()
    for r in rows:
        name = r[0]
        if name:
            results.append((name, normalize_name(name), "contracts", r[1]))
    _print(f"  Collected {len(rows)} unique supplier names")

    # Contract-speech links
    rows = db.execute(
        "SELECT company_name, COUNT(*) as cnt FROM contract_speech_links GROUP BY company_name"
    ).fetchall()
    for r in rows:
        name = r[0]
        if name:
            results.append((name, normalize_name(name), "contract_speech_links", r[1]))
    _print(f"  Collected {len(rows)} unique company names from contract_speech_links")

    _print(f"  Total names to resolve: {len(results)}")
    return results


def pick_canonical(group: list[tuple[str, str, str, int]]) -> tuple[str, str]:
    """Pick the best canonical name from a group.

    Prefers: longest original name that looks clean (title case, no ALL CAPS),
    falling back to the most frequent variant.
    """
    # Sort by: has mixed case (preferred) -> length (longer preferred) -> count (more preferred)
    def _score(item):
        orig, norm, src, cnt = item
        has_mixed = 1 if orig != orig.upper() and orig != orig.lower() else 0
        return (has_mixed, len(orig), cnt)

    best = max(group, key=_score)
    canonical = best[0].strip()

    # Clean up: title-case ALL CAPS names
    if canonical == canonical.upper() and len(canonical) > 4:
        # Preserve known acronyms
        words = canonical.split()
        cleaned = []
        for w in words:
            if len(w) <= 3 and w.isalpha():
                cleaned.append(w.upper())  # Keep short acronyms uppercase
            else:
                cleaned.append(w.title())
        canonical = " ".join(cleaned)

    entity_type = detect_entity_type(best[0])
    return canonical, entity_type


def resolve_entities(db: sqlite3.Connection,
                     threshold: float = 0.85,
                     dry_run: bool = False,
                     rebuild: bool = False) -> dict:
    """Run the full entity resolution pipeline.

    Returns summary dict with stats.
    """
    t0 = time.time()

    ensure_schema(db)

    if rebuild:
        _print("Rebuilding: clearing existing entity data...")
        def _do_rebuild():
            db.execute("DELETE FROM entity_aliases")
            db.execute("DELETE FROM entities")
            db.execute("UPDATE donations SET entity_id = NULL")
            db.execute("UPDATE contracts SET entity_id = NULL")
            db.execute("UPDATE contract_speech_links SET entity_id = NULL")
            db.commit()
        _retry_write(db, _do_rebuild)

    # Step 1: Collect all names
    _print("\n[1/5] Collecting names from source tables...")
    names = collect_names(db)
    if not names:
        _print("No names found. Nothing to resolve.")
        return {"entities": 0, "aliases": 0, "merged": 0}

    # Step 2: Group by fuzzy matching
    _print(f"\n[2/5] Fuzzy grouping {len(names)} names (threshold={threshold})...")
    groups = group_names(names, threshold=threshold)

    # Step 3: Create entities and aliases
    _print(f"\n[3/5] Creating {len(groups)} canonical entities...")
    total_aliases = 0
    total_merged = 0  # aliases beyond the canonical name
    multi_table_count = 0

    if dry_run:
        # Just count stats without writing
        for group in groups:
            if len(group) > 1:
                total_merged += len(group) - 1
            total_aliases += len(group)
            sources = set(item[2] for item in group)
            if len(sources) > 1:
                multi_table_count += 1
    else:
        # Pre-compute all entity data from read-only queries first,
        # then do batch writes. This avoids holding write locks during reads.
        _print("  Pre-computing entity metadata (read-only)...")

        # Build a lookup dict: donor_name -> industry (first non-null)
        industry_map = {}
        for row in db.execute(
            "SELECT donor_name, industry FROM donations WHERE industry IS NOT NULL GROUP BY donor_name"
        ).fetchall():
            industry_map[row[0]] = row[1]

        # Build donation amount lookup
        donation_amounts = {}
        for row in db.execute(
            "SELECT donor_name, COALESCE(SUM(amount), 0) FROM donations GROUP BY donor_name"
        ).fetchall():
            donation_amounts[row[0]] = row[1]

        # Build contract amount lookup
        contract_amounts = {}
        for row in db.execute(
            "SELECT supplier_name, COALESCE(SUM(amount), 0) FROM contracts GROUP BY supplier_name"
        ).fetchall():
            contract_amounts[row[0]] = row[1]

        _print("  Metadata loaded. Preparing entity records...")

        # Prepare all entity records in memory, dedup by canonical name
        entity_records = []
        seen_canonicals = {}  # canonical_name -> index in entity_records
        for group in groups:
            canonical, entity_type = pick_canonical(group)

            industry = None
            for orig, norm, src, cnt in group:
                if src == "donations" and orig in industry_map:
                    industry = industry_map[orig]
                    break

            sources = sorted(set(item[2] for item in group))
            tables_present = ",".join(sources)

            total_donated = sum(
                donation_amounts.get(orig, 0.0)
                for orig, norm, src, cnt in group if src == "donations"
            )
            total_contracts_val = sum(
                contract_amounts.get(orig, 0.0)
                for orig, norm, src, cnt in group if src == "contracts"
            )

            # Deduplicate: if two groups produce the same canonical, merge them
            if canonical in seen_canonicals:
                idx = seen_canonicals[canonical]
                existing = entity_records[idx]
                # Merge: combine groups, update totals
                merged_group = list(existing[7]) + list(group)
                merged_sources = sorted(set(item[2] for item in merged_group))
                entity_records[idx] = (
                    canonical, entity_type, industry or existing[2],
                    len(merged_group),
                    existing[4] + total_donated,
                    existing[5] + total_contracts_val,
                    ",".join(merged_sources), merged_group
                )
            else:
                seen_canonicals[canonical] = len(entity_records)
                entity_records.append((
                    canonical, entity_type, industry, len(group),
                    total_donated, total_contracts_val, tables_present, group
                ))

            total_aliases += len(group)
            if len(group) > 1:
                total_merged += len(group) - 1
            if len(sources) > 1:
                multi_table_count += 1

        # Write ALL entities in a single transaction to minimize lock contention.
        # With many concurrent writers, acquiring the write lock can take minutes,
        # so we only do it once.
        _print(f"  Writing {len(entity_records)} entities in a single transaction "
               f"(acquiring write lock may take minutes if other writers are active)...")

        def _write_all_entities():
            written = 0
            for (canonical, entity_type, industry, alias_count,
                 total_donated, total_contracts_val, tables_present, group) in entity_records:
                cur = db.execute(
                    """INSERT OR IGNORE INTO entities
                       (canonical_name, entity_type, industry, alias_count, total_donated,
                        total_contracts, tables_present)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (canonical, entity_type, industry, alias_count,
                     total_donated, total_contracts_val, tables_present),
                )
                entity_id = cur.lastrowid
                if not entity_id or cur.rowcount == 0:
                    row = db.execute(
                        "SELECT entity_id FROM entities WHERE canonical_name = ?",
                        (canonical,)
                    ).fetchone()
                    if row:
                        entity_id = row[0]
                    else:
                        continue

                for orig, norm, src, cnt in group:
                    db.execute(
                        """INSERT OR IGNORE INTO entity_aliases
                           (entity_id, alias_name, normalized_name, source_table, row_count)
                           VALUES (?, ?, ?, ?, ?)""",
                        (entity_id, orig, norm, src, cnt),
                    )
                written += 1
            db.commit()
            return written

        written = _retry_write(db, _write_all_entities)
        _print(f"  Wrote {written} entities successfully.")

    # Step 4: Link entity_ids back to source tables
    if not dry_run:
        _print("\n[4/5] Linking entity_id to source tables...")
        _link_entity_ids(db)

    # Step 5: Build cross-reference summary
    _print("\n[5/5] Building cross-reference summary...")
    crossref = _build_crossref(db, dry_run=dry_run)

    elapsed = time.time() - t0
    summary = {
        "canonical_entities": len(groups),
        "total_aliases": total_aliases,
        "aliases_merged": total_merged,
        "multi_table_entities": multi_table_count,
        "elapsed_seconds": round(elapsed, 1),
        "threshold": threshold,
        "generated_at": datetime.now().isoformat(),
        "top_multi_table": crossref.get("top_multi_table", []),
    }

    if not dry_run:
        def _write_cache():
            db.execute(
                "INSERT OR REPLACE INTO analysis_cache (key, value) VALUES (?, ?)",
                ("entity_crossref_summary", json.dumps(summary)),
            )
            db.commit()
        _retry_write(db, _write_cache)

    _print(f"\n{'DRY RUN ' if dry_run else ''}RESULTS:")
    _print(f"  Canonical entities: {summary['canonical_entities']}")
    _print(f"  Total aliases: {summary['total_aliases']}")
    _print(f"  Aliases merged: {summary['aliases_merged']}")
    _print(f"  Multi-table entities: {summary['multi_table_entities']}")
    _print(f"  Time: {summary['elapsed_seconds']}s")

    if crossref.get("top_multi_table"):
        _print(f"\n  Top entities appearing in 2+ tables:")
        for ent in crossref["top_multi_table"][:20]:
            _print(f"    {ent['canonical_name']} ({ent['tables_present']}) "
                  f"donated=${ent['total_donated']:,.0f} contracts=${ent['total_contracts']:,.0f} "
                  f"aliases={ent['alias_count']}")

    return summary


def _link_entity_ids(db: sqlite3.Connection) -> None:
    """Update entity_id in source tables based on alias mappings."""

    # Donations
    def _link_donations():
        cur = db.execute("""
            UPDATE donations SET entity_id = (
                SELECT ea.entity_id FROM entity_aliases ea
                WHERE ea.alias_name = donations.donor_name
                AND ea.source_table = 'donations'
                LIMIT 1
            )
            WHERE entity_id IS NULL
        """)
        db.commit()
        return cur.rowcount
    updated = _retry_write(db, _link_donations)
    _print(f"  Linked {updated} donation rows")

    # Contracts
    def _link_contracts():
        cur = db.execute("""
            UPDATE contracts SET entity_id = (
                SELECT ea.entity_id FROM entity_aliases ea
                WHERE ea.alias_name = contracts.supplier_name
                AND ea.source_table = 'contracts'
                LIMIT 1
            )
            WHERE entity_id IS NULL
        """)
        db.commit()
        return cur.rowcount
    updated = _retry_write(db, _link_contracts)
    _print(f"  Linked {updated} contract rows")

    # Contract-speech links
    def _link_csl():
        cur = db.execute("""
            UPDATE contract_speech_links SET entity_id = (
                SELECT ea.entity_id FROM entity_aliases ea
                WHERE ea.alias_name = contract_speech_links.company_name
                AND ea.source_table = 'contract_speech_links'
                LIMIT 1
            )
            WHERE entity_id IS NULL
        """)
        db.commit()
        return cur.rowcount
    updated = _retry_write(db, _link_csl)
    _print(f"  Linked {updated} contract_speech_link rows")


def _build_crossref(db: sqlite3.Connection, dry_run: bool = False) -> dict:
    """Find entities appearing in multiple tables."""
    if dry_run:
        return {"top_multi_table": []}

    rows = db.execute("""
        SELECT entity_id, canonical_name, entity_type, industry,
               alias_count, total_donated, total_contracts, tables_present
        FROM entities
        WHERE tables_present LIKE '%,%'
        ORDER BY (total_donated + total_contracts) DESC
        LIMIT 100
    """).fetchall()

    top = []
    for r in rows:
        top.append({
            "entity_id": r[0],
            "canonical_name": r[1],
            "entity_type": r[2],
            "industry": r[3],
            "alias_count": r[4],
            "total_donated": r[5] or 0,
            "total_contracts": r[6] or 0,
            "tables_present": r[7],
        })

    return {"top_multi_table": top}


# ---------------------------------------------------------------------------
# API helper functions (called from parli/api.py)
# ---------------------------------------------------------------------------

def get_entity_detail(db: sqlite3.Connection, entity_id: int) -> Optional[dict]:
    """Get full detail for an entity across all tables."""
    entity = db.execute(
        "SELECT * FROM entities WHERE entity_id = ?", (entity_id,)
    ).fetchone()
    if not entity:
        return None

    result = dict(entity)

    # Aliases
    aliases = db.execute(
        "SELECT alias_name, source_table, row_count FROM entity_aliases WHERE entity_id = ? ORDER BY row_count DESC",
        (entity_id,)
    ).fetchall()
    result["aliases"] = [dict(a) for a in aliases]

    # Donations by this entity
    donations = db.execute("""
        SELECT donor_name, recipient, SUM(amount) as total_amount,
               COUNT(*) as donation_count, MIN(financial_year) as first_year,
               MAX(financial_year) as last_year
        FROM donations WHERE entity_id = ?
        GROUP BY donor_name, recipient
        ORDER BY total_amount DESC
        LIMIT 50
    """, (entity_id,)).fetchall()
    result["donations"] = [dict(d) for d in donations]
    result["donations_total"] = sum(d["total_amount"] or 0 for d in result["donations"])

    # Contracts
    contracts = db.execute("""
        SELECT contract_id, title, supplier_name, agency, amount, start_date, end_date
        FROM contracts WHERE entity_id = ?
        ORDER BY amount DESC
        LIMIT 50
    """, (entity_id,)).fetchall()
    result["contracts"] = [dict(c) for c in contracts]
    result["contracts_total"] = sum(c["amount"] or 0 for c in result["contracts"])

    # Contract-speech links (mentions in parliament)
    speech_links = db.execute("""
        SELECT csl.contract_id, csl.speech_id, csl.person_id, csl.company_name,
               csl.contract_amount, csl.donation_amount, csl.party, csl.match_type,
               csl.speech_date, csl.speech_snippet
        FROM contract_speech_links csl
        WHERE csl.entity_id = ?
        ORDER BY csl.speech_date DESC
        LIMIT 50
    """, (entity_id,)).fetchall()
    result["speech_links"] = [dict(s) for s in speech_links]

    return result


def search_entities(db: sqlite3.Connection, query: str, limit: int = 20) -> list[dict]:
    """Fuzzy search for entities by name."""
    # Try exact substring first
    rows = db.execute("""
        SELECT e.entity_id, e.canonical_name, e.entity_type, e.industry,
               e.alias_count, e.total_donated, e.total_contracts, e.tables_present
        FROM entities e
        WHERE e.canonical_name LIKE ?
        ORDER BY (e.total_donated + e.total_contracts) DESC
        LIMIT ?
    """, (f"%{query}%", limit)).fetchall()

    if not rows:
        # Try matching against aliases
        rows = db.execute("""
            SELECT DISTINCT e.entity_id, e.canonical_name, e.entity_type, e.industry,
                   e.alias_count, e.total_donated, e.total_contracts, e.tables_present
            FROM entity_aliases ea
            JOIN entities e ON e.entity_id = ea.entity_id
            WHERE ea.alias_name LIKE ? OR ea.normalized_name LIKE ?
            ORDER BY (e.total_donated + e.total_contracts) DESC
            LIMIT ?
        """, (f"%{query}%", f"%{normalize_name(query)}%", limit)).fetchall()

    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="OPAX Entity Resolution")
    parser.add_argument("--rebuild", action="store_true", help="Clear and rebuild all entities")
    parser.add_argument("--dry-run", action="store_true", help="Show stats without writing")
    parser.add_argument("--threshold", type=float, default=0.85, help="Fuzzy match threshold (0-1)")
    args = parser.parse_args()

    db = get_db()
    db.execute("PRAGMA busy_timeout = 600000")
    init_db(db)

    resolve_entities(db, threshold=args.threshold, dry_run=args.dry_run, rebuild=args.rebuild)


if __name__ == "__main__":
    main()
