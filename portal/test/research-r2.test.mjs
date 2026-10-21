import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {auditPayload} from '../../scripts/research_eval_audit.mjs'

const bundle=await build({stdin:{contents:"export * from './src/research-writing';export * from './src/research-response';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']})
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const source=(resource,snippet,extra={})=>({resource,snippet,slug:'',title:'Selected evidence',href:'https://example.org',url:'https://example.org',kind:'record',cited:true,...extra})
const speeches=[source('avery','I oppose the bill. The bill costs $100,000.',{kind:'speech',speaker:'Avery Example',date:'2011-03-01'}),source('blake','I support the bill.',{kind:'speech',speaker:'Blake Sample',date:'2010-03-01'})]
const payload=(answer,sources=speeches)=>({answer,sources,citations:{}})

for(const answer of [
 'Banana Alliance secured $100,000.',
 'Banana Alliance won $100,000.',
 'Banana Alliance got $100,000.',
 "Blake Sample's words were 'I oppose the bill'.",
 'Blake Sample’s words were ‘I oppose the bill’.',
 'In 2010 Avery Example discussed the bill.',
 'Avery Example said “I oppose the bill” in 2010.',
])test('r2 ownership audit and ordinary fallback reject: '+answer,async()=>{
 const input=payload(answer)
 assert.ok(auditPayload('What did they say?',input).findings.length,answer)
 const out=await(await api.withAnswerLanguage(Response.json({...input,research:{mode:'planner',failure:'grounding'}}),'What did they say?')).json()
 assert.notEqual(out.answer,answer)
 assert.equal(auditPayload('What did they say?',out).findings.length,0)
})
test('r2 one atom must support the owner, quote and date together',()=>{
 const sources=[source('early','I oppose the bill.',{kind:'speech',speaker:'Avery Example',date:'2010-03-01'}),source('late','I support the bill.',{kind:'speech',speaker:'Avery Example',date:'2011-03-01'})]
 assert.ok(auditPayload('What did Avery say?',payload('In 2011 Avery Example said “I oppose the bill”.',sources)).findings.length)
 assert.equal(auditPayload('What did Avery say?',payload('In 2010 Avery Example said “I oppose the bill”.',sources)).findings.length,0)
})
test('r2 topic, financial relationship and quotation ownership cannot be borrowed',()=>{
 const sources=[source('a','I oppose the housing bill. The bill costs $100,000.',{kind:'speech',speaker:'Avery Example',date:'2011-03-01'}),source('b','I support climate action.',{kind:'speech',speaker:'Blake Sample',date:'2010-03-01'})]
 for(const answer of ['Avery Example secured $100,000.', 'On climate, Avery Example said “I oppose the housing bill”.', 'Avery Example repeated Blake Sample’s words: “I oppose the housing bill”.'])assert.ok(auditPayload('What did they say?',payload(answer,sources)).findings.length,answer)
 for(const answer of ['Avery Example described climate policy.', 'Avery Example discussed housing, and Blake Sample described housing policy.'])assert.ok(auditPayload('What did they say?',payload(answer,sources)).findings.length,answer)
 const counts=[source('a','Avery Example: 87 chamber speeches labelled housing.'),source('b','Blake Sample: 99 chamber speeches labelled climate.')]
 assert.ok(auditPayload('Compare their speeches.',payload('Avery Example recorded 87 housing speeches, and Blake Sample recorded 99 housing speeches.',counts)).findings.length)
})
test('r2 mining period metadata survives writer and final JSON/SSE/cache audit',async()=>{
 const fact=(id,text,extra={})=>({id,text,source:source('f-'+id,text),...extra})
 const facts=[fact(1,'Labor: $165,050, 13 disclosed receipt records.'),fact(2,'Liberal: $125,483, 15 disclosed receipt records.'),fact(3,'Nationals: $82,815, 10 disclosed receipt records.'),fact(4,'Period: 2005–06.',{coverage:true}),fact(5,'Coverage: Only receipts included in the published map are ranked; this is a selection, not an exhaustive industry total.',{coverage:true})]
 const input={question:'Who gets most from mining in 2005?',period:{kind:'all',label:''},facts}
 const lead='Labor received the most disclosed mining funding in 2005–06, with $165,050.'
 const written=api.verifyWrittenAnswer({sentences:[{text:lead,facts:[1,4]}]},input)
 assert.equal(written.answer.split('\n\n')[0],lead)
 for(const p of [written,api.proseFallback(input)])for(const stream of [false,true]){
  const response=stream?new Response('event: done\ndata: '+JSON.stringify(p)+'\n\n',{headers:{'content-type':'text/event-stream','x-opax-cache':'HIT'}}):Response.json(p)
  const result=await api.withAnswerLanguage(response,input.question),wire=await result.text(),out=stream?JSON.parse(wire.match(/^data: (.+)$/m)[1]):JSON.parse(wire)
  assert.match(out.answer,/^Labor received the most .*mining funding in 2005–06, with \$165,050\./)
  assert.equal(auditPayload(input.question,out).findings.length,0)
 }
})
for(const answer of [
 'The Parliamentary Tool Bill changes reporting requirements.',
 'The Parliamentary Lookup Act changes reporting requirements.',
 'Avery Example said “This is a useful tool”.',
 'Avery Example described the tool as useful.',
])test('r2 ordinary Ask preserves legitimate titles and speech content: '+answer,async()=>{
 const sources=[source('speech','This is a useful tool. Avery Example described the tool as useful.',{kind:'speech',speaker:'Avery Example'})]
 for(const stream of [false,true]){
  const input=payload(answer,sources),response=stream?new Response('event: done\ndata: '+JSON.stringify(input)+'\n\n',{headers:{'content-type':'text/event-stream','x-opax-cache':'HIT'}}):Response.json(input)
  const wire=await(await api.withAnswerLanguage(response)).text(),out=stream?JSON.parse(wire.match(/^data: (.+)$/m)[1]):JSON.parse(wire)
  assert.equal(out.answer,answer)
 }
})
test('r2 a supported quotation survives the final grounding boundary literally',async()=>{
 const input=payload('Avery Example said “This is a useful tool”.',[source('speech','This is a useful tool',{kind:'speech',speaker:'Avery Example'})])
 const out=await(await api.withAnswerLanguage(Response.json(input),'What did Avery Example say?')).json()
 assert.equal(out.answer,input.answer)
})
test('r2 internal machinery outside titles and quotations is removed',async()=>{
 const input=payload('Labor received $165,050; the coverage tool covers an unknown range.',[source('labor','Labor: $165,050.')])
 const out=await(await api.withAnswerLanguage(Response.json(input))).json()
 assert.match(out.answer,/Labor received \$165,050/)
 assert.doesNotMatch(out.answer,/coverage tool|unknown[- ]range|[ ;] ;/i)
})
test('r2 literal single quotes can contain contractions and several sentences',async()=>{
 const quote="I can't describe this as a coverage tool. It is useful."
 const answer="Avery Example's words were '"+quote+"'."
 const input=payload(answer,[source('a',quote,{kind:'speech',speaker:'Avery Example'})])
 assert.equal(auditPayload('What did Avery say?',input).findings.length,0)
 const out=await(await api.withAnswerLanguage(Response.json(input),'What did Avery say?')).json()
 assert.equal(out.answer,answer)
 const bad=payload("Avery Example's words were 'I can't describe the bill. It is corrupt.'",input.sources)
 assert.ok(auditPayload('What did Avery say?',bad).findings.length)
})
test('r2 a calculator heading cannot trigger a second mining lead during writer repair',()=>{
 const fact=(id,text)=>({id,text,source:source('f-'+id,text)})
 const input={question:'Who gets most from mining in 2005?',period:{kind:'all',label:''},facts:[fact(1,'Labor received the most disclosed funding from mining donors in this published selection: $165,050.'),fact(2,'| Labor | $165,050 | 13 |'),fact(3,'Period: 2005–06.')]}
 const out=api.verifyWrittenAnswer({sentences:[{text:'In the 2005–06 financial year selection, Labor received the most disclosed mining funding, totaling $165,050 across 13 records.',facts:[1,2,3]}]},input)
 assert.ok(out);assert.equal((out.answer.match(/165,050/g)??[]).length,1);assert.match(out.answer,/13 records/)
})
test('r2 removed clauses cannot leave a run of full stops outside a literal quote',async()=>{
 const answer='The available records do not establish the ranking.....\n\nAvery Example said “Wait... this is a useful tool”.'
 const out=await(await api.withAnswerLanguage(Response.json(payload(answer)))).json()
 assert.match(out.answer,/ranking\.\n/);assert.match(out.answer,/“Wait\.\.\. this is a useful tool”/)
})
