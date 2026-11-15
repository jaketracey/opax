"""dissolved_for on the electorates index: written from reviewed records, cleared only by the post-result roster reload."""
import copy
import json
import re
from pathlib import Path

import pytest

from parli.electorates import TABLES, dissolved_for, export_bundle, validate
from scripts.export_electorates import DISSOLUTIONS, expected_dissolved_for, load_dissolutions, republish

ROOT = Path(__file__).resolve().parents[1]
DAY = "2026-11-28"
RECORD = {"jurisdiction": "vic", "chamber": "vic_la", "dissolved_on": "2026-11-03", "election_day": DAY,
          "source_url": "https://example.org/caretaker"}
SEAT = {"electorate_id": "seat", "slug": "vic-test", "name": "Test", "jurisdiction": "vic", "chamber": "vic_la", "capacity": 1}


def roster(as_of, person="old", complete=True):
    return {"roster_id": f"r-{as_of}", "electorate_id": "seat", "as_of": as_of, "capacity": 1, "complete": complete,
            "members": [{"person_id": person, "party": "Labor"}], "sources": ["s"]}


def contest(person="new", poll_date=DAY, elected=True):
    return {"contest_id": f"c-{poll_date}", "electorate_id": "seat", "election_id": f"e-{poll_date}",
            "election": {"election_id": f"e-{poll_date}", "poll_date": poll_date},
            "candidates": [{"candidate_id": "x", "name": "A Candidate", "elected": elected, "person_id": person, "votes": []}]}


def state(contests, on, held):
    return dissolved_for(SEAT, [RECORD], contests, held, on)


def test_written_from_the_day_the_house_is_dissolved_and_not_before():
    assert state([], "2026-11-02", roster("2026-09-09")) is None
    assert state([], "2026-11-03", roster("2026-09-09")) == DAY
    assert state([], "2026-11-27", roster("2026-09-09")) == DAY


def test_a_roster_refetch_after_election_day_with_no_declared_result_keeps_the_field():
    # The parliament's member list refetched on 30 November still names the last members.
    assert state([], "2026-12-01", roster("2026-11-30")) == DAY
    # A contest row with nobody elected yet (the count is running) is not a result either.
    assert state([contest(elected=False)], "2026-12-01", roster("2026-11-30")) == DAY
    # Nor is an earlier election's result.
    assert state([contest(person="old", poll_date="2022-11-26")], "2026-12-01", roster("2026-11-30")) == DAY


def test_a_declared_result_alone_does_not_clear_it_while_the_roster_is_the_old_one():
    # The result is imported, the roster predates the election: the old member must not be drawn as sitting.
    assert state([contest()], "2026-12-10", roster("2026-09-09")) == DAY
    # Refetched after the election but still listing the old member, or incomplete: not the reload.
    assert state([contest()], "2026-12-10", roster("2026-12-05", person="old")) == DAY
    assert state([contest()], "2026-12-10", roster("2026-12-05", person="new", complete=False)) == DAY
    assert state([contest()], "2026-12-10", None) == DAY


def test_the_post_result_roster_reload_clears_it():
    # The declared result for this election, and a complete roster dated after it that seats the winner.
    assert state([contest()], "2026-12-10", roster("2026-12-05", person="new")) is None
    # A re-elected member: same person, still only cleared by the reloaded roster.
    assert state([contest(person="old")], "2026-12-10", roster("2026-09-09")) == DAY
    assert state([contest(person="old")], "2026-12-10", roster("2026-12-05")) is None


def test_other_houses_are_not_spoken_for():
    council = dict(SEAT, chamber="vic_lc")
    assert dissolved_for(council, [RECORD], [], roster("2026-09-09"), "2026-11-15") is None
    assert dissolved_for(dict(SEAT, jurisdiction="nsw", chamber="nsw_la"), [RECORD], [], None, "2026-11-15") is None


