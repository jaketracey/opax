"""Western Australia: Corruption and Crime Commission reports (www.ccc.wa.gov.au).

Source: the Commission's reports listing, /publications/reports (Drupal view, 50 items a
page, newest first, back to the first report in December 2004). Every listing item is
tagged "Report" by the Commission; some are also tagged "Media Release" or "News". Each
item's page holds the report PDF under a "Report" document heading (a few items file it
under another heading, and one review page links only its media release).

Robots: ccc.wa.gov.au/robots.txt is the standard Drupal file (no crawl delay; /core/,
/profiles/, /admin/, /search/ and user paths disallowed). Requests are paced 4 seconds
apart; PDFs are fetched once per URL and then read from the raw cache.

Licence: the site has no copyright or licence page (/copyright is HTTP 404 and the sitemap
lists none). The reports carry the notice "Copyright in this work is held by the
Corruption and Crime Commission", with further use limited to what the Copyright Act 1968
(Cth) permits (fair dealing). OPAX records titles, dates, the Commission's stated opinions
and recommendations as short verbatim extracts with page citations, and links the PDFs.

Opinions: the Commission does not make findings of guilt. Under the Corruption, Crime and
Misconduct Act 2003 it may form and report opinions of misconduct, and an opinion that
misconduct has occurred is not a finding or opinion that a person has committed a criminal
or disciplinary offence (s 217A; earlier reports cite s 23 of the 2003 Act). OPAX records
only sentences in which the Commission states the opinion it formed (or states that it
formed none), never allegations, the opinion under s 22 that misconduct "may have"
occurred, or explanations of the power. Sentences that run over a page break are not
extracted; when a report states no opinion in that form, findings stay not_extracted.

Report type: the Commission labels every item "Report"; OPAX assigns report_type from the
words of the title (see ``report_type``) and keeps "Report" as type_as_published.
"""
from __future__ import annotations

from datetime import datetime
import hashlib
import re
import time
from urllib.parse import urljoin

import requests

from parli.ingest.integrity import common

SITE = "https://www.ccc.wa.gov.au"
LISTING = SITE + "/publications/reports?items_per_page=50&page={page}"
BODY = common.Body(
    code="wa_ccc", name="Corruption and Crime Commission", short="WA CCC", jurisdiction="WA",
    site=SITE, interval=4.0, max_requests=700,
    licence={"status": "copyright-commission", "url": SITE + "/publications/reports",
             "attribution": "Corruption and Crime Commission (Western Australia). Copyright in each report is held by "
                            "the Commission; further use is limited to what the Copyright Act 1968 (Cth) permits. "
                            "The website publishes no copyright or licence page."},
)
MIN_RECORDS = 130
GAPS = [
    "The Commission's website has no copyright or licence page; reports carry the Commission's copyright notice "
    "(fair dealing only), so OPAX keeps short verbatim extracts with citations and links the original PDFs.",
    "Only the reports listing (/publications/reports) is covered. Annual reports, quarterly reports filed under "
    "/quarterly-reports, media releases and news items are not report records.",
    "The listing date is the date the Commission's page was created; the record date is the report's cover date "
    "or the tabling date stated on the page where one is given, and the listing date only as a fallback.",
    "Opinions are extracted only where the Commission states them in a sentence on a single page; opinions in "
    "older reports framed differently, or split over a page break, are not extracted (findings not_extracted).",
    "No text layer, no OCR: scanned reports have no extracted opinions or recommendations.",
]
NOTE_TYPE = "Report type assigned by OPAX from the title; the Commission tags every listing item Report."
NOTE_OPINION = ("An opinion that misconduct has occurred is not, and is not to be taken as, a finding or opinion "
                "that a person has committed a criminal or disciplinary offence (Corruption, Crime and Misconduct "
                "Act 2003, s 217A; s 23 in reports made under the Act as first enacted).")
EXCLUDE = re.compile(r"^(?:Performance at a Glance\b|Corruption and Crime Commissioner to Retire\b)", re.I)
MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December"
DATE_LINE = re.compile(rf"^\s*(\d{{1,2}})(?:st|nd|rd|th)?\s+({MONTHS})\s+(\d{{4}})\s*$", re.I | re.M)
TABLED = re.compile(rf"tabled in (?:the )?Parliament on (\d{{1,2}}) ({MONTHS}) (\d{{4}})", re.I)


