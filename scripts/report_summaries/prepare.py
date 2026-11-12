#!/usr/bin/env python3
"""Source packs, lane plan and lane briefs for report summaries written by Codex lanes.

    python3 -I scripts/report_summaries/prepare.py scope
    python3 -I scripts/report_summaries/prepare.py packs [--slug S ...] [--tier T ...]
    python3 -I scripts/report_summaries/prepare.py plan  [--size 30] [--include-agency]
    python3 -I scripts/report_summaries/prepare.py brief --label L --slugs-file F --worktree W > brief.md

No model is called here and nothing is fetched: packs are cut from the text the report ingests already
hold in ~/.cache/autoresearch. A pack is <packs>/<slug>/meta.json, pages.json (one string per PDF page)
and text.txt (the same pages with "=== PDF page N ===" markers, for reading and searching). Packs stay
outside git; the drafts the lanes write, the gate results and the published summaries are committed.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "portal" / "public"
CACHE = Path("~/.cache/autoresearch").expanduser()
INTEGRITY_TEXT = CACHE / "integrity-commissions" / "text"
RC_TEXT = CACHE / "royal-commissions" / "text"
AGENCY_TEXT = CACHE / "agency-reports" / "text"
# On-device OCR text (ocr.py) for scanned or glyph-broken PDFs; used in place of the blank text layer.
OCR_TEXT = Path(os.environ.get("OPAX_SUMMARY_OCR", str(CACHE / "report-summaries" / "ocr")))
PACKS = Path(os.environ.get("OPAX_SUMMARY_PACKS", str(CACHE / "report-summaries" / "packs")))
GATE = Path(__file__).resolve().parent / "gate.py"

IN_SCOPE = {
    "royal_commission": None,
    "integrity_report": {"investigation_report", "special_report", "public_inquiry_report", "prevention_research_report"},
}


def slug_part(value: str) -> str:
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", str(value).lower()))


def load_pages(path: Path) -> list[str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    pages = data.get("pages") if isinstance(data, dict) else data
    return [p if isinstance(p, str) else (p or {}).get("text", "") for p in pages]


def candidates() -> list[dict]:
    """Every report record, with whether its text is held locally and what its OPAX page already shows."""
    rows: list[dict] = []
    for f in sorted((PUBLIC / "royal-commissions").glob("commission-*.json")):
        c = json.loads(f.read_text())["commission"]
        reps = [r for r in c.get("reports") or [] if any((RC_TEXT / f"{x.get('sha256')}.json").exists()
                                                          for x in r.get("files") or [] if x.get("sha256"))]
        base = {"slug": f"royal-commission-{slug_part(c['id'])}", "type": "royal_commission",
                "subtype": c.get("inquiry_type"), "title": c["name"], "body": c["name"],
                "jurisdiction": c.get("jurisdiction"), "own_summary_on_page": False, "opax_findings": 0,
                "recommendations_on_page": len(c.get("recommendations") or [])}
        if not reps:
            rows.append({**base, "text": None, "reason": "no report text held"})
            continue
        order = {"final_report": 0, "interim_report": 1, "progress_report": 2}
        rep = sorted(reps, key=lambda r: (order.get(r["kind"], 9), -(int((r.get("date") or "0")[:4] or 0))))[0]
        fil = next(x for x in rep["files"] if x.get("sha256") and (RC_TEXT / f"{x['sha256']}.json").exists())
        rows.append({**base, "document": rep["title"], "url": fil["url"], "sha256": fil["sha256"],
                     "text": str(RC_TEXT / f"{fil['sha256']}.json"), "rights": rep.get("rights")})
    for f in sorted((PUBLIC / "integrity-reports").glob("reports-*.json")):
        d = json.loads(f.read_text())
        for r in d["records"]:
            doc = next((x for x in r.get("documents") or [] if x.get("sha256")
                        and (INTEGRITY_TEXT / f"{x['sha256']}.json").exists()), None)
            rows.append({"slug": f"integrity-report-{slug_part(r['id'])}", "type": "integrity_report",
                         "subtype": r["report_type"], "title": r["title"], "document": (doc or {}).get("title"),
                         "url": (doc or {}).get("url") or r.get("pdf_url"), "sha256": (doc or {}).get("sha256"),
                         "text": str(INTEGRITY_TEXT / f"{doc['sha256']}.json") if doc else None,
                         "rights": (d.get("licence") or {}).get("status"),
                         "own_summary_on_page": len(r.get("summary") or "") > 200 or bool(r.get("findings")),
                         "body": d.get("name"), "body_short": d.get("short"), "jurisdiction": r.get("jurisdiction"),
                         "opax_findings": len(r.get("findings") or []),
                         "recommendations_on_page": len(r.get("recommendations") or []),
                         "reason": None if doc else "no report text held"})
    g = json.loads((PUBLIC / "agency-reports" / "index.json").read_text())
    for d in g["documents"]:
        p = AGENCY_TEXT / f"{d.get('sha256')}.json"
        rows.append({"slug": f"agency-report-{slug_part(d['id'])}", "type": "agency_report", "subtype": d.get("kind"),
                     "title": f"{d['agency']} {d.get('reporting_year')} {d.get('kind')}", "document": d.get("kind"),
                     "url": d.get("source_url"), "sha256": d.get("sha256"), "text": str(p) if p.exists() else None,
                     "rights": None, "own_summary_on_page": False, "opax_findings": 0, "body": d["agency"],
                     "jurisdiction": d.get("jurisdiction")})
    return rows


def tier(r: dict) -> str:
    return r["type"] if r["type"] != "integrity_report" else f"integrity_report/{r['subtype']}"


def in_scope(r: dict, include_agency: bool = False) -> bool:
    if not r.get("text"):
        return False
    if r["type"] == "agency_report":
        return include_agency
    allowed = IN_SCOPE.get(r["type"], "no")
    return allowed is None or (allowed != "no" and r["subtype"] in allowed)


def cmd_scope(args) -> int:
    out: dict[str, dict] = {}
    for r in candidates():
        t = out.setdefault(tier(r), {"records": 0, "own_summary_on_page": 0, "text_held": 0, "in_scope": 0})
        t["records"] += 1
        t["own_summary_on_page"] += bool(r.get("own_summary_on_page"))
        t["text_held"] += bool(r.get("text"))
        t["in_scope"] += in_scope(r, args.include_agency)
    print(json.dumps(out, indent=1))
    return 0


def write_pack(r: dict) -> Path:
    ocr = OCR_TEXT / f"{r.get('sha256')}.json"
    pages = load_pages(ocr if r.get("sha256") and ocr.exists() else Path(r["text"]))
    d = PACKS / r["slug"]
    d.mkdir(parents=True, exist_ok=True)
    meta = {k: r.get(k) for k in ("slug", "type", "subtype", "title", "body", "body_short", "document", "url", "sha256",
                                  "rights", "jurisdiction", "opax_findings", "recommendations_on_page")}
    meta["pages"] = len(pages)
    meta["chars"] = sum(len(p) for p in pages)
    meta["text_source"] = "ocr" if r.get("sha256") and ocr.exists() else "pdf"
    (d / "meta.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False) + "\n")
    (d / "pages.json").write_text(json.dumps(pages, ensure_ascii=False))
    (d / "text.txt").write_text("\n".join(f"=== PDF page {i + 1} ===\n{p.rstrip()}\n" for i, p in enumerate(pages)))
    return d


def cmd_packs(args) -> int:
    rows = candidates()
    want = set(args.slug or [])
    tiers = set(args.tier or [])
    n = 0
    for r in rows:
        if (r["slug"] in want) or (tiers and tier(r) in tiers and in_scope(r, True)):
            if not r.get("text"):
                print(f"{r['slug']}: no text held, no pack", file=sys.stderr)
                continue
            write_pack(r)
            n += 1
    print(f"{n} packs in {PACKS}")
    return 0


SHORT = {"royal_commission": "rc", "integrity_report/investigation_report": "inv",
         "integrity_report/special_report": "spec", "integrity_report/public_inquiry_report": "pubinq",
         "integrity_report/prevention_research_report": "prev", "agency_report": "agency"}


def cmd_plan(args) -> int:
    rows = [r for r in candidates() if in_scope(r, args.include_agency)]
    lanes = []
    for t in sorted({tier(r) for r in rows}):
        group = [r["slug"] for r in rows if tier(r) == t]
        k = max(1, -(-len(group) // args.size))
        per = -(-len(group) // k)
        for i in range(k):
            chunk = group[i * per:(i + 1) * per]
            if chunk:
                lanes.append({"label": f"rs-{SHORT.get(t, slug_part(t))}-{i + 1:02d}", "tier": t, "reports": len(chunk),
                              "slugs": chunk})
    print(json.dumps({"lanes": len(lanes), "reports": sum(l["reports"] for l in lanes),
                      "plan": [{k: v for k, v in l.items() if k != "slugs"} for l in lanes]}, indent=1))
    if args.write:
        Path(args.write).write_text(json.dumps(lanes, indent=1) + "\n")
    return 0


BRIEF = """# Report summaries lane {label}

