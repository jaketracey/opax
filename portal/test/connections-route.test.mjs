import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(new URL(`../public/${file}`,import.meta.url),'utf8');

test('the connections directory is a route of the app shell, not a page of its own',()=>{
  const shell=read('index.html');
  assert.match(shell,/<section id="panel-connections" class="panel" hidden/);
  for(const id of ['connections-body','connection-search','connection-kind','connection-status','connection-list','connection-detail'])assert.ok(shell.includes(`id="${id}"`),id);
  assert.ok(!shell.includes('connections.html'),'the shell links the route, never the old file');
  assert.ok(shell.includes('href="/connections"'));
  assert.match(read('app.js'),/const PANELS = \[[^\]]*"connections"/);
  assert.match(read('app.js'),/view === "connections"/);
  assert.ok(!read('evidence.js').includes('connections.html'),'evidence panels deep-link into the route');
  assert.ok(read('evidence.js').includes('/connections?entity='));
  assert.equal(JSON.parse(read('corpus.json')).evidence?.browse_url ?? '/connections','/connections');
});

test('the page module mounts into a root and can be torn down',async()=>{
  const module=await import('../public/connections.js');
  assert.equal(typeof module.mountConnections,'function');
});

test('the money sub-navigation lists the page and lights the Money entry for it',async()=>{
  await import('../public/navigation.js');
  const navigation=globalThis.OpaxNavigation;
  const entry=navigation.money.find(([href])=>href==='/connections');
  assert.ok(entry,'money sub-nav carries /connections');
  assert.equal(navigation.active('/connections'),'money');
  assert.equal(navigation.active('/connections',new URLSearchParams('entity=abc')),'money');
  const html=navigation.moneyNav('/connections',null);
  assert.match(html,/href="\/connections" aria-current="page"/);
  assert.ok(!/href="\/connections\?jur=/.test(navigation.moneyNav('/connections','nsw')),'the directory is not split by jurisdiction');
});

test('the Worker serves /connections from the shell with its own head, and forwards the old file address',async()=>{
  const {build}=await import('esbuild');
  const compiled=await build({entryPoints:[new URL('../src/index.ts',import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],plugins:[{name:'omit-image-renderer',setup(b){b.onResolve({filter:/^\.\/og-render$/},()=>({path:'image-renderer',namespace:'connections-test'}));b.onLoad({filter:/.*/,namespace:'connections-test'},()=>({contents:'export async function renderOgPng(){throw Error("Image rendering is outside this test")}; export const renderOgJpeg=renderOgPng;',loader:'js'}))}}]});
  const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const origin='https://opax.com.au';
  const shell='<html><head><title>OPAX</title><meta name="description" content="home"><link rel="canonical" href="https://opax.com.au/"><meta property="og:url" content="https://opax.com.au/"></head><body><header>masthead</header><main id="main"><section id="panel-connections" class="panel" hidden></section></main><footer>footer</footer></body></html>';
  const calls=[];
  const env={COMMUNITY_ORIGIN:origin,ASSETS:{async fetch(req){calls.push(new URL(req.url).pathname);return new Response(shell,{headers:{'content-type':'text/html'}})}}};
  // HTMLRewriter is a Workers runtime API; outside workerd the SEO page falls back to the raw shell.
  globalThis.HTMLRewriter ??= class{on(){return this}transform(res){return res}};
  const page=await worker.fetch(new Request(`${origin}/connections?entity=abc`),env,{});
  assert.equal(page.status,200);
  assert.deepEqual(calls,['/'],'the app shell answers the route');
  const body=await page.text();
  assert.ok(body.includes('id="panel-connections"'));
  assert.ok(body.includes('<header>') && body.includes('<footer>'),'the shared chrome comes with the shell');
  for(const path of ['/connections.html','/connections.html?entity=abc']){
    const moved=await worker.fetch(new Request(origin+path),env,{});
    assert.equal(moved.status,301);
    assert.equal(moved.headers.get('location'),path.replace('.html',''));
  }
});
