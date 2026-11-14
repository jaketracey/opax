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
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import tarfile
import unittest
import zipfile
from unittest.mock import Mock, patch

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
    return argparse.Namespace(**{"version": "1.0.0", "build": "7", "next_build": False,
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
        self.assertEqual(filters["filter[preReleaseVersion.version]"], "1.0.0")
        self.assertEqual(filters["filter[version]"], "7")
        self.assertEqual(filters["filter[preReleaseVersion.platform]"], "IOS")

    def test_next_build_stays_monotonic_across_marketing_versions(self):
        class HistoricalBuilds(FakeConnect):
            def list(self, path, **filters):
                self.reads.append((path, filters))
                return [
                    {"attributes": {"version": "9"}},  # 0.1.0
                    {"attributes": {"version": "10"}},  # 0.1.0
                    {"attributes": {"version": "2"}},  # 1.0.0
                ]
        api = HistoricalBuilds()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            asc.run(args(next_build=True), api)
        self.assertEqual(output.getvalue().strip(), "11")
        self.assertEqual(api.reads, [("/v1/builds", {
            "filter[app]": "opax-app", "filter[preReleaseVersion.platform]": "IOS"})])
        self.assertFalse(api.writes)

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
        with patch.dict(os.environ, {"POSTHOG_CLI_API_KEY": "phx_SYNTHETIC_UPLOAD_KEY"}):
            self.assertNotIn("phx_SYNTHETIC_UPLOAD_KEY", redact("key phx_SYNTHETIC_UPLOAD_KEY"))
        self.assertTrue(matches("sensitive".encode("utf-16-be"), "sensitive"))

    def test_private_key_multiline_command_output_is_redacted(self):
        with tempfile.TemporaryDirectory() as d:
            log = Path(d) / "log"
            run_logged([sys.executable, "-c", "print('-----BEGIN ' + 'PRIVATE KEY-----'); print('keybytes'); print('-----END ' + 'PRIVATE KEY-----')"], log)
            self.assertNotIn("keybytes", log.read_text())

    def test_build_steps_never_receive_the_symbol_upload_key(self):
        with tempfile.TemporaryDirectory() as d, \
             patch.dict(os.environ, {"POSTHOG_CLI_API_KEY": "phx_SYNTHETIC_UPLOAD_KEY"}):
            log = Path(d) / "log"
            show = [sys.executable, "-c", "import os; print(os.environ.get('POSTHOG_CLI_API_KEY', 'absent'))"]
            run_logged(show, log, public_env=True)
            self.assertEqual(log.read_text(), "absent\n")
            run_logged(show, log)
            self.assertEqual(log.read_text(), "[POSTHOG_CLI_API_KEY redacted]\n")

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
            argv = ["verify", str(ipa), "--kind", "distribution", "--version", "1.0.0",
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
                 patch.object(step, "APPLE_RSYNC", Path(sys.executable)), \
                 contextlib.redirect_stdout(io.StringIO()):
                step.run("archive", mobile, out)
                cmd = logged.call_args.args[0]
                self.assertIn("DEVELOPMENT_TEAM=" + self.values["APPLE_TEAM_ID"], cmd)
                for key in ("ASC_KEY_PATH", "ASC_KEY_ID", "ASC_ISSUER_ID"):
                    self.assertIn(self.values[key], cmd)
                self.assertTrue(logged.call_args.kwargs["public_env"])
                # Every archive writes its Hermes source map and chunk ID beside it.
                self.assertIn("SOURCEMAP_FILE=" + str(out / "main.jsbundle.map"), cmd)
                self.assertIn("OPAX_SYMBOLS_DIR=" + str(out), cmd)
                step.run("export", mobile, out)
                self.assertIn("-exportArchive", logged.call_args.args[0])
                self.assertFalse(any(arg.startswith("SOURCEMAP_FILE=") for arg in logged.call_args.args[0]))

    def export_env(self, mobile, caller_path, tool_dirs=None):
        """Run the export step and return the environment handed to Popen."""
        out = mobile / "output"
        out.mkdir(exist_ok=True)
        seen = []

        def capture(command, **kwargs):  # The real run_logged -> Popen boundary.
            self.assertIn("-exportArchive", command)
            seen.append(kwargs["env"])
            return Mock(stdout=io.StringIO(), wait=Mock(return_value=0))

        # A stand-in keeps the /usr/bin/rsync check passing on hosts without it.
        apple_rsync = mobile / "apple-rsync-check"
        apple_rsync.write_text("#!/bin/sh\nexit 0\n")
        apple_rsync.chmod(0o755)
        with patch.dict(os.environ, {**self.values, "PATH": caller_path}), \
             patch.object(step, "load_credentials"), patch.object(step, "clean_commit"), \
             patch.object(step, "APPLE_RSYNC", apple_rsync), \
             patch.object(step, "APPLE_TOOL_DIRS", tool_dirs or step.APPLE_TOOL_DIRS), \
             patch("release_support.subprocess.Popen", side_effect=capture), \
             contextlib.redirect_stdout(io.StringIO()):
            step.run("export", mobile, out)
            self.assertEqual(os.environ["PATH"], caller_path)
        self.assertEqual(len(seen), 1)
        return seen[0]

    def test_export_environment_puts_usr_bin_before_every_homebrew_path(self):
        self.assertEqual(step.APPLE_RSYNC, Path("/usr/bin/rsync"))
        self.assertEqual(step.APPLE_TOOL_DIRS, ("/usr/bin", "/bin", "/usr/sbin", "/sbin"))
        homebrew = ["/opt/homebrew/opt/rsync/bin", "/opt/homebrew/bin", "/opt/homebrew/sbin",
                    "/usr/local/bin", "/home/linuxbrew/.linuxbrew/bin"]
        others = ["/Users/dev/.nvm/versions/node/v24/bin", "/Users/dev/.local/bin"]
        caller_path = os.pathsep.join([*homebrew, others[0], "/usr/bin/", "", "/bin",
                                       "/usr/sbin", others[1], "/sbin", "/usr/bin"])
        with tempfile.TemporaryDirectory() as d:
            env = self.export_env(Path(d).resolve(), caller_path)
        entries = env["PATH"].split(os.pathsep)
        self.assertEqual(entries[0], "/usr/bin")
        for entry in homebrew:
            self.assertLess(entries.index("/usr/bin"), entries.index(entry), entry)
        # Apple's directories appear once, ahead of the caller's other entries,
        # which keep their order; an empty (current directory) entry is dropped.
        self.assertEqual(entries, ["/usr/bin", "/bin", "/usr/sbin", "/sbin", *homebrew, *others])
        self.assertNotIn("ASC_KEY_ID", env)

    def test_export_resolves_apple_rsync_ahead_of_homebrew_rsync(self):
        with tempfile.TemporaryDirectory() as d:
            mobile = Path(d).resolve()
            # Stand-ins for /opt/homebrew/bin and /usr/bin, so this runs on any host.
            homebrew_bin, apple_bin = mobile / "homebrew-bin", mobile / "apple-bin"
            for folder, names in ((homebrew_bin, ("rsync", "node")), (apple_bin, ("rsync",))):
                folder.mkdir()
                for name in names:
                    tool = folder / name
                    tool.write_text("#!/bin/sh\nexit 0\n")
                    tool.chmod(0o755)
            caller_path = os.pathsep.join([str(homebrew_bin), str(apple_bin)])
            self.assertEqual(shutil.which("rsync", path=caller_path), str(homebrew_bin / "rsync"))
            env = self.export_env(mobile, caller_path, (str(apple_bin),))
            self.assertEqual(env["PATH"], os.pathsep.join([str(apple_bin), str(homebrew_bin)]))
            self.assertEqual(shutil.which("rsync", path=env["PATH"]), str(apple_bin / "rsync"))
            # Tools only the caller provides still resolve from the caller's PATH.
            self.assertEqual(shutil.which("node", path=env["PATH"]), str(homebrew_bin / "node"))

    def test_non_export_steps_preserve_caller_path(self):
        for name in ("dependencies", "prebuild", "archive", "upload"):
            with self.subTest(step=name), tempfile.TemporaryDirectory() as d:
                mobile, out, _ = self.upload_fixture(d)
                caller_path = str(mobile / "caller-bin") + os.pathsep + os.defpath
                with patch.dict(os.environ, {**self.values, "PATH": caller_path}), \
                     patch.object(step, "load_credentials"), patch.object(step, "clean_commit"), \
                     patch.object(step, "dependency_command", return_value=["npm", "ci"]), \
                     patch("release_support.subprocess.Popen") as popen, \
                     contextlib.redirect_stdout(io.StringIO()):
                    popen.side_effect = lambda *a, **kw: Mock(stdout=io.StringIO(), wait=Mock(return_value=0))
                    step.run(name, mobile, out, "1")
                    self.assertTrue(popen.called)
                    for call in popen.call_args_list:
                        self.assertEqual(call.kwargs["env"]["PATH"], caller_path)
                    self.assertEqual(os.environ["PATH"], caller_path)

    def test_export_refuses_missing_apple_rsync(self):
        with tempfile.TemporaryDirectory() as d:
            mobile = Path(d).resolve()
            with patch.dict(os.environ, self.values), patch.object(step, "load_credentials"), \
                 patch.object(step, "clean_commit"), patch.object(step, "run_logged") as logged, \
                 patch.object(step, "APPLE_RSYNC", mobile / "missing-rsync"):
                with self.assertRaisesRegex(ReleaseError, "Apple's executable /usr/bin/rsync"):
                    step.run("export", mobile, mobile)
                logged.assert_not_called()

    def upload_fixture(self, d):
        mobile = Path(d).resolve()
        out = mobile / "output"
        (out / "export").mkdir(parents=True)
        ipa = out / "export/OPAX.ipa"
        ipa.write_bytes(b"verified IPA bytes")
        report = {"commit": "a" * 40, "uploaded": False, "ipa_bytes": ipa.stat().st_size,
                  "ipa_sha256": hashlib.sha256(ipa.read_bytes()).hexdigest(),
                  "production_voice_enabled": True, "production_voice_mode": "on"}
        (out / "release.json").write_text(json.dumps(report))
        return mobile, out, ipa

    def test_upload_uses_verified_ipa_and_never_reexports(self):
        with tempfile.TemporaryDirectory() as d:
            mobile, out, ipa = self.upload_fixture(d)
            with patch.dict(os.environ, self.values), patch.object(step, "load_credentials"), \
                 patch.object(step, "clean_commit") as clean, patch.object(step, "run_logged") as logged, \
                 contextlib.redirect_stdout(io.StringIO()):
                step.upload_verified(mobile, out, "a" * 40, "1")
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
                        step.upload_verified(mobile, out, "a" * 40, "1")
                    logged.assert_not_called()

    def test_upload_requires_explicit_matching_recorded_voice_mode(self):
        for expected, recorded in ((None, True), ("", True), ("yes", True),
                                   ("0", True), ("1", False), ("1", None), ("1", 1)):
            with self.subTest(expected=expected, recorded=recorded), tempfile.TemporaryDirectory() as d:
                mobile, out, _ = self.upload_fixture(d)
                report = json.loads((out / "release.json").read_text())
                report["production_voice_enabled"] = recorded
                (out / "release.json").write_text(json.dumps(report))
                with patch.object(step, "load_credentials") as credentials, patch.object(step, "run_logged") as logged:
                    with self.assertRaisesRegex(ReleaseError, "voice mode"):
                        step.upload_verified(mobile, out, "a" * 40, expected)
                    credentials.assert_not_called(); logged.assert_not_called()
        with tempfile.TemporaryDirectory() as d:
            mobile, out, _ = self.upload_fixture(d)
            report = json.loads((out / "release.json").read_text())
            report.update(production_voice_enabled=False, production_voice_mode="off")
            (out / "release.json").write_text(json.dumps(report))
            with patch.dict(os.environ, self.values), patch.object(step, "load_credentials"), \
                 patch.object(step, "clean_commit"), patch.object(step, "run_logged") as logged, \
                 contextlib.redirect_stdout(io.StringIO()):
                step.upload_verified(mobile, out, "a" * 40, "0")
                logged.assert_called_once()

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


class SourceMapTests(unittest.TestCase):
    """The archive's composed Hermes map stays beside it, never in the app."""
    chunk = "896a182b-d6a3-4253-bc6b-150f6ce96357"

    def fixture(self, d):
        root = Path(d)
        app, evidence = root / "OPAX.xcarchive/Products/Applications/OPAX.app", root
        app.mkdir(parents=True)
        (app / "main.jsbundle").write_bytes(b"\xc6\x1f\xbc\x03 _posthogChunkIds " + self.chunk.encode())
        (evidence / "main.jsbundle.map").write_text(json.dumps({
            "version": 3, "sources": ["src/app/index.tsx"], "names": ["render"], "mappings": "AAAAA",
            "x_hermes_function_offsets": {"0": [0]}}))
        (evidence / "ios.chunk-id").write_text(self.chunk + "\n")
        return app, evidence

    def test_map_beside_the_archive_passes(self):
        with tempfile.TemporaryDirectory() as d:
            verify.verify_source_map(*self.fixture(d))

    def test_missing_unreadable_or_packager_only_map_fails(self):
        for change in ("missing", "not json", "no hermes offsets"):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as d:
                app, evidence = self.fixture(d)
                source_map = evidence / "main.jsbundle.map"
                if change == "missing":
                    source_map.unlink()
                elif change == "not json":
                    source_map.write_text("{")
                else:
                    source_map.write_text(json.dumps({"version": 3, "sources": ["a.js"], "mappings": "AAAA"}))
                with self.assertRaises(ReleaseError):
                    verify.verify_source_map(app, evidence)

    def test_a_map_inside_the_app_fails(self):
        for name in ("main.jsbundle.map", "assets/node_modules/lib/index.js.MAP"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as d:
                app, evidence = self.fixture(d)
                (app / name).parent.mkdir(parents=True, exist_ok=True)
                (app / name).write_text("{}")
                with self.assertRaises(ReleaseError):
                    verify.verify_source_map(app, evidence)

    def test_chunk_id_must_be_recorded_and_shipped(self):
        for change in ("missing", "other bundle"):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as d:
                app, evidence = self.fixture(d)
                if change == "missing":
                    (evidence / "ios.chunk-id").unlink()
                else:
                    (evidence / "ios.chunk-id").write_text("00000000-0000-4000-8000-000000000000\n")
                with self.assertRaises(ReleaseError):
                    verify.verify_source_map(app, evidence)


class BundleAttackTests(unittest.TestCase):
    def test_pinned_posthog_plugin_metadata_is_exempt_only_with_its_pin(self):
        with tempfile.TemporaryDirectory() as d:
            routes = Path(d)
            (routes / "_layout.tsx").write_text("shipping route")
            pin = ["@posthog/react-native-plugin", "2.13.0"]
            paths = sorted(verify.POSTHOG_PLUGIN_METADATA_PATHS)
            entries = ["./_layout.tsx", *pin, *paths]
            storage = "\0".join(entries).encode()
            bundle = hermes_bundle(storage, [packed(storage, entry.encode()) for entry in entries])
            self.assertEqual(verify.bundle_route_keys(bundle, routes), ["./_layout.tsx"])
            for missing in pin:
                kept = [entry for entry in entries if entry != missing]
                body = "\0".join(kept).encode()
                with self.subTest(missing=missing), self.assertRaises(ReleaseError):
                    verify.bundle_route_keys(hermes_bundle(body, [packed(body, e.encode()) for e in kept]), routes)
            plant = "./src/workbench.tsx"
            body = storage + b"\0" + plant.encode()
            with self.assertRaises(ReleaseError):
                verify.bundle_route_keys(hermes_bundle(body, [packed(body, e.encode()) for e in [*entries, plant]]), routes)

    def test_pinned_reanimated_metadata_is_not_a_route_but_new_paths_are_refused(self):
        with tempfile.TemporaryDirectory() as d:
            routes = Path(d)
            (routes / "_layout.tsx").write_text("shipping route")
            entries = ["./_layout.tsx", "react-native-reanimated", "4.5.1",
                       *sorted(verify.REANIMATED_METADATA_PATHS)]
            storage = "\0".join(entries).encode()
            bundle = hermes_bundle(storage, [packed(storage, entry.encode()) for entry in entries])
            self.assertEqual(verify.bundle_route_keys(bundle, routes), ["./_layout.tsx"])
            for plant in ("./src/unexpected.ts", "./lib/module/workbench.js", "./src/core.ts.workbench.tsx"):
                with self.subTest(plant=plant), self.assertRaises(ReleaseError):
                    body = storage + b"\0" + plant.encode()
                    verify.bundle_route_keys(hermes_bundle(body, [packed(body, entry.encode())
                                             for entry in [*entries, plant]]), routes)
            # A source route with an exempt-looking name must still fail when
            # Metro excludes it; dependency metadata cannot conceal that route.
            (routes / "src").mkdir()
            (routes / "src/core.ts").write_text("unshipped route")
            with patch.object(verify, "production_block_list", return_value=(re.compile(r"/src/core\.ts$"),)):
                with self.assertRaises(ReleaseError):
                    verify.bundle_route_keys(bundle, routes)

    def test_dependency_paths_without_pinned_package_identity_are_refused(self):
        with tempfile.TemporaryDirectory() as d:
            routes = Path(d)
            (routes / "_layout.tsx").write_text("shipping route")
            with self.assertRaises(ReleaseError):
                verify.bundle_route_keys(b"\0./_layout.tsx\0./src/core.ts\0", routes)

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
            group = "(tabs)/(today,your-mp,bills,search,ask)"
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
                    "./(dev)/index.tsx", "./__dev/index.tsx", "./workbench.jsx",
                    "./voice-bridge-test.tsx", "./test-screens/index.tsx", "./source-destination.tsx"):
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

    def test_compiled_bundle_test_screen_path_fails(self):
        with tempfile.TemporaryDirectory() as d:
            routes = Path(d)
            (routes / "_layout.tsx").write_text("shipping")
            for marker in (b"src/test-screens/VoiceBridgeTestScreen.tsx", b"src/app/voice-bridge-test.tsx"):
                with self.subTest(marker=marker), self.assertRaises(ReleaseError):
                    verify.bundle_route_keys(b"./_layout.tsx\0" + marker, routes)

    def test_capture_metadata_refused_in_every_binary_even_when_stripped(self):
        header = struct.pack("<8I", 0xfeedfacf, 0, 0, 0, 0, 0, 0, 0)
        for name in ("OPAX", "Frameworks/Test.framework/Test", "PlugIns/Test.appex/Test"):
            for marker in (b"_OBJC_CLASS_$_AVCaptureVideoDataOutput", b"AVCaptureSession", b"AVCaptureDevice"):
                with self.subTest(name=name, marker=marker), tempfile.TemporaryDirectory() as d:
                    app = Path(d)
                    (app / "OPAX").write_bytes(header + b"shipping code")
                    path = app / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(header + marker)
                    with self.assertRaisesRegex(ReleaseError, "No camera capture references"):
                        verify.verify_no_camera_native_code(app)
        self.assertTrue(verify.no_camera_native_symbols(b"AVAudioSession OpaxVoiceCore"))

    def test_voice_and_microphone_symbols_are_refused(self):
        self.assertTrue(verify.no_voice_native_symbols(b"_OBJC_CLASS_$_EXExpoAppSceneDelegate"))
        for symbol in (b"_$s13OpaxVoiceCore", b"_OBJC_CLASS_$_OpaxVoiceModule", b"_requestRecordPermission"):
            self.assertFalse(verify.no_voice_native_symbols(symbol))

    def test_stripped_voice_bytes_refused_in_executable_framework_and_plugin(self):
        # No LC_SYMTAB: a symbol-table-only check has nothing to inspect.
        header = struct.pack("<8I", 0xfeedfacf, 0, 0, 0, 0, 0, 0, 0)
        for name in ("OPAX", "Frameworks/Test.framework/Test", "PlugIns/Test.appex/Test"):
            for marker in (b"13OpaxVoiceCore", b"OpaxVoiceModule", b"requestRecordPermission"):
                with self.subTest(name=name, marker=marker), tempfile.TemporaryDirectory() as d:
                    app = Path(d)
                    (app / "OPAX").write_bytes(header + b"shipping code")
                    path = app / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(header + marker)
                    with self.assertRaisesRegex(ReleaseError, "No voice or microphone permission code"):
                        verify.verify_no_voice_native_code(app)

    def test_voice_scan_excludes_only_signatures_in_thin_and_fat_macho(self):
        for endian in ("<", ">"):
            for words in (7, 8):
                header_size = words * 4
                header = struct.pack(endian + str(words) + "I", 0xfeedface if words == 7 else 0xfeedfacf,
                                     0, 0, 0, 1, 16, *([0] * (words - 6)))
                code = b"shipping code"
                signature = b"OpaxVoiceCore requestRecordPermission"
                command = struct.pack(endian + "4I", 0x1d, 16, header_size + 16 + len(code), len(signature))
                thin = header + command + code + signature
                for fat_magic, entry_size in ((0xcafebabe, 20), (0xcafebabf, 32)):
                    start = 8 + entry_size
                    entry = struct.pack(">5I", 0, 0, start, len(thin), 0) if entry_size == 20 else \
                        struct.pack(">2I2Q2I", 0, 0, start, len(thin), 0, 0)
                    fat = struct.pack(">2I", fat_magic, 1) + entry + thin
                    for body in (thin, fat):
                        with self.subTest(endian=endian, words=words, fat=fat_magic), tempfile.TemporaryDirectory() as d:
                            app = Path(d)
                            (app / "OPAX").write_bytes(body)
                            self.assertEqual(verify.verify_no_voice_native_code(app), ["OPAX"])
                            (app / "OPAX").write_bytes(body.replace(code, b"OpaxVoiceCore"))
                            with self.assertRaises(ReleaseError):
                                verify.verify_no_voice_native_code(app)

    @unittest.skipUnless(os.environ.get("OPAX_TEST_PRODUCTION_ARCHIVE"), "Retained production archive not supplied")
    def test_real_production_archive_has_no_voice_code(self):
        self.assertTrue(verify.verify_no_voice_native_code(Path(os.environ["OPAX_TEST_PRODUCTION_ARCHIVE"])))

    @unittest.skipUnless(os.environ.get("OPAX_TEST_STRIPPED_VOICE_BINARY"), "Stripped voice binary not supplied")
    def test_real_stripped_voice_binary_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "OPAX"
            path.write_bytes(Path(os.environ["OPAX_TEST_STRIPPED_VOICE_BINARY"]).read_bytes())
            with self.assertRaisesRegex(ReleaseError, "No voice or microphone permission code"):
                verify.verify_no_voice_native_code(Path(d))
    @staticmethod
    def routes_with(directory, keys):
        routes = Path(directory)
        for key in keys:
            path = routes / key
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("source route")
        return routes

    def test_drawn_diagnostics_are_refused_in_production_string_entries(self):
        for marker in (b"-drawn-", b"testDrawnText", b"drawnTextClipped"):
            for entry in (marker, b"prefix" + marker + b"suffix"):
                with self.subTest(marker=marker, entry=entry):
                    bundle = hermes_bundle(entry, [packed(entry, entry)])
                    with self.assertRaisesRegex(ReleaseError, "no e2e drawn-line diagnostics"):
                        verify.verify_no_drawn_diagnostics(bundle)
            with self.subTest(plain=marker), self.assertRaises(ReleaseError):
                verify.verify_no_drawn_diagnostics(b"plain JS " + marker)

    def test_drawn_diagnostics_check_reads_entries_and_fails_closed(self):
        storage = b"shipping-drawn-testDrawnTextdrawnTextClipped"
        bundle = hermes_bundle(storage, [packed(storage, b"shipping")])
        self.assertEqual(verify.verify_no_drawn_diagnostics(bundle), 1)
        with self.assertRaises(ReleaseError):
            verify.verify_no_drawn_diagnostics(bundle[:-1])

    def test_e2e_launch_flags_are_refused_in_production_string_entries(self):
        for entry in (b"OPAXWelcomeTour", b"-OPAXWelcomeTour on"):
            with self.subTest(entry=entry):
                bundle = hermes_bundle(entry, [packed(entry, entry)])
                with self.assertRaisesRegex(ReleaseError, "no e2e launch arguments"):
                    verify.verify_no_e2e_launch_flags(bundle)
        with self.assertRaises(ReleaseError):
            verify.verify_no_e2e_launch_flags(b"plain JS OPAXWelcomeTour")
        # Today's capture fixture, including the plate's draw switch.
        for flag in (b"OPAXSeat", b"OPAXEditionCache", b"OPAXEditionAge",
                     b"OPAXWelcomeDeclined", b"OPAXPlateDraw", b"OPAXVicElection"):
            with self.subTest(flag=flag):
                bundle = hermes_bundle(flag, [packed(flag, flag)])
                with self.assertRaisesRegex(ReleaseError, "no e2e launch arguments"):
                    verify.verify_no_e2e_launch_flags(bundle)
                with self.assertRaises(ReleaseError):
                    verify.verify_no_e2e_launch_flags(b"plain JS " + flag)
        storage = b"shippingOPAXWelcomeTour"
        bundle = hermes_bundle(storage, [packed(storage, b"shipping")])
        self.assertEqual(verify.verify_no_e2e_launch_flags(bundle), 1)

    def test_community_is_refused_in_production_string_entries(self):
        for marker in (b"Your display name and bio are public", b"Community route refused",
                       b"./community/[view].tsx"):
            for entry in (marker, b"prefix " + marker + b"."):
                with self.subTest(marker=marker, entry=entry):
                    bundle = hermes_bundle(entry, [packed(entry, entry)])
                    with self.assertRaisesRegex(ReleaseError, "no Community"):
                        verify.verify_no_community(bundle)
            with self.subTest(plain=marker), self.assertRaises(ReleaseError):
                verify.verify_no_community(b"plain JS " + marker)
        # Shared words stay: the Account row's ID and "Community" as a word.
        storage = b"account-communityCommunity"
        bundle = hermes_bundle(storage, [packed(storage, b"account-community"), packed(storage, b"Community")])
        self.assertEqual(verify.verify_no_community(bundle), 2)
        with self.assertRaises(ReleaseError):
            verify.verify_no_community(bundle[:-1])

    def test_source_preview_ids_are_refused_in_production_string_entries(self):
        self.assertIn(b"source-destination-ok", [i.encode() for i in verify.E2E_SOURCE_PREVIEW_IDS])
        for marker in (b"source-destination-url", b"source-destination-scroll", b"source-destination-ok"):
            for entry in (marker, b"prefix" + marker + b"suffix"):
                with self.subTest(marker=marker, entry=entry):
                    bundle = hermes_bundle(entry, [packed(entry, entry)])
                    with self.assertRaisesRegex(ReleaseError, "no e2e source preview test IDs"):
                        verify.verify_no_source_preview_ids(bundle)
            with self.subTest(plain=marker), self.assertRaises(ReleaseError):
                verify.verify_no_source_preview_ids(b"plain JS " + marker)

    def test_source_preview_check_allows_the_route_name_and_fails_closed(self):
        # The root layout ships the route name, switched off at runtime.
        storage = b"source-destination./_layout.tsx"
        bundle = hermes_bundle(storage, [packed(storage, b"source-destination"), packed(storage, b"./_layout.tsx")])
        self.assertEqual(verify.verify_no_source_preview_ids(bundle), 2)
        with self.assertRaises(ReleaseError):
            verify.verify_no_source_preview_ids(bundle[:-1])

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

    def test_truncated_hermes_header_cannot_fall_back_to_plain_js(self):
        magic = struct.pack("<Q", verify.HERMES_MAGIC)
        with tempfile.TemporaryDirectory() as d:
            routes = self.routes_with(d, ["./talk.tsx"])
            for size in (8, 12, verify.HERMES_HEADER_SIZE - 1):
                body = (magic + b"\0./talk.tsx\0" + bytes(verify.HERMES_HEADER_SIZE))[:size]
                with self.subTest(size=size), self.assertRaisesRegex(ReleaseError, "Hermes.*header is truncated"):
                    verify.hermes_strings(body)
                with self.subTest(route_size=size), self.assertRaisesRegex(ReleaseError, "Hermes.*header is truncated"):
                    verify.bundle_route_keys(body, routes)
        self.assertIsNone(verify.hermes_strings(b"plain"))

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
            argv = ["verify", str(directory / "OPAX.app"), "--kind", "archive", "--version", "1.0.0",
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
        # camelCase app identifiers that merely contain "sentry" are not the SDK (build 15 false positive).
        for safe in (b"ReportsEntry", b"ignoreAllLogsENTRY_EXIT"):
            self.assertFalse(verify.SDK_PATTERN.search(safe), safe)
        for sdk in (b"@sentry/react-native", b"RNSentry", b"io.sentry.android", b"Sentry", b"SentrySDK"):
            self.assertTrue(verify.SDK_PATTERN.search(sdk), sdk)
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

    def test_reviewed_posthog_sdk_strings_only(self):
        # posthog-react-native's bare default hosts, its docs links and its bot
        # list pass; any PostHog endpoint or other host is still a plant.
        for entry in (b"https://us.i.posthog.com", b"https://eu-assets.i.posthog.com",
                      b"Learn more at https://posthog.com/docs/feature-flags/best-practices", b"sentryuptimebot",
                      b"PostHog", b"posthog-react-native"):
            with self.subTest(entry=entry):
                self.assertFalse(verify.has_analytics(entry))
        for entry in (b"https://us.i.posthog.com/i/v0/e/", b"https://app.posthog.com", b"https://posthog.com/capture",
                      b"see https://posthog.com/docs/x and https://us.posthog.com/e", b"https://example.posthog.com"):
            with self.subTest(entry=entry):
                self.assertTrue(verify.has_analytics(entry))
        self.assertEqual(verify.ANALYTICS_CONFIG["host"], "https://opax.com.au/ingest")

    def test_svg_amplitude_attribute_is_not_the_amplitude_sdk(self):
        # react-native-svg's FeComponentTransferFunction ships the bare SVG
        # attribute name; the SDK's markers and hosts are still refused.
        self.assertFalse(verify.has_analytics(b"amplitude"))
        for entry in (b"@amplitude/analytics-react-native", b"AmplitudeClient", b"amplitudeApiKey",
                      b"https://api2.amplitude.com/2/httpapi", b"https://cdn.amplitude.com/libs/x.js"):
            with self.subTest(entry=entry):
                self.assertTrue(verify.has_analytics(entry))

    def test_analytics_check_reads_hermes_entries_and_still_refuses_sdk_and_host_plants(self):
        storage = b"ignoreAllLogsENTRY_EXIT"
        safe = hermes_bundle(storage, [packed(storage, entry) for entry in (b"ignoreAllLogs", b"ENTRY_EXIT")])
        self.assertFalse(verify.has_analytics(safe))
        for entry in (b"sentry", b"https://us.i.posthog.com/capture", b"HTTPS://API.HEAP.IO/track"):
            with self.subTest(entry=entry):
                self.assertTrue(verify.has_analytics(hermes_bundle(entry, [packed(entry, entry)])))
        with self.assertRaises(ReleaseError):
            verify.has_analytics(safe[:-1])

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


class ProductionVoiceTests(unittest.TestCase):
    def info(self):
        return {"NSMicrophoneUsageDescription": verify.VOICE_POLICY["microphonePurpose"],
                "OPAXProductionVoiceEnabled": True, "OPAXVoiceConsentDefault": False,
                "OPAXVoiceAllowedRoutes": verify.VOICE_POLICY["routes"]}

    def manifest(self):
        # The voice label's linked App Functionality types; Product Interaction
        # also carries Analytics, and analytics adds an unlinked Device ID.
        function, analytics = "NSPrivacyCollectedDataTypePurposeAppFunctionality", "NSPrivacyCollectedDataTypePurposeAnalytics"
        rows = [{"NSPrivacyCollectedDataType": "NSPrivacyCollectedDataType" + name,
                 "NSPrivacyCollectedDataTypeLinked": True, "NSPrivacyCollectedDataTypeTracking": False,
                 "NSPrivacyCollectedDataTypePurposes": [function, analytics] if name == "ProductInteraction" else [function]}
                for name in verify.VOICE_POLICY["linkedDataTypes"]]
        rows.append({"NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeDeviceID",
                     "NSPrivacyCollectedDataTypeLinked": False, "NSPrivacyCollectedDataTypeTracking": False,
                     "NSPrivacyCollectedDataTypePurposes": [analytics]})
        # Crash reports add unlinked Crash Data; their Other Diagnostic Data is
        # already in the label, linked, for App Functionality.
        rows.append({"NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeCrashData",
                     "NSPrivacyCollectedDataTypeLinked": False, "NSPrivacyCollectedDataTypeTracking": False,
                     "NSPrivacyCollectedDataTypePurposes": [function]})
        return {"NSPrivacyTracking": False, "NSPrivacyCollectedDataTypes": rows,
            "NSPrivacyAccessedAPITypes": [{"NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults",
                                         "NSPrivacyAccessedAPITypeReasons": ["CA92.1"]}]}

    def native_body(self):
        return struct.pack("<8I", 0xfeedfacf, 0, 0, 0, 0, 0, 0, 0) + b"\0".join((
            b"OpaxVoiceModule", b"OpaxVoiceCore", b"StoredVoiceConsent", b"opax.voice.consent.v1",
            b"OPAXProductionVoiceEnabled", b"OPAXVoiceAllowedRoutes", b"requestRecordPermission"))

    def test_switch_defaults_on_and_rejects_invalid_values(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertTrue(verify.production_voice_enabled())
        self.assertFalse(verify.production_voice_enabled("0"))
        self.assertTrue(verify.production_voice_enabled("1"))
        for value in ("", "true", "2"):
            with self.assertRaises(ReleaseError): verify.production_voice_enabled(value)

    def test_both_purpose_modes_and_on_device_location(self):
        verify.verify_voice_info({}, False)
        verify.verify_voice_info(self.info(), True)
        for enabled, info in ((False, {}), (True, self.info())):
            info["NSLocationWhenInUseUsageDescription"] = verify.location_purposes()["NSLocationWhenInUseUsageDescription"]
            verify.verify_voice_info(info, enabled)
        for enabled, info in ((True, {}), (False, self.info())):
            with self.assertRaises(ReleaseError): verify.verify_voice_info(info, enabled)

    def test_unused_motion_purpose_is_refused_in_both_voice_modes(self):
        for enabled in (False, True):
            info = self.info() if enabled else {}
            verify.verify_voice_info(info, enabled)
            for key, value in (("NSMotionUsageDescription", "unused motion"),
                               ("NSCameraUsageDescription", "unshipped"),
                               ("NSLocationAlwaysUsageDescription", verify.location_purposes()["NSLocationWhenInUseUsageDescription"])):
                with self.subTest(enabled=enabled, key=key), self.assertRaises(ReleaseError):
                    verify.verify_voice_info({**info, key: value}, enabled)

    def test_both_device_location_prompts_match_app_config(self):
        purposes = verify.location_purposes()
        self.assertEqual(set(purposes), {"NSLocationWhenInUseUsageDescription",
                                        "NSLocationWhenInUseUsageDescription~ipad"})
        verify.verify_location_info(purposes)
        for enabled in (False, True):
            info = {**(self.info() if enabled else {}), **purposes}
            verify.verify_voice_info(info, enabled)
            for key in purposes:
                with self.subTest(key=key, enabled=enabled):
                    with self.assertRaises(ReleaseError):
                        verify.verify_location_info({**info, key: "old prompt"})
                    with self.assertRaises(ReleaseError):
                        verify.verify_voice_info({**info, key: "old prompt"}, enabled)
                    with self.assertRaises(ReleaseError):
                        verify.verify_location_info({k: v for k, v in info.items() if k != key})

    def test_wrong_purpose_routes_auto_consent_and_fixture_metadata_fail(self):
        for key, value in (("NSMicrophoneUsageDescription", "draft"), ("OPAXVoiceConsentDefault", True),
                           ("OPAXVoiceAllowedRoutes", verify.VOICE_POLICY["routes"] + ["POST /api/ask"]),
                           ("OPAXProductionVoiceEnabled", False), ("OPAXVoiceFixturePort", 8923),
                           ("NSCameraUsageDescription", "unshipped")):
            info = {**self.info(), key: value}
            with self.subTest(key=key), self.assertRaises(ReleaseError): verify.verify_voice_info(info, True)

    def test_privacy_exact_types_linkage_tracking_purpose_and_reasons(self):
        self.assertEqual(verify.VOICE_POLICY["unlinkedDataTypes"], [])
        self.assertEqual(verify.VOICE_POLICY["linkedDataTypes"], [
            "EmailAddress", "UserID", "AudioData", "OtherUserContent", "ProductInteraction",
            "SearchHistory", "OtherDiagnosticData"])
        verify.verify_voice_privacy(self.manifest())
        # The label moved IP addresses to Diagnostics and has no messages
        # without Community: the old and the Community-only types both fail.
        for name in ("OtherDataTypes", "EmailsOrTextMessages"):
            changed = self.manifest()
            changed["NSPrivacyCollectedDataTypes"].append({
                **changed["NSPrivacyCollectedDataTypes"][0], "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataType" + name})
            with self.subTest(added=name), self.assertRaises(ReleaseError):
                verify.verify_voice_privacy(changed)
        for policy in ({**verify.VOICE_POLICY, "linkedDataTypes": [*verify.LABEL_DATA_TYPES[:-1], "OtherDataTypes"]},
                       {**verify.VOICE_POLICY, "linkedDataTypes": [*verify.LABEL_DATA_TYPES, "EmailsOrTextMessages"]}):
            with self.subTest(policy=policy["linkedDataTypes"][-1]), patch.object(verify, "VOICE_POLICY", policy), \
                    self.assertRaisesRegex(ReleaseError, "privacy label"):
                verify.verify_voice_privacy(self.manifest())
        for key, value in (("NSPrivacyTracking", True), ("NSPrivacyTrackingDomains", ["foreign.test"]),
                           ("NSPrivacyAccessedAPITypes", []), ("NSPrivacyCollectedDataTypes", [])):
            with self.subTest(key=key), self.assertRaises(ReleaseError):
                verify.verify_voice_privacy({**self.manifest(), key: value})
        for key, value in (("NSPrivacyCollectedDataTypeLinked", False), ("NSPrivacyCollectedDataTypeTracking", True),
                           ("NSPrivacyCollectedDataTypePurposes", ["NSPrivacyCollectedDataTypePurposeAnalytics"]),
                           ("NSPrivacyCollectedDataType", "NSPrivacyCollectedDataTypePreciseLocation")):
            changed = self.manifest(); changed["NSPrivacyCollectedDataTypes"][0][key] = value
            with self.subTest(key=key), self.assertRaises(ReleaseError): verify.verify_voice_privacy(changed)

    def test_analytics_types_alone_without_voice(self):
        analytics = "NSPrivacyCollectedDataTypePurposeAnalytics"
        function = "NSPrivacyCollectedDataTypePurposeAppFunctionality"
        def manifest(**change):
            return {"NSPrivacyTracking": False, "NSPrivacyCollectedDataTypes": [
                {"NSPrivacyCollectedDataType": "NSPrivacyCollectedDataType" + name,
                 "NSPrivacyCollectedDataTypeLinked": False, "NSPrivacyCollectedDataTypeTracking": False,
                 "NSPrivacyCollectedDataTypePurposes": [purpose], **change}
                for name, purpose in (("ProductInteraction", analytics), ("DeviceID", analytics),
                                      ("CrashData", function), ("OtherDiagnosticData", function))]}
        verify.verify_collected_types(manifest(), False)
        # Crash reports must be declared: the analytics types alone now fail.
        without_crashes = manifest()
        without_crashes["NSPrivacyCollectedDataTypes"] = without_crashes["NSPrivacyCollectedDataTypes"][:2]
        with self.assertRaises(ReleaseError):
            verify.verify_collected_types(without_crashes, False)
        for change in ({"NSPrivacyCollectedDataTypeLinked": True}, {"NSPrivacyCollectedDataTypeTracking": True},
                       {"NSPrivacyCollectedDataTypePurposes": [analytics, "NSPrivacyCollectedDataTypePurposeThirdPartyAdvertising"]}):
            with self.subTest(change=change), self.assertRaises(ReleaseError):
                verify.verify_collected_types(manifest(**change), False)
        with self.assertRaises(ReleaseError):
            verify.verify_collected_types({"NSPrivacyTracking": False, "NSPrivacyCollectedDataTypes": []}, False)
        with self.assertRaises(ReleaseError):
            verify.verify_collected_types(manifest(), True)

    def test_voice_routes_required_as_whole_hermes_entries_in_on_mode(self):
        parts = [b"./talk.tsx", b"./account/index.tsx", b"./account/sign-in.tsx", b"./account/delete.tsx",
                 b"talk-consent", b"account-sign-in-start"]
        keys = b"".join(parts)
        body = hermes_bundle(keys, [packed(keys, part) for part in parts])
        verify.verify_voice_bundle(body, True)
        verify.verify_voice_bundle(b"catalog only", False)
        for bad in (b"./talk.tsx\0", b"./talk.tsx.workbench.tsx\0./account/index.tsx\0"):
            with self.assertRaises(ReleaseError): verify.verify_voice_bundle(bad, True)

    def test_fixture_material_stays_forbidden_in_both_modes(self):
        for enabled in (False, True):
            for marker in (b"happy@example.invalid", b"arbitrary@example.invalid", b"voice-bridge-test", b"/__fixture/voice"):
                with self.subTest(enabled=enabled, marker=marker), self.assertRaises(ReleaseError):
                    verify.verify_voice_bundle(b"./talk.tsx\0./account/index.tsx\0" + marker, enabled)

    def test_both_pods_consent_and_permission_required_without_native_fixtures(self):
        with tempfile.TemporaryDirectory() as d:
            app = Path(d); binary = app / "OPAX"
            body = self.native_body(); binary.write_bytes(body)
            verify.verify_voice_native_code(app)
            with self.assertRaises(ReleaseError): verify.verify_no_voice_native_code(app)
            for marker in (b"OpaxVoiceModule", b"OpaxVoiceCore", b"StoredVoiceConsent", b"requestRecordPermission"):
                binary.write_bytes(body.replace(marker, b"missing"))
                with self.subTest(marker=marker), self.assertRaises(ReleaseError): verify.verify_voice_native_code(app)
            for marker in (b"DebugSyntheticEngineFactory", b"OPAXVoiceFixturePort", b"http://127.0.0.1:8923", b"test@example.invalid"):
                binary.write_bytes(body + marker)
                with self.subTest(marker=marker), self.assertRaises(ReleaseError): verify.verify_voice_native_code(app)


class CrashSymbolKeyTests(unittest.TestCase):
    """scripts/upload-crash-symbols.sh loads ~/.config/opax/posthog.env itself,
    inside the upload only, and never prints the key. Every key here is invented;
    a stub posthog-cli records its arguments and environment variable names,
    never a value except the project and host, which are not secret."""
    script = Path(__file__).resolve().parent / "upload-crash-symbols.sh"
    chunk = "896a182b-d6a3-4253-bc6b-150f6ce96357"
    key = "phx_INVENTED_UPLOAD_KEY_7f3a9c0d"
    personal = "phx_INVENTED_PERSONAL_KEY_51d2e8aa"
    host = "https://us.posthog.example"
    skip_line = "Crash symbols: POSTHOG_CLI_API_KEY is not set; skipped the PostHog upload for ios 1.0.1 (40)."

    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        self.home = root / "home"
        self.key_file = self.home / ".config/opax/posthog.env"
        self.key_file.parent.mkdir(parents=True)
        self.evidence = root / "evidence"
        self.evidence.mkdir()
        (self.evidence / "main.jsbundle.map").write_text(json.dumps({"version": 3, "sources": [], "mappings": ""}))
        (self.evidence / "ios.chunk-id").write_text(self.chunk + "\n")
        self.archive = root / "OPAX.xcarchive"
        (self.archive / "dSYMs/OPAX.app.dSYM").mkdir(parents=True)
        self.bin = root / "bin"
        self.bin.mkdir()
        self.calls = self.bin / "calls.jsonl"
        stub = self.bin / "posthog-cli"
        stub.write_text(f"#!{sys.executable}\n" + "\n".join((
            "import json, os, sys",
            "record = {'args': sys.argv[1:], 'names': sorted(os.environ),",
            "          'project': os.environ.get('POSTHOG_CLI_PROJECT_ID'), 'host': os.environ.get('POSTHOG_CLI_HOST')}",
            "with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'calls.jsonl'), 'a') as stream:",
            "    stream.write(json.dumps(record) + '\\n')", "")))
        stub.chmod(0o755)
        # Another user's file: `id -u` answers a uid that owns nothing here.
        self.foreign = root / "foreign"
        self.foreign.mkdir()
        (self.foreign / "id").write_text('#!/bin/sh\n[ "$1" = -u ] && { echo 4242; exit 0; }\nexec /usr/bin/id "$@"\n')
        (self.foreign / "id").chmod(0o755)

    def write_key_file(self, mode=0o600, body=None, **changes):
        values = {"POSTHOG_PERSONAL_API_KEY": self.personal, "POSTHOG_CLI_TOKEN": self.key,
                  "POSTHOG_HOST": self.host, "POSTHOG_CLI_API_KEY": self.key, "POSTHOG_PROJECT_ID": "507367", **changes}
        self.key_file.write_text(body or "".join(f"export {name}={value}\n" for name, value in values.items()))
        self.key_file.chmod(mode)

    def env(self, path=(), **extra):
        env = {name: value for name, value in os.environ.items() if not name.startswith("POSTHOG_")}
        env.update(HOME=str(self.home), PATH=os.pathsep.join([*map(str, path), str(self.bin), env.get("PATH", "")]))
        env.update(extra)
        return env

    def command(self, trace=False):
        return ["bash", *(["-x"] if trace else []), str(self.script),
                "ios", "1.0.1", "40", str(self.evidence), str(self.archive)]

    def upload(self, trace=False, path=(), **extra):
        return subprocess.run(self.command(trace), capture_output=True, text=True,
                              env=self.env(path, **extra), timeout=120)

    def stub_calls(self):
        if not self.calls.exists():
            return []
        return [json.loads(line) for line in self.calls.read_text().splitlines()]

    def assert_uploaded(self, result, host):
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.stub_calls()
        self.assertEqual([call["args"][:2] for call in calls], [["hermes", "upload"], ["dsym", "upload"]])
        for call in calls:
            self.assertEqual(call["project"], "507367")
            self.assertEqual(call["host"], host)
            self.assertIn("POSTHOG_CLI_API_KEY", call["names"])
        self.assertTrue(result.stdout.splitlines()[-1].startswith("Crash symbols: uploaded ios 1.0.1 (40)"))
        return calls

    def assert_not_uploaded(self, result, code, line):
        self.assertEqual(result.returncode, code, result.stderr)
        output = (result.stdout + result.stderr).splitlines()
        self.assertEqual(len(output), 1, output)
        self.assertIn(line, output[0])
        self.assertEqual(self.stub_calls(), [])

    def needs_node(self):
        if not shutil.which("node"):
            self.skipTest("the upload stages the source map with node")

    def test_a_private_key_file_uploads_to_the_opax_project(self):
        self.needs_node()
        self.write_key_file()
        self.assert_uploaded(self.upload(), self.host)

    def test_a_key_or_host_the_caller_set_wins_over_the_file(self):
        self.needs_node()
        # A preset key leaves the file unread, even a loose one.
        self.write_key_file(mode=0o644)
        calls = self.assert_uploaded(self.upload(POSTHOG_CLI_API_KEY="phx_INVENTED_CALLER_KEY"), None)
        self.assertNotIn("POSTHOG_PERSONAL_API_KEY", calls[0]["names"])
        self.calls.unlink()
        self.write_key_file()
        self.assert_uploaded(self.upload(POSTHOG_CLI_HOST="https://eu.posthog.example"), "https://eu.posthog.example")

    def test_without_the_file_it_skips_with_one_line(self):
        result = self.upload()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((result.stdout + result.stderr).splitlines(), [self.skip_line])
        self.assertEqual(self.stub_calls(), [])

    def test_a_loose_or_foreign_key_file_is_refused(self):
        for mode, path in ((0o644, ()), (0o640, ()), (0o600, (self.foreign,))):
            with self.subTest(mode=oct(mode), foreign=bool(path)):
                self.write_key_file(mode=mode)
                self.assert_not_uploaded(self.upload(path=path), 0, "posthog.env must be mode 600 and yours; skipped")

    def test_another_project_is_refused(self):
        cases = (("the file's POSTHOG_PROJECT_ID", {"POSTHOG_PROJECT_ID": "999999"}, {}),
                 ("the caller's POSTHOG_CLI_PROJECT_ID", {}, {"POSTHOG_CLI_PROJECT_ID": "999999"}),
                 ("the file's POSTHOG_CLI_PROJECT_ID", {"POSTHOG_CLI_PROJECT_ID": "0507367"}, {}))
        for label, in_file, from_caller in cases:
            with self.subTest(label):
                self.write_key_file(**in_file)
                name = next(iter({**in_file, **from_caller}))
                self.assert_not_uploaded(self.upload(**from_caller), 1, f"{name} is not the OPAX project (507367); refused")

    def test_the_key_never_reaches_output_or_the_log(self):
        self.needs_node()
        secrets = (self.key, self.personal)
        self.write_key_file()
        # xtrace on from the start, as `bash -x` would run it during debugging.
        result = self.upload(trace=True)
        self.assert_uploaded(result, self.host)
        for secret in secrets:
            self.assertNotIn(secret, result.stdout + result.stderr)
        # The silent load hides the file's own lines from a stderr trace, but a
        # trace sent elsewhere (BASH_XTRACEFD) would not be: xtrace is off there.
        for traced in (f". {self.key_file}", "HAVE_KEY="):
            self.assertNotIn(traced, result.stderr)
        # The release log: the parent never holds the key, so it cannot redact it.
        self.assertFalse(any(secret in os.environ.values() for secret in secrets))
        log = self.evidence / "crash-symbols.log"
        run_logged(self.command(trace=True), log, env=self.env())
        self.assertIn("Crash symbols: uploaded ios 1.0.1 (40)", log.read_text())
        for secret in secrets:
            self.assertNotIn(secret, log.read_text())
        # A malformed file makes the shell name the stray word; that stays hidden.
        self.calls.unlink()
        self.write_key_file(body=f"export POSTHOG_PROJECT_ID=507367\nPOSTHOG_CLI_API_KEY= {self.key}\n")
        result = self.upload(trace=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn("could not load", result.stderr)
        self.assertNotIn(self.key, result.stdout + result.stderr)


from test_android_release import AndroidReleaseTests


if __name__ == "__main__":
    unittest.main()
