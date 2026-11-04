"""The local-PDF import of Senate estimates transcripts (parli.ingest.committee_pdf).

Synthetic page text with invented names: no PDF library, no network. Covers page furniture, turn splitting, who is
speaking, the In Attendance block, stable ids, idempotent apply, the hash check, and supersession by the HTML ingest
and by an Official PDF.
"""
import hashlib
import json
import re
import sqlite3
from pathlib import Path

import pytest

from parli.ingest import committee_hearings as ch
from parli.ingest import committee_pdf as cp
from parli.ingest import committee_transcript as ct
from parli.ingest import committee_witnesses as cw
from parli.ingest import handbook, link_speakers
from parli.ingest.dedup import LazyDateSeen
from parli.schema import get_db

FIX = Path(__file__).parent / "fixtures" / "committees"
REF = "39001"
BASE = f"committees/estimate/{REF}"
COMMITTEE = "Imaginary Affairs Legislation Committee"
FOOT = "IMAGINARY AFFAIRS LEGISLATION COMMITTEE"
DATE = "2026-03-02"
NOTE = "saved in a browser by a tester, 3 Mar 2026"
ROSTER = {"labels": {"senator quark": {"phid": "QX1", "label": "Senator QUARK"},
                     "senator wexley": {"phid": "WX2", "label": "Senator WEXLEY"},
                     "senator ostrander": {"phid": "OS3", "label": "Senator Ostrander"}}}


def L(page, y, text, x=72.0, size=10.6, bold=False, italic=False, bp=None, x1=None):
    return cp.Line(page=page, x0=x, y=y, size=size, text=text, bold_prefix=text if bold else (bp or ""),
                   all_bold=bold, all_italic=italic, chars=cp.nonspace(text),
                   x1=x1 if x1 is not None else x + 4.8 * len(text))


def page(n, lines):
    return cp.Page(number=n, width=595.32, height=841.92, lines=lines)


def cover(revision="Proof"):
    title = "Proof Committee Hansard" if revision == "Proof" else "Committee Hansard"
    lines = [L(1, 663, "COMMONWEALTH OF AUSTRALIA", x=220), L(1, 612, title, x=171, size=28),
             L(1, 537, "SENATE", x=254, size=32, bold=True), L(1, 481, "IMAGINARY AFFAIRS LEGISLATION", x=112, size=16),
             L(1, 462, "COMMITTEE", x=270, size=16), L(1, 422, "Estimates", x=289, size=14, bold=True),
             L(1, 377, "(Public)", x=303, size=9), L(1, 341, "MONDAY, 2 MARCH 2026", x=212, size=16),
             L(1, 303, "CANBERRA", x=285, size=12), L(1, 251, "CONDITIONS OF DISTRIBUTION", x=254, size=9, bold=True),
             L(1, 237, "This is an uncorrected proof of evidence taken before the committee.", x=195, size=9),
             L(1, 165, "BY AUTHORITY OF THE SENATE", x=257, size=8)]
    if revision == "Proof":
        lines.append(L(1, 119, "[PROOF COPY]", x=274, size=12, bold=True))
    return page(1, lines)


def front():
    return page(2, [L(2, 753, FOOT, x=99, bold=True), L(2, 723, "Monday, 2 March 2026", x=219, bold=True),
                    L(2, 693, "Members in attendance: Senators Ostrander, Quark and Wexley", x=46.8,
                      bp="Members in attendance:")])


def head(n, printed, margin):
    return L(n, 787.8, f"Monday, 2 March 2026 Senate Page {printed}", x=margin)


def foot(n):
    return L(n, 38.9, FOOT, x=144.5)


