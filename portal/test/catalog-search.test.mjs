import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {searchCatalog,matchesCatalogFilters} from '../src/catalog-search.ts';
import {tokens,normalize,bucket} from '../src/catalog-query.mjs';
import {programRecord,programKey} from '../../scripts/build_search_catalog.mjs';
import {reportsPublished} from '../../scripts/reports_flag.mjs';
const assets={fetch:async request=>{
 const path=new URL(request.url).pathname;
 assert.match(path,/^\/search-catalog\/(manifest\.json|[a-f0-9]{16}\/(meta|meta-core|report-names|terms-\d+|records-\d+)\.json)$/);
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
 // Report rows (the reports and the grants-allocation research) follow REPORTS_ENABLED.
 for(const kind of ['person','agency','donor','receipt','grant','bill','interest','expense','access','campaigner',...(reportsPublished()?['report']:[])])assert.ok(manifest.counts[kind]>0,kind);
 assert.ok(manifest.counts.report>=2250,'official report records remain published independently of research essays');
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
 // They open the grants-allocation explorer, so they are searchable only while the reports are published.
 if(!reportsPublished()){assert.equal((await find('Jabiru Lingiari',{kind:'report'})).total,0);return;}
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
test('the 226 active invited projects resolve to the GO7867 program view, invited and not awarded, whatever REPORTS_ENABLED says',async()=>{
 const {readdir}=await import('node:fs/promises');
 const manifest=JSON.parse(await readFile(new URL('../public/search-catalog/manifest.json',import.meta.url)));
 const dir=new URL(`../public/search-catalog/${manifest.version}/`,import.meta.url);
 const records=[];
 for(const f of (await readdir(dir)).filter(f=>/^records-\d+\.json$/.test(f)))records.push(...JSON.parse(await readFile(new URL(f,dir))));
 const mlci=JSON.parse(await readFile(new URL('../public/research/mlci.json',import.meta.url)));
 const invited=records.filter(r=>/^mlci-invitation-\d+$/.test(r.record_id||''));
 assert.equal(invited.length,226);
 assert.equal(invited.length,mlci.projects.filter(p=>p.status!=='Withdrawn').length);
 const view='/money/grants?jur=federal&program=GO7867';
 for(const r of invited){
  assert.equal(r.href,view,r.record_id);assert.equal(r.kind,'grant');
  assert.match(r.title,/\(invited project, not awarded\)$/);assert.match(r.snippet,/^Invited to apply, not awarded: /);
  assert.equal(r.url,mlci.projects.find(p=>p.id===r.record_id).source_url);
 }
 assert.equal(records.find(r=>r.record_id==='research-cpi-mlci-2026')?.href,view,'the CPI comparison');
 assert.equal(records.find(r=>r.title==='Major and Local Community Infrastructure Program: invited projects and awards')?.href,view,'the program summary');
 assert.equal(records.filter(r=>String(r.href).startsWith('/reports')).length,reportsPublished()?records.filter(r=>r.kind==='report' && !r.report_type).length:0);
 assert.ok(!records.some(r=>/^\/reports\/grants-allocation/.test(r.href)&&/^mlci-invitation-/.test(r.record_id||'')));
 assert.doesNotMatch(JSON.stringify(invited),/rort|pork|bias/i);
 const found=await find('Chisholm Cricket',{kind:'grant'});
 assert.ok(found.results.some(r=>r.record_id==='mlci-invitation-001'&&r.href===view));
});

test('unfiltered searches read meta-core.json and return exactly what meta.json gives; filters read meta.json',async()=>{
 const kinds=['grant','contract','person'],states=['qld','vic',''];
 const meta=Array.from({length:600},(_,i)=>[kinds[i%3],2000+i%20,i%7?2001+i%25:null,states[i%3],i%5?'labor':'greens','',i%4?'health':'']);
 const records=meta.map((m,i)=>({kind:m[0],title:'Record '+i,href:'/r/'+i,snippet:'',slug:'r-'+i,resource:'r'+i,...(i%9?{date:'20'+String(10+i%15)+'-01-01'}:{})}));
 const terms=Object.fromEntries(Array.from({length:64},(_,b)=>[b,{}]));
 for(let id=0;id<meta.length;id++){(terms[bucket('water')].water??=[]).push(id,1+id%3);(terms[bucket('wattle')].wattle??=[]).push(id,id%2?8:1);if(id%2===0)(terms[bucket('bridge')].bridge??=[]).push(id,id%11?1:8)}
 const kindIndex=new Map(kinds.map((k,i)=>[k,i]));
 const files={meta,'meta-core':{kinds,kind:meta.map(m=>kindIndex.get(m[0])),to:meta.map(m=>m[2])},...Object.fromEntries(Object.entries(terms).map(([b,p])=>['terms-'+b,p]))};
 for(let i=0;i<meta.length;i+=256)files['records-'+i/256]=records.slice(i,i+256);
 // Separate module instances, so each keeps its own isolate cache: one catalogue has meta-core.json, one predates it.
 const withCore=await import('../src/catalog-search.ts?core'),without=await import('../src/catalog-search.ts?full');
 const seen=[];
 const catalog=core=>({fetch:async request=>{
  const path=new URL(request.url).pathname;if(core)seen.push(path.split('/').pop());
  if(path==='/search-catalog/manifest.json')return Response.json({version:'0123456789abcdef',count:meta.length,counts:{},recordShardSize:256,coverage:'fixture'});
  const name=path.split('/').pop().replace(/\.json$/,'');
  return name in files && (core || name!=='meta-core') ? Response.json(files[name]) : new Response('missing',{status:404});
 }});
 const url=params=>new URL('https://opax.com.au/api/search-all?'+new URLSearchParams(params));
 const unfiltered=[{q:'water'},{q:'wat'},{q:'water bridge'},{q:'water',kind:'grant'},{q:'wattle',kind:'person'},{q:'water',state:''}];
 const filtered=[{q:'water',state:'qld'},{q:'water',party:'Greens'},{q:'water',from:'2010'},{q:'water',to:'2005'},{q:'water',topic:'health'},{q:'water bridge',kind:'grant',from:'2012'}];
 for(const [cases,metaRead] of [[unfiltered,false],[filtered,true]]){
  for(const params of cases)for(const options of [{},{perKind:2},{anyTerms:true,perKind:16}])
   assert.deepEqual(await withCore.searchCatalog(url(params),catalog(true),options),await without.searchCatalog(url(params),catalog(false),options),JSON.stringify(params));
  assert.ok(seen.includes('meta-core.json'));assert.equal(seen.includes('meta.json'),metaRead);
 }
});

test('a paged search orders rows from dates.json, reads only the shards a page shows, and matches searchCatalog',async()=>{
 const kinds=['grant','contract','person'];
 const meta=Array.from({length:900},(_,i)=>[kinds[i%3],2000+i%20,i%7?2001+i%25:null,'qld','','','']);
 const records=meta.map((m,i)=>({kind:m[0],title:'Record '+i,href:'/r/'+i,snippet:'',slug:'r-'+i,resource:'r'+i,...(i%9?{date:'20'+String(10+i%15)+'-0'+(1+i%9)+'-1'+i%10}:{})}));
 const terms=Object.fromEntries(Array.from({length:64},(_,b)=>[b,{}]));
 for(let id=0;id<meta.length;id++){(terms[bucket('water')].water??=[]).push(id,1+id%3);if(id%2===0)(terms[bucket('bridge')].bridge??=[]).push(id,id%11?1:8)}
 const kindIndex=new Map(kinds.map((k,i)=>[k,i]));
 const dates=records.map(r=>r.date?Number(r.date.replaceAll('-','')):0);
 const files={meta,'meta-core':{kinds,kind:meta.map(m=>kindIndex.get(m[0])),to:meta.map(m=>m[2])},...Object.fromEntries(Object.entries(terms).map(([b,p])=>['terms-'+b,p]))};
 for(let i=0;i<meta.length;i+=256)files['records-'+i/256]=records.slice(i,i+256);
 const catalog=(seen,dateFile)=>({fetch:async request=>{
  const path=new URL(request.url).pathname;seen.push(path.split('/').pop());
  if(path==='/search-catalog/manifest.json')return Response.json({version:'0123456789abcdef',count:meta.length,counts:{},recordShardSize:256,coverage:'fixture'});
  const name=path.split('/').pop().replace(/\.json$/,'');
  if(name==='dates')return dateFile?Response.json(dateFile):new Response('missing',{status:404});
  return name in files ? Response.json(files[name]) : new Response('missing',{status:404});
 }});
 const url=params=>new URL('https://opax.com.au/api/search-all?'+new URLSearchParams(params));
 const eager=await import('../src/catalog-search.ts?eager');
 // Each case has its own module instance (its own isolate cache): dates.json present, absent, or holding a -1.
 const unreadable=[...dates];unreadable[2]=-1;
 for(const [label,dateFile] of [['dates',dates],['none',null],['unreadable',unreadable]]){
  const paged=await import('../src/catalog-search.ts?paged-'+label);
  // {q:'water'} selects record 2, whose unreadable date sends that search down the up-front path.
  for(const params of [{q:'water'},{q:'water bridge'},{q:'water',kind:'contract'},{q:'water',from:'2010'},{q:'nothing'}]){
   const full=await eager.searchCatalog(url(params),catalog([],null)), seen=[];
   const page=await paged.searchCatalogPaged(url(params),catalog(seen,dateFile));
   assert.equal(page.total,full.total);assert.equal(page.truncated,full.truncated);
   assert.deepEqual(page.stubs.map(({kind,date,sort_date})=>({kind,date,sort_date})),full.results.map(r=>({kind:r.kind,date:r.date||undefined,sort_date:r.date||r.sort_date})),label+' '+JSON.stringify(params));
   const shown=page.stubs.slice(0,5).map(s=>s.id), before=seen.filter(f=>f.startsWith('records-')).length;
   const read=await page.records(shown);
   assert.deepEqual(shown.map(id=>read.get(id)),full.results.slice(0,5).map(({score,sort_date,...record})=>record));
   const shards=new Set(shown.map(id=>Math.floor(id/256))).size;
   const early=!dateFile || page.stubs.some(s=>dateFile[s.id]<0);
   if(!early)assert.equal(seen.filter(f=>f.startsWith('records-')).length,shards,'only the shown rows\' shards');
   else assert.equal(before,new Set(page.stubs.map(s=>Math.floor(s.id/256))).size,'every selected shard, up front');
  }
 }
});
