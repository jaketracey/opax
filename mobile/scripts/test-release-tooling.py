#!/usr/bin/env python3
"""Offline safety tests for release tooling; never access Apple or real signing keys."""
import argparse
import contextlib
import base64
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import tarfile
import unittest
import zipfile
from unittest.mock import patch

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from release_support import ReleaseError, matches, redact, run_logged, run_step
from release_inputs import check_upload_build, clean_commit, dependency_command, refuse_dotenv


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).parent / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


asc = module("asc", "asc-testflight.py")
verify = module("verify", "verify-ios-release.py")
step = module("step", "release-step.py")


def packed(storage, text):
    """The (offset, length) of text inside a packed Hermes string storage."""
    return (storage.index(text), len(text))


def hermes_bundle(storage, entries, version=98, kind_count=None):
    """A minimal Hermes v98 bytecode file: no functions, one string-kind run and
    (offset, length[, utf16]) entries into a packed storage blob."""
    small, overflow = [], []
    for entry in entries:
        offset, length, utf16 = (*entry, False)[:3]
        if length >= 0xFF:
            small.append((len(overflow) << 1) | (0xFF << 24) | int(utf16))
            overflow.append((offset, length))
        else:
            small.append((offset << 1) | (length << 24) | int(utf16))
    count = len(entries)
    body = struct.pack("<I", count if kind_count is None else kind_count)
    body += struct.pack(f"<{count}I", *small)
    body += b"".join(struct.pack("<II", *row) for row in overflow)
    body += storage + b"\0" * (-len(storage) % 4)
    fields = [128 + len(body), 0, 0, 1, 0, count, len(overflow), len(storage)] + [0] * 12
    header = struct.pack("<QI", verify.HERMES_MAGIC, version) + bytes(20) + struct.pack("<20I", *fields)
    return header + bytes(128 - len(header)) + body


class FakeConnect:
    def __init__(self, state="VALID", group=True):
        self.state = state
        self.group = group
        self.reads = []
        self.writes = []

    def app(self):
        return {"id": "opax-app"}

    def list(self, path, **filters):
        self.reads.append((path, filters))
        if path.endswith("/betaGroups"):
            return [{"id": "group", "attributes": {"name": asc.GROUP, "isInternalGroup": True}}] if self.group else []
        if path == "/v1/users":
            return [{"id": "user", "attributes": {"username": "tester@example.invalid"}}]
        if path == "/v1/betaTesters" or path.endswith("/betaTesters"):
            return [{"id": "tester", "attributes": {"email": "tester@example.invalid"}}]
        if path == "/v1/builds" or path.endswith("/builds"):
            return [{"id": "build", "attributes": {"version": "7", "processingState": self.state,
                                                     "expired": False, "usesNonExemptEncryption": False}}]
        if path.endswith("/betaBuildLocalizations"):
            return [{"id": "locale", "attributes": {"locale": "en-AU"}}]
        raise AssertionError(path)

    def request(self, method, path, data=None):
        self.writes.append((method, path, data))
        return {"data": {"id": "group"}}


def args(**values):
    return argparse.Namespace(**{"version": "0.1.0", "build": "7", "next_build": False,
        "dry_run": True, "wait_minutes": 0, "what_to_test": "Check public browsing",
        "locale": "en-AU", "tester": "tester@example.invalid", **values})


