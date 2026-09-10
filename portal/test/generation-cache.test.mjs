import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import ts from 'typescript';
import {runInNewContext} from 'node:vm';
const dir=mkdtempSync(join(tmpdir(),'opax-cache-test-'));
await build({entryPoints:[new URL('../src/generation-cache.ts',import.meta.url).pathname],outfile:join(dir,'cache.mjs'),bundle:true,platform:'node',format:'esm'});
const {readGenerationCache:read,storeGenerationCache:store}=await import(pathToFileURL(join(dir,'cache.mjs')));
const key=(scope='public')=>new Request('https://cache.opax.internal/ask/'+createHash('sha256').update(scope).digest('hex'));
function fixture(){
 const edge=new Map(),shared=new Map(),pending=[];let reads=0,writes=0;
 const env={GENERATION_CACHE:{async get(k){reads++;return shared.get(k)||null},async put(k,v){writes++;shared.set(k,JSON.parse(v))}}};
 globalThis.caches={default:{async match(k){return edge.get(k.url)?.clone()},async put(k,r){edge.set(k.url,new Response(await r.text(),r))}}};
 const ctx={waitUntil(p){pending.push(p)}};
 const flush=async()=>{while(pending.length)await Promise.all(pending.splice(0))};
 return {edge,shared,env,ctx,flush,get reads(){return reads},get writes(){return writes}};
}
test('a successful generation survives edge eviction and preserves its complete cited payload',async()=>{
 const f=fixture(),payload={answer:'A sourced answer.',citations:{s1:[[0,16]]},sources:[{id:'s1',cited:true}]};
 const response=Response.json(payload);store(f.env,f.ctx,key(),response,604800);
 assert.deepEqual(await response.json(),payload);await f.flush();assert.equal(f.writes,1);
 f.edge.clear();const hit=await read(f.env,f.ctx,key());assert.equal(hit.headers.get('x-opax-cache-tier'),'shared');assert.deepEqual(await hit.json(),payload);await f.flush();
 const local=await read(f.env,f.ctx,key());assert.equal(local.headers.get('x-opax-cache-tier'),'edge');assert.deepEqual(await local.json(),payload);assert.equal(f.reads,1);
});
test('different scopes and corpus versions cannot reuse a shared answer',async()=>{
 const f=fixture();store(f.env,f.ctx,key('epoch1:housing:Labor'),Response.json({answer:'Scoped'}),3600);await f.flush();f.edge.clear();
 for(const scope of ['epoch1:housing:Coalition','epoch2:housing:Labor','epoch1:grants:Labor'])assert.equal(await read(f.env,f.ctx,key(scope)),undefined);
 assert.ok(await read(f.env,f.ctx,key('epoch1:housing:Labor')));await f.flush();
});
test('expired, malformed and oversized shared entries are never served',async()=>{
 const f=fixture();store(f.env,f.ctx,key(),Response.json({answer:'A'}),3600);await f.flush();f.edge.clear();const [id,original]=[...f.shared.entries()][0];
 for(const change of [{expiresAt:Date.now()-1},{body:'not json'},{version:2},{cachedAt:'bad'},{expiresAt:Date.now()+8*86400*1000},{body:'x'.repeat(1_000_001)}]){
  f.shared.set(id,{...original,...change});assert.equal(await read(f.env,f.ctx,key()),undefined);
 }
});
test('cache service failures cannot break a successful answer',async()=>{
 const f=fixture();globalThis.caches.default.match=async()=>{throw Error('edge down')};f.env.GENERATION_CACHE.get=async()=>{throw Error('KV down')};
 assert.equal(await read(f.env,f.ctx,key()),undefined);
 globalThis.caches.default.put=async()=>{throw Error('edge down')};f.env.GENERATION_CACHE.put=async()=>{throw Error('KV down')};
 const response=Response.json({answer:'Usable'});store(f.env,f.ctx,key(),response,3600);assert.equal((await response.json()).answer,'Usable');await f.flush();
});
test('old edge hits are adopted without extending their original expiry',async()=>{
 const f=fixture(),saved=Date.now()-1800*1000;
 f.edge.set(key().url,Response.json({answer:'Existing'},{headers:{'x-opax-cached-at':new Date(saved).toISOString(),'cache-control':'public, max-age=3600'}}));
 const response=await read(f.env,f.ctx,key());assert.equal((await response.json()).answer,'Existing');await f.flush();
 const entry=[...f.shared.values()][0];assert.equal(entry.expiresAt,saved+3600*1000);
 f.edge.clear();const hit=await read(f.env,f.ctx,key());assert.ok(Number(hit.headers.get('cache-control').split('=')[1])<=1800);await f.flush();
});
test('failed responses, account responses and oversized generations never enter shared storage',async()=>{
 const f=fixture();
 for(const [k,response] of [[key(),Response.json({error:'Failed'},{status:502})],[key(),Response.json({account:'private'},{headers:{'set-cookie':'session=secret'}})],[new Request('https://cache.opax.internal/account/'+ 'a'.repeat(64)),Response.json({secret:'private'})],[key(),Response.json({answer:'x'.repeat(1_000_001)})]])store(f.env,f.ctx,k,response,3600);
 await f.flush();assert.equal(f.shared.size,0);
});
const index=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const routeCode=ts.transpileModule(index.slice(index.indexOf('async function apiAsk('),index.indexOf('/** A short overview grounded')), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
test('Ask checks shared cache before quota, while conversations and explicit refresh bypass it',async()=>{
 let cacheReads=0,quota=0;
 const api=runInNewContext(routeCode+';apiAsk', {URL,Request,Response,AbortSignal,Date,
  needsAskPeople:()=>false,resolveAskScope:input=>({input}),askCacheInput:input=>input.context?.length?null:'public',
  cacheRequest:()=>key(),sha256Hex:async()=>'',cacheBypass:(r,u)=>u.searchParams.get('nocache')==='1',
  readGenerationCache:async()=>{cacheReads++;return Response.json({answer:'Cached'})},
  rateLimited:async()=>{quota++;return Response.json({error:'limited'},{status:429})},json:Response.json,withCacheStatus:r=>r});
 const req=(input,url='')=>new Request('https://opax.test/api/ask'+url,{method:'POST',body:JSON.stringify(input)});
 assert.equal((await (await api(req({question:'Q'}),{CACHE_EPOCH:'v1'},{})).json()).answer,'Cached');assert.equal(quota,0);
 assert.equal((await api(req({question:'Q',context:[{text:'private'}]}),{CACHE_EPOCH:'v1'},{})).status,429);
 assert.equal((await api(req({question:'Q'},'?nocache=1'),{CACHE_EPOCH:'v1'},{})).status,429);
 assert.equal(cacheReads,1);assert.equal(quota,2);
});
test.after(()=>rmSync(dir,{recursive:true,force:true}));
