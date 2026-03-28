"""
parli.ingest.news_crossref -- Cross-reference news articles with MPs and donors.

For each news article:
  1. Check if any MP names are mentioned in the title or body text.
  2. Check if any company/donor names appear in the article.
  3. Store matches in analysis_cache as JSON.

Usage:
    python -m parli.ingest.news_crossref
    python -m parli.ingest.news_crossref --limit 500
    python -m parli.ingest.news_crossref --rebuild
"""

import argparse
import json
import re
import time

from parli.schema import get_db, init_db


def build_mp_lookup(db) -> list[dict]:
    """Build a list of member records with pre-compiled match patterns.

    We match on full name (e.g. "Anthony Albanese") using word-boundary regex.
    """
    rows = db.execute(
        "SELECT person_id, full_name, first_name, last_name, party, electorate "
        "FROM members WHERE full_name IS NOT NULL AND first_name IS NOT NULL "
        "AND last_name IS NOT NULL AND length(last_name) >= 3 AND length(first_name) >= 3"
    ).fetchall()

    members = []
    for r in rows:
        full = (r[1] or "").strip()
        first = (r[2] or "").strip()
        last = (r[3] or "").strip()
        if not full or not first or not last:
            continue
        # Compile regex for "FirstName LastName" with word boundaries
        pattern = re.compile(
            r"\b" + re.escape(first.lower()) + r"\b.*?\b" + re.escape(last.lower()) + r"\b"
        )
        members.append({
            "person_id": r[0],
            "full_name": full,
            "first_name": first,
            "last_name": last,
            "party": r[4] or "",
            "electorate": r[5] or "",
            "pattern": pattern,
        })

    return members


def build_donor_lookup(db) -> list[dict]:
    """Build list of top donors with pre-compiled match patterns.

    We focus on large organisation donors and match on their distinctive
    multi-word names (e.g. "Tabcorp", "Crown Resorts").
    """
    rows = db.execute(
        """
        SELECT donor_name, recipient, SUM(amount) as total_amount, industry
        FROM donations
        WHERE amount > 50000
        GROUP BY donor_name
        ORDER BY total_amount DESC
        LIMIT 2000
        """
    ).fetchall()

    donors = []
    # Common words to strip
    STOP = {
        "pty", "ltd", "limited", "inc", "incorporated", "trust", "holdings",
        "group", "australia", "australian", "international", "services", "the",
        "of", "and", "for", "branch", "national", "office", "union", "state",
        "government", "new", "south", "wales", "victoria", "queensland",
        "western", "northern", "territory", "from", "account", "transfer",
        "parliament", "community", "prime", "minister", "cabinet", "department",
        "independent", "candidate", "workers", "industry", "council", "federal",
        "north", "south", "east", "west", "sydney", "melbourne", "brisbane",
        "adelaide", "perth", "hobart", "darwin", "canberra", "party", "labor",
        "liberal", "greens", "employees", "education", "training", "health",
        "transport", "local", "council", "development", "management", "fund",
        "united", "association", "foundation", "society",
    }

    for r in rows:
        donor_name = r[0] or ""
        if len(donor_name) < 6:
            continue
        # Extract distinctive words
        clean = donor_name.lower()
        words = [w for w in re.findall(r"[a-z]+", clean) if w not in STOP and len(w) >= 5]
        if not words:
            continue
        # Use the most distinctive word (longest) for initial screening
        screen_word = max(words, key=len)
        if len(screen_word) < 5:
            continue
        donors.append({
            "donor_name": donor_name,
            "recipient": r[1] or "",
            "total_amount": r[2] or 0,
            "industry": r[3] or "",
            "screen_word": screen_word,
            "match_words": words,
        })

    return donors


def build_contract_lookup(db) -> list[dict]:
    """Build list of top contractors with pre-compiled match patterns."""
    rows = db.execute(
        """
        SELECT supplier_name, agency, SUM(amount) as total_amount,
               COUNT(*) as num_contracts
        FROM contracts
        WHERE amount > 100000
        GROUP BY supplier_name
        ORDER BY total_amount DESC
        LIMIT 1000
        """
    ).fetchall()

    STOP = {
        "pty", "ltd", "limited", "inc", "incorporated", "trust", "holdings",
        "group", "australia", "australian", "international", "services", "the",
        "of", "and", "for", "department", "government", "national", "federal",
        "state", "council", "management", "consulting", "solutions", "global",
        "corporate", "travel", "employment", "technology", "systems", "defence",
    }

    contractors = []
    for r in rows:
        supplier = r[0] or ""
        if len(supplier) < 6:
            continue
        clean = supplier.lower()
        words = [w for w in re.findall(r"[a-z]+", clean) if w not in STOP and len(w) >= 5]
        if not words:
            continue
        screen_word = max(words, key=len)
        if len(screen_word) < 5:
            continue
        contractors.append({
            "supplier_name": supplier,
            "agency": r[1] or "",
            "total_amount": r[2] or 0,
            "num_contracts": r[3] or 0,
            "screen_word": screen_word,
            "match_words": words,
        })

    return contractors


