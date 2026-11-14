import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {scriptedResearchModel} from './fixtures/research-scripted-model.mjs'
import {sentenceSpans} from '../src/sentence-bounds.mjs'

const bundled=await build({stdin:{contents:"export * from './src/research-generation'; export * from './src/research-grounding'; export * from './src/research-sentences'; export * from './src/research-sentence-stream'; export * from './src/research-response'; export * from './src/research-writer'; export * from './src/research-evidence'; export * from './src/agentic-ask'; export * from './src/research-loop'; export {createResearchCreditCooldown} from './src/research-credit'; export {proseFallback} from './src/research-writing';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']})
const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'))
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

test('a promoted on-topic finding streams while its earlier context stays in the affected tail',async()=>{
  const q='Who was responsible for robodebt?',deltas=[]
  const stream=api.researchSentenceStream(q,async text=>deltas.push(text))
  const context='Robin Example said the government ignored warnings.',finding='The Royal Commission into Robodebt found the scheme was unlawful.'
  await stream.preview(payload(context))
  assert.deepEqual(deltas,[])
  await stream.preview(payload(context+'\n'+finding))
  assert.equal(deltas.join(''),finding)
  await stream.preview(payload(context+'\n'+finding+'\nThe report recommended changes.'))
  assert.equal(deltas.join(''),finding,'only the settled lead is released before completion')
})

test('duplicate removal restores legacy line breaks, resetting any affected released prefix',async()=>{
  const first='The housing report found planning rules slowed approvals.',second='The report recommended simpler planning rules.',deltas=[]
  const stream=api.researchSentenceStream(question,async text=>deltas.push(text))
  await stream.preview(payload(first));await stream.preview(payload(first+'\n'+second))
  const full={...payload(first+'\n'+second+'\n'+second),research:{mode:'loop'}}
  const wire=frame('research_sentences',{})+deltas.map(text=>frame('research_sentence',{text})).join('')+frame('done',full)
  const events=decode(await(await api.withAnswerLanguage(new Response(wire,{headers:{'content-type':'text/event-stream'}}),question)).text())
  assert.equal(events.filter(e=>e.event==='retry').length,1)
  assert.equal(events.at(-2).data.text,events.at(-1).data.answer)
  assert.equal(events.at(-1).data.answer,first+' '+second)
  assert.equal(api.normaliseWrittenPayload(full,question).answer,first+' '+second,'legacy fallback normalisation keeps its previous formatting')
  assert.equal((await(await api.withAnswerLanguage(Response.json(full),question)).json()).answer,first+' '+second,'fresh JSON uses the same legacy formatting')
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

test('P1-1: a later cited speaker cannot move the released bill lead',async()=>{
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
  const done=api.groundAnswerPayload({...full,research:{mode:'loop'}},q,stream.released)
  const wire=frame('research_sentences',{})+deltas.map(text=>frame('research_sentence',{text})).join('')+frame('done',done)
  const events=decode(await(await api.withAnswerLanguage(new Response(wire,{headers:{'content-type':'text/event-stream'}}),q)).text())
  assert.equal(events.some(e=>e.event==='retry'),false)
  assert.equal(events.filter(e=>e.event==='delta').map(e=>e.data.text).join(''),events.at(-1).data.answer)
  assert.ok(events.at(-1).data.answer.startsWith(points[0].claim))
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
  assert.deepEqual(logs,[{kind:'research_loop_stream_reset',reason:'checked_prefix_changed',count:1,released_chars:first.length,answer_chars:full.length},{kind:'research_loop_stream_complete',count:1,retries:1,preview_chars:0,answer_chars:full.length}])
  const deltas=[],stream=api.researchSentenceStream(question,async text=>deltas.push(text))
  stream.close();await stream.preview(payload(first));assert.deepEqual(deltas,[])
})

test('authority on-topic hold keeps an unrelated finding private until the requested finding arrives',async()=>{
  const q='Who was responsible for robodebt?',deltas=[],stream=api.researchSentenceStream(q,async text=>deltas.push(text))
  const context='Robin Example said the government ignored warnings.',unrelated='The NACC found officials mishandled a referral.',finding='The Royal Commission into Robodebt found the scheme was unlawful.'
  await stream.preview(payload(context+'\n'+unrelated))
  assert.deepEqual(deltas,[])
  await stream.preview(payload(context+'\n'+unrelated+'\n'+finding))
  assert.equal(deltas.join(''),finding)
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
  assert.deepEqual(logs,[{kind:'research_loop_stream_complete',count:1,retries:1,preview_chars:0,answer_chars:final.length}])
})
