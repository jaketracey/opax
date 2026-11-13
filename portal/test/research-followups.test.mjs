import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {build} from 'esbuild'
import {clientConversationRequest,recordConversationTurn,gradeFollowUp} from '../../scripts/research_followups.mjs'
import {sourceFingerprint} from './money-guard.mjs'
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/research-followups.json',import.meta.url)))
const graph=JSON.parse(fs.readFileSync(new URL('../public/graph/money.json',import.meta.url)))
// The gold was built with the party_receipts tool over the federal donation layer of the money graph
// (money-guard.mjs says exactly what that is). Two guards keep it honest against the live file:
//  * the layer's fingerprint must match the pinned one, so any change to a donation figure, identity, period,
//    row or provenance note is reviewed before the gold is trusted again;
//  * every gold turn must still be exactly what the real tool answers from the live graph.
// The public-money overlay (contract and grant flows) is regenerated weekly and read by neither, so a routine
// weekly export does not trip the guard. 10 November 2026: the whole-file fingerprint used before held eleven
// data groups for a night because AusTender notices had moved the overlay.
const donorNode=g=>g.nodes.find(n=>n.kind==='donor')
const donationEdge=g=>g.edges.find(e=>e.target.startsWith('party:'))
const overlayEdge=g=>g.edges.find(e=>!e.target.startsWith('party:'))
const overlayDonor=g=>g.nodes.find(n=>n.kind==='donor'&&n.contracts)
const root=new URL('../',import.meta.url).pathname
const built=await build({stdin:{contents:"export {partyDonations} from './src/agentic-tools'",resolveDir:root},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']})
const {partyDonations}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const depsFor=g=>({kb:async()=>{throw new Error('the follow-up gold needs no KB')},asset:async path=>path==='/graph/money.json'?structuredClone(g):null,origin:'https://opax.com.au'})
async function assertGold(g){
 for(const c of fixture.conversations)for(const [i,t] of c.turns.entries()){
  if(!t.tool_query)continue
  const label=`${c.id} turn ${i+1}: ${t.standalone}`
  const r=await partyDonations(depsFor(g),{...t.tool_query,limit:15})
  assert.equal(r.ok,true,label)
  // Every gold question asks who gives, gave or donated, so each ranks AEC Donation Received only (A34).
  assert.equal(r.data.measure,'donations',label)
  // A turn about one named source checks that source's donation row, wherever it ranks.
  const rows=t.named_donor?r.data.rows.filter(row=>row.donor===t.named_donor):r.data.rows
  if(t.rows.length||t.named_donor)assert.deepEqual(t.named_donor?rows:rows.slice(0,t.rows.length),t.rows,label)
  // Sources the old all-types gold ranked are not hidden: each is its own labelled line, never a donation.
  for(const o of t.other_receipts??[])assert.deepEqual((r.data.other_receipts??[]).find(x=>x.donor===o.donor),o,`${label}: ${o.donor} other receipts`)
  if(t.public_funding)assert.deepEqual(r.data.public_funding,t.public_funding,`${label}: public funding`)
  for(const p of r.data.public_funding??[])assert.ok(!r.data.rows.some(row=>row.donor===p.source),`${label}: ${p.source} is public funding, never a donor row`)
  if(t.eligible_rows?.length)assert.deepEqual(rows,t.eligible_rows,label)
  if(t.decision==='decline'&&t.period)assert.equal(rows.length,0,`${label} (${t.gold_limitation||'no rows in the period'})`)
 }
}
test('follow-up source: the donation layer agrees with the pinned snapshot apart from its export date',()=>{
 assert.equal(sourceFingerprint(graph),fixture.donation_layer_sha256,'donation content or provenance changed: review the pinned follow-up gold before updating its fingerprint')
 assert.match(fixture.source_sha256,/^[a-f0-9]{64}$/)
 assert.match(fixture.source_revision,/^[a-f0-9]{40}$/)
})
test('a weekly regeneration that moves only the export date or the public-money overlay leaves the guard alone',()=>{
 const changes={
  'export date':g=>{g.meta.generated=g.meta.generated==='2026-10-25'?'2026-11-01':'2026-10-25'},
  'contract coverage':g=>{g.meta.contracts_coverage='notices published 2007-01-01 to 2099-01-01'},
  'contract dollars':g=>{g.meta.contract_dollars_to_map_donors+=1},
  'grant dollars':g=>{g.meta.grant_dollars_to_map_donors+=1},
  'donors with contracts':g=>{g.meta.donors_with_contracts+=1},
  'edge count':g=>{g.meta.edge_count+=1},
  'donor contract total':g=>{overlayDonor(g).contracts.total+=1},
  'donor public money':g=>{g.nodes.find(n=>n.publicMoney).publicMoney+=1},
  'contract flow':g=>{overlayEdge(g).total+=1;overlayEdge(g).count+=1},
  'added contract flow':g=>{g.edges.push({...overlayEdge(g)})},
  'grantor node':g=>{g.nodes.find(n=>n.kind==='grantor').total+=1},
 }
 for(const [change,apply] of Object.entries(changes)){
  const changed=structuredClone(graph);apply(changed)
  assert.equal(sourceFingerprint(changed),fixture.donation_layer_sha256,change)
  assert.equal(sourceFingerprint(JSON.parse(JSON.stringify(changed,null,2))),fixture.donation_layer_sha256,`${change}, reformatted`)
 }
})
test('the guard still detects changed figures, identities, periods, rows and provenance in the donation layer',()=>{
 const controls={
  'donor figure':g=>{donorNode(g).total+=1},
  'donor identity':g=>{donorNode(g).id='donor:synthetic-control'},
  'donor label':g=>{donorNode(g).label='Synthetic control'},
  'donor industry':g=>{donorNode(g).industry='synthetic'},
  'donor selection':g=>{donorNode(g).via='synthetic'},
  'receipt count':g=>{donationEdge(g).count+=1},
  'flow figure':g=>{donationEdge(g).total+=1},
  'recipient identity':g=>{donationEdge(g).target='party:synthetic-control'},
  'financial period':g=>{donationEdge(g).byYear['1900']=[1,1]},
  'added row':g=>{g.edges.push({...donationEdge(g)})},
  'removed row':g=>{g.edges.splice(g.edges.indexOf(donationEdge(g)),1)},
  'added node':g=>{g.nodes.push({...donorNode(g)})},
  'removed node':g=>{g.nodes.splice(g.nodes.indexOf(donorNode(g)),1)},
  'party figure':g=>{g.nodes.find(n=>n.kind==='party').total+=1},
  'source reference':g=>{g.meta.source='Synthetic source control'},
  'coverage':g=>{g.meta.coverage='Synthetic coverage control'},
  'selection rule':g=>{g.meta.public_money_floor+=1},
  'other metadata':g=>{g.meta.rows_considered+=1},
  'new metadata':g=>{g.meta.synthetic_control=true}
 }
 for(const [control,change] of Object.entries(controls)){
  const changed=structuredClone(graph);change(changed)
  assert.notEqual(sourceFingerprint(changed),fixture.donation_layer_sha256,control)
 }
})
test('follow-up source rejects missing or invalid export dates',()=>{
 for(const generated of [undefined,null,20261025,'','2026-10-25T00:00:00Z','2026-02-30','2026-13-01']){
  const changed=structuredClone(graph);changed.meta.generated=generated
  assert.throws(()=>sourceFingerprint(changed))
 }
 const changed=structuredClone(graph);delete changed.meta
 assert.throws(()=>sourceFingerprint(changed))
})
test('every gold turn is exactly what the party_receipts tool answers from the live graph',async()=>{
 await assertGold(graph)
 // the overlay may move under the gold without changing an answer
 const overlay=structuredClone(graph);overlayEdge(overlay).total+=1;overlayDonor(overlay).contracts.total+=1;overlay.meta.contracts_coverage='moved'
 await assertGold(overlay)
 // a donation figure the gold relies on cannot move unnoticed
 const moved=structuredClone(graph);const first=fixture.conversations[0].turns[0]
 const edge=moved.edges.find(e=>e.target===`party:${first.tool_query.party}`&&[moved.nodes.find(n=>n.id===e.source)?.label,moved.nodes.find(n=>n.id===e.source)?.source_name].includes(first.rows[0].donor))
 assert.ok(edge,'the first gold row is a donation edge in the live graph')
 // party_receipts reads the typed cells (each receipt once, from the party's own return), so move one of those
 assert.ok(edge.by_type_year,'the first gold row has typed receipt cells')
 for(const year in edge.by_type_year){const cell=edge.by_type_year[year].donation_received;if(cell){cell[0]+=1;edge.by_type.donation_received+=1;break}}
 await assert.rejects(()=>assertGold(moved))
})
test('follow-up population has ten tool-derived two/three turn conversations',()=>{
 assert.equal(fixture.conversations.length,10)
 for(const c of fixture.conversations){assert.ok(c.turns.length>=2&&c.turns.length<=3);for(const t of c.turns){assert.ok(t.question&&t.standalone);assert.ok(t.context_all.length);if(t.decision==='answer')assert.ok(t.rows.length||t.novel_from_previous&&t.eligible_rows.length||t.other_receipts?.length);if(t.gold_change)assert.match(t.gold_change,/^A34\/A35, 13 Nov 2026: .*\b(?:Donation Received|Other Receipt|Public Funding)\b/)}}
})
test('conversation requests carry resolved questions and minimal source metadata exactly as sendChat',()=>{
 const thread=[];recordConversationTurn(thread,'what about Labor?',{answer:'A supported answer.',asked_as:'Who gives the most to Labor?',sources:[{resource:'a'.repeat(32),slug:'speech-1',kind:'speech',cited:true,speaker:'Private field not carried',snippet:'not sent'}]})
 const req=clientConversationRequest(thread);assert.equal(req.context[0].text,'Who gives the most to Labor?');assert.deepEqual(req.prior_resources,['a'.repeat(32)]);assert.deepEqual(req.context[1].sources,[{slug:'speech-1',kind:'speech'}]);assert.ok(!JSON.stringify(req).includes('not sent'))
 recordConversationTurn(thread,'and in 2019?',{answer:'A calculation.',asked_as:'Generic rewrite',money_ranking:true,money_question:'Who gave most to Labor in 2019?',sources:[]});assert.equal(clientConversationRequest(thread).context[2].text,'Who gave most to Labor in 2019?')
})
test('follow-up grading catches a lost entity, changed amount and a decline converted into ranking',()=>{
 const turn=fixture.conversations[0].turns[1],r=turn.rows[0],text=`${r.donor}${r.associated_entity?` (${r.associated_entity})`:''} gave the most in donations to Labor: $${r.total_aud.toLocaleString('en-AU')}.`,source={resource:'fact-1',kind:'export',cited:true,snippet:`Donor: ${r.donor} — $${r.total_aud.toLocaleString('en-AU')}.`,title:'Selected Labor receipts'}
 const p={answer:text,asked_as:turn.standalone,citations:{'fact-1/t/body/0':[[0,text.length]]},sources:[source]}
 assert.equal(gradeFollowUp(turn,p).pass,true);assert.equal(gradeFollowUp(turn,{...p,asked_as:'Who gives most to One Nation?'}).context,'fail');assert.equal(gradeFollowUp(turn,{...p,answer:text.replace(r.total_aud.toLocaleString('en-AU'),'1')}).owners_figures,'fail');assert.equal(gradeFollowUp({...turn,decision:'decline',rows:[]},p).declines,'fail')
})
test('recipient switches reject a rewrite that keeps the old party as recipient',()=>{
 const t={...fixture.conversations[0].turns[1],context_not:['One Nation']}
 const p={asked_as:'What funding did Labor provide to One Nation?',answer:'The selected records do not establish that.',sources:[],citations:{}}
 assert.equal(gradeFollowUp(t,p).context,'fail')
})
