// One record fact reaches the answer once. Seen live on 15 November 2026: "What were Jo Briskey's itemised travel
// expenses for 2026?" gave her term of service in two paragraphs. The loop had selected the service record as a fact
// and also written a point resting on it, and both spans of the answer cited that one record.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {importBundle} from './fixtures/import-bundle.mjs';
const bundled=await build({stdin:{contents:"export {writingFacts,appendWrittenPoints,writingPrompt,pointsBeyondRecords,ALSO_WRITING_RULE} from './src/research-writing'; export {runAgentic,inferPeriod} from './src/agentic-ask'",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']});
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
 // The point's wording stays beside its record, so the one sentence about it can carry what the point adds.
 assert.deepEqual(facts.map(f=>f.also),[undefined,[point]]);
 assert.ok(facts[1].source.snippet.includes(point),'and it is evidence for that sentence');
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

// Review of c54f0737e (rv-pr422, P1): the writer may state only part of a record, and is now asked to leave facts to
// the model's points. A point repeating the record word for word must still bring the part the writer left out.
test('a point repeating a record word for word keeps the total when the written answer gave only the caveat',()=>{
 const caveat='The itemised travel lines for Jo Briskey for 2026 are not loaded.';
 const written={answer:caveat,answer_decision:'answer',sources:[record(1,expenses,'https://opax.com.au/expenses/jo-briskey')],citations:{'fact-1/t/body/0':[span(caveat,caveat)]}};
 const points={answer:expenses,answer_decision:'answer',sources:[record(1,expenses,'https://opax.com.au/expenses/jo-briskey')],citations:{'fact-1':[span(expenses,expenses)]}};
 const out=api.appendWrittenPoints(written,points);
 assert.match(out.answer,/\$318,774/,'the total is only in the point, so the point stays');
 assert.ok(out.answer.startsWith(caveat));
});
// Review P2: one paragraph of a bill's text or of a division is a passage of a larger resource, not the whole record.
test('a one-paragraph passage is not taken for the whole record: a fact from another paragraph of it is kept',()=>{
 for(const kind of ['bill_text','division','speech']){
  const paragraph='Section 12 requires the Minister to publish each determination within 14 days.',other='Section 30 sets a penalty of 60 penalty units for a failure to report.';
  const answer=`${paragraph}\n${other}`,source={resource:'bill-7',slug:'bill-7',title:'Example Bill 2026',href:'https://opax.com.au/bill/example',url:'https://opax.com.au/bill/example',snippet:paragraph,cited:true,kind};
  const facts=api.writingFacts({answer,answer_decision:'answer',sources:[source],citations:{'bill-7/t/body/0-80':[span(answer,paragraph)],'bill-7/t/body/900-970':[span(answer,other)]}});
  assert.deepEqual(facts.map(f=>f.text),[paragraph,other],kind);
 }
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
// 15 November follow-up: the writer was briefly told what the model's points say ("said") and asked to leave those
// facts to them. In the harness runs it left a fact out that the later checks then removed from the point too, so the
// instruction is gone. The writer's prompt holds the question, the period, the facts and its contract, and no more.
test('the writer prompt carries no list of the model\'s points and no instruction to leave facts to them',()=>{
 const input={question:'What were Jo Briskey\'s itemised travel expenses for 2026?',period:{kind:'all',label:''},facts:[]};
 const base=api.writingPrompt(input),withPoints=api.writingPrompt({...input,said:[point]});
 assert.equal(withPoints,base);
 assert.deepEqual(Object.keys(JSON.parse(base)).sort(),['contract','facts','period','question']);
 assert.doesNotMatch(base,/"said"|leave to them|leave out/);
});
test('the run hands its writer each record once, as recorded, and never the model\'s points',async()=>{
 const question='What were Jo Briskey\'s itemised travel expenses for 2026?',scope={people:[],parties:[],bills:[],ambiguous:false,unresolved:false};
 for(const withPoints of [true,false]){
  const loop=loopAnswer(),inputs=[];
  const qualitative=withPoints?loop:{...loop,answer:`- ${expenses}\n- ${service}`,citations:{'fact-1/t/body/0':loop.citations['fact-1/t/body/0'],'fact-2/t/body/0':loop.citations['fact-2/t/body/0']}};
  const research=Object.assign(async()=>({rounds:1,steps:[],results:[],selected:[],tokens:{input:0,output:0},qualitative,...(withPoints?{points:pointsOn(service,point)}:{})}),{writingWallMs:8000,
   write:async input=>{inputs.push(input);return writtenWith(service,sentence)}});
  await api.runAgentic(question,{asset:async()=>null,kb:async()=>({}),generate:async()=>{throw Error('planner must not run')},research},async()=>{},40_000,api.inferPeriod(question),{},scope);
  assert.equal(inputs.length,1);
  assert.equal('said' in inputs[0],false);
  assert.deepEqual(inputs[0].facts.map(f=>f.text),[expenses,service],'each record once, as recorded');
 }
});

// One voice per kind of evidence (16 November): the writer's sentence is the one statement of a tool record, with the
// model's wording of that record beside the fact; only the model's points on passages, or on nothing, follow it.
const speechSource={resource:'speech-9',slug:'speech-9',title:'Expenses debate',href:'https://opax.com.au/doc/speech-9',url:'https://opax.com.au/doc/speech-9',snippet:'travel claims should be published monthly',cited:true,kind:'speech',speaker:'Jo Briskey',date:'2026-03-02'};
const speech='Jo Briskey told the House on 2 March 2026 that travel claims should be published monthly.',context='IPEA is the independent authority that reports these expenses.';
const mixedPoints=()=>{const answer=[point,speech,context].join('\n');return {answer,answer_decision:'answer',sources:[record(2,service,url),speechSource],citations:{'fact-2':[span(answer,point)],'speech-9/t/body/0-40':[span(answer,speech)]}}};
test('points resting only on tool records are left to the writer; passage points and uncited points are kept, with their citations',()=>{
 const out=api.pointsBeyondRecords(mixedPoints());
 assert.equal(out.answer,speech+'\n'+context);
 assert.deepEqual(Object.fromEntries(Object.entries(out.citations).map(([id,ranges])=>[id,ranges.map(([a,b])=>Array.from(out.answer).slice(a,b).join(''))])),{'speech-9/t/body/0-40':[speech]});
 assert.deepEqual(out.sources.map(s=>s.resource),['speech-9']);
});
test('the writer contract asks for one sentence carrying the researcher\'s detail only when a fact has it',()=>{
 const input={question:'What were Jo Briskey\'s itemised travel expenses for 2026?',period:{kind:'all',label:''},facts:api.writingFacts(loopAnswer())};
 const told=JSON.parse(api.writingPrompt(input)),plain=JSON.parse(api.writingPrompt({...input,facts:input.facts.map(({also:_a,...f})=>f)}));
 assert.ok(told.contract.endsWith(api.ALSO_WRITING_RULE));assert.deepEqual(told.facts[1].also,[point]);
 assert.equal(plain.contract+api.ALSO_WRITING_RULE,told.contract);assert.equal('also' in plain.facts[1],false);
 assert.doesNotMatch(api.ALSO_WRITING_RULE,/\b(?:do not|never|must not|cannot)\b/i);
});
test('once the writer has written, a record is stated once: its sentence stands, and only passage and uncited points follow',async()=>{
 const question='What were Jo Briskey\'s itemised travel expenses for 2026?',scope={people:[],parties:[],bills:[],ambiguous:false,unresolved:false};
 const run=async coherence=>{
  const research=Object.assign(async()=>({rounds:1,steps:[],results:[],selected:[],tokens:{input:0,output:0},qualitative:loopAnswer(),points:mixedPoints()}),{writingWallMs:8000,
   write:async(_input,stats)=>{stats.coherence=coherence;return writtenWith(service,sentence)}});
  return (await api.runAgentic(question,{asset:async()=>null,kb:async()=>({}),generate:async()=>{throw Error('planner must not run')},research},async()=>{},40_000,api.inferPeriod(question),{},scope)).answer;
 };
 const written=await run({writer_passes:1});
 assert.equal((written.match(/3 May 2025/g)??[]).length,1,written);
 assert.ok(written.includes(sentence)&&written.includes(speech)&&written.includes(context)&&!written.includes(point));
 // A writer that did not write (facts as recorded, or a stopped draft) keeps every point: nothing is lost.
 for(const coherence of [undefined,{writer_passes:1,fallback:true}])assert.ok((await run(coherence)).includes(point));
});
