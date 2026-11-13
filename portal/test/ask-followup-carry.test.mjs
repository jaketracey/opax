import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {MockLanguageModelV4} from 'ai/test'
import {chatContext} from '../public/chat-context.js'
import {auditPayload} from '../src/research-claim-audit.mjs'
const built=await build({stdin:{contents:"export * from './src/research-response';export * from './src/ask-followup';export * from './src/research-grounding';export * from './src/research-writing';export * from './src/ask-rewrite';export * from './src/agentic-ask';export * from './src/research-loop';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const row={record_id:'tp-2025-26-d24f6c0f21f948d1bed236f4cd45c0ed',name:'Paul Graham',body:'Australian Postal Corporation',position:'Group CEO & MD',year:'2025-26',total:3127416}
const source={resource:'fact-2',slug:'',kind:'record',title:'Annual report',url:'https://www.transparency.gov.au/report',href:'https://www.transparency.gov.au/report',snippet:'Paul Graham (Group CEO & MD), Australian Postal Corporation, 2025-26 annual report on the Transparency Portal: total remuneration $3,127,416 (base salary $1,550,000).',cited:true,remuneration:row}
const context=()=>chatContext([{role:'user',text:'what was the highest paid agency head'},{role:'answer',text:'Paul Graham had total remuneration of $3,127,416.',sources:[source]}]).context
const bound=p=>{for(const rs of Object.values(p.citations))for(const [a,b] of rs)assert.ok(a>=0&&b>a&&b<=Array.from(p.answer).length)}

test('typed follow-ups carry cited name, body, role, year and record id, including legacy answers',()=>{
 const c=context();assert.deepEqual(c[1].sources[0].remuneration,row)
 assert.equal(c[1].sources[0].resource,'fact-2');assert.equal(c[1].sources[0].snippet,source.snippet)
 assert.equal(api.remunerationFollowUp('what did paul graham do?',c).record_id,row.record_id)
 assert.deepEqual(api.remunerationFollowUp('what did paul green do?',c),{person:'paul green'})
 assert.equal(api.remunerationFollowUp('what did paul green do?',[{author:'user',text:'What happened in parliament?'},{author:'answer',text:'Paul Graham spoke.'}]),null)
 assert.equal(api.sourceAboutPerson({speaker:'Paul Example Graham'},'Paul Graham'),true)
 assert.equal(api.sourceAboutPerson({speaker:'Paul Green'},'Paul Graham'),false)
 const thin=[{author:'user',text:'highest paid head'},{author:'answer',text:'Paul Graham received total remuneration of $3,127,416.'}]
 assert.equal(api.remunerationFollowUp('what did paul graham do?',thin).person,'paul graham')
 const old=context();delete old[1].sources[0].remuneration
 assert.equal(api.remunerationFollowUp('what did paul graham do?',old).body,row.body)
})
test('rewriter receives cited record hints for bills and commission transcripts',async()=>{
 let prompt=''
 await api.rewriteFollowUp({question:'What does the first one cover?',context:[{author:'user',text:'List commission transcripts'},{author:'answer',text:'One transcript.',sources:[{resource:'rc-transcript-18',cited:true,title:'Commission transcript 18',snippet:'Evidence from the 2018 hearing.'}]}]},async p=>(prompt=p,'What does Commission transcript 18 cover?'))
 assert.match(prompt,/rc-transcript-18/);assert.match(prompt,/Commission transcript 18/);assert.match(prompt,/Evidence from the 2018 hearing/)
})
test('an agency-head ranking keeps its latest selected year separate from older pay',()=>{
 const s2={...source,resource:'fact-1',snippet:'S Rue (Chief Executive Officer), NBN Co Limited, 2019-20 annual report on the Transparency Portal: total remuneration $3,149,541.',remuneration:{...row,record_id:row.record_id.replace('2025-26','2019-20'),name:'S Rue',body:'NBN Co Limited',position:'Chief Executive Officer',year:'2019-20',total:3149541}}
 const p=api.proseFallback({question:'what was the highest paid agency head',period:{kind:'all',label:''},facts:[{id:1,text:s2.snippet,source:s2},{id:2,text:source.snippet,source}]})
 assert.doesNotMatch(p.answer,/S Rue|2019-20/)
 assert.match(p.answer,/Paul Graham \(Group CEO & MD\), Australian Postal Corporation.*2025-26.*3,127,416/);bound(p)
 assert.equal(auditPayload('',p).findings.length,0)
})
test('appositive job titles and bodies cannot steal a named payee’s supported figure',()=>{
 const remuneration={...row,name:'Dennis Barnes',body:'Snowy Hydro Limited',position:'Managing Director and Chief Executive Officer',year:'2024-25',total:2060925}
 const s={...source,remuneration,snippet:'Dennis Barnes (Managing Director and Chief Executive Officer), Snowy Hydro Limited, 2024-25 annual report on the Transparency Portal: total remuneration $2,060,925.'}
 const answer='Dennis Barnes, Managing Director and Chief Executive Officer of Snowy Hydro Limited, had total remuneration of $2,060,925 in 2024-25.'
 const p={answer,sources:[s],citations:{'fact-2/t/body/0':[[0,answer.length]]}}
 assert.deepEqual(auditPayload('',p).findings,[])
 assert.deepEqual(auditPayload('',{...p,sources:[{...s,remuneration:undefined}]}).findings,[])
 assert.equal(api.groundAnswerPayload(p,'What did Dennis Barnes earn?').answer,answer)
 const bad={...p,answer:answer.replace('2,060,925','9,999,999')};bad.citations['fact-2/t/body/0']=[[0,bad.answer.length]]
 assert.ok(auditPayload('',bad).findings.some(f=>f.type==='figure'))
})
test('unrelated Reith and Paul Green records never become a Paul Graham title fallback; the draft stays as paraphrase',()=>{
 const sources=[{...source,remuneration:undefined,resource:'reith',kind:'speech',speaker:'Peter Keaston Reith',title:'Peter Keaston Reith — QUESTIONS ON NOTICE — 1997-09-22',date:'1997-09-22',snippet:'Mr Paul Redfern and Mr Graham were appointed.'},{...source,remuneration:undefined,resource:'green',kind:'speech',speaker:'Paul Green',title:'Paul Green — Modern Slavery Bill 2018 — 2018-05-03',date:'2018-05-03',snippet:'Paul Green discussed the bill.'}]
 const answer='Paul Graham said “An invented quotation about these appointments”.'
 const p=api.groundAnswerPayload({answer,sources,citations:{'reith/t/body/0':[[0,answer.length]]}},'what did paul graham do?')
 assert.equal(p.answer,'Paul Graham said An invented quotation about these appointments.');assert.doesNotMatch(p.answer,/The record dated|Reith|Paul Green|^[-—]/m)
 const cached='The record dated 3 May 2018 is Paul Green, Modern Slavery Bill 2018, 3 May 2018.'
 const old=api.groundAnswerPayload({answer:cached,sources,citations:{'green/t/body/0':[[0,cached.length]]}},'Who is Paul Graham?')
 assert.equal(old.answer,cached)
})
test('answer formatting removes dash bullets and prose em dashes with valid citation ranges',async()=>{
 const answer='- Paul Graham received total remuneration of $3,127,416 — in 2025-26.'
 const p=await (await api.withAnswerLanguage(Response.json({answer,sources:[source],citations:{'fact-2/t/body/0':[[2,Array.from(answer).length]]}}),'What did Paul Graham earn?')).json()
 assert.doesNotMatch(p.answer,/—|^\s*[-*•]/m);bound(p)
})
test('the loop re-reads the canonical carried row before asking the model',async()=>{
 const calls=[]
 const model=new MockLanguageModelV4({doGenerate:{content:[{type:'tool-call',toolName:'answer',toolCallId:'finish',input:JSON.stringify({facts:[2]})}],finishReason:{unified:'tool-calls',raw:'tool_calls'},usage:{inputTokens:{total:10},outputTokens:{total:10}},warnings:[]}})
 const data={meta:{snapshot_at:'2026-11-12',counts:{years:['2025-26']}},bodies:[{id:'post',name:row.body}],headline:[]}
 const file={year:'2025-26',tables:{t:{body_id:'post',body:row.body,source_url:source.url}},rows:[{kind:'kmp',table_id:'t',...row}]}
 const research=api.createResearch({model,input:{context:context()},conversation:context(),modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})}});research.write=undefined
 const deps={asset:async path=>(calls.push(path),path==='/annual-reports/index.json'?data:path==='/annual-reports/remuneration-2025-26.json'?file:null),kb:async()=>({})}
 const scope={people:[],parties:[],bills:[],ambiguous:false,unresolved:true}
 const run=await api.runAgentic('what did paul graham do?',{...deps,research},async()=>{},40000,{kind:'all',label:''},{},scope)
 assert.ok(calls.includes('/annual-reports/remuneration-2025-26.json'));assert.equal(run.answered,true)
 assert.equal(run.steps[0].tool,'annual_reports');assert.equal(run.steps[0].args.record_id,row.record_id)
 assert.match(JSON.stringify(model.doGenerateCalls[0].prompt),/Group CEO & MD/)
 assert.equal(run.qualitative.sources.find(s=>s.remuneration)?.remuneration.record_id,row.record_id,JSON.stringify(run.qualitative.sources))
})

