"""Reference-data contracts: identity, evidence dates, isolation and publication."""
import copy
import hashlib
import json
import sqlite3

import pytest

from parli.electorates import TABLES, Registry, export_bundle, import_bundle, read_bundle, stable_id, validate


@pytest.fixture
def bundle():
    b = {"schema_version": 1, "coverage": {"notes": ["Fixture coverage"]}, **{name: [] for name in TABLES}}
    b["sources"] = [{"source_id": "s", "url": "https://example.org/roster", "label": "Roster"}]
    b["electorates"] = [{"electorate_id": "seat", "slug": "vic-test", "name": "Test", "jurisdiction": "vic", "chamber": "vic_lc", "capacity": 5}]
    b["people"] = [{"person_id": "p", "name": "A Member"}, {"person_id": "q", "name": "B Member"}]
    b["boundaries"] = [{"boundary_version_id": "b1", "electorate_id": "seat", "geometry_kind": "official", "capacity": 5, "effective_from": "2020-01-01", "effective_to": "2024-01-01"},
                       {"boundary_version_id": "b2", "electorate_id": "seat", "geometry_kind": "official", "capacity": 5, "effective_from": "2024-01-01", "effective_to": None}]
    b["keys"] = [{"key_id": f"k{i}", "electorate_id": "seat", "source": "abs_sed", "source_key": "201", "vintage": str(year), "boundary_version_id": f"b{i}"} for i, year in [(1, 2021), (2, 2025)]]
    b["terms"] = [{"representation_id": "t1", "electorate_id": "seat", "person_id": "p", "start": "2020-01-01", "end": "2024-01-01", "start_precision": "day", "end_precision": "day", "party_periods": [{"party": "Labor", "start": "2020-01-01", "end": "2022-01-01"}, {"party": "Independent", "start": "2022-01-01", "end": "2024-01-01"}]}]
    b["rosters"] = [{"roster_id": "r", "electorate_id": "seat", "as_of": "2026-09-04", "capacity": 5, "complete": True, "members": [{"person_id": "p", "party": "Independent"}, {"person_id": "q", "party": "Greens"}], "sources": ["s"]}]
    b["elections"] = [{"election_id": "general", "poll_date": "2022-01-01"}, {"election_id": "by", "poll_date": "2022-07-01"}]
    b["contests"] = [{"contest_id": eid, "electorate_id": "seat", "election_id": eid, "status": "final", "vacancies": 1, "candidates": [{"candidate_id": f"c-{eid}", "name": "A Candidate", "elected": True, "person_id": None, "votes": [{"kind": "primary", "votes": 10, "denominator": 12}]}]} for eid in ["general", "by"]]
    return b


def test_crosswalk_namespaces_vintages_and_boundary_cutover(bundle):
    r = Registry(bundle)
    assert r.resolve(source="abs_sed", source_id="201")["status"] == "ambiguous"
    assert r.resolve(source="abs_sed", source_id="201", vintage="2025")["matches"][0]["boundary_version_id"] == "b2"
    assert r.resolve(source="aec_division", source_id="201")["status"] == "unmatched"
    assert r.boundary_at("seat", "2023-12-31")["matches"][0]["boundary_version_id"] == "b1"
    assert r.boundary_at("seat", "2024-01-01")["matches"][0]["boundary_version_id"] == "b2"


def test_asof_party_change_and_roster_does_not_prove_other_dates(bundle):
    r = Registry(bundle)
    assert r.representatives_at("seat", "2021-12-31")["members"][0]["party"] == "Labor"
    assert r.representatives_at("seat", "2022-01-01")["members"][0]["party"] == "Independent"
    assert r.representatives_at("seat", "2024-01-01")["status"] == "unknown"
    assert len(r.representatives_at("seat", "2026-09-04")["members"]) == 2
    assert r.representatives_at("seat", "2026-09-05")["status"] == "unknown"
    term = bundle["terms"][0]
    term.update(end=None, end_precision="open", observed_through="2026-09-01")
    assert Registry(bundle).representatives_at("seat", "2026-09-01")["status"] == "historical"
    assert Registry(bundle).representatives_at("seat", "2026-09-02")["status"] == "unknown"


def test_general_and_by_election_same_year_are_distinct_and_strictly_prior(bundle):
    r = Registry(bundle)
    assert r.latest_prior_contest("seat", "2022-07-01")["matches"][0]["contest_id"] == "general"
    assert r.latest_prior_contest("seat", "2022-07-02")["matches"][0]["contest_id"] == "by"
    assert r.latest_prior_contest("seat", "2022-01-01")["status"] == "unmatched"


