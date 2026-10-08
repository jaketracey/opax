import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {build} from 'esbuild';
import {sitemapFiles, exportDate} from '../../scripts/build_crawl_catalog.mjs';
import {grantRecipientUrl} from '../public/grants.js';
import {awardHref} from '../public/grants-largest.js';
import {INDEXNOW_KEY} from '../src/indexnow.ts';

const root = new URL('../public/',import.meta.url);
const read = path => readFileSync(new URL(path,root),'utf8');
const json = path => JSON.parse(read(path));
const source = readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const compiled = await build({entryPoints:[new URL('../src/index.ts',import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],plugins:[{name:'omit-renderer',setup(b){b.onResolve({filter:/^\.\/og-render$/},()=>({path:'renderer',namespace:'crawl-test'}));b.onLoad({filter:/.*/,namespace:'crawl-test'},()=>({contents:'export const renderOgPng = async()=>null; export const renderOgJpeg=renderOgPng;',loader:'js'}));}}]});
const {default:worker} = await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
globalThis.HTMLRewriter = class { on(){return this;} transform(res){return res;} };
const assetPaths = [];
const env = {COMMUNITY_ORIGIN:'https://opax.com.au',ASSETS:{async fetch(req){
  const path = new URL(req.url).pathname;
  assetPaths.push(path);
  const file = new URL(path === '/' ? 'index.html' : path.slice(1),root);
  return existsSync(file) ? new Response(readFileSync(file),{headers:{'content-type':path.endsWith('.json')?'application/json':'text/html'}}) : new Response('Not found',{status:404});
}}};
const get = (path,method='GET') => worker.fetch(new Request('https://opax.com.au'+path,{method}),env,{});

test('sitemap index and every type file have export lastmod, unique canonical URLs and accurate counts',async()=>{
  const manifest = json('crawl/manifest.json');
  const index = await get('/sitemap.xml');
  assert.equal(index.status,200);
  assert.match(index.headers.get('content-type'),/application\/xml/);
  const text = await index.text();
  assert.match(text,/<sitemapindex/);
  const all = new Set();
  for (const f of manifest.files) {
    assert.ok(text.includes('https://opax.com.au'+f.path));
    assert.ok(text.includes(`<lastmod>${f.lastmod}</lastmod>`));
    const response = await get(f.path);
    assert.equal(response.status,200);
    const body = await response.text();
    const rows = [...body.matchAll(/<url>(.*?)<\/url>/g)];
    assert.equal(rows.length,f.count);
    assert.ok(rows.length < 50_000);
    for (const [,row] of rows) {
      const url = /<loc>(.*?)<\/loc>/.exec(row)[1];
      assert.ok(url.startsWith('https://opax.com.au/'));
      assert.ok(!all.has(url),'duplicate '+url);all.add(url);
      assert.match(row,/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
      assert.doesNotMatch(decodeURIComponent(url),/\/(null|undefined)(?:<|$)/i);
    }
  }
  assert.equal(manifest.counts.bills,json('bills/index.json').bills.length);
  const recipients = ['federal','qld'].flatMap(j=>json(`graph/grants.${j}.json`).recipients);
  assert.equal(manifest.counts['grant-recipients'],recipients.filter(r=>!['individual','person','undisclosed'].includes(r.k)).length);
  assert.equal(manifest.counts['grant-programs'],['federal','qld'].reduce((n,j)=>n+json(`graph/grants.${j}.json`).programs.length,0));
  const divisionKeys = new Set(json('bills/index.json').bills.flatMap(b => json(`bills/${b.key}.json`).divisions.map(d => d.key)));
  assert.equal(manifest.counts.divisions,divisionKeys.size);
  assert.match(read('crawl/sitemaps/bills-1.xml'),new RegExp(`<lastmod>${json('bills/index.json').generated_at.slice(0,10)}</lastmod>`));
  assert.match(read('crawl/sitemaps/grant-recipients-1.xml'),new RegExp(`<lastmod>${json('graph/grants.federal.json').meta.generated.slice(0,10)}</lastmod>`));
  assert.match(read('crawl/sitemaps/electorates-1.xml'),new RegExp(`<lastmod>${json('electorates/manifest.json').generated}</lastmod>`));
  const grantsXml = read('crawl/sitemaps/grant-recipients-1.xml');
  for (const r of recipients.filter(r=>['individual','person'].includes(r.k))) assert.ok(!grantsXml.includes(encodeURIComponent(r.id)));
  const donorsXml = read('crawl/sitemaps/donors-1.xml');
  for (const name of ['money.json','money.qld.json','money.vic.json'])
    for (const n of json(`graph/${name}`).nodes.filter(n=>n.kind==='donor'&&n.industry==='individual'))
      assert.ok(!donorsXml.includes(`/subject/donor/${encodeURIComponent(n.label)}<`), `individual donor in sitemap: ${name}`);
  const robots = await (await get('/robots.txt')).text();
  assert.match(robots,/Sitemap: https:\/\/opax.com.au\/sitemap.xml/);
});

test('sitemaps split before 50,000 and XML-escape program queries; invalid dates are rejected',()=>{
  const rows = Array.from({length:50_001},(_,i)=>({path:`/bill/au-federal-r${i}`,lastmod:'2026-10-04'}));
  const {files,index} = sitemapFiles({bills:rows});
  assert.deepEqual(files.map(f=>f.count),[49_999,2]);assert.match(index,/bills-2.xml/);
  assert.match(sitemapFiles({programs:[{path:'/money/grants?jur=qld&program=A+B',lastmod:'2026-09-13'}]}).files[0].body,/jur=qld&amp;program=A\+B/);
  assert.equal(exportDate('2026-02-31'),'');assert.equal(exportDate('garbage'),'');
});

test('suppliers have their own lower-priority sitemap and stable named profile IDs',()=>{
  const body = read('crawl/sitemaps/suppliers-1.xml');
  const suppliers = json('suppliers.json');
  assert.equal([...body.matchAll(/<url>/g)].length,suppliers.suppliers.length);
  assert.equal([...body.matchAll(/<priority>0.2<\/priority>/g)].length,suppliers.suppliers.length);
  assert.ok(body.includes(`/subject/supplier/${suppliers.suppliers[0].id}</loc>`));
});

test('query ask/search pages are noindex for any query and bare pages remain indexable',async()=>{
  for (const path of ['/ask?q=x','/ask?q=','/search?sort=newest','/search/?q=x']) {
    const response = await get(path);assert.equal(response.status,path.startsWith('/search')?302:200);assert.equal(response.headers.get('x-robots-tag'),'noindex');
  }
  for (const path of ['/ask','/search']) { const response=await get(path);assert.equal(response.status,path==='/search'?302:200);assert.equal(response.headers.get('x-robots-tag'),'all'); }
  assert.equal((await get('/ask?q=x','HEAD')).headers.get('x-robots-tag'),'noindex');
});

test('money journeys canonicalise to the bare money route; award canonicals are preserved',()=>{
  const parsed=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
  const fn=parsed.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='canonicalFor');
  const context={SITE_ORIGIN:'https://opax.com.au'};
  runInNewContext(ts.transpileModule(fn.getText(parsed),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  assert.equal(context.canonicalFor(new URL('https://opax.com.au/money/?journey=minerals&from=2020'),true),'https://opax.com.au/money');
  assert.equal(context.canonicalFor(new URL('https://opax.com.au/money/grants/federal/recipient/abn%3A123?award=GA1'),true),'https://opax.com.au/money/grants/federal/recipient/abn%3A123?award=GA1');
});

test('all placeholder entity routes return real noindex 404s without an upstream request',async()=>{
  for (const prefix of ['/subject/person/','/subject/party/','/subject/donor/','/subject/supplier/','/subject/agency/','/subject/electorate/','/subject/campaigner/','/subject/topic/','/reports/','/bill/','/doc/','/money/grants/federal/recipient/','/money/grants/qld/recipient/','/money/grants/federal/program/']) {
    for (const slug of ['null','undefined','%6Eull','NULL']) {
      const count=assetPaths.length,response=await get(prefix+slug);
      assert.equal(response.status,404,prefix+slug);assert.equal(response.headers.get('x-robots-tag'),'noindex');assert.equal(assetPaths.length,count);
    }
  }
});

test('app link builders and grants builders never create null or undefined hrefs',()=>{
  const app=read('app.js'),parsed=ts.createSourceFile('app.js',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const names=new Set(['esc','hasEntityId','entityHrefAttr','subjectHash','billDivisionHref']);
  const code=parsed.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)).map(n=>n.getText(parsed)).join('\n');
  const context={URL,personSlugs:{byName:new Map()}};runInNewContext(code,context);
  for (const value of [null,undefined,'null','undefined','', ' NULL ']) {
    assert.equal(context.subjectHash('person',value),null);
    assert.equal(context.entityHrefAttr(context.subjectHash('person',value)),'');
    assert.equal(context.entityHrefAttr('/doc/'+encodeURIComponent(value)),'');
    assert.equal(context.billDivisionHref({key:value}),null);
    assert.equal(grantRecipientUrl('federal',value),null);
    assert.equal(awardHref({recipientId:value,id:'GA123'}),null);
  }
  assert.equal(context.entityHrefAttr(context.subjectHash('person','Jane Smith')),'href="/subject/person/Jane%20Smith"');
  assert.match(app,/hasEntityId\(id\)\) replaceRoute/);
  assert.match(app,/entityHrefAttr\(subjectHash\(/);
  assert.match(read('grants.js'),/if \(!href\) return el\('span'/);
});

test('llms.txt is served as bounded markdown with corpus dates, patterns, source citation and licences',async()=>{
  const response=await get('/llms.txt');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/plain/);
  const body=await response.text();assert.ok(body.length < 12_000);assert.match(body,/^# OPAX\n/);assert.match(body,/independent, non-partisan/);
  assert.ok(body.includes(json('corpus.json').version));assert.match(body,/original source URL/);assert.match(body,/CC BY-NC-ND/);assert.match(body,/https:\/\/opax.com.au\/methods/);assert.match(body,/doc\/division-/);
});

test('public IndexNow key file matches payload key',async()=>{
  assert.equal(read(INDEXNOW_KEY+'.txt').trim(),INDEXNOW_KEY);
  assert.equal((await (await get('/'+INDEXNOW_KEY+'.txt')).text()).trim(),INDEXNOW_KEY);
});
