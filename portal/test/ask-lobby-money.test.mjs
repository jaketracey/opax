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
import './money-graph-data.mjs' // checks public/graph/money.json is the typed export the Worker test reads
const api=await localApi()
const questions=JSON.parse(await readFile(new URL('./fixtures/ask-routing-evals.json',import.meta.url))).questions.filter(q=>q.id.startsWith('MONEY-INDUSTRY-'))

test('all six industry and speech regression questions are in the routing evals',()=>assert.equal(questions.length,6))
const monetaryFigure=/\$\s*\d|\b\d[\d,.]*\s*(?:AUD|dollars?|million|billion)\b/i
// Typed (published): donations lead, with every receipt type beside them.
const typedLead=/^[^.!?]*\$[\d,]+[^.!?]*donations received \(AEC receipt type: Donation Received\)/
test('industry questions lead with labelled ranked amounts and bypass speech research',async()=>{
 const leads={gambling:'**Liberal** leads parties receiving money from gambling-linked sources: **$1,093,352**',mining:'**United Australia Party** leads parties receiving money from mining-linked sources: **$61,625,526**',banks:'**Liberal** has received **$14,414,067** from finance-linked sources',unions:'**Labor** leads parties receiving money from union-linked sources: **$68,031,075**',tobacco:'**Liberal** leads parties receiving money from tobacco-linked sources: **$1,243,865**'}
 for(const q of questions.filter(q=>q.kind==='money')){
  const out=await localAsk(api,q.question,{onResearch:()=>assert.fail('Money uses the calculator')})
  assert.equal(out.answer_status,'calculated');assert.equal(out.measure,'donations');assert.match(out.answer,typedLead)
  assert.ok(out.answer.startsWith(leads[q.id.replace('MONEY-INDUSTRY-','')]),q.id)
  assert.match(out.answer,/\| (?:Source|Recipient) \| Donations \| Share \| All receipt types \|/)
  assert.match(out.answer,/These figures are party-level totals/)
  assert.match(out.answer,/See all receipt types on the money map/)
  assert.ok(out.sources.every(s=>s.kind==='receipt'))
  assert.equal(gradeRow(q,out).overall,'pass')
 }
})
test('banks use the explicit finance grouping with loans beside the figures',async()=>{
 // Typed (published): donations lead and the all-types column flags loans; untyped fallback: the mixed total is labelled with loans.
 for(const [money,label] of [['typed',/^\*\*Liberal\*\* has received \*\*\$14,414,067\*\* from finance-linked sources in donations received \(AEC receipt type: Donation Received\)/],['untyped',/disclosed receipts, all types, including bank loans to the party/]]){
  const out=await localAsk(api,'How much have the banks donated to the Liberals?',{money})
  assert.equal(out.answer_status,'calculated',money);assert.match(out.answer,label,money)
  assert.match(out.answer,/finance-linked \(banks, insurers and investment firms\)/)
  assert.match(out.answer,/Westpac Banking Corporation/);assert.match(out.answer,/National Australia Bank/)
  assert.ok(out.sources.every(s=>new URL(s.url,'https://local.test').searchParams.get('party')==='party:Liberal'))
  assert.ok(out.sources.every(s=>new URL(s.url,'https://local.test').searchParams.get('industry')==='finance'))
  // The total covers the 39 sources with donations; sources with $0 in donations are not ranked.
  if(money==='typed')assert.match(out.answer,/\| Total, 39 sources \| \$14,414,067 \| 100% \| \$60,897,334 \(includes loans\) \|/)
 }
})
test('a topic question stays with speech evidence',async()=>{
 const q='Who talks about gambling the most?';let research=0
 assert.equal(api.industryMoneyIntent(q),null);assert.equal(await api.federalPartyMoneyAnswer({question:q},assets),null)
 const out=await localAsk(api,q,{onResearch:()=>research++})
 assert.equal(research,1);assert.match(out.answer,/682/);assert.ok(out.sources.every(s=>s.kind==='count'))
})
test('known industries and totals keep exact party and year controls; unknown scope gets a choice',async()=>{
 for(const question of ['gambling donations','Who gets the most donations from gambling?','Who receives money from the alcohol industry?'])assert.equal((await localAsk(api,question,{onResearch:()=>assert.fail(question)})).answer_status,'calculated')
 const out=await localAsk(api,'How much has Labor received from mining in 2020?',{filters:{from:'2024',to:'2024',party:'Liberal'}})
 assert.equal(out.answer_status,'calculated');assert.match(out.answer,/2020–21/)
 assert.ok(out.sources.every(s=>{const p=new URL(s.url,'https://local.test').searchParams;return p.get('party')==='party:Labor'&&p.get('from')==='2020'&&p.get('to')==='2020'}))
 for(const question of ['Who takes the most money from the unicorn lobby?','How much has Unknown Example received from mining?','Who gets the most money from data mining companies?']){
  const r=await localAsk(api,question,{onResearch:()=>assert.fail(question)});assert.match(r.answer_status,/needs_scope|evidence_gap/);assert.doesNotMatch(r.answer,/\$|682|617/)
 }
 const filtered=await localAsk(api,questions[0].question,{filters:{topic:'gambling',kind:'speech'}});assert.equal(filtered.answer_status,'needs_scope')
})
test('a donor return reference keeps an untyped bank figure labelled as all receipt types',async()=>{
 const graph={meta:{generated:'2026-11-12'},nodes:[{id:'party:Liberal',label:'Liberal',kind:'party'},{id:'source:bank',label:'Example Bank Ltd',kind:'donor',industry:'finance',returnReferences:[{return_type:'AEC donor return',year:'2024-25'}]}],edges:[{source:'source:bank',target:'party:Liberal',total:40000001,count:2,firstYear:2024,lastYear:2024,byYear:{2024:[40000001,2]}}]}
 const out=await api.industryMoneyAnswer({question:'How much has Example Bank Ltd donated to Liberal?'},{fetch:async()=>Response.json(graph)})
 assert.equal(out.answer_status,'calculated');assert.match(out.answer,/\$40,000,001.*disclosed receipts, all types, including bank loans to the party/)
 assert.equal(out.measure,'receipts_all')
})
test('union receipts name affiliation fees in the lead measure',async()=>{
 // Typed (published): union donations lead; affiliation fees sit in the all-types column.
 const out=await localAsk(api,'Who receives the most union money?')
 assert.equal(out.answer_status,'calculated');assert.match(out.answer,/^\*\*Labor\*\* leads parties receiving money from union-linked sources: \*\*\$68,031,075\*\* in donations received/)
 assert.match(out.answer,/\| Labor \| \$68,031,075 \| 96% \| \$183,608,658 \(includes loans\) \|/)
 // Untyped fallback: the mixed total names affiliation fees in the lead measure.
 const legacy=await localAsk(api,'Who receives the most union money?',{money:'untyped'})
 assert.equal(legacy.answer_status,'calculated');assert.match(legacy.answer,/disclosed receipts, all types \(donations, affiliation fees and other receipts\)/)
})
test('routing evals reject an unlabelled first sentence',async()=>{
 for(const q of questions.filter(q=>q.kind==='money')){
  const out=await localAsk(api,q.question)
  assert.equal(gradeRow(q,out).overall,'pass')
  const late={...out,answer:'The relevant records are listed below. '+out.answer}
  assert.equal(gradeRow(q,late).overall,'fail')
 }
})
test('the general final composer keeps the research answer as written; planner prose loses only uncited figures',async()=>{
 const question='Rank gambling activity and explain what it measures.'
 const out=await localAsk(api,question)
 assert.match(out.answer,/^Labor takes the most money from the gambling lobby, with 682 chamber speeches/)
 assert.equal(Object.keys(out.citations).length,3)
 assert.equal(api.verifyComposition('Labor takes the most money from gambling.',[]).prose,'Labor takes the most money from gambling.')
 assert.equal(api.verifyComposition('Labor gave 682 speeches about gambling.',[]).prose,'')
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
   assert.match(text,/donations received \(AEC receipt type: Donation Received\)/)
   assert.match(text,/\$[\d,]+/)
   assert.match(text,/See all receipt types on the money map/)
   assert.doesNotMatch(text,/682 chamber speeches/)
   if(stream)assert.match(text,/event: done/)
  }
  assert.equal(outbound.length,before)
 }finally{restore()}
})
