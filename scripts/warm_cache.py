#!/usr/bin/env python3
"""
Warm the Worker's /api/ask cache with the questions the site asks over and over.

  python3 scripts/warm_cache.py --dry-run                 # list the questions, ask nothing
  python3 scripts/warm_cache.py                           # warm production (https://opax.com.au)
  python3 scripts/warm_cache.py --base http://localhost:8868 --limit 5
  python3 scripts/warm_cache.py --source chips,topics     # a subset of the sources

Every /api/ask MISS runs the paid generative model (15-40 s, ~$0.008 on the
BYOK DeepSeek config); the Worker keeps a finished, cited answer in
caches.default for 7 days under a key of the canonical ask input plus
CACHE_EPOCH (portal/wrangler.jsonc). This script asks each recurring question
once, synchronously, one at a time with a 1 s gap, so the first reader after
a deploy or an epoch bump gets a sub-second HIT instead of paying the model.

Sources, mirroring what the site actually sends (docs/STREAMING.md "Caching"):

  chips       portal/public/suggestions.json — the home-page ask chips
  bench       scripts/ask_questions.json — the 24 harness questions, with the
              speaker filter exactly as ask_harness.py sends it
  topics      "What has parliament said about <topic>?" for the 21 topics in
              app.js TOPICS, phrased as the topic page's topicPhrase() does
  reports     every question inside REPORTS in scripts/generate_reports.py
  industries  "What has parliament said about <industry>?" for the money map's
              legend groups (CLUSTER_COLOURS in money-map.js, minus parties
              and the two the map never offers an ask for: individuals, other)

The cache is per Cloudflare colo, so run this from where the readers are
(Australia); a warm from elsewhere warms the wrong data centre. A question
already cached answers HIT in well under a second and costs nothing, so the
script is safe to re-run. Run it AFTER a deploy, never against a dev server
that shares production's model budget without meaning to.
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
PORTAL_PUBLIC = REPO / "portal" / "public"

# Cloudflare blocks bare python-urllib; identify honestly (the harness does too).
UA = "opax-warm-cache/1.0 (+https://opax.com.au/#/methods)"
MODEL_CALL_COST_USD = 0.008  # per ask on the BYOK DeepSeek config (ask_harness.py)

# The money map's flow card offers "What has parliament said about <group>?"
# for every legend group except these two (money-map.js).
INDUSTRY_NO_ASK = {"parties", "individuals", "other"}


def load_chips() -> list[dict]:
    data = json.loads((PORTAL_PUBLIC / "suggestions.json").read_text())
    return [{"question": q, "kind": "speech", "source": "chips"} for q in data.get("questions", [])]


def load_bench() -> list[dict]:
    bench = json.loads((ROOT / "ask_questions.json").read_text())["questions"]
    out = []
    for q in bench:
        item = {"question": q["q"], "source": f"bench:{q['id']}"}
        # ask_harness.py sends {question, speaker?} and nothing else.
        if q.get("speaker"):
            item["speaker"] = q["speaker"]
        out.append(item)
    return out


def topic_phrase(slug: str, name: str) -> str:
    """app.js topicPhrase(): how a topic reads mid-sentence."""
    if slug == "indigenous-affairs":
        return "Indigenous affairs"
    return name.lower().replace(" & ", " and ")


def load_topics() -> list[dict]:
    src = (PORTAL_PUBLIC / "app.js").read_text()
    m = re.search(r"const TOPICS = \{(.*?)\};", src, re.S)
    if not m:
        sys.exit("could not find TOPICS in portal/public/app.js")
    pairs = re.findall(r'"([a-z-]+)":\s*"([^"]+)"', m.group(1))
    return [
        {"question": f"What has parliament said about {topic_phrase(slug, name)}?", "kind": "speech",
         "source": f"topic:{slug}"}
        for slug, name in pairs
    ]


def load_reports() -> list[dict]:
    """REPORTS from generate_reports.py, read from the source: importing the
    module would pull in parli.arag and its .env requirements."""
    tree = ast.parse((ROOT / "generate_reports.py").read_text())
    for node in tree.body:
        if isinstance(node, ast.AnnAssign) and getattr(node.target, "id", None) == "REPORTS" and node.value:
            reports = ast.literal_eval(node.value)
            break
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == "REPORTS" for t in node.targets):
            reports = ast.literal_eval(node.value)
            break
    else:
        sys.exit("could not find REPORTS in scripts/generate_reports.py")
    return [
        {"question": q, "kind": "speech", "source": f"report:{slug}"}
        for slug, cfg in reports.items()
        for q in cfg.get("questions", [])
    ]


def load_industries() -> list[dict]:
    src = (PORTAL_PUBLIC / "money-map.js").read_text()
    m = re.search(r'new Map\(\[\["parties",\{colour:(.*?)\]\]\)', src, re.S)
    if not m:
        sys.exit("could not find CLUSTER_COLOURS in portal/public/money-map.js")
    groups = ["parties"] + re.findall(r'\],\["([^"]+)",\{colour', m.group(0))
    return [
        {"question": f"What has parliament said about {g}?", "kind": "speech", "source": f"industry:{g}"}
        for g in groups
        if g not in INDUSTRY_NO_ASK
    ]


SOURCES = {
    "chips": load_chips,
    "bench": load_bench,
    "topics": load_topics,
    "reports": load_reports,
    "industries": load_industries,
}


def canonical(item: dict) -> tuple:
    """The Worker's cache key, near enough: question case-folded, speaker, kind."""
    return (
        " ".join(item["question"].split()).lower(),
        (item.get("speaker") or "").strip().lower(),
        item.get("kind") or "speech",
    )


