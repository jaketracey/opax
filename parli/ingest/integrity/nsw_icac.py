"""NSW Independent Commission Against Corruption: investigation and research reports.

Sources (www.icac.nsw.gov.au; robots.txt disallows only /reports and /complaint):

* /investigations/past-investigations?PagingModule=668&Pg=N lists every investigation
  with a page on the current site (2010 onwards), with the date each report was made
  public. Each investigation page links the full report (one or more volumes), often a
  separate corruption prevention recommendations PDF, and agency action plans and
  progress reports under "Responses to ICAC recommendations".
* /investigations/investigation-reports lists the report PDFs with their own titles.
* /investigations/past-investigations/pre-2016 keeps a summary of every older
  investigation (1989 to 2015). The ICAC says those reports are no longer online; only
  its summary is held, and findings and recommendations stay not_extracted.
* /prevention/corruption-prevention-publications lists the ICAC's prevention material;
  only research, survey, position and issues reports are taken (guides, tip sheets,
  tools, sample policies, flyers and translations are left out).

Findings come from the report PDF's summary chapter (the pages before Chapter 2), read
in column order, as the report states them: the finding statement ("The Commission finds
that ... engaged in serious corrupt conduct ...") with its particulars when the list ends
on the same page, s 74A(2) statements on obtaining the DPP's advice, s 74A(2) statements
on disciplinary action, and statements that no corrupt conduct finding is made. The
investigation web page paraphrases findings (it can omit "serious"), so it is not used
for finding text. Recommendations come from the separate recommendations PDF when the
ICAC publishes one, else from numbered recommendations on the investigation page,
located in the report where possible; otherwise not_extracted.

Licence: the ICAC copyright statement reserves all rights (fair dealing aside), so
records keep short verbatim passages with links and attribution.
"""
from __future__ import annotations

from datetime import datetime
import hashlib
import json
import re
from urllib.parse import urljoin

from parli.ingest.integrity import common

SITE = "https://www.icac.nsw.gov.au"
PAST = SITE + "/investigations/past-investigations"
PAGED = PAST + "?PagingModule=668&Pg={}"
PRE2016 = PAST + "/pre-2016"
REPORTS = SITE + "/investigations/investigation-reports"
PREVENTION = SITE + "/prevention/corruption-prevention-publications"
COPYRIGHT = SITE + "/copyright/copyright"

BODY = common.Body(
    code="nsw_icac", name="Independent Commission Against Corruption", short="NSW ICAC", jurisdiction="NSW",
    site=SITE, interval=3.0, max_requests=700,
    licence={"status": "copyright, all rights reserved",
             "url": COPYRIGHT,
             "attribution": "NSW Independent Commission Against Corruption (ICAC). ICAC materials are protected by "
                            "copyright and all rights are reserved; OPAX keeps short verbatim passages with links to "
                            "the original and the ICAC's copyright notice."},
)
GAPS = [
    "Reports on investigations made public before 2016 are not online: the ICAC keeps only a summary for each, "
    "and copies must be requested from the ICAC. Those records hold the ICAC's published summary; findings and "
    "recommendations are not extracted.",
    "The ICAC copyright statement reserves all rights (fair dealing aside). OPAX keeps short verbatim finding and "
    "recommendation passages with links to the original report.",
    "Findings are read from the summary chapter of each report PDF. Where a finding's particulars run past the "
    "cited page only the finding statement is kept, and reports whose layout could not be read confidently are "
    "marked not_extracted.",
    "Agency action plans and progress reports are listed as documents; their contents (implementation status for "
    "each recommendation) are not parsed.",
    "Report PDFs without a text layer (scanned images, for example Operation Scania) are not OCRed; their findings "
    "stay not_extracted.",
    "Many pre-2016 summaries give only the month a report was made public; those records carry no date and a note "
    "with the month, because the schema holds day-level dates only.",
]
MIN_RECORDS = 100
MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
NO_ONLINE = "The ICAC lists this report as no longer available online; OPAX holds the ICAC's published summary only."

try:
    from bs4 import BeautifulSoup
except ImportError:  # pragma: no cover
    BeautifulSoup = None


# ---- small helpers ------------------------------------------------------------------------

def parse_date(text):
    """'28 Aug 2026' or '17 December 2015' -> ISO date, else None."""
    m = re.search(r"\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b", text or "")
    if not m:
        return None
    month = MONTHS.get(m.group(2)[:3].lower())
    if not month:
        return None
    try:
        return datetime(int(m.group(3)), month, int(m.group(1))).date().isoformat()
    except ValueError:
        return None


def operation_of(text):
    m = re.search(r"\b(Operations?\s+[A-Z][A-Za-z\-]+(?:\s+(?:and|&)\s+[A-Z][A-Za-z\-]+)?)", text or "")
    if not m:
        return None
    return re.sub(r"\s+", " ", m.group(1).replace("-", " ") if "Operation-" in m.group(1) else m.group(1))


