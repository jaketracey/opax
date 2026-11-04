"""
parli.ingest.committee_pdf -- Senate estimates transcripts imported from local PDF files (origin `local_pdf`).

Why this exists: ParlInfo refuses the honest agent (HTTP 403 since 10 Oct 2026; parli.ingest.http PAUSED_HOSTS), so the
HTML fragment ingest (parli.ingest.committee_hearings) cannot read new hearings. When Jake saves a round's published
"Proof Committee Hansard" PDFs by hand from APH's Estimates Transcript Schedule, this module turns them into the same
`speeches` rows the HTML ingest would write, without any request to APH. Automated APH acquisition stays paused.

Two halves, so the refresh box needs neither the PDFs nor a PDF library:

  stage   (desktop, pdfminer.six)  PDFs + the browser manifest -> data/staged/committee-pdf/<round>/
            manifest.json        the round, every hearing's provenance (sha256 of the PDF, ParlInfo display URL,
                                 acquisition note, revision), the schedule's pending hearings, per-hearing counts,
                                 and the sha256 of every staged file
            turns/<ref>.jsonl     one speaker turn per line (the row shape of the HTML ingest, plus page numbers)
            attendance/<ref>.jsonl  the In Attendance people (the rows committee_witnesses keeps)
            pages/<ref>.json      per-page character accounting: every glyph of every page is in exactly one class
  apply   (refresh box, stdlib)   staged files -> parli.db, idempotent, in one transaction per run; it refuses to
                                 touch the database when a staged hash does not match.

Row mapping (what the HTML ingest writes, and what this writes instead):

  source / chamber / state      committee_senate / senate_committee / federal (hearing_type 'estimates')
  hearing_id                    committees/estimate/<ref>/lpdf   (HTML: committees/estimate/<ref>/<4-digit fragment>;
                                'lpdf' is four characters, so `committee_witnesses fetch`'s substr(..., len-5) and every
                                rsplit('/', 1) still give the hearing base, and it can never equal a ParlInfo fragment)
  topic                         '<Committee> - Estimates - <PORTFOLIO> - <Agency>' from the PDF's section headings
  speaker_name / speaker_type   the label as printed ('Senator CASH', 'Ms Jones', 'CHAIR'), chair | member | witness |
                                unknown by the estimates rule: CHAIR labels are chair, 'Senator ...' are members,
                                everyone else is a witness
  handbook_id                   the senator's Parliamentary Handbook id. The PDF carries no member links, so the label
                                is looked up in a label -> PHID table built from APH's own member links in the cached
                                ParlInfo fragments of earlier hearings (senators.json); never a surname match against
                                `members`. Unknown labels stay NULL.
  person_id / speaker_name_clean / party_canonical
                                members only: PHID -> person_id through ext_handbook_people on the box (the same lookup
                                `committee_witnesses resolve` makes), then the member's full name and canonical party
  witness_name / witness_position / witness_organisation / speaker_name_clean
                                witnesses only, from the hearing's In Attendance blocks (committee_witnesses.match_roster);
                                person_id is always NULL for a witness
  source_url                    the ParlInfo display URL from the browser manifest
  source_attribution            'Proof Committee Hansard ... local_pdf ... sha256 ... saved in a browser by Jake, 4 Nov 2026'
  citation_anchor               the stable turn id, committees/estimate/<ref>/lpdf/<seq:04d>

Stable ids: a turn's id is its hearing plus its position in the PDF. The parse is deterministic, so the same PDF always
gives the same ids, and the 'lpdf' segment keeps them apart from every fragment id. ext_committee_pdf_turns maps each id
to its speech_id, so a re-apply inserts nothing.

Supersession (the rule): rows from a fuller source replace PDF rows, never sit beside them.
  1. HTML beats PDF. When parli.ingest.committee_hearings syncs a hearing that has local-PDF rows, it first fetches every
     fragment; only when all of them came back does it delete the PDF rows (queuing a knowledge-box DELETE for those
     already pushed) and store the fragments' rows. The PDF import never writes a hearing that has HTML rows.
  2. Official beats Proof. A staged PDF of a later revision (or a corrected copy) of an applied hearing is aligned turn by
     turn to the stored rows and updated IN PLACE (same speech_id, so the knowledge box gets a text PATCH, and turns the
     new copy drops are deleted and queued for a DELETE). An older revision never replaces a newer one.
  3. Same file, same hashes: nothing happens.

Usage:
    python -I scripts/stage_committee_pdf.py --input ~/opax-staging/committee-pdf/2026-10-supp-estimates \
        --out data/staged/committee-pdf/2026-10-supp-estimates      # desktop, once per round
    python -m parli.ingest.committee_pdf apply --db ~/.cache/autoresearch/parli.db   # nightly (every staged round)
    python -m parli.ingest.committee_pdf apply --dry-run             # verify hashes and say what would change
    python -m parli.ingest.committee_pdf verify                      # hashes only
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import os
import re
import sqlite3
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from parli.ingest.committee_witnesses import attendance_from_paragraphs, match_roster, split_honorific

ORIGIN = "local_pdf"
ROW_SUFFIX = "lpdf"                    # speeches.hearing_id = <hearing base>/lpdf
DATASET = "estimate"
SOURCE = "committee_senate"
CHAMBER = "senate_committee"
HEARING_TYPE = "estimates"
PARSER_VERSION = 1
MIN_TURN_CHARS = 50                    # committee_hearings.save_speeches stores nothing shorter
STAGED_ROOT = Path(__file__).resolve().parents[2] / "data" / "staged" / "committee-pdf"
REVISION_RANK = {"Proof": 1, "Official": 2, "Final": 2}
KB_QUEUE = "committee_kb_queue"        # committee_store.KB_QUEUE (kept literal: committee_store imports kb_text_patch)

SPACE_RE = re.compile(r"\s+")
DAYS = r"(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)"
MONTHS = ("january february march april may june july august september october november december").split()
HEADER_RE = re.compile(rf"^{DAYS},\s+(\d{{1,2}})\s+([A-Za-z]+)\s+(\d{{4}})\s+Senate\s+Page\s+(\d+)$")
CHAIR_RE = re.compile(r"^(?:the\s+)?(?:acting\s+|deputy\s+)?chair(?:man|woman|person)?\b", re.I)
SENATOR_RE = re.compile(r"^senator\s+\S", re.I)
UNKNOWN_LABEL_RE = re.compile(r"^(?:unidentified\s+(?:speaker|witness|senator)|an?\s+(?:honourable\s+)?senator|"
                              r"senators|witnesses|government senators|opposition senators)$", re.I)
PROCEDURAL_RE = re.compile(
    r"^(?:committee|hearing|proceedings|sitting)\s+(?:met|adjourned|suspended|resumed|commenced)\b"
    r"|^(?:short\s+)?suspension\b|^\[?\s*\d{1,2}\s*[:.]\s*\d{2}\s*\]?$", re.I)
INTERJECTION_RE = re.compile(r"^[A-Z][^.:]{0,80}\binterjecting\b[—–-]?\s*$")
TIMESTAMP_RE = re.compile(r"^\[\s*\d{1,2}\s*[:.]\s*\d{2}\s*\]$")
IN_ATTENDANCE_RE = re.compile(r"^in attendance:?$", re.I)
MEMBERS_RE = re.compile(r"^members in attendance:\s*(?:senators?\s+)?(?P<names>.+)$", re.I)


def log(*a) -> None:
    print(*a, flush=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def text_hash(text: str) -> str:
    """committee_hearings.text_hash: the dedup key's text part."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def hearing_base(ref: str) -> str:
    return f"committees/{DATASET}/{int(ref)}"


def row_hearing_id(ref: str) -> str:
    return f"{hearing_base(ref)}/{ROW_SUFFIX}"


def turn_id(ref: str, seq: int) -> str:
    return f"{row_hearing_id(ref)}/{seq:04d}"


def is_pdf_row_hearing_id(hid: str | None) -> bool:
    return bool(hid) and hid.endswith("/" + ROW_SUFFIX)


# ---------------------------------------------------------------------------
# Layout: glyphs -> visual lines (pdfminer is imported only here, so `apply` needs no PDF library)
# ---------------------------------------------------------------------------

@dataclass
class Line:
    page: int                  # 1-based PDF page
    x0: float
    y: float                   # baseline of the first glyph (PDF space: larger is higher)
    size: float                # most common glyph size
    text: str                  # whitespace collapsed
    bold_prefix: str           # the bold run that opens the line (a speaker label lives here)
    all_bold: bool
    all_italic: bool
    chars: int                 # non-space characters: what the page accounting counts
    x1: float = 0.0            # right edge of the last glyph


