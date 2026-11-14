// Ask answers from what it found. The refusal cases here are the production responses of 1 Nov 2026
// (the 25 Oct wording of receipt facts turned found figures into "OPAX cannot establish ..."), and each
// path a response can leave by. No provider or network calls.
import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {MockLanguageModelV4} from 'ai/test'
import {auditPayload} from '../src/research-claim-audit.mjs'
const built=await build({stdin:{contents:"export * from './src/research-writing';export * from './src/research-writer';export * from './src/research-grounding';export * from './src/research-response';export {factSheet,inferPeriod,agenticCacheKey} from './src/agentic-ask';export {guardToolPeriod,UNCONFIRMED_PERIOD} from './src/ask-constraints';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const refusal='OPAX cannot establish the requested answer from the selected records.'
const notes=['Federal AEC disclosed receipts, financial years 1998-99 to 2025-26, in the published selection of the 250 largest donors (so totals are lower bounds).','These federal totals mix donations with other receipts such as loans, so this is not a donation ranking.','These are party receipts, not personal payments to politicians, and a receipt is not evidence that it influenced any vote or speech.']
const rows=party=>[['Tabcorp Holdings Limited',party==='Labor'?2371237:2222296],['Clubs NSW',party==='Labor'?2134784:743867],['Crown Resorts Limited',party==='Labor'?1428714:1442882]]
const tool=party=>({tool:'party_receipts',ok:true,data:{party,industry:'gambling',years:[null,null],rows:rows(party).map(([donor,total_aud])=>({donor,total_aud,return_reference:'AEC annual return · 2003-04 · https://transparency.aec.gov.au/',industry:'gambling'}))},cite:[{kind:'export',label:'party',url:'https://opax.com.au/money/party/'+party},...rows(party).map(([donor])=>({kind:'export',label:donor,url:'https://opax.com.au/subject/donor/'+encodeURIComponent(donor)}))],notes})
/** What the tool hands the writer, by the same route as production. */
function moneyInput(question,party){
 const {facts}=api.factSheet([tool(party)]),coverage={resource:'coverage',slug:'',title:'Coverage of the selected records',href:'https://opax.com.au/money/party/'+party,url:'https://opax.com.au/money/party/'+party,snippet:notes.join(' '),cited:true,kind:'record'}
 const sources=[...facts.map(f=>({resource:'fact-'+f.id,slug:'',title:f.cite.label,href:f.cite.url,url:f.cite.url,snippet:f.text,cited:true,kind:f.cite.kind,receipt:f.receipt})),coverage]
 const answer=sources.map(s=>s.snippet).join('\n');let at=0;const citations={}
 for(const s of sources){citations[s.resource+'/t/body/0']=[[at,at+Array.from(s.snippet).length]];at+=Array.from(s.snippet).length+1}
 const period=api.inferPeriod(question)
 return {question,period,constraints:{period,party},facts:api.writingFacts({answer,citations,sources})}
}
const writer=(reply,settle=async()=>{})=>{
 let calls=0
 const model=new MockLanguageModelV4({doGenerate:()=>{const text=reply(++calls);return {content:[{type:'text',text:JSON.stringify(text)}],finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:10},outputTokens:{total:10}},warnings:[]}}})
 return {model,calls:()=>calls,write:api.createAnswerWriter({model,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle})}})}
}
const stats=()=>({rounds:1,tokens:{input:0,output:0}})
const gambling='Which gambling companies gave the most money to Labor?',followUp='How much did the Liberal Party disclose from gambling sources?'

