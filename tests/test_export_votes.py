"""Run with: python -m unittest discover -s tests -p test_export_votes.py

scripts/export_votes.py against a small synthetic parli.db: the `_meta` entry (types; the newest
division counted in a published record's totals; the empty case; content_changed_at carried over an
unchanged rerun and advanced by any change), and every other byte of the file exactly as the export
wrote it before `_meta` existed. tests/fixtures/export_votes/pre_meta.json is that earlier output on
the fixture below, written by the script as of 793d5807; if the record shape changes on purpose,
regenerate it from build_fixture() and say so in the commit.
"""

import contextlib
import importlib.util
import io
import json
import os
import signal
import sqlite3
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

_spec = importlib.util.spec_from_file_location(
    "export_votes", Path(__file__).resolve().parents[1] / "scripts/export_votes.py")
X = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(X)

GOLDEN = Path(__file__).parent / "fixtures" / "export_votes" / "pre_meta.json"
STAMP_RE = r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$"
OLD_STAMP = "2026-01-02T03:04:05Z"

DDL = """
CREATE TABLE members (person_id TEXT, full_name TEXT, party_canonical TEXT, party TEXT, chamber TEXT);
CREATE TABLE divisions (division_id TEXT, name TEXT, date TEXT, rebellions INTEGER, summary TEXT, state TEXT);
CREATE TABLE votes (person_id TEXT, division_id TEXT, vote TEXT);
CREATE TABLE ext_divisions (id TEXT, jurisdiction TEXT, name TEXT, question TEXT, bill_ref TEXT, date TEXT, extra TEXT);
CREATE TABLE ext_votes (jurisdiction TEXT, house TEXT, person_key TEXT, person_name TEXT, division_id TEXT,
                        vote TEXT, date TEXT, party TEXT);
"""

# Synthetic people and bills. Dates that must NOT reach _meta: 2026-09-30 (federal d6: voted only by a
# person with no members row; nsw: a voter with no name; vic: a record replaced by another person key
# with the same slug), 2026-10-01 (no ayes or noes), 2026-10-02 (a federal row in ext_votes).
# 2026-09-29 (d10, a state row in the legacy table) MUST: Alex Example's federal totals count it.
MEMBERS = [
    ("90001", "Alex Example", "Labor", "Labor", "representatives"),
    ("90002", "Zoë Sample", None, "Greens", "senate"),
]
DIVISIONS = [
    ("d1", "Example Reform Bill 2024 - Second Reading - Read a second time", "2024-03-20", 0, "", None),
    ("d2", "Example Reform Bill 2024 - Third Reading - Pass the bill", "2024-03-21", 2, "", "federal"),
    ("d3", "Sample Levy Bill 2025 - Second Reading - Decline a second reading", "2025-06-11", 0, "", None),
    ("d4", "Motions - Example Inquiry - Agree", "2025-08-01", 0, "", None),
    ("d5", "Bills — Sample Amendment Bill 2026; Second Reading", "2026-08-12T10:00:00",
     0, "<p>That the bill be now read a second time.</p>", None),
    ("d6", "Sample Late Bill 2026 - Second Reading - Read a second time", "2026-09-30", 0, "", None),
    ("d7", "Unvoted Bill 2026 - Second Reading - Read a second time", "2026-10-01", 0, "", None),
    ("d8", "12 .... 34", "2026-07-01", 0, "", None),
    ("d9", "Undated Bill 2026 - Second Reading - Read a second time", None, 0, "", None),
    ("d10", "State Row Bill 2026 - Second Reading - Read a second time", "2026-09-29", 0, "", "nsw"),
]
VOTES = [
    ("90001", "d1", "aye"), ("90001", "d2", "aye"), ("90001", "d3", "no"), ("90001", "d4", "aye"),
    ("90001", "d5", "aye"), ("90001", "d8", "no"), ("90001", "d10", "aye"), ("90001", "d7", "abstain"),
    ("90002", "d1", "no"), ("90002", "d3", "aye"), ("90002", "d9", "aye"),
    ("90003", "d6", "aye"),
]
EXT_DIVISIONS = [
    ("nsw-2026-001", "nsw", "Sample Housing Bill 2026", "That this bill be now read a second time.",
     "Sample Housing Bill 2026", "2026-09-17", '{"divided_on": ""}'),
    ("nsw-2026-002", "nsw", "Sample Housing Bill 2026", "That the amendment be agreed to.",
     "Sample Housing Bill 2026", "2026-09-18", '{"divided_on": "amendment"}'),
    ("nsw-2026-003", "nsw", "Example Water Bill 2026", "That the bill be agreed to.",
     "Example Water Bill 2026", "2026-09-25", None),
    ("vic-2026-001", "vic", "Example Transport Bill 2026", "That the bill be agreed to.",
     "Example Transport Bill 2026", "2026-09-02", None),
    ("vic-2026-002", "vic", "Example Rail Bill 2026", "That the bill be agreed to.",
     "Example Rail Bill 2026", "2026-08-30", None),
    ("vic-2026-003", "vic", "Example Port Bill 2026", "That the bill be agreed to.",
     "Example Port Bill 2026", "2026-09-30", None),
    ("federal-2026-001", "federal", "Ignored Bill 2026", "That the bill be agreed to.",
     "Ignored Bill 2026", "2026-10-02", None),
]
EXT_VOTES = [
    ("nsw", "nsw_lc", "Casey Placeholder", "Casey Placeholder", "nsw-2026-001", "aye", "2026-09-17", "Labor"),
    ("nsw", "nsw_lc", "Casey Placeholder", "Casey Placeholder", "nsw-2026-002", "no", "2026-09-18", "Labor"),
    ("nsw", "nsw_lc", "Casey Placeholder", "Casey Placeholder", "nsw-2026-003", "paired", "2026-09-25", "Labor"),
    ("nsw", "nsw_la", "Alex Example", "Alex Example", "nsw-2026-003", "aye", "2026-09-25", None),
    ("nsw", "nsw_la", "Ghost Key", None, "nsw-2026-003", "no", "2026-09-30", None),
    # Two person keys, one slug (vic:robin-fixture): the later group replaces the earlier in the file.
    ("vic", "vic_la", "Robin Fixture", "Robin Fixture", "vic-2026-003", "no", "2026-09-30", "Liberal"),
    ("vic", "vic_la", "Robin Fixture", "Robin Fixture", "vic-2026-001", "no", "2026-09-02", "Liberal"),
    ("vic", "vic_la", "Robin-Fixture", "Robin Fixture", "vic-2026-002", "aye", "2026-08-30", "Liberal"),
    ("vic", "vic_la", None, "No Key", "vic-2026-001", "aye", "2026-09-02", None),
    ("federal", "representatives", "Alex Example", "Alex Example", "federal-2026-001", "aye", "2026-10-02", None),
]
FULL = {"members": MEMBERS, "divisions": DIVISIONS, "votes": VOTES,
        "ext_divisions": EXT_DIVISIONS, "ext_votes": EXT_VOTES}


