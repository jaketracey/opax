import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {searchCatalog,matchesCatalogFilters} from '../src/catalog-search.ts';
import {tokens,normalize,bucket} from '../src/catalog-query.mjs';
const assets={fetch:async request=>{
 const path=new URL(request.url).pathname;
 assert.match(path,/^\/search-catalog\/(manifest\.json|[a-f0-9]{16}\/(meta|terms-\d+|records-\d+)\.json)$/);
 try{return new Response(await readFile(new URL('../public'+path,import.meta.url)),{headers:{'content-type':'application/json'}})}catch{return new Response('missing',{status:404})}
}};
const find=(q,params={})=>searchCatalog(new URL('https://opax.com.au/api/search-all?'+new URLSearchParams({q,kind:'all',...params})),assets);
test('tokenization handles ABNs, contract IDs, punctuation and prototype words',()=>{
 assert.deepEqual(tokens('The WOODSIDE, grants and contracts'),['woodside','grant','contract']);
 assert.equal(normalize('86689561797'),'86689561797');
 assert.ok(tokens('constructor').includes('constructor'));
 assert.equal(bucket('woodside'),bucket('wood'));
});
test('published index covers financial records alongside people, bills and registers',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../public/search-catalog/manifest.json',import.meta.url)));
 const suppliers=JSON.parse(await readFile(new URL('../public/suppliers.json',import.meta.url)));
 assert.ok(manifest.counts.contract>=suppliers.meta.contract_count);
 for(const kind of ['person','agency','donor','receipt','grant','bill','interest','expense','access','campaigner','report'])assert.ok(manifest.counts[kind]>0,kind);
});
test('an organisation is found in donors, receipts, contracts and grants',async()=>{
 for(const kind of ['donor','receipt','contract','grant']){
  const result=await find('Woodside',{kind});assert.ok(result.total>0,kind);
  assert.ok(result.results.every(r=>r.kind===kind));
  assert.ok(result.results.every(r=>r.href.startsWith('/')||r.href.startsWith('https://')));
 }
});
test('contract identifiers and ABNs find real source records rather than speeches',async()=>{
 const result=await find('CN4169870',{kind:'contract'});
 assert.equal(result.total,1);assert.equal(result.results[0].record_id,'CN4169870');
 assert.match(result.results[0].href,/^\/subject\/supplier\//);
 const abn=await find('86689561797',{kind:'supplier'});assert.ok(abn.total>0);assert.match(abn.results[0].title,/Austal/i);
});
test('map-only public awards remain searchable under the exact recipient name',async()=>{
 const result=await find('Woodside Energy',{kind:'contract'});
 const connection=result.results.find(r=>r.source==='Public contract map aggregate');
 assert.ok(connection);assert.match(connection.snippet,/7,260,000/);
 assert.match(connection.href,/type=contracts/);
 assert.match(connection.snippet,/Aggregated map connection/);
});
test('prefix names and multiword queries use intersecting terms',async()=>{
 const prefix=await find('woods',{kind:'donor'});assert.ok(prefix.results.some(r=>/woodside/i.test(r.title)));
 const exact=await find('University Tasmania',{kind:'grant'});assert.ok(exact.total>0);
 const none=await find('Woodside zzznonexistenttoken',{kind:'contract'});assert.equal(none.total,0);
});
test('date, jurisdiction, person and party filters intersect and exclude unknown values',()=>{
 const meta=['interest',2024,2025,'federal','liberal','jane example','housing'];
 assert.equal(matchesCatalogFilters(meta,new URLSearchParams({kind:'interest',from:'2025',to:'2026',state:'federal',speaker:'JANE EXAMPLE',party:'Liberal Party of Australia',topic:'housing'})),true);
 for(const f of [{kind:'contract'},{from:'2026'},{to:'2023'},{state:'qld'},{speaker:'Other'},{party:'Labor'},{topic:'health'}])assert.equal(matchesCatalogFilters(meta,new URLSearchParams(f)),false);
 assert.equal(matchesCatalogFilters(['donor',0,0,'federal','','',''],new URLSearchParams({from:'2024'})),false);
});
test('source filters and result windows stay bounded on common words',async()=>{
 const result=await find('contract',{kind:'contract',state:'federal'});
 assert.ok(result.total>200);assert.equal(result.results.length,200);assert.equal(result.truncated,true);
 const state=await find('Woodside',{kind:'contract',state:'qld'});assert.equal(state.total,0);
});

test('new agency profiles are discoverable with their direct destination',async()=>{
 const result=await find('Department of Defence',{kind:'agency'});
 assert.equal(result.results[0].title,'Department of Defence');
 assert.match(result.results[0].href,/^\/subject\/agency\/a-/);
});

test('verified invitation venues are searchable and open their own funding stage',async()=>{
 const result=await find('Jabiru Lingiari',{kind:'report'});
 const rows=result.results.filter(r=>['mlci-invitation-067','mlci-invitation-070'].includes(r.record_id));
 assert.equal(rows.length,2);
 for(const r of rows){
  const href=new URL(r.href,'https://opax.com.au');
  assert.equal(href.searchParams.get('stage'),'invitations');
  assert.equal(href.searchParams.get('project'),r.record_id);
  assert.match(r.snippet,/56 Kinchela Road/);
  assert.match(r.snippet,/Not an awarded grant or payment/);
  assert.match(r.snippet,/Venue point only/);
 }
 const unresolved=await find('Brockman',{kind:'report'});
 const row=unresolved.results.find(r=>r.record_id==='mlci-invitation-069');
 assert.ok(row);assert.equal(new URL(row.href,'https://opax.com.au').searchParams.get('view'),'list');
 assert.doesNotMatch(row.snippet,/Verified venue:/);
});
