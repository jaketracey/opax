import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileHashedIdentityCheck} from '../src/table-identity-hashes.mjs';
import {moneyConnectionsConfig,filterMoneyConnectionView,prepareMoneyConnectionsConfig} from '../public/money-connections.js';
import {moneyFlowType} from '../public/money-records.js';
import {applyQuery} from '../public/datatable.js';
import {createTablePrivacyValidator} from '../public/datatable-privacy.js';
const read=async file=>JSON.parse(await readFile(new URL('../public/'+file,import.meta.url),'utf8'));
const registry=await read('table-private-identities.json'),blocked=compileHashedIdentityCheck(registry.identities,registry.strippedLengths),memo=new Map();
const safe=value=>{if(!memo.has(value))memo.set(value,!blocked(value));return memo.get(value);};
const cents=value=>BigInt(Math.round((Number(value)||0)*100));
for(const view of ['federal','qld','vic','tas'])test(`${view}: shown rows and the aggregate exactly conserve every source amount`,async()=>{
  const graph=await read(`graph/money${view==='federal'?'':'.'+view}.json`);
  for(const params of ['', 'type=receipts','type=contracts','type=grants','min=1000000']){
    const base=filterMoneyConnectionView(graph,new URLSearchParams(params)),nodes=new Map(base.nodes.map(n=>[n.id,n])),config=moneyConnectionsConfig(base,safe),page=applyQuery(config.rows,config,{pageSize:2000});
    assert.equal(page.total,config.rows.length,'the core cannot silently drop an unaggregated row');
    assert.ok(page.rows.filter(row=>row.aggregate).length<=1);
    for(const type of ['receipts','contracts','grants']){
      const edges=base.edges.filter(e=>moneyFlowType(e,nodes)===type),source=edges.reduce((sum,e)=>sum+cents(e.total),0n);
      const hasColumn=config.columns.some(c=>c.key===type),singleType=new Set(base.edges.map(e=>moneyFlowType(e,nodes))).size===1 && edges.length>0;
      const shown=page.rows.reduce((sum,row)=>sum+cents(hasColumn?row[type]:singleType?row.value:0),0n);
      assert.equal(shown,source,`${type}: exact cents for ${params || 'all connections'}`);
    }
    assert.equal(page.rows.reduce((sum,row)=>sum+(row.records||0),0),base.edges.filter(e=>moneyFlowType(e,nodes)).reduce((sum,e)=>sum+e.count,0),'record counts reconcile');
    for(const row of page.rows.filter(row=>row.aggregate)){assert.equal(config.primaryLink(row),null);assert.equal(config.actions[0].href(row),null);}
  }
});

test('browser preparation delegates the same row decision and aggregates a rejected non-donor endpoint',async()=>{
  const graph={nodes:[{id:'agency:fixture',kind:'agency',label:'Fixture agency'},{id:'supplier:fixture',kind:'supplier',label:'Restricted fixture Pty Ltd'},{id:'supplier:public',kind:'supplier',label:'Public fixture Pty Ltd'}],edges:[{source:'agency:fixture',target:'supplier:fixture',flow:'contracts',total:40,count:2,firstYear:2020,lastYear:2021},{source:'agency:fixture',target:'supplier:public',flow:'contracts',total:60,count:3,firstYear:2020,lastYear:2021}]};
  const permit=value=>!value.includes('Restricted fixture');
  const browser=await prepareMoneyConnectionsConfig(graph,createTablePrivacyValidator({privacyCheck:permit}));
  const server=moneyConnectionsConfig(graph,permit);
  assert.deepEqual(browser.rows,server.rows);
  const page=applyQuery(server.rows,server,{});
  assert.equal(page.total,2);assert.equal(page.rows.reduce((sum,row)=>sum+row.value,0),100);
  assert.equal(page.rows.find(row=>row.aggregate).value,40);
  assert.deepEqual(page.rows.find(row=>!row.aggregate).donorEndpoints,[]);
});