def op_key(text):
    op = operation_of(text)
    return op.lower().split()[1] if op else None


def soup(html):
    return BeautifulSoup(html, "html.parser")


def leaf_blocks(node):
    """Leaf block elements (no nested blocks) in document order: (tag, text, element)."""
    out = []
    for el in node.find_all(["h1", "h2", "h3", "h4", "p", "li", "div"]):
        if el.find(["p", "div", "h2", "h3", "h4", "li"]):
            continue
        t = common.clean(el.get_text(" ", strip=True))
        if t:
            out.append((el.name, t, el))
    return out


# ---- subjects -----------------------------------------------------------------------------

ROLE_WORDS = re.compile(r"\b(former|then|chief|manager|officer|officers|official|officials|councillors?|mayor|director|directors|"
                        r"employee|employees|staff|MP|member|members|coordinator|CEO|chancellor|engineer|board|"
                        r"secretary|minister|premier|commissioner|executive|inspector|supervisor)\b", re.I)
NOT_ROLE = re.compile(r"^(?:others|and others|contractors?|suppliers?|associates?|companies|company|developers?)$", re.I)
JOIN_SPLIT = re.compile(r"\s+and\s+(?=(?:the\s+)?(?:Department|Transport for NSW|NSW Health|Inner West))|/")
PERSONAL = re.compile(r"\b(?:Mr|Ms|Mrs|Dr|Hon)\b")
ROLE_NOT_CONDUCT = re.compile(r"\b(?:dishonest\w*|partial\w*|exercis\w*|functions?|assault\w*|breach\w*|corrupt\w*|misus\w*|"
                              r"alleg\w*|improper\w*|dealings?|in relation to|conduct)\b", re.I)
BODY_WORD = re.compile(r"(?:council|department|authorit|service|board|universit|unsw|office|commission|corporation|tafe|police|"
                       r"parliament|assembly|government|maritime|rail|ferries|water|energy|electricity|grid|workcover|health|"
                       r"brigade|squad|institute|lalc|organisations|agencies|management|nsw|fair trading|medicine)", re.I)


def subjects_from_title(h1, citation):
    """Bodies and public roles as an investigation page title names them.

    Titles read '<body or office> – allegations concerning <roles> (Operation X)'. The
    head is a body unless it names an office (an MP or member). Role phrases are kept only
    when they name a public office or position; private parties ('others', contractors,
    suppliers) and anything with a personal title are left out.
    """
    t = common.clean(h1) or ""
    t = re.sub(r"\s*\((?:Operations?)[^)]*\)\s*$", "", t)
    parts = re.split(r"\s+[\u2013\u2014-]\s+", t, maxsplit=1)
    head, rest = parts[0], (parts[1] if len(parts) > 1 else "")
    out = []
    if not re.match(r"^(?:investigation|report|lobbying|political donations|NSW Government|NSW public sector)\b", head, re.I) or \
            re.match(r"^NSW Government$", head):
        for name in JOIN_SPLIT.split(head):
            name = common.clean(name)
            name = re.sub(r"\s+and\s+others$", "", name or "")
            if not name or PERSONAL.search(name) or not BODY_WORD.search(name):
                continue  # not an institution (for example a private person named in the heading)
            kind = "public_role" if re.search(r"\b(MP|Member for|Member of Parliament|Minister|Premier)\b", name) else "body"
            out.append(common.subject(name, kind, citation))
    m = re.search(r"\bconcerning\s+(?:the\s+)?(.+)$", rest, re.I)
    if m:
        for piece in re.split(r",\s*|\s+and\s+", m.group(1)):
            piece = common.clean(re.sub(r"^(?:the\s+)?conduct\s+of\s+(?:the\s+|a\s+)?", "", piece or "", flags=re.I))
            if not piece or NOT_ROLE.match(piece) or PERSONAL.search(piece) or not ROLE_WORDS.search(piece):
                continue
            if re.search(r"\b(?:payments?|contracts?|refurbishment|recruitment|supply|awarding|software|funds)\b", piece, re.I):
                continue
            if len(piece.split()) > 8 or ROLE_NOT_CONDUCT.search(piece):
                continue  # a description of conduct, not the name of a position
            out.append(common.subject(piece, "public_role", citation))
    seen, uniq = set(), []
    for s in out:
        if s["name"].lower() not in seen:
            seen.add(s["name"].lower())
            uniq.append(s)
    return uniq


# ---- PDF text in column order ------------------------------------------------------------

