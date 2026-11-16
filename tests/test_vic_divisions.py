"""Victorian divisions from the daily Hansard: what is published, and what goes on the mismatch list."""

import importlib.util
import json
from pathlib import Path

import pytest

from parli.ingest import vic_divisions as V

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("division_pages_for_vic", ROOT / "scripts/export_division_pages.py")
D = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(D)

DAY = {"date": "2023-02-23", "house": "vic_lc", "label": "Council", "id": "HANSARD-1", "status": "Final",
       "pdf": "https://www.parliament.vic.gov.au/x/hansard-1.pdf",
       "online": "https://www.parliament.vic.gov.au/parliamentary-activity/hansard/hansard-details/HANSARD-1"}
MEMBERS = [("Able", "Northern Victoria"), ("Baker", "Western Victoria"), ("Cole", "Eastern Victoria"),
           ("Dunn", "Southern Metropolitan")]


class FakeRoster(V.Roster):
    def __init__(self, people):
        self.by_key, self.by_seat = {}, {}
        for name, seat in people:
            record = {"person_id": None, "basis": "people-directory"}
            self._add("vic_lc", name, name, record)
            self._seat("vic_lc", seat, name, record)


ROSTER = FakeRoster([("Ann Able", "Northern Victoria"), ("Bob Baker", "Western Victoria"),
                     ("Cy Cole", "Eastern Victoria"), ("Di Dunn", "Southern Metropolitan")])


def line(text, kind="body", page=7):
    """One body line as pdf_lines gives it. kind: bold (whole line), speaker (bold name, plain speech),
    italic, quote (the small type of a motion), heading (centred bold), stage (centred italic), body."""
    return {"page": page, "x": 95.0, "y": 100.0, "text": text,
            "bold": kind in ("bold", "speaker", "heading"), "allbold": kind in ("bold", "heading"),
            "italic": kind in ("italic", "stage"), "quote": kind == "quote", "centred": kind in ("heading", "stage"),
            "heading": kind == "heading"}


def division(ayes="Ayes (2): Ann Able, Bob Baker", noes="Noes (1): Cy Cole", result="Motion agreed to.",
             on="Council divided on motion:"):
    return [line(on, "bold"), line(ayes, "italic"), line(noes, "italic"), *([line(result, "bold")] if result else [])]


def parse(lines, roster=ROSTER, members=MEMBERS):
    return V.parse_day(lines, DAY, roster, members)


def test_a_reconciled_division_keeps_its_link_date_tallies_and_printed_text():
    lines = [line("Bills", "heading"), line("Example Amendment Bill 2023", "heading"), line("Third reading", "stage"),
             line("Ann ABLE (Northern Victoria) (20:38): I move:", "speaker"),
             line("That the bill be now read a third time and do pass.", "quote"), *division()]
    good, bad = parse(lines)
    assert not bad
    (d,) = good
    assert d["id"] == "vic-lc-2023-02-23-1" and d["date"] == "2023-02-23"
    assert d["source_url"] == "https://www.parliament.vic.gov.au/x/hansard-1.pdf#page=7"
    assert (d["ayes_count"], d["noes_count"], d["result"]) == (2, 1, "affirmative")
    assert d["name"] == "Example Amendment Bill 2023" and d["bill_ref"] == "Example Amendment Bill 2023"
    assert d["question"] == "That the bill be now read a third time and do pass."
    assert d["extra"]["stage"] == "Third reading" and d["extra"]["result_text"] == "Motion agreed to."
    assert [(v["person_name"], v["vote"]) for v in d["votes"]] == [("Ann Able", "aye"), ("Bob Baker", "aye"), ("Cy Cole", "no")]


def test_names_that_do_not_equal_the_stated_tally_are_not_published():
    good, bad = parse(division(ayes="Ayes (3): Ann Able, Bob Baker"))
    assert not good
    assert bad[0]["reasons"] == ["count-mismatch"]
    assert bad[0]["stated"] == {"ayes": 3, "noes": 1} and bad[0]["parsed"] == {"ayes": 2, "noes": 1}
    assert bad[0]["source_url"].endswith("#page=7")


