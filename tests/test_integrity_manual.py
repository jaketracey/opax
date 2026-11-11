"""The committed manual supplement (publisher PDFs supplied by the maintainer) and its merge rules."""
from __future__ import annotations

import json

from parli.ingest.integrity import common, manual, nacc, nt_icac, tas_ic


def test_supplement_records_are_schema_records_with_provenance():
    data = json.loads(manual.SUPPLEMENT.read_text())
    assert data["schema"] == common.SCHEMA
    assert set(data["records"]) == {"nacc", "tas_ic", "nt_icac"}
    for code, records in data["records"].items():
        assert records
        for r in records:
            assert r["body"] == code and r["id"].startswith(code.replace("_", "-") + "-")
            assert r["acquisition"] == manual.ACQUISITION
            assert r["report_type"] in common.REPORT_TYPES
            assert r["page_url"].startswith("https://") and r["pdf_url"].startswith("https://")
            for d in r["documents"]:
                assert d["acquisition"] == manual.ACQUISITION and len(d["sha256"]) == 64
            for item in r["findings"] + r["recommendations"]:
                assert item["text"] and item["cite"]["url"].startswith("https://") and item["cite"]["page"] >= 1
            for f in r["findings"]:
                assert f["kind"] in common.FINDING_KINDS and f["label"]
            if "annual report" in r["title"].lower():
                assert r["report_type"] == "other" and not r["findings"] and not r["recommendations"]


def test_supplement_keeps_the_report_wording_and_status():
    by_id = {r["id"]: r for rs in json.loads(manual.SUPPLEMENT.read_text())["records"].values() for r in rs}
    myrtle = by_id["nacc-undated-operation-myrtleford"]
    assert myrtle["recommendations_status"] == "stated_none" and myrtle["date"] is None
    assert [f["kind"] for f in myrtle["findings"]].count("no_finding") == 4
    king = by_id["nacc-2025-06-30-operation-kingscliff"]
    assert [x["number"] for x in king["recommendations"]] == ["1", "2", "3"]
    # a submission quoted in a report is never a finding
    pent = by_id["nacc-2026-05-13-operation-pentecost"]
    assert not any("there is no sound evidentiary basis" in f["text"] for f in pent["findings"])
    karamu = by_id["tas-ic-2025-12-02-karamu"]
    assert [int(x["number"]) for x in karamu["recommendations"]] == list(range(1, len(karamu["recommendations"]) + 1))
    assert karamu["responses_status"] == "published"
    assert not any("" in x["text"] for x in karamu["recommendations"])


def test_gap_adapters_still_report_their_gaps():
    for module in (nacc, tas_ic, nt_icac):
        assert module.KNOWN_GAP and module.GAPS
        assert any("manual" in g for g in module.GAPS)


def test_merge_prefers_the_adapter_record_and_notes_a_byte_identical_match():
    adapter = {"id": "nacc-2025-01-01-operation-x", "pdf_url": "https://www.nacc.gov.au/x.pdf", "notes": [],
               "documents": [{"url": "https://www.nacc.gov.au/x.pdf", "sha256": "a" * 64}]}
    same = {"id": "nacc-2025-01-01-operation-x-manual", "pdf_url": "https://www.nacc.gov.au/x.pdf",
            "documents": [{"url": "https://www.nacc.gov.au/x.pdf", "sha256": "a" * 64}]}
    other = {"id": "nacc-2025-02-02-operation-y", "pdf_url": "https://www.nacc.gov.au/y.pdf",
             "documents": [{"url": "https://www.nacc.gov.au/y.pdf", "sha256": "b" * 64}]}
    out = manual.merge([adapter], [same, other])
    assert [r["id"] for r in out] == [adapter["id"], other["id"]]
    assert "byte-identical" in out[0]["notes"][0] and manual.ACQUISITION in out[0]["notes"][0]


def test_runner_writes_supplement_for_a_gap_body(tmp_path, monkeypatch):
    from parli.ingest.integrity import run
    monkeypatch.setattr(common, "CACHE", tmp_path)
    monkeypatch.setattr(common.Client.__init__, "__defaults__", (tmp_path, None, False, False))
    monkeypatch.setattr(common.write_snapshot, "__defaults__", ((), 1, False, tmp_path))
    try:
        run.refresh_body("nacc", offline=True)
    except SystemExit as exc:
        assert exc.code == 3
    snap = json.loads((tmp_path / "snapshots" / "nacc.json").read_text())
    assert snap["counts"]["records"] == len(manual.load("nacc")) and snap["gaps"] == nacc.GAPS
