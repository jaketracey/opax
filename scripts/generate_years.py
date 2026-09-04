#!/usr/bin/env python3
"""
Generate the Time Machine's per-year enrichment as static JSON.

For every year 1998-2026 the dialog can show, this writes
portal/public/years/{year}.json holding two things, each labelled with where
it came from and how much of the record it covers:

  brief   ONE grounded, cited /ask against the knowledge box, filtered to the
          year (the same from/to grammar the Worker uses: origin.created is
          the speech date). Machine-written; shipped with its sources so the
          reader can check every claim. Costs about $0.008 per year
          (DeepSeek v4 flash via the OpenRouter preset, reasoning off).

  voices  The speakers and parties that dominate the year's retrieved search
          windows: the dialog's own curated probes (YEAR_TOPICS in
          portal/public/timemachine.js, parsed from the file so there is one
          source of truth) run through the live /api/search at top_k=50 and
          tallied. Retrieval only, no model call, no cost beyond the search
          rate limit. This is "who dominates the strongest matches for the
          year's debates", never "who spoke most in parliament".

Cost discipline: a year that already has a brief is NEVER asked again unless
--force is passed. The default run only fills gaps.

  python3 scripts/generate_years.py                 # every year without a file
  python3 scripts/generate_years.py 2001 2002       # a subset
  python3 scripts/generate_years.py --voices-only   # re-tally voices, no asks
  python3 scripts/generate_years.py --force 2001    # re-ask (costs money)
  python3 scripts/generate_years.py --dry-run       # print the plan, do nothing

Uses ARAG_* from .env for the ask. Voices go through https://opax.com.au so
the tally is byte-for-byte the endpoint the dialog itself calls.
"""

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from parli.arag import AragConfig, AragError, KbClient, _request, load_dotenv  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "portal" / "public" / "years"
TM_JS = ROOT / "portal" / "public" / "timemachine.js"
SEARCH_BASE = "https://opax.com.au/api/search"

YEAR_MIN = 1998
YEAR_MAX = 2026
PROBE_TOPK = 50           # per curated debate; /find caps at 200
SEARCH_PACE_S = 0.75      # /api/search is limited to 120 per 60 s per IP

# Presiding officers, with their years in the chair. A Speaker or President
# does not take part in debate, so a debate speech the record attributes to
# one is either a ruling or an attribution error - the openaustralia House
# feed glues members' speeches onto the Speaker's interjections ("Milton
# Dick" carried an opposition MPI speech and the Governor-General's speech
# in 2025). They are left out of the ranked voices for those years only;
# Peter Slipper's 2001 speeches, for instance, still count.
PRESIDING = [
    ("Neil Andrew", 1998, 2004), ("David Hawker", 2004, 2007), ("Harry Jenkins", 2008, 2011),
    ("Peter Slipper", 2011, 2012), ("Anna Burke", 2012, 2013), ("Bronwyn Bishop", 2013, 2015),
    ("Tony Smith", 2015, 2021), ("Andrew Wallace", 2021, 2022), ("Milton Dick", 2022, 2030),
    ("Margaret Reid", 1996, 2002), ("Paul Calvert", 2002, 2007), ("Alan Ferguson", 2007, 2008),
    ("John Hogg", 2008, 2014), ("Stephen Parry", 2014, 2017), ("Scott Ryan", 2017, 2021),
    ("Slade Brockman", 2021, 2022), ("Sue Lines", 2022, 2030),
]


def presiding_in(year: int) -> set[str]:
    return {name for name, y0, y1 in PRESIDING if y0 <= year <= y1}

# OpenRouter list price for the pinned model (MIGRATION-ARAG.md, §Models):
# $0.44 in / $1.32 out per 1M tokens. Used only to report what a run cost.
PRICE_IN_PER_M = 0.44
PRICE_OUT_PER_M = 1.32

