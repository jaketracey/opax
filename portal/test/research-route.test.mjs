import test from 'node:test';
import assert from 'node:assert/strict';
import {MockLanguageModelV4} from 'ai/test';
import {loadWorker,offline} from './worker-harness.mjs';
import {decodeAnswer,AskStream} from './fixtures/research-app-decoders.mjs';
import {budgetDatabase} from './fixtures/research-budget.mjs';
import {timingSafeEqual} from 'node:crypto';
const restore=offline(),pending=[],logs=[],ctx={waitUntil:p=>pending.push(p),passThroughOnException(){}};
const plugin={name:'fake-openrouter-only',setup(b){b.onResolve({filter:/^@openrouter\/ai-sdk-provider$/},()=>({path:'fake',namespace:'research-test'}));b.onLoad({filter:/.*/,namespace:'research-test'},()=>({contents:'export const createOpenRouter=()=>()=>globalThis.__researchModel;',loader:'js'}));}};
const h=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,new URL('../public',import.meta.url).pathname,ctx,{plugins:[plugin]});
const id='a'.repeat(32)+'/t/body/0-90',resource=id.split('/')[0],text='The committee called for stronger housing affordability safeguards.',countArgs={topic:'gambling',state:'nsw',group_by:'speaker'};
const call=(toolName,args,toolCallId='fake')=>({type:'tool-call',toolName,toolCallId,input:JSON.stringify(args)});
const reply=calls=>({content:calls,finishReason:{unified:'tool-calls',raw:'tool_calls'},usage:{inputTokens:{total:10,noCache:10,cacheRead:0,cacheWrite:0},outputTokens:{total:5,text:5,reasoning:0}},providerMetadata:{openrouter:{usage:{cost:(10*0.66+5*1.98)/1e6}}},warnings:[]});
const counted=()=>new MockLanguageModelV4({doGenerate:[reply([call('count_speeches',countArgs)]),reply([call('finish',{facts:[1]})])]});
const qualitative=(bad=false)=>new MockLanguageModelV4({doGenerate:[reply([call('search',{query:'housing'})]),reply([call('read_passage',{id})]),...Array.from({length:bad?2:1},()=>reply([call('answer',{text,citations:[{id:bad?'unbound/t/body/0':id,quote:text,start:0,end:text.length}]})]))]});
let plannerCalls=0,ordinaryCalls=0,quota=0,modelQuota=0;
h.env.OPENROUTER_API_KEY='test-only-placeholder';h.env.AGENTIC_ASK_MODE='route';h.env.AGENTIC_INPUT_USD_PER_MILLION='0.66';h.env.AGENTIC_OUTPUT_USD_PER_MILLION='1.98';h.env.SA_HANSARD_FULL_TEXT='true';
const daily=budgetDatabase();h.env.COMMUNITY_DB=daily.db;
const previousComparator=crypto.subtle.timingSafeEqual;crypto.subtle.timingSafeEqual=timingSafeEqual;
h.env.ASK_LIMITER={limit:async()=>{quota++;return{success:true}}};h.env.MODEL_LIMITER={limit:async()=>{modelQuota++;return{success:true}}};
const realAssets=h.env.ASSETS;h.env.ASSETS={fetch:req=>['/parliamentarians.json','/bills/index.json'].includes(new URL(req.url).pathname)?Response.json({people:[],bills:[]}):new URL(req.url).pathname.startsWith('/graph/money')?Response.json({nodes:[],edges:[]}):realAssets.fetch(req)};
globalThis.caches={default:{match:async()=>undefined,put:async()=>{}}};
globalThis.fetch=async(input,init)=>{
 const url=new URL(input);assert.ok(url.hostname.startsWith('offline.'),'all service reads must be offline fixtures');const body=JSON.parse(init?.body??'{}');
 if(url.pathname.endsWith('/ask')){
  if(body.prompt?.user?.includes('Plan the record')){plannerCalls++;return Response.json({answer:JSON.stringify({shape:'ranking',steps:[{tool:'count_speeches',args:countArgs}]}),metadata:{tokens:{input:11,output:6}}});}
  ordinaryCalls++;const raw={answer:'The record supports parliamentary scrutiny.',retrieval_results:{resources:{}},metadata:{tokens:{input:13,output:7}}};
  return init.headers?.['x-synchronous']==='true'?Response.json(raw):new Response([{type:'answer',text:raw.answer},{type:'metadata',tokens:raw.metadata.tokens},{type:'status',code:'0',status:'success'}].map(item=>JSON.stringify({item})).join('\n')+'\n',{headers:{'content-type':'application/x-ndjson'}});
 }
 if(url.pathname.endsWith('/catalog')||url.pathname.endsWith('/search'))return Response.json({fulltext:{total:100,facets:{'/u/o':{'/u/o/Taylor Example':87,'/u/o/Pat Example':13}}},resources:{}});
 if(url.pathname.endsWith('/find'))return Response.json({resources:{[resource]:{slug:'speech-1',title:'Housing debate',fields:{body:{paragraphs:{[id]:{text}}}}}}});
 if(url.pathname.includes('/slug/speech-1'))return Response.json({id:resource,title:'Housing debate',extra:{metadata:{date:'2023-05-01'}},data:{texts:{body:{value:{body:text}}}},usermetadata:{classifications:[{labelset:'kind',label:'speech'}]}});
 throw Error('unexpected fixture service path');
};
const q='Who speaks most about gambling in NSW across the whole record?';
const post=(question=q,stream=false,extra={})=>h.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json','x-opax-nocache':'1'},body:JSON.stringify({question,kind:'speech',...extra})});
const flush=async()=>{while(pending.length)await Promise.all(pending.splice(0))};
const decodeStream=raw=>{const parser=new AskStream({stage(){},delta(){},retry(){}});for(let i=0;i<raw.length;i+=17)parser.push(raw.slice(i,i+17));parser.push('',true);return parser.result();};
const native=body=>{const decoded=decodeAnswer(body);assert.ok(decoded.answer);assert.equal(decoded.sources.length,body.sources.length);for(const source of decoded.sources)assert.equal(typeof source.href,'string');return decoded;};
const oldLog=console.log;console.log=value=>{try{logs.push(JSON.parse(value))}catch{oldLog(value)}};

