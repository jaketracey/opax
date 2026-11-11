"""ACT Integrity Commission: investigation and special reports.

Source: the Commission's own list, https://www.integrity.act.gov.au/investigations/commission-reports
(an accordion of financial years; each report is a PDF under /__data/assets/pdf_file/). robots.txt
sets Crawl-delay: 20, which the shared client honours, so a full run is about 15 requests.

Findings. ACT reports state their conclusions in prose, not in a numbered findings list. For each
report this adapter carries the exact sentences that state the Commission's conclusion (in the
letter to the Speaker, the outline of findings or the concluding section) and the page they are on.
Every sentence is checked word for word against the PDF text at run time; a sentence that no
longer appears is dropped and the record falls back to ``not_extracted``. ``label`` is the phrase
the report itself uses (for example "serious corrupt conduct", "no finding of corrupt conduct",
"no reasonable suspicion of corrupt conduct"); special reports that dismissed or discontinued a
corruption report carry kind ``other``, because the Commission made no finding either way.

Recommendations. No published ACT report carries a numbered list of the Commission's own
recommendations; the numbered "Recommendation N" passages in Operation Luna Part One, Operation
Raven and the Lyrebird reports quote the Auditor-General or the Public Accounts Committee and are
not recorded. Records say ``not_extracted`` with a note.

Responses. Ministerial responses to special reports are presented to the Legislative Assembly, not
published on the Commission's site; ``none_found`` after checking the report and operation pages.
A report listed without a curated entry is still recorded (title, type, PDF), with findings
``not_extracted`` and no date until reviewed.
"""
from __future__ import annotations

from urllib.parse import urljoin

from bs4 import BeautifulSoup

from parli.ingest.integrity import common

SITE = "https://www.integrity.act.gov.au"
LIST = SITE + "/investigations/commission-reports"
BODY = common.Body(
    "act_ic", "ACT Integrity Commission", "ACT Integrity Commission", "ACT", SITE, interval=3.0, max_requests=60,
    licence={"status": "commission-copyright", "url": SITE + "/copyright",
             "attribution": "ACT Integrity Commission",
             "terms": "Copyright owned by the ACT Integrity Commission; material may be reproduced in unaltered "
                      "form for personal, educational or non-commercial use with attribution (copyright page)."},
)
MIN_RECORDS = 10
GAPS = (
    "Confidential reports given to a Legislative Assembly committee are not published; only the Commission's "
    "announcement of the Operation Kite confidential report is recorded.",
    "The Commission does not publish numbered recommendations of its own in these reports; numbered "
    "recommendations quoted from the Auditor-General or the Public Accounts Committee are not recorded.",
    "Ministerial responses to special reports are presented to the Legislative Assembly and are not on the "
    "Commission's site; they are not loaded.",
    "The lobbying inquiry (open, with two discussion papers) has not reported; discussion papers are not reports.",
    "Discontinued investigations are not published individually.",
)

NO_RECS = ("No numbered recommendations of the Commission's own were found in the report text. Numbered "
           "recommendations quoted in the report from other bodies are not recorded.")

