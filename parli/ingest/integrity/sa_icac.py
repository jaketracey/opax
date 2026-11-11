"""South Australia: Independent Commission Against Corruption (and the Office for Public Integrity).

Source: https://icac.sa.gov.au (Squiz Matrix). No robots.txt is published (HTTP 404, so
no policy restricts the agent). ``www.icac.sa.gov.au`` redirects off-host to
``wds.squiz.cloud`` and is never used.

* Reports: ``/publications/all-reports`` (paged with ``result_996233_result_page``). The
  Commission files each report under a type in its URL path: investigation-reports,
  evaluation-reports, survey-reports, prevention-initiative-reports, legislative-reviews
  (kept as ``type_as_published``). Annual reports, audited financial statements and
  annual report attachments are excluded.
* Public statements: ``/media-and-news/media-releases`` (paged with
  ``result_996177_result_page``), keeping only items under ``/public-statements/``.
  Media releases are excluded. Statements about the Commissioner's own appointment,
  commencement or resignation are excluded (not about an investigation, evaluation or
  report).
* Office for Public Integrity: www.publicintegrity.sa.gov.au publishes only OPI annual
  reports (excluded) and points readers to the ICAC publications page, so OPI adds no
  records. Its robots.txt sets Crawl-delay 20; it is not requested by this adapter.

Dates are the Commission's published date on its listing (``date_basis`` published),
or the tabling date where the report page says the report was tabled on that same date.
A listing date earlier than the Commission's commencement (1 September 2013) is a source
error and is not used.

Findings: since the October 2021 amendments the Commission does not make findings of
corrupt conduct ("ICAC does not make findings of corrupt conduct or impose any sanctions
or penalties", Corruption investigations page). For investigation reports the adapter keeps
only the Commissioner's own first-person sentences that state whether a public authority or
public officer engaged in maladministration, misconduct or corruption ("I find that ...",
"I do not find that ...", "the evidence does not permit a finding ...", "in my opinion ...").
Each is verbatim and cited to its page, labelled with the report's own conduct term, and
classed as finding, opinion or no_finding as worded. Sentences about allegations,
submissions or contentions are never kept, and a negated sentence is never a finding.
Public statements are not read for findings (findings_status not_extracted).

Recommendations: numbered "Recommendation N" (or "Recommendation One") headings in the
report PDF, after removing running heads and footnotes. A run 1..N is used only when it sits
under a Recommendations heading or the Commissioner's lead-in, and, where the report states
how many recommendations it makes, only when the run has exactly that many (otherwise the list
is not extracted and a note says so). Runs whose labels sit under their text (the layout of
Failing the Corruption Road Test) and table-of-contents runs are rejected. Each text is
verified verbatim against the cited start page and the next page.
"""
from __future__ import annotations

from collections import Counter
from datetime import date as _date
import re
from urllib.parse import urljoin, urlsplit

try:
    from bs4 import BeautifulSoup
except ImportError:  # validators import adapters for constants only
    BeautifulSoup = None

from parli.ingest.integrity import common

SITE = "https://icac.sa.gov.au"
REPORTS = SITE + "/publications/all-reports"
REPORTS_PAGER = "result_996233_result_page"
STATEMENTS = SITE + "/media-and-news/media-releases"
STATEMENTS_PAGER = "result_996177_result_page"
COMMENCED = "2013-09-01"

BODY = common.Body(
    code="sa_icac",
    name="Independent Commission Against Corruption (South Australia)",
    short="SA ICAC",
    jurisdiction="SA",
    site=SITE,
    hosts=(),
    interval=3.0,
    max_requests=700,
    licence={"status": "copyright",
             "url": SITE,
             "attribution": "© Independent Commission Against Corruption SA. The site states copyright and grants "
                            "no open licence; records quote and link the Commission's publications."},
)
MIN_RECORDS = 100
GAPS = (
    "Office for Public Integrity: publishes only its annual reports (excluded); no OPI report or statement records.",
    "Since October 2021 the Commission does not make findings of corrupt conduct; most records have no findings.",
    "Government and agency responses are recorded only where the Commission's page links them or the report "
    "reproduces them; implementation status is not published by the Commission as structured data.",
    "Scanned reports without a text layer are not read (no OCR); their recommendations stay not_extracted.",
    "Recommendations are extracted only from numbered 'Recommendation N' lists; reports that set out recommendations "
    "in prose, tables or unnumbered lists keep recommendations_status not_extracted.",
    "Findings are extracted only from investigation reports that state them in the Commissioner's own words "
    "(Oakden 2018, Gillman 2015); public statements are not read for findings.",
)

