"""Independent Broad-based Anti-corruption Commission (Victoria), from its tabled copies.

www.ibac.vic.gov.au answered the identifying agent with HTTP 403 (CloudFront) on 11
November 2026, for the home page and for /robots.txt alike. OPAX does not work around
that. IBAC's public reports to Parliament are tabled, and the Parliament of Victoria
publishes each tabled paper and its PDF in its tabled documents database, which answers
the agent and whose robots policy places no restriction on it. This adapter reads that
database (www.parliament.vic.gov.au/api/search/tabledpapers and the tabled-document
details pages):

  * every paper whose author the database records as IBAC (alone, or jointly with the
    Victorian Ombudsman), and IBAC's statutory reports listed without an author;
  * the Government's tabled responses to IBAC recommendations, attached to the report
    they answer by operation name.

Untabled IBAC publications (research and prevention reports, recommendation-progress
pages, agency responses IBAC publishes on its own site) are not reachable and are listed
as gaps. Reports of the parliamentary IBAC Committee, the Integrity and Oversight
Committee and the Victorian Inspectorate are not IBAC's reports and are excluded.

Recommendations are cut only from reports that number them under "Recommendation N"
headings. The first complete run 1..N is taken (reports list them in a summary and repeat
them in the body); a later repeated number ends the run. Each recommendation is the
report's text, with running headers and page furniture removed, and cites the tabled PDF
and the page its heading is on. Any report whose run is not a clean 1..N sequence keeps
recommendations_status not_extracted. Findings are not extracted: IBAC's reports state
findings and opinions in narrative form, and OPAX will not label them by inference.
"""
from __future__ import annotations

import json
import re
from urllib.parse import urlencode

from parli.ingest import pdf_recommendations
from parli.ingest.integrity import common

PV = "https://www.parliament.vic.gov.au"
SEARCH = PV + "/api/search/tabledpapers"
DETAIL = PV + "/parliamentary-activity/tabled-documents-database/tabled-document-details/"
TERMS = ("Independent Broad-based Anti-corruption Commission", "IBAC")

BODY = common.Body(
    code="vic_ibac", name="Independent Broad-based Anti-corruption Commission", short="IBAC", jurisdiction="Vic",
    site="https://www.ibac.vic.gov.au", hosts=("www.parliament.vic.gov.au",), interval=2.0, max_requests=700,
    licence={"status": "parliament-tabled-copy", "url": PV + "/copyright/",
             "attribution": "Independent Broad-based Anti-corruption Commission; tabled copy published by the Parliament of Victoria"},
)
GAPS = [
    "www.ibac.vic.gov.au answered the identifying OPAXBot agent with HTTP 403 (CloudFront) on 11 November 2026, for its pages "
    "and its robots.txt. IBAC reports are read from the copies tabled in the Parliament of Victoria instead.",
    "IBAC publications that are not tabled (research and prevention reports, recommendation-progress pages and agency "
    "responses published only on IBAC's site) are therefore not loaded.",
    "Some tabled papers are listed by the Parliament without an online document (for example the Special report on "
    "Operation Sandon, available on request from the Parliament); their recommendations are not loaded.",
    "Findings and opinions are not extracted; read each report for them.",
]
MIN_RECORDS = 60

AUTHORS = {"Independent Broad-based Anti-corruption Commission",
           "Independent Broad-based Anti-corruption Commission and Ombudsman"}
UNAUTHORED_REPORT = re.compile(r"^Independent Broad-based Anti-corruption Commission Report to ", re.I)
RESPONSE = re.compile(r"^Government response\b.*?\b(?:IBAC|Independent Broad-based Anti-corruption Commission)(?:’s|'s)?\s+(?!Committee)", re.I)
STATUTORY = {"Surveillance Devices Act 1999", "Crimes (Assumed Identities) Act 2004", "Crimes Act 1958", "Firearms Act 1996",
             "Sex Offenders Registration Act 2004", "Terrorism (Community Protection) Act 2003"}
OPERATIONS = re.compile(r"\bOperations?\s+((?:[A-Z][a-z]+)(?:(?:,\s*|\s+and\s+)(?!IBAC\b)[A-Z][a-z]+)*)")
MONTHS = {m: i + 1 for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august",
                                          "september", "october", "november", "december"])}