# Keyed by the PDF file name. date: (YYYY-MM-DD, text that must appear on `date_page`, date_page).
# findings: (page, exact sentence, label phrase in the sentence, kind).
CURATED = {
    "Investigation-Report-Operation-Kingfisher.pdf": dict(
        operation="Operation Kingfisher", type="investigation_report", type_as_published="Investigation Report",
        date=("2026-07-23", "23 July 2026", 5),
        findings=[
            (7, "Formal adverse findings have been made against Ms Haire and Mr Ceramidas.", "adverse findings", "finding"),
            (329, "So far as Ms Haire and Mr Ceramidas is each concerned, there can be no doubt that the corrupt conduct "
                  "which they have been found to have committed was of a character that would be likely to threaten public "
                  "confidence in the integrity of Government or public administration, as to both its efficiency and "
                  "probity so far as procurement of construction projects is concerned.", "corrupt conduct", "finding"),
            (330, "Accordingly, the corrupt conduct of each amounted to serious corrupt conduct.", "serious corrupt conduct", "finding"),
            (330, "Accordingly, I have concluded that it is not appropriate to find that Mr Green’s conduct, considered as a "
                  "whole, amounted to serious corrupt conduct.", "serious corrupt conduct", "no_finding"),
        ],
        subjects=[("Education Directorate", "body"), ("Director-General", "public_role"),
                  ("Chief of Staff", "public_role")],
    ),
    "Operation-Luna-Special-Report-Part-2.pdf": dict(
        operation="Operation Luna", type="special_report", type_as_published="Special Report (Part 2)",
        date=("2025-07-25", "25 July 2025", 4), key="operation-luna-part-2",
        findings=[(4, "In the enclosed Second Special Report, I have made adverse findings, and concluded that serious "
                      "corrupt conduct occurred in connexion with the procurement of the sixth contract entered into "
                      "between the CIT and Redrouge Nominees Pty Ltd.", "serious corrupt conduct", "finding")],
        subjects=[("Canberra Institute of Technology", "body")],
    ),
    "Investigation-Report-Operation-Athena.pdf": dict(
        operation="Operation Athena", type="investigation_report", type_as_published="Investigation Report",
        date=("2025-06-13", "13 June 2025", 4),
        findings=[(40, "The circumstances of the meeting of 6 July 2021 do not give rise in any way to corrupt conduct and "
                       "it is unnecessary to make any further comment about the matter except to emphasise that none of the "
                       "individuals mentioned in this report has been the subject of a finding of corrupt conduct.",
                   "finding of corrupt conduct", "no_finding")],
        subjects=[],
    ),
    "Investigation-Report-Operation-Juno.pdf": dict(
        operation="Operation Juno", type="investigation_report", type_as_published="Investigation Report",
        date=("2025-03-18", "18 March 2025", 4),
        findings=[
            (4, "The Commission has concluded that certain aspects of Mr Sofronoff’s conduct as Board of an Inquiry "
                "instituted under the Inquiries Act 1991 amounted to serious corrupt conduct as defined in the Integrity "
                "Commission Act 2018.", "serious corrupt conduct", "finding"),
        ],
        subjects=[("Board of Inquiry", "body")],
    ),
    "Investigation-Report-Operation-Falcon.pdf": dict(
        operation="Operation Falcon", type="investigation_report", type_as_published="Investigation Report",
        date=("2025-01-17", "17 January 2025", 4),
        findings=[(5, "The two persons whose conduct was under consideration, namely the General Manager of the Alexander "
                      "Maconochie Centre (the General Manager) and a corrections officer (Person 2) have been the subject of "
                      "some adverse findings but, for various reasons explained in this report, no finding that they were "
                      "guilty of corrupt conduct has been made.", "no finding that they were guilty of corrupt conduct",
                   "no_finding")],
        subjects=[("Alexander Maconochie Centre", "body"), ("General Manager of the Alexander Maconochie Centre", "public_role"),
                  ("corrections officer", "public_role")],
    ),
    "Op-Kite-Confidential-Report-announcement.pdf": dict(
        operation="Operation Kite", type="other", type_as_published="Confidential Investigation Report (announcement)",
        date=("2024-08-05", "5 August 2024", 1),
        findings=[(1, "There was no finding of corrupt conduct within this Report.", "no finding of corrupt conduct", "no_finding")],
        subjects=[],
        notes=["The published document announces a confidential investigation report given to the Standing Committee on "
               "Justice and Community Safety under section 192 of the Integrity Commission Act 2018; the report itself is "
               "not published."],
    ),
    "Operation-Luna-Special-Report-27-June-2024.pdf": dict(
        operation="Operation Luna", type="special_report", type_as_published="Special Report (Part One)",
        date=("2024-06-27", "27 June 2024", 5), key="operation-luna-part-one",
        findings=[(275, "It follows that Ms Cover was guilty of serious corrupt conduct within s 10 of the IC Act.",
                   "serious corrupt conduct", "finding")],
        subjects=[("Canberra Institute of Technology", "body"), ("Chief Executive Officer", "public_role"),
                  ("CIT Board Chair", "public_role")],
    ),
    "Special-Report-Rural-Land-West-of-Canberra.pdf": dict(
        operation=None, type="special_report", type_as_published="Special Report", key="rural-land-west-of-canberra",
        date=("2023-10-26", "26 October 2023", 5),
        findings=[(21, "In short, the Commission's conclusion on those matters is that, while the processes of the LDA left "
                       "much to be desired in terms of appropriate documentation of key elements of the transactions and not "
                       "always appearing to comply with the Government’s own procurement framework, neither of the two areas "
                       "of concern raises a reasonable suspicion of corrupt conduct.",
                   "reasonable suspicion of corrupt conduct", "other")],
        subjects=[("Land Development Agency", "body")],
    ),
    "Special-Report-City-to-the-Lake-Project.pdf": dict(
        operation="Operation Lyrebird", type="special_report", type_as_published="Special Report (Part 2, City to the Lake Project)",
        date=("2023-12-15", "15 December 2023", 2), key="operation-lyrebird-part-2",
        findings=[(5, "In the present case, the evidence – in both documentary and oral form – gathered by the Auditor-General "
                      "and the Committee, when considered as a whole, provides an adequate basis for explaining the impugned "
                      "transactions for present purposes and does not raise a reasonable suspicion of corruption.",
                   "reasonable suspicion of corruption", "other")],
        subjects=[("Land Development Agency", "body")],
    ),
    "Operation-Raven-Special-Report-FINAL.pdf": dict(
        operation="Operation Raven", type="special_report", type_as_published="Special Report",
        date=("2022-08-23", "23 August 2022", 5),
        findings=[(7, "While there was an inappropriate lack of documentation surrounding some aspects of the transaction, "
                      "there was sufficient material to enable the Commission to confidently conclude that there was no "
                      "reasonable suspicion of corrupt conduct on any person’s behalf.",
                   "no reasonable suspicion of corrupt conduct", "other")],
        subjects=[("Economic Development Directorate", "body")],
        summary_pdf="Operation-Raven-Executive-Summary.pdf",
    ),
    "ACT-Integrity-Commission-Special-Report-Suburban-Land-Agency-Land-Sales.pdf": dict(
        operation=None, type="special_report", type_as_published="Special Report", key="suburban-land-agency-land-sales",
        date=("2022-10-17", "17 October 2022", 5),
        findings=[(5, "Although the Commission has determined that no reasonable suspicion of corruption arises, examination "
                      "of the issues raised by the complaints identified several significant matters that are potential "
                      "corruption risks.", "no reasonable suspicion of corruption", "other")],
        subjects=[("Suburban Land Agency", "body")],
    ),
    "Special-Report-Operation-Lyrebird-Part-1-Acquisition-of-Block-24-Section-65-Canberra-City-3-February-2022.pdf": dict(
        operation="Operation Lyrebird", type="special_report", type_as_published="Special Report (Part 1)",
        date=("2022-02-03", "3 February 2022", 5), key="operation-lyrebird-part-1",
        findings=[(44, "As to the possibility that corrupt conduct was committed, that evidence not only does not give rise to "
                       "any reasonable suspicion that it did so but is inconsistent with any such conclusion.",
                   "reasonable suspicion", "other")],
        subjects=[("Land Development Agency", "body")],
    ),
}


