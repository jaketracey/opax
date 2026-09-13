import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {searchCatalog,matchesCatalogFilters} from '../src/catalog-search.ts';
import {tokens,normalize,bucket} from '../src/catalog-query.mjs';
import {programRecord,programKey} from '../../scripts/build_search_catalog.mjs';
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

test('grant program rows follow the program contract: key, title, deep link, snippet and a stable slug',()=>{
 assert.equal(programKey('GO3141'),'go3141');
 assert.equal(programKey('activity:Some title'),'activity-some-title');
 assert.equal(programKey('  Transport Service Contracts (QLD) '),'transport-service-contracts-qld');
 assert.equal(programKey('a'.repeat(100)).length,80);
 // Fixture index with two listed programs: one federal row with the new cnc/selk columns, one QLD row without them.
 const index={meta:{jurisdiction:'federal'},agencies:['Department of Health','Department of Infrastructure, Transport, Regional Development, Communications and the Arts'],programs:[
  {id:'GO3141',key:'go3141',n:'Community Development Grants',ag:1,t:1294810388,c:530,r:383,dt:71413000,dr:7,adhoc:0,y0:'2013-14',y1:'2022-23',cnc:900000000,selk:1200000000,gov:500000000,elk:1000000000,marg:200000000},
  {id:'Transport Service Contracts',n:'Transport Service Contracts',ag:0,t:12311691092,c:6,r:1,dt:0,dr:0,adhoc:0,y0:'2017-18',y1:'2024-25'}
 ]};
 const [federal,qld]=[programRecord('federal',index.programs[0],index.agencies),programRecord('qld',index.programs[1],['Transport and Main Roads (DTMR)'])];
 assert.equal(federal.key,'federal:grant-program:GO3141');
 assert.equal(federal.kind,'grant');
 assert.equal(federal.title,'Community Development Grants (grant program)');
 assert.equal(federal.href,'/money/grants?jur=federal&program=GO3141');
 assert.equal(federal.snippet,'$1,294,810,388.00 across 530 grants to 383 recipients, Department of Infrastructure, Transport, Regional Development, Communications and the Arts; 75% closed non-competitive where recorded');
 assert.equal(federal.extra.slug,'grant-program-federal-go3141');
 assert.equal(federal.extra.record_id,'GO3141');
 assert.equal(federal.extra.state,'federal');
 assert.equal(federal.extra.from,2013);assert.equal(federal.extra.to,2022);
 assert.equal(federal.extra.source,'Grant program profile');
 assert.match(federal.extra.aliases,/GO3141 go3141/);
 assert.equal(qld.kind,'grant');
 assert.equal(qld.title,'Transport Service Contracts (grant program)');
 assert.equal(qld.href,'/money/grants?jur=qld&program=Transport+Service+Contracts');
 assert.equal(qld.snippet,'$12,311,691,092.00 across 6 grants to 1 recipients, Transport and Main Roads (DTMR)');
 assert.doesNotMatch(qld.snippet,/closed non-competitive/);
 assert.equal(qld.extra.slug,'grant-program-qld-transport-service-contracts');
 assert.equal(new URL(qld.href,'https://opax.com.au').searchParams.get('program'),'Transport Service Contracts');
 // The MCP recognises a program row by this slug shape, independent of its catalog position.
 for(const r of [federal,qld])assert.match(r.extra.slug,/^grant-program-(federal|qld)-[a-z0-9-]{1,80}$/);
});

test('grant recipient and award search hits open the standalone recipient profile',async()=>{
 const result=await find('64062160614',{kind:'grant'});
 const profile=result.results.find(row=>row.source==='Grant recipient profile');
 assert.ok(profile);assert.match(profile.title,/Serendipity/i);
 assert.equal(profile.href,'/money/grants/federal/recipient/abn%3A64062160614');
 assert.ok(result.results.filter(row=>row.record_id?.startsWith('GA')).every(row=>row.href===profile.href));
});
