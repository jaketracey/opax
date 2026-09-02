"""
parli.ingest.words_parlinfo -- ParlInfo (parlinfo.aph.gov.au) document indexes.

Datasets and what we can actually get from each (verified 2026-09-02):
  pressrel   Press releases / transcripts / speeches: 663,680 records back to
             1889. Search results carry date, title, office (Source), author,
             an OCR excerpt; display pages add party / in-government flags.
             FULL TEXT IS PDF-ONLY under /parlInfo/download/ -> metadata only.
  billhome   Bill homepages: 6,469 records; the listing excerpt is the
             Parliamentary Library's neutral one-paragraph bill summary. The
             display page links every text version of the bill and its EM(s);
             `bill-sections` walks those links.
  bills      Bill TEXT: 72,339 records, one per section/schedule of each
             version (legislation/bills/r7513_aspassed/0001; stages first-reps,
             first-senate, third-reps, third-senate, aspassed; plus
             billshistorical/* back to 1901). Rendered INLINE as HTML.
  billsdgs   Bills Digests: 7,985. The display page carries the digest's OCR
             text inline (≈20K chars for a 9-page digest) -> full text.
  ems        Explanatory memoranda: 12,354. The display page embeds the Word
             export as HTML (WordSection divs) -> full text.
  reportsen / reportrep / reportjnt  (7,600 / 1,529 / 5,301 records)
             Committee reports as one record PER CHAPTER (…/024095/0004); the
             display page renders the chapter HTML inline -> full text.

Also here, because it joins Acts to bills: `frl-acts` pulls every Act title
from the Federal Register of Legislation OData API (api.prod.legislation.gov.au,
honest UA, no WAF) into ext_frl_acts; each carries `originatingBillUri`, i.e.
the ParlInfo billhome code -> bills ↔ Acts ↔ legal_documents join.

ACCESS CAVEAT — READ BEFORE RUNNING. parlinfo.aph.gov.au (and www.aph.gov.au)
sit behind an Azure WAF that answers 403 to any non-browser User-Agent,
including the honest "OPAX research (opax.com.au)". robots.txt is permissive
(Allow: /; Disallow: /parlInfo/download/ and /parlInfo/genpdf/) and the site
licence is CC BY-NC-ND 4.0, so reading summary/display pages is within the
stated rules — but only a browser UA gets past the WAF. This module refuses to
run without --browser-ua so that sending a browser UA is the operator's
explicit decision (the existing committee_hearings ingester already does the
same). It NEVER requests anything under /parlInfo/download/.

Writes ONLY ext_parlinfo_docs (PK parlinfo_id) and ext_frl_acts (PK act_id).
Never pushes to the KB.

Usage:
  python3 -m parli.ingest.words_parlinfo --browser-ua listing --dataset pressrel --pages 3
  python3 -m parli.ingest.words_parlinfo --browser-ua listing --dataset billhome --pages 3
  python3 -m parli.ingest.words_parlinfo --browser-ua listing --dataset reportsen --pages 2
  python3 -m parli.ingest.words_parlinfo --browser-ua display --dataset reportsen --limit 40
  python3 -m parli.ingest.words_parlinfo --browser-ua display --dataset ems --limit 20
  python3 -m parli.ingest.words_parlinfo --browser-ua display --dataset billsdgs --limit 20
  python3 -m parli.ingest.words_parlinfo --browser-ua bill-sections --limit 10   # text of 10 bills
  python3 -m parli.ingest.words_parlinfo frl-acts                               # all 13.7K Acts, honest UA
  python3 -m parli.ingest.words_parlinfo link-bills
  python3 -m parli.ingest.words_parlinfo stats
  python3 -m parli.ingest.words_parlinfo map --limit 3 [--dataset bills]
"""

import argparse
import json
import re
import sys
from html import unescape
from typing import Optional

from parli.ingest.speaker_names import normalize_speaker
from parli.ingest.words_common import (
    BROWSER_UA, DB_PATH, PoliteSession, connect_db, decade_of, ensure_table,
    html_to_text, log, now_iso, parse_date, upsert, warn, write_txn,
)

