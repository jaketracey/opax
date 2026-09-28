"""Parsing of ParlInfo committee transcripts: listing, TOC, fragments, witness lists.

The fixtures under tests/fixtures/committees are trimmed copies of real ParlInfo pages (18 and 24 September 2026:
House Standing Committee on Economics, RBA annual report; Senate Community Affairs Legislation Committee, aged care bill).
"""
from datetime import date
from pathlib import Path

import pytest

from parli.ingest import committee_transcript as ct

FIX = Path(__file__).parent / "fixtures" / "committees"


def read(name: str) -> str:
    return (FIX / name).read_text(encoding="utf-8")


HOUSE = ct.HearingMetadata(hearing_id="committees/commrep/29882", dataset="commrep",
                           committee_name="Standing Committee on Economics", date="2026-09-18",
                           inquiry_title="Review of the Reserve Bank of Australia Annual Report 2025")
SENATE = ct.HearingMetadata(hearing_id="committees/commsen/29971", dataset="commsen",
                            committee_name="Community Affairs Legislation Committee", date="2026-09-24")


# ---- listing ---------------------------------------------------------------------------------------------------------

def test_listing_url_uses_parlinfos_date_syntax_and_all_datasets():
    url = ct.listing_url(date(2025, 7, 1), "2026-09-28", page=2)
    assert "page=2;" in url and "resCount=100" in url
    assert "Dataset%3Aestimate%2Ccommsen%2Ccommrep%2Ccommjnt%20Date%3A01%2F07%2F2025%20%3E%3E%2028%2F09%2F2026" in url


def test_listing_page_gives_one_entry_per_fragment_with_committee_date_inquiry_and_total():
    page = ct.parse_listing(read("listing_page.html"))
    assert page.total == 7 and len(page.entries) == 7
    house = [e for e in page.entries if e.dataset == "commrep"]
    assert [(e.fragment, e.date, e.committee, e.inquiry, e.category) for e in house] == [
        ("0000", "2026-09-18", "Standing Committee on Economics",
         "Review of the Reserve Bank of Australia Annual Report 2025", "HoR Committee Hansard"),
        ("0001", "2026-09-18", "Standing Committee on Economics",
         "Review of the Reserve Bank of Australia Annual Report 2025", "HoR Committee Hansard")]
    assert {e.category for e in page.entries} == {"HoR Committee Hansard", "Joint Committee Hansard", "Senate Committee Hansard"}


def test_a_hearing_with_no_inquiry_title_has_an_empty_one():
    # 'Joint Select Committee on Artificial Intelligence : 18/09/2026 :' -- no inquiry after the date
    joint = [e for e in ct.parse_listing(read("listing_page.html")).entries if e.dataset == "commjnt"][0]
    assert joint.committee == "Joint Select Committee on Artificial Intelligence" and joint.inquiry == ""


@pytest.mark.parametrize("title,expected", [
    ("Community Affairs Legislation Committee : 24/09/2026 : Aged Care Bill 2026 :",
     ("Community Affairs Legislation Committee", "2026-09-24", "Aged Care Bill 2026")),
    ("Standing Committee on Economics : 18/09/2026 :", ("Standing Committee on Economics", "2026-09-18", "")),
    ("Joint Standing Committee on Treaties : 17/08/2026 : Agreement A; and Agreement B",
     ("Joint Standing Committee on Treaties", "2026-08-17", "Agreement A; and Agreement B")),
    ("Foreign Affairs, Defence and Trade Legislation Committee : 10/03/2026 : Additional Esimates 2025-2026 :",
     ("Foreign Affairs, Defence and Trade Legislation Committee", "2026-03-10", "Additional Esimates 2025-2026")),
])
def test_listing_titles(title, expected):
    assert ct.parse_listing_title(title) == expected


def test_grouping_folds_fragments_into_hearings_newest_first_and_leaves_the_toc_out_of_the_fragment_list():
    hearings = ct.group_listing(ct.parse_listing(read("listing_page.html")).entries)
    by_id = {h.hearing_id: h for h in hearings}
    assert set(by_id) == {"committees/commsen/29971", "committees/commrep/29882", "committees/commjnt/29957"}
    assert by_id["committees/commsen/29971"].fragment_ids == ["0001", "0002"]
    assert by_id["committees/commrep/29882"].inquiry_title.startswith("Review of the Reserve Bank")
    assert [h.date for h in hearings] == sorted((h.date for h in hearings), reverse=True)


