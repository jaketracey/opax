import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {governmentFinancePage} from '../src/government-finance.ts';
import {clearedGovernmentFunctions,governmentFunctionRows} from '../src/government-finance-functions.ts';
import {governmentFunctionTableConfig,hydrateRegisterTables} from '../public/register-tables.js';
import {toCSV} from '../public/datatable.js';

const fixture=()=>JSON.parse(readFileSync(new URL('../../data/staged/abs-gfs/hub.json',import.meta.url),'utf8'));
const page=(h,query='')=>governmentFinancePage(new URL('https://opax.test/register/government-finance'+query),async()=>h,(title,text)=>`<h1>${title}</h1><p>${text}</p>`);

test('every headline and function heading identifies its published level and jurisdiction',async()=>{
 const h=fixture(),all=[...h.rows,...h.function_rows],expected={Commonwealth:'Commonwealth government',State:'Total state governments',Local:'Total local governments',
  'State and local':'Total state and local governments','Control n.f.d.':'Control n.f.d.','All levels of government':'Australia, all levels of government',National:'National general government'};
 const seen=new Set();
 for(const selection of new Set(all.map(r=>JSON.stringify([r.level_of_government,r.sector])))){
  const [level,sector]=JSON.parse(selection),result=await page(h,'?'+new URLSearchParams({level,sector}));
  assert.equal(result.status,200);
  const doc=new JSDOM(result.prerender).window.document;
  for(const card of doc.querySelectorAll('.gfs-jurisdiction,.gfs-function-jurisdiction')){
   const link=card.querySelector('a[title]'),source=all.find(r=>`${r.workbook} · ${r.sheet}!${r.cell}`===link.title && r.source_url===link.href);
   assert.ok(source,link.title);assert.equal(source.level_of_government,level);
   const heading=card.querySelector('h3').textContent;
   assert.equal(heading,source.jurisdiction==='Australia'?expected[level]:source.jurisdiction);
   assert.notEqual(heading,'Australia');assert.ok(!heading.includes('\u2014'));
   if(source.jurisdiction==='Australia')seen.add(level);
  }
  doc.defaultView.close();
 }
 assert.deepEqual([...seen].sort(),Object.keys(expected).sort());
});

test('function split and year-by-year table render on the server with source receipts',async()=>{
 const result=await page(fixture()),doc=new JSDOM(result.prerender).window.document;
 assert.equal(result.status,200);
 const section=doc.querySelector('[aria-labelledby="gfs-functions"]');
 assert.equal(section.querySelectorAll('.gfs-function-jurisdiction').length,9);
 assert.ok(section.querySelectorAll('#government-function-table tbody tr').length>0);
 assert.match(section.textContent,/Hospital|Health|Total health/);
 assert.match(section.textContent,/Snapshot.*CC BY 4.0/);
 assert.match(section.textContent,/labels without numeric classification codes/);
 assert.match(section.textContent,/Total Expenses/);
 for(const card of section.querySelectorAll('article')){
  assert.match(card.textContent,/SHA-256/);assert.match(card.textContent,/Released.*Snapshot.*CC BY 4.0/);
 }
 assert.doesNotMatch(section.textContent,/\d+(?:\.\d+)?(?:BN|M)\b/);
});

test('CSV preserves all 4340 published values, original labels, code absence and provenance',()=>{
 const h=fixture(),cleared=clearedGovernmentFunctions(h),rows=governmentFunctionRows(h),csv=toCSV(rows,governmentFunctionTableConfig(rows));
 assert.equal(cleared.length,4340);assert.equal(rows.length,4340);
 assert.deepEqual(rows.map(r=>r.value_million),h.function_rows.map(r=>r.value));
 assert.ok(rows.every(r=>r.division_code===null && r.group_code===null));
 for(const text of ['Division code as published','Group code as published','SHA-256','Snapshot','School education','Pre-primary, primary and secondary education','Environmental Protection'])assert.ok(csv.includes(text),text);
 assert.equal(rows.filter(r=>r.function_level==='total').length,200);
 assert.equal(rows.filter(r=>r.measure==='Education operating expenses').length,480);
});