def iso(day, month, year):
    return datetime.strptime(f"{int(day)} {month.title()} {year}", "%d %B %Y").date().isoformat()


# ---- listing and pages ------------------------------------------------------------------

def parse_listing(html):
    """Items on one listing page and whether a next page exists."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    items = []
    for card in soup.select(".body-content"):
        link = card.select_one(".views-field-title a[href]")
        created = card.select_one(".views-field-created")
        if not link or not created:
            continue
        items.append({"title": common.clean(link.get_text(" ")), "href": urljoin(SITE, link["href"]),
                      "listed": datetime.strptime(common.clean(created.get_text()), "%B %d, %Y").date().isoformat(),
                      "tags": [common.clean(t.get_text()) for t in card.select(".rounded-3")]})
    has_next = soup.select_one('a[rel="next"], .pager__item--next a') is not None
    return items, has_next


def parse_page(html, url):
    """Document groups (heading -> [(title, url)]) and the summary text of a report page."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    art = soup.select_one("main article")
    if art is None:
        raise common.Held(f"report page structure missing: {url}")
    groups = []
    for heading in art.select("h3.document-heading"):
        box = heading.find_next_sibling("div")
        docs = [(common.clean(a.get("title") or a.get_text(" ")), urljoin(url, a["href"]))
                for a in (box.select("a[href]") if box else [])]
        groups.append((common.clean(heading.get_text()), docs))
    body = art.select_one(".field--name-body")
    return groups, common.clean(body.get_text(" ")) if body else None


def report_type(title):
    t = title.lower()
    if t.startswith("commission statement"):
        return "statement"
    if t.startswith("special report"):
        return "special_report"
    if t.startswith("report on the inquiry"):
        return "public_inquiry_report"
    if re.search(r"overview of serious misconduct|repositioning report|organised crime report|response to draft report"
                 r"|response to commission recommendations|administrative matter", t):
        return "other"
    if re.search(r"\breview\b|recommendation|implementation|misconduct handling|\brisks?\b|capacity|intelligence assessment"
                 r"|reflections|survey|protecting personal data|management of misconduct|reform program"
                 r"|property management|lessons|spotlight|governance", t):
        return "prevention_research_report"
    return "investigation_report"


# ---- PDF text -----------------------------------------------------------------------------

PARA_NUM = re.compile(r"^\s*\[?\d{1,4}\]?\.?\s*$")
SENTENCE_END = re.compile(r"(?<=[.;:])\d{0,3}\s+(?=(?:\(?[A-Z\[]))")
KIND = r"(?:serious |police )?misconduct"
STATED = [  # (pattern, kind): the Commission stating the opinion it formed, or that it formed none
    (re.compile(r"\b(?:the )?Commission (?:has |had )?(?:also |therefore |now )?formed (?:an |the |its )?opinions? (?:of " + KIND + r"|that)\b", re.I), "opinion"),
    (re.compile(r"\b(?:the )?Commission (?:has |had )?(?:also )?forms? (?:an |the )?opinions? (?:of " + KIND + r"|that)\b", re.I), "opinion"),
    (re.compile(r"\b(?:the )?Commission is (?:also |therefore )?of (?:the )?opinion that\b.*\b" + KIND + r"\b", re.I), "opinion"),
    (re.compile(r"\bopinions? of " + KIND + r" (?:is|are) appropriate\b", re.I), "opinion"),
    (re.compile(r"\b(?:the )?Commission (?:has|had) formed no opinions?\b|\bformed no opinions? of\b", re.I), "no_finding"),
    (re.compile(r"\b(?:the )?Commission (?:has not|had not|did not|does not|will not) form(?:ed)? (?:an |any )?opinions?\b", re.I), "no_finding"),
    (re.compile(r"\bno opinions? of " + KIND + r" (?:has|have|was|were) been formed\b|\bno opinions? of " + KIND + r" (?:has|have) been formed\b", re.I), "no_finding"),
    (re.compile(r"\b(?:not|do not|does not|did not) (?:reach|meet) the (?:standard|threshold)\b.*\bopinion of " + KIND, re.I), "no_finding"),
]
SKIP = re.compile(r"\bmay (?:have )?(?:occurred|be occurring|form|express)|\bmight\b|\bwhether\b|\balleg|\bs ?22\b"
                  r"|section 22\b|\bcan form\b|\bable to form\b|\bpower to\b|\bin forming\b|\bbefore forming\b"
                  r"|\bnot,? and is not to be taken\b|\bmust\b|\bwould\b|\bcould\b|\btentative\b|\bwhenever\b"
                  r"|\bis not to be taken\b|\bpreliminary\b|\bjurisdiction to\b|\bpermits?\b|\bempowered\b"
                  r"|^(?:When|To form|If|Where|Before|Although|While|Unless)\b|\blegal significance\b|\bnot all\b|\blightly\b|\breasons? why\b|\bexplained\b", re.I)
