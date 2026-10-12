// Post-publication checks use runtime source identities and count-only failures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {sourceTableDonorIdentities} from '../../scripts/table_identity_source.mjs';
import {tableIdentityIndex,tableRegistryFingerprint} from '../../scripts/load_tables.mjs';
import {compileHashedIdentityCheck} from '../src/table-identity-hashes.mjs';
import {tablePrivacy,tablePrivacyCheck} from '../src/table-privacy.ts';
import {tableApi,TABLE_REGISTRY_FINGERPRINT} from '../src/table-api.ts';
import {TABLE_DATASETS} from '../src/table-datasets.mjs';
import {isOrganisationRecipient} from '../src/table-recipient.mjs';
import {tableDatabase} from './table-d1-harness.mjs';
import {tableHarness} from './datatable-harness.mjs';
import {mountDataTable} from '../public/datatable.js';
const pub=new URL('../public/',import.meta.url);
const read=async path=>JSON.parse(await readFile(new URL(path,pub),'utf8'));
const source=sourceTableDonorIdentities(),policy=await tableIdentityIndex();
const registry=await read('table-private-identities.json');
const assets={fetch:async request=>new URL(request.url).pathname==='/table-private-identities.json'?Response.json(registry):new Response(null,{status:404})};
const recipients=[];
for(const jur of ['federal','qld'])for(const file of (await readdir(new URL(`grants/${jur}/`,pub))).filter(f=>f.startsWith('shard-')&&f.endsWith('.json')))for(const row of Object.values(await read(`grants/${jur}/${file}`)))if(!isOrganisationRecipient(row))recipients.push(...[row.n,row.abn,row.abr?.abn,row.identity?.legal_name,row.abr?.name,...row.aliases||[],...row.lookup_names||[]].filter(v=>(typeof v==='string'||typeof v==='number')&&String(v).trim()).map(String));
const probes=[...new Set([...source.labels,...source.identifiers,...recipients])];
test('the published table registry rejects the complete runtime donor and recipient set',async t=>{
  assert.equal(registry.version,1);
  assert.equal(tableRegistryFingerprint(policy),TABLE_REGISTRY_FINGERPRINT);
  assert.ok(registry.identities.every(e=>Object.keys(e).sort().join(',')==='hash,words'&&/^[a-f0-9]{64}$/.test(e.hash)&&Number.isSafeInteger(e.words)&&e.words>0));
  const blocked=compileHashedIdentityCheck(registry.identities,registry.strippedLengths),safe=await tablePrivacyCheck(assets);
  assert.equal(probes.filter(v=>!policy.check(v)||!blocked(v)||safe(v)).length,0,'guard miss count');
  for(const value of probes){const response=await tablePrivacy(new Request('https://local.invalid/api/table/privacy',{method:'POST',body:JSON.stringify({text:value})}),assets);assert.ok(response.status===200&&(await response.json()).safe===false,'browser validator rejection count');}
  t.diagnostic(JSON.stringify({donorLabels:source.labels.length,donorLabelsRejected:source.labels.filter(blocked).length,donorIdentifiers:source.identifiers.length,donorIdentifiersRejected:source.identifiers.filter(blocked).length,recipientInputs:new Set(recipients).size,misses:0}));
});
test('all financial endpoints and CSV reject every runtime donor and recipient input after publication',async()=>{
  const local=await tableDatabase({datasets:{},policy,memorySQL:true});
  try{
    for(const[name,config]of Object.entries(TABLE_DATASETS).filter(([,c])=>c.privacy))for(const value of probes)for(const csv of [false,true]){
      const params=new URLSearchParams({q:value});if(csv)params.set('format','csv');
      let reads=0;const db={prepare(sql){if(/FROM\s+table_(?!meta\b|private_identity\b)/i.test(sql))reads++;return local.db.prepare(sql);}};
      const response=await tableApi(new Request('https://local.invalid/api/table/'+name+'?'+params),{TABLE_DB:db});
      assert.equal(response.status,200,'endpoint status');assert.equal(reads,0,'rejected input reached financial data');
      assert.equal(response.headers.get('content-location'),null);assert.equal(response.headers.get('link'),null);
      if(csv){assert.equal(response.headers.get('x-table-exported'),'0');const body=await response.text();assert.ok(!body.includes(value),'CSV input echo');}
      else{const body=await response.json();assert.equal(body.total,0);assert.equal(body.rows.length,0);assert.equal(Object.keys(body.facets).length,0);}
    }
  }finally{await local.close();}
});
test('default browser validation clears every runtime private input from URL, HTML and live output',async()=>{
  for(const value of probes)for(const server of [false,true]){
    const params=new URLSearchParams({'t.q':value,'t.f.name':JSON.stringify([value]),campaign:'fixture'}),h=tableHarness('http://localhost/money?'+params);
    h.win.fetch=(input,options)=>new URL(input,'http://localhost').pathname==='/api/table/privacy'?tablePrivacy(new Request('https://local.invalid/api/table/privacy',options),assets):Promise.resolve(Response.json({rows:[],total:0,page:1,pageSize:50,facets:{}}));
    const config={id:'publication-privacy',caption:'Receipts',privacy:'donors',urlKey:'t',columns:[{key:'name',label:'Organisation',type:'text',primary:true,facet:'multi'},{key:'amount',label:'Amount',type:'money'}],...(server?{source:{endpoint:'/__fixtures/table/money'}}:{rows:[]})};
    const mounted=mountDataTable(h.root,config);await new Promise(setImmediate);
    const url=new URL(h.win.location.href);
    assert.ok(!url.searchParams.has('t.q')&&!url.searchParams.has('t.f.name'),'URL input echo');assert.equal(url.searchParams.get('campaign'),'fixture');
    assert.ok(!h.html().includes(value),'HTML or live region input echo');mounted.destroy();
  }
});

