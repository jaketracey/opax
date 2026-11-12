import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {localApi,assets} from './ask-lobby-money-harness.mjs'
import {moneyRankingCases} from './fixtures/money-ranking-cases.mjs'
import {graphRanking,scoreMoneyRanking} from './money-ranking-eval.mjs'
const api=await localApi(),graph=JSON.parse(await readFile(new URL('../public/graph/money.json',import.meta.url)))
for(const c of moneyRankingCases)test('money accuracy and directness: '+c.id,async()=>{
 const result=await api.federalPartyMoneyAnswer({question:c.question},assets)
 const score=scoreMoneyRanking(result,graphRanking(graph,c),c,graph)
 assert.deepEqual(score.errors,[],c.question+'\n'+result?.answer)
 assert.equal(score.accuracy,true);assert.equal(score.directness,3)
})
test('typed year cells choose recipient-side donations and all-types columns instead of legacy totals',async()=>{
 const typed={meta:{generated:'2026-11-12',receipt_type_coverage:{first_year:2020,last_year:2021}},nodes:[
  {id:'source:a',label:'Example One Ltd',kind:'donor',industry:'gambling'},
  {id:'source:b',label:'Example Two Ltd',kind:'donor',industry:'gambling'},
  {id:'party:a',label:'Example Party One',kind:'party'},
  {id:'party:b',label:'Example Party Two',kind:'party'},
 ],edges:[
  {source:'source:a',target:'party:a',total:999999,count:99,byYear:{1998:[999999,99]},by_type:{donation:{2020:[100.25,1],2021:[200,1]},other_receipt:{2020:[900,1]},public_funding:{2020:[50000,1]}}},
  {source:'source:b',target:'party:b',total:888888,count:88,by_type:{donation:{byYear:{2020:[500,2]}},subscription:{2021:[20,1]}}},
 ]}
 const out=await api.industryMoneyAnswer({question:'Who takes the most money from gambling?'},{fetch:async()=>Response.json(typed)})
 assert.equal(out.answer_status,'calculated');assert.equal(out.measure,'donations')
 assert.match(out.answer,/Example Party Two.*\$500.*donations received.*2020–21 to 2021–22/)
 assert.match(out.answer,/\| Example Party One \| \$300.25 \| 38% \| \$1,200.25 \(includes loans\) \|/)
 assert.match(out.answer,/\| Total, 2 parties \| \$800.25 \| 100% \| \$1,720.25 \(includes loans\) \|/)
 assert.doesNotMatch(out.answer,/999,999|888,888|50,000|1998/)
 assert.equal(out.money_facts.measure,'donations');assert.equal(out.money_facts.measure_label,out.measure_label)
 assert.match(out.answer,/all receipt types on the money map/)
})
test('an empty requested period shows explicitly held-period figures and retains unmatched requested coverage',async()=>{
 const out=await api.federalPartyMoneyAnswer({question:'Who takes the most money from gambling in 1900?'},assets)
 assert.equal(out.answer_status,'calculated');assert.match(out.answer,/^Held-period figures:/)
 assert.match(out.answer,/\$9,324,627/);assert.equal(out.coverage.matched,false)
 assert.equal(out.coverage.requested_since,'1900-01-01');assert.match(out.answer,/from=1998&to=2024/)
})
test('accuracy and directness scores detect independent numeric and presentation defects',async()=>{
 const c=moneyRankingCases[0],expected=graphRanking(graph,c),out=await api.federalPartyMoneyAnswer({question:c.question},assets)
 const wrong=scoreMoneyRanking({...out,answer:out.answer.replace('$9,324,627','$9,324,628')},expected,c,graph)
 assert.equal(wrong.accuracy,false);assert.equal(wrong.directness,3)
 const late=scoreMoneyRanking({...out,answer:'The record is incomplete. '+out.answer},expected,c,graph)
 assert.equal(late.directness,1)
 const noMap=scoreMoneyRanking({...out,answer:out.answer.replace(/\[See these on the money map\]\([^)]+\)/,'')},expected,c,graph)
 assert.equal(noMap.directness,1)
})
test('an exact current member resolves to party-level figures and their declared-interests page',async()=>{
 const roster=JSON.parse(await readFile(new URL('../public/parliamentarians.json',import.meta.url)))
 const p=roster.people.find(p=>p.current&&p.states.includes('federal')&&p.party_now==='Labor')
 const out=await api.industryMoneyAnswer({question:`How much has ${p.name} received from gambling?`},assets)
 assert.equal(out.answer_status,'calculated');assert.match(out.answer,/^AEC returns record this money at party level\./)
 assert.ok(out.answer.includes(`${p.name}’s party, Labor`));assert.match(out.answer,/\$9,324,627/)
 assert.ok(out.answer.includes('/declared?'+new URLSearchParams({person:p.name})))
})
test('top ten source questions retain the requested row count',async()=>{
 const out=await api.federalPartyMoneyAnswer({question:'Show the top 10 donors to Labor'},assets)
 assert.equal(out.answer_status,'calculated');assert.equal(out.sources.filter(s=>s.receipt).length,10)
})
