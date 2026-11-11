"""Royal commissions ingest and the shared PDF recommendation extractor (no network)."""
from __future__ import annotations

import json

import pymupdf
import pytest

from parli.ingest import pdf_recommendations as pr
from parli.ingest import royal_commissions as rc


def make_pdf(pages):
    """pages: [[(text, size)]]; each line on its own row in the left column."""
    doc = pymupdf.open()
    for lines in pages:
        page = doc.new_page(width=595, height=842)
        y = 60
        for text, size in lines:
            page.insert_text((60, y), text, fontsize=size)
            y += size * 1.6
    data = doc.tobytes()
    doc.close()
    return data


BODY = 10
REPORT = [
    [("Summary", 18), ("Recommendations", 14),
     ("Recommendation 1", 13), ("The Government establish an independent office to", BODY),
     ("monitor the implementation of these recommendations.", BODY),
     ("Recommendation 2", 13), ("The Department review its policies so that:", BODY),
     ("(a) complaints are recorded", BODY), ("(b) outcomes are published.", BODY),
     ("1", BODY)],
    [("(c) staff are trained.", BODY), ("Footnote text that is smaller than the body", 7),
     ("Recommendation 3", 13), ("That the Minister report to Parliament each year on progress.", BODY),
     ("Chapter 2 Background", 16), ("The commission heard from many witnesses.", BODY), ("2", BODY)],
    [("Recommendation 1", 13), ("A later chapter repeats the first recommendation.", BODY)],
]


def test_extractor_reads_a_clean_numbered_run_verbatim():
    data = make_pdf(REPORT)
    lines, texts = pr.page_lines(data), pr.page_texts(data)
    rows = pr.recommendations(lines)
    assert [n for n, *_ in rows] == ["1", "2", "3"]
    assert rows[0][1] == "The Government establish an independent office to monitor the implementation of these recommendations."
    assert rows[1][1] == "The Department review its policies so that: (a) complaints are recorded (b) outcomes are published. (c) staff are trained."
    assert rows[2][1] == "That the Minister report to Parliament each year on progress."
    assert [p for _, _, p, _ in rows] == [1, 1, 2]
    assert pr.complete(rows, lines) and pr.verified(rows, texts)


def test_extractor_reports_an_incomplete_run():
    data = make_pdf(REPORT[:1] + [[("Recommendation 4", 13), ("Out of sequence.", BODY)]])
    lines = pr.page_lines(data)
    rows = pr.recommendations(lines)
    assert [n for n, *_ in rows] == ["1", "2"]
    assert pr.complete(rows, lines)  # 3 never appears; the registry count check catches the gap


def test_verbatim_normalises_quotes_and_whitespace():
    assert pr.verbatim("the Commission’s  report", "In the Commission's\nreport today")
    assert not pr.verbatim("not there", "In the report")


def test_robots_longest_match_and_agent_groups():
    rules = rc.robots_rules("User-agent: *\nDisallow: /sites/default/files/*.pdf\nCrawl-delay: 2\n", "OPAXBot/1.0")
    assert not rc.robots_allowed("https://www.vic.gov.au/sites/default/files/x.pdf", rules)
    assert rc.robots_allowed("https://www.vic.gov.au/family-violence-recommendations/x", rules)
    assert rc.crawl_delay(rules) == 2.0


def test_detail_fields_and_fv_status():
    detail = ("<html><main><h1>Report of the Royal Commission into Family Violence - Part 1</h1>"
              "<div>Details <p>Tabled in the LA: 30 March 2016</p><p>Tabled in the LC: 30 March 2016</p>"
              "<p>Authority: Inquiries Act 2014</p> Documents <a>PDF</a></div></main></html>")
    d = rc.detail_fields(detail)
    assert d["title"] == "Report of the Royal Commission into Family Violence - Part 1"
    assert d["tabled_la"] == "2016-03-30" and d["authority"] == "Inquiries Act 2014"
    page = ('<main><h1 class="x">Determine whether services should be unified</h1>'
            '<p class="rpl-type-p-large" data-cy="hero-summary"><!--[-->Recommendation 032<!--]--></p>'
            '<div class="tide-fv-recommendation-status"><span class="tide-fv-recommendation-status__name rpl-type-label">Implemented</span></div>'
            '<h2>Who is leading the change</h2><p>Family Safety Victoria</p><p>The Victorian Government review services.</p>'
            '<p>Updated</p><p>8 September 2026</p></main>')
    s = rc.fv_status(page)
    assert s == {"number": "32", "as_published": "Implemented", "lead": "Family Safety Victoria", "updated": "2026-09-08"}


