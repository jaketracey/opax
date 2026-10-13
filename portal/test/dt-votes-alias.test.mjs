import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderPersonAnswer} from '../src/seo-content.ts';
import {personVoteKeys,voteTableConfig} from '../public/vote-tables.js';
import {aliasVotingProfiles} from './dt-votes-aliases.mjs';

const read=path=>readFile(new URL('../public'+path,import.meta.url),'utf8').then(JSON.parse);
const [roster,votes]=await Promise.all([read('/parliamentarians.json'),read('/votes.json')]);
const profiles=aliasVotingProfiles(roster,votes);
assert.equal(profiles.length,2,'both affected alias profiles must be covered');
for (const [number,{person,keys,rows,primaryRows}] of profiles.entries()) {
  test(`alias profile ${number+1} scopes SSR, hydration and export to all source IDs`,async()=>{
    assert.equal(rows.length,14,'merged record count');
    assert.equal(primaryRows.length,12,'primary record count');
    assert.deepEqual(personVoteKeys(person.name,person.pid,votes),keys);
    const rendered=await renderPersonAnswer(person,read,new Map(),undefined,undefined,{});
    const config=JSON.parse(rendered.html.match(/data-vote-config>(.*?)<\/script>/s)[1]);
    const tbody=rendered.html.match(/<tbody\b[^>]*>(.*?)<\/tbody>/s)[1];
    assert.equal((tbody.match(/<tr\b/g) || []).length,rows.length,'SSR retains every alias vote');
    const hydrated=voteTableConfig(keys);
    assert.deepEqual(config.source,hydrated.source,'SSR and hydration use the same endpoint scope');
    assert.deepEqual(JSON.parse(hydrated.source.params['f.person']),keys,'export shares the complete scope');
  });
}
