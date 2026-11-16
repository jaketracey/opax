// Who was the member of each Victorian seat when its house's term ended on 3 November 2026, checked
// over the published roster and electorates index: the phrase "Member for X until the Assembly expired
// on 3 November" names exactly the member each seat's own row names, and nobody else.
process.env.TZ = 'UTC';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {referenceOnlyPeople,rosterFold} from '../public/roster-party.js';
import {VIC_VACANT_AT_EXPIRY,vicIsMember,vicTermEnd,vicMembersAtExpiry,vicSeatEnded,vicSeatVacantAtExpiry,vicVacantSentence,vicExpiredPhrase,vicMemberRole} from '../public/vic-term.js';
import {personRole,personTitle,roleLine,TITLE_MAX} from '../src/seo-titles.ts';
import {vicEndedSeat} from '../src/vic-term-role.ts';
import {personHeadPrerender} from '../src/seo-content.ts';

const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const manifest=await json('../public/electorates/manifest.json');
const rows=(await json('../public'+manifest.index_url)).electorates;
const reference=(await json('../public'+manifest.people_url)).people;
const roster=(await json('../public/parliamentarians.json')).people;
// The Worker's own people (src/index.ts loadPeople): the speech roster plus seat holders it has no row for.
const people=[...roster,...referenceOnlyPeople(roster,reference).map(({person:p,seats})=>({name:p.name,pid:p.legacy_person_id||p.person_id,party:seats[0].party||null,current:true,
  representation:seats.map(e=>({electorate:e.name,jurisdiction:e.jurisdiction,chamber:e.chamber})),states:[...new Set(seats.map(e=>e.jurisdiction))],chambers:[...new Set(seats.map(e=>e.chamber))],first:null,last:null}))];
const vic=rows.filter(e=>e.jurisdiction==='vic');
const ASSEMBLY='until the Assembly expired on 3 November',COUNCIL='until the Council expired on 3 November';
const title=p=>personTitle(p.name,personRole(p,2026,vicEndedSeat(p,rows)),'Speeches');
const named=people.filter(p=>vicTermEnd(p,rows)?.row);

test('the index speaks for all 96 Victorian seats, and every one is in an ended house',()=>{
  assert.equal(vic.filter(e=>e.chamber==='vic_la').length,88);assert.equal(vic.filter(e=>e.chamber==='vic_lc').length,8);
  for(const row of vic) assert.equal(vicSeatEnded(row,rows),true,row.name);
  for(const row of rows.filter(e=>e.jurisdiction!=='vic')) assert.equal(vicSeatEnded(row,rows),false,row.name);
});

test('every seat’s member at 3 November resolves to exactly one person, and nobody else is named',()=>{
  const claimed=new Map();
  for(const row of vic) {
    const members=vicMembersAtExpiry(row,rows);
    // A seat resolves to its roster's members, or to a reviewed vacancy: never to nothing unexplained.
    if(vicSeatVacantAtExpiry(row)) assert.deepEqual(members,[],row.name);
    else assert.equal(members.length,row.chamber==='vic_lc'?5:1,`${row.name}: member at 3 November not resolvable`);
    for(const rep of members) {
      const hits=people.filter(p=>vicIsMember(rep,p));
      assert.equal(hits.length,1,`${row.name}: ${rep.person.name} matches ${hits.length} people`);
      const end=vicTermEnd(hits[0],rows);
      assert.equal(end?.row,row,`${hits[0].name} is the member for ${row.name}`);
      assert.ok(!claimed.has(hits[0]),hits[0].name);claimed.set(hits[0],row);
      // The words are the row's: its seat, its house, its party (a member who changed party is read from the roster).
      const role=personRole(hits[0],2026,vicEndedSeat(hits[0],rows));
      assert.equal(roleLine(role).replace(/ \(Vic\)$/,''),`${rep.party?rep.party+' ':''}${vicMemberRole(row)} ${row.chamber==='vic_lc'?COUNCIL:ASSEMBLY}`,hits[0].name);
      assert.equal(role.name,hits[0].name,'no "MP"');assert.equal(role.former,'');
    }
  }
  assert.equal(claimed.size,88-VIC_VACANT_AT_EXPIRY.length+40);
  // Nobody a row does not name gets the phrase, in a title or a sentence.
  assert.deepEqual(new Set(named),new Set(claimed.keys()));
  for(const p of people) {
    if(claimed.has(p)||!p.representation?.length) continue;
    const role=personRole(p,2026,vicEndedSeat(p,rows));
    assert.doesNotMatch(`${title(p)} ${role?roleLine(role):''}`,/until|expired| to 3 Nov/,p.name);
    // Anyone else recorded in an ended Victorian house is no sitting member either.
    if(p.representation.every(r=>r.jurisdiction==='vic')) {assert.equal(role.former,'former ',p.name);assert.doesNotMatch(role.name,/ MP$/,p.name);}
  }
});

