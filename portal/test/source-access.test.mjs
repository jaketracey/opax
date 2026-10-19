import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runInNewContext} from 'node:vm';
import {refreshFonts} from '../../scripts/stamp_assets.mjs';
import {SourceRefused,USER_AGENT} from '../../scripts/lib/http.mjs';
import {sourceLineHTML} from '../public/labels.js';

for (const kind of ['unsupported subset','missing required faces','bad font bytes']) {
 test(`incomplete font fetch (${kind}) preserves every published byte`,async()=>{
  const dir=mkdtempSync(join(tmpdir(),'opax-font-fixture-'));
  try {
   mkdirSync(join(dir,'fonts'));
   for(const file of ['merriweather-normal-latin.woff2','public-sans-normal-latin.woff2']) writeFileSync(join(dir,'fonts',file),'retained font');
   writeFileSync(join(dir,'index.html'),'retained page');
   process.env.OPAX_SOURCE_STATUS_FILE=join(dir,'access.json');
   process.env.OPAX_SOURCE_NAME='fonts-'+kind;
   const css=`/* ${kind==='unsupported subset'?'cyrillic':'latin'} */ @font-face {font-family:'Merriweather';font-style:normal;font-weight:400 900;src:url(https://example.test/font);unicode-range:U+0000-00FF;}`;
   const fetcher=async url=>new Response(url.includes('googleapis')?css:kind==='bad font bytes'?'invalid':'wOF2 fixture');
   const before=readdirSync(join(dir,'fonts')).map(f=>[f,readFileSync(join(dir,'fonts',f))]);
   await assert.rejects(refreshFonts({publicRoot:dir,fetcher}),SourceRefused);
   assert.equal(readFileSync(join(dir,'index.html'),'utf8'),'retained page');
   assert.deepEqual(readdirSync(join(dir,'fonts')),before.map(([f])=>f));
   for(const [f,bytes] of before) assert.deepEqual(readFileSync(join(dir,'fonts',f)),bytes);
   assert.equal(JSON.parse(readFileSync(join(dir,'access.json')))[process.env.OPAX_SOURCE_NAME].status,'paused');
  } finally {delete process.env.OPAX_SOURCE_STATUS_FILE;delete process.env.OPAX_SOURCE_NAME;process.exitCode=0;rmSync(dir,{recursive:true,force:true})}
 });
}

test('declared date comes from the retained interests snapshot',async()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const start=source.indexOf('async function renderDeclaredPage(');
 const fn=source.slice(start,source.indexOf('\n}\n',start)+3);
 const elements={'declared-list':{innerHTML:''},'declared-updated':{innerHTML:''}};
 const render=runInNewContext(fn+';renderDeclaredPage',{
  $:id=>elements[id],sourceLineHTML,growthModulesReady:Promise.resolve(),showPageLoader:()=>{},clearPageLoader:()=>{},
  loadRecentInterests:async()=>({meta:{generated:'2026-10-09'},items:[]}),
  loadParliamentarians:async()=>[],loadPhotoMap:async()=>({}),
 });
 await render(new URLSearchParams(),false);
 assert.match(elements['declared-updated'].innerHTML,/Updated 9 Oct 2026/);
});

test('RSS, KB enrichment and watchdog read the same identity',()=>{
 assert.equal(USER_AGENT,JSON.parse(readFileSync(new URL('../../parli/ingest/user-agent.json',import.meta.url))).user_agent);
 for(const name of ['../src/index.ts','../../enrich/src/kb.ts']){
  const source=readFileSync(new URL(name,import.meta.url),'utf8');
  assert.match(source,/sourceIdentity\.user_agent/);
 }
 const watchdog=readFileSync(new URL('../../.github/workflows/refresh-watchdog.yml',import.meta.url),'utf8');
 assert.match(watchdog,/user-agent\.json/);
 assert.match(watchdog, /"User-Agent": user_agent/);
});

test('Node pauses on challenge headers and JSON content-type mismatch',async()=>{
 const {honestFetch}=await import('../../scripts/lib/http.mjs');
 const dir=mkdtempSync(join(tmpdir(),'opax-node-refusal-'));
 const saved=globalThis.fetch;
 try{
  process.env.OPAX_SOURCE_STATUS_FILE=join(dir,'access.json');
  for(const [name,headers,options] of [
   ['challenge-header',{'cf-mitigated':'challenge'},{}],
   ['json-mismatch',{'content-type':'text/html'},{expectedJson:true}],
  ]){
   process.env.OPAX_SOURCE_NAME=name;
   globalThis.fetch=async()=>new Response('<html><body>Unavailable</body></html>',{headers});
   await assert.rejects(honestFetch('https://example.test/'+name,options),SourceRefused);
   assert.equal(JSON.parse(readFileSync(join(dir,'access.json')))[name].status,'paused');
  }
 }finally{globalThis.fetch=saved;delete process.env.OPAX_SOURCE_STATUS_FILE;delete process.env.OPAX_SOURCE_NAME;process.exitCode=0;rmSync(dir,{recursive:true,force:true})}
});
