import test from 'node:test';
import assert from 'node:assert/strict';
import {tableDatabase} from './table-d1-harness.mjs';
import {tableApi} from '../src/table-api.ts';
import {TABLE_DATASETS} from '../src/table-datasets.mjs';
import {divisionTableConfig,voteTableConfig} from '../public/vote-tables.js';
import {registerServerCSVContract} from './datatable-endpoint-contract.mjs';
import {readServerCSV} from '../public/server-csv.js';

for (const kind of ['divisions','votes']) {
  let local;
  registerServerCSVContract(test,{name:`real ${kind} D1 export`,seed:async records=>{
    local=await tableDatabase({datasets:{[kind]:records.map(r=>({row:{id:r.id,title:r.name,date:'2026-08-19',chamber:'Senate',outcome:'Agreed',ayes:r.amount,noes:0,vote:'For the bill',party_position:'Not recorded',bill:['fixture-bill'],person:'fixture-person',sitting:['2026-09-14'],jurisdiction:'federal',href:'/doc/division-fixture'}}))}});
    test.after(()=>local.close());
  },request:async search=>{
    const config=kind==='divisions' ? divisionTableConfig({bill:'fixture-bill'}) : voteTableConfig('fixture-person');
    const url=new URL('https://local.test/api/table/'+kind+search);
    for (const [key,value] of Object.entries(config.source.params)) url.searchParams.set(key,value);
    const exported=await readServerCSV(url.href,(url,init)=>tableApi(new Request(url,init),{TABLE_DB:local.db}));
    return new Response(exported.csv,{headers:exported.headers});
  }});
}
