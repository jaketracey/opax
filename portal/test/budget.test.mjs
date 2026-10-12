import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {budgetPage,clearedAggregates} from '../src/budget.ts';
import {JSDOM} from 'jsdom';
const sha='a'.repeat(64),source='https://budget.gov.au/content/bp1/download/bp1_2026-27.pdf';
const rights={status:'open',name:'CC BY 4.0',url:'https://creativecommons.org/licenses/by/4.0/',exceptions:['Commonwealth Coat of Arms','third-party content','where otherwise stated']};
const document={id:'bp1',year:'2026-27',release:'2026-27',kind:'bp1',title:'Budget Paper 1: Budget Strategy and Outlook',url:source,format:'PDF',consolidated:true,status:'cleared',licence:rights,receipt:{sha256:sha,snapshot:'2026-10-13T00:00:00Z'}};
const row=(year,metric,value,status='estimate')=>({document_id:'bp1',release:'2026-27',release_year:'2026-27',fiscal_year:year,metric,value,unit:'AUD billion',status,vintage:'BP1',paper:document.title,table_id:'Table 3.1: Australian Government general government sector budget aggregates',pdf_page:91,source_url:source,snapshot:document.receipt.snapshot,sha256:sha,licence:'CC BY 4.0',licence_url:rights.url,publication_order:2026.5});
const fixture={schema:1,generated_at:document.receipt.snapshot,scope:'Budget fixture',releases:[{id:'2026-27',year:'2026-27',label:'Budget 2026–27',url:'https://budget.gov.au/'}],documents:[document],aggregates:[row('2026-27','receipts',798.1),row('2026-27','payments',829.6),row('2026-27','underlying_cash_balance',-31.5),row('2026-27','net_debt',616.6)],portfolio_indexes:[],unreleased:[{year:'2026-27',kind:'myefo',reason:'Not linked at this snapshot'}],measure_count:7,held_count:1,attribution:'Based on Commonwealth of Australia data. No Commonwealth endorsement.'};
const block=(heading,text)=>`<section id="prerender"><h1>${heading}</h1><p>${text}</p></section>`;
const read=async()=>structuredClone(fixture);

test('portfolio lists omit unlinked rows and the section when no links remain',async()=>{
 const h=structuredClone(fixture);
 h.portfolio_indexes=[{release:'2026-27',title:'Unlinked fixture portfolio',url:null},{release:'2026-27',title:'Unsafe fixture portfolio',url:'javascript:alert(1)'}];
 let p=await budgetPage(new URL('https://opax.com.au/budget'),async()=>h,block);
 let d=new JSDOM(p.prerender).window.document;
 assert.equal(d.querySelector('[aria-labelledby="budget-portfolios"]'),null);
 assert.doesNotMatch(p.prerender,/Unlinked fixture portfolio|Unsafe fixture portfolio|Publisher document link unavailable/);
 h.portfolio_indexes.push({release:'2026-27',title:'Linked fixture portfolio',url:'https://treasury.gov.au/treasury-portfolio-budget-papers'});
 p=await budgetPage(new URL('https://opax.com.au/budget'),async()=>h,block);
 d=new JSDOM(p.prerender).window.document;
 assert.equal(d.querySelectorAll('[aria-labelledby="budget-portfolios"] > ul > li').length,1);
 assert.equal(d.querySelector('[aria-labelledby="budget-portfolios"] a').textContent,'Linked fixture portfolio');
 assert.doesNotMatch(p.prerender,/Unlinked fixture portfolio|Unsafe fixture portfolio|Publisher document link unavailable/);
});

