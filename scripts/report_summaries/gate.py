#!/usr/bin/env python3
"""Quality gate for drafted report summaries. Nothing that fails it is published.

    python3 -I gate.py --packs <pack dir> --drafts <dir> [--slug S ...] [--apply --out <dir>] [--lane LABEL]

Inputs:
    <pack dir>/<slug>/meta.json    report metadata written by prepare.py
    <pack dir>/<slug>/pages.json   the report's extracted text, one string per PDF page
    <drafts>/<slug>.json           a draft written by a summary lane (shape below)

Draft shape:
    {"slug": "...", "engine": "...",
     "own_summary": null | {"heading": "...", "first_page": N, "last_page": N},
     "sentences": [{"text": "...", "pages": [N, ...], "section": "optional heading",
                    "support": "exact excerpt from a cited page", "people": ["names in the sentence"]}],
     "findings":  [{"quote": "exact words", "page": N, "kind": "finding|opinion|conclusion|recommendation"}],
     "notes": "..."}

Every sentence must cite at least one PDF page of the report, and its support excerpt and every
phrase it puts in quotation marks must appear verbatim on a cited page. Every findings quote must
appear verbatim on its page. Further rules: names only as they appear on a cited page; no adverse
statement about a named person unless the support states a finding or opinion; allegation, evidence
or submission text never stated as fact; no run of 15+ words copied outside quotation marks; house
style (no em dashes, no first person, no judgement words, no talk about "the pages").

Writes <drafts>/../gate/<slug>.json (every item with pass or its reasons) and appends one line per
report to <drafts>/../gate/history.jsonl, so the first-attempt pass rate is on record. Exits 1 when any
item fails. With --apply, writes the publishable <out>/<slug>.json holding only passing items; a
report with fewer than 2 passing sentences is marked withheld.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import unicodedata
from pathlib import Path

LABEL = "Generated summary: written by an AI model from the report text and checked against the cited pages."
OWN_LABEL = "The report's own summary"
FINDINGS_LABEL = "In the body's own words"
SHINGLE = 15
KINDS = {"finding", "opinion", "conclusion", "recommendation"}

ORG_WORDS = set("""
commission commissioner department office act royal australia australian government council police service services
authority scheme parliament committee court tribunal ombudsman agency board inquiry report minister ministerial premier
state commonwealth territory victoria victorian queensland new south wales western northern tasmania tasmanian capital
health centre university group limited ltd pty corporation operation investigation independent integrity corruption
national anti crime legislative assembly house senate labor liberal party branch electorate chapter volume part appendix
recommendation recommendations finding findings the and of for in on fund program unit division bureau institute network
hospital school city shire water crown casino resorts melbourne sydney perth brisbane adelaide hobart darwin canberra public
sector law enforcement conduct standards code statement values january february march april may june july august september
october november december robodebt centrelink dss ato tax home affairs executive senior anti-corruption staff member members
officer officers director general secretary chief deputy assistant attorney attorney-general treasury finance defence social
community family families child children mental disability veterans forensic dna laboratory science sciences union nation
first nations aboriginal torres strait islander safety emergency fire rescue ambulance transport roads planning environment
education justice corrections prison prisons budget annual year review overview summary executive
""".split())
TITLED = re.compile(r"\b(?:Mr|Ms|Mrs|Miss|Dr|Professor|Prof|Councillor|Cr|Sir|Dame|Justice|Judge|Senator|Detective|"
                    r"Sergeant|Constable|Inspector|Superintendent|Commander)\.?\s+[A-Z][a-zA-Z'’-]+(?:\s+[A-Z][a-zA-Z'’-]+)?")
NAME_SEQ = re.compile(r"\b([A-Z][a-zA-Z'’-]+(?:\s+(?:[A-Z]\.\s*)?[A-Z][a-zA-Z'’-]+)+)\b")
ADVERSE = re.compile(r"\b(corrupt\w*|misconduct|dishonest\w*|breach\w*|fraud\w*|improper\w*|lied|false\w*|unlawful\w*|"
                     r"deceiv\w*|mislead\w*|misus\w*|engaged in|failed to|knowingly)\b", re.I)
FINDING_WORDS = re.compile(r"\b(f[io]und\w*|finds?|findings?|opinion|satisfied|conclu\w+|determined|is of the view|"
                           r"was of the view|formed the view|affirmative finding)\b", re.I)
ALLEGATION_SRC = re.compile(r"\b(alleg\w*|submi\w*|submission\w*|evidence|told|claimed|counsel assisting|witness\w*|"
                            r"testif\w*|complain\w*)\b", re.I)
ALLEGATION_SENT = re.compile(r"\b(alleg\w*|submi\w*|evidence|examin\w*|investigat\w*|consider\w*|inquir\w*|told|said|"
                             r"heard|complain\w*|claim\w*|report\w*)\b", re.I)
BANNED = ["controversial", "unfortunately", "fortunately", "sadly", "radical", "extreme ", "common sense", "sensible",
          "landmark", "draconian", "so-called", "long overdue", "damning", "scathing", "shocking", "disgraceful",
          "explosive", "bombshell", "in short", "this summary", "supplied pages", "pages supplied", "the pages provided",
          "provided pages", "the source text", "the extracted text"]
FIRST_PERSON = re.compile(r"\b(I|[Ww]e|[Oo]ur|[Uu]s|[Mm]y)\b")
DASH = re.compile("—|\\s–\\s|\\s--\\s")
QUOTED = re.compile(r'["“]([^"”]{3,600})["”]')


# ---------------------------------------------------------------------------
# text helpers

def norm(text: str) -> str:
    t = unicodedata.normalize("NFKC", text or "")
    t = t.replace("‘", "'").replace("’", "'").replace("“", '"').replace("”", '"').replace("­", "")
    t = re.sub(r"[‐-―−]", "-", t)
    return re.sub(r"\s+", " ", t).strip().casefold()


def dehyphen(text: str) -> str:
    return re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", text or "")


def _squash(s: str) -> str:
    return re.sub(r"[^\w]+", "", s)


def contains(page_text: str, quote: str) -> bool:
    """Verbatim, allowing only differences in whitespace, line-break hyphenation, quote style and punctuation spacing."""
    q = norm(quote).strip(" .\"'")
    if len(q) < 8:
        return False
    a, b = norm(page_text), norm(dehyphen(page_text))
    return q in a or q in b or _squash(q) in _squash(a) or _squash(q) in _squash(b)


def locate(quote: str, pages: list[str]) -> list[int]:
    """1-based pages that hold the quote; a quote running over a page break counts for the page it starts on."""
    hits = [i + 1 for i, p in enumerate(pages) if contains(p, quote)]
    if hits:
        return hits
    return [i + 1 for i in range(len(pages) - 1) if contains(pages[i] + "\n" + pages[i + 1], quote)]


def on_pages(quote: str, pages: list[str], cited: list[int]) -> bool:
    for n in cited:
        if contains(pages[n - 1], quote):
            return True
        # a quote running over the page break counts for the page it starts on, but not one wholly on the next page
        if n < len(pages) and not contains(pages[n], quote) and contains(pages[n - 1] + "\n" + pages[n], quote):
            return True
    return False


def words(s: str) -> list[str]:
    return re.findall(r"[\w'-]+", norm(s))


def shingles(tokens: list[str], n: int | None = None) -> set[tuple[str, ...]]:
    n = n or SHINGLE
    return {tuple(tokens[i:i + n]) for i in range(len(tokens) - n + 1)}


def name_like(sentence: str) -> list[str]:
    out = []
    for m in NAME_SEQ.finditer(sentence):
        toks = [t.strip("'’").lower() for t in m.group(1).split()]
        if not any(t in ORG_WORDS for t in toks):
            out.append(m.group(1))
    return out


def _ints(v) -> list[int]:
    return [x for x in (v if isinstance(v, list) else [v]) if isinstance(x, int) and not isinstance(x, bool)]


# ---------------------------------------------------------------------------
# checks

def check(draft: dict, pages: list[str], meta: dict) -> dict:
    n_pages = len(pages)
    title_bits = [meta.get(k) for k in ("title", "body", "document") if meta.get(k)]
    title_names = {norm(n) for t in title_bits for n in name_like(t)}
    corpus = shingles(words(" ".join(pages)))
    sentences = []
    for i, item in enumerate(draft.get("sentences") or []):
        why: list[str] = []
        if not isinstance(item, dict):
            sentences.append({"i": i, "item": item, "why": ["not an object"]})
            continue
        text = (item.get("text") or "").strip()
        cited = _ints(item.get("pages"))
        support = item.get("support") or ""
        if not text:
            why.append("empty sentence")
        if not cited:
            why.append("no page citation")
        bad = [p for p in cited if not 1 <= p <= n_pages]
        if bad:
            why.append(f"cites pages outside the report: {bad}")
        cited = [p for p in cited if 1 <= p <= n_pages]
        cited_text = "\n".join(pages[p - 1] for p in cited)
        cited_norm = norm(dehyphen(cited_text))
        if cited and not on_pages(support, pages, cited):
            hits = locate(support, pages)
            why.append(f"support excerpt not verbatim on the cited pages (found on page {hits[0]})" if hits
                       else "support excerpt not verbatim anywhere in the report")
        if not 5 <= len(words(support)) <= 40:
            why.append(f"support excerpt is {len(words(support))} words (needs 5 to 40)")
        for qt in QUOTED.findall(text):
            if cited and not on_pages(qt, pages, cited):
                why.append(f"quoted phrase not verbatim on the cited pages: {qt[:70]!r}")
        people = [p for p in item.get("people") or [] if isinstance(p, str) and p.strip()]
        people += [m.group(0) for m in TITLED.finditer(text)]
        for nm in dict.fromkeys(name_like(text) + people):
            if norm(nm) not in cited_norm and norm(nm) not in title_names:
                why.append(f"name {nm!r} not on the cited pages")
        if people and ADVERSE.search(text) and not FINDING_WORDS.search(support):
            why.append("adverse statement about a named person, but the support states no finding or opinion")
        if ALLEGATION_SRC.search(support) and not ALLEGATION_SENT.search(text) and not FINDING_WORDS.search(support):
            why.append("support is allegation, evidence or submission text but the sentence states it as fact")
        bare = QUOTED.sub(" ", text)
        if DASH.search(bare):
            why.append("em dash")
        if any(b in text.lower() for b in BANNED):
            why.append("banned phrase")
        if FIRST_PERSON.search(bare):
            why.append("first person outside quotation marks")
        for t in title_bits:
            bare = re.sub(re.escape(t), " ", bare, flags=re.I)
        if shingles(words(bare)) & corpus:
            why.append(f"copies a run of {SHINGLE}+ words outside quotation marks")
        if len(words(text)) > 70:
            why.append("sentence longer than 70 words")
        sentences.append({"i": i, "item": {**item, "pages": cited}, "why": why})
    findings = []
    for i, f in enumerate(draft.get("findings") or []):
        why = []
        if not isinstance(f, dict):
            findings.append({"i": i, "item": f, "why": ["not an object"]})
            continue
        q, p = (f.get("quote") or "").strip(), f.get("page")
        if not (isinstance(p, int) and 1 <= p <= n_pages):
            why.append("no valid page")
        elif not on_pages(q, pages, [p]):
            hits = locate(q, pages)
            why.append(f"quote not verbatim on page {p} (found on page {hits[0]})" if hits
                       else "quote not verbatim anywhere in the report")
        nw = len(words(q))
        if not 6 <= nw <= 70:
            why.append(f"quote is {nw} words (needs 6 to 60)")
        if not re.search(r"[.?!;:)\"”’']$", q):
            why.append("quote does not end as a complete statement")
        if f.get("kind") not in KINDS:
            why.append("kind must be finding, opinion, conclusion or recommendation")
        findings.append({"i": i, "item": f, "why": why})
    own = draft.get("own_summary")
    own_res = None
    if isinstance(own, dict) and own:
        fp, head = own.get("first_page"), own.get("heading") or ""
        why = []
        if not (isinstance(fp, int) and 1 <= fp <= n_pages and head and norm(head) in norm(dehyphen(pages[fp - 1]))):
            why.append("heading not on its first page")
        own_res = {"item": own, "why": why}
    report_why = []
    if draft.get("slug") != meta.get("slug"):
        report_why.append("slug does not match the pack")
    if not 3 <= len(sentences) <= 6:
        report_why.append(f"{len(sentences)} sentences drafted (needs 3 to 6)")
    if len(findings) > 5:
        report_why.append("more than 5 findings quotes")
    if meta.get("opax_findings") and findings:
        report_why.append("this report page already lists extracted findings; leave findings empty")
    passed = [s for s in sentences if not s["why"]]
    return {
        "slug": meta.get("slug"),
        "sentences": sentences,
        "findings": findings,
        "own_summary": own_res,
        "report": report_why,
        "counts": {"sentences": len(sentences), "sentences_pass": len(passed),
                   "findings": len(findings), "findings_pass": sum(1 for f in findings if not f["why"]),
                   "own_summary_pass": bool(own_res and not own_res["why"])},
        "clean": not report_why and all(not s["why"] for s in sentences) and all(not f["why"] for f in findings)
                 and not (own_res and own_res["why"]),
    }


def publish(draft: dict, res: dict, meta: dict, lane: str | None) -> dict:
    url = meta["url"]
    doc = meta.get("document") or meta["title"]
    cite = lambda p: {"url": url, "document": doc, "page": p}
    sents = [s["item"] for s in res["sentences"] if not s["why"]]
    quotes = [] if meta.get("opax_findings") else [f["item"] for f in res["findings"] if not f["why"]]
    own = res["own_summary"]["item"] if res["own_summary"] and not res["own_summary"]["why"] else None
    return {
        "schema": 1,
        "slug": meta["slug"],
        "report_type": meta["type"],
        "subtype": meta.get("subtype"),
        "title": meta["title"],
        "body": meta.get("body"),
        "source": {"url": url, "document": doc, "sha256": meta.get("sha256"), "pages": meta.get("pages"),
                   "rights": meta.get("rights")},
        "own_summary": None if not own else {
            "label": OWN_LABEL, "heading": own["heading"], "first_page": own["first_page"],
            "last_page": own.get("last_page") or own["first_page"], "link": f"{url}#page={own['first_page']}"},
        "summary": {
            "status": "ready" if len(sents) >= 2 else "withheld",
            "label": LABEL,
            "sentences": [{"text": s["text"], "cites": [cite(p) for p in s["pages"]],
                           **({"section": s["section"]} if s.get("section") else {})} for s in sents],
        },
        "findings": {"label": FINDINGS_LABEL,
                     "source": "already on the report page" if meta.get("opax_findings") else "quoted verbatim and checked",
                     "items": [{"quote": f["quote"], "kind": f["kind"], "cite": cite(f["page"])} for f in quotes]},
        "gate": {"checked_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
                 "dropped": [{"text": s["item"].get("text") if isinstance(s["item"], dict) else s["item"], "why": s["why"]}
                             for s in res["sentences"] if s["why"]]
                 + [{"quote": f["item"].get("quote") if isinstance(f["item"], dict) else f["item"], "why": f["why"]}
                    for f in res["findings"] if f["why"]]},
        "generation": {"engine": draft.get("engine"), "lane": lane},
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--packs", required=True)
    ap.add_argument("--drafts", required=True)
    ap.add_argument("--slug", action="append")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--out")
    ap.add_argument("--lane")
    args = ap.parse_args()
    packs, drafts = Path(args.packs), Path(args.drafts)
    gate_dir = drafts.parent / "gate"
    gate_dir.mkdir(parents=True, exist_ok=True)
    slugs = args.slug or sorted(p.stem for p in drafts.glob("*.json"))
    all_clean = True
    for slug in slugs:
        meta = json.loads((packs / slug / "meta.json").read_text())
        pages = json.loads((packs / slug / "pages.json").read_text())
        try:
            draft = json.loads((drafts / f"{slug}.json").read_text())
        except Exception as e:  # noqa: BLE001
            print(f"{slug}: FAIL unreadable draft ({e})")
            all_clean = False
            continue
        res = check(draft, pages, meta)
        (gate_dir / f"{slug}.json").write_text(json.dumps(res, indent=1, ensure_ascii=False) + "\n")
        with (gate_dir / "history.jsonl").open("a") as h:
            h.write(json.dumps({"slug": slug, "at": dt.datetime.now(dt.timezone.utc).isoformat(), "lane": args.lane,
                                "clean": res["clean"], **res["counts"]}) + "\n")
        c = res["counts"]
        print(f"{slug}: {'PASS' if res['clean'] else 'FAIL'} sentences {c['sentences_pass']}/{c['sentences']} "
              f"findings {c['findings_pass']}/{c['findings']} own_summary {'ok' if c['own_summary_pass'] else '-'}")
        for s in res["sentences"]:
            for w in s["why"]:
                print(f"   sentence {s['i']}: {w}")
        for f in res["findings"]:
            for w in f["why"]:
                print(f"   finding {f['i']}: {w}")
        if res["own_summary"] and res["own_summary"]["why"]:
            print("   own_summary: " + "; ".join(res["own_summary"]["why"]))
        for w in res["report"]:
            print(f"   report: {w}")
        all_clean &= res["clean"]
        if args.apply:
            out = Path(args.out or drafts.parent)
            out.mkdir(parents=True, exist_ok=True)
            (out / f"{slug}.json").write_text(
                json.dumps(publish(draft, res, meta, args.lane), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return 0 if all_clean else 1


if __name__ == "__main__":
    sys.exit(main())
