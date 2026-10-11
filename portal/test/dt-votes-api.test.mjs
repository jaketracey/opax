import test from 'node:test';
import assert from 'node:assert/strict';
import {tableDatabase} from './table-d1-harness.mjs';
import {tableApi} from '../src/table-api.ts';
import {TABLE_DATASETS} from '../src/table-datasets.mjs';
import {divisionTableConfig,voteTableConfig} from '../public/vote-tables.js';
import {registerServerCSVContract} from './datatable-endpoint-contract.mjs';
import {readServerCSV} from '../public/server-csv.js';
import {tablePrivacyIndex} from './datatable-privacy.mjs';

const index=await tablePrivacyIndex();
for (const kind of ['divisions','votes']) {
  let local;
  registerServerCSVContract(test,{name:`real ${kind} D1 export`,seed:async records=>{
    local=await tableDatabase({datasets:{[kind]:records.map(r=>({row:{id:r.id,title:r.name,date:'2026-08-19',chamber:'Senate',outcome:'Agreed',ayes:r.amount,noes:0,vote:'For the bill',party_position:'Not recorded',bill:['fixture-bill'],person:'fixture-person',sitting:['2026-09-14'],jurisdiction:'federal',href:'/doc/division-fixture'}}))},policy:index});
    test.after(()=>local.close());
  },request:async search=>{
    const config=kind==='divisions' ? divisionTableConfig({bill:'fixture-bill'}) : voteTableConfig('fixture-person');
    const url=new URL('https://local.test/api/table/'+kind+search);
    for (const [key,value] of Object.entries(config.source.params)) url.searchParams.set(key,value);
    const exported=await readServerCSV(url.href,(url,init)=>tableApi(new Request(url,init),{TABLE_DB:local.db}));
    return new Response(exported.csv,{headers:exported.headers});
  }});
}
test('real D1 scopes accept the rollout configs and project the visible record columns',async()=>{
  const local=await tableDatabase({datasets:{
    divisions:[{row:{id:'fixture-one',title:'Second reading, 19 Aug 2026',date:'2026-08-19',chamber:'Senate',outcome:'Agreed',ayes:1,noes:0,bill:['fixture-bill'],sitting:['2026-09-14'],jurisdiction:'federal',href:'/doc/division-fixture-one'}},{row:{id:'fixture-two',title:'Other division',bill:['other-bill'],sitting:['other-week']}}],
    votes:[{row:{id:'fixture-vote',title:'Recorded bill',date:'2026-08-19',vote:'For the bill',party_position:'Not recorded',person:'fixture-person',href:'/bill/au-federal-fixture'}},{row:{id:'fixture-other',title:'Other bill',person:'other-person'}}],
  },policy:index});
  try {
    for(const config of [divisionTableConfig({bill:'fixture-bill'}),divisionTableConfig({jurisdiction:'federal',start:'2026-09-14',end:'2026-09-17'}),voteTableConfig('fixture-person')]) {
      const url=new URL('https://local.test'+config.source.endpoint);
      for(const [key,value] of Object.entries(config.source.params)) url.searchParams.set(key,value);
      url.searchParams.set('sort','date:desc');
      const response=await tableApi(new Request(url),{TABLE_DB:local.db});
      assert.equal(response.status,200); const page=await response.json();
      assert.equal(page.total,1); for(const c of config.columns) assert.ok(Object.hasOwn(page.rows[0],c.key));
    }
    // ABNs and recipient aliases exercise the real hashed D1 rejection index.
    for(const kind of ['divisions','votes']) for(const value of [index.recipients[0],index.recipientABNs[0]]) {
      const url=new URL('https://local.test/api/table/'+kind);url.searchParams.set('q',value);
      const response=await tableApi(new Request(url),{TABLE_DB:local.db}); const page=await response.json();
      assert.equal(page.total,0);assert.deepEqual(page.rows,[]);assert.deepEqual(page.facets,{});
      assert.equal(response.headers.get('content-location'),null);
      assert.ok(index.safe(JSON.stringify(page)));
    }
  } finally {await local.close();}
});
