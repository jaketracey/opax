import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { mentions, nameCheck, gradeRow, evidenceOf } from '../../scripts/research_eval_grade.mjs'
const built = await build({ stdin: { contents: "export * from './src/ask-constraints'; export {inferPeriod} from './src/agentic-ask'; export {datedPay} from './src/pay-history';", resolveDir: new URL('..', import.meta.url).pathname }, bundle: true, write: false, platform: 'node', format: 'esm' })
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))
const empty = { people: [], parties: [], bills: [], ambiguous: false, unresolved: false }
const constraints = (q, scope=empty, filters={}) => api.extractAskConstraints(q, api.inferPeriod(q), scope, filters)
const pay = JSON.parse(readFileSync(new URL('../public/pay.json', import.meta.url)))
test('Jake’s exact 2005 question prices the dated base and posts across both salary steps', () => {
 const c=constraints('who is the highest paid politician in 2005')
 const step=api.constrainStep({tool:'parliamentary_pay',args:{as_of:'2026-10-19',limit:1}},c,{as_of:{},since:{},until:{}})
 assert.equal(step.args.as_of,undefined);assert.equal(step.args.since,'2005-01-01');assert.equal(step.args.until,'2005-12-31')
 const r=api.datedPay(pay,step.args)
 assert.deepEqual(r.rows.map(r=>[r.name,r.salary,r.since,r.until]),[['John Howard',277602,'2005-01-01','2005-06-30'],['John Howard',288990,'2005-07-01','2005-12-31']])
 assert.ok(r.citations.every(c=>c.url.includes('aph.gov.au')));assert.equal(r.coverage.as_of,pay.meta.as_of)
})
test('a historical result cannot silently carry current facts, even if the model selected them', () => {
 const old={tool:'parliamentary_pay',ok:true,data:{coverage:{since:'2026-10-19',until:'2026-10-19',as_of:'2026-10-19'},rows:[{salary:622102}]},cite:[{kind:'record',label:'Current salary $622,102',url:'https://example.org/pay'}],notes:[]}
 const guarded=api.guardToolPeriod(old,{tool:old.tool,args:{}},constraints('highest paid politician in 2005'))
 assert.equal(guarded.data.coverage_only,true);assert.doesNotMatch(JSON.stringify(guarded),/622,102|622102/);assert.match(guarded.cite[0].label,/cannot establish/)
})
test('unsupported pre-1999, future and state pay periods explain coverage without current salaries', () => {
 for (const args of [{as_of:'1990'},{as_of:'2030'},{as_of:'2005',jurisdiction:'vic'}]){
  const r=api.datedPay(pay,args);assert.equal(r.rows.length,0);assert.equal(r.coverage.matched,false);assert.doesNotMatch(JSON.stringify(r),/622,102/)
 }
 assert.equal(api.datedPay(pay,{as_of:'2005',party:'Liberal'}).coverage.matched,false)
})
test('an exact date uses that day’s salary; a whole year preserves office-holder changes', () => {
 assert.equal(api.datedPay(pay,{as_of:'2005-06-30',limit:1}).rows[0].salary,277602)
 const r=api.datedPay(pay,{as_of:'2010',limit:1});assert.ok(r.rows.some(r=>r.name==='Kevin Rudd'));assert.ok(r.rows.some(r=>r.name==='Julia Gillard'))
})
test('constraints cover ranges, exact dates, previous term, jurisdiction, chamber, party, place and trend', () => {
 const c=constraints('Which federal senators from Labor spoke most about housing between 2010 and 2015?',{...empty,parties:['Labor']})
 const s=api.constrainStep({tool:'count_speeches',args:{}},c,{since:{},until:{},state:{},chamber:{},party:{}})
 assert.deepEqual(s.args,{since:'2010-01-01',until:'2015-12-31',state:'federal',chamber:'senate',party:'Labor'})
 assert.equal(constraints('Who spoke most last term?').period.until,'2025-03-28')
 assert.equal(constraints('Pay on 2005-06-30').period.since,'2005-06-30')
 assert.equal(constraints('Who spoke most since 2010?').trend,true)
 assert.equal(constraints('What electorate has the lowest median income?').place,undefined)
 const g=constraints('Biggest federal grants in the electorate of Perth in 2022')
 assert.equal(api.constrainStep({tool:'grants',args:{}},g,{electorate:{},jurisdiction:{},from_year:{},to_year:{}}).args.electorate,'Perth')
})
test('Census snapshots and unknown coverage cannot masquerade as historical rankings', () => {
 const r={tool:'electorates',ok:true,data:{coverage:{eligible:100}},cite:[{kind:'export',label:'2021 Census population 1234',url:'https://example.org/seat'}],notes:[]}
 const guarded=api.guardToolPeriod(r,{tool:'electorates',args:{}},constraints('median age in Corangamite in 2005'))
 assert.equal(guarded.coverage.as_of,'2021-08-10');assert.equal(guarded.data.coverage_only,true);assert.doesNotMatch(JSON.stringify(guarded),/1234/)
})
test('grader accepts unique surname mentions and detects invented surname-only people', () => {
 assert.equal(mentions('Example said housing supply matters.','Robin Example'),true)
 assert.deepEqual(nameCheck('Example said so.','What did Robin Example say?',evidenceOf({}),['Robin Example']).bound,['Robin Example'])
 assert.deepEqual(nameCheck('Sample said so.','What was said?',evidenceOf({}),['Casey Sample']).unbound,['Casey Sample'])
 assert.deepEqual(nameCheck('Smith said so.','What was said?',evidenceOf({}),['Robin Smith','Casey Smith']).found,[])
})
test('fixture retains all three existing sets and at least 40 questions with explicit properties', () => {
 const f=JSON.parse(readFileSync(new URL('./fixtures/ask-routing-evals.json',import.meta.url)))
 assert.ok(f.questions.length>=40);for(const q of f.questions)assert.ok(q.must.length,q.id)
 assert.ok(f.questions.find(q=>q.question==='who is the highest paid politician in 2005'))
 for(const source of ['agentic-ask-gold.json','research-evals.json','scripts/ask_regression_questions.json'])assert.ok(f.questions.some(q=>q.provenance?.file===source))
 assert.equal(gradeRow(f.questions[0],{answer:'Anthony Albanese is paid $622,102 in 2026.',sources:[]}).axes.constraints,'fail')
})
test('dated salary arithmetic reconciles every current export row, including half-dollar rounding', () => {
 for (const row of pay.current) assert.equal(api.datedPay(pay,{person:row.name,as_of:pay.meta.as_of}).rows[0]?.salary,row.salary,row.name)
})
test('historical person comparisons retain both people and do not rank unrelated members', () => {
 const r=api.datedPay(pay,{as_of:'2005',people:['John Howard','Peter Costello']})
 assert.deepEqual([...new Set(r.rows.map(r=>r.name))].sort(),['John Howard','Peter Costello'])
})
test('a named state government is kept distinct from the location of federal grants', () => {
 const properties={jurisdiction:{},state:{}}
 assert.equal(api.constrainStep({tool:'grants',args:{}},constraints('Queensland government grants'),properties).args.jurisdiction,'qld')
 assert.equal(api.constrainStep({tool:'grants',args:{}},constraints('federal grants in Queensland'),properties).args.jurisdiction,'federal')
})
