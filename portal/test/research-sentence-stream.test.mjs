import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {scriptedResearchModel} from './fixtures/research-scripted-model.mjs'
import {sentenceSpans} from '../src/sentence-bounds.mjs'
import {importBundle} from './fixtures/import-bundle.mjs'

const bundled=await build({stdin:{contents:"export * from './src/research-generation'; export * from './src/research-grounding'; export * from './src/research-sentences'; export * from './src/research-sentence-stream'; export * from './src/research-response'; export * from './src/research-writer'; export * from './src/research-evidence'; export * from './src/agentic-ask'; export * from './src/research-loop'; export {agenticAskPayload} from './src/agentic-response'; export {createResearchCreditCooldown} from './src/research-credit'; export {proseFallback} from './src/research-writing'; export * from './src/research-who-lead';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']})
const api=await importBundle(bundled.outputFiles[0].text,'research-sentence-stream')
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}
const source=(resource,snippet,extra={})=>({resource,slug:'',title:'Housing report',href:'https://example.org/report',url:'https://example.org/report',snippet,cited:true,kind:'record',...extra})
const payload=(answer,sources=[],citations={})=>({answer,sources,citations,answer_decision:'answer'})
const receipt=(id,party,period='2022-23')=>source(id,`Disclosed receipt: Example Holdings Pty Ltd → ${party} — $50,000 in disclosed political receipts, ${period}.`,{receipt:{source:'Example Holdings Pty Ltd',party,amount:50000,period}})
const frame=(event,data)=>`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
const decode=wire=>wire.trim().split(/\r?\n\r?\n/).map(block=>({event:/^event: (.+)$/m.exec(block)?.[1],data:JSON.parse(/^data: (.+)$/m.exec(block)[1])}))
const question='What did the housing report find?'

// The old response-wide hold cannot pass: the first checked sentence must be readable while done is blocked.
test('checked sentences cross the public boundary progressively, and done equals their concatenation',async()=>{
  const gate=deferred(),first=deferred(),encoder=new TextEncoder()
  const one='The housing report found planning rules slowed approvals.',two='It recommended simpler planning rules.'
  const full=payload(one+'\n\n'+two)
  const upstream=new Response(new ReadableStream({start(c){
    const send=async(event,data)=>c.enqueue(encoder.encode(frame(event,data)))
    const stream=api.researchSentenceStream(question,text=>send('research_sentence',{text}))
    void(async()=>{
      await send('research_sentences',{})
      await stream.preview(payload(one));first.resolve()
      await gate.promise
      await stream.preview(full)
      await send('done',full);c.close()
    })()
  }}),{headers:{'content-type':'text/event-stream'}})
  const reader=(await api.withAnswerLanguage(upstream,question)).body.getReader()
  await first.promise
  const firstRead=await reader.read(),text=new TextDecoder().decode(firstRead.value)
  assert.deepEqual(decode(text),[{event:'delta',data:{text:one}}])
  gate.resolve()
  let wire=text
  for(;;){const {value,done}=await reader.read();if(done)break;wire+=new TextDecoder().decode(value)}
  const events=decode(wire),done=events.find(e=>e.event==='done').data
  assert.equal(events.filter(e=>e.event==='delta').map(e=>e.data.text).join(''),done.answer)
  assert.equal(done.answer,one+'\n\n'+two)
  assert.ok(events.every(e=>!e.event.startsWith('research_')))
})

test('sentence records retain abbreviations, sections, decimals, money and closing quotes at every token split',()=>{
  const sentences=[
    'Mr. Example discussed Bill No. 3 and s. 12 with Dr. Sample.',
    'The proposal cost $1.5m, or 1.25 per cent of funding.',
    'The report called it “a useful step”.',
  ]
  assert.deepEqual(sentenceSpans(sentences.join(' ')).map(p=>p.text),sentences)
  assert.deepEqual(api.researchSentences('Bill No. 3 uses s. 12 and cl. 4. $1.5m was allocated.').map(p=>p.text),['Bill No. 3 uses s. 12 and cl. 4.','$1.5m was allocated.'])
  const records=sentences.map(text=>({text,facts:[1],coverage:false}))
  const raw=JSON.stringify({answer_decision:'answer',sentences:records})
  for(let i=0;i<raw.length;i++){
    const entries=api.completedAnswerEntries(raw.slice(0,i),'sentences')
    assert.deepEqual(entries,records.slice(0,entries.length))
    for(const entry of entries)assert.equal(api.completeSentences(entry.text),true)
  }
  assert.deepEqual(api.researchSentences('The report called it “a useful step. A new start.” The report also named Mr. Example.').map(p=>p.text),['The report called it “a useful step. A new start.”','The report also named Mr. Example.'])
  assert.equal(api.completeSentences('The report said “This is unfinished.'),false)
  assert.equal(api.completeSentences('The report is unfinished'),false)
  assert.deepEqual(api.completedAnswerEntries('{"sentences":[{"text":"Hidden.","facts":','sentences'),[])
  assert.deepEqual(api.completedAnswerEntries(JSON.stringify({sentences:[{text:'Braces { } and an escaped "quote".',facts:[]}]}),'sentences'),[{text:'Braces { } and an escaped "quote".',facts:[]}])
})

test('a dropped money sentence never appears, and an unheld quotation appears only as paraphrase',async()=>{
  const ambiguous='Labor received $50,000 in 2022-23.',safe='The housing report found planning rules slowed approvals.'
  const sources=[receipt('money-a','Liberal'),receipt('money-b','Greens')]
  const deltas=[],stream=api.researchSentenceStream(question,async text=>deltas.push(text))
  assert.equal(api.groundAnswerPayload(payload(ambiguous,sources,{'money-a/t/body/0':[[0,ambiguous.length]],'money-b/t/body/0':[[0,ambiguous.length]]}),question).answer,'')
  await stream.preview(payload(ambiguous,sources,{'money-a/t/body/0':[[0,ambiguous.length]],'money-b/t/body/0':[[0,ambiguous.length]]}))
  assert.deepEqual(deltas,[],'a removed first sentence cannot cause an early fallback either')
  const quoted='The housing report found “planning rules slowed approvals”.'
  const evidence=source('housing','The housing report considered approval delays.')
  await stream.preview(payload(quoted,[evidence],{'housing/t/body/0':[[0,quoted.length]]}))
  assert.equal(deltas.join(''),safe)
  assert.doesNotMatch(deltas.join(''),/[“”]|Labor|50,000/)
})

test('money attribution is corrected before it leaves the boundary',async()=>{
  const sentence='Labor received $50,000 from Example Holdings Pty Ltd in 2022-23.',deltas=[]
  const stream=api.researchSentenceStream('What funding was received?',async text=>deltas.push(text))
  await stream.preview(payload(sentence,[receipt('money','Liberal')],{'money/t/body/0':[[0,sentence.length]]}))
  assert.equal(deltas.join(''),'Liberal received $50,000 from Example Holdings Pty Ltd in 2022-23.')
})

test('a mutable accountability opening stays held for the final ordering check',async()=>{
  const deltas=[],stream=api.researchSentenceStream('Who was responsible for robodebt?',async text=>deltas.push(text))
  const text='The Royal Commission into Robodebt was established in 2022.'
  await stream.preview(payload(text,[source('report',text)],{'report/t/body/0':[[0,text.length]]}))
  assert.deepEqual(deltas,[])
})

test('the actual SDK writer releases its first checked sentence before its last token',async()=>{
  let groundingPasses=0
  globalThis.__opaxResearchTrace=stage=>{if(stage==='grounding.audit')groundingPasses++}
  const first='The housing report found planning rules slowed approvals.',second='The report recommended simpler planning rules.'
  const gate=deferred(),heard=deferred(),deltas=[]
  let raw=''
  const model=scriptedResearchModel([{text:{answer_decision:'answer',sentences:[{text:first,facts:[1]},{text:second,facts:[1]}]}}],{onPiece:async piece=>{raw+=piece;if(raw.includes('recommended'))await gate.promise}})
  const input={question,period:{kind:'all',label:''},facts:[{id:1,text:first,source:source('housing',first+' '+second,{kind:'speech'})}]}
  const stream=api.researchSentenceStream(question,async text=>{deltas.push(text);heard.resolve()})
  const stats={rounds:1,tokens:{input:0,output:0}}
  const write=api.createAnswerWriter({model,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})}})
  const writing=write(input,stats,undefined,3000,stream.preview)
  try{
    await Promise.race([heard.promise,new Promise((_,reject)=>setTimeout(()=>reject(Error('first sentence stayed withheld')),1000))])
    assert.equal(deltas.join(''),first)
    assert.equal(groundingPasses,1,'one grounding pass for the first completed sentence')
  }finally{gate.resolve();delete globalThis.__opaxResearchTrace}
  const done=await writing
  assert.equal(model.doStreamCalls.length,1)
  assert.equal(deltas.join(''),done.answer)
})

test('unchanged cache deltas stay held until validation, then replay with the exact original frame boundaries',async()=>{
  const text='The housing report found planning rules slowed approvals.',parts=[text.slice(0,19),text.slice(19)],gate=deferred(),encoder=new TextEncoder()
  const upstream=new Response(new ReadableStream({start(c){for(const text of parts)c.enqueue(encoder.encode(frame('delta',{text})));void gate.promise.then(()=>{c.enqueue(encoder.encode(frame('done',payload(text))));c.close()})}}),{headers:{'content-type':'text/event-stream'}})
  const reader=(await api.withAnswerLanguage(upstream,question)).body.getReader()
  let arrived=false
  const reading=reader.read().then(value=>{arrived=true;return value})
  await new Promise(r=>setTimeout(r,15));assert.equal(arrived,false)
  gate.resolve()
  let wire=new TextDecoder().decode((await reading).value)
  for(;;){const {value,done}=await reader.read();if(done)break;wire+=new TextDecoder().decode(value)}
  const events=decode(wire)
  assert.deepEqual(events.filter(e=>e.event==='delta').map(e=>e.data.text),parts)
  assert.equal(events.at(-1).data.answer,text)
})

// Who questions (210): leadWithWho reads the whole answer, so a prefix is released only when its lead is decided.
const who='Who was responsible for the Example scheme?'
const whoSource=(resource,snippet,kind='record',extra={})=>source(resource,snippet,{title:'Example Inquiry report',kind,...extra})
const spokenSource=(resource,snippet)=>whoSource(resource,snippet,'speech',{speaker:'Robin Example',chamber:'senate',date:'2024-02-01'})
const cite=(resource,text,from=0)=>({[resource+'/t/body/0']:[[from,from+text.length]]})
const withBasis=(p,sources)=>({...p,research:{who_basis:api.whoBasis(sources.map(s=>({kind:s.kind,texts:[s.snippet,s.title]})))}})
/** The route's finish() and public boundary after these releases, beside the same answer with nothing streamed. */
async function whoFinish(q,deltas,full){
  const finished=api.groundAnswerPayload({answered:true,...full,research:{mode:'loop'}},q,deltas.join(''))
  const wire=frame('research_sentences',{})+deltas.map(text=>frame('research_sentence',{text})).join('')+frame('done',finished)
  const events=decode(await(await api.withAnswerLanguage(new Response(wire,{headers:{'content-type':'text/event-stream'}}),q)).text())
  const plain=await(await api.withAnswerLanguage(Response.json(api.groundAnswerPayload({answered:true,...full,research:{mode:'loop'}},q)),q)).json()
  let client='';for(const e of events){if(e.event==='retry')client='';if(e.event==='delta')client+=e.data.text}
  return {events,done:events.at(-1).data,plain,client}
}
const supported='The Example Inquiry found Minister Jane Example approved the Example scheme without legal advice.'
const relayedSubject='Robin Example told the Senate the Example Inquiry found Minister Jane Example approved the Example scheme.'

test('who lead: a top-ranked record subject streams at once, and done keeps the non-streaming who order',async()=>{
  const claim='Robin Example said the scheme hurt thousands of people.'
  const record=whoSource('inquiry',supported),speech=spokenSource('debate','The scheme hurt thousands of people in my electorate.')
  const deltas=[],stream=api.researchSentenceStream(who,async text=>deltas.push(text))
  await stream.preview(withBasis(payload(supported,[record],cite('inquiry',supported)),[record,speech]))
  assert.equal(deltas.join(''),supported)
  const full=payload(supported+'\n\n'+claim,[record,speech],{...cite('inquiry',supported),...cite('debate',claim,supported.length+2)})
  await stream.preview(withBasis(full,[record,speech]))
  const {events,done,plain,client}=await whoFinish(who,deltas,full)
  assert.equal(events.some(e=>e.event==='retry'),false)
  assert.equal(deltas.join(''),done.answer,'the whole answer streamed before done')
  assert.equal(client,done.answer)
  assert.equal(done.answer,plain.answer)
})

test('who lead: a speech-cited subject stays held until the record finding about the same person moves first',async()=>{
  const speech=spokenSource('debate','The Example Inquiry found Minister Jane Example approved the Example scheme.'),record=whoSource('inquiry',supported)
  const deltas=[],stream=api.researchSentenceStream(who,async text=>deltas.push(text))
  await stream.preview(withBasis(payload(relayedSubject,[speech],cite('debate',relayedSubject)),[speech,record]))
  assert.deepEqual(deltas,[],'an available record can still outrank the speech')
  const full=payload(relayedSubject+'\n\n'+supported,[speech,record],{...cite('debate',relayedSubject),...cite('inquiry',supported,relayedSubject.length+2)})
  await stream.preview(withBasis(full,[speech,record]))
  assert.ok(deltas.join('').startsWith(supported))
  const {events,done,plain,client}=await whoFinish(who,deltas,full)
  assert.equal(events.some(e=>e.event==='retry'),false)
  assert.equal(client,done.answer)
  assert.equal(done.answer,plain.answer)
  assert.ok(done.answer.startsWith(supported))
})

test('who lead: with no source naming anyone, the "do not name" line is held until done, since a later point may still name someone',async()=>{
  const q='Who was responsible for robodebt?',deltas=[],stream=api.researchSentenceStream(q,async text=>deltas.push(text))
  const context='Robin Example said the government ignored warnings.',unrelated='The NACC found officials mishandled a referral.',finding='The Royal Commission into Robodebt found the scheme was unlawful.',later='The report recommended changes.'
  const unnamed=answer=>({...payload(answer),research:{who_basis:api.whoBasis([])}})
  for(const answer of [context,context+'\n'+unrelated,context+'\n'+unrelated+'\n'+finding,context+'\n'+unrelated+'\n'+finding+'\n'+later])await stream.preview(unnamed(answer))
  assert.deepEqual(deltas,[],'the line leads only if no sentence of the whole answer names anyone')
  const {events,done,plain,client}=await whoFinish(q,deltas,payload(context+'\n'+unrelated+'\n'+finding+'\n'+later))
  assert.equal(events.some(e=>e.event==='retry'),false)
  assert.equal(client,done.answer)
  assert.equal(done.answer,plain.answer)
  assert.ok(done.answer.startsWith(api.UNNAMED_WHO_LEAD+'\n\n'+finding),'a genuinely unnamed answer still opens on the line, then the finding')
})

test('who lead: once a point names someone the line cannot lead, so the settled on-topic finding streams and earlier context stays held',async()=>{
  const q='Who was responsible for robodebt?',deltas=[],stream=api.researchSentenceStream(q,async text=>deltas.push(text))
  const context='Robin Example said the government ignored warnings.',named='Scott Morrison took the proposal to Cabinet in 2015.',unrelated='The NACC found officials mishandled a referral.',finding='The Royal Commission into Robodebt found the scheme was unlawful.'
  const unnamed=answer=>({...payload(answer),research:{who_basis:api.whoBasis([])}})
  await stream.preview(unnamed(context))
  await stream.preview(unnamed(context+'\n'+named))
  await stream.preview(unnamed(context+'\n'+named+'\n'+unrelated))
  assert.deepEqual(deltas,[],'an off-topic finding cannot settle the authority order')
  await stream.preview(unnamed(context+'\n'+named+'\n'+unrelated+'\n'+finding))
  assert.equal(deltas.join(''),finding,'only the settled lead is released before completion, with no "do not name" line')
  const {events,done,plain,client}=await whoFinish(q,deltas,payload(context+'\n'+named+'\n'+unrelated+'\n'+finding))
  assert.equal(events.some(e=>e.event==='retry'),false)
  assert.equal(client,done.answer)
  assert.equal(done.answer,plain.answer)
  assert.ok(!done.answer.includes(api.UNNAMED_WHO_LEAD))
  // Without a summary of the sources still available, a later point could name someone: nothing is released.
  const held=[],blind=api.researchSentenceStream(q,async text=>held.push(text))
  await blind.preview(payload(context+'\n'+named+'\n'+unrelated+'\n'+finding))
  assert.deepEqual(held,[])
})

test('who lead: an opening that shaping changed (a speech-cited finding attributed, an off-topic finding promoted) waits for the on-topic finding',async()=>{
  // Review case A1: the raw first point is a finding, so it raises no hold, but it is cited only to a member's speech.
  const q='Who was responsible for robodebt?'
  const spoken=whoSource('speech-a1','The Royal Commission found the scheme was unlawful.','speech',{speaker:'Avery Quinlan',chamber:'senate',date:'2024-02-01'})
  const ferry=whoSource('bill-a1','The NACC found Scott Morrison was told of corrupt conduct in the ferry contracts.','bill',{title:'Ferry contracts bill'})
  const robodebt=whoSource('bill-a1c','The Royal Commission found robodebt was a crude and cruel mechanism.','bill',{title:'Robodebt bill'})
  const sources=[spoken,ferry,robodebt],lines=[spoken.snippet,ferry.snippet,robodebt.snippet]
  const draft=k=>{
    const answer=lines.slice(0,k).join('\n'),citations={}
    let at=0
    for(let i=0;i<k;i++){Object.assign(citations,cite(sources[i].resource,lines[i],at));at+=lines[i].length+1}
    return payload(answer,sources.slice(0,k),citations)
  }
  const deltas=[],stream=api.researchSentenceStream(q,async text=>deltas.push(text))
  await stream.preview(withBasis(draft(1),sources))
  await stream.preview(withBasis(draft(2),sources))
  assert.deepEqual(deltas,[],'the promoted ferry finding is off topic and a later on-topic finding would replace it')
  await stream.preview(withBasis(draft(3),sources))
  assert.equal(deltas.join(''),robodebt.snippet)
  const {events,done,plain,client}=await whoFinish(q,deltas,draft(3))
  assert.equal(events.some(e=>e.event==='retry'),false)
  assert.equal(client,done.answer)
  assert.equal(done.answer,plain.answer)
  assert.ok(done.answer.startsWith(robodebt.snippet))
})

test('duplicate removal preserves line breaks without resetting the released prefix',async()=>{
  const first='The housing report found planning rules slowed approvals.',second='The report recommended simpler planning rules.',deltas=[]
  const stream=api.researchSentenceStream(question,async text=>deltas.push(text))
  await stream.preview(payload(first));await stream.preview(payload(first+'\n'+second))
  const full={...payload(first+'\n'+second+'\n'+second),research:{mode:'loop'}}
  const wire=frame('research_sentences',{})+deltas.map(text=>frame('research_sentence',{text})).join('')+frame('done',full)
  const events=decode(await(await api.withAnswerLanguage(new Response(wire,{headers:{'content-type':'text/event-stream'}}),question)).text())
  assert.equal(events.some(e=>e.event==='retry'),false)
  assert.equal(events.filter(e=>e.event==='delta').map(e=>e.data.text).join(''),events.at(-1).data.answer)
  assert.equal(events.at(-1).data.answer,first+'\n'+second)
  assert.equal(api.normaliseWrittenPayload(full,question).answer,first+'\n'+second)
  assert.equal((await(await api.withAnswerLanguage(Response.json(full),question)).json()).answer,first+'\n'+second)
})

test('changed cached quotations still release only the final checked payload',async()=>{
  const raw='The housing report found “planning rules slowed approvals”.'
  const final=payload(raw,[source('housing','The report considered planning delays.')],{'housing/t/body/0':[[0,raw.length]]})
  const wire=frame('delta',{text:raw})+frame('done',final)
  const events=decode(await(await api.withAnswerLanguage(new Response(wire,{headers:{'content-type':'text/event-stream','x-opax-cache':'HIT'}}),question)).text())
  assert.deepEqual(events.map(e=>e.event),['done'])
  assert.equal(events[0].data.answer,'The housing report found planning rules slowed approvals.')
})

test('incremental scanner visits each character once, including every JSON token split',()=>{
  const records=[{text:'An escaped "quote" and braces { }.',facts:[1]},{facts:[2],text:'Another finding.'}]
  const raw=JSON.stringify({answer_decision:'answer',sentences:records})
  for(let split=1;split<raw.length;split++){
    const scanner=api.answerEntryScanner('sentences')
    assert.deepEqual([...scanner.push(raw.slice(0,split)),...scanner.push(raw.slice(split))],records)
    assert.ok(scanner.scannedCharacters<=raw.length)
  }
  const scanner=api.answerEntryScanner('sentences'),found=[]
  for(const char of raw)found.push(...scanner.push(char))
  assert.deepEqual(found,records)
  assert.ok(scanner.scannedCharacters<=raw.length)
})

for(const salvaged of [false,true])test(salvaged?'a salvaged bill answer keeps the model\'s order too, so its released lead needs no retry':'P1-1: a later cited speaker cannot move the released bill lead',async()=>{
  const q='What happened to the Example Bill 2024?'
  const passages=[{id:'bill-1',resource:'bill-1',slug:'',title:'Example Bill 2024',text:'The Example Bill 2024 passed the Senate on 3 March 2024 after a second reading debate.',url:'https://example.org/bill',kind:'bill'},
    {id:'sp-1',resource:'sp-1',slug:'',title:'Second reading speech',text:'Senator Jane Example said the bill would cut red tape for small business owners across the country.',url:'https://example.org/sp',kind:'speech',speaker:'Jane Example',chamber:'senate',date:'2024-02-01'}]
  const points=[{claim:'The Example Bill 2024 passed the Senate on 3 March 2024.',id:'bill-1',quote:'passed the Senate on 3 March 2024 after a second reading debate'},
    {claim:'Jane Example told the Senate the bill would cut red tape for small business.',id:'sp-1',quote:'the bill would cut red tape for small business owners across the country'}]
  const map=new Map(passages.map(p=>[p.id,p])),named={people:[],parties:[],bills:[],ambiguous:false,unresolved:false}
  const deltas=[],stream=api.researchSentenceStream(q,async text=>deltas.push(text))
  const one=api.verifyResearchPoints(points.slice(0,1),map,q,named),full=api.verifyResearchPoints(points,map,q,named)
  await stream.preview(one)
  assert.equal(deltas.join(''),points[0].claim)
  await stream.preview(full)
  const final={...full,research:{mode:'loop',...(salvaged?{answer_stats:{salvaged:'malformed_args'}}:{})}}
  const done=api.groundAnswerPayload(final,q,stream.released)
  if(salvaged)assert.deepEqual(done,api.groundAnswerPayload(final,q),'salvage has no fixed-prefix shape exemption')
  const wire=frame('research_sentences',{})+deltas.map(text=>frame('research_sentence',{text})).join('')+frame('done',done)
  const events=decode(await(await api.withAnswerLanguage(new Response(wire,{headers:{'content-type':'text/event-stream'}}),q)).text())
  // A loop answer is never reordered (the planner's answers still lead with a promoted finding), so there is no retry.
  assert.equal(events.some(e=>e.event==='retry'),false)
  let client=''
  for(const e of events){if(e.event==='retry')client='';if(e.event==='delta')client+=e.data.text}
  assert.equal(client,events.at(-1).data.answer)
  assert.ok(events.at(-1).data.answer.startsWith(points[0].claim))
  assert.ok(api.groundAnswerPayload({...final,research:{mode:'planner'}},q).answer.startsWith(points[1].claim),'the planner path still promotes the cited speaker')
})

// Revert checks (review, 14 November 2026). The bill answer's first point fails the direct-lead test, and leadWithFinding
// would promote the cited speaker ahead of it.
const billLead=()=>{
  const q='What happened to the Example Bill 2024?'
  const passages=[{id:'bill-1',resource:'bill-1',slug:'',title:'Example Bill 2024',text:'The Example Bill 2024 passed the Senate on 3 March 2024 after a second reading debate.',url:'https://example.org/bill',kind:'bill'},
    {id:'sp-1',resource:'sp-1',slug:'',title:'Second reading speech',text:'Senator Jane Example said the bill would cut red tape for small business owners across the country.',url:'https://example.org/sp',kind:'speech',speaker:'Jane Example',chamber:'senate',date:'2024-03-01'}]
  const points=[{claim:'The Example Bill 2024 passed the Senate on 3 March 2024.',id:'bill-1',quote:'passed the Senate on 3 March 2024 after a second reading debate'},
    {claim:'Jane Example told the Senate the bill would cut red tape for small business.',id:'sp-1',quote:'the bill would cut red tape for small business owners across the country'}]
  const map=new Map(passages.map(p=>[p.id,p])),named={people:[],parties:[],bills:[],ambiguous:false,unresolved:false}
  return {q,points,one:api.verifyResearchPoints(points.slice(0,1),map,q,named),full:api.verifyResearchPoints(points,map,q,named)}
}
test('revert check, grounding: a loop point answer keeps the model\'s first point; a written record or planner answer still leads with the cited speaker',()=>{
  const {q,points,full}=billLead()
  assert.ok(api.groundAnswerPayload({...full,research:{mode:'loop'}},q).answer.startsWith(points[0].claim),'loop points keep the model order')
  assert.ok(api.groundAnswerPayload({...full,research:{mode:'loop',pre_writer_sources:[]}},q).answer.startsWith(points[1].claim),'a written record answer keeps its lead shaping')
  assert.ok(api.groundAnswerPayload({...full,research:{mode:'planner'}},q).answer.startsWith(points[1].claim),'the planner keeps its lead shaping')
})
// A written record answer keeps the stable-lead hold; the money-ranking replay stream resets without it (ask-replay).
test('revert check, stream gate: a loop answer whose lead fails the direct-lead test is released at once, in the model order',async()=>{
  const {q,points,full}=billLead()
  const checked=api.checkedAnswerPayload({...full,research:{mode:'loop'}},q,true)
  assert.equal(api.stableResearchLead(checked,q),false,'the lead fails the direct-lead test')
  const loop=[],loopStream=api.researchSentenceStream(q,async text=>loop.push(text))
  await loopStream.preview(full)
  assert.ok(loop.length&&loop.join('')===checked.answer&&checked.answer.startsWith(points[0].claim),'the loop answer streams in the model order')
})

const emptyScope={people:[],parties:[],bills:[],ambiguous:false,unresolved:false}
const budgetOptions=model=>({model,inputPrice:0.1,outputPrice:0.3,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})},creditCooldown:api.createResearchCreditCooldown()})
const call=(name,args,id)=>({name,args,id})
test('P1-2: rejected answer arguments stay private until a lookup and accepted answer',async()=>{
  const q='What happened with the Leppington Triangle land purchase?',pid='r1/t/body/0'
  const text='The Auditor-General found the Department of Infrastructure paid $29.8 million for the Leppington Triangle, about ten times its value, in July 2018.'
  const kb=async()=>({resources:{r1:{slug:'speech-9',title:'Leppington Triangle',fields:{body:{paragraphs:{[pid]:{text}}}}}},fulltext:{total:1,facets:{}}})
  const rejected='The Commonwealth bought the Leppington Triangle in 2018 for a new airport.'
  const model=scriptedResearchModel([
    {tool_calls:[call('answer',{points:[{claim:rejected}]},'a')]},
    {tool_calls:[call('search',{query:'Leppington Triangle purchase'},'b')]},
    {tool_calls:[call('answer',{points:[{claim:'The Auditor-General found the department paid $29.8 million for the Leppington Triangle, about ten times its value.',id:pid,quote:'paid $29.8 million for the Leppington Triangle, about ten times its value'}]},'c')]},
  ])
  const deltas=[],stream=api.researchSentenceStream(q,async text=>deltas.push(text)),progress=async()=>{}
  progress.answer=stream.preview
  const research=Object.assign(api.createResearch(budgetOptions(model)),{write:undefined})
  const run=await api.runAgentic(q,{asset:async()=>null,kb,generate:async()=>{throw Error('planner must not run')},research},progress,40_000,api.inferPeriod(q),{},emptyScope)
  assert.equal(model.calls.length,3)
  assert.doesNotMatch(deltas.join(''),/Commonwealth bought/)
  const done=api.checkedAnswerPayload({...run.qualitative,research:{mode:'loop'}},q,false,stream.released)
  assert.equal(deltas.join(''),done.answer)
  assert.match(run.answer,/Auditor-General/)
})

test('P1-2: a research failure followed by planner fallback cannot leak a rejected preview',async t=>{
  t.mock.method(console,'error',()=>{})
  const q='Who speaks most about housing?',rejected='Robin Example spoke most about housing.'
  const model=scriptedResearchModel([{tool_calls:[call('answer',{points:[{claim:rejected}]},'a')]},{error:'provider disconnected'},{error:'provider disconnected'}])
  const deltas=[],stream=api.researchSentenceStream(q,async text=>deltas.push(text)),progress=async()=>{}
  progress.answer=stream.preview
  let plans=0
  const research=Object.assign(api.createResearch(budgetOptions(model)),{write:undefined})
  const run=await api.runAgentic(q,{asset:async()=>null,kb:async()=>({fulltext:{total:12,facets:{'/u/o':{'/u/o/Pat Example':12}}}}),generate:async()=>{plans++;return {text:JSON.stringify({shape:'ranking',steps:[{tool:'count_speeches',args:{topic:'housing',group_by:'speaker'}}]})}},research},progress,40_000,api.inferPeriod(q),{},emptyScope)
  assert.equal(plans,1)
  assert.equal(run.research.mode,'planner')
  assert.deepEqual(deltas,[])
})

test('P1-3: writer wall cap returns the checked released sentences before the enclosing timer',async()=>{
  const sentences=['The housing report found planning rules slowed approvals.','The report recommended simpler planning rules.','It also said councils needed more staff to process applications.']
  const model=scriptedResearchModel([{text:{answer_decision:'answer',sentences:sentences.map(text=>({text,facts:[1]}))}}],{tokensPerSecond:40})
  const input={question,period:{kind:'all',label:''},facts:[{id:1,text:sentences.join(' '),source:source('housing',sentences.join(' '),{kind:'speech'})}]}
  const deltas=[],stream=api.researchSentenceStream(question,async text=>deltas.push(text)),stats={rounds:1,tokens:{input:0,output:0}}
  const write=api.createAnswerWriter(budgetOptions(model))
  const written=await api.bounded(signal=>write(input,stats,signal,1500,stream.preview),1500).catch(()=>api.proseFallback(input))
  assert.ok(deltas.length>=1)
  assert.equal(written.answer,deltas.join(''))
  assert.equal(written.coherence.fallback,true)
})

test('a prefix mismatch logs a count and sends retry, full checked delta and done, ignoring late previews',async()=>{
  const first='The housing report found planning rules slowed approvals.',full='The housing report recommended simpler planning rules.'
  const wire=frame('research_sentences',{})+frame('research_sentence',{text:first})+frame('done',payload(full))+frame('research_sentence',{text:'Late text.'})
  const logs=[],original=console.log
  console.log=v=>logs.push(JSON.parse(v))
  let events
  try{events=decode(await(await api.withAnswerLanguage(new Response(wire,{headers:{'content-type':'text/event-stream'}}),question)).text())}finally{console.log=original}
  assert.deepEqual(events.map(e=>e.event),['delta','retry','delta','done'])
  assert.equal(events.at(-2).data.text,events.at(-1).data.answer)
  assert.equal(events.at(-1).data.answer,full)
  assert.deepEqual(logs,[{kind:'research_loop_stream_reset',reason:'checked_prefix_changed',count:1,released_chars:first.length,answer_chars:full.length},{kind:'research_loop_stream_complete',count:1,retries:1,preview_chars:first.length,answer_chars:full.length}])
  const deltas=[],stream=api.researchSentenceStream(question,async text=>deltas.push(text))
  stream.close();await stream.preview(payload(first));assert.deepEqual(deltas,[])
})

test('who lead: a recovered source sentence, a title and surname, or Cabinet while a named subject is available stay held',async()=>{
  const cabinet='The Example Inquiry found the Example scheme was approved by Cabinet.',minister='The Example Inquiry found Minister Jane Example misled Cabinet about the Example scheme.'
  const surname='The Example Inquiry found Mr Example approved the Example scheme.',spoke='Robin Example spoke about the Example scheme in the Senate.'
  const relayed=spokenSource('debate','The Example Inquiry found Minister Jane Example approved the Example scheme.')
  const cases=[
    {name:'recovered source sentence',first:spoke,sources:[relayed],resource:'debate'},
    {name:'title and surname',first:surname,sources:[whoSource('inquiry',surname)],resource:'inquiry'},
    {name:'Cabinet with a minister available',first:cabinet,sources:[whoSource('inquiry',cabinet),whoSource('chapter',minister)],resource:'inquiry'},
    {name:'a subject without finding language',first:'Minister Jane Example approved the Example scheme in 2015.',sources:[whoSource('inquiry','Minister Jane Example approved the Example scheme in 2015.')],resource:'inquiry'},
  ]
  for(const c of cases){
    const deltas=[],stream=api.researchSentenceStream(who,async text=>deltas.push(text))
    const opening=payload(c.first,c.sources.slice(0,1),cite(c.resource,c.first))
    await stream.preview(withBasis(opening,c.sources))
    assert.deepEqual(deltas,[],c.name)
    const full=payload(c.first+'\n\nThe Example scheme ended in 2020.',c.sources.slice(0,1),cite(c.resource,c.first))
    await stream.preview(withBasis(full,c.sources))
    assert.deepEqual(deltas,[],c.name)
    const {events,done,plain,client}=await whoFinish(who,deltas,full)
    assert.equal(events.some(e=>e.event==='retry'),false,c.name)
    assert.equal(client,done.answer,c.name)
    assert.equal(done.answer,plain.answer,c.name)
  }
  // Cabinet leads once no source names anyone else.
  const deltas=[],stream=api.researchSentenceStream(who,async text=>deltas.push(text)),record=whoSource('inquiry',cabinet)
  await stream.preview(withBasis(payload(cabinet,[record],cite('inquiry',cabinet)),[record]))
  assert.equal(deltas.join(''),cabinet)
  // A top-ranked opening that the who lead would still rewrite (a passive approval) is not settled as written.
  const passive='The Example Inquiry found that the scheme was unlawful, approved by Cabinet and continued for years.',source=whoSource('inquiry',passive)
  const basis=api.whoBasis([{kind:'record',texts:[passive,source.title]}]),written=payload(passive,[source],cite('inquiry',passive))
  assert.notEqual(api.leadWithWho(written,who).answer,passive)
  assert.equal(api.settledWhoLead(written,who,basis),false)
  assert.equal(api.settledWhoLead(api.leadWithWho(written,who),who,basis),true)
})

test('who lead has no released-prefix exemption: a released lead the who order replaces takes retry, then the full answer and done',async()=>{
  const speech=spokenSource('debate','The Example Inquiry found Minister Jane Example approved the Example scheme.'),record=whoSource('inquiry',supported)
  const full=payload(relayedSubject+'\n\n'+supported,[speech,record],{...cite('debate',relayedSubject),...cite('inquiry',supported,relayedSubject.length+2)})
  assert.ok(api.groundAnswerPayload({...full,research:{mode:'loop'}},who,relayedSubject).answer.startsWith(supported),'grounding keeps the who order after release')
  const {events,done,plain,client}=await whoFinish(who,[relayedSubject],full)
  assert.deepEqual(events.map(e=>e.event),['delta','retry','delta','done'])
  assert.equal(client,done.answer)
  assert.equal(done.answer,plain.answer)
  assert.ok(done.answer.startsWith(supported))
})

test('person overview streams its checked points while only appended source excerpts stay held',async()=>{
  const deltas=[],q='What has Jane Example said about housing?',stream=api.researchSentenceStream(q,async text=>deltas.push(text))
  const first='Jane Example called for simpler housing approvals.',second='Jane Example also called for more public housing.'
  const sources=[source('one',first,{kind:'speech',speaker:'Jane Example',slug:'speech-1',date:'2024-02-01'}),source('two','Jane Example said housing approvals need better planning.',{kind:'speech',speaker:'Jane Example',slug:'speech-2',date:'2024-03-01',cited:false})]
  const one={...payload(first,sources,{'one/t/body/0':[[0,first.length]]}),answer_scope:{people:['Jane Example']}}
  await stream.preview(one)
  assert.equal(deltas.join(''),first)
  const full={...one,answer:first+'\n'+second,research:{mode:'loop'}}
  await stream.preview(full)
  assert.equal(deltas.join(''),full.answer,'source excerpts must not be inserted before the remaining model points')
  const wire=frame('research_sentences',{})+deltas.map(text=>frame('research_sentence',{text})).join('')+frame('done',full)
  const events=decode(await(await api.withAnswerLanguage(new Response(wire,{headers:{'content-type':'text/event-stream'}}),q)).text())
  assert.equal(events.some(e=>e.event==='retry'),false)
  assert.equal(events.filter(e=>e.event==='delta').map(e=>e.data.text).join(''),events.at(-1).data.answer)
  assert.ok(events.at(-1).data.answer.includes('On 1 March 2024, Jane Example said'))
})

test('receipt and required-headline drafts stay held, and provider failure retains the old facts fallback',async()=>{
  const cases=[
    {question,period:{kind:'all',label:''},facts:[{id:1,text:'Example Holdings provided funding to Labor.',source:receipt('money','Labor')}]},
    {question:'Who is the highest paid politician in 2005?',period:api.inferPeriod('in 2005'),first:'In 2005 Robin Example was the highest paid politician, with an annual salary entitlement of $288,990.',facts:[
      {id:1,text:'Robin Example: $277,602 a year as Prime Minister, 2005-01-01 to 2005-06-30; base $106,770 plus 160%.',source:source('salary-1','Robin Example: $277,602 a year as Prime Minister, 2005-01-01 to 2005-06-30; base $106,770 plus 160%.')},
      {id:2,text:'Robin Example: $288,990 a year as Prime Minister, 2005-07-01 to 2005-12-31; base $111,150 plus 160%.',source:source('salary-2','Robin Example: $288,990 a year as Prime Minister, 2005-07-01 to 2005-12-31; base $111,150 plus 160%.')},
    ]},
  ]
  for(const input of cases){
    const gate=deferred(),waiting=deferred(),deltas=[]
    let raw=''
    const model=scriptedResearchModel([{text:{answer_decision:'answer',sentences:[{text:input.first??'The housing report found planning rules slowed approvals.',facts:input.facts.map(f=>f.id)},{text:'TAIL_WAIT unfinished text.',facts:[1]}]}}],{onPiece:async piece=>{raw+=piece;if(raw.includes('TAIL_WAIT')){waiting.resolve();await gate.promise;throw Error('provider disconnected')}}})
    const stream=api.researchSentenceStream(input.question,async text=>deltas.push(text)),write=api.createAnswerWriter(budgetOptions(model))
    const writing=write(input,{rounds:1,tokens:{input:0,output:0}},undefined,3000,stream.preview)
    try{await waiting.promise;await new Promise(r=>setTimeout(r,10));assert.deepEqual(deltas,[])}finally{gate.resolve()}
    const done=await writing
    assert.equal(model.calls.length,1)
    const expected=api.groundAnswerPayload(api.proseFallback(input),input.question)
    assert.equal(done.answer,expected.answer)
  }
})

test('P1-3: the outer writer deadline retains its checked prefix and blocks detached previews',async()=>{
  const first='The housing report found planning rules slowed approvals.',deltas=[]
  const recorded='The housing report recorded delays across several councils.'
  const qa=payload(recorded,[source('housing',recorded)],{'housing/t/body/0':[[0,recorded.length]]})
  const written=payload(first,qa.sources,{'housing/t/body/0':[[0,first.length]]})
  const stream=api.researchSentenceStream(question,async text=>deltas.push(text)),progress=async()=>{}
  progress.answer=stream.preview
  let late
  const research=Object.assign(async()=>({rounds:1,steps:[],results:[],selected:[],tokens:{input:0,output:0},qualitative:qa}),{
    writingWallMs:1000,
    write:async(_input,_stats,_signal,_ms,preview)=>{
      await preview(written)
      late=()=>preview(payload(first+'\n\nThe report recommended simpler planning rules.'))
      return new Promise(()=>{}) // A provider or cleanup task ignoring cancellation cannot replace released text.
    },
  })
  const run=await api.runAgentic(question,{asset:async()=>null,kb:async()=>({}),generate:async()=>{throw Error('planner must not run')},research},progress,40_000,api.inferPeriod(question),{},emptyScope)
  assert.equal(run.answer,deltas.join(''))
  assert.equal(run.answer,first)
  await late()
  assert.deepEqual(deltas,[first])
})

test('eligible loop points stream before the answer arguments finish, with no extra model turn',async()=>{
  const first='The housing report found planning rules slowed approvals.',second='The report recommended simpler planning rules.'
  const gate=deferred(),heard=deferred(),deltas=[]
  let raw=''
  const model=scriptedResearchModel([{tool_calls:[call('search',{query:'housing report'},'search')]},{tool_calls:[call('answer',{points:[{claim:first},{claim:second}]},'answer')]}],{
    onPiece:async piece=>{raw+=piece;if(raw.includes('recommended'))await gate.promise},
  })
  const progress=async()=>{},stream=api.researchSentenceStream(question,async text=>{deltas.push(text);heard.resolve()})
  progress.answer=stream.preview
  const research=Object.assign(api.createResearch(budgetOptions(model)),{write:undefined})
  const running=api.runAgentic(question,{asset:async()=>null,kb:async()=>({resources:{},fulltext:{total:0,facets:{}}}),generate:async()=>{throw Error('planner must not run')},research},progress,40_000,api.inferPeriod(question),{},emptyScope)
  try{
    await Promise.race([heard.promise,new Promise((_,reject)=>setTimeout(()=>reject(Error('loop points stayed held until acceptance')),1000))])
    assert.equal(deltas.join(''),first)
  }finally{gate.resolve()}
  const run=await running
  assert.equal(model.calls.length,2)
  assert.equal(api.checkedAnswerPayload({...run.qualitative,research:{mode:'loop'}},question,false,stream.released).answer,deltas.join(''))
})

test('who loop points naming someone stream their settled finding, with no "do not name" line, before the answer arguments finish',async()=>{
  const q='Who was responsible for the housing delays?',first='The housing report found Scott Morrison was told planning rules slowed approvals.',second='The report recommended simpler planning rules.'
  const gate=deferred(),heard=deferred(),deltas=[]
  let raw=''
  const model=scriptedResearchModel([{tool_calls:[call('search',{query:'housing report'},'search')]},{tool_calls:[call('answer',{points:[{claim:first},{claim:second}]},'answer')]}],{
    onPiece:async piece=>{raw+=piece;if(raw.includes('recommended'))await gate.promise},
  })
  const progress=async()=>{},stream=api.researchSentenceStream(q,async text=>{deltas.push(text);heard.resolve()})
  progress.answer=stream.preview
  const research=Object.assign(api.createResearch(budgetOptions(model)),{write:undefined})
  const running=api.runAgentic(q,{asset:async()=>null,kb:async()=>({resources:{},fulltext:{total:0,facets:{}}}),generate:async()=>{throw Error('planner must not run')},research},progress,40_000,api.inferPeriod(q),{},emptyScope)
  try{
    await Promise.race([heard.promise,new Promise((_,reject)=>setTimeout(()=>reject(Error('the who lead stayed held without the loop source summary')),1000))])
    assert.equal(deltas.join(''),first)
  }finally{gate.resolve()}
  const run=await running
  assert.equal(model.calls.length,2)
  assert.equal(api.checkedAnswerPayload({...run.qualitative,research:{mode:'loop'}},q,false,stream.released).answer,deltas.join(''))
})

test('the composed writer passes its facts to the who lead, so a Cabinet record lead streams when no one else is named',async()=>{
  const lead='The Example Inquiry found the Example scheme was approved by Cabinet.',later='The Example scheme ended in 2020.'
  const record=whoSource('inquiry',lead+' '+later),full=payload(lead+'\n\n'+later,[record],{...cite('inquiry',lead),...cite('inquiry',later,lead.length+2)})
  const deltas=[],progress=async()=>{},stream=api.researchSentenceStream(who,async text=>deltas.push(text))
  progress.answer=stream.preview
  const research=Object.assign(async()=>({rounds:1,steps:[],results:[],selected:[],tokens:{input:0,output:0},qualitative:full}),{
    writingWallMs:8000,write:async(_input,_stats,_signal,_ms,preview)=>{await preview({...full,answer:lead,citations:cite('inquiry',lead)});return full},
  })
  const run=await api.runAgentic(who,{asset:async()=>null,kb:async()=>({}),generate:async()=>{throw Error('planner must not run')},research},progress,40_000,api.inferPeriod(who),{},emptyScope)
  assert.equal(deltas.join(''),lead)
  assert.ok(run.answer.startsWith(lead))
})

const threeSentences=['The housing report found planning rules slowed approvals.','The report recommended simpler planning rules.','The report also said councils needed more staff to process applications.']
test('writer check exceptions on the first or second preview stop previews, while all three sentences finish',async t=>{
  const logs=[];t.mock.method(console,'log',v=>logs.push(JSON.parse(v)))
  const input={question,period:{kind:'all',label:''},facts:[{id:1,text:threeSentences.join(' '),source:source('housing',threeSentences.join(' '))}]}
  const script=[{text:{answer_decision:'answer',sentences:threeSentences.map(text=>({text,facts:[1]}))}}]
  const baseline=await api.createAnswerWriter(budgetOptions(scriptedResearchModel(script)))(input,{rounds:1,tokens:{input:0,output:0}},undefined,8000)
  for(const throwAt of [1,2]){
    let checks=0
    const model=scriptedResearchModel(script),stream=api.researchSentenceStream(question,async()=>{})
    const preview=async(p,accept)=>{if(++checks===throwAt)throw TypeError('partial check failed');return stream.preview(p,accept)}
    const out=await api.createAnswerWriter(budgetOptions(model))(input,{rounds:1,tokens:{input:0,output:0}},undefined,8000,preview)
    assert.equal(out.answer,baseline.answer)
    assert.equal(out.coherence?.fallback,undefined)
    assert.equal(checks,throwAt)
    assert.equal(model.calls.length,1)
  }
  assert.deepEqual(logs,[1,2].map(()=>({kind:'research_loop_preview_error',stage:'writer',count:1})))
})

test('loop check exceptions on the first or second preview cannot reject the answer or pay the planner',async t=>{
  const logs=[];t.mock.method(console,'log',v=>logs.push(JSON.parse(v)))
  for(const throwAt of [1,2]){
    let checks=0,plans=0
    const model=scriptedResearchModel([{tool_calls:[call('search',{query:'housing report'},'search')]},{tool_calls:[call('answer',{points:threeSentences.map(claim=>({claim}))},'answer')]}],{tokensPerSecond:400})
    const stream=api.researchSentenceStream(question,async()=>{}),progress=async()=>{}
    progress.answer=async p=>{if(++checks===throwAt)throw TypeError('partial check failed');return stream.preview(p)}
    const research=Object.assign(api.createResearch(budgetOptions(model)),{write:undefined})
    const run=await api.runAgentic(question,{asset:async()=>null,kb:async()=>({resources:{},fulltext:{total:0,facets:{}}}),generate:async()=>{plans++;throw Error('planner must not run')},research},progress,40_000,api.inferPeriod(question),{},emptyScope)
    assert.equal(checks,throwAt)
    assert.equal(plans,0)
    assert.equal(model.calls.length,2)
    assert.equal(run.research.mode,'loop')
    assert.equal(run.research_failure,undefined)
    for(const sentence of threeSentences)assert.ok(run.answer.includes(sentence))
  }
  assert.deepEqual(logs,[1,2].map(()=>({kind:'research_loop_preview_error',stage:'loop',count:1})))
})

test('composed writer preview exceptions cannot interrupt writeRun or change its completed answer',async t=>{
  const logs=[];t.mock.method(console,'log',v=>logs.push(JSON.parse(v)))
  const full=payload(threeSentences.join('\n\n'),[source('housing',threeSentences.join(' '))])
  for(const throwAt of [1,2]){
    let checks=0
    const progress=async()=>{}
    progress.answer=async p=>{if(++checks===throwAt)throw TypeError('partial check failed');return p}
    const research=Object.assign(async()=>({rounds:1,steps:[],results:[],selected:[],tokens:{input:0,output:0},qualitative:full}),{
      writingWallMs:8000,write:async(_input,_stats,_signal,_ms,preview)=>{
        for(let i=1;i<=3;i++)await preview({...full,answer:threeSentences.slice(0,i).join('\n\n')})
        return full
      },
    })
    const run=await api.runAgentic(question,{asset:async()=>null,kb:async()=>({}),generate:async()=>{throw Error('planner must not run')},research},progress,40_000,api.inferPeriod(question),{},emptyScope)
    assert.equal(checks,throwAt)
    assert.equal(run.answer,full.answer)
  }
  assert.deepEqual(logs,[1,2].map(()=>({kind:'research_loop_preview_error',stage:'compose',count:1})))
})

test('planner retry clears the released prefix and held deltas before its checked completion',async t=>{
  const logs=[];t.mock.method(console,'log',v=>logs.push(JSON.parse(v)))
  const first='The housing report found planning rules slowed approvals.',final='The housing report recommended simpler planning rules.'
  const wire=frame('research_sentences',{})+frame('research_sentence',{text:first})+frame('delta',{text:'Discarded planner attempt.'})+frame('retry',{reason:'slow'})+frame('delta',{text:final})+frame('done',payload(final))
  const events=decode(await(await api.withAnswerLanguage(new Response(wire,{headers:{'content-type':'text/event-stream'}}),question)).text())
  assert.deepEqual(events.map(e=>e.event),['delta','retry','delta','done'])
  assert.equal(events.at(-2).data.text,final)
  assert.equal(events.at(-1).data.answer,final)
  assert.deepEqual(logs,[{kind:'research_loop_stream_complete',count:1,retries:1,preview_chars:first.length,answer_chars:final.length}])
})

const previewSelection={inFlight:0,introductions:false,hearing:false,recordFacts:0,billSpeech:false,passageKinds:['speech','bill']}
for(const [name,held] of [
  ['non-speech/bill passages',{passageKinds:['speech','report']}],
  ['lookups in flight',{inFlight:1}],
  ['hearing selections',{hearing:true}],
  ['bill-speech without a speech',{billSpeech:true,passageKinds:['bill']}],
])test(`pre-acceptance selection gate holds ${name}`,()=>{
  assert.equal(api.canPreviewResearchSelection(previewSelection),true)
  assert.equal(api.canPreviewResearchSelection({...previewSelection,...held}),false)
})

async function loopPreviewRun(model,{options={},preview,question:q=question}={}){
  const deltas=[],stream=api.researchSentenceStream(q,async text=>deltas.push(text)),progress=async()=>{}
  if(preview!==false)progress.answer=async p=>{await stream.preview(p);await preview?.(p,stream.released)}
  const research=Object.assign(api.createResearch({...budgetOptions(model),...options}),{write:undefined})
  const run=await api.runAgentic(q,{asset:async()=>null,kb:async()=>({resources:{},fulltext:{total:0,facets:{}}}),generate:async()=>{throw Error('planner must not run')},research},progress,40_000,api.inferPeriod(q),{},emptyScope)
  stream.close()
  const full={...run.qualitative,research:{mode:'loop'}}
  const events=decode(await(await api.withAnswerLanguage(new Response(frame('research_sentences',{})+deltas.map(text=>frame('research_sentence',{text})).join('')+frame('done',full),{headers:{'content-type':'text/event-stream'}}),q)).text())
  assert.equal(events.some(e=>e.event==='retry'),false)
  assert.equal(events.filter(e=>e.event==='delta').map(e=>e.data.text).join(''),events.at(-1).data.answer)
  return {run,events,deltas}
}
const pointScript=points=>[{tool_calls:[call('search',{query:'housing report'},'s')]},{tool_calls:[call('answer',{points},'a')]}]

test('per-point schema holds an invalid record before execution',async()=>{
  const previews=[]
  const points=threeSentences.map(claim=>({claim}));points[1].extra='not in the schema'
  const model=scriptedResearchModel(pointScript(points))
  await loopPreviewRun(model,{preview:p=>previews.push(p.answer)})
  assert.equal(previews.length,2,'invalid records cannot enter the preview checker; the accepted full answer may publish')
  assert.ok(previews[0].includes(threeSentences[0]));assert.ok(!previews[0].includes(threeSentences[1]))
  assert.ok(previews[1].includes(threeSentences[2]))
})

test('preview checking restores the tally before usage reporting and the final selected points',async()=>{
  const points=threeSentences.map(claim=>({claim})),script=pointScript(points)
  const baseline=await loopPreviewRun(scriptedResearchModel(script),{preview:false})
  const streamed=await loopPreviewRun(scriptedResearchModel(script))
  assert.deepEqual(streamed.run.research.answer_stats,baseline.run.research.answer_stats)
  assert.deepEqual(streamed.run.qualitative,baseline.run.qualitative)
  assert.equal(streamed.run.research.answer_stats.points_in,3)
  const observed=[]
  await loopPreviewRun(interruptedLoopModel(),{options:{onUsage:stats=>observed.push(stats.answer&&structuredClone(stats.answer))}})
  assert.deepEqual(observed.slice(0,2),[undefined,undefined],'preview tallies must not leak into call-completion telemetry')
})

// Leave two complete records followed by an incomplete third. No final tool-call event reaches execute.
function interruptedLoopModel(wall=false,points=threeSentences.map(claim=>({claim}))){
  const model=scriptedResearchModel(pointScript(points)),original=model.doStream.bind(model)
  model.doStream=async options=>{
    if(model.calls.length!==1)return original(options)
    model.calls.push(options)
    const json=JSON.stringify({points}),cut=json.slice(0,json.indexOf(points.at(-1).claim)+12)
    return {stream:new ReadableStream({start(c){
      c.enqueue({type:'stream-start',warnings:[]});c.enqueue({type:'tool-input-start',id:'a',toolName:'answer'})
      for(let i=0;i<cut.length;i+=4)c.enqueue({type:'tool-input-delta',id:'a',delta:cut.slice(i,i+4)})
      if(wall){options.abortSignal.addEventListener('abort',()=>c.error(options.abortSignal.reason),{once:true});return}
      c.enqueue({type:'finish',finishReason:{unified:'length',raw:'length'},usage:{inputTokens:{total:900,noCache:900,cacheRead:0,cacheWrite:0},outputTokens:{total:1800,text:1800,reasoning:0}}});c.close()
    }})}
  }
  return model
}
for(const wall of [true,false])test(`${wall?'research wall':'output cap'} mid-answer salvages checked pending points without retry or another model call`,async t=>{
  t.mock.method(console,'error',()=>{})
  if(wall){const timer=setTimeout;t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>timer(fn,ms>15_000&&ms<=16_000?150:ms,...args))}
  const model=interruptedLoopModel(wall),{run,deltas}=await loopPreviewRun(model,{options:{wallMs:20_000}})
  assert.equal(model.calls.length,2)
  assert.ok(deltas.length>0,'this regression requires a released prefix')
  assert.equal(api.checkedAnswerPayload({...run.qualitative,research:{mode:'loop'}},question).answer,threeSentences.slice(0,2).join('\n'))
  assert.equal(run.research.answer_stats.salvaged,wall?'timeout':'malformed_args')
})

test('an answer starting inside the last six seconds holds all points until acceptance',async()=>{
  const counts=[]
  await loopPreviewRun(scriptedResearchModel(pointScript(threeSentences.map(claim=>({claim})))),{options:{wallMs:10_000},preview:p=>counts.push(p.answer)})
  assert.deepEqual(counts,[])
})

test('only the first answer call in one step can preview',async()=>{
  const script=pointScript(threeSentences.slice(0,2).map(claim=>({claim})))
  script[1].tool_calls.push(call('answer',{points:threeSentences.map(claim=>({claim}))},'second'))
  let previews=0,raw='',beforeSecondCompletes
  const model=scriptedResearchModel(script,{tokensPerSecond:4000,onPiece:async(piece,last)=>{raw+=piece;if(last&&raw.includes('more staff')){await new Promise(r=>setTimeout(r,20));beforeSecondCompletes=previews}}})
  await loopPreviewRun(model,{preview:()=>{previews++}})
  assert.equal(beforeSecondCompletes,2,'the second call must not preview its third point')
})

test('case-variant duplicates preserve the first wording and merge every retrieved citation',async()=>{
  const first='The housing report found planning rules slowed approvals.',later=first.replace('housing','Housing'),id='a/t/body/0',other='b/t/body/0'
  const passage=(id,resource)=>({id,resource,slug:'',title:'Housing report',url:'https://example.org/'+resource,text:first,kind:'speech',speaker:'Robin Example',chamber:'senate'})
  const passages=new Map([[id,passage(id,'a')],[other,passage(other,'b')]])
  const out=api.verifyResearchPoints([{claim:first},{claim:later,id},{claim:later,id:other}],passages,question,emptyScope)
  assert.equal(out.answer,'- '+first)
  assert.deepEqual(Object.keys(out.citations).sort(),[id,other])
  assert.deepEqual(out.citations[id],out.citations[other])
  assert.equal(out.sources.length,2)
  const stream=api.researchSentenceStream(question,async()=>{})
  await stream.preview(payload(first))
  assert.equal(api.checkedAnswerPayload({...out,research:{mode:'loop'}},question,false,stream.released).answer,'Robin Example told the Senate that the housing report found planning rules slowed approvals.')
})

test('removing a later repeated figure retains earlier lines, citations and the released prefix',async()=>{
  const points=[{claim:threeSentences[0]},{claim:'Housing had $1.7 billion in programme funding.'},{claim:threeSentences[1]},{claim:'Housing was found to have $1.7 billion in programme funding.'}]
  const {events}=await loopPreviewRun(scriptedResearchModel(pointScript(points)))
  assert.equal(events.at(-1).data.answer,points.slice(0,3).map(p=>p.claim).join('\n'))
})

test('deadline and disconnected-reader sends disable preview without logging a check error',async t=>{
  const logs=[];t.mock.method(console,'log',v=>logs.push(JSON.parse(v)))
  for(const name of ['AbortError','TimeoutError']){
    const guard=api.researchPreviewGuard('loop');let calls=0
    await guard(()=>{calls++;throw new DOMException('send stopped',name)})
    await guard(()=>{calls++})
    assert.equal(calls,1)
  }
  assert.deepEqual(logs,[])
})


for(const truncated of [false,true])test(`a late speech citation upgrade ${truncated?'salvages':'completes'} with normal attribution and retry`,async t=>{
  t.mock.method(console,'error',()=>{})
  const first='The housing report found planning rules slowed approvals.',id='r1/t/body/0'
  const evidence='Robin Example said the housing report found planning rules slowed approvals and recommended simpler rules.'
  const points=[{claim:first},{claim:first.replace('housing','Housing'),id,quote:'housing report found planning rules slowed approvals'},{claim:'UNCHECKED SENTINEL must never escape.'}]
  const model=truncated?interruptedLoopModel(false,points):scriptedResearchModel(pointScript(points.slice(0,2)))
  const deltas=[],stream=api.researchSentenceStream(question,async text=>deltas.push(text)),progress=async()=>{}
  progress.answer=stream.preview
  const research=Object.assign(api.createResearch({...budgetOptions(model),readRecord:async()=>({text:evidence,speaker:'Robin Example',labels:{kind:'speech',chamber:'senate'},metadata:{date:'2024-02-01'}})}),{write:undefined})
  const kb=async()=>({resources:{r1:{slug:'housing-debate',title:'Housing debate',origin:{created:'2024-02-01',collaborators:['Robin Example']},fields:{body:{paragraphs:{[id]:{text:evidence}}}}}},fulltext:{total:1,facets:{}}})
  const run=await api.runAgentic(question,{asset:async()=>null,kb,generate:async()=>{throw Error('planner must not run')},research},progress,40_000,api.inferPeriod(question),{},emptyScope)
  stream.close()
  assert.equal(deltas[0],first,'the uncited sentence must have been released before its citation upgrade')
  const payload=api.agenticAskPayload(run,question),normal=api.checkedAnswerPayload(payload,question)
  const final=api.groundAnswerPayload(payload,question,stream.released)
  const wire=frame('research_sentences',{})+deltas.map(text=>frame('research_sentence',{text})).join('')+frame('done',final)
  const events=decode(await(await api.withAnswerLanguage(new Response(wire,{headers:{'content-type':'text/event-stream'}}),question)).text())
  assert.deepEqual(events.map(e=>e.event),['delta','retry','delta','done'])
  const done=events.at(-1).data
  assert.equal(done.answer,'Robin Example told the Senate on 1 February 2024 that the housing report found planning rules slowed approvals.')
  assert.equal(done.answer,normal.answer,'recovery must apply the normal shape and attribution checks')
  assert.equal(events.at(-2).data.text,done.answer)
  assert.doesNotMatch(done.answer,/UNCHECKED/)
  assert.deepEqual(done.citations,normal.citations)
  for(const ranges of Object.values(done.citations))for(const[a,b]of ranges)assert.ok(a>=0&&a<b&&b<=Array.from(done.answer).length)
  assert.equal(model.calls.length,2)
  // With a passage held the model may reply in text, so an answer call cut off by the output cap ends the turn without a
  // tool call (no_finish) rather than violating a required tool choice; the salvage is the same.
  assert.equal(run.research.answer_stats.salvaged,truncated?'no_finish':undefined)
})

for(const truncated of [false,true])test(`a call crossing into its last six seconds holds later previews but ${truncated?'salvages':'completes'} checked points`,async t=>{
  t.mock.method(console,'error',()=>{})
  const now=Date.now;let advance=0,raw=''
  t.mock.method(Date,'now',()=>now()+advance)
  const previews=[],first=threeSentences[0],second=threeSentences[1],firstReleased=deferred()
  const points=[{claim:first},{claim:second},...(truncated?[{claim:'UNCHECKED SENTINEL must never escape.'}]:[])]
  const model=scriptedResearchModel(pointScript(points),{tokensPerSecond:4000,onPiece:async piece=>{
    raw+=piece
    if(raw.includes('recommended')){await firstReleased.promise;advance=11000}
    if(truncated&&raw.includes('UNCHECKED'))throw Error('provider cut off mid-record')
  }})
  const out=await loopPreviewRun(model,{options:{wallMs:20_000},preview:(p,released)=>{previews.push({answer:p.answer,released});firstReleased.resolve()}})
  assert.equal(previews.length,1,'only the early first point may enter preview')
  assert.equal(previews[0].released,first)
  assert.ok(out.events.at(-1).data.answer.includes(second),'the later checked snapshot is retained for completion or salvage')
  assert.doesNotMatch(out.events.at(-1).data.answer,/UNCHECKED/)
  assert.equal(model.calls.length,2)
  assert.equal(out.run.research.answer_stats.salvaged,truncated?'error':undefined)
})

test('who lead: a cited source naming only a title and surname keeps a moved lead held, since later text can resolve that name',()=>{
  // Review case B1: a later sentence giving "member for Kooyong (Josh Frydenberg)" makes the earlier sentence a
  // supported candidate at the same rank, and it would then outrank the released lead.
  const short=whoSource('bill-b0','The Example Inquiry found Mr Frydenberg approved the Example scheme. The member for Kooyong was treasurer.','bill')
  const full=whoSource('bill-b1','The Example Inquiry found Minister Jane Example approved the Example scheme.','bill')
  const lead='The Example Inquiry found Minister Jane Example approved the Example scheme.',earlier='The Example Inquiry found Josh Frydenberg approved the Example scheme.'
  const p=payload(lead+'\n'+earlier,[short,full],{...cite('bill-b1',lead),...cite('bill-b0',earlier,lead.length+1)})
  assert.equal(api.settledWhoLead(p,who,{unnamed:false,subjects:true,record:false}),false)
  const plain=payload(lead,[full],cite('bill-b1',lead))
  assert.equal(api.settledWhoLead(plain,who,{unnamed:false,subjects:true,record:false}),true,'without the short name the lead is settled')
})

// Reply text (REPLY_ANSWER_RULE): the provider streams reply text token by token but delivers tool arguments in one piece,
// so a passage answer written as reply text is what reaches the reader early.
const replyResearch=(model,options={})=>{
  const id='r1/t/body/0',evidence='Robin Example said the housing report found planning rules slowed approvals and recommended simpler rules.'
  const research=Object.assign(api.createResearch({...budgetOptions(model),...options,readRecord:async()=>({text:evidence,speaker:'Robin Example',labels:{kind:'speech',chamber:'senate'},metadata:{date:'2024-02-01'}})}),{write:undefined})
  const kb=async()=>({resources:{r1:{slug:'housing-debate',title:'Housing debate',origin:{created:'2024-02-01',collaborators:['Robin Example']},fields:{body:{paragraphs:{[id]:{text:evidence}}}}}},fulltext:{total:1,facets:{}}})
  return {research,kb}
}
const choiceOf=c=>c.toolChoice?.type==='tool'?c.toolChoice.toolName:c.toolChoice?.type
for(const [forced,preface] of [[false,false],[true,false],[false,true]])test(`reply text: an answer object written as ${forced?'the forced last turn':preface?'reply text after a line about the research':'reply text'} streams its first checked point before the reply ends and passes the answer check`,async()=>{
  const first='The housing report found planning rules slowed approvals.',second='The report recommended simpler planning rules.'
  const gate=deferred(),heard=deferred(),deltas=[]
  let raw=''
  const object=JSON.stringify({points:[{claim:first},{claim:second}]})
  const text=preface?'I have enough verified passages from the debate.\n'+object:'```json\n'+object+'\n```'
  const model=scriptedResearchModel([{tool_calls:[call('search',{query:'housing report'},'s')]},{text}],{onPiece:async piece=>{raw+=piece;if(raw.includes('recommended'))await gate.promise}})
  const progress=async()=>{},stream=api.researchSentenceStream(question,async t=>{deltas.push(t);heard.resolve()})
  progress.answer=stream.preview
  // Two rounds make the second turn the last one, which is forced to answer.
  const {research,kb}=replyResearch(model,forced?{steps:2}:{})
  const running=api.runAgentic(question,{asset:async()=>null,kb,generate:async()=>{throw Error('planner must not run')},research},progress,40_000,api.inferPeriod(question),{},emptyScope)
  try{
    await Promise.race([heard.promise,new Promise((_,reject)=>setTimeout(()=>reject(Error('reply-text points stayed held until the reply ended')),1000))])
    assert.equal(deltas.join(''),first)
  }finally{gate.resolve()}
  const run=await running
  stream.close()
  assert.equal(model.calls.length,2,'no extra model turn')
  // A forced last turn can only reply; otherwise, with a passage held, the model may reply or call a tool.
  assert.deepEqual(model.calls.map(choiceOf),['required',forced?'none':'auto'])
  // The run never offers the answer tool, so the model writes the object as reply text; one tool list on every turn.
  const offered=c=>JSON.stringify((c.tools??[]).map(t=>t.name))
  assert.ok(!offered(model.calls[1]).includes('"answer"')&&offered(model.calls[1]).includes('"search"'))
  assert.equal(offered(model.calls[1]),offered(model.calls[0]))
  assert.equal(run.answered,true)
  assert.deepEqual(run.research.trail.map(s=>[s.tool,s.ok]),[['search',true],['answer',true]])
  assert.equal(run.research.answer_stats.salvaged,undefined)
  const done=api.checkedAnswerPayload({...api.agenticAskPayload(run,question)},question,false,stream.released)
  assert.ok(done.answer.startsWith(deltas.join('')),'the released point is the start of the checked answer')
  assert.ok(done.answer.includes(second))
})

test('reply text: a rejected answer object gets the answer tool\'s feedback in the same conversation, and the repaired reply answers',async()=>{
  const first='The housing report found planning rules slowed approvals.'
  const model=scriptedResearchModel([{tool_calls:[call('search',{query:'housing report'},'s')]},{text:JSON.stringify({facts:[99]})},{text:JSON.stringify({points:[{claim:first}]})}])
  const {research,kb}=replyResearch(model)
  const run=await api.runAgentic(question,{asset:async()=>null,kb,generate:async()=>{throw Error('planner must not run')},research},async()=>{},40_000,api.inferPeriod(question),{},emptyScope)
  assert.equal(model.calls.length,3)
  assert.equal(run.answered,true)
  assert.equal(run.answer.replace(/^- /,''),first,'the raw loop answer is a point list')
  assert.equal(run.research.rounds,3)
  assert.deepEqual(run.research.trail.map(s=>[s.tool,s.ok]),[['search',true],['answer',false],['answer',true]])
  // The repair turn continues the conversation: the earlier turns unchanged, then the rejected reply and its feedback.
  const [,second,third]=model.calls
  assert.deepEqual(third.prompt.slice(0,second.prompt.length),second.prompt)
  assert.match(JSON.stringify(third.prompt.at(-1)),/the answer was empty/)
  assert.deepEqual(model.calls.map(choiceOf),['required','auto','auto'])
})

test('reply text: a reply that only says what the model will look up next gets feedback, and research goes on',async()=>{
  const first='The housing report found planning rules slowed approvals.'
  const model=scriptedResearchModel([{tool_calls:[call('search',{query:'housing report'},'s')]},{text:'I will search the committee hearings next.'},{text:JSON.stringify({points:[{claim:first}]})}])
  const {research,kb}=replyResearch(model)
  const run=await api.runAgentic(question,{asset:async()=>null,kb,generate:async()=>{throw Error('planner must not run')},research},async()=>{},40_000,api.inferPeriod(question),{},emptyScope)
  assert.equal(model.calls.length,3,'one more research turn, no final answer call')
  assert.equal(run.answered,true)
  assert.equal(run.answer.replace(/^- /,''),first)
  assert.equal(run.research.answer_stats.salvaged,undefined)
  assert.match(JSON.stringify(model.calls[2].prompt.at(-1)),/no tool call and no answer object/)
  assert.deepEqual(model.calls[2].prompt.slice(0,model.calls[1].prompt.length),model.calls[1].prompt)
})

test('reply text: an answer tool call, though the tool is not offered, is still checked and answers',async()=>{
  const first='The housing report found planning rules slowed approvals.'
  const model=scriptedResearchModel([{tool_calls:[call('search',{query:'housing report'},'s')]},{tool_calls:[call('answer',{points:[{claim:first}]},'a')]}])
  const {research,kb}=replyResearch(model)
  const run=await api.runAgentic(question,{asset:async()=>null,kb,generate:async()=>{throw Error('planner must not run')},research},async()=>{},40_000,api.inferPeriod(question),{},emptyScope)
  assert.ok(!(model.calls[1].tools??[]).some(t=>t.name==='answer'))
  assert.equal(model.calls.length,2)
  assert.equal(run.answered,true)
  assert.equal(run.answer.replace(/^- /,''),first)
  assert.deepEqual(run.research.trail.map(s=>[s.tool,s.ok]),[['search',true],['answer',true]])
})

test('replyAnswer reads the answer object alone, fenced or after a line about the research, and nothing else',()=>{
  const object={points:[{claim:'A finding.'}],facts:[1]}
  for(const text of [JSON.stringify(object),'```json\n'+JSON.stringify(object)+'\n```','I have enough passages.\n'+JSON.stringify(object),'Done: '+JSON.stringify(object,null,1)])
    assert.deepEqual(api.replyAnswer(text),object,text)
  for(const text of ['The report found planning rules slowed approvals.','I will search again.','{"points":[{"claim":"cut off','{"query":"housing"}','[1,2]',''])
    assert.equal(api.replyAnswer(text),null,text)
})

test('a loop answer whose first point fails the old direct-lead test streams it at once, and done keeps that order',async()=>{
  const q='What happened to the Example Bill 2024?'
  const passages=[{id:'bill-1',resource:'bill-1',slug:'',title:'Example Bill 2024',text:'The Example Bill 2024 passed the Senate on 3 March 2024 after a second reading debate.',url:'https://example.org/bill',kind:'bill'},
    {id:'sp-1',resource:'sp-1',slug:'',title:'Second reading speech',text:'Senator Jane Example said the bill would cut red tape for small business owners across the country.',url:'https://example.org/sp',kind:'speech',speaker:'Jane Example',chamber:'senate',date:'2024-02-01'}]
  const points=[{claim:'The Example Bill 2024 passed the Senate on 3 March 2024.',id:'bill-1',quote:'passed the Senate on 3 March 2024 after a second reading debate'},
    {claim:'Jane Example told the Senate the bill would cut red tape for small business.',id:'sp-1',quote:'the bill would cut red tape for small business owners across the country'}]
  const full=api.verifyResearchPoints(points,new Map(passages.map(p=>[p.id,p])),q,{people:[],parties:[],bills:[],ambiguous:false,unresolved:false})
  const checked=api.checkedAnswerPayload({...full,research:{mode:'loop'}},q,true)
  assert.equal(api.stableResearchLead(checked,q),false,'the hold this answer used to wait on')
  const deltas=[],stream=api.researchSentenceStream(q,async text=>deltas.push(text))
  await stream.preview(full)
  assert.equal(deltas.join(''),checked.answer)
  const events=decode(await(await api.withAnswerLanguage(new Response(frame('research_sentences',{})+deltas.map(text=>frame('research_sentence',{text})).join('')+frame('done',{...full,research:{mode:'loop'}}),{headers:{'content-type':'text/event-stream'}}),q)).text())
  assert.equal(events.some(e=>e.event==='retry'),false)
  assert.ok(events.at(-1).data.answer.startsWith(points[0].claim))
})
