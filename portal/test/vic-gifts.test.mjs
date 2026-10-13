import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {clearedGiftRegisters,vicGiftsPage,vicGiftsResponse,vicGiftsPersonBlock} from '../src/vic-gifts.ts';
import {hydrateRegisterTables} from '../public/register-tables.js';

const cc='https://creativecommons.org/licenses/by/4.0/',sha='a'.repeat(64),snapshot='2026-10-14T00:00:00Z';
const source='https://www.vic.gov.au/2024-25-ministerial-register-gifts-benefits-and-hospitality';
const registerId='vic-gifts-2025-02-01_2025-06-30',period={id:'2025-02-01_2025-06-30',label:'1 February 2025 to 30 June 2025',start:'2025-02-01',end:'2025-06-30'};
const document={id:registerId,url:source,title:'Fixture register',period,status:'cleared',receipt:{sha256:sha,snapshot},licence:{status:'open',name:'CC BY 4.0',url:cc,policy_url:'https://www.vic.gov.au/copyright',policy_receipt:{sha256:sha,snapshot}}};
const row={id:registerId+'/table-1/row-1',register_id:registerId,office_holder:'Example Member',portfolio:'Example portfolio',role:'Minister',period:period.label,description:'Tickets from Jamie Resident & a concert, 2 March 2025',giver:'Jamie Resident',date:null,estimated_value:null,action_taken:null,source_url:source,source_locator:'table-1/row-1',source_table_id:'table-1',source_row_id:'row-1',snapshot,sha256:sha,licence:'CC BY 4.0',licence_url:cc,official:null};
const fixture={schema:1,source_index:'https://www.vic.gov.au/ministerial-gifts-benefits-and-hospitality-register',generated_at:snapshot,attribution:'© Copyright State Government of Victoria',changes:'Whitespace normalised. No endorsement implied.',scope:'Fixture',registers:[{document,rows:[row]}],holds:[]};
const staged=JSON.parse(readFileSync(new URL('../../data/staged/vic-gifts/hub.json',import.meta.url),'utf8'));
const block=(title,text)=>`<h1>${title}</h1><p>${text}</p>`;
const read=async()=>structuredClone(fixture);
const api=(query='',reader=read)=>vicGiftsResponse(new Request('https://opax.test/api/register/vic-gifts'+query),reader);

test('SSR renders periods, totals, source, licence and a real shared table',async()=>{
 const page=await vicGiftsPage(new URL('https://opax.test/register/vic-gifts'),read,block),doc=new JSDOM(page.prerender).window.document;
 assert.equal(page.status,200);assert.equal(doc.querySelector('h1').textContent,'Victorian gifts and hospitality');
 assert.equal(doc.querySelectorAll('[data-datatable] tbody tr').length,1);assert.equal(doc.querySelectorAll('.vic-gifts-totals li').length,1);
 assert.ok(doc.body.textContent.includes(row.giver));assert.ok(doc.body.textContent.includes(row.description));assert.match(doc.body.textContent,/Snapshot.*2026/);assert.match(doc.body.textContent,/SHA-256 a{64}/);assert.match(doc.body.textContent,/CC BY 4.0/);
 assert.equal(doc.querySelectorAll('a[href^="/subject/person"]').length,0);
 const csv=await(await api('?format=csv')).text();for(const value of [row.giver,row.description,sha,'Snapshot','Licence','Source row'])assert.ok(csv.includes(value));
 assert.match(csv,/Not published/);
});

test('licence and snapshot rejection exclude rows from HTML, hydration and CSV',async()=>{
 for(const change of [h=>h.registers[0].document.licence.status='held',h=>h.registers[0].document.status='held',h=>h.registers[0].document.licence.url='https://example.test/restricted',h=>h.registers[0].document.licence.policy_receipt.sha256='bad']){
  const h=structuredClone(fixture);change(h);assert.equal(clearedGiftRegisters(h).length,0);
  const p=await vicGiftsPage(new URL('https://opax.test/register/vic-gifts'),async()=>h,block);assert.equal(p.status,503);assert.ok(!p.prerender.includes(row.giver));
  assert.equal((await api('?format=csv',async()=>h)).status,503);
 }
 const h=structuredClone(fixture);h.registers[0].rows.push({...row,id:registerId+'/table-1/row-2',source_locator:'table-1/row-2',giver:'Held Fixture',sha256:'b'.repeat(64)});
 const p=await vicGiftsPage(new URL('https://opax.test/register/vic-gifts'),async()=>h,block);assert.ok(!p.prerender.includes('Held Fixture'));assert.ok(!(await(await api('?format=csv',async()=>h)).text()).includes('Held Fixture'));
});

test('givers remain source text and produce no name or description search hits',async()=>{
 for(const q of ['Jamie Resident','Tickets','concert']){
  const response=await api('?q='+encodeURIComponent(q));assert.equal(response.status,200);assert.equal((await response.json()).total,0);
  const page=await vicGiftsPage(new URL('https://opax.test/register/vic-gifts?vicGifts.q='+encodeURIComponent(q)),read,block);
  assert.equal(JSON.parse(new JSDOM(page.prerender).window.document.querySelector('[data-dt-page]').textContent).total,0);
 }
 const data=await(await api('?q=Example')).json();assert.equal(data.total,1);assert.equal(data.rows[0].href,null);
 assert.equal((await api('?person='+encodeURIComponent('/subject/person/jamie-resident'))).status,404);
 assert.equal(new JSDOM((await vicGiftsPage(new URL('https://opax.test/register/vic-gifts'),read,block)).prerender).window.document.querySelectorAll('a').length>0,true);
});

