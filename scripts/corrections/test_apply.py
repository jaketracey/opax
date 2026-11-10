"""Reviewed corrections: applied only while the published value still matches.

    python3 -m unittest scripts/corrections/test_apply.py
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from corrections import apply as corrections  # noqa: E402


def entry(**over):
    base = {"id": "a", "field": "result", "from": "negative", "to": "affirmative",
            "evidence_url": "https://www.aph.gov.au/Hansard", "evidence": "AYES 75 NOES 74; Question agreed to.",
            "finding": "divisions-votes-002", "reviewed": "2026-11-10"}
    base.update(over)
    return base


class CorrectionsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, entries, name="demo"):
        (self.dir / f"{name}.json").write_text(json.dumps(entries), encoding="utf-8")

    def test_no_file_means_no_corrections(self):
        self.assertEqual(corrections.load("demo", self.dir), [])
        records = {"a": {"result": "negative"}}
        self.assertEqual(corrections.apply("demo", records, directory=self.dir), [])
        self.assertEqual(records["a"]["result"], "negative")

    def test_applies_when_from_matches(self):
        self.write([entry(), entry(field="_meta.duplicate_of", **{"from": None, "to": "b"})])
        records = {"a": {"result": "negative", "_meta": {"schema": 1}}}
        applied = corrections.apply("demo", records, directory=self.dir)
        self.assertEqual(len(applied), 2)
        self.assertEqual(records["a"]["result"], "affirmative")
        self.assertEqual(records["a"]["_meta"], {"schema": 1, "duplicate_of": "b"})

    def test_list_records_with_a_key_field_or_function(self):
        self.write([entry(id="k1")])
        rows = [{"key": "k1", "result": "negative"}, {"key": "k2", "result": "negative"}]
        corrections.apply("demo", rows, key="key", directory=self.dir)
        self.assertEqual([r["result"] for r in rows], ["affirmative", "negative"])
        rows = [{"k": {"id": "k1"}, "result": "negative"}]
        corrections.apply("demo", rows, key=lambda r: r["k"]["id"], directory=self.dir)
        self.assertEqual(rows[0]["result"], "affirmative")

    def test_a_changed_value_fails_loudly_and_changes_nothing(self):
        self.write([entry(id="a"), entry(id="b")])
        records = {"a": {"result": "negative"}, "b": {"result": "tied"}}
        with self.assertRaisesRegex(corrections.CorrectionError, r"b result: expected \"negative\" but it now holds \"tied\""):
            corrections.apply("demo", records, directory=self.dir)
        self.assertEqual(records["a"]["result"], "negative")  # all or none

    def test_a_fixed_source_asks_for_the_correction_to_be_removed(self):
        self.write([entry()])
        with self.assertRaisesRegex(corrections.CorrectionError, "remove the correction"):
            corrections.apply("demo", {"a": {"result": "affirmative"}}, directory=self.dir)

    def test_a_missing_record_fails_loudly(self):
        self.write([entry(id="gone")])
        with self.assertRaisesRegex(corrections.CorrectionError, "gone: record not found"):
            corrections.apply("demo", {"a": {"result": "negative"}}, directory=self.dir)

    def test_malformed_files_are_refused(self):
        bad = [
            {"id": "a"},  # missing fields
            dict(entry(), extra=1),  # unknown field
            entry(evidence_url="aph.gov.au/Hansard"),  # not a URL
            entry(evidence_url=""),  # no source
            entry(evidence=" "),  # no evidence text
            entry(reviewed="10 Nov 2026"),  # not ISO
            entry(field="members[0].party"),  # not a dotted key path
            entry(to="negative"),  # no-op
        ]
        for n, item in enumerate(bad):
            with self.subTest(n=n):
                self.write([item])
                with self.assertRaises(corrections.CorrectionError):
                    corrections.load("demo", self.dir)
        self.write({"id": "a"})
        with self.assertRaisesRegex(corrections.CorrectionError, "JSON list"):
            corrections.load("demo", self.dir)
        self.write([entry(), entry(to="tied")])
        with self.assertRaisesRegex(corrections.CorrectionError, "a second correction"):
            corrections.load("demo", self.dir)
        with self.assertRaises(corrections.CorrectionError):
            corrections.load("../etc", self.dir)

    def test_committed_files_are_valid(self):
        for path in sorted(corrections.DIRECTORY.glob("*.json")):
            with self.subTest(file=path.name):
                corrections.load(path.stem)


if __name__ == "__main__":
    unittest.main()