test('the production ranking refusal now leads with the figures found',()=>{
 const out=api.groundAnswerPayload(api.proseFallback(moneyInput(gambling,'Labor')),gambling)
 assert.match(out.answer.split('\n')[0],/^Tabcorp Holdings Limited provided the most disclosed funding to Labor: \$2,371,237.*1998-99 to 2025-26/)
 assert.match(out.answer,/Clubs NSW.*2,134,784/);assert.match(out.coverage.note,/lower bounds/);assert.equal(out.answer_decision,'answer')
 assert.ok(out.citations['fact-1/t/body/0']);assert.doesNotMatch(out.answer,/cannot establish|gave Labor|donated/i)
})
test('a how-much follow-up leads with its figures, not the speech points beside them',()=>{
 const input=moneyInput(followUp,'Liberal'),points={answer:'- In 2020, Jane Hume said donations are declared to the AEC.',answer_status:undefined,citations:{'p/t/body/0':[[2,61]]},sources:[{resource:'p',slug:'',title:'Jane Hume',href:'/doc/1',url:'/doc/1',snippet:'I said donations are declared to the AEC.',cited:true,kind:'speech',speaker:'Jane Hume',date:'2020-06-15'}]}
 const out=api.groundAnswerPayload(api.appendWrittenPoints(api.proseFallback(input),points),followUp)
 assert.match(out.answer.split('\n')[0],/Liberal disclosed \$2,222,296 in receipts from Tabcorp Holdings Limited/);assert.match(out.answer,/rather than one combined total/)
 assert.ok(out.answer.indexOf('$2,222,296')<out.answer.indexOf('Jane Hume'));assert.equal(out.answer_decision,'answer')
})
test('a draft of the tool wording, in either direction, passes the audit that used to strip it',()=>{
 const input=moneyInput(gambling,'Labor')
 for(const text of ['Labor disclosed $2,371,237 in receipts from Tabcorp Holdings Limited across financial years 1998-99 to 2025-26.','Tabcorp Holdings Limited provided the most disclosed receipts to Labor, with $2,371,237 across financial years 1998-99 to 2025-26.','Labor disclosed the most from Tabcorp Holdings Limited at $2,371,237, followed by Clubs NSW at $2,134,784.']){
  const written=api.verifyWrittenAnswer({answer_decision:'answer',sentences:[{text,facts:[1,2]}]},input)
  assert.deepEqual(auditPayload(gambling,written).findings,[]);assert.ok(api.groundAnswerPayload(written,gambling).answer.includes('$2,371,237'))
 }
})
test('a draft that drops the requested top figure gives way to the facts-only version, in one pass',async()=>{
 const {model,write}=writer(()=>({answer_decision:'answer',sentences:[{text:'Tabcorp Holdings Limited provided $9,999,999.',facts:[1]},{text:'These are disclosed receipts.',facts:[4],coverage:true}]}))
 const out=await write(moneyInput(gambling,'Labor'),stats(),undefined,3000)
 assert.equal(model.doGenerateCalls.length,1);assert.match(out.answer,/^Tabcorp Holdings Limited provided the most disclosed funding to Labor: \$2,371,237/);assert.doesNotMatch(out.answer,/\$9,999,999|cannot establish/)
})
test('a writer limitation that drops the requested figure gives way to the facts, never the reverse',async()=>{
 const text='The selected records do not establish a ranking of companies.',{write}=writer(()=>({answer_decision:'limitation',sentences:[{text,facts:[1,2,3]}]}))
 const out=await write(moneyInput(gambling,'Labor'),stats(),undefined,3000)
 assert.match(out.answer,/^Tabcorp Holdings Limited provided the most disclosed funding to Labor: \$2,371,237/);assert.doesNotMatch(out.answer,/do not establish/);assert.equal(out.answer_decision,'answer')
})
test('with no model at all the facts still answer',async()=>{
 const write=api.createAnswerWriter({modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>null}})
 const out=await write(moneyInput(followUp,'Liberal'),stats(),undefined,3000);assert.match(out.answer,/\$2,222,296/);assert.equal(out.coherence.fallback,true)
})

