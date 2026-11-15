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

    def test_an_unparseable_companion_installs_nothing_not_even_the_files_before_it(self):
        (self.repo / "bad.py").write_text(
            'import json, sys\nopen(sys.argv[1], "w").write(json.dumps({"n": 2}))\n'
            'open(sys.argv[2], "w").write("{not json")\nprint(json.dumps({"n": 2}))\n')
        proc = subprocess.run(
            ["bash", "scripts/vm/export_step.sh", "json", "out/main.json",
             "--also", "out/a.json", "tmp/a.json", "--also", "out/b.json", "tmp/b.json",
             sys.executable, "bad.py", "tmp/a.json", "tmp/b.json"],
            cwd=self.repo, env=GIT_ENV, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 2, proc.stderr)
        self.assertIn("out/b.json is not valid JSON", proc.stderr)
        self.assertEqual(self.changed(), [])

    def test_an_empty_main_document_installs_no_companion(self):
        (self.repo / "quiet.py").write_text(
            'import json, sys\nfor out in sys.argv[1:]:\n    open(out, "w").write(json.dumps({"n": 2}))\n')
        proc = subprocess.run(
            ["bash", "scripts/vm/export_step.sh", "json", "out/main.json",
             "--also", "out/a.json", "tmp/a.json", "--also", "out/b.json", "tmp/b.json",
             sys.executable, "quiet.py", "tmp/a.json", "tmp/b.json"],
            cwd=self.repo, env=GIT_ENV, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 2, proc.stderr)
        self.assertIn("wrote nothing for out/main.json", proc.stderr)
        self.assertEqual(self.changed(), [])

    def test_a_scratch_path_that_is_a_published_file_is_refused_before_anything_is_removed(self):
        before = (self.repo / "out/a.json").read_bytes()
        for also in (["--also", "out/a.json", "out/a.json"],                 # its own DEST
                     ["--also", "out/a.json", "./out/a.json"],               # the same file by another spelling
                     ["--also", "out/a.json", "out/main.json"],              # the main DEST
                     ["--also", "out/a.json", "out/b.json", "--also", "out/b.json", "tmp/b.json"],   # another DEST
                     ["--also", "out/a.json", "tmp/x.json", "--also", "out/b.json", "tmp/x.json"]):  # named twice
            proc = subprocess.run(
                ["bash", "scripts/vm/export_step.sh", "json", "out/main.json", *also,
                 sys.executable, "exporter.py", "2", "0", "tmp/a.json", "tmp/b.json"],
                cwd=self.repo, env=GIT_ENV, capture_output=True, text=True)
            self.assertEqual(proc.returncode, 64, (also, proc.stderr))
            self.assertEqual(self.changed(), [], also)
            self.assertEqual((self.repo / "out/a.json").read_bytes(), before)

    def test_one_scratch_file_under_two_spellings_is_refused(self):
        # review repro: tmp/x.json and ./tmp/x.json both received the second file's content, exit 0
        proc = subprocess.run(
            ["bash", "scripts/vm/export_step.sh", "json", "out/main.json",
             "--also", "out/a.json", "tmp/x.json", "--also", "out/b.json", "./tmp/x.json",
             sys.executable, "exporter.py", "2", "0", "tmp/x.json", "./tmp/x.json"],
            cwd=self.repo, env=GIT_ENV, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 64, proc.stderr)
        self.assertIn("are the same file", proc.stderr)
        self.assertEqual(self.changed(), [])

    def test_a_scratch_path_that_is_a_new_published_file_is_refused(self):
        # review repro: DEST did not exist yet, so -ef was false; the file was installed, then removed on exit
        for scratch in ("./out/new.json", "out/../out/new.json"):
            proc = subprocess.run(
                ["bash", "scripts/vm/export_step.sh", "json", "out/main.json",
                 "--also", "out/new.json", scratch, "--also", "out/b.json", "tmp/b.json",
                 sys.executable, "exporter.py", "2", "0", scratch, "tmp/b.json"],
                cwd=self.repo, env=GIT_ENV, capture_output=True, text=True)
            self.assertEqual(proc.returncode, 64, (scratch, proc.stderr))
            self.assertIn("is the published file out/new.json", proc.stderr)
            self.assertEqual(self.changed(), [], scratch)
            self.assertFalse((self.repo / "out/new.json").exists())

    def test_a_new_companion_file_is_installed_and_stays(self):
        proc = subprocess.run(
            ["bash", "scripts/vm/export_step.sh", "json", "out/main.json",
             "--also", "out/new.json", "tmp/new.json", "--also", "out/b.json", "tmp/b.json",
             sys.executable, "exporter.py", "2", "0", "tmp/new.json", "tmp/b.json"],
            cwd=self.repo, env=GIT_ENV, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(json.loads((self.repo / "out/new.json").read_text())["n"], 2)

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

    @staticmethod
    def named_in(body):
        """The portal paths a script names, as fnmatch patterns: a shell variable inside a path ($j, ${j}) becomes
        `*`, so `money.$j.json` is checked whole instead of being cut at the `$`."""
        body = "\n".join(line for line in body.splitlines() if not line.lstrip().startswith("#"))
        found = re.findall(r"portal/(?:public|src)/(?:[A-Za-z0-9_./-]|\$\{?[A-Za-z_][A-Za-z0-9_]*\}?)+", body)
        return sorted({re.sub(r"\$\{?[A-Za-z_][A-Za-z0-9_]*\}?", "*", path).rstrip(".") for path in found})

    def named(self, script):
        return self.named_in((ROOT / script).read_text())

    @staticmethod
    def covered(pattern, owned):
        """A named path is owned when it is a group path or lies under one; a pattern with a variable is owned
        when a group path matches it whole."""
        if "*" in pattern:
            # The variable may stand for part of one file name only, after a literal start (money.$j.json): a
            # variable that is a whole path segment, or the whole stem of a name ($name.json), could expand to
            # anything, so it proves nothing and the path has to be named in full.
            if any("*" in part and not re.match(r"[A-Za-z0-9_-]", part) for part in pattern.split("/")):
                return False
            whole = re.compile("".join(r"[A-Za-z0-9_-]+" if piece == "*" else re.escape(piece)
                                       for piece in re.split(r"(\*)", pattern)))
            return any(whole.fullmatch(p) for p in owned)
        if pattern.endswith(".tmp"):   # the scratch copy a step writes beside an owned file and then moves over it
            pattern = pattern[:-len(".tmp")]
        return any(pattern == p or pattern.startswith(p + "/") for p in owned)

    def test_a_path_cut_at_a_variable_is_not_mistaken_for_an_owned_prefix(self):
        owned = ["portal/public/graph/money.json", "portal/public/graph/money.qld.json", "portal/public/interests"]
        self.assertEqual(self.named_in('x "portal/public/graph/money.$j.json" y'), ["portal/public/graph/money.*.json"])
        self.assertEqual(self.named_in("x portal/public/graph/money.${j}.json"), ["portal/public/graph/money.*.json"])
        self.assertTrue(self.covered("portal/public/graph/money.*.json", owned))
        self.assertFalse(self.covered("portal/public/graph/mon", owned), "a bare prefix of an owned path")
        self.assertFalse(self.covered("portal/public/graph/money.*.csv", owned))
        # a variable that could expand to anything proves nothing, even though some owned path matches it
        self.assertEqual(self.named_in("x portal/public/$f y"), ["portal/public/*"])
        self.assertFalse(self.covered("portal/public/*", owned))
        self.assertFalse(self.covered("portal/public/graph/*.json", owned))
        self.assertFalse(self.covered("portal/public/*/money.json", owned))
        self.assertFalse(self.covered("portal/public/graph/money*json", owned))
        self.assertFalse(self.covered("portal/public/graph/money-receipts.json", owned))
        self.assertTrue(self.covered("portal/public/interests/index.json", owned))
        self.assertFalse(self.covered("portal/public/interests-old", owned))
        self.assertTrue(self.covered("portal/public/graph/money.json.tmp", owned))
        self.assertFalse(self.covered("portal/public/graph/other.json.tmp", owned))

    def test_every_named_portal_path_has_a_group(self):
        owned = group_paths((VM / "data_groups.sh").read_text())
        covered = lambda f: self.covered(f, owned)
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

    def test_the_firsts_group_owns_the_firsts_file_and_the_weekly_export_writes_only_it(self):
        text = (VM / "data_groups.sh").read_text()
        path = "portal/public/people/firsts.json"
        self.assertEqual(re.search(r'^\s*\[firsts\]="([^"]+)"', text, re.M).group(1).split(), [path])
        # no other group claims it, or the directory it is in
        claimed = [g for g, paths in re.findall(r'^\s*\[([a-z-]+)\]="([^"]+)"', text, re.M)
                   if any(p == path or path.startswith(p + "/") for p in paths.split())]
        self.assertEqual(claimed, ["firsts"])
        groups = re.search(r"^DATA_GROUPS=\(([^)]+)\)", text, re.M).group(1).split()
        # validated after the roster it is keyed to
        self.assertEqual(groups.index("firsts"), groups.index("people") + 1)
        # the nightly publishes only paths HEAD already has (tracked_data_paths): the seed makes the first export publishable
        self.assertTrue((ROOT / path).is_file(), f"{path} must exist in HEAD to be a group path")
        weekly = (ROOT / "scripts/weekly_refresh.sh").read_text()
        step = f'run_step x_firsts "" "$EXPORT" json {path} \\\n      "$PY" scripts/export_people_firsts.py --speech-facts'
        self.assertIn(step, weekly)
        self.assertLess(weekly.index("run_step x_people "), weekly.index(step), "the export reads the roster x_people left")
        self.assertIn(path, self.named("scripts/weekly_refresh.sh"))

    def test_the_money_export_writes_its_companions_to_scratch(self):
        weekly = (ROOT / "scripts/weekly_refresh.sh").read_text()
        # a directory export (dir mode) writes its tree in place and is restored whole; a single file never is
        self.assertEqual(re.findall(r"-out\s+portal/public/\S+\.json", weekly), [],
                         "an exporter flag writes a published file in place")
        for name in ("money-receipts.json", "money-industry-totals.json"):
            self.assertIn(f'--also portal/public/graph/{name} "$TMP/{name}"', weekly)


if __name__ == "__main__":
    unittest.main()
