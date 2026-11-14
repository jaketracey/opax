import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {build} from 'esbuild'
import {createHash} from 'node:crypto'

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

for(const ending of ['.".','."."','.".".','.”.',".'."])test('a closing quote with its own full stop gets no extra stop: '+ending,()=>{
  const opening=ending[1]==='”'?'“':ending[1]
  const text='The report said '+opening+'The scheme failed'+ending
  const out=api.displayAnswerPayload(payload([text]))
  assert.equal(out.answer,'The report said '+opening+'The scheme failed'+ending.slice(0,2))
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

for(const [first,second] of [
  ['The Department of Human Services deliberately misled the Ombudsman about the recovery scheme and its legal authority.','The Ombudsman deliberately misled the Department of Human Services about the recovery scheme and its legal authority.'],
  ['The minister told the secretary about repeated legal warnings during development of the recovery scheme.','The secretary told the minister about repeated legal warnings during development of the recovery scheme.'],
  ['The commission found the minister ignored the secretary during development of the recovery scheme.','The commission found the secretary ignored the minister during development of the recovery scheme.'],
  ['The minister and secretary attended the meeting, where the minister told the secretary about repeated legal warnings.','The minister and secretary attended the meeting, where the secretary told the minister about repeated legal warnings.']
])test('reversed actors retain separate claims and their own citations: '+first,()=>{
  for(const lines of [[first,second],[second,first]]){
    const p=payload(lines),out=api.distinctSummary(p)
    assert.equal(out.answer,p.answer)
    for(const id of Object.keys(p.citations))assert.deepEqual(cited(out,id),cited(p,id))
    valid(out)
  }
})

for(const cleared of [
  'The commission made no adverse findings against Minister Avery Quinlan.',
  'The commission found Minister Avery Quinlan was not responsible for the recovery scheme.',
  'The commission found Ministers Avery Quinlan and Rowan Ellery were not responsible for the recovery scheme.',
  'The commission found Minister Avery Quinlan no longer responsible for the recovery scheme.',
  'The commission did not make findings against Minister Avery Quinlan.'
])test('a negative finding never becomes the who-lead: '+cleared,()=>{
  const own='The royal commission found that Cabinet approved the recovery scheme without legislative authority.'
  for(const lines of [[own,cleared],[cleared,own]]){
    const out=api.leadWithWho(payload(lines),question)
    assert.equal(out.answer.split('\n\n')[0],own)
    valid(out)
  }
  // Recovery from a source sentence must apply the same exclusion as moving answer text.
  const p=payload(['The commission reported on the recovery scheme.']);p.sources[0].snippet=cleared
  const out=api.leadWithWho(p,question)
  assert.match(out.answer,/^The cited sources do not name a person or office as responsible\./)
})

test('a contained finding transfers its citation only to the shared words, excluding the added person',()=>{
  const shorter='The minister ignored repeated legal warnings about the recovery scheme.'
  const fuller=shorter.slice(0,-1)+'; Avery Quinlan confirmed the timetable.'
  const p=payload([fuller,shorter]),out=api.distinctSummary(p)
  assert.equal(out.answer,fuller)
  assert.deepEqual(cited(out,'fact-1'),[shorter.slice(4,-1)])
  assert.doesNotMatch(cited(out,'fact-1').join(' '),/Avery Quinlan/)
  assert.deepEqual(cited(out,'fact-0'),[fuller]);valid(out)
})

test('the no-named-subject lead is uncited and leaves each source on its recorded claim',()=>{
  const p=payload(['The commission reported on the recovery scheme.','The report was released in July.'])
  const out=api.leadWithWho(p,question)
  assert.match(out.answer,/^The cited sources do not name a person or office as responsible\./)
  for(const id of Object.keys(p.citations))assert.deepEqual(cited(out,id),cited(p,id))
  assert.ok(Object.values(out.citations).flat().every(([a])=>a>out.answer.indexOf('\n\n')))
  valid(out)
})

test('a recovered speech finding removes trailing member attribution before its speaker wrapper',()=>{
  const p=payload(['The commission reported on the recovery scheme.'])
  Object.assign(p.sources[0],{kind:'speech',speaker:'Morgan Sample',chamber:'senate',date:'2023-07-10',snippet:'The report made findings about the conduct of former minister Avery Quinlan, the member said.'})
  const out=api.leadWithWho(p,question)
  assert.equal(out.answer.split('\n\n')[0],'Morgan Sample told the Senate on 10 July 2023 that the report made findings about the conduct of former minister Avery Quinlan.')
  assert.doesNotMatch(out.answer,/the member said/);valid(out)
})

const live182=JSON.parse(readFileSync(new URL('./fixtures/ask-dedupe/03-robodebt-live-182.json',import.meta.url),'utf8'))
test('row 182 replay merges appositional investigation clauses while retaining both dated tails and every citation',()=>{
  const out=api.distinctSummary(live182)
  assert.equal((out.answer.match(/Catherine Holmes AC SC/g)??[]).length,1)
  assert.doesNotMatch(out.answer,/examined who was responsible for the scheme;/)
  assert.match(out.answer,/whose Royal Commissioner was Catherine Holmes AC SC, investigated who was responsible for robodebt and delivered its final report on 7 July 2023/)
  assert.match(out.answer,/Kate Thwaites told the House of Representatives on 7 August 2023/)
  assert.match(out.answer,/'the establishment of the scheme and who was responsible for it'/)
  assert.deepEqual(Object.keys(out.citations),Object.keys(live182.citations))
  assert.deepEqual(out.sources,live182.sources)
  const speech='speech-1553201/t/body/0-646',record='fact-14/t/body/0'
  assert.ok(out.citations[speech].some(([a,b])=>out.citations[record].some(([x,y])=>a<y&&b>x)),'the merged clause keeps the union of its sources')
  assert.ok(cited(out,speech).some(s=>/^(?:The )?Royal Commission into the Robodebt Scheme$/.test(s)),'the speech citation stays on words its source holds')
  valid(out);assert.deepEqual(api.distinctSummary(out),out)
})

test('row 182 keeps its record finding first and retains the source-backed Morrison finding with attribution',()=>{
  assert.ok(live182.research.trail.some(t=>t.round===7&&t.tool==='corpus_records'&&t.arg==='speech-1551171'))
  assert.ok(live182.research.trail.some(t=>t.round===8&&t.tool==='answer'))
  const out=api.leadWithWho(live182,question),finding=live182.answer.split('\n\n')[6]
  assert.equal(out.answer.split('\n\n')[0],live182.answer.split('\n\n')[0])
  assert.ok(out.answer.includes(finding))
  assert.match(finding,/^Bill Shorten told the House on 31 July 2023.*Scott Morrison.*allowed Cabinet to be misled.*ministerial responsibility/)
  for(const id of Object.keys(live182.citations))assert.deepEqual(cited(out,id),cited(live182,id))
  valid(out)
})

test('row 182 repairs reach JSON and SSE without emptying, blocking or losing a source',async()=>{
  const out=await(await api.withAnswerLanguage(Response.json(live182),question)).json()
  assert.equal(out.answer.split('\n\n')[0],live182.answer.split('\n\n')[0])
  assert.match(out.answer,/Scott Morrison.*allowed Cabinet to be misled/)
  assert.equal((out.answer.match(/Catherine Holmes AC SC/g)??[]).length,1)
  assert.equal(out.answer_decision,'answer')
  assert.deepEqual(out.sources,live182.sources)
  assert.deepEqual(Object.keys(out.citations),Object.keys(live182.citations));valid(out)
  const stream=new Response('event: done\ndata: '+JSON.stringify(live182)+'\n\n',{headers:{'content-type':'text/event-stream'}})
  const raw=await(await api.withAnswerLanguage(stream,question)).text()
  const frame=JSON.parse(raw.split('\n').find(l=>l.startsWith('data: ')).slice(6))
  assert.equal(frame.answer,out.answer);assert.deepEqual(frame.citations,out.citations)
  const again=await(await api.withAnswerLanguage(Response.json(out),question)).json()
  assert.equal(again.answer,out.answer);assert.deepEqual(again.citations,out.citations)
})

test('a parenthetical person needs support from the cited finding before moving first',()=>{
  const p=structuredClone(live182),s=p.sources.find(s=>s.resource==='speech-1551171')
  s.snippet=s.snippet.replaceAll('Mr Morrison','Mr Howard')
  const out=api.leadWithWho(p,question)
  assert.doesNotMatch(out.answer.split('\n\n')[0],/Scott Morrison/)
  assert.equal(out.answer_decision,'answer');assert.ok(out.answer.includes(p.answer.split('\n\n')[6]))
})

for(const reverse of [false,true])test('shared investigation clauses preserve independent and inherited-subject tails in either order: '+reverse,()=>{
  const first=live182.answer.split('\n\n')[2],second=live182.answer.split('\n\n')[3]
  const lines=reverse?[second,first]:[first,second],p=payload(lines),out=api.distinctSummary(p)
  assert.equal((out.answer.match(/Catherine Holmes AC SC/g)??[]).length,1)
  assert.match(out.answer,/Kate Thwaites told/);assert.match(out.answer,/and delivered its final report on 7 July 2023/)
  assert.doesNotMatch(out.answer,/(?:^|\n)\s*(?:;|and delivered)/);valid(out)
})

for(const changed of ['19 claims','18 July 2022','Avery Quinlan'])test('clause matching retains a changed number, date or commissioner: '+changed,()=>{
  const first='The Royal Commission into the Recovery Scheme (Commissioner Rowan Ellery) examined 17 claims on 18 August 2022; Morgan Sample reported the findings.'
  let second='The Royal Commission into the Recovery Scheme, whose Royal Commissioner was Rowan Ellery, investigated 17 claims on 18 August 2022 and delivered its final report.'
  second=second.replace(changed==='19 claims'?'17 claims':changed==='18 July 2022'?'18 August 2022':'Rowan Ellery',changed)
  const p=payload([first,second]),out=api.distinctSummary(p)
  assert.equal(out.answer,p.answer);assert.deepEqual(out.citations,p.citations)
})

test('a fuller independent opening retains its details when removing the other opening would orphan its tail',()=>{
  const first=live182.answer.split('\n\n')[2].replace('examined who','carefully and systematically examined in considerable detail who')
  const second=live182.answer.split('\n\n')[3]
  const p=payload([first,second]),out=api.distinctSummary(p)
  assert.equal(out.answer,p.answer);assert.deepEqual(out.citations,p.citations)
})

for(const pronoun of ['it','It','they','They','he','He','she','She','this','This','these','These'])test('a near-repeat opening keeps the subject of its pronoun tail: '+pronoun,()=>{
  const first=live182.answer.split('\n\n')[2].split(';')[0]+`; ${pronoun} referred six people to the NACC.`
  const second=live182.answer.split('\n\n')[3]
  for(const lines of [[first,second],[second,first]]){
    const p=payload(lines),out=api.distinctSummary(p)
    assert.equal(out.answer,p.answer)
    assert.deepEqual(out.citations,p.citations);valid(out)
  }
})

for(const pronoun of ['it','It','they','They','he','He','she','She','this','This','these','These'])test('an identical opening keeps the subject of its pronoun tail: '+pronoun,async()=>{
  const opening='Labor voted no on 3 May 2023'
  const lines=[opening+'.',opening+`; ${pronoun} received 17 votes.`]
  const p=payload(lines),out=api.distinctSummary(p)
  assert.equal(out.answer,p.answer)
  assert.deepEqual(out.citations,p.citations);valid(out)
  const boundary=await(await api.withAnswerLanguage(Response.json(p),'What happened in the vote?')).json()
  assert.equal(boundary.answer,p.answer);assert.deepEqual(boundary.citations,p.citations);valid(boundary)
})

for(const tail of ['Kate Thwaites described 17 recommendations.','The department received 17 recommendations.'])test('a standalone name or noun phrase still permits an identical opening merge: '+tail,()=>{
  const opening='Labor voted no on 3 May 2023'
  const p=payload([opening+'.',opening+'; '+tail]),out=api.distinctSummary(p)
  assert.equal(out.answer,opening+'.\n\n'+tail)
  assert.deepEqual(Object.keys(out.citations),Object.keys(p.citations));valid(out)
})

for(const [open,close] of [['"','"'],['“','”']])test('quoted clause boundaries cannot be removed as identical openings: '+open,()=>{
  const opening='Labor voted no on 3 May 2023'
  const p=payload([opening+'.',open+opening+'; Cabinet approved 17 payments.'+close])
  const out=api.distinctSummary(p)
  assert.equal(out.answer,p.answer)
  assert.deepEqual(out.citations,p.citations);valid(out)
})

for(const assertion of ['I will say this plainly: Mr Ellery failed every test of integrity in the recovery scheme.','Minister Rowan Ellery failed every test of integrity in the recovery scheme.'])test('a speech assertion is not copied above a full who-answer: '+assertion,()=>{
  const p=payload(['The recovery scheme was examined in the report.'])
  Object.assign(p.sources[0],{kind:'speech',speaker:'Morgan Sample',chamber:'representatives',date:'2021-03-01',title:'Recovery scheme debate',snippet:assertion})
  const out=api.leadWithWho(p,question)
  assert.equal(out.answer,p.answer,'retain the answer without inventing a no-names claim')
  assert.deepEqual(cited(out,'fact-0'),cited(p,'fact-0'));valid(out)
})

test('a colon finding supports an existing sentence without being copied as a source fallback',()=>{
  const finding='The commission found Rowan Ellery allowed Cabinet to be misled about the recovery scheme.'
  const p=payload(['The commission reported on the recovery scheme.',finding])
  Object.assign(p.sources[1],{kind:'speech',speaker:'Morgan Sample',title:'Recovery scheme debate',snippet:'The royal commission concluded: Rowan Ellery allowed Cabinet to be misled about the recovery scheme.'})
  const out=api.leadWithWho(p,question)
  assert.equal(out.answer,[finding,p.answer.split('\n\n')[0]].join('\n\n'))
  for(const id of Object.keys(p.citations))assert.deepEqual(cited(out,id),cited(p,id));valid(out)
  const omitted=payload(['The commission reported on the recovery scheme.']);omitted.sources[0]= {...p.sources[1],resource:'fact-0'}
  assert.equal(api.leadWithWho(omitted,question).answer,omitted.answer)
})

test('a commission finding leads ahead of a member assertion about a named minister',async()=>{
  const assertion='Minister Rowan Ellery failed every test of integrity in the recovery scheme.'
  const finding='The royal commission found that Cabinet approved the recovery scheme without legislative authority.'
  const p=payload([assertion,finding])
  Object.assign(p.sources[0],{kind:'speech',speaker:'Morgan Sample',title:'Recovery scheme debate'})
  const out=api.leadWithWho(p,question)
  assert.equal(out.answer,[finding,assertion].join('\n\n'))
  for(const id of Object.keys(p.citations))assert.deepEqual(cited(out,id),cited(p,id));valid(out)
  const only=payload([assertion]);Object.assign(only.sources[0],p.sources[0])
  assert.equal(api.leadWithWho(only,question).answer,assertion,'an existing supported statement stays eligible when there is no finding')
  // An unrelated record citation on the assertion cannot qualify its speech as a finding.
  p.citations['fact-1'].push([...p.citations['fact-0'][0]])
  const mixed=api.leadWithWho(p,question)
  assert.equal(mixed.answer.split('\n\n')[0],finding);valid(mixed)
  const boundary=await(await api.withAnswerLanguage(Response.json(p),question)).json()
  assert.equal(boundary.answer.split('\n\n')[0],finding);valid(boundary)
})

for(const negative of [
  'The commission discussed the member for Sample (Avery Quinlan), who was prime minister, was not the minister whose department failed the recovery scheme.',
  'The commission discussed the member for Sample (Avery Quinlan), who was prime minister, was cleared of responsibility for the recovery scheme.',
  'The commission discussed the member for Sample (Avery Quinlan), who had no responsibility for the recovery scheme.',
  'The commission cleared the member for Sample (Avery Quinlan), who had responsibility for the recovery scheme.',
])test('a negated parenthetical subject is not promoted or recovered: '+negative,()=>{
  const own='The royal commission found that Cabinet approved the recovery scheme without legislative authority.'
  for(const lines of [[own,negative],[negative,own]]){
    const p=payload(lines),out=api.leadWithWho(p,question)
    assert.equal(out.answer.split('\n\n')[0],own)
    assert.ok(out.answer.includes(negative));valid(out)
  }
  const p=payload(['The report examined the recovery scheme.']);p.sources[0].snippet=negative
  assert.match(api.leadWithWho(p,question).answer,/^The cited sources do not name a person or office as responsible\./)
})

for(const [full,short,seat] of [['Stuart Robert','Mr Robert','Fadden'],['John Howard','Mr Howard','Bennelong']])test('an official sharing an MP surname does not support that MP as the who-lead: '+short,()=>{
  const own='The royal commission found that Cabinet approved the recovery scheme without legislative authority.'
  const named=`The commission found that the member for ${seat} (${full}), who failed to ensure the recovery scheme was lawful, ignored repeated warnings.`
  const p=payload([own,named])
  Object.assign(p.sources[1],{kind:'speech',speaker:'Morgan Sample',title:'Recovery scheme debate',snippet:`The commission found that ${short} failed to ensure the recovery scheme was lawful. The witness was a departmental official.`})
  const out=api.leadWithWho(p,question)
  assert.equal(out.answer.split('\n\n')[0],own)
  assert.ok(out.answer.includes(named));valid(out)
  // A different seat is not support for the role named in the answer either.
  p.sources[1].snippet+=` The member for Elsewhere (${full}) discussed the report.`
  assert.equal(api.leadWithWho(p,question).answer.split('\n\n')[0],own)
})

test('the no-subject fallback orders the actual finding before a member assertion and report metadata',()=>{
  const lines=['Morgan Sample said the recovery scheme was a political disaster.','The commission delivered its report in July 2023.','The royal commission concluded the recovery scheme was unlawful.']
  const p=payload(lines);Object.assign(p.sources[0],{kind:'speech',speaker:'Morgan Sample',title:'Recovery scheme debate'})
  const out=api.leadWithWho(p,question)
  assert.equal(out.answer,['The cited sources do not name a person or office as responsible.',lines[2],lines[0],lines[1]].join('\n\n'))
  for(const id of Object.keys(p.citations))assert.deepEqual(cited(out,id),cited(p,id));valid(out)
})


const boundaryAnswer=async(p,q=question)=>await(await api.withAnswerLanguage(Response.json(p),q)).json()

test('ANAO McKenzie finding relayed in the House leads through the full answer boundary',async()=>{
  const finding='Anthony Albanese told the House that the ANAO found that Bridget McKenzie approved grants.'
  const p=payload(['The report described the grants programme.',finding])
  Object.assign(p.sources[1],{kind:'speech',speaker:'Anthony Albanese',chamber:'representatives',title:'Grants debate'})
  const out=await boundaryAnswer(p,'Who approved the grants?')
  assert.equal(out.answer.split('\n\n')[0],finding)
  assert.doesNotMatch(out.answer,/The cited sources do not name/)
  for(const id of Object.keys(p.citations))assert.deepEqual(cited(out,id),cited(p,id));valid(out)
})

for(const body of ['Auditor-General','ANAO','Senate committee','NACC','ICAC','IBAC','CCC','CMC','NSW Independent Commission Against Corruption','South Australian Independent Commission Against Corruption','Northern Territory Independent Commissioner Against Corruption','Tasmanian Integrity Commission','ACT Integrity Commission','Corruption and Crime Commission','Crime and Corruption Commission'])test('a relayed finding stays eligible and can supply an omitted source lead: '+body,async()=>{
  const finding=`Morgan Sample told the House that the ${body} found that Rowan Ellery approved the recovery grants.`
  const p=payload(['The grants programme was examined in the inquiry.',finding])
  Object.assign(p.sources[1],{kind:'speech',speaker:'Morgan Sample',chamber:'representatives',title:'Grants debate'})
  const out=await boundaryAnswer(p,'Who approved the recovery grants?')
  assert.equal(out.answer.split('\n\n')[0],finding)
  assert.doesNotMatch(out.answer,/The cited sources do not name/);valid(out)
  const omitted=payload(['The grants programme was examined in the inquiry.'])
  const sourceFinding=`The ${body} found that Rowan Ellery approved the recovery grants.`
  Object.assign(omitted.sources[0],{kind:'speech',speaker:'Morgan Sample',chamber:'representatives',title:'Grants debate',snippet:sourceFinding})
  const recovered=await boundaryAnswer(omitted,'Who approved the recovery grants?')
  assert.equal(recovered.answer.split('\n\n')[0],'Morgan Sample told the House of Representatives that '+sourceFinding.replace(/^The /,'the '))
  assert.ok(recovered.answer.includes(omitted.answer));valid(recovered)
})

for(const statement of ['Morgan Sample told the House that Rowan Ellery approved the recovery grants.','Morgan Sample told the House that the ANAO found: Minister Rowan Ellery approved the recovery grants.'])test('an existing attributed member statement remains eligible: '+statement,async()=>{
  const p=payload(['The grants programme was debated in the House.',statement])
  Object.assign(p.sources[1],{kind:'speech',speaker:'Morgan Sample',chamber:'representatives',title:'Grants debate'})
  const out=await boundaryAnswer(p,'Who approved the recovery grants?')
  assert.equal(out.answer.split('\n\n')[0],statement)
  assert.doesNotMatch(out.answer,/The cited sources do not name/)
  for(const id of Object.keys(p.citations))assert.deepEqual(cited(out,id),cited(p,id));valid(out)
})

test('a supported surname sentence already in the answer moves first without a copied duplicate',async()=>{
  const context='The member for Cook (Scott Morrison) was social services minister.'
  const finding='Bill Shorten told the House that the commission found Mr Morrison allowed Cabinet to be misled.'
  const p=payload([context,finding])
  Object.assign(p.sources[1],{kind:'speech',speaker:'Bill Shorten',chamber:'representatives',title:'Robodebt debate',snippet:'The commission found Mr Morrison allowed Cabinet to be misled. The member for Cook was social services minister.'})
  const out=await boundaryAnswer(p)
  assert.equal(out.answer,[finding,context].join('\n\n'))
  assert.equal(out.answer.split('allowed Cabinet to be misled').length-1,1)
  assert.equal(Object.values(out.citations).flat().length,2)
  for(const id of Object.keys(p.citations))assert.deepEqual(cited(out,id),cited(p,id));valid(out)
  const again=await boundaryAnswer(out)
  assert.equal(again.answer,out.answer);assert.deepEqual(again.citations,out.citations)
})

for(const negated of ['The commission found no evidence that Rowan Ellery approved the recovery scheme.','The commission rejected claims that Rowan Ellery approved the recovery scheme.','The commission rejected claims that Minister Rowan Ellery approved the recovery scheme.'])test('a round-3 that-name claim is retained after removing the extra negation guard: '+negated,async()=>{
  const own='The royal commission found that Cabinet approved the recovery scheme without legislative authority.'
  for(const lines of [[own,negated],[negated,own]]){
    const p=payload(lines),out=await boundaryAnswer(p)
    assert.ok(out.answer.includes(own));assert.ok(out.answer.includes(negated));valid(out)
  }
})

test('a titled colon attack cannot supply a copied lead even beside a finding',async()=>{
  const p=payload(['Morgan Sample told the House that the report described the recovery scheme.'])
  Object.assign(p.sources[0],{kind:'speech',speaker:'Morgan Sample',chamber:'representatives',title:'Recovery debate',snippet:'The report found the scheme unlawful; I will say this plainly: Minister Rowan Ellery failed every test of integrity.'})
  const out=await boundaryAnswer(p)
  assert.equal(out.answer,p.answer,'retain the answer without inventing a no-names claim')
  assert.deepEqual(cited(out,'fact-0'),cited(p,'fact-0'));valid(out)
})

test('a lowercase semicolon tail keeps its opening through the answer boundary',async()=>{
  const opening='Labor voted no on 3 May 2023'
  const p=payload([opening+'.',opening+'; the bill received 17 votes.'])
  assert.equal(api.distinctSummary(p).answer,p.answer)
  const out=await boundaryAnswer(p,'What happened in the vote?')
  assert.equal(out.answer,p.answer)
  for(const id of Object.keys(p.citations))assert.deepEqual(cited(out,id),cited(p,id));valid(out)
})

test('record-first ordering keeps the live 182 paragraphs and citations intact',async()=>{
  const out=await boundaryAnswer(live182)
  assert.equal(out.answer.split('\n\n').length,10)
  assert.equal(createHash('sha256').update(out.answer.split('\n\n').sort().join('\n\n')).digest('hex'),'771eaa01bf861976ef92508ed8953412f3605cf9e12367abf60f3016d452883b','every paragraph is byte-identical to 80af9ec5e; only ordering changes')
  assert.equal((out.answer.match(/Catherine Holmes AC SC/g)??[]).length,1)
  assert.deepEqual(Object.keys(out.citations),Object.keys(live182.citations))
  assert.equal(Object.values(out.citations).flat().length,13);valid(out)
})


for(const positive of [
 'The commission found not only that Rowan Ellery approved the recovery grants but also that Avery Quinlan ignored legal advice.',
 'The commission denied claims from critics, then found that Rowan Ellery approved the recovery grants.',
 'The commission denied claims from critics, then found that Minister Rowan Ellery approved the recovery grants.',
])test('round 4 keeps a positive proposition after not only or unrelated denied claims: '+positive,async()=>{
 const out=await boundaryAnswer(payload([positive]))
 assert.equal(out.answer,positive)
 assert.doesNotMatch(out.answer,/The cited sources do not name/);valid(out)
})

test('round 4 scopes parenthetical negation to the matched proposition',async()=>{
 const text='The commission denied claims from critics, then discussed the member for Sample (Rowan Ellery), who not only approved the recovery grants but also ignored legal advice.'
 const p=payload([text]);p.sources[0].snippet='The commission found Rowan Ellery approved the recovery grants and ignored legal advice.'
 const out=await boundaryAnswer(p)
 assert.equal(out.answer,text)
 assert.doesNotMatch(out.answer,/The cited sources do not name/);valid(out)
})