def parse_list(html):
    """[(year, heading, link text, pdf url, supporting page url or None, footnotes)] in page order."""
    soup = BeautifulSoup(html, "html.parser")
    main = soup.find(id="main")
    if not main or not main.select(".uikit-accordion__title"):
        raise common.Held("ACT report list structure missing")
    out = []
    for title in main.select(".uikit-accordion__title"):
        year = common.clean(title.get_text())
        body = title.find_next_sibling("div")
        heading, items = None, []
        notes = [common.clean(e.get_text(" ")) for e in body.find_all("sub")]
        for p in body.find_all("p"):
            strong, a = p.find("strong"), p.find("a", href=True)
            if strong and not a:
                heading = common.clean(strong.get_text(" ")).rstrip("*").strip()
            elif a and a["href"].lower().endswith(".pdf"):
                items.append([year, heading, common.clean(a.get_text(" ")), urljoin(LIST, a["href"]), None])
            elif a and "supporting" in a.get_text().lower() and items:
                for it in items:
                    if it[1] == heading and it[4] is None:
                        it[4] = urljoin(LIST, a["href"])
        for it in items:
            out.append((*it, notes))
    if not out:
        raise common.Held("ACT report list has no PDF links")
    return out


def _type_from_title(text):
    t = text.lower()
    if "special report" in t:
        return "special_report", "Special Report"
    if "investigation report" in t:
        return "investigation_report", "Investigation Report"
    return "other", None


