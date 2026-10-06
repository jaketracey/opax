"""No clean record may drift from the immutable main export."""
import copy
import hashlib
import json
import unittest
from pathlib import Path

from scripts import audit_roster_changes as audit
from scripts import enrich_profile_jurisdictions as profiles
from scripts.publish_grants_research import records
from scripts.reconcile_roster_profiles import plan

ROOT=Path(__file__).resolve().parents[1]


class MainPreservationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.main=json.loads((ROOT/'tests/fixtures/roster-export/main-66e75d74.json').read_text())['people']
        cls.shipped=json.loads((profiles.PUBLIC/'parliamentarians.json').read_text())['people']
        cls.reference=profiles.pinned_reference()
        cls.reviewed=json.loads(profiles.REVIEWED.read_text())
        cls.old={p['name']:p for p in cls.main};cls.new={p['name']:p for p in cls.shipped}

    def test_every_changed_record_has_evidence_and_all_clean_records_are_exact_main(self):
        result=audit.audit(self.main,self.shipped,self.reference,self.reviewed)
        self.assertEqual(result['counts']['clean record changed'],0)
        self.assertEqual(result['counts'],{'witness split':16,'mix-up corrected':17,'witness-dominated':115,
                                         'spans parliaments':108,'alias normalisation':11,'clean record changed':0})
        changed={r['name'] for r in result['changes']}
        for name in self.old.keys()-changed:self.assertEqual(self.new[name],self.old[name],name)

    def test_clean_sa_and_historical_state_records_keep_every_field(self):
        for name in ['Malinauskas','P.B. Malinauskas','V.A. Chapman','S.S. Marshall','A. Koutsantonis',
                     'Picton','C.J. Picton','K.J. Maher','R.I. Lucas','S.G. Wade','C.M. Scriven',
                     'Ros Spence','Fowles','Fregon','Settle','Macklin','Hockey','Ripoll','Tollner',
                     'Cupper','Halse','Brayne','Greenwich','McGirr']:
            with self.subTest(name=name):self.assertEqual(self.new[name],self.old[name])

    def test_all_seventeen_state_federal_committee_collisions_are_neutral(self):
        for name in ['Paterson','Roberts','Watt','Walsh','Pratt','Hanson','McBride','Gee','Kennedy',
                     'Green','Berry','Wells','Watts','Lim','T Smith','Bates','Perrett']:
            with self.subTest(name=name):
                p=self.new[name]
                for field in ['pid','full','party','parties','party_now','current']:self.assertNotIn(field,p)
                self.assertEqual(p['representation'],[])

    def test_shoebridge_consistent_career_preserves_main_exactly_without_enrichment(self):
        p=copy.deepcopy(self.old['Shoebridge'])
        self.assertEqual(profiles.repair([p],self.reference,self.reviewed),[])
        self.assertEqual(p,self.old['Shoebridge'])
        self.assertEqual(self.new['Shoebridge'],p)
        self.assertEqual(p['party'],'Greens')
        self.assertNotIn('full',p)
        self.assertEqual(p['representation'],[])

    def test_reviewed_same_person_cannot_override_contradictions_or_witnesses(self):
        records=profiles.dated_records(self.reference,self.reviewed)
        p=copy.deepcopy(self.old['Shoebridge'])
        self.assertTrue(profiles.consistent_career(p,records,self.reference,self.reviewed))
        contrary=dict(name='Casey Shoebridge',identity='other',jurisdiction='federal',
                      chamber='senate',start='2022',end=None,party='Greens')
        for row,evidence,peers in [
            (p,[*records,contrary],()),
            (dict(p,party='Labor'),records,()),
            (dict(p,witness_rows=1),records,()),
            (dict(p,full='Casey Shoebridge'),records,()),
            (p,records,[dict(p,name='Casey Shoebridge')]),
            (dict(p,states=['federal'],chambers=['senate_committee']),records,()),
        ]:
            with self.subTest(row=row,evidence=contrary in evidence,peers=bool(peers)):
                self.assertEqual(profiles.consistent_career(row,evidence,self.reference,self.reviewed,peers),[])

    def test_only_shoebridge_gets_the_reviewed_same_person_exception(self):
        records=profiles.dated_records(self.reference,self.reviewed)
        names=[p['name'] for p in self.main if
               profiles.consistent_career(p,records,self.reference,self.reviewed)]
        self.assertEqual(names,['Shoebridge'])

    def test_shoebridge_party_restoration_does_not_change_kb_resources(self):
        before=copy.deepcopy(self.shipped)
        row=next(p for p in before if p['name']=='Shoebridge')
        row['recorded_parties']=[row.pop('party')]
        research=json.loads((profiles.PUBLIC/'research/mlci.json').read_text())
        self.assertEqual(list(records(research,{'people':before})),
                         list(records(research,{'people':self.shipped})))

    def test_transcript_counts_scopes_dates_and_verified_numeric_ids_are_unchanged(self):
        for name,p in self.old.items():
            q=self.new[name]
            for field in ['name','speeches','states','chambers','first','last','witness_rows','pid']:
                preserved = q.get('transcript', q) if field not in ('name','pid') else q
                self.assertEqual(p.get(field),preserved.get(field),(name,field))
            if q.get('separated_witnesses'):
                self.assertEqual(q['speeches']+q['separated_witnesses']['speeches'],p['speeches'])

    def test_missing_positive_evidence_and_undated_new_seat_do_not_change_clean_record(self):
        p=dict(name='Unknown',full='Alex Unknown',party='Labor',speeches=12,states=['sa'],
               chambers=['sa_ha'],first=2020,last=2021,representation=[dict(jurisdiction='sa',
               chamber='sa_ha',electorate='Old Seat',basis='Existing historical seat')])
        before=copy.deepcopy(p)
        self.assertEqual(profiles.repair([p],{},{}),[])
        self.assertEqual(p,before)
        ref=dict(people=[dict(person_id='one',name='Alex Unknown')],electorates=[dict(electorate_id='seat',
                 jurisdiction='sa',chamber='sa_ha',name='New Seat')],rosters=[dict(electorate_id='seat',
                 members=[dict(person_id='one',party='Liberal')])])
        self.assertEqual(profiles.repair([p],ref,{}),[])
        self.assertEqual(p,before)

    def test_committees_contradict_a_state_candidate_but_never_establish_it(self):
        p=dict(name='Smith',speeches=12,states=['sa','federal'],chambers=['sa_ha','senate_committee'],first=2020,last=2022)
        state=dict(name='Alex Smith',identity='state',jurisdiction='sa',chamber='sa_ha',start='2020-01-01',end='2022-12-31')
        federal=dict(state,name='Casey Smith',identity='federal',jurisdiction='federal',chamber='representatives')
        self.assertEqual(profiles.print_identity(p,[state,federal],{}),[])
        self.assertEqual(profiles.print_identity(p,[federal],{}),[])
        # A different era cannot contradict this dated state member.
        self.assertEqual(profiles.print_identity(p,[state,dict(federal,end='2019-12-31')],{}),[state])

    def test_audit_rejects_unrelated_field_changes_in_a_clean_record(self):
        p=self.old['Malinauskas'];q=dict(p,full='Invented Name')
        result=audit.audit([p],[q],self.reference,self.reviewed)
        self.assertEqual(result['counts']['clean record changed'],1)

    def test_a_bad_alias_cannot_hide_evidence_of_two_parliamentarians(self):
        p=dict(name='Smith',full='Sm Smith',party='Labor',speeches=12,states=['sa'],
               chambers=['sa_ha'],first=2020,last=2022,representation=[])
        ref=dict(people=[dict(person_id=i,name=n) for i,n in [('one','Alex Smith'),('two','Casey Smith')]],
                 electorates=[dict(electorate_id='seat',jurisdiction='sa',chamber='sa_ha',name='First Seat')],
                 terms=[dict(person_id=i,electorate_id='seat',start='2020-01-01',end='2022-12-31') for i in ['one','two']])
        profiles.repair([p],ref,{})
        self.assertNotIn('party',p)
        self.assertNotIn('full',p)

    def test_correct_sa_seat_profiles_remain_desired_and_are_never_retired(self):
        desired=[r for r in records(json.loads((profiles.PUBLIC/'research/mlci.json').read_text()),{'people':self.shipped})
                 if r['slug'].startswith('roster-profile-')]
        wanted={r['slug']:r for r in desired}
        # Public fields from the main source are the live derived profile facts.
        previous=[r for r in records(json.loads((profiles.PUBLIC/'research/mlci.json').read_text()),{'people':self.main})
                  if r['slug'].startswith('roster-profile-')]
        ops={op['slug']:op for op in plan(desired,previous)}
        for name,seat in [('L.W.K. Bignell','Mawson'),('S.J.R. Patterson','Morphett'),
                          ('J.A.W. Gardner','Morialta'),('D.K.B. Basham','Finniss')]:
            slug='roster-profile-'+hashlib.sha256(name.encode()).hexdigest()[:16]
            self.assertIn(slug,wanted)
            self.assertIn(seat,wanted[slug]['texts']['t-body']['body'])
            self.assertNotEqual(ops.get(slug,{}).get('action'),'retire')


if __name__=='__main__':unittest.main()