def test_a_name_the_roster_does_not_hold_is_never_guessed():
    good, bad = parse(division(noes="Noes (1): Zed Unknown"))
    assert not good
    assert bad[0]["reasons"] == ["unresolved-name"] and bad[0]["unresolved_names"] == ["Zed Unknown"]


def test_two_roster_people_of_one_name_leave_it_unresolved():
    roster = FakeRoster([("Ann Able", "Northern Victoria"), ("Bob Baker", "Western Victoria"), ("Cy Cole", "Eastern Victoria")])
    roster._add("vic_lc", "Ann Able", "Ann Able (the second)", {"person_id": None, "basis": "people-directory"})
    assert roster.resolve("vic_lc", "Ann Able", MEMBERS) is None


def test_another_form_of_a_given_name_resolves_only_through_the_days_member_list_and_seat():
    lines = division(ayes="Ayes (2): Annabel Able, Bob Baker")
    good, bad = parse(lines)
    assert not bad
    vote = good[0]["votes"][0]
    assert (vote["person_raw"], vote["person_name"]) == ("Annabel Able", "Ann Able")
    assert vote["roster_basis"] == "hansard-member-list:people-directory"
    # Two members of the surname on the list, or no seat for it, and the name stays unresolved.
    for members in ([*MEMBERS, ("Able", "Western Victoria")], [("Able", None), *MEMBERS[1:]], []):
        good, bad = parse(lines, members=members)
        assert not good and bad[0]["unresolved_names"] == ["Annabel Able"]


def test_a_result_line_that_contradicts_the_tally_or_is_missing_goes_on_the_list():
    assert parse(division(result="Question defeated."))[1][0]["reasons"] == ["result-contradicts-tally"]
    assert parse(division(result=None))[1][0]["reasons"] == ["no-result-line"]


def test_names_run_over_lines_and_a_hyphen_at_a_line_end():
    lines = [line("Council divided on amendment:", "bold"), line("Ayes (2): Ann Able, Bob", "italic"), line("Baker"),
             line("Noes (1): Cy Cole", "italic"), line("Amendment agreed to.", "bold")]
    good, bad = parse(lines)
    assert not bad and [v["person_raw"] for v in good[0]["votes"]] == ["Ann Able", "Bob Baker", "Cy Cole"]
    assert V._names("Mary- Anne Thomas, Kathleen Matthews- Ward") == ["Mary-Anne Thomas", "Kathleen Matthews-Ward"]


def test_text_is_the_division_line_unless_the_motion_is_printed_directly_before_it():
    debated = [line("Ann ABLE: I move:", "speaker"), line("1. Clause 9, omit “one year”.", "quote"),
               line("Bob BAKER: The government will be opposing this amendment.", "speaker"),
               *division(on="Council divided on amendment:", result="Amendment agreed to.")]
    good, _ = parse(debated)
    assert good[0]["question"] == "Council divided on amendment"
    assert good[0]["extra"]["question_basis"] == "division-line"
    chair = [line("The SPEAKER: The member has moved an amendment. The question is:", "speaker"),
             line("That the word proposed to be omitted stand part of the motion.", "quote"),
             line("Those supporting the amendment should vote no."),
             *division(on="Council divided on question:", result="Question agreed to.")]
    good, _ = parse(chair)
    assert good[0]["question"] == "That the word proposed to be omitted stand part of the motion."


