"""Dated state source observations must never invent speech-party windows."""
import copy
import hashlib
import json

import pytest

from scripts import roster_accept
from scripts.roster_source_profiles import reference
from scripts.roster_state_parties import audit, enrich, group_problem, observations, proposal


def fixture(tmp_path):
    row = dict(name='Alex Example', speeches=20, states=['nsw'], chambers=['nsw_lc'],
               first=2024, last=2026, representation=[])
    state = dict(snapshots=[dict(jurisdiction='nsw', chamber='nsw_lc', as_of='2026-09-25',
                                source_url='https://www.parliament.nsw.gov.au/fixture.pdf', members=[
                                    dict(name='Alex Example', aliases=['Alexander Example'],
                                         electorate='New South Wales', party='Example Party')])])
    bundle = dict(people=[], electorates=[], sources=[], rosters=[])
    path = tmp_path / 'portal/public/electorates/releases/fixture/reference.json'
    path.parent.mkdir(parents=True)
    raw = json.dumps(bundle).encode()
    path.write_bytes(raw)
    (path.parents[2] / 'manifest.json').write_text(json.dumps(dict(
        reference_url='/electorates/releases/fixture/reference.json', files={'reference.json': hashlib.sha256(raw).hexdigest()})))
    (tmp_path / 'scripts').mkdir()
    (tmp_path / 'scripts/roster_state_evidence.json').write_text(json.dumps(state))
    (tmp_path / 'scripts/roster_service.json').write_text(json.dumps({'snapshot_party_windows': {'nsw_lc': {'start': '2023-03-25'}}}))
    (tmp_path / 'scripts/roster_witness_service.json').write_text('{}')
    values, source = proposal(row, observations(bundle, state))
    group = dict(evidence='snapshot', url=source['source_url'], checked='2026-11-12', as_of=source['as_of'],
                 fields={k: [row.get(k), v] for k, v in values.items() if row.get(k) != v})
    accept = dict(evidence={'snapshot': dict(kind='identity', rule='state-party-snapshot')},
                  records={row['name']: [group]}, new={}, drop={})
    return row, state, bundle, group, accept


def test_full_name_observation_repairs_empty_profile_and_survives_weekly_overlay(tmp_path):
    row, state, bundle, group, accept = fixture(tmp_path)
    before = copy.deepcopy(row)
    out = enrich({'people': [row]}, accept, bundle, state)['people'][0]
    assert row == before
    assert out['party'] == 'Example Party'
    assert out['representation'][0]['as_of'] == '2026-09-25'
    assert not {'current', 'party_now', 'affiliations', 'pid'} & out.keys()
    assert group_problem(row['name'], group, row, tmp_path) is None
    assert group_problem(row['name'], group, out, tmp_path) is None
    people, report = roster_accept.apply([row], [out], accept, tmp_path)
    assert people == [out] and report['applied'] == 1
    people, report = roster_accept.apply([out], [out], accept, tmp_path)
    assert people == [out] and report['unchanged'] == 1
    # A stale box export cannot remove the accepted affiliation.
    people, _ = roster_accept.apply([out], [row], accept, tmp_path)
    assert people == [out]


@pytest.mark.parametrize('changes', [
    {'name': 'Example'}, {'name': 'A Example'}, {'states': ['vic']}, {'chambers': ['nsw_la']},
    {'states': ['nsw', 'federal']}, {'chambers': ['nsw_lc', 'senate_committee']},
    {'last': 2024}, {'witness_rows': 1}, {'party': 'Existing Party'}, {'party_now': 'Existing Party'},
    {'affiliations': [{'party': 'Existing Party'}]}, {'prints': ['Example']}, {'speech_scope': {'state': 'nsw'}},
])
def test_no_guess_from_weak_names_other_house_witnesses_or_other_party(tmp_path, changes):
    row, state, bundle, _, _ = fixture(tmp_path)
    assert proposal(dict(row, **changes), observations(bundle, state)) is None


def test_explicit_alias_allowed_but_ambiguous_or_missing_source_party_refused(tmp_path):
    row, state, bundle, _, _ = fixture(tmp_path)
    records = observations(bundle, state)
    assert proposal(dict(row, name='Alexander Example'), records)
    assert proposal(row, [dict(records[0], as_of='2026-02-30')]) is None
    for extra in [dict(records[0], party='Other Party'), dict(records[0], name='Other Example', aliases=['Alex Example']),
                  dict(records[0], party=None)]:
        assert proposal(row, [*records, extra]) is None


