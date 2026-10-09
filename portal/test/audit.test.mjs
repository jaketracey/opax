import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { auditPage, auditReader } from '../src/audit.ts';
import { auditComplete, filterAudit } from '../public/audit.js';
import { auditCrawlEntries, addAuditDiscovery, sitemapFiles } from '../../scripts/build_crawl_catalog.mjs';
import { CATALOG_KINDS } from '../src/catalog-search.ts';

const checkout = new URL('../../', import.meta.url);
const publicRoot = new URL('../public/', import.meta.url);
const fixture = {schema:1,complete:true,count:1,listed:1,generated_at:'2026-10-10T00:00:00Z',policy:{copyright_notice:'© The State of Queensland (Queensland Audit Office) 2026'},reports:[{
 id:'qao-2025-26-1',number:1,year:'2025-26',report_label:'Report 1: 2025–26',title:'Example audit',tabled_date:'2026-01-02',sectors:['Health'],entities:['Queensland Health'],canonical_url:'https://www.qao.qld.gov.au/reports-resources/reports-parliament/example',pdf_url:'https://www.qao.qld.gov.au/sites/default/files/report.pdf',
 licence:{checked:true,status:'cc-by-4.0',licence_url:'https://creativecommons.org/licenses/by/4.0/',exceptions:[],body_skipped:false},
 recommendations:[{number:3,text:'Keep Jane Citizen’s redaction.',html:'<p>Keep Jane Citizen’s <em>redaction</em>.</p>',addressed_to:'Queensland Health',source_text:"QAO's text"}]}]};
// Exporter/parser behaviour is tested by qao_loader_test.py separately.
// Node deploy CI reads these fixtures and needs no Python network packages.
const fixtureRoot = new URL('./fixtures/audit-export/',import.meta.url);
const files = Object.fromEntries(readdirSync(fixtureRoot).map(name=>[name,readFileSync(new URL(name,fixtureRoot),'utf8')]));
const read = async path => JSON.parse(files[path.replace('/audit/','')]);
const manifest = await read('/audit/manifest.json');
const index = await read('/audit/index.json');
const block = (heading,text,links='') => `<section id="prerender"><h1>${heading}</h1><p>${text}</p>${links}</section>`;

test('QAO weekly refresh stays held before catalogue promotion and preserves a held source',()=> {
 execFileSync('python3',[new URL('../../scripts/vm/test_qao_refresh.py',import.meta.url).pathname],{cwd:checkout,encoding:'utf8'});
});

test('audit export file/byte budget, source URLs, attribution and exact agency-only joins',()=> {
 assert.ok(Object.keys(files).length <= 40);
 assert.ok(Object.values(files).reduce((n,b)=>n+Buffer.byteLength(b),0) <= 10_000_000);
 assert.equal(manifest.count,index.records.length); assert.equal(manifest.listed,manifest.count);
 assert.equal(manifest.attribution.source,'Source: Queensland Audit Office, CC BY 4.0');
 assert.match(manifest.attribution.copyright_notice,/State of Queensland/);
 const records = JSON.parse(files['reports-1.json']).records;
 assert.deepEqual(records[0].entity_links,{'Queensland Health':'/subject/agency/health'});
 assert.ok(index.records.every(r=>r.canonical_url.startsWith('https://www.qao.qld.gov.au/')));
 assert.doesNotMatch(JSON.stringify(records),/\/subject\/person|person_id|person_links|summary/);
});

