import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {build} from 'esbuild'
import {loadWorker,offline,outbound} from './worker-harness.mjs'
const root=new URL('../',import.meta.url).pathname
const built=await build({stdin:{contents:"export * from './src/ask-money-routing';export * from './src/ask-money';export * from './src/agentic-ask';export * from './src/agentic-response';export * from './src/research-loop';export * from './src/receipt-copy';export {moneyOverviewPrompt} from './src/ask-money-overview';export {writingPrompt} from './src/research-writing';export {partyDonations,TOOL_SPECS} from './src/agentic-tools';export {calculatedLookup} from './src/research-calculated';",resolveDir:root},bundle:true,write:false,platform:'browser',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/party-receipt-routing.json',import.meta.url)))
const asset=async path=>JSON.parse(fs.readFileSync(root+'public'+path))
const assets={fetch:async request=>Response.json(await asset(new URL(request.url).pathname))}
function complete(p){assert.equal(p.answer_status,'calculated');assert.ok(p.answer.includes(api.FEDERAL_RECEIPTS_NOTE));assert.match(p.answer.split('\n')[0],/largest disclosed receipts/);assert.match(p.answer,/\| Donor \| Disclosed receipts \| Records \|/);assert.ok(p.answer.split('\n').filter(s=>/^\| /.test(s)).length>=3);assert.ok(Object.keys(p.citations).length>=2);for(const ranges of Object.values(p.citations))for(const[a,b]of ranges)assert.ok(a>=0&&b>a&&b<=Array.from(p.answer).length)}
for(const question of fixture.questions)test('closed family routes to the complete calculator: '+question,async()=>{
 assert.ok(api.federalPartyRankingQuestion(question));const p=await api.federalPartyMoneyAnswer({question},assets);complete(p)
 const direct=await api.rankedMoneyAnswer({question},assets);assert.equal(direct.answer,p.answer)
})
for(const input of fixture.followups)test('bounded family follow-up routes without a model: '+input.question,async()=>complete(await api.federalPartyMoneyAnswer(input,assets)))
for(const question of fixture.outside)test('outside the family retains its route: '+question,async()=>{assert.equal(api.federalPartyRankingQuestion(question),null);assert.equal(await api.federalPartyMoneyAnswer({question},assets),null)})
test('a missing historical selection keeps its party, period, limitation and citation',async()=>{
 const p=await api.federalPartyMoneyAnswer({question:'Who gave the most money to One Nation in 1990?'},assets)
 assert.equal(p.answer_status,'evidence_gap');assert.match(p.answer,/receipts to One Nation for 1990–91/);assert.ok(p.answer.includes(api.FEDERAL_RECEIPTS_NOTE));assert.ok(Object.keys(p.citations).length);assert.doesNotMatch(p.answer,/Westpac|\$[0-9]/)
})
test('state controls and unrelated turns cannot inherit the federal route',async()=>{
 for(const input of [{question:fixture.questions[0],state:'qld'},{question:'What about Labor?',context:[{author:'user',text:'Who props up Labor?'},{author:'user',text:'What did parliament say about hospitals?'}]}])assert.equal(await api.federalPartyMoneyAnswer(input,assets),null)
})
test('incompatible controls cannot send a family question to a model',async()=>{
 for(const extra of [{topic:'housing'},{speaker:'Avery Example'},{chamber:'senate'},{kind:'grant'}]){const p=await api.federalPartyMoneyAnswer({question:fixture.questions[0],...extra},assets);assert.equal(p.money_route,'federal-party-ranking-v1');assert.equal(p.answer_status,'needs_scope');assert.match(p.answer,/Clear the/)}
})
test('actual JSON/SSE payload bypasses caches and every model mode after money_facts is stripped',async()=>{
 const restore=offline(),pending=[],ctx={waitUntil:p=>pending.push(p),passThroughOnException(){}}
 const h=await loadWorker(root+'src/index.ts',root+'public',ctx),saved=caches.default
 let cacheReads=0;globalThis.caches.default={match:async()=>{cacheReads++;return Response.json({answer:'Poisoned old model answer'})},put:async()=>{}}
 const initial=outbound.length
 try{for(const mode of ['off','route','shadow'])for(const stream of [false,true]){
  h.env.RESEARCH_LOOP=mode;h.env.AGENTIC_ASK_MODE='route';h.env.ASK_MODEL='openai-compatible'
  for(const input of [...fixture.questions.map(question=>({question})),...fixture.followups,{question:fixture.questions[26],kind:'speech'}]){
   const response=await h.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json',...(stream?{accept:'text/event-stream'}:{})},body:JSON.stringify(input)})
   assert.equal(response.status,200);assert.equal(response.headers.get('x-opax-money-route'),'federal-party-ranking-v1')
   const wire=await response.text(),p=stream?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire)
   complete(p);assert.equal('money_facts' in p,false);assert.equal('money_overview' in p,false);assert.equal(p.money_route,'federal-party-ranking-v1')
   const expected=api.publicPartyMoneyAnswer(await api.federalPartyMoneyAnswer(input,assets));assert.deepEqual(p,JSON.parse(JSON.stringify(expected)))
  }
 }
 assert.equal(cacheReads,0);assert.equal(outbound.length,initial)
 }finally{globalThis.caches.default=saved;await Promise.all(pending);restore()}
})
test('direct agentic and research-loop entry points never call the planner or writer for family questions',async()=>{
 const forbidden=()=>{throw Error('A family question reached a model')},deps={asset,kb:forbidden,generate:forbidden,research:Object.assign(forbidden,{write:forbidden})}
 const run=await api.runAgentic(fixture.questions[13],deps);complete(api.agenticAskPayload(run,fixture.questions[13]));assert.equal(run.cost_usd,0)
 const research=api.createResearch({input:{question:fixture.questions[26]},modelBudgetSpent:forbidden,dailyBudget:{reserve:forbidden}})
 const out=await research(fixture.questions[26],{deps,period:api.inferPeriod(fixture.questions[26]),named:{people:[],parties:[],bills:[],ambiguous:false,unresolved:false},signal:new AbortController().signal,progress:forbidden,scope:x=>x,execute:forbidden})
 complete(out.qualitative);assert.equal(out.rounds,0);assert.equal(out.costUsd,0)
})
test('receipt copy is input-only and reviewed web labels remain',async()=>{
 const facts={ranked_by:'donor',selection:'Federal (AEC)',rows:[{name:'Example Bank Ltd',amount:'$90,000,000',records:'2'}],derived:[],limits:[]}
 assert.ok(api.moneyOverviewPrompt(facts).includes(api.RECEIPTS_WRITING_RULE));assert.ok(api.writingPrompt({question:'How much did the party receive?',period:{kind:'all',label:''},facts:[]}).includes(api.RECEIPTS_WRITING_RULE))
 assert.ok(api.TOOL_SPECS.some(s=>s.name==='party_receipts'&&s.description.includes('receipt')));assert.ok(!api.TOOL_SPECS.some(s=>s.name==='party_donations'))
 const result=await api.partyDonations({asset,kb:async()=>{throw Error('Unexpected retrieval')}},{party:'Labor',limit:1})
 const fact=api.factSheet([result]).facts[0].text;assert.match(fact,/^Labor disclosed \$[\d,]+ in receipts from/);assert.doesNotMatch(fact,/ gave /)
 const state=await api.calculatedLookup('ranked_money',{}, {question:'Who gives the most money to Labor in Victoria?'},{asset,origin:'https://example.invalid'});assert.ok(!state.notes.includes(api.FEDERAL_RECEIPTS_NOTE))
 const app=fs.readFileSync(root+'public/app.js','utf8');assert.ok(app.includes('"Received by parties (disclosed)"'));assert.ok(app.includes('"Receipts counted"'));assert.doesNotMatch(app,/"Given \(disclosed\)"|"Donations counted"/)
 assert.ok(fs.readFileSync(root+'public/money-map.js','utf8').includes('Received across'));assert.doesNotMatch(fs.readFileSync(root+'public/money-map.js','utf8'),/Given across/)
 assert.ok(fs.readFileSync(root+'public/money-journeys-data.js','utf8').includes('disclosed receipts record'))
 for(const file of ['research-grounding.ts','research-response.ts','research-writer.ts'])assert.doesNotMatch(fs.readFileSync(root+'src/'+file,'utf8'),/receiptWording|research-receipts|receipt-language/)
})
