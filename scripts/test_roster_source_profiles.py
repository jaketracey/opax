"""Offline source identities, alias protections and contaminated-ID regression checks."""
import copy
import hashlib
import json
from pathlib import Path

import pytest

from scripts import roster_accept
from scripts.roster_source_profiles import alias_problem, enrich, enrich_catalog, reference, service_row
from scripts.audit_roster_gaps import Index, QUERIES, audit


def fixture(tmp_path):
    person = dict(person_id='person_a', name='William Example', jurisdiction='federal',
                  aliases=['Bill Example'], sources=['source_a'])
    term = dict(person_id='person_a', representation_id='term_a', electorate_id='seat_a',
                start='1983-03-05', end='1996-01-29', party_periods=[{'party': 'Labor'}])
    seat = dict(electorate_id='seat_a', jurisdiction='federal', chamber='representatives', state_code='vic', name='Example Seat')
    bundle = dict(people=[person], terms=[term], electorates=[seat], sources=[{'source_id': 'source_a'}], contests=[])
    entry = dict(evidence='openaustralia-service', catalog_person_id='person_a', catalog_term_id='term_a',
                 oa_person_count=9999, source_names=['William Example'], source_ids=['source_a'],
                 service=dict(jurisdiction='federal', chamber='representatives', start=term['start'], end=term['end']),
                 row={'name': 'William Example'})
    entry['row'] = service_row(entry, bundle)
    path = tmp_path / 'portal/public/electorates/releases/fixture/reference.json'
    path.parent.mkdir(parents=True)
    raw = json.dumps(bundle).encode()
    path.write_bytes(raw)
    (path.parents[2] / 'manifest.json').write_text(json.dumps(dict(
        reference_url='/electorates/releases/fixture/reference.json', files={'reference.json': hashlib.sha256(raw).hexdigest()})))
    return bundle, entry, path


def test_service_identity_does_not_acquire_a_surname_aggregate(tmp_path):
    bundle, entry, _ = fixture(tmp_path)
    accept = dict(new={'William Example': entry})
    contaminated = dict(name='Example', pid='wragge_example', speeches=200, first=1950, last=2026)
    doc = dict(people=[contaminated])
    out = enrich(doc, accept, bundle)
    assert out['people'][0] == contaminated
    p = out['people'][1]
    assert p['pid'] == '19999' and p['roster_only'] and p['speeches'] == 0
    assert p['first'] == 1983 and p['last'] == 1996
    assert p['aliases'] == ['Bill Example']
    assert doc['people'] == [contaminated]
    assert enrich(out, accept, bundle) == out
    catalog = enrich_catalog(bundle, accept)
    assert catalog['people'][0]['legacy_person_id'] == '19999'
    assert catalog['people'][0]['person_id'] == 'person_a'
    assert enrich_catalog(catalog, accept) == catalog


def test_moved_source_or_stolen_id_refuses_regeneration(tmp_path):
    bundle, entry, _ = fixture(tmp_path)
    bundle['terms'][0]['end'] = '1995-01-01'
    with pytest.raises(ValueError, match='differs'):
        service_row(entry, bundle)
    bundle['terms'][0]['end'] = '1996-01-29'
    bundle['people'].append(dict(person_id='person_b', legacy_person_id='19999'))
    with pytest.raises(ValueError, match='already held'):
        enrich_catalog(bundle, dict(new={'William Example': entry}))


def test_aliases_are_explicit_additive_and_verified_by_both_id_and_name(tmp_path):
    bundle, _, path = fixture(tmp_path)
    bundle['people'][0]['legacy_person_id'] = '19999'
    bundle['people'][0]['aliases'] += ['Member for Example Seat. Mr Bill', 'Mrexample']
    path.write_text(json.dumps(bundle))
    manifest = path.parents[2] / 'manifest.json'
    data = json.loads(manifest.read_text())
    data['files']['reference.json'] = hashlib.sha256(path.read_bytes()).hexdigest()
    manifest.write_text(json.dumps(data))
    row = dict(name='Bill Example', pid='19999', speeches=10)
    group = dict(evidence='source', fields={'aliases': [None, ['William Example']]})
    assert alias_problem(row['name'], group, row, tmp_path) is None
    assert alias_problem(row['name'], group, dict(row, pid='19998'), tmp_path)
    assert alias_problem(row['name'], group, dict(row, name='Bob Example'), tmp_path)
    bad = copy.deepcopy(group)
    bad['fields']['aliases'][1].append('Bob Example')
    assert alias_problem(row['name'], bad, row, tmp_path)
    bad['fields']['aliases'] = [['Other Example'], ['William Example']]
    assert 'cannot remove' in alias_problem(row['name'], bad, row, tmp_path)
    # A changed source body cannot be accepted under the old digest, even after a prior read.
    path.write_text('{}')
    assert 'cannot be verified' in alias_problem(row['name'], group, row, tmp_path)


