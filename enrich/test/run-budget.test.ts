import assert from 'node:assert/strict'
import { test } from 'node:test'
import { admit, admitWaiting, reserveCall, settleCall, resourceBudget, admissionBudget, callUpper, USD_PER_NEURON } from '../src/run-budget.ts'
import { enqueue } from '../src/db.ts'
import { runTick } from '../src/tick.ts'
import { FakeAi, FakeKb, GOOD_SUMMARY, makeD1, makeDeps, rows, speechText } from './helpers.ts'
import { readConfig } from '../src/env.ts'

const work=(rid:string)=>[{rid,task:'speech_summary' as const,priority:100},{rid,task:'speech_topics' as const,priority:100}]
const budget=(neurons:number,initial=40)=>({run_id:'invented-run',max_usd:(neurons+0.1)*USD_PER_NEURON,initial_neurons:initial})
const good=JSON.stringify({summary:GOOD_SUMMARY,topics:['housing']})

test('admission atomically reserves the run ceiling; unadmitted units are not queued',async()=>{
  const {d1,raw}=makeD1();const b=budget(100)
  const added=await Promise.all(['a','b','c','d'].map(r=>admit(d1,work(r),b,1)))
  assert.equal(added.reduce((n,v)=>n+v,0),4)
  assert.equal(rows(raw,'SELECT COUNT(*) n FROM queue')[0].n,4)
  assert.equal(rows(raw,'SELECT reserved_neurons FROM enrichment_runs')[0].reserved_neurons,80)
  assert.equal(rows(raw,'SELECT COUNT(*) n FROM enrichment_units WHERE admitted=0')[0].n,2)
  assert.equal(await admit(d1,work('a'),b,2),0)
  assert.equal(rows(raw,'SELECT reserved_neurons FROM enrichment_runs')[0].reserved_neurons,80)
})

test('every call reserves under run and daily caps; concurrent calls cannot overspend',async()=>{
  const {d1,raw}=makeD1();const b=budget(100)
  await admit(d1,work('a'),b,1);await admit(d1,work('b'),b,1)
  const tokens=await Promise.all(['a','b'].map(r=>reserveCall(d1,r,b,60,'2026-10-13',100)))
  assert.equal(tokens.filter(Boolean).length,1)
  const rid=tokens[0]?'a':'b',other=rid==='a'?'b':'a'
  await settleCall(d1,tokens.find(Boolean)!,'fixture',35,10,10)
  const token=await reserveCall(d1,other,b,60,'2026-10-13',100)
  assert.ok(token)
  assert.equal(rows(raw,'SELECT spent_neurons FROM enrichment_runs')[0].spent_neurons,35)
  assert.equal(rows(raw,'SELECT neurons FROM spend')[0].neurons,35)
  await settleCall(d1,token!,'fixture',50,10,10)
  assert.equal(await reserveCall(d1,rid,b,20,'2026-10-14',100),null)
  assert.equal(await admit(d1,work('new-day'),b,2),0)
  assert.equal(rows(raw,'SELECT spent_neurons FROM enrichment_runs')[0].spent_neurons,85)
})

test('existing daily spend blocks a run call even while its total cap has room',async()=>{
  const {d1,raw}=makeD1();const b=budget(1000)
  await admit(d1,work('a'),b,1)
  raw.exec("INSERT INTO spend(day,model,neurons) VALUES ('2026-10-13','fixture',80)")
  assert.equal(await reserveCall(d1,'a',b,40,'2026-10-13',100),null)
  assert.ok(await reserveCall(d1,'a',b,40,'2026-10-14',100))
})

test('a failed or interrupted model call keeps its full reservation across restarts/days',async()=>{
  const {d1,raw}=makeD1();const b=budget(100,80)
  await admit(d1,work('a'),b,1)
  assert.ok(await reserveCall(d1,'a',b,80,'2026-10-13',1000))
  // No settlement: timeout/crash leaves billing uncertain.
  assert.equal(await reserveCall(d1,'a',b,30,'2026-10-14',1000),null)
  assert.equal(await admit(d1,work('b'),b,2),0)
  assert.equal(rows(raw,'SELECT reserved_neurons FROM enrichment_runs')[0].reserved_neurons,80)
})

