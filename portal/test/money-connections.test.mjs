import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {moneyConnectionsConfig,filterMoneyConnectionView,prepareMoneyConnectionsConfig} from '../public/money-connections.js';
import {moneyFlowType} from '../public/money-records.js';
import {applyQuery} from '../public/datatable.js';
const read=async file=>JSON.parse(await readFile(new URL('../public/'+file,import.meta.url),'utf8'));
const cents=value=>BigInt(Math.round((Number(value)||0)*100));
for(const view of ['federal','qld','vic','tas'])test(`${view}: shown source rows conserve every amount and record count`,async()=>{
  const graph=await read(`graph/money${view==='federal'?'':'.'+view}.json`);
  for(const params of ['', 'type=receipts','type=contracts','type=grants','min=1000000']){
    const base=filterMoneyConnectionView(graph,new URLSearchParams(params)),nodes=new Map(base.nodes.map(n=>[n.id,n])),config=moneyConnectionsConfig(base),page=applyQuery(config.rows,config,{pageSize:2000});
    assert.equal(page.total,config.rows.length,'the core preserves every source connection');
    assert.ok(page.rows.every(row=>!row.aggregate));
    for(const type of ['receipts','contracts','grants']){
      const edges=base.edges.filter(e=>moneyFlowType(e,nodes)===type),source=edges.reduce((sum,e)=>sum+cents(e.total),0n);
      const hasColumn=config.columns.some(c=>c.key===type),singleType=new Set(base.edges.map(e=>moneyFlowType(e,nodes))).size===1 && edges.length>0;
      const shown=page.rows.reduce((sum,row)=>sum+cents(hasColumn?row[type]:singleType?row.value:0),0n);
      assert.equal(shown,source,`${type}: exact cents for ${params || 'all connections'}`);
    }
    assert.equal(page.rows.reduce((sum,row)=>sum+(row.records||0),0),base.edges.filter(e=>moneyFlowType(e,nodes)).reduce((sum,e)=>sum+e.count,0),'record counts reconcile');
  }
});

test('browser and SSR use identical source rows without remote validation',async()=>{
 const graph={nodes:[{id:'agency:fixture',kind:'agency',label:'Fixture agency'},{id:'supplier:fixture',kind:'supplier',label:'Fixture individual supplier'},{id:'supplier:public',kind:'supplier',label:'Public fixture Pty Ltd'}],edges:[{source:'agency:fixture',target:'supplier:fixture',flow:'contracts',total:40,count:2,firstYear:2020,lastYear:2021},{source:'agency:fixture',target:'supplier:public',flow:'contracts',total:60,count:3,firstYear:2020,lastYear:2021}]};
 const browser=await prepareMoneyConnectionsConfig(graph),server=moneyConnectionsConfig(graph);
 assert.deepEqual(browser.rows,server.rows);const page=applyQuery(server.rows,server,{});
 assert.equal(page.total,2);assert.equal(page.rows.reduce((sum,row)=>sum+row.value,0),100);assert.ok(page.rows.every(row=>!row.aggregate));
});

import {JSDOM} from 'jsdom';
import {dataTableHTML,toCSV,mountDataTable} from '../public/datatable.js';
import {renderMoneyConnectionsTable} from '../src/money-connections-table.ts';
import {tableHarness} from './datatable-harness.mjs';
for(const confident of [false,true])test((confident?'confident':'uncertain')+': source spelling and links agree in config, SSR, hydration and CSV; the return reference stays data, never a column',async()=>{
 const donor={id:'donor:fixture',label:'Canonical fixture',source_name:'EXAMPLE, ALEX',kind:'donor',
  returnReferences:[{return_type:'AEC annual return',year:'2024-25',return_id:'RETURN-7'}],
  match:{confidence:confident?1:0.8,method:confident?'exact':'rule',href:'/subject/person/fixture'}};
 const party={id:'party:fixture',label:'Fixture party',kind:'party'};
 const data={nodes:[donor,party],edges:[{source:donor.id,target:party.id,total:120,count:1,firstYear:2024,lastYear:2024}]};
 function verify(html){
  const doc=new JSDOM(html).window.document,shown=doc.body.cloneNode(true);shown.querySelectorAll('script,template').forEach(n=>n.remove());
  assert.ok(shown.textContent.includes(donor.source_name));assert.doesNotMatch(shown.textContent,/AEC annual return|RETURN-7|Return reference/);
  const links=[...doc.querySelectorAll('a')].filter(a=>a.textContent===donor.source_name);
  assert.equal(links.length,confident?1:0);if(confident)assert.equal(links[0].getAttribute('href'),donor.match.href);
 }
 const config=moneyConnectionsConfig(data),page=applyQuery(config.rows,config,{});
 verify(dataTableHTML(config,page));
 const csv=toCSV(config.rows,config);assert.ok(csv.includes('EXAMPLE, ALEX'));
 assert.ok(!('return_reference' in config.rows[0]));assert.ok(!config.columns.some(c=>c.key==='return_reference'));
 verify(await renderMoneyConnectionsTable(new URL('https://fixture.test/money'),async()=>data));
 const h=tableHarness();let requests=0;h.win.fetch=async()=>{requests++;throw Error('unexpected privacy request');};
 const mounted=mountDataTable(h.root,config);await new Promise(setImmediate);verify(h.html());assert.equal(requests,0);mounted.destroy();
 const reverse=moneyConnectionsConfig({...data,nodes:[donor,{...party,kind:'grantor'}],edges:[{...data.edges[0],source:party.id,target:donor.id,flow:'contracts'}]});
 assert.equal(reverse.primaryLink(reverse.rows[0]),confident?donor.match.href:null);
});