def test_the_motion_put_straight_after_its_lost_amendment_takes_the_motion_printed_above():
    lines = [line("Motions", "heading"), line("Health infrastructure", "heading"),
             line("Debate resumed on motion of Ann Able:", "bold"), line("That this house notes the hospitals.", "quote"),
             line("And Cy Cole’s amendment:", "bold"), line("That the words ‘and their cost’ be added.", "quote"),
             *division(ayes="Ayes (1): Cy Cole", noes="Noes (2): Ann Able, Bob Baker", result="Amendment defeated.",
                       on="Council divided on amendment:"),
             *division()]
    good, bad = parse(lines)
    assert not bad and [d["id"][-1] for d in good] == ["1", "2"]
    assert good[0]["question"] == "That the words ‘and their cost’ be added."
    assert good[1]["question"] == "That this house notes the hospitals."
    assert good[1]["extra"]["question_basis"] == "printed-before-amendment-division"
    assert {d["name"] for d in good} == {"Health infrastructure"}


def test_a_wrapped_procedural_line_is_not_a_heading():
    title = {**line("Example Bill 2026", "heading"), "x": 250.0, "y": 100.0}
    wide = {**line("Amendments 1, 3 to 6, 9 to 22, 24 to 31, 34 to 37, 40 to 46, 51 to 58, 62 to 85, 87 to 99, 114 to 451", "heading"), "y": 300.0}
    rest = {**line("and 453 agreed to.", "bold"), "y": 312.6}
    lines = V.unmark_wrapped_lines([title, wide, rest, *[{**ln, "y": 400.0 + 12 * k} for k, ln in enumerate(division())]])
    assert [ln["heading"] for ln in lines[:3]] == [True, False, False]
    good, _ = parse(lines)
    assert good[0]["name"] == "Example Bill 2026"
    # A long heading set over two lines keeps both: its second line is centred, not at the margin.
    two = V.unmark_wrapped_lines([{**line("Justice Legislation Amendment (Family Violence, Coercive Control, Risk", "heading"), "y": 100.0},
                                  {**line("Assessment and Other Matters) Bill 2026", "heading"), "x": 210.0, "y": 112.6}])
    assert [ln["heading"] for ln in two] == [True, True]


def test_a_mismatch_keeps_its_number_so_later_ids_do_not_move():
    good, bad = parse([*division(noes="Noes (1): Zed Unknown"), *division()])
    assert bad[0]["id"] == "vic-lc-2023-02-23-1" and good[0]["id"] == "vic-lc-2023-02-23-2"


def test_a_tally_with_no_division_line_is_reported():
    good, bad = parse([line("Ayes (1): Ann Able", "italic"), line("Noes (1): Cy Cole", "italic")])
    assert not good and [b["reasons"] for b in bad] == [["tally-without-division-line"]] * 2


def test_the_fetcher_keeps_to_one_host_and_a_two_second_interval(tmp_path):
    with pytest.raises(ValueError):
        V.Fetcher(tmp_path, interval=0.5)
    fetcher = V.Fetcher(tmp_path)
    for url in ("https://example.test/a.pdf", "http://www.parliament.vic.gov.au/a.pdf"):
        with pytest.raises(ValueError):
            fetcher._request(url, "*/*")
    assert fetcher.made == 0


def test_a_request_carries_the_shared_identifying_agent_and_a_refusal_stops_the_run(tmp_path, monkeypatch):
    from parli.ingest import http as source_http
    import io, urllib.error
    seen = []

    class Opener:
        def __init__(self, status): self.status = status
        def open(self, req, timeout=None):
            seen.append(dict(req.header_items()))
            if self.status != 200:
                raise urllib.error.HTTPError(req.full_url, self.status, "no", {}, io.BytesIO(b""))
            class Resp(io.BytesIO):
                def getcode(self): return 200
                def __enter__(self): return self
                def __exit__(self, *a): return False
            return Resp(b"%PDF-1.7 body")

    monkeypatch.setattr(V.time, "sleep", lambda s: None)
    fetcher = V.Fetcher(tmp_path)
    fetcher.opener = Opener(200)
    assert fetcher._request("https://www.parliament.vic.gov.au/a.pdf", "application/pdf") == b"%PDF-1.7 body"
    assert seen[0]["User-agent"] == source_http.USER_AGENT
    for status in (403, 429):
        fetcher.opener = Opener(status)
        with pytest.raises(SystemExit) as stop:
            fetcher._request("https://www.parliament.vic.gov.au/b.pdf", "application/pdf")
        assert stop.value.code == 4
    assert fetcher.made == 3 and len((tmp_path / "requests.log").read_text().splitlines()) == 3


