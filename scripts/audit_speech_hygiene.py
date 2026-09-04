#!/usr/bin/env python3
"""Read-only speech-corpus hygiene audit.

Run this on the host that owns ``parli.db``.  The scanner makes one streaming
pass over the complete table, keeps a deterministic 2,000-row reservoir per
source, and emits JSON.  It opens SQLite in read-only mode and never creates
tables or writes checkpoints.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import sqlite3
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from typing import Any


SAMPLE_PER_SOURCE = 2_000

PARTY_ALIASES = {
    alias.casefold()
    for aliases in (
        ("ALP", "Australian Labor Party", "Labor"),
        ("LP", "LIB", "Liberal Party", "Liberal"),
        ("NP", "Nats", "NATS", "NPA", "National Party", "NatsWA", "CP", "Nationals"),
        ("LNP", "Liberal National Party"),
        ("IND", "Ind", "Ind.", "Independent"),
        ("AG", "Australian Greens", "Greens"),
        ("CLP", "Country Liberal Party"),
        ("KAP", "Katter's Australian Party"),
        ("NXT", "CA", "Centre Alliance"),
        ("PUP", "UAP", "United Australia Party"),
        ("One Nation", "PHON", "Pauline Hanson's One Nation"),
        ("Australian Democrats", "AD"),
        ("DLP",),
        ("Family First", "FF"),
        ("JLN", "Jacqui Lambie Network"),
    )
    for alias in aliases
}

HTML_ENTITY_RE = re.compile(r"&#(?:\d+|x[0-9a-f]+);", re.I)
MOJIBAKE_RE = re.compile(r"(?:Ã.|Â.|â(?:€™|€œ|€\x9d|€“|€”|€¦|€¢)|ï»¿|\ufffd)")
CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
WHITESPACE_RUN_RE = re.compile(r"[^\S\r\n]{3,}|\n{3,}")
MID_SENTENCE_LINE_RE = re.compile(r"(?<=[a-z,;])\s*\n\s*(?=[a-z])")
HYPHEN_LINE_RE = re.compile(r"\b[a-z]{3,}-\s*\n\s*[a-z]{2,}\b")
FOOTER_RE = re.compile(
    r"(?im)^[ \t]*(?:page[ \t]+\d+(?:[ \t]+of[ \t]+\d+)?|\d+[ \t]+(?:legislative assembly|legislative council|senate|house of representatives)[ \t]+\d+|(?:new south wales|queensland|victoria|south australia)?[ \t]*hansard[ \t]+page[ \t]+\d+)[ \t]*$"
)
INTERJECTION_RE = re.compile(
    r"(?i)(?:<\/?interjection\b|\[(?:interjection|inaudible|unidentified speaker)[^]]*\]|\((?:interjection|inaudible|unidentified speaker)[^)]*\)|honourable members interjecting)"
)
BRACKET_TIMESTAMP_RE = re.compile(r"^\s*\[\s*\d{1,2}\s*:\s*\d{2}(?:\s*:\s*\d{2})?\s*\]\s*")
LEADING_BANNER_RE = re.compile(
    r"^\s*(?P<label>(?:(?:the\s+)?hon(?:ourable)?\.?|mr\.?|mrs\.?|ms\.?|miss|dr\.?|prof\.?|senator|sen\.?|madam|rev\.?)\s+[^:\n]{1,150}?)\s*:\s*",
    re.I,
)
BROKEN_TIME_BANNER_RE = re.compile(
    r"^\s*(?:(?:the\s+)?hon(?:ourable)?\.?|mr\.?|mrs\.?|ms\.?|miss|dr\.?|senator)\s+[^:\n]{1,100}?\([^()\n]{1,60}\)\s*\(\s*\d[\d\s]*:\s*\d[\d\s]*(?::\s*\d[\d\s]*)?\)\s*:\s*",
    re.I,
)
ALL_CAPS_LINE_RE = re.compile(r"^[A-Z][A-Z0-9 '&/(),.\-–—]{4,140}(?=\n|$)")
PAREN_SPEAKER_RE = re.compile(r"\([^)]{2,}\)")
MISSING_SPACE_RE = re.compile(r"\b(?:of|the|for|to|and|by|from)(?=[A-Z][a-z]{2,})")
SPLIT_COMMON_WORD_RE = re.compile(
    r"(?i)\b(?:par\s+liament|govern\s+ment|depart\s+ment|represen\s+tatives|notwith-stand-ing)\b"
)


def valid_iso_date(raw: Any) -> bool:
    if not isinstance(raw, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
        return False
    try:
        date.fromisoformat(raw)
    except ValueError:
        return False
    return True


def all_caps_header(text: str) -> bool:
    first = text.lstrip().splitlines()[0].strip() if text.strip() else ""
    letters = [c for c in first if c.isalpha()]
    return bool(ALL_CAPS_LINE_RE.match(first)) and len(letters) >= 4 and all(c.isupper() for c in letters)


def topic_prefix(text: str, topic: Any) -> bool:
    if not isinstance(topic, str) or len(topic.strip()) < 3:
        return False
    start = text.lstrip()
    value = topic.strip()
    return start[: len(value)].casefold() == value.casefold() and (
        len(start) == len(value) or not start[len(value)].isalnum()
    )


def topic_is_first_line(text: str, topic: Any) -> bool:
    if not isinstance(topic, str) or not topic.strip() or not text.strip():
        return False
    return text.lstrip().splitlines()[0].strip(" :-–—").casefold() == topic.strip().casefold()


def heading_only(text: str) -> bool:
    value = re.sub(r"\s+", " ", text).strip()
    if not value or len(value) >= 200:
        return False
    letters = [c for c in value if c.isalpha()]
    caps = bool(letters) and sum(c.isupper() for c in letters) / len(letters) >= 0.85
    no_sentence = not re.search(r"[.!?][\"'’)]?(?:\s|$)", value)
    return caps or (no_sentence and len(value.split()) <= 14)


def motion_stub(text: str) -> bool:
    value = re.sub(r"\s+", " ", text).strip()
    return len(value) < 300 and bool(
        re.match(r"(?i)^(?:motion(?:\s+by\s+leave)?|question|bill|order of the day)\b", value)
        or (value.startswith("That ") and len(value.split()) < 35)
    )


def division_roll(text: str) -> bool:
    value = re.sub(r"\s+", " ", text)
    return bool(
        re.search(r"(?i)\bdivision\s*:\s*question put\b", value)
        and re.search(r"(?i)\bayes?\b", value)
        and re.search(r"(?i)\bnoes?\b", value)
    )


def defects(row: sqlite3.Row) -> set[str]:
    text = row["text"] or ""
    stripped = text.strip()
    topic = row["topic"]
    party = row["party"]
    speaker = row["speaker_name"] or ""
    found: set[str] = set()
    if not stripped:
        found.add("empty_text")
    if len(stripped) < 20:
        found.add("near_empty_text")
    if len(stripped) < 200:
        found.add("under_200_chars")
    if heading_only(text):
        found.add("heading_only")
    if motion_stub(text):
        found.add("motion_stub")
    if division_roll(text):
        found.add("division_roll")
    if LEADING_BANNER_RE.match(text):
        found.add("leading_speaker_banner")
    if BROKEN_TIME_BANNER_RE.match(text):
        found.add("broken_timestamp_banner")
    if BRACKET_TIMESTAMP_RE.match(text):
        found.add("bracket_timestamp")
    if topic_prefix(text, topic):
        found.add("topic_prefix")
    if topic_is_first_line(text, topic):
        found.add("topic_repeats_first_line")
    if all_caps_header(text):
        found.add("all_caps_header")
    if HTML_ENTITY_RE.search(text):
        found.add("numeric_html_entity")
    if MOJIBAKE_RE.search(text):
        found.add("mojibake")
    if CONTROL_RE.search(text):
        found.add("control_character")
    if WHITESPACE_RUN_RE.search(text):
        found.add("whitespace_run")
    if MID_SENTENCE_LINE_RE.search(text):
        found.add("mid_sentence_line_break")
    if HYPHEN_LINE_RE.search(text):
        found.add("pdf_hyphenation")
    if MISSING_SPACE_RE.search(text):
        found.add("missing_space_concatenation")
    if SPLIT_COMMON_WORD_RE.search(text):
        found.add("split_common_word")
    if FOOTER_RE.search(text):
        found.add("page_or_hansard_footer")
    if INTERJECTION_RE.search(text):
        found.add("raw_interjection_markup")
    if PAREN_SPEAKER_RE.search(speaker):
        found.add("speaker_parenthetical")
    if party and str(party).strip().casefold() not in PARTY_ALIASES:
        found.add("party_junk")
    if not valid_iso_date(row["date"]):
        found.add("date_missing_or_malformed")
    return found


def audit(db_path: Path, sample_size: int) -> dict[str, Any]:
    db = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    counts: Counter[str] = Counter()
    by_source: dict[str, Counter[str]] = defaultdict(Counter)
    source_counts: Counter[str] = Counter()
    examples: dict[str, dict[str, Any]] = {}
    reservoirs: dict[str, list[tuple[int, tuple[str, ...]]]] = defaultdict(list)
    rngs: dict[str, random.Random] = {}

    # digest -> first id/source plus total occurrences and seen source set.
    duplicates: dict[bytes, list[Any]] = {}
    duplicate_rows = 0
    cross_source_duplicate_rows = 0

    sql = """SELECT speech_id, source, state, date, speaker_name, party, topic, text
             FROM speeches ORDER BY speech_id"""
    for row in db.execute(sql):
        source = row["source"] or "(missing)"
        source_counts[source] += 1
        found = defects(row)
        for key in found:
            counts[key] += 1
            by_source[source][key] += 1
            examples.setdefault(
                key,
                {
                    "speech_id": row["speech_id"],
                    "source": source,
                    "state": row["state"],
                    "date": row["date"],
                    "speaker_name": row["speaker_name"],
                    "party": row["party"],
                    "topic": row["topic"],
                    "text_start": (row["text"] or "")[:300],
                },
            )

        n = source_counts[source]
        sample = reservoirs[source]
        packed = (row["speech_id"], tuple(sorted(found)))
        if len(sample) < sample_size:
            sample.append(packed)
        else:
            rng = rngs.setdefault(source, random.Random(f"opax-hygiene:{source}"))
            j = rng.randrange(n)
            if j < sample_size:
                sample[j] = packed

        digest = hashlib.blake2b((row["text"] or "").encode("utf-8"), digest_size=16).digest()
        prior = duplicates.get(digest)
        if prior is None:
            duplicates[digest] = [row["speech_id"], source, 1, {source}]
        else:
            duplicate_rows += 1
            prior[2] += 1
            if source not in prior[3]:
                cross_source_duplicate_rows += 1
            prior[3].add(source)

    duplicate_groups = sum(1 for v in duplicates.values() if v[2] > 1)
    cross_source_groups = sum(1 for v in duplicates.values() if len(v[3]) > 1)
    duplicate_example = next(
        (
            {
                "speech_id": v[0],
                "source": v[1],
                "occurrences": v[2],
                "sources": sorted(v[3]),
            }
            for v in duplicates.values()
            if v[2] > 1
        ),
        None,
    )

    sample_counts: dict[str, dict[str, int]] = {}
    for source, sample in reservoirs.items():
        c: Counter[str] = Counter()
        for _, found in sample:
            c.update(found)
        sample_counts[source] = dict(sorted(c.items()))

    return {
        "database": str(db_path),
        "total_rows": sum(source_counts.values()),
        "source_counts": dict(sorted(source_counts.items())),
        "sample_size_requested": sample_size,
        "sample_sizes": {k: len(v) for k, v in sorted(reservoirs.items())},
        "sample_counts": sample_counts,
        "counts": dict(sorted(counts.items())),
        "by_source": {k: dict(sorted(v.items())) for k, v in sorted(by_source.items())},
        "examples": dict(sorted(examples.items())),
        "duplicates": {
            "duplicate_groups": duplicate_groups,
            "duplicate_rows_beyond_first": duplicate_rows,
            "cross_source_groups": cross_source_groups,
            "cross_source_rows_beyond_first": cross_source_duplicate_rows,
            "example": duplicate_example,
            "digest": "blake2b-128",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default="~/.cache/autoresearch/parli.db")
    parser.add_argument("--sample-per-source", type=int, default=SAMPLE_PER_SOURCE)
    args = parser.parse_args()
    result = audit(Path(args.db).expanduser(), args.sample_per_source)
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
