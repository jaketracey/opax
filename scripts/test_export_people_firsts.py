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
    {"name": "Morgan Unlisted", "pid": "90013", "states": ["federal"], "chambers": ["representatives"]},
    {"name": "Noel Returner", "pid": "90014", "states": ["federal"], "chambers": ["representatives"]},
    {"name": "Oakley Both", "pid": "90015", "states": ["federal"], "chambers": ["senate"]},
    {"name": "Perry Doubled", "pid": "90016", "states": ["federal"], "chambers": ["representatives"]},
    {"name": "Quinn Disagree", "pid": "90017", "states": ["federal"], "chambers": ["representatives"]},
]}

# With the filler rows below, the record of House speeches starts 1 Jun 1995 (one stray speech in 1994 does not
# move it), of Senate speeches 16 Aug 2011, of NSW Assembly speeches 7 May 2019, and of divisions 7 Feb 2006 in
# both federal houses (one stray House division in 2004 does not move it). No other chamber has a dense year.
#
# The Parliamentary Handbook's service start: the first-ever entry to parliament. (phid, chamber, start, person_id)
HANDBOOK = [
    ("h01", "representatives", "2007-11-24", "90001"),   # entered inside the record: firsts
    ("h02", "senate", "1996-07-01", "90002"),            # entered before the Senate record starts: earliest
    ("h11", "representatives", "2010-08-21", "90011"),   # inside the record, but no speech held for years after
    ("h12", "senate", "2012-07-01", "90012"),            # a senator only, by the Handbook; the speech is in the House
    ("h14", "representatives", "1987-07-11", "90014"),   # left in 1993, returned in 1998: first entry is before the record
    ("h15", "both", "2013-09-07", "90015"),              # moved from the House to the Senate
    ("h16", "representatives", "2016-07-02", "90016"),   # two Handbook people matched to one roster id
    ("h17", "representatives", "2016-07-02", "90016"),
    ("h18", "representatives", "2016-07-02", "90017"),   # the members table dates the entry earlier
    ("h19", "senate", "2011-07-01", None),               # matched to nobody
]
# The members table: one row per person, the LATEST membership's chamber and entry. Never the source of a first.
MEMBERS = [
    ("90001", "representatives", "2007-11-24"),
    ("90002", "senate", "1996-07-01"),
    ("90011", "representatives", "2010-08-21"),
    ("90012", "senate", "2012-07-01"),
    ("90013", "representatives", "2016-07-02"),   # inside the record, but no Handbook person: not enough
    ("90014", "representatives", "1998-10-03"),   # the return, not the first entry
    ("90015", "senate", "2019-07-01"),            # the second chamber
    ("90016", "representatives", "2016-07-02"),
    ("90017", "representatives", "2010-08-21"),
    ("90099", "senate", "unknown"),
]

