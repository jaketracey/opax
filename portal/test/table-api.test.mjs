import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TABLE_DATASETS} from '../src/table-datasets.mjs';
import {tableApi} from '../src/table-api.ts';
import {tableDatabase} from './table-d1-harness.mjs';
import {registerServerCSVContract} from './datatable-endpoint-contract.mjs';

const rows=Object.fromEntries(Object.entries(TABLE_DATASETS).map(([name,c])=>[name,Array.from({length:260},(_,i)=>({row:Object.fromEntries(c.columns.map(col=>[col.key,col.key==='id' ? 'item-'+i : ['money','count'].includes(col.type) ? i+0.25 : col.type==='year' ? 2000+i : col.type==='category' ? (['portfolios','sectors','entities'].includes(col.key) ? ['Group '+i%2] : 'Group '+i%2) : col.type==='date' ? '2024-01-01' : col.key==='abn' ? '' : i===3 ? 'Needle record' : 'Record '+i]))}))]));
const local=await tableDatabase({datasets:rows});test.after(()=>local.close());
const env={TABLE_DB:local.db,CACHE_EPOCH:'test'};
const fetchTable=(name,query='',init)=>tableApi(new Request('https://opax.com.au/api/table/'+name+'?'+query,init),env);

for(const [name,config]of Object.entries(TABLE_DATASETS))test(name+': paging, sorting, facets, CSV and caps',async()=>{
  let r=await fetchTable(name,'page=2&pageSize=200');assert.equal(r.status,200);let page=await r.json();assert.equal(page.total,260);assert.equal(page.rows.length,60);assert.equal(page.page,2);
  const numeric=config.columns.find(c=>['money','count','year'].includes(c.type));
  r=await fetchTable(name,'sort='+numeric.key+':asc&pageSize=999');page=await r.json();assert.equal(page.rows.length,200);assert.equal(page.rows[0][numeric.key],numeric.type==='year' ? 2000 : 0.25);
  assert.deepEqual(page.facets[numeric.key],numeric.type==='year' ? {min:2000,max:2259} : {min:0.25,max:259.25});
  const cat=config.columns.find(c=>c.type==='category');assert.equal(page.facets[cat.key].length,2);assert.equal(page.facets[cat.key][0].count,130);
  r=await fetchTable(name,'q=needle');page=await r.json();assert.equal(page.total,1);assert.equal(page.rows[0].id,'item-3');assert.equal(r.headers.get('x-robots-tag'),'noindex');
  const filter=new URLSearchParams({['f.'+cat.key]:JSON.stringify(['Group 0']),['f.'+numeric.key]:JSON.stringify(numeric.type==='year' ? {min:2010,max:2020} : {min:10,max:20})});
  r=await fetchTable(name,filter);page=await r.json();assert.equal(page.total,numeric.type==='year' ? 6 : 5);assert.ok(page.rows.every(row=>[row[cat.key]].flat().includes('Group 0')&&row[numeric.key]>=(numeric.type==='year' ? 2010 : 10)&&row[numeric.key]<=(numeric.type==='year' ? 2020 : 20)));
  r=await fetchTable(name,'format=csv');const csv=await r.text();assert.equal(r.headers.get('x-table-exported'),'260');assert.equal(r.headers.get('x-table-truncated'),'false');assert.equal(csv.split('\r\n').length,262);assert.ok(csv.includes(numeric.type==='year' ? '2000' : '0.25'));
});
test('bad dataset is 404; invalid state and methods return fixed JSON errors',async()=>{
  assert.equal((await fetchTable('bad-dataset')).status,404);
  for(const q of ['page=0','sort=not-a-column:desc','f.amount.min=4','f.amount=%5B%224%22%5D','format=bad','f.agency=literal','q=a&q=b'])assert.equal((await fetchTable('contracts',q)).status,400,q);
  const response=await fetchTable('contracts','',{method:'POST'});assert.equal(response.status,405);assert.deepEqual(await response.json(),{error:'method_not_allowed'});
});

test('canonical state uses JSON filters, normalises order and supports conditional caching',async()=>{
  const a=await fetchTable('contracts',new URLSearchParams({'f.amount':'{"max":100,"min":10}',q:' NEEDLE '}));
  const b=await fetchTable('contracts',new URLSearchParams({q:'needle','f.amount':'{"min":10,"max":100}'}));assert.equal(a.headers.get('etag'),b.headers.get('etag'));
  const cached=await fetchTable('contracts',new URLSearchParams({q:'needle','f.amount':'{"min":10,"max":100}'}),{headers:{'if-none-match':b.headers.get('etag')}});assert.equal(cached.status,304);assert.equal(cached.headers.get('x-robots-tag'),'noindex');
});