def match_article(
    article: dict,
    mp_list: list[dict],
    donor_list: list[dict],
    contract_list: list[dict],
) -> dict:
    """Find MPs, donors, and contracts mentioned in a news article.

    Returns dict with lists of matched entities.
    """
    title = (article["title"] or "").lower()
    body = (article["body_text"] or "").lower()
    text = f"{title} {body}"

    # --- Match MPs (require "FirstName ... LastName" pattern) ---
    matched_mps = []
    seen_mp_ids = set()
    for m in mp_list:
        if m["person_id"] in seen_mp_ids:
            continue
        # Quick screen: last name must appear as a word
        if m["last_name"].lower() not in text:
            continue
        if m["pattern"].search(text):
            matched_mps.append({
                "person_id": m["person_id"],
                "full_name": m["full_name"],
                "party": m["party"],
            })
            seen_mp_ids.add(m["person_id"])

    # --- Match donors (require distinctive keyword + at least 2 word matches) ---
    matched_donors = []
    seen_donors = set()
    for d in donor_list:
        if d["donor_name"] in seen_donors:
            continue
        if d["screen_word"] not in text:
            continue
        match_count = sum(1 for w in d["match_words"] if w in text)
        # Need at least 2 matching words, or 1 very distinctive word (8+ chars)
        if match_count >= 2 or (len(d["match_words"]) == 1 and len(d["screen_word"]) >= 8):
            matched_donors.append({
                "donor_name": d["donor_name"],
                "recipient": d["recipient"],
                "total_amount": d["total_amount"],
                "industry": d["industry"],
            })
            seen_donors.add(d["donor_name"])

    # --- Match contracts ---
    matched_contracts = []
    seen_suppliers = set()
    for c in contract_list:
        if c["supplier_name"] in seen_suppliers:
            continue
        if c["screen_word"] not in text:
            continue
        match_count = sum(1 for w in c["match_words"] if w in text)
        if match_count >= 2 or (len(c["match_words"]) == 1 and len(c["screen_word"]) >= 8):
            matched_contracts.append({
                "supplier_name": c["supplier_name"],
                "agency": c["agency"],
                "total_amount": c["total_amount"],
            })
            seen_suppliers.add(c["supplier_name"])

    return {
        "article_id": article["article_id"],
        "title": article["title"],
        "date": article["date"],
        "source": article["source"],
        "url": article["url"],
        "matched_mps": matched_mps,
        "matched_donors": matched_donors,
        "matched_contracts": matched_contracts,
    }


