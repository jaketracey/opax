import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {build} from 'esbuild'
import {loadWorker,offline,outbound} from './worker-harness.mjs'
import {moneyAsset,moneyAssets} from './money-graph-data.mjs'
const root=new URL('../',import.meta.url).pathname
const built=await build({stdin:{contents:"export * from './src/ask-money-routing';export {industryMoneyIntent} from './src/ask-money-industry';export * from './src/ask-money';export * from './src/agentic-ask';export * from './src/agentic-response';export * from './src/research-loop';export * from './src/receipt-copy';export {moneyOverviewPrompt} from './src/ask-money-overview';export {writingPrompt} from './src/research-writing';export {partyDonations,TOOL_SPECS} from './src/agentic-tools';export {calculatedLookup} from './src/research-calculated';",resolveDir:root},bundle:true,write:false,platform:'browser',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/party-receipt-routing.json',import.meta.url)))
// Routes are checked against the published typed export (the Worker tests read public/, which this import checks is
// typed); the untyped test near the end strips the receipt-type fields to keep the fallback shape.
const asset=moneyAsset('typed'),assets=moneyAssets('typed'),untypedAssets=moneyAssets('untyped')
const typedHeading={donations:'Donations',other_receipts:'Other receipts',subscriptions:'Subscriptions'}
function cited(p){assert.ok(Object.keys(p.citations).length>=2);for(const ranges of Object.values(p.citations))for(const[a,b]of ranges)assert.ok(a>=0&&b>a&&b<=Array.from(p.answer).length)}
function complete(p){
 assert.equal(p.answer_status,'calculated');assert.ok(typedHeading[p.measure],p.measure)
 const lead=p.answer.split('\n')[0];assert.match(lead,/largest source/);assert.ok(lead.includes(p.measure_label),lead)
 assert.match(p.answer,new RegExp(`\\| Source \\| ${typedHeading[p.measure]} \\| Share \\| All receipt types \\|`))
 assert.ok(p.answer.split('\n').filter(s=>/^\| /.test(s)).length>=3);cited(p)
}
function completeUntyped(p){assert.equal(p.answer_status,'calculated');assert.equal(p.measure,'receipts_all');assert.match(p.answer,/disclosed receipts, all types/);assert.match(p.answer.split('\n')[0],/largest source/);assert.match(p.answer,/\| Source \| Disclosed receipts.*\| Share \| Records \|/);assert.ok(p.answer.split('\n').filter(s=>/^\| /.test(s)).length>=3);cited(p)}
for(const question of fixture.questions)test('closed family routes to the complete calculator: '+question,async()=>{
 assert.ok(api.federalPartyRankingQuestion(question));const p=await api.federalPartyMoneyAnswer({question},assets);complete(p)
 const direct=await api.rankedMoneyAnswer({question},assets);assert.equal(direct.answer,p.answer)
})
for(const input of fixture.followups)test('bounded family follow-up routes without a model: '+input.question,async()=>complete(await api.federalPartyMoneyAnswer(input,assets)))
for(const question of fixture.outside)test('outside the family retains its route: '+question,async()=>{assert.equal(api.federalPartyRankingQuestion(question),null);if(api.industryMoneyIntent(question))assert.ok(await api.federalPartyMoneyAnswer({question},assets));else assert.equal(await api.federalPartyMoneyAnswer({question},assets),null)})
test('a missing historical selection keeps its party, period, limitation and citation',async()=>{
 const p=await api.federalPartyMoneyAnswer({question:'Who gave the most money to One Nation in 1990?'},assets)
 assert.equal(p.answer_status,'calculated');assert.equal(p.coverage.matched,false);assert.match(p.answer,/Held-period figures/);assert.match(p.answer,/donations received \(AEC receipt type: Donation Received\)/);assert.ok(Object.keys(p.citations).length);assert.match(p.answer,/\$[0-9]/)
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
 const realAssets=h.env.ASSETS;h.env.ASSETS={fetch:async req=>new URL(req.url).pathname==='/graph/money-receipts.json'?assets.fetch(req):realAssets.fetch(req)}
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
 // A donor breakdown ranks donations by default (A34) and says so; all receipt types say receipts.
 const fact=api.factSheet([result]).facts[0].text;assert.match(fact,/^Labor disclosed \$[\d,]+ in donations from/);assert.doesNotMatch(fact,/ gave /)
 const all=await api.partyDonations({asset,kb:async()=>{throw Error('Unexpected retrieval')}},{party:'Labor',limit:1,measure:'all_types'})
 assert.match(api.factSheet([all]).facts[0].text,/^Labor disclosed \$[\d,]+ in receipts from/)
 const state=await api.calculatedLookup('ranked_money',{}, {question:'Who gives the most money to Labor in Victoria?'},{asset,origin:'https://example.invalid'});assert.deepEqual(state.notes,[])
 const app=fs.readFileSync(root+'public/app.js','utf8');assert.ok(app.includes('"Received by parties (disclosed)"'));assert.ok(app.includes('"Receipts counted"'));assert.doesNotMatch(app,/"Given \(disclosed\)"|"Donations counted"/)
 assert.ok(fs.readFileSync(root+'public/money-map.js','utf8').includes('Received across'));assert.doesNotMatch(fs.readFileSync(root+'public/money-map.js','utf8'),/Given across/)
 assert.ok(fs.readFileSync(root+'public/money-journeys-data.js','utf8').includes('disclosed receipts record'))
 for(const file of ['research-grounding.ts','research-response.ts','research-writer.ts'])assert.doesNotMatch(fs.readFileSync(root+'src/'+file,'utf8'),/receiptWording|research-receipts|receipt-language/)
})

test('conjugation × aspect × party × ranking grammar stays on the complete calculator',async()=>{
 const {cases,controls}=await import('./fixtures/party-receipt-grammar.mjs')
 assert.ok(cases.length>=100);assert.ok(controls.length>=20)
 for(const {question,party}of cases){
  const selected=party.replace(/^the /,'').replace('Liberal Party','Liberal')
  assert.equal(api.federalPartyRankingQuestion(question),`Who has the most disclosed receipts to ${selected}?`,question)
  const p=await api.federalPartyMoneyAnswer({question},assets);assert.ok(p,question);complete(p)
  assert.ok(p.answer.split('\n')[0].includes(`source to ${selected} is`),question)
  assert.equal(new URL(p.sources[0].url,'https://opax.test').searchParams.get('party'),'party:'+selected,question)
 }
 for(const question of controls){assert.equal(api.federalPartyRankingQuestion(question),null,question);assert.equal(await api.federalPartyMoneyAnswer({question},assets),null,question)}
})
test('follow-up intent is resolved before incompatible filters, in both topic directions',async()=>{
 const history=text=>[{author:'user',text}]
 for(const extra of [{topic:'housing'},{chamber:'senate'},{speaker:'speaker-fixture'},{kind:'speech'}]){
  assert.equal(await api.federalPartyMoneyAnswer({question:'And what did Labor say about housing?',context:history('Who has donated the most to Labor?'),...extra},assets),null)
 }
 complete(await api.federalPartyMoneyAnswer({question:'Who is giving the most money to Labor?',context:history('What did Labor say about housing?')},assets))
 assert.equal(await api.federalPartyMoneyAnswer({question:'What about the Greens?',context:[...history('Who funds Labor?'),...history('And what did Labor say about housing?')],topic:'housing'},assets),null)
 for(const extra of [{topic:'housing'},{kind:'grant'}])assert.equal((await api.federalPartyMoneyAnswer({question:'And what about the Greens?',context:history('Who funds Labor?'),...extra},assets)).answer_status,'needs_scope')
})
test('Greens tense reproductions bypass a stale gift-framed cache in JSON and SSE',async()=>{
 const restore=offline(),pending=[],ctx={waitUntil:p=>pending.push(p),passThroughOnException(){}}
 const h=await loadWorker(root+'src/index.ts',root+'public',ctx),saved=caches.default
 const realAssets=h.env.ASSETS;h.env.ASSETS={fetch:async req=>new URL(req.url).pathname==='/graph/money-receipts.json'?assets.fetch(req):realAssets.fetch(req)}
 let cacheReads=0;globalThis.caches.default={match:async()=>{cacheReads++;return Response.json({answer:'Example Bank gives the most money to the Greens: $90 million.'})},put:async()=>{}}
 const initial=outbound.length
 try{
  h.env.RESEARCH_LOOP='route';h.env.AGENTIC_ASK_MODE='route';h.env.ASK_MODEL='openai-compatible'
  for(const question of ['Who has donated the most money to the Greens?','Who is giving the most money to the Greens?'])for(const stream of [false,true]){
   const response=await h.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question})})
   assert.equal(response.headers.get('x-opax-money-route'),'federal-party-ranking-v1')
   const wire=await response.text(),p=stream?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire)
   complete(p);assert.deepEqual(p,JSON.parse(JSON.stringify(api.publicPartyMoneyAnswer(await api.federalPartyMoneyAnswer({question},assets)))))
  }
  assert.equal(cacheReads,0);assert.equal(outbound.length,initial)
 }finally{globalThis.caches.default=saved;await Promise.all(pending);restore()}
})