@dataclass
class Page:
    number: int
    width: float
    height: float
    lines: list[Line]

    @property
    def chars(self) -> int:
        return sum(ln.chars for ln in self.lines)


def read_pdf(path: str | Path) -> list[Page]:
    """Every page's visual lines: glyphs grouped by baseline and ordered left to right (the act_hansard method: building
    lines from glyph positions keeps justified lines and hanging speaker labels whole, and puts every glyph of the page,
    figures included, in exactly one line, so nothing can fall out unseen)."""
    from pdfminer.high_level import extract_pages

    from parli.ingest.act_hansard import _is_bold, _is_italic, _walk_chars

    pages: list[Page] = []
    for pno, layout in enumerate(extract_pages(str(path), laparams=None), 1):
        glyphs = [c for c in _walk_chars(layout) if c.get_text() != ""]
        glyphs.sort(key=lambda c: (-round(c.y0, 1), c.x0))
        rows: list[list] = []
        for c in glyphs:
            if rows and abs(rows[-1][0].y0 - c.y0) <= 2.2:
                rows[-1].append(c)
            else:
                rows.append([c])
        lines: list[Line] = []
        for row in rows:
            row.sort(key=lambda c: c.x0)
            ink = [c for c in row if c.get_text().strip()]
            if not ink:
                continue
            parts: list[str] = []
            bold_parts: list[str] = []
            in_bold = True
            prev = None
            for c in row:
                t = c.get_text()
                if not t.strip():
                    parts.append(" ")
                    if in_bold and prev is not None:
                        bold_parts.append(" ")
                    continue
                gap = prev is not None and c.x0 - prev.x1 > 0.18 * max(c.size, 1)
                if gap:
                    parts.append(" ")
                parts.append(t)
                if in_bold:
                    if _is_bold(c.fontname):
                        if gap:
                            bold_parts.append(" ")
                        bold_parts.append(t)
                    else:
                        in_bold = False
                prev = c
            size = collections.Counter(round(c.size, 1) for c in ink).most_common(1)[0][0]
            lines.append(Line(
                page=pno, x0=round(ink[0].x0, 1), y=round(ink[0].y0, 1), size=size,
                text=SPACE_RE.sub(" ", "".join(parts)).strip(),
                bold_prefix=SPACE_RE.sub(" ", "".join(bold_parts)).strip(),
                all_bold=all(_is_bold(c.fontname) for c in ink),
                all_italic=all(_is_italic(c.fontname) for c in ink),
                chars=0, x1=round(max(c.x1 for c in ink), 1)))
            lines[-1].chars = nonspace(lines[-1].text)
        pages.append(Page(number=pno, width=float(layout.width), height=float(layout.height), lines=lines))
    return pages


def nonspace(s: str) -> int:
    return sum(1 for ch in s if not ch.isspace())


# ---------------------------------------------------------------------------
# Lines -> paragraphs -> turns
# ---------------------------------------------------------------------------

CLASSES = ("cover", "header", "footer", "front", "attendance", "heading", "procedural", "label", "speech", "orphan")


@dataclass
class Cover:
    revision: str | None = None          # Proof | Official
    committee: str = ""                  # 'LEGAL AND CONSTITUTIONAL AFFAIRS LEGISLATION COMMITTEE'
    kind: str = ""                       # 'Estimates'
    date: str = ""                       # YYYY-MM-DD
    conditions: str = ""                 # the CONDITIONS OF DISTRIBUTION wording (stripped from the text)


@dataclass
class Turn:
    seq: int
    speaker_name: str
    speaker_type: str
    text: str
    topic: str
    portfolio: str | None
    agency: str | None
    pdf_page_start: int
    pdf_page_end: int
    printed_page_start: int | None
    printed_page_end: int | None
    named_as: str | None = None
    carried: bool = False                # a turn that continues the previous one after a section heading
    handbook_id: str | None = None
    handbook_basis: str | None = None
    speaker_name_clean: str | None = None
    witness_name: str | None = None
    witness_position: str | None = None
    witness_organisation: str | None = None


@dataclass
class ParsedHearing:
    cover: Cover
    members_in_attendance: list[str]
    attendance: list[dict]
    turns: list[Turn]
    pages: list[dict]                    # per page: number, printed, chars, per-class chars
    notes: list[str] = field(default_factory=list)

    def chars_kept(self) -> int:
        return sum(p["classes"].get("speech", 0) for p in self.pages)


@dataclass
class _Para:
    lines: list[Line]
    kind: str = "text"                   # text | label | heading | portfolio | procedural | attendance_head

    @property
    def text(self) -> str:
        return join_lines(self.lines)

    @property
    def first(self) -> Line:
        return self.lines[0]


def join_lines(lines: list[Line]) -> str:
    """A paragraph's lines as one string. A line that ends in a hyphen or a dash runs straight into the next one
    ('Attorney-' + 'General's', 'Indi—' + 'Dr'); Hansard prints its dashes unspaced."""
    out = ""
    for ln in lines:
        t = ln.text
        if not out:
            out = t
        elif out.endswith(("-", "—", "–", "/")):
            out += t
        else:
            out += " " + t
    return out.strip()


def parse_cover(page: Page) -> Cover:
    c = Cover()
    texts = [ln.text for ln in page.lines]
    joined = " ".join(texts)
    if re.search(r"\bproof committee hansard\b", joined, re.I) or re.search(r"\[proof copy\]", joined, re.I):
        c.revision = "Proof"
    elif re.search(r"\bcommittee hansard\b", joined, re.I):
        c.revision = "Official"
    caps = []
    started = False
    for ln in page.lines:
        t = ln.text
        if t.upper() == "SENATE":
            started = True
            continue
        if started and not c.kind:
            if t.isupper() and not re.search(r"\d", t):
                caps.append(t)
                continue
            c.kind = t
            started = False
    c.committee = " ".join(caps)
    m = re.search(rf"{DAYS.upper()},\s+(\d{{1,2}})\s+([A-Z]+)\s+(\d{{4}})", joined.upper())
    if m:
        c.date = f"{m.group(3)}-{MONTHS.index(m.group(2).lower()) + 1:02d}-{int(m.group(1)):02d}"
    cm = re.search(r"CONDITIONS OF DISTRIBUTION\s*(.*?)(?:BY AUTHORITY OF THE SENATE|\[PROOF COPY\]|$)", joined, re.S)
    if cm:
        c.conditions = cm.group(1).strip()
    return c


def parse_members(text: str) -> list[str]:
    """'Members in attendance: Senators Blyth, Cash, ... Thorpe and Whitten' -> ['Blyth', 'Cash', ..., 'Whitten']."""
    m = MEMBERS_RE.match(text.strip())
    if not m:
        return []
    names = re.split(r",\s*|\s+and\s+", m.group("names").strip().rstrip("."))
    return [SPACE_RE.sub(" ", n).strip() for n in names if n.strip()]


def split_label(line: Line) -> tuple[str, str] | None:
    """(label, rest of the line) when the line opens with a bold speaker label ending in a colon, else None."""
    bp = line.bold_prefix.strip()
    if not bp or line.size < 10:                     # quotations and incorporated documents are set smaller
        return None
    if bp.endswith(":"):
        label, rest = bp[:-1].strip(), line.text[len(bp):] if line.text.startswith(bp) else line.text.split(":", 1)[-1]
    else:
        after = line.text[len(bp):] if line.text.startswith(bp) else ""
        if not after.lstrip().startswith(":"):
            return None
        label, rest = bp, after.lstrip()[1:]
    label = SPACE_RE.sub(" ", label).strip()
    if not label or len(label) > 90 or ":" in label or re.match(r"^\d", label):
        return None
    if not looks_like_speaker(label):
        return None
    return label, rest.strip()


def looks_like_speaker(label: str) -> bool:
    base = re.sub(r"\s*\([^)]*\)\s*$", "", label).strip()
    if CHAIR_RE.match(base) or UNKNOWN_LABEL_RE.match(base):
        return True
    hon, _cls, tail = split_honorific(base)
    if hon and tail:
        return True
    return False


