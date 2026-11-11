"""Numbered recommendations cut from a report PDF's text layer (PyMuPDF), with no requests.

Shared by the IBAC adapter (parli/ingest/integrity/vic_ibac.py) and the royal commissions
ingest (parli/ingest/royal_commissions.py). The extractor reads each page's lines in
reading order with their font sizes, so it can drop footnotes, running heads and page
furniture, and it returns each recommendation's text exactly as printed (line breaks
joined) with the page its heading is on. Callers check the result is a clean 1..N run and
that every line is verbatim on its page before publishing anything.
"""
from __future__ import annotations

from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import re

HEADING = re.compile(r"^Recommendation\s+(\d{1,3})\s*(\((?:continued|cont'd)\))?\s*(?:[:.–-]\s*(.*))?$", re.I)
NOISE = [re.compile(p, re.I) for p in (
    r"^\d{1,4}$", r"^[ivxlc]{1,6}$", r"^\d\.\d$", r".*\(continued\)$", r"^\d+(?:\.\d+)+$", r"^Recommendations?$")]
HEADINGISH = re.compile(r"^(?:\d+(?:\.\d+)*\.?\s+)?[A-Z][A-Za-z’'/,\- ]{2,70}$")
SENTENCE_END = re.compile(r"[.;)’'”]\s*$")
MARKER = re.compile(r"^\(?(?:[a-z]{1,4}|\d{1,3})[.)]$")  # a bare list marker such as "a." is not a sentence end
LIST_ITEM = re.compile(r"^(?:\(?[a-z]{1,4}\)|[a-z]{1,4}\.\s|[•–\-]|\(?[ivx]{1,4}\))")
CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


def clean(value):
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value).replace("\xa0", " ")).strip()
    return text or None


def flat(text: str) -> str:
    """One-line form of extracted text: hyphenated line breaks joined, whitespace collapsed."""
    text = re.sub(r"(\w)-\s*\n\s*(?=\w)", r"\1-", text or "")
    text = text.replace("\u00ad", "")
    return clean(CONTROL.sub(" ", text)) or ""


def _norm(text: str) -> str:
    t = flat(text)
    t = t.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    t = t.replace("–", "-").replace("\u2014", "-").replace("\u2011", "-")
    return re.sub(r"\s+", " ", t).lower()


def verbatim(text: str, source: str) -> bool:
    """True when ``text`` appears in ``source`` (same words, whitespace and quotes normalised)."""
    t = _norm(text)
    return bool(t) and t in _norm(source)


def page_texts(data: bytes, cache: Path | None = None) -> list[str]:
    """Per-page plain text (PyMuPDF), cached by content hash under cache/text when given."""
    path = cache / "text" / (hashlib.sha256(data).hexdigest() + ".json") if cache else None
    if path and path.exists():
        return json.loads(path.read_text())
    import pymupdf
    with pymupdf.open(stream=data, filetype="pdf") as doc:
        pages = [p.get_text("text") for p in doc]
    if path:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(pages, ensure_ascii=False))
        os.replace(tmp, path)
    return pages

def number(text: str) -> tuple[int, ...]:
    """(4, 1) for "4.1", (108,) for "1 0 8" (letter-spaced headings)."""
    if "." in text:
        return tuple(int(x) for x in re.findall(r"\d+", text))
    return (int(re.sub(r"\s", "", text)),)


def follows(prev: tuple[int, ...] | None, n: tuple[int, ...]) -> bool:
    """n is the next number after prev: 1, 2, 3 ... or 1.1, 1.2, then 2.1 (or a later chapter's .1)."""
    if prev is None:
        return n == (1,) or (len(n) == 2 and n[1] == 1)
    if len(n) != len(prev):
        return False
    return n == prev[:-1] + (prev[-1] + 1,) or (len(n) == 2 and n[0] > prev[0] and n[1] == 1)


def label(n: tuple[int, ...]) -> str:
    return ".".join(str(x) for x in n)


def page_lines(data: bytes):
    """[[(text, size, margin)]] per page in reading order (left column, then right), with each line's largest
    font size and whether it sits in the top or bottom 8% of the page (where running heads and footers go)."""
    import pymupdf
    out = []
    with pymupdf.open(stream=data, filetype="pdf") as doc:
        for page in doc:
            width, height, lines = page.rect.width, page.rect.height, []
            for block in page.get_text("dict").get("blocks", []):
                for line in block.get("lines", []):
                    spans = [s for s in line.get("spans", []) if s.get("text", "").strip()]
                    if spans:
                        x0, y0, _, y1 = line["bbox"]
                        column = 1 if x0 >= width * 0.45 else 0
                        text = "".join(s["text"] for s in line["spans"]).strip()
                        margin = y1 <= height * 0.08 or y0 >= height * 0.92
                        lines.append((column, round(y0, 1), x0, text, max(s["size"] for s in spans), margin))
            out.append([(t, size, margin) for _, _, _, t, size, margin in sorted(lines)])
    return out