def column_pages(data: bytes):
    """Per-page text in reading order for the ICAC's two-column layout.

    Text blocks spanning the page come first (running heads), then the left column, then
    the right column, each top to bottom. Cached by content hash beside common's text cache.
    Returns None when no text layer could be read.
    """
    digest = hashlib.sha256(data).hexdigest()
    path = common.CACHE / "text" / (digest + "-columns.json")
    if path.exists():
        return json.loads(path.read_text())
    try:
        import pymupdf
    except ImportError:  # pragma: no cover
        return None
    pages = []
    try:
        with pymupdf.open(stream=data, filetype="pdf") as doc:
            for page in doc:
                width = page.rect.width
                blocks = [b for b in page.get_text("blocks") if b[6] == 0 and b[4].strip()]
                full, left, right = [], [], []
                for b in blocks:
                    x0, x1 = b[0], b[2]
                    (left if x1 <= width * 0.53 else right if x0 >= width * 0.47 else full).append(b)
                ordered = sorted(full, key=lambda b: b[1]) + sorted(left, key=lambda b: b[1]) + sorted(right, key=lambda b: b[1])
                pages.append("\n".join(b[4].strip() for b in ordered))
    except Exception:  # noqa: BLE001 - unreadable PDF: not extracted
        return None
    common.atomic_json(path, pages)
    return pages


def lines_of(page_text):
    """Lines with lone bullet markers merged into the text that follows them."""
    raw = [l.strip() for l in (page_text or "").splitlines()]
    out, pending = [], None
    for l in raw:
        if not l:
            continue
        if l in ("•", "–", "-", "◦", "▪"):
            pending = l
            continue
        if pending:
            l = pending + " " + l
            pending = None
        out.append(l)
    return out


def summary_page_range(pages):
    """Indexes of the summary chapter: pages before the first page headed Chapter 2."""
    for i, p in enumerate(pages):
        head = "\n".join(p.splitlines()[:6])
        if i > 2 and re.search(r"\bCHAPTER\s+2\b|\bChapter\s+2\s*:", head):
            return range(0, i)
    return range(0, min(len(pages), 30))


BULLET = re.compile(r"^(?:•|–|-|◦|▪|\(?[a-z]\)|\(?[ivx]+\)|\d+\.)\s")
TERMINAL = re.compile(r"[.;]$")
STOP = re.compile(r"^(?:The Commission|The ICAC|Section 74A|Corrupt conduct|Recommendation|RECOMMENDATION|CHAPTER|Chapter \d|"
                  r"Findings?\b|Statements?\b|No corrupt conduct)")  # case-sensitive: "the Commission" mid-item is a continuation
NAME_LINE = re.compile(r"^(?:(?:Mr|Ms|Mrs|Dr|The Hon|Councillor)\s+)?[A-Z][A-Za-z'’\-]+(?:\s+[A-Z][A-Za-z'’\-]+){0,4}$")

FINDING_LEAD = re.compile(r"^(?:The Commission|The ICAC)\s+(?:also\s+)?(?:(?:has|had)\s+(?:also\s+)?)?(?:finds|found|makes|made|"
                          r"(?:is|was)\s+(?:also\s+)?satisfied)\b", re.I)
NO_FINDING_LEAD = re.compile(r"^(?:(?:The Commission|The ICAC)\s+(?:does not|did not|makes no|made no|is not satisfied|has not|was not satisfied|is unable)\b|"
                             r"No (?:adverse )?findings? of (?:serious )?corrupt conduct\b|This report (?:contains|makes) no findings?\b)", re.I)
ORDINAL_LEAD = re.compile(r"^(?:First|Secondly|Second|Thirdly|Third|Fourthly|Fifthly|Sixthly|Seventhly|Eighthly|Ninthly|Tenthly|"
                          r"Further|Finally|Lastly),\s", re.I)  # "The Commission is satisfied of a number of matters ... First, that ..."
DPP_LEAD = re.compile(r"^(?:The Commission|The ICAC)\s+is\s+(?:also\s+)?(?:not\s+)?of the opinion that\b", re.I)


SENTENCE_END = re.compile(r"[.:](?=\s+[A-Z(\u201c\"\u2022])|[.:]$")


def take_sentence(lines, i, limit=40):
    """The sentence starting at line i, joined across lines and cut at its first full stop or colon.

    Returns (text, next line index, ends_at_line_end). Text without an ending inside the
    limit is returned unended, which callers treat as not confidently bounded.
    """
    text, j = "", i
    while j < len(lines) and j < i + limit:
        text = (text + " " + lines[j]).strip()
        j += 1
        m = SENTENCE_END.search(text)
        if m:
            return text[:m.end()], j, m.end() == len(text)
    return text, j, False


def starts_sentence(previous_line):
    """True when the line before a candidate lead closes a sentence or is a short heading."""
    return bool(re.search(r"[.:;)\u201d\"]$", previous_line)) or len(previous_line) <= 40 or not re.search(r"[a-z,]$", previous_line)


