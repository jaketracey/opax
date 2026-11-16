// Equal treatment on Victorian election pages: one row for every candidate, a record link only where
// one is verified, no portraits, the same grey party dot for all, and no featured vote.
process.env.TZ = 'UTC';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {VIC_ELECTION_POLLS_CLOSE} from '../public/vic-election.js';

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
    assert.deepEqual([...label.classList].filter(c=>c.startsWith('party-')),['party-grey'],seat?.name??'hub');
  }
  assert.ok(labels>500,'the pages do carry party labels');
});

test('every candidate in a seat is drawn by the same row, in the VEC’s ballot paper order',()=>{
  for(const {seat,doc} of pages) {
    if(!seat?.candidates) continue;
    const section=doc.querySelector('#candidates'),rows=[...section.querySelectorAll('.vic-candidates > li')];
    assert.deepEqual(rows.map(li=>li.querySelector('.vic-candidate-name').textContent),seat.candidates.list.map(c=>c.name),seat.name);
    assert.match(section.querySelector('.ui-section-note').textContent,/^Listed in the VEC’s published order, which is ballot paper order, with each party as the VEC names it\. Published \d/);
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

test('no seat page carries a record section for anyone until the polls close; it returns from that instant',()=>{
  const CLOSE=Date.parse(VIC_ELECTION_POLLS_CLOSE);
  assert.equal(new Date(CLOSE).toISOString(),'2026-11-28T07:00:00.000Z','6 pm Saturday 28 November 2026 in Melbourne');
  const district=data.seats.find(s=>s.kind==='district'&&s.name==='Richmond'),region=data.seats.find(s=>s.kind==='region');
  const render=(s,now)=>{const page=renderVicElection(data,s,{},now);return {page,doc:new JSDOM(page.html).window.document};};
  for(const now of [new Date('2026-11-16T10:00:00+11:00'),new Date(CLOSE-1)]) {
    for(const s of data.seats) {
      const {page,doc}=render(s,now);
      assert.equal(doc.querySelectorAll('#record, .vic-member, .vic-stats, .vic-speech-search').length,0,s.name);
      assert.doesNotMatch(page.html+page.description,/has done|have done/,s.name);
      if(s.kind!=='district') continue;
      // The previous member is named once on the page, in the dated line, as a plain link to their own page.
      const m=s.members[0],row=doc.querySelector('#last-parliament .vic-facts > div');
      // The line sits apart from the candidates, after them, and the previous result is attached to nobody.
      const order=[...doc.querySelectorAll('.vic-hub > .vic-facts, #candidates, #last-parliament')].map(n=>n.id||'result');
      assert.deepEqual(order,['result','candidates','last-parliament'],s.name);
      assert.equal(doc.querySelector('#last-parliament h2').textContent,'Last parliament');
      assert.equal(doc.querySelectorAll('.vic-hub > .vic-facts a[href^="/subject/person/"]').length,0,s.name);
      if(s.name==='Brunswick') {  // vacant when the term ended: nobody is named its member (vic-term.test.mjs)
        // The release gives the last member and the day that service ended: said once, here, below the candidates.
        const last=s.vacancy.last.name;
        assert.equal(row.textContent,`MemberVacant when the Assembly expired on 3 November. Last member: ${last}, to 19 September 2026.`);
        assert.equal(page.html.split(last).length-1,1);
        assert.ok(!(page.description+JSON.stringify(page.jsonLd)+JSON.stringify(page.card)).includes(last));continue;
      }
      assert.equal(row.querySelector('dt').textContent,`Member for ${s.name} until the Assembly expired on 3 November`,s.name);
      assert.deepEqual([...row.querySelectorAll('dd a')].map(a=>[a.getAttribute('href'),a.textContent]),[[m.href,m.name]],s.name);
      const elsewhere=doc.querySelector('.vic-hub').cloneNode(true);
      for(const part of elsewhere.querySelectorAll('#last-parliament, #candidates, #region')) part.remove();
      assert.ok(!elsewhere.textContent.includes(m.name),s.name);
      assert.equal(page.description.split(m.name).length,2,s.name);
    }
    // A region's previous members are a plain list of links under the dated heading.
    const {doc}=render(region,now),members=doc.querySelector('#members');
    assert.equal(members.querySelector('h2').textContent,'Last parliament');
    assert.ok(members.querySelector('.ui-section-note').textContent.startsWith(`Members for ${region.name} Region until the Council expired on 3 November.`));
    assert.ok(doc.querySelector('#candidates').compareDocumentPosition(members)&4,'after the candidates');
    assert.deepEqual([...members.querySelectorAll('.vic-people > li > a')].map(a=>[a.getAttribute('href'),a.textContent]),region.members.map(m=>[m.href,m.name]));
    assert.equal(members.querySelectorAll('a').length,region.members.length);
  }
  for(const now of [new Date(CLOSE),new Date('2026-11-29T10:00:00+11:00')]) {
    const d=render(district,now);
    assert.equal(d.doc.querySelector('#record h2').textContent,`What ${district.members[0].name} has done`);
    assert.ok(d.doc.querySelector('#record .vic-speech-search'));
    assert.equal(d.doc.querySelectorAll('.vic-votes').length,0,'still no featured vote');
    assert.equal(render(region,now).doc.querySelectorAll('#members .vic-member').length,region.members.length);
  }
  // A member the VEC list shows is not standing gets the same treatment: no section during the campaign.
  const notStanding=data.seats.find(s=>s.name==='Bendigo West');
  assert.equal(render(notStanding,new Date(CLOSE-1)).doc.querySelector('#record'),null);
});

test('until the polls close the hub’s rows name no person, and a seat page’s structured data lists nobody',()=>{
  const CLOSE=Date.parse(VIC_ELECTION_POLLS_CLOSE),names=data.seats.flatMap(s=>s.members.map(m=>m.name));
  const region=data.seats.find(s=>s.kind==='region'),district=data.seats.find(s=>s.kind==='district'&&s.name==='Richmond');
  for(const now of [new Date('2026-11-16T10:00:00+11:00'),new Date(CLOSE-1)]) {
    const hub=new JSDOM(renderVicElection(data,null,{},now).html).window.document;
    for(const row of hub.querySelectorAll('.vic-seat')) {
      const seat=data.seats.find(s=>s.name===row.querySelector('.vic-seat-name').textContent);
      // The previous result is the seat's; beside it is the number of candidates, never a person or a party label.
      assert.equal(row.querySelector('.vic-seat-held').textContent,`${seat.candidates.list.length} candidates`,seat.name);
      assert.equal(row.querySelectorAll('.ui-party').length,0,seat.name);
    }
    assert.equal(hub.querySelectorAll('#regions .ui-party').length,0);
    const text=hub.querySelector('.vic-hub').textContent;
    for(const name of names) assert.ok(!text.includes(name),name);
    assert.doesNotMatch(text,/Each row shows the member/);
    // The same rows on a region page.
    const page=new JSDOM(renderVicElection(data,region,{},now).html).window.document;
    assert.equal(page.querySelectorAll('#districts .ui-party').length,0);
    for(const s of [district,region]) assert.equal(renderVicElection(data,s,{},now).jsonLd['@graph'][1].numberOfItems,0,s.name);
  }
  const after=new Date(CLOSE);
  assert.ok(new JSDOM(renderVicElection(data,null,{},after).html).window.document.querySelectorAll('#districts .ui-party').length>=87);
  assert.deepEqual(renderVicElection(data,district,{},after).jsonLd['@graph'][1].itemListElement.map(x=>x.name),district.members.map(m=>m.name));
  assert.equal(renderVicElection(data,region,{},after).jsonLd['@graph'][1].numberOfItems,5);
});
