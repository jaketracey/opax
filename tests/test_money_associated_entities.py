"""Rule 9 of export_money_graph.py: the AEC associated-entity register flags a donor, never moves it.

The same treatment for every party (Jake, 11 November 2026): a donor the register ties to a party it
gives to carries associatedWith and an "associated entity of <party>, per AEC register" tag; its
receipts, amounts and rank are untouched, and a party the register does not name gets nothing."""
import sqlite3
import unittest

from scripts import export_money_graph as federal

ROWS = [
    ("Vapold Pty Ltd", "Liberal Party of Australia (Victorian Division)", "2008-2009"),
    ("Vapold Pty Ltd", "Liberal Party of Australia (Victorian Division)", "2024-25"),
    ("Shop, Distributive and Allied Employees Association", "Australian Labor Party (Victorian Branch)", "2019-20"),
    ("Shop, Distributive and Allied Employees Association", "Australian Labor Party (N.S.W. Branch)", "2019-20"),
    ("Shop, Distributive and Allied Employees Association", "Australian Labor Party (ACT Branch)", "2023-24"),
    ("Some Other Pty Ltd", "Liberal Party of Australia (Victorian Division)", "2020-21"),
]


def register():
    db = sqlite3.connect(":memory:")
    db.execute("CREATE TABLE associated_entities (entity_name TEXT, associated_party TEXT, financial_year TEXT, source TEXT)")
    db.executemany("INSERT INTO associated_entities VALUES (?, ?, ?, 'aec_assoc_entity')", ROWS)
    db.execute("INSERT INTO associated_entities VALUES ('Westpac Banking Corporation', 'Liberal Party of Australia', '2020-21', 'other_source')")
    return federal.load_associated_register(db, {}, {})


def donor(name, **parties):
    return {"eid": None, "names": [name], "parties": {p: {"total": t} for p, t in parties.items()}}


class AssociatedEntityTests(unittest.TestCase):
    def test_both_parties_are_flagged_with_the_register_wording_and_years(self):
        reg = register()
        vapold = federal.associated_fields(donor("Vapold Pty Ltd", Liberal=100), reg)
        self.assertEqual(vapold["associatedTag"], "associated entity of Liberal Party of Australia (Victorian Division), "
                                                  "per AEC register (returns 2008-09 to 2024-25)")
        self.assertEqual([(a["party"], a["source"], a["url"]) for a in vapold["associatedWith"]],
                         [("Liberal", "aec_assoc_entity", federal.ASSOCIATED_REGISTER_URL)])
        sda = federal.associated_fields(donor("Shop, Distributive and Allied Employees Association", Labor=50), reg)
        self.assertEqual(sda["associatedTag"], "associated entity of Labor, per AEC register (returns 2019-20 to 2023-24; 3 party entries)")
        self.assertEqual(len(sda["associatedWith"][0]["registerParties"]), 3)

    def test_a_party_the_register_does_not_name_gets_no_flag(self):
        reg = register()
        # Vapold giving to Labor is not an associated entity of Labor.
        self.assertEqual(federal.associated_fields(donor("Vapold Pty Ltd", Labor=10), reg), {})
        both = federal.associated_fields(donor("Vapold Pty Ltd", Labor=10, Liberal=5), reg)
        self.assertEqual([a["party"] for a in both["associatedWith"]], ["Liberal"])

    def test_only_the_aec_register_flags_a_donor(self):
        reg = register()
        self.assertEqual(federal.associated_fields(donor("Westpac Banking Corporation", Liberal=10), reg), {})

    def test_the_flag_never_touches_the_donor_record(self):
        d = donor("Vapold Pty Ltd", Liberal=100)
        before = repr(d)
        federal.associated_fields(d, register())
        self.assertEqual(repr(d), before)


if __name__ == "__main__":
    unittest.main()
