import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadWorker} from './worker-harness.mjs';
test('worker harness preserves bundle options and ExecutionContext in either argument order',async()=>{
 const root=await mkdtemp(join(tmpdir(),'opax-worker-harness-'));
 try{
  const entry=join(root,'worker.mjs');await writeFile(join(root,'index.html'),'<main></main>');
  await writeFile(entry,'export default {fetch(request,env,ctx){ctx.waitUntil(Promise.resolve());return Response.json({ok:true});}}');
  for(const order of ['context first','options first','options only']){
   let calls=0;const ctx={waitUntil(){calls++;}},options={plugins:[]};
   const args=order==='context first'?[ctx,options]:order==='options first'?[options,ctx]:[options];
   const worker=await loadWorker(entry,root,...args);assert.deepEqual(await (await worker.fetch('/fixture')).json(),{ok:true});
   assert.equal(calls,order==='options only'?0:1);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});
