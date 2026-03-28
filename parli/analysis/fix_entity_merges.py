"""
parli.analysis.fix_entity_merges -- Find and fix false merges in entity resolution.

The entity resolution pipeline (entity_resolution.py) uses blocking + fuzzy matching
at threshold 0.85, but blocking by prefix/first-word can group entities that share
prefixes yet are genuinely different:

  - "Beak Engineering" merged with "Beaver Engineering"
  - "Christopher Keeley" merged with "Christopher Kennedy"
  - Liberal Party state divisions all merged (NSW, VIC, QLD, SA, WA, TAS, NT, ACT)
  - Union state branches incorrectly merged (IEU SA + IEU WA, SDA branches, TWU branches)

This script:
  1. Scans all entities for suspicious alias pairs (SequenceMatcher < 0.7)
  2. Splits incorrectly merged state branches (parties and unions) into per-state entities
  3. Splits name-similar but distinct companies/people into separate entities
  4. Reports corrections made

Usage:
    python -m parli.analysis.fix_entity_merges
    python -m parli.analysis.fix_entity_merges --dry-run
    python -m parli.analysis.fix_entity_merges --similarity-threshold 0.65
"""

import argparse
import re
import sqlite3
import sys
import time
from collections import defaultdict
from difflib import SequenceMatcher
from typing import Optional

from parli.schema import get_db, init_db
from parli.analysis.entity_resolution import normalize_name, detect_entity_type


def _print(msg: str) -> None:
    print(msg)
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# State detection
# ---------------------------------------------------------------------------

# Canonical state names and their abbreviations/variants
STATE_PATTERNS = {
    "NSW": re.compile(r"\bNSW\b|\bNew South Wales\b|\bN\.S\.W\b", re.IGNORECASE),
    "VIC": re.compile(r"\bVIC\b|\bVictoria\b(?!n Division)|\bVictorian\b", re.IGNORECASE),
    "QLD": re.compile(r"\bQLD\b|\bQueensland\b", re.IGNORECASE),
    "SA":  re.compile(r"\bSA\b|\bSouth Austral(?:ia|ian)\b|\bS\.A\b", re.IGNORECASE),
    "WA":  re.compile(r"\bWA\b|\bWestern Austral(?:ia|ian)\b|\bW\.A\b", re.IGNORECASE),
    "TAS": re.compile(r"\bTAS\b|\bTasmania\b|\bTasmanian\b", re.IGNORECASE),
    "NT":  re.compile(r"\bNT\b|\bNorthern Territory\b", re.IGNORECASE),
    "ACT": re.compile(r"\bACT\b|\bA\.C\.T\b", re.IGNORECASE),
}

# Combined state abbreviations used in branch names (e.g., SA/NT, VIC/TAS)
COMBINED_STATE_RE = re.compile(
    r"\b(?:SA/NT|VIC/TAS|NSW/ACT|QLD/NT)\b", re.IGNORECASE
)

# Words that indicate a state branch/division context
BRANCH_INDICATORS = re.compile(
    r"\b(?:branch|division|div|divison|dvision)\b", re.IGNORECASE
)

# National/Federal indicators -- these are NOT state-specific
NATIONAL_INDICATORS = re.compile(
    r"\b(?:national|federal|nat\b|fed\b|australia-wide)\b", re.IGNORECASE
)


def detect_states(name: str) -> set[str]:
    """Detect which Australian states/territories are mentioned in a name.

    Returns set of state abbreviations found (e.g., {'NSW', 'VIC'}).
    """
    states = set()
    for abbrev, pattern in STATE_PATTERNS.items():
        if pattern.search(name):
            states.add(abbrev)
    # Also detect combined branches
    for m in COMBINED_STATE_RE.finditer(name):
        parts = m.group(0).upper().replace(".", "").split("/")
        states.update(parts)
    return states