# A custom user prompt REPLACES the platform template wholesale, so it must
# carry {question} and {context} itself. The "always synthesise" clause is
# load-bearing: filtered asks over mixed contexts refuse 2 runs in 3 without
# it (measured 2026-09-02, see MIGRATION-ARAG.md).
BRIEF_PROMPT = (
    "You are writing a short 'year in brief' for a general reader, drawn only from "
    "the Australian parliamentary record for YEAR. From the provided context, write "
    "two or three short paragraphs: name the debates that dominated the year and say "
    "what was argued, attributing positions to the speakers and parties the context "
    "shows taking them. Be precise with any figures the sources give and never invent "
    "numbers, names or events. A passage that only partly concerns a debate still "
    "counts as evidence of it. ALWAYS write the best brief the context supports - "
    "never reply that there is not enough data. Plain paragraphs only: no headings, "
    "no bullet lists, no preamble, no closing summary.\n\n"
    "CONTEXT FROM THE RECORD:\n{context}\n\n"
    "QUESTION: {question}\n\n"
    "THE BRIEF:"
)


def year_topics() -> dict[int, list[dict]]:
    """Parse YEAR_TOPICS out of timemachine.js so the probes cannot drift."""
    src = TM_JS.read_text(encoding="utf-8")
    start = src.index("const YEAR_TOPICS = {")
    end = src.index("\n}\n", start)
    block = src[start:end]
    out: dict[int, list[dict]] = {}
    current = None
    for line in block.splitlines():
        m = re.match(r"\s*(\d{4}): \[", line)
        if m:
            current = int(m.group(1))
            out[current] = []
            continue
        m = re.search(r"\{ q: '([^']*)', label: '([^']*)' \}", line)
        if m and current is not None:
            out[current].append({"q": m.group(1), "label": m.group(2)})
    if len(out) != YEAR_MAX - YEAR_MIN + 1:
        raise SystemExit(f"parsed {len(out)} years of YEAR_TOPICS, expected {YEAR_MAX - YEAR_MIN + 1}")
    return out


def year_filter(year: int) -> dict:
    """Mirror of the Worker's filterExpression for from=to=year."""
    return {
        "field": {
            "and": [
                {"prop": "created", "since": f"{year}-01-01T00:00:00Z", "until": f"{year}-12-31T23:59:59Z"},
                # Title fields hold only "Name - date"; a match there is noise.
                {"not": {"prop": "field", "type": "generic"}},
            ]
        }
    }


def resource_row(rid: str, resource: dict, cited: set[str]) -> dict:
    meta = ((resource.get("extra") or {}).get("metadata")) or {}
    collabs = (resource.get("origin") or {}).get("collaborators") or []
    labels = {
        c.get("labelset"): c.get("label")
        for c in ((resource.get("usermetadata") or {}).get("classifications") or [])
    }
    return {
        "slug": resource.get("slug") or "",
        "title": resource.get("title"),
        "speaker": collabs[0] if collabs else None,
        "party": labels.get("party"),
        "state": labels.get("state"),
        "date": (meta.get("date") or "")[:10] or None,
        "cited": rid in cited,
    }


def ask_year(kb: KbClient, year: int, labels: list[str]) -> dict:
    """One grounded, cited ask filtered to the year. Returns the brief record."""
    question = (
        f"What were the main debates in the Australian parliament in {year}, and what "
        f"positions did members and parties take? Debates that year included "
        + ", ".join(labels[:-1]) + (f" and {labels[-1]}" if len(labels) > 1 else labels[0]) + "."
    )
    body = {
        "query": question,
        "citations": True,
        "top_k": 20,
        "reranker": "predict",
        # origin (speaker) and extra (date) are not serialised by default.
        "show": ["basic", "origin", "extra"],
        "prompt": {"user": BRIEF_PROMPT.replace("YEAR", str(year))},
        "filter_expression": year_filter(year),
    }
    headers = {**kb._headers, "x-synchronous": "true"}
    t0 = time.time()
    res = _request("POST", kb._rag("/ask"), headers, body, timeout=300)
    answer = (res.get("answer") or "").strip()
    prompt_used = "year-brief-v1"
    if not answer:
        # Some filtered asks come back 200-but-empty under a custom prompt;
        # the platform's default template is the reliable fallback.
        print("    empty under custom prompt - retrying with the default template")
        body.pop("prompt")
        res = _request("POST", kb._rag("/ask"), headers, body, timeout=300)
        answer = (res.get("answer") or "").strip()
        prompt_used = "platform-default"
    cited = {k.split("/")[0] for k in (res.get("citations") or {})}
    sources = []
    for rid, resource in ((res.get("retrieval_results") or {}).get("resources") or {}).items():
        row = resource_row(rid, resource, cited)
        if not row["slug"] or row["slug"].startswith("da-"):
            continue
        sources.append(row)
    sources.sort(key=lambda s: (not s["cited"], s["date"] or ""))
    tokens = ((res.get("metadata") or {}).get("tokens")) or {}
    return {
        "question": question,
        "prompt": prompt_used,
        "answer": answer,
        "sources": sources,
        "cited_count": sum(1 for s in sources if s["cited"]),
        "seconds": round(time.time() - t0, 1),
        "tokens": {k: tokens.get(k) for k in ("input", "output") if k in tokens},
        "model": "@preset/opax (deepseek-v4-flash via OpenRouter) through the knowledge box /ask",
        "coverage": (
            f"Written from the {len(sources)} strongest passages the knowledge box retrieved "
            f"for {year}; the index is still loading, so this is what the record shows so far."
        ),
    }


