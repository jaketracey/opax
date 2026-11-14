// Ask's bare-minimum answer checks (13 Nov 2026): stored payloads and a scripted model, no provider or network calls.
// What stays: quote marks only around words a cited source holds (else paraphrase), the money owner and period rule,
// the spend cap (which now writes the answer from what research gathered), and an ambiguous surname answered for the
// likely person with the others named. Everything else the answer says stands, cited or not.
import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {MockLanguageModelV4} from 'ai/test'

const built=await build({stdin:{contents:"export * from './src/agentic-ask';export * from './src/research-loop';export * from './src/research-evidence';export * from './src/research-grounding';export * from './src/research-response';export {leadWithModelAnswer} from './src/research-answer-shape';export {createResearchCreditCooldown} from './src/research-credit';export {inferPeriod} from './src/ask-period';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))

const speech=(id,speaker,date,text,party)=>({id:`${id}/t/body/0-${text.length}`,resource:id,slug:id,title:`Hansard ${date}`,url:`https://opax.com.au/doc/${id}`,kind:'speech',speaker,date,text,...(party?{party}:{})})
const sourceOf=p=>({resource:p.resource,slug:p.slug,title:p.title,href:p.url,url:p.url,snippet:p.text,cited:true,kind:p.kind,date:p.date,speaker:p.speaker})
const scope={people:[],parties:[],bills:[],ambiguous:false,unresolved:false}

test('quoted words no cited source holds lose their marks; the sentence stays as paraphrase',()=>{
  const p=speech('speech-1','Jordan Sample','2023-07-10','The report found the scheme was a costly failure of public administration.')
  const answer='Jordan Sample said the report described “a crude and cruel mechanism”. Jordan Sample said the report found “the scheme was a costly failure of public administration”.'
  const out=api.groundAnswerPayload({answer,citations:{[p.id]:[[0,Array.from(answer).length]]},sources:[sourceOf(p)]},'What did the report find?')
  assert.match(out.answer,/described a crude and cruel mechanism\./)
  assert.doesNotMatch(out.answer,/“a crude and cruel mechanism”/)
  assert.match(out.answer,/found “the scheme was a costly failure of public administration”/)
  assert.ok(out.citations[p.id])
})

const receipt=(resource,source,party,amount,period)=>({resource,slug:'',title:'Disclosed receipt',href:'https://opax.com.au/money',url:'https://opax.com.au/money',kind:'record',cited:true,
  snippet:`Disclosed receipt: ${source} → ${party} — $${amount.toLocaleString('en-AU')} in disclosed political receipts, ${period}.`,receipt:{source,party,amount,period}})
const cite=(answer,sentence,resource)=>{const at=Array.from(answer.slice(0,answer.indexOf(sentence))).length;return {[resource+'/t/body/0']:[[at,at+Array.from(sentence).length]]}}

test('a dollar figure given to the wrong donor is corrected from the money record it cites',()=>{
  const r=receipt('fact-1','Example Holdings Pty Ltd','Labor',50000,'2019-20')
  const first='Labor received $50,000 from Sample Freight Pty Ltd in 2019-20.',answer=first+' The party also reported other receipts that year.'
  const out=api.groundAnswerPayload({answer,citations:cite(answer,first,'fact-1'),sources:[r]},'Who gave Labor money in 2019-20?')
  assert.match(out.answer,/Labor received \$50,000 from Example Holdings Pty Ltd in 2019-20\./)
  assert.doesNotMatch(out.answer,/Sample Freight/)
  assert.match(out.answer,/The party also reported other receipts that year\./)
})

test('a dollar figure the record holds for another party and period it cannot settle goes; only that sentence goes',()=>{
  const records=[receipt('fact-1','Example Holdings Pty Ltd','Labor',50000,'2019-20'),receipt('fact-2','Example Holdings Pty Ltd','Greens',50000,'2020-21')]
  const lead='Example Holdings Pty Ltd is a freight company that has given to several parties.'
  const wrong='Sample Freight Pty Ltd gave $50,000 to the Liberal Party in 2018-19.'
  const answer=lead+' '+wrong+' Its disclosures are published by the Australian Electoral Commission.'
  const citations={'fact-1/t/body/0':cite(answer,wrong,'fact-1')['fact-1/t/body/0'],'fact-2/t/body/0':cite(answer,wrong,'fact-2')['fact-2/t/body/0']}
  const out=api.groundAnswerPayload({answer,citations,sources:records},'Who has Example Holdings given money to?')
  assert.doesNotMatch(out.answer,/\$50,000|Liberal/)
  assert.match(out.answer,/^Example Holdings Pty Ltd is a freight company that has given to several parties\./)
  assert.match(out.answer,/Its disclosures are published by the Australian Electoral Commission\./)
})

test('a figure in a speech passage is never treated as a money record',()=>{
  const p=speech('speech-2','Jordan Sample','2021-03-01','The program cost taxpayers more than a billion dollars.')
  const answer='Jordan Sample said the program cost $1.2 billion and Casey Sample received $40,000.'
  const out=api.groundAnswerPayload({answer,citations:{[p.id]:[[0,Array.from(answer).length]]},sources:[sourceOf(p)]},'What did the program cost?')
  assert.equal(out.answer,answer)
})

const call=(name,args,id='fixture')=>({type:'tool-call',toolName:name,toolCallId:id,input:JSON.stringify(args)})
const reply=calls=>({content:calls,finishReason:{unified:'tool-calls',raw:'tool_calls'},usage:{inputTokens:{total:10,noCache:10,cacheRead:0,cacheWrite:0},outputTokens:{total:5,text:5,reasoning:0}},warnings:[]})
const choice=c=>c.toolChoice?.type==='tool'?c.toolChoice.toolName:c.toolChoice?.type

test('at the spend cap the last affordable turn writes the answer from what research gathered',async()=>{
  const question='Who speaks most about gambling in NSW across the whole record?',args={topic:'gambling',state:'nsw',group_by:'speaker'}
  // Each turn reserves about $0.09 at these prices, so a third turn would pass the $0.25 cap: turn two must finish.
  const m=new MockLanguageModelV4({doGenerate:[reply([call('count_speeches',args,'a')]),reply([call('finish',{facts:[1]},'b')])]})
  const deps={asset:async()=>null,kb:async()=>({fulltext:{total:100,facets:{'/u/o':{'/u/o/Taylor Example':87,'/u/o/Pat Example':13}}}}),generate:async()=>{throw new Error('the old planner must not run')},
    research:Object.assign(api.createResearch({inputPrice:2,outputPrice:6,model:m,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})},creditCooldown:api.createResearchCreditCooldown()}),{write:undefined})}
  const run=await api.runAgentic(question,deps,async()=>{},40_000,api.inferPeriod(question),{},scope)
  assert.equal(choice(m.doGenerateCalls[0]),'required')
  assert.equal(choice(m.doGenerateCalls[1]),'finish')
  assert.equal(run.answered,true);assert.equal(run.research_failure,undefined)
  assert.match(run.answer,/Taylor Example: 87/)
  assert.doesNotMatch(run.answer,/budget/i)
})

