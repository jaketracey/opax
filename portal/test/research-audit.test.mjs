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
test('audit treats malformed quotations as unverified and keeps multi-sentence literal quotations',()=>{
 assert.ok(audit('Avery Example said the planets and the stars are money".').findings.length)
 const text='I oppose the bill. The evidence is clear.'
 assert.equal(audit('Avery Example said “'+text+'”.',[src('a',text,{kind:'speech',speaker:'Avery Example'})]).findings.length,0)
})
test('audit checks a second invented recipient even when it borrows the first recipient amount',()=>{
 assert.ok(audit('Avery Example received $277,602, and Banana Alliance received $277,602.').findings.length)
})
test('audit retains disclosed receipt direction and binds donor, recipient and amount together',()=>{
 const sources=[src('a','Disclosed receipt: Fixture Mining Pty Ltd → Example Party — $100,000 in disclosed political receipts; 5 records.'),src('b','Disclosed receipt: Other Mining Pty Ltd → Example Party — $200,000 in disclosed political receipts; 7 records.')]
 assert.equal(audit('Fixture Mining Pty Ltd gave $100,000 to Example Party.',sources).findings.length,0)
 assert.ok(audit('Other Mining Pty Ltd gave $100,000 to Example Party.',sources).findings.length)
 assert.ok(audit('Fixture Mining Pty Ltd received $100,000 from Example Party.',sources).findings.length)
})
test('audit resolves a selected speaker first-and-last alias without changing donor identities',()=>{
 assert.equal(audit('In 2005 Avery Example said “a literal phrase”.',[src('s','a literal phrase',{kind:'speech',speaker:'Avery Middle Example',date:'2005-01-01'})]).findings.length,0)
})
test('audit cannot turn a speaker count into an anonymous total',()=>{
 assert.ok(audit('There were 87 housing speeches.',[src('a','Avery Example: 87 chamber speeches labelled housing.')]).findings.length)
})
test('audit binds coverage percentages to their own decade',()=>{
 const sources=[src('coverage','Topic labels cover 73% of the record: 91% of the 2010s and 22% of the 1990s.')]
 assert.equal(audit('Topic labels cover 91% of the 2010s record.',sources).findings.length,0)
 assert.ok(audit('Topic labels cover 91% of the 1990s record.',sources).findings.length)
})
test('audit keeps party-comparison counts attached to their party in both word orders',()=>{
 const sources=[src('f','124 Labor and 50 Liberal parliamentarians were compared.')]
 assert.equal(audit('There were 124 Labor and 50 Liberal parliamentarians.',sources).findings.length,0)
 assert.ok(audit('Liberal has 124 parliamentarians and Labor has 50.',sources).findings.length)
})
test('audit binds fractional figures to their recipient',()=>{
 const sources=[src('s','Nearly half to the ALP and more than a quarter to the Coalition.',{kind:'speech'})]
 assert.equal(audit('Nearly half to the ALP and more than a quarter to the Coalition.',sources).findings.length,0)
 assert.ok(audit('Nearly half to the Coalition and more than a quarter to the ALP.',sources).findings.length)
})
