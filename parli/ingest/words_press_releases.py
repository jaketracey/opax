"""
parli.ingest.words_press_releases -- what politicians said OUTSIDE the chamber.

Sources (machine-readable, licence-clean, fetched with the honest OPAX UA):

  pmtranscripts  PM Transcripts (pmtranscripts.pmc.gov.au), CC BY 4.0.
                 Documented XML API: /query?transcript=<id>. ~26K speeches,
                 media releases, interviews, doorstops from every PM since
                 Curtin (1941). Ids 1..~47,700 with large gaps.
  nsw            NSW Government ministerial media releases, CC BY 4.0.
                 Elasticsearch proxy behind www.nsw.gov.au/ministerial-releases
                 (subtype:ministerialmediarelease). ~6.2K releases, 2022-03 on.
                 Attribution is by PORTFOLIO only (no minister names).
  qld            Queensland ministerial media statements, statements.qld.gov.au
                 (whole-of-government CC BY 4.0, qld.gov.au/legal/copyright).
                 Sequential ids /statements/<id>, ~106K statements, 1997-08 on.
                 Minister + portfolio on every statement.
  vic            Premier of Victoria media centre, premier.vic.gov.au, CC BY 4.0.
                 sitemap.xml?page=1..N -> /api/tide/page?path=<slug> (JSON).
                 ~24K items (12 sitemap pages x 2000), Andrews/Allan
                 governments. Attribution parsed from "Quotes attributable to
                 <role> <name>" paragraphs. robots Crawl-delay 2.
  treasury       Treasury portfolio ministers, ministers.treasury.gov.au,
                 CC BY 4.0 (treasury.gov.au/copyright-disclaimer). Drupal
                 JSON:API /jsonapi/node/media (media releases, speeches,
                 transcripts, opinion pieces) with minister + media-type
                 taxonomies. ~3.9K items, 2022-05 on; the older HTML archive
                 (Costello 1996 .. Frydenberg 2022) is WAF-blocked (403).

Not covered here (see docs/DATA-WORDS.md): ParlInfo's 663K-item press-release
index (words_parlinfo.py — metadata only, the PDFs sit under a robots-
disallowed path), SA (Cloudflare challenge), the other federal portfolio sites
(RSS of the last 20 items only; listing pages 403 or JS-rendered).

Writes ONLY the new table ext_press_releases (PK source, source_id). Never
touches existing tables. Never pushes to the ARAG KB — see `map` for the
resource shape a future sync would use.

Usage (on the box that holds parli.db):
  python3 -m parli.ingest.words_press_releases pmtranscripts --ids 45000-46200
  python3 -m parli.ingest.words_press_releases pmtranscripts --stride 25      # survey the id space
  python3 -m parli.ingest.words_press_releases nsw --all
  python3 -m parli.ingest.words_press_releases qld --stride 50
  python3 -m parli.ingest.words_press_releases qld --ids 105700-105990
  python3 -m parli.ingest.words_press_releases vic --limit 200
  python3 -m parli.ingest.words_press_releases treasury --all
  python3 -m parli.ingest.words_press_releases stats
  python3 -m parli.ingest.words_press_releases map --limit 3
"""

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Iterable, Optional
from urllib.parse import quote

from parli.ingest.speaker_names import normalize_speaker
from parli.ingest.words_common import (
    DB_PATH, PoliteSession, connect_db, decade_of, ensure_table, existing_ids,
    html_to_text, id_range, log, now_iso, parse_date, print_table_stats, upsert, warn,
)

TABLE = "ext_press_releases"
DDL = f"""
CREATE TABLE IF NOT EXISTS {TABLE} (
    source        TEXT NOT NULL,   -- pmtranscripts | nsw | qld | vic
    source_id     TEXT NOT NULL,   -- transcript id / nid / statement id / slug
    url           TEXT,
    title         TEXT,
    date          TEXT,            -- YYYY-MM-DD
    release_type  TEXT,            -- Media Release | Transcript | Speech | Interview | ...
    speaker_raw   TEXT,
    speaker       TEXT,            -- normalize_speaker() form, KB collaborator value
    role          TEXT,            -- office / portfolio(s)
    party         TEXT,            -- only when unambiguous (PMs; single-party govts)
    government    TEXT,            -- e.g. 'Minns (Labor)' for state ministers
    jurisdiction  TEXT,            -- federal | nsw | qld | vic
    body_html     TEXT,
    body_text     TEXT,
    subjects      TEXT,
    document_url  TEXT,            -- source PDF where the site provides one
    extra_json    TEXT,
    licence       TEXT,
    fetched_at    TEXT,
    PRIMARY KEY (source, source_id)
)"""
INDEXES = [
    f"CREATE INDEX IF NOT EXISTS {TABLE}_date ON {TABLE}(date)",
    f"CREATE INDEX IF NOT EXISTS {TABLE}_speaker ON {TABLE}(speaker)",
]

