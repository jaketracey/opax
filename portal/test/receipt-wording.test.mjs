import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {build} from 'esbuild'
import {FEDERAL_RECEIPTS_NOTE,allowedReceiptSentence,receiptSentenceCheck} from '../src/receipt-language.mjs'
const built=await build({stdin:{contents:"export * from './src/ask-money';export * from './src/ask-money-overview';export * from './src/agentic-tools';export * from './src/agentic-ask';export * from './src/research-writing';export * from './src/research-grounding';export * from './src/research-response';export * from './src/research-receipts';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'node',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const probes=JSON.parse(fs.readFileSync(new URL('./fixtures/ask-receipts-probes.json',import.meta.url))).questions
const framing=JSON.parse(fs.readFileSync(new URL('./fixtures/receipt-framing.json',import.meta.url)))
const source=(party='Labor',id='receipt')=>({resource:id,kind:'receipt',jurisdiction:'federal',cited:true,title:'Federal disclosed receipts',snippet:`${party} disclosed $90,000,000 in receipts from Example Bank Ltd (federal disclosures; financial years 2024–25)`,url:'/money?jur=federal&party=party%3A'+party})
const payload=(answer,sources=[source()],id=sources[0].resource)=>({answer,sources,citations:{[id]:[[0,Array.from(answer).length]]}})
const lead='Labor disclosed $90,000,000 in receipts from Example Bank Ltd.'
const withLead=sentence=>{const answer=lead+' '+FEDERAL_RECEIPTS_NOTE+'\n\n'+sentence;return payload(answer)}
const assets={fetch:async req=>Response.json(JSON.parse(fs.readFileSync(new URL('../public'+new URL(req.url).pathname,import.meta.url))))}
for(const q of probes)test('deterministic receipt probe remains direct: '+q.id,async()=>{
 const out=await api.rankedMoneyAnswer({question:q.question},assets);assert.ok(out)
 if(q.id==='RC05'){assert.match(out.answer,/cannot establish.*banks/);assert.match(out.answer,/balances owed at 30 June/)}
 else{assert.match(out.answer.split('\n')[0],/largest disclosed receipts/);assert.ok(out.answer.includes(FEDERAL_RECEIPTS_NOTE));assert.equal(api.groundAnswerPayload(structuredClone(out),q.question).answer,out.answer)}
})
const reproductions=[...framing.claims.map(claim=>framing.source+' '+claim+'.'),
 'Example Bank Ltd props up Labor with $90,000,000.',
 "Example Bank Ltd is Labor's main financial supporter at $90,000,000.",
 "Example Bank Ltd is the Greens' largest benefactor at $90,000,000.",
 'Labor was given $90,000,000 by Example Bank Ltd.',
 'Labor was donated $90,000,000 by Example Bank Ltd.',
 'The records show that Labor was given $90,000,000 by Example Bank Ltd.',
 'Labor received, according to the record, “a donation of $90,000,000” from Example Bank Ltd.',
 'Example Bank Ltd gave $90 million to Labor.',
 'Example Bank Ltd props up Labor with ninety million dollars.',
 'Example Bank Ltd supports Labor with 90 million dollars.',
 'Example Bank Ltd props up Labor with 90,000,000 dollars.',
 'Example Bank Ltd props up Labor with 90,000,000.',
 'Example Bank Ltd bankrolls Labor with ＄90,000,000.',
 'Example Bank Ltd was the source of $90 in disclosed receipts million.',
]
for(const sentence of reproductions)test('review reproduction is dropped, never rewritten: '+sentence,async()=>{
 const p=withLead(sentence),out=api.withReceiptWording(p,'Who gives the most money to Labor?')
 assert.equal(out.answer.trim(),lead+' '+FEDERAL_RECEIPTS_NOTE)
 assert.equal(api.receiptWordingFindings(out).length,0)
 for(const stream of [false,true])for(const question of [undefined,'Who gives the most money to Labor?']){
  // One-byte chunks exercise quote, currency and frame boundaries.
  const wire=stream?'event: delta\ndata: '+JSON.stringify({text:p.answer})+'\n\nevent: done\ndata: '+JSON.stringify(p)+'\n\n':JSON.stringify(p)
  const bytes=new TextEncoder().encode(wire)
  const body=stream?new ReadableStream({start(c){for(const b of bytes)c.enqueue(new Uint8Array([b]));c.close()}}):wire
  const response=new Response(body,{headers:{'content-type':stream?'text/event-stream':'application/json','x-opax-cache':'HIT'}})
  const text=await(await api.withAnswerLanguage(response,question)).text()
  const released=stream?JSON.parse(text.match(/event: done\ndata: (.+)/)[1]):JSON.parse(text)
  assert.ok(!released.answer.includes(sentence))
  assert.ok(released.answer.includes(lead));assert.ok(released.answer.includes(FEDERAL_RECEIPTS_NOTE))
  assert.doesNotMatch(text,/event: delta/)
  for(const ranges of Object.values(released.citations))for(const[a,b]of ranges)assert.ok(a>=0&&b>a&&b<=Array.from(released.answer).length)
 }
})
test('equal amounts never authorise an uncited party substitution',async()=>{
 const sentence="Example Bank Ltd's donations to Liberal total $90,000,000.",p=payload(sentence,[{...source('Labor','labor'),cited:false},source('Liberal','liberal')],'liberal')
 for(const question of [undefined,'Who gives the most money to Liberal?']){
  const out=await(await api.withAnswerLanguage(Response.json(p),question)).json()
  assert.ok(!out.answer.includes(sentence));assert.doesNotMatch(out.answer,/Labor|Liberal|90,000,000/);assert.deepEqual(out.citations,{})
 }
 const wrong=payload('Labor received $90,000,000 from Example Bank Ltd.',[source('Labor','labor'),source('Liberal','liberal')],'liberal')
 assert.doesNotMatch(api.withReceiptWording(wrong,'').answer,/Labor|90,000,000/)
 const safe='Liberal received $90,000,000 from Example Bank Ltd.'
 assert.equal(api.withReceiptWording(payload(safe,[source('Labor','labor'),source('Liberal','liberal')],'liberal'),'').answer,safe)
})
test('classified state, non-money and figure-free sentences are untouched',async()=>{
 const cases=[
  payload('The register records gifts to registered parties.',[{resource:'state',kind:'receipt',jurisdiction:'vic',title:'Victorian gifts',snippet:'Victorian Electoral Commission gifts; loans excluded.',href:'/graph/money.vic.json',cited:true}]),
  payload('The Victorian register records $90,000,000 in gifts.',[{...source(),jurisdiction:'vic',title:'Victorian gifts',url:'/graph/money.vic.json'}]),
  {answer:'The bill funds hospitals.',sources:[{...source(),cited:false},{resource:'bill',kind:'bill',cited:true,snippet:'The bill funds hospitals.'}],citations:{bill:[[0,24]]}},
  payload('Example Bank Ltd is the largest donor.'),
  payload('Please give the person’s full name.'),
 ]
 for(const p of cases){
  assert.deepEqual(api.withReceiptWording(structuredClone(p),'Who gives the most?'),p);assert.equal(api.receiptWordingFindings(p).length,0)
  const final=await(await api.withAnswerLanguage(Response.json(p))).json()
  assert.equal(final.answer,p.answer)
 }
})
test('writer and overview use the same closed relation grammar',()=>{
 const s=source(),input={question:probes[0].question,period:{kind:'all',label:''},facts:api.writingFacts(payload(lead))}
 const facts={ranked_by:'donor',recipient_party:'Labor',jurisdiction:'federal',selection:'Federal (AEC)',rows:[{name:'Example Bank Ltd',amount:'$90,000,000',records:'2'}],derived:[],limits:[FEDERAL_RECEIPTS_NOTE]}
 for(const sentence of reproductions){assert.equal(api.verifiedOverview(sentence+' '+FEDERAL_RECEIPTS_NOTE,facts),'');assert.equal(api.verifyWrittenAnswer({sentences:[{text:sentence,facts:[1]}]},input),null)}
 assert.equal(api.verifiedOverview(lead+' '+FEDERAL_RECEIPTS_NOTE,facts),lead+' '+FEDERAL_RECEIPTS_NOTE)
})
test('200 generated relations release only neutral, correctly cited parties',()=>{
 let seed=0x9e3779b9;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed>>>16)%n}
 const verbs=['gives','has given','donates','funds','supports','props up','bankrolls','is the largest benefactor of','is the main financial supporter of','is a backer of','underwrites','sustains','financially champions','quietly sponsors','strengthens','contributed to','finances','boosts','subsidises','has pledged to']
 const parties=['Labor','Liberal','Greens','Nationals']
 let kept=0,dropped=0
 for(let i=0;i<200;i++){
  const citedParty=parties[random(parties.length)],statedParty=parties[random(parties.length)],verb=verbs[random(verbs.length)]
  const sentence=i%4===0?`${statedParty} received $90,000,000 from Example Bank Ltd.`:i%4===1?`${statedParty} disclosed $90,000,000 in receipts from Example Bank Ltd.`:`Example Bank Ltd ${verb} ${statedParty} with $90,000,000.`
  const out=api.withReceiptWording(payload(sentence,[source(citedParty)]),'Who gives the most?')
  const released=out.answer.includes('$90,000,000')
  const shouldRelease=i%4<2&&statedParty===citedParty
  assert.equal(released,shouldRelease,JSON.stringify({i,sentence,citedParty,out:out.answer}))
  if(released)kept++;else dropped++
  if(released){assert.equal(out.answer,sentence);assert.equal(allowedReceiptSentence(out.answer,{name:'Example Bank Ltd',party:citedParty,amount:'$90,000,000'}),true);assert.equal(receiptSentenceCheck(out.answer,out.sources).allowed,true)}
  const final=api.groundAnswerPayload(payload(sentence,[source(citedParty)]),'What do the cited receipts establish?')
  assert.equal(final.answer.includes('$90,000,000'),shouldRelease)
  if(shouldRelease)assert.equal(final.answer,sentence)
 }
 assert.ok(kept>0&&dropped>0)
})
test('model flags alone cannot exempt federal receipt prose',()=>{
 const sentence='Example Bank Ltd props up Labor with $90,000,000.'
 const out=api.groundAnswerPayload({...payload(sentence),money_ranking:true,answer_status:'calculated'},'Who gives the most?')
 assert.doesNotMatch(out.answer,/90,000,000|props up|Labor/)
})
test('profile wording remains receipt based',()=>{const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');assert.ok(app.includes('"Received by parties (disclosed)"'));assert.ok(app.includes('"Receipts counted"'));assert.doesNotMatch(app,/"Given \(disclosed\)"|"Donations counted"/)})

test('follow-up claims and mismatched periods are dropped without replacement',async()=>{
 const p=withLead(framing.follow_up.unsafe_answer)
 p.context=[{author:'user',text:framing.follow_up.previous_question}]
 const out=await(await api.withAnswerLanguage(Response.json(p),framing.follow_up.question)).json()
 assert.ok(out.answer.includes(lead));assert.ok(!out.answer.includes(framing.follow_up.unsafe_answer))
 const wrong='Across disclosed returns from 2023–24 in OPAX’s published selection, Labor disclosed $90,000,000 in receipts from Example Bank Ltd.'
 assert.doesNotMatch(api.withReceiptWording(payload(wrong),'').answer,/2023|90,000,000/)
})

test('jurisdiction and recipient scope come from the record, not an entity name',()=>{
 const s={...source(),title:'Victorian Example Bank Ltd federal return'}
 assert.equal(api.withReceiptWording(payload('Example Bank Ltd props up Labor with $90,000,000.',[s]),'').answer.includes('props up'),false)
 const conflict={...source(),url:'/money?jur=federal&party=party%3ALiberal'}
 const out=api.withReceiptWording(payload(lead,[conflict]),'')
 assert.doesNotMatch(out.answer,/90,000,000|Labor/)
})