// A wording no parser has seen is rendered by the fallback; a written limitation is kept on every path a response can leave by.
const unseen='Zephyr Holdings lodged 4,321 widgets with the Clerk in spring'
const unseenSource={resource:'fact-1',slug:'',title:'Register',href:'https://opax.com.au/r',url:'https://opax.com.au/r',snippet:unseen,cited:true,kind:'record'}
const unseenPayload={answered:true,answer:refusal,answer_decision:'limitation',citations:{'coverage/t/body/0':[[0,refusal.length]]},sources:[{resource:'coverage',slug:'',title:'Coverage',href:'https://opax.com.au/c',url:'https://opax.com.au/c',snippet:'Some coverage note.',cited:true,kind:'record'}],research:{mode:'loop',rounds:1,trail:[],sources:[],pre_writer_sources:[unseenSource]}}
const check=out=>{assert.match(out.answer,/Zephyr Holdings lodged 4,321 widgets/);assert.doesNotMatch(out.answer,/cannot establish/);assert.equal(out.answer_decision,'answer');assert.ok(out.citations['fact-1/t/body/0'])}
const kept=out=>{assert.equal(out.answer,refusal);assert.equal(out.answer_decision,'limitation')}
const question='What did Zephyr Holdings lodge?'
test('a fact format no parser has seen is rendered, not refused',()=>{
 check(api.proseFallback({question,period:{kind:'all',label:''},facts:[{id:1,text:unseen,source:unseenSource}]}))
})
test('a written limitation is kept on the JSON boundary and is stable on repeat',()=>{
 const once=api.groundAnswerPayload(structuredClone(unseenPayload),question);kept(once);assert.deepEqual(api.groundAnswerPayload(once,question),once)
})
for(const [name,wrap] of [['JSON',p=>Response.json(p)],['cache replay',p=>Response.json(p,{headers:{'x-opax-cache':'HIT'}})],['SSE',p=>new Response('event: done\ndata: '+JSON.stringify(p)+'\n\n',{headers:{'content-type':'text/event-stream'}})],['SSE cache replay',p=>new Response('event: done\ndata: '+JSON.stringify(p)+'\n\n',{headers:{'content-type':'text/event-stream','x-opax-cache':'HIT'}})]])test('a written limitation is kept on '+name,async()=>{
 const wire=await(await api.withAnswerLanguage(wrap(structuredClone(unseenPayload)),question)).text()
 kept(name.startsWith('SSE')?JSON.parse(/event: done\ndata: (.+)/.exec(wire)[1]):JSON.parse(wire))
})
test('a written limitation is kept on ordinary fallback, after its period guard',async()=>{
 const scoped=await api.withFallbackPeriod(Response.json(structuredClone(unseenPayload)),{kind:'all',label:''})
 kept(await(await api.withAnswerLanguage(scoped,question)).json())
})
test('a cached limitation is replayed as stored',async()=>{
 const stale={...structuredClone(unseenPayload),research:{...unseenPayload.research}}
 kept(await(await api.withAnswerLanguage(Response.json(stale,{headers:{'x-opax-cache':'HIT'}}),question)).json())
})
test('table rows and URLs never reach the reader raw, and coverage notes are not answers',()=>{
 const source=(resource,snippet)=>({...unseenSource,resource,snippet}),facts=[{id:1,text:'| Source | Disclosed receipts |',source:source('a','| Source | Disclosed receipts |')},{id:2,text:'| Example Pty Ltd | $1,200 |',source:source('b','| Example Pty Ltd | $1,200 |')},{id:3,text:'Example Two spent $9 — https://example.org/x',source:source('c','x')},{id:4,text:'These records exclude a thing.',coverage:true,source:source('d','x')}]
 const lines=api.renderFacts({question:'What was found?',period:{kind:'all',label:''},facts}).map(l=>l.text)
 assert.deepEqual(lines,['Example Pty Ltd: $1,200.','- Example Two spent $9.'])
})
test('nothing usable stays a plain limitation',()=>{
 const payload={answer:refusal,answer_decision:'limitation',citations:{},sources:[{resource:'coverage',slug:'',title:'c',href:'h',url:'h',snippet:'Federal AEC disclosed receipts, financial years 1998-99 to 2025-26.',cited:true,kind:'record'}]}
 assert.equal(api.groundAnswerPayload(payload,'What did Zephyr lodge?').answer,refusal)
})

