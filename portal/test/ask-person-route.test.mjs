import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorker,offline} from './worker-harness.mjs';
import {speaker,themes,speeches,bills,catalogueCounts,resource,stubModel} from './fixtures/ask-person.mjs';

// The actual Worker, local exports, stubbed catalogue/retrieval/originals/model.
// Unknown outbound destinations or routes fail closed.
const restore=offline();
const calls=[];
const harness=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,new URL('../public/',import.meta.url).pathname);
const diskAssets=harness.env.ASSETS;
harness.env.ASSETS={async fetch(req){if(new URL(req.url).pathname.startsWith('/growth/person-bills/'))return Response.json({bills});return diskAssets.fetch(req)}};
globalThis.fetch=async (input,init)=>{
 const url=new URL(input);const body=init?.body?JSON.parse(init.body):{};calls.push({path:url.pathname,body});
 assert.ok(url.hostname.startsWith('offline.'),'only the offline knowledge-box stub may be addressed');
 if(url.pathname.endsWith('/catalog')){
  if(body.faceted?.[0]==='/origin.collaborators')return Response.json({fulltext:{total:10,facets:{'/origin.collaborators':{'/origin.collaborators/David Pocock':10}}}});
  const chunk=speeches.slice(body.page_number*200,(body.page_number+1)*200);
  return Response.json({fulltext:{total:speeches.length,facets:{'/classification.labels/topic':Object.fromEntries(Object.entries(catalogueCounts).map(([slug,n])=>['/classification.labels/topic/'+slug,n]))}},resources:Object.fromEntries(chunk.map(s=>[s.resource,resource(s)]))});
 }
 if(url.pathname.endsWith('/find')){
  const theme=themes.find(([,name])=>name===body.query)?.[0];const rows=speeches.filter(s=>s.topics.includes(theme)).slice(0,2);
  return Response.json({resources:Object.fromEntries(rows.map(s=>[s.resource,resource(s)])),best_matches:rows.map(s=>({resource:s.resource}))});
 }
 const original=/\/slug\/(speech-\d+)$/.exec(url.pathname);
 if(original)return Response.json(resource(speeches.find(s=>s.slug===original[1])));
 if(url.pathname.endsWith('/ask')){
  const reply=stubModel(body);
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
const post=path=>harness.fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:`What has ${speaker} said in parliament?`})});

test('the first overview answer retains preset, caps, citations and required prose shape with a stub model',async()=>{
 const response=await post('/api/ask');assert.equal(response.status,200);const data=await response.json();
 assert.equal(data.is_overview_intent,true);assert.equal(data.subject_context.name,speaker);assert.equal(data.subject_context.speeches,1649);assert.equal(data.followups.length,4);
 assert.match(data.answer,/five recurring themes/);assert.match(data.answer,/Recent speeches and bills/);assert.match(data.answer,/9 October 2026/);assert.match(data.answer,/In his words/);assert.equal(data.answer.split('\n').filter(line=>line.startsWith('> ')).length,2);
 assert.ok(!data.answer.includes('From their speeches'));assert.ok(!data.answer.includes('later reply'));assert.ok(!data.answer.includes('[^'));
 assert.ok(!data.sources.some(s=>s.slug==='speech-99999'));
 for(const [id,ranges] of Object.entries(data.citations)){
  assert.ok(data.sources.some(s=>s.resource===id&&s.cited));for(const [start,end] of ranges)assert.ok(start>=0&&end<=Array.from(data.answer).length);
 }
 const asks=calls.filter(c=>c.path.endsWith('/ask'));assert.equal(asks.length,1);const body=asks[0].body;
 assert.equal(body.generative_model,'openai-compatible');assert.equal(body.max_tokens,1800);assert.equal(body.citations,'llm_footnotes');assert.equal(body.answer_json_schema,undefined);
 assert.match(body.prompt.user,/aggregate evidence pack/);assert.ok(body.extra_context.join('').length<24000);assert.ok(calls.filter(c=>c.path.endsWith('/catalog')).length<=21);assert.equal(calls.filter(c=>c.path.endsWith('/find')).length,5);
});

test('streamed overviews verify before display and have the same finished payload',async()=>{
 const sync=await (await post('/api/ask')).json();const response=await post('/api/ask?stream=1');assert.equal(response.status,200);
 const stream=await response.text();assert.ok(!stream.includes('event: delta'));
 const done=stream.split('\n\n').find(block=>block.startsWith('event: done'));
 assert.ok(done,stream);const data=JSON.parse(done.split('\ndata: ')[1]);assert.deepEqual(data,sync);
});

test.after(()=>restore());