def take_list(lines, j, allow_names=False):
    """Bullet list after a lead ending in ':'. Returns (lines taken, next index, clean end)."""
    taken, open_item = [], False
    while j < len(lines):
        l = lines[j]
        prev_done = not taken or bool(TERMINAL.search(taken[-1])) or taken[-1].endswith(":")
        if BULLET.match(l):
            taken.append(l); open_item = True
        elif allow_names and NAME_LINE.match(l) and j + 1 < len(lines) and BULLET.match(lines[j + 1]) and not STOP.match(l):
            taken.append(l)
        elif open_item and (not prev_done or l[:1].islower()) and not STOP.match(l):
            taken.append(l)
        else:
            break
        j += 1
    clean_end = bool(taken) and bool(TERMINAL.search(taken[-1])) and j < len(lines)
    return taken, j, clean_end


ENGAGED = re.compile(r"\bengag(?:e|ed|ing)\s+in\s+(?:serious\s+)?corrupt conduct\b", re.I)
NONE_FOUND = re.compile(r"\bno\s+(?:adverse\s+)?findings?\s+of\s+(?:serious\s+)?corrupt conduct\b|"
                        r"\bnot\s+engag(?:e|ed)\s+in\s+(?:serious\s+)?corrupt conduct\b|"
                        r"\bnot satisfied that .{0,200}engaged in\s+(?:serious\s+)?corrupt conduct\b", re.I)


def classify(lead):
    """(label, kind) for a statement as the report words it, or None to skip.

    A finding must say that someone engaged in (serious) corrupt conduct; a no-finding
    must say that no finding was made or that someone did not engage in it. General
    propositions (for example that a practice can be corrupt) are neither.
    """
    low = lead.lower()
    if DPP_LEAD.match(lead):
        if re.search(r"director of public prosecutions|\bdpp\b|disciplinary|dismissal|action against|civic office", low):
            return "Section 74A(2) statement", "prosecution_statement"
        return None
    label = "serious corrupt conduct" if "serious corrupt conduct" in low else "corrupt conduct"
    if NO_FINDING_LEAD.match(lead):
        return (label, "no_finding") if NONE_FOUND.search(lead) else None
    if re.search(r"\bwhether\b|\balleg", lead, re.I):
        return None  # an allegation or a question, never a finding
    if FINDING_LEAD.match(lead):
        if NONE_FOUND.search(lead):
            return label, "no_finding"
        if ENGAGED.search(lead):
            return label, "finding"
    if ORDINAL_LEAD.match(lead) and ENGAGED.search(lead) and not NONE_FOUND.search(lead):
        return label, "finding"
    return None


def findings_from_pages(pages, pdf_url, doc_title):
    """Findings and s 74A(2) statements from the summary chapter, verbatim, one per statement."""
    out, seen = [], set()
    for i in summary_page_range(pages):
        lines = lines_of(pages[i])
        page_flat = common.flat(pages[i])
        j = 0
        while j < len(lines):
            line = lines[j] + (" " + lines[j + 1] if j + 1 < len(lines) else "")  # leads wrap in narrow columns
            if not (FINDING_LEAD.match(line) or NO_FINDING_LEAD.match(line) or DPP_LEAD.match(line) or ORDINAL_LEAD.match(line)):
                j += 1
                continue
            if j and not starts_sentence(lines[j - 1]):
                j += 1  # the lead words continue an earlier sentence: not a statement on their own
                continue
            lead, k, at_line_end = take_sentence(lines, j)
            kind = classify(lead)
            if not kind:
                j = k
                continue
            label, fkind = kind
            text = lead
            if lead.endswith(":"):
                if at_line_end:
                    items, k2, clean_end = take_list(lines, k, allow_names=fkind == "prosecution_statement")
                    if items and clean_end:
                        text = " ".join([lead] + items)
                        k = k2
            elif not lead.endswith("."):
                text = None  # sentence runs past the page: not confidently bounded
            if text:
                key = re.sub(r"\W+", " ", text.lower()).strip()
                if key not in seen and common.verbatim(text, page_flat):
                    seen.add(key)
                    out.append(common.finding(label, fkind, text, common.cite(pdf_url, doc_title, page=i + 1,
                                              section="Summary of investigation and outcomes"), pages[i]))
            j = max(k, j + 1)
    return out


# ---- recommendations ------------------------------------------------------------------------

REC_HEAD = re.compile(r"^RECOMMENDATION\s+(\d+)\s*$", re.I)
PAGE_NOISE = re.compile(r"^(?:UNCLASSIFIED|OFFICIAL|OFFICIAL: Sensitive|Page \d+( of \d+)?|\d+)$", re.I)


def _is_heading(line):
    t = line.strip()
    return 0 < len(t) <= 60 and t[:1].isupper() and not re.search(r"[.;:,]$", t) and not t.startswith(("•", "-", "\u2013"))


FOOTER = re.compile(r"^(?:Media Releases\b|Action plan\b|Plan of action\b|Responses? to\b.{0,40}recommendations|"
                    r"Final report\b|Progress report\b|\d+[ -]months? progress report\b|Implementation report\b)", re.I)