def test_an_empty_listing_has_no_entries_and_a_zero_total():
    page = ct.parse_listing('<html><div class="resultsSummaryNav">Summary results: 0-0 of 0&#160;matches.</div></html>')
    assert page.total == 0 and page.entries == []


# ---- TOC -------------------------------------------------------------------------------------------------------------

def test_toc_reports_proof_then_final_and_the_fragment_ids():
    proof = ct.parse_toc(read("toc_proof.html"), "committees/commrep/29882")
    assert proof.status == "Proof" and proof.fragment_ids == ["0001"]
    assert proof.committee_name == "Standing Committee on Economics" and proof.date == "2026-09-18"
    assert ct.parse_toc(read("toc_final.html"), "committees/commrep/29882").status == "Final"


def test_toc_without_a_status_line_has_none():
    assert ct.parse_toc("<html><body>nothing here</body></html>", "committees/commrep/1").status is None


# ---- fragments -------------------------------------------------------------------------------------------------------

@pytest.fixture(scope="module")
def house_turns():
    return ct.parse_fragment(read("fragment_house.html"), HOUSE, "0001")


def test_a_turn_is_typed_from_the_markup_class_not_from_the_honorific(house_turns):
    kinds = {(t.speaker_name, t.speaker_type) for t in house_turns}
    assert ("Mr KENNEDY", "member") in kinds and ("Mr GREGG", "member") in kinds
    assert ("Ms Bullock", "witness") in kinds and ("Mr Hauser", "witness") in kinds
    assert ("CHAIR", "chair") in kinds
    assert {t.speaker_type for t in house_turns} == {"chair", "member", "witness"}


def test_a_members_turn_carries_the_handbook_id_from_the_label_link(house_turns):
    by_name = {t.speaker_name: t for t in house_turns if t.speaker_type == "member"}
    assert by_name["Mr KENNEDY"].handbook_id == "267506"       # Simon Kennedy (Cook)
    assert by_name["Mr GREGG"].handbook_id == "315154"
    assert all(t.handbook_id is None for t in house_turns if t.speaker_type == "witness")


def test_the_chair_named_in_brackets_is_identified_and_the_label_stays_chair(house_turns):
    first = house_turns[0]
    assert (first.speaker_name, first.speaker_type, first.handbook_id, first.named_as) == ("CHAIR", "chair", "91219", "Mr Husic")
    # the bracketed name must not leak into the text ("CHAIR (Mr Husic): Welcome ..." used to leave "(Mr Husic):")
    assert first.text.startswith("Welcome. I declare open this hearing")
    later_chair = [t for t in house_turns if t.speaker_type == "chair"][1]
    assert later_chair.handbook_id is None and later_chair.named_as is None


def test_paragraphs_after_a_label_belong_to_that_turn_and_join_with_blank_lines(house_turns):
    first = house_turns[0]
    assert "\n\n" in first.text                                   # the chair's opening statement runs on for several paragraphs
    assert "The hearing comes at a consequential time" in first.text


def test_no_speaker_prefix_entities_or_reporters_lines_remain_in_the_text(house_turns):
    for t in house_turns:
        assert not t.text.startswith(("CHAIR", "Mr ", "Ms ", "Senator ", ":", "("))
        assert "&#" not in t.text and "&amp;" not in t.text
        assert "Committee met at" not in t.text and "Proceedings suspended" not in t.text and "Committee adjourned" not in t.text
    assert all(t.speaker_name != "UNKNOWN" for t in house_turns)     # the 'Committee met at' pseudo-row is gone


def test_entities_are_unescaped_in_the_text():
    assert any("—" in t.text for t in ct.parse_fragment(read("fragment_house.html"), HOUSE, "0001"))   # &#8212; -> em dash


def test_topic_is_the_committee_and_inquiry_without_the_page_date_or_a_repeated_committee(house_turns):
    topic = "Standing Committee on Economics - Review of the Reserve Bank of Australia Annual Report 2025"
    assert {t.topic for t in house_turns} == {topic}
    assert "18/09/2026" not in topic and topic.count("Committee") == 1


def test_the_listings_inquiry_stands_in_when_the_page_prints_none():
    page = read("fragment_house.html").replace(
        "Standing Committee on Economics <br/> 18/09/2026 <br/> Review of the Reserve Bank of Australia Annual Report 2025",
        "Standing Committee on Economics <br/> 18/09/2026")
    assert {t.topic for t in ct.parse_fragment(page, HOUSE, "0001")} == {
        "Standing Committee on Economics - Review of the Reserve Bank of Australia Annual Report 2025"}


