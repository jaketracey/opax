"""
parli.ingest.money_diaries -- ministerial diary disclosures into
`ext_ministerial_meetings` (who ministers met, when, and why).

Two jurisdictions publish machine-parsable diaries; both are PDF tables
(Date | Organisation/Individual | Purpose) which pdfplumber extracts cleanly:

  nsw_diary  NSW Cabinet Office "Ministers' diary disclosures": one PDF per
             minister per quarter, indexed by year at
             https://www.nsw.gov.au/departments-and-agencies/cabinet-office/
             access-to-information/ministers-diary-disclosures (2019 onwards
             online; scheme began 2014). nsw.gov.au content is CC BY 4.0.
  qld_diary  QLD Cabinet and Ministerial Directory: one PDF per minister per
             month (published end of the following month), linked from each
             minister's page under https://cabinet.qld.gov.au/ministers-portfolios/
             for the current government, and from cabinet-YYYY-YYYY/ pages for
             former governments (2013-2015, 2015-2017, 2017-2020, 2020-2024).
             cabinet.qld.gov.au content is CC BY 3.0 AU.

Neither publishes attendee lists as structured data: the organisation cell
often holds several names/roles separated by line breaks. We keep the first
line as `organisation` and the whole cell as `attendees`.

The legacy `ministerial_meetings` table (3,237 QLD rows, 3 ministers, header
strings mis-parsed as dates) is left untouched.

Usage:
    python -m parli.ingest.money_diaries --jurisdiction nsw --years 2025 2026
    python -m parli.ingest.money_diaries --jurisdiction qld                  # current government
    python -m parli.ingest.money_diaries --jurisdiction qld --period 2020-2024
    python -m parli.ingest.money_diaries --jurisdiction nsw --years 2025 --limit-pdfs 5 --db /tmp/t.db
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
from datetime import datetime, timezone
from urllib.parse import unquote, urljoin, urlsplit

from parli.ingest.ext_common import (
    CACHE_ROOT, MONTHS, add_writer_args, cached_bytes, clean_ws, log, make_session, parse_date,
    polite_get, writer_from_args,
)

CACHE = CACHE_ROOT / "diaries"

DDL = """
CREATE TABLE IF NOT EXISTS ext_ministerial_meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jurisdiction TEXT NOT NULL,          -- nsw | qld
    source TEXT NOT NULL,                -- nsw_diary | qld_diary
    minister_name TEXT,                  -- person, where the diary states it (QLD: 'The Hon. X MP'); NSW diaries name the office
    minister_title TEXT,                 -- office/title as published ('Premier', 'Minister for Health ...')
    portfolio TEXT,                      -- portfolio string from the diary header
    government_period TEXT,              -- 'current' or e.g. '2020-2024' (QLD former governments)
    period_start TEXT,                   -- ISO
    period_end TEXT,                     -- ISO
    period_label TEXT,                   -- 'Q4 2025', 'February 2026'
    meeting_date TEXT,                   -- ISO; first date when the cell is a range
    meeting_date_raw TEXT,
    organisation TEXT,                   -- first line of the organisation/individual cell
    attendees TEXT,                      -- full cell ('; ' joined)
    lobbyist TEXT,                       -- NSW: 'Lobbyist: <firm>, <person>' lines from the cell (registered lobbyists present)
    purpose TEXT,
    source_url TEXT NOT NULL,
    pdf_page INTEGER,
    row_order INTEGER,
    ingested_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ext_mm_source ON ext_ministerial_meetings(source);
