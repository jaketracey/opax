import './helpers/vic-election-clock.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
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
