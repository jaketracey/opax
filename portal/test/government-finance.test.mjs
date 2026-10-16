import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {governmentFinancePage,governmentFinanceRows,clearedGovernmentFinance} from '../src/government-finance.ts';
import {governmentFinanceTableConfig,hydrateRegisterTables} from '../public/register-tables.js';
import {toCSV} from '../public/datatable.js';

const CC='https://creativecommons.org/licenses/by/4.0/';
const source='https://www.abs.gov.au/statistics/economy/government/government-finance-statistics-annual/2024-25/55120DO003_202425.xlsx';
const dimensions={level_of_government:'State',jurisdiction:'New South Wales',sector:'General government',consolidation:'Table 231. General government - state - New South Wales'};
const receipt={status:200,challenge:false,snapshot:'2026-10-17T00:00:00Z',sha256:'a'.repeat(64)};
const document={id:'55120DO003_202425',url:source,title:dimensions.consolidation,release:'2024-25',release_date:'2026-04-21',status:'cleared',dimensions,receipt,exceptions:[],licence:{status:'open',url:CC,workbook_reviewed:true}};
const fixture=()=>({schema:1,generated_at:receipt.snapshot,release:'2024-25',release_date:'2026-04-21',release_url:source.slice(0,source.lastIndexOf('/')),
 licence:{name:'CC BY 4.0',url:CC,terms_url:'https://www.abs.gov.au/website-privacy-copyright-and-disclaimer',attribution:'Australian Bureau of Statistics (2024–25), Government Finance Statistics, Annual, accessed 17 October 2026.',changes:'Selected published cells reformatted.'},documents:[structuredClone(document)],
 rows:['2023-24','2024-25'].flatMap(reference_year=>Object.entries({revenue:120000,expenses:100000,net_operating_balance:20000,net_lending_borrowing:15000,net_worth:200000}).map(([measure,value],i)=>({...dimensions,...receipt,release:'2024-25',release_date:'2026-04-21',reference_year,measure,measure_as_published:measure,value,source_marker:null,unit:'AUD million',prices_basis:'Current prices',series_basis:'Original',published:true,workbook:document.id+'.xlsx',sheet:'Table_1',cell:'B'+(i+7),source_url:source,licence:'CC BY 4.0',licence_url:CC})))});
const block=(title,text)=>`<h1>${title}</h1><p>${text}</p>`;
const page=(h,path='')=>governmentFinancePage(new URL('https://opax.test/register/government-finance'+path),async()=>h,block);

test('SSR shows jurisdiction figures, fiscal years, accrual/consolidation explanation and receipts',async()=>{
 const result=await page(fixture());assert.equal(result.status,200);
 const doc=new JSDOM(result.prerender).window.document;
 assert.equal(doc.querySelector('h1').textContent,'Government finance');
 assert.equal(doc.querySelectorAll('.gfs-jurisdiction').length,1);
 assert.match(doc.querySelector('.gfs-jurisdiction').textContent,/New South Wales/);
 assert.match(doc.body.textContent,/\$120bn/);assert.doesNotMatch(doc.querySelector('.gfs-jurisdiction dl').textContent,/Not published|Net debt/);
 assert.match(doc.body.textContent,/accrual accounting/);assert.match(doc.body.textContent,/consolidates transfers/);
 for(const section of doc.querySelectorAll('section[aria-labelledby^="gfs-"]'))assert.match(section.textContent,/Snapshot.*CC BY 4\.0/);
 assert.match(result.prerender,/Table_1!B7/);assert.match(result.prerender,/2026-04-21/);
 assert.equal(doc.querySelectorAll('a[href^="/state"]').length,0);
});

test('page and export contain only ABS published groups, never cross-level sums',async()=>{
 const h=fixture();const base=h.rows[0];
 h.rows.push({...base,published:false,value:999999999,jurisdiction:'Calculated total'});
 h.rows.push({...base,published:true,value:888888888,level_of_government:'All levels of government',jurisdiction:'Australia'});
 const rows=governmentFinanceRows(h),config=governmentFinanceTableConfig(rows),csv=toCSV(rows,config);
 assert.equal(rows.length,10);assert.doesNotMatch(csv,/999999999|888888888|Calculated total/);
 assert.deepEqual(rows.map(r=>r.value_million),fixture().rows.map(r=>r.value));
 const result=await page(h);assert.doesNotMatch(result.prerender,/999999999|888888888|Calculated total/);
 assert.ok(csv.includes('SHA-256'));assert.ok(csv.includes(receipt.sha256));assert.ok(csv.includes('Published value (AUD million)'));
});

test('held or unreviewed files and broken provenance never enter page, hydration or CSV',async()=>{
 for(const mutate of [h=>h.documents[0].status='held',h=>h.documents[0].licence.status='held',h=>h.documents[0].licence.workbook_reviewed=false,h=>h.documents[0].exceptions.push('Notice to review'),h=>h.rows.forEach(r=>r.sha256='b'.repeat(64))]){
  const h=fixture();mutate(h);const rows=governmentFinanceRows(h);assert.deepEqual(rows,[]);
  assert.equal((await page(h)).status,503);assert.doesNotMatch(toCSV(rows,governmentFinanceTableConfig(rows)),/120000/);
 }
});

test('null remains unavailable, zero remains zero, release vintages stay distinct',async()=>{
 const h=fixture();h.rows[0].value=null;h.rows[1].value=0;
 const older=structuredClone(h.documents[0]);older.release='2023-24';older.id='55120DO003_202324';older.url=older.url.replaceAll('2024-25','2023-24').replace('202425','202324');
 h.documents.push(older);h.rows.push({...h.rows[0],release:older.release,workbook:older.id+'.xlsx',source_url:older.url});
 assert.equal(clearedGovernmentFinance(h).length,11);
 const rows=governmentFinanceRows(h);assert.equal(rows[0].amount,null);assert.equal(rows[1].amount,0);
 assert.ok(rows.some(r=>r.release==='2023-24'));
});