You are writing short, neutral, source-only summaries of Australian official reports for OPAX
(opax.com.au), a public-record site. Each summary appears on the report's OPAX page. This brief is
complete: you need nothing beyond it, the source packs and the gate script.

## Your reports

{n} reports, one per line in `{slugs_file}`. For each slug the source pack is in
`{packs}/<slug>/`:

- `meta.json`: title, publishing body, document, source URL, page count, rights note, and
  `opax_findings` (how many findings the OPAX page already lists).
- `text.txt`: the report's full extracted text. Each page starts with `=== PDF page N ===`. **N is the
  page number you cite** (not the page number printed in the report). Use `rg -n` to find headings
  such as Executive summary, Overview, Summary of findings, Findings, Conclusions, Recommendations.
- `pages.json`: the same text as a list, which the gate reads.

Read each report's own summary or findings sections before writing. For long reports, read the
executive summary, the findings and conclusions chapters and the recommendations list; you do not
need to read every page.

## Output

Write one JSON file per report at `data/report-summaries/drafts/<slug>.json` in this worktree:

```json
{{"slug": "<slug>", "engine": "Codex (gpt-6.1-sol)",
 "own_summary": {{"heading": "Executive summary", "first_page": 5, "last_page": 7}},
 "sentences": [
  {{"text": "One plain-English sentence.", "pages": [5], "section": "Executive summary",
   "support": "an excerpt of 8 to 30 words copied exactly from a cited page",
   "people": []}}
 ],
 "findings": [
  {{"quote": "A complete sentence of the body's own finding, copied exactly.", "page": 27, "kind": "finding"}}
 ],
 "notes": "anything a reviewer should know"}}
```

