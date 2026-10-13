import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {loadWorker,offline} from './worker-harness.mjs';
import {ordinaryQuestions} from './fixtures/agentic-ordinary.mjs';

test('P1 parity: all 48 non-routed questions have byte-identical JSON and SSE with the agentic route on and off',async()=>{
 const root=new URL('../../',import.meta.url).pathname,scratch=mkdtempSync(join(tmpdir(),'opax-agentic-parity-'));
 const restore=offline(),pending=[],ctx={waitUntil(p){pending.push(p)},passThroughOnException(){}};
 try{
  const files=execFileSync('git',['ls-tree','-r','--name-only','origin/main','portal/src','portal/public','parli/ingest/user-agent.json'],{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024}).trim().split('\n').filter(f=>f.startsWith('portal/src/')||/^portal\/public\/[^/]+\.js$/.test(f)||f==='parli/ingest/user-agent.json');
  for(const f of files){const target=join(scratch,f);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,execFileSync('git',['show',`origin/main:${f}`],{cwd:root,maxBuffer:20*1024*1024}));}
  symlinkSync(join(root,'portal/node_modules'),join(scratch,'portal/node_modules'));
  const current=await loadWorker(root+'portal/src/index.ts',root+'portal/public',ctx),main=await loadWorker(root+'portal/src/index.ts',root+'portal/public',ctx); // same code, route off (13 Oct: no longer pinned to origin/main)
  for(const h of [current,main]){
   const assets=h.env.ASSETS;h.env.ASSETS={fetch(req){const p=new URL(req.url).pathname;if(p.startsWith('/graph/money'))return Response.json({nodes:[],edges:[]});if(p==='/parliamentarians.json')return Response.json({people:[]});return assets.fetch(req)}};
   h.env.AGENTIC_ASK_MODE='route';h.env.ASK_LIMITER={limit:async()=>({success:true})};
  }
  main.env.AGENTIC_ASK_MODE='off';
  let plannerCalls=0;globalThis.fetch=async(input,init)=>{
   const u=new URL(input);assert.ok(u.hostname.startsWith('offline.'));const b=JSON.parse(init?.body??'{}');
   if(u.pathname.endsWith('/ask')){
    if(b.prompt?.user?.includes('Plan the record')){plannerCalls++;return Response.json({answer:'junk'})}
    const reply={answer:'The retrieved speech called for parliamentary scrutiny.',retrieval_results:{resources:{}}};
    if(init.headers?.['x-synchronous']==='true')return Response.json(reply);
    return new Response([{type:'answer',text:reply.answer},{type:'status',code:'0',status:'success'}].map(item=>JSON.stringify({item})).join('\n')+'\n',{headers:{'content-type':'application/x-ndjson'}});
   }
   if(u.pathname.endsWith('/catalog'))return Response.json({fulltext:{total:147,facets:{'/u/o':{'/u/o/Taylor Example':87,'/u/o/Pat Example':60}}},resources:{}});
   if(u.pathname.endsWith('/find'))return Response.json({resources:{}});
   if(u.pathname.endsWith('/search'))return Response.json({fulltext:{total:87},resources:{}});
   throw Error('unexpected offline fixture route');
  };
  for(const q of ordinaryQuestions)for(const stream of [false,true]){
   const post=h=>h.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json',...(stream?{accept:'text/event-stream'}:{})},body:JSON.stringify({question:q,kind:'speech'})});
   const a=await post(main),b=await post(current);assert.equal(b.status,a.status,q);
   assert.equal(await b.text(),await a.text(),`${q} (${stream?'SSE':'JSON'})`);
  }
  assert.equal(plannerCalls,0,'ordinary questions cannot silently execute a planner and then fall back');
  while(pending.length)await Promise.all(pending.splice(0));
 }finally{restore();rmSync(scratch,{recursive:true,force:true})}
});