test('SSR and hydrated register table use the same rows without remote calls',async()=>{
 const h=fixture(),result=await page(h),dom=new JSDOM(result.prerender,{url:'https://opax.test/register/government-finance'});
 const original=globalThis.MutationObserver;globalThis.MutationObserver=dom.window.MutationObserver;
 let requests=0;dom.window.fetch=async()=>{requests++;throw Error('Unexpected remote call');};
 try{
  hydrateRegisterTables(dom.window.document);await new Promise(setImmediate);
  assert.equal(requests,0);assert.equal(dom.window.document.querySelectorAll('[data-datatable] tbody tr').length,10);
  assert.match(dom.window.document.body.textContent,/\$120bn/);
 }finally{dom.window.document.body.replaceChildren();await new Promise(setImmediate);globalThis.MutationObserver=original;dom.window.close();}
});

test('invalid and repeated selectors fail closed',async()=>{
 for(const query of ['?level=Invented','?level=State&level=Local','?sector=Private','?jurisdiction=Unknown','?gfs.q=a&gfs.q=b'])assert.equal((await page(fixture(),query)).status,400);
});

test('changing NSW to Commonwealth resets the stale jurisdiction to its first published choice',async()=>{
 const hub=JSON.parse(readFileSync(new URL('../../data/staged/abs-gfs/hub.json',import.meta.url),'utf8'));
 const result=await page(hub,'?level=Commonwealth&sector=General%20government&jurisdiction=New%20South%20Wales');
 assert.equal(result.status,200);
 const doc=new JSDOM(result.prerender).window.document;
 assert.equal(doc.querySelector('[name="level"]').value,'Commonwealth');
 assert.equal(doc.querySelector('[name="jurisdiction"]').value,'Australia');
 assert.deepEqual([...doc.querySelectorAll('[name="jurisdiction"] option')].map(o=>o.value),['','Australia']);
 assert.equal(doc.querySelectorAll('.gfs-jurisdiction').length,1);
 assert.equal(doc.querySelector('.gfs-jurisdiction h3').textContent,'Australia');
 assert.equal(JSON.parse(doc.querySelector('[data-dt-page]').textContent).total,50);
});

test('National plus Total public sector resets to a valid sector and never renders an empty combination',async()=>{
 const hub=JSON.parse(readFileSync(new URL('../../data/staged/abs-gfs/hub.json',import.meta.url),'utf8'));
 const result=await page(hub,'?level=National&sector=Total%20public%20sector');
 assert.equal(result.status,200);
 const doc=new JSDOM(result.prerender).window.document;
 assert.equal(doc.querySelector('[name="level"]').value,'National');
 assert.equal(doc.querySelector('[name="sector"]').value,'General government');
 assert.deepEqual([...doc.querySelectorAll('[name="sector"] option')].map(o=>o.value),['General government']);
 assert.deepEqual([...doc.querySelectorAll('[name="jurisdiction"] option')].map(o=>o.value),['','Australia']);
 assert.equal(JSON.parse(doc.querySelector('[data-dt-page]').textContent).total,1);
 assert.deepEqual([...doc.querySelectorAll('.gfs-jurisdiction dt')].map(n=>n.textContent),['Net debt (L2)']);
 assert.doesNotMatch(doc.querySelector('.gfs-jurisdiction dl').textContent,/Not published/);
});

test('headline cards omit absent measures and retain Not published only for an actual null source cell',async()=>{
 const hub=fixture();hub.rows.find(r=>r.reference_year==='2024-25' && r.measure==='revenue').value=null;
 hub.rows.find(r=>r.reference_year==='2024-25' && r.measure==='expenses').value=0;
 const result=await page(hub),doc=new JSDOM(result.prerender).window.document;
 const values=[...doc.querySelectorAll('.gfs-jurisdiction dl > div')].map(n=>[n.querySelector('dt').textContent,n.querySelector('dd').textContent]);
 assert.equal(values.length,5);
 assert.equal(values.find(([label])=>label==='Revenue')[1],'Not published');
 assert.equal(values.find(([label])=>label==='Expenses')[1],'$0.00');
 assert.ok(!values.some(([label])=>label==='Net debt (L2)'));
 assert.equal(values.filter(([,value])=>value==='Not published').length,1);
});

test('government finance is reachable under Money',async()=>{
 await import('../public/navigation.js');
 const nav=globalThis.OpaxNavigation;
 assert.equal(nav.active('/register/government-finance'),'money');
 assert.ok(nav.groups.find(g=>g.id==='money').columns.flatMap(c=>c.links).some(link=>link.href==='/register/government-finance'));
});

test('staged projection exposes unique source cells with cleared workbook provenance',()=>{
 const hub=JSON.parse(readFileSync(new URL('../../data/staged/abs-gfs/hub.json',import.meta.url),'utf8'));
 const rows=clearedGovernmentFinance(hub);assert.equal(rows.length,hub.rows.length);assert.ok(rows.length>3000);
 assert.equal(new Set(rows.map(r=>JSON.stringify([r.release,r.level_of_government,r.jurisdiction,r.sector,r.measure,r.reference_year]))).size,rows.length);
 assert.ok(rows.every(r=>r.published && r.source_url.startsWith('https://www.abs.gov.au/')));
});
