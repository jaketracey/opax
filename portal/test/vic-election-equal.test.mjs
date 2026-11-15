// Equal treatment on Victorian election pages: one row for every candidate, a record link only where
// one is verified, no portraits, the same grey party dot for all, and no featured vote.
process.env.TZ = 'UTC';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

async function compile(entry) {
  const result=await build({entryPoints:[new URL(entry,import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false});
  return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const {renderVicElection}=await compile('../src/vic-election.ts');
const data=JSON.parse(await readFile(new URL('../public/hubs/vic-election-2026.json',import.meta.url),'utf8'));
const pages=[null,...data.seats].map(s=>({seat:s,doc:new JSDOM(renderVicElection(data,s).html).window.document}));
// A row's shape with its own words taken out. The party label's inside is the shared label's: a party
// with a common short name ("Labor") carries its long name for screen readers, the rest are printed in full.
const shape=li=>{const row=li.cloneNode(true);for(const label of row.querySelectorAll('.ui-party')){label.removeAttribute('title');label.innerHTML='<i></i>';}
  return row.outerHTML.replace(/>[^<]+</g,'><');};

test('every party label on every election page has the same grey dot',()=>{
  let labels=0;
  for(const {seat,doc} of pages) for(const label of doc.querySelectorAll('.vic-hub .ui-party')) {
    labels++;
    assert.deepEqual([...label.classList].filter(c=>c.startsWith('party-')),['party-oth'],seat?.name??'hub');
  }
  assert.ok(labels>500,'the pages do carry party labels');
});

test('every candidate in a seat is drawn by the same row, in the VEC’s ballot paper order',()=>{
  for(const {seat,doc} of pages) {
    if(!seat?.candidates) continue;
    const section=doc.querySelector('#candidates'),rows=[...section.querySelectorAll('.vic-candidates > li')];
    assert.deepEqual(rows.map(li=>li.querySelector('.vic-candidate-name').textContent),seat.candidates.list.map(c=>c.name),seat.name);
    assert.match(section.querySelector('.ui-section-note').textContent,/^In ballot paper order, as published by the VEC on /);
    // Two shapes only: with a party label, or without one for a candidate nominated without a party.
    const withParty=new Set(),without=new Set();
    for(const [i,li] of rows.entries()) (seat.candidates.list[i].party&&seat.candidates.list[i].party.toLowerCase()!=='independent'?withParty:without).add(shape(li));
    assert.ok(withParty.size<=1&&without.size<=1,seat.name);
    // No portrait and no link for anyone: no verified candidate records are loaded yet.
    assert.equal(section.querySelectorAll('img, picture, .subject-portrait, .vic-candidates a').length,0,seat.name);
  }
});

test('a candidate links to a record only where a verified one is given',()=>{
  const seat=data.seats.find(s=>s.kind==='district'&&s.candidates),list=seat.candidates.list.map((c,i)=>
    i===0?{...c,record:{href:'/subject/person/example-member'}}:i===1?{...c,record:{href:'https://example.com/x'}}:i===2?{...c,record:null}:c);
  const doc=new JSDOM(renderVicElection(data,{...seat,candidates:{...seat.candidates,list}}).html).window.document;
  const links=[...doc.querySelectorAll('#candidates .vic-candidate-name a')];
  assert.deepEqual(links.map(a=>[a.getAttribute('href'),a.textContent]),[['/subject/person/example-member',list[0].name]]);
  assert.deepEqual([...doc.querySelectorAll('#candidates .vic-candidate-name')].map(n=>n.textContent),list.map(c=>c.name));
});

test('no vote is featured on a district or region page',()=>{
  assert.ok(data.seats.some(s=>s.members.some(m=>m.divisions.length)),'members do have recorded divisions');
  for(const {seat,doc} of pages) {
    assert.equal(doc.querySelectorAll('.vic-votes').length,0,seat?.name??'hub');
    assert.doesNotMatch(doc.body.textContent,/Recent votes?/);
  }
});
