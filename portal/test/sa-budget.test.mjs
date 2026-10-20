import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {budgetPage} from '../src/budget.ts';
import {clearedSABudget,saBudgetRows,saBudgetSection} from '../src/sa-budget.ts';
import {saBudgetConfig,saBudgetPhoneColumns,saBudgetValue,decorateSABudgetTable} from '../public/sa-budget-table.js';
import {toCSV} from '../public/datatable.js';

const root=new URL('../../',import.meta.url);
const h=JSON.parse(execFileSync('python3',['-c',"import json,sys;from scripts.sa_budget.check import projection;json.dump(projection(json.load(open('data/staged/sa-budget/hub.json'))),sys.stdout)"],{cwd:root,encoding:'utf8'}));
const fiscal=JSON.parse(readFileSync(new URL('../../data/staged/budget/hub.json',import.meta.url),'utf8'));
const block=(title,text)=>`<section><h1>${title}</h1><p>${text}</p></section>`;
const read=async path=>structuredClone(path==='/sa-budget/data.json'?h:fiscal);

test('historical SA section server-renders four shared tables, cell citations and verbatim notices',async()=>{
 const p=await budgetPage(new URL('https://opax.com.au/budget?year=2015-16'),read,block);
 assert.equal(p.status,200);
 const d=new JSDOM(p.prerender).window.document;
 assert.equal(d.querySelectorAll('#sa-budget [data-datatable]').length,4);
 assert.match(d.querySelector('#sa-budget').textContent,/2015–16 historical budget vintage, not the current budget/);
 assert.match(d.querySelector('#sa-budget').textContent,/Note: Real-terms calcualtions use the Adelaide Consumer Price Index/);
 assert.match(d.querySelector('#sa-budget').textContent,/Note: Totals may not add due to rounding/);
 for(const table of d.querySelectorAll('[data-sa-budget-table]')){
  assert.ok(table.querySelector('tbody tr'));
  const section=table.parentElement;
  assert.match(section.textContent,/Snapshot 20 Oct 2026 UTC/);
  assert.equal(section.querySelector('time').getAttribute('datetime'),h.documents.find(r=>r.table_number===table.dataset.saBudgetTable).snapshot);
  assert.match(section.textContent,/CC BY 4.0/);
  assert.match(section.textContent,/SHA-256 [a-f0-9]{64}/);
  assert.ok(section.querySelector('a[href*="/resource/"]'));
 }
 assert.ok(d.querySelector('#sa-budget a[href^="/register/government-finance"]'));
 const texts=[...d.querySelectorAll('[data-sa-budget-rows]')].flatMap(s=>JSON.parse(s.textContent));
 assert.equal(texts.length,447);
 assert.equal(texts.filter(r=>r.source_marker==='—').length,29);
 for(const warning of h.holds[0].warnings)assert.ok(d.querySelector('#sa-function-file').parentElement.textContent.includes(warning));
 assert.equal(texts.some(r=>r.resource_id===h.holds[0].id),false);
});

test('phone render includes Measure, Fiscal year and Value with status under the measure',()=>{
 const doc=new JSDOM(saBudgetSection(h,new URL('https://opax.com.au/budget'))).window.document;
 assert.deepEqual(saBudgetPhoneColumns,['measure','fiscal_year','display_value']);
 for(const root of doc.querySelectorAll('[data-sa-budget-table]')){
  const config=saBudgetConfig([],root.dataset.saBudgetTable);
  assert.ok(config.columnsVisible.includes('display_value'));
  assert.deepEqual([...root.querySelectorAll('thead th[data-sa-column]')].map(n=>n.textContent.trim()),['Measure','Fiscal year','Value']);
  assert.equal(root.querySelector('caption').textContent,'SA Treasury · Table '+root.dataset.saBudgetTable);
  assert.ok(root.querySelector('tbody [data-label="Value"]').textContent.includes('$'));
  assert.ok(root.querySelector('tbody [data-label="Measure"] .sa-budget-status').textContent);
 }
 const rows=saBudgetRows(h);
 assert.equal(rows.find(r=>r.cell==='D6'&&r.table_number==='1.3').display_value,'$43m');
 assert.equal(rows.find(r=>r.cell==='B10'&&r.table_number==='1.3').display_value,'-2.4%');
 assert.equal(saBudgetValue({value:-1250,units:'AUD million'}),'−$1,250m');
 assert.equal(saBudgetValue({value:null,source_marker:'—'}),'—');
});

