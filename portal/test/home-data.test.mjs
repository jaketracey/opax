import test from 'node:test';
import assert from 'node:assert/strict';
import {newest,dailySelection,safeSource} from '../public/home-data.js';
import {readFileSync} from 'node:fs';
test('recent lists use recording dates, retain ties, and exclude undated entries',()=>{
 const rows=[{id:1,date:'2026-09-01'},{id:2,date:'2026-09-19'},{id:3,date:'2026-09-19'},{id:4},{id:5,date:'2026-08-01'}];
 assert.deepEqual(newest(rows,'date',3).map(r=>r.id),[2,3,1]);
 assert.equal(rows[0].id,1);
});
test('daily records are stable across source order and change at Melbourne midnight',()=>{
 const rows=Array.from({length:40},(_,id)=>({id:String(id)}));
 const pick=(items,at)=>dailySelection(items,r=>r.id,8,new Date(at)).map(r=>r.id);
 assert.deepEqual(pick(rows,'2026-09-19T00:00:00Z'),pick([...rows].reverse(),'2026-09-19T13:59:59Z'));
 assert.notDeepEqual(pick(rows,'2026-09-19T13:59:59Z'),pick(rows,'2026-09-19T14:00:00Z'));
 assert.equal(new Set(pick(rows,'2026-09-19T00:00:00Z')).size,8);
});
test('source links cannot execute script or open unsupported URL schemes',()=>{
 assert.equal(safeSource('javascript:alert(1)'),null);
 assert.equal(safeSource('data:text/html,test'),null);
 assert.equal(safeSource('https://www.aph.gov.au/register'),'https://www.aph.gov.au/register');
});
test('the deployment excludes workbench assets and the review-only prototype',()=>{
 const ignore=readFileSync(new URL('../public/.assetsignore',import.meta.url),'utf8');
 assert.match(ignore,/^\/ui-workbench\.\*$/m);
 assert.match(ignore,/^\/home-prototype\.html$/m);
});
// Renders the cards against the real exports for a fixed day; serve() can replace any file.
// Parsed once and shared: the cards only read these objects.
const files=new Map(), program=key=>`/grants/federal/programs/${encodeURIComponent(key)}.json`;
const exported=path=>{ if(!files.has(path)) files.set(path,JSON.parse(readFileSync(new URL('../public'+path,import.meta.url)))); return files.get(path); };
const candidates=now=>dailySelection(exported('/graph/grants.federal.json').programs.filter(p=>p.key && p.c),p=>p.key,3,now);
const linkable=now=>candidates(now).some(c=>(exported(program(c.key)).grants||[]).some(g=>g.guid));
const day=n=>new Date(Date.UTC(2026,9,1+n,2));
async function render(now, serve=()=>undefined){
 const {hydrateRecordCards} = await import('../public/home-data.js');
 const previousFetch=globalThis.fetch, previousDocument=globalThis.document;
 const track={innerHTML:''}, fetched=[];let changed=false;
 globalThis.document={querySelector:()=>track};
 globalThis.fetch=async path=>{fetched.push(path);const body=serve(path) ?? exported(path);return {ok:true,json:async()=>body};};
 try { await hydrateRecordCards(()=>{changed=true},now); assert.ok(changed); }
 finally {globalThis.fetch=previousFetch;globalThis.document=previousDocument;}
 return {html:track.innerHTML, programs:fetched.filter(path=>path.startsWith('/grants/federal/programs/'))};
}
test('real export schemas produce people, donor, grant and program cards', async()=>{
 // a fixed day with a linkable grant in the export, so the result never depends on the calendar
 let n=0; while(!linkable(day(n))) assert.ok(++n<60,'no linkable federal grant in 60 days of picks');
 const {html}=await render(day(n));
 assert.equal((html.match(/data-record-type="parliamentarian"/g)||[]).length,8);
 for(const kind of ['donor','grant','program']) assert.match(html,new RegExp(`data-record-type="${kind}"`));
 assert.doesNotMatch(html,/NaN|undefined|could not load/);
});
test('a day whose program has no linkable grant falls through to the next pick', async()=>{
 const now=new Date('2026-10-08T00:00:00Z'), [a,b]=candidates(now);
 const {html,programs}=await render(now,path=>{
  if(path===program(a.key)) return {...exported(path),grants:[{id:'g0',n:'No guid',v:1,fy:'2026-27'}]};
  if(path===program(b.key)) return {...exported(path),n:'Second pick',grants:[{id:'g1',guid:'GUID-2',n:'Linked grant',v:1000,fy:'2026-27'}]};
 });
 assert.deepEqual(programs,[program(a.key),program(b.key)]);
 assert.match(html,/data-record-type="grant"[^]*GUID-2[^]*Second pick/);
 assert.match(html,/data-record-type="program"[^]*Second pick/);
});
test('without a linkable grant in three picks the first program shows alone', async()=>{
 const now=new Date('2026-10-08T00:00:00Z'), picks=candidates(now);
 const {html,programs}=await render(now,path=>picks.some(c=>path===program(c.key)) ? {...exported(path),n:path===program(picks[0].key) ? 'First pick' : 'Other pick',grants:[]} : undefined);
 assert.deepEqual(programs,picks.map(c=>program(c.key)));
 assert.doesNotMatch(html,/data-record-type="grant"/);
 assert.match(html,/data-record-type="program"[^]*First pick/);
 assert.doesNotMatch(html,/Other pick/);
});
test('across 60 days a grant card renders whenever one of the first three picks has a linkable grant', async()=>{
 let shown=0;
 for(let d=0;d<60;d++){
  const now=day(d), expected=linkable(now);
  const {html,programs}=await render(now);
  assert.equal(/data-record-type="grant"/.test(html),expected,now.toISOString());
  assert.ok(programs.length>=1 && programs.length<=3);
  shown+=expected;
 }
 console.log(`# grant card on ${shown}/60 days`);
});
