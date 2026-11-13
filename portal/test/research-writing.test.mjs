import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {MockLanguageModelV4} from 'ai/test'
import {gradeRow,answerStyleChecks} from '../../scripts/research_eval_grade.mjs'
const bundled=await build({stdin:{contents:"export * from './src/research-writing'; export * from './src/research-writer'; export * from './src/research-response'; export {inferPeriod} from './src/agentic-ask';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']})
const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'))
const question='Who is the highest paid politician in 2005?',period=api.inferPeriod(question)
const source=(resource,snippet)=>({resource,slug:'',title:'Dated salary entitlement',href:'https://example.org/tribunal',url:'https://example.org/tribunal',snippet,cited:true,kind:'record'})
const texts=['Robin Example: $277,602 a year as Prime Minister, 2005-01-01 to 2005-06-30; base $106,770 plus 160%.','Robin Example: $288,990 a year as Prime Minister, 2005-07-01 to 2005-12-31; base $111,150 plus 160%.','Coverage: Federal parliamentary salary records start on 7 December 1999 and run to 2026-10-19. Salary entitlements, not payslips; excludes electorate allowances, expenses, superannuation and outside income.']
const facts=texts.map((text,i)=>({id:i+1,text,source:source(`pay-${i}`,text),...(i===2?{coverage:true}:{})})),input={question,period,facts}
const prose='In 2005 Robin Example was the highest-paid federal parliamentarian, with an annual salary of $277,602 until 30 June and $288,990 from 1 July.'
const draft={sentences:[{text:prose,facts:[1,2]}]}
function check(body){
 assert.equal(api.rawToolEcho(body.answer),false)
 assert.deepEqual(answerStyleChecks(question,body.answer),{no_tool_echo:'pass',no_duplicates:'pass',direct_first_sentence:'pass'})
 assert.match(body.answer.split(/(?<=[.!?])\s/)[0],/Robin Example.*277,602.*288,990/)
 for(const amount of ['277,602','288,990'])assert.equal(body.answer.split(amount).length-1,1)
 assert.ok(Object.values(body.citations).flat().every(([a,b])=>a>=0&&a<b&&b<=Array.from(body.answer).length))
 assert.doesNotMatch(body.answer,/exclude allowances/)
 assert.equal((body.coverage?.note.match(/exclude allowances/g)||[]).length,1)
}
test('model writes selected calculator facts with original citations and a separate coverage note',()=>{
 const written=api.verifyWrittenAnswer(draft,input);check(written)
 assert.equal(written.answer.split('\n\n')[0],prose)
 assert.deepEqual(written.citations['pay-0/t/body/0'],[[0,Array.from(prose).length]])
})
test('overlapping complete calculator and reversed individual facts do not duplicate salary steps',()=>{
 const answer=texts.join('\n')+'\n'+[...texts].reverse().join('\n'),s=source('fact-1',answer)
 const sheet=api.writingFacts({answer,citations:{'fact-1/t/body/0':[[0,answer.length]]},sources:[s]})
 assert.equal(sheet.length,3);check(api.proseFallback({...input,facts:sheet}))
})
test('unsupported figures are removed locally while the supported answer survives',()=>{
 const written=api.verifyWrittenAnswer({sentences:[{text:prose,facts:[1,2]},{text:'The salary entitlement excludes allowances, with $999,999 in invented expenses.',facts:[3],coverage:true}]},input)
 assert.doesNotMatch(written.answer,/999,999/);assert.match(written.answer,/Robin Example.*277,602/)
})
test('the writer keeps a reworded date as written',()=>{
 const text=prose.replace('1 July','1 August'),out=api.verifyWrittenAnswer({sentences:[{text,facts:[1,2]}]},input)
 assert.equal(out.answer,text)
})
test('raw rate lines, coverage blocks and repeated figure sets cannot pass through',()=>{
 for(const text of [texts[0],texts[2]])assert.equal(api.verifyWrittenAnswer({sentences:[{text,facts:[1,2]}]},input),null)
 // The writer has no figure cut: a written amount the facts do not hold is kept as written.
 const kept=api.verifyWrittenAnswer({sentences:[{text:prose.replace('$277,602','$999,999'),facts:[1,2]}]},input);assert.equal(kept.answer,prose.replace('$277,602','$999,999'))
 check(api.verifyWrittenAnswer({sentences:[...draft.sentences,...draft.sentences,{text:'Robin Example received $277,602 and $288,990 in annual salary rates.',facts:[1,2]}]},input))
})
const response=text=>({content:[{type:'text',text}],finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:10,noCache:10,cacheRead:0,cacheWrite:0},outputTokens:{total:5,text:5,reasoning:0}},warnings:[]})
test('same model and budget; failed, timed-out and unadmitted writing calls return prose',async()=>{
 for(const mode of ['written','error','timeout','denied']){
  const settlements=[],m=new MockLanguageModelV4({doGenerate:()=>mode==='error'?Promise.reject(Error('fixture failure')):mode==='timeout'?new Promise(()=>{}):response(JSON.stringify(draft))})
  const stats={rounds:2,tokens:{input:20,output:10},turns:[]}
  const write=api.createAnswerWriter({model:m,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>mode==='denied'?null:{settle:async n=>settlements.push(n)}}})
  check(await write(input,stats,undefined,mode==='timeout'?300:3000))
  assert.equal(m.doGenerateCalls.length,mode==='denied'?0:1);assert.equal(settlements.length,mode==='denied'?0:1)
  if(mode==='written')assert.equal(stats.tokens.input,30)
  if(mode==='timeout')assert.equal(stats.usageUnknown,true)
 }
})
test('JSON, chunked SSE fallback and replay release only validated written text',async()=>{
 const written=api.proseFallback(input),payload={...written,coverage:{...written.coverage,matched:true,since:'2005-01-01',until:'2005-12-31'}}
 for(const stream of [false,true]){
  const wire='event: delta\ndata: '+JSON.stringify({text:texts.join('\n')})+'\n\nevent: done\ndata: '+JSON.stringify(payload)+'\n\n'
  const response=stream?new Response(new ReadableStream({start(c){const bytes=new TextEncoder().encode(wire);for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close()}}),{headers:{'content-type':'text/event-stream'}}):Response.json(payload)
  const body=await(await api.withFallbackPeriod(response,period)).text()
  if(stream){assert.doesNotMatch(body,/event: delta/);check(JSON.parse(body.match(/^data: (.+)$/m)[1]))}else check(JSON.parse(body))
 }
})
test('legacy one-character anchors use source facts, with rebuilt prose spans',()=>{
 const legacy={answer:'.',citations:{'pay-0':[[0,1]],'pay-1':[[0,1]],'pay-2':[[0,1]]},sources:facts.map(f=>f.source)}
 const sheet=api.writingFacts(legacy)
 assert.equal(sheet[0].text,texts[0]);check(api.proseFallback({...input,facts:sheet}))
})
test('the writer keeps a written year as written, whatever the cited coverage date',()=>{
 const text='In 2026 Robin Example earned $277,602 as Prime Minister.',out=api.verifyWrittenAnswer({sentences:[{text,facts:[1,3]}]},input)
 assert.equal(out.answer,text)
})
test('mixed answers retain already written uncited points and preserve evidence IDs for cited points',()=>{
 const written=api.proseFallback(input),claim='Robin Example said the contracts should be published.',loose='Independent scrutiny would improve transparency.'
 const original={answer:'- '+claim+'\n- '+loose,citations:{'speech-evidence/t/body/0-90':[[2,claim.length+2]]},sources:[{...source('speech-evidence',claim),kind:'speech'}],answer_status:'partly_cited'}
 const out=api.appendWrittenPoints(written,original)
 assert.match(out.answer,/Independent scrutiny/);assert.equal(out.answer_status,'partly_cited')
 const [a,b]=out.citations['speech-evidence/t/body/0-90'][0]
 assert.equal(Array.from(out.answer).slice(a,b).join(''),claim)
})
test('a full money calculation plus overlapping rows falls back without boilerplate or duplicated amounts',()=>{
 const raw=['Example Party received the most disclosed funding from mining donors: $165,050.','Financial years: 2005–06. 5 donors in the selected map. Federal (AEC). Amounts are not adjusted for inflation.','| Party | Amount |','| Example Party | $165,050 |','| Sample Party | $40,000 |','[Explore these records](https://example.org/money)','This tool covers an unknown start to an unknown end.']
 const sheet=raw.map((text,i)=>({id:i+1,text,source:source('money-'+i,text),...(i===6?{coverage:true}:{})}))
 const out=api.proseFallback({...input,question:'Who gets the most from mining in 2005?',facts:sheet})
 assert.equal(out.answer.split('165,050').length-1,1)
 assert.match(out.answer.split('\n')[0],/Example Party.*most mining.*2005.*165,050/)
 assert.doesNotMatch(out.answer,/Explore these|unknown start|Financial years recorded|selected map|Federal \(AEC\)|not adjusted for inflation|\|/)
 assert.ok(out.answer.split('\n\n').length<=3)
})

