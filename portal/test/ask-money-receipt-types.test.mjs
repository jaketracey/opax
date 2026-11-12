import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const built=await build({entryPoints:[new URL('../src/voice-money.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'})
const {receiptAnswer}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const graph=()=>({meta:{generated:'2026-11-12'},nodes:[
 {id:'source:one',label:'Example Banking Ltd',kind:'donor',industry:'finance'},
 {id:'source:two',label:'Example Finance Ltd',kind:'donor',industry:'finance'},
 {id:'party:one',label:'Example Party',kind:'party'},
],edges:[
 {source:'source:one',target:'party:one',receipt_type:'Donation',total:120.25,count:2,firstYear:2024,lastYear:2024,byYear:{2024:[120.25,2]}},
 {source:'source:one',target:'party:one',receipt_type:'Loan',total:9000,count:1,firstYear:2024,lastYear:2024,byYear:{2024:[9000,1]}},
 {source:'source:two',target:'party:one',receipt_type:'Other Receipt',total:3000,count:1,firstYear:2024,lastYear:2024,byYear:{2024:[3000,1]}},
 {source:'source:two',target:'party:one',receipt_type:'Donation',total:240.50,count:1,firstYear:2024,lastYear:2024,byYear:{2024:[240.50,1]}},
]})
const answer=g=>receiptAnswer(g,'Who receives the most money from finance in 2024?','federal','https://opax.test')
test('fully typed matching edges select donations and retain cents, counts and ranked donors',()=>{
 const r=answer(graph())
 assert.equal(r.measure,'donations');assert.equal(r.total_aud,360.75);assert.equal(r.receipts,3)
 assert.deepEqual(r.by_donor.map(d=>d.total_aud),[240.5,120.25]);assert.equal(r.period,'2024–25')
})
test('untyped or partly typed matching edges retain the complete receipt measure',()=>{
 for(const mode of ['none','partial','unknown']){
  const g=graph();g.edges.forEach((e,i)=>{if(mode==='none'||i===0)delete e.receipt_type})
  if(mode==='unknown')g.edges[0].receipt_type='unrecognised'
  const r=answer(g);assert.equal(r.measure,'receipts_all');assert.equal(r.total_aud,12360.75);assert.equal(r.receipts,5)
 }
})
test('typing completeness uses the requested period and excludes public money flows',()=>{
 const g=graph()
 g.edges.push({source:'source:one',target:'party:one',total:50,count:1,firstYear:2020,lastYear:2020,byYear:{2020:[50,1]}})
 g.edges.push({...g.edges[0],receipt_type:undefined,flow:'public_funding'})
 assert.equal(answer(g).measure,'donations')
 assert.equal(receiptAnswer(g,'Who receives the most money from finance?','federal','https://opax.test').measure,'receipts_all')
})
test('camel-case receiptType is supported and loan-only records keep the best available receipt figures',()=>{
 const g=graph();g.edges.forEach(e=>{e.receiptType=e.receipt_type;delete e.receipt_type})
 assert.equal(answer(g).measure,'donations')
 g.edges=g.edges.filter(e=>e.receiptType==='Loan')
 assert.equal(answer(g).measure,'other_receipts');assert.equal(answer(g).total_aud,9000)
})
test('year comparisons retain the parent measure, including a year with loans only',()=>{
 const g=graph();g.edges=g.edges.filter(e=>e.receipt_type!=='Donation')
 const r=receiptAnswer(g,'Who receives the most money from finance in 2024?','federal','https://opax.test',{measure:'donations'})
 assert.equal(r.measure,'donations');assert.equal(r.total_aud,0);assert.equal(r.by_party[0].total_aud,0)
 const all=receiptAnswer(graph(),'Who receives the most money from finance in 2024?','federal','https://opax.test',{measure:'receipts_all'})
 assert.equal(all.total_aud,12360.75)
})
