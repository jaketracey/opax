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
 assert.match(out.answer.split('\n')[0],/1998-99 to 2025-26.*Tabcorp Holdings Limited provided the most disclosed funding to Labor: \$2,371,237/)
 assert.match(out.answer,/Clubs NSW.*2,134,784/);assert.match(out.answer,/lower bound/);assert.equal(out.answer_decision,'answer')
 assert.ok(out.citations['fact-1/t/body/0']);assert.doesNotMatch(out.answer,/cannot establish|gave Labor|donated/i)
})
test('a how-much follow-up leads with its figures, not the speech points beside them',()=>{
 const input=moneyInput(followUp,'Liberal'),points={answer:'- In 2020, Jane Hume said donations are declared to the AEC.',answer_status:undefined,citations:{'p/t/body/0':[[2,61]]},sources:[{resource:'p',slug:'',title:'Jane Hume',href:'/doc/1',url:'/doc/1',snippet:'I said donations are declared to the AEC.',cited:true,kind:'speech',speaker:'Jane Hume',date:'2020-06-15'}]}
 const out=api.groundAnswerPayload(api.appendWrittenPoints(api.proseFallback(input),points),followUp)
 assert.match(out.answer.split('\n')[0],/Liberal disclosed \$2,222,296 in receipts from Tabcorp Holdings Limited/);assert.match(out.answer,/rather than one combined total/)
 assert.ok(out.answer.indexOf('$2,222,296')<out.answer.indexOf('Jane Hume'));assert.equal(out.answer_decision,'answer')
})
test('money follow-up points with the figures stripped get the figures back ahead of them',()=>{
 const input=moneyInput(followUp,'Liberal'),answer='- In 2020, Jane Hume said donations are declared to the AEC.'
 const speech={resource:'p',slug:'',title:'Jane Hume',href:'/doc/1',url:'/doc/1',snippet:'I said donations are declared to the AEC.',cited:true,kind:'speech',speaker:'Jane Hume',date:'2020-06-15'}
 const out=api.groundAnswerPayload({answer,answer_decision:'limitation',citations:{'p/t/body/0':[[2,answer.length]]},sources:[...input.facts.map(f=>f.source),speech],answer_scope:input.constraints,research:{mode:'loop',pre_writer_sources:input.facts.map(f=>({...f.source,snippet:f.text,...(f.coverage?{coverage:true}:{})}))}},followUp)
 assert.match(out.answer.split('\n')[0],/\$2,222,296/);assert.match(out.answer,/Jane Hume/);assert.equal(out.answer_decision,'answer')
})
test('a draft of the tool wording, in either direction, passes the audit that used to strip it',()=>{
 const input=moneyInput(gambling,'Labor')
 for(const text of ['Labor disclosed $2,371,237 in receipts from Tabcorp Holdings Limited across financial years 1998-99 to 2025-26.','Tabcorp Holdings Limited provided the most disclosed receipts to Labor, with $2,371,237 across financial years 1998-99 to 2025-26.','Labor disclosed the most from Tabcorp Holdings Limited at $2,371,237, followed by Clubs NSW at $2,134,784.']){
  const written=api.verifyWrittenAnswer({answer_decision:'answer',sentences:[{text,facts:[1,2]}]},input)
  assert.deepEqual(auditPayload(gambling,written).findings,[]);assert.ok(api.groundAnswerPayload(written,gambling).answer.includes('$2,371,237'))
 }
})
test('a revision cannot throw away every usable fact: the second pass still has the figures',async()=>{
 const {model,write}=writer(()=>({answer_decision:'answer',sentences:[{text:'Tabcorp Holdings Limited provided $9,999,999.',facts:[1]},{text:'These are disclosed receipts.',facts:[4],coverage:true}]}))
 const out=await write(moneyInput(gambling,'Labor'),stats(),undefined,3000)
 assert.equal(model.doGenerateCalls.length,2);assert.match(JSON.stringify(model.doGenerateCalls[1].prompt),/2,371,237/)
 assert.match(out.answer,/\$2,371,237/);assert.doesNotMatch(out.answer,/9,999,999|cannot establish/)
})
test('a writer that only gives up does not hide the facts',async()=>{
 for(const answer_decision of ['limitation','answer']){
  const {write}=writer(()=>({answer_decision,sentences:[{text:'The selected records do not establish a ranking of companies.',facts:[1,2,3]}]}))
  const out=await write(moneyInput(gambling,'Labor'),stats(),undefined,3000)
  assert.match(out.answer,/\$2,371,237/,answer_decision);assert.equal(out.answer_decision,'answer')
 }
})
test('with no model at all the facts still answer',async()=>{
 const write=api.createAnswerWriter({modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>null}})
 const out=await write(moneyInput(followUp,'Liberal'),stats(),undefined,3000);assert.match(out.answer,/\$2,222,296/);assert.equal(out.coherence.fallback,true)
})

