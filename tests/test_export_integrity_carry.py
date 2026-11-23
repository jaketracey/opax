"""A published body with no snapshot on the machine keeps its published records (the refresh box has none for NSW ICAC)."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLISHED = ROOT / "portal/public/integrity-reports"


def run_export(tmp_path, missing):
    out, snaps = tmp_path / "out", tmp_path / "snapshots"
    shutil.copytree(PUBLISHED, out)
    snaps.mkdir()
    index = json.loads((out / "index.json").read_text())
    for body in index["bodies"]:
        if body["status"] != "loaded" or body["code"] in missing:
            continue
        records = json.loads((out / body["file"].rsplit("/", 1)[-1]).read_text())["records"]
        snap = {"schema": 1, "body": body["code"], "name": body["name"], "short": body["short"],
                "jurisdiction": body["jurisdiction"], "site": body["site"], "licence": body["licence"],
                "gaps": body["gaps"], "built_at": body["snapshot_at"], "records": records}
        (snaps / f"{body['code']}.json").write_text(json.dumps(snap))
    run = subprocess.run([sys.executable, str(ROOT / "scripts/export_integrity_reports.py"), "--snapshots", str(snaps), "--out", str(out)],
                         capture_output=True, text=True, cwd=ROOT)
    return run, index, json.loads((out / "index.json").read_text()), out


def test_a_published_body_without_a_snapshot_keeps_its_records(tmp_path):
    run, before, after, out = run_export(tmp_path, {"nsw_icac", "nt_icac"})
    assert run.returncode == 0, run.stdout + run.stderr
    assert "CARRIED: nsw_icac" in run.stdout and "CARRIED: nt_icac" in run.stdout
    was = {b["code"]: b for b in before["bodies"]}
    now = {b["code"]: b for b in after["bodies"]}
    for code in ("nsw_icac", "nt_icac"):
        assert now[code]["status"] == "loaded"
        assert now[code]["counts"]["records"] == was[code]["counts"]["records"] > 0
        assert now[code]["snapshot_at"] == was[code]["snapshot_at"]
    published = json.loads((PUBLISHED / "reports-nsw-icac.json").read_text())
    assert json.loads((out / "reports-nsw-icac.json").read_text())["records"] == published["records"]
    assert (out / "transcripts-nsw-icac.json").is_file()
    assert len(after["reports"]) == len(before["reports"])