def is_state_branch(name: str) -> bool:
    """Check if a name refers to a specific state branch/division."""
    states = detect_states(name)
    if not states:
        return False
    # Must have branch/division indicator or state abbreviation in typical position
    if BRANCH_INDICATORS.search(name):
        return True
    # Pattern like "Liberal Party of Australia (NSW Division)"
    if re.search(r"\([^)]*(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT)[^)]*\)", name, re.IGNORECASE):
        return True
    # Pattern like "... - NSW" or "... NSW Branch"
    if re.search(r"[-,]\s*(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b", name, re.IGNORECASE):
        return True
    return bool(states)


def assign_state_group(alias_name: str) -> Optional[str]:
    """Determine which state group an alias belongs to, or None for national/generic.

    For combined branches like SA/NT, returns the combined key "SA/NT".
    """
    # Check for combined state branches first
    m = COMBINED_STATE_RE.search(alias_name)
    if m:
        return m.group(0).upper().replace(".", "")

    if NATIONAL_INDICATORS.search(alias_name) and not detect_states(alias_name):
        return "NATIONAL"

    states = detect_states(alias_name)
    if len(states) == 1:
        return states.pop()
    elif len(states) > 1:
        # Multiple states detected -- use sorted key
        return "/".join(sorted(states))

    return None  # No state detected


# ---------------------------------------------------------------------------
# Suspicious merge detection
# ---------------------------------------------------------------------------

# Common suffixes/filler words to ignore when comparing key words
_FILLER_WORDS = {
    "PTY", "LTD", "LIMITED", "INC", "INCORPORATED", "CO", "CORP",
    "CORPORATION", "GROUP", "HOLDINGS", "OF", "THE", "AND", "&",
    "FOR", "IN", "AT", "BY", "TO", "A", "AN", "-", "/",
    "MR", "MRS", "MS", "DR", "PROF", "HON", "SIR", "DAME",
    # Structural words that don't distinguish entities
    "BRANCH", "DIVISION", "DIV", "SECTION", "CHAPTER", "OFFICE",
    "FEDERAL", "NATIONAL", "STATE",
    # State names and abbreviations (handled by state divergence detection instead)
    "NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT",
    "VICTORIA", "VICTORIAN", "QUEENSLAND", "TASMANIA", "TASMANIAN",
}


def _has_different_key_words(name_a: str, name_b: str) -> bool:
    """Check if two similar names differ in a key (non-filler) word.

    Returns True if the names share a structure but have at least one
    substantive word that is different and those different words are
    themselves dissimilar (SequenceMatcher < 0.6).

    Examples:
      "BEAK ENGINEERING PTY LTD" vs "BEAVER ENGINEERING PTY LTD" -> True
      "CHRISTOPHER KEELEY" vs "CHRISTOPHER KENNEDY" -> True
      "LIBERAL PARTY NSW" vs "LIBERAL PARTY OF NSW" -> False (only filler differs)
    """
    words_a = [w for w in name_a.split() if w not in _FILLER_WORDS and len(w) > 1]
    words_b = [w for w in name_b.split() if w not in _FILLER_WORDS and len(w) > 1]

    if not words_a or not words_b:
        return False

    # Find words present in one but not the other
    set_a = set(words_a)
    set_b = set(words_b)
    shared = set_a & set_b
    only_a = set_a - set_b
    only_b = set_b - set_a

    if not only_a or not only_b:
        return False

    # Must have some shared context (not completely different names)
    if len(shared) < 1:
        return False

    # Check if the differing words are genuinely different
    for wa in only_a:
        for wb in only_b:
            sim = SequenceMatcher(None, wa, wb).ratio()
            if sim < 0.65 and len(wa) >= 3 and len(wb) >= 3:
                # The differing words are substantively different
                return True

    return False


