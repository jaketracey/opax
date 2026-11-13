import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {SEARCH_SORTS,compareSearchResults} from '../src/search-sort.ts';
import {CATALOG_KINDS} from '../src/catalog-search.ts';
import {tokens as catalogTokens} from '../src/catalog-query.mjs';
import {emptySearchSuggestions} from '../src/search-recovery.ts';
import {noRecordMentions} from '../src/search-mention.ts';
const source=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source.slice(source.indexOf('async function apiUnifiedSearch'),source.indexOf('/** A bounded /find window')), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture({localError=false,docError=false,suggest=false,localRows,docRows,matchedQuery}={}){
 const calls=[]; const requests=[]; const reads=[];
 const local={results:localRows || [{kind:'contract',slug:'catalog-1',title:'Woodside contract',href:'/subject/supplier/woodside',date:'2025-01-01'}],total:localRows?.length??1,truncated:false,coverage:'Published snapshot',version:'test',matched_query:matchedQuery};
 const docs={results:docRows || [{kind:'speech',slug:'speech-1',title:'Woodside debate',date:'2024-01-01'}],truncated:false};
 const ctx={URL,Request,Response,Set,Number,SEARCH_SORTS,compareSearchResults,CATALOG_KINDS,catalogTokens,emptySearchSuggestions,noRecordMentions,validateSearchQuery:()=>null,rateLimited:async()=>null,json:(x,status=200)=>Response.json(x,{status}),searchCatalog:async()=>{calls.push('catalog');if(localError)throw Error();return local},
  // The paged catalogue as src/catalog-search.ts returns it: stubs in rank order, and their records on request.
  searchCatalogPaged:async()=>{calls.push('catalog');if(localError)throw Error();const rows=local.results;return {...local,stubs:rows.map((r,id)=>({id,kind:r.kind,date:r.date||undefined,sort_date:r.date||r.sort_date||''})),records:async ids=>{reads.push(ids);return new Map(ids.map(id=>[id,rows[id]]))}}},apiSearch:async(_r,u,_e,_c,options)=>{requests.push({url:u,options});calls.push(u.pathname+'?'+u.searchParams.get('kind'));return docError?new Response('',{status:502}):Response.json(docs)}};
 const fn=runInNewContext(code+';apiUnifiedSearch',ctx);
 return {calls,requests,reads,run:async(params={},env={})=>{const url=new URL('https://opax.com.au/api/search-all?'+new URLSearchParams({q:'Woodside',...params}));const res=await fn(new Request(url),url,env,{}, {suggest});return {status:res.status,data:await res.json()}}};
}
test('all-record search combines source types with pagination',async()=>{const f=fixture();const {data}=await f.run({per:'1',page:'2'});assert.equal(data.total,2);assert.equal(data.results[0].kind,'speech');assert.deepEqual(f.calls,['catalog','/api/search?all'])});
test('financial-only queries do not invoke document retrieval',async()=>{const f=fixture();const {data}=await f.run({kind:'contract'});assert.equal(data.results[0].kind,'contract');assert.deepEqual(f.calls,['catalog'])});
test('speech-only queries retain document semantics',async()=>{const f=fixture();await f.run({kind:'speech'});assert.deepEqual(f.calls,['/api/search?speech'])});
test('an empty catalogue-only search retains its page shape and offers recovery',async()=>{
 const {data}=await fixture({localRows:[]}).run({kind:'person'});
 assert.equal(data.count,0);assert.equal(data.total,0);assert.deepEqual(data.results,[]);
 assert.equal(data.suggestions.filter(s=>s.kind==='scope').length,4);
 assert.equal(data.suggestions.find(s=>s.kind==='ask').label,'Ask OPAX: Woodside');
});
test('nonempty and typeahead responses keep suggestions optional',async()=>{
 assert.equal((await fixture().run()).data.suggestions,undefined);
 assert.equal((await fixture({localRows:[],suggest:true}).run({kind:'person'})).data.suggestions,undefined);
});
test('an unscoped miss reaches hybrid document retrieval and still offers recovery when both sources are empty',async()=>{
 const f=fixture({localRows:[],docRows:[]});const {data}=await f.run();
 assert.deepEqual(f.calls,['catalog','/api/search?all']);
 assert.equal(f.requests[0].url.searchParams.get('mode')||'hybrid','hybrid');
 assert.equal(data.count,0);assert.equal(data.suggestions.length,5);
});
test('document-only misses and a failed catalogue still offer recovery',async()=>{
 for(const [options,params] of [[{docRows:[]},{kind:'speech'}],[{localError:true,docRows:[]},{}]]){
  const {data}=await fixture(options).run(params);
  assert.equal(data.count,0);assert.ok(data.suggestions.some(s=>s.kind==='ask'));
 }
});
test('question recovery retains the original query and explains the matched subject',async()=>{
 const {data}=await fixture({matchedQuery:'housing'}).run({q:'what is housing'});
 assert.equal(data.query,'what is housing');assert.equal(data.matched_query,'housing');
});
test('adding report rows preserves the existing kinds, row fields and relative order',async()=>{
 const existing=['bill','division','party','agency','grant'].map((kind,i)=>({kind,slug:'existing-'+i,title:'Existing '+kind,href:'/existing/'+kind,date:'2024-01-01',snippet:'Original '+kind}));
 const before=(await fixture({localRows:existing}).run({per:'200'})).data.results;
 const report={kind:'report',report_type:'royal_commission',slug:'royal-commission-cth-robodebt',title:'Royal Commission into the Robodebt Scheme',href:'/report/royal-commission-cth-robodebt',body:'Royal Commission into the Robodebt Scheme',jurisdiction:'Cth',date:'2023-07-07',snippet:'Report of the Royal Commission into the Robodebt Scheme'};
 const after=(await fixture({localRows:[report,...existing]}).run({per:'200'})).data.results.filter(r=>r.kind!=='report');
 const withoutRank=rows=>rows.map(({score,...row})=>row);
 // The new match can shift reciprocal rank values, but not the old rows' contract or order within a source.
 assert.deepEqual(withoutRank(after.filter(r=>r.kind!=='speech')),withoutRank(before.filter(r=>r.kind!=='speech')));
 assert.deepEqual(after.find(r=>r.kind==='speech'),before.find(r=>r.kind==='speech'));
});
test('partial failure is disclosed without discarding successful source results',async()=>{const f=fixture({docError:true});const {data}=await f.run();assert.equal(data.results.length,1);assert.equal(data.truncated,true);assert.match(data.warnings[0],/Document search is temporarily unavailable/)});
test('total failure returns a recoverable error',async()=>{assert.equal((await fixture({docError:true,localError:true}).run()).status,503)});
test('staging retrieves documents through its binding while searching its own catalog',async()=>{const f=fixture();let upstream;const {data}=await f.run({}, {STAGING_API:{fetch:async r=>{upstream=r.url;return Response.json({results:[],truncated:false})}}});assert.equal(data.results[0].kind,'contract');assert.match(upstream,/\/api\/search\?/);assert.deepEqual(f.calls,['catalog'])});
test('sorting precedes pagination and retains query scope and counts',async()=>{
 const f=fixture();
 const old=await f.run({sort:'oldest',per:'1'});
 const recent=await f.run({sort:'newest',per:'1'});
 assert.equal(old.data.results[0].kind,'speech');
 assert.equal(recent.data.results[0].kind,'contract');
 assert.equal(old.data.total,recent.data.total);
 assert.equal((await f.run({sort:'oldest',per:'1',page:'2'})).data.results[0].kind,'contract');
});

