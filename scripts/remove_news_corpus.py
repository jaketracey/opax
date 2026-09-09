#!/usr/bin/env python3
"""Remove news from the active corpus, retaining an audit backup outside it.

Run on the database host after installing the news ingestion guard. Default is
read-only; --apply backs up each indexed resource before removing it, then
archives and clears the local news table and its derived cross-reference cache.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import sqlite3
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from parli.arag import AragConfig, AragError, KbClient, load_dotenv


def news_resource(resource):
    labels = (resource.get('usermetadata') or {}).get('classifications') or []
    return bool(re.fullmatch(r'news-\d+', resource.get('slug', ''))) and any(
        c.get('labelset') == 'kind' and c.get('label') == 'news' for c in labels)


def catalog_news(kb):
    resources = {}
    page = 0
    while True:
        result = kb.catalog(filters='/classification.labels/kind/news', page_size=100, page_number=page)
        resources.update(result.get('resources') or {})
        if not (result.get('fulltext') or {}).get('next_page'):
            return list(resources.values())
        page += 1


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--db', default=str(Path.home()/'.cache/autoresearch/parli.db'))
    ap.add_argument('--backup', required=True)
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()
    load_dotenv(); kb = KbClient(AragConfig.from_env())
    rows = catalog_news(kb)
    if not all(news_resource(r) for r in rows):
        raise SystemExit('Unexpected resource in news catalog; refusing removal')
    print(f'Indexed news resources: {len(rows)}', flush=True)
    if not args.apply:
        return
    backup = Path(args.backup); backup.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(args.db, timeout=120); db.row_factory = sqlite3.Row
    for table in ['news_articles', 'analysis_cache']:
        path = backup/f'{table}.json'
        if not path.exists():
            sql = f'SELECT rowid AS _rowid, * FROM {table}'
            if table == 'analysis_cache': sql += " WHERE key LIKE 'news_crossref_%'"
            path.write_text(json.dumps([dict(r) for r in db.execute(sql)], ensure_ascii=False))
    # Save full originals before any remote deletion. Re-running is safe.
    def save(row):
        slug = row['slug']; path = backup/f'{slug}.json'
        if not path.exists():
            path.write_text(json.dumps(kb.get_resource_by_slug(slug, show='basic&show=origin&show=extra&show=values'), ensure_ascii=False))
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(save, rows))
    for row in rows:
        try: kb.delete_resource_by_slug(row['slug'])
        except AragError as e:
            if e.status != 404: raise
    remaining = catalog_news(kb)
    if remaining:
        raise SystemExit(f'{len(remaining)} news resources remain; retry after index settles')
    with db:
        local_count = db.execute('SELECT COUNT(*) FROM news_articles').fetchone()[0]
        db.execute('DELETE FROM news_articles')
        db.execute("INSERT INTO news_articles_fts(news_articles_fts) VALUES ('rebuild')")
        db.execute("DELETE FROM analysis_cache WHERE key LIKE 'news_crossref_%'")
    result = {'removed_from_index':len(rows), 'removed_from_local_corpus':local_count,
              'remaining_indexed_news':len(catalog_news(kb)), 'backup':str(backup)}
    (backup/'result.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))

if __name__ == '__main__': main()
