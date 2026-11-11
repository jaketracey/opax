"""IBAC adapter: classification, tabled-page parsing, recommendations and the Sandon supplement (no network)."""
import pymupdf

from parli.ingest.integrity import common, run, vic_ibac as v


def hit(title, author=""):
    return {"content": {"title": title, "subtitle": author}}


def test_registered_and_classifies_ibac_papers():
    assert "vic_ibac" in run.ADAPTERS
    ibac = "Independent Broad-based Anti-corruption Commission"
    assert v.is_ibac(hit("Operation Watts: Investigation into the misuse of electorate and ministerial office resources", ibac)) == "report"
    assert v.is_ibac(hit("Government response to IBAC's Operation Watts report")) == "government_response"
    assert v.is_ibac(hit("Annual Report 2024-25", "Victorian Ombudsman")) is None


def test_report_types_follow_the_title_and_never_infer_findings():
    assert v.report_type("Operation Watts: Investigation into ...", None, None) == ("investigation_report", "Investigation report")
    assert v.report_type("Special report on Operation Sandon", None, None) == ("special_report", "Special report")
    assert v.report_type("Report 2024-25", None, None) == ("other", "Annual report")
    assert v.report_type("Special report on corruption risks", "Surveillance Devices Act 1999", None)[0] == "other"
    assert v.operations("Special report concerning Operations Ord and Esperance") == ["Ord", "Esperance"]


def test_detail_fields_read_tabled_dates():
    html = ("<main><h1>Operation Watts</h1><div>Details <p>Tabled in the LA: 20 July 2022</p>"
            "<p>Tabled in the LC: 2 August 2022</p><p>Authority: IBAC Act 2011</p><p>Section: 162(1)</p> Documents <a>PDF</a></div></main>")
    d = v.detail_fields(html)
    assert d["tabled_la"] == "2022-07-20" and d["tabled_lc"] == "2022-08-02"
    assert d["authority"] == "IBAC Act 2011" and d["section"] == "162(1)"


def make_pdf(lines):
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    y = 80
    for text, size in lines:
        page.insert_text((60, y), text, fontsize=size)
        y += size * 1.6
    data = doc.tobytes()
    doc.close()
    return data


def test_recommendations_are_verbatim_and_complete():
    data = make_pdf([("Recommendations", 16), ("Recommendation 1", 13),
                     ("That the Department of Premier and Cabinet review its gift register.", 10),
                     ("Recommendation 2", 13), ("That Victoria Police report to IBAC within six months.", 10)])
    lines, texts = v.page_lines(data), common.pdf_pages(data)
    rows = v.recommendations(lines)
    assert [n for n, *_ in rows] == ["1", "2"]
    assert v.usable(rows) and v.complete(rows, lines) and v.verified(rows, texts)


def test_sandon_progress_report_is_a_manual_government_response_not_an_ibac_report():
    [r] = v.manual_responses("Sandon")
    assert r["kind"] == "progress_report" and r["date"] is None
    assert r["url"].startswith("https://www.vic.gov.au/") and r["cite"]["url"] == "https://www.vic.gov.au/operation-sandon-progress-report"
    assert r["acquisition"] == "manual publisher download supplied by the OPAX maintainer, 11 Nov 2026"
    assert r["publisher"] == "Victorian Government" and len(r["sha256"]) == 64
    assert v.manual_responses("Watts") == []
