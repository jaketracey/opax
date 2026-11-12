import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {filterMoneyEdges,moneyTotals} from '../public/money-records.js';

const graph=JSON.parse(readFileSync(new URL('../public/graph/money.json',import.meta.url),'utf8'));
const load=async path=>{
  const built=await build({entryPoints:[new URL(path,import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
  return import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
};
const [{isReceiptGraph,receiptAnswer},{buildGraph},{partyMoneyResponse}]=await Promise.all([
  load('../src/voice-money.ts'),load('../graph/index.ts'),load('../src/party-money-table.ts')
]);

test('published typed receipts load through Ask, map and the party money API',async()=>{
  assert.equal(graph.meta.receipt_types.available,true);
  assert.equal(isReceiptGraph(graph),true);
  const legacy=structuredClone(graph);
  delete legacy.meta.receipt_types;
  for(const item of [...legacy.nodes,...legacy.edges]){delete item.by_type;delete item.by_type_year}
  assert.deepEqual(moneyTotals(graph),moneyTotals(legacy));
  assert.deepEqual(buildGraph(graph),buildGraph(legacy));
  assert.equal(typeof receiptAnswer(graph,'gambling in 2024','federal','https://opax.test').answer,'string');
  const assets=data=>({fetch:async()=>new Response(JSON.stringify(data))});
  const request=new Request('https://opax.test/api/register/party-money?partyId=party%3ALabor');
  const typed=await partyMoneyResponse(request,assets(graph));
  const untyped=await partyMoneyResponse(request,assets(legacy));
  assert.equal(typed.status,200);
  assert.equal(await typed.text(),await untyped.text());
});

test('typed receipt totals reconcile with their financial-year cells and exclude public awards',()=>{
  assert.ok(readFileSync(new URL('../public/graph/money.json',import.meta.url)).length<25*1024*1024);
  for(const edge of filterMoneyEdges(graph,{type:'receipts'})){
    const sums={};
    for(const types of Object.values(edge.by_type_year))for(const [kind,[aud,count]] of Object.entries(types)){
      assert.ok(Number.isInteger(count)&&count>0);
      sums[kind]=(sums[kind]||0)+aud;
    }
    assert.deepEqual(sums,edge.by_type);
  }
  for(const edge of graph.edges.filter(e=>e.grant||e.flow))assert.equal(edge.by_type,undefined);
});
