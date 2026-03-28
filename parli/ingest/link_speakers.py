"""
parli.ingest.link_speakers -- Link speeches to members by matching speaker_name
patterns to member records.

Speaker names in the speeches table use formats like:
  - "Abbott, Tony, MP"
  - "Albanese, Anthony, MP"
  - "Wong, Penny, Senator"
  - "The Hon. Julia Gillard MP"
  - "Smith, John (Electorate Name)"
  - "Mr HUGHES"  (historical wragge_xml format)
  - "Senator PEARCE" (historical wragge_xml format)
  - "Sir WILLIAM LYNE" (historical with honorific)
  - "Dr EARLE PAGE" (historical with title)

This script normalizes these names and matches them to members.full_name.
For historical (wragge_xml) speakers where only a surname is available,
it builds a separate last-name-only lookup from historical member data
seeded by extract_wragge_speakers().

Usage:
    python -m parli.ingest.link_speakers
"""

import logging
import re
from collections import Counter, defaultdict

from parli.schema import get_db, init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# Suffixes and titles to strip
STRIP_SUFFIXES = re.compile(
    r",?\s*\b(MP|Senator|The Hon\.?|Hon\.?|Dr\.?|Mr\.?|Mrs\.?|Ms\.?|QC|AC|AO|AM|"
    r"SC|OAM|KBE|CBE|OBE|MBE|KC|CH|GCB|GCMG|PC|Sir|Dame)\b\.?",
    re.IGNORECASE,
)

# Parenthesised electorate or role info
PAREN_RE = re.compile(r"\s*\([^)]*\)\s*")

# Extra whitespace
MULTI_SPACE = re.compile(r"\s+")

# Procedural / non-person speaker names to skip entirely
PROCEDURAL_NAMES = {
    "speaker", "the speaker", "mr speaker", "deputy speaker",
    "the deputy speaker", "president", "the president",
    "chairman", "the chairman", "deputy chairman",
    "the deputy chairman", "temporary chairman",
    "the temporary chairman", "acting deputy president",
    "the acting deputy president", "deputy president",
    "the deputy president", "the clerk",
    "stage direction", "business start",
    "honourable members", "government members",
    "opposition members",
    "chair", "mr deputy speaker", "madam deputy speaker",
    "madam speaker", "mr chairman", "madam chairman",
    "the chair", "madam president", "mr president",
    "madam deputy president", "the temporary chair",
    "acting deputy speaker",
}


def is_procedural(raw: str) -> bool:
    """Return True if the speaker_name is a procedural/role entry, not a person."""
    if not raw:
        return True
    cleaned = raw.strip().lower()
    # Exact match
    if cleaned in PROCEDURAL_NAMES:
        return True
    # Patterns like "SPEAKER, The" or "DEPUTY SPEAKER, Mr"
    if any(cleaned.startswith(p) or cleaned.endswith(p) for p in
           ["speaker", "president", "chairman", "chair", "clerk"]):
        # But not if it contains a real surname (e.g. "Speaker Morrison" is unlikely)
        words = cleaned.replace(",", " ").split()
        role_words = {"speaker", "deputy", "the", "mr", "mrs", "ms", "dr",
                      "president", "chairman", "chair", "acting", "temporary",
                      "clerk", "madam"}
        non_role = [w for w in words if w not in role_words]
        if not non_role:
            return True
    return False


def normalize_speaker_name(raw: str) -> str | None:
    """Parse a speaker_name and return 'First Last' form, or None if unparseable."""
    if not raw or not raw.strip():
        return None

    name = raw.strip()

    # Strip parenthesised content (electorate info etc.)
    name = PAREN_RE.sub(" ", name)

    # Handle comma-separated format BEFORE stripping titles/suffixes,
    # because the suffix regex eats commas. Formats:
    #   "Kemp, Dr David, MP" -> last="Kemp", rest="Dr David, MP"
    #   "Abbott, Tony, MP" -> last="Abbott", rest="Tony, MP"
    #   "Williams, Daryl, MP" -> last="Williams", rest="Daryl, MP"
    if "," in name:
        parts = [p.strip() for p in name.split(",")]
        # Filter out suffixes/titles from the parts
        last_name = parts[0].strip()
        # Remaining parts after the first comma are first name + suffixes
        rest_parts = " ".join(parts[1:])
        # Now strip titles and suffixes from both
        last_name = STRIP_SUFFIXES.sub(" ", last_name)
        last_name = MULTI_SPACE.sub(" ", last_name).strip().strip(",").strip()
        rest_parts = STRIP_SUFFIXES.sub(" ", rest_parts)
        rest_parts = MULTI_SPACE.sub(" ", rest_parts).strip().strip(",").strip()

        if last_name and rest_parts:
            # Take first real word from rest as first name
            first_words = rest_parts.split()
            first_name = first_words[0] if first_words else rest_parts
            name = f"{first_name} {last_name}"
        elif last_name:
            name = last_name
        else:
            name = rest_parts or ""
    else:
        # No comma: strip titles and suffixes directly
        name = STRIP_SUFFIXES.sub(" ", name)

    # Clean up
    name = MULTI_SPACE.sub(" ", name).strip()
    name = name.strip(",").strip()

    if not name:
        return None

    # Final cleanup
    name = MULTI_SPACE.sub(" ", name).strip()

    # Must have at least 2 parts (first + last)
    if len(name.split()) < 2:
        return None

    return name


def extract_surname(raw: str) -> str | None:
    """Extract just the surname from historical speaker formats.

    Handles: "Mr HUGHES", "Senator PEARCE", "Sir WILLIAM LYNE",
    "Dr EARLE PAGE", "JOSEPH COOK"
    Returns the surname (last word), title-cased.
    """
    if not raw or not raw.strip():
        return None
    name = raw.strip()
    # Remove titles
    name = STRIP_SUFFIXES.sub(" ", name)
    name = MULTI_SPACE.sub(" ", name).strip()
    if not name:
        return None
    parts = name.split()
    if not parts:
        return None
    # The surname is the last word
    surname = parts[-1].strip().title()
    if len(surname) < 2:
        return None
    return surname


