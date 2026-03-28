"""
parli.analysis.bias — Systematic Bias Detection

Analyses:
  1. Speaking time distribution — who gets more/less time, by party, gender, seniority
  2. Motion support rates — whose motions get supported, by party and gender
  3. Gendered language — patterns in how male vs female MPs are described/interrupted
  4. Interjection analysis — who gets interrupted most, who interrupts most

These are great for generating Twitter-ready charts:
  "Male MPs in the 47th Parliament spoke 2.3x more total words than female MPs,
   despite women making up 38% of the chamber"

Usage:
    python -m parli.analysis.bias
    python -m parli.analysis.bias --analysis speaking-time
    python -m parli.analysis.bias --analysis gender-language
"""

import json
import re
from collections import defaultdict

import numpy as np

from parli.schema import get_db, init_db


# ── Speaking time analysis ─────────────────────────────────────────────────

def analyze_speaking_time(db, year: str | None = None) -> dict:
    """Analyze speaking time distribution by party and gender."""
    where = "WHERE 1=1"
    params = []
    if year:
        where += " AND strftime('%Y', s.date) = ?"
        params.append(year)

    # By party
    by_party = db.execute(f"""
        SELECT m.party,
               COUNT(*) as speech_count,
               SUM(s.word_count) as total_words,
               AVG(s.word_count) as avg_words,
               SUM(s.duration_sec) as total_seconds,
               COUNT(DISTINCT m.member_id) as n_members
        FROM speeches s
        JOIN members m ON s.member_id = m.member_id
        {where}
        GROUP BY m.party
        ORDER BY total_words DESC
    """, params).fetchall()

    # By gender
    by_gender = db.execute(f"""
        SELECT m.gender,
               COUNT(*) as speech_count,
               SUM(s.word_count) as total_words,
               AVG(s.word_count) as avg_words,
               SUM(s.duration_sec) as total_seconds,
               COUNT(DISTINCT m.member_id) as n_members
        FROM speeches s
        JOIN members m ON s.member_id = m.member_id
        {where} AND m.gender IS NOT NULL
        GROUP BY m.gender
        ORDER BY total_words DESC
    """, params).fetchall()

    # By party + gender cross-tab
    by_party_gender = db.execute(f"""
        SELECT m.party, m.gender,
               COUNT(*) as speech_count,
               SUM(s.word_count) as total_words,
               COUNT(DISTINCT m.member_id) as n_members
        FROM speeches s
        JOIN members m ON s.member_id = m.member_id
        {where} AND m.gender IS NOT NULL
        GROUP BY m.party, m.gender
        ORDER BY m.party, m.gender
    """, params).fetchall()

    # Top speakers by total words
    top_speakers = db.execute(f"""
        SELECT m.name, m.party, m.gender,
               COUNT(*) as speech_count,
               SUM(s.word_count) as total_words
        FROM speeches s
        JOIN members m ON s.member_id = m.member_id
        {where}
        GROUP BY m.member_id
        ORDER BY total_words DESC
        LIMIT 20
    """, params).fetchall()

    return {
        "by_party": [dict(r) for r in by_party],
        "by_gender": [dict(r) for r in by_gender],
        "by_party_gender": [dict(r) for r in by_party_gender],
        "top_speakers": [dict(r) for r in top_speakers],
    }


# ── Gendered language analysis ─────────────────────────────────────────────

# Patterns that indicate gendered language
GENDERED_DESCRIPTORS = {
    "aggressive_female": [
        re.compile(r"\bshrill\b", re.I),
        re.compile(r"\bhysterical\b", re.I),
        re.compile(r"\bemotional\b", re.I),
        re.compile(r"\bcatty\b", re.I),
        re.compile(r"\bbossy\b", re.I),
    ],
    "aggressive_male": [
        re.compile(r"\bstrong leader\b", re.I),
        re.compile(r"\bdecisive\b", re.I),
        re.compile(r"\bassertive\b", re.I),
    ],
    "diminutive_female": [
        re.compile(r"\bthe lady\b", re.I),
        re.compile(r"\blittle lady\b", re.I),
        re.compile(r"\bthe girl\b", re.I),
    ],
    "interruption_markers": [
        re.compile(r"\border!\s*order!\b", re.I),
        re.compile(r"\bthe (?:honourable )?member will resume (?:his|her) seat\b", re.I),
        re.compile(r"\bI ask the member to withdraw\b", re.I),
    ],
}


