"""OpenAustralia people.csv APH ids (members-electorates-009): the six '70000'-style rows are restored."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts import oa_people_ids  # noqa: E402
from scripts.corrections.apply import CorrectionError  # noqa: E402
from scripts.export_profile_links import build_profile_links  # noqa: E402

CSV = ("person count,aph id,name,birthday,alt name\n"
       "650,70000,Amanda Eloise Vanstone,,,\n"
       "7,R36,Anthony Norman Albanese,,,\n")
ENTRY = {"id": "650", "field": "aph_id", "from": "70000", "to": "7E4",
         "evidence_url": "https://handbookapi.aph.gov.au/api/individuals?$filter=PHID%20eq%20%277E4%27",
         "evidence": "Handbook PHID 7E4: VANSTONE, the Hon. Amanda Eloise, AO", "finding": "members-electorates-009",
         "reviewed": "2026-11-10"}


class AphIds(unittest.TestCase):
    def test_the_reviewed_correction_restores_the_handbook_id(self):
        rows = dict((n, a) for n, a, _ in oa_people_ids.rows(CSV, [ENTRY]))
        self.assertEqual(rows, {"650": "7E4", "7": "R36"})

    def test_the_shipped_corrections_cover_every_damaged_row_of_the_pinned_csv(self):
        entries = oa_people_ids.corrections.load("oa-people")
        self.assertEqual(sorted(e["to"] for e in entries), ["3E4", "4E4", "5E4", "6E4", "7E4", "8E4"])
        self.assertTrue(all(oa_people_ids.suspect(e["from"]) for e in entries))

    def test_a_source_that_is_fixed_upstream_stops_for_review(self):
        with self.assertRaises(CorrectionError):
            oa_people_ids.rows(CSV.replace("70000", "7E4"), [ENTRY])

    def test_profile_links_publish_the_handbook_id(self):
        roster = {"people": [{"name": "Amanda Vanstone", "pid": "10650"}]}
        out = build_profile_links(CSV, roster, {}, {}, [ENTRY])
        self.assertEqual(out["people"]["10650"]["aphMpid"], "7E4")
        self.assertTrue(out["people"]["10650"]["aphProfileUrl"].endswith("MPID=7E4"))

    def test_an_unexplained_exponent_id_is_refused(self):
        roster = {"people": [{"name": "Amanda Vanstone", "pid": "10650"}]}
        with self.assertRaises(ValueError):
            build_profile_links(CSV, roster, {}, {}, [])


if __name__ == "__main__":
    unittest.main()
