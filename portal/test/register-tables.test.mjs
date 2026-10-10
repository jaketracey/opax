import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {instrumentTableResponse} from '../src/instrument-table.ts';
import {instrumentTableConfig,auditTableConfig,interestTableConfig,interestTableData,guardRegisterQuery,partyMoneyData} from '../public/register-tables.js';
import {isOrganisationDonor} from '../public/donor-entity.js';
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
  const {rows,omitted} = interestTableData(register,()=>false), config = interestTableConfig(rows);
  assert.equal(omitted,0);assert.deepEqual(rows.map(row=>row.date),['2026-08-03','2026-09-19']);
  assert.equal(rows[0].item,register.buckets.gifts.items[0].description);
  assert.equal(config.primaryLink(rows[0]),register.source_url+'#page=2');
  assert.equal(guardRegisterQuery({q:'organisation'},config).blocked,false);
  assert.equal(guardRegisterQuery({q:'absent text'},config).blocked,true);
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
  const config = {columns:[{key:'label',label:'Donor',type:'text'}],rows:[{label:'Withheld donor fixture Pty Ltd'}],privacy:'donors'};
  assert.equal(guardRegisterQuery({q:'Withheld donor fixture'},config).blocked,true,'a bare name cannot borrow evidence from a longer organisation');
  assert.equal(guardRegisterQuery({q:'Pty Ltd'},config).blocked,false,'organisation evidence substantiates a matching search');
});