@pytest.fixture
def bundle():
    b = {"schema_version": 1, **{name: [] for name in TABLES}}
    b["sources"] = [{"source_id": "s", "url": "https://example.org/roster", "label": "Roster"}]
    b["electorates"] = [SEAT, dict(SEAT, electorate_id="council", slug="vic-council", name="Region", chamber="vic_lc", capacity=5),
                        dict(SEAT, electorate_id="nsw", slug="nsw-test", name="Other", jurisdiction="nsw", chamber="nsw_la")]
    b["people"] = [{"person_id": "old", "name": "Old Member"}, {"person_id": "new", "name": "New Member"}]
    b["rosters"] = [roster("2026-09-09")]
    b["dissolutions"] = [RECORD]
    return b


def rows(directory):
    manifest = json.loads((directory / "manifest.json").read_text())
    release = directory / "releases" / manifest["release_id"]
    index = {r["electorate_id"]: r for r in json.loads((release / "index.json").read_text())["electorates"]}
    return manifest, release, index


def test_export_writes_the_key_on_every_seat_of_the_house_and_on_no_other_row(bundle, tmp_path):
    export_bundle(bundle, tmp_path, generated="2026-11-15")
    _, release, index = rows(tmp_path)
    assert index["seat"]["dissolved_for"] == DAY
    assert "dissolved_for" not in index["council"] and "dissolved_for" not in index["nsw"]
    assert json.loads((release / "seat.json").read_text())["dissolved_for"] == DAY
    assert json.loads((release / "reference.json").read_text())["dissolutions"] == [RECORD]
    # Not dissolved: an explicit null, so a reader can tell "not dissolved" from "a release before the field".
    before = tmp_path / "before"
    export_bundle(bundle, before, generated="2026-11-02")
    assert rows(before)[2]["seat"]["dissolved_for"] is None
    assert '"dissolved_for":null' in (rows(before)[1] / "index.json").read_text()
    # A bundle with no dissolution records writes no key at all.
    plain = copy.deepcopy(bundle); plain.pop("dissolutions")
    export_bundle(plain, tmp_path / "plain", generated="2026-11-15")
    assert "dissolved_for" not in rows(tmp_path / "plain")[2]["seat"]


def test_dissolution_records_are_validated(bundle):
    validate(bundle)
    for change in ({"election_day": "2026-11-01"}, {"dissolved_on": "3 November"}, {"chamber": "vic_xx"}, {"source_url": "caretaker"}):
        broken = copy.deepcopy(bundle); broken["dissolutions"][0].update(change)
        with pytest.raises(ValueError):
            validate(broken)


def test_republish_is_a_no_op_until_the_state_changes_then_carries_the_release_id_forward(bundle, tmp_path):
    plain = copy.deepcopy(bundle); plain.pop("dissolutions")
    first = export_bundle(plain, tmp_path, generated="2026-10-01")
    gold = tmp_path / "gold.json"
    gold.write_text(json.dumps({"query": {"release_id": first["release_id"]}}, indent=1))
    files = lambda: sorted(str(p.relative_to(tmp_path)) for p in tmp_path.rglob("*") if p.is_file())
    # No records: nothing to say, nothing written.
    before = files()
    assert republish(tmp_path, [], "2026-11-15", gold) is None and files() == before
    # The record lands before the house is dissolved: the key appears as null (one new release).
    second = republish(tmp_path, [RECORD], "2026-11-01", gold)
    assert second and rows(tmp_path)[2]["seat"]["dissolved_for"] is None
    assert republish(tmp_path, [RECORD], "2026-11-02", gold) is None
    # The day it is dissolved: a new release with the election day, the old releases untouched.
    third = republish(tmp_path, [RECORD], "2026-11-03", gold)
    assert third["release_id"] not in (first["release_id"], second["release_id"])
    assert rows(tmp_path)[2]["seat"]["dissolved_for"] == DAY
    assert (tmp_path / "releases" / first["release_id"] / "index.json").is_file()
    assert json.loads(gold.read_text())["query"]["release_id"] == third["release_id"]
    # Every later night until the reload: unchanged.
    for night in ("2026-11-04", "2026-11-28", "2026-12-20"):
        assert republish(tmp_path, [RECORD], night, gold) is None
    # The post-result reload arrives as a new bundle export (the hand ingest); the field is null from then on.
    reloaded = json.loads((rows(tmp_path)[1] / "reference.json").read_text())
    reloaded["elections"] = [{"election_id": f"e-{DAY}", "poll_date": DAY}]
    reloaded["contests"] = [{k: v for k, v in contest().items() if k != "election"} | {"status": "final", "vacancies": 1}]
    reloaded["rosters"] = [roster("2026-12-05", person="new")]
    export_bundle(reloaded, tmp_path, generated="2026-12-06")
    assert rows(tmp_path)[2]["seat"]["dissolved_for"] is None
    assert republish(tmp_path, [RECORD], "2026-12-07", gold) is None
    # A release with no bundle of its own (a fixture) is left alone.
    bare = tmp_path / "bare"; bare.mkdir()
    (bare / "manifest.json").write_text(json.dumps({"index_url": "/x"}))
    assert republish(bare, [RECORD], "2026-11-15") is None


