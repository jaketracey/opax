"""
parli.analysis.sentiment — Speech Sentiment Analysis

Tracks how the tone of speeches changes over time, by topic, and by speaker.

Two-tier approach:
  1. Fast: VADER-style rule-based sentiment (no model needed, runs on CPU instantly)
  2. Quality: Use the trained Hansard LLM or a small classifier for parliamentary
     language-aware sentiment (parliamentary language is weird — "I thank the
     honourable member" can be deeply sarcastic)

Key outputs:
  - Per-speech sentiment score (-1 to +1)
  - Sentiment toward specific topics over time
  - Sentiment toward opposing party leaders
  - "Toxicity index" — which MPs are most/least hostile in debate

Usage:
    python -m parli.analysis.sentiment                    # compute all
    python -m parli.analysis.sentiment --member "Dutton"  # one MP
    python -m parli.analysis.sentiment --topic climate    # one topic
"""

import json
import re
from collections import defaultdict

from parli.schema import get_db, init_db


# ── Rule-based sentiment for parliamentary language ────────────────────────

# Parliamentary-specific positive indicators
POSITIVE_PATTERNS = [
    (re.compile(r"\bI commend\b", re.I), 0.4),
    (re.compile(r"\bI welcome\b", re.I), 0.3),
    (re.compile(r"\bexcellent\b", re.I), 0.3),
    (re.compile(r"\bI congratulate\b", re.I), 0.3),
    (re.compile(r"\bI support\b", re.I), 0.2),
    (re.compile(r"\bwell done\b", re.I), 0.3),
    (re.compile(r"\bgreat achievement\b", re.I), 0.4),
    (re.compile(r"\bcollaboration\b", re.I), 0.2),
    (re.compile(r"\bbipartisan\b", re.I), 0.2),
    (re.compile(r"\bpositive\b", re.I), 0.1),
]

# Parliamentary-specific negative indicators
NEGATIVE_PATTERNS = [
    (re.compile(r"\bdismal failure\b", re.I), -0.5),
    (re.compile(r"\babsolute disgrace\b", re.I), -0.6),
    (re.compile(r"\bthe government has failed\b", re.I), -0.4),
    (re.compile(r"\bshame\b", re.I), -0.3),
    (re.compile(r"\bdeceptive\b", re.I), -0.4),
    (re.compile(r"\bmisled\b", re.I), -0.5),
    (re.compile(r"\bincompetent\b", re.I), -0.4),
    (re.compile(r"\breckless\b", re.I), -0.3),
    (re.compile(r"\bchaos\b", re.I), -0.3),
    (re.compile(r"\bbroken promise\b", re.I), -0.4),
    (re.compile(r"\bI oppose\b", re.I), -0.2),
    (re.compile(r"\bdangerous\b", re.I), -0.2),
    (re.compile(r"\bcorrupt\b", re.I), -0.5),
    (re.compile(r"\blie[sd]?\b", re.I), -0.5),
    (re.compile(r"\bwaste\b", re.I), -0.2),
]

# Sarcasm/ironic praise patterns (common in parliament)
SARCASM_PATTERNS = [
    re.compile(r"\bI thank the (?:honourable )?member for (?:his|her|their) (?:contribution|wisdom)", re.I),
    re.compile(r"\bthe (?:honourable )?member (?:opposite )?would know\b", re.I),
    re.compile(r"\bhow generous\b", re.I),
]


def compute_sentiment(text: str) -> float:
    """Compute sentiment score for a speech. Returns -1.0 to 1.0."""
    score = 0.0
    word_count = max(len(text.split()), 1)

    for pattern, weight in POSITIVE_PATTERNS:
        hits = len(pattern.findall(text))
        score += hits * weight

    for pattern, weight in NEGATIVE_PATTERNS:
        hits = len(pattern.findall(text))
        score += hits * weight  # weight is already negative

    # Sarcasm detection — flip positive indicators near sarcasm markers
    for pattern in SARCASM_PATTERNS:
        if pattern.search(text):
            score -= 0.2  # sarcasm indicates negative sentiment

    # Normalize by speech length (longer speeches accumulate more signal)
    normalized = score / (word_count / 200)  # per 200 words

    # Clamp to [-1, 1]
    return max(-1.0, min(1.0, normalized))