def recommendations_from_pdf(pages, url, doc_title):
    """Numbered recommendations from a single-column recommendations PDF.

    Each runs from its RECOMMENDATION heading to the next heading (or the end of the
    document), across at most one page break; running heads are dropped. Text is
    verified against the cleaned text of the start page and the next page.
    """
    cleaned = [[l for l in (p or "").splitlines() if l.strip() and not PAGE_NOISE.match(l.strip())] for p in pages]
    heads = [(pi, li, int(m.group(1))) for pi, ls in enumerate(cleaned) for li, l in enumerate(ls)
             if (m := REC_HEAD.match(l.strip()))]
    out = []
    numbers = [h[2] for h in heads]
    if not heads or numbers != list(range(1, len(numbers) + 1)):
        return []
    for n, (pi, li, num) in enumerate(heads):
        end = heads[n + 1] if n + 1 < len(heads) else (len(cleaned) - 1, len(cleaned[-1]), None)
        if end[0] - pi > 1:
            return []  # a recommendation spanning more than two pages: not bounded confidently
        if end[0] == pi:
            body = cleaned[pi][li + 1:end[1]]
        else:
            body = cleaned[pi][li + 1:] + cleaned[end[0]][:end[1]]
        # a section heading printed just before the next RECOMMENDATION heading is not part of this one
        while len(body) > 1 and _is_heading(body[-1]) and re.search(r"[.;:]\s*$", body[-2]):
            body = body[:-1]
        text = "\n".join(body)
        if n + 1 == len(heads):
            text = re.split(r"\n(?:Further information|For more information|Contact|ENDS)\b", text)[0]
        source = "\n".join(cleaned[pi] + (cleaned[pi + 1] if pi + 1 < len(cleaned) else []))
        if not common.flat(text):
            return []
        out.append(common.recommendation(num, text, common.cite(url, doc_title, page=pi + 1), source))
    return out


def recommendations_from_html(section_blocks, page_url, page_title, report_pages, pdf_url, report_title):
    """'Recommendation N' headings on the investigation page with the text that follows each."""
    recs, current = [], None
    for tag, text, _ in section_blocks:
        m = re.match(r"^Recommendation\s+(\d+)\s*$", text, re.I)
        if m:
            current = [int(m.group(1)), []]
            recs.append(current)
        elif current is not None:
            if FOOTER.match(text):  # response links and the page's media/transcripts panel follow the last one
                current = None
                continue
            current[1].append(text)
    if not recs or [r[0] for r in recs] != list(range(1, len(recs) + 1)) or any(not r[1] for r in recs):
        return []
    section_text = "\n".join(t for _, t, _ in section_blocks)
    out = []
    for num, parts in recs:
        text = " ".join(parts)
        located = None
        if report_pages:
            for pi in range(len(report_pages)):
                window = report_pages[pi] + "\n" + (report_pages[pi + 1] if pi + 1 < len(report_pages) else "")
                if common.verbatim(text, window):
                    located = (pi, window)
                    break
        if located:
            out.append(common.recommendation(num, text, common.cite(pdf_url, report_title, page=located[0] + 1), located[1]))
        else:
            out.append(common.recommendation(num, text, common.cite(page_url, page_title, section="Recommendations for corruption prevention"),
                                             section_text))
    return out


# ---- investigation pages ------------------------------------------------------------------------

SKIP_DOC = re.compile(r"exhibit|transcript|witness|media|ruling|protocol|guideline|brochure|fact ?sheet|submission|"
                      r"hearing brief|annual report|section 11|notice|interim paper|forum|panel", re.I)


def response_kind(title):
    t = title.lower()
    if re.search(r"progress|update|implementation report|\d+\s*month", t):
        return "progress_report"
    if re.search(r"action plan|plan of action", t):
        return "action_plan"
    if "implementation" in t:
        return "implementation_report"
    if "response" in t:
        return "agency_response"
    return "other"


def parse_listing(html):
    """Entries on a past-investigations listing page: (href, date, text)."""
    s = soup(html)
    art = s.find("article") or s
    out = []
    for a in art.find_all("a", href=True):
        href = a["href"]
        if "/investigations/past-investigations/" in href and href.count("/") >= 5 and "pre-2016" not in href:
            text = common.clean(a.get_text(" ", strip=True)) or ""
            out.append((urljoin(SITE, href), parse_date(text[:20]), text))
    return out


def parse_report_widget(html):
    """PDF href -> (title, date) from the investigation reports listing."""
    s = soup(html)
    out = {}
    for a in s.select("a.document[href]"):
        href = urljoin(SITE, a["href"])
        if "ArticleDocuments" not in href:
            continue
        day = a.select_one("[class$=ItemDateDay]")
        mon = a.select_one("[class$=ItemDateMonth]")
        yr = a.select_one("[class$=ItemDateYear]")
        date = parse_date(f"{day.get_text(strip=True)} {mon.get_text(strip=True)} {yr.get_text(strip=True)}") if day and mon and yr else None
        title = common.clean((a.find("h3") or a).get_text(" ", strip=True)) or common.clean(a.get("title"))
        out[common._quote(href)] = (title, date)
    return out


