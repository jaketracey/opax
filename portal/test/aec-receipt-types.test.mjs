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
const [{isReceiptGraph,receiptAnswer},{buildGraph,receiptGraphView,windowFigures,receiptMeasureLabel},{partyMoneyResponse}]=await Promise.all([
  load('../src/voice-money.ts'),load('../graph/index.ts'),load('../src/party-money-table.ts')
]);

test('published typed receipts load through Ask, map and the party money API',async()=>{
  assert.equal(graph.meta.receipt_types.available,true);
  assert.equal(isReceiptGraph(graph),true);
  const legacy=structuredClone(graph);
  delete legacy.meta.receipt_types;
  for(const item of [...legacy.nodes,...legacy.edges]){delete item.by_type;delete item.by_type_year}
  assert.deepEqual(moneyTotals(graph),moneyTotals(legacy));
  assert.equal(buildGraph(graph).edges.length,buildGraph(legacy).edges.length);
  assert.equal(typeof receiptAnswer(graph,'gambling in 2024','federal','https://opax.test').answer,'string');
  // The party-money API once returned the legacy all-record cells for the typed graph too, and this test
  // pinned that. Those cells also hold the donor's own declaration of each gift, so a gift counted twice
  // (Pratt Holdings to Labor read $14.89m against $8.47m on the party's own returns). The API now reads
  // the typed cells, as the map card and the donor page do, and says so in `scope`; a graph without typed
  // cells keeps the legacy figures and has no scope. Figures: test/party-receipt-totals.test.mjs.
  const assets=data=>({fetch:async()=>new Response(JSON.stringify(data))});
  const request=new Request('https://opax.test/api/register/party-money?partyId=party%3ALabor');
  const typed=await (await partyMoneyResponse(request,assets(graph))).json();
  const untyped=await (await partyMoneyResponse(request,assets(legacy))).json();
  const row=(data,label)=>data.rows.find(r=>r.label===label);
  assert.equal(row(typed,'Pratt Holdings Pty Ltd').total,8473476);
  assert.equal(row(untyped,'Pratt Holdings Pty Ltd').total,14885966);
  assert.equal(typed.scope,'All receipt types, 1998–99 to 2024–25, as the parties reported them in federal returns');
  assert.equal(untyped.scope,undefined);
  assert.deepEqual(Object.keys(typed).sort(),['rows','scope']);
  assert.deepEqual(Object.keys(typed.rows[0]),Object.keys(untyped.rows[0]),'each row keeps its fields');
});

function industryRanking(industry,measure,from=-Infinity,to=Infinity){
  const view=receiptGraphView(graph,measure,from,to);
  const converted=buildGraph(graph,measure);
  const nodes=new Map(view.nodes.map(n=>[n.id,n]));
  const parties=new Map();
  for(const edge of Number.isFinite(from)||Number.isFinite(to)?view.edges:converted.edges){
    if(nodes.get(edge.source)?.industry!==industry||nodes.get(edge.target)?.kind!=='party')continue;
    const name=nodes.get(edge.target).label;
    parties.set(name,(parties.get(name)||0)+edge.total);
  }
  return [...parties].filter(([,amount])=>amount>0).sort((a,b)=>b[1]-a[1]);
}

test('actual map conversion ranks typed gambling receipts in both measures, never legacy donor declarations',()=>{
  const donations=industryRanking('gambling','donation_only');
  const allTypes=industryRanking('gambling','all_types');
  assert.deepEqual(donations,[['Liberal',1093352],['Labor',1067066],['Nationals',258500],['LNP',50000]]);
  // Shared identity guard: Tabcorp (QLD)'s $6,600 Other Receipt stays with its separate identity.
  assert.deepEqual(allTypes,[['Labor',4699593],['Liberal',3538879],['Nationals',343740],['LNP',86300]]);
  assert.equal(donations.reduce((sum,[,amount])=>sum+amount,0),2468918);
  assert.equal(allTypes.reduce((sum,[,amount])=>sum+amount,0),8668512);
  assert.equal(receiptMeasureLabel('all_types'),'All receipt types');
  assert.equal(receiptMeasureLabel('donation_only'),'Donation-only');
});

test('typed map year windows use financial-year cells and exclude undated receipts',()=>{
  const x={total:999999,count:999,firstYear:1998,lastYear:2026,byYear:{2021:[999999,999]},undated:[12345,99],
    by_type:{donation_received:15,other_receipt:70,unknown:5},
    by_type_year:{'2020-21':{donation_received:[10,2],other_receipt:[20,1]},'2021-22':{donation_received:[5,1],other_receipt:[20,2]},'2025 Federal Election':{other_receipt:[30,1]},undated:{unknown:[5,1]}}};
  assert.equal(windowFigures(x,-Infinity,Infinity,false,'donation_only').total,15);
  assert.equal(windowFigures(x,-Infinity,Infinity).total,90);
  const donations=windowFigures(x,2021,2021,false,'donation_only');
  assert.deepEqual([donations.total,donations.count,donations.firstYear,donations.lastYear],[5,1,2021,2021]);
  assert.equal(windowFigures(x,2021,2021).total,25);
  assert.equal(windowFigures(x,2025,2025).total,30);
  assert.equal(windowFigures(x,2025,2025,false,'donation_only').total,0);
  assert.equal(windowFigures({...x,by_type:{}},-Infinity,Infinity).total,0);
  assert.equal(windowFigures({...x,by_type_year:undefined},2021,2021).total,0);
});

test('typed map finance figures and leading recipients match the independent CSV reconciliation',()=>{
  const donations=industryRanking('finance','donation_only');
  const allTypes=industryRanking('finance','all_types');
  assert.equal(donations.reduce((sum,[,amount])=>sum+amount,0),24788085);
  // Shared guard: PwC (NSW) $6,450 and NAB (Loan) $1.45m stay separate.
  // Of this $1,456,450 reduction in the drawing, $1,500 was Donation Received.
  assert.equal(allTypes.reduce((sum,[,amount])=>sum+amount,0),168214981);
  assert.deepEqual(donations.slice(0,5),[['Liberal',14412567],['Labor',8722283],['Nationals',1335985],['LNP',289250],['Greens',28000]]);
  assert.deepEqual(allTypes.slice(0,5),[['Labor',82300904],['Liberal',62662300],['Nationals',10982297],['LNP',10229071],["Katter's Australian Party",1017881]]);
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