# Public bodies IBAC names in its report titles. Matched only as written in the title.
TITLE_BODIES = re.compile(
    r"\b(Department of (?:Education and Training|Transport|Health|Justice and Community Safety|Premier and Cabinet)|"
    r"Victoria Police|Ambulance Victoria|Bendigo Health|Public Transport Victoria|Corrections Victoria|"
    r"Dame Phyllis Frost Centre|Victorian Inspectorate|Victorian Ombudsman|Melbourne Water|VicRoads|V/Line|"
    r"City of [A-Z][a-z]+(?: [A-Z][a-z]+)?|[A-Z][a-z]+ (?:City|Shire|Rural City) Council)\b")


def is_ibac(hit):
    c = hit.get("content") or {}
    author, title = (c.get("subtitle") or "").strip(), (c.get("title") or "").strip()
    if author in AUTHORS or (not author and UNAUTHORED_REPORT.search(title)):
        return "report"
    if not author and RESPONSE.search(title):
        return "government_response"
    return None


def iso_date(text):
    m = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", text or "")
    if not m or m.group(2).lower() not in MONTHS:
        return None
    return f"{int(m.group(3)):04d}-{MONTHS[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"


def detail_fields(page_html):
    """Tabled dates, authority, section and notes from a tabled-document details page."""
    m = re.search(r"<main\b.*?</main>", page_html, re.S | re.I)
    text = re.sub(r"<(script|style)\b.*?</\1>", " ", m.group(0) if m else page_html, flags=re.S | re.I)
    text = re.sub(r"\s+", " ", common.clean(re.sub(r"<[^>]+>", " ", text)) or "")
    import html as htmllib
    text = htmllib.unescape(text)
    i = text.find(" Details ")
    block = text[i:].split(" Documents ")[0].split(" View all Tabled")[0] if i >= 0 else ""
    stop = r"(?=Tabled in the|Released on|Authority:|Section:|Notes\b|$)"

    def field(label):
        f = re.search(re.escape(label) + r"\s*(.*?)\s*" + stop, block)
        return f.group(1).strip() if f else None
    notes = re.search(r"\bNotes\s+(.*)$", block)
    return {"tabled_la": iso_date(field("Tabled in the LA:")), "tabled_lc": iso_date(field("Tabled in the LC:")),
            "released": iso_date(field("Released on a non-sitting day:")), "authority": field("Authority:"),
            "section": field("Section:"), "notes": (notes.group(1).strip() or None) if notes else None}


def report_type(title, authority, author):
    t = title.strip()
    if authority in STATUTORY or re.search(r"\bunder s(?:ection)?\b|\bpursuant to\b|Report to (?:the )?Minister|"
                                           r"Report to the Attorney-General|Biennial Ministerial Report", t, re.I):
        return "other", "Report under legislation (" + (authority or "statutory") + ")"
    if re.match(r"Annual Plan", t, re.I):
        return "other", "Annual plan"
    if re.fullmatch(r"Report \d{4}-\d{2}", t):
        return "other", "Annual report"
    if re.search(r"\bprogress report\b", t, re.I):
        return "other", "Progress report"
    if re.match(r"Operation [A-Z][a-z]+\s*:", t):
        return "investigation_report", "Investigation report"
    if re.search(r"special report", t, re.I):
        return "special_report", "Special report"
    return "other", None


def operations(title):
    found = []
    for m in OPERATIONS.finditer(title):
        for name in re.split(r",\s*|\s+and\s+", m.group(1)):
            if name and name not in found:
                found.append(name)
    return found


# ---- recommendations ------------------------------------------------------------------------

HEADING = pdf_recommendations.HEADING
NOISE = [re.compile(p, re.I) for p in (
    r"^www\.ibac\.vic\.gov\.au(?:\s+\d+)?$", r"^\d+\s+www\.ibac\.vic\.gov\.au$",
    r"^Recommendation\s+Discussion in this report$", r"^Discussion in this report$", r"^IBAC$")]
# Government implementation reports published only on hosts outside this adapter's reach, supplied
# by the OPAX maintainer as byte-identical publisher downloads and cited to the publisher's URL.
# They are documents attached to the IBAC report they answer; nothing is extracted from them.
MANUAL_ACQUISITION = "manual publisher download supplied by the OPAX maintainer, 11 Nov 2026"
MANUAL_RESPONSES = {
    "Sandon": [{
        "kind": "progress_report",
        "title": "Operation Sandon January 2025 progress report to IBAC",
        "url": "https://www.vic.gov.au/sites/default/files/2025-09/Operation-Sandon-January-2025-Progress-Report.pdf",
        "index": "https://www.vic.gov.au/operation-sandon-progress-report",
        "publisher": "Victorian Government",
        "sha256": "4aa8c45ab8233500411d3dcb3f4ee424639a4d9fd6764bbff49c3e428f01544f",
        "pages": 7,
        "note": "A Victorian Government implementation progress report to IBAC on the Operation Sandon recommendations, "
                "not an IBAC report. It is dated January 2025 by its title, with no day, so no date is recorded.",
        "rights": "The document carries no reuse notice. OPAX lists it and links the publisher's copy, and reproduces no text from it.",
    }],
}


