import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {tableApi} from '../src/table-api.ts';
import {tableDatabase} from './table-d1-harness.mjs';
import {instrumentTableConfig,auditTableConfig,registerTableQuery,interestTableConfig,interestTableData,partyMoneyData,partyMoneyTableConfig,registerTableHTML,hydrateRegisterTables} from '../public/register-tables.js';
import {applyQuery,dataTableHTML,toCSV} from '../public/datatable.js';
import {instrumentPage} from '../src/instruments.ts';
import {auditPage} from '../src/audit.ts';
import {unpack,instrumentTableRows} from '../public/instruments.js';
import {partyMoneyResponse} from '../src/party-money-table.ts';
import {interestRegisterResponse} from '../src/interest-register.ts';
const root=new URL('../public/',import.meta.url);
const read=async path=>JSON.parse(readFileSync(new URL(path.replace(/^\//,''),root),'utf8'));

test('every interest entry retains the register wording, holder source and date',()=>{
 const register={source_url:'https://fixture.test/register',as_at:'2026-10-13',buckets:{gifts:{items:[{description:'Gift from EXAMPLE, ALEX',holder:'Self',page:7},{description:'Unchanged source entry'}]}}};
 const projected=interestTableData(register);assert.equal(projected.omitted,0);
 assert.deepEqual(projected.rows.map(row=>row.item),register.buckets.gifts.items.map(row=>row.description));
 assert.equal(projected.rows[0].source,register.source_url+'#page=7');assert.equal(projected.rows[0].date,register.as_at);
 const config=interestTableConfig(projected.rows);assert.ok(toCSV(config.rows,config).includes('EXAMPLE, ALEX'));
});
test('all published interest registers retain every source entry',async()=>{
 let registers=0;
 for(const file of readdirSync(new URL('interests/',root)).filter(file=>file.endsWith('.json'))){
  const register=await read('/interests/'+file);if(!register.buckets)continue;
  const projected=interestTableData(register),items=Object.values(register.buckets).flatMap(bucket=>bucket.items || []);
  assert.deepEqual(projected.rows.map(row=>row.item),items.map(item=>item.description));assert.equal(projected.omitted,0);registers++;
 }
 assert.ok(registers>300);
});
test('instrument rows keep source registration dates and portfolio memberships',async()=>{
 const m=await read('/instruments/manifest.json'),rows=await instrumentTableRows(read,m,(await read(m.index_url)).records);
 assert.equal(rows.length,m.exported ?? m.count);
 const dates=new Map(rows.map(row=>[row.id,row.registered]));
 for(const chunk of m.chunks)for(const packed of (await read(chunk.path)).records){const {source}=unpack(packed,m.schemas,m.strings);assert.equal(dates.get(source.id),source.asMadeRegisteredAt?.slice(0,10) || null);}
 const config=instrumentTableConfig();
 for(const portfolio of new Set(rows.flatMap(row=>row.portfolios)))assert.equal(applyQuery(rows,config,{filters:{portfolios:[portfolio]}}).total,rows.filter(row=>row.portfolios.includes(portfolio)).length);
});
test('audit sectors, response choices and legacy filters retain complete source rows',async()=>{
 const records=(await read('/audit/index.json')).records,config=auditTableConfig(records),all=applyQuery(config.rows,config,{});
 assert.equal(all.total,records.length);assert.equal(all.facets.sectors.find(f=>f.value==='Health').count,48);
 assert.equal(applyQuery(config.rows,config,{filters:{sectors:['Health']}}).total,48);
 assert.deepEqual(registerTableQuery(new URLSearchParams('year=2025-26'),config),{filters:{year:{min:2025,max:2025}}});
 const block=(title,text)=>'<h1>'+title+'</h1><p>'+text+'</p>';
 const instruments=await instrumentPage(null,new URL('https://opax.test/instruments?q=airport'),read,block);
 assert.equal(instruments.noindex,true);assert.ok(instruments.prerender.includes('of 51'));
 const audit=await auditPage(null,new URL('https://opax.test/audit?sector=Health'),read,block);
 assert.equal(audit.noindex,true);assert.ok(audit.prerender.includes('of 48'));
 const source={...config.rows[0],entities:['EXAMPLE, ALEX']};
 assert.equal(applyQuery([source],config,{}).total,1);assert.ok(toCSV([source],config).includes('EXAMPLE, ALEX'));
});
test('D1 register APIs work without matcher tables or privacy metadata',async()=>{
 const m=await read('/instruments/manifest.json'),rows=await instrumentTableRows(read,m,(await read(m.index_url)).records);
 const audit=auditTableConfig((await read('/audit/index.json')).records);
 const local=await tableDatabase({datasets:{instruments:rows.map(row=>({row})),'audit-reports':audit.rows.map(row=>({row}))}});
 try{
  const db={prepare(sql){assert.ok(!/table_private_identity|privacy_fingerprint|privacy_stripped_lengths/.test(sql));return local.db.prepare(sql);},batch:local.db.batch.bind(local.db)};
  const api=path=>tableApi(new Request('https://opax.test/api/table/'+path),{TABLE_DB:db});
  const sorted=await (await api('instruments?sort=registered:desc')).json();assert.equal(sorted.total,rows.length);
  assert.deepEqual(sorted.rows.map(row=>row.registered),sorted.rows.map(row=>row.registered).sort().reverse());
  const year=rows.find(row=>row.year).year,filter=new URLSearchParams({'f.year':JSON.stringify({min:year,max:year})});
  assert.equal((await (await api('instruments?'+filter)).json()).total,rows.filter(row=>row.year===year).length);
  assert.ok((await (await api('instruments?q=airport&format=csv')).text()).includes('Registered'));
  assert.equal((await (await api('audit-reports')).json()).total,audit.rows.length);
 }finally{await local.close();}
});
for(const confident of [false,true])test((confident?'confident':'uncertain')+': party table, JSON endpoint, SSR and hydration keep original name and accurate link; the return stays data',async()=>{
 const donor={id:'donor:fixture',kind:'donor',label:'Canonical fixture',source_name:'EXAMPLE, ALEX',industry:'individual',returnReferences:[{return_type:'AEC annual return',year:'2024-25',return_id:'RETURN-7'}],match:{confidence:confident?1:0.7,method:confident?'curated':'rule',href:'/subject/person/fixture'}};
 const graph={nodes:[donor,{id:'party:fixture',kind:'party',label:'Fixture party'}],edges:[{source:donor.id,target:'party:fixture',total:40,count:2},{source:donor.id,target:'party:fixture',total:60,count:3}]};
 const {rows}=partyMoneyData(graph,'party:fixture');assert.equal(rows.length,1);assert.equal(rows[0].total,100);assert.equal(rows[0].count,5);
 const config=partyMoneyTableConfig(rows);
 const verify=doc=>{
  const shown=doc.body.cloneNode(true);shown.querySelectorAll('script,template').forEach(n=>n.remove());
  assert.ok(shown.textContent.includes(donor.source_name));assert.doesNotMatch(shown.textContent,/AEC annual return|RETURN-7|Return reference/);assert.equal(doc.querySelectorAll('[data-column="return_reference"]').length,0);
  // Every donor name links (16 Oct): the confident match's page, or the page for its own spelling.
  const links=[...doc.querySelectorAll('a')].filter(a=>a.textContent===donor.source_name);assert.equal(links.length,1);assert.equal(links[0].getAttribute('href'),confident?donor.match.href:'/subject/donor/EXAMPLE%2C%20ALEX');
 };
 const html=registerTableHTML(config),dom=new JSDOM(html,{url:'https://opax.test/subject/party/fixture'});verify(dom.window.document);
 let requests=0;dom.window.fetch=async()=>{requests++;throw Error('unexpected request');};
 const previous=globalThis.MutationObserver;globalThis.MutationObserver=dom.window.MutationObserver;
 try{hydrateRegisterTables(dom.window.document);await new Promise(setImmediate);verify(dom.window.document);assert.equal(requests,0);}finally{dom.window.document.body.replaceChildren();await new Promise(setImmediate);globalThis.MutationObserver=previous;dom.window.close();}
 const response=await partyMoneyResponse(new Request('https://opax.test/api/register/party-money?partyId=party%3Afixture'),{fetch:async request=>{assert.equal(new URL(request.url).pathname,'/graph/money.json');return Response.json(graph);}});
 assert.equal(response.status,200);assert.deepEqual((await response.json()).rows,rows);assert.equal(config.primaryLink(rows[0]),confident?donor.match.href:'/subject/donor/EXAMPLE%2C%20ALEX');
 assert.match(rows[0].return_reference,/RETURN-7/);assert.ok(!config.columns.some(c=>c.key==='return_reference'));assert.ok(!html.includes('RETURN-7'),'hydration JSON leaves the reference to the API');
 assert.ok(toCSV(rows,config).includes(donor.source_name));
});
test('interest JSON reads only the source register and preserves name-bearing text',async()=>{
 const register={buckets:{gifts:{items:[{description:'Gift from EXAMPLE, ALEX'}]}}};
 const response=await interestRegisterResponse(new Request('https://opax.test/api/register/interests?pid=fixture'),{fetch:async request=>{assert.equal(new URL(request.url).pathname,'/interests/fixture.json');return Response.json(register);}});
 assert.equal(response.status,200);assert.equal((await response.json()).rows[0].item,register.buckets.gifts.items[0].description);
});

test('party donations export comes from the table API for that party, so return references stay in the CSV', async () => {
  const {partyMoneyTableConfig} = await import('../public/register-tables.js');
  const config = partyMoneyTableConfig([{id:'x',label:'A donor',total:1,count:1,return_reference:'ref'}], undefined, undefined, undefined, {party:'Labor', jurisdiction:'federal'});
  assert.ok(!('return_reference' in config.rows[0]));
  const url = new URL(config.export.endpoint, 'https://opax.com.au');
  assert.equal(url.pathname, '/api/table/party-money');
  assert.deepEqual(JSON.parse(url.searchParams.get('f.to')), ['Labor']);
  assert.deepEqual(JSON.parse(url.searchParams.get('f.jurisdiction')), ['federal']);
  assert.equal(partyMoneyTableConfig([]).export.endpoint, undefined);
});