CREATE INDEX IF NOT EXISTS idx_ext_mm_minister ON ext_ministerial_meetings(minister_name);
CREATE INDEX IF NOT EXISTS idx_ext_mm_date ON ext_ministerial_meetings(meeting_date);
CREATE INDEX IF NOT EXISTS idx_ext_mm_org ON ext_ministerial_meetings(organisation);
CREATE INDEX IF NOT EXISTS idx_ext_mm_url ON ext_ministerial_meetings(source_url);
"""

COLUMNS = [
    "jurisdiction", "source", "minister_name", "minister_title", "portfolio", "government_period",
    "period_start", "period_end", "period_label", "meeting_date", "meeting_date_raw", "organisation",
    "attendees", "lobbyist", "purpose", "source_url", "pdf_page", "row_order", "ingested_at",
]

_MONTH_RX = "(?:" + "|".join(m[:3] for m in MONTHS) + ")[a-z]*"
# NSW cells: 1.10.2025 / 1/10/2025 / 4 February (some ministers omit the year)
DATE_CELL_NSW = re.compile(r"^\s*(?:\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{1,2}\s+" + _MONTH_RX + r"(?:\s+\d{4})?)\b", re.I)
DATE_CELL_QLD = re.compile(r"^\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}\b")
# 1.10.2025 / 1.10.25 / 1/10/2025 / 02/04/25 / 1 October 2025 / 1 Oct 2025 -- every style seen across ministers
NSW_DATE_FORMATS = ["dmy_dot", "dmy_dot2", "dmy_slash", "dmy_slash2", "d_month_y", "d_mon_y"]
_LOBBYIST_LINE = re.compile(r"^lobbyists?\s*[:\-–]\s*", re.I)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _sane_date(iso: str | None, ps: str | None, pe: str | None) -> str | None:
    """Drop typo years (a 2926, a 2005 inside a 2025 diary); the raw cell is kept."""
    if not iso:
        return None
    y = int(iso[:4])
    lo = int(ps[:4]) - 1 if ps else 2000
    hi = int(pe[:4]) + 1 if pe else datetime.now().year + 1
    return iso if lo <= y <= hi else None


def _meeting_row(jur: str, source: str, hdr: dict, period: str, m: dict, url: str) -> list:
    org_lines = m["org_lines"]
    lobby = [clean_ws(_LOBBYIST_LINE.sub("", l)) for l in org_lines if _LOBBYIST_LINE.match(l)]
    plain = [l for l in org_lines if not _LOBBYIST_LINE.match(l)]
    return [jur, source, hdr.get("minister_name"), hdr.get("minister_title"), hdr.get("portfolio"), period,
            hdr.get("period_start"), hdr.get("period_end"), hdr.get("period_label"),
            _sane_date(m["meeting_date"], hdr.get("period_start"), hdr.get("period_end")), m["meeting_date_raw"],
            (plain or org_lines or [None])[0], "; ".join(org_lines) or None, "; ".join(lobby) or None,
            "; ".join(m["purpose_lines"]) or None, url, m["pdf_page"], m["row_order"], _now()]


def _cache_path(jur: str, url: str) -> "Path":
    from pathlib import Path
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", urlsplit(url).path.strip("/"))[-150:]
    return CACHE / jur / (hashlib.sha1(url.encode()).hexdigest()[:8] + "_" + name)


# ── PDF table parsing (shared) ───────────────────────────────────────────────

def parse_diary_tables(pdf_bytes: bytes, date_rx: re.Pattern, date_formats: list[str]) -> tuple[list[dict], str]:
    """Return (meetings, first_page_text). Rows whose first non-empty cell is a
    date start a meeting; rows without a date continue the previous one."""
    import pdfplumber
    meetings: list[dict] = []
    first_text = ""
    cur: dict | None = None
    order = 0
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for pno, page in enumerate(pdf.pages, start=1):
            if pno == 1:
                first_text = page.extract_text() or ""
            for table in page.extract_tables() or []:
                for row in table:
                    cells = [clean_ws(c) if c else "" for c in (row or [])]
                    # keep cell positions but drop empties for the value list
                    vals = [c for c in cells if c]
                    if not vals:
                        continue
                    joined = " ".join(vals).lower()
                    if ("date" in joined and ("organisation" in joined or "purpose" in joined)) or joined.startswith("date of meeting"):
                        continue
                    if date_rx.match(vals[0]):
                        if cur:
                            meetings.append(cur)
                        raw = vals[0]
                        first_date = re.split(r"\s*[–-]\s*|\s+to\s+", raw)[0]
                        iso = parse_date(first_date, date_formats)
                        org_cell = row_cell(row, 1)
                        purpose_cell = row_cell(row, 2)
                        order += 1
                        cur = {"meeting_date": iso, "meeting_date_raw": raw, "org_lines": _lines(org_cell),
                               "purpose_lines": _lines(purpose_cell), "pdf_page": pno, "row_order": order}
                    elif cur is not None:
                        org_cell = row_cell(row, 1) if len(vals) > 1 else (vals[0] if not row_cell(row, 2) else "")
                        purpose_cell = row_cell(row, 2)
                        if len(vals) == 1 and not org_cell and not purpose_cell:
                            org_cell = vals[0]
                        cur["org_lines"] += _lines(org_cell)
                        cur["purpose_lines"] += _lines(purpose_cell)
    if cur:
        meetings.append(cur)
    return meetings, first_text


def _lines(cell: str | None) -> list[str]:
    if not cell:
        return []
    return [clean_ws(x) for x in re.split(r"\n+", cell) if clean_ws(x)]


def row_cell(row, logical_idx: int) -> str:
    """pdfplumber pads merged columns with None; the k-th non-None cell is the
    k-th logical column. Return the raw (newline-preserving) text."""
    nonnull = [c for c in (row or []) if c not in (None, "")]
    return nonnull[logical_idx] if logical_idx < len(nonnull) else ""


# ── NSW ──────────────────────────────────────────────────────────────────────

NSW_INDEX = "https://www.nsw.gov.au/departments-and-agencies/cabinet-office/access-to-information/ministers-diary-disclosures"


def nsw_year_pages(session) -> dict[int, str]:
    from bs4 import BeautifulSoup
    r = polite_get(session, NSW_INDEX)
    soup = BeautifulSoup(r.text, "lxml")
    pages = {}
    for a in soup.select("a[href*='ministers-diary-disclosures/']"):
        m = re.search(r"ministers-diary-disclosures/((\d{4})[^/?#]*)", a["href"])
        if m:
            pages[int(m.group(2))] = urljoin(NSW_INDEX, a["href"])
    return pages


def nsw_pdf_links(session, year_url: str) -> list[dict]:
    """PDF links on a year page, each tagged with the nearest preceding heading (the quarter)."""
    from bs4 import BeautifulSoup
    r = polite_get(session, year_url)
    soup = BeautifulSoup(r.text, "lxml")
    links, heading = [], None
    for el in soup.find_all(["h2", "h3", "h4", "a"]):
        if el.name != "a":
            heading = clean_ws(el.get_text(" "))
            continue
        href = el.get("href") or ""
        if ".pdf" not in href.lower():
            continue
        links.append({"url": urljoin(year_url, href).split("?")[0], "label": clean_ws(el.get_text(" ")),
                      "heading": heading})
    seen, out = set(), []
    for l in links:
        if l["url"] not in seen:
            seen.add(l["url"]); out.append(l)
    return out


# "1.10.2025 to 31.12.2025", "1 October 2025 to 31 December 2025", "1st October 2025 to
# 31st December 2025", and the common short form "1 July to 30 September 2023" /
# "1 July – 30 September 2025" where only the end date carries the year
_NSW_D1 = r"(\d{1,2}(?:st|nd|rd|th)?\s*[./]?\s*[A-Za-z0-9]+?)(\s*[./]?\s*\d{4}|\s*[./]\s*\d{2})?"
_NSW_D2 = r"(\d{1,2}(?:st|nd|rd|th)?\s*[./]?\s*[A-Za-z0-9]+\s*[./]?\s*(\d{2,4}))"
_NSW_PERIOD_RX = re.compile(r"period\s+(?:of\s+)?" + _NSW_D1 + r"\s*(?:to|-|–)\s*" + _NSW_D2, re.I)
_NSW_FILE_Q_RX = re.compile(r"(?:q([1-4])[-_ ]?(20\d{2})|(20\d{2})[-_ ]?q([1-4]))", re.I)
# "... - July 2024 to September 2024.pdf"
_NSW_FILE_RANGE_RX = re.compile(r"(" + _MONTH_RX + r")\s+(20\d{2})\s*(?:to|-|–)\s*(" + _MONTH_RX + r")\s+(20\d{2})", re.I)
_NSW_JUNK_LINE = re.compile(r"^(official|\d+|page \d+.*)$", re.I)


def _nsw_date(s: str) -> str | None:
    s = re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", s)
    return parse_date(s, ["dmy_dot", "dmy_dot2", "dmy_slash", "d_month_y", "d_mon_y"])


def nsw_header(first_text: str, link: dict) -> dict:
    """Office title, period and label for one NSW diary PDF.

    The year-page link label ("NSW Premier", "Minister for Health ...") is the
    cleanest office string, so it wins; the PDF's own "<office> Disclosure
    Summary" heading (sometimes on two lines, sometimes garbled by overprinted
    text) is the fallback and is kept as `portfolio` when it adds information.
    The minister's surname only appears in the file name
    (minister-catley-diary-disclosure-2025-q4.pdf) -- recorded when present."""
    lines = [clean_ws(x) for x in first_text.splitlines() if clean_ws(x) and not _NSW_JUNK_LINE.match(clean_ws(x))]
    pdf_title = None
    for i, ln in enumerate(lines[:8]):
        m = re.match(r"(.*?)\s*(?:Diary\s+)?Disclosure\s+Summary\s*\d*$", ln, re.I)
        if m:
            pdf_title = clean_ws(m.group(1)) or (lines[i - 1] if i > 0 else None)
            break
    label_title = clean_ws(re.sub(r"\(\s*PDF[^)]*\)", "", link.get("label") or ""))
    # 2023-era labels read "Treasurer - Diary Disclosure - 2023 Q4"
    label_title = clean_ws(re.split(r"\s+[-–]\s+Diary Disclosure", label_title, maxsplit=1, flags=re.I)[0]) or None
    title = label_title or pdf_title
    portfolio = pdf_title if (pdf_title and label_title and pdf_title.lower() not in label_title.lower()) else None
    ps = pe = None
    m = _NSW_PERIOD_RX.search(first_text)
    if m:
        pe = _nsw_date(m.group(3))
        first = m.group(1) + (m.group(2) or (" " + m.group(4) if len(m.group(4)) == 4 else ""))
        ps = _nsw_date(first)
    fname = unquote(urlsplit(link["url"]).path.rsplit("/", 1)[-1]).lower()
    label = None
    if pe:
        q = (int(pe[5:7]) - 1) // 3 + 1
        label = f"Q{q} {pe[:4]}"
    else:
        fm = _NSW_FILE_Q_RX.search(fname)
        fr = _NSW_FILE_RANGE_RX.search(fname)
        if fm:
            q, y = (fm.group(1), fm.group(2)) if fm.group(1) else (fm.group(4), fm.group(3))
            label = f"Q{q} {y}"
        elif fr:
            end_month = next(i for i, mn in enumerate(MONTHS, 1) if mn.startswith(fr.group(3)[:3].lower()))
            label = f"Q{(end_month - 1) // 3 + 1} {fr.group(4)}"
        elif link.get("heading") and re.fullmatch(r"(?:Q[1-4] )?20\d{2}", link["heading"]):
            label = link["heading"]
    # minister-catley-diary-..., Minister-Jackson-q3-2023-..., "Minister Saffin_Diary ...",
    # "Minister Jackson - Diary Disclosure ..." -- but never "Minister for Planning ..."
    _stop = r"(?!acting\b|diary\b|disclosure\b|office\b|q[1-4]\b|20\d\d\b|for\b|of\b|the\b)"
    sm = re.match(r"minister[ -]" + _stop + r"([a-z]+(?:[ -]" + _stop + r"[a-z]+)?)[ _–-]+(?:acting|diary|disclosure|office|q[1-4]|20\d\d)", fname)
    surname = None
    if sm:
        surname = " ".join(p.capitalize() for p in re.split(r"[ -]", sm.group(1)))
    return {"minister_name": surname, "minister_title": title, "portfolio": portfolio,
            "period_start": ps, "period_end": pe, "period_label": label}


def run_nsw(session, years: list[int] | None, limit_pdfs: int, dry_run: bool) -> tuple[list[list], list[str]]:
    pages = nsw_year_pages(session)
    log(f"  NSW year pages: {sorted(pages)}")
    rows, urls, n_pdf = [], [], 0
    for year in sorted(pages, reverse=True):
        if years and year not in years:
            continue
        links = nsw_pdf_links(session, pages[year])
        log(f"  {year}: {len(links)} diary PDFs")
        for link in links:
            if limit_pdfs and n_pdf >= limit_pdfs:
                break
            if link["url"] in urls:
                continue
            pdf = cached_bytes(session, link["url"], _cache_path("nsw", link["url"]))
            if not pdf:
                log(f"    404 {link['url']}"); continue
            try:
                meetings, first = parse_diary_tables(pdf, DATE_CELL_NSW, NSW_DATE_FORMATS)
            except Exception as e:  # noqa: BLE001 - one bad PDF must not stop the run
                log(f"    PARSE FAIL {link['url']}: {e}"); continue
            hdr = nsw_header(first, link)
            n_pdf += 1
            urls.append(link["url"])
            year = (hdr["period_end"] or hdr["period_start"] or "")[:4]
            for m in meetings:
                if not m["meeting_date"] and year and re.fullmatch(r"\d{1,2}\s+[A-Za-z]+", m["meeting_date_raw"]):
                    m["meeting_date"] = parse_date(f"{m['meeting_date_raw']} {year}", ["d_month_y", "d_mon_y"])
                rows.append(_meeting_row("nsw", "nsw_diary", hdr, "current", m, link["url"]))
            log(f"    {hdr['period_label']}: {hdr['minister_title']!s:60.60} {len(meetings):4d} meetings")
    return rows, urls


# ── QLD ──────────────────────────────────────────────────────────────────────

QLD_BASE = "https://cabinet.qld.gov.au"
QLD_MINISTERS = f"{QLD_BASE}/ministers-portfolios.aspx"


def qld_minister_pages(session, period: str) -> list[dict]:
    from bs4 import BeautifulSoup
    if period == "current":
        idx_urls = [QLD_MINISTERS]
        rx = re.compile(r"^/ministers-portfolios/([a-z][a-z0-9-]+)\.aspx$")
    else:
        idx_urls = [f"{QLD_BASE}/ministers-portfolios/cabinet-{period}.aspx",
                    f"{QLD_BASE}/ministers-portfolios/cabinet-{period}/former-ministers.aspx"]
        rx = re.compile(r"^/ministers-portfolios/(cabinet-\d{4}-\d{4}/[a-z][a-z0-9-]+)\.aspx$")
    out, seen = [], set()
    for idx in idx_urls:
        try:
            r = polite_get(session, idx)
        except Exception as e:  # noqa: BLE001
            log(f"  index {idx}: {e}"); continue
        soup = BeautifulSoup(r.text, "lxml")
        for a in soup.select("a[href]"):
            href = a["href"].split("?")[0]
            if href.startswith("http"):
                href = href.replace(QLD_BASE, "")
            m = rx.match(href)
            if not m or m.group(1).startswith("cabinet-20") and "/" not in m.group(1) or m.group(1).endswith("former-ministers"):
                continue
            if m.group(1) in seen:
                continue
            seen.add(m.group(1))
            out.append({"slug": m.group(1).split("/")[-1], "url": QLD_BASE + href, "label": clean_ws(a.get_text(" "))})
    return out


def qld_diary_links(session, minister_url: str) -> list[dict]:
    from bs4 import BeautifulSoup
    r = polite_get(session, minister_url)
    soup = BeautifulSoup(r.text, "lxml")
    h1 = soup.find("h1")
    name = clean_ws(h1.get_text(" ")) if h1 else None
    links, seen = [], set()
    for a in soup.select("a[href]"):
        href = a["href"]
        if "diary" not in href.lower() or ".pdf" not in href.lower():
            continue
        url = urljoin(minister_url, href).split("?")[0]
        if url in seen:
            continue
        seen.add(url)
        ym = re.search(r"/(\d{4})/(" + "|".join(MONTHS) + r")/", url, re.I)
        links.append({"url": url, "year": int(ym.group(1)) if ym else None,
                      "month": ym.group(2).lower() if ym else None, "label": clean_ws(a.get_text(" "))})
    return links, name


# "1 March 2026 – 31 March 2026"; some diaries drop the first year ("1 December – 31 December 2024")
# or both years ("1 December – 31 December", year then comes from the URL)
_QLD_PERIOD_RX = re.compile(r"(\d{1,2}\s+[A-Za-z]+)(\s+\d{4})?\s*[–-]\s*(\d{1,2}\s+[A-Za-z]+)(\s+\d{4})?(?!\s*[–-])")


# "Ministerial Diary1", "Assistant Minister Diary1", "Assistant Ministerial Diary1", footnote digits, OFFICIAL
_QLD_SKIP = re.compile(r"^(?:\d+\s*)?(?:assistant\s+)?minist(?:er|erial)\s+diary\d*$|^\d+$|^official$", re.I)
_QLD_NAME_HON = re.compile(r"^(?:\d+\s+)?(?:the\s+)?hon(?:ourable)?\.?\s+(.+?)\s+(?:MP|MLA)\s*$", re.I)
_QLD_NAME_BARE = re.compile(r"^([A-Z][A-Za-z'’().\- ]{2,50}?)\s+(?:MP|MLA)\s*$")
_QLD_TABLE_START = re.compile(r"^(?:date\b|\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{1,2}\s+[A-Za-z]+\s*[–-])", re.I)


def qld_header(first_text: str, page_name: str | None, link: dict) -> dict:
    """Minister, portfolio and period from the diary's title block. The block
    ends where the meeting table starts ('Date ...' or a dated row), so a
    meeting line naming another minister ('1 May 2025 The Hon X MP - ...')
    can no longer be mistaken for the diary owner."""
    lines = [clean_ws(x) for x in first_text.splitlines() if clean_ws(x)]
    minister = None
    portfolio_lines = []
    for ln in lines[:12]:
        # footnote marker printed as a leading digit ("1 Attorney-General"), but
        # never the day of a period line ("1 March 2026 – 31 March 2026")
        ln = re.sub(r"^\d\s+(?!" + _MONTH_RX + r"\b)(?=[A-Z])", "", ln, flags=re.I)
        if _QLD_TABLE_START.match(ln):
            break
        if _QLD_SKIP.match(ln):
            continue
        m = _QLD_NAME_HON.match(ln) or _QLD_NAME_BARE.match(ln)
        if m and not minister:
            minister = clean_ws(m.group(1))
            continue
        portfolio_lines.append(ln)
    # "Ms Janelle Poole APM", "David Crisafulli MP" (also the minister page's own
    # heading, used when the PDF has no name line) -> bare name; nicknames in
    # brackets ("Samuel (Sam) O'Connor") are kept as published
    minister = minister or page_name
    if minister:
        minister = re.sub(r"^(?:The\s+)?(?:Hon\.?|Honourable)\s+", "", minister)
        minister = re.sub(r"^(?:Ms|Mr|Mrs|Miss|Dr)\.?\s+", "", minister)
        minister = re.sub(r"(?:\s+(?:MP|MLA|APM|OAM|AM))+$", "", minister).strip() or None
    portfolio = clean_ws(" ".join(portfolio_lines)) or None
    if portfolio and len(portfolio) > 400:
        portfolio = portfolio[:400]
    ps = pe = None
    m = _QLD_PERIOD_RX.search(first_text)
    if m:
        y2 = m.group(4) or (f" {link['year']}" if link.get("year") else None)
        if y2:
            ps = parse_date(m.group(1) + (m.group(2) or y2), ["d_month_y", "d_mon_y"])
            pe = parse_date(m.group(3) + y2, ["d_month_y", "d_mon_y"])
    # the period printed in the PDF beats the URL path: at least one current
    # minister's diary is filed under a mistyped /2013/february/ path
    label = datetime.strptime(pe, "%Y-%m-%d").strftime("%B %Y") if pe else None
    if not label and link.get("month") and link.get("year"):
        label = f"{link['month'].capitalize()} {link['year']}"
    title = None
    if portfolio:
        title = portfolio.split(",")[0].split(" and ")[0].strip()
    return {"minister_name": minister, "minister_title": title, "portfolio": portfolio,
            "period_start": ps, "period_end": pe, "period_label": label}


def run_qld(session, period: str, ministers: list[str] | None, limit_pdfs: int, dry_run: bool) -> tuple[list[list], list[str]]:
    pages = qld_minister_pages(session, period)
    if ministers:
        pages = [p for p in pages if p["slug"] in ministers]
    log(f"  QLD {period}: {len(pages)} minister pages")
    rows, urls, n_pdf = [], [], 0
    for mp in pages:
        if limit_pdfs and n_pdf >= limit_pdfs:
            break
        try:
            links, page_name = qld_diary_links(session, mp["url"])
        except Exception as e:  # noqa: BLE001
            log(f"    {mp['slug']}: {e}"); continue
        log(f"    {mp['slug']}: {len(links)} diary PDFs")
        for link in links:
            if limit_pdfs and n_pdf >= limit_pdfs:
                break
            if link["url"] in urls:  # the same PDF can be linked from two minister pages
                continue
            pdf = cached_bytes(session, link["url"], _cache_path("qld", link["url"]))
            if not pdf:
                log(f"      404 {link['url']}"); continue
            try:
                meetings, first = parse_diary_tables(pdf, DATE_CELL_QLD, ["d_month_y", "d_mon_y"])
            except Exception as e:  # noqa: BLE001
                log(f"      PARSE FAIL {link['url']}: {e}"); continue
            hdr = qld_header(first, page_name or mp["label"], link)
            n_pdf += 1
            urls.append(link["url"])
            for m in meetings:
                rows.append(_meeting_row("qld", "qld_diary", hdr, period, m, link["url"]))
            log(f"      {hdr['period_label']!s:16} {len(meetings):4d} meetings")
    return rows, urls


def main() -> None:
    ap = argparse.ArgumentParser(description="Ministerial diary disclosures -> ext_ministerial_meetings")
    ap.add_argument("--jurisdiction", choices=["nsw", "qld"], required=True)
    ap.add_argument("--years", type=int, nargs="*", help="NSW: index years to pull (default all)")
    ap.add_argument("--period", default="current", help="QLD: 'current' or a former government e.g. 2020-2024")
    ap.add_argument("--minister", action="append", help="QLD: restrict to these slugs")
    ap.add_argument("--limit-pdfs", type=int, default=0, help="stop after N PDFs (sampling)")
    add_writer_args(ap)
    args = ap.parse_args()
    session = make_session()
    writer = writer_from_args(args)
    log(f"ext_ministerial_meetings <- {args.jurisdiction} ; writer={writer.describe()}")
    if args.jurisdiction == "nsw":
        rows, urls = run_nsw(session, args.years, args.limit_pdfs, args.dry_run)
        source = "nsw_diary"
    else:
        rows, urls = run_qld(session, args.period, args.minister, args.limit_pdfs, args.dry_run)
        source = "qld_diary"
    log(f"\n{len(urls)} PDFs -> {len(rows):,} meetings; "
        f"{sum(1 for r in rows if r[COLUMNS.index('meeting_date')])} with a parsed date")
    if not urls:
        return
    placeholders = ",".join("?" for _ in urls)
    res = writer.replace("ext_ministerial_meetings", DDL, COLUMNS, rows, source=source,
                         delete_where=f"source = ? AND source_url IN ({placeholders})",
                         delete_params=[source] + urls,
                         notes=f"{len(urls)} PDFs; years={args.years} period={args.period}")
    log("Summary: " + json.dumps(res, default=str))


if __name__ == "__main__":
    main()