class ExportHung(Exception):
    """Raised by the test deadline; not an OSError (as TimeoutError is), so the export cannot swallow it."""


def build_fixture(path, tables=FULL):
    db = sqlite3.connect(path)
    db.executescript(DDL)
    for table, rows in tables.items():
        if rows:
            db.executemany(f"INSERT INTO {table} VALUES ({','.join('?' * len(rows[0]))})", rows)
    db.commit()
    db.close()


def without_meta(raw, meta):
    """The file as it was before _meta: _meta is the last key, so drop exactly its bytes."""
    tail = ',"_meta":' + json.dumps(meta, ensure_ascii=False, separators=(",", ":")) + "}\n"
    assert raw.endswith(tail), "the _meta entry is not the last key, serialised as the rest of the file"
    return raw[: -len(tail)] + "}\n"


def restamp(raw, stamp):
    """The same file with another content_changed_at, serialised as the export does."""
    data = json.loads(raw)
    data["_meta"]["content_changed_at"] = stamp
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"


class ExportVotesTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        d = Path(self.tmp.name)
        self.db = d / "parli.db"
        self.previous = d / "votes.json"  # absent until a test writes it
        for name in ("DB", "PREVIOUS"):
            self.addCleanup(setattr, X, name, getattr(X, name))
        X.DB = "file:" + str(self.db) + "?mode=ro"
        X.PREVIOUS = self.previous

    def run_export(self):
        """main() against the fixture: (stdout, stderr, parsed, (before, after)) as the nightly sees it."""
        out, err = io.StringIO(), io.StringIO()
        before = datetime.now(timezone.utc).replace(microsecond=0)
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            X.main()
        after = datetime.now(timezone.utc) + timedelta(seconds=1)
        return out.getvalue(), err.getvalue(), json.loads(out.getvalue()), (before, after)

    def export(self, tables=FULL):
        self.db.unlink(missing_ok=True)
        build_fixture(self.db, tables)
        return self.run_export()

    def assertFresh(self, stamp, bounds):
        self.assertRegex(stamp, STAMP_RE)
        t = datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        self.assertTrue(bounds[0] <= t <= bounds[1], (bounds[0], t, bounds[1]))

    # --- shape -------------------------------------------------------------------------------------

    def test_meta_shape_and_types(self):
        _, _, data, bounds = self.export()
        meta = data["_meta"]
        self.assertEqual(list(meta), ["content_changed_at", "latest_division_date",
                                      "latest_division_date_by_jurisdiction", "schema"])
        self.assertFresh(meta["content_changed_at"], bounds)
        self.assertIsInstance(meta["schema"], int)
        self.assertNotIsInstance(meta["schema"], bool)
        self.assertEqual(meta["schema"], 1)
        self.assertRegex(meta["latest_division_date"], r"^\d{4}-\d\d-\d\d$")
        self.assertIsInstance(meta["latest_division_date_by_jurisdiction"], dict)

    def test_rest_of_file_is_byte_for_byte_the_previous_export(self):
        raw, _, data, _ = self.export()
        self.assertEqual(list(data)[-2:], ["_names", "_meta"])
        self.assertEqual(without_meta(raw, data["_meta"]), GOLDEN.read_text(encoding="utf-8"))

    def test_empty_database(self):
        raw, err, data, bounds = self.export(tables={})
        self.assertEqual(set(data), {"_names", "_meta"})
        self.assertEqual(data["_names"], {})
        meta = data["_meta"]
        self.assertIsNone(meta["latest_division_date"])
        self.assertEqual(meta["latest_division_date_by_jurisdiction"], {})
        self.assertEqual(meta["schema"], 1)
        self.assertFresh(meta["content_changed_at"], bounds)
        self.assertEqual(without_meta(raw, meta), '{"_names":{}}\n')  # what the export wrote before _meta
        self.assertIn("people 0 ", err)
        self.assertIn("latest division None", err)

    def test_summary_line_skips_meta(self):
        _, err, data, _ = self.export()
        self.assertTrue(err.startswith("people 5 ({'federal': 2, 'nsw': 2, 'vic': 1}), with listed bills 5,"), err)
        self.assertIn("names indexed 4, latest division 2026-09-29, content changed at "
                      + data["_meta"]["content_changed_at"], err)

    def test_meta_is_invisible_to_record_readers(self):
        """The web's readers: home-data.js keeps values with a `name`; app.js looks records up by key,
        never by "_meta"."""
        _, _, data, _ = self.export()
        self.assertNotIn("name", data["_meta"])
        pool = [v for v in data.values() if isinstance(v, dict) and v.get("name")]
        self.assertEqual(sorted(v["name"] for v in pool),
                         ["Alex Example", "Alex Example", "Casey Placeholder", "Robin Fixture", "Zoë Sample"])
        self.assertNotIn("_meta", {k for keys in data["_names"].values() for k in keys})

    # --- latest division dates ---------------------------------------------------------------------

    def test_latest_division_date_covers_every_division_counted_in_published_totals(self):
        _, _, data, _ = self.export()
        meta = data["_meta"]
        # federal: d10 (2026-09-29, a state row in the legacy table) is one of Alex Example's 7 counted
        # votes, so it dates the federal record although `years` (federal divisions only) stops at 2026.
        # Not d6 (voter has no members row), d7 (no ayes or noes) or the federal row in ext_votes.
        # nsw: nsw-2026-003 via Alex Example; not the nameless 2026-09-30 voter.
        # vic: the surviving vic:robin-fixture record's one vote, 2026-08-30.
        self.assertEqual(data["90001"]["divisions_total"], 7)
        self.assertEqual(meta["latest_division_date_by_jurisdiction"],
                         {"federal": "2026-09-29", "nsw": "2026-09-25", "vic": "2026-08-30"})
        self.assertEqual(meta["latest_division_date"], "2026-09-29")
        newest_year = max(e["years"][1] for k, e in data.items() if not k.startswith("_") and "years" in e)
        self.assertGreaterEqual(int(meta["latest_division_date"][:4]), newest_year)

    def test_a_record_counting_only_a_legacy_state_division_is_dated(self):
        _, _, data, _ = self.export(tables={
            "members": MEMBERS[:1], "divisions": [DIVISIONS[9]], "votes": [("90001", "d10", "aye")]})
        self.assertEqual(data["90001"]["divisions_total"], 1)
        self.assertNotIn("years", data["90001"])  # unchanged: years still counts federal divisions only
        self.assertEqual(data["_meta"]["latest_division_date"], "2026-09-29")
        self.assertEqual(data["_meta"]["latest_division_date_by_jurisdiction"], {"federal": "2026-09-29"})

    def test_slug_collision_dates_only_the_surviving_record(self):
        _, _, data, _ = self.export()
        robin = data["vic:robin-fixture"]
        self.assertEqual((robin["divisions_total"], robin["for"][0]["date"]), (1, "2026-08-30"))
        self.assertEqual(data["_meta"]["latest_division_date_by_jurisdiction"]["vic"], "2026-08-30")
        # The two Robin groups alone: the replaced one's 2026-09-30 would otherwise be the file's newest date.
        _, _, alone, _ = self.export(tables={"ext_divisions": EXT_DIVISIONS, "ext_votes": EXT_VOTES[5:8]})
        self.assertEqual(list(alone)[:1], ["vic:robin-fixture"])
        self.assertEqual(alone["_meta"]["latest_division_date"], "2026-08-30")
        self.assertEqual(alone["_meta"]["latest_division_date_by_jurisdiction"], {"vic": "2026-08-30"})

    # --- content_changed_at ------------------------------------------------------------------------

    def test_unchanged_rerun_is_byte_identical(self):
        first, _, _, _ = self.export()
        self.previous.write_text(restamp(first, OLD_STAMP), encoding="utf-8")
        raw, err, data, _ = self.run_export()
        self.assertEqual(raw, self.previous.read_text(encoding="utf-8"))
        self.assertEqual(data["_meta"]["content_changed_at"], OLD_STAMP)
        self.assertIn(f"content unchanged since {OLD_STAMP}", err)

    def test_a_changed_record_advances_the_stamp(self):
        first, _, _, _ = self.export()
        self.previous.write_text(restamp(first, OLD_STAMP), encoding="utf-8")
        db = sqlite3.connect(self.db)
        db.execute("INSERT INTO votes VALUES ('90002', 'd5', 'aye')")
        db.commit()
        db.close()
        raw, err, data, bounds = self.run_export()
        self.assertEqual(data["90002"]["divisions_total"], 4)
        self.assertFresh(data["_meta"]["content_changed_at"], bounds)
        self.assertIn("content changed at", err)

    def test_a_change_in_meta_alone_advances_the_stamp(self):
        first, _, _, _ = self.export()
        stale = json.loads(restamp(first, OLD_STAMP))
        stale["_meta"]["latest_division_date_by_jurisdiction"]["vic"] = "2026-09-30"
        self.previous.write_text(json.dumps(stale, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        _, _, data, bounds = self.run_export()
        self.assertFresh(data["_meta"]["content_changed_at"], bounds)

    def assertStampedNow(self, previous_bytes, label):
        with self.subTest(label):
            self.previous.write_bytes(previous_bytes)
            raw, _, data, bounds = self.run_export()
            self.assertFresh(data["_meta"]["content_changed_at"], bounds)
            self.assertEqual(without_meta(raw, data["_meta"]), GOLDEN.read_text(encoding="utf-8"))

    def test_missing_old_format_or_unusable_previous_file_stamps_now(self):
        first, _, _, _ = self.export()
        same = json.loads(restamp(first, OLD_STAMP))
        cases = {
            "old format (the file before _meta)": GOLDEN.read_text(encoding="utf-8"),
            "not JSON": "{not json",
            "a JSON array": "[]",
            "_meta not an object": json.dumps({**same, "_meta": "x"}),
            "an exported_at only": json.dumps({**same, "_meta": {"exported_at": OLD_STAMP}}),
            "a date, not a timestamp": restamp(first, "2026-01-02"),
            "a number": restamp(first, 1767323045),
            "same content, no final newline": restamp(first, OLD_STAMP).rstrip("\n"),
            "same content, ASCII-escaped": json.dumps(same, separators=(",", ":")) + "\n",
        }
        for label, text in cases.items():
            self.assertStampedNow(text.encode("utf-8"), label)
        self.assertStampedNow(b"\xff\xfe{}", "not UTF-8")

    def test_previous_file_is_compared_as_literal_bytes(self):
        first, _, _, _ = self.export()
        canonical = restamp(first, OLD_STAMP).encode("utf-8")
        self.assertStampedNow(canonical[:-1] + b"\r\n", "CRLF final newline")
        self.assertStampedNow(canonical[:-1] + b"\r", "CR final newline")
        self.assertStampedNow(canonical.replace(b"Zo\xc3\xab", b"Zo\\u00eb", 1), "one character escaped")
        self.assertStampedNow(b"\xef\xbb\xbf" + canonical, "a UTF-8 byte order mark")

    def test_impossible_stamps_are_not_carried(self):
        first, _, _, _ = self.export()
        for stamp in ("2026-02-30T03:04:05Z", "2026-01-02T99:99:99Z", "2026-13-01T00:00:00Z",
                      "2026-01-02T24:00:00Z", "2026-01-02T23:59:60Z", "2026-00-10T00:00:00Z",
                      "2026-01- 2T03:04:05Z"):
            self.assertEqual(len(stamp), 20)  # same width as a real stamp: only validation can refuse it
            self.assertStampedNow(restamp(first, stamp).encode("utf-8"), stamp)
        # and the controls: real times, a leap day among them, are carried
        for stamp in ("2024-02-29T23:59:59Z", "2000-01-01T00:00:00Z"):
            with self.subTest(stamp):
                self.previous.write_bytes(restamp(first, stamp).encode("utf-8"))
                raw, _, data, _ = self.run_export()
                self.assertEqual(data["_meta"]["content_changed_at"], stamp)
                self.assertEqual(raw.encode("utf-8"), self.previous.read_bytes())

    def test_clock_set_back_keeps_the_stamp_of_unchanged_content(self):
        """The previous stamp is later than "now" (the clock went back a second): identical content
        still writes an identical file. A stamp from any future date is kept the same way."""
        first, _, _, _ = self.export()

        class RolledBack(datetime):
            @classmethod
            def now(cls, tz=None):
                return datetime(2026, 1, 2, 3, 4, 4, tzinfo=timezone.utc)  # one second before OLD_STAMP

        with mock.patch.object(X, "datetime", RolledBack):
            for stamp in (OLD_STAMP, "2099-12-31T23:59:59Z"):
                with self.subTest(stamp):
                    self.previous.write_bytes(restamp(first, stamp).encode("utf-8"))
                    raw, err, data, _ = self.run_export()
                    self.assertEqual(raw.encode("utf-8"), self.previous.read_bytes())
                    self.assertIn(f"content unchanged since {stamp}", err)
            # control: the patched clock is the one a changed file is stamped with
            self.previous.write_bytes(restamp(first, OLD_STAMP).encode("utf-8")[:-1] + b"\r\n")
            _, _, data, _ = self.run_export()
            self.assertEqual(data["_meta"]["content_changed_at"], "2026-01-02T03:04:04Z")

    def test_deeply_nested_previous_file_stamps_now(self):
        self.export()
        self.assertStampedNow(b"[" * 200_000 + b"]" * 200_000, "200,000 nested arrays")
        self.assertStampedNow(b'{"_meta":' * 50_000 + b"{}" + b"}" * 50_000, "50,000 nested objects")

    def test_oversized_previous_file_stamps_now(self):
        first, _, _, _ = self.export()
        canonical = restamp(first, OLD_STAMP).encode("utf-8")
        self.addCleanup(setattr, X, "PREVIOUS_MAX_BYTES", X.PREVIOUS_MAX_BYTES)
        X.PREVIOUS_MAX_BYTES = len(canonical) - 1
        self.assertStampedNow(canonical, "one byte over the cap")
        X.PREVIOUS_MAX_BYTES = len(canonical)
        self.previous.write_bytes(canonical)
        _, _, data, _ = self.run_export()
        self.assertEqual(data["_meta"]["content_changed_at"], OLD_STAMP)  # exactly at the cap is read

    def test_non_regular_previous_paths_stamp_now(self):
        self.export()
        d = Path(self.tmp.name)
        makers = [("missing", lambda p: None), ("a directory", lambda p: p.mkdir())]
        if os.path.exists("/dev/null"):
            makers.append(("a symlink to a character device", lambda p: p.symlink_to("/dev/null")))
        if hasattr(os, "mkfifo"):
            makers.append(("a FIFO with no writer", lambda p: os.mkfifo(p)))
        for label, make in makers:
            with self.subTest(label):
                X.PREVIOUS = d / label.replace(" ", "-")
                make(X.PREVIOUS)
                started = time.monotonic()
                with self.deadline(10):  # a blocking open fails the test instead of hanging the suite
                    _, _, data, bounds = self.run_export()
                self.assertLess(time.monotonic() - started, 5)
                self.assertFresh(data["_meta"]["content_changed_at"], bounds)

    @contextlib.contextmanager
    def deadline(self, seconds):
        if not hasattr(signal, "SIGALRM"):
            yield
            return
        def expire(signum, frame):
            raise ExportHung(f"export still running after {seconds}s")
        old = signal.signal(signal.SIGALRM, expire)
        signal.alarm(seconds)
        try:
            yield
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old)

if __name__ == "__main__":
    unittest.main()