def crossref_all(db, limit: int = 0, rebuild: bool = False) -> dict:
    """Cross-reference all news articles with MPs, donors, and contracts.

    Stores results in analysis_cache with key 'news_crossref_{article_id}'.
    Returns summary stats.
    """
    print("Building lookup tables...")
    t0 = time.time()
    mp_list = build_mp_lookup(db)
    print(f"  MP list: {len(mp_list)} members with regex patterns")
    donor_list = build_donor_lookup(db)
    print(f"  Donor list: {len(donor_list)} top donors")
    contract_list = build_contract_lookup(db)
    print(f"  Contract list: {len(contract_list)} top contractors")
    print(f"  Built lookups in {time.time() - t0:.1f}s")

    # Fetch articles, optionally skipping already-processed ones
    if rebuild:
        query = "SELECT article_id, title, date, section, url, body_text, source FROM news_articles"
        params = ()
    else:
        query = """
            SELECT a.article_id, a.title, a.date, a.section, a.url, a.body_text, a.source
            FROM news_articles a
            WHERE NOT EXISTS (
                SELECT 1 FROM analysis_cache ac
                WHERE ac.key = 'news_crossref_' || a.article_id
            )
        """
        params = ()

    if limit:
        query += f" LIMIT {limit}"

    rows = db.execute(query, params).fetchall()
    print(f"\nProcessing {len(rows)} articles...")

    stats = {
        "total_articles": len(rows),
        "articles_with_mp_mentions": 0,
        "articles_with_donor_mentions": 0,
        "articles_with_contract_mentions": 0,
        "total_mp_mentions": 0,
        "total_donor_mentions": 0,
        "total_contract_mentions": 0,
        "mp_mention_counts": {},  # person_id -> count
        "donor_mention_counts": {},  # donor_name -> count
    }

    batch_size = 500
    for i, r in enumerate(rows):
        article = {
            "article_id": r[0],
            "title": r[1],
            "date": r[2],
            "section": r[3],
            "url": r[4],
            "body_text": r[5],
            "source": r[6],
        }

        result = match_article(article, mp_list, donor_list, contract_list)

        # Update stats
        if result["matched_mps"]:
            stats["articles_with_mp_mentions"] += 1
            stats["total_mp_mentions"] += len(result["matched_mps"])
            for mp in result["matched_mps"]:
                pid = mp["person_id"]
                stats["mp_mention_counts"][pid] = stats["mp_mention_counts"].get(pid, 0) + 1

        if result["matched_donors"]:
            stats["articles_with_donor_mentions"] += 1
            stats["total_donor_mentions"] += len(result["matched_donors"])
            for d in result["matched_donors"]:
                dn = d["donor_name"]
                stats["donor_mention_counts"][dn] = stats["donor_mention_counts"].get(dn, 0) + 1

        if result["matched_contracts"]:
            stats["articles_with_contract_mentions"] += 1
            stats["total_contract_mentions"] += len(result["matched_contracts"])

        # Store in analysis_cache (only if there are matches to save space)
        if result["matched_mps"] or result["matched_donors"] or result["matched_contracts"]:
            cache_key = f"news_crossref_{article['article_id']}"
            db.execute(
                """
                INSERT OR REPLACE INTO analysis_cache (key, value, updated_at)
                VALUES (?, ?, datetime('now'))
                """,
                (cache_key, json.dumps(result)),
            )

        if (i + 1) % batch_size == 0:
            db.commit()
            print(f"  Processed {i + 1}/{len(rows)} articles...")

    db.commit()

    # Store summary stats
    # Get top mentioned MPs
    top_mps = sorted(
        stats["mp_mention_counts"].items(), key=lambda x: x[1], reverse=True
    )[:50]
    top_mp_details = []
    for pid, count in top_mps:
        row = db.execute(
            "SELECT full_name, party FROM members WHERE person_id = ?", (pid,)
        ).fetchone()
        if row:
            top_mp_details.append({
                "person_id": pid,
                "full_name": row[0],
                "party": row[1],
                "article_count": count,
            })

    summary = {
        "total_articles_processed": stats["total_articles"],
        "articles_with_mp_mentions": stats["articles_with_mp_mentions"],
        "articles_with_donor_mentions": stats["articles_with_donor_mentions"],
        "articles_with_contract_mentions": stats["articles_with_contract_mentions"],
        "total_mp_mentions": stats["total_mp_mentions"],
        "total_donor_mentions": stats["total_donor_mentions"],
        "total_contract_mentions": stats["total_contract_mentions"],
        "top_mentioned_mps": top_mp_details,
        "top_mentioned_donors": sorted(
            [{"donor_name": k, "count": v} for k, v in stats["donor_mention_counts"].items()],
            key=lambda x: x["count"],
            reverse=True,
        )[:30],
    }

    db.execute(
        """
        INSERT OR REPLACE INTO analysis_cache (key, value, updated_at)
        VALUES ('news_crossref_summary', ?, datetime('now'))
        """,
        (json.dumps(summary),),
    )
    db.commit()

    return summary


def main():
    parser = argparse.ArgumentParser(
        description="Cross-reference news articles with MPs, donors, and contracts"
    )
    parser.add_argument(
        "--limit", type=int, default=0,
        help="Limit number of articles to process (0 = all)",
    )
    parser.add_argument(
        "--rebuild", action="store_true",
        help="Reprocess all articles (default: skip already processed)",
    )
    args = parser.parse_args()

    print("=== News Cross-Reference ===")

    db = get_db()
    init_db(db)

    summary = crossref_all(db, limit=args.limit, rebuild=args.rebuild)

    print(f"\n--- Summary ---")
    print(f"Articles processed: {summary['total_articles_processed']}")
    print(f"Articles mentioning MPs: {summary['articles_with_mp_mentions']}")
    print(f"Articles mentioning donors: {summary['articles_with_donor_mentions']}")
    print(f"Articles mentioning contractors: {summary['articles_with_contract_mentions']}")
    print(f"Total MP mentions: {summary['total_mp_mentions']}")
    print(f"Total donor mentions: {summary['total_donor_mentions']}")
    print(f"Total contract mentions: {summary['total_contract_mentions']}")

    print(f"\nTop mentioned MPs:")
    for mp in summary["top_mentioned_mps"][:15]:
        print(f"  {mp['full_name']} ({mp['party']}): {mp['article_count']} articles")

    print(f"\nTop mentioned donors:")
    for d in summary["top_mentioned_donors"][:10]:
        print(f"  {d['donor_name']}: {d['count']} articles")


if __name__ == "__main__":
    main()
