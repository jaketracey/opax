#!/usr/bin/env python3
"""
Classify ALL unclassified speeches into topics using keyword matching
against the topics table in parli.db.

Reads topic keywords from the DB, matches against speech text, and inserts
results into speech_topics with relevance scores.

Covers all sources: federal Hansard, state parliaments, committee hearings, etc.
"""

import re
import sqlite3
import time
from pathlib import Path

DB_PATH = Path("~/.cache/autoresearch/parli.db").expanduser()
# No longer filtering by source — classify ALL unclassified speeches
BATCH_SIZE = 5000
MIN_RELEVANCE = 0.01


def get_db():
    db = sqlite3.connect(str(DB_PATH), timeout=120)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode = WAL")
    db.execute("PRAGMA busy_timeout = 300000")
    return db


def commit_with_retry(db, max_retries=10, delay=2.0):
    for attempt in range(max_retries):
        try:
            db.commit()
            return
        except sqlite3.OperationalError as e:
            if "locked" in str(e) and attempt < max_retries - 1:
                print(f"    DB locked on commit, retry {attempt+1}/{max_retries}...")
                time.sleep(delay)
            else:
                raise


def load_topics(db):
    """Load all topics with their keywords from the DB."""
    topics = {}
    for row in db.execute("SELECT topic_id, name, keywords FROM topics").fetchall():
        kw_str = row["keywords"]
        # Keywords may be stored as JSON list or comma-separated string
        if kw_str.startswith("["):
            import json
            keywords = [k.lower() for k in json.loads(kw_str)]
        else:
            keywords = [k.strip().lower() for k in kw_str.split(",") if k.strip()]
        topics[row["topic_id"]] = {
            "name": row["name"],
            "keywords": keywords,
        }
    return topics


def classify_speech(text_lower, word_count, topics):
    """Classify a single speech. Returns [(topic_id, relevance), ...]."""
    results = []
    for topic_id, tdef in topics.items():
        hits = 0
        for kw in tdef["keywords"]:
            hits += text_lower.count(kw)
        if hits > 0:
            # Normalize: hits per 100 words
            relevance = min(1.0, hits / (max(word_count, 1) / 100))
            if relevance >= MIN_RELEVANCE:
                results.append((topic_id, round(relevance, 3)))
    return results


def main():
    db = get_db()

    # Load topics
    topics = load_topics(db)
    print(f"Loaded {len(topics)} topics from DB:")
    for tid, tdef in sorted(topics.items()):
        print(f"  [{tid}] {tdef['name']}: {len(tdef['keywords'])} keywords")

    # Get all unclassified speech IDs upfront, then process in batches
    print("Fetching unclassified speech IDs...")
    unclassified_ids = [row[0] for row in db.execute("""
        SELECT s.speech_id FROM speeches s
        WHERE NOT EXISTS (
            SELECT 1 FROM speech_topics st WHERE st.speech_id = s.speech_id
        )
        ORDER BY s.speech_id
    """).fetchall()]
    total = len(unclassified_ids)
    print(f"Fetched {total} unclassified speech IDs.")

    if total == 0:
        print("Nothing to do.")
        return

    total_assigned = 0
    total_processed = 0
    batch_num = 0
    start_time = time.time()

    for batch_start in range(0, total, BATCH_SIZE):
        batch_ids = unclassified_ids[batch_start:batch_start + BATCH_SIZE]
        placeholders = ",".join("?" for _ in batch_ids)
        speeches = db.execute(f"""
            SELECT speech_id, text, word_count FROM speeches
            WHERE speech_id IN ({placeholders})
        """, batch_ids).fetchall()

        batch_num += 1
        batch_assigned = 0

        for speech in speeches:
            text = speech["text"] or ""
            text_lower = text.lower()
            wc = speech["word_count"] or len(text.split())

            assignments = classify_speech(text_lower, wc, topics)
            for topic_id, relevance in assignments:
                for _attempt in range(5):
                    try:
                        db.execute(
                            "INSERT OR IGNORE INTO speech_topics (speech_id, topic_id, relevance) VALUES (?, ?, ?)",
                            (speech["speech_id"], topic_id, relevance),
                        )
                        break
                    except sqlite3.OperationalError as e:
                        if "locked" in str(e) and _attempt < 4:
                            time.sleep(1)
                        else:
                            raise
                batch_assigned += 1

        commit_with_retry(db)
        total_assigned += batch_assigned
        total_processed += len(speeches)

        elapsed = time.time() - start_time
        rate = total_processed / elapsed if elapsed > 0 else 0
        remaining = (total - total_processed) / rate if rate > 0 else 0
        print(
            f"  Batch {batch_num}: processed {total_processed}/{total} speeches, "
            f"{total_assigned} topic assignments, "
            f"{rate:.0f} speeches/sec, ~{remaining:.0f}s remaining"
        )

    elapsed = time.time() - start_time
    print(f"\nDone! Processed {total_processed} speeches in {elapsed:.1f}s")
    print(f"Total topic assignments: {total_assigned}")

    # Summary by topic (all sources)
    print("\n=== Total assignments by topic (all sources) ===")
    for tid, tdef in sorted(topics.items()):
        cnt = db.execute(
            "SELECT COUNT(*) FROM speech_topics WHERE topic_id = ?", (tid,)
        ).fetchone()[0]
        if cnt > 0:
            print(f"  {tdef['name']:25s}: {cnt:6d}")

    # Summary by source
    print("\n=== Classified speeches by source ===")
    sources = db.execute(
        "SELECT DISTINCT source FROM speeches ORDER BY source"
    ).fetchall()
    for row in sources:
        src = row["source"]
        classified = db.execute("""
            SELECT COUNT(DISTINCT s.speech_id) FROM speeches s
            JOIN speech_topics st ON s.speech_id = st.speech_id
            WHERE s.source = ?
        """, (src,)).fetchone()[0]
        total_src = db.execute("SELECT COUNT(*) FROM speeches WHERE source = ?", (src,)).fetchone()[0]
        print(f"  {src}: {classified}/{total_src} classified")


if __name__ == "__main__":
    main()
