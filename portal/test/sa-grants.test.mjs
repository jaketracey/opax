import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {saGrantsConfig,saGrantsPhoneColumns} from '../public/sa-grants-table.js';
import {toCSV,applyQuery} from '../public/datatable.js';

const bundle=await build({entryPoints:[new URL('../src/sa-grants.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {saGrantsRows,saGrantsPage,saGrantsReader}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const CC='https://creativecommons.org/licenses/by/4.0/';
const id='00000000-0000-0000-0000-000000000001';
const dataset='grants-sa-funded-projects-2016-2017',dataset_url='https://data.sa.gov.au/data/dataset/'+dataset;
const award={recipient:'Avery Example',project_title:'Example community project',project_description:'Example published record description',region:'Example region',amount_as_published:'$1,250 ',amount:1250,year:'2016-17',programme:'Grants SA',sheet:'CSV',source_row:2};
const doc={id,title:'Example resource 2016-2017',programme:'Grants SA',year:'2016-17',dataset,dataset_title:'Example dataset',publisher:'Example public agency',dataset_url,resource_url:dataset_url+'/resource/'+id,snapshot:'2026-10-21T00:00:00+00:00',sha256:'a'.repeat(64),licence:{url:CC,dataset_explicit:true,resource_explicit:true,file_notices_reviewed:true,exceptions:[]},attribution:'Example attribution',notes:[],status:'cleared',source_rows:{'CSV!2':award}};
const row={...award,resource_id:id,dataset,dataset_url,source_url:doc.resource_url,snapshot:doc.snapshot,sha256:doc.sha256,licence:'CC BY 4.0',licence_url:CC};
const fixture=()=>structuredClone({schema:1,generated_at:doc.snapshot,documents:[doc],rows:[row],holds:[]});
const block=(title,description,links='')=>`<h1>${title}</h1><p>${description}</p>${links}`;
const page=async(h,url='https://opax.com.au/register/sa-grants')=>saGrantsPage(new URL(url),async()=>h,block);

test('server renders bounded historical awards, source receipt and shared table',async()=>{
 const result=await page(fixture());assert.equal(result.status,200);
 const d=new JSDOM(result.prerender).window.document;
 assert.equal(d.querySelectorAll('tbody tr').length,1);
 assert.match(d.body.textContent,/not current SA-wide grants coverage/);
 assert.match(d.body.textContent,/not proof of payment/);
 for(const text of ['Source:','Dataset:','Resource:','Year:','Snapshot:','CC BY 4.0','SHA-256','Resource UUID:'])assert.ok(d.body.textContent.includes(text));
 assert.deepEqual(saGrantsPhoneColumns,['recipient','year','amount']);
 assert.equal(d.querySelector('[data-label="Amount"]').textContent,'$1,250.00');
 assert.ok(d.querySelector('[data-sa-grants-column="year"]'));
});

test('private-person text stays in its record, with no identity links, facets or joins',async()=>{
 const h=fixture();Object.assign(h.rows[0],{person_id:'synthetic-person',recipient_id:'synthetic-person',href:'/person/avery-example',internal_total:987654321});
 const rows=saGrantsRows(h),config=saGrantsConfig(rows,id);
 assert.equal(config.columns.find(c=>c.key==='recipient').facet,undefined);
 assert.equal(config.primaryLink,undefined);
 assert.deepEqual(config.columns.filter(c=>c.facet).map(c=>c.key),['year']);
 const d=new JSDOM((await page(h)).prerender).window.document;
 assert.equal(d.querySelector('[data-label="Recipient"]').textContent,'Avery Example');
 assert.equal(d.querySelector('[data-label="Recipient"] a'),null);
 assert.doesNotMatch(d.body.innerHTML,/synthetic-person|\/person\/|recipient_id|internal_total|987654321/);
 assert.doesNotMatch(toCSV(rows,config),/person_id|recipient_id|internal_total|987654321/);
 assert.equal(applyQuery(rows,config,{}).facets.recipient,undefined);
});

test('all numerical outputs exclude computed, unknown, altered and held source rows',async()=>{
 const h=fixture();
 h.rows.push({...row,source_row:999,amount:987654321,computed:true},{...row,source_row:998,amount:876543219},{...row,amount:765432198});
 assert.equal(saGrantsRows(h).length,1);
 for(const output of [(await page(h)).prerender,toCSV(saGrantsRows(h),saGrantsConfig(saGrantsRows(h),id))])assert.doesNotMatch(output,/987654321|876543219|765432198|internal_total|computed/);
 for(const key of ['dataset_explicit','resource_explicit','file_notices_reviewed']){
  const bad=fixture();bad.documents[0].licence[key]=false;assert.equal(saGrantsRows(bad).length,0);
 }
 for(const key of ['hold','computed','derivation']){
  const bad=fixture();if(key==='hold')bad.documents[0].hold='Example hold';else bad.rows[0][key]=true;
  assert.equal(saGrantsRows(bad).length,0);
 }
 const bad=fixture();bad.documents[0].dataset='premier-s-community-initiatives-fund';assert.equal(saGrantsRows(bad).length,0);
});

test('missing reviewed asset fails closed and requests no staged path',async()=>{
 const paths=[];const reader=saGrantsReader({async fetch(request){paths.push(new URL(request.url).pathname);return new Response('',{status:404});}});
 const result=await saGrantsPage(new URL('https://opax.com.au/register/sa-grants'),reader,block);
 assert.equal(result.status,404);assert.equal(result.noindex,true);assert.deepEqual(paths,['/sa-grants/data.json']);
 assert.doesNotMatch(result.prerender,/Avery Example|1250/);
});

test('held successful files show only source metadata, never awards or diagnostics',async()=>{
 const h=fixture(),dataset='premier-s-community-initiatives-fund';
 h.holds=[{...doc,dataset,dataset_url:'https://data.sa.gov.au/data/dataset/'+dataset,resource_url:'https://data.sa.gov.au/data/dataset/'+dataset+'/resource/'+id,year:'2008-09',title:'Successful Organisations PCIF 2008-09',hold:'Original file 404',amount:987654321,recipient:'Synthetic excluded person',internal_total:876543219}];
 const result=await page(h);
 assert.match(result.prerender,/original download returned 404/);
 assert.match(result.prerender,/not a workbook/);
 assert.doesNotMatch(result.prerender,/987654321|876543219|Synthetic excluded person/);
});

test('query and CSV keep source coordinates without publishing programme totals',async()=>{
 const rows=saGrantsRows(fixture()),csv=toCSV(rows,saGrantsConfig(rows,id));
 assert.match(csv,/Resource UUID/);assert.match(csv,/CSV row 2/);assert.match(csv,/\$1,250/m);
 assert.equal(csv.split('\r\n').length,2);
 assert.equal((await page(fixture(),'https://opax.com.au/register/sa-grants?sa00000000.q=Example')).noindex,true);
});

test('catalogue and MCP never read SA staging or publish derived SA amounts',()=>{
 for(const path of ['../../scripts/build_search_catalog.mjs','../src/community-mcp.ts'])assert.doesNotMatch(readFileSync(new URL(path,import.meta.url),'utf8'),/sa-grants|scripts\.sa_grants|data\/staged/);
 const walk=dir=>readdirSync(dir).flatMap(name=>{const p=new URL(name,dir);return statSync(p).isDirectory()?walk(new URL(name+'/',dir)):[p];});
 for(const file of walk(new URL('../public/search-catalog/',import.meta.url)).filter(f=>f.pathname.endsWith('.json')))assert.doesNotMatch(readFileSync(file,'utf8'),/sa-grants\/data\.json|internal_total|0760d21e-8344-4462-b305-2f7f92f22f72/);
});

test('MCP fixture search remains outside the historical grant candidate',async()=>{
 const mcp=await build({entryPoints:[new URL('../src/community-mcp.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
 const {communityMcp}=await import('data:text/javascript;base64,'+Buffer.from(mcp.outputFiles[0].text).toString('base64'));
 const env={COMMUNITY_ENABLED:'true',COMMUNITY_ORIGIN:'https://opax.com.au',COMMUNITY_DB:{prepare(sql){return {bind(){return this;},async first(){return sql.startsWith('SELECT m.')?{id:'fixture-member',key_id:'fixture-key'}:{hits:1};},async run(){return {success:true};}};}},ASSETS:{async fetch(){throw Error('Must not read candidate');}}};
 const paths=[];
 const response=await communityMcp(new Request('https://opax.com.au/mcp',{method:'POST',headers:{authorization:'Bearer opax_'+'A'.repeat(43),accept:'application/json, text/event-stream','content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'search_records',arguments:{query:'South Australian historical grants',kind:'all'}}})}),env,async path=>{paths.push(path);return Response.json({results:[],total:0});});
 assert.equal(response.status,200);assert.equal(paths.length,1);assert.ok(paths[0].startsWith('/api/search-all?'));
 assert.doesNotMatch(await response.text(),/Avery Example|sa-grants|1250|internal_total/);
});
