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
function complete(p){assert.equal(p.answer_status,'calculated');assert.ok(p.answer.includes(api.FEDERAL_RECEIPTS_NOTE));assert.match(p.answer.split('\n')[0],/largest disclosed receipts/);assert.match(p.answer,/\| Source \| Disclosed receipts \| Records \|/);assert.ok(p.answer.split('\n').filter(s=>/^\| /.test(s)).length>=3);assert.ok(Object.keys(p.citations).length>=2);for(const ranges of Object.values(p.citations))for(const[a,b]of ranges)assert.ok(a>=0&&b>a&&b<=Array.from(p.answer).length)}
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

test('conjugation × aspect × party × ranking grammar stays on the complete calculator',async()=>{
 const {cases,controls}=await import('./fixtures/party-receipt-grammar.mjs')
 assert.ok(cases.length>=100);assert.ok(controls.length>=20)
 for(const {question,party}of cases){
  const selected=party.replace(/^the /,'').replace('Liberal Party','Liberal')
  assert.equal(api.federalPartyRankingQuestion(question),`Who has the most disclosed receipts to ${selected}?`,question)
  const p=await api.federalPartyMoneyAnswer({question},assets);assert.ok(p,question);complete(p)
  assert.ok(p.answer.split('\n')[0].includes(`receipts to ${selected} in this published selection`),question)
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
 const configText=fs.readFileSync(root+'wrangler.jsonc','utf8');assert.equal((configText.match(/"CACHE_EPOCH": "2026-10-25-receipts-r6"/g)||[]).length,2)
})

test('Source headers retain evidence direction and amounts, with legacy Donor compatibility',async()=>{
 const {donorRanking}=await import('../src/research-coherence.mjs'),{auditPayload}=await import('../src/research-claim-audit.mjs')
 const question='Who gives the most money to Labor?',answer='Labor disclosed $90,000,000 in receipts from Example Bank Ltd.'
 const source=header=>({resource:'fact-1',kind:'record',cited:true,url:'/money?jur=federal&party=party:Labor',snippet:`Example Bank Ltd has the largest disclosed total to Labor in this published selection: $90,000,000.\nFinancial years: 2020–21.\n| ${header} | Disclosed receipts | Records |\n| Example Bank Ltd | $90,000,000 | 2 |`})
 const ranked=header=>donorRanking(question,[source(header)]).map(({name,party,value})=>({name,party,value}))
 assert.deepEqual(ranked('Source'),[{name:'Example Bank Ltd',party:'Labor',value:90000000}]);assert.deepEqual(ranked('Source'),ranked('Donor'))
 const audited=header=>auditPayload(question,{answer,sources:[source(header)],citations:{'fact-1':[[0,Array.from(answer).length]]}})
 assert.deepEqual(audited('Source'),audited('Donor'))
 const calculated=await api.federalPartyMoneyAnswer({question},assets)
 assert.match(calculated.sources[0].snippet,/grouped by source/);assert.doesNotMatch(calculated.sources[0].snippet,/donors during/)
 assert.equal(donorRanking(question,calculated.sources)[0].name,'Westpac Banking Corporation')
 const app=fs.readFileSync(root+'public/app.js','utf8');assert.doesNotMatch(app,/heading: "Largest donors"|"major donors disclosed"|`disclosed donation\$/)
})

test('additional federal total labels use receipts and source wording throughout the public UI',()=>{
 for(const [file,old]of [
  ['public/app.js',/"Largest donors"|"major donors disclosed"|disclosed donation\$|Disclosed money from this donor/],
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
test('only incomplete exact financial grammar clarifies without assets or models',async()=>{
 const {uncertain}=await import('./fixtures/party-receipt-long-tail.mjs')
 const forbidden={fetch:async()=>{throw Error('Clarification must not guess a calculation')}}
 for(const {question,parties}of uncertain){
  const p=await api.federalPartyMoneyAnswer({question},forbidden)
  assert.equal(p.answer_status,'needs_scope',question);assert.equal(p.money_route,'federal-party-ranking-v1')
  for(const party of parties)assert.ok(p.answer.includes(party),question)
  assert.deepEqual(p.sources,[]);assert.deepEqual(p.citations,{});assert.doesNotMatch(p.answer,/\$|gave|donated/)
  assert.equal((await api.rankedMoneyAnswer({question},forbidden)).answer,p.answer)
 }
})
test('R7 exact reproductions and uncertain requests bypass poisoned caches in JSON and SSE',async()=>{
 const {reproductions,uncertain}=await import('./fixtures/party-receipt-long-tail.mjs')
 const restore=offline(),pending=[],ctx={waitUntil:p=>pending.push(p),passThroughOnException(){}}
 const h=await loadWorker(root+'src/index.ts',root+'public',ctx),saved=caches.default
 let reads=0;globalThis.caches.default={match:async()=>{reads++;return Response.json({answer:'Old gift claim'})},put:async()=>{}}
 const before=outbound.length
 try{
  h.env.RESEARCH_LOOP='route';h.env.AGENTIC_ASK_MODE='route'
  for(const question of [...reproductions,...uncertain.map(u=>u.question)])for(const stream of [false,true]){
   const response=await h.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question})})
   assert.equal(response.status,200);assert.equal(response.headers.get('x-opax-money-route'),'federal-party-ranking-v1',question)
   const wire=await response.text(),p=stream?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire)
   assert.deepEqual(p,JSON.parse(JSON.stringify(api.publicPartyMoneyAnswer(await api.federalPartyMoneyAnswer({question},assets)))))
   if(reproductions.includes(question))complete(p);else assert.equal(p.answer_status,'needs_scope')
  }
  assert.equal(reads,0);assert.equal(outbound.length,before)
 }finally{globalThis.caches.default=saved;await Promise.all(pending);restore()}
})

test('uncertain family intent stays deterministic through direct agentic, research and follow-ups',async()=>{
 const question='Who Labor top donors?',forbidden=()=>{throw Error('Uncertain family intent reached a model or asset')}
 const deps={asset:forbidden,kb:forbidden,generate:forbidden,research:Object.assign(forbidden,{write:forbidden})}
 const run=await api.runAgentic(question,deps);assert.equal(api.agenticAskPayload(run,question).answer_status,'needs_scope');assert.equal(run.cost_usd,0)
 const research=api.createResearch({input:{question},modelBudgetSpent:forbidden,dailyBudget:{reserve:forbidden}})
 const out=await research(question,{deps,period:api.inferPeriod(question),named:{people:[],parties:[],bills:[],ambiguous:false,unresolved:false},signal:new AbortController().signal,progress:forbidden,scope:x=>x,execute:forbidden})
 assert.equal(out.qualitative.answer_status,'needs_scope');assert.equal(out.costUsd,0)
 const context=[{author:'user',text:question}]
 for(const next of ['What about the Greens?','And in 2019-20?'])assert.equal((await api.federalPartyMoneyAnswer({question:next,context},assets)).answer_status,'needs_scope')
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
