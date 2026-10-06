import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from scripts.publish_grants_research import resource
from scripts.reconcile_roster_profiles import apply, check_change_limit, fingerprint, inventory, owned, plan, projection
from parli.arag import AragError


def profile(token,body):
    return resource('roster-profile-'+token*16,token+' profile',body,'https://opax.com.au/subject/person/'+token,
                    '2026-09-09','parliamentary_profile','opax_parliamentary_roster',{'representation':[]})


class FakeKB:
    def __init__(self,rows):
        self.rows={r['slug']:copy.deepcopy(r) for r in rows};self.writes=[]
    def get_resource_by_slug(self,slug,**kwargs):
        if slug not in self.rows:raise AragError(404,'fixture','not found')
        return copy.deepcopy(self.rows[slug])
    def delete_resource_by_slug(self,slug):
        self.writes.append(('delete',slug));del self.rows[slug]
    def create_resource(self,row):
        self.writes.append(('create',row['slug']));self.rows[row['slug']]=copy.deepcopy(row)


class ReconcileTests(unittest.TestCase):
    def test_native_response_label_bookkeeping_matches_source_pairs_and_readback(self):
        native=json.loads((Path(__file__).parent/'fixtures/roster-reconcile/native-label-shape.json').read_text())
        desired=copy.deepcopy(native)
        desired['texts']={k:v['value'] for k,v in desired.pop('data')['texts'].items()}
        for c in desired['usermetadata']['classifications']:c.pop('cancelled_by_user')
        self.assertTrue(owned(native))
        self.assertEqual(projection(native),projection(desired))
        self.assertEqual(fingerprint(native),fingerprint(desired))
        self.assertEqual(plan([desired],[native]),[])
        cancelled=copy.deepcopy(native)
        source=next(c for c in cancelled['usermetadata']['classifications'] if c['labelset']=='source')
        source['cancelled_by_user']=True
        self.assertFalse(owned(cancelled))
        self.assertNotEqual(projection(cancelled),projection(desired))
        desired['texts']['t-body']['body']='Corrected Paterson source body'
        class NativeShapeKB(FakeKB):
            def create_resource(self,row):
                super().create_resource(row)
                r=self.rows[row['slug']]
                r['data']={'texts':{k:{'value':v} for k,v in r.pop('texts').items()}}
                for c in r['usermetadata']['classifications']:c['cancelled_by_user']=False
        kb=NativeShapeKB([native])
        with tempfile.TemporaryDirectory() as folder:
            self.assertEqual(apply(kb,plan([desired],[native]),[desired],folder)[0]['verified'],True)
        self.assertEqual(plan([desired],list(kb.rows.values())),[])

    def test_combined_apply_cap_aborts_before_reads_or_writes_and_accepts_the_boundary(self):
        old=[];desired=[]
        for i in range(31):
            row=profile('a','old');row['slug']=f'roster-profile-{i:016x}';old.append(row)
            if i<16:
                new=copy.deepcopy(row);new['texts']['t-body']['body']='new';desired.append(new)
        operations=plan(desired,old)
        class NoReadsKB(FakeKB):
            def get_resource_by_slug(self,*a,**kw):raise AssertionError('Cap must abort before preflight')
        kb=NoReadsKB(old)
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError,'31.*30'):apply(kb,operations,desired,folder)
            self.assertEqual(list(Path(folder).iterdir()),[])
        self.assertEqual(kb.writes,[])
        check_change_limit(operations[:30])
        # Creates do not consume the destructive-change cap.
        check_change_limit([{'action':'create'}]*100)

    def test_apply_cli_requires_the_explicit_dedicated_switch(self):
        import os
        root=Path(__file__).resolve().parents[1]
        env=dict(os.environ,OPAX_ROSTER_SYNC_KB='0')
        with tempfile.TemporaryDirectory() as folder:
            r=subprocess.run([sys.executable,str(root/'scripts/reconcile_roster_profiles.py'),'--apply',
                '--backup',folder,'--output',str(Path(folder)/'plan.json')],env=env,capture_output=True,text=True)
            self.assertNotEqual(r.returncode,0)
            self.assertIn('explicit OPAX_ROSTER_SYNC_KB=1',r.stderr)
            self.assertEqual(list(Path(folder).iterdir()),[])

    def test_reviewed_slug_batch_selects_exactly_the_requested_operations(self):
        root=Path(__file__).resolve().parents[1]
        from scripts.publish_grants_research import records
        old=[r for r in records(json.loads((root/'portal/public/research/mlci.json').read_text()),
                              json.loads((root/'portal/public/parliamentarians.json').read_text()))
             if r['slug'].startswith('roster-profile-')]
        for row in old[:2]:row['texts']['t-body']['body']='stale source'
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder);(path/'inventory.json').write_text(json.dumps(old))
            (path/'slugs.json').write_text(json.dumps([old[1]['slug']]))
            r=subprocess.run([sys.executable,str(root/'scripts/reconcile_roster_profiles.py'),
                '--inventory',str(path/'inventory.json'),'--slugs',str(path/'slugs.json'),
                '--output',str(path/'plan.json')],capture_output=True,text=True)
            self.assertEqual(r.returncode,0,r.stderr)
            result=json.loads((path/'plan.json').read_text())
            self.assertEqual([op['slug'] for op in result['operations']],[old[1]['slug']])
            self.assertEqual(result['retirements_and_replacements'],1)
            self.assertEqual(result['apply_cap'],30)

    def test_exact_plan_has_replacement_retirement_creation_and_no_unchanged_write(self):
        before=[profile('a','old wrong seat'),profile('b','orphan'),profile('c','unchanged')]
        desired=[profile('a','correct seat'),profile('c','unchanged'),profile('d','new')]
        ops=plan(desired,before)
        self.assertEqual([(o['action'],o['slug']) for o in ops],
                         [('replace',before[0]['slug']),('retire',before[1]['slug']),('create',desired[2]['slug'])])
        self.assertEqual(ops[0]['before']['body'],'old wrong seat')
        self.assertEqual(ops[0]['after']['body'],'correct seat')

    def test_apply_removes_old_generated_fields_backs_up_and_is_idempotent(self):
        old=profile('a','old wrong seat');old['texts']['da-summary-t-body']={'body':'old generated wrong seat'}
        orphan=profile('b','orphan');desired=[profile('a','correct seat')]
        kb=FakeKB([old,orphan]);ops=plan(desired,[old,orphan])
        with tempfile.TemporaryDirectory() as folder:
            receipt=apply(kb,ops,desired,folder)
            self.assertEqual(len(receipt),2)
            self.assertEqual(len(list(Path(folder).glob('roster-profile-*.json'))),2)
            self.assertNotIn('da-summary-t-body',kb.rows[old['slug']]['texts'])
            self.assertNotIn(orphan['slug'],kb.rows)
            self.assertEqual(plan(desired,list(kb.rows.values())),[])

    def test_source_identity_conflict_cannot_be_retired_or_replaced(self):
        old=profile('a','wrong');old['origin']['source_id']='another-publisher'
        self.assertFalse(owned(old))
        with self.assertRaisesRegex(ValueError,'Unowned'):plan([], [old])
        old=profile('a','wrong');old['usermetadata']['classifications']=[]
        with self.assertRaisesRegex(ValueError,'Unowned'):plan([], [old])

    def test_public_preview_compares_only_observable_labels_native_keeps_all(self):
        desired=profile('a','unchanged')
        desired['usermetadata']['classifications'] += [
            {'labelset':'state','label':'VIC'},{'labelset':'state','label':'Commonwealth'}]
        snapshot=copy.deepcopy(desired)
        snapshot['usermetadata']['classifications'].remove({'labelset':'state','label':'VIC'})
        snapshot['origin'].pop('source_id')
        snapshot['_public_snapshot']=True
        self.assertEqual(plan([desired],[snapshot],public=True),[])
        snapshot['texts']['t-body']['body']='wrong seat'
        self.assertEqual(plan([desired],[snapshot],public=True)[0]['action'],'replace')
        snapshot['texts']['t-body']['body']='unchanged'
        snapshot['origin']['source_id']=desired['origin']['source_id']
        self.assertEqual(plan([desired],[snapshot])[0]['action'],'replace')

    def test_concurrent_change_aborts_all_writes_during_preflight(self):
        before=[profile('a','old'),profile('b','orphan')];desired=[profile('a','new')]
        kb=FakeKB(before);ops=plan(desired,before)
        kb.rows[before[1]['slug']]['texts']['t-body']['body']='changed by another worker'
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(RuntimeError,'changed since plan'):apply(kb,ops,desired,folder)
        self.assertEqual(kb.writes,[])

    def test_readback_failure_is_not_recorded_as_verified(self):
        class BadKB(FakeKB):
            def create_resource(self,row):
                super().create_resource(row);self.rows[row['slug']]['texts']['t-body']['body']='wrong'
        before=[profile('a','old')];desired=[profile('a','new')];kb=BadKB(before)
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(RuntimeError,'read-back'):apply(kb,plan(desired,before),desired,folder)
            self.assertFalse((Path(folder)/'receipts.jsonl').exists())

    def test_offline_cli_default_is_read_only_and_outputs_exact_operations(self):
        root=Path(__file__).resolve().parents[1]
        data=json.loads((root/'portal/public/research/mlci.json').read_text())
        directory=json.loads((root/'portal/public/parliamentarians.json').read_text())
        from scripts.publish_grants_research import records
        old=[r for r in records(data,directory) if r['slug'].startswith('roster-profile-')]
        bob=next(r for r in old if r['title'].startswith('Bob Horne'))
        bob['texts']['t-body']['body']='Williamstown — stale Melissa seat'
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder);(path/'inventory.json').write_text(json.dumps(old))
            r=subprocess.run([sys.executable,str(root/'scripts/reconcile_roster_profiles.py'),
                '--inventory',str(path/'inventory.json'),'--output',str(path/'plan.json')],capture_output=True,text=True)
            self.assertEqual(r.returncode,0,r.stderr)
            result=json.loads((path/'plan.json').read_text())
            self.assertEqual(result['mode'],'dry-run')
            self.assertEqual(result['counts'],{'replace':1})
            self.assertEqual(result['operations'][0]['slug'],bob['slug'])
            self.assertEqual(sorted(p.name for p in path.iterdir()),['inventory.json','plan.json'])

    def test_repeated_catalog_page_fails_closed(self):
        class RepeatingKB(FakeKB):
            def catalog(self,**kw):return {'resources':{'id':profile('a','old')},'fulltext':{'next_page':True}}
        with self.assertRaisesRegex(RuntimeError,'pagination'):inventory(RepeatingKB([]))
