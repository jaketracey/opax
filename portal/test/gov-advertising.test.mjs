import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {applyQuery,toCSV} from '../public/datatable.js';
import {govAdvertisingTableConfig,hydrateRegisterTables} from '../public/register-tables.js';
const bundle=await build({entryPoints:[new URL('../src/gov-advertising.ts',import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false});
const {govAdvertisingPage,clearedAdvertising,advertisingTableRows}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const fixture=JSON.parse(readFileSync(new URL('./fixtures/gov-advertising.json',import.meta.url)));
const agencies=[{id:'a-aaaaaaaaaaaaaaaaaaaa',name:'Department of Example Services'}];
const block=(title,text,links='')=>`<h1>${title}</h1><p>${text}</p>${links}`;
const render=(query='',hub=fixture,roster=agencies)=>govAdvertisingPage(new URL('https://opax.test/register/gov-advertising'+query),async()=>hub,block,roster);

test('SSR totals, table, source, snapshot, hashes, categories and reconciliation',async()=>{
 const page=await render();assert.equal(page.status,200);assert.equal(page.noindex,false);
 const doc=new JSDOM(page.prerender).window.document;
 assert.equal(doc.querySelectorAll('[data-datatable] tbody tr').length,2);
 assert.match(page.prerender,/Totals by financial year/);assert.match(page.prerender,/Totals by entity and year/);
 assert.match(page.prerender,/row sum \$400\.00 · report total \$400\.00 · difference \$0\.00/);
 assert.match(page.prerender,/page 10 table 1 total/);assert.match(page.prerender,/Document SHA-256/);
 assert.equal(doc.querySelectorAll('a[href="/subject/agency/a-aaaaaaaaaaaaaaaaaaaa"]').length,1);
 for(const section of doc.querySelectorAll('.gov-advertising-content > section'))assert.match(section.textContent,/Department of Finance[\s\S]*Snapshot[\s\S]*CC BY 4.0/);
 const config=govAdvertisingTableConfig(advertisingTableRows(clearedAdvertising(fixture),agencies));
 assert.ok(config.columns.some(c=>c.key==='media'));assert.ok(!config.columns.some(c=>c.key==='gst'));
});
test('held source displays unknown totals and no invented spending or cleared licence',async()=>{
 const result=await render('',null);assert.equal(result.status,200);assert.equal(result.noindex,true);
 assert.match(result.prerender,/Source verification pending/);assert.match(result.prerender,/does not mean expenditure was zero/);
 assert.match(result.prerender,/TimeoutError/);assert.match(result.prerender,/Licence: Unverified/);
 assert.doesNotMatch(result.prerender,/\$0|CC BY|Example public information/);
 const doc=new JSDOM(result.prerender).window.document;assert.ok(doc.querySelector('[data-datatable]'));
 assert.equal(doc.querySelector('[data-export]').disabled,true);
});
test('licence, source, row provenance and report total corruption fail closed',async()=>{
 for(const change of [h=>h.documents[0].licence.status='held',h=>h.documents[0].licence.scope_sha256='0'.repeat(64),
  h=>h.documents[0].licence.url='https://creativecommons.org/licenses/by-nc-nd/4.0/',h=>h.documents[0].licence.terms='No commercial reuse without permission',
  h=>h.documents[0].receipt.status=403,h=>h.documents[0].receipt.challenge=true,
  h=>h.rows[0].sha256='0'.repeat(64),h=>h.rows[0].total_cents=1,
  h=>h.rows[0].source_url='https://example.test/source',h=>h.rows[0].source_locator='',
  h=>h.rows[0].categories_cents.media=-1,h=>h.reconciliation[0].report_total_cents=1]){
  const changed=structuredClone(fixture);change(changed);
  assert.deepEqual(clearedAdvertising(changed),[]);
  const page=await render('',changed);assert.equal(page.status,503);assert.doesNotMatch(page.prerender,/Example public information/);
 }
 const changed=structuredClone(fixture);changed.rows[0].private_contact='HELD PRIVATE FIELD';
 const csv=toCSV(advertisingTableRows(clearedAdvertising(changed),agencies),govAdvertisingTableConfig([]));
 assert.doesNotMatch(csv,/HELD PRIVATE FIELD/);
});
test('exact unique agency match only; approximate, case-changed and duplicate names stay unlinked',()=>{
 const rows=clearedAdvertising(fixture);
 for(const roster of [[{...agencies[0],name:'DEPARTMENT OF EXAMPLE SERVICES'}],[{...agencies[0],name:'Department of Example'}],[agencies[0],{...agencies[0],id:'a-bbbbbbbbbbbbbbbbbbbb'}]]){
  assert.equal(advertisingTableRows(rows,roster)[0].agency_href,null);
 }
 assert.equal(advertisingTableRows(rows,agencies)[0].agency_href,'/subject/agency/'+agencies[0].id);
 assert.equal(advertisingTableRows(rows,agencies)[1].agency_href,null);
});
test('search, filters, sort, CSV, bookmarks and invalid query state',async()=>{
 const config=govAdvertisingTableConfig(advertisingTableRows(clearedAdvertising(fixture),agencies));
 const selected=applyQuery(config.rows,config,{q:'awareness',filters:{financial_year:['2024-25']},sort:{key:'total',dir:'desc'}});
 assert.equal(selected.total,1);assert.equal(selected.rows[0].total,250);
 const csv=toCSV(selected.rows,config);assert.match(csv,/2024-25/);assert.match(csv,/250/);assert.match(csv,/CC BY 4.0/);assert.match(csv,/page 10 table 1 row 2/);assert.match(csv,/SHA-256/);
 const result=await render('?advertising.q=awareness&advertising.sort=total:desc');assert.equal(result.status,200);
 assert.equal(JSON.parse(new JSDOM(result.prerender).window.document.querySelector('[data-dt-page]').textContent).total,1);
 assert.equal((await render('?advertising.q=a&advertising.q=b')).status,400);
 assert.equal((await render('?unknown=1')).status,400);assert.equal((await render('?advertising.page=999')).status,404);
});
test('shared hydration restores source/licence links and agency link after search',async()=>{
 const result=await render(),dom=new JSDOM(result.prerender,{url:'https://opax.test/register/gov-advertising'}),doc=dom.window.document;
 const previous=globalThis.MutationObserver;globalThis.MutationObserver=dom.window.MutationObserver;
 try{
  hydrateRegisterTables(doc);await new Promise(setImmediate);
  const input=doc.querySelector('[data-search]');input.value='public information';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  await new Promise(done=>setTimeout(done,450));
  const data=JSON.parse(doc.querySelector('[data-dt-page]').textContent);assert.equal(data.total,1);
  assert.ok(doc.querySelector('tbody a[href="/subject/agency/a-aaaaaaaaaaaaaaaaaaaa"]'));
  assert.ok(doc.querySelector('tbody a[href="https://creativecommons.org/licenses/by/4.0/"]'));
  assert.match(doc.querySelector('tbody').textContent,/page 10 table 1 row 1/);
 }finally{doc.body.replaceChildren();await new Promise(setImmediate);globalThis.MutationObserver=previous;dom.window.close();}
});
