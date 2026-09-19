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
test('real export schemas produce people, donor, grant and program cards', async()=>{
 const {hydrateRecordCards} = await import('../public/home-data.js');
 const previousFetch=globalThis.fetch, previousDocument=globalThis.document;
 const track={innerHTML:''};let changed=false;
 globalThis.document={querySelector:()=>track};
 globalThis.fetch=async path=>new Response(readFileSync(new URL('../public'+path,import.meta.url)),{headers:{'content-type':'application/json'}});
 try {
  await hydrateRecordCards(()=>{changed=true});
  assert.ok(changed);
  assert.equal((track.innerHTML.match(/data-record-type="parliamentarian"/g)||[]).length,8);
  for(const kind of ['donor','grant','program']) assert.match(track.innerHTML,new RegExp(`data-record-type="${kind}"`));
  assert.doesNotMatch(track.innerHTML,/NaN|undefined|could not load/);
 } finally {globalThis.fetch=previousFetch;globalThis.document=previousDocument;}
});
