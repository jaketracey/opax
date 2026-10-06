"""Regressions for contaminated member seats and parties, without a desktop DB."""
import copy
import json
import unittest

from scripts import enrich_profile_jurisdictions as profiles
from scripts import roster_identity as identity


def person(name, states, chambers, first=1998, last=2026, **extra):
    return dict(name=name, states=states, chambers=chambers, first=first, last=last,
                speeches=42, representation=[], **extra)


class PinnedServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reference = profiles.pinned_reference()
        cls.reviewed = json.loads(profiles.REVIEWED.read_text())

    def repair(self, rows):
        return profiles.repair(rows, self.reference, self.reviewed)

    def test_bob_and_melissa_keep_their_own_seats_and_parties_through_the_real_join(self):
        rows = [person('Bob Horne', ['federal'], ['representatives'], last=2001, party='Labor'),
                person('Melissa Horne', ['vic'], ['vic_la'], first=2022)]
        # Exact name and chamber alone accepted the poisoned member's electorate.
        members = [dict(full_name='Bob Horne', state='federal', chamber='representatives',
                        electorate='Williamstown – Minister for Ports and Freight'),
                   dict(full_name='Melissa Horne', state='vic', chamber='vic_la', electorate='Williamstown')]
        profiles.enrich(rows, members, [], self.reference, self.reviewed)
        bob, melissa = rows
        self.assertEqual([(r['electorate'], r['jurisdiction'], r['chamber']) for r in bob['representation']],
                         [('Paterson', 'federal', 'representatives')])
        self.assertEqual(bob['representation'][0]['state'], 'NSW')
        self.assertEqual(melissa['representation'][0]['electorate'], 'Williamstown')
        self.assertEqual(melissa['party'], 'Labor')
        self.assertNotIn('pid', bob)
        self.assertNotIn('current', bob)
        self.assertNotIn('Minister', json.dumps(bob))

    def test_mark_has_dated_careers_and_never_a_nsw_labor_affiliation(self):
        mark = person('Mark Latham', ['nsw', 'federal'], ['nsw_lc', 'representatives'], party='Labor')
        profiles.enrich([mark], [dict(full_name='Mark Latham', state='nsw', chamber='nsw_lc',
                                     electorate='Werriwa')], [], self.reference, self.reviewed)
        self.assertEqual(mark['party'], 'Independent')
        self.assertEqual(mark['party_now'], 'Independent')
        self.assertEqual(mark['parties'], ['Independent', 'One Nation'])
        self.assertEqual({(r['jurisdiction'], r['chamber'], r['electorate']) for r in mark['representation']},
                         {('nsw', 'nsw_lc', 'New South Wales'), ('federal', 'representatives', 'Werriwa')})
        self.assertEqual([(r['party'], r['start'], r['end']) for r in mark['affiliations'] if r['jurisdiction']=='federal'],
                         [('Labor', '1994-01-29', '2005-01-21')])
        self.assertEqual({r['party'] for r in mark['affiliations'] if r['jurisdiction']=='nsw'},
                         {'One Nation', 'Independent'})

    def test_no_future_party_or_other_chamber_is_inferred_from_dated_evidence(self):
        mark = person('Mark Latham', ['nsw'], ['nsw_lc'], 2019, 2022, party='Labor')
        self.repair([mark])
        self.assertEqual(mark['party'], 'One Nation')
        self.assertNotIn('party_now', mark)
        self.assertTrue(all(r['jurisdiction']=='nsw' for r in mark['affiliations']))
        early = person('Mark Latham', ['federal'], ['representatives'], 1998, 2004, party='Labor')
        self.repair([early])
        self.assertEqual(early['party'], 'Labor')
        self.assertNotIn('affiliations', early)

    def test_same_surname_seats_are_corrected_even_when_the_seat_looks_federal(self):
        rows = [person('David Kemp', ['federal'], ['representatives'], last=2004),
                person('Michael Lee', ['federal'], ['representatives'], last=2001)]
        for p, seat in zip(rows, ['Oxley', 'Parramatta']):
            p['representation'] = [dict(jurisdiction='federal', chamber='representatives', electorate=seat, state='NSW')]
        self.repair(rows)
        self.assertEqual([p['representation'][0]['electorate'] for p in rows], ['Goldstein', 'Dobell'])

    def test_chamber_changes_preserve_both_dated_terms_and_lead_with_the_latest(self):
        vol = person('Lynda Voltz', ['nsw'], ['nsw_lc', 'nsw_la'], 2015, 2026)
        vol['representation'] = [dict(jurisdiction='nsw', chamber='nsw_lc', electorate='Auburn', state='NSW')]
        self.repair([vol])
        self.assertEqual([(r['chamber'], r['electorate']) for r in vol['representation']],
                         [('nsw_la', 'Auburn'), ('nsw_lc', 'New South Wales')])
        self.assertEqual(vol['affiliations'][0]['end'], '2019-02-28')

    def test_old_seat_and_portfolio_labels_do_not_make_duplicate_or_imaginary_seats(self):
        ros = person('Ros Spence', ['vic'], ['vic_la'], 2023, 2026)
        ros['representation'] = [dict(jurisdiction='vic', chamber='vic_la', electorate=s, state='VIC')
                                 for s in ['Kalkallo', 'Yuroke']]
        stitt = person('Ingrid Stitt', ['vic'], ['vic_lc'], 2024, 2026)
        stitt['representation'] = [dict(jurisdiction='vic', chamber='vic_lc', state='VIC',
                                       electorate='Western Metropolitan – Minister for Mental Health')]
        self.repair([ros, stitt])
        self.assertEqual([r['electorate'] for r in ros['representation']], ['Kalkallo', 'Yuroke'])
        self.assertEqual([r['electorate'] for r in stitt['representation']], ['Western Metropolitan'])

    def test_pinned_repair_is_idempotent_and_the_whole_shipped_roster_passes(self):
        rows = json.loads((profiles.PUBLIC/'parliamentarians.json').read_text())['people']
        self.assertEqual(self.repair(copy.deepcopy(rows)), [])
        for p in rows:
            if identity.mixed_print(p):
                own = profiles.print_identity(p, profiles.dated_records(self.reference, self.reviewed), self.reference)
                if not own:
                    for field in ('pid', 'full', 'party', 'parties', 'current', 'party_now'):
                        self.assertNotIn(field, p, p['name'])
                    self.assertFalse(p.get('representation'), p['name'])

    def test_legitimate_spelling_changes_and_seat_moves_keep_their_records(self):
        rows = json.loads((profiles.PUBLIC/'parliamentarians.json').read_text())['people']
        people = {p['name']: p for p in rows}
        for name, seat in [('Chris Hayes', 'Fowler'), ('Mal Brough', 'Fisher'), ('Steve Georganas', 'Adelaide')]:
            with self.subTest(name=name):
                p = people[name]
                self.assertIn(seat, [r['electorate'] for r in p['representation']])
                # These pinned terms use different ids across an election or a spelling change.
                own = profiles.matching_records(p, profiles.dated_records(self.reference, self.reviewed), self.reviewed)
                self.assertGreater(len({r['identity'] for r in own}), 1)


