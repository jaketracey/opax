"""
parli.ingest.act_hansard -- ACT Legislative Assembly Hansard (source `act_hansard`,
state `act`, chamber `act_la`).

Source: https://www.hansard.act.gov.au/ -- the Assembly's own site. Every sitting day
from 1989 is published as one PDF ("Daily Hansard" as an edited PROOF, replaced by the
final Weekly Hansard PDF once members' corrections are in). robots.txt allows the site,
no authentication, no API. Licence: CC BY-NC-ND 4.0 ("copy and share unaltered content
for non-commercial purposes so long as you attribute it to the ACT Legislative
Assembly", parliament.act.gov.au/functions/footer/reuse-policy). Speech text is stored
verbatim (whitespace normalised only), never rewritten.

  index    https://www.hansard.act.gov.au/hansard/debates(PDF).htm      (assembly/year pages)
           https://www.hansard.act.gov.au/hansard/<Nth>-assembly/<YYYY>/debates(PDF).htm
                                                         (one row per sitting day -> PDF link)
  final    .../<YYYY>/PDF/YYYYMMDD.pdf
  proof    .../<YYYY>/PDF/PYYMMDD.pdf   (and tPYYMMDD.pdf, a proof still being edited)

A day is loaded from its Final PDF when there is one, else from the newest proof. The
proof's rows are replaced in place (same speech_id, so citation URLs survive) when the
Final appears: rows are aligned turn by turn, changed text is updated, turns only the
Final has are inserted, turns only the proof had are removed, and every change to a row
the knowledge box may already hold is queued in `act_hansard_kb_queue`
(`--patch-kb` sends the PATCH/DELETE; see docs/DATA-ACT-HANSARD.md).

Parsing is layout-based (pdfminer.six, pure Python, no poppler): the Assembly's PDFs are
Word exports whose speaker labels are bold Times ("MR BARR (Kurrajong—Treasurer) (10.06):")
and whose headings are bold Arial, with a running header/footer to drop.

Usage:
    python -m parli.ingest.act_hansard --since 2026-08-30                # nightly window
    python -m parli.ingest.act_hansard --start 2024-11-06 --end 2026-09-17    # backfill
    python -m parli.ingest.act_hansard --start 2025-03-18 --end 2025-03-18 --dry-run
    python -m parli.ingest.act_hansard --members                          # roster for link_speakers
    python -m parli.ingest.act_hansard --patch-kb                         # send queued KB PATCH/DELETEs
"""

from __future__ import annotations

import argparse
import collections
import difflib
import functools
import hashlib
import io
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

print = functools.partial(print, flush=True)  # noqa: A001 - unbuffered for nohup/systemd logs

SOURCE = "act_hansard"
STATE = "act"
CHAMBER = "act_la"

BASE = "https://www.hansard.act.gov.au/hansard/"
INDEX_URL = BASE + "debates(PDF).htm"
MEMBERS_URL = "https://www.parliament.act.gov.au/members/current"
USER_AGENT = "OPAX research (https://opax.com.au; contact jake.tracey@noice.work)"

# robots.txt on hansard.act.gov.au: Allow /, Crawl-delay 0. We stay at one request a second.
REQUEST_DELAY = 1.0
MAX_RETRIES = 4

# Bump when a parser change alters the rows a document produces: days stored under an
# older version are re-parsed and aligned in place (text changes are queued for the box).
PARSER_VERSION = "4"

CACHE_DIR = Path(os.environ.get("OPAX_ACT_CACHE", "~/.cache/autoresearch/act_hansard")).expanduser()

# The corpus (arag_sync) drops anything under this and anything before DEFAULT_SINCE.
MIN_CORPUS_CHARS = 200

ELECTORATES = {
    "brindabella", "ginninderra", "molonglo", "kurrajong", "murrumbidgee", "yerrabi",
    "fraser", "namadgi", "canberra", "act",
}


# ─────────────────────────────────────────────────────────────────────────────
# HTTP
# ─────────────────────────────────────────────────────────────────────────────

class Fetcher:
    """Polite GETs: honest UA, >= REQUEST_DELAY between requests, retries with backoff."""

    def __init__(self, delay: float = REQUEST_DELAY, opener=None):
        self.delay = delay
        self._last = 0.0
        self._open = opener or urllib.request.urlopen
        self.requests = 0

    def fetch(self, url: str, *, etag: str | None = None, last_modified: str | None = None,
              timeout: int = 90) -> tuple[int, bytes, dict]:
        """(status, body, headers). With a stored ETag / Last-Modified the server can answer 304
        (status 304, empty body); the site's IIS honours both."""
        headers = {"User-Agent": USER_AGENT, "Accept": "*/*"}
        if etag:
            headers["If-None-Match"] = etag
        if last_modified:
            headers["If-Modified-Since"] = last_modified
        req = urllib.request.Request(url, headers=headers)
        err: Exception | None = None
        for attempt in range(MAX_RETRIES):
            wait = self.delay - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            self.requests += 1
            try:
                with self._open(req, timeout=timeout) as resp:
                    return resp.status if hasattr(resp, "status") else 200, resp.read(), dict(resp.headers.items())
            except urllib.error.HTTPError as e:
                err = e
                if e.code == 304:
                    return 304, b"", dict(e.headers.items()) if e.headers else {}
                if e.code in (404, 410):
                    raise
                if e.code == 403:
                    raise RuntimeError(f"403 from {url}: the site may now refuse this client") from e
            except Exception as e:  # noqa: BLE001 - network hiccups
                err = e
            time.sleep(2 ** (attempt + 1))
        raise RuntimeError(f"GET {url} failed after {MAX_RETRIES} tries: {err}")

    def get(self, url: str, timeout: int = 90) -> bytes:
        return self.fetch(url, timeout=timeout)[1]


# ─────────────────────────────────────────────────────────────────────────────
# Discovery: assembly/year index pages -> one entry per sitting day
# ─────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class DayDoc:
    date: str          # YYYY-MM-DD
    kind: str          # 'final' | 'proof'
    url: str
    name: str          # file name, e.g. 20250318.pdf / P250513.pdf / tP260203.pdf

    @property
    def rank(self) -> int:
        return 2 if self.kind == "final" else (1 if not self.name.startswith("tP") else 0)


PDF_NAME_RE = re.compile(r"^(?P<pre>tP|P)?(?P<d>\d{8}|\d{6})\.pdf$", re.I)
ANCHOR_RE = re.compile(r'<a\s+[^>]*?href="\s*([^"]+?)\s*"[^>]*>', re.I | re.S)
YEAR_PAGE_RE = re.compile(r'href="\s*((\d+(?:st|nd|rd|th))-assembly/(\d{4})/debates\(PDF\)\.htm)\s*"', re.I)


def classify_pdf_name(name: str) -> tuple[str, str] | None:
    """('final'|'proof', 'YYYY-MM-DD') for 20250318.pdf / P250513.pdf / tP260203.pdf, else None."""
    m = PDF_NAME_RE.match(name.strip())
    if not m:
        return None
    d = m.group("d")
    if len(d) == 6:
        d = ("20" if int(d[:2]) < 50 else "19") + d
    try:
        iso = date(int(d[:4]), int(d[4:6]), int(d[6:8])).isoformat()
    except ValueError:
        return None
    return ("proof" if m.group("pre") else "final"), iso


def parse_year_page(html: str, page_url: str) -> list[DayDoc]:
    """Every sitting-day PDF a year index page links to. One DayDoc per (date, file)."""
    docs: dict[tuple[str, str], DayDoc] = {}
    for href in ANCHOR_RE.findall(html):
        href = re.sub(r"\s+", "", href)
        name = href.rsplit("/", 1)[-1]
        c = classify_pdf_name(name)
        if not c:
            continue
        kind, iso = c
        docs[(iso, name)] = DayDoc(iso, kind, urljoin(page_url, href), name)
    return sorted(docs.values(), key=lambda d: (d.date, d.name))


