import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {auditPayload} from '../src/research-claim-audit.mjs'

const built=await build({stdin:{contents:"export * from './src/research-response';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']})
const {withAnswerLanguage}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const source=(snippet,extra={})=>({resource:'selected',snippet,title:'Selected public record',kind:'speech',speaker:'Avery Example',cited:true,...extra})
const payload=(answer,evidence)=>({answer,sources:[evidence],citations:{'selected/t/body/0':[[0,Array.from(answer).length]]}})
async function boundary(input,question,{stream,cache,fallback}){
 if(fallback)input={...input,research:{mode:'planner',failure:'grounding'}}
 const headers=cache?{'x-opax-cache':'HIT'}:{}
 const response=stream?new Response('event: delta\ndata: '+JSON.stringify({text:input.answer})+'\n\nevent: done\ndata: '+JSON.stringify(input)+'\n\n',{headers:{...headers,'content-type':'text/event-stream'}}):Response.json(input,{headers})
 const result=await withAnswerLanguage(response,question),wire=await result.text()
 return {wire,out:stream?JSON.parse(wire.match(/event: done\ndata: (.+)/)[1]):JSON.parse(wire),result}
}
const paths=[]
for(const stream of [false,true])for(const cache of [false,true])for(const fallback of [false,true])paths.push({stream,cache,fallback})

test('B roster ownership rejects Bill Shorten borrowing Avery’s words on every response path',async()=>{
 const input=payload('Bill Shorten said "I support the bill".',source('Bill Shorten asked a question. I support the bill.'))
 const audit=auditPayload('What did Bill Shorten say?',input)
 assert.ok(audit.findings.some(f=>f.type==='quote'&&f.entity==='Bill Shorten'))
 for(const path of paths){
  const {out,wire}=await boundary(input,'What did Bill Shorten say?',path)
  assert.doesNotMatch(out.answer,/Bill Shorten|I support/)
  assert.deepEqual(out.citations,{})
  assert.ok(out.sources.every(s=>!s.cited))
  if(path.stream)assert.doesNotMatch(wire,/event: delta/)
 }
})
for(const speaker of ['Bill Shorten','bill-shorten'])test('B supported Bill Shorten quotation retains its citation: '+speaker,async()=>{
 const input=payload('Bill Shorten said "I support the bill".',source('I support the bill.',{speaker}))
 assert.equal(auditPayload('What did Bill Shorten say?',input).findings.length,0)
 for(const path of paths){
  const {out}=await boundary(input,'What did Bill Shorten say?',path)
  assert.equal(out.answer,input.answer);assert.deepEqual(out.citations,input.citations);assert.equal(out.sources[0].cited,true)
 }
})
for(const title of ['Parliamentary Tool Bill','Reporting Requirements Act','Parliamentary Tool Report'])test('B selected title is a document: '+title,async()=>{
 const answer='The '+title+' changes reporting requirements.'
 const input=payload(answer,source(answer,{kind:'bill',title}))
 for(const path of paths){const {out}=await boundary(input,'What changed?',path);assert.equal(out.answer,answer);assert.deepEqual(out.citations,input.citations)}
})
test('B explicit recipient identity cannot acquire a speaker’s quotation from textual presence',()=>{
 const input=payload('Blake Sample said "I support the bill".',source('Blake Sample asked a question. I support the bill.',{recipient:'Blake Sample'}))
 assert.ok(auditPayload('What did Blake Sample say?',input).findings.some(f=>f.type==='quote'))
})

// Known budget-versus-payment reproductions are deferred to the structured claim-plan lane C.
// B intentionally restores live r4 financial behaviour; the budget rejection/restoration tests
// from the three superseded B budget rounds are removed. Salary/payment preservation stays.
for(const kind of ['speech','record'])for(const snippet of [
 'Avery Example was paid $100,000. The office budget is $200,000.',
 'Avery Example was paid $100,000 from the office budget.',
])test(`B preserves r4 payment evidence in ${kind}: ${snippet}`,async()=>{
 const answer='Avery Example was paid $100,000.',input=payload(answer,source(snippet,{kind}))
 assert.equal(auditPayload('What was Avery paid?',input).findings.length,0)
 for(const path of paths){
  const {out}=await boundary(input,'What was Avery paid?',path)
  assert.equal(out.answer,answer);assert.deepEqual(out.citations,input.citations);assert.equal(out.sources[0].cited,true)
 }
})

for(const kind of ['speech','record'])for(const snippet of [
 'Avery Example: office budget $50,000 and salary $100,000.',
 'Avery Example: office budget of $50,000 and salary of $100,000.',
 'Avery Example has an office budget of $50,000 and an annual salary of $100,000.',
 'Avery Example has a $50,000 office budget and a $100,000 salary.',
])test(`B preserves r4 salary evidence in ${kind}: ${snippet}`,async()=>{
 const answer='Avery Example earned a salary of $100,000.',input=payload(answer,source(snippet,{kind}))
 assert.equal(auditPayload('What salary did Avery earn?',input).findings.length,0)
 for(const path of paths){
  const {out}=await boundary(input,'What salary did Avery earn?',path)
  assert.equal(out.answer,answer);assert.deepEqual(out.citations,input.citations);assert.equal(out.sources[0].cited,true)
 }
})