test('settlement frees headroom, waiting admission resumes without a catalog rewind',async()=>{
  const {d1,raw}=makeD1();const b=budget(100,80)
  await admit(d1,work('a'),b,1);await admit(d1,work('b'),b,1)
  const token=await reserveCall(d1,'a',b,80,'2026-10-13',1000)
  await settleCall(d1,token!,'fixture',5,10,10)
  assert.equal(await admitWaiting(d1,2),2)
  assert.equal(rows(raw,"SELECT COUNT(*) n FROM queue WHERE rid='b'")[0].n,2)
  await assert.rejects(settleCall(d1,token!,'fixture',5,10,10),/already settled/)
  assert.equal(rows(raw,'SELECT spent_neurons FROM enrichment_runs')[0].spent_neurons,5)
})

test('cap metadata must be valid, cannot be raised on a resumed run',async()=>{
  assert.throws(()=>resourceBudget({extra:{metadata:{enrichment_budget:{run_id:'test',max_usd:41}}}}),/invalid/)
  const {d1}=makeD1();await admit(d1,work('a'),budget(100),1)
  await assert.rejects(admit(d1,work('b'),budget(200),1),/cap changed/)
})

test('automatic discovery obeys the cap and a manually seeded row cannot bypass model admission',async()=>{
  const kb=new FakeKb(),ai=new FakeAi(()=>good)
  const metadata={enrichment_budget:{run_id:'invented-auto',max_usd:0.00001}}
  kb.add('a',{texts:{body:speechText()},extraMetadata:metadata})
  kb.catalogRows=[{kind:'speech',rid:'a',created:'2026-09-28T11:00:00'}]
  const {deps,raw,d1}=makeDeps({kb,ai})
  const found=await runTick(deps)
  assert.equal(rows(raw,'SELECT COUNT(*) n FROM queue')[0].n,0)
  assert.deepEqual(found.discoveryErrors,[])
  await enqueue(d1,work('a'),1) // a legacy/manual seed still cannot spend
  await runTick(deps)
  assert.equal(ai.calls.length,0)
})

test('real processing reserves retries/escalations and books daily spend exactly once',async()=>{
  const kb=new FakeKb(),ai=new FakeAi(({n})=>n===0?'invalid':good)
  const metadata={enrichment_budget:{run_id:'invented-tick',max_usd:40}}
  kb.add('a',{texts:{body:speechText()},extraMetadata:metadata})
  const {deps,raw,d1}=makeDeps({kb,ai})
  const resource=await kb.getResource('a')
  await enqueue(d1,work('a').map(w=>({...w,runBudget:admissionBudget(resource!,'a',deps.cfg)!})),1)
  await runTick(deps)
  assert.equal(ai.calls.length,2)
  assert.equal(rows(raw,'SELECT spent_neurons FROM enrichment_runs')[0].spent_neurons,10)
  assert.equal(rows(raw,'SELECT neurons FROM spend')[0].neurons,10)
  assert.equal(rows(raw,"SELECT COUNT(*) n FROM enrichment_calls WHERE state='settled'")[0].n,2)
})

test('the maximum reservation includes full UTF-8/schema framing and all output tokens',()=>{
  const cfg=readConfig({})
  const body={messages:[{role:'user',content:'Parliamentary words é'.repeat(30)}],max_tokens:4000}
  assert.ok(callUpper(cfg.primaryModel,body)>4000*30475/1_000_000)
  assert.throws(()=>callUpper(cfg.primaryModel,{max_tokens:0}),/bounded output/)
})