def best_per_day(docs: list[DayDoc]) -> list[DayDoc]:
    """Final over proof over tP for each date."""
    best: dict[str, DayDoc] = {}
    for d in docs:
        if d.date not in best or d.rank > best[d.date].rank:
            best[d.date] = d
    return [best[k] for k in sorted(best)]


def year_pages(fetcher: Fetcher, years: set[int]) -> dict[int, list[str]]:
    """{year: [year page urls]} (an election year has two: the outgoing and the new assembly)."""
    html = fetcher.get(INDEX_URL).decode("utf-8", "replace")
    out: dict[int, list[str]] = collections.defaultdict(list)
    for href, _asm, year in YEAR_PAGE_RE.findall(html):
        if int(year) in years:
            out[int(year)].append(urljoin(INDEX_URL, re.sub(r"\s+", "", href)))
    return out


def discover(fetcher: Fetcher, start: date, end: date) -> list[DayDoc]:
    years = set(range(start.year, end.year + 1))
    pages = year_pages(fetcher, years)
    docs: list[DayDoc] = []
    for year in sorted(pages):
        for url in pages[year]:
            try:
                html = fetcher.get(url).decode("utf-8", "replace")
            except urllib.error.HTTPError as e:
                print(f"  index {url}: HTTP {e.code}; skipped")
                continue
            docs.extend(parse_year_page(html, url))
    return [d for d in best_per_day(docs) if start.isoformat() <= d.date <= end.isoformat()]


# ─────────────────────────────────────────────────────────────────────────────
# PDF -> visual lines
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class Line:
    page: int
    y: float
    x0: float
    size: float
    text: str
    bold_prefix: str      # text of the leading bold run ('' if the line starts regular)
    bold_frac: float
    italic_frac: float
    arial: bool           # dominant font is a sans face (the Assembly sets headings in Arial Bold)
    page_h: float = 842.0


def _is_bold(fontname: str) -> bool:
    f = fontname.lower()
    return "bold" in f or "black" in f or "semibold" in f


def _is_italic(fontname: str) -> bool:
    f = fontname.lower()
    return "italic" in f or "oblique" in f


def _is_sans(fontname: str) -> bool:
    f = fontname.lower()
    return any(k in f for k in ("arial", "helvetica", "univers", "calibri", "montserrat"))


def _walk_chars(obj):
    from pdfminer.layout import LTChar, LTContainer
    if isinstance(obj, LTChar):
        yield obj
    elif isinstance(obj, LTContainer):
        for c in obj:
            yield from _walk_chars(c)


def pdf_lines(pdf_bytes: bytes) -> list[Line]:
    """Visual lines of every page: glyphs grouped by baseline, ordered left to right.

    Building lines from glyph positions (laparams=None skips pdfminer's box analysis)
    keeps justified lines and hanging speaker labels in one piece and is faster than
    extract_text; each line carries the font facts the parser needs."""
    from pdfminer.high_level import extract_pages

    lines: list[Line] = []
    for pno, layout in enumerate(extract_pages(io.BytesIO(pdf_bytes), laparams=None)):
        glyphs = [c for c in _walk_chars(layout) if c.get_text() != ""]
        glyphs.sort(key=lambda c: (-c.y0, c.x0))
        rows: list[list] = []
        for c in glyphs:
            if rows and abs(rows[-1][0].y0 - c.y0) <= 2.2:
                rows[-1].append(c)
            else:
                rows.append([c])
        for row in rows:
            row.sort(key=lambda c: c.x0)
            # explicit space glyphs are kept for the text (justified lines squeeze the gap
            # between words below the geometric threshold) but never count as formatting
            ink = [c for c in row if c.get_text().strip()]
            if not ink:
                continue
            parts: list[str] = []
            prev = None
            for c in row:
                t = c.get_text()
                if not t.strip():
                    parts.append(" ")
                    continue
                if prev is not None and c.x0 - prev.x1 > 0.18 * max(c.size, 1):
                    parts.append(" ")
                parts.append(t)
                prev = c
            n = len(ink)
            bp_parts: list[str] = []
            prevc = None
            for c in row:
                if not c.get_text().strip():
                    if prevc is not None:
                        bp_parts.append(" ")
                    continue
                if not _is_bold(c.fontname):
                    break
                if prevc is not None and c.x0 - prevc.x1 > 0.18 * max(c.size, 1):
                    bp_parts.append(" ")
                bp_parts.append(c.get_text())
                prevc = c
            size = collections.Counter(round(c.size, 1) for c in ink).most_common(1)[0][0]
            lines.append(Line(
                page=pno, y=ink[0].y0, x0=ink[0].x0, size=size,
                text=re.sub(r"\s+", " ", "".join(parts)).strip(),
                bold_prefix=re.sub(r"\s+", " ", "".join(bp_parts)).strip(),
                bold_frac=sum(_is_bold(c.fontname) for c in ink) / n,
                italic_frac=sum(_is_italic(c.fontname) for c in ink) / n,
                arial=sum(_is_sans(c.fontname) for c in ink) / n > 0.6,
                page_h=float(getattr(layout, "height", 842.0)),
            ))
    return lines


# ─────────────────────────────────────────────────────────────────────────────
# Lines -> turns
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class Turn:
    idx: int
    speaker_raw: str            # the bold name as printed: 'MR BARR', 'Mr Cocks'
    speaker: str                # 'Mr Barr' (honorific + recased surname); the chair is 'Mr Speaker', never the member's name
    electorate: str
    topic: str
    text: str
    time: str = ""              # 'H:MM' as printed in the label (12-hour clock, no am/pm), if any
    page: int = 0
    is_chair: bool = False
    bare_label: bool = False    # label carried no electorate or time: 'Mr Barr: ...' (question time, interjections)
    paragraphs: int = 1

    @property
    def sha(self) -> str:
        return hashlib.sha256(self.text.encode("utf-8")).hexdigest()[:16]


HONORIFIC = r"(?:Mr|Ms|Mrs|Miss|Dr|Prof|Madam|Sir|Dame)"
# The bold run that opens a turn: an honorific then a surname ('MR BARR', 'Mrs Morris',
# 'MS LE COUTEUR', 'MR DEPUTY SPEAKER', 'MADAM ASSISTANT SPEAKER'), or a named office.
LABEL_NAME_RE = re.compile(
    rf"^(?P<hon>{HONORIFIC})\.?\s+(?P<name>[A-Za-z][A-Za-z'’\-\. ]{{1,50}})$", re.I)
OFFICE_LABEL_RE = re.compile(
    r"^(?:THE\s+CLERK|THE\s+SERJEANT-AT-ARMS|THE\s+CHAIR|MEMBERS?|A\s+MEMBER|OPPOSITION\s+MEMBERS?|"
    r"GOVERNMENT\s+MEMBERS?|CROSSBENCH\s+MEMBERS?|VISITOR|THE\s+GOVERNOR-GENERAL|"
    r"THE\s+ADMINISTRATOR)$", re.I)
CHAIR_RE = re.compile(r"\b(?:DEPUTY\s+|ASSISTANT\s+|ACTING\s+)*SPEAKER\b|\bCHAIR\b", re.I)
# The rest of a label after the bold name: (electorate—portfolios) (10.06), by leave: text
LABEL_REST_RE = re.compile(
    r"^\s*(?:\((?P<paren>[^()]*)\)\s*)?(?:\((?P<time>\d{1,2}[.:]\d{2})\s*(?:am|pm)?\)\s*)?"
    r"(?P<mod>,?\s*(?:by\s+leave|in\s+reply|in\s+explanation|in\s+response|by\s+way\s+of\s+explanation)"
    r"[^:()]{0,40}?)?\s*:\s*(?P<body>.*)$", re.S)