- `own_summary`: the report's own executive summary, overview, summary of findings or equivalent:
  its heading exactly as printed and its first and last PDF pages. Use `null` if it has none.
- `sentences`: **3 to 6** sentences. In order, where the report allows:
  - who made the report and what it was asked to do;
  - what it examined;
  - what it found or concluded;
  - its recommendations: how many, and what they are about.
- `findings`: up to 5 of the body's own stated findings, opinions or conclusions, the most
  significant first. Each must be a complete sentence (6 to 60 words) copied exactly, with its PDF
  page. `kind` is one of finding, opinion, conclusion or recommendation.
  **If `meta.json` has `opax_findings` above 0, leave `findings` empty**: the page already lists them.

## Rules (all of them bind)

1. **Source-only.** Use only the report's own text. Add nothing from outside it: no background,
   no later events, no other reports, no news.
2. **A citation on every sentence.** Every sentence cites at least one PDF page in `pages`.
   - Its `support` is an exact excerpt from one of those pages that backs the sentence.
   - Every claim in the sentence must be stated on the cited pages.
   - You may add the `section` heading, but `pages` is required.
3. **The body's own wording for findings and recommendations.** Attribute every finding or
   opinion to the body ("The Commission found", "IBAC formed the view").
   - Where the exact words matter, put them in double quotation marks, copied exactly from a cited
     page, at most 30 words in quotation marks per sentence.
   - Outside quotation marks, paraphrase: never copy a run of 15 or more words from the report.
     The report's own title does not count.
