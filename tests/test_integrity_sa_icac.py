"""SA ICAC adapter: listing, page and recommendation parsing on trimmed fixtures (no network)."""
import json
from pathlib import Path

import pytest

from parli.ingest.integrity import common, sa_icac

FIX = Path(__file__).parent / "fixtures" / "integrity" / "sa_icac"


def test_parse_date_handles_the_commissions_month_forms():
    assert sa_icac.parse_date("25 June 2026") == "2026-06-25"
    assert sa_icac.parse_date("26 Sept 2024") == "2024-09-26"
    assert sa_icac.parse_date("3 Apr 2025") == "2025-04-03"
    assert sa_icac.parse_date("Published 7 March 2023.") == "2023-03-07"
    assert sa_icac.parse_date("no date here") is None


def test_listing_items_types_and_exclusions():
    html = (FIX / "all-reports.html").read_text()
    items = sa_icac.parse_listing(html, sa_icac.REPORTS)
    titles = [i["title"] for i in items]
    assert "Whistleblower Project" in titles and "Evaluation of SAFECOM" in titles
    kept = {i["title"]: i for i in items if sa_icac.keep_report(i)}
    assert "Whistleblower Project" in kept and "Evaluation of SAFECOM" in kept
    assert not any("Annual Report" in t or "financial statements" in t for t in kept)
    assert sa_icac.TYPES[sa_icac.report_kind(kept["Evaluation of SAFECOM"]["url"])] == (
        "prevention_research_report", "Evaluation report")
    assert sa_icac.report_kind(kept["Integrity State 2024-25"]["url"]) == "investigation-reports"
    assert kept["Whistleblower Project"]["date_text"] == "25 June 2026"


def test_statement_listing_keeps_public_statements_only():
    html = (FIX / "statements.html").read_text()
    items = sa_icac.parse_listing(html, sa_icac.STATEMENTS)
    kept = [i for i in items if "/public-statements/" in i["url"] and sa_icac.keep_statement(i)]
    assert kept and all(i["title"].startswith("Public Statement") for i in kept)
    assert not any("Media Release" in i["title"] for i in kept)
    assert not sa_icac.keep_statement({"url": "https://icac.sa.gov.au/indexable-assets/media-and-news/public-statements/x",
                                       "title": "Public Statement: Commissioner Emma Townsend commences"})


def test_report_page_facts_pdf_and_tabled_date():
    url = "https://icac.sa.gov.au/indexable-assets/reports/evaluation-reports/evaluation-of-safecom"
    facts = sa_icac.page_facts((FIX / "safecom-page.html").read_text(), url)
    facts["page_url"] = url
    assert facts["title"] == "Evaluation of SAFECOM"
    pdf = sa_icac.pick_report_pdf(facts, facts["title"])
    assert pdf["url"].endswith("/SAFECOM-Eval.pdf")
    assert sa_icac.tabled_date(facts["text"]) == "2025-04-03"
    date, basis, notes = sa_icac.report_date({"date_text": "3 Apr 2025"}, facts)
    assert (date, basis, notes) == ("2025-04-03", "tabled", [])
    subjects = sa_icac.subjects_from(facts["title"], facts["text"], url)
    assert [s["name"] for s in subjects] == ["SAFECOM"] and subjects[0]["kind"] == "body"


def test_listing_date_before_the_commission_is_not_used():
    date, basis, notes = sa_icac.report_date({"date_text": "4 June 2005"}, {"text": ""})
    assert date is None and basis is None and "before the Commission began" in notes[0]


def test_recommendations_are_numbered_verbatim_and_cited():
    pages = json.loads((FIX / "safecom-pages.json").read_text())
    recs = sa_icac.recommendations(pages, "https://icac.sa.gov.au/x.pdf", "Evaluation of SAFECOM")
    assert [r["number"] for r in recs] == [str(n) for n in range(1, len(recs) + 1)]
    assert len(recs) == 25
    assert recs[3]["text"].startswith("In consultation with the services, SAFECOM to review and amend the ESS Conflict of Interest")
    for r in recs:
        assert "EVALUATION OF SAFECOM AND THE COUNTRY FIRE SERVICE" not in r["text"]  # running head removed
        assert r["cite"]["page"] >= 1 and r["cite"]["url"].endswith(".pdf")
        assert "RECOMMENDATION" not in r["text"]


def test_recommendation_text_must_be_on_the_page():
    with pytest.raises(ValueError):
        common.recommendation("1", "words that are not in the source", common.cite("u", "d", 1), "other text")