def body_pages(answer="The answer is that the budget line covers the Attorney-", drop_fenwick=False):
    p3 = [head(3, 1, 72.0),
          L(3, 743, "IMAGINARY PORTFOLIO", x=230, size=12, bold=True),
          L(3, 728, "In Attendance", x=280.5, bold=True),
          L(3, 713, "Senator Ostrander, Minister for Imaginary Things", x=83.4),
          L(3, 698, "Department of Imaginary Affairs", x=72, bold=True),
          L(3, 683, "Executive", x=72, bold=True),
          L(3, 668, "Ms Mara Quillfeather PSM, Secretary", x=83.4),
          L(3, 653, "Mr Tobin Larkspur [by video link], Deputy Secretary, Policy and", x=83.4, x1=523),
          L(3, 641, "Programs Group", x=72),
          L(3, 626, "Hollis Brandywine, Chief Counsel", x=83.4),
          L(3, 611, "Ms Ada Fenwick, Director", x=83.4),
          L(3, 596, "Mr Ben Fenwick, Director", x=83.4),
          L(3, 581, "Mr Carl Pell, Analyst", x=83.4),
          L(3, 566, "Mr Dion Pell, Analyst", x=83.4),
          L(3, 551, "Committee met at 09:00", x=72, bold=True),
          L(3, 536, "CHAIR (Senator Wexley): I declare open this hearing of the imaginary committee.", x=83.4,
            bp="CHAIR (Senator Wexley):"),
          L(3, 524, "It is good to be here today, and this text is long enough to keep.", x=72),
          L(3, 509, "[09:06]", x=72),
          L(3, 494, "Senator QUARK: My question goes to the imaginary budget line and its curious features.",
            x=83.4, bp="Senator QUARK:"),
          L(3, 482, "It continues on the next line of the page", x=72),
          foot(3)]
    p4 = [head(4, 2, 42.6),
          L(4, 744, "and across the page break onto page four, still the same paragraph.", x=42.6),
          L(4, 729, f"Ms Quillfeather: {answer}", x=54, bp="Ms Quillfeather:"),
          L(4, 717, "General's imaginary programs in full, as they were published.", x=42.6),
          L(4, 702, "Senator Quark interjecting—", x=54, italic=True),
          L(4, 687, "Ms Quillfeather: And so the answer continues after the interjection by the senator.", x=54,
            bp="Ms Quillfeather:"),
          L(4, 672, "Imaginary Regulator", x=230, bold=True),
          L(4, 657, "Which is why the regulator matters so much to the department and to the minister.", x=54),
          L(4, 642, "Mr Larkspur: The deputy secretary speaking now, with an answer long enough to store.", x=54,
            bp="Mr Larkspur:"),
          L(4, 627, "Mr Pell: Which Pell is speaking cannot be known from the attendance list alone.", x=54,
            bp="Mr Pell:"),
          L(4, 612, "Mr Brandywine: Counsel answers, from a list that printed no honorific for him at all.", x=54,
            bp="Mr Brandywine:"),
          L(4, 597, "Senator ZEPHYR: A senator the label table does not know asks a long enough question.", x=54,
            bp="Senator ZEPHYR:")]
    if not drop_fenwick:
        p4.append(L(4, 582, "Ms Fenwick: The director answers, and her honorific settles which Fenwick it is.", x=54,
                    bp="Ms Fenwick:"))
    p4 += [L(4, 567, "Proceedings suspended from 10:31 to 10:46", x=200, bold=True),
           L(4, 552, "CHAIR: Yes.", x=54, bp="CHAIR:"),
           L(4, 537, "Committee adjourned at 21:31", x=200, bold=True),
           foot(4)]
    return [page(3, p3), page(4, p4)]


def hearing_pages(revision="Proof", **kw):
    return [cover(revision), front(), *body_pages(**kw)]


@pytest.fixture
def parsed():
    ph = cp.parse_pages(hearing_pages(), COMMITTEE)
    cp.resolve_speakers(ph.turns, ph.attendance, ROSTER)
    return ph


# ---- page furniture and accounting ----------------------------------------------------------------------------------

def test_cover_gives_revision_committee_kind_and_date_and_is_stripped(parsed):
    c = parsed.cover
    assert (c.revision, c.kind, c.date) == ("Proof", "Estimates", DATE)
    assert c.committee == FOOT and "uncorrected proof" in c.conditions
    text = " ".join(t.text for t in parsed.turns)
    assert "CONDITIONS OF DISTRIBUTION" not in text and "uncorrected proof" not in text and "PROOF COPY" not in text


def test_running_headers_and_footers_never_reach_a_turn_and_every_character_is_accounted_for(parsed):
    text = "\n".join(t.text for t in parsed.turns)
    assert "Senate Page" not in text and FOOT not in text and "Monday, 2 March 2026" not in text
    pages = {p["page"]: p for p in parsed.pages}
    assert sorted(pages) == [1, 2, 3, 4]
    for p in parsed.pages:
        assert sum(p["classes"].values()) == p["chars"]
    assert pages[1]["classes"] == {"cover": pages[1]["chars"]}
    assert set(pages[2]["classes"]) == {"front"}
    assert pages[3]["printed"] == 1 and pages[4]["printed"] == 2
    assert pages[3]["classes"]["header"] == cp.nonspace("Monday, 2 March 2026 Senate Page 1")
    assert pages[4]["classes"]["footer"] == cp.nonspace(FOOT)
    assert parsed.pages[3]["classes"].get("orphan", 0) == 0 and not parsed.notes


