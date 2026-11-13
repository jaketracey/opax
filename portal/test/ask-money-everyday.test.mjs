// Everyday money wording reaches the calculator; grants, contracts and policy questions keep their own routes.
// Hermetic: the published typed graph, no model calls.
import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {localApi,localAsk,assets} from './ask-lobby-money-harness.mjs'
const api=await localApi()
const root=new URL('../',import.meta.url).pathname
const copy=await build({stdin:{contents:"export {industryModifier} from './src/receipt-copy'",resolveDir:root},bundle:true,write:false,platform:'neutral',format:'esm'})
const {industryModifier}=await import('data:text/javascript;base64,'+Buffer.from(copy.outputFiles[0].text).toString('base64'))

// [question, expected subject, expected recipient, lead pattern]
const money=[
 ['Who has received money from fossil fuels since 2023?','fossil fuels',undefined,/^The AEC records no donations from fossil fuel-linked sources to any party from 2022–23/],
 ['Who got donations from the gambling industry?','the gambling industry',undefined,/^\*\*Liberal\*\* leads parties receiving money from gambling-linked sources/],
 ['Who gets money from mining companies?','mining companies',undefined,/mining-linked sources/],
 ['Who took money from the gambling lobby?','the gambling lobby',undefined,/gambling-linked sources/],
 ['Who accepted donations from property developers?','property developers',undefined,/property-linked sources/],
 ['Which party received the most money from fossil fuels?','fossil fuels',undefined,/fossil fuel-linked sources/],
 ['Which MPs received donations from gambling companies?','gambling companies',undefined,/gambling-linked sources/],
 ['Which parties have received donations from banks?','banks',undefined,/finance-linked sources/],
 ['How much did Labor get from the gambling industry?','the gambling industry','Labor',/^\*\*Labor\*\* has received \*\*\$[\d,]+\*\* from gambling-linked sources/],
 ['How much money did the Greens get from unions?','unions','the Greens',/^\*\*Greens\*\* has received \*\*\$[\d,]+\*\* from union-linked sources/],
 ['Money from fossil fuels to the Liberal Party','fossil fuels','the Liberal Party',/^\*\*Liberal\*\* has received \*\*\$[\d,]+\*\* from fossil fuel-linked sources/],
 ['Money from mining to Labor since 2022','mining','Labor',/^\*\*Labor\*\* has received \*\*\$[\d,]+\*\* from mining-linked sources/],
]
const outside=[
 'Who received grants for renewable energy?',
 'Who got contracts from Defence?',
 'Who has received grants from the Department of Health?',
 'What has parliament said about fossil fuels?',
 'Who has received funding from the Commonwealth for roads?',
 'Who received money from Defence contracts?',
 'Who has received funding from the media?',
]
for(const [question,subject,recipient,lead] of money)test('everyday money wording routes to the calculator: '+question,async()=>{
 const intent=api.industryMoneyIntent(question)
 assert.ok(intent,'money intent');assert.equal(intent.subject,subject);assert.equal(intent.recipient,recipient)
 const p=await api.federalPartyMoneyAnswer({question},assets)
 assert.equal(p.money_route,'federal-party-ranking-v1');assert.equal(p.answer_status,'calculated');assert.match(p.answer,lead)
 assert.doesNotMatch(p.answer,/fossil fuels-linked|unions-linked/)
 const out=await localAsk(api,question,{onResearch:()=>assert.fail('Money uses the calculator')})
 assert.equal(out.answer_status,'calculated')
})
for(const question of outside)test('non-money wording keeps its own route: '+question,async()=>{
 assert.equal(api.industryMoneyIntent(question),null)
 assert.equal(await api.federalPartyMoneyAnswer({question},assets),null)
})
test('earlier money wording keeps its route',()=>{
 for(const [q,subject] of [['Who receives the most money from gambling?','gambling'],['Which party gets the most donations from mining?','mining'],['Who takes the most from the banks?','the banks']])
  assert.equal(api.industryMoneyIntent(q)?.subject,subject,q)
 assert.equal(api.industryMoneyIntent('Who receives the most from the media?'),null)
})
test('industry groupings read as modifiers before a noun',()=>{
 assert.equal(industryModifier('fossil_fuels'),'fossil fuel')
 assert.equal(industryModifier('unions'),'union')
 assert.equal(industryModifier('waste_management'),'waste management')
 assert.equal(industryModifier('gambling'),'gambling')
})