def test_a_cached_file_is_never_requested_again(tmp_path):
    path = tmp_path / "pdf" / "a.pdf"
    path.parent.mkdir()
    path.write_bytes(b"%PDF-1.7 cached")
    fetcher = V.Fetcher(tmp_path)
    assert fetcher.get("https://www.parliament.vic.gov.au/a.pdf", path, "application/pdf", lambda b: True) == b"%PDF-1.7 cached"
    assert fetcher.made == 0 and not (tmp_path / "requests.log").exists()


def test_a_number_a_published_record_disputes_is_held_with_the_new_ids_after_it(tmp_path):
    good, _ = parse([*division(), *division(ayes="Ayes (1): Ann Able", noes="Noes (2): Bob Baker, Cy Cole", result="Motion negatived."),
                     *division(ayes="Ayes (2): Ann Able, Cy Cole", noes="Noes (1): Bob Baker")])
    # The old import missed the second one, so it published the third under the second's number.
    for key, reading in ((good[0]["id"], good[0]), (good[1]["id"], good[2])):
        (tmp_path / f"division-{key}.json").write_text(json.dumps({
            "key": key, "ayes": reading["ayes_count"], "noes": reading["noes_count"],
            "members": [{"name": v["person_name"], "vote": v["vote"]} for v in reading["votes"]]}))
    keep, held = V.hold_published_conflicts(good, tmp_path)
    assert [g["id"][-1] for g in keep] == ["1"]
    assert [(h["id"][-1], h["reasons"]) for h in held] == [("2", ["numbering-differs-from-published"]),
                                                           ("3", ["numbering-differs-from-published"])]
    assert held[0]["published"] == {"ayes": 2, "noes": 1} and held[1]["published"] is None
    # The missed division is published nowhere; the one after it is, under the number before its own.
    assert (held[0]["published_as"], held[1]["published_as"]) == (None, good[1]["id"])
    assert held[0]["members"] == ["Ann Able", "Bob Baker", "Cy Cole"]


def test_every_held_division_gives_a_coverage_note_naming_its_members_whatever_the_reason():
    _, bad = parse([*division(noes="Noes (1): Zed Unknown"), *division(ayes="Ayes (2): Ann Able, Cy Cole", noes="Noes (1): Zed Unknown"),
                    *division(result="Question defeated.")])
    notes = {n["reason"]: n for n in V.vote_coverage(bad)["notes"]}
    assert set(notes) == {"unresolved-name", "result-contradicts-tally"}
    name = notes["unresolved-name"]
    assert (name["house"], name["held"], name["from"], name["to"]) == ("vic_lc", 2, "2023-02-23", "2023-02-23")
    assert name["members"] == ["Ann Able", "Bob Baker", "Cy Cole"]      # never the unresolved name
    assert name["divisions"] == ["vic-lc-2023-02-23-1", "vic-lc-2023-02-23-2"]
    assert notes["result-contradicts-tally"]["held"] == 1
    # A division already published under another number is not missing, so it is not counted.
    elsewhere = [{**bad[2], "published_as": "vic-lc-2023-02-23-9"}]
    assert V.vote_coverage(elsewhere)["notes"] == []
    assert V.vote_coverage([])["notes"] == []


INCORPORATED = [line("Bills", "heading"), line("Example Amendment Bill 2025", "heading"), line("Second reading", "stage"),
                line("Debate resumed on motion of Ann Able:", "bold"), line("That the bill be now read a second time.", "quote"),
                line("Bob BAKER (Western Victoria) (10:04): The bill is before us.", "speaker"),
                line("Cy COLE (Eastern Victoria) incorporated the following:", "speaker"),
                line("I rise to make a brief contribution to the Example Amendment Bill 2025.", "quote"),
                line("We need to fund our services, and, for that reason, my party will support this bill.", "quote"),
                *division()]