def find_suspicious_merges(db: sqlite3.Connection,
                           similarity_threshold: float = 0.7) -> list[dict]:
    """Find entities whose aliases look too different to be the same entity.

    Uses two detection strategies:
      1. State divergence: aliases within one entity reference different AU states
         (catches party divisions and union branches incorrectly merged)
      2. Pairwise similarity: alias pairs with SequenceMatcher < threshold on
         the ORIGINAL names (not normalized, since normalization strips too much
         and inflates similarity)

    Returns list of dicts with entity info and the suspicious alias pairs.
    """
    _print("\n[1/4] Scanning for suspicious merges...")

    # Get all entities with 2+ actual aliases (alias_count column may be stale)
    entities = db.execute("""
        SELECT e.entity_id, e.canonical_name, e.entity_type,
               COUNT(ea.alias_id) as actual_alias_count
        FROM entities e
        JOIN entity_aliases ea ON e.entity_id = ea.entity_id
        GROUP BY e.entity_id
        HAVING actual_alias_count >= 2
        ORDER BY actual_alias_count DESC
    """).fetchall()

    suspicious = []
    checked = 0

    for ent in entities:
        entity_id = ent[0]
        canonical = ent[1]
        etype = ent[2]

        aliases = db.execute("""
            SELECT alias_name, normalized_name, source_table, row_count
            FROM entity_aliases
            WHERE entity_id = ?
            ORDER BY row_count DESC
        """, (entity_id,)).fetchall()

        if len(aliases) < 2:
            continue

        checked += 1
        alias_tuples = [(a[0], a[1], a[2], a[3]) for a in aliases]

        # --- Strategy 1: State divergence ---
        # Check if aliases span multiple distinct states (party/union false merges)
        states_by_alias = {}
        all_states = set()
        for alias_name, norm_name, src, cnt in alias_tuples:
            s = detect_states(alias_name)
            if s:
                states_by_alias[alias_name] = s
                all_states.update(s)

        if len(all_states) > 1 and len(states_by_alias) >= 2:
            # At least 2 aliases reference different states -- this is a false merge
            merge_type = classify_false_merge(canonical, etype, alias_tuples, [])
            if merge_type in ("party_state_divisions", "union_state_branches", "org_state_branches"):
                bad_pairs = []
                # Generate representative bad pairs for the report
                alias_list = list(states_by_alias.keys())
                for i in range(min(len(alias_list), 5)):
                    for j in range(i + 1, min(len(alias_list), 5)):
                        a, b = alias_list[i], alias_list[j]
                        if states_by_alias[a] != states_by_alias[b]:
                            bad_pairs.append({
                                "alias_a": a,
                                "alias_b": b,
                                "norm_a": normalize_name(a),
                                "norm_b": normalize_name(b),
                                "similarity": round(SequenceMatcher(
                                    None, normalize_name(a), normalize_name(b)).ratio(), 3),
                                "reason": "state_divergence",
                            })
                if bad_pairs:
                    suspicious.append({
                        "entity_id": entity_id,
                        "canonical_name": canonical,
                        "entity_type": etype,
                        "alias_count": len(alias_tuples),
                        "bad_pair_count": len(bad_pairs),
                        "merge_type": merge_type,
                        "bad_pairs": bad_pairs,
                        "aliases": alias_tuples,
                    })
                    continue  # Don't double-flag

        # --- Strategy 2: Pairwise similarity on original names ---
        # Use UPPER of original names (not the heavily-normalized versions)
        bad_pairs = []
        originals = [(a[0], a[0].upper().strip()) for a in alias_tuples]

        for i in range(len(originals)):
            for j in range(i + 1, len(originals)):
                orig_i, upper_i = originals[i]
                orig_j, upper_j = originals[j]
                if not upper_i or not upper_j:
                    continue
                sim = SequenceMatcher(None, upper_i, upper_j).ratio()
                if sim < similarity_threshold:
                    bad_pairs.append({
                        "alias_a": orig_i,
                        "alias_b": orig_j,
                        "norm_a": upper_i,
                        "norm_b": upper_j,
                        "similarity": round(sim, 3),
                        "reason": "low_similarity",
                    })

        if bad_pairs:
            merge_type = classify_false_merge(canonical, etype, alias_tuples, bad_pairs)
            suspicious.append({
                "entity_id": entity_id,
                "canonical_name": canonical,
                "entity_type": etype,
                "alias_count": len(alias_tuples),
                "bad_pair_count": len(bad_pairs),
                "merge_type": merge_type,
                "bad_pairs": bad_pairs,
                "aliases": alias_tuples,
            })
            continue  # Don't double-flag

        # --- Strategy 3: Differentiating-word detection for small entities ---
        # For entities with few aliases, high overall similarity can hide
        # genuinely different names (e.g., "Beak Engineering" vs "Beaver Engineering",
        # "Christopher Keeley" vs "Christopher Kennedy").
        # Compare the words that differ between alias pairs. If the differing
        # words themselves are dissimilar, flag the merge.
        if len(alias_tuples) <= 4:
            for i in range(len(originals)):
                for j in range(i + 1, len(originals)):
                    orig_i, upper_i = originals[i]
                    orig_j, upper_j = originals[j]
                    if not upper_i or not upper_j:
                        continue
                    if _has_different_key_words(upper_i, upper_j):
                        bad_pairs.append({
                            "alias_a": orig_i,
                            "alias_b": orig_j,
                            "norm_a": upper_i,
                            "norm_b": upper_j,
                            "similarity": round(SequenceMatcher(
                                None, upper_i, upper_j).ratio(), 3),
                            "reason": "different_key_words",
                        })

        if bad_pairs:
            merge_type = classify_false_merge(canonical, etype, alias_tuples, bad_pairs)
            suspicious.append({
                "entity_id": entity_id,
                "canonical_name": canonical,
                "entity_type": etype,
                "alias_count": len(alias_tuples),
                "bad_pair_count": len(bad_pairs),
                "merge_type": merge_type,
                "bad_pairs": bad_pairs,
                "aliases": alias_tuples,
            })

    _print(f"  Checked {checked} multi-alias entities")
    _print(f"  Found {len(suspicious)} entities with suspicious merges")

    # Categorize
    by_type = defaultdict(int)
    for s in suspicious:
        by_type[s["merge_type"]] += 1
    for mtype, count in sorted(by_type.items()):
        _print(f"    {mtype}: {count}")

    return suspicious


