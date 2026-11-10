import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {runGate} from '../../scripts/ask_eval_gate.mjs'
import {runEval} from '../../scripts/research_eval.mjs'
import {gradeRow} from '../../scripts/research_eval_grade.mjs'
import {loadWorker,offline,outbound} from './worker-harness.mjs'
import {localApi,localAsk,localFetch,assets} from './ask-lobby-money-harness.mjs'
const api=await localApi()
const questions=JSON.parse(await readFile(new URL('./fixtures/ask-routing-evals.json',import.meta.url))).questions.filter(q=>q.id.startsWith('MONEY-INDUSTRY-'))

test('all six industry and speech regression questions are in the routing evals',()=>assert.equal(questions.length,6))
const monetaryFigure=/\$\s*\d|\b\d[\d,.]*\s*(?:AUD|dollars?|million|billion)\b/i
test('industry questions lead with the mixed receipt measure and offer unranked records without amounts',async()=>{
 for(const q of questions.filter(q=>q.kind==='money'&&q.id!=='MONEY-INDUSTRY-banks')){
  const answer=await localAsk(api,q.question,{onResearch:()=>assert.fail('money must bypass speech retrieval')})
  assert.equal(answer.answer_status,'evidence_gap',q.question)
  assert.match(answer.answer,new RegExp(q.local_match),q.question)
  assert.match(answer.answer.split(/[.!?]/)[0],/figures currently combine donations with loans and other receipts/)
  assert.match(answer.answer,/sources OPAX groups under/)
  assert.match(answer.answer,/financial years \d{4}/)
  assert.match(answer.answer,/disclosure thresholds|disclosure threshold/i)
  assert.match(answer.answer,/Other receipts.*not donations/)
  assert.match(answer.answer,/associated entities.*excluded/)
  assert.doesNotMatch(answer.answer,/\blobby\b|\bspeeches\b|\u2014/i)
  assert.ok(answer.sources.every(s=>s.kind==='receipt'))
  assert.doesNotMatch(JSON.stringify(answer),monetaryFigure)
  const map=new URL(answer.sources[0].url)
  assert.ok(map.searchParams.get('industry'))
  const names=answer.sources.slice(1).map(s=>s.title)
  assert.deepEqual(names,[...names].sort((a,b)=>a.localeCompare(b,'en-AU')))
 }
})
test('banks never offer loan-dominated named-source figures, even as closest available records',async()=>{
 const out=await localAsk(api,'How much have the banks donated to the Liberals?')
 assert.match(out.answer.split(/[.!?]/)[0],/bank figures currently combine donations with loans and other receipts/)
 assert.match(out.answer,/cannot yet establish a banks-only donation total/)
 assert.match(out.answer,/finance grouping includes organisations beyond banks/)
 assert.match(out.answer,/Westpac Banking Corporation/)
 assert.match(out.answer,/National Australia Bank/)
 assert.doesNotMatch(JSON.stringify(out),monetaryFigure)
 assert.doesNotMatch(JSON.stringify(out),/40,?608,?922|20,?896,?422|closest available records/i)
 assert.ok(out.sources.length>=3)
 assert.ok(out.sources.every(s=>new URL(s.url,'http://local.test').searchParams.get('party')==='party:Liberal'))
 assert.ok(out.sources.every(s=>new URL(s.url).searchParams.get('industry')==='finance'))
 assert.doesNotMatch(out.answer,/most money|682|617|speeches/)
})
test('a topic question stays with speech evidence and does not load the money graph',async()=>{
 const question='Who talks about gambling the most?'
 assert.equal(api.industryMoneyIntent(question),null)
 assert.equal(await api.federalPartyMoneyAnswer({question},assets),null)
 let research=0
 const out=await localAsk(api,question,{onResearch:()=>research++})
 assert.equal(research,1)
 assert.match(out.answer,/Labor MPs gave the most speeches labelled gambling, with 682/)
 assert.ok(out.sources.every(s=>s.kind==='count'))
 assert.doesNotMatch(out.answer,/\$|takes.*money/)
})
test('totals, year scope, unknown industries and personal recipients never become topic counts',async()=>{
 for(const question of ['gambling donations','Who gets the most donations from gambling?','Who receives money from the alcohol industry?']){
  const out=await localAsk(api,question,{onResearch:()=>assert.fail(question)})
  assert.equal(out.answer_status,'evidence_gap',question)
  assert.doesNotMatch(out.answer,monetaryFigure)
 }
 const total=await localAsk(api,'How much has Labor received from mining in 2020?',{filters:{from:'2024',to:'2024',party:'Liberal'}})
 assert.match(total.answer,/cannot yet say how much Labor received in mining donations/)
 assert.doesNotMatch(JSON.stringify(total),monetaryFigure)
 assert.match(total.answer,/financial years 2020–21/)
 assert.ok(total.sources.every(s=>new URL(s.url).searchParams.get('party')==='party:Labor'&&new URL(s.url).searchParams.get('from')==='2020'&&new URL(s.url).searchParams.get('to')==='2020'))
 for(const question of ['Who takes the most money from the unicorn lobby?','How much has Anthony Albanese received from mining?','Who gets the most money from data mining companies?']){
  const out=await localAsk(api,question,{onResearch:()=>assert.fail(question)})
  assert.match(out.answer_status,/needs_scope|evidence_gap/)
  assert.doesNotMatch(out.answer,/\$|682|617/)
 }
 const filtered=await localAsk(api,questions[0].question,{filters:{topic:'gambling',kind:'speech'}})
 assert.equal(filtered.answer_status,'needs_scope')
 assert.doesNotMatch(filtered.answer,/\$|682/)
})
test('untyped bank aggregates remain unusable even with an AEC donor return reference',async()=>{
 const graph={meta:{source:'AEC donations',generated:'2026-10-18'},nodes:[
  {id:'party:Liberal',label:'Liberal',kind:'party'},
  {id:'donor:westpac',label:'Westpac Banking Corporation',aliases:['Westpac'],kind:'donor',industry:'finance',returnReferences:[{return_type:'AEC donor return',year:'2024-25'}]},
 ],edges:[{source:'donor:westpac',target:'party:Liberal',total:40000001,count:2,firstYear:2024,lastYear:2024,byYear:{2024:[40000001,2]}}]}
 const fake={fetch:async()=>Response.json(graph)}
 for(const question of ['How much have the banks donated to the Liberals?','How much has Westpac donated to the Liberals?']){
  const out=await api.industryMoneyAnswer({question},fake)
  assert.equal(out.answer_status,'evidence_gap')
  assert.match(out.answer,/Westpac Banking Corporation/)
  assert.doesNotMatch(JSON.stringify(out),/40000001|40,000,001/)
  assert.doesNotMatch(JSON.stringify(out),monetaryFigure)
 }
})
test('union affiliation fees are not described or totalled as donations',async()=>{
 const out=await localAsk(api,'Who receives the most union money?')
 assert.match(out.answer,/cannot separate union affiliation fees from donations/)
 assert.doesNotMatch(JSON.stringify(out),monetaryFigure)
})
test('evals reject round-one mixed-receipt figures and a measure caveat moved after the opening',async()=>{
 for(const q of questions.filter(q=>q.kind==='money')){
  const out=await localAsk(api,q.question)
  assert.equal(gradeRow(q,out).overall,'pass',q.id)
  const mixed='Westpac Banking Corporation to Liberal: $40,608,922 in disclosed receipts. National Australia Bank: $20,896,422.'
  const old={...out,answer:out.answer+'\n\n'+mixed,sources:out.sources.map((s,i)=>i?s:{...s,snippet:s.snippet+' '+mixed})}
  const oldGrade=gradeRow(q,old)
  assert.deepEqual(oldGrade.figures.unbound,[],q.id+': mixed figures are in receipt evidence')
  assert.equal(oldGrade.axes.constraints,'fail',q.id+': receipt evidence still cannot support donation amounts')
  assert.equal(oldGrade.overall,'fail',q.id+': mixed amounts')
  const late={...out,answer:'The relevant records are listed below. '+out.answer}
  const lateGrade=gradeRow(q,late)
  assert.equal(lateGrade.axes.constraints,'fail',q.id+': late measure')
  assert.equal(lateGrade.overall,'fail',q.id+': late measure')
 }
})
test('the general final composer rejects a money assertion even when the research model selected only speech evidence',async()=>{
 const question='Rank gambling activity and explain what it measures.'
 const out=await localAsk(api,question)
 assert.equal(out.answer_status,'evidence_gap')
 assert.deepEqual(out.citations,{})
 assert.doesNotMatch(out.answer,/Labor|682|617/)
 assert.equal(api.verifyComposition('Labor takes the most money from gambling.',[]).prose,'')
})
test('local gate and research eval harness grade the six real routing responses without outbound Asks',async()=>{
 const out=await mkdtemp(join(tmpdir(),'ask-industry-gate-'))
 try{
  const gate=await runGate({base:'http://127.0.0.1:8963',questions,out,roster:[],fetchImpl:localFetch(api)})
  assert.equal(gate.rows.length,6)
  assert.equal(gate.summary.overall.errors,0)
  const research=await runEval({questions,modes:['loop'],limit:6,bases:{loop:'http://127.0.0.1:8963'},route:'ask',fetchImpl:localFetch(api)})
  assert.equal(research.rows.length,6)
  assert.ok(research.rows.every(r=>!r.error))
  for(const row of gate.rows)assert.equal(row.grade.overall,'pass',row.id+': '+JSON.stringify(row.grade))
 }finally{await rm(out,{recursive:true,force:true})}
})
test('the actual Worker routes money before provider access for JSON and streaming requests',async()=>{
 const restore=offline(),before=outbound.length
 try{
  const worker=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,new URL('../public/',import.meta.url).pathname)
  for(const q of questions.filter(q=>q.kind==='money'))for(const stream of [false,true]){
   const response=await worker.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:q.question,model:'local-replay'})})
   assert.equal(response.status,200)
   const text=await response.text()
   assert.match(text,/(?:industry|bank) figures currently combine donations with loans and other receipts/)
   assert.doesNotMatch(text,/10,763,834/)
   assert.doesNotMatch(text,monetaryFigure)
   assert.doesNotMatch(text,/682 chamber speeches/)
   if(stream)assert.match(text,/event: done/)
  }
  assert.equal(outbound.length,before)
 }finally{restore()}
})
