import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {build} from 'esbuild'
import {auditPayload} from '../src/research-claim-audit.mjs'
const b=await build({stdin:{contents:"export {extractNamedScope,inferPeriod,runAgentic} from './src/agentic-ask';export * from './src/ask-constraints';export * from './src/research-grounding';export * from './src/research-response';export * from './src/research-writing';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))
const roster=JSON.parse(fs.readFileSync(new URL('../public/parliamentarians.json',import.meta.url)))
const question="Who does Pauline Hanson's party take the most money from?"
for(const q of [question,'Who does the party of Pauline Hanson take the most money from?',"who gives the most to Anthony Albanese's party",'Top donors to PHON'])test(`party subject from current roster: ${q}`,()=>{
 const n=api.extractNamedScope(q,roster,null),c=api.extractAskConstraints(q,api.inferPeriod(q),n)
 assert.deepEqual(n.people,[]);assert.deepEqual(n.parties,[q.includes('Albanese')?'Labor':'One Nation']);assert.equal(n.ambiguous,false);assert.equal(n.unresolved,false);assert.equal(c.party,n.parties[0]);assert.deepEqual(c.people,[])
 const args=api.constrainStep({tool:'party_donations',args:{}},c,{party:{},speaker:{}}).args
 assert.equal(args.party,n.parties[0]);assert.equal(args.speaker,undefined)
})
for(const q of ["Who funds Adam Bandt's party?","Who funds Avery Unknown's party?","Who funds Smith's party?"])test(`missing or ambiguous current party clarifies before research: ${q}`,async()=>{
 let calls=0;const scope=api.extractNamedScope(q,roster,null)
 const result=await api.runAgentic(q,{asset:async()=>null,kb:async()=>{calls++;throw Error('no lookup')},generate:async()=>{calls++;throw Error('no model')},research:async()=>{calls++;throw Error('no research')}},async()=>{},10000,api.inferPeriod(q),{},scope)
 assert.equal(result.qualitative?.answer_decision,'clarification');assert.match(result.qualitative.answer,/which party/i);assert.equal(calls,0)
})
test('party mapping uses arbitrary current roster entries and never a historical party',()=>{
 const r={people:[{name:'Avery Example',party:'Liberal',party_now:'Greens'}]},n=api.extractNamedScope("Top donors to Avery Example’s party",r,null)
 assert.deepEqual(n.people,[]);assert.deepEqual(n.parties,['Greens'])
})
const hanson=JSON.parse(fs.readFileSync(new URL('./fixtures/research-coherence-pauline.json',import.meta.url)))
for(const sse of [false,true])for(const cache of [false,true])for(const fallback of [false,true])test(`resolved party repair JSON/SSE cache/fallback: ${sse}/${cache}/${fallback}`,async()=>{
 const named=api.extractNamedScope(question,roster,null),scope=api.extractAskConstraints(question,api.inferPeriod(question),named),answer='Avery Example received $161,787.',payload={answer,answer_decision:'answer',answer_scope:scope,sources:structuredClone(hanson.payload.sources).map(s=>({...s,cited:true})),citations:{'fact-1/t/body/0':[[0,answer.length]]},...(fallback?{research:{mode:'planner'}}:{})}
 const headers={...(cache?{'x-opax-cache':'HIT'}:{}),...(sse?{'content-type':'text/event-stream'}:{})},response=sse?new Response('event: done\ndata: '+JSON.stringify(payload)+'\n\n',{headers}):Response.json(payload,{headers})
 const wire=await(await api.withAnswerLanguage(response,question)).text(),out=sse?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire)
 assert.match(out.answer.split('\n')[0],/Westpac.*\$161,787/);assert.match(out.answer,/Across disclosed returns/);assert.ok(Object.keys(out.citations).length)
})
const coverageQuestion='Who gave the most money to One Nation in 1990?'
const bad='The requested period is 1990-01-01 to 1990-12-31. This tool covers an unknown start to an unknown end, as of an unknown date. Coverage dates unavailable. It cannot establish the answer for the requested period; no current figures have been substituted.'
const coverageSources=[{resource:'fact-1',kind:'record',cited:true,url:'/money/party/One%20Nation',snippet:bad},{resource:'coverage',kind:'record',cited:true,url:'/money/party/One%20Nation',snippet:'Federal AEC donation returns, financial years 1998-99 to 2025-26, in the published selection of the 250 largest donors (so totals are lower bounds).'}]
const expected="OPAX's federal donation records start in 1998-99, so they can't show who gave the most money to One Nation in 1990."
for(const sse of [false,true])for(const cache of [false,true])for(const fallback of [false,true])test(`plain known coverage on JSON/SSE cache/fallback: ${sse}/${cache}/${fallback}`,async()=>{
 const answer='- '+bad+'\n- '+bad,payload={answer,answer_decision:'limitation',sources:coverageSources,citations:{'fact-1/t/body/0':[[2,answer.length]]},...(fallback?{research:{mode:'planner'}}:{})}
 const headers={...(cache?{'x-opax-cache':'HIT'}:{}),...(sse?{'content-type':'text/event-stream'}:{})},response=sse?new Response('event: done\ndata: '+JSON.stringify(payload)+'\n\n',{headers}):Response.json(payload,{headers})
 const wire=await(await api.withAnswerLanguage(response,coverageQuestion)).text(),out=sse?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire)
 assert.equal(out.answer,expected);assert.deepEqual(auditPayload(coverageQuestion,out).findings,[]);assert.deepEqual(Object.keys(out.citations),['coverage/t/body/0','fact-1/t/body/0']);assert.equal(out.answer_decision,'limitation')
})
test('coverage fallback uses the known start once, without implementation language',()=>{
 const out=api.proseFallback({question:coverageQuestion,period:api.inferPeriod(coverageQuestion),facts:coverageSources.map((source,i)=>({id:i+1,text:source.snippet,coverage:true,source}))})
 assert.equal(out.answer,expected);assert.doesNotMatch(out.answer,/unknown|tool|lookup|covers an/)
 const c=api.extractAskConstraints(coverageQuestion,api.inferPeriod(coverageQuestion),{people:[],parties:['One Nation'],bills:[],ambiguous:false,unresolved:false})
 const result=api.guardToolPeriod({tool:'party_donations',ok:true,data:{rows:[]},cite:[],notes:[coverageSources[1].snippet]},{tool:'party_donations',args:{party:'One Nation'}},c)
 assert.equal(result.coverage.since,'1998-07-01');assert.doesNotMatch(result.cite[0].label,/unknown start|unknown end|unknown date|tool/)
})
test('a calculated party owner now requires an explicit party',()=>{
 const q='Who donated most to the party of the federal MP who made the most speeches about housing?',n=api.extractNamedScope(q,roster,null)
 assert.equal(n.partyClarification,true);assert.equal(n.resolvedQuestion,undefined)
})
test('an official party name containing its founder does not introduce a person filter',()=>{
 const n=api.extractNamedScope(question,{people:[{name:'Pauline Hanson',party_now:"Pauline Hanson's One Nation"}]},null)
 assert.deepEqual(n.people,[]);assert.deepEqual(n.parties,['One Nation']);assert.equal(n.unresolved,false)
})
test('two full identities sharing a surname, or conflicting current party entries, require a party clarification',()=>{
 for(const people of [[{name:'Avery Example',party_now:'Greens'},{name:'Casey Example',party_now:'Labor'}],[{name:'Avery Example',party_now:'Greens'},{name:'Avery Example',party_now:'Labor'}]]){
  assert.equal(api.extractNamedScope("Top donors to Example's party",{people},null).partyClarification,true)
 }
})
for(const q of ['Top donors to PHON',"Who does Pauline Hanson's One Nation take the most money from?"])test(`One Nation party aliases share the ranking allowlist: ${q}`,()=>{
 const named=api.extractNamedScope(q,roster,null),scope=api.extractAskConstraints(q,api.inferPeriod(q),named),answer='Avery Example received $161,787.'
 const out=api.groundAnswerPayload({answer,answer_decision:'answer',answer_scope:scope,sources:structuredClone(hanson.payload.sources).map(s=>({...s,cited:true})),citations:{'fact-1/t/body/0':[[0,answer.length]]}},q)
 assert.deepEqual(named.people,[]);assert.deepEqual(named.parties,['One Nation']);assert.match(out.answer,/^Across disclosed returns.*Westpac.*\$161,787/)
})
test('donation coverage does not replace an unrelated scope refusal',()=>{
 for(const q of ['Who earned the highest salary in 1990?','Who gave the most money to One Nation in Queensland disclosures in 1990?']){
  const answer='The requested period is outside the records available for this question.'
  const out=api.groundAnswerPayload({answer,answer_decision:'limitation',sources:coverageSources,citations:{}},q)
  assert.equal(out.answer,answer)
 }
})
test('all ranking dimensions read the roster-resolved subject, preserving the rest of the question',()=>{
 const q="Who gives the most money to Victoria Example's party?",n=api.extractNamedScope(q,{people:[{name:'Victoria Example',party_now:'One Nation'}]},null),scope=api.extractAskConstraints(q,api.inferPeriod(q),n),answer='Avery Example received $161,787.'
 assert.equal(scope.jurisdiction,undefined)
 const out=api.groundAnswerPayload({answer,answer_decision:'answer',answer_scope:scope,sources:structuredClone(hanson.payload.sources).map(s=>({...s,cited:true})),citations:{'fact-1/t/body/0':[[0,answer.length]]}},q)
 assert.match(out.answer,/^Across disclosed returns.*Westpac.*\$161,787/)
})
for(const extra of [{answered:false},{answer_decision:'refusal'},{answer_decision:'clarification'},{answer_status:'moderated'}])test(`coverage explanation cannot replace a protected decision: ${JSON.stringify(extra)}`,()=>{
 const answer='The requested period needs clarification before I can answer.'
 const out=api.groundAnswerPayload({answer,sources:coverageSources,citations:{},...extra},coverageQuestion)
 assert.equal(out.answer,answer)
})
