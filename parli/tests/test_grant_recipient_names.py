"""Recipient display names never keep a str.title() possessive (search-hubs-011)."""
from collections import Counter
import unittest

from parli.ingest.grant_recipients import display_name


class DisplayNameTests(unittest.TestCase):
    def test_a_correct_spelling_beats_the_titlecased_possessive(self):
        self.assertEqual(display_name(Counter({"St Paul'S Lutheran Child Care Centre Nundah": 5,
                                               "St Paul's Lutheran Child Care Centre Nundah": 1}),
                                      "ST PAUL'S LUTHERAN CHILD CARE CENTRE NUNDAH"),
                         "St Paul's Lutheran Child Care Centre Nundah")

    def test_the_only_spelling_has_its_possessive_lowercased(self):
        self.assertEqual(display_name(Counter({"Kate'S Place Kindergarten": 3}), None), "Kate's Place Kindergarten")
        self.assertEqual(display_name(Counter({"Children’S Educare Centre Pty Ltd": 2}), "CHILDRENS EDUCARE CENTRE PTY LTD"),
                         "Children’s Educare Centre Pty Ltd")

    def test_other_capitals_after_an_apostrophe_are_untouched(self):
        self.assertEqual(display_name(Counter({"O'Sullivan Family Trust": 1}), None), "O'Sullivan Family Trust")
        self.assertEqual(display_name(Counter({"D'Arcy Street Kindergarten": 1}), None), "D'Arcy Street Kindergarten")


if __name__ == "__main__":
    unittest.main()
