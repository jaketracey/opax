"""dissolved_for on the electorates index: written from reviewed records, cleared only by the post-result roster reload."""
import copy
import json
import re
from pathlib import Path

import pytest

from parli.electorates import TABLES, dissolved_for, export_bundle, validate
from scripts.export_electorates import (DISSOLUTIONS, OVERDUE_DAYS, expected_dissolved_for, load_dissolutions,
                                       overdue_dissolutions, republish)

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


# ---- the reviewed seated_on record: how a state house clears (the bundle has no state contests) ----

SEATED = dict(RECORD, seated_on="2026-12-15")


def seated(on, held, record=SEATED, contests=()):
    return dissolved_for(SEAT, [record], list(contests), held, on)


def test_seated_on_with_the_post_result_roster_clears_it_without_any_contest():
    # The reviewed day has come and the roster exported after it is complete: cleared, with no result in the bundle.
    assert seated("2026-12-16", roster("2026-12-15", person="new")) is None
    assert seated("2027-02-01", roster("2026-12-20", person="old")) is None  # a re-elected member


def test_seated_on_alone_or_a_refetch_before_it_keeps_the_field():
    # Recorded, but the roster in the bundle is still the pre-election one.
    assert seated("2026-12-16", roster("2026-09-09")) == DAY
    # A refetch between election day and the seating day is not the post-result reload.
    assert seated("2026-12-16", roster("2026-11-30")) == DAY
    assert seated("2026-12-16", roster("2026-12-14")) == DAY
    # An incomplete roster, or none at all, clears nothing.
    assert seated("2026-12-16", roster("2026-12-15", complete=False)) == DAY
    assert seated("2026-12-16", None) == DAY
    # Before the reviewed day itself, even with a later-dated roster in hand.
    assert seated("2026-12-14", roster("2026-12-15")) == DAY
    # No seated_on (as shipped today): a post-election roster alone never clears.
    assert seated("2027-03-01", roster("2026-12-20"), record=RECORD) == DAY
    assert seated("2027-03-01", roster("2026-12-20"), record=dict(RECORD, seated_on=None)) == DAY


def test_seated_on_is_validated_and_read_from_the_reviewed_file(bundle, tmp_path):
    # Election day itself is refused: a refetch that day still lists the old members.
    for bad, message in ((dict(SEATED, seated_on="2026-11-27"), "after election day"),
                         (dict(SEATED, seated_on=DAY), "after election day"),
                         (dict(SEATED, seated_on=20261215), "is a date")):
        with pytest.raises(ValueError, match=message):
            validate({**bundle, "dissolutions": [bad]})
    validate({**bundle, "dissolutions": [SEATED]})
    validate({**bundle, "dissolutions": [dict(SEATED, seated_on="2026-11-29")]})  # the day after is the earliest
    # The shipped record has it unset, so it is not carried and the published release is unchanged.
    assert all("seated_on" not in record for record in load_dissolutions(DISSOLUTIONS))
    reviewed = json.loads(DISSOLUTIONS.read_text())
    assert reviewed["dissolutions"][0]["seated_on"] is None
    # Set by hand, it is carried into the bundle.
    reviewed["dissolutions"][0]["seated_on"] = "2026-12-15"
    path = tmp_path / "electorate-dissolutions.json"
    path.write_text(json.dumps(reviewed))
    for name in {row["election"] for row in reviewed["dissolutions"]}:
        (tmp_path / name).write_text((DISSOLUTIONS.parent / name).read_text())
    assert [record["seated_on"] for record in load_dissolutions(path)] == ["2026-12-15"]


