import unittest

from scripts.generate_reports import (
    debate_title,
    is_hollow_brief,
    is_hollow_speech,
    is_hollow_title,
    select_key_moments,
)


class KeyMomentPredicateTests(unittest.TestCase):
    def test_debate_title_removes_ingest_wrapper(self):
        self.assertEqual(
            debate_title(
                "Kevin Rudd — Apology to Australia's Indigenous Peoples — 2008-02-13",
                "Kevin Rudd",
                "2008-02-13",
            ),
            "Apology to Australia's Indigenous Peoples",
        )
        self.assertEqual(debate_title("Kevin Rudd — 2008-02-13", "Kevin Rudd", "2008-02-13"), "")

    def test_hollow_titles_are_rejected(self):
        for title in (
            "Bills",
            "Questions without Notice",
            "Points of Order",
            "Senate division, 20 March 2024",
            "Environment and Communications Legislation Committee Estimates CLIMATE CHANGE, ENERGY, THE ENVIRONMENT AND WATER PORTFOLIO",
        ):
            with self.subTest(title=title):
                self.assertTrue(is_hollow_title(title))
        self.assertFalse(is_hollow_title("Apology to Australia's Indigenous Peoples"))

    def test_short_and_procedural_speeches_are_rejected(self):
        self.assertTrue(is_hollow_speech("I move: That this bill be now read a second time."))
        self.assertTrue(is_hollow_speech(
            "The answer to the honourable member's question is: " + "not available " * 200))
        substantive = (
            "I move: That this bill be now read a second time. "
            + "This reform changes the law because communities have waited for action. " * 45
        )
        self.assertFalse(is_hollow_speech(substantive))

    def test_missing_or_single_procedural_briefs_are_rejected(self):
        self.assertTrue(is_hollow_brief(None))
        self.assertTrue(is_hollow_brief("The speaker moved the second reading of a bill."))
        self.assertFalse(is_hollow_brief(
            "The speech argued that the bill would restore native-title protections removed by earlier amendments. "
            "It linked the reform to the response to the Wik decision and explained the practical effect on claimants."
        ))


class KeyMomentSpreadTests(unittest.TestCase):
    def test_selection_uses_distinct_speakers_years_and_two_parliaments(self):
        candidates = []
        for i, (speaker, year, state, score) in enumerate((
            ("A", "2008", "federal", 10.0),
            ("B", "2009", "federal", 9.9),
            ("C", "2010", "nsw", 9.0),
            ("A", "2011", "vic", 8.9),
            ("D", "2010", "qld", 8.8),
            ("E", "2020", "sa", 8.5),
        )):
            candidates.append({
                "slug": f"speech-{i}", "speaker": speaker, "date": f"{year}-01-01",
                "state": state, "title": f"Debate {i}", "base_score": score,
                "query_indexes": [i],
            })
        selected = select_key_moments(candidates, limit=4)
        self.assertEqual(len(selected), 4)
        self.assertEqual(len({c["speaker"] for c in selected}), 4)
        self.assertEqual(len({c["date"][:4] for c in selected}), 4)
        self.assertGreaterEqual(len({c["state"] for c in selected}), 2)


if __name__ == "__main__":
    unittest.main()