def classify_label(label: str) -> tuple[str, str, str | None]:
    """(speaker_name, speaker_type, named_as) the way committee_transcript._read_label leaves them."""
    named_as = None
    m = re.match(r"^(?P<lab>[^()]+?)\s*\((?P<par>[^)]*)\)?$", label)
    if m and CHAIR_RE.match(m.group("lab").strip()):
        label = m.group("lab").strip()
        named_as = SPACE_RE.sub(" ", m.group("par")).strip() or None
    if CHAIR_RE.match(label):
        if label.lower().startswith("the "):
            label = label[4:]
        return label, "chair", named_as
    if UNKNOWN_LABEL_RE.match(label):
        return label, "unknown", None
    if SENATOR_RE.match(label):
        return label, "member", None
    return label, "witness", None


_RUN_ON_END_RE = re.compile(r"(?:[,&/-]|\b(?:and|of|the|for|to|in|on|with|or|a|an))$", re.I)


def bold_runs_on(prev: Line, line: Line, right_edge: float) -> bool:
    if prev.x1 < right_edge - 50:
        return False
    return bool(_RUN_ON_END_RE.search(prev.text)) or line.text[:1].islower()


def page_margin(page: Page, header: Line | None) -> float:
    if header is not None:
        return header.x0
    xs = [ln.x0 for ln in page.lines if ln.size >= 10]
    return min(xs) if xs else 72.0


def parse_pages(pages: list[Page], committee_name: str, notes: list[str] | None = None) -> ParsedHearing:
    """One hearing's PDF pages -> cover, members, In Attendance rows, turns, and a per-page character account.

    Every line of every page lands in exactly one class (CLASSES); `speech` is what the turns keep."""
    notes = notes if notes is not None else []
    acct: dict[int, collections.Counter] = {p.number: collections.Counter() for p in pages}
    printed: dict[int, int | None] = {p.number: None for p in pages}

    def mark(line: Line, cls: str, chars: int | None = None) -> None:
        acct[line.page][cls] += line.chars if chars is None else chars

    cover = parse_cover(pages[0]) if pages else Cover()
    for ln in pages[0].lines if pages else []:
        mark(ln, "cover")

    footer_key = re.sub(r"[^A-Z]", "", committee_name.upper())
    members: list[str] = []
    body: list[Line] = []
    margins: dict[int, float] = {}
    seen_header = False
    for page in pages[1:]:
        header = None
        top = max((ln.y for ln in page.lines), default=0)
        mine: list[Line] = []
        for ln in page.lines:
            hm = HEADER_RE.match(ln.text)
            if hm and ln.y >= top - 1 and header is None:
                header = ln
                printed[page.number] = int(hm.group(4))
                mark(ln, "header")
                continue
            if ln.y < 60 and ln.text.isupper() and re.sub(r"[^A-Z]", "", ln.text.upper()) == footer_key:
                mark(ln, "footer")
                continue
            mine.append(ln)
        margins[page.number] = page_margin(page, header)
        if header is None and not seen_header:
            # front matter: the committee's name, the date and 'Members in attendance: Senators ...'
            for ln in mine:
                mark(ln, "front")
            joined = join_lines(mine)
            mi = joined.find("Members in attendance")
            if mi >= 0:
                members = parse_members(joined[mi:])
            continue
        if header is None:
            notes.append(f"p{page.number}: no running header (read as body text)")
        seen_header = True
        body.extend(mine)

    # paragraphs
    right_edge = {p.number: max((ln.x1 for ln in p.lines if ln.size >= 10), default=0.0) for p in pages}
    paras: list[_Para] = []
    cur: _Para | None = None
    for ln in body:
        margin = margins.get(ln.page, 72.0)
        indented = ln.x0 >= margin + 6
        centred = ln.x0 >= margin + 30 and ln.all_bold
        label = split_label(ln) if indented else None
        if ln.all_bold and ln.size >= 11.5 and label is None:
            kind = "portfolio"
        elif ln.all_bold and label is None and (centred or PROCEDURAL_RE.match(ln.text) or IN_ATTENDANCE_RE.match(ln.text)
                                                  or ln.text.lower().startswith("committee met")):
            kind = "heading"
            if PROCEDURAL_RE.match(ln.text) or ln.text.lower().startswith("committee met"):
                kind = "procedural"
            elif IN_ATTENDANCE_RE.match(ln.text):
                kind = "attendance_head"
        elif label is not None:
            kind = "label"
        elif TIMESTAMP_RE.match(ln.text):
            kind = "procedural"            # a time marker on a line of its own ('[12:15]')
        else:
            kind = "text"
        new = (cur is None or kind != "text" or cur.kind in ("portfolio", "heading", "procedural", "attendance_head")
               or indented or abs(ln.size - cur.first.size) > 0.5 or ln.all_bold != cur.lines[-1].all_bold
               # two bold lines (an In Attendance organisation, then a group inside it) are two headings; a bold line
               # runs on only when the one before it filled the line and broke mid-phrase ('... Environment and' /
               # 'Water', '..., Energy,' / 'the Environment')
               or (ln.all_bold and not bold_runs_on(cur.lines[-1], ln, right_edge.get(cur.lines[-1].page, 0.0))))
        if new:
            # a heading that wraps onto a second centred line is still one heading
            if (cur is not None and kind == cur.kind and kind in ("portfolio", "heading")
                    and cur.lines[-1].page == ln.page and 0 < cur.lines[-1].y - ln.y < 2.2 * ln.size):
                cur.lines.append(ln)
                continue
            cur = _Para(lines=[ln], kind=kind)
            paras.append(cur)
        else:
            cur.lines.append(ln)

    # paragraphs -> attendance blocks, headings and turns
    attendance: list[dict] = []
    turns: list[Turn] = []
    portfolio: str | None = None
    agency: str | None = None
    kind_word = cover.kind or "Estimates"
    open_turn: Turn | None = None
    open_parts: list[str] = []
    last_turn: Turn | None = None
    block: list[_Para] | None = None

    def topic() -> str:
        return " - ".join(p for p in (committee_name, kind_word, portfolio, agency) if p)

    def close_turn() -> None:
        nonlocal open_turn, open_parts
        if open_turn is not None:
            open_turn.text = "\n\n".join(p for p in open_parts if p).strip()
            turns.append(open_turn)
        open_turn, open_parts = None, []

    def flush_block() -> None:
        nonlocal block
        if block:
            rows = attendance_from_paragraphs(
                (p.text, all(ln.all_bold for ln in p.lines), False,
                 p.first.x0 >= margins.get(p.first.page, 72.0) + 6 and not p.first.all_bold) for p in block)
            for r in rows:
                r["seq"] = len(attendance) + 1
                r["fragment"] = ROW_SUFFIX
                r["pdf_page"] = block[0].first.page
                attendance.append(r)
            if not rows:
                notes.append(f"p{block[0].first.page}: an In Attendance block with no people")
        block = None

    def start_turn(name: str, kind: str, named_as: str | None, line: Line, carried: bool = False) -> Turn:
        nonlocal open_turn, open_parts
        close_turn()
        open_turn = Turn(seq=0, speaker_name=name, speaker_type=kind, text="", topic=topic(), portfolio=portfolio,
                         agency=agency, pdf_page_start=line.page, pdf_page_end=line.page,
                         printed_page_start=printed.get(line.page), printed_page_end=printed.get(line.page),
                         named_as=named_as, carried=carried)
        open_parts = []
        return open_turn

    def extend(turn: Turn, para: _Para) -> None:
        last = para.lines[-1]
        turn.pdf_page_end = max(turn.pdf_page_end, last.page)
        if printed.get(last.page) is not None:
            turn.printed_page_end = printed[last.page]

    for para in paras:
        if block is not None:
            ends = para.kind in ("label", "procedural", "portfolio") or (para.kind == "heading")
            if not ends and para.kind in ("text", "attendance_head"):
                if para.kind == "attendance_head":
                    flush_block()
                    block = [para]
                else:
                    block.append(para)
                for ln in para.lines:
                    mark(ln, "attendance")
                continue
            flush_block()
        if para.kind == "attendance_head":
            close_turn()
            block = [para]
            for ln in para.lines:
                mark(ln, "attendance")
            continue
        if para.kind == "portfolio":
            close_turn()
            portfolio, agency = para.text, None
            for ln in para.lines:
                mark(ln, "heading")
            continue
        if para.kind == "heading":
            close_turn()
            agency = para.text
            for ln in para.lines:
                mark(ln, "heading")
            continue
        if para.kind == "procedural":
            for ln in para.lines:
                mark(ln, "procedural")
            continue
        if para.kind == "label":
            label, rest = split_label(para.first)
            name, kind, named_as = classify_label(label)
            t = start_turn(name, kind, named_as, para.first)
            last_turn = t
            # the label's own characters, then the body text (first line's remainder plus the other lines)
            label_chars = para.first.chars - nonspace(rest)
            mark(para.first, "label", label_chars)
            acct[para.first.page]["speech"] += nonspace(rest)
            for ln in para.lines[1:]:
                mark(ln, "speech")
            body_text = join_lines([Line(**{**asdict(para.first), "text": rest})] + para.lines[1:]) if rest or len(para.lines) > 1 else ""
            open_parts.append(body_text)
            extend(t, para)
            continue
        # plain text
        text = para.text
        if (para.first.all_italic and INTERJECTION_RE.match(text)) or (len(text) < 120 and PROCEDURAL_RE.match(text)):
            # a reporter's line ('[09:06]', 'Proceedings suspended ...', 'Senator Cash interjecting—'), not speech
            for ln in para.lines:
                mark(ln, "procedural")
            continue
        if open_turn is None:
            if last_turn is None:
                for ln in para.lines:
                    mark(ln, "orphan")
                notes.append(f"p{para.first.page}: text before any speaker: {text[:60]!r}")
                continue
            # a speech that runs on past a section heading: the same speaker, under the new heading (the HTML
            # ingest's carry across a fragment boundary)
            last_turn = start_turn(last_turn.speaker_name, last_turn.speaker_type, last_turn.named_as, para.first,
                                   carried=True)
        for ln in para.lines:
            mark(ln, "speech")
        open_parts.append(text)
        extend(open_turn, para)
    flush_block()
    close_turn()

    kept = [t for t in turns if t.text]
    for n, t in enumerate(kept, 1):
        t.seq = n
    page_rows = []
    for p in pages:
        c = acct[p.number]
        total = p.chars
        if sum(c.values()) != total:
            notes.append(f"p{p.number}: accounting mismatch {sum(c.values())} != {total}")
        page_rows.append({"page": p.number, "printed": printed.get(p.number), "chars": total,
                          "classes": {k: c[k] for k in CLASSES if c.get(k)}})
    return ParsedHearing(cover=cover, members_in_attendance=members, attendance=attendance, turns=kept,
                         pages=page_rows, notes=notes)


