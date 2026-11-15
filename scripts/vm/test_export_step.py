#!/usr/bin/env python3
"""Tests for export_step.sh's companion files and for who owns what the periodic exports write.

    python3 -m unittest scripts/vm/test_export_step.py -v

15 Nov 2026: the money export wrote money-receipts.json and money-industry-totals.json in place, and no
data group owned them. The portal gate could neither put them back with the money group nor commit them,
so a blame trial tested HEAD's map against the night's receipts, and a green night would have published the
map without them.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

VM = Path(__file__).resolve().parent
ROOT = VM.parents[1]
GIT_ENV = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
GIT_ENV.update(GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1", PY=sys.executable)

# a stand-in exporter: the main document on stdout, one companion per --out flag, exit status last
EXPORTER = r'''
import json, sys
n, rc, outs = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3:]
for i, out in enumerate(outs):
    if n >= 0:
        open(out, "w").write(json.dumps({"generated": "2026-09-01", "side": i, "n": n}))
if rc:
    sys.exit(rc)
print(json.dumps({"generated": "2026-09-01", "n": abs(n)}))
'''


class ExportStepCompanions(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.repo = Path(self._tmp.name) / "repo"
        (self.repo / "scripts/vm").mkdir(parents=True)
        (self.repo / "out").mkdir()
        (self.repo / "tmp").mkdir()
        for name in ("export_step.sh", "keep_if_unchanged.py"):
            (self.repo / "scripts/vm" / name).write_bytes((VM / name).read_bytes())
        (self.repo / "exporter.py").write_text(EXPORTER)
        self.files = {"out/main.json": {"generated": "2026-01-01", "n": 1},
                      "out/a.json": {"generated": "2026-01-01", "side": 0, "n": 1},
                      "out/b.json": {"generated": "2026-01-01", "side": 1, "n": 1}}
        for path, doc in self.files.items():
            (self.repo / path).write_text(json.dumps(doc))
        self.git("init", "-q")
        self.git("-c", "user.email=t@t", "-c", "user.name=t", "add", "-A")
        self.git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "base")

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.repo, env=GIT_ENV, check=True, capture_output=True, text=True).stdout

    def step(self, n, rc=0, outs=("tmp/a.json", "tmp/b.json")):
        return subprocess.run(
            ["bash", "scripts/vm/export_step.sh", "json", "out/main.json",
             "--also", "out/a.json", "tmp/a.json", "--also", "out/b.json", "tmp/b.json",
             sys.executable, "exporter.py", str(n), str(rc), *outs],
            cwd=self.repo, env=GIT_ENV, capture_output=True, text=True)

    def changed(self):
        return sorted(self.git("status", "--porcelain", "--", "out").split()[1::2])

    def test_stamp_only_rerun_touches_nothing(self):
        self.assertEqual(self.step(1).returncode, 0)
        self.assertEqual(self.changed(), [])

    def test_a_real_change_installs_every_file(self):
        self.assertEqual(self.step(2).returncode, 0)
        self.assertEqual(self.changed(), ["out/a.json", "out/b.json", "out/main.json"])
        self.assertEqual(json.loads((self.repo / "out/b.json").read_text())["n"], 2)

    def test_a_failed_export_installs_nothing(self):
        # the companions were already written when the exporter died
        self.assertEqual(self.step(2, rc=7).returncode, 7)
        self.assertEqual(self.changed(), [])

    def test_a_missing_companion_installs_nothing(self):
        proc = self.step(2, outs=("tmp/a.json",))
        self.assertEqual(proc.returncode, 2, proc.stderr)
        self.assertIn("tmp/b.json", proc.stderr)
        self.assertEqual(self.changed(), [])

    def test_a_stale_companion_from_an_earlier_run_is_not_installed(self):
        (self.repo / "tmp/b.json").write_text(json.dumps({"generated": "2025-01-01", "side": 1, "n": 99}))
        self.assertEqual(self.step(2, outs=("tmp/a.json",)).returncode, 2)
        self.assertEqual(self.changed(), [])

    def test_companions_are_not_left_in_the_scratch_directory(self):
        self.step(2)
        self.assertEqual(list((self.repo / "tmp").iterdir()), [])


def group_paths(text):
    paths = []
    for match in re.finditer(r'^\s*\[[a-z-]+\]="([^"]+)"', text, re.M):
        paths += match.group(1).split()
    paths += re.search(r"BUILD_ONLY_PATHS=\(([^)]*)\)", text).group(1).split()
    return paths


class PeriodicExportsAreOwned(unittest.TestCase):
    """Every portal file the refresh scripts name belongs to a data group, so the gate can hold or publish it."""

    def named(self, script):
        body = "\n".join(line for line in (ROOT / script).read_text().splitlines() if not line.lstrip().startswith("#"))
        return sorted({path.rstrip(".") for path in re.findall(r"portal/(?:public|src)/[A-Za-z0-9_./-]+", body)})

    def test_every_named_portal_path_has_a_group(self):
        owned = group_paths((VM / "data_groups.sh").read_text())
        covered = lambda f: any(f == p or f.startswith(p + "/") or f.startswith(p + ".") or p.startswith(f) for p in owned)
        for script in ("scripts/weekly_refresh.sh", "scripts/daily_refresh.sh"):
            named = self.named(script)
            self.assertTrue(named, script)
            self.assertEqual([f for f in named if not covered(f)], [], f"{script} names portal files no data group owns")

    def test_the_money_group_owns_the_receipts_and_industry_totals(self):
        text = (VM / "data_groups.sh").read_text()
        money = re.search(r'^\s*\[money\]="([^"]+)"', text, re.M).group(1).split()
        for path in ("portal/public/graph/money.json", "portal/public/graph/money-receipts.json",
                     "portal/public/graph/money-industry-totals.json"):
            self.assertIn(path, money)
            self.assertTrue((ROOT / path).is_file(), f"{path} must exist in HEAD to be a group path")

    def test_the_money_export_writes_its_companions_to_scratch(self):
        weekly = (ROOT / "scripts/weekly_refresh.sh").read_text()
        # a directory export (dir mode) writes its tree in place and is restored whole; a single file never is
        self.assertEqual(re.findall(r"-out\s+portal/public/\S+\.json", weekly), [],
                         "an exporter flag writes a published file in place")
        for name in ("money-receipts.json", "money-industry-totals.json"):
            self.assertIn(f'--also portal/public/graph/{name} "$TMP/{name}"', weekly)


if __name__ == "__main__":
    unittest.main()