test('a surname two people share answers about the likely one and names the other under the answer',()=>{
  const roster={people:[
    {name:'Casey Sample',speeches:900,current:false,party:'Liberal'},
    {name:'Jordan Sample',speeches:40,current:true,party:'Labor'},
  ]}
  const named=api.extractNamedScope('What has Senator Sample said about housing?',roster,null)
  assert.equal(named.ambiguous,false)
  assert.deepEqual(named.people,['Jordan Sample'])
  assert.deepEqual(named.otherMatches,['Casey Sample'])
  const former=api.extractNamedScope('What has Senator Sample said about housing?',{people:roster.people.map(p=>({...p,current:false}))},null)
  assert.deepEqual(former.people,['Casey Sample'],'with no current office holder the one with the most records leads')
  const run=api.otherMatchLine({answered:true,answer:'Jordan Sample has spoken about housing supply.',other_matches:['Casey Sample'],qualitative:{answer:'Jordan Sample has spoken about housing supply.',citations:{},sources:[]}})
  assert.equal(run.answer,'Jordan Sample has spoken about housing supply.\n\nIf you meant Casey Sample, ask again with the full name.')
  assert.equal(run.qualitative.answer,run.answer)
  assert.equal(run.other_matches,undefined,'the internal field never reaches the response')
})

