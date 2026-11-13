"""Current state electorate coverage, dated evidence and exact joins."""
import copy
import hashlib
import io
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from parli.electorates import TABLES, canonical_json, export_bundle
from parli.ingest.state_members import (
    LOWER_HOUSES, STATES, fetch_page, join_state_members, name_key, normalise_electorate,
    parse_act, parse_sa, parse_tas, wikidata_observations,
)

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'portal/public'
BASELINE_RELEASE = '9e281b4ef4edbd38'


def published():
    manifest = json.loads((PUBLIC / 'electorates/manifest.json').read_text())
    release = PUBLIC / 'electorates/releases' / manifest['release_id']
    return manifest, release, json.loads((release / 'index.json').read_text())['electorates']


def fixture_bundle(capacity=1, state='nsw'):
    return dict(schema_version=1, **{table: [] for table in TABLES}, **{}) | {
        'electorates': [dict(electorate_id='seat_a', slug=f'{state}-test', name='Mount Example',
                            jurisdiction=state, chamber=LOWER_HOUSES[state], capacity=capacity, status='current')],
        'people': [dict(person_id='person_a', name='Alex Example', jurisdiction=state,
                        aliases=[], legacy_person_id='example_member', sources=[])],
    }


def observation(members=None, *, on='2026-11-14', basis='official_current_list', state='nsw'):
    return dict(jurisdiction=state, chamber=LOWER_HOUSES[state], as_of=on, basis=basis,
                sources=[dict(source_id='source_list', url=f'https://www.parliament.{state}.gov.au/members',
                              label='Fixture current list', fetched_at=on)],
                members=members or [dict(name='Alex Example', party='Source party label',
                                         electorate='Mt. Example', source_key='member_a')])


@pytest.mark.parametrize('left,right', [
    ('MOUNT EXAMPLE', 'Mt Example'), ('  Mt.   Example ', 'mount example'),
    ('Example-North', 'Example North'), ('Example\u2011North', 'EXAMPLE NORTH'),
    ("O’Example", "O'Example"), ("O‘Example", 'OExample'), ("OʼExample", 'oexample'),
    ('Example\u00a0North', 'example north'),
])
def test_exact_normaliser_typography(left, right):
    assert normalise_electorate(left) == normalise_electorate(right)


@pytest.mark.parametrize('left,right', [('Example', 'Example North'), ('Example Region', 'Example'),
                                        ('East Example', 'West Example'), ('MtExample', 'Mount Example')])
def test_normaliser_does_not_guess_seats(left, right):
    assert normalise_electorate(left) != normalise_electorate(right)


def test_held_terms_collapse_bindings_and_do_not_infer_unknown_dates():
    row = dict(qid='Q123', state='nsw', chamber='nsw_la', full_name='Alex Example',
               district='Mt Example', party='Party One', term_start='2020-01-01', term_end=None,
               fetched_at='2026-09-21T12:00:00Z')
    records = [row, copy.deepcopy(row), dict(row, party='Party Two'),
               dict(row, qid='Q124', term_start=None), dict(row, qid='Q125', term_start='2026-10-01'),
               dict(row, qid='Q126', term_end='2026-09-21')]
    result = wikidata_observations(records)
    assert len(result) == 1 and result[0]['as_of'] == '2026-09-21'
    assert len(result[0]['members']) == 1 and result[0]['members'][0]['party'] is None


def test_join_links_existing_profile_and_keeps_source_party_date_and_url():
    bundle = fixture_bundle()
    out, issues = join_state_members(bundle, [observation()])
    assert not issues and not bundle['rosters']
    assert len(out['people']) == 1
    member = out['rosters'][0]['members'][0]
    assert member['person_id'] == 'person_a'
    assert member['party'] == 'Source party label'
    assert member['source_url'] == 'https://www.parliament.nsw.gov.au/members'
    assert member['basis'] == 'Current as at 2026-11-14'
    assert not out['terms']  # No invented start dates.


def test_current_observation_cannot_supply_speech_party_or_service_history():
    from scripts.enrich_profile_jurisdictions import dated_records
    from scripts.roster_state_parties import observations
    out, _ = join_state_members(fixture_bundle(), [observation()])
    assert out['rosters'][0]['observation_only']
    assert observations(out, {'snapshots': []}) == []
    assert dated_records(out, {}, {'snapshots': []}) == []


