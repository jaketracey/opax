import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorker,offline} from './worker-harness.mjs';

test('P1 deadline: JSON and SSE fallback share the single 40s deadline and abort their fetch',async()=>{
 const restore=offline(),pending=[],ctx={waitUntil(p){pending.push(p)},passThroughOnException(){}};
 const h=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,new URL('../public',import.meta.url).pathname,ctx);
 const assets=h.env.ASSETS;h.env.ASSETS={fetch(req){const path=new URL(req.url).pathname;if(path==='/parliamentarians.json')return Response.json({people:[]});if(path==='/bills/index.json')return Response.json({bills:[]});if(path.startsWith('/graph/money'))return Response.json({nodes:[],edges:[]});return assets.fetch(req)}};
 h.env.AGENTIC_ASK_MODE='route';h.env.COMMUNITY_DB={prepare(){return{bind(){return{run:async()=>({success:true})}}}}};
 const realNow=Date.now,realTimeout=globalThis.setTimeout,realClear=globalThis.clearTimeout;
 const started=realNow();let now=started,nextId=0;const timers=new Map();
 Date.now=()=>now;
 globalThis.setTimeout=(fn,ms,...args)=>{const id=++nextId;timers.set(id,{at:now+Number(ms),fn:()=>fn(...args)});return id};
 globalThis.clearTimeout=id=>{if(typeof id==='number')timers.delete(id);else realClear(id)};
 // Advance only after the real request has reached a known stalled fetch.
 // CPU load cannot turn a few scheduler milliseconds into simulated seconds.
 const advance=async ms=>{
  const end=now+ms;
  while(true){
   const due=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
   if(!due)break;now=due[1].at;timers.delete(due[0]);due[1].fn();await Promise.resolve();
  }
  now=end;
 };
 let toolReady,normalReady,toolCount=0,normal=0,cleaning=false;
 const toolsStarted=new Promise(resolve=>{toolReady=resolve}),fallbacksStarted=new Promise(resolve=>{normalReady=resolve});
 const signals=[],abortFetches=[];
 const stalled=signal=>new Promise((_,reject)=>{abortFetches.push(()=>reject(new DOMException('Fixture cleanup','AbortError')));signal.addEventListener('abort',()=>reject(signal.reason),{once:true})});
 let watchdog;const stuck=new Promise((_,reject)=>{watchdog=realTimeout(()=>reject(Error('request did not reach the fixture barrier or deadline')),10_000)});
 globalThis.fetch=async(input,init)=>{
  if(cleaning)throw new DOMException('Fixture cleanup','AbortError');
  const u=new URL(input);assert.ok(u.hostname.startsWith('offline.'));const b=JSON.parse(init?.body??'{}');
  if(u.pathname.endsWith('/ask')){
   if(b.prompt?.user?.includes('Plan the record'))return Response.json({answer:'{"shape":"ranking","steps":[{"tool":"count_speeches","args":{"topic":"gambling","state":"nsw","group_by":"speaker"}}]}'});
   normal++;signals.push(init.signal);if(normal===2)normalReady();return stalled(init.signal);
  }
  if(u.pathname.endsWith('/catalog')){if(++toolCount===2)toolReady();return stalled(init.signal)};
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
  const completed=Promise.all(requests);
  await Promise.race([toolsStarted,stuck]);
  await advance(12_000); // Both bounded tool calls time out.
  await Promise.race([fallbacksStarted,stuck]);
  assert.equal(now-started,12_000);
  assert.ok(signals.every(s=>!s.aborted),'fallback starts with time remaining');
  await advance(28_000); // The original request deadline, not 40 more seconds.
  assert.ok(signals.every(s=>s.aborted),'the actual fallback fetch must be cancelled at the original deadline');
  const result=await Promise.race([completed,stuck]);
  assert.equal(result[0].status,504);assert.match(result[1].text,/event: error/);
  assert.ok(result.every(r=>r.elapsed===40_000),JSON.stringify(result));assert.ok(normal>=2,'both formats must reach normal fallback');
  assert.ok(signals.every(s=>s.aborted),'the actual fallback fetch must be cancelled');
 }finally{
  cleaning=true;parents.forEach(p=>p.abort());abortFetches.forEach(stop=>stop());Date.now=realNow;globalThis.setTimeout=realTimeout;globalThis.clearTimeout=realClear;realClear(watchdog);timers.clear();
  while(pending.length)await Promise.allSettled(pending.splice(0));restore();
 }
});
