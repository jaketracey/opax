import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { MockLanguageModelV4 } from 'ai/test'
const built = await build({ stdin: { contents: [
  "export {runAgentic,periodPlan} from './src/agentic-ask'",
  "export {createResearch} from './src/research-loop'",
  "export {createResearchCreditCooldown} from './src/research-credit'",
  "export {extractAskConstraints,constrainStep} from './src/ask-constraints'",
  "export {inferPeriod} from './src/ask-period'",
  "export {callTool,getAskTool} from './src/tools'",
  "export {matchesCatalogFilters} from './src/catalog-search'",
  "export {writingFacts,proseFallback,verifyWrittenAnswer,writingPrompt} from './src/research-writing'",
  "export {groundAnswerPayload} from './src/research-grounding'",
  "export {transcriptTurns,transcriptListingOnly,hearingEvidenceQuestion,TRANSCRIPT_LABEL} from './src/transcript-answer'",
].join(';'), resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, format: 'esm', platform: 'browser' })
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))
const originalFetch = globalThis.fetch
globalThis.fetch = async () => { throw Error('No network in round 3 unit tests') }
test.after(() => { globalThis.fetch = originalFetch })
const named = { people: [], parties: [], bills: [], ambiguous: false, unresolved: false }
const now = new Date('2026-11-12T00:00:00Z')
const period = {kind:'window',since:'2026-01-01',until:'2026-12-31',label:'Calendar year 2026.'}
function constraints(q) { return api.extractAskConstraints(q, api.inferPeriod(q,undefined,now), named) }

