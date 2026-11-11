"""WA Corruption and Crime Commission adapter: listing, report pages and PDF extraction on trimmed
fixtures (no network)."""
import json
from pathlib import Path

import pytest

from parli.ingest.integrity import common, wa_ccc

FIX = Path(__file__).parent / "fixtures" / "integrity" / "wa_ccc"
AVIEMORE_PAGE = ("https://www.ccc.wa.gov.au/publications/"
                 "report-operation-aviemore-major-crime-squad-investigation-unlawful-killing-mr-joshua")


def _pages(name):
    """The fixture's kept page texts, with every other page blank, at the PDF's real page count."""
    fx = json.loads((FIX / f"pages-{name}.json").read_text())
    pages = [""] * fx["page_count"]
    for n, text in fx["pages"].items():
        pages[int(n) - 1] = text
    return fx["url"], pages


# ---- listing and report pages ---------------------------------------------------------------

def test_listing_parses_cards_and_pager():
    items, has_next = wa_ccc.parse_listing((FIX / "listing-page0.html").read_text())
    assert has_next is True
    assert len(items) == 3
    first = items[0]
    assert first["title"] == "Report on Corrupt Procurement Practices of a Senior Officer at the Shire of East Pilbara"
    assert first["href"] == ("https://www.ccc.wa.gov.au/publications/"
                             "report-corrupt-procurement-practices-senior-officer-shire-east-pilbara")
    assert first["listed"] == "2026-10-01"
    assert "Report" in first["tags"]


def test_last_listing_page_has_no_next():
    items, has_next = wa_ccc.parse_listing((FIX / "listing-page2.html").read_text())
    assert has_next is False
    assert [i["listed"] for i in items] == ["2013-04-16", "2012-11-02"]


def test_report_page_groups_and_tabled_date():
    groups, summary = wa_ccc.parse_page((FIX / "page-east-pilbara.html").read_text(), "https://www.ccc.wa.gov.au/x")
    headings = [g for g, _ in groups]
    assert headings == ["Media Release", "Report"]
    report = dict(groups)["Report"]
    assert report[0][1].endswith("Shire%20of%20East%20Pilbara.pdf")
    m = wa_ccc.TABLED.search(summary)
    assert wa_ccc.iso(*m.groups()) == "2026-10-01"


def test_page_without_article_is_held():
    with pytest.raises(common.Held):
        wa_ccc.parse_page("<html><body><main><p>Moved</p></main></body></html>", "https://www.ccc.wa.gov.au/x")


@pytest.mark.parametrize("title, expected", [
    ("Report on Corrupt Procurement Practices of a Senior Officer at the Shire of East Pilbara", "investigation_report"),
    ("Special Report on the Corruption and Crime Commission's Investigation into Matters", "special_report"),
    ("Commission Statement on an investigation", "statement"),
    ("Report on the Inquiry into Matters", "public_inquiry_report"),
    ("Review of recommendations made to the Department of Justice", "prevention_research_report"),
    ("Report into misconduct risks in WA prisons", "prevention_research_report"),
    ("Operation Aviemore Commissioner of Police Response to Commission Recommendations", "other"),
    ("Corruption and Crime Commission Repositioning Report", "other"),
])
def test_report_type_from_title(title, expected):
    assert wa_ccc.report_type(title) == expected


# ---- opinions -----------------------------------------------------------------------------

def test_opinion_recorded_verbatim_with_label():
    url, pages = _pages("murdoch")
    found = wa_ccc.extract_opinions(pages, url, "Murdoch report")
    assert [(f["kind"], f["label"], f["text"]) for f in found] == [
        ("opinion", "opinion of serious misconduct", "The Commission has formed an opinion of serious misconduct by Mr Thomas.")]
    assert found[0]["cite"]["page"] == 4


def test_no_opinion_statements_are_no_finding():
    url, pages = _pages("access-info")
    found = wa_ccc.extract_opinions(pages, url, "OAG report")
    kinds = [(f["kind"], f["cite"]["page"]) for f in found]
    assert kinds == [("no_finding", 12), ("no_finding", 15), ("no_finding", 18), ("opinion", 27)]
    assert all(f["label"] == "no opinion of serious misconduct" for f in found if f["kind"] == "no_finding")
    for f in found:
        assert common.verbatim(f["text"], pages[f["cite"]["page"] - 1])


def test_may_have_occurred_and_whether_are_not_opinions():
    # a report whose only "may have occurred" text is about miscarriages of justice yields no opinion
    url, pages = _pages("aviemore")
    assert "may have occurred" in pages[6]
    assert wa_ccc.extract_opinions(pages, url, "Aviemore") == []
    synthetic = ["CCC REPORT\n1\n"
                 "The Commission has formed an opinion that serious misconduct may have occurred. "
                 "The question is whether the Commission formed an opinion of serious misconduct by the officer. "
                 "It is alleged the officer engaged in serious misconduct and the Commission formed an opinion of misconduct.\n"]
    assert wa_ccc.extract_opinions(synthetic, "https://x/r.pdf", "r") == []


