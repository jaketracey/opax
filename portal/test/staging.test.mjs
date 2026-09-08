import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const start=source.indexOf('    // Staging serves');
const end=source.indexOf("    if (url.pathname.startsWith('/ingest/')) return proxyPostHog(request)",start);
const code=ts.transpileModule(`async function preview(request,env){const url=new URL(request.url);const isApi=url.pathname.startsWith('/api/');${source.slice(start,end)}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const preview=runInNewContext(code+';preview',{URL,Request,Response,withSecurityHeaders:r=>new Response(r.body,r),matchSeoRoute:u=>['/money','/money/receipts','/money/grants','/doc/speech-123'].includes(u.pathname)});
function fixture(){const calls=[];return {calls,env:{STAGING_API:{fetch:async r=>{calls.push(['api',r.url,r.method]);return new Response('public API')}},ASSETS:{fetch:async r=>{calls.push(['assets',r.url]);return new Response('branch assets')}}}}}
test('staging forwards the public API and marks the response noindex',async()=>{const {calls,env}=fixture();const r=await preview(new Request('https://staging.opax.com.au/api/search?q=housing'),env);assert.equal(await r.text(),'public API');assert.equal(r.headers.get('x-robots-tag'),'noindex, nofollow');assert.equal(calls[0][0],'api')});
test('staging deep links serve this branch shell without an index redirect',async()=>{for(const path of ['/money','/money/receipts','/money/grants','/doc/speech-123']){const {calls,env}=fixture();const r=await preview(new Request('https://staging.opax.com.au'+path),env);assert.equal(await r.text(),'branch assets');assert.equal(calls[0][1],'https://staging.opax.com.au/')}});
test('staging assets keep their paths and never route through production',async()=>{const {calls,env}=fixture();await preview(new Request('https://staging.opax.com.au/money-map.js'),env);assert.deepEqual(calls,[['assets','https://staging.opax.com.au/money-map.js']])});
test('staging discourages indexing and does not ingest production analytics',async()=>{const {calls,env}=fixture();const r=await preview(new Request('https://staging.opax.com.au/robots.txt'),env);assert.match(await r.text(),/Disallow: \//);const ingest=await preview(new Request('https://staging.opax.com.au/ingest/e',{method:'POST'}),env);assert.equal(ingest.status,204);assert.equal(calls.length,0)});
