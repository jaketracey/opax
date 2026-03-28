"""
parli.ingest.wragge_xml -- Load historical Hansard speeches from the
wragge/hansard-xml dataset (1901-2005) into the parli SQLite database.

XML source: ~/.cache/autoresearch/hansard/hansard-xml/
  hofreps/1901/ .. hofreps/2005/  (House of Representatives)
  senate/1901/  .. senate/2005/   (Senate)

Three XML formats are handled:
  Format A (1901-1980): lowercase <hansard>, <speech>, <para>, <talker>
  Format B (1981-1997): UPPERCASE <HANSARD>, <SPEECH>, <PARA>, <TALKER>
  Format C (1998-2005): lowercase v2.0, same tags as A but richer <talker>

Usage:
    python -m parli.ingest.wragge_xml               # full run
    python -m parli.ingest.wragge_xml --limit 100    # test with 100 files
"""

import argparse
import hashlib
import os
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from parli.schema import get_db, init_db

XML_DIR = Path("~/.cache/autoresearch/hansard/hansard-xml").expanduser()
BATCH_SIZE = 500

MULTI_SPACE_RE = re.compile(r"[ \t]+")
HTML_ENTITY_RE = re.compile(r"&(?!amp;|lt;|gt;|apos;|quot;)\w+;")

# Date patterns found in filenames
# Format A: 19010509_reps_1_1_v13.xml  -> 1901-05-09
# Format B: reps_1981-02-24.xml        -> 1981-02-24
# Format C: 163-5858.xml               -> no date in filename, use XML header
DATE_FROM_FILENAME_A = re.compile(r"^(\d{4})(\d{2})(\d{2})_")
DATE_FROM_FILENAME_B = re.compile(r"(\d{4}-\d{2}-\d{2})")


