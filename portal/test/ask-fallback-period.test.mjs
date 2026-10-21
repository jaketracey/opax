import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const b=await build({entryPoints:[new URL('../src/research-response.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'})
const {withFallbackPeriod}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))
const period={kind:'window',since:'2005-01-01',until:'2005-12-31',label:'2005'}
const old={answer:'The current salary is $622,102.',sources:[{resource:'r',kind:'pay',date:'2026-10-19',cited:true,href:'https://example.org/pay'}],citations:{r:[[0,32]]}}
test('dated fallback JSON and cached replays cannot present current figures',async()=>{
 const out=await(await withFallbackPeriod(Response.json(old),period)).json()
 assert.equal(out.answer_status,'coverage_only');assert.doesNotMatch(out.answer,/622,102/);assert.match(out.answer,/2005-01-01/);assert.match(out.answer,/2026-10-19/);assert.equal(out.coverage.matched,false)
})
test('dated fallback SSE retains progress and replaces only the final answer',async()=>{
 const s='event: status\ndata: {"phase":"searching"}\n\nevent: done\ndata: '+JSON.stringify(old)+'\n\n'
 const out=await(await withFallbackPeriod(new Response(s,{headers:{'content-type':'text/event-stream'}}),period)).text()
 assert.ok(out.startsWith('event: status\ndata: {"phase":"searching"}'));assert.doesNotMatch(out,/622,102/);assert.match(out,/coverage_only/)
})
test('fallback preserves a dated answer, calculated coverage and unconstrained questions',async()=>{
 const good={...old,answer:'A dated record.',sources:[{...old.sources[0],date:'2005-06-30'}]}
 for(const [payload,p] of [[good,period],[{...old,coverage:{matched:true}},period],[old,{kind:'all',label:'all'}]])assert.deepEqual(await(await withFallbackPeriod(Response.json(payload),p)).json(),payload)
 const undated={...old,sources:[{...old.sources[0],date:undefined}]};assert.equal((await(await withFallbackPeriod(Response.json(undated),period)).json()).answer_status,'coverage_only')
})