// The guarantee: a wording no parser has seen, on every path a response can leave by.
const unseen='Zephyr Holdings lodged 4,321 widgets with the Clerk in spring'
const unseenSource={resource:'fact-1',slug:'',title:'Register',href:'https://opax.com.au/r',url:'https://opax.com.au/r',snippet:unseen,cited:true,kind:'record'}
const unseenPayload={answered:true,answer:refusal,answer_decision:'limitation',citations:{'coverage/t/body/0':[[0,refusal.length]]},sources:[{resource:'coverage',slug:'',title:'Coverage',href:'https://opax.com.au/c',url:'https://opax.com.au/c',snippet:'Some coverage note.',cited:true,kind:'record'}],research:{mode:'loop',rounds:1,trail:[],sources:[],pre_writer_sources:[unseenSource]}}
const check=out=>{assert.match(out.answer,/Zephyr Holdings lodged 4,321 widgets/);assert.doesNotMatch(out.answer,/cannot establish/);assert.equal(out.answer_decision,'answer');assert.ok(out.citations['fact-1/t/body/0'])}
const question='What did Zephyr Holdings lodge?'
test('a fact format no parser has seen is rendered, not refused',()=>{
 check(api.proseFallback({question,period:{kind:'all',label:''},facts:[{id:1,text:unseen,source:unseenSource}]}))
})
test('the terminal rule holds on the JSON boundary and is stable on repeat',()=>{
 const once=api.groundAnswerPayload(structuredClone(unseenPayload),question);check(once);assert.deepEqual(api.groundAnswerPayload(once,question),once)
})
for(const [name,wrap] of [['JSON',p=>Response.json(p)],['cache replay',p=>Response.json(p,{headers:{'x-opax-cache':'HIT'}})],['SSE',p=>new Response('event: done\ndata: '+JSON.stringify(p)+'\n\n',{headers:{'content-type':'text/event-stream'}})],['SSE cache replay',p=>new Response('event: done\ndata: '+JSON.stringify(p)+'\n\n',{headers:{'content-type':'text/event-stream','x-opax-cache':'HIT'}})]])test('the terminal rule holds on '+name,async()=>{
 const wire=await(await api.withAnswerLanguage(wrap(structuredClone(unseenPayload)),question)).text()
 check(name.startsWith('SSE')?JSON.parse(/event: done\ndata: (.+)/.exec(wire)[1]):JSON.parse(wire))
})
test('the terminal rule holds on ordinary fallback, after its period guard',async()=>{
 const scoped=await api.withFallbackPeriod(Response.json(structuredClone(unseenPayload)),{kind:'all',label:''})
 check(await(await api.withAnswerLanguage(scoped,question)).json())
})
test('a stale cached refusal is rewritten on replay from its own stored facts',async()=>{
 const stale={...structuredClone(unseenPayload),research:{...unseenPayload.research}}
 check(await(await api.withAnswerLanguage(Response.json(stale,{headers:{'x-opax-cache':'HIT'}}),question)).json())
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

// The hard lines stay.
test('a causal money question declines even when the model selected receipts',async()=>{
 const q='Which mining donor bought votes?',input=moneyInput(q,'Labor'),fallback=api.proseFallback(input)
 assert.equal(fallback.answer_decision,'refusal');assert.doesNotMatch(fallback.answer,/\$\d/);assert.match(fallback.answer,/do not establish that money caused a vote/)
 const out=api.groundAnswerPayload({...unseenPayload,answer:fallback.answer,answer_decision:'refusal',citations:{},sources:[]},q);assert.doesNotMatch(out.answer,/Zephyr/)
 const {write}=writer(()=>({answer_decision:'answer',sentences:[{text:'Tabcorp bought votes with $2,371,237.',facts:[1]}]}))
 assert.doesNotMatch((await write(input,stats(),undefined,3000)).answer,/bought votes with/)
})
for(const [decision,status] of [['refusal',undefined],['clarification',undefined],[undefined,'needs_question'],[undefined,'needs_scope'],[undefined,'declined']])test(`a typed ${decision??status} is never turned into facts`,()=>{
 const answer='Please name the person you mean.',p={...structuredClone(unseenPayload),answer,citations:{},answer_decision:decision,answer_status:status}
 assert.equal(api.groundAnswerPayload(p,question).answer,answer)
})
test('a known wrong period stays a limitation; only undated rows stand, marked',()=>{
 const constraints={dated:true,period:{kind:'window',since:'2005-01-01',until:'2005-12-31',label:'2005'}}
 const known={tool:'parliamentary_pay',ok:true,data:{coverage:{since:'2026-10-19',until:'2026-10-19',as_of:'2026-10-19'},rows:[{salary:622102}]},cite:[{kind:'record',label:'Current salary $622,102',url:'https://example.org/pay'}],notes:[]}
 assert.equal(api.guardToolPeriod(known,{tool:known.tool,args:{}},constraints).data.coverage_only,true)
 const undated={tool:'contracts',ok:true,data:{rows:[{name:'X'}]},cite:[{kind:'record',label:'X Pty Ltd: $5,000 contract',url:'https://example.org/c'}],notes:[]},guarded=api.guardToolPeriod(undated,{tool:'contracts',args:{}},constraints)
 assert.equal(guarded.data.coverage_only,undefined);assert.equal(guarded.notes[0],api.UNCONFIRMED_PERIOD)
 const facts=[{id:1,text:'X Pty Ltd: $5,000 contract',source:{...unseenSource,snippet:'x'}},{id:2,text:api.UNCONFIRMED_PERIOD,coverage:true,source:{...unseenSource,resource:'coverage',snippet:'x'}}]
 assert.match(api.proseFallback({question:'Who won contracts in 2005?',period:constraints.period,facts}).answer,/could not confirm/)
})
test('a receipt total from outside the requested period is not the answer: the limitation stands',()=>{
 const q='How much did Labor disclose from Tabcorp in 1990?',input=moneyInput(q,'Labor'),answer='The disclosed returns cover 1998–99 to 2025–26 and cannot establish the answer for 1990.'
 const out=api.groundAnswerPayload({answer,answer_decision:'limitation',citations:{},sources:[],research:{mode:'loop',pre_writer_sources:input.facts.map(f=>({...f.source,snippet:f.text,...(f.coverage?{coverage:true}:{})}))}},q)
 assert.equal(out.answer,answer)
})
test('ordinary fallback keeps prose outside the period with its dates stated, never figures',async()=>{
 const period={kind:'window',since:'2005-01-01',until:'2005-12-31',label:'2005'},source={resource:'r',kind:'speech',date:'2023-05-01',cited:true,href:'https://example.org/d'}
 const prose=await(await api.withFallbackPeriod(Response.json({answer:'Parliament debated the reform at length.',sources:[source],citations:{'r/t/body/0':[[0,40]]}}),period)).json()
 assert.match(prose.answer,/dated 2023-05-01/);assert.match(prose.answer,/debated the reform/);assert.equal(prose.answer_status,'coverage_only');assert.ok(prose.citations['r/t/body/0'][0][0]>0)
 const figures=await(await api.withFallbackPeriod(Response.json({answer:'The salary is $622,102.',sources:[source],citations:{}}),period)).json()
 assert.doesNotMatch(figures.answer,/622,102/)
})
test('federal receipts are never called gifts or donations by the renderer',()=>{
 for(const q of [gambling,followUp,'What did Labor disclose?']){
  const out=api.proseFallback(moneyInput(q,q===followUp?'Liberal':'Labor'))
  assert.doesNotMatch(out.answer.replace(/a donation is not evidence that it influenced a vote or speech/,''),/\bgifts?\b(?! )|\bdonat(?:ed|ion)\b/i)
 }
})
test('only an answer is cacheable',()=>{
 const cited={'fact-1/t/body/0':[[0,5]]}
 assert.equal(api.cacheableRoutedAnswer({answer_decision:'answer',citations:cited},true),true)
 for(const answer_decision of ['limitation','refusal','clarification','preserve'])assert.equal(api.cacheableRoutedAnswer({answer_decision,citations:cited},true),false,answer_decision)
 assert.equal(api.cacheableRoutedAnswer({answer_status:'coverage_only',citations:cited},true),false)
 assert.equal(api.cacheableRoutedAnswer({answer_decision:'answer',citations:{}},true),false)
})
test('the production refusal cannot be cached, and its question now can be',()=>{
 const before={answer:refusal,answer_decision:'limitation',citations:{'coverage/t/body/0':[[0,69]]}}
 assert.equal(api.cacheableRoutedAnswer(before,true),false)
 assert.equal(api.cacheableRoutedAnswer(api.groundAnswerPayload(api.proseFallback(moneyInput(gambling,'Labor')),gambling),true),true)
})
test('this change retires every earlier cached answer',()=>{assert.equal(api.ANSWER_WRITING_VERSION,'written-answer-12-found-facts-answer')})
