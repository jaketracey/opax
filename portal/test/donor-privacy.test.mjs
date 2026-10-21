/** Money-table privacy: synthetic suppliers only, never identity nodes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildTableSQL} from '../../scripts/load_tables.mjs';
import {JSDOM} from 'jsdom';
import {tableApi} from '../src/table-api.ts';
import {actInvoicesPage} from '../src/act-invoices.ts';
import {actInvoicesConfig,actInvoicesURL} from '../public/act-invoices-table.js';
import {tableDatabase} from './table-d1-harness.mjs';
import {decodeActInvoicesSnapshot} from '../../scripts/act_invoices/table-snapshot.mjs';
import {actMetadata,actRow,actBundle} from './act-invoices-fixture.mjs';
import {build} from 'esbuild';
const local=await tableDatabase({datasets:{'act-invoices':[1,2].map(i=>({row:actRow(i)}))},metadata:{'act-invoices':actMetadata}});
test.after(()=>local.close());
const env={TABLE_DB:local.db};
const api=(params={})=>tableApi(new Request('https://opax.test/api/table/act-invoices?'+new URLSearchParams(params)),env);
const block=(title,description,links='')=>`<h1>${title}</h1><p>${description}</p>${links}`;

test('supplier and ABN stay in source rows and CSV, without identity facets or links',async()=>{
 const response=await api();assert.equal(response.status,200);const page=await response.json();
 assert.equal(page.total,2);assert.equal(page.rows.length,2);
 assert.deepEqual(Object.keys(page.facets).sort(),['amount','financial_year','month','reporting_entity']);
 assert.doesNotMatch(JSON.stringify(page.facets),/Morgan Synthetic|00000000000/);
 const config=actInvoicesConfig();assert.equal(config.primaryLink,undefined);assert.equal(config.actions,undefined);
 for(const key of ['supplier_name','supplier_abn']){const c=config.columns.find(c=>c.key===key);assert.equal(c.facet,undefined);assert.equal(c.sortable,false);assert.equal(c.href,undefined);}
 const html=(await actInvoicesPage(new URL('https://opax.test/register/act-invoices'),env,block)).prerender;
 const d=new JSDOM(html).window.document;
 assert.equal(d.querySelector('[data-label="Supplier"]').textContent,'Morgan Synthetic Trading');assert.equal(d.querySelector('[data-label="Supplier"] a'),null);
 assert.doesNotMatch(html,/\/supplier\/|\/person\/|abn:|supplier_id|person_id/);
 const csv=await (await api({format:'csv'})).text();
 for(const value of ['Morgan Synthetic Trading','00000000000','kzmf-7uhp','ACT Government','1250.50'])assert.ok(csv.includes(value));
 assert.doesNotMatch(csv,/\/supplier\/|\/person\/|supplier_id|person_id|total_value|sum_amount/);
});

test('FTS searches description and public reporting body only',async()=>{
 for(const q of ['Morgan','00000000000','SYNTHETIC-1']){const response=await api({q});assert.equal(response.status,200);assert.equal((await response.json()).total,0);}
 for(const q of ['repairs','Example Territory Agency'])assert.equal((await(await api({q})).json()).total,2);
 const fts=await local.db.prepare('SELECT search FROM table_act_invoices').all();
 for(const row of fts.results)assert.doesNotMatch(row.search,/Morgan|00000000000|SYNTHETIC-1/);
 assert.deepEqual((await local.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'table_act_invoices_supplier%' ").all()).results,[]);
});

test('identity filters/sorts and spoofed body labels fail without echo',async()=>{
 for(const params of [{'f.supplier_name':'["Morgan Synthetic Trading"]'},{'f.supplier_abn':'["00000000000"]'},{'f.contract_number':'["SYNTHETIC-1"]'},{supplier:'Morgan Synthetic Trading'},{donor:'Morgan Synthetic Trading'},{sort:'supplier_name:asc'},{sort:'supplier_abn:asc'},{'f.reporting_entity':'["Morgan Synthetic Trading"]'},{'f.month':'["00000000000"]'}]){
  for(const format of [undefined,'csv']){const response=await api({...params,...(format?{format}:{})});assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'invalid_query'});}
 }
});

test('HTML and URL state scrub supplier facets and fake agency labels',async()=>{
 for(const params of [{'t.f.supplier_name':'["Morgan Synthetic Trading"]'},{'t.f.supplier_abn':'["00000000000"]'},{'t.sort':'supplier_name:asc'},{'t.f.reporting_entity':'["Morgan Synthetic Trading"]'}]){
  const url=new URL('https://opax.test/register/act-invoices?'+new URLSearchParams(params));const result=await actInvoicesPage(url,env,block);assert.equal(result.status,200);assert.equal(url.search,'');
  const d=new JSDOM(result.prerender).window.document;assert.doesNotMatch(d.querySelector('.dt-chips').textContent,/Morgan|00000000000/);
  for(const a of d.querySelectorAll('a[href]'))assert.doesNotMatch(a.href,/Morgan|00000000000|f.supplier/);
 }
 const guard=actInvoicesURL(new URL('https://opax.test/register/act-invoices?t.f.supplier_name=%5B%22Morgan%22%5D'));assert.equal(guard.url.search,'');assert.equal(guard.rejected,true);
});

test('period/entity/amount filters work; no threshold dropping or monetary totals',async()=>{
 const result=await api({'f.reporting_entity':'["Example Territory Agency"]','f.month':'["2026-09"]','f.amount':'{"max":2000}'});assert.equal(result.status,200);
 const page=await result.json();assert.equal(page.total,2);assert.equal(page.rows[0].amount,1250.5);assert.deepEqual(Object.keys(page).sort(),['facets','page','pageSize','rows','total']);
 const html=(await actInvoicesPage(new URL('https://opax.test/register/act-invoices'),env,block)).prerender;
 for(const text of ['invoice value','not all ACT spending','no unique invoice ID','19 August 2025','Dataset ID:','Snapshot:','Snapshot SHA-256:','CC BY 4.0','ACT Government','July 2017'])assert.ok(html.includes(text));
 assert.doesNotMatch(html,/Total paid|Total spending|total_value|sum_amount/);
});

test('missing reviewed D1 receipt fails closed on page, rows and CSV',async()=>{
 await local.db.prepare("DELETE FROM table_meta WHERE key='act-invoices'").run();
 try{
  for(const params of [{},{format:'csv'}]){const r=await api(params);assert.equal(r.status,404);assert.doesNotMatch(await r.text(),/Morgan|00000000000/);}
  const result=await actInvoicesPage(new URL('https://opax.test/register/act-invoices'),env,block);assert.equal(result.status,404);assert.equal(result.noindex,true);assert.doesNotMatch(result.prerender,/Morgan|1250/);
 }finally{await local.db.prepare("INSERT INTO table_meta VALUES ('act-invoices',?)").bind(JSON.stringify(actMetadata)).run();}
});

test('private reviewed snapshot feeds D1 and rejects changed or unreviewed rows',()=>{
 const bundle=actBundle();const decoded=decodeActInvoicesSnapshot(bundle);assert.equal(decoded.rows.length,2);assert.equal(decoded.metadata.series_jsonl,undefined);
 for(const alter of [b=>b.promotion.reviewed_commit=null,b=>b.series_jsonl=b.series_jsonl.replace('1250.50','9999'),b=>b.promotion.counts.rows=1,b=>b.search_keys.push('supplier_name'),b=>b.nightly=true]){const changed=structuredClone(bundle);alter(changed);assert.throws(()=>decodeActInvoicesSnapshot(changed),/reload held/);}
});

test('catalogue, entity joins and MCP do not read invoice records',()=>{
 for(const path of ['../../scripts/build_search_catalog.mjs','../../scripts/export_money_graph.py','../../scripts/export_state_money.py','../src/community-mcp.ts'])assert.doesNotMatch(readFileSync(new URL(path,import.meta.url),'utf8'),/act-invoices|act_invoices|kzmf-7uhp/);
 const dir=new URL('../public/search-catalog/',import.meta.url);for(const file of readdirSync(dir).filter(f=>f.endsWith('.json')))assert.doesNotMatch(readFileSync(new URL(file,dir),'utf8'),/kzmf-7uhp|act-invoices\/|Morgan Synthetic/);
});

test('MCP search remains outside invoices for supplier-name queries',async()=>{
 const compiled=await build({entryPoints:[new URL('../src/community-mcp.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
 const {communityMcp}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));const paths=[];
 const mcpEnv={COMMUNITY_ENABLED:'true',COMMUNITY_ORIGIN:'https://opax.com.au',COMMUNITY_DB:{prepare(sql){return {bind(){return this;},async first(){return sql.startsWith('SELECT m.')?{id:'fixture-member',key_id:'fixture-key'}:{hits:1};},async run(){return {success:true};}};}},ASSETS:{async fetch(){throw Error('No invoice asset access');}}};
 const response=await communityMcp(new Request('https://opax.test/mcp',{method:'POST',headers:{authorization:'Bearer opax_'+'A'.repeat(43),accept:'application/json, text/event-stream','content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'search_records',arguments:{query:'Morgan Synthetic Trading',kind:'all'}}})}),mcpEnv,async path=>{paths.push(path);return Response.json({results:[],total:0});});
 assert.equal(response.status,200);assert.equal(paths.length,1);assert.ok(paths[0].startsWith('/api/search-all?'));assert.doesNotMatch(await response.text(),/Morgan|00000000000|act-invoices|1250/);
});


test('ordinary reload without an ACT artifact preserves last approved rows and receipt',async()=>{
 const retained=await tableDatabase({memorySQL:true,datasets:{'act-invoices':[{row:actRow()}]},metadata:{'act-invoices':actMetadata}});
 const output=await mkdtemp(join(tmpdir(),'opax-act-retention-'));
 try{
  const manifest=await buildTableSQL({output,datasets:{}});
  assert.equal(manifest.counts['act-invoices'],undefined);assert.deepEqual(manifest.retainedDatasets,['act-invoices']);
  for(const file of manifest.files)await retained.db.exec(await readFile(join(output,file),'utf8'));
  assert.equal(await retained.db.prepare('SELECT COUNT(*) AS n FROM table_act_invoices').first('n'),1);
  assert.equal(await retained.db.prepare("SELECT value FROM table_meta WHERE key='act-invoices'").first('value'),JSON.stringify(actMetadata));
  const response=await tableApi(new Request('https://opax.test/api/table/act-invoices'),{TABLE_DB:retained.db});
  assert.equal(response.status,200);assert.equal((await response.json()).total,1);
 }finally{await retained.close();await rm(output,{recursive:true,force:true});}
});
