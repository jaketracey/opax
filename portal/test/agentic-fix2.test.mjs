import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fixtureDeps} from './fixtures/agentic-route.mjs';
import {loadWorker,offline} from './worker-harness.mjs';
const load=async file=>{const out=await build({entryPoints:[new URL(file,import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'))};
const ask=await load('../src/agentic-ask.ts');
const plan=steps=>JSON.stringify({shape:'trend',steps});
const count=(speaker,party)=>({tool:'count_speeches',args:{topic:'housing',group_by:'none',...(speaker?{speaker}:{}),...(party?{party}:{})}});

test('P1 metric swap: aye/no values are bound to labels; no composer is called',async()=>{
 const swapped='Taylor Example voted in 3 divisions with "gambling" in the title: aye 1, no 2 [1].';
 assert.equal(ask.verifyComposition(swapped,[{id:1,text:'Taylor Example voted in 3 divisions with "gambling" in the title: aye 2, no 1',cite:{}}]).prose,'');
 let models=0;
 const r=await ask.runAgentic('Compare how often Taylor Example voted on gambling with how many speeches Pat Example made about gambling',{
  ...fixtureDeps,
  generate:async()=>({text:++models===1?JSON.stringify({shape:'comparison',steps:[{tool:'member_votes',args:{keyword:'gambling',person:'Taylor Example'}},{tool:'count_speeches',args:{topic:'gambling',speaker:'Pat Example',group_by:'none'}}]}):swapped+' Pat Example made 87 speeches [2].'}),
  kb:async(_p,b)=>b.query?{resources:Object.fromEntries(['one','two','three'].map(k=>[k,{slug:'division-'+k}]))}:{fulltext:{total:87}},
  asset:async p=>p.startsWith('/divisions/')?{key:p.split('/').at(-1).replace('.json',''),date:'2026-01-01',name:'Gambling fixture',ayes:2,noes:1,members:[{name:'Taylor Example',vote:p.includes('three')?'no':'aye'}]}:fixtureDeps.asset(p),
 });
 assert.equal(r.answered,true);assert.equal(r.answer_source,'template');assert.equal(models,1);
 assert.match(r.answer,/Taylor Example voted in 3 divisions.*aye 2, no 1 \[1\]/);
 assert.match(r.answer,/87 chamber speeches labelled gambling by Pat Example \[2\]/);
 assert.doesNotMatch(r.answer,/aye 1, no 2/);
});

test('P1 party/year swap: each year and count retains its party and DB row',async()=>{
 const swapped='2024: Labor made 1 speech and Greens made 2 speeches [1][3]. 2025: Labor made 2 speeches and Greens made 1 speech [2][4].';
 const facts=['2024: 2 speeches by Labor','2025: 1 speech by Labor','2024: 1 speech by Greens','2025: 2 speeches by Greens'].map((text,i)=>({id:i+1,text,cite:{}}));
 assert.equal(ask.verifyComposition(swapped,facts).prose,'');
 let models=0;
 const r=await ask.runAgentic('How many housing speeches did Labor and Greens make each year from 2024 to 2025?',{
  ...fixtureDeps,
  generate:async()=>({text:++models===1?plan(['Labor','Greens'].map(party=>({tool:'speech_trend',args:{topic:'housing',party,by:'year',from_year:2024,to_year:2025}}))):swapped}),
  kb:async(_p,b)=>{const text=JSON.stringify(b),year=/"since":"(\d{4})/.exec(text)?.[1],labor=text.includes('"label":"Labor"');return{fulltext:{total:!text.includes('"label":"housing"')?10:(year==='2024')===labor?2:1}}},
 });
 assert.equal(r.answered,true);assert.equal(r.answer_source,'template');assert.equal(models,1);
 for(const [year,party,n] of [[2024,'Labor',2],[2025,'Labor',1],[2024,'Greens',1],[2025,'Greens',2]])assert.match(r.answer,new RegExp(`${year}: ${n} chamber speeches labelled housing indexed under ${party}`));
});

test('P1 model digits: even supported counts, calendar years and citation ids are rejected',()=>{
 for(const text of ['Aye 2, no 1 [1].','In 2025 the debate continued.','The amount was $1,234.','Coverage is 73%.','This is cited [1].','The count is ٢.'])assert.equal(ask.verifyComposition(text,[]).prose,'',text);
 assert.equal(ask.verifyComposition('These are recorded parliamentary statements.',[]).prose,'These are recorded parliamentary statements.');
});

test('P1 named speaker: an unscoped plan declines before an overall count; scoped plan returns 87',async()=>{
 for(const question of ['How many speeches has Taylor Example made about housing?',"How many of Taylor Example's housing speeches are recorded?",'How many housing speeches has taylor example made?','How many housing speeches has Example made?']){
  let tools=0;const r=await ask.runAgentic(question,{...fixtureDeps,generate:async()=>({text:plan([count()])}),kb:async()=>{tools++;return{fulltext:{total:300}}}});
  assert.equal(r.answered,false,question);assert.equal(r.reason,'declined');assert.equal(tools,0);
 }
 const r=await ask.runAgentic('How many speeches has Taylor Example made about housing?',{...fixtureDeps,generate:async()=>({text:plan([count('Taylor Example')])}),kb:async(_p,b)=>({fulltext:{total:JSON.stringify(b).includes('Taylor Example')?87:300}})});
 assert.equal(r.answered,true);assert.match(r.answer,/87 chamber speeches labelled housing by Taylor Example/);assert.doesNotMatch(r.answer,/300/);
});

test('P1 named entities: dropped parties, partially scoped people, and named bills decline',async()=>{
 for(const [q,steps] of [
  ['How many housing speeches has Labor made?',[count()]],
  ['How many housing speeches have Taylor Example and Pat Example made?',[count('Taylor Example')]],
  ['How many speeches have been made about the Housing Support Bill 2025?',[count()]],
 ]){
  let tools=0;const r=await ask.runAgentic(q,{...fixtureDeps,asset:async p=>p==='/bills/index.json'?{bills:[{key:'fixture-housing',title:'Housing Support Bill 2025'}]}:fixtureDeps.asset(p),generate:async()=>({text:plan(steps)}),kb:async()=>{tools++;return{fulltext:{total:300}}}});
  assert.equal(r.answered,false,q);assert.equal(r.reason,'declined');assert.equal(tools,0);
 }
});

test('P1 actual route: a dropped roster speaker falls back to normal Ask and its no-answer contract in JSON and SSE',async()=>{
 const restore=offline(),pending=[];
 try{
  const h=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,new URL('../public/',import.meta.url).pathname,{waitUntil(p){pending.push(p)},passThroughOnException(){}});
  h.env.AGENTIC_ASK_MODE='route';h.env.SA_HANSARD_FULL_TEXT='true';h.env.ASK_LIMITER={limit:async()=>({success:true})};
  const original=h.env.ASSETS;h.env.ASSETS={fetch:req=>new URL(req.url).pathname==='/parliamentarians.json'?Response.json({people:[{name:'Taylor Example',party:'Labor'}]}):new URL(req.url).pathname==='/bills/index.json'?Response.json({bills:[]}):original.fetch(req)};
  let planners=0,normals=0,overallCounts=0;
  globalThis.fetch=async(input,init)=>{
   assert.ok(new URL(input).hostname.startsWith('offline.'));
   const b=JSON.parse(init?.body??'{}');
   if(new URL(input).pathname.endsWith('/ask')){
    if(b.prompt?.user?.includes('Plan the record')){planners++;return Response.json({answer:plan([count()])})}
    normals++;const answer=JSON.stringify({answered:false,answer:''});
    if(init.headers?.['x-synchronous']==='true')return Response.json({answer,retrieval_results:{resources:{}}});
    return new Response([{type:'answer',text:answer},{type:'status',code:'0',status:'success'}].map(item=>JSON.stringify({item})).join('\n')+'\n',{headers:{'content-type':'application/x-ndjson'}});
   }
   if(new URL(input).pathname.endsWith('/catalog')){if(b.page_size===0)overallCounts++;return Response.json({fulltext:{total:300},resources:{}})}
   return Response.json({resources:{},fulltext:{total:0}});
  };
  for(const stream of [false,true]){
   const response=await h.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json',...(stream?{accept:'text/event-stream'}:{})},body:JSON.stringify({question:'How many speeches has Taylor Example made about housing?',kind:'speech'})});
   const text=await response.text();assert.equal(response.status,200);assert.doesNotMatch(text,/300|"agentic"/);
   const done=stream?JSON.parse(text.split('\n\n').find(frame=>frame.startsWith('event: done\n')).split('\ndata: ')[1]):JSON.parse(text);
   assert.equal(done.answered,false);assert.equal(done.reason,'declined');assert.equal(done.answer,'');
   assert.deepEqual(done.sources,[]);assert.deepEqual(done.citations,{});
   if(stream)assert.doesNotMatch(text,/event: delta/);
  }
  assert.equal(planners,2);assert.equal(normals,2);assert.equal(overallCounts,0);while(pending.length)await Promise.all(pending.splice(0));
 }finally{restore()}
});
