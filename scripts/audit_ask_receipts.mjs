#!/usr/bin/env node
// Local evidence only. This audit does not infer transaction types from names.
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const root=fileURLToPath(new URL('../',import.meta.url))
const read=path=>JSON.parse(readFileSync(root+'portal/public/'+path,'utf8'))
const keys=rows=>[...new Set(rows.flatMap(row=>Object.keys(row)))].sort()
const counts=values=>values.reduce((out,value)=>({...out,[value]:(out[value]??0)+1}),{})
const graphs={}
for(const file of ['money.json','money.qld.json','money.vic.json','money.tas.json']){
 const graph=read('graph/'+file),nodes=new Map(graph.nodes.map(n=>[n.id,n]))
 const edges=graph.edges.filter(e=>nodes.get(e.source)?.kind==='donor'&&nodes.get(e.target)?.kind==='party'&&!e.flow&&!e.grant)
 graphs[file]={
  generated:graph.meta.generated,receipt_edges:edges.length,receipt_edge_fields:keys(edges),
  classification_fields:keys(edges).filter(k=>/receipt.?type|return.?type|donation.?type|loan|borrow|debt|gift|disclosure.?type/i.test(k)),
  donor_reference_return_types:counts(graph.nodes.flatMap(n=>(n.returnReferences??[]).map(r=>r.return_type??'unspecified'))),
  declared_type_exclusions:graph.meta.rows_dropped_by_disclosure_type??null,
  declared_political_donation_flags:graph.meta.political_donation_flag??null,
 }
}
const federal=read('graph/money.json'),extras=read('graph/aec-extras.json')
const westpac=federal.nodes.find(n=>n.label==='Westpac Banking Corporation')
if(!westpac)throw Error('Expected the reported company in the saved federal graph')
const examples=['Labor','One Nation'].map(party=>{
 const edge=federal.edges.find(e=>e.source===westpac.id&&e.target==='party:'+party)
 const debt=extras.parties[party].debts
 return {party,receipt_edge:edge,latest_debt:{year:debt.year,
  westpac_rows:debt.top.filter(r=>/^Westpac(?: Banking Corporation)?$/i.test(r.name)),
  basis:'Outstanding debt at 30 June, not an identified receipt or new lending flow',
  receipt_link_available:false,
 }}
})
const baseline='12ce00e22814398b3c10ff4599f89f0dbe0fbde5'
const hash=data=>createHash('sha256').update(data).digest('hex')
const protected_data={}
for(const file of ['votes.json','pay.json']){
 const path='portal/public/'+file,current=readFileSync(root+path)
 const original=execFileSync('git',['show',baseline+':'+path],{cwd:root,maxBuffer:100*1024*1024})
 protected_data[file]={sha256:hash(current),baseline_sha256:hash(original),byte_identical:current.equals(original)}
 if(!current.equals(original))process.exitCode=1
}
console.log(JSON.stringify({baseline,graphs,examples,debt_source:extras.meta.source,
 debt_notes:extras.meta.notes,protected_data,
 conclusion:'Federal receipt edges cannot distinguish gifts, loans, borrowings or other receipts. Debt balances cannot be subtracted from receipt flows.',
 network_requests:0,model_calls:0,spend_usd:0},null,2))