def test_members_in_attendance_are_read_from_the_front_page(parsed):
    assert parsed.members_in_attendance == ["Ostrander", "Quark", "Wexley"]


# ---- turns ----------------------------------------------------------------------------------------------------------

def test_turns_split_on_labels_and_join_lines_across_a_page_break(parsed):
    t = parsed.turns
    assert [x.speaker_name for x in t] == ["CHAIR", "Senator QUARK", "Ms Quillfeather", "Ms Quillfeather",
                                           "Ms Quillfeather", "Mr Larkspur", "Mr Pell", "Mr Brandywine",
                                           "Senator ZEPHYR", "Ms Fenwick", "CHAIR"]
    assert t[0].text == "I declare open this hearing of the imaginary committee. It is good to be here today, and this text is long enough to keep."
    assert t[1].text.endswith("next line of the page and across the page break onto page four, still the same paragraph.")
    assert (t[1].pdf_page_start, t[1].pdf_page_end, t[1].printed_page_start, t[1].printed_page_end) == (3, 4, 1, 2)
    # a hyphen at a line end runs into the next line; the interjection is the reporter's, not speech
    assert "Attorney-General's imaginary programs" in t[2].text and "interjecting" not in t[2].text + t[3].text
    assert all("[09:06]" not in x.text and "Proceedings suspended" not in x.text and "Committee met" not in x.text for x in t)


def test_topics_follow_the_portfolio_and_agency_headings_and_a_speech_carries_past_a_heading(parsed):
    t = parsed.turns
    assert t[0].topic == f"{COMMITTEE} - Estimates - IMAGINARY PORTFOLIO"
    carried = t[4]
    assert carried.carried and carried.speaker_name == "Ms Quillfeather" and carried.agency == "Imaginary Regulator"
    assert carried.topic == f"{COMMITTEE} - Estimates - IMAGINARY PORTFOLIO - Imaginary Regulator"
    assert carried.text.startswith("Which is why the regulator")


def test_speaker_types_follow_the_estimates_rule(parsed):
    kinds = {(x.speaker_name, x.speaker_type) for x in parsed.turns}
    assert ("CHAIR", "chair") in kinds and ("Senator QUARK", "member") in kinds and ("Senator ZEPHYR", "member") in kinds
    assert ("Ms Quillfeather", "witness") in kinds and ("Mr Brandywine", "witness") in kinds
    assert parsed.turns[0].named_as == "Senator Wexley"


def test_senators_get_a_handbook_id_from_the_label_table_and_never_a_surname_guess(parsed):
    by = {x.speaker_name: x for x in parsed.turns}
    assert by["Senator QUARK"].handbook_id == "QX1"
    assert by["Senator ZEPHYR"].handbook_id is None            # unknown label: unresolved, not guessed
    assert parsed.turns[0].handbook_id == "WX2"                # CHAIR (Senator Wexley)
    assert all(x.handbook_id is None for x in parsed.turns if x.speaker_type == "witness")


def test_witnesses_get_name_position_and_organisation_from_in_attendance(parsed):
    by = {}
    for x in parsed.turns:
        by.setdefault(x.speaker_name, x)
    q = by["Ms Quillfeather"]
    assert (q.witness_name, q.witness_position, q.witness_organisation) == ("Mara Quillfeather", "Secretary",
                                                                           "Department of Imaginary Affairs")
    lark = by["Mr Larkspur"]                                   # '[by video link]' is not part of the name
    assert (lark.witness_name, lark.witness_position) == ("Tobin Larkspur", "Deputy Secretary, Policy and Programs Group")
    assert by["Mr Brandywine"].witness_name == "Hollis Brandywine"      # listed without an honorific
    assert by["Ms Fenwick"].witness_name == "Ada Fenwick"               # the honorific breaks the tie
    pell = by["Mr Pell"]                                                # two Mr Pells: left unmatched
    assert (pell.witness_name, pell.speaker_name_clean, pell.witness_position) == ("Mr Pell", "Pell", None)


def test_in_attendance_rows_keep_organisation_group_minister_and_order(parsed):
    rows = parsed.attendance
    assert [r["seq"] for r in rows] == list(range(1, len(rows) + 1))
    first = rows[0]
    assert (first["name"], first["kind"], first["honorific_class"]) == ("Ostrander", "minister", "senator")
    q = next(r for r in rows if r["surname"] == "Quillfeather")
    assert (q["organisation"], q["group_heading"], q["postnominals"], q["fragment"]) == (
        "Department of Imaginary Affairs", "Executive", "PSM", "lpdf")
    assert next(r for r in rows if r["surname"] == "Brandywine")["honorific"] is None


