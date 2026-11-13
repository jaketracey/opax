"""plan() in wikidata_mpid_match.py: only current, full-named members without a portrait, and only through a
single APH MP ID for their pid. Invented names."""
import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.wikidata_mpid_match import plan


class Plan(unittest.TestCase):
    def test_matches_only_by_one_mp_id(self):
        people = [
            {"name": "Tessa Quill", "pid": "90001", "current": True},     # wanted
            {"name": "Quill", "pid": "90001", "current": True},           # surname print: never
            {"name": "Oren Vale", "pid": "90002", "current": True},       # already has a face
            {"name": "Ida Marsh", "pid": "90003", "current": False},      # not current
            {"name": "Pia Brook", "pid": None, "current": True},          # no pid, no MP ID
            {"name": "Rex Dunmore", "pid": "90004", "current": True},     # two MP IDs on one pid
        ]
        pay = {"AAA1": {"pid": "90001"}, "BBB2": {"pid": "90002"}, "CCC3": {"pid": "90004"}, "DDD4": {"pid": "90004"}}
        wanted, report = plan(people, {"oren vale": "90002"}, pay)
        self.assertEqual({k: v["name"] for k, v in wanted.items()}, {"AAA1": "Tessa Quill"})
        self.assertEqual(report["Quill"], "single-name print, left alone")
        self.assertIn("no APH MP ID", report["Pia Brook"])
        self.assertIn("several MP IDs", report["Rex Dunmore"])
        self.assertNotIn("Oren Vale", report)
        self.assertNotIn("Ida Marsh", report)


if __name__ == "__main__":
    unittest.main()
