"""Missing-holder regressions in the DB exporter and retained public examples."""
import json
from pathlib import Path
import sqlite3
import sys

import pytest

from scripts import export_interests as exporter


@pytest.mark.parametrize("value", [None, "", " ", "unspecified", " Unspecified "])
def test_missing_holder_keeps_the_released_app_wire_string(value):
    assert exporter.holder_value(value) == "unspecified"


@pytest.mark.parametrize("value", ["self", "spouse", "children", "Self and spouse"])
def test_stated_holder_is_preserved(value):
    assert exporter.holder_value(value) == value


def test_db_export_projects_missing_holder_in_every_location(tmp_path, monkeypatch):
    db_path = tmp_path / "interests.sqlite"
    db = sqlite3.connect(db_path)
    db.executescript("""
        CREATE TABLE ext_interests_documents (doc_id, jurisdiction, chamber, parliament,
            person_id, member_name, member_name_raw, source_url, last_updated, statement_date, warnings);
        CREATE TABLE ext_interests (id, doc_id, holder, category, kind, fields_json,
            description, date_declared, page, ocr);
    """)
    db.execute("INSERT INTO ext_interests_documents VALUES (?,?,?,?,?,?,?,?,?,?,?)",
               ("test", "federal", "house", 48, "12345", "Alex Example", "Alex Example",
                "https://example.test/register.pdf", "2026-10-07", None, "[]"))
    for n, holder in enumerate([None, "", "unspecified", "self"], 1):
        db.execute("INSERT INTO ext_interests VALUES (?,?,?,?,?,?,?,?,?,?)",
                   (n, "test", holder, "shareholdings", "addition", '{"company":"Example Network Ltd"}',
                    "Example Network Ltd", f"2026-10-0{n}", n, 0))
    db.commit()
    db.close()
    money, access, fits = (tmp_path / f"{name}.json" for name in ["money", "access", "fits"])
    money.write_text(json.dumps({"nodes": [{"kind": "donor", "id": "donor:example", "label": "Example Network Ltd"}], "edges": []}))
    access.write_text("{}")
    fits.write_text("{}")
    out = tmp_path / "out"
    monkeypatch.setattr(exporter, "DB", f"file:{db_path}?mode=ro")
    monkeypatch.setattr(sys, "argv", ["export_interests.py", "--out", str(out), "--money", str(money),
                                    "--access", str(access), "--fits", str(fits)])
    exporter.main()
    person = json.loads((out / "12345.json").read_text())
    assert [r["holder"] for r in person["buckets"]["shareholdings"]["items"]] == ["self", "unspecified", "unspecified", "unspecified"]
    assert sum(t["register"]["holder"] == "unspecified" for t in person["ties"]) == 3
    assert sum(r["holder"] == "unspecified" for r in json.loads((out / "recent.json").read_text())["items"]) == 3
    donor_rows = json.loads((out / "ties-by-donor.json").read_text())["donors"]["Example Network Ltd"]
    assert sum(r["holder"] == "unspecified" for r in donor_rows) == 3


def test_replay_real_registers_repairs_nullable_wire_values_without_changing_other_values(tmp_path):
    source = Path(__file__).resolve().parents[1] / "portal/public/interests"
    retained = tmp_path / "retained"
    retained.mkdir()

    def nullable_snapshot(value):
        if isinstance(value, dict):
            return {k: None if k == "holder" and v == "unspecified" else nullable_snapshot(v) for k, v in value.items()}
        if isinstance(value, list):
            return [nullable_snapshot(v) for v in value]
        return value

    def expected(value):
        if isinstance(value, dict):
            return {k: exporter.holder_value(v) if k == "holder" else expected(v) for k, v in value.items()}
        if isinstance(value, list):
            return [expected(v) for v in value]
        return value

    for file in source.glob("*.json"):
        (retained / file.name).write_text(json.dumps(nullable_snapshot(json.loads(file.read_text()))))
    exporter.replay_export(retained, tmp_path / "out")
    for file in source.glob("*.json"):
        assert json.loads((tmp_path / "out" / file.name).read_text()) == expected(json.loads(file.read_text()))