MISCONDUCT = re.compile(r"\bmisconduct\b", re.I)
FOOTNOTE_TAIL = re.compile(r"(?<=[.;])\d{0,3}\s+\d{1,3}\s+(?=[A-Z(])")


def page_text(page):
    """Single-line text of a page without its running header line and bare paragraph numbers."""
    lines = [l for l in page.splitlines() if not PARA_NUM.match(l)]
    return common.flat("\n".join(lines))


def sentences(text):
    for s in SENTENCE_END.split(text):
        s = s.strip()
        if s:
            yield s


def opinion_label(sentence, kind):
    found = []
    for m in re.finditer(r"\b(serious misconduct|police misconduct|misconduct)\b", sentence, re.I):
        k = m.group(1).lower()
        if k not in found and not any(k in f for f in found):
            found.append(k)
    found = found or ["misconduct"]
    prefix = "no opinion of " if kind == "no_finding" else "opinion of "
    return "; ".join(prefix + k for k in found)


def tidy_sentence(s, page=""):
    s = re.sub(r"^(?:\d{1,4}\s+)+(?=[A-Z(])", "", s)  # paragraph numbers glued to the sentence
    m = FOOTNOTE_TAIL.search(s)
    if m:
        s = s[:m.start()]  # footnote text after the sentence's full stop
    s = re.sub(r"(?<=[.;])\d{1,3}$", "", s)  # trailing footnote marker
    # a heading glued before the sentence ("Conclusion The Commission has formed ...")
    for line in page.splitlines():  # a heading line of the page glued before the sentence
        head = common.clean(line)
        if head and len(head.split()) <= 8 and not re.search(r"[.;:,]$", head) and s.startswith(head + " ") \
                and re.match(r"^[A-Z]", s[len(head) + 1:]):
            s = s[len(head) + 1:]
            break
    # strip it only when that text is a line of its own on the page
    m = re.search(r"^(.{3,70}?)\s+(?=The Commission (?:has|had|is|formed|forms|also|does|did|therefore)\b)", s)
    if m and any(common.clean(l) == common.clean(m.group(1)) for l in page.splitlines()):
        s = s[m.end():]
    return s.strip()


def extract_opinions(pages, pdf_url, doc_title):
    """Sentences in which the Commission states an opinion of misconduct it formed, or that it formed none."""
    out, seen = [], set()
    for i, page in enumerate(pages, 1):
        text = page_text(page)
        if not MISCONDUCT.search(text) or "opinion" not in text.lower():
            continue
        for raw in sentences(text):
            s = tidy_sentence(raw, page)
            if len(s) < 30 or len(s) > 700 or not s.endswith((".", ";", ":")) or not re.match(r"^[A-Z(]", s):
                continue
            if not MISCONDUCT.search(s) or SKIP.search(s) or SKIP.search(raw):
                continue
            kind = next((k for pat, k in STATED if pat.search(s)), None)
            if kind is None:
                continue
            key = re.sub(r"\W+", " ", s.lower()).strip()
            if key in seen:
                continue
            seen.add(key)
            try:
                out.append(common.finding(opinion_label(s, kind), kind, s,
                                          common.cite(f"{pdf_url}#page={i}", doc_title, i), page))
            except ValueError:
                continue  # the sentence spans a removed paragraph number or heading line: not verbatim as one span
    return out


NUMBER_WORDS = {w: i for i, w in enumerate(
    "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen "
    "eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five".split(), 1)}
