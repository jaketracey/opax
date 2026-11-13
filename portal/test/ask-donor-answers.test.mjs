import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {donorGraph,donorAssets,donorQuestions} from './fixtures/ask-donor-answers.mjs'
import {receiptSplit} from '../public/donor-disclosure.js'
const built=await build({stdin:{contents:"export {federalPartyMoneyAnswer,publicPartyMoneyAnswer} from './src/ask-money-routing'; export {rankedMoneyAnswer} from './src/ask-money'; export {runAgentic} from './src/agentic-ask'; export {receiptAnswer,voiceReceiptData,DONOR_DECLARED_LABEL} from './src/voice-money'",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'node',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const ask=(question,filters={})=>api.federalPartyMoneyAnswer({question,...filters},donorAssets)

test('donor total and three-party split precede recipient choices, using the donor page receipt cells',async()=>{
 const out=await ask(donorQuestions[0])
 const expected=donorGraph.edges.filter(e=>e.source==='donor:Example Marigold Holdings'&&!e.flow).reduce((sum,e)=>sum+receiptSplit(e).donations[0],0)
 assert.equal(expected,2500)
 assert.equal(receiptSplit(donorGraph.nodes.find(n=>n.id==='donor:Example Marigold Holdings')).donations[0],expected)
 assert.equal(out.answer_status,'calculated');assert.equal(out.measure,'donations')
 assert.match(out.answer,/^\*\*Example Marigold Holdings\*\* has \*\*\$2,500\*\* recorded in donations received/)
 for(const [party,amount] of [['Harbor','1,200'],['Meadow','800'],['Orchard','500']])assert.ok(out.answer.includes(`| Example ${party} Party | $${amount} | 1 |`))
 assert.match(out.answer,/\$50 in subscriptions/);assert.match(out.answer,/\$100 in other receipts/)
 assert.match(out.answer,/\$900 in public funding.*not a donation/)
 assert.doesNotMatch(out.answer,/999,999|1,000,000|no type breakdown|choose a recipient/i)
 assert.equal(out.money_followups.length,3)
 assert.ok(out.answer.indexOf('Other readings:')>out.answer.indexOf('| Total recorded | $2,500'))
 for(const option of out.money_followups){
  const follow=await ask(option.question)
  assert.equal(follow.answer_status,'calculated');assert.equal(follow.measure,'donations');assert.match(follow.answer,/has \*\*\$(?:1,200|800|500)\*\*/)
 }
 assert.ok(out.sources.length);assert.ok(Object.keys(out.citations).length)
})

test('a donor with only its own declarations answers with the declared amount and a party split',async()=>{
 const out=await ask(donorQuestions[1])
 assert.equal(out.answer_status,'calculated');assert.equal(out.measure,'donor_declared')
 assert.equal(out.donor_declared_only,true);assert.equal(out.donor_declared_aud,64250)
 assert.equal(out.measure_label,api.DONOR_DECLARED_LABEL)
 assert.match(out.answer,/Example Quill Foundation declared \$64,250 to Example Harbor Party on its own donor returns/)
 assert.match(out.answer,/\| Example Harbor Party \| \$64,250 \| 3 \|/)
 assert.match(out.answer,/returns show no matching receipt/)
 assert.doesNotMatch(out.answer,/no type breakdown|\$0|choose a recipient/i)
})

test('a declaration-only donor keeps its total and split across multiple parties',async()=>{
 const graph=structuredClone(donorGraph)
 graph.edges.push({...structuredClone(graph.edges.find(e=>e.source==='donor:Example Quill Foundation')),target:'party:Example Meadow Party',total:750,count:1,byYear:{2019:[750,1]},firstYear:2019,lastYear:2019})
 const out=await api.federalPartyMoneyAnswer({question:donorQuestions[1]},{fetch:async()=>Response.json(graph)})
 assert.equal(out.answer_status,'calculated');assert.equal(out.donor_declared_aud,65000)
 assert.match(out.answer,/\| Example Harbor Party \| \$64,250 \| 3 \|/)
 assert.match(out.answer,/\| Example Meadow Party \| \$750 \| 1 \|/)
 assert.match(out.answer,/\| Total declared \| \$65,000 \| 4 \|/)
 assert.match(out.measure_label,/declared by the donor; the parties' returns show no matching receipt/)
})

test('loans, Other Receipt, public funding and public-money edges never enter the donation total',async()=>{
 const out=await ask(donorQuestions[2])
 assert.equal(out.answer_status,'calculated');assert.equal(out.measure,'donations')
 assert.match(out.answer,/^\*\*Example Bracken Banking\*\* has \*\*\$500\*\*/)
 assert.match(out.answer,/\| Example Harbor Party \| \$300 \| 1 \|/)
 assert.match(out.answer,/\| Example Meadow Party \| \$200 \| 1 \|/)
 assert.match(out.answer,/\| Total recorded \| \$500 \| 2 \|/)
 assert.match(out.answer,/\$13,000 in other receipts/)
 assert.doesNotMatch(out.answer,/\$13,500|\$14,500|\$700,000|includes loans|choose a recipient/i)
})

test('ranked renderer uses the same declaration words and label as voice (A40)',async()=>{
 const question='Who receives the most disclosed receipts from Example Quill Foundation?'
 const voice=api.voiceReceiptData(donorGraph,api.receiptAnswer(donorGraph,question,'federal','https://opax.test'))
 const out=await api.rankedMoneyAnswer({question},donorAssets)
 assert.equal(out.answer_status,'calculated');assert.equal(out.measure_label,voice.measure_label)
 assert.ok(out.answer.startsWith(voice.answer));assert.equal(out.donor_declared_aud,voice.donor_declared_aud)
 assert.doesNotMatch(out.answer,/no type breakdown|Disclosed receipts|donations received/)
})

test('a unique shortened donor name answers its total and names the reading',async()=>{
 const out=await ask('How much has Example Marigold donated to political parties?')
 assert.match(out.answer,/^\*\*Example Marigold Holdings\*\* has \*\*\$2,500\*\*/)
 assert.match(out.money_reading,/Reading “Example Marigold” as Example Marigold Holdings/)
 assert.equal(out.answer_status,'calculated')
})

test('donor totals and recipient follow-ups retain financial-year scope over stale filters',async()=>{
 const question='How much has Example Marigold Holdings donated to political parties in 2023–24?'
 const out=await ask(question,{from:'1990',to:'1990'})
 assert.match(out.answer,/\*\*\$2,500\*\*/)
 for(const option of out.money_followups.filter(f=>f.label.startsWith('Example '))){
  const follow=await ask(option.question)
  assert.equal(follow.answer_status,'calculated')
  const params=new URL(follow.sources[0].url).searchParams
  assert.equal(params.get('from'),'2023');assert.equal(params.get('to'),'2023')
 }
 const filtered=await ask(donorQuestions[0],{from:'2023',to:'2023'})
 assert.ok(filtered.money_followups.every(f=>f.question.includes('2023–24')))
})

test('a donor with only loans and other receipts still answers without counting them as donations',async()=>{
 const graph=structuredClone(donorGraph)
 for(const edge of graph.edges.filter(e=>e.source==='donor:Example Bracken Banking'&&e.by_type)){
  delete edge.by_type.donation_received
  delete edge.by_type_year['2023-24'].donation_received
 }
 const out=await api.federalPartyMoneyAnswer({question:donorQuestions[2]},{fetch:async()=>Response.json(graph)})
 assert.equal(out.answer_status,'calculated');assert.equal(out.measure,'donations')
 assert.match(out.answer,/has \*\*\$0\*\* recorded in donations/)
 assert.match(out.answer,/\$13,000 in other receipts/)
 assert.doesNotMatch(out.answer,/no donations.*In other receipts|choose a recipient|needs_scope/i)
})

test('never nothing: donor totals never return only a clarification on either Ask router',async()=>{
 for(const question of [...donorQuestions,'How much has Example Marigold Holdings donated?','How much has EMH donated to political parties?','How much has Example Bracken Banking given to parties?','How much has Example Bracken Union donated to political parties?']){
  const direct=api.publicPartyMoneyAnswer(await ask(question))
  assert.equal(direct.answer_status,'calculated',question);assert.match(direct.answer,/\$[\d,]+/);assert.ok(direct.sources.length)
  const fail=async()=>assert.fail('Donor totals must answer without a model or research call')
  const run=await api.runAgentic(question,{asset:async path=>(await donorAssets.fetch(new Request('https://fixture.test'+path))).json(),kb:fail,generate:fail,research:fail},undefined,10000)
  assert.equal(run.answered,true);assert.equal(run.cost_usd,0);assert.equal(run.qualitative.answer_status,'calculated');assert.equal(run.answer,direct.answer)
 }
})