def test_an_incorporated_speech_before_a_division_is_never_its_question():
    """vic-lc-2025-05-15-1: a member's incorporated speech is set in the same small type as a motion, under a
    line that ends in a colon, and the division followed it directly. It was published as the question."""
    good, bad = parse(INCORPORATED)
    assert not good
    assert bad[0]["reasons"] == ["question-lead-not-a-motion", "question-reads-as-speech"]
    assert bad[0]["question_lead"] == "Cy COLE (Eastern Victoria) incorporated the following:"
    assert bad[0]["name"] == "Example Amendment Bill 2025"


@pytest.mark.parametrize("lead,ok", [
    ("Ann ABLE (Northern Victoria) (20:38): I move:", True), ("I move, by leave:", True), ("move:", True),
    ("The SPEAKER: The question is:", True), ("posed by the member for Ringwood. The question is therefore:", True),
    ("The DEPUTY SPEAKER: The second question is:", True), ("Debate resumed on motion of Ann Able:", True),
    ("And Cy Cole’s amendment:", True), ("Cy COLE (Eastern Victoria) incorporated the following:", False),
    ("Ann ABLE: My contribution is as follows:", False), ("The statement reads:", False), ("to remove:", False),
])
def test_only_a_motion_lead_introduces_a_question(lead, ok):
    assert bool(V.MOTION_LEAD_RE.search(lead)) is ok
    lines = [line("Example Bill 2025", "heading"), line(lead, "speaker"), line("That the bill be now read a third time.", "quote"), *division()]
    good, bad = parse(lines)
    assert bool(good) is ok
    if ok:
        assert good[0]["question"] == "That the bill be now read a third time."
    else:
        assert "question-lead-not-a-motion" in bad[0]["reasons"]


def test_a_very_long_question_is_held_for_a_person_unless_reviewed():
    long = [line("Example Bill 2025", "heading"), line("Ann ABLE: I move:", "speaker"),
            *[line("That clause %d be amended as set out in the schedule circulated to members." % k, "quote") for k in range(40)],
            *division()]
    good, bad = parse(long)
    assert not good and bad[0]["reasons"] == ["question-too-long"]
    record = {"id": "vic-lc-2026-09-22-1", "name": "A Bill 2026", "question": "That " + "x" * 13000,
              "extra": {"question_basis": "printed-before-division", "question_lead": "A MEMBER: I move:", "division_line": "Council divided on motion:"}}
    assert V.text_faults(record) == []                                   # the reviewed genuine long motion
    assert V.text_faults({**record, "id": "vic-lc-2026-09-22-2"}) == ["question-too-long"]
    assert all(why.strip() for faults in V.REVIEWED_TEXT.values() for why in faults.values())


SERVICE = [{"surname": "Able", "given": "Ann", "seat": "Northern Victoria", "start": None, "end": "2023-02-22", "notes": []},
           {"surname": "Baker", "given": "Bob", "seat": "Western Victoria", "start": "2023-02-23", "end": None, "notes": []},
           {"surname": "Cole", "given": "Cy", "seat": "Eastern Victoria", "start": None, "end": None, "notes": []},
           {"surname": "Cole", "given": "Dee", "seat": "Southern Metropolitan", "start": "2024-01-01", "end": None, "notes": []}]


