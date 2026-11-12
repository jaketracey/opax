"""Real bad publication-date inputs from the three 2024-25 annual reports."""
import hashlib
import json
from pathlib import Path

import pytest

from parli.ingest.transparency_portal import publication_date, projected_publication_date
from scripts.export_annual_reports import replay_export


# These are the validation-message date components retained by the old parser.
BAD_REPORTS = [
    ("national_commission_for_aboriginal_and_torres_stra", "21/05/2026", "2026-21-05", "2026-05-21"),
    ("office_of_the_auditing_and_assurance_standards_boa_17974c4", "21/05/2026", "2026-21-05", "2026-05-21"),
    ("royal_australian_air_force_welfare_trust_fund", "25/05/2026", "2026-25-05", "2026-05-25"),
]


@pytest.mark.parametrize("body,raw,old,want", BAD_REPORTS)
def test_real_bad_publication_dates(body, raw, old, want):
    assert publication_date(f"Annual Report Published: {raw}") == want
    assert projected_publication_date(old) == want
    assert projected_publication_date(want) == want


@pytest.mark.parametrize("raw,want", [
    ("05/21/2026", "2026-05-21"), ("05/06/2026", "2026-05-06"),
    ("02/29/2024", "2024-02-29"), ("29/02/2024", "2024-02-29"),
    ("02/29/2026", None), ("31/04/2026", None), ("00/05/2026", None),
    ("25/25/2026", None),
])
def test_month_first_ambiguity_and_calendar_validation(raw, want):
    assert publication_date(f"Annual Report Published: {raw}") == want


def test_retained_export_reparses_real_bad_inputs_without_changing_coverage(tmp_path):
    source = Path(__file__).resolve().parents[1] / "portal/public/annual-reports"
    index = json.loads((source / "index.json").read_text())
    manifest = json.loads((source / "manifest.json").read_text())
    baseline = json.loads(json.dumps(index))
    bodies = {b["id"]: b for b in index["bodies"]}
    for body, raw, old, want in BAD_REPORTS:
        bodies[body]["reports"]["2024-25"]["published_on"] = old
    retained = tmp_path / "retained"
    retained.mkdir()
    (retained / "index.json").write_text(json.dumps(index))
    (retained / "manifest.json").write_text(json.dumps(manifest))
    for name in manifest["files"]:
        if name != "index.json":
            (retained / name).write_bytes((source / name).read_bytes())
    replay_export(retained, tmp_path / "out")
    for body, raw, old, want in BAD_REPORTS:
        next(b for b in baseline["bodies"] if b["id"] == body)["reports"]["2024-25"]["published_on"] = want
    assert json.loads((tmp_path / "out/index.json").read_text()) == baseline
    emitted = json.loads((tmp_path / "out/manifest.json").read_text())
    assert emitted["files"]["index.json"]["content_sha256"] == hashlib.sha256(
        json.dumps([baseline["bodies"], baseline["headline"]], sort_keys=True).encode()).hexdigest()
    for name in manifest["files"]:
        if name != "index.json":
            assert (tmp_path / "out" / name).read_bytes() == (source / name).read_bytes()