def tabled_responder(paper):
    """Who a tabled response is from: the author the Parliament records, else only that it was tabled."""
    return {"publisher": paper["author"]} if paper["author"] else {"tabled_in": "Parliament of Victoria"}


def manual_responses(op):
    out = []
    for m in MANUAL_RESPONSES.get(op, []):
        r = common.response(m["kind"], m["title"], m["url"], None,
                            citation=common.cite(m["index"], m["publisher"] + ", " + m["title"]))
        r.update({"acquisition": MANUAL_ACQUISITION, "publisher": m["publisher"], "sha256": m["sha256"],
                  "pages": m["pages"], "note": m["note"], "rights": m["rights"]})
        out.append(r)
    return out


# Reports about agencies' responses to earlier recommendations quote other reports' numbering.
ABOUT_RECOMMENDATIONS = re.compile(r"responses? to IBAC", re.I)
page_lines = pdf_recommendations.page_lines


def recommendations(pages):
    """IBAC's "Recommendation N" run (see pdf_recommendations.recommendations)."""
    return pdf_recommendations.recommendations(pages, HEADING, NOISE)


def complete(rows, pages):
    return pdf_recommendations.complete(rows, pages, HEADING)


def verified(rows, texts):
    """Each recommendation's lines appear, in order, on the pages they were read from."""
    for _, text, _, lines in rows:
        for pno, line in lines:
            if not common.verbatim(line, texts[pno - 1]):
                return False
    return True


def usable(rows):
    if not rows:
        return False
    if [int(n) for n, *_ in rows] != list(range(1, len(rows) + 1)):
        return False
    return all(25 <= len(t) <= 6000 and re.match(r"[A-Z(‘'“]", t) for _, t, *_ in rows)


# ---- collect --------------------------------------------------------------------------------

def search(client, term):
    hits, page, total = [], 1, None
    while True:
        url = SEARCH + "?" + urlencode({"page": page, "pageSize": 100, "sortType": 30, "term": term})
        body = client.get(url, "html")
        if body is None:
            raise common.Held(f"tabled papers search missing for {term!r}")
        result = json.loads(body).get("result") or {}
        total = result.get("totalMatching", total)
        batch = result.get("hits") or []
        hits += batch
        if not batch or len(hits) >= (total or 0) or page >= 20:
            break
        page += 1
    if total is not None and len(hits) != total:
        raise common.Held(f"tabled papers search {term!r}: {len(hits)} of {total}")
    return hits