def sections(art):
    """Heading text -> leaf blocks under it (until the next h2/h3)."""
    out, current = {}, None
    for tag, text, el in leaf_blocks(art):
        if tag in ("h2", "h3"):
            current = text
            out.setdefault(current, [])
        elif current is not None:
            out[current].append((tag, text, el))
    return out


TAB_LINK = re.compile(r"^#(?:media|witness|transcripts|exhibits|public)$")


def investigation_record(client, url, listed_date, widget):
    html = client.html(url)
    if html is None:
        return None
    s = soup(html)
    art = s.find("article") or s
    h1 = common.clean((art.find("h1") or s.find("h1")).get_text(" ", strip=True))
    secs = sections(art)
    page_cite = common.cite(url, h1)

    # Documents: report volumes, the recommendations PDF and responses.
    report_docs, recs_pdf, responses = [], None, []
    for el in art.find_all("a"):
        href = el.get("href") or ""
        if TAB_LINK.match(href):
            break  # the media/witness/transcript/exhibit tabs: their lists hold other material (and, on some pages, other reports)
        if "ArticleDocuments" not in href:
            continue
        link = common._quote(urljoin(SITE, href))
        label = common.clean(el.get_text(" ", strip=True)) or ""
        heading = el.find_previous(["h2", "h3"])
        htext = heading.get_text(" ", strip=True) if heading else ""
        if re.search(r"progress report|action plan|plan of action|month update|response|implementation", label, re.I) or (
                "Responses to ICAC recommendations" in htext and label):
            if not SKIP_DOC.search(label) or re.search(r"response|action plan|update", label, re.I):
                if all(r["url"] != link for r in responses):
                    responses.append(common.response(response_kind(label), label, link))
            continue
        if re.search(r"recommendations", href, re.I) and re.search(r"corruption prevention|recommendations", label + " " + htext, re.I) \
                and not re.search(r"report", label, re.I):
            recs_pdf = recs_pdf or (link, label)
            continue
        if link in widget or re.search(r"full report|investigation report|download the report|report - volume|download report", label, re.I):
            if (SKIP_DOC.search(label) or SKIP_DOC.search(href) or re.search(r"/EXH|exh-", href, re.I)) and link not in widget:
                continue
            if all(d[0] != link for d in report_docs):
                report_docs.append((link, label))

    operation = operation_of(h1)
    title = None
    for link, _ in report_docs:
        if link in widget:
            title = widget[link][0]
            break
    title = title or h1
    report_type = "investigation_report"
    notes = []

    documents, report_pages, first_pdf = [], [], None
    findings_ok = True
    findings = []
    for n, (link, label) in enumerate(report_docs):
        data = client.get(link, "pdf")
        if data is None:
            documents.append(common.document("report" if len(report_docs) == 1 else "volume", label, link, status="unavailable"))
            findings_ok = False
            continue
        pages = column_pages(data)
        documents.append(common.document("report" if len(report_docs) == 1 else "volume",
                                         widget.get(link, (label,))[0] or label, link, data, len(pages) if pages else None))
        first_pdf = first_pdf or link
        if not pages or sum(len(p.strip()) for p in pages) < 2000:
            findings_ok = False
            notes.append(f"{label}: the PDF has no readable text layer; nothing extracted from it.")
            continue
        report_pages.extend(pages if n == 0 else [])
        if n == 0 or not findings:
            findings += findings_from_pages(pages, link, widget.get(link, (title,))[0] or title)

    # Findings status: extracted when found; stated_none for investigations the ICAC page says
    # made no findings; otherwise not_extracted.
    page_text = common.flat(art.get_text(" "))
    no_findings_stated = bool(re.search(r"(?:made|makes|make) no (?:findings? of )?corrupt conduct|no findings? of corrupt conduct (?:was|were|are|is) made|"
                                        r"was not concerned with examining whether any particular individual", page_text, re.I))
    if findings:
        findings_status = "extracted"
    elif no_findings_stated and findings_ok and report_docs:
        findings_status = "stated_none"
        notes.append("The investigation page states that no corrupt conduct findings were made or sought.")
    else:
        findings_status = "not_extracted"

    # Recommendations.
    recs = []
    if recs_pdf:
        data = client.get(recs_pdf[0], "pdf")
        if data is not None:
            documents.append(common.document("recommendations", recs_pdf[1] or "Corruption prevention recommendations", recs_pdf[0], data))
            recs = recommendations_from_pdf(common.pdf_pages(data), recs_pdf[0], recs_pdf[1] or "Corruption prevention recommendations")
    if not recs:
        for head in secs:
            if re.match(r"^(?:Recommendations for corruption prevention|Policy recommendations)$", head):
                recs = recommendations_from_html(secs[head], url, h1, report_pages, first_pdf, title)
                if recs:
                    break
    rec_status = "extracted" if recs else "not_extracted"

    if any("Responses to ICAC recommendations" in h for h in secs) or responses:
        responses_status = "published" if responses else "none_found"
    else:
        responses_status = "none_found"
    if not report_docs:
        notes.append("No report PDF is linked from the investigation page.")
    summary = None
    intro = []
    for tag, text, el in leaf_blocks(art):
        if tag == "h2":
            break
        if tag == "p" and re.match(r"^(?:In its report|In its investigation report|The ICAC'?s? report|The Commission'?s? report)", text):
            intro.append(text)
    if intro:
        summary = " ".join(intro)
    return common.report_record(
        BODY, title=title, page_url=url, report_type=report_type, date=listed_date,
        date_basis="published" if listed_date else None, operation=operation, type_as_published="Investigation report",
        pdf_url=first_pdf, documents=documents, subjects=subjects_from_title(h1, page_cite), findings=findings,
        findings_status=findings_status, recommendations=recs, recommendations_status=rec_status,
        responses=responses, responses_status=responses_status, notes=notes, summary=summary, key=operation or title)