def classify_false_merge(canonical: str, etype: str,
                         aliases: list, bad_pairs: list) -> str:
    """Classify the type of false merge for reporting and fix selection.

    aliases: list of (alias_name, normalized_name, source_table, row_count) tuples
    """
    alias_names = [a[0] for a in aliases]

    # Check if aliases span multiple states
    states_seen = set()
    for name in alias_names:
        states_seen.update(detect_states(name))

    if len(states_seen) > 1:
        if etype == "party":
            return "party_state_divisions"
        elif etype in ("union", "association"):
            return "union_state_branches"
        else:
            return "org_state_branches"

    # Check if it's a person name mismatch
    if etype == "individual":
        return "individual_name_mismatch"

    # Check if it's a company name mismatch (like Beak vs Beaver)
    for pair in bad_pairs:
        if pair["similarity"] < 0.5:
            return "company_name_mismatch"

    return "other_mismatch"


# ---------------------------------------------------------------------------
# Fix: Split state branches
# ---------------------------------------------------------------------------

def split_state_branches(db: sqlite3.Connection,
                         suspicious: list[dict],
                         dry_run: bool = False) -> list[dict]:
    """Split entities that incorrectly merged different state branches.

    For each entity classified as party_state_divisions, union_state_branches,
    or org_state_branches:
      1. Group aliases by detected state
      2. Create a new entity for each state group
      3. Reassign aliases and update source table entity_id references

    Returns list of corrections made.
    """
    state_merges = [s for s in suspicious
                    if s["merge_type"] in ("party_state_divisions",
                                           "union_state_branches",
                                           "org_state_branches")]

    if not state_merges:
        _print("  No state branch merges to fix.")
        return []

    _print(f"\n[2/4] Splitting {len(state_merges)} incorrectly merged state branch entities...")

    corrections = []

    for item in state_merges:
        entity_id = item["entity_id"]
        canonical = item["canonical_name"]
        etype = item["entity_type"]

        # Group aliases by state
        state_groups: dict[str, list[tuple]] = defaultdict(list)
        for alias_name, norm_name, source_table, row_count in item["aliases"]:
            state = assign_state_group(alias_name)
            if state is None:
                state = "GENERIC"
            state_groups[state].append((alias_name, norm_name, source_table, row_count))

        # Only split if there are actually multiple state groups
        if len(state_groups) <= 1:
            continue

        # Decide which group keeps the original entity_id (the largest one)
        sorted_groups = sorted(state_groups.items(),
                               key=lambda x: sum(a[3] for a in x[1]), reverse=True)

        keeper_state, keeper_aliases = sorted_groups[0]
        splits_to_make = sorted_groups[1:]

        correction = {
            "entity_id": entity_id,
            "original_canonical": canonical,
            "entity_type": etype,
            "keeper_state": keeper_state,
            "keeper_alias_count": len(keeper_aliases),
            "splits": [],
        }

        if not dry_run:
            # Update the keeper entity's canonical name if it's wrong
            # Pick best canonical from keeper aliases
            best_keeper = _pick_best_alias(keeper_aliases)
            if best_keeper != canonical:
                # Check for name collision before renaming
                existing = db.execute(
                    "SELECT entity_id FROM entities WHERE canonical_name = ? AND entity_id != ?",
                    (best_keeper, entity_id)
                ).fetchone()
                if not existing:
                    db.execute("UPDATE entities SET canonical_name = ? WHERE entity_id = ?",
                               (best_keeper, entity_id))
            # Update alias count
            db.execute("UPDATE entities SET alias_count = ? WHERE entity_id = ?",
                       (len(keeper_aliases), entity_id))

        for state, aliases in splits_to_make:
            new_canonical = _pick_best_alias(aliases)
            new_etype = detect_entity_type(new_canonical)

            split_info = {
                "state": state,
                "new_canonical": new_canonical,
                "alias_count": len(aliases),
                "alias_names": [a[0] for a in aliases],
            }

            if not dry_run:
                # Handle canonical name collisions
                existing = db.execute(
                    "SELECT entity_id FROM entities WHERE canonical_name = ?",
                    (new_canonical,)
                ).fetchone()
                if existing:
                    # Use the existing entity -- just reassign aliases to it
                    new_entity_id = existing[0]
                else:
                    cur = db.execute(
                        """INSERT INTO entities
                           (canonical_name, entity_type, alias_count, tables_present, created_at)
                           VALUES (?, ?, ?, ?, datetime('now'))""",
                        (new_canonical, new_etype, len(aliases),
                         ",".join(sorted(set(a[2] for a in aliases))))
                    )
                    new_entity_id = cur.lastrowid
                split_info["new_entity_id"] = new_entity_id

                # Reassign aliases to new entity
                for alias_name, norm_name, source_table, row_count in aliases:
                    db.execute(
                        "UPDATE entity_aliases SET entity_id = ? WHERE alias_name = ? AND source_table = ? AND entity_id = ?",
                        (new_entity_id, alias_name, source_table, entity_id)
                    )

                # Update source table references
                for alias_name, norm_name, source_table, row_count in aliases:
                    if source_table == "donations":
                        db.execute(
                            "UPDATE donations SET entity_id = ? WHERE donor_name = ? AND entity_id = ?",
                            (new_entity_id, alias_name, entity_id)
                        )
                    elif source_table == "contracts":
                        db.execute(
                            "UPDATE contracts SET entity_id = ? WHERE supplier_name = ? AND entity_id = ?",
                            (new_entity_id, alias_name, entity_id)
                        )
                    elif source_table == "contract_speech_links":
                        db.execute(
                            "UPDATE contract_speech_links SET entity_id = ? WHERE company_name = ? AND entity_id = ?",
                            (new_entity_id, alias_name, entity_id)
                        )

                # Recompute totals for the new entity
                _recompute_entity_totals(db, new_entity_id)

            correction["splits"].append(split_info)

        if not dry_run:
            # Recompute totals for the keeper entity
            _recompute_entity_totals(db, entity_id)

        corrections.append(correction)

    if not dry_run and corrections:
        db.commit()

    _print(f"  Split {len(corrections)} entities into state-specific entities")
    total_new = sum(len(c["splits"]) for c in corrections)
    _print(f"  Created {total_new} new state-specific entities")

    return corrections


