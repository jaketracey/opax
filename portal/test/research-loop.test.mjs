import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {MockLanguageModelV4} from 'ai/test';
const built=await build({stdin:{contents:"export * from './src/agentic-ask';export * from './src/agentic-response';export * from './src/research-loop';export * from './src/research-types';export * from './src/research-evidence';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']});
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const call=(name,args,id='fixture')=>({type:'tool-call',toolName:name,toolCallId:id,input:typeof args==='string'?args:JSON.stringify(args)});
const reply=(calls,input=10,output=5)=>({content:calls,finishReason:{unified:'tool-calls',raw:'tool_calls'},usage:{inputTokens:{total:input,noCache:input,cacheRead:0,cacheWrite:0},outputTokens:{total:output,text:output,reasoning:0}},warnings:[]});
const question='Who speaks most about gambling in NSW across the whole record?',args={topic:'gambling',state:'nsw',group_by:'speaker'},plan={shape:'ranking',steps:[{tool:'count_speeches',args}]},emptyScope={people:[],parties:[],bills:[],ambiguous:false,unresolved:false};
const model=responses=>new MockLanguageModelV4({doGenerate:responses});
function fixtures(m,options={}) {
 let plannerCalls=0,lookups=0,turns=0;const events=[],failures=[];
 const deps={signal:options.signal,asset:async()=>null,kb:async()=>{lookups++;return {fulltext:{total:100,facets:{'/u/o':{'/u/o/Taylor Example':87,'/u/o/Pat Example':13}}}}},generate:async()=>{plannerCalls++;return {text:JSON.stringify(plan),tokens:{input:3,output:2}}},research:api.createResearch({model:m,modelBudgetSpent:async()=>{turns++;return options.refuseAt===turns},...options}),onResearchFailure:async e=>failures.push(e)};
 return {deps,events,failures,run:()=>api.runAgentic(question,deps,async(e,d)=>events.push(d),40_000,api.inferPeriod(question),{},emptyScope),get plannerCalls(){return plannerCalls},get lookups(){return lookups},get turns(){return turns}};
}
test('multi-round happy path, finish maps selected facts to templates and matching step events',async()=>{
 const m=model([reply([call('count_speeches',args,'a')]),reply([call('count_speeches',{...args,limit:1},'b')]),reply([call('finish',{facts:[3]},'c')])]),f=fixtures(m),run=await f.run(),body=api.agenticAskPayload(run,question);
 assert.equal(run.answered,true);assert.equal(run.answer_source,'template');assert.equal(f.plannerCalls,0);assert.equal(f.turns,3);assert.deepEqual(run.chosen_facts,[3]);assert.match(body.answer,/Taylor Example: 87/);assert.doesNotMatch(body.answer,/Pat Example/);assert.equal(body.research.mode,'loop');assert.equal(body.research.rounds,3);assert.equal(body.research.sources.length,1);assert.deepEqual(run.tokens,{input:30,output:15});
 const steps=f.events.filter(x=>x.phase==='step').map(x=>x.step);assert.equal(steps.length,6);
 for(let i=0;i<steps.length;i+=2){assert.equal(steps[i].state,'running');assert.equal(steps[i+1].state,'done');assert.equal(steps[i].id,steps[i+1].id);assert.equal(typeof steps[i+1].results,'number');assert.equal(typeof steps[i+1].ms,'number');assert.equal(steps[i].round,i/2+1);}
 assert.ok(m.doGenerateCalls.every(c=>c.maxOutputTokens<=1800));
});
test('identical scoped calls dedupe despite different property order',async()=>{
 const m=model([reply([call('count_speeches',args,'a')]),reply([call('count_speeches',{group_by:'speaker',state:'nsw',topic:'gambling'},'b')]),reply([call('finish',{facts:[1]},'c')])]),f=fixtures(m),run=await f.run();
 assert.equal(run.answered,true);assert.equal(f.plannerCalls,0);assert.equal(run.steps.filter(s=>s.tool==='count_speeches').length,1);assert.equal(f.lookups,2);assert.deepEqual(m.doGenerateCalls[2].tools.map(t=>t.name),['finish','answer']);
});
test('default four turns, six hard ceiling and bounded parallel call batches',async()=>{
 assert.equal(api.researchLimits({}).rounds,4);assert.equal(api.researchLimits({steps:99}).rounds,6);
 for(const [steps,wanted] of [[undefined,4],[99,6]]){const m=model(Array.from({length:7},(_,i)=>reply([call('count_speeches',{...args,limit:i+1},String(i))]))),f=fixtures(m,{steps}),run=await f.run();assert.equal(run.research.mode,'planner');assert.equal(f.failures[0].reason,'steps');assert.equal(m.doGenerateCalls.length,wanted);assert.equal(f.plannerCalls,1);}
 const f=fixtures(model([reply(Array.from({length:8},(_,i)=>call('count_speeches',{...args,limit:i+1},String(i))))]));await f.run();assert.equal(f.failures[0].reason,'steps');assert.ok(f.lookups<=14);
});
test('wall cap races an uncooperative provider then starts the current planner',async()=>{
 const f=fixtures(model(()=>new Promise(()=>{})),{wallMs:15}),started=Date.now(),run=await f.run();assert.ok(Date.now()-started<1000);assert.equal(f.failures[0].reason,'timeout');assert.equal(run.research.mode,'planner');assert.equal(f.plannerCalls,1);
});
test('token cap refuses inference and detects reported overspend before tools',async()=>{
 const m=model([reply([call('finish',{facts:[1]})])]),f=fixtures(m,{tokens:1});await f.run();assert.equal(m.doGenerateCalls.length,0);assert.equal(f.failures[0].reason,'tokens');
 const n=model([reply([call('count_speeches',args)],64001)]),g=fixtures(n,{tokens:64000});await g.run();assert.equal(g.failures[0].reason,'tokens');assert.equal(g.lookups,2,'only fallback planner lookups');assert.equal(n.doGenerateCalls.length,1);
});
test('MODEL_LIMITER checks every turn and refuses the next provider call',async()=>{
 const m=model([reply([call('count_speeches',args)]),reply([call('finish',{facts:[1]})])]),f=fixtures(m,{refuseAt:2});await f.run();assert.equal(f.turns,2);assert.equal(m.doGenerateCalls.length,1);assert.equal(f.failures[0].reason,'limiter');assert.equal(f.plannerCalls,1);
});
test('disconnect aborts the model without a paid fallback',async()=>{
 const controller=new AbortController();let providerSignal,start;const started=new Promise(r=>start=r),m=model(options=>{providerSignal=options.abortSignal;start();return new Promise(()=>{})}),f=fixtures(m,{signal:controller.signal});const work=f.run();await started;controller.abort();await assert.rejects(work);assert.equal(providerSignal.aborted,true);assert.equal(f.plannerCalls,0);assert.equal(f.failures[0].reason,'aborted');
});
test('thrown provider errors, malformed JSON and invalid tool args fall back once',async()=>{
 for(const response of [()=>{throw Error('private upstream error')},[reply([call('count_speeches','{')])],[reply([call('count_speeches',{...args,group_by:3})])]]){const f=fixtures(model(response)),run=await f.run();assert.equal(f.plannerCalls,1);assert.equal(run.research.mode,'planner');assert.equal(run.answered,true);assert.ok(['error','malformed_args'].includes(f.failures[0].reason));assert.doesNotMatch(f.failures[0].message,/private/);}
});
test('periodPlan applies request dates before a loop lookup',async()=>{
 const f=fixtures(model([reply([call('count_speeches',{...args,since:'1990-01-01',until:'1991-01-01'})]),reply([call('finish',{facts:[1]})])])),run=await api.runAgentic(question,f.deps,async()=>{},40_000,{kind:'window',since:'2023-01-01',until:'2023-12-31',label:'2023 scope.'},{},emptyScope);assert.equal(run.steps[0].args.since,'2023-01-01');assert.equal(run.steps[0].args.until,'2023-12-31');
});
const id='a'.repeat(32)+'/t/body/0-90',text='The committee called for stronger housing affordability safeguards.',p={id,resource:id.split('/')[0],slug:'speech-1',title:'Housing debate',text,url:'https://opax.com.au/doc/speech-1',kind:'speech'},valid={text,citations:[{id,quote:text,start:0,end:Array.from(text).length}]};
function qualitativeFixture(responses){const f=fixtures(model(responses),{readRecord:async()=>({text})});f.deps.kb=async()=>({resources:{[p.resource]:{slug:p.slug,title:p.title,fields:{body:{paragraphs:{[id]:{text}}}}}}});f.run=()=>api.runAgentic('What does the record say about housing affordability?',f.deps,async(e,d)=>f.events.push(d),40_000,api.inferPeriod('housing'),{},emptyScope);return f;}
test('qualitative search/read/answer retains passage ids and ordinary source/citation fields',async()=>{
 const f=qualitativeFixture([reply([call('search',{query:'housing affordability'})]),reply([call('read_passage',{id})]),reply([call('answer',valid)])]),run=await f.run(),payload=api.agenticAskPayload(run,'housing');assert.equal(run.answered,true);assert.equal(run.answer_source,'model');assert.deepEqual(payload.citations,{[id]:[[0,text.length]]});assert.equal(payload.sources[0].resource,p.resource);assert.equal(payload.research.sources[0].url,p.url);
});
test('fabricated quote or unbound citation gets one repair then the old path',async()=>{
 for(const draft of [{text:'"Invented testimony that never occurred in this record."',citations:[{id,quote:text,start:0,end:55}]},{...valid,citations:[{...valid.citations[0],id:'unknown/t/body/0'}]}]){const f=qualitativeFixture([reply([call('search',{query:'housing'})]),reply([call('read_passage',{id})]),reply([call('answer',draft)]),reply([call('answer',draft)])]),run=await f.run();assert.equal(run.research.mode,'planner');assert.equal(f.failures[0].reason,'grounding');assert.equal(f.events.filter(e=>e.step?.tool==='answer'&&e.step.state==='error').length,2);}
});
test('a valid repair succeeds on the fourth bounded turn',async()=>{
 const f=qualitativeFixture([reply([call('search',{query:'housing'})]),reply([call('read_passage',{id})]),reply([call('answer',{...valid,citations:[{...valid.citations[0],quote:'fabricated'}]})]),reply([call('answer',valid)])]),run=await f.run();assert.equal(run.answered,true);assert.equal(run.research.mode,'loop');assert.equal(run.research.rounds,4);
});
test('quote, causation, bound ranges and position verifiers reject unsupported prose',()=>{
 const passages=new Map([[id,p]]);assert.ok(api.verifyResearchAnswer(valid,passages,'housing',emptyScope));for(const phrase of ['The donations bought votes.','"Fake short quote"','‘Fake single quote’',"'Fake ASCII quote'",'Housing costs $999.'])assert.equal(api.verifyResearchAnswer({text:phrase,citations:[{id,quote:text,start:0,end:phrase.length}]},passages,'housing',emptyScope),null);assert.equal(api.verifyResearchAnswer(valid,passages,'What was the position on defence?',emptyScope,'defence'),null);assert.equal(api.verifyResearchAnswer({...valid,text:text+' Uncited extra claim.'},passages,'housing',emptyScope),null);
});

test('numerical tool answers also work outside the old classifier',async()=>{
 const f=fixtures(model([reply([call('count_speeches',args)]),reply([call('finish',{facts:[1]})])])),q='Summarise the indexed gambling volume for NSW speakers.';
 assert.equal(api.classifyAgentic(q).shape,null);const run=await api.runAgentic(q,f.deps,async()=>{},40_000,api.inferPeriod(q),{},emptyScope);assert.equal(run.research.mode,'loop');assert.match(run.answer,/Taylor Example: 87/);assert.equal(f.plannerCalls,0);
});
