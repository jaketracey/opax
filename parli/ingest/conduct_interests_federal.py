"""
parli.ingest.conduct_interests_federal -- Federal registers of interests.

Sources
  House of Representatives  Register of Members' Interests, 48th Parliament: one PDF per
                            member (typed statement form + appended "Notification of
                            alteration" pages). Index page on www.aph.gov.au, PDFs on
                            static.aph.gov.au.
  Senate                    Register of Senators' Interests: one server-rendered HTML page
                            per senator (tables per section, dated Addition/Deletion
                            alterations).

Access constraints (measured 2026-09-02, see docs/DATA-INTERESTS.md)
  * static.aph.gov.au (the PDFs) serves our honest User-Agent "OPAX research (opax.com.au)".
  * www.aph.gov.au (index + Senate pages) sits behind a WAF that 403s every non-browser
    User-Agent, including python-requests and curl. This module therefore never spoofs a
    browser by default: pass the saved HTML with --index-html / --senate-html-dir, or opt in
    explicitly with --browser-ua. robots.txt allows the paths.
  * Licence: CC BY-NC-ND 4.0 (site-wide). Facts are extracted, every row links to the
    source document; the KB rendering is a decision for the user (see the doc).

Output: NEW tables only (ext_interests_documents, ext_interests); nothing existing is touched.
Parsing needs pdfplumber (+ pytesseract/tesseract for the ~3% scanned statements); the
--load-jsonl path is stdlib-only so rows can be parsed anywhere and loaded on the DB host.

Usage
  python -m parli.ingest.conduct_interests_federal house --index-html reg.html --limit 20 \
        --export-jsonl out.jsonl --eval-dump eval/
  python -m parli.ingest.conduct_interests_federal senate --senate-html-dir pages/ \
        --export-jsonl senate.jsonl
  python -m parli.ingest.conduct_interests_federal load --jsonl out.jsonl --db ~/.cache/autoresearch/parli.db
  python -m parli.ingest.conduct_interests_federal kb-export --db ... --out kb_interests.jsonl
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path

USER_AGENT = "OPAX research (opax.com.au)"
BROWSER_UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/128.0 Safari/537.36 OPAX-research/1.0 (+https://opax.com.au)")

CACHE_DIR = Path(os.environ.get("OPAX_INTERESTS_CACHE", "~/.cache/autoresearch/conduct_interests/federal")).expanduser()
DEFAULT_DB = Path("~/.cache/autoresearch/parli.db").expanduser()

HOUSE_INDEX_URL = "https://www.aph.gov.au/Senators_and_Members/Members/Register"
SENATE_INDEX_URL = ("https://www.aph.gov.au/Parliamentary_Business/Committees/Senate/"
                    "Senators_Interests/Senators_Interests_Register")
PARLIAMENT = 48
PARSER_VERSION = "2026-09-04.1"

# chamber value on our documents -> members.chamber; state chambers share their own codes
MEMBERS_CHAMBER = {"house": "representatives", "senate": "senate"}


def jurisdiction_of(chamber: str) -> str:
    return "federal" if chamber in ("house", "senate") else chamber.split("_")[0]

# Section number -> (category, short title). Same numbering in both chambers' forms.
SECTIONS = {
    1: ("shareholdings", "Shareholdings in public and private companies"),
    2: ("trusts", "Family and business trusts and nominee companies"),
    3: ("real_estate", "Real estate"),
    4: ("directorships", "Directorships of companies"),
    5: ("partnerships", "Partnerships"),
    6: ("liabilities", "Liabilities"),
    7: ("investments", "Bonds, debentures and like investments"),
    8: ("savings", "Saving or investment accounts"),
    9: ("other_assets", "Other assets valued at over $7,500"),
    10: ("income", "Other substantial sources of income"),
    11: ("gifts", "Gifts"),
    12: ("travel", "Sponsored travel or hospitality"),
    13: ("memberships", "Memberships / office holder / financial contributor"),
    14: ("other", "Other interests"),
}

NIL_RE = re.compile(r"^\s*(?:not\s+app\w*|n/?a|nil(?:\s+return)?|none(?:\s+other\s+than\s+(?:otherwise\s+)?disclosed.*)?"
                    r"|nothing\s+to\s+(?:declare|report)|-+|–|—)\s*\.?\s*$", re.I)
# OCR'd label / column-header text that the text-line fallback can mistake for an entry
OCR_LABEL_RE = re.compile(r"^(?:dependen\w*|se[il1]f|spouse|partner|children|details?\s+of|name\s+of|nature\s+of|type\s+of"
                          r"|location|purpose)\b", re.I)
# OCR renderings of a handwritten 'N/A' ('NIA', 'NWA', "N'A", 'NtA', '! NEA') and label fragments
OCR_NIL_RE = re.compile(r"^[\W_]*(?:[NI!|l][\W_]*[A-Za-z]?[\W_]*[AÀÁ4]|N\s*[/\\]?\s*A|nil|none)[\W_]*(?:partner|children)?[\W_]*$", re.I)
HOLDERS = {"self": "self", "spouse": "spouse", "spouse/": "spouse", "partner": "spouse",
           "dependent": "children", "children": "children", "dependant": "children"}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class InterestRow:
    holder: str | None            # self | spouse | children | unspecified
    section_code: int | None
    category: str
    kind: str                     # statement | addition | deletion
    fields: dict                  # column -> value (as printed)
    description: str              # single-line rendering of fields
    date_declared: str | None     # ISO date; statement date or alteration submitted date
    page: int | None
    ocr: int = 0
    subsection: str | None = None
    notes: str | None = None


@dataclass
class InterestDocument:
    doc_id: str
    chamber: str                  # house | senate
    parliament: int
    member_name_raw: str
    member_name: str | None
    electorate: str | None
    state: str | None
    party: str | None
    source_url: str
    source_rev: str | None
    file_sha256: str | None
    pages: int | None
    ocr_pages: int
    last_updated: str | None      # as shown on the index page (ISO)
    statement_date: str | None
    fetched_at: str | None
    person_id: str | None = None
    rows: list[InterestRow] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def _iso(d: str | None) -> str | None:
    """'13/05/2026' or '10 October 2025' -> '2026-05-13'."""
    if not d:
        return None
    d = d.strip()
    for fmt in ("%d/%m/%Y", "%d %B %Y", "%d %b %Y", "%Y-%m-%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(d, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def _norm_ws(s: str | None) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def _holder(label: str | None) -> str | None:
    if not label:
        return None
    key = _norm_ws(label).lower().split(" ")[0].split("/")[0]
    return HOLDERS.get(key) or HOLDERS.get(key + "/")


def _is_nil(s: str | None) -> bool:
    return not s or bool(NIL_RE.match(s))


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


_HONORIFIC_ANYWHERE = re.compile(r"\b(?:the\s+)?(?:Hon|Mr|Mrs|Ms|Miss|Dr|Prof|Senator|Sen)\.?(?=\s|$)", re.I)


def _normalize_name(raw: str) -> str | None:
    """'Albanese, Hon Anthony' / 'the Hon. Ayres, Tim' -> 'Anthony Albanese' / 'Tim Ayres'.

    Honorifics are stripped per comma segment first: the register prints them before the
    surname ('the Hon. Ayres, Tim'), where the corpus normaliser's leading-honorific rule
    cannot see them after the surname/given swap.
    """
    segs = [_norm_ws(_HONORIFIC_ANYWHERE.sub(" ", s)) for s in raw.split(",")]
    cleaned = ", ".join(s for s in segs if s)
    try:
        from parli.ingest.speaker_names import normalize_speaker
    except ImportError:  # running as a loose script on the DB host
        return _norm_ws(" ".join(reversed(cleaned.split(", ", 1))))
    return normalize_speaker(cleaned)


def _session(browser_ua: bool = False):
    import requests
    s = requests.Session()
    s.headers["User-Agent"] = BROWSER_UA if browser_ua else USER_AGENT
    return s


# ---------------------------------------------------------------------------
# House: index
# ---------------------------------------------------------------------------

NAME_RE = re.compile(
    r"^(?P<sur>[^,.]+)[,.]\s*(?P<given>.+?)[,.]?\s+Member for\s+(?P<elec>.+?)[,.]?\s*(?P<state>ACT|NSW|NT|QLD|Qld|SA|TAS|Tas|VIC|Vic|WA)?\s*$"
)


def parse_house_index(html: str) -> list[dict]:
    """Rows of the register table: last_updated, name_raw, surname, given, electorate, state, url."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    out = []
    for table in soup.select("table.documents"):
        for tr in table.select("tbody tr"):
            tds = tr.find_all("td")
            if len(tds) < 3:
                continue
            a = tds[2].find("a", href=True)
            if not a or ".pdf" not in a["href"].lower():
                continue
            url = a["href"]
            if url.startswith("/"):
                url = "https://www.aph.gov.au" + url
            name_raw = _norm_ws(tds[1].get_text(" "))
            m = NAME_RE.match(name_raw)
            rev = re.search(r"[?&]rev=([0-9a-f]+)", url)
            out.append({
                "last_updated": _iso(_norm_ws(tds[0].get_text())),
                "name_raw": name_raw,
                "surname": _norm_ws(m.group("sur")) if m else None,
                "given": _norm_ws(m.group("given")) if m else None,
                "electorate": _norm_ws(m.group("elec")) if m else None,
                "state": (m.group("state") or "").upper() or None if m else None,
                "url": url,
                "rev": rev.group(1) if rev else None,
                "file": url.split("?")[0].rsplit("/", 1)[-1],
            })
    return out


