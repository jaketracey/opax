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

    def test_names_that_share_nothing_with_the_abn_holder_are_not_aliases(self):
        # contracts-grants-011: the verifier's examples, each a source name filed under another organisation's ABN
        cases = [
            (("Sunshine Coast Health Network Ltd.", "SUNSHINE COAST HEALTH NETWORK LTD"),
             ["South Western Sydney Primary Health Network Ltd.", "Sunshine Coast Health Network"],
             ["Sunshine Coast Health Network"], ["South Western Sydney Primary Health Network Ltd."]),
            (("The University of Sydney", "THE UNIVERSITY OF SYDNEY"), ["Griffith University", "Uni of Sydney"],
             ["Uni of Sydney"], ["Griffith University"]),
            (("University of New South Wales", "THE UNIVERSITY OF NEW SOUTH WALES"),
             ["Commonwealth Scientific and Industrial Research Organisation (CSIRO)", "UNSW", "Gladstone Community Linking Agency Inc"],
             ["UNSW"], ["Commonwealth Scientific and Industrial Research Organisation (CSIRO)", "Gladstone Community Linking Agency Inc"]),
            # joined words, misspellings and initialisms stay with the holder
            (("Indel-Ability Arts Ltd", None), ["Indelabilityarts Ltd"], ["Indelabilityarts Ltd"], []),
            (("Carpentaria Shire Council", None), ["CARPENTERIA SHIRE COUNCIL"], ["CARPENTERIA SHIRE COUNCIL"], []),
            (("Central Western Queensland Remote Area Planning and Development Board", None), ["RAPAD Skilling"], ["RAPAD Skilling"], []),
            (("The Council of the Queensland Institute of Medical Research", None), ["QIMR Berghofer Medical Research Institute"],
             ["QIMR Berghofer Medical Research Institute"], []),
            # a holder named only in common words is compared on those words
            (("The University of Queensland", "THE UNIVERSITY OF QUEENSLAND"),
             ["Queensland University of Technology", "University of Queensland"],
             ["University of Queensland"], ["Queensland University of Technology"]),
            (("Health Management Pty Ltd", None), ["Health Management Pty Ltd T/A Launch FNQ"], ["Health Management Pty Ltd T/A Launch FNQ"], []),
        ]
        for names, aliases, kept, differing in cases:
            self.assertEqual(export_grants.split_aliases(aliases, names), (kept, differing), names[0])

    def test_the_remote_program_ships_both_rules(self):
        program = export_grants.remote_program()
        compile(program, "remote", "exec")
        for needle in ("def award_value", "def source_title", "def split_aliases", "GENERIC_NAME_WORDS = frozenset", '"v": award_value(g["v"])',
                       'source_title(r["title"]) or r["program"]', 'if k == "v" or v not in (None, "", 0)'):
            self.assertIn(needle, program)


if __name__ == "__main__":
    unittest.main()