def _pick_best_alias(aliases: list[tuple]) -> str:
    """Pick the best canonical name from a list of (alias_name, norm, src, count) tuples."""
    def _score(item):
        name = item[0]
        has_mixed = 1 if name != name.upper() and name != name.lower() else 0
        return (has_mixed, len(name), item[3])
    best = max(aliases, key=_score)
    name = best[0].strip()
    # Title-case ALL CAPS names
    if name == name.upper() and len(name) > 4:
        words = name.split()
        cleaned = []
        for w in words:
            if len(w) <= 3 and w.isalpha():
                cleaned.append(w.upper())
            else:
                cleaned.append(w.title())
        name = " ".join(cleaned)
    return name


def _recompute_entity_totals(db: sqlite3.Connection, entity_id: int) -> None:
    """Recompute total_donated and total_contracts for an entity from its aliases."""
    # Donations total
    row = db.execute("""
        SELECT COALESCE(SUM(d.amount), 0)
        FROM donations d
        WHERE d.entity_id = ?
    """, (entity_id,)).fetchone()
    total_donated = row[0] if row else 0

    # Contracts total
    row = db.execute("""
        SELECT COALESCE(SUM(c.amount), 0)
        FROM contracts c
        WHERE c.entity_id = ?
    """, (entity_id,)).fetchone()
    total_contracts = row[0] if row else 0

    # Tables present
    tables = set()
    for t, col in [("donations", "donor_name"), ("contracts", "supplier_name"),
                    ("contract_speech_links", "company_name")]:
        row = db.execute(f"SELECT 1 FROM {t} WHERE entity_id = ? LIMIT 1",
                         (entity_id,)).fetchone()
        if row:
            tables.add(t)

    # Alias count
    alias_count = db.execute(
        "SELECT COUNT(*) FROM entity_aliases WHERE entity_id = ?",
        (entity_id,)
    ).fetchone()[0]

    db.execute("""
        UPDATE entities SET
            total_donated = ?,
            total_contracts = ?,
            tables_present = ?,
            alias_count = ?
        WHERE entity_id = ?
    """, (total_donated, total_contracts, ",".join(sorted(tables)), alias_count, entity_id))