test('core serializer and D1 API integrate with category and range state',async()=>{
  // Exercise core query exports without replacing its public module.
  // The approved core is imported directly; no contract stub is substituted.
  const core=await import('../public/datatable.js');
  for(const prefix of [undefined,'t']){
    const query={filters:{jurisdiction:['Group 0'],amount:{min:10,max:20}},sort:{key:'amount',dir:'asc'},pageSize:2,page:2};
    const response=await fetchTable('contracts',core.serializeQuery(query,prefix));assert.equal(response.status,200);
    const page=await response.json();assert.equal(page.total,5);assert.deepEqual(page.rows.map(r=>r.amount),[14.25,16.25]);
  }
});
test('facet computation is bounded even with more than 100 distinct values',async()=>{
  await local.db.batch(Array.from({length:110},(_,i)=>local.db.prepare('INSERT INTO table_contracts_facets (key,value,rowid) VALUES (?,?,?)').bind('agency','Facet '+i,i+1)));
  const page=await(await fetchTable('contracts')).json();assert.equal(page.facets.agency.length,100);
});
test('core-sized category arrays use bounded SQL bindings',async()=>{
  const values=Array.from({length:100},(_,i)=>'Group '+i);
  const response=await fetchTable('contracts',new URLSearchParams({'f.agency':JSON.stringify(values),'f.jurisdiction':JSON.stringify(values)}));
  assert.equal(response.status,200);assert.equal((await response.json()).total,260);
});

test('CSV pages are bounded, retryable and retain the 50,000-row export ceiling',async()=>{
  await local.db.prepare("WITH RECURSIVE n(x) AS (SELECT 261 UNION ALL SELECT x+1 FROM n WHERE x<50100) INSERT INTO table_votes (rowid,id,name,ayes,search) SELECT x,'cap-'||x,'Record',x,'Record' FROM n").run();
  let path='/api/table/votes?format=csv&sort=ayes:asc',previousETag,last;
  const values=[];
  for(let page=1;page<=5;page++){
    const response=await tableApi(new Request('https://opax.com.au'+path),env);last=response;
    assert.equal(response.headers.get('x-table-total'),'50100');assert.equal(response.headers.get('x-table-exported'),'10000');assert.equal(response.headers.get('x-table-page'),String(page));assert.equal(response.headers.get('x-table-export-truncated'),'true');
    assert.notEqual(response.headers.get('etag'),previousETag);previousETag=response.headers.get('etag');
    const records=(await response.text()).split('\r\n');assert.equal(records.length,page===5 ? 10004 : 10003);
    const note=response.headers.get('x-table-export-note');assert.ok(note.includes('export limited to the first 50,000 rows'));assert.ok(records[10001].startsWith('"'+note));
    if(page===5)assert.equal(records[10002],'# Export truncated at 50,000 rows.');
    for(const record of records.slice(1,10001))values.push(Number(record.split(',')[TABLE_DATASETS.votes.columns.findIndex(c=>c.key==='ayes')]));
    const next=/<([^>]+)>; rel="next"/.exec(response.headers.get('link')||'');
    assert.equal(Boolean(next),page<5);if(page<5){path=next[1];assert.equal(new URL(path,'https://opax.com.au').searchParams.get('page'),String(page+1));}
  }
  assert.equal(values.length,50000);assert.equal(new Set(values).size,50000);assert.equal(values[0],0.25);assert.equal(values.at(-1),50000);
  assert.ok(last.headers.get('link').includes('rel="prev"'));
  const beyond=await fetchTable('votes','format=csv&page=6');assert.equal(beyond.headers.get('x-table-exported'),'0');assert.ok(!(beyond.headers.get('link')||'').includes('rel="next"'));
});
test('CSV continuation links preserve filters and sorting within an uncapped logical export',async()=>{
  const state=new URLSearchParams({'f.ayes':JSON.stringify({min:1000,max:12000}),sort:'ayes:desc',format:'csv'});
  const first=await fetchTable('votes',state);assert.equal(first.headers.get('x-table-total'),'11001');assert.equal(first.headers.get('x-table-exported'),'10000');assert.equal(first.headers.get('x-table-export-truncated'),'false');
  const path=/<([^>]+)>; rel="next"/.exec(first.headers.get('link'))[1];
  assert.ok((await first.text()).includes('next export: '+path));
  const second=await tableApi(new Request('https://opax.com.au'+path),env);assert.equal(second.headers.get('x-table-exported'),'1001');assert.ok(!(second.headers.get('link')||'').includes('rel="next"'));
  const records=(await second.text()).split('\r\n');const index=TABLE_DATASETS.votes.columns.findIndex(c=>c.key==='ayes');assert.equal(Number(records[1].split(',')[index]),2000);assert.equal(Number(records[1001].split(',')[index]),1000);
});

let coreCSV;
registerServerCSVContract(test,{
  name:'D1 table endpoint',
  limit:10000,
  note:response=>'"'+response.headers.get('x-table-export-note')+'"'+','.repeat(TABLE_DATASETS.votes.columns.length-1),
  seed:async records=>{coreCSV=await tableDatabase({datasets:{votes:records.map(row=>({row:{id:row.id,name:row.name,ayes:row.amount}}))}});},
  request:async search=>{try{return await tableApi(new Request('https://opax.com.au/api/table/votes'+search),{TABLE_DB:coreCSV.db});}finally{test.after(()=>coreCSV.close());}},
});
