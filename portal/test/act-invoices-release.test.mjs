import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {publishBundle} from '../../scripts/act_invoices/publish_bundle.mjs';
import {prepareRelease,checkReleaseWorkflow,ACT_RELEASE_CONDITION} from '../../scripts/act_invoices/prepare_release.mjs';
import {PUBLISHED_FIELDS,PROVENANCE_FIELDS,verifyReleaseAsset,sha256,encodeRelease,validateSourceRelease} from '../../scripts/act_invoices/release-bundle.mjs';
import {actInvoicesSnapshot,decodeActInvoicesSnapshot} from '../../scripts/act_invoices/table-snapshot.mjs';
import {buildTableSQL} from '../../scripts/load_tables.mjs';
import {tableDatabase} from './table-d1-harness.mjs';
import {actBundle,actRow,actMetadata} from './act-invoices-fixture.mjs';

async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'opax-act-release-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'data/staged/act-invoices'),{recursive:true});await mkdir(join(root,'data/promoted/act-invoices'),{recursive:true});
 const bundle=actBundle(),review={status:'approved',reviewed_commit:bundle.promotion.reviewed_commit,inputs:bundle.promotion.inputs};
 const reviewBytes=Buffer.from(JSON.stringify(review)+'\n');await writeFile(join(root,'data/staged/act-invoices/review.json'),reviewBytes);
 await writeFile(join(root,'data/promoted/act-invoices/table.json'),JSON.stringify(bundle));
 const calls=[];const run=(...args)=>{calls.push(args);return {status:0};};
 const manifest=await publishBundle({root,run});const bytes=await readFile(join(root,'portal/private/act-invoices/release',manifest.asset_name));
 return {root,bundle,reviewBytes,manifest,bytes,calls,run};
}

test('P1: approved dry run packages only published fields and provenance; upload is opt-in',async t=>{
 const f=await fixture(t);assert.equal(f.manifest.mode,'dry-run');assert.equal(f.calls.length,0);assert.equal(f.manifest.public,true);assert.equal(f.manifest.repository,'jaketracey/opax');
 const {wire}=verifyReleaseAsset(f.bytes,f.manifest,f.reviewBytes);
 assert.match(wire.README,/verbatim mirror of the published records/);assert.match(wire.README,/Attribution: ACT Government/);assert.match(wire.README,/CC BY 4.0/);
 for(const line of wire.records_jsonl.trimEnd().split('\n')){
  const row=JSON.parse(line);assert.deepEqual(Object.keys(row),[...PUBLISHED_FIELDS,...PROVENANCE_FIELDS]);
  for(const key of ['amount','financial_year','month','payment_day','supplier_id','person_id','supplier_index'])assert.equal(Object.hasOwn(row,key),false);
  assert.equal(row.supplier_abn,'00000000000');assert.equal(row.payment_amount,'1250.50');
 }
 const decoded=decodeActInvoicesSnapshot(wire);assert.equal(decoded.rows[0].row.amount,1250.5);assert.equal(decoded.rows[0].row.financial_year,'2026-27');
 await publishBundle({root:f.root,run:f.run,upload:true});assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0][1].slice(0,2),['release','upload']);
 await assert.rejects(publishBundle({root:f.root,candidate:true,upload:true,run:f.run}),/cannot upload/);assert.equal(f.calls.length,1);
});

test('P1: good asset verifies size, gzip hash, raw hash and approved review before installation',async t=>{
 const f=await fixture(t);const result=await prepareRelease({root:f.root,reload:'on',download:async()=>f.bytes});assert.equal(result.status,'ready');
 const loaded=await actInvoicesSnapshot(join(f.root,'portal/public'));assert.equal(loaded.rows.length,2);assert.equal(loaded.metadata.promotion.reviewed_commit,f.bundle.promotion.reviewed_commit);
 assert.equal(loaded.rows[0].row.supplier_name,actRow().supplier_name);
});