test('bill searches include original text retrieval alongside register matches',async()=>{
 const f=fixture();await f.run({kind:'bill'});assert.deepEqual(f.calls,['catalog','/api/search?bill_text']);
});
test('bill-text-only searches query the corpus without unrelated register matches',async()=>{
 const f=fixture();await f.run({kind:'bill_text'});assert.deepEqual(f.calls,['/api/search?bill_text']);
});

test('division searches retain full-text document retrieval alongside metadata', async () => {
  const f=fixture(); await f.run({kind:'division'});
  assert.ok(f.calls.includes('/api/search?division'));
});
test('suggestions combine catalog records with original documents', async () => {
  const f=fixture({suggest:true}); const {data}=await f.run();
  assert.deepEqual(data.results.map(row=>row.kind), ['contract','speech']);
  assert.equal(f.requests[0].url.searchParams.get('top_k'), '20');
  assert.equal(f.requests[0].url.searchParams.get('mode'), 'keyword');
  assert.equal(f.requests[0].options.suggest, true);
});

test('exact topics and named collections stay above matching record mentions', async () => {
  const localRows = [
    ...Array.from({length:9},(_,i)=>({kind:'kind-'+i,title:'An unrelated record',slug:'record-'+i,href:'/doc/record-'+i})),
    {kind:'topic',title:'Housing',href:'/subject/topic/housing'},
    {kind:'page',title:'Legislative instruments',href:'/instruments'},
  ];
  const housing=await fixture({suggest:true,localRows}).run({q:'Housing'});
  assert.equal(housing.data.results[0].href,'/subject/topic/housing');
  const instruments=await fixture({suggest:true,localRows}).run({q:'Instruments'});
  assert.equal(instruments.data.results[0].href,'/instruments');
});