def test_the_published_victorian_bundle_can_clear():
    """The real release: no Victorian contests or terms, so the result path can never clear it.

    With the reviewed seated_on and the post-result roster exported, every Assembly district clears."""
    manifest = json.loads((ROOT / "portal/public/electorates/manifest.json").read_text())
    release = ROOT / "portal/public/electorates/releases" / manifest["release_id"]
    published = json.loads((release / "reference.json").read_text())
    districts = {e["electorate_id"] for e in published["electorates"] if e["chamber"] == "vic_la"}
    assert len(districts) == 88
    # Why the result path is closed for Victoria: the bundle holds no contest for any district.
    assert not [c for c in published.get("contests", []) if c["electorate_id"] in districts]
    record = dict(load_dissolutions(DISSOLUTIONS)[0], seated_on="2026-12-15")
    # The post-result reload: the hand export writes each district a complete roster dated after seated_on.
    reloaded = copy.deepcopy(published)
    for held in reloaded["rosters"]:
        if held["electorate_id"] in districts:
            held["as_of"] = "2026-12-16"
    reloaded["dissolutions"] = [record]
    cleared = expected_dissolved_for(reloaded, "2026-12-17")
    assert set(cleared) == districts and set(cleared.values()) == {None}
    # The record alone, with the published (pre-election) roster, clears nothing.
    waiting = expected_dissolved_for({**published, "dissolutions": [record]}, "2026-12-17")
    assert set(waiting.values()) == {DAY}


def test_republish_clears_on_the_night_the_seated_on_roster_is_in_the_bundle(bundle, tmp_path):
    export_bundle(bundle, tmp_path, generated="2026-11-15")
    assert rows(tmp_path)[2]["seat"]["dissolved_for"] == DAY
    # seated_on recorded, the roster not yet reloaded: the records changed, so one new release, still dissolved.
    assert republish(tmp_path, [SEATED], "2026-12-16")
    assert rows(tmp_path)[2]["seat"]["dissolved_for"] == DAY
    assert republish(tmp_path, [SEATED], "2026-12-17") is None
    # The hand export of the post-result roster: cleared, and it stays cleared.
    reloaded = json.loads((rows(tmp_path)[1] / "reference.json").read_text())
    reloaded["rosters"] = [roster("2026-12-18", person="new")]
    export_bundle(reloaded, tmp_path, generated="2026-12-18")
    assert rows(tmp_path)[2]["seat"]["dissolved_for"] is None
    assert republish(tmp_path, [SEATED], "2026-12-19") is None


# ---- the nightly's reminder: still dissolved four weeks after election day ----

def test_overdue_is_silent_until_four_weeks_after_election_day_then_names_the_house(bundle, tmp_path):
    export_bundle(bundle, tmp_path, generated="2026-11-15")
    for night in ("2026-11-15", DAY, "2026-12-26"):  # up to and including day 28
        assert overdue_dissolutions(tmp_path, night) == []
    late = overdue_dissolutions(tmp_path, "2026-12-27")
    assert len(late) == 1
    assert "1 seats of vic_la" in late[0] and "29 days after the 2026-11-28 election" in late[0]
    assert "seated_on" in late[0] and "electorate-dissolutions.json" in late[0]
    assert OVERDUE_DAYS == 28


def test_overdue_stops_once_the_field_clears_and_never_speaks_for_other_houses(bundle, tmp_path):
    reloaded = copy.deepcopy(bundle)
    reloaded["dissolutions"] = [SEATED]
    reloaded["rosters"] = [roster("2026-12-18", person="new")]
    export_bundle(reloaded, tmp_path, generated="2026-12-18")
    assert rows(tmp_path)[2]["seat"]["dissolved_for"] is None
    assert overdue_dissolutions(tmp_path, "2027-06-01") == []
    # A release with no dissolution records at all.
    plain = copy.deepcopy(bundle); plain.pop("dissolutions")
    other = tmp_path / "plain"
    export_bundle(plain, other, generated="2026-10-01")
    assert overdue_dissolutions(other, "2027-06-01") == []


def test_overdue_on_the_published_release_and_from_the_command_line(capsys, monkeypatch):
    out = ROOT / "portal/public/electorates"
    assert overdue_dissolutions(out, "2026-12-26") == []
    late = overdue_dissolutions(out, "2027-01-10")
    assert len(late) == 1 and late[0].startswith("88 seats of vic_la are still published as dissolved 43 days")
    # The nightly reads the lines from --overdue: one a line, and nothing (exit 0) when none is late.
    from scripts import export_electorates
    for night, count in (("2026-12-01", 0), ("2027-01-10", 1)):
        monkeypatch.setattr("sys.argv", ["export_electorates.py", "--overdue", "--as-of", night, "--out-dir", str(out)])
        export_electorates.main()
        assert len(capsys.readouterr().out.splitlines()) == count


