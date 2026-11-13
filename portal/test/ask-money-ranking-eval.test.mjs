import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {localApi} from './ask-lobby-money-harness.mjs'
import {moneyRankingCases} from './fixtures/money-ranking-cases.mjs'
import {graphRanking,scoreMoneyRanking} from './money-ranking-eval.mjs'
import {typedMoney,untypedMoney,moneyAssets} from './money-graph-data.mjs'
// The full published export is typed; the untyped run strips its receipt-type fields (the pre-#310 file).
const api=await localApi(),graph=typedMoney(),assets=moneyAssets('typed')
const untypedGraph=untypedMoney(),untypedAssets=moneyAssets('untyped')
for(const [label,g,store] of [['typed',graph,assets],['untyped',untypedGraph,untypedAssets]])for(const c of moneyRankingCases)test(`money accuracy and directness (${label}): ${c.id}`,async()=>{
 const result=await api.federalPartyMoneyAnswer({question:c.question},store)
 const expected=graphRanking(g,c)
 assert.equal(expected.typed,label==='typed')
 const score=scoreMoneyRanking(result,expected,c,g)
 assert.deepEqual(score.errors,[],c.question+'\n'+result?.answer)
 assert.equal(score.accuracy,true);assert.equal(score.directness,3)
})
// Public exporter subset from receipt-types a51f2d872; amounts and typed cells are unchanged.
const typedGraph=JSON.parse(await readFile(new URL('./fixtures/money-ranking-exporter.json',import.meta.url)))
const typedAssets={fetch:async()=>Response.json(typedGraph)}
// The exporter subset holds the original industries; a published-only case needs the full graph.
const typedCases=moneyRankingCases.filter(c=>c.industry&&!c.publishedOnly)
for(const c of typedCases)test('exporter money accuracy and directness: '+c.id,async()=>{
 const result=await api.federalPartyMoneyAnswer({question:c.question},typedAssets)
 const score=scoreMoneyRanking(result,graphRanking(typedGraph,c),c,typedGraph)
 assert.deepEqual(score.errors,[],c.question+'\n'+result?.answer)
 assert.equal(score.accuracy,true);assert.equal(score.directness,3)
})
test('real exporter gambling ranking matches independent reconciliation and ignores poisoned legacy fields',async()=>{
 const poisoned=structuredClone(typedGraph)
 poisoned.edges.forEach(e=>Object.assign(e,{total:999999999,count:999999,firstYear:1900,lastYear:2099,byYear:{2020:[999999999,999999]}}))
 for(const g of [typedGraph,poisoned]){
  const out=await api.industryMoneyAnswer({question:'Who takes the most money from the gambling lobby?'},{fetch:async()=>Response.json(g)})
  assert.equal(out.answer_status,'calculated');assert.equal(out.measure,'donations')
  assert.match(out.answer,/^\*\*Liberal\*\*.*\$1,093,352.*donations received/)
  for(const [name,amount]of [['Liberal','1,093,352'],['Labor','1,067,066'],['Nationals','258,500'],['LNP','50,000']])assert.ok(out.answer.includes(`| ${name} | $${amount} |`))
  assert.match(out.answer,/\| Total, 4 parties \| \$2,468,918 \| 100% \| \$8,668,512 \(includes loans\) \|/)
  assert.equal(out.money_facts.measure,'donations');assert.equal(out.money_facts.measure_label,out.measure_label)
 }
})
test('typed remaining sources sum Other Receipt before qualifying their all-types cell',async()=>{
 const c=typedCases.find(c=>c.id==='banks-labor-1'),out=await api.federalPartyMoneyAnswer({question:c.question},typedAssets)
 const expected=graphRanking(typedGraph,c)
 // The remainder covers ranked sources only: a source with $0 in the measure is not ranked.
 const ranked=expected.allRows.filter(r=>r.cents>0),sum=(list,key)=>list.reduce((s,r)=>s+r[key],0)
 const all=sum(ranked,'allCents')-sum(expected.rows,'allCents'),other=sum(ranked,'otherCents')-sum(expected.rows,'otherCents')
 assert.ok(other>=all/2&&other>0,'real finance remainder exercises the qualifier')
 const row=out.answer.split('\n').find(l=>l.startsWith('| Other sources'))
 assert.ok(row.endsWith(`$${(all/100).toLocaleString('en-AU')} (includes loans) |`),row)
})
test('typed comparison headings name donations in party and financial-year renderers',async()=>{
 for(const question of ['Who gets more gambling money, Labor or Liberal?','How did gambling money to Labor change from 2020 to 2021?']){
  const out=await api.rankedMoneyAnswer({question},typedAssets)
  assert.equal(out.answer_status,'calculated',out?.answer);assert.equal(out.measure,'donations')
  assert.match(out.answer,/\| (?:Recipient party|Financial year) \| Donations \| Records \|/)
 }
})
test('comparison headings label untyped and typed all-types measures',async()=>{
 const allTypes=structuredClone(typedGraph)
 for(const edge of allTypes.edges){
  if(!edge.by_type)continue
  edge.by_type={unknown:Object.values(edge.by_type).reduce((sum,v)=>sum+v,0)}
  for(const [period,types]of Object.entries(edge.by_type_year))edge.by_type_year[period]={unknown:Object.values(types).reduce(([amount,count],[a,c])=>[amount+a,count+c],[0,0])}
 }
 for(const dataset of [untypedAssets,{fetch:async()=>Response.json(allTypes)}])for(const question of ['Who gets more gambling money, Labor or Liberal?','How did gambling money to Labor change from 2020 to 2021?']){
  const out=await api.rankedMoneyAnswer({question},dataset)
  assert.equal(out.answer_status,'calculated');assert.equal(out.measure,'receipts_all')
  assert.match(out.answer,/\| (?:Recipient party|Financial year) \| All receipt types \| Records \|/)
 }
})
test('typed oracle catches incorrect labels, periods, secondary amounts and loan qualifiers',async()=>{
 const c=typedCases[0],expected=graphRanking(typedGraph,c),out=await api.federalPartyMoneyAnswer({question:c.question},typedAssets)
 for(const defect of [
  {...out,measure:'receipts_all'},
  {...out,measure_label:'disclosed receipts, all types'},
  {...out,answer:out.answer.replaceAll('1998–99 to 2024–25','2000–01 to 2024–25')},
  {...out,answer:out.answer.replaceAll('$3,538,879','$3,538,880')},
  {...out,answer:out.answer.replace(/(\| Liberal[^\n]+) \(includes loans\)/,'$1')},
 ])assert.equal(scoreMoneyRanking(defect,expected,c,typedGraph).accuracy,false)
})
test('an empty requested period shows explicitly held-period figures and retains unmatched requested coverage',async()=>{
 // Typed: the held-period lead is Liberal's gambling donations; untyped fallback: Labor's disclosed receipts of all types.
 for(const [store,lead] of [[assets,/^Held-period figures: \*\*Liberal\*\* leads parties receiving money from gambling-linked sources: \*\*\$1,093,352\*\* in donations received/],[untypedAssets,/^Held-period figures: \*\*Labor\*\*.*\$9,324,627/]]){
  const out=await api.federalPartyMoneyAnswer({question:'Who takes the most money from gambling in 1900?'},store)
  assert.equal(out.answer_status,'calculated');assert.match(out.answer,lead)
  assert.equal(out.coverage.matched,false)
  assert.equal(out.coverage.requested_since,'1900-01-01');assert.match(out.answer,/from=1998&to=2024/)
 }
})
test('accuracy and directness scores detect independent numeric and presentation defects',async()=>{
 const c=moneyRankingCases[0],expected=graphRanking(graph,c),out=await api.federalPartyMoneyAnswer({question:c.question},assets)
 assert.ok(out.answer.includes('$1,093,352'))
 const wrong=scoreMoneyRanking({...out,answer:out.answer.replace('$1,093,352','$1,093,353')},expected,c,graph)
 assert.equal(wrong.accuracy,false);assert.equal(wrong.directness,3)
 const late=scoreMoneyRanking({...out,answer:'The record is incomplete. '+out.answer},expected,c,graph)
 assert.equal(late.directness,1)
 const noMap=scoreMoneyRanking({...out,answer:out.answer.replace(/\[See (?:these donations|all receipt types) on the money map\]\([^)]+\)/g,'')},expected,c,graph)
 assert.equal(noMap.directness,1)
})
test('an exact current member resolves to party-level figures and their declared-interests page',async()=>{
 const roster=JSON.parse(await readFile(new URL('../public/parliamentarians.json',import.meta.url)))
 const p=roster.people.find(p=>p.current&&p.states.includes('federal')&&p.party_now==='Labor')
 const out=await api.industryMoneyAnswer({question:`How much has ${p.name} received from gambling?`},assets)
 assert.equal(out.answer_status,'calculated');assert.match(out.answer,/^AEC returns record this money at party level\./)
 assert.ok(out.answer.includes(`${p.name}’s party, Labor`));assert.match(out.answer,/Labor\*\*, received \*\*\$1,067,066\*\* in donations received \(AEC receipt type: Donation Received\)/)
 assert.ok(out.answer.includes('/declared?'+new URLSearchParams({person:p.name})))
})
test('top ten source questions retain the requested row count',async()=>{
 const out=await api.federalPartyMoneyAnswer({question:'Show the top 10 donors to Labor'},assets)
 assert.equal(out.answer_status,'calculated');assert.equal(out.sources.filter(s=>s.receipt).length,10)
})