def fetch_house_index(index_html: Path | None, browser_ua: bool) -> list[dict]:
    if index_html:
        return parse_house_index(Path(index_html).read_text(encoding="utf-8", errors="replace"))
    s = _session(browser_ua)
    r = s.get(HOUSE_INDEX_URL, timeout=60)
    if r.status_code == 403:
        sys.exit("www.aph.gov.au returned 403 (WAF blocks non-browser User-Agents). Save the register page "
                 "from a browser and pass --index-html, or opt in with --browser-ua.")
    r.raise_for_status()
    return parse_house_index(r.text)


def download_house_pdfs(entries: list[dict], dest: Path, limit: int | None = None,
                        delay: float = 0.5, refresh: bool = False) -> list[tuple[dict, Path]]:
    """Fetch PDFs from static.aph.gov.au with the research UA. Cached by filename+rev."""
    dest.mkdir(parents=True, exist_ok=True)
    s = _session(False)
    out = []
    for e in entries[:limit] if limit else entries:
        path = dest / e["file"]
        meta = dest / (e["file"] + ".json")
        if path.exists() and path.stat().st_size > 1000 and not refresh:
            cached_rev = json.loads(meta.read_text()).get("rev") if meta.exists() else None
            if cached_rev == e.get("rev") or e.get("rev") is None:
                out.append((e, path))
                continue
        try:
            r = s.get(e["url"], timeout=90)
            r.raise_for_status()
            path.write_bytes(r.content)
            meta.write_text(json.dumps({**e, "fetched_at": datetime.now(timezone.utc).isoformat()}))
            out.append((e, path))
            print(f"  fetched {e['file']} ({len(r.content)//1024} KB)", flush=True)
        except Exception as ex:  # noqa: BLE001
            print(f"  [fail] {e['file']}: {ex}", flush=True)
        time.sleep(delay)
    return out


# ---------------------------------------------------------------------------
# House: PDF parsing
# ---------------------------------------------------------------------------

HEADING_RE = re.compile(r"^\s*(\d{1,2})\s*\.\s*(?!\d)(\S.*)$")
ITEM_RE = re.compile(r"^\s*(\d{1,2})\s*\.\s*(.*)$")
SUBMITTED_RE = re.compile(r"Submitted\s+Date\s*:?\s*(\d{1,2}/\d{1,2}/\d{4})", re.I)
PROCESSED_RE = re.compile(r"Processed\s+by\s+Registrar[^:]*:\s*(\d{1,2}/\d{1,2}/\d{4})", re.I)
DATE_ANY_RE = re.compile(r"\b(\d{1,2}/\d{1,2}/\d{4})\b")


def _cell_lines(page, bbox):
    """Text lines inside a table cell with geometry (top, x0, x1, text)."""
    x0, top, x1, bottom = bbox
    x0, top = max(x0, page.bbox[0]), max(top, page.bbox[1])
    x1, bottom = min(x1, page.bbox[2]), min(bottom, page.bbox[3])
    if x1 - x0 < 2 or bottom - top < 2:
        return []
    try:
        crop = page.crop((x0, top, x1, bottom), strict=False)
        lines = crop.extract_text_lines(layout=False, strip=True, return_chars=False)
    except Exception:  # noqa: BLE001
        return []
    return [l for l in lines if l.get("text", "").strip()]


_CONT_WORDS = {"and", "of", "the", "for", "in", "pty", "ltd", "limited", "plan", "fund", "bank", "trust",
               "account", "membership", "portfolio", "company", "companies", "australia", "provided", "from",
               "to", "with", "at", "by", "on", "or"}
_HANG_WORDS = {"and", "of", "the", "for", "in", "at", "to", "with", "by", "on", "or", "a", "an", "from"}


def _break_scores(lines, cell_x0, cell_x1):
    """Score the boundary between consecutive lines: higher = more likely a new entry starts.

    Wrapped continuations are recognisable because the previous line ran to the cell edge
    (that is what wrapping is), ends without terminal punctuation or with a dangling
    connective / open bracket, or the next line starts lowercase. Ties are what the
    known-entry-count partition in _partition is for.

    Vertical pitch is the strongest single signal in the official form (measured over
    26 members, 2026-09-02): a wrapped line sits 12.1pt below the previous one, a new
    entry 15.1pt (paragraph spacing; 30.1pt in alteration tables). It is weighted, not
    decisive, because a few members type every line as a paragraph.
    """
    width = max(cell_x1 - cell_x0, 1)
    scores = []
    for a, b in zip(lines, lines[1:]):
        ta, tb = a["text"].rstrip(), b["text"].lstrip()
        s = 0.0
        gap = b.get("top", 0) - a.get("top", 0)
        if gap >= 14:
            s += 1.5
        elif 0 < gap <= 13:
            s -= 3.0
        if ta.endswith((".", ")", "]", ";", "”", '"')):
            s += 1.5
        if tb[:1].isupper() or tb[:1].isdigit() or tb[:1] in "$@\"'“":
            s += 1.0
        if tb[:1].islower() or tb[:1] in ")(-,;/&":
            s -= 2.0
        if tb.split(" ")[0].lower() in _CONT_WORDS:
            s -= 1.0
        if ta.endswith(("-", ",", "(", "&", "/", ":")) or ta.split(" ")[-1].lower() in _HANG_WORDS:
            s -= 2.0
        if ta.count("(") > ta.count(")"):
            s -= 2.0
        s -= 2.0 * min(max(a["x1"] - cell_x0, 0) / width, 1.0)
        scores.append(s)
    return scores


