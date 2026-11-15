"""people/firsts.json: each roster person's first speech and first division in the record, from a synthetic database.

    python3 -m unittest scripts/test_export_people_firsts.py

No production data: every person, speech and division here is made up. The sample the apps' decoder test reads
(portal/test/fixtures/people-firsts.sample.json) is this fixture's own output, and a test below holds the two equal.
"""
import json
import os
import sqlite3
import unittest

from scripts import export_people_firsts as export

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLE = os.path.join(os.path.dirname(HERE), "portal", "test", "fixtures", "people-firsts.sample.json")
LONG = "I rise to speak on the bill before the House and to set out what it would change. " * 4

ROSTER = {"meta": {"generated": "2026-11-14"}, "people": [
    {"name": "Avery Example", "pid": "90001", "states": ["federal"], "chambers": ["representatives"],
     "aliases": ["Avery Jordan Example"], "prints": ["Example"]},
    {"name": "Blair Sample", "pid": "90002", "states": ["federal"], "chambers": ["senate", "senate_committee"]},
    {"name": "Casey Specimen", "states": ["nsw"], "chambers": ["nsw_la"]},
    # Two rows answer to the print "Twin" in the same chamber: neither may take its speeches.
    {"name": "Drew Twin", "states": ["vic"], "chambers": ["vic_la"], "prints": ["Twin"]},
    {"name": "Emery Twin", "states": ["vic"], "chambers": ["vic_la"], "prints": ["Twin"]},
    {"name": "Flynn Scoped", "states": ["qld"], "chambers": ["qld_la"],
     "speech_scope": {"state": "qld", "chamber": "qld_la", "service": []}},
    {"name": "Gray Listed", "pid": "90007", "states": ["federal"], "chambers": ["representatives"], "roster_only": True},
    {"name": "Harper Silent", "pid": "90008", "states": ["federal"], "chambers": ["senate"]},
    {"name": "Indy Witness", "states": ["federal"], "chambers": ["senate"]},
    {"name": "Jules Committee", "pid": "aph_jc1", "states": ["federal"], "chambers": ["senate", "senate_committee"]},
    {"name": "Kai Late", "pid": "90011", "states": ["federal"], "chambers": ["representatives"]},
    {"name": "Lou Mover", "pid": "90012", "states": ["federal"], "chambers": ["representatives"]},
    {"name": "Morgan Undated", "pid": "90013", "states": ["federal"], "chambers": ["representatives"]},
]}

# (person_id, chamber, entered_house). The record of House speeches starts 1 Jun 1995 here, of Senate speeches
# 16 Aug 2011, and of divisions 7 Feb 2006 in both houses (the earliest rows below).
MEMBERS = [
    ("90001", "representatives", "2007-11-24"),   # entered inside the record: firsts
    ("90002", "senate", "1996-07-01"),            # entered before the Senate record starts: earliest, not first
    ("90011", "representatives", "2010-08-21"),   # inside the record, but nothing held for years after
    ("90012", "senate", "2012-07-01"),            # the entry date is to another chamber
    ("90013", "representatives", "unknown"),      # no entry date held
    ("90099", "senate", "2011-07-01"),            # nobody in the roster
]

SCHEMA = """
CREATE TABLE speeches (speech_id INTEGER PRIMARY KEY, person_id TEXT, speaker_name TEXT, party TEXT, electorate TEXT,
                       chamber TEXT, date TEXT, topic TEXT, text TEXT, source TEXT, state TEXT, witness_name TEXT,
                       speaker_type TEXT);
CREATE TABLE divisions (division_id INTEGER PRIMARY KEY, house TEXT, name TEXT, date TEXT, number INTEGER,
                        state TEXT);
CREATE TABLE votes (division_id INTEGER, person_id TEXT, vote TEXT);
CREATE TABLE members (person_id TEXT PRIMARY KEY, chamber TEXT, entered_house TEXT);
CREATE TABLE ext_divisions (id TEXT PRIMARY KEY, jurisdiction TEXT, house TEXT, date TEXT, number INTEGER,
                            name TEXT, source TEXT, source_url TEXT);
CREATE TABLE ext_votes (id INTEGER PRIMARY KEY, division_id TEXT, jurisdiction TEXT, house TEXT, date TEXT,
                        source TEXT, person_name TEXT, vote TEXT);
"""