test('robodebt: a researched answer naming the ministers stays whole, uncited lines included',async()=>{
  const question='Who was responsible for robodebt?'
  const rice=speech('speech-10','Janet Rice','2023-07-08',"We saw that yesterday in the government's response to the Royal Commission into the Robodebt Scheme.",'Greens')
  const thwaites=speech('speech-11','Kate Thwaites','2023-07-10','the report of the Royal Commission into the Robodebt Scheme, a 990-page report that examined the establishment of the scheme and who was responsible','Labor')
  const passages=new Map([[rice.id,rice],[thwaites.id,thwaites]])
  const points=[
    {claim:'The Royal Commission into the Robodebt Scheme, led by Commissioner Catherine Holmes, found the scheme was crude, cruel, unfair and unlawful, and that responsibility lay with ministers and senior public servants.'},
    {claim:'Scott Morrison, as Social Services Minister in 2015, took the proposal to Cabinet; the Commission found Cabinet was misled about its legality.'},
    {claim:'Alan Tudge, as Human Services Minister, oversaw the 2016 rollout, and Christian Porter and Stuart Robert defended the scheme as ministers in later years.'},
    {claim:'Kate Thwaites said the 990-page report examined the establishment of the scheme and who was responsible.',id:thwaites.id,quote:'a 990-page report that examined the establishment of the scheme and who was responsible'},
    {claim:"Janet Rice said the government had responded to the Royal Commission into the Robodebt Scheme.",id:rice.id,quote:"the government's response to the Royal Commission into the Robodebt Scheme"},
  ]
  const verified=api.verifyResearchPoints(points,passages,question,scope)
  assert.equal(verified.answer_status,'partly_cited')
  const lines=verified.answer.split('\n')
  assert.equal(lines.length,5)
  const grounded=api.groundAnswerPayload({...verified,research:{mode:'loop'}},question)
  const out=await(await api.withAnswerLanguage(Response.json({...grounded,answered:true}),question)).json()
  for(const name of ['Catherine Holmes','Scott Morrison','Alan Tudge','Christian Porter','Stuart Robert','Kate Thwaites','Janet Rice'])assert.match(out.answer,new RegExp(name),name)
  assert.match(out.answer,/^The cited sources do not name a person or office as responsible\.\n\nThe Royal Commission into the Robodebt Scheme, led by Commissioner Catherine Holmes, found/)
  assert.match(out.answer,/crude, cruel, unfair and unlawful/)
  assert.doesNotMatch(out.answer,/no public record|does not establish|could not/i)
  assert.ok(Object.keys(out.citations).some(id=>id.startsWith('speech-11')))
  assert.ok(Object.keys(out.citations).some(id=>id.startsWith('speech-10')))
})

test('the model’s own direct answer leads record facts and written record prose',()=>{
  const points={answer:'- Scott Morrison, Alan Tudge and Stuart Robert were the ministers responsible.\n- Kate Thwaites said the report examined who was responsible.',citations:{'speech-11/t/body/0':[[80,140]]}}
  const facts='- The Royal Commission into the Robodebt Scheme reported on 7 July 2023.'
  const answer=facts+'\n'+points.answer,shift=Array.from(facts).length+1
  const out=api.leadWithModelAnswer({answer,citations:{'fact-1/t/body/0':[[2,Array.from(facts).length]],'speech-11/t/body/0':[[80+shift,140+shift]]}},points)
  assert.match(out.answer,/^- Scott Morrison, Alan Tudge and Stuart Robert were the ministers responsible\.\n\n- The Royal Commission/)
  const cite=(id)=>out.citations[id].map(([a,b])=>Array.from(out.answer).slice(a,b).join(''))
  assert.match(cite('fact-1/t/body/0')[0],/^The Royal Commission into the Robodebt Scheme reported on 7 July 2023\.$/)
  assert.match(cite('speech-11/t/body/0')[0],/Kate Thwaites said/)
  const citedLead={...points,citations:{'speech-11/t/body/0':[[2,20]]}}
  assert.match(api.leadWithModelAnswer({answer,citations:{}},citedLead).answer,/^- Scott Morrison/,'a cited first point leads too')
})

// Research that ends early still answers: a scripted model, local stubs for records and the knowledge base.
const loopDeps=(m,options={})=>{
  const pid='b'.repeat(32)+'/t/body/0-120',passage='The department paid about $30 million for the Leppington Triangle land, ten times its value, the Auditor-General found.'
  let plannerCalls=0
  const deps={asset:async()=>null,
    kb:async(path,body)=>options.emptyKb?{resources:{}}:{resources:{[pid.split('/')[0]]:{slug:'speech-9',title:'Leppington Triangle',fields:{body:{paragraphs:{[pid]:{text:passage}}}}}},fulltext:{total:100,facets:{'/u/o':{'/u/o/Taylor Example':87,'/u/o/Pat Example':13}}}},
    generate:async()=>{plannerCalls++;throw new Error('the old planner must not run')},
    research:Object.assign(api.createResearch({inputPrice:0.1,outputPrice:0.3,model:m,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})},creditCooldown:api.createResearchCreditCooldown(),readRecord:async()=>({text:passage,speaker:'Jordan Sample'}),...options}),{write:undefined})}
  return {deps,pid,passage,get plannerCalls(){return plannerCalls}}
}
const ask=(q,deps)=>api.runAgentic(q,deps,async()=>{},40_000,api.inferPeriod(q),{},scope)

