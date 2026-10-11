// Runtime data remains in memory; diagnostics contain only counts and timings.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {identityVariants,identityStripped,compileIdentityCheck} from '../src/table-identities.mjs';
import {identityHashEntry,compileHashedIdentityCheck,csvIdentityCheck} from '../src/table-identity-hashes.mjs';
import {tableRows} from '../../scripts/load_tables.mjs';
import {TABLE_DATASETS} from '../src/table-datasets.mjs';
import {sourceTableDonorIdentities} from '../../scripts/table_identity_source.mjs';
import {applyQuery,dataTableHTML,mountDataTable} from '../public/datatable.js';
import {tableHarness} from './datatable-harness.mjs';
const registry=JSON.parse(await readFile(new URL('../public/table-private-identities.json',import.meta.url),'utf8'));
const rowBlocked=compileHashedIdentityCheck(registry.identities,registry.strippedLengths,{mode:'row'}),queryBlocked=compileHashedIdentityCheck(registry.identities,registry.strippedLengths);
const c={id:'metadata-recovery',caption:'Organisations',privacy:'donors',privacyCheck:v=>!queryBlocked(v),privacyRowCheck:v=>!rowBlocked(v),columns:[{key:'name',label:'Organisation',type:'text',primary:true},{key:'category',label:'Category',type:'category',facet:'chips'},{key:'amount',label:'Amount',type:'money',facet:'range',bar:true}]};
test('row boundaries reject whole compact token runs and retain embedded organisation substrings',()=>{
  const identity='Fixture withheld identity',phrases=new Set(identityVariants(identity)),entries=[...phrases].map(identityHashEntry),lengths=[23];
  const query=compileHashedIdentityCheck(entries,lengths),row=compileHashedIdentityCheck(entries,lengths,{mode:'row'}),plain=compileIdentityCheck(phrases,{mode:'row'});
  for(const value of ['Fixturewithheldidentity','Fixture-withheld-identity','prefix Fixturewithheldidentity suffix','prefix Fixture withheldidentity suffix'])assert.ok(row(value)&&plain(value),'whole field or token run missed');
  for(const value of ['prefixFixturewithheldidentitysuffix','prefixFixture withheldidentitysuffix'])assert.ok(query(value)&&!row(value)&&!plain(value),'embedded substring overmatch');
  assert.equal(csvIdentityCheck('Fixturewithheld,identity',row),false,'CSV cell boundaries joined');
  assert.equal(csvIdentityCheck('"Fixturewithheldidentity"',row),true,'quoted CSV field missed');
  const collision=entries.map(e=>({...e,hash:'0'.repeat(64)}));assert.equal(compileHashedIdentityCheck(collision,lengths)(identity),false,'rolling collision was not confirmed by SHA-256');
});
test('discarded primary rows recompute totals, numeric facets and constant chips in SSR and hydration',async()=>{
  const privateName=sourceTableDonorIdentities().labels[0],bad={name:privateName,category:'Fixture discarded sector',amount:999999},good={name:'Fixture organisation Pty Ltd',category:'Fixture surviving sector',amount:1};
  for(const rows of [[bad],[good,bad]]){
    const supplied={rows,total:999,page:4,pageSize:50,facets:{category:[{value:bad.category,count:999}],amount:{min:999999,max:999999}}};
    const check=html=>{
      const page=JSON.parse(/<script type="application\/json" data-dt-page>(.*?)<\/script>/s.exec(html)[1]);
      assert.equal(page.total,rows.length-1);assert.equal(page.page,1);assert.equal(page.rows.length,rows.length-1);
      assert.ok(!html.includes(bad.category)&&!html.includes('999999'),'discarded metadata remained');
      if(rows.length===1){assert.equal(page.facets.amount,undefined);assert.ok(!html.includes('data-show-constant='),'empty constant chip');}
      else{assert.deepEqual(page.facets.amount,{min:1,max:1});assert.deepEqual(page.facets.category,[{value:good.category,count:1}]);}
    };
    check(dataTableHTML(c,supplied));const h=tableHarness();h.win.fetch=async()=>Response.json(supplied);
    const mounted=mountDataTable(h.root,{...c,source:{endpoint:'/__fixtures/table'}});
    for(let i=0;i<50&&h.root.getAttribute('aria-busy') === 'true';i++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(h.root.getAttribute('aria-busy') === 'true',false,'hydration did not settle');check(h.html());mounted.destroy();
  }
});
test('row approvals never authorise strict visitor queries',async()=>{
  const label=sourceTableDonorIdentities().labels.map(identityStripped).filter(v=>v.length>=6).map(v=>'Fixture prefix'+v+'suffix Pty Ltd').find(v=>queryBlocked(v)&&!rowBlocked(v));
  assert.ok(label,'no runtime boundary collision probe');
  const rows=[{name:label,category:'Fixture surviving sector',amount:1}];assert.equal(applyQuery(rows,c,{}).total,1);
  const h=tableHarness(),mounted=mountDataTable(h.root,{...c,rows});
  for(let i=0;i<50&&h.root.getAttribute('aria-busy')==='true';i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(h.html().includes('Showing 1–1 of 1'),'safe row missing');
  h.win.location.href='http://localhost/table?'+new URLSearchParams({q:label});h.win.dispatchEvent(new Event('popstate'));
  for(let i=0;i<50&&h.root.getAttribute('aria-busy')==='true';i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(h.html().includes('Showing 0–0 of 0')&&h.html().includes('data-export disabled'),'row approval escaped into queries');mounted.destroy();
});
test('real 9003-row and 50000-row CSV privacy validation stays below the Worker CPU budget',async t=>{
  const loaded=await tableRows(undefined,{moneyOnly:true}),columns=TABLE_DATASETS.contracts.columns,records=loaded.rows.contracts.filter(({row})=>!String(row.id).startsWith('aggregate:'));
  assert.ok(records.length>=50000,'insufficient real public export rows');
  const serialize=count=>[columns.map(c=>c.label).join(','),...records.slice(0,count).map(({row})=>columns.map(c=>'"'+String(row[c.key]??'').replaceAll('"','""')+'"').join(','))].join('\r\n');
  const bundle=await build({stdin:{contents:`import {tablePrivacy} from './src/table-privacy.ts'; const registry=${JSON.stringify(registry)}; const assets={fetch:async()=>Response.json(registry)}; export default {fetch(request){return tablePrivacy(request,assets)}};`,resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'node',external:['node:crypto']});
  const mf=new Miniflare(convertV4MiniflareOptions({host:process.env.OPAX_TEST_HOST,workers:[{name:'validator',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat']}]}));
  try{
    await mf.dispatchFetch('http://local.invalid/api/table/privacy',{method:'POST',body:JSON.stringify({text:'Fixture organisation',mode:'row'})});
    for(const count of [9003,50000]){
      const csv=serialize(count),cpu=process.cpuUsage(),start=performance.now();assert.equal(csvIdentityCheck(csv,rowBlocked),false,'public CSV rejected');
      const used=process.cpuUsage(cpu),cpuMs=(used.user+used.system)/1000,nodeMs=performance.now()-start;
      const began=performance.now(),response=await mf.dispatchFetch('http://local.invalid/api/table/privacy',{method:'POST',body:JSON.stringify({text:csv,mode:'csv'})});
      const workerMs=performance.now()-began;assert.equal(response.status,200);assert.equal((await response.json()).safe,true,'Worker CSV rejected');
      assert.ok(cpuMs<20000&&workerMs<30000,'CSV validator exceeded Worker CPU budget');
      t.diagnostic(JSON.stringify({rows:count,bytes:Buffer.byteLength(csv),nodeMs:Math.round(nodeMs),nodeCpuMs:Math.round(cpuMs),workerWallMs:Math.round(workerMs)}));
    }
    const privateName=sourceTableDonorIdentities().labels[0];
    for(const csv of [privateName+'\r\n'+serialize(9003),serialize(9003)+'\r\n'+privateName]){
      const response=await mf.dispatchFetch('http://local.invalid/api/table/privacy',{method:'POST',body:JSON.stringify({text:csv,mode:'csv'})});assert.equal((await response.json()).safe,false,'withheld CSV edge missed');
    }
  }finally{await mf.dispose();}
});