def collect(sources: list[str]) -> list[dict]:
    seen: set[tuple] = set()
    out: list[dict] = []
    for name in sources:
        for item in SOURCES[name]():
            key = canonical(item)
            if key in seen:
                continue
            seen.add(key)
            out.append(item)
    return out


def ask(base: str, item: dict, timeout: int) -> tuple[str, float, int, int, str]:
    """POST the ask synchronously. Returns (cache status, seconds, cited, sources, note)."""
    body = {"question": item["question"]}
    for k in ("kind", "speaker", "party", "state", "topic", "from", "to"):
        if item.get(k):
            body[k] = item[k]
    req = urllib.request.Request(
        f"{base}/api/ask",
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json", "user-agent": UA},
        method="POST",
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            status = res.headers.get("X-OPAX-Cache", "?")
            data = json.load(res)
    except urllib.error.HTTPError as e:
        note = e.headers.get("Retry-After", "")
        return f"HTTP {e.code}", time.time() - t0, 0, 0, f"retry-after {note}" if note else ""
    except Exception as e:  # noqa: BLE001
        return "ERROR", time.time() - t0, 0, 0, str(e)[:80]
    dt = time.time() - t0
    sources = data.get("sources") or []
    cited = sum(1 for s in sources if s.get("cited"))
    answer = (data.get("answer") or "").strip()
    note = "" if answer else "empty answer (not cached)"
    if answer and cited == 0:
        note = "uncited (not cached)"
    return status, dt, cited, len(sources), note


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default="https://opax.com.au")
    ap.add_argument("--dry-run", action="store_true", help="list the questions and exit")
    ap.add_argument("--limit", type=int, help="ask only the first N")
    ap.add_argument("--source", default=",".join(SOURCES), help="comma list of: " + ", ".join(SOURCES))
    ap.add_argument("--gap", type=float, default=1.0, help="seconds between asks (default 1)")
    ap.add_argument("--timeout", type=int, default=180)
    args = ap.parse_args()

    sources = [s.strip() for s in args.source.split(",") if s.strip()]
    unknown = [s for s in sources if s not in SOURCES]
    if unknown:
        sys.exit(f"unknown source(s): {', '.join(unknown)}")
    items = collect(sources)
    if args.limit:
        items = items[: args.limit]

    per_source: dict[str, int] = {}
    for it in items:
        per_source[it["source"].split(":")[0]] = per_source.get(it["source"].split(":")[0], 0) + 1
    breakdown = " · ".join(f"{k} {v}" for k, v in per_source.items())
    print(f"# warm cache · {args.base} · {len(items)} distinct questions ({breakdown})")
    print(f"# worst case if nothing is cached yet: {len(items)} model calls ≈ ${len(items) * MODEL_CALL_COST_USD:.2f}")

    if args.dry_run:
        for i, it in enumerate(items, 1):
            extra = f"  [speaker={it['speaker']}]" if it.get("speaker") else ""
            print(f"{i:3}  {it['source']:28} {it['question']}{extra}")
        return 0

    print(f"{'#':>3}  {'cache':8} {'secs':>6} {'cited':>5}  question")
    tally: dict[str, int] = {}
    total_secs = 0.0
    for i, it in enumerate(items, 1):
        status, dt, cited, n_sources, note = ask(args.base, it, args.timeout)
        total_secs += dt
        tally[status] = tally.get(status, 0) + 1
        q = it["question"] if len(it["question"]) <= 70 else it["question"][:67] + "..."
        extra = f"  [speaker={it['speaker']}]" if it.get("speaker") else ""
        tail = f"  ({cited}/{n_sources} cited{'; ' + note if note else ''})"
        print(f"{i:3}  {status:8} {dt:6.1f} {cited:5}  {q}{extra}{tail}", flush=True)
        if i < len(items):
            time.sleep(args.gap)

    misses = tally.get("MISS", 0) + tally.get("BYPASS", 0)
    summary = " · ".join(f"{k} {v}" for k, v in sorted(tally.items()))
    print(f"\n== {summary} · {total_secs:.0f}s total · {misses} model calls ≈ ${misses * MODEL_CALL_COST_USD:.2f}")
    return 0 if not any(k.startswith(("HTTP", "ERROR")) for k in tally) else 1


if __name__ == "__main__":
    sys.exit(main())
