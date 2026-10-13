import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {MockLanguageModelV4} from 'ai/test';
const built=await build({stdin:{contents:"export * from './src/agentic-ask';export * from './src/agentic-response';export * from './src/research-loop';export * from './src/research-types';export * from './src/research-credit';export * from './src/agentic-tools';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']});
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const call=(name,args,id='fixture')=>({type:'tool-call',toolName:name,toolCallId:id,input:JSON.stringify(args)});
const reply=calls=>({content:calls,finishReason:{unified:'tool-calls',raw:'tool_calls'},usage:{inputTokens:{total:10,noCache:10,cacheRead:0,cacheWrite:0},outputTokens:{total:5,text:5,reasoning:0}},warnings:[]});
const roster={people:[{name:'Taylor Example',party:'Labor'},{name:'Pat Example',party:'Greens'}]};
const trendQuestion='How has the number of gambling speeches changed each year since 2015, and who led it?';
function run(question,responses){
  let plannerCalls=0;const failures=[],m=new MockLanguageModelV4({doGenerate:responses});
  const deps={asset:async path=>path==='/parliamentarians.json'?roster:null,kb:async()=>({fulltext:{total:100,facets:{'/u/o':{'/u/o/Taylor Example':87,'/u/o/Pat Example':13}}}}),
    generate:async()=>{plannerCalls++;return {text:'{}'}},onResearchFailure:async e=>failures.push(e),
    research:api.createResearch({model:m,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})},creditCooldown:api.createResearchCreditCooldown()})};
  const scope=api.extractNamedScope(question,roster,null);
  return api.runAgentic(question,deps,async()=>{},40_000,api.inferPeriod(question),{},scope).then(out=>({out,failures,plannerCalls,model:m,scope}));
}
test('pronouns and "who led it" do not mark a trend question as naming an unresolved person',()=>{
  assert.equal(api.extractNamedScope(trendQuestion,roster,null).unresolved,false);
  // An explicit person slot with an unknown name stays unresolved.
  assert.equal(api.extractNamedScope('How many speeches has Bob Lead made on gambling?',roster,null).unresolved,true);
});
test('a year-by-year trend finish keeps every selected year and the leaders, not the first eight facts',async()=>{
  const facts=Array.from({length:14},(_,i)=>i+1);
  const {out,failures}=await run(trendQuestion,[reply([call('speech_trend',{topic:'gambling',by:'year',from_year:2015},'a'),call('count_speeches',{topic:'gambling',group_by:'speaker',since:'2015-01-01'},'b')]),reply([call('finish',{facts},'c')])]);
  assert.deepEqual(failures,[]);assert.equal(out.answered,true);assert.equal(out.research.mode,'loop');
  for(const year of ['2015','2022','2026'])assert.match(out.answer,new RegExp(`${year}: 100 `));
  assert.match(out.answer,/Taylor Example: 100/);
});
test('one invalid lookup argument is answered with its reason and may be corrected; a second ends the run',async()=>{
  const good={topic:'gambling',group_by:'speaker',since:'2015-01-01'};
  const fixed=await run(trendQuestion,[reply([call('count_speeches',{...good,topic:'gambling-reform'},'a')]),reply([call('count_speeches',good,'b')]),reply([call('finish',{facts:[1]},'c')])]);
  assert.equal(fixed.out.answered,true);assert.equal(fixed.out.research.mode,'loop');
  const sent=JSON.stringify(fixed.model.doGenerateCalls[1].prompt);assert.match(sent,/topic must be one of gambling/);
  const twice=await run(trendQuestion,[reply([call('count_speeches',{...good,limit:99},'a')]),reply([call('count_speeches',{...good,topic:'bets'},'b')]),reply([call('finish',{facts:[1]},'c')])]);
  assert.equal(twice.failures[0].reason,'malformed_args');assert.notEqual(twice.out.research.mode,'loop');
});
test('null and empty optional arguments count as unset',async()=>{
  const {out,failures}=await run(trendQuestion,[reply([call('count_speeches',{topic:'gambling',group_by:'speaker',since:'2015-01-01',party:null,speaker:'',state:null},'a')]),reply([call('finish',{facts:[1]},'b')])]);
  assert.deepEqual(failures,[]);assert.equal(out.answered,true);assert.equal(out.steps[0].args.party,undefined);
});
test('toolArgProblem names the first invalid argument',()=>{
  assert.equal(api.toolArgProblem('count_speeches',{topic:'gambling'}),null);
  assert.match(api.toolArgProblem('count_speeches',{limit:20}),/limit must be between 1 and 15/);
  assert.match(api.toolArgProblem('count_speeches',{since:'2015'}),/since must be a real YYYY-MM-DD date/);
  assert.match(api.toolArgProblem('count_speeches',{colour:'red'}),/unknown argument colour/);
  assert.equal(api.validToolArgs('member_votes',{keyword:'gambling'}),false);
});