test('audit directory filters title, report year, sector and exact entity, with SSR facts',async()=> {
 for(const [key,value] of [['q','example'],['year','2025-26'],['sector','Health'],['entity','Queensland Health']]) {
  assert.equal(filterAudit(index.records,new URLSearchParams({[key]:value})).length,1);
  assert.equal(filterAudit(index.records,new URLSearchParams({[key]:'missing'})).length,0);
 }
 const page = await auditPage(null,new URL('https://opax.com.au/audit'),read,block);
 assert.equal(page.status,200); assert.match(page.prerender,/<section id="prerender">/);
 for(const word of ['Title text','Report year','Sector','Entity audited','Tabled date: 2026-01-02','/audit/qao-2025-26-1']) assert.ok(page.prerender.includes(word),word);
 assert.equal((page.prerender.match(/class="ui-pop ui-source"/g)||[]).length,1);
 assert.doesNotMatch(page.prerender,/\/subject\/person\//);
});

test('audit detail has numbered verbatim QAO text, exact tabled date, SourceLine, authoritative and PDF links',async()=> {
 const page = await auditPage('qao-2025-26-1',new URL('https://opax.com.au/audit/qao-2025-26-1'),read,block);
 assert.equal(page.status,200); assert.match(page.prerender,/<dt>Tabled date<\/dt><dd>2026-01-02<\/dd>/);
 assert.match(page.prerender,/<ol class="audit-recommendations"><li value="3">/);
 assert.ok(page.prerender.includes('Keep Jane Citizen’s <em>redaction</em>.'));
 assert.ok(page.prerender.includes('QAO&#39;s text'));
 assert.match(page.prerender,/href="\/subject\/agency\/health"/);
 assert.equal((page.prerender.match(/class="ui-pop ui-source"/g)||[]).length,1);
 assert.ok(page.prerender.includes('Source: Queensland Audit Office, CC BY 4.0'));
 for(const href of [fixture.reports[0].canonical_url,fixture.reports[0].pdf_url,'https://creativecommons.org/licenses/by/4.0/']) assert.ok(page.prerender.includes(`href="${href}"`));
 assert.doesNotMatch(page.prerender,/\/subject\/person|Machine-written/);
});

test('licence exception detail withholds body and recommendations',async()=> {
 const excepted=structuredClone(fixture); const r=excepted.reports[0];r.entities=[];r.recommendations=[];r.licence={...r.licence,status:'exception',body_skipped:true,exceptions:['All rights reserved.']};
 const exported={...files,'reports-1.json':JSON.stringify({records:excepted.reports})};const read=async path=>JSON.parse(exported[path.replace('/audit/','')]);
 const page=await auditPage(r.id,new URL('https://opax.com.au/audit/'+r.id),read,block);
 assert.equal(page.status,200);assert.match(page.prerender,/text withheld/);assert.doesNotMatch(page.prerender,/Keep Jane Citizen/);
});

test('audit detail preserves alphabetic source markers and marks unpublished numbers',async()=> {
 const record=structuredClone(fixture.reports[0]);record.recommendations[0].html='<p>Source words</p><ol type="a" start="3"><li value="5">A source subpoint.</li></ol>';
 const render=async row=>auditPage(row.id,new URL('https://opax.com.au/audit/'+row.id),async path=>path.includes('reports-')?{records:[row]}:read(path),block);
 const numbered=await render(record);assert.ok(numbered.prerender.includes(record.recommendations[0].html));
 record.recommendations[0].number=null;
 const unknown=await render(record);assert.match(unknown.prerender,/Number not published in the HTML/);assert.match(unknown.prerender,/<li class="audit-unnumbered">/);
 record.recommendations[0].html='<ol type="a" onclick="unsafe"><li>Changed.</li></ol>';
 const unsafe=await render(record);assert.doesNotMatch(unsafe.prerender,/onclick|Changed\./);assert.ok(unsafe.prerender.includes('Keep Jane Citizen’s redaction.'));
});

test('audit discovery uses report ids; sitemap type counts reconcile and incomplete catalogues stay absent',()=> {
 assert.equal(auditComplete(manifest),true);
 const groups={static:[]};addAuditDiscovery(groups,manifest);
 const output=sitemapFiles(groups);assert.equal(output.counts.audit,manifest.count);assert.equal(output.counts.static,1);
 assert.deepEqual(auditCrawlEntries(manifest),[{path:'/audit/qao-2025-26-1',lastmod:'2026-10-10'}]);
 assert.match(output.files.find(f=>f.path==='/sitemaps/audit-1.xml').body,/qao-2025-26-1/);
 assert.doesNotMatch(JSON.stringify(auditCrawlEntries(manifest)),/Citizen|Example audit|person/);
 for(const bad of [{...manifest,complete:false},{...manifest,count:2},null]) {const g={static:[]};addAuditDiscovery(g,bad);assert.equal('audit' in g,false);}
});

test('audit Worker routes give bad/unknown ids a 404 and noindex without external requests',async()=> {
 const compiled=await build({entryPoints:[new URL('../src/index.ts',import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],plugins:[{name:'omit-renderer',setup(b){b.onResolve({filter:/^\.\/og-render$/},()=>({path:'renderer',namespace:'audit-test'}));b.onLoad({filter:/.*/,namespace:'audit-test'},()=>({contents:'export const renderOgPng=async()=>null;export const renderOgJpeg=renderOgPng;export const renderStoryJpeg=renderOgPng;',loader:'js'}));}}]});
 const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 globalThis.HTMLRewriter=class{on(){return this}transform(res){return res}};
 const paths=[];const env={COMMUNITY_ORIGIN:'https://opax.com.au',ASSETS:{async fetch(req){const path=new URL(req.url).pathname;paths.push(path);if(path==='/')return new Response(readFileSync(new URL('index.html',publicRoot)));const body=files[path.slice('/audit/'.length)];return new Response(body||'missing',{status:body?200:404})}}};
 for(const alias of ['/audit/%71ao-2025-26-1','/audit/qao-2025-26-%31','/audit/qao-2025-26-1/','/audit/']) {
  const response=await worker.fetch(new Request('https://opax.com.au'+alias+'?ref=source'),env,{});
  assert.equal(response.status,301,alias);assert.equal(response.headers.get('location'),'https://opax.com.au'+(alias==='/audit/'?'/audit':'/audit/qao-2025-26-1')+'?ref=source');
 }
 for(const path of ['/audit','/audit/qao-2025-26-1'])assert.equal((await worker.fetch(new Request('https://opax.com.au'+path),env,{})).status,200);
 for(const id of ['null','NULL','undefined','%6Eull','unknown','qao-9999-1','qao-2025-26-1/extra','%ZZ']) {
  const response=await worker.fetch(new Request('https://opax.com.au/audit/'+id),env,{});
  assert.equal(response.status,404,id);assert.equal(response.headers.get('x-robots-tag'),'noindex');
 }
 assert.ok(paths.every(p=>p==='/'||p.startsWith('/audit/')));
 assert.equal(CATALOG_KINDS.has('audit report'),true);
});

test('accepted worktree audit assets reconcile their live sitemap, counts and budget',()=> {
 // Run only after acquisition/export, independently of the offline parser tests.
 const names=readdirSync(new URL('audit/',publicRoot));assert.ok(names.length<=40);
 const size=names.reduce((n,name)=>n+readFileSync(new URL('audit/'+name,publicRoot)).byteLength,0);assert.ok(size<=10_000_000);
 const actual=JSON.parse(readFileSync(new URL('audit/manifest.json',publicRoot)));
 assert.equal(auditCrawlEntries(actual).length,actual.count);
 const crawl=JSON.parse(readFileSync(new URL('crawl/manifest.json',publicRoot)));
 assert.equal(crawl.counts.audit,actual.count);
 const search=JSON.parse(readFileSync(new URL('search-catalog/manifest.json',publicRoot)));
 assert.equal(search.counts['audit report'],actual.count);
});
