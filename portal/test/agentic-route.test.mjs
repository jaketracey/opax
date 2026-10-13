import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadWorker,offline} from './worker-harness.mjs';
const restore=offline(),pending=[],logs=[],shared=new Map(),edge=new Map();
const ctx={waitUntil(p){pending.push(p)},passThroughOnException(){}};
const h=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,new URL('../public/',import.meta.url).pathname,ctx);
const asset=h.env.ASSETS;
h.env.ASSETS={async fetch(req){const path=new URL(req.url).pathname;if(path.startsWith('/graph/money'))return Response.json({nodes:[],edges:[]});if(path==='/parliamentarians.json')return Response.json({people:[]});return asset.fetch(req)}};
h.env.COMMUNITY_DB={prepare(sql){return{bind(...values){logs.push({sql,values});return{run:async()=>({success:true})}}}}};
h.env.GENERATION_CACHE={async get(k){return shared.get(k)??null},async put(k,v){shared.set(k,JSON.parse(v))}};
h.env.SA_HANSARD_FULL_TEXT='true';h.env.AGENTIC_INPUT_USD_PER_MILLION='0.66';h.env.AGENTIC_OUTPUT_USD_PER_MILLION='1.98';
globalThis.caches={default:{async match(k){return edge.get(k.url)?.clone()},async put(k,r){edge.set(k.url,new Response(await r.text(),r))}}};
let mode='ranking',models=0,normalModels=0,quota=0,toolStarted=()=>{},toolSignal,toolStop=()=>{};
h.env.ASK_LIMITER={async limit(){quota++;return{success:true}}};
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
 if(mode==='abort-tools'&&url.pathname.endsWith('/catalog'))return new Promise((resolve,reject)=>{toolSignal=init.signal;toolStop=()=>reject(Error('fixture cleanup'));init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});toolStarted()});
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
 h.env.AGENTIC_ASK_MODE='route';shared.clear();edge.clear();mode='empty';const before=normalModels,quotaBefore=quota;const r=await post(question);assert.equal((await r.json()).agentic,undefined);assert.ok(normalModels>before);assert.equal(quota,quotaBefore+1,'fallback shares the original request quota');await flush();assert.ok(![...shared.keys()].some(k=>k.includes('ask-agentic')));
 mode='overrun';const normalBefore=normalModels;const over=await post(question);assert.equal(over.status,504);assert.equal((await over.json()).agentic,undefined);assert.equal(normalModels,normalBefore,'an exhausted deadline cannot start fallback');await new Promise(r=>setTimeout(r,25));mode='ranking';await flush();
});
test('a disconnected reader cancels tools without starting a paid fallback',async()=>{
 h.env.AGENTIC_ASK_MODE='route';shared.clear();edge.clear();mode='abort-tools';
 const controller=new AbortController(),started=new Promise(resolve=>{toolStarted=resolve}),before=normalModels;
 const pendingResponse=h.fetch('/api/ask',{method:'POST',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({question,kind:'speech'})});
 await started;controller.abort();const response=await pendingResponse;assert.equal((await response.json()).answered,false);assert.equal(normalModels,before);mode='ranking';await flush();
});
test('P1 reader.cancel aborts an in-flight tool and never starts fallback or a composer',async()=>{
 h.env.AGENTIC_ASK_MODE='route';shared.clear();edge.clear();mode='abort-tools';
 const started=new Promise(resolve=>{toolStarted=resolve}),before=normalModels,beforeModels=models;
 const response=await post(question,true),reader=response.body.getReader();
 let watchdog;
 try{
  // Consume progress until the lookup starts, including transports that
  // apply backpressure on every status frame.
  while(!await Promise.race([started.then(()=>true),reader.read().then(()=>false)])) {}
  assert.equal(toolSignal.aborted,false);await reader.cancel();
  // A cancellation must settle the waitUntil work even when no tool completes.
  await Promise.race([flush(),new Promise((_,reject)=>{watchdog=setTimeout(()=>reject(Error('tools continued after reader cancellation')),500)})]);
  assert.equal(toolSignal.aborted,true);assert.equal(normalModels,before);assert.equal(models,beforeModels+1);
 }finally{clearTimeout(watchdog);toolStop();await Promise.race([flush(),new Promise(resolve=>setTimeout(resolve,100))]);mode='ranking'}
});
test('P1 planner junk and unknown subjects actually fall back to normal Ask',async()=>{
 h.env.AGENTIC_ASK_MODE='route';shared.clear();edge.clear();mode='junk';
 const previous=globalThis.fetch;globalThis.fetch=async(input,init)=>{
  const b=JSON.parse(init?.body??'{}');if(new URL(input).pathname.endsWith('/ask')&&b.prompt?.user?.includes('Plan the record'))return Response.json({answer:b.query.includes('quantum dragons')?'{"shape":"ranking","steps":[{"tool":"count_speeches","args":{"group_by":"speaker"}}]}':'junk'});
  return previous(input,init);
 };
 try {for(const q of ['Who has spoken most about gambling?','Who has spoken most about quantum dragons?']){
  const before=normalModels;const r=await post(q);assert.equal((await r.json()).agentic,undefined);assert.ok(normalModels>before);await flush();
 }}finally{globalThis.fetch=previous;mode='ranking'}
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
test('electorate ranking reaches the registered Census tool in JSON and SSE without speech resolution',async()=>{
 const previousAssets=h.env.ASSETS,previousFetch=globalThis.fetch;
 const assets=JSON.parse(readFileSync(new URL('./fixtures/agentic-electorates.json',import.meta.url))).assets;
 const read=[];let outbound=0;
 h.env.AGENTIC_ASK_MODE='route';shared.clear();edge.clear();
 h.env.ASSETS={async fetch(req){
  const path=new URL(req.url).pathname;read.push(path);
  if(path.startsWith('/graph/money'))return Response.json({nodes:[],edges:[]});
  if(path==='/access.json')return Response.json({ministers:{}});
  return assets[path]?Response.json(assets[path]):new Response('fixture missing',{status:404});
 }};
 globalThis.fetch=async()=>{outbound++;throw Error('Census rankings must not call speech retrieval or generation')};
 try{
  for(const stream of [false,true]){
   shared.clear();edge.clear();
   const response=await post('Which three federal electorates have the highest unemployment rate?',stream);
   assert.equal(response.status,200);const text=await response.text();
   const events=stream?frames(text):[];
   const done=stream?events.find(f=>f.event==='done').data:JSON.parse(text);
   assert.equal(done.answered,true,JSON.stringify(done));
   for(const name of ['Alpine','Coast','Sample Bay'])assert.ok(done.answer.includes(name),name);
   assert.match(done.answer,/2021 Census \(ABS\)/);
   assert.equal(done.agentic.steps.length,1);
   assert.equal(done.agentic.steps[0].label,'Checking electorate data');
   assert.equal(done.agentic.steps[0].arg,'unemployment rate');
   assert.equal(done.agentic.steps[0].state,'done');
   assert.equal(done.sources.filter(s=>s.resource.startsWith('fact-')).length,3);
   assert.ok(done.sources.filter(s=>s.resource.startsWith('fact-')).every(s=>s.href.includes('/subject/electorate/')));
   assert.ok(Object.keys(done.citations).length);
   if(stream)assert.ok(events.some(f=>f.data.phase==='step'&&f.data.step.state==='running'));
   await flush();
  }
  assert.ok(read.includes('/electorates/manifest.json'));
  assert.ok(!read.includes('/parliamentarians.json'));
  assert.ok(!read.includes('/bills/index.json'));
  assert.equal(outbound,0);
 }finally{h.env.ASSETS=previousAssets;globalThis.fetch=previousFetch}
});
test.after(()=>restore());