def search(q: str, year: int) -> dict:
    # `per` matters: without it the Worker pages the window at 20 rows.
    params = urllib.parse.urlencode({"q": q, "from": year, "to": year, "top_k": PROBE_TOPK, "per": PROBE_TOPK})
    req = urllib.request.Request(f"{SEARCH_BASE}?{params}", headers={"user-agent": "opax-generate-years/1"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


def voices_for(year: int, probes: list[dict]) -> dict:
    """Tally speakers and parties across the year's retrieved search windows."""
    by_slug: dict[str, dict] = {}
    probe_rows = []
    for p in probes:
        try:
            data = search(p["q"], year)
        except Exception as e:  # noqa: BLE001 - one dead probe should not sink the year
            print(f"    search failed for {p['label']!r}: {e}", file=sys.stderr)
            probe_rows.append({"q": p["q"], "label": p["label"], "retrieved": 0, "truncated": False})
            continue
        rows = data.get("results") or []
        probe_rows.append({"q": p["q"], "label": p["label"], "retrieved": len(rows), "truncated": bool(data.get("truncated"))})
        for r in rows:
            if r.get("slug") and r["slug"] not in by_slug:
                by_slug[r["slug"]] = r
        time.sleep(SEARCH_PACE_S)

    speakers: Counter = Counter()
    party_of: dict[str, Counter] = defaultdict(Counter)
    parties: Counter = Counter()
    unlabelled = 0
    bare = 0
    chair = presiding_in(year)
    chair_rows = 0
    for r in by_slug.values():
        name = (r.get("speaker") or "").strip()
        party = r.get("party")
        if party:
            parties[party] += 1
        else:
            unlabelled += 1
        if not name:
            continue
        # A bare surname ("Smith") can be several people; it stays in the
        # party tally but is never ranked as one voice.
        if " " not in name:
            bare += 1
            continue
        if name in chair:
            chair_rows += 1
            continue
        speakers[name] += 1
        if party:
            party_of[name][party] += 1

    # One retrieved speech is not a voice; rank only repeat appearances.
    top = [
        {"name": n, "party": (party_of[n].most_common(1)[0][0] if party_of[n] else None), "speeches": c}
        for n, c in speakers.most_common(8) if c >= 2
    ]
    retrieved = sum(p["retrieved"] for p in probe_rows)
    return {
        "method": (
            f"The dialog's {len(probes)} curated probes for {year} run through /api/search "
            f"(hybrid retrieval, from={year}&to={year}, top_k={PROBE_TOPK}), de-duplicated by "
            "speech, then tallied by speaker and party. Retrieval only: no model call."
        ),
        "coverage": (
            f"{len(by_slug)} distinct speeches among the {retrieved} strongest matches for the "
            f"year's {len(probes)} debates - not every speech given in {year}, and the index is "
            "still loading."
        ),
        "probes": probe_rows,
        "retrieved": retrieved,
        "unique_speeches": len(by_slug),
        "unlabelled_party": unlabelled,
        "bare_surnames_skipped": bare,
        "presiding_rows_skipped": chair_rows,
        "presiding_excluded": sorted(chair),
        "speakers": top,
        "parties": [{"party": p, "speeches": c} for p, c in parties.most_common(8)],
    }


def write_index() -> None:
    years = {}
    for path in sorted(OUT_DIR.glob("*.json")):
        if path.name == "index.json":
            continue
        try:
            data = json.loads(path.read_text())
        except json.JSONDecodeError:
            continue
        y = data.get("year")
        if not y:
            continue
        brief = data.get("brief") or {}
        voices = data.get("voices") or {}
        years[str(y)] = {
            "brief": bool(brief.get("answer")),
            "cited": brief.get("cited_count", 0),
            "voices": len(voices.get("speakers") or []),
        }
    (OUT_DIR / "index.json").write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "years": years,
    }, indent=1))


