"""
parli.ingest.abc_news -- Fetch ABC News Australia articles via Algolia search.

ABC News uses Algolia for their search backend. The public API key is embedded
in their search page at abc.net.au/news/search/. We use this to query for
political articles on key topics.

Usage:
    python -m parli.ingest.abc_news --topic gambling --limit 100
    python -m parli.ingest.abc_news --all-topics --limit 200
    python -m parli.ingest.abc_news --query "NACC inquiry" --limit 50
"""

import argparse
import time

import requests

from parli.schema import get_db, init_db

# ABC's public Algolia credentials (embedded in their search page JS)
ALGOLIA_APP_ID = "Y63Q32NVDL"
ALGOLIA_API_KEY = "bcdf11ba901b780dc3c0a3ca677fbefc"
ALGOLIA_INDEX = "ABC_production_all"
ALGOLIA_URL = f"https://{ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/{ALGOLIA_INDEX}/query"

ALGOLIA_HEADERS = {
    "X-Algolia-Application-Id": ALGOLIA_APP_ID,
    "X-Algolia-API-Key": ALGOLIA_API_KEY,
    "Content-Type": "application/json",
}

SESSION = requests.Session()
SESSION.headers.update(ALGOLIA_HEADERS)

# Topics and their search queries -- tuned for Australian political coverage
# Each topic maps to a list of sub-queries.  Algolia treats multi-word input
# as AND-ish (requiring proximity), so we issue separate short queries per
# topic and deduplicate by article ID.
TOPIC_QUERIES: dict[str, list[str]] = {
    "gambling": ["gambling", "pokies", "poker machines", "betting reform", "wagering"],
    "housing": ["housing crisis", "affordable housing", "rent crisis", "homelessness"],
    "climate": ["climate change", "emissions reduction", "renewable energy", "net zero"],
    "corruption": ["corruption", "ICAC", "NACC", "integrity commission"],
    "mining": ["mining lobby", "coal exports", "gas industry"],
    "cost_of_living": ["cost of living", "grocery prices", "energy bills"],
    "political_donations": ["political donations", "campaign finance", "dark money"],
    "lobbying": ["lobbyist", "lobbying", "revolving door"],
    "government_contracts": ["government contracts", "procurement", "outsourcing"],
    "pork_barreling": ["pork barrelling", "grants rorts", "sports rorts"],
}

BATCH_SIZE = 200


def _parse_hit(h: dict) -> dict:
    """Parse a single Algolia hit into our article dict."""
    dates = h.get("dates", {})
    published = dates.get("published", "")
    if published:
        published = published[:10]  # YYYY-MM-DD

    subjects = h.get("_embedded", {}).get("subjects", [])
    subject_names = [s.get("canonicalURI", "") for s in subjects if isinstance(s, dict)]

    article_id = f"abc-{h.get('id', h.get('objectID', ''))}"

    synopsis = h.get("synopsis", "") or h.get("synopsisAlt", "") or ""
    ml_summary = h.get("ml_summary", "") or ""
    body_text = synopsis
    if ml_summary and ml_summary not in synopsis:
        body_text = f"{synopsis}\n\n{ml_summary}"

    return {
        "article_id": article_id,
        "title": h.get("title", ""),
        "date": published,
        "section": ", ".join(subject_names[:3]) if subject_names else "news",
        "url": h.get("canonicalURL", ""),
        "body_text": body_text,
        "source": "abc",
    }