test('chamber language and the current calendar year constrain interests and discovery before lookup', () => {
  for (const [q,chamber] of [
    ['What gifts have senators declared this year?','senate'],
    ['What gifts have MPs declared this year?','representatives'],
    ['What have members of the House declared?','representatives'],
    ['What has the Victorian Legislative Council said?','vic_lc'],
    ['What have NSW Legislative Assembly members declared?','nsw_la'],
    ['What gifts have Queensland MPs declared?','qld_la'],
    ['What has the Legislative Council said?','legislative_council'],
  ]) {
    const c=constraints(q);assert.equal(c.chamber,chamber,q)
    for(const tool of ['declared_interests','find_records']) {
      const out=api.constrainStep({tool,args:{chamber:'representatives',since:'2025-01-01'}},c,api.getAskTool(tool).inputSchema.properties)
      assert.equal(out.args.chamber,chamber)
      if(q.includes('this year')) {assert.deepEqual(c.period,period);assert.equal(out.args.since,period.since);assert.equal(out.args.until,period.until)}
    }
  }
  assert.equal(api.inferPeriod('this year',undefined,new Date('2027-02-01')).since,'2027-01-01')
  assert.equal(api.inferPeriod('during 2024').since,'2024-01-01')
  assert.equal(api.inferPeriod('this term').since,'2025-07-22')
})
const bucket = items => ({gifts:{count:items.length,items}})
const assets = {
  '/interests/index.json': {_by_name:{'house member':'1','senate member':'2','older senator':'3','undated senator':'4'},people:{'1':{name:'House Member'},'2':{name:'Senate Member'},'3':{name:'Older Senator'},'4':{name:'Undated Senator'}}},
  '/interests/1.json': {name:'House Member',jurisdiction:'federal',chamber:'house',as_at:'2026-06-01',source_url:'https://www.aph.gov.au/house-register.pdf',buckets:bucket([{description:'House gift',date:''}])},
  '/interests/2.json': {name:'Senate Member',jurisdiction:'federal',chamber:'senate',as_at:'2026-05-01',source_url:'https://www.aph.gov.au/senate-register',buckets:bucket([{description:'Current dated gift',date:'2026-04-02',kind:'addition'},{description:'Undated gift in dated register',date:''},{description:'Earlier gift',date:'2025-04-02'}])},
  '/interests/3.json': {name:'Older Senator',jurisdiction:'federal',chamber:'senate',as_at:'2025-06-01',buckets:bucket([{description:'Old gift'}])},
  '/interests/4.json': {name:'Undated Senator',jurisdiction:'federal',chamber:'senate',as_at:'',statement_date:'',buckets:bucket([{description:'Unknown date',date:''}])},
}
const env = {origin:'https://offline.test',asset:async path=>structuredClone(assets[path]??null)}
test('interests filter chamber and dates before member selection; dates have an explicit basis',async()=>{
  const out=await api.callTool(env,'declared_interests',{category:'gifts',chamber:'senate',since:period.since,until:period.until,limit:1})
  assert.equal(out.error,undefined);assert.equal(out.rows.length,1);assert.equal(out.rows[0].name,'Senate Member');assert.equal(out.total,2)
  assert.match(out.citations[0].text,/lodgement or alteration: 2026-04-02/)
  assert.match(out.citations[0].text,/register as at: 2026-05-01/)
  assert.ok(!out.citations[0].text.includes('Earlier gift'));assert.ok(!out.citations[0].text.includes('House gift'))
  assert.match(out.citations[0].url,/aph.gov.au/)
  const house=await api.callTool(env,'declared_interests',{chamber:'representatives',category:'gifts'})
  assert.deepEqual(house.rows.map(r=>r.name),['House Member'])
  const no=await api.callTool(env,'declared_interests',{chamber:'senate',category:'gifts',since:'2027-01-01',until:'2027-12-31'})
  assert.deepEqual(no.rows,[]);assert.match(no.citations[0].text,/no matching declaration rows for Senate gifts from 2027-01-01 to 2027-12-31/)
  assert.match(no.citations[0].text,/preview cannot establish/)
  const wrong=await api.callTool(env,'declared_interests',{person:'House Member',chamber:'senate'})
  assert.deepEqual(wrong.rows,[]);assert.match(wrong.notes[0],/outside the requested chamber/)
  const state=await api.callTool(env,'declared_interests',{jurisdiction:'vic',chamber:'vic_lc'})
  assert.deepEqual(state.rows,[]);assert.match(state.citations[0].text,/no matching.*vic vic_lc/)
})
test('interests labels omit missing dates and use statement/register dates when available',async()=>{
  const noDate=await api.callTool(env,'declared_interests',{query:'Unknown date'})
  assert.match(noDate.citations[0].text,/\(federal register\)\./);assert.doesNotMatch(noDate.citations[0].text,/register,\s*\)/)
  const fallback={...env,asset:async path=>path==='/interests/4.json'?{...assets[path],statement_date:'2026-02-03'}:env.asset(path)}
  const dated=await api.callTool(fallback,'declared_interests',{query:'Unknown date'})
  assert.match(dated.citations[0].text,/register as at: 2026-02-03/)
  assert.match(dated.citations[0].text,/federal register, 2026-02-03/)
})
test('catalogue filters discard the wrong chamber and period before ranking; legacy unknowns never match a chamber',()=>{
  const meta=['interest',2026,2026,'federal','','','', 'house','2026-05-01']
  assert.equal(api.matchesCatalogFilters(meta,new URLSearchParams({chamber:'senate'})),false)
  assert.equal(api.matchesCatalogFilters(meta,new URLSearchParams({chamber:'representatives',since:'2026-01-01',until:'2026-12-31'})),true)
  assert.equal(api.matchesCatalogFilters(meta,new URLSearchParams({since:'2027-01-01'})),false)
  assert.equal(api.matchesCatalogFilters(meta.slice(0,7),new URLSearchParams({chamber:'senate'})),false)
})
const text=`Royal Commission into the Robodebt Scheme, Transcript Hearing Day 46 10 March 2023 (10 March 2023), transcript page P-4899 (PDF page 15), hearing turn by Ms Preston: "Income averaging did not make sense to me." transcript page P-4933 (PDF page 49), hearing turn by Mr Scott: "Do you agree that this approach described income averaging?" ${api.TRANSCRIPT_LABEL}. © Commonwealth of Australia, licensed under CC BY 4.0.`
const facts=()=>api.writingFacts(undefined,[{id:1,text,kind:'record',cite:{kind:'record',url:'https://robodebt.royalcommission.gov.au/transcript.pdf#page=15',label:text}}])
const input=()=>({question:'What did witnesses at the Robodebt Royal Commission say about income averaging?',period:{kind:'all',label:'All time'},facts:facts()})
function validRanges(payload){for(const [id,ranges]of Object.entries(payload.citations)){assert.ok(payload.sources.some(s=>id===s.resource||id.startsWith(s.resource+'/')));for(const [a,b]of ranges)assert.ok(a>=0&&b>a&&b<=Array.from(payload.answer).length)}}
test('transcript writing uses separate attributed turns, preserves licence in cards, and fallback is short cited prose',()=>{
  const f=facts();assert.equal(f.length,2);assert.equal(f[0].source.speaker,'Ms Preston');assert.equal(f[1].source.speaker,'Mr Scott')
  assert.equal(api.transcriptListingOnly(f),false,'attributed excerpt facts still reach the writer');assert.equal(f[0].transcript.day,'46');assert.equal(f[0].transcript.page,'P-4899')
  assert.doesNotMatch(f[0].text,/©|CC BY/);assert.match(f[0].source.snippet,/CC BY 4.0/)
  const out=api.proseFallback(input());assert.match(out.answer,/Ms Preston said on hearing day 46 \(10 March 2023\)/);assert.match(out.answer,/Mr Scott asked/)
  assert.match(out.answer,/evidence, not findings/);assert.doesNotMatch(out.answer,/©|CC BY|PDF page|OPAX lists|^-/m)
  validRanges(out)
  const grounded=api.groundAnswerPayload(out,input().question);assert.match(grounded.answer,/Ms Preston/);validRanges(grounded)
  assert.match(api.writingPrompt(input()),/question by counsel or a commissioner is a question/)
})
test('writer accepts a named, dated transcript summary; an unverified quotation stays as paraphrase',()=>{
  const raw={answer_decision:'answer',sentences:[{text:'Ms Preston said on hearing day 46 (10 March 2023) that “Income averaging did not make sense to me.”',facts:[1]}]}
  const out=api.verifyWrittenAnswer(raw,input());assert.ok(out);assert.match(out.answer,/Ms Preston/);validRanges(out)
  const bad=api.verifyWrittenAnswer({...raw,sentences:[{...raw.sentences[0],text:'Ms Preston said on hearing day 46 that “A fabricated quote.”'}]},input())
  const grounded=api.groundAnswerPayload(bad,input().question)
  assert.match(grounded.answer,/Ms Preston said on hearing day 46 that A fabricated quote/);assert.doesNotMatch(grounded.answer,/“A fabricated/)
})
test('suppression, non-publication and pseudonymous records never provide quote facts',()=>{
  for(const reason of ['suppression order','non-publication order','pseudonymous witness']){
    const restricted=text.replace('transcript page P-4899',`Not quoted: ${reason}. transcript page P-4899`)
    assert.deepEqual(api.transcriptTurns(restricted),[])
    const f=api.writingFacts(undefined,[{id:1,text:restricted,cite:{kind:'record',url:'https://example.gov.au/transcript.pdf',label:restricted}}])
    const out=api.proseFallback({...input(),facts:f});assert.equal(out.answer_decision,'limitation');assert.doesNotMatch(out.answer,/Income averaging did not|CC BY|©/);validRanges(out)
  }
})

