import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {rosterSeatParty,rosterListParty,rosterServiceParty} from '../public/roster-party.js';
import {datedAffiliationParty} from '../public/speech-attribution.js';
import {profileAffiliations} from '../public/profile-jurisdictions.js';
import {partyLine,renderPersonAnswer} from '../src/seo-content.ts';
const period={jurisdiction:'nsw',chamber:'nsw_la',electorate:'Exampleton',party:'Example Party',
  start:'2023-03-25',end:null,through:'2026-09-21',as_of:'2026-09-21',
  basis:'Wikidata P39 service with P4100 parliamentary group',source_url:'https://www.wikidata.org/wiki/Q123'};
const person={name:'Alex Example',states:['nsw'],chambers:['nsw_la'],affiliations:[period]};

test('a partial source party reaches server and app with its service dates',async()=>{
  assert.equal(rosterServiceParty(person).party,'Example Party');
  assert.equal(rosterServiceParty(person).service_end,null);
  assert.equal(partyLine(person),'Example Party (service record 2023-03-25, observed through 2026-09-21)');
  const rendered=await renderPersonAnswer(person,async()=>{throw new Error('offline');},new Map());
  assert.match(rendered.html,/Example Party \(service record 2023-03-25, observed through 2026-09-21\)/);
  assert.doesNotMatch(rendered.html,/to 2026-09-21/);
  assert.match(rendered.html,/href="https:\/\/www.wikidata.org\/wiki\/Q123"/);
  assert.equal(partyLine({...person,party:'Own Party'}),'Own Party (recorded affiliation)');
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(app,/listFallback && roster && electorateReference \? electorateReference.module.rosterServiceParty/);
  assert.match(app,/service record \$\{esc\(seatParty.service_start\)\}/);
  assert.match(app,/observed through \$\{esc\(seatParty.service_through\)\}/);
  assert.match(app,/observed through \$\{seatParty.service_through\}/);
  const helper=readFileSync(new URL('../public/roster-party.js',import.meta.url));
  const hash=createHash('sha256').update(helper).digest('hex').slice(0,10);
  const imports=readFileSync(new URL('../public/electorates.js',import.meta.url),'utf8');
  assert.ok(imports.includes(`'./roster-party.js?v=${hash}'`),'a returning browser must load the new fallback export');
  const undistricted={...person,chambers:['nsw_lc'],affiliations:[{...period,chamber:'nsw_lc',electorate:null}]};
  assert.equal(profileAffiliations(undistricted).length,1,'a chamber service record need not name a district');
  assert.equal(profileAffiliations(undistricted)[0].electorate,null);
  const council=await renderPersonAnswer(undistricted,async()=>{throw new Error('offline');},new Map());
  assert.doesNotMatch(council.html,/\bnsw_lc\b/);
});

test('an open membership renders an observation while a closed service keeps its end',async()=>{
  const open={...person,party:'Example Party',affiliations:[{...period,start:'2017-04-08',through:'2026-11-14'}]};
  const rendered=await renderPersonAnswer(open,async()=>{throw new Error('offline');},new Map());
  assert.match(rendered.html,/2017-04-08 to observed through 2026-11-14/);
  assert.doesNotMatch(rendered.html,/2017-04-08 to 2026-11-14/);
  const closed={...person,affiliations:[{...period,end:'2024-09-16'}]};
  assert.equal(partyLine(closed),'Example Party (service record 2023-03-25 to 2024-09-16)');
});

test('service party never crosses a house, a source date, or an unattributed speech',()=>{
  const speech={kind:'speech',state:'nsw',chamber:'nsw_la',date:'2024-01-01',speaker_type:'member'};
  assert.equal(datedAffiliationParty(speech,person),'Example Party');
  for(const patch of [{date:'2023-03-24'},{date:'2026-09-22'},{chamber:'nsw_lc'},{speaker_type:'witness'}])
    assert.equal(datedAffiliationParty({...speech,...patch},person),null);
  assert.equal(rosterServiceParty({...person,chambers:['nsw_lc']}),null);
  assert.equal(rosterServiceParty({...person,name:'Example'}),null);
  assert.equal(rosterServiceParty({...person,affiliations:[period,{...period,party:'Other Party'}]}),null);
});

test('the raw and rendered no-party counts cannot grow',()=>{
  const read=p=>JSON.parse(readFileSync(new URL('../public/'+p.replace(/^\//,''),import.meta.url),'utf8'));
  const roster=read('parliamentarians.json'),manifest=read('electorates/manifest.json');
  const seats=read(manifest.index_url).electorates,lists=read('data/roster-list-parties.json').observations;
  const raw=roster.people.filter(p=>!p.party&&!p.party_now);
  assert.ok(raw.length<=586);
  const unresolved=raw.filter(p=>!rosterSeatParty(p,seats)&&!rosterListParty(p,lists)&&!rosterServiceParty(p));
  assert.ok(unresolved.length<=430);
  // Main has 1,565 people; row 179 adds the distinct Dickson Smith identity.
  // Party-gap joins change fields only, so the cumulative roster has 1,566 rows.
  assert.equal(roster.people.length,1566);
});
