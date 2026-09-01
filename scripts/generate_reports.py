#!/usr/bin/env python3
"""
Generate the portal's investigation reports from the knowledge box.

Each report is a set of questions asked of the corpus via /ask (grounded,
cited, synchronous); answers + sources are written as static JSON into
portal/public/reports/, which the Worker serves as assets. Re-run any time
the corpus grows, then `wrangler deploy` from portal/ to publish.

  python3 scripts/generate_reports.py                # all topics
  python3 scripts/generate_reports.py gambling housing  # subset

Uses ARAG_* from .env. Query-time cost only (generative model is pinned to
the cheapest tier on the KB) — this does NOT trigger enrichment.
"""

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from parli.arag import AragConfig, AragError, KbClient, load_dotenv  # noqa: E402

OUT_DIR = Path(__file__).resolve().parent.parent / "portal" / "public" / "reports"

REPORTS: dict[str, dict] = {
    "gambling": {
        "title": "Gambling",
        "blurb": "What parliament says about poker machines, online wagering and gambling reform.",
        "questions": [
            "What have MPs said about gambling reform and poker machine regulation?",
            "What arguments have been made against tighter gambling regulation, and by whom?",
            "What has been said about the influence of the gambling industry on politics?",
        ],
    },
    "climate": {
        "title": "Climate & Energy",
        "blurb": "The climate debate on the record: targets, coal, renewables and carbon pricing.",
        "questions": [
            "What positions have MPs taken on climate change action and emissions targets?",
            "What has been said in parliament about coal mining and the transition to renewable energy?",
            "How have MPs discussed carbon pricing and its repeal?",
        ],
    },
    "housing": {
        "title": "Housing",
        "blurb": "Decades of affordability promises, negative gearing fights and supply debates.",
        "questions": [
            "What have MPs said about housing affordability and home ownership?",
            "What positions have been taken on negative gearing and property tax concessions?",
            "What has parliament said about social and public housing supply?",
        ],
    },
    "indigenous": {
        "title": "First Nations",
        "blurb": "Reconciliation, the Voice, Closing the Gap and native title, in parliament's own words.",
        "questions": [
            "What have MPs said about reconciliation and recognition of First Nations peoples?",
            "What was said in parliament about the Voice to Parliament referendum?",
            "How has parliament discussed Closing the Gap outcomes?",
        ],
    },
    "immigration": {
        "title": "Immigration",
        "blurb": "Border policy, offshore detention and migration levels across the decades.",
        "questions": [
            "What positions have MPs taken on asylum seekers and offshore detention?",
            "What has been said about immigration levels and skilled migration?",
        ],
    },
    "media": {
        "title": "Media Ownership",
        "blurb": "Concentration, regulation and the platforms — parliament on the press.",
        "questions": [
            "What have MPs said about media ownership concentration in Australia?",
            "What was said about the news media bargaining code and tech platforms?",
        ],
    },
}


def build_section(kb: KbClient, question: str) -> dict:
    res = kb.ask(question, citations=True, top_k=20)
    sources = []
    for rid, resource in ((res.get("retrieval_results") or {}).get("resources") or {}).items():
        slug = resource.get("slug") or ""
        if slug.startswith("da-"):
            continue
        meta = ((resource.get("extra") or {}).get("metadata")) or {}
        collabs = (resource.get("origin") or {}).get("collaborators") or []
        sources.append({
            "slug": slug,
            "title": resource.get("title"),
            "speaker": collabs[0] if collabs else None,
            "date": meta.get("date"),
        })
    return {
        "question": question,
        "answer": res.get("answer") or "",
        "sources": sources,
    }


def main() -> None:
    load_dotenv()
    kb = KbClient(AragConfig.from_env())
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    picked = sys.argv[1:] or list(REPORTS)

    counters = kb.counters()
    index = []
    idx_path = OUT_DIR / "index.json"
    if idx_path.exists():
        index = json.loads(idx_path.read_text()).get("reports", [])

    for slug in picked:
        cfg = REPORTS[slug]
        print(f"[{slug}] {len(cfg['questions'])} questions...")
        sections = []
        for q in cfg["questions"]:
            t0 = time.time()
            try:
                sections.append(build_section(kb, q))
                print(f"  ok ({time.time() - t0:.0f}s): {q[:60]}")
            except AragError as e:
                print(f"  FAILED ({e.status}): {q[:60]}", file=sys.stderr)
        if not sections:
            print(f"[{slug}] no sections generated — skipping write", file=sys.stderr)
            continue
        report = {
            "slug": slug,
            "title": cfg["title"],
            "blurb": cfg["blurb"],
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "corpus_resources": counters.get("resources"),
            "sections": sections,
        }
        (OUT_DIR / f"{slug}.json").write_text(json.dumps(report, indent=1))
        index = [r for r in index if r["slug"] != slug] + [{
            "slug": slug, "title": cfg["title"], "blurb": cfg["blurb"],
            "updated": report["generated_at"],
        }]

    index.sort(key=lambda r: r["slug"])
    idx_path.write_text(json.dumps({"reports": index}, indent=1))
    print(f"Wrote {len(picked)} report(s) + index to {OUT_DIR}")
    print("Publish with: cd portal && npx wrangler deploy")


if __name__ == "__main__":
    main()
