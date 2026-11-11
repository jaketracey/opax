"""Queensland CCC adapter: listing, page, recommendation and no-finding parsing (offline fixtures)."""
import json
from pathlib import Path

import pytest

from parli.ingest.integrity import common, qld_ccc

FIX = Path(__file__).parent / "fixtures" / "integrity" / "qld_ccc"
PAGE = "https://www.ccc.qld.gov.au/publications/investigation-sphynx"
PDF = "https://www.ccc.qld.gov.au/sites/default/files/Docs/Publications/CCC/CCC-Public-Report_Investigation-Sphynx_Nov-2026.pdf"


def pages(name):
    return json.loads((FIX / name).read_text())["pages"]


def test_listing_cards_and_scope():
    rows = qld_ccc.parse_listing((FIX / "listing.html").read_text())
    by = {r["href"]: r for r in rows}
    sphynx = by["/publications/investigation-sphynx"]
    assert sphynx["type"] == "Public Reports - Investigations" and sphynx["date"] == "05 November 2026"
    assert qld_ccc.in_scope(sphynx)
    assert not qld_ccc.in_scope(by["/publications/annual-report-2025-2026"])
    research = by["/publications/sector-insights-local-government-fy-2020-2025"]
    assert research["type"] == "Research and Intelligence" and qld_ccc.in_scope(research)
    assert qld_ccc.report_type(research) == "prevention_research_report"
    assert qld_ccc.report_type(sphynx) == "investigation_report"
    assert not qld_ccc.in_scope({"href": "/publications/x", "title": "Background intelligence brief: Money laundering",
                                 "type": "Research and Intelligence", "topics": ["Corruption"], "tags": []})


def test_report_types_from_titles():
    t = lambda title: qld_ccc.report_type({"title": title, "type": "Public Reports - Investigations"})
    assert t("Report on a public inquiry into payments made by land developers") == "public_inquiry_report"
    assert t("CCC statement regarding its involvement in investigations") == "statement"
    assert t("Advice of John Jerrard QC concerning examination of material") == "other"


def test_page_tabled_date_and_report_pdf():
    page = qld_ccc.parse_page((FIX / "sphynx_page.html").read_text(), PAGE)
    assert page["tabled"] == "2026-11-05" and page["published"] == "2026-11-05"
    assert [h for _, h in page["pdfs"]] == [PDF]
    assert page["responses"] == []


def test_recommendations_annexure_run_is_complete_and_verbatim():
    ps = pages("sphynx_pages.json")
    recs, reason = qld_ccc.parse_recommendations(ps)
    assert reason is None
    assert [r[0] for r in recs] == [str(i) for i in range(1, 10)]
    assert recs[0][2] == 25 and recs[6][2] == 26
    assert recs[0][1].startswith("• Conduct reviews or audits of leasing processes")
    # The last recommendation stops at the end of its page, before Annexure 5.
    assert recs[-1][1] == "• Develop and implement an action plan to address systemic organisational culture issues."
    for number, text, start, end in recs:
        r = common.recommendation(number, text, common.cite(PDF, "Investigation Sphynx", start),
                                  qld_ccc.page_source(ps, start, end))
        assert "INVESTIGATION SPHYNX" not in r["text"]


def test_recommendations_prefer_summary_list_with_page_refs():
    ps = pages("belcarra_pages.json")
    recs, reason = qld_ccc.parse_recommendations(ps)
    assert reason is None and len(recs) == 31
    assert recs[0][1].startswith("That an appropriate Parliamentary Committee review the feasibility")
    assert recs[30][1].endswith("(c) the ECQ be given adequate resources to perform this function.")
    assert "Part 1" not in recs[30][1]


def test_incomplete_run_is_refused():
    ps = ["Recommendation 2\nThat the agency reviews its policy on conflicts.\n"]
    assert qld_ccc.parse_recommendations(ps) == ([], "no run starting at Recommendation 1")
    assert qld_ccc.parse_recommendations(["No recommendations here."])[1] == "no numbered recommendation headings"


def test_no_finding_statement_is_the_reports_own_words():
    ps = pages("sphynx_pages.json")
    sentence, page_no, source = qld_ccc.no_finding_statements(ps)
    assert page_no == 31
    assert "makes no finding about the conduct or culpability of any person" in sentence
    f = common.finding("No finding", "no_finding", sentence, common.cite(PDF, "Investigation Sphynx", page_no), source)
    assert f["kind"] == "no_finding"


def test_allegation_wording_is_never_a_finding():
    ps = ["It was alleged that the officer engaged in corrupt conduct. The investigation continued."]
    assert qld_ccc.no_finding_statements(ps) is None


def test_subjects_are_bodies_and_roles_from_the_title():
    subs = qld_ccc.subjects_from("Investigation Murray: An investigation into allegations of corrupt conduct by the Mayor of Townsville", PAGE)
    assert [(s["name"], s["kind"]) for s in subs] == [("Mayor of Townsville", "public_role")]
    subs = qld_ccc.subjects_from("Operation Yabber: An investigation into allegations relating to the Gold Coast City Council", PAGE)
    assert ("Gold Coast City Council", "body") in [(s["name"], s["kind"]) for s in subs]
    subs = qld_ccc.subjects_from("Investigation Apricot: An investigation into alleged corrupt conduct at the Parole Board Queensland", PAGE)
    assert [s["name"] for s in subs] == ["Parole Board Queensland"]


def test_offline_client_never_requests(tmp_path):
    client = common.Client(qld_ccc.BODY, cache=tmp_path, offline=True)
    assert client.html("https://www.ccc.qld.gov.au/publications") is None
    with pytest.raises(SystemExit):
        qld_ccc.listing_rows(client)
