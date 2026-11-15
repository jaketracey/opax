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
    good, _ = parse([*division(), *division(ayes="Ayes (1): Ann Able", noes="Noes (2): Bob Baker, Cy Cole",
                                            result="Motion negatived."), *division()])
    for key, ayes, noes in ((good[0]["id"], 2, 1), (good[1]["id"], 2, 1)):   # the old import missed the second one
        (tmp_path / f"division-{key}.json").write_text(json.dumps({"key": key, "ayes": ayes, "noes": noes}))
    keep, held = V.hold_published_conflicts(good, tmp_path)
    assert [g["id"][-1] for g in keep] == ["1"]
    assert [(h["id"][-1], h["reasons"]) for h in held] == [("2", ["numbering-differs-from-published"]),
                                                           ("3", ["numbering-differs-from-published"])]
    assert held[0]["published"] == {"ayes": 2, "noes": 1} and held[1]["published"] is None


def test_the_coverage_note_names_the_members_whose_counts_lack_the_held_divisions():
    _, bad = parse([*division(noes="Noes (1): Zed Unknown"), *division(ayes="Ayes (2): Ann Able, Cy Cole", noes="Noes (1): Zed Unknown"),
                    *division(result="Question defeated.")])
    (note,) = V.vote_coverage(bad)["notes"]
    assert (note["house"], note["held"], note["from"], note["to"]) == ("vic_lc", 2, "2023-02-23", "2023-02-23")
    assert note["members"] == ["Ann Able", "Bob Baker", "Cy Cole"]      # never the unresolved name
    assert V.vote_coverage([b for b in bad if b["reasons"] != ["unresolved-name"]])["notes"] == []


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