TABLE = "ext_parlinfo_docs"
ACTS_TABLE = "ext_frl_acts"
ACTS_DDL = f"""
CREATE TABLE IF NOT EXISTS {ACTS_TABLE} (
    act_id        TEXT PRIMARY KEY,   -- FRL title id, e.g. C2025A00047
    name          TEXT,
    making_date   TEXT,               -- YYYY-MM-DD (assent)
    year          INTEGER,
    number        INTEGER,
    is_principal  INTEGER,
    is_in_force   INTEGER,
    status        TEXT,
    bill_uri      TEXT,               -- originatingBillUri (ParlInfo billhome display URL)
    bill_code     TEXT,               -- r7354 / s1511 parsed from bill_uri
    fetched_at    TEXT
)"""
ACTS_INDEXES = [f"CREATE INDEX IF NOT EXISTS {ACTS_TABLE}_bill_code ON {ACTS_TABLE}(bill_code)"]
FRL_TITLES = "https://api.prod.legislation.gov.au/v1/titles"
DDL = f"""
CREATE TABLE IF NOT EXISTS {TABLE} (
    parlinfo_id   TEXT PRIMARY KEY,   -- e.g. media/pressrel/6069387
    dataset       TEXT NOT NULL,      -- pressrel | billhome | billsdgs | ems | reportsen | reportrep | reportjnt
    kind          TEXT NOT NULL,      -- KB kind label
    title         TEXT,
    date          TEXT,               -- YYYY-MM-DD
    category      TEXT,               -- ParlInfo [category] shown in results
    source        TEXT,               -- office / chamber / 'Bills Digest Service'
    author_raw    TEXT,               -- 'DUTTON, Peter, (former Member)'
    author        TEXT,               -- normalize_speaker() form
    party         TEXT,
    in_government INTEGER,
    excerpt       TEXT,               -- listing excerpt (bill summary for billhome)
    body_text     TEXT,               -- inline HTML text where ParlInfo renders it
    body_fetched  INTEGER DEFAULT 0,  -- display page visited
    pdf_url       TEXT,               -- robots-disallowed; recorded, never fetched
    display_url   TEXT,
    bill_code     TEXT,               -- r7509 / s112 — joins billhome <-> ems <-> bills text
    bill_id       INTEGER,            -- parli.db bills.bill_id via title match
    meta_json     TEXT,
    fetched_at    TEXT
)"""
INDEXES = [
    f"CREATE INDEX IF NOT EXISTS {TABLE}_dataset ON {TABLE}(dataset)",
    f"CREATE INDEX IF NOT EXISTS {TABLE}_date ON {TABLE}(date)",
    f"CREATE INDEX IF NOT EXISTS {TABLE}_bill_code ON {TABLE}(bill_code)",
]

BASE = "https://parlinfo.aph.gov.au"
LISTING = (BASE + "/parlInfo/search/summary/summary.w3p;adv=yes;orderBy={order};"
           "page={page};query=Dataset%3A{dataset};resCount=100")
DISPLAY = BASE + "/parlInfo/search/display/display.w3p;query=Id:%22{id}%22"
ORDER = {"newest": "date-eFirst", "oldest": "date-eLast"}  # verified 2026-09-02

DATASETS = {
    "pressrel": {"kind": "press_release"},
    "billhome": {"kind": "bill"},
    "bills": {"kind": "bill_text"},
    "billsdgs": {"kind": "bills_digest"},
    "ems": {"kind": "explanatory_memorandum"},
    "reportsen": {"kind": "committee_report", "chamber": "senate"},
    "reportrep": {"kind": "committee_report", "chamber": "house"},
    "reportjnt": {"kind": "committee_report", "chamber": "joint"},
}

# ParlInfo party codes -> the KB's canonical 15-value vocabulary (arag_sync).
PARTY_CODES = {
    "LPA": "Liberal", "LP": "Liberal", "LIB": "Liberal", "ALP": "Labor", "NP": "Nationals",
    "NPA": "Nationals", "NATS": "Nationals", "CP": "Nationals", "AG": "Greens",
    "GRN": "Greens", "GWA": "Greens", "IND": "Independent", "CLP": "Country Liberal Party",
    "KAP": "Katter's Australian Party", "LNP": "LNP", "PHON": "One Nation",
    "NXT": "Centre Alliance", "CA": "Centre Alliance", "UAP": "United Australia Party",
    "PUP": "United Australia Party", "AD": "Australian Democrats", "DEM": "Australian Democrats",
    "DLP": "DLP", "FF": "Family First", "JLN": "JLN",
}
try:
    from parli.ingest.arag_sync import clean_party as _clean_party
except Exception:  # pragma: no cover
    _clean_party = lambda raw: None  # noqa: E731


