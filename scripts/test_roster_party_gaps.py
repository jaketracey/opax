"""Full-name party joins and weekly preservation; invented identities only."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

from scripts import roster_accept
from scripts.roster_party_gaps import enrich, group_problem, proposal, read
from scripts.roster_source_profiles import enrich as source_profiles, reference

ROOT = Path(__file__).resolve().parents[1]


def person(**over):
    return dict(name='Alex Example', states=['nsw'], chambers=['nsw_la'], first=2019, last=2026, speeches=12, **over)


def source(**over):
    row = dict(name='Alex Example', identity='Q123', jurisdiction='nsw', chamber='nsw_la', electorate='Exampleton',
               start='2019-03-23', end=None, as_of='2026-09-21', source_url='https://www.wikidata.org/wiki/Q123',
               basis='Wikidata P39 service with P4100 parliamentary group', undated=[],
               periods=[dict(party='Example Party', start='2019-03-23', end=None, through='2026-09-21')])
    row.update(over)
    return row


class PartyJoins(unittest.TestCase):
    def test_full_name_house_and_dated_service_are_all_required(self):
        row = person()
        self.assertEqual(proposal(row, {'people': [source()]})['party'], 'Example Party')
        for patch in [dict(name='Example'), dict(name='T Example'), dict(name='Taylor Example'),
                      dict(states=['vic']), dict(chambers=['nsw_lc']), dict(first=2000, last=2001)]:
            candidate = {**row, **patch}
            self.assertIsNone(proposal(candidate, {'people': [source()]}), patch)
        self.assertIsNone(proposal({**row,'pid':'99999'},{'people':[source(pid='12345')]}))

    def test_same_name_with_two_identities_or_conflicting_parties_is_held(self):
        a, b = source(), source(identity='Q124')
        self.assertIsNone(proposal(person(), {'people':[a,b]}))
        b = source(periods=[dict(party='Other Party',start='2020-01-01',end=None,through='2026-09-21')])
        self.assertIsNone(proposal(person(), {'people':[a,b]}))

    def test_initials_and_katter_print_never_select_a_namesake(self):
        sources=[source(name='Taylor Smith'),source(name='Terry Smith',identity='Q124'),source(name='Avery Katter',identity='Q125')]
        for name in ['T Smith','Katter']:
            self.assertIsNone(proposal({**person(),'name':name},{'people':sources}))

    def test_dated_switch_preserves_history_and_leads_with_latest_party(self):
        periods=[dict(party='First Party',start='2019-03-23',end='2023-03-24',through='2026-09-21'),
                 dict(party='Second Party',start='2023-03-25',end=None,through='2026-09-21')]
        values=proposal(person(),{'people':[source(periods=periods)]})
        self.assertEqual(values['party'],'Second Party')
        self.assertEqual(values['parties'],['Second Party','First Party'])
        self.assertEqual([p['party'] for p in values['affiliations']],['First Party','Second Party'])

    def test_partial_party_stays_dated_without_flat_fallback(self):
        s = source(periods=[dict(party='Example Party',start='2023-03-25',end=None,through='2026-09-21')])
        values = proposal(person(), {'people':[s]})
        self.assertNotIn('party', values)
        self.assertEqual(values['affiliations'][0]['start'],'2023-03-25')
        self.assertNotIn('party', proposal({**person(), 'chambers':['nsw_la','nsw_lc']}, {'people':[source()]}))

    def test_undated_handbook_party_does_not_invent_periods(self):
        values = proposal(person(), {'people':[source(periods=[], undated=['Example Party'])]})
        self.assertEqual(values, {'party':'Example Party'})
        self.assertIsNone(proposal(person(), {'people':[source(periods=[],undated=[])]}))

    def test_witnesses_prints_and_curated_histories_stay_protected(self):
        for field in ['prints','speech_scope','identity_basis','witness_rows','separated_witnesses','affiliations','party_now','party']:
            self.assertIsNone(proposal({**person(), field:['protected']}, {'people':[source()]}),field)

    def test_acceptance_rechecks_source_and_rejects_unreviewed_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); (root/'scripts').mkdir()
            (root/'scripts/roster_party_evidence.json').write_text(json.dumps({'people':[source()]}))
            values=proposal(person(),{'people':[source()]})
            group={'url':source()['source_url'],'fields':{k:[None,v] for k,v in values.items()}}
            self.assertIsNone(group_problem(person()['name'],group,person(),root))
            group['fields']['party'][1]='Other Party'
            self.assertIsNotNone(group_problem(person()['name'],group,person(),root))
            group['fields']['pid']=[None,'12345']
            self.assertIsNotNone(group_problem(person()['name'],group,person(),root))

    def test_all_reviewed_joins_survive_source_profile_and_overlay_replay(self):
        shipped=json.loads((ROOT/'portal/public/parliamentarians.json').read_text())
        accept=roster_accept.load()
        groups={name:[g for g in entries if g['evidence']=='profile-party-service'] for name,entries in accept['records'].items()}
        groups={n:gs for n,gs in groups.items() if gs}
        self.assertEqual(len(groups),34)
        before=copy.deepcopy(shipped)
        for row in before['people']:
            for g in groups.get(row['name'],[]):
                for f,(old,_new) in g['fields'].items():
                    if old is None:row.pop(f,None)
                    else:row[f]=old
        fresh=source_profiles(before,accept,reference())
        from scripts.roster_overlay import overlay
        after,report=overlay(before,fresh,accept)
        self.assertEqual(after['people'],shipped['people'])
        self.assertEqual(report['accepted'],34)
        self.assertFalse(roster_accept.validate(accept,shipped['people']))
        # An unrelated mutation to an installed source-only identity is held.
        joined=next(n for n in groups if n in accept['new'])
        tampered=copy.deepcopy(shipped['people'])
        next(p for p in tampered if p['name']==joined)['speeches']+=1
        self.assertTrue(roster_accept.validate(accept,tampered))

    def test_source_join_survives_a_missing_sql_print_without_copying_identity(self):
        from scripts.roster_party_gaps import source_fields
        values=proposal(person(),{'people':[source()]})
        group={'evidence':'test-source','url':source()['source_url'],'fields':{k:[None,v] for k,v in values.items()}}
        accept={'evidence':{'test-source':{'rule':'profile-party-service'}},'records':{person()['name']:[group]}}
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'scripts').mkdir()
            (root/'scripts/roster_party_evidence.json').write_text(json.dumps({'people':[source()]}))
            result=source_fields({'people':[person()]},{'people':[]},accept,root)
            self.assertEqual(result['people'],[dict(name=person()['name'],**values)])
            self.assertNotIn('pid',result['people'][0])
            changed={'people':[{**person(),'party':'Conflicting Party'}]}
            self.assertEqual(source_fields({'people':[person()]},changed,accept,root),changed)

    def test_no_party_count_cannot_grow(self):
        people=json.loads((ROOT/'portal/public/parliamentarians.json').read_text())['people']
        self.assertEqual(len(people),1565)
        self.assertLessEqual(sum(not(p.get('party') or p.get('party_now')) for p in people),586)


if __name__=='__main__':
    unittest.main()
