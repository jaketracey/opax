"""A seat vacant when its house's term ended: a reviewed record becomes a memberless roster observation and the
last member's closed service record, and nothing else in the release changes."""
import copy
import json
import re
from functools import partial
from pathlib import Path

import pytest

from parli.electorates import TABLES, apply_vacancies, export_bundle
from scripts.export_electorates import DISSOLUTIONS, VACANCIES, load_dissolutions, load_vacancies, republish

ROOT = Path(__file__).resolve().parents[1]
canonical = partial(json.dumps, sort_keys=True)
PUBLIC = ROOT / "portal/public/electorates"
DISSOLUTION = {"jurisdiction": "vic", "chamber": "vic_la", "dissolved_on": "2026-11-03", "election_day": "2026-11-28",
               "source_url": "https://example.org/caretaker"}
SEAT = {"electorate_id": "seat", "slug": "vic-test", "name": "Test", "jurisdiction": "vic", "chamber": "vic_la",
        "capacity": 1, "status": "current"}
SOURCE = {"label": "Member page", "url": "https://example.org/member", "fetched_at": "2026-11-16", "sha256": "a" * 64,
          "licence": "See source terms", "evidence": "Former Member. Test (1 January 2019 - 19 September 2026)."}
RECORD = {"jurisdiction": "vic", "chamber": "vic_la", "electorate": "Test", "as_of": "2026-11-03", "at": "expiry",
          "last_member": {"person_id": "old", "name": "Old Member", "party": "Greens", "source_party_label": "The Greens",
                          "start": "2019-01-01", "end": "2026-09-19"},
          "sources": [SOURCE], "reviewed": "2026-11-16"}


@pytest.fixture
def bundle():
    b = {"schema_version": 1, **{name: [] for name in TABLES}}
    b["sources"] = [{"source_id": "s", "url": "https://example.org/roster", "label": "Roster"}]
    b["electorates"] = [SEAT, dict(SEAT, electorate_id="other", slug="vic-other", name="Other")]
    b["people"] = [{"person_id": "old", "name": "Old Member"}, {"person_id": "sitting", "name": "Sitting Member"}]
    b["rosters"] = [{"roster_id": f"r-{eid}", "electorate_id": eid, "as_of": "2026-09-09", "capacity": 1, "complete": True,
                     "members": [{"person_id": pid, "party": "Greens"}], "sources": ["s"]}
                    for eid, pid in (("seat", "old"), ("other", "sitting"))]
    b["dissolutions"] = [DISSOLUTION]
    b["coverage"] = {"jurisdictions": {"vic": {"roster_dates": ["2026-09-09"], "roster_members": 2, "terms": 0, "electorates": 2}}}
    return b


def published(directory):
    manifest = json.loads((directory / "manifest.json").read_text())
    release = directory / "releases" / manifest["release_id"]
    read = lambda name: json.loads((release / name).read_text())  # noqa: E731
    return manifest, release, {r["electorate_id"]: r for r in read("index.json")["electorates"]}, read


def test_a_vacancy_leaves_the_seat_with_no_representative_and_the_last_member_with_a_closed_record(bundle, tmp_path):
    export_bundle(apply_vacancies(bundle, [RECORD]), tmp_path, generated="2026-11-16")
    _, _, index, read = published(tmp_path)
    seat = index["seat"]
    assert seat["representatives"] == [] and seat["representation_status"] == "verified"
    assert seat["representation_as_of"] == "2026-11-03" and seat["dissolved_for"] == "2026-11-28" and seat["history_count"] == 1
    detail = read("seat.json")
    vacant = [r for r in detail["rosters"] if not r["members"]]
    assert len(vacant) == 1 and vacant[0]["vacant_at"] == "expiry" and vacant[0]["complete"] is True
    [term] = detail["terms"]
    assert (term["person_id"], term["start"], term["end"], term["end_precision"]) == ("old", "2019-01-01", "2026-09-19", "day")
    assert term["observed_through"] == "2026-11-16" and term["party_periods"] == [{"party": "Greens", "start": "2019-01-01", "end": "2026-09-19"}]
    # No cause of the vacancy is recorded anywhere in the release.
    assert "end_reason" not in term and not re.search(r"died|death|deceased", json.dumps(read("reference.json")), re.I)
    # The person is no longer current anywhere; the dated period is theirs.
    [person] = [p for p in read("people.json")["people"] if p["person_id"] == "old"]
    assert [(e["current"], e["party"], e["periods"]) for e in person["electorates"]] == [(False, None, [{"start": "2019-01-01", "end": "2026-09-19"}])]
    # The other seat is exactly as an export without the record writes it.
    export_bundle(bundle, tmp_path / "plain", generated="2026-11-16")
    assert {k: v for k, v in index["other"].items() if k != "detail_url"} == \
        {k: v for k, v in published(tmp_path / "plain")[2]["other"].items() if k != "detail_url"}
    assert read("reference.json")["coverage"]["jurisdictions"]["vic"] == {
        "roster_dates": ["2026-09-09", "2026-11-03"], "roster_members": 1, "terms": 1, "electorates": 2}