def _partition(lines, cell_x0, cell_x1, n=None):
    """Group a cell's lines into entries. With n known (anchor count) choose the n-1 most
    plausible break points; otherwise break wherever the score clears a threshold."""
    if not lines:
        return []
    scores = _break_scores(lines, cell_x0, cell_x1)
    if n is not None and n >= 1:
        k = max(min(n - 1, len(lines) - 1), 0)
        breaks = set(sorted(range(len(scores)), key=lambda i: -scores[i])[:k])
    else:
        breaks = {i for i, s in enumerate(scores) if s > -0.5}
    entries = [[lines[0]["top"], _norm_ws(lines[0]["text"])]]
    for i, l in enumerate(lines[1:]):
        if i in breaks:
            entries.append([l["top"], _norm_ws(l["text"])])
        else:
            entries[-1][1] += " " + _norm_ws(l["text"])
    return entries


def _group_entries(lines, cell_x0, cell_x1):
    return _partition(lines, cell_x0, cell_x1, None)


def _table_section(table_top, headings):
    """Most recent heading above the table on this page (headings: [(top, num, title)])."""
    best = None
    for top, num, title in headings:
        if top < table_top and (best is None or top > best[0]):
            best = (top, num, title)
    return best


def _page_headings(page, table_bboxes):
    heads = []
    for l in page.extract_text_lines(layout=False, strip=True, return_chars=False):
        m = HEADING_RE.match(l["text"])
        if not m:
            continue
        num = int(m.group(1))
        if not 1 <= num <= 14 or l["x0"] > 120:
            continue
        inside = any(bx0 - 1 <= l["x0"] <= bx1 and btop - 1 <= l["top"] <= bbot + 1 for bx0, btop, bx1, bbot in table_bboxes)
        if inside:
            continue
        heads.append((l["top"], num, _norm_ws(m.group(2))))
    return heads


def _parse_statement_table(page, table, section, pageno, subsection=None):
    rows_out = []
    rows = table.rows
    if len(rows) < 2:
        return rows_out
    header = [(_norm_ws(" ".join(x["text"] for x in _cell_lines(page, c))) if c else "") for c in rows[0].cells]
    for row in rows[1:]:
        cells = row.cells
        if not cells or cells[0] is None:
            continue
        holder_txt = " ".join(x["text"] for x in _cell_lines(page, cells[0]))
        holder = _holder(holder_txt)
        if holder is None:
            continue
        col_lines = []
        for c in cells[1:]:
            col_lines.append(_cell_lines(page, c) if c else [])
        if not col_lines or all(all(_is_nil(l["text"]) for l in cl) for cl in col_lines):
            continue
        # anchor on the first column that has content
        anchor_idx = next((i for i, cl in enumerate(col_lines) if cl and not all(_is_nil(l["text"]) for l in cl)), None)
        if anchor_idx is None:
            continue
        ax0, _, ax1, _ = cells[1 + anchor_idx]
        anchors = _group_entries(col_lines[anchor_idx], ax0, ax1)
        anchors = [a for a in anchors if not _is_nil(a[1])]
        if not anchors:
            continue
        entries = [{header[1 + anchor_idx] or f"col{anchor_idx+1}": a[1]} for a in anchors]
        for j, cl in enumerate(col_lines):
            if j == anchor_idx or not cl:
                continue
            key = header[1 + j] or f"col{j+1}"
            cx0, _, cx1, _ = cells[1 + j]
            cl = [l for l in cl if not _is_nil(l["text"])]
            if len(cl) >= len(anchors):
                # as many or more lines than entries: partition into exactly N groups in order
                for k, (top, text) in enumerate(_partition(cl, cx0, cx1, len(anchors))):
                    entries[k][key] = (entries[k].get(key, "") + " " + text).strip()
            else:
                # fewer lines than entries: attach each to the entry it sits beside
                for top, text in _group_entries(cl, cx0, cx1):
                    k = 0
                    for i, a in enumerate(anchors):
                        if a[0] <= top + 2.5:
                            k = i
                    entries[k][key] = (entries[k].get(key, "") + " " + text).strip()
        for e in entries:
            rows_out.append(InterestRow(
                holder=holder, section_code=section[1], category=SECTIONS[section[1]][0],
                kind="statement", fields=e, description=" — ".join(v for v in e.values() if v),
                date_declared=None, page=pageno, subsection=subsection))
    return rows_out


def _alteration_blocks(page, table, pageno, kind_hint):
    """One alteration table -> (kind, blocks). A block is one holder's (items, detail lines).

    Tables that continue a notification on a following page have no ADDITION/DELETION header
    row and often no holder label; those blocks come back with holder None and are merged
    into the preceding block by _merge_alteration_blocks.
    """
    rows = table.rows
    if not rows:
        return kind_hint, []
    hdr = " ".join(_norm_ws(" ".join(x["text"] for x in _cell_lines(page, c))) for c in rows[0].cells if c)
    if re.search(r"FAMILY|GIVEN|ELECTORAL", hdr):
        return kind_hint, []  # the name/electorate header form at the top of a notification
    kind = "addition" if "ADDITION" in hdr else "deletion" if "DELETION" in hdr else None
    data_rows = rows[1:] if kind else rows
    kind = kind or kind_hint
    blocks = []
    for row in data_rows:
        cells = [c for c in row.cells]
        if len(cells) >= 3:
            hcell, icell, dcell = cells[0], cells[1], cells[2]
        elif len(cells) == 2:
            hcell, icell, dcell = None, cells[0], cells[1]
        else:
            continue
        holder = _holder(" ".join(x["text"] for x in _cell_lines(page, hcell))) if hcell else None
        item_lines = _cell_lines(page, icell) if icell else []
        det_lines = _cell_lines(page, dcell) if dcell else []
        if hcell and holder is None and (item_lines or det_lines):
            holder = None  # continuation row: inherit later
        if not item_lines and not det_lines:
            if holder is not None:
                blocks.append({"holder": holder, "items": [], "details": [], "page": pageno, "kind": kind, "dbox": dcell})
            continue
        items = []  # [top, code, label]
        for l in item_lines:
            m = ITEM_RE.match(l["text"])
            if m and 1 <= int(m.group(1)) <= 14:
                items.append([l["top"], int(m.group(1)), _norm_ws(m.group(2))])
            elif items:
                items[-1][2] = _norm_ws(items[-1][2] + " " + l["text"])
            elif not _is_nil(l["text"]):
                items.append([l["top"], None, _norm_ws(l["text"])])
        for l in det_lines:
            l["page"] = pageno
            l["cell_x0"], l["cell_x1"] = (dcell[0], dcell[2]) if dcell else (0.0, 1.0)
        blocks.append({"holder": holder, "items": items, "details": det_lines, "page": pageno, "kind": kind, "dbox": dcell})
    return kind, blocks