4. **Never present allegations, evidence or submissions as findings.**
   - Allegations, evidence, submissions, witness accounts, complaints and counsel assisting's
     submissions are not findings.
   - If the report examined an allegation, say it examined it.
   - Report only what the body itself found or concluded.
5. **Nothing added about named people.**
   - Prefer roles to names ("a senior officer", "the then manager").
   - Name a person only where the cited page records the body's own finding, opinion or formal
     role about them, and say nothing about them beyond what that page states.
   - Never name witnesses, complainants or people the report makes no finding about.
   - List every person you name in `people`.
   - Verbatim findings quotes keep names as the body printed them.
6. **Neutral, plain Australian English.**
   - No em dashes and no first person.
   - No judgement words (damning, shocking, landmark, welcome and the like) unless they are inside
     a quotation of the body's words.
   - Never write about the source text itself ("the pages", "the extract").
7. **If the text does not support something, leave it out.** A shorter, fully supported summary
   is better than a longer one.

## Quality gate (run it, fix, repeat)

After drafting each report, run:

```
python3 -I {gate} --packs {packs} --drafts data/report-summaries/drafts --lane {label} --slug <slug>
```

- The gate prints PASS or FAIL with a reason for each failing item. It checks:
  - every sentence has a page citation;
  - the support excerpt, every quoted phrase and every findings quote are verbatim on the cited
    page;
  - names appear on the cited pages;
  - an adverse statement about a named person rests on a stated finding;
  - allegation text is not stated as fact;
  - no long copied runs, and house style.
- Fix each failure from the report text, or remove the item, and rerun until the report passes.
  Never weaken a rule to pass: if you cannot support a sentence, delete it.
- Every gate run is logged to `data/report-summaries/gate/history.jsonl`. Do not edit or delete
  that file.

When every report passes, run the gate once more over all of your slugs with `--apply`, adding
`--out data/report-summaries`. This writes the publishable files.

## Finish

- Stay inside `data/report-summaries/`: change nothing else in the repo.
- Commit your drafts, gate results and published files on this worktree's branch, in one or a few
  commits. Each commit message must end with the line
  `Co-Authored-By: Codex (gpt-6.1-sol) <noreply@openai.com>`.
- Do not push, merge or deploy. Do not call any paid API or other model.
- End with a short report:
  - a table with one row per slug: sentences kept, findings kept, own summary found (yes/no),
    and gate PASS on the first run (yes/no);
  - anything that was hard to support;
  - any report whose text looked broken (for example, scanned pages with no text).
"""


def cmd_brief(args) -> int:
    slugs = [s for s in Path(args.slugs_file).read_text().split() if s]
    print(BRIEF.format(label=args.label, n=len(slugs), slugs_file=args.slugs_file, packs=PACKS, gate=GATE))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scope"); s.add_argument("--include-agency", action="store_true")
    p = sub.add_parser("packs"); p.add_argument("--slug", action="append"); p.add_argument("--tier", action="append")
    pl = sub.add_parser("plan"); pl.add_argument("--size", type=int, default=30)
    pl.add_argument("--include-agency", action="store_true"); pl.add_argument("--write")
    b = sub.add_parser("brief"); b.add_argument("--label", required=True); b.add_argument("--slugs-file", required=True)
    b.add_argument("--worktree")
    args = ap.parse_args()
    return {"scope": cmd_scope, "packs": cmd_packs, "plan": cmd_plan, "brief": cmd_brief}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