def collect(client: common.Client):
    if client.offline:
        cached = client.cache / "hits.json"
        if not cached.exists():
            raise common.Held("vic_ibac: no cached listing")
        hits = json.loads(cached.read_text())
    else:
        hits = {}
        for term in TERMS:
            for h in search(client, term):
                hits[h["id"]] = h
        common.atomic_json(client.cache / "hits.json", hits)
    selected = [(h, kind) for h in hits.values() if (kind := is_ibac(h))]
    if sum(1 for _, k in selected if k == "report") < MIN_RECORDS:
        raise common.Held(f"vic_ibac: only {len(selected)} IBAC tabled papers listed")

    papers = []
    for h, kind in selected:
        c = h["content"]
        pid = int(h["id"].rsplit("_", 1)[1])
        page_url = DETAIL + str(pid)
        page = client.html(page_url)
        if page is None:
            raise common.Held(f"vic_ibac: tabled paper {pid} details missing")
        d = detail_fields(page)
        title = common.clean(c.get("title"))
        files = [f for f in (((c.get("slot") or {}).get("context") or {}).get("files") or []) if f.get("type") == "pdf" and f.get("path")]
        docs, texts = [], {}
        for f in files:
            data = client.get(f["path"], "pdf")
            if data is None:
                docs.append(common.document("tabled_paper", f.get("name") or title, f["path"], status="unavailable"))
                continue
            pages = common.pdf_pages(data)
            texts[f["path"]] = (pages, data)
            docs.append(common.document("tabled_paper", f.get("name") or title, f["path"], data, len(pages)))
        papers.append({"pid": pid, "kind": kind, "title": title, "author": common.clean(c.get("subtitle")),
                       "authority": common.clean(c.get("description")) or d["authority"], "released_listed": iso_date(c.get("context")),
                       "detail": d, "page_url": page_url, "docs": docs, "texts": texts})

    responses_by_op = {}
    for p in papers:
        if p["kind"] == "government_response":
            date = p["detail"]["tabled_la"] or p["detail"]["tabled_lc"] or p["released_listed"]
            for op in operations(p["title"]):
                responses_by_op.setdefault(op, []).append(common.response(
                    "agency_response", p["title"], p["docs"][0]["url"] if p["docs"] else p["page_url"], date,
                    citation=common.cite(p["page_url"], "Parliament of Victoria tabled documents database, tabled paper " + str(p["pid"]))))
                responses_by_op[op][-1].update(tabled_responder(p))
    progress_by_op = {}
    for p in papers:
        if p["kind"] == "report" and re.search(r"\bprogress report\b", p["title"], re.I):
            for op in operations(p["title"]):
                progress_by_op.setdefault(op, []).append(common.response(
                    "progress_report", p["title"], p["docs"][0]["url"] if p["docs"] else p["page_url"],
                    p["detail"]["released"] or p["detail"]["tabled_la"] or p["released_listed"],
                    citation=common.cite(p["page_url"], "Parliament of Victoria tabled documents database, tabled paper " + str(p["pid"]))))
                progress_by_op[op][-1].update(tabled_responder(p))

    records = []
    for p in papers:
        if p["kind"] != "report":
            continue
        d = p["detail"]
        rtype, as_published = report_type(p["title"], p["authority"], p["author"])
        if d["released"]:
            date, basis = d["released"], "published"
        elif d["tabled_la"] or d["tabled_lc"]:
            date, basis = min(x for x in (d["tabled_la"], d["tabled_lc"]) if x), "tabled"
        elif p["released_listed"]:
            date, basis = p["released_listed"], "published"
        else:
            date = basis = None
        ops = operations(p["title"])
        source = common.cite(p["page_url"], "Parliament of Victoria tabled documents database, tabled paper " + str(p["pid"]))
        subjects = []
        for m in TITLE_BODIES.finditer(p["title"]):
            if m.group(1) not in [s["name"] for s in subjects]:
                subjects.append(common.subject(m.group(1), "body", {**source, "section": "report title"}))
        recs, rec_status, notes = [], "not_extracted", []
        pdf_url = p["docs"][0]["url"] if p["docs"] else None
        extract = rtype in ("investigation_report", "special_report") and not ABOUT_RECOMMENDATIONS.search(p["title"])
        for url, (pages, data) in (p["texts"].items() if extract else ()):
            lines = page_lines(data)
            rows = recommendations(lines)
            if usable(rows) and complete(rows, lines) and verified(rows, pages):
                doc_title = p["title"] + " (tabled PDF)"
                recs = [{"number": n, "text": t, "cite": common.cite(url, doc_title, page)} for n, t, page, _ in rows]
                rec_status, pdf_url = "extracted", url
                break
        if not p["docs"]:
            notes.append("The Parliament's database lists this paper without an online document"
                         + (f": {d['notes']}" if d["notes"] else "") + ".")
        if p["author"] and "Ombudsman" in p["author"]:
            notes.append("A joint report of IBAC and the Victorian Ombudsman.")
        tabled = [f"Legislative Assembly {d['tabled_la']}" if d["tabled_la"] else None,
                  f"Legislative Council {d['tabled_lc']}" if d["tabled_lc"] else None]
        if any(tabled):
            notes.append("Tabled: " + "; ".join(t for t in tabled if t) + ".")
        if d["authority"] or p["authority"]:
            notes.append("Authority: " + (p["authority"] or d["authority"]) + (f", section {d['section']}" if d["section"] else "") + ".")
        responses = []
        for op in ops:
            responses += responses_by_op.get(op, []) + ([r for r in progress_by_op.get(op, []) if r["title"] != p["title"]])
            if rtype in ("investigation_report", "special_report"):
                responses += [r for r in manual_responses(op) if r["url"] not in {x["url"] for x in responses}]
        records.append(common.report_record(
            BODY, title=p["title"], page_url=p["page_url"], report_type=rtype, date=date, date_basis=basis,
            operation=", ".join(ops) or None, type_as_published=as_published, pdf_url=pdf_url, documents=p["docs"],
            subjects=subjects, recommendations=recs, recommendations_status=rec_status,
            responses=responses, responses_status="published" if responses else "not_checked",
            notes=notes, key=f"tp{p['pid']}-{p['title']}"))
    return records
