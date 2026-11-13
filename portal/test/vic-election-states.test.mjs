import './helpers/vic-election-clock.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {buildVicElection,projectVicResults} from '../../scripts/build_vic_election.mjs';
import {validateVicElection} from '../src/vic-election-data.ts';
import {withVicElectionBuild} from './helpers/vic-election-build.mjs';
import {VIC_ELECTION_ASSET,VIC_ELECTION_PLACES,VIC_ELECTION_CACHE} from '../public/vic-election.js';

async function compile(entry) {
  const result=await build({entryPoints:[new URL(entry,import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false});
  return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const {renderVicElection,vicElectionPage,vicElectionState}=await compile('../src/vic-election.ts');
const {appVicElection}=await compile('../src/app-vic-election.ts');
const data=JSON.parse(await readFile(new URL('../public/hubs/vic-election-2026.json',import.meta.url),'utf8'));
const places=JSON.parse(await readFile(new URL('../public/hubs/vic-election-2026-places.json',import.meta.url),'utf8'));
const held=JSON.parse(await readFile(new URL('../../scripts/hubs/vic-results-2022.json',import.meta.url),'utf8'));
const names=data.seats.filter(s=>s.kind==='district').map(s=>s.name);
const ROOT='https://opax.com.au/api/app/v1/vic-election';
const env=d=>({VIC_ELECTION_HUB_ENABLED:'true',ASSETS:{fetch:async req=>new Response(JSON.stringify(new URL(req.url).pathname===VIC_ELECTION_ASSET?d:places))}});
const request=(path='',headers={})=>new Request(ROOT+path,{headers});
const api=async(d,now,path='')=>{
  const r=await appVicElection(request(path),env(d),now);assert.equal(r.status,200,await r.clone().text());return r.json();
};
const cases=[
  ['2026-11-01T10:00:00+11:00','pre_poll','Victorians vote on Saturday 28 November. Enrol or update your details by 8 pm on Tuesday 3 November.','Early voting','Election day'],
  ['2026-11-27T10:00:00+11:00','early_voting','Victorians vote on Saturday 28 November. Enrolment closed at 8 pm on Tuesday 3 November.','Early voting','Election day'],
  ['2026-11-28T08:00:00+11:00','election_day','Election day is today. Voting is open until 6 pm AEDT.','Early voting closed','Election day'],
  ['2026-11-28T18:01:00+11:00','polls_closed','Voting closed at 6 pm AEDT on Saturday 28 November. Check the VEC for count updates.','Early voting closed','Voting closed'],
  ['2026-11-29T10:00:00+11:00','polls_closed','Voting closed at 6 pm AEDT on Saturday 28 November. Check the VEC for count updates.','Early voting closed','Voting closed'],
  ['2026-12-15T10:00:00+11:00','polls_closed','Voting closed at 6 pm AEDT on Saturday 28 November. Check the VEC for count updates.','Early voting closed','Voting closed'],
];
test('Victorian election suites run in UTC, including ISO strings without an offset',()=>{
  assert.equal(process.env.TZ,'UTC');
  assert.equal(new Date('2026-11-28T08:00:00').toISOString(),'2026-11-28T08:00:00.000Z');
});
for(const [date,state,lede,early,election] of cases) test('offline clock state and SSR/app copy: '+date,async()=>{
  const now=new Date(date),d={...data,current_results:null},overview=await api(d,now);
  assert.equal(overview.state,state);assert.equal(overview.lede,lede);assert.equal(overview.current_results,null);
  const closed=state==='polls_closed';
  assert.equal(overview.title,'Victorian election 2026'+(closed?': polls closed':''));
  assert.deepEqual(overview.finder,{title:closed?'Find a seat and its records':'Which seat am I in?',button:closed?'Find seat records':'Find my seat'});
  assert.equal(overview.voting.title,closed?'After voting':'How and where to vote');
  assert.equal(overview.key_dates.find(r=>r.id==='early').label,early);
  assert.equal(overview.key_dates.find(r=>r.id==='election_day').label,election);
  if(closed) assert.equal(overview.key_dates.find(r=>r.id==='early').link,null);
  for(const seat of [null,d.seats[0],d.seats.find(s=>s.kind==='region')]) {
    const rendered=renderVicElection(d,seat,{},now),doc=JSDOM.fragment(rendered.html);
    assert.equal(rendered.state,state);assert.equal(doc.querySelector('.vic-hub').dataset.electionState,state);
    assert.equal(doc.querySelector('.ui-lede').textContent,lede+(!seat&&state==='pre_poll'?' Check your enrolment':''));
    assert.equal(doc.querySelector('#voting h2').textContent,overview.voting.title);
    assert.equal(doc.querySelector('#voting p').textContent,overview.voting.text);
    assert.deepEqual([...doc.querySelectorAll('#voting a')].map(a=>({label:a.textContent,url:a.getAttribute('href')})),overview.voting.links);
    for(const [i,row] of [...doc.querySelectorAll('.vic-dates > div')].entries()) {
      assert.equal(row.querySelector('dt').textContent,overview.key_dates[i].label);
      assert.equal(row.querySelector('dd').firstChild.textContent,overview.key_dates[i].when);
    }
    assert.equal(doc.querySelector('#results'),null);
    const page=await vicElectionPage(seat?.path.split('/').at(-1)??null,async path=>path===VIC_ELECTION_ASSET?d:places,{VIC_ELECTION_HUB_ENABLED:'true'},null,now);
    assert.equal(page.html,rendered.html);
    if(seat) assert.equal((await api(d,now,'/seat/'+seat.path.split('/').at(-1))).state,state);
    if(closed) {
      assert.doesNotMatch(rendered.html+' '+rendered.description,/upcoming|will be held|Victorians vote on|early voting is open|Voting is open|How and where to vote|<dt>Held by<\/dt>/i);
      assert.match(rendered.html,/published roster/);
    }
  }
  assert.equal((await api(d,now,'/find?q=3350')).state,state);
  const doc=JSDOM.fragment(renderVicElection(d,null,{},now).html);
  assert.equal(doc.querySelector('#find-title').textContent,overview.finder.title);
  assert.equal(doc.querySelector('#find button').textContent,overview.finder.button);
});

test('AEDT boundaries use instants on a UTC Worker, including early close and election-day midnight',()=>{
  for(const [date,state] of [
    ['2026-11-17T21:59:59Z','pre_poll'],['2026-11-17T22:00:00Z','early_voting'],
    ['2026-11-27T06:59:59Z','early_voting'],['2026-11-27T07:00:00Z','early_voting'],
    ['2026-11-27T12:59:59Z','early_voting'],['2026-11-27T13:00:00Z','election_day'],
    ['2026-11-28T06:59:59Z','election_day'],['2026-11-28T07:00:00Z','polls_closed'],
  ]) assert.equal(vicElectionState(data,new Date(date)),state,date);
  const before=JSDOM.fragment(renderVicElection(data,null,{},new Date('2026-11-27T20:59:59Z')).html);
  assert.match(before.querySelector('.ui-lede').textContent,/Voting runs from 8 am/);
  const during=JSDOM.fragment(renderVicElection(data,null,{},new Date('2026-11-27T21:00:00Z')).html);
  assert.match(during.querySelector('.ui-lede').textContent,/Voting is open/);
  // Caretaker starts two hours before enrolment closes.
  const rows=JSDOM.fragment(renderVicElection(data,null,{},new Date('2026-11-03T18:01:00+11:00')).html);
  assert.match(rows.querySelector('#key-dates').textContent,/Caretaker period began/);
  assert.match(rows.querySelector('#key-dates').textContent,/Enrol or update/);
  const evening=JSDOM.fragment(renderVicElection(data,null,{},new Date('2026-11-27T07:00:00Z')).html);
  assert.match(evening.querySelector('#voting').textContent,/Early voting has closed/);
});

// Invented 2026 test data derived from held shares, never written to a source file.
function fixture(status='partial') {
  const districts=Object.fromEntries((status==='final'?names:names.slice(0,2)).map(name=>[name,{general:{...held.districts[name].general,date:'2026-11-28',kind:'general',url:'https://www.vec.vic.gov.au/results/state-election-results/2026-state-election-results/results-by-district/'+name.toLowerCase().replaceAll(' ','-')+'-district-results'}}]));
  return {election_day:'2026-11-28',fetched:'2026-12-15',status,index:held.index.replace('2022','2026'),districts};
}
for(const status of ['partial','final']) test('data presence enables '+status+' results only after polls close',async()=>{
  const source=fixture(status),d={...data,current_results:projectVicResults(source,data.election_day,names)};
  validateVicElection(d);
  for(const [date,expected] of [['2026-11-28T17:59:59+11:00','election_day'],['2026-11-28T18:00:00+11:00',status==='final'?'results_final':'results'],['2026-12-15T10:00:00+11:00',status==='final'?'results_final':'results']]) {
    const now=new Date(date),overview=await api(d,now),doc=JSDOM.fragment(renderVicElection(d,null,{},now).html);
    assert.equal(overview.state,expected);assert.equal(doc.querySelector('h1').textContent,overview.title);
    if(expected==='election_day') {assert.equal(overview.current_results,null);assert.equal(doc.querySelector('#results'),null);continue;}
    assert.equal(overview.current_results.districts.length,status==='final'?88:2);
    assert.equal(doc.querySelectorAll('#results li').length,status==='final'?88:2);
    assert.equal(doc.querySelector('#results h2').textContent,status==='final'?'Final lower house results':'Lower house results');
    for(const row of overview.current_results.districts) {
      const seat=d.seats.find(s=>s.name===row.name),detail=await api(d,now,'/seat/'+seat.path.split('/').at(-1));
      assert.deepEqual(detail.current_result,row.result);
      const page=JSDOM.fragment(renderVicElection(d,seat,{},now).html);
      assert.match(page.querySelector('#results').textContent,new RegExp(row.result.party));
      assert.equal(page.querySelector('#results .vic-seat').href,row.result.url);
      // Previous 2022 margins are still separately labelled, never overwritten.
      assert.deepEqual(detail.result.general,seat.result.general);
    }
    const absent=d.seats.find(s=>s.kind==='district'&&!source.districts[s.name]);
    if(absent) {
      const page=renderVicElection(d,absent,{},now),doc=JSDOM.fragment(page.html);
      assert.equal(doc.querySelector('#results'),null);
      assert.match(doc.querySelector('.ui-lede').textContent,/No result for this district has been published here yet/);
      assert.doesNotMatch(page.description+' '+page.card.lines.join(' '),/Published lower house district results are available/);
    }
    const region=d.seats.find(s=>s.kind==='region'&&s.districts.includes(names[0]));
    const regional=JSDOM.fragment(renderVicElection(d,region,{},now).html);
    assert.equal(regional.querySelectorAll('#results li').length,d.current_results.districts.filter(r=>region.districts.includes(r.name)).length);
  }
});

test('HTML validates the asset and drops invalid results before rendering any district result',async()=>{
  const results=projectVicResults(fixture(),data.election_day,names),now=new Date('2026-11-29T00:00:00Z');
  const invalidResults=[{...results,districts:[]},{...results,status:'final'},
    {...results,districts:results.districts.map((r,i)=>i===1?{...r,result:{...r.result,share:999}}:r)},
    {...results,districts:results.districts.map((r,i)=>i===1?{...r,name:'Unknown district'}:r)},
  ];
  for(const current_results of invalidResults) {
    const d={...data,current_results},read=async path=>path===VIC_ELECTION_ASSET?d:places;
    assert.equal((await appVicElection(request(),env(d),now)).status,503);
    for(const seat of [null,data.seats[0],data.seats.find(s=>s.kind==='region')]) {
      const page=await vicElectionPage(seat?.path.split('/').at(-1)??null,read,{VIC_ELECTION_HUB_ENABLED:'true'},null,now);
      assert.equal(page.status,200);assert.equal(page.state,'polls_closed');
      assert.equal(page.html,renderVicElection({...data,current_results:null},seat,{},now).html);
      assert.equal(JSDOM.fragment(page.html).querySelector('#results'),null);
    }
  }
});

test('invalid core data cannot be rendered as a partly usable election page',async()=>{
  for(const d of [null,{}, {...data,seats:[]},{...data,postal_close:'bad'},
    {...data,current_results:{districts:[]},seats:data.seats.map((s,i)=>i===0?{...s,members:[]}:s)}]) {
    const page=await vicElectionPage(null,async()=>d,{VIC_ELECTION_HUB_ENABLED:'true'},null,new Date('2026-11-29T00:00:00Z'));
    assert.equal(page.status,503);assert.equal(JSDOM.fragment(page.html).querySelector('#results'),null);
    assert.match(page.html,/Election information temporarily unavailable/);
  }
});

test('conditional app requests re-evaluate the clock even when the asset is unchanged',async()=>{
  const d={...data,current_results:null},environment=env(d);
  const before=await appVicElection(request(),environment,new Date('2026-11-28T17:59:59+11:00'));
  assert.equal(before.headers.get('cache-control'),VIC_ELECTION_CACHE);
  const after=await appVicElection(request('',{'if-none-match':before.headers.get('etag')}),environment,new Date('2026-11-28T18:00:00+11:00'));
  assert.equal(after.status,200);assert.equal((await after.json()).state,'polls_closed');
  assert.notEqual(after.headers.get('etag'),before.headers.get('etag'));
});

test('results dry run: all 88 held 2022 results pass the actual optional build, SSR and app path offline',async()=>{
  await withVicElectionBuild(async({root,configRoot,configPath})=>{
    const config=JSON.parse(await readFile(configPath,'utf8'));
    // Rehearse under the true source year. Never relabel historical results as 2026.
    await writeFile(configPath,JSON.stringify({...config,election_day:'2022-11-26'}));
    await writeFile(join(configRoot,'vic-results-2026.json'),JSON.stringify({...held,election_day:'2022-11-26',status:'final'}));
    await buildVicElection(root,configPath);
    const d=JSON.parse(await readFile(join(root,VIC_ELECTION_ASSET),'utf8'));
    assert.equal(d.current_results.districts.length,88);
    assert.deepEqual(Object.fromEntries(d.current_results.districts.map(r=>[r.name,r.result.party])),Object.fromEntries(names.map(name=>[name,held.districts[name].general.party])));
    const now=new Date('2026-12-15T10:00:00+11:00'),overview=await api(d,now);
    assert.equal(overview.state,'results_final');assert.equal(overview.current_results.election_day,'2022-11-26');
    const counts={};for(const row of overview.current_results.districts)counts[row.result.party]=(counts[row.result.party]??0)+1;
    assert.deepEqual(counts,{Labor:56,Liberal:19,Nationals:9,Greens:4});
    for(const seat of [null,...d.seats]) {
      const doc=JSDOM.fragment(renderVicElection(d,seat,{},now).html);
      assert.equal(doc.querySelectorAll('#results li').length,seat?.kind==='district'?1:seat?.kind==='region'?11:88);
      assert.doesNotMatch(doc.textContent,/upcoming|will be held|early voting is open/i);
    }
    const narracan=overview.current_results.districts.find(r=>r.name==='Narracan').result;
    assert.equal(narracan.kind,'supplementary');assert.equal(narracan.date,'2023-01-28');
    assert.equal(overview.current_results.districts.find(r=>r.name==='Bendigo East').result.margin,10.91);
  });
});

test('missing results omit the section; wrong-year, empty and incomplete final drops cannot replace usable assets',async()=>{
  await withVicElectionBuild(async({root,configRoot,configPath})=>{
    await buildVicElection(root,configPath);
    const hubPath=join(root,VIC_ELECTION_ASSET),placePath=join(root,VIC_ELECTION_PLACES);
    const original=await readFile(hubPath,'utf8'),originalPlaces=await readFile(placePath,'utf8');
    assert.equal(JSON.parse(original).current_results,null);
    const partial=fixture(),bad=[held,{},null,{...partial,districts:{}},{...partial,status:'final'},
      {...partial,districts:{Nowhere:partial.districts[names[0]]}},
      {...partial,districts:{[names[0]]:{general:{...partial.districts[names[0]].general,margin:99}}}},
      {...partial,districts:{[names[0]]:{general:{...partial.districts[names[0]].general,url:held.districts[names[0]].general.url}}}},
    ];
    for(const value of bad) {
      await writeFile(join(configRoot,'vic-results-2026.json'),JSON.stringify(value));
      await assert.rejects(buildVicElection(root,configPath));
      assert.equal(await readFile(hubPath,'utf8'),original);
      assert.equal(await readFile(placePath,'utf8'),originalPlaces);
    }
    await writeFile(join(configRoot,'vic-results-2026.json'),JSON.stringify(partial));
    await buildVicElection(root,configPath);
    const built=JSON.parse(await readFile(hubPath,'utf8'));
    assert.equal(built.current_results.status,'partial');assert.equal(built.current_results.districts.length,2);
    built.current_results.districts=[];
    const failed=await appVicElection(request(),env(built),new Date('2026-12-15T00:00:00Z'));
    assert.equal(failed.status,503);
  });
});