REC_HEAD = re.compile(r"^\s*(?:RECOMMENDATION|Recommendation)\s+(\d{1,3}|[A-Za-z]+(?:-[A-Za-z]+)?)\b\s*[:.\-\u2013]?\s*(.*)$")
SECTION_HEAD = re.compile(r"^\s*(?:(?:the )?commission'?s (?:opinions? and )?)?recommendations?\s*$", re.I)
RESPONSE_LINE = re.compile(r"^\s*((?!.*\bCommission\b)(?:\S+\s+){0,5}?\S+)\s+response to (?:this|the) recommendations?\s*:\s*$", re.I)
LETTER = re.compile(r"^\s*\(([a-z]{1,2})\)\s*(.*)$")
FOOTNOTE = re.compile(r"^\s*\d{1,3}\s+(?:See\b|Exhibit\b|Transcript\b|Corruption,|Ibid|[A-Z][\w ,.'-]*\b(?:Act|Rule|Regulations?)\b|https?:)")
BULLET_ONLY = re.compile(r"^\s*[\u2022\uf0b7\u25aa\u25cf\uf0a7]\s*$")
BULLET_LEAD = re.compile(r"^\s*[\u2022\uf0b7\u25aa\u25cf\uf0a7]\s+")
NEXT_REC = re.compile(r"^\s*(?:The Commission (?:also |further )?(?:makes the following recommendation|recommends)|"
                      r"(?:RECOMMENDATION|Recommendation)\s+\w+|CHAPTER|Chapter|APPENDIX|Appendix)\b")
DOT_LEADER = re.compile(r"\.{5,}|\u2026{2,}")


def rec_number(token):
    if token.isdigit():
        return int(token)
    return NUMBER_WORDS.get(token.lower())


def body_lines(pages, i):
    """Lines of page i without the running header (two lines before the page number) and footnotes."""
    lines = pages[i].splitlines()
    head = 0
    for k, l in enumerate(lines[:5]):
        if re.match(r"^\s*\d{1,3}\s*$", l):
            head = k + 1
            break
    out = []
    for l in lines[head:]:
        if FOOTNOTE.match(l):
            break
        out.append(l)
    return out


def stop_line(line, relaxed=False):
    t = line.strip()
    if REC_HEAD.match(line) or RESPONSE_LINE.match(line) or PARA_NUM.match(line):
        return True
    if re.match(r"^(?:CHAPTER|Chapter|APPENDIX|Appendix|Endnotes|ENDNOTES)\b", t):
        return True
    if relaxed:
        return False
    if t and t.isupper() and len(t) > 6 and not LETTER.match(t):
        return True
    words = t.split()
    if t and re.match(r"^[A-Z]", t) and not re.search(r"[.,;:)]$", t) and not LETTER.match(t):
        if len(words) <= 3:
            return True  # a short heading line ("Background", "Commission report")
        if len(words) <= 8 and sum(w[:1].isupper() for w in words) >= len(words) - 1:
            return True  # a Title Case heading line
    return False


def run_text(pages, i, lines, stop_at_letter=False):
    """Text from ``lines`` (a tail of page i) to the first stop line, continuing on page i + 1.

    A blank line ends the text unless the text so far ends with a colon (a list follows). Text
    that does not end with sentence punctuation is retried with only structural stops; if it
    still does not end cleanly the caller drops it rather than keep a truncated extract."""
    tail = lines + ["\f"] + (body_lines(pages, i + 1) if i + 1 < len(pages) else [])
    for relaxed in (False, True):
        body = []
        for l in tail:
            if l == "\f":
                continue
            if not l.strip():
                if body and not common.flat("\n".join(body)).endswith(":"):
                    break
                continue
            if body and re.match(r"^\s*[\u2022\uf0b7\u25aa\u2013-]\s", l) and common.flat("\n".join(body)).endswith("."):
                break  # bullets after a complete sentence are not part of it (e.g. an agency's actions)
            if stop_line(l, relaxed) or (stop_at_letter and LETTER.match(l)) \
                    or re.match(r"^\s*(?:The Commission (?:makes|commends|will)|WA Police advised)\b", l):
                break
            body.append(l)
        text = common.flat("\n".join(body))
        if re.search(r"[.;)]$", text):
            return text, True
    return text, False