test('RESEARCH_LOOP off is byte-identical to the current path in JSON and SSE',async()=>{
 for(const question of [q,'What does the record say about scrutiny?'])for(const stream of [false,true]){
  const oldNow=Date.now;Date.now=()=>1791900000000;
  try{h.env.RESEARCH_LOOP=undefined;const a=await post(question,stream),before=await a.text();h.env.RESEARCH_LOOP='off';const b=await post(question,stream);assert.equal(await b.text(),before);assert.equal(b.headers.get('x-opax-cache'),a.headers.get('x-opax-cache'));}finally{Date.now=oldNow;}
 }await flush();
});
test('route counts use templates; app decoders accept loop JSON, SSE, and fallback',async()=>{
 h.env.RESEARCH_LOOP='route';
 for(const stream of [false,true]){globalThis.__researchModel=counted();const before=plannerCalls,mq=modelQuota,aq=quota,response=await post(q,stream),raw=await response.text(),body=stream?decodeStream(raw):JSON.parse(raw);native(body);assert.equal(body.research.mode,'loop',JSON.stringify(logs.filter(r=>r.kind==='research_loop_fallback')));assert.equal(body.answered,true);assert.match(body.answer,/Taylor Example: 87/);assert.equal(plannerCalls,before);assert.equal(modelQuota,mq+2);assert.equal(quota,aq+1);assert.equal(response.headers.get('x-opax-cache'),'MISS');if(stream)assert.match(raw,/"phase":"step"/);await flush();}
 delete h.env.OPENROUTER_API_KEY;const response=await post(),body=await response.json();native(body);assert.equal(body.research.mode,'planner');assert.ok(body.research.trail.length);assert.ok(body.research.sources.every(source=>body.sources.some(s=>s.href===source.url)));h.env.OPENROUTER_API_KEY='test-only-placeholder';await flush();
});
test('ordinary and non-speech questions go through qualitative search/read/answer in route mode',async()=>{
 h.env.RESEARCH_LOOP='route';for(const kind of ['speech','all','bill'])for(const stream of [false,true]){globalThis.__researchModel=qualitative();const before=ordinaryCalls,response=await post('What does the record say about housing affordability?',stream,{kind}),raw=await response.text(),body=stream?decodeStream(raw):JSON.parse(raw);native(body);assert.equal(body.research.mode,'loop',JSON.stringify(logs.filter(r=>r.kind==='research_loop_fallback')));assert.equal(body.answer,text);assert.deepEqual(body.citations,{[id]:[[0,text.length]]});assert.equal(body.sources[0].resource,resource);assert.equal(body.research.sources[0].kind,'speech');assert.equal(body.research.sources[0].date,'2023-05-01');assert.equal(ordinaryCalls,before);await flush();}
});
test('failed qualitative repair falls back additively in JSON and SSE and app decoders still work',async()=>{
 h.env.RESEARCH_LOOP='route';for(const stream of [false,true]){globalThis.__researchModel=qualitative(true);const before=ordinaryCalls,response=await post('What does the record say about housing affordability?',stream),raw=await response.text(),body=stream?decodeStream(raw):JSON.parse(raw);native(body);assert.equal(body.research.mode,'planner');assert.match(body.answer,/parliamentary scrutiny/);assert.equal(ordinaryCalls,before+1);await flush();}
});
test('shadow serves the planner and logs the loop facts, figures, time, tokens and cost',async()=>{
 h.env.RESEARCH_LOOP='off';const previous=Date.now;Date.now=()=>1791900000000;let baseline;
 try{baseline=await(await post()).text();h.env.RESEARCH_LOOP='shadow';globalThis.__researchModel=counted();const response=await post();assert.equal(await response.text(),baseline);await flush();}finally{Date.now=previous;}
 const record=logs.findLast(r=>r.kind==='research_loop_shadow');assert.ok(record);assert.equal(record.loop.mode,'loop');assert.deepEqual(record.loop.chosen_facts,[1]);assert.deepEqual(record.loop.tokens,{input:20,output:10});assert.equal(typeof record.loop.cost_usd,'number');assert.ok(record.planner.steps.length);assert.equal(typeof record.agreement.facts,'boolean');assert.equal(typeof record.agreement.figures,'boolean');assert.doesNotMatch(JSON.stringify(record),/Example|gambling|housing|api key|test-only|https:/);
});
test('SSE cancellation aborts an active fake model and never runs the old path',async()=>{
 h.env.RESEARCH_LOOP='route';let start,signal;const started=new Promise(r=>start=r);globalThis.__researchModel=new MockLanguageModelV4({doGenerate:options=>{signal=options.abortSignal;start();return new Promise(()=>{})}});
 const before=plannerCalls+ordinaryCalls,response=await post(q,true),reader=response.body.getReader();await Promise.race([started,new Promise((_,reject)=>setTimeout(()=>reject(Error('model did not start: '+JSON.stringify(logs.filter(r=>r.kind==='research_loop_fallback')))),1000))]);await reader.cancel();await flush();assert.equal(signal.aborted,true);assert.equal(plannerCalls+ordinaryCalls,before);
});
test('loop caches replay JSON and SSE without model calls and never collide with planner caches',async()=>{
 const previousCaches=globalThis.caches,edge=new Map(),shared=new Map();globalThis.caches={default:{match:async k=>edge.get(k.url)?.clone(),put:async(k,r)=>edge.set(k.url,new Response(await r.text(),r))}};
 h.env.GENERATION_CACHE={get:async k=>shared.get(k)??null,put:async(k,v)=>shared.set(k,JSON.parse(v))};h.env.RESEARCH_LOOP='route';globalThis.__researchModel=counted();
 const uncached=stream=>h.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:q,kind:'speech'})});
 try{
  const first=await uncached(false),body=await first.json();assert.equal(body.research.mode,'loop');await flush();const count=modelQuota;
  for(const stream of [false,true]){const hit=await uncached(stream),raw=await hit.text(),decoded=stream?decodeStream(raw):JSON.parse(raw);assert.equal(hit.headers.get('x-opax-cache'),'HIT');assert.deepEqual(decoded,body);native(decoded);assert.equal(modelQuota,count);}
  h.env.RESEARCH_LOOP='off';const previous=plannerCalls;const old=await uncached(false);assert.equal((await old.json()).research,undefined);assert.equal(plannerCalls,previous+1);await flush();
 }finally{globalThis.caches=previousCaches;delete h.env.GENERATION_CACHE;}
});
test('shadow reader cancellation also aborts its background loop',async()=>{
 h.env.RESEARCH_LOOP='shadow';let start,signal;const started=new Promise(r=>start=r);globalThis.__researchModel=new MockLanguageModelV4({doGenerate:options=>{signal=options.abortSignal;start();return new Promise(()=>{})}});
 const response=await post(q,true),reader=response.body.getReader();await started;const before=plannerCalls+ordinaryCalls;await reader.cancel();await flush();assert.equal(signal.aborted,true);assert.equal(plannerCalls+ordinaryCalls,before);
});
const evalPost=(override,stream=false,question=q,auth='Bearer fixture-operator',extra={})=>h.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json','x-opax-research':override,...(auth?{authorization:auth}:{})},body:JSON.stringify({question,kind:'speech',...extra})});
test('authenticated loop and old overrides serve JSON/SSE with usage and never read or populate answer caches',async()=>{
 h.env.RESEARCH_LOOP='shadow';h.env.DAILY_POST_OPERATOR_SECRET='fixture-operator';
 const previousCaches=globalThis.caches,reads=[],writes=[],answerKey=k=>/https:\/\/cache\.opax\.internal\/ask(?:-agentic)?\//.test(k.url);
 globalThis.caches={default:{match:async k=>{if(answerKey(k)){reads.push(k.url);return Response.json({answer:'POISONED SHARED ANSWER'})}},put:async(k,r)=>{if(answerKey(k))writes.push(k.url)}}};
 h.env.GENERATION_CACHE={get:async k=>{reads.push(k);return null},put:async(k,v)=>writes.push(k)};
 try{
  for(const override of ['loop','old'])for(const stream of [false,true]){
   const fake=counted();globalThis.__researchModel=fake;const before=plannerCalls,shadowRecords=logs.filter(r=>r.kind==='research_loop_shadow').length;
   const response=await evalPost(override,stream),raw=await response.text(),body=stream?decodeStream(raw):JSON.parse(raw);native(body);
   assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-opax-cache'),'BYPASS');assert.equal(body.research.mode,override==='loop'?'loop':'planner');assert.match(body.answer,/Taylor Example: 87/);
   assert.deepEqual(body.research.tokens,override==='loop'?{input:20,output:10}:{input:11,output:6});assert.equal(typeof body.research.cost_usd,'number');assert.equal(typeof body.research.ms,'number');assert.ok(body.research.trail.length);
   assert.equal(plannerCalls,before+(override==='old'?1:0));assert.equal(fake.doGenerateCalls.length,override==='loop'?2:0);await flush();assert.equal(logs.filter(r=>r.kind==='research_loop_shadow').length,shadowRecords,'overrides do not launch a shadow');
  }
  assert.deepEqual(reads,[]);assert.deepEqual(writes,[]);
 }finally{globalThis.caches=previousCaches;delete h.env.GENERATION_CACHE;}
});
test('old override includes ordinary JSON/SSE consumption and loop fallback includes both attempts',async()=>{
 h.env.RESEARCH_LOOP='shadow';const ordinary='What does the record say about housing affordability?';
 for(const stream of [false,true])for(const override of ['old','loop']){
  globalThis.__researchModel=qualitative(true);const response=await evalPost(override,stream,ordinary),raw=await response.text(),body=stream?decodeStream(raw):JSON.parse(raw);native(body);
  assert.equal(body.research.mode,'planner');assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(body.research.tokens,override==='old'?{input:13,output:7}:{input:53,output:27});
  const wanted=(body.research.tokens.input*0.66+body.research.tokens.output*1.98)/1e6;assert.ok(Math.abs(body.research.cost_usd-wanted)<1e-12);
  await flush();
 }
});
test('unauthorized or invalid research headers are ignored in both JSON and SSE',async()=>{
 const previous=Date.now;Date.now=()=>1791900000000;
 try{
  for(const stream of [false,true]){
   h.env.RESEARCH_LOOP='off';const baseline=await(await post(q,stream)).text();
   for(const [override,auth] of [['loop',null],['old','Bearer wrong'],['invalid','Bearer fixture-operator']]){
    h.env.RESEARCH_LOOP='shadow';const fake=counted();globalThis.__researchModel=fake;
    const response=await evalPost(override,stream,q,auth);assert.equal(await response.text(),baseline);assert.notEqual(response.headers.get('x-opax-cache'),'BYPASS');await flush();assert.equal(fake.doGenerateCalls.length,2,'unauthorized old must not suppress global shadow');
   }
   const secret=h.env.DAILY_POST_OPERATOR_SECRET;delete h.env.DAILY_POST_OPERATOR_SECRET;
   globalThis.__researchModel=counted();assert.equal(await(await evalPost('loop',stream)).text(),baseline);await flush();h.env.DAILY_POST_OPERATOR_SECRET=secret;
  }
 }finally{Date.now=previous;}
});
test('authenticated overrides mark validation errors no-store and enforce the daily cap',async()=>{
 const response=await evalPost('loop',false,'');assert.equal(response.status,400);assert.equal(response.headers.get('cache-control'),'no-store');
 h.env.RESEARCH_LOOP_DAILY_USD='0';const fake=counted();globalThis.__researchModel=fake;
 try{const response=await evalPost('loop'),body=await response.json();assert.equal(body.research.mode,'planner');assert.equal(fake.doGenerateCalls.length,0);assert.ok(logs.some(r=>r.reason==='daily_budget'));await flush();}finally{delete h.env.RESEARCH_LOOP_DAILY_USD;}
});
test('override wall timeout preserves planner fallback and reports unknown inference usage honestly',async()=>{
 h.env.RESEARCH_LOOP_MS='15';const fake=new MockLanguageModelV4({doGenerate:()=>new Promise(()=>{})});globalThis.__researchModel=fake;
 try{const response=await evalPost('loop'),body=await response.json();native(body);assert.equal(body.research.mode,'planner');assert.equal(body.research.tokens,null);assert.equal(body.research.cost_usd,null);assert.equal(fake.doGenerateCalls.length,1);assert.ok(logs.some(r=>r.reason==='timeout'));await flush();}finally{delete h.env.RESEARCH_LOOP_MS;}
});
test('authenticated SSE override cancellation aborts inference without an old-path call',async()=>{
 let start,signal;const started=new Promise(r=>start=r);globalThis.__researchModel=new MockLanguageModelV4({doGenerate:options=>{signal=options.abortSignal;start();return new Promise(()=>{})}});
 const before=plannerCalls+ordinaryCalls,response=await evalPost('loop',true),reader=response.body.getReader();await started;await reader.cancel();await flush();assert.equal(signal.aborted,true);assert.equal(plannerCalls+ordinaryCalls,before);
});
test('402 override falls back at once, logs research_credit_exhausted, and short-circuits the next loop',async()=>{
 const fake=new MockLanguageModelV4({doGenerate:()=>{throw Object.assign(Error('private provider credit error'),{statusCode:402})}});globalThis.__researchModel=fake;
 for(const stream of [false,true]){
  const before=plannerCalls,response=await evalPost('loop',stream),raw=await response.text(),body=stream?decodeStream(raw):JSON.parse(raw);native(body);
  assert.equal(body.research.mode,'planner');assert.deepEqual(body.research.tokens,{input:11,output:6});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(plannerCalls,before+1);await flush();
 }
 assert.equal(fake.doGenerateCalls.length,1);assert.ok(logs.filter(r=>r.reason==='research_credit_exhausted').length>=2);assert.doesNotMatch(JSON.stringify(logs),/private provider credit error|fixture-operator/);
});
test.after(async()=>{await flush();daily.close();crypto.subtle.timingSafeEqual=previousComparator;console.log=oldLog;delete globalThis.__researchModel;restore();});