test('a calculator title containing its entire block does not turn its figures into coverage',()=>{
 const answer=texts.join('\n\n'),selected={answer,citations:{'fact-1/t/body/0':[[0,answer.length]]},sources:[{...source('fact-1',answer),title:answer}]}
 const sheet=api.writingFacts(selected)
 assert.equal(sheet.filter(f=>!f.coverage).length,2);check(api.proseFallback({...input,facts:sheet}))
})
test('the rubric counts deterministic OPAX coverage declines honestly',()=>{
 const payload={answer:'OPAX cannot establish the requested answer for 2005 from the selected records.',sources:[],citations:{}}
 assert.equal(gradeRow({question,expected:{kind:'answer'}},payload).axes.decline,'fail')
 assert.equal(gradeRow({question,expected:{kind:'decline'}},payload).axes.decline,'pass')
})

test('a qualitative record answer need not lead with an incidental asset value',()=>{
 const text='Robin Example declared a shareholding in Fixture Company; the recorded asset value was $100,000.'
 const out=api.verifyWrittenAnswer({sentences:[{text:'Robin Example declared a shareholding in Fixture Company.',facts:[1]}]}, {question:'What interests has Robin Example declared?',period:{kind:'all',label:''},facts:[{id:1,text,source:source('interest-1',text)}]})
 assert.match(out.answer,/^Robin Example declared/)
});
test('ordinary fallback and its cached SSE replay remove repeated financial sets while remapping Unicode spans',async()=>{
 const intro='The selected 🏠 debate records do not establish a reliable party ranking.'
 const first='Example Party described a $10 billion fund and $500 million annual funding.'
 const next='Another Example Party passage described an additional $3 billion.'
 const repeated=first+' '+next
 const answer='What the record says:\n\n'+intro+'\n\n'+first+' '+next+'\n\n'+repeated
 const at=Array.from(answer.slice(0,answer.indexOf(first))).length, end=at+Array.from(first).length
 const payload={answer,citations:{'a/t/body/0':[[at,end]],'b/t/body/0':[[Array.from(answer).length-1,Array.from(answer).length]]},sources:[source('a',first),source('b',repeated)]}
 const result=api.normaliseWrittenPayload(payload)
 assert.equal((result.answer.match(/\$3 (?:billion|bn)/g)||[]).length,1)
 assert.equal((result.answer.match(/\$500 million/g)||[]).length,1)
 assert.doesNotMatch(result.answer,/What the record says/)
 assert.equal(answerStyleChecks('What funding?',intro+' '+first+' '+next+' '+repeated).no_duplicates,'fail')
 assert.equal(Array.from(result.answer).slice(...result.citations['a/t/body/0'][0]).join(''),first)
 assert.equal(result.sources.find(s=>s.resource==='b').cited,false)
 assert.deepEqual(answerStyleChecks('Which party spoke most and how did they vote?',result.answer),{no_tool_echo:'pass',no_duplicates:'pass',direct_first_sentence:'pass'})
 const stream=new Response('event: delta\ndata: '+JSON.stringify({text:answer})+'\n\nevent: done\ndata: '+JSON.stringify(payload)+'\n\n',{headers:{'content-type':'text/event-stream'}})
 const wire=await(await api.withFallbackPeriod(stream,{kind:'all',label:''})).text()
 assert.doesNotMatch(wire,/event: delta/)
 assert.deepEqual(JSON.parse(wire.match(/^data: (.+)$/m)[1]),result)
})

