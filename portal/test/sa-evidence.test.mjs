import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {build} from 'esbuild';
import {saEvidenceText,saEvidenceRecord,saGenerationContext,saGenerationResponse,saConversationInput} from './sa-evidence-harness.mjs';
import {saEventPayload,saPublicResponse} from '../src/sa-hansard.ts';
import {SA_EXCERPT_LABEL,isSaHansard} from '../public/sa-hansard.js';

const {sa,nonSA}=JSON.parse(readFileSync(new URL('./fixtures/sa-excerpts.json',import.meta.url)));
const cap=text=>assert.ok(String(text).trim().split(/\s+/).length<=120);
const id='r1/t/body/0-100',next='r1/t/body/100-200';
const resource={...sa,fields:{'t/body':{paragraphs:{[id]:{text:sa.text},[next]:{text:sa.text.split('. ').slice(15).join('. ')}}}}};
const retrieval=()=>({retrieval_results:{resources:{r1:resource,federal:{...nonSA[0],fields:{'t/body':{paragraphs:{'federal/t/body/0-1':{text:nonSA[0].text}}}}}}},augmented_context:{paragraphs:{[next]:{id:next,text:sa.text}}},predict_request:{query_context:{[id]:sa.text+'\nDOCUMENT CLASSIFICATION LABELS:\nsource: sa_hansard',[next]:sa.text,'federal/t/body/0-1':nonSA[0].text}}});
const bytes=item=>new TextEncoder().encode(JSON.stringify({chunk:item})+'\n');

test('SA retrieved, neighbouring, debug and prior-record evidence is bounded before the model; originals remain complete',()=>{
  const input=retrieval(),before=JSON.stringify(input);
  const body={query:'statement 30',citations:'llm_footnotes',generative_model:'fixture-model',generative_model_seed:42,answer_json_schema:{type:'object'},extra_context:[JSON.stringify({...sa,record:sa.text})],chat_history:[{author:'NUCLIA',text:sa.text}]};
  const prepared=saGenerationContext(body,input,'false');
  assert.equal(prepared.hasSa,true);assert.equal(JSON.stringify(input),before);
  const context=prepared.request.query_context;
  for(const key of [id,next]) {cap(context[key]);assert.match(context[key],/statement 30/);assert.doesNotMatch(context[key],/CLASSIFICATION LABELS/);}
  assert.equal(context[id],context[next],'one excerpt per record, including neighbours');
  const prior=JSON.parse(context.USER_CONTEXT_0);cap(prior.record);cap(prior.text);
  cap(prepared.request.chat_history[0].text);
  assert.equal(context['federal/t/body/0-1'],nonSA[0].text);
  for(const para of Object.values(prepared.retrieval.resources.r1.fields['t/body'].paragraphs))cap(para.text);
  assert.equal(prepared.request.generative_model,'fixture-model');assert.equal(prepared.request.seed,42);assert.deepEqual(prepared.request.json_schema,{type:'object'});
  assert.equal(saGenerationContext(body,input,'true').request.query_context[id],input.predict_request.query_context[id]);
});

test('prior-resource retrieval cannot erase main SA classification or matching paragraphs',()=>{
  const found=retrieval();delete found.predict_request;
  const prior='r1/t/body/200-300';
  found.prequeries={prior:{resources:{r1:{slug:sa.slug,fields:{'t/body':{paragraphs:{[prior]:{text:sa.text}}}}}}}};
  const bounded=saGenerationContext({query:'statement 30'},found,'false');
  assert.equal(bounded.hasSa,true);assert.deepEqual(bounded.retrieval.resources.r1.labels,sa.labels);
  for(const key of [id,next,prior]) {cap(bounded.request.query_context[key]);assert.equal(bounded.request.query_context[key],bounded.request.query_context[id]);}
});

test('metadata-based evidence cap covers inline sources and legacy follow-up passages and bypasses non-SA or permission',()=>{
  for(const record of [sa,{kind:'speech',source:'sa_hansard'}, {usermetadata:{classifications:[{labelset:'source',label:'sa_hansard'}]}}]) {
    const result=saEvidenceRecord({...record,source_url:sa.url,text:sa.text,snippet:sa.text,evidence:[sa.text,sa.text]},'false','statement 30');cap(result.text);cap(result.snippet);cap(result.evidence.join(' '));assert.match(result.text,/statement 30/);
  }
  cap(saEvidenceText({},sa.text,'false','',true));
  assert.equal(saEvidenceText(sa,sa.text,'true'),sa.text);
  assert.equal(saEvidenceText({kind:'speech',state:'sa'},sa.text,'false'),'');
  for(const doc of nonSA)assert.equal(saEvidenceRecord(doc,'false'),doc);
});

