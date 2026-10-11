import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorker,offline} from './worker-harness.mjs';
import {speaker,themes,speeches,bills,catalogueCounts,resource,stubModel,validCatalogueRequest} from './fixtures/ask-person.mjs';

// The actual Worker, local exports, stubbed catalogue/retrieval/originals/model.
// Unknown outbound destinations or routes fail closed.
const restore=offline();
const calls=[];
let mode='fast',aborted=0;
let rewriteActive=0,rewriteStarted=()=>{};
const timings=[];
const harness=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,new URL('../public/',import.meta.url).pathname);
const diskAssets=harness.env.ASSETS;
harness.env.ASSETS={async fetch(req){if(new URL(req.url).pathname.startsWith('/growth/person-bills/'))return Response.json({bills});return diskAssets.fetch(req)}};
globalThis.fetch=async (input,init)=>{
 const url=new URL(input);const body=init?.body?JSON.parse(init.body):{};calls.push({path:url.pathname,body});
 assert.ok(url.hostname.startsWith('offline.'),'only the offline knowledge-box stub may be addressed');
 if(url.pathname.endsWith('/ask') && body.generate_answer===false)return Response.json({retrieval_results:{resources:{}}});
 if(mode.startsWith('rewrite-') && url.pathname.endsWith('/ask') && body.prompt?.system?.startsWith('You rewrite follow-up')){
  rewriteActive++;
  if(mode==='rewrite-fetch')return new Promise((resolve,reject)=>{
   const stop=()=>{rewriteActive--;aborted++;reject(init.signal.reason)};
   init.signal.addEventListener('abort',stop,{once:true});rewriteStarted();if(init.signal.aborted)stop();
  });
  return new Response(new ReadableStream({start(controller){
   const stop=()=>{rewriteActive--;aborted++;controller.error(init.signal.reason)};
   init.signal.addEventListener('abort',stop,{once:true});rewriteStarted();if(init.signal.aborted)stop();
  }}),{headers:{'content-type':'application/json'}});
 }
 if(mode==='slow' || (mode==='verification' && url.pathname.endsWith('/ask') && body.prompt?.user?.includes('Recovery instructions:'))){
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{init?.signal?.removeEventListener('abort',stop);resolve()},mode==='slow'?1000:3000);
   const stop=()=>{clearTimeout(timer);aborted++;reject(init.signal.reason)};
   init?.signal?.addEventListener('abort',stop,{once:true});
   if(init?.signal?.aborted)stop();
  });
 }
 if(url.pathname.endsWith('/catalog')){
  if(!validCatalogueRequest(body))return Response.json({error:'Invalid catalogue schema'},{status:422});
  if(mode==='failing' || mode==='failing-model')return Response.json({error:'Fixture catalogue failure'},{status:500});
  if(body.faceted?.[0]==='/origin.collaborators')return Response.json({fulltext:{total:10,facets:{'/origin.collaborators':{'/origin.collaborators/David Pocock':10}}}});
  const chunk=speeches.slice(body.page_number*body.page_size,(body.page_number+1)*body.page_size);
  return Response.json({fulltext:{total:speeches.length,facets:{'/classification.labels/topic':Object.fromEntries(Object.entries(catalogueCounts).map(([slug,n])=>['/classification.labels/topic/'+slug,n]))}},resources:Object.fromEntries(chunk.map(s=>[s.resource,resource(s)]))});
 }
 if(url.pathname.endsWith('/find')){
  const theme=themes.find(([,name])=>name===body.query)?.[0];const rows=speeches.filter(s=>s.topics.includes(theme)).slice(0,2);
  return Response.json({resources:Object.fromEntries(rows.map(s=>[s.resource,resource(s)])),best_matches:rows.map(s=>({resource:s.resource}))});
 }
 const original=/\/slug\/(speech-\d+)$/.exec(url.pathname);
 if(original)return Response.json(resource(speeches.find(s=>s.slug===original[1])));
 if(url.pathname.endsWith('/ask')){
  if(mode==='failing-model')return Response.json({error:'Fixture generation failure'},{status:500});
  const reply=body.extra_context?.[0]?.includes('speech topic counts') ? stubModel(body) : {
   answer:'The retrieved speech called for parliamentary scrutiny.[^1]\n\n[^1]: block-F1',citation_footnote_to_context:{'block-F1':'fallback/t/body/0-100'},retrieval_results:{resources:{fallback:{slug:'speech-90000',title:'Fixture parliamentary speech',fields:{body:{paragraphs:{'fallback/t/body/0-100':{text:'The retrieved speech called for parliamentary scrutiny.',score:1,score_type:'RERANKER'}}}}}}},
  };
  if(mode==='verification')reply.answer=reply.answer.replace('indexed speeches','indexed speeches. He said "This unsupported wording is absent from the original" in the record of');
  // The provider can return its ordinary ranked background as well as the
  // pack. It must not become an overview source or validate a speaking turn.
  reply.retrieval_results.resources.background={slug:'speech-99999',title:'Other indexed speaker',origin:{collaborators:['Other Member']},fields:{body:{paragraphs:{'background/t/body/0-100':{text:'An unrelated reply from another indexed speaker.',score:1,score_type:'RERANKER'}}}}};
  if(init.headers?.['x-synchronous']==='true')return Response.json(reply);
  return new Response([
   {type:'answer',text:reply.answer},
   {type:'retrieval',results:reply.retrieval_results},
   {type:'footnote_citations',footnote_to_context:reply.citation_footnote_to_context},
   {type:'status',code:'0',status:'success'},
  ].map(item=>JSON.stringify({item})).join('\n')+'\n',{headers:{'content-type':'application/x-ndjson'}});
 }
 throw new Error('Unexpected offline stub route');
};
const modelCalls=()=>calls.filter(c=>c.path.endsWith('/ask') && c.body.generate_answer!==false);
const post=(path,question=`What has ${speaker} said in parliament?`,signal)=>harness.fetch(path,{method:'POST',signal,headers:{'content-type':'application/json'},body:JSON.stringify({question})});