def test_a_member_cannot_vote_before_being_sworn_in_or_after_leaving():
    assert V.service_fault("Bob Baker", "2023-02-23", SERVICE) is None                       # the day he was sworn in
    assert V.service_fault("Bob Baker", "2023-02-22", SERVICE) == "vote-outside-service-dates"
    assert V.service_fault("Ann Able", "2023-02-22", SERVICE) is None                        # her last day
    assert V.service_fault("Ann Able", "2023-02-23", SERVICE) == "vote-outside-service-dates"
    assert V.service_fault("Cy Cole", "2023-06-01", SERVICE) is None                         # two Coles, told apart by the given name
    assert V.service_fault("Dee Cole", "2023-06-01", SERVICE) == "vote-outside-service-dates"
    assert V.service_fault("Zed Unknown", "2023-06-01", SERVICE) == "name-not-on-hansard-member-list"
    assert V.service_fault("Ann Able", "2030-01-01", None) is None                           # no list, nothing asserted
    good, bad = V.parse_day(division(), DAY, ROSTER, MEMBERS, SERVICE)                       # 23 February 2023: Ann Able has left
    assert not good and bad[0]["reasons"] == ["vote-outside-service-dates"]
    assert bad[0]["service_faults"] == ["Ann Able: vote-outside-service-dates"]


# ---- The committed data ---------------------------------------------------------------------------------------

PUBLIC = ROOT / "portal/public/divisions"
STAGED = ROOT / "data/staged/vic-divisions"


def test_no_published_victorian_division_carries_text_that_is_not_what_was_voted_on():
    """The sweep, pinned: every committed Victorian record, every class. A record may match a class only through
    a reviewed entry in REVIEWED_TEXT, which says what a person checked on the Hansard page."""
    found = V.sweep_published(PUBLIC, STAGED)
    shared = found.pop("standing-form-shared")
    assert found == {k: [] for k in found}, {k: v for k, v in found.items() if v}
    # The only long texts two headings share are standing forms of the second-reading question.
    for ids in shared:
        texts = {json.loads((PUBLIC / f"division-{i}.json").read_text(encoding="utf-8"))["question"] for i in ids}
        assert len(texts) == 1 and V.STANDING_FORM_RE.match(next(iter(texts)))
    published = {p.stem[len("division-"):] for p in PUBLIC.glob("division-vic-*.json")}
    assert set(V.REVIEWED_TEXT) <= published, "a reviewed exception for a record that is not published"


def test_the_sweep_finds_each_class_when_it_is_there(tmp_path):
    pub, staged_dir = tmp_path / "pub", tmp_path / "staged"
    pub.mkdir(); staged_dir.mkdir()
    def shard(key, name, question, members=("Ann Able",), house="vic_lc", date="2025-05-15"):
        (pub / f"division-{key}.json").write_text(json.dumps({"key": key, "name": name, "question": question, "house": house,
            "date": date, "members": [{"name": m, "vote": "aye"} for m in members]}))
    def reading(key, question, lead, on="motion"):
        return {"id": key, "question": question, "extra": {"question_basis": "printed-before-division", "question_lead": lead, "divided_on": on}}
    speech = "I rise to make a brief contribution to the bill."
    long = "That " + "the schedule be amended " * 100
    shared = "That this house notes the detailed and particular matters set out in the motion standing on the notice paper today, as circulated."
    shard("vic-lc-2025-05-15-1", "A Bill 2025", speech)
    shard("vic-lc-2025-05-15-2", "A Bill 2025", long)
    shard("vic-lc-2025-05-15-3", "Amendments agreed to; amended clause agreed to; clauses 2 to 9", "Council divided on clause")
    shard("vic-lc-2025-05-15-4", "A Bill 2025", "Council divided on amendment", members=("Ann Able 4198 Legislative Council",))
    shard("vic-lc-2025-05-15-5", "Health", shared)
    shard("vic-lc-2025-05-15-6", "Health", shared)
    shard("vic-lc-2025-05-15-7", "Roads", shared)
    shard("vic-lc-2025-05-15-8", "A Bill 2025", "That the bill be now read a third time.")
    (staged_dir / "divisions.jsonl").write_text("".join(json.dumps(r) + "\n" for r in [
        reading("vic-lc-2025-05-15-1", speech, "Cy COLE (Eastern Victoria) incorporated the following:"),
        reading("vic-lc-2025-05-15-2", long, "Ann ABLE: I move:"),
        reading("vic-lc-2025-05-15-5", shared, "And Cy Cole’s amendment:", on="amendment"),
        reading("vic-lc-2025-05-15-6", shared, "Debate resumed on motion of Ann Able:"),
        reading("vic-lc-2025-05-15-7", shared, "Ann ABLE: I move:"),
    ]))
    found = V.sweep_published(pub, staged_dir)
    assert found["question-lead-not-a-motion"] == ["vic-lc-2025-05-15-1"]
    assert found["question-reads-as-speech"] == ["vic-lc-2025-05-15-1"]
    assert found["question-too-long"] == ["vic-lc-2025-05-15-2"]
    assert found["heading-is-a-procedural-line"] == ["vic-lc-2025-05-15-3"]
    assert found["member-name-carries-furniture"] == ["vic-lc-2025-05-15-4"]
    assert found["amendment-text-on-motion"] == [["vic-lc-2025-05-15-5", "vic-lc-2025-05-15-6"]]
    assert found["long-question-shared"] == [["vic-lc-2025-05-15-5", "vic-lc-2025-05-15-6", "vic-lc-2025-05-15-7"]]
    assert found["question-not-in-staged-parse"] == ["vic-lc-2025-05-15-8"]


