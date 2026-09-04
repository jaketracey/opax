#!/usr/bin/env python3
"""
Compute per-report structured stats from parli.db (runs on the data box).
Read-only. Output: JSON on stdout — the portal report generator embeds it.

  ssh desktop 'python3 /tmp/arag_mig/report_stats.py' > scripts/report_stats.json

Speech stats approximate the migrating corpus (date >= 1993-03-13, >= 200
chars); donation stats cover the full AEC dataset with industry classification.
"""

import json
import re
import sqlite3
import sys

sys.path.insert(0, "/tmp/arag_mig")
try:
    from parli.ingest.speaker_names import normalize_speaker
except ImportError:  # running somewhere without the staged package
    def normalize_speaker(raw):  # type: ignore
        return raw

DB = "file:/home/jake/.cache/autoresearch/parli.db?mode=ro"

# report slug -> (topic names, donation industries)
TOPIC_MAP = {
    "gambling": (["gambling"], ["gambling"]),
    "climate": (["climate"], ["mining", "energy", "fossil_fuels"]),
    "housing": (["housing"], ["property"]),
    "indigenous": (["indigenous", "indigenous_affairs"], []),
    "immigration": (["immigration"], []),
    "media": (["media"], ["media"]),
}

# The legacy speech_topics table was populated with raw substring counts, so a
# weak match such as "media" inside "immediately" can classify a speech. Top
# speakers need a stricter test than the broad report totals: at least three
# whole-word/phrase hits in the speech itself.
TOP_SPEAKER_PATTERNS = {
    "gambling": r"\b(gambling|poker machines?|pokies|betting|wagering|casino|lotteries?|gaming)\b",
    "climate": r"\b(climate|emissions?|carbon|renewable|solar|wind energy|global warming|net zero|Paris Agreement)\b",
    "housing": r"\b(housing|rents?|mortgages?|affordable housing|homelessness|property|tenants?|real estate|first home)\b",
    "indigenous": r"\b(indigenous|aboriginal|Torres Strait|First Nations|Closing the Gap|native title|Uluru Statement|reconciliation|Voice)\b",
    "immigration": r"\b(immigration|visas?|migration|refugees?|asylum|border|citizenship|multicultural|deportation)\b",
    "media": r"\b(media|broadcasting|press|journalism|social media|misinformation|ABC|SBS|news|digital platforms)\b",
}
TOP_SPEAKER_MIN_HITS = 3
SPEAKER_ALIASES = {
    # Federal source files alternate between the surname and full name.
    "Snowdon": "Warren Snowdon",
}

SPEECH_FILTER = "s.date >= '1993-03-13' AND LENGTH(s.text) >= 200"


def aggregate_top_speakers(rows, limit=5):
    """Normalize and merge source-name variants before taking the leaders."""
    totals = {}
    for raw_name, count in rows:
        name = normalize_speaker(raw_name) or raw_name
        name = SPEAKER_ALIASES.get(name, name)
        totals[name] = totals.get(name, 0) + count
    return sorted(totals.items(), key=lambda item: (-item[1], item[0]))[:limit]


def main() -> None:
    db = sqlite3.connect(DB, uri=True)
    db.create_function(
        "TOPIC_HITS", 2,
        lambda pattern, text: len(re.findall(pattern, text or "", re.IGNORECASE)),
    )
    known_industries = {r[0] for r in db.execute(
        "SELECT DISTINCT industry FROM donations WHERE industry IS NOT NULL")}

    out = {}
    for slug, (topic_names, industries) in TOPIC_MAP.items():
        marks = ",".join("?" * len(topic_names))
        base = f"""
            FROM speeches s
            JOIN speech_topics st ON st.speech_id = s.speech_id
            JOIN topics t ON t.topic_id = st.topic_id
            WHERE t.name IN ({marks}) AND {SPEECH_FILTER}
        """
        n, speakers = db.execute(
            f"SELECT COUNT(DISTINCT s.speech_id), COUNT(DISTINCT s.speaker_name) {base}",
            topic_names).fetchone()
        timeline = db.execute(
            f"SELECT substr(s.date,1,4) AS y, COUNT(DISTINCT s.speech_id) {base} "
            "GROUP BY y ORDER BY y", topic_names).fetchall()
        top_speakers = db.execute(
            f"SELECT s.speaker_name, COUNT(DISTINCT s.speech_id) AS c {base} "
            "AND TOPIC_HITS(?, s.text) >= ? "
            "AND s.speaker_name IS NOT NULL AND s.speaker_name != '' "
            "AND UPPER(s.speaker_name) NOT LIKE '%SPEAKER%' "
            "AND UPPER(s.speaker_name) NOT LIKE '%PRESIDENT%' "
            "AND UPPER(s.speaker_name) NOT LIKE '%CHAIR%' "
            "AND s.speaker_name != 'stage direction' "
            "GROUP BY s.speaker_name ORDER BY c DESC LIMIT 50",
            topic_names + [TOP_SPEAKER_PATTERNS[slug], TOP_SPEAKER_MIN_HITS],
        ).fetchall()

        stats = {
            "speech_count": n,
            "unique_speakers": speakers,
            "timeline": [[y, c] for y, c in timeline],
            "top_speakers": [[nm, c] for nm, c in aggregate_top_speakers(top_speakers)],
        }

        live = [i for i in industries if i in known_industries]
        if live:
            marks_i = ",".join("?" * len(live))
            total, cnt = db.execute(
                f"SELECT SUM(amount), COUNT(*) FROM donations WHERE industry IN ({marks_i})",
                live).fetchone()
            # Case-variant donor names ('Mineralogy Pty Ltd' / 'Mineralogy PTY
            # LTD') are the same entity — aggregate case-insensitively and
            # display the highest-value spelling.
            top_donors = db.execute(
                f"SELECT MAX(donor_name), SUM(amount) AS a FROM donations "
                f"WHERE industry IN ({marks_i}) GROUP BY UPPER(donor_name) "
                "ORDER BY a DESC LIMIT 6", live).fetchall()
            by_year = db.execute(
                f"SELECT financial_year, SUM(amount) FROM donations "
                f"WHERE industry IN ({marks_i}) AND financial_year IS NOT NULL "
                "GROUP BY financial_year ORDER BY financial_year", live).fetchall()
            stats["donations"] = {
                "industries": live,
                "total": round(total or 0),
                "count": cnt,
                "top_donors": [[d, round(a)] for d, a in top_donors],
                "by_year": [[y, round(a)] for y, a in by_year],
            }
        out[slug] = stats

    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