test('explicit family continuations and past recipient forms keep the calculator route',async()=>{
 for(const question of ["Who's giving the most money to Labor?","Who's Labor's biggest backer?",'And who has donated the most to Labor?','Who has been the biggest funder to Labor?','Who was Labor\'s main contributor?','Who did Labor take the most money from?','Who has Labor taken the most money from?','Who is Labor taking the most money from?'])complete(await api.federalPartyMoneyAnswer({question,context:[{author:'user',text:'What did parliament say about housing?'}]},assets))
})
test('mixed receipt headers and charts use source and receipt labels without changing table keys',async()=>{
 const tables=await import('../public/register-tables.js'),ledger=await import('../public/ledger.js')
 const config=tables.partyMoneyTableConfig([{label:'Example Bank Ltd',total:90,count:2}])
 assert.deepEqual(config.columns.map(c=>c.key),['label','industry','total','count','firstYear','lastYear'])
 assert.equal(config.columns[0].label,'Source');assert.equal(config.columns[2].label,'Received');assert.equal(config.export.filename,'party-receipts.csv')
 for(const view of ['flows','donors'])assert.ok(ledger.buildCSV(view,[],[]).startsWith('Source,'))
 const graph=fs.readFileSync(root+'graph/index.ts','utf8'),app=fs.readFileSync(root+'public/app.js','utf8'),explain=fs.readFileSync(root+'graph/explain.ts','utf8')
 assert.ok(graph.includes("'disclosed receipts to parties'"));assert.doesNotMatch(graph,/given to parties|Top donors shown|Largest donors in this flow/)
 assert.ok(app.includes('Disclosed receipts per financial year'));assert.doesNotMatch(app,/Donations per financial year|Donations come from AEC/)
 assert.doesNotMatch(explain,/leading donors shown|leading donors account for/)
 assert.ok(app.includes('itemised as donations'),'Classified annual-return categories retain their source wording')
 // The nightly rewrites CACHE_EPOCH every run; require both environments to share one epoch no older than the receipts release.
 const configText=fs.readFileSync(root+'wrangler.jsonc','utf8'),epochs=[...configText.matchAll(/"CACHE_EPOCH": "([^"]+)"/g)].map(m=>m[1])
 assert.equal(epochs.length,2);assert.equal(epochs[0],epochs[1]);assert.ok(epochs[0]>='2026-10-25-receipts-r6',`stale CACHE_EPOCH ${epochs[0]}`)
})