def _fallback_alteration_blocks(page, cols, pageno, kind):
    """Continuation page whose table borders pdfplumber cannot see: bucket words into the
    holder / item / details columns learnt from the last detected alteration table."""
    (hx0, hx1), (ix0, ix1), (dx0, dx1) = cols
    words = page.extract_words(keep_blank_chars=False)
    holder_marks = []   # (top, holder)
    kind_marks = []     # (top, kind)
    per_col = {"item": [], "details": []}
    for w in words:
        xc = (w["x0"] + w["x1"]) / 2
        t = w["text"]
        if re.fullmatch(r"ADDITION|DELETION", t):
            kind_marks.append((w["top"], "addition" if t == "ADDITION" else "deletion")); continue
        if xc < hx1:
            h = _holder(t)
            if h:
                holder_marks.append((w["top"], h))
            continue
        if xc < ix1:
            per_col["item"].append(w)
        elif xc >= dx0 - 3:
            per_col["details"].append(w)

    def to_lines(ws, x0, x1):
        rows = {}
        for w in ws:
            rows.setdefault(round(w["top"] / 3), []).append(w)
        out = []
        for k in sorted(rows):
            ws2 = sorted(rows[k], key=lambda w: w["x0"])
            text = " ".join(w["text"] for w in ws2)
            if re.fullmatch(r"\d+|Item|Details", text) or re.match(r"Submitted Date|Processed by", text):
                continue
            out.append({"top": min(w["top"] for w in ws2), "x0": ws2[0]["x0"], "x1": ws2[-1]["x1"], "text": text,
                        "page": pageno, "cell_x0": x0, "cell_x1": x1})
        return out

    item_lines = to_lines(per_col["item"], ix0, ix1)
    det_lines = to_lines(per_col["details"], dx0, dx1)
    # split into blocks at each holder label / kind switch (by vertical position)
    marks = sorted([(t, "holder", h) for t, h in holder_marks] + [(t, "kind", k) for t, k in kind_marks])
    blocks = []
    cur = {"holder": None, "items": [], "details": [], "page": pageno, "kind": kind, "dbox": None}
    bounds = [(-1e9, None)] + [(t - 2, m) for t, *m in [(t, typ, val) for t, typ, val in marks]]
    # walk lines in top order, opening a new block whenever we pass a mark
    events = sorted([(l["top"], "item", l) for l in item_lines] + [(l["top"], "det", l) for l in det_lines] +
                    [(t, typ, val) for t, typ, val in marks], key=lambda e: e[0])
    for top, typ, val in events:
        if typ == "holder":
            if cur["items"] or cur["details"]:
                blocks.append(cur)
            cur = {"holder": val, "items": [], "details": [], "page": pageno, "kind": kind, "dbox": None}
        elif typ == "kind":
            if cur["items"] or cur["details"]:
                blocks.append(cur)
            kind = val
            cur = {"holder": None, "items": [], "details": [], "page": pageno, "kind": kind, "dbox": None}
        elif typ == "item":
            m = ITEM_RE.match(val["text"])
            if m and 1 <= int(m.group(1)) <= 14:
                cur["items"].append([val["top"], int(m.group(1)), _norm_ws(m.group(2))])
            elif cur["items"]:
                cur["items"][-1][2] = _norm_ws(cur["items"][-1][2] + " " + val["text"])
        else:
            cur["details"].append(val)
    if cur["items"] or cur["details"]:
        blocks.append(cur)
    return kind, blocks


def _merge_alteration_blocks(blocks):
    """Attach holder-less / item-less continuation blocks to the block they continue."""
    merged = []
    for b in blocks:
        prev = merged[-1] if merged else None
        continues = prev is not None and prev["kind"] == b["kind"] and (
            b["holder"] is None or (b["holder"] == prev["holder"] and not b["items"] and b["page"] != prev["page"]))
        if continues:
            prev["items"] += b["items"]
            prev["details"] += b["details"]
        else:
            if b["holder"] is None:
                b["holder"] = "unspecified"
            merged.append(b)
    return [b for b in merged if b["items"] or b["details"]]


def _rows_from_alteration_block(b):
    rows_out = []
    items, det = b["items"], b["details"]
    if not det and not items:
        return rows_out
    if not items:
        # continuation text with no item label anywhere: keep it, unclassified
        x0 = det[0]["cell_x0"]; x1 = det[0]["cell_x1"]
        for top, text in _partition(det, x0, x1, None):
            rows_out.append(InterestRow(b["holder"], None, "other", b["kind"], {"item": "", "details": text}, text,
                                        None, b["page"], notes="continuation page without item labels"))
        return rows_out
    details = [""] * len(items)
    if det:
        x0 = det[0]["cell_x0"]; x1 = det[0]["cell_x1"]
        if len(det) >= len(items):
            for k, (top, text) in enumerate(_partition(det, x0, x1, len(items))):
                details[k] = text
        else:
            for top, text in _partition(det, x0, x1, None):
                k = 0
                for i, it in enumerate(items):
                    if it[0] <= top + 2.5:
                        k = i
                details[k] = (details[k] + " " + text).strip()
    for (top, code, label), d in zip(items, details):
        if not d and not label:
            continue
        cat = SECTIONS[code][0] if code in SECTIONS else "other"
        rows_out.append(InterestRow(holder=b["holder"], section_code=code, category=cat, kind=b["kind"],
                                    fields={"item": label, "details": d}, description=d or label,
                                    date_declared=None, page=b["page"]))
    return rows_out


def _ocr_page(page):
    try:
        import pytesseract
    except ImportError:
        return None
    try:
        img = page.to_image(resolution=300).original
        return pytesseract.image_to_string(img)
    except Exception:  # noqa: BLE001
        return None


def _parse_text_lines_statement(text: str, pageno: int, ocr: int) -> list[InterestRow]:
    """Text-only fallback (OCR'd scans): heading -> holder label -> one entry per line."""
    out = []
    section = None
    holder = None
    seen_holder = False
    for raw in text.splitlines():
        line = _norm_ws(raw)
        if not line:
            continue
        m = HEADING_RE.match(line)
        if m and 1 <= int(m.group(1)) <= 14 and len(m.group(2)) > 6 and not line.lower().startswith(("self", "spouse", "dependent")):
            section = int(m.group(1)); holder = None; seen_holder = False
            continue
        if section is None:
            continue
        hm = re.match(r"^(Self|Spouse/?(?:\s*Partner)?|Dependent(?:\s*[Cc]hildren)?|Partner|[Cc]hildren)\b\s*(.*)$", line)
        if hm:
            h = _holder(hm.group(1))
            if hm.group(1).lower() in ("partner", "children") and seen_holder:
                rest = hm.group(2)
                if rest and not _is_nil(rest) and out and out[-1].section_code == section:
                    out[-1].fields["text"] += " " + rest
                    out[-1].description = out[-1].fields["text"]
                continue
            holder = h; seen_holder = True
            rest = hm.group(2)
            if rest and not _is_nil(rest):
                out.append(InterestRow(holder, section, SECTIONS[section][0], "statement", {"text": rest}, rest, None, pageno, ocr))
            continue
        if not seen_holder or holder is None:
            continue  # column header lines
        if _is_nil(line) or re.match(r"^\d+$", line):
            continue
        if line[:1].islower() and out and out[-1].section_code == section and out[-1].holder == holder:
            out[-1].fields["text"] += " " + line
            out[-1].description = out[-1].fields["text"]
        else:
            out.append(InterestRow(holder, section, SECTIONS[section][0], "statement", {"text": line}, line, None, pageno, ocr))
    if ocr:
        cleaned = []
        for r in out:
            t = re.sub(r"\s*(?:/\s*)?(?:partner|children)\s*$", "", r.fields["text"], flags=re.I).strip(" /:|!")
            if OCR_NIL_RE.match(t) or OCR_LABEL_RE.match(t) or len(re.sub(r"[^A-Za-z]", "", t)) < 4:
                continue
            r.fields["text"] = t; r.description = t
            cleaned.append(r)
        out = cleaned
    return out