test('legacy planner applies the same chamber/date scope to modern interests tools',()=>{
  const q='What gifts have senators declared this year?',c=constraints(q)
  const out=api.periodPlan({shape:'topic',steps:[{tool:'declared_interests',args:{chamber:'representatives',category:'gifts'}}]},c.period,{},c)
  assert.equal(out.steps[0].args.chamber,'senate');assert.equal(out.steps[0].args.since,'2026-01-01')
})
test('a transcript document id with an exact quote selects the record for writing, without accepting its unchecked claim',async()=>{
  const asset=async path=>JSON.parse(await readFile(new URL('../public'+path,import.meta.url),'utf8'))
  const deps={origin:'https://offline.test',asset,kb:async()=>{throw Error('No Hansard fallback for a transcript question')},generate:async()=>({text:'{}'})}
  const records=await api.callTool(deps,'royal_commissions',{view:'transcripts',commission:'robodebt',words:'income averaging',limit:1})
  const turn=api.transcriptTurns(records.citations[1].text)[0];assert.ok(turn)
  const reply=(toolName,args)=>({content:[{type:'tool-call',toolName,toolCallId:toolName,input:JSON.stringify(args)}],finishReason:{unified:'tool-calls',raw:'tool_calls'},usage:{inputTokens:{total:10,noCache:10,cacheRead:0,cacheWrite:0},outputTokens:{total:5,text:5,reasoning:0}},warnings:[]})
  const model=new MockLanguageModelV4({doGenerate:[reply('royal_commissions',{view:'transcripts',commission:'robodebt',words:'income averaging',limit:1}),reply('answer',{points:[{id:'transcript-document-key',quote:turn.excerpt,claim:'A fabricated finding that must never be accepted.'}]})]})
  const research=api.createResearch({model,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})},creditCooldown:api.createResearchCreditCooldown()})
  const out=await api.runAgentic(input().question,{...deps,research},async()=>{},40000,undefined,{},named)
  assert.equal(out.answered,true);assert.match(out.answer,/Ms Preston (?:said|asked) on hearing day 46/)
  assert.match(out.answer,/evidence, not findings/);assert.doesNotMatch(out.answer,/fabricated|CC BY|©|PDF page|OPAX lists/)
  validRanges(out.qualitative)
})

