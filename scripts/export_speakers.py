#!/usr/bin/env python3
"""Export portal/public/speakers.json: [name, speech_count] for every speaker
the knowledge box can filter on, so a casual input ("howard", "Henderson")
resolves to the collaborator value the box holds ("John Howard", "Sarah
Henderson").

Counts what the sync pushes: the same junk and dedupe rules as
parli.ingest.arag_sync (wragge_xml out, presiding officers out, the zenodo
window dedupe), and the sync's name for the speaker: speaker_name_clean, or
when that is empty the raw print through normalize_speaker, as
arag_sync.map_speech labels the resource (speeches-press-013: rows loaded
without speaker_name_clean, such as the OpenAustralia XML loader's, are in the
knowledge box under that name but were missing here). Five or more speeches. Chairs
and unknown speakers (speaker_type) are out; committee witnesses stay in, under
the full names the attendance lists gave them, because their evidence is
searchable by speaker like anything else. Names that are not a person (a group
label such as "Government members", a bare title such as "Mr", a parse fragment
such as "On", or an anonymised "Witness A") are left out of the directory by the
roster's own rule, parli.ingest.speaker_names.non_person_name; their speeches keep
their labels.

A committee turn stored twice (the same hearing, date, speaker and exact text,
as when a whole Senate estimates transcript was loaded a second time) counts
once: the lowest speech_id is kept, which is the copy the knowledge box holds
(speeches-press-003, eight 2025 estimates days). The number of twins dropped is
logged to stderr so a new double load shows up in the refresh log.

    ssh desktop python3 - < scripts/export_speakers.py > portal/public/speakers.json
"""

import sys as _donor_sys
from pathlib import Path as _DonorPath
_donor_sys.path.insert(0, str(_DonorPath(__file__).resolve().parents[1]))

import hashlib
import json
import os
import sqlite3
import sys
from collections import Counter

from parli.ingest.speaker_names import normalize_speaker
from parli.ingest.speaker_roles import chair_party_sql
from parli.ingest.speaker_names import non_person_name
from parli.ingest.speaker_identity import identity_for

DB = os.environ.get("OPAX_DB") or os.path.expanduser("~/.cache/autoresearch/parli.db")
MIN_SPEECHES = 5


def eligible_where(cols: set[str]) -> str:
    """The arag_sync corpus rule as a WHERE clause over speeches."""
    type_clause = "AND COALESCE(speaker_type, '') NOT IN ('chair', 'unknown')" if "speaker_type" in cols else ""
    return f"""
        source != 'wragge_xml'
      AND NOT ((source = 'openaustralia' AND {chair_party_sql()}) OR
          (source != 'openaustralia' AND (UPPER(COALESCE(speaker_name,'')) LIKE '%SPEAKER%'
            OR UPPER(COALESCE(speaker_name,'')) LIKE '%PRESIDENT%'
            OR UPPER(COALESCE(speaker_name,'')) LIKE '%CHAIR%')))
      AND NOT (source = 'zenodo' AND COALESCE(speaker_name,'') = 'stage direction')
      AND NOT (source = 'openaustralia' AND COALESCE(chamber,'') = 'representatives'
               AND date IN (SELECT DISTINCT date FROM speeches WHERE source = 'zenodo'))
      AND LENGTH(text) >= 200
      {type_clause}"""


def speaker_label(clean: str | None, raw: str | None) -> str | None:
    """The speaker name the knowledge box holds for a speech (arag_sync.map_speech)."""
    return clean or (normalize_speaker(raw) if isinstance(raw, str) else None)


def count_speakers(db: sqlite3.Connection, min_speeches: int = MIN_SPEECHES) -> tuple[list[list], int]:
    """Return ([[name, count], ...] sorted by count then name, twins dropped).

    One pass in speech_id order. Only rows with a hearing_id can be committee
    twins, so only their text is read and hashed; a twin is a later row with the
    same (hearing_id, date, speaker name, text) as an earlier one.
    """
    cols = {r[1] for r in db.execute("PRAGMA table_info(speeches)")}
    hearing = "hearing_id" if "hearing_id" in cols else "NULL"
    counts: Counter = Counter()
    seen: set = set()
    twins = 0
    context_fields = ('person_id', 'state', 'chamber', 'source', 'electorate', 'speaker_type', 'witness_name')
    context_sql = ', '.join(f'{c}' if c in cols else f'NULL AS {c}' for c in context_fields)
    cursor = db.execute(f"""
        SELECT speaker_name_clean, speaker_name, {hearing}, date,
               CASE WHEN COALESCE({hearing}, '') != '' THEN text END, {context_sql}
        FROM speeches
        WHERE {eligible_where(cols)}
        ORDER BY speech_id
    """)
    for clean, raw, hearing_id, date, text, *context in cursor:
        person = identity_for(dict(zip(context_fields, context), speaker_name=raw, date=date))
        name = person['name'] if person else speaker_label(clean, raw)
        if not name:
            continue
        if text is not None:
            key = (hearing_id, date, name, hashlib.sha1(text.encode("utf-8")).digest())
            if key in seen:
                twins += 1
                continue
            seen.add(key)
        counts[name] += 1
    rows = sorted(((name, n) for name, n in counts.items() if n >= min_speeches and not non_person_name(name)),
                  key=lambda r: (-r[1], r[0]))
    return [[name, n] for name, n in rows], twins


def main() -> None:
    db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    db.execute("PRAGMA busy_timeout = 600000")
    rows, twins = count_speakers(db)
    print(f"export_speakers: {len(rows)} speakers; {twins} exact-twin committee turns counted once", file=sys.stderr)
    json.dump(rows, sys.stdout, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
