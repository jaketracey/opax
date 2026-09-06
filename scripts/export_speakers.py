#!/usr/bin/env python3
"""Export portal/public/speakers.json: [name, speech_count] for every speaker
the knowledge box can filter on, so a casual input ("howard", "Henderson")
resolves to the collaborator value the box holds ("John Howard", "Sarah
Henderson").

Counts what the sync pushes: the same junk and dedupe rules as
parli.ingest.arag_sync (wragge_xml out, presiding officers out, the zenodo
window dedupe), speaker_name_clean as the name, five or more speeches. Chairs
and unknown speakers (speaker_type) are out; committee witnesses stay in, under
the full names the attendance lists gave them, because their evidence is
searchable by speaker like anything else.

    ssh desktop python3 - < scripts/export_speakers.py > portal/public/speakers.json
"""

import json
import sqlite3
import sys

DB = "/home/jake/.cache/autoresearch/parli.db"
MIN_SPEECHES = 5

db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
db.execute("PRAGMA busy_timeout = 600000")
cols = {r[1] for r in db.execute("PRAGMA table_info(speeches)")}
type_clause = "AND COALESCE(speaker_type, '') NOT IN ('chair', 'unknown')" if "speaker_type" in cols else ""
rows = db.execute(f"""
    SELECT speaker_name_clean, COUNT(*) AS n FROM speeches
    WHERE speaker_name_clean IS NOT NULL AND speaker_name_clean != ''
      AND source != 'wragge_xml'
      AND NOT (UPPER(COALESCE(speaker_name,'')) LIKE '%SPEAKER%' OR UPPER(COALESCE(speaker_name,'')) LIKE '%PRESIDENT%'
               OR UPPER(COALESCE(speaker_name,'')) LIKE '%CHAIR%')
      AND NOT (source = 'zenodo' AND COALESCE(speaker_name,'') = 'stage direction')
      AND NOT (source = 'openaustralia' AND COALESCE(chamber,'') = 'representatives'
               AND date IN (SELECT DISTINCT date FROM speeches WHERE source = 'zenodo'))
      AND LENGTH(text) >= 200
      {type_clause}
    GROUP BY speaker_name_clean HAVING n >= {MIN_SPEECHES}
    ORDER BY n DESC, speaker_name_clean
""").fetchall()
json.dump([[name, n] for name, n in rows], sys.stdout, ensure_ascii=False, separators=(",", ":"))