def source_for(pages, i):
    return pages[i] + "\n" + ("\n".join(body_lines(pages, i + 1)) if i + 1 < len(pages) else "")


def _rec(number, text, pages, i, pdf_url, doc_title):
    text = re.sub(r"(?<=[.;])\d{1,3}$", "", text or "").strip()  # trailing footnote marker
    if len(text) < 15 or len(text) > 3000 or not re.search(r"[.;)]$", text):
        return None
    if len(text) < 80 and re.search(r"\b(?:these|those|the above|the following)\b", text, re.I):
        return None  # a lead-in that points at text elsewhere ("adoption of all these measures")
    try:
        return common.recommendation(number, text, common.cite(f"{pdf_url}#page={i + 1}", doc_title, i + 1),
                                     source_for(pages, i))
    except ValueError:
        return None


def numbered_recommendations(pages, pdf_url, doc_title):
    """None when one number heads two different texts (several series, e.g. a review restating the
    recommendations of earlier reports); [] when there are none or the sequence is broken."""
    found, signatures = {}, {}
    for i in range(len(pages)):
        lines = body_lines(pages, i)
        for j, line in enumerate(lines):
            m = REC_HEAD.match(line)
            if not m or DOT_LEADER.search(line):
                continue
            n = rec_number(m.group(1))
            rest = m.group(2).strip()
            if n is None:
                continue
            if rest and re.match(r"^(?:of|and|to|in|was|were|has|is|made|that the commission|\d)\b", rest, re.I):
                continue
            text, ok = run_text(pages, i, ([rest] if rest else []) + lines[j + 1:])
            sig = re.sub(r"\W+", " ", text.lower()).strip()[:40]
            if sig:
                signatures.setdefault(n, set()).add(sig)
            if n in found:
                continue
            rec = _rec(m.group(1), text, pages, i, pdf_url, doc_title) if ok else None
            if rec:
                found[n] = rec
    if any(len(v) > 1 for v in signatures.values()):
        return None
    nums = sorted(found)
    if not nums or nums != list(range(1, len(nums) + 1)):
        return []  # a broken sequence means the layout was not read correctly
    return [found[n] for n in nums]


def section_recommendations(pages, pdf_url, doc_title):
    """Unnumbered recommendations inside a "Recommendations" section: a lettered list introduced by
    a sentence that recommends and ends with a colon gives one recommendation per letter; otherwise
    each paragraph in which the Commission recommends (or "makes the following recommendation")
    is one recommendation, with number null."""
    out, seen = [], set()
    starts = [(i, j) for i in range(len(pages)) for j, l in enumerate(body_lines(pages, i))
              if SECTION_HEAD.match(l) and not DOT_LEADER.search(l)]
    for i, j in starts:
        # a bullet glyph on its own line separates paragraphs; a leading glyph is not part of the text
        lines = []
        for l in body_lines(pages, i)[j + 1:]:
            if BULLET_ONLY.match(l):
                lines.append("")
            elif BULLET_LEAD.match(l):
                lines += ["", BULLET_LEAD.sub("", l)]
            else:
                lines.append(l)
        k = 0
        while k < len(lines):
            line = lines[k]
            if RESPONSE_LINE.match(line):
                # the agency's response printed under a recommendation: skip to the next recommendation
                k += 1
                while k < len(lines) and not NEXT_REC.match(lines[k]):
                    k += 1
                continue
            if stop_line(line) and not PARA_NUM.match(line):
                break
            if PARA_NUM.match(line) or not line.strip():
                k += 1
                continue
            # one paragraph: up to the next paragraph number, blank line or stop line
            para = []
            while k < len(lines) and lines[k].strip() and not PARA_NUM.match(lines[k]) and not (para and stop_line(lines[k])):
                para.append(lines[k])
                k += 1
            text = common.flat("\n".join(para))
            leads_list = text.endswith(":") and re.search(r"\brecommend|\bmakes the following\b", text, re.I) is not None
            if not leads_list and (not re.search(r"\brecommend(?:s|ation)?\b", text, re.I) or not re.search(r"\bCommission\b", text)):
                # e.g. the recommendation text on the lines after "makes the following recommendation to X:"
                if out and out[-1][0] == "lead" and text:
                    rec = _rec(None, text, pages, i, pdf_url, doc_title)
                    if rec and rec["text"].lower() not in seen:
                        seen.add(rec["text"].lower())
                        out[-1] = ("rec", rec)
                continue
            if leads_list and k < len(lines) and LETTER.match(lines[k] if lines[k].strip() else (lines[k + 1] if k + 1 < len(lines) else "")):
                while k < len(lines):
                    if not lines[k].strip():
                        k += 1
                        continue
                    m = LETTER.match(lines[k])
                    if not m:
                        break
                    item, _ = run_text(pages, i, ([m.group(2)] if m.group(2).strip() else []) + lines[k + 1:], stop_at_letter=True)
                    k += 1
                    while k < len(lines) and not LETTER.match(lines[k]) and not stop_line(lines[k]):
                        k += 1
                    rec = _rec(m.group(1), item, pages, i, pdf_url, doc_title)
                    if rec and rec["text"].lower() not in seen:
                        seen.add(rec["text"].lower())
                        out.append(("rec", rec))
                continue
            if re.search(r"makes the following recommendations? to [^:]+:\s*(?:\d+)?$", text):
                out.append(("lead", None))
                continue
            if re.search(r"\b(?:Commission|it) (?:also |further |therefore )?recommends\b|\brecommendations? (?:is|are) (?:that|made)\b", text):
                full, _ = run_text(pages, i, para) if k >= len(lines) else (text, True)
                # a paragraph holding several "The Commission (also) recommends" sentences gives one each
                parts = re.split(r"(?<=[.;])\s+(?=The Commission (?:also |further )?recommends\b)", full)
                for part in parts:
                    rec = _rec(None, part, pages, i, pdf_url, doc_title)
                    if rec and rec["text"].lower() not in seen:
                        seen.add(rec["text"].lower())
                        out.append(("rec", rec))
        # only the first section that yields recommendations
        if any(t == "rec" for t, _ in out):
            break
    return [r for t, r in out if t == "rec"]


