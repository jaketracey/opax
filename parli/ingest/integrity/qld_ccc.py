"""Queensland Crime and Corruption Commission (CCC, formerly CMC and CJC) public reports.

Source: https://www.ccc.qld.gov.au/publications, a paged listing (10 a page) where each
card carries the CCC's own publication type. In scope:

* every item the CCC files as "Public Reports - Investigations" (its public report series,
  1991 onward, including CJC and CMC reports and public inquiry reports);
* "Research and Intelligence" items the CCC tags or files under Corruption or Corruption
  prevention, less intelligence briefs, conference papers, proceedings and series
  landing pages, plus a short list of CJC/CMC misconduct and integrity research reports
  named in ``RESEARCH_SLUGS``;
* the "Corruption Audits" reports filed under "Corruption Prevention Resources".

Excluded: annual reports, corporate plans, guides, fact sheets, advisories, submissions,
legislative reviews, crime and drug research, and the 1989 Fitzgerald Inquiry report (a
commission of inquiry the CCC hosts, not a CCC report).

The public hearing pages (https://www.ccc.qld.gov.au/public-hearings) are read for the
government response and implementation links the CCC publishes beside a report.

Robots (www.ccc.qld.gov.au, Drupal default) allows /publications, /public-hearings and
/sites/default/files; no Crawl-delay. Requests are paced 3 seconds apart.

Text rules: recommendations are taken only from a contiguous run of numbered
"Recommendation N" headings (the summary list where the report has one), and only when
the run is complete from 1 and every text is verbatim on the cited pages. Section 48B of
the Crime and Corruption Act (from 2025) bars the CCC from findings that a person has or
has not engaged in corruption; recent reports say so, and that statement is recorded as
the report's own "no finding" text. Other reports' outcomes are not extracted.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime
import re
from urllib.parse import urljoin, urlsplit

from parli.ingest.integrity import common

try:
    from bs4 import BeautifulSoup
except ImportError:  # validators import constants only
    BeautifulSoup = None

SITE = "https://www.ccc.qld.gov.au"
LISTING = SITE + "/publications"
HEARINGS = SITE + "/public-hearings"
COPYRIGHT = SITE + "/copyright"

BODY = common.Body(
    code="qld_ccc", name="Crime and Corruption Commission", short="Qld CCC", jurisdiction="Qld",
    site=SITE, interval=3.0, max_requests=700,
    licence={"status": "cc-by-4.0", "url": "https://creativecommons.org/licenses/by/4.0/",
             "attribution": "Crime and Corruption Commission (Queensland)",
             "terms_url": COPYRIGHT,
             "note": "The CCC copyright page licenses its website material under CC BY 4.0 unless otherwise "
                     "noted; individual publications may carry their own copyright details."},
)
MIN_RECORDS = 80
GAPS = [
    "Reports from 1991 to about 2011 are listed on the CCC site but many pages link no report document; "
    "those records carry the page summary only, with findings and recommendations not extracted.",
    "Scanned reports without a text layer are not OCR'd; their findings and recommendations are not extracted.",
    "Findings and opinions are not extracted except where a report states it makes no finding about any "
    "person (section 48B of the Crime and Corruption Act 2001). Pre-2025 reports state outcomes in narrative "
    "form, which is not converted into findings.",
    "Recommendations are extracted only from a complete numbered run; reports that number recommendations "
    "differently, or set them inside narrative chapters only, are marked not_extracted.",
    "Government responses are recorded where the CCC report or public hearing page links one; the "
    "responses themselves (often Queensland Parliament tabled papers or ministerial statements) are "
    "linked, not fetched.",
    "The 1989 Fitzgerald Inquiry report, which the CCC hosts, is a commission of inquiry report and is not "
    "included here.",
]

IN_SCOPE_TYPE = "Public Reports - Investigations"
RESEARCH_TYPE = "Research and Intelligence"
PREVENTION_TYPE = "Corruption Prevention Resources"
RESEARCH_EXCLUDE = re.compile(r"intelligence brief|conference|proceedings|\bseries\b|forum|webcast", re.I)
RESEARCH_SLUGS = {
    "perceptions-misconduct-queensland-correctional-institutions-survey-custodial-officers",
    "setting-standard-review-current-processes-management-police-discipline-and-misconduct-matters",
    "profiling-queensland-public-sector-functions-risks-and-misconduct-resistance-strategies",
    "integrity-queensland-police-service-implementation-and-impact-fitzgerald-inquiry-reforms",
    "report-implementation-fitzgerald-recommendations-relating-criminal-justice-commission",
    "safeguarding-students-minimising-risk-sexual-misconduct-education-queensland-staff",
    "regulation-political-donation-and-gifts-queensland-comparative-analysis",
}
MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December"
TABLED = re.compile(rf"\btabled\b[^.]{{0,60}}?\bon\s+(\d{{1,2}}\s+(?:{MONTHS})\s+\d{{4}})", re.I)
OPERATION = re.compile(r"\b(Operation|Investigation|Taskforce|Project)\s+([A-Z][a-z]+)\b")
REC_MARK = re.compile(r"^\s*Recommendation\s+(\d{1,3})(?![.\d]*\d)\s*(\(p(?:age)?s?\.?\s*[\divxlc]+\))?\s*(?:[:\u2013\u2014-]\s*(.*?)|\.)?\s*$", re.I)
REC_STOP = re.compile(r"^\s*(?:Annexure|Appendix|Attachment|Chapter|Part)\s+[\dA-Z]+\b|^\s*\d{1,3}\.\s*$|^\s*CHAPTER\b")
NO_FINDING = re.compile(
    r"[^.]*(?:\b(?:this|the) report\b[^.]{0,60}?\b(?:makes? no findings?|does not make any findings?)\b|"
    r"\bmakes? no findings? about the conduct or culpability of any person)[^.]*\.", re.I)
RESPONSE_LINK = re.compile(r"government response|response to (?:the )?(?:ccc|cmc|recommendations)|"
                           r"progress report|implementation (?:report|update|of (?:the )?recommendations)", re.I)
BODY_SUFFIX = re.compile(
    r"\b((?:[A-Z][\w'’]*\s+)*?(?:[A-Z][\w'’]*\s+)?(?:City|Shire|Regional)\s+Council|"
    r"Queensland Police Service|QPS|Parole Board Queensland|Queensland Corrective Services|Queensland Prison Service|"
    r"Queensland Prison Industries|University of Queensland|Brisbane City Council|Office of the Speaker|"
    r"Education Queensland|Legal Aid Commission of Queensland|Electoral Commission of Queensland|"
    r"Department of [A-Z][\w ,]+?(?=\s*(?:\(|:|-|–|$|,| and | in )))")
ROLE = re.compile(
    r"\b((?:the\s+)?(?:former\s+)?(?:Mayor of [A-Z]\w+|Chief of Staff to the [A-Z][\w ]+?(?=\s*(?:$|,|:))|"
    r"Premier of Queensland|Children'?s Commissioner|Queensland Information Commissioner|ministerial adviser|"
    r"school principal|Director-General of [A-Z][\w ]+?(?=\s*(?:$|,|:))|Senior Medical Officers))", re.I)


def soup(html):
    return BeautifulSoup(html, "html.parser")


def text_of(node):
    return common.clean(node.get_text(" ", strip=True)) if node else None


def parse_date(value):
    v = common.clean(value)
    if not v:
        return None
    for fmt in ("%d %B %Y", "%d %b %Y"):
        try:
            return datetime.strptime(v, fmt).date().isoformat()
        except ValueError:
            pass
    return None


# ---- listing ----------------------------------------------------------------------------

def parse_listing(html):
    """Cards on one listing page: href, title, CCC type, date, topics, tags."""
    rows = []
    for card in soup(html).select(".results-list.views-row"):
        link = card.select_one(".field--name-node-title a")
        if not link:
            continue
        items = lambda sel: [text_of(x) for x in card.select(sel)]
        rows.append({"href": link["href"], "title": text_of(link),
                     "type": text_of(card.select_one(".field--name-field-publication-type")),
                     "date": text_of(card.select_one(".field--name-field-published-date")),
                     "topics": items(".field--name-field-pub-topics .field__item"),
                     "tags": items(".field--name-field-publica .field__item")})
    return rows


def in_scope(row):
    slug = row["href"].rstrip("/").rsplit("/", 1)[-1]
    if row["type"] == IN_SCOPE_TYPE:
        return True
    if row["type"] == RESEARCH_TYPE:
        if slug in RESEARCH_SLUGS:
            return True
        corruption = "Corruption" in row["tags"] or {"Corruption", "Corruption prevention"} & set(row["topics"])
        return bool(corruption) and not RESEARCH_EXCLUDE.search(row["title"] or "")
    if row["type"] == PREVENTION_TYPE:
        return (row["title"] or "").startswith("Corruption Audits")
    return False


def report_type(row):
    title = row["title"] or ""
    if row["type"] != IN_SCOPE_TYPE:
        return "prevention_research_report"
    if re.match(r"(CCC|CMC|CJC) statement\b", title, re.I):
        return "statement"
    if re.match(r"(Advice of|Response from)\b", title):
        return "other"
    if re.search(r"\binquiry\b|public hearing|hearing into", title, re.I):
        return "public_inquiry_report"
    return "investigation_report"


# ---- report page ------------------------------------------------------------------------

def parse_page(html, url):
    """Summary text, published date, tabled date, report PDFs and response links of one page."""
    s = soup(html)
    main = s.find("main") or s
    art = main.find("article") or main
    body = art.select_one(".field--name-body") or art
    summary = common.clean(" ".join(p.get_text(" ", strip=True) for p in body.find_all(["p", "li"]))) or text_of(body)
    page_text = text_of(art) or ""
    published = None
    m = re.search(r"Date published\s+(\d{1,2}\s+\w+\s+\d{4})", page_text)
    if m:
        published = parse_date(m.group(1))
    tabled = None
    t = TABLED.search(page_text)
    if t:
        tabled = parse_date(t.group(1))
    pdfs, responses, hearings = [], [], []
    # Report files sit in the sidebar's publication-upload field, outside the article.
    uploads = [a for f in s.select(".field--name-field-publication-upload") for a in f.find_all("a", href=True)]
    for a in uploads + art.find_all("a", href=True):
        href = urljoin(url, a["href"].strip())
        label = text_of(a) or ""
        path = urlsplit(href).path.lower()
        if RESPONSE_LINK.search(label):
            responses.append((label, href))
        elif path.endswith(".pdf") and urlsplit(href).hostname == urlsplit(SITE).hostname:
            if href not in [p for _, p in pdfs]:
                pdfs.append((label, href))
        elif path.startswith("/public-hearings/"):
            hearings.append(href)
    return {"summary": summary, "published": published, "tabled": tabled, "pdfs": pdfs,
            "responses": responses, "hearings": hearings, "page_text": page_text}


def parse_hearing(html, url):
    """Response links and the report PDFs / publication pages a public hearing page names."""
    s = soup(html)
    main = s.find("main") or s
    responses, refs = [], set()
    for a in main.find_all("a", href=True):
        href = urljoin(url, a["href"].strip())
        label = text_of(a) or ""
        if RESPONSE_LINK.search(label) and not re.search(r"media statement", label, re.I):
            responses.append((label, href))
        if "/exhibits/" in href.lower():
            continue
        if href.lower().endswith(".pdf") or "/publications/" in href:
            refs.add(href)
    title = text_of(main.find("h1")) or ""
    return {"title": title, "responses": responses, "refs": refs}


# ---- PDF text ---------------------------------------------------------------------------

def _head_key(line):
    """A running head or foot with its page number (leading or trailing) removed."""
    return re.sub(r"^(?:\d{1,4}|[ivxlc]{1,7})\s+|\s+(?:\d{1,4}|[ivxlc]{1,7})$", "", line.lower(), flags=re.I).strip()


def is_contents_page(text):
    """True for a table of contents: many lines that are bare page numbers or end in dot leaders."""
    lines = [x.strip() for x in text.splitlines() if x.strip()]
    hits = sum(1 for x in lines if re.fullmatch(r"\d{1,3}", x) or re.search(r"\.{3,}\s*\d{1,3}$", x))
    return len(lines) >= 10 and hits >= 5 and hits >= 0.25 * len(lines)


HEADING_LINE = re.compile(r"^(?!That\b|The\b|[•(\-–\d])[A-Z][^.?!;:,]*$")
TERMINAL = re.compile(r"[.?!;]\W{0,2}$")
CLOSING = re.compile(r"^(?:In\s|The foregoing\b|(?:These|The above) recommendations\b|"
                     r"The (?:Commission|CMC|CCC|CJC)(?:’s recommendations| (?:believes|has|considers|is|will|notes|commends))\b)")
NEW_PARAGRAPH = re.compile(r"^(?!That\b)[A-Z][a-z]")


def strip_headers(pages):
    """Drop running heads and page numbers from the top and bottom of each page.

    A line is a running head when it is a bare page number (arabic or roman) or when the
    same line opens at least a fifth of the pages. Returns one list of lines per page.
    """
    tops = Counter()
    split = []
    for p in pages:
        lines = [common.clean(x) for x in p.splitlines()]
        lines = [x for x in lines if x]
        split.append(lines)
        for x in set(lines[:4] + lines[-4:]):
            tops[_head_key(x)] += 1
    limit = max(3, len(pages) // 5)
    # A long line (four or more words) repeated at the top or foot of three pages is a running
    # head even in a long report where the head changes by chapter. Headings never count.
    heads = {k for k, v in tops.items()
             if k and not REC_MARK.match(k) and (v >= limit or (v >= 3 and len(k.split()) >= 4))}
    pagenum = re.compile(r"^(?:\d{1,4}|[ivxlc]{1,7}|page \d+(?: of \d+)?)$", re.I)
    out = []
    for lines in split:
        i = 0
        while i < min(len(lines), 5) and (pagenum.match(lines[i]) or _head_key(lines[i]) in heads):
            i += 1
        j = len(lines)
        while j > i and len(lines) - j < 5 and (pagenum.match(lines[j - 1]) or _head_key(lines[j - 1]) in heads):
            j -= 1
        out.append(lines[i:j])
    return out


def parse_recommendations(pages, max_chars=3000):
    """Numbered recommendations from the first complete contiguous run of headings.

    Returns (list of (number, text, start_page, end_page), reason). The run must start at
    1 and go up by one; each text ends at the next heading, at a stop heading, or (for the
    last one) at the end of its page unless the next page continues it.
    """
    lines = strip_headers(pages)
    marks = []  # (page index, line index, number, has page ref)
    for pi, ls in enumerate(lines):
        if is_contents_page(pages[pi]):
            continue
        for li, ln in enumerate(ls):
            m = REC_MARK.match(ln)
            if m:
                marks.append((pi, li, int(m.group(1)), bool(m.group(2)), common.clean(m.group(3))))
    if not marks:
        return [], "no numbered recommendation headings"
    # Prefer the summary list (headings carrying a page reference), else the first run from 1.
    pool = [m for m in marks if m[3]] or marks
    runs, current = [], []
    for m in pool:
        if m[2] == 1:
            if current:
                runs.append(current)
            current = [m]
        elif current and m[2] == current[-1][2] + 1:
            current.append(m)
        elif current and m[2] == current[-1][2]:
            continue  # the same number repeated mid-list (a cross-reference) is ignored
        elif current:
            runs.append(current)
            current = []
    if current:
        runs.append(current)
    if not runs:
        return [], "no run starting at Recommendation 1"
    run = max(runs, key=len)
    out = []
    for k, (pi, li, number, _, lead) in enumerate(run):
        nxt = run[k + 1] if k + 1 < len(run) else None
        if nxt and nxt[0] - pi > 2:
            return [], f"Recommendation {number} and {nxt[2]} are more than two pages apart"
        collected, page, idx, end_page = ([lead] if lead else []), pi, li + 1, pi
        while True:
            if page >= len(lines):
                break
            if idx >= len(lines[page]):
                if nxt is None:
                    following = lines[page + 1] if page + 1 < len(lines) else []
                    if not following or not re.match(r"^[a-z(•\-–]", following[0]):
                        break
                elif page >= nxt[0]:
                    break
                page, idx = page + 1, 0
                continue
            if nxt and page == nxt[0] and idx == nxt[1]:
                break
            line = lines[page][idx]
            if REC_STOP.match(line) or (nxt is None and REC_MARK.match(line)):
                break
            prev = next((x for x in reversed(collected) if x not in ("•", "-", "–")), "")
            if prev and TERMINAL.search(prev):
                # A short unpunctuated heading after a finished sentence opens a new section;
                # after the last recommendation, a closing paragraph of the report does too.
                if (HEADING_LINE.match(line) and len(line.split()) <= 7) or (nxt is None and CLOSING.match(line)):
                    break
                # After the last recommendation there is no next heading to stop at, so a new
                # paragraph (a short closing line, then a capitalised sentence) ends it.
                widths = sorted(len(x) for x in lines[page] if len(x) > 20)
                if (nxt is None and widths and NEW_PARAGRAPH.match(line) and prev.endswith(".")
                        and collected[-1] == prev and len(prev) < 0.75 * widths[len(widths) // 2]):
                    break
            collected.append(line)
            end_page = page
            idx += 1
        while collected and collected[-1] in ("•", "-", "–"):
            collected.pop()
        text = common.clean(" ".join(collected))
        if not text or len(text) < 15:
            return [], f"Recommendation {number} has no text"
        if text.endswith(":"):
            return [], f"Recommendation {number} ends in a colon (its numbered body is set out separately)"
        if len(text) > max_chars:
            return [], f"Recommendation {number} runs past {max_chars} characters (no clear end)"
        out.append((str(number), text, pi + 1, end_page + 1))
    return out, None


def page_source(pages, start, end):
    """Header-stripped text of physical pages start..end (1-based, inclusive) as one string."""
    lines = strip_headers(pages)
    return " ".join(" ".join(lines[i]) for i in range(start - 1, min(end, len(lines))))


def no_finding_statements(pages):
    """Sentences in which the report states it makes no finding (first one, with its page)."""
    for i, p in enumerate(pages):
        text = common.flat(p)
        m = NO_FINDING.search(text)
        if m:
            sentence = common.clean(m.group(0))
            # Keep the sentence only when it is the report's own statement about this report.
            # A statement of the law ("the CCC must not make any finding") is not the report's own statement.
            if not re.search(r"\bmust not\b", sentence, re.I):
                return sentence, i + 1, text
    return None


# ---- subjects ---------------------------------------------------------------------------

def subjects_from(title, page_url):
    """Agencies and public roles named in the report title, as the title names them."""
    out, seen = [], set()
    c = common.cite(page_url, "CCC publication page", section="title")
    for m in BODY_SUFFIX.finditer(title or ""):
        name = m.group(1).strip()
        name = "Queensland Police Service" if name in ("QPS",) else name
        name = re.sub(r"^(?:the|The|of|Lessons learned from an investigation into)\s+", "", name)
        if name.lower() not in seen and len(name) > 4:
            seen.add(name.lower())
            out.append(common.subject(name, "body", c))
    for m in ROLE.finditer(title or ""):
        name = re.sub(r"^the\s+", "", m.group(1).strip(), flags=re.I)
        if name.lower() not in seen:
            seen.add(name.lower())
            out.append(common.subject(name, "public_role", c))
    return out


# ---- collect ----------------------------------------------------------------------------

def listing_rows(client):
    rows, seen = [], set()
    for page in range(0, 80):
        html = client.html(f"{LISTING}?page={page}")
        if html is None:
            break
        batch = parse_listing(html)
        if not batch:
            break
        new = [r for r in batch if r["href"] not in seen]
        if not new:
            break
        seen.update(r["href"] for r in new)
        rows.extend(new)
    if not rows:
        raise common.Held("CCC publications listing returned no cards")
    first = client.html(LISTING) or ""
    m = re.search(r"Displaying search results \d+\s*-\s*\d+ of (\d+)", first)
    if m and len(rows) < int(m.group(1)):
        raise common.Held(f"CCC listing incomplete: {len(rows)} of {m.group(1)} cards")
    return rows


def hearing_index(client):
    pages = []
    for page in range(0, 20):
        html = client.html(f"{HEARINGS}?page={page}")
        if html is None:
            break
        links = sorted({urljoin(HEARINGS, a["href"]) for a in soup(html).select(".views-row a[href], h2 a[href], h3 a[href]")
                        if urlsplit(urljoin(HEARINGS, a["href"])).path.startswith("/public-hearings/")})
        new = [u for u in links if u not in pages]
        if not new:
            break
        pages.extend(new)
    out = []
    for url in pages:
        html = client.html(url)
        if html:
            h = parse_hearing(html, url)
            h["url"] = url
            out.append(h)
    return out


def build_record(row, page, client, hearings):
    url = urljoin(SITE, row["href"])
    title = row["title"]
    rtype = report_type(row)
    op = OPERATION.search(title or "")
    operation = f"{op.group(1)} {op.group(2)}" if op and op.group(2) not in ("Report",) else None
    if page["tabled"]:
        date, basis = page["tabled"], "tabled"
    else:
        date, basis = page["published"] or parse_date(row["date"]), "published"
    if date is None:
        basis = None
    notes, documents = [], []
    pdf_url = None
    findings, f_status = [], "not_extracted"
    recs, r_status = [], "not_extracted"
    report_pdfs = [(l, h) for l, h in page["pdfs"] if not re.search(r"summary|fact ?sheet|terms of reference|guideline", l + " " + h, re.I)]
    for label, href in page["pdfs"]:
        role = "report" if (label, href) in report_pdfs[:1] else (
            "summary" if re.search(r"summary", label + href, re.I) else "volume" if (label, href) in report_pdfs else "other")
        data = client.get(href, "pdf")
        if data is None:
            documents.append(common.document(role, label or title, href, status="unavailable"))
            notes.append(f"Linked document {href} could not be retrieved as a PDF.")
            continue
        pages_text = common.pdf_pages(data)
        documents.append(common.document(role, label or title, href, data, len(pages_text)))
        if role != "report":
            continue
        pdf_url = href
        if sum(len(p.strip()) for p in pages_text) < 100 * max(1, len(pages_text)):
            notes.append("The report PDF has little or no text layer; nothing was extracted.")
            continue
        found, reason = parse_recommendations(pages_text)
        if found:
            try:
                for number, text, start, end in found:
                    recs.append(common.recommendation(number, text, common.cite(href, title, start),
                                                      page_source(pages_text, start, end)))
                r_status = "extracted"
            except ValueError as exc:
                recs, r_status = [], "not_extracted"
                notes.append(f"Recommendations not extracted: {exc}")
        elif reason and reason != "no numbered recommendation headings":
            notes.append(f"Recommendations not extracted: {reason}.")
        nf = no_finding_statements(pages_text)
        if nf:
            sentence, pno, source = nf
            findings.append(common.finding("No finding", "no_finding", sentence, common.cite(href, title, pno), source))
            f_status = "extracted"
    if not page["pdfs"]:
        notes.append("The CCC page links no report document; only the page summary is recorded.")
    responses = []
    seen_resp = set()
    sources = [(page["responses"], url, "CCC publication page")]
    op_word = operation.split()[-1].lower() if operation else None
    for h in hearings:
        slug_words = set(urlsplit(h["url"]).path.rsplit("/", 1)[-1].split("-"))
        if (url in h["refs"] or any(d["url"] in h["refs"] for d in documents)
                or (op_word and op_word in slug_words and op_word not in ("investigation", "inquiry"))):
            sources.append((h["responses"], h["url"], "CCC public hearing page"))
    for links, src, where in sources:
        for label, href in links:
            key = re.sub(r"\W+", " ", label.lower()).strip()[:60]
            if href in seen_resp or key in seen_resp:
                continue  # the same response linked twice (one CCC page links it under two URLs)
            seen_resp.update((href, key))
            kind = "progress_report" if re.search(r"progress", label, re.I) else (
                "implementation_report" if re.search(r"implementation", label, re.I) else "agency_response")
            responses.append(common.response(kind, label, href, citation=common.cite(src, where)))
    if recs and any(k in url for k in COMMENTARY_BETWEEN_ITEMS):
        recs, r_status = [], "not_extracted"
        notes.append("Recommendations not extracted: in this report the commentary paragraphs sit between the numbered "
                     "recommendations and cannot be separated from them reliably.")
    return common.report_record(
        BODY, title=title, page_url=url, report_type=rtype, type_as_published=row["type"],
        date=date, date_basis=basis, operation=operation, pdf_url=pdf_url, documents=documents,
        subjects=subjects_from(title, url), findings=findings, findings_status=f_status,
        recommendations=recs, recommendations_status=r_status, responses=responses,
        responses_status="published" if responses else "none_found", notes=notes,
        summary=page["summary"], key=row["href"].rstrip("/").rsplit("/", 1)[-1])


# Summary-style layouts where the report's commentary follows each numbered recommendation
# (spot-checked against the PDFs): the boundary cannot be drawn without guessing.
COMMENTARY_BETWEEN_ITEMS = ("alleged-misuse-public-monies", "forensics-under-microscope")


def collect(client):
    rows = [r for r in listing_rows(client) if in_scope(r)]
    hearings = hearing_index(client)
    records = []
    for row in rows:
        url = urljoin(SITE, row["href"])
        html = client.html(url)
        if html is None:
            continue
        records.append(build_record(row, parse_page(html, url), client, hearings))
    return records
