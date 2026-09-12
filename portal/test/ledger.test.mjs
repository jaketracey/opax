import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildFlows, filterFlows, windowFlow, aggregateDonors, sortRows, buildCSV, parseLedgerParams} from '../public/ledger.js';
const row={donorId:'donor:test',donor:'Test',industry:'gambling',party:'Labor',partyColour:'#f00',total:105,count:4,firstYear:2020,lastYear:2022,byYear:{2020:[60,1],2022:[40,2]},undated:[5,1]};
test('selected years recalculate amounts, counts and dates without mutating lifetime data',()=>{
 assert.equal(windowFlow(row,null,null),row);
 assert.deepEqual(windowFlow(row,2020,2020),{...row,total:60,count:1,firstYear:2020,lastYear:2020});
 assert.equal(windowFlow(row,2021,2021),null);
 assert.equal(windowFlow(row,2022,2020),null);
 assert.equal(windowFlow(row,null,2020).total,60);
 assert.equal(windowFlow(row,2022,null).total,40);
 assert.equal(windowFlow(row,2020,2022).total,100);
 assert.equal(windowFlow(row,2020,2022).count,3);
 assert.equal(row.total,105);
});
test('year filters omit unknown dates and invalid cells rather than reusing lifetime totals',()=>{
 for (const byYear of [undefined,{}, {2020:[Infinity,1]}, {2020:[10,'1']}, {2020:[10]}, {oops:[10,1]}]) {
  const unknown={...row,byYear};assert.equal(windowFlow(unknown,2020,2020),null);assert.equal(windowFlow(unknown,null,null).total,105);
 }
 assert.equal(windowFlow({...row,byYear:{2020:[0,2]}},2020,2020).count,2);
});
test('filters intersect selected yearly values before donor aggregation, ranking, minimums and export',()=>{
 const other={...row,party:'Liberal',total:205,byYear:{2020:[20,1],2022:[180,2]}};
 const filtered=filterFlows([row,other],{q:'test',industry:'gambling',yearFrom:2020,yearTo:2020});
 assert.deepEqual(filtered.map(r=>r.total),[60,20]);
 assert.equal(filtered.filter(r=>r.total>=70).length,0);
 const donors=aggregateDonors(filtered).filter(r=>r.total>=70);assert.equal(donors.length,1);
 assert.equal(donors[0].total,80);assert.equal(donors[0].count,2);assert.equal(donors[0].topParty,'Labor');assert.equal(donors[0].topShare,0.75);
 assert.equal(filterFlows([row,other],{party:'Liberal',yearFrom:2020}).length,1);
 assert.equal(filterFlows([row],{industry:'mining',yearFrom:2020}).length,0);
 assert.equal(sortRows(filtered,'total','desc')[0].party,'Labor');
 assert.match(buildCSV('flows',filtered,[]),/Test,Gambling,Labor,60,1,2020,2020/);
 assert.match(buildCSV('donors',donors,[]),/Test,Gambling,80,2,2,2020,2020,Labor,75/);
});
test('published Queensland Tabcorp FY2020-21 ranks Labor first and agrees with Ask calculation data',()=>{
 const data=JSON.parse(readFileSync(new URL('../public/graph/money.qld.json',import.meta.url)));
 const rows=sortRows(filterFlows(buildFlows(data),{q:'Tabcorp',yearFrom:2020,yearTo:2020}),'total','desc');
 assert.deepEqual(rows.map(({party,total,count,firstYear,lastYear})=>({party,total,count,firstYear,lastYear})),[
  {party:'Labor',total:12100,count:2,firstYear:2020,lastYear:2020},
  {party:'LNP',total:11990,count:2,firstYear:2020,lastYear:2020},
 ]);
 assert.equal(aggregateDonors(rows)[0].total,24090);
 assert.equal(filterFlows(buildFlows(data),{q:'Tabcorp'}).reduce((s,r)=>s+r.total,0),184885);
});
test('shareable receipts params resolve exact IDs and retain dated donor scope',()=>{
 const data=JSON.parse(readFileSync(new URL('../public/graph/money.qld.json',import.meta.url)));
 const parsed=parseLedgerParams(new URLSearchParams('jur=qld&type=receipts&focus=donor:tabcorp&party=party:Labor&industry=gambling&from=2020&to=2020&min=0'),data);
 assert.equal(parsed.ok,true); assert.deepEqual(parsed.filters,{q:'',industry:'gambling',industryId:'gambling',party:'Labor',partyId:'party:Labor',focusDonorId:'donor:tabcorp',focusDonor:'Tabcorp Holdings Limited',yearFrom:2020,yearTo:2020,min:0});
 const rows=filterFlows(buildFlows(data),parsed.filters); assert.deepEqual(rows.map(r=>[r.donor,r.party,r.total]),[['Tabcorp Holdings Limited','Labor',12100]]);
 assert.match(buildCSV('flows',rows,['donor = Tabcorp']),/donor = Tabcorp/);
});
test('unknown or unsupported receipts params fail closed rather than widening',()=>{
 const data=JSON.parse(readFileSync(new URL('../public/graph/money.qld.json',import.meta.url)));
 for(const query of ['jur=qld&type=grants','jur=qld&focus=donor:nope','jur=qld&party=party:nope','jur=qld&industry=nope','jur=qld&from=2027','jur=qld&from=2022&to=2020','jur=qld&view=compact','jur=constructor','jur=qld&party=party:Labor&party=party:LNP','jur=qld&from=2020&from=2021']) {
  const parsed=parseLedgerParams(new URLSearchParams(query),data); assert.equal(parsed.ok,false,query); assert.match(parsed.error,/unsupported|unknown|between|earlier|minimum|more than one/i,query);
 }
});
test('every published jurisdiction matches independently summed year cells, including gaps and one-sided ranges',()=>{
 for(const file of ['money.json','money.qld.json','money.vic.json','money.tas.json']) {
  const data=JSON.parse(readFileSync(new URL('../public/graph/'+file,import.meta.url)));
  const nodes=new Map(data.nodes.map(n=>[n.id,n]));
  const receipts=data.edges.filter(e=>nodes.get(e.source)?.kind==='donor'&&nodes.get(e.target)?.kind==='party'&&!e.grant&&!e.flow);
  for(const [from,to] of [[1998,2026],[2020,2020],[2020,2022],[null,2010],[2025,null]]) {
   const expected=receipts.flatMap(e=>Object.entries(e.byYear||{})).filter(([y])=>(from==null||+y>=from)&&(to==null||+y<=to));
   const rows=filterFlows(buildFlows(data),{yearFrom:from,yearTo:to});
   assert.equal(rows.reduce((s,r)=>s+r.total,0),expected.reduce((s,[,v])=>s+v[0],0),`${file}: amount ${from}-${to}`);
   assert.equal(rows.reduce((s,r)=>s+r.count,0),expected.reduce((s,[,v])=>s+v[1],0),`${file}: count ${from}-${to}`);
  }
 }
});