def extract_recommendations(pages, pdf_url, doc_title):
    numbered = numbered_recommendations(pages, pdf_url, doc_title)
    if numbered is None:
        return []  # ambiguous numbering: leave not_extracted rather than mix series
    return numbered or section_recommendations(pages, pdf_url, doc_title)


def per_recommendation_responses(pages, pdf_url, doc_title, recs):
    """Agency responses printed after each recommendation ("WA Police response to this recommendation:")."""
    out = []
    for i in range(len(pages)):
        lines = body_lines(pages, i)
        for j, line in enumerate(lines):
            m = RESPONSE_LINE.match(line)
            if not m:
                continue
            text, _ = run_text(pages, i, lines[j + 1:])
            if len(text) < 15 or not common.verbatim(text, source_for(pages, i)):
                continue
            prior = [r for r in recs if r["cite"]["page"] <= i + 1]
            number = prior[-1]["number"] if prior and prior[-1]["number"] is not None and len(prior) <= len(recs) else None
            out.append(common.response("agency_response", common.clean(line).rstrip(":"), f"{pdf_url}#page={i + 1}",
                                       recommendation=number, text=text,
                                       citation=common.cite(f"{pdf_url}#page={i + 1}", doc_title, i + 1)))
    return out


RESPONDER = re.compile(r"\b(?:Police|University|Department|Authority|Office|Service|Corporation|Council|Shire|City of|Town of"
                       r"|Commissioner|Ombudsman|Auditor General|Health|Communities|Transport|Justice|Corrective|Main Roads"
                       r"|Water Corporation|Western Power|Horizon Power|LandCorp|Landgate|DoT|DoJ|PTA|OAG|DPC|Agency)\b")
RESPONSE_HEAD = re.compile(r"^\s*((?:Appendix\s+\w+\s*[:\-–]?\s*)?(?:The\s+)?([A-Z][\w.&'’ -]{1,70}?)['’]s\s+[Rr]esponses?"
                           r"(?:\s+to\s+(?:the\s+)?(?:draft\s+)?(?:report|recommendations?|Commission's\s+(?:draft\s+)?report))?)\s*$")