test('162 runtime identifier range probes fail closed during hydration in both browser modes',async t=>{
  let tested=0;
  for(const value of source.identifiers)for(const server of [false,true]){
    assert.equal(policy.check(String(Number(value))),true,'numeric probe derived coverage');
    const params=new URLSearchParams({'t.f.amount':JSON.stringify({min:Number(value),max:Number(value)}),campaign:'fixture'}),h=tableHarness('http://localhost/money?'+params);
    let dataReads=0;
    h.win.fetch=(input,options)=>{
      if(new URL(input,'http://localhost').pathname==='/api/table/privacy')return tablePrivacy(new Request('https://local.invalid/api/table/privacy',options),assets);
      dataReads++;return Promise.resolve(Response.json({rows:[],total:0,page:1,pageSize:50,facets:{}}));
    };
    const config={id:'publication-range',caption:'Receipts',privacy:'donors',urlKey:'t',columns:[{key:'name',label:'Organisation',type:'text',primary:true},{key:'amount',label:'Amount',type:'money',facet:'range'}],...(server?{source:{endpoint:'/__fixtures/table/money'}}:{rows:[{name:'Fixture organisation Pty Ltd',amount:1}]})};
    const mounted=mountDataTable(h.root,config);
    // The synchronous pending paint and URL rewrite must already be clean.
    const check=()=>{
      assert.ok(!new URL(h.win.location.href).searchParams.has('t.f.amount'),'range URL echo');
      assert.ok(!policy.check(h.html()),'HTML or accessible range echo');
      assert.ok(h.html().includes('Showing 0–0 of 0'),'rejected range rows');
      assert.ok(h.html().includes('data-export disabled'),'rejected range export');
    };
    check();await new Promise(setImmediate);check();
    assert.equal(dataReads,0,'rejected range reached dataset');
    assert.equal(new URL(h.win.location.href).searchParams.get('campaign'),'fixture');
    mounted.destroy();tested++;
  }
  assert.equal(tested,162);t.diagnostic(JSON.stringify({numericProbes:tested,rejected:tested,echoes:0,dataRequests:0}));
});
test('paging, sorting and nested future query values use the same whole-state privacy gate',async()=>{
  const value=source.identifiers.find(v=>String(Number(v))===v);
  for(const state of [{page:Number(value)},{pageSize:Number(value)},{sort:{key:value,dir:'asc'}},{future:{nested:[Number(value)]}},{filters:{amount:{min:Number(value)}}}]){
    const config={id:'state-gate',caption:'Receipts',privacy:'donors',privacyCheck:v=>!policy.check(v),columns:[{key:'name',label:'Organisation',type:'text',primary:true},{key:'amount',label:'Amount',type:'money',facet:'range'}],rows:[{name:'Fixture organisation Pty Ltd',amount:1}]};
    const {applyQuery}=await import('../public/datatable.js');
    const page=applyQuery(config.rows,config,state);
    assert.equal(page.total,0);assert.equal(page.page,1);assert.equal(page.pageSize,50);assert.equal(page.rows.length,0);
  }
  for(const parameter of ['page','pageSize','sort'])for(const server of [false,true]){
    const h=tableHarness('http://localhost/money?'+new URLSearchParams({['t.'+parameter]:parameter==='sort'?value+':asc':value}));
    h.win.fetch=(input,options)=>tablePrivacy(new Request('https://local.invalid/api/table/privacy',options),assets);
    const config={id:'state-hydration',caption:'Receipts',privacy:'donors',urlKey:'t',columns:[{key:'name',label:'Organisation',type:'text',primary:true}],...(server?{source:{endpoint:'/__fixtures/table/money'}}:{rows:[]})};
    const mounted=mountDataTable(h.root,config);await new Promise(setImmediate);
    assert.equal(new URL(h.win.location.href).searchParams.size,0);assert.ok(!policy.check(h.html()));assert.ok(h.html().includes('data-export disabled'));mounted.destroy();
  }
});