def speech(sid, name, day, chamber="representatives", state="federal", text=None, source="openaustralia",
           witness=None, speaker_type=None, pid=None):
    return (sid, pid, name, "", None, chamber, day, "A bill", text or f"{LONG} ({sid})", source, state, witness,
            speaker_type)


SPEECHES = [
    # Avery Example: the print on the earliest day, then the full name; a short interjection earlier still.
    speech(10, "Avery Example", "2008-02-14"),
    speech(11, "Example", "2008-02-12"),
    speech(12, "Example", "2008-02-12"),
    speech(13, "Avery Example", "2008-02-11", text="Hear, hear!"),
    # Before the record starts.
    speech(14, "Avery Example", "1990-05-01"),
    # Another parliament's "Example" is not this row's.
    speech(15, "Example", "2001-03-01", chamber="sa_ha", state="sa", source="sa_hansard"),
    # Blair Sample: a committee turn is earlier than the first speech in the chamber.
    speech(20, "Blair Sample", "2011-07-04", chamber="senate_committee", source="committee_senate"),
    speech(21, "Blair Sample", "2011-08-16", chamber="senate"),
    # Casey Specimen: a state member with no roster id.
    speech(30, "Casey Specimen", "2019-05-07", chamber="nsw_la", state="nsw", source="nsw_hansard"),
    # The shared print, and each twin's own full name.
    speech(40, "Twin", "2015-02-10", chamber="vic_la", state="vic", source="vic_hansard"),
    speech(41, "Drew Twin", "2015-03-17", chamber="vic_la", state="vic", source="vic_hansard"),
    speech(50, "Flynn Scoped", "2024-02-13", chamber="qld_la", state="qld", source="qld_hansard"),
    speech(60, "Gray Listed", "1995-06-01"),
    # Testimony is never a member's speech, however it is flagged.
    speech(70, "Indy Witness", "2025-03-27", chamber="senate", witness="Indy Witness"),
    speech(71, "Indy Witness", "2025-03-28", chamber="senate", speaker_type="witness"),
    speech(80, "Jules Committee", "2025-02-24", chamber="senate_committee", source="committee_senate"),
    speech(90, "Kai Late", "2013-03-12"),
    speech(91, "Lou Mover", "2012-08-14"),
    speech(92, "Morgan Undated", "2016-09-13"),
]

