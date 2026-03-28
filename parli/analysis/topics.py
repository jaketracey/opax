"""
parli.analysis.topics — Topic Tracking and Classification

Classifies speeches into topics and tracks their rise/fall over time.

Method:
  1. Define seed topics with keywords + example phrases
  2. Embed seed phrases to create topic centroids
  3. Classify each speech by cosine similarity to centroids (multi-label)
  4. Also use keyword matching as a fast baseline
  5. Track topic prevalence over time (monthly/quarterly buckets)

Output:
  - topic assignments for each speech (speech_topics table)
  - time series of topic prevalence
  - which MPs/parties are driving each topic

Usage:
    python -m parli.analysis.topics                # classify all speeches
    python -m parli.analysis.topics --track         # generate time series
    python -m parli.analysis.topics --discover      # auto-discover topics via clustering
"""

import json
import re
import time
from collections import defaultdict

import numpy as np

from parli.schema import get_db, init_db


def _commit_with_retry(db, max_retries=10, delay=2.0):
    """Commit with retries to handle transient database locks."""
    for attempt in range(max_retries):
        try:
            db.commit()
            return
        except Exception as e:
            if "locked" in str(e) and attempt < max_retries - 1:
                time.sleep(delay)
            else:
                raise

# ── Seed topic definitions ─────────────────────────────────────────────────

SEED_TOPICS = {
    "climate": {
        "display_name": "Climate Change",
        "keywords": ["climate", "emissions", "renewable", "carbon", "net zero",
                      "paris agreement", "coal", "solar", "wind farm", "global warming",
                      "greenhouse", "environment"],
        "seed_phrases": [
            "climate change is an existential threat",
            "we must reduce carbon emissions",
            "renewable energy transition",
            "the coal industry and mining jobs",
        ],
    },
    "housing": {
        "display_name": "Housing Affordability",
        "keywords": ["housing", "rent", "mortgage", "home ownership", "first home buyer",
                      "negative gearing", "capital gains", "affordable housing",
                      "homelessness", "property"],
        "seed_phrases": [
            "young Australians cannot afford to buy a home",
            "housing affordability crisis",
            "rental market and cost of living",
            "negative gearing and capital gains tax",
        ],
    },
    "immigration": {
        "display_name": "Immigration",
        "keywords": ["immigration", "migration", "visa", "refugee", "asylum",
                      "border", "citizenship", "multicultural", "intake",
                      "detention", "skilled worker"],
        "seed_phrases": [
            "immigration levels and population growth",
            "refugee and asylum seeker policy",
            "skilled migration program",
            "border protection and national security",
        ],
    },
    "cost_of_living": {
        "display_name": "Cost of Living",
        "keywords": ["cost of living", "inflation", "grocery", "petrol", "energy price",
                      "wage", "poverty", "welfare", "pension", "jobseeker",
                      "interest rate", "household budget"],
        "seed_phrases": [
            "families are struggling with the cost of living",
            "rising grocery and energy prices",
            "wage growth has not kept pace with inflation",
            "interest rate rises are hurting mortgage holders",
        ],
    },
    "health": {
        "display_name": "Health",
        "keywords": ["health", "hospital", "medicare", "doctor", "nurse",
                      "mental health", "bulk billing", "pharmaceutical",
                      "aged care", "disability", "ndis"],
        "seed_phrases": [
            "our public hospital system is under strain",
            "medicare and bulk billing",
            "mental health crisis",
            "aged care quality and funding",
        ],
    },
    "education": {
        "display_name": "Education",
        "keywords": ["education", "school", "university", "student", "teacher",
                      "TAFE", "HECS", "curriculum", "literacy", "childcare"],
        "seed_phrases": [
            "funding for public schools",
            "university fee reform and HECS debt",
            "childcare is too expensive for families",
            "teacher workforce shortage",
        ],
    },
    "economy": {
        "display_name": "Economy & Budget",
        "keywords": ["economy", "budget", "deficit", "surplus", "GDP", "tax",
                      "fiscal", "debt", "productivity", "trade", "employment",
                      "unemployment", "jobs"],
        "seed_phrases": [
            "the economy is growing and creating jobs",
            "budget deficit and national debt",
            "tax reform and fairness",
            "trade policy and export markets",
        ],
    },
    "security": {
        "display_name": "National Security & Defence",
        "keywords": ["defence", "defense", "military", "security", "AUKUS",
                      "China", "Pacific", "intelligence", "cyber", "terrorism",
                      "submarine", "ADF"],
        "seed_phrases": [
            "national security and defence spending",
            "AUKUS submarine partnership",
            "strategic competition in the Indo-Pacific",
            "cyber security threats",
        ],
    },
    "indigenous": {
        "display_name": "Indigenous Affairs",
        "keywords": ["indigenous", "Aboriginal", "Torres Strait", "First Nations",
                      "Voice", "referendum", "reconciliation", "Closing the Gap",
                      "native title", "Uluru Statement"],
        "seed_phrases": [
            "the Voice to Parliament referendum",
            "Closing the Gap targets",
            "reconciliation with First Nations peoples",
            "Aboriginal and Torres Strait Islander communities",
        ],
    },
    "technology": {
        "display_name": "Technology & Digital",
        "keywords": ["technology", "digital", "AI", "artificial intelligence",
                      "social media", "privacy", "data", "NBN", "broadband",
                      "automation", "misinformation"],
        "seed_phrases": [
            "artificial intelligence regulation",
            "social media and misinformation",
            "digital economy and technology policy",
            "data privacy and online safety",
        ],
    },
}