def test_the_reviewed_record_takes_its_election_day_from_the_election_file_and_matches_the_hub():
    records = load_dissolutions(DISSOLUTIONS)
    election = json.loads((ROOT / "scripts/hubs/vic-election-2026.json").read_text())
    assert records == [{"jurisdiction": "vic", "chamber": "vic_la", "dissolved_on": "2026-11-03",
                        "election_day": election["election_day"], "source_url": election["sources"]["caretaker"]}]
    # The hub's own caretaker date (the instant the Assembly is dissolved) is the same day.
    hub = (ROOT / "portal/src/vic-election.ts").read_text()
    caretaker = re.search(r"id:'caretaker'[^}]*passes_at:'(\d{4}-\d{2}-\d{2})T", hub).group(1)
    assert records[0]["dissolved_on"] == caretaker
    # No date is typed in the exporter or the rule.
    for path in ("parli/electorates.py", "scripts/export_electorates.py"):
        assert not re.search(r"2026-1[12]-\d\d", (ROOT / path).read_text()), path


def test_the_published_release_marks_every_assembly_district_and_nothing_else():
    public = ROOT / "portal/public/electorates"
    manifest, release, index = rows(public)
    bundle = json.loads((release / "reference.json").read_text())
    assert bundle["dissolutions"] == load_dissolutions(DISSOLUTIONS)
    marked = {eid: r["dissolved_for"] for eid, r in index.items() if "dissolved_for" in r}
    assert marked == expected_dissolved_for(bundle, manifest["generated"])
    assert {index[eid]["chamber"] for eid in marked} == {"vic_la"} and len(marked) == 88
    # Whatever the state, it is what tonight's republish would write: nothing is owed.
    assert set(marked.values()) <= {bundle["dissolutions"][0]["election_day"], None}


def test_the_data_check_refuses_a_row_that_differs_from_its_bundle(bundle, tmp_path):
    import importlib.util
    spec = importlib.util.spec_from_file_location("validate_data_dissolution", ROOT / "scripts/vm/validate_data.py")
    vd = importlib.util.module_from_spec(spec); spec.loader.exec_module(vd)
    export_bundle(bundle, tmp_path, generated="2026-11-15")
    manifest, release, _ = rows(tmp_path)
    reference = json.loads((release / "reference.json").read_text())
    assert vd._dissolved_for_errors(release, manifest, reference) == []
    index = json.loads((release / "index.json").read_text())

    def tampered(change):
        doc = copy.deepcopy(index)
        for row in doc["electorates"]:
            change(row)
        (release / "index.json").write_text(json.dumps(doc))
        return vd._dissolved_for_errors(release, manifest, reference)

    # Cleared by hand, dropped, or set on a house no record names: each is refused.
    assert any("Test (vic_la)" in e for e in tampered(lambda r: r.update(dissolved_for=None) if r["electorate_id"] == "seat" else None))
    assert any("'absent'" in e for e in tampered(lambda r: r.pop("dissolved_for", None)))
    assert any("Region (vic_lc)" in e for e in tampered(lambda r: r.update(dissolved_for=DAY)))
    (release / "index.json").write_text(json.dumps(index))
    detail = json.loads((release / "seat.json").read_text()); detail.pop("dissolved_for")
    (release / "seat.json").write_text(json.dumps(detail))
    assert any("seat.json" in e for e in vd._dissolved_for_errors(release, manifest, reference))