def parse_house_pdf(path: Path, entry: dict) -> InterestDocument:
    import pdfplumber
    doc_key = re.sub(r"[^A-Za-z0-9]+", "-", entry["file"].rsplit(".", 1)[0]).strip("-").lower()
    doc = InterestDocument(
        doc_id=f"house-{PARLIAMENT}-{doc_key}", chamber="house", parliament=PARLIAMENT,
        member_name_raw=entry.get("name_raw") or entry["file"],
        member_name=_normalize_name(f"{entry['surname']}, {entry['given']}") if entry.get("surname") else None,
        electorate=entry.get("electorate"), state=entry.get("state"), party=None,
        source_url=entry["url"], source_rev=entry.get("rev"), file_sha256=_sha256(path),
        pages=None, ocr_pages=0, last_updated=entry.get("last_updated"), statement_date=None,
        fetched_at=entry.get("fetched_at"))
    with pdfplumber.open(path) as pdf:
        doc.pages = len(pdf.pages)
        page_texts = []
        page_kinds = []
        page_rows: list[list[InterestRow]] = []
        alt_blocks: list[dict] = []
        alt_kind = "addition"
        alt_cols = None
        # a section whose tables spill onto the next page has no heading there: carry the
        # last heading (and the 2(i)/(ii) table count) from the previous statement page
        carry_sec = None          # (top, num, title) of the last heading on the previous page
        carry_count2 = 0
        for pi, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            ocr = 0
            if len(text.strip()) < 40 and page.images:
                o = _ocr_page(page)
                if o is None:
                    doc.warnings.append(f"p{pi}: scanned page, OCR unavailable")
                else:
                    text, ocr = o, 1
                    doc.ocr_pages += 1
            page_texts.append(text)
            rows: list[InterestRow] = []
            is_alt = bool(re.search(r"alteration", text, re.I)) or bool(re.search(r"\b(ADDITION|DELETION)\b", text))
            kind = "alteration" if is_alt else ("statement" if re.search(r"^\s*\d{1,2}\s*\.\s*\S", text, re.M) else "cover")
            if pi == 1:
                m = re.search(r"(\d{2})(?:TH|th|ST|st|ND|nd|RD|rd)\s+Parliament", text)
                if m:
                    doc.parliament = int(m.group(1))
            if ocr:
                if kind == "statement":
                    rows = _parse_text_lines_statement(text, pi, ocr)
                elif kind == "alteration":
                    doc.warnings.append(f"p{pi}: scanned alteration page not parsed (OCR text kept)")
                page_kinds.append(kind); page_rows.append(rows)
                continue
            tables = page.find_tables()
            bboxes = [t.bbox for t in tables]
            if not tables and kind in ("statement", "alteration"):
                # scanned form with an embedded (often garbage) OCR layer: no vector table
                # structure to read, so fall back to text lines. ocr=2 marks this class.
                garbled = sum(1 for ch in text if ord(ch) > 127) / max(len(text), 1)
                if garbled > 0.02 or len(page.images) > 0:
                    o = _ocr_page(page)
                    if o and sum(1 for ch in o if ord(ch) > 127) / max(len(o), 1) < garbled:
                        text = o
                        doc.ocr_pages += 1
                if kind == "statement":
                    rows = _parse_text_lines_statement(text, pi, 2)
                    doc.warnings.append(f"p{pi}: no table structure (scan); text-line fallback")
                elif len(page.images) == 0 and alt_cols is not None:
                    # typed continuation page whose table borders were not detected: bucket the
                    # words into the columns of the last alteration table seen
                    alt_kind, blocks = _fallback_alteration_blocks(page, alt_cols, pi, alt_kind)
                    alt_blocks += blocks
                else:
                    doc.warnings.append(f"p{pi}: scanned alteration page without table structure not parsed")
                page_kinds.append(kind); page_rows.append(rows)
                continue
            if kind == "alteration":
                for t in tables:
                    alt_kind, blocks = _alteration_blocks(page, t, pi, alt_kind)
                    alt_blocks += blocks
                    if blocks and t.rows and len(t.rows[-1].cells) >= 3 and all(t.rows[-1].cells[:3]):
                        c = t.rows[-1].cells
                        alt_cols = ((c[0][0], c[0][2]), (c[1][0], c[1][2]), (c[2][0], c[2][2]))
            elif kind == "statement":
                heads = _page_headings(page, bboxes)
                per_section_count: dict[int, int] = {}
                if carry_sec is not None:
                    heads = [(-1.0, carry_sec[1], carry_sec[2])] + heads
                    if carry_sec[1] == 2:
                        per_section_count[2] = carry_count2
                for t in tables:
                    sec = _table_section(t.bbox[1], heads)
                    if sec is None:
                        continue
                    per_section_count[sec[1]] = per_section_count.get(sec[1], 0) + 1
                    sub = None
                    if sec[1] == 2:
                        sub = "i" if per_section_count[2] == 1 else "ii"
                    rows += _parse_statement_table(page, t, sec, pi, sub)
                real_heads = [h for h in heads if h[0] >= 0]
                if real_heads:
                    carry_sec = max(real_heads)
                    carry_count2 = per_section_count.get(2, 0) if carry_sec[1] == 2 else 0
            else:
                carry_sec = None
            page_kinds.append(kind); page_rows.append(rows)

        # statement date: first dd/mm/yyyy on a cover/statement page if present, else the
        # registrar's first processed date (statements themselves are usually undated).
        for txt, k in zip(page_texts, page_kinds):
            if k in ("cover", "statement"):
                m = re.search(r"(?:Date|Signed|Dated)\D{0,20}(\d{1,2}/\d{1,2}/\d{4})", txt)
                if m:
                    doc.statement_date = _iso(m.group(1)); break
        # alteration rows: merge continuation blocks across pages, then partition details
        for b in _merge_alteration_blocks(alt_blocks):
            page_rows[b["page"] - 1] += _rows_from_alteration_block(b)
        # alteration dates: a notification runs from an 'I wish to notify' page to the page that
        # carries 'Submitted Date'; every page in that span gets that date.
        n = len(page_texts)
        starts = [bool(re.search(r"I wish to notify", t, re.I)) for t in page_texts]
        for i in range(n):
            if page_kinds[i] != "alteration":
                continue
            date = None
            for j in range(i, n):
                if j > i and starts[j]:
                    break
                m = SUBMITTED_RE.search(page_texts[j]) or PROCESSED_RE.search(page_texts[j])
                if m:
                    date = _iso(m.group(1)); break
            for r in page_rows[i]:
                if r.kind != "statement":
                    r.date_declared = date
        for rows in page_rows:
            doc.rows += rows
        if not doc.statement_date:
            first_alt = min((r.date_declared for r in doc.rows if r.date_declared), default=None)
            doc.statement_date = first_alt
        if not any(k == "statement" for k in page_kinds):
            doc.warnings.append("no statement pages recognised")
    return doc


# ---------------------------------------------------------------------------
# Senate: HTML parsing
# ---------------------------------------------------------------------------

