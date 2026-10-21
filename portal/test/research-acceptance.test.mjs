import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {gradeRow} from '../../scripts/research_eval_grade.mjs'
const bundled=await build({stdin:{contents:"export * from './src/research-response';export * from './src/research-writing';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']})
const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'))
const forbidden=/\b(?:tools?|lookups?|calculators?|unknown[- ]range|coverage tools?|pipeline)\b/i
const source=(resource,snippet)=>({resource,slug:'',title:'Selected record',href:'https://example.org/record',url:'https://example.org/record',snippet,cited:true,kind:'record'})
const text='Example Party received $165,050.\n\nThese are party receipts, not all gifts ; the amounts are lower bounds, and the period maps to an unknown-range coverage tool.'
const payload={answer:text,citations:{'fact/t/body/0':[[0,Array.from(text).length]]},sources:[source('fact','Example Party: $165,050. Coverage: This is a published selection, not an exhaustive total.')]}
test('acceptance plain language: JSON and chunked SSE/cache replay never release internal answer language',async()=>{
 for(const streaming of [false,true]){
  const wire='event: delta\ndata: '+JSON.stringify({text})+'\n\nevent: done\ndata: '+JSON.stringify(payload)+'\n\n'
  const input=streaming?new Response(new ReadableStream({start(c){const b=new TextEncoder().encode(wire);for(let i=0;i<b.length;i+=7)c.enqueue(b.slice(i,i+7));c.close()}}),{headers:{'content-type':'text/event-stream','x-opax-cache':'HIT'}}):Response.json(payload)
  assert.equal(typeof api.withAnswerLanguage,'function')
  const response=await api.withAnswerLanguage(input),body=await response.text()
  if(streaming)assert.doesNotMatch(body,/event: delta/)
  const out=streaming?JSON.parse(body.match(/^data: (.+)$/m)[1]):JSON.parse(body)
  assert.doesNotMatch(out.answer,forbidden);assert.doesNotMatch(out.answer,/\s+[;,.!?]|,\./)
  assert.match(out.answer,/Example Party received \$165,050/)
  assert.ok(Object.values(out.citations).flat().every(([a,b])=>a>=0&&a<b&&b<=Array.from(out.answer).length))
 }
})
test('acceptance plain language: fallback keeps a supported coverage limitation in ordinary words',()=>{
 const out=api.proseFallback({question:'What is the median age in Example in 2005?',period:{kind:'all',label:''},facts:[{id:1,text:'The available lookup cannot establish the median age in Example in 2005.',source:source('f','The available lookup cannot establish the median age in Example in 2005.'),coverage:true}]})
 assert.doesNotMatch(out.answer,forbidden)
})
test('acceptance plain language: punctuation repair preserves Unicode citation anchors and literal quotes',async()=>{
 const answer='🏠 Avery Example received $100,000 , and Blake Sample received $200,000,.',start=Array.from(answer.slice(0,answer.indexOf('Blake'))).length
 const input={answer,citations:{'b/t/body/0':[[start,Array.from(answer).length]]},sources:[source('b','Blake Sample: $200,000.')]}
 const out=await(await api.withAnswerLanguage(Response.json(input))).json()
 assert.match(out.answer,/\$100,000, and/);assert.match(out.answer,/\$200,000\.$/)
 assert.match(Array.from(out.answer).slice(...out.citations['b/t/body/0'][0]).join(''),/^Blake Sample/)
})
test('acceptance components: a combined two-year total cannot stand in for two yearly counts in either arm',()=>{
 const question={kind:'comparison',question:'Compare immigration speeches in 2023 and 2024.',must:[{type:'required_components'}]}
 const combined='1800 chamber speeches labelled immigration from 2023-01-01 to 2024-12-31.'
 const record={answer:combined,sources:[source('f',combined)],citations:{'f/t/body/0':[[0,combined.length]]}}
 assert.equal(gradeRow(question,record).axes.required_components,'fail')
 const perYear='2023 recorded 815 immigration speeches, compared with 985 in 2024.'
 const complete={answer:perYear,sources:[source('a','2023: 815 chamber speeches labelled immigration.'),source('b','2024: 985 chamber speeches labelled immigration.')],citations:{'a/t/body/0':[[0,perYear.length]],'b/t/body/0':[[0,perYear.length]]}}
 assert.equal(gradeRow(question,complete).axes.required_components,'pass')
})
test('acceptance repair: a bad financial clause is removed without losing the supported claim',async()=>{
 const answer='Avery Example received $100,000, and Blake Sample received $999,999.'
 const input={answer,citations:{'a/t/body/0':[[0,answer.length]]},sources:[source('a','Avery Example: $100,000.')]}
 const out=await(await api.withAnswerLanguage(Response.json(input),'What did Avery Example receive?')).json()
 assert.match(out.answer,/Avery Example received \$100,000/);assert.doesNotMatch(out.answer,/Blake Sample|999,999/)
})
test('acceptance language: punctuation inside a retained literal quotation is unchanged',async()=>{
 const answer='Avery Example said “a phrase , exactly as recorded”.'
 const input={answer,citations:{'s/t/body/0':[[0,answer.length]]},sources:[source('s','a phrase , exactly as recorded')]}
 const out=await(await api.withAnswerLanguage(Response.json(input))).json()
 assert.equal(out.answer,answer)
})
test('acceptance SSE: a clean completion cannot authorize different unsafe delta text',async()=>{
 const clean={...payload,answer:'Example Party received $165,050.'}
 const wire='event: delta\ndata: '+JSON.stringify({text:'The unknown-range coverage tool returned this.'})+'\n\nevent: done\ndata: '+JSON.stringify(clean)+'\n\n'
 const out=await(await api.withAnswerLanguage(new Response(wire,{headers:{'content-type':'text/event-stream'}}))).text()
 assert.doesNotMatch(out,/event: delta|unknown-range|coverage tool/)
})