test('catalogue receipt rows become prose with one cited figure and no repeated connection',()=>{
 const text='Disclosed receipt: CSR Limited → Labor — $447,696.00 in disclosed political receipts; 74 records. Aggregated connection, not an individual gift. Mining.'
 const sheet=api.writingFacts(undefined,[1,2].map(id=>({id,text,cite:{kind:'record',url:'https://example.org/receipt/'+id,label:text}})))
 const query={question:'How much money has CSR Limited given Labor?',period:{kind:'all',label:''},facts:sheet}
 assert.equal(api.rawToolEcho(text),true)
 assert.equal(api.verifyWrittenAnswer({sentences:[{text,facts:[1]}]},query),null)
 const out=api.proseFallback(query)
 assert.equal(out.answer,'Labor disclosed $447,696.00 in receipts from CSR Limited.')
 assert.equal(Object.keys(out.citations).length,1)
 assert.deepEqual(Object.values(out.citations).flat(),[[0,Array.from(out.answer).length]])
 assert.doesNotMatch(out.answer,/Disclosed receipt:|→|Aggregated connection|74 records/)
})

test('donor profile labels become sentences without inventing a recipient or year total',()=>{
 const text='Donor: Fixture Holdings — $20,000.00 in disclosed political receipts; 2 records.'
 const out=api.proseFallback({question:'What disclosed receipts are recorded for Fixture Holdings?',period:{kind:'all',label:''},facts:api.writingFacts(undefined,[{id:1,text,cite:{kind:'record',url:'https://example.org/donor',label:text}}])})
 assert.equal(out.answer,'Fixture Holdings provided $20,000.00 in disclosed political receipts.')
 assert.equal(api.rawToolEcho(out.answer),false)
})