# ---------------------------------------------------------------------------
# Who is speaking
# ---------------------------------------------------------------------------

ROSTER_MIN_SEEN = 3          # a label -> PHID pair must be seen this often in ParlInfo's member links ...
ROSTER_MIN_SHARE = 0.85      # ... and carry this share of the label's links (ParlInfo also prints short internal ids)


def label_key(label: str) -> str:
    return SPACE_RE.sub(" ", label.replace("’", "'")).strip().casefold()


def build_senator_roster(cache_dir: str | Path) -> dict:
    """label -> PHID for senators, from APH's own member links in the cached ParlInfo committee fragments (the gzip
    cache committee_hearings and committee_witnesses fill). No request is made. A label is kept only when one PHID
    dominates its links: ParlInfo sometimes prints a short internal id in place of the Handbook id ('263' for 121628),
    and the two never agree often enough to pass ROSTER_MIN_SHARE."""
    from parli.ingest.committee_store import read_cached_page
    from parli.ingest.committee_transcript import HearingMetadata, parse_fragment, parse_toc

    root = Path(cache_dir).expanduser()
    obs: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    shown: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    last: dict[tuple[str, str], str] = {}
    bases = sorted({re.sub(r"-\d{4}\.html(?:\.gz)?$", "", f.name) for f in root.glob("committees-*-*-*.html*")})
    hearings = 0
    for stem in bases:
        m = re.fullmatch(r"committees-(estimate|commsen|commrep|commjnt)-(\d+)", stem)
        if not m:
            continue
        base = f"committees/{m.group(1)}/{m.group(2)}"
        toc_html = read_cached_page(root, base, "0000")
        toc = parse_toc(toc_html, base) if toc_html else None
        if not toc or not toc.date or m.group(1) not in ("estimate", "commsen"):
            continue
        hearings += 1
        h = HearingMetadata(hearing_id=base, dataset=m.group(1), committee_name=toc.committee_name, date=toc.date)
        for frag in toc.fragment_ids:
            page = read_cached_page(root, base, frag)
            if not page:
                continue
            for t in parse_fragment(page, h, frag):
                if t.speaker_type == "member" and t.handbook_id and SENATOR_RE.match(t.speaker_name):
                    k = label_key(t.speaker_name)
                    obs[k][t.handbook_id] += 1
                    shown[k][t.speaker_name] += 1
                    last[(k, t.handbook_id)] = max(last.get((k, t.handbook_id), ""), toc.date)
    labels = {}
    for k, c in sorted(obs.items()):
        phid, n = c.most_common(1)[0]
        total = sum(c.values())
        if n < ROSTER_MIN_SEEN or n / total < ROSTER_MIN_SHARE:
            continue
        labels[k] = {"phid": phid, "label": shown[k].most_common(1)[0][0], "seen": n, "links": total,
                     "last_seen": last.get((k, phid))}
    phid_labels = collections.Counter(v["phid"] for v in labels.values())
    return {"built_from": "member links (handbook/allmps/<PHID>) in cached ParlInfo Senate committee fragments",
            "hearings_read": hearings, "min_seen": ROSTER_MIN_SEEN, "min_share": ROSTER_MIN_SHARE,
            "labels": labels, "phids_with_several_labels": sorted(p for p, n in phid_labels.items() if n > 1)}


def resolve_speakers(turns: list[Turn], attendance: list[dict], roster: dict) -> collections.Counter:
    """Fill handbook_id (members, by label -> PHID) and the witness fields (from the In Attendance rows, the way
    `committee_witnesses resolve` does: match_roster by surname, honorific breaking ties). Returns counts."""
    labels = roster.get("labels", {})
    stats = collections.Counter()
    for t in turns:
        if t.speaker_type == "member":
            hit = labels.get(label_key(t.speaker_name))
            if hit:
                t.handbook_id, t.handbook_basis = hit["phid"], "parlinfo_label"
                stats["member_phid"] += 1
            else:
                stats["member_unresolved"] += 1
        elif t.speaker_type == "chair":
            stats["chair"] += 1
            if t.named_as and SENATOR_RE.match(t.named_as):
                hit = labels.get(label_key(t.named_as))
                if hit:
                    t.handbook_id, t.handbook_basis = hit["phid"], "parlinfo_label"
        elif t.speaker_type == "witness":
            hon, cls, tail = split_honorific(t.speaker_name)
            hit = match_roster(tail if hon else t.speaker_name, cls, attendance)
            if hit:
                t.speaker_name_clean = t.witness_name = hit["name"]
                t.witness_position, t.witness_organisation = hit["position"], hit["organisation"]
                stats["witness_matched"] += 1
            else:
                t.witness_name = t.speaker_name
                t.speaker_name_clean = tail or t.speaker_name
                stats["witness_unmatched"] += 1
        else:
            stats["unknown"] += 1
    return stats


# ---------------------------------------------------------------------------
# Staging (desktop): PDFs -> data/staged/committee-pdf/<round>/
# ---------------------------------------------------------------------------

# A staged turn keeps what varies from turn to turn; the hearing's constants (ids, date, committee, source) live in the
# manifest and expand_turn() puts them back. Empty fields are left out.
TURN_FIELDS = ("turn_id", "seq", "portfolio", "agency", "speaker_name", "speaker_type", "named_as", "carried",
               "handbook_id", "speaker_name_clean", "witness_name", "witness_position", "witness_organisation",
               "pdf_pages", "printed_pages", "text", "text_sha256")
ATTENDANCE_FIELDS = ("seq", "honorific", "honorific_class", "name", "surname", "postnominals", "position",
                     "organisation", "group_heading", "kind", "fragment", "pdf_page")


def ddmmyyyy_to_iso(d: str) -> str:
    dd, mm, yyyy = d.split("/")
    return f"{yyyy}-{int(mm):02d}-{int(dd):02d}"


def committee_full_name(committee: str) -> str:
    """'Legal and Constitutional Affairs' (the schedule) -> 'Legal and Constitutional Affairs Legislation Committee'
    (what ParlInfo calls it and what the HTML ingest stores)."""
    return committee if committee.lower().endswith("committee") else f"{committee} Legislation Committee"


def compose_topic(committee_name: str, kind: str | None, portfolio: str | None, agency: str | None) -> str:
    return " - ".join(p for p in (committee_name, kind or "Estimates", portfolio, agency) if p)