def test_alias_rule_does_not_bypass_other_protections(tmp_path):
    bundle, _, path = fixture(tmp_path)
    bundle['people'][0]['legacy_person_id'] = '19999'
    path.write_text(json.dumps(bundle))
    manifest = path.parents[2] / 'manifest.json'
    data = json.loads(manifest.read_text())
    data['files']['reference.json'] = hashlib.sha256(path.read_bytes()).hexdigest()
    manifest.write_text(json.dumps(data))
    row = dict(name='Bill Example', pid='19999')
    group = dict(evidence='source', fields={'aliases': [None, ['William Example']]})
    acc = dict(evidence={'source': dict(kind='identity', rule='catalog-aliases', url='https://example.org/source', checked='2026-11-12')},
               records={'Bill Example': [group]})
    assert roster_accept.validate(acc, [row], curated={}, root=tmp_path) == []
    assert roster_accept.validate(acc, [row], curated={'Bill Example': {'aliases'}}, root=tmp_path)
    group['fields']['full'] = [None, 'William Example']
    assert roster_accept.validate(acc, [row], curated={}, root=tmp_path)
    del group['fields']['full']
    acc['records']['Bill Example'].append(copy.deepcopy(group))
    assert roster_accept.validate(acc, [row], curated={}, root=tmp_path)


def test_published_source_values_are_reproducible_and_no_speech_identity_moved():
    root = Path(__file__).resolve().parents[1]
    doc = json.loads((root / 'portal/public/parliamentarians.json').read_text())
    acc = roster_accept.load()
    assert enrich(doc, acc, reference()) == doc
    alan = next(p for p in doc['people'] if p['name'] == 'Alan Griffiths')
    assert alan['pid'] == '10268' and alan['roster_only'] and alan['speeches'] == 0
    assert 'Griffiths' not in alan.get('prints', [])
    assert roster_accept.validate(acc, doc['people']) == []


def test_audit_separates_namespaces_from_missing_people_and_name_variants():
    roster = {'people': [dict(name='Bill Example', pid='19999', speeches=10, aliases=['William Example'])]}
    bundle = dict(people=[dict(person_id='person_a', legacy_person_id='19999', name='William Example')], terms=[], contests=[])
    index = Index(roster, bundle)
    assert index.resolve('person_a', 'William Example') == 0
    assert index.resolve('different_namespace', 'William Example') == 0
    assert index.resolve('unknown', 'Other Example') is None
    assert index.by_name('Example') is None


def test_gap_counts_cover_each_domain_without_turning_idless_recipients_into_people():
    local = {name: [] for name in QUERIES}
    local['members'] = [('19999', 'Bill Example')]
    local['speech_names'] = [('19999', 'William Example', 'representatives', 'federal', 10),
                             ('wragge_other', 'Other Member', 'senate_committee', 'federal', 3)]
    local['votes'] = [('19999', 2)]
    local['interests_register'] = [('19999', 'William Example', 1)]
    local['donation_recipients'] = [('Example Party', 1), ('Bill Example', 2)]
    roster = {'people': [dict(name='Bill Example', pid='19999', speeches=10)]}
    bundle = dict(people=[dict(person_id='person_a', legacy_person_id='19999', name='William Example')],
                  terms=[dict(person_id='person_a')], contests=[dict(candidates=[dict(person_id='person_a', name='Bill Example', elected=True)])])
    public = {'votes': {}, 'interests': {}}
    before = audit(roster, bundle, local, public)
    assert before['total_distinct_missing_exact_ids'] == 1
    assert before['categories']['committees']['missing_exact_ids'] == 1
    assert before['categories']['candidacies']['missing_exact_ids'] == 0
    assert before['categories']['donation_recipients']['referenced_ids'] == 0
    assert before['categories']['donation_recipients']['idless_names_addressable'] == 1
    roster['people'][0]['aliases'] = ['William Example']
    # A second print of the same pid is still one person, never a new ambiguity.
    roster['people'].append(dict(name='B. Example', pid='19999', speeches=1))
    after = audit(roster, bundle, local, public)
    assert after['total_unresolved_name_variants'] < before['total_unresolved_name_variants']
    assert after['categories']['speeches']['missing_profile_ids'] == 1