def build_member_lookup(db) -> tuple[dict, dict]:
    """Build lookup dictionaries for member matching.

    Returns:
      - full_lookup: normalized_name_lower -> person_id (first+last, last+first, full_name)
      - surname_lookup: surname_lower -> list of (person_id, first_name, last_name, chamber)
        (for historical last-name-only matching)
    """
    members = db.execute(
        "SELECT person_id, first_name, last_name, full_name, chamber FROM members "
        "WHERE full_name IS NOT NULL AND full_name != ''"
    ).fetchall()

    full_lookup = {}
    surname_lookup = defaultdict(list)

    for m in members:
        pid = m["person_id"]
        first = (m["first_name"] or "").strip()
        last = (m["last_name"] or "").strip()
        full = (m["full_name"] or "").strip()
        chamber = (m["chamber"] or "").strip()

        # Add full_name
        if full:
            full_lookup[full.lower()] = pid

        # Add "First Last"
        if first and last:
            full_lookup[f"{first} {last}".lower()] = pid
            # Also "Last First" variant
            full_lookup[f"{last} {first}".lower()] = pid

        # Build surname lookup for historical matching
        if last:
            surname_lookup[last.lower()].append({
                "person_id": pid,
                "first_name": first,
                "last_name": last,
                "chamber": chamber,
            })

    log.info("Built member lookup with %d name variants for %d members, "
             "%d unique surnames",
             len(full_lookup), len(members), len(surname_lookup))
    return full_lookup, dict(surname_lookup)


# Common Australian nickname -> formal name mappings
NICKNAME_MAP = {
    "chris": ["christopher"],
    "christopher": ["chris"],
    "mike": ["michael"],
    "michael": ["mike"],
    "dave": ["david"],
    "david": ["dave"],
    "bob": ["robert"],
    "robert": ["bob", "robbie"],
    "bill": ["william"],
    "william": ["bill", "will"],
    "jim": ["james"],
    "james": ["jim", "jimmy"],
    "tony": ["anthony"],
    "anthony": ["tony"],
    "tom": ["thomas"],
    "thomas": ["tom"],
    "dick": ["richard"],
    "richard": ["dick", "rick"],
    "rick": ["richard"],
    "joe": ["joseph"],
    "joseph": ["joe"],
    "steve": ["stephen", "steven"],
    "stephen": ["steve"],
    "steven": ["steve"],
    "ed": ["edward", "edmund"],
    "edward": ["ed", "ted"],
    "ted": ["edward"],
    "nick": ["nicholas"],
    "nicholas": ["nick"],
    "matt": ["matthew"],
    "matthew": ["matt"],
    "larry": ["lawrence", "laurence"],
    "lawrence": ["larry"],
    "laurence": ["larry"],
    "pete": ["peter"],
    "peter": ["pete"],
    "al": ["alan", "albert", "alexander"],
    "alan": ["al"],
    "alex": ["alexander"],
    "alexander": ["alex"],
    "andy": ["andrew"],
    "andrew": ["andy"],
    "phil": ["philip", "phillip"],
    "philip": ["phil"],
    "phillip": ["phil"],
    "greg": ["gregory"],
    "gregory": ["greg"],
    "geoff": ["geoffrey"],
    "geoffrey": ["geoff"],
    "bernie": ["bernard"],
    "bernard": ["bernie"],
    "daryl": ["darryl"],
    "darryl": ["daryl"],
    "jan": ["janice", "janet"],
    "janice": ["jan"],
    "sue": ["susan", "suzanne"],
    "susan": ["sue"],
    "kate": ["katherine", "catherine"],
    "katherine": ["kate", "kathy"],
    "catherine": ["kate", "cathy"],
    "liz": ["elizabeth"],
    "elizabeth": ["liz", "beth"],
    "jenny": ["jennifer"],
    "jennifer": ["jenny"],
    "frank": ["francis"],
    "francis": ["frank"],
    "garry": ["gary"],
    "gary": ["garry"],
}


def _is_real_pid(pid: str) -> bool:
    """Return True if person_id looks like a real TVFY/OpenAustralia ID (numeric)."""
    return pid.isdigit()


def _prefer_real_candidates(candidates: list[dict]) -> list[dict]:
    """If there are both real (numeric) and synthetic (wragge_/state_) person_ids,
    prefer the real ones. This handles cases where seed_wragge_members created
    a duplicate record for someone who already exists in the members table.

    When all candidates are synthetic and share the same surname, they are
    likely duplicate records for the same person -- prefer the one with a
    first_name (more specific record).
    """
    real = [c for c in candidates if _is_real_pid(c["person_id"])]
    if real:
        return real

    # If all synthetic and same surname, try to pick the most specific one
    if len(candidates) > 1:
        surnames = set(c["last_name"].lower() for c in candidates)
        if len(surnames) == 1:
            # Same surname -- prefer candidates with a real first_name
            # (not empty, not just a title prefix like "Sir")
            with_first = [c for c in candidates
                          if c["first_name"]
                          and not c["first_name"].lower().startswith("sir")
                          and c["first_name"].lower() not in ("", "the")]
            if len(with_first) == 1:
                return with_first
            # If multiple have first names, they might be different people
            # (or duplicate records) -- fall through

    return candidates


def match_historical_surname(
    speaker_name: str,
    surname: str,
    surname_lookup: dict,
) -> str | None:
    """Try to match a historical speaker by surname alone.

    If the surname is unique in the members table, return the person_id.
    If ambiguous, use the title/prefix to disambiguate (Senator -> senate).
    Prefers real (numeric) person_ids over synthetic wragge_ ones.
    """
    candidates = surname_lookup.get(surname.lower(), [])
    if not candidates:
        return None

    if len(candidates) == 1:
        return candidates[0]["person_id"]

    # Disambiguate by chamber based on title prefix, THEN prefer real IDs
    raw_lower = speaker_name.lower()
    if "senator" in raw_lower:
        chamber_candidates = [c for c in candidates if c["chamber"] == "senate"]
        chamber_candidates = _prefer_real_candidates(chamber_candidates)
        if len(chamber_candidates) == 1:
            return chamber_candidates[0]["person_id"]
        if not chamber_candidates:
            # No senate members -- fall through to global preference
            pass
        else:
            return None  # Multiple senate candidates, ambiguous
    elif any(t in raw_lower for t in ["mr ", "mrs ", "ms ", "dr ", "sir ", "dame "]):
        chamber_candidates = [c for c in candidates if c["chamber"] == "representatives"]
        chamber_candidates = _prefer_real_candidates(chamber_candidates)
        if len(chamber_candidates) == 1:
            return chamber_candidates[0]["person_id"]
        if not chamber_candidates:
            pass
        else:
            return None  # Multiple reps candidates, ambiguous

    # Try global preference as fallback
    preferred = _prefer_real_candidates(candidates)
    if len(preferred) == 1:
        return preferred[0]["person_id"]

    # Still ambiguous -- skip to avoid wrong attribution
    return None