def test_import_cannot_rebuild_federal_rosters_with_the_same_basis_label():
    bundle = fixture_bundle()
    bundle['electorates'].append(dict(electorate_id='federal_seat', slug='federal-test', name='Other',
        jurisdiction='federal', chamber='representatives', capacity=1, status='current'))
    bundle['people'].append(dict(person_id='person_f', name='Sam Example', jurisdiction='federal'))
    roster = dict(roster_id='federal_roster', electorate_id='federal_seat', as_of='2026-11-13',
        capacity=1, complete=True, basis='official_current_list', members=[dict(person_id='person_f')])
    bundle['rosters'].append(roster)
    out, _ = join_state_members(bundle, [observation()])
    assert next(r for r in out['rosters'] if r['roster_id'] == 'federal_roster') == roster


@pytest.mark.parametrize('supplied,canonical', [('ALP', 'Labor'), ('LP', 'Liberal'), ('Green', 'Greens'),
    ('IND', 'Independent'), ('Liberal-National Coalition', None)])
def test_party_lookup_label_never_replaces_the_supplied_label(supplied, canonical):
    obs = observation()
    obs['members'][0]['party'] = supplied
    out, _ = join_state_members(fixture_bundle(), [obs])
    member = out['rosters'][0]['members'][0]
    assert member['party'] == supplied and member['party_canonical'] == canonical


def test_unmatched_ambiguous_and_over_capacity_are_logged(caplog):
    missing = observation([dict(name='Alex Example', electorate='Example North', party='A', source_key='a')])
    out, issues = join_state_members(fixture_bundle(), [missing])
    assert not out['rosters'] and issues[0]['reason'] == 'no electorate match'
    assert 'no electorate match' in caplog.text
    crowded = observation([dict(name=f'{name} Example', electorate='Mt Example', party='A', source_key=name)
                           for name in ('Alex', 'Sam')])
    out, issues = join_state_members(fixture_bundle(), [crowded])
    assert not out['rosters'] and issues[0]['reason'] == 'roster exceeds capacity'
    bundle = fixture_bundle()
    bundle['electorates'].append(dict(bundle['electorates'][0], electorate_id='seat_b', slug='nsw-other'))
    out, issues = join_state_members(bundle, [observation()])
    assert not out['rosters'] and issues[0]['reason'] == 'ambiguous electorate'


def test_one_source_identity_on_two_seats_is_rejected():
    bundle = fixture_bundle()
    bundle['electorates'].append(dict(bundle['electorates'][0], electorate_id='seat_b', slug='nsw-other', name='Other'))
    rows = [dict(name='Alex Example', electorate=seat, party='A', source_key='same-person')
            for seat in ('Mount Example', 'Other')]
    out, issues = join_state_members(bundle, [observation(rows)])
    assert not out['rosters']
    assert {i['reason'] for i in issues} == {'member on multiple seats'}


def test_different_source_keys_linking_one_person_cannot_claim_two_seats():
    bundle = fixture_bundle()
    bundle['electorates'].append(dict(bundle['electorates'][0], electorate_id='seat_b', slug='nsw-other', name='Other'))
    rows = [dict(name='Alex Example', electorate=seat, party='A', source_key=seat)
            for seat in ('Mount Example', 'Other')]
    with pytest.raises(ValueError, match='two current seats'):
        join_state_members(bundle, [observation(rows)])


def test_official_list_beats_newer_stale_open_term_and_replays_exactly():
    official = observation(on='2026-06-02')
    stale = observation([dict(name='Sam Former', electorate='Mt Example', party='Old', source_key='former')],
                        on='2026-09-21', basis='held_wikidata_terms')
    bundle = fixture_bundle()
    out, _ = join_state_members(bundle, [official, stale])
    assert out['rosters'][0]['as_of'] == '2026-06-02'
    assert out['rosters'][0]['members'][0]['person_id'] == 'person_a'
    again, _ = join_state_members(out, [official, stale])
    assert canonical_json(out) == canonical_json(again)


def test_new_person_with_multiple_sources_replays_without_changing_source_order():
    source = observation([dict(name='Sam New', electorate='Mt Example', party='A', source_key='new')])
    source['sources'] = [dict(source['sources'][0], source_id=sid) for sid in ('source_z', 'source_a')]
    out, _ = join_state_members(fixture_bundle(), [source])
    again, _ = join_state_members(out, [source])
    assert canonical_json(out) == canonical_json(again)


