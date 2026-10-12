import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorker,offline} from './worker-harness.mjs';
const restore=offline(),pending=[],logs=[],shared=new Map(),edge=new Map();
const ctx={waitUntil(p){pending.push(p)},passThroughOnException(){}};
const h=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,new URL('../public/',import.meta.url).pathname,ctx);
const asset=h.env.ASSETS;
h.env.ASSETS={async fetch(req){const path=new URL(req.url).pathname;if(path.startsWith('/graph/money'))return Response.json({nodes:[],edges:[]});if(path==='/parliamentarians.json')return Response.json({people:[]});return asset.fetch(req)}};
h.env.COMMUNITY_DB={prepare(sql){return{bind(...values){logs.push({sql,values});return{run:async()=>({success:true})}}}}};
h.env.GENERATION_CACHE={async get(k){return shared.get(k)??null},async put(k,v){shared.set(k,JSON.parse(v))}};
h.env.AGENTIC_INPUT_USD_PER_MILLION='0.66';h.env.AGENTIC_OUTPUT_USD_PER_MILLION='1.98';
globalThis.caches={default:{async match(k){return edge.get(k.url)?.clone()},async put(k,r){edge.set(k.url,new Response(await r.text(),r))}}};
let mode='ranking',models=0,normalModels=0;
globalThis.fetch=async(input,init)=>{
 const url=new URL(input);assert.ok(url.hostname.startsWith('offline.'),'no outbound service calls');const b=JSON.parse(init?.body??'{}');
 if(url.pathname.endsWith('/ask')){
  if(b.prompt?.user?.includes('Plan the record')){
   models++;
   if(mode==='overrun'){const now=Date.now;Date.now=()=>now()+41_000;setTimeout(()=>{Date.now=now},20);return Response.json({answer:'junk'})}
   if(mode==='empty')return Response.json({answer:'{"shape":"unanswerable","steps":[],"reason":"fixture"}'});
   return Response.json({answer:'{"shape":"ranking","steps":[{"tool":"count_speeches","args":{"topic":"gambling","state":"nsw","group_by":"speaker"}}]}',metadata:{tokens:{input:10,output:5}}});
  }
  if(b.prompt?.user?.includes('FACTS (numbered')){models++;return Response.json({answer:'Taylor Example: 87 [1]. Pat Example: 60 [2]. Alex Example: 52 [3].',metadata:{tokens:{input:10,output:5}}})}
  normalModels++;const reply={answer:'The retrieved speech called for parliamentary scrutiny.',retrieval_results:{resources:{}}};if(init.headers?.['x-synchronous']==='true')return Response.json(reply);return new Response([{type:'answer',text:reply.answer},{type:'status',code:'0',status:'success'}].map(item=>JSON.stringify({item})).join('\n')+'\n',{headers:{'content-type':'application/x-ndjson'}});
 }
 if(url.pathname.endsWith('/catalog'))return Response.json({fulltext:{total:300,facets:{'/u/o':mode==='empty'?{}:{'/u/o/Taylor Example':87,'/u/o/Pat Example':60,'/u/o/Alex Example':52}}},resources:{}});
 if(url.pathname.endsWith('/search')){
  const text=JSON.stringify(b);return Response.json({fulltext:{total:mode==='empty'?0:text.includes('Pat Example')?60:text.includes('Alex Example')?52:87},resources:{}});
 }
 if(url.pathname.endsWith('/find'))return Response.json({resources:{}});
 throw Error('unexpected fixture route');
};
const post=(q,stream=false,extra={})=>h.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json',...(stream?{accept:'text/event-stream'}:{})},body:JSON.stringify({question:q,kind:'speech',...extra})});
const flush=async()=>{while(pending.length)await Promise.all(pending.splice(0))};
const question='Who is making the most speeches about gambling reform';
const frames=text=>text.trim().split('\n\n').map(f=>{const lines=f.split('\n');return{event:lines.find(s=>s.startsWith('event: '))?.slice(7),data:JSON.parse(lines.find(s=>s.startsWith('data: '))?.slice(6)??'{}')}});