def build(entry, pdf_url, pages, pdf_bytes, extra_docs=(), list_notes=()):
    """One record from a list entry and the report's page texts (no requests)."""
    year, heading, link_text, _, support_url = entry[:5]
    name = pdf_url.rsplit("/", 1)[1]
    cur = CURATED.get(name)
    flat_pages = [common.flat(p) for p in pages]
    whole = " ".join(flat_pages)
    title = link_text
    pdf_cite = lambda page: common.cite(pdf_url, title, page)  # noqa: E731
    notes = []
    if cur is None:
        rtype, type_pub = _type_from_title(link_text)
        return common.report_record(
            BODY, title=title, page_url=support_url or LIST, report_type=rtype, type_as_published=type_pub,
            operation=(heading if heading and heading.lower().startswith("operation") else None), pdf_url=pdf_url,
            documents=[common.document("report", title, pdf_url, pdf_bytes, len(pages))],
            responses_status="none_found", key=name.rsplit(".", 1)[0],
            notes=[f"Listed under {year}; not yet reviewed, so no date or findings are recorded."])
    date = date_basis = None
    d, needle, page = cur["date"]
    if needle in flat_pages[page - 1]:
        date, date_basis = d, "dated"
        notes.append(f"Date is the date of the Commission's letter or statement giving the report to the Speaker "
                     f"of the ACT Legislative Assembly (report page {page}).")
    findings = []
    for pg, sentence, label, kind in cur["findings"]:
        if pg <= len(flat_pages) and common.verbatim(sentence, flat_pages[pg - 1]) and common.verbatim(label, sentence):
            findings.append(common.finding(label, kind, sentence, pdf_cite(pg), flat_pages[pg - 1]))
    subjects = []
    for sname, skind in cur["subjects"]:
        if common.verbatim(sname, whole):
            subjects.append(common.subject(sname, skind, common.cite(pdf_url, title, section="report text")))
    notes += cur.get("notes", [])
    notes += [n for n in list_notes if cur["operation"] and cur["operation"].split()[-1] in n]
    notes.append(NO_RECS)
    docs = [common.document("report", title, pdf_url, pdf_bytes, len(pages)), *extra_docs]
    return common.report_record(
        BODY, title=title, page_url=support_url or LIST, report_type=cur["type"], type_as_published=cur["type_as_published"],
        operation=cur["operation"], date=date, date_basis=date_basis, pdf_url=pdf_url, documents=docs,
        subjects=subjects, findings=findings, findings_status="extracted" if findings else "not_extracted",
        recommendations_status="not_extracted", responses_status="none_found", notes=notes,
        key=cur.get("key") or cur["operation"] or name.rsplit(".", 1)[0])


def collect(client):
    html = client.html(LIST)
    if html is None:
        raise common.Held("ACT report list unavailable")
    entries = parse_list(html)
    by_name = {e[3].rsplit("/", 1)[1]: e for e in entries}
    records = []
    for entry in entries:
        pdf_url = entry[3]
        name = pdf_url.rsplit("/", 1)[1]
        if any(c.get("summary_pdf") == name for c in CURATED.values()):
            continue  # an executive summary is a document of its report
        data = client.get(pdf_url, "pdf")
        if data is None:
            rtype, type_pub = _type_from_title(entry[2])
            records.append(common.report_record(
                BODY, title=entry[2], page_url=entry[4] or LIST, report_type=CURATED.get(name, {}).get("type", rtype),
                type_as_published=CURATED.get(name, {}).get("type_as_published", type_pub),
                operation=CURATED.get(name, {}).get("operation"), pdf_url=pdf_url,
                documents=[common.document("report", entry[2], pdf_url, status="unavailable")],
                key=CURATED.get(name, {}).get("key") or name.rsplit(".", 1)[0],
                notes=["The report PDF could not be fetched on this run."]))
            continue
        pages = common.pdf_pages(data)
        extra = []
        summary = CURATED.get(name, {}).get("summary_pdf")
        if summary and summary in by_name:
            s_entry = by_name[summary]
            s_data = client.get(s_entry[3], "pdf")
            extra.append(common.document("summary", s_entry[2], s_entry[3], s_data,
                                         len(common.pdf_pages(s_data)) if s_data else None,
                                         status="ready" if s_data else "unavailable"))
        notes = [n.lstrip("*").strip() for n in entry[5]]
        records.append(build(entry, pdf_url, pages, data, extra, notes))
    return records
