// One record fact reaches the answer once. Seen live on 15 November 2026: "What were Jo Briskey's itemised travel
// expenses for 2026?" gave her term of service in two paragraphs. The loop had selected the service record as a fact
// and also written a point resting on it, and both spans of the answer cited that one record.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {importBundle} from './fixtures/import-bundle.mjs';
const bundled=await build({stdin:{contents:"export {writingFacts,appendWrittenPoints,writingPrompt,EACH_FACT_ONCE_RULE} from './src/research-writing'; export {runAgentic,inferPeriod} from './src/agentic-ask'",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']});
const api=await importBundle(bundled.outputFiles[0].text,'ask-each-fact-once');

const url='https://opax.com.au/subject/person/jo-briskey';
const service='Jo Briskey served in the House of Representatives for Maribyrnong from 3 May 2025, ongoing as at 4 September 2026.';
const point='Jo Briskey is the Labor member for Maribyrnong in the House of Representatives, having served since 3 May 2025, so the 2026 figures fall within her current term.';
const expenses='Jo Briskey: $318,774 in reported parliamentary expenses for 2026; itemised lines for that year are not loaded.';
const record=(n,text,link)=>({resource:`fact-${n}`,slug:'',title:text,href:link,url:link,snippet:text,cited:true,kind:'record'});
const span=(answer,text)=>{const at=Array.from(answer.slice(0,answer.indexOf(text))).length;return [at,at+Array.from(text).length]};
/** The loop's answer as compose() builds it: each selected record fact as its own line, then the model's points. */
const loopAnswer=()=>{
 const answer=`- ${expenses}\n- ${service}\n${point}`;
 return {answer,answer_decision:'answer',sources:[record(1,expenses,'https://opax.com.au/expenses/jo-briskey'),record(2,service,url)],
  citations:{'fact-1/t/body/0':[span(answer,expenses)],'fact-2/t/body/0':[span(answer,service)],'fact-2':[span(answer,point)]}};
};

test('a record cited by its own line and by a point resting on it is one writer fact, in the record\'s words',()=>{
 const facts=api.writingFacts(loopAnswer());
 assert.deepEqual(facts.map(f=>f.text),[expenses,service]);
});
test('a point that is the only citation of a record still reaches the writer as written',()=>{
 const answer=`- ${expenses}\n${point}`;
 const facts=api.writingFacts({answer,answer_decision:'answer',sources:[record(1,expenses,'https://opax.com.au/expenses/jo-briskey'),record(2,service,url)],
  citations:{'fact-1/t/body/0':[span(answer,expenses)],'fact-2':[span(answer,point)]}});
 assert.deepEqual(facts.map(f=>f.text),[expenses,point]);
});
test('two different lines of one larger record stay two writer facts',()=>{
 const first='The report found the scheme was unlawful.',second='The report recommended 57 changes.';
 const answer=`${first}\n${second}`,source={...record(3,first+'\n'+second,'https://example.org/report')};
 const facts=api.writingFacts({answer,answer_decision:'answer',sources:[source],citations:{'fact-3/t/body/0':[span(answer,first)],'fact-3':[span(answer,second)]}});
 assert.deepEqual(facts.map(f=>f.text),[first,second]);
});
const lead='The published record holds no itemised travel lines for Jo Briskey for 2026; the year\'s reported total is $318,774.';
const sentence='Jo Briskey has served as the Labor member for Maribyrnong in the House of Representatives since 3 May 2025, ongoing as at 4 September 2026.';
const writtenWith=(recordText,stated)=>{const text=lead+'\n\n'+stated;return {answer:text,answer_decision:'answer',sources:[record(1,expenses,'https://opax.com.au/expenses/jo-briskey'),record(2,recordText,url)],citations:{'fact-1/t/body/0':[span(text,lead)],'fact-2/t/body/0':[span(text,stated)]}}};
const pointsOn=(recordText,...claims)=>{const answer=claims.join('\n');return {answer,answer_decision:'answer',sources:[record(2,recordText,url)],citations:{'fact-2':claims.map(claim=>span(answer,claim))}}};

test('a point that is the record\'s own statement again is not added after a written sentence citing that record',()=>{
 const out=api.appendWrittenPoints(writtenWith(service,sentence),pointsOn(service,service));
 assert.equal(out.answer,lead+'\n\n'+sentence);
});
// The review question (rv-pr422): one record can carry two different claims. Neither may be lost.
const twoClaims='Pat Example served in the Senate for Tasmania from 1 July 2019, ongoing as at 4 September 2026; Liberal until 12 March 2023, then Independent.';
const term='Pat Example has served in the Senate for Tasmania since 1 July 2019.',change='Pat Example left the Liberal Party on 12 March 2023 and now sits as an Independent.';
test('a record carrying a term and a party change reaches the writer whole, and a point on its other claim is kept',()=>{
 const answer=`- ${twoClaims}\n${change}`;
 const facts=api.writingFacts({answer,answer_decision:'answer',sources:[record(2,twoClaims,url)],citations:{'fact-2/t/body/0':[span(answer,twoClaims)],'fact-2':[span(answer,change)]}});
 assert.deepEqual(facts.map(f=>f.text),[twoClaims],'the writer is given the record as recorded, with both claims in it');
 const out=api.appendWrittenPoints(writtenWith(twoClaims,term),pointsOn(twoClaims,change));
 assert.equal(out.answer,lead+'\n\n'+term+'\n\n'+change,'the party change is a different claim from the same record, so it stays');
});
test('an expenses record carrying a total and a period keeps a point on the period',()=>{
 const total='Jo Briskey: $318,774 in reported parliamentary expenses for 2026, covering January to June.';
 const stated='Jo Briskey\'s reported parliamentary expenses for 2026 total $318,774.',period='The 2026 figure for Jo Briskey covers the 6 months from January to June only.';
 const text=stated,written={answer:text,answer_decision:'answer',sources:[record(2,total,url)],citations:{'fact-2/t/body/0':[span(text,stated)]}};
 assert.equal(api.appendWrittenPoints(written,pointsOn(total,period)).answer,stated+'\n\n'+period);
});
test('a point in the model\'s own words on a record the written answer cites is kept: the writer, not this code, leaves that fact to it',()=>{
 const out=api.appendWrittenPoints(writtenWith(service,sentence),pointsOn(service,point));
 assert.equal(out.answer,lead+'\n\n'+sentence+'\n\n'+point);
});
test('the writer is told what the model\'s points already say; with none its prompt is unchanged',()=>{
 const input={question:'What were Jo Briskey\'s itemised travel expenses for 2026?',period:{kind:'all',label:''},facts:[]};
 const base=api.writingPrompt(input),told=JSON.parse(api.writingPrompt({...input,said:[point]}));
 assert.doesNotMatch(base,/"said"/);assert.equal(api.writingPrompt({...input,said:[]}),base);
 assert.deepEqual(told.said,[point]);assert.ok(told.contract.endsWith(api.EACH_FACT_ONCE_RULE));
 assert.match(api.EACH_FACT_ONCE_RULE,/Each fact appears once/);assert.doesNotMatch(api.EACH_FACT_ONCE_RULE,/\b(?:do not|never|must not|cannot)\b/i);
 const {said:_s,...rest}=told;
 assert.deepEqual({...rest,contract:rest.contract.slice(0,-api.EACH_FACT_ONCE_RULE.length)},JSON.parse(base));
});
test('the run hands its writer the model\'s points, and nothing when the loop wrote none',async()=>{
 const question='What were Jo Briskey\'s itemised travel expenses for 2026?',scope={people:[],parties:[],bills:[],ambiguous:false,unresolved:false};
 for(const withPoints of [true,false]){
  const loop=loopAnswer(),inputs=[];
  const qualitative=withPoints?loop:{...loop,answer:`- ${expenses}\n- ${service}`,citations:{'fact-1/t/body/0':loop.citations['fact-1/t/body/0'],'fact-2/t/body/0':loop.citations['fact-2/t/body/0']}};
  const research=Object.assign(async()=>({rounds:1,steps:[],results:[],selected:[],tokens:{input:0,output:0},qualitative,...(withPoints?{points:pointsOn(service,point)}:{})}),{writingWallMs:8000,
   write:async input=>{inputs.push(input);return writtenWith(service,sentence)}});
  await api.runAgentic(question,{asset:async()=>null,kb:async()=>({}),generate:async()=>{throw Error('planner must not run')},research},async()=>{},40_000,api.inferPeriod(question),{},scope);
  assert.equal(inputs.length,1);
  if(withPoints){assert.deepEqual(inputs[0].said,[point]);assert.deepEqual(inputs[0].facts.map(f=>f.text),[expenses,service],'and each record once, as recorded')}
  else assert.equal('said' in inputs[0],false);
 }
});
