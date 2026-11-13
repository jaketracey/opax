import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {MockLanguageModelV4} from 'ai/test';
const built=await build({stdin:{contents:"export * from './src/agentic-ask';export * from './src/agentic-response';export * from './src/research-loop';export * from './src/research-types';export * from './src/research-evidence';export * from './src/research-credit';export * from './src/research-response';export {researchReservationUsd} from './src/research-budget';export {groundAnswerPayload} from './src/research-grounding';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']});
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
// Selection/admission unit fixtures stop before writing; research-writing and research-route cover final delivery.
const selectionOnly=research=>Object.assign(research,{write:undefined});
const call=(name,args,id='fixture')=>({type:'tool-call',toolName:name,toolCallId:id,input:typeof args==='string'?args:JSON.stringify(args)});
const reply=(calls,input=10,output=5)=>({content:calls,finishReason:{unified:'tool-calls',raw:'tool_calls'},usage:{inputTokens:{total:input,noCache:input,cacheRead:0,cacheWrite:0},outputTokens:{total:output,text:output,reasoning:0}},warnings:[]});
const question='Who speaks most about gambling in NSW across the whole record?',args={topic:'gambling',state:'nsw',group_by:'speaker'},plan={shape:'ranking',steps:[{tool:'count_speeches',args}]},emptyScope={people:[],parties:[],bills:[],ambiguous:false,unresolved:false};
const model=responses=>new MockLanguageModelV4({doGenerate:responses});
// One stable tool list every turn; a turn that must end the run names its terminal tool.
const choice=c=>c.toolChoice?.type==='tool'?c.toolChoice.toolName:c.toolChoice?.type;
const names=c=>c.tools.map(t=>t.name);
function fixtures(m,options={}) {
 let plannerCalls=0,lookups=0,turns=0;const events=[],failures=[];
 const deps={signal:options.signal,asset:async()=>null,kb:async()=>{lookups++;return {fulltext:{total:100,facets:{'/u/o':{'/u/o/Taylor Example':87,'/u/o/Pat Example':13}}}}},generate:async()=>{plannerCalls++;return {text:JSON.stringify(plan),tokens:{input:3,output:2}}},research:selectionOnly(api.createResearch({inputPrice:0.1,outputPrice:0.3,model:m,modelBudgetSpent:async()=>{turns++;return options.refuseAt===turns},dailyBudget:{reserve:async()=>({settle:async()=>{}})},creditCooldown:api.createResearchCreditCooldown(),...options})),onResearchFailure:async e=>failures.push(e)};
 return {model:m,deps,events,failures,run:(q=question)=>api.runAgentic(q,deps,async(e,d)=>events.push(d),40_000,api.inferPeriod(q),{},emptyScope),get plannerCalls(){return plannerCalls},get lookups(){return lookups},get turns(){return turns}};
}
test('loop answer instructions require a direct first point, unique facts and separate coverage notes',async()=>{
 const f=fixtures(model([reply([call('decline',{reason:'out_of_scope'})])]));await f.run();
 const generation=f.model.doGenerateCalls[0],instructions=JSON.stringify(generation.prompt.filter(p=>['system','developer'].includes(p.role)));
 assert.match(instructions,/first point directly answers the question with the requested name, date or outcome/);
 assert.match(instructions,/use a complete sentence about the finding/);
 assert.match(instructions,/For a who question, name the people and their roles first, then what the inquiry or record found about each/);assert.match(instructions,/never how OPAX loaded or stored them/);
 assert.match(instructions,/say who said it/);assert.match(instructions,/by the name on the record/);
 assert.match(instructions,/Select each fact once/);
 assert.match(instructions,/Each figure comes from one selected fact with its supporting citation/);
 assert.match(instructions,/the response coverage note carries relevant limitations/);
 assert.doesNotMatch(instructions,/opening with the passage year/);
 const answer=generation.tools.find(t=>t.name==='answer');
 assert.match(answer.description,/each selected once/);
 assert.match(answer.description,/the first answering the question directly/);
});
test('loop decisions carry a typed refusal through the response adapter',async()=>{
 // Only out_of_scope declines remain; ambiguous and causation reasons were removed with the minimum checks.
 for(const reason of ['out_of_scope']){
  const f=fixtures(model([reply([call('decline',{reason})])])),run=await f.run('How much money reached One Nation?'),payload=api.agenticAskPayload(run,'How much money reached One Nation?')
  assert.equal(payload.answer_decision,'refusal');assert.equal(payload.answer,run.qualitative.answer)
  assert.deepEqual(payload.answer_scope,run.answer_scope);assert.ok(payload.answer_scope.period)
 }
})
test('multi-round happy path, finish maps selected facts to templates and matching step events',async()=>{
 const m=model([reply([call('count_speeches',args,'a')]),reply([call('count_speeches',{...args,limit:1},'b')]),reply([call('finish',{facts:[3]},'c')])]),f=fixtures(m),run=await f.run(),body=api.agenticAskPayload(run,question);
 assert.equal(run.answered,true);assert.equal(run.answer_source,'template');assert.equal(f.plannerCalls,0);assert.equal(f.turns,3);assert.deepEqual(run.chosen_facts,[3]);assert.match(body.answer,/Taylor Example: 87/);assert.doesNotMatch(body.answer,/Pat Example/);assert.equal(body.research.mode,'loop');assert.equal(body.research.rounds,3);assert.equal(body.research.sources.length,1);assert.deepEqual(run.tokens,{input:30,output:15});
 const steps=f.events.filter(x=>x.phase==='step').map(x=>x.step);assert.equal(steps.length,6);
 for(let i=0;i<steps.length;i+=2){assert.equal(steps[i].state,'running');assert.equal(steps[i+1].state,'done');assert.equal(steps[i].id,steps[i+1].id);assert.equal(typeof steps[i+1].results,'number');assert.equal(typeof steps[i+1].ms,'number');assert.equal(steps[i].round,i/2+1);}
 assert.ok(m.doGenerateCalls.every(c=>c.maxOutputTokens<=1800));
 assert.equal(run.answer_scope.jurisdiction,'nsw');assert.deepEqual(body.answer_scope,run.answer_scope)
});
test('identical scoped calls dedupe despite different property order',async()=>{
 const m=model([reply([call('count_speeches',args,'a')]),reply([call('count_speeches',{group_by:'speaker',state:'nsw',topic:'gambling'},'b')]),reply([call('finish',{facts:[1]},'c')])]),f=fixtures(m),run=await f.run();
 assert.equal(run.answered,true);assert.equal(f.plannerCalls,0);assert.equal(run.steps.filter(s=>s.tool==='count_speeches').length,1);assert.equal(f.lookups,2);assert.equal(choice(m.doGenerateCalls[2]),'finish');assert.deepEqual(names(m.doGenerateCalls[2]),names(m.doGenerateCalls[0]));
});
test('default eight turns, eight hard ceiling and bounded parallel call batches; surplus calls are refused, not fatal',async()=>{
 assert.equal(api.researchLimits({}).rounds,8);assert.equal(api.researchLimits({steps:99}).rounds,8);
 // Searches that find nothing give no evidence, so no turn is forced to finish and the round cap ends the run.
 for(const [steps,wanted] of [[undefined,8],[99,8]]){const m=model(Array.from({length:9},(_,i)=>reply([call('search',{query:'gambling '+i},String(i))]))),f=fixtures(m,{steps,inputPrice:0.1,outputPrice:0.3}),run=await f.run();assert.equal(run.research.mode,'planner');assert.equal(f.failures[0].reason,'steps');assert.equal(m.doGenerateCalls.length,wanted+1,'the round cap is followed by one final answer call');assert.equal(f.plannerCalls,1);}
 const f=fixtures(model([reply(Array.from({length:18},(_,i)=>call('count_speeches',{...args,limit:i%15+1,venue:i>=15?'committee':'chamber'},String(i)))),reply([call('finish',{facts:[1]},'f')])])),run=await f.run();
 assert.equal(run.research.mode,'loop');assert.equal(f.failures.length,0);assert.equal(run.steps.filter(s=>s.tool==='count_speeches').length,api.RESEARCH_MAX_CALLS);assert.ok(f.lookups<=2*api.RESEARCH_MAX_CALLS);
 const surplus=f.model.doGenerateCalls[1].prompt.filter(m=>m.role==='tool').flatMap(m=>m.content).filter(c=>JSON.stringify(c).includes('call limit reached'));assert.equal(surplus.length,18-api.RESEARCH_MAX_CALLS);
});
test('wall timeout skips the planner and returns to the route fallback',async()=>{
 const f=fixtures(model(()=>new Promise(()=>{})),{wallMs:15}),started=Date.now(),run=await f.run();assert.ok(Date.now()-started<1000);assert.equal(f.failures[0].reason,'timeout');assert.equal(run.research.mode,'planner');assert.equal(f.plannerCalls,0);assert.equal(run.answered,false);
});
test('token cap refuses inference and detects reported overspend before tools',async()=>{
 const m=model([reply([call('finish',{facts:[1]})])]),f=fixtures(m,{tokens:1});await f.run();assert.equal(m.doGenerateCalls.length,0);assert.equal(f.failures[0].reason,'tokens');
 const n=model([reply([call('count_speeches',args)],160001)]),g=fixtures(n,{tokens:160000});await g.run();assert.equal(g.failures[0].reason,'tokens');assert.equal(g.lookups,2,'only fallback planner lookups');assert.equal(n.doGenerateCalls.length,1);
});
test('MODEL_LIMITER checks every turn and refuses the next provider call',async()=>{
 const m=model([reply([call('count_speeches',args)]),reply([call('finish',{facts:[1]})])]),f=fixtures(m,{refuseAt:2}),run=await f.run();assert.equal(f.turns,2);assert.equal(m.doGenerateCalls.length,1);
 // A limiter stop after a lookup keeps the count research gathered; no final call and no planner run past the limiter.
 assert.equal(f.failures.length,0);assert.equal(f.plannerCalls,0);assert.equal(run.answered,true);assert.match(run.answer,/Taylor Example: 87/);
});
test('daily dollar admission refuses inference and fails closed when its ledger is unavailable',async()=>{
 for(const [reserve,reason] of [[async()=>null,'daily_budget'],[async()=>{throw Error('private D1 details')},'daily_budget_unavailable']]){
  const m=model([reply([call('count_speeches',args)])]),f=fixtures(m,{dailyBudget:{reserve}}),run=await f.run();
  assert.equal(m.doGenerateCalls.length,0);assert.equal(f.failures[0].reason,reason);assert.equal(run.research.mode,'planner');assert.equal(f.plannerCalls,1);
 }
});
test('each turn reserves its own call ceiling, not the whole request budget; estimates cannot refund unknown billing',async()=>{
 const reserved=[],settled=[],m=model([reply([call('count_speeches',args)]),reply([call('finish',{facts:[1]})])]);
 const f=fixtures(m,{inputPrice:0.66,outputPrice:1.98,dailyBudget:{reserve:async amount=>{reserved.push(amount);return{settle:async actual=>settled.push(actual)}}}});
 const run=await f.run();assert.equal(run.research.mode,'loop');assert.deepEqual(reserved,run.research.turns.map(t=>2*(t.input_reserve*0.66+1800*1.98)/1e6));assert.ok(reserved.every(usd=>usd>0&&usd<api.researchReservationUsd(96000,0.66,1.98)));assert.deepEqual(settled,[undefined,undefined]);assert.equal(run.cost_usd,2*(10*0.66+5*1.98)/1e6);
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
test('thrown provider errors and malformed JSON fall back once; an invalid tool argument does not end research',async()=>{
 const invalid=fixtures(model([reply([call('count_speeches',{...args,group_by:3})])])),carried=await invalid.run();assert.equal(invalid.plannerCalls,0);assert.equal(carried.research.mode,'loop');assert.equal(carried.answered,true);assert.equal(invalid.failures.length,0)
 for(const response of [()=>{throw Error('private upstream error')},[reply([call('count_speeches','{')])]]){const f=fixtures(model(response)),run=await f.run();assert.equal(f.plannerCalls,1);assert.equal(run.research.mode,'planner');assert.equal(run.answered,true);assert.ok(['error','malformed_args'].includes(f.failures[0].reason));assert.doesNotMatch(f.failures[0].message,/private/);}
});
test('periodPlan applies request dates before a loop lookup',async()=>{
 const f=fixtures(model([reply([call('count_speeches',{...args,since:'1990-01-01',until:'1991-01-01'})]),reply([call('finish',{facts:[1]})])])),run=await api.runAgentic(question,f.deps,async()=>{},40_000,{kind:'window',since:'2023-01-01',until:'2023-12-31',label:'2023 scope.'},{},emptyScope);assert.equal(run.steps[0].args.since,'2023-01-01');assert.equal(run.steps[0].args.until,'2023-12-31');
});
const id='a'.repeat(32)+'/t/body/0-90',text='The committee called for stronger housing affordability safeguards.',p={id,resource:id.split('/')[0],slug:'speech-1',title:'Housing debate',text,url:'https://opax.com.au/doc/speech-1',kind:'speech'},valid={text,citations:[{id,quote:text,start:0,end:Array.from(text).length}]};
// An off-topic passage leaves nothing usable to answer from, so the repair turn and the old path stay reachable.
const offTopic='The committee adjourned until Tuesday morning.';
function qualitativeFixture(responses,passageText=text){const f=fixtures(model(responses),{readRecord:async()=>({text:passageText,speaker:'Pat Example'})});f.deps.kb=async()=>({resources:{[p.resource]:{slug:p.slug,title:p.title,fields:{body:{paragraphs:{[id]:{text:passageText}}}}}}});f.run=()=>api.runAgentic('What does the record say about housing affordability?',f.deps,async(e,d)=>f.events.push(d),40_000,api.inferPeriod('housing'),{},emptyScope);return f;}
test('qualitative search/answer retains passage ids and ordinary source/citation fields; search verifies its hits',async()=>{
 const f=qualitativeFixture([reply([call('search',{query:'housing affordability'})]),reply([call('answer',valid)])]),run=await f.run(),payload=api.agenticAskPayload(run,'housing');assert.equal(run.answered,true);assert.equal(run.answer_source,'model');assert.deepEqual(payload.citations,{[id]:[[0,text.length]]});assert.equal(payload.sources[0].resource,p.resource);assert.equal(payload.research.sources[0].url,p.url);assert.equal(payload.research.sources[0].speaker,'Pat Example');
});
test('a fabricated quote never reaches the reader in quotation marks; a citation to an unknown passage leaves the draft uncited; no extra turn',async()=>{
 // Minimum checks: the draft stands as written with its valid citation; the final boundary takes the quote marks off.
 const f=qualitativeFixture([reply([call('search',{query:'housing'})]),reply([call('answer',{text:'"Invented testimony that never occurred in this record."',citations:[{id,quote:text,start:0,end:55}]})]),reply([call('answer',valid)])]),run=await f.run(),body=api.agenticAskPayload(run,'housing');
 assert.equal(run.research.mode,'loop');assert.equal(run.answered,true);assert.equal(f.model.doGenerateCalls.length,2);assert.equal(run.research.rounds,2);
 assert.equal(run.answer,'"Invented testimony that never occurred in this record."');assert.deepEqual(body.citations,{[id]:[[0,55]]});
 const grounded=api.groundAnswerPayload(body,'housing');assert.doesNotMatch(grounded.answer,/["“”]/);assert.match(grounded.answer,/Invented testimony that never occurred in this record\./);
 // A citation to an unknown id is not attached; the draft text stands, uncited.
 const g=qualitativeFixture([reply([call('search',{query:'housing'})]),reply([call('answer',{...valid,citations:[{...valid.citations[0],id:'unknown/t/body/0'}]})]),reply([call('answer',valid)])]),bound=await g.run();
 assert.equal(g.model.doGenerateCalls.length,2);assert.equal(bound.answer,text);assert.deepEqual(bound.qualitative.citations,{});assert.equal(bound.qualitative.answer_status,'uncited');
});
test('with nothing usable retrieved, the draft answer stands uncited on the first answer call',async()=>{
 // Minimum checks: no repair turn and no fallback to the old path; the answer is kept, uncited.
 const draft={...valid,citations:[{...valid.citations[0],id:'unknown/t/body/0'}]},f=qualitativeFixture([reply([call('search',{query:'housing'})]),reply([call('answer',draft)]),reply([call('answer',draft)])],offTopic),run=await f.run();assert.equal(run.research.mode,'loop');assert.equal(f.failures.length,0);assert.equal(f.model.doGenerateCalls.length,2);assert.equal(run.answer,text);assert.equal(run.qualitative.answer_status,'uncited');
});
test('a fabricated quotation is unquoted and kept as cited paraphrase, never kept in quotation marks',async()=>{
 const passages=new Map([[id,{...p,speaker:'Pat Example'}]]),why=[],tally=api.emptyTally();
 const out=api.verifyResearchPoints([{claim:'Pat Example said “housing affordability safeguards matter most of all”.',id,quote:'stronger housing affordability safeguards'}],passages,'What does the record say about housing affordability?',emptyScope,undefined,{people:[{name:'Pat Example'}]},r=>why.push(r),tally);
 assert.equal(out.answer,'- Pat Example said housing affordability safeguards matter most of all.');assert.deepEqual(tally.repairs,{unquoted:1});assert.equal(tally.points_kept,1);
 // A real quotation keeps its marks, re-cased to the passage.
 const kept=api.verifyResearchPoints([{claim:'Pat Example called for “STRONGER housing affordability safeguards”.',id,quote:'housing affordability safeguards'}],passages,'housing affordability?',emptyScope);
 assert.equal(kept.answer,'- Pat Example called for “stronger housing affordability safeguards”.');
});
test('the text verifier keeps the draft as written and attaches citations with a retrieved id and a valid range',()=>{
 // Minimum checks: no quote, causation, figure or position rejections here; quote marks are checked at the final boundary.
 const passages=new Map([[id,p]]);assert.equal(api.verifyResearchAnswer(valid,passages,'housing',emptyScope).answer,text);
 for(const phrase of ['The donations bought votes.','"Fake short quote"','‘Fake single quote’',"'Fake ASCII quote'",'Housing costs $999.']){const out=api.verifyResearchAnswer({text:phrase,citations:[{id,quote:text,start:0,end:Array.from(phrase).length}]},passages,'housing',emptyScope);assert.equal(out.answer,phrase);assert.deepEqual(out.citations,{[id]:[[0,Array.from(phrase).length]]})}
 assert.equal(api.verifyResearchAnswer(valid,passages,'What was the position on defence?',emptyScope,'defence').answer,text);
 for(const gap of [' Uncited extra claim.',' The minister supported it',' Overall, members said more',' In 2023, more']){const out=api.verifyResearchAnswer({...valid,text:text+gap},passages,'housing',emptyScope);assert.equal(out.answer,text+gap,gap);assert.equal(out.answer_status,'partly_cited',gap)}
 assert.equal(api.verifyResearchAnswer({...valid,citations:[{...valid.citations[0],end:999}]},passages,'housing',emptyScope).answer_status,'uncited');
 const lead='On housing: ',led={text:lead+text,citations:[{...valid.citations[0],start:Array.from(lead).length,end:Array.from(lead+text).length}]};assert.ok(api.verifyResearchAnswer(led,passages,'housing',emptyScope));
});

test('unclassified prose sees every record tool, but speech counts it did not ask for are refused, uncounted',async()=>{
 const f=qualitativeFixture([reply([call('count_speeches',args)]),reply([call('search',{query:'housing affordability'})]),reply([call('answer',valid)])]);
 assert.equal(api.classifyAgentic('What does the record say about housing affordability?').shape,null);const run=await f.run();
 assert.equal(run.research.mode,'loop');assert.equal(run.answered,true);assert.equal(f.plannerCalls,0);
 for(const tool of ['count_speeches','parliamentary_pay','contracts','grants','declared_interests','find_records','search','answer','finish'])assert.ok(names(f.model.doGenerateCalls[0]).includes(tool),tool);
 assert.ok(!names(f.model.doGenerateCalls[0]).includes('find_quotes'));
 assert.match(JSON.stringify(f.model.doGenerateCalls[1].prompt),/does not ask for speech counts/);assert.deepEqual(run.steps.map(s=>s.tool),['search','answer']);
});
test('realistic four-turn usage survives token admission; search notes stay out of numerical answers',async()=>{
 const m=model([reply([call('search',{query:'gambling',limit:4})],6000,500),reply([call('count_speeches',args)],14000,1000),reply([call('finish',{facts:[1]})],16000,500)]),f=fixtures(m,{readRecord:async()=>({text:'Source passage about gambling. '.repeat(40)})}),oldKb=f.deps.kb;
 f.deps.kb=async(path,body)=>path==='/find'?{resources:{[p.resource]:{slug:p.slug,title:p.title,fields:{body:{paragraphs:Object.fromEntries(Array.from({length:4},(_,i)=>[p.resource+'/t/body/'+i+'-1200',{text:'Source passage about gambling. '.repeat(40)}]))}}}}}:oldKb(path,body);
 const run=await f.run();assert.equal(run.research.mode,'loop',JSON.stringify(f.failures));assert.equal(f.plannerCalls,0);assert.equal(m.doGenerateCalls.length,3);assert.deepEqual(run.tokens,{input:36000,output:2000});assert.doesNotMatch(run.answer,/Retrieved passages|ranked sample/);assert.deepEqual(run.research.trail.map(t=>t.round),[1,2,3]);assert.equal(choice(m.doGenerateCalls[2]),'required');
 assert.equal(api.researchLimits({}).tokens,256000);assert.equal(api.researchLimits({tokens:999999}).tokens,320000);
});
test('a numerical answer misroute keeps finish active and does not consume qualitative repair',async()=>{
 const m=model([reply([call('count_speeches',args)]),reply([call('answer',valid)]),reply([call('finish',{facts:[1]})])]),f=fixtures(m),run=await f.run();
 assert.equal(run.research.mode,'loop');assert.equal(f.plannerCalls,0);assert.equal(choice(m.doGenerateCalls[2]),'finish');assert.deepEqual(names(m.doGenerateCalls[2]),names(m.doGenerateCalls[0]));assert.equal(run.events.find(e=>e.tool==='answer').state,'failed');
});
test('instructions are byte-stable across turns; repair feedback carries reason labels, never the rejected text or quotes',async()=>{
 // Minimum checks: only an empty answer (here, an unknown fact id and no points or text) gets a repair turn.
 const draft={facts:[999],quote:'FABRICATED REPAIR QUOTE'},f=qualitativeFixture([reply([call('search',{query:'housing'})]),reply([call('answer',draft)]),reply([call('answer',valid)])],offTopic);
 const run=await f.run();assert.equal(run.research.mode,'loop');assert.equal(run.answer,text);assert.equal(f.model.doGenerateCalls.length,3);
 // The conversation retains its own draft; instructions and the tool error never echo it.
 const system=c=>JSON.stringify(c.prompt.filter(p=>['system','developer'].includes(p.role)));assert.equal(new Set(f.model.doGenerateCalls.map(system)).size,1);assert.doesNotMatch(system(f.model.doGenerateCalls[2]),/DRAFT MUST|FABRICATED REPAIR/);
 const feedback=JSON.stringify(f.model.doGenerateCalls[2].prompt.filter(p=>p.role==='tool'));assert.match(feedback,/the answer was empty \(fact 999: not a record fact\)/);assert.doesNotMatch(feedback,/FABRICATED REPAIR/);
});
test('a roster-person attribution is kept as written; attribution is no longer rejected',()=>{
 // Minimum checks removed the wrong-speaker rejection: both drafts stand, cited.
 const roster={people:[{name:'Taylor Example'},{name:'Pat Example'}]},passages=new Map([[id,{...p,speaker:'Pat Example'}]]);
 const draft=name=>({text:name+' told the House: "'+text+'"',citations:[{id,quote:text,start:0,end:Array.from(name+' told the House: "'+text+'"').length}]});
 for(const name of ['Taylor Example','Pat Example']){const out=api.verifyResearchAnswer(draft(name),passages,'housing',emptyScope,undefined,roster);assert.equal(out.answer,draft(name).text);assert.ok(out.citations[id])}
});
test('ordinary failures and shadow failures skip discarded planner calls',async()=>{
 const f=fixtures(model(()=>{throw Error('fixture provider failure')})),ordinary='What does the record say about housing?';
 const run=await api.runAgentic(ordinary,f.deps,async()=>{},40000,api.inferPeriod(ordinary),{},emptyScope);assert.equal(run.answered,false);assert.equal(f.plannerCalls,0);assert.equal(run.research.mode,'planner');
 const g=fixtures(model(()=>{throw Error('fixture provider failure')}));g.deps.researchShadow=true;assert.equal((await g.run()).answered,false);assert.equal(g.plannerCalls,0);
});
test('SDK tool errors remain visible for a recovery and emit failed for older web clients',async()=>{
 const m=model([reply([call('count_speeches',args)]),reply([call('count_speeches',{...args,limit:1})]),reply([call('finish',{facts:[1]})])]),f=fixtures(m);
 const kb=f.deps.kb;let unavailable=true;f.deps.kb=async(...args)=>{if(unavailable){unavailable=false;throw Error('fixture lookup failure')}return kb(...args)};
 const run=await f.run();assert.equal(run.answered,true);assert.equal(m.doGenerateCalls.length,3);assert.equal(f.failures.length,0);
 assert.equal(f.events.find(e=>e.step?.tool==='count_speeches'&&e.step.state!=='running').step.state,'failed');
 assert.match(JSON.stringify(m.doGenerateCalls[1].prompt),/lookup timed out or unavailable/);
});
test('rebuilt JSON removes content-length and stepped old answers always retain research rounds',async()=>{
 const response=new Response(JSON.stringify({answer:'Fallback.',sources:[],citations:{}}),{headers:{'content-type':'application/json','content-length':'50'}}),adapted=await api.withPlannerResearch(response);assert.equal(adapted.headers.get('content-length'),null);assert.equal((await adapted.json()).research.mode,'planner');
 const f=fixtures(model([]));delete f.deps.research;const run=await f.run(),body=api.agenticAskPayload(run,question);assert.equal(body.research.mode,'planner');assert.equal(body.research.trail.length,run.steps.length);assert.ok(body.research.trail.every(t=>t.round===1));
});
test('model-chosen committee checks share the call budget and retain their round in live events and cached trails',async()=>{
 const federal={...args,state:'federal'},f=fixtures(model([reply([call('count_speeches',federal,'chamber'),call('count_speeches',{...federal,venue:'committee'},'committee')]),reply([call('finish',{facts:[1]})])])),q='Who speaks most about gambling in federal parliament across the whole record?';
 const run=await api.runAgentic(q,f.deps,async(e,d)=>f.events.push(d),40000,api.inferPeriod(q),{},emptyScope),body=api.agenticAskPayload(run,q);assert.equal(run.answered,true);assert.deepEqual(body.research.trail.map(t=>[t.tool,t.round,t.label]).sort(),[['count_speeches',1,'Checking committee hearings'],['count_speeches',1,'Counting by speaker'],['finish',2,'Selecting record facts']]);
 const committee=run.events.find(e=>e.label==='Checking committee hearings');assert.equal(committee.tool,'count_speeches');assert.equal(committee.round,1);
});

test('qualitative trace observes two searches and can still choose whether to answer or research; a draft with a fabricated citation quote stands, cited by its range',async()=>{
 const f=qualitativeFixture([reply([call('search',{query:'housing'})],3500,500),reply([call('search',{query:'affordability safeguards'})],6000,500),reply([call('answer',{...valid,citations:[{...valid.citations[0],quote:'fabricated'}]})],9000,500)]);
 // The model's own sentence stands, cited by its valid range; the citation quote is not checked.
 const run=await f.run();assert.equal(run.research.mode,'loop');assert.equal(run.research.rounds,3);assert.equal(f.plannerCalls,0);assert.equal(f.failures.length,0);assert.equal(run.answer,text);assert.ok(run.qualitative.citations[id]);assert.deepEqual(run.tokens,{input:18500,output:1500});
 assert.deepEqual(f.model.doGenerateCalls.map(choice),['required','required','required']);assert.ok(f.model.doGenerateCalls.every(c=>JSON.stringify(names(c))===JSON.stringify(names(f.model.doGenerateCalls[0]))));
 assert.deepEqual(f.events.filter(e=>e.step?.state!=='running'&&e.step).map(e=>[e.step.round,e.step.tool,e.step.state]),[[1,'search','done'],[2,'search','done'],[3,'answer','done']]);
});
test('reported per-turn input and cached tokens are separate from bytes/4 reserve, including realistic 60k usage',async()=>{
 const responses=[reply([call('count_speeches',args)],18000,2000),reply([call('count_speeches',{...args,limit:1})],19000,2000),reply([call('finish',{facts:[3]})],20000,2000)];
 responses.forEach((r,i)=>{r.usage.inputTokens.cacheRead=10000+i*1000;r.usage.inputTokens.noCache=r.usage.inputTokens.total-r.usage.inputTokens.cacheRead;r.usage.outputTokens.reasoning=1500;r.usage.outputTokens.text=500;r.providerMetadata={openrouter:{provider:'fixture-host'}};});
 const f=fixtures(model(responses)),run=await f.run();assert.equal(run.research.mode,'loop');assert.equal(run.research.failure,undefined);assert.deepEqual(run.tokens,{input:57000,output:6000});assert.deepEqual(run.research.cached_input_by_turn,[10000,11000,12000]);
 assert.deepEqual(run.research.turns.map(t=>[t.round,t.input,t.output,t.cached_input]),[[1,18000,2000,10000],[2,19000,2000,11000],[3,20000,2000,12000]]);// The reserve is the bytes/4 estimate of the request (tool specs included), so it is not pinned to a ceiling that each new tool erodes:
 // it stays positive, never echoes the reported usage, and grows as the transcript grows.
 assert.ok(run.research.turns.every(t=>t.input_reserve>0&&t.input_reserve!==t.input));assert.ok(run.research.turns.every((t,i,a)=>!i||t.input_reserve>a[i-1].input_reserve));
 assert.deepEqual(run.research.turns.map(t=>[t.provider,t.reasoning,t.cached]),[['fixture-host',1500,10000],['fixture-host',1500,11000],['fixture-host',1500,12000]]);
});
test('point answers keep every point; a point citing a retrieved passage stays cited whatever its quote',async()=>{
 // Minimum checks: points are no longer checked against their quote, so both points stand, cited.
 const f=qualitativeFixture([reply([call('search',{query:'housing'})]),reply([call('answer',{points:[{claim:'The committee called for stronger safeguards.',id,quote:text},{claim:'It also demanded a royal commission.',id,quote:'a royal commission into housing'}]})])]),run=await f.run(),body=api.agenticAskPayload(run,'housing');
 const first='The committee called for stronger safeguards.',second='It also demanded a royal commission.',at=2+Array.from(first).length+3;
 assert.equal(run.research.mode,'loop');assert.equal(run.answer,'- '+first+'\n- '+second);assert.deepEqual(body.citations,{[id]:[[2,2+Array.from(first).length],[at,at+Array.from(second).length]]});assert.equal(body.answer_status,undefined);
 assert.equal(run.research.answer_stats.points_kept,2);assert.equal(run.research.answer_stats.points_uncited,0);
 // A point with no retrieved passage stands uncited.
 const passages=new Map([[id,p]]),alone=api.verifyResearchPoints([{claim:'Invented.',id:'unknown/t/body/0',quote:'not in the passage'}],passages,'housing',emptyScope);
 assert.equal(alone.answer,'- Invented.');assert.equal(alone.answer_status,'uncited');assert.deepEqual(alone.citations,{});
 assert.equal(api.verifyResearchPoints([{claim:'Donations caused the vote.',id,quote:text}],passages,'housing',emptyScope).answer,'- Donations caused the vote.');
});
test('search verifies each record once and hides passages missing from their original turn',async()=>{
 const other='b'.repeat(32)+'/t/body/0-40',reads=[];const f=fixtures(model([reply([call('search',{query:'housing'})]),reply([call('answer',valid)])]),{readRecord:async slug=>{reads.push(slug);return {text,speaker:'Pat Example'}}});
 f.deps.kb=async()=>({resources:{[p.resource]:{slug:p.slug,title:p.title,fields:{body:{paragraphs:{[id]:{text},[p.resource+'/t/body/90-120']:{text:'Not in the original record.'}}}}},[other.split('/')[0]]:{slug:'speech-2',title:'Other',fields:{body:{paragraphs:{[other]:{text:'Also absent from its record.'}}}}}}});
 const run=await api.runAgentic('What does the record say about housing affordability?',f.deps,async()=>{},40_000,api.inferPeriod('housing'),{},emptyScope);assert.equal(run.research.mode,'loop');assert.deepEqual(reads.sort(),['speech-1','speech-2']);
 const results=JSON.stringify(f.model.doGenerateCalls[1].prompt.filter(m=>m.role==='tool'));assert.match(results,/stronger housing affordability/);assert.doesNotMatch(results,/Not in the original record|Also absent/);
});
test('lowercase words never resolve as surname-only people when the question uses capitals',()=>{
 const roster={people:[{name:'Power'},{name:'On'},{name:'Andrew Wilkie'},{name:'Pat Last'}]};
 assert.deepEqual(api.extractNamedScope('How do Labor and the Coalition differ on nuclear power?',roster,{bills:[]}).people,[]);
 assert.deepEqual(api.extractNamedScope('Is gambling debated more this term than last term?',roster,{bills:[]}).people,[]);
 assert.deepEqual(api.extractNamedScope('What has Power said about housing?',roster,{bills:[]}).people,['Power']);
 assert.deepEqual(api.extractNamedScope('what has power said about housing?',roster,{bills:[]}).people,['Power']);
 assert.deepEqual(api.extractNamedScope('What has Andrew Wilkie said about poker machine reform?',roster,{bills:[]}).people,['Andrew Wilkie']);
});
test('search takes a party argument as KB labels (Coalition is its member parties); an unknown party is refused, not searched',async()=>{
 const seen=[];const f=fixtures(model([reply([call('search',{query:'nuclear power',party:'the Coalition'},'a'),call('search',{query:'nuclear power',party:'Invented Party'},'b')]),reply([call('answer',valid)])]),{readRecord:async()=>({text,speaker:'Pat Example'}),searchBody:(query,limit,context,filters)=>{seen.push(filters);return {query,top_k:limit}}});
 f.deps.kb=async()=>({resources:{[p.resource]:{slug:p.slug,title:p.title,fields:{body:{paragraphs:{[id]:{text}}}}}}});
 await api.runAgentic('How do Labor and the Coalition differ on housing affordability?',f.deps,async()=>{},40_000,api.inferPeriod('housing'),{},emptyScope);
 assert.deepEqual(seen.map(s=>(s.party??[]).slice().sort()),[['Country Liberal Party','LNP','Liberal','Nationals']]);
 assert.match(JSON.stringify(f.model.doGenerateCalls[1].prompt),/unknown party/);
});
test('person_quotes: the named member\'s own speeches only, newest first, one passage per speech, verified in their own turn',async()=>{
 const seen=[],res=(n,date)=>['e'.repeat(31)+n,{slug:'speech-'+n,title:'Debate '+n,origin:{created:date+'T00:00:00Z',collaborators:[n==='3'?'Casey Sample':'Pat Example']},fields:{body:{paragraphs:{['e'.repeat(31)+n+'/t/body/0-60']:{text:'Housing affordability safeguards are needed now '+n+'.'},['e'.repeat(31)+n+'/t/body/61-90']:{text:'A second paragraph about housing '+n+'.'}}}}}];
 const f=fixtures(model([reply([call('person_quotes',{person:'Pat Example',topic:'housing affordability'})]),reply([call('answer',valid)])]),{searchBody:(query,limit,context,filters)=>{seen.push(filters);return {query,top_k:limit}},readRecord:async slug=>({text:'Housing affordability safeguards are needed now '+slug.split('-')[1]+'. A second paragraph about housing '+slug.split('-')[1]+'.',speaker:slug==='speech-3'?'Casey Sample':'Pat Example'})});
 f.deps.kb=async()=>({resources:Object.fromEntries([res('1','2011-01-01'),res('2','2024-06-01'),res('3','2025-01-01')])});
 f.deps.asset=async path=>path==='/parliamentarians.json'?{people:[{name:'Pat Example'},{name:'Casey Sample'}]}:null;
 await api.runAgentic('What has Pat Example said about housing affordability?',f.deps,async()=>{},40_000,api.inferPeriod('housing'),{},emptyScope);
 assert.deepEqual(seen,[{speaker:'Pat Example'}]);
 const out=JSON.stringify(f.model.doGenerateCalls[1].prompt).replace(/\\"/g,'"');
 const ids=[...out.matchAll(/"slug":"(speech-\d)"/g)].map(m=>m[1]);assert.deepEqual([...new Set(ids)],['speech-2','speech-1']);
 assert.equal((out.match(/A second paragraph about housing/g)||[]).length,0,'one passage per speech');
});
test('person_quotes keeps an exact speech name when another row carries its alias',async()=>{
 const seen=[];
 const f=fixtures(model([reply([call('person_quotes',{person:'Alex Example',topic:'housing'})]),reply([call('answer',valid)])]),{searchBody:(query,limit,context,filters)=>{seen.push(filters);return {query,top_k:limit}}});
 f.deps.kb=async()=>({resources:{}});
 f.deps.asset=async path=>path==='/parliamentarians.json'?{people:[{name:'Alex Example',pid:'19996',speeches:147},{name:'Alex Sample',pid:'19995',speeches:900,aliases:['Alex Example']}]}:null;
 await api.runAgentic('What has Alex Example said about housing?',f.deps,async()=>{},40_000,api.inferPeriod('housing'),{},emptyScope);
 assert.deepEqual(seen,[{speaker:'Alex Example'}]);
});
test('prompt cache: every turn sends a byte-identical prefix (instructions and tools), and messages only grow',async()=>{
 const f=qualitativeFixture([reply([call('search',{query:'housing'})]),reply([call('search',{query:'affordability safeguards'})]),reply([call('answer',valid)])]);await f.run();
 const calls=f.model.doGenerateCalls;assert.equal(calls.length,3);
 const prefix=c=>JSON.stringify({system:c.prompt.filter(m=>['system','developer'].includes(m.role)),tools:c.tools});
 for(const c of calls.slice(1))assert.equal(prefix(c),prefix(calls[0]));
 const rest=c=>c.prompt.filter(m=>!['system','developer'].includes(m.role)).map(m=>JSON.stringify(m));
 for(let i=1;i<calls.length;i++){const before=rest(calls[i-1]),after=rest(calls[i]);assert.ok(after.length>before.length);assert.deepEqual(after.slice(0,before.length),before,'append-only messages');}
});


test('research loads shipped titles before its constraints reach search',async()=>{
 const {readFileSync}=await import('node:fs')
 const titles=JSON.parse(readFileSync(new URL('../public/ask-statute-titles.json',import.meta.url)))
 for(const [question,jurisdiction]of [['fair work ACT government policy',undefined],['List ACT senators','act'],['A.C.T. budget','act'],['Australian Capital Territory budget','act']]){
  let observed,reads=0
  const f=fixtures(model([reply([call('search',{query:'housing'})]),reply([call('decline',{reason:'ambiguous'})])]),{searchBody:(_q,_n,context)=>{observed=context.constraints;return {query:'housing'}}})
  f.deps.asset=async path=>{if(path==='/ask-statute-titles.json'){reads++;return titles}return null}
  await f.run(question);assert.equal(reads,1);assert.equal(observed.jurisdiction,jurisdiction)
 }
})

test('research keeps ACT across clauses with its catalogue and leaves unavailable catalogue scope soft',async()=>{
 const {readFileSync}=await import('node:fs')
 const titles=JSON.parse(readFileSync(new URL('../public/ask-statute-titles.json',import.meta.url)))
 for(const catalogue of [titles,null])for(const [question,jurisdiction]of [
  ["What did MPs say about climate change? ACT senators' statements, please.",'act'],
  ['While MPs debated climate change, ACT senators discussed housing.','act'],
  ['While MPs debated climate change—ACT senators discussed housing.','act'],
  ['While MPs debated climate change–ACT senators discussed housing.','act'],
  ['What changed under the Australian Capital Territory (Self-Government) Act 1988?',undefined],
  ['What did MPs say about the Australian Capital Territory (Self-Government) Amendment Act?',undefined],
  ['What did MPs say about the Australian Capital Territory (Planning and Land Management) Amendment Act?',undefined],
  ['What did MPs say about the A.C.T. (Planning and Land Management (Amendment)) Regulations?',undefined],
 ]){
  let observed,reads=0
  const f=fixtures(model([reply([call('search',{query:'housing'})]),reply([call('decline',{reason:'ambiguous'})])]),{searchBody:(_q,_n,context)=>{observed=context.constraints.jurisdiction;return {query:'housing'}}})
  f.deps.asset=async path=>{if(path==='/ask-statute-titles.json'){reads++;return catalogue}return null}
  await f.run(question);assert.equal(reads,1)
  assert.equal(observed,catalogue?jurisdiction:undefined,question)
 }
})
