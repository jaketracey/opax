#!/usr/bin/env python3
"""Tests for step_tails.py: what a failed step's log may show in the public status.

    python3 -m unittest scripts/vm/test_step_tails.py -v
"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.parse
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "step_tails.py"
spec = importlib.util.spec_from_file_location("step_tails", SCRIPT)
st = importlib.util.module_from_spec(spec)
spec.loader.exec_module(st)

R2_ID = "AKIAIOSFODNN7OPAXKEY"
R2_SECRET = "wJalrXUtnFEMI/K7MDENG+bPxRfiCYzOPAXSECRET9"
R2_ENDPOINT = "https://0f1e2d3c4b5a69788796a5b4c3d2e1f0.r2.cloudflarestorage.com"
KB_TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJvcGF4LWtiIn0.c2lnbmF0dXJlLW9wYXgtdGVzdA"
OA_KEY = "Ha7QmZpX2vEwRt9LkNcB4sYd"
TVFY_KEY = "q8+Zr/2LmX0pT5vKc9=="
ENV = {"OPAX_R2_ACCESS_KEY_ID": R2_ID, "OPAX_R2_SECRET_ACCESS_KEY": R2_SECRET, "OPAX_R2_ENDPOINT": R2_ENDPOINT,
       "ARAG_KB_TOKEN": KB_TOKEN, "TVFY_API_KEY": TVFY_KEY, "HOME": "/home/ubuntu", "PATH": "/usr/bin:/bin",
       "OPAX_SYNC_KB": "1"}


class Redaction(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)
        self.env_file = self.tmp / ".env"
        self.env_file.write_text(f'# keys\nARAG_KB_ID=kb-test\nOPENAUSTRALIA_API_KEY="{OA_KEY}"\n')
        self.secrets = st.known_secrets(ENV, [self.env_file])

    def red(self, line):
        return st.redact(line, self.secrets, ENV["HOME"])

    def test_known_values_are_replaced_raw_and_url_encoded_wherever_they_sit(self):
        for value in (R2_ID, R2_SECRET, R2_ENDPOINT, KB_TOKEN, OA_KEY, TVFY_KEY):
            for form in (value, urllib.parse.quote(value, safe=""), urllib.parse.quote_plus(value)):
                for line in (f"value {form} in prose", f"x={form}", f"['{form}']", f"https://h.example/p/{form}/q"):
                    self.assertNotIn(form, self.red(line), line)

    def test_a_value_from_an_env_file_is_a_secret_whatever_its_name(self):
        self.assertIn(OA_KEY, self.secrets)
        self.assertIn("kb-test", self.secrets)

    def test_plain_settings_are_not_treated_as_secrets(self):
        secrets = st.known_secrets({"OPAX_AUTH_MODE": "true", "API_KEY_COUNT": "1234567", "X_TOKEN": "abc"}, [])
        self.assertEqual(secrets, [])

    def test_shapes_are_masked_without_knowing_the_value(self):
        cases = {
            "Authorization: Bearer abcdefgh12345678": "abcdefgh12345678",
            'headers {"x-api-key": "zzzzzzzzzz"}': "zzzzzzzzzz",
            "password=hunter2pass next": "hunter2pass",
            "https://user:hunter2pass@host.example/path": "hunter2pass",
            "GET https://api.example/v1/items?key=abc&page=2 failed": "key=abc",
            "contact ops@example.com.au now": "ops@example.com.au",
            "from 203.0.113.7 port 443": "203.0.113.7",
            "peer 2001:db8:85a3:0:0:8a2e:370:7334 closed": "2001:db8:85a3",
            'File "/home/ubuntu/opax/x.py"': "/home/ubuntu",
            'File "/Users/someone/opax/x.py"': "someone",
            "commit 0e814be8a4f1c2d3e4f5a6b7c8d9e0f1a2b3c4d5": "0e814be8a4f1c2d3",
            "blob QWxhZGRpbjpvcGVuIHNlc2FtZSBhbmQgbW9yZQ== end": "QWxhZGRpbjpvcGVu",
            "aws wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY end": "bPxRfiCYEXAMPLEKEY",
        }
        for line, leak in cases.items():
            self.assertNotIn(leak, st.redact(line, [], "/home/ubuntu"), line)

    def test_what_explains_a_failure_survives(self):
        for line in ("requests.exceptions.HTTPError: 503 Server Error for url: https://data.gov.au/data/api/3/action/package_search",
                     "sqlite3.OperationalError: database is locked",
                     "2026-11-16 03:20:16 [ipea] FAIL(rc=1) in 14s; rows 1270429 -> 1270429 (+0)",
                     "KeyError: 'result'"):
            self.assertEqual(self.red(line), line)
        self.assertEqual(self.red('  File "/home/ubuntu/opax/parli/ingest/ipea_expenses.py", line 118, in discover_datasets'),
                         '  File "~/opax/parli/ingest/ipea_expenses.py", line 118, in discover_datasets')
        self.assertEqual(self.red("for url: https://data.gov.au/data/api/3/action/package_search?q=organization%3Aipea&rows=50"),
                         "for url: https://data.gov.au/data/api/3/action/package_search?[redacted]")

    def test_control_characters_and_long_lines_are_cut(self):
        self.assertNotIn("\x1b", self.red("\x1b[31mred\x1b[0m"))
        self.assertLessEqual(len(self.red("word " * 200)), st.MAX_LINE + len(" [cut]"))


class ReviewFindings(unittest.TestCase):
    """One test per finding of the 16 Nov 2026 review; every value here is made up."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)

    def test_p2a_an_env_file_value_with_quotes_and_a_trailing_comment_is_learned_as_bash_reads_it(self):
        env = self.tmp / ".env"
        env.write_text('TVFY_API_KEY="Wb7Nc3Kd9Fq2" # tvfy\nexport OA_ALT=Zx9Qw8Er7Ty6   # the spare\n'
                       "SINGLE='Qp4Lm8Rs2Vt6'#x\nBARE=Hd5Jk9Nx3Bz7\n")
        secrets = st.known_secrets({}, [env])
        for value in ("Wb7Nc3Kd9Fq2", "Zx9Qw8Er7Ty6", "Qp4Lm8Rs2Vt6", "Hd5Jk9Nx3Bz7"):
            self.assertIn(value, secrets)
        # shapes pass 2 does not know: only the learned value can mask these
        for line in ("retrying with Wb7Nc3Kd9Fq2 after 2 s", "sent [Zx9Qw8Er7Ty6]", "got Qp4Lm8Rs2Vt6."):
            self.assertNotRegex(st.redact(line, secrets), r"Wb7Nc3Kd9Fq2|Zx9Qw8Er7Ty6|Qp4Lm8Rs2Vt6", line)

    def test_p2a_the_environment_bash_dumped_is_taken_whole(self):
        dump = self.tmp / "env0"
        dump.write_bytes(b"TVFY_API_KEY=Wb7Nc3Kd9Fq2\0MULTI=first line\nSecond9Line7x\0PATH=/usr/bin:/bin\0HOME=/home/ubuntu\0SHLVL=1\0")
        secrets = st.known_secrets({}, [], [dump])
        self.assertIn("Wb7Nc3Kd9Fq2", secrets)
        self.assertIn("first line\nSecond9Line7x", secrets)
        self.assertNotIn("/usr/bin:/bin", secrets)
        self.assertNotIn("/home/ubuntu", secrets)
        self.assertEqual(st.known_secrets({}, [], [self.tmp / "missing"]), [])

    def test_p2a_a_quoted_or_bare_value_after_a_secret_name_is_masked_without_knowing_it(self):
        for line, leak in {
            "TvfyClient(api_key='Wb7Nc3Kd9Fq2')": "Wb7Nc3Kd9Fq2",
            'client(token="Wb7Nc3Kd9Fq2", retries=3)': "Wb7Nc3Kd9Fq2",
            "invalid key Wb7Nc3Kd9Fq2": "Wb7Nc3Kd9Fq2",
            "bad token Wb7Nc3Kd9Fq2 for the request": "Wb7Nc3Kd9Fq2",
            "secret=ab,cd;ef&gh9 next": "cd;ef",
            "password: 'two words, and; more&' tail": "more",
            '{"api_key": "Wb7Nc3Kd9Fq2"}': "Wb7Nc3Kd9Fq2",
        }.items():
            self.assertNotIn(leak, st.redact(line, []), line)
        for line in ("KeyError: 'result'", "the key steps are done", "token count 12", "keys: none found"):
            self.assertEqual(st.redact(line, []), line)

    def test_p3_every_usual_percent_encoding_of_a_known_value_is_replaced(self):
        value = "wJalrXUtnFEMI/K7MDENG+bPxRfiCYzOPAXSECRET9"
        secrets = st.known_secrets({"X_SECRET": value}, [])
        quoted = {urllib.parse.quote(value, safe=""), urllib.parse.quote(value), urllib.parse.quote_plus(value)}
        lowered = {st.re.sub(r"%[0-9A-F]{2}", lambda m: m.group(0).lower(), q) for q in quoted}
        for form in quoted | lowered | {value.replace("+", " ")}:
            out = st.redact(f"got <{form}> back", secrets)
            self.assertEqual(out, "got <[redacted]> back", form)

    def test_p3_a_password_holding_an_at_sign_leaves_no_tail_in_a_url(self):
        out = st.redact("proxy https://svc:p@ss@w0rd9Zx@proxy.example.gov.au/v1 refused", [])
        self.assertEqual(out, "proxy https://[redacted]@proxy.example.gov.au/v1 refused")

    def test_p3_a_bare_aws_access_key_id_is_masked(self):
        for key in ("AKIAIOSFODNN7OPAXKEY", "ASIAIOSFODNN7OPAXKEY"):
            self.assertEqual(st.redact(f"signing with {key} as the id", []), "signing with [redacted] as the id")
        self.assertEqual(st.redact("AKIAVALON is a word", []), "AKIAVALON is a word")

    def test_p3_only_a_regular_file_is_read_and_never_more_than_the_limit(self):
        pipe = self.tmp / "pipeline"
        pipe.mkdir()
        outside = self.tmp / "outside.txt"
        outside.write_text("not a step log\n")
        (pipe / "linked.log").symlink_to(outside)
        (pipe / "zero.log").symlink_to("/dev/zero")
        (pipe / "dir.log").mkdir()
        os.mkfifo(pipe / "fifo.log")
        (pipe / "real.log").write_text("a real line\n")
        started = time.monotonic()
        out = st.step_tails(pipe, ["linked", "zero", "dir", "fifo", "real"], {}, [])
        self.assertLess(time.monotonic() - started, 5)
        self.assertEqual(out, {"real": ["a real line"]})

    def test_p2b_many_failed_steps_stay_small_and_say_what_was_left_out(self):
        pipe = self.tmp / "pipeline"
        pipe.mkdir()
        names = [f"step{i}" for i in range(70)]
        for name in names:
            (pipe / f"{name}.log").write_text("".join("議会の記録 " * 22 + f"line {i}\n" for i in range(40)))
        out = st.step_tails(pipe, names, {}, [])
        self.assertLessEqual(len(json.dumps(out)), st.MAX_TOTAL + 200)
        self.assertLessEqual(len(out) - 1, st.MAX_STEPS)
        shown = len(out) - 1
        self.assertEqual(out["_omitted"], [f"{70 - shown} more failed step(s) not shown"])
        self.assertIn("step0", out)

    def test_p2b_the_tails_go_to_a_private_file(self):
        pipe = self.tmp / "pipeline"
        pipe.mkdir()
        (pipe / "ipea.log").write_text("boom\n")
        out = self.tmp / "tails.json"
        proc = subprocess.run([sys.executable, str(SCRIPT), "--pipe", str(pipe), "--out", str(out), "ipea"],
                              capture_output=True, text=True)
        self.assertEqual((proc.returncode, proc.stdout), (0, ""))
        self.assertEqual(json.loads(out.read_text()), {"ipea": ["boom"]})
        self.assertEqual(out.stat().st_mode & 0o777, 0o600)