# ---------------------------------------------------------------------------
# Fix: Split name-similar but distinct entities
# ---------------------------------------------------------------------------

def split_distinct_entities(db: sqlite3.Connection,
                            suspicious: list[dict],
                            dry_run: bool = False) -> list[dict]:
    """Split entities where aliases are genuinely different entities.

    Handles:
      - Different companies (Beak Engineering vs Beaver Engineering)
      - Different individuals (Christopher Keeley vs Christopher Kennedy)

    Two splitting strategies:
      1. For entities flagged via 'different_key_words': use a high reclustering
         threshold (0.93) so similar-but-different names get separated.
      2. For entities flagged via 'low_similarity': use standard reclustering (0.80).
    """
    non_state = [s for s in suspicious
                 if s["merge_type"] in ("company_name_mismatch",
                                        "individual_name_mismatch",
                                        "other_mismatch")]

    if not non_state:
        _print("  No name-mismatch entities to fix.")
        return []

    _print(f"\n[3/4] Splitting {len(non_state)} entities with name mismatches...")

    corrections = []

    for item in non_state:
        entity_id = item["entity_id"]
        canonical = item["canonical_name"]
        aliases = item["aliases"]  # (alias_name, norm_name, source_table, row_count)

        # Choose reclustering threshold based on how the bad merge was detected.
        # For 'different_key_words' matches (e.g., Beak vs Beaver Engineering),
        # the overall string similarity is high (~0.88) so we need a very strict
        # threshold to split them. For low_similarity matches, 0.80 suffices.
        has_keyword_mismatch = any(
            p.get("reason") == "different_key_words" for p in item.get("bad_pairs", [])
        )
        recluster_threshold = 0.93 if has_keyword_mismatch else 0.80
        clusters = _recluster_aliases(aliases, threshold=recluster_threshold)

        if len(clusters) <= 1:
            # No split needed -- the bad pairs were edge cases
            continue

        # Sort clusters by total row count (largest keeps original entity_id)
        clusters.sort(key=lambda c: sum(a[3] for a in c), reverse=True)

        keeper_cluster = clusters[0]
        split_clusters = clusters[1:]

        correction = {
            "entity_id": entity_id,
            "original_canonical": canonical,
            "entity_type": item["entity_type"],
            "keeper_canonical": _pick_best_alias(keeper_cluster),
            "keeper_alias_count": len(keeper_cluster),
            "splits": [],
        }

        if not dry_run:
            # Update keeper
            new_keeper_name = _pick_best_alias(keeper_cluster)
            if new_keeper_name != canonical:
                # Check if new name already exists
                existing = db.execute(
                    "SELECT entity_id FROM entities WHERE canonical_name = ?",
                    (new_keeper_name,)
                ).fetchone()
                if existing and existing[0] != entity_id:
                    # Name conflict -- append entity_id to make unique
                    new_keeper_name = f"{new_keeper_name} [{entity_id}]"
                db.execute("UPDATE entities SET canonical_name = ? WHERE entity_id = ?",
                           (new_keeper_name, entity_id))
            db.execute("UPDATE entities SET alias_count = ? WHERE entity_id = ?",
                       (len(keeper_cluster), entity_id))

        for cluster in split_clusters:
            new_canonical = _pick_best_alias(cluster)
            new_etype = detect_entity_type(new_canonical)

            split_info = {
                "new_canonical": new_canonical,
                "alias_count": len(cluster),
                "alias_names": [a[0] for a in cluster],
            }

            if not dry_run:
                # Check for name collision
                existing = db.execute(
                    "SELECT entity_id FROM entities WHERE canonical_name = ?",
                    (new_canonical,)
                ).fetchone()
                if existing:
                    new_canonical = f"{new_canonical} [split]"

                cur = db.execute(
                    """INSERT INTO entities
                       (canonical_name, entity_type, alias_count, tables_present, created_at)
                       VALUES (?, ?, ?, ?, datetime('now'))""",
                    (new_canonical, new_etype, len(cluster),
                     ",".join(sorted(set(a[2] for a in cluster))))
                )
                new_entity_id = cur.lastrowid
                split_info["new_entity_id"] = new_entity_id

                for alias_name, norm_name, source_table, row_count in cluster:
                    db.execute(
                        "UPDATE entity_aliases SET entity_id = ? WHERE alias_name = ? AND source_table = ? AND entity_id = ?",
                        (new_entity_id, alias_name, source_table, entity_id)
                    )
                    if source_table == "donations":
                        db.execute(
                            "UPDATE donations SET entity_id = ? WHERE donor_name = ? AND entity_id = ?",
                            (new_entity_id, alias_name, entity_id)
                        )
                    elif source_table == "contracts":
                        db.execute(
                            "UPDATE contracts SET entity_id = ? WHERE supplier_name = ? AND entity_id = ?",
                            (new_entity_id, alias_name, entity_id)
                        )
                    elif source_table == "contract_speech_links":
                        db.execute(
                            "UPDATE contract_speech_links SET entity_id = ? WHERE company_name = ? AND entity_id = ?",
                            (new_entity_id, alias_name, entity_id)
                        )

                _recompute_entity_totals(db, new_entity_id)

            correction["splits"].append(split_info)

        if not dry_run:
            _recompute_entity_totals(db, entity_id)

        corrections.append(correction)

    if not dry_run and corrections:
        db.commit()

    _print(f"  Split {len(corrections)} entities with name mismatches")
    total_new = sum(len(c["splits"]) for c in corrections)
    _print(f"  Created {total_new} new entities from name-mismatch splits")

    return corrections