def write_run(tmp_path, pdf_url, detail_html, tracker_pages=()):
    run = tmp_path / "raw" / "20261111T000000Z"
    (run / "pages").mkdir(parents=True)
    (run / "pages" / (rc.url_key(rc.DETAIL + "100") + ".html")).write_text(detail_html)
    for url, html in tracker_pages:
        (run / "pages" / (rc.url_key(url) + ".html")).write_text(html)
    (run / "trackers.json").write_text(json.dumps({"test-rc": [u for u, _ in tracker_pages]}))
    (run / "manifest.json").write_text(json.dumps({"complete": True, "fetched_at": "2026-11-11T00:00:00+00:00"}))
    (tmp_path / "pdf").mkdir()
    (tmp_path / "pdf" / (rc.url_key(pdf_url) + ".pdf")).write_bytes(make_pdf(REPORT))
    return run


def registry_entry(count, facts=()):
    return {"id": "test-rc", "name": "Royal Commission into Testing", "inquiry_type": "royal_commission", "jurisdiction": "Vic",
            "documents": [{"key": "final", "kind": "final_report", "source": "parliament_vic", "tabled_paper": 100,
                           "files": "final", "recommendations": {"count": count}}],
            "tracker": {"kind": "vic_gov_pages", "format": "fv_status", "report": "final", "min_matched": 1},
            "facts": list(facts)}


def test_build_commission_extracts_cites_and_attaches_status(tmp_path):
    pdf_url = rc.PV + "/abc123/globalassets/tabled-paper-documents/tabled-paper-100/final.pdf"
    detail = (f'<main><h1>Final report</h1><div>Details Tabled in the LA: 1 June 2020 Documents</div>'
              f'<a href="{pdf_url}">PDF</a></main>')
    status_url = rc.VIC + "/family-violence-recommendations/establish-office"
    status = ('<main><h1>Establish an office</h1><p data-cy="hero-summary">Recommendation 001</p>'
              '<span class="tide-fv-recommendation-status__name">In progress</span> Who is leading the change Department of Justice '
              'The Victorian Government Updated 2 March 2026</main>')
    run = write_run(tmp_path, pdf_url, detail, [(status_url, status)])
    fact = {"field": "commissioner", "value": "The Department", "doc": "final", "page": 1,
            "quote": "The Department review its policies"}
    out = rc.build_commission(registry_entry(3, [fact]), run, rc.Texts(tmp_path), {"test-rc": [status_url]})
    assert out["final_report_date"] == "2020-06-01" and out["reports"][0]["date_basis"] == "tabled_vic"
    assert out["reports"][0]["acquisition"] == rc.OPAXBOT
    assert [r["number"] for r in out["recommendations"]] == ["1", "2", "3"]
    first = out["recommendations"][0]
    assert first["cite"] == {"url": pdf_url, "document": "Final report", "page": 1}
    assert first["status"]["as_published"] == "In progress" and first["status"]["lead"] == "Department of Justice"
    assert out["recommendations"][1]["status"] is None  # no published status: unknown, not inferred
    assert out["commissioners"][0]["cite"]["page"] == 1


def test_build_commission_holds_on_count_mismatch_and_bad_quote(tmp_path):
    pdf_url = rc.PV + "/abc123/globalassets/tabled-paper-documents/tabled-paper-100/final.pdf"
    detail = f'<main><h1>Final report</h1><a href="{pdf_url}">PDF</a></main>'
    run = write_run(tmp_path, pdf_url, detail)
    with pytest.raises(SystemExit) as e:
        rc.build_commission({**registry_entry(4), "tracker": None}, run, rc.Texts(tmp_path), {})
    assert e.value.code == 3
    bad = {"field": "established", "value": "2015-02-22", "doc": "final", "page": 1, "quote": "Letters patent issued"}
    with pytest.raises(SystemExit) as e:
        rc.build_commission({**registry_entry(3, [bad]), "tracker": None}, run, rc.Texts(tmp_path), {})
    assert e.value.code == 3


def test_registry_is_well_formed():
    reg = rc.registry()
    ids = [c["id"] for c in reg["commissions"]]
    assert len(ids) == len(set(ids))
    for c in reg["commissions"]:
        assert c["jurisdiction"] in rc.JURISDICTIONS and c["inquiry_type"] in rc.INQUIRY_TYPES
        for d in c["documents"]:
            assert d["kind"] in rc.DOC_KINDS
            assert d["source"] in rc.SOURCES
            if d["source"] in ("url", "manual"):
                assert d["url"].startswith("https://")
            if d["source"] == "manual":
                assert len(d["sha256"]) == 64 and d["title"] and d["document_kind"] and d["rights"]
                assert d["acquisition"] in ("manual publisher download supplied by the OPAX maintainer, 11 Nov 2026",
                                            "manual publisher download supplied by the OPAX maintainer, 12 Nov 2026")
            if d["kind"] == "hearing_transcript":
                assert "recommendations" not in d
            if "recommendations" in d:
                assert d["kind"] in rc.REPORT_KINDS and d["recommendations"]["count"] > 0
        for f in c.get("facts", []):
            assert f["field"] in ("established", "commissioner") and f["quote"] and f["page"] >= 1


