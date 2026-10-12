import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorker,offline} from './worker-harness.mjs';

test('P1 deadline: JSON and SSE fallback share the single 40s deadline and abort their fetch',async()=>{
 const restore=offline(),pending=[],ctx={waitUntil(p){pending.push(p)},passThroughOnException(){}};
 const h=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,new URL('../public',import.meta.url).pathname,ctx);
 const assets=h.env.ASSETS;h.env.ASSETS={fetch(req){if(new URL(req.url).pathname==='/parliamentarians.json')return Response.json({people:[]});return assets.fetch(req)}};
 h.env.AGENTIC_ASK_MODE='route';h.env.COMMUNITY_DB={prepare(){return{bind(){return{run:async()=>({success:true})}}}}};
 const realNow=Date.now,realTimeout=globalThis.setTimeout;
 const start=realNow(),scale=40; // 40 seconds of budget pass in one real second.
 Date.now=()=>start+(realNow()-start)*scale;
 globalThis.setTimeout=(fn,ms,...args)=>realTimeout(fn,ms/scale,...args);
 const signals=[],abortFetches=[];let normal=0,cleaning=false;
 const stalled=signal=>new Promise((_,reject)=>{abortFetches.push(()=>reject(new DOMException('Fixture cleanup','AbortError')));signal.addEventListener('abort',()=>reject(signal.reason),{once:true})});
 globalThis.fetch=async(input,init)=>{
  if(cleaning)throw new DOMException('Fixture cleanup','AbortError');
  const u=new URL(input);assert.ok(u.hostname.startsWith('offline.'));const b=JSON.parse(init?.body??'{}');
  if(u.pathname.endsWith('/ask')){
   if(b.prompt?.user?.includes('Plan the record'))return Response.json({answer:'{"shape":"ranking","steps":[{"tool":"count_speeches","args":{"topic":"gambling","state":"nsw","group_by":"speaker"}}]}'});
   normal++;signals.push(init.signal);return stalled(init.signal);
  }
  if(u.pathname.endsWith('/catalog'))return stalled(init.signal);
  if(u.pathname.endsWith('/find'))return Response.json({resources:{}});
  if(u.pathname.endsWith('/search'))return Response.json({fulltext:{total:0},resources:{}});
  throw Error('unexpected fixture path');
 };
 const parents=[new AbortController(),new AbortController()];
 try{
  const requests=parents.map(async(p,i)=>{
   const began=Date.now();const r=await h.fetch('/api/ask'+(i?'?stream=1':''),{method:'POST',signal:p.signal,headers:{'content-type':'application/json'},body:JSON.stringify({question:'Who is making the most speeches about gambling reform',kind:'speech'})});
   const text=await r.text();return{status:r.status,text,elapsed:Date.now()-began};
  });
  const result=await Promise.race([Promise.all(requests),new Promise((_,reject)=>realTimeout(()=>reject(Error('request exceeded single deadline')),1500))]);
  assert.equal(result[0].status,504);assert.match(result[1].text,/event: error/);
  assert.ok(result.every(r=>r.elapsed<42_000),JSON.stringify(result));assert.ok(normal>=2,'both formats must reach normal fallback');
  assert.ok(signals.every(s=>s.aborted),'the actual fallback fetch must be cancelled');
 }finally{
  cleaning=true;parents.forEach(p=>p.abort());abortFetches.forEach(stop=>stop());Date.now=realNow;globalThis.setTimeout=realTimeout;
  while(pending.length)await Promise.allSettled(pending.splice(0));restore();
 }
});