SOURCES = {
    "pmtranscripts": {"short": "pmt", "jurisdiction": "federal",
                      "licence": "CC BY 4.0 (Commonwealth of Australia; pmtranscripts.pmc.gov.au/copyright)"},
    "nsw": {"short": "nsw", "jurisdiction": "nsw",
            "licence": "CC BY 4.0 (State of New South Wales; nsw.gov.au/copyright)"},
    "qld": {"short": "qld", "jurisdiction": "qld",
            "licence": "CC BY 4.0 (State of Queensland; qld.gov.au/legal/copyright)"},
    "vic": {"short": "vic", "jurisdiction": "vic",
            "licence": "CC BY 4.0 (State of Victoria; premier.vic.gov.au/copyright)"},
    "treasury": {"short": "tre", "jurisdiction": "federal",
                 "licence": "CC BY 4.0 (Commonwealth of Australia, Department of the Treasury; "
                            "treasury.gov.au/copyright-disclaimer)"},
}

# Party attribution. PMs by surname; state ministers inherit the governing
# party only when the government is single-party (Coalition governments get
# None — a Nationals minister must not be labelled Liberal).
PM_PARTY = {
    "Curtin": "Labor", "Forde": "Labor", "Chifley": "Labor", "Menzies": "Liberal",
    "Holt": "Liberal", "McEwen": "Nationals", "Gorton": "Liberal", "McMahon": "Liberal",
    "Whitlam": "Labor", "Fraser": "Liberal", "Hawke": "Labor", "Keating": "Labor",
    "Howard": "Liberal", "Rudd": "Labor", "Gillard": "Labor", "Abbott": "Liberal",
    "Turnbull": "Liberal", "Morrison": "Liberal", "Albanese": "Labor",
}
# (start date, premier surname, party or None for Coalition)
GOVERNMENTS = {
    "qld": [("1996-02-19", "Borbidge", None), ("1998-06-26", "Beattie", "Labor"),
            ("2007-09-13", "Bligh", "Labor"), ("2012-03-26", "Newman", "LNP"),
            ("2015-02-14", "Palaszczuk", "Labor"), ("2023-12-15", "Miles", "Labor"),
            ("2024-10-28", "Crisafulli", "LNP")],
    "vic": [("1992-10-06", "Kennett", None), ("1999-10-20", "Bracks", "Labor"),
            ("2007-07-30", "Brumby", "Labor"), ("2010-12-02", "Baillieu", None),
            ("2013-03-06", "Napthine", None), ("2014-12-04", "Andrews", "Labor"),
            ("2023-09-27", "Allan", "Labor")],
    "nsw": [("1995-04-04", "Carr", "Labor"), ("2005-08-03", "Iemma", "Labor"),
            ("2008-09-05", "Rees", "Labor"), ("2009-12-04", "Keneally", "Labor"),
            ("2011-04-04", "O'Farrell", None), ("2014-04-17", "Baird", None),
            ("2017-01-23", "Berejiklian", None), ("2021-10-05", "Perrottet", None),
            ("2023-03-28", "Minns", "Labor")],
    "federal": [("1996-03-11", "Howard", None), ("2007-12-03", "Rudd", "Labor"),
                ("2010-06-24", "Gillard", "Labor"), ("2013-06-27", "Rudd", "Labor"),
                ("2013-09-18", "Abbott", None), ("2015-09-15", "Turnbull", None),
                ("2018-08-24", "Morrison", None), ("2022-05-23", "Albanese", "Labor")],
}
NSW_DEPUTY_PREMIERS = [("2019-04-02", "John Barilaro"), ("2021-10-06", "Paul Toole"),
                       ("2023-03-28", "Prue Car")]
PREMIER_FULL_NAMES = {
    "Minns": "Chris Minns", "Perrottet": "Dominic Perrottet", "Berejiklian": "Gladys Berejiklian",
    "Baird": "Mike Baird", "O'Farrell": "Barry O'Farrell", "Keneally": "Kristina Keneally",
    "Rees": "Nathan Rees", "Iemma": "Morris Iemma", "Carr": "Bob Carr",
}


