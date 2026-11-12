import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tokens, bucket, questionSubject } from '../src/catalog-query.mjs';
import { searchCatalog, searchCatalogPaged } from '../src/catalog-search.ts';
import { didYouMean, emptySearchSuggestions } from '../src/search-recovery.ts';

test('catalogue spelling and plurals share postings, keeping single-digit dates and bill numbers', () => {
  for (const [a,b] of [['policy','policies'],['subsidy','subsidies'],['defence','defense'],['organisation','organizations'],['Australian Labor Party','Australian Labour Party']]) assert.deepEqual(tokens(a),tokens(b));
  assert.ok(tokens('stage 3 tax cuts').includes('3'));
  assert.ok(tokens('1 July 2024').includes('1'));
  assert.ok(tokens('analysis AUKUS').includes('analysis'));
});

// The real catalogue functions over a tiny, local postings index. Unknown
// words cannot pass by accident, as a canned result for every query would.
const records = [
  {kind:'topic',title:'Rent',state:'nsw'},
  {kind:'bill',title:'NDIS',state:'nsw'},
  {kind:'party',title:'Political parties',state:'nsw'},
  {kind:'topic',title:'Energy prices',state:'nsw'},
  {kind:'topic',title:'Housing',state:'nsw'},
  {kind:'report',title:'What is housing',state:'nsw'},
].map((r,i)=>({...r,href:'/fixture/'+i,snippet:'',slug:'fixture-'+i,resource:''}));
const terms = Array.from({length:64},()=>({}));
for (const [id,row] of records.entries()) for (const term of tokens(row.title)) (terms[bucket(term)][term]??=[]).push(id,8);
const files = {
  '/search-catalog/manifest.json': {version:'aabbccddeeff0011',recordShardSize:256,counts:{},coverage:'Synthetic catalogue'},
  'meta.json':records.map(r=>[r.kind,2024,2024,r.state,'','','']),
  'dates.json':records.map(()=>0),'records-0.json':records,
  ...Object.fromEntries(terms.map((p,i)=>['terms-'+i+'.json',p])),
};
const assets={fetch:async req=>{
  const path=new URL(req.url).pathname;
  assert.ok(path.startsWith('/search-catalog/'),'only local catalogue assets');
  const key=path==='/search-catalog/manifest.json'?path:path.split('/').at(-1);
  return Object.hasOwn(files,key)?Response.json(files[key]):new Response('',{status:404});
}};
const url=(q,params={})=>new URL('https://local.test/api/search-all?'+new URLSearchParams({q,...params}));

test('question misses retry their subject in both full and paged search',async()=>{
  for (const [q,subject] of [['why is rent so high','rent'],['how does the NDIS work','the NDIS'],['who funds political parties','political parties'],['why are energy prices rising','energy prices']]) {
    const found=await searchCatalog(url(q),assets);
    const paged=await searchCatalogPaged(url(q),assets);
    assert.ok(found.total>0,q);
    assert.equal(found.matched_query,subject);
    assert.equal(paged.total,found.total);
    assert.equal(paged.matched_query,subject);
  }
});
test('question recovery preserves filters, exact hits and AND constraints',async()=>{
  assert.equal((await searchCatalog(url('why is rent so high',{state:'wa'}),assets)).total,0);
  const exact=await searchCatalog(url('what is housing'),assets);
  assert.equal(exact.total,1);
  assert.equal(exact.matched_query,undefined);
  assert.equal((await searchCatalog(url('Rent nonexistentword'),assets)).total,0);
  assert.equal(questionSubject('"why is rent so high"'),null);
  assert.equal(questionSubject('Bill 3 2024'),null);
});

