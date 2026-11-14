import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderPersonAnswer} from '../src/seo-content.ts';
import {partyMoneyBucketFiles} from '../../scripts/build_growth_modules.mjs';

const graphs=['/graph/money-receipts.json','/graph/money.qld.json','/graph/money.vic.json'];
const published=Object.fromEntries(graphs.map(path=>[path,JSON.parse(readFileSync(new URL('../public'+path,import.meta.url),'utf8'))]));
// JSON round trip: the Worker reads the buckets as the build wrote them.
const buckets=Object.fromEntries(graphs.flatMap(path=>partyMoneyBucketFiles(path,published[path]).map(([file,data])=>[file,JSON.parse(JSON.stringify(data))])));
const partyOf=path=>published[path].nodes.find(n=>n.kind==='party').label;

test('a profile reads its party\'s receipt rows from the buckets and renders what the graphs give',async()=>{
 const parties=[...new Set([partyOf('/graph/money-receipts.json'),partyOf('/graph/money.qld.json'),partyOf('/graph/money.vic.json'),'Greens','LNP','  one   NATION ','No Such Party'])];
 for(const party of parties){
  const person={pid:'x1',name:'Fixture Member',party,party_now:party,current:true,states:[],chambers:['senate'],speech_scope:true};
  const render=async withBuckets=>{
   const reads=[];
   const read=async path=>{reads.push(path);if(published[path])return published[path];if(withBuckets&&buckets[path])return buckets[path];throw Error('No fixture')};
   return {html:(await renderPersonAnswer(person,read,new Map(),undefined,undefined,{})).html,reads};
  };
  const split=await render(true),whole=await render(false);
  assert.equal(split.html,whole.html,party);
  assert.ok(!split.reads.some(path=>graphs.includes(path)),party);
  if(party!=='No Such Party')assert.match(split.html,/disclosed receipts/,party);
 }
});