def government_for(jurisdiction: str, date: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """-> (label like 'Minns (Labor)', party-or-None) for the government in
    office on `date`."""
    if not date:
        return None, None
    current = None
    for start, premier, party in GOVERNMENTS.get(jurisdiction, []):
        if date >= start:
            current = (premier, party)
    if not current:
        return None, None
    premier, party = current
    return f"{premier} ({party or 'Coalition'})", party


def _row(source: str, source_id: str, **fields) -> dict:
    meta = SOURCES[source]
    base = {
        "source": source, "source_id": str(source_id), "url": None, "title": None,
        "date": None, "release_type": None, "speaker_raw": None, "speaker": None,
        "role": None, "party": None, "government": None,
        "jurisdiction": meta["jurisdiction"], "body_html": None, "body_text": None,
        "subjects": None, "document_url": None, "extra_json": None,
        "licence": meta["licence"], "fetched_at": now_iso(),
    }
    base.update(fields)
    if isinstance(base["extra_json"], dict):
        base["extra_json"] = json.dumps(base["extra_json"], ensure_ascii=False)
    return base


# ---------------------------------------------------------------------------
# PM Transcripts — XML API
# ---------------------------------------------------------------------------

PMT_QUERY = "https://pmtranscripts.pmc.gov.au/query?transcript={id}"
PMT_PAGE = "https://pmtranscripts.pmc.gov.au/release/transcript-{id}"


def fetch_pm_transcript(session: PoliteSession, tid: int) -> Optional[dict]:
    resp = session.get(PMT_QUERY.format(id=tid))
    if resp.status_code != 200:
        warn(f"  pmtranscripts {tid}: HTTP {resp.status_code}")
        return None
    try:
        root = ET.fromstring(resp.content)
    except ET.ParseError as e:
        warn(f"  pmtranscripts {tid}: XML parse error {e}")
        return None
    item = root.find("item")
    if item is None:
        return None  # empty <response/> — no transcript with this id
    get = lambda tag: (item.findtext(tag) or "").strip()  # noqa: E731
    pm_raw = get("prime-minister")               # 'Albanese, Anthony'
    speaker = normalize_speaker(pm_raw) if pm_raw else None
    surname = pm_raw.split(",")[0].strip() if pm_raw else ""
    content_html = get("content")
    doc = get("document")
    return _row(
        "pmtranscripts", tid,
        url=PMT_PAGE.format(id=tid),
        title=re.sub(r"\s+", " ", get("title")),
        date=parse_date(get("field_date") or get("release-date")),
        release_type=get("release-type") or None,
        speaker_raw=pm_raw or None, speaker=speaker, role="Prime Minister",
        party=PM_PARTY.get(surname),
        body_html=content_html or None,
        body_text=html_to_text(content_html),
        subjects=get("subjects") or None,
        document_url=doc if doc.lower().endswith(".pdf") else None,
        extra_json={"period_of_service": get("period-of-service")},
    )


def run_pmtranscripts(args) -> None:
    db = connect_db(args.db)
    ensure_table(db, TABLE, DDL, INDEXES)
    if args.ids:
        ids: Iterable[int] = id_range(args.ids)
    else:
        ids = range(1, args.max_id + 1, args.stride)
    done = existing_ids(db, TABLE, "source_id", "source='pmtranscripts'")
    todo = [i for i in ids if str(i) not in done]
    log(f"[pmtranscripts] {len(todo):,} ids to probe ({len(done):,} already stored)")
    session = PoliteSession(min_interval=1.0 / args.rps)
    found = kept = 0
    batch: list[dict] = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(fetch_pm_transcript, session, i): i for i in todo}
        for n, fut in enumerate(as_completed(futures), 1):
            row = fut.result()
            if row:
                found += 1
                if not args.since or (row["date"] or "") >= args.since:
                    batch.append(row)
                    kept += 1
            if len(batch) >= 50:
                upsert(db, TABLE, batch)
                batch = []
            if n % 200 == 0:
                log(f"  probed {n:,}/{len(todo):,}  found {found:,}  kept {kept:,}")
    upsert(db, TABLE, batch)
    log(f"[pmtranscripts] done: probed {len(todo):,}, found {found:,}, stored {kept:,} "
        f"({session.requests_made:,} requests)")


# ---------------------------------------------------------------------------
# NSW — Elasticsearch proxy
# ---------------------------------------------------------------------------