def seed_zenodo_members(db) -> int:
    """Create or update member records for zenodo speakers with full names.

    Zenodo data uses "Surname, First, MP" format which gives us both first
    and last names. If a wragge_ stub exists for the surname, update it with
    the first name. Otherwise create a new member record.

    Returns count of members created or updated.
    """
    rows = db.execute("""
        SELECT speaker_name, COUNT(*) as cnt FROM speeches
        WHERE source = 'zenodo' AND person_id IS NULL
          AND speaker_name IS NOT NULL AND speaker_name != ''
          AND speaker_name LIKE '%,%'
        GROUP BY speaker_name
        HAVING COUNT(*) >= 5
        ORDER BY cnt DESC
    """).fetchall()

    existing_names = set()
    for r in db.execute("SELECT LOWER(full_name) FROM members WHERE full_name IS NOT NULL"):
        existing_names.add(r[0])

    updated = 0
    inserted = 0

    for row in rows:
        raw = row["speaker_name"]
        if is_procedural(raw):
            continue

        normalized = normalize_speaker_name(raw)
        if not normalized:
            continue

        parts = normalized.split()
        if len(parts) < 2:
            continue

        first_name = parts[0]
        last_name = " ".join(parts[1:])
        full_name = normalized

        if full_name.lower() in existing_names:
            continue

        # Infer chamber from suffix
        raw_lower = raw.lower()
        chamber = "senate" if "senator" in raw_lower else "representatives"

        # Check if there's a wragge_ stub for this surname + chamber
        wragge_stub = db.execute(
            """SELECT person_id, first_name, full_name FROM members
               WHERE person_id LIKE 'wragge_%'
                 AND last_name = ? AND chamber = ?
                 AND (first_name IS NULL OR first_name = '')""",
            (last_name, chamber),
        ).fetchone()

        if wragge_stub:
            # Update the stub with the full name
            db.execute(
                """UPDATE members SET first_name = ?, full_name = ?
                   WHERE person_id = ?""",
                (first_name, full_name, wragge_stub["person_id"]),
            )
            existing_names.add(full_name.lower())
            updated += 1
        else:
            # Create a new member record
            safe_name = full_name.lower().replace(" ", "_").replace("'", "")
            safe_name = re.sub(r'[^a-z0-9_]', '', safe_name)
            pid = f"zenodo_{safe_name}"

            # Check for collision
            existing_pid = db.execute(
                "SELECT person_id FROM members WHERE person_id = ?", (pid,),
            ).fetchone()
            if existing_pid:
                continue

            db.execute(
                """INSERT OR IGNORE INTO members
                   (person_id, first_name, last_name, full_name, chamber)
                   VALUES (?, ?, ?, ?, ?)""",
                (pid, first_name, last_name, full_name, chamber),
            )
            existing_names.add(full_name.lower())
            inserted += 1

    db.commit()
    log.info("Zenodo members: updated %d wragge stubs, inserted %d new members",
             updated, inserted)
    return updated + inserted


def seed_wragge_members(db) -> int:
    """Extract unique historical speakers from wragge_xml and seed them as members.

    Creates member records for speakers who appear frequently in wragge_xml
    but aren't in the members table. Uses the speaker_name patterns
    to infer first/last names and chamber.

    Returns count of new members inserted.
    """
    rows = db.execute("""
        SELECT speaker_name, COUNT(*) as cnt FROM speeches
        WHERE source = 'wragge_xml' AND person_id IS NULL
          AND speaker_name IS NOT NULL AND speaker_name != ''
        GROUP BY speaker_name
        HAVING COUNT(*) >= 10
        ORDER BY cnt DESC
    """).fetchall()

    existing_names = set()
    for r in db.execute("SELECT LOWER(full_name) FROM members WHERE full_name IS NOT NULL"):
        existing_names.add(r[0])

    inserted = 0
    for row in rows:
        raw = row["speaker_name"]
        if is_procedural(raw):
            continue

        normalized = normalize_speaker_name(raw)
        if not normalized:
            # Try extracting just surname for single-name entries
            surname = extract_surname(raw)
            if not surname:
                continue
            # Only insert if we have at least a first+last from the raw name
            name = raw.strip()
            name = STRIP_SUFFIXES.sub(" ", name)
            name = MULTI_SPACE.sub(" ", name).strip()
            parts = name.split()
            if len(parts) < 2:
                # Single surname only -- still useful for lookup but
                # create a minimal record
                full_name = surname
                first_name = ""
                last_name = surname
            else:
                # Multiple words: first words are given names, last is surname
                first_name = " ".join(parts[:-1]).title()
                last_name = parts[-1].title()
                full_name = f"{first_name} {last_name}"
        else:
            parts = normalized.split()
            first_name = parts[0]
            last_name = " ".join(parts[1:])
            full_name = normalized

        if full_name.lower() in existing_names:
            continue

        # Infer chamber from title
        raw_lower = raw.lower()
        chamber = "senate" if "senator" in raw_lower else "representatives"

        pid = f"wragge_{full_name.lower().replace(' ', '_')}"

        db.execute(
            """INSERT OR IGNORE INTO members
               (person_id, first_name, last_name, full_name, chamber)
               VALUES (?, ?, ?, ?, ?)""",
            (pid, first_name, last_name, full_name, chamber),
        )
        existing_names.add(full_name.lower())
        inserted += 1

    db.commit()
    log.info("Seeded %d historical members from wragge_xml speakers", inserted)
    return inserted


