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