NSW_ES = "https://www.nsw.gov.au/api/v1/elasticsearch/prod_content/_search"
NSW_Q = "subtype:ministerialmediarelease"
NSW_PAGE = 200
NSW_WINDOW = 10_000  # Elasticsearch default max_result_window


def _first(v):
    return v[0] if isinstance(v, list) and v else (None if isinstance(v, list) else v)


def nsw_row(src: dict) -> dict:
    date = parse_date(_first(src.get("article_date")) or _first(src.get("display_date")))
    portfolios = [p for p in (src.get("name_ministers") or []) if p]
    html = _first(src.get("html_content")) or ""
    gov, party = government_for("nsw", date)
    # Only the (Deputy) Premier is person-resolvable by date of office;
    # everything else stays portfolio-only until a ministry list is joined.
    speaker = None
    if gov and any(re.match(r"(?:The\s+)?Premier\b", p) for p in portfolios):
        speaker = PREMIER_FULL_NAMES.get(gov.split(" (")[0])
    elif date and any(re.match(r"Deputy Premier\b", p) for p in portfolios):
        speaker = next((n for start, n in reversed(NSW_DEPUTY_PREMIERS) if date >= start), None)
    path = _first(src.get("url")) or ""
    return _row(
        "nsw", _first(src.get("nid")),
        url=f"https://www.nsw.gov.au{path}" if path.startswith("/") else path,
        title=_first(src.get("title")), date=date, release_type="Media Release",
        speaker_raw="; ".join(portfolios) or None, speaker=speaker,
        role="; ".join(portfolios) or None, party=party if speaker else None,
        government=gov, body_html=html or None, body_text=html_to_text(html),
        subjects="; ".join(src.get("name_topic") or []) or None,
        extra_json={"summary": _first(src.get("summary")),
                    "agency": src.get("agency_name"), "uuid": _first(src.get("uuid"))},
    )


def nsw_search(session: PoliteSession, q: str, frm: int, size: int) -> dict:
    url = (f"{NSW_ES}?q={quote(q)}&size={size}&from={frm}&sort=article_date:desc"
           f"&_source=nid,title,url,article_date,display_date,html_content,summary,"
           f"name_ministers,agency_name,name_topic,uuid")
    resp = session.get(url)
    resp.raise_for_status()
    return resp.json()


def run_nsw(args) -> None:
    db = connect_db(args.db)
    ensure_table(db, TABLE, DDL, INDEXES)
    session = PoliteSession(min_interval=1.0)
    limit = None if args.all else args.limit
    total = nsw_search(session, NSW_Q, 0, 0)["hits"]["total"]["value"]
    log(f"[nsw] {total:,} ministerial media releases indexed")
    # Slice by year if the result set would exceed the 10K scroll window.
    queries = [NSW_Q]
    if total > NSW_WINDOW:
        import calendar, datetime as dt
        queries = []
        for year in range(2000, dt.date.today().year + 1):
            a = calendar.timegm((year, 1, 1, 0, 0, 0))
            b = calendar.timegm((year, 12, 31, 23, 59, 59))
            queries.append(f"{NSW_Q} AND article_date:[{a} TO {b}]")
    stored = 0
    for q in queries:
        frm = 0
        while True:
            data = nsw_search(session, q, frm, NSW_PAGE)
            hits = data["hits"]["hits"]
            if not hits:
                break
            rows = [nsw_row(h["_source"]) for h in hits]
            if args.since:
                rows = [r for r in rows if (r["date"] or "") >= args.since]
            stored += upsert(db, TABLE, rows)
            frm += len(hits)
            log(f"  {q[:40]}… from={frm:,} stored={stored:,}")
            if limit and stored >= limit:
                break
            if frm >= NSW_WINDOW:
                warn("  hit the 10K window; remaining rows need year slicing")
                break
        if limit and stored >= limit:
            break
    log(f"[nsw] stored {stored:,} rows ({session.requests_made} requests)")


# ---------------------------------------------------------------------------
# Queensland — sequential statement ids
# ---------------------------------------------------------------------------

QLD_URL = "https://statements.qld.gov.au/statements/{id}"
_LD_RE = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)
_QLD_MIN_RE = re.compile(r'class="statement-ministers[^"]*"[^>]*>(.*?)</p>', re.S)
_PAIR_RE = re.compile(r"<strong>(.*?)</strong>\s*<br\s*/?>\s*([^<]+)", re.S)


