import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {MockLanguageModelV4} from 'ai/test';
const built=await build({stdin:{contents:"export * from './src/agentic-ask';export * from './src/agentic-response';export * from './src/research-loop';export * from './src/research-types';export * from './src/research-evidence';export * from './src/research-credit';export * from './src/research-response';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']});
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const call=(name,args,id='fixture')=>({type:'tool-call',toolName:name,toolCallId:id,input:typeof args==='string'?args:JSON.stringify(args)});
const reply=(calls,input=10,output=5)=>({content:calls,finishReason:{unified:'tool-calls',raw:'tool_calls'},usage:{inputTokens:{total:input,noCache:input,cacheRead:0,cacheWrite:0},outputTokens:{total:output,text:output,reasoning:0}},warnings:[]});
const question='Who speaks most about gambling in NSW across the whole record?',args={topic:'gambling',state:'nsw',group_by:'speaker'},plan={shape:'ranking',steps:[{tool:'count_speeches',args}]},emptyScope={people:[],parties:[],bills:[],ambiguous:false,unresolved:false};
const model=responses=>new MockLanguageModelV4({doGenerate:responses});
function fixtures(m,options={}) {
 let plannerCalls=0,lookups=0,turns=0;const events=[],failures=[];
 const deps={signal:options.signal,asset:async()=>null,kb:async()=>{lookups++;return {fulltext:{total:100,facets:{'/u/o':{'/u/o/Taylor Example':87,'/u/o/Pat Example':13}}}}},generate:async()=>{plannerCalls++;return {text:JSON.stringify(plan),tokens:{input:3,output:2}}},research:api.createResearch({model:m,modelBudgetSpent:async()=>{turns++;return options.refuseAt===turns},dailyBudget:{reserve:async()=>({settle:async()=>{}})},creditCooldown:api.createResearchCreditCooldown(),...options}),onResearchFailure:async e=>failures.push(e)};
 return {model:m,deps,events,failures,run:()=>api.runAgentic(question,deps,async(e,d)=>events.push(d),40_000,api.inferPeriod(question),{},emptyScope),get plannerCalls(){return plannerCalls},get lookups(){return lookups},get turns(){return turns}};
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
test('default five turns, six hard ceiling and bounded parallel call batches',async()=>{
 assert.equal(api.researchLimits({}).rounds,5);assert.equal(api.researchLimits({steps:99}).rounds,6);
 for(const [steps,wanted] of [[undefined,5],[99,6]]){const m=model(Array.from({length:7},(_,i)=>reply([call('count_speeches',{...args,limit:i+1},String(i))]))),f=fixtures(m,{steps}),run=await f.run();assert.equal(run.research.mode,'planner');assert.equal(f.failures[0].reason,'steps');assert.equal(m.doGenerateCalls.length,wanted);assert.equal(f.plannerCalls,1);}
 const f=fixtures(model([reply(Array.from({length:8},(_,i)=>call('count_speeches',{...args,limit:i+1},String(i))))]));await f.run();assert.equal(f.failures[0].reason,'steps');assert.ok(f.lookups<=14);
});
test('wall timeout skips the planner and returns to the route fallback',async()=>{
 const f=fixtures(model(()=>new Promise(()=>{})),{wallMs:15}),started=Date.now(),run=await f.run();assert.ok(Date.now()-started<1000);assert.equal(f.failures[0].reason,'timeout');assert.equal(run.research.mode,'planner');assert.equal(f.plannerCalls,0);assert.equal(run.answered,false);
});
test('token cap refuses inference and detects reported overspend before tools',async()=>{
 const m=model([reply([call('finish',{facts:[1]})])]),f=fixtures(m,{tokens:1});await f.run();assert.equal(m.doGenerateCalls.length,0);assert.equal(f.failures[0].reason,'tokens');
 const n=model([reply([call('count_speeches',args)],160001)]),g=fixtures(n,{tokens:160000});await g.run();assert.equal(g.failures[0].reason,'tokens');assert.equal(g.lookups,2,'only fallback planner lookups');assert.equal(n.doGenerateCalls.length,1);
});
test('MODEL_LIMITER checks every turn and refuses the next provider call',async()=>{
 const m=model([reply([call('count_speeches',args)]),reply([call('finish',{facts:[1]})])]),f=fixtures(m,{refuseAt:2});await f.run();assert.equal(f.turns,2);assert.equal(m.doGenerateCalls.length,1);assert.equal(f.failures[0].reason,'limiter');assert.equal(f.plannerCalls,1);
});
test('daily dollar admission refuses inference and fails closed when its ledger is unavailable',async()=>{
 for(const [reserve,reason] of [[async()=>null,'daily_budget'],[async()=>{throw Error('private D1 details')},'daily_budget_unavailable']]){
  const m=model([reply([call('count_speeches',args)])]),f=fixtures(m,{dailyBudget:{reserve}}),run=await f.run();
  assert.equal(m.doGenerateCalls.length,0);assert.equal(f.failures[0].reason,reason);assert.equal(run.research.mode,'planner');assert.equal(f.plannerCalls,1);
 }
});
test('each turn reserves remaining token cost; estimates cannot refund unknown billing',async()=>{
 const reserved=[],settled=[],m=model([reply([call('count_speeches',args)]),reply([call('finish',{facts:[1]})])]);
 const f=fixtures(m,{inputPrice:0.66,outputPrice:1.98,dailyBudget:{reserve:async amount=>{reserved.push(amount);return{settle:async actual=>settled.push(actual)}}}});
 const run=await f.run();assert.equal(run.research.mode,'loop');assert.deepEqual(reserved,[96000*10/1e6,95985*10/1e6]);assert.deepEqual(settled,[undefined,undefined]);assert.equal(run.cost_usd,2*(10*0.66+5*1.98)/1e6);
});
test('provider billing receipts allow settlement refunds and own the reported cost',async()=>{
 const settled=[],responses=[reply([call('count_speeches',args)]),reply([call('finish',{facts:[1]})])].map(r=>({...r,providerMetadata:{openrouter:{usage:{cost:0.00002}}}}));
 const f=fixtures(model(responses),{dailyBudget:{reserve:async()=>({settle:async actual=>settled.push(actual)})}}),run=await f.run();assert.deepEqual(settled,[0.00002,0.00002]);assert.equal(run.cost_usd,0.00004);
});
test('credit exhaustion falls back without retry, blocks further turns for 15 minutes, then recovers',async()=>{
 for(const failure of [Object.assign(Error('payment refused'),{statusCode:402}),Error('Your credit balance is too low'),{cause:{responseBody:JSON.stringify({error:{message:'Insufficient credits'}})}}]){
  let now=0,refund;const cooldown=api.createResearchCreditCooldown(()=>now),m=model(()=>{throw failure});
  const f=fixtures(m,{creditCooldown:cooldown,dailyBudget:{reserve:async()=>({settle:async actual=>{refund=actual}})}});
  assert.equal((await f.run()).research.mode,'planner');assert.equal(f.failures[0].reason,'research_credit_exhausted');assert.equal(m.doGenerateCalls.length,1);assert.equal(refund,0);
  await f.run();assert.equal(m.doGenerateCalls.length,1);assert.equal(f.failures[1].reason,'research_credit_exhausted');assert.equal(f.plannerCalls,2);
  now=api.RESEARCH_CREDIT_COOLDOWN_MS;await f.run();assert.equal(m.doGenerateCalls.length,2);
 }
 assert.equal(api.isResearchCreditError(Error('generic network failure')),false);
});
test('a credit refund that stalls cannot delay the planner fallback',async()=>{
 const pending=[],m=model(()=>{throw Object.assign(Error('402'),{statusCode:402})}),f=fixtures(m,{cleanup:work=>pending.push(work),dailyBudget:{reserve:async()=>({settle:()=>new Promise(()=>{})})}});
 const started=Date.now();const run=await f.run();assert.ok(Date.now()-started<1000);assert.equal(run.research.mode,'planner');assert.equal(pending.length,1);assert.equal(m.doGenerateCalls.length,1);
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
function qualitativeFixture(responses){const f=fixtures(model(responses),{readRecord:async()=>({text,speaker:'Pat Example'})});f.deps.kb=async()=>({resources:{[p.resource]:{slug:p.slug,title:p.title,fields:{body:{paragraphs:{[id]:{text}}}}}}});f.run=()=>api.runAgentic('What does the record say about housing affordability?',f.deps,async(e,d)=>f.events.push(d),40_000,api.inferPeriod('housing'),{},emptyScope);return f;}
test('qualitative search/read/answer retains passage ids and ordinary source/citation fields',async()=>{
 const f=qualitativeFixture([reply([call('search',{query:'housing affordability'})]),reply([call('read_passage',{id})]),reply([call('answer',valid)])]),run=await f.run(),payload=api.agenticAskPayload(run,'housing');assert.equal(run.answered,true);assert.equal(run.answer_source,'model');assert.deepEqual(payload.citations,{[id]:[[0,text.length]]});assert.equal(payload.sources[0].resource,p.resource);assert.equal(payload.research.sources[0].url,p.url);assert.equal(payload.research.sources[0].speaker,'Pat Example');
});
test('fabricated quote or unbound citation gets one repair then the old path',async()=>{
 for(const draft of [{text:'"Invented testimony that never occurred in this record."',citations:[{id,quote:text,start:0,end:55}]},{...valid,citations:[{...valid.citations[0],id:'unknown/t/body/0'}]}]){const f=qualitativeFixture([reply([call('search',{query:'housing'})]),reply([call('read_passage',{id})]),reply([call('answer',draft)]),reply([call('answer',draft)])]),run=await f.run();assert.equal(run.research.mode,'planner');assert.equal(f.failures[0].reason,'grounding');assert.equal(f.events.filter(e=>e.step?.tool==='answer'&&e.step.state==='failed').length,2);}
});
test('a valid repair succeeds on the fourth bounded turn',async()=>{
 const f=qualitativeFixture([reply([call('search',{query:'housing'})]),reply([call('read_passage',{id})]),reply([call('answer',{...valid,citations:[{...valid.citations[0],quote:'fabricated'}]})]),reply([call('answer',valid)])]),run=await f.run();assert.equal(run.answered,true);assert.equal(run.research.mode,'loop');assert.equal(run.research.rounds,4);
});
test('quote, causation, bound ranges and position verifiers reject unsupported prose',()=>{
 const passages=new Map([[id,p]]);assert.ok(api.verifyResearchAnswer(valid,passages,'housing',emptyScope));for(const phrase of ['The donations bought votes.','"Fake short quote"','‘Fake single quote’',"'Fake ASCII quote'",'Housing costs $999.'])assert.equal(api.verifyResearchAnswer({text:phrase,citations:[{id,quote:text,start:0,end:phrase.length}]},passages,'housing',emptyScope),null);assert.equal(api.verifyResearchAnswer(valid,passages,'What was the position on defence?',emptyScope,'defence'),null);assert.equal(api.verifyResearchAnswer({...valid,text:text+' Uncited extra claim.'},passages,'housing',emptyScope),null);
});

test('unclassified prose exposes no structured speech tools and goes straight to ordinary fallback on a misroute',async()=>{
 const f=fixtures(model([reply([call('count_speeches',args)])])),q='Summarise the indexed gambling volume for NSW speakers.';
 assert.equal(api.classifyAgentic(q).shape,null);const run=await api.runAgentic(q,f.deps,async()=>{},40_000,api.inferPeriod(q),{},emptyScope);assert.equal(run.research.mode,'planner');assert.equal(run.answered,false);assert.equal(f.plannerCalls,0);assert.deepEqual(f.model.doGenerateCalls[0].tools.map(t=>t.name),['search','read_passage']);assert.equal(run.research.failure,'malformed_args');
});
test('realistic four-turn usage survives token admission; search notes stay out of numerical answers',async()=>{
 const m=model([reply([call('search',{query:'gambling',limit:4})],3000,500),reply([call('count_speeches',args)],7000,500),reply([call('count_speeches',{...args,limit:1})],11000,500),reply([call('finish',{facts:[3]})],15000,500)]),f=fixtures(m),oldKb=f.deps.kb;
 f.deps.kb=async(path,body)=>path==='/find'?{resources:{[p.resource]:{slug:p.slug,title:p.title,fields:{body:{paragraphs:Object.fromEntries(Array.from({length:4},(_,i)=>[p.resource+'/t/body/'+i+'-1200',{text:'Source passage about gambling. '.repeat(40)}]))}}}}}:oldKb(path,body);
 const run=await f.run();assert.equal(run.research.mode,'loop');assert.equal(f.plannerCalls,0);assert.equal(m.doGenerateCalls.length,4);assert.deepEqual(run.tokens,{input:36000,output:2000});assert.doesNotMatch(run.answer,/Retrieved passages|ranked sample/);assert.deepEqual(run.research.trail.map(t=>t.round),[1,2,3,4]);
 assert.equal(api.researchLimits({}).tokens,96000);assert.equal(api.researchLimits({tokens:999999}).tokens,160000);
});
test('a numerical answer misroute keeps finish active and does not consume qualitative repair',async()=>{
 const m=model([reply([call('count_speeches',args)]),reply([call('answer',valid)]),reply([call('finish',{facts:[1]})])]),f=fixtures(m),run=await f.run();
 assert.equal(run.research.mode,'loop');assert.equal(f.plannerCalls,0);assert.deepEqual(m.doGenerateCalls[2].tools.map(t=>t.name),['finish']);assert.equal(run.events.find(e=>e.tool==='answer').state,'failed');
});
test('repair instructions contain an answer hash, never the rejected text or quotes',async()=>{
 const draft={text:'DRAFT MUST NOT BECOME INSTRUCTIONS',citations:[{id,quote:'FABRICATED REPAIR QUOTE',start:0,end:32}]},f=qualitativeFixture([reply([call('search',{query:'housing'})]),reply([call('read_passage',{id})]),reply([call('answer',draft)]),reply([call('answer',valid)])]);
 const run=await f.run();assert.equal(run.research.mode,'loop');
 // The conversation retains its draft; high-priority instructions use a hash.
 const instructions=JSON.stringify(f.model.doGenerateCalls[3].prompt.filter(p=>['system','developer'].includes(p.role)));assert.match(instructions,/answer#[a-f0-9]{64}/);assert.doesNotMatch(instructions,/DRAFT MUST|FABRICATED REPAIR/);
});
test('wrong roster-person attribution is rejected even when the other name is in the quote',()=>{
 const roster={people:[{name:'Taylor Example'},{name:'Pat Example'}]},passages=new Map([[id,{...p,speaker:'Pat Example'}]]);
 const draft=name=>({text:name+' told the House: "'+text+'"',citations:[{id,quote:text,start:0,end:Array.from(name+' told the House: "'+text+'"').length}]});
 assert.equal(api.verifyResearchAnswer(draft('Taylor Example'),passages,'housing',emptyScope,undefined,roster),null);assert.ok(api.verifyResearchAnswer(draft('Pat Example'),passages,'housing',emptyScope,undefined,roster));
 const quoted='Taylor Example called for housing safeguards.',quotedPassages=new Map([[id,{...p,text:quoted,speaker:'Pat Example'}]]),claim={text:quoted,citations:[{id,quote:quoted,start:0,end:quoted.length}]};assert.equal(api.verifyResearchAnswer(claim,quotedPassages,'housing',emptyScope,undefined,roster),null);
});
test('ordinary failures and shadow failures skip discarded planner calls',async()=>{
 const f=fixtures(model(()=>{throw Error('fixture provider failure')})),ordinary='What does the record say about housing?';
 const run=await api.runAgentic(ordinary,f.deps,async()=>{},40000,api.inferPeriod(ordinary),{},emptyScope);assert.equal(run.answered,false);assert.equal(f.plannerCalls,0);assert.equal(run.research.mode,'planner');
 const g=fixtures(model(()=>{throw Error('fixture provider failure')}));g.deps.researchShadow=true;assert.equal((await g.run()).answered,false);assert.equal(g.plannerCalls,0);
});
test('SDK tool errors stop inference and emit failed for older web clients',async()=>{
 const m=model([reply([call('count_speeches',args)]),reply([call('finish',{facts:[1]})])]),f=fixtures(m);f.deps.kb=async()=>{throw Error('fixture lookup failure')};await f.run();assert.equal(m.doGenerateCalls.length,1);assert.equal(f.failures[0].reason,'error');assert.equal(f.events.find(e=>e.step?.tool==='count_speeches'&&e.step.state!=='running').step.state,'failed');
});
test('rebuilt JSON removes content-length and stepped old answers always retain research rounds',async()=>{
 const response=new Response(JSON.stringify({answer:'Fallback.',sources:[],citations:{}}),{headers:{'content-type':'application/json','content-length':'50'}}),adapted=await api.withPlannerResearch(response);assert.equal(adapted.headers.get('content-length'),null);assert.equal((await adapted.json()).research.mode,'planner');
 const f=fixtures(model([]));delete f.deps.research;const run=await f.run(),body=api.agenticAskPayload(run,question);assert.equal(body.research.mode,'planner');assert.equal(body.research.trail.length,run.steps.length);assert.ok(body.research.trail.every(t=>t.round===1));
});
test('committee checks retain the final model round in live events and cached trails',async()=>{
 const federal={...args,state:'federal'},f=fixtures(model([reply([call('count_speeches',federal)]),reply([call('finish',{facts:[1]})])])),q='Who speaks most about gambling in federal parliament across the whole record?';
 const run=await api.runAgentic(q,f.deps,async(e,d)=>f.events.push(d),40000,api.inferPeriod(q),{},emptyScope),body=api.agenticAskPayload(run,q);assert.equal(run.answered,true);assert.deepEqual(body.research.trail.map(t=>t.round),[1,2,2]);assert.equal(run.events.at(-1).tool,'count_speeches');assert.equal(run.events.at(-1).round,2);
});

test('qualitative six-round trace searches twice, reads, repairs, then answers with only qualitative tools',async()=>{
 const f=qualitativeFixture([reply([call('search',{query:'housing'})],3500,500),reply([call('search',{query:'affordability safeguards'})],6000,500),reply([call('read_passage',{id})],9000,500),reply([call('read_passage',{id})],11500,500),reply([call('answer',{...valid,citations:[{...valid.citations[0],quote:'fabricated'}]})],14000,500),reply([call('answer',valid)],16000,500)]);
 const run=await f.run();assert.equal(run.research.mode,'loop');assert.equal(run.research.rounds,6);assert.equal(f.plannerCalls,0);assert.equal(f.failures.length,0);assert.equal(run.answer,text);assert.deepEqual(run.tokens,{input:60000,output:3000});
 assert.deepEqual(f.model.doGenerateCalls.map(c=>c.tools.map(t=>t.name)),[['search','read_passage'],['search','read_passage'],['read_passage'],['read_passage','answer'],['read_passage','answer'],['answer']]);
 assert.deepEqual(f.events.filter(e=>e.step?.state!=='running'&&e.step).map(e=>[e.step.round,e.step.tool,e.step.state]),[[1,'search','done'],[2,'search','done'],[3,'read_passage','done'],[5,'answer','failed'],[6,'answer','done']]);
});
test('reported per-turn input and cached tokens are separate from bytes/4 reserve, including realistic 60k usage',async()=>{
 const responses=[reply([call('count_speeches',args)],18000,2000),reply([call('count_speeches',{...args,limit:1})],19000,2000),reply([call('finish',{facts:[3]})],20000,2000)];
 responses.forEach((r,i)=>{r.usage.inputTokens.cacheRead=10000+i*1000;r.usage.inputTokens.noCache=r.usage.inputTokens.total-r.usage.inputTokens.cacheRead;});
 const f=fixtures(model(responses)),run=await f.run();assert.equal(run.research.mode,'loop');assert.equal(run.research.failure,undefined);assert.deepEqual(run.tokens,{input:57000,output:6000});assert.deepEqual(run.research.cached_input_by_turn,[10000,11000,12000]);
 assert.deepEqual(run.research.turns.map(t=>[t.round,t.input,t.output,t.cached_input]),[[1,18000,2000,10000],[2,19000,2000,11000],[3,20000,2000,12000]]);assert.ok(run.research.turns.every(t=>t.input_reserve>0&&t.input_reserve<18000));
});
