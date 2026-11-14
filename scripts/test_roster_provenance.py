"""Provenance checks cannot turn coverage, ambiguous names or fetches into tenure."""
from collections import Counter
import csv
import hashlib
import io
import json
from pathlib import Path
import sqlite3
import pytest

from scripts.audit_roster_provenance import StrictMatcher, apply_raw_corrections, interval_matches, raw_member_corrections, raw_summary
from scripts.audit_roster_periods import inventory
from parli.electorates import stable_id

ROOT = Path(__file__).resolve().parents[1]


def write_service_evidence(root, bundle, career=None, primary=None):
    """Invented source records. The complete CSV deliberately has no date filter."""
    term = bundle['terms'][0]
    career = career if career is not None else [dict(term, source_key='1', name='Quinn Harrowgate', seat='Fixture', state='NSW')]
    fields = ['member count', 'person count', 'name', 'Division', 'State/Territory', 'Date of election',
              'Type of election', 'Date ceased to be a Member', 'reason', 'Most recent party']
    body = io.StringIO()
    writer = csv.writer(body)
    writer.writerow(fields)
    def day(s):
        return '.'.join(reversed(s.split('-'))) if s else ''
    for row in career:
        writer.writerow([row['source_key'], '', row['name'], row['seat'], row['state'], day(row['start']),
                         row['start_reason'], day(row['end']), row['end_reason'], 'IND'])
    scripts = root / 'scripts'
    scripts.mkdir(exist_ok=True)
    files = {}
    for name, value in [('representatives.csv', body.getvalue()),
                        ('people.csv', 'person count,aph id,name,birthday,alt name\n89500,FIXTURE,Quinn Harrowgate,,\n')]:
        path = scripts / name
        path.write_text(value)
        files[name] = dict(path=str(path.relative_to(root)), sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    bundle['sources'][0]['sha256'] = files['representatives.csv']['sha256']
    primary = primary if primary is not None else dict(PHID='FIXTURE', GivenName='Quinn', MiddleNames='',
        FamilyName='Harrowgate', PreferredName='', MPorSenator=['Member'], InCurrentParliament='False',
        ServiceHistory_Start=term['start'], ServiceHistory_End=term['end'], RepresentedParliaments=[40, 41])
    evidence = dict(files=files, handbook=dict(individuals=[primary]),
                    house_convention=dict(name='fixture-events', general_elections=[dict(poll='2019-05-18', dissolution='2019-04-11')],
                                          by_elections=[dict(source_date='2018-11-05', poll='2018-10-20', phid='FIXTURE')]))
    (scripts / 'roster_provenance_sources.json').write_text(json.dumps(evidence))
    return career, primary


def source_fixture(root):
    public = root / 'portal/public'
    (public / 'electorates').mkdir(parents=True)
    (public / 'electorates/manifest.json').write_text(json.dumps(dict(reference_url='/reference.json')))
    term = dict(person_id='p', electorate_id='e', representation_id=stable_id('term', 'oa:1'),
                start='1996-03-02', end=None, start_precision='day', end_precision='open',
                start_reason='election', end_reason='still_in_office', sources=['source'])
    bundle = dict(people=[dict(person_id='p', legacy_person_id='99500', name='Quinn Harrowgate')],
                  electorates=[dict(electorate_id='e', chamber='representatives')], terms=[term],
                  sources=[dict(source_id='source', label='OpenAustralia parliamentary service records', url='https://example.test/service')])
    signals = [dict(person_id='99500', house='representatives', reasons=['start-equals-first-stored-record'])]
    member = dict(person_id='99500', full_name='Quinn Harrowgate', entered_house='1998-03-02', left_house='2001-01-01')
    return public / 'reference.json', bundle, signals, member


def test_id_disambiguates_only_when_an_exact_reviewed_name_also_agrees():
    matcher = StrictMatcher([
        dict(actor='name:quinn harrowgate', chamber='representatives', names=['quinn harrowgate']),
        dict(actor='pid:99500', chamber='representatives', names=['quinn harrowgate', 'harrowgate']),
        dict(actor='name:sample', chamber='vic_la', names=['sample']),
    ])
    row = dict(chamber='representatives', speaker_name='Quinn Harrowgate', person_id='tvfy_99500')
    assert matcher.match(row) == ('pid:99500', 'exact-id-and-reviewed-name')
    assert matcher.match(dict(row, person_id='99501'))[0] is None
    assert matcher.match(dict(row, speaker_name='Quinn Other'))[0] is None
    assert matcher.match(dict(row, chamber='senate'))[0] is None
    assert matcher.match(dict(row, speaker_name='Harrowgate'))[0] == 'pid:99500'
    assert matcher.match(dict(row, speaker_name='Harrowgate', person_id=None))[0] is None
    assert matcher.match(dict(row, chamber='vic_la', speaker_name='Sample', person_id='vic_sample'))[0] is None


def test_every_interval_uses_participation_inside_its_own_dates():
    db = sqlite3.connect(':memory:')
    db.row_factory = sqlite3.Row
    db.executescript('''
        CREATE TABLE speeches(chamber, speaker_name, speaker_name_clean, person_id, date, speech_id, source, speaker_type);
        CREATE TABLE ext_votes(house, person_raw, person_name, person_id, date, division_id, source, vote);
        CREATE TABLE votes(division_id,person_id,vote);
        CREATE TABLE divisions(division_id,house,date);
        CREATE TABLE members(person_id,full_name);
    ''')
    base = ('representatives', 'Quinn Harrowgate', None, '99500')
    db.executemany('INSERT INTO speeches VALUES(?,?,?,?,?,?,?,?)', [
        (*base, '2000-01-01', 1, 'zenodo', None),
        (*base, '2020-06-01', 2, 'zenodo', None),
        (*base, '2020-01-01', 3, 'wragge_xml', None),
        (*base, '2020-02-01', 4, 'zenodo', 'witness'),
    ])
    db.executemany('INSERT INTO ext_votes VALUES(?,?,?,?,?,?,?,?)', [
        ('representatives', 'Quinn Harrowgate', None, 'tvfy_99500', '2020-05-01', 'paired', 'test', 'paired'),
        ('representatives', 'Quinn Harrowgate', None, 'tvfy_99500', '2020-04-01', 'absent', 'test', 'absent'),
        ('senate', 'Quinn Harrowgate', None, 'tvfy_99500', '2020-03-01', 'wrong-house', 'test', 'aye'),
    ])
    periods = [dict(key='later-term', actor='pid:99500', chamber='representatives', start='2020-01-01', end='2020-12-31'),
               dict(key='gap', actor='pid:99500', chamber='representatives', start='2010-01-01', end='2010-12-31')]
    identities = [dict(actor='pid:99500', chamber='representatives', names=['quinn harrowgate'])]
    outcomes, _ = interval_matches(db, periods, identities)
    assert outcomes[0]['corpus_bound']['record_id'] == 'paired'
    assert outcomes[0]['corpus_bound']['date'] == '2020-05-01'
    assert outcomes[1]['status'] == 'no-in-interval-record'
    assert outcomes[1]['corpus_bound'] is None
    groups = [dict(chamber='representatives', speaker_name='Quinn Harrowgate', person_id='99500')]
    filtered, _ = interval_matches(db, periods, identities, groups)
    assert filtered == outcomes  # the index prefilter cannot substitute a group minimum


def test_raw_corrections_require_a_single_dated_source_and_agreeing_id_and_full_name(tmp_path):
    path, bundle, signals, member = source_fixture(tmp_path)
    term = bundle['terms'][0]
    def review():
        write_service_evidence(tmp_path, bundle)
        path.write_text(json.dumps(bundle))
        return raw_member_corrections(signals, {'99500': member}, tmp_path)[0]
    assert review()['corrections'] == {'entered_house': dict(before='1998-03-02', after='1996-03-02')}
    # A null source end cannot silently turn a retired raw member into a current one.
    assert 'left_house' not in review()['corrections']
    term.update(end='2020-01-01', end_precision='day', end_reason='changed_party')
    assert 'left_house' not in review()['corrections']
    term['end_reason'] = 'retired'
    assert review()['corrections']['left_house']['after'] == '2020-01-01'
    term['start_reason'] = 'first_seen'
    assert 'entered_house' not in review()['corrections']
    term['start_reason'] = 'election'
    member['full_name'] = 'Another Harrowgate'
    assert not review()['corrections']
    member['full_name'] = 'Quinn Harrowgate'
    bundle['terms'].append(dict(term, representation_id='second-seat'))
    assert not review()['corrections']
    bundle['terms'].pop()
    bundle['sources'][0]['label'] = 'Corpus observation'
    assert not review()['corrections']


def test_pre_1993_stint_cannot_disappear_from_a_single_catalogue_term(tmp_path):
    path, bundle, signals, member = source_fixture(tmp_path)
    term = bundle['terms'][0]
    term.update(start='1984-12-01', end='2007-10-17', end_precision='day', end_reason='retired')
    later, primary = write_service_evidence(tmp_path, bundle)
    earlier = dict(later[0], source_key='2', seat='Earlier fixture seat', start='1975-12-13', end='1983-03-05', end_reason='defeated')
    primary.update(ServiceHistory_Start='1975-12-13')
    write_service_evidence(tmp_path, bundle, [earlier, *later], primary)
    path.write_text(json.dumps(bundle))
    row = raw_member_corrections(signals, {'99500': member}, tmp_path)[0]
    assert row['disposition'] == 'held-multiple-complete-career-rows'
    assert not row['corrections']
    assert [r['start'] for r in row['complete_source_career']] == ['1975-12-13', '1984-12-01']
    assert row['endpoint_review']['entered_house']['source_a'] == '1984-12-01'
    assert row['endpoint_review']['entered_house']['source_b'] == '1975-12-13'


@pytest.mark.parametrize(('event', 'a', 'b', 'expected'), [
    ('retired', '2019-05-18', '2019-04-11', '2019-04-11'),
    ('defeated', '2019-04-11', '2019-05-18', '2019-05-18'),
    ('resigned', '2019-05-18', '2019-04-11', None),
    ('retired', '2019-05-18', '2019-04-10', None),
])
def test_event_convention_and_unexplained_disagreements_hold_the_whole_row(tmp_path, event, a, b, expected):
    path, bundle, signals, member = source_fixture(tmp_path)
    term = bundle['terms'][0]
    term.update(end=a, end_precision='day', end_reason=event)
    _, primary = write_service_evidence(tmp_path, bundle)
    primary['ServiceHistory_End'] = b
    write_service_evidence(tmp_path, bundle, primary=primary)
    path.write_text(json.dumps(bundle))
    row = raw_member_corrections(signals, {'99500': member}, tmp_path)[0]
    review = row['endpoint_review']['left_house']
    assert (review['source_a'], review['source_b'], review['convention_value']) == (a, b, expected)
    if expected:
        assert row['corrections']['left_house']['after'] == expected
    else:
        assert row['disposition'] == 'held-unresolved-service-source'
        assert not row['corrections']  # Also withhold the otherwise agreeing start.


def test_by_election_polling_day_and_missing_or_current_primary_endpoints(tmp_path):
    path, bundle, signals, member = source_fixture(tmp_path)
    term = bundle['terms'][0]
    term.update(start='2018-11-05', start_reason='by_election')
    _, primary = write_service_evidence(tmp_path, bundle)
    primary['ServiceHistory_Start'] = '2018-10-20'
    write_service_evidence(tmp_path, bundle, primary=primary)
    path.write_text(json.dumps(bundle))
    row = raw_member_corrections(signals, {'99500': member}, tmp_path)[0]
    assert row['corrections']['entered_house']['after'] == '2018-10-20'
    for changes in [dict(InCurrentParliament='True'), dict(MPorSenator=['Member', 'Senator'])]:
        term.update(end='2019-05-18', end_precision='day', end_reason='defeated')
        write_service_evidence(tmp_path, bundle, primary=dict(primary, ServiceHistory_End='2019-05-18', **changes))
        path.write_text(json.dumps(bundle))
        assert not raw_member_corrections(signals, {'99500': member}, tmp_path)[0]['corrections']
    (tmp_path / 'scripts/representatives.csv').write_text('unreviewed refresh')
    with pytest.raises(ValueError, match='Unreviewed service source'):
        raw_member_corrections(signals, {'99500': member}, tmp_path)


def test_committed_review_accounts_for_every_original_signal_and_interval():
    path = ROOT / 'docs/reports/2026-11-14-roster-provenance-findings.json'
    report = json.loads(path.read_text())
    assert len(report['intervals']) == 327
    assert sum(v['before'] for v in report['interval_counts'].values()) == 327
    assert len(report['raw_members']) == sum(b['rows'] for b in report['raw_buckets']) == 2002
    findings = json.loads((ROOT / 'docs/reports/2026-11-14-roster-period-cache-findings.json').read_text())
    assert {p['person_id'] for p in report['raw_members']} == {p['person_id'] for p in findings['raw_member_signals']}
    assert report['raw_reason_counts'] == dict(Counter(r for p in findings['raw_member_signals'] for r in p['reasons']))
    members = {p['person_id']: dict(full_name=p['name'], entered_house=p['start'], left_house=p['end'])
               for p in findings['raw_member_signals']}
    assert raw_member_corrections(findings['raw_member_signals'], members) == report['raw_members']
    assert all(report[k] == v for k, v in raw_summary(report['raw_members']).items())
    assert len(report['primary_endpoint_conflicts']) == 60
    assert report['primary_endpoint_conflict_counts'] == {
        'normalised-polling-start': 2, 'normalised-retirement-dissolution': 54,
        'normalised-defeat-polling': 1, 'held-unresolved-service-source': 1,
        'held-multiple-complete-career-rows': 2,
    }
    by_id = {r['person_id']: r for r in report['raw_members']}
    assert by_id['10913']['corrections']['entered_house']['after'] == '2018-10-20'
    assert by_id['10858']['corrections']['left_house']['after'] == '2025-03-28'
    assert not by_id['10351']['corrections']
    assert [t['start'] for t in by_id['10351']['complete_source_career']] == ['1975-12-13', '1984-12-01']
    assert not by_id['10869']['corrections']
    for row in report['raw_members']:
        if row['disposition'].startswith('held-'):
            assert not row['corrections']
        if row['corrections']:
            assert len(row['complete_source_career']) == 1
            assert row['handbook_career']['MPorSenator'] == ['Member']
            for field, change in row['corrections'].items():
                review = row['endpoint_review'][field]
                assert not review['decision'].startswith('held-')
                assert change['after'] == review['convention_value']
    data = inventory()
    # There are no additional accepted/reviewed/shipped service or affiliation
    # intervals for this accepted raw cohort. New ones require career review.
    corrected = {'pid:' + r['person_id'] for r in report['raw_members'] if r['corrections']}
    assert not [p for p in data['periods'] if p['actor'] in corrected and not p['kind'].startswith('catalog-')]
    matcher = StrictMatcher(data['identities'])
    periods = {p['key']: p for p in data['periods']}
    for period in report['intervals']:
        assert all(period[k] == periods[period['key']][k] for k in ('actor', 'chamber', 'start', 'end'))
        bound = period['corpus_bound']
        assert (period['status'] == 'matched') == bool(bound)
        if bound:
            assert bound['actor'] == period['actor'] and bound['chamber'] == period['chamber']
            assert period['start'] <= bound['date'] <= (period['end'] or '9999-12-31')
            assert bound['record_id'] is not None
            assert matcher.match(bound)[0] == period['actor']


def test_scratch_corrections_roll_back_if_any_old_value_changed():
    db = sqlite3.connect(':memory:')
    db.execute('CREATE TABLE members(person_id PRIMARY KEY,chamber,entered_house,left_house)')
    db.executemany('INSERT INTO members VALUES(?,?,?,?)', [('1', 'senate', '2000-01-01', None),
                                                        ('2', 'senate', '2001-01-01', None)])
    db.commit()
    def correction(pid, before, after):
        return dict(person_id=pid, house='senate', corrections=dict(entered_house=dict(before=before, after=after)))
    rows = [correction('1', '2000-01-01', '1999-01-01'), correction('2', 'wrong', '1998-01-01')]
    with pytest.raises(ValueError, match='no longer matches'):
        apply_raw_corrections(db, rows)
    assert db.execute('SELECT entered_house FROM members WHERE person_id="1"').fetchone()[0] == '2000-01-01'
    rows[1]['corrections']['entered_house']['before'] = '2001-01-01'
    assert apply_raw_corrections(db, rows) == dict(corrected_rows=2, corrected_fields=2)