# Older volumes sometimes drop the colon: 'MR STANHOPE (Chief Minister, ...) (6.20) Mr Speaker, ...'
LABEL_REST_NOCOLON_RE = re.compile(
    r"^\s*(?:\((?P<paren>[^()]*)\)\s*)?\((?P<time>\d{1,2}[.:]\d{2})\s*(?:am|pm)?\)\s+(?P<body>[A-Z].*)$", re.S)
# A label whose role bracket lost its closing parenthesis in the source ('(Brindabella-Manager of
# Government Business, ... Emergency Services (12.18), by leave: ...', 2023).
LABEL_REST_UNCLOSED_RE = re.compile(
    r"^\s*\((?P<paren>[^()]*?)\s+\((?P<time>\d{1,2}[.:]\d{2})\s*(?:am|pm)?\)\s*"
    r"(?P<mod>,?\s*(?:by\s+leave|in\s+reply|in\s+explanation|in\s+response)[^:()]{0,40}?)?\s*:\s*(?P<body>.*)$", re.S)
# No-bold fallback: an upper-case label at the start of a paragraph.
UPPER_LABEL_RE = re.compile(
    r"^(?P<name>(?:MR|MS|MRS|MISS|DR|PROF|MADAM)\s+[A-Z][A-Z'’\-]+(?:\s+[A-Z][A-Z'’\-]+){0,3})"
    r"(?=\s*(?:\(|:))")

DATE_HEADING_RE = re.compile(
    r"^(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday),?\s+)?\d{1,2}(?:st|nd|rd|th)?\s+\w+\s+\d{4}$", re.I)

# Lines that end a turn without being anyone's words (the chair's formulae and the record's
# own narration). After one of these nothing is attributed until the next label or heading.
PROCEDURAL_RE = re.compile(
    r"^(?:"
    r"Question\s+(?:put|resolved|so\s+resolved|agreed|negatived)\b|Question\s*:|Questions?\s+put\b|"
    r"The\s+Assembly\s+voted|Ayes\b|Noes\b|"
    r"Original\s+question\b|"
    r"(?:Bill|Bills)\s+(?:read|agreed|passed)\b|"
    r"Leave\s+(?:granted|not\s+granted|refused)\b|"
    r"Debate\s+(?:adjourned|\(on\s+motion|resumed|on\s+motion|to\s+be)\b|"
    r"Sitting\s+(?:suspended|adjourned)\b|"
    r"Ordered\s+that\b|"
    r"Standing\s+orders?\s+(?:suspended|resumed)\b|"
    r"The\s+Assembly\s+(?:met|adjourned)\b|"
    r"(?:At\s+\d{1,2}[.:]\d{2}(?:\s*[ap]m)?,?\s+in\s+accordance|Debate\s+interrupted)|"
    r"(?:The\s+)?(?:Ayes|Noes),?\s+\d+|"
    r"Order!|"
    r"Words\s+ordered|"
    r"Time\s+expired|\(Time\s+expired"
    r")", re.I)
# 'Clause 9.' / 'Clauses 9 to 12, by leave, taken together and agreed to.' -- never 'Clause 12 deals with ...'
CLAUSE_RE = re.compile(
    r"^(?:Proposed\s+new\s+)?Clauses?\s+\d+[A-Za-z]?(?:\s*(?:to|and)\s*\d+[A-Za-z]?)*"
    r"(?:,?\s*(?:as\s+amended|by\s+leave|taken\s+together|and|agreed\s+to|negatived|passed|withdrawn))*[.:]?$", re.I)
# 'Chiaka Barry Yvette Berry Marisa Paterson' / 'Mr Berry Mr Corbell Mr Hird': a row of the
# division tables (names only, capitalised words, no punctuation but hyphens and apostrophes).
NAMELIST_LINE_RE = re.compile(r"^(?:(?:Mr|Ms|Mrs|Dr|Miss|Madam)\s+)?[A-Z][A-Za-z'’\-]+"
                              r"(?:\s+(?:(?:Mr|Ms|Mrs|Dr|Miss|Madam)\s+)?[A-Z][A-Za-z'’\-]+){0,11}$")
# A short line that only reports the fate of an item ('Mr Hanson’s amendments, as amended, agreed to.').
OUTCOME_RE = re.compile(
    r"^(?:(?:The|This|That)\s+)?(?:(?:Mr|Ms|Mrs|Dr|Miss|Madam)\s+[A-Z][\w’'\-]+(?:’s|'s)\s+)?"
    r"(?:amendments?|motions?|bills?|reports?|papers?|petitions?|paragraphs?|clauses?|question|schedule|title|preamble)\b"
    r"[^.?!]{0,140}?\b(?:agreed\s+to|negatived|carried|withdrawn|adopted|passed|resolved\s+in\s+the\s+\w+)\b[^.?!:]{0,60}[.:]?$", re.I)
# Narration the record prints in italics or plain type between a member's words.
STAGE_RE = re.compile(
    r"^(?:(?:Government|Opposition|Crossbench|Some|Several|All)\s+)?members?\s+interject(?:ing|ed)[.—–\-\s]*$|"
    r"^(?:(?:Mr|Ms|Mrs|Dr|Miss|Madam)\s+[A-Z][\w’'\-]+|The\s+(?:Speaker|Clerk|Chair))\s+interject(?:ing|ed)[.—–\-\s]*$|"
    r"^Discussion\s+concluded\.?$|^Honourable\s+members?\s+interject", re.I)


def _title_surname(s: str) -> str:
    """'STEPHEN-SMITH' -> 'Stephen-Smith', 'LE COUTEUR' -> 'Le Couteur', "O'BRIEN" -> "O'Brien"."""
    from parli.ingest.speaker_names import _recase_token
    out = []
    for tok in s.split():
        out.append(_recase_token(tok.upper()) if tok.isupper() or tok.islower() else _recase_token(tok))
    return " ".join(out)


def normalise_label(bold: str) -> tuple[str, str] | None:
    """('Mr Barr', 'barr') for a bold speaker label, or None if it is not a person/office."""
    b = re.sub(r"[\s:,]+$", "", re.sub(r"\s+", " ", bold)).strip()
    if not b or len(b) > 70:
        return None
    m = LABEL_NAME_RE.match(b)
    if m:
        hon = m.group("hon").capitalize().rstrip(".")
        name = m.group("name").strip()
        if not re.fullmatch(r"[A-Za-z][A-Za-z'’\-\. ]*", name):
            return None
        disp = f"{hon} {_title_surname(name)}"
        return disp, name.lower()
    if OFFICE_LABEL_RE.match(b):
        return b.title().replace("Of", "of"), b.lower()
    return None


def _is_furniture(l: Line) -> bool:
    return l.y > l.page_h - 62 or l.y < 50


def _para_text(lines: list[Line]) -> str:
    out = ""
    for l in lines:
        t = l.text
        if not out:
            out = t
        elif out.endswith("-") and t[:1].isalpha():
            out += t                    # 'Attorney-' / 'General': a real hyphen at the wrap
        else:
            out += " " + t
    return re.sub(r"[ \t]+", " ", out).strip()


@dataclass
class _Block:
    kind: str                # 'label' | 'heading' | 'body'
    lines: list[Line] = field(default_factory=list)
    level: int = 0
    label: tuple[str, str] | None = None
    name_part: str = ""         # the label's name as printed, e.g. 'MR  STEEL' normalised to 'MR STEEL'
    first_on_page: bool = False


INTERJ_RE = re.compile(rf"^(?P<name>{HONORIFIC}\.?\s+[A-Z][a-z'’\-]+(?:\s[A-Z][a-z'’\-]+)?)\s*:\s")