@pytest.mark.parametrize('state,capacity', [('act', 5), ('tas', 7)])
def test_multimember_import_keeps_every_member(state, capacity):
    members = [dict(name=f'Member {i} Example', electorate='Mt Example', party='Original', source_key=f'm{i}')
               for i in range(capacity)]
    out, _ = join_state_members(fixture_bundle(capacity, state), [observation(members, state=state)])
    assert len(out['rosters'][0]['members']) == capacity and out['rosters'][0]['complete']


def test_act_parser_preserves_affiliation_and_omits_postnominals_and_contacts():
    raw = b'''<table><tr><td><a href="https://www.parliament.act.gov.au/members/current/example">
        <img src="portrait.png">Alex <strong>Example</strong> CSC</a><br>Speaker</td>
        <td>Mount Example</td><td><span>\xe2\xac\xa4 I</span>ndependent</td><td>Private contact excluded</td></tr></table>'''
    members = parse_act(raw)
    assert members[0]['name'] == 'Alex Example' and members[0]['party'] == 'Independent'
    assert 'contact' not in str(members)


def test_sa_parser_uses_preferred_name_and_retains_full_alias_and_party():
    raw = json.dumps(dict(memberContacts=[dict(pmId=1, firstName='Alexander', preferredName='Alex',
                    lastName='Example', otherName='Robin', politicalPartyName='ALP', electorateName='Mount Example')])).encode()
    member = parse_sa(raw)[0]
    assert member['name'] == 'Alex Example' and member['aliases'] == ['Alexander Robin Example']
    assert member['party'] == 'ALP'
    del_raw = json.loads(raw)
    del del_raw['memberContacts'][0]['electorateName']
    assert parse_sa(json.dumps(del_raw).encode(), statewide='South Australia')[0]['electorate'] == 'South Australia'


def test_tas_parser_requires_all_directory_members_and_ignores_extra_address_rows():
    import openpyxl
    book = openpyxl.Workbook()
    sheet = book.active
    sheet.append(['Title', 'First', 'Last', 'Electorate', 'Party'])
    sheet.append(['Hon', 'Alex', 'Example MP', 'Mt Example', 'Original Party'])
    sheet.append(['Hon', 'Alex', 'Example MP', ' ', 'Original Party'])
    raw = io.BytesIO(); book.save(raw)
    html = b'<main><a href="https://www.parliament.tas.gov.au/house-of-assembly/currentmembers/example">The Honourable Alexander Example</a></main>'
    result = parse_tas(raw.getvalue(), html, 'tas_ha')
    assert len(result) == 1 and result[0]['aliases'] == ['Alexander Example']
    assert result[0]['party'] == 'Original Party'
    with pytest.raises(ValueError, match='disagree'):
        parse_tas(raw.getvalue(), html.replace(b'</main>', b'<a href="/house-of-assembly/currentmembers/missing">Sam Other</a></main>'), 'tas_ha')


@pytest.mark.parametrize('status,body', [(403, b'Refused'), (429, b'Slow down'), (200, b'Verify you are human')])
def test_refusal_is_retained_and_pauses_entire_jurisdiction(tmp_path, monkeypatch, status, body):
    calls, sleeps = [], []
    def get(url, **kwargs):
        calls.append((url, kwargs))
        return SimpleNamespace(content=body, status_code=status, headers={})
    monkeypatch.setattr('parli.ingest.state_members.requests.get', get)
    monkeypatch.setattr('parli.ingest.state_members.time.sleep', sleeps.append)
    assert fetch_page(tmp_path, 'nsw', 'https://www.parliament.nsw.gov.au/members', 'list') is None
    with pytest.raises(ValueError, match='paused'):
        fetch_page(tmp_path, 'nsw', 'https://other.parliament.nsw.gov.au/data', 'alternate')
    assert len(calls) == 1 and sleeps == [1.1]
    assert calls[0][1] == dict(headers={'User-Agent': 'opax-improve-audit'}, timeout=40, allow_redirects=False)
    evidence = json.loads((tmp_path / 'acquisition.json').read_text())[0]
    assert (tmp_path / evidence['path']).read_bytes() == body


