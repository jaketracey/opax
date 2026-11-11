#!/usr/bin/env python3
"""Public full text of hearing transcripts the publisher licenses under CC BY 4.0.

Reads the hearing transcripts listed in ``parli/ingest/royal_commissions.json`` for the
commissions in ``COMMISSIONS`` from the verified manual cache (``<cache>/manual/<sha256>.pdf``,
no source requests) and writes ``portal/public/transcripts/``:

  index.json               the transcripts, attribution and licence per commission, the
                           tokeniser's stopwords and the terms too common to post
  terms/<nn>.json          term -> transcripts containing it (index into index.json docs),
                           sharded by FNV-1a of the term
  <commission>/<key>.json  one transcript: its pages with the publisher's own transcript page
                           number, the cleaned text of each page, and term -> pages

Text is the publisher's text layer with the margin line numbers, running headers and footers
removed; the words are not changed. A transcript in which the publisher's own text records a
non-publication or suppression order, a direction not to publish, or a pseudonymous witness is
marked ``quote_policy: "no_quotes"``: its pages carry no text, only the term index, so OPAX can
point to the hearing and page without quoting it. The Epiq word-index pages at the back of the
NSW transcripts are dropped (they are a concordance, not evidence).

Run after a transcript is added to the registry:  python scripts/build_transcript_fulltext.py
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import sys
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "parli" / "ingest" / "royal_commissions.json"
OUT = ROOT / "portal" / "public" / "transcripts"
CACHE = Path(os.environ.get("OPAX_RC_CACHE", Path.home() / ".cache" / "autoresearch" / "royal-commissions")) / "manual"
SCHEMA = 1
SHARDS = 64
LABEL = "Hearing transcript: evidence, not findings"
CC_BY = "https://creativecommons.org/licenses/by/4.0/"

# Commissions whose transcripts the publisher licenses under CC BY 4.0 (read 12 Nov 2026 from each
# site's copyright notice). Everything else stays listed with a link to the publisher.
COMMISSIONS = {
    "cth-antisemitism": {
        "attribution": "© Commonwealth of Australia 2026",
        "copyright_url": "https://asc.royalcommission.gov.au/disclaimer-and-copyright",
    },
    "cth-robodebt": {
        "attribution": "© Commonwealth of Australia",
        "copyright_url": "https://robodebt.royalcommission.gov.au/copyright",
    },
    "nsw-healthcare-funding": {
        "attribution": "© State of New South Wales Premier's Department",
        "copyright_url": "https://healthcarefunding.specialcommission.nsw.gov.au/copyright.html",
    },
}

# What the publisher's text must say for OPAX to withhold quotes. Deliberately broad: a passing
# mention of an order counts. "De-identified" and "anonymity" alone do not (they describe data).
ORDER = re.compile(
    r"non[- ]?publication|suppression order|pseudonym|publication (?:order|direction)|prohibit\w* (?:the )?publication"
    r"|not (?:to )?be published|order not to publish|confidentiality order|section 6D\b", re.I)
ORDER_NOTICE = ("The publisher's transcript records a non-publication or suppression order, a direction not to publish, "
                "or a witness giving evidence under a pseudonym. OPAX does not quote this transcript; it shows the hearing "
                "and page so you can read the publisher's own edition, which is published subject to those orders.")
WORD_INDEX = re.compile(r"\[\d+\] -")
FOLIO = re.compile(r"^P-\d+$")
STOPWORDS = sorted(set("""
a about above after again against all am an and any are as at be because been before being below between both but by
can could did do does doing down during each few for from further had has have having he her here hers herself him
himself his how i if in into is it its itself just me more most my myself no nor not of off on once only or other our
ours ourselves out over own same she should so some such than that the their theirs them themselves then there these
they this those through to too under until up very was we were what when where which while who whom why will with
would you your yours yourself yourselves yes okay ok mr mrs ms dr sc thank thanks
""".split()))
_STOP = set(STOPWORDS)


def tokens(text: str) -> list[str]:
    """Same rule as portal/src/tools/transcript-text.ts: fold accents and case, drop apostrophes,
    split on anything not a letter or digit, keep words of two or more characters that contain a
    letter, and four-digit numbers (years)."""
    s = unicodedata.normalize("NFKD", text.lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"['’‘]", "", s)
    out = []
    for t in re.split(r"[^a-z0-9]+", s):
        if len(t) < 2 or t in _STOP:
            continue
        if re.search(r"[a-z]", t) or re.fullmatch(r"\d{4}", t):
            out.append(t)
    return out


def shard(term: str) -> int:
    h = 0x811C9DC5
    for b in term.encode("utf-8"):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return h % SHARDS


def clean_page(words, width: float, height: float):
    """(folio, text) for one PDF page from PyMuPDF words (x0, y0, x1, y1, word, ...)."""
    body = [w for w in words if 0.045 * height <= w[1] < 0.875 * height]
    folio = None
    for w in words:
        if w[1] >= 0.875 * height and (FOLIO.match(w[4]) or (w[4].isdigit() and 0.4 * width < w[0] < 0.6 * width)):
            folio = w[4]
            break
    lefts = [w[0] for w in body if not w[4].isdigit()]
    left = min(lefts) if lefts else 0
    body = [w for w in body if not (w[4].isdigit() and w[2] < left - 6)]  # margin line numbers
    body.sort(key=lambda w: (w[1] + w[3]) / 2)
    lines, cur, cy = [], [], None
    for w in body:
        y = (w[1] + w[3]) / 2
        if cy is None or abs(y - cy) > 3:
            if cur:
                lines.append(cur)
            cur, cy = [w], y
        else:
            cur.append(w)
    if cur:
        lines.append(cur)
    return folio, "\n".join(" ".join(w[4] for w in sorted(line, key=lambda w: w[0])) for line in lines)


def is_word_index(text: str) -> bool:
    return len(WORD_INDEX.findall(text)) >= 15


def extract(pdf: Path):
    import pymupdf
    with pymupdf.open(pdf) as doc:
        return [clean_page(p.get_text("words"), p.rect.width, p.rect.height) for p in doc]


def transcripts(registry):
    for c in registry["commissions"]:
        if c["id"] in COMMISSIONS:
            for d in c["documents"]:
                if d["kind"] == "hearing_transcript":
                    yield c, d


def build_doc(c, d, pages):
    kept = [(n, folio, text) for n, (folio, text) in enumerate(pages, 1) if not is_word_index(text)]
    flat = [(n, re.sub(r"\s+", " ", text)) for n, _, text in kept]
    order_pages = [n for n, text in flat if ORDER.search(text)]
    quote = not order_pages
    by_term: dict[str, list[int]] = defaultdict(list)
    for n, _, text in kept:
        for t in sorted(set(tokens(text))):
            by_term[t].append(n)
    meta = COMMISSIONS[c["id"]]
    out = {
        "schema": SCHEMA, "label": LABEL, "commission": c["id"], "commission_name": c["name"], "key": d["key"],
        "title": d["title"], "date": d.get("date"), "hearing": d.get("hearing"),
        "pdf_url": d["url"], "page_url": d.get("page"), "sha256": d["sha256"], "pdf_pages": len(pages),
        "attribution": f"{meta['attribution']}, {c['name']}, licensed under CC BY 4.0", "licence": "CC BY 4.0", "licence_url": CC_BY, "copyright_url": meta["copyright_url"],
        "quote_policy": "quote" if quote else "no_quotes",
        **({} if quote else {"order_notice": ORDER_NOTICE, "order_pages": order_pages}),
        "dropped_pages": [n for n, (_, text) in enumerate(pages, 1) if is_word_index(text)],
        "pages": [{"n": n, "folio": folio, **({"text": text} if quote else {})} for n, folio, text in kept],
        "terms": {t: ns for t, ns in sorted(by_term.items())},
    }
    return out, set(by_term)


def write(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args(argv)
    out = Path(args.out)
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    rows = sorted(transcripts(registry), key=lambda cd: (cd[0]["id"], cd[1].get("date") or "", cd[1]["key"]))
    missing = [d["key"] for _, d in rows if not (CACHE / f"{d['sha256']}.pdf").exists()]
    if missing:
        print(f"[build_transcript_fulltext] HELD: {len(missing)} PDFs missing from {CACHE}, e.g. {missing[:3]}", file=sys.stderr)
        return 3
    tmp = out.with_name(out.name + ".tmp")
    shutil.rmtree(tmp, ignore_errors=True)
    docs, postings = [], defaultdict(list)
    for i, (c, d) in enumerate(rows):
        doc, terms = build_doc(c, d, extract(CACHE / f"{d['sha256']}.pdf"))
        file = f"{c['id']}/{d['key']}.json"
        write(tmp / file, doc)
        for t in terms:
            postings[t].append(i)
        docs.append({"i": i, "commission": c["id"], "key": d["key"], "title": d["title"], "date": d.get("date"),
                     "file": f"/transcripts/{file}", "pdf_url": d["url"], "pages": len(doc["pages"]),
                     "quote_policy": doc["quote_policy"]})
    common = sorted(t for t, ds in postings.items() if len(ds) > len(docs) // 2)
    shards: list[dict] = [{} for _ in range(SHARDS)]
    for t, ds in sorted(postings.items()):
        if t not in common:
            shards[shard(t)][t] = ds
    for n, s in enumerate(shards):
        write(tmp / "terms" / f"{n:02d}.json", s)
    counts = {cid: {"transcripts": sum(1 for x in docs if x["commission"] == cid),
                    "quote": sum(1 for x in docs if x["commission"] == cid and x["quote_policy"] == "quote"),
                    "no_quotes": sum(1 for x in docs if x["commission"] == cid and x["quote_policy"] == "no_quotes")}
              for cid in COMMISSIONS}
    write(tmp / "index.json", {
        "schema": SCHEMA, "label": LABEL, "built_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "licence": "CC BY 4.0", "licence_url": CC_BY,
        "commissions": {c["id"]: {"name": c["name"], "attribution": f"{COMMISSIONS[c['id']]['attribution']}, {c['name']}, licensed under CC BY 4.0",
                                 "copyright_url": COMMISSIONS[c["id"]]["copyright_url"], "counts": counts[c["id"]]}
                        for c in registry["commissions"] if c["id"] in COMMISSIONS},
        "order_notice": ORDER_NOTICE, "shards": SHARDS, "stopwords": STOPWORDS, "common_terms": common, "docs": docs,
        "caveats": [
            "Hearing transcripts are evidence and submissions, not findings of the commission.",
            "Text is the publisher's own text layer with margin line numbers, headers and footers removed. Redactions are the publisher's.",
            "Where the publisher's transcript records a non-publication or suppression order, a direction not to publish or a pseudonymous witness, OPAX gives the page but no quotation.",
        ]})
    shutil.rmtree(out, ignore_errors=True)
    tmp.rename(out)
    print(f"[build_transcript_fulltext] {json.dumps(counts)} terms={len(postings)} common={len(common)}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
