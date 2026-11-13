// Ask answers over annual_reports rows: the final claim audit and clause repair. No provider or network calls.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {build} from 'esbuild'
import {auditPayload} from '../src/research-claim-audit.mjs'
const built=await build({stdin:{contents:"export * from './src/research-grounding';export {callTool} from './src/tools/index';export {constrainStep,extractAskConstraints} from './src/ask-constraints';export {inferPeriod} from './src/ask-period';export {toolArgProblem,TOOL_SPECS} from './src/agentic-tools';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const env={asset:async path=>JSON.parse(await readFile(new URL('../public'+path,import.meta.url),'utf8')),origin:'https://opax.test'}

// The production Ask of 2026-11-11 selected this one fact (row 106) and answered
// "Michael Wallace's total remuneration at the Australian Commission on Safety." with no figure.
const wallace='Michael Wallace (Chief Operating Officer), Australian Commission on Safety and Quality in Health Care, 2019-20 annual report data (Transparency Portal data file "Information about remuneration for key management personnel - 2019-20.csv", row 106): total remuneration $415,799 (base salary $281,072, bonuses $36,892, superannuation $49,916, termination not published as a number). Reported for the period the person held the role.'
const q1="What was Michael Wallace's total remuneration at the Australian Commission on Safety and Quality in Health Care in 2019-20?"
const sourceOf=(text,i=2,kind='record')=>({resource:'fact-'+i,slug:'',title:text,href:'https://www.transparency.gov.au/',url:'https://www.transparency.gov.au/',snippet:text,cited:true,kind})
const payload=(answer,sources)=>({answer,answer_decision:'answer',citations:Object.fromEntries(sources.map(s=>[s.resource+'/t/body/0',[[0,Array.from(answer).length]]])),sources,research:{pre_writer_sources:sources}})

test('a remuneration answer keeps the body name whole and the figure it was asked for',()=>{
  for(const answer of [
    "Michael Wallace's total remuneration at the Australian Commission on Safety and Quality in Health Care in 2019-20 was $415,799.",
    'Michael Wallace, Chief Operating Officer of the Australian Commission on Safety and Quality in Health Care, received total remuneration of $415,799 in 2019-20.',
    'The Australian Commission on Safety and Quality in Health Care reported total remuneration of $415,799 for Michael Wallace in 2019-20.',
  ]){
    const p=payload(answer,[sourceOf(wallace)])
    assert.deepEqual(auditPayload(q1,p).findings,[],answer)
    assert.equal(api.groundAnswerPayload(p,q1).answer,answer)
  }
})

test('a wrong payee is corrected from the cited remuneration record; an amount it does not hold is left as written',()=>{
  for(const [answer,expected] of [
    ["Michael Wallace's total remuneration at the Australian Commission on Safety and Quality in Health Care in 2019-20 was $999,999.",null],
    ["Jane Doe's total remuneration at the Australian Commission on Safety and Quality in Health Care in 2019-20 was $415,799.","Michael Wallace's total remuneration at the Australian Commission on Safety and Quality in Health Care in 2019-20 was $415,799."],
  ]){
    const out=api.groundAnswerPayload(payload(answer,[sourceOf(wallace)]),q1).answer
    assert.ok(auditPayload(q1,payload(answer,[sourceOf(wallace)])).findings.some(f=>f.type==='figure'),answer)
    assert.equal(out,expected??answer)
  }
})

test('one person\'s figure is not supported by another row at the same body',async()=>{
  const out=await api.callTool(env,'annual_reports',{view:'remuneration',body:'Department of Finance',year:'2023-24',limit:2})
  const [a,b]=out.rows,sources=out.citations.slice(1).map((c,i)=>sourceOf(c.text,i+2))
  const money=n=>'$'+Math.round(n).toLocaleString('en-AU'),q='What were the Department of Finance executives paid in 2023-24?'
  assert.deepEqual(auditPayload(q,payload(`${a.name}'s total remuneration at the Department of Finance in 2023-24 was ${money(a.total)}.`,sources)).findings,[])
  assert.ok(auditPayload(q,payload(`${b.name}'s total remuneration at the Department of Finance in 2023-24 was ${money(a.total)}.`,sources)).findings.some(f=>f.type==='figure'))
})

test('ranking bodies by key management personnel rows answers with counts of rows, not people',async()=>{
  const out=await api.callTool(env,'annual_reports',{view:'kmp_counts',year:'2018-19'}),sources=out.citations.map((c,i)=>sourceOf(c.text,i+2,c.kind))
  const q='Which Commonwealth agencies reported the most key management personnel in 2018-19?',[first,second]=out.rows
  const answer=`In 2018-19, the ${first.body} published the most key management personnel disclosure rows (${first.kmp_rows}), followed by the ${second.body} with ${second.kmp_rows}.`
  assert.deepEqual(auditPayload(q,payload(answer,sources)).findings,[])
  assert.equal(api.groundAnswerPayload(payload(answer,sources),q).answer,answer)
})

test('the highest paid executive by year is a side-by-side comparison with each year\'s own person',async()=>{
  const out=await api.callTool(env,'annual_reports',{view:'top_by_year',body:'Department of Health',first_year:'2018-19',last_year:'2024-25'}),sources=out.citations.map((c,i)=>sourceOf(c.text,i+2,c.kind))
  const q="How has the Department of Health's highest paid executive's total remuneration changed from 2018-19 to 2024-25?"
  const answer='In 2018-19 the largest row was Glenys Beauchamp (Secretary) at $858,014. In 2024-25 it was Blair Comley (Secretary) at $972,552.'
  assert.deepEqual(auditPayload(q,payload(answer,sources)).findings,[])
  assert.equal(api.groundAnswerPayload(payload(answer,sources),q).answer,answer)
  // A figure moved to the wrong year's person is not supported.
  assert.ok(auditPayload(q,payload('Glenys Beauchamp received $972,552 in 2024-25.',sources)).findings.length)
})

// Production 2026-11-11 after the first deploy: a dated question ("in 2019-20") failed with malformed_args because
// the request scope writes numeric from_year/to_year into any tool that declares them, and annual_reports briefly did.
test('dated questions keep valid annual_reports arguments after request scoping',()=>{
  const props=api.TOOL_SPECS.find(t=>t.name==='annual_reports').input.properties
  assert.ok(!('from_year' in props)&&!('to_year' in props)&&!('since' in props)&&!('until' in props))
  const cases=[
    ["What was Michael Wallace's total remuneration at the Australian Commission on Safety and Quality in Health Care in 2019-20?",{view:'remuneration',person:'Michael Wallace',body:'Australian Commission on Safety and Quality in Health Care',year:'2019-20'}],
    ["How has the Department of Health's highest paid executive's total remuneration changed from 2018-19 to 2024-25?",{view:'top_by_year',body:'Department of Health',first_year:'2018-19',last_year:'2024-25'}],
    ['Which Commonwealth agencies reported the most key management personnel in 2018-19?',{view:'kmp_counts',year:'2018-19'}],
  ]
  for(const [q,args] of cases){
    const c=api.extractAskConstraints(q,api.inferPeriod(q),{people:[],parties:[],bills:[],ambiguous:false,unresolved:false})
    const step=api.constrainStep({tool:'annual_reports',args},c,props)
    assert.deepEqual(step.args,args,q)
    assert.equal(api.toolArgProblem('annual_reports',step.args),null,q)
  }
})
