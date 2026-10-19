"""Build a TEST-ONLY promoter round-trip asset; never approve real staging.

The candidate stays under portal/private. The real review receipt and public
asset are untouched. This is an offline local browser fixture for review.
"""
from contextlib import redirect_stdout
import hashlib
from io import StringIO
import json
from pathlib import Path
import shutil
import tempfile

from scripts.abs_gfs.check import checked_projection
from scripts.promote_hub_data import ROOT, INPUTS, promote


def build():
    checked_projection(ROOT / "data/staged/abs-gfs", verify_originals=True)
    output = ROOT / "portal/private/abs-gfs-function/preview-data.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="opax-function-preview-") as scratch:
        root = Path(scratch)
        stage = root / "data/staged/abs-gfs"
        shutil.copytree(ROOT / "data/staged/abs-gfs", stage)
        public = root / "portal/public"
        public.mkdir(parents=True)
        shutil.copyfile(ROOT / "portal/public/votes.json", public / "votes.json")
        review = {"status": "approved", "reviewed_commit": "test-only-function-preview",
                  "review_basis": "Synthetic local test fixture; no real review or public promotion authorised.",
                  "inputs": {p: hashlib.sha256((stage / p).read_bytes()).hexdigest() for p in INPUTS["abs-gfs"]}}
        (stage / "review.json").write_text(json.dumps(review))
        with redirect_stdout(StringIO()):
            assert promote(["abs-gfs"], root, dry_run=True) == 0
            assert promote(["abs-gfs"], root) == 0
            assert promote(["abs-gfs"], root, check_public=True) == 0
        shutil.copyfile(public / "government-finance/data.json", output)
    print(json.dumps({"path": str(output), "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "test_only": True}))


if __name__ == "__main__":
    build()