def _qld_ministers(page: str) -> list[dict]:
    out = []
    for block in _QLD_MIN_RE.findall(page):
        for portfolio, name in _PAIR_RE.findall(block):
            raw = html_to_text(name)
            clean = re.sub(r"^(?:The\s+)?Hon(?:ourable|\.)?\s+", "", raw, flags=re.I)
            out.append({"portfolio": html_to_text(portfolio), "name_raw": raw,
                        "name": normalize_speaker(clean)})
    return out


def fetch_qld_statement(session: PoliteSession, sid: int) -> Optional[dict]:
    resp = session.get(QLD_URL.format(id=sid), allow_redirects=False)
    if resp.status_code != 200:
        return None
    page = resp.text
    article = None
    for blob in _LD_RE.findall(page):
        try:
            data = json.loads(blob)
        except json.JSONDecodeError:
            continue
        if data.get("@type") == "NewsArticle" and data.get("headline"):
            article = data
            break
    if article is None:
        return None
    ministers = _qld_ministers(page)
    body_html = article.get("articleBody") or ""
    date = parse_date(article.get("datePublished"))
    gov, party = government_for("qld", date)
    lead = ministers[0] if ministers else {}
    return _row(
        "qld", sid,
        url=QLD_URL.format(id=sid),
        title=re.sub(r"\s+", " ", article.get("headline", "")).strip(),
        date=date, release_type="Media Statement",
        speaker_raw=lead.get("name_raw"), speaker=lead.get("name"),
        role=lead.get("portfolio"), party=party if ministers else None, government=gov,
        body_html=body_html or None, body_text=html_to_text(body_html),
        extra_json={"ministers": ministers, "dateModified": article.get("dateModified")},
    )


def run_qld(args) -> None:
    db = connect_db(args.db)
    ensure_table(db, TABLE, DDL, INDEXES)
    if args.ids:
        ids: Iterable[int] = id_range(args.ids)
    else:
        ids = range(1, args.max_id + 1, args.stride)
    done = existing_ids(db, TABLE, "source_id", "source='qld'")
    todo = [i for i in ids if str(i) not in done]
    log(f"[qld] {len(todo):,} ids to probe ({len(done):,} already stored)")
    session = PoliteSession(min_interval=1.0 / args.rps)
    found = kept = 0
    batch: list[dict] = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(fetch_qld_statement, session, i): i for i in todo}
        for n, fut in enumerate(as_completed(futures), 1):
            row = fut.result()
            if row:
                found += 1
                if not args.since or (row["date"] or "") >= args.since:
                    batch.append(row)
                    kept += 1
            if len(batch) >= 50:
                upsert(db, TABLE, batch)
                batch = []
            if n % 200 == 0:
                log(f"  probed {n:,}/{len(todo):,}  found {found:,}  kept {kept:,}")
    upsert(db, TABLE, batch)
    log(f"[qld] done: probed {len(todo):,}, found {found:,}, stored {kept:,} "
        f"({session.requests_made:,} requests)")


# ---------------------------------------------------------------------------
# Victoria — sitemap + Tide page API
# ---------------------------------------------------------------------------

VIC_BASE = "https://www.premier.vic.gov.au"
VIC_SITEMAP = VIC_BASE + "/sitemap.xml?page={page}"
VIC_PAGE_API = VIC_BASE + "/api/tide/page?path={path}"
VIC_STATIC = {
    "", "home", "media-centre", "media-centre-old", "contact-us", "copyright",
    "disclaimer", "privacy", "policy", "subscribe", "accessibility", "search",
    "ministers", "about", "premier",
}
_ATTRIB_RE = re.compile(r"Quotes?\s+attributable\s+to\s+(?:the\s+)?(.+)", re.I)
_POLITICIAN_ROLE_RE = re.compile(
    r"Premier|Minister|Treasurer|Attorney|Member for|Parliamentary Secretary|Leader|Speaker",
    re.I)
_NAME_PARTICLES = {"De", "Van", "Da", "Di", "Le", "Du", "Della", "St"}


def parse_attributable(text: str) -> list[dict]:
    """'Minister for Energy and Resources Lily D’Ambrosio' -> role + name.
    Names are taken as the final two tokens (three when a particle like 'De'
    precedes the surname); the raw line is kept for later correction."""
    out = []
    seen = set()
    for line in text.splitlines():
        m = _ATTRIB_RE.search(line)
        if not m:
            continue
        raw = m.group(1).strip().rstrip(":;,.–- ").strip()
        if raw.lower() in seen or len(raw) < 3:
            continue
        seen.add(raw.lower())
        tokens = raw.split()
        if len(tokens) < 2:
            continue
        n = 3 if len(tokens) >= 3 and tokens[-2] in _NAME_PARTICLES else 2
        name = " ".join(tokens[-n:])
        role = " ".join(tokens[:-n]).strip() or None
        out.append({"raw": raw, "role": role, "name_raw": name,
                    "name": normalize_speaker(name),
                    "politician": bool(role is None or _POLITICIAN_ROLE_RE.search(role))})
    return out


