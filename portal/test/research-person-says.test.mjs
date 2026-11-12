import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {runCheck} from '../../scripts/research_eval_grade.mjs'
import {auditPayload} from '../src/research-claim-audit.mjs'

const built=await build({stdin:{contents:"export * from './src/research-grounding';export * from './src/research-response';export {writingPrompt} from './src/research-writing';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'node',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const question='What would Avery Example say about housing affordability?'
const quote='Housing affordability needs more homes and lower rents.'
const source={resource:'s1',slug:'speech-1',kind:'speech',speaker:'Avery Example',date:'2022-09-27',title:'Avery Example, Housing debate, 27 September 2022',snippet:quote,cited:true,url:'https://example.org/record/1'}
const payload=(answer,extra={})=>({answer,answer_decision:'answer',sources:[structuredClone(source)],citations:{'s1/t/body/0':[[0,Array.from(answer).length]]},...extra})

for(const [label,answer,expected]of [
 ['weak topic association','Avery Example said immigration needed attention.','Avery Example said immigration needed attention.'],
 ['identity mention','The Example Housing Authority needs reform.','The Example Housing Authority needs reform.'],
 ['misquotation','Avery Example said “Housing affordability calls for affordable homes”.','Avery Example said Housing affordability calls for affordable homes.'],
 ['malformed quotation','Avery Example said “Housing affordability calls for affordable homes.','Avery Example said Housing affordability calls for affordable homes.'],
 ['unsupported date','On 4 May 2025, Avery Example said housing needs more homes.','Avery Example said housing needs more homes.'],
])test(`soft ${label} keeps the point without a citation`,()=>{
 const input=payload(answer),snapshot=structuredClone(input),out=api.groundAnswerPayload(input,question)
 assert.deepEqual(input,snapshot)
 assert.equal(out.answer,expected)
 assert.equal(out.answer_status,'uncited')
 assert.deepEqual(out.citations,{})
 assert.equal(out.sources[0].cited,false)
 assert.equal(api.groundAnswerPayload(structuredClone(out),question).answer,expected)
})

test('citation ranges split around a soft sentence while preserving Unicode and supported points',()=>{
 const first=`Avery Example said “${quote}”`,soft='The Example Housing Authority needs reform.',last='Avery Example said housing needs more homes.'
 const answer=[first,soft,last].join('\n'),out=api.groundAnswerPayload(payload(answer),question)
 assert.equal(out.answer,answer)
 assert.equal(out.answer_status,'partly_cited')
 for(const [a,b]of Object.values(out.citations).flat())assert.doesNotMatch(Array.from(out.answer).slice(a,b).join(''),/Example Housing Authority/)
 assert.ok(out.citations['s1/t/body/0'].length>=2)
})

test('an existing loose survivor stays uncited through the final boundary',()=>{
 const answer='Avery Example called for affordable housing.',out=api.groundAnswerPayload(payload(answer,{answer_status:'uncited',citations:{},sources:[{...source,cited:false}]}),question)
 assert.equal(out.answer,answer);assert.equal(out.answer_status,'uncited');assert.deepEqual(out.citations,{})
})

test('a pronoun-led date and figure bind to the one selected speaker, as in the local Hanson trace',()=>{
 const answer='She told the Senate on 27 September 2022 that housing is “primarily a problem of supply”.\nOn 27 September 2022 she argued housing needed attention, citing 5,360 foreign purchases in 2021-22.'
 const s={...source,snippet:'Housing is primarily a problem of supply. There were 5,360 foreign purchases in 2021-22.'}
 assert.deepEqual(auditPayload(question,payload(answer,{sources:[s]})).findings,[])
 const out=api.groundAnswerPayload(payload(answer,{sources:[s]}),question)
 assert.match(out.answer,/27 September 2022/);assert.match(out.answer,/5,360/);assert.ok(out.citations['s1/t/body/0'])
})

for(const stream of [false,true])test('malformed quotes are repaired before JSON/SSE language cleanup: '+stream,async()=>{
 const p=payload('Avery Example said “Housing needs more homes.'),headers={'content-type':'text/event-stream'}
 const response=stream?new Response('event: done\ndata: '+JSON.stringify(p)+'\n\n',{headers}):Response.json(p)
 const wire=await(await api.withAnswerLanguage(response,question)).text(),out=stream?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire)
 assert.equal(out.answer,'Avery Example said Housing needs more homes.');assert.equal(out.answer_status,'uncited')
})

for(const [label,answer]of [
 ['fabricated figure','Avery Example said housing needs 987654 more homes.'],
 ['wrong speaker',`Blake Sample said “${quote}”`],
 ['unattributed influence','Donations bought votes on housing.'],
 ['SA placeholder','Avery Example said “Excerpt omitted; see the official record.”'],
])test(`hard ${label} yields attributed, dated source words`,()=>{
 const out=api.groundAnswerPayload(payload(answer),question)
 assert.match(out.answer,/Avery Example said/);assert.match(out.answer,/27 September 2022/)
 assert.ok(out.answer.includes(`“${quote}”`));assert.doesNotMatch(out.answer,/987654|Blake Sample|bought votes|Excerpt omitted|The record dated/)
 assert.ok(out.citations['s1/t/body/0'])
})

test('a figure in selected evidence with a weak association stays uncited',()=>{
 const s={...source,snippet:quote+' We need 120 more homes.'},answer='Avery Example said 120 people supported immigration reform.'
 const out=api.groundAnswerPayload(payload(answer,{sources:[s]}),question)
 assert.match(out.answer,/120 people/);assert.equal(out.answer_status,'uncited');assert.deepEqual(out.citations,{})
})

test('a wrong date on a recorded personal payment removes only the date phrase',()=>{
 const s={...source,snippet:'I received $100,000.'},answer='In 2025, Avery Example received $100,000.'
 const out=api.groundAnswerPayload(payload(answer,{sources:[s]}),'What did Avery Example receive?')
 assert.equal(out.answer,'Avery Example received $100,000.');assert.equal(out.answer_status,'uncited');assert.deepEqual(out.citations,{})
})

test('a wrong party adjective is repaired while preserving the citation',()=>{
 const answer=`Liberal Avery Example said “${quote}”`,out=api.groundAnswerPayload(payload(answer,{sources:[{...source,party:'Labor'}]}),question)
 assert.equal(out.answer,`Avery Example said “${quote}”`);assert.ok(out.citations['s1/t/body/0'])
})

test('a name match alone is not an on-topic passage',()=>{
 const s={...source,snippet:'Avery Example thanked the committee for its work.'},answer='The record dated 27 September 2022 is '+s.title+'.'
 const out=api.groundAnswerPayload(payload(answer,{sources:[s]}),question)
 assert.equal(out.answer_decision,'limitation');assert.match(out.answer,/selected speeches.*do not mention housing affordability directly/i)
 assert.doesNotMatch(out.answer,/The record dated/);assert.deepEqual(out.citations,{})
})

test('excerpt selection uses the topic rather than the speaker name',()=>{
 const s={...source,snippet:'Avery Example thanked the committee for its work. '+quote},out=api.groundAnswerPayload(payload('',{sources:[s]}),question)
 assert.ok(out.answer.includes(`“${quote}”`));assert.doesNotMatch(out.answer,/thanked the committee/)
})

test('person fallback gives every cited record its own dated quotation',()=>{
 const sources=Array.from({length:5},(_,i)=>({...source,resource:'s'+i,date:`202${i}-09-27`}))
 const out=api.groundAnswerPayload(payload('',{sources}),question)
 assert.equal(out.sources.length,5);assert.equal(Object.keys(out.citations).length,5)
 assert.equal((out.answer.match(/said “/g)??[]).length,5)
})

test('a legacy cache title is repaired even when the boundary has no question',async()=>{
 const answer='The record dated 27 September 2022 is '+source.title+'.'
 const out=await(await api.withAnswerLanguage(Response.json(payload(answer)))).json()
 assert.ok(out.answer.includes(`“${quote}”`));assert.doesNotMatch(out.answer,/The record dated/)
})

for(const decision of ['refusal','clarification'])test('legacy titles carry a plain limitation through a protected decision: '+decision,()=>{
 const answer='The record dated 27 September 2022 is '+source.title+'.'
 const out=api.groundAnswerPayload(payload(answer,{answer_decision:decision}),question)
 assert.equal(out.answer_decision,decision);assert.doesNotMatch(out.answer,/The record dated/);assert.deepEqual(out.citations,{})
})

for(const q of [question,'What has Avery Example said about housing affordability?','What does Avery Example think about housing affordability?','What has parliament said about housing affordability?'])test('empty passage fallback quotes what was said: '+q,()=>{
 const out=api.groundAnswerPayload(payload(''),q)
 assert.ok(out.answer.includes(`“${quote}”`));assert.match(out.answer,/Avery Example said/);assert.match(out.answer,/27 September 2022/)
 assert.doesNotMatch(out.answer,/The record dated/)
})

for(const stream of [false,true])for(const cache of [false,true])for(const fallback of [false,true])test(`legacy title recovery: SSE=${stream} cache=${cache} fallback=${fallback}`,async()=>{
 const answer='The record dated 27 September 2022 is '+source.title+'.',p=payload(answer,{...(fallback?{research:{mode:'planner',failure:'grounding'}}:{})})
 const headers={...(stream?{'content-type':'text/event-stream'}:{}),...(cache?{'x-opax-cache':'HIT'}:{})}
 const response=stream?new Response('event: delta\ndata: '+JSON.stringify({text:answer})+'\n\nevent: done\ndata: '+JSON.stringify(p)+'\n\n',{headers}):Response.json(p,{headers})
 const wire=await(await api.withAnswerLanguage(response,question)).text(),out=stream?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire)
 assert.ok(out.answer.includes(`“${quote}”`));assert.doesNotMatch(out.answer,/The record dated/)
 if(stream)assert.doesNotMatch(wire,/event: delta/)
 assert.equal(api.groundAnswerPayload(out,question).answer,out.answer)
})

test('both writers describe hypothetical questions as documented positions',()=>{
 const prompt=JSON.parse(api.writingPrompt({question,period:{kind:'all',label:''},facts:[]}))
 assert.match(prompt.contract,/what would.*say\/think/i);assert.match(prompt.contract,/Going by.*record/)
 assert.match(prompt.contract,/on-topic words/)
})

test('person statement eval rejects title lists, unrelated quotes and the wrong speaker',()=>{
 const c={type:'person_statement',person:'Avery Example',topic:'housing affordability'}
 const check=(answer,sources=[source])=>runCheck(c,{answer,payload:{answer,sources},ev:{entries:[],cited:[]}}).status
 assert.equal(check(`On 27 September 2022, Avery Example said “${quote}”`),'pass')
 assert.equal(check('Avery Example called for more homes to improve housing affordability.'),'pass')
 assert.equal(check('The record dated 27 September 2022 is '+source.title+'.'),'fail')
 assert.equal(check('Avery Example said “Thank you for your work”.'),'fail')
 assert.equal(check(`Blake Sample said “${quote}”`),'fail')
})