def test_every_new_published_record_prints_exactly_the_staged_reading():
    readings = {}
    for row in (STAGED / "divisions.jsonl").read_text(encoding="utf-8").splitlines():
        r = json.loads(row)
        readings[r["id"]] = r
    checked = 0
    for path in PUBLIC.glob("division-vic-*.json"):
        record = json.loads(path.read_text(encoding="utf-8"))
        corrected = any(c.get("finding") == D.CORRECTION_FINDING for c in record["_meta"].get("corrections", []))
        if record["_meta"].get("source") != D.STAGED_SOURCE and not corrected:
            continue
        r = readings[record["key"]]
        assert (record["name"], record["question"], record["source_url"], record["date"], record["ayes"], record["noes"], record["result"]) == \
            (r["name"], r["question"], r["source_url"], r["date"], r["ayes_count"], r["noes_count"], r["result"]), record["key"]
        assert sorted((m["name"], m["vote"]) for m in record["members"]) == sorted((v["person_name"], v["vote"]) for v in r["votes"])
        assert not V.text_faults(r), record["key"]
        checked += 1
    assert checked > 900
    held = {m["id"] for m in json.loads((STAGED / "mismatches.json").read_text(encoding="utf-8")) if m["id"]}
    new = {p.stem[len("division-"):] for p in PUBLIC.glob("division-vic-*.json")
           if json.loads(p.read_text(encoding="utf-8"))["_meta"].get("source") == D.STAGED_SOURCE}
    assert not (held & new), "a held division is published"


