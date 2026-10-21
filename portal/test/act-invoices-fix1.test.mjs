import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {tableDatabase} from './table-d1-harness.mjs';
import {actRow,actMetadata} from './act-invoices-fixture.mjs';
import {actInvoicesPage} from '../src/act-invoices.ts';
import {tableApi} from '../src/table-api.ts';
import {actInvoicesConfig,decorateActInvoices} from '../public/act-invoices-table.js';
import {actInvoiceEntityDefinitions,actInvoiceEntityName} from '../public/act-invoices-context.js';
import {toCSV} from '../public/datatable.js';
import {csvRecords,readServerCSV} from '../public/server-csv.js';
const rows=[{...actRow(1),reporting_entity:'ACTAO',amount:148500,payment_amount:'148500.00'},{...actRow(2),reporting_entity:'SLA'},{...actRow(3),reporting_entity:'CED-TCO'},{...actRow(4),reporting_entity:'UNDEFINED'}];
const local=await tableDatabase({memorySQL:true,datasets:{'act-invoices':rows.map(row=>({row}))},metadata:{'act-invoices':actMetadata}});test.after(()=>local.close());
const env={TABLE_DB:local.db},block=(t,d,l='')=>`<h1>${t}</h1><p>${d}</p>${l}`;
const page=()=>actInvoicesPage(new URL('https://opax.test/register/act-invoices'),env,block);
const api=q=>tableApi(new Request('https://opax.test/api/table/act-invoices?'+q),env);

test('P2: page and CSV include threshold, received-date, grain, duplicate and observed-month caveats',async()=>{
 const html=(await page()).prerender,csv=await(await api('format=csv')).text();
 for(const text of ['$25,000','July 2017','June 2017','no unique invoice ID','1,530 duplicate groups / 2,393 extra copies kept as published','135 payment months','0 empty months','A month appearing does not establish complete entity reporting']){
  assert.ok(new JSDOM(html).window.document.body.textContent.includes(text),text+' page');assert.ok(csv.includes(text),text+' CSV');
 }
 assert.match(csv,/Attribution: ACT Government|attribution: ACT Government/);assert.match(csv,/kzmf-7uhp/);assert.match(csv,/snapshot 2026-10-21T22:08:57/);
 assert.doesNotMatch(csv,/computed total|Total paid|Total spending/);
});

test('P2: publisher definitions and aliases appear beside raw codes; unknown codes stay unchanged',async()=>{
 const d=new JSDOM((await page()).prerender).window.document;
 const names=[...d.querySelectorAll('[data-label="Reporting entity"]')].map(e=>e.textContent);
 assert.ok(names.includes('ACTAO · ACT Audit Office'));assert.ok(names.includes('SLA · Suburban Land Agency'));
 assert.ok(names.includes('CED-TCO · TCCS-TCO → Transport Canberra and City Services - Transport Canberra Control'));
 assert.ok(names.includes('UNDEFINED'));
 const key=d.querySelector('.act-invoices-entity-key');assert.ok(key.textContent.includes('ACTAO'));assert.ok(key.textContent.includes('ACT Audit Office'));
 const body=await(await api('')).json();assert.deepEqual(body.facets.reporting_entity.map(f=>f.value).sort(),['ACTAO','CED-TCO','SLA','UNDEFINED']);
 const defs=actInvoiceEntityDefinitions(actMetadata.description);assert.equal(actInvoiceEntityName('UNDEFINED',defs),'');
 assert.equal(actInvoiceEntityName('CED-TCO',defs),'TCCS-TCO → Transport Canberra and City Services - Transport Canberra Control');
 const csv=await(await api('format=csv')).text();assert.match(csv,/,ACTAO,/);assert.doesNotMatch(csv,/,ACTAO · ACT Audit Office,/);
});

test('P3: one table heading, plain period and Melbourne snapshot with UTC provenance',async()=>{
 const d=new JSDOM((await page()).prerender).window.document;
 assert.equal([...d.querySelectorAll('h1,h2,h3,caption')].filter(e=>e.textContent==='Published invoice records').length,1);
 assert.match(d.body.textContent,/July 2015 to September 2026/);assert.doesNotMatch(d.body.textContent,/July 2015 - September 2026/);
 assert.equal(d.querySelector('time').textContent,'22 Oct 2026 (Melbourne)');assert.equal(d.querySelector('time').getAttribute('datetime'),actMetadata.snapshot);
 assert.match(d.body.textContent,/Snapshot timestamp \(UTC\): 2026-10-21T22:08:57/);
});

test('P3: whole dollars omit .00 in SSR and repaint, retain nonzero cents and unchanged CSV values',async()=>{
 const before=structuredClone(rows),d=new JSDOM((await page()).prerender).window.document;
 const amounts=[...d.querySelectorAll('[data-label="Amount"]')].map(e=>e.textContent);
 assert.ok(amounts.includes('$148,500'));assert.ok(amounts.includes('$1,250.50'));assert.ok(!amounts.includes('$148,500.00'));
 const cell=[...d.querySelectorAll('[data-label="Amount"]')].find(e=>e.textContent==='$148,500');cell.querySelector('.dt-value').textContent='$148,500.00';cell.title='$148,500.00';
 decorateActInvoices(d,actInvoiceEntityDefinitions(actMetadata.description));assert.equal(cell.textContent,'$148,500');assert.equal(cell.title,'$148,500');assert.deepEqual(rows,before);
 const csv=await(await api('format=csv&sort=amount:desc')).text();
 const expected=csvRecords(toCSV([rows[0],rows[3],rows[2],rows[1]],actInvoicesConfig()));
 assert.deepEqual(csvRecords(csv).slice(0,5),expected);assert.match(csv,/148500\.00/);assert.match(csv,/1250\.50/);
});

test('P2: browser CSV continuation retains coverage notes once and every original record',async()=>{
 const source=Array.from({length:10005},(_,i)=>({row:actRow(i+1)}));
 const fixture=await tableDatabase({memorySQL:true,datasets:{'act-invoices':source},metadata:{'act-invoices':actMetadata}});
 try{
  const result=await readServerCSV('https://opax.test/api/table/act-invoices?format=csv',url=>tableApi(new Request(url),{TABLE_DB:fixture.db}));
  assert.equal(csvRecords(result.csv).length,10005+1+6);assert.equal((result.csv.match(/1,530 duplicate groups/g)||[]).length,1);assert.equal((result.csv.match(/A month appearing/g)||[]).length,1);
  assert.equal(result.truncated,false);
 }finally{await fixture.close();}
});
