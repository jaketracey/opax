import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {clientConversationRequest,recordConversationTurn,gradeFollowUp} from '../../scripts/research_followups.mjs'
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/research-followups.json',import.meta.url)))
test('follow-up population has ten tool-derived two/three turn conversations',()=>{
 assert.equal(fixture.conversations.length,10);assert.equal(fixture.source_sha256,crypto.createHash('sha256').update(fs.readFileSync(new URL('../public/graph/money.json',import.meta.url))).digest('hex'))
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