def _blocks(lines: list[Line]) -> list[_Block]:
    blocks: list[_Block] = []
    prev: Line | None = None
    # surnames that hold a confident bold/upper-case label somewhere in the day: a plain-type
    # 'Mr Moore: I take a point of order' is an interjection only if Mr Moore is speaking today
    known: set[str] = set()
    margins = collections.Counter()
    for l in lines:
        if l.bold_prefix and not l.arial and not _is_furniture(l):
            nl = normalise_label(l.bold_prefix)
            if nl:
                known.add(nl[1])
                margins[round(l.x0)] += 1
    margin = margins.most_common(1)[0][0] if margins else 90
    for l in lines:
        if _is_furniture(l) or re.search(r"\.{5,}\s*\d*\s*$", l.text):
            prev = None if _is_furniture(l) else prev
            continue
        first_on_page = prev is None or prev.page != l.page
        is_heading = l.arial and l.bold_frac > 0.85 and len(l.text) < 220
        # pre-2002 volumes set headings as centred bold Times, not Arial
        old_heading = (not is_heading and not l.arial and l.bold_frac > 0.95 and l.size >= 12
                       and l.x0 > margin + 15 and len(l.text) < 200 and not _is_furniture(l)
                       and not DATE_HEADING_RE.match(l.text))
        if old_heading and normalise_label(l.bold_prefix):
            old_heading = False
        is_heading = is_heading or old_heading
        label = None
        name_part = ""
        if not is_heading and l.bold_prefix and not l.arial and l.x0 < 120:
            # the bold run can spill over the label's punctuation ('MADAM SPEAKER (' in the 2012 volume)
            name_part = l.bold_prefix.rstrip(" (:,")
            label = normalise_label(name_part)
            if label and not re.match(r"\s*[(:,]|\s+[a-z]", l.text[len(name_part):] or ":"):
                label = None
        if label is None and not is_heading:
            # no bold run, or one that stops short ('MS STEPHEN' bold, '-SMITH:' in a regular-weight
            # hyphen glyph, seen in the 2026 proofs): fall back to the printed text
            m = UPPER_LABEL_RE.match(l.text)
            if m and l.x0 < 120:
                name_part = m.group("name")
                label = normalise_label(name_part)
            else:
                m = INTERJ_RE.match(l.text)
                if m and l.x0 < 120:
                    nl = normalise_label(m.group("name"))
                    if nl and nl[1] in known:
                        label, name_part = nl, m.group("name")
        dy = (prev.y - l.y) if (prev is not None and prev.page == l.page) else None
        if is_heading:
            level = (1 if l.size >= 13.5 else 2) if not old_heading else (1 if l.text.isupper() else 2)
            last = blocks[-1] if blocks else None
            if (last and last.kind == "heading" and last.level == level and dy is not None
                    and dy < 1.4 * l.size and prev is last.lines[-1]):
                last.lines.append(l)
            else:
                blocks.append(_Block("heading", [l], level))
        elif label:
            blocks.append(_Block("label", [l], label=label, name_part=name_part, first_on_page=first_on_page))
        else:
            new_para = (not blocks or blocks[-1].kind == "heading" or dy is None
                        or dy > 1.5 * max(l.size, 1))
            if blocks and blocks[-1].kind != "heading" and dy is None:
                # first line of a page: a continuation unless the block above ended a sentence
                tail = _para_text(blocks[-1].lines)
                new_para = bool(re.search(r"[.?!:;”\")\]]\s*$", tail)) or blocks[-1].kind == "heading"
            if new_para:
                blocks.append(_Block("body", [l], first_on_page=first_on_page))
            else:
                blocks[-1].lines.append(l)
        prev = l
    return blocks


# Typography the PDFs' fonts leave in the text layer: ligature glyphs would make "financial" and
# "reflect" unsearchable, a non-breaking hyphen splits "medium-term"; Symbol-font bullets come out
# as private-use characters. Nothing here changes a word.
_CHAR_FIXES = str.maketrans({
    "\ufb00": "ff", "\ufb01": "fi", "\ufb02": "fl", "\ufb03": "ffi", "\ufb04": "ffl", "\ufb05": "st",
    "\ufb06": "st", "\u2011": "-", "\u00ad": "", "\u200b": "", "\ufeff": "", "\u00a0": " ",
    "\uf0a7": "•", "\uf0b7": "•", "\uf0d8": "•",
})


def _clean_body(text: str) -> str:
    text = text.translate(_CHAR_FIXES)
    text = re.sub(r"\s+([,.;:?!])", r"\1", text)
    return re.sub(r"[ \t]+", " ", text).strip()


def parse_turns(lines: list[Line], trace: list | None = None) -> list[Turn]:
    """Speaker turns of one sitting day, in order, with the heading each sits under.

    `trace`, if given, collects (reason, text) for every paragraph that is dropped."""
    blocks = _blocks(lines)
    turns: list[Turn] = []
    h1 = h2 = ""
    cur: Turn | None = None
    paras: list[str] = []
    in_division = False
    started = False          # the cover, contents and date heading come before the first turn

    def close():
        nonlocal cur, paras
        if cur is not None:
            cur.text = "\n\n".join(p for p in paras if p).strip()
            cur.paragraphs = len(paras)
            if cur.text:
                turns.append(cur)
        cur, paras = None, []

    for b in blocks:
        if b.kind == "heading":
            close()
            in_division = False
            text = _para_text(b.lines)
            if not started:
                if trace is not None:
                    trace.append(("front-matter", text))
                continue
            if DATE_HEADING_RE.match(text):
                if trace is not None:
                    trace.append(("date-heading", text))
                continue
            if b.level == 1:
                h1, h2 = text, ""
            else:
                h2 = text
            continue
        if b.kind == "label":
            close()
            in_division = False
            first = b.lines[0]
            full = _para_text(b.lines)
            bold = b.name_part
            rest = full[len(bold):] if full.startswith(bold) else full
            m = LABEL_REST_RE.match(rest) or LABEL_REST_NOCOLON_RE.match(rest) or LABEL_REST_UNCLOSED_RE.match(rest)
            if not m:
                # a bold name that is not a speaker label ('Ms Cheyne, pursuant to standing order 211,
                # presented the following papers:'): the record's narration, the start of a new item.
                # The turn above is already closed and nothing is attributed until the next label.
                if trace is not None:
                    trace.append(("narration", full))
                continue
            disp, key = b.label
            started = True
            if OFFICE_LABEL_RE.match(bold.strip().rstrip(":")) and not CHAIR_RE.search(disp):
                # 'THE CLERK:', 'MEMBERS: Hear, hear!' -- procedure and noise, not a member's words
                if trace is not None:
                    trace.append(("office-label", full))
                continue
            paren = (m.group("paren") or "").strip()
            electorate = ""
            chair = bool(CHAIR_RE.search(disp))
            if paren:
                head = re.split(r"[—–]|\s-\s", paren)[0].strip()
                if head.lower() in ELECTORATES:
                    electorate = head.title() if head.lower() != "act" else "ACT"

            cur = Turn(
                idx=len(turns), speaker_raw=bold, speaker=disp, electorate=electorate,
                topic=(f"{h1}: {h2}" if h1 and h2 else (h1 or h2))[:300],
                text="", time=(m.group("time") or "").replace(".", ":"),
                page=first.page, is_chair=chair,
                bare_label=not paren and not m.group("time"),
            )
            body = _clean_body(m.group("body"))
            paras = [body] if body else []
            continue
        # body block
        text = _clean_body(_para_text(b.lines))
        if not text:
            continue
        italic = sum(l.italic_frac * len(l.text) for l in b.lines) / max(1, sum(len(l.text) for l in b.lines))
        if in_division:
            if (NAMELIST_LINE_RE.match(text) and len(text) < 260) or PROCEDURAL_RE.match(text) \
                    or (len(text) < 200 and OUTCOME_RE.match(text)):
                if trace is not None:
                    trace.append(("division", text))
                continue
            in_division = False
        if re.match(r"^(?:Ayes|Noes)\b|^The Assembly voted", text, re.I):
            close()
            in_division = True
            if trace is not None:
                trace.append(("division-start", text))
            continue
        if STAGE_RE.match(text):
            if trace is not None:
                trace.append(("stage-direction", text))
            continue
        if (PROCEDURAL_RE.match(text) or (len(text) < 200 and OUTCOME_RE.match(text))
                or (len(text) < 120 and CLAUSE_RE.match(text))):
            close()
            if trace is not None:
                trace.append(("procedural", text))
            continue
        if cur is None:
            if trace is not None:
                trace.append(("unattributed", text))
            continue
        if italic > 0.9 and len(text) < 400:
            if trace is not None:
                trace.append(("stage-direction", text))
            continue                     # stage direction ('Members interjecting.', '(Time expired.)')
        if (b.first_on_page and paras and len(paras) >= 1 and text[:1].islower()
                and not re.search(r"[.?!:;”\")\]]\s*$", paras[-1])):
            paras[-1] = _clean_body(paras[-1] + " " + text)
        else:
            paras.append(text)
    close()
    for i, t in enumerate(turns):
        t.idx = i
    return turns


