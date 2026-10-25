// Review r2 controls precede the structural fix. No provider or network calls.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {build} from 'esbuild'
import {MockLanguageModelV4} from 'ai/test'
import {auditPayload,sentenceParts} from '../src/research-claim-audit.mjs'
const built=await build({stdin:{contents:"export * from './src/research-grounding';export * from './src/research-response';export * from './src/research-writing';export * from './src/research-writer';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const hanson=JSON.parse(fs.readFileSync(new URL('./fixtures/research-coherence-pauline.json',import.meta.url))),question='Who gives the most money to One Nation?'
const variants=[
 'The selected records are insufficient to determine a reliable receipt ranking.',
 'Which financial year do you mean? Please specify the period before I rank receipt sources.',
 'This sample leaves the identity of the leading receipt source unresolved.',
 'I need the recipient and financial year before making that comparison.',
 'Would you like federal returns or Queensland disclosures?',
]
for(const answer of variants)for(const stream of [false,true])for(const cache of [false,true])for(const fallback of [false,true])test(`no draft figures: ${answer} SSE=${stream} cache=${cache} fallback=${fallback}`,async()=>{
 const p={answer,citations:{},sources:structuredClone(hanson.payload.sources),...(fallback?{research:{mode:'planner',failure:'grounding'}}:{})},headers={...(cache?{'x-opax-cache':'HIT'}:{}),...(stream?{'content-type':'text/event-stream'}:{})}
 const response=stream?new Response('event: done\ndata: '+JSON.stringify(p)+'\n\n',{headers}):Response.json(p,{headers})
 const wire=await(await api.withAnswerLanguage(response,question)).text(),out=stream?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire)
 assert.equal(out.answer,answer);assert.deepEqual(out.citations,{});assert.equal(out.answer_decision,'preserve')
 assert.equal(api.groundAnswerPayload(out,question).answer,answer)
})
test('explicit answer metadata cannot invent permission to rank a figure-free draft',()=>{
 const answer=variants[0],out=api.groundAnswerPayload({answer,answer_decision:'answer',citations:{},sources:structuredClone(hanson.payload.sources)},question)
 assert.equal(out.answer,answer)
})
test('a typed refusal is protected before the legacy mixed-answer prefix cleanup',()=>{
 const first='OPAX cannot establish the requested answer from the selected records.',point='David Pocock questioned the three ads per hour figure.',answer=first+'\n\n'+point
 const p={answer,answer_decision:'refusal',sources:[{resource:'s',kind:'speech',speaker:'David Pocock',title:'Gambling reform',snippet:point,cited:true}],citations:{'s/t/body/0':[[first.length+2,answer.length]]}}
 assert.equal(api.groundAnswerPayload(p,'What did David Pocock say about the gambling bill?').answer,answer)
})
test('a supported lower donor is not an audit rejection permitting a new ranked answer',()=>{
 const answer='National Australia Bank provided disclosed funding: $19,715.',out=api.groundAnswerPayload({answer,sources:structuredClone(hanson.payload.sources),citations:{'fact-5/t/body/0':[[0,answer.length]]}},question)
 assert.doesNotMatch(out.answer,/Westpac/);assert.match(out.answer,/National Australia Bank/)
})
test('an unrelated rejected amount cannot authorize a selected donor ranking',()=>{
 const answer='Avery Example received $999,999.',out=api.groundAnswerPayload({answer,sources:structuredClone(hanson.payload.sources),citations:{'fact-1/t/body/0':[[0,answer.length]]}},question)
 assert.doesNotMatch(out.answer,/Westpac|161,787/)
})
test('a rejected figure cited to a matching selected ranking fact can be repaired',()=>{
 const answer='Avery Example received $161,787.',out=api.groundAnswerPayload({answer,sources:structuredClone(hanson.payload.sources),citations:{'fact-1/t/body/0':[[0,answer.length]]}},question)
 assert.match(out.answer,/Westpac Banking Corporation.*161,787/);assert.equal(auditPayload(question,out).findings.length,0)
})
for(const decision of ['clarification',undefined,'answer'])test(`writer figure-free decision survives without a retry: ${decision??'legacy'}`,async()=>{
 const answer=variants[1],model=new MockLanguageModelV4({doGenerate:()=>({content:[{type:'text',text:JSON.stringify({answer_decision:decision,sentences:[{text:answer,facts:[1]}]})}],finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:10},outputTokens:{total:10}},warnings:[]})})
 const facts=hanson.payload.sources.flatMap((source,i)=>source.snippet.split('\n').map((text,j)=>({id:i*100+j+1,text,source,coverage:source.resource==='coverage'})))
 const write=api.createAnswerWriter({model,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})}}),stats={rounds:1,tokens:{input:0,output:0}}
 const out=await write({question,period:{kind:'all',label:''},facts},stats,undefined,3000)
 assert.equal(out.answer,answer);assert.equal(out.answer_decision,decision==='clarification'?'clarification':'preserve');assert.equal(model.doGenerateCalls.length,1)
})
test('GOLD-M03 monetary sentences cite selected supporting records or are omitted',()=>{
 const f=JSON.parse(fs.readFileSync(new URL('./fixtures/research-coherence-m03.json',import.meta.url))),input=structuredClone(f.payload),snapshot=structuredClone(input),out=api.groundAnswerPayload(input,f.question)
 assert.deepEqual(input,snapshot,'citation repairs must not mutate the cached input')
 assert.doesNotMatch(out.answer,/\$3 million/);assert.match(out.answer,/\$10 million/);assert.match(out.answer,/\$5 million/)
 for(const sentence of sentenceParts(out.answer).filter(p=>/\$/.test(p.text))){
  const start=Array.from(out.answer.slice(0,sentence.at)).length,end=start+Array.from(sentence.text).length
  const keys=Object.entries(out.citations).filter(([,ranges])=>ranges.some(([a,b])=>a<end&&b>start)).map(([id])=>id)
  assert.ok(keys.length,sentence.text)
  const sources=out.sources.filter(s=>s.cited&&keys.some(id=>id===s.resource||id.startsWith(s.resource+'/')))
  assert.ok(sources.length);assert.equal(auditPayload(f.question,{answer:sentence.text,citations:{},sources}).findings.length,0)
 }
 const again=api.groundAnswerPayload(structuredClone(out),f.question)
 assert.equal(again.answer,out.answer);assert.deepEqual(again.citations,out.citations)
})
for(const text of ['Bill Shorten said “I support the bill”.','Westpac bought One Nation votes.'])test('typed writer decisions still reject an unsafe claim: '+text,async()=>{
 const model=new MockLanguageModelV4({doGenerate:()=>({content:[{type:'text',text:JSON.stringify({answer_decision:'refusal',sentences:[{text,facts:[1]}]})}],finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:10},outputTokens:{total:10}},warnings:[]})}),source={resource:'s',kind:'speech',speaker:'Avery Example',snippet:'Bill Shorten asked a question. I support the bill.',title:'Selected speech',cited:true}
 const write=api.createAnswerWriter({model,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})}}),out=await write({question,period:{kind:'all',label:''},facts:[{id:1,text:source.snippet,source}]},{rounds:1,tokens:{input:0,output:0}},undefined,3000)
 assert.doesNotMatch(out.answer,/Bill Shorten said|Westpac bought|provided the most/);assert.equal(out.answer_decision,'refusal');assert.equal(model.doGenerateCalls.length,1)
})
for(const text of ['Avery Example received $999,999.','National Australia Bank provided disclosed funding: $19,715.'])test('writer retries cannot reconstruct without a rejected ranking figure: '+text,async()=>{
 const model=new MockLanguageModelV4({doGenerate:()=>({content:[{type:'text',text:JSON.stringify({answer_decision:'answer',sentences:[{text,facts:[1,201]}]})}],finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:10},outputTokens:{total:10}},warnings:[]})})
 const facts=hanson.payload.sources.flatMap((source,i)=>source.snippet.split('\n').map((text,j)=>({id:i*100+j+1,text,source,coverage:source.resource==='coverage'})))
 const write=api.createAnswerWriter({model,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})}}),out=await write({question,period:{kind:'all',label:''},facts},{rounds:1,tokens:{input:0,output:0}},undefined,3000)
 assert.doesNotMatch(out.answer,/Westpac|161,787|999,999|provided the most/);assert.equal(out.answer_decision,'limitation')
})
