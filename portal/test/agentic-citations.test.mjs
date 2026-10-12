import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {fixtureDeps} from './fixtures/agentic-route.mjs';
import {loadWorker,offline} from './worker-harness.mjs';
const out=await build({entryPoints:[new URL('../src/agentic-tools.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {countSpeeches,speechTrend}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));

test('P2 citations retain exact midyear dates, speaker, chamber and venue',async()=>{
 for(const venue of ['chamber','committee','all']){
  const r=await countSpeeches(fixtureDeps,{topic:'housing',speaker:'Taylor Example',state:'federal',chamber:'senate',since:'2025-07-22',until:'2026-03-28',venue,group_by:'none'});
  assert.equal(r.ok,true);const p=new URL(r.cite[0].url).searchParams;
  for(const [key,value] of Object.entries({since:'2025-07-22',until:'2026-03-28',venue,speaker:'Taylor Example',chamber:'senate',q:'*',mode:'keyword'}))assert.equal(p.get(key),value);
  assert.equal(p.has('from'),false);assert.equal(p.has('to'),false);
 }
 const r=await speechTrend(fixtureDeps,{topic:'housing',speaker:'Taylor Example',since:'2025-07-22',until:'2026-03-28',from_year:2025,to_year:2026});
 assert.equal(new URL(r.cite[0].url).searchParams.get('since'),'2025-07-22');
 assert.equal(new URL(r.cite[0].url).searchParams.get('until'),'2025-12-31');
 assert.equal(new URL(r.cite[1].url).searchParams.get('until'),'2026-03-28');
});

test('P2 citation scope survives search hydration, pagination, requests and copied links',()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const ast=ts.createSourceFile('app.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const names=['applySearchParams','currentFilters','searchHash','searchQueryParams'];
 const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');
 const elements=Object.fromEntries(['search-input','f-speaker','f-party','f-state','f-topic','f-from','f-to','search-kind','search-mode'].map(id=>[id,{value:''}]));
 const api=runInNewContext(`let searchApplied=null,searchCitationScope={};const SEARCH_PER_PAGE=20,RECORD_FIRST_YEAR=1993,RECORD_LAST_YEAR=2026;${functions};({applySearchParams,currentFilters,searchHash,searchQueryParams})`,{
  URLSearchParams,$:id=>elements[id],setQueryValue:(id,v)=>elements[id].value=v,updateSearchYearsLabel(){},searchSortPicker:{set(){}},syncSearchDatasetControls(){},renderFilterChips(){},runSearch(){},
 });
 const original=new URLSearchParams({q:'housing',kind:'speech',speaker:'Taylor Example',chamber:'senate',since:'2025-07-22',until:'2026-03-28',venue:'committee'});
 api.applySearchParams(original);const f=api.currentFilters();
 assert.equal(elements['f-from'].value,'2025');assert.equal(elements['f-to'].value,'2026');
 for(const params of [api.searchQueryParams('housing',f,2,'oldest'),new URL(api.searchHash('housing',f,2,'oldest'),'https://fixture.invalid').searchParams])
  for(const k of ['chamber','since','until','venue','speaker'])assert.equal(params.get(k),original.get(k));
 // Deliberately changing the year controls requests whole years again.
 elements['f-from'].value='2024';assert.equal(api.currentFilters().since,undefined);assert.equal(api.currentFilters().until,undefined);
 assert.equal(api.currentFilters().venue,'committee');
 // The 1993..2026 default display must still preserve an exact partial window.
 api.applySearchParams(new URLSearchParams({q:'housing',since:'1993-07-22',until:'2026-03-28',venue:'chamber'}));
 assert.equal(api.currentFilters().since,'1993-07-22');assert.equal(api.currentFilters().until,'2026-03-28');
 // An open current-term citation must not acquire a to=2026 cutoff.
 api.applySearchParams(new URLSearchParams({q:'housing',since:'2025-07-22',venue:'chamber'}));
 const open=api.searchQueryParams('housing',api.currentFilters(),1,'relevance');
 assert.equal(open.get('since'),'2025-07-22');assert.equal(open.has('until'),false);assert.equal(open.has('from'),false);assert.equal(open.has('to'),false);
 elements['f-to'].value='2025';assert.equal(api.currentFilters().since,undefined);assert.equal(api.currentFilters().to,'2025');
});

test('P2 actual search applies exact dates and chamber/committee/member constraints',async()=>{
 const restore=offline(),pending=[],lookups=[];
 try{
  const h=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,new URL('../public/',import.meta.url).pathname,{waitUntil(p){pending.push(p)},passThroughOnException(){}});
  const assets=h.env.ASSETS;h.env.ASSETS={fetch:req=>new URL(req.url).pathname==='/parliamentarians.json'?Response.json({people:[]}):assets.fetch(req)};
  globalThis.fetch=async(input,init)=>{assert.ok(new URL(input).hostname.startsWith('offline.'));lookups.push(JSON.parse(init?.body??'{}'));return Response.json({resources:{},best_matches:[],fulltext:{total:0}})};
  for(const venue of ['chamber','committee','all']){
   lookups.length=0;const r=await h.fetch(`/api/search?q=housing&kind=speech&speaker=Taylor+Example&chamber=senate&since=2025-07-22&until=2026-03-28&venue=${venue}`);assert.equal(r.status,200);
   const filter=lookups.find(b=>b.filter_expression)?.filter_expression;assert.ok(filter);
   const text=JSON.stringify(filter);assert.match(text,/2025-07-22T00:00:00Z/);assert.match(text,/2026-03-28T23:59:59Z/);assert.match(text,/"label":"senate"/);assert.match(text,/"label":"witness"/);
   const clauses=filter.field.and;
   if(venue==='chamber')assert.ok(clauses.some(c=>c.not?.or?.[0]?.label==='senate_committee'));
   if(venue==='committee')assert.ok(clauses.some(c=>c.or?.[0]?.label==='senate_committee'));
   if(venue==='all')assert.doesNotMatch(text,/senate_committee/);
  }
  for(const extra of ['since=2025-02-30','until=bad','venue=other','chamber=other'])assert.equal((await h.fetch('/api/search?q=housing&'+extra)).status,400);
  while(pending.length)await Promise.all(pending.splice(0));
 }finally{restore()}
});