def test_the_html_attendance_parser_is_unchanged_by_the_shared_core():
    page_html = ('<div class="docDiv"><p class="HPS-Normal">In Attendance</p>'
                 '<p class="HPS-Normal"><span style="font-weight:bold">Department of Testing</span></p>'
                 '<p class="HPS-Normal">Ms Jo Example, First Assistant Secretary</p>'
                 '<p class="HPS-Normal">Jo Nohonorific, Director</p>'
                 '<p class="HPS-Normal"><span class="HPS-OfficeCommittee">CHAIR:</span> Welcome.</p></div>')
    rows = cw.parse_attendance(page_html)
    assert [(r["name"], r["organisation"], r["group_heading"]) for r in rows] == [
        ("Jo Example", "Department of Testing", None)]          # an HTML line without honorific stays a heading


# ---- ids ------------------------------------------------------------------------------------------------------------

def test_turn_ids_are_stable_and_never_collide_with_fragment_ids():
    a = [cp.turn_record(REF, t) for t in cp.parse_pages(hearing_pages(), COMMITTEE).turns]
    b = [cp.turn_record(REF, t) for t in cp.parse_pages(hearing_pages(), COMMITTEE).turns]
    assert a == b
    ids = [t["turn_id"] for t in a]
    assert len(set(ids)) == len(ids) and ids[0] == f"{BASE}/lpdf/0001"
    rid = cp.row_hearing_id(REF)
    assert rid == f"{BASE}/lpdf" and not ct.FRAGMENT_ID_RE.fullmatch(rid)
    assert all(not ct.FRAGMENT_ID_RE.fullmatch(i) and not re.fullmatch(r".*/\d{4}", rid) for i in ids)
    # every consumer that derives the hearing from a row's hearing_id still gets the hearing
    assert rid.rsplit("/", 1)[0] == BASE and rid[: len(rid) - 5] == BASE
    assert cp.text_hash("x y") == ch.text_hash("x y")


# ---- staging and apply ----------------------------------------------------------------------------------------------

def stage(tmp_path, name="2026-03-test", revision="Proof", pages=None, schedule_extra=True, **kw):
    src = tmp_path / f"in-{name}"
    src.mkdir()
    pdf_bytes = f"%PDF-fake {name} {revision}".encode()
    (src / f"{REF}-{DATE}.pdf").write_bytes(pdf_bytes)
    entry = {"committee": "Imaginary Affairs", "date": "02/03/2026", "ref": REF, "status": "Published in full",
             "source_url": f"https://parlinfo.example/display;query=Id:{BASE}/0000", "filename": f"{REF}-{DATE}.pdf",
             "revision_status": revision, "bytes": len(pdf_bytes), "sha256": hashlib.sha256(pdf_bytes).hexdigest(),
             "pages": 4}
    (src / "manifest.json").write_text(json.dumps([entry]))
    sched = [dict(entry)]
    if schedule_extra:
        sched.append({"committee": "Imaginary Affairs", "date": "03/03/2026", "ref": "39002", "status": "Pending",
                      "source_url": "https://parlinfo.example/39002"})
    (src / "schedule.json").write_text(json.dumps(sched))
    out = tmp_path / "staged" / name
    the_pages = pages or hearing_pages(revision, **kw)
    m = cp.stage_round(src, out, ROSTER, acquisition_note=NOTE, acquired_on="2026-03-03",
                       reader=lambda _p: the_pages, say=lambda *a: None)
    return tmp_path / "staged", m


@pytest.fixture
def dbpath(tmp_path, monkeypatch):
    monkeypatch.setenv("OPAX_ARAG_STATE", str(tmp_path / "no-state.json"))
    conn = get_db(tmp_path / "t.db")
    ch.ensure_schema(conn)
    conn.execute("PRAGMA foreign_keys = OFF")
    for pid, first, last, party in [("90001", "Quinn", "Quark", "Imaginary Party"), ("90002", "Wren", "Wexley", "Other Party")]:
        conn.execute("INSERT INTO members (person_id, first_name, last_name, full_name, chamber, party, state) "
                     "VALUES (?,?,?,?,'senate',?,'federal')", (pid, first, last, f"{first} {last}", party))
    conn.executescript(handbook.DDL)
    for phid, pid in [("QX1", "90001"), ("WX2", "90002")]:
        conn.execute("INSERT INTO ext_handbook_people (phid, person_id, fetched_at) VALUES (?,?,'x')", (phid, pid))
    conn.commit()
    conn.close()
    return str(tmp_path / "t.db")