// Typed decisions, period notes and caching.
for(const [decision,status] of [['refusal',undefined],['clarification',undefined],[undefined,'needs_question'],[undefined,'needs_scope'],[undefined,'declined']])test(`a typed ${decision??status} is never turned into facts`,()=>{
 const answer='Please name the person you mean.',p={...structuredClone(unseenPayload),answer,citations:{},answer_decision:decision,answer_status:status}
 assert.equal(api.groundAnswerPayload(p,question).answer,answer)
})
test('a known wrong period keeps its rows with a note; undated rows stand, marked',()=>{
 const constraints={dated:true,period:{kind:'window',since:'2005-01-01',until:'2005-12-31',label:'2005'}}
 const known={tool:'parliamentary_pay',ok:true,data:{coverage:{since:'2026-10-19',until:'2026-10-19',as_of:'2026-10-19'},rows:[{salary:622102}]},cite:[{kind:'record',label:'Current salary $622,102',url:'https://example.org/pay'}],notes:[]}
 const wrong=api.guardToolPeriod(known,{tool:known.tool,args:{}},constraints)
 assert.equal(wrong.data.coverage_only,undefined);assert.deepEqual(wrong.data.rows,[{salary:622102}]);assert.equal(wrong.coverage.matched,false);assert.match(wrong.notes[0],/^The requested period is 2005-01-01 to 2005-12-31; these records cover 2026-10-19/)
 const undated={tool:'contracts',ok:true,data:{rows:[{name:'X'}]},cite:[{kind:'record',label:'X Pty Ltd: $5,000 contract',url:'https://example.org/c'}],notes:[]},guarded=api.guardToolPeriod(undated,{tool:'contracts',args:{}},constraints)
 assert.equal(guarded.data.coverage_only,undefined);assert.equal(guarded.notes[0],api.UNCONFIRMED_PERIOD)
 const facts=[{id:1,text:'X Pty Ltd: $5,000 contract',source:{...unseenSource,snippet:'x'}},{id:2,text:api.UNCONFIRMED_PERIOD,coverage:true,source:{...unseenSource,resource:'coverage',snippet:'x'}}]
 assert.match(api.proseFallback({question:'Who won contracts in 2005?',period:constraints.period,facts}).coverage.note,/could not confirm/)
})
test('a receipt total from outside the requested period is not the answer: the limitation stands',()=>{
 const q='How much did Labor disclose from Tabcorp in 1990?',input=moneyInput(q,'Labor'),answer='The disclosed returns cover 1998–99 to 2025–26 and cannot establish the answer for 1990.'
 const out=api.groundAnswerPayload({answer,answer_decision:'limitation',citations:{},sources:[],research:{mode:'loop',pre_writer_sources:input.facts.map(f=>({...f.source,snippet:f.text,...(f.coverage?{coverage:true}:{})}))}},q)
 assert.equal(out.answer,answer)
})
test('ordinary fallback keeps prose and figures outside the period, with their dates stated in a note',async()=>{
 const period={kind:'window',since:'2005-01-01',until:'2005-12-31',label:'2005'},source={resource:'r',kind:'speech',date:'2023-05-01',cited:true,href:'https://example.org/d'}
 const prose=await(await api.withFallbackPeriod(Response.json({answer:'Parliament debated the reform at length.',sources:[source],citations:{'r/t/body/0':[[0,40]]}}),period)).json()
 assert.match(prose.coverage.note,/dated 2023-05-01/);assert.match(prose.answer,/debated the reform/);assert.equal(prose.coverage.matched,false);assert.equal(prose.citations['r/t/body/0'][0][0],0)
 const figures=await(await api.withFallbackPeriod(Response.json({answer:'The salary is $622,102.',sources:[source],citations:{}}),period)).json()
 assert.equal(figures.answer,'The salary is $622,102.');assert.match(figures.coverage.note,/^These records may not cover 2005-01-01 to 2005-12-31/)
})
test('federal receipts are never called gifts or donations by the renderer',()=>{
 for(const q of [gambling,followUp,'What did Labor disclose?']){
  const out=api.proseFallback(moneyInput(q,q===followUp?'Liberal':'Labor'))
  assert.doesNotMatch(out.answer.replace(/a donation is not evidence that it influenced a vote or speech/,''),/\bgifts?\b(?! )|\bdonat(?:ed|ion)\b/i)
 }
})
test('only an answer is cacheable',()=>{
 const cited={'fact-1/t/body/0':[[0,5]]}
 assert.equal(api.cacheableRoutedAnswer({answer:'A verified public fact.',answer_decision:'answer',citations:cited},true),true)
 for(const answer of ['', ' ', undefined])assert.equal(api.cacheableRoutedAnswer({answer,answer_decision:'answer',citations:cited},true),false)
 for(const answer_decision of ['limitation','refusal','clarification','preserve'])assert.equal(api.cacheableRoutedAnswer({answer:'A verified public fact.',answer_decision,citations:cited},true),false,answer_decision)
 assert.equal(api.cacheableRoutedAnswer({answer_status:'coverage_only',citations:cited},true),false)
 assert.equal(api.cacheableRoutedAnswer({answer_decision:'answer',citations:{}},true),false)
})
test('the production refusal cannot be cached, and its question now can be',()=>{
 const before={answer:refusal,answer_decision:'limitation',citations:{'coverage/t/body/0':[[0,69]]}}
 assert.equal(api.cacheableRoutedAnswer(before,true),false)
 assert.equal(api.cacheableRoutedAnswer(api.groundAnswerPayload(api.proseFallback(moneyInput(gambling,'Labor')),gambling),true),true)
})
test('this change retires every earlier cached answer',()=>{assert.equal(api.ANSWER_WRITING_VERSION,'written-answer-30-clause-who')})

