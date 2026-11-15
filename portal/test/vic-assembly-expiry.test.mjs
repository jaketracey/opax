// The Legislative Assembly expired on 3 November 2026 (Constitution Act 1975 s 38). Until the new
// parliament's roster loads, a seat's roster member is "Member for X until the Assembly expired on
// 3 November", never its holder or its current member.
process.env.TZ = 'UTC';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {VIC_ASSEMBLY_EXPIRED_AT,VIC_ELECTION_ASSET,vicAssemblyEnded,vicAssemblyExpiredPhrase} from '../public/vic-election.js';
import {profileHTML} from '../public/electorates.js';
import {personRole,personTitle,roleLine} from '../src/seo-titles.ts';

async function compile(entry) {
  const result=await build({entryPoints:[new URL(entry,import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false});
  return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const {renderVicElection,vicElectionPage,assemblyExpired,readAssemblyIndex}=await compile('../src/vic-election.ts');
const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const data=await json('../public/hubs/vic-election-2026.json');
const record=(await json('../../scripts/hubs/electorate-dissolutions.json')).dissolutions.find(r=>r.chamber==='vic_la');
const PHRASE='until the Assembly expired on 3 November';
const seat=data.seats.find(s=>s.kind==='district'&&s.name==='Richmond'),member=seat.members[0].name;
const BEFORE=new Date('2026-11-03T17:59:00+11:00'),NOW=new Date('2026-11-16T10:00:00+11:00'),AFTER=new Date('2026-11-29T10:00:00+11:00');
const index=value=>new Map(data.seats.filter(s=>s.kind==='district').map(s=>[s.name,value]));
const label=(now,idx)=>JSDOM.fragment(renderVicElection(data,seat,{},now,null,idx).html).querySelector('.vic-facts dt').textContent;

test('the expiry day is the reviewed record’s day and the Tuesday 25 days before election day',()=>{
  assert.equal(VIC_ASSEMBLY_EXPIRED_AT.slice(0,10),record.dissolved_on);
  assert.equal((Date.parse(data.election_day)-Date.parse(record.dissolved_on))/864e5,25);
  assert.equal(new Date(record.dissolved_on+'T00:00:00Z').getUTCDay(),2);
  assert.equal(vicAssemblyExpiredPhrase(),PHRASE);
});

test('a district page names the member until the Assembly expired, while the index says the house has ended',()=>{
  for(const now of [NOW,AFTER]) {
    const page=renderVicElection(data,seat,{},now,null,index(data.election_day));
    // After the polls close the label also dates the roster it is read from.
    assert.ok(label(now,index(data.election_day)).startsWith(`Member for Richmond ${PHRASE}`+(now===AFTER?', from the published roster dated ':'')));
    if(now===NOW) assert.equal(label(now,index(data.election_day)),`Member for Richmond ${PHRASE}`);
    assert.ok(page.description.startsWith(`${member} was Member for Richmond ${PHRASE}. `),page.description);
    assert.doesNotMatch(page.html+page.description,/Held by|Who holds|Member in published roster/);
  }
  assert.equal(label(BEFORE,index(data.election_day)),'Held by');
  assert.match(renderVicElection(data,seat,{},BEFORE).description,/^Who holds Richmond/);
});

test('the wording changes when the new parliament’s roster loads',()=>{
  // The export of the new roster clears dissolved_for: the index then speaks for the seat.
  assert.match(label(AFTER,index(null)),/^Member in published roster dated \d/);
  assert.equal(label(NOW,index(null)),'Held by');
  assert.equal(assemblyExpired(data,seat,AFTER,index(null)),false);
  // Without the index the page's own record decides: a roster dated before election day is the old house.
  assert.equal(label(NOW,null),`Member for Richmond ${PHRASE}`);
  assert.equal(assemblyExpired(data,{...seat,roster_date:'2026-12-20'},new Date('2026-12-21T10:00:00+11:00'),null),false);
  assert.equal(assemblyExpired(data,seat,AFTER,new Map()),true);
  // Regions are the Council: this wording is the Assembly's alone.
  assert.equal(assemblyExpired(data,data.seats.find(s=>s.kind==='region'),NOW,null),false);
});

test('the hub rows and the finder say member until the Assembly expired',()=>{
  const hub=renderVicElection(data,null,{},NOW,null,index(data.election_day)).html;
  assert.match(hub,new RegExp(`Each row shows the member ${PHRASE} and the winning margin`));
  assert.match(renderVicElection(data,null,{},BEFORE,null,index(data.election_day)).html,/Each row shows the member and the winning margin/);
  const hits=[{name:member,kind:'Member',seats:[{seat,share:null}]}];
  const found=JSDOM.fragment(renderVicElection(data,null,{},NOW,{place:member,hits},index(data.election_day)).html).querySelector('.vic-hit-place span').textContent;
  assert.equal(found,`Member ${PHRASE}`);
});

test('the page reads the electorates index, and renders without it',async()=>{
  const rows=value=>({electorates:[{name:'Richmond',chamber:'vic_la',dissolved_for:value},{name:'Richmond',chamber:'nsw_la'},{name:'Northern Metropolitan',chamber:'vic_lc'}]});
  const read=value=>async path=>path===VIC_ELECTION_ASSET?data:path==='/electorates/manifest.json'?{index_url:'/i.json'}:path==='/i.json'?rows(value):Promise.reject(new Error('missing'));
  assert.deepEqual([...await readAssemblyIndex(read(data.election_day))],[['Richmond',data.election_day]]);
  assert.deepEqual([...await readAssemblyIndex(read(null))],[['Richmond',null]]);
  assert.equal(await readAssemblyIndex(async()=>{throw new Error('missing')}),null);
  const config={VIC_ELECTION_HUB_ENABLED:'true'};
  const page=await vicElectionPage('richmond',read(data.election_day),config,null,NOW);
  assert.equal(page.status,200);assert.match(page.html,new RegExp(`<dt>Member for Richmond ${PHRASE}</dt>`));
  const bare=await vicElectionPage('richmond',async path=>path===VIC_ELECTION_ASSET?data:Promise.reject(new Error('missing')),config,null,NOW);
  assert.equal(bare.status,200);assert.match(bare.html,new RegExp(`<dt>Member for Richmond ${PHRASE}</dt>`));
});

test('an electorate profile has no current member while the Assembly is ended',async()=>{
  const manifest=await json('../public/electorates/manifest.json'),rows=(await json('../public'+manifest.index_url)).electorates;
  const row=rows.find(e=>e.chamber==='vic_la'),detail=await json('../public'+row.detail_url);
  assert.equal(vicAssemblyEnded(detail),true);
  const title=html=>JSDOM.fragment(html).querySelector('#el-held h2').textContent;
  assert.equal(title(profileHTML(detail)),`Member ${PHRASE}`);
  assert.equal(title(profileHTML({...detail,dissolved_for:null})),'Current member');
  // Only the Assembly's rows carry the record: a Council region and a federal seat are unchanged.
  assert.equal(vicAssemblyEnded({chamber:'vic_lc',dissolved_for:'2026-11-28'}),false);
  assert.equal(vicAssemblyEnded({chamber:'representatives'}),false);
});

test('a person title drops "MP" for a member of the expired Assembly',()=>{
  const p={name:'Example Member',party:'Labor',states:['vic'],last:2026,representation:[{jurisdiction:'vic',chamber:'vic_la',electorate:'Richmond',state:'VIC'}]};
  const sitting=personRole(p,2026),ended=personRole(p,2026,()=>vicAssemblyExpiredPhrase());
  assert.equal(roleLine(sitting),'Labor Member for Richmond (Vic)');assert.equal(sitting.name,'Example Member MP');
  assert.equal(ended.name,'Example Member');assert.equal(ended.former,'');
  assert.equal(roleLine(ended),`Labor Member for Richmond ${PHRASE} (Vic)`);
  assert.equal(personTitle('Example Member',ended,'Speeches'),`Example Member, Member for Richmond ${PHRASE} · OPAX`);
  // A former member stays former; a Council member is not the Assembly's to describe.
  assert.equal(roleLine(personRole({...p,last:2019},2026,()=>PHRASE)),'former Labor Member for Richmond (Vic)');
  const mlc={...p,representation:[{jurisdiction:'vic',chamber:'vic_lc',electorate:'Northern Metropolitan',state:'VIC'}]};
  assert.equal(roleLine(personRole(mlc,2026,()=>PHRASE)),'Labor MLC for Northern Metropolitan (Vic)');
});