def test_turns_carry_dataset_date_committee_and_fragment_level_hearing_id(house_turns):
    t = house_turns[1]
    assert (t.dataset, t.date, t.committee_name, t.hearing_id) == (
        "commrep", "2026-09-18", "Standing Committee on Economics", "committees/commrep/29882/0001")


def test_senate_fragment_indented_quotation_stays_in_the_speakers_turn():
    turns = ct.parse_fragment(read("fragment_senate.html"), SENATE, "0001")
    assert [(t.speaker_type, t.speaker_name) for t in turns] == [
        ("chair", "CHAIR"), ("witness", "Mr Yates"), ("member", "Senator RUSTON"), ("member", "Senator ALLMAN-PAYNE")]
    ruston = turns[2]
    assert ruston.handbook_id == "243273" and "escalation pathway amendment responds to stakeholder feedback" in ruston.text
    assert turns[0].named_as == "Senator Whiteaker" and turns[0].handbook_id == "316555"


def test_a_speech_that_runs_across_a_fragment_boundary_keeps_its_speaker():
    page = ('<div id="documentContent"><span class="sumLink">C <br/> 01/01/2026 <br/> Inquiry</span><div class="docDiv">'
            '<p class="HPS-Normal"><span class="HPS-Normal">The second half of a long answer that began at the end of the '
            'previous fragment, with no speaker label of its own.</span></p></div></div>')
    prev = ct.SpeechRecord("Ms Bullock", "witness", "x", "committees/commrep/1/0001", "C", "2026-01-01", "t", "commrep")
    carried = ct.parse_fragment(page, HOUSE, "0002", carry=prev)
    assert [(t.speaker_name, t.speaker_type) for t in carried] == [("Ms Bullock", "witness")]
    # with nothing to carry, text before the first label is dropped rather than filed under a made-up speaker
    assert ct.parse_fragment(page, HOUSE, "0002") == []


def test_the_in_attendance_block_of_an_estimates_fragment_is_not_a_speech():
    page = ('<div id="documentContent"><span class="sumLink">Legislation Committee <br/> 10/03/2026 <br/> Additional Esimates 2025-2026 '
            '<br/> DEFENCE PORTFOLIO <br/> Defence Housing Australia</span><div class="docDiv">'
            '<p class="HPS-Normal"><span class="HPS-Normal">In Attendance</span></p>'
            '<p class="HPS-Normal"><span class="HPS-Normal">Senator McAllister, Minister for the National Disability Insurance Scheme</span></p>'
            '<p class="HPS-Normal"><span class="HPS-Normal"><a href="/parlInfo/search/display/display.w3p;query=Id%3A%22handbook%2Fallmps%2F73%22" '
            'type="MemberContinuation"><span class="HPS-MemberContinuation">CHAIR:</span></a> I declare open this meeting of the committee, '
            'and I want to begin by acknowledging the traditional custodians of the land.</span></p></div></div>')
    est = ct.HearingMetadata(hearing_id="committees/estimate/1", dataset="estimate", committee_name="Legislation Committee", date="2026-03-10")
    turns = ct.parse_fragment(page, est, "0001")
    assert [(t.speaker_name, t.speaker_type, t.handbook_id) for t in turns] == [("CHAIR", "chair", "73")]
    assert turns[0].topic == "Legislation Committee - Additional Esimates 2025-2026 - DEFENCE PORTFOLIO - Defence Housing Australia"


def test_a_short_labelled_turn_does_not_hand_the_next_paragraphs_to_the_previous_speaker():
    page = ('<div id="documentContent"><span class="sumLink">C <br/> 01/01/2026 <br/> Inquiry</span><div class="docDiv">'
            '<p class="HPS-Normal"><span class="HPS-Normal"><span class="HPS-WitnessName">Ms Smith</span>'
            '<span class="HPS-GeneralBold">:</span> Yes.</span></p>'
            '<p class="HPS-Normal"><span class="HPS-Normal">And to add to that, the committee should note the second point in full.</span></p>'
            '</div></div>')
    turns = ct.parse_fragment(page, HOUSE, "0001")
    assert len(turns) == 1 and turns[0].speaker_name == "Ms Smith" and turns[0].text.startswith("Yes.\n\nAnd to add")


def test_a_page_without_a_transcript_gives_no_turns():
    assert ct.parse_fragment("<html><body>Not found</body></html>", HOUSE, "0001") == []