class SafetyTests(unittest.TestCase):
    def run_quiet(self, arguments, client):
        with contextlib.redirect_stdout(io.StringIO()):
            asc.run(arguments, client)

    def test_dry_run_valid_makes_no_writes(self):
        api = FakeConnect()
        self.run_quiet(args(), api)
        self.assertFalse(api.writes)
        filters = next(f for p, f in api.reads if p == "/v1/builds")
        self.assertEqual(filters["filter[preReleaseVersion.version]"], "0.1.0")
        self.assertEqual(filters["filter[version]"], "7")
        self.assertEqual(filters["filter[preReleaseVersion.platform]"], "IOS")

    def test_dry_run_processing_and_missing_group_do_not_create(self):
        api = FakeConnect(state="PROCESSING", group=False)
        self.run_quiet(args(), api)
        self.assertFalse(api.writes)

    def test_failed_build_refused_before_any_write(self):
        api = FakeConnect(state="INVALID")
        with self.assertRaises(ReleaseError):
            self.run_quiet(args(dry_run=False), api)
        self.assertFalse(api.writes)

    def test_processing_deadline_no_writes(self):
        api = FakeConnect(state="PROCESSING")
        with self.assertRaises(ReleaseError):
            self.run_quiet(args(dry_run=False), api)
        self.assertFalse(api.writes)

    def test_existing_membership_not_readded(self):
        api = FakeConnect()
        self.run_quiet(args(dry_run=False), api)
        self.assertEqual(len(api.writes), 1)
        self.assertEqual(api.writes[0][1], "/v1/betaBuildLocalizations/locale")

    def test_duplicate_tester_emails_prefer_existing_group_member(self):
        class DuplicateTesters(FakeConnect):
            def list(self, path, **filters):
                result = super().list(path, **filters)
                if path == "/v1/betaTesters":
                    return [{"id": "outside-group", "attributes": {"email": "tester@example.invalid"}}, *result]
                return result
        api = DuplicateTesters()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            asc.run(args(), api)
        self.assertIn("Tester membership: present", output.getvalue())
        self.assertFalse(api.writes)
        self.run_quiet(args(dry_run=False), api)
        self.assertEqual([p for _, p, _ in api.writes], ["/v1/betaBuildLocalizations/locale"])

    def test_missing_group_created_internal_with_only_exact_build_access(self):
        api = FakeConnect(group=False)
        self.run_quiet(args(dry_run=False), api)
        create = next(body for method, path, body in api.writes if path == "/v1/betaGroups")
        self.assertTrue(create["data"]["attributes"]["isInternalGroup"])
        self.assertFalse(create["data"]["attributes"]["hasAccessToAllBuilds"])
        self.assertEqual(create["data"]["relationships"]["app"]["data"]["id"], "opax-app")

    def test_all_builds_group_needs_no_build_assignment_but_sets_compliance_and_text(self):
        class AllBuilds(FakeConnect):
            def list(self, path, **filters):
                result = super().list(path, **filters)
                if path.endswith("/betaGroups"):
                    result[0]["attributes"]["hasAccessToAllBuilds"] = True
                if path.startswith("/v1/betaGroups/") and path.endswith("/builds"):
                    return []
                if path == "/v1/builds":
                    result[0]["attributes"]["usesNonExemptEncryption"] = None
                return result
        api = AllBuilds()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            asc.run(args(dry_run=False), api)
        self.assertIn("group already sees every build", output.getvalue())
        self.assertEqual([p for _, p, _ in api.writes],
                         ["/v1/builds/build", "/v1/betaBuildLocalizations/locale"])

    def test_api_dry_run_mutation_guard(self):
        api = object.__new__(asc.Connect)
        api.dry_run = True
        with self.assertRaises(ReleaseError):
            api.request("POST", "/v1/betaGroups", {})

    def test_api_rejects_off_origin_pagination(self):
        api = object.__new__(asc.Connect)
        api.dry_run = True
        with self.assertRaises(ReleaseError):
            api.request("GET", "https://untrusted.invalid/v1/apps")

    def test_redaction_and_utf16_scan(self):
        with patch.dict(os.environ, {"APPLE_TEAM_ID": "TEST_VALUE_123", "ASC_KEY_PATH": "/dummy/key"}):
            self.assertNotIn("TEST_VALUE_123", redact("team=TEST_VALUE_123 /dummy/key"))
        self.assertTrue(matches("sensitive".encode("utf-16-be"), "sensitive"))

    def test_private_key_multiline_command_output_is_redacted(self):
        with tempfile.TemporaryDirectory() as d:
            log = Path(d) / "log"
            run_logged([sys.executable, "-c", "print('-----BEGIN ' + 'PRIVATE KEY-----'); print('keybytes'); print('-----END ' + 'PRIVATE KEY-----')"], log)
            self.assertNotIn("keybytes", log.read_text())

    def test_only_macho_signature_range_excluded(self):
        header = struct.pack("<8I", 0xfeedfacf, 0, 0, 0, 1, 16, 0, 0)
        command = struct.pack("<4I", 0x1d, 16, 56, 8)
        body = header + command + b"CONTENT!" + b"SIGNING!"
        clean = verify.without_signature(body)
        self.assertIn(b"CONTENT!", clean)
        self.assertNotIn(b"SIGNING!", clean)


