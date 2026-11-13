import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {build} from 'esbuild'

const built=await build({stdin:{contents:"export {distinctSummary} from './src/research-writing';export {withAnswerLanguage} from './src/research-response';export {leadWithWho} from './src/research-who-lead';export {displayAnswerPayload} from './src/research-language'",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const saved=JSON.parse(readFileSync(new URL('./fixtures/ask-dedupe/02-robodebt-near-repeats.json',import.meta.url),'utf8'))
const question='Who was responsible for robodebt?'
const source=(resource,text)=>({resource,title:'Example royal commission report',snippet:text,url:'https://example.test/report',kind:'record',cited:true})
const payload=lines=>{
  let offset=0
  const sources=lines.map((text,i)=>source('fact-'+i,text))
  return {answer:lines.join('\n\n'),sources,citations:Object.fromEntries(lines.map((text,i)=>{const a=offset;offset+=Array.from(text).length+2;return ['fact-'+i,[[a,offset-2]]]}))}
}
const valid=out=>{
  for(const [id,ranges] of Object.entries(out.citations)){
    assert.ok(ranges.length,id)
    for(const [a,b] of ranges)assert.ok(a>=0&&b>a&&b<=Array.from(out.answer).length,`${id}: ${a}-${b}`)
    assert.ok(out.sources.some(s=>s.cited&&(id===s.resource||id.startsWith(s.resource+'/'))),id)
  }
}
const cited=(out,id)=>out.citations[id].map(([a,b])=>Array.from(out.answer).slice(a,b).join(''))
const offline=globalThis.fetch
globalThis.fetch=async()=>{throw Error('Near-repeat fixtures must stay offline')}
test.after(()=>{globalThis.fetch=offline})

test('saved 14 November robodebt answer: each finding once, all 13 citation ids and spans survive',()=>{
  const out=api.distinctSummary(saved)
  assert.equal(saved.answer.split('\n\n').length,11)
  assert.equal(out.answer.split('\n\n').length,7)
  assert.equal(Object.keys(out.citations).length,13)
  assert.deepEqual(Object.keys(out.citations).sort(),Object.keys(saved.citations).sort())
  assert.equal(Object.values(out.citations).flat().length,Object.values(saved.citations).flat().length)
  for(const phrase of ['costly failure of public administration','Letters Patent','Ombudsman was deliberately misled','approved by Cabinet'])assert.equal(out.answer.split(phrase).length-1,1,phrase)
  assert.doesNotMatch(out.answer,/\."\./)
  assert.match(out.answer,/Department of Social Services/,'the fuller wording survives')
  assert.match(out.answer,/using his report as a shield/,'the fuller Ombudsman finding survives')
  assert.deepEqual(cited(out,'fact-27/t/body/0'),['a costly failure of public administration'],'the quote citation supports only its shared finding')
  assert.equal(out.coverage,saved.coverage)
  valid(out)
  assert.deepEqual(api.distinctSummary(out),out,'normalisation is idempotent')
})

test('the public JSON and stream boundary both repair the saved who-answer offline',async()=>{
  const json=await api.withAnswerLanguage(Response.json(saved),question)
  const out=await json.json()
  assert.match(out.answer,/^Cabinet approved the scheme, which proceeded without the legislative change/)
  assert.match(out.answer.split('\n\n')[0],/Royal Commission into the Robodebt Scheme found it was a costly failure/)
  assert.equal(out.answer.split('\n\n').length,7)
  assert.equal(Object.keys(out.citations).length,13)
  assert.doesNotMatch(out.answer,/\."\./)
  assert.equal(out.coverage.note.includes('not findings of criminal or civil liability'),true)
  valid(out)
  const again=await (await api.withAnswerLanguage(Response.json(out),question)).json()
  assert.equal(again.answer,out.answer)
  assert.deepEqual(again.citations,out.citations)
  const stream=new Response('event: done\ndata: '+JSON.stringify(saved)+'\n\n',{headers:{'content-type':'text/event-stream'}})
  const raw=await (await api.withAnswerLanguage(stream,question)).text()
  const frame=JSON.parse(raw.split('\n').find(l=>l.startsWith('data: ')).slice(6))
  assert.equal(frame.answer,out.answer)
  assert.deepEqual(frame.citations,out.citations)
})

for(const ending of ['.".','.".".','.”.',".'."])test('a closing quote with its own full stop gets no extra stop: '+ending,()=>{
  const text='The report said "The scheme failed'+ending
  const out=api.displayAnswerPayload(payload([text]))
  assert.equal(out.answer,'The report said "The scheme failed'+ending.slice(0,2))
  valid(out)
})

test('short quote gives way to fuller narrative in either order and keeps its citation on the shared claim',()=>{
  const narrative='The commission found the scheme was a costly failure of public administration and that Cabinet approved it without legislative authority.'
  const quote='The commission described it as "a costly failure of public administration, in both human and economic terms.".'
  for(const lines of [[narrative,quote],[quote,narrative]]){
    const out=api.distinctSummary(payload(lines))
    assert.equal(out.answer,narrative)
    assert.equal(Object.keys(out.citations).length,2)
    assert.deepEqual(cited(out,'fact-'+lines.indexOf(quote)),['a costly failure of public administration'])
    valid(out)
  }
})

const base='The Example Commission found that Minister Rowan Ellery approved 17 recovery claims on 18 August 2022 without legislative authority.'
for(const changed of [base.replace('17','19'),base.replace('August','July'),base.replace('Rowan Ellery','Avery Quinlan'),base.replace('Rowan Ellery','Rowan Ellery and Avery Quinlan'),base.replace('approved','did not approve')])test('a changed number, date, person or qualification survives: '+changed,()=>{
  assert.equal(api.distinctSummary(payload([base,changed])).answer,[base,changed].join('\n\n'))
})

test('named subjects in a cited source lead even when the writer omitted them; each name cites that source',()=>{
  const answer='The royal commission found the recovery scheme was unlawful.'
  const finding="The royal commission's report made findings about the conduct of former ministers Rowan Ellery and Avery Quinlan in the recovery scheme."
  const p=payload([answer]);p.sources[0].snippet=answer+' '+finding
  const out=api.leadWithWho(p,'Who was responsible for the recovery scheme?')
  assert.equal(out.answer.split('\n\n')[0],finding)
  assert.match(cited(out,'fact-0')[0],/Rowan Ellery and Avery Quinlan/)
  assert.doesNotMatch(out.answer,/liable|guilty/)
  valid(out)
  assert.deepEqual(api.leadWithWho(out,'Who was responsible for the recovery scheme?'),out)
})

test('a named finding later in the answer moves first with every citation, including Unicode offsets',()=>{
  const lines=['The 🏠 commission reported in 2023.',"The royal commission's report made findings about the conduct of former ministers Rowan Ellery and Avery Quinlan."]
  const p=payload(lines),out=api.leadWithWho(p,'Who was responsible for the recovery scheme?')
  assert.equal(out.answer,[lines[1],lines[0]].join('\n\n'))
  for(const id of Object.keys(p.citations))assert.deepEqual(cited(out,id),cited(p,id))
  valid(out)
})

test('a commissioner and reporting speaker are not named as responsible; no subjects is stated plainly',()=>{
  const lines=['The commission, chaired by Morgan Sample, found the scheme unlawful.','Rowan Ellery told the House the report was released.']
  const p=payload(lines);p.sources[1].kind='speech';p.sources[1].speaker='Rowan Ellery'
  const out=api.leadWithWho(p,'Who was responsible for the recovery scheme?')
  assert.match(out.answer,/^The cited sources do not name a person or office as responsible\./)
  assert.equal(out.answer.split('\n\n')[1],lines[0])
  valid(out)
})

test('a surname added to a near-repeat changes who the finding is about',()=>{
  const text='The commission found that officials ignored repeated legal warnings from senior departmental advisers during development of the recovery scheme.'
  const named=text.replace('officials ignored','Ellery and officials ignored')
  for(const lines of [[text,named],[named,text]])assert.equal(api.distinctSummary(payload(lines)).answer,lines.join('\n\n'))
})

test('exact containment cannot bypass the changed-person guard',()=>{
  const text='The commission found the recovery scheme ignored repeated legal warnings.'
  const named='Avery Quinlan said: '+text
  for(const lines of [[text,named],[named,text]])assert.equal(api.distinctSummary(payload(lines)).answer,lines.join('\n\n'))
})

test('reordering people cannot reassign unchanged figures during deduplication',()=>{
  const text='The Example Commission found Avery Sample approved 17 claims while Blake Example approved 19 claims.'
  const reassigned='The Example Commission found Blake Example approved 17 claims while Avery Sample approved 19 claims.'
  for(const lines of [[text,reassigned],[reassigned,text]])assert.equal(api.distinctSummary(payload(lines)).answer,lines.join('\n\n'))
})

test('a person mentioned as cleared never displaces the commission finding about Cabinet',()=>{
  const own='The royal commission found that Cabinet approved the recovery scheme without legislative authority.'
  const cleared='Rowan Ellery said the integrity commission cleared former minister Avery Quinlan of corrupt conduct.'
  const out=api.leadWithWho(payload([own,cleared]),'Who was responsible for the recovery scheme?')
  assert.equal(out.answer.split('\n\n')[0],own)
})

test('a recovered speech finding retains its speaker, chamber and date, without inferring liability',()=>{
  const p=payload(['The commission found the recovery scheme was unlawful.'])
  const finding="The report made findings about the conduct of former ministers Rowan Ellery and Avery Quinlan."
  Object.assign(p.sources[0],{kind:'speech',speaker:'Morgan Sample',chamber:'senate',date:'2023-07-10',snippet:finding})
  const out=api.leadWithWho(p,'Who was responsible for the recovery scheme?')
  assert.equal(out.answer.split('\n\n')[0],"Morgan Sample told the Senate on 10 July 2023 that the report made findings about the conduct of former ministers Rowan Ellery and Avery Quinlan.")
  assert.match(cited(out,'fact-0')[0],/Morgan Sample told the Senate/)
  valid(out)
})

test('two official sources paraphrasing the same finding keep both citations on the fuller wording',()=>{
  const lines=['The commission concluded the Ombudsman was deliberately misled, giving the government further opportunity to resist scrutiny.','In its report, the commission concluded that the Ombudsman was deliberately misled, which gave the government further opportunity to resist scrutiny by using his report as a shield.']
  const p=payload(lines);p.sources[1].url='https://example.test/other-report'
  const out=api.distinctSummary(p)
  assert.equal(out.answer,lines[1]);assert.equal(Object.keys(out.citations).length,2);valid(out)
})

test('with no cited sources the who-answer states that no subjects are identified',()=>{
  const out=api.leadWithWho({answer:'The scheme was unlawful.',sources:[],citations:{}},'Who approved the recovery scheme?')
  assert.match(out.answer,/^The cited sources do not name a person or office as responsible\./)
})

test('every named subject in the lead needs support from its cited finding',()=>{
  const p=payload(["The report made findings about the conduct of former ministers Rowan Ellery and Avery Quinlan."])
  p.sources[0].snippet='The report made findings about the conduct of former minister Rowan Ellery.'
  const out=api.leadWithWho(p,'Who was responsible for the recovery scheme?')
  assert.equal(out.answer.split('\n\n')[0],p.sources[0].snippet)
  assert.doesNotMatch(out.answer.split('\n\n')[0],/Avery Quinlan/)
  valid(out)
})

for(const finding of ["The report made findings about the conduct of former Ministers Rowan Ellery and Avery Quinlan.",'The commission found Rowan Ellery ignored warnings about the recovery scheme.'])test('source role capitalisation and a named finding subject remain supported: '+finding,()=>{
  const p=payload(['The commission found the recovery scheme was unlawful.'])
  p.sources[0].snippet=finding
  const out=api.leadWithWho(p,'Who was responsible for the recovery scheme?')
  assert.equal(out.answer.split('\n\n')[0],finding)
  assert.equal(cited(out,'fact-0')[0],finding)
  valid(out)
})
