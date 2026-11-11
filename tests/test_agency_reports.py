"""Checks for the agency annual report facts: whole-figure matching and the Portal guard."""
import json

from parli.ingest import agency_reports as ar


def test_as_token_matches_whole_figures_only():
    assert ar.as_token("254.9", "Total 250.1 254.9")
    assert ar.as_token("$1,234", "Total expenses $1,234 in 2026")
    assert not ar.as_token("25", "Total 254.9")
    assert not ar.as_token("1,23", "Total 1,234")
    assert not ar.as_token("4", "Band 1 5 3 7 4.5")


def test_portal_linked_body_rejects_pay_and_finance():
    pages = ["Secretary remuneration 867,707 Applications received 109"]
    row = {"portal_body_id": "department_of_finance"}
    base = {"unit": "dollars", "page": 1, "quote": "Secretary remuneration 867,707", "value_as_published": "867,707", "value": 867707,
            "label_as_published": "Secretary remuneration"}
    assert any("Transparency Portal" in e for e in ar.check_fact({**base, "metric": "head_remuneration"}, pages, row))
    ok = {"metric": "matters_received", "unit": "count", "page": 1, "quote": "Applications received 109", "value_as_published": "109",
          "value": 109, "label_as_published": "Applications received"}
    assert ar.check_fact(ok, pages, row) == []


def test_every_facts_file_names_an_intake_document():
    rows = ar.intake_rows()
    for path in (ar.DATA / "facts").glob("*.json"):
        doc = json.loads(path.read_text())
        assert doc["report_id"] == path.stem and doc["report_id"] in rows
        assert all(f["metric"] in ar.METRICS and f["unit"] in ar.UNITS for f in doc["facts"])


def test_page_text_reads_control_characters_as_spaces(tmp_path, monkeypatch):
    import json as _json
    from parli.ingest import agency_reports as ar
    (tmp_path / "text").mkdir()
    (tmp_path / "text" / "abc.json").write_text(_json.dumps(["\u0007Fatalities\u00073"]))
    monkeypatch.setattr(ar, "CACHE", tmp_path)
    assert ar.page_text({"sha256": "abc"}) == [" Fatalities 3"]


def test_scanned_figures_need_ocr_provenance(monkeypatch):
    from parli.ingest import agency_reports as ar
    fact = {"metric": "operational_other", "label_as_published": "contacts", "value_as_published": "494", "unit": "count",
            "page": 1, "quote": "received 494 contacts", "value": 494}
    monkeypatch.setattr(ar, "scanned", lambda row: True)
    errs = ar.check_fact(dict(fact), ["the unit received 494 contacts"], {"sha256": "x"})
    assert any("extraction" in e for e in errs)
    ok = dict(fact, extraction={"method": "ocr", "engine": "Apple Vision (on device)", "check": "page_image_checked"})
    assert ar.check_fact(ok, ["the unit received 494 contacts"], {"sha256": "x"}) == []
    bad = dict(fact, extraction={"method": "ocr", "engine": "x", "check": "looked fine"})
    assert any("extraction needs" in e for e in ar.check_fact(bad, ["the unit received 494 contacts"], {"sha256": "x"}))


def test_ocr_text_backs_scanned_documents():
    from parli.ingest import agency_reports as ar
    rows = ar.intake_rows()
    for rid in ("nt-integrity-nt-northern-territory-government-2025-26-annual-report",
                "nsw-independent-commission-against-corruption-2025-26-assumed-identities-return"):
        doc = ar.load_facts(rid)
        assert doc and doc["facts"], rid
        assert all(f.get("extraction", {}).get("method") == "ocr" for f in doc["facts"]), rid
        ocr = json.loads((ar.DATA / "ocr" / f"{rid}.json").read_text())
        assert ocr["sha256"] == rows[rid]["sha256"]


def test_ocr_fills_only_pages_without_a_text_layer(tmp_path, monkeypatch):
    from parli.ingest import agency_reports as ar
    (tmp_path / "cache" / "text").mkdir(parents=True)
    (tmp_path / "data" / "ocr").mkdir(parents=True)
    (tmp_path / "cache" / "text" / "abc.json").write_text(json.dumps(["", "Independent Auditor's Report", " "]))
    ocr = {"sha256": "abc", "pages": [{"page": 1, "text": "Total expenses 4,512", "rows": "Total expenses 4,512"},
                                      {"page": 2, "text": "ignored", "rows": ""}, {"page": 3, "text": "Staff 12", "rows": ""}]}
    (tmp_path / "data" / "ocr" / "r.json").write_text(json.dumps(ocr))
    monkeypatch.setattr(ar, "CACHE", tmp_path / "cache")
    monkeypatch.setattr(ar, "DATA", tmp_path / "data")
    row = {"sha256": "abc", "report_id": "r"}
    assert ar.ocr_pages(row) == {1, 3}
    pages = ar.page_text(row)
    assert pages[1] == "Independent Auditor's Report" and "Total expenses 4,512" in pages[0] and "Staff 12" in pages[2]
    fact = {"metric": "total_expenses", "label_as_published": "Total expenses", "value_as_published": "4,512", "unit": "thousands_of_dollars",
            "period": "2025-26", "page": 1, "quote": "Total expenses 4,512", "value": 4512}
    assert any("extraction" in e for e in ar.check_fact(dict(fact), pages, row)), "an OCR page needs provenance"
    ok = dict(fact, extraction={"method": "ocr", "engine": "Apple Vision (on device)", "check": "page_image_checked"})
    assert ar.check_fact(ok, pages, row) == []
    assert ar.ocr_pages({"sha256": "abc", "report_id": "other"}) == set()