def normalize_state_speaker_name(raw: str, state: str) -> str | None:
    """Parse a state parliament speaker_name and return 'First Last' form.

    Handles state-specific formats:
      - VIC: "Jacinta Allan", "Cindy McLEISH" (mixed case, already first-last)
      - NSW: "Mr DAVID SHOEBRIDGE", "The Hon. ADAM SEARLE" (titled, uppercase)
      - QLD: "Mrs FRECKLINGTON", "Mr BLEIJIE" (title + surname only)
      - SA:  "Mr MALINAUSKAS", "The Hon. R.I. LUCAS" (initials + surname)
    """
    if not raw or not raw.strip():
        return None

    name = raw.strip()

    # Strip parenthesised content
    name = PAREN_RE.sub(" ", name)

    # Strip titles and suffixes
    name = STRIP_SUFFIXES.sub(" ", name)

    # Also strip "Reverend", "Professor" etc. not in the main regex
    name = re.sub(r'\b(Reverend|Professor|Adj Prof|Prof)\b\.?', ' ', name, flags=re.IGNORECASE)

    # Clean up
    name = MULTI_SPACE.sub(" ", name).strip()
    name = name.strip(",").strip()

    if not name:
        return None

    # Handle "Last, First" format
    if "," in name:
        parts = [p.strip() for p in name.split(",", 1)]
        if len(parts) == 2 and parts[0] and parts[1]:
            first_parts = parts[1].split()
            first_name = first_parts[0] if first_parts else parts[1]
            last_name = parts[0]
            name = f"{first_name} {last_name}"
        else:
            name = parts[0]

    name = MULTI_SPACE.sub(" ", name).strip()

    # Normalize case: title-case but preserve internal capitals (McLeish, O'Brien)
    parts = name.split()
    normalized_parts = []
    for part in parts:
        # Skip initials like "R.I." for SA
        if re.match(r'^[A-Z]\.[A-Z]\.?$', part):
            continue
        if re.match(r'^[A-Z]\.?$', part):
            continue
        # Preserve names that have internal caps (McDonald, McLEISH -> McLeish)
        if part.isupper() and len(part) > 1:
            part = part.title()
        normalized_parts.append(part)

    if not normalized_parts:
        return None

    name = " ".join(normalized_parts)

    return name if name else None


def extract_electorate_clean(raw_electorate: str) -> str:
    """Clean electorate field: strip ministerial titles, timestamps, etc."""
    if not raw_electorate:
        return ""
    # VIC electorates may have " – Minister for ..." appended
    electorate = raw_electorate.split("–")[0].split("—")[0].strip()
    # Remove timestamps like "09:34"
    if re.match(r'^\d{1,2}:\d{2}$', electorate):
        return ""
    # QLD sometimes has speaker names in electorate field (data bug)
    if re.match(r'^(Mr|Mrs|Ms|Dr|Miss)\s+', electorate):
        return ""
    return electorate.strip()


