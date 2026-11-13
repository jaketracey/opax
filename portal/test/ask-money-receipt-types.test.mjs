import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const built=await build({entryPoints:[new URL('../src/voice-money.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'})
const {receiptAnswer}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const graph=()=>({meta:{generated:'2026-11-12',receipt_types:{available:true,schema:1,donation_type:'donation_received'}},nodes:[
 {id:'source:one',label:'Example Banking Ltd',kind:'donor',industry:'finance'},
 {id:'source:two',label:'Example Finance Ltd',kind:'donor',industry:'finance'},
 {id:'party:one',label:'Example Party',kind:'party'},
],edges:[
 {source:'source:one',target:'party:one',total:999999,count:99,firstYear:1998,lastYear:2024,byYear:{2024:[999999,99]},by_type:{donation_received:120.25,other_receipt:9000},by_type_year:{'2024-25':{donation_received:[120.25,2],other_receipt:[9000,1]}}},
 {source:'source:two',target:'party:one',total:888888,count:88,firstYear:1998,lastYear:2024,byYear:{2024:[888888,88]},by_type:{donation_received:240.50,other_receipt:3000},by_type_year:{'2024-25':{donation_received:[240.50,1],other_receipt:[3000,1]}}},
]})
const answer=(g,period=' in 2024')=>receiptAnswer(g,'Who receives the most money from finance'+period+'?','federal','https://opax.test')
test('exporter lifetime and short FY cells choose donations, cents and recipient-side counts',()=>{
 for(const period of ['', ' in 2024', ' in 2024–25']){
  const r=answer(graph(),period)
  assert.equal(r.typed,true);assert.equal(r.measure,'donations');assert.equal(r.total_aud,360.75);assert.equal(r.receipts,3)
  assert.equal(r.all_types_aud,12360.75);assert.equal(r.other_receipts_aud,12000)
  assert.deepEqual(r.by_donor.map(d=>d.total_aud),[240.5,120.25]);assert.equal(r.period,'2024–25')
 }
})
test('all three exporter availability fields gate typing; legacy scalar hints do not enable it',()=>{
 for(const change of [g=>delete g.meta.receipt_types,g=>g.meta.receipt_types.available=false,g=>g.meta.receipt_types.schema=2,g=>g.meta.receipt_types.donation_type='donation']){
  const g=graph();change(g);g.edges[0].receipt_type='Donation';g.edges[1].receiptType='Donation'
  const r=answer(g);assert.equal(r.typed,false);assert.equal(r.measure,'receipts_all');assert.equal(r.total_aud,1888887);assert.equal(r.receipts,187)
 }
})
test('typed lifetime uses by_type amounts and period counts, never legacy fields or year amount sums',()=>{
 const g=graph();g.edges[0].by_type.donation_received=125.25
 const r=answer(g,'');assert.equal(r.total_aud,365.75);assert.equal(r.receipts,3)
 assert.equal(answer(g).total_aud,360.75)
})
test('every exported type contributes to all-types, including unknown and public_funding',()=>{
 const g=graph(),edge=g.edges[0]
 for(const type of ['subscription','public_funding','unspecified','unknown']){edge.by_type[type]=10;edge.by_type_year['2024-25'][type]=[10,1]}
 for(const period of ['', ' in 2024']){
  const r=answer(g,period);assert.equal(r.total_aud,360.75);assert.equal(r.all_types_aud,12400.75)
  const all=receiptAnswer(g,'Who receives the most money from finance'+period+'?','federal','https://opax.test',{measure:'receipts_all'})
  assert.equal(all.total_aud,12400.75);assert.equal(all.receipts,9)
 }
})
test('missing donation cells contribute zero; untyped, grant and public-money edges stay outside typed sums',()=>{
 const g=graph();delete g.edges[1].by_type.donation_received;delete g.edges[1].by_type_year['2024-25'].donation_received
 g.edges.push({source:'source:one',target:'party:one',total:999999,count:99,byYear:{2024:[999999,99]}})
 g.edges.push({...g.edges[0],flow:'public_funding'},{...g.edges[0],grant:true})
 const r=answer(g);assert.equal(r.total_aud,120.25);assert.equal(r.by_donor.find(r=>r.id==='source:two').total_aud,0);assert.equal(r.all_types_aud,12120.25)
})
test('donation periods come from donation cells; event labels survive lifetime and stay outside FY filters',()=>{
 const g=graph(),edge=g.edges[0]
 edge.by_type.other_receipt+=100;edge.by_type_year['2000-01']={other_receipt:[100,1]}
 edge.by_type.donation_received+=20;edge.by_type_year['2019 Federal Election']={donation_received:[20,1]}
 edge.by_type.donation_received+=30;edge.by_type_year.undated={donation_received:[30,1]}
 const lifetime=answer(g,'');assert.equal(lifetime.period,'2024–25; 2019 Federal Election; undated');assert.equal(lifetime.total_aud,410.75);assert.equal(lifetime.receipts,5)
 assert.equal(answer(g).total_aud,360.75)
 assert.equal(answer(g,' in 2019').total_aud,0)
})
test('an event-only receipt retains its event label and has no invented financial-year coverage',()=>{
 const g=graph();g.edges=[{...g.edges[0],by_type:{donation_received:50},by_type_year:{'2019 Federal Election':{donation_received:[50,1]}}}]
 const r=answer(g,'');assert.equal(r.period,'2019 Federal Election');assert.equal(r.total_aud,50);assert.equal(r.period_coverage.since,null)
})
test('year comparisons retain the parent donation measure in a period with only other receipts',()=>{
 const g=graph();g.edges.forEach(e=>{delete e.by_type.donation_received;delete e.by_type_year['2024-25'].donation_received})
 const r=receiptAnswer(g,'Who receives the most money from finance in 2024?','federal','https://opax.test',{measure:'donations'})
 assert.equal(r.measure,'donations');assert.equal(r.total_aud,0);assert.equal(r.by_party[0].total_aud,0)
 assert.equal(answer(g).measure,'other_receipts')
})