test('staged inventory renders no unlinked portfolio filler in any year',async()=>{
 const h=JSON.parse(readFileSync(new URL('../../data/staged/budget/hub.json',import.meta.url),'utf8'));
 for(const year of new Set(h.releases.map(r=>r.year))) {
  const p=await budgetPage(new URL('https://opax.com.au/budget?year='+year),async()=>h,block);
  const d=new JSDOM(p.prerender).window.document;
  assert.equal(p.status,200);
  assert.doesNotMatch(p.prerender,/Publisher document link unavailable/);
  const expected=h.portfolio_indexes.filter(r=>r.release.startsWith(year)&&typeof r.url==='string'&&/^https?:\/\//.test(r.url)).length;
  assert.equal(d.querySelectorAll('[aria-labelledby="budget-portfolios"] > ul > li').length,expected);
  assert.equal(Boolean(d.querySelector('[aria-labelledby="budget-portfolios"]')),expected>0);
 }
});

test('budget hub SSR has sourced figures, year list, chart table and shared DataTable',async()=>{
 const page=await budgetPage(new URL('https://opax.com.au/budget'),read,block);assert.equal(page.status,200);
 const doc=new JSDOM(page.prerender).window.document;
 assert.equal(doc.querySelector('h1').textContent,'Federal budget papers');assert.equal(doc.querySelectorAll('.budget-cards article').length,4);
 assert.equal(doc.querySelectorAll('.budget-chart tbody tr').length,1);assert.equal(doc.querySelector('[data-datatable]').dataset.datatable,'budget-aggregates');assert.equal(doc.querySelectorAll('[data-datatable] tbody tr').length,4);
 for(const card of doc.querySelectorAll('.budget-cards article')) {assert.equal(card.querySelector('a').getAttribute('href'),source+'#page=91');assert.match(card.textContent,/Table 3.1/);assert.match(card.textContent,/Snapshot 2026/);assert.match(card.textContent,/CC BY 4.0/);assert.match(card.textContent,/SHA-256 a{64}/);}
 assert.match(page.prerender,/Not reported/);assert.doesNotMatch(page.prerender,/\/subject\/person/);
});

test('serving boundary removes blocked, mismatched and malformed rows from HTML and hydration JSON',async()=>{
 const h=structuredClone(fixture);h.documents.push({...document,id:'blocked',licence:{...rights,status:'blocked'}});
 h.aggregates.push({...h.aggregates[0],document_id:'blocked',value:1234567},{...h.aggregates[0],source_url:'https://example.test/injected',value:7654321},{...h.aggregates[0],sha256:'0'.repeat(64),value:8765432});
 assert.equal(clearedAggregates(h).length,4);const p=await budgetPage(new URL('https://opax.com.au/budget'),async()=>h,block);assert.doesNotMatch(p.prerender,/1234567|7654321|8765432|example.test/);
 h.documents[0].licence.status='blocked';assert.equal((await budgetPage(new URL('https://opax.com.au/budget'),async()=>h,block)).status,503);
});

test('filtered SSR and invalid years work; missing staged load fails closed',async()=>{
 const p=await budgetPage(new URL('https://opax.com.au/budget?year=invalid&fiscal.q=Receipts'),read,block);const d=new JSDOM(p.prerender).window.document;
 assert.equal(d.querySelectorAll('[data-datatable] tbody tr').length,1);assert.equal(d.querySelector('.budget-years [aria-current]').textContent,'2026–27');assert.equal(JSON.parse(d.querySelector('[data-budget-rows]').textContent).length,4);
 assert.equal((await budgetPage(new URL('https://opax.com.au/budget'),async()=>{throw Error('missing')},block)).status,503);
});

test('actual Worker serves /budget, removes app scripts and loads styles without paid or production bindings',async()=>{
 const code=await build({entryPoints:[new URL('../src/index.ts',import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],plugins:[{name:'omit-renderer',setup(b){b.onResolve({filter:/^\.\/og-render$/},()=>({path:'renderer',namespace:'budget-test'}));b.onLoad({filter:/.*/,namespace:'budget-test'},()=>({contents:'export const renderOgPng=async()=>null;export const renderOgJpeg=renderOgPng;export const renderStoryJpeg=renderOgPng;',loader:'js'}));}}]});
 const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(code.outputFiles[0].text).toString('base64'));let html='',head='',removed=false;
 globalThis.HTMLRewriter=class {handlers=[];on(s,h){this.handlers.push([s,h]);return this;}transform(response){for(const [s,h] of this.handlers){if(s==='main#main')h.element({setAttribute(){},setInnerContent(v){html=v;}});if(s==='head')h.element({append(v){head+=v;}});if(s==='script[src]')h.element({getAttribute(){return '/app.js';},remove(){removed=true;}});}return response;}};
 const paths=[];const env={ASSETS:{async fetch(req){const p=new URL(req.url).pathname;paths.push(p);return new Response(p==='/budget/data.json'?JSON.stringify(fixture):readFileSync(new URL('../public/index.html',import.meta.url),'utf8'));}}};
 const response=await worker.fetch(new Request('https://opax.com.au/budget'),env,{});assert.equal(response.status,200);assert.match(html,/headline aggregates/);assert.match(head,/budget.css/);assert.match(head,/datatable.css/);assert.equal(removed,true);assert.ok(paths.includes('/budget/data.json'));assert.match(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'),/"\/budget", "\/budget\/"/);
});

test('each of the four aggregates has a server-rendered estimates-versus-actuals chart table',async()=>{
 for(const [metric,label] of Object.entries({receipts:'Receipts',payments:'Payments',underlying_cash_balance:'Underlying cash balance',net_debt:'Net debt'})){
  const p=await budgetPage(new URL('https://opax.com.au/budget?metric='+metric),read,block);const d=new JSDOM(p.prerender).window.document;
  assert.equal(d.querySelector('.budget-chart caption').textContent,label+': estimates and actuals (AUD billion)');
  assert.equal(d.querySelector('[aria-label="Choose fiscal aggregate"] [aria-current]').textContent,label);
 }
});

test('malformed vintages and non-http portfolio links cannot render unsafe markup',async()=>{
 const h=structuredClone(fixture);h.releases.push({year:'2026-27"><script>alert(1)</script>'});h.portfolio_indexes.push({release:'2026-27',title:'Example portfolio',url:'javascript:alert(1)'});h.aggregates.push({...h.aggregates[0],vintage:null,value:5555555});
 const p=await budgetPage(new URL('https://opax.com.au/budget'),async()=>h,block);
 assert.equal(p.status,200);assert.doesNotMatch(p.prerender,/javascript:alert|<script>alert|5555555/);
});