def q(path, sql, args=()):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        return conn.execute(sql, args).fetchall()
    finally:
        conn.close()


def pdf_rows(path):
    return q(path, "SELECT * FROM speeches WHERE hearing_id = ? ORDER BY speech_id", (f"{BASE}/lpdf",))


def test_staged_manifest_records_provenance_counts_hashes_and_pending_hearings(tmp_path):
    root, m = stage(tmp_path)
    h = m["hearings"][0]
    assert (h["hearing_id"], h["revision"], h["origin"], h["committee_name"], h["date"]) == (
        BASE, "Proof", "local_pdf", COMMITTEE, DATE)
    assert h["pdf"]["sha256"] and h["source_url"].endswith("/0000") and h["acquisition_note"] == NOTE
    assert h["turns"] == 11 and h["turns_storable"] == 10 and h["unresolved_member_labels"] == {"Senator ZEPHYR": 1}
    assert m["pending"] == [{"ref": "39002", "hearing_id": "committees/estimate/39002", "committee": "Imaginary Affairs",
                             "committee_name": COMMITTEE, "date": "2026-03-03", "schedule_status": "Pending",
                             "source_url": "https://parlinfo.example/39002",
                             "state": "pending at APH: not yet published, not a missing download"}]
    assert set(m["files"]) == {f"turns/{REF}.jsonl", f"attendance/{REF}.jsonl", f"pages/{REF}.json", "senators.json"}
    cp.load_round(root / "2026-03-test")                       # its own hashes check out


def test_a_pdf_that_differs_from_the_browser_manifest_is_not_staged(tmp_path):
    with pytest.raises(ValueError, match="cover revision"):
        stage(tmp_path, pages=hearing_pages("Official"))       # the manifest says Proof


def test_apply_writes_the_html_row_shape_with_provenance(tmp_path, dbpath):
    root, m = stage(tmp_path)
    out = cp.apply(dbpath, root, pushed_upto=None, say=lambda *a: None)
    assert [r["action"] for r in out["results"]] == ["inserted"] and out["pending"][0]["ref"] == "39002"
    rows = pdf_rows(dbpath)
    assert len(rows) == 10                                     # 'CHAIR: Yes.' is under 50 characters
    assert {(r["source"], r["chamber"], r["state"], r["hearing_type"], r["date"]) for r in rows} == {
        ("committee_senate", "senate_committee", "federal", "estimates", DATE)}
    by = {r["citation_anchor"]: r for r in rows}
    quark = by[f"{BASE}/lpdf/0002"]
    assert (quark["speaker_name"], quark["speaker_type"], quark["handbook_id"], quark["person_id"],
            quark["speaker_name_clean"], quark["party_canonical"]) == ("Senator QUARK", "member", "QX1", "90001",
                                                                       "Quinn Quark", "Imaginary Party")
    chair = by[f"{BASE}/lpdf/0001"]
    assert (chair["speaker_type"], chair["person_id"], chair["handbook_id"]) == ("chair", None, "WX2")
    wit = by[f"{BASE}/lpdf/0003"]
    assert (wit["speaker_type"], wit["person_id"], wit["witness_name"], wit["speaker_name_clean"],
            wit["witness_position"], wit["witness_organisation"]) == (
        "witness", None, "Mara Quillfeather", "Mara Quillfeather", "Secretary", "Department of Imaginary Affairs")
    zephyr = next(r for r in rows if r["speaker_name"] == "Senator ZEPHYR")
    assert (zephyr["handbook_id"], zephyr["person_id"]) == (None, None)
    assert all(r["person_id"] is None for r in rows if r["speaker_type"] == "witness")
    src = rows[0]
    assert src["source_url"] == m["hearings"][0]["source_url"]
    for bit in ("Proof Committee Hansard", "local_pdf", m["hearings"][0]["pdf"]["sha256"], NOTE, BASE):
        assert bit in src["source_attribution"]
    turns = q(dbpath, "SELECT * FROM ext_committee_pdf_turns ORDER BY seq")
    assert len(turns) == 11 and [t["skipped"] for t in turns if t["speech_id"] is None] == ["under 50 characters"]
    assert (turns[1]["pdf_page_start"], turns[1]["pdf_page_end"], turns[1]["printed_page_start"]) == (3, 4, 1)
    att = q(dbpath, "SELECT * FROM ext_committee_attendance WHERE hearing_base = ?", (BASE,))
    assert len(att) == 8 and {a["fragment"] for a in att} == {"lpdf"}
    h = q(dbpath, "SELECT * FROM ext_committee_pdf_hearings")[0]
    assert (h["status"], h["revision"], h["origin"], h["rows_stored"]) == ("applied", "Proof", "local_pdf", 10)


