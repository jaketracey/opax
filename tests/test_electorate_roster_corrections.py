"""Reviewed roster corrections on the electorate bundle: applied once, by republish, from the repo alone."""
import copy
import json
from pathlib import Path

import pytest

from parli.electorates import export_bundle
from scripts.corrections import apply as corrections
from scripts.export_electorates import ROSTER_CORRECTIONS, correct_rosters, republish

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "portal/public/electorates"


def entry(**change):
    return {"id": "r1", "field": "members[person_id=p1].party", "from": "Independent", "to": "Test Party",
            "evidence_url": "https://register.example.org/parties", "evidence": "Test Party, registered 2 October 2026.",
            "finding": "fixture-001", "reviewed": "2026-11-16", **change}


def rosters():
    return {"rosters": [{"roster_id": "r1", "members": [{"person_id": "p1", "party": "Independent"}, {"person_id": "p2", "party": "Labor"}]},
                        {"roster_id": "r2", "members": [{"person_id": "p3", "party": "Greens"}]}]}


def test_a_correction_changes_one_members_party_on_one_roster():
    bundle = rosters()
    applied, absent = correct_rosters(bundle, [entry()])
    assert (len(applied), absent) == (1, [])
    assert bundle["rosters"][0]["members"] == [{"person_id": "p1", "party": "Test Party"}, {"person_id": "p2", "party": "Labor"}]
    assert bundle["rosters"][1] == rosters()["rosters"][1]


def test_a_correction_the_bundle_already_carries_is_done_so_the_next_republish_changes_nothing():
    bundle = rosters()
    correct_rosters(bundle, [entry()])
    after = copy.deepcopy(bundle)
    assert correct_rosters(bundle, [entry()]) == ([], [])
    assert bundle == after


def test_a_correction_for_a_roster_not_in_the_bundle_is_reported_and_never_fatal():
    bundle = rosters()
    gone = entry(id="r9")
    assert correct_rosters(bundle, [gone]) == ([], [gone])
    assert bundle == rosters()


def test_a_roster_that_moved_since_the_review_stops_the_export_and_changes_nothing():
    for change in ({"from": "Liberal"}, {"field": "members[person_id=p9].party"}):
        bundle = rosters()
        with pytest.raises(corrections.CorrectionError):
            correct_rosters(bundle, [entry(), entry(**{"id": "r2", "field": "members[person_id=p3].party", "from": "Greens", **change})])
        assert bundle == rosters()


def test_republish_publishes_a_corrected_release_once(tmp_path, monkeypatch):
    """The whole path on the published release's own bundle: one new release, then no change."""
    manifest = json.loads((PUBLIC / "manifest.json").read_text())
    bundle = json.loads((PUBLIC / "releases" / manifest["release_id"] / "reference.json").read_text())
    first = export_bundle(bundle, tmp_path, generated="2026-11-15")
    roster = next(r for r in bundle["rosters"] if len(r["members"]) == 1 and r["members"][0].get("party"))
    member = roster["members"][0]
    one = entry(id=roster["roster_id"], field=f"members[person_id={member['person_id']}].party", to="Test Party", **{"from": member["party"]})
    monkeypatch.setattr(corrections, "load", lambda dataset, directory=None: [one] if dataset == ROSTER_CORRECTIONS else [])
    dissolutions = bundle.get("dissolutions", [])
    second = republish(tmp_path, dissolutions, "2026-11-15")
    assert second and second["release_id"] != first["release_id"]
    release = tmp_path / "releases" / second["release_id"]
    seat = next(e for e in json.loads((release / "index.json").read_text())["electorates"] if e["electorate_id"] == roster["electorate_id"])
    assert [m["party"] for m in seat["representatives"]] == ["Test Party"]
    person = next(p for p in json.loads((release / "people.json").read_text())["people"] if p["person_id"] == member["person_id"])
    assert [s["party"] for s in person["electorates"] if s["current"]] == ["Test Party"]
    assert republish(tmp_path, dissolutions, "2026-11-15") is None


def test_the_committed_corrections_are_in_the_published_release():
    """Every committed roster correction names a roster the published bundle holds, and is already applied there."""
    manifest = json.loads((PUBLIC / "manifest.json").read_text())
    bundle = json.loads((PUBLIC / "releases" / manifest["release_id"] / "reference.json").read_text())
    entries = corrections.load(ROSTER_CORRECTIONS)
    assert entries, "the roster corrections file is committed"
    before = copy.deepcopy(bundle)
    assert correct_rosters(bundle, entries) == ([], [])
    assert bundle == before
    held = {r["roster_id"]: r for r in bundle["rosters"]}
    for e in entries:
        assert corrections._get(held[e["id"]], e["field"]) == e["to"], e["finding"]