test('ranked_money rows carry their direction and amounts as data',async()=>{
 const {donorRanking}=await import('../src/research-coherence.mjs')
 const question='Who gives the most money to Labor?'
 const calculated=await api.federalPartyMoneyAnswer({question},assets)
 assert.match(calculated.sources[0].snippet,/grouped by source/);assert.doesNotMatch(calculated.sources[0].snippet,/donors during/)
 // Typed: the SDA leads Labor on donations ($11,808,585); untyped, Westpac leads on all receipt types.
 assert.equal(donorRanking(question,calculated.sources)[0].name,'Shop, Distributive and Allied Employees Association')
 const row=calculated.sources.find(s=>s.receipt);assert.equal(row.receipt.party,'Labor');assert.equal(row.receipt.source,'Shop, Distributive and Allied Employees Association');assert.equal(row.receipt.amount,11808585);assert.equal(row.receipt.jurisdiction,'federal');assert.equal(row.receipt.measure,'donations');assert.match(calculated.sources[0].snippet,/donations received \(AEC receipt type: Donation Received\)/)
 const legacy=await api.federalPartyMoneyAnswer({question},untypedAssets)
 assert.equal(donorRanking(question,legacy.sources)[0].name,'Westpac Banking Corporation')
 const legacyRow=legacy.sources.find(s=>s.receipt);assert.equal(legacyRow.receipt.source,'Westpac Banking Corporation');assert.match(legacy.sources[0].snippet,/disclosed receipts, all types/)
 const app=fs.readFileSync(root+'public/app.js','utf8');assert.doesNotMatch(app,/heading: "Largest donors"|"major donors disclosed"/)
})