def test_applying_again_adds_nothing(tmp_path, dbpath):
    root, _ = stage(tmp_path)
    cp.apply(dbpath, root, pushed_upto=None, say=lambda *a: None)
    before = [tuple(r) for r in pdf_rows(dbpath)]
    out = cp.apply(dbpath, root, pushed_upto=None, say=lambda *a: None)
    assert [r["action"] for r in out["results"]] == ["unchanged"]
    assert [tuple(r) for r in pdf_rows(dbpath)] == before


def test_a_staged_file_that_does_not_match_its_hash_is_refused_and_nothing_is_written(tmp_path, dbpath, capsys):
    root, _ = stage(tmp_path)
    f = root / "2026-03-test" / "turns" / f"{REF}.jsonl"
    f.write_text(f.read_text().replace("imaginary budget line", "imaginary budget lines"))
    with pytest.raises(cp.StagedHashMismatch):
        cp.apply(dbpath, root, pushed_upto=None, say=lambda *a: None)
    assert cp.main(["apply", "--db", dbpath, "--staged", str(root)]) == 2
    assert "REFUSED" in capsys.readouterr().out
    assert q(dbpath, "SELECT COUNT(*) FROM speeches")[0][0] == 0
    assert not q(dbpath, "SELECT name FROM sqlite_master WHERE name = 'ext_committee_pdf_hearings'")


def test_a_failed_post_check_rolls_everything_back_schema_included(tmp_path, dbpath, monkeypatch):
    root, _ = stage(tmp_path)
    monkeypatch.setattr(cp, "validate_applied", lambda db, m: ["forced"])
    with pytest.raises(RuntimeError, match="forced"):
        cp.apply(dbpath, root, pushed_upto=None, say=lambda *a: None)
    assert q(dbpath, "SELECT COUNT(*) FROM speeches")[0][0] == 0
    assert not q(dbpath, "SELECT name FROM sqlite_master WHERE name = 'ext_committee_pdf_hearings'")


def test_a_dry_run_writes_nothing(tmp_path, dbpath):
    root, _ = stage(tmp_path)
    out = cp.apply(dbpath, root, dry_run=True, pushed_upto=None, say=lambda *a: None)
    assert out["results"][0]["inserted"] == 10
    assert q(dbpath, "SELECT COUNT(*) FROM speeches")[0][0] == 0


def test_resolve_and_link_speakers_leave_the_imported_rows_as_they_are(tmp_path, dbpath):
    root, _ = stage(tmp_path)
    cp.apply(dbpath, root, pushed_upto=None, say=lambda *a: None)
    before = [tuple(r) for r in pdf_rows(dbpath)]
    cw.cmd_resolve(dbpath, dry_run=False, pushed_upto=None)
    assert [tuple(r) for r in pdf_rows(dbpath)] == before
    conn = sqlite3.connect(dbpath)
    guard = link_speakers.committee_guard(conn)
    assert conn.execute(f"SELECT COUNT(*) FROM speeches WHERE person_id IS NULL {guard}").fetchone()[0] == 0
    conn.close()


def test_the_senate_roster_fallback_is_off_unless_asked(tmp_path, dbpath):
    conn = sqlite3.connect(dbpath)
    conn.execute("INSERT INTO members (person_id, first_name, last_name, full_name, chamber, party, state) "
                 "VALUES ('90003', 'Zara', 'Zephyr', 'Zara Zephyr', 'senate', 'Third Party', 'federal')")
    conn.execute("INSERT INTO ext_handbook_people (phid, family_name, given_name, chamber, in_current, person_id, fetched_at) "
                 "VALUES ('ZP9', 'Zephyr', 'Zara', 'senate', 1, '90003', 'x')")
    conn.commit()
    conn.close()
    root, _ = stage(tmp_path)
    cp.apply(dbpath, root, pushed_upto=None, say=lambda *a: None)
    z = next(r for r in pdf_rows(dbpath) if r["speaker_name"] == "Senator ZEPHYR")
    assert z["handbook_id"] is None                            # not in the members list, and the fallback is off
    # with the fallback on, a senator must also be named on the hearing's members list
    ids = cp.Identities(sqlite3.connect(dbpath))
    conn = sqlite3.connect(dbpath)
    assert ids.current_senator(conn, "Senator ZEPHYR", ["Ostrander", "Quark"]) is None
    assert ids.current_senator(conn, "Senator ZEPHYR", ["Zephyr"]) == "ZP9"
    conn.close()


