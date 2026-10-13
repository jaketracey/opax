import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateVotes} from '../../scripts/validate_votes.mjs';
const bytes=readFileSync(new URL('../public/votes.json',import.meta.url),'utf8');
const fixture=()=>({_meta:{schema:1},_names:{'alex example':['1']},'1':{name:'Alex Example',party:null,house:'senate',jurisdiction:'federal',ayes:2,noes:1,divisions_total:3,years:[2025,2026],for:[{name:'Example Bill',stage:'Second reading',jur:'federal',date:'2026-10-01'}],against:[]}});
test('current schema-1 votes and newline-only refreshes pass identical invariants',()=>{
  assert.deepEqual(validateVotes(JSON.parse(bytes+'\n')),validateVotes(JSON.parse(bytes)));
});
test('real schema, identity, list and tally breaks fail',()=>{
  for(const mutate of [v=>v._meta.schema=2,v=>v._names['alex example']=['missing'],v=>v['1'].name='Wrong Person',v=>v['1'].for={},v=>v['1'].for[0].date='2026-02-30',v=>v['1'].ayes=-1,v=>v['1'].divisions_total=4]) {
    const v=fixture();mutate(v);assert.throws(()=>validateVotes(v),/votes.json/);
  }
});
test('recent bill lists are examples and are never equated to lifetime vote tallies',()=>{
  assert.equal(validateVotes(fixture()).divisions,3);
});