# ---- pre-2016 summaries ---------------------------------------------------------------------------

LEAD_IN = re.compile(r"^(?:The\s+ICAC|The\s+Commission|ICAC|The\s+investigation)\b", re.I)


def parse_pre2016(html):
    """Entries on the pre-2016 page: dict(title, year, paragraphs, links)."""
    s = soup(html)
    art = s.find("article") or s
    blocks = leaf_blocks(art)
    entries, year, cur = [], None, None

    def is_title(i):
        tag, text, _ = blocks[i]
        if tag in ("h1", "h2") or len(text) > 320 or LEAD_IN.match(text) or text.startswith(("In its", "In  its", "This", "Go to top", "Top", "For all")):
            return False
        if re.match(r"^(?:Find out more|Request)", text):
            return False
        if text.rstrip().endswith((".", ":", ";")) or not re.search(r"\s[\u2013\u2014-]\s?|\(Operations?\b", text):
            return False
        nxt = blocks[i + 1][1] if i + 1 < len(blocks) else ""
        return tag in ("h3", "h4") or bool(LEAD_IN.match(nxt))

    for i, (tag, text, el) in enumerate(blocks):
        if tag == "h2" and re.fullmatch(r"\d{4}", text):
            year, cur = text, None
            continue
        if year is None:
            continue
        if is_title(i):
            cur = {"title": text, "year": year, "paragraphs": [], "links": []}
            entries.append(cur)
            continue
        if cur is None or text in ("Go to top",):
            continue
        cur["paragraphs"].append(text)
        for a in el.find_all("a", href=True):
            cur["links"].append((common.clean(a.get_text(" ", strip=True)), urljoin(SITE, a["href"])))
    return [e for e in entries if e["paragraphs"]]


def pre2016_record(entry):
    text = " ".join(entry["paragraphs"])
    month = r"(?:January|February|March|April|May|June|July|August|September|October|November|December)"
    # The summaries sometimes run words together ("madepublic on", "public inOctober").
    mentions = re.findall(r"(?:made\s*public|released|furnished)(?:\s+to\s+(?:the\s+)?(?:Parliament|Presiding Officers))?"
                          r"\s*(on\s*|in\s*)?((?:\d{1,2}\s*)?" + month + r"\s*,?\s*\d{4})", text)
    notes = [NO_ONLINE]
    date = None
    if mentions:
        prep, first = mentions[0]
        date = parse_date(first) if not prep.startswith("in") else None
        if not date:
            notes.append(f"The ICAC's summary says the report was made public in {first}; "
                         "it gives no day, so OPAX records no date.")
        if len(mentions) > 1:
            notes.append("The ICAC's summary describes more than one report; the date (or month) is the first one it gives.")
    url = PRE2016 + "#" + entry["year"]
    outcome = [p for p in entry["paragraphs"] if not re.match(r"^This\s+report|^The reports? (?:are|is) no longer|^Request", p)]
    citation = common.cite(url, "Pre-2016 investigations", section=entry["year"])
    return common.report_record(
        BODY, title=entry["title"], page_url=url, report_type="investigation_report", date=date,
        date_basis="published" if date else None, operation=operation_of(entry["title"]),
        type_as_published="Investigation report", subjects=subjects_from_title(entry["title"], citation),
        summary=" ".join(outcome), notes=notes, responses_status="not_checked",
        key=(operation_of(entry["title"]) or entry["title"]) + ("-" + entry["year"] if not date else ""))


# ---- prevention and research reports ----------------------------------------------------------------

