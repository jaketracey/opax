import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPersonAnswer} from '../src/seo-content.ts';
import {RECENT_VOTES_BUCKETS,recentVotesBucket,recentVotesBucketPath,votesBucketPath,VOTES_NAMES_PATH} from '../public/recent-votes-buckets.js';

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
const voteBuckets=Array.from({length:RECENT_VOTES_BUCKETS},()=>[]);
for(const entry of Object.entries(votes))if(!entry[0].startsWith('_'))voteBuckets[recentVotesBucket(entry[0])].push(entry);
const voteFiles={[VOTES_NAMES_PATH]:{_names:votes._names},...Object.fromEntries(voteBuckets.map((entries,i)=>[votesBucketPath(i),{people:Object.fromEntries(entries)}]))};

test('a profile reads its own buckets of votes and recorded votes and renders what the whole files give',async()=>{
 assert.notEqual(recentVotesBucket('2'),recentVotesBucket('nsw:example-member'),'the fixture spans two buckets');
 const render=async(withBuckets,person)=>{
  const reads=[];
  const read=async path=>{reads.push(path);if(path==='/votes.json')return votes;if(path==='/seo/recent-votes.json')return recent;if(withBuckets&&(files[path]||voteFiles[path]))return files[path]||voteFiles[path];throw Error('No fixture')};
  return {html:(await renderPersonAnswer(person,read,new Map(),undefined,undefined,{})).html,reads};
 };
 for(const person of [{pid:'2',name:'Example Member',states:[],chambers:['senate']},{pid:'p7',name:'Member 7',states:[],chambers:['senate']},{pid:'none',name:'Nobody',states:[],chambers:['senate']}]){
  const split=await render(true,person),whole=await render(false,person);
  assert.equal(split.html,whole.html,person.name);
  assert.ok(!split.reads.includes('/seo/recent-votes.json') && !split.reads.includes('/votes.json'),person.name);
 }
 const both=await render(true,{pid:'2',name:'Example Member',states:[],chambers:['senate']});
 assert.match(both.html,/Question 0/);assert.match(both.html,/State question/);
 assert.equal(both.reads.filter(path=>path.startsWith('/growth/recent-votes/')).length,2);
 assert.equal(both.reads.filter(path=>/^\/growth\/votes\/\d+\.json$/.test(path)).length,2);
});

test('a browser profile reads the same votes and recorded votes from its buckets as from the whole files', async () => {
 const {votesSlice,recentVotesSlice,bucketLayout}=await import('../public/recent-votes-buckets.js');
 const {personVoteKeys,personVoteRecords}=await import('../public/vote-tables.js');
 const meta={content_changed_at:'2026-11-10T16:43:32Z',latest_division_date:'2026-11-10',schema:1};
 const whole={...votes,_meta:meta};
 // The buckets as the release build writes them (scripts/build_growth_modules.mjs).
 const voteSplit=Array.from({length:RECENT_VOTES_BUCKETS},()=>[]);
 for(const entry of Object.entries(whole))if(!entry[0].startsWith('_'))voteSplit[recentVotesBucket(entry[0])].push(entry);
 const recentSplit=Array.from({length:RECENT_VOTES_BUCKETS},()=>[]);
 for(const entry of Object.entries(recent.people))recentSplit[recentVotesBucket(entry[0])].push(entry);
 const built={[VOTES_NAMES_PATH]:{_names:whole._names,_meta:meta},
  ...Object.fromEntries(voteSplit.map((entries,i)=>[votesBucketPath(i),{...bucketLayout(i),people:Object.fromEntries(entries)}])),
  ...Object.fromEntries(recentSplit.map((entries,i)=>[recentVotesBucketPath(i),{_meta:recent._meta,...bucketLayout(i),people:Object.fromEntries(entries)}]))};
 const reader=files=>{const reads=[];return {reads,read:async path=>{reads.push(path);return files[path] ?? null}}};
 for(const [name,pid] of [['Example Member','2'],['Member 7','p7'],['Nobody','none'],['Example Member',null]]){
  const {read,reads}=reader(built);
  const slice=await votesSlice(read,names=>personVoteKeys(name,pid,names));
  const keys=personVoteKeys(name,pid,slice);
  assert.deepEqual(keys,personVoteKeys(name,pid,whole),name);
  assert.deepEqual(keys.map(k=>slice[k]),keys.map(k=>whole[k]),name);
  assert.deepEqual(slice._meta,meta);
  const recentPart=keys.length?await recentVotesSlice(read,keys):null;
  assert.deepEqual(personVoteRecords(keys,slice,recentPart),personVoteRecords(keys,whole,recent),name);
  assert.ok(reads.every(path=>path.startsWith('/growth/')),'never the whole files');
 }
 // Anything unreadable, or split another way, leaves the caller to read the whole files.
 const keysFor=names=>personVoteKeys('Example Member','2',names);
 assert.equal(await votesSlice(reader({...built,[VOTES_NAMES_PATH]:{_names:whole._names}}).read,keysFor),null,'no _meta');
 assert.equal(await votesSlice(reader({...built,[votesBucketPath(recentVotesBucket('2'))]:null}).read,keysFor),null,'a missing bucket');
 const other={...built[votesBucketPath(recentVotesBucket('2'))],_of:RECENT_VOTES_BUCKETS*2};
 assert.equal(await votesSlice(reader({...built,[votesBucketPath(recentVotesBucket('2'))]:other}).read,keysFor),null,'another layout');
 const moved={...built[recentVotesBucketPath(recentVotesBucket('2'))],_bucket:recentVotesBucket('2')+1};
 assert.equal(await recentVotesSlice(reader({...built,[recentVotesBucketPath(recentVotesBucket('2'))]:moved}).read,['2']),null,'another bucket');
 assert.equal(await recentVotesSlice(reader(built).read,[]),null);
});