test('fiscal year nowrap and responsive column rules are scoped to SA, with canonical years in CSV',()=>{
 const css=readFileSync(new URL('../public/budget.css',import.meta.url),'utf8');
 assert.match(css,/#sa-budget \.dt \[data-label="Fiscal year"\]\{white-space:nowrap\}/);
 assert.match(css,/@media\(max-width:760px\)/);
 const doc=new JSDOM(saBudgetSection(h,new URL('https://opax.com.au/budget'))).window.document;
 assert.equal(doc.querySelector('[data-label="Fiscal year"]').textContent,'2013-14');
 const csv=toCSV(saBudgetRows(h),saBudgetConfig(saBudgetRows(h),'1.3'));
 assert.match(csv,/2013-14/);
 assert.ok(csv.includes(h.documents[0].snapshot));
});

test('SA secondary status can be restored after the shared table repaints',()=>{
 const doc=new JSDOM(saBudgetSection(h,new URL('https://opax.com.au/budget'))).window.document;
 const root=doc.querySelector('[data-sa-budget-table]');
 root.querySelectorAll('.sa-budget-status').forEach(n=>n.remove());
 root.querySelectorAll('th[data-sa-column]').forEach(n=>n.removeAttribute('data-sa-column'));
 decorateSABudgetTable(root);
 assert.equal(root.querySelector('.sa-budget-status').textContent,'Actual');
 assert.equal(root.querySelectorAll('thead [data-sa-column]').length,3);
 decorateSABudgetTable(root);
 assert.equal(root.querySelectorAll('.sa-budget-status').length,10);
});

test('HTML, hydration and CSV exclude computed totals, held values, unreviewed rights and altered cells',()=>{
 const bad=structuredClone(h),first=bad.rows[0];
 bad.rows.push({...first,cell:'Z999',measure:'OPAX computed total fixture',value:987654321,computed:true},
  {...first,cell:'Z998',measure:'Unpublished aggregate fixture',value:876543219},
  {...first,value:765432198}, {...first,resource_id:h.holds[0].id,value:654321987});
 bad.rows[0].internal_component_sum=543219876;
 assert.equal(clearedSABudget(bad).length,447);
 for(const output of [saBudgetSection(bad,new URL('https://opax.com.au/budget')),toCSV(saBudgetRows(bad),saBudgetConfig(saBudgetRows(bad),'1.3'))]){
  assert.doesNotMatch(output,/987654321|876543219|765432198|654321987|543219876|OPAX computed total|Unpublished aggregate|internal_component_sum/);
 }
 for(const key of ['dataset_explicit','resource_explicit','file_notices_reviewed']){
  const changed=structuredClone(h);changed.documents[0].licence[key]=false;
  assert.equal(clearedSABudget(changed).length,405);
 }
 const changed=structuredClone(h);changed.documents[0].hold='fixture rights hold';
 assert.equal(clearedSABudget(changed).length,405);
 const csv=toCSV(saBudgetRows(h),saBudgetConfig(saBudgetRows(h),'1.3'));
 assert.equal(csv.split('\r\n').length,448);
 assert.match(csv,/Stored cell value/);assert.match(csv,/Excel display divisor/);
});

test('optional historical asset fails closed without changing the existing federal page',async()=>{
 const p=await budgetPage(new URL('https://opax.com.au/budget'),async path=>{
  if(path==='/sa-budget/data.json')throw Error('No reviewed annual asset');return fiscal;
 },block);
 assert.equal(p.status,200);assert.doesNotMatch(p.prerender,/id="sa-budget"/);
 assert.equal(saBudgetSection({...h,rows:[]},new URL('https://opax.com.au/budget')),'');
});

test('SA filters remain separate and every output value has a unique original cell',()=>{
 const text=saBudgetSection(h,new URL('https://opax.com.au/budget?sa13.q=Net%20debt'));
 const d=new JSDOM(text).window.document;
 assert.ok(d.querySelector('[data-sa-budget-table="1.3"] tbody').textContent.includes('Net debt'));
 assert.equal(new Set(clearedSABudget(h).map(r=>r.resource_id+'!'+r.sheet+'!'+r.cell)).size,447);
 const source=readFileSync(new URL('../public/sa-budget.js',import.meta.url),'utf8');
 assert.match(source,/mountDataTable/);assert.doesNotMatch(source,/reduce\(|sum\(|aggregate/);
});

test('search catalogue and MCP have no SA numerical source; production assets remain unpromoted',()=>{
 const builder=readFileSync(new URL('../../scripts/build_search_catalog.mjs',import.meta.url),'utf8');
 const mcp=readFileSync(new URL('../src/community-mcp.ts',import.meta.url),'utf8');
 for(const source of [builder,mcp])assert.doesNotMatch(source,/sa-budget|scripts\.sa_budget|data\/staged/);
 const walk=dir=>readdirSync(dir).flatMap(name=>{const path=new URL(name,dir);return statSync(path).isDirectory()?walk(new URL(name+'/',dir)):[path];});
 for(const file of walk(new URL('../public/search-catalog/',import.meta.url)).filter(f=>f.pathname.endsWith('.json'))){
  const data=readFileSync(file,'utf8');
  assert.doesNotMatch(data,/3f756590-9e67-4a05-97a0-f594247d2c72|OPAX computed total fixture|internal_component_sum|sa-budget\/data\.json/);
 }
});

test('MCP fixture searches published records only and never opens a staged SA workbook',async()=>{
 const bundle=await build({entryPoints:[new URL('../src/community-mcp.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
 const {communityMcp}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 const env={COMMUNITY_ENABLED:'true',COMMUNITY_ORIGIN:'https://opax.com.au',COMMUNITY_DB:{prepare(sql){return {
  bind(){return this;},async first(){return sql.startsWith('SELECT m.')?{id:'fixture-member',key_id:'fixture-key'}:{hits:1};},async run(){return {success:true};},
 };}},ASSETS:{async fetch(){throw Error('SA staging must not be read');}}};
 const paths=[];
 const response=await communityMcp(new Request('https://opax.com.au/mcp',{method:'POST',headers:{authorization:'Bearer opax_'+'A'.repeat(43),accept:'application/json, text/event-stream','content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'search_records',arguments:{query:'South Australian historical budget',kind:'all'}}})}),env,async path=>{
  paths.push(path);assert.ok(path.startsWith('/api/search-all?'));
  return Response.json({results:[],total:0});
 });
 assert.equal(response.status,200);
 assert.equal(paths.length,1);
 const text=await response.text();
 assert.doesNotMatch(text,/internal_component_sum|computed total|3f756590|sa-budget/);
});
