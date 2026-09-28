"""Who is speaking in a committee hearing: `committee_witnesses resolve` and the link_speakers guard.

The rule under test: a House / Joint / Senate committee row the ingest wrote from the transcript's markup is trusted for
what it is (member, witness, chair), a member is linked by the Handbook id in the transcript and never by surname, and a
witness who shares a surname with an MP stays a witness.
"""
import sqlite3
from pathlib import Path

import pytest

from parli.ingest import committee_hearings as ch
from parli.ingest import committee_witnesses as cw
from parli.ingest import handbook
from parli.ingest import link_speakers
from parli.schema import get_db

BASE = "committees/commrep/1"
LEGACY = "committees/estimate/9"


@pytest.fixture
def path(tmp_path):
    conn = get_db(tmp_path / "w.db")
    ch.ensure_schema(conn)
    conn.execute("PRAGMA foreign_keys = OFF")
    for pid, first, last, full, chamber, seat, party in [
        ("11019", "Simon", "Kennedy", "Simon Kennedy", "representatives", "Cook", "Liberal"),
        ("10310", "Jill", "Hall", "Jill Hall", "representatives", "Shortland", "Labor"),
        ("10749", "Ed", "Husic", "Ed Husic", "representatives", "Chifley", "Labor"),
        ("11009", "David", "Pocock", "David Pocock", "senate", "ACT", "Independent"),
        ("10001", "Trish", "Cook", "Trish Cook", "representatives", "Corio", "Labor"),
    ]:
        conn.execute("INSERT INTO members (person_id, first_name, last_name, full_name, chamber, electorate, party, state) "
                     "VALUES (?,?,?,?,?,?,?, 'federal')", (pid, first, last, full, chamber, seat, party))
    conn.execute("INSERT INTO members (person_id, first_name, last_name, full_name, chamber, state) "
                 "VALUES ('wragge_kennedy', '', 'Kennedy', 'Kennedy', 'representatives', 'federal')")
    # the transcript's ids -> people (what `committee_witnesses fetch` stores)
    conn.executescript(handbook.DDL)
    for phid, pid, disp in [("267506", "11019", "KENNEDY, Simon Peter"), ("91219", "10749", "HUSIC, the Hon. Edham (Ed)"),
                            ("256136", "11009", "POCOCK, David Willmer"), ("555555", None, "NOBODY, Unmatched")]:
        conn.execute("INSERT INTO ext_handbook_people (phid, display_name, person_id, match_basis, fetched_at) VALUES (?,?,?,?,?)",
                     (phid, disp, pid, "surname + first name" if pid else "no member", "2026-09-29T00:00:00Z"))
    conn.execute("INSERT INTO ext_committee_hearings (hearing_base, dataset, hearing_date, status, parser_version, first_seen) "
                 "VALUES (?,?,?,?,2,'2026-09-29T00:00:00Z')", (BASE, "commrep", "2026-09-18", "Proof"))
    conn.execute("INSERT INTO ext_committee_attendance (hearing_base, seq, honorific, honorific_class, name, surname, position, "
                 "organisation, kind, fragment, fetched_at) VALUES (?,1,'Ms','ms','Rebecca Kennedy','Kennedy','Director',"
                 "'Department of Finance','witness','0001','x')", (BASE,))
    conn.execute("INSERT INTO ext_committee_attendance (hearing_base, seq, honorific, honorific_class, name, surname, position, "
                 "organisation, kind, fragment, fetched_at) VALUES (?,2,'Mr','mr','Peter Cook','Cook','Assistant Secretary',"
                 "'Treasury','witness','0001','x')", (BASE,))
    conn.commit()
    conn.close()
    return str(tmp_path / "w.db")


def add(path, hearing, name, kind, text="x" * 80, person_id=None, phid=None, source="committee_house", cur_type="-"):
    conn = sqlite3.connect(path)
    cols = "speaker_name, chamber, date, topic, text, word_count, source, state, hearing_id, person_id, handbook_id"
    vals = [name, "house_committee", "2026-09-18", "t", text, 1, source, "federal", hearing + "/0001", person_id, phid]
    if cur_type == "-":
        cur_type = kind
    conn.execute(f"INSERT INTO speeches ({cols}, speaker_type, witness_name) VALUES ({','.join('?' * 11)}, ?, ?)",
                 vals + [cur_type, name if kind == "witness" else None])
    sid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()
    return sid


def row(path, sid):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    r = conn.execute("SELECT * FROM speeches WHERE speech_id = ?", (sid,)).fetchone()
    conn.close()
    return r


