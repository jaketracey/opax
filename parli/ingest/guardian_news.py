"""
parli.ingest.guardian_news -- Fetch Australian politics articles from The Guardian.

Uses the Guardian Open Platform API to download articles about key policy
topics (gambling, housing, climate, corruption) for cross-referencing with
parliamentary speeches and donation data.

API docs: https://open-platform.theguardian.com/documentation/
Free tier allows limited access without a key; register for higher rate limits.

Usage:
    python -m parli.ingest.guardian_news --topic gambling --limit 100
    python -m parli.ingest.guardian_news --topic corruption --limit 200
    python -m parli.ingest.guardian_news --all-topics --limit 50
"""

import argparse
import os
import time

import requests

from parli.schema import get_db, init_db

API_BASE = "https://content.guardianapis.com/search"

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "OPAX/1.0 (parliamentary transparency research)"})

# Topics and their search queries — tuned for Australian political coverage
TOPIC_QUERIES = {
    "gambling": (
        "gambling OR pokies OR poker machines OR betting OR wagering OR casino"
    ),
    "housing": (
        "housing crisis OR affordable housing OR rent crisis OR homelessness OR property developers"
    ),
    "climate": (
        "climate change OR emissions OR renewable energy OR fossil fuels OR net zero"
    ),
    "corruption": (
        "corruption OR ICAC OR NACC OR integrity commission OR misconduct"
    ),
    "mining": (
        "mining lobby OR coal exports OR gas industry OR resources sector"
    ),
    "cost_of_living": (
        "cost of living OR grocery prices OR energy bills OR wages OR inflation"
    ),
    "political_donations": (
        "political donations OR campaign finance OR dark money OR donor influence OR fundraising"
    ),
    "lobbying": (
        "lobbyist OR lobbying OR influence peddling OR revolving door OR access"
    ),
    "government_contracts": (
        "government contracts OR procurement OR outsourcing OR consulting OR tender"
    ),
    "pork_barreling": (
        "pork barreling OR grants rorts OR sports rorts OR regional grants OR car park rorts"
    ),
}

BATCH_SIZE = 200


def fetch_articles(
    topic: str | None = None,
    query: str | None = None,
    limit: int = 100,
    api_key: str | None = None,
) -> list[dict]:
    """Fetch articles from the Guardian API.

    Args:
        topic: One of TOPIC_QUERIES keys, or None if query is provided.
        query: Custom search query (overrides topic).
        limit: Maximum number of articles to fetch.
        api_key: Guardian API key. Falls back to GUARDIAN_API_KEY env var or 'test'.

    Returns:
        List of parsed article dicts.
    """
    if query is None:
        if topic and topic in TOPIC_QUERIES:
            query = TOPIC_QUERIES[topic]
        else:
            raise ValueError(
                f"Must provide topic ({list(TOPIC_QUERIES.keys())}) or query"
            )

    api_key = api_key or os.environ.get("GUARDIAN_API_KEY", "test")

    all_articles = []
    page = 1
    page_size = min(limit, 50)  # API max page size is 50

    print(f"Searching Guardian for: {query}")

    while len(all_articles) < limit:
        params = {
            "q": query,
            "api-key": api_key,
            "page": page,
            "page-size": page_size,
            "show-fields": "bodyText,trailText",
            "section": "australia-news",
            "order-by": "newest",
        }

        try:
            resp = SESSION.get(API_BASE, params=params, timeout=30)
            resp.raise_for_status()
        except requests.RequestException as e:
            print(f"  API error on page {page}: {e}")
            break

        data = resp.json().get("response", {})
        results = data.get("results", [])
        total = data.get("total", 0)
        pages = data.get("pages", 0)

        if not results:
            break

        for r in results:
            fields = r.get("fields", {})
            all_articles.append({
                "article_id": r.get("id", ""),
                "title": r.get("webTitle", ""),
                "date": r.get("webPublicationDate", "")[:10],
                "section": r.get("sectionName", ""),
                "url": r.get("webUrl", ""),
                "body_text": fields.get("bodyText", ""),
            })

        if page == 1:
            print(f"  Found {total} total results ({pages} pages)")

        print(f"  Page {page}: {len(results)} articles (total fetched: {len(all_articles)})")

        if page >= pages:
            break

        page += 1
        # Rate limiting
        time.sleep(0.5)

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
                    (article_id, title, date, section, url, body_text)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        a["article_id"],
                        a["title"],
                        a["date"],
                        a["section"],
                        a["url"],
                        a["body_text"],
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
        description="Fetch Guardian Australia news articles into parli.db"
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
        help="Maximum articles to fetch (default: 100)",
    )
    parser.add_argument(
        "--all-topics", action="store_true",
        help="Fetch articles for all predefined topics",
    )
    parser.add_argument(
        "--api-key", type=str, default=None,
        help="Guardian API key (or set GUARDIAN_API_KEY env var)",
    )
    args = parser.parse_args()

    print("=== Guardian Australia News Ingestion ===")

    db = get_db()
    init_db(db)

    if args.all_topics:
        topics = list(TOPIC_QUERIES.keys())
    elif args.topic:
        topics = [args.topic]
    elif args.query:
        topics = [None]  # Will use custom query
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
            api_key=args.api_key,
        )
        print(f"Fetched {len(articles)} articles")

        if articles:
            inserted = load_articles(articles, db)
            total_inserted += inserted
            print(f"Inserted {inserted} new articles")

    total = db.execute("SELECT COUNT(*) FROM news_articles").fetchone()[0]
    print(f"\nTotal articles in database: {total}")
    print(f"New articles inserted this run: {total_inserted}")


if __name__ == "__main__":
    main()