test('a failed tool call at round 3 with passages held still gives a real answer from them',async()=>{
  const q='Who was responsible for the Leppington Triangle land purchase?'
  const m=new MockLanguageModelV4({doGenerate:[
    reply([call('search',{query:'Leppington Triangle purchase'},'a')]),
    reply([call('search',{query:'Leppington Triangle Auditor-General'},'b')]),
    reply([call('corpus_records',{query:'Leppington Triangle',limit:999},'c')]),
    reply([call('answer',{points:[{claim:'The Department of Infrastructure bought the Leppington Triangle for about $30 million, ten times its value, under the Morrison government.'}]},'d')]),
  ]})
  const f=loopDeps(m,{steps:3}),run=await ask(q,f.deps)
  assert.equal(choice(m.doGenerateCalls[3]),'answer','research stopped at the round cap; the final call answers')
  assert.equal(run.answered,true);assert.equal(f.plannerCalls,0)
  assert.match(run.answer,/^- The Department of Infrastructure bought the Leppington Triangle/)
  assert.doesNotMatch(run.answer,/do not identify|selected facts|cannot establish/i)
  const prompt=JSON.stringify(m.doGenerateCalls[3].prompt)
  assert.ok(prompt.includes('ten times its value'),'the final call is given the passages research held')
  assert.match(prompt,/For a who question, name the people and their roles first/)
})

test('a count run that fails late keeps the facts it gathered, with no budget line',async()=>{
  const q='Who speaks most about gambling in NSW across the whole record?'
  const m=new MockLanguageModelV4({doGenerate:[reply([call('count_speeches',{topic:'gambling',state:'nsw',group_by:'speaker'},'a')]),()=>{throw new Error('provider went away')}]})
  const f=loopDeps(m),run=await ask(q,f.deps)
  assert.equal(run.answered,true);assert.equal(f.plannerCalls,0)
  assert.match(run.answer,/Taylor Example: 87/)
  assert.doesNotMatch(run.answer,/budget/i)
})

test('research that gathered nothing answers from general knowledge, and the note says the records were not reached',async()=>{
  const q='What happened with the Leppington Triangle purchase?'
  const m=new MockLanguageModelV4({doGenerate:[
    reply([call('search',{query:'Leppington Triangle'},'a')]),
    reply([call('answer',{points:[{claim:'The Commonwealth bought the Leppington Triangle in 2018 for about $30 million, and the Auditor-General later found it paid ten times its value.'}]},'b')]),
  ]})
  const f=loopDeps(m,{steps:1,emptyKb:true}),run=await ask(q,f.deps)
  assert.equal(run.answered,true);assert.equal(f.plannerCalls,0)
  assert.match(run.answer,/Auditor-General later found/)
  assert.equal(run.qualitative.coverage.note,'OPAX’s records were not reached for this question, so this answer draws on general knowledge.')
})

// With no model call left, the passages research already holds answer in their own words, never nothing.
for(const [name,options,second] of [
  ['the wall clock',{wallMs:1500},()=>new Promise(()=>{})],
  ['the spend cap',{inputPrice:5,outputPrice:15},reply([call('answer',{points:[{claim:'never reached'}]},'b')])],
])test(`a stop at ${name} with passages held answers from them, cited`,async()=>{
  const q='Who was responsible for the Leppington Triangle land purchase?'
  const m=new MockLanguageModelV4({doGenerate:[reply([call('search',{query:'Leppington Triangle purchase'},'a')]),second]})
  const f=loopDeps(m,options),run=await ask(q,f.deps)
  assert.equal(run.answered,true);assert.equal(f.plannerCalls,0)
  assert.equal(run.research.failure,undefined)
  assert.match(run.answer,/Jordan Sample said “[^”]*ten times its value/)
  assert.doesNotMatch(run.answer,/never reached/)
  const ranges=Object.values(run.qualitative.citations).flat();assert.ok(ranges.length)
  for(const [a,b] of ranges)assert.ok(a>=0&&b>a&&b<=Array.from(run.answer).length)
  assert.equal(m.doGenerateCalls.length,name==='the spend cap'?1:2,'no final model call past a time or spend cap')
})
