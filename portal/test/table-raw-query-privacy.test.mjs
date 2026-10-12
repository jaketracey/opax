import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sourceTableDonorIdentities} from '../../scripts/table_identity_source.mjs';
import {tableIdentityIndex} from '../../scripts/load_tables.mjs';
import {tablePrivacy} from '../src/table-privacy.ts';
import {tableApi} from '../src/table-api.ts';
import {applyQuery,dataTableHTML,guardTableURL,mountDataTable} from '../public/datatable.js';
import {rawQueryValues,scrubQuery} from '../public/datatable-query.js';
import {tableHarness} from './datatable-harness.mjs';
import {tableDatabase} from './table-d1-harness.mjs';
import {rawProbeKinds,rawProbeParams} from './datatable-raw-probes.mjs';
const source=sourceTableDonorIdentities(),policy=await tableIdentityIndex();
const registry=JSON.parse(await readFile(new URL('../public/table-private-identities.json',import.meta.url),'utf8'));
const assets={fetch:async()=>Response.json(registry)};
const columns=[{key:'name',label:'Organisation',type:'text',primary:true,facet:'multi'},{key:'amount',label:'Amount',type:'money',facet:'range'}];
const rows=[{name:'Fixture organisation Pty Ltd',amount:1}],page={rows,total:1,page:1,pageSize:50,facets:{}};
const config={id:'raw-query',caption:'Receipts',privacy:'donors',urlKey:'t',columns,rows};
const safe=value=>!policy.check(value);
test('raw query privacy checks unknown and repeated occurrences before client or server hydration',async t=>{
  let tested=0;
  for(const value of source.identifiers)for(const kind of rawProbeKinds)for(const namespace of ['t',''])for(const server of [false,true]){
    const initial='http://localhost/money?'+rawProbeParams(value,kind,namespace),h=tableHarness(initial);
    const canonical={href:initial};h.root.ownerDocument.head.querySelector=selector=>selector==='link[rel="canonical"]'?canonical:null;
    let reads=0;
    h.win.fetch=(input,options)=>{
      if(new URL(input,'http://localhost').pathname==='/api/table/privacy')return tablePrivacy(new Request('https://local.invalid/api/table/privacy',options),assets);
      reads++;return Promise.resolve(Response.json(page));
    };
    const mounted=mountDataTable(h.root,{...config,...(server ? {rows:undefined,source:{endpoint:'/__fixtures/table/money'}} : {})});
    const check=()=>{
      assert.ok(!policy.check(h.win.location.href),'raw URL echo');
      assert.ok(!policy.check(canonical.href),'raw canonical echo');
      assert.ok(!policy.check(h.html()),'raw HTML or live output echo');
      assert.ok(h.html().includes('Showing 0–0 of 0'),'raw rejection rows');
      assert.ok(h.html().includes('data-export disabled'),'raw rejection export');
    };
    check();await new Promise(setImmediate);check();
    assert.equal(reads,0,'raw rejection reached dataset');
    assert.equal(new URL(h.win.location.href).searchParams.get('campaign'),'fixture');
    mounted.destroy();tested++;
  }
  t.diagnostic(JSON.stringify({rawHydrationProbes:tested,rejected:tested,echoes:0,dataRequests:0}));
});
test('SSR guards every raw source label, alias and identifier before rendering or building links',()=>{
  for(const value of [...source.labels,...source.identifiers])for(const kind of rawProbeKinds){
    const url=new URL('https://local.invalid/money?'+rawProbeParams(value,kind));
    const html=dataTableHTML({...config,privacyCheck:safe},page,url);
    assert.ok(!policy.check(url.href)&&!policy.check(html),'SSR raw input echo');
    assert.ok(html.includes('Showing 0–0 of 0')&&html.includes('data-export disabled'),'SSR raw rejection');
    assert.equal(url.searchParams.get('campaign'),'fixture');
    const link='/?'+rawProbeParams(value,kind);
    const linked=dataTableHTML({...config,privacyCheck:safe,primaryLink:()=>link,actions:[{label:'Details',href:()=>link}]},page);
    assert.ok(!policy.check(linked),'SSR request-derived link echo');
  }
});
test('financial API checks raw keys and all repeated occurrences before dataset SQL',async t=>{
  const local=await tableDatabase({datasets:{},policy,memorySQL:true});let tested=0;
  try{
    for(const value of source.identifiers)for(const kind of rawProbeKinds)for(const namespace of ['t','']){
      let reads=0;const db={prepare(sql){if(/FROM\s+table_(?!meta\b|private_identity\b)/i.test(sql))reads++;return local.db.prepare(sql);}};
      const response=await tableApi(new Request('https://local.invalid/api/table/contracts?'+rawProbeParams(value,kind,namespace)),{TABLE_DB:db});
      assert.ok([200,400].includes(response.status),'raw endpoint status');
      assert.equal(reads,0,'raw input reached dataset SQL');
      assert.ok(!policy.check(JSON.stringify([...response.headers])+await response.clone().text()),'raw endpoint echo');
      if(kind.startsWith('repeated')) assert.equal(response.status,400,'repeat policy');
      else {const result=await response.json();assert.equal(result.total,0);assert.equal(result.rows.length,0);}
      tested++;
    }
  }finally{await local.close();}
  t.diagnostic(JSON.stringify({rawEndpointProbes:tested,rejected:tested,echoes:0,dataQueries:0}));
});
test('raw guards check JSON keys and escapes, keep safe unrelated occurrences, and reject safe table repeats',async()=>{
  const value=source.labels[0],escaped=Array.from(value,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
  for(const raw of [`{"${escaped}":"fixture"}`,`["${escaped}"]`]){
    const params=new URLSearchParams({future:raw});assert.ok([...rawQueryValues(params)].some(policy.check));
    assert.ok(scrubQuery(params,safe,'t').rejected);
  }
  assert.ok(scrubQuery(new URLSearchParams([[`"${escaped}"`,'fixture']]),safe,'t').rejected,'escaped raw key');
  const params=new URLSearchParams([['campaign','fixture'],['campaign','safe'],['f.unrelated','["keep"]'],['t.other','keep']]);
  const guarded=guardTableURL({...config,privacyCheck:safe},'https://local.invalid/?'+params);
  assert.equal(guarded.rejected,false);assert.equal(guarded.url.searchParams.toString(),params.toString());
  for(const key of ['q','page','f.name','t.q','t.page','t.f.name']){
    const repeated=new URL('https://local.invalid/?'+new URLSearchParams([[key,''],[key,''],['campaign','fixture']]));
    const initial=String(repeated);
    const rejected=guardTableURL({...config,privacyCheck:safe},repeated);
    assert.equal(rejected.rejected,true);assert.equal(repeated.searchParams.has(key),false);
    assert.equal(applyQuery(rows,{...config,privacyCheck:safe},rejected.query).total,0,'guarded query remains rejected');
    const h=tableHarness(initial),mounted=mountDataTable(h.root,{...config,privacyCheck:safe});
    await new Promise(setImmediate);
    assert.equal(new URL(h.win.location.href).searchParams.get('campaign'),'fixture');
    assert.ok(h.html().includes('Showing 0–0 of 0')&&h.html().includes('data-export disabled'),'safe repeat hydration rejection');mounted.destroy();
  }
});
test('popstate quarantines unknown private input synchronously and keeps safe unrelated state',async()=>{
  for(const server of [false,true]){
    const h=tableHarness('http://localhost/money?campaign=fixture');
    h.win.fetch=(input,options)=>new URL(input,'http://localhost').pathname==='/api/table/privacy'
      ? tablePrivacy(new Request('https://local.invalid/api/table/privacy',options),assets) : Promise.resolve(Response.json(page));
    const mounted=mountDataTable(h.root,{...config,...(server ? {rows:undefined,source:{endpoint:'/__fixtures/table/money'}} : {})});
    await new Promise(setImmediate);
    for(const kind of rawProbeKinds){
      h.win.location.href='http://localhost/money?'+rawProbeParams(source.identifiers[0],kind);
      h.win.dispatchEvent(new Event('popstate'));
      assert.ok(!policy.check(h.win.location.href)&&!policy.check(h.html()),'popstate synchronous echo');
      assert.ok(h.html().includes('Showing 0–0 of 0')&&h.html().includes('data-export disabled'));
      await new Promise(setImmediate);
      assert.equal(new URL(h.win.location.href).searchParams.get('campaign'),'fixture');
      assert.ok(!policy.check(h.html()),'popstate completed echo');
    }
    mounted.destroy();
  }
});
