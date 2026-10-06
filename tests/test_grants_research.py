import json
import unittest
from collections import Counter
from pathlib import Path
from scripts.enrich_profile_jurisdictions import enrich
from scripts.publish_grants_research import records
from scripts.queue_grants_enrichment import tasks

ROOT=Path(__file__).resolve().parents[1]

class GrantsResearchTests(unittest.TestCase):
    def test_only_split_profile_bodies_change_and_include_all_service_intervals(self):
        directory=json.loads((ROOT/'portal/public/parliamentarians.json').read_text())
        data=json.loads((ROOT/'portal/public/research/mlci.json').read_text())
        rows=iter(r for r in records(data,directory) if r['slug'].startswith('roster-profile-'))
        for p in directory['people']:
            if not p.get('representation'):continue
            row=next(rows)
            text=row['texts']['t-body']['body']
            if p.get('speech_scope'):
                self.assertNotIn('Matched by exact full name',text)
                self.assertIn('Surname print resolved',text)
                for term in p['speech_scope']['service']:
                    self.assertIn(term['start']+' to '+term['end'],text)
            else:self.assertIn('Matched by exact full name',text)

    def test_roster_join_rejects_wrong_jurisdiction_and_chamber(self):
        people=[{'name':'Alex Smith','states':['vic'],'chambers':['vic_la']}]
        members=[{'full_name':'Alex Smith','state':'federal','chamber':'representatives','electorate':'Indi'},
                 {'full_name':'Alex Smith','state':'vic','chamber':'vic_lc','electorate':'Eastern Victoria'},
                 {'full_name':'A Smith','state':'vic','chamber':'vic_la','electorate':'Richmond'}]
        self.assertEqual(enrich(people,members,[])[0]['representation'],[])

    def test_representation_does_not_copy_unreliable_service_dates(self):
        people=[{'name':'Alex Smith','states':['federal'],'chambers':['senate']}]
        member={'full_name':'Alex Smith','state':'federal','chamber':'senate','electorate':'ACT','entered_house':'1970-01-01','left_house':None}
        result=enrich(people,[member],[])[0]['representation'][0]
        self.assertEqual(result['electorate'],'Australian Capital Territory')
        self.assertNotIn('entered_house',result)
        self.assertEqual(result['jurisdiction'],'federal')

    def test_publication_preserves_stages_and_source_identity(self):
        data=json.loads((ROOT/'portal/public/research/mlci.json').read_text())
        directory=json.loads((ROOT/'portal/public/parliamentarians.json').read_text())
        rows=list(records(data,directory))
        # Reviewed, fixed totals: catches accidental publication loss or growth.
        self.assertEqual(len(rows),1445)
        self.assertEqual(len({r['slug'] for r in rows}),1445)
        self.assertEqual(sum(r['slug'].startswith('roster-profile-') for r in rows),977)
        for r in rows:
            self.assertTrue(r['origin']['url'].startswith('https://'))
            self.assertEqual(r['origin']['source_id'],'opax-grants-research')
        invitation=next(r for r in rows if r['slug']=='mlci-invitation-001')
        self.assertIn('not an award or payment',invitation['texts']['t-body']['body'])
        self.assertEqual(invitation['extra']['metadata']['stage'],'invitation')
        award=next(r for r in rows if r['slug']=='mlci-award-ga559327')
        self.assertIn('Closed Non-Competitive',award['texts']['t-body']['body'])
        self.assertEqual(award['extra']['metadata']['source_fields']['go_id'],'GO7867')
        note=next(r for r in rows if r['slug']=='research-cpi-mlci-2026')
        self.assertEqual(len(note['extra']['metadata']['comparison']),6)
        totals=next(r for r in rows if r['slug']=='research-mlci-program-2026')['extra']['metadata']['invitation_totals_by_state']
        self.assertEqual(sum(totals.values()),559241712)
        self.assertTrue(all('not the 2025 result' in r['texts']['t-body']['body'] for r in rows if r['slug'].startswith('aec-seat-')))

    def test_enrichment_queue_excludes_withdrawn_projects_and_known_affiliations(self):
        data=json.loads((ROOT/'portal/public/research/mlci.json').read_text())
        directory=json.loads((ROOT/'portal/public/parliamentarians.json').read_text())
        counts=Counter(kind for kind,_,_ in tasks(data,directory))
        self.assertEqual(counts,{'project_location':226,'invitation_award_match':89,
            'representation_review':723,
            'cpi_method_reconciliation':1})

if __name__=='__main__':unittest.main()