test('each by-election winner of the term is the named member, not the member who left',async()=>{
  const {by_elections}=await json('./fixtures/vic-term/by-elections-2022-26.json');
  assert.deepEqual(by_elections.map(b=>b.district).sort(),['Mulgrave','Narracan','Nepean','Prahran','Warrandyte','Werribee']);
  const hub=await json('../public/hubs/vic-election-2026.json');
  // The election dataset's own later contests are all in the VEC list.
  assert.deepEqual(hub.seats.filter(s=>s.result?.since).map(s=>s.name).sort(),by_elections.filter(b=>b.kind==='by-election').map(b=>b.district).sort());
  for(const b of by_elections) {
    const row=vic.find(e=>e.chamber==='vic_la'&&e.name===b.district),[surname,given]=b.elected.split(', ');
    assert.deepEqual(vicMembersAtExpiry(row,rows).map(m=>rosterFold(m.person.name)),[rosterFold(`${given} ${surname}`)],b.district);
    assert.equal(named.filter(p=>vicTermEnd(p,rows).row===row).length,1,b.district);
  }
  // The members who left mid-term keep their recorded seat in the speech roster and are former members.
  for(const [name,seat] of [['Sam Groth','Nepean'],['Sam Hibbins','Prahran'],['Tim Pallas','Werribee'],['Daniel Andrews','Mulgrave'],['Ryan Smith','Warrandyte']]) {
    const p=people.find(x=>x.name===name);assert.ok(p.representation.some(r=>r.electorate===seat),name);
    assert.deepEqual(vicTermEnd(p,rows),{row:null},name);
    assert.match(title(p),new RegExp(`^${name}, former (?:[A-Z][a-z]+ )?Member for ${seat}`),name);
  }
  // A surname print can hold several people and is never the member.
  for(const name of ['Connolly','Northe','Burgess','Richardson']) assert.deepEqual(vicTermEnd(people.find(x=>x.name===name),rows),{row:null},name);
});

test('a member whose service ended with no by-election leaves the seat vacant when the term ended',()=>{
  // The release records the vacancy itself (scripts/hubs/electorate-vacancies.json): the row names nobody.
  const row=vic.find(e=>e.chamber==='vic_la'&&e.name==='Brunswick');
  assert.deepEqual(row.representatives,[]);assert.equal(row.representation_status,'verified');
  assert.equal(vicSeatVacantAtExpiry(row),true);assert.deepEqual(vicMembersAtExpiry(row,rows),[]);
  assert.equal(vicVacantSentence(row),'Vacant when the Assembly expired on 3 November.');
  const p=people.find(x=>x.name==='Tim Read');
  assert.deepEqual(vicTermEnd(p,rows),{row:null});
  assert.doesNotMatch(title(p),/ MP,|until|expired/);
  // The rule, not the seat: any reviewed vacancy behaves so, and a seat with a by-election winner never does.
  const other=vic.find(e=>e.chamber==='vic_la'&&e.name==='Nepean');
  assert.equal(vicSeatVacantAtExpiry(other),false);assert.equal(vicMembersAtExpiry(other,rows).length,1);
  VIC_VACANT_AT_EXPIRY.push({chamber:'vic_la',electorate:'Nepean'});
  try {
    assert.deepEqual(vicMembersAtExpiry(other,rows),[]);
    assert.deepEqual(vicTermEnd(people.find(x=>x.name==='Anthony Marsh'),rows),{row:null});
  } finally {VIC_VACANT_AT_EXPIRY.pop();}
  assert.equal(vicTermEnd(people.find(x=>x.name==='Anthony Marsh'),rows).row,other);
});