test('P1: bad hash, wrong size and missing asset fail closed; a subsequent reload keeps existing rows',async t=>{
 const f=await fixture(t);const local=await tableDatabase({memorySQL:true,datasets:{'act-invoices':[{row:actRow()}]},metadata:{'act-invoices':actMetadata}});t.after(()=>local.close());
 for(const mode of ['hash','size','missing','review']){
  const m=structuredClone(f.manifest);if(mode==='hash')m.sha256='f'.repeat(64);if(mode==='size')m.bytes++;if(mode==='review')m.review.sha256='f'.repeat(64);
  await writeFile(join(f.root,'data/promoted/act-invoices/release.json'),JSON.stringify(m));await writeFile(join(f.root,'data/promoted/act-invoices/table.json'),JSON.stringify(f.bundle));
  const result=await prepareRelease({root:f.root,reload:'on',download:async()=>{if(mode==='missing')throw Error('missing asset');return f.bytes;}});assert.equal(result.status,'held',mode);
  const loaded=await actInvoicesSnapshot(join(f.root,'portal/public'));assert.equal(loaded.rows.length,0,mode);
  const output=join(f.root,'sql');const manifest=await buildTableSQL({output,datasets:{},metadata:{}});assert.deepEqual(manifest.retainedDatasets,['act-invoices']);
  for(const file of manifest.files)await local.db.exec(await readFile(join(output,file),'utf8'));
  assert.equal(await local.db.prepare('SELECT COUNT(*) AS n FROM table_act_invoices').first('n'),1,mode);
  assert.equal(await local.db.prepare("SELECT value FROM table_meta WHERE key='act-invoices'").first('value'),JSON.stringify(actMetadata),mode);
 }
 // Even a stale local file is excluded when the workflow reports a held input.
 await writeFile(join(f.root,'data/promoted/act-invoices/table.json'),JSON.stringify(f.bundle));
 assert.equal((await actInvoicesSnapshot(join(f.root,'portal/public'),{releaseStatus:'held'})).rows.length,0);
});

test('P1: a pending review or extra derived/index fields cannot become an approved release',async t=>{
 const f=await fixture(t);const {wire}=verifyReleaseAsset(f.bytes,f.manifest,f.reviewBytes);
 for(const alter of [w=>w.supplier_index=[],w=>w.provenance.supplier_index=[],w=>w.review.status='pending',w=>{const row=JSON.parse(w.records_jsonl.split('\n')[0]);row.amount=1250.5;w.records_jsonl=JSON.stringify(row)+'\n';w.review.records_sha256=sha256(w.records_jsonl);w.review.rows=1;w.provenance.rows=1;}]){
  const changed=structuredClone(wire);alter(changed);assert.throws(()=>validateSourceRelease(changed));
 }
 const pending=JSON.parse(f.reviewBytes);pending.status='pending';pending.reviewed_commit=null;await writeFile(join(f.root,'data/staged/act-invoices/review.json'),JSON.stringify(pending));
 await assert.rejects(publishBundle({root:f.root,run:f.run}));assert.equal(f.calls.length,0);
});

test('P1: actual workflow is guarded off and prepares the release before the SQL build',async t=>{
 const f=await fixture(t);let downloads=0;
 const result=await prepareRelease({root:f.root,reload:'off',download:async()=>{downloads++;return f.bytes;}});assert.equal(result.status,'skipped');assert.equal(downloads,0);
 const base=resolve(new URL('../../',import.meta.url).pathname);assert.equal((await checkReleaseWorkflow(base)).workflow,'valid');
 const py=spawnSync(join(base,'.venv/bin/python3'),['-c','import json,yaml; print(json.dumps(yaml.safe_load(open(".github/workflows/deploy.yml"))))'],{cwd:base,encoding:'utf8'});
 assert.equal(py.status,0,py.stderr);const steps=JSON.parse(py.stdout).jobs.deploy.steps;
 const index=steps.findIndex(s=>s.id==='act_invoice_asset'),step=steps[index];assert.equal('${{ '+step.if.replace(/^\$\{\{\s*|\s*\}\}$/g,'')+' }}',ACT_RELEASE_CONDITION);
 assert.equal(step['continue-on-error'],true);assert.ok(index<steps.findIndex(s=>s.id==='tables'));
 assert.match(steps.find(s=>s.id==='tables').env.OPAX_ACT_INVOICES_RELEASE_STATUS,/act_invoice_asset.outputs.status/);
 const condition=step.if.replace(/^\$\{\{\s*|\s*\}\}$/g,'').replaceAll('steps.duplicate.outputs.skip','"false"').replaceAll('steps.production.outcome','"success"').replaceAll('github.event_name','"workflow_dispatch"');
 assert.equal(Function('return '+condition.replaceAll('vars.OPAX_TABLE_RELOAD','"off"'))(),false);
 assert.equal(Function('return '+condition.replaceAll('vars.OPAX_TABLE_RELOAD','"on"'))(),true);
});