test('additional federal total labels use receipts and source wording throughout the public UI',()=>{
 for(const [file,old]of [
  ['public/app.js',/"Largest donors"|"major donors disclosed"|Disclosed money from this donor/],
  ['public/growth-modules.js',/Also in the donations register/],
  ['public/grants.js',/label: 'To donors'|label: 'In the donor registers'|>Donors only</],
  ['public/money-explain.js',/largest donors by lifetime total|all donors on the map|follows one giver/],
  ['src/seo-content.ts',/<h2>Donors to their party<\/h2>/],
 ])assert.doesNotMatch(fs.readFileSync(root+file,'utf8'),old,file)
})

test('R7 long-tail grammar stays deterministic; original and new near-miss controls stay outside',async()=>{
 const {cases,negatives}=await import('./fixtures/party-receipt-long-tail.mjs')
 assert.equal(cases.length,216);assert.ok(negatives.length>=30)
 for(const {question,party}of cases){
  const p=await api.federalPartyMoneyAnswer({question},assets);assert.ok(p,question)
  complete(p);assert.equal(new URL(p.sources[0].url,'https://opax.test').searchParams.get('party'),'party:'+party,question)
 }
 for(const question of negatives){assert.equal(api.federalPartyRankingIntent(question),null,question);assert.equal(await api.federalPartyMoneyAnswer({question},assets),null,question)}
})
test('informal party rankings are answered for their natural reading, which the answer states',async()=>{
 const {uncertain}=await import('./fixtures/party-receipt-long-tail.mjs')
 for(const {question,parties}of uncertain){
  const p=await api.federalPartyMoneyAnswer({question},assets)
  assert.equal(p.answer_status,'calculated',question);assert.equal(p.money_route,'federal-party-ranking-v1')
  assert.equal(p.money_reading,`Reading this as the largest disclosed receipts to ${parties[0]}.`,question)
  for(const party of parties)assert.ok(p.answer.includes(party),question)
  assert.ok(p.sources.length>0,question);assert.match(p.answer.split('\n')[0],/\$[\d,]+/,question)
  const exact=await api.federalPartyMoneyAnswer({question:`Who has the most disclosed receipts to ${parties[0]}?`},assets)
  assert.equal(p.answer.replace(/\n\nReading this as[^\n]*/,''),exact.answer,question)
  assert.equal((await api.rankedMoneyAnswer({question},assets)).answer,p.answer)
 }
})
test('R7 exact reproductions and uncertain requests bypass poisoned caches in JSON and SSE',async()=>{
 const {reproductions,uncertain}=await import('./fixtures/party-receipt-long-tail.mjs')
 const restore=offline(),pending=[],ctx={waitUntil:p=>pending.push(p),passThroughOnException(){}}
 const h=await loadWorker(root+'src/index.ts',root+'public',ctx),saved=caches.default
 const realAssets=h.env.ASSETS;h.env.ASSETS={fetch:async req=>new URL(req.url).pathname==='/graph/money-receipts.json'?assets.fetch(req):realAssets.fetch(req)}
 let reads=0;globalThis.caches.default={match:async()=>{reads++;return Response.json({answer:'Old gift claim'})},put:async()=>{}}
 const before=outbound.length
 try{
  h.env.RESEARCH_LOOP='route';h.env.AGENTIC_ASK_MODE='route'
  for(const question of [...reproductions,...uncertain.map(u=>u.question)])for(const stream of [false,true]){
   const response=await h.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question})})
   assert.equal(response.status,200);assert.equal(response.headers.get('x-opax-money-route'),'federal-party-ranking-v1',question)
   const wire=await response.text(),p=stream?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire)
   assert.deepEqual(p,JSON.parse(JSON.stringify(api.publicPartyMoneyAnswer(await api.federalPartyMoneyAnswer({question},assets)))))
   // An informal request is calculated for its natural reading, which the answer states.
   if(reproductions.includes(question))complete(p);else{assert.equal(p.answer_status,'calculated',question);assert.match(p.money_reading,/^Reading this as the largest disclosed receipts to /)}
  }
  assert.equal(reads,0);assert.equal(outbound.length,before)
 }finally{globalThis.caches.default=saved;await Promise.all(pending);restore()}
})