// Review of 36bf23f48, each finding on its exact input. A written limit is kept as written; typed decisions are left alone,
// and a period the records may not cover is a note beside the answer.
const src=(resource,snippet,kind='record',extra={})=>({resource,slug:'',title:'Record',href:'https://opax.com.au/r',url:'https://opax.com.au/r',snippet,cited:true,kind,...extra})
const plain=(q,rows,kind='record')=>{const period=api.inferPeriod(q);return {question:q,period,constraints:{period},facts:rows.map((text,i)=>({id:i+1,text,source:src('fact-'+(i+1),text,kind)}))}}
const pre=input=>input.facts.map(f=>({...f.source,snippet:f.text,...(f.coverage?{coverage:true}:{})}))
const limited=(input,answer,extra={})=>api.groundAnswerPayload({answer,answer_decision:'limitation',citations:{},sources:[],answer_scope:input.constraints,research:{mode:'loop',pre_writer_sources:pre(input)},...extra},input.question)
const unfiltered=party=>{const r=tool(party);return {...r,data:{...r.data,industry:null}}}
const allRows=(q,party,scope={party})=>{const {facts}=api.factSheet([unfiltered(party)]),period=api.inferPeriod(q),sources=[...facts.map(f=>src('fact-'+f.id,f.text,f.cite.kind,{receipt:f.receipt})),src('coverage',notes.join(' '),'record',{url:'https://opax.com.au/money/party/'+party})];return {question:q,period,constraints:{period,...scope},facts:api.writingFacts({answer:'',citations:{},sources})}}

