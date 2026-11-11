"""Shared integrity-report schema, robots and verbatim guards (offline)."""
import json

import pytest

from parli.ingest.integrity import common as c

BODY = c.Body("test_ic", "Test Integrity Commission", "Test IC", "NSW", "https://ic.example.gov.au")


def test_robots_groups_wildcards_and_blank_lines():
    r = c.Robots("User-agent: *\n\nCrawl-delay: 20\nDisallow: /search\nDisallow: /*_edit\nDisallow:  /reports\n\n"
                 "User-Agent: Funnelback\nCrawl-delay: 0\n")
    assert not r.allowed("https://x/search?q=a")
    assert not r.allowed("https://x/page_edit")
    assert not r.allowed("https://x/reports/2024")
    assert r.allowed("https://x/reporting/how")
    assert r.allowed("https://x/ArticleDocuments/1/a.pdf.aspx")
    assert r.crawl_delay() == 20


def test_robots_specific_agent_and_allow_precedence():
    r = c.Robots("User-agent: OPAXBot\nDisallow: /private\nAllow: /private/reports\n\nUser-agent: *\nDisallow: /\n")
    assert r.allowed("https://x/public")
    assert not r.allowed("https://x/private/a")
    assert r.allowed("https://x/private/reports/1")
    assert c.Robots("").allowed("https://x/anything")
    assert not c.Robots("User-agent: *\nDisallow: /\n").allowed("https://x/a")
    assert c.Robots("User-agent: *\nDisallow: /*.pdf$\n").allowed("https://x/a.pdf.aspx")


def test_verbatim_tolerates_layout_not_wording():
    page = "The Commission finds that Mr A engaged in serious corrupt\ncon-\nduct by ... ‘x’"
    assert c.verbatim("engaged in serious corrupt con-duct", page)
    assert c.verbatim("'x'", page)
    assert not c.verbatim("engaged in corrupt conduct", page)


def test_finding_and_recommendation_must_be_on_the_cited_page():
    page = "RECOMMENDATION 1 That the council reviews its procurement policy.\nRECOMMENDATION 2 ..."
    rec = c.recommendation("1", "That the council reviews its procurement policy.", c.cite("https://x/a.pdf", "Report", 12), page)
    assert rec["number"] == "1" and rec["cite"]["page"] == 12
    with pytest.raises(ValueError):
        c.recommendation("1", "That the council abolishes procurement.", c.cite("https://x/a.pdf", "Report", 12), page)
    with pytest.raises(ValueError):
        c.finding("corrupt conduct", "allegation", "x", c.cite("https://x", "R"), "x")


def test_report_record_enforces_status_and_enums():
    rec = c.report_record(BODY, title="Investigation into X (Operation Alpha)", page_url="https://ic.example.gov.au/a",
                          report_type="investigation_report", date="2024-05-01", date_basis="published",
                          operation="Operation Alpha")
    assert rec["id"] == "test-ic-2024-05-01-operation-alpha"
    assert rec["findings_status"] == "not_extracted" and rec["findings"] == []
    with pytest.raises(ValueError):
        c.report_record(BODY, title="X", page_url="u", report_type="media_release")
    with pytest.raises(ValueError):
        c.report_record(BODY, title="X", page_url="u", report_type="statement", date="2024-05-01")
    with pytest.raises(ValueError):
        c.report_record(BODY, title="X", page_url="u", report_type="statement", findings_status="extracted")


def test_snapshot_guards(tmp_path):
    recs = [c.report_record(BODY, title=f"Report {i}", page_url=f"https://ic.example.gov.au/{i}",
                            report_type="investigation_report", key=f"r{i}") for i in range(10)]
    snap = c.write_snapshot(BODY, recs, None, cache=tmp_path)
    assert snap["counts"]["records"] == 10
    with pytest.raises(SystemExit) as held:
        c.write_snapshot(BODY, recs[:5], None, cache=tmp_path)
    assert held.value.code == 3
    with pytest.raises(SystemExit):
        c.write_snapshot(BODY, recs + recs[:1], None, cache=tmp_path)
    assert json.loads((tmp_path / "snapshots" / "test_ic.json").read_text())["counts"]["records"] == 10


def test_offline_client_never_requests(tmp_path):
    client = c.Client(BODY, cache=tmp_path, offline=True)
    assert client.get("https://ic.example.gov.au/a.pdf", "pdf") is None
    with pytest.raises(SystemExit):
        client._raw("https://ic.example.gov.au/robots.txt")
