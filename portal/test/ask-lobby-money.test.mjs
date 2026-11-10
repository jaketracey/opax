import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {runGate} from '../../scripts/ask_eval_gate.mjs'
import {runEval} from '../../scripts/research_eval.mjs'
import {loadWorker,offline,outbound} from './worker-harness.mjs'
import {localApi,localAsk,localFetch,assets} from './ask-lobby-money-harness.mjs'
const api=await localApi()
const questions=JSON.parse(await readFile(new URL('./fixtures/ask-routing-evals.json',import.meta.url))).questions.filter(q=>q.id.startsWith('MONEY-INDUSTRY-'))

test('all six industry and speech regression questions are in the routing evals',()=>assert.equal(questions.length,6))
test('industry rankings bypass speech research and retain amounts, years, sources and neutral language',async()=>{
 for(const q of questions.filter(q=>q.kind==='money'&&q.id!=='MONEY-INDUSTRY-banks')){
  const answer=await localAsk(api,q.question,{onResearch:()=>assert.fail('money must bypass speech retrieval')})
  assert.equal(answer.answer_status,'calculated',q.question)
  assert.match(answer.answer,new RegExp(q.local_match),q.question)
  assert.match(answer.answer,/donors OPAX groups under/)
  assert.match(answer.answer,/financial years \d{4}/)
  assert.match(answer.answer,/disclosure thresholds|disclosure threshold/i)
  assert.match(answer.answer,/Other receipts.*not donations/)
  assert.match(answer.answer,/associated entities.*excluded/)
  assert.doesNotMatch(answer.answer,/\blobby\b|\bspeeches\b|\u2014/i)
  assert.ok(answer.sources.every(s=>s.kind==='receipt'))
 }
})
test('banks remain a broader finance-label limitation with individual named-source amounts',async()=>{
 const out=await localAsk(api,'How much have the banks donated to the Liberals?')
 assert.match(out.answer,/cannot establish a banks-only donation total/)
 assert.match(out.answer,/finance grouping includes organisations beyond banks/)
 assert.match(out.answer,/Westpac Banking Corporation to Liberal: \$40,608,922/)
 assert.match(out.answer,/National Australia Bank to Liberal: \$20,896,422/)
 assert.ok(out.sources.length>=3)
 assert.ok(out.sources.every(s=>new URL(s.url,'http://local.test').searchParams.get('party')==='party:Liberal'))
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
  assert.equal(out.answer_status,'calculated',question)
 }
 const total=await localAsk(api,'How much has Labor received from mining in 2020?',{filters:{from:'2024',to:'2024',party:'Liberal'}})
 assert.match(total.answer,/Labor received \$[\d,]+ in disclosed receipts/)
 assert.match(total.answer,/financial years 2020–21/)
 for(const question of ['Who takes the most money from the unicorn lobby?','How much has Anthony Albanese received from mining?','Who gets the most money from data mining companies?']){
  const out=await localAsk(api,question,{onResearch:()=>assert.fail(question)})
  assert.match(out.answer_status,/needs_scope|evidence_gap/)
  assert.doesNotMatch(out.answer,/\$|682|617/)
 }
 const filtered=await localAsk(api,questions[0].question,{filters:{topic:'gambling',kind:'speech'}})
 assert.equal(filtered.answer_status,'needs_scope')
 assert.doesNotMatch(filtered.answer,/\$|682/)
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
  for(const stream of [false,true]){
   const response=await worker.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:questions[0].question,model:'local-replay'})})
   assert.equal(response.status,200)
   const text=await response.text()
   assert.match(text,/10,763,834/)
   assert.doesNotMatch(text,/682 chamber speeches/)
   if(stream)assert.match(text,/event: done/)
  }
  assert.equal(outbound.length,before)
 }finally{restore()}
})