test('finding 1: an unconfirmed period is said plainly, with neither the requested year nor a superlative',()=>{
 const q='Which supplier got the most contract money in 2005?',input=plain(q,['Thales Australia: $1,200,000,000 across 42 contracts'])
 const guarded=api.guardToolPeriod({tool:'contracts',ok:true,data:{rows:[{}]},cite:[{kind:'record',label:input.facts[0].text,url:'https://opax.com.au/c'}],notes:[]},{tool:'contracts',args:{}},{dated:true,period:input.period})
 input.facts.push({id:9,text:guarded.notes[0],coverage:true,source:src('coverage',guarded.notes[0])})
 const out=api.proseFallback(input);assert.match(out.answer,/Thales Australia: \$1,200,000,000/);assert.match(out.coverage.note,/could not confirm/);assert.doesNotMatch(out.answer,/2005|\breceived the most\b/)
})
test('finding 2: the fallback period guard adds a note and keeps the answer, on the full response chain',async()=>{
 const q='Who won the biggest contracts in 2005?',period=api.inferPeriod(q),input=plain(q,['Thales Australia: $1,200,000,000 contract']),trail={mode:'planner',rounds:1,trail:[],sources:[],pre_writer_sources:pre(input)}
 const run=async payload=>(await api.withAnswerLanguage(await api.withPlannerResearch(await api.withFallbackPeriod(Response.json(payload),period),trail),q)).json()
 const prose=await run({answer:'Parliament debated these contracts.',sources:[src('c','x','record',{date:'2023-05-01'})],citations:{'c/t/body/0':[[0,35]]}})
 assert.match(prose.coverage.note,/^These records may not cover .*dated 2023-05-01/);assert.equal(prose.answer,'Parliament debated these contracts.')
 const figure=await run({answer:'The current salary is $622,102.',sources:[src('p','x','pay',{date:'2026-10-19'})],citations:{}})
 assert.equal(figure.answer,'The current salary is $622,102.');assert.match(figure.coverage.note,/dated 2026-10-19/)
 const matched=await api.withAnswerLanguage(Response.json({answer:'That period is not covered.',coverage:{matched:false},citations:{},sources:[],research:trail}),q);assert.equal((await matched.json()).answer,'That period is not covered.')
})
test('finding 3: real dates in any kind of fact keep it out, and the requested year is never prefixed',()=>{
 for(const [q,fact,limit] of [['What was the highest paid MP in 2005?','Avery Example: $622,102 a year as Prime Minister, 2026-07-01 to 2027-06-30; base $233,660 plus 166%.','The selected pay records do not cover 2005.'],['Which electorate got the most grants in 2005?','Kennedy: $4,500,000 across 12 grants, 2022-23','The selected grant records do not cover 2005.']]){
  assert.equal(limited(plain(q,[fact]),limit).answer,limit)
  assert.doesNotMatch(api.groundAnswerPayload({answer:refusal,answer_decision:'limitation',citations:{},sources:[],research:{mode:'loop',pre_writer_sources:pre(plain(q,[fact]))}},q).answer,/In 2005|\$/)
 }
})
test('finding 4: an ordinary question about change is not causal',()=>{
 const q='How did Labor vote on climate change?',input=plain(q,['Labor voted in 13 divisions with "climate" in the title: all aye in 9, all no in 4, split in 0'])
 assert.match(api.groundAnswerPayload(api.proseFallback(input),q).answer,/13 divisions/)
})
test('finding 5: no lead-line superlative, the jurisdiction labelled, never "unknown"',()=>{
 const q='Who gives the most money to the LNP in Queensland disclosures?',input=allRows(q,'LNP'),out=api.groundAnswerPayload(api.proseFallback(input),q)
 assert.match(out.answer,/^LNP disclosed \$2,222,296 in receipts from Tabcorp Holdings Limited \(federal disclosures; financial years 1998-99 to 2025-26\)/)
 assert.match(out.coverage.note,/These are federal records, not Queensland records\./);assert.doesNotMatch(out.answer,/provided the most|has the largest|unknown|cannot establish a donor ranking/)
 const undated=api.proseFallback({...input,facts:input.facts.map(f=>f.source.receipt?{...f,source:{...f.source,receipt:{...f.source.receipt,period:'unknown'}}}:f)});assert.doesNotMatch(undated.answer,/unknown/)
})
test('finding 5: ranked_money rows rank from their typed receipts alone',async()=>{
 const q='Who gave the most money to Labor in 2023–24?',row=src('receipt-ranking-1','Pratt Holdings Pty Ltd: $2,000,000, 2 disclosed receipt records. Period: 2023–24.','receipt',{url:'https://opax.com.au/money?jur=federal&party=party%3ALabor',receipt:{party:'Labor',source:'Pratt Holdings Pty Ltd',amount:2000000,period:'2023–24',jurisdiction:'federal'}}),period=api.inferPeriod(q)
 const out=api.proseFallback({question:q,period,constraints:{period,party:'Labor'},facts:api.writingFacts({answer:'',citations:{},sources:[row]})})
 assert.match(out.answer,/^Pratt Holdings Pty Ltd provided the most disclosed funding: \$2,000,000.*2023–24 in OPAX’s published selection/)
})
test('finding 6: rows and votes are both kept, and the unconfirmed note sits in the coverage note',()=>{
 const q='Who gave the most money to Labor and how did Labor vote on pokies?',input=allRows(q,'Labor',{}),vote='Labor voted in 13 divisions with "pokies" in the title: all aye in 9, all no in 4, split in 0'
 input.facts.push({id:50,text:vote,source:src('votes',vote)})
 const out=api.proseFallback(input);assert.match(out.answer,/13 divisions/);assert.match(out.answer,/\$2,371,237/);assert.match(out.coverage.note,/published selection/)
 input.facts.push({id:51,text:api.UNCONFIRMED_PERIOD,coverage:true,source:src('coverage-note',api.UNCONFIRMED_PERIOD)})
 const both=api.proseFallback(input);assert.match(both.coverage.note,/could not confirm/);assert.match(both.answer,/13 divisions/);assert.match(both.coverage.note,/published selection/)
})
test('finding 7: filtered rows cannot answer an unfiltered ranking, and an aggregate never ranks as a donor',()=>{
 const q='Who gave the most money to Labor?',out=api.proseFallback(moneyInput(q,'Labor'))
 assert.doesNotMatch(out.answer,/provided the most/);assert.match(out.coverage.note,/These rows cover gambling sources only\./);assert.match(out.answer,/\$2,371,237/)
 const totals={tool:'party_receipts',ok:true,data:{industry:'gambling',years:[null,null],rows:[{party:'Labor',total_aud:9000000}]},cite:[{kind:'export',label:'a',url:'https://opax.com.au/money/party/Labor'}],notes},{facts}=api.factSheet([totals])
 assert.equal(facts[0].receipt.aggregate,true);assert.equal(facts[0].receipt.filter,'gambling')
 const period=api.inferPeriod(gambling),sources=[src('fact-1',facts[0].text,'export',{receipt:facts[0].receipt})]
 assert.doesNotMatch(api.proseFallback({question:gambling,period,constraints:{period,party:'Labor'},facts:api.writingFacts({answer:'',citations:{},sources})}).answer,/provided the most/)
})
test('finding 8: the audit never cuts text: rendered lines and a point beside them are both kept',()=>{
 const q='Who gave the most money to Labor?',base=api.proseFallback(allRows(q,'Labor')),point='In 2020, Anthony Albanese said gambling harms families.',at=Array.from(base.answer+'\n\n').length
 const out=api.groundAnswerPayload({...base,answer:base.answer+'\n\n'+point,citations:{...base.citations,'h/t/body/0':[[at,at+point.length]]},sources:[...base.sources,src('h','Gambling harms families.','speech',{speaker:'Jane Hume',date:'2020-06-15'})]},q)
 assert.match(out.answer,/Albanese/);assert.match(out.answer,/\$2,371,237/)
})
for(const kind of ['speech','bill','committee','press_release','transcript','hansard',undefined])test(`finding 9: ${kind} text is never rendered raw`,()=>{
 const limit='The selected records do not establish what the committee concluded.',text='CHAIR: Thank you. Ms Smith, a local resident, told the committee her son lost $40,000.'
 const typed=q=>{const input=plain(q,[text]);input.facts[0].source.kind=kind;return input}
 assert.equal(limited(typed('What did the committee hear about gambling harm?'),limit).answer,limit)
 assert.equal(api.groundAnswerPayload({answer:refusal,answer_decision:'limitation',citations:{},sources:[],research:{mode:'loop',pre_writer_sources:pre(typed('What did the committee hear?'))}},'What did the committee hear?').answer,refusal)
})
test('finding 9: a fact about another subject is not found evidence',()=>{
 const q='Has the Greens ever taken money from gambling companies?',limit='The selected records do not show receipts to the Greens from gambling companies.',input=moneyInput(q,'Labor')
 assert.equal(limited({...input,constraints:{...input.constraints,party:'Greens'}},limit).answer,limit)
 assert.equal(limited({...input,constraints:{period:input.period}},limit).answer,limit,'the party named in the question is enough')
 assert.doesNotMatch(api.proseFallback({...input,constraints:{period:input.period}}).answer,/\$\d/)
 const {facts}=api.factSheet([{tool:'find_people',ok:true,data:{people:[{name:'Bob Katter',party:"Katter's Australian Party"}]},cite:[{kind:'record',label:'Bob Katter',url:'https://opax.com.au/subject/person/Bob%20Katter'}],notes:[]}])
 assert.equal(facts[0].cite.kind,'person')
 const katter='Did Bob Katter ever speak about crocodiles?',said='The selected records do not show Bob Katter speaking about crocodiles.'
 assert.equal(limited(plain(katter,[facts[0].text],'person'),said).answer,said)
})
test('finding 9: another person\'s counts and another industry\'s rows are off-topic too',()=>{
 const q='How many speeches has Robin Example made?',period=api.inferPeriod(q),count=src('fact-1','Casey Sample: 40 speeches','count',{entities:['person:Casey Sample']}),limit='The selected records do not count those speeches.'
 assert.equal(limited({question:q,period,constraints:{period,people:['Robin Example']},facts:[{id:1,text:count.snippet,source:count}]},limit).answer,limit)
 assert.equal(limited(moneyInput('How much did Labor receive from mining companies?','Labor'),limit).answer,limit)
})
test('finding 10: a draft that asks the reader for something stays, however it is punctuated',()=>{
 const q='Who gives the most money to Labor?',answer='I need the recipient and financial year before making that comparison.',sources=pre(allRows(q,'Labor')).map(s=>({...s,cited:true}))
 const out=api.groundAnswerPayload({answer,citations:{},sources},q);assert.equal(out.answer,answer);assert.deepEqual(out.citations,{})
})
test('finding 11: "voted" is not garbled, and an open-ended start is not outside the range',()=>{
 assert.match(api.proseFallback(plain('How has Peter Dutton voted on climate change?',['Peter Dutton voted in 13 divisions with "climate" in the title: aye 1, no 12'])).answer,/^Peter Dutton voted in 13 divisions/)
 const q='How much did Labor receive from Tabcorp since the 1996 election?',period=api.inferPeriod(q);assert.equal(period.since,'1996-01-01');assert.equal(period.until,undefined)
 const limit='The selected records do not give a period total for that election.',out=limited(allRows(q,'Labor'),limit);assert.equal(out.answer,limit)
})
test('a dated question answered from a wider range says so in words',()=>{
 const q='How much did Labor get from gambling companies in 2005?',out=api.groundAnswerPayload(api.proseFallback(moneyInput(q,'Labor')),q)
 assert.match(out.coverage.note,/These are totals across 1998-99 to 2025-26, not 2005 amounts\./);assert.match(out.answer,/\$2,371,237/);assert.doesNotMatch(out.answer,/In 2005|in 2005/)
})
test('case 2 keeps the limit unchanged, adds nothing to it, and is stable',()=>{
 const q='Who gave the most money to Labor in 2005?',limit='OPAX can only show aggregate receipts for that party.',input=allRows(q,'Labor'),once=limited(input,limit)
 assert.equal(once.answer,limit);assert.equal(once.answer_decision,'limitation')
 assert.equal(api.groundAnswerPayload(once,q).answer,once.answer)
 assert.equal(api.cacheableRoutedAnswer(once,true),false,'a limitation with facts beside it is still not stored')
})
test('case 3 appends nothing to a clarification, typed or asked',()=>{
 const input=moneyInput(gambling,'Labor')
 for(const extra of [{answer_decision:'clarification'},{answer_status:'needs_scope'},{answer_status:'coverage_only'}])assert.equal(limited(input,'Which financial year do you mean',extra).answer,'Which financial year do you mean')
})

