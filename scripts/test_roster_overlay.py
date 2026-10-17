"""scripts/roster_overlay.py: a re-export never changes, adds or drops a shipped roster row.

    python3 -m unittest scripts.test_roster_overlay
"""
import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts.roster_overlay import overlay, summary

ROOT = Path(__file__).resolve().parents[1]


def shipped():
    return {"meta": {"generated": "2026-10-04", "people": 4, "speeches": 50},
            "people": [
                {"name": "Alex Example", "speeches": 20, "party": "Labor", "states": ["sa"], "chambers": ["sa_ha"],
                 "first": 2020, "last": 2024, "representation": []},
                {"name": "Sam Fixture", "speeches": 15, "party": "Liberal", "states": ["federal"], "chambers": ["senate"],
                 "first": 2006, "last": 2007, "pid": "90001", "representation": []},
                {"name": "Fixture", "party": "LNP", "full": "Jo Fixture", "states": ["qld"], "chambers": ["qld_la"],
                 "speech_scope": {"state": "qld", "chamber": "qld_la", "service": [[2024, 2026]]},
                 "speech_count_basis": "pending", "transcript": {"speeches": 30}},
                {"name": "Kim Sample", "speeches": 9, "party": "Greens", "states": ["federal"], "chambers": ["senate"],
                 "first": 2019, "last": 2026, "pid": "90002", "current": True, "prints": ["Sample"]},
            ]}


def box_export():
    """What the 18 Oct box export did to such a roster, in miniature."""
    doc = copy.deepcopy(shipped())
    doc["meta"] = {"generated": "2026-10-18", "people": 5, "speeches": 70}
    alex, sam, scoped, kim = doc["people"]
    del alex["party"]                                       # a pinned party lost
    scoped["speeches"] = 30; del scoped["speech_count_basis"]  # a pending count published as a number
    kim["speeches"] = 12; kim["last"] = 2026                  # a count moved
    doc["people"] = [alex, scoped, kim,                       # a row gone
                     {"name": "Robin Newcomer", "speeches": 6, "pid": "90003", "current": True},   # rows added
                     {"name": "Lee Former", "speeches": 7, "pid": "90004"}]
    return doc


class OverlayTests(unittest.TestCase):
    def test_every_shipped_row_is_kept_exactly_and_new_rows_are_held(self):
        merged, report = overlay(shipped(), box_export())
        self.assertEqual(merged, shipped())
        self.assertEqual(report["held"], ["Lee Former", "Robin Newcomer"])
        self.assertEqual(report["held_sitting"], ["Robin Newcomer"])
        self.assertEqual(report["dropped"], ["Sam Fixture"])
        self.assertEqual(report["differ"], 3)
        self.assertEqual(report["fields"]["speeches"], 2)

    def test_a_folded_print_is_neither_new_nor_dropped(self):
        before = shipped(); before["people"].append({"name": "Sample", "speeches": 3, "party": "Greens"})
        after = copy.deepcopy(before); after["people"] = [p for p in after["people"] if p["name"] != "Sample"]
        merged, report = overlay(before, after)
        self.assertEqual(merged, before)
        self.assertEqual(report["dropped"], [])

    def test_the_summary_names_held_sitting_members_for_the_nightly_warning(self):
        _, report = overlay(shipped(), box_export())
        line = summary(report)
        self.assertIn("held 2 new row(s): Lee Former, Robin Newcomer", line)
        self.assertIn("1 held row(s) are sitting members: Robin Newcomer", line)
        self.assertIn("kept 1 row(s) the export dropped: Sam Fixture", line)

    def test_the_cli_rewrites_the_export_to_the_shipped_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            ship, export = Path(tmp) / "shipped.json", Path(tmp) / "export.json"
            ship.write_text(json.dumps(shipped(), ensure_ascii=False, separators=(",", ":")) + "\n")
            export.write_text(json.dumps(box_export()))
            r = subprocess.run([sys.executable, str(ROOT / "scripts/roster_overlay.py"), "--directory", str(export),
                                "--shipped", str(ship)], capture_output=True, text=True, check=True)
            self.assertEqual(export.read_bytes(), ship.read_bytes())
            self.assertTrue(r.stderr.startswith("ROSTER OVERLAY: kept 4 shipped records"), r.stderr)


if __name__ == "__main__":
    unittest.main()