def test_response_links_skip_the_inspector_and_keep_government_responses():
    facts = {"page_url": "https://icac.sa.gov.au/r", "title": "Oakden", "links": [
        {"url": "https://www.dpc.sa.gov.au/x/SA-Government-response-to-ICAC-Report-into-Oakden.pdf",
         "label": "responded to the report", "section": "Impact",
         "context": "The South Australian Government responded to the report ."},
        {"url": "https://icac.sa.gov.au/r2", "label": "Response to Inspector's Review", "section": None, "context": None}]}
    out = sa_icac.response_links(facts, None)
    assert len(out) == 1 and out[0]["kind"] == "agency_response" and out[0]["url"].startswith("https://www.dpc.sa.gov.au/")


def test_stated_count_reads_the_reports_own_number_only():
    assert sa_icac.stated_count("The evaluation has identified areas vulnerable to corruption and makes eight recommendations.") == 8
    assert sa_icac.stated_count("This report contains 61 recommendations to reform South Australia's regime.") == 61
    assert sa_icac.stated_count("work has commenced in relation to the five recommendations I have made.") == 5
    assert sa_icac.stated_count("On 30 June 2015 I published that legislative review which made 29 recommendations.") is None
    assert sa_icac.stated_count("Commissioner Lander made four recommendations to the Chief Executive.") is None
    assert sa_icac.stated_count("The report makes 6 recommendations.", "The report makes 5 recommendations.") is None


def test_word_numbered_recommendations_after_the_commissioners_lead_in():
    pages = json.loads((FIX / "oakden-summary-pages.json").read_text())
    recs = sa_icac.recommendations(pages, "https://icac.sa.gov.au/oakden.pdf", "Oakden", expected=13)
    assert [r["number"] for r in recs] == [str(n) for n in range(1, 14)]
    assert recs[0]["text"].startswith("The Chief Executive of the Department of Health and Ageing (Chief Executive) review")
    assert recs[9]["text"] == ("The six recommendations contained in the Oakden Report be implemented, to the extent "
                               "that they have not already been implemented.")
    assert recs[0]["cite"]["page"] == 1


def test_labels_printed_under_their_text_are_not_read():
    # Failing the Corruption Road Test sets "RECOMMENDATION 1" below the words it labels, so reading
    # the text after each label would shift every recommendation by one. The list is left unextracted.
    pages = json.loads((FIX / "roadtest-pages.json").read_text())
    assert sa_icac.recommendations(pages, "https://icac.sa.gov.au/road.pdf", "Road Test", expected=9) == []
    assert sa_icac.recommendations(pages, "https://icac.sa.gov.au/road.pdf", "Road Test") == []


def test_footnotes_and_following_headings_stay_out_of_recommendations():
    pages = json.loads((FIX / "gatekeepers-pages.json").read_text())
    recs = sa_icac.recommendations(pages, "https://icac.sa.gov.au/g.pdf", "The Gatekeepers", expected=6)
    assert len(recs) == 6
    assert not any("Protective Security Framework" in r["text"] for r in recs)  # footnote 29
    assert recs[5]["text"].endswith("to favour a third party.")  # the Conclusion section is not part of it
    assert "Conclusion" not in recs[5]["text"]


def test_findings_are_the_commissioners_own_words_with_the_reports_labels():
    pages = json.loads((FIX / "gillman-findings-pages.json").read_text())
    found = sa_icac.findings(pages, "https://icac.sa.gov.au/gillman.pdf", "Gillman")
    kinds = [(f["kind"], f["label"]) for f in found]
    assert ("finding", "maladministration") in kinds and ("opinion", "maladministration") in kinds
    assert sum(k == "no_finding" for k, _ in kinds) >= 3
    texts = [f["text"] for f in found]
    assert any(t.startswith("In respect of the transaction the subject of this inquiry I find that the URA engaged in "
                            "maladministration") for t in texts)
    assert any(t.startswith("For those reasons in my opinion") for t in texts)
    for f in found:
        assert not any(w in f["text"].lower() for w in ("alleg", "submi", "contend", "counsel"))
        assert not f["text"].startswith("Conclusion")
        assert f["cite"]["url"].endswith(".pdf") and f["cite"]["page"] >= 1


def test_negated_conduct_is_never_a_finding():
    page = ("I have found that no public officer engaged in maladministration in public administration. "
            "I have found that the Agency engaged in maladministration in public administration.")
    found = sa_icac.findings([page], "https://icac.sa.gov.au/x.pdf", "X")
    assert [(f["kind"], f["text"][:40]) for f in found] == [("finding", "I have found that the Agency engaged in ")]
