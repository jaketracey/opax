"""The nightly held-sources steps (scripts/vm/bills_held_sources.sh) on a fixture git repo.

No production DB, network, FRL, APH or KB is used: the overlay and the FRL request
are stubs that record their operation names. Failures never print command lines.
"""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
NIGHTLY = (ROOT / "scripts/vm/nightly.sh").read_text()

OVERLAY_STUB = r'''
import json, os, sys
from pathlib import Path
mode = os.environ.get("HELD_TEST_MODE", "ok")
with open(os.environ["HELD_TEST_CALLS"], "a") as log:
    log.write("overlay\n")
args = sys.argv[1:]
assert os.environ["OPAX_DB"] == str(Path.home() / ".cache/autoresearch/parli.db")
assert args[args.index("--today") + 1] == "2026-11-17"
assert args[args.index("--oa-stage") + 1].endswith(".cache/autoresearch/oa-feed")
summary, review = Path(args[args.index("--summary-out") + 1]), Path(args[args.index("--review-out") + 1])
out = Path("portal/public/bills")
doc = json.loads((out / "au-federal-t1.json").read_text())
if mode == "regress":
    doc["key_dates"].pop()
else:
    doc["key_dates"].append({"stage": "royal_assent", "date": "2026-11-12", "house": None,
                             "url": "https://www.legislation.gov.au/C2026A00101", "source": "frl", "retrieved": "2026-11-17"})
    doc["status"], doc["status_as_of"] = "passed", "2026-11-12"
(out / "au-federal-t1.json").write_text(json.dumps(doc, indent=1) + "\n")
if mode == "fail":
    sys.exit(1)
index = json.loads((out / "index.json").read_text())
index["bills"][0].update(status=doc["status"], status_as_of=doc["status_as_of"])
index["progress_as_at"] = "2026-11-12"
(out / "index.json").write_text(json.dumps(index, indent=1) + "\n")
summary.write_text(json.dumps({"run_date": "2026-11-17", "assents_added": [{"act_id": "C2026A00101"}]}) + "\n")
review.write_text(json.dumps({"entries": []}) + "\n")
'''

FRL_STUB = r'''
import json, os, sys
from pathlib import Path
with open(os.environ["HELD_TEST_CALLS"], "a") as log:
    log.write("frl\n")
assert sys.argv[1:] == ["--db", str(Path.home() / ".cache/autoresearch/parli.db"), "frl-acts-recent"]
assert os.environ["OPAX_SOURCE_NAME"] == "frl_acts_recent"
rc = int(os.environ.get("HELD_TEST_FRL_RC", "0"))
if rc == 4:
    path = Path(os.environ["OPAX_SOURCE_STATUS_FILE"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"frl_acts_recent": {"status": "paused", "reason": "HTTP 403"}}))
sys.exit(rc)
'''

HARNESS = r'''
set -uo pipefail
PY="$HELD_TEST_PYTHON"
PIPE="$HOME/.cache/autoresearch/pipeline"
mkdir -p "$PIPE"
TODAY=2026-11-17
FAILURES=()
WARNINGS=()
log() { printf '%s\n' "$*"; }
run() { "$@"; }
fail() { FAILURES+=("$*"); log "FAIL: $*"; }
warn() { WARNINGS+=("$*"); log "WARN: $*"; }
revert() {
  BILLS_REFRESH_OK=0
  git checkout -q HEAD -- "$@"
  git clean -fdq -- "$@"
}
. scripts/vm/bills_refresh.sh
. scripts/vm/bills_held_sources.sh
bills_frl_recent
bills_held_sources
echo "held rc=$? failures=${#FAILURES[@]} warnings=${#WARNINGS[@]}"
'''


class HeldSourcesStepTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.repo = Path(tmp.name) / "repo"
        self.repo.mkdir()
        self.env = {k: v for k, v in os.environ.items() if not k.startswith(("GIT_", "OPAX_", "HELD_TEST_"))}
        self.env.update(HOME=str(Path(tmp.name) / "home"), HELD_TEST_PYTHON=sys.executable,
                        HELD_TEST_CALLS=str(Path(tmp.name) / "calls.txt"), GIT_CONFIG_GLOBAL=os.devnull,
                        GIT_CONFIG_NOSYSTEM="1", GIT_AUTHOR_NAME="test", GIT_COMMITTER_NAME="test",
                        GIT_AUTHOR_EMAIL="test@example.test", GIT_COMMITTER_EMAIL="test@example.test")
        Path(self.env["HOME"]).mkdir()
        for name in ("scripts/hubs/sitting-2026.json", "scripts/vm/bills_refresh.sh", "scripts/vm/bills_held_sources.sh",
                     "scripts/vm/bills_guard.py", "scripts/vm/keep_if_unchanged.py", "scripts/bills_registry/bills_stages.py"):
            dest = self.repo / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, dest)
        for name, body in (("scripts/bills_held_sources.py", OVERLAY_STUB), ("parli/ingest/words_parlinfo.py", FRL_STUB),
                           ("parli/__init__.py", ""), ("parli/ingest/__init__.py", "")):
            dest = self.repo / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(body)
        self.bills = self.repo / "portal/public/bills"
        self.bills.mkdir(parents=True)
        for n in (1, 2):
            doc = {"key": f"au-federal-t{n}", "status": "before_parliament", "status_as_of": "2026-09-17",
                   "key_dates": [{"stage": "introduced", "date": "2026-09-17", "house": "senate", "url": None}],
                   "divisions": [], "speeches": [], "acts": []}
            (self.bills / f"au-federal-t{n}.json").write_text(json.dumps(doc, indent=1) + "\n")
        (self.bills / "index.json").write_text(json.dumps({"generated_at": "2026-10-04T16:27:54+00:00", "count": 2,
            "bills": [{"key": f"au-federal-t{n}", "status": "before_parliament", "status_as_of": "2026-09-17"} for n in (1, 2)]},
            indent=1) + "\n")
        self.git("init", "-q")
        self.git("add", ".")
        self.git("commit", "-qm", "fixture")

    def git(self, *args):
        result = subprocess.run(["git", *args], cwd=self.repo, env=self.env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, "fixture git operation failed")
        return result.stdout

    @property
    def pipe(self):
        return Path(self.env["HOME"]) / ".cache/autoresearch/pipeline"

    def run_steps(self, **overrides):
        env = {**self.env, **overrides}
        result = subprocess.run(["bash", "-c", HARNESS], cwd=self.repo, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        return result.stdout + result.stderr

    def calls(self):
        path = Path(self.env["HELD_TEST_CALLS"])
        return path.read_text().splitlines() if path.exists() else []

    def test_overlay_publishes_forward_progress_under_the_guard(self):
        output = self.run_steps()
        self.assertIn("held rc=0 failures=0 warnings=0", output)
        self.assertEqual(self.calls(), ["frl", "overlay"])
        doc = json.loads((self.bills / "au-federal-t1.json").read_text())
        self.assertEqual(doc["key_dates"][-1]["source"], "frl")
        self.assertEqual(self.git("diff", "--name-only").split(), ["portal/public/bills/au-federal-t1.json", "portal/public/bills/index.json"])
        self.assertEqual(json.loads((self.pipe / "bills-held-sources.json").read_text())["run_date"], "2026-11-17")

    def test_a_failed_or_refused_overlay_leaves_the_bills_at_head(self):
        for mode, reason in (("fail", "held-sources overlay failed"), ("regress", "bill guard refused the held-sources overlay")):
            with self.subTest(mode=mode):
                output = self.run_steps(HELD_TEST_MODE=mode)
                self.assertIn("held rc=1 failures=1", output)
                self.assertIn(f"FAIL: bills {reason}" if mode == "fail" else f"FAIL: {reason}", output)
                self.assertIn("reverted to HEAD", output)
                self.assertEqual(self.git("status", "--porcelain", "--", "portal/public/bills"), "")
                self.assertFalse((self.pipe / "bills-held-sources.json").exists())

    def test_frl_request_skips_the_night_on_any_failure_and_keeps_a_pause_receipt(self):
        receipt = self.pipe / "source-access/frl-acts-recent.json"
        for rc, words in (("3", "held tonight"), ("4", "PAUSED"), ("1", "request failed (rc=1)")):
            with self.subTest(rc=rc):
                output = self.run_steps(HELD_TEST_FRL_RC=rc)
                self.assertIn(f"WARN: FRL recent Acts {words}", output)
                self.assertIn("held rc=0 failures=0", output)  # the overlay still runs on the stored rows
        self.assertTrue(receipt.exists())
        self.run_steps(HELD_TEST_FRL_RC="0")
        self.assertFalse(receipt.exists())  # a later answered request clears the pause

    def test_publish_only_runs_neither_step(self):
        output = self.run_steps(OPAX_NIGHTLY_SKIP_REFRESH="1")
        self.assertEqual(self.calls(), [])
        self.assertIn("FRL recent Acts skipped", output)
        self.assertIn("bills held sources skipped", output)

    def test_nightly_order_and_status_field(self):
        frl, refresh = NIGHTLY.index("\nbills_frl_recent\n"), NIGHTLY.index("# ---- 2. the refresh")
        fill, held = NIGHTLY.index("\nbills_fill_and_verify\n"), NIGHTLY.index("\nbills_held_sources\n")
        pages = NIGHTLY.index('run "$PY" scripts/export_division_pages.py')
        self.assertLess(frl, refresh)
        self.assertLess(fill, held)
        self.assertLess(held, pages)
        self.assertRegex(NIGHTLY, re.compile(r"bills-held-sources\.json.*\n.*run_date.*!= day", re.M))
        self.assertIn('"bills_held_sources": held_sources', NIGHTLY)


if __name__ == "__main__":
    unittest.main()
