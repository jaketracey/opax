import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderPersonAnswer} from '../src/seo-content.ts';
import {personVoteKeys,personVoteRecords,voteTableConfig} from '../public/vote-tables.js';
import {aliasVotingProfiles} from './dt-votes-aliases.mjs';

const read=path=>readFile(new URL('../public'+path,import.meta.url),'utf8').then(JSON.parse);
const [roster,votes,recent]=await Promise.all([read('/parliamentarians.json'),read('/votes.json'),read('/seo/recent-votes.json')]);
const profiles=aliasVotingProfiles(roster,votes);
assert.equal(profiles.length,2,'both affected alias profiles must be covered');
const ssrRows=async person=>{
  const rendered=await renderPersonAnswer(person,read,new Map(),undefined,undefined,{});
  const tbody=rendered.html.match(/<tbody\b[^>]*>(.*?)<\/tbody>/s)?.[1] || '';
  return {rendered,count:(tbody.match(/<tr\b/g) || []).length};
};
for (const [number,{person,keys,rows,primaryRows}] of profiles.entries()) {
  test(`alias profile ${number+1} scopes SSR, hydration and export to all source IDs`,async()=>{
    assert.equal(rows.length,14,'merged record count');
    assert.equal(primaryRows.length,12,'primary record count');
    assert.deepEqual(personVoteKeys(person.name,person.pid,votes),keys);
    // The votes table (hydration and CSV export) is projected one source ID at a time.
    const table=keys.flatMap(key=>personVoteRecords([key],votes,recent).rows);
    const {rendered,count}=await ssrRows(person);
    assert.equal(count,Math.min(table.length,25),'SSR retains every alias vote the table serves');
    const config=JSON.parse(rendered.html.match(/data-vote-config>(.*?)<\/script>/s)[1]);
    const hydrated=voteTableConfig(keys);
    assert.deepEqual(config.source,hydrated.source,'SSR and hydration use the same endpoint scope');
    assert.deepEqual(JSON.parse(hydrated.source.params['f.person']),keys,'export shares the complete scope');
  });
}

// Recorded votes are keyed by source ID. A roster display name that differs from the export's
// spelling ("Chris" for "Christopher", a curly apostrophe) must not drop SSR back to bill votes
// while the table serves recorded ones (17 Oct: 64 published profiles diverged this way).
test('a profile whose roster spelling differs from the export renders the rows the votes table serves',async()=>{
  const fold=name=>String(name || '').normalize('NFKC').replace(/[‘’ʼ`]/g,"'").trim().toLowerCase();
  const respelled=roster.people.filter(p=>p.pid && !p.speech_scope && typeof votes[p.pid]?.name==='string' && fold(votes[p.pid].name)!==fold(p.name));
  assert.ok(respelled.length>0,'the published roster has respelled profiles');
  const diverged=[];
  for (const person of respelled) {
    const keys=personVoteKeys(person.name,person.pid,votes);
    const table=keys.flatMap(key=>personVoteRecords([key],votes,recent).rows).length;
    const {count}=await ssrRows(person);
    if (count!==Math.min(table,25)) diverged.push(`${person.pid}: ${count} rendered, ${table} in the table`);
  }
  assert.deepEqual(diverged,[]);
});

test('recorded votes are chosen per source ID and by export identity, not roster spelling',()=>{
  const fixtureVotes={a1:{name:'Alexander Example',for:[{title:'Bill A',date:'2020-01-01'}]},
    'vic:alex-example':{name:'Alex Example',against:[{title:'Bill B',date:'2021-01-01'}]}};
  const published={_meta:{schema:1,source:'opax-parli-db',coverage:'recorded'},
    people:{a1:{name:'Alexander Example',recent:[{title:'Division 1',date:'2026-10-15',vote:'aye'}]}}};
  const both=personVoteRecords(['a1','vic:alex-example'],fixtureVotes,published);
  assert.equal(both.recorded,true);
  assert.deepEqual(both.rows.map(r=>r.title),['Division 1','Bill B'],'recorded for a1, bill votes for the key without them');
  const renamed={...published,people:{a1:{...published.people.a1,name:'Someone Else'}}};
  assert.deepEqual(personVoteRecords(['a1'],fixtureVotes,renamed).rows.map(r=>r.vote),['For the bill'],'a different identity is not used');
  const unpublished={...published,_meta:{...published._meta,coverage:'unavailable'}};
  assert.equal(personVoteRecords(['a1'],fixtureVotes,unpublished).recorded,false);
});
