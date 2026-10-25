import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {build} from 'esbuild'
const b=await build({stdin:{contents:"export {extractNamedScope,inferPeriod,runAgentic} from './src/agentic-ask';export * from './src/ask-constraints';export * from './src/research-response';export {resolvePartySubject} from './src/ask-party-subject';export {federalPartyRankingQuestion} from './src/ask-money-routing';export {agenticAskPayload} from './src/agentic-response';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))
const roster=JSON.parse(fs.readFileSync(new URL('../public/parliamentarians.json',import.meta.url))),hanson=JSON.parse(fs.readFileSync(new URL('./fixtures/research-coherence-pauline.json',import.meta.url)))
const cases=[
 ['computed party owner','Who donated most to the party of the federal MP who made the most speeches about housing?','clarification'],
 ['pandemic review','Who gave the most money to Barnaby Joyce’s party during the pandemic?','clarification'],
 ['historical membership',"Who gave the most money to Barnaby Joyce's party when he was in the Nationals?",'clarification'],
 ['before pandemic',"Who gave the most money to Pauline Hanson's party before the pandemic?",'clarification'],
 ['election period',"Who gave the most money to Pauline Hanson's party around the last election?",'clarification'],
 ['lockdown period',"Who gave the most money to Pauline Hanson's party during lockdown?",'clarification'],
 ['extra adverb',"Who usually gives the most money to Pauline Hanson's party?",'clarification'],
 ['non-allowlisted funds',"Who funds Mark Butler's party?",'clarification'],
 ['allowlist financial year',"Who gave the most money to Pauline Hanson's party in 2013–14?",'clarification'],
 ['allowlist explicit federal',"Who gives the most money to Pauline Hanson's party in federal disclosures?",'clarification'],
 ['allowlist explicit state',"Top donors to the party of Pauline Hanson in Queensland disclosures?",'clarification'],
 ['historical affiliation review','Who gave the most money to Barnaby Joyce’s party in 2013?','clarification'],
 ['independent review','Who funds David Pocock’s party?','clarification'],
 ['common word review','Who funds the party of cash?','clarification'],
 ['exact production',"Who does Pauline Hanson's party take the most money from?",'answer'],
 ['canonical roster slug',"Who does pauline-hanson's party take the most money from?",'answer'],
 ['Hanson year',"Who gave the most money to Pauline Hanson's party in 2013?",'clarification'],
 ['surname only',"Who gives the most to Albanese's party",'clarification'],
 ['speech person',"What did Pauline Hanson's speech say?",'person'],
 ...["Who funds the party of price?","Who funds the party of wood?","Who funds the party of Cash?","Who funds Hanson's party?","Who funds Pauline Hanson's party in 2013–14?","Who funds Pauline Hanson's party from 2013-01-01 to 2013-06-30?","Who funds Pauline Hanson's party back then?","Who funds the party of Pauline Hanson last year?","Who funds Pauline Hanson's party in July?"].map(q=>[q,q,'clarification'])
]
for(const [label,question,decision] of cases)for(const sse of [false,true])for(const cache of [false,true])for(const fallback of [false,true])test(`strict party ${label} SSE=${sse} cache=${cache} fallback=${fallback}`,async()=>{
 const named=api.extractNamedScope(question,roster,null),scope=api.extractAskConstraints(question,api.inferPeriod(question),named)
 if(api.federalPartyRankingQuestion(question)){
  const forbidden=async()=>{throw Error('The family route cannot call a model')},asset=async path=>JSON.parse(fs.readFileSync(new URL('../public'+path,import.meta.url)))
  const run=await api.runAgentic(question,{asset,kb:forbidden,generate:forbidden,research:forbidden},async()=>{},10000,api.inferPeriod(question),{},named),out=api.agenticAskPayload(run,question)
  assert.equal(out.money_route,'federal-party-ranking-v1');assert.ok(['calculated','evidence_gap','needs_period','needs_scope'].includes(out.answer_status));if(out.answer_status==='calculated'){assert.match(out.answer,/largest disclosed receipts/);assert.match(out.answer,/\| Donor \|/)}
  return
 }
 let payload
 if(decision==='clarification'){
  assert.equal(named.partyClarification,true);assert.deepEqual(named.people,[]);assert.deepEqual(named.parties,[])
  let calls=0;const forbidden=async()=>{calls++;throw Error('A clarification must not make tool or model calls')}
  const run=await api.runAgentic(question,{asset:forbidden,kb:forbidden,generate:forbidden,research:forbidden},async()=>{},10000,api.inferPeriod(question),{},named)
  assert.equal(calls,0);assert.equal(run.qualitative.answer_decision,'clarification');assert.match(run.qualitative.answer,/^Which party do you mean/i)
  payload={...run.qualitative,sources:structuredClone(hanson.payload.sources).map(s=>({...s,cited:true}))}
 }else if(decision==='person'){
  assert.deepEqual(named.people,['Pauline Hanson']);assert.deepEqual(named.parties,[]);assert.equal(named.partyClarification,undefined)
  const answer='Pauline Hanson said “I support the bill.”'
  payload={answer,answer_decision:'answer',answer_scope:scope,sources:[{resource:'speech-1',kind:'speech',speaker:'Pauline Hanson',snippet:'I support the bill.',cited:true}],citations:{'speech-1/t/body/0':[[0,answer.length]]}}
 }else{
  assert.deepEqual(named.people,[]);assert.deepEqual(named.parties,['One Nation']);assert.equal(named.partyClarification,undefined)
  const answer='Avery Example received $161,787.'
  payload={answer,answer_decision:'answer',answer_scope:scope,sources:structuredClone(hanson.payload.sources).map(s=>({...s,cited:true})),citations:{'fact-1/t/body/0':[[0,answer.length]]}}
 }
 if(fallback)payload={...payload,research:{mode:'planner',failure:'grounding'}}
 const headers={...(cache?{'x-opax-cache':'HIT'}:{}),...(sse?{'content-type':'text/event-stream'}:{})},response=sse?new Response('event: done\ndata: '+JSON.stringify(payload)+'\n\n',{headers}):Response.json(payload,{headers}),wire=await(await api.withAnswerLanguage(response,question)).text(),out=sse?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire)
 if(decision==='clarification'){
  assert.equal(out.answer,payload.answer);assert.equal(out.answer_decision,'clarification');assert.deepEqual(out.citations,{});assert.doesNotMatch(out.answer,/Westpac|161,787|provided the most/)
 }else if(decision==='person'){assert.equal(out.answer,payload.answer);assert.ok(out.citations['speech-1/t/body/0'])}
 else{assert.match(out.answer,/^Across disclosed returns.*Westpac.*\$161,787/);assert.ok(Object.keys(out.citations).length)}
})
for(const alias of ['Avery Example','Avery Display','avery-example'])test(`full roster name/display/slug resolves: ${alias}`,()=>{
 const r={people:[{name:'Avery Example',full:'Avery Display',slug:'avery-example',party_now:'Greens'}]}
 assert.equal(api.resolvePartySubject(`Top donors to ${alias}'s party`,r).question,'Top donors to Greens')
})
for(const label of ['Independent','independent','Unaffiliated','Not affiliated','None','',undefined])test(`non-party affiliation clarifies: ${label}`,()=>{
 assert.equal(api.resolvePartySubject("Who funds Avery Example's party?",{people:[{name:'Avery Example',party_now:label}]}).clarification,true)
})
test('a bare roster surname cannot become a full identity',()=>{
 assert.equal(api.resolvePartySubject("Who funds Cash's party?",{people:[{name:'Cash',party_now:'Liberal'}]}).clarification,true)
})
test('two roster identities with the same full display name cannot be chosen',()=>{
 assert.equal(api.resolvePartySubject("Who funds Avery Example's party?",{people:[{name:'Avery Example',pid:'one',party_now:'Greens'},{name:'Avery Example',pid:'two',party_now:'Greens'}]}).clarification,true)
})

test('a longer unrecognised slug cannot match a known slug suffix',()=>{
 assert.equal(api.resolvePartySubject("Who funds fake-pauline-hanson's party?",roster).clarification,true)
})

for(const question of ["Who gives the most money to Avery Example's party?","Which company donated the most to Avery Example's party?","Top donors to Avery Example's party", "Who does Avery Example's party take the most money from?"])test(`unqualified allowlist family: ${question}`,()=>{
 const out=api.resolvePartySubject(question,{people:[{name:'Avery Example',party_now:'Greens'}]})
 assert.equal(out.clarification,undefined);assert.equal(out.question,question.replace("Avery Example's party",'Greens'))
})
