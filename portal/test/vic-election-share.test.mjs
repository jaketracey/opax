import './helpers/vic-election-clock.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {VIC_ELECTION_ASSET} from '../public/vic-election.js';
import {offline,loadWorker} from './worker-harness.mjs';

for(const path of ['/vic-election-2026','/vic-election-2026/albert-park','/vic-election-2026/southern-metropolitan']) {
  test('election share URL and cache key change at close, including old image links: '+path,async t=>{
    t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-28T06:59:59Z')});
    const savedCaches=globalThis.caches,restore=offline();
    t.after(()=>{restore();globalThis.caches=savedCaches;});
    const stored=new Map(),keys=[],pending=[];
    globalThis.caches={default:{
      async match(req){keys.push(req.url);return stored.get(req.url)?.clone();},
      async put(req,res){stored.set(req.url,res.clone());},
    }};
    const worker=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,
      new URL('../public/',import.meta.url).pathname,{waitUntil(p){pending.push(p);}});
    worker.env.VIC_ELECTION_HUB_ENABLED='true';
    const image=async()=>{
      const response=await worker.fetch(path);assert.equal(response.status,200);
      const doc=new JSDOM(await response.text()).window.document;
      assert.equal(doc.querySelector('link[rel="canonical"]').href,'https://opax.com.au'+path);
      return doc.querySelector('meta[property="og:image"]').content;
    };
    const before=await image();
    assert.equal(new URL(before).searchParams.get('state'),'election_day');
    const oldLinks=[];
    for(const suffix of ['.png','.jpg?format=portrait']) {
      const link=before.replace(/\.png\?.*/,suffix)+(suffix.includes('?')?'&':'?')+'state=election_day';
      const response=await worker.fetch(link.replace('https://opax.com.au',''));
      assert.equal(response.status,200);assert.equal(response.headers.get('x-opax-cache'),'MISS');
      assert.match((await response.json()).lines.join(' '),/Voting is open until 6 pm AEDT/);
      oldLinks.push({link,key:keys.at(-1)});
    }
    await Promise.all(pending.splice(0));
    t.mock.timers.setTime(Date.parse('2026-11-28T07:00:00Z'));
    const after=await image();
    assert.equal(new URL(after).searchParams.get('state'),'polls_closed');assert.notEqual(after,before);
    for(const {link,key} of oldLinks) {
      // The old query must not replay or reselect the election-day cache entry.
      const response=await worker.fetch(link.replace('https://opax.com.au',''));
      assert.equal(response.status,200);assert.equal(response.headers.get('x-opax-cache'),'MISS');
      const closedKey=keys.at(-1);
      assert.notEqual(closedKey,key);assert.match(key,/state=election_day/);assert.match(closedKey,/state=polls_closed/);
      const card=await response.json();assert.match(card.lines.join(' '),/Voting closed at 6 pm AEDT/);
      assert.doesNotMatch(JSON.stringify(card),/Voting is open/);
      await Promise.all(pending.splice(0));
      const cached=await worker.fetch(link.replace('https://opax.com.au','')+'&state=forged');
      assert.equal(cached.headers.get('x-opax-cache'),'HIT');assert.equal(keys.at(-1),closedKey);
      assert.doesNotMatch(await cached.text(),/Voting is open/);
    }
  });
}

test('same-day partial result files give election share cards different cache keys',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-29T00:00:00Z')});
  const savedCaches=globalThis.caches,restore=offline();
  t.after(()=>{restore();globalThis.caches=savedCaches;});
  const stored=new Map(),keys=[],pending=[];
  globalThis.caches={default:{
    async match(req){keys.push(req.url);return stored.get(req.url)?.clone();},
    async put(req,res){stored.set(req.url,res.clone());},
  }};
  const worker=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,
    new URL('../public/',import.meta.url).pathname,{waitUntil(p){pending.push(p);}});
  worker.env.VIC_ELECTION_HUB_ENABLED='true';
  const data=JSON.parse(await readFile(new URL('../public/hubs/vic-election-2026.json',import.meta.url),'utf8'));
  const districts=data.seats.filter(s=>s.kind==='district').slice(0,2);
  // Invented 2026 fixtures use held shares. Both files have the same fetched date.
  const results=count=>({election_day:data.election_day,fetched:'2026-11-29',status:'partial',
    url:'https://www.vec.vic.gov.au/results/state-election-results/2026-state-election-results',
    districts:districts.slice(0,count).map(s=>({name:s.name,result:{...s.result.general,date:data.election_day,kind:'general',
      url:'https://www.vec.vic.gov.au/results/state-election-results/2026-state-election-results/results-by-district/'+s.path.split('/').at(-1)+'-district-results'}}))});
  const assets=worker.env.ASSETS;
  let file;
  worker.env.ASSETS={fetch:req=>new URL(req.url).pathname===VIC_ELECTION_ASSET
    ? Promise.resolve(new Response(file,{headers:{'content-type':'application/json'}})) : assets.fetch(req)};
  const paths=['/vic-election-2026',districts[1].path,'/vic-election-2026/southern-metropolitan'];
  const previous=new Map();
  for(const count of [1,2]) {
    file=JSON.stringify({...data,current_results:results(count)});
    for(const path of paths)for(const suffix of ['.png','.jpg?format=portrait']) {
      const link='/og'+path+suffix;
      const response=await worker.fetch(link);
      assert.equal(response.status,200);assert.equal(response.headers.get('x-opax-cache'),'MISS');
      const key=keys.at(-1),card=await response.json();
      assert.match(key,/state=results&results=[a-f0-9]{64}$/);
      if(count===1) previous.set(link,key);
      else assert.notEqual(key,previous.get(link),'a later result file must bypass the old card');
      if(path===districts[1].path) assert.match(card.lines.join(' '),count===1
        ? /No result for this district has been published here yet/ : /Published lower house district results are available/);
      await Promise.all(pending.splice(0));
      const cached=await worker.fetch(link);
      assert.equal(cached.headers.get('x-opax-cache'),'HIT');assert.equal(keys.at(-1),key);
    }
  }
});
