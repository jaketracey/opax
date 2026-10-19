"""Real offline evidence builders and frozen-source publication, using tiny fixtures."""
import hashlib
from contextlib import closing
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("bundle_builder", Path(__file__).with_name("build_evidence_bundle.py"))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def fixture(path):
    with closing(sqlite3.connect(path)) as db:
        db.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE speeches(speech_id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL,
          text_clean TEXT, date TEXT, speaker_name_clean TEXT, electorate TEXT, state TEXT,
          chamber TEXT, person_id TEXT, raw_extra BLOB);
        CREATE TABLE ext_press_releases(source TEXT,source_id TEXT,body_text TEXT,url TEXT,date TEXT,
          body_html TEXT, PRIMARY KEY(source,source_id));
        CREATE TABLE government_grants(grant_id INTEGER PRIMARY KEY AUTOINCREMENT,recipient TEXT,
          amount REAL,program TEXT,agency TEXT,suburb TEXT,postcode TEXT,state TEXT,source TEXT,
          source_url TEXT,start_date TEXT,raw_extra BLOB);
        CREATE TABLE postcode_electorates(postcode TEXT,electorate_name TEXT,state TEXT,ratio REAL,
          PRIMARY KEY(postcode,electorate_name));
        CREATE TABLE ext_contract_suppliers(supplier_id TEXT,canonical_name TEXT,abn TEXT,abr_name TEXT,
          kind TEXT,aliases TEXT,abr_postcode TEXT,abr_state TEXT);
        CREATE TABLE ext_donor_entities(entity_id TEXT,canonical_name TEXT,abn TEXT,abr_name TEXT,kind TEXT,aliases TEXT);
        CREATE TABLE ext_grant_recipients(recipient_id TEXT,canonical_name TEXT,abn TEXT,abr_name TEXT,
          kind TEXT,aliases TEXT,abr_postcode TEXT,abr_state TEXT);
        CREATE TABLE ext_donor_aliases(alias_raw TEXT,entity_id TEXT);
        CREATE TABLE ext_grant_details(ga_id TEXT,program TEXT,recipient_postcode TEXT,recipient_state TEXT,
          delivery_postcode TEXT,delivery_state TEXT);
        CREATE TABLE unrelated(value TEXT);
        CREATE INDEX unrelated_speech_index ON speeches(date);
        CREATE TRIGGER irrelevant AFTER INSERT ON unrelated BEGIN SELECT 1; END;
        INSERT INTO speeches VALUES(17,'Raw Example Agency statement.',
          'Example Agency supports Local Recovery Program in the electorate of Eden.',
          '2026-10-19','Test Member','Eden','federal','representatives','person-1',x'00ff');
        INSERT INTO ext_press_releases(rowid,source,source_id,body_text,url,date,body_html)
          VALUES(43,'nsw','release-1','Example Agency announced Local Recovery Program.',
          'https://example.test/release','2026-10-19','<p>Original HTML</p>');
        INSERT INTO government_grants VALUES(81,'Example Agency',123.45,'Local Recovery Program',
          'Example Agency','Sydney','2000','nsw','fixture','https://example.test/grant','2026-10-19',x'0100');
        INSERT INTO postcode_electorates(rowid,postcode,electorate_name,state,ratio)
          VALUES(73,'2000','Eden','nsw',0.75);
        INSERT INTO ext_contract_suppliers VALUES('supplier-1','Example Agency','51824753556',
          'Example Agency','organisation','[]','2000','nsw');
        INSERT INTO ext_grant_details VALUES('ga-1','Local Recovery Program','2000','nsw','2000','nsw');
        """)
        db.commit()


class BundleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root / "live.sqlite"
        fixture(self.source)
        self.before = self.source.read_bytes()
        self.repo = self.root / "repo"
        self.repo.mkdir()
        (self.repo / "scripts").symlink_to(ROOT / "scripts", target_is_directory=True)
        self.destination = self.root / "bundles/reviewed-v1"
        # Build the known-good fixture baseline outside the implementation.
        baseline = self.root / "baseline"
        baseline.mkdir()
        files = {key: baseline / name for key, name in builder.FILENAMES.items()}
        files["source"] = self.source
        commands = [
            ("build_evidence_layers.py", ["--source", self.source, "--output", files["evidence"]]),
            ("build_place_evidence.py", ["--source", self.source, "--output", files["places"]]),
            ("review_evidence_identities.py", ["--evidence", files["evidence"], "--output", files["decisions"]]),
            ("build_additional_mentions.py", ["--source", self.source, "--base", files["evidence"],
             "--places", files["places"], "--decisions", files["decisions"], "--output", files["additional"]]),
        ]
        for script, args in commands:
            subprocess.run([sys.executable, str(ROOT / "scripts" / script), *map(str, args)], check=True, capture_output=True)
        output = self.repo / "portal/public/evidence"
        args = [item for key, value in files.items() for item in ("--" + key, str(value))]
        subprocess.run([sys.executable, str(ROOT / "scripts/export_evidence_layers.py"), *args,
                        "--output", str(output)], check=True, capture_output=True)
        for args in (["init", "-q"], ["add", "portal"],
                     ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "baseline"]):
            subprocess.run(["git", "-C", str(self.repo), *args], check=True, capture_output=True)

    def build(self):
        return builder.build(self.source, self.destination, self.repo, timeout_seconds=60)

    def test_real_build_freezes_exact_rows_and_audits_frozen_source(self):
        original_stage = builder.run_stage
        captured = []
        def observe(name, argv, *rest):
            captured.append((name, argv))
            return original_stage(name, argv, *rest)
        with patch.object(builder, "run_stage", observe):
            result = self.build()
        self.assertTrue(result["verified"])
        bundle = Path(result["bundle_dir"])
        self.assertEqual(self.source.read_bytes(), self.before)
        with closing(sqlite3.connect(self.source)) as live, closing(sqlite3.connect(result["source"])) as frozen:
            for table in builder.SOURCE_TABLES:
                self.assertEqual(live.execute(f"PRAGMA table_info({table})").fetchall(),
                                 frozen.execute(f"PRAGMA table_info({table})").fetchall())
                self.assertEqual(live.execute(f"SELECT rowid,* FROM {table} ORDER BY rowid").fetchall(),
                                 frozen.execute(f"SELECT rowid,* FROM {table} ORDER BY rowid").fetchall())
            self.assertIsNone(frozen.execute("SELECT name FROM sqlite_master WHERE name='unrelated_speech_index'").fetchone())
            self.assertIsNone(frozen.execute("SELECT name FROM sqlite_master WHERE type='trigger'").fetchone())
            self.assertIsNone(frozen.execute("SELECT name FROM sqlite_master WHERE name='ext_contract_suppliers'").fetchone())
        for name, argv in captured:
            if name in ("export", "audit"):
                self.assertEqual(argv[argv.index("--source") + 1], result["source"])
        receipt = json.loads(Path(result["receipt"]).read_text())
        self.assertEqual(receipt["source_before"], receipt["source_after"])
        for key, info in receipt["databases"].items():
            self.assertEqual(hashlib.sha256(Path(result[key]).read_bytes()).hexdigest(), info["sha256"])
        ready = json.loads((bundle / "READY.json").read_text())
        self.assertEqual((ready["schema"], ready["managed_by"]), (1, "opax-evidence-bundle-v1"))
        self.assertEqual(ready["receipt_sha256"], hashlib.sha256(Path(result["receipt"]).read_bytes()).hexdigest())
        self.assertFalse(any(bundle.glob("*.sqlite-wal")))

    def test_source_freeze_refuses_competing_writer_and_own_writes(self):
        with builder.freeze_source(self.source, .01) as held:
            with closing(sqlite3.connect(self.source, timeout=.01)) as competing:
                with self.assertRaisesRegex(sqlite3.OperationalError, "locked"):
                    competing.execute("UPDATE speeches SET text='changed'")
            with self.assertRaises(sqlite3.OperationalError):
                held.execute("UPDATE speeches SET text='changed'")
        self.assertEqual(self.source.read_bytes(), self.before)
        with closing(sqlite3.connect(self.source)) as db:
            db.execute("BEGIN IMMEDIATE")  # freeze was released
            db.rollback()

    def test_existing_source_wal_is_refused_without_checkpointing_it(self):
        with closing(sqlite3.connect(self.source)) as writer:
            writer.execute("UPDATE speeches SET text='Caller must checkpoint this committed value.'")
            writer.commit()
            wal = Path(str(self.source) + "-wal")
            before, wal_before = self.source.read_bytes(), wal.read_bytes()
            with self.assertRaisesRegex(ValueError, "checkpointed by the caller"):
                with builder.freeze_source(self.source, .01):
                    self.fail("nonempty WAL accepted")
            self.assertEqual(self.source.read_bytes(), before)
            self.assertEqual(wal.read_bytes(), wal_before)

    def test_cli_returns_only_json_with_frozen_paths(self):
        result = subprocess.run([sys.executable, str(ROOT / "scripts/vm/build_evidence_bundle.py"),
                                 "--source", str(self.source), "--bundle-root", str(self.destination.parent),
                                 "--repo", str(self.repo), "--timeout-seconds", "60"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertTrue(report["verified"])
        self.assertNotEqual(report["source"], str(self.source))
        self.assertTrue(Path(report["bundle_dir"]).name.endswith(".incoming"))
        self.assertEqual(report["env"]["OPAX_EVIDENCE_SOURCE"], report["source"])

    def test_incomplete_output_never_becomes_ready_and_active_is_untouched(self):
        active = self.root / "active.json"
        active.write_text('{"source":"previous"}')
        original_stage = builder.run_stage
        def incomplete(name, argv, *rest):
            original_stage(name, argv, *rest)
            if name == "additional":
                with closing(sqlite3.connect(argv[argv.index("--output") + 1])) as db:
                    db.execute("UPDATE progress SET processed=0 WHERE source_table='speeches'")
                    db.commit()
        with patch.object(builder, "run_stage", incomplete), self.assertRaisesRegex(ValueError, "incomplete"):
            self.build()
        bundle = self.destination.with_name(self.destination.name + ".incoming")
        self.assertFalse((bundle / "READY.json").exists())
        self.assertTrue((bundle / "FAILED.json").is_file())
        self.assertFalse((bundle / "parli.db").exists())
        self.assertEqual(active.read_text(), '{"source":"previous"}')
        self.assertEqual(self.source.read_bytes(), self.before)

    def test_audit_or_guard_failure_never_publishes_readiness(self):
        with patch.object(builder, "publication_check", side_effect=ValueError("fixture guard refused")):
            with self.assertRaisesRegex(ValueError, "guard refused"):
                self.build()
        bundle = self.destination.with_name(self.destination.name + ".incoming")
        self.assertFalse((bundle / "READY.json").exists())
        self.assertFalse((bundle / "receipt.json").exists())
        self.assertFalse((bundle / "export").exists())
        self.assertEqual(self.source.read_bytes(), self.before)

    def test_supervised_audited_candidate_retains_proof_without_publication_readiness(self):
        with patch.object(builder, "publication_check", side_effect=ValueError("fixture asset/ID hold")):
            with self.assertRaises(builder.PublicationHeld):
                builder.build(self.source, self.destination, self.repo, timeout_seconds=60,
                              keep_audited_candidate=True)
        bundle = self.destination.with_name(self.destination.name + ".incoming")
        marker = json.loads((bundle / "CANDIDATE.json").read_text())
        receipt = json.loads((bundle / "receipt.json").read_text())
        self.assertFalse(marker["verified"])
        self.assertFalse(marker["publication_approved"])
        self.assertTrue(marker["audited"])
        self.assertIn("fixture asset/ID hold", receipt["publication_guard_error"])
        self.assertTrue(receipt["export_stats"]["complete"])
        self.assertFalse(receipt["report"]["verified"])
        for name in builder.FILENAMES.values():
            self.assertTrue((bundle / name).is_file())
        self.assertTrue((bundle / "export/stats.json").is_file())
        self.assertFalse((bundle / "READY.json").exists())
        self.assertEqual(self.source.read_bytes(), self.before)

    def test_no_resume_or_replacement(self):
        self.destination.parent.mkdir()
        incoming = self.destination.with_name(self.destination.name + ".incoming")
        incoming.mkdir()
        (incoming / "preserved").write_text("evidence")
        with self.assertRaises(FileExistsError):
            self.build()
        self.assertEqual((incoming / "preserved").read_text(), "evidence")
        incoming.rename(self.destination)
        with self.assertRaisesRegex(ValueError, "fresh"):
            self.build()

    def test_disk_reserve_refuses_before_outputs_and_never_allows_lower_floor(self):
        usage = shutil._ntuple_diskusage(100 * 1024**3, 95 * 1024**3, 5 * 1024**3)
        with patch.object(builder.shutil, "disk_usage", return_value=usage), self.assertRaisesRegex(ValueError, "reserve"):
            self.build()
        self.assertFalse(self.destination.with_name(self.destination.name + ".incoming").exists())
        with self.assertRaisesRegex(ValueError, "5 GiB"):
            builder.build(self.source, self.destination, self.repo, reserve_bytes=1)

    def test_total_timeout_terminates_child_before_releasing_source(self):
        budget = builder.Budget(self.root, .05, 5 * 1024**3)
        metadata = {"stages": []}
        with self.assertRaises(TimeoutError):
            builder.run_stage("sleep", [sys.executable, "-c", "import time; time.sleep(20)"],
                              self.repo, self.root, budget, metadata)
        self.assertIsNotNone(metadata["stages"][0]["returncode"])

    def test_external_termination_kills_child_before_unlocking_and_never_readies(self):
        isolated = self.root / "slow-repo"
        (isolated / "scripts").mkdir(parents=True)
        (isolated / "scripts/build_evidence_layers.py").write_text(
            "import os,time\nfrom pathlib import Path\n"
            "Path(os.environ['BUNDLE_TEST_PID']).write_text(str(os.getpid()))\ntime.sleep(30)\n")
        pidfile = self.root / "stage.pid"
        active = self.root / "active.json"
        active.write_text("previous verified bundle")
        process = subprocess.Popen([sys.executable, str(ROOT / "scripts/vm/build_evidence_bundle.py"),
                                    "--source", str(self.source), "--bundle", str(self.destination),
                                    "--repo", str(isolated)], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   env={**os.environ, "BUNDLE_TEST_PID": str(pidfile)})
        try:
            deadline = time.monotonic() + 5
            while not pidfile.exists() and process.poll() is None and time.monotonic() < deadline:
                time.sleep(.02)
            self.assertTrue(pidfile.exists(), "stage did not launch")
            child = int(pidfile.read_text())
            with closing(sqlite3.connect(self.source, timeout=.01)) as competing:
                with self.assertRaisesRegex(sqlite3.OperationalError, "locked"):
                    competing.execute("BEGIN IMMEDIATE")
            process.terminate()
            _, error = process.communicate(timeout=8)
            self.assertNotEqual(process.returncode, 0)
            self.assertIn(b"interrupted", error)
            with self.assertRaises(ProcessLookupError):
                os.kill(child, 0)
            with closing(sqlite3.connect(self.source, timeout=.01)) as competing:
                competing.execute("BEGIN IMMEDIATE")
                competing.rollback()
            bundle = self.destination.with_name(self.destination.name + ".incoming")
            self.assertFalse((bundle / "READY.json").exists())
            self.assertTrue((bundle / "FAILED.json").exists())
            self.assertEqual(active.read_text(), "previous verified bundle")
            self.assertEqual(self.source.read_bytes(), self.before)
        finally:
            if process.poll() is None:
                process.kill()
                process.communicate()
            if pidfile.exists():
                try:
                    os.kill(int(pidfile.read_text()), 9)
                except ProcessLookupError:
                    pass


if __name__ == "__main__":
    unittest.main()
