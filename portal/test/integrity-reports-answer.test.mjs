// Ask answers over integrity_reports citations: the final claim audit keeps a commission's
// own findings, quoted or restated, and still rejects a figure the record does not hold.
// No provider or network calls.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {build} from 'esbuild'
import {auditPayload} from '../src/research-claim-audit.mjs'
const built=await build({stdin:{contents:"export * from './src/research-grounding';export {callTool} from './src/tools/index';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'node',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const env={asset:async path=>JSON.parse(await readFile(new URL('../public'+path,import.meta.url),'utf8')),origin:'https://opax.test'}
const sourceOf=(c,i)=>({resource:'fact-'+(i+1),slug:'',title:c.text,href:c.url,url:c.url,snippet:c.text,cited:true,kind:'record'})
const payload=(answer,sources)=>({answer,answer_decision:'answer',citations:Object.fromEntries(sources.map(s=>[s.resource+'/t/body/0',[[0,Array.from(answer).length]]])),sources,research:{pre_writer_sources:sources}})

// The production Ask of 2026-11-11 ("What did the National Anti-Corruption Commission find in
// Operation Pelican?") kept only the recommendation: "8(1)(c)" was audited as a count, and the
// commission's full name was not in the evidence.
const q="What did the National Anti-Corruption Commission find in Operation Pelican?"

test('a named NACC report: its findings survive the audit, quoted or restated, under either name',async()=>{
  const out=await api.callTool(env,'integrity_reports',{view:'reports',operation:'Operation Pelican'})
  const sources=out.citations.filter(c=>c.kind==='record').map(sourceOf)
  assert.ok(sources.some(s=>/\[finding\]/.test(s.snippet)))
  for(const answer of [
    'The National Anti-Corruption Commission found that Mr Erasery engaged in conduct which was an abuse of his office as a public official within subsection 8(1)(c) of the NACC Act, and thus engaged in corrupt conduct.',
    'The NACC found that, for the purposes of subsection 149(3), Mr Erasery "engaged in corrupt conduct of a serious nature."',
  ]){
    const p=payload(answer,sources)
    assert.deepEqual(auditPayload(q,p).findings,[],answer)
    assert.equal(api.groundAnswerPayload(p,q).answer,answer)
  }
})

test('a statutory reference is not a figure, but an invented count still is',async()=>{
  const out=await api.callTool(env,'integrity_reports',{view:'reports',operation:'Operation Pelican'})
  const sources=out.citations.filter(c=>c.kind==='record').map(sourceOf)
  const wrong='The NACC found that 8 officials engaged in corrupt conduct.'
  assert.ok(auditPayload(q,payload(wrong,sources)).findings.some(f=>f.type==='figure'&&f.value==='8'))
})

const sourcesFor=async calls=>{const out=[];for(const a of calls)for(const c of (await api.callTool(env,'integrity_reports',a)).citations)out.push(sourceOf(c,out.length));return out}

test('count and report citations read as plain sentences: no clock time, no tool syntax, no label-and-number shape',async()=>{
  const sources=await sourcesFor([{view:'reports',body:'NSW ICAC',jurisdiction:'nsw',since:'2025-01-01',until:'2025-12-31'},{view:'reports',body:'NACC',limit:8}])
  for(const s of sources){
    assert.doesNotMatch(s.snippet,/\d{2}:\d{2}|in the OPAX projection|match body|jurisdiction nsw|snapshot/,s.snippet)
    assert.doesNotMatch(s.snippet,/^[^:]{2,140}:\s*\$?\d/,s.snippet)
  }
  assert.match(sources[0].snippet,/^OPAX holds 1 integrity commission report or statement from the Independent Commission Against Corruption \(NSW ICAC\), dated 2025-01-01 to 2025-12-31 \(records as at \d{4}-\d{2}-\d{2}\)\.$/)
})

// The production Asks of 2026-11-11: "What has the NACC published in its investigation reports?"
// kept one generic sentence, because the count and per-report figures had no owner in the evidence.
test('a NACC overview keeps its count and named operations; a wrong count is still removed',async()=>{
  const q='What has the NACC published in its investigation reports?'
  const sources=await sourcesFor([{view:'reports',body:'NACC',limit:8}])
  const overview='The National Anti-Corruption Commission (NACC) has published 8 investigation reports: Operation Pentecost (13 May 2026), Operation Young (11 May 2026), Operation Pelican (8 April 2026), Operation Kingscliff (30 June 2025), Operation Elektra (11 June 2025), Operation Wilson (12 February 2025), Operation Bannister (9 October 2024) and Operation Myrtleford (March 2026).'
  for(const answer of [overview,'The NACC has published 8 investigation reports.','In Operation Kingscliff the NACC made 2 findings or opinions and 3 recommendations.']){
    const p=payload(answer,sources)
    assert.deepEqual(auditPayload(q,p).findings,[],answer)
    assert.equal(api.groundAnswerPayload(p,q).answer,answer)
  }
  assert.ok(auditPayload(q,payload('The NACC has published 12 investigation reports.',sources)).findings.some(f=>f.value==='12'))
  const myrtle=sources.find(s=>/Myrtleford/.test(s.snippet))
  assert.match(myrtle.snippet,/in March 2026 \(month taken from the publisher's file path\)/)
})

// q3 and q5 of 2026-11-11 opened "A further opinion of police misconduct ..." and "It also found ..."
// after the checked-points fallback removed their lead sentences.
test('an orphaned lead takes the subject of the commission record it cites',()=>{
  const finding='Integrity Commission (Tas Integrity Commission), "Own-Motion Investigation Karamu" (2025-12-02), Report, page 51: Findings [finding]: "The implementation of the Use of Force Review Panel appears to have resulted in better and more constructive feedback being given to officers."'
  const opinion='Corruption and Crime Commission (WA CCC), "CCC investigation highlights misconduct risks in WA Police Force" (2023-10-26), Report on Serious Misconduct by a Senior Police Officer, page 38: opinion of police misconduct [opinion]: "The Commission has formed an opinion of police misconduct."'
  const cases=[
    ['It also found that the Use of Force Review Panel appears to have resulted in better feedback to officers.',finding,/^The Integrity Commission found that the Use of Force/],
    ['A further finding was that the panel appears to have resulted in better feedback to officers.',finding,/^The Integrity Commission found that the panel/],
    ['A further opinion of police misconduct in its 26 October 2023 report.',opinion,/^The Corruption and Crime Commission formed an opinion of police misconduct in its/],
  ]
  for(const [answer,snippet,expect] of cases){
    const src=sourceOf({text:snippet,url:'https://example.gov.au/r.pdf'},0)
    const out=api.cleanAnswerShape(payload(answer,[src]))
    assert.match(out.answer,expect)
    const [[a,b]]=out.citations['fact-1/t/body/0']
    assert.equal(a,0);assert.equal(b,Array.from(out.answer).length)
  }
  // with no official body to name, the sentence is left as written
  const src=sourceOf({text:'Some speech text.',url:'https://example.org/'},0)
  assert.equal(api.cleanAnswerShape(payload('It also found that rents rose.',[src])).answer,'It also found that rents rose.')
})