test('repeated final grounding of an unsplit transcript record never restores the tool block, and keeps the draft as paraphrase',()=>{
  const source={resource:'fact-1',slug:'',kind:'record',title:text,snippet:text,url:'https://robodebt.royalcommission.gov.au/transcript.pdf#page=15',href:'https://robodebt.royalcommission.gov.au/transcript.pdf#page=15',cited:true}
  const fallback=api.proseFallback({...input(),facts:[{id:1,text,source}]})
  assert.doesNotMatch(fallback.answer,/PDF page|CC BY|transcript page|©/)
  assert.match(fallback.answer,/Ms Preston said on hearing day 46/)
  validRanges(fallback)
  const draft='Invented Witness said “A fabricated quote.” on hearing day 99.'
  let out={answer:draft,answer_decision:'answer',citations:{'fact-1/t/body/0':[[0,Array.from(draft).length]]},sources:[source]}
  for(let i=0;i<3;i++)out=api.groundAnswerPayload(out,input().question)
  assert.doesNotMatch(out.answer,/PDF page|CC BY|transcript page|©|“/)
  assert.match(out.answer,/^Invented Witness said A fabricated quote/);validRanges(out)
})

test('Victorian ministerial gifts also filter chamber and register period before pagination',async()=>{
  const asset=async path=>JSON.parse(await readFile(new URL('../public'+path,import.meta.url),'utf8'))
  const deps={origin:'https://offline.test',asset}
  const scoped=await api.callTool(deps,'public_finances',{dataset:'vic_gifts',chamber:'vic_lc',since:'2026-01-01',until:'2026-12-31',limit:8})
  assert.equal(scoped.error,undefined);assert.ok(scoped.rows.length)
  assert.ok(scoped.rows.every(r=>r.chamber==='vic_lc'))
  assert.ok(scoped.rows.every(r=>r.register_id.startsWith('vic-gifts-2026-')))
  assert.ok(!JSON.stringify(scoped.rows).includes('Jacinta Allan'))
  const first=await api.callTool(deps,'public_finances',{dataset:'vic_gifts',chamber:'vic_lc',since:'2026-01-01',until:'2026-12-31',limit:1})
  assert.equal(first.total,scoped.total);assert.equal(first.rows[0].office_holder,scoped.rows[0].office_holder)
  const no=await api.callTool(deps,'public_finances',{dataset:'vic_gifts',chamber:'senate',since:'2026-01-01',until:'2026-12-31'})
  assert.deepEqual(no.rows,[]);assert.match(no.citations[0].text,/no matching rows for senate/)
  const c=constraints('What gifts have Victorian Legislative Council members declared this year?')
  const step=api.constrainStep({tool:'public_finances',args:{dataset:'vic_gifts',chamber:'vic_la'}},c,api.getAskTool('public_finances').inputSchema.properties)
  assert.equal(step.args.chamber,'vic_lc');assert.equal(step.args.since,'2026-01-01')
  const budget=api.constrainStep({tool:'public_finances',args:{dataset:'federal_budget'}},c,api.getAskTool('public_finances').inputSchema.properties)
  assert.equal(budget.args.chamber,undefined);assert.equal(budget.args.since,undefined)
})

