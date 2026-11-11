"""ACT Integrity Commission adapter: list parsing and record building on trimmed fixtures (no network)."""
import json
from pathlib import Path

import pytest

from parli.ingest.integrity import act_ic, common

FIX = Path(__file__).parent / "fixtures" / "integrity" / "act_ic"


@pytest.fixture(scope="module")
def entries():
    return act_ic.parse_list((FIX / "commission-reports.html").read_text())


def _pages(name):
    """The fixture's kept page texts, with every other page blank, at the PDF's real page count."""
    fx = json.loads((FIX / "page-text.json").read_text())[name]
    pages = [""] * fx["page_count"]
    for n, text in fx["pages"].items():
        pages[int(n) - 1] = text
    return fx["url"], pages


def _entry(entries, name):
    return next(e for e in entries if e[3].endswith("/" + name))


def test_list_parses_every_report_in_page_order(entries):
    names = [e[3].rsplit("/", 1)[1] for e in entries]
    assert len(entries) == 13
    assert names[0] == "Investigation-Report-Operation-Kingfisher.pdf"
    assert names[-1].startswith("Special-Report-Operation-Lyrebird-Part-1")
    assert all(e[3].startswith("https://www.integrity.act.gov.au/") and e[3].endswith(".pdf") for e in entries)
    assert {e[0] for e in entries} >= {"2026-27", "2024-25", "2021-22"}
    # every curated entry is on the list, and the executive summary is the only extra PDF
    assert set(act_ic.CURATED) <= set(names)
    assert set(names) - set(act_ic.CURATED) == {"Operation-Raven-Executive-Summary.pdf"}


def test_list_keeps_supporting_pages_and_footnotes(entries):
    king = _entry(entries, "Investigation-Report-Operation-Kingfisher.pdf")
    assert king[1] == "Operation Kingfisher" and king[4]
    falcon = _entry(entries, "Investigation-Report-Operation-Falcon.pdf")
    assert any("Falcon" in n for n in falcon[5])


def test_list_without_structure_is_held():
    with pytest.raises(common.Held):
        act_ic.parse_list("<html><body><div id='main'><p>Moved</p></div></body></html>")


def test_kite_announcement_records_the_no_finding_verbatim(entries):
    name = "Op-Kite-Confidential-Report-announcement.pdf"
    url, pages = _pages(name)
    rec = act_ic.build(_entry(entries, name), url, pages, b"%PDF-fixture")
    assert rec["id"] == "act-ic-2024-08-05-operation-kite"
    assert rec["report_type"] == "other" and rec["type_as_published"].startswith("Confidential Investigation Report")
    assert (rec["date"], rec["date_basis"]) == ("2024-08-05", "dated")
    [f] = rec["findings"]
    assert f["kind"] == "no_finding" and f["text"] == "There was no finding of corrupt conduct within this Report."
    assert f["cite"]["page"] == 1 and common.verbatim(f["text"], common.flat(pages[0]))
    assert rec["subjects"] == []
    assert any("not published" in n for n in rec["notes"])


def test_falcon_no_finding_subjects_and_correction_note(entries):
    name = "Investigation-Report-Operation-Falcon.pdf"
    url, pages = _pages(name)
    entry = _entry(entries, name)
    notes = [n.lstrip("*").strip() for n in entry[5]]
    rec = act_ic.build(entry, url, pages, b"%PDF-fixture", list_notes=notes)
    assert rec["id"] == "act-ic-2025-01-17-operation-falcon"
    [f] = rec["findings"]
    assert f["kind"] == "no_finding" and f["label"] in f["text"] and f["cite"]["page"] == 5
    assert {s["name"] for s in rec["subjects"]} == {
        "Alexander Maconochie Centre", "General Manager of the Alexander Maconochie Centre", "corrections officer"}
    assert all(s["kind"] in ("body", "public_role") for s in rec["subjects"])
    assert any("corrected" in n for n in rec["notes"])


def test_only_commission_recommendations_are_recorded_so_none(entries):
    for name in ("Op-Kite-Confidential-Report-announcement.pdf", "Investigation-Report-Operation-Falcon.pdf"):
        url, pages = _pages(name)
        rec = act_ic.build(_entry(entries, name), url, pages, b"%PDF-fixture")
        assert rec["recommendations"] == [] and rec["recommendations_status"] == "not_extracted"
        assert act_ic.NO_RECS in rec["notes"]
        assert rec["responses"] == [] and rec["responses_status"] == "none_found"


def test_changed_source_text_drops_the_finding_and_date(entries):
    name = "Investigation-Report-Operation-Falcon.pdf"
    url, pages = _pages(name)
    pages = [p.replace("no finding that they were guilty", "no view on whether they were guilty")
              .replace("17 January 2025", "January 2025") for p in pages]
    rec = act_ic.build(_entry(entries, name), url, pages, b"%PDF-fixture")
    assert rec["findings"] == [] and rec["findings_status"] == "not_extracted"
    assert rec["date"] is None and rec["id"].startswith("act-ic-undated-")


def test_uncurated_report_is_recorded_without_date_or_findings(entries):
    entry = ("2027-28", "Operation Example", "Operation Example Special Report",
             "https://www.integrity.act.gov.au/__data/assets/pdf_file/0001/1/Operation-Example.pdf", None, [])
    rec = act_ic.build(entry, entry[3], ["Some text."], b"%PDF-fixture")
    assert rec["report_type"] == "special_report" and rec["type_as_published"] == "Special Report"
    assert rec["date"] is None and rec["findings"] == [] and rec["findings_status"] == "not_extracted"
    assert rec["operation"] == "Operation Example"
    assert any("not yet reviewed" in n for n in rec["notes"])


def test_body_and_licence():
    assert act_ic.BODY.jurisdiction == "ACT" and act_ic.BODY.interval >= 3
    assert act_ic.BODY.licence["url"].endswith("/copyright")
    assert act_ic.MIN_RECORDS >= 10 and act_ic.GAPS
