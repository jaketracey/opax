import test from 'node:test';
import assert from 'node:assert/strict';
import {grantsTableConfig,GRANTS_COVERAGE} from '../public/grants-table.js';
import {tableRows} from '../../scripts/load_tables.mjs';
import {tableApi} from '../src/table-api.ts';
import {tableDatabase} from './table-d1-harness.mjs';
import {dataTableHTML,toCSV,mountDataTable} from '../public/datatable.js';
import {tableHarness} from './datatable-harness.mjs';
const rows=[
 {id:'fixture-1',recipient:'EXAMPLE, ALEX',recipientKind:'person',recipientId:'name:fixture-1',recipientAvailable:1,jurisdiction:'federal',program:'Fixture facilities',agency:'Fixture services',amount:25000.75,start_date:'2026-08-19',electorate:'Fixture district',description:'42 Fixture Road'},
 {id:'fixture-2',recipient:'Fixture organisation',recipientKind:'company',recipientId:'name:fixture-2',recipientAvailable:0,jurisdiction:'federal',program:'Fixture research',agency:'Fixture services',amount:5000,start_date:'2025-01-01',electorate:'Fixture district',description:'87 Fixture Street'},
];
const config=grantsTableConfig();
test('grants retains all source recipients and links only to existing profiles',()=>{
 assert.deepEqual(config.columns.map(c=>c.key),['recipient','program','agency','amount','start_date','electorate']);
 assert.deepEqual(config.defaultSort,{key:'amount',dir:'desc'});
 assert.deepEqual(grantsTableConfig(new URLSearchParams({jur:'qld'})).source.params,{'f.jurisdiction':'["qld"]'});
 assert.equal(Object.hasOwn(config,'privacy'),false);assert.equal(Object.hasOwn(config,'rowPrivacyCheck'),false);
 assert.ok(!GRANTS_COVERAGE.includes('Only organisations'));
 assert.equal(config.primaryLink(rows[0]),'/money/grants/federal/recipient/name%3Afixture-1');assert.equal(config.primaryLink(rows[1]),null);
 const html=dataTableHTML(config,{rows,total:2,page:1,pageSize:50});assert.ok(html.includes(rows[0].recipient));assert.ok(toCSV(rows,config).includes(rows[0].recipient));
});
test('D1 grants keeps source rows, alternative facets, name search and CSV amounts',async()=>{
 const local=await tableDatabase({datasets:{grants:rows.map(row=>({row}))}});
 try{
  const api=params=>tableApi(new Request('https://local.invalid/api/table/grants?'+new URLSearchParams(params)),{TABLE_DB:local.db});
  const page=await (await api({'f.program':'["Fixture facilities"]'})).json();
  assert.equal(page.total,1);assert.equal(page.facets.program.length,2);
  assert.deepEqual((await (await api({'f.amount':'{"min":20000}'})).json()).facets.amount,{min:5000,max:25000.75});
  for(const q of ['EXAMPLE, ALEX','facilities'])assert.equal((await (await api({q})).json()).total,1);
  for(const q of ['42 Fixture Road','Fixture district','2026-08-19','25000'])assert.equal((await (await api({q})).json()).total,0);
  const csv=await (await api({format:'csv'})).text();assert.ok(csv.includes(rows[0].recipient));assert.ok(csv.includes('25000.75'));
 }finally{await local.close();}
});
test('grants hydration uses one data request and no privacy POST',async()=>{
 const h=tableHarness('http://localhost/money/grants');let calls=0;
 h.win.fetch=async(input,options)=>{calls++;assert.equal(new URL(input).pathname,'/api/table/grants');assert.notEqual(options?.method,'POST');return Response.json({rows,total:2,page:1,pageSize:50,facets:{}});};
 const handle=mountDataTable(h.root,config);for(let i=0;i<10 && !h.html().includes('Showing 1–2 of 2');i++)await new Promise(setImmediate);
 assert.ok(h.html().includes(rows[0].recipient));assert.equal(calls,1);handle.destroy();
});
test('real grant exports keep exact source award counts without anonymous aggregates',async()=>{
 const loaded=await tableRows(new URL('../public/',import.meta.url).pathname,{moneyOnly:true});
 assert.ok(loaded.rows.grants.length>100000);assert.ok(loaded.rows.grants.every(({row})=>!row.aggregate && !String(row.id).startsWith('aggregate:')));
 assert.ok(loaded.rows.grants.map(({row})=>config.primaryLink(row)).filter(Boolean).length>0);
});
