import test from 'node:test'
import assert from 'node:assert/strict'
import {auditPayload} from '../../scripts/research_eval_audit.mjs'
const src=(resource,snippet,extra={})=>({resource,snippet,cited:true,kind:'record',...extra})
const facts=[src('a','Avery Example: $277,602 a year as Prime Minister, 2005-01-01 to 2005-06-30; base $106,770 plus 160%.'),src('b','Blake Sample: $170,000 a year as Minister, 2005-01-01 to 2005-12-31; base $106,770 plus 60%.')]
const audit=(answer,sources=facts,question='What did Avery Example earn in 2005?')=>auditPayload(question,{answer,sources,citations:{}})
for(const bad of ['Banana received $277,602.','Banana Alliance received $277,602.','$277,602 was paid to Blake Sample.','Blake Sample received $277,602.','From 1 July 2005 Avery Example received $277,602.','Blake Sample received a loading of 160%.','Avery Example said “I love corruption”.',"Avery Example said ‘I love corruption’."]){
 test('audit rejects unsupported association: '+bad,()=>assert.ok(audit(bad).findings.length,bad))
}
test('audit checks speaker ownership even when another person is mentioned in the passage',()=>{
 assert.ok(audit('Blake Sample said the bill was unfair.',[src('s','Blake Sample asked a question. I oppose the bill.',{kind:'speech',speaker:'Avery Example',date:'2024-01-01'})]).findings.length)
})
test('audit checks metric ownership instead of a shared numeric token',()=>{
 assert.ok(audit('Avery Example recorded 87 housing speeches.',[src('a','Avery Example: 87 chamber speeches labelled climate.'),src('b','Avery Example: 99 chamber speeches labelled housing.')]).findings.length)
 assert.ok(audit('Avery Example earned a salary of $100,000.',[src('a','Avery Example: $100,000 in grants.')]).findings.length)
})
test('audit verifies annual rates with dates and preserves equal figures for distinct owners',()=>{
 assert.equal(audit('Avery Example earned $277,602 a year as Prime Minister from 2005-01-01 to 2005-06-30.').findings.length,0)
 assert.equal(audit('Avery Example and Blake Sample each recorded 87 housing speeches.',[src('a','Avery Example: 87 chamber speeches labelled housing.'),src('b','Blake Sample: 87 chamber speeches labelled housing.')]).findings.length,0)
})
test('audit extracts literal quotes and treats one-dollar and $1 as the same figure',()=>{
 const result=audit('In 2012 Avery Example called for $1 bets and said “mandatory precommitment”.',[src('a','I support mandatory precommitment and one-dollar maximum bets.',{kind:'speech',speaker:'Avery Example',date:'2012-03-01'})])
 assert.equal(result.findings.length,0);assert.equal(result.counts.quotes,1);assert.equal(result.counts.figures,1)
})
