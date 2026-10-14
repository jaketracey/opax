import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {hydrateRegisterTables,stateBillsTableConfig} from '../public/register-tables.js';
import {applyQuery,toCSV} from '../public/datatable.js';
const bundled=await build({entryPoints:[new URL('../src/state-bills.ts',import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false});
const {stateBillsPage,clearedStateBills,stateBillsTableRows}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const hubs=Object.fromEntries(['tas','act'].map(j=>[j,JSON.parse(readFileSync(new URL(`../../data/staged/bills-${j}/hub.json`,import.meta.url)))]));
const block=(title,text,links='')=>`<h1>${title}</h1><p>${text}</p>${links}`;
const render=(query='',read=async j=>hubs[j])=>stateBillsPage(new URL('https://opax.test/register/state-bills'+query),read,block);

test('reviewed state metadata renders with dates, source, snapshot and licence per bill',async()=>{
 const result=await render();assert.equal(result.status,200);assert.equal(result.noindex,false);
 assert.match(result.prerender,/419 registry entries/);const dom=new JSDOM(result.prerender);assert.equal(dom.window.document.querySelectorAll('[data-datatable] tbody tr').length,25);
 assert.equal(dom.window.document.querySelectorAll('.state-bill').length,0);
 assert.match(result.prerender,/ACT Legislative Assembly/);assert.match(result.prerender,/Parliament of Tasmania/);
 for(const row of dom.window.document.querySelectorAll('tbody tr'))assert.match(row.textContent,/ACT Legislative Assembly|Parliament of Tasmania/);
 assert.match(result.prerender,/SHA-256/);assert.match(result.prerender,/Copyright Parliament of Tasmania/);
 assert.match(result.prerender,/CC BY-NC-ND/);assert.match(result.prerender,/State bills/);
 assert.equal(clearedStateBills(hubs.tas).length,157);assert.equal(clearedStateBills(hubs.act).length,262);
});
test('shared table SSR retains jurisdiction/parliament bookmarks and pagination',async()=>{
 const result=await render('?jurisdiction=tas&parliament=52');assert.equal(result.status,200);
 assert.match(result.prerender,/77 matching entries/);const doc=new JSDOM(result.prerender).window.document;assert.equal(JSON.parse(doc.querySelector('[data-dt-page]').textContent).total,77);
 assert.ok([...doc.querySelectorAll('tbody tr')].every(row=>row.textContent.includes('Parliament of Tasmania')));
 assert.match((await render('?jurisdiction=act&parliament=11')).prerender,/79 matching entries/);
 assert.equal((await render('?page=2')).status,200);assert.equal((await render('?page=999')).status,404);
 assert.equal((await render('?jurisdiction=tas&jurisdiction=act')).status,400);
 assert.equal((await render('?parliament=no')).status,400);assert.equal((await render('?unknown=1')).status,400);
});
test('detail exposes original versions and source disagreements while held text never renders',async()=>{
 const b=hubs.act.bills.find(b=>b.title==='Statute Law Amendment Bill 2025');
 const mutated=structuredClone(hubs);mutated.act.bills.find(x=>x.key===b.key).body='HELD BILL BODY';
 mutated.act.bills.find(x=>x.key===b.key).sources[0].text='HELD EXPLANATORY BODY';
 const result=await render('?bill='+b.key,async j=>mutated[j]);assert.equal(result.status,200);
 assert.match(result.prerender,/sources disagree/);assert.match(result.prerender,/Source: ACT Legislative Assembly/);
 const tas=await render('?bill='+hubs.tas.bills[0].key);assert.match(tas.prerender,/Source: Parliament of Tasmania/);assert.match(result.prerender,/Published stages/);
 assert.match(result.prerender,/Versions and explanatory material/);assert.match(result.prerender,/Metadata sources/);
 assert.doesNotMatch(result.prerender,/HELD BILL BODY|HELD EXPLANATORY BODY/);
 assert.equal((await render('?bill=au-tas-missing')).status,404);
});
test('serving boundary rejects licence changes, foreign sources, unsafe links and provisional sponsors',async()=>{
 for(const change of [b=>b.licence.text_allowed=true,b=>b.source_url='https://example.test/registry',b=>b.sources[0].url='javascript:alert(1)',b=>b.licence.policy_receipt.sha256='missing']){
  const h=structuredClone(hubs.tas);change(h.bills[0]);assert.equal(clearedStateBills(h).length,156);
 }
 const h=structuredClone(hubs.tas);h.bills[0].official={name:'Unmatched Official',href:'/subject/person/unmatched-official'};
 assert.equal(clearedStateBills(h)[0].official,null);
 assert.equal((await render('',async()=>{throw Error('unavailable')})).status,503);
 const one=await render('',async j=>{if(j==='act')throw Error('unavailable');return hubs[j]});
 assert.equal(one.status,200);assert.match(one.prerender,/One jurisdiction is unavailable/);
});
test('Worker routes and asset-first exclusions carry the state register without production bindings',async()=>{
 const code=await build({entryPoints:[new URL('../src/index.ts',import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],plugins:[{name:'omit-images',setup(b){b.onResolve({filter:/^\.\/og-render$/},()=>({path:'images',namespace:'state-bills-test'}));b.onLoad({filter:/.*/,namespace:'state-bills-test'},()=>({contents:'export const renderOgPng=async()=>null;export const renderOgJpeg=renderOgPng;export const renderStoryJpeg=renderOgPng;',loader:'js'}));}}]});
 const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(code.outputFiles[0].text).toString('base64'));let html='',head='',removed=false;
 globalThis.HTMLRewriter=class{handlers=[];on(s,h){this.handlers.push([s,h]);return this;}transform(response){for(const [s,h]of this.handlers){if(s==='main#main')h.element({setAttribute(){},setInnerContent(v){html=v;}});if(s==='head')h.element({append(v){head+=v;}});if(s==='script[src]')h.element({getAttribute(){return '/app.js';},remove(){removed=true;}});}return response;}};
 const response=await worker.fetch(new Request('https://opax.com.au/register/state-bills'),{ASSETS:{async fetch(req){const p=new URL(req.url).pathname;const j=p==='/bills-tas/data.json'?'tas':p==='/bills-act/data.json'?'act':null;return new Response(j?JSON.stringify(hubs[j]):readFileSync(new URL('../public/index.html',import.meta.url),'utf8'));}}},{});
 assert.equal(response.status,200);assert.match(html,/419 registry entries/);assert.match(head,/state-bills.css/);assert.equal(removed,true);
 assert.match(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'),/"\/register\/state-bills", "\/register\/state-bills\/"/);
});


test('shared table search, filters, sort, hydration and CSV retain attribution and hold bodies',async()=>{
 const changed=structuredClone(hubs);changed.act.bills[0].body='HELD TABLE BODY';
 const bills=Object.values(changed).flatMap(clearedStateBills),rows=stateBillsTableRows(bills),config=stateBillsTableConfig(rows);
 const selected=applyQuery(rows,config,{q:'Appropriation',filters:{jurisdiction:['ACT'],parliament:['11']},sort:{key:'title',dir:'asc'},pageSize:1000});
 assert.ok(selected.total>0);assert.ok(selected.rows.every(r=>r.jurisdiction==='ACT' && r.parliament==='11'));
 assert.deepEqual(selected.rows.map(r=>r.title),selected.rows.map(r=>r.title).sort((a,b)=>a.localeCompare(b,'en-AU',{numeric:true,sensitivity:'base'})));
 const csv=toCSV(selected.rows,config);assert.match(csv,/ACT Legislative Assembly/);assert.match(csv,/CC BY-NC-ND/);assert.match(csv,/SHA-256/);assert.doesNotMatch(csv,/HELD TABLE BODY/);
 const result=await render('?stateBills.q=Appropriation&stateBills.f.jurisdiction=%5B%22ACT%22%5D&stateBills.sort=title:asc');
 assert.equal(result.status,200);assert.match(result.prerender,/data-export/);assert.match(result.prerender,/data-sort=/);assert.match(result.prerender,/data-facet=/);
 const dom=new JSDOM(result.prerender,{url:'https://opax.test/register/state-bills?jurisdiction=tas&parliament=52'}),doc=dom.window.document;
 const previous=globalThis.MutationObserver;globalThis.MutationObserver=dom.window.MutationObserver;
 try{
  hydrateRegisterTables(doc);await new Promise(setImmediate);
  assert.equal(JSON.parse(doc.querySelector('[data-dt-page]').textContent).total,77);
  const search=doc.querySelector('[data-search]');search.value='Appropriation';search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  await new Promise(done=>setTimeout(done,450));const page=JSON.parse(doc.querySelector('[data-dt-page]').textContent);
  assert.ok(page.total>0 && page.total<77);assert.ok(page.rows.every(r=>r.title.includes('Appropriation')));
  assert.ok(doc.querySelector('tbody a[href*="bill=au-tas"]'));
  assert.ok([...doc.querySelectorAll('tbody a')].some(a=>a.textContent==='Parliament of Tasmania' && a.href.startsWith('https://www.parliament.tas.gov.au/')));
 }finally{doc.body.replaceChildren();await new Promise(setImmediate);globalThis.MutationObserver=previous;dom.window.close();}
 assert.equal((await render('?stateBills.q=a&stateBills.q=b')).status,400);
});