test('evidence before a commission is scoped separately from parliamentary discussion about it',()=>{
  assert.equal(api.hearingEvidenceQuestion(input().question),true)
  assert.equal(api.hearingEvidenceQuestion('What did Bill Shorten say before the Robodebt Royal Commission?'),true)
  assert.equal(api.hearingEvidenceQuestion('What has Parliament said about the Robodebt Royal Commission?'),false)
  assert.equal(api.hearingEvidenceQuestion('How many hearing days were held at the Robodebt Royal Commission?'),false)
})
test('an unrelated speech selection cannot replace retrieved hearing evidence',async()=>{
  const asset=async path=>JSON.parse(await readFile(new URL('../public'+path,import.meta.url),'utf8'))
  const speech='Income averaging can reduce the tax paid by startup founders. This is a parliamentary tax debate.'
  const id='speech-999999/t/body/0-'+speech.length
  const reply=(toolName,args)=>({content:[{type:'tool-call',toolName,toolCallId:toolName,input:JSON.stringify(args)}],finishReason:{unified:'tool-calls',raw:'tool_calls'},usage:{inputTokens:{total:10,noCache:10,cacheRead:0,cacheWrite:0},outputTokens:{total:5,text:5,reasoning:0}},warnings:[]})
  const model=new MockLanguageModelV4({doGenerate:[
    reply('royal_commissions',{view:'transcripts',commission:'robodebt',words:'income averaging',limit:1}),
    reply('search',{query:'income averaging'}),
    reply('answer',{points:[{id,quote:speech,claim:'A parliamentary speaker said income averaging can reduce tax for startup founders.'}]}),
  ]})
  const research=api.createResearch({model,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})},creditCooldown:api.createResearchCreditCooldown(),readRecord:async()=>({text:speech,speaker:'Example Speaker',labels:{kind:'speech'},metadata:{date:'2026-06-15'}})})
  const out=await api.runAgentic(input().question,{origin:'https://offline.test',asset,research,generate:async()=>({text:'{}'}),kb:async()=>({resources:{'speech-999999':{slug:'speech-999999',title:'Example Speaker: income averaging tax debate',fields:{body:{paragraphs:{[id]:{text:speech}}}}}}})},async()=>{},40000,undefined,{},named)
  assert.equal(out.answered,true);assert.match(out.answer,/Ms Preston .*hearing day 46/)
  assert.doesNotMatch(out.answer,/startup|founders|tax paid|parliamentary speaker/)
  assert.ok(out.qualitative.sources.filter(s=>s.cited&&!s.coverage).every(s=>s.url.startsWith('https://robodebt.royalcommission.gov.au/')))
  validRanges(out.qualitative)
})
