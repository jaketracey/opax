"""Fetch the Register of Senators' Interests (index + one page per senator) via the Firecrawl API
(rawHtml, basic proxy, 1 credit/page) into the conduct_interests cache, ready for
`conduct_interests_federal senate --senate-html-dir`. Idempotent: pages already on disk are skipped.

Why Firecrawl: www.aph.gov.au's WAF 403s every non-browser User-Agent and the module never spoofs one;
robots.txt allows the paths (Allow: /). Cost is 1 credit/page on the basic proxy (~75 credits per full
run). `waitFor` matters: without it ~8% of pages come back rendered without the interests blocks.
A senator id whose page renders as the register listing (e.g. 317026 on 2026-09-04) has no statement
page on the site yet and is reported as FAIL -- that is the source, not the fetch.

Usage (from the repo root, venv with requests + beautifulsoup4):
    PYTHONPATH=. .venv/bin/python scripts/fetch_senate_firecrawl.py
    PYTHONPATH=. .venv/bin/python -m parli.ingest.conduct_interests_federal senate \
        --senate-html-dir ~/.cache/autoresearch/conduct_interests/federal/senate/48p/pages \
        --export-jsonl senate.jsonl --dry-run
    # then ship senate.jsonl + the module to desktop and `load --jsonl` there (docs/DATA-INTERESTS.md)
"""
import json, sys, time, re
from pathlib import Path
import requests
from parli.ingest.conduct_interests_federal import SENATE_INDEX_URL, parse_senate_index

def _api_key() -> str:
    """FIRECRAWL_API_KEY from the environment, else the key the firecrawl MCP server is configured with."""
    import os
    if os.environ.get("FIRECRAWL_API_KEY"):
        return os.environ["FIRECRAWL_API_KEY"]
    cfg = json.load(open(Path("~/.claude.json").expanduser()))
    return cfg["mcpServers"]["firecrawl"]["env"]["FIRECRAWL_API_KEY"]

KEY = _api_key()
BASE = Path("~/.cache/autoresearch/conduct_interests/federal/senate/48p").expanduser()
PAGES = BASE / "pages"; PAGES.mkdir(parents=True, exist_ok=True)
S = requests.Session(); S.headers.update({"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
credits = 0

def scrape(url, tries=2):
    global credits
    for i in range(tries):
        r = S.post("https://api.firecrawl.dev/v2/scrape", json={"url": url, "formats": ["rawHtml"], "onlyMainContent": False, "maxAge": 0, "waitFor": 3000}, timeout=120)
        try: j = r.json()
        except Exception: j = {}
        d = j.get("data") or {}
        meta = d.get("metadata") or {}
        credits += meta.get("creditsUsed") or 0
        if r.ok and j.get("success") and d.get("rawHtml") and meta.get("statusCode") == 200:
            return d["rawHtml"], meta
        print(f"    attempt {i+1} failed: http={r.status_code} page_status={meta.get('statusCode')} err={j.get('error') or str(j)[:150]}", flush=True)
        time.sleep(3)
    return None, meta

idx_path = BASE / "index.html"
if idx_path.exists() and "Senators_Interests_Register/" in idx_path.read_text(errors="replace"):
    print("[index] cached", idx_path)
else:
    html, meta = scrape(SENATE_INDEX_URL)
    if not html: sys.exit("index fetch failed")
    idx_path.write_text(html, encoding="utf-8"); print(f"[index] fetched ({len(html)} bytes, proxy={meta.get('proxyUsed')})")
index = parse_senate_index(idx_path.read_text(encoding="utf-8", errors="replace"))
print(f"[index] {len(index)} senators listed", flush=True)
ok = skipped = 0; failed = []
for e in index:
    out = PAGES / f"{e['id']}.html"
    if out.exists() and "interests-table-collapse" in out.read_text(encoding="utf-8", errors="replace"):
        skipped += 1; continue
    html, meta = scrape(e["url"])
    if not html or "interests-table-collapse" not in html:
        failed.append(e["id"]); print(f"  FAIL {e['id']:8s} {e['name_raw']}", flush=True); continue
    out.write_text(html, encoding="utf-8"); ok += 1
    print(f"  ok   {e['id']:8s} {e['name_raw']:32s} {len(html):7d}B credits={meta.get('creditsUsed')} proxy={meta.get('proxyUsed')}", flush=True)
    time.sleep(1.0)
print(f"[done] fetched={ok} skipped={skipped} failed={failed} credits_used_this_run={credits} -> {PAGES}")
