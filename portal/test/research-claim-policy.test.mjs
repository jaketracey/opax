import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {build} from 'esbuild'

const built=await build({stdin:{contents:"export * from './src/research-grounding';export * from './src/research-claim-policy';export * from './src/research-response';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'node',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const source=(resource,speaker,snippet,extra={})=>({resource,speaker,snippet,kind:'speech',date:'2022-09-27',title:speaker+' on housing',cited:true,...extra})
const a=source('a','Avery Example','Housing affordability needs more homes and lower rents.'),b=source('b','Blake Sample','I oppose the housing bill. I disagree. No. The housing bill should be rejected.')
const payload=(answer,sources=[a])=>({answer,answer_decision:'answer',sources,citations:Object.fromEntries(sources.map(s=>[s.resource+'/t/body/0',[[0,Array.from(answer).length]]]))})
const question='What has Avery Example said about housing?'

for(const answer of ['Avery Example said “I oppose the housing bill”.','Avery Example said I oppose the housing bill.','Avery Example opposed the housing bill.','Avery Example said “I disagree”.','Avery Example said “No”.','Avery Example reported that the housing bill should be rejected.'])for(const stream of [false,true])test('another selected speaker owns these words: '+answer+' stream='+stream,async()=>{
  const input=payload(answer,[a,b]),response=stream?new Response('event: done\ndata: '+JSON.stringify(input)+'\n\n',{headers:{'content-type':'text/event-stream','x-opax-cache':'HIT'}}):Response.json(input)
  const wire=await(await api.withAnswerLanguage(response,question)).text(),out=stream?JSON.parse(wire.match(/^data: (.+)$/m)[1]):JSON.parse(wire)
  assert.doesNotMatch(out.answer,/Avery Example (?:said (?:“)?(?:I oppose|I disagree|No)|opposed the housing bill|reported that)/)
  assert.match(out.answer,/Avery Example said “Housing affordability/)
})

test('words recorded by both speakers are not assigned exclusively to the other speaker',()=>{
  const answer='Avery Example said “I oppose the housing bill”.',out=api.groundAnswerPayload(payload(answer,[{...a,snippet:b.snippet},b]),question)
  assert.equal(out.answer,answer)
})

test('an AUD amount belongs to its donor and recipient together',()=>{
  const sources=[source('receipt',undefined,'Acme Holdings gave Liberal $500,000.',{kind:'export',title:'Disclosed receipts',receipt:{source:'Acme Holdings',party:'Liberal',amount:500000,period:'2022-23'}})]
  const out=api.groundAnswerPayload(payload('Acme Holdings gave Labor $500,000.',sources),'Who received money from Acme Holdings?')
  assert.doesNotMatch(out.answer,/Acme Holdings gave Labor/)
  assert.match(out.answer,/Liberal/);assert.match(out.answer,/\$500,000/)
})

test('an AUD transfer cannot substitute another person who also has selected records',()=>{
  const receipt=source('receipt',undefined,'Acme Holdings gave Blake Sample $500,000.',{kind:'export',receipt:{source:'Acme Holdings',party:'Blake Sample',amount:500000,period:'2022-23'}})
  const out=api.groundAnswerPayload(payload('Acme Holdings gave Avery Example $500,000.',[receipt,a,b]),'Who received money from Acme Holdings?')
  assert.doesNotMatch(out.answer,/gave Avery Example/);assert.match(out.answer,/Blake Sample/);assert.match(out.answer,/\$500,000/)
  const supported=api.groundAnswerPayload(payload('Acme Holdings gave Blake Sample $500,000.',[receipt,a,b]),'Who received money from Acme Holdings?')
  assert.match(supported.answer,/Blake Sample/);assert.match(supported.answer,/\$500,000/)
})

for(const name of ['Jordan Privateperson','Bill Privateperson','Jordan May'])test('an unknown private person is removed without erasing the supported neighbouring point: '+name,()=>{
  const out=api.groundAnswerPayload(payload(name+', a local nurse, donated to Avery Example.\nAvery Example said housing needs more homes.'),question)
  assert.ok(!out.answer.includes(name));assert.doesNotMatch(out.answer,/local nurse/);assert.match(out.answer,/housing needs more homes/)
})

test('quotation marks do not bypass the unknown private-person guard',()=>{
  const out=api.groundAnswerPayload(payload('Avery Example said “Jordan Privateperson, a local nurse, donated to my campaign”.'),question)
  assert.doesNotMatch(out.answer,/Jordan Privateperson|local nurse/);assert.match(out.answer,/Housing affordability needs more homes/)
})

for(const answer of ['Housing policy concerns Pauline Hanson.','The Example Housing Authority needs reform.','Acme Holdings called for housing reform.','Example Industries needs reform.','One Nation needs reform.'])test('roster members and organisations remain soft: '+answer,()=>{
  const out=api.groundAnswerPayload(payload(answer),question)
  assert.equal(out.answer,answer);assert.equal(out.answer_status,'uncited')
})

for(const verb of ['supports','opposes','announced','confirmed','would cut','blames','spoke about'])test('a roster member still needs their own record for an attributed position: '+verb,()=>{
  const out=api.groundAnswerPayload(payload('Pauline Hanson '+verb+' housing reforms.'),question)
  assert.doesNotMatch(out.answer,/Pauline Hanson/);assert.match(out.answer,/Housing affordability needs more homes/)
})

test('a roster member cannot own a colon-led quotation without their own record',()=>{
  const out=api.groundAnswerPayload(payload('Pauline Hanson: “Housing affordability needs more homes and lower rents.”'),question)
  assert.doesNotMatch(out.answer,/Pauline Hanson/);assert.match(out.answer,/Avery Example said/)
})

test('a public person mentioned in a source can remain as an identity',()=>{
  const answer='Jordan Publicname attended the debate.',out=api.groundAnswerPayload(payload(answer,[{...a,snippet:a.snippet+' Jordan Publicname attended the debate.'}]),question)
  assert.equal(out.answer,answer)
})

for(const [answer,expected]of [
  ['By 27 September 2021 she said housing needs more homes.','By 27 September 2021 she said housing needs more homes.'],
  ['In June 2021, Avery Example said housing needs more homes.','Avery Example said housing needs more homes.'],
  ['On 4 May 2020 and again on 7 June 2021, Avery Example said housing needs more homes.','Avery Example said housing needs more homes.'],
  ['As of June 2021, Avery Example said housing needs more homes.','Avery Example said housing needs more homes.'],
  ['After June 2021 she said housing needs more homes.','After June 2021 she said housing needs more homes.'],
  ['Before June 2021, Avery Example said housing needs more homes.','Avery Example said housing needs more homes.'],
  ['- - On 4 May 2025 she said housing needs more homes.','- On 4 May 2025 she said housing needs more homes.'],
])test('whole date phrase or original uncited sentence: '+answer,()=>{
  const out=api.groundAnswerPayload(payload(answer),question)
  assert.equal(out.answer,expected);assert.equal(out.answer_status,'uncited');assert.deepEqual(out.citations,{})
})

test('the stored Q02 trace retains the two points previously lost after partial date repair',()=>{
  const {question,payload}=JSON.parse(readFileSync(new URL('./fixtures/research-q02-date.json',import.meta.url),'utf8'))
  const out=api.groundAnswerPayload(payload,question)
  assert.match(out.answer,/After recognition, in December 2025 she described statehood as an objective/)
  assert.match(out.answer,/By October 2026 she said the Palestinian people want a state/)
  assert.match(out.answer,/By 1 July 2024 she described recognition/)
  assert.doesNotMatch(out.answer,/By she|In June[,.]|and again[,.]/)
})

test('Q02 no-passage limitation preserves the complete question and cites at most three closest records',()=>{
  const question="How has Penny Wong's position on recognising a Palestinian state changed over time?"
  const sources=Array.from({length:4},(_,i)=>source('s'+i,'Penny Wong','Thank you to everyone who attended.',{title:'Committee proceedings'}))
  const out=api.groundAnswerPayload({...payload('',sources),answer_scope:{people:['Penny Wong']}},question)
  assert.match(out.answer,/do not directly answer/);assert.ok(out.answer.includes(question.slice(0,-1)))
  assert.match(out.answer,/The closest are/);assert.match(out.answer,/27 September 2022/)
  assert.equal(out.sources.length,3);assert.equal(Object.keys(out.citations).length,3)
})

test('uncited quotations retain first-person text and its quotation marks',()=>{
  const answer='Avery Example said “On this side of the chamber, we have adopted a housing plan”.'
  const out=api.groundAnswerPayload(payload(answer),question)
  assert.equal(out.answer,answer);assert.deepEqual(out.citations,{})
})

test('an orphaned record byline is a fragment rather than a surviving position',()=>{
  const out=api.groundAnswerPayload(payload('Going by her record, Avery Example (Example Network.'),question)
  assert.doesNotMatch(out.answer,/Going by her record|Example Network/);assert.match(out.answer,/Housing affordability needs more homes/)
})

test('donations leading senators to vote is hard unless attributed',()=>{
  const text='Donations led Liberal senators to vote against the housing bill.'
  const out=api.groundAnswerPayload(payload(text),question)
  assert.doesNotMatch(out.answer,/Donations led Liberal senators/)
  const attributed='Avery Example said donations led Liberal senators to vote against the housing bill.'
  assert.equal(api.groundAnswerPayload(payload(attributed),question).answer,attributed)
})