def vic_slugs(session: PoliteSession, max_pages: int) -> list[str]:
    slugs: list[str] = []
    for page in range(1, max_pages + 1):
        resp = session.get(VIC_SITEMAP.format(page=page))
        if resp.status_code != 200:
            break
        locs = re.findall(r"<loc>(.*?)</loc>", resp.text)
        if not locs:
            break
        for loc in locs:
            path = loc.replace(VIC_BASE, "").strip("/")
            if "/" in path or path in VIC_STATIC or not re.fullmatch(r"[a-z0-9-]+", path):
                continue
            slugs.append(path)
        log(f"  sitemap page {page}: {len(locs)} urls")
    return list(dict.fromkeys(slugs))


def fetch_vic_page(session: PoliteSession, slug: str) -> Optional[dict]:
    resp = session.get(VIC_PAGE_API.format(path="/" + slug))
    if resp.status_code != 200:
        return None
    try:
        data = resp.json()
    except ValueError:
        return None
    if data.get("type") != "news":
        return None
    body_html = ((data.get("body") or {}).get("content")) or ""
    text = html_to_text(body_html)
    date = parse_date(data.get("published") or (data.get("details") or {}).get("published"))
    speakers = parse_attributable(text)
    politicians = [s for s in speakers if s["politician"] and s["name"]]
    lead = politicians[0] if politicians else {}
    gov, party = government_for("vic", date)
    return _row(
        "vic", slug,
        url=f"{VIC_BASE}/{slug}",
        title=re.sub(r"\s+", " ", data.get("title") or "").strip(),
        date=date, release_type="Media Release",
        speaker_raw=lead.get("raw"), speaker=lead.get("name"), role=lead.get("role"),
        party=party if politicians else None, government=gov,
        body_html=body_html or None, body_text=text,
        subjects="; ".join(t.get("name", t) if isinstance(t, dict) else str(t)
                           for t in (data.get("topicTags") or [])) or None,
        extra_json={"speakers": speakers, "nid": data.get("nid"),
                    "location": (data.get("details") or {}).get("location")},
    )


def run_vic(args) -> None:
    db = connect_db(args.db)
    ensure_table(db, TABLE, DDL, INDEXES)
    session = PoliteSession(min_interval=2.0)  # robots.txt Crawl-delay: 2
    slugs = vic_slugs(session, args.sitemap_pages)
    done = existing_ids(db, TABLE, "source_id", "source='vic'")
    todo = [s for s in slugs if s not in done]
    if args.limit:
        todo = todo[: args.limit]
    log(f"[vic] {len(slugs):,} sitemap slugs, {len(todo):,} to fetch ({len(done):,} stored)")
    stored = skipped = 0
    batch: list[dict] = []
    for n, slug in enumerate(todo, 1):
        row = fetch_vic_page(session, slug)
        if row is None:
            skipped += 1
        elif not args.since or (row["date"] or "") >= args.since:
            batch.append(row)
        if len(batch) >= 25:
            stored += upsert(db, TABLE, batch)
            batch = []
        if n % 50 == 0:
            log(f"  {n:,}/{len(todo):,} fetched, {stored:,} stored, {skipped} non-news")
    stored += upsert(db, TABLE, batch)
    log(f"[vic] stored {stored:,} rows, {skipped} non-news pages ({session.requests_made} requests)")


# ---------------------------------------------------------------------------
# Treasury ministers — Drupal JSON:API
# ---------------------------------------------------------------------------

TRE_BASE = "https://ministers.treasury.gov.au"
TRE_API = TRE_BASE + "/jsonapi/node/media"
TRE_PAGE = 50
TRE_PARAMS = {
    "sort": "-field_date,-drupal_internal__nid",  # nid tie-break keeps offset paging stable
    "include": "field_minister,field_media_type",
    "fields[node--media]": "title,field_date,path,body,drupal_internal__nid,created,"
                           "field_media_type,field_minister,field_meta_note",
    "fields[taxonomy_term--minister]": "name,field_position,field_start_date,field_end_date",
    "fields[taxonomy_term--media_type]": "name",
}
TRE_TYPES = {"media-releases": "Media Release", "speeches": "Speech", "transcripts": "Transcript",
             "articles": "Opinion", "publications": "Publication", "other": "Other"}


