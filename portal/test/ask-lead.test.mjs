// Ask answers lead with the model's answer, not the record's preamble (13 Nov 2026). Stored payloads from local evals
// (fixtures/ask-lead-payloads.json), recomposed as the writer hands them over: record prose first, then the model's
// points. No model calls.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {build} from 'esbuild'

const built=await build({stdin:{contents:"export {leadWithModelAnswer,restatesOpening} from './src/research-answer-shape';export {sentenceParts} from './src/research-claim-audit.mjs'",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const stored=JSON.parse(readFileSync(new URL('./fixtures/ask-lead-payloads.json',import.meta.url),'utf8'))

// Lines of a stored answer with their citations, in code points.
const linesOf=payload=>{
  const out=[]
  for(const m of payload.answer.matchAll(/[^\n]+/g)){
    const a=Array.from(payload.answer.slice(0,m.index)).length,b=a+Array.from(m[0]).length
    const cites=Object.entries(payload.citations).flatMap(([id,ranges])=>ranges.filter(([x,y])=>x<b&&y>a).map(([x,y])=>[id,[x-a,y-a]]))
    out.push({text:m[0],cites})
  }
  return out
}
const join=lines=>{
  let answer='';const citations={}
  for(const line of lines){if(answer)answer+='\n\n';const offset=Array.from(answer).length;answer+=line.text;for(const [id,[a,b]] of line.cites)(citations[id]??=[]).push([offset+a,offset+b])}
  return {answer,citations}
}
// The composition before leading: the record writer's lines, then the model's points in the model's order.
const recompose=(id,pointLines)=>{
  const fixture=stored[id],lines=linesOf(fixture),points=pointLines.map(i=>lines[i]),record=lines.filter((_,i)=>!pointLines.includes(i))
  const composed=join([...record,...points]),own=join(points)
  return {question:fixture.question,payload:{...composed,sources:fixture.sources},points:{answer:own.answer.replace(/\n\n/g,'\n'),citations:{}}}
}
const sentences=answer=>api.sentenceParts(answer).map(p=>p.text)
const cited=(out,id)=>out.citations[id].map(([a,b])=>Array.from(out.answer).slice(a,b).join(''))

test('robodebt: the first sentence names a person the Commission made findings about; its dates appear once',()=>{
  // Line 0 is the model's uncited Royal Commission point; lines 4 to 8 are its cited speech points.
  const {question,payload,points}=recompose('event-01',[0,4,5,6,7,8])
  const out=api.leadWithModelAnswer(payload,points,question)
  const [first]=sentences(out.answer)
  assert.match(first,/Scott Morrison|Alan Tudge|Stuart Robert/,first)
  for(const date of ['18 August 2022','7 July 2023'])assert.equal(out.answer.split(date).length-1,1,date)
  assert.equal(out.answer.split('Catherine Holmes').length-1,1,'the commissioner is named once')
  // The finding on Tudge and Robert continues the Shorten line it depends on.
  assert.match(out.answer,/^Bill Shorten told the House[^\n]+\n\nThe same speech records/)
  // The Commission's details follow as context, before the other speakers.
  const at=s=>out.answer.indexOf(s)
  assert.ok(at('The same speech')<at('The Royal Commission into the Robodebt Scheme, established')&&at('The Royal Commission into the Robodebt Scheme, established')<at('Kate Thwaites'))
  // Citations move with their text.
  assert.match(cited(out,'speech-1551678/t/body/0-2979')[0],/^Bill Shorten told the House on 1 August 2023/)
  assert.match(cited(out,'fact-3/t/body/0')[0],/^The Royal Commission into the Robodebt Scheme, established by Letters Patent/)
  assert.match(cited(out,'speech-1553201/t/body/0-646')[0],/^Kate Thwaites told the House/)
})

test('identity: the opening does not restate who the person is; the record figures stay cited',()=>{
  const {question,payload,points}=recompose('identity-05',[0,8])
  const out=api.leadWithModelAnswer(payload,points,question)
  const [first,second]=sentences(out.answer)
  assert.match(first,/^Jacinta Allan is the Victorian Premier and member for Bendigo East/)
  assert.equal(api.restatesOpening(first,second),false,second)
  assert.doesNotMatch(second,/^Jacinta Allan is\b/)
  assert.match(second,/Labor/,'what the record sentence adds is kept')
  assert.match(cited(out,'fact-3/t/body/0')[0],/691 speeches/)
  assert.match(cited(out,'speech-857828/t/body/15-499')[0],/^Jacinta Allan is the Victorian Premier/)
})

test('restatement is read only from the subject and its description',()=>{
  assert.equal(api.restatesOpening('Jacinta Allan is the Victorian Premier.','Jacinta Allan is a Victorian Labor politician who represents Bendigo East.'),true)
  assert.equal(api.restatesOpening('Jacinta Allan is the Victorian Premier.','Jacinta Allan told the House about treaty.'),false)
  assert.equal(api.restatesOpening('Jacinta Allan is the Victorian Premier.','Tim Pallas is the Treasurer.'),false)
})

test('without an inquiry in the record, the model’s first point leads whatever it names',()=>{
  const record='- Example Holdings Pty Ltd was paid $2,000,000 for the land in 2018.'
  const points='- Pat Example told the House the purchase was approved by a deputy secretary.\n- Sam Sample told the Senate the price was ten times the land\'s value.'
  const answer=record+'\n'+points
  const out=api.leadWithModelAnswer({answer,citations:{'fact-1/t/body/0':[[2,Array.from(record).length]]}},{answer:points,citations:{}},'Who was responsible for the land purchase?')
  assert.match(out.answer,/^- Pat Example told the House/)
})

test('a money question keeps its calculated lead',()=>{
  const record='Example Holdings Pty Ltd gave the most to the Labor Party, $1,250,000 across 2022-23 and 2023-24.\n- Sample Group gave $640,000.'
  const point='Taylor Example told the House on 3 May 2024 that donations from developers should be capped.'
  const answer=record+'\n'+point,shift=Array.from(record).length+1
  const payload={answer,citations:{'fact-1/t/body/0':[[0,Array.from(record).length]],'speech-7/t/body/0':[[shift,shift+Array.from(point).length]]},sources:[]}
  const out=api.leadWithModelAnswer(payload,{answer:point,citations:{}},'Who gave the most money to the Labor Party?')
  assert.equal(out,payload)
  assert.match(out.answer,/^Example Holdings Pty Ltd gave the most/)
  const count=api.leadWithModelAnswer(payload,{answer:point,citations:{}},'How many speeches mentioned donations?')
  assert.equal(count.answer,answer)
})

test('a what question still leads with the model’s first point, then the record prose, then its other points',()=>{
  const record='- The review reported on 30 November 2021 with 28 recommendations.'
  const points='- The review found one in three staff had been sexually harassed.\n- Pat Example said the recommendations should all be adopted.'
  const answer=record+'\n'+points,shift=Array.from(record).length+1
  const out=api.leadWithModelAnswer({answer,citations:{'fact-1/t/body/0':[[2,Array.from(record).length]],'speech-2/t/body/0':[[shift+68,shift+Array.from(points).length]]}},{answer:points,citations:{}},'What did the 2021 Parliament House workplace review find?')
  assert.equal(out.answer,'- The review found one in three staff had been sexually harassed.\n\n- The review reported on 30 November 2021 with 28 recommendations.\n\n- Pat Example said the recommendations should all be adopted.')
  assert.match(cited(out,'speech-2/t/body/0')[0],/^Pat Example said/)
})

test('robodebt, second run: the model point reporting the Royal Commission leads, not another body clearing someone; the restated inquiry goes',()=>{
  // As composed: the writer's record prose (with one passage line inside it), then the model's points.
  const fixture=stored['event-01-run2'],lines=linesOf(fixture)
  const payload={...join(lines),sources:fixture.sources},points={answer:lines.slice(4).map(l=>l.text).join('\n'),citations:{}}
  const out=api.leadWithModelAnswer(payload,points,fixture.question)
  const [first]=sentences(out.answer)
  assert.match(first,/^Mark Dreyfus told the House on 10 October 2024 that the royal commission concluded the former Liberal government's scheme/,first)
  assert.doesNotMatch(first,/National Anti-Corruption Commission|cleared/)
  for(const date of ['18 August 2022','7 July 2023'])assert.equal(out.answer.split(date).length-1,1,date)
  assert.doesNotMatch(out.answer,/was the inquiry that established responsibility/)
  assert.match(out.answer,/Zali Steggall told the House/,'the other body\'s finding stays, after the answer')
  assert.match(cited(out,'fact-22/t/body/0')[0],/^The Royal Commission into the Robodebt Scheme was established by Letters Patent/)
  assert.match(cited(out,'speech-1594111/t/body/0-648')[0],/^Mark Dreyfus told the House/)
})

test('robodebt, third run: "The commission was established …" restates the record opening; a Royal Commission point leads',()=>{
  // Line 0 is the model's uncited point; lines 1 to 6 are the writer's record prose; lines 7 to 12 are the model's points.
  const {question,payload,points}=recompose('event-01-run3',[0,7,8,9,10,11,12])
  const out=api.leadWithModelAnswer(payload,points,question)
  const [first]=sentences(out.answer)
  assert.match(first,/^The royal commission described robodebt as a crude and cruel mechanism/,first)
  assert.doesNotMatch(first,/National Anti-Corruption Commission|NACC|cleared/)
  for(const date of ['18 August 2022','7 July 2023'])assert.equal(out.answer.split(date).length-1,1,date)
  assert.doesNotMatch(out.answer,/^The commission was established/m)
  assert.match(cited(out,'fact-4/t/body/0')[0],/^The Royal Commission into the Robodebt Scheme was established/)
})

test('an inquiry opening is recognised by name or as "the commission"; a finding it reports is not a restatement',()=>{
  const record='The Royal Commission into the Example Scheme was established on 1 March 2022.'
  const points='The commission was established by Letters Patent on 1 March 2022.\nTaylor Example told the House the Example Integrity Commission cleared the minister.\nThe royal commission found the scheme unlawful.'
  const answer=record+'\n'+points
  const out=api.leadWithModelAnswer({answer,citations:{'fact-1/t/body/0':[[0,Array.from(record).length]]}},{answer:points,citations:{}},'Who was responsible for the Example Scheme?')
  assert.equal(out.answer,'The royal commission found the scheme unlawful.\n\nThe Royal Commission into the Example Scheme was established on 1 March 2022.\n\nTaylor Example told the House the Example Integrity Commission cleared the minister.')
})
