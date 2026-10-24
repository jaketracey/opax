import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {clientConversationRequest,recordConversationTurn,gradeFollowUp} from '../../scripts/research_followups.mjs'
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/research-followups.json',import.meta.url)))
const graph=JSON.parse(fs.readFileSync(new URL('../public/graph/money.json',import.meta.url)))
// Keep all financial content and provenance in the guard. Only the export date
// varies on an otherwise identical weekly regeneration (export_money_graph.py).
function sourceFingerprint(value) {
 const generated=value.meta?.generated
 assert.equal(typeof generated,'string','money graph needs meta.generated')
 assert.match(generated,/^\d{4}-\d{2}-\d{2}$/,'meta.generated must be a UTC date')
 const time=Date.parse(`${generated}T00:00:00Z`)
 assert.ok(Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===generated,'meta.generated must be a valid UTC date')
 const {generated:_,...meta}=value.meta
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value
 return crypto.createHash('sha256').update(JSON.stringify(canonical({...value,meta}))).digest('hex')
}
test('follow-up source agrees with the pinned snapshot apart from its export date',()=>{
 assert.equal(sourceFingerprint(graph),fixture.source_semantic_sha256,'money content changed: review the pinned follow-up gold before updating its fingerprint')
 assert.match(fixture.source_sha256,/^[a-f0-9]{64}$/)
 assert.match(fixture.source_revision,/^[a-f0-9]{40}$/)
})
test('follow-up source accepts metadata-only regeneration without changing graph content',()=>{
 const regenerated=structuredClone(graph)
 regenerated.meta.generated=graph.meta.generated==='2026-10-25'?'2026-11-01':'2026-10-25'
 assert.equal(sourceFingerprint(regenerated),fixture.source_semantic_sha256)
 assert.equal(sourceFingerprint(JSON.parse(JSON.stringify(regenerated,null,2))),fixture.source_semantic_sha256)
})
test('follow-up source still detects changed figures, identities, periods, rows and provenance',()=>{
 const controls={
  'donor figure':g=>{g.nodes.find(n=>n.kind==='donor').total+=1},
  'donor identity':g=>{g.nodes.find(n=>n.kind==='donor').id='donor:synthetic-control'},
  'donor label':g=>{g.nodes.find(n=>n.kind==='donor').label='Synthetic control'},
  'receipt count':g=>{g.edges[0].count+=1},
  'flow figure':g=>{g.edges[0].total+=1},
  'recipient identity':g=>{g.edges[0].target='party:synthetic-control'},
  'financial period':g=>{g.edges[0].byYear['1900']=[1,1]},
  'added row':g=>{g.edges.push({...g.edges[0]})},
  'removed row':g=>{g.edges.pop()},
  'added node':g=>{g.nodes.push({...g.nodes[0]})},
  'removed node':g=>{g.nodes.pop()},
  'source reference':g=>{g.meta.source='Synthetic source control'},
  'coverage':g=>{g.meta.coverage='Synthetic coverage control'},
  'other metadata':g=>{g.meta.rows_considered+=1},
  'new metadata':g=>{g.meta.synthetic_control=true}
 }
 for(const [control,change] of Object.entries(controls)){
  const changed=structuredClone(graph);change(changed)
  assert.notEqual(sourceFingerprint(changed),fixture.source_semantic_sha256,control)
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
test('follow-up population has ten tool-derived two/three turn conversations',()=>{
 assert.equal(fixture.conversations.length,10)
 for(const c of fixture.conversations){assert.ok(c.turns.length>=2&&c.turns.length<=3);for(const t of c.turns){assert.ok(t.question&&t.standalone);assert.ok(t.context_all.length);if(t.decision==='answer')assert.ok(t.rows.length||t.novel_from_previous&&t.eligible_rows.length)}}
})
test('conversation requests carry resolved questions and minimal source metadata exactly as sendChat',()=>{
 const thread=[];recordConversationTurn(thread,'what about Labor?',{answer:'A supported answer.',asked_as:'Who gives the most to Labor?',sources:[{resource:'a'.repeat(32),slug:'speech-1',kind:'speech',cited:true,speaker:'Private field not carried',snippet:'not sent'}]})
 const req=clientConversationRequest(thread);assert.equal(req.context[0].text,'Who gives the most to Labor?');assert.deepEqual(req.prior_resources,['a'.repeat(32)]);assert.deepEqual(req.context[1].sources,[{slug:'speech-1',kind:'speech'}]);assert.ok(!JSON.stringify(req).includes('not sent'))
 recordConversationTurn(thread,'and in 2019?',{answer:'A calculation.',asked_as:'Generic rewrite',money_ranking:true,money_question:'Who gave most to Labor in 2019?',sources:[]});assert.equal(clientConversationRequest(thread).context[2].text,'Who gave most to Labor in 2019?')
})
test('follow-up grading catches a lost entity, changed amount and a decline converted into ranking',()=>{
 const turn=fixture.conversations[0].turns[1],r=turn.rows[0],text=`${r.donor} provided the most disclosed funding to Labor: $${r.total_aud.toLocaleString('en-AU')}.`,source={resource:'fact-1',kind:'export',cited:true,snippet:`Donor: ${r.donor} — $${r.total_aud.toLocaleString('en-AU')}.`,title:'Selected Labor receipts'}
 const p={answer:text,asked_as:turn.standalone,citations:{'fact-1/t/body/0':[[0,text.length]]},sources:[source]}
 assert.equal(gradeFollowUp(turn,p).pass,true);assert.equal(gradeFollowUp(turn,{...p,asked_as:'Who gives most to One Nation?'}).context,'fail');assert.equal(gradeFollowUp(turn,{...p,answer:text.replace(r.total_aud.toLocaleString('en-AU'),'1')}).owners_figures,'fail');assert.equal(gradeFollowUp({...turn,decision:'decline',rows:[]},p).declines,'fail')
})
test('recipient switches reject a rewrite that keeps the old party as recipient',()=>{
 const t={...fixture.conversations[0].turns[1],context_not:['One Nation']}
 const p={asked_as:'What funding did Labor provide to One Nation?',answer:'The selected records do not establish that.',sources:[],citations:{}}
 assert.equal(gradeFollowUp(t,p).context,'fail')
})
