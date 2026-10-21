import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {build} from 'esbuild'
import {MockLanguageModelV4} from 'ai/test'
import {coherenceCheck} from '../src/research-coherence.mjs'
import {auditPayload} from '../src/research-claim-audit.mjs'
import {gradeRow} from '../../scripts/research_eval_grade.mjs'
Error.stackTraceLimit=2
const b=await build({stdin:{contents:"export * from './src/research-grounding';export * from './src/research-response';export * from './src/research-writing';export * from './src/research-writer';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/research-coherence-pauline.json',import.meta.url)))
for(const stream of [false,true])for(const cache of [false,true])for(const fallback of [false,true])test(`coherent donor recovery: JSON/SSE=${stream}, cache=${cache}, fallback=${fallback}`,async()=>{
 const p={...structuredClone(fixture.payload),...(fallback?{research:{mode:'planner',failure:'grounding'}}:{})}
 // Reproduce a citation anchored only to a sentence's terminal punctuation.
 const k='fact-5/t/body/0',r=p.citations[k][0];p.citations[k]=[[r[1]-1,r[1]]]
 const headers={...(cache?{'x-opax-cache':'HIT'}:{}),...(stream?{'content-type':'text/event-stream'}:{})}
 const response=stream?new Response('event: delta\ndata: '+JSON.stringify({text:p.answer})+'\n\nevent: done\ndata: '+JSON.stringify(p)+'\n\n',{headers}):Response.json(p,{headers})
 const wire=await(await api.withAnswerLanguage(response,fixture.question)).text(),out=stream?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire)
 assert.match(out.answer.split('\n')[0],/Westpac Banking Corporation.*161,787.*1998-99 to 2025-26/)
 assert.equal(coherenceCheck(fixture.question,out).pass,true)
 assert.equal(auditPayload(fixture.question,out).findings.length,0)
 assert.ok(out.citations['fact-1/t/body/0']);assert.ok(out.citations[k]);assert.equal(out.coherence.fallback,true)
 assert.equal((out.answer.match(/not evidence/g)??[]).length,1)
 assert.deepEqual(api.groundAnswerPayload(out,fixture.question),out)
})
const source={resource:'salary',title:'Salary',kind:'record',snippet:'Avery Example: $100,000 annual salary.',cited:true,href:'https://example.org',url:'https://example.org',slug:''}
test('only an unsupported secondary figure is removed, preserving the sentence and citation',()=>{
 const answer='Avery Example earned an annual salary entitlement of $100,000, plus $999.'
 const out=api.groundAnswerPayload({answer,sources:[source],citations:{'salary/t/body/0':[[0,answer.length]]}},'What was Avery Example paid?')
 assert.equal(out.answer,'Avery Example earned an annual salary entitlement of $100,000.');assert.ok(out.citations['salary/t/body/0']);assert.equal(auditPayload('',out).findings.length,0)
})
for(const prefix of ['Other ','Also, ','In addition, ','Further, ','However, ','Meanwhile, '])test('safe opener repair: '+prefix,()=>{
 const answer=prefix+'Avery Example earned a salary of $100,000.'
 const out=api.groundAnswerPayload({answer,sources:[source],citations:{'salary/t/body/0':[[0,answer.length]]}},'What was Avery Example paid?')
 assert.equal(out.answer,'Avery Example earned a salary of $100,000.');assert.ok(out.citations['salary/t/body/0'])
})
test('orphan paragraph and marker lose their citation, keeping a short legitimate punctuation anchor',()=>{
 const answer='Avery Example earned a salary of $100,000.\n\n.\n\n[2]'
 const p={answer,sources:[source,{...source,resource:'orphan'}],citations:{'salary/t/body/0':[[40,41]],'orphan/t/body/0':[[43,44]]}}
 const out=api.cleanAnswerShape(p);assert.equal(out.answer,'Avery Example earned a salary of $100,000.');assert.ok(out.citations['salary/t/body/0']);assert.equal(out.citations['orphan/t/body/0'],undefined)
})
test('coherence grader fails absent leader, dangling opener, orphan and excessive stripping on either arm',()=>{
 const p=fixture.live_fragment
 assert.equal(gradeRow({question:fixture.question},p).axes.coherence,'fail')
 assert.equal(coherenceCheck('What was paid?',{answer:'Also, an answer.',citations:{}}).pass,false)
 assert.equal(coherenceCheck('What was paid?',{answer:'An answer.\n\n.',citations:{x:[[12,13]]}}).pass,false)
 assert.equal(coherenceCheck('What was paid?',{answer:'An answer.',coherence:{stripped_ratio:0.5}}).pass,false)
 assert.equal(coherenceCheck('What was paid?',{answer:'An answer.',coherence:{stripped_ratio:0.5,fallback:true}},{direct:true}).pass,true)
})
const response=text=>({content:[{type:'text',text:JSON.stringify({sentences:[{text,facts:[1]}]})}],finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:10},outputTokens:{total:10}},warnings:[]})
test('at most one second writer uses surviving facts, same model/token ceiling and shared wall reserve',async()=>{
 let calls=0;const model=new MockLanguageModelV4({doGenerate:()=>response(++calls===1?'Bill Shorten said "I support the bill".':'Avery Example said "I support the bill".')})
 const fact={id:1,text:'I support the bill.',source:{...source,resource:'speech',kind:'speech',speaker:'Avery Example',snippet:'I support the bill.'}}
 const stats={rounds:1,tokens:{input:0,output:0}}
 const write=api.createAnswerWriter({model,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})}})
 const out=await write({question:'What did Avery Example say?',period:{kind:'all',label:''},facts:[fact]},stats,undefined,3000)
 assert.ok(calls<=2);assert.equal(auditPayload('',out).findings.length,0)
 for(const c of model.doGenerateCalls)assert.equal(c.maxOutputTokens,1400)
})
test('a supported donor draft uses its aggregate period and passes both existing checkers',()=>{
 const text='Westpac Banking Corporation gave One Nation $161,787 (federal disclosures; financial years 1998-99 to 2025-26) — AEC annual return · 2011-12 · https://transparency.aec.gov.au/'
 const facts=api.writingFacts(undefined,[{id:1,text,cite:{kind:'export',url:'https://example.org/aec',label:'Disclosed donation'}}])
 const input={question:fixture.question,period:{kind:'all',label:''},facts}
 const line='Westpac Banking Corporation provided the most disclosed funding to One Nation, with $161,787 in financial years 1998-99 to 2025-26.'
 const out=api.verifyWrittenAnswer({sentences:[{text:line,facts:[1]}]},input)
 assert.equal(out.answer,line);assert.equal(auditPayload(fixture.question,out).findings.length,0);assert.equal(coherenceCheck(fixture.question,out).pass,true)
 assert.equal(facts[0].atoms[0].unit,'AUD');assert.equal(facts[0].atoms[0].period.label,'1998-99 to 2025-26')
})
test('a coherent supported draft uses one writing call and no second pass',async()=>{
 const model=new MockLanguageModelV4({doGenerate:()=>response('Avery Example earned a salary of $100,000.')})
 const stats={rounds:1,tokens:{input:0,output:0}},write=api.createAnswerWriter({model,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})}})
 const out=await write({question:'What salary did Avery Example earn?',period:{kind:'all',label:''},facts:[{id:1,text:source.snippet,source}]},stats,undefined,3000)
 assert.equal(model.doGenerateCalls.length,1);assert.equal(stats.coherence.second_passes,0);assert.equal(out.answer,'Avery Example earned a salary of $100,000.')
})
test('a second writer receives only surviving evidence, with both reservations settled',async()=>{
 let calls=0;const settled=[]
 const model=new MockLanguageModelV4({doGenerate:()=>{const r=response('Avery Example earned a salary of $100,000.');if(++calls===1)r.content[0].text=JSON.stringify({sentences:[{text:'Avery Example earned a salary of $100,000.',facts:[1]},{text:'Bill Shorten said "I support the bill".',facts:[2]}]});return r}})
 const stats={rounds:1,tokens:{input:0,output:0}},write=api.createAnswerWriter({model,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async n=>settled.push(n)})}})
 const input={question:'What salary and remarks do the records establish?',period:{kind:'all',label:''},facts:[{id:1,text:source.snippet,source},{id:2,text:'I support the bill.',source:{...source,resource:'other',kind:'speech',speaker:'Avery Example',snippet:'I support the bill.'}}]}
 const out=await write(input,stats,undefined,3000)
 assert.equal(calls,2);assert.equal(settled.length,2);assert.equal(stats.coherence.second_passes,1)
 const prompt=JSON.stringify(model.doGenerateCalls[1].prompt);assert.doesNotMatch(prompt,/support the bill/);assert.doesNotMatch(out.answer,/Bill Shorten/)
})
test('year-filtered disclosed-donor tables recover their leading donor and period',()=>{
 const source=(resource,snippet)=>({resource,snippet,kind:'receipt',title:'Disclosed donor records',cited:true})
 const sources=[source('receipt-ranking-1','Pratt Holdings Pty Ltd: $2,000,000, 2 disclosed receipt records. Period: 2023–24.'),source('receipt-ranking-2','United Workers Union: $953,447, 14 disclosed receipt records. Period: 2023–24.'),source('receipt-ranking-0','Opax added the disclosed receipts matching this question, grouped by donor. This selection covers 119 donors during 2023–24. It excludes government funding.')]
 const answer='Other donors included United Workers Union at $953,447.',p={answer,sources,citations:{'receipt-ranking-2/t/body/0':[[0,answer.length]]}}
 const out=api.groundAnswerPayload(p,'Who gave the most disclosed funding to Labor in 2023?')
 assert.match(out.answer.split('\n')[0],/Pratt Holdings Pty Ltd.*2,000,000.*2023–24/)
 assert.equal(coherenceCheck('Who gave the most disclosed funding to Labor in 2023?',out).pass,true);assert.equal(auditPayload('',out).findings.length,0)
})
test('an incorrect party adjective is repaired without changing quotation ownership',()=>{
 const answer='Liberal Bill Shorten said “I support the bill”.'
 const source={resource:'p',snippet:'I support the bill.',kind:'speech',speaker:'Bill Shorten',party:'Labor',cited:true}
 const out=api.groundAnswerPayload({answer,sources:[source],citations:{'p/t/body/0':[[0,answer.length]]}},'What did Bill Shorten say?')
 assert.equal(out.answer,'Bill Shorten said “I support the bill”.');assert.ok(out.citations['p/t/body/0']);assert.equal(auditPayload('',out).findings.length,0)
})
test('selected donor initials never turn a complete organisation name into a sentence fragment',()=>{
 const rows=[['LGT Crestone Wealth Management Limited','$8,857,209'],['J.J. Richards & Sons Pty Ltd','$1,000,000']]
 const facts=rows.map(([name,amount],i)=>{const text=`${name} gave LNP ${amount} (federal disclosures; financial years 1998-99 to 2025-26)`;return {id:i+1,text,source:{resource:'fact-'+(i+1),kind:'export',title:name,snippet:text,cited:true}}})
 const input={question:'Who gives the most money to LNP?',period:{kind:'all',label:''},facts}
 const out=api.groundAnswerPayload(api.proseFallback(input),input.question)
 assert.match(out.answer,/“J\.J\. Richards & Sons Pty Ltd”.*1,000,000/);assert.ok(out.citations['fact-2/t/body/0']);assert.equal(auditPayload(input.question,out).findings.length,0);assert.equal(coherenceCheck(input.question,out).pass,true)
})
test('native ranked-money tables retain the true leader when a selected prose subset omits it',()=>{
 const f=JSON.parse(fs.readFileSync(new URL('./fixtures/research-coherence-native-donors.json',import.meta.url)))
 const out=api.groundAnswerPayload(f.payload,f.question)
 assert.match(out.answer.split('\n')[0],/Westpac Banking Corporation.*55,227,183.*1998[–-]99 to 2025[–-]26/)
 assert.equal(coherenceCheck(f.question,out).pass,true);assert.equal(auditPayload(f.question,out).findings.length,0)
})
test('a supported speech-ranking lead is repaired while retaining the year and coverage citations',()=>{
 const lines=['By year, federal gambling speeches numbered 38 in 2022.','Further down, David Coleman recorded 11 gambling speeches, while Kate Chaney recorded 10.','Committee-hearing turns are excluded.']
 const snippets=['2022: 38 chamber speeches labelled gambling in federal parliament from 2022-01-01.','David Coleman: 11 chamber speeches labelled gambling in federal parliament from 2022-01-01.\nKate Chaney: 10 chamber speeches labelled gambling in federal parliament from 2022-01-01.','Committee-hearing turns are excluded.']
 let answer='';const citations={},sources=[]
 for(let i=0;i<lines.length;i++){if(answer)answer+='\n\n';const start=answer.length;answer+=lines[i];citations['fact-'+i+'/t/body/0']=[[start,answer.length]];sources.push({resource:'fact-'+i,kind:'count',title:'Selected speech counts',snippet:snippets[i],cited:true})}
 const q='Which federal politicians made the most speeches about gambling since 2022?',out=api.groundAnswerPayload({answer,citations,sources},q)
 assert.match(out.answer,/^David Coleman led the selected ranking with 11/);assert.match(out.answer.split('\n')[0],/2022-01-01/);assert.match(out.answer,/38 in 2022/);assert.match(out.answer,/Committee-hearing turns are excluded/);assert.deepEqual(Object.keys(out.citations).sort(),Object.keys(citations).sort());assert.equal(auditPayload(q,out).findings.length,0)
})