def analyze_gendered_language(db, year: str | None = None) -> dict:
    """Analyze gendered language patterns in parliamentary speech."""
    where = "WHERE 1=1"
    params = []
    if year:
        where += " AND strftime('%Y', s.date) = ?"
        params.append(year)

    # Get all speeches with member gender info
    speeches = db.execute(f"""
        SELECT s.speech_id, s.text, s.date, m.gender, m.name, m.party
        FROM speeches s
        JOIN members m ON s.member_id = m.member_id
        {where} AND m.gender IS NOT NULL
    """, params).fetchall()

    # Count gendered descriptor usage
    results = defaultdict(lambda: {"M_speaker": 0, "F_speaker": 0, "examples": []})

    for speech in speeches:
        gender = speech["gender"]
        for category, patterns in GENDERED_DESCRIPTORS.items():
            for pattern in patterns:
                matches = pattern.findall(speech["text"])
                if matches:
                    key = f"{gender}_speaker"
                    results[category][key] += len(matches)
                    if len(results[category]["examples"]) < 3:
                        # Find context around match
                        m = pattern.search(speech["text"])
                        if m:
                            start = max(0, m.start() - 50)
                            end = min(len(speech["text"]), m.end() + 50)
                            results[category]["examples"].append({
                                "speaker": speech["name"],
                                "gender": gender,
                                "context": speech["text"][start:end],
                                "date": speech["date"],
                            })

    return {
        "gendered_language": dict(results),
        "total_speeches_analyzed": len(speeches),
    }


# ── Interjection analysis ─────────────────────────────────────────────────

INTERJECTION_PATTERN = re.compile(
    r"(?:An? )?(?:honourable )?[Mm]embers?\s*(?:interjecting|interrupting)",
    re.I
)


def analyze_interjections(db) -> dict:
    """Analyze who gets interrupted and by whom."""
    # Speeches containing interjection markers
    speeches = db.execute("""
        SELECT s.speech_id, s.text, s.date, m.name, m.party, m.gender
        FROM speeches s
        JOIN members m ON s.member_id = m.member_id
        WHERE s.text LIKE '%interject%'
           OR s.text LIKE '%interrupt%'
           OR s.text LIKE '%Order!%'
    """).fetchall()

    interrupted_by_gender = defaultdict(int)
    interrupted_by_party = defaultdict(int)

    for speech in speeches:
        if INTERJECTION_PATTERN.search(speech["text"]):
            # The current speaker is being interrupted
            if speech["gender"]:
                interrupted_by_gender[speech["gender"]] += 1
            interrupted_by_party[speech["party"]] += 1

    return {
        "interrupted_by_gender": dict(interrupted_by_gender),
        "interrupted_by_party": dict(interrupted_by_party),
        "total_interjection_speeches": len(speeches),
    }


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--analysis", choices=["speaking-time", "gender-language", "interjections", "all"],
                        default="all")
    parser.add_argument("--year", type=str, default=None)
    args = parser.parse_args()

    db = get_db()
    init_db(db)

    if args.analysis in ("speaking-time", "all"):
        print("\n" + "="*60)
        print("SPEAKING TIME ANALYSIS")
        print("="*60)
        result = analyze_speaking_time(db, year=args.year)

        print("\nBy Party:")
        for r in result["by_party"]:
            hours = r["total_seconds"] / 3600 if r["total_seconds"] else 0
            print(f"  {r['party']:20s}: {r['speech_count']:6d} speeches, "
                  f"{r['total_words']:10d} words, {hours:7.1f}h, "
                  f"{r['n_members']} members")

        print("\nBy Gender:")
        for r in result["by_gender"]:
            hours = r["total_seconds"] / 3600 if r["total_seconds"] else 0
            print(f"  {r['gender'] or 'Unknown':5s}: {r['speech_count']:6d} speeches, "
                  f"{r['total_words']:10d} words, {hours:7.1f}h")

        # Cache
        db.execute("""
            INSERT OR REPLACE INTO analysis_cache
            (cache_key, analysis_type, result_json, params_json)
            VALUES (?, 'bias_speaking_time', ?, ?)
        """, (f"bias:speaking_time:{args.year}", json.dumps(result, default=str),
              json.dumps({"year": args.year})))
        db.commit()

    if args.analysis in ("gender-language", "all"):
        print("\n" + "="*60)
        print("GENDERED LANGUAGE ANALYSIS")
        print("="*60)
        result = analyze_gendered_language(db, year=args.year)
        print(f"Analyzed {result['total_speeches_analyzed']} speeches")
        for category, data in result["gendered_language"].items():
            print(f"\n  {category}:")
            print(f"    By male speakers: {data['M_speaker']}")
            print(f"    By female speakers: {data['F_speaker']}")

    if args.analysis in ("interjections", "all"):
        print("\n" + "="*60)
        print("INTERJECTION ANALYSIS")
        print("="*60)
        result = analyze_interjections(db)
        print(f"\nInterrupted by gender: {result['interrupted_by_gender']}")
        print(f"Interrupted by party: {result['interrupted_by_party']}")


if __name__ == "__main__":
    main()
