"""Run with: python -m unittest scripts/vm/test_upload_expenses_itemised.py

The itemised expenses upload touches only opax-media under expenses/v1/, sends only what differs,
deletes only its own stale files (and never many at once), retries a passing failure, holds until the
matching expenses.json is published, and signs its requests as S3 expects (AWS's published examples).
"""

import datetime
import hashlib
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("upload_expenses_itemised", ROOT / "scripts/vm/upload_expenses_itemised.py")
U = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(U)

# "Signature Calculations for the Authorization Header" examples in the Amazon S3 API reference
AWS_KEY, AWS_SECRET = "AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
AWS_HOST = "examplebucket.s3.amazonaws.com"
AWS_NOW = datetime.datetime(2013, 5, 24, tzinfo=datetime.timezone.utc)


class Response:
    def __init__(self, status=200, content=b""):
        self.status_code, self.content = status, content


class FakeSession:
    """An in-memory bucket behind the three S3 calls, recording every request."""

    def __init__(self, objects=None, page=1000, fail_put=False, flaky=()):
        self.objects, self.page, self.fail_put, self.calls = dict(objects or {}), page, fail_put, []
        self.flaky = list(flaky)      # statuses (or exceptions) answered before requests start to succeed

    def request(self, method, url, headers=None, data=None, timeout=None):
        self.calls.append((method, url, dict(headers or {}), data))
        if self.flaky:
            answer = self.flaky.pop(0)
            if isinstance(answer, Exception):
                raise answer
            return Response(answer)
        if method in ("PUT", "DELETE"):
            if self.fail_put:
                return Response(500)
            key = url.split(f"/{U.BUCKET}/", 1)[1]
            if method == "PUT":
                self.objects[key] = data
            else:
                self.objects.pop(key, None)
            return Response(200 if method == "PUT" else 204)
        if method == "GET":
            keys = sorted(self.objects)
            start = 0
            if "continuation-token=" in url:
                start = int(url.split("continuation-token=")[1].split("&")[0])
            chunk = keys[start:start + self.page]
            more = start + self.page < len(keys)
            body = "".join(f"<Contents><Key>{k}</Key><ETag>&quot;{hashlib.md5(self.objects[k]).hexdigest()}&quot;</ETag></Contents>"
                           for k in chunk)
            xml = (f'<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">{body}'
                   f"<IsTruncated>{'true' if more else 'false'}</IsTruncated>"
                   + (f"<NextContinuationToken>{start + self.page}</NextContinuationToken>" if more else "")
                   + "</ListBucketResult>")
            return Response(content=xml.encode())
        return Response(405)


def tree(files):
    d = tempfile.TemporaryDirectory()
    for name, body in files.items():
        path = Path(d.name) / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
    return d


def store(session, sleeps=None):
    return U.R2(session, "acct", "key", "secret", sleep=(sleeps.append if sleeps is not None else lambda s: None))


class SigningTests(unittest.TestCase):
    def signature(self, *args, **kw):
        return U.sign(*args, **kw)["authorization"].rsplit("Signature=", 1)[1]

    def test_get_object_example(self):
        got = self.signature("GET", AWS_HOST, "/test.txt", {}, {"range": "bytes=0-9"}, U.EMPTY_SHA256,
                             AWS_KEY, AWS_SECRET, AWS_NOW, region="us-east-1")
        self.assertEqual(got, "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41")

    def test_list_objects_example(self):
        got = self.signature("GET", AWS_HOST, "/", {"max-keys": "2", "prefix": "J"}, {}, U.EMPTY_SHA256,
                             AWS_KEY, AWS_SECRET, AWS_NOW, region="us-east-1")
        self.assertEqual(got, "34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7")