def parse_pdf(pdf_bytes: bytes) -> list[Turn]:
    return parse_turns(pdf_lines(pdf_bytes))


# ─────────────────────────────────────────────────────────────────────────────
# Database
# ─────────────────────────────────────────────────────────────────────────────

DDL = """
CREATE TABLE IF NOT EXISTS act_hansard_days (
    date            TEXT PRIMARY KEY,
    kind            TEXT NOT NULL,          -- 'final' | 'proof'
    name            TEXT,                   -- 20250318.pdf / P250513.pdf / tP260203.pdf
    url             TEXT,
    etag            TEXT,
    last_modified   TEXT,
    doc_sha         TEXT,                   -- sha256 of the PDF bytes
    parser_version  TEXT,
    n_turns         INTEGER,
    fetched_at      TEXT,
    updated_at      TEXT
);
CREATE TABLE IF NOT EXISTS act_hansard_turns (
    speech_id  INTEGER PRIMARY KEY,         -- speeches.speech_id
    date       TEXT NOT NULL,
    turn_idx   INTEGER NOT NULL,            -- position within the day's transcript
    text_sha   TEXT NOT NULL,
    kind       TEXT NOT NULL                -- 'final' | 'proof': what the row's text came from
);
CREATE INDEX IF NOT EXISTS ix_act_hansard_turns_date ON act_hansard_turns (date, turn_idx);
CREATE TABLE IF NOT EXISTS act_hansard_kb_queue (
    speech_id  INTEGER PRIMARY KEY,
    op         TEXT NOT NULL,               -- 'patch' (text changed) | 'delete' (turn no longer in the Final)
    reason     TEXT,
    queued_at  TEXT NOT NULL,
    done_at    TEXT,
    error      TEXT
);
CREATE TABLE IF NOT EXISTS ext_ingest_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT NOT NULL, source TEXT NOT NULL,
    rows_loaded INTEGER, rows_deleted INTEGER, loaded_at TEXT NOT NULL, notes TEXT
);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def open_db(path: str | Path | None = None) -> sqlite3.Connection:
    """The parli database (default ~/.cache/autoresearch/parli.db) with this loader's tables.

    A scratch copy that has no `speeches` table yet gets the full schema."""
    from parli.schema import DEFAULT_DB_PATH, init_db

    db = sqlite3.connect(str(path or DEFAULT_DB_PATH), timeout=300)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA busy_timeout = 600000")
    db.execute("PRAGMA journal_mode = WAL")
    have = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "speeches" not in have or "members" not in have:
        init_db(db)
    db.executescript(DDL)
    db.commit()
    return db


def _speech_columns(db: sqlite3.Connection) -> set[str]:
    return {r[1] for r in db.execute("PRAGMA table_info(speeches)")}


def _speaker_key(name: str) -> str:
    return re.sub(r"[^a-z]", "", (name or "").lower())


def _norm_text(t: str) -> str:
    return re.sub(r"\s+", " ", t).strip().lower()


def align_turns(old: list[dict], new: list[Turn]) -> tuple[list[tuple[int, int]], list[int], list[int]]:
    """Match a stored day (`old`: speech_id, speaker_name, text in transcript order) to a fresh
    parse. Returns (pairs of (old index, new index), unmatched old indices, unmatched new indices).

    Turns are matched in order by speaker and text: a proof and its Final differ by corrections,
    so a turn whose words changed a little still matches (similarity >= 0.6), and a turn that was
    added, removed or rewritten wholesale does not."""
    okeys = [(_speaker_key(o["speaker_name"]), _norm_text(o["text"])[:80]) for o in old]
    nkeys = [(_speaker_key(t.speaker), _norm_text(t.text)[:80]) for t in new]
    sm = difflib.SequenceMatcher(None, okeys, nkeys, autojunk=False)
    pairs: list[tuple[int, int]] = []
    used_o: set[int] = set()
    used_n: set[int] = set()
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                pairs.append((i1 + k, j1 + k))
                used_o.add(i1 + k)
                used_n.add(j1 + k)
        elif tag == "replace":
            # pair rows of the same speaker whose text is similar, keeping order
            j = j1
            for i in range(i1, i2):
                for jj in range(j, j2):
                    if _speaker_key(old[i]["speaker_name"]) != _speaker_key(new[jj].speaker):
                        continue
                    a, b = _norm_text(old[i]["text"]), _norm_text(new[jj].text)
                    if difflib.SequenceMatcher(None, a[:4000], b[:4000], autojunk=False).quick_ratio() >= 0.6 and \
                            difflib.SequenceMatcher(None, a[:4000], b[:4000], autojunk=False).ratio() >= 0.6:
                        pairs.append((i, jj))
                        used_o.add(i)
                        used_n.add(jj)
                        j = jj + 1
                        break
    pairs.sort()
    return pairs, [i for i in range(len(old)) if i not in used_o], [j for j in range(len(new)) if j not in used_n]


def dedupe_turns(turns: list[Turn]) -> list[Turn]:
    """Drop exact repeats of (speaker, text) within a day ('Mr Cain: Yes.' twice), the key the
    other loaders and arag_sync use, and renumber so turn_idx stays dense."""
    seen: set[tuple[str, str]] = set()
    out: list[Turn] = []
    for t in turns:
        key = (t.speaker, t.sha)
        if key in seen:
            continue
        seen.add(key)
        out.append(t)
    for i, t in enumerate(out):
        t.idx = i
    return out


def load_day(db: sqlite3.Connection, doc: DayDoc, turns: list[Turn], *, doc_sha: str,
             etag: str | None = None, last_modified: str | None = None,
             fetched_at: str | None = None) -> dict:
    """Write one sitting day. First load inserts every turn; a reload of the same day (a Final
    replacing a proof, or a parser upgrade) updates rows in place, keeping speech_id.

    Returns counts: inserted, updated, deleted, unchanged, queued (rows queued for the box)."""
    stamp = fetched_at or now_iso()
    cols = _speech_columns(db)
    turns = dedupe_turns(turns)
    counts = dict(inserted=0, updated=0, deleted=0, unchanged=0, queued=0)
    old = [dict(r) for r in db.execute(
        "SELECT t.speech_id, t.turn_idx, t.text_sha, s.speaker_name, s.text, s.topic, s.electorate "
        "FROM act_hansard_turns t JOIN speeches s ON s.speech_id = t.speech_id "
        "WHERE t.date = ? ORDER BY t.turn_idx", (doc.date,))]

    def insert(t: Turn) -> int:
        cur = db.execute(
            "INSERT INTO speeches (person_id, speaker_name, party, electorate, chamber, date, topic, text, "
            "word_count, source, state) VALUES (NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)",
            (t.speaker, t.electorate or None, CHAMBER, doc.date, t.topic or None, t.text,
             len(t.text.split()), SOURCE, STATE))
        db.execute("INSERT INTO act_hansard_turns (speech_id, date, turn_idx, text_sha, kind) VALUES (?,?,?,?,?)",
                   (cur.lastrowid, doc.date, t.idx, t.sha, doc.kind))
        counts["inserted"] += 1
        return cur.lastrowid

    if not old:
        # rows of this day with no turn record (a database restored without the side tables, an
        # earlier hand load): never insert an exact (speaker, text) repeat
        seen = {(r["speaker_name"] or "", hashlib.sha256(r["text"].encode()).hexdigest()[:16])
                for r in db.execute("SELECT speaker_name, text FROM speeches WHERE source=? AND date=?",
                                    (SOURCE, doc.date))}
        for t in turns:
            key = (t.speaker, t.sha)
            if key in seen:
                counts["unchanged"] += 1
                continue
            seen.add(key)
            insert(t)
    else:
        pairs, gone, added = align_turns(old, turns)
        reset = []
        if "text_clean" in cols:
            reset.append("text_clean = NULL")
        if "text_clean_rules" in cols:
            reset.append("text_clean_rules = NULL")
        if "speaker_name_clean" in cols:
            reset.append("speaker_name_clean = NULL")
        for oi, nj in pairs:
            o, t = old[oi], turns[nj]
            changed = (o["text"] != t.text or (o["topic"] or "") != (t.topic or "")
                       or o["speaker_name"] != t.speaker or (o["electorate"] or "") != (t.electorate or ""))
            if changed:
                sets = "speaker_name=?, electorate=?, topic=?, text=?, word_count=?" + \
                       "".join(", " + r for r in reset)
                db.execute(f"UPDATE speeches SET {sets} WHERE speech_id=?",
                           (t.speaker, t.electorate or None, t.topic or None, t.text, len(t.text.split()),
                            o["speech_id"]))
                counts["updated"] += 1
                if o["text"] != t.text or (o["topic"] or "") != (t.topic or ""):
                    db.execute("INSERT OR REPLACE INTO act_hansard_kb_queue (speech_id, op, reason, queued_at) "
                               "VALUES (?, 'patch', ?, ?)", (o["speech_id"], f"{doc.kind} reload", stamp))
                    counts["queued"] += 1
            else:
                counts["unchanged"] += 1
            db.execute("UPDATE act_hansard_turns SET turn_idx=?, text_sha=?, kind=? WHERE speech_id=?",
                       (t.idx, t.sha, doc.kind, o["speech_id"]))
        for oi in gone:
            sid = old[oi]["speech_id"]
            db.execute("DELETE FROM speeches WHERE speech_id=?", (sid,))
            db.execute("DELETE FROM act_hansard_turns WHERE speech_id=?", (sid,))
            db.execute("INSERT OR REPLACE INTO act_hansard_kb_queue (speech_id, op, reason, queued_at) "
                       "VALUES (?, 'delete', ?, ?)", (sid, f"turn absent from the {doc.kind}", stamp))
            counts["deleted"] += 1
            counts["queued"] += 1
        for nj in added:
            # a new row gets the next speech_id, above the box checkpoint, so the ordinary
            # arag_sync push takes it; nothing to queue
            insert(turns[nj])
    db.execute(
        "INSERT INTO act_hansard_days (date, kind, name, url, etag, last_modified, doc_sha, parser_version, "
        "n_turns, fetched_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) "
        "ON CONFLICT(date) DO UPDATE SET kind=excluded.kind, name=excluded.name, url=excluded.url, "
        "etag=excluded.etag, last_modified=excluded.last_modified, doc_sha=excluded.doc_sha, "
        "parser_version=excluded.parser_version, n_turns=excluded.n_turns, fetched_at=excluded.fetched_at, "
        "updated_at=excluded.updated_at",
        (doc.date, doc.kind, doc.name, doc.url, etag, last_modified, doc_sha, PARSER_VERSION,
         len(turns), stamp, stamp))
    db.commit()
    return counts


# ─────────────────────────────────────────────────────────────────────────────
# One sitting day, end to end
# ─────────────────────────────────────────────────────────────────────────────

# A day that parses to fewer turns than this, or fewer than MIN_TURNS_PER_PAGE per PDF page
# (a real day gives 1.5-2), is a parse failure, never a sitting.
MIN_TURNS = 5
MIN_TURNS_PER_PAGE = 0.4
# A reload that would drop more than this share of a stored day's turns is refused.
MAX_SHRINK = 0.4


def cache_path(doc: DayDoc, cache_dir: Path = CACHE_DIR) -> Path:
    return cache_dir / "pdf" / doc.date[:4] / f"{doc.date}_{doc.name}"


def process_day(db: sqlite3.Connection | None, fetcher: Fetcher | None, doc: DayDoc, *,
                cache_dir: Path = CACHE_DIR, force: bool = False, offline: bool = False,
                dry_run: bool = False, in_window: bool = True) -> dict:
    """Fetch (or read the cached), parse and load one sitting day.

    status: 'loaded' | 'updated' | 'unchanged' | 'skipped' | 'error' (with `error`)."""
    res = {"date": doc.date, "kind": doc.kind, "name": doc.name, "status": "skipped"}
    row = None
    if db is not None:
        row = db.execute("SELECT * FROM act_hansard_days WHERE date=?", (doc.date,)).fetchone()
    same_file = bool(row and row["name"] == doc.name)
    if row and not force:
        if same_file and row["kind"] == "final" and row["parser_version"] == PARSER_VERSION:
            return res                          # a Final never changes
        if same_file and not in_window and row["parser_version"] == PARSER_VERSION:
            return res                          # an old proof the index still shows unchanged
        if row["kind"] == "final" and doc.kind == "proof":
            return res                          # never step back from a Final to a proof
    path = cache_path(doc, cache_dir)
    body: bytes | None = None
    etag = lm = None
    try:
        if offline:
            if not path.exists():
                res["status"] = "skipped"
                res["note"] = "not cached (--offline)"
                return res
            body = path.read_bytes()
        else:
            cond_etag = row["etag"] if (row and same_file and not force) else None
            cond_lm = row["last_modified"] if (row and same_file and not force) else None
            status, data, hdr = fetcher.fetch(doc.url, etag=cond_etag, last_modified=cond_lm)
            if status == 304:
                if row and row["parser_version"] == PARSER_VERSION:
                    return res
                body = path.read_bytes() if path.exists() else fetcher.fetch(doc.url)[1]
            else:
                body = data
                hl = {k.lower(): v for k, v in hdr.items()}
                etag, lm = hl.get("etag"), hl.get("last-modified")
                if not dry_run:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    tmp = path.with_suffix(".tmp")
                    tmp.write_bytes(body)
                    tmp.replace(path)
        sha = hashlib.sha256(body).hexdigest()
        if row and same_file and row["doc_sha"] == sha and row["parser_version"] == PARSER_VERSION and not force:
            res["status"] = "unchanged"
            return res
        lines = pdf_lines(body)
        pages = (max(l.page for l in lines) + 1) if lines else 0
        turns = dedupe_turns(parse_turns(lines))
    except Exception as e:  # noqa: BLE001 - one bad day must not stop the run
        res.update(status="error", error=f"{type(e).__name__}: {e}"[:300])
        return res
    res["turns"] = len(turns)
    res["turns_200"] = sum(1 for t in turns if len(t.text) >= MIN_CORPUS_CHARS)
    if len(turns) < MIN_TURNS or len(turns) < MIN_TURNS_PER_PAGE * pages:
        res.update(status="error", error=f"parsed only {len(turns)} turns from {doc.name} "
                                          f"({pages} pages, {len(body)} bytes): the layout may have changed")
        return res
    if dry_run or db is None:
        res["status"] = "parsed"
        res["turn_objects"] = turns
        return res
    prior = db.execute("SELECT COUNT(*) FROM act_hansard_turns WHERE date=?", (doc.date,)).fetchone()[0]
    if prior and len(turns) < prior * (1 - MAX_SHRINK):
        res.update(status="error", error=f"reload would cut {prior} stored turns to {len(turns)}; refused "
                                          f"(format change? re-run with --force after checking the parse)")
        return res
    try:
        counts = load_day(db, doc, turns, doc_sha=sha, etag=etag, last_modified=lm)
    except Exception as e:  # noqa: BLE001 - a database error on one day leaves that day as it was
        db.rollback()
        res.update(status="error", error=f"load failed: {type(e).__name__}: {e}"[:300])
        return res
    res.update(counts)
    res["status"] = "updated" if prior else "loaded"
    return res


def run(db: sqlite3.Connection | None, fetcher: Fetcher, start: date, end: date, *,
        cache_dir: Path = CACHE_DIR, force: bool = False, offline: bool = False, dry_run: bool = False,
        refresh_proofs: bool = True, limit_days: int | None = None) -> dict:
    """Discover the window, process every sitting day, and report."""
    t0 = time.time()
    print(f"ACT Hansard: {start} .. {end}" + (" (dry run)" if dry_run else ""))
    docs = discover(fetcher, start, end)
    in_window = {d.date for d in docs}
    if refresh_proofs and db is not None:
        # proofs older than the window whose Final may have appeared since
        old = [r[0] for r in db.execute(
            "SELECT date FROM act_hansard_days WHERE kind='proof' AND date < ? ORDER BY date", (start.isoformat(),))]
        if old:
            older = discover(fetcher, date.fromisoformat(old[0]), date.fromisoformat(old[-1]))
            wanted = set(old)
            docs += [d for d in older if d.date in wanted]
    docs = sorted(docs, key=lambda d: d.date)
    if limit_days:
        docs = docs[:limit_days]
    print(f"  {len(docs)} sitting days in the index")
    results = []
    for i, d in enumerate(docs, 1):
        r = process_day(db, fetcher, d, cache_dir=cache_dir, force=force, offline=offline,
                        dry_run=dry_run, in_window=d.date in in_window)
        results.append(r)
        if r["status"] not in ("skipped", "unchanged") or r.get("error"):
            bits = " ".join(f"{k}={r[k]}" for k in ("turns", "turns_200", "inserted", "updated", "deleted", "queued")
                            if k in r)
            print(f"  [{i}/{len(docs)}] {d.date} {d.kind:5s} {d.name:16s} {r['status']:9s} {bits}"
                  + (f"  ERROR {r['error']}" if r.get("error") else ""))
    summary = collections.Counter(r["status"] for r in results)
    ins = sum(r.get("inserted", 0) for r in results)
    upd = sum(r.get("updated", 0) for r in results)
    dele = sum(r.get("deleted", 0) for r in results)
    print(f"  done in {time.time() - t0:.0f}s: {dict(summary)}; speeches inserted {ins}, updated {upd}, "
          f"deleted {dele}; {fetcher.requests} requests")
    if db is not None and not dry_run and (ins or upd or dele):
        db.execute("INSERT INTO ext_ingest_log (table_name, source, rows_loaded, rows_deleted, loaded_at, notes) "
                   "VALUES ('speeches', ?, ?, ?, ?, ?)",
                   (SOURCE, ins, dele, now_iso(), f"{start}..{end}; updated {upd}; parser {PARSER_VERSION}"))
        db.commit()
    return {"results": results, "inserted": ins, "updated": upd, "deleted": dele,
            "errors": [r for r in results if r["status"] == "error"]}


# ─────────────────────────────────────────────────────────────────────────────
# Members: the sitting MLAs, so link_speakers can attach person_ids
# ─────────────────────────────────────────────────────────────────────────────

PARTY_LABELS = {
    "labor": "Labor", "alp": "Labor", "liberal": "Liberal", "liberals": "Liberal",
    "green": "Greens", "greens": "Greens", "independent": "Independent", "ind": "Independent",
}

_ROW_RE = re.compile(r"<tr>(.*?)</tr>", re.S | re.I)
_CELLS_RE = re.compile(r"<td[^>]*>(.*?)</td>", re.S | re.I)


def _plain(html_frag: str) -> str:
    """Text of an HTML fragment. Inline tags vanish without a space (the Assembly's page writes
    `<span>⬤ I</span>ndependent`); breaks and cell edges become one."""
    import html as _html
    frag = re.sub(r"<br\s*/?>|</?(?:td|tr|p|div|li)[^>]*>", " ", html_frag, flags=re.I)
    return re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", "", frag))).strip()


def parse_current_members(html: str) -> list[dict]:
    """The Assembly's 'Current members' table: name, electorate, party (as they are today).

    Facts only; the Assembly's member portraits are excluded from its CC BY-NC-ND licence and
    are never fetched. Raises if the page links more members than the table parsed (a layout
    change must not silently drop a member, as `<b>` for `<strong>` once did)."""
    out = []
    for row in _ROW_RE.findall(html):
        cells = _CELLS_RE.findall(row)
        if len(cells) < 3 or "/members/current/" not in cells[0]:
            continue
        a = re.search(r"<a[^>]*>(.*?)</a>", cells[0], re.S | re.I)
        if not a:
            continue
        inner = re.sub(r"<img[^>]*>", "", a.group(1))
        m = re.match(r"^(?P<first>.*?)<(?P<tag>strong|b)>(?P<last>.*?)</(?P=tag)>", inner, re.S | re.I)
        if m:
            first, last = _plain(m.group("first")), _plain(m.group("last"))
        else:                                    # no bold surname: the last word of the name
            words = _plain(inner).split()
            first, last = " ".join(words[:-1]), (words[-1] if words else "")
        electorate = _plain(cells[1])
        party_raw = re.sub(r"^[^A-Za-z]+", "", _plain(cells[2]))
        if not (first and last and electorate):
            continue
        out.append({
            "first_name": first, "last_name": last, "full_name": f"{first} {last}",
            "electorate": electorate, "party": PARTY_LABELS.get(party_raw.lower(), party_raw or None),
            "slug": re.search(r"/members/current/([\w\-]+)", cells[0]).group(1),
        })
    linked = set(re.findall(r"/members/current/([\w\-]+)", html))
    missing = linked - {m["slug"] for m in out}
    if missing:
        raise RuntimeError(f"members page links {sorted(missing)} that the table parse did not read; layout changed?")
    return out


def _member_safe(name: str) -> str:
    """link_speakers' person_id stem: lower case, spaces to underscores, only [a-z0-9_]."""
    return re.sub(r"[^a-z0-9_]", "", name.lower().replace(" ", "_").replace("'", ""))


