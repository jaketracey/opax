"""D5: recorded-stage titles and leading speaker labels, using committed bills."""
import json
from pathlib import Path
import sqlite3
import unittest

from scripts import export_bills as export

ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = json.loads((ROOT / "tests/fixtures/design_p2d/divisions.json").read_text())["examples"]
NAMES = tuple(row["speaker"] for row in EXAMPLES)


class DivisionDisplayTests(unittest.TestCase):
    def test_twenty_real_questions_keep_all_words_after_the_leading_name(self):
        self.assertEqual(len(EXAMPLES), 20)
        for row in EXAMPLES:
            with self.subTest(key=row["before"]["key"]):
                self.assertEqual(export.clean_division_question(row["before"]["question"], NAMES),
                                 row["after"]["question"])
                self.assertEqual(export.division_title(row["before"]["stage"]), row["after"]["title"])

    def test_examples_match_committed_bills_before_or_after_the_nightly_export(self):
        for row in EXAMPLES:
            doc = json.loads((ROOT / row["bill_file"]).read_text())
            division = next(d for d in doc["divisions"] if d["key"] == row["before"]["key"])
            self.assertIn(division["question"], (row["before"]["question"], row["after"]["question"]))
            self.assertEqual(division["stage"], row["before"]["stage"])

    def test_presiding_officer_labels_and_honorifics(self):
        cases = {
            "The Deputy President (Senator X) put the question that the bill be read a second time.":
                "put the question that the bill be read a second time.",
            "The ACTING DEPUTY PRESIDENT (Senator Smith): The question is that the amendment be agreed to.":
                "The question is that the amendment be agreed to.",
            "The TEMPORARY CHAIRMAN: The question is that section 42 stand as printed.":
                "The question is that section 42 stand as printed.",
            "The Speaker—Mr Smith: The question is that the bill be read a third time.":
                "The question is that the bill be read a third time.",
            "The Deputy President—Senator Smith put the question that the amendment be agreed to.":
                "put the question that the amendment be agreed to.",
            "Senator Doug Cameron: The question now is that this bill be read a second time.":
                "The question now is that this bill be read a second time.",
            "Mr Ian Goodenough The question is that the bill be read a second time.":
                "The question is that the bill be read a second time.",
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(export.clean_division_question(raw, NAMES), expected)

    def test_names_before_the_question_work_without_a_roster_match(self):
        raw = "Doug Cameron The question now is that this bill be read a second time."
        self.assertEqual(export.clean_division_question(raw), raw.removeprefix("Doug Cameron "))

    def test_preserves_substantive_text_markdown_quotes_and_later_names(self):
        raw_cases = [
            'The majority voted against an [amendment](https://example.test). Senator X explained it.',
            'That the amendment moved by Senator X be agreed to.',
            '"Doug Cameron The question is that this bill be read a second time."',
            '**Doug Cameron** The question is that this bill be read a second time.',
            'The Deputy President (Senator X) explained why Senator Y moved an amendment.',
            'Tax Laws Amendment Bill 2013 - Second Reading - Agree with the main idea.',
            'Speaker Recognition Bill 2026 - Second Reading',
            'Ian Goodenoughs proposal be agreed to.',
            '',
        ]
        for raw in raw_cases:
            with self.subTest(raw=raw):
                self.assertEqual(export.clean_division_question(raw, NAMES), raw)
        self.assertIsNone(export.clean_division_question(None, NAMES))

    def test_longest_recorded_name_wins_and_cleaning_is_idempotent(self):
        names = ("Bert Van", "Bert Van Manen")
        self.assertEqual(export.clean_division_question("Bert Van Manen I move: That the bill be read.", names),
                         "I move: That the bill be read.")
        for row in EXAMPLES:
            cleaned = row["after"]["question"]
            self.assertEqual(export.clean_division_question(cleaned, NAMES), cleaned)

    def test_stage_titles_normalise_case_without_inventing_a_stage_or_result(self):
        cases = {
            "Second reading": "Second reading", "THIRD READING": "Third reading",
            "First Reading": "First reading", "In committee": "In committee",
            "Committee of the Whole": "Committee of the whole",
            "Consideration in Detail": "Consideration in detail",
            "Agreed to amendment": "Agreed to amendment",
            "Motion to Suspend Standing Orders": "Motion to suspend standing orders",
            "Report from Federation Chamber": "Report from Federation Chamber",
            "Consideration of Senate message": "Consideration of Senate message",
            "Second Reading – Increase Jobseeker Payment": "Second reading",
            "  Third\n reading  ": "Third reading",
            "Business motion": "Business motion", "Bill": "Bill",
            "Unfamiliar recorded stage": "Unfamiliar recorded stage",
            "": None, None: None,
        }
        for raw, expected in cases.items():
            with self.subTest(stage=raw):
                self.assertEqual(export.division_title(raw), expected)

    def test_export_adds_only_an_optional_title_and_cleans_question(self):
        with sqlite3.connect(":memory:") as db:
            db.row_factory = sqlite3.Row
            db.executescript("""
                CREATE TABLE members(full_name TEXT);
                CREATE TABLE ext_divisions(id, jurisdiction, date, house, name, question,
                    ayes_count, noes_count, result, source_url);
                CREATE TABLE ext_votes(jurisdiction, division_id, person_id, vote);
            """)
            db.executemany("INSERT INTO members VALUES (?)", [(name,) for name in NAMES])
            for row in EXAMPLES:
                d = row["before"]
                db.execute("INSERT INTO ext_divisions VALUES (?,?,?,?,?,?,?,?,?,?)", (
                    d["key"], "federal", d["date"], d["house"], "Fixture Bill 2026 - " + d["stage"],
                    d["question"], d["ayes"], d["noes"], d["outcome"], d["url"]))
            db.execute("INSERT INTO ext_divisions VALUES ('unnamed','federal','2026-10-01','senate',"
                       "'Unnamed division','The question is that the motion be agreed to.',1,0,'passed','https://example.test')")
            db.execute("INSERT INTO ext_divisions VALUES ('fallback','federal','2026-10-01','senate',"
                       "'Fixture Bill 2026 - Third Reading',NULL,1,0,'passed','https://example.test')")
            # Exercise votes and their coverage through the unchanged export path.
            key = EXAMPLES[0]["before"]["key"]
            db.executemany("INSERT INTO ext_votes VALUES ('federal',?,?,?)", [
                (key, "1", "aye"), (key, "2", "no"), (key, "3", "paired")])
            divisions = export.load_divisions(db, export.PartyTimeline({}, {"1": "Labor", "2": "Liberal"}))
        for row in EXAMPLES:
            before = row["before"]
            projected = {k: v for k, v in divisions[before["key"]].items() if not k.startswith("_")}
            expected = row["after"]
            if before["key"] == key:
                expected = {**expected, "party_splits": {"Labor": {"ayes": 1, "noes": 0},
                    "Liberal": {"ayes": 0, "noes": 1}}, "party_coverage": {"member": 2}, "paired": 1}
            else:
                expected = {**expected, "party_splits": {}, "party_coverage": {}, "paired": 0}
            self.assertEqual(projected, expected)
        self.assertNotIn("title", divisions["unnamed"])
        self.assertIsNone(divisions["unnamed"]["stage"])
        self.assertEqual(divisions["fallback"]["question"], "Fixture Bill 2026 - Third Reading")
        self.assertEqual(divisions["fallback"]["title"], "Third reading")


if __name__ == "__main__":
    unittest.main()