TYPES = {
    "investigation-reports": ("investigation_report", "Investigation report"),
    "evaluation-reports": ("prevention_research_report", "Evaluation report"),
    "survey-reports": ("prevention_research_report", "Survey report"),
    "prevention-initiative-reports": ("prevention_research_report", "Prevention initiative report"),
    "legislative-reviews": ("prevention_research_report", "Legislative review"),
}
EXCLUDE_TITLE = re.compile(r"annual report|financial statements", re.I)
EXCLUDE_STATEMENT = re.compile(r"commissioner[\w\s’']*(?:commences|resignation)|appointment of|deputy commissioner", re.I)
MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def parse_date(text):
    """'25 June 2026', '26 Sept 2024', '3 Apr 2025' -> ISO date, else None."""
    m = re.search(r"\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b", text or "")
    if not m:
        return None
    mon = MONTHS.get(m.group(2)[:3].lower())
    if not mon:
        return None
    try:
        return _date(int(m.group(3)), mon, int(m.group(1))).isoformat()
    except ValueError:
        return None


# ---- listings -----------------------------------------------------------------------------

def parse_listing(html, base):
    """Items on one listing page: dicts with title, url, date_text, summary; and the next page URL."""
    soup = BeautifulSoup(html, "html.parser")
    items = []
    for li in soup.select("li.border-t"):
        link = li.select_one("a.article-title--link") or li.find("a", href=True)
        if not link:
            continue
        heading = li.find(["h5", "h4", "h3"])
        when = li.select_one("span.text-sm")
        para = li.find("p")
        items.append({"title": common.clean((heading or link).get_text(" ", strip=True)),
                      "url": urljoin(base, link["href"].strip()),
                      "date_text": common.clean(when.get_text(" ", strip=True)) if when else None,
                      "summary": common.clean(para.get_text(" ", strip=True)) if para else None})
    return items


def walk(client, start, pager, limit=40):
    items, page = [], 1
    while page <= limit:
        url = start if page == 1 else f"{start}?{pager}={page}"
        html = client.html(url)
        if html is None:
            raise common.Held(f"listing page missing: {url}")
        found = parse_listing(html, url)
        if not found:
            break
        items.extend(found)
        if f"{pager}={page + 1}" not in html:
            break
        page += 1
    return items


def report_kind(url):
    parts = urlsplit(url).path.strip("/").split("/")
    if len(parts) >= 3 and parts[0] == "indexable-assets" and parts[1] == "reports":
        return parts[2]
    return None


def keep_report(item):
    kind = report_kind(item["url"])
    if kind not in TYPES:
        return False  # annual reports, financial statements, annual report attachments, direct PDFs
    return not EXCLUDE_TITLE.search(item["title"] or "")


def keep_statement(item):
    return "/public-statements/" in item["url"] and not EXCLUDE_STATEMENT.search(item.get("page_title") or item["title"] or "")


# ---- report and statement pages -------------------------------------------------------------

def content(soup):
    node = soup.select_one("div.icac-wysiwyg div.max-w-6xl") or soup.select_one("div.icac-wysiwyg") or soup.find("main")
    return node


def page_facts(html, url):
    """Title, text, PDF links (in order) and response links from a report or statement page."""
    soup = BeautifulSoup(html, "html.parser")
    node = content(soup)
    h1 = (node.find("h1") if node else None) or soup.find("h1")
    title = common.clean(h1.get_text(" ", strip=True)) if h1 else None
    text = common.clean(node.get_text(" ", strip=True)) if node else ""
    links, section = [], None
    if node:
        for el in node.find_all(["h2", "h3", "a"]):
            if el.name in ("h2", "h3"):
                section = common.clean(el.get_text(" ", strip=True))
                continue
            href = (el.get("href") or "").strip()
            if not href or href.startswith(("#", "mailto:", "tel:")):
                continue
            label = common.clean(el.get_text(" ", strip=True).replace("(external site)", "").replace("(PDF)", ""))
            links.append({"url": urljoin(url, href), "label": label, "section": section,
                          "context": common.clean(el.parent.get_text(" ", strip=True)) if el.parent else None})
    return {"title": title, "text": text, "links": links}