def parse_senate_index(html: str) -> list[dict]:
    """Register list page -> [{id, name_raw, party, state, url}]."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    out, seen = [], set()
    for a in soup.find_all("a", href=True):
        m = re.search(r"/Senators_Interests_Register/([A-Za-z0-9]+)/?$", a["href"])
        if not m or m.group(1) in seen:
            continue
        seen.add(m.group(1))
        tr = a.find_parent("tr")
        cells = [_norm_ws(td.get_text(" ")) for td in tr.find_all("td")] if tr else []
        name = _norm_ws((a.find("strong") or a).get_text(" ")) or (cells[0] if cells else "")
        out.append({"id": m.group(1), "name_raw": name, "party": cells[1] if len(cells) > 1 else None,
                    "state": cells[2] if len(cells) > 2 else None,
                    "last_updated": _iso(cells[3]) if len(cells) > 3 else None,
                    "url": SENATE_INDEX_URL + "/" + m.group(1)})
    return out


def parse_senate_page(html: str, url: str, senator_id: str) -> InterestDocument:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    title = soup.select_one("h2.aph-page-header__title")
    name_raw = _norm_ws(title.get_text(" ")) if title else senator_id
    name_raw = re.sub(r"^Senator\s+", "", name_raw)
    details = {}
    for box in soup.select(".senator-details__detail-container"):
        k = _norm_ws(box.find("strong").get_text()) .rstrip(":") if box.find("strong") else ""
        v = _norm_ws(" ".join(p.get_text(" ") for p in box.find_all("p")))
        details[k.lower()] = v
    party = details.get("party") or (_norm_ws(soup.select_one(".aph-page-header__custom-children").get_text()) if soup.select_one(".aph-page-header__custom-children") else None)
    doc = InterestDocument(
        doc_id=f"senate-{PARLIAMENT}-{senator_id.lower()}", chamber="senate", parliament=PARLIAMENT,
        member_name_raw=name_raw, member_name=_normalize_name(name_raw), electorate=None,
        state=details.get("state/territory"), party=party, source_url=url, source_rev=None,
        file_sha256=hashlib.sha256(html.encode("utf-8", "replace")).hexdigest(), pages=None, ocr_pages=0,
        last_updated=_iso(details.get("last modified")), statement_date=None, fetched_at=None)
    for block in soup.select(".interests-table-collapse"):
        h3 = block.find("h3")
        if not h3:
            continue
        m = HEADING_RE.match(_norm_ws(h3.get_text(" ")))
        if not m:
            continue
        code = int(m.group(1))
        if code not in SECTIONS:
            continue
        cat = SECTIONS[code][0]
        content = block.select_one(".interests-table-collapse__content") or block
        for table in content.find_all("table"):
            ths = [_norm_ws(th.get_text(" ")) for th in table.select("thead th")]
            for tr in table.select("tbody tr"):
                tds = [_norm_ws(td.get_text(" ")) for td in tr.find_all("td")]
                if not tds or all(_is_nil(t) for t in tds):
                    continue
                fields = {(ths[i] if i < len(ths) and ths[i] else f"col{i+1}"): t for i, t in enumerate(tds) if t}
                doc.rows.append(InterestRow("unspecified", code, cat, "statement", fields,
                                            " — ".join(fields.values()), None, None))
        for item in content.select(".alterations__alteration-item"):
            strong = item.find("strong")
            kind = (_norm_ws(strong.get_text()).lower() if strong else "addition")
            kind = "deletion" if kind.startswith("del") else "addition"
            ps = [_norm_ws(p.get_text(" ")) for p in item.find_all("p")]
            ps = [p for p in ps if p and p.lower() not in ("addition", "deletion")]
            date = next((p for p in ps if DATE_ANY_RE.fullmatch(p)), None)
            text = " ".join(p for p in ps if p != date)
            if not text:
                continue
            doc.rows.append(InterestRow("unspecified", code, cat, kind, {"details": text}, text, _iso(date), None))
    if not doc.rows and not soup.select(".interests-table-collapse"):
        doc.warnings.append("no interests blocks found (not a senator detail page?)")
    return doc


# ---------------------------------------------------------------------------
# Member matching (members table; dirty for historic rows, so prefer current + electorate)
# ---------------------------------------------------------------------------

def match_person_id(conn: sqlite3.Connection, doc: InterestDocument) -> str | None:
    if not doc.member_name:
        return None
    parts = doc.member_name.split()
    last = parts[-1]
    chamber = MEMBERS_CHAMBER.get(doc.chamber, doc.chamber)
    cur = conn.execute("SELECT person_id, full_name, first_name, electorate, left_house FROM members "
                       "WHERE last_name = ? COLLATE NOCASE AND chamber = ?", (last, chamber)).fetchall()
    if not cur:
        cur = conn.execute("SELECT person_id, full_name, first_name, electorate, left_house FROM members "
                           "WHERE full_name = ? COLLATE NOCASE", (doc.member_name,)).fetchall()
    if not cur:
        return None
    if doc.electorate:
        e = [r for r in cur if (r[3] or "").lower() == doc.electorate.lower()]
        if len(e) == 1:
            return e[0][0]
        if e:
            cur = e
    # Several people share the surname: a first-name agreement beats the tenure flag, because
    # `members.left_house` is dirty for sitting senators (Marielle Smith and Matt O'Sullivan carry
    # 2023 exit dates) and the "current" rule then hands their register to Dean Smith / Barry
    # O'Sullivan. A person who left before 2019 cannot hold a 48th-Parliament statement, so
    # historic namesakes are still excluded.
    first = parts[0].lower()
    if len(cur) > 1:
        agree = [r for r in cur if (r[2] or "").lower() == first and (not r[4] or r[4] >= "2019-01-01")]
        if len(agree) == 1:
            return agree[0][0]
        if len(agree) > 1:
            agree_current = [r for r in agree if not r[4]]
            if len(agree_current) == 1:
                return agree_current[0][0]
    current = [r for r in cur if not r[4]]
    if len(current) == 1:
        return current[0][0]
    exact = [r for r in cur if (r[1] or "").lower() == doc.member_name.lower()]
    if len(exact) == 1:
        return exact[0][0]
    if len(exact) > 1:
        cur_exact = [r for r in exact if not r[4]]
        return cur_exact[0][0] if len(cur_exact) == 1 else exact[0][0]
    return None


# ---------------------------------------------------------------------------
# Storage (NEW tables only)
# ---------------------------------------------------------------------------

DDL = """
CREATE TABLE IF NOT EXISTS ext_interests_documents (
    doc_id          TEXT PRIMARY KEY,
    jurisdiction    TEXT NOT NULL,          -- federal | qld | ...
    chamber         TEXT NOT NULL,          -- house | senate | qld_la ...
    parliament      INTEGER,                -- the period: 48 (federal) / 58 (QLD)
    person_id       TEXT,                   -- members.person_id when matched (no FK: never block a load)
    member_name_raw TEXT NOT NULL,
    member_name     TEXT,
    electorate      TEXT,
    state           TEXT,
    party           TEXT,
    source_url      TEXT NOT NULL,
    source_rev      TEXT,
    file_sha256     TEXT,
    pages           INTEGER,
    ocr_pages       INTEGER DEFAULT 0,
    last_updated    TEXT,
    statement_date  TEXT,
    fetched_at      TEXT,
    parsed_at       TEXT,
    parser_version  TEXT,
    n_rows          INTEGER,
    warnings        TEXT,
    kb_text         TEXT
);
CREATE TABLE IF NOT EXISTS ext_interests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id          TEXT NOT NULL REFERENCES ext_interests_documents(doc_id) ON DELETE CASCADE,
    person_id       TEXT,
    member_name     TEXT,
    jurisdiction    TEXT NOT NULL,          -- federal | qld | ...
    chamber         TEXT NOT NULL,
    parliament      INTEGER,
    holder          TEXT,                   -- self | spouse | children | unspecified
    section_code    INTEGER,
    section_title   TEXT,
    subsection      TEXT,
    category        TEXT NOT NULL,
    kind            TEXT NOT NULL,          -- statement | addition | deletion
    fields_json     TEXT,
    description     TEXT,
    date_declared   TEXT,
    source_url      TEXT,
    page            INTEGER,
    ocr             INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ext_interests_person ON ext_interests(person_id);
