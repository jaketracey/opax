import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {governmentFinancePage,governmentFinanceRows} from '../src/government-finance.ts';
import {governmentFunctionRows} from '../src/government-finance-functions.ts';
import {governmentFinanceTableConfig,governmentFunctionTableConfig} from '../public/register-tables.js';
import {formatCell,toCSV} from '../public/datatable.js';
import {searchCatalog} from '../src/catalog-search.ts';

const repository=new URL('../../',import.meta.url),options={cwd:repository,encoding:'utf8',maxBuffer:32*1024*1024};
const verifyOriginals=process.env.OPAX_GFS_VERIFY_ORIGINALS==='1';
const fixture=JSON.parse(execFileSync('python3',['tests/fixtures/abs_gfs_public_outputs.py',...(verifyOriginals?['--verify-originals']:[])],options));
const hub=fixture.asset,sourceRows=[...hub.rows,...hub.function_rows];
const locator=r=>`${r.workbook} · ${r.sheet}!${r.cell}`;
const originals=new Map(sourceRows.map(r=>[locator(r),r]));
const noDiagnostics=output=>{
 assert.doesNotMatch(output,/internal_probe|internal_computed_sum_million|delta_million|tolerance_million/);
 for(const probe of fixture.probes)assert.ok(!output.includes(String(probe)),String(probe));
};
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('Public-output tests must never use the network');};
test.after(()=>{globalThis.fetch=originalFetch;});

test('real and fixture promoted assets and both CSVs retain workbook cells, never diagnostic division, education or group sums',()=>{
 assert.equal(fixture.source_observations_traced,8246);
 assert.equal(fixture.original_cells_verified,verifyOriginals?8246:0);noDiagnostics(JSON.stringify(hub));
 const publicAsset=JSON.parse(readFileSync(new URL('../public/government-finance/data.json',import.meta.url),'utf8'));
 noDiagnostics(JSON.stringify(publicAsset));
 assert.deepEqual(publicAsset.rows,hub.rows);assert.deepEqual(publicAsset.function_rows,hub.function_rows);
 const controls=Object.values(fixture.rounding_controls);assert.equal(controls.length,3);
 for(const {published,computed_sum_million} of controls){
  assert.notEqual(published.value,computed_sum_million);
  assert.equal(hub.function_rows.find(r=>locator(r)===locator(published)).value,published.value);
 }
 for(const [rows,config] of [[governmentFinanceRows(hub),governmentFinanceTableConfig],[governmentFunctionRows(hub),governmentFunctionTableConfig]]){
  const csv=toCSV(rows,config(rows));noDiagnostics(csv);
  const exported=JSON.parse(execFileSync('python3',['-c','import csv,json,sys; print(json.dumps(list(csv.DictReader(sys.stdin))))'],{...options,input:csv}));
  assert.equal(exported.length,rows.length);
  for(const row of exported){
   const source=originals.get(row['Original cell']);assert.ok(source,row['Original cell']);
   assert.equal(row['Source URL'],source.source_url);assert.equal(row['SHA-256'],source.sha256);
   assert.equal(row['Published value (AUD million)'],source.value===null?'':String(source.value));
   assert.equal(row['Amount (AUD)'],source.value===null?'':String(source.value*1e6));
  }
 }
});

test('SSR cards, table amounts and hydration use original cells even where diagnostic sums differ by rounding',async()=>{
 for(const {published,computed_sum_million} of Object.values(fixture.rounding_controls)){
  const query=new URLSearchParams({level:published.level_of_government,sector:published.sector,jurisdiction:published.jurisdiction,'gfsFunction.q':locator(published)});
  const result=await governmentFinancePage(new URL('https://opax.test/register/government-finance?'+query),async()=>hub,(title,text)=>`<h1>${title}</h1><p>${text}</p>`);
  assert.equal(result.status,200);noDiagnostics(result.prerender);
  const doc=new JSDOM(result.prerender).window.document;
  for(const script of doc.querySelectorAll('[data-register-config]'))for(const row of JSON.parse(script.textContent).config.rows){
   const source=originals.get(row.source_locator);assert.ok(source,row.source_locator);
   assert.equal(row.value_million,source.value);assert.equal(row.amount,source.value===null?null:source.value*1e6);
  }
  for(const link of doc.querySelectorAll('article dl a[title]')){
   const source=originals.get(link.title);assert.ok(source,link.title);
   assert.equal(link.textContent,source.value===null?'Not published':formatCell(source.value*1e6,{key:'amount',label:'Amount',type:'money'}));
  }
  const rows=doc.querySelectorAll('#government-function-table tbody tr');assert.equal(rows.length,1);
  assert.equal(rows[0].querySelector('[data-label="Original cell"]').textContent,locator(published));
  assert.equal(rows[0].querySelector('[data-label="Amount (AUD)"]').textContent,formatCell(published.value*1e6,{key:'amount',label:'Amount',type:'money'}));
  assert.notEqual(originals.get(locator(published)).value,computed_sum_million);
  doc.defaultView.close();
 }
});