test('held files, altered hashes, invented totals, groups, labels or numeric codes never serve',()=>{
 const h=fixture(),base=h.function_rows.find(r=>r.measure==='expenses_by_function' && r.function_level==='division');
 const baseline=clearedGovernmentFunctions(h).length;
 for(const change of [{published:false},{jurisdiction:'Calculated total'},{division_code:'707'},
   {function_as_published:'Calculated health'},{function_level:'total',division:null,group:null,function_as_published:'Total invented'},
   {sha256:'0'.repeat(64)},{function_level:'group',group:'Invented group'}]){
  const candidate={...base,...change};h.function_rows.push(candidate);
  assert.equal(clearedGovernmentFunctions(h).length,baseline);h.function_rows.pop();
 }
 const d=h.documents.find(d=>d.id+'.xlsx'===base.workbook);d.status='held';
 assert.ok(clearedGovernmentFunctions(h).every(r=>r.workbook!==base.workbook));
 assert.ok(governmentFunctionRows(h).every(r=>r.source_url!==base.source_url));
});

test('education-only state/local selections are explicit and ACT stays State',async()=>{
 const result=await page(fixture(),'?level=State+and+local&sector=General+government&jurisdiction=Victoria');
 assert.equal(result.status,200);
 const doc=new JSDOM(result.prerender).window.document;
 assert.match(doc.querySelector('.gfs-function-jurisdiction').textContent,/Education only/);
 assert.match(doc.querySelector('.gfs-function-jurisdiction').textContent,/School education/);
 assert.equal(doc.querySelectorAll('.gfs-function-jurisdiction').length,1);
 const rows=clearedGovernmentFunctions(fixture());
 assert.ok(rows.filter(r=>r.workbook==='55120DO095_202425.xlsx' && r.sheet==='Table_16').every(r=>r.level_of_government==='State'));
 assert.ok(rows.every(r=>r.sheet!=='Table_19'));
});

test('function filters hydrate with the same rows and preserve scoped CSV without remote fetches',async()=>{
 const result=await page(fixture(),'?jurisdiction=Victoria'),dom=new JSDOM(result.prerender,{url:'https://opax.test/register/government-finance?jurisdiction=Victoria'});
 const original=globalThis.MutationObserver;globalThis.MutationObserver=dom.window.MutationObserver;
 let requests=0;dom.window.fetch=async()=>{requests++;throw Error('Unexpected fetch');};
 try{
  const expected=JSON.parse(dom.window.document.querySelector('[data-register-table="government-function-table"] [data-dt-page]').textContent).total;
  hydrateRegisterTables(dom.window.document);await new Promise(setImmediate);
  assert.equal(requests,0);
  const root=dom.window.document.querySelector('[data-register-table="government-function-table"]');
  assert.equal(JSON.parse(root.querySelector('[data-dt-page]').textContent).total,expected);
  assert.equal(root.querySelectorAll('tbody tr').length,25);
  assert.match(root.textContent,/Victoria/);assert.doesNotMatch(root.textContent,/New South Wales/);
 }finally{dom.window.document.body.replaceChildren();await new Promise(setImmediate);globalThis.MutationObserver=original;dom.window.close();}
});

test('function filter URLs reject duplicates and filter the independent table',async()=>{
 assert.equal((await page(fixture(),'?gfsFunction.q=a&gfsFunction.q=b')).status,400);
 const result=await page(fixture(),'?gfsFunction.q=Hospital'),doc=new JSDOM(result.prerender).window.document;
 const rows=doc.querySelectorAll('#government-function-table tbody tr');assert.ok(rows.length>0);
 assert.ok([...rows].every(row=>row.textContent.includes('Hospital')));
 assert.equal(JSON.parse(doc.querySelector('[data-register-table="government-finance-table"] [data-dt-page]').textContent).total,451);
});