def test_import_is_additive_idempotent_and_rolls_back_whole_failed_batch(bundle):
    db = sqlite3.connect(":memory:")
    db.execute("CREATE TABLE members (person_id TEXT)")
    db.execute("INSERT INTO members VALUES ('untouched')")
    db.commit()
    first = import_bundle(db, bundle, imported_at="2026-09-09", source="fixture")
    assert first == import_bundle(db, bundle, imported_at="2026-09-09", source="fixture")
    before = read_bundle(db)
    assert before["coverage"] == bundle["coverage"]
    broken = copy.deepcopy(bundle)
    broken["electorates"][0]["name"] = "Must roll back"
    broken["rosters"][0]["members"][1]["person_id"] = "missing"
    with pytest.raises(ValueError):
        import_bundle(db, broken, imported_at="2026-09-09", source="bad")
    assert read_bundle(db) == before
    assert db.execute("SELECT * FROM members").fetchall() == [("untouched",)]
    assert db.execute("SELECT count(*) FROM ext_electorate_imports").fetchone()[0] == 1


@pytest.mark.parametrize("mutation", [
    lambda b: b["rosters"][0].update(capacity=1),
    lambda b: b["terms"][0].update(end="2019-01-01"),
    lambda b: b["terms"][0].update(start="2023-02-30"),
    lambda b: b["contests"][0]["candidates"][0]["votes"][0].update(votes=13),
    lambda b: b["contests"][0]["candidates"][0]["votes"][0].update(sources=["missing"]),
    lambda b: b["keys"][0].update(boundary_version_id="missing"),
])
def test_invalid_evidence_rejected(bundle, mutation):
    mutation(bundle)
    with pytest.raises(ValueError):
        validate(bundle)


def test_manifest_hashes_and_immutable_release_survive_refresh(bundle, tmp_path):
    old = export_bundle(bundle, tmp_path, generated="2026-09-09")
    path = tmp_path / "releases" / old["release_id"]
    old_bytes = {f: (path / f).read_bytes() for f in old["files"]}
    for f, digest in old["files"].items():
        assert hashlib.sha256(old_bytes[f]).hexdigest() == digest
    # Round-tripping a DB's sorted row order must yield the same release.
    reverse = {**bundle, **{name: list(reversed(bundle[name])) for name in TABLES}}
    assert export_bundle(reverse, tmp_path, generated="2026-09-09")["release_id"] == old["release_id"]
    new = export_bundle(bundle, tmp_path, generated="2026-09-10")
    assert old["release_id"] != new["release_id"]
    assert all((path / f).read_bytes() == raw for f, raw in old_bytes.items())
    assert json.loads((tmp_path / "manifest.json").read_text())["release_id"] == new["release_id"]
    assert stable_id("el", "aec:1") != stable_id("el", "abs:1")


def test_real_release_reconciles_sources_and_crosswalks():
    from pathlib import Path
    public = Path(__file__).resolve().parents[1] / 'portal/public'
    manifest = json.loads((public / 'electorates/manifest.json').read_text())
    b = json.loads((public / manifest['reference_url'].lstrip('/')).read_text())
    validate(b)
    registry = Registry(b)
    assert len(b['contests']) == 459
    for contest in b['contests']:
        assert sum(c['elected'] for c in contest['candidates']) == 1
        for kind in ('primary', 'tcp'):
            votes = [v for c in contest['candidates'] for v in c['votes'] if v['kind'] == kind]
            assert len(votes) == (len(contest['candidates']) if kind == 'primary' else 2)
            assert sum(v['votes'] for v in votes) == votes[0]['denominator']
    first = registry.resolve(source='aec_division', source_id='207')
    changed = registry.resolve(source='aec_division', source_id='328')
    assert first['status'] == changed['status'] == 'matched'
    assert first['matches'][0]['electorate_id'] == changed['matches'][0]['electorate_id']
    # Tasmanian statistical units are intersections, with two legitimate joins.
    assert registry.resolve(source='abs_sed', source_id='60105', vintage='2025')['status'] == 'ambiguous'
    assert registry.resolve(source='abs_sed', source_id='60105', vintage='2025', chamber='tas_ha')['status'] == 'matched'
    for e in b['electorates']:
        if e['jurisdiction'] == 'vic' and e['chamber'] == 'vic_la':
            key = next(k for k in b['keys'] if k['electorate_id'] == e['electorate_id'] and k['source'] == 'abs_sed')
            assert registry.resolve(source='abs_sed', source_id=key['source_key'], vintage='2025')['status'] == 'matched'
    # A party change doesn't replace the person or require another election.
    senate = [r for r in b['rosters'] if registry.electorates[r['electorate_id']]['chamber'] == 'senate']
    assert sum(len(r['members']) for r in senate) == 76