def seed_state_members(db) -> int:
    """Extract unique state parliament speakers from speeches and seed them as members.

    Creates member records for state speakers who have at least 2 speeches
    and are not procedural names.

    Returns count of new members inserted.
    """
    log.info("=== Seeding state parliament members ===")

    # Get all distinct state speakers with metadata
    rows = db.execute("""
        SELECT speaker_name, state, chamber, electorate, party,
               COUNT(*) as cnt
        FROM speeches
        WHERE (person_id IS NULL OR person_id = '')
          AND speaker_name IS NOT NULL AND speaker_name != ''
          AND state IS NOT NULL AND state != 'federal'
        GROUP BY speaker_name, state, chamber
        HAVING COUNT(*) >= 2
        ORDER BY cnt DESC
    """).fetchall()

    # Load existing member names to avoid duplicates
    existing = set()
    for r in db.execute(
        "SELECT LOWER(full_name), state FROM members WHERE full_name IS NOT NULL"
    ):
        existing.add((r[0], r[1] if r[1] else 'federal'))

    # Also build person_id set
    existing_pids = set()
    for r in db.execute("SELECT person_id FROM members"):
        existing_pids.add(r[0])

    inserted = 0
    skipped_procedural = 0
    skipped_single_name = 0

    for row in rows:
        raw_name = row["speaker_name"]
        state = row["state"]
        chamber = row["chamber"]
        raw_electorate = row["electorate"] or ""
        party = row["party"] or ""

        if is_procedural(raw_name):
            skipped_procedural += 1
            continue

        normalized = normalize_state_speaker_name(raw_name, state)
        if not normalized:
            continue

        parts = normalized.split()

        if len(parts) < 2:
            # Single name only (e.g. QLD "Frecklington") -- still useful
            # Try to create a record with surname only
            surname = parts[0].title()
            full_name = surname
            first_name = ""
            last_name = surname
            skipped_single_name += 1
            # For surname-only, we need to be careful about uniqueness
            # within the same state -- skip if ambiguous
        else:
            first_name = parts[0]
            last_name = " ".join(parts[1:])
            full_name = normalized

        # Clean electorate
        electorate = extract_electorate_clean(raw_electorate)

        # Check for existing
        key = (full_name.lower(), state)
        if key in existing:
            continue

        # Generate person_id
        safe_name = full_name.lower().replace(" ", "_").replace("'", "")
        safe_name = re.sub(r'[^a-z0-9_]', '', safe_name)
        pid = f"{state}_{safe_name}"

        # Handle collision
        if pid in existing_pids:
            # Same person_id already exists; skip
            continue

        try:
            db.execute(
                """INSERT OR IGNORE INTO members
                   (person_id, first_name, last_name, full_name,
                    party, electorate, chamber, state)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (pid, first_name, last_name, full_name,
                 party, electorate, chamber, state),
            )
            existing.add(key)
            existing_pids.add(pid)
            inserted += 1
        except sqlite3.IntegrityError:
            pass

    db.commit()
    log.info("Seeded %d state members (%d procedural skipped, %d surname-only)",
             inserted, skipped_procedural, skipped_single_name)
    return inserted


def build_state_member_lookup(db) -> dict:
    """Build lookup for state members: (normalized_name_lower, state) -> person_id.

    Also builds surname-only lookups for QLD/SA where only surnames appear.
    Returns a dict with:
      - 'full': {(name_lower, state): person_id}
      - 'surname': {(surname_lower, state): list of person_ids}
    """
    members = db.execute(
        "SELECT person_id, first_name, last_name, full_name, state, chamber "
        "FROM members WHERE state IS NOT NULL AND state != 'federal' "
        "AND full_name IS NOT NULL AND full_name != ''"
    ).fetchall()

    full_lookup = {}
    surname_lookup = defaultdict(list)

    for m in members:
        pid = m["person_id"]
        first = (m["first_name"] or "").strip()
        last = (m["last_name"] or "").strip()
        full = (m["full_name"] or "").strip()
        state = m["state"]

        if full:
            full_lookup[(full.lower(), state)] = pid
        if first and last:
            full_lookup[(f"{first} {last}".lower(), state)] = pid
            full_lookup[(f"{last} {first}".lower(), state)] = pid
        if last:
            surname_lookup[(last.lower(), state)].append(pid)

    log.info("Built state member lookup: %d name variants, %d surname entries",
             len(full_lookup), len(surname_lookup))
    return {"full": full_lookup, "surname": dict(surname_lookup)}


def extract_garbled_name(raw: str) -> str | None:
    """Try to extract a real name from garbled/truncated NSW speaker_name text.

    NSW API sometimes returns truncated names like:
      "he Hon. WALT SECORD"  (missing leading "T")
      "on. BRONNIE TAYLOR"   (missing leading "The H")
      "COTT FARLOW"          (missing "S" from "SCOTT FARLOW")
      "verend the Hon. FRED NILE"  (missing "Re")

    Strategy: find sequences of UPPERCASE words that look like names
    (2+ uppercase words at end of string, or after a period/space).
    """
    if not raw or not raw.strip():
        return None

    # Look for patterns of UPPERCASE WORDS (first + last name)
    # Match things like "WALT SECORD", "FRED NILE", "ADAM SEARLE"
    match = re.search(r'\b([A-Z][A-Z]+(?:\s+[A-Z][A-Z\']+)+)\b', raw)
    if match:
        name_part = match.group(1).strip()
        # Must have at least 2 words and look like a name
        parts = name_part.split()
        if len(parts) >= 2:
            # Title-case it
            return " ".join(p.title() for p in parts)

    # Also try: extract from patterns like ". ADAM SEARLE" or "HonDANIEL MOOKHEY"
    match = re.search(r'[.\s]?\s*([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*$', raw)
    if match:
        return match.group(1).strip()

    return None


def link_state_speakers(db) -> int:
    """Link state parliament speeches to member records.

    Returns count of speeches updated.
    """
    log.info("=== Linking state parliament speakers ===")

    lookup = build_state_member_lookup(db)
    full_lookup = lookup["full"]
    surname_lookup = lookup["surname"]

    if not full_lookup and not surname_lookup:
        log.warning("No state members found. Run seed_state_members first.")
        return 0

    # Get distinct state speaker names that are unlinked
    speaker_rows = db.execute("""
        SELECT DISTINCT speaker_name, state, COUNT(*) as cnt
        FROM speeches
        WHERE (person_id IS NULL OR person_id = '')
          AND speaker_name IS NOT NULL AND speaker_name != ''
          AND state IS NOT NULL AND state != 'federal'
        GROUP BY speaker_name, state
        ORDER BY cnt DESC
    """).fetchall()

    matched = {}  # (speaker_name, state) -> person_id
    unmatched_state = Counter()

    for row in speaker_rows:
        speaker_name = row["speaker_name"]
        state = row["state"]
        count = row["cnt"]

        if is_procedural(speaker_name):
            continue

        normalized = normalize_state_speaker_name(speaker_name, state)

        pid = None

        # Try full name match
        if normalized:
            pid = full_lookup.get((normalized.lower(), state))

            if not pid:
                # Try first+last only (skip middle names)
                parts = normalized.split()
                if len(parts) > 2:
                    short = f"{parts[0]} {parts[-1]}"
                    pid = full_lookup.get((short.lower(), state))

        # Try surname-only match for QLD/SA style names
        if not pid and normalized:
            parts = normalized.split()
            if len(parts) == 1:
                # Single surname
                surname = parts[0].lower()
                candidates = surname_lookup.get((surname, state), [])
                if len(candidates) == 1:
                    pid = candidates[0]

        # Fallback: try to extract a name from garbled/truncated text (NSW)
        if not pid and state == "nsw":
            extracted = extract_garbled_name(speaker_name)
            if extracted:
                pid = full_lookup.get((extracted.lower(), state))
                if not pid:
                    # Try first+last only
                    parts = extracted.split()
                    if len(parts) > 2:
                        short = f"{parts[0]} {parts[-1]}"
                        pid = full_lookup.get((short.lower(), state))
                if pid:
                    log.debug("Garbled name recovery: %r -> %r -> %s",
                              speaker_name, extracted, pid)

        # Fallback: for any state, try fuzzy surname match from the
        # normalized or raw name -- extract the last uppercase word
        if not pid and not normalized:
            # Try to get at least a surname from the raw name
            words = re.findall(r'\b[A-Z][A-Za-z\']+\b', speaker_name)
            if words:
                # The last substantial word is likely the surname
                surname_candidates = [w for w in words
                                      if w.lower() not in {
                                          "the", "hon", "mr", "mrs", "ms",
                                          "dr", "sir", "dame", "reverend",
                                          "professor",
                                      }]
                if surname_candidates:
                    surname = surname_candidates[-1].lower()
                    # Title-case for lookup
                    candidates = surname_lookup.get((surname, state), [])
                    if len(candidates) == 1:
                        pid = candidates[0]

        if pid:
            matched[(speaker_name, state)] = pid
        else:
            unmatched_state[f"[{state}] {speaker_name}"] += count

    log.info("Matched %d state speaker-name/state pairs, %d unmatched",
             len(matched), len(unmatched_state))

    # Update speeches using a temp table for efficient batch update
    total_updated = 0
    db.execute("CREATE TEMP TABLE IF NOT EXISTS _speaker_map (speaker_name TEXT, state TEXT, person_id TEXT)")
    db.execute("DELETE FROM _speaker_map")
    for (speaker_name, state), person_id in matched.items():
        db.execute("INSERT INTO _speaker_map VALUES (?, ?, ?)",
                   (speaker_name, state, person_id))
    db.commit()

    log.info("Updating state speeches via batch join (%d mappings)...", len(matched))
    db.execute("""
        UPDATE speeches SET person_id = (
            SELECT m.person_id FROM _speaker_map m
            WHERE m.speaker_name = speeches.speaker_name
              AND m.state = speeches.state
        )
        WHERE (person_id IS NULL OR person_id = '')
          AND state IS NOT NULL AND state != 'federal'
          AND speaker_name IN (SELECT speaker_name FROM _speaker_map)
    """)
    total_updated = db.execute("SELECT changes()").fetchone()[0]
    db.commit()
    db.execute("DROP TABLE IF EXISTS _speaker_map")

    log.info("Updated %d state speeches with person_id", total_updated)

    # Report top unmatched
    top_unmatched = unmatched_state.most_common(20)
    if top_unmatched:
        log.info("Top unmatched state speakers:")
        for name, count in top_unmatched:
            log.info("  %5d | %s", count, name)

    return total_updated


def _build_member_date_ranges(db) -> dict:
    """Build approximate date ranges for members from their already-linked speeches.

    Returns: {person_id: (min_date, max_date)} from speeches that already have
    person_id set. Used to disambiguate surname-only matches by date.
    """
    rows = db.execute("""
        SELECT person_id, MIN(date) as min_date, MAX(date) as max_date
        FROM speeches
        WHERE person_id IS NOT NULL AND date IS NOT NULL AND date != ''
        GROUP BY person_id
    """).fetchall()
    result = {}
    for r in rows:
        result[r["person_id"]] = (r["min_date"], r["max_date"])
    return result


def match_surname_with_date(
    speaker_name: str,
    surname: str,
    surname_lookup: dict,
    speech_date: str | None,
    member_date_ranges: dict,
) -> str | None:
    """Match a surname-only speaker using both chamber prefix and date overlap.

    For ambiguous surnames (multiple members with same surname + chamber),
    checks which member's known date range overlaps the speech date.
    Prefers real (numeric) person_ids over synthetic wragge_ ones.
    """
    candidates = surname_lookup.get(surname.lower(), [])
    if not candidates:
        return None

    # Filter by chamber from prefix
    raw_lower = speaker_name.lower()
    if "senator" in raw_lower:
        candidates = [c for c in candidates if c["chamber"] == "senate"]
    elif any(t in raw_lower for t in ["mr ", "mrs ", "ms ", "dr ", "sir ", "dame "]):
        candidates = [c for c in candidates if c["chamber"] == "representatives"]

    if not candidates:
        return None

    # Prefer real person_ids
    candidates = _prefer_real_candidates(candidates)
    if len(candidates) == 1:
        return candidates[0]["person_id"]

    # Date-based disambiguation: find candidates whose date range overlaps
    if speech_date and member_date_ranges:
        date_matches = []
        for c in candidates:
            pid = c["person_id"]
            dr = member_date_ranges.get(pid)
            if dr:
                min_d, max_d = dr
                # Allow some margin (1 year) around the range
                if min_d and max_d and min_d <= speech_date <= max_d:
                    date_matches.append(c)
        if len(date_matches) == 1:
            return date_matches[0]["person_id"]
        # If still multiple, prefer real IDs among date matches
        if len(date_matches) > 1:
            real = [c for c in date_matches if _is_real_pid(c["person_id"])]
            if len(real) == 1:
                return real[0]["person_id"]

    return None


def link_ambiguous_by_date(db, surname_lookup: dict) -> int:
    """Second-pass linking for speaker_names that are ambiguous by surname alone.

    For speeches still unlinked after the first pass, tries date-aware matching:
    each speech is individually matched based on its date vs member date ranges.

    Returns count of speeches updated.
    """
    log.info("=== Date-aware linking pass for ambiguous surnames ===")

    member_date_ranges = _build_member_date_ranges(db)
    log.info("Built date ranges for %d members from existing linked speeches",
             len(member_date_ranges))

    # Find speaker_names that are still unlinked and look like surname-only
    speaker_rows = db.execute("""
        SELECT DISTINCT speaker_name, COUNT(*) as cnt
        FROM speeches
        WHERE person_id IS NULL
          AND speaker_name IS NOT NULL AND speaker_name != ''
          AND (state IS NULL OR state = '' OR state = 'federal')
        GROUP BY speaker_name
        HAVING COUNT(*) >= 5
        ORDER BY cnt DESC
    """).fetchall()

    total_updated = 0
    matched_by_date = 0

    for row in speaker_rows:
        speaker_name = row["speaker_name"]
        if is_procedural(speaker_name):
            continue

        surname = extract_surname(speaker_name)
        if not surname:
            continue

        # Only bother with this pass if the basic matcher would have been ambiguous
        candidates = surname_lookup.get(surname.lower(), [])
        if len(candidates) <= 1:
            continue  # Already handled by basic pass (or no match)

        # Get all unlinked speeches for this speaker with dates
        speeches = db.execute("""
            SELECT speech_id, date FROM speeches
            WHERE speaker_name = ? AND person_id IS NULL
              AND (state IS NULL OR state = '' OR state = 'federal')
              AND date IS NOT NULL AND date != ''
        """, (speaker_name,)).fetchall()

        if not speeches:
            continue

        # Try to match each speech by date
        updates = []  # (person_id, speech_id)
        for s in speeches:
            pid = match_surname_with_date(
                speaker_name, surname, surname_lookup,
                s["date"], member_date_ranges,
            )
            if pid:
                updates.append((pid, s["speech_id"]))

        if updates:
            # Batch update
            db.executemany(
                "UPDATE speeches SET person_id = ? WHERE speech_id = ?",
                updates,
            )
            total_updated += len(updates)
            matched_by_date += 1

    db.commit()
    log.info("Date-aware pass: matched %d speaker names, updated %d speeches",
             matched_by_date, total_updated)
    return total_updated


def normalize_financial_years(db) -> int:
    """Normalize financial_year format in donations table.

    Converts:
      - "1998-1999" -> "1998-99"
      - "2000-2001" -> "2000-01"
    Marks election/referendum/by-election donations with donation_type:
      - "2022 Federal election" -> donation_type='election'
      - "2023 Referendum" -> donation_type='referendum'
      - "Braddon by-election" -> donation_type='by-election'

    Returns count of rows updated.
    """
    log.info("=== Normalizing financial_year formats in donations ===")

    total_updated = 0

    # 1. Convert "YYYY-YYYY" format to "YYYY-YY"
    long_years = db.execute("""
        SELECT DISTINCT financial_year FROM donations
        WHERE financial_year LIKE '____-____'
          AND LENGTH(financial_year) = 9
          AND financial_year GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]'
    """).fetchall()

    for row in long_years:
        fy = row["financial_year"]
        # "1998-1999" -> "1998-99"
        short = fy[:5] + fy[7:]
        count = db.execute(
            "UPDATE donations SET financial_year = ? WHERE financial_year = ?",
            (short, fy),
        ).rowcount
        total_updated += count
        log.info("  Renamed %r -> %r (%d rows)", fy, short, count)

    # 2. Tag by-election donations (before general elections, since
    #    '%election%' would also match 'by-election')
    byelection_years = db.execute("""
        SELECT DISTINCT financial_year FROM donations
        WHERE financial_year LIKE '%by-election%'
           OR financial_year LIKE '%by election%'
    """).fetchall()

    for row in byelection_years:
        fy = row["financial_year"]
        count = db.execute(
            "UPDATE donations SET donation_type = 'by-election' "
            "WHERE financial_year = ? AND (donation_type IS NULL OR donation_type = 'direct')",
            (fy,),
        ).rowcount
        total_updated += count
        if count:
            log.info("  Tagged %r as by-election (%d rows)", fy, count)

    # 3. Tag general election donations (excluding by-elections already tagged)
    election_years = db.execute("""
        SELECT DISTINCT financial_year FROM donations
        WHERE (financial_year LIKE '%election%'
           OR financial_year LIKE '%Election%')
          AND financial_year NOT LIKE '%by-election%'
          AND financial_year NOT LIKE '%by election%'
    """).fetchall()

    for row in election_years:
        fy = row["financial_year"]
        count = db.execute(
            "UPDATE donations SET donation_type = 'election' "
            "WHERE financial_year = ? AND (donation_type IS NULL OR donation_type = 'direct')",
            (fy,),
        ).rowcount
        total_updated += count
        if count:
            log.info("  Tagged %r as election (%d rows)", fy, count)

    # 4. Tag referendum donations
    ref_years = db.execute("""
        SELECT DISTINCT financial_year FROM donations
        WHERE financial_year LIKE '%Referendum%'
           OR financial_year LIKE '%referendum%'
    """).fetchall()

    for row in ref_years:
        fy = row["financial_year"]
        count = db.execute(
            "UPDATE donations SET donation_type = 'referendum' "
            "WHERE financial_year = ? AND (donation_type IS NULL OR donation_type = 'direct')",
            (fy,),
        ).rowcount
        total_updated += count
        if count:
            log.info("  Tagged %r as referendum (%d rows)", fy, count)

    db.commit()
    log.info("Normalized %d donation rows total", total_updated)
    return total_updated


def link_speakers() -> None:
    db = get_db()
    db.execute("PRAGMA busy_timeout = 600000")
    init_db(db)

    # Step 0: Seed historical members from wragge data
    seed_wragge_members(db)

    # Step 0a: Seed/update members from zenodo comma-format names
    seed_zenodo_members(db)

    # Step 0b: Seed state parliament members from state speeches
    seed_state_members(db)

    # Step 1: Build member lookup (includes state members now)
    full_lookup, surname_lookup = build_member_lookup(db)

    if not full_lookup:
        log.error("No members with names found. Run fix_members first.")
        db.close()
        return

    # Step 1.5: Count procedural entries (we skip them in matching but
    # count them as "accounted for" in reporting)
    log.info("Counting procedural speaker entries...")
    procedural_count = 0
    procedural_names = set()
    proc_rows = db.execute(
        "SELECT DISTINCT speaker_name, COUNT(*) as cnt FROM speeches "
        "WHERE person_id IS NULL AND speaker_name IS NOT NULL AND speaker_name != '' "
        "GROUP BY speaker_name"
    ).fetchall()
    for row in proc_rows:
        if is_procedural(row["speaker_name"]):
            procedural_count += row["cnt"]
            procedural_names.add(row["speaker_name"])
    log.info("Found %d procedural speeches (%d distinct names) -- will skip",
             procedural_count, len(procedural_names))

    # Step 2: Link state parliament speakers (VIC/NSW/QLD/SA)
    state_updated = link_state_speakers(db)

    # Step 3: Get all distinct speaker_name values with their counts (federal)
    log.info("Loading distinct speaker names from speeches (federal + remaining)...")
    speaker_rows = db.execute(
        "SELECT DISTINCT speaker_name, COUNT(*) as cnt FROM speeches "
        "WHERE person_id IS NULL AND speaker_name IS NOT NULL AND speaker_name != '' "
        "AND (state IS NULL OR state = 'federal') "
        "GROUP BY speaker_name ORDER BY cnt DESC"
    ).fetchall()
    log.info("Found %d distinct federal speaker names to match", len(speaker_rows))

    # Step 4: Match each speaker_name to a member (federal)
    matched_names = {}  # speaker_name -> person_id
    unmatched = Counter()  # speaker_name -> count

    for row in speaker_rows:
        speaker_name = row["speaker_name"]
        count = row["cnt"]

        # Skip procedural entries
        if speaker_name in procedural_names:
            continue

        normalized = normalize_speaker_name(speaker_name)

        # Try full name match first
        pid = None
        if normalized:
            pid = full_lookup.get(normalized.lower())

            if not pid:
                # Try with just first word + last word (handles middle names)
                parts = normalized.split()
                if len(parts) > 2:
                    short_name = f"{parts[0]} {parts[-1]}"
                    pid = full_lookup.get(short_name.lower())

            # Try nickname variants (Chris -> Christopher, etc.)
            if not pid and normalized:
                parts = normalized.lower().split()
                if len(parts) >= 2:
                    first = parts[0]
                    last = " ".join(parts[1:])
                    for variant in NICKNAME_MAP.get(first, []):
                        pid = full_lookup.get(f"{variant} {last}")
                        if pid:
                            break

            # Fallback: if we have a normalized first+last name but no match,
            # try matching by surname to members and pick the one with matching
            # first-name initial or nickname
            if not pid and normalized:
                parts = normalized.split()
                if len(parts) >= 2:
                    first = parts[0]
                    last_name = parts[-1]
                    candidates = surname_lookup.get(last_name.lower(), [])
                    candidates = _prefer_real_candidates(candidates)
                    if len(candidates) == 1:
                        pid = candidates[0]["person_id"]
                    elif len(candidates) > 1:
                        # Try to narrow by first-name initial
                        initial_match = [
                            c for c in candidates
                            if c["first_name"] and
                            c["first_name"][0].lower() == first[0].lower()
                        ]
                        if len(initial_match) == 1:
                            pid = initial_match[0]["person_id"]

        # If no full-name match, try surname-only for historical records
        if not pid:
            surname = extract_surname(speaker_name)
            if surname:
                pid = match_historical_surname(speaker_name, surname, surname_lookup)

        if pid:
            matched_names[speaker_name] = pid
        else:
            unmatched[speaker_name] += count

    log.info("Matched %d distinct federal speaker names, %d unmatched",
             len(matched_names), len(unmatched))

    # Step 5: Update federal speeches via batch join
    log.info("Updating federal speeches via batch join (%d mappings)...", len(matched_names))
    db.execute("CREATE TEMP TABLE IF NOT EXISTS _fed_speaker_map (speaker_name TEXT, person_id TEXT)")
    db.execute("DELETE FROM _fed_speaker_map")
    for speaker_name, person_id in matched_names.items():
        db.execute("INSERT INTO _fed_speaker_map VALUES (?, ?)",
                   (speaker_name, person_id))
    db.commit()

    db.execute("""
        UPDATE speeches SET person_id = (
            SELECT m.person_id FROM _fed_speaker_map m
            WHERE m.speaker_name = speeches.speaker_name
        )
        WHERE person_id IS NULL
          AND speaker_name IN (SELECT speaker_name FROM _fed_speaker_map)
    """)
    total_updated = db.execute("SELECT changes()").fetchone()[0]
    db.commit()
    db.execute("DROP TABLE IF EXISTS _fed_speaker_map")

    log.info("Updated %d federal speeches", total_updated)

    # Step 5b: Date-aware linking for ambiguous surnames
    date_updated = link_ambiguous_by_date(db, surname_lookup)

    # Step 5c: Normalize financial_year in donations
    normalize_financial_years(db)

    # Step 6: Report results
    total_speeches = db.execute("SELECT COUNT(*) FROM speeches").fetchone()[0]
    linked_speeches = db.execute(
        "SELECT COUNT(*) FROM speeches WHERE person_id IS NOT NULL"
    ).fetchone()[0]
    still_null = db.execute(
        "SELECT COUNT(*) FROM speeches WHERE person_id IS NULL"
    ).fetchone()[0]

    # State-level breakdown
    log.info("=== Link Speakers Results ===")
    log.info("  Total speeches: %d", total_speeches)
    log.info("  Speeches linked to a person: %d (%.1f%%)",
             linked_speeches, 100 * linked_speeches / max(total_speeches, 1))
    log.info("  Speeches procedural (skipped): %d (%.1f%%)",
             procedural_count, 100 * procedural_count / max(total_speeches, 1))
    accounted = linked_speeches + procedural_count
    log.info("  Total accounted for: %d (%.1f%%)",
             accounted, 100 * accounted / max(total_speeches, 1))
    log.info("  Speeches still unattributed: %d (%.1f%%)",
             still_null - procedural_count,
             100 * max(0, still_null - procedural_count) / max(total_speeches, 1))
    log.info("  Federal speeches updated this run: %d", total_updated)
    log.info("  Date-aware pass updated this run: %d", date_updated)
    log.info("  State speeches updated this run: %d", state_updated)

    # State-level breakdown
    state_rows = db.execute("""
        SELECT state,
               COUNT(*) as total,
               SUM(CASE WHEN person_id IS NOT NULL AND person_id != '' THEN 1 ELSE 0 END) as linked
        FROM speeches
        WHERE state IS NOT NULL
        GROUP BY state
        ORDER BY total DESC
    """).fetchall()
    log.info("  --- Per-state breakdown ---")
    for sr in state_rows:
        st = sr["state"]
        tot = sr["total"]
        lnk = sr["linked"]
        log.info("    %s: %d/%d linked (%.1f%%)", st, lnk, tot, 100 * lnk / max(tot, 1))

    # Top unmatched names
    top_unmatched = unmatched.most_common(20)
    if top_unmatched:
        log.info("Top unmatched federal speaker names:")
        for name, count in top_unmatched:
            normalized = normalize_speaker_name(name)
            surname = extract_surname(name)
            log.info("  %5d | %s -> normalized: %s, surname: %s",
                     count, name, normalized, surname)

    db.close()


def relink_states(states: list[str] | None = None) -> None:
    """Re-seed members and re-link speakers for specific states.

    Useful when new data has been ingested for a state and the linker
    needs to catch up without re-running the full federal pipeline.

    Args:
        states: List of state codes to re-link (e.g., ["sa", "nsw"]).
                If None, re-links all state speeches.
    """
    db = get_db()
    db.execute("PRAGMA busy_timeout = 300000")
    init_db(db)

    label = ", ".join(states) if states else "all states"
    log.info("=== Re-linking speakers for %s ===", label)

    # Report before stats
    if states:
        placeholders = ",".join("?" for _ in states)
        before_rows = db.execute(f"""
            SELECT state,
                   COUNT(*) as total,
                   SUM(CASE WHEN person_id IS NOT NULL AND person_id != ''
                       THEN 1 ELSE 0 END) as linked
            FROM speeches
            WHERE state IN ({placeholders})
            GROUP BY state
        """, states).fetchall()
    else:
        before_rows = db.execute("""
            SELECT state,
                   COUNT(*) as total,
                   SUM(CASE WHEN person_id IS NOT NULL AND person_id != ''
                       THEN 1 ELSE 0 END) as linked
            FROM speeches
            WHERE state IS NOT NULL AND state != 'federal'
            GROUP BY state
        """).fetchall()

    log.info("BEFORE:")
    for sr in before_rows:
        st, tot, lnk = sr["state"], sr["total"], sr["linked"]
        log.info("  %s: %d/%d linked (%.1f%%)", st, lnk, tot,
                 100 * lnk / max(tot, 1))

    # Step 1: Re-seed state members (picks up any new speakers)
    seed_state_members(db)

    # Step 2: Re-link state speakers
    updated = link_state_speakers(db)

    # Report after stats
    if states:
        after_rows = db.execute(f"""
            SELECT state,
                   COUNT(*) as total,
                   SUM(CASE WHEN person_id IS NOT NULL AND person_id != ''
                       THEN 1 ELSE 0 END) as linked
            FROM speeches
            WHERE state IN ({placeholders})
            GROUP BY state
        """, states).fetchall()
    else:
        after_rows = db.execute("""
            SELECT state,
                   COUNT(*) as total,
                   SUM(CASE WHEN person_id IS NOT NULL AND person_id != ''
                       THEN 1 ELSE 0 END) as linked
            FROM speeches
            WHERE state IS NOT NULL AND state != 'federal'
            GROUP BY state
        """).fetchall()

    log.info("AFTER (%d speeches updated):", updated)
    for sr in after_rows:
        st, tot, lnk = sr["state"], sr["total"], sr["linked"]
        log.info("  %s: %d/%d linked (%.1f%%)", st, lnk, tot,
                 100 * lnk / max(tot, 1))

    db.close()


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--states":
        # Usage: python -m parli.ingest.link_speakers --states sa nsw
        target_states = sys.argv[2:]
        if target_states:
            relink_states(target_states)
        else:
            relink_states()
    else:
        link_speakers()