def is_own_pdf(link):
    p = urlsplit(link["url"])
    return p.hostname == urlsplit(SITE).hostname and (p.path.lower().endswith(".pdf") or "/pdf_file/" in p.path)


def pick_report_pdf(facts, title):
    """The report PDF: the first own-site PDF under 'Read the report', else the first own PDF that is
    not a fact sheet, FAQ, media release, public statement or standard operating procedure."""
    pdfs = [l for l in facts["links"] if is_own_pdf(l)]
    under = [l for l in pdfs if (l["section"] or "").lower().startswith(("read the report", "report"))]
    if under:
        return under[0]
    skip = re.compile(r"fact ?sheet|faq|media release|public statement|standard operating|summary|at-a-glance", re.I)
    rest = [l for l in pdfs if not skip.search((l["label"] or "") + " " + l["url"])]
    return rest[0] if rest else None


def tabled_date(text):
    """A date the page says the report was tabled on: 'On 3 April 2025, ... was tabled in Parliament'."""
    m = re.search(r"\bOn (\d{1,2} [A-Za-z]+ \d{4}),?[^.]{0,400}?\btabled\b", text or "")
    return parse_date(m.group(1)) if m else None


RESPONSE_LINK = re.compile(r"\brespon(?:se|ded)\b", re.I)


def response_links(facts, report_url):
    """Government or agency responses the Commission links from the report page."""
    out = []
    for l in facts["links"]:
        blob = " ".join(x for x in (l["label"], l["url"]) if x)
        if not RESPONSE_LINK.search(blob) or l["url"] == report_url:
            continue
        if re.search(r"inspector", blob, re.I):
            continue  # the Commissioner's own responses to the Inspector are reports, not agency responses
        sentence = l["context"] or l["label"]
        out.append(common.response("agency_response", sentence, l["url"],
                                   citation=common.cite(facts["page_url"], facts["title"], section="Report page")))
    return out


# ---- PDF text ---------------------------------------------------------------------------------

EDGE = 5


def strip_running(pages):
    """Remove running heads and footers: short lines repeated near the top or bottom of many pages."""
    lines = [[ln.strip() for ln in (p or "").splitlines() if ln.strip()] for p in pages]
    key = lambda s: re.sub(r"\d+", "#", s.lower())
    counts = Counter()
    for ls in lines:
        for ln in set(ls[:EDGE] + ls[-EDGE:]):
            if len(ln) <= 160 and not REC_HEAD.match(ln):
                counts[key(ln)] += 1
    threshold = max(3, int(len(pages) * 0.2))
    heads = {k for k, n in counts.items() if n >= threshold}
    out = []
    for ls in lines:
        keep = []
        for i, ln in enumerate(ls):
            edge = i < EDGE or i >= len(ls) - EDGE
            if edge and (key(ln) in heads or re.fullmatch(r"(?:page\s*)?\d{1,3}", ln, re.I)):
                continue
            keep.append(ln)
        out.append("\n".join(keep))
    return out