// Re-review of a746a81a2: the question's shape decides, not a longer list of phrases.
test('spoken points can answer a position question: the shape rule stands aside',()=>{
 const q='Why did Labor oppose pokies reform?',input=moneyInput(q,'Labor'),answer='- In 2020, Jane Hume said donations are declared to the AEC.'
 const out=api.groundAnswerPayload({answer,answer_decision:'answer',citations:{'p/t/body/0':[[2,answer.length]]},sources:[{resource:'p',slug:'',title:'Jane Hume',href:'/d',url:'/d',snippet:'I said donations are declared to the AEC.',cited:true,kind:'speech',speaker:'Jane Hume',date:'2020-06-15'}],answer_scope:input.constraints,research:{mode:'loop',pre_writer_sources:pre(input)}},q)
 assert.equal(out.answer,answer.replace(/^- /gm,''));assert.equal(out.answer_decision,'answer')
})
test('a two-part question is answered with its rows and votes, the caveat in the coverage note',()=>{
 const q='Who gave the most money to Labor and how did Labor vote on pokies?',input=allRows(q,'Labor',{}),vote='Labor voted in 13 divisions with "pokies" in the title: all aye in 9, all no in 4, split in 0'
 input.facts.push({id:50,text:vote,source:src('votes',vote)})
 const out=api.proseFallback(input);assert.equal(out.answer_decision,'answer');assert.match(out.answer,/^Labor disclosed \$2,371,237/);assert.match(out.answer,/13 divisions/);assert.match(out.coverage.note,/published selection/)
})
test('an ordinary money question with a causal-looking word gets its receipts',()=>{
 const q='How much did gambling companies affected by the ban give to Labor?',out=api.proseFallback(moneyInput(q,'Labor'))
 assert.equal(out.answer_decision,'answer');assert.match(out.answer,/\$2,371,237/);assert.doesNotMatch(out.answer,/money caused a vote/)
})
for(const q of ['How much did Labor receive from Tabcorp?','Did Labor receive money from Tabcorp?','Has Labor taken money from gambling companies?'])test('a receipt question is still answered by receipts: '+q,()=>{
 const out=api.proseFallback(moneyInput(q,'Labor'));assert.equal(out.answer_decision,'answer');assert.match(out.answer,/\$2,371,237/)
})
test('review finding 2: a dated limit is not a generic refusal',()=>{
 assert.equal(api.emptyAnswer('OPAX cannot establish the requested answer for 2005-01-01 to 2005-12-31 from the selected records.'),false)
 assert.equal(api.emptyAnswer(refusal),true)
 const q='Who won the biggest contract in 2005?',dated='OPAX cannot establish the requested answer for 2005-01-01 to 2005-12-31 from the selected records.',out=limited(plain(q,['Acme Pty Ltd: $5,000,000 contract']),dated)
 assert.equal(out.answer,dated);assert.equal(out.answer_decision,'limitation')
})
test('review finding 6: a named donor is checked before its industry',()=>{
 const q='How much did Medibank Private, the health insurer, give to Labor?',period=api.inferPeriod(q),text='Labor disclosed $500,000 in receipts from Medibank Private (federal disclosures; financial years 1998-99 to 2025-26)'
 const sources=[src('fact-1',text,'export',{receipt:{party:'Labor',source:'Medibank Private',amount:500000,period:'1998-99 to 2025-26',jurisdiction:'federal',industry:'finance'}})]
 assert.match(api.proseFallback({question:q,period,constraints:{period,party:'Labor'},facts:api.writingFacts({answer:'',citations:{},sources})}).answer,/\$500,000/)
})
const evidence=input=>({mode:'loop',pre_writer_sources:input.facts.map(f=>({...f.source,snippet:f.text}))})
test('the causal decline only replaces receipt figures, not a passage answer',()=>{
 const question='Did gambling donors sway Labor?',input=moneyInput(question,'Labor'),draft='- In 2020, Avery Example said the lobby spent $5,000,000 on advertising.'
 const passage={resource:'p',slug:'',title:'Avery Example',href:'https://opax.com.au/x',url:'https://opax.com.au/x',snippet:'In 2020, Avery Example said the lobby spent $5,000,000 on advertising.',cited:true,kind:'speech',speaker:'Avery Example'}
 const out=api.groundAnswerPayload({answer:draft,answer_decision:'answer',citations:{'p/t/body/0':[[2,draft.length]]},sources:[passage],research:evidence(input)},question)
 assert.notEqual(out.answer_decision,'refusal');assert.ok(out.answer.includes('$5,000,000'))
})