test('the new parliament’s roster ends the rule for every reader at once',()=>{
  const seated=rows.map(e=>'dissolved_for' in e?{...e,dissolved_for:null}:e);
  for(const p of people) assert.equal(vicTermEnd(p,seated),null,p.name);
  for(const row of seated) assert.equal(vicSeatEnded(row,seated),false);
  assert.equal(vicTermEnd(named[0],null),null);
  const p=named.find(x=>x.representation?.some(r=>r.chamber==='vic_la')&&x.last>=2025);
  assert.match(personTitle(p.name,personRole(p,2026,vicEndedSeat(p,seated)),'Speeches'),/ MP, /);
});

test('every title fits the limit; the full sentence is in the description and the page head',()=>{
  for(const p of named) {
    const role=personRole(p,2026,vicEndedSeat(p,rows)),t=title(p);
    assert.ok(t.length<=TITLE_MAX,`${t} (${t.length})`);
    assert.doesNotMatch(t,/ MP,|expired/);
    assert.match(roleLine(role),/until the (?:Assembly|Council) expired on 3 November/);
    const head=new JSDOM(personHeadPrerender('<section id="prerender" class="wrap"><h1>Person</h1></section>',{...p,states:p.states||['vic'],chambers:p.chambers||[]},{ended:vicEndedSeat(p,rows)})).window.document.body.textContent;
    assert.ok(head.includes(`${role.role} ${role.until.phrase}`),p.name);
  }
  const example=people.find(x=>x.name==='Nina Taylor');
  assert.equal(title(example),'Nina Taylor, Member for Albert Park until 3 November 2026 · OPAX');
  const long=people.find(x=>x.name==='Anasina Gray-barberio'||x.name==='Anasina Gray-Barberio');
  assert.ok(title(long).length<=TITLE_MAX);
  // A roster-only member the Worker marks current is not headed "Member for" as a sitting one, and a former member is not either.
  const former=people.find(x=>x.name==='Sam Groth');
  const head=new JSDOM(personHeadPrerender('<section id="prerender" class="wrap"><h1>Person</h1></section>',{...former,current:true},{ended:vicEndedSeat(former,rows)})).window.document.body.textContent;
  assert.doesNotMatch(head,/Member for|until/);
});

const compile=async entry=>{const out=await build({entryPoints:[new URL(entry,import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false});
  return import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));};