class SyncTests(unittest.TestCase):
    FILES = {"11029/2025.json": b'{"a":1}', "11029/2026.json": b'{"a":2}', "person_0a/2026.json": b'{"a":3}'}

    def run_sync(self, session, files=None, **kw):
        lines = []
        with tree(files or self.FILES) as d:
            code, counts = U.sync(store(session), Path(d), log=lines.append, **kw)
        return code, counts, lines

    def test_first_upload_sends_every_file_as_json_under_the_prefix(self):
        session = FakeSession()
        code, counts, _ = self.run_sync(session)
        self.assertEqual((code, counts["sent"], counts["unchanged"]), (0, 3, 0))
        self.assertEqual(sorted(session.objects), [U.PREFIX + n for n in sorted(self.FILES)])
        puts = [c for c in session.calls if c[0] == "PUT"]
        for _, url, headers, _ in puts:
            self.assertTrue(url.startswith(f"https://acct.r2.cloudflarestorage.com/{U.BUCKET}/{U.PREFIX}"))
            self.assertEqual(headers["content-type"], "application/json")
            self.assertEqual(headers["cache-control"], "public, max-age=3600")
            signed = headers["authorization"].split("SignedHeaders=")[1]
            self.assertIn("content-type", signed)
            self.assertIn("cache-control", signed)

    def test_unchanged_files_are_not_sent_again(self):
        session = FakeSession({U.PREFIX + n: b for n, b in self.FILES.items()})
        code, counts, _ = self.run_sync(session, dict(self.FILES, **{"11029/2026.json": b'{"a":22}'}))
        self.assertEqual((code, counts["sent"], counts["unchanged"]), (0, 1, 2))
        self.assertEqual([c[1].rsplit("/", 2)[-2:] for c in session.calls if c[0] == "PUT"], [["11029", "2026.json"]])

    def test_dry_run_sends_nothing(self):
        session = FakeSession()
        code, counts, lines = self.run_sync(session, dry_run=True)
        self.assertEqual((code, counts["sent"]), (0, 3))
        self.assertEqual([c for c in session.calls if c[0] != "GET"], [])
        self.assertTrue(lines[-1].startswith("DRY RUN"))

    def test_objects_outside_the_prefix_or_the_file_pattern_are_never_touched(self):
        others = {"demo.mp4": b"video", "expenses/v2/1/2020.json": b"{}", U.PREFIX + "README.txt": b"x", U.PREFIX + "a/b/2020.json": b"{}"}
        files = {f"{n}/2026.json": b"{}" for n in range(40)}
        session = FakeSession(dict(others, **{U.PREFIX + n: b for n, b in files.items()}))
        code, counts, _ = self.run_sync(session, files)
        self.assertEqual((code, counts["deleted"], counts["sent"]), (0, 0, 0))
        for key, body in others.items():
            self.assertEqual(session.objects[key], body)
        self.assertEqual({c[0] for c in session.calls}, {"GET"})
        for method, url, _, _ in session.calls:
            self.assertIn("prefix=expenses%2Fv1%2F", url)

    def test_a_stale_file_the_tree_no_longer_has_is_deleted(self):
        # a resolver fix moved one person's lines to another id: the old file must not be served for ever
        files = {f"{n}/2026.json": b'{"n":%d}' % n for n in range(40)}
        stored = {U.PREFIX + n: b for n, b in files.items()}
        stored[U.PREFIX + "999/2020.json"] = b"{}"
        stored["demo.mp4"] = b"video"
        session = FakeSession(stored)
        code, counts, _ = self.run_sync(session, files)
        self.assertEqual((code, counts["orphans"], counts["deleted"], counts["sent"]), (0, 1, 1, 0))
        self.assertNotIn(U.PREFIX + "999/2020.json", session.objects)
        self.assertEqual(session.objects["demo.mp4"], b"video")
        deletes = [c[1] for c in session.calls if c[0] == "DELETE"]
        self.assertEqual(deletes, [f"https://acct.r2.cloudflarestorage.com/{U.BUCKET}/{U.PREFIX}999/2020.json"])

    def test_too_many_stale_files_are_reported_and_none_is_deleted(self):
        files = {f"{n}/2026.json": b"{}" for n in range(40)}
        stored = {U.PREFIX + n: b for n, b in files.items()}
        stored.update({f"{U.PREFIX}{n}/2020.json": b"{}" for n in range(900, 904)})   # 4 of 44 stored, over 5%
        session = FakeSession(stored)
        code, counts, lines = self.run_sync(session, files)
        self.assertEqual((code, counts["orphans"], counts["deleted"]), (0, 4, 0))
        self.assertEqual([c for c in session.calls if c[0] == "DELETE"], [])
        self.assertTrue(any("none deleted" in line for line in lines))

    def test_a_dry_run_deletes_nothing(self):
        files = {f"{n}/2026.json": b"{}" for n in range(40)}
        stored = dict({U.PREFIX + n: b for n, b in files.items()}, **{U.PREFIX + "999/2020.json": b"{}"})
        session = FakeSession(stored)
        code, counts, _ = self.run_sync(session, files, dry_run=True)
        self.assertEqual((code, counts["deleted"]), (0, 1))
        self.assertIn(U.PREFIX + "999/2020.json", session.objects)

    def test_delete_refuses_any_name_outside_the_file_pattern(self):
        for name in ("../demo.mp4", "demo.mp4", "1/2/2026.json", "pérson/2026.json", "1/2026.json.bak"):
            with self.assertRaises(RuntimeError):
                store(FakeSession()).delete(name)
            with self.assertRaises(RuntimeError):
                store(FakeSession()).put(name, b"{}")

    def test_a_shrunken_tree_is_refused(self):
        stored = {f"{U.PREFIX}{n}/2026.json": b"{}" for n in range(100)}
        session = FakeSession(stored)
        code, _, lines = self.run_sync(session)
        self.assertEqual(code, 3)
        self.assertEqual([c for c in session.calls if c[0] == "PUT"], [])
        self.assertIn("REFUSED", lines[-1])

    def test_listing_follows_continuation_tokens(self):
        session = FakeSession({U.PREFIX + n: b for n, b in self.FILES.items()}, page=2)
        code, counts, _ = self.run_sync(session)
        self.assertEqual((code, counts["sent"], counts["unchanged"], counts["stored_before"]), (0, 0, 3, 3))

    def test_a_stray_file_in_the_tree_stops_the_run(self):
        with self.assertRaises(SystemExit):
            self.run_sync(FakeSession(), {"11029/2026.json": b"{}", "notes.txt": b"x"})
        with self.assertRaises(RuntimeError):
            store(FakeSession()).put("../other/2026.json", b"{}")

    def test_a_passing_failure_is_retried_with_a_pause(self):
        for flaky in ([500], [429, 503], [ConnectionError("reset")], [TimeoutError("slow"), 502]):
            session, sleeps = FakeSession(flaky=flaky), []
            with tree(self.FILES) as d:
                code, counts = U.sync(store(session, sleeps), Path(d), log=lambda line: None)
            self.assertEqual((code, counts["sent"]), (0, 3), flaky)
            self.assertEqual(sleeps, [2, 4][:len(flaky)], flaky)
            self.assertEqual(sorted(session.objects), [U.PREFIX + n for n in sorted(self.FILES)])

    def test_three_failures_in_a_row_stop_the_run_and_a_refusal_is_not_retried(self):
        session, sleeps = FakeSession(flaky=[500, 500, 500]), []
        with tree(self.FILES) as d, self.assertRaises(RuntimeError) as caught:
            U.sync(store(session, sleeps), Path(d), log=lambda line: None)
        self.assertEqual((len(session.calls), sleeps), (3, [2, 4]))
        self.assertIn("HTTP 500", str(caught.exception))
        session, sleeps = FakeSession(flaky=[403]), []
        with tree(self.FILES) as d, self.assertRaises(RuntimeError):
            U.sync(store(session, sleeps), Path(d), log=lambda line: None)
        self.assertEqual((len(session.calls), sleeps), (1, []))

    def test_a_failed_request_is_an_error_not_a_silent_skip(self):
        with self.assertRaises(RuntimeError) as caught:
            self.run_sync(FakeSession(fail_put=True))
        self.assertNotIn("secret", str(caught.exception))

    def test_main_needs_credentials_and_a_tree(self):
        import os
        from unittest import mock
        with tree(self.FILES) as d, mock.patch.dict(os.environ, {}, clear=True), mock.patch.object(sys, "stderr"):
            self.assertEqual(U.main(["--tree", d]), 2)
            self.assertEqual(U.main(["--tree", d, "--skip-without-credentials"]), 0)
            self.assertEqual(U.main(["--tree", d + "/missing"]), 2)

    def test_credentials_can_come_from_an_env_file_and_are_not_echoed(self):
        with tempfile.TemporaryDirectory() as d:
            env = Path(d) / ".env"
            env.write_text("OTHER=1\nOPAX_R2_ACCOUNT_ID=acct\nexport OPAX_R2_ACCESS_KEY_ID='key'\nOPAX_R2_SECRET_ACCESS_KEY=\"s3cr3t\"\n")
            got = U.read_env_file(env, U.CREDENTIALS)
            self.assertEqual(got, {"OPAX_R2_ACCOUNT_ID": "acct", "OPAX_R2_ACCESS_KEY_ID": "key", "OPAX_R2_SECRET_ACCESS_KEY": "s3cr3t"})
            self.assertEqual(U.read_env_file(Path(d) / "missing", U.CREDENTIALS), {})