def party_label(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    code = raw.strip().upper()
    return PARTY_CODES.get(code) or _clean_party(raw)


def normalize_author(raw: Optional[str]) -> Optional[str]:
    """'DUTTON, Peter, (former Member)' -> 'Peter Dutton'; organisations pass
    through normalize_speaker unchanged-ish, so callers should treat a
    multi-word ALL-CAPS office string as non-person."""
    if not raw:
        return None
    s = re.sub(r"\([^)]*\)", "", raw).strip(" ,")
    if not s:
        return None
    return normalize_speaker(s)


def bill_code_of(parlinfo_id: str) -> Optional[str]:
    m = re.search(r"/(?:billhome|bills|ems)/([rs]\d+)(?:_|$)", parlinfo_id)
    return m.group(1) if m else None


def bill_code_from_uri(uri: Optional[str]) -> Optional[str]:
    """FRL originatingBillUri -> 'r7354' (the id inside is URL-encoded)."""
    if not uri:
        return None
    m = re.search(r"billhome(?:%2F|/)([rs]\d+)", uri, re.I)
    return m.group(1).lower() if m else None


def fix_mojibake(text: Optional[str]) -> Optional[str]:
    """ParlInfo's OCR layer serves UTF-8 bytes decoded as Latin-1 ('â\\x80¢'
    for '•'). Re-encode per line and decode as UTF-8 where that round-trips;
    lines that are already clean are left alone."""
    if not text or not re.search(r"â[\x80-\xbf€™“”•–—]|Ã[\x80-\xbf]|Â[\xa0-\xbf]", text):
        return text
    out = []
    for line in text.split("\n"):
        fixed = line
        if re.search(r"â|Ã|Â", line):
            for enc in ("latin-1", "cp1252"):
                try:
                    fixed = line.encode(enc).decode("utf-8")
                    break
                except UnicodeError:
                    continue
        out.append(fixed)
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

_TOTAL_RE = re.compile(r"Summary results:\s*</span>\s*[\d,]+-[\d,]+\s+of\s+([\d,]+)")
_CHECK_RE = re.compile(r'value="([^"]+)"\s+id="result_\d+"')
_TITLE_RE = re.compile(r'<div class="sumLink"><a [^>]*>(.*?)</a>', re.S)
_CAT_RE = re.compile(r'<span class="cat">\[(.*?)\]</span>')
_DESC_RE = re.compile(r'<div class="sumDesc">(.*?)</div>', re.S)
_META_RE = re.compile(r'<div class="sumMeta">(.*?)</div>', re.S)
_PDF_RE = re.compile(r'href="(/parlInfo/download/[^"]+)"')
_SPAN_TITLE_RE = re.compile(r'<span title="([^"]*)">.*?</span>', re.S)
_DT_DD_RE = re.compile(r"<dt[^>]*>(.*?)</dt>\s*<dd[^>]*>(.*?)</dd>", re.S)
_FOOTER = r'<div class="line" id="footer">|<div id="footer"|<div id="documentNavLeft"'
_CONTENT_RE = re.compile(r'<div id="documentContent"[^>]*>(.*?)(?=' + _FOOTER + r'|$)', re.S)
# EMs / digests / bill sections have no #documentContent: the document HTML
# (Word export or OCR layer) follows the last download icon, up to the footer.
_AFTER_DOWNLOADS_RE = re.compile(r'Download (?:PDF|Word|HTML)</a>(.*?)(?=' + _FOOTER + r'|$)', re.S)
_PAGE_TITLE_RE = re.compile(r"<title>\s*(?:ParlInfo\s*-\s*)?(.*?)</title>", re.S)
_SCRIPT_RE = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.S)
_BOILERPLATE_LINES = re.compile(
    r"^(?:Permalink|Prev|Next|Return to results list.*|Content Window|"
    r"Your browser does not support JavaScript.*|Note: Where available, the PDF/Word icon.*|"
    r"Download (?:PDF|Word|HTML))$", re.M)
# Bill-home display page: every text version and EM is linked as a download.
_BILL_VERSION_RE = re.compile(r"/parlInfo/download/legislation/bills/([rs]\d+_[a-z0-9-]+)/")
_EM_LINK_RE = re.compile(r"/parlInfo/download/legislation/ems/([rs]\d+_ems_[0-9a-f-]+)/")