def test_applying_a_record_twice_changes_nothing_and_republish_publishes_it_once(bundle, tmp_path):
    once = apply_vacancies(bundle, [RECORD])
    twice = apply_vacancies(once, [RECORD])
    assert {n: sorted(map(canonical, twice[n])) for n in TABLES} == {n: sorted(map(canonical, once[n])) for n in TABLES}
    assert bundle["rosters"] == [r for r in bundle["rosters"] if r["members"]]  # the input is not edited
    first = export_bundle(bundle, tmp_path, generated="2026-11-15")
    assert republish(tmp_path, [DISSOLUTION], "2026-11-16") is None
    second = republish(tmp_path, [DISSOLUTION], "2026-11-16", None, [RECORD])
    assert second and second["release_id"] != first["release_id"]
    assert published(tmp_path)[2]["seat"]["representatives"] == []
    assert republish(tmp_path, [DISSOLUTION], "2026-11-17", None, [RECORD]) is None


def test_a_record_is_refused_unless_it_still_matches_the_bundle(bundle):
    def refused(change=None, edit=None):
        record, b = copy.deepcopy(RECORD), copy.deepcopy(bundle)
        if change:
            change(record)
        if edit:
            edit(b)
        with pytest.raises(ValueError, match="Vacancy"):
            apply_vacancies(b, [record])

    refused(lambda r: r.update(electorate="Nowhere"))
    refused(lambda r: r.update(as_of="2026-11-04"))                      # not the day the term ended
    refused(lambda r: r.update(at="resigned"))
    refused(lambda r: r.update(cause="x"))                               # no field beyond the reviewed ones
    refused(lambda r: r["last_member"].update(name="Someone Else"))
    refused(lambda r: r["last_member"].update(end="2026-11-10"))         # served past the day the seat was vacant
    refused(lambda r: r["last_member"].update(end="2026-09-01"))         # the roster of 9 September still lists them
    refused(lambda r: r["last_member"].update(end_reason="x"))
    refused(lambda r: r.update(sources=[]))
    refused(lambda r: r["sources"][0].update(url="http://example.org"))
    refused(lambda r: r["sources"][0].update(fetched_at="2026-10-01"))   # read before the seat was vacant
    refused(edit=lambda b: b["rosters"][0]["members"].__setitem__(0, {"person_id": "sitting", "party": "Greens"}))
    refused(edit=lambda b: b.pop("dissolutions"))


def test_a_later_roster_supersedes_the_record(bundle):
    later = copy.deepcopy(bundle)
    later["rosters"].append({"roster_id": "r-new", "electorate_id": "seat", "as_of": "2026-12-20", "capacity": 1, "complete": True,
                             "members": [{"person_id": "sitting", "party": "Labor"}], "sources": ["s"]})
    out = apply_vacancies(later, [RECORD])
    assert out["rosters"] == later["rosters"] and out["terms"] == []


def test_the_published_release_carries_the_reviewed_records_and_changes_no_other_seat():
    manifest, release, index, read = published(PUBLIC)
    records = load_vacancies(VACANCIES)
    bundle = read("reference.json")
    # The release is exactly what tonight's republish would write from the committed records.
    current = apply_vacancies({**bundle, "dissolutions": load_dissolutions(DISSOLUTIONS)}, records)
    assert {n: sorted(map(canonical, current.get(n, []))) for n in TABLES} == {n: sorted(map(canonical, bundle.get(n, []))) for n in TABLES}
    vacant = {(r["jurisdiction"], r["chamber"], r["electorate"]) for r in records}
    assert vacant == {("vic", "vic_la", "Brunswick")}
    assembly = [r for r in index.values() if r["chamber"] == "vic_la"]
    council = [r for r in index.values() if r["chamber"] == "vic_lc"]
    assert len(assembly) == 88 and len(council) == 8
    # Every Victorian seat but the vacant one has its full roster; the vacant one has nobody.
    for row in assembly + council:
        key = (row["jurisdiction"], row["chamber"], row["name"])
        assert row["representation_status"] == "verified"
        assert len(row["representatives"]) == (0 if key in vacant else row["capacity"]), row["name"]
    assert sum(len(r["representatives"]) for r in assembly) == 87 and sum(len(r["representatives"]) for r in council) == 40
    # Against the release before the record: every row of every parliament is unchanged except the vacant seat's.
    before = PUBLIC / "releases" / "db4a3cd54d53c143"
    old = {r["electorate_id"]: r for r in json.loads((before / "index.json").read_text().replace("db4a3cd54d53c143", manifest["release_id"]))["electorates"]}
    changed = [index[eid]["name"] for eid in index if index[eid] != old.get(eid)]
    assert set(old) == set(index) and changed == ["Brunswick"]
    row = next(r for r in assembly if r["name"] == "Brunswick")
    assert {k: v for k, v in row.items() if v != old[row["electorate_id"]][k]} == {
        "representatives": [], "representation_as_of": "2026-11-03", "history_count": 1}
    # No person is current in the seat; the last member's dated record is the one the parliament's page gives.
    people = read("people.json")["people"]
    holders = [(p["name"], e["current"], e["periods"]) for p in people for e in p["electorates"] if e["electorate_id"] == row["electorate_id"]]
    assert holders == [("Tim Read", False, [{"start": "2018-11-24", "end": "2026-09-19"}])]
    old_people = {p["person_id"]: p for p in json.loads((before / "people.json").read_text().replace("db4a3cd54d53c143", manifest["release_id"]))["people"]}
    assert [p["name"] for p in people if p != old_people.get(p["person_id"])] == ["Tim Read"]
    # Plain facts only: no cause and no tribute wording in the record or the release rows it writes.
    text = VACANCIES.read_text() + json.dumps(read(row["electorate_id"] + ".json")["terms"])
    assert not re.search(r"died|death|deceased|the late|passed away|tribute|end_reason", text, re.I)
