// A loop answer made of record facts and the model's own points keeps its citations. Until 16 November 2026 the loop
// cleared its citation map and refilled it from the led answer, which was that same map whenever the lead stayed put:
// every fact and point left the loop uncited, and the model's points never reached the writer's fact sheet.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {scriptedResearchModel} from './fixtures/research-scripted-model.mjs';
import {importBundle} from './fixtures/import-bundle.mjs';
const bundled=await build({stdin:{contents:"export {createResearch} from './src/research-loop'; export {inferPeriod} from './src/agentic-ask'; export {createResearchCreditCooldown} from './src/research-credit'; export {ledAnswer,leadWithModelAnswer} from './src/research-answer-shape'",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']});
const api=await importBundle(bundled.outputFiles[0].text,'ask-led-answer');

const url='https://opax.com.au/subject/person/jo-briskey';
const point='Jo Briskey is the Labor member for Maribyrnong in the House of Representatives, having served since 3 May 2025.';
const found={tool:'find_people',ok:true,data:{match_status:'matched',people:[{name:'Jo Briskey',party:'Labor',service:[{jurisdiction:'federal',chamber:'representatives',electorate:'Maribyrnong',start:'2025-05-03',end:null,ongoing:true,as_of:'2026-09-04',source:'roster',url}]}]},cite:[{kind:'record',label:'Jo Briskey',url}],notes:[]};
const question='What seat does Jo Briskey hold and since when?';
const run=async()=>{
 const model=scriptedResearchModel([{tool_calls:[{name:'find_people',id:'p',args:{name:'Jo Briskey'}}]},
  {tool_calls:[{name:'answer',id:'a',args:{facts:[2],points:[{claim:point,id:'fact-2',quote:'served in the House of Representatives for Maribyrnong from 3 May 2025'}]}}]}]);
 const research=api.createResearch({model,inputPrice:0.1,outputPrice:0.3,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})},creditCooldown:api.createResearchCreditCooldown()});
 const deps={asset:async()=>null,kb:async()=>({}),origin:'https://opax.com.au'},progress=async()=>{};
 return research(question,{deps,period:api.inferPeriod(question),named:{people:[],parties:[],bills:[],ambiguous:false,unresolved:false},signal:new AbortController().signal,progress,scope:step=>step,
  execute:async(step,_round,custom)=>step.tool==='find_people'?structuredClone(found):custom(deps)});
};
test('a loop answer with a selected record and a point on it leaves the loop with both cited',async()=>{
 const {qualitative}=await run();
 assert.ok(qualitative,'the loop answered');
 const cited=Object.fromEntries(Object.entries(qualitative.citations).map(([id,ranges])=>[id,ranges.map(([a,b])=>Array.from(qualitative.answer).slice(a,b).join(''))]));
 assert.ok(Object.keys(cited).length>0,'the answer keeps its citations: '+JSON.stringify(qualitative.answer));
 assert.ok(Object.values(cited).flat().includes(point),'the point is cited to its record: '+JSON.stringify(cited));
 assert.ok(Object.values(cited).flat().some(text=>/served in the House of Representatives for Maribyrnong from 3 May 2025/.test(text)),'and so is the selected record');
});
test('the led answer carries its citations in a map of its own, whether or not the lead moves',()=>{
 const answer='- Record line one.\nA point of the model.',citations={'fact-1/t/body/0':[[2,18]],'fact-1':[[19,40]]};
 const led=api.ledAnswer(answer,citations,{answer:'A point of the model.',citations:{'fact-1':[[0,21]]}},'How many are there?');
 assert.notEqual(led.citations,citations);
 const before=structuredClone(citations);
 for(const key of Object.keys(citations))delete citations[key];Object.assign(citations,led.citations);
 assert.deepEqual(citations,before);
});