# ---- supersession ---------------------------------------------------------------------------------------------------

class FakeResponse:
    def __init__(self, status, text):
        self.status_code, self.text = status, text


class FakeHttp:
    def __init__(self, pages):
        self.pages = pages
        self.requests = 0

    def get(self, url, **kw):
        self.requests += 1
        v = self.pages.get(url)
        return FakeResponse(200, v) if v is not None else FakeResponse(404, "")


def html_pages(with_fragment=True):
    pages = {ct.toc_url(BASE): (FIX / "toc_proof.html").read_text(encoding="utf-8")}
    if with_fragment:
        pages[ct.fragment_url(BASE, "0001")] = (FIX / "fragment_house.html").read_text(encoding="utf-8")
    return pages


def estimate_hearing():
    return ct.HearingMetadata(hearing_id=BASE, dataset="estimate", committee_name=COMMITTEE, inquiry_title="Estimates",
                              date=DATE, fragment_ids=["0001"])


def test_the_html_ingest_replaces_the_pdf_rows_in_the_db_and_queues_their_knowledge_box_deletes(tmp_path, dbpath):
    root, _ = stage(tmp_path)
    cp.apply(dbpath, root, pushed_upto=None, say=lambda *a: None)
    pdf_ids = [r["speech_id"] for r in pdf_rows(dbpath)]
    conn = get_db(dbpath)
    conn.row_factory = sqlite3.Row
    assert BASE not in ch.get_ingested_hearings(conn)           # PDF rows alone do not make it "ingested"
    seen = ch.build_dedup_index(conn)
    r = ch.sync_hearing(FakeHttp(html_pages()), conn, ch.FragmentCache(tmp_path / "cache"), estimate_hearing(), seen)
    conn.commit()
    assert r.superseded_pdf == len(pdf_ids) == 10 and r.inserted == 8
    assert pdf_rows(dbpath) == []
    html = q(dbpath, "SELECT * FROM speeches WHERE hearing_id = ?", (f"{BASE}/0001",))
    assert len(html) == 8
    queued = q(dbpath, "SELECT speech_id, op FROM committee_kb_queue ORDER BY speech_id")
    assert [(x["speech_id"], x["op"]) for x in queued] == [(i, "delete") for i in pdf_ids]
    h = q(dbpath, "SELECT status, superseded_by FROM ext_committee_pdf_hearings")[0]
    assert (h["status"], h["superseded_by"]) == ("superseded", "html:Proof")
    assert q(dbpath, "SELECT COUNT(*) FROM ext_committee_pdf_turns WHERE speech_id IS NOT NULL")[0][0] == 0
    assert q(dbpath, "SELECT COUNT(*) FROM ext_committee_attendance WHERE fragment = 'lpdf'")[0][0] == 0
    # the staged round is applied again the next night: nothing comes back beside the HTML rows
    out = cp.apply(dbpath, root, pushed_upto=None, say=lambda *a: None)
    assert out["results"][0]["action"] == "superseded" and pdf_rows(dbpath) == []
    conn.close()


def test_a_partial_html_fetch_keeps_the_pdf_rows_and_writes_nothing(tmp_path, dbpath):
    root, _ = stage(tmp_path)
    cp.apply(dbpath, root, pushed_upto=None, say=lambda *a: None)
    conn = get_db(dbpath)
    conn.row_factory = sqlite3.Row
    r = ch.sync_hearing(FakeHttp(html_pages(with_fragment=False)), conn, ch.FragmentCache(tmp_path / "cache"),
                        estimate_hearing(), ch.build_dedup_index(conn))
    conn.commit()
    assert r.skipped and "local-PDF rows kept" in r.skipped and r.inserted == 0
    assert len(pdf_rows(dbpath)) == 10
    assert q(dbpath, "SELECT COUNT(*) FROM ext_committee_hearings")[0][0] == 0
    assert q(dbpath, "SELECT status FROM ext_committee_pdf_hearings")[0][0] == "applied"
    conn.close()


def test_the_pdf_import_never_adds_rows_to_a_hearing_the_html_ingest_holds(tmp_path, dbpath):
    conn = get_db(dbpath)
    conn.row_factory = sqlite3.Row
    ch.sync_hearing(FakeHttp(html_pages()), conn, ch.FragmentCache(tmp_path / "cache"), estimate_hearing(),
                    ch.build_dedup_index(conn))
    conn.commit()
    conn.close()
    root, _ = stage(tmp_path)
    out = cp.apply(dbpath, root, pushed_upto=None, say=lambda *a: None)
    assert out["results"][0]["action"] == "superseded" and pdf_rows(dbpath) == []


