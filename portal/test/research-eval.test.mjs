import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({entryPoints:[new URL('../src/research-eval.ts',import.meta.url).pathname],bundle:true,write:false,platform:'browser',format:'esm'});
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const prices={input:1,output:3};
test('usage observation preserves split stream bytes and avoids counting repeated metadata twice',async()=>{
 const raw=[{item:{type:'answer',text:'A cited answer.'}},{item:{type:'metadata',tokens:{input:10,output:5}}},{item:{type:'consumption',consumption:{tokens:{input:10,output:5},cost_usd:0.001}}}].map(v=>JSON.stringify(v)).join('\n')+'\n';
 const encoder=new TextEncoder(),state=api.researchEvalState(),response=new Response(new ReadableStream({start(c){for(let i=0;i<raw.length;i+=7)c.enqueue(encoder.encode(raw.slice(i,i+7)));c.close()}}));
 const observed=api.observeEvalModelResponse(response,state,prices,true);assert.equal(await observed.text(),raw);
 api.captureLoopUsage(state,{rounds:2,tokens:{input:20,output:10},costUsd:0.002});const usage=api.researchEvalUsage(state);
 assert.deepEqual(usage.tokens,{input:30,output:15});assert.equal(usage.cost_usd,0.003);
});
test('missing, malformed or oversized consumption is unknown; errors without generation are zero',async()=>{
 for(const raw of [{answer:'missing'},{metadata:{tokens:{input:null,output:null}}},{metadata:{tokens:{input:-1,output:2}}},{metadata:{tokens:{input:10,output:5}},padding:'x'.repeat(1_000_001)}]){
  const state=api.researchEvalState(),response=Response.json(raw);const original=await response.clone().text();assert.equal(await api.observeEvalModelResponse(response,state,prices).text(),original);assert.equal(api.researchEvalUsage(state).tokens,null);assert.equal(api.researchEvalUsage(state).cost_usd,null);
 }
 const state=api.researchEvalState();await api.observeEvalModelResponse(new Response('limited',{status:429}),state,prices).text();assert.deepEqual(api.researchEvalUsage(state).tokens,{input:0,output:0});assert.equal(api.researchEvalUsage(state).cost_usd,0);
 const failed=api.researchEvalState();await api.observeEvalModelResponse(new Response('unavailable',{status:500}),failed,prices).text();assert.equal(api.researchEvalUsage(failed).tokens,null);assert.equal(api.researchEvalUsage(failed).cost_usd,null);
});
test('an incomplete loop turn reports unknown total usage; configured prices cannot produce negative estimates',()=>{
 const state=api.researchEvalState();api.captureLoopUsage(state,{rounds:1,tokens:{input:10,output:5},costUsd:0.001,usageUnknown:true});assert.equal(api.researchEvalUsage(state).tokens,null);assert.equal(api.researchEvalUsage(state).cost_usd,null);
 assert.deepEqual(api.researchPrices('-1','bad'),prices);assert.deepEqual(api.researchPrices('0','0'),{input:0,output:0});
});