def seed_members(db: sqlite3.Connection, members: list[dict]) -> dict:
    """Upsert the sitting MLAs into `members` (state 'act', chamber 'act_la').

    person_id follows link_speakers' surname-stub convention (`act_<surname>`), because that is
    the id its `seed_state_members` would make for the same person from the Hansard label; a
    stub that already exists is completed in place. Seeding under `act_<first>_<last>` instead
    would leave two people, a full-named member with no speeches and a surname stub with all of
    them. Two sitting members sharing a surname get `act_<first>_<last>`."""
    cols = {r[1] for r in db.execute("PRAGMA table_info(members)")}
    counts = {"inserted": 0, "updated": 0}
    for m in members:
        row = db.execute(
            "SELECT person_id FROM members WHERE state='act' AND (LOWER(full_name)=LOWER(?) OR LOWER(full_name)=LOWER(?) OR "
            "(LOWER(COALESCE(last_name,''))=LOWER(?) AND COALESCE(first_name,'') IN ('', ?)))",
            (m["full_name"], m["last_name"], m["last_name"], m["first_name"])).fetchone()
        if row:
            sets = ["first_name=?", "last_name=?", "full_name=?", "electorate=?", "chamber=?"]
            args = [m["first_name"], m["last_name"], m["full_name"], m["electorate"], CHAMBER]
            if m["party"]:
                sets.append("party=?")
                args.append(m["party"])
                if "party_canonical" in cols:
                    sets.append("party_canonical=?")
                    args.append(m["party"])
            db.execute(f"UPDATE members SET {', '.join(sets)} WHERE person_id=?", (*args, row[0]))
            counts["updated"] += 1
            continue
        pid = f"act_{_member_safe(m['last_name'])}"
        if db.execute("SELECT 1 FROM members WHERE person_id=?", (pid,)).fetchone():
            pid = f"act_{_member_safe(m['full_name'])}"
        fields = {"person_id": pid, "first_name": m["first_name"], "last_name": m["last_name"],
                  "full_name": m["full_name"], "party": m["party"], "electorate": m["electorate"],
                  "chamber": CHAMBER, "state": STATE}
        if "party_canonical" in cols and m["party"]:
            fields["party_canonical"] = m["party"]
        db.execute(f"INSERT OR IGNORE INTO members ({', '.join(fields)}) VALUES ({', '.join('?' * len(fields))})",
                   tuple(fields.values()))
        counts["inserted"] += 1
    db.commit()
    return counts


