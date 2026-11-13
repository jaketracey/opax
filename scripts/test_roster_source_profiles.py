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


# Official-list members with no Hansard row (scripts/roster_source_profiles.py LIST_RULE). Invented people only.
LIST_URL = 'https://example.org/council/members'


def list_fixture(tmp_path):
    snap = dict(source_url=LIST_URL, sha256='ab' * 32, as_of='2026-11-13', jurisdiction='sa', chamber='sa_lc',
                members=[
                    dict(name='Ada Example', aliases=['Ada Jane Example'], electorate='South Australia', party='Labor'),
                    dict(name='Cory Sample', aliases=[], electorate='South Australia', party='One Nation'),
                    dict(name='Pat Printed', aliases=['Pat Quinn Printed'], electorate='South Australia', party='Greens',
                         prints=['P.Q. Printed']),
                ])
    (tmp_path / 'scripts').mkdir(parents=True, exist_ok=True)
    (tmp_path / 'scripts/roster_state_evidence.json').write_text(json.dumps(dict(reviewed='2026-11-13', snapshots=[snap])))
    senate = dict(jurisdiction='federal', chamber='senate', electorate='South Australia', state='SA',
                  basis='Recorded parliamentary roster; exact name and chamber match')
    people = [
        dict(name='Cory Sample', speeches=40, party='Liberal', states=['federal'], chambers=['senate'], first=2006,
             last=2019, pid='19998', representation=[senate]),
        dict(name='P.Q. Printed', speeches=12, states=['sa'], chambers=['sa_lc'], first=2021, last=2023, representation=[]),
    ]
    evidence = {'sa-list': dict(kind='identity', rule='official-list-member', checked='2026-11-13', url=LIST_URL,
                                reason='fixture')}
    return snap, dict(meta=dict(people=len(people)), people=people), evidence


def list_accept(doc, snap, evidence):
    from scripts.roster_source_profiles import propose_list
    new, links, held = propose_list(doc, snap, 'sa-list', '2026-11-13', LIST_URL)
    return dict(evidence=evidence, new=new, records={n: [g] for n, g in links.items()}, drop={}), held


def test_a_list_member_without_hansard_gets_one_stub_and_a_federal_namesake_is_linked(tmp_path):
    from scripts.roster_source_profiles import enrich_lists, state_evidence
    snap, doc, evidence = list_fixture(tmp_path)
    acc, held = list_accept(doc, snap, evidence)
    assert held == []
    # Pat Printed already sits in the chamber under a reviewed print: neither a stub nor a link.
    assert set(acc['new']) == {'Ada Example'} and set(acc['records']) == {'Cory Sample'}
    stub = acc['new']['Ada Example']['row']
    assert stub == dict(name='Ada Example', speeches=0, states=['sa'], chambers=['sa_lc'], first=2026, last=2026,
                        roster_only=True, aliases=['Ada Jane Example'], party='Labor', current=True, party_now='Labor',
                        representation=[dict(jurisdiction='sa', chamber='sa_lc', electorate='South Australia', state='SA',
                                             basis='Official member list as at 2026-11-13; list-only service, no speech attribution')])
    assert 'pid' not in stub
    state = state_evidence(tmp_path)
    out = enrich_lists(copy.deepcopy(doc), acc, state)
    names = [p['name'] for p in out['people']]
    assert names.count('Ada Example') == 1 and names.count('Cory Sample') == 1 and len(names) == 3
    cory = next(p for p in out['people'] if p['name'] == 'Cory Sample')
    # Linked: same id, speeches, party and years; only the Council chamber, state and seat are added.
    assert cory['pid'] == '19998' and cory['speeches'] == 40 and cory['party'] == 'Liberal' and cory['last'] == 2019
    assert cory['states'] == ['federal', 'sa'] and cory['chambers'] == ['senate', 'sa_lc']
    assert cory['representation'][0]['chamber'] == 'senate' and cory['representation'][1]['chamber'] == 'sa_lc'
    assert not {k for k in cory} - {*doc['people'][0], 'states', 'chambers', 'representation'}
    # Idempotent: a second pass, and a pass over a roster that already holds them, change nothing.
    assert enrich_lists(copy.deepcopy(out), acc, state) == out
    again, held = list_accept(out, snap, evidence)
    assert held == [] and again['new'] == {} and again['records'] == {}
    # The accept list's own gate passes both, and the overlay installs exactly them onto the shipped roster.
    assert roster_accept.validate(acc, doc['people'], curated={}, root=tmp_path) == []
    blocked, groups, new = roster_accept.judge(acc, doc['people'], root=tmp_path, curated={})
    assert blocked is None and all(why is None for *_, why in groups) and all(why is None for *_, why in new)