CREATE INDEX IF NOT EXISTS idx_ext_interests_cat ON ext_interests(category);
CREATE INDEX IF NOT EXISTS idx_ext_interests_doc ON ext_interests(doc_id);
"""


def ensure_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(DDL)


def render_kb_text(doc: InterestDocument) -> str:
    """One plain-text document per member-period for the KB (kind=interests_statement)."""
    who = doc.member_name or doc.member_name_raw
    if doc.chamber == "senate":
        where = f"Senator for {doc.state or 'Australia'}"
    else:
        where = f"Member for {doc.electorate}, {doc.state}"
    body = {"house": "House of Representatives", "senate": "Senate", "qld_la": "Queensland Legislative Assembly"}.get(doc.chamber, doc.chamber)
    lines = [f"Register of {'Senators' if doc.chamber == 'senate' else 'Members'}' Interests — {who} ({where}), "
             f"{doc.parliament}th Parliament, {body}.",
             f"Source: {doc.source_url}" + (f" (last updated {doc.last_updated})" if doc.last_updated else ""), ""]
    # federal rows group by form item number; state rows (no item number) by category, titled
    # from the row's own subclause note
    by_sec: dict[tuple, list[InterestRow]] = {}
    for r in doc.rows:
        key = (0, r.section_code) if r.section_code else (1, r.category)
        by_sec.setdefault(key, []).append(r)
    for key in sorted(by_sec, key=lambda k: (k[0], str(k[1]))):
        rows = by_sec[key]
        if key[0] == 0:
            heading = f"{key[1]}. {SECTIONS.get(key[1], ('other', 'Other'))[1]}"
        else:
            heading = f"{key[1].replace('_', ' ').capitalize()} — {rows[0].notes}" if rows[0].notes else key[1].replace("_", " ").capitalize()
        lines.append(heading)
        for r in rows:
            holder = "" if r.holder in (None, "unspecified") else f" [{r.holder}]"
            prefix = {"statement": "-", "addition": "+ added", "deletion": "- deleted"}[r.kind]
            date = f" ({r.date_declared})" if r.date_declared and r.kind != "statement" else ""
            lines.append(f"  {prefix}{holder}: {r.description}{date}")
        lines.append("")
    if not doc.rows:
        lines.append("No registrable interests parsed from this document.")
    return "\n".join(lines).strip() + "\n"


def store_document(conn: sqlite3.Connection, doc: InterestDocument) -> None:
    kb = render_kb_text(doc)
    jur = jurisdiction_of(doc.chamber)
    conn.execute("DELETE FROM ext_interests WHERE doc_id = ?", (doc.doc_id,))
    conn.execute(
        """INSERT OR REPLACE INTO ext_interests_documents
           (doc_id, jurisdiction, chamber, parliament, person_id, member_name_raw, member_name, electorate, state, party,
            source_url, source_rev, file_sha256, pages, ocr_pages, last_updated, statement_date, fetched_at,
            parsed_at, parser_version, n_rows, warnings, kb_text)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (doc.doc_id, jur, doc.chamber, doc.parliament, doc.person_id, doc.member_name_raw, doc.member_name,
         doc.electorate, doc.state, doc.party, doc.source_url, doc.source_rev, doc.file_sha256, doc.pages,
         doc.ocr_pages, doc.last_updated, doc.statement_date, doc.fetched_at,
         datetime.now(timezone.utc).isoformat(timespec="seconds"), PARSER_VERSION, len(doc.rows),
         json.dumps(doc.warnings) if doc.warnings else None, kb))
    conn.executemany(
        """INSERT INTO ext_interests (doc_id, person_id, member_name, jurisdiction, chamber, parliament, holder,
             section_code, section_title, subsection, category, kind, fields_json, description, date_declared,
             source_url, page, ocr)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        [(doc.doc_id, doc.person_id, doc.member_name, jur, doc.chamber, doc.parliament, r.holder, r.section_code,
          SECTIONS.get(r.section_code, ("other", None))[1] if r.section_code else None, r.subsection, r.category,
          r.kind, json.dumps(r.fields, ensure_ascii=False), r.description, r.date_declared,
          doc.source_url + (f"#page={r.page}" if r.page else ""), r.page, r.ocr) for r in doc.rows])


def doc_to_json(doc: InterestDocument) -> dict:
    d = asdict(doc)
    return d


def doc_from_json(d: dict) -> InterestDocument:
    rows = [InterestRow(**r) for r in d.pop("rows", [])]
    doc = InterestDocument(**d)
    doc.rows = rows
    return doc


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _open_db(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(path), timeout=300)
    conn.execute("PRAGMA busy_timeout = 600000")
    return conn


def _write_eval_dump(doc: InterestDocument, pdf_path: Path, out_dir: Path) -> None:
    """Side-by-side page text vs parsed rows, for manual accuracy scoring."""
    import pdfplumber
    out_dir.mkdir(parents=True, exist_ok=True)
    with pdfplumber.open(pdf_path) as pdf, open(out_dir / (doc.doc_id + ".txt"), "w") as f:
        f.write(f"# {doc.member_name_raw}  rows={len(doc.rows)} ocr_pages={doc.ocr_pages} warnings={doc.warnings}\n")
        for pi, page in enumerate(pdf.pages, start=1):
            f.write(f"\n\n======== PAGE {pi} — SOURCE TEXT ========\n")
            f.write(page.extract_text() or "[no text layer]")
            f.write(f"\n-------- PAGE {pi} — PARSED ROWS --------\n")
            for r in doc.rows:
                if r.page == pi:
                    f.write(f"[{r.kind}:{r.section_code}:{r.holder}] {r.description}  {r.date_declared or ''}\n")


def cmd_house(args):
    entries = fetch_house_index(args.index_html, args.browser_ua)
    entries = [e for e in entries if e.get("surname")]
    print(f"[house] {len(entries)} member PDFs on the index")
    if args.only:
        entries = [e for e in entries if args.only.lower() in e["file"].lower()]
    dest = Path(args.pdf_dir) if args.pdf_dir else CACHE_DIR / f"house/{PARLIAMENT}p"
    if args.no_download:
        pairs = [(e, dest / e["file"]) for e in (entries[:args.limit] if args.limit else entries) if (dest / e["file"]).exists()]
    else:
        pairs = download_house_pdfs(entries, dest, limit=args.limit)
    docs = []
    for e, path in pairs:
        meta = dest / (e["file"] + ".json")
        if meta.exists():
            e = {**e, **{k: v for k, v in json.loads(meta.read_text()).items() if k == "fetched_at"}}
        try:
            doc = parse_house_pdf(path, e)
        except Exception as ex:  # noqa: BLE001
            print(f"  [error] {e['file']}: {ex}")
            continue
        docs.append(doc)
        print(f"  {e['file']:28s} pages={doc.pages:3d} rows={len(doc.rows):3d} ocr={doc.ocr_pages} {' '.join(doc.warnings)}")
        if args.eval_dump:
            _write_eval_dump(doc, path, Path(args.eval_dump))
    _finish(docs, args)


def cmd_senate(args):
    html_dir = Path(args.senate_html_dir) if args.senate_html_dir else None
    docs = []
    if html_dir:
        files = sorted(html_dir.glob("*.html"))
        for f in files:
            html = f.read_text(encoding="utf-8", errors="replace")
            sid = re.sub(r"^senate[_-]", "", f.stem)
            doc = parse_senate_page(html, SENATE_INDEX_URL + "/" + sid, sid)
            if doc.warnings and not doc.rows:
                print(f"  {f.name}: skipped ({doc.warnings[0]})")
                continue
            docs.append(doc)
            print(f"  {f.name:24s} {doc.member_name_raw:30s} rows={len(doc.rows):3d} last_modified={doc.last_updated}")
    else:
        s = _session(args.browser_ua)
        r = s.get(SENATE_INDEX_URL, timeout=60)
        if r.status_code == 403:
            sys.exit("www.aph.gov.au 403 for this User-Agent; save the pages and use --senate-html-dir, or --browser-ua.")
        index = parse_senate_index(r.text)
        print(f"[senate] {len(index)} senators on the index")
        for e in index[:args.limit] if args.limit else index:
            rr = s.get(e["url"], timeout=60); rr.raise_for_status()
            doc = parse_senate_page(rr.text, e["url"], e["id"])
            docs.append(doc)
            print(f"  {e['id']:8s} {doc.member_name_raw:30s} rows={len(doc.rows):3d}")
            time.sleep(0.5)
    _finish(docs, args)


def _finish(docs, args):
    if args.export_jsonl:
        with open(args.export_jsonl, "w") as f:
            for d in docs:
                f.write(json.dumps(doc_to_json(d), ensure_ascii=False) + "\n")
        print(f"[export] {len(docs)} documents / {sum(len(d.rows) for d in docs)} rows -> {args.export_jsonl}")
    if args.db and not args.dry_run:
        _load_docs(docs, Path(args.db))
    elif args.dry_run:
        print("[dry-run] not writing to the database")


INGEST_LOG_DDL = """
CREATE TABLE IF NOT EXISTS ext_ingest_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    source TEXT NOT NULL,
    rows_loaded INTEGER,
    rows_deleted INTEGER,
    loaded_at TEXT NOT NULL,
    notes TEXT
);
"""


def _load_docs(docs, db_path: Path):
    """Store documents; one ext_ingest_log line per (chamber, parliament) source, as the ext_* money
    loaders do. Existing rows for the same doc_ids are replaced, other sources are never touched."""
    conn = _open_db(db_path)
    ensure_tables(conn)
    conn.executescript(INGEST_LOG_DDL)
    matched = 0
    by_source: dict[str, list[InterestDocument]] = {}
    for d in docs:
        by_source.setdefault(f"{d.chamber}-{d.parliament}", []).append(d)
    for source, group in by_source.items():
        ids = [d.doc_id for d in group]
        deleted = 0
        for i in range(0, len(ids), 500):
            chunk = ids[i:i + 500]
            deleted += conn.execute(f"SELECT COUNT(*) FROM ext_interests WHERE doc_id IN ({','.join('?' * len(chunk))})",
                                    chunk).fetchone()[0]
        for d in group:
            try:
                d.person_id = match_person_id(conn, d)
            except sqlite3.OperationalError:
                d.person_id = None
            matched += bool(d.person_id)
            store_document(conn, d)
        conn.execute("INSERT INTO ext_ingest_log (table_name, source, rows_loaded, rows_deleted, loaded_at, notes) VALUES (?,?,?,?,?,?)",
                     ("ext_interests", source, sum(len(d.rows) for d in group), deleted,
                      datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                      f"{len(group)} documents, parser {PARSER_VERSION}"))
    conn.commit()
    n_docs = conn.execute("SELECT COUNT(*) FROM ext_interests_documents").fetchone()[0]
    n_rows = conn.execute("SELECT COUNT(*) FROM ext_interests").fetchone()[0]
    print(f"[db] stored {len(docs)} documents ({matched} matched to members) -> "
          f"ext_interests_documents={n_docs} ext_interests={n_rows}")
    conn.close()


def cmd_load(args):
    docs = [doc_from_json(json.loads(l)) for l in open(args.jsonl) if l.strip()]
    _load_docs(docs, Path(args.db))


def cmd_kb_export(args):
    """Write KB documents (kind=interests_statement) as JSONL for a LATER, user-approved push."""
    conn = _open_db(Path(args.db))
    n = 0
    with open(args.out, "w") as f:
        for row in conn.execute("SELECT doc_id, chamber, parliament, person_id, member_name, member_name_raw, electorate, "
                                "state, party, source_url, last_updated, kb_text FROM ext_interests_documents"):
            doc_id, chamber, parl, pid, name, name_raw, elec, state, party, url, upd, text = row
            f.write(json.dumps({
                "slug": f"interests-{doc_id}", "kind": "interests_statement",
                "title": f"Register of interests — {name or name_raw} ({parl}th Parliament, {chamber})",
                "text": text, "speaker": name, "person_id": pid, "chamber": chamber, "parliament": parl,
                "electorate": elec, "state": state, "party": party, "source_url": url, "created": upd,
                "licence": "CC BY-NC-ND 4.0 (Parliament of Australia website)"}, ensure_ascii=False) + "\n")
            n += 1
    print(f"[kb-export] {n} documents -> {args.out} (NOT pushed; see docs/DATA-INTERESTS.md)")


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(sp):
        sp.add_argument("--limit", type=int)
        sp.add_argument("--db", default=None, help="parli.db path; omit to skip loading")
        sp.add_argument("--dry-run", action="store_true")
        sp.add_argument("--export-jsonl")
        sp.add_argument("--browser-ua", action="store_true",
                        help="opt in to a browser-style UA for www.aph.gov.au (WAF blocks bots); off by default")

    h = sub.add_parser("house"); common(h)
    h.add_argument("--index-html", help="saved copy of the register index page (avoids the WAF)")
    h.add_argument("--pdf-dir", help="where PDFs are cached (default ~/.cache/autoresearch/conduct_interests/federal/house/48p)")
    h.add_argument("--no-download", action="store_true")
    h.add_argument("--only", help="substring filter on the PDF filename")
    h.add_argument("--eval-dump", help="directory for side-by-side text/rows files")
    h.set_defaults(func=cmd_house)

    s = sub.add_parser("senate"); common(s)
    s.add_argument("--senate-html-dir", help="directory of saved senator pages (<id>.html)")
    s.set_defaults(func=cmd_senate)

    l = sub.add_parser("load")
    l.add_argument("--jsonl", required=True); l.add_argument("--db", default=str(DEFAULT_DB))
    l.set_defaults(func=cmd_load)

    k = sub.add_parser("kb-export")
    k.add_argument("--db", default=str(DEFAULT_DB)); k.add_argument("--out", required=True)
    k.set_defaults(func=cmd_kb_export)

    args = p.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
