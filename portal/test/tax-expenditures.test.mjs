import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {clearedTaxExpenditures,taxExpendituresRows,taxExpendituresPage,taxExpendituresReady} from '../src/tax-expenditures.ts';
import {taxExpendituresTableConfig,hydrateRegisterTables} from '../public/register-tables.js';
import {toCSV} from '../public/datatable.js';
const staged=JSON.parse(readFileSync(new URL('../../data/staged/tax-expenditures/hub.json',import.meta.url)));
const fixture=()=>structuredClone(staged);
const block=(title,text)=>`<h1>${title}</h1><p>${text}</p>`;
const page=(h,query='')=>taxExpendituresPage(new URL('https://opax.test/register/tax-expenditures'+query),async()=>h,block);

test('SSR defines benchmark/non-additivity and shows current statement year, sources and licences on every block',async()=>{
 const result=await page(fixture());assert.equal(result.status,200);const doc=new JSDOM(result.prerender).window.document;
 assert.equal(doc.querySelector('h1').textContent,'Tax expenditures');assert.match(doc.querySelector('#tax-largest').textContent,/2025-26/);
 assert.equal(doc.querySelectorAll('#tax-largest + p + .tax-items .tax-item').length,6);
 assert.match(doc.body.textContent,/not additive/);
 assert.match(doc.body.textContent,/benchmark is a reporting choice/);
 assert.match(doc.body.textContent,/\$32bn/);assert.match(doc.body.textContent,/\$32.2bn/);
 for(const block of doc.querySelectorAll('section[aria-labelledby^="tax-"],.tax-item'))assert.match(block.textContent,/Treasury.*2025-26 statement.*Snapshot.*CC BY 4\.0/s);
 assert.equal(doc.querySelectorAll('a[href^="/subject/"]').length,0);
});

test('page and CSV never sum non-additive items and show only Treasury published totals',async()=>{
 const h=fixture(),base=h.rows[0];
 h.rows.push({...base,item_id:'All items',published:true,value:99999999,title:'Calculated total'});
 h.rows.push({...base,item_id:'A999',published:true,value:88888888});
 h.rows.push({...base,published:false,value:77777777});
 const rows=taxExpendituresRows(h),csv=toCSV(rows,taxExpendituresTableConfig(rows));
 assert.equal(rows.length,2444);assert.doesNotMatch(csv,/Calculated total|99999999|88888888|77777777/);
 assert.deepEqual([...new Set(rows.filter(r=>r.record_kind!=='item').map(r=>r.item_id))],['C2+C3','C1+C4']);
 assert.doesNotMatch((await page(h)).prerender,/Calculated total|99999999|88888888|77777777/);
});

test('negative, unquantified, nil and non-zero rounding codes survive CSV exactly',()=>{
 const rows=taxExpendituresRows(fixture());
 for(const marker of ['-','..','*']){
  const row=rows.find(r=>r.source_value===marker);assert.ok(row);assert.equal(row.value,null);assert.equal(row.estimate_display,marker);
  const csv=toCSV([row],taxExpendituresTableConfig(rows));assert.ok(csv.includes(','+marker+','));assert.ok(!csv.includes(",'"+marker+','));
 }
 assert.ok(rows.some(r=>r.value<0 && r.amount<0));assert.ok(rows.some(r=>r.included_in && /included in/.test(r.estimate_status)));
});