def turn_record(ref: str, t: Turn) -> dict:
    rec = {"turn_id": turn_id(ref, t.seq), "seq": t.seq, "portfolio": t.portfolio, "agency": t.agency,
           "speaker_name": t.speaker_name, "speaker_type": t.speaker_type, "named_as": t.named_as,
           "carried": t.carried or None, "handbook_id": t.handbook_id, "speaker_name_clean": t.speaker_name_clean,
           "witness_name": t.witness_name, "witness_position": t.witness_position,
           "witness_organisation": t.witness_organisation, "pdf_pages": [t.pdf_page_start, t.pdf_page_end],
           "printed_pages": [t.printed_page_start, t.printed_page_end], "text": t.text,
           "text_sha256": sha256_bytes(t.text.encode("utf-8"))}
    return {k: rec[k] for k in TURN_FIELDS if rec[k] not in (None, "")}


def expand_turn(h: dict, t: dict) -> dict:
    """A staged turn with its hearing's constants: the full record apply() writes from."""
    return {**t, "hearing_id": h["hearing_id"], "row_hearing_id": row_hearing_id(h["ref"]), "source": SOURCE,
            "chamber": CHAMBER, "hearing_type": HEARING_TYPE, "date": h["date"], "committee_name": h["committee_name"],
            "topic": compose_topic(h["committee_name"], h.get("kind"), t.get("portfolio"), t.get("agency"))}


def jsonl(rows: list[dict]) -> bytes:
    return "".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in rows).encode("utf-8")


def write_bytes(path: Path, data: bytes) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)
    return sha256_bytes(data)


