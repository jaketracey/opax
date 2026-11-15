"""Run with: python -m unittest scripts/vm/test_upload_expenses_itemised.py

The itemised expenses upload writes only to opax-media under expenses/v1/, sends only what differs,
never deletes, and signs its requests as S3 expects (checked against AWS's published examples).
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
    """An in-memory bucket behind the two S3 calls, recording every request."""

    def __init__(self, objects=None, page=1000, fail_put=False):
        self.objects, self.page, self.fail_put, self.calls = dict(objects or {}), page, fail_put, []

    def request(self, method, url, headers=None, data=None, timeout=None):
        self.calls.append((method, url, dict(headers or {}), data))
        if method == "PUT":
            if self.fail_put:
                return Response(500)
            key = url.split(f"/{U.BUCKET}/", 1)[1]
            self.objects[key] = data
            return Response()
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


def store(session):
    return U.R2(session, "acct", "key", "secret")


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
            self.assertIn("content-type", headers["authorization"].split("SignedHeaders=")[1])

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

    def test_only_get_and_put_are_ever_used_and_other_objects_are_left_alone(self):
        session = FakeSession({"demo.mp4": b"video", U.PREFIX + "999/2020.json": b"{}"})
        code, counts, _ = self.run_sync(session)
        self.assertEqual(code, 0)
        self.assertEqual({c[0] for c in session.calls}, {"GET", "PUT"})
        self.assertEqual(session.objects["demo.mp4"], b"video")
        self.assertIn(U.PREFIX + "999/2020.json", session.objects)      # never deleted
        self.assertEqual(counts["stored_not_in_tree"], 1)
        for method, url, _, _ in session.calls:
            if method == "GET":
                self.assertIn("prefix=expenses%2Fv1%2F", url)

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

    def test_a_failed_request_is_an_error_not_a_silent_skip(self):
        with self.assertRaises(RuntimeError) as caught:
            self.run_sync(FakeSession(fail_put=True))
        self.assertNotIn("secret", str(caught.exception))

    def test_main_needs_credentials_and_a_tree(self):
        import os
        from unittest import mock
        with tree(self.FILES) as d, mock.patch.dict(os.environ, {}, clear=True), mock.patch.object(sys, "stderr"):
            self.assertEqual(U.main(["--tree", d]), 2)
            self.assertEqual(U.main(["--tree", d + "/missing"]), 2)


if __name__ == "__main__":
    unittest.main()
