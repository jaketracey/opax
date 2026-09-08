import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterMoneyEdges, moneyTotals, moneyRecordsCSV, readMoneyFilters } from '../public/money-records.js';
const graph={nodes:[{id:'d',kind:'donor',label:'=Example',group:'mining'},{id:'p',kind:'party',label:'Party'},{id:'c',kind:'grantor',flow:'contracts',label:'Contracts'},{id:'g',kind:'grantor',label:'Grants'}],edges:[{source:'d',target:'p',total:100,count:1},{source:'c',target:'d',total:10000,count:2},{source:'g',target:'d',total:2000,count:3},{source:'missing',target:'p',total:100},{source:'d',target:'p',total:NaN}]};
test('political receipt filters exclude both kinds of public award',()=>{
 assert.deepEqual(filterMoneyEdges(graph,{type:'receipts'}),[graph.edges[0]]);
 assert.deepEqual(moneyTotals(graph),{receipts:100,contracts:10000,grants:2000});
});
test('filters intersect names, type, industry, party and minimum value',()=>{
 assert.deepEqual(filterMoneyEdges(graph,{query:'example',industry:'mining',min:1000,type:'contracts'}),[graph.edges[1]]);
 assert.equal(filterMoneyEdges(graph,{party:'p',min:101}).length,0);
 assert.equal(filterMoneyEdges(graph,{industry:'health'}).length,0);
});
test('export preserves financial types and escapes spreadsheet formulas',()=>{
 const csv=moneyRecordsCSV(graph);assert.match(csv,/"'=Example"/);assert.match(csv,/"contracts"/);assert.doesNotMatch(csv,/missing|NaN/);
});
test('shared URL filters validate values',()=>{
 assert.equal(readMoneyFilters(new URLSearchParams('type=unknown&min=-1')).type,'all');
 assert.equal(readMoneyFilters(new URLSearchParams('min=Infinity')).min,0);
 assert.equal(readMoneyFilters(new URLSearchParams('q=Example&type=contracts&min=1000')).min,1000);
});
test('every valid published federal edge has exactly one financial type',()=>{
 const data=JSON.parse(readFileSync(new URL('../public/graph/money.json',import.meta.url)));
 const valid=filterMoneyEdges(data);assert.equal(valid.length,data.edges.length);
 const total=moneyTotals(data);assert.ok(total.receipts>0 && total.contracts>0 && total.grants>0);
 for(const type of Object.keys(total)) assert.equal(filterMoneyEdges(data,{type}).reduce((s,e)=>s+e.total,0),total[type]);
});