def test_an_mp_and_a_witness_with_the_same_surname_are_never_confused(path):
    mp = add(path, BASE, "Mr KENNEDY", "member", phid="267506")
    witness = add(path, BASE, "Ms Kennedy", "witness")
    cw.cmd_resolve(path, dry_run=False)
    m, w = row(path, mp), row(path, witness)
    assert (m["speaker_type"], m["person_id"], m["speaker_name_clean"], m["party_canonical"]) == ("member", "11019", "Simon Kennedy", "Liberal")
    assert (w["speaker_type"], w["person_id"], w["speaker_name_clean"], w["witness_name"]) == ("witness", None, "Rebecca Kennedy", "Rebecca Kennedy")
    assert (w["witness_position"], w["witness_organisation"]) == ("Director", "Department of Finance")


def test_a_witness_keeps_no_person_id_even_if_the_surname_linker_had_set_one(path):
    sid = add(path, BASE, "Mr Cook", "witness", person_id="10001")            # Trish Cook, filed by the surname linker
    cw.cmd_resolve(path, dry_run=False)
    r = row(path, sid)
    assert (r["speaker_type"], r["person_id"], r["speaker_name_clean"]) == ("witness", None, "Peter Cook")


def test_a_members_person_comes_from_the_handbook_id_not_from_the_label(path):
    # the label says "Mr KENNEDY" but the transcript's link is to Ed Husic (91219): the link wins
    sid = add(path, BASE, "Mr KENNEDY", "member", phid="91219")
    cw.cmd_resolve(path, dry_run=False)
    assert row(path, sid)["person_id"] == "10749" and row(path, sid)["speaker_name_clean"] == "Ed Husic"


def test_a_member_with_an_unmapped_or_missing_handbook_id_stays_unlinked_rather_than_guessed(path):
    a = add(path, BASE, "Mr KENNEDY", "member", phid="555555")
    b = add(path, BASE, "Mr KENNEDY", "member", phid=None)
    cw.cmd_resolve(path, dry_run=False)
    for sid in (a, b):
        r = row(path, sid)
        assert (r["speaker_type"], r["person_id"]) == ("member", None)         # not Simon Kennedy, not the wragge stub


def test_the_chair_is_a_chair_and_is_linked_when_the_transcript_names_them(path):
    named = add(path, BASE, "CHAIR", "chair", phid="91219")
    plain = add(path, BASE, "CHAIR", "chair")
    cw.cmd_resolve(path, dry_run=False)
    assert (row(path, named)["speaker_type"], row(path, named)["person_id"]) == ("chair", "10749")
    assert (row(path, plain)["speaker_type"], row(path, plain)["person_id"]) == ("chair", None)


def test_a_witness_missing_from_the_witness_list_keeps_the_transcripts_name_and_is_still_a_witness(path):
    sid = add(path, BASE, "Prof. Zed", "witness")
    cw.cmd_resolve(path, dry_run=False)
    r = row(path, sid)
    assert (r["speaker_type"], r["person_id"], r["speaker_name_clean"]) == ("witness", None, "Zed")


def test_resolve_is_idempotent_and_dry_run_writes_nothing(path):
    sid = add(path, BASE, "Mr KENNEDY", "member", phid="267506")
    cw.cmd_resolve(path, dry_run=True)
    assert row(path, sid)["person_id"] is None
    cw.cmd_resolve(path, dry_run=False)
    conn = sqlite3.connect(path)
    n_before = conn.execute("SELECT COUNT(*) FROM ext_committee_relinks").fetchone()[0]
    q_before = conn.execute("SELECT queued_at FROM ext_kb_patch_queue").fetchall()
    conn.close()
    cw.cmd_resolve(path, dry_run=False)
    conn = sqlite3.connect(path)
    assert conn.execute("SELECT COUNT(*) FROM ext_committee_relinks").fetchone()[0] == n_before
    assert conn.execute("SELECT queued_at FROM ext_kb_patch_queue").fetchall() == q_before