test('escalation is reserved at its own higher price and charged once',async()=>{
  const kb=new FakeKb(),ai=new FakeAi(({n})=>n<2?'invalid':good)
  kb.add('a',{texts:{body:speechText()},extraMetadata:{enrichment_budget:{run_id:'invented-escalation',max_usd:40}}})
  const {deps,raw,d1}=makeDeps({kb,ai})
  const resource=await kb.getResource('a')
  await enqueue(d1,work('a').map(w=>({...w,runBudget:admissionBudget(resource!,'a',deps.cfg)!})),1)
  await runTick(deps)
  assert.deepEqual(ai.calls.map(c=>c.model),[deps.cfg.primaryModel,deps.cfg.primaryModel,deps.cfg.escalationModel])
  const calls=rows(raw,'SELECT upper_neurons FROM enrichment_calls ORDER BY rowid')
  assert.ok(calls[2].upper_neurons>calls[1].upper_neurons)
  assert.equal(rows(raw,'SELECT neurons FROM spend').reduce((n,r)=>n+r.neurons,0),15)
})

test('insufficient retry headroom stops before another paid call and before further queue admission',async()=>{
  const kb=new FakeKb(),ai=new FakeAi(()=> 'invalid')
  kb.add('a',{texts:{body:speechText()},extraMetadata:{enrichment_budget:{run_id:'invented-stop',max_usd:40}}})
  const {deps,raw,d1}=makeDeps({kb,ai})
  const resource=await kb.getResource('a')
  const initial=admissionBudget(resource!,'a',deps.cfg)!
  const cap=(initial.initial_neurons+0.1)*USD_PER_NEURON
  kb.resources.get('a')!.extraMetadata={enrichment_budget:{run_id:'invented-stop',max_usd:cap}}
  const capped={...initial,max_usd:cap}
  await enqueue(d1,work('a').map(w=>({...w,runBudget:capped})),1)
  await runTick(deps)
  assert.equal(ai.calls.length,1)
  assert.equal(await admit(d1,work('b'),capped,2),0)
  // A later KB response omitting extra cannot erase durable run ownership.
  kb.resources.get('a')!.extraMetadata=undefined
  await runTick(deps)
  assert.equal(ai.calls.length,1)
  assert.equal(rows(raw,'SELECT spent_neurons FROM enrichment_runs')[0].spent_neurons,5)
})

test('discovery defers OA resources if the basic response omits their extra metadata',async()=>{
  const kb=new FakeKb(),ai=new FakeAi(()=>good)
  kb.add('a',{texts:{body:speechText()},classifications:[{labelset:'kind',label:'speech'},{labelset:'source',label:'openaustralia'}]})
  kb.catalogRows=[{kind:'speech',rid:'a',created:'2026-09-28T11:00:00'}]
  const {deps,raw}=makeDeps({kb,ai})
  const stats=await runTick(deps)
  assert.equal(rows(raw,'SELECT COUNT(*) n FROM queue')[0].n,0)
  assert.equal(ai.calls.length,0)
  assert.ok(stats.discoveryErrors.some(e=>e.includes('metadata unavailable')))
})

test('missing model usage is charged at the maximum, never refunded from a character estimate',async()=>{
  const kb=new FakeKb(),ai=new FakeAi(()=>good)
  kb.add('a',{texts:{body:speechText()},extraMetadata:{enrichment_budget:{run_id:'invented-unknown-usage',max_usd:40}}})
  const {deps,raw,d1}=makeDeps({kb,ai})
  const resource=await kb.getResource('a'),initial=admissionBudget(resource!,'a',deps.cfg)!
  await enqueue(d1,work('a').map(w=>({...w,runBudget:initial})),1)
  deps.ai={run:async()=>({choices:[{message:{content:good},finish_reason:'stop'}]})}
  await runTick(deps)
  assert.equal(rows(raw,'SELECT spent_neurons FROM enrichment_runs')[0].spent_neurons,initial.initial_neurons)
  assert.equal(rows(raw,'SELECT neurons FROM spend')[0].neurons,initial.initial_neurons)
  assert.equal(rows(raw,'SELECT actual_neurons FROM enrichment_calls')[0].actual_neurons,null)
})