SCHEMA = """
CREATE TABLE speeches (speech_id INTEGER PRIMARY KEY, person_id TEXT, speaker_name TEXT, party TEXT, electorate TEXT,
                       chamber TEXT, date TEXT, topic TEXT, text TEXT, source TEXT, state TEXT, witness_name TEXT,
                       speaker_type TEXT);
CREATE TABLE divisions (division_id INTEGER PRIMARY KEY, house TEXT, name TEXT, date TEXT, number INTEGER,
                        state TEXT);
CREATE TABLE votes (division_id INTEGER, person_id TEXT, vote TEXT);
CREATE TABLE members (person_id TEXT PRIMARY KEY, chamber TEXT, entered_house TEXT);
CREATE TABLE ext_handbook_people (phid TEXT PRIMARY KEY, chamber TEXT, service_start TEXT, person_id TEXT);
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
    speech(92, "Morgan Unlisted", "2016-09-13"),
    speech(93, "Noel Returner", "1998-11-10"),
    speech(94, "Oakley Both", "2019-07-23", chamber="senate"),
    speech(95, "Perry Doubled", "2016-09-01"),
    speech(96, "Quinn Disagree", "2016-09-01"),
    # One stray early House speech: it must not move the start of the House record.
    speech(97, "Filler Member", "1994-05-03"),
]
# Ten sitting days in a year make a chamber's record dense enough to have a start.
SPEECHES += [speech(1000 + n, "Filler Member", f"1995-06-{n + 1:02d}") for n in range(10)]
SPEECHES += [speech(1100 + n, "Filler Member", f"2011-08-{n + 16:02d}", chamber="senate") for n in range(10)]
SPEECHES += [speech(1200 + n, "Filler Member", f"2019-05-{n + 7:02d}", chamber="nsw_la", state="nsw",
                    source="nsw_hansard") for n in range(10)]

DIVISIONS = [
    (501, "representatives", "A bill", "2008-02-13", 2, "federal"),
    (502, "representatives", "A bill", "2008-02-13", 1, "federal"),
    (503, "representatives", "A bill", "2008-03-11", 1, "federal"),
    (504, "senate", "A bill", "2011-08-17", 3, None),
    (505, "nsw_la", "A state division in the legacy table", "2001-01-01", 1, "nsw"),
    (506, "senate", "A bill", "2006-02-07", None, "federal"),
    (507, "representatives", "A bill", "2006-02-07", 1, "federal"),
    (508, "representatives", "A bill", "2010-09-28", 1, "federal"),
    (509, "representatives", "A stray early division", "2004-03-01", 1, "federal"),
    (511, "senate", "A division with no number", "2012-03-01", None, "federal"),
]
DIVISIONS += [(600 + n, house, "A bill", f"2006-02-{n + 7:02d}", 1, "federal")
              for n in range(10) for house in ("representatives",)]
DIVISIONS += [(700 + n, "senate", "A bill", f"2006-02-{n + 7:02d}", 1, "federal") for n in range(10)]
VOTES = [
    (501, "90001", "aye"), (502, "90001", "no"), (503, "90001", "aye"),
    (504, "90002", "no"),
    (505, "90001", "aye"),            # not a federal division
    (506, "90008", "absent"),         # absent is not a recorded vote
    (506, "90002", "abstention"),
    (504, "90099", "aye"),            # nobody in the roster
    (508, "90011", "aye"),            # five weeks after entering: a first, though the speech is not
    (511, "90008", "aye"),            # the only aye or no this senator has, in a division with no number
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
    db.executemany("INSERT INTO ext_handbook_people VALUES (?,?,?,?)", HANDBOOK)
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
        self.assertEqual(set(self.doc["by_pid"]), {"90001", "90002", "90011", "90012", "90013", "90014", "90015",
                                                   "90016", "90017"})

    def test_meta_dates_the_record_and_names_the_sources(self):
        meta = self.doc["meta"]
        self.assertEqual((meta["schema"], meta["generated"], meta["roster_generated"]), (1, "2026-11-15", "2026-11-14"))
        self.assertEqual(meta["speeches_since"], "1993-03-13")
        # Coverage is what the database holds per chamber, never a constant: the first day of the first year with
        # ten days of rows. The stray 1994 speech and 2004 division do not move the House's starts, and a chamber
        # with no dense year has no start at all.
        self.assertEqual(meta["coverage"], {
            "speeches": {"nsw_la": "2019-05-07", "representatives": "1995-06-01", "senate": "2011-08-16"},
            "divisions": {"representatives": "2006-02-07", "senate": "2006-02-07"}})
        self.assertEqual(meta["coverage_earliest_row"], {
            "speeches": {"nsw_la": "2019-05-07", "qld_la": "2024-02-13", "representatives": "1994-05-03",
                         "sa_ha": "2001-03-01", "senate": "2011-08-16", "vic_la": "2015-02-10"},
            "divisions": {"nsw_la": "2019-05-07", "qld_la": "2024-02-14", "representatives": "2004-03-01",
                          "senate": "2006-02-07", "vic_la": "2015-02-11"}})
        self.assertEqual(meta["coverage_min_days"], 10)
        self.assertEqual((meta["people"], meta["first_speeches"], meta["first_divisions"]), (12, 11, 5))
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

    def test_another_chamber_no_handbook_person_or_no_roster_id_is_never_a_first(self):
        self.assertNotIn("first", self.doc["by_pid"]["90012"]["first_speech"])   # a senator only; spoke in the House
        # The members table alone dates this entry inside the record. That is not enough: it holds the latest
        # membership, so only the Handbook's first-ever entry can carry a first.
        self.assertNotIn("service_from", self.doc["by_pid"]["90013"])
        self.assertNotIn("first", self.doc["by_pid"]["90013"]["first_speech"])
        for person in self.doc["by_name"].values():
            self.assertNotIn("service_from", person)
            for fact in ("first_speech", "first_division"):
                self.assertNotIn("first", person.get(fact, {}))

    def test_a_member_who_returned_after_service_from_before_the_record_is_never_a_first(self):
        # Left in 1993, came back in 1998, the House record from 1995: the members table says entered 3 Oct 1998
        # and the earliest speech held is 10 Nov 1998. The Handbook's first entry, 1987, is before the record.
        person = self.doc["by_pid"]["90014"]
        self.assertEqual(person["service_from"], "1987-07-11")
        self.assertEqual(person["first_speech"], {"date": "1998-11-10", "chamber": "representatives",
                                                  "slug": "speech-93"})

    def test_a_member_who_moved_chamber_is_never_a_first_in_either(self):
        person = self.doc["by_pid"]["90015"]
        self.assertEqual(person["service_from"], "2013-09-07")
        self.assertNotIn("first", person["first_speech"])     # their first Senate speech, after years in the House
        self.assertFalse(export.is_first("2013-11-12", "representatives", ("2013-09-07", "both"),
                                         {"representatives": "1995-06-01"}))

    def test_two_handbook_people_or_sources_that_disagree_give_no_entry_date(self):
        for pid in ("90016", "90017"):
            self.assertNotIn("service_from", self.doc["by_pid"][pid])
            self.assertNotIn("first", self.doc["by_pid"][pid]["first_speech"])

    def test_revert_guard_the_members_table_would_call_the_returner_a_first(self):
        # What the first version did: entry date and chamber from the members table.
        self.assertTrue(export.is_first("1998-11-10", "representatives", ("1998-10-03", "representatives"),
                                        {"representatives": "1995-06-01"}))
        self.assertFalse(export.is_first("1998-11-10", "representatives", ("1987-07-11", "representatives"),
                                         {"representatives": "1995-06-01"}))

    def test_coverage_needs_a_dense_year_and_one_stray_row_does_not_move_it(self):
        year = [f"1998-03-{d:02d}" for d in range(2, 12)]
        self.assertEqual(export.coverage_start(set(year)), ("1998-03-02", "1998-03-02"))
        self.assertEqual(export.coverage_start(set(year) | {"1993-05-04"}), ("1998-03-02", "1993-05-04"))
        self.assertEqual(export.coverage_start(set(year[:9])), (None, "1998-03-02"))        # nine days: no start
        self.assertEqual(export.coverage_start(set(year[:9]) | {"1999-02-08"}), (None, "1998-03-02"))
        self.assertEqual(export.coverage_start(set()), (None, None))
        # Revert guard: the bare earliest row is what the first version used.
        self.assertNotEqual(export.coverage_start(set(year) | {"1993-05-04"})[0], "1993-05-04")

    def test_a_federal_division_with_no_number_is_not_published(self):
        # Harper Silent's only aye or no is in division 511, which has no number: its address would be the whole
        # sitting day's page, so nothing is published for them (they have no speech either).
        self.assertIn((511, "90008", "aye"), VOTES)
        self.assertNotIn("90008", self.doc["by_pid"])
        for person in self.doc["by_pid"].values():
            if "first_division" in person:
                self.assertRegex(person["first_division"]["url"], r"/\d{4}-\d{2}-\d{2}/\d+$")

    def test_the_coverage_is_printed_per_chamber_for_review(self):
        import contextlib
        import io
        import tempfile
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "parli.db")
            memory, disk = database(), sqlite3.connect(path)
            memory.commit()  # a backup waits on an open write
            memory.backup(disk)
            memory.close()
            disk.close()
            roster = os.path.join(tmp, "roster.json")
            with open(roster, "w", encoding="utf-8") as f:
                json.dump(ROSTER, f)
            out, err = io.StringIO(), io.StringIO()
            with patch.object(export, "DB", f"file:{path}?mode=ro"), patch.object(export, "ROSTER", roster), \
                    contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                export.main()
        self.assertEqual(json.loads(out.getvalue())["by_pid"], self.doc["by_pid"])
        printed = err.getvalue()
        self.assertIn("[firsts] coverage speeches representatives: from 1995-06-01; earliest row 1994-05-03", printed)
        self.assertIn("[firsts] coverage divisions representatives: from 2006-02-07; earliest row 2004-03-01", printed)
        self.assertIn("[firsts] coverage speeches vic_la: none (no year with 10 days of rows); earliest row 2015-02-10",
                      printed)
        self.assertIn("(1 marked first)", printed)

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
        self.assertFalse(export.is_first("2008-07-02", "senate", ("2008-07-01", "senate"), {"senate": None}))
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