test('conversation rewrite and later generation receive bounded SA or legacy assistant passages, with non-SA turns unchanged',()=>{
  const input={question:'anything else?',context:[{author:'user',text:'Regional infrastructure?'},{author:'answer',text:sa.text,sources:[sa]},{author:'answer',text:sa.text},{author:'answer',text:nonSA[0].text,sources:[nonSA[0]]}]};
  const bounded=saConversationInput(input,'false');
  cap(bounded.context[1].text);cap(bounded.context[2].text);
  assert.equal(bounded.context[0],input.context[0]);assert.equal(bounded.context[3],input.context[3]);assert.equal(input.context[1].text,sa.text);
  assert.equal(saConversationInput(input,'true'),input);
});

test('SA retrieval disables generation then supplies capped explicit context to Predict; model chunks arrive before EOF',async()=>{
  const calls=[];let upstream;
  const response=await saGenerationResponse({query:'statement 30',citations:'llm_footnotes'},'false',async(path,body,stream)=>{
    calls.push({path,body,stream});
    if(path==='/ask')return Response.json(retrieval());
    for(const [key,text] of Object.entries(body.query_context))if(key.startsWith('r1/'))cap(text);
    return new Response(new ReadableStream({start(c){upstream=c;c.enqueue(bytes({type:'text',text:'The first words. '}));}}));
  },true);
  assert.equal(calls[0].body.generate_answer,false);assert.equal(calls[0].stream,false);
  assert.equal(calls[1].path,'/predict/chat');assert.equal(calls[1].stream,true);
  const reader=response.body.getReader(),decoder=new TextDecoder();
  const first=decoder.decode((await reader.read()).value);
  assert.equal(JSON.parse(first).item.text,'The first words. ');assert.equal(JSON.parse(first).item.type,'answer');
  upstream.enqueue(bytes({type:'text',text:'The remaining words.'}));upstream.enqueue(bytes({type:'footnote_citations',footnote_to_context:{'block-AA':id}}));upstream.close();
  let tail='';for(;;){const r=await reader.read();if(r.done)break;tail+=decoder.decode(r.value);}
  const items=tail.trim().split('\n').map(line=>JSON.parse(line).item);
  cap(items.find(i=>i.type==='retrieval').results.resources.r1.fields['t/body'].paragraphs[id].text);
  assert.equal(items.find(i=>i.type==='footnote_citations').footnote_to_context['block-AA'],id);
});

test('non-SA uses the original Ask body and response, permission skips the preflight, and sync SA citations survive',async()=>{
  const body={query:'public services',prompt:{system:'Research',user:'{context}\n{question}'}};
  for(const flag of ['false','true']) {
    const calls=[],original=new Response('original bytes',{headers:{'cache-control':'public, max-age=60'}});
    const result=await saGenerationResponse(body,flag,async(path,payload,stream)=>{
      calls.push({path,payload,stream});
      return payload.generate_answer===false?Response.json({retrieval_results:{resources:{r2:nonSA[0]}}}):original;
    },true);
    assert.equal(result,original);assert.equal(calls.at(-1).payload,body);assert.equal(calls.at(-1).path,'/ask');assert.equal(calls.length,flag==='true'?1:2);
  }
  const result=await saGenerationResponse(body,'false',async path=>path==='/ask'?Response.json(retrieval()):new Response(new TextEncoder().encode([{type:'text',text:'A generated explanation.'},{type:'citations',citations:{[id]:[[0,24]]}},{type:'footnote_citations',footnote_to_context:{'block-AA':id}},{type:'status',code:'0'}].map(chunk=>JSON.stringify({chunk})).join('\n'))),false);
  const payload=await result.json();assert.equal(payload.answer,'A generated explanation.');assert.deepEqual(payload.citations,{[id]:[[0,24]]});assert.equal(payload.citation_footnote_to_context['block-AA'],id);cap(payload.retrieval_results.resources.r1.fields['t/body'].paragraphs[id].text);
});