def load_members(db: sqlite3.Connection, fetcher: Fetcher) -> dict:
    html = fetcher.get(MEMBERS_URL).decode("utf-8", "replace")
    members = parse_current_members(html)
    if len(members) < 20:      # the Assembly has 25 seats; a short table means the page changed
        raise RuntimeError(f"members page parsed to {len(members)} rows (expected about 25); not loaded")
    counts = seed_members(db, members)
    print(f"ACT members: {len(members)} on the Assembly's list; inserted {counts['inserted']}, updated {counts['updated']}")
    return {"members": len(members), **counts}


# ─────────────────────────────────────────────────────────────────────────────
# Knowledge box: PATCH / DELETE for rows whose text changed after they were pushed
# ─────────────────────────────────────────────────────────────────────────────

def patch_kb(db: sqlite3.Connection, kb=None, *, limit: int = 500, dry_run: bool = False,
             checkpoint: int | None = None) -> dict:
    """Send the queued proof->final changes to the knowledge box.

    arag_sync pushes each speech once, by speech_id above a checkpoint, and its own repair path
    only rewrites text_clean rules; nothing re-sends a row whose text changed in place. This does:
      patch   row above the checkpoint: nothing to do (the next push carries the new text);
              row at or below it: PATCH the text field only (labels, origin, summaries untouched);
              a 404 means it was never pushed (it was under 200 characters as a proof): create it
              if the Final's text now qualifies.
      delete  DELETE the resource (a 404 counts as done)."""
    from parli.ingest import arag_sync as sync

    if checkpoint is None:
        state = sync.load_state()
        checkpoint = int(state.get("tables", {}).get("speeches", {}).get("after", 0))
    rows = db.execute("SELECT * FROM act_hansard_kb_queue WHERE done_at IS NULL ORDER BY speech_id LIMIT ?",
                      (limit,)).fetchall()
    out = collections.Counter()
    for q in rows:
        sid, op = q["speech_id"], q["op"]
        slug = f"speech-{sid}"
        status, err = "done", None
        try:
            if op == "delete":
                if not dry_run and sid <= checkpoint:
                    kb.delete_resource_by_slug(slug)
                status = "deleted" if sid <= checkpoint else "not-pushed"
            else:
                srow = db.execute("SELECT * FROM speeches WHERE speech_id=?", (sid,)).fetchone()
                if srow is None:
                    status = "gone"
                elif sid > checkpoint:
                    status = "not-pushed"
                elif not dry_run:
                    try:
                        kb.patch_resource_by_slug(slug, {"texts": sync._texts(sync.map_speech(srow)["texts"]["body"]["body"])})
                        status = "patched"
                    except sync.AragError as e:
                        if e.status != 404:
                            raise
                        eligible = db.execute(
                            "SELECT 1 FROM speeches WHERE speech_id=? AND LENGTH(text) >= ? AND date >= ? "
                            + sync.JUNK_PREDICATES, (sid, sync.MIN_SPEECH_CHARS, sync.DEFAULT_SINCE)).fetchone()
                        if eligible:
                            kb.create_resource(sync.map_speech(srow))
                            status = "created"
                        else:
                            status = "not-in-corpus"
                else:
                    status = "would-patch"
        except Exception as e:  # noqa: BLE001 - record and carry on
            status, err = "failed", f"{type(e).__name__}: {e}"[:300]
        out[status] += 1
        if not dry_run and status != "failed":
            db.execute("UPDATE act_hansard_kb_queue SET done_at=?, error=NULL WHERE speech_id=?", (now_iso(), sid))
        elif err:
            db.execute("UPDATE act_hansard_kb_queue SET error=? WHERE speech_id=?", (err, sid))
    db.commit()
    print(f"ACT KB patch: {dict(out)} (checkpoint speech_id {checkpoint})")
    return dict(out)


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def _date(s: str) -> date:
    return date.fromisoformat(s)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0],
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--since", "--start", dest="since", type=_date, help="first sitting date to load (YYYY-MM-DD)")
    ap.add_argument("--until", "--end", dest="until", type=_date, default=None, help="last date (default today)")
    ap.add_argument("--db", default=None, help="parli.db (default ~/.cache/autoresearch/parli.db)")
    ap.add_argument("--cache-dir", default=str(CACHE_DIR), help="raw PDF cache")
    ap.add_argument("--dry-run", action="store_true", help="fetch and parse, write nothing to the database")
    ap.add_argument("--force", action="store_true", help="re-fetch and re-parse days already loaded")
    ap.add_argument("--offline", action="store_true", help="use only the cached PDFs (index pages are still fetched)")
    ap.add_argument("--no-refresh-proofs", action="store_true",
                    help="do not look for Finals of proofs older than the window")
    ap.add_argument("--limit-days", type=int, default=None, help="process at most this many sitting days")
    ap.add_argument("--delay", type=float, default=REQUEST_DELAY, help="seconds between requests (>= 1)")
    ap.add_argument("--members", action="store_true", help="load the sitting MLAs into `members`, then exit")
    ap.add_argument("--patch-kb", action="store_true", help="send queued PATCH/DELETEs to the knowledge box, then exit")
    ap.add_argument("--patch-limit", type=int, default=500)
    ap.add_argument("--parse-file", help="parse one local PDF and print a summary (no network, no database)")
    ap.add_argument("--report-json", help="write the run report to this file")
    args = ap.parse_args(argv)

    if args.parse_file:
        turns = parse_pdf(Path(args.parse_file).read_bytes())
        print(json.dumps({"turns": len(turns), "turns_200": sum(len(t.text) >= MIN_CORPUS_CHARS for t in turns),
                          "speakers": collections.Counter(t.speaker for t in turns).most_common(12)}, indent=1))
        for t in turns[:5]:
            print(f"[{t.idx}] {t.speaker} ({t.electorate}) {t.time} | {t.topic} | {t.text[:140]!r}")
        return 0

    delay = max(1.0, args.delay)
    fetcher = Fetcher(delay=delay)
    if args.patch_kb:
        from parli.arag import AragConfig, KbClient, load_dotenv
        load_dotenv()
        cfg = AragConfig.from_env()
        db = open_db(args.db)
        patch_kb(db, KbClient(cfg) if cfg.kb_configured and not args.dry_run else None,
                 limit=args.patch_limit, dry_run=args.dry_run)
        return 0
    if args.members:
        db = open_db(args.db)
        load_members(db, fetcher)
        return 0
    if not args.since:
        ap.error("--since (or --start) is required")
    until = args.until or date.today()
    if until < args.since:
        ap.error("--until is before --since")
    db = None if args.dry_run and not args.db else open_db(args.db)
    report = run(db, fetcher, args.since, until, cache_dir=Path(args.cache_dir).expanduser(), force=args.force,
                 offline=args.offline, dry_run=args.dry_run, refresh_proofs=not args.no_refresh_proofs,
                 limit_days=args.limit_days)
    if args.report_json:
        slim = [{k: v for k, v in r.items() if k != "turn_objects"} for r in report["results"]]
        Path(args.report_json).write_text(json.dumps(slim, indent=1))
    if report["errors"]:
        print(f"{len(report['errors'])} day(s) failed: " + ", ".join(e["date"] for e in report["errors"]), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
