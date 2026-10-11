import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {instrumentTableResponse} from '../src/instrument-table.ts';
import {instrumentTableConfig,auditTableConfig,interestTableConfig,interestTableData,partyMoneyData} from '../public/register-tables.js';
import {isOrganisationDonor} from '../public/donor-entity.js';
import {applyQuery,dataTableHTML,toCSV} from '../public/datatable.js';
import {registerServerCSVContract} from './datatable-endpoint-contract.mjs';
import {tablePrivacyIndex} from './datatable-privacy.mjs';
import {namesWithheldPhrase} from '../public/donor-entity.js';
import {unpack,instrumentTableRows} from '../public/instruments.js';
const root = new URL('../public/',import.meta.url);
const read = async path=>JSON.parse(readFileSync(new URL(path.replace(/^\//,''),root),'utf8'));

test('instrument server rows use as-made registration dates and do not transfer the catalogue to the browser',async()=>{
  const manifest = await read('/instruments/manifest.json'), index = await read(manifest.index_url);
  const rows = await instrumentTableRows(read,manifest,index.records);
  assert.equal(rows.length,manifest.exported ?? manifest.count);
  const dates = new Map(rows.map(row=>[row.id,row.registered]));
  for (const chunk of manifest.chunks) for (const packed of (await read(chunk.path)).records) {
    const {source} = unpack(packed,manifest.schemas,manifest.strings);
    assert.equal(dates.get(source.id),source.asMadeRegisteredAt?.slice(0,10) || null,'date follows source registration metadata');
  }
  const config = instrumentTableConfig();
  assert.equal(config.rows,undefined);assert.equal(config.source.endpoint,'/api/table/instruments');
  assert.deepEqual(config.columns.map(c=>c.label),['Title','Type','Portfolio','Registered','Status']);
  const assets = {async fetch(request){try{return Response.json(await read(new URL(request.url).pathname));}catch{return new Response('missing',{status:404});}}};
  const page = await instrumentTableResponse(new Request('https://opax.test/api/table/instruments'),assets);
  assert.equal(page.status,200);assert.equal((await page.json()).rows.length,50);
  const unavailable = await instrumentTableResponse(new Request('https://opax.test/api/table/instruments'),{fetch:async()=>new Response('missing',{status:404})});
  assert.equal(unavailable.status,503);
});

test('audit client mode contains the complete small catalogue and the required column types',async()=>{
  const manifest = await read('/audit/manifest.json'), index = await read(manifest.index_url);
  const config = auditTableConfig(index.records);
  assert.equal(config.rows.length,manifest.count);assert.equal(config.source,undefined);
  assert.deepEqual(config.columns.map(c=>[c.label,c.type]),[['Title','text'],['Tabled','date'],['Sector','category'],['Entities','text']]);
  for (const row of config.rows) assert.equal(config.primaryLink(row),`/audit/${row.id}`);
});

test('interest dates distinguish notification dates from the snapshot and source text stays exact',()=>{
  const register = {as_at:'2026-09-19',source_url:'https://register.example/statement.pdf',buckets:{gifts:{items:[{description:'An organisation-provided item',date:'2026-08-03',page:2},{description:'An item in the latest statement'}]}}};
  const {rows,omitted} = interestTableData(register,()=>false), config = interestTableConfig(rows,()=>true);
  assert.equal(omitted,0);assert.deepEqual(rows.map(row=>row.date),['2026-08-03','2026-09-19']);
  assert.equal(rows[0].item,register.buckets.gifts.items[0].description);
  assert.equal(config.primaryLink(rows[0]),register.source_url+'#page=2');
  assert.equal(applyQuery(rows,config,{q:'organisation'}).total,1);
  assert.equal(applyQuery(rows,config,{q:'absent text'}).total,0);
});

test('organisation aliases retain evidence and repeated withheld receipts count one donor',()=>{
  const graph = {nodes:[{id:'donor:organisation-fixture',kind:'donor',label:'Register fixture',aliases:['Register Fixture Organisation Pty Ltd','Withheld donor']},{id:'donor:withheld-fixture',kind:'donor',label:'Withheld donor'}],edges:[
    {source:'donor:organisation-fixture',target:'party:fixture',total:10,count:2},
    {source:'donor:withheld-fixture',target:'party:fixture',total:3,count:1},
    {source:'donor:withheld-fixture',target:'party:fixture',total:4,count:1},
  ]};
  const {rows,aggregate} = partyMoneyData(graph,'party:fixture',label=>label !== 'Register fixture');
  assert.equal(rows.length,1);assert.equal(isOrganisationDonor(rows[0]),true);
  assert.deepEqual(rows[0].aliases,['Register Fixture Organisation Pty Ltd']);
  assert.deepEqual(aggregate,{donors:1,total:7,count:2});
});

test('protected row policies are fail closed and cached independently',()=>{
  const rows=[{item:'A source entry',category:'Gifts'}];
  const config=interestTableConfig(rows,()=>true);
  assert.equal(applyQuery(rows,config,{}).total,1);
  for(const rowPrivacyCheck of [()=>false,()=>undefined,()=>{throw new Error('unavailable');}]) {
    assert.equal(applyQuery(rows,{...config,rowPrivacyCheck},{}).total,0);
    assert.equal(toCSV(rows,{...config,rowPrivacyCheck}).split('\r\n').length,1);
  }
});

test('every interest register omits entries rejected by the shared table index without losing the whole table',async()=>{
  const index=await tablePrivacyIndex({donorContext:false});
  const withheld=(...texts)=>namesWithheldPhrase(index.phrases,...texts);
  let extraOmitted=0,registers=0;
  for(const file of readdirSync(new URL('interests/',root)).filter(file=>file !== 'index.json' && file.endsWith('.json'))) {
    const register=await read('/interests/'+file);
    if(!register.buckets)continue;
    const before=interestTableData(register,withheld),projected=interestTableData(register,withheld,index.safe);
    const config=interestTableConfig(projected.rows,index.safe),page=applyQuery(config.rows,config,{pageSize:50000});
    assert.ok(index.safe(JSON.stringify(page)),`register ${registers}: rows and facets`);
    assert.ok(index.safe(toCSV(page.rows,config)),`register ${registers}: CSV`);
    assert.equal(projected.omitted-before.omitted,before.rows.length-projected.rows.length);
    extraOmitted+=projected.omitted-before.omitted;registers++;
  }
  assert.ok(registers>300);assert.ok(extraOmitted>0,'derived entries exercise the stricter core check');
});

let seededAssets;
registerServerCSVContract(test,{name:'instruments',seed:async rows=>{
  const original=await read('/instruments/manifest.json');
  const records=rows.map((row,i)=>[`F2026L${String(i).padStart(5,'0')}`,row.name,['Fixture portfolio'],'Regulation','2026-01-01','In force']);
  const lookup=Object.fromEntries(records.map((row,i)=>[row[0],Math.floor(i/512)]));
  const chunks=Array.from({length:Math.ceil(rows.length/512)},(_,i)=>({path:`/instruments/catalogue-fixture-${i}.json`,count:Math.min(512,rows.length-i*512)}));
  const manifest={...original,count:rows.length,exported:rows.length,odata_count:rows.length,count_start:rows.length,count_end:rows.length,drift:0,unresolved_gap:0,gap_pages:[],lookup,chunks,metadata_coverage:{...original.metadata_coverage,expanded_titles:rows.length}};
  const data={'/instruments/manifest.json':manifest,'/instruments/index.json':{records},'/instruments/registered.json':Object.fromEntries(records.map(row=>[row[0],'2026-01-01']))};
  seededAssets={fetch:async request=>Response.json(data[new URL(request.url).pathname])};
},request:query=>instrumentTableResponse(new Request('https://opax.test/api/table/instruments'+query),seededAssets)});