test('a relevance or date page reads only the catalogue records it shows; title order reads all of them',async()=>{
 const localRows=Array.from({length:30},(_,i)=>({kind:'contract',slug:'c-'+i,title:'Contract '+(29-i),href:'/c/'+i,...(i%4?{date:`20${10+i%12}-0${1+i%9}-01`}:{})}));
 for(const sort of ['relevance','newest','oldest']){
  const f=fixture({localRows});const {data}=await f.run({sort,per:'5',page:'2'});
  assert.equal(f.reads.length,1,sort);
  const shown=data.results.filter(r=>r.kind==='contract');
  assert.deepEqual([...f.reads[0]],shown.map(r=>Number(r.slug.slice(2))),sort);
  for(const row of shown){const id=Number(row.slug.slice(2)),record=localRows[id];
   assert.deepEqual(Object.entries(row),Object.entries({...record,score:1/(10+id),sort_date:record.date||''}),sort)}
  assert.equal(data.total,31);assert.ok(Object.values(data.years).reduce((a,b)=>a+b,0)>20);
 }
 const f=fixture({localRows});const {data}=await f.run({sort:'title_asc',per:'5'});
 assert.equal(f.reads.length,0);assert.equal(data.results[0].title,'Contract 0');
});

test('a query no record mentions says so first, with recovery, and keeps the meaning-ranked records',async()=>{
 const docRows=[{kind:'speech',slug:'speech-9',title:'GovHubs in regional Victoria',speaker:'Example Member',snippet:'The hubs bring services together.',score:0.41,date:'2024-01-01'}];
 const {data}=await fixture({localRows:[],docRows}).run({q:'zzqxv plorthub'});
 assert.equal(data.no_mention,true);
 assert.equal(data.count,1,'the closest records are still returned');
 assert.ok(data.suggestions.some(s=>s.kind==='scope'),'with the recovery suggestions');
 // A record that carries a query word, a register match, keyword mode or a strong meaning score keeps results first.
 for(const [options,params] of [
  [{localRows:[],docRows:[{...docRows[0],snippet:'Housing affordability in the regions.'}]},{q:'housing affordable'}],
  [{docRows},{q:'zzqxv plorthub'}],
  [{localRows:[],docRows},{q:'zzqxv plorthub',mode:'keyword'}],
  [{localRows:[],docRows:[{...docRows[0],score:0.93}]},{q:'zzqxv plorthub'}],
 ]){
  const {data:kept}=await fixture(options).run(params);
  assert.equal(kept.no_mention,undefined,JSON.stringify(params));
  assert.equal(kept.suggestions,undefined,JSON.stringify(params));
 }
});