// Exercise the actual Ask SSE emitter. The producer cannot finish until the
// reader has observed a delta; this checks ordering without timing sleeps.
const source=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
const emitter=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='apiAskStream').getText(ast);
const headers={'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache','connection':'keep-alive'};
async function streamFixture(sources, code=emitter) {
  let release;const barrier=new Promise(resolve=>{release=resolve});const pending=[];
  const payload={answer:'A progressive answer. Another sentence.',sources,citations:sources.length?{[id]:[[0,21]]}:{}};
  const emit=runInNewContext(ts.transpile(code)+';apiAskStream',{
    Response,TransformStream,TextEncoder,AbortController,Date,SSE_HEADERS:headers,ASK_STALL_MS:1000,ASK_RETRY_BUDGET_MS:1000,
    saSendData:(event,data)=>saEventPayload(event,data,'false',async()=>sa),isPositionBody:()=>false,
    streamAskGuarded:async(_env,_body,send)=>{await send('status',{phase:'writing'});await send('delta',{text:'A progressive answer. '});await barrier;await send('delta',{text:'Another sentence.'});return {answer:payload.answer};},
    isRefusal:()=>false,guardPositionAnswer:r=>r,askPayload:()=>payload,loadPeople:async()=>null,hasUnsupportedQuotes:()=>false,looseAnswer:p=>p,withAskedAs:p=>p,
  });
  const response=await saPublicResponse(emit({},{SA_HANSARD_FULL_TEXT:'false'},{waitUntil:p=>pending.push(p)},{cacheStatus:'MISS',records:{}}),'false',async()=>sa);
  assert.deepEqual([...response.headers],[...new Headers({...headers,'x-opax-cache':'MISS'})]);
  const started=performance.now(),reader=response.body.getReader(),decoder=new TextDecoder();let text='';
  while(!text.includes('event: delta'))text+=decoder.decode((await reader.read()).value);
  const firstDeltaMs=performance.now()-started;
  assert.doesNotMatch(text,/event: done/);release();
  for(;;){const r=await reader.read();if(r.done)break;text+=decoder.decode(r.value);}
  const doneMs=performance.now()-started;
  await Promise.all(pending);return {text,payload,trace:{stubbed:true,firstDeltaMs,doneMs,donePresentAtFirstDelta:false,events:text.split('\n\n').filter(Boolean).map(block=>/^event: (\w+)/.exec(block)[1])}};
}
test('non-SA Ask streams progressively with main SSE bytes and unchanged cache headers',async()=>{
  const {text,payload,trace}=await streamFixture([]);
  // Baseline bytes from the unchanged main emitter, including whitespace.
  assert.equal(text,'event: status\ndata: {"phase":"searching"}\n\nevent: status\ndata: {"phase":"writing"}\n\nevent: delta\ndata: {"text":"A progressive answer. "}\n\nevent: delta\ndata: {"text":"Another sentence."}\n\nevent: done\ndata: '+JSON.stringify(payload)+'\n\n');
  if(process.env.SA_MAIN_BASELINE) {
    const baseline=ts.createSourceFile('main.ts',readFileSync(process.env.SA_MAIN_BASELINE,'utf8'),ts.ScriptTarget.Latest,true);
    const main=baseline.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='apiAskStream').getText(baseline);
    assert.equal(text,(await streamFixture([],main)).text,'byte for byte against the main emitter');
    trace.byteIdenticalToMain=true;trace.mainSha=process.env.SA_MAIN_SHA;
  }
  if(process.env.SA_STREAM_TRACE)writeFileSync(process.env.SA_STREAM_TRACE,JSON.stringify(trace,null,2)+'\n');
});
test('SA Ask also streams before done; the final citation carries the excerpt notice and official URL',async()=>{
  const {text}=await streamFixture([{...sa,resource:'r1',snippet:sa.text}]);
  const done=JSON.parse(text.split('event: done\ndata: ')[1]);cap(done.sources[0].snippet);cap(done.sources[0].text);assert.equal(done.sources[0].excerpt_label,SA_EXCERPT_LABEL);assert.equal(done.sources[0].source_url,sa.url);
});