def _recluster_aliases(aliases: list[tuple], threshold: float = 0.80) -> list[list[tuple]]:
    """Re-cluster aliases into groups using greedy fuzzy matching.

    Each alias is (alias_name, normalized_name, source_table, row_count).
    Returns list of clusters (each cluster is a list of alias tuples).
    """
    # Sort by row_count desc so most-used name anchors each cluster
    sorted_aliases = sorted(aliases, key=lambda x: -x[3])
    clusters: list[list[tuple]] = []
    cluster_norms: list[str] = []  # representative norm for each cluster

    for alias in sorted_aliases:
        alias_name, norm_name, src, cnt = alias
        if not norm_name:
            norm_name = normalize_name(alias_name)

        best_idx = -1
        best_sim = 0.0

        for i, rep_norm in enumerate(cluster_norms):
            sim = SequenceMatcher(None, norm_name, rep_norm).ratio()
            if sim > best_sim:
                best_sim = sim
                best_idx = i

        if best_sim >= threshold and best_idx >= 0:
            clusters[best_idx].append(alias)
        else:
            clusters.append([alias])
            cluster_norms.append(norm_name)

    return clusters


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def print_report(suspicious: list[dict],
                 state_corrections: list[dict],
                 name_corrections: list[dict]) -> None:
    """Print a summary report of findings and corrections."""
    _print("\n" + "=" * 70)
    _print("ENTITY MERGE FIX REPORT")
    _print("=" * 70)

    _print(f"\nSuspicious merges found: {len(suspicious)}")
    by_type = defaultdict(int)
    for s in suspicious:
        by_type[s["merge_type"]] += 1
    for mtype, count in sorted(by_type.items()):
        _print(f"  {mtype}: {count}")

    _print(f"\nState branch splits: {len(state_corrections)}")
    total_state_new = sum(len(c["splits"]) for c in state_corrections)
    _print(f"  New state-specific entities created: {total_state_new}")

    if state_corrections:
        _print("\n  Examples of state branch corrections:")
        for corr in state_corrections[:5]:
            _print(f"    Original: {corr['original_canonical']} ({corr['entity_type']})")
            _print(f"      Keeper ({corr['keeper_state']}): {corr['keeper_alias_count']} aliases")
            for split in corr["splits"][:5]:
                _print(f"      Split -> {split['new_canonical']} ({split['state']}, {split['alias_count']} aliases)")
            if len(corr["splits"]) > 5:
                _print(f"      ... and {len(corr['splits']) - 5} more splits")

    _print(f"\nName mismatch splits: {len(name_corrections)}")
    total_name_new = sum(len(c["splits"]) for c in name_corrections)
    _print(f"  New entities created: {total_name_new}")

    if name_corrections:
        _print("\n  Examples of name mismatch corrections:")
        for corr in name_corrections[:10]:
            _print(f"    Original: {corr['original_canonical']} ({corr['entity_type']})")
            _print(f"      Keeper: {corr['keeper_canonical']} ({corr['keeper_alias_count']} aliases)")
            for split in corr["splits"]:
                aliases_str = ", ".join(split["alias_names"][:3])
                if len(split["alias_names"]) > 3:
                    aliases_str += f" +{len(split['alias_names']) - 3} more"
                _print(f"      Split -> {split['new_canonical']} (aliases: {aliases_str})")

    total_corrections = len(state_corrections) + len(name_corrections)
    total_new_entities = total_state_new + total_name_new
    _print(f"\nTOTAL: {total_corrections} entities corrected, "
           f"{total_new_entities} new entities created")
    _print("=" * 70)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Fix false merges in OPAX entity resolution")
    parser.add_argument("--dry-run", action="store_true",
                        help="Report suspicious merges without making changes")
    parser.add_argument("--similarity-threshold", type=float, default=0.7,
                        help="Flag alias pairs with similarity below this (default: 0.7)")
    args = parser.parse_args()

    db = get_db()
    db.execute("PRAGMA busy_timeout = 600000")
    db.row_factory = sqlite3.Row
    init_db(db)

    t0 = time.time()

    # Step 1: Find suspicious merges
    suspicious = find_suspicious_merges(db, similarity_threshold=args.similarity_threshold)

    if not suspicious:
        _print("\nNo suspicious merges found. Entity resolution looks clean.")
        return

    # Step 2: Split state branches
    state_corrections = split_state_branches(db, suspicious, dry_run=args.dry_run)

    # Step 3: Split name mismatches
    name_corrections = split_distinct_entities(db, suspicious, dry_run=args.dry_run)

    # Step 4: Report
    print_report(suspicious, state_corrections, name_corrections)

    elapsed = time.time() - t0
    _print(f"\nCompleted in {elapsed:.1f}s {'(DRY RUN)' if args.dry_run else ''}")


if __name__ == "__main__":
    main()