def text_hash(text: str) -> str:
    """Short SHA-256 hex digest for deduplication."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def clean_text(text: str) -> str | None:
    """Collapse whitespace, strip. Return None if too short (<50 chars)."""
    text = MULTI_SPACE_RE.sub(" ", text).strip()
    if len(text) < 50:
        return None
    return text


def extract_all_text(elem) -> str:
    """Recursively extract all text from an element and its children."""
    parts = []
    if elem.text:
        parts.append(elem.text)
    for child in elem:
        parts.append(extract_all_text(child))
        if child.tail:
            parts.append(child.tail)
    return " ".join(parts)


def date_from_filename(filename: str) -> str | None:
    """Try to extract a date from the filename."""
    m = DATE_FROM_FILENAME_A.match(filename)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = DATE_FROM_FILENAME_B.search(filename)
    if m:
        return m.group(1)
    return None


def date_from_xml(root) -> str | None:
    """Extract date from XML header element."""
    # Format A/C: <session.header><date>1901-05-09</date>
    for tag in ("session.header/date", "SESSION.HEADER/DATE"):
        el = root.find(tag)
        if el is not None and el.text:
            return el.text.strip()
    # Format B: <HANSARD DATE="24/02/1981" ...>
    date_attr = root.get("DATE") or root.get("date")
    if date_attr:
        # Convert DD/MM/YYYY to YYYY-MM-DD
        parts = date_attr.split("/")
        if len(parts) == 3:
            return f"{parts[2]}-{parts[1]}-{parts[0]}"
        return date_attr
    return None


def detect_format(root) -> str:
    """Detect XML format: 'upper' for Format B, 'lower' for Format A/C."""
    tag = root.tag
    if tag.isupper() or tag == "HANSARD":
        return "upper"
    return "lower"


def parse_speeches_lower(root, date: str, chamber: str) -> list[dict]:
    """Parse speeches from Format A/C (lowercase tags)."""
    speeches = []
    # Find all <speech> elements anywhere in the tree
    for speech_el in root.iter("speech"):
        speaker_name = ""
        party = ""
        electorate = ""
        topic = ""

        # Get topic from parent debate's debateinfo
        parent_debate = None
        # We can't easily get parent in ET, so we find topic separately
        # Topic will be set from the debate context

        # Extract speaker info from <talk.start><talker>
        talker = speech_el.find(".//talker")
        if talker is not None:
            # Try display name first, then any name
            name_el = None
            for n in talker.findall("name"):
                role = n.get("role", "")
                if role == "display":
                    name_el = n
                    break
                if name_el is None:
                    name_el = n
            if name_el is None:
                name_el = talker.find("name")
            if name_el is not None and name_el.text:
                speaker_name = name_el.text.strip()

            party_el = talker.find("party")
            if party_el is not None and party_el.text:
                party = party_el.text.strip()

            electorate_el = talker.find("electorate")
            if electorate_el is not None and electorate_el.text:
                electorate = electorate_el.text.strip()

        # Collect all <para> text within the speech
        para_texts = []
        for para in speech_el.iter("para"):
            t = extract_all_text(para)
            if t and t.strip():
                para_texts.append(t.strip())

        # Also check <continue> blocks which have additional paras
        for cont in speech_el.iter("continue"):
            for para in cont.iter("para"):
                t = extract_all_text(para)
                if t and t.strip():
                    para_texts.append(t.strip())

        full_text = " ".join(para_texts)
        text = clean_text(full_text)
        if not text:
            continue

        speeches.append({
            "speaker_name": speaker_name,
            "party": party if party != "N/A" else "",
            "electorate": electorate if electorate != "PO" else "",
            "chamber": chamber,
            "date": date,
            "topic": topic,
            "text": text,
        })

    return speeches


def parse_speeches_upper(root, date: str, chamber: str) -> list[dict]:
    """Parse speeches from Format B (UPPERCASE tags)."""
    speeches = []

    for speech_el in root.iter("SPEECH"):
        speaker_name = ""
        party = speech_el.get("PARTY", "")
        electorate = speech_el.get("ELECTORATE", "")

        # Speaker name from <TALKER><NAME>
        talker = speech_el.find(".//TALKER")
        if talker is not None:
            name_el = talker.find("NAME")
            if name_el is not None and name_el.text:
                speaker_name = name_el.text.strip()

        # Collect all <PARA> text
        para_texts = []
        for para in speech_el.iter("PARA"):
            t = extract_all_text(para)
            if t and t.strip():
                para_texts.append(t.strip())

        full_text = " ".join(para_texts)
        text = clean_text(full_text)
        if not text:
            continue

        speeches.append({
            "speaker_name": speaker_name,
            "party": party,
            "electorate": electorate,
            "chamber": chamber,
            "date": date,
            "topic": "",
            "text": text,
        })

    # Also handle INTERJECT elements which contain speeches
    for interject in root.iter("INTERJECT"):
        speaker_name = interject.get("SPEAKER", "")
        talker = interject.find(".//TALKER")
        if talker is not None:
            name_el = talker.find("NAME")
            if name_el is not None and name_el.text:
                speaker_name = name_el.text.strip()

        para_texts = []
        for para in interject.iter("PARA"):
            t = extract_all_text(para)
            if t and t.strip():
                para_texts.append(t.strip())

        full_text = " ".join(para_texts)
        text = clean_text(full_text)
        if not text:
            continue

        speeches.append({
            "speaker_name": speaker_name,
            "party": "",
            "electorate": "",
            "chamber": chamber,
            "date": date,
            "topic": "",
            "text": text,
        })

    return speeches


def collect_xml_files() -> list[tuple[Path, str]]:
    """Collect all XML files with their chamber. Returns [(path, chamber)]."""
    files = []
    for chamber_dir, chamber_name in [
        ("hofreps", "representatives"),
        ("senate", "senate"),
    ]:
        base = XML_DIR / chamber_dir
        if not base.exists():
            print(f"  Warning: {base} not found")
            continue
        for year_dir in sorted(base.iterdir()):
            if not year_dir.is_dir():
                continue
            for xml_file in sorted(year_dir.glob("*.xml")):
                files.append((xml_file, chamber_name))
    return files


def preprocess_xml(raw: str) -> str:
    """Fix common XML issues: replace HTML entities with spaces."""
    # Replace HTML entities like &mdash; &nbsp; etc. that aren't valid XML
    raw = HTML_ENTITY_RE.sub(" ", raw)
    return raw


def process_file(filepath: Path, chamber: str) -> list[dict]:
    """Parse a single XML file, return list of speech dicts."""
    try:
        raw = filepath.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        print(f"  ERROR reading {filepath}: {e}", file=sys.stderr)
        return []

    raw = preprocess_xml(raw)

    try:
        root = ET.fromstring(raw)
    except ET.ParseError as e:
        # Try stripping DOCTYPE which can cause issues
        cleaned = re.sub(r"<!DOCTYPE[^>]*>", "", raw)
        try:
            root = ET.fromstring(cleaned)
        except ET.ParseError:
            print(f"  ERROR parsing {filepath}: {e}", file=sys.stderr)
            return []

    # Get date
    date = date_from_xml(root)
    if not date:
        date = date_from_filename(filepath.name)
    if not date:
        print(f"  WARNING: no date for {filepath}", file=sys.stderr)
        return []

    # Validate date format
    if not re.match(r"\d{4}-\d{2}-\d{2}", date):
        print(f"  WARNING: bad date '{date}' for {filepath}", file=sys.stderr)
        return []

    fmt = detect_format(root)
    if fmt == "upper":
        return parse_speeches_upper(root, date, chamber)
    else:
        return parse_speeches_lower(root, date, chamber)


def load_existing_hashes(db) -> set[str]:
    """Load dedup keys for existing speeches to avoid duplicates."""
    seen = set()
    cursor = db.execute(
        "SELECT speaker_name, date, text FROM speeches WHERE source IN ('zenodo', 'wragge_xml')"
    )
    for row in cursor:
        key = f"{row[0] or ''}|{row[1]}|{text_hash(row[2])}"
        seen.add(key)
    print(f"  Loaded {len(seen)} existing dedup keys")
    return seen


def run(limit: int | None = None):
    """Main entry point: load wragge XML speeches into the database."""
    print("=== Loading wragge/hansard-xml speeches ===")

    db = get_db()
    init_db(db)

    # Collect files
    xml_files = collect_xml_files()
    total_files = len(xml_files)
    print(f"  Found {total_files} XML files")

    if limit:
        xml_files = xml_files[:limit]
        print(f"  Limited to {limit} files")

    # Load existing hashes for deduplication
    seen = load_existing_hashes(db)

    files_processed = 0
    files_errored = 0
    speeches_inserted = 0
    speeches_skipped_dedup = 0
    pending = 0

    for filepath, chamber in xml_files:
        speeches = process_file(filepath, chamber)
        files_processed += 1

        if not speeches:
            if files_processed % 500 == 0:
                print(f"  [{files_processed}/{len(xml_files)}] {filepath.name} - no speeches")
            continue

        for sp in speeches:
            dedup_key = f"{sp['speaker_name']}|{sp['date']}|{text_hash(sp['text'])}"
            if dedup_key in seen:
                speeches_skipped_dedup += 1
                continue
            seen.add(dedup_key)

            word_count = len(sp["text"].split())

            db.execute(
                """
                INSERT INTO speeches
                (person_id, speaker_name, party, electorate, chamber,
                 date, topic, text, word_count, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    None,
                    sp["speaker_name"],
                    sp["party"],
                    sp["electorate"],
                    sp["chamber"],
                    sp["date"],
                    sp["topic"] or None,
                    sp["text"],
                    word_count,
                    "wragge_xml",
                ),
            )
            speeches_inserted += 1
            pending += 1

            if pending >= BATCH_SIZE:
                db.commit()
                pending = 0
                print(
                    f"  [{files_processed}/{len(xml_files)}] "
                    f"{speeches_inserted} inserted, {speeches_skipped_dedup} deduped"
                )

        if files_processed % 1000 == 0:
            print(
                f"  [{files_processed}/{len(xml_files)}] "
                f"{speeches_inserted} inserted, {speeches_skipped_dedup} deduped"
            )

    # Final commit
    if pending > 0:
        db.commit()

    print(f"\n=== Done ===")
    print(f"  Files processed: {files_processed}")
    print(f"  Files errored:   {files_errored}")
    print(f"  Speeches inserted: {speeches_inserted}")
    print(f"  Speeches deduped:  {speeches_skipped_dedup}")

    db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Load wragge/hansard-xml into parli DB")
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of XML files to process (for testing)",
    )
    args = parser.parse_args()
    run(limit=args.limit)