def test_a_published_record_is_corrected_only_from_the_same_division(tmp_path):
    good, _ = parse([line("Motions", "heading"), line("Health infrastructure", "heading"),
                     line("Debate resumed on motion of Ann Able:", "bold"), line("That this house notes the hospitals.", "quote"), *division()])
    reading = good[0]
    published = {"key": reading["id"], "slug": f"division-{reading['id']}", "name": "That the words be added.", "question": "That the words be added.",
                 "date": reading["date"], "house": "vic_lc", "jurisdiction": "vic", "ayes": 2, "noes": 1, "result": "affirmative",
                 "source_url": "https://www.parliament.vic.gov.au/x/hansard-1.pdf", "bills": [],
                 "members": [{"name": "Ann Able", "person_slug": "ann-able", "vote": "aye", "person_id": None},
                             {"name": "Bob 4198 Legislative Council Baker", "person_slug": "bob-4198-legislative-council-baker", "vote": "aye", "person_id": None},
                             {"name": "Cy Cole", "person_slug": "cy-cole", "vote": "no", "person_id": None}],
                 "_meta": {"schema": 1, "member_coverage": "recorded", "source": "fixture"}}
    fixed, changes = D.corrected_from_staged(published, reading, "2026-11-17")
    assert [c[0] for c in changes] == ["name", "question", "source_url", "members[name=Bob 4198 Legislative Council Baker].name"]
    assert (fixed["name"], fixed["question"]) == ("Health infrastructure", "That this house notes the hospitals.")
    assert [(m["name"], m["person_slug"], m["vote"]) for m in fixed["members"]] == [("Ann Able", "ann-able", "aye"), ("Bob Baker", "bob-baker", "aye"), ("Cy Cole", "cy-cole", "no")]
    assert [c["from"] for c in fixed["_meta"]["corrections"]][:2] == ["That the words be added."] * 2
    assert all(c["evidence_url"] == reading["source_url"] and c["reviewed"] == "2026-11-17" for c in fixed["_meta"]["corrections"])
    assert published["name"] == "That the words be added."                                   # the input is not changed
    for field, value in (("ayes", 3), ("result", "negative"), ("date", "2023-02-24")):
        with pytest.raises(ValueError):
            D.corrected_from_staged({**published, field: value}, reading, "2026-11-17")
    other = {**published, "members": [*published["members"][:2], {"name": "Di Dunn", "person_slug": "di-dunn", "vote": "no", "person_id": None}]}
    with pytest.raises(ValueError):
        D.corrected_from_staged(other, reading, "2026-11-17")


def staged(tmp_path, records):
    folder = tmp_path / "staged"
    folder.mkdir()
    (folder / "divisions.jsonl").write_text("".join(json.dumps(r) + "\n" for r in records), encoding="utf-8")
    return folder


def test_the_exporter_adds_staged_divisions_and_leaves_published_records_alone(tmp_path):
    good, _ = parse([*division(), *division(on="Council divided on amendment:", result="Amendment agreed to.")])
    out = tmp_path / "divisions"
    out.mkdir()
    published = {"key": good[0]["id"], "slug": f"division-{good[0]['id']}", "name": "As published", "question": None,
                 "date": "2023-02-23", "house": "vic_lc", "jurisdiction": "vic", "ayes": 2, "noes": 1,
                 "result": "affirmative", "source_url": "https://example.test/old", "members": [], "bills": [],
                 "_meta": {"schema": 1, "member_coverage": "unavailable", "source": "fixture", "refresh_retained": False,
                           "refresh_retained_reason": None, "member_count": 0, "named_member_count": 0,
                           "recorded_vote_count": 0}}
    shard = out / f"{published['slug']}.json"
    shard.write_text(json.dumps(published), encoding="utf-8")
    before = shard.read_bytes()
    previous = D.read_previous_projection(out)
    new = D.staged_projection(staged(tmp_path, good), previous)
    assert list(new) == [good[1]["id"]]
    records, added = D.write_added(new, previous, out)
    assert shard.read_bytes() == before
    record = json.loads((out / f"division-{good[1]['id']}.json").read_text(encoding="utf-8"))
    assert record["_meta"]["member_coverage"] == "recorded" and record["_meta"]["source"] == D.STAGED_SOURCE
    assert record["question"] == "Council divided on amendment" and record["source_url"].endswith("#page=7")
    assert [(m["name"], m["person_slug"], m["vote"]) for m in record["members"]] == [
        ("Ann Able", "ann-able", "aye"), ("Bob Baker", "bob-baker", "aye"), ("Cy Cole", "cy-cole", "no")]
    index = json.loads((out / "index.json").read_text(encoding="utf-8"))
    assert index["count"] == 2 and {r["key"] for r in index["divisions"]} == set(records)


def test_the_exporter_refuses_a_staged_division_whose_votes_do_not_equal_its_tally(tmp_path):
    good, _ = parse(division())
    good[0]["ayes_count"] = 5
    with pytest.raises(ValueError):
        D.staged_projection(staged(tmp_path, good), {})