test('withheld cells stay in internal reconciliation and are absent from hub, serving, hydration and CSV',async()=>{
 const source=readFileSync(new URL('../../data/staged/tax-expenditures/series.jsonl',import.meta.url),'utf8').trim().split('\n').map(JSON.parse);
 const checks=JSON.parse(readFileSync(new URL('../../data/staged/tax-expenditures/reconciliation.json',import.meta.url)));
 const withheld=source.filter(r=>r.source_value==='nfp');assert.equal(withheld.length,4);
 assert.deepEqual(withheld.map(r=>[r.item_id,r.measure_year,r.cell]),[['G8','2025-26','G280'],['G8','2026-27','H280'],['G8','2027-28','I280'],['G8','2028-29','J280']]);
 for(const r of withheld)assert.ok(checks.some(c=>c.item_id===r.item_id && c.year===r.measure_year && c.workbook_cell===r.cell && c.workbook_value==='nfp' && c.statement_value==='nfp' && c.status==='pass'));
 const hubJSON=JSON.stringify(staged);assert.doesNotMatch(hubJSON,/nfp|not for publication|[G-J]280/);
 // Inject old or malformed rows to exercise the independent serving boundary.
 const h=fixture();h.rows.push(...withheld);
 for(const r of withheld)h.items.find(i=>i.item_id===r.item_id).cells[r.measure_year]=r.cell;
 for(const r of withheld)h.rows.push({...r,source_value:null});
 const rows=taxExpendituresRows(h);assert.equal(rows.length,2444);
 assert.ok(!rows.some(r=>r.item_id==='G8' && r.measure_year>='2025-26'));
 assert.doesNotMatch(toCSV(rows,taxExpendituresTableConfig(rows)),/nfp|not for publication|[G-J]280/);
 const result=await page(h);assert.equal(result.status,200);assert.doesNotMatch(result.prerender,/nfp|not for publication|[G-J]280/);
 const dom=new JSDOM(result.prerender,{url:'https://opax.test/register/tax-expenditures'});
 const original=globalThis.MutationObserver;globalThis.MutationObserver=dom.window.MutationObserver;
 try{hydrateRegisterTables(dom.window.document);await new Promise(setImmediate);assert.doesNotMatch(dom.serialize(),/nfp|not for publication|[G-J]280/)}
 finally{dom.window.document.body.replaceChildren();await new Promise(setImmediate);globalThis.MutationObserver=original;dom.window.close()}
});

test('licence, hash, identity, unknown codes and cell gates exclude rows from HTML, hydration and CSV',async()=>{
 for(const mutate of [h=>h.documents.forEach(d=>d.status='held'),h=>h.documents.forEach(d=>d.licence.document_reviewed=false),h=>h.documents.forEach(d=>d.exceptions=['Unreviewed notice']),h=>h.rows.forEach(r=>r.sha256='f'.repeat(64)),h=>h.rows.forEach(r=>r.cell='Z999'),h=>h.rows.forEach(r=>r.source_value='unknown')]){
  const h=fixture();mutate(h);assert.deepEqual(clearedTaxExpenditures(h),[]);assert.equal((await page(h)).status,503);
 }
});

test('missing asset keeps readiness closed, populated snapshot opens it; no non-read methods',async()=>{
 const req=new Request('https://opax.test/tax-expenditures/ready.json');
 assert.deepEqual(await(await taxExpendituresReady(req,async()=>{throw Error('Not promoted')})).json(),{ready:false,count:0});
 assert.deepEqual(await(await taxExpendituresReady(req,async()=>fixture())).json(),{ready:true,count:2444});
 assert.equal((await taxExpendituresReady(new Request(req,{method:'POST'}),async()=>fixture())).status,405);
});

test('hydrated table uses SSR data and source codes without a remote request',async()=>{
 const h=fixture();h.rows=h.rows.filter(r=>r.measure_year==='2025-26').slice(0,15);
 const dom=new JSDOM((await page(h)).prerender,{url:'https://opax.test/register/tax-expenditures'});
 const original=globalThis.MutationObserver;globalThis.MutationObserver=dom.window.MutationObserver;let requests=0;
 dom.window.fetch=async()=>{requests++;throw Error('Unexpected request')};
 try{hydrateRegisterTables(dom.window.document);await new Promise(setImmediate);assert.equal(requests,0);assert.equal(dom.window.document.querySelectorAll('[data-datatable] tbody tr').length,15);}
 finally{dom.window.document.body.replaceChildren();await new Promise(setImmediate);globalThis.MutationObserver=original;dom.window.close()}
});

test('invalid or repeated query selectors fail closed and Money link is gated',async()=>{
 for(const q of ['?tax.q=a&tax.q=b','?invented=1'])assert.equal((await page(fixture(),q)).status,400);
 await import('../public/navigation.js');const nav=globalThis.OpaxNavigation;
 assert.equal(nav.active('/register/tax-expenditures'),'money');
 assert.equal(nav.groups.find(g=>g.id==='money').columns.flatMap(c=>c.links).find(l=>l.href==='/register/tax-expenditures').gate,'tax-expenditures');
});
