"""A refresh date cannot silently replace a member's evidenced own-house service."""
import json
from pathlib import Path

from scripts.audit_roster_periods import inventory, late_starts

ROOT = Path(__file__).resolve().parents[1]


def test_no_roster_period_starts_after_earliest_own_house_record_without_a_documented_exception():
    data = inventory()
    bounds = json.loads((ROOT / 'scripts/roster_corpus_bounds.json').read_text())['bounds']
    review = json.loads((ROOT / 'scripts/roster_period_exceptions.json').read_text())
    exceptions = review['exceptions']
    late = {p['key']: p for p in late_starts(data['periods'], bounds)}
    allowed = {p['key']: p for p in exceptions}
    assert len(allowed) == len(exceptions), 'duplicate exception keys'
    assert late.keys() == allowed.keys(), {'undocumented': sorted(late.keys() - allowed.keys()),
                                          'stale_exceptions': sorted(allowed.keys() - late.keys())}
    periods = {p['key']: p for p in data['periods']}
    for key, period in late.items():
        exception = allowed[key]
        assert all(exception[k] == period[k] for k in ('actor', 'chamber', 'start', 'end'))
        assert exception['earliest_date'] == period['earliest']['date']
        assert exception['note'] and exception['source_url']
        assert exception['reason'] in ('later-period', 'known-corpus-namesake')
        if exception['reason'] == 'later-period':
            earlier = periods[exception['earlier_period']]
            assert (earlier['actor'], earlier['chamber']) == (period['actor'], period['chamber'])
            assert earlier['start'] <= period['earliest']['date']
            assert earlier['end'] is None or earlier['end'] >= period['earliest']['date']
    # Missing evidence is explicit coverage debt, never an implicit passing comparison.
    known = {(b['actor'], b['chamber']) for b in bounds}
    missing = {p['key']: p for p in data['periods'] if (p['actor'], p['chamber']) not in known}
    documented = {p['key']: p for p in review['unmatched_periods']}
    assert missing.keys() == documented.keys()
    for key, period in missing.items():
        exception = documented[key]
        assert all(exception[k] == period[k] for k in ('actor', 'chamber', 'start', 'end'))
        assert exception['note'] and exception['source_url']


def test_a_speech_or_vote_in_another_house_cannot_backdate_a_period():
    periods = [dict(key='example', actor='same-person', chamber='sa_lc', start='2023-03-07', end=None)]
    bounds = [dict(actor='same-person', chamber='senate', date='2006-05-09'),
              dict(actor='same-person', chamber='sa_lc', date='2023-05-03')]
    assert late_starts(periods, bounds) == []
    periods[0]['start'] = '2026-11-13'
    late, = late_starts(periods, bounds)
    assert late['earliest']['date'] == '2023-05-03'
    assert late['earliest']['chamber'] == 'sa_lc'


def test_every_installed_official_list_service_has_a_reviewed_term_source():
    """An observation alone gives no start, even when no earlier corpus record is held yet."""
    accept = json.loads((ROOT / 'scripts/roster_accept.json').read_text())
    for name, entry in accept['new'].items():
        if accept['evidence'][entry['evidence']].get('rule') == 'official-list-member':
            assert entry.get('term_start'), name
            assert entry['service']['start'] == entry['term_start']['start']
            assert entry['term_start']['url'].startswith('https://')
            assert entry['term_start']['note'] and entry['term_start']['checked']


def test_hoods_primary_start_precedes_his_exact_print_without_borrowing_dennis_hood():
    bounds = json.loads((ROOT / 'scripts/roster_corpus_bounds.json').read_text())['bounds']
    hood, = [b for b in bounds if b['actor'] == 'name:benjamin hood' and b['chamber'] == 'sa_lc']
    assert hood['date'] == '2023-05-03' and hood['printed_name'] == 'The Hon. B.R. HOOD'
    assert hood['record_id'] == 1193228
    accept = json.loads((ROOT / 'scripts/roster_accept.json').read_text())
    assert accept['new']['Benjamin Hood']['service']['start'] == '2023-03-07' <= hood['date']


def test_reviewed_dated_house_identities_hold_their_own_corpus_bounds():
    """Row 179's resolved Dickson and Cunningham records bound their own member, not the namesake's id."""
    bounds = {(b['actor'], b['chamber']): b for b in
              json.loads((ROOT / 'scripts/roster_corpus_bounds.json').read_text())['bounds']}
    review = json.loads((ROOT / 'scripts/roster_period_exceptions.json').read_text())
    dickson = bounds[('pid:person_efb744ffb3a25d578e592281', 'representatives')]
    assert (dickson['date'], dickson['record_id']) == ('1998-03-02', 5)
    assert bounds[('pid:person_9c02d321caef54b2ba21a1f8', 'representatives')]['record_id'] == 73570
    # The Casey and Fiona Martin ids keep no Dickson or Cunningham record, so no namesake allowance remains.
    assert bounds[('pid:10592', 'representatives')]['date'] > '1998-10-03'
    assert bounds[('pid:10937', 'representatives')]['date'] > '2002-08-16'
    assert not [e for e in review['exceptions'] if e['reason'] == 'known-corpus-namesake'
                and e['actor'] in ('pid:10592', 'pid:10937')]
