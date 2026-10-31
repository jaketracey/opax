import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {interestTableData,interestTableConfig,registerTableHTML,hydrateRegisterTables} from '../public/register-tables.js';
import {toCSV,applyQuery} from '../public/datatable.js';

const compiled=await build({stdin:{contents:"export {interestRegisterResponse} from './src/interest-register'; export {renderPersonAnswer} from './src/seo-content';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'node'});
const api=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const bowen=JSON.parse(await readFile(new URL('../public/interests/10060.json',import.meta.url),'utf8'));
const entries=Object.values(bowen.buckets).flatMap(b=>b.items).filter(i=>/local café|part time Electorate Officer/.test(i.description));
const fixture={...bowen,buckets:{other:{count:entries.length,items:entries}},total:entries.length};

test('the published Bowen rows retain the dependent holder, deletion and addition without rewriting source text, dates or page links',()=>{
 assert.equal(entries.length,2);
 const original=structuredClone(fixture),{rows}=interestTableData(fixture);
 for(const [i,row] of rows.entries()){
  assert.equal(row.holder,entries[i].holder);assert.equal(row.kind,entries[i].kind);
  assert.equal(row.holder_label,'Dependent child');assert.equal(row.entry_type,entries[i].kind==='deletion'?'Deletion':'Addition');
  assert.equal(row.item,entries[i].description);assert.equal(row.date,'2026-02-18');assert.equal(row.source,fixture.source_url+'#page='+entries[i].page);
 }
 assert.deepEqual(fixture,original);
 const config=interestTableConfig(rows),csv=toCSV(rows,config),html=registerTableHTML(config);
 assert.equal(config.id,'interests-table');assert.equal(config.urlKey,'interests');
 assert.match(csv,/Holder/);assert.match(csv,/Entry type/);assert.match(csv,/Dependent child/);assert.match(csv,/Deletion/);assert.match(csv,/Addition/);
 assert.match(html,/data-label="Holder"/);assert.match(html,/data-label="Entry type"/);assert.match(html,/Deletion/);
 assert.equal(applyQuery(rows,config,{filters:{entry_type:['Deletion']}}).total,1);
});

test('statement, missing, unspecified and unknown legacy values stay distinct; correction wording does not invent an entry type',()=>{
 const items=[
  {description:'Statement row',holder:'self',kind:'statement'},
  {description:'Partner row',holder:'spouse',kind:'addition'},
  {description:'Unspecified row',holder:'unspecified',kind:'deletion'},
  {description:'Legacy row'},
  {description:'Unknown row',holder:'<unknown-holder>',kind:'<unknown-kind>'},
  {description:'Correction: this was on 04/07/26, not 14/07/2026.',holder:'self',kind:'addition'},
 ];
 const {rows}=interestTableData({source_url:'https://fixture.test/statement',as_at:'2026-09-15',buckets:{other:{items}}});
 assert.deepEqual(rows.map(r=>r.holder_label),['Self','Spouse or partner','Not specified','Not recorded','<unknown-holder>','Self']);
 assert.deepEqual(rows.map(r=>r.entry_type),['Statement','Addition','Deletion','Not recorded','<unknown-kind>','Addition']);
 assert.equal(rows[4].holder,items[4].holder);assert.equal(rows[4].kind,items[4].kind);
 assert.equal(rows[5].item,items[5].description);assert.equal(rows[5].date,'2026-09-15');
 const html=registerTableHTML(interestTableConfig(rows));
 assert.ok(!html.includes('<unknown-holder>'));assert.ok(!html.includes('<unknown-kind>'));
 assert.ok(html.includes('&lt;unknown-holder&gt;'));
});

test('the recorded King correction retains its addition classification and notification date',async()=>{
 const register=JSON.parse(await readFile(new URL('../public/interests/10884.json',import.meta.url),'utf8'));
 const item=register.buckets.travel.items.find(i=>i.description.includes('Correction to a 7th of August'));
 assert.ok(item);assert.equal(item.kind,'addition');
 const {rows:[row]}=interestTableData({...register,buckets:{travel:{items:[item]}}});
 assert.equal(row.entry_type,'Addition');assert.equal(row.holder_label,'Self');
 assert.equal(row.item,item.description);assert.equal(row.date,item.date);
 assert.equal(row.source,register.source_url+'#page=33');
 // This rendering fix does not infer an event date, repair parser boundaries,
 // or invent a "correction" kind from the description.
 assert.equal(row.kind,item.kind);
});

test('the JSON register endpoint, SSR and hydrated table preserve the same holder and entry-type labels',async()=>{
 const assets={fetch:async()=>Response.json(fixture)};
 const response=await api.interestRegisterResponse(new Request('https://fixture.test/api/register/interests?pid=10060'),assets);
 assert.equal(response.status,200);
 const {rows}=await response.json();assert.ok(rows.every(r=>r.holder_label==='Dependent child'));
 assert.deepEqual(rows.map(r=>r.entry_type),['Deletion','Addition']);
 const person={name:'Chris Bowen',pid:'10060',states:['nsw'],chambers:['representatives']};
 const interests={people:{'10060':{}},_by_name:{}};
 const read=async path=>path==='/interests/10060.json'?fixture:path==='/interests/index.json'?interests:null;
 const rendered=await api.renderPersonAnswer(person,read,new Map());
 assert.match(rendered.html,/Dependent child/);assert.match(rendered.html,/Deletion/);assert.match(rendered.html,/Addition/);
 assert.match(rendered.html,/do not establish current holdings/);
 const dom=new JSDOM(registerTableHTML(interestTableConfig(rows)),{url:'https://fixture.test/subject/person/chris-bowen'});
 const before=dom.window.document.querySelector('table').textContent;
 const oldObserver=globalThis.MutationObserver;globalThis.MutationObserver=dom.window.MutationObserver;
 try{
  hydrateRegisterTables(dom.window.document);
  await new Promise(setImmediate);
  const table=dom.window.document.querySelector('table');
  assert.equal(table.textContent,before);
  for(const entry of entries)assert.ok([...table.querySelectorAll('a')].some(a=>a.href===fixture.source_url+'#page='+entry.page));
 }finally{dom.window.document.body.replaceChildren();await new Promise(setImmediate);globalThis.MutationObserver=oldObserver;dom.window.close();}
});