def main() -> None:
    args = sys.argv[1:]
    force = "--force" in args
    dry = "--dry-run" in args
    voices_only = "--voices-only" in args
    brief_only = "--brief-only" in args
    picked = [int(a) for a in args if re.fullmatch(r"\d{4}", a)]
    years = picked or list(range(YEAR_MIN, YEAR_MAX + 1))
    topics = year_topics()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    plan = []
    for y in years:
        path = OUT_DIR / f"{y}.json"
        prior = json.loads(path.read_text()) if path.exists() else {}
        has_brief = bool((prior.get("brief") or {}).get("answer"))
        do_brief = (not voices_only) and (force or not has_brief)
        do_voices = (not brief_only) and (force or not prior.get("voices") or voices_only)
        plan.append((y, prior, do_brief, do_voices))
    asks = sum(1 for _, _, b, _ in plan if b)
    print(f"{len(plan)} year(s); {asks} ask(s) at ~$0.008 each (~${asks * 0.008:.2f}); "
          f"{sum(1 for *_, v in plan if v)} voices tallies (free).")
    if dry:
        for y, _, b, v in plan:
            print(f"  {y}: {'ask ' if b else '    '}{'voices' if v else ''}")
        return

    kb = None
    counters = None
    total_in = total_out = 0
    for y, prior, do_brief, do_voices in plan:
        if not (do_brief or do_voices):
            continue
        print(f"[{y}]")
        record = dict(prior) if prior else {"year": y}
        record["year"] = y
        if do_brief:
            if kb is None:
                load_dotenv()
                kb = KbClient(AragConfig.from_env())
                counters = kb.counters()
            labels = [p["label"] for p in topics.get(y, [])]
            try:
                record["brief"] = ask_year(kb, y, labels)
                b = record["brief"]
                total_in += b["tokens"].get("input") or 0
                total_out += b["tokens"].get("output") or 0
                print(f"  brief {'ok' if b['answer'] else 'EMPTY'}: {len(b['answer'])} chars, "
                      f"{b['cited_count']}/{len(b['sources'])} cited, {b['seconds']}s, tokens {b['tokens']}")
            except AragError as e:
                print(f"  brief FAILED ({e.status}): {e.detail[:120]}", file=sys.stderr)
        if do_voices:
            record["voices"] = voices_for(y, topics.get(y, []))
            v = record["voices"]
            print(f"  voices: {v['unique_speeches']} speeches, top {[s['name'] for s in v['speakers'][:3]]}")
        record["generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        if counters:
            record["corpus_resources"] = counters.get("resources")
        (OUT_DIR / f"{y}.json").write_text(json.dumps(record, indent=1, ensure_ascii=False))

    write_index()
    if total_in or total_out:
        cost = total_in / 1e6 * PRICE_IN_PER_M + total_out / 1e6 * PRICE_OUT_PER_M
        print(f"Model tokens this run: {total_in} in / {total_out} out ≈ ${cost:.3f} at list price.")
    print(f"Wrote to {OUT_DIR}. Publish with: cd portal && npx wrangler deploy")


if __name__ == "__main__":
    main()