test('the first overview answer retains preset, caps, citations and required prose shape with a stub model',async()=>{
 const response=await post('/api/ask');assert.equal(response.status,200);const data=await response.json();
 assert.equal(data.is_overview_intent,true);assert.equal(data.subject_context.name,speaker);assert.equal(data.subject_context.speeches,1649);assert.equal(data.followups.length,4);
 assert.match(data.answer,/five recurring themes/);assert.match(data.answer,/Recent speeches and bills/);assert.match(data.answer,/9 October 2026/);assert.match(data.answer,/In his words/);assert.equal(data.answer.split('\n').filter(line=>line.startsWith('> ')).length,2);
 assert.ok(!data.answer.includes('From their speeches'));assert.ok(!data.answer.includes('later reply'));assert.ok(!data.answer.includes('[^'));
 assert.ok(!data.sources.some(s=>s.slug==='speech-99999'));
 for(const [id,ranges] of Object.entries(data.citations)){
  assert.ok(data.sources.some(s=>s.resource===id&&s.cited));for(const [start,end] of ranges)assert.ok(start>=0&&end<=Array.from(data.answer).length);
 }
 const asks=modelCalls();assert.equal(asks.length,1);const body=asks[0].body;
 assert.equal(body.generative_model,'openai-compatible');assert.equal(body.max_tokens,1800);assert.equal(body.citations,'llm_footnotes');assert.equal(body.answer_json_schema,undefined);
 assert.match(body.prompt.user,/aggregate evidence pack/);assert.ok(body.extra_context.join('').length<24000);assert.ok(calls.filter(c=>c.path.endsWith('/catalog')).length<=11);assert.equal(calls.filter(c=>c.path.endsWith('/find')).length,5);
 for(const call of calls.filter(c=>c.path.endsWith('/find'))){assert.deepEqual(call.body.features,['keyword']);assert.equal(call.body.reranker,'noop');assert.match(JSON.stringify(call.body.filter_expression),/"prop":"field"/)}
 assert.ok(calls.filter(c=>c.path.endsWith('/catalog')).every(c=>validCatalogueRequest(c.body)));
});

test('streamed overviews verify before display and have the same finished payload',async()=>{
 const sync=await (await post('/api/ask')).json();const response=await post('/api/ask?stream=1');assert.equal(response.status,200);
 const stream=await response.text();assert.ok(!stream.includes('event: delta'));
 const done=stream.split('\n\n').find(block=>block.startsWith('event: done'));
 assert.ok(done,stream);const data=JSON.parse(done.split('\ndata: ')[1]);assert.deepEqual(data,sync);
});

test('all overview candidate phrasings pass roster loading, scope resolution and actual Worker routing',async()=>{
 for(const question of [`${speaker}'s speeches`,`${speaker}'s positions`,`What has ${speaker} talked about?`]){
  const data=await (await post('/api/ask',question)).json();assert.equal(data.is_overview_intent,true,question);assert.equal(data.subject_context.name,speaker,question);
 }
});

test('the catalogue stub rejects forbidden field predicates with 422',async()=>{
 const response=await fetch('https://offline.rag.progress.cloud/catalog',{method:'POST',body:JSON.stringify({page_size:200,filter_expression:{resource:{and:[{prop:'label',labelset:'kind',label:'speech'},{not:{prop:'field',type:'generic'}}]}}})});
 assert.equal(response.status,422);
});