PREV_EXCLUDE = re.compile(r"\b(?:guide|guides|guidance|guidelines|tip sheet|tips|tool|checklists?|sample|policy|advice|flyer|brochure|"
                          r"dos and don|factfinder|let's stop it|annotated|scenarios|short guide|summary|business case|"
                          r"due diligence checks|closing out|community engagement|conflicting duties|worthwhile|risks specific|"
                          r"negotiating|managing the tender|planning for procurement|financial management|governance transparency|"
                          r"managing contract|project payments|project schedules|protecting your team|quality assurance|"
                          r"recordkeeping|roles and responsibilities|scope management|segregation of duties)\b", re.I)
PREV_INCLUDE = re.compile(r"\b(?:report|survey|position paper|consultation paper|issues paper|profiling|unravelling|trends|"
                          r"perception|recommendations to government|evaluating|safeguards|exercise of discretion|monitoring|"
                          r"strengthening|governance and regulation|election funding|learning the hard way|risks in|"
                          r"risks associated|keeping it together|controlling corruption|common forms|coerced|mature corruption|"
                          r"managing conflicts of (?:interest|duties)|managing corruption risks|safeguarding public money|"
                          r"managing it contractors|funding ngo)\b", re.I)


def parse_prevention(html):
    """Prevention listing rows: (title, date, href, description)."""
    s = soup(html)
    art = s.find("article") or s
    out = []
    for a in art.find_all("a", href=True):
        href = a["href"]
        if "ArticleDocuments" not in href or not re.search(r"\.pdf\.aspx$", href, re.I):
            continue
        text = common.clean(a.get_text(" ", strip=True)) or ""
        m = re.match(r"^(.*?)\s+Date:\s*(\d{1,2}\s+\w{3}\s+\d{4})\s*(.*)$", text)
        if not m:
            continue
        out.append((common.clean(m.group(1)), parse_date(m.group(2)), common._quote(urljoin(SITE, href)), common.clean(m.group(3))))
    return out


def is_research_report(title, description):
    if PREV_EXCLUDE.search(title or ""):
        return False
    return bool(PREV_INCLUDE.search(title or "") or re.search(r"\b(?:research|report on|survey)\b", description or "", re.I))


def prevention_record(client, title, date, href, description):
    data = client.get(href, "pdf")
    documents, recs, notes = [], [], []
    if data is None:
        documents.append(common.document("report", title, href, status="unavailable"))
    else:
        pages = common.pdf_pages(data)
        documents.append(common.document("report", title, href, data, len(pages)))
        cleaned_pages = pages
        if re.search(r"recommendations?", title, re.I):
            recs = recommendations_from_pdf(cleaned_pages, href, title)
    if not recs:
        notes.append("Corruption prevention and research reports make no findings about individuals; any recommendations "
                     "are not extracted unless set out as numbered recommendations that could be read confidently.")
    return common.report_record(
        BODY, title=title, page_url=PREVENTION, report_type="prevention_research_report", date=date,
        date_basis="published" if date else None, type_as_published="Corruption prevention publication",
        pdf_url=href, documents=documents, summary=description, recommendations=recs,
        recommendations_status="extracted" if recs else "not_extracted", notes=notes,
        responses_status="not_checked", key=title)


# ---- collect ------------------------------------------------------------------------------------------

def collect(client: common.Client):
    if client.html(COPYRIGHT) is None:
        raise common.Held("nsw_icac: copyright statement unavailable")
    widget = parse_report_widget(client.html(REPORTS) or "")
    if not widget:
        raise common.Held("nsw_icac: investigation reports listing empty or changed")

    entries, seen = [], set()
    for pg in range(1, 15):
        html = client.html(PAGED.format(pg))
        if html is None:
            break
        new = [e for e in parse_listing(html) if e[0] not in seen]
        if not new:
            break
        for e in new:
            seen.add(e[0])
            entries.append(e)
    if len(entries) < 25:
        raise common.Held(f"nsw_icac: only {len(entries)} investigations listed")

    records, ops = [], set()
    for url, date, text in entries:
        rec = investigation_record(client, url, date, widget)
        if rec:
            records.append(rec)
            if rec["operation"]:
                ops.add(op_key(rec["operation"]))

    pre = parse_pre2016(client.html(PRE2016) or "")
    if len(pre) < 100:
        raise common.Held(f"nsw_icac: only {len(pre)} pre-2016 summaries parsed")
    for entry in pre:
        key = op_key(entry["title"])
        if key and key in ops:
            continue
        records.append(pre2016_record(entry))

    for title, date, href, description in parse_prevention(client.html(PREVENTION) or ""):
        if is_research_report(title, description):
            records.append(prevention_record(client, title, date, href, description))

    # Distinct ids: two records with the same date and key get the page path appended.
    ids = {}
    for r in records:
        ids.setdefault(r["id"], []).append(r)
    for rid, group in ids.items():
        if len(group) > 1:
            for n, r in enumerate(group[1:], 2):
                r["id"] = f"{rid}-{n}"
    return records
