"""Run with: python3 -m unittest tests.test_interests_cleanup

Data cleanup wave 1 (10 Nov 2026) rules for the registers of interests:

* interests-expenses-004 / registers-007: a row whose only answer is a bare "No" with every
  other cell nil (Marles' "Self  No  Nil  Nil") and a punctuation-only row (Landry's ".") are
  nil answers, dropped at ingest and at export; a "No" beside real content stays.
* interests-expenses-005 / registers-006: a cell's wrapped lines are joined by one helper that
  drops the space after a line-end hyphen ("Mid-" / "Winter Ball"), whatever case follows.
* interests-expenses-010: a QLD ";"-separated fragment that is only an ownership share
  ("100%") stays with the item before it.
"""

import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from parli.ingest import conduct_interests_federal as F  # noqa: E402
from parli.ingest import conduct_interests_qld as Q  # noqa: E402

_spec = importlib.util.spec_from_file_location("export_interests", ROOT / "scripts/export_interests.py")
X = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(X)


def line(top, text, x1=300):
    return {"top": top, "text": text, "x0": 50, "x1": x1}


class JoinLines(unittest.TestCase):
    def test_line_end_hyphen_joins_without_space(self):
        # source texts of the 12 artefacts the sweep found (APH statements, 48th Parliament)
        cases = [
            ("Endeavour Group ticket to APH Mid-", "Winter Ball", "Endeavour Group ticket to APH Mid-Winter Ball"),
            ("RSL (Semaphore and Port Adelaide Sub-", "Branch)", "RSL (Semaphore and Port Adelaide Sub-Branch)"),
            ("Eungella NSW - Residential (jointly-", "owned with spouse).", "Eungella NSW - Residential (jointly-owned with spouse)."),
            ("World Hellenic Inter-", "Parliamentary Association", "World Hellenic Inter-Parliamentary Association"),
            ("Travel 15-", "21 July", "Travel 15-21 July"),
            ("Financial year 2025-", "26", "Financial year 2025-26"),
        ]
        for a, b, want in cases:
            self.assertEqual(F._join_lines(a, b), want)

    def test_other_line_ends_keep_a_space(self):
        self.assertEqual(F._join_lines("Eungella NSW -", "Residential"), "Eungella NSW - Residential")
        self.assertEqual(F._join_lines("Qantas Chairman's", "Lounge"), "Qantas Chairman's Lounge")
        self.assertEqual(F._join_lines("", "Medibank"), "Medibank")
        self.assertEqual(F._join_lines("Medibank", None), "Medibank")

    def test_mid_line_hyphen_is_left_as_printed(self):
        # 'Day Three- Australia' is mid-line in Butler's statement: not a wrap, not rejoined
        got = F._partition([line(0, "Ashes Pink Test Day Three- Australia v"), line(12, "England")], 50, 400, 1)
        self.assertEqual(got[0][1], "Ashes Pink Test Day Three- Australia v England")

    def test_partition_uses_the_helper(self):
        got = F._partition([line(0, "Endeavour Group ticket to APH Mid-"), line(12, "Winter Ball")], 50, 400, 1)
        self.assertEqual(got, [[0, "Endeavour Group ticket to APH Mid-Winter Ball"]])

    def test_every_join_point_goes_through_the_helper(self):
        src = (ROOT / "parli/ingest/conduct_interests_federal.py").read_text()
        body = src.split("def _join_lines", 1)[1].split("\ndef ", 1)[1]
        self.assertNotIn('+ " " +', body, "a cell join bypasses _join_lines")
        self.assertNotIn('+= " "', body, "a cell join bypasses _join_lines")


class NilEntries(unittest.TestCase):
    def test_ingest_entry_rule(self):
        self.assertTrue(F._is_nil_entry(["No"]))
        self.assertTrue(F._is_nil_entry(["No.", "Nil", "Nil"]))
        self.assertTrue(F._is_nil_entry(["."]))
        self.assertTrue(F._is_nil_entry(["Not Applicable", "-"]))
        self.assertFalse(F._is_nil_entry(["No", "Shine Lawyers (salary)"]))
        self.assertFalse(F._is_nil_entry(["Medibank"]))
        self.assertFalse(F._is_nil_entry(["No. 3 Account, Bendigo Bank"]))

    def test_export_row_rule(self):
        nil = lambda fields, desc=None: X.is_nil_row(json.dumps(fields), desc)  # noqa: E731
        # DB rows as stored for Marles (house-48-marles-48p) and Landry (house-48-landry-48p)
        self.assertTrue(nil({"Name of company": "No"}, "No"))
        self.assertTrue(nil({"Name of trust/nominee company": "No"}, "No"))
        self.assertTrue(nil({"Name of company": "."}, "."))
        self.assertTrue(nil({"Name of company": "No", "Location": "Nil", "Purpose": "Nil"}))
        self.assertTrue(nil({"item": "8. Savings", "details": "No"}))
        self.assertTrue(nil({}, "No"))
        # kept: real content, or "No" next to real content
        self.assertFalse(nil({"Name of company": "Medibank"}, "Medibank"))
        self.assertFalse(nil({"Nature of income": "No", "Payer": "Shine Lawyers"}))
        self.assertFalse(nil({"Name of company": "Nobel Ltd"}))
        self.assertFalse(nil({"item": "8. Savings", "details": "No. 2 account, ING"}))


class QldShares(unittest.TestCase):
    def test_share_fragment_stays_with_its_item(self):
        # McMillan, QLD Register of Members' Interests (MembersRegister.pdf, 30 Oct 2026)
        text = ("Windsor, unit, investment; 100%; Alexandra Headlands, unit, investment; 100%; "
                "Rochedale, 477m², principal place of residence, 50%")
        self.assertEqual(Q._split_entries(text), [
            "Windsor, unit, investment; 100%",
            "Alexandra Headlands, unit, investment; 100%",
            "Rochedale, 477m², principal place of residence, 50%",
        ])

    def test_other_fragments_still_split(self):
        self.assertEqual(Q._split_entries("Telstra; NAB; 50 % share"), ["Telstra", "NAB; 50 % share"])
        self.assertEqual(Q._split_entries("100%; Brisbane unit"), ["100%", "Brisbane unit"])
        self.assertEqual(Q._split_entries("Member, RSL; Member, Lions Club"), ["Member, RSL", "Member, Lions Club"])


if __name__ == "__main__":
    unittest.main()
