import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import {toCSV,applyQuery} from '../public/datatable.js';
import {govAdvertisingTableConfig,hydrateRegisterTables} from '../public/register-tables.js';
import {workerFetch} from './helpers/worker-fetch.mjs';
const bundle=await build({entryPoints:[new URL('../src/gov-advertising.ts',import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false});
const {govAdvertisingPage,clearedAdvertising,advertisingTableRows,govAdvertisingReady}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const hub=JSON.parse(readFileSync(new URL('../../data/staged/vic-advertising/hub.json',import.meta.url)));
const block=(title,text,links='')=>`<h1>${title}</h1><p>${text}</p>${links}`;
const render=(h=hub,query='')=>govAdvertisingPage(new URL('https://opax.test/register/gov-advertising'+query),async()=>h,block);

test('VIC shared register server renders published totals, latest advertisers and source blocks',async()=>{
 assert.equal(clearedAdvertising(hub).length,hub.rows.length);
 const result=await render();assert.equal(result.status,200);
 const doc=new JSDOM(result.prerender).window.document;
 assert.equal(doc.querySelectorAll('[data-datatable] tbody tr').length,25);
 assert.ok(JSON.parse(doc.querySelector('[data-dt-page]').textContent).rows.every(r=>r.financial_year==='2024-25'));
 assert.equal(doc.querySelectorAll('#advertising-departments + p + .gov-advertising-cards article').length,10);
 assert.equal(doc.querySelectorAll('.gov-advertising-description').length,10);
 assert.match(result.prerender,/Tables without a published total are not summed/);
 for(const card of doc.querySelectorAll('.gov-advertising-card')){
  assert.equal(card.querySelectorAll('.gov-advertising-receipt').length,1);
  assert.match(card.textContent,/Report year[\s\S]*Snapshot 18 Oct 2026[\s\S]*CC BY 4.0/);
 }
 assert.match(doc.querySelector('#advertising-sources').textContent,/Report year[\s\S]*Snapshot[\s\S]*CC BY 4.0/);
 assert.match(result.prerender,/Document SHA-256/);
 assert.match(result.prerender,/\$[\d.]+m/);assert.doesNotMatch(result.prerender,/\$[\d.]+M\b/);
});

test('plain receipt dates and a single page source block retain full timestamps in provenance and CSV',async()=>{
 const result=await render(),doc=new JSDOM(result.prerender).window.document;
 assert.equal(doc.querySelectorAll('#advertising-sources').length,1);
 for(const receipt of doc.querySelectorAll('.gov-advertising-receipt')){
  assert.match(receipt.textContent,/Snapshot \d{1,2} [A-Z][a-z]{2} \d{4}/);
  assert.doesNotMatch(receipt.textContent,/\d{4}-\d\d-\d\dT|\.\d{4,}/);
  assert.ok(receipt.closest('.gov-advertising-card,#advertising-sources'),'Repeated section receipt outside a card/source block');
 }
 const rows=advertisingTableRows(clearedAdvertising(hub),[]),config=govAdvertisingTableConfig(rows);
 assert.equal(rows[0].snapshot,hub.rows[0].snapshot);
 assert.equal(config.columns.find(c=>c.key==='snapshot').type,'date');
 assert.ok(toCSV(rows,config).includes(hub.rows[0].snapshot));
});

test('authorised description stays page/CSV/search text without creating person entities, links or facets',async()=>{
 const fixture=JSON.parse(execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'tests');from test_vic_advertising import private_description_fixture;print(json.dumps(private_description_fixture()))"],{cwd:fileURLToPath(new URL('../../',import.meta.url)),encoding:'utf8'}));
 const name='Avery Fenwick',h=fixture.hub;
 assert.ok(JSON.stringify(fixture.hub).includes(name)); // Record text also survives the shared future app asset.
 assert.equal(clearedAdvertising(h).length,1);
 const rows=advertisingTableRows(clearedAdvertising(h),[]),config=govAdvertisingTableConfig(rows);
 assert.ok(JSON.stringify(rows).includes(name));assert.ok(toCSV(rows,config).includes(name));
 assert.equal(applyQuery(rows,config,{q:name}).total,1);
 assert.ok(!JSON.stringify(applyQuery(rows,config,{}).facets).includes(name));
 assert.equal(config.primaryLink(rows[0]),null);
 assert.equal(rows[0].entity,'Department of Example Services');
 assert.ok(!Object.keys(rows[0]).some(k=>/^person|identity|subject/.test(k)));
 assert.equal(rows[0].agency_href,null);
 const page=await render(h,'?advertising.f.financial_year='+encodeURIComponent(JSON.stringify(['2024-25'])));assert.equal(page.status,200);assert.ok(page.prerender.includes(name));
 const shown=new JSDOM(page.prerender).window.document;
 assert.equal([...shown.querySelectorAll('a')].filter(a=>a.textContent.includes(name)||a.getAttribute('href')?.includes('/subject/person/')).length,0);
 const dom=new JSDOM((await render(h)).prerender,{url:'https://opax.test/register/gov-advertising'});
 const observer=globalThis.MutationObserver;globalThis.MutationObserver=dom.window.MutationObserver;
 try{
  dom.window.fetch=async()=>{throw Error('No external network in hydration test')};
  hydrateRegisterTables(dom.window.document);await new Promise(setImmediate);
  assert.ok(dom.serialize().includes(name));
  assert.equal([...dom.window.document.querySelectorAll('a')].filter(a=>a.textContent.includes(name)).length,0);assert.equal(dom.window.document.querySelectorAll('[data-datatable] tbody tr').length,1);
 }finally{dom.window.document.body.replaceChildren();await new Promise(setImmediate);globalThis.MutationObserver=observer;dom.window.close()}
 // Person-like values cannot become an organisation or a media-channel facet,
 // even if a caller supplies a plausible directory entry or unknown identity keys.
 for(const key of ['entity','media_type']){
  const altered=structuredClone(h);altered.rows[0][key]=name;assert.deepEqual(clearedAdvertising(altered),[],key);
  const projected=advertisingTableRows(altered.rows,[{id:'a-aaaaaaaaaaaaaaaaaaaa',name}]);
  assert.ok(!JSON.stringify(applyQuery(projected,govAdvertisingTableConfig(projected),{}).facets).includes(name));
  assert.equal(projected[0].agency_href,null);
 }
 for(const key of ['campaign','category','table_heading','basis','measure','period_note','campaign_period']){
  const altered=structuredClone(h);altered.rows[0][key]=name;assert.equal(clearedAdvertising(altered).length,1,key);
 }
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('No external network in privacy test')};
 try{
  const sitemap=await workerFetch('/sitemap.xml',{VIC_ELECTION_HUB_ENABLED:'false'}, {},{assets:{'/gov-advertising/data.json':h,'/crawl/sitemap.xml':'<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>'}});
  assert.equal(sitemap.status,200);assert.ok(!(await sitemap.text()).includes(name));
  const mcpBundle=await build({entryPoints:[new URL('../src/community-mcp.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false});
  const {communityMcp}=await import('data:text/javascript;base64,'+Buffer.from(mcpBundle.outputFiles[0].text).toString('base64'));
  const env={COMMUNITY_ENABLED:'true',COMMUNITY_ORIGIN:'https://opax.test',COMMUNITY_DB:{prepare(sql){return {bind(){return this},async first(){return sql.startsWith('SELECT')?{id:'fixture-member',key_id:'fixture-key'}:{hits:1}},async run(){return {success:true}}}}},ASSETS:{fetch:async()=>Response.json(h)}};
  const response=await communityMcp(new Request('https://opax.test/mcp',{method:'POST',headers:{authorization:'Bearer opax_'+'A'.repeat(43),accept:'application/json, text/event-stream','content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'search_records',arguments:{query:'Example Services'}}})}),env,async()=>Response.json({results:rows.map(r=>({title:r.campaign,entity:r.entity,href:'/register/gov-advertising'}))}));
  assert.equal(response.status,200);const text=await response.text();assert.ok(text.includes(name));assert.ok(text.includes('Example Services'));assert.ok(!text.includes('/subject/person/'));
 }finally{globalThis.fetch=originalFetch}
});

test('the approved promoted snapshot remains readable',async()=>{
 const live=JSON.parse(readFileSync(new URL('../public/gov-advertising/data.json',import.meta.url)));
 assert.equal(clearedAdvertising(live).length,live.rows.length);
 assert.equal((await render(live)).status,200);
});

test('VIC money, raw units, GST wording, snapshots and table hashes survive CSV and filtering',()=>{
 const rows=advertisingTableRows(clearedAdvertising(hub),[]),config=govAdvertisingTableConfig(rows);
 const page=applyQuery(rows,config,{filters:{financial_year:['2024-25'],record_kind:['advertiser']}});
 assert.equal(page.total,10);
 const csv=toCSV(page.rows,config);
 for(const value of ['Advertising expenditure (ex. GST)','Source unit','Published amount','Source snapshot','Table SHA-256','Copyright State Government of Victoria'])assert.ok(csv.includes(value),value);
 assert.doesNotMatch(csv,/finance.gov.au/);
});

test('private supplier and unknown fields never reach page, CSV or table search',async()=>{
 const changed=structuredClone(hub);
 changed.rows[0].supplier='PRIVATE SUPPLIER SENTINEL';changed.rows[0].supplier_kind='organisation';changed.rows[0].private_contact='PRIVATE FIELD SENTINEL';
 const result=await render(changed),rows=advertisingTableRows(clearedAdvertising(changed),[]),config=govAdvertisingTableConfig(rows);
 assert.doesNotMatch(result.prerender,/PRIVATE SUPPLIER SENTINEL|PRIVATE FIELD SENTINEL/);
 assert.match(result.prerender,/individual supplier \(withheld\)/);
 assert.doesNotMatch(toCSV(rows,config),/PRIVATE SUPPLIER SENTINEL|PRIVATE FIELD SENTINEL/);
 assert.equal(applyQuery(rows,config,{q:'PRIVATE SUPPLIER SENTINEL'}).total,0);
});

test('held licence, source amount, provenance and reconciliation corruption close the snapshot',async()=>{
 for(const mutate of [h=>h.documents[0].licence.status='held',h=>h.documents[0].licence.scope_sha256='0'.repeat(64),
  h=>h.rows[0].total_cents++,h=>h.rows[0].source_value='$0',h=>h.rows[0].sha256='0'.repeat(64),
  h=>h.reconciliation[0].sum_cents++,h=>h.reconciliation[0].tolerance_cents++,h=>h.reconciliation=[]]){
  const h=structuredClone(hub);mutate(h);assert.deepEqual(clearedAdvertising(h),[]);
  assert.equal((await render(h)).status,503);
 }
});

test('readiness endpoint reflects cleared data independently of the static Money link',async()=>{
 const request=new Request('https://opax.test/gov-advertising/ready.json');
 assert.deepEqual(await(await govAdvertisingReady(request,async()=>null)).json(),{ready:false,count:0});
 assert.deepEqual(await(await govAdvertisingReady(request,async()=>hub)).json(),{ready:true,count:hub.rows.length});
 const h=structuredClone(hub);h.documents[0].licence.status='held';
 assert.deepEqual(await(await govAdvertisingReady(request,async()=>h)).json(),{ready:false,count:0});
 assert.equal((await govAdvertisingReady(new Request(request,{method:'POST'}),async()=>hub)).status,405);
});

test('VIC invalid and duplicate filters are rejected',async()=>{
 assert.equal((await render(hub,'?advertising.q=a&advertising.q=b')).status,400);
 assert.equal((await render(hub,'?unknown=1')).status,400);
 assert.equal((await render(hub,'?advertising.page=999')).status,404);
});
