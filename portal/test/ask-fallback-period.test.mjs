import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const b=await build({entryPoints:[new URL('../src/research-response.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'})
const {withFallbackPeriod}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))
const period={kind:'window',since:'2005-01-01',until:'2005-12-31',label:'2005'}
const old={answer:'The current salary is $622,102.',sources:[{resource:'r',kind:'pay',date:'2026-10-19',cited:true,href:'https://example.org/pay'}],citations:{r:[[0,32]]}}
const note=/These records may not cover 2005-01-01 to 2005-12-31: a returned source is dated 2026-10-19\./
// Minimum checks: a period the records may not cover is a coverage note under the kept answer, never a replacement.
test('dated fallback JSON and cached replays keep the answer and note the uncovered period',async()=>{
 const out=await(await withFallbackPeriod(Response.json(old),period)).json()
 assert.equal(out.answer,old.answer);assert.notEqual(out.answer_status,'coverage_only');assert.equal(out.coverage.matched,false);assert.match(out.coverage.note,note)
})
test('dated fallback SSE retains progress and adds the note to the final answer',async()=>{
 const s='event: status\ndata: {"phase":"searching"}\n\nevent: done\ndata: '+JSON.stringify(old)+'\n\n'
 const out=await(await withFallbackPeriod(new Response(s,{headers:{'content-type':'text/event-stream'}}),period)).text()
 assert.ok(out.startsWith('event: status\ndata: {"phase":"searching"}'));assert.match(out,/622,102/);assert.match(out,note);assert.doesNotMatch(out,/coverage_only/)
})
test('fallback preserves a dated answer, calculated coverage and unconstrained questions',async()=>{
 const good={...old,answer:'A dated record.',sources:[{...old.sources[0],date:'2005-06-30'}]}
 for(const [payload,p] of [[good,period],[{...good,coverage:{matched:true,since:'2005-01-01',until:'2005-12-31',requested_since:'2005-01-01',requested_until:'2005-12-31'}},period],[old,{kind:'all',label:'all'}]])assert.deepEqual(await(await withFallbackPeriod(Response.json(payload),p)).json(),payload)
 const undated={...old,sources:[{...old.sources[0],date:undefined}]},out=await(await withFallbackPeriod(Response.json(undated),period)).json()
 assert.equal(out.answer,old.answer);assert.equal(out.coverage.matched,false);assert.match(out.coverage.note,/These records may not cover 2005-01-01 to 2005-12-31: their dates could not be confirmed/)
})

test('dated fallback keeps progress frames and notes the period on the done frame, including cached replay chunks',async()=>{
 for(const cached of [false,true]){
  const raw='event: status\ndata: {"phase":"searching"}\n\nevent: delta\ndata: '+JSON.stringify({text:old.answer})+'\n\nevent: done\ndata: '+JSON.stringify(old)+'\n\n'
  const bytes=new TextEncoder().encode(cached?raw.replace(/\n/g,'\r\n'):raw)
  const body=new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=13)c.enqueue(bytes.slice(i,i+13));c.close()}})
  const response=new Response(body,{headers:{'content-type':'text/event-stream',...(cached?{'x-opax-cache':'HIT'}:{})}})
  const out=await(await withFallbackPeriod(response,period)).text()
  assert.match(out,/622,102/);assert.match(out,note);assert.match(out,/event: status/)
 }
})
test('calculated flags and matched booleans cannot hide actual mismatching coverage',async()=>{
 for(const extra of [{money_ranking:true,answer_status:'calculated'},{coverage:{matched:true,since:'2024-01-01',until:'2024-12-31',requested_since:'2024-01-01',requested_until:'2024-12-31'}}]){
  const payload={...old,answer:'2024–25: $786,999.',...extra}
  for(const stream of [false,true]){
   const response=stream?new Response('event: delta\ndata: '+JSON.stringify({text:payload.answer})+'\n\nevent: done\ndata: '+JSON.stringify(payload)+'\n\n',{headers:{'content-type':'text/event-stream'}}):Response.json(payload)
   const out=await(await withFallbackPeriod(response,period)).text();assert.match(out,/786,999/);assert.match(out,/These records may not cover 2005-01-01 to 2005-12-31/);assert.match(out,/"matched":false/)
  }
 }
})
