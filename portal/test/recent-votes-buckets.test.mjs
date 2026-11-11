import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPersonAnswer} from '../src/seo-content.ts';
import {RECENT_VOTES_BUCKETS,recentVotesBucket,recentVotesBucketPath} from '../public/recent-votes-buckets.js';

// Two roster rows for one member (a federal pid and a state key), so a profile can span two buckets.
const recent={_meta:{schema:1,source:'opax-parli-db',coverage:'recorded'},people:{}};
const votes={_names:{'example member':['nsw:example-member']}};
for(let i=0;i<40;i++){
 const key=i?'p'+i:'2', name=i?'Member '+i:'Example Member';
 votes[key]={name,jurisdiction:'federal',for:[{name:'Bill '+i,date:'2024-01-0'+(1+i%9)}],against:[]};
 recent.people[key]={name,jurisdiction:'federal',recent:[{division_slug:'division-'+i,title:'Question '+i,date:'2025-02-0'+(1+i%9),vote:'Aye'}]};
}
votes['nsw:example-member']={name:'Example Member',jurisdiction:'nsw',for:[{name:'State bill',date:'2023-05-05'}],against:[]};
recent.people['nsw:example-member']={name:'Example Member',jurisdiction:'nsw',recent:[{division_slug:'division-nsw',title:'State question',date:'2025-03-03',vote:'No'}]};
// The buckets as scripts/build_growth_modules.mjs writes them.
const buckets=Array.from({length:RECENT_VOTES_BUCKETS},()=>[]);
for(const entry of Object.entries(recent.people))buckets[recentVotesBucket(entry[0])].push(entry);
const files=Object.fromEntries(buckets.map((entries,i)=>[recentVotesBucketPath(i),{_meta:recent._meta,people:Object.fromEntries(entries)}]));

test('a profile reads its own buckets of recorded votes and renders what the whole file gives',async()=>{
 assert.notEqual(recentVotesBucket('2'),recentVotesBucket('nsw:example-member'),'the fixture spans two buckets');
 const render=async(withBuckets,person)=>{
  const reads=[];
  const read=async path=>{reads.push(path);if(path==='/votes.json')return votes;if(path==='/seo/recent-votes.json')return recent;if(withBuckets&&files[path])return files[path];throw Error('No fixture')};
  return {html:(await renderPersonAnswer(person,read,new Map(),undefined,undefined,{})).html,reads};
 };
 for(const person of [{pid:'2',name:'Example Member',states:[],chambers:['senate']},{pid:'p7',name:'Member 7',states:[],chambers:['senate']},{pid:'none',name:'Nobody',states:[],chambers:['senate']}]){
  const split=await render(true,person),whole=await render(false,person);
  assert.equal(split.html,whole.html,person.name);
  assert.ok(!split.reads.includes('/seo/recent-votes.json'),person.name);
 }
 const both=await render(true,{pid:'2',name:'Example Member',states:[],chambers:['senate']});
 assert.match(both.html,/Question 0/);assert.match(both.html,/State question/);
 assert.equal(both.reads.filter(path=>path.startsWith('/growth/recent-votes/')).length,2);
});