def classify_speech_keywords(text: str) -> list[tuple[str, float]]:
    """Classify a speech by keyword matching. Returns [(topic_name, score)]."""
    text_lower = text.lower()
    results = []

    for topic_name, topic_def in SEED_TOPICS.items():
        hits = 0
        for kw in topic_def["keywords"]:
            count = text_lower.count(kw.lower())
            hits += count

        if hits > 0:
            # Normalize by text length to avoid bias toward longer speeches
            word_count = max(len(text.split()), 1)
            relevance = min(1.0, hits / (word_count / 100))  # hits per 100 words
            results.append((topic_name, round(relevance, 3)))

    return results


def classify_all_speeches(db):
    """Classify all speeches by topic using keyword matching."""
    # Ensure topics exist in DB
    for topic_name, topic_def in SEED_TOPICS.items():
        db.execute("""
            INSERT OR IGNORE INTO topics (name, keywords)
            VALUES (?, ?)
        """, (topic_name, json.dumps(topic_def["keywords"])))
    _commit_with_retry(db)

    # Get topic IDs
    topic_ids = {}
    for row in db.execute("SELECT topic_id, name FROM topics").fetchall():
        topic_ids[row["name"]] = row["topic_id"]

    # Classify speeches in batches
    batch_size = 5000
    offset = 0
    total_assigned = 0

    while True:
        speeches = db.execute("""
            SELECT speech_id, text FROM speeches
            ORDER BY speech_id
            LIMIT ? OFFSET ?
        """, (batch_size, offset)).fetchall()

        if not speeches:
            break

        for speech in speeches:
            topics = classify_speech_keywords(speech["text"])
            for topic_name, relevance in topics:
                if relevance >= 0.01:  # minimum threshold
                    topic_id = topic_ids.get(topic_name)
                    if topic_id:
                        for _attempt in range(5):
                            try:
                                db.execute("""
                                    INSERT OR REPLACE INTO speech_topics
                                    (speech_id, topic_id, relevance)
                                    VALUES (?, ?, ?)
                                """, (speech["speech_id"], topic_id, relevance))
                                break
                            except Exception as e:
                                if "locked" in str(e) and _attempt < 4:
                                    time.sleep(1)
                                else:
                                    raise
                        total_assigned += 1

        _commit_with_retry(db)
        offset += batch_size
        print(f"  Classified {offset} speeches, {total_assigned} topic assignments so far")

    return total_assigned


def generate_time_series(db) -> dict:
    """Generate monthly topic prevalence time series."""
    rows = db.execute("""
        SELECT strftime('%Y-%m', s.date) as month,
               t.name as topic,
               COUNT(*) as speech_count,
               AVG(st.relevance) as avg_relevance
        FROM speech_topics st
        JOIN speeches s ON st.speech_id = s.speech_id
        JOIN topics t ON st.topic_id = t.topic_id
        GROUP BY month, topic
        ORDER BY month, topic
    """).fetchall()

    # Reshape into {topic: [(month, count, avg_relevance), ...]}
    series = defaultdict(list)
    for r in rows:
        series[r["topic"]].append({
            "month": r["month"],
            "count": r["speech_count"],
            "avg_relevance": round(r["avg_relevance"], 3),
        })

    return dict(series)


def topic_by_party(db) -> dict:
    """Which parties drive which topics."""
    rows = db.execute("""
        SELECT t.name as topic, m.party,
               COUNT(*) as speech_count,
               SUM(s.word_count) as total_words
        FROM speech_topics st
        JOIN speeches s ON st.speech_id = s.speech_id
        JOIN topics t ON st.topic_id = t.topic_id
        JOIN members m ON s.member_id = m.member_id
        WHERE st.relevance >= 0.05
        GROUP BY topic, m.party
        ORDER BY topic, total_words DESC
    """).fetchall()

    result = defaultdict(list)
    for r in rows:
        result[r["topic"]].append({
            "party": r["party"],
            "speech_count": r["speech_count"],
            "total_words": r["total_words"],
        })
    return dict(result)


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--track", action="store_true", help="Generate time series")
    parser.add_argument("--discover", action="store_true", help="Auto-discover topics")
    args = parser.parse_args()

    db = get_db()
    init_db(db)

    if not args.track:
        print("Classifying speeches by topic...")
        n = classify_all_speeches(db)
        print(f"Assigned {n} topic labels")

    if args.track:
        print("\nGenerating topic time series...")
        series = generate_time_series(db)
        for topic, data in sorted(series.items()):
            print(f"\n  {topic}:")
            for entry in data[-6:]:  # last 6 months
                bar = "#" * min(50, entry["count"] // 5)
                print(f"    {entry['month']}: {entry['count']:4d} speeches {bar}")

        print("\nTopic by party:")
        party_data = topic_by_party(db)
        for topic, parties in sorted(party_data.items()):
            print(f"\n  {topic}:")
            for p in parties[:5]:
                print(f"    {p['party']:20s}: {p['speech_count']:5d} speeches, "
                      f"{p['total_words']:8d} words")

        # Cache results
        db.execute("""
            INSERT OR REPLACE INTO analysis_cache
            (cache_key, analysis_type, result_json)
            VALUES ('topics:time_series', 'topic_tracking', ?)
        """, (json.dumps({"time_series": series, "by_party": party_data}, default=str),))
        db.commit()


if __name__ == "__main__":
    main()
