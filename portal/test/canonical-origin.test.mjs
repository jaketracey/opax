import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalPageRedirect} from '../src/canonical-origin.ts';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const origin='https://opax.com.au';
test('www page visits keep their path and query on the account origin',()=>{
  for(const path of ['/', '/community?view=signin', '/community.html?view=account', '/community?view=tools', '/money?focus=party%3ALabor', '/subject/person/David%20Pocock', '//outside.test/path']){
    for(const method of ['GET','HEAD']){
      const response=canonicalPageRedirect(new Request('https://www.opax.com.au'+path,{method}),origin);
      assert.equal(response.status,308);
      assert.equal(response.headers.get('location'),origin+path);
      assert.equal(response.headers.get('referrer-policy'),'no-referrer');
    }
  }
});
test('canonical pages and separate environments do not redirect',()=>{
  for(const url of ['https://opax.com.au/community?view=signin','https://staging.opax.com.au/community','http://localhost:8793/community','https://www.opax.com.au.evil.test/community']){
    assert.equal(canonicalPageRedirect(new Request(url),origin),null);
  }
  assert.equal(canonicalPageRedirect(new Request('https://www.opax.com.au/community'),'https://staging.opax.com.au'),null);
});
test('account mutations, API reads and MCP requests are never redirected across hosts',()=>{
  for(const path of ['/api/community/auth/request','/api/community/auth/consume','/api/community/status','/api/voice/status','/mcp','/ingest/e/']){
    for(const method of ['GET','HEAD','POST','PATCH','DELETE']){
      assert.equal(canonicalPageRedirect(new Request('https://www.opax.com.au'+path,{method}),origin),null);
    }
  }
  assert.equal(canonicalPageRedirect(new Request('https://www.opax.com.au/community',{method:'POST'}),origin),null);
});

test('static app entry points reach the Worker before assets can bypass canonicalisation',()=>{
  const {config,error}=ts.parseConfigFileTextToJson('wrangler.jsonc',readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
  assert.equal(error,undefined);
  const routes=config.assets.run_worker_first;
  for(const path of ['/','/*.html','/community','/community/','/connections','/connections/','/map','/map/'])assert.ok(routes.includes(path),path);
  assert.ok(!routes.includes('/*'),'ordinary images, scripts, fonts and data still use direct asset serving');
});

test('the actual Worker redirects before rendering and still serves canonical community pages',async()=>{
  const {build}=await import('esbuild');
  const compiled=await build({entryPoints:[new URL('../src/index.ts',import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],plugins:[{name:'omit-unrelated-image-renderer',setup(b){b.onResolve({filter:/^\.\/og-render$/},()=>({path:'image-renderer',namespace:'signin-test'}));b.onLoad({filter:/.*/,namespace:'signin-test'},()=>({contents:'export async function renderOgPng(){throw Error("Image rendering is outside this test")}; export const renderOgJpeg=renderOgPng;',loader:'js'}))}}]});
  const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const calls=[];
  const env={COMMUNITY_ORIGIN:origin,ASSETS:{async fetch(req){calls.push(req.url);return new Response('<h1>Sign in</h1>',{headers:{'content-type':'text/html'}})}}};
  for(const path of ['/','/community?view=signin','/community.html?view=account','/money','/subject/person/David%20Pocock']){
    const response=await worker.fetch(new Request('https://www.opax.com.au'+path),env,{});
    assert.equal(response.status,308);
    assert.equal(response.headers.get('location'),origin+path);
  }
  assert.deepEqual(calls,[]);
  const response=await worker.fetch(new Request(origin+'/community?view=signin'),env,{});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  assert.deepEqual(calls,[origin+'/community?view=signin']);
});