def extract_responses(pages, pdf_url, doc_title, recs=()):
    """Per-recommendation agency responses with their text, and headings that introduce an agency's
    response to the report or its recommendations (the heading only; its pages are cited)."""
    out, seen = per_recommendation_responses(pages, pdf_url, doc_title, list(recs)), set()
    for i in range(len(pages)):
        for line in body_lines(pages, i):
            m = RESPONSE_HEAD.match(line)
            if not m or DOT_LEADER.search(line) or len(line.split()) > 12:
                continue
            title, who = common.clean(m.group(1)), m.group(2)
            if "Commission" in who and "Commissioner" not in who or not RESPONDER.search(who) or title.lower() in seen:
                continue
            seen.add(title.lower())
            out.append(common.response("agency_response", title, f"{pdf_url}#page={i + 1}",
                                       citation=common.cite(f"{pdf_url}#page={i + 1}", doc_title, i + 1, section=title)))
    return out


def cover_date(pages):
    for page in pages[:2]:
        m = DATE_LINE.search(page)
        if m:
            return iso(*m.groups())
    return None


# ---- subjects -----------------------------------------------------------------------------

AGENCY = re.compile(
    r"\b(?:the\s+)?((?:Shire|City|Town) of [A-Z][\w']+(?: [A-Z][\w']+)?"
    r"|Department (?:of|for) [A-Z][\w,']*(?:(?: and| of| for)? [A-Z][\w']*)*"
    r"|WA Police(?: Force)?|Western Australia Police(?: Force)?|Public Transport Authority|Health Support Services"
    r"|North Metropolitan Health Service|WA Health|Main Roads|Water Corporation|Western Power|Horizon Power|LandCorp"
    r"|Landgate|Murdoch University|Curtin University of Technology|Road Safety Commission"
    r"|Government Employees Housing Authority|Office of the Auditor General|Casuarina Prison|Hakea Prison"
    r"|Eastern Goldfields Regional Prison|Bunbury Regional Prison|Department of Corrective Services"
    r"|Western Australian Parliamentary Commissioner for Administrative Investigations"
    r"|Parliamentary Commissioner for Administrative Investigations)\b")
ROLE = re.compile(
    r"\b(?:a |two |certain )?((?:[Ss]enior [Oo]fficer|police officers?|[Pp]olice [Oo]fficers|[Cc]ouncillors|managers|"
    r"custodial officers|vehicle examiners|[Ll]ocal [Gg]overnment [Ee]mployee|Lord Mayor|Mayor|Commissioner of Police|"
    r"Director General|Chief Executive Officer|Members of Parliament|MLA|WA Commissioner in Japan|"
    r"sessional academic|employees?|public officers?))\b")


def subjects_from_title(title, page_url):
    out, seen = [], set()
    c = common.cite(page_url, "Report page title", section="title")
    for m in AGENCY.finditer(title):
        name = m.group(1).rstrip(" ,")
        # trim title words that run on after the agency name ("Department of Transport's", "... Response")
        name = re.sub(r"['\u2019]s$", "", name)
        name = re.sub(r"\s+(?:Response|Leaks|Report|Review|Investigation|Recommendations?)\b.*$|\s+of WA$", "", name)
        if name.lower() not in seen:
            seen.add(name.lower())
            out.append(common.subject(name, "body", c))
    for m in ROLE.finditer(title):
        name = m.group(1)[:1].upper() + m.group(1)[1:]
        if name.lower() not in seen:
            seen.add(name.lower())
            out.append(common.subject(name, "public_role", c))
    return out


# ---- collect ------------------------------------------------------------------------------

def _get(client, url, kind):
    """One GET with two retries on a dropped connection (the host occasionally resets)."""
    for attempt in range(3):
        try:
            return client.get(url, kind)
        except requests.exceptions.RequestException:
            if attempt == 2:
                return False
            time.sleep(30)


def record_key(page_url):
    """The page slug; a slug longer than the 60 characters common.report_record keeps is cut and given
    a short hash of the whole slug, so two reports of one day whose slugs share a long prefix (the two
    Eastern Goldfields use of force reports of 27 June 2018) keep distinct ids."""
    key = page_url.rstrip("/").rsplit("/", 1)[-1]
    if len(key) <= 60:
        return key
    return key[:51].rstrip("-") + "-" + hashlib.sha1(key.encode()).hexdigest()[:8]