def _clean_body(fragment: str) -> Optional[str]:
    # Word exports break lines mid-paragraph (&#10;); only block tags should.
    fragment = _SCRIPT_RE.sub(" ", fragment).replace("&#10;", " ").replace("\n", " ")
    text = html_to_text(fragment)
    text = _BOILERPLATE_LINES.sub("", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    text = fix_mojibake(text)
    return text if text and len(text) >= 40 else None


def page_text(resp) -> str:
    """ParlInfo sends no charset header, so requests would decode the UTF-8
    body as ISO-8859-1 and double-mangle every non-ASCII character."""
    return resp.content.decode("utf-8", errors="replace")


def page_title(page_html: str) -> Optional[str]:
    """Full title from <title>; the metadata <dd> truncates titles at 80 chars."""
    m = _PAGE_TITLE_RE.search(page_html)
    if not m:
        return None
    return re.sub(r"\s+", " ", html_to_text(fix_mojibake(m.group(1)))).strip() or None


def parse_listing(page_html: str) -> tuple[Optional[int], list[dict]]:
    m = _TOTAL_RE.search(page_html)
    total = int(m.group(1).replace(",", "")) if m else None
    items = []
    for chunk in re.split(r'<li class="result[^"]*">', page_html)[1:]:
        chunk = chunk.split("</li>", 1)[0]
        idm = _CHECK_RE.search(chunk)
        if not idm:
            continue
        meta_html = (_META_RE.search(chunk) or [None, ""])[1] if _META_RE.search(chunk) else ""
        meta_txt = unescape(re.sub(r"<[^>]+>", "", _SPAN_TITLE_RE.sub(r"\1", meta_html)))
        meta: dict[str, str] = {}
        for part in re.split(r"\s+-\s+", meta_txt.replace("\xa0", " ")):
            if ":" in part:
                k, v = part.split(":", 1)
                meta[k.strip()] = v.strip()
        title_m = _TITLE_RE.search(chunk)
        desc_m = _DESC_RE.search(chunk)
        pdf_m = _PDF_RE.search(chunk)
        cat_m = _CAT_RE.search(chunk)
        items.append({
            "id": idm.group(1),
            "title": html_to_text(title_m.group(1)) if title_m else None,
            "category": cat_m.group(1) if cat_m else None,
            "excerpt": html_to_text(desc_m.group(1)) if desc_m else None,
            "date": parse_date(meta.get("Date", "")[:10]),
            "source": meta.get("Source") or None,
            "author_raw": meta.get("Author") or None,
            "pdf_url": (BASE + pdf_m.group(1).split(";")[0]) if pdf_m else None,
            "meta": meta,
        })
    return total, items


def parse_display(page_html: str) -> tuple[dict, Optional[str]]:
    """-> (metadata fields, inline body text or None).

    Committee-report chapters and bill sections render inside
    #documentContent; EMs and Bills Digests render the whole document after
    the download icons. Pages that only offer a PDF (press releases) yield
    None once the boilerplate is stripped."""
    fields = {}
    for k, v in _DT_DD_RE.findall(page_html):
        k = html_to_text(k).rstrip(":")
        v = html_to_text(v)
        if v:
            fields[k] = v
    body = None
    m = _CONTENT_RE.search(page_html)
    if m:
        body = _clean_body(m.group(1))
    if not body:
        m = _AFTER_DOWNLOADS_RE.search(page_html)
        if m:
            body = _clean_body(m.group(1))
    return fields, body


def parse_billhome(page_html: str) -> tuple[list[str], list[str]]:
    """-> (bill text version ids like 'r7451_first-reps', EM ids), in page order."""
    versions = list(dict.fromkeys(_BILL_VERSION_RE.findall(page_html)))
    ems = list(dict.fromkeys(_EM_LINK_RE.findall(page_html)))
    return versions, ems


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def require_browser_ua(args) -> PoliteSession:
    if not args.browser_ua:
        sys.exit(
            "parlinfo.aph.gov.au's WAF rejects the honest OPAX User-Agent (HTTP 403). "
            "Re-run with --browser-ua to send a Firefox UA instead — this is an explicit "
            "operator decision; see the module docstring and docs/DATA-WORDS.md."
        )
    return PoliteSession(min_interval=1.0 / args.rps, ua=BROWSER_UA, timeout=60)


def listing_row(ds: str, item: dict) -> dict:
    spec = DATASETS[ds]
    author = normalize_author(item["author_raw"]) if ds == "pressrel" else None
    return {
        "parlinfo_id": item["id"], "dataset": ds, "kind": spec["kind"],
        "title": item["title"], "date": item["date"], "category": item["category"],
        "source": item["source"], "author_raw": item["author_raw"], "author": author,
        "party": None, "in_government": None, "excerpt": item["excerpt"],
        "body_text": None, "body_fetched": 0, "pdf_url": item["pdf_url"],
        "display_url": DISPLAY.format(id=item["id"]),
        "bill_code": bill_code_of(item["id"]), "bill_id": None,
        "meta_json": json.dumps(item["meta"], ensure_ascii=False), "fetched_at": now_iso(),
    }


def run_listing(args) -> None:
    session = require_browser_ua(args)
    db = connect_db(args.db)
    ensure_table(db, TABLE, DDL, INDEXES)
    ds = args.dataset
    stored = 0
    total = None
    for page in range(args.start_page, args.start_page + args.pages):
        resp = session.get(LISTING.format(order=ORDER[args.order], page=page, dataset=ds))
        if resp.status_code != 200:
            warn(f"  page {page}: HTTP {resp.status_code} ({len(resp.content)} bytes) — stopping")
            break
        total, items = parse_listing(page_text(resp))
        if not items:
            warn(f"  page {page}: no result items parsed — stopping")
            break
        rows = [listing_row(ds, it) for it in items]
        # Keep already-fetched bodies/party/metadata when a listing row is
        # re-seen (bill-sections stores version/stage/section in meta_json).
        known = {r[0]: r for r in db.execute(
            f"SELECT parlinfo_id, body_text, body_fetched, party, in_government, author, bill_id, "
            f"meta_json, title FROM {TABLE} WHERE parlinfo_id IN ({','.join('?' * len(rows))})",
            [r["parlinfo_id"] for r in rows])}
        for r in rows:
            k = known.get(r["parlinfo_id"])
            if k:
                r["body_text"], r["body_fetched"], r["party"], r["in_government"] = k[1], k[2], k[3], k[4]
                r["author"], r["bill_id"] = k[5] or r["author"], k[6]
                old_meta = json.loads(k[7]) if k[7] else {}
                r["meta_json"] = json.dumps({**json.loads(r["meta_json"]), **old_meta}, ensure_ascii=False)
                r["title"] = k[8] or r["title"]
        stored += upsert(db, TABLE, rows)
        log(f"  [{ds}] page {page}: {len(items)} items (dataset total {total:,}); stored {stored:,}"
            if total else f"  [{ds}] page {page}: {len(items)} items; stored {stored:,}")
    log(f"[listing {ds}] done: {stored:,} rows, {session.requests_made} requests")


def run_display(args) -> None:
    session = require_browser_ua(args)
    db = connect_db(args.db)
    ensure_table(db, TABLE, DDL, INDEXES)
    rows = db.execute(
        f"SELECT parlinfo_id FROM {TABLE} WHERE dataset=? AND body_fetched=0 "
        f"ORDER BY date DESC LIMIT ?", (args.dataset, args.limit)).fetchall()
    log(f"[display {args.dataset}] {len(rows)} pages to fetch")
    with_body = 0
    for n, (pid,) in enumerate(rows, 1):
        resp = session.get(DISPLAY.format(id=pid))
        if resp.status_code != 200:
            warn(f"  {pid}: HTTP {resp.status_code}")
            continue
        fields, body = parse_display(page_text(resp))
        if args.dataset == "billhome":
            body = None  # the bill-home body is a progress table; the summary is the excerpt
        if body:
            with_body += 1
        party = party_label(fields.get("Party"))
        in_gov = {"yes": 1, "no": 0}.get((fields.get("In Government") or "").lower())
        author = normalize_author(fields.get("Author")) if args.dataset == "pressrel" else None
        existing = db.execute(f"SELECT meta_json FROM {TABLE} WHERE parlinfo_id=?", (pid,)).fetchone()
        meta = json.loads(existing[0]) if existing and existing[0] else {}
        meta.update({k: v for k, v in fields.items() if k not in ("Title", "System Id")})
        title = page_title(page_text(resp))
        write_txn(db, [(
            f"UPDATE {TABLE} SET body_text=?, body_fetched=1, party=COALESCE(?, party), "
            f"in_government=COALESCE(?, in_government), author=COALESCE(?, author), "
            f"source=COALESCE(?, source), title=COALESCE(title, ?), date=COALESCE(date, ?), "
            f"meta_json=?, fetched_at=? WHERE parlinfo_id=?",
            (body, party, in_gov, author, fields.get("Source"), title, parse_date(fields.get("Date")),
             json.dumps(meta, ensure_ascii=False), now_iso(), pid))])
        if n % 10 == 0:
            log(f"  {n}/{len(rows)} fetched, {with_body} with inline body")
    log(f"[display {args.dataset}] done: {len(rows)} pages, {with_body} with inline HTML body, "
        f"{session.requests_made} requests")


def _stub_row(pid: str, ds: str, title: Optional[str], bill_code: Optional[str], meta: dict) -> dict:
    return {
        "parlinfo_id": pid, "dataset": ds, "kind": DATASETS[ds]["kind"], "title": title, "date": None,
        "category": None, "source": None, "author_raw": None, "author": None, "party": None,
        "in_government": None, "excerpt": None, "body_text": None, "body_fetched": 0,
        "pdf_url": None, "display_url": DISPLAY.format(id=pid), "bill_code": bill_code,
        "bill_id": None, "meta_json": json.dumps(meta, ensure_ascii=False), "fetched_at": now_iso(),
    }


def run_bill_sections(args) -> None:
    """Bill TEXT. For each bill-home row: read its display page, follow every
    text version (r7451_first-reps, r7451_aspassed, ...) and walk the section
    pages /0000, /0001, ... until ParlInfo 301s to the summary (no such
    section). EM ids found on the bill-home page are stubbed into the ems
    dataset so `display --dataset ems` picks up their body later."""
    session = require_browser_ua(args)
    db = connect_db(args.db)
    ensure_table(db, TABLE, DDL, INDEXES)
    if args.codes:
        codes = [c.strip() for c in args.codes.split(",") if c.strip()]
        titles = dict(db.execute(
            f"SELECT bill_code, title FROM {TABLE} WHERE dataset='billhome' AND bill_code IN "
            f"({','.join('?' * len(codes))})", codes))
    else:
        rows = db.execute(
            f"SELECT bill_code, title FROM {TABLE} h WHERE dataset='billhome' AND bill_code IS NOT NULL "
            f"AND NOT EXISTS (SELECT 1 FROM {TABLE} t WHERE t.dataset='bills' AND t.bill_code=h.bill_code) "
            f"ORDER BY date DESC LIMIT ?", (args.limit,)).fetchall()
        codes = [r[0] for r in rows]
        titles = {r[0]: r[1] for r in rows}
    log(f"[bill-sections] {len(codes)} bills to walk")
    known_fetched = {r[0] for r in db.execute(f"SELECT parlinfo_id FROM {TABLE} WHERE body_fetched=1")}
    known_ids = {r[0] for r in db.execute(f"SELECT parlinfo_id FROM {TABLE}")}
    sections = versions_seen = ems_stubbed = 0
    for code in codes:
        resp = session.get(DISPLAY.format(id=f"legislation/billhome/{code}"))
        if resp.status_code != 200:
            warn(f"  {code}: billhome HTTP {resp.status_code}")
            continue
        home_html = page_text(resp)
        versions, ems = parse_billhome(home_html)
        bill_title = titles.get(code) or page_title(home_html)
        stubs = []
        for em in ems:
            pid = f"legislation/ems/{em}"
            if pid not in known_ids:
                stubs.append(_stub_row(pid, "ems", bill_title, code, {"from": f"billhome/{code}"}))
                known_ids.add(pid)
                ems_stubbed += 1
        upsert(db, TABLE, stubs)
        for ver in versions:
            versions_seen += 1
            stage = ver.split("_", 1)[1]
            for n in range(args.max_sections):
                pid = f"legislation/bills/{ver}/{n:04d}"
                if pid in known_fetched:
                    continue
                r = session.get(DISPLAY.format(id=pid), allow_redirects=False)
                if r.status_code != 200:
                    break  # 301 -> summary page: no such section
                section_html = page_text(r)
                fields, body = parse_display(section_html)
                meta = {k: v for k, v in fields.items() if k not in ("Title", "System Id")}
                meta.update({"version": ver, "stage": stage, "section": n, "bill_title": bill_title})
                row = _stub_row(pid, "bills", page_title(section_html) or fields.get("Title"), code, meta)
                row.update({"date": parse_date(fields.get("Date")), "source": fields.get("Source"),
                            "body_text": body, "body_fetched": 1})
                upsert(db, TABLE, [row])
                known_fetched.add(pid)
                sections += 1
        log(f"  {code}: {len(versions)} versions {versions}, {len(ems)} EMs; sections so far {sections}")
    log(f"[bill-sections] done: {len(codes)} bills, {versions_seen} versions, {sections} sections, "
        f"{ems_stubbed} EM stubs ({session.requests_made} requests)")


def run_frl_acts(args) -> None:
    """Every Act title on the Federal Register of Legislation (OData, honest
    UA). 100 per page via $skip ordered by id; ~138 requests for the full
    register. Date filters and $orderby on dates 500 on this API (probed)."""
    session = PoliteSession(min_interval=1.0 / args.rps, timeout=60)
    db = connect_db(args.db)
    ensure_table(db, ACTS_TABLE, ACTS_DDL, ACTS_INDEXES)
    skip, total, stored = args.skip, None, 0
    select = "id,name,makingDate,year,number,isPrincipal,isInForce,status,originatingBillUri"
    while True:
        # $orderby is required: $skip over the default order duplicates/misses rows
        params = {"$filter": "collection eq 'Act'", "$orderby": "id", "$top": 100, "$skip": skip,
                  "$select": select}
        if total is None:
            params["$count"] = "true"
        resp = session.get(FRL_TITLES, params=params)
        if resp.status_code != 200:
            warn(f"  skip={skip}: HTTP {resp.status_code} {resp.text[:200]}")
            break
        data = resp.json()
        total = total or data.get("@odata.count")
        vals = data.get("value", [])
        rows = [{
            "act_id": v["id"], "name": v.get("name"), "making_date": parse_date(v.get("makingDate")),
            "year": v.get("year"), "number": v.get("number"),
            "is_principal": int(bool(v.get("isPrincipal"))), "is_in_force": int(bool(v.get("isInForce"))),
            "status": v.get("status"), "bill_uri": v.get("originatingBillUri"),
            "bill_code": bill_code_from_uri(v.get("originatingBillUri")), "fetched_at": now_iso(),
        } for v in vals]
        stored += upsert(db, ACTS_TABLE, rows)
        log(f"  skip={skip}: {len(vals)} titles (register total {total}); stored {stored}")
        skip += len(vals)
        if len(vals) < 100 or (args.limit and stored >= args.limit):
            break
    n, with_bill, joined = db.execute(
        f"SELECT COUNT(*), SUM(bill_code IS NOT NULL), "
        f"SUM(bill_code IN (SELECT bill_code FROM {TABLE} WHERE dataset='billhome')) FROM {ACTS_TABLE}").fetchone()
    log(f"[frl-acts] {n:,} Acts stored; {with_bill or 0:,} carry a bill code; "
        f"{joined or 0:,} join a stored billhome row ({session.requests_made} requests)")


def _norm_title(t: str) -> str:
    return re.sub(r"\s+", " ", t or "").strip().casefold()


def run_link_bills(args) -> None:
    """Attach parli.db bills.bill_id to billhome/ems/billsdgs rows by title.
    Titles follow the same convention on both sides ('... Bill 1995 [2004]')."""
    db = connect_db(args.db)
    ensure_table(db, TABLE, DDL, INDEXES)
    bills = {}
    for bid, title in db.execute("SELECT bill_id, title FROM bills"):
        bills.setdefault(_norm_title(title), bid)
    rows = db.execute(
        f"SELECT parlinfo_id, title FROM {TABLE} WHERE dataset IN ('billhome','ems','billsdgs') "
        f"AND bill_id IS NULL").fetchall()
    updates = []
    for pid, title in rows:
        bid = bills.get(_norm_title(title))
        if bid is None and title:
            bid = bills.get(_norm_title(re.sub(r"\s*\[\d{4}\]\s*$", "", title)))
        if bid is not None:
            updates.append((bid, pid))
    hit = len(updates)
    if updates:
        write_txn(db, [(f"UPDATE {TABLE} SET bill_id=? WHERE parlinfo_id=?", updates)])
    log(f"[link-bills] {hit:,}/{len(rows):,} unlinked rows matched a bills.bill_id")
    for ds, n, linked in db.execute(
        f"SELECT dataset, COUNT(*), SUM(bill_id IS NOT NULL) FROM {TABLE} "
        f"WHERE dataset IN ('billhome','ems','billsdgs') GROUP BY dataset"):
        log(f"  {ds}: {linked or 0:,}/{n:,} linked")


# ---------------------------------------------------------------------------
# KB mapping (shape mirrors arag_sync.py; nothing is pushed here)
# ---------------------------------------------------------------------------

try:
    from parli.ingest.arag_sync import _classifications, _texts
except Exception:  # pragma: no cover
    def _classifications(pairs):
        return [{"labelset": k, "label": str(v)} for k, v in pairs if v not in (None, "", "None")]

    def _texts(body):
        return {"body": {"body": body, "format": "PLAIN"}}


def map_parlinfo_doc(row, body_override: Optional[str] = None, slug_override: Optional[str] = None,
                     extra_labels: tuple = ()) -> dict:
    """ext_parlinfo_docs row -> ARAG resource body. Only rows whose body (or,
    for billhome, the summary excerpt) is >= 200 chars are worth pushing;
    metadata-only press releases are an index, not documents. Bill text is
    pushed per VERSION (all sections joined) — see map_bill_version."""
    spec = DATASETS[row["dataset"]]
    meta = json.loads(row["meta_json"]) if row["meta_json"] else {}
    date = row["date"] or ""
    body = body_override if body_override is not None else (row["body_text"] or row["excerpt"] or "")
    title = row["title"] or ""
    text = f"{title}\n\n{body}" if title and not body.startswith(title[:40]) else body
    author = row["author"] if row["dataset"] == "pressrel" else None
    return {
        "slug": slug_override or ("parlinfo-" + row["parlinfo_id"].replace("/", "-")),
        "title": " — ".join(b for b in (author or row["source"], title, date) if b)[:2000],
        "texts": _texts(text),
        "origin": {
            "source_id": "opax-words-parlinfo",
            "url": row["display_url"],
            "collaborators": [author] if author else [],
            **({"created": f"{date}T00:00:00Z"} if len(date) == 10 else {}),
        },
        "usermetadata": {
            "classifications": _classifications([
                ("kind", spec["kind"]),
                ("source", "parlinfo"),
                ("dataset", row["dataset"]),
                ("state", "federal"),
                ("party", row["party"]),
                ("chamber", spec.get("chamber")),
                ("committee", meta.get("Committee Name")),
                ("stage", meta.get("stage")),
                ("portfolio", meta.get("Portfolio")),
                ("decade", decade_of(date)),
                *extra_labels,
            ])
        },
        "extra": {
            "metadata": {
                "parlinfo_id": row["parlinfo_id"], "office": row["source"],
                "author_raw": row["author_raw"], "in_government": row["in_government"],
                "bill_code": row["bill_code"], "bill_id": row["bill_id"],
                "pdf_url": row["pdf_url"], "date": date,
                "licence": "CC BY-NC-ND 4.0 (Commonwealth of Australia, aph.gov.au)",
            }
        },
    }


def map_bill_version(rows) -> dict:
    """All section rows of one bill version (same meta.version, ordered by
    section) -> ONE resource: slug parlinfo-legislation-bills-r7513_aspassed,
    body = sections joined with their headings."""
    rows = sorted(rows, key=lambda r: r["parlinfo_id"])  # …/0000, /0001, … sorts by section
    first = rows[0]
    meta = json.loads(first["meta_json"]) if first["meta_json"] else {}
    version = first["parlinfo_id"].rsplit("/", 1)[0].split("/")[-1]  # r7513_aspassed
    meta.setdefault("version", version)
    meta.setdefault("stage", version.split("_", 1)[1] if "_" in version else None)
    meta.setdefault("bill_title", first["title"])
    parts = []
    for r in rows:
        heading = (r["title"] or "").strip()
        body = (r["body_text"] or "").strip()
        parts.append(f"{heading}\n\n{body}" if heading and not body.startswith(heading[:40]) else body)
    doc = map_parlinfo_doc(first, body_override="\n\n".join(p for p in parts if p),
                           slug_override="parlinfo-legislation-bills-" + meta["version"])
    doc["title"] = " — ".join(b for b in (meta.get("bill_title"), meta.get("stage"), first["date"]) if b)[:2000]
    doc["extra"]["metadata"].update({"version": meta["version"], "stage": meta.get("stage"),
                                     "sections": len(rows), "bill_title": meta.get("bill_title")})
    return doc


def iter_bill_versions(db, limit: Optional[int] = None):
    """Yield lists of section rows grouped by bill version."""
    rows = db.execute(
        f"SELECT * FROM {TABLE} WHERE dataset='bills' AND body_text IS NOT NULL "
        f"ORDER BY parlinfo_id").fetchall()
    groups: dict[str, list] = {}
    for r in rows:
        groups.setdefault(r["parlinfo_id"].rsplit("/", 1)[0], []).append(r)
    for n, g in enumerate(groups.values()):
        if limit and n >= limit:
            break
        yield g


def run_map(args) -> None:
    db = connect_db(args.db)
    if args.dataset == "bills":
        for group in iter_bill_versions(db, args.limit):
            body = map_bill_version(group)
            shown = {**body, "texts": {k: {**v, "body": v["body"][:300] + "…", "_chars": len(v["body"])}
                                        for k, v in body["texts"].items()}}
            print(json.dumps(shown, indent=1, ensure_ascii=False))
        return
    q = (f"SELECT * FROM {TABLE} WHERE LENGTH(COALESCE(body_text, excerpt, '')) >= 200 AND dataset != 'bills'")
    if args.dataset:
        q += f" AND dataset='{args.dataset}'"
    for row in db.execute(q + " ORDER BY RANDOM() LIMIT ?", (args.limit,)):
        body = map_parlinfo_doc(row)
        shown = {**body, "texts": {k: {**v, "body": v["body"][:300] + "…", "_chars": len(v["body"])}
                                    for k, v in body["texts"].items()}}
        print(json.dumps(shown, indent=1, ensure_ascii=False))


def run_stats(args) -> None:
    db = connect_db(args.db)
    ensure_table(db, TABLE, DDL, INDEXES)
    ensure_table(db, ACTS_TABLE, ACTS_DDL, ACTS_INDEXES)
    total = db.execute(f"SELECT COUNT(*) FROM {TABLE}").fetchone()[0]
    print(f"[{TABLE}] {total:,} rows")
    for r in db.execute(
        f"SELECT dataset, COUNT(*), MIN(date), MAX(date), SUM(body_fetched), "
        f"SUM(body_text IS NOT NULL), SUM(LENGTH(COALESCE(body_text, excerpt,''))>=200), "
        f"SUM(author IS NOT NULL), SUM(party IS NOT NULL), SUM(bill_id IS NOT NULL), "
        f"ROUND(AVG(LENGTH(body_text))), SUM(LENGTH(body_text)) FROM {TABLE} GROUP BY dataset ORDER BY 2 DESC"):
        print(f"  {r[0]:10s} {r[1]:>6,}  {r[2]} .. {r[3]}  display visited {r[4] or 0:,}  "
              f"inline body {r[5] or 0:,}  >=200 chars {r[6] or 0:,}  author {r[7] or 0:,}  "
              f"party {r[8] or 0:,}  bill_id {r[9] or 0:,}  avg body {int(r[10] or 0):,}  "
              f"total body {int(r[11] or 0):,} chars")
    n_ver = db.execute(f"SELECT COUNT(DISTINCT substr(parlinfo_id, 1, length(parlinfo_id)-5)) FROM {TABLE} "
                       f"WHERE dataset='bills'").fetchone()[0]
    n_bills = db.execute(f"SELECT COUNT(DISTINCT bill_code) FROM {TABLE} WHERE dataset='bills'").fetchone()[0]
    print(f"  bill text: {n_ver:,} versions of {n_bills:,} bills")
    n, with_bill, joined = db.execute(
        f"SELECT COUNT(*), SUM(bill_code IS NOT NULL), "
        f"SUM(bill_code IN (SELECT bill_code FROM {TABLE} WHERE dataset='billhome')) FROM {ACTS_TABLE}").fetchone()
    print(f"[{ACTS_TABLE}] {n:,} Acts; {with_bill or 0:,} with bill code; {joined or 0:,} join a stored billhome row")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--db", default=str(DB_PATH))
    p.add_argument("--browser-ua", action="store_true",
                   help="send a Firefox User-Agent (required: the WAF 403s the honest UA)")
    p.add_argument("--rps", type=float, default=0.7, help="max requests/second (default 0.7)")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("listing", help="crawl search-result pages (100 records each)")
    s.add_argument("--dataset", required=True, choices=sorted(DATASETS))
    s.add_argument("--pages", type=int, default=1)
    s.add_argument("--start-page", type=int, default=0)
    s.add_argument("--order", choices=sorted(ORDER), default="newest")
    s.set_defaults(func=run_listing)

    s = sub.add_parser("display", help="visit display pages for stored rows (party, inline body)")
    s.add_argument("--dataset", required=True, choices=sorted(DATASETS))
    s.add_argument("--limit", type=int, default=20)
    s.set_defaults(func=run_display)

    s = sub.add_parser("bill-sections", help="walk bill-home pages -> every text version's section pages")
    s.add_argument("--limit", type=int, default=10, help="bills (billhome rows without text yet)")
    s.add_argument("--codes", default=None, help="comma-separated bill codes instead, e.g. r7451,s1511")
    s.add_argument("--max-sections", type=int, default=400)
    s.set_defaults(func=run_bill_sections)

    s = sub.add_parser("frl-acts", help="Federal Register of Legislation Act titles -> ext_frl_acts")
    s.add_argument("--skip", type=int, default=0)
    s.add_argument("--limit", type=int, default=None)
    s.set_defaults(func=run_frl_acts)

    s = sub.add_parser("link-bills")
    s.set_defaults(func=run_link_bills)

    s = sub.add_parser("stats")
    s.set_defaults(func=run_stats)

    s = sub.add_parser("map")
    s.add_argument("--limit", type=int, default=3)
    s.add_argument("--dataset", default=None)
    s.set_defaults(func=run_map)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