test('aggregate division caveats use coverage.note and single-vote findings omit them',()=>{
 const note='Divisions are matched by words in their titles; divisions filed under other titles may be missed.'
 const reasons='A recorded vote does not establish why a member voted that way.'
 for(const count of [1,10]){
  const text=`Robin Example voted in ${count} divisions with "housing" in the title: aye ${count}, no 0`
  const sheet=api.writingFacts(undefined,[{id:1,text,cite:{kind:'record',url:'https://example.org/divisions',label:'Housing votes'}}],[note,reasons])
  const out=api.proseFallback({question:'How did Robin Example vote on housing?',period:{kind:'all',label:''},facts:sheet})
  assert.doesNotMatch(out.answer,/matched by words|does not establish why/)
  if(count===10)assert.match(out.coverage.note,/matched by words/)
  else assert.equal(out.coverage,undefined)
  assert.doesNotMatch(out.coverage?.note??'',/does not establish why/)
 }
})

test('identity findings do not acquire ranked-count notes from unrelated selected metadata',()=>{
 const text='Stirling Griff was a senator for South Australia.'
 const fs=api.writingFacts(undefined,[{id:1,text,cite:{kind:'record',url:'https://example.org/person',label:text}}],['That count comes from ranked matching, so it is not a complete total.'])
 const out=api.verifyWrittenAnswer({sentences:[{text,facts:[1]},{text:fs[1].text,facts:[2],coverage:true}]},{question:'Which state was Stirling Griff a senator for?',period:{kind:'all',label:''},facts:fs})
 assert.equal(out.answer,text)
 assert.equal(out.coverage,undefined)
})

test('a selected-facts preamble is kept as written and the writer contract asks for the finding first',()=>{
 const text='Robin Example declared a shareholding in Fixture Company.'
 const query={question:'What interests did Robin Example declare?',period:{kind:'all',label:''},facts:[{id:1,text,source:source('interest',text)}]}
 assert.equal(api.verifyWrittenAnswer({sentences:[{text:'The selected facts show that '+text,facts:[1]}]},query).answer,'The selected facts show that '+text)
 const out=api.verifyWrittenAnswer({sentences:[{text,facts:[1]}]},query)
 assert.equal(out.answer,text)
 const contract=JSON.parse(api.writingPrompt(query)).contract
 assert.match(contract,/first sentence must answer.*name, figure, date or outcome/)
 assert.match(contract,/coverage:true.*coverage.note/)
 assert.match(contract,/Each figure has one supporting fact id/)
})