test('each payee keeps their own reporting period in a multi-person comparison',()=>{
 const a={...source,resource:'a'}
 const b={...source,resource:'b',remuneration:{...row,name:'Dennis Barnes',body:'Snowy Hydro Limited',position:'Managing Director and Chief Executive Officer',year:'2024-25',total:2060925},snippet:'Dennis Barnes (Managing Director and Chief Executive Officer), Snowy Hydro Limited, 2024-25 annual report on the Transparency Portal: total remuneration $2,060,925.'}
 const answer='Paul Graham had total remuneration of $3,127,416 in 2025-26, and Dennis Barnes, Managing Director and Chief Executive Officer of Snowy Hydro Limited, had total remuneration of $2,060,925 in 2024-25.'
 const p={answer,sources:[a,b],citations:{'a/t/body/0':[[0,answer.length]],'b/t/body/0':[[0,answer.length]]}}
 assert.deepEqual(auditPayload('',p).findings,[])
 const bad={...p,answer:answer.replace('3,127,416 in 2025-26','3,127,416 in 2024-25')}
 assert.ok(auditPayload('',bad).findings.length)
})

test('long conversation hints stay inside the 16 KB request cap and retain SA provenance',()=>{
 const thread=Array.from({length:12},(_,i)=>i%2?{role:'answer',text:'A'.repeat(3000),sources:[{...source,kind:'speech',state:'sa',cited:false},...Array.from({length:15},()=>({...source,title:'B'.repeat(1000),snippet:'C'.repeat(5000)}))]}:{role:'user',text:'Question '.repeat(100)})
 const question='What does it cover?'
 const payload=chatContext(thread,question)
 assert.ok(new TextEncoder().encode(JSON.stringify({question,...payload})).length<16384)
 assert.ok(payload.context.some(t=>t.sources?.some(s=>s.state==='sa')))
})

test('generic record questions are not mistaken for a named person',()=>{
 assert.equal(api.questionPerson('What does the record say about housing affordability?'),null)
})

test('a new named head in a pay conversation uses annual reports when the prior answer omitted them',()=>{
 const c=[{author:'user',text:'what was the highest paid agency head'},{author:'answer',text:'Stephanie Foster PSM was a Secretary.'}]
 assert.deepEqual(api.remunerationFollowUp('what did paul graham do?',c),{person:'paul graham'})
})
test('display punctuation never changes words inside retained quotation marks',async()=>{
 const answer='The member said “We agree—on this issue.”'
 const p=await(await api.withAnswerLanguage(Response.json({answer,citations:{},sources:[]}))).json()
 assert.doesNotMatch(p.answer,/—|[“”]/);assert.match(p.answer,/We agree, on this issue/)
})