const names=[
  {kind:'person',label:'Morgan Example',href:'/subject/person/morgan-example'},
  {kind:'bill',label:'Housing Bill 2024',href:'/bill/example-housing-2024'},
  {kind:'electorate',label:'Sampleton',href:'/subject/electorate/federal-representatives-nsw-sampleton'},
  {kind:'donor',label:'Morgn Example',href:'/subject/donor/private-fixture'},
  {kind:'person',label:'Morgn Example',href:'/subject/supplier/private-fixture'},
];
test('corrections use only members, bills and places, including transpositions and prefixes',()=>{
  assert.equal(didYouMean('Morgna Example',names)[0].label,'Morgan Example');
  assert.equal(didYouMean('Housng Bill 2024',names)[0].kind,'did_you_mean');
  assert.equal(didYouMean('Samplton',names)[0].label,'Sampleton');
  assert.equal(didYouMean('Morgn Example',names).length,1);
  assert.equal(didYouMean('Morgan Ex',names)[0].label,'Morgan Example');
  assert.deepEqual(didYouMean('x',names),[]);
  assert.deepEqual(didYouMean('unrelated words with no match',names),[]);
});
test('asset failure still offers all four collections and a prefilled Ask draft, with no external calls',async()=>{
  const paths=[];
  const suggestions=await emptySearchSuggestions('an unmatched question?',{fetch:async req=>{paths.push(new URL(req.url).pathname);throw Error('Unavailable')}});
  assert.deepEqual(suggestions.filter(s=>s.kind==='scope').map(s=>s.label),['People','Bills','Speeches','Money']);
  const ask=suggestions.find(s=>s.kind==='ask');
  assert.equal(ask.label,'Ask OPAX: an unmatched question?');
  const target=new URL(ask.href,'https://local.test');
  assert.equal(target.searchParams.get('q'),'an unmatched question?');
  assert.equal(target.searchParams.get('draft'),'1');
  assert.deepEqual(paths,['/search-catalog/manifest.json']);
});
test('wildcard filter misses offer browsing without turning the asterisk into an Ask question',async()=>{
  const suggestions=await emptySearchSuggestions('*',{fetch:async()=>{throw Error('Unavailable')}});
  assert.equal(suggestions.length,4);
  assert.ok(suggestions.every(s=>s.kind==='scope'));
});
test('correction lookup reads one small versioned name file and keeps cheap collection counts',async()=>{
  const requests=[];
  const local={fetch:async req=>{requests.push(new URL(req.url).pathname);return Response.json(names)}};
  const catalog={version:'1111222233334444',counts:{person:12,bill:34}};
  const first=await emptySearchSuggestions('Morgn Example',local,catalog);
  const second=await emptySearchSuggestions('Samplton',local,catalog);
  assert.equal(first[0].label,'Morgan Example');
  assert.equal(second[0].label,'Sampleton');
  assert.equal(first.find(s=>s.label==='People').count,12);
  assert.equal(first.find(s=>s.label==='Bills').count,34);
  assert.equal(first.find(s=>s.label==='Speeches').count,undefined);
  assert.deepEqual(requests,['/search-catalog/1111222233334444/recovery-names.json']);
});
test('the generated correction people are all in the public roster',async()=>{
  const root=new URL('../public/',import.meta.url);
  const manifest=JSON.parse(await readFile(new URL('search-catalog/manifest.json',root)));
  const rows=JSON.parse(await readFile(new URL(`search-catalog/${manifest.version}/recovery-names.json`,root)));
  const roster=new Set(JSON.parse(await readFile(new URL('parliamentarians.json',root))).people.map(p=>p.name));
  assert.ok(rows.length>100);
  for(const row of rows){
    assert.ok(['person','bill','electorate'].includes(row.kind));
    if(row.kind==='person')assert.ok(roster.has(row.label),row.label);
  }
  for(const [q,label] of [['Antony Albanese','Anthony Albanese'],['Anthony Albanesee','Anthony Albanese'],['Peter Duton','Peter Dutton'],['Penny Wnog','Penny Wong'],['Grayndlar','Grayndler'],['Kooyng','Kooyong']]){
    assert.ok(didYouMean(q,rows).some(s=>s.label===label),q);
  }
  assert.ok(didYouMean('Help to Byu Bill 2023',rows).some(s=>s.label==='Help to Buy Bill 2023'));
});
