"""Hermetic runner tests: no source, real DB, KB or production files are used."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
BASH = os.environ.get("OPAX_TEST_BASH") or shutil.which("bash")
VERSION = subprocess.check_output([BASH, "--version"], text=True) if BASH else ""
BASH4 = bool(re.search(r"version (?:[4-9]|[1-9]\d)\.", VERSION))
CHAIN = "austender,austender_full,contract_suppliers,x_suppliers,grants_fetch,grants_apply,grant_recipients,x_grants"
ASSETS = ["suppliers.json", "agencies.json", "suppliers/one.json", "agencies/one.json",
          "graph/grants.federal.json", "grants/federal/one.json"]


@unittest.skipUnless(BASH4 and shutil.which("flock"), "Linux/Bash 4+ runner required")
class DailyMoneyProjections(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.repo = self.base / "repo"
        self.home = self.base / "home"
        self.home.mkdir()
        for name in ["scripts/daily_refresh.sh", "scripts/weekly_refresh.sh",
                     "scripts/lib/refresh_lib.sh", "scripts/vm/export_step.sh"]:
            dest = self.repo / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / name, dest)
        self.public = self.repo / "portal/public"
        for name in ASSETS:
            path = self.public / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('{"snapshot":"last-good"}\n')
        fake = self.repo / ".venv/bin/python"
        fake.parent.mkdir(parents=True)
        fake.write_text('''#!/usr/bin/env python3
import json,os,pathlib,sys
if len(sys.argv)>1 and sys.argv[1]=='-':
    if len(sys.argv)>2: print(0)
    sys.exit(0)
step=os.environ.get('OPAX_SOURCE_NAME','')
with open(os.environ['CALLS'],'a') as out:
    out.write(json.dumps({'step':step,'args':sys.argv[1:],'kb':os.environ.get('OPAX_SYNC_KB')})+'\\n')
if len(sys.argv)>1 and sys.argv[1]=='scripts/vm/keep_if_unchanged.py': sys.exit(0)
if step=='grants_fetch':
    path=pathlib.Path(sys.argv[sys.argv.index('--db')+1]);path.parent.mkdir(parents=True,exist_ok=True);path.write_text('staged')
assets={'x_suppliers':['suppliers.json','agencies.json','suppliers/one.json','agencies/one.json'],
        'x_grants':['graph/grants.federal.json','grants/federal/one.json']}
for name in assets.get(step,[]):
    pathlib.Path('portal/public',name).write_text('{"snapshot":"new"}\\n')
sys.exit(int(os.environ.get('FAIL_CODE','1')) if step==os.environ.get('FAIL_STEP') else 0)
''')
        fake.chmod(0o755)
        self.env = dict(os.environ, HOME=str(self.home), OPAX_REPO=str(self.repo),
                        OPAX_ONLY=CHAIN, OPAX_SYNC_KB="0", CALLS=str(self.base / "calls"),
                        GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull)
        for key in ["FAIL_STEP", "FAIL_CODE", "OPAX_ENSURE_INDEXES", "OPAX_FORCE_KB_SYNC"]:
            self.env.pop(key, None)
        for args in [["init", "-q"], ["add", "."],
                     ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test",
                      "commit", "-qm", "fixture"]]:
            subprocess.run(["git", *args], cwd=self.repo, env=self.env, check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

    def run_refresh(self, *, fail=None, code=1, only=CHAIN, weekly=False):
        env = dict(self.env, OPAX_ONLY=only, FAIL_STEP=fail or "", FAIL_CODE=str(code))
        script = "weekly_refresh.sh" if weekly else "daily_refresh.sh"
        cmd = [BASH, str(self.repo / "scripts" / script)] + (["monthly"] if weekly else [])
        result = subprocess.run(cmd, cwd=self.repo, env=env, text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
        path = self.base / "calls"
        calls = [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []
        calls = [c for c in calls if c["args"][0] != "scripts/vm/keep_if_unchanged.py"]
        self.assertNotIn("arag_sync", [c["step"] for c in calls])
        self.assertTrue(all(c["kb"] == "0" for c in calls))
        return result, [c["step"] for c in calls]

    def snapshot(self, name):
        return json.loads((self.public / name).read_text())["snapshot"]

    def test_daily_profiles_follow_both_acquisition_and_identity_registers(self):
        result, calls = self.run_refresh()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(calls, ["austender", "austender_full", "grants_fetch", "grants_apply",
                                 "contract_suppliers", "x_suppliers", "grant_recipients", "x_grants"])
        self.assertTrue(all(self.snapshot(n) == "new" for n in ASSETS))

    def test_paused_austender_keeps_supplier_assets_and_grants_continue(self):
        result, calls = self.run_refresh(fail="austender_full", code=4)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn("contract_suppliers", calls)
        self.assertNotIn("x_suppliers", calls)
        self.assertIn("x_grants", calls)
        self.assertEqual(self.snapshot("suppliers.json"), "last-good")

    def test_paused_grants_do_not_apply_rebuild_or_export(self):
        result, calls = self.run_refresh(fail="grants_fetch", code=4)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for step in ["grants_apply", "grant_recipients", "x_grants"]:
            self.assertNotIn(step, calls)
        self.assertEqual(self.snapshot("graph/grants.federal.json"), "last-good")

    def test_refused_grant_apply_keeps_profiles(self):
        result, calls = self.run_refresh(fail="grants_apply", code=3)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn("grant_recipients", calls)
        self.assertNotIn("x_grants", calls)

    def test_failed_identity_register_never_exports(self):
        for registry, export, asset in [("contract_suppliers", "x_suppliers", "suppliers.json"),
                                        ("grant_recipients", "x_grants", "graph/grants.federal.json")]:
            with self.subTest(registry=registry):
                (self.base / "calls").unlink(missing_ok=True)
                result, calls = self.run_refresh(fail=registry)
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertNotIn(export, calls)
                self.assertEqual(self.snapshot(asset), "last-good")
                # Reset the successful independent lane for the next scenario.
                subprocess.run(["git", "checkout", "--", "portal/public"], cwd=self.repo,
                               env=self.env, check=True, stdout=subprocess.DEVNULL)

    def test_debug_exclusions_are_not_successful_prerequisites(self):
        for only in ["x_suppliers,x_grants", "austender,austender_full,x_suppliers",
                     "grants_fetch,grants_apply,x_grants"]:
            with self.subTest(only=only):
                (self.base / "calls").unlink(missing_ok=True)
                result, calls = self.run_refresh(only=only)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertNotIn("x_suppliers", calls)
                self.assertNotIn("x_grants", calls)
                self.assertTrue(all(self.snapshot(n) == "last-good" for n in ASSETS))

    def test_partial_export_is_restored_by_real_export_wrapper(self):
        result, calls = self.run_refresh(fail="x_suppliers")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("x_suppliers", calls)
        self.assertEqual(self.snapshot("suppliers/one.json"), "last-good")
        self.assertEqual(self.snapshot("agencies.json"), "last-good")

    def test_standalone_monthly_catchup_rebuilds_both_registries(self):
        result, calls = self.run_refresh(weekly=True,
            only="contract_suppliers,grant_recipients,x_suppliers,x_grants")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(calls, ["grant_recipients", "contract_suppliers", "x_suppliers", "x_grants"])

    def test_monthly_export_without_registry_is_held(self):
        result, calls = self.run_refresh(weekly=True, only="x_suppliers,x_grants")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(calls, [])
        self.assertTrue(all(self.snapshot(n) == "last-good" for n in ASSETS))

    def test_monthly_failed_supplier_registry_keeps_its_assets(self):
        result, calls = self.run_refresh(weekly=True, fail="contract_suppliers",
            only="contract_suppliers,grant_recipients,x_suppliers,x_grants")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertNotIn("x_suppliers", calls)
        self.assertIn("x_grants", calls)
        self.assertEqual(self.snapshot("suppliers.json"), "last-good")

    def test_failed_legacy_austender_also_holds_supplier_profiles(self):
        result, calls = self.run_refresh(fail="austender")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertNotIn("contract_suppliers", calls)
        self.assertNotIn("x_suppliers", calls)
        self.assertEqual(self.snapshot("suppliers.json"), "last-good")


if __name__ == "__main__":
    unittest.main()
