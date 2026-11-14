"""Portrait candidates need dated house evidence, including after witness splits."""
import unittest

from scripts.portrait_candidates import candidate_problem, unique_portrait


class Candidates(unittest.TestCase):
    def test_an_imageless_namesake_still_blocks_a_portrait(self):
        roy = {"label": "Roy Butler", "img": "Commons portrait"}
        liza = {"label": "Liza Butler", "img": None}
        self.assertEqual(unique_portrait({"Q62560699": roy}), ("Q62560699", roy))
        self.assertIsNone(unique_portrait({"Q62560699": roy, "Q117294364": liza}))
        self.assertIsNone(unique_portrait({"Q117294364": liza}))

    def person(self, **extra):
        return {"name": "Lane", "first": 2025, "last": 2026, "states": ["nsw"], "chambers": ["nsw_la"], **extra}

    def test_an_alias_needs_name_and_dated_service(self):
        match = {"label": "Jordan Lane"}
        self.assertIsNone(candidate_problem(self.person(), match, {"nsw_la": [(2023, None)]}))
        self.assertIsNotNone(candidate_problem(self.person(), match, {"nsw_la": [(None, None)]}))
        self.assertIsNotNone(candidate_problem(self.person(), match, {"nsw_la": [(2023, 2025)]}))

    def test_namesakes_and_wrong_chambers_stay_apart(self):
        # Russell sits in the Council; Dana sits in the House. The print's old
        # "full" value is insufficient evidence for either person's portrait.
        person = self.person(name="Wortley", states=["sa"], chambers=["sa_ha"], full="Russell Wortley")
        self.assertIsNotNone(candidate_problem(person, {"label": "Russell Wortley"}, {"sa_lc": [(2006, None)]}))
        self.assertIsNotNone(candidate_problem(person, {"label": "Dana Wortley"}, {"sa_ha": [(2014, None)]}))
        self.assertIsNotNone(candidate_problem(self.person(name="David Cox"), {"label": "Dorinda Cox"}, {"nsw_la": [(1990, None)]}))

    def test_witnesses_mixed_parliaments_and_committee_only_are_held(self):
        match = {"label": "Jordan Lane"}; terms = {"nsw_la": [(2023, None)]}
        for person in [self.person(witness_rows=1), self.person(states=["nsw", "federal"]),
                       self.person(chambers=["senate_committee"])]:
            self.assertIsNotNone(candidate_problem(person, match, terms))
        self.assertIsNone(candidate_problem(self.person(separated_witnesses={"speeches": 10}), match, terms))

    def test_adjacent_election_terms_cover_the_print(self):
        self.assertIsNone(candidate_problem(self.person(first=2018), {"label": "Jordan Lane"},
                                            {"nsw_la": [(2018, 2022), (2022, None)]}))
        self.assertIsNotNone(candidate_problem(self.person(first=2018), {"label": "Jordan Lane"},
                                               {"nsw_la": [(2018, 2020), (2022, None)]}))


if __name__ == "__main__":
    unittest.main()
