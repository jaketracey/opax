#!/usr/bin/env python3
"""Offline Git fixtures execute the FRL weekly guard and nightly staging blocks.

No refresh command, network request or production database is invoked. The test
uses a small mapfile shim on macOS Bash 3; the production VM uses Bash 4+.
"""
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
WEEKLY = (ROOT / "scripts/weekly_refresh.sh").read_text()
GROUPS = (ROOT / "scripts/vm/data_groups.sh").read_text()
NIGHTLY = (ROOT / "scripts/vm/nightly.sh").read_text()
WEEKLY_BLOCK = WEEKLY.split("  # Metadata-only FRL group.", 1)[1].split(
    "  # Federal Register of Legislation Acts", 1)[0]
# Retain the exact production control flow; only its log and runner are stubbed.
WEEKLY_BLOCK = "  # Metadata-only FRL group." + WEEKLY_BLOCK
TRACKED_HELPER = re.search(r"^tracked_data_paths\(\) \{\n.*?^\}", GROUPS, re.M | re.S).group()
COMMIT_BLOCK = NIGHTLY.split("# ---- 6. commit", 1)[1].split('others=""', 1)[0]
COMMIT_BLOCK = "# ---- 6. commit" + COMMIT_BLOCK
OWNED = [re.search(r'\[' + group + r'\]="([^"]+)"', GROUPS).group(1)
         for group in ("bills", "instruments")]
ENV = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
ENV.update(GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1")


class RefreshTests(unittest.TestCase):
    def setUp(self):
        state = ROOT / "scripts/state/frl"
        state.mkdir(parents=True, exist_ok=True)
        tmp = tempfile.TemporaryDirectory(dir=state)
        self.addCleanup(tmp.cleanup)
        self.repo = Path(tmp.name)
        self.git("init", "-q")
        self.write("CODE.md", "original\n")
        self.git("add", "--", "CODE.md")
        self.git("commit", "-q", "-m", "fixture seed")

    def git(self, *args):
        result = subprocess.run(
            ["git", "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid",
             "-c", "commit.gpgsign=false", *args], cwd=self.repo, env=ENV,
            text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def write(self, path, text="{}\n"):
        dest = self.repo / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(text)
        return dest

    def publish_fixture(self):
        self.write(OWNED[1] + "/manifest.json")
        self.write(OWNED[1] + "/catalogue-old.json")
        self.git("add", "--", OWNED[1])
        self.git("commit", "-q", "-m", "fixture catalogue bootstrap")

    def shell(self, source):
        result = subprocess.run(["/bin/bash"], input=source, cwd=self.repo, env=ENV,
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def weekly(self, held=False):
        stubs = '''
set -eu
PY=unused
EXPORT=unused
log() { echo "$1"; }
run_step() {
  echo "STEP $1"
  if [ "$1" = frl_instruments ] && [ "$HELD" = 1 ]; then return 3; fi
  return 0
}
'''
        return self.shell(stubs + f"HELD={int(held)}\n" + WEEKLY_BLOCK)

    def staging(self):
        paths = "\n".join(OWNED)
        stubs = '''
set -eu
fail() { echo "$1" >&2; }
finish() { exit 1; }
# An old allowlist must be refreshed from HEAD before commit.
DATA_PATHS=(portal/public/bills)
# Portable substitute for the VM's Bash 4+ mapfile; no eval is needed.
mapfile() {
  [ "$1" = -t ] && [ "$2" = DATA_PATHS ] || return 1
  DATA_PATHS=()
  local p
  while IFS= read -r p; do DATA_PATHS+=("$p"); done
}
'''
        all_paths = "all_data_paths() { cat <<'PATHS'\n" + paths + "\nPATHS\n}\n"
        self.shell(stubs + all_paths + TRACKED_HELPER + "\n" + COMMIT_BLOCK)

    def test_weekly_absent_and_untracked_catalogue_skip_both_steps(self):
        for untracked in (False, True):
            if untracked:
                self.write(OWNED[1] + "/manifest.json")
            trace = self.weekly()
            self.assertIn("SKIP: catalogue not yet tracked on main", trace)
            self.assertNotIn("STEP ", trace)

    def test_weekly_tracked_catalogue_runs_acquisition_then_export(self):
        self.publish_fixture()
        self.assertEqual(self.weekly().splitlines(), ["STEP frl_instruments", "STEP x_instruments"])

    def test_weekly_held_acquisition_preserves_export(self):
        self.publish_fixture()
        trace = self.weekly(held=True)
        self.assertIn("STEP frl_instruments", trace)
        self.assertIn("SKIP: FRL acquisition held", trace)
        self.assertNotIn("STEP x_instruments", trace)

    def test_commit_refreshes_allowlist_and_stages_new_and_deleted_chunks(self):
        self.publish_fixture()
        self.write(OWNED[1] + "/manifest.json", '{"count":2}\n')
        self.write(OWNED[1] + "/ready.json")
        self.write(OWNED[1] + "/catalogue-new.json")
        (self.repo / OWNED[1] / "catalogue-old.json").unlink()
        self.write("CODE.md", "unowned edit\n")
        self.write("unowned.json")
        self.staging()
        staged = set(self.git("diff", "--cached", "--name-status", "--no-renames").splitlines())
        self.assertEqual(staged, {
            "M\t" + OWNED[1] + "/manifest.json", "A\t" + OWNED[1] + "/ready.json",
            "A\t" + OWNED[1] + "/catalogue-new.json", "D\t" + OWNED[1] + "/catalogue-old.json"})

    def test_commit_with_no_tracked_groups_stages_nothing(self):
        self.write(OWNED[1] + "/manifest.json")
        self.write("CODE.md", "unowned edit\n")
        self.staging()
        self.assertEqual(self.git("diff", "--cached", "--name-only"), "")


if __name__ == "__main__":
    unittest.main()
