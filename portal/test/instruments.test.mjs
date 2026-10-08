import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { instrumentCrawlEntries, addInstrumentDiscovery, llmsText, sitemapFiles } from '../../scripts/build_crawl_catalog.mjs';
import { catalogueComplete, filterInstruments, unpack } from '../public/instruments.js';
import { instrumentPage, instrumentReader } from '../src/instruments.ts';

const root = new URL('../public/', import.meta.url);
// Every FRL response is an offline fixture, independently of local acquisition state.
const fixture = {schema:1,generated_at:'2026-10-09T00:00:00Z',downloaded_at:'2026-10-09T11:00:00Z',metadata_coverage:{expanded_titles:1,missing_expansion_ids:[]},scope:"collection eq 'LegislativeInstrument' and isInForce eq true",count:1,odata_count:1,metadata_only:true,titles:[{id:'F2026L00001',name:'Exemption for Jane Citizen',collection:'LegislativeInstrument',isInForce:true,status:'InForce',subCollection:'Rules',isPrincipal:true,makingDate:'2026-01-02T00:00:00',asMadeRegisteredAt:'2026-01-03T00:00:00',administeringDepartments:[{name:'Example department',portfolio:'Finance'}],sourceObjectShapes:[{s:2},{o:1,v:[3]},{source:{opax:"source value"}}],versions:[{registerId:'F2026L00001',isCurrent:true,isLatest:true,start:'2026-01-10T00:00:00',registeredAt:'2026-01-03T00:00:00',compilationNumber:'0'}],statusHistory:[],statusPossibleFuture:[]}]};
const fixtureFiles = JSON.parse(execFileSync('python3',['-c',"import json,sys; from scripts.export_instruments import plan_export; p,m=plan_export(json.load(sys.stdin)); print(json.dumps({k:v.decode() for k,v in p.items()}))"],{cwd:new URL('../../',import.meta.url).pathname,input:JSON.stringify(fixture),encoding:'utf8'}));
const json = p => JSON.parse(fixtureFiles[p.replace(/^\/?instruments\//,'')]);
const manifest = json('instruments/manifest.json');
const index = json('instruments/index.json');
const read = async p => json(p);
const block = (title, text, kicker, links='') => `<section id="prerender"><p>${kicker}</p><h1>${title.replaceAll('&','&amp;').replaceAll('<','&lt;')}</h1><p>${text}</p>${links}</section>`;

test('FRL loader stubbed HTTP paging, count reconciliation, resume, shrink and export guards', () => {
  const output = execFileSync('python3', [new URL('./frl_loader_test.py', import.meta.url).pathname], {encoding:'utf8', stdio:['ignore','pipe','pipe']});
  assert.match(output,/reconciled/);
});

test('instrument export stays within file/byte budget and reconciles every unique source id', () => {
  const files = Object.keys(fixtureFiles);
  const ready=json('instruments/ready.json');
  assert.deepEqual(ready,{complete:true,count:manifest.count,export_date:manifest.generated_at.slice(0,10)});
  assert.ok(Buffer.byteLength(fixtureFiles['ready.json'])<128);
  assert.ok(files.length <= 400);
  assert.ok(files.reduce((n,f) => n + Buffer.byteLength(fixtureFiles[f]),0) <= 25_000_000);
  assert.equal(manifest.count, manifest.odata_count);
  assert.equal(index.records.length, manifest.count);
  const ids = new Set();
  for (const [i,c] of manifest.chunks.entries()) {
    const packed = json(c.path).records;
    assert.equal(packed.length,c.count);
    for (const value of packed) {
      const record=unpack(value,manifest.schemas,manifest.strings); const r=record.source;
      assert.ok(!ids.has(r.id));ids.add(r.id);
      assert.equal(manifest.lookup[r.id],i);
      assert.equal(record.opax.canonical_url,`https://www.legislation.gov.au/${r.id}/latest`);
      assert.equal(r.isInForce,true);assert.equal(r.collection,'LegislativeInstrument');
      assert.ok((r.versions || []).length <= 1);
      assert.ok(!('summary' in r));assert.ok(!('person_id' in r));
    }
  }
  assert.equal(ids.size,manifest.count);
  assert.equal(manifest.attribution.licence_url,'https://creativecommons.org/licenses/by/4.0/');
  assert.match(manifest.attribution.dated,/Based on content from the Federal Register of Legislation at \d+ \w+ \d{4}/);
});

test('directory filters title, portfolio, type, commencement year and status without person rows', async () => {
  const fixtures=[['F2026L00001','Jane Citizen exemption',['Finance'],'Principal',null,'InForce',0],['F2026L00002','Transport rules',['Transport'],'Rules','2027-01-01','InForce',0]];
  for (const [query,id] of [['q=jane','F2026L00001'],['portfolio=Transport','F2026L00002'],['type=Rules','F2026L00002'],['year=unknown','F2026L00001'],['year=2027','F2026L00002']]) assert.deepEqual(filterInstruments(fixtures,new URLSearchParams(query)).map(r=>r[0]),[id]);
  assert.equal(filterInstruments(fixtures,new URLSearchParams('status=Repealed')).length,0);
  const result=await instrumentPage(null,new URL('https://opax.com.au/instruments'),read,block);
  assert.equal(result.status,200);assert.match(result.prerender,/id="prerender"/);
  for(const label of ['Title text','Portfolio','Type','Commencement year','Status']) assert.ok(result.prerender.includes(label));
  assert.match(result.prerender,/Federal Register of Legislation/);assert.match(result.prerender,/CC BY 4.0/);
  assert.doesNotMatch(result.prerender,/\/subject\/person\//);
});

test('detail has SSR facts, exact date labels, licence and authoritative version, without inferred commencement', async () => {
  const id = index.records[0][0];
  const r = unpack(json(manifest.chunks[manifest.lookup[id]].path).records.find(v => unpack(v,manifest.schemas,manifest.strings).source.id===id),manifest.schemas,manifest.strings).source;
  const result=await instrumentPage(id,new URL('https://opax.com.au/instrument/'+id),read,block);
  assert.equal(result.status,200);assert.match(result.prerender,/id="prerender"/);
  for(const label of ['Made','Registered','Commenced','Status','Portfolio','Type']) assert.ok(result.prerender.includes(`<dt>${label}</dt>`));
  assert.ok(result.prerender.includes(r.name.replaceAll('&','&amp;').replaceAll('<','&lt;')));
  assert.match(result.prerender,/Authoritative text — Federal Register of Legislation/);
  assert.ok(result.prerender.includes('https://www.legislation.gov.au/'+id+'/'));
  assert.match(result.prerender,/https:\/\/creativecommons.org\/licenses\/by\/4.0\//);
  assert.match(result.prerender,/OPAX shows metadata only/);
  assert.doesNotMatch(result.prerender,/\/subject\/person\//);
  if(!r.commencementDate) assert.match(result.prerender,/<dt>Commenced<\/dt><dd>Not supplied<\/dd>/);
});

test('instruments sitemap contains ids only and its type count/lastmod equal the export', () => {
  const rows=instrumentCrawlEntries(manifest);
  const result=sitemapFiles({instruments:rows});
  assert.equal(rows.length,manifest.count);
  assert.equal(result.files.reduce((n,f)=>n+f.count,0),manifest.count);
  for(const f of result.files){
    assert.equal(f.lastmod,manifest.generated_at.slice(0,10));
    assert.ok([...f.body.matchAll(/<loc>(.*?)<\/loc>/g)].every(([,url])=>/^https:\/\/opax.com.au\/instrument\/[CF]\d{4}[A-Z]\d{5}$/.test(url)));
    assert.doesNotMatch(f.body,/<(?:name|title)>/);
  }
  const groups={static:[]}; addInstrumentDiscovery(groups,manifest);
  assert.equal(sitemapFiles(groups).counts.instruments,manifest.count);

});

test('null/unknown ids return noindex 404 through the actual Worker and no paid binding is used', async () => {
  const compiled=await build({entryPoints:[new URL('../src/index.ts',import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],plugins:[{name:'omit-renderer',setup(b){b.onResolve({filter:/^\.\/og-render$/},()=>({path:'renderer',namespace:'instrument-test'}));b.onLoad({filter:/.*/,namespace:'instrument-test'},()=>({contents:'export const renderOgPng=async()=>null;export const renderOgJpeg=renderOgPng;export const renderStoryJpeg=renderOgPng;',loader:'js'}));}}]});
  const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const missing=await instrumentPage(null,new URL('https://opax.com.au/instrument/null'),read,block);assert.equal(missing.status,404);
  globalThis.HTMLRewriter=class { on(){return this} transform(res){return res} };
  const paths=[];
  const env={COMMUNITY_ORIGIN:'https://opax.com.au',ASSETS:{async fetch(req){const p=new URL(req.url).pathname;paths.push(p);try{return new Response(p.startsWith('/instruments/') ? fixtureFiles[p.slice('/instruments/'.length)] : readFileSync(new URL(p==='/'?'index.html':p.slice(1),root)))}catch{return new Response('Not found',{status:404})}}}};
  for(const id of ['null','NULL','%6Eull','undefined','unknown','F9999L99999','']) {
    const res=await worker.fetch(new Request('https://opax.com.au/instrument/'+id),env,{});
    assert.equal(res.status,404,id);assert.equal(res.headers.get('x-robots-tag'),'noindex');
  }
  for(const path of ['/instruments','/instrument/'+index.records[0][0]]){
    const res=await worker.fetch(new Request('https://opax.com.au'+path),env,{});assert.equal(res.status,200);
  }
  assert.ok(paths.every(p=>p==='/'||p.startsWith('/instruments/')));
  for(const m of [null,{...manifest,complete:false}]) {
    const missingEnv={...env,ASSETS:{async fetch(req){const p=new URL(req.url).pathname;
      if(p==='/')return new Response(readFileSync(new URL('index.html',root)));
      return m && p==='/instruments/manifest.json'?new Response(JSON.stringify(m)):new Response('missing',{status:404});
    }}};
    for(const path of ['/instruments','/instrument/F2026L00001']) {
      const res=await worker.fetch(new Request('https://opax.com.au'+path),missingEnv,{});
      assert.equal(res.status,404,path);assert.equal(res.headers.get('x-robots-tag'),'noindex');
    }
  }
});


test('missing or incomplete catalogue gives directory and valid-id detail 404', async () => {
  for (const read of [async () => { throw new Error('asset 404') }, async () => ({...manifest,complete:false})]) {
    for (const [id,path] of [[null,'/instruments'],['F2026L00001','/instrument/F2026L00001']]) {
      const result=await instrumentPage(id,new URL('https://opax.com.au'+path),read,block);
      assert.equal(result.status,404); assert.match(result.prerender,/not yet available/);
      assert.doesNotMatch(result.prerender,/\/subject\/person\//);
    }
  }
  for(const missing of [manifest.index_url,manifest.chunks[0].path]) {
    const result=await instrumentPage(missing===manifest.index_url?null:'F2026L00001',new URL('https://opax.com.au/instruments'),async path=>{
      if(path===missing)throw new Error('asset 404');return json(path);
    },block); assert.equal(result.status,404);
  }
});

test('missing and incomplete catalogues omit sitemap type and llms discovery', () => {
  const corpus={version:'fixture',expected_resources:0,sources:[]};
  const grants={federal:{meta:{generated:'2026-10-09',coverage:'fixture'}},qld:{meta:{generated:'2026-10-09',coverage:'fixture'}}};
  for(const m of [null,{}, {...manifest,complete:false}, {...manifest,metadata_coverage:{expanded_titles:0,missing_expansion_ids:['F2026L00001']}}]) {
    const groups={static:[]}; addInstrumentDiscovery(groups,m);
    assert.equal('instruments' in groups,false);
    assert.equal('instruments' in sitemapFiles(groups).counts,false);
    assert.deepEqual(instrumentCrawlEntries(m),[]);
    assert.doesNotMatch(llmsText(corpus,grants,m),/\/instruments|\/instrument\//);
    assert.equal(catalogueComplete(m),false);
  }
  assert.match(llmsText(corpus,grants,manifest),/https:\/\/opax.com.au\/instruments/);
});

test('navigation reads only the tiny readiness flag and preserves menus', async () => {
  const source=readFileSync(new URL('navigation.js',root),'utf8');
  const ready=json('instruments/ready.json');
  for(const m of [null,{...ready,complete:false},{...ready,complete:'true'},ready]) {
    const inserted=[];
    const bills={closest(){return this},insertAdjacentHTML(where,html){inserted.push(html)}};
    const desktop={innerHTML:'',querySelector(){return bills}},mobile={innerHTML:'',querySelector(){return bills}};
    const requested=[];
    const context={URLSearchParams,location:{pathname:'/',search:''},document:{querySelector(s){return s.includes('primary-nav')?desktop:mobile},querySelectorAll(){return []}},fetch:async path=>{requested.push(path);return {ok:m!==null,json:async()=>m}}};
    runInNewContext(source,context);
    await context.OpaxNavigation.instrumentsReady;
    assert.deepEqual(requested,['/instruments/ready.json']);
    assert.doesNotMatch(desktop.innerHTML,/href="\/instruments"/);
    assert.equal(inserted.length,m===ready?2:0);
    assert.equal(context.OpaxNavigation.sections.some(s=>s.id==='instruments'),m===ready);
    if(m===ready) assert.ok(inserted.every(s=>s.includes('href="/instruments"')));
  }
});

test('every shipped HTML file has no static instruments href before catalogue availability', () => {
  for(const file of readdirSync(root,{recursive:true}).filter(f=>f.endsWith('.html'))) assert.doesNotMatch(readFileSync(new URL(file,root),'utf8'),/\bhref\s*=\s*["']\/instruments\/?["']/i,file);
});

test('parsed catalogue is reused per isolate and failed reads can recover', async () => {
  const calls=[];
  const assets={async fetch(req){const p=new URL(req.url).pathname;calls.push(p);return new Response(fixtureFiles[p.slice('/instruments/'.length)])}};
  const read=instrumentReader(assets);assert.equal(read,instrumentReader(assets));
  await Promise.all([instrumentPage(null,new URL('https://opax.com.au/instruments'),read,block),instrumentPage(null,new URL('https://opax.com.au/instruments?q=jane'),read,block)]);
  assert.deepEqual(calls.sort(),['/instruments/index.json','/instruments/manifest.json']);
  let available=false;
  const recovering=instrumentReader({async fetch(){return available?new Response(fixtureFiles['manifest.json']):new Response('',{status:404})}});
  await assert.rejects(recovering('/instruments/manifest.json'));
  available=true; assert.equal((await recovering('/instruments/manifest.json')).count,1);
});

test('source block is verbatim, OPAX fields separate, authoritative link unique and licence accurate', async () => {
  const result=await instrumentPage('F2026L00001',new URL('https://opax.com.au/instrument/F2026L00001'),read,block);
  assert.equal((result.prerender.match(/href="https:\/\/www.legislation.gov.au\/F2026L00001\/latest"/g)||[]).length,1);
  const source=result.prerender.match(/All exported source metadata<\/summary><pre>(.*?)<\/pre>/s)[1];
  assert.doesNotMatch(source,/canonical_url|_opax_metadata|commencementDate/);
  assert.match(result.prerender,/OPAX-derived fields/);
  assert.deepEqual(unpack(json(manifest.chunks[0].path).records[0],manifest.schemas,manifest.strings).source,fixture.titles[0]);
  const licence=readFileSync(new URL('index.html',root),'utf8');
  assert.doesNotMatch(licence,/current\/latest\s+version metadata selected/);
  assert.match(licence,/one API-returned version per title, which may be historical/);
  assert.match(manifest.attribution.dated,/9 October 2026/);
});


test('weekly first-catalogue guard and nightly directory staging use offline git fixtures', () => {
  execFileSync('python3',[new URL('../../scripts/vm/test_frl_refresh.py',import.meta.url).pathname],{stdio:['ignore','pipe','pipe']});
});