def build_record(client, item):
    html = _get(client, item["href"], "html")
    if not html:
        return None
    html = html.decode("utf-8", "replace")
    groups, summary = parse_page(html, item["href"])
    title = item["title"]
    if EXCLUDE.search(title):
        return None
    report_docs = [(g, d) for g, docs in groups if g in ("Report", "Report Summary", "Annual Report", "Quarterly Report")
                   for d in docs]
    rtype = report_type(title)
    notes = [NOTE_TYPE]
    documents, findings, recs, responses = [], [], [], []
    main_pdf, main_pages, main_title = None, None, None
    seen_urls = set()
    for heading, (doc_title, url) in report_docs:
        if url in seen_urls:
            continue
        seen_urls.add(url)
        data = _get(client, url, "pdf")
        role = "summary" if heading == "Report Summary" or re.search(r"\bsummary\b", doc_title or "", re.I) else "report"
        if not data:
            documents.append(common.document(role, doc_title, url, status="unavailable"))
            continue
        pages = common.pdf_pages(data)
        documents.append(common.document(role, doc_title, url, data, len(pages)))
        if heading != "Report" and heading != "Report Summary":
            notes.append(f"The Commission's page files this report under the heading {heading}.")
        if role == "report" and main_pdf is None:
            main_pdf, main_pages, main_title = url, pages, doc_title
    for heading, docs in groups:
        if heading == "Media Release":
            for doc_title, url in docs:
                documents.append(common.document("media_release", doc_title, url, status="linked"))
    date, basis = None, None
    m = TABLED.search(summary or "")
    if m:
        date, basis = iso(*m.groups()), "tabled"
    elif main_pages and cover_date(main_pages):
        date, basis = cover_date(main_pages), "dated"
    else:
        date, basis = item["listed"], "published"
        notes.append("Date is the date the Commission's report page was published; the report states no date OPAX read.")
    checked = False
    if main_pages is not None:
        text_chars = sum(len(p.strip()) for p in main_pages)
        if text_chars < 200 * max(1, len(main_pages)) // 4:
            notes.append("The report PDF has little or no text layer; nothing was extracted from it.")
        else:
            findings = extract_opinions(main_pages, main_pdf, main_title)
            recs = extract_recommendations(main_pages, main_pdf, main_title)
            responses = extract_responses(main_pages, main_pdf, main_title, recs)
            checked = True
        if any(f["kind"] == "opinion" for f in findings):
            notes.append(NOTE_OPINION)
    else:
        notes.append("The Commission's page links no report PDF; only the page and any media release are recorded.")
    if re.search(r"response to (?:draft report|commission recommendations)", title, re.I) and main_pdf:
        responses.insert(0, common.response("agency_response", title, main_pdf, date=date,
                                            citation=common.cite(main_pdf, main_title, 1)))
    elif re.search(r"implementation of recommendations|review of recommendations|balance of recommendations|"
                   r"final review of recommendations|recommendation review|action into recommendation|"
                   r"response to commission recommendations", title, re.I) and main_pdf:
        responses.insert(0, common.response("implementation_report", title, main_pdf, date=date,
                                            citation=common.cite(main_pdf, main_title, 1)))
    return common.report_record(
        BODY, title=title, page_url=item["href"], report_type=rtype, type_as_published="Report",
        date=date, date_basis=basis, pdf_url=main_pdf, documents=documents,
        subjects=subjects_from_title(title, item["href"]),
        findings=findings, findings_status="extracted" if findings else "not_extracted",
        recommendations=recs, recommendations_status="extracted" if recs else "not_extracted",
        responses=responses, responses_status="published" if responses else ("none_found" if checked else "not_checked"),
        notes=notes, summary=summary, key=record_key(item["href"]))


def collect(client):
    items, page = [], 0
    while True:
        html = client.html(LISTING.format(page=page))
        if html is None:
            raise common.Held(f"reports listing page {page} missing")
        found, has_next = parse_listing(html)
        items.extend(found)
        if not has_next or not found or page > 20:
            break
        page += 1
    if len(items) < MIN_RECORDS:
        raise common.Held(f"reports listing has {len(items)} items (minimum {MIN_RECORDS})")
    records = []
    for item in items:
        rec = build_record(client, item)
        if rec is not None:
            records.append(rec)
    return records