def test_source_move_or_forged_review_holds_party_and_other_protections(tmp_path):
    row, state, bundle, group, accept = fixture(tmp_path)
    for key, value in [('url', 'https://example.test/other'), ('as_of', '2026-09-24')]:
        assert group_problem(row['name'], dict(group, **{key: value}), row, tmp_path)
    forged = copy.deepcopy(group)
    forged['fields']['current'] = [None, True]
    assert group_problem(row['name'], forged, row, tmp_path)
    out = enrich({'people': [row]}, accept, bundle, state)['people'][0]
    state['snapshots'][0]['members'][0]['party'] = 'Other Party'
    (tmp_path / 'scripts/roster_state_evidence.json').write_text(json.dumps(state))
    assert group_problem(row['name'], group, row, tmp_path)
    assert roster_accept.apply([row], [out], accept, tmp_path)[0] == [row]


def test_audit_separates_missing_profiles_and_unsupported_chambers(tmp_path):
    row, state, bundle, _, accept = fixture(tmp_path)
    before = audit({'people': [row]}, bundle, state)
    assert before['nsw_lc']['missing_party'] == 1
    assert before['nsw_lc']['missing_profile'] == 0
    assert before['wa_lc']['members'] is None
    after = audit(enrich({'people': [row]}, accept, bundle, state), bundle, state)
    assert after['nsw_lc']['missing_party'] == 0
    assert audit({'people': []}, bundle, state)['nsw_lc']['missing_profile'] == 1
    # An old list does not establish who sits in 2026.
    state['snapshots'][0]['as_of'] = '2024-09-25'
    assert audit({'people': [row]}, bundle, state)['nsw_lc']['members'] is None


def test_published_reviewed_state_parties_are_reproduced_from_offline_sources():
    from pathlib import Path
    root = Path(__file__).resolve().parents[1]
    accept = roster_accept.load()
    doc = json.loads((root / 'portal/public/parliamentarians.json').read_text())
    for row in doc['people']:
        for group in accept['records'].get(row['name'], []):
            if group['evidence'] == 'state-party-snapshot':
                assert group_problem(row['name'], group, row) is None
    # The actual public regression keeps the snapshot dated, not a service term.
    rath = next(r for r in doc['people'] if r['name'] == 'Chris Rath')
    assert rath['party'] == 'Liberal'
    assert rath['representation'][0]['as_of'] == '2026-09-25'
    assert not {'current', 'party_now', 'affiliations'} & rath.keys()


@pytest.mark.parametrize('name,first', [
    ('Tania Mihailuk', 2015), ('Jeremy Buckingham', 2015),
    ('Rod Roberts', 2019), ('Taylor Martin', 2017),
])
def test_real_party_changers_have_no_snapshot_party_on_earlier_speeches(name, first):
    from pathlib import Path
    root = Path(__file__).resolve().parents[1]
    doc = json.loads((root / 'portal/public/parliamentarians.json').read_text())
    row = next(r for r in doc['people'] if r['name'] == name)
    assert row['first'] == first
    assert not any(row.get(k) for k in ('party', 'party_now', 'affiliations'))
    state = json.loads((root / 'scripts/roster_state_evidence.json').read_text())
    assert proposal(row, observations(reference(), state)) is None
    assert not any(g['evidence'] == 'state-party-snapshot' for g in roster_accept.load()['records'].get(name, []))


def test_term_year_is_held_without_a_reviewed_first_term_exception(tmp_path):
    row, state, bundle, _, _ = fixture(tmp_path)
    records = observations(bundle, state)
    assert proposal(dict(row, first=2023), records) is None
    assert proposal(dict(row, first=2024), records)
    assert proposal(row, records, {}) is None


def test_victorian_party_stays_in_the_dated_seat_catalog(tmp_path):
    row, state, bundle, _, _ = fixture(tmp_path)
    state['snapshots'][0].update(jurisdiction='vic', chamber='vic_lc')
    assert proposal(dict(row, states=['vic'], chambers=['vic_lc']), observations(bundle, state)) is None
    accept = roster_accept.load()
    for name, groups in accept['records'].items():
        for group in groups:
            if group['evidence'] == 'state-party-snapshot':
                assert 'parliament.nsw.gov.au' in group['url']


@pytest.mark.parametrize('variants,canonical', [
    (["Pauline Hanson's One Nation", 'One Nation'], 'One Nation'),
    (['Legalise Cannabis', 'Legalise Cannabis Victoria'], 'Legalise Cannabis'),
    (['Libertarian', 'Libertarian Party'], 'Libertarian Party'),
    (['Shooters, Fishers and Farmers', 'Shooters, Fishers and Farmers Party'], 'Shooters, Fishers and Farmers Party'),
])
def test_snapshot_writes_use_shared_canonical_party_labels(tmp_path, variants, canonical):
    from parli.ingest.speech_hygiene import clean_party
    row, state, bundle, _, _ = fixture(tmp_path)
    for variant in variants:
        assert clean_party(variant) == canonical
        state['snapshots'][0]['members'][0]['party'] = variant
        assert proposal(row, observations(bundle, state))[0]['party'] == canonical
