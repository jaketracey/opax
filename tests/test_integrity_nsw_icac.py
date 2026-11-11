"""NSW ICAC adapter: listing, findings, no-finding and recommendation parsing on fixtures (offline)."""
import json
from pathlib import Path

import pytest

from parli.ingest.integrity import common, nsw_icac as n

FIX = Path(__file__).parent / "fixtures" / "integrity" / "nsw_icac"
PDF = "https://www.icac.nsw.gov.au/ArticleDocuments/1116/report.pdf.aspx"


def fixture(name):
    return (FIX / name).read_text()


def test_listing_entries_have_dates_and_investigation_urls():
    rows = n.parse_listing(fixture("listing.html"))
    assert len(rows) == 3
    url, date, text = rows[0]
    assert url.startswith("https://www.icac.nsw.gov.au/investigations/past-investigations/2026/")
    assert date == "2026-08-28"
    assert "Operation Tivoli" in text


def test_report_widget_maps_pdf_to_title_and_date():
    widget = n.parse_report_widget(fixture("reports_widget.html"))
    assert len(widget) == 4
    title, date = next(iter(widget.values()))
    assert title.startswith("Investigation into the conduct of")
    assert date == "2026-08-28"
    assert all(" " not in url for url in widget)


def test_pre2016_summaries_parse_titles_dates_and_operations():
    entries = n.parse_pre2016(fixture("pre2016.html"))
    assert [e["year"] for e in entries[:3]] == ["2015", "2015", "2015"]
    rec = n.pre2016_record(entries[0])
    assert rec["date"] == "2015-12-17" and rec["date_basis"] == "published"
    assert rec["operation"] == "Operation Vika"
    assert rec["findings_status"] == "not_extracted" and rec["recommendations_status"] == "not_extracted"
    assert any("no longer available online" in note for note in rec["notes"])
    assert [s["name"] for s in rec["subjects"]] == ["Rural Fire Service"]
    assert rec["summary"].startswith("The ICAC investigated")


def test_pre2016_month_only_reports_carry_the_month_as_a_period_not_a_date():
    entry = {"title": "Waverley Council - employee's relationship with Dainford Ltd", "year": "1991", "links": [],
             "paragraphs": ["The ICAC investigated the conduct of persons at Waverley Council.",
                            "This report was made public in January 1991."]}
    rec = n.pre2016_record(entry)
    assert rec["date"] is None and rec["date_basis"] is None
    assert rec["period"] == {"value": "1991-01", "precision": "month",
                             "basis": "The ICAC's summary says the report was made public in January 1991."}
    bare = n.pre2016_record({**entry, "paragraphs": entry["paragraphs"][:1]})
    assert bare["period"]["value"] == "1991" and bare["period"]["precision"] == "year"
    assert "Listed under 1991" in bare["period"]["basis"]
    dated = n.pre2016_record({**entry, "paragraphs": ["This report was made public on 17 December 2015."]})
    assert dated["date"] == "2015-12-17" and "period" not in dated


def test_period_is_only_for_undated_records_and_needs_a_basis():
    import pytest
    kw = dict(title="T", page_url="https://www.icac.nsw.gov.au/x", report_type="investigation_report")
    with pytest.raises(ValueError):
        common.report_record(n.BODY, date="2020-01-02", date_basis="published", period={"value": "2020-01", "basis": "b"}, **kw)
    with pytest.raises(ValueError):
        common.report_record(n.BODY, period={"value": "2020-13", "basis": "b"}, **kw)
    with pytest.raises(ValueError):
        common.report_record(n.BODY, period={"value": "2020"}, **kw)