def test_the_nightly_turns_each_overdue_line_into_a_warning_never_a_failure():
    script = (ROOT / "scripts/vm/nightly.sh").read_text()
    step = script[script.index("# ---- 3e. electorate release"):script.index("# ---- 3z.")]
    assert "--overdue" in step and 'warn "$overdue"' in step
    # After the republish, inside the same guard, and no fail on its account.
    assert step.index("--republish") < step.index("--overdue")
    assert step.count("fail ") == 1
    # A reminder that cannot run is itself a warning: its exit status is read, never swallowed.
    reminder = step[step.index("if overdue_lines="):]
    assert "|| true" not in reminder
    assert 'warn "the dissolved-house reminder could not run' in reminder


def test_a_reminder_that_crashes_warns_and_the_night_goes_on(tmp_path):
    """The step itself, run in bash with a stand-in exporter: lines become warnings, a crash becomes one too."""
    import subprocess
    script = (ROOT / "scripts/vm/nightly.sh").read_text()
    step = script[script.index("  if overdue_lines="):script.index("# ---- 3z.")]
    step = step[:step.rindex("\nfi")]  # the reminder alone, without the guard's closing fi
    def night(body):
        fake = tmp_path / "py"
        fake.write_text("#!/bin/bash\n" + body + "\n")
        fake.chmod(0o755)
        program = ('WARNINGS=(); FAILURES=(); warn() { WARNINGS+=("$*"); }; fail() { FAILURES+=("$*"); }\n'
                   f'PY={fake}; LOGFILE={tmp_path / "log"}; OPAX_TODAY=2027-01-10\n' + step +
                   '\nprintf "%s\\n" "warnings=${#WARNINGS[@]} failures=${#FAILURES[@]}" "${WARNINGS[@]}"\n')
        done = subprocess.run(["bash", "-c", program], capture_output=True, text=True, check=True)
        return done.stdout.splitlines()
    assert night("exit 0") == ["warnings=0 failures=0"]
    assert night("echo '88 seats of vic_la are still published as dissolved'") == [
        "warnings=1 failures=0", "88 seats of vic_la are still published as dissolved"]
    crashed = night("echo 'Traceback' >&2; exit 1")
    assert crashed[0] == "warnings=1 failures=0" and "reminder could not run" in crashed[1]
    assert "Traceback" in (tmp_path / "log").read_text()


def test_overdue_reads_a_release_that_has_no_bundle_or_id_of_its_own(tmp_path):
    """The nightly test's bare release: a manifest with only its index pointer. Nothing to report, and no crash."""
    out = tmp_path / "electorates"
    (out / "releases/fixture").mkdir(parents=True)
    (out / "manifest.json").write_text(json.dumps({"index_url": "/electorates/releases/fixture/index.json"}))
    (out / "releases/fixture/index.json").write_text(json.dumps({"electorates": []}))
    assert overdue_dissolutions(out, "2027-06-01") == []
    assert republish(out, [RECORD], "2027-06-01") is None


def test_the_nightly_tests_seed_carries_everything_the_republish_step_runs():
    """test_nightly.sh builds its repository from an allowlist; the step's script and inputs must be on it."""
    seed = (ROOT / "scripts/vm/test_nightly.sh").read_text()
    for needed in ("scripts/export_electorates.py", "parli/electorates.py",
                   "scripts/hubs/electorate-dissolutions.json", "scripts/hubs/vic-election-2026.json"):
        assert needed in seed, needed
    # Every election file a reviewed record names is on it too.
    for row in json.loads(DISSOLUTIONS.read_text())["dissolutions"]:
        assert f"scripts/hubs/{row['election']}" in seed
