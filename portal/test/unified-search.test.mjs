import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {CATALOG_KINDS} from '../src/catalog-search.ts';
import {tokens as catalogTokens} from '../src/catalog-query.mjs';
const source=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source.slice(source.indexOf('async function apiUnifiedSearch'),source.indexOf('/** One /find at `topK` depth')), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture({localError=false,docError=false}={}){
 const calls=[];
 const local={results:[{kind:'contract',slug:'catalog-1',title:'Woodside contract',href:'/subject/supplier/woodside',date:'2025-01-01'}],total:1,truncated:false,coverage:'Published snapshot',version:'test'};
 const docs={results:[{kind:'speech',slug:'speech-1',title:'Woodside debate',date:'2024-01-01'}],truncated:false};
 const ctx={URL,Request,Response,Set,Number,CATALOG_KINDS,catalogTokens,validateSearchQuery:()=>null,rateLimited:async()=>null,json:(x,status=200)=>Response.json(x,{status}),searchCatalog:async()=>{calls.push('catalog');if(localError)throw Error();return local},apiSearch:async(_r,u)=>{calls.push(u.pathname+'?'+u.searchParams.get('kind'));return docError?new Response('',{status:502}):Response.json(docs)}};
 const fn=runInNewContext(code+';apiUnifiedSearch',ctx);
 return {calls,run:async(params={},env={})=>{const url=new URL('https://opax.com.au/api/search-all?'+new URLSearchParams({q:'Woodside',...params}));const res=await fn(new Request(url),url,env,{});return {status:res.status,data:await res.json()}}};
}
test('all-record search combines source types with pagination',async()=>{const f=fixture();const {data}=await f.run({per:'1',page:'2'});assert.equal(data.total,2);assert.equal(data.results[0].kind,'speech');assert.deepEqual(f.calls,['catalog','/api/search?all'])});
test('financial-only queries do not invoke document retrieval',async()=>{const f=fixture();const {data}=await f.run({kind:'contract'});assert.equal(data.results[0].kind,'contract');assert.deepEqual(f.calls,['catalog'])});
test('speech-only queries retain document semantics',async()=>{const f=fixture();await f.run({kind:'speech'});assert.deepEqual(f.calls,['/api/search?speech'])});
test('partial failure is disclosed without discarding successful source results',async()=>{const f=fixture({docError:true});const {data}=await f.run();assert.equal(data.results.length,1);assert.equal(data.truncated,true);assert.match(data.warnings[0],/Document search is temporarily unavailable/)});
test('total failure returns a recoverable error',async()=>{assert.equal((await fixture({docError:true,localError:true}).run()).status,503)});
test('staging retrieves documents through its binding while searching its own catalog',async()=>{const f=fixture();let upstream;const {data}=await f.run({}, {STAGING_API:{fetch:async r=>{upstream=r.url;return Response.json({results:[],truncated:false})}}});assert.equal(data.results[0].kind,'contract');assert.match(upstream,/\/api\/search\?/);assert.deepEqual(f.calls,['catalog'])});
