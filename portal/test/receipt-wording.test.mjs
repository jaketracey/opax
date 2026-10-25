import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {build} from 'esbuild'
import {FEDERAL_RECEIPTS_NOTE,unsafeReceiptWording} from '../src/receipt-language.mjs'

const bundled=await build({stdin:{contents:"export * from './src/ask-money';export * from './src/ask-money-overview';export * from './src/agentic-tools';export * from './src/agentic-ask';export * from './src/research-writing';export * from './src/research-grounding';export * from './src/research-response';export * from './src/research-calculated';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'node',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'))
const probes=JSON.parse(fs.readFileSync(new URL('./fixtures/ask-receipts-probes.json',import.meta.url))).questions
const read=path=>JSON.parse(fs.readFileSync(new URL('../public'+path,import.meta.url)))
const assets={fetch:async req=>Response.json(read(new URL(req.url).pathname))}
const amounts=text=>text.match(/\$\d[\d,]*(?:\.\d+)?/g)??[]

for(const q of probes)test('local receipt probe: '+q.id,async()=>{
 const result=await api.rankedMoneyAnswer({question:q.question},assets)
 assert.ok(result)
 if(q.id==='RC05'){
  assert.match(result.answer,/cannot establish.*banks/)
  assert.match(result.answer,/balances owed at 30 June/)
  assert.deepEqual(amounts(result.answer),[])
  assert.equal(result.sources[0].href,'/graph/aec-extras.json')
 }else{
  const lead=result.answer.split('\n')[0]
  assert.match(lead,/largest disclosed receipts/)
  assert.match(lead,/Westpac Banking Corporation/)
  assert.ok(lead.includes(FEDERAL_RECEIPTS_NOTE))
  assert.equal(unsafeReceiptWording(result.answer),false)
  assert.doesNotMatch(result.money_question,/donat|giv|fund/i)
  const expected=q.id==='RC03'?'$40,608,922':q.id==='RC04'?'$161,787':'$55,227,183'
  assert.ok(lead.includes(expected))
  const grounded=api.groundAnswerPayload(structuredClone(result),q.question)
  assert.ok(grounded.answer.split('\n')[0].includes('Westpac Banking Corporation'))
  assert.ok(grounded.answer.split('\n')[0].includes(expected))
  assert.deepEqual((await api.rankedMoneyAnswer({question:result.money_question},assets)).answer.match(/^\|.*$/gm),result.answer.match(/^\|.*$/gm))
 }
 for(const [id,ranges]of Object.entries(result.citations)){
  assert.ok(result.sources.some(s=>s.resource===id&&s.cited))
  for(const [a,b]of ranges)assert.ok(a>=0&&b>a&&b<=Array.from(result.answer).length)
 }
})

test('a bank-sized mixed total remains numerically unchanged and is never called a gift',async()=>{
 const graph={meta:{generated:'2026-10-25'},nodes:[{id:'party:Labor',kind:'party',label:'Labor'},{id:'donor:bank',kind:'donor',label:'Example Bank Ltd',industry:'finance'},{id:'donor:company',kind:'donor',label:'Example Manufacturing Ltd',industry:'other'}],edges:[{source:'donor:bank',target:'party:Labor',total:90000000,count:2,firstYear:2024,lastYear:2024,byYear:{2024:[90000000,2]}},{source:'donor:company',target:'party:Labor',total:1000000,count:1,firstYear:2024,lastYear:2024,byYear:{2024:[1000000,1]}}]}
 const snapshot=structuredClone(graph),deps={asset:async()=>graph,origin:'https://example.invalid'}
 const result=await api.partyDonations(deps,{party:'Labor'})
 assert.equal(result.tool,'party_receipts')
 assert.deepEqual(result.data.rows.map(r=>r.total_aud),[90000000,1000000])
 assert.deepEqual(graph,snapshot)
 assert.match(result.cite[0].label,/Disclosed receipts/)
 const sheet=api.factSheet([result])
 assert.match(sheet.facts[0].text,/Labor disclosed \$90,000,000 in receipts from Example Bank Ltd/)
 assert.equal(unsafeReceiptWording(sheet.facts.map(f=>f.text).join('\n')),false)
 const facts=api.writingFacts(undefined,sheet.facts,sheet.notes)
 assert.equal(facts[0].atoms[0].metric,'receipts')
 const input={question:probes[0].question,period:{kind:'all',label:''},facts}
 const fallback=api.proseFallback(input)
 assert.ok(fallback.answer.includes('$90,000,000'))
 assert.ok(fallback.answer.includes(FEDERAL_RECEIPTS_NOTE))
 assert.equal(unsafeReceiptWording(fallback.answer),false)
 for(const verb of ['gave','donated','funded'])assert.equal(api.verifyWrittenAnswer({sentences:[{text:`Example Bank Ltd ${verb} Labor $90,000,000.`,facts:[1]}]},input),null)
 assert.equal(api.verifyWrittenAnswer({sentences:[{text:'Example Bank Ltd received $90,000,000 from Labor.',facts:[1]}]},input),null)
})

test('overview verifier rejects unsafe claims even beside a correct limitation',()=>{
 const facts={ranked_by:'disclosed receipts',selection:'Federal (AEC)',rows:[{name:'Example Bank Ltd',amount:'$90,000,000',records:'2'}],derived:[],limits:[FEDERAL_RECEIPTS_NOTE]}
 for(const text of ['Example Bank Ltd donated $90,000,000 to Labor.','Example Bank Ltd funded Labor with $90,000,000.','These are not donations; Example Bank Ltd gave Labor $90,000,000.'])assert.equal(api.verifiedOverview(text+' '+FEDERAL_RECEIPTS_NOTE,facts),'')
 const safe='Example Bank Ltd is the source of $90,000,000 in disclosed receipts. '+FEDERAL_RECEIPTS_NOTE
 assert.equal(api.verifiedOverview(safe,facts),safe)
})

test('saved federal research answers, including cache and SSE fallbacks, migrate only their wording',async()=>{
 const f=JSON.parse(fs.readFileSync(new URL('./fixtures/research-coherence-pauline.json',import.meta.url)))
 for(const stream of [false,true])for(const mode of ['loop','planner']){
  const original={...structuredClone(f.payload),research:{mode}}
  const response=stream?new Response('event: done\ndata: '+JSON.stringify(original)+'\n\n',{headers:{'content-type':'text/event-stream','x-opax-cache':'HIT'}}):Response.json(original,{headers:{'x-opax-cache':'HIT'}})
  const wire=await(await api.withAnswerLanguage(response,probes[3].question)).text()
  const out=stream?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire)
  assert.match(out.answer.split('\n')[0],/Westpac Banking Corporation.*disclosed receipts.*161,787/)
  assert.ok(out.answer.split('\n')[0].includes(FEDERAL_RECEIPTS_NOTE))
  assert.equal(unsafeReceiptWording(out.answer),false)
  assert.deepEqual(amounts(out.answer),amounts(f.payload.answer))
  assert.deepEqual(api.groundAnswerPayload(structuredClone(out),probes[3].question),out)
 }
})

test('party table labels change while numeric rows, column keys and ordering remain intact',async()=>{
 const {partyMoneyData,partyMoneyTableConfig}=await import('../public/register-tables.js')
 const rows=partyMoneyData(read('/graph/money.json'),'party:Labor').rows
 const before=structuredClone(rows),config=partyMoneyTableConfig(rows)
 assert.equal(config.caption,'Disclosed receipts')
 assert.equal(config.columns.find(c=>c.key==='total').label,'Received')
 assert.deepEqual(config.columns.map(c=>c.key),['label','industry','total','count','firstYear','lastYear'])
 assert.deepEqual(rows,before)
})