# ---- recommendations and responses -----------------------------------------------------------

def test_numbered_recommendations_run_one_to_seven():
    url, pages = _pages("aviemore")
    recs = wa_ccc.extract_recommendations(pages, url, "Aviemore")
    assert [r["number"] for r in recs] == ["One", "Two", "Three", "Four", "Five", "Six", "Seven"]
    assert [r["cite"]["page"] for r in recs] == [36, 38, 42, 46, 47, 51, 54]
    assert recs[4]["text"] == ("The Commission recommends that refresher training is given to police officers "
                               "in relation to the exercise of powers and responsibilities under the CI Act.")


def test_section_recommendations_after_lead_in_and_bullets():
    url, pages = _pages("police-dogs")
    recs = wa_ccc.extract_recommendations(pages, url, "Police dogs")
    assert [r["text"] for r in recs] == [
        "Develop and implement WA Police Canine Unit Policy, Procedure and/or Guidelines.",
        "Undertake further analysis of police dog use to explore and address reasons for the higher "
        "representation of Aboriginal and Torres Strait Islander persons in police dog deployments.",
    ]
    assert all(r["number"] is None and r["cite"]["page"] == 30 for r in recs)


def test_paragraph_recommendation():
    url, pages = _pages("access-info")
    recs = wa_ccc.extract_recommendations(pages, url, "OAG report")
    assert [r["text"] for r in recs] == [
        "The Commission recommends that OAG review its procedures to ensure that following an audit, "
        "data is only retained in a secure location."]


def test_conflicting_series_leave_recommendations_unextracted():
    pages = ["CCC REPORT\n1\nRecommendation 1\nThe Commission recommends that the agency reviews its policy.\n",
             "CCC REPORT\n2\nRecommendation 1\nThat the department publishes its register of gifts.\n"]
    assert wa_ccc.numbered_recommendations(pages, "https://x/r.pdf", "r") is None
    assert wa_ccc.extract_recommendations(pages, "https://x/r.pdf", "r") == []


def test_lead_in_pointing_elsewhere_is_dropped():
    assert wa_ccc._rec(None, "The Commission recommends adoption of all these measures.",
                       ["The Commission recommends adoption of all these measures."], 0, "https://x/r.pdf", "r") is None


def test_per_recommendation_agency_responses():
    url, pages = _pages("police-dogs")
    recs = wa_ccc.extract_recommendations(pages, url, "Police dogs")
    resp = wa_ccc.extract_responses(pages, url, "Police dogs", recs)
    assert [r["kind"] for r in resp] == ["agency_response", "agency_response"]
    assert resp[0]["text"].startswith("In January 2022, WA Police Force's EM & SS Division commenced an assessment")
    assert resp[1]["cite"]["page"] == 31


def test_response_heading_in_report():
    url, pages = _pages("murdoch")
    resp = wa_ccc.extract_responses(pages, url, "Murdoch report", [])
    assert [(r["kind"], r["title"]) for r in resp] == [("agency_response", "Murdoch University's response to the draft report")]


# ---- one whole record ------------------------------------------------------------------------

class FakeClient:
    def __init__(self, page_html):
        self.page_html = page_html

    def get(self, url, kind):
        return self.page_html.encode() if kind == "html" else b"%PDF-fixture"


def test_build_record_aviemore(monkeypatch):
    url, pages = _pages("aviemore")
    monkeypatch.setattr(common, "pdf_pages", lambda data: pages)
    item = {"title": "Report on Operation Aviemore: Major Crime Squad Investigation into the Unlawful Killing of Mr Joshua Warneke",
            "href": AVIEMORE_PAGE, "listed": "2015-11-05", "tags": ["Report"]}
    rec = wa_ccc.build_record(FakeClient((FIX / "page-aviemore.html").read_text()), item)
    assert rec["id"].startswith("wa-ccc-2015-11-05-report-operation-aviemore-major-crime-squad")
    assert (rec["date"], rec["date_basis"]) == ("2015-11-05", "dated")
    assert rec["report_type"] == "investigation_report" and rec["type_as_published"] == "Report"
    assert rec["recommendations_status"] == "extracted" and len(rec["recommendations"]) == 7
    assert rec["findings_status"] == "not_extracted" and rec["findings"] == []
    assert rec["responses_status"] == "none_found"
    roles = sorted(d["role"] for d in rec["documents"])
    assert roles == ["media_release", "report"]
    # subjects are bodies and public roles only; the person the report concerns is not a subject
    assert all(s["kind"] in common.SUBJECT_KINDS for s in rec["subjects"])
    assert not any("Warneke" in s["name"] for s in rec["subjects"])


def test_excluded_titles_build_nothing():
    item = {"title": "Performance at a Glance 2014-2015", "href": "https://www.ccc.wa.gov.au/publications/p",
            "listed": "2015-10-01", "tags": ["Report"]}
    page = "<html><body><main><article><p>x</p></article></main></body></html>"
    assert wa_ccc.build_record(FakeClient(page), item) is None