def stage_round(input_dir: str | Path, out_dir: str | Path, roster: dict, *, round_id: str | None = None,
                acquisition_note: str, acquired_on: str, reader=None, say=log) -> dict:
    """Parse every PDF the browser manifest lists, check it against the manifest, and write the staged round.
    `reader` (tests) stands in for read_pdf.

    Refuses (ValueError) a PDF whose bytes or sha256 differ from the manifest, or whose cover disagrees with it on
    revision, committee or date. Returns the staged manifest."""
    src = Path(input_dir).expanduser()
    out = Path(out_dir)
    browser = json.loads((src / "manifest.json").read_text(encoding="utf-8"))
    schedule_path = src / "schedule.json"
    schedule = json.loads(schedule_path.read_text(encoding="utf-8")) if schedule_path.exists() else []
    hearings = []
    files: dict[str, str] = {}
    for entry in sorted(browser, key=lambda e: int(e["ref"])):
        ref = str(int(entry["ref"]))
        pdf = src / entry["filename"]
        data = pdf.read_bytes()
        digest = sha256_bytes(data)
        if digest != entry["sha256"] or len(data) != int(entry["bytes"]):
            raise ValueError(f"{pdf.name}: sha256/bytes differ from manifest.json; refusing to stage it")
        committee_name = committee_full_name(entry["committee"])
        date_iso = ddmmyyyy_to_iso(entry["date"])
        say(f"  {ref} {date_iso} {committee_name}: parsing {entry['pages']} pages")
        pages = (reader or read_pdf)(pdf)
        parsed = parse_pages(pages, committee_name)
        cov = parsed.cover
        problems = []
        if len(pages) != int(entry["pages"]):
            problems.append(f"{len(pages)} pages, manifest says {entry['pages']}")
        if cov.revision != entry.get("revision_status"):
            problems.append(f"cover revision {cov.revision!r}, manifest {entry.get('revision_status')!r}")
        if cov.date != date_iso:
            problems.append(f"cover date {cov.date}, manifest {date_iso}")
        if re.sub(r"[^a-z]", "", cov.committee.lower()) != re.sub(r"[^a-z]", "", committee_name.lower()):
            problems.append(f"cover committee {cov.committee!r}, manifest {committee_name!r}")
        if problems:
            raise ValueError(f"{pdf.name}: " + "; ".join(problems))
        stats = resolve_speakers(parsed.turns, parsed.attendance, roster)
        for t in parsed.turns:
            if t.topic != compose_topic(committee_name, cov.kind, t.portfolio, t.agency):
                raise ValueError(f"{pdf.name}: turn {t.seq} topic {t.topic!r} cannot be rebuilt from its headings")
        turns = [turn_record(ref, t) for t in parsed.turns]
        attendance = [{k: r.get(k) for k in ATTENDANCE_FIELDS} for r in parsed.attendance]
        rel_turns, rel_att, rel_pages = f"turns/{ref}.jsonl", f"attendance/{ref}.jsonl", f"pages/{ref}.json"
        files[rel_turns] = write_bytes(out / rel_turns, jsonl(turns))
        files[rel_att] = write_bytes(out / rel_att, jsonl(attendance))
        page_doc = {"hearing_id": hearing_base(ref), "pdf_sha256": digest, "pages": parsed.pages, "notes": parsed.notes}
        files[rel_pages] = write_bytes(out / rel_pages, (json.dumps(page_doc, indent=1, ensure_ascii=False) + "\n").encode("utf-8"))
        unresolved = collections.Counter(t["speaker_name"] for t in turns
                                         if t["speaker_type"] == "member" and not t.get("handbook_id"))
        classes = collections.Counter()
        for p in parsed.pages:
            classes.update(p["classes"])
        hearings.append({
            "ref": ref, "hearing_id": hearing_base(ref), "row_hearing_id": row_hearing_id(ref),
            "committee": entry["committee"], "committee_name": committee_name, "date": date_iso,
            "revision": cov.revision, "schedule_status": entry.get("status"), "kind": cov.kind,
            "origin": ORIGIN, "acquisition_note": acquisition_note, "acquired_on": acquired_on,
            "pdf": {"filename": entry["filename"], "sha256": digest, "bytes": len(data), "pages": len(pages)},
            "source_url": entry["source_url"], "pdf_url": entry.get("pdf_url"),
            "members_in_attendance": parsed.members_in_attendance,
            "turns": len(turns), "turns_storable": sum(1 for t in turns if len(t["text"]) >= MIN_TURN_CHARS),
            "attendance": len(attendance), "chars_total": sum(p["chars"] for p in parsed.pages),
            "chars_kept": parsed.chars_kept(), "chars_by_class": dict(sorted(classes.items())),
            "speakers": dict(sorted(stats.items())),
            "unresolved_member_labels": dict(sorted(unresolved.items())),
            "turns_hash": hashlib.sha256(b"".join(t["text_sha256"].encode() + b"\n" for t in turns)).hexdigest(),
            "files": {"turns": rel_turns, "attendance": rel_att, "pages": rel_pages},
            "parse_notes": parsed.notes,
        })
    staged_refs = {h["ref"] for h in hearings}
    pending = [{"ref": str(int(e["ref"])), "hearing_id": hearing_base(e["ref"]), "committee": e["committee"],
                "committee_name": committee_full_name(e["committee"]), "date": ddmmyyyy_to_iso(e["date"]),
                "schedule_status": e.get("status"), "source_url": e.get("source_url"),
                "state": "pending at APH: not yet published, not a missing download"}
               for e in schedule if str(int(e["ref"])) not in staged_refs]
    files["senators.json"] = write_bytes(out / "senators.json",
                                         (json.dumps(roster, indent=1, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8"))
    manifest = {
        "round": round_id or out.name, "origin": ORIGIN, "parser": f"parli.ingest.committee_pdf v{PARSER_VERSION}",
        "dataset": DATASET, "source": SOURCE,
        "acquisition": {"note": acquisition_note, "acquired_on": acquired_on,
                        "how": "original PDF response bytes saved from APH's Estimates Transcript Schedule in a browser; "
                               "no crawler, no user-agent change; automated APH acquisition stays paused",
                        "schedule_url": "https://www.aph.gov.au/Parliamentary_Business/Hansard/Estimates_Transcript_Schedule",
                        "originals": "kept out of git; archived on the desktop under ~/opax-staging/committee-pdf/" + out.name},
        "hearings": hearings, "pending": pending, "files": dict(sorted(files.items())),
    }
    write_bytes(out / "manifest.json", (json.dumps(manifest, indent=1, ensure_ascii=False) + "\n").encode("utf-8"))
    return manifest


# ---------------------------------------------------------------------------
# Apply (refresh box, stdlib only): staged rounds -> parli.db
# ---------------------------------------------------------------------------

PDF_DDL = """
CREATE TABLE IF NOT EXISTS ext_committee_pdf_hearings (
    hearing_base   TEXT PRIMARY KEY,          -- committees/estimate/30030
    round          TEXT NOT NULL,             -- data/staged/committee-pdf/<round>
    committee_name TEXT,
    hearing_date   TEXT,
    revision       TEXT,                      -- Proof | Official
    origin         TEXT NOT NULL,             -- local_pdf
    pdf_sha256     TEXT NOT NULL,
    pdf_filename   TEXT,
    source_url     TEXT,
    pdf_url        TEXT,
    acquisition    TEXT,
    turns_hash     TEXT NOT NULL,
    turns_staged   INTEGER,
    rows_stored    INTEGER,
    status         TEXT NOT NULL,             -- applied | superseded
    superseded_by  TEXT,                      -- html:<Proof|Final> | local_pdf:<sha256>
    applied_at     TEXT NOT NULL,
    updated_at     TEXT,
    superseded_at  TEXT
);
CREATE TABLE IF NOT EXISTS ext_committee_pdf_turns (
    turn_id            TEXT PRIMARY KEY,      -- committees/estimate/30030/lpdf/0001
    hearing_base       TEXT NOT NULL,
    seq                INTEGER NOT NULL,
    speech_id          INTEGER,               -- NULL: not stored (under 50 characters, or a repeat)
    skipped            TEXT,
    text_sha256        TEXT NOT NULL,
    pdf_page_start     INTEGER,
    pdf_page_end       INTEGER,
    printed_page_start INTEGER,
    printed_page_end   INTEGER,
    pdf_sha256         TEXT NOT NULL,
    handbook_basis     TEXT                   -- parlinfo_label | handbook_current_senate (opt-in) | NULL
);
CREATE INDEX IF NOT EXISTS idx_ext_committee_pdf_turns_hearing ON ext_committee_pdf_turns(hearing_base);
CREATE INDEX IF NOT EXISTS idx_ext_committee_pdf_turns_speech ON ext_committee_pdf_turns(speech_id);
"""

PROVENANCE_COLUMNS = ("source_url", "source_attribution", "citation_anchor")


class StagedHashMismatch(RuntimeError):
    pass


def staged_rounds(root: str | Path = STAGED_ROOT) -> list[Path]:
    root = Path(root)
    return sorted(p.parent for p in root.glob("*/manifest.json"))


def load_round(round_dir: Path) -> dict:
    """The staged manifest, after checking the sha256 of every file it lists (StagedHashMismatch otherwise), and that
    every turn's text matches its own text_sha256."""
    manifest = json.loads((round_dir / "manifest.json").read_text(encoding="utf-8"))
    for rel, digest in manifest.get("files", {}).items():
        path = round_dir / rel
        if not path.is_file():
            raise StagedHashMismatch(f"{round_dir.name}/{rel}: missing")
        if sha256_file(path) != digest:
            raise StagedHashMismatch(f"{round_dir.name}/{rel}: sha256 differs from manifest.json")
    for h in manifest.get("hearings", []):
        for key in ("turns", "attendance"):
            if h["files"][key] not in manifest.get("files", {}):
                raise StagedHashMismatch(f"{round_dir.name}: {h['files'][key]} is not hashed in manifest.json")
        turns = read_jsonl(round_dir / h["files"]["turns"])
        if len(turns) != h["turns"]:
            raise StagedHashMismatch(f"{round_dir.name}/{h['files']['turns']}: {len(turns)} turns, manifest says {h['turns']}")
        th = hashlib.sha256()
        for t in turns:
            if sha256_bytes(t["text"].encode("utf-8")) != t["text_sha256"]:
                raise StagedHashMismatch(f"{t['turn_id']}: text does not match its text_sha256")
            if t["turn_id"] != turn_id(h["ref"], t["seq"]):
                raise StagedHashMismatch(f"{t['turn_id']}: ids do not belong to {h['hearing_id']}")
            th.update(t["text_sha256"].encode() + b"\n")
        if th.hexdigest() != h["turns_hash"]:
            raise StagedHashMismatch(f"{h['hearing_id']}: turns_hash differs from manifest.json")
    return manifest


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def attribution(h: dict) -> str:
    return (f"{h['revision']} Committee Hansard, Senate {h['committee_name']}, {h['date']} ({h['hearing_id']}). "
            f"Origin {ORIGIN}: {h['acquisition_note']}; PDF sha256 {h['pdf']['sha256']}. "
            "Commonwealth of Australia (Parliament of Australia).")


def schema_statements(db: sqlite3.Connection) -> list[str]:
    """The DDL the import needs, as single statements to run inside the apply transaction (so a rolled-back run, a dry
    run included, leaves the schema as it was too): the committee columns of `speeches`, the provenance columns, and
    the committee / attendance / handbook / import tables (all CREATE ... IF NOT EXISTS)."""
    from parli.ingest.committee_store import HEARINGS_DDL, SPEECH_COLUMNS
    from parli.ingest.committee_witnesses import ATT_DDL
    from parli.ingest.handbook import DDL as HANDBOOK_DDL
    from parli.ingest.kb_text_patch import QUEUE_DDL

    have = {r[1] for r in db.execute("PRAGMA table_info(speeches)")}
    stmts = [f"ALTER TABLE speeches ADD COLUMN {c} TEXT DEFAULT NULL"
             for c in (*SPEECH_COLUMNS, *PROVENANCE_COLUMNS, "party_canonical", "speaker_name_clean",
                       "text_clean", "text_clean_rules") if c not in have]
    stmts = list(dict.fromkeys(stmts))
    buf = ""
    for line in (HEARINGS_DDL + QUEUE_DDL.format(table=KB_QUEUE) + ATT_DDL + HANDBOOK_DDL + PDF_DDL).splitlines(keepends=True):
        buf += line
        if sqlite3.complete_statement(buf):
            if buf.strip():
                stmts.append(buf.strip())
            buf = ""
    return stmts


def html_rows_exist(db: sqlite3.Connection, h: dict) -> str | None:
    """'html:<status>' when the HTML fragment ingest holds this hearing (it always wins), else None."""
    r = db.execute("SELECT status FROM ext_committee_hearings WHERE hearing_base = ?", (h["hearing_id"],)).fetchone()
    if r is not None:
        return f"html:{r[0] or 'unknown'}"
    r = db.execute("SELECT 1 FROM speeches WHERE source = ? AND date = ? AND hearing_id LIKE ? AND hearing_id != ? LIMIT 1",
                   (SOURCE, h["date"], h["hearing_id"] + "/%", row_hearing_id(h["ref"]))).fetchone()
    return "html:legacy" if r is not None else None


class Identities:
    """PHID -> person_id (ext_handbook_people, as `committee_witnesses resolve`), person_id -> full name and party."""

    def __init__(self, db: sqlite3.Connection):
        self.people = {str(r[0]): r[1] for r in db.execute("SELECT phid, person_id FROM ext_handbook_people")}
        mcols = {r[1] for r in db.execute("PRAGMA table_info(members)")}
        party = "COALESCE(party_canonical, party)" if "party_canonical" in mcols else "party"
        self.members = {}
        for pid, full, p in db.execute(f"SELECT person_id, full_name, {party} FROM members"):
            self.members[str(pid)] = (full or None, p or None)

    def current_senator(self, db: sqlite3.Connection, label: str, members_in_attendance: list[str]) -> str | None:
        """OFF unless `apply --senate-roster-fallback`: the PHID of a 'Senator X' label that the label table does not
        know (a senator new since the cached hearings), when exactly one CURRENT senator in ext_handbook_people has that
        family name (and given name, when the label prints one), and the hearing's own 'Members in attendance' line
        names them. It is a name match, confined to the sitting Senate and checked against the transcript's member
        list, so the import never does it unless asked."""
        words = SPACE_RE.sub(" ", re.sub(r"(?i)^senator\s+", "", label)).strip().split(" ")
        if not words or not members_in_attendance:
            return None
        listed = {label_key(m) for m in members_in_attendance}
        if label_key(" ".join(words)) not in listed and label_key(words[-1]) not in listed:
            return None
        cands = []
        for phid, family, given, chamber, current in db.execute(
                "SELECT phid, family_name, given_name, chamber, in_current FROM ext_handbook_people"):
            if not current or (chamber or "") not in ("senate", "both"):
                continue
            fam = label_key(family or "")
            if len(words) >= 2 and fam == label_key(" ".join(words[1:])) and label_key(given or "").startswith(label_key(words[0])):
                cands.append(phid)
            elif fam == label_key(" ".join(words)):
                cands.append(phid)
        return str(cands[0]) if len(set(cands)) == 1 else None

    def member(self, phid: str | None) -> tuple[str | None, str | None, str | None]:
        """(person_id, full name, party) of a member's PHID; Nones when the PHID maps to no member."""
        pid = self.people.get(str(phid)) if phid else None
        if not pid:
            return None, None, None
        full, party = self.members.get(str(pid), (None, None))
        if not (str(pid).isdigit() and full):
            return pid, None, None
        return pid, full, party


def row_values(t: dict, h: dict, ids: Identities) -> dict:
    """The speeches columns of one staged turn."""
    pid = clean = party = None
    if t["speaker_type"] == "member":
        pid, clean, party = ids.member(t.get("handbook_id"))
    elif t["speaker_type"] == "witness":
        clean = t.get("speaker_name_clean")
    return {
        "person_id": pid, "speaker_name": t["speaker_name"], "party": None, "electorate": None, "chamber": CHAMBER,
        "date": t["date"], "topic": t["topic"], "text": t["text"], "word_count": len(t["text"].split()),
        "source": SOURCE, "state": "federal", "hearing_type": HEARING_TYPE,
        "witness_name": t.get("witness_name") if t["speaker_type"] == "witness" else None,
        "hearing_id": t["row_hearing_id"], "speaker_type": t["speaker_type"], "handbook_id": t.get("handbook_id"),
        "witness_position": t.get("witness_position") if t["speaker_type"] == "witness" else None,
        "witness_organisation": t.get("witness_organisation") if t["speaker_type"] == "witness" else None,
        "speaker_name_clean": clean, "party_canonical": party,
        "source_url": h["source_url"], "source_attribution": attribution(h), "citation_anchor": t["turn_id"],
    }


@dataclass
class ApplyResult:
    hearing_id: str
    action: str = "none"           # inserted | updated | unchanged | superseded | skipped
    inserted: int = 0
    updated: int = 0
    deleted: int = 0
    skipped_short: int = 0
    skipped_repeat: int = 0
    queued: int = 0
    reason: str = ""


def _insert(db: sqlite3.Connection, vals: dict) -> int:
    cols = list(vals)
    cur = db.execute(f"INSERT INTO speeches ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
                     [vals[c] for c in cols])
    return cur.lastrowid


def _write_attendance(db: sqlite3.Connection, h: dict, rows: list[dict], stamp: str) -> None:
    db.execute("DELETE FROM ext_committee_attendance WHERE hearing_base = ?", (h["hearing_id"],))
    db.executemany("INSERT INTO ext_committee_attendance VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                   [(h["hearing_id"], r["seq"], r["honorific"], r["honorific_class"], r["name"], r["surname"],
                     r["postnominals"], r["position"], r["organisation"], r["group_heading"], r["kind"],
                     r.get("fragment") or ROW_SUFFIX, stamp) for r in rows])


def _record_hearing(db, h: dict, round_name: str, rows_stored: int, stamp: str, status: str = "applied") -> None:
    db.execute(
        "INSERT INTO ext_committee_pdf_hearings (hearing_base, round, committee_name, hearing_date, revision, origin, "
        "pdf_sha256, pdf_filename, source_url, pdf_url, acquisition, turns_hash, turns_staged, rows_stored, status, "
        "applied_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(hearing_base) DO UPDATE SET "
        "round=excluded.round, committee_name=excluded.committee_name, hearing_date=excluded.hearing_date, "
        "revision=excluded.revision, pdf_sha256=excluded.pdf_sha256, pdf_filename=excluded.pdf_filename, "
        "source_url=excluded.source_url, pdf_url=excluded.pdf_url, acquisition=excluded.acquisition, "
        "turns_hash=excluded.turns_hash, turns_staged=excluded.turns_staged, rows_stored=excluded.rows_stored, "
        "status=excluded.status, updated_at=?",
        (h["hearing_id"], round_name, h["committee_name"], h["date"], h["revision"], ORIGIN, h["pdf"]["sha256"],
         h["pdf"]["filename"], h["source_url"], h.get("pdf_url"),
         json.dumps({"note": h["acquisition_note"], "acquired_on": h["acquired_on"]}), h["turns_hash"], h["turns"],
         rows_stored, status, stamp, stamp))


def apply_hearing(db: sqlite3.Connection, round_dir: Path, h: dict, ids: Identities, seen, stamp: str,
                  pushed_upto: int | None, senate_fallback: bool = False) -> ApplyResult:
    """Bring one staged hearing into parli.db (inside the caller's transaction)."""
    from parli.ingest import kb_text_patch

    res = ApplyResult(hearing_id=h["hearing_id"])
    winner = html_rows_exist(db, h)
    prev = db.execute("SELECT * FROM ext_committee_pdf_hearings WHERE hearing_base = ?", (h["hearing_id"],)).fetchone()
    if winner:
        res.action, res.reason = "superseded", f"the HTML ingest holds this hearing ({winner}); PDF rows are never added beside it"
        if prev is not None and prev["status"] != "superseded":
            db.execute("UPDATE ext_committee_pdf_hearings SET status='superseded', superseded_by=?, superseded_at=? "
                       "WHERE hearing_base=?", (winner, stamp, h["hearing_id"]))
        return res
    if prev is not None and prev["status"] == "superseded":
        res.action, res.reason = "skipped", f"superseded by {prev['superseded_by']}"
        return res
    if prev is not None and prev["pdf_sha256"] == h["pdf"]["sha256"] and prev["turns_hash"] == h["turns_hash"]:
        res.action = "unchanged"
        return res
    if prev is not None and REVISION_RANK.get(h["revision"], 0) < REVISION_RANK.get(prev["revision"], 0):
        res.action, res.reason = "skipped", f"staged {h['revision']} is older than the applied {prev['revision']}"
        return res

    turns = [expand_turn(h, t) for t in read_jsonl(round_dir / h["files"]["turns"])]
    for t in turns:
        if t.get("handbook_id"):
            t["handbook_basis"] = "parlinfo_label"
        elif senate_fallback and t["speaker_type"] == "member":
            phid = ids.current_senator(db, t["speaker_name"], h.get("members_in_attendance") or [])
            if phid:
                t["handbook_id"], t["handbook_basis"] = phid, "handbook_current_senate"
    attendance = read_jsonl(round_dir / h["files"]["attendance"])
    stored = []
    if prev is not None:
        stored = [dict(r) for r in db.execute(
            "SELECT s.speech_id, s.speaker_name, s.text, t.turn_id FROM ext_committee_pdf_turns t "
            "JOIN speeches s ON s.speech_id = t.speech_id WHERE t.hearing_base = ? ORDER BY t.seq", (h["hearing_id"],))]
    keep = [t for t in turns if len(t["text"]) >= MIN_TURN_CHARS]
    res.skipped_short = len(turns) - len(keep)
    turn_rows: list[tuple] = []
    mapping: dict[str, int | None] = {}
    if stored:
        # Official (or corrected) copy of an applied hearing: align turn by turn and update rows in place
        from parli.ingest.committee_hearings import align, norm_text
        from parli.ingest.committee_transcript import SpeechRecord

        recs = [SpeechRecord(speaker_name=t["speaker_name"], speaker_type=t["speaker_type"], text=t["text"],
                             hearing_id=t["row_hearing_id"], committee_name=t["committee_name"], date=t["date"],
                             topic=t["topic"], dataset=DATASET) for t in keep]
        by_text = {id(r): t for r, t in zip(recs, keep)}
        for s, rec in align(stored, recs):
            if rec is None:
                db.execute("DELETE FROM speeches WHERE speech_id = ?", (s["speech_id"],))
                if pushed_upto is None or s["speech_id"] <= pushed_upto:
                    kb_text_patch.queue(db, KB_QUEUE, s["speech_id"], "delete", f"turn absent from the {h['revision']} PDF", stamp)
                    res.queued += 1
                res.deleted += 1
                continue
            t = by_text[id(rec)]
            vals = row_values(t, h, ids)
            if s is None:
                mapping[t["turn_id"]] = _insert(db, vals)
                res.inserted += 1
                continue
            sets = {k: v for k, v in vals.items() if k not in ("date", "source", "state", "chamber")}
            db.execute(f"UPDATE speeches SET {', '.join(f'{k} = ?' for k in sets)}, text_clean = NULL, "
                       f"text_clean_rules = NULL WHERE speech_id = ?", [*sets.values(), s["speech_id"]])
            mapping[t["turn_id"]] = s["speech_id"]
            if norm_text(s["text"], s["speaker_name"]) != norm_text(t["text"]):
                res.updated += 1
                if pushed_upto is None or s["speech_id"] <= pushed_upto:
                    kb_text_patch.queue(db, KB_QUEUE, s["speech_id"], "patch", f"local_pdf {h['revision']}", stamp)
                    res.queued += 1
        db.execute("DELETE FROM ext_committee_pdf_turns WHERE hearing_base = ?", (h["hearing_id"],))
        res.action = "updated"
    else:
        for t in keep:
            key = f"{t['speaker_name']}|{t['date']}|{text_hash(t['text'])}"
            if key in seen:
                mapping[t["turn_id"]] = None
                res.skipped_repeat += 1
                continue
            seen.add(key)
            mapping[t["turn_id"]] = _insert(db, row_values(t, h, ids))
            res.inserted += 1
        res.action = "inserted"
    for t in turns:
        sid = mapping.get(t["turn_id"])
        skipped = None if sid else ("under 50 characters" if len(t["text"]) < MIN_TURN_CHARS else "repeat of a stored turn")
        turn_rows.append((t["turn_id"], h["hearing_id"], t["seq"], sid, skipped, t["text_sha256"], t["pdf_pages"][0],
                          t["pdf_pages"][1], t["printed_pages"][0], t["printed_pages"][1], h["pdf"]["sha256"],
                          t.get("handbook_basis")))
    db.executemany("INSERT INTO ext_committee_pdf_turns VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", turn_rows)
    _write_attendance(db, h, attendance, stamp)
    _record_hearing(db, h, round_dir.name, sum(1 for r in turn_rows if r[3]), stamp)
    return res


def validate_applied(db: sqlite3.Connection, manifest: dict) -> list[str]:
    """Post-apply checks (inside the transaction; any problem rolls the whole run back)."""
    problems = []
    for h in manifest["hearings"]:
        st = db.execute("SELECT status, rows_stored, pdf_sha256 FROM ext_committee_pdf_hearings WHERE hearing_base = ?",
                        (h["hearing_id"],)).fetchone()
        if st is None:
            if html_rows_exist(db, h) is None:
                problems.append(f"{h['hearing_id']}: not recorded")
            continue
        if st[0] != "applied":
            continue
        n = db.execute("SELECT COUNT(*) FROM speeches WHERE source = ? AND date = ? AND hearing_id = ?",
                       (SOURCE, h["date"], row_hearing_id(h["ref"]))).fetchone()[0]
        mapped = db.execute("SELECT COUNT(*) FROM ext_committee_pdf_turns WHERE hearing_base = ? AND speech_id IS NOT NULL",
                            (h["hearing_id"],)).fetchone()[0]
        if not (n == mapped == st[1]):
            problems.append(f"{h['hearing_id']}: {n} rows, {mapped} mapped turns, {st[1]} recorded")
        dup = db.execute("SELECT citation_anchor, COUNT(*) FROM speeches WHERE source = ? AND date = ? AND hearing_id = ? "
                         "GROUP BY citation_anchor HAVING COUNT(*) > 1 LIMIT 1",
                         (SOURCE, h["date"], row_hearing_id(h["ref"]))).fetchone()
        if dup:
            problems.append(f"{h['hearing_id']}: turn id {dup[0]} stored {dup[1]} times")
        if html_rows_exist(db, h):
            problems.append(f"{h['hearing_id']}: PDF rows beside HTML rows")
        bad = db.execute("SELECT COUNT(*) FROM speeches WHERE source = ? AND date = ? AND hearing_id = ? AND "
                         "speaker_type = 'witness' AND person_id IS NOT NULL",
                         (SOURCE, h["date"], row_hearing_id(h["ref"]))).fetchone()[0]
        if bad:
            problems.append(f"{h['hearing_id']}: {bad} witness rows with a person_id")
    return problems


def apply(db_path: str, root: str | Path = STAGED_ROOT, *, dry_run: bool = False,
          pushed_upto: int | None | str = "auto", senate_fallback: bool = False, say=log) -> dict:
    """Apply every staged round. One transaction: a hash mismatch, an error or a failed post-check leaves parli.db as it
    was. Returns {'results': [...], 'queued': n, 'pending': [...]}."""
    from parli.ingest.committee_hearings import build_dedup_index
    from parli.ingest.committee_witnesses import pushed_checkpoint

    rounds = staged_rounds(root)
    manifests = [(r, load_round(r)) for r in rounds]           # raises StagedHashMismatch before anything is opened
    db = sqlite3.connect(db_path, timeout=600)
    db.execute("PRAGMA busy_timeout = 600000")
    db.row_factory = sqlite3.Row
    out = {"results": [], "queued": 0, "pending": []}
    db.isolation_level = None                                  # explicit BEGIN / COMMIT: the DDL is in the transaction too
    try:
        if pushed_upto == "auto":
            pushed_upto = pushed_checkpoint()
        db.execute("BEGIN IMMEDIATE")
        for stmt in schema_statements(db):
            db.execute(stmt)
        ids = Identities(db)
        seen = build_dedup_index(db)
        stamp = now_iso()
        for round_dir, manifest in manifests:
            for h in manifest["hearings"]:
                r = apply_hearing(db, round_dir, h, ids, seen, stamp, pushed_upto, senate_fallback)
                out["results"].append(asdict(r))
                out["queued"] += r.queued
                say(f"  {h['hearing_id']} {h['date']} {h['committee_name']} ({h['revision']}): {r.action}"
                    + (f" +{r.inserted}" if r.inserted else "") + (f" ~{r.updated}" if r.updated else "")
                    + (f" -{r.deleted}" if r.deleted else "")
                    + (f"; {r.skipped_short} under {MIN_TURN_CHARS} chars" if r.skipped_short and r.action in ("inserted", "updated") else "")
                    + (f"; {r.skipped_repeat} repeats" if r.skipped_repeat else "") + (f" ({r.reason})" if r.reason else ""))
            for p in manifest.get("pending", []):
                out["pending"].append(p)
                say(f"  {p['hearing_id']} {p['date']} {p['committee_name']}: PENDING at APH ({p['schedule_status']}); "
                    "not a missing download, nothing to import yet")
            problems = validate_applied(db, manifest)
            if problems:
                raise RuntimeError("post-apply check failed: " + "; ".join(problems[:10]))
        if dry_run:
            db.execute("ROLLBACK")
            say("  dry run: rolled back")
        else:
            db.execute("COMMIT")
    except BaseException:
        if db.in_transaction:
            db.execute("ROLLBACK")
        raise
    finally:
        db.close()
    return out


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Senate estimates transcripts from local PDF files (origin local_pdf).")
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("apply", help="apply every staged round to parli.db (idempotent)")
    a.add_argument("--db", default=os.environ.get("OPAX_DB") or os.path.expanduser("~/.cache/autoresearch/parli.db"))
    a.add_argument("--staged", default=str(STAGED_ROOT))
    a.add_argument("--dry-run", action="store_true")
    a.add_argument("--pushed-upto", type=int, default=None)
    a.add_argument("--senate-roster-fallback", action="store_true",
                   help="also link 'Senator X' labels the label table lacks to the one current senator of that name "
                        "in ext_handbook_people named in the hearing's members list (a name match; off by default)")
    v = sub.add_parser("verify", help="check the staged hashes only")
    v.add_argument("--staged", default=str(STAGED_ROOT))
    args = ap.parse_args(argv)
    try:
        if args.cmd == "verify":
            for r in staged_rounds(args.staged):
                m = load_round(r)
                log(f"{r.name}: {len(m['hearings'])} hearings, {sum(h['turns'] for h in m['hearings']):,} turns, "
                    f"{len(m.get('pending', []))} pending; hashes OK")
            return 0
        out = apply(args.db, args.staged, dry_run=args.dry_run,
                    pushed_upto=args.pushed_upto if args.pushed_upto is not None else "auto",
                    senate_fallback=args.senate_roster_fallback)
    except StagedHashMismatch as e:
        log(f"REFUSED: {e}; nothing applied")
        return 2
    acts = collections.Counter(r["action"] for r in out["results"])
    ins = sum(r["inserted"] for r in out["results"])
    upd = sum(r["updated"] for r in out["results"])
    dele = sum(r["deleted"] for r in out["results"])
    log(f"committee_pdf: {dict(acts)}; {ins} rows inserted, {upd} updated, {dele} removed; "
        f"{len(out['pending'])} hearings pending at APH")
    if out["queued"]:
        # rows the knowledge box already holds changed: the nightly sends committee_kb_queue after the push
        log(f"COMMITTEE_PDF_QUEUED {out['queued']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