DIVISIONS = [
    (501, "representatives", "A bill", "2008-02-13", 2, "federal"),
    (502, "representatives", "A bill", "2008-02-13", 1, "federal"),
    (503, "representatives", "A bill", "2008-03-11", 1, "federal"),
    (504, "senate", "A bill", "2011-08-17", 3, None),
    (505, "nsw_la", "A state division in the legacy table", "2001-01-01", 1, "nsw"),
    (506, "senate", "A bill", "2006-02-07", None, "federal"),
    (507, "representatives", "A bill", "2006-02-07", 1, "federal"),
    (508, "representatives", "A bill", "2010-09-28", 1, "federal"),
]
VOTES = [
    (501, "90001", "aye"), (502, "90001", "no"), (503, "90001", "aye"),
    (504, "90002", "no"),
    (505, "90001", "aye"),            # not a federal division
    (506, "90008", "absent"),         # absent is not a recorded vote
    (506, "90002", "abstention"),
    (504, "90099", "aye"),            # nobody in the roster
    (508, "90011", "aye"),            # five weeks after entering: a first, though the speech is not
]
EXT_DIVISIONS = [
    ("nsw-la-2019-05-08-1", "nsw", "nsw_la", "2019-05-08", 1, "A bill", "nsw_hansard_api",
     "https://www.parliament.nsw.gov.au/Hansard/Pages/HansardResult.aspx#/docid/EXAMPLE-1"),
    ("nsw-la-2019-05-07-1", "nsw", "nsw_la", "2019-05-07", 1, "A bill", "nsw_hansard_api", None),
    ("vic-la-2015-02-11-1", "vic", "vic_la", "2015-02-11", 1, "A bill", "vic_hansard_pdf",
     "https://www.parliament.vic.gov.au/example/2015-02-11.pdf"),
    ("qld-la-2024-02-14-1", "qld", "qld_la", "2024-02-14", 1, "A bill", "an_unlisted_source",
     "https://documents.parliament.qld.gov.au/example.pdf"),
    ("federal-senate-504", "federal", "senate", "2011-08-17", 3, "A bill", "theyvoteforyou",
     "https://theyvoteforyou.org.au/divisions/senate/2011-08-17/3"),
]
EXT_VOTES = [
    ("nsw-la-2019-05-08-1", "nsw", "nsw_la", "2019-05-08", "nsw_hansard_api", "Casey Specimen", "aye"),
    ("nsw-la-2019-05-07-1", "nsw", "nsw_la", "2019-05-07", "nsw_hansard_api", "Casey Specimen", "aye"),  # no source
    ("vic-la-2015-02-11-1", "vic", "vic_la", "2015-02-11", "vic_hansard_pdf", "Twin", "aye"),            # two claimants
    ("vic-la-2015-02-11-1", "vic", "vic_la", "2015-02-11", "vic_hansard_pdf", "Emery Twin", "no"),
    ("vic-la-2015-02-11-1", "vic", "vic_la", "2015-02-11", "vic_hansard_pdf", "Drew Twin", "paired"),
    ("qld-la-2024-02-14-1", "qld", "qld_la", "2024-02-14", "an_unlisted_source", "Flynn Scoped", "aye"),
    ("federal-senate-504", "federal", "senate", "2011-08-17", "theyvoteforyou", "Harper Silent", "aye"),  # federal is by pid
]


def database(speeches=SPEECHES):
    db = sqlite3.connect(":memory:")
    db.executescript(SCHEMA)
    db.executemany("INSERT INTO speeches VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", speeches)
    db.executemany("INSERT INTO divisions VALUES (?,?,?,?,?,?)", DIVISIONS)
    db.executemany("INSERT INTO votes VALUES (?,?,?)", VOTES)
    db.executemany("INSERT INTO members VALUES (?,?,?)", MEMBERS)
    db.executemany("INSERT INTO ext_divisions VALUES (?,?,?,?,?,?,?,?)", EXT_DIVISIONS)
    db.executemany("INSERT INTO ext_votes (division_id, jurisdiction, house, date, source, person_name, vote) "
                   "VALUES (?,?,?,?,?,?,?)", EXT_VOTES)
    return db


def built(roster=ROSTER, speeches=SPEECHES):
    db = database(speeches)
    try:
        return export.build(db, roster, today="2026-11-15")
    finally:
        db.close()


class FirstsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc = built()

    def test_first_speech_is_the_earliest_corpus_speech_under_the_rows_own_names(self):
        # The print's speech on 12 Feb, the lower id of that day; not the short interjection, the pre-record
        # speech or the South Australian namesake.
        self.assertEqual(self.doc["by_pid"]["90001"]["first_speech"],
                         {"date": "2008-02-12", "chamber": "representatives", "slug": "speech-11", "first": True})

    def test_committee_turns_and_testimony_are_not_speeches(self):
        self.assertEqual(self.doc["by_pid"]["90002"]["first_speech"],
                         {"date": "2011-08-16", "chamber": "senate", "slug": "speech-21"})
        self.assertNotIn("Indy Witness", self.doc["by_name"])
        self.assertNotIn("aph_jc1", self.doc["by_pid"])

    def test_first_division_is_the_earliest_aye_or_no_with_its_source(self):
        self.assertEqual(self.doc["by_pid"]["90001"]["first_division"], {
            "date": "2008-02-13", "chamber": "representatives", "source": "theyvoteforyou", "first": True,
            "url": "https://theyvoteforyou.org.au/divisions/representatives/2008-02-13/1"})
        self.assertEqual(self.doc["by_pid"]["90002"]["first_division"]["url"],
                         "https://theyvoteforyou.org.au/divisions/senate/2011-08-17/3")
        # Absent, and a federal vote that is only in the ext_ tables under a name, give nothing.
        self.assertNotIn("90008", self.doc["by_pid"])

    def test_a_state_member_is_keyed_by_name_and_a_division_without_a_source_is_not_published(self):
        self.assertEqual(self.doc["by_name"]["Casey Specimen"], {
            "first_speech": {"date": "2019-05-07", "chamber": "nsw_la", "slug": "speech-30"},
            "first_division": {"date": "2019-05-08", "chamber": "nsw_la", "source": "nsw_hansard_api",
                               "url": "https://www.parliament.nsw.gov.au/Hansard/Pages/HansardResult.aspx#/docid/EXAMPLE-1"}})

    def test_a_name_two_rows_answer_to_belongs_to_neither(self):
        self.assertEqual(self.doc["by_name"]["Drew Twin"],
                         {"first_speech": {"date": "2015-03-17", "chamber": "vic_la", "slug": "speech-41"}})
        self.assertEqual(set(self.doc["by_name"]["Emery Twin"]), {"first_division"})

    def test_scoped_and_roster_only_rows_get_no_speech_and_an_unlisted_source_no_division(self):
        self.assertNotIn("Flynn Scoped", self.doc["by_name"])
        self.assertNotIn("90007", self.doc["by_pid"])

    def test_a_row_with_a_pid_is_never_under_by_name(self):
        named = {row["name"] for row in ROSTER["people"] if row.get("pid")}
        self.assertFalse(named & set(self.doc["by_name"]))
        self.assertEqual(set(self.doc["by_pid"]), {"90001", "90002", "90011", "90012", "90013"})

    def test_meta_dates_the_record_and_names_the_sources(self):
        meta = self.doc["meta"]
        self.assertEqual((meta["schema"], meta["generated"], meta["roster_generated"]), (1, "2026-11-15", "2026-11-14"))
        self.assertEqual(meta["speeches_since"], "1993-03-13")
        # Coverage is what the database holds per chamber, never a constant.
        self.assertEqual(meta["coverage"], {
            "speeches": {"nsw_la": "2019-05-07", "qld_la": "2024-02-13", "representatives": "1995-06-01",
                         "sa_ha": "2001-03-01", "senate": "2011-08-16", "vic_la": "2015-02-10"},
            "divisions": {"nsw_la": "2019-05-07", "qld_la": "2024-02-14", "representatives": "2006-02-07",
                          "senate": "2006-02-07", "vic_la": "2015-02-11"}})
        self.assertEqual((meta["people"], meta["first_speeches"], meta["first_divisions"]), (8, 7, 5))
        self.assertEqual(meta["marked_first"], {"speeches": 1, "divisions": 2})
        self.assertEqual(meta["first_window_days"], 366)
        self.assertEqual(meta["sources"]["divisions"]["theyvoteforyou"], "They Vote For You")
        for person in [*self.doc["by_pid"].values(), *self.doc["by_name"].values()]:
            if "first_division" in person:
                self.assertIn(person["first_division"]["source"], meta["sources"]["divisions"])

    def test_no_wording_ranks_or_compares(self):
        text = export.dumps(self.doc).lower()
        for word in ("first ever", "youngest", "oldest", "longest", "most ", "record-", "ranks"):
            self.assertNotIn(word, text)

    def test_the_same_database_writes_the_same_bytes(self):
        self.assertEqual(export.dumps(self.doc), export.dumps(built()))

    def test_revert_guard_a_later_speech_does_not_replace_the_first(self):
        later = [s for s in SPEECHES if s[0] not in (11, 12)]
        self.assertEqual(built(speeches=later)["by_pid"]["90001"]["first_speech"],
                         {"date": "2008-02-14", "chamber": "representatives", "slug": "speech-10", "first": True})

    # "First" is a claim: one member of each kind, for speeches and for divisions.
    def test_entered_inside_the_record_speech_and_division_are_marked_first(self):
        person = self.doc["by_pid"]["90001"]
        self.assertEqual(person["service_from"], "2007-11-24")
        self.assertIs(person["first_speech"]["first"], True)
        self.assertIs(person["first_division"]["first"], True)

    def test_entered_before_the_record_starts_speech_and_division_are_never_marked_first(self):
        person = self.doc["by_pid"]["90002"]
        # Entered the Senate in 1996; its speeches are held from 2011 and its divisions from 2006.
        self.assertEqual(person["service_from"], "1996-07-01")
        self.assertNotIn("first", person["first_speech"])
        self.assertNotIn("first", person["first_division"])
        self.assertEqual(person["first_division"]["chamber"], "senate")

    def test_a_long_gap_after_entering_is_not_a_first_but_a_prompt_division_is(self):
        person = self.doc["by_pid"]["90011"]
        self.assertNotIn("first", person["first_speech"])          # 2013, entered 2010
        self.assertIs(person["first_division"]["first"], True)     # five weeks after entering

    def test_no_entry_date_another_chamber_or_no_roster_id_is_never_a_first(self):
        self.assertNotIn("first", self.doc["by_pid"]["90012"]["first_speech"])   # entered the Senate, spoke in the House
        self.assertNotIn("service_from", self.doc["by_pid"]["90013"])            # "unknown"
        self.assertNotIn("first", self.doc["by_pid"]["90013"]["first_speech"])
        for person in self.doc["by_name"].values():
            self.assertNotIn("service_from", person)
            for fact in ("first_speech", "first_division"):
                self.assertNotIn("first", person.get(fact, {}))

    def test_the_first_rule_at_its_edges(self):
        coverage = {"senate": "2006-02-07"}
        first = lambda day, entered, chamber="senate", into="senate": export.is_first(  # noqa: E731
            day, chamber, (entered, into) if entered else None, coverage)
        self.assertTrue(first("2006-02-07", "2006-02-07"))          # entered on the day the record starts
        self.assertFalse(first("2006-02-08", "2006-02-06"))         # entered the day before it
        self.assertTrue(first("2009-07-01", "2008-07-01"))          # 365 days
        self.assertFalse(first("2009-07-03", "2008-07-01"))         # 367 days
        self.assertFalse(first("2008-06-30", "2008-07-01"))         # held before the entry date: not their first entry
        self.assertFalse(first("2008-07-02", "2008-07-01", into="representatives"))
        self.assertFalse(first("2008-07-02", "2008-07-01", chamber="nsw_lc"))   # no coverage known
        self.assertFalse(first("2008-07-02", None))

    def test_revert_guard_dropping_the_coverage_test_would_call_an_earliest_speech_a_first(self):
        # The same member with the Senate's record starting before they entered IS a first: the rule turns on
        # coverage, not on the person.
        self.assertTrue(export.is_first("1996-08-20", "senate", ("1996-07-01", "senate"), {"senate": "1996-04-30"}))
        self.assertFalse(export.is_first("2011-08-16", "senate", ("1996-07-01", "senate"), {"senate": "2011-08-16"}))

    def test_the_committed_sample_is_this_fixtures_output(self):
        with open(SAMPLE, encoding="utf-8") as f:
            self.assertEqual(f.read(), export.dumps(self.doc))

    def test_the_file_stays_small_for_the_whole_roster(self):
        # Every one of 1,560 people with both facts and a long federal address: the ceiling, not the expectation.
        entry = {"service_from": "1996-03-02",
                 "first_speech": {"date": "1996-05-06", "chamber": "representatives", "first": True,
                                  "slug": "speech-1234567"},
                 "first_division": {"date": "2006-02-07", "chamber": "representatives", "first": True,
                                    "source": "theyvoteforyou",
                                    "url": "https://theyvoteforyou.org.au/divisions/representatives/2006-02-07/12"}}
        doc = {**self.doc, "by_pid": {str(10000 + i): entry for i in range(1560)}, "by_name": {}}
        self.assertLess(len(export.dumps(doc).encode()), 520_000)


if __name__ == "__main__":
    unittest.main()