_UNITS = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
_TENS = {"twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90}
NUMWORD = (r"(?:(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?"
           r"|nineteen|eighteen|seventeen|sixteen|fifteen|fourteen|thirteen|twelve|eleven|ten"
           r"|one|two|three|four|five|six|seven|eight|nine)")
# "Recommendation 4", "RECOMMENDATION 4:" or "Recommendation Four" at the start of a line.
REC_HEAD = re.compile(r"(?m)^\s*(?:RECOMMENDATION|Recommendation)\s+(\d{1,3}|(?i:" + NUMWORD + r"))\b\s*[:.\-–]?\s*")
REC_SPLIT = re.compile(r"(?m)^(\s*(?:RECOMMENDATION|Recommendation))[ \t]*\n\s*(\d{1,3})[ \t]*$")
REC_SECTION = re.compile(r"(?im)^\s*(?:summary of |list of |our |the commission'?s? )?(?:findings and )?recommendations\s*:?\s*$")
STOP = re.compile(r"(?m)^\s*(?:CHAPTER\b|Chapter \d|PART \d|Part \d|APPENDIX|Appendix \d|Appendices\b|"
                  r"\d{1,2}(?:\.\d+)?\s+[A-Z][A-Z ,'’\-]{6,}$)")
# Only wording that states the report's own count: "makes eight", "This report contains 61", "I have made 13".
# Bare "made" is left out because it usually refers to an earlier report or another body.
STATED = re.compile(r"\b(?:I have made|I make|makes|contains|includes|(?:report|evaluation|review) has made)\s+(?:a total of\s+)?"
                    r"(\d{1,3}|[a-z]+(?:[- ][a-z]+)?)\s+(?:\w+\s+){0,2}?recommendations\b", re.I)


STATED_AFTER = re.compile(r"\bthe (\d{1,3}|[a-z]+(?:[- ][a-z]+)?) recommendations (?:I have made|I make|made in this report|in this report)\b", re.I)


def word_number(token):
    t = token.lower().replace(" ", "-")
    if t.isdigit():
        return int(t)
    if t in _UNITS:
        return _UNITS.index(t)
    parts = t.split("-")
    if parts[0] in _TENS and (len(parts) == 1 or (len(parts) == 2 and parts[1] in _UNITS[1:10])):
        return _TENS[parts[0]] + (_UNITS.index(parts[1]) if len(parts) == 2 else 0)
    return None


def stated_count(*texts):
    """The number of recommendations the Commission says a report makes, when it says so exactly once."""
    found = set()
    for t in texts:
        flat = common.flat(t or "")
        for m in list(STATED.finditer(flat)) + list(STATED_AFTER.finditer(flat)):
            n = word_number(m.group(1))
            if n:
                found.add(n)
    return found.pop() if len(found) == 1 else None


def runs_of(pages):
    """Every run of 'Recommendation N' headings that starts at 1 and counts up by one, within 3 pages."""
    hits = [(i, m.start(), word_number(m.group(1)), m.end()) for i, p in enumerate(pages) for m in REC_HEAD.finditer(p)]
    hits = [h for h in hits if h[2]]
    runs, open_runs = [], []
    for h in hits:
        if h[2] == 1:
            open_runs.append([h])
            continue
        for run in open_runs:
            last = run[-1]
            if h[2] == last[2] + 1 and 0 <= h[0] - last[0] <= 3 and (h[0], h[1]) > (last[0], last[1]):
                run.append(h)
                break
    for run in open_runs:
        if run not in runs:
            runs.append(run)
    return runs


LEADIN = re.compile(r"(?i)\b(?:I (?:have )?made|I make|the following)\b[^.\n]{0,40}\brecommendations?\b[^.\n]{0,20}:?\s*$")


def headed(pages, run):
    """The run follows a Recommendations heading or the Commissioner's own lead-in ("I have made 13 recommendations:")."""
    first = run[0][0]
    before = pages[first][:run[0][1]]
    if LEADIN.search(before[-300:].rstrip()) or REC_SECTION.search(before):
        return True
    return any(REC_SECTION.search(pages[k]) for k in range(max(0, first - 2), first))


def first_words(text, n=3):
    return " ".join(re.findall(r"[A-Za-z’']+", text)[:n]).lower()


def text_before_labels(clean_pages, run, bodies):
    """True when each label follows its text (the layout puts 'RECOMMENDATION 1' under the words it labels).

    Reading the text after each label would then attach every recommendation to the wrong number,
    so such a run is not used. Seen as text before the first label that opens like the items do.
    """
    before = clean_pages[run[0][0]][:run[0][1]]
    cut = max([m.end() for m in REC_SECTION.finditer(before)] + [m.end() for m in LEADIN.finditer(before)] + [0])
    lead = before[cut:].strip()
    if len(lead) < 30:
        return False
    fw = first_words(lead)
    return sum(first_words(b) == fw for b in bodies) * 2 >= len(bodies)


FOOTNOTE = re.compile(r"(?m)^(?:\d{1,3}[ \t]*\n(?=[A-Z‘“'\"])|\d{1,2}:\s)")
# Inside a body: a following heading ("Recommendations", "RECOMMENDATION TO OTHER AGENCIES", an all-caps line) ends it.
BODY_END = re.compile(r"(?m)^\s*(?:(?:RECOMMENDATIONS?|Recommendations?)\b(?!\s+\d)|[A-Z][A-Z ,'’&\-]{12,}$)")
LEADERS = re.compile(r"\.{6,}|…{3,}")


def drop_footnotes(page):
    """Cut a page's footnote block ('29<tab>Source ...') when it sits in the lower part of the page."""
    for m in FOOTNOTE.finditer(page):
        if m.start() >= len(page) * 0.4:
            return page[:m.start()]
    return page


def end_of_last(body):
    """The last recommendation ends at the next heading-like line ('Conclusion') after a finished sentence."""
    lines = body.split("\n")
    for k in range(1, len(lines)):
        ln, prev = lines[k].strip(), lines[k - 1].rstrip()
        if (prev.endswith((".", "?", ";")) and ln and ln[0].isupper() and len(ln) <= 50
                and not ln.endswith((".", ",", ";", ":")) and len(ln.split()) <= 6):
            return "\n".join(lines[:k])
    return body


def extract_run(clean_pages, run, pdf_url, doc_title):
    out = []
    for j, (pi, start, num, end) in enumerate(run):
        if j + 1 < len(run):
            npi, nstart = run[j + 1][0], run[j + 1][1]
            if npi == pi:
                body = clean_pages[pi][end:nstart]
            else:
                body = clean_pages[pi][end:] + "\n" + "\n".join(clean_pages[k] for k in range(pi + 1, npi)) + "\n" + clean_pages[npi][:nstart]
        else:
            tail = clean_pages[pi][end:]
            stop = STOP.search(tail)
            body = end_of_last(tail[:stop.start()] if stop else tail)
        cut = BODY_END.search(body)
        if cut and cut.start() > 0:
            body = body[:cut.start()]
        body = body.strip()
        lines = body.split("\n")  # a short all-caps section heading ("TRAINING") printed before the next number
        while len(lines) > 1 and re.fullmatch(r"[A-Z][A-Z ,'’&\-]{3,}", lines[-1].strip()) and lines[-2].rstrip().endswith((".", ";")):
            lines.pop()
        body = "\n".join(lines).strip()
        if not body or LEADERS.search(body) or len(body) > 4000 or re.search(r"(?m)^\s*(?:CHAPTER|Chapter \d)", body):
            return None  # boundary unclear: leave the list unextracted rather than guess
        source = clean_pages[pi] + "\n" + (clean_pages[pi + 1] if pi + 1 < len(clean_pages) else "")
        try:
            out.append(common.recommendation(num, body, common.cite(pdf_url, doc_title, page=pi + 1), source))
        except ValueError:
            return None
    if text_before_labels(clean_pages, run, [r["text"] for r in out]):
        return None
    return out


def recommendations(pages, pdf_url, doc_title, expected=None):
    """Numbered recommendations, verbatim, from one complete run of 'Recommendation N' headings.

    A run is used only when it sits under a Recommendations heading or matches the number of
    recommendations the Commission states; when a stated number exists, the run must match it.
    Quoted recommendations of other bodies (for example Cabinet papers) carry neither and are left out.
    Among usable runs the longest, then the most compact (fewest pages), is read first.
    """
    joined = [REC_SPLIT.sub(r"\1 \2", p or "") for p in pages]
    clean_pages = strip_running([drop_footnotes(p) for p in joined])
    runs = runs_of(clean_pages)
    usable = []
    for run in runs:
        if expected is not None and len(run) != expected:
            continue
        if expected is None and not headed(clean_pages, run):
            continue
        usable.append(run)
    usable.sort(key=lambda r: (-len(r), r[-1][0] - r[0][0], r[0][0]))
    for run in usable:
        recs = extract_run(clean_pages, run, pdf_url, doc_title)
        if recs:
            return recs
    return []


# ---- collect ------------------------------------------------------------------------------------

def report_date(item, facts):
    listed = parse_date(item.get("date_text"))
    notes = []
    if listed and listed < COMMENCED:
        notes.append(f"The Commission's listing gives the date {item['date_text']}, before the Commission began; "
                     "the date is not used.")
        listed = None
    tabled = tabled_date(facts["text"]) if facts else None
    if listed and tabled == listed:
        return listed, "tabled", notes
    if tabled and not listed:
        return tabled, "tabled", notes
    if listed:
        if tabled:
            notes.append(f"The report page says it was tabled on {tabled}.")
        return listed, "published", notes
    return None, None, notes


def subjects_from(title, text, page_url):
    """Bodies named in the title of an evaluation ('Evaluation of SAFECOM') as published."""
    out = []
    m = re.match(r"Evaluation of (?:the )?(?:Practices, Policies and Procedures of (?:the )?)?(.+)$", title or "")
    if m and not re.search(r"grants administration|professional development|targeted aspects", m.group(1), re.I):
        name = re.sub(r"\s*[:–-].*$", "", m.group(1)).strip()
        if name:
            out.append(common.subject(name, "body", common.cite(page_url, title, section="Title")))
    return out


# ---- findings (investigation reports only)
#
# The Commission states it "does not make findings of corrupt conduct". Its older investigation
# reports (for example Oakden, 2018) do state, in the Commissioner's own words, whether a public
# authority or public officer engaged in maladministration or misconduct. Only those first-person
# sentences are kept, verbatim and cited to the page; anything that reports what someone alleged,
# submitted or contended is left out.
CONDUCT = r"(maladministration|misconduct|corrupt conduct|corruption)"
LEAD = r"^(?:[A-Z][^.;]{0,70}?,? )?"  # an opening clause: "Accordingly, ", "For all of those reasons "
DID = r"(?:engaged in (?:conduct that (?:amounted to|constitutes|constituted) )?(?:serious or systemic )?)"
FINDING_FORMS = (
    ("no_finding", re.compile(LEAD + r"I (?:have found|find|conclude) that\b.{0,200}?\b(?:did not engage in|did not constitute|"
                              r"has not engaged in) (?:conduct that (?:amounted to|constitutes) )?" + CONDUCT + r"\b")),
    ("no_finding", re.compile(LEAD + r"I (?:therefore )?do not find that\b.{0,300}?\b" + CONDUCT + r"\b")),
    ("no_finding", re.compile(LEAD + r"the evidence does not (?:permit|support) a finding (?:that|of)\b.{0,300}?\b" + CONDUCT + r"\b", re.I)),
    ("no_finding", re.compile(LEAD + r"I am not satisfied (?:that )?.{0,200}?\bengaged in " + CONDUCT + r"\b")),
    ("finding", re.compile(LEAD + r"I (?:have found|find|conclude) that\b.{0,300}?\b" + DID + CONDUCT + r"\b")),
    ("finding", re.compile(LEAD + r"I find that the practices, policies and procedures of\b"
                           r".{0,200}?\bgave rise to (?:a )?substantial (mismanagement) of public resources")),
    ("opinion", re.compile(LEAD + r"[Ii]n my opinion\b.{0,200}?\b" + DID + CONDUCT + r"\b")),
)
NOT_OWN = re.compile(r"(?i)alleg|submi(?:t|ssion)|contend|counsel|\bhe said\b|\bshe said\b|suggested")
NEGATED = re.compile(r"\b(?:no|not|neither|nor|never|none)\b", re.I)
SENTENCE = re.compile(r"(?<=[.?])\s+(?=[A-Z]|\d{1,2}\.\d|\d{1,3}\s+[A-Z])")
HEADING_LEAD = re.compile(r"^(?:Conclusions?|Findings?|Summary)\s+(?=[A-Z])")


def findings(pages, pdf_url, doc_title):
    """The Commissioner's own finding and no-finding sentences, verbatim, each once, in page order."""
    clean_pages = strip_running([drop_footnotes(p or "") for p in pages])
    out, seen = [], set()
    for i, page in enumerate(clean_pages):
        for sent in SENTENCE.split(common.flat(page)):
            sent = HEADING_LEAD.sub("", sent.strip())
            if len(sent) > 600 or NOT_OWN.search(sent):
                continue
            for kind, rx in FINDING_FORMS:
                m = rx.search(sent)
                if not m:
                    continue
                if kind in ("finding", "opinion") and NEGATED.search(sent[:m.end()]):
                    break  # "I have found that no public officer engaged in ..." is not a finding of conduct

                key = re.sub(r"\W+", " ", sent.lower())
                if key not in seen:
                    seen.add(key)
                    try:
                        out.append(common.finding(m.group(1).lower(), kind, sent,
                                                  common.cite(pdf_url, doc_title, page=i + 1), page))
                    except ValueError:
                        pass
                break
    return out


def build_report(client, item):
    rtype, label = TYPES[report_kind(item["url"])]
    html = client.html(item["url"])
    if html is None:
        return None
    facts = page_facts(html, item["url"])
    facts["page_url"] = item["url"]
    title = facts["title"] or item["title"]
    date, basis, notes = report_date(item, facts)
    docs, recs, rec_status, pdf_url = [], [], "not_extracted", None
    finds, find_status = [], "not_extracted"
    pdf = pick_report_pdf(facts, title)
    if pdf:
        data = client.get(pdf["url"], "pdf")
        if data:
            pages = common.pdf_pages(data)
            pdf_url = pdf["url"]
            docs.append(common.document("report", pdf["label"] or title, pdf_url, data, len(pages)))
            if sum(len(p.strip()) for p in pages) < 200 * max(1, len(pages)) * 0.2:
                notes.append("The report PDF has little or no text layer; it was not read.")
            else:
                in_pdf = stated_count(*pages[:30])
                on_page = stated_count(item.get("summary"), facts["text"])
                expected = in_pdf or on_page
                if in_pdf and on_page and in_pdf != on_page:
                    notes.append(f"The report states it makes {in_pdf} recommendations; the Commission's web page "
                                 f"states {on_page}. The report's own count is used.")
                recs = recommendations(pages, pdf_url, pdf["label"] or title, expected)
                if rtype == "investigation_report":
                    finds = findings(pages, pdf_url, pdf["label"] or title)
                    find_status = "extracted" if finds else "not_extracted"
                if recs:
                    rec_status = "extracted"
                elif expected:
                    notes.append(f"The Commission states the report makes {expected} recommendations; they were not "
                                 "extracted because a complete numbered list matching that count was not found.")
        else:
            docs.append(common.document("report", pdf["label"] or title, pdf["url"], status="unavailable"))
    for l in facts["links"]:
        if is_own_pdf(l) and (not pdf or l["url"] != pdf["url"]) and l["section"] and "related" in l["section"].lower():
            docs.append(common.document("related", l["label"], l["url"], status="linked"))
    responses = response_links(facts, pdf_url)
    return common.report_record(
        BODY, title=title, page_url=item["url"], report_type=rtype, type_as_published=label,
        date=date, date_basis=basis, pdf_url=pdf_url, documents=docs,
        subjects=subjects_from(title, facts["text"], item["url"]),
        findings=finds, findings_status=find_status,
        recommendations=recs, recommendations_status=rec_status,
        responses=responses, responses_status="published" if responses else "none_found",
        notes=notes, summary=item.get("summary"))


def build_statement(client, item):
    html = client.html(item["url"])
    if html is None:
        return None
    facts = page_facts(html, item["url"])
    facts["page_url"] = item["url"]
    title = facts["title"] or item["title"]
    item["page_title"] = title
    if not keep_statement(item):
        return None
    date, basis, notes = report_date(item, None)
    docs, pdf_url = [], None
    for l in facts["links"]:
        if is_own_pdf(l):
            docs.append(common.document("statement" if not docs else "related", l["label"], l["url"], status="linked"))
    if docs and docs[0]["role"] == "statement":
        pdf_url = docs[0]["url"]
    return common.report_record(
        BODY, title=title, page_url=item["url"], report_type="statement", type_as_published="Public statement",
        date=date, date_basis=basis, pdf_url=pdf_url, documents=docs,
        responses_status="not_checked", notes=notes, summary=item.get("summary"), key=urlsplit(item["url"]).path.rsplit("/", 1)[-1])


def collect(client):
    records = []
    reports = [i for i in walk(client, REPORTS, REPORTS_PAGER) if keep_report(i)]
    seen = set()
    for item in reports:
        if item["url"] in seen:
            continue
        seen.add(item["url"])
        rec = build_report(client, item)
        if rec:
            records.append(rec)
    statements = [i for i in walk(client, STATEMENTS, STATEMENTS_PAGER) if "/public-statements/" in i["url"]]
    for item in statements:
        if item["url"] in seen:
            continue
        seen.add(item["url"])
        rec = build_statement(client, item)
        if rec:
            records.append(rec)
    return records