test('Ask never answers a Victorian member as current: the seat rows decide',async()=>{
  const {identityAnswer}=await compile('../src/ask-identity.ts');
  const assets={'/electorates/manifest.json':manifest,[manifest.people_url]:{people:reference},[manifest.index_url]:{electorates:rows}};
  const ask=(question,list=roster)=>identityAnswer({question},{origin:'https://example.test',kb:async()=>{throw Error('no search')},asset:async path=>path==='/parliamentarians.json'?{people:list}:assets[path]??null});
  const member=await ask('Is Nina Taylor still in parliament?');
  assert.match(member.answer,/Nina Taylor was Member for Albert Park until the Assembly expired on 3 November 2026\. The Victorian Parliament's term has ended, so they are not recorded as a current member of parliament\./);
  const mlc=await ask('Is Harriet Shing still in parliament?');
  assert.match(mlc.answer,/Harriet Shing was Member for Eastern Victoria Region until the Council expired on 3 November 2026\./);
  for(const name of ['Sam Groth','Tim Read']) {
    const answer=(await ask(`Is ${name} still in parliament?`)).answer;
    assert.match(answer,new RegExp(`${name} is recorded as no longer serving in parliament\\.`),name);
    assert.doesNotMatch(answer,/current member|until|expired|vacan/i,name);
  }
  for(const p of named.filter(x=>roster.includes(x)).slice(0,40)) assert.doesNotMatch((await ask(`Is ${p.name} a current member of parliament?`))?.answer??'',/is recorded as a current member/,p.name);
  // If the seat rows cannot be read, nothing is said of a Victorian person's currency: never "current member".
  const blind=(question)=>identityAnswer({question},{origin:'https://example.test',kb:async()=>{throw Error('no search')},asset:async path=>path==='/parliamentarians.json'?{people:roster}:path===manifest.index_url?Promise.reject(new Error('unavailable')):assets[path]??null});
  for(const name of ['Nina Taylor','Harriet Shing','Sam Groth']) {
    const answer=(await blind(`Is ${name} still in parliament?`)).answer;
    assert.match(answer,new RegExp(`${name}'s current membership of parliament is not established by the roster\\.`),name);
    assert.doesNotMatch(answer,/is recorded as a current member|no longer serving/,name);
  }
  // A federal member is answered from the federal roster as before.
  const federal=roster.find(p=>p.current===true&&p.states.length===1&&p.states[0]==='federal');
  assert.match((await ask(`Is ${federal.name} still in parliament?`)).answer,/is recorded as a current member of parliament/);
});

test('seat pages and electorate profiles name the row’s member, or say the seat was vacant',async()=>{
  const {renderVicElection}=await compile('../src/vic-election.ts');
  const {profileHTML}=await import('../public/electorates.js');
  const hub=await json('../public/hubs/vic-election-2026.json'),NOW=new Date('2026-11-16T10:00:00+11:00');
  const index=new Map(vic.filter(e=>e.chamber==='vic_la').map(e=>[e.name,e.dissolved_for]));
  for(const seat of hub.seats.filter(s=>s.kind==='district')) {
    const row=vic.find(e=>e.chamber==='vic_la'&&e.name===seat.name),page=renderVicElection(hub,seat,{},NOW,null,index);
    const doc=new JSDOM(page.html).window.document,fact=doc.querySelector('#last-parliament .vic-facts > div');
    if(vicSeatVacantAtExpiry(row)) {
      // Nobody is named its member. The page gives the last member once, with the day that service ended
      // (seat-vacancy.test.mjs); the description, share card and structured data name nobody.
      const last=seat.vacancy.last.name;
      assert.deepEqual(seat.members,[]);
      assert.equal(fact.querySelector('dd').textContent,`Vacant when the Assembly expired on 3 November. Last member: ${last}, to 19 September 2026.`);
      assert.equal(page.html.split(last).length-1,1,seat.name+': the last member is named once');
      assert.ok(!(page.title+page.description+JSON.stringify(page.jsonLd)+JSON.stringify(page.card)).includes(last),seat.name+': nobody is named');
      assert.equal(doc.querySelector('#record'),null);
      assert.doesNotMatch(page.html+page.description,/the late|died|death|tribute|resign/i);
    } else {
      assert.equal(fact.querySelector('dt').textContent,`Member for ${seat.name} ${ASSEMBLY}`);
      assert.equal(rosterFold(fact.querySelector('dd a').textContent),rosterFold(vicMembersAtExpiry(row,rows)[0].person.name),seat.name);
    }
  }
  const brunswick=hub.seats.find(s=>s.name==='Brunswick'),last=brunswick.vacancy.last.name;
  const home=new JSDOM(renderVicElection(hub,null,{},new Date('2026-11-29T10:00:00+11:00'),null,index).html).window.document;
  const rowOf=name=>[...home.querySelectorAll('#districts .vic-seat')].find(a=>a.querySelector('.vic-seat-name').textContent===name);
  assert.equal(rowOf('Brunswick').querySelector('.vic-seat-held').textContent,'Vacant');
  assert.ok(!home.body.textContent.includes(last));
  const found=renderVicElection(hub,null,{},NOW,{place:last,hits:[{name:last,kind:'Member',seats:[{seat:brunswick,share:null}]}]},index).html;
  assert.ok(!found.includes(last.split(' ').at(-1)+'</strong>'),'the finder names no member for a vacant seat');
  // The electorate profile says the same and lists nobody.
  const row=vic.find(e=>e.chamber==='vic_la'&&e.name==='Brunswick'),detail=await json('../public'+row.detail_url);
  const held=new JSDOM(profileHTML(detail)).window.document.querySelector('#el-held');
  assert.equal(held.querySelector('h2').textContent,'Member');
  assert.equal(held.querySelector('.ui-empty').textContent,`Vacant when the Assembly expired on 3 November. Last member: ${last}, to 19 September 2026.`);
  assert.equal(held.querySelectorAll('.el-members li').length,0);
});
