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