class PublishedCheckTests(unittest.TestCase):
    """--repo: the tree is sent only while HEAD publishes the expenses.json it was exported beside."""

    def repo(self, d, expenses):
        import subprocess
        repo = Path(d) / "repo"
        (repo / "portal/public").mkdir(parents=True)
        (repo / U.EXPENSES_JSON).write_bytes(expenses)
        git = lambda *a: subprocess.run(["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@example.invalid", *a],
                                        check=True, capture_output=True)
        git("init", "-q")
        git("add", "-A")
        git("commit", "-q", "-m", "seed")
        return repo

    def test_held_until_head_has_the_expenses_json_the_tree_was_exported_beside(self):
        with tempfile.TemporaryDirectory() as d:
            repo = self.repo(d, b'{"to":"2026Q02"}')
            t = Path(d) / "tree"
            t.mkdir()
            self.assertIn("no tree.expenses-sha256", U.published_problem(t, repo))
            U.stamp_path(t).write_text(hashlib.sha256(b'{"to":"2026Q03"}').hexdigest() + "\n")    # tonight's export, not published
            self.assertIn("held or not yet published", U.published_problem(t, repo))
            # a changed working file is not publication: only HEAD counts
            (repo / U.EXPENSES_JSON).write_bytes(b'{"to":"2026Q03"}')
            self.assertIsNotNone(U.published_problem(t, repo))
            U.stamp_path(t).write_text(hashlib.sha256(b'{"to":"2026Q02"}').hexdigest() + "\n")
            self.assertIsNone(U.published_problem(t, repo))
            self.assertIn("could not be read", U.published_problem(t, Path(d) / "not-a-repo"))

    def test_main_holds_without_asking_for_credentials_or_the_network(self):
        import os
        from unittest import mock
        with tempfile.TemporaryDirectory() as d:
            repo = self.repo(d, b'{"to":"2026Q02"}')
            t = Path(d) / "tree"
            (t / "1").mkdir(parents=True)
            (t / "1/2026.json").write_text("{}")
            U.stamp_path(t).write_text("0" * 64 + "\n")
            err = mock.MagicMock()
            with mock.patch.dict(os.environ, {}, clear=True), mock.patch.object(sys, "stderr", err), \
                    mock.patch.object(U, "sync", side_effect=AssertionError("must not sync")):
                self.assertEqual(U.main(["--tree", str(t), "--repo", str(repo)]), 0)


if __name__ == "__main__":
    unittest.main()
