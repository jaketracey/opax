import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from scripts.publish_grants_research import resource
from scripts.reconcile_roster_profiles import apply, inventory, owned, plan
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