def test_older_rows_keep_the_honorific_rule(path):
    """Estimates rows from before the transcript-typed ingest: 'Senator X' is a member, anyone else a witness."""
    conn = sqlite3.connect(path)
    conn.execute("INSERT INTO ext_committee_attendance (hearing_base, seq, honorific, honorific_class, name, surname, position, "
                 "organisation, kind, fragment, fetched_at) VALUES (?,1,'Ms','ms','Margaret Hall','Hall','Deputy Secretary',"
                 "'Treasury','official','0001','x')", (LEGACY,))
    conn.commit()
    conn.close()
    sen = add(path, LEGACY, "Senator POCOCK", "member", person_id="11009", source="committee_senate", cur_type=None)
    hall = add(path, LEGACY, "Ms Hall", "witness", person_id="10310", source="committee_senate", cur_type=None)
    cw.cmd_resolve(path, dry_run=False)
    s, h = row(path, sen), row(path, hall)
    assert (s["speaker_type"], s["person_id"], s["speaker_name_clean"]) == ("member", "11009", "David Pocock")
    assert (h["speaker_type"], h["person_id"], h["speaker_name_clean"], h["witness_position"]) == ("witness", None, "Margaret Hall", "Deputy Secretary")


def test_a_queued_text_update_survives_the_speaker_patch_resolve_queues(path):
    sid = add(path, BASE, "Mr KENNEDY", "member", phid="267506")
    conn = sqlite3.connect(path)
    conn.execute("INSERT INTO ext_kb_patch_queue (slug, reason, status, queued_at) VALUES (?, 'text:proof_to_final', 'pending', 'x')",
                 (f"speech-{sid}",))
    conn.commit()
    conn.close()
    cw.cmd_resolve(path, dry_run=False)
    conn = sqlite3.connect(path)
    assert conn.execute("SELECT reason, status FROM ext_kb_patch_queue WHERE slug = ?", (f"speech-{sid}",)).fetchone() == ("text:proof_to_final", "pending")


def test_resolve_reads_committee_rows_by_source_not_by_a_like_scan(path):
    """`source LIKE 'committee%'` cannot use the (source, date) index and reads the whole 29 GB table."""
    import inspect
    assert "LIKE 'committee" not in inspect.getsource(cw.cmd_resolve) and "LIKE 'committee" not in inspect.getsource(cw.cmd_fetch)


# ---- fetch: the witness list stands in for an In Attendance block ------------------------------------------------------

def test_witness_rows_from_a_fragment_page():
    page = (Path(__file__).parent / "fixtures" / "committees" / "fragment_house.html").read_text(encoding="utf-8")
    rows = cw.witness_rows(page)
    assert [(r["name"], r["surname"], r["position"], r["organisation"], r["kind"]) for r in rows][:2] == [
        ("Michele Bullock", "Bullock", "Governor", "Reserve Bank of Australia", "witness"),
        ("Andrew Hauser", "Hauser", "Deputy Governor", "Reserve Bank of Australia", "witness")]
    # and the roster matcher takes them like In Attendance rows: "Ms Bullock" -> Michele Bullock
    hit = cw.match_roster("Bullock", "ms", rows)
    assert hit["name"] == "Michele Bullock"


# ---- the surname linker must leave committee rows to resolve ---------------------------------------------------------------

def run_linker(path, monkeypatch):
    monkeypatch.setattr(link_speakers, "get_db", lambda: get_db(path))
    link_speakers.link_speakers()


def test_link_speakers_files_a_hansard_speaker_under_the_mp_but_not_a_committee_witness(path, monkeypatch):
    conn = sqlite3.connect(path)
    conn.execute("INSERT INTO speeches (speaker_name, chamber, date, text, source, state) VALUES "
                 "('Ms Hall', 'representatives', '2026-09-17', 'A floor speech long enough.', 'openaustralia', 'federal')")
    hansard = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()
    witness = add(path, BASE, "Ms Hall", "witness")                                    # typed by the ingest
    legacy_witness = add(path, LEGACY, "Mr Cook", "witness", source="committee_senate")     # typed by an earlier resolve
    house_member = add(path, BASE, "Mr KENNEDY", "member", phid="555555")            # unmapped id: must not become Simon Kennedy
    run_linker(path, monkeypatch)
    assert row(path, hansard)["person_id"] == "10310"                                   # the linker still works on Hansard
    assert row(path, witness)["person_id"] is None
    assert row(path, legacy_witness)["person_id"] is None
    assert row(path, house_member)["person_id"] is None


def test_link_speakers_still_links_an_untyped_senator_committee_row(path, monkeypatch):
    conn = sqlite3.connect(path)
    conn.execute("INSERT INTO speeches (speaker_name, chamber, date, text, source, state, hearing_id) VALUES "
                 "('Senator POCOCK', 'senate_committee', '2026-09-17', 'A committee question long enough.', 'committee_senate', 'federal', ?)",
                 (LEGACY + "/0001",))
    sid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()
    run_linker(path, monkeypatch)
    assert row(path, sid)["person_id"] == "11009"
