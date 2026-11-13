import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {build} from 'esbuild'
import {MockLanguageModelV4} from 'ai/test'

const built = await build({stdin:{contents:[
  "export * from './src/agentic-ask'",
  "export * from './src/research-loop'",
  "export * from './src/research-evidence'",
  "export * from './src/research-response'",
  "export * from './src/research-grounding'",
  "export * from './src/transcript-answer'",
  "export * from './src/research-writer'",
  "export {writingFacts} from './src/research-writing'",
].join(';'),resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'browser'})
const api = await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const questions = [
  'What did witnesses say about income averaging at the Robodebt Royal Commission?',
  'What evidence was given about income averaging at the Robodebt Royal Commission?',
  'What did witnesses tell the Robodebt Royal Commission about income averaging?',
]
const asset = async path => JSON.parse(await readFile(new URL('../public'+path,import.meta.url),'utf8'))
const scope = q => api.resolveNamedScope(q,{asset})
const dailyBudget = {reserve:async()=>({settle:async()=>{}})}
const reply = (toolName,args) => ({content:[{type:'tool-call',toolName,toolCallId:toolName,input:JSON.stringify(args)}],finishReason:{unified:'tool-calls',raw:'tool_calls'},usage:{inputTokens:{total:10,noCache:10,cacheRead:0,cacheWrite:0},outputTokens:{total:5,text:5,reasoning:0}},warnings:[]})
const transcript = {view:'transcripts',commission:'robodebt',words:'income averaging',limit:1}
const speech = 'Income averaging can reduce the tax paid by startup founders. This is a parliamentary tax debate.'
const id = 'speech-999999/t/body/0-'+speech.length
const source = {resource:'speech-999999',slug:'speech-999999',kind:'speech',speaker:'Example Speaker',title:'Robodebt parliamentary discussion',snippet:speech,cited:true,url:'https://offline.test/doc/speech-999999',href:'/doc/speech-999999'}
const search = {resources:{'speech-999999':{slug:'speech-999999',title:source.title,fields:{body:{paragraphs:{[id]:{text:speech}}}}}}}
const originalFetch = globalThis.fetch
globalThis.fetch = async () => {throw Error('No network in addendum 2 unit tests')}
test.after(()=>{globalThis.fetch=originalFetch})
function validRanges(payload) {
  assert.ok(Object.keys(payload.citations).length)
  for (const [key,ranges] of Object.entries(payload.citations)) {
    assert.ok(payload.sources.some(s=>key===s.resource||key.startsWith(s.resource+'/')))
    for (const [a,b] of ranges) assert.ok(a>=0&&b>a&&b<=Array.from(payload.answer).length)
  }
}
function hearingAnswer(out) {
  assert.match(out.answer,/Ms Preston.*hearing day 46/)
  assert.match(out.answer,/evidence, not findings/)
  assert.doesNotMatch(out.answer,/startup|founders|fabricated|PDF page|©|CC BY|^-/m)
  assert.ok(out.sources.filter(s=>s.cited&&!s.coverage).every(s=>s.url.startsWith('https://robodebt.royalcommission.gov.au/')))
  validRanges(out)
}
for (const q of questions) {
  test('hearing intent: '+q,()=>{
    assert.equal(api.hearingEvidenceQuestion(q),true)
  })
  for (const terminal of ['answer','finish','provider-stop']) test(terminal+' retains retrieved hearing evidence: '+q,async()=>{
    let turn=0
    const model = new MockLanguageModelV4({doGenerate:async()=>{
      if (turn++===0) return reply('royal_commissions',transcript)
      if (turn===2) return reply('search',{query:'income averaging'})
      if (terminal==='provider-stop') throw Error('Provider stopped after retrieval')
      return terminal==='finish'?reply('finish',{facts:[1]}):reply('answer',{points:[{id,quote:speech,claim:'A fabricated parliamentary finding about startup founders.'}]})
    }})
    const research=api.createResearch({model,dailyBudget,modelBudgetSpent:async()=>false,readRecord:async()=>({text:speech,speaker:'Example Speaker',labels:{kind:'speech'},metadata:{date:'2026-06-15'}})})
    const out=await api.runAgentic(q,{origin:'https://offline.test',asset,kb:async()=>search,research,generate:async()=>{throw Error('Must not invoke the planner')}},async()=>{},40000,undefined,{},await scope(q))
    assert.equal(out.answered,true,JSON.stringify(out.research))
    hearingAnswer(out.qualitative)
    assert.doesNotMatch(JSON.stringify(out.research?.rejections??[]),/named_unresolved/)
  })
}
test('ordinary parliamentary discussion is not hearing evidence',()=>{
  for(const q of ['What has Parliament said about the Robodebt Royal Commission?','What did witnesses tell Parliament about the Robodebt Royal Commission?','How many hearing days were held at the Robodebt Royal Commission?']) assert.equal(api.hearingEvidenceQuestion(q),false,q)
  assert.equal(api.hearingEvidenceQuestion('x '.repeat(100000)+questions[0]),false)
  assert.equal(api.hearingEvidenceQuestion('What did witnesses say at '+'a'.repeat(100000)+' Royal Commission?'),false)
})
const gap = {answer:'This selection does not establish their position on that topic.',answer_decision:'limitation',answer_status:'evidence_gap',citations:{},sources:[{...source,cited:false}]}
test('a caveat is kept as written, and typed refusals and clarifications survive',()=>{
  assert.deepEqual(api.ensureAnswerText(gap,'What did records show?'),gap)
  for(const answer_decision of ['refusal','clarification']) {
    const p={...gap,answer_decision,answer_status:answer_decision==='refusal'?'refused':'needs_scope',answer:'Please clarify the person, or ask about public records.'}
    assert.deepEqual(api.groundAnswerPayload(p,questions[0]),p)
  }
})
test('a written quotation not in the transcript loses its quote marks; a verbatim one keeps them, in one pass',async()=>{
  const text='Royal Commission into the Robodebt Scheme, Transcript Hearing Day 46 (10 March 2023), transcript page P-4899 (PDF page 15), hearing turn by Ms Preston: "Income averaging did not make sense to me." transcript page P-4933 (PDF page 49), hearing turn by Mr Scott: "Do you agree that this approach described income averaging?" Hearing transcript: evidence, not findings.'
  const facts=api.writingFacts(undefined,[{id:1,text,cite:{kind:'record',url:'https://robodebt.royalcommission.gov.au/transcript.pdf#page=15',label:text}}])
  let turn=0
  const model=new MockLanguageModelV4({doGenerate:async()=>({content:[{type:'text',text:JSON.stringify({answer_decision:'answer',sentences:[
    ...(turn++===0?[{text:'Ms Preston said “A fabricated quotation about averaging.”',facts:[1]}]:[]),
    {text:'Mr Scott asked on hearing day 46 (10 March 2023): “Do you agree that this approach described income averaging?”',facts:[2]},
  ]})}],finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:10,noCache:10,cacheRead:0,cacheWrite:0},outputTokens:{total:5,text:5,reasoning:0}},warnings:[]})})
  const stats={rounds:0,tokens:{input:0,output:0},turns:[]}
  const write=api.createAnswerWriter({model,dailyBudget,modelBudgetSpent:async()=>false})
  const out=await write({question:questions[1],period:api.inferPeriod(questions[1]),facts},stats,undefined,20000)
  assert.equal(model.doGenerateCalls.length,1)
  assert.match(out.answer,/^Ms Preston said A fabricated quotation about averaging/);assert.doesNotMatch(out.answer,/“A fabricated/)
  assert.match(out.answer,/Mr Scott asked on hearing day 46 \(10 March 2023\): “Do you agree that this approach described income averaging/)
  validRanges(out)
})