class DeltaReviewFindings(unittest.TestCase):
    """One test per finding of the second review (16 Nov 2026); every value here is made up."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)

    def test_p2_an_all_digit_credential_of_eight_or_more_is_learned(self):
        env = self.tmp / ".env"
        env.write_text("DB_PIN=84726153\nRETRIES=1234567\nPORT=5432\n")
        secrets = st.known_secrets({}, [env])
        self.assertEqual(st.redact("connect('db', '84726153')", secrets), "connect('db', '[redacted]')")
        self.assertEqual(st.redact("after 1234567 rows on port 5432", secrets), "after 1234567 rows on port 5432")

    def test_p3_a_very_long_line_is_cut_before_it_is_redacted(self):
        started = time.monotonic()
        out = st.redact("a.b-c_d." * 8192, [])
        self.assertLess(time.monotonic() - started, 5)
        self.assertLessEqual(len(out), st.MAX_LINE + len(" [cut]"))

    def test_p3_a_known_value_that_is_a_key_word_does_not_unmask_an_assignment(self):
        secrets = st.known_secrets({}, [], []) + st.known_secrets({"GRANT_TYPE_TOKEN": "password"}, [])
        self.assertIn("password", secrets)
        for line in ("login password=Rt5Yh1 sent", "login password: 'Rt5Yh1'", '{"password": "Rt5Yh1"}'):
            self.assertNotIn("Rt5Yh1", st.redact(line, secrets), line)

    def test_p3_a_known_value_is_matched_as_json_or_repr_prints_it(self):
        value = 'Kq7"Zm\\4Wd9\'Xp2'
        secrets = st.known_secrets({"X_SECRET": value}, [])
        for printed in (json.dumps(value), repr(value), json.dumps({"v": value}), repr([value]), str({"v": value})):
            out = st.redact("payload " + printed, secrets)
            for piece in ("Kq7", "Zm", "4Wd9", "Xp2"):
                self.assertNotIn(piece, out, printed)

    def test_p3_each_line_of_a_multi_line_value_is_matched_on_its_own(self):
        value = "-----BEGIN FAKE KEY-----\nMIIfakeLineOne0123\nQq9fakeLineTwo4567\n-----END FAKE KEY-----"
        secrets = st.known_secrets({"X_PRIVATE_KEY": value}, [])
        for line in ("MIIfakeLineOne0123", "  Qq9fakeLineTwo4567", "key: MIIfakeLineOne0123\\nQq9fakeLineTwo4567"):
            out = st.redact(line, secrets)
            self.assertNotIn("fakeLineOne", out, line)
            self.assertNotIn("fakeLineTwo", out, line)

    def test_p3_the_credential_dump_is_removed_as_soon_as_it_is_used_and_stale_ones_are_swept(self):
        nightly = (SCRIPT.parent / "nightly.sh").read_text()
        body = nightly[nightly.index("\nwrite_status() {"):nightly.index("\nwrite_status_file() {")]
        self.assertLess(body.index('rm -f "$scratch/env0"'), body.index('write_status_file "$status"'))
        self.assertLess(nightly.index('rm -rf "$PIPE"/.status.*'), nightly.index("sync_repo; then"))
        self.assertLess(nightly.index("flock -n 8"), nightly.index('rm -rf "$PIPE"/.status.*'))


class ThirdReviewFindings(unittest.TestCase):
    """The ordering regression and the cut found in the third review; every value here is made up."""

    def test_p2_a_known_value_holding_a_space_quote_or_symbol_is_masked_whole(self):
        cases = {
            "correct horse battery9": ("password=correct horse battery9", "password=[redacted]"),
            "Wb7Nc3Kd9Fq2!Zx$81": ("invalid key Wb7Nc3Kd9Fq2!Zx$81", "invalid key [redacted]"),
            'pa"ss\\wo rd9!': ('{"password": "pa\\"ss\\\\wo rd9!"}', '{"password": "[redacted]"}'),
        }
        for value, (line, want) in cases.items():
            secrets = st.known_secrets({"X_SECRET": value}, [])
            out = st.redact(line, secrets)
            self.assertTrue(out.startswith(want[:want.index("[redacted]")].rstrip('"')), out)
            for piece in ("horse", "battery9", "Zx$81", "!Zx", 'pa\\"', "wo rd9", "rd9!"):
                self.assertNotIn(piece, out, line)

    def test_p2_a_known_value_before_a_colon_that_is_not_an_assignment_is_still_masked(self):
        secrets = st.known_secrets({"X_SECRET": "Wb7Nc3Kd9Fq2"}, [])
        self.assertEqual(st.redact("sent Wb7Nc3Kd9Fq2: refused", secrets), "sent [redacted]: refused")
        self.assertEqual(st.redact("Wb7Nc3Kd9Fq2=1", secrets), "[redacted]=1")

    def test_p3_the_start_of_a_known_value_at_the_cut_is_masked(self):
        secrets = st.known_secrets({"X_SECRET": "Wb7Nc3Kd9Fq2"}, [])
        line = 'token="' + "a" * (st.PRE_CUT - 23) + '" then Wb7Nc3Kd9Fq2 and more'
        self.assertEqual(line[:st.PRE_CUT][-9:], "Wb7Nc3Kd9")   # the cut falls inside the value
        out = st.redact(line, secrets)
        self.assertEqual(out, "token=[redacted] then [redacted]")
        # an ordinary long line that merely ends at the cut is not eaten
        plain = st.redact("word " * 2000, secrets)
        self.assertTrue(plain.startswith("word word") and "[redacted]" not in plain)


class OneMergeOfSpans(unittest.TestCase):
    """Fourth review: the passes mark stretches of the original line and one merge masks them, so no order of
    passes can unmask anything. Every value here is made up."""

    VALUES = ["Wb7Nc3Kd9Fq2!Zx$81", "correct horse battery9", "idAAAA1111", "secBBBB2222", "password",
              'Kq7"Zm\\4Wd9\'Xp2', "Hd5Jk9Nx3Bz7", "p@ss:w0rd=Qz8/Lm4", "84726153", "Tt6 Yy7=Uu8:Ii9"]

    def setUp(self):
        self.secrets = st.known_secrets({f"X{i}_SECRET": value for i, value in enumerate(self.VALUES)}, [])

    def test_a_known_value_followed_by_a_colon_or_equals_is_masked_whole(self):
        for line, leaks in {
            "invalid key Wb7Nc3Kd9Fq2!Zx$81: denied": ("Zx$81", "Wb7N"),
            "password=correct horse battery9: rejected": ("horse", "battery9"),
            "cred idAAAA1111/secBBBB2222: bad": ("idAAAA", "secBBBB", "2222"),
            "Wb7Nc3Kd9Fq2!Zx$81=1": ("Zx$81",),
        }.items():
            out = st.redact(line, self.secrets)
            for leak in leaks:
                self.assertNotIn(leak, out, line)
        self.assertEqual(st.redact("invalid key Wb7Nc3Kd9Fq2!Zx$81: denied", self.secrets), "invalid key [redacted]: denied")
        self.assertEqual(st.redact("cred idAAAA1111/secBBBB2222: bad", self.secrets), "cred [redacted]/[redacted]: bad")

    def test_a_known_value_that_is_a_key_word_and_the_value_after_it_are_both_masked(self):
        self.assertEqual(st.redact("login password=Rt5Yh1 sent", self.secrets), "login [redacted]=[redacted] sent")

    def test_no_known_value_nor_six_characters_of_one_survives_any_arrangement(self):
        import random
        rng = random.Random(20261116)
        separators = ["=", ":", " ", '"', "'", "/", "@", ": ", "= ", ", ", "", "&", "?", "(", ")", "[", "]", ";", "//"]
        filler = ["step", "failed", "for", "url", "https://api.example.gov.au/v1", "key", "token", "password", "secret",
                  "Authorization", "Bearer", "user", "line 12", "in fetch", "retry", "rc=1", "~", "at", "é", "議会"]
        long_values = [v for v in self.VALUES if len(v) >= 6]
        windows = {v[i:i + 6] for v in long_values for i in range(len(v) - 5)}
        for n in range(3000):
            parts = []
            for _ in range(rng.randint(1, 9)):
                parts.append(rng.choice(self.VALUES) if rng.random() < 0.5 else rng.choice(filler))
                parts.append(rng.choice(separators))
            line = "".join(parts)
            if n % 50 == 0:   # some lines run past the cut, with a value across it
                line = "x" * (st.PRE_CUT - rng.randint(1, 30)) + line
            out = st.redact(line, self.secrets)
            for window in windows:
                self.assertNotIn(window, out, f"line {n}: {line[-200:]!r}")


class Tails(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.pipe = Path(self._tmp.name) / "pipeline"
        self.pipe.mkdir()

    def test_only_named_steps_with_a_log_and_only_the_last_lines(self):
        (self.pipe / "ipea.log").write_text("".join(f"line {i}\n" for i in range(1, 101)) + "\n\n")
        (self.pipe / "vic.log").write_text("the log of a step that did not fail\n")
        out = st.step_tails(self.pipe, ["ipea", "ipea", "nolog"], ENV, [])
        self.assertEqual(list(out), ["ipea"])
        self.assertEqual(out["ipea"], [f"line {i}" for i in range(86, 101)])

    def test_two_kilobytes_at_most_keeping_the_end(self):
        (self.pipe / "big.log").write_text("".join(f"{i:02d} " + "word " * 55 + "\n" for i in range(30)))
        lines = st.step_tails(self.pipe, ["big"], ENV, [])["big"]
        self.assertLessEqual(sum(len(line.encode()) + 1 for line in lines), st.MAX_BYTES)
        self.assertTrue(lines[-1].startswith("29 "))
        self.assertLess(len(lines), st.MAX_LINES)

    def test_a_huge_log_is_read_from_its_end_only(self):
        (self.pipe / "huge.log").write_text("x" * 200000 + "\nthe last line\n")
        self.assertEqual(st.step_tails(self.pipe, ["huge"], ENV, [])["huge"], ["the last line"])

    def test_a_step_name_cannot_reach_another_file(self):
        secret = self.pipe.parent / "secret.log"
        secret.write_text("outside the pipeline directory\n")
        (self.pipe / "nightly.env.log").write_text("dotted name\n")
        for name in ("../secret", "..%2Fsecret", "/etc/passwd", "nightly.env", "a b", "", "x" * 65):
            self.assertEqual(st.step_tails(self.pipe, [name], ENV, []), {}, name)

    def test_command_line_prints_json_and_never_fails(self):
        (self.pipe / "ipea.log").write_text(f"boom token={KB_TOKEN}\n")
        proc = subprocess.run([sys.executable, str(SCRIPT), "--pipe", str(self.pipe), "--env-file", str(self.pipe / "missing.env"),
                               "ipea", "../x"], capture_output=True, text=True, env={**ENV, "ARAG_KB_TOKEN": KB_TOKEN})
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(json.loads(proc.stdout), {"ipea": ["boom token=[redacted]"]})
        proc = subprocess.run([sys.executable, str(SCRIPT), "--pipe", str(self.pipe / "absent")], capture_output=True, text=True)
        self.assertEqual((proc.returncode, proc.stdout), (0, "{}"))


if __name__ == "__main__":
    unittest.main()