for(const scenario of ['slow','failing'])test(`${scenario} retrieval sends SSE immediately and still answers through ordinary Ask`,async()=>{
 mode=scenario;harness.env.CACHE_EPOCH='offline-'+scenario;calls.length=0;aborted=0;
 const start=performance.now();const response=await post('/api/ask?stream=1');assert.equal(response.status,200);
 const reader=response.body.getReader();let text=new TextDecoder().decode((await reader.read()).value);const firstByte=performance.now()-start;
 assert.match(text,/event: status/);assert.ok(firstByte<1000,`first byte ${firstByte}ms`);
 for(;;){const part=await reader.read();if(part.done)break;text+=new TextDecoder().decode(part.value)}
 const elapsed=performance.now()-start;const done=text.split('\n\n').find(block=>block.startsWith('event: done'));
 assert.ok(done,'fallback must finish with an answer');const data=JSON.parse(done.split('\ndata: ')[1]);assert.match(data.answer,/retrieved speech/);assert.equal(data.is_overview_intent,true);
 assert.equal(modelCalls().length,1);assert.ok(!text.includes('event: error'));
 if(scenario==='slow'){assert.ok(aborted>0,'deadline must cancel outstanding fetches');assert.ok(elapsed<6500,`answer ${elapsed}ms`)}else assert.ok(elapsed<1000,`answer ${elapsed}ms`);
 timings.push({scenario,first_byte_ms:Math.round(firstByte),answer_ms:Math.round(elapsed),cancelled_calls:aborted});
 mode='fast';
});

test('a slow verification recovery is cancelled within its two-second first-answer allowance',async()=>{
 mode='verification';harness.env.CACHE_EPOCH='offline-verification';calls.length=0;aborted=0;
 const start=performance.now();const response=await post('/api/ask?stream=1');const text=await response.text();const elapsed=performance.now()-start;
 const done=text.split('\n\n').find(block=>block.startsWith('event: done'));assert.ok(done);const data=JSON.parse(done.split('\ndata: ')[1]);
 assert.ok(elapsed<3000,`verification ${elapsed}ms`);assert.equal(aborted,1);assert.equal(modelCalls().length,2);
 assert.ok(!data.answer.includes('"This unsupported wording'));assert.ok(Object.keys(data.citations).length>0);assert.ok(!text.includes('event: delta'));
 timings.push({scenario:'verification',answer_ms:Math.round(elapsed),cancelled_calls:aborted});mode='fast';
});

test('latest-speech fallback holds model deltas for the final privacy check',async()=>{
 mode='failing';harness.env.CACHE_EPOCH='offline-recent-fallback';calls.length=0;
 const text=await (await post('/api/ask?stream=1',`What did ${speaker} say in their most recent parliamentary speech?`)).text();
 const done=text.split('\n\n').find(block=>block.startsWith('event: done'));assert.ok(done);
 assert.equal(JSON.parse(done.split('\ndata: ')[1]).is_overview_intent,false);assert.ok(!text.includes('event: delta'));
 assert.match(modelCalls()[0].body.prompt.user,/Speech metadata is incomplete or unavailable.*Do not claim any speech is the latest or give rolling-year counts/);
 assert.equal(modelCalls().length,1);mode='fast';
});

test('generation failures are final so the browser cannot restart the first-answer budget',async()=>{
 mode='failing-model';harness.env.CACHE_EPOCH='offline-model-failure';calls.length=0;
 const text=await (await post('/api/ask?stream=1')).text();
 const error=text.split('\n\n').find(block=>block.startsWith('event: error'));assert.ok(error);
 assert.equal(JSON.parse(error.split('\ndata: ')[1]).final,true);assert.equal(modelCalls().length,2);mode='fast';
});

test('leaving the overview stream cancels retrieval and never starts generation',async()=>{
 mode='slow';harness.env.CACHE_EPOCH='offline-client-cancel';calls.length=0;aborted=0;
 const response=await post('/api/ask?stream=1');const reader=response.body.getReader();await reader.read();
 await new Promise(resolve=>setTimeout(resolve,30));await reader.cancel();await new Promise(resolve=>setTimeout(resolve,30));
 assert.ok(aborted>0);assert.equal(modelCalls().length,0);mode='fast';
});

for(const stage of ['fetch','body'])test(`leaving an overview aborts a hanging rewrite ${stage} before retrieval`,async()=>{
 mode='rewrite-'+stage;harness.env.CACHE_EPOCH='offline-rewrite-'+stage;calls.length=0;aborted=0;rewriteActive=0;
 const started=new Promise(resolve=>{rewriteStarted=resolve});
 const response=await harness.fetch('/api/ask?stream=1',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:`What has ${speaker} said in parliament?`,context:[{author:'reader',text:'What subjects were discussed?'},{author:'answer',text:'The record includes speeches on parliamentary scrutiny.'}]})});
 const reader=response.body.getReader();assert.match(new TextDecoder().decode((await reader.read()).value),/event: status/);
 await started;assert.equal(rewriteActive,1);await reader.cancel();await new Promise(resolve=>setTimeout(resolve,30));
 assert.equal(rewriteActive,0);assert.equal(aborted,1);assert.equal(modelCalls().length,1);assert.equal(calls.length,2);assert.ok(calls.every(c=>c.path.endsWith('/ask')));
 timings.push({scenario:'cancelled-rewrite-'+stage,active_calls:rewriteActive,aborted_calls:aborted});mode='fast';
});

test.after(async()=>{
 const {mkdir,writeFile}=await import('node:fs/promises');const output=new URL('../private/ask-first-answer/',import.meta.url);await mkdir(output,{recursive:true});await writeFile(new URL('review-timings.json',output),JSON.stringify(timings,null,2));
});

test.after(()=>restore());
