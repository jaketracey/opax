"""Reviewed provisional member ids re-key to the OpenAustralia id (members-electorates-012)."""
import unittest

from scripts import member_ids
from scripts.corrections import apply as corrections


class MemberIdTests(unittest.TestCase):
    def test_the_committed_corrections_are_valid(self):
        entries = corrections.load(member_ids.DATASET)
        self.assertEqual(member_ids.aliases(entries), {"aph_25813": "11065"})
        for e in entries:
            self.assertTrue(e["evidence_url"].startswith("https://"))

    def test_bleyer_rows_merge_under_the_openaustralia_id_keeping_the_entry_date(self):
        rows = [dict(person_id="aph_25813", full_name="Vanessa Bleyer", state="federal", chamber="senate",
                     electorate="Tasmania", entered_house="2026-01-01", left_house=None),
                dict(person_id="11065", full_name="Vanessa Bleyer", state="federal", chamber="senate",
                     electorate="Tasmania", entered_house=None, left_house=None),
                dict(person_id="10007", full_name="Anthony Albanese", state="federal", chamber="representatives",
                     electorate="Grayndler", entered_house="1996-03-02", left_house=None)]
        out = member_ids.members(rows)
        self.assertEqual([(r["person_id"], r["entered_house"]) for r in out],
                         [("11065", "2026-01-01"), ("10007", "1996-03-02")])

    def test_rows_without_the_provisional_id_pass_through_and_ids_elsewhere_are_unchanged(self):
        rows = [dict(person_id="11065", full_name="Vanessa Bleyer", chamber="senate", electorate="Tasmania")]
        self.assertEqual(member_ids.members(rows), rows)
        self.assertEqual(member_ids.canonical("aph_25813"), "11065")
        self.assertEqual(member_ids.canonical("aph_99999"), "aph_99999")
        self.assertIsNone(member_ids.canonical(None))

    def test_a_namesake_in_another_seat_is_not_merged(self):
        rows = [dict(person_id="aph_25813", full_name="Vanessa Bleyer", chamber="senate", electorate="Tasmania"),
                dict(person_id="11065", full_name="Vanessa Bleyer", chamber="senate", electorate="Victoria")]
        self.assertEqual(len(member_ids.members(rows)), 2)

    def test_the_interests_register_files_under_the_roster_id(self):
        from scripts.export_interests import document_key
        doc = dict(person_id="aph_25813", jurisdiction="federal", member_name="Vanessa Bleyer", member_name_raw="")
        self.assertEqual(document_key(doc), "11065")
        self.assertEqual(document_key(dict(doc, person_id=None, jurisdiction="qld", member_name="Mark Furner")), "n-mark-furner")


if __name__ == "__main__":
    unittest.main()