test('off and classifier misses keep normal Ask; no steps and no done.agentic',async()=>{
 for(const flag of [undefined,'off','junk','route']){
  h.env.AGENTIC_ASK_MODE=flag;const q=flag==='route'?'What happened about housing?':question;
  const r=await post(q,true);const f=frames(await r.text());assert.ok(!f.some(x=>x.data.phase==='step'));assert.ok(!f.find(x=>x.event==='done')?.data.agentic);
 }
 assert.equal(models,0);await flush();
});
test('route mode streams real steps and a normal cited done payload, caches it in KV, and logs no text',async()=>{
 h.env.AGENTIC_ASK_MODE='route';const r=await post(question,true);assert.equal(r.status,200);const f=frames(await r.text()),done=f.find(x=>x.event==='done').data;
 assert.equal(done.answered,true);assert.match(done.answer,/current parliament since July 2025/);assert.ok(done.citations);assert.ok(done.sources.some(s=>s.href.includes('/search?')));
 assert.ok(f.some(x=>x.data.phase==='step'&&x.data.step.state==='running'));assert.ok(f.some(x=>x.data.phase==='step'&&x.data.step.state==='done'));
 assert.ok(!f.some(x=>['planning','plan'].includes(x.data.phase)));assert.equal(done.facts,undefined);assert.equal(done.tokens,undefined);
 assert.equal(done.agentic.steps[0].label,'Counting by speaker');await flush();assert.ok(shared.size);assert.equal(logs.at(-1).values.length,4);assert.doesNotMatch(JSON.stringify(logs),/gambling|Example|question text|answer/);
 const before=models;edge.clear();const hit=await post(question,true);const cached=frames(await hit.text());assert.ok(cached.some(x=>x.data.phase==='cached'));assert.equal(models,before);assert.deepEqual(cached.find(x=>x.event==='done').data,done);await flush();
});
test('shadow returns the normal answer and starts a monitored run with waitUntil',async()=>{
 h.env.AGENTIC_ASK_MODE='shadow';const before=normalModels;const r=await post(question);const body=await r.json();assert.equal(body.agentic,undefined);assert.ok(normalModels>before);await flush();assert.ok(logs.length>=2);
});
test('answered false and exhausted budgets fall back to normal Ask and cannot cache the failure',async()=>{
 h.env.AGENTIC_ASK_MODE='route';shared.clear();edge.clear();mode='empty';const before=normalModels;const r=await post(question);assert.equal((await r.json()).agentic,undefined);assert.ok(normalModels>before);await flush();assert.ok(![...shared.keys()].some(k=>k.includes('ask-agentic')));
 mode='overrun';const normalBefore=normalModels;const over=await post(question);assert.equal((await over.json()).agentic,undefined);assert.ok(normalModels>normalBefore);await new Promise(r=>setTimeout(r,25));mode='ranking';await flush();
});
test('the gold operator route fails closed without bearer or enabled mode, including staging',async()=>{
 h.env.STAGING_API={fetch(){throw Error('ops route must not proxy to production')}};
 const call=headers=>h.fetch('/api/ops/ask-gold',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({question})});
 assert.equal((await call({})).status,401);h.env.DAILY_POST_OPERATOR_SECRET='fixture-secret';crypto.subtle.timingSafeEqual=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);assert.equal((await call({authorization:'Bearer wrong'})).status,401);
 // Node implements the digest, but the Cloudflare timing-safe comparison is a runtime extension.
 crypto.subtle.timingSafeEqual=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
 h.env.AGENTIC_ASK_MODE='off';assert.equal((await call({authorization:'Bearer fixture-secret'})).status,409);
 h.env.AGENTIC_ASK_MODE='shadow';const valid=await call({authorization:'Bearer fixture-secret'});assert.equal(valid.status,200);assert.ok((await valid.json()).agentic);await flush();delete h.env.STAGING_API;
});
test.after(()=>restore());