def manual_entry(sha):
    return {"id": "test-manual", "name": "Royal Commission into Supplied Copies", "inquiry_type": "royal_commission", "jurisdiction": "Cth",
            "documents": [{"key": "final", "kind": "final_report", "source": "manual", "url": "https://publisher.example.gov.au/final.pdf",
                           "sha256": sha, "title": "Final report", "document_kind": "final report",
                           "acquisition": "manual publisher download supplied by the OPAX maintainer, 11 Nov 2026",
                           "rights": "No notice.", "recommendations": {"count": 3}}]}


def test_manual_document_is_cited_to_the_publisher_and_hash_checked(tmp_path):
    import hashlib
    data = make_pdf(REPORT)
    sha = hashlib.sha256(data).hexdigest()
    (tmp_path / "manual").mkdir()
    (tmp_path / "manual" / (sha + ".pdf")).write_bytes(data)
    run = tmp_path / "raw" / "r"
    run.mkdir(parents=True)
    out = rc.build_commission(manual_entry(sha), run, rc.Texts(tmp_path), {})
    assert out["reports"][0]["acquisition"].startswith("manual publisher download")
    assert out["recommendations"][0]["cite"]["url"] == "https://publisher.example.gov.au/final.pdf"
    with pytest.raises(SystemExit):
        (tmp_path / "manual" / (sha + ".pdf")).write_bytes(data + b"%")
        rc.build_commission(manual_entry(sha), run, rc.Texts(tmp_path), {})


def test_absent_manual_document_is_carried_forward(tmp_path, monkeypatch):
    run = tmp_path / "raw" / "r"
    run.mkdir(parents=True)
    with pytest.raises(rc.ManualMissing):
        rc.build_commission(manual_entry("0" * 64), run, rc.Texts(tmp_path), {})
    (tmp_path / "snapshot.json").write_text(json.dumps({"commissions": [{"id": "test-manual", "kept": True}]}))
    assert rc.carried(manual_entry("0" * 64), tmp_path) == {"id": "test-manual", "kept": True}


def test_transcripts_are_documents_only_and_court_context_is_verbatim(tmp_path):
    pdf_url = rc.PV + "/abc123/globalassets/tabled-paper-documents/tabled-paper-100/final.pdf"
    detail = f'<main><h1>Final report</h1><a href="{pdf_url}">PDF</a></main>'
    run = write_run(tmp_path, pdf_url, detail)
    page = "https://www.example.gov.au/inquiry"
    (run / "pages" / (rc.url_key(page) + ".html")).write_text("<main><p>On 4 March 2024, the Court made orders.</p></main>")
    entry = {**registry_entry(3), "tracker": None,
             "court_context": [{"url": page, "document": "Example page", "applies_to": "final", "quote": "On 4 March 2024, the Court made orders."}]}
    out = rc.build_commission(entry, run, rc.Texts(tmp_path), {})
    assert out["court_context"][0]["cite"]["url"] == page and out["court_context"][0]["applies_to"] == "final"
    entry["court_context"][0]["quote"] = "On 4 March 2024, the Court set the report aside."
    with pytest.raises(SystemExit):
        rc.build_commission(entry, run, rc.Texts(tmp_path), {})


def test_iso_date_reads_a_numeric_transcript_header_only_whole():
    from parli.ingest.royal_commissions import iso_date
    assert iso_date("17 AUGUST 2026") == "2026-08-17"
    assert iso_date("13/08/2026") == "2026-08-13"
    assert iso_date("ASCRC – 13/08/2026") is None  # a numeric date is accepted only as the whole quote
    assert iso_date("13/13/2026") is None


def test_registry_transcripts_are_manual_dated_and_carry_rights():
    import json
    from parli.ingest.royal_commissions import REGISTRY
    reg = json.loads(REGISTRY.read_text())
    transcripts = [d for c in reg["commissions"] for d in c["documents"] if d["kind"] == "hearing_transcript"]
    assert len(transcripts) >= 218
    for d in transcripts:
        assert d["source"] == "manual" and len(d["sha256"]) == 64
        assert d["date_quote"] and d["date_page"] == 1 and d["rights"]
        assert "(PDF" not in d["title"] and not d["title"].lower().startswith("download")