test('full party receipt totals retain their own coverage rather than selected-donor boilerplate',()=>{
 const text='Labor received $500 in federal disclosed receipts in financial years 2017-18.'
 const note='Party aggregates cover all cleaned rows assigned to each party, including internal party transfers; identified public electoral funding is excluded.'
 const fs=[{id:1,text,source:source('total',text)},{id:2,text:note,source:source('receipt-scope',note),coverage:true}]
 const out=api.verifyWrittenAnswer({sentences:[{text,facts:[1]}]},{question:'What was Labor\'s total disclosed receipts in 2017-18?',period:{kind:'all',label:''},facts:fs})
 assert.match(out.coverage.note,/all cleaned receipts.*internal party transfers.*exclude identified public electoral funding/)
 assert.doesNotMatch(out.coverage.note,/published selection|lower bounds/)
 assert.equal(out.answer,text)
})

test('exact record count coverage retains the snapshot and latest record date separately from the answer',()=>{
 const text='12 recorded divisions in the Senate on 2025-07-31.'
 const note='Exact count of the full published divisions index; not a ranked sample. Published snapshot build date: 2026-10-30T00:00:00Z. Latest indexed date date: 2026-10-29.'
 const fs=[{id:1,text,source:source('count',text)},{id:2,text:note,source:source('count-scope',note),coverage:true}]
 const out=api.verifyWrittenAnswer({sentences:[{text,facts:[1]}]},{question:'How many divisions did the Senate hold on 31 July 2025?',period:{kind:'all',label:''},facts:fs})
 assert.match(out.coverage.note,/snapshot was built on 2026-10-30T00:00:00Z/)
 assert.match(out.coverage.note,/latest indexed record is dated 2026-10-29/)
 assert.doesNotMatch(out.answer,/snapshot|coverage|ranked sample/i)
})

test('overlapping source copies cite a figure once while distinct owners survive',()=>{
 const row=(id,name)=>({id,text:`${name} received $100,000.`,source:source('copy-'+id,`${name} received $100,000.`)})
 const fs=[row(1,'Robin Example'),row(2,'Robin Example'),row(3,'Casey Sample')]
 const out=api.verifyWrittenAnswer({sentences:[{text:fs[0].text,facts:[1,2]},{text:fs[2].text,facts:[3]}]},{question:'What did the two recipients receive?',period:{kind:'all',label:''},facts:fs})
 assert.equal(out.answer,'Robin Example received $100,000.\n\nCasey Sample received $100,000.')
 assert.equal(Object.keys(out.citations).length,2)
 assert.equal(Object.values(out.citations).flat().length,2)
})

test('a substantive limitation retains the explanation in its body',()=>{
 const text='The state salary records needed for this question are unavailable.'
 const fs=[{id:1,text,source:source('state-pay',text),coverage:true}]
 const out=api.verifyWrittenAnswer({answer_decision:'limitation',sentences:[{text,facts:[1],coverage:true}]},{question:'What was the state salary?',period:{kind:'all',label:''},facts:fs})
 assert.equal(out.answer,text)
 assert.equal(out.answer_decision,'limitation')
 assert.equal(out.coverage,undefined)
})

test('equal receipts from distinct donors remain separate facts and citations',()=>{
 const fs=['Company Alpha','Company Beta'].map((donor,i)=>{
  const text=`Labor received $20,000 from ${donor} in 2024.`
  return {id:i+1,text,source:source('receipt-'+i,text)}
 })
 const out=api.verifyWrittenAnswer({sentences:fs.map(f=>({text:f.text,facts:[f.id]}))},{question:'Which donors provided funding to Labor?',period:{kind:'all',label:''},facts:fs})
 for(const donor of ['Company Alpha','Company Beta'])assert.ok(out.answer.includes(donor))
 assert.equal(Object.keys(out.citations).length,2)
 const combined=api.draftWrittenAnswer({answer_decision:'answer',sentences:[{text:fs.map(f=>f.text).join(' '),facts:[1,2]}]},{question:'Which donors provided funding to Labor?',period:{kind:'all',label:''},facts:fs})
 assert.equal(Object.keys(combined.citations).length,2)
 const [a,b]=fs.map(f=>({answer:f.text,citations:{[f.source.resource+'/t/body/0']:[[0,f.text.length]]},sources:[f.source]}))
 const appended=api.appendWrittenPoints(a,b)
 assert.equal(appended.answer,fs.map(f=>f.text).join('\n\n'))
 assert.equal(Object.keys(appended.citations).length,2)
})
