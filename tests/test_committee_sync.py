"""The knowledge-box push treats House and Joint committee rows like Senate ones: same select, same duplicate ranking."""
import sqlite3

from parli.ingest import arag_sync

TEXT = "x" * 260


def make():
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.execute("CREATE TABLE speeches (speech_id INTEGER PRIMARY KEY, speaker_name TEXT, date TEXT, text TEXT, source TEXT, "
               "chamber TEXT, topic TEXT, state TEXT, party TEXT, electorate TEXT, person_id TEXT, word_count INT)")
    return db


def add(db, sid, source, speaker="Ms Bullock", date="2026-09-18", text=TEXT, topic="Committee - Inquiry", chamber="house_committee"):
    db.execute("INSERT INTO speeches VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (sid, speaker, date, text, source, chamber, topic, "federal", None, None, None, 40))


def pushed(db):
    arag_sync.prepare_dedupe(db, arag_sync.DEFAULT_SINCE)
    sel = arag_sync.TABLES["speeches"]["select"].format(since=arag_sync.DEFAULT_SINCE)
    return {r["speech_id"] for r in db.execute(sel, (0, 10 ** 9)).fetchall()}


def test_house_and_joint_committee_rows_are_pushed():
    db = make()
    add(db, 1, "committee_house", text="house " + TEXT)
    add(db, 2, "committee_joint", text="joint " + TEXT, chamber="joint_committee")
    add(db, 3, "committee_senate", text="senate " + TEXT, chamber="senate_committee")
    assert pushed(db) == {1, 2, 3}


def test_the_chair_is_still_kept_out_of_the_box_for_every_committee_house():
    db = make()
    for sid, src in enumerate(("committee_senate", "committee_house", "committee_joint"), 1):
        add(db, sid, src, speaker="CHAIR", text=f"{src} " + TEXT)
    add(db, 9, "committee_house", speaker="Mr KENNEDY")
    assert pushed(db) == {9}


def test_an_exact_duplicate_keeps_a_committee_row_over_a_state_hansard_row():
    db = make()
    add(db, 1, "nsw_hansard", speaker="Mr X", chamber="nsw_la")
    add(db, 2, "committee_house", speaker="Mr X")
    add(db, 3, "openaustralia", speaker="Mr Y", chamber="representatives")
    add(db, 4, "committee_joint", speaker="Mr Y", chamber="joint_committee")
    assert pushed(db) == {2, 3}          # committee beats nsw; openaustralia beats committee