class GeneralGuardTests(unittest.TestCase):
    def test_one_dated_candidate_keeps_identity_but_a_second_candidate_refuses_it(self):
        row=person('Smith',['vic','federal'],['vic_la','senate_committee'],2020,2022,
                   full='Alex Smith',party='Labor',witness_rows=1)
        records=[dict(name='Alex Smith',identity='one',jurisdiction='vic',chamber='vic_la',
                      electorate='First Seat',start='2020-01-01',end='2022-12-31',party='Labor')]
        self.assertEqual(profiles.print_identity(row,records,{}),records)
        identity.guard_print(row,resolved=True)
        self.assertEqual(row['full'],'Alex Smith')
        second=dict(records[0],name='Casey Smith',identity='two')
        self.assertEqual(profiles.print_identity(row,records+[second],{}),[])
        identity.guard_print(row)
        self.assertNotIn('full',row)
        self.assertNotIn('party',row)

    def test_sa_two_house_initials_keep_the_five_verified_names_and_parties(self):
        rows=json.loads((profiles.PUBLIC/'parliamentarians.json').read_text())['people']
        people={p['name']:p for p in rows}
        for name,full,party in [('K.J. Maher','Kyam Maher','Labor'),('R.I. Lucas','Rob Lucas','Liberal'),
            ('S.G. Wade','Stephen Wade','Liberal'),('C.M. Scriven','Clare Scriven','Labor'),
            ('J.M.A. Lensink','Michelle Lensink','Liberal')]:
            with self.subTest(name=name):
                p=people[name]
                self.assertFalse(identity.mixed_print(p))
                self.assertEqual((p['full'],p['party']),(full,party))
        self.assertEqual(people['J.M.A. Lensink']['representation'][0]['electorate'],'South Australia')

    def test_dated_election_aliases_preserve_verified_federal_nicknames(self):
        people={p['name']:p for p in json.loads((profiles.PUBLIC/'parliamentarians.json').read_text())['people']}
        for name,pid in [('Macklin','10409'),('Hockey','10306'),('Ripoll','10542')]:
            self.assertEqual(people[name]['pid'],pid)
            self.assertTrue(people[name]['full'])

    def test_bad_stub_aliases_never_become_given_names(self):
        from parli.ingest.link_speakers import normalize_state_speaker_name
        self.assertEqual(normalize_state_speaker_name('By STALEY','vic'),'Staley')
        self.assertEqual(normalize_state_speaker_name('SM FENTIMAN','qld'),'S.M. Fentiman')
        self.assertEqual(normalize_state_speaker_name('GJ BUTCHER','qld'),'G.J. Butcher')
        self.assertEqual(normalize_state_speaker_name('JO CLAY','act'),'Jo Clay')
        self.assertEqual(normalize_state_speaker_name('DI FARMER','qld'),'Di Farmer')
        for alias in ['By Staley','Sm Fentiman','Gj Butcher','Lm Enoch','Ml Furner','D.K.B. Basham']:
            self.assertFalse(identity.usable_alias(alias),alias)
        people={p['name']:p for p in json.loads((profiles.PUBLIC/'parliamentarians.json').read_text())['people']}
        for name,full in [('Staley','Louise Staley'),('Fentiman','Shannon Fentiman'),('Butcher','Glenn Butcher'),
            ('Enoch','Leeanne Enoch'),('Linard','Leanne Linard'),('Furner','Mark Furner'),
            ('Stoker','Amanda Stoker'),('Weir','Pat Weir'),('Basham','David Basham')]:
            self.assertEqual(people[name].get('full'),full,name)

    def test_new_full_name_print_can_contradict_an_older_roster_snapshot(self):
        row=person('Tudehope',['nsw'],['nsw_la','nsw_lc'],2025,2026,full='Monica Tudehope',party='Liberal')
        monica=person('Monica Tudehope',['nsw'],['nsw_la'],2025,2026)
        profiles.repair([row,monica],profiles.pinned_reference(),json.loads(profiles.REVIEWED.read_text()))
        self.assertNotIn('full',row)
        self.assertNotIn('party',row)

    def test_duplicate_member_stubs_do_not_duplicate_dated_service_seats(self):
        vol=person('Lynda Voltz',['nsw'],['nsw_lc','nsw_la'],2015,2026)
        member=dict(full_name='Lynda Voltz',state='nsw',chamber='nsw_la',electorate='Auburn')
        profiles.enrich([vol],[member,dict(member)],[],profiles.pinned_reference(),json.loads(profiles.REVIEWED.read_text()))
        self.assertEqual([(r['chamber'],r['electorate']) for r in vol['representation']],
                         [('nsw_la','Auburn'),('nsw_lc','New South Wales')])

    def test_mixed_print_keeps_transcript_scopes_counts_and_labels_without_a_person_join(self):
        for states, chambers, witness in [(['vic', 'federal'], ['vic_la', 'representatives'], 0),
                                          (['federal'], ['representatives', 'house_committee'], 2)]:
            with self.subTest(states=states, witness=witness):
                row = person('Horne', states, chambers, full='Melissa Horne', party='Labor',
                             parties=['Labor', 'Independent'], pid='wrong', current=True, witness_rows=witness)
                profiles.enrich([row], [dict(full_name='Horne', state=states[0], chamber=chambers[0], electorate='wrong')], [])
                self.assertEqual(row['speeches'], 42)
                self.assertEqual(row['states'], states)
                self.assertEqual(row['chambers'], chambers)
                self.assertEqual(row['recorded_parties'], ['Labor', 'Independent'])
                self.assertEqual(row['representation'], [])
                for field in ('full', 'pid', 'current', 'party', 'parties'):
                    self.assertNotIn(field, row)

    def test_state_fallback_needs_the_own_name_jurisdiction_chamber_and_dated_print(self):
        melissa = dict(name='Melissa Horne', state='vic', chamber='vic_la', start='2018-11-24', end=None)
        bob = person('Bob Horne', ['federal'], ['representatives'], last=2001)
        self.assertFalse(identity.state_member_matches(bob, melissa))
        horn = person('Horne', ['vic'], ['vic_la'], 2020, 2022)
        self.assertTrue(identity.state_member_matches(horn, melissa))
        self.assertTrue(identity.state_member_matches(horn, dict(melissa, start=None)))
        self.assertFalse(identity.state_member_matches(horn, dict(melissa, start='2023-01-01')))
        self.assertFalse(identity.state_member_matches(horn, dict(melissa, chamber='vic_lc')))

    def test_two_full_names_or_undated_records_cannot_supply_a_surname_join(self):
        row = person('Alex Smith', ['federal'], ['representatives'], 2020, 2022)
        rec = dict(name='Alex Smith', identity='one', jurisdiction='federal', chamber='representatives',
                   electorate='First Seat', start='2020-01-01', end='2022-01-01')
        self.assertEqual(profiles.matching_records(row, [rec, dict(rec, identity='two')], {}), [])
        self.assertEqual(profiles.matching_records(dict(row, name='Smith'), [rec], {}), [])
        self.assertEqual(profiles.matching_records(row, [dict(rec, start='2023-01-01')], {}), [])
        self.assertEqual(profiles.matching_records(row, [dict(rec, jurisdiction='vic')], {}), [])
        ref = dict(people=[dict(person_id='one', name='Alex Smith')], electorates=[dict(electorate_id='seat',
                   name='First Seat', jurisdiction='federal', chamber='representatives')],
                   terms=[dict(person_id='one', electorate_id='seat', start=None, end=None)])
        self.assertEqual(profiles.dated_records(ref, {}, state_evidence={}), [])

    def test_legacy_member_roster_is_not_an_independent_dated_authority(self):
        ref = dict(people=[dict(person_id='one', name='Alex Smith')], electorates=[dict(electorate_id='seat',
                   name='First Seat', jurisdiction='federal', chamber='representatives')],
                   sources=[dict(source_id='legacy', label='OPAX existing parliamentary person identifiers')],
                   rosters=[dict(as_of='2026-09-09', priority=100, electorate_id='seat',
                                 members=[dict(person_id='one', party='Labor')], sources=['legacy'])])
        self.assertEqual(profiles.dated_records(ref, {}, state_evidence={}), [])

    def test_same_full_name_in_overlapping_terms_is_not_one_person(self):
        row = person('Alex Smith', ['federal'], ['representatives'], 2020, 2022)
        row['representation'] = [dict(jurisdiction='federal', chamber='representatives', electorate='First Seat')]
        ref = dict(people=[dict(person_id=p, name='Alex Smith') for p in ('one', 'two')],
                   electorates=[dict(electorate_id='seat', name='First Seat', jurisdiction='federal', chamber='representatives')],
                   terms=[dict(person_id=p, electorate_id='seat', start='2020-01-01', end='2022-12-31') for p in ('one', 'two')])
        profiles.repair([row], ref, {})
        self.assertEqual(row['representation'], [])


if __name__ == '__main__':
    unittest.main()