def treasury_rows(data: dict) -> list[dict]:
    included = {(i["type"], i["id"]): i.get("attributes", {}) for i in data.get("included", [])}

    def rel(item, name):
        d = (item.get("relationships", {}).get(name) or {}).get("data")
        return included.get((d["type"], d["id"]), {}) if isinstance(d, dict) else {}

    rows = []
    for item in data.get("data", []):
        a = item["attributes"]
        minister = rel(item, "field_minister")
        mtype = (rel(item, "field_media_type").get("name") or "").strip()
        term = minister.get("name") or ""                      # 'Jim Chalmers 2022'
        name_raw = re.sub(r"\s+\d{4}$", "", term).strip()
        body = a.get("body") or {}
        body_html = body.get("processed") or body.get("value") or ""
        note = html_to_text(((a.get("field_meta_note") or {}).get("value")) or "")
        date = parse_date(a.get("field_date") or a.get("created"))
        gov, party = government_for("federal", date)
        alias = (a.get("path") or {}).get("alias") or ""
        rows.append(_row(
            "treasury", a["drupal_internal__nid"],
            url=TRE_BASE + alias if alias else None,
            title=re.sub(r"\s+", " ", a.get("title") or "").strip(), date=date,
            release_type=TRE_TYPES.get(mtype, mtype.title() or None),
            speaker_raw=term or None, speaker=normalize_speaker(name_raw) if name_raw else None,
            role=minister.get("field_position"), party=party if name_raw else None, government=gov,
            body_html=body_html or None, body_text=html_to_text(body_html),
            extra_json={"media_type": mtype, "minister_term": term,
                        "term_start": minister.get("field_start_date"),
                        "term_end": minister.get("field_end_date"), "note": note or None,
                        "created": a.get("created")},
        ))
    return rows


def run_treasury(args) -> None:
    db = connect_db(args.db)
    ensure_table(db, TABLE, DDL, INDEXES)
    session = PoliteSession(min_interval=1.0)
    limit = None if args.all else args.limit
    stored = 0
    # Follow links.next rather than computing offsets: Drupal applies node
    # access AFTER paging, so a page can carry fewer than page[limit] items
    # while the server-side offset still advanced by the full page.
    url: Optional[str] = TRE_API
    params: Optional[dict] = dict(TRE_PARAMS, **{"page[limit]": TRE_PAGE, "page[offset]": args.offset})
    empty_pages = 0
    while url:
        resp = session.get(url, params=params, headers={"Accept": "application/vnd.api+json"})
        params = None
        if resp.status_code != 200:
            warn(f"  {url[:120]}: HTTP {resp.status_code} {resp.text[:200]}")
            break
        data = resp.json()
        rows = treasury_rows(data)
        # Past the visible archive Drupal keeps emitting `next` for pages made
        # entirely of access-filtered nodes; three empty pages in a row = done.
        empty_pages = empty_pages + 1 if not data.get("data") else 0
        if empty_pages >= 3:
            break
        if args.since:
            rows = [r for r in rows if (r["date"] or "") >= args.since]
        stored += upsert(db, TABLE, rows)
        log(f"  stored={stored:,} (oldest on page {rows[-1]['date'] if rows else '-'})")
        if limit and stored >= limit:
            break
        url = ((data.get("links") or {}).get("next") or {}).get("href")
    log(f"[treasury] stored {stored:,} rows ({session.requests_made} requests)")


# ---------------------------------------------------------------------------
# KB mapping (shape mirrors parli/ingest/arag_sync.py; nothing is pushed here)
# ---------------------------------------------------------------------------

try:
    from parli.ingest.arag_sync import _classifications, _texts
except Exception:  # pragma: no cover - keeps `map` usable without parli.arag deps
    def _classifications(pairs):
        return [{"labelset": k, "label": str(v)} for k, v in pairs if v not in (None, "", "None")]

    def _texts(body):
        return {"body": {"body": body, "format": "PLAIN"}}