class PrivacyTests(unittest.TestCase):
    values = {"APPLE_TEAM_ID": "SYNTHETIC_TEAM", "ASC_KEY_ID": "SYNTHETIC_KEY",
              "ASC_ISSUER_ID": "SYNTHETIC_ISSUER", "ASC_KEY_PATH": "/synthetic/key"}

    def signed_body(self, content=b"RESOURCE", signature=b"SYNTHETIC_TEAM"):
        header = struct.pack("<8I", 0xfeedfacf, 0, 0, 0, 1, 16, 0, 0)
        command = struct.pack("<4I", 0x1d, 16, 48 + len(content), len(signature))
        return header + command + content + signature

    def test_team_rejected_in_each_non_signing_content_type(self):
        with tempfile.TemporaryDirectory() as d:
            for name in ("main.jsbundle", "Info.plist", "resource.bin", "build.log"):
                with self.subTest(name=name):
                    path = Path(d) / name
                    path.write_bytes("SYNTHETIC_TEAM".encode("utf-16-be"))
                    with self.assertRaises(ReleaseError):
                        verify.verify_file_privacy(path, self.values, Path(d) / "embedded.mobileprovision")

    def test_team_allowed_only_inside_verified_apple_signature_range(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "OPAX"
            path.write_bytes(self.signed_body())
            display = subprocess.CompletedProcess([], 0, "", "TeamIdentifier=SYNTHETIC_TEAM\nAuthority=Apple Distribution: Test\n")
            with patch.object(verify, "command") as command, patch.object(verify.subprocess, "run", return_value=display):
                self.assertTrue(verify.verify_file_privacy(path, self.values, None))
                command.assert_called_once_with("/usr/bin/codesign", "--verify", "--strict", str(path))
            path.write_bytes(self.signed_body(content=b"SYNTHETIC_TEAM"))
            with self.assertRaises(ReleaseError):
                verify.verify_file_privacy(path, self.values, None)

    def test_forged_signature_or_wrong_apple_team_not_exempt(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "resource"
            path.write_bytes(self.signed_body())
            with patch.object(verify, "command", side_effect=ReleaseError("Invalid signature")):
                with self.assertRaises(ReleaseError):
                    verify.verify_file_privacy(path, self.values, None)
            display = subprocess.CompletedProcess([], 0, "", "TeamIdentifier=OTHER_TEAM\nAuthority=Self Signed\n")
            with patch.object(verify, "command"), patch.object(verify.subprocess, "run", return_value=display):
                with self.assertRaises(ReleaseError):
                    verify.verify_file_privacy(path, self.values, None)

    def test_other_credentials_rejected_even_in_validated_profile(self):
        with tempfile.TemporaryDirectory() as d:
            profile = Path(d) / "embedded.mobileprovision"
            profile.write_bytes(b"SYNTHETIC_TEAM")
            self.assertTrue(verify.verify_file_privacy(profile, self.values, profile))
            for variable, value in self.values.items():
                if variable == "APPLE_TEAM_ID":
                    continue
                with self.subTest(variable=variable):
                    profile.write_bytes(value.encode())
                    with self.assertRaises(ReleaseError):
                        verify.verify_file_privacy(profile, self.values, profile)

    def test_signature_cannot_hide_load_commands_or_overrun_file(self):
        body = self.signed_body()
        for start, size in ((0, 4), (48, 1000)):
            malformed = body[:40] + struct.pack("<2I", start, size) + body[48:]
            with self.assertRaises(ReleaseError):
                verify.without_signature(malformed)
        with self.assertRaises(ReleaseError):
            verify.without_signature(body[:4])

    def test_team_in_extra_payload_file_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            directory = Path(d)
            ipa = directory / "OPAX.ipa"
            commit = "a" * 40
            (directory / "commit.txt").write_text(commit)
            with zipfile.ZipFile(ipa, "w") as archive:
                archive.writestr("Payload/OPAX.app/Info.plist", b"fixture")
                archive.writestr("Payload/extra.log", b"SYNTHETIC_TEAM")
            argv = ["verify", str(ipa), "--kind", "distribution", "--version", "0.1.0",
                    "--build", "5", "--commit", commit, "--xcode-build", "fixture",
                    "--output", str(directory / "verification.json")]
            with patch.object(sys, "argv", argv), patch.object(verify, "load_credentials"), \
                 patch.object(verify, "private_values", return_value=self.values), \
                 patch.object(verify, "verify_provenance", return_value=commit), \
                 patch.object(verify, "scan_tracked"), patch.object(verify, "verify_app") as app:
                with self.assertRaisesRegex(SystemExit, "outside the validated app"):
                    verify.main()
                app.assert_not_called()

    def test_reverification_preserves_original_commit_and_refuses_app_changes(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            def git(*args):
                return subprocess.check_output(["git", *args], cwd=root, stderr=subprocess.DEVNULL).decode().strip()
            git("init")
            git("config", "user.email", "test@example.invalid")
            git("config", "user.name", "Test")
            (root / "mobile/scripts").mkdir(parents=True)
            script = root / "mobile/scripts/verify.py"
            script.write_text("original verifier")
            config = root / "mobile/app.config.ts"
            config.write_text("original app config")
            git("add", ".")
            git("commit", "-m", "artifact")
            original = git("rev-parse", "HEAD")
            script.write_text("updated verifier")
            git("commit", "-am", "verification change")
            head = git("rev-parse", "HEAD")
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(verify.verify_provenance(root, original), head)
            config.write_text("changed app inputs")
            with self.assertRaisesRegex(ReleaseError, "Clean verification worktree"):
                verify.verify_provenance(root, original)
            git("commit", "-am", "app change")
            with self.assertRaisesRegex(ReleaseError, "Application inputs unchanged"):
                verify.verify_provenance(root, original)

    def test_production_block_list_is_an_application_input(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            def git(*args):
                return subprocess.check_output(["git", *args], cwd=root, stderr=subprocess.DEVNULL).decode().strip()
            git("init")
            git("config", "user.email", "test@example.invalid")
            git("config", "user.name", "Test")
            (root / "mobile/scripts").mkdir(parents=True)
            block_list = root / "mobile/scripts/production-block-list.json"
            block_list.write_text('["workbench"]')
            (root / "mobile/scripts/verify.py").write_text("original verifier")
            git("add", ".")
            git("commit", "-m", "artifact")
            original = git("rev-parse", "HEAD")
            (root / "mobile/scripts/verify.py").write_text("updated verifier")
            git("commit", "-am", "tooling change")
            with contextlib.redirect_stdout(io.StringIO()):
                verify.verify_provenance(root, original)
            # Metro reads this file, so a weakened list would change what ships
            # and what the verifier expects; it is not tooling.
            block_list.write_text("[]")
            git("commit", "-am", "block list change")
            with self.assertRaisesRegex(ReleaseError, "Application inputs unchanged"):
                verify.verify_provenance(root, original)


class ReleaseStepTests(unittest.TestCase):
    values = {**PrivacyTests.values, "OPAX_RELEASE_COMMIT": "a" * 40,
              "DEVELOPER_DIR": "/Applications/Xcode.app/Contents/Developer"}

    def test_stub_gate_records_no_private_value_in_any_step_arguments(self):
        with tempfile.TemporaryDirectory() as d:
            gate = Path(d) / "gate.sh"
            record = Path(d) / "arguments.json"
            # This stub deliberately logs argv just as the real gate does. It
            # stops before running the wrapper, so no real credentials are read.
            code = "import json,os,sys; from pathlib import Path; " + \
                   f"assert not any(v in a for v in {list(PrivacyTests.values.values())!r} for a in sys.argv[1:]); " + \
                   f"assert not any(n in os.environ for n in {list(PrivacyTests.values)!r}); " + \
                   f"Path({str(record)!r}).write_text(json.dumps(sys.argv[1:]))"
            import shlex
            gate.write_text("#!/bin/bash\nexec " + shlex.quote(sys.executable) + " -c " + shlex.quote(code) + ' "$@"\n')
            for name in ("dependencies", "prebuild", "archive", "export"):
                with self.subTest(step=name), patch.dict(os.environ, {**self.values, "OPAX_BUILD_GATE": str(gate)}):
                    run_step(name, Path(d) / "log")
                    self.assertEqual(json.loads(record.read_text()),
                                     ["opax-release", "bash", "scripts/release-step.sh", name])
            with patch.dict(os.environ, {"OPAX_BUILD_GATE": str(gate)}), patch("release_support.run_logged") as logged:
                run_step("upload", Path(d) / "log")
                self.assertEqual(logged.call_args.args[0], ["bash", "scripts/release-step.sh", "upload"])

    def test_signing_arguments_are_added_only_inside_the_step(self):
        with tempfile.TemporaryDirectory() as d:
            mobile = Path(d).resolve()
            out = mobile / "output"
            out.mkdir()
            with patch.dict(os.environ, self.values), patch.object(step, "load_credentials"), \
                 patch.object(step, "clean_commit"), patch.object(step, "run_logged") as logged, \
                 contextlib.redirect_stdout(io.StringIO()):
                step.run("archive", mobile, out)
                cmd = logged.call_args.args[0]
                self.assertIn("DEVELOPMENT_TEAM=" + self.values["APPLE_TEAM_ID"], cmd)
                for key in ("ASC_KEY_PATH", "ASC_KEY_ID", "ASC_ISSUER_ID"):
                    self.assertIn(self.values[key], cmd)
                self.assertTrue(logged.call_args.kwargs["public_env"])
                step.run("export", mobile, out)
                self.assertIn("-exportArchive", logged.call_args.args[0])

    def upload_fixture(self, d):
        mobile = Path(d).resolve()
        out = mobile / "output"
        (out / "export").mkdir(parents=True)
        ipa = out / "export/OPAX.ipa"
        ipa.write_bytes(b"verified IPA bytes")
        report = {"commit": "a" * 40, "uploaded": False, "ipa_bytes": ipa.stat().st_size,
                  "ipa_sha256": hashlib.sha256(ipa.read_bytes()).hexdigest()}
        (out / "release.json").write_text(json.dumps(report))
        return mobile, out, ipa

    def test_upload_uses_verified_ipa_and_never_reexports(self):
        with tempfile.TemporaryDirectory() as d:
            mobile, out, ipa = self.upload_fixture(d)
            with patch.dict(os.environ, self.values), patch.object(step, "load_credentials"), \
                 patch.object(step, "clean_commit") as clean, patch.object(step, "run_logged") as logged, \
                 contextlib.redirect_stdout(io.StringIO()):
                step.upload_verified(mobile, out, "a" * 40)
                clean.assert_called_once_with(mobile.parent, "a" * 40)
                cmd = logged.call_args.args[0]
                self.assertEqual(cmd[:5], ["xcrun", "altool", "--upload-app", "-f", str(ipa)])
                self.assertNotIn("xcodebuild", cmd)
                self.assertTrue(json.loads((out / "release.json").read_text())["uploaded"])

    def test_upload_refuses_changed_bytes_or_changed_head_before_altool(self):
        for attack in ("bytes", "head"):
            with self.subTest(attack=attack), tempfile.TemporaryDirectory() as d:
                mobile, out, ipa = self.upload_fixture(d)
                if attack == "bytes":
                    ipa.write_bytes(b"tampered")
                with patch.dict(os.environ, self.values), patch.object(step, "load_credentials"), \
                     patch.object(step, "clean_commit", side_effect=ReleaseError("changed HEAD") if attack == "head" else None), \
                     patch.object(step, "run_logged") as logged:
                    with self.assertRaises(ReleaseError):
                        step.upload_verified(mobile, out, "a" * 40)
                    logged.assert_not_called()

    def test_dotenv_inputs_and_node_modules_symlink_refused(self):
        with tempfile.TemporaryDirectory() as d:
            mobile = Path(d)
            for name in (".env", ".env.local", ".env.production", ".env.production.local"):
                file = mobile / name
                file.write_text("EXPO_PUBLIC_UNREVIEWED=1")
                with self.assertRaises(ReleaseError):
                    refuse_dotenv(mobile)
                file.unlink()
            (mobile / "node_modules").symlink_to(mobile / "shared-dependencies")
            with self.assertRaisesRegex(ReleaseError, "symlink"):
                dependency_command(mobile)

    def test_upload_build_number_checked_before_building(self):
        check_upload_build("8", "8")
        check_upload_build("9", "8")
        for build in ("7", "08", "0"):
            with self.assertRaises(ReleaseError):
                check_upload_build(build, "8")

    def test_clean_npm_ci_removes_planted_ignored_dependency_bytes(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d).resolve()
            mobile = root / "mobile"
            mobile.mkdir()
            pkg = {"name": "fixture-dep", "version": "1.0.0"}
            archive = mobile / "dependency.tgz"
            with tarfile.open(archive, "w:gz") as tar:
                for name, body in {"package/package.json": json.dumps(pkg).encode(), "package/index.js": b"module.exports = 'LOCKED';\n"}.items():
                    info = tarfile.TarInfo(name)
                    info.size = len(body)
                    tar.addfile(info, io.BytesIO(body))
            digest = base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode()
            project = {"name": "fixture-root", "version": "1.0.0", "dependencies": {"fixture-dep": "file:dependency.tgz"}}
            (mobile / "package.json").write_text(json.dumps(project))
            lock = {"name": "fixture-root", "version": "1.0.0", "lockfileVersion": 3, "packages": {
                "": project, "node_modules/fixture-dep": {"version": "1.0.0", "resolved": "file:dependency.tgz", "integrity": "sha512-" + digest}}}
            (mobile / "package-lock.json").write_text(json.dumps(lock))
            (mobile / ".gitignore").write_text("node_modules/\n")
            def git(*args):
                return subprocess.run(["git", *args], cwd=root, capture_output=True, check=True)
            git("init")
            git("config", "user.email", "test@example.invalid")
            git("config", "user.name", "Test")
            git("add", ".")
            git("commit", "-m", "locked fixture")
            planted = mobile / "node_modules/fixture-dep/index.js"
            planted.parent.mkdir(parents=True)
            planted.write_text("UNREVIEWED MUTATION")
            clean_commit(root)  # Ignored mutation really passes git's clean gate.
            result = subprocess.run([*dependency_command(mobile), "--offline"], cwd=mobile, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            self.assertIn("LOCKED", planted.read_text())
            self.assertNotIn("MUTATION", planted.read_text())


class BundleAttackTests(unittest.TestCase):
    def test_app_extensions_refused(self):
        with tempfile.TemporaryDirectory() as d:
            app = Path(d)
            self.assertTrue(verify.no_app_extensions(app, {}))
            self.assertFalse(verify.no_app_extensions(app, {"NSExtension": {}}))
            (app / "PlugIns/Unexpected.appex").mkdir(parents=True)
            self.assertFalse(verify.no_app_extensions(app, {}))

    def test_reviewer_normalized_loopback_plants(self):
        for url in ("HTTP://LOCALHOST/api", "http://[0:0:0:0:0:0:0:1]/api", "http://127.1/api",
                    "http://127.0.0.1:8787", "http://2130706433", "http://0x7f000001", "http://localhost./", "opax.test:8910"):
            with self.subTest(url=url):
                self.assertTrue(verify.has_loopback(url.encode()))
        self.assertFalse(verify.has_loopback(b"https://opax.com.au/api/bills"))

    def test_reviewer_expo_router_route_key_plants(self):
        with tempfile.TemporaryDirectory() as d:
            routes = Path(d)
            (routes / "(tabs)").mkdir()
            (routes / "(tabs)/search.tsx").write_text("shipping route")
            baseline = b"\0./(tabs)/search.tsx\0"
            self.assertEqual(verify.bundle_route_keys(baseline, routes), ["./(tabs)/search.tsx"])
            for plant in (b"./(dev)/workbench.tsx", b"./fixtures/index.tsx", b"app/(dev)/workbench.tsx"):
                with self.assertRaises(ReleaseError):
                    verify.bundle_route_keys(baseline + plant + b"\0", routes)

    def test_production_routes_exclude_workbench_and_accept_comma_groups(self):
        with tempfile.TemporaryDirectory() as d:
            routes = Path(d)
            group = "(tabs)/(today,your-mp,bills,search)"
            keys = ["./_layout.tsx", f"./{group}/_layout.tsx",
                    f"./{group}/person/[slug].tsx"]
            for key in keys + ["./workbench.tsx"]:
                path = routes / key
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("source route")
            bundle = b"\0" + b"\0".join(key.encode() for key in keys) + b"\0"
            self.assertEqual(verify.bundle_route_keys(bundle, routes), sorted(keys))
            # The source-only development route is allowed; shipping it is not.
            with self.assertRaises(ReleaseError):
                verify.bundle_route_keys(bundle + b"./workbench.tsx\0", routes)
            for mutation in (bundle.replace(keys[-1].encode(), b"./unexpected.tsx"),
                             bundle.replace(keys[-1].encode(), b"")):
                with self.assertRaises(ReleaseError):
                    verify.bundle_route_keys(mutation, routes)

    def test_development_routes_fail_even_when_the_source_matches_the_bundle(self):
        for key in ("./fixtures/index.tsx", "./fixture.tsx", "./__tests__/index.tsx",
                    "./(dev)/index.tsx", "./__dev/index.tsx", "./workbench.jsx", "./source-destination.tsx"):
            with self.subTest(key=key), tempfile.TemporaryDirectory() as d:
                routes = Path(d)
                path = routes / key
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("unblocked development route")
                with self.assertRaises(ReleaseError):
                    verify.bundle_route_keys(key.encode() + b"\0", routes)

    def test_inherited_metro_exclusions_do_not_require_unshipped_source_routes(self):
        with tempfile.TemporaryDirectory() as d:
            routes = Path(d)
            (routes / "_layout.tsx").write_text("shipping route")
            (routes / "__tests__").mkdir()
            (routes / "__tests__/fixture.tsx").write_text("Metro-excluded test route")
            baseline = b"\0./_layout.tsx\0"
            self.assertEqual(verify.bundle_route_keys(baseline, routes), ["./_layout.tsx"])
            with self.assertRaises(ReleaseError):
                verify.bundle_route_keys(baseline + b"./__tests__/fixture.tsx\0", routes)

    @staticmethod
    def routes_with(directory, keys):
        routes = Path(directory)
        for key in keys:
            path = routes / key
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("source route")
        return routes

    def test_route_keys_are_whole_hermes_string_entries(self):
        keys = ["./(tabs)/(bills)/bills.tsx", "./_layout.tsx", "./account.tsx", "./talk.tsx"]
        # Hermes packs strings without separators and lets entries overlap.
        storage = b"configurable./(tabs)/(bills)/bills.tsxFileSystem./talk.tsxfoo.js./_layout.tsx./account.tsx"
        entries = [packed(storage, text) for text in
                   (b"configurable", *(key.encode() for key in keys), b"FileSystem", b"foo.js", b"talk")]
        with tempfile.TemporaryDirectory() as d:
            routes = self.routes_with(d, keys)
            bundle = hermes_bundle(storage, entries)
            self.assertEqual(verify.hermes_strings(bundle),
                             {"configurable", *keys, "FileSystem", "foo.js", "talk"})
            self.assertEqual(verify.bundle_route_keys(bundle, routes), sorted(keys))
            # A key that is only a slice of a longer entry is not shipped.
            missing = hermes_bundle(storage, [entry for entry in entries if entry != packed(storage, b"./talk.tsx")])
            with self.assertRaisesRegex(ReleaseError, r"missing \./talk\.tsx"):
                verify.bundle_route_keys(missing, routes)

    def test_route_suffix_entries_are_refused(self):
        with tempfile.TemporaryDirectory() as d:
            routes = self.routes_with(d, ["./talk.tsx"])
            for extra in (b"./talk.tsx.workbench.tsx", b"./secret.tsx", b"./talk.tsxfoo./workbench.tsx"):
                with self.subTest(extra=extra):
                    # The shipped key overlaps the start of the planted entry.
                    storage = extra if extra.startswith(b"./talk.tsx") else b"./talk.tsx" + extra
                    bundle = hermes_bundle(storage, [packed(storage, b"./talk.tsx"), packed(storage, extra)])
                    with self.assertRaisesRegex(ReleaseError, "no unshipped.*found"):
                        verify.bundle_route_keys(bundle, routes)
            # Plain JS is compared by whole tokens, so a suffix is refused there too.
            self.assertEqual(verify.bundle_route_keys(b"\0./talk.tsx\0", routes), ["./talk.tsx"])
            with self.assertRaisesRegex(ReleaseError, "no unshipped.*found ./talk.tsx.workbench.tsx"):
                verify.bundle_route_keys(b"\0./talk.tsx\0./talk.tsx.workbench.tsx\0", routes)

    def test_hermes_overflow_and_utf16_entries_are_read(self):
        long_text = ("x" * 300).encode()
        storage = b"./talk.tsx" + long_text + "\u00e9t\u00e9".encode("utf-16-le")
        bundle = hermes_bundle(storage, [(0, 10, False), (10, 300, False), (310, 3, True)])
        self.assertEqual(verify.hermes_strings(bundle), {"./talk.tsx", "x" * 300, "\u00e9t\u00e9"})

    def test_unknown_or_malformed_hermes_bytecode_fails_closed(self):
        storage = b"./talk.tsx"
        good = hermes_bundle(storage, [(0, 10)])
        self.assertEqual(verify.hermes_strings(good), {"./talk.tsx"})
        self.assertIsNone(verify.hermes_strings(b"__d(function(){})"))
        oversized = bytearray(good)
        struct.pack_into("<I", oversized, 32 + 4 * verify.HERMES_FIELDS.index("stringStorageSize"), 1000)
        cases = {
            "version 99": hermes_bundle(storage, [(0, 10)], version=99),
            "length matches": good[:-4],
            "kinds cover": hermes_bundle(storage, [(0, 10)], kind_count=2),
            "within string storage": hermes_bundle(storage, [(0, 11)]),
            "within the bytecode": bytes(oversized),
        }
        for label, bundle in cases.items():
            with self.subTest(label=label), self.assertRaisesRegex(ReleaseError, label):
                verify.hermes_strings(bundle)

    def test_each_missing_route_key_is_named(self):
        with tempfile.TemporaryDirectory() as d:
            routes = Path(d)
            (routes / "talk.tsx").write_text("source route")
            (routes / "account.tsx").write_text("source route")
            with self.assertRaisesRegex(ReleaseError, r"FAIL every shipping .*missing \./account\.tsx\)$"):
                verify.bundle_route_keys(b"\0./talk.tsx\0", routes)

    def test_incompatible_metro_rule_is_a_fail_line_not_a_traceback(self):
        verify.production_block_list.cache_clear()
        self.addCleanup(verify.production_block_list.cache_clear)
        for source in ("[^]", "(?<name>workbench)"):
            with self.subTest(source=source):
                verify.production_block_list.cache_clear()
                rules = subprocess.CompletedProcess([], 0, json.dumps([{"source": source, "flags": ""}]), "")
                with patch.object(verify.subprocess, "run", return_value=rules):
                    with self.assertRaisesRegex(ReleaseError, "^FAIL Metro exclusion expression .* is not Python-compatible"):
                        verify.production_block_list()
        # The release entry point reports it as one FAIL line.
        verify.production_block_list.cache_clear()
        with tempfile.TemporaryDirectory() as d:
            directory = Path(d)
            (directory / "commit.txt").write_text("a" * 40)
            argv = ["verify", str(directory / "OPAX.app"), "--kind", "archive", "--version", "0.1.0",
                    "--build", "5", "--commit", "a" * 40, "--xcode-build", "fixture",
                    "--output", str(directory / "verification.json")]
            rules = subprocess.CompletedProcess([], 0, json.dumps([{"source": "[^]", "flags": ""}]), "")
            with patch.object(sys, "argv", argv), patch.object(verify, "load_credentials"), \
                 patch.object(verify, "verify_provenance", return_value="a" * 40), \
                 patch.object(verify, "scan_tracked"), \
                 patch.object(verify, "verify_app", side_effect=lambda *_: verify.production_block_list()), \
                 patch.object(verify.subprocess, "check_output", return_value=b"/repository\n"), \
                 patch.object(verify.subprocess, "run", return_value=rules):
                with self.assertRaisesRegex(SystemExit, "^FAIL Metro exclusion expression"):
                    verify.main()

    def test_scene_delegate_must_be_defined_in_the_executable(self):
        def otool(stdout, returncode=0):
            return subprocess.CompletedProcess([], returncode, stdout, "")
        linked = ("OPAX:\nContents of (__DATA_CONST,__objc_classlist) section\n"
                  "0000000100492540 0x1004b9d78\n    data       0x1004b9d1a Swift class\n"
                  "        name           0x1003cec10 EXExpoAppSceneDelegate\n"
                  "Contents of (__DATA_CONST,__objc_classrefs) section\n")
        elsewhere = ("OPAX:\nContents of (__DATA_CONST,__objc_classlist) section\n"
                     "        name           0x1003ce960 _TtC4OPAX11AppDelegate\n"
                     "Contents of (__TEXT,__cstring) section\n"
                     "        name           0x1003cec10 EXExpoAppSceneDelegate\n")
        renamed = linked.replace("EXExpoAppSceneDelegate", "EXExpoAppSceneDelegateShim")
        with patch.object(verify.subprocess, "run", return_value=otool(linked)) as run:
            self.assertTrue(verify.scene_delegate_linked(Path("OPAX.app/OPAX")))
            self.assertEqual(run.call_args.args[0], ["/usr/bin/otool", "-oV", "OPAX.app/OPAX"])
        for output in (elsewhere, renamed, ""):
            with patch.object(verify.subprocess, "run", return_value=otool(output)):
                self.assertFalse(verify.scene_delegate_linked(Path("OPAX.app/OPAX")))
        with patch.object(verify.subprocess, "run", return_value=otool(linked, returncode=1)):
            with self.assertRaisesRegex(ReleaseError, "otool"):
                verify.scene_delegate_linked(Path("OPAX.app/OPAX"))

    def test_scene_manifest_requires_the_expo_scene_delegate(self):
        manifest = {"UIApplicationSupportsMultipleScenes": False, "UISceneConfigurations": {
            "UIWindowSceneSessionRoleApplication": [{"UISceneConfigurationName": "Default Configuration",
                "UISceneDelegateClassName": "EXExpoAppSceneDelegate"}]}}
        self.assertTrue(verify.scene_manifest_valid({"UIApplicationSceneManifest": manifest}))
        self.assertFalse(verify.scene_manifest_valid({}))
        manifest["UISceneConfigurations"]["UIWindowSceneSessionRoleApplication"][0]["UISceneDelegateClassName"] = "MissingDelegate"
        self.assertFalse(verify.scene_manifest_valid({"UIApplicationSceneManifest": manifest}))

    def test_reviewer_framework_and_analytics_host_plants(self):
        for url in (b"https://api.segment.io/v1/track", b"https://us.i.posthog.com/capture", b"crashlytics", b"HTTPS://API.HEAP.IO/track"):
            self.assertTrue(verify.has_analytics(url))
        self.assertFalse(verify.has_analytics(b"https://opax.com.au/api/bills"))
        with tempfile.TemporaryDirectory() as d:
            app = Path(d)
            for name in verify.SHIPPED_FRAMEWORKS:
                (app / "Frameworks" / name).mkdir(parents=True)
            verify.framework_allowlist(app)
            for name in ("PostHog.framework", "FirebaseCrashlytics.framework", "Segment.framework", "Heap.framework"):
                plant = app / "Frameworks" / name
                plant.mkdir()
                with self.assertRaises(ReleaseError):
                    verify.framework_allowlist(app)
                plant.rmdir()

    def test_every_embedded_bundle_entitlement_payload_checked(self):
        with tempfile.TemporaryDirectory() as d:
            import plistlib
            app = Path(d)
            framework = app / "Frameworks/React.framework"
            framework.mkdir(parents=True)
            (framework / "Info.plist").write_bytes(plistlib.dumps({"CFBundleExecutable": "React"}))
            def command(*args):
                return plistlib.dumps({"com.apple.developer.healthkit": True}) if "--entitlements" in args else b""
            with patch.object(verify, "command", side_effect=command):
                with self.assertRaisesRegex(ReleaseError, "embedded code bundle"):
                    verify.nested_entitlements(app)


if __name__ == "__main__":
    unittest.main()