test('informal family intent is calculated without a model through direct agentic, research and follow-ups',async()=>{
 // An informal family question is calculated for its natural reading: the
 // published graph is read, and no model or paid call is made on any path.
 const question='Who Labor top donors?',forbidden=()=>{throw Error('Informal family intent reached a model')}
 const asset=async path=>JSON.parse(fs.readFileSync(new URL('../public'+path,import.meta.url),'utf8'))
 const deps={asset,kb:forbidden,generate:forbidden,research:Object.assign(forbidden,{write:forbidden})}
 const run=await api.runAgentic(question,deps);assert.equal(api.agenticAskPayload(run,question).answer_status,'calculated');assert.equal(run.cost_usd,0)
 assert.match(run.answer,/Reading this as the largest disclosed receipts to Labor\./)
 const research=api.createResearch({input:{question},modelBudgetSpent:forbidden,dailyBudget:{reserve:forbidden}})
 const out=await research(question,{deps,period:api.inferPeriod(question),named:{people:[],parties:[],bills:[],ambiguous:false,unresolved:false},signal:new AbortController().signal,progress:forbidden,scope:x=>x,execute:forbidden})
 assert.equal(out.costUsd,0)
 const context=[{author:'user',text:question}]
 // Follow-ups carry the reading forward: another party, or another year.
 const greens=await api.federalPartyMoneyAnswer({question:'What about the Greens?',context},assets)
 assert.equal(greens.answer_status,'calculated');assert.match(greens.money_question,/to Greens/)
 const year=await api.federalPartyMoneyAnswer({question:'And in 2019-20?',context},assets)
 assert.equal(year.answer_status,'calculated');assert.match(year.money_question,/to Labor.*2019/)
 assert.equal(await api.federalPartyMoneyAnswer({question:'And what did Labor say about housing?',topic:'housing',context},assets),null)
})