def fetch_articles(
    topic: str | None = None,
    query: str | None = None,
    limit: int = 100,
) -> list[dict]:
    """Fetch articles from ABC News via Algolia search.

    When *topic* is given, issues one Algolia query per sub-query defined in
    TOPIC_QUERIES and deduplicates by article_id.  When *query* is given,
    a single search is performed.

    Args:
        topic: One of TOPIC_QUERIES keys, or None if query is provided.
        query: Custom search query (overrides topic).
        limit: Maximum number of articles to fetch.

    Returns:
        List of parsed article dicts.
    """
    if query is not None:
        sub_queries = [query]
    elif topic and topic in TOPIC_QUERIES:
        sub_queries = TOPIC_QUERIES[topic]
    else:
        raise ValueError(
            f"Must provide topic ({list(TOPIC_QUERIES.keys())}) or query"
        )

    seen_ids: set[str] = set()
    all_articles: list[dict] = []

    for sq in sub_queries:
        if len(all_articles) >= limit:
            break

        remaining = limit - len(all_articles)
        page = 0
        hits_per_page = min(remaining, 50)

        print(f"  Searching ABC News for: {sq}")

        while len(all_articles) < limit:
            payload = {
                "params": (
                    f"query={requests.utils.quote(sq)}"
                    f"&hitsPerPage={hits_per_page}"
                    f"&page={page}"
                    f"&filters=docType:Article"
                )
            }

            try:
                resp = SESSION.post(ALGOLIA_URL, json=payload, timeout=30)
                resp.raise_for_status()
            except requests.RequestException as e:
                print(f"    API error on page {page}: {e}")
                break

            data = resp.json()
            hits = data.get("hits", [])
            nb_hits = data.get("nbHits", 0)
            nb_pages = data.get("nbPages", 0)

            if not hits:
                break

            new_count = 0
            for h in hits:
                article = _parse_hit(h)
                if article["article_id"] not in seen_ids:
                    seen_ids.add(article["article_id"])
                    all_articles.append(article)
                    new_count += 1

            if page == 0:
                print(f"    {nb_hits} total results ({nb_pages} pages)")

            print(f"    Page {page}: +{new_count} new (total: {len(all_articles)})")

            if page + 1 >= nb_pages or len(all_articles) >= limit:
                break

            page += 1
            time.sleep(0.3)

    return all_articles[:limit]


def load_articles(articles: list[dict], db=None) -> int:
    """Insert articles into the database. Returns count of new articles inserted."""
    if db is None:
        db = get_db()
    init_db(db)

    inserted = 0
    for i in range(0, len(articles), BATCH_SIZE):
        batch = articles[i : i + BATCH_SIZE]
        for a in batch:
            try:
                db.execute(
                    """
                    INSERT OR IGNORE INTO news_articles
                    (article_id, title, date, section, url, body_text, source)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        a["article_id"],
                        a["title"],
                        a["date"],
                        a["section"],
                        a["url"],
                        a["body_text"],
                        a["source"],
                    ),
                )
                inserted += 1
            except Exception as e:
                print(f"  Error inserting {a['article_id']}: {e}")
        db.commit()

    # Rebuild FTS index
    try:
        db.execute(
            "INSERT INTO news_articles_fts(news_articles_fts) VALUES('rebuild')"
        )
        db.commit()
    except Exception as e:
        print(f"  FTS rebuild note: {e}")

    return inserted


def main():
    parser = argparse.ArgumentParser(
        description="Fetch ABC News Australia articles into parli.db"
    )
    parser.add_argument(
        "--topic",
        type=str,
        choices=list(TOPIC_QUERIES.keys()),
        help="Topic to search for",
    )
    parser.add_argument(
        "--query", type=str, default=None,
        help="Custom search query (overrides --topic)",
    )
    parser.add_argument(
        "--limit", type=int, default=100,
        help="Maximum articles to fetch per topic (default: 100)",
    )
    parser.add_argument(
        "--all-topics", action="store_true",
        help="Fetch articles for all predefined topics",
    )
    args = parser.parse_args()

    print("=== ABC News Australia Ingestion (via Algolia) ===")

    db = get_db()
    init_db(db)

    if args.all_topics:
        topics = list(TOPIC_QUERIES.keys())
    elif args.topic:
        topics = [args.topic]
    elif args.query:
        topics = [None]
    else:
        parser.error("Must specify --topic, --query, or --all-topics")
        return

    total_inserted = 0

    for topic in topics:
        if topic:
            print(f"\n--- Topic: {topic} ---")
        articles = fetch_articles(
            topic=topic,
            query=args.query if topic is None else None,
            limit=args.limit,
        )
        print(f"Fetched {len(articles)} articles")

        if articles:
            inserted = load_articles(articles, db)
            total_inserted += inserted
            print(f"Inserted {inserted} new articles")

    total = db.execute("SELECT COUNT(*) FROM news_articles").fetchone()[0]
    abc_total = db.execute(
        "SELECT COUNT(*) FROM news_articles WHERE source='abc'"
    ).fetchone()[0]
    print(f"\nTotal articles in database: {total}")
    print(f"  ABC News: {abc_total}")
    print(f"New articles inserted this run: {total_inserted}")


if __name__ == "__main__":
    main()
