// "About this data" on the Victorian election pages and in the app feed names only the sources that surface
// shows. OPAX's parliamentary record (speeches and votes) is named only where a member's record section is
// drawn, by the same condition that draws it; the VEC and ABS attribution stays word for word everywhere.
import './helpers/vic-election-clock.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {VIC_ELECTION_ASSET} from '../public/vic-election.js';

async function compile(entry) {
  const result=await build({entryPoints:[new URL(entry,import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false});
  return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const {renderVicElection,VIC_ELECTION_ABOUT,vicElectionAbout}=await compile('../src/vic-election.ts');
const {appVicElection}=await compile('../src/app-vic-election.ts');
const data=JSON.parse(await readFile(new URL('../public/hubs/vic-election-2026.json',import.meta.url),'utf8'));
const places=JSON.parse(await readFile(new URL('../public/hubs/vic-election-2026-places.json',import.meta.url),'utf8'));

// The licences' attribution, as it has always been given.
const ATTRIBUTION='Dates, boundaries and results © Victorian Electoral Commission; suburb and postcode splits from the Australian Bureau of Statistics (both CC BY 4.0)';
const RECORD=/speech|vote|parliamentary record/i;
const CAMPAIGN=new Date('2026-11-17T12:00:00+11:00'), CLOSED=new Date('2026-11-29T10:00:00+11:00');
const page=(seat,now)=>JSDOM.fragment(renderVicElection(data,seat,{},now).html);
const aboutOf=(fragment)=>{
  const about=fragment.querySelectorAll('.vic-about');
  assert.equal(about.length,1,'one About line per page');
  return about[0].textContent;
};
const drawsRecord=(fragment)=>Boolean(fragment.querySelector('#record, .vic-member'));

test('until the polls close, the hub and every seat page draw no record, and their About line names no speeches or votes', () => {
  for(const seat of [null,...data.seats]) {
    const fragment=page(seat,CAMPAIGN), about=aboutOf(fragment), name=seat?.name ?? 'hub';
    assert.equal(drawsRecord(fragment),false,name);
    assert.doesNotMatch(about,RECORD,name);
    assert.ok(about.startsWith(`About this data: d${ATTRIBUTION.slice(1)}.`),name);
  }
});

test('after the polls close, a page names the parliamentary record exactly where it draws a member\'s record', () => {
  const kinds=new Set();
  for(const seat of [null,...data.seats]) {
    const fragment=page(seat,CLOSED), about=aboutOf(fragment), name=seat?.name ?? 'hub';
    const drawn=drawsRecord(fragment);
    kinds.add(`${seat?.kind ?? 'hub'}:${drawn}`);
    assert.equal(about.includes('speeches and votes from OPAX’s parliamentary record.'),drawn,name);
    if(!drawn) assert.doesNotMatch(about,RECORD,name);
    assert.ok(about.startsWith(`About this data: d${ATTRIBUTION.slice(1)}`),name);
  }
  // The hub draws no record; districts and regions with members do.
  assert.ok(kinds.has('hub:false') && kinds.has('district:true') && kinds.has('region:true'),[...kinds].join(' '));
  // A district whose member is recorded keeps the clause; the same district left vacant draws no record and drops it.
  const district=data.seats.find(s=>s.kind==='district' && s.members.length && !s.vacancy);
  const kept=page(district,CLOSED);
  assert.ok(kept.querySelector('#record'),'the record section is drawn');
  assert.equal(aboutOf(kept),`About this data: d${ATTRIBUTION.slice(1)}; speeches and votes from OPAX’s parliamentary record. How this page is built`);
  const vacant={...district,vacancy:{last:district.members[0],to:'2026-06-30'}};
  const left=JSDOM.fragment(renderVicElection({...data,seats:data.seats.map(s=>s===district ? vacant : s)},vacant,{},CLOSED).html);
  assert.equal(drawsRecord(left),false);
  assert.doesNotMatch(aboutOf(left),RECORD);
});

test('the app feed\'s about names no speeches or votes: the app shows it only on its hub and Today block, which draw none', async () => {
  assert.equal(VIC_ELECTION_ABOUT,`${ATTRIBUTION}.`);
  assert.equal(vicElectionAbout(false),VIC_ELECTION_ABOUT);
  assert.equal(vicElectionAbout(true),`${ATTRIBUTION}; speeches and votes from OPAX’s parliamentary record.`);
  const env={VIC_ELECTION_HUB_ENABLED:'true',ASSETS:{fetch:async req=>new Response(JSON.stringify(new URL(req.url).pathname===VIC_ELECTION_ASSET?data:places))}};
  for(const now of [CAMPAIGN,CLOSED]) {
    const r=await appVicElection(new Request('https://opax.com.au/api/app/v1/vic-election'),env,now);
    assert.equal(r.status,200);
    const overview=await r.json();
    assert.equal(overview.about,VIC_ELECTION_ABOUT);
    assert.doesNotMatch(overview.about,RECORD);
  }
});
