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

from scripts import roster_accept
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
                                "--shipped", str(ship), "--accept", str(Path(tmp) / "none.json")],
                               capture_output=True, text=True, check=True)
            self.assertEqual(export.read_bytes(), ship.read_bytes())
            self.assertTrue(r.stderr.startswith("ROSTER OVERLAY: kept 4 shipped records"), r.stderr)


if __name__ == "__main__":
    unittest.main()


def accept_list():
    """A review of box_export(): Kim's count rise and Robin's new row accepted; the rest held."""
    return {"evidence": {
                "hansard-growth": {"kind": "corpus", "rule": "growth", "earliest": 2019, "checked": "2026-10-18", "reason": "x"},
                "handbook": {"kind": "identity", "url": "https://handbookapi.aph.gov.au/api/individuals",
                             "checked": "2026-10-18", "reason": "x"}},
            "records": {"Kim Sample": [{"evidence": "hansard-growth", "fields": {"speeches": [9, 12], "last": [2026, 2026]}}]},
            "new": {"Robin Newcomer": {"evidence": "handbook", "url": "https://handbookapi.aph.gov.au/api/individuals",
                                       "checked": "2026-10-18", "row": {"name": "Robin Newcomer", "speeches": 6, "pid": "90003",
                                       "current": True, "states": ["federal"], "chambers": ["senate"], "first": 2026}}}}


class AcceptListTests(unittest.TestCase):
    def export(self):
        doc = box_export()
        doc["people"][3].update(states=["federal"], chambers=["senate"], first=2026)
        return doc

    def test_only_accepted_values_the_export_still_shows_are_installed(self):
        merged, report = overlay(shipped(), self.export(), accept_list())
        by = {p["name"]: p for p in merged["people"]}
        self.assertEqual(by["Kim Sample"]["speeches"], 12)
        self.assertIn("Robin Newcomer", by)
        self.assertEqual(report["accepted"], 2)
        # everything not accepted is exactly as shipped: the lost party, the pending count, the dropped row
        for p in shipped()["people"]:
            if p["name"] != "Kim Sample":
                self.assertEqual(by[p["name"]], p)
        self.assertEqual(report["held"], ["Lee Former"])
        self.assertEqual(merged["meta"]["people"], 5)
        self.assertEqual(merged["meta"]["speeches"], sum(p.get("speeches") or 0 for p in merged["people"]))
        self.assertEqual([p.get("speeches") or 0 for p in merged["people"]],
                         sorted((p.get("speeches") or 0 for p in merged["people"]), reverse=True))

    def test_a_value_that_moves_again_is_held_and_the_accepted_one_stays(self):
        first, _ = overlay(shipped(), self.export(), accept_list())
        later = self.export()
        later["people"][2]["speeches"] = 14
        later["people"][3]["speeches"] = 7
        merged, report = overlay(first, later, accept_list())
        self.assertEqual(merged, first)
        self.assertEqual(report["accepted"], 0)
        # and before it was ever installed, a moved value installs nothing
        merged, report = overlay(shipped(), later, accept_list())
        self.assertEqual(merged["people"], shipped()["people"])
        self.assertEqual(sorted(report["accept_held"]), ["Kim Sample", "Robin Newcomer"])

    def test_a_night_with_nothing_new_installs_the_same_bytes(self):
        first, _ = overlay(shipped(), self.export(), accept_list())
        again, report = overlay(first, self.export(), accept_list())
        self.assertIs(again["meta"], first["meta"])
        self.assertEqual(json.dumps(again, separators=(",", ":")), json.dumps(first, separators=(",", ":")))
        self.assertEqual(report["accepted"], 0)

    def test_revert_restores_the_roster_before_the_list(self):
        merged, _ = overlay(shipped(), self.export(), accept_list())
        key = lambda people: sorted(people, key=lambda p: p["name"])  # noqa: E731
        self.assertEqual(key(roster_accept.revert(merged["people"], accept_list())), key(shipped()["people"]))

    def test_corpus_evidence_cannot_carry_a_fall_an_identity_or_a_new_house(self):
        acc = accept_list()
        ev = acc["evidence"]["hansard-growth"]
        for fields, why in [({"speeches": [9, 8]}, "falls"), ({"party": ["Greens", "Labor"]}, "identity"),
                            ({"chambers": [["senate"], ["senate", "representatives"]]}, "house"),
                            ({"first": [2023, 2001]}, "first year"), ({"last": [2026, 2025]}, "earlier")]:
            with self.subTest(fields=fields):
                self.assertIn(why, roster_accept.corpus_reason("Kim Sample", fields, ev))
        self.assertIsNone(roster_accept.corpus_reason("Kim Sample", {"chambers": [["senate"], ["senate", "senate_committee"]]}, ev))
        self.assertIn("presiding", roster_accept.corpus_reason("Kim Sample", {"speeches": [9, 2]},
                      {"kind": "corpus", "rule": "presiding", "people": {}}))

    def test_validate_wants_sources_for_identity_and_complete_new_rows(self):
        acc = accept_list()
        acc["records"]["Alex Example"] = [{"evidence": "handbook", "fields": {"party": [None, "Greens"]}}]
        del acc["evidence"]["handbook"]["url"]
        acc["new"]["Newcomer"] = {"evidence": "handbook", "url": "https://x.invalid", "checked": "2026-10-18",
                                  "row": {"name": "Newcomer", "speeches": 6}}
        problems = roster_accept.validate(acc, shipped()["people"])
        self.assertTrue(any("Alex Example: identity evidence without a source URL" in p for p in problems), problems)
        self.assertTrue(any("Newcomer: a new row needs a full name" in p for p in problems), problems)
        self.assertTrue(any("Alex Example: shipped record holds neither" in p for p in problems), problems)

    def test_the_committed_list_is_valid_and_installed(self):
        people = json.loads((ROOT / "portal/public/parliamentarians.json").read_text())["people"]
        acc = roster_accept.load()
        self.assertEqual(roster_accept.validate(acc, people), [])
        for p in people:
            for g in acc["records"].get(p["name"], []):
                self.assertEqual(roster_accept.state(p, g), "applied", p["name"])