def test_list_rows_hold_when_the_list_moves_or_the_name_is_ambiguous(tmp_path):
    from scripts.roster_source_profiles import enrich_lists, propose_list, state_evidence, list_problem
    snap, doc, evidence = list_fixture(tmp_path)
    acc, _ = list_accept(doc, snap, evidence)
    entry = acc['new']['Ada Example']
    # The row must be what the list gives: an id, speeches or another party is held.
    for field, value in (('pid', '19997'), ('speeches', 3), ('party', 'Liberal')):
        bad = copy.deepcopy(entry)
        bad['row'][field] = value
        assert roster_accept.new_row_problem('Ada Example', bad, evidence, root=tmp_path)
    assert roster_accept.new_row_problem('Ada Example', entry, evidence, root=tmp_path) is None
    # A list whose body changed (another digest) no longer vouches for the row, and a re-export refuses it.
    moved = json.loads((tmp_path / 'scripts/roster_state_evidence.json').read_text())
    moved['snapshots'][0]['sha256'] = 'cd' * 32
    (tmp_path / 'scripts/roster_state_evidence.json').write_text(json.dumps(moved))
    assert 'official list' in list_problem('Ada Example', entry, root=tmp_path)
    with pytest.raises(ValueError):
        enrich_lists(copy.deepcopy(doc), acc, state_evidence(tmp_path))
    # Two roster people with the list name, or one in another state, are held for a person, never linked.
    twin = dict(doc['people'][0], pid='19996')
    _, links, held = propose_list(dict(people=[*doc['people'], twin]), snap, 'sa-list', '2026-11-13', LIST_URL)
    assert links == {} and [n for n, _ in held] == ['Cory Sample']
    elsewhere = copy.deepcopy(doc)
    elsewhere['people'][0]['representation'][0]['state'] = 'NSW'
    _, links, held = propose_list(elsewhere, snap, 'sa-list', '2026-11-13', LIST_URL)
    assert links == {} and held == [('Cory Sample', 'The linked person holds no seat in the list state')]


def test_shipped_sa_council_list_members_are_seven_and_bernardi_is_one_person():
    root = Path(__file__).resolve().parents[1]
    doc = json.loads((root / 'portal/public/parliamentarians.json').read_text())
    acc = roster_accept.load()
    listed = {n for n, e in acc['new'].items() if e['evidence'] == 'sa-council-list'}
    assert listed == {'Mira El Dannawi', 'Hilton Gumbys', 'Rebecca Hewett', 'Benjamin Hood', 'Carlos Quaremba',
                      'Melanie Selwood'}
    by = {p['name']: p for p in doc['people']}
    for name in listed:
        p = by[name]
        assert p['roster_only'] and p['speeches'] == 0 and 'pid' not in p and p['chambers'] == ['sa_lc'] and p['current']
    assert [p['name'] for p in doc['people'] if 'bernardi' in p['name'].lower()] == ['Cory Bernardi']
    cory = by['Cory Bernardi']
    assert cory['pid'] == '10038' and 'sa_lc' in cory['chambers'] and not cory.get('roster_only')
    identity = json.loads((root / 'scripts/person_identity.json').read_text())['same_person']
    assert identity['cory bernardi']['key'] == '10038'
    # D.G.E. Hood and the surname print "Hood" are not Benjamin Hood and keep their rows.
    assert by['D.G.E. Hood'].get('pid') is None and 'sa_lc' not in by['Hood']['chambers']


def test_an_export_row_that_differs_keeps_the_stubs_and_leaves_the_link_to_the_overlay(tmp_path):
    """The box export's row for a linked person can differ from the reviewed one (no seat yet, another basis):
    the link is not laid on it, nothing raises, and the list-only rows are still rebuilt."""
    from scripts.roster_source_profiles import enrich_lists, state_evidence
    snap, doc, evidence = list_fixture(tmp_path)
    acc, _ = list_accept(doc, snap, evidence)
    export = copy.deepcopy(doc)
    export['people'][0]['representation'] = []
    out = enrich_lists(copy.deepcopy(export), acc, state_evidence(tmp_path))
    assert out['people'][0] == export['people'][0]
    assert [p['name'] for p in out['people']].count('Ada Example') == 1
    shipped = enrich_lists(copy.deepcopy(doc), acc, state_evidence(tmp_path))
    real = Path(__file__).resolve().parents[1]
    for rel in roster_accept.CURATED_FILES:  # the repo's curated pins name none of these invented people
        (tmp_path / rel).write_text((real / rel).read_text())
    people, report = roster_accept.apply(shipped['people'], out['people'], acc, tmp_path)
    assert people == shipped['people'] and report['blocked'] is None