test('follow-up prompts cap both SA evidence and legacy copied answers before generation',async()=>{
  const names=new Set(['apiFollowups','passageContext','clipText']);
  const code=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)).map(n=>n.getText(ast)).join('\n');
  let request;
  const followups=runInNewContext(ts.transpile(code)+';apiFollowups',{
    saEvidenceRecord,saEvidenceText,isSaHansard,Response,URL,AbortSignal,
    FOLLOWUP_MIN_CONTEXT:200,FOLLOWUP_WANT:3,FOLLOWUP_ANSWER_BUDGET:2500,FOLLOWUP_PASSAGE_BUDGET:6000,
    json:Response.json,questionNamesWithheldDonor:async()=>false,cacheRequest:()=>new Request('https://cache.test/followup'),sha256Hex:async()=>'',cacheBypass:()=>true,rateLimited:async()=>null,
    withCacheStatus:r=>r,kbFetch:async(_env,_path,init)=>{request=init.body;return Response.json({answer:''});},parseFollowUpLines:()=>[],selectFollowUps:()=>[],
  });
  const req=()=>new Request('https://opax.test/api/followups',{method:'POST',body:JSON.stringify({question:'statement 30',answer:sa.text,passages:[null,{...sa,title:'SA record',text:sa.text}]})});
  await followups(req(),{SA_HANSARD_FULL_TEXT:'false'},{});
  const prompt=request.query;
  cap(prompt.split('ANSWER ALREADY GIVEN (do not ask for anything it already states):\n')[1].split('\n\n--- RETRIEVED')[0]);
  const evidence=prompt.split('--- RETRIEVED PASSAGES (the only source a follow-up may draw on) ---\n')[1].split('\n--- END RETRIEVED')[0].replace(/^SA record: /,'');
  cap(evidence);assert.match(evidence,/statement 30/);assert.doesNotMatch(evidence,/statement 0\./);
  await followups(req(),{SA_HANSARD_FULL_TEXT:'true'},{});assert.ok(request.query.includes('statement 0.'));
});

test('the shared KB call retrieves without generation and caps SA before the authenticated streaming model request',async()=>{
  const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='kbFetch').getText(ast);
  const calls=[];
  const kb=runInNewContext(ts.transpile(fn)+';kbFetch',{
    saGenerationResponse,modelBudgetSpent:async()=>false,ragBase:()=> 'https://fixture.test/kb',
    fetch:async(url,init)=>{calls.push({url,...init,body:JSON.parse(init.body)});return url.endsWith('/ask')?Response.json(retrieval()):new Response(bytes({type:'text',text:'Generated words.'}));},
  });
  const response=await kb({SA_HANSARD_FULL_TEXT:'false',ARAG_KB_TOKEN:'fixture'},'/ask',{body:{query:'statement 30'},headers:{accept:'application/x-ndjson'}});
  await response.text();assert.equal(calls.length,2);
  assert.equal(calls[0].body.generate_answer,false);assert.equal(calls[0].headers['x-synchronous'],'true');
  assert.equal(calls[1].url,'https://fixture.test/kb/predict/chat');assert.equal(calls[1].headers.accept,'application/x-ndjson');assert.equal(calls[1].headers['x-synchronous'],undefined);
  assert.equal(calls[1].headers['x-nuclia-serviceaccount'],'Bearer fixture');
  cap(calls[1].body.query_context[id]);assert.equal(calls[1].method,'POST');
});

test('voice and MCP tool evidence contains only the protected SA excerpt before an external answer can use it',async()=>{
  const voice=await build({entryPoints:[new URL('../src/voice-tools.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
  const {runVoiceTool}=await import('data:text/javascript;base64,'+Buffer.from(voice.outputFiles[0].text).toString('base64'));
  const read=async()=>saPublicResponse(Response.json(sa),'false',async()=>sa);
  const result=await runVoiceTool('read_record',{slug:sa.slug},{COMMUNITY_ORIGIN:'https://opax.test'},read);
  cap(result.data.text);assert.equal(result.data.excerpt_label,SA_EXCERPT_LABEL);assert.equal(result.data.source_url,sa.url);
  // Run the actual MCP result builder directly, with auth/transport stubbed.
  const mcp=ts.createSourceFile('community-mcp.ts',readFileSync(new URL('../src/community-mcp.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
  let builder;const visit=node=>{if(ts.isFunctionDeclaration(node)&&node.name?.text==='result')builder=node.getText(mcp);ts.forEachChild(node,visit);};visit(mcp);
  const tool=runInNewContext(ts.transpile(builder)+';result',{readPublic:read,env:{COMMUNITY_ORIGIN:'https://opax.test'},Uint8Array,TextDecoder});
  const output=await tool('/api/resource/'+sa.slug),record=JSON.parse(output.content[0].text);
  cap(record.text);assert.equal(record.excerpt_label,SA_EXCERPT_LABEL);assert.equal(record.source_url,sa.url);
});
