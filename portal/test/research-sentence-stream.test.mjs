import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {scriptedResearchModel} from './fixtures/research-scripted-model.mjs'
import {sentenceSpans} from '../src/sentence-bounds.mjs'

const bundled=await build({stdin:{contents:"export * from './src/research-generation'; export * from './src/research-grounding'; export * from './src/research-sentences'; export * from './src/research-sentence-stream'; export * from './src/research-response'; export * from './src/research-writer';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']})
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
  }finally{gate.resolve()}
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

test('a later duplicate cannot reflow a released research prefix; fallback formatting stays unchanged',async()=>{
  const first='The housing report found planning rules slowed approvals.',second='The report recommended simpler planning rules.',deltas=[]
  const stream=api.researchSentenceStream(question,async text=>deltas.push(text))
  await stream.preview(payload(first));await stream.preview(payload(first+'\n'+second))
  const full={...payload(first+'\n'+second+'\n'+second),research:{mode:'loop'}}
  const wire=frame('research_sentences',{})+deltas.map(text=>frame('research_sentence',{text})).join('')+frame('done',full)
  const events=decode(await(await api.withAnswerLanguage(new Response(wire,{headers:{'content-type':'text/event-stream'}}),question)).text())
  assert.equal(events.filter(e=>e.event==='delta').map(e=>e.data.text).join(''),events.at(-1).data.answer)
  assert.equal(events.at(-1).data.answer,first+'\n'+second)
  assert.equal(api.normaliseWrittenPayload(full,question).answer,first+' '+second,'legacy fallback normalisation keeps its previous formatting')
})

test('changed cached quotations still release only the final checked payload',async()=>{
  const raw='The housing report found “planning rules slowed approvals”.'
  const final=payload(raw,[source('housing','The report considered planning delays.')],{'housing/t/body/0':[[0,raw.length]]})
  const wire=frame('delta',{text:raw})+frame('done',final)
  const events=decode(await(await api.withAnswerLanguage(new Response(wire,{headers:{'content-type':'text/event-stream','x-opax-cache':'HIT'}}),question)).text())
  assert.deepEqual(events.map(e=>e.event),['done'])
  assert.equal(events[0].data.answer,'The housing report found planning rules slowed approvals.')
})