test('staged periods reconcile exactly and person sections use only staged roster matches',async()=>{
 const all=clearedGiftRegisters(staged);assert.equal(all.length,3);assert.deepEqual(all.map(r=>r.rows.length),[63,135,84]);assert.equal(all.flatMap(r=>r.rows).length,282);
 assert.equal(all.flatMap(r=>r.rows).filter(r=>r.official).length,275);
 for(const r of all){const p=await vicGiftsPage(new URL('https://opax.test/register/vic-gifts?period='+r.document.period.id),async()=>staged,block);assert.equal(p.status,200);assert.match(p.description,new RegExp('^'+r.rows.length+' '));}
 const href=all[0].rows[0].official.href,expected=all.flatMap(r=>r.rows).filter(r=>r.official?.href===href).length;
 const html=await vicGiftsPersonBlock(href,async()=>staged,new URL('https://opax.test'+href));assert.match(html,new RegExp(expected+' published entries'));assert.match(html,/Snapshot/);assert.match(html,/CC BY 4.0/);
 const response=await api('?person='+encodeURIComponent(href),async()=>staged);assert.equal((await response.json()).total,expected);
 assert.equal(await vicGiftsPersonBlock('/subject/person/unlinked',async()=>staged,new URL('https://opax.test/subject/person/unlinked')),'');
 const h=structuredClone(staged);h.registers[0].rows[0].official.href='/subject/person/other-fixture';assert.equal(clearedGiftRegisters(h)[0].rows[0].official,null);
});

test('SSR and hydrated server search share the same query and preserve plain giver wording',async()=>{
 const url='https://opax.test/register/vic-gifts?vicGifts.q=Example',page=await vicGiftsPage(new URL(url),read,block);
 const dom=new JSDOM(page.prerender,{url}),doc=dom.window.document;let calls=0;
 dom.window.fetch=async url=>{calls++;return vicGiftsResponse(new Request(url),read);};
 const previous=globalThis.MutationObserver;globalThis.MutationObserver=dom.window.MutationObserver;
 try{
  hydrateRegisterTables(doc);await new Promise(setImmediate);assert.equal(doc.querySelector('[data-search]').value,'Example');assert.ok(doc.body.textContent.includes(row.giver));
  const input=doc.querySelector('[data-search]');input.value=row.giver;input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  await new Promise(done=>setTimeout(done,450));assert.equal(JSON.parse(doc.querySelector('[data-dt-page]').textContent).total,0);assert.ok(calls>0);
 }finally{doc.body.replaceChildren();await new Promise(setImmediate);globalThis.MutationObserver=previous;dom.window.close();}
});

test('invalid periods and unavailable staged assets fail honestly; methods and duplicate queries are rejected',async()=>{
 assert.equal((await vicGiftsPage(new URL('https://opax.test/register/vic-gifts?period=missing'),read,block)).status,404);
 assert.equal((await vicGiftsPage(new URL('https://opax.test/register/vic-gifts'),async()=>{throw Error('missing')},block)).status,503);
 assert.equal((await api('?q=one&q=two')).status,400);
 assert.equal((await vicGiftsResponse(new Request('https://opax.test/api/register/vic-gifts',{method:'POST'}),read)).status,405);
});

test('actual Worker dispatch registers page and API routes without production bindings',async()=>{
 const code=await build({entryPoints:[new URL('../src/index.ts',import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],plugins:[{name:'omit-renderer',setup(b){b.onResolve({filter:/^\.\/og-render$/},()=>({path:'renderer',namespace:'vic-gifts-test'}));b.onLoad({filter:/.*/,namespace:'vic-gifts-test'},()=>({contents:'export const renderOgPng=async()=>null;export const renderOgJpeg=renderOgPng;export const renderStoryJpeg=renderOgPng;',loader:'js'}));}}]});
 const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(code.outputFiles[0].text).toString('base64'));let html='',head='',removed=false;
 globalThis.HTMLRewriter=class{handlers=[];on(s,h){this.handlers.push([s,h]);return this;}transform(response){for(const [s,h]of this.handlers){if(s==='main#main')h.element({setAttribute(){},setInnerContent(v){html=v;}});if(s==='head')h.element({append(v){head+=v;}});if(s==='script[src]')h.element({getAttribute(){return '/app.js';},remove(){removed=true;}});}return response;}};
 const paths=[],env={ASSETS:{async fetch(req){const path=new URL(req.url).pathname;paths.push(path);return new Response(path==='/vic-gifts/data.json'?JSON.stringify(fixture):readFileSync(new URL('../public/index.html',import.meta.url),'utf8'));}}};
 const response=await worker.fetch(new Request('https://opax.com.au/register/vic-gifts'),env,{});assert.equal(response.status,200);assert.match(html,/Jamie Resident/);assert.match(head,/vic-gifts.css/);assert.equal(removed,true);assert.ok(paths.includes('/vic-gifts/data.json'));
 const result=await worker.fetch(new Request('https://opax.com.au/api/register/vic-gifts?q=Jamie'),env,{});assert.equal(result.status,200);assert.equal((await result.json()).total,0);
 assert.match(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'),/"\/register\/vic-gifts", "\/register\/vic-gifts\/"/);
});
