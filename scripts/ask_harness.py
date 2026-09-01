#!/usr/bin/env python3
"""
Ask harness: run the question bench against the live portal and score answers.

  python3 scripts/ask_harness.py                      # full bench vs production
  python3 scripts/ask_harness.py --base http://localhost:8797 --only gst-intro
  python3 scripts/ask_harness.py --limit 5

Each question is POSTed to {base}/api/ask exactly as the portal would send it
(same Worker, same model, same filters), then scored:

  PASS     answered, grounded (cited sources >= min_cited), expected terms hit
  WARN     answered but under-cited or missing expected terms
  PENDING  thin/failed answer on a question whose era is not yet indexed —
           the bulk load runs oldest-first, so post-2003 evidence arrives late;
           these become FAILs automatically once the corpus load completes
  FAIL     error, empty answer, ungrounded answer, or a control violated

Cost: ~$0.008/question on the BYOK DeepSeek config. The run writes JSONL +
a markdown summary under scripts/harness_runs/ (gitignored-ish artefacts;
commit the summary if it's worth keeping).
"""

import argparse
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BENCH = ROOT / "ask_questions.json"
RUNS = ROOT / "harness_runs"

# Cloudflare blocks bare python-urllib; identify honestly as the harness.
UA = "opax-ask-harness/1.0 (+https://opax.com.au/#/methods)"

THIN_RE = re.compile(
    r"not (?:enough|sufficient)|no (?:information|relevant|specific)|"
    r"record is thin|does not (?:contain|mention|address)|"
    r"cannot (?:find|answer)|provided context does not",
    re.I,
)


def ask(base: str, question: str, speaker: str | None, timeout: int) -> tuple[dict, float]:
    body = {"question": question}
    if speaker:
        body["speaker"] = speaker
    req = urllib.request.Request(
        f"{base}/api/ask",
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json", "user-agent": UA},
        method="POST",
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.load(res), time.time() - t0


def corpus_latest_year(base: str) -> int:
    """Rough newest-evidence year: max date across a cheap probe search."""
    try:
        probe = urllib.request.Request(
            f"{base}/api/search?q=the&top_k=50&mode=keyword", headers={"user-agent": UA})
        with urllib.request.urlopen(probe, timeout=30) as res:
            data = json.load(res)
        years = [int(r["date"][:4]) for r in data.get("results", []) if r.get("date")]
        return max(years) if years else 0
    except Exception:
        return 0


def score(qspec: dict, data: dict, latest_year: int) -> tuple[str, list[str]]:
    exp = qspec.get("expect", {})
    notes: list[str] = []
    answer = (data.get("answer") or "").strip()
    sources = data.get("sources") or []
    cited = [s for s in sources if s.get("cited")]

    era_from = (qspec.get("era") or [0, 0])[0]
    era_pending = latest_year and era_from > latest_year

    if not answer:
        return ("PENDING" if era_pending else "FAIL"), ["empty answer"]

    thin = bool(THIN_RE.search(answer)) and len(answer) < 600
    if exp.get("thin_ok"):
        # Control: the honest outcome is saying the record is thin, or citing
        # nothing confidently relevant. An invented confident answer FAILs.
        if thin or len(cited) == 0:
            return "PASS", ["correctly reported a thin record"]
        return "FAIL", ["fabricated confidence on an off-corpus topic"]

    for bad in exp.get("must_not_terms", []):
        if bad.lower() in answer.lower():
            return "FAIL", [f"control violated: answer contains '{bad}'"]

    if thin:
        return ("PENDING" if era_pending else "WARN"), ["model reported thin record"]

    verdict = "PASS"
    if len(cited) < exp.get("min_cited", 0):
        verdict = "PENDING" if era_pending else "WARN"
        notes.append(f"cited {len(cited)} < {exp.get('min_cited')}")
    terms = exp.get("any_terms", [])
    if terms:
        hits = sum(1 for t in terms if t.lower() in answer.lower())
        if hits < exp.get("hits", 1):
            verdict = "PENDING" if era_pending else "WARN"
            notes.append(f"term hits {hits}/{exp.get('hits', 1)} of {terms}")
        else:
            notes.append(f"terms {hits}/{len(terms)}")
    notes.append(f"{len(answer)} chars, {len(cited)}/{len(sources)} cited")
    return verdict, notes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://opax.com.au")
    ap.add_argument("--only", nargs="*", help="question ids to run")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--timeout", type=int, default=120)
    args = ap.parse_args()

    bench = json.loads(BENCH.read_text())["questions"]
    if args.only:
        bench = [q for q in bench if q["id"] in set(args.only)]
    if args.limit:
        bench = bench[: args.limit]

    latest = corpus_latest_year(args.base)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    RUNS.mkdir(exist_ok=True)
    out_jsonl = RUNS / f"run-{stamp}.jsonl"
    rows = []

    print(f"# ask harness · {args.base} · {len(bench)} questions · newest evidence ~{latest or '?'}")
    for qspec in bench:
        try:
            data, dt = ask(args.base, qspec["q"], qspec.get("speaker"), args.timeout)
            verdict, notes = score(qspec, data, latest)
        except Exception as e:  # noqa: BLE001
            data, dt = {"error": str(e)}, 0.0
            verdict, notes = "FAIL", [f"request error: {e}"]
        row = {
            "id": qspec["id"], "topic": qspec.get("topic"), "verdict": verdict,
            "latency_s": round(dt, 1), "notes": notes,
            "answer_head": (data.get("answer") or "")[:200],
            "cited": sum(1 for s in (data.get("sources") or []) if s.get("cited")),
            "sources": len(data.get("sources") or []),
        }
        rows.append(row)
        with out_jsonl.open("a") as f:
            f.write(json.dumps({**row, "raw_answer": data.get("answer", "")}) + "\n")
        print(f"{verdict:8} {qspec['id']:24} {row['latency_s']:5.1f}s  {'; '.join(notes)[:100]}")

    tally = {}
    for r in rows:
        tally[r["verdict"]] = tally.get(r["verdict"], 0) + 1
    summary = " · ".join(f"{k} {v}" for k, v in sorted(tally.items()))
    print(f"\n== {summary}  (results: {out_jsonl})")

    md = [f"# Ask harness run {stamp}", f"Base {args.base} · newest evidence ~{latest} · {summary}", "",
          "| verdict | id | latency | notes |", "|---|---|---|---|"]
    md += [f"| {r['verdict']} | {r['id']} | {r['latency_s']}s | {'; '.join(r['notes'])} |" for r in rows]
    (RUNS / f"run-{stamp}.md").write_text("\n".join(md) + "\n")
    return 0 if tally.get("FAIL", 0) == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
