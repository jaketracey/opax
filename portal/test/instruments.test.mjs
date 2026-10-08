import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { instrumentCrawlEntries, sitemapFiles } from '../../scripts/build_crawl_catalog.mjs';
import { filterInstruments, unpack } from '../public/instruments.js';
import { instrumentPage } from '../src/instruments.ts';

const root = new URL('../public/', import.meta.url);
// Route tests remain offline even while a first acquisition is held. The
// separate release gate below still requires the real reconciled export.
const hasExport = existsSync(new URL('instruments/manifest.json',root));
const fixture = {schema:1,generated_at:'2026-10-09T00:00:00Z',scope:"collection eq 'LegislativeInstrument' and isInForce eq true",count:1,odata_count:1,metadata_only:true,titles:[{id:'F2026L00001',name:'Exemption for Jane Citizen',collection:'LegislativeInstrument',isInForce:true,status:'InForce',subCollection:'Rules',isPrincipal:true,makingDate:'2026-01-02T00:00:00',asMadeRegisteredAt:'2026-01-03T00:00:00',administeringDepartments:[{name:'Example department',portfolio:'Finance'}],versions:[{registerId:'F2026L00001',isCurrent:true,isLatest:true,start:'2026-01-10T00:00:00',registeredAt:'2026-01-03T00:00:00',compilationNumber:'0'}],statusHistory:[],statusPossibleFuture:[]}]};
const fixtureFiles = JSON.parse(execFileSync('python3',['-c',"import json,sys; from scripts.export_instruments import plan_export; p,m=plan_export(json.load(sys.stdin)); print(json.dumps({k:v.decode() for k,v in p.items()}))"],{cwd:new URL('../../',import.meta.url).pathname,input:JSON.stringify(fixture),encoding:'utf8'}));
const json = p => {
  const name=p.replace(/^\//,'');
  if(!hasExport && name.startsWith('instruments/')) return JSON.parse(fixtureFiles[name.slice('instruments/'.length)]);
  return JSON.parse(readFileSync(new URL(name,root),'utf8'));
};
const manifest = json('instruments/manifest.json');
const index = json('instruments/index.json');
const read = async p => json(p);
const block = (title, text, kicker, links='') => `<section id="prerender"><p>${kicker}</p><h1>${title.replaceAll('&','&amp;').replaceAll('<','&lt;')}</h1><p>${text}</p>${links}</section>`;

test('FRL loader stubbed HTTP paging, count reconciliation, resume, shrink and export guards', () => {
  const output = execFileSync('python3', [new URL('./frl_loader_test.py', import.meta.url).pathname], {encoding:'utf8', stdio:['ignore','pipe','pipe']});
  assert.match(output,/reconciled/);
});

test('release gate requires a complete accepted FRL export', () => {
  assert.ok(hasExport, 'FRL acquisition is held: no accepted metadata export exists');
});

test('instrument export stays within file/byte budget and reconciles every unique source id', () => {
  const dir = new URL('instruments/', root);
  const files = hasExport ? readdirSync(dir) : Object.keys(fixtureFiles);
  assert.ok(files.length <= 400);
  assert.ok(files.reduce((n,f) => n + (hasExport ? statSync(new URL(f,dir)).size : Buffer.byteLength(fixtureFiles[f])),0) <= 25_000_000);
  assert.equal(manifest.count, manifest.odata_count);
  assert.equal(index.records.length, manifest.count);
  const ids = new Set();
  for (const [i,c] of manifest.chunks.entries()) {
    const packed = json(c.path).records;
    assert.equal(packed.length,c.count);
    for (const value of packed) {
      const r=unpack(value,manifest.schemas,manifest.strings);
      assert.ok(!ids.has(r.id));ids.add(r.id);
      assert.equal(manifest.lookup[r.id],i);
      assert.equal(r.canonical_url,`https://www.legislation.gov.au/${r.id}/latest`);
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
  const r = unpack(json(manifest.chunks[manifest.lookup[id]].path).records.find(v => unpack(v,manifest.schemas,manifest.strings).id===id),manifest.schemas,manifest.strings);
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
  if(hasExport) {
    const crawl=json('crawl/manifest.json');assert.equal(crawl.counts.instruments,manifest.count);
    assert.equal(crawl.files.filter(f=>f.path.startsWith('/sitemaps/instruments-')).reduce((n,f)=>n+f.count,0),manifest.count);
  }

});

test('null/unknown ids return noindex 404 through the actual Worker and no paid binding is used', async () => {
  const compiled=await build({entryPoints:[new URL('../src/index.ts',import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],plugins:[{name:'omit-renderer',setup(b){b.onResolve({filter:/^\.\/og-render$/},()=>({path:'renderer',namespace:'instrument-test'}));b.onLoad({filter:/.*/,namespace:'instrument-test'},()=>({contents:'export const renderOgPng=async()=>null;export const renderOgJpeg=renderOgPng;export const renderStoryJpeg=renderOgPng;',loader:'js'}));}}]});
  const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const missing=await instrumentPage(null,new URL('https://opax.com.au/instrument/null'),read,block);assert.equal(missing.status,404);
  globalThis.HTMLRewriter=class { on(){return this} transform(res){return res} };
  const paths=[];
  const env={COMMUNITY_ORIGIN:'https://opax.com.au',ASSETS:{async fetch(req){const p=new URL(req.url).pathname;paths.push(p);try{return new Response(!hasExport && p.startsWith('/instruments/') ? fixtureFiles[p.slice('/instruments/'.length)] : readFileSync(new URL(p==='/'?'index.html':p.slice(1),root)))}catch{return new Response('Not found',{status:404})}}}};
  for(const id of ['null','NULL','%6Eull','undefined','unknown','F9999L99999','']) {
    const res=await worker.fetch(new Request('https://opax.com.au/instrument/'+id),env,{});
    assert.equal(res.status,404,id);assert.equal(res.headers.get('x-robots-tag'),'noindex');
  }
  for(const path of ['/instruments','/instrument/'+index.records[0][0]]){
    const res=await worker.fetch(new Request('https://opax.com.au'+path),env,{});assert.equal(res.status,200);
  }
  assert.ok(paths.every(p=>p==='/'||p.startsWith('/instruments/')));
});