def test_fragment_hash_is_about_what_is_said_and_changes_with_the_words(house_turns):
    h = ct.fragment_hash(house_turns)
    assert h == ct.fragment_hash(ct.parse_fragment(read("fragment_house.html"), HOUSE, "0001"))
    edited = ct.parse_fragment(read("fragment_house.html").replace("consequential time", "very consequential time"), HOUSE, "0001")
    assert ct.fragment_hash(edited) != h
    assert ct.hearing_hash({"0001": h, "0002": "b"}) != ct.hearing_hash({"0001": h, "0002": "c"})


# ---- witness list ----------------------------------------------------------------------------------------------------

def test_witness_list_names_position_and_organisation():
    ws = ct.parse_witness_list(read("fragment_house.html"))
    assert [(w.name, w.honorific, w.position, w.organisation) for w in ws] == [
        ("Michele Bullock", "Ms", "Governor", "Reserve Bank of Australia"),
        ("Andrew Hauser", "Mr", "Deputy Governor", "Reserve Bank of Australia"),
        ("Sarah Hunter", "Dr", "Assistant Governor, Economic", "Reserve Bank of Australia"),
        ("Brad Jones", "Dr", "Assistant Governor, Financial System", "Reserve Bank of Australia")]
    assert ws[0].surname == "Bullock"


@pytest.mark.parametrize("raw,name,position,org,remote", [
    ("BAUMGART, Mr Richard, Chief Adviser, Service Delivery, Department of Social Services",
     "Richard Baumgart", "Chief Adviser, Service Delivery", "Department of Social Services", False),
    ("EAGAR, Professor Kathleen (Kathy), Private capacity [by video link]", "Kathy Eagar", None, "Private capacity", True),
    ("O'LOUGHLIN, Ms Anne, Chief Executive Officer, Australian Banking Association", "Anne O'Loughlin",
     "Chief Executive Officer", "Australian Banking Association", False),
    ("MCDONALD, Dr Jo, Director", "Jo McDonald", "Director", None, False),
])
def test_witness_line_shapes(raw, name, position, org, remote):
    w = ct.parse_witness_line(raw)
    assert (w.name, w.position, w.organisation, w.remote) == (name, position, org, remote)


@pytest.mark.parametrize("raw,name,surname,hon,position,org", [
    ("QI, Associate Professor Jing, Program Manager, RMIT Community Languages Teacher Education Program, Royal Melbourne Institute of Technology",
     "Jing Qi", "Qi", "Associate Professor", "Program Manager, RMIT Community Languages Teacher Education Program", "Royal Melbourne Institute of Technology"),
    ("DELANEY, Caitlin, First Assistant Secretary, National Reform and Youth Division, Department of Education",
     "Caitlin Delaney", "Delaney", None, "First Assistant Secretary, National Reform and Youth Division", "Department of Education"),
    ("Brendan, Private capacity", "Brendan", "Brendan", None, None, "Private capacity"),
    ("Jennifer (Jen), Private capacity [by video link]", "Jennifer", "Jennifer", None, None, "Private capacity"),
    ("ROACH, Aunty Vickie, Private capacity", "Vickie Roach", "Roach", "Aunty", None, "Private capacity"),
    ("McBEAN, Ms Kim, Chief Executive Officer, Service Providers Australia", "Kim McBean", "McBean", "Ms", "Chief Executive Officer", "Service Providers Australia"),
    ("BAROLITS-McCABE, Ms Ann, Director, Regional Health Network", "Ann Barolits-McCabe", "Barolits-McCabe", "Ms", "Director", "Regional Health Network"),
    ("MacDONALD, Dr Ian, Senior Fellow, Grattan Institute", "Ian MacDonald", "MacDonald", "Dr", "Senior Fellow", "Grattan Institute"),
])
def test_witnesses_listed_with_unusual_honorifics_or_no_surname(raw, name, surname, hon, position, org):
    w = ct.parse_witness_line(raw)
    assert (w.name, w.surname, w.honorific, w.position, w.organisation) == (name, surname, hon, position, org)


def test_a_line_that_is_not_a_person_is_not_a_witness():
    assert ct.parse_witness_line("Department of Health and Aged Care") is None
    assert ct.parse_witness_line("") is None
    assert ct.parse_witness_line("SMITH, Department of Health") is None       # a heading, not a witness
    assert ct.parse_witness_line("Department of Health and Aged Care, Canberra") is None
    assert ct.parse_witness_line("AUSTRALIAN BANKING ASSOCIATION, Melbourne") is None


def test_surname_case():
    assert [ct.surname_case(s) for s in ("BULLOCK", "O'LOUGHLIN", "MCDONALD", "LA RANCE", "SMITH-JONES")] == [
        "Bullock", "O'Loughlin", "McDonald", "La Rance", "Smith-Jones"]