def map_press_release(row) -> dict:
    """ext_press_releases row -> ARAG resource body (kind=press_release)."""
    meta = SOURCES[row["source"]]
    date = row["date"] or ""
    speaker = row["speaker"]
    title = row["title"] or ""
    body = row["body_text"] or ""
    # Titles are not searchable on the platform; make the headline part of the body.
    text = f"{title}\n\n{body}" if title and not body.startswith(title[:40]) else body
    title_bits = [b for b in (speaker or row["role"], title, date) if b]
    extra = json.loads(row["extra_json"]) if row["extra_json"] else {}
    return {
        "slug": f"press-{meta['short']}-{row['source_id']}",
        "title": (" — ".join(title_bits) or f"Press release {row['source_id']}")[:2000],
        "texts": _texts(text),
        "origin": {
            "source_id": "opax-words",
            **({"url": row["url"]} if row["url"] else {}),
            "collaborators": [speaker] if speaker else [],
            **({"created": f"{date}T00:00:00Z"} if len(date) == 10 else {}),
        },
        "usermetadata": {
            "classifications": _classifications([
                ("kind", "press_release"),
                ("source", row["source"]),
                ("state", row["jurisdiction"]),
                ("party", row["party"]),
                ("release_type", row["release_type"]),
                ("government", row["government"]),
                ("decade", decade_of(date)),
            ])
        },
        "extra": {
            "metadata": {
                "role": row["role"], "speaker_raw": row["speaker_raw"],
                "subjects": row["subjects"], "document_url": row["document_url"],
                "licence": row["licence"], "date": date, **extra,
            }
        },
    }


def run_map(args) -> None:
    db = connect_db(args.db)
    q = f"SELECT * FROM {TABLE} WHERE LENGTH(COALESCE(body_text,'')) >= 200"
    if args.source:
        q += f" AND source='{args.source}'"
    for row in db.execute(q + " ORDER BY RANDOM() LIMIT ?", (args.limit,)):
        body = map_press_release(row)
        shown = {**body, "texts": {k: {**v, "body": v["body"][:300] + "…"} for k, v in body["texts"].items()}}
        print(json.dumps(shown, indent=1, ensure_ascii=False))


def run_stats(args) -> None:
    db = connect_db(args.db)
    ensure_table(db, TABLE, DDL, INDEXES)
    print_table_stats(db, TABLE, "source")
    for src, in db.execute(f"SELECT DISTINCT source FROM {TABLE}"):
        n, named, ge200, since93 = db.execute(
            f"SELECT COUNT(*), SUM(speaker IS NOT NULL), "
            f"SUM(LENGTH(COALESCE(body_text,''))>=200), SUM(date>='1993-03-13') "
            f"FROM {TABLE} WHERE source=?", (src,)).fetchone()
        print(f"  {src}: {named or 0:,}/{n:,} with a named speaker, "
              f"{ge200 or 0:,} with >=200 chars, {since93 or 0:,} dated >=1993-03-13")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--db", default=str(DB_PATH))
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("pmtranscripts")
    s.add_argument("--ids", help="inclusive id range, e.g. 45000-46200")
    s.add_argument("--stride", type=int, default=1, help="probe every Nth id from 1..--max-id")
    s.add_argument("--max-id", type=int, default=47_700)
    s.add_argument("--since", default=None, help="keep only rows dated >= (default: keep all)")
    s.add_argument("--rps", type=float, default=4.0)
    s.add_argument("--workers", type=int, default=4)
    s.set_defaults(func=run_pmtranscripts)

    s = sub.add_parser("nsw")
    s.add_argument("--all", action="store_true")
    s.add_argument("--limit", type=int, default=400)
    s.add_argument("--since", default=None)
    s.set_defaults(func=run_nsw)

    s = sub.add_parser("qld")
    s.add_argument("--ids")
    s.add_argument("--stride", type=int, default=1)
    s.add_argument("--max-id", type=int, default=106_000)
    s.add_argument("--since", default=None)
    s.add_argument("--rps", type=float, default=1.0)
    s.add_argument("--workers", type=int, default=2)
    s.set_defaults(func=run_qld)

    s = sub.add_parser("vic")
    s.add_argument("--limit", type=int, default=200)
    s.add_argument("--sitemap-pages", type=int, default=12)
    s.add_argument("--since", default=None)
    s.set_defaults(func=run_vic)

    s = sub.add_parser("treasury")
    s.add_argument("--all", action="store_true")
    s.add_argument("--limit", type=int, default=200)
    s.add_argument("--offset", type=int, default=0)
    s.add_argument("--since", default=None)
    s.set_defaults(func=run_treasury)

    s = sub.add_parser("stats")
    s.set_defaults(func=run_stats)

    s = sub.add_parser("map")
    s.add_argument("--limit", type=int, default=3)
    s.add_argument("--source", default=None)
    s.set_defaults(func=run_map)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
