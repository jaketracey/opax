"""speakers.json counts each committee turn once, even when its hearing was loaded twice.

    python3 -m unittest scripts/test_export_speakers.py
"""
import sqlite3
import unittest

from scripts import export_speakers as export

LONG = "Senator, the department has provided that advice to the minister on several occasions. " * 4


def db_with(rows):
    db = sqlite3.connect(":memory:")
    db.execute("""CREATE TABLE speeches (speech_id INTEGER PRIMARY KEY, speaker_name TEXT, speaker_name_clean TEXT,
                  party TEXT, chamber TEXT, date TEXT, text TEXT, source TEXT, hearing_id TEXT, speaker_type TEXT)""")
    db.executemany("INSERT INTO speeches VALUES (?,?,?,?,?,?,?,?,?,?)", rows)
    return db


def turn(sid, name, text=LONG, date="2025-03-27", hearing="committees/estimate/28779/0005", source="committee_senate",
         speaker_type="witness"):
    return (sid, f"Mr {name.split()[-1]}", name, None, "senate_committee", date, text, source, hearing, speaker_type)


class ExactTwinTests(unittest.TestCase):
    def test_a_hearing_loaded_twice_counts_once_and_keeps_the_lower_id(self):
        first = [turn(100 + i, "Reece Kershaw", LONG + f" Answer {i}.") for i in range(6)]
        # The second load of the same transcript: same hearing, date, speaker and text, later ids.
        second = [turn(10260 + i, "Reece Kershaw", LONG + f" Answer {i}.") for i in range(6)]
        rows, twins = export.count_speakers(db_with(first + second))
        self.assertEqual(rows, [["Reece Kershaw", 6]])
        self.assertEqual(twins, 6)

    def test_repeated_text_in_different_hearings_or_days_is_not_a_twin(self):
        rows, twins = export.count_speakers(db_with([
            turn(1, "Adam Fennessy"), turn(2, "Adam Fennessy", hearing="committees/estimate/28743/0004"),
            turn(3, "Adam Fennessy", date="2025-02-24"), turn(4, "Adam Fennessy", LONG + " Different."),
            # Another witness saying the same words in the same hearing is their own turn.
            turn(5, "Kym Ayscough"),
        ]), min_speeches=1)
        self.assertEqual(rows, [["Adam Fennessy", 4], ["Kym Ayscough", 1]])
        self.assertEqual(twins, 0)

    def test_chamber_speeches_without_a_hearing_are_never_folded(self):
        rows, twins = export.count_speakers(db_with([
            (i, "Paterson, James, Senator", "James Paterson", "LP", "senate", "2025-03-27", LONG, "openaustralia", None, "member")
            for i in range(1, 6)
        ]))
        self.assertEqual(rows, [["James Paterson", 5]])
        self.assertEqual(twins, 0)

    def test_corpus_rules_still_apply(self):
        rows, _ = export.count_speakers(db_with(
            [turn(i, "Linda Reynolds") for i in range(1, 5)]                      # four: under the floor
            + [turn(10 + i, "Short Answer", "Yes.") for i in range(6)]              # under 200 characters
            + [turn(20 + i, "The Chair", LONG + str(i), speaker_type="chair") for i in range(6)]
        ), min_speeches=2)
        # Linda Reynolds' four turns share one text in one hearing: one turn, under the floor of two.
        self.assertEqual(rows, [])


if __name__ == "__main__":
    unittest.main()
