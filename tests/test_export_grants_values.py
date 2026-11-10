"""Award values and titles as the grants export publishes them (search-hubs-008, search-hubs-017)."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import export_grants  # noqa: E402


class AwardValueTests(unittest.TestCase):
    def test_a_zero_award_is_published_as_zero_and_small_values_keep_their_cents(self):
        self.assertEqual(export_grants.award_value(0.0), 0)
        self.assertEqual(export_grants.award_value(0.4), 0.4)
        self.assertEqual(export_grants.award_value(-0.25), -0.25)
        self.assertEqual(export_grants.award_value(201261002.96), 201261003)

    def test_placeholder_titles_fall_back_and_real_titles_stay(self):
        for title in ("N/A", "NA", "-", " n/a ", None, ""):
            self.assertFalse(export_grants.source_title(title))
        self.assertEqual(export_grants.source_title("Subsidised rents"), "Subsidised rents")
        self.assertEqual(export_grants.source_title("NAPLAN support"), "NAPLAN support")

    def test_the_remote_program_ships_both_rules(self):
        program = export_grants.remote_program()
        compile(program, "remote", "exec")
        for needle in ("def award_value", "def source_title", '"v": award_value(g["v"])',
                       'source_title(r["title"]) or r["program"]', 'if k == "v" or v not in (None, "", 0)'):
            self.assertIn(needle, program)


if __name__ == "__main__":
    unittest.main()