def test_every_current_state_seat_has_capacity_or_an_exact_reviewed_exception():
    _, _, electorates = published()
    exceptions = json.loads((ROOT / 'data/state-members/exceptions.json').read_text())['exceptions']
    reviewed = {e['electorate_id']: e for e in exceptions}
    assert len(reviewed) == len(exceptions)
    needs_review = set()
    for seat in electorates:
        if seat['jurisdiction'] not in STATES or seat['status'] != 'current':
            continue
        count = len(seat['representatives'])
        if seat['chamber'] == LOWER_HOUSES[seat['jurisdiction']]:
            assert seat['capacity'] == (7 if seat['jurisdiction'] == 'tas' else 5 if seat['jurisdiction'] == 'act' else 1)
        assert count <= seat['capacity']
        if count < seat['capacity']:
            needs_review.add(seat['electorate_id'])
            exception = reviewed[seat['electorate_id']]
            assert exception['reason'] and exception['reviewed_as_of'] and exception['source_url']
            assert exception['observed_members'] == count
            assert exception['expected_capacity'] == seat['capacity']
        else:
            assert seat['electorate_id'] not in reviewed
    assert needs_review == set(reviewed)


def test_published_state_members_are_unique_dated_and_sourced_without_invented_terms():
    _, release, electorates = published()
    identities, names = set(), set()
    for seat in electorates:
        if seat['jurisdiction'] not in STATES:
            continue
        detail = json.loads((release / (seat['electorate_id'] + '.json')).read_text())
        assert not detail['terms']
        for member in seat['representatives']:
            identity = member['person_id']
            name = (seat['jurisdiction'], name_key(member['person']['name']))
            assert identity not in identities and name not in names
            identities.add(identity); names.add(name)
            assert ' ' in member['person']['name']
            assert member['basis'] == 'Current as at ' + seat['representation_as_of']
            assert member['source_url'].startswith('https://')
            assert member['sources'] and all(s in detail['sources'] for s in member['sources'])


def test_victorian_and_federal_detail_summary_and_people_bytes_are_unchanged():
    _, release, electorates = published()
    old = PUBLIC / 'electorates/releases' / BASELINE_RELEASE
    old_index = {e['electorate_id']: e for e in json.loads((old / 'index.json').read_text())['electorates']}
    for seat in electorates:
        if seat['jurisdiction'] not in ('vic', 'federal'):
            continue
        filename = seat['electorate_id'] + '.json'
        assert (release / filename).read_bytes() == (old / filename).read_bytes()
        assert canonical_json(seat).encode() == canonical_json(old_index[seat['electorate_id']]).encode()
    people = json.loads((release / 'people.json').read_text())['people']
    old_people = json.loads((old / 'people.json').read_text())['people']
    protected = lambda rows: canonical_json([p for p in rows if p.get('jurisdiction') in ('vic', 'federal')]).encode()
    assert protected(people) == protected(old_people)


def test_protected_export_fails_if_any_protected_data_changes(tmp_path):
    bundle = fixture_bundle(state='qld')
    first = export_bundle(bundle, tmp_path, generated='2026-11-13')
    old = tmp_path / 'releases' / first['release_id']
    detail = json.loads((old / 'seat_a.json').read_text())
    second = export_bundle(bundle, tmp_path, generated='2026-11-14', preserved_details={'seat_a': detail})
    assert (tmp_path / 'releases' / second['release_id'] / 'seat_a.json').read_bytes() == (old / 'seat_a.json').read_bytes()
    bundle['electorates'][0]['name'] = 'Changed'
    with pytest.raises(ValueError, match='Protected electorate'):
        export_bundle(bundle, tmp_path, generated='2026-11-14', preserved_details={'seat_a': detail})


def test_offline_join_reproduces_published_reference_and_replays_exactly():
    _, release, _ = published()
    baseline = json.loads((PUBLIC / 'electorates/releases' / BASELINE_RELEASE / 'reference.json').read_text())
    held = json.loads((ROOT / 'data/state-members/held-wikidata.json').read_text())
    official = json.loads((ROOT / 'data/state-members/official-lists.json').read_text())['observations']
    catalog = json.loads((PUBLIC / 'parliamentarians.json').read_text())['people']
    observations = [*wikidata_observations(held), *official]
    out, _ = join_state_members(baseline, observations, catalog=catalog)
    again, _ = join_state_members(out, observations, catalog=catalog)
    assert canonical_json(out) == canonical_json(again)
    released = json.loads((release / 'reference.json').read_text())
    for table, (key, _) in TABLES.items():
        out[table].sort(key=lambda row: row[key])
    assert canonical_json(out) == canonical_json(released)
