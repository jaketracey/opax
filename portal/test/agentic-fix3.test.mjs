import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {fixtureDeps} from './fixtures/agentic-route.mjs';
import {loadWorker,offline} from './worker-harness.mjs';
const out=await build({entryPoints:[new URL('../src/agentic-ask.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const ask=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const plan=speaker=>JSON.stringify({shape:'trend',steps:[{tool:'count_speeches',args:{topic:'housing',group_by:'none',...(speaker?{speaker}:{})}}]});
const lower='How many housing speeches has morgan fiction made?';
const upper='How many housing speeches has Morgan Fiction made?';
const scope=(people=[],parties=[],bills=[])=>({people,parties,bills,ambiguous:false,unresolved:false});

test('P1 lowercase unresolved speaker declines before any planner or count, including possessives and single names',async()=>{
 for(const q of [lower,upper,"How many of morgan fiction's housing speeches are recorded?",'How many housing speeches has morgan made?','How many housing speeches did morgan fiction give?','How many housing speeches by morgan fiction are recorded?','How many housing speeches did morgan fiction say?', 'Compare housing speeches by Taylor Example and morgan fiction']){
  let models=0,counts=0;const r=await ask.runAgentic(q,{...fixtureDeps,generate:async()=>{models++;return{text:plan()}},kb:async()=>{counts++;return{fulltext:{total:300}}}});
  assert.equal(r.answered,false,q);assert.equal(r.reason,'declined');assert.equal(counts,0,q);assert.equal(models,0,q);
 }
});

test('P1 explicit person grammar declines unresolved names made from ordinary query words',async()=>{
 for(const q of ['How many housing speeches has bill justice made?', "How many of bill justice's housing speeches are recorded?",'How many housing speeches by bill justice are recorded?', 'How many housing speeches have Taylor Example and morgan made?']){
  let calls=0;const r=await ask.runAgentic(q,{...fixtureDeps,generate:async()=>({text:plan()}),kb:async()=>{calls++;return{fulltext:{total:300}}}});
  assert.equal(r.answered,false,q);assert.equal(calls,0,q);
 }
 for(const q of ['How many housing speeches have been made?', 'How many housing speeches have MPs made?', 'How many housing speeches by year are recorded?']){
  const r=await ask.runAgentic(q,{...fixtureDeps,generate:async()=>({text:plan()})});assert.equal(r.answered,true,q);
 }
 const resolved=await ask.runAgentic("How many of Taylor Example's housing speeches are recorded?",{...fixtureDeps,generate:async()=>({text:plan('Taylor Example')})});
 assert.equal(resolved.answered,true);

});

test('P1 cache identity binds canonical resolved people, parties and bills and rejects unresolved scope',async()=>{
 const key=entities=>ask.agenticCacheKey(lower,'epoch','model',ask.inferPeriod(lower),undefined,{},'trend',entities);
 assert.notEqual(await key(scope(['Taylor Example'])),await key(scope(['Pat Example'])));
 assert.notEqual(await key(scope([],['Labor'])),await key(scope([],['Greens'])));
 assert.notEqual(await key(scope([],[],['bill-a'])),await key(scope([],[],['bill-b'])));
 assert.equal(await key(scope(['Taylor Example','Pat Example','Taylor Example'])),await key(scope(['Pat Example','Taylor Example'])));
 await assert.rejects(key({...scope(),unresolved:true}),/unresolved/);
});

test('P1 actual JSON/SSE: lowercase then capitalised unknown speaker cannot seed or read an agentic cache',async()=>{
 const restore=offline(),originalCache=globalThis.caches,pending=[],shared=new Map(),edge=new Map();
 try{
  const h=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,new URL('../public/',import.meta.url).pathname,{waitUntil(p){pending.push(p)},passThroughOnException(){}});
  const assets=h.env.ASSETS;h.env.ASSETS={fetch(req){const p=new URL(req.url).pathname;if(p==='/parliamentarians.json')return Response.json({people:[{name:'Taylor Example',party:'Labor'}]});if(p==='/bills/index.json')return Response.json({bills:[]});if(p.startsWith('/graph/money'))return Response.json({nodes:[],edges:[]});return assets.fetch(req)}};
  h.env.AGENTIC_ASK_MODE='route';h.env.SA_HANSARD_FULL_TEXT='true';h.env.ASK_LIMITER={limit:async()=>({success:true})};
  h.env.COMMUNITY_DB={prepare(){return{bind(){return{run:async()=>({success:true})}}}}};
  let cacheReads=0,cacheWrites=0,models=0,normal=0,counts=0;
  const agentic=k=>String(k).includes('/ask-agentic/');
  h.env.GENERATION_CACHE={async get(k){if(agentic(k))cacheReads++;return shared.get(k)??null},async put(k,v){if(agentic(k))cacheWrites++;shared.set(k,JSON.parse(v))}};
  globalThis.caches={default:{async match(k){if(agentic(k.url))cacheReads++;return edge.get(k.url)?.clone()},async put(k,r){if(agentic(k.url))cacheWrites++;edge.set(k.url,new Response(await r.text(),r))}}};
  globalThis.fetch=async(input,init)=>{
   const u=new URL(input);assert.ok(u.hostname.startsWith('offline.'));const b=JSON.parse(init?.body??'{}');
   if(u.pathname.endsWith('/ask')){
    if(b.prompt?.user?.includes('Plan the record')){models++;return Response.json({answer:plan()})}
    normal++;const answer='The supplied name is not resolved in this fixture.';
    if(init.headers?.['x-synchronous']==='true')return Response.json({answer,retrieval_results:{resources:{}}});
    return new Response([{type:'answer',text:answer},{type:'status',code:'0',status:'success'}].map(item=>JSON.stringify({item})).join('\n')+'\n',{headers:{'content-type':'application/x-ndjson'}});
   }
   if(u.pathname.endsWith('/catalog')||u.pathname.endsWith('/search')){if(b.page_size===0)counts++;return Response.json({resources:{},fulltext:{total:300}})}
   return Response.json({resources:{}});
  };
  const flush=async()=>{while(pending.length)await Promise.all(pending.splice(0))};
  for(const stream of [false,true]){
   shared.clear();edge.clear();
   for(const q of [lower,upper]){
    const r=await h.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json',...(stream?{accept:'text/event-stream'}:{})},body:JSON.stringify({question:q,kind:'speech'})});
    const text=await r.text();await flush();assert.equal(r.status,200);assert.match(text,/supplied name is not resolved/);assert.doesNotMatch(text,/300|"agentic"|"phase":"step"/);
   }
  }
  assert.equal(models,0);assert.ok(normal>=2);assert.equal(counts,0);assert.equal(cacheReads,0);assert.equal(cacheWrites,0);
  // Even a poisoned same-normalisation cache entry is ignored before lookup.
  const poisoned=await ask.agenticCacheKey(lower,h.env.CACHE_EPOCH,'openai-compatible');
  edge.set(poisoned,Response.json({answered:true,answer:'300 overall speeches',agentic:{}}));
  const r=await h.fetch('/api/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:upper,kind:'speech'})});
  assert.doesNotMatch(await r.text(),/300|"agentic"/);assert.equal(cacheReads,0);await flush();
 }finally{restore();globalThis.caches=originalCache}
});

test('P1 real lowercase MP resolves against the public roster and answers only the scoped fixture count',async()=>{
 // User-requested public MP identity; every count and model response remains synthetic.
 const roster=JSON.parse(readFileSync(new URL('../public/parliamentarians.json',import.meta.url)));
 const person=roster.people.find(p=>p.name==='Penny Wong');assert.ok(person);
 const q='How many housing speeches has penny wong made?';
 assert.deepEqual(ask.extractNamedScope(q,roster,{bills:[]}).people,['Penny Wong']);
 const requests=[];const r=await ask.runAgentic(q,{...fixtureDeps,asset:async p=>p==='/parliamentarians.json'?roster:fixtureDeps.asset(p),generate:async()=>({text:plan(person.name)}),kb:async(_p,b)=>{requests.push(b);return{fulltext:{total:JSON.stringify(b).includes('Penny Wong')?87:300}}}});
 assert.equal(r.answered,true);assert.match(r.answer,/87 chamber speeches labelled housing by Penny Wong/);assert.doesNotMatch(r.answer,/300/);
 assert.ok(requests.length);assert.ok(requests.every(b=>JSON.stringify(b).includes('Penny Wong')));
});

test('P2 yearly facts retain every requested speaker regardless of tool order; missing entity declines',async()=>{
 const q='How many housing speeches have Taylor Example and Pat Example made each year from 2015 to 2026?';
 for(const people of [['Pat Example','Taylor Example'],['Taylor Example','Pat Example']]){
  const r=await ask.runAgentic(q,{...fixtureDeps,generate:async()=>({text:JSON.stringify({shape:'trend',steps:people.map(speaker=>({tool:'speech_trend',args:{topic:'housing',speaker,by:'year',from_year:2015,to_year:2026}}))})}),kb:async(_p,b)=>({fulltext:{total:JSON.stringify(b).includes('Pat Example')?60:87}})});
  assert.equal(r.answered,true);assert.equal(r.facts.length,24);
  for(const [name,n] of [['Taylor Example',87],['Pat Example',60]]){
   assert.match(r.answer,new RegExp(`${n} chamber speeches labelled housing by ${name}`));
   assert.equal((r.answer.match(new RegExp(`by ${name}`, 'g'))??[]).length,8);
  }
 }
 const one=[{id:1,text:'Pat Example: 60',cite:{value:60},entities:['person:Pat Example']}];
 assert.equal(ask.selectAnswerFacts(one,scope(['Taylor Example','Pat Example'])),null);
});

test('P3 model number words are rejected, including compounds, calendar years and ordinals',()=>{
 for(const text of ['Taylor Example made eighty-seven speeches.','Taylor Example made eighty seven speeches.','Aye two, no one.','The amount was one million dollars.','In two thousand twenty-five the debate continued.','The third speaker was Taylor Example.','Half the speeches were about housing.','A dozen speeches were recorded.','Millions of dollars were recorded.','This was the hundredth speech.'])assert.equal(ask.verifyComposition(text,[]).prose,'',text);
 assert.equal(ask.verifyComposition('These are recorded parliamentary statements.',[]).prose,'These are recorded parliamentary statements.');
});
