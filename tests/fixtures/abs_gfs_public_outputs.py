"""Test-only reviewed promotion with identifiable internal diagnostic probes.

Real sums can equal published values. Rounding controls distinguish their
provenance; unique probes detect accidental export of diagnostic records.
"""
from contextlib import redirect_stdout
from io import StringIO
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from openpyxl import load_workbook
from scripts.abs_gfs import functions
from scripts.abs_gfs.check import checked_projection
from scripts.promote_hub_data import INPUTS, promote


def fixture(verify_originals=False):
    stage = ROOT / "data/staged/abs-gfs"
    hub, _ = checked_projection(stage, verify_originals=verify_originals)
    originals = [*hub["rows"], *hub["function_rows"]]
    locator = lambda r: tuple(r[k] for k in ("workbook", "sheet", "cell", "sha256"))
    cells = {locator(r): r for r in originals}
    probes = {"function_divisions_to_published_total": 987654321012301,
              "education_purposes_to_published_total": 987654321012302,
              "function_groups_to_published_division": 987654321012303}
    original_reconcile = functions.reconcile
    controls = {}

    def diagnostics(rows, headlines):
        checks = original_reconcile(rows, headlines)
        for check in checks:
            identity = check["identity"].split(":")[0]
            if identity not in probes:
                continue
            components = [cells[locator(s)]["value"] for s in check["sources"][:-1]]
            computed = sum(components)
            check["internal_computed_sum_million"] = computed
            check["internal_probe"] = probes[identity]
            if check["delta_million"] and identity not in controls:
                total = cells[locator(check["sources"][-1])]
                controls[identity] = {"published": total, "computed_sum_million": computed}
        return checks

    # Add metadata only to isolated diagnostics; validation still recomputes and
    # compares every check. No real staging, receipt or public asset is changed.
    with tempfile.TemporaryDirectory(prefix="opax-gfs-public-test-") as scratch:
        root = Path(scratch)
        target_stage = root / "data/staged/abs-gfs"
        shutil.copytree(stage, target_stage)
        public = root / "portal/public"
        public.mkdir(parents=True)
        shutil.copyfile(ROOT / "portal/public/votes.json", public / "votes.json")
        with patch.object(functions, "reconcile", side_effect=diagnostics):
            checks = diagnostics(hub["function_rows"], hub["rows"])
            (target_stage / "function-reconciliation.json").write_text(json.dumps(checks))
            review = {"status": "approved", "reviewed_commit": "synthetic-diagnostic-containment-test",
                      "inputs": {p: hashlib.sha256((target_stage / p).read_bytes()).hexdigest() for p in INPUTS["abs-gfs"]}}
            (target_stage / "review.json").write_text(json.dumps(review))
            with redirect_stdout(StringIO()):
                assert promote(["abs-gfs"], root, dry_run=True) == 0
                assert promote(["abs-gfs"], root) == 0
                assert promote(["abs-gfs"], root, check_public=True) == 0
        asset = json.loads((public / "government-finance/data.json").read_text())
    assert asset["rows"] == hub["rows"] and asset["function_rows"] == hub["function_rows"]
    assert set(controls) == set(probes)
    assert all(c["computed_sum_million"] != c["published"]["value"] for c in controls.values())
    assert all(str(probe) not in json.dumps(asset) for probe in probes.values())
    # Independently trace every exported monetary observation to the retained
    # workbook bytes, including all totals and education purpose observations.
    inventory = json.loads((stage / "inventory.json").read_text())
    for document in inventory["workbooks"] if verify_originals else []:
        rows = [r for r in [*asset["rows"], *asset["function_rows"]] if r["workbook"] == document["id"] + ".xlsx"]
        if not rows:
            continue
        path = ROOT / document["original_path"]
        assert hashlib.sha256(path.read_bytes()).hexdigest() == document["receipt"]["sha256"]
        workbook = load_workbook(path, data_only=True)
        for row in rows:
            assert row["sha256"] == document["receipt"]["sha256"]
            assert workbook[row["sheet"]][row["cell"]].value == (row["source_marker"] if row["value"] is None else row["value"])
        workbook.close()
    return {"asset": asset, "rounding_controls": controls, "probes": list(probes.values()),
            "source_observations_traced": len(originals), "original_cells_verified": len(originals) if verify_originals else 0}


if __name__ == "__main__":
    # Normal CI checks the committed source-cell contract. The explicit local
    # release gate also verifies retained XLSX bytes, which are not in Git.
    print(json.dumps(fixture(verify_originals="--verify-originals" in sys.argv), separators=(",", ":"), ensure_ascii=False))