def compute_all_sentiment(db) -> int:
    """Compute and store sentiment for all speeches."""
    batch_size = 5000
    offset = 0
    total = 0

    while True:
        speeches = db.execute("""
            SELECT speech_id, text FROM speeches
            WHERE sentiment_score IS NULL
            ORDER BY speech_id
            LIMIT ? OFFSET ?
        """, (batch_size, offset)).fetchall()

        if not speeches:
            break

        for speech in speeches:
            score = compute_sentiment(speech["text"])
            db.execute(
                "UPDATE speeches SET sentiment_score = ? WHERE speech_id = ?",
                (round(score, 4), speech["speech_id"])
            )
            total += 1

        db.commit()
        offset += batch_size
        print(f"  Scored {total} speeches")

    return total


def sentiment_over_time(db, topic: str | None = None) -> dict:
    """Track average sentiment per month, optionally filtered by topic."""
    if topic:
        rows = db.execute("""
            SELECT strftime('%Y-%m', s.date) as month,
                   AVG(s.sentiment_score) as avg_sentiment,
                   COUNT(*) as n_speeches
            FROM speeches s
            JOIN speech_topics st ON s.speech_id = st.speech_id
            JOIN topics t ON st.topic_id = t.topic_id
            WHERE t.name = ? AND s.sentiment_score IS NOT NULL
            GROUP BY month
            ORDER BY month
        """, (topic,)).fetchall()
    else:
        rows = db.execute("""
            SELECT strftime('%Y-%m', s.date) as month,
                   AVG(s.sentiment_score) as avg_sentiment,
                   COUNT(*) as n_speeches
            FROM speeches s
            WHERE s.sentiment_score IS NOT NULL
            GROUP BY month
            ORDER BY month
        """).fetchall()

    return [dict(r) for r in rows]


def toxicity_ranking(db) -> list[dict]:
    """Rank MPs by average negativity in their speeches."""
    rows = db.execute("""
        SELECT m.name, m.party,
               AVG(s.sentiment_score) as avg_sentiment,
               MIN(s.sentiment_score) as min_sentiment,
               COUNT(*) as n_speeches
        FROM speeches s
        JOIN members m ON s.member_id = m.member_id
        WHERE s.sentiment_score IS NOT NULL
        GROUP BY m.member_id
        HAVING n_speeches >= 10
        ORDER BY avg_sentiment ASC
        LIMIT 30
    """).fetchall()
    return [dict(r) for r in rows]


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--member", type=str, default=None)
    parser.add_argument("--topic", type=str, default=None)
    args = parser.parse_args()

    db = get_db()
    init_db(db)

    print("Computing sentiment scores...")
    n = compute_all_sentiment(db)
    print(f"Scored {n} speeches\n")

    if args.topic:
        print(f"Sentiment over time for topic: {args.topic}")
        series = sentiment_over_time(db, topic=args.topic)
        for entry in series[-12:]:
            bar_len = int((entry["avg_sentiment"] + 1) * 25)  # 0-50 scale
            bar = "+" * bar_len if entry["avg_sentiment"] >= 0 else "-" * (50 - bar_len)
            print(f"  {entry['month']}: {entry['avg_sentiment']:+.3f} ({entry['n_speeches']} speeches) {bar}")

    print("\nMost hostile MPs (lowest average sentiment):")
    ranking = toxicity_ranking(db)
    for r in ranking[:15]:
        print(f"  {r['name']:30s} ({r['party']:15s}): avg={r['avg_sentiment']:+.3f} "
              f"min={r['min_sentiment']:+.3f} ({r['n_speeches']} speeches)")


if __name__ == "__main__":
    main()