test('fixed typo list routes, while all removed fuzzy wordings take the ordinary route',async()=>{
 const {fixedCases,removedCases,removedClarifications}=await import('./fixtures/party-receipt-long-tail.mjs')
 assert.equal(removedCases.length,36)
 for(const {question,party}of fixedCases){const p=await api.federalPartyMoneyAnswer({question},assets);complete(p);assert.equal(new URL(p.sources[0].url,'https://opax.test').searchParams.get('party'),'party:'+party,question)}
 for(const question of [...removedCases.map(c=>c.question),...removedClarifications]){
  assert.equal(api.federalPartyRankingIntent(question),null,question)
  assert.equal(await api.federalPartyMoneyAnswer({question},assets),null,question)
 }
 for(const question of ['Who funds Labor?','Who funds the ALP?','Who funds the Liberal Party?','Who funds the National Party?','Who funds the Liberal National Party?'])complete(await api.federalPartyMoneyAnswer({question},assets))
 assert.doesNotMatch(fs.readFileSync(root+'src/ask-money-family.ts','utf8'),/receiptKeywordDistance|editCost|Levenshtein/)
})

test('six review regressions retain ordinary Ask on JSON and SSE',async()=>{
 const {regressions}=await import('./fixtures/party-receipt-long-tail.mjs')
 const restore=offline(),pending=[],ctx={waitUntil:p=>pending.push(p),passThroughOnException(){}}
 const h=await loadWorker(root+'src/index.ts',root+'public',ctx),saved=caches.default
 const realAssets=h.env.ASSETS;h.env.ASSETS={fetch:async req=>new URL(req.url).pathname==='/graph/money-receipts.json'?assets.fetch(req):realAssets.fetch(req)}
 const cached={answer:'Ordinary Ask cached response.',answer_status:'answered',sources:[],citations:{}}
 let reads=0;globalThis.caches.default={match:async()=>{reads++;return Response.json(cached)},put:async()=>{}}
 const before=outbound.length
 try{
  h.env.RESEARCH_LOOP='off';h.env.AGENTIC_ASK_MODE='off'
  for(const question of regressions)for(const stream of [false,true]){
   assert.equal(api.federalPartyRankingIntent(question),null,question)
   const response=await h.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question})})
   assert.equal(response.status,200,question);assert.equal(response.headers.get('x-opax-money-route'),null,question)
   const wire=await response.text()
   if(['Who funds Liberty?','Who funds Nationalism?'].includes(question)){
    // The existing general money calculator may ask for an exact source; it
    // must not substitute a party or enter the closed family route.
    const p=JSON.parse(wire);assert.equal(p.answer_status,'needs_scope');assert.equal(p.money_route,undefined)
    assert.equal(p.answer,(await api.rankedMoneyAnswer({question},assets)).answer)
    assert.doesNotMatch(p.answer,/Liberal|Nationals|largest disclosed receipts/)
   }else{
    assert.equal(response.headers.get('x-opax-cache'),'HIT',question)
    const p=stream?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire)
    assert.deepEqual(p,cached,question)
   }
  }
  assert.equal(reads,(regressions.length-2)*2);assert.equal(outbound.length,before)
 }finally{globalThis.caches.default=saved;await Promise.all(pending);restore()}
})

test('untyped fallback: family questions keep the all-types calculator shape on an export without receipt types',async()=>{
 for(const question of fixture.questions.slice(0,3)){
  const p=await api.federalPartyMoneyAnswer({question},untypedAssets);completeUntyped(p)
  assert.deepEqual(p.answer,(await api.rankedMoneyAnswer({question},untypedAssets)).answer)
 }
 const labor=await api.federalPartyMoneyAnswer({question:'Who gives the most money to Labor?'},untypedAssets);completeUntyped(labor)
 assert.match(labor.answer.split('\n')[0],/^The largest source to Labor is \*\*Westpac Banking Corporation: \$[\d,]+\*\*, disclosed receipts, all types/)
 const missing=await api.federalPartyMoneyAnswer({question:'Who gave the most money to One Nation in 1990?'},untypedAssets)
 assert.equal(missing.coverage.matched,false);assert.match(missing.answer,/Held-period figures/);assert.match(missing.answer,/disclosed receipts, all types/)
})
