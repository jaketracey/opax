import './helpers/vic-election-clock.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {buildVicElection} from '../../scripts/build_vic_election.mjs';
import {validateVicElection, validateVicPlaces} from '../src/vic-election-data.ts';
import {VIC_ELECTION_ASSET, VIC_ELECTION_PLACES} from '../public/vic-election.js';
import {withVicElectionBuild} from './helpers/vic-election-build.mjs';

test('the offline build and reader share validation, rejecting bad notices or candidates before writing assets',async()=>{
  await withVicElectionBuild(async({root,configRoot,configPath})=>{
    const config=JSON.parse(await readFile(configPath,'utf8'));
    const candidates={published:'2026-11-10',url:config.sources.election,
      districts:{[config.districts[0].name]:[{name:'Avery Quill',party:'Independent'}]}};
    const candidatePath=join(configRoot,'vic-candidates-2026.json');
    const notice={text:'Check the VEC election page for published updates.',link:{label:'VEC election page',url:config.sources.election}};
    await writeFile(configPath,JSON.stringify({...config,notice}));
    await writeFile(candidatePath,JSON.stringify(candidates));
    await buildVicElection(root,configPath);
    const hubPath=join(root,VIC_ELECTION_ASSET),placesPath=join(root,VIC_ELECTION_PLACES);
    const goodHub=await readFile(hubPath,'utf8'),goodPlaces=await readFile(placesPath,'utf8');
    const hub=JSON.parse(goodHub),places=JSON.parse(goodPlaces);
    assert.equal(validateVicElection(hub),hub);assert.equal(validateVicPlaces(places,hub),places);
    assert.deepEqual(hub.notice,notice);assert.deepEqual(hub.seats[0].candidates.list,candidates.districts[config.districts[0].name]);
    const badInputs=[
      {notice:{...notice,text:'x'.repeat(201)}},
      {notice:{...notice,link:{label:'Update',url:'http://example.com'}}},
      {notice:{...notice,text:'<b>Update</b>'}},
      {candidates:{...candidates,published:'2026-11-10T12:00:00+11:00'}},
      {candidates:{...candidates,published:'2026-02-30'}},
      {candidates:{...candidates,published:'not-a-date'}},
      ...['', 'AA', 'a', 1].map(group=>({candidates:{...candidates,
        regions:{[config.regions[0].name]:[{name:'Rowan Ketch',party:'',group,group_name:''}]}}})),
      {candidates:{...candidates,regions:{[config.regions[0].name]:[
        {name:'Rowan Ketch',party:'',group:'A',group_name:1},
      ]}}},
    ];
    for(const bad of badInputs) {
      await writeFile(configPath,JSON.stringify({...config,notice:bad.notice??notice}));
      await writeFile(candidatePath,JSON.stringify(bad.candidates??candidates));
      await assert.rejects(buildVicElection(root,configPath),/Invalid election asset/);
      assert.equal(await readFile(hubPath,'utf8'),goodHub,'a bad build must not replace the usable hub');
      assert.equal(await readFile(placesPath,'utf8'),goodPlaces,'a bad build must not replace the usable places');
    }
  });
});

test('the hub keeps the outgoing roster when a post-election electorates release is published',async()=>{
  await withVicElectionBuild(async({root,configPath})=>{
    await buildVicElection(root,configPath);
    const hubPath=join(root,VIC_ELECTION_ASSET);
    const outgoing=JSON.parse(await readFile(hubPath,'utf8'));
    const manifestPath=join(root,'electorates/manifest.json');
    const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
    const index=JSON.parse(await readFile(join(root,manifest.index_url.replace(/^\//,'')),'utf8'));
    // After the declaration: other people in every Victorian seat, dissolved_for written as null on the
    // districts (as the real export does), and one region still part-declared, which the strict roster
    // checks would refuse.
    let partial=false;
    const declared={...index,electorates:index.electorates.map(e=>{
      if(e.jurisdiction!=='vic'||!['vic_la','vic_lc'].includes(e.chamber))return e;
      const rest='dissolved_for' in e?{...e,dissolved_for:null}:e;
      const people=e.representatives.map((r,i)=>({...r,person:{...r.person,name:`Declared Member ${e.slug} ${i}`,person_id:`person_declared_${i}`}}));
      if(e.chamber==='vic_lc'&&!partial){partial=true;return {...rest,representation_as_of:'2026-12-20',representatives:people.slice(0,2)};}
      return {...rest,representation_as_of:'2026-12-20',representatives:people};
    })};
    assert.ok(partial);
    const next='/electorates/releases/ffffffffffffffff/index.json';
    await mkdir(join(root,'electorates/releases/ffffffffffffffff'),{recursive:true});
    await writeFile(join(root,next.slice(1)),JSON.stringify(declared));
    await writeFile(manifestPath,JSON.stringify({...manifest,index_url:next}));
    await buildVicElection(root,configPath);
    const built=await readFile(hubPath,'utf8'),after=JSON.parse(built);
    const people=d=>d.seats.map(s=>[s.name,s.roster_date,s.members.map(m=>m.name),s.vacancy?.last.name??null]);
    assert.deepEqual(people(after),people(outgoing));
    assert.equal(after.seats.flatMap(s=>s.members).some(m=>/^Declared Member/.test(m.name)),false);
    // The pin must name the release taken when the Assembly expired, and it cannot be dropped.
    const config=JSON.parse(await readFile(configPath,'utf8'));
    await writeFile(configPath,JSON.stringify({...config,roster_release:'ffffffffffffffff'}));
    await assert.rejects(buildVicElection(root,configPath),/not the outgoing roster/);
    const {roster_release,...unpinned}=config;
    assert.equal(roster_release,'aaa8abc8073f1b6e');
    await writeFile(configPath,JSON.stringify(unpinned));
    await assert.rejects(buildVicElection(root,configPath),/pinned roster release/);
    assert.equal(await readFile(hubPath,'utf8'),built,'a refused build must not replace the usable hub');
  });
});