def test_an_official_pdf_updates_the_proof_rows_in_place_and_an_older_proof_never_returns(tmp_path, dbpath):
    root, _ = stage(tmp_path, name="2026-03-a-proof")
    cp.apply(dbpath, root, pushed_upto=None, say=lambda *a: None)
    before = {r["citation_anchor"]: r for r in pdf_rows(dbpath)}
    pushed = max(r["speech_id"] for r in before.values())          # everything is in the knowledge box already
    _, m2 = stage(tmp_path, name="2026-03-b-official", revision="Official",
                  answer="The answer is that the budget line covers all of the Attorney-", drop_fenwick=True)
    out = cp.apply(dbpath, root, pushed_upto=pushed, say=lambda *a: None)
    acts = {r["hearing_id"]: r for r in out["results"]}
    assert [r["action"] for r in out["results"]] == ["unchanged", "updated"]
    upd = out["results"][1]
    assert (upd["updated"], upd["deleted"], upd["inserted"]) == (1, 1, 0) and acts
    after = {r["speech_id"]: r for r in pdf_rows(dbpath)}
    edited = before[f"{BASE}/lpdf/0003"]
    assert "covers all of the Attorney-General's" in after[edited["speech_id"]]["text"]      # same speech_id
    fenwick = next(r for r in before.values() if r["speaker_name"] == "Ms Fenwick")
    assert fenwick["speech_id"] not in after
    assert {k for k, v in before.items() if v["speech_id"] in after} == set(before) - {fenwick["citation_anchor"]}
    queued = {(x["speech_id"], x["op"]) for x in q(dbpath, "SELECT speech_id, op FROM committee_kb_queue")}
    assert queued == {(edited["speech_id"], "patch"), (fenwick["speech_id"], "delete")}
    h = q(dbpath, "SELECT revision, status FROM ext_committee_pdf_hearings")[0]
    assert tuple(h) == ("Official", "applied")
    assert "Official Committee Hansard" in after[edited["speech_id"]]["source_attribution"]
    # next night: both rounds are still staged; the Proof is older than what is applied and is skipped
    out = cp.apply(dbpath, root, pushed_upto=pushed, say=lambda *a: None)
    assert [r["action"] for r in out["results"]] == ["skipped", "unchanged"]
    assert len(pdf_rows(dbpath)) == 9


def test_the_dedup_index_can_forget_a_key():
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE speeches (speaker_name TEXT, date TEXT, text TEXT, source TEXT)")
    conn.execute("INSERT INTO speeches VALUES ('Ms A', '2026-03-02', 'words', 'committee_senate')")
    seen = LazyDateSeen(conn, ch.text_hash, sources=["committee_senate"])
    key = f"Ms A|2026-03-02|{ch.text_hash('words')}"
    assert key in seen
    seen.discard(key)
    assert key not in seen


def test_a_bold_heading_that_breaks_mid_phrase_runs_on_and_a_group_under_it_does_not():
    p3 = [head(3, 1, 72.0), L(3, 743, "IMAGINARY PORTFOLIO", x=230, size=12, bold=True),
          L(3, 728, "In Attendance", x=280.5, bold=True),
          L(3, 713, "Department of Imaginary Affairs, Climate, Energy, the Environment and", x=72, bold=True, x1=540),
          L(3, 698, "Water", x=72, bold=True),
          L(3, 683, "Office of the Long Imaginary Regulator for Very Long Names Indeed Here", x=72, bold=True, x1=540),
          L(3, 668, "Executive", x=72, bold=True),
          L(3, 653, "Ms Mara Quillfeather, Secretary", x=83.4, x1=540),
          L(3, 638, "CHAIR: Welcome to everyone joining this imaginary hearing of the committee today.", x=83.4, bp="CHAIR:",
            x1=540),
          foot(3)]
    ph = cp.parse_pages([cover(), front(), page(3, p3)], COMMITTEE)
    (row,) = ph.attendance
    assert (row["organisation"], row["group_heading"]) == (
        "Office of the Long Imaginary Regulator for Very Long Names Indeed Here", "Executive")
    ph2 = cp.parse_pages([cover(), front(), page(3, p3[:5] + p3[7:])], COMMITTEE)
    assert ph2.attendance[0]["organisation"] == "Department of Imaginary Affairs, Climate, Energy, the Environment and Water"