def test_findings_are_statements_of_finding_with_report_labels():
    pages = json.loads(fixture("mantis_summary_pages.json"))
    # Pad to the summary chapter position (pages 13 and 14 of the report).
    padded = [""] * 12 + pages
    found = n.findings_from_pages(padded, PDF, "Mantis report")
    kinds = [(f["kind"], f["label"]) for f in found]
    assert ("finding", "serious corrupt conduct") in kinds
    assert ("prosecution_statement", "Section 74A(2) statement") in kinds
    for f in found:
        assert f["cite"]["url"] == PDF and f["cite"]["page"] in (13, 14)
        assert common.verbatim(f["text"], padded[f["cite"]["page"] - 1])
        assert "whether" not in f["text"].lower()[:60]  # never an allegation
    webb = next(f for f in found if "Mr Webb engaged in serious corrupt conduct" in f["text"])
    assert webb["text"].startswith("The Commission found that Mr Webb engaged in serious corrupt conduct")
    assert "approximately $208,000" in webb["text"]  # particulars kept when the list ends on the page
    dpp = next(f for f in found if f["kind"] == "prosecution_statement")
    assert "Benjamin Webb" in dpp["text"] and dpp["text"].endswith("of the Crimes Act.")


def test_no_finding_statements_are_classified_as_no_finding():
    page = ("ICAC REPORT Investigation\nCorrupt conduct findings\n"
            "The Commission is not satisfied that Mr A engaged in corrupt conduct.\n"
            "The Commission finds that Ms B did not engage in serious corrupt conduct.\n"
            "It was alleged that Mr C engaged in corrupt conduct.\n")
    found = n.findings_from_pages([page], PDF, "Report")
    assert [(f["kind"], f["label"]) for f in found] == [("no_finding", "corrupt conduct"), ("no_finding", "serious corrupt conduct")]
    assert all("alleged" not in f["text"] for f in found)


def test_unbounded_finding_keeps_only_the_statement():
    page = ("The Commission finds that Mr D engaged in serious corrupt conduct by:\n"
            "• between 2020 and 2021, misusing his functions and\n"
            "continuing onto the next page without an end")
    found = n.findings_from_pages([page], PDF, "Report")
    assert found and found[0]["text"] == "The Commission finds that Mr D engaged in serious corrupt conduct by:"


def test_recommendations_from_separate_pdf_are_numbered_and_verbatim():
    pages = json.loads(fixture("mantis_recommendations_pages.json"))
    recs = n.recommendations_from_pdf(pages, PDF, "Mantis recommendations")
    assert [r["number"] for r in recs] == [str(i) for i in range(1, 20)]
    assert recs[0]["text"].startswith("That Council adopts better-practice employment-screening measures")
    assert recs[5]["text"].startswith("That Council collects detailed and accurate financial")  # crosses a page break
    assert recs[5]["cite"]["page"] == 1
    assert all("UNCLASSIFIED" not in r["text"] and "RECOMMENDATION" not in r["text"] for r in recs)


def test_recommendations_refuse_gapped_numbering():
    pages = ["RECOMMENDATION 1\nThat A does B.\nRECOMMENDATION 3\nThat C does D."]
    assert n.recommendations_from_pdf(pages, PDF, "x") == []


@pytest.mark.parametrize("title,expected", [
    ("Canterbury-Bankstown Council – allegations concerning conduct of former employee, contractor and others (Operation Mantis)",
     [("Canterbury-Bankstown Council", "body"), ("former employee", "public_role")]),
    ("Inner West Council and Transport for NSW – allegations concerning conduct of employees and others (Operation Hector)",
     [("Inner West Council", "body"), ("Transport for NSW", "body"), ("employees", "public_role")]),
    ("Former NSW MP for Wagga Wagga – allegations concerning breach of public trust (Operation Keppel)",
     [("Former NSW MP for Wagga Wagga", "public_role")]),
    ("Roads and Maritime Services – allegation concerning two former employees (Operation Paragon)",
     [("Roads and Maritime Services", "body"), ("two former employees", "public_role")]),
])
def test_subjects_are_bodies_and_public_roles_only(title, expected):
    got = [(s["name"], s["kind"]) for s in n.subjects_from_title(title, common.cite("https://x", "t"))]
    assert got == expected


def test_research_report_selection_excludes_guides():
    assert n.is_research_report("Community Attitudes Survey - Report on the 2015 survey", "")
    assert n.is_research_report("Corruption risks in NSW Government procurement - Recommendations to government", "")
    assert not n.is_research_report("Factfinder: a guide to conducting internal investigations", "")
    assert not n.is_research_report("Sample conflict of interest policy for NSW public sector agencies", "")
    assert not n.is_research_report("Corruption - let's stop it together (English)", "")