test('built search catalogue and authenticated local /mcp never expose GFS reconciliation records or sums',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../public/search-catalog/manifest.json',import.meta.url)));
 let records=0;
 for(let shard=0;shard<Math.ceil(manifest.count/manifest.recordShardSize);shard++){
  const raw=await readFile(new URL(`../public/search-catalog/${manifest.version}/records-${shard}.json`,import.meta.url),'utf8');
  noDiagnostics(raw);
  for(const record of JSON.parse(raw)){
   // Only the collection entry is discoverable. GFS observations remain in
   // the register; catalogue and MCP never expose workbook or diagnostic rows.
   if(record.href?.startsWith('/register/government-finance')) {
    assert.equal(record.kind,'page');
    assert.equal(record.href,'/register/government-finance');
    assert.equal(record.title,'Government finance');
    assert.equal(record.source,'OPAX published pages');
    assert.equal(record.record_id,undefined);
    assert.equal(record.url,undefined);
    assert.equal(record.date,undefined);
   }
   assert.doesNotMatch(JSON.stringify(record),/55120DO\d{3}_202425|function-reconciliation/);records++;
  }
 }
 assert.equal(records,manifest.count);
 const assets={fetch:async req=>{
  const path=new URL(req.url).pathname;assert.match(path,/^\/search-catalog\//);
  return new Response(await readFile(new URL('../public'+path,import.meta.url)),{headers:{'content-type':'application/json'}});
 }};
 const bundled=await build({entryPoints:[new URL('../src/community-mcp.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
 const {communityMcp}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
 const token='opax_'+'A'.repeat(43),hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
 let publicReads=0;
 const env={COMMUNITY_ENABLED:'true',COMMUNITY_ORIGIN:'https://opax.test',ASSETS:assets,COMMUNITY_DB:{prepare(sql){let args;return {
  bind(...values){args=values;return this;},async first(){
   if(sql.startsWith('SELECT m.'))return args[0]===hash?{id:'fixture-member',key_id:'fixture-key'}:null;
   assert.ok(sql.startsWith('INSERT INTO community_limits'));return {hits:1};
  },async run(){return {success:true};}
 };}}};
 const send=async(method,params={})=>{
  const response=await communityMcp(new Request('https://opax.test/mcp',{method:'POST',headers:{authorization:'Bearer '+token,accept:'application/json, text/event-stream','content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),env,async path=>{
   publicReads++;assert.ok(path.startsWith('/api/search-all?'));
   return Response.json(await searchCatalog(new URL(path,'https://opax.test'),assets));
  });assert.equal(response.status,200);const raw=await response.text();noDiagnostics(raw);return JSON.parse(raw);
 };
 const listed=await send('tools/list');assert.ok(listed.result.tools.every(t=>!/gfs|government_finance|reconcil/i.test(t.name)));
 for(const probe of fixture.probes){
  const found=await searchCatalog(new URL('https://opax.test/api/search-all?'+new URLSearchParams({q:String(probe),kind:'all'})),assets);
  assert.equal(found.total,0);noDiagnostics(JSON.stringify(found));
  const rpc=await send('tools/call',{name:'search_records',arguments:{query:String(probe),kind:'all'}});
  assert.equal(rpc.result.isError,false);assert.deepEqual(JSON.parse(rpc.result.content[0].text).results,[]);
 }
 assert.equal(publicReads,3);
 const rejected=await send('tools/call',{name:'read_record',arguments:{slug:'abs-gfs-function-reconciliation'}});
 assert.equal(rejected.result.isError,true);assert.equal(publicReads,3);
});