def body_size(pages):
    sizes = Counter(round(size, 1) for page in pages for text, size, *_ in page for _ in range(len(text)))
    return sizes.most_common(1)[0][0] if sizes else 0


def furniture(pages, heading=HEADING):
    """Margin lines repeated across many pages: running headers and footers. A repeated line in the
    body of the page (a recommendation's standard opening words, say) is never furniture."""
    counts = Counter(text for page in pages for text in {t for t, _, margin in page if margin})
    threshold = max(3, int(len(pages) * 0.2))
    return {line for line, n in counts.items() if n >= threshold and not heading.match(line)}


def recommendations(pages, heading=HEADING, noise=(), first_page=1, last_page=None, any_order=False, title_size=None,
                    heading_size=None):
    """[(number, text, page, lines)] for the first run of "Recommendation N" headings from 1.

    pages: page_lines() output. Heading-sized lines straight after a heading are its title and
    are left out of the text. Lines in a smaller font than the body text (footnotes,
    captions, running heads) and repeated page furniture are dropped. A recommendation
    closes at the next heading, at a heading-like line after a complete sentence, or at a
    page break after a complete sentence unless the new page opens with a list item.
    After a close, the run resumes at the next number's heading if it follows within two
    pages, or later when that heading is set in a heading-sized font, and ends at the
    first heading out of sequence. Only pages first_page..last_page (1-based) are read.
    title_size overrides the font size from which lines straight after a heading count as its
    title, and heading_size the size below which a heading-like line is a cross-reference in the
    text. any_order accepts the headings in any order (a summary grouped by theme) and stops at
    the first repeated number; the rows are returned in number order.
    Callers check the numbering, complete() and the verbatim check before publishing.
    """
    skip, size, noise = furniture(pages, heading), body_size(pages), list(NOISE) + list(noise)
    out, current, prev, closed_at, seen = [], None, None, None, set()
    for pno, page in enumerate(pages, 1):
        if pno < first_page or (last_page and pno > last_page):
            continue
        first, stop = True, False
        for line, lsize, *_ in page:
            line = line.strip()
            m = heading.match(line)
            if m and heading_size and lsize < heading_size:
                m = None  # a cross-reference in the text, not a heading
            if closed_at and pno > closed_at + 2 and not (m and lsize >= size * 1.2):
                continue
            if not m and (not line or line in skip or any(n.match(line) for n in noise) or lsize < size * 0.88):
                continue
            if m:
                n = number(m.group(1))
                first = False
                if current and n == current["n"]:
                    if m.group(3):
                        current["lines"].append((pno, m.group(3)))
                    continue
                if follows(prev, n) or (any_order and n not in seen):
                    if current:
                        out.append(current)
                    current, closed_at = {"n": n, "page": pno, "lines": [(pno, m.group(3))] if m.group(3) else []}, None
                    prev, seen = n, seen | {n}
                    continue
                if out or current:
                    stop = True
                    break
                continue
            if current is None:
                first = False
                continue
            if not current["lines"] and lsize >= (title_size or size * 1.3):
                current.setdefault("title", []).append(line)
                first = False
                continue
            last = current["lines"][-1] if current["lines"] else (current["page"], "")
            ends = SENTENCE_END.search(last[1]) and not MARKER.match(last[1].strip())
            if (first and pno > last[0] and ends and not LIST_ITEM.match(line)) or (ends and lsize >= size * 1.3) or \
                    (ends and HEADINGISH.match(line) and len(line.split()) <= 9 and not line.startswith("That")):
                out.append(current)
                current, closed_at = None, pno
                continue
            first = False
            current["lines"].append((pno, line))
        if stop:
            break
    if current:
        out.append(current)
    rows = []
    for r in sorted(out, key=lambda r: r["n"]) if any_order else out:
        text = flat("\n".join(t for _, t in r["lines"]))
        rows.append((label(r["n"]), text, r["page"], r["lines"]))
    return rows


def complete(rows, pages, heading=HEADING):
    """No heading that would follow the last number exists anywhere in the document."""
    last = number(rows[-1][0]) if rows else None
    return not any(follows(last, number(m.group(1))) for page in pages for t, *_ in page if (m := heading.match(t.strip())))


def verified(rows, texts):
    """Each recommendation's lines appear on the pages they were read from (texts: page_texts())."""
    return all(verbatim(line, texts[pno - 1]) for _, _, _, lines in rows for pno, line in lines)
