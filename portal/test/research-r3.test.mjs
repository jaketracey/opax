import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {build} from 'esbuild'
import {auditPayload} from '../../scripts/research_eval_audit.mjs'
import {gradeRow} from '../../scripts/research_eval_grade.mjs'

const built=await build({stdin:{contents:"export * from './src/research-writing';export * from './src/research-response';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const source=(resource,snippet,extra={})=>({resource,snippet,slug:'',title:'Selected public record',href:'https://example.org',url:'https://example.org',kind:'record',cited:true,...extra})
const payload=(answer,sources)=>({answer,sources,citations:{[sources[0].resource+'/t/body/0']:[[0,Array.from(answer).length]]}})
async function boundary(input,question,{stream=false,cache=false,fallback=false}={}){
 if(fallback)input={...input,research:{mode:'planner',failure:'grounding'}}
 const headers={'content-type':'text/event-stream',...(cache?{'x-opax-cache':'HIT'}:{})}
 const response=stream?new Response('event: delta\ndata: '+JSON.stringify({text:input.answer})+'\n\nevent: done\ndata: '+JSON.stringify(input)+'\n\n',{headers}):Response.json(input,{headers:cache?{'x-opax-cache':'HIT'}:{}})
 const wire=await(await api.withAnswerLanguage(response,question)).text()
 return {wire,out:stream?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire)}
}
const speech=source('speech','Labor received $100,000.',{kind:'speech',speaker:'Avery Example'})
for(const predicate of ['was paid','secured','received','got','won','earned','was given','donated','described receiving','said they received'])test('r3 speaker is not the recipient: '+predicate,async()=>{
 const input=payload('Avery Example '+predicate+' $100,000.',[speech])
 assert.ok(auditPayload('Who received the money?',input).findings.length)
 for(const path of [{},{stream:true},{fallback:true},{stream:true,fallback:true,cache:true},{cache:true}]){
  const {out,wire}=await boundary(input,'Who received the money?',path)
  assert.doesNotMatch(out.answer,/Avery Example|100,000/)
  assert.deepEqual(out.citations,{})
  assert.ok(out.sources.every(s=>!s.cited))
  if(path.stream)assert.doesNotMatch(wire,/event: delta/)
 }
})
for(const answer of ['Avery Example said Labor received $100,000.','Avery Example said “Labor received $100,000.”.'])test('r3 a speaker still owns their reported words: '+answer,async()=>{
 const input=payload(answer,[speech])
 assert.equal(auditPayload('What did Avery say?',input).findings.length,0)
 const {out}=await boundary(input,'What did Avery say?',{stream:true,cache:true})
 assert.equal(out.answer,answer);assert.deepEqual(Object.keys(out.citations),Object.keys(input.citations))
})
test('r3 a reported recipient must still match the amount in the speech',()=>{
 const input=payload('Avery Example said Blake Sample received $100,000.',[speech,source('blake','Blake Sample: $200,000.')])
 assert.ok(auditPayload('What did Avery say?',input).findings.length)
})
test('r3 a named donor cannot borrow a receipt with an unknown donor',()=>{
 const input=payload('Avery Example donated $100,000 to Labor.',[speech])
 assert.ok(auditPayload('Who donated the money?',input).findings.length)
})
test('r3 a purpose after the amount cannot replace a named receipt subject',()=>{
 for(const answer of ['Avery Example was given $100,000 to fund Labor.','Avery Example received $100,000 to support Labor.'])assert.ok(auditPayload('Who received the money?',payload(answer,[speech])).findings.length)
})
test('r3 every recipient in a coordinated list must own that amount in the same evidence',()=>{
 const answer='A Senate passage says $100,000 went to Labor, Liberal and Banana Alliance parties in 2017-18.'
 const a=source('a','The industry donated $100,000 to Labor and Liberal in 2017-18.',{kind:'speech',speaker:'Avery Example',chamber:'senate'})
 const b=source('b','Banana Alliance: $200,000 in 2017-18.')
 const p=payload(answer,[a,b]);p.citations['b/t/body/0']=[[0,answer.length]]
 assert.ok(auditPayload('Who received the money?',p).findings.some(f=>f.type==='figure'&&f.entity==='Banana Alliance'))
})
test('r3 a proposed office budget is not a personal receipt',()=>{
 assert.ok(auditPayload('Who received the money?',payload('Avery Example received $100,000.',[{...speech,snippet:'Avery Example has a $100,000 office budget.'}])).findings.length)
})
test('r3 explicit first-person financial evidence can establish the speaker as recipient or donor',()=>{
 for(const [answer,snippet]of [['Avery Example was paid $100,000.','I was paid $100,000.'],['Avery Example donated $100,000 to Labor.','I donated $100,000 to Labor.']])assert.equal(auditPayload('What did the record say?',payload(answer,[{...speech,snippet}])).findings.length,0)
 assert.ok(auditPayload('What did the record say?',payload('Avery Example was paid $100,000.',[{...speech,snippet:'I was not paid $100,000.'}])).findings.length)
})
test('r3 structured full party and donor names retain their value ownership',()=>{
 assert.equal(auditPayload('Who received the most?',payload('Fixture Australia Party received $100,000.',[source('party','Fixture Australia Party: $100,000.')])).findings.length,0)
 const text='**Fixture Holdings Pty Ltd** has the largest disclosed total to Labor in this published selection: **$100,000**.\n\n| Donor | Disclosed receipts | Records |\n| Fixture Holdings Pty Ltd | $100,000 | 2 |'
 assert.equal(auditPayload('Who gave the most to Labor?',payload('Fixture Holdings Pty Ltd provided the most disclosed funding to Labor, with $100,000.',[source('donor',text)])).findings.length,0)
})
test('r3 a chamber limitation leads ahead of ancillary pay coverage dates',async()=>{
 const answer='The selected records do not identify who the highest paid senator in 2005 was, because this export does not date chamber changes.\n\nThe records cover federal parliamentary salary entitlements from 7 December 1999 to 2026-10-19.'
 const p=payload(answer,[source('coverage',answer)])
 const {out}=await boundary(p,'Who was the highest paid senator in 2005?')
 assert.equal(out.answer,answer)
})
test('r3 a disclosure-record limitation cannot precede an already cited finding',async()=>{
 const answer='The retrieved disclosure records do not establish a complete party-by-party total.\n\nA Senate passage says Labor received $100,000.'
 const p=payload(answer,[{...speech,chamber:'senate'}])
 const {out}=await boundary(p,'What does the evidence show?')
 assert.match(out.answer,/^A Senate passage says Labor received \$100,000\./)
 assert.deepEqual(Object.keys(out.citations),Object.keys(p.citations))
})
test('r3 a moved finding makes its implied passage subject explicit',async()=>{
 const answer='The retrieved passages do not establish an exhaustive count.\n\nAnother says “I oppose the bill”.'
 const p=payload(answer,[source('p','I oppose the bill.',{kind:'speech'})])
 const {out}=await boundary(p,'What does the evidence show?')
 assert.match(out.answer,/^A selected passage says “I oppose the bill”\./)
 assert.deepEqual(Object.keys(out.citations),Object.keys(p.citations))
})
for(const [answer,s] of [
 ['The Parliamentary Tool Bill changes reporting requirements.',source('bill','The Parliamentary Tool Bill changes reporting requirements.',{kind:'bill',title:'Parliamentary Tool Bill'})],
 ['The Senate passed the measure.',source('senate','The Senate passed the measure.',{kind:'speech',speaker:'Avery Example',chamber:'senate'})],
 ['The House of Representatives passed the measure.',source('house','The House of Representatives passed the measure.',{kind:'speech',speaker:'Avery Example',chamber:'representatives'})],
 ['Labor supported the proposal.',source('party','Labor supported the proposal.',{kind:'speech',speaker:'Avery Example',party:'Labor'})],
])test('r3 a document, chamber or party is not a speaker: '+answer,async()=>{
 const input=payload(answer,[s])
 for(const stream of [false,true]){
  const {out}=await boundary(input,'What does the record show?',{stream})
  assert.equal(out.answer,answer);assert.deepEqual(out.citations,input.citations)
 }
})
const replay=JSON.parse(await readFile(new URL('./fixtures/research-r3-citation-replay.json',import.meta.url),'utf8'))
for(const [id,input]of Object.entries(replay))test('r3 identical r2 selected evidence retains every citation: '+id,async()=>{
 const question=id==='GOLD-M03'?'Which parties got gambling funding, and whose MPs spoke most?':'Which party’s senators spoke most about housing since 2022?'
 for(const stream of [false,true]){
  const {out}=await boundary(input,question,{stream})
  assert.deepEqual(Object.keys(out.citations).sort(),Object.keys(input.citations).sort())
  assert.equal(auditPayload(question,out).findings.length,0)
  if(id==='GOLD-M03'){
   assert.match(out.answer,/almost \$3 million.*2017-18/)
   assert.match(out.answer.split(/(?<=[.!?])\s/)[0],/\$3 million/)
   assert.equal(gradeRow({question,must:[]},out).refusal,false)
  }
 }
})
test('r3 state pay retains the coverage explanation and all three sources, including writing fallback',async()=>{
 const texts=['OPAX holds federal parliamentary salary records only; these cannot answer a state parliament salary question.','The requested period is 2005-01-01 to 2005-12-31. Coverage dates unavailable; no current figures have been substituted.','Coverage: Federal parliamentary salary records start on 7 December 1999 and run to 2026-10-19.']
 const input={question:'Who was the highest paid Victorian state politician in 2005?',period:{kind:'range',since:'2005-01-01',until:'2005-12-31',label:'2005'},facts:texts.map((text,i)=>({id:i+1,text,source:source('fact-'+i,text),coverage:true}))}
 for(const written of [api.proseFallback(input),api.verifyWrittenAnswer({sentences:[{text:'OPAX cannot establish the requested answer for 2005.',facts:[1,2,3],coverage:true}]},input)]){
  assert.ok(written)
  const {out}=await boundary(written,input.question,{stream:true,cache:true,fallback:true})
  assert.match(out.answer,/federal/);assert.match(out.answer,/state/);assert.match(out.answer,/2005/)
  assert.equal(Object.keys(out.citations).length,3)
  assert.equal(gradeRow({question:input.question,must:[{type:'mentions',any:['federal','state']}]},out).axes.decline,'pass')
 }
})
