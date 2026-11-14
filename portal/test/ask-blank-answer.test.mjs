// A completed Ask never comes back with no answer (BACKLOG 2a-srv, 13 Nov 2026). PostHog, 10 to 12 Nov: 4 of 41
// completed app asks had blank answer text. Every route ends at one boundary (withAnswerLanguage → ensureAnswerText),
// which used to send an empty answer as answered: false whenever it had no passage to quote. Each way a run reached
// that state is driven here, through the real /api/ask route with a scripted model (no provider, no network) or
// through the boundary on the payload the route hands it. Each must give a non-empty answer with citations to listed
// sources, or the explicit no-record answer that names what was searched. Speakers, donors and titles are invented.
import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {StreamingResearchModel as MockLanguageModelV4} from './fixtures/research-scripted-model.mjs'
import {loadWorker,offline} from './worker-harness.mjs'
import {budgetDatabase} from './fixtures/research-budget.mjs'
import {AskStream} from './fixtures/research-app-decoders.mjs'

const restore=offline(),pending=[],ctx={waitUntil:p=>pending.push(p),passThroughOnException(){}}
const plugin={name:'scripted-model',setup(b){b.onResolve({filter:/^@openrouter\/ai-sdk-provider$/},()=>({path:'scripted',namespace:'ask-blank'}));b.onLoad({filter:/.*/,namespace:'ask-blank'},()=>({contents:'export const createOpenRouter=()=>()=>globalThis.__researchModel;',loader:'js'}))}}
const h=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,new URL('../public',import.meta.url).pathname,ctx,{plugins:[plugin]})
const daily=budgetDatabase()
Object.assign(h.env,{OPENROUTER_API_KEY:'test-only-placeholder',AGENTIC_ASK_MODE:'route',RESEARCH_LOOP:'route',AGENTIC_INPUT_USD_PER_MILLION:'0.66',AGENTIC_OUTPUT_USD_PER_MILLION:'1.98',
  COMMUNITY_DB:daily.db,ASK_LIMITER:{limit:async()=>({success:true})},MODEL_LIMITER:{limit:async()=>({success:true})}})
// Every store is recorded: the edge cache and the shared KV copy (generation-cache.ts).
const stored=[]
globalThis.caches={default:{match:async()=>undefined,put:async(key,response)=>{stored.push({where:'edge',url:String(key.url??key),body:await response.clone().text()})}}}
h.env.GENERATION_CACHE={get:async()=>null,put:async(key,value)=>{stored.push({where:'kv',url:key,body:value})}}
h.env.ASSETS={fetch:async req=>new URL(req.url).pathname==='/parliamentarians.json'?Response.json({people:[]}):new Response('Missing',{status:404})}

// Two retrieved speeches whose passages are too short to quote ("Hear, hear."): records found, nothing to excerpt.
const speech=(id,slug,title,speaker,date,text)=>[id.repeat(32),{slug,title,origin:{created:date+'T00:00:00Z',collaborators:[speaker]},extra:{metadata:{kind:'speech',date,speaker}},
  fields:{body:{paragraphs:{[`${id.repeat(32)}/t/body/0-${text.length}`]:{text,score:0.8,score_type:'VECTOR'}}}}}]
const unquotable=Object.fromEntries([speech('2','speech-920001','Housing Affordability','Jordan Sample','2024-03-20','Hear, hear.'),speech('3','speech-920002','Help to Buy Bill 2023: Second Reading','Alex Example','2024-02-08','I move.')])
// The knowledge box: research finds nothing; the ordinary path's generation (synchronous JSON or the NDJSON stream)
// writes nothing over whatever retrieval the case sets.
let retrieved={},generated={answer:'',citations:{}}
globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input)),headers=new Headers(init?.headers)
  assert.ok(url.hostname.startsWith('offline.'),`no network: ${url.href}`)
  if(!url.pathname.endsWith('/ask'))return Response.json({resources:{},fulltext:{total:0,facets:{}}})
  if(headers.get('x-synchronous')==='true')return Response.json({answer:generated.answer,citations:generated.citations,retrieval_results:{resources:retrieved}})
  const items=[{type:'retrieval',results:{resources:retrieved}},...(generated.answer?[{type:'answer',text:generated.answer},{type:'citations',citations:generated.citations}]:[]),{type:'status',code:'0'}]
  return new Response(items.map(item=>JSON.stringify({item})).join('\n')+'\n',{headers:{'content-type':'application/x-ndjson'}})
}
const usage={inputTokens:{total:900,noCache:900,cacheRead:0,cacheWrite:0},outputTokens:{total:120,text:120,reasoning:0}}
const calls=(...list)=>({content:list.map(([name,args],i)=>({type:'tool-call',toolName:name,toolCallId:`call-${i}`,input:JSON.stringify(args)})),finishReason:{unified:'tool-calls',raw:'tool_calls'},usage,warnings:[]})
const prose=text=>({content:[{type:'text',text}],finishReason:{unified:'stop',raw:'stop'},usage,warnings:[]})
const throws=()=>{throw new Error('provider unavailable')}
const question='What has the government done about housing affordability?'

const ask=async(turns,stream,{cache=false}={})=>{
  globalThis.__researchModel=new MockLanguageModelV4({doGenerate:turns})
  const realWarn=console.warn,realLog=console.log,realError=console.error;console.warn=console.log=console.error=()=>{}
  try{
    const response=await h.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json',...(cache?{}:{'x-opax-nocache':'1'})},body:JSON.stringify({question,kind:'speech'})})
    const raw=await response.text()
    while(pending.length)await Promise.all(pending.splice(0))
    if(!stream)return {status:response.status,body:JSON.parse(raw)}
    const parser=new AskStream({stage(){},delta(){},retry(){}});parser.push(raw,true)
    return {status:response.status,body:parser.result()}
  }finally{console.warn=realWarn;console.log=realLog;console.error=realError;daily.sqlite.exec('DELETE FROM research_daily_spend')}
}
const NO_RECORD=/^OPAX searched [^.]+ and found no record that answers this question\. Try asking again with a member, party, bill or year named, or ask about one part of the question at a time\.$/
/** A non-empty answer whose citations land inside it on listed sources, or else the explicit no-record answer. */
function shown(body,label,{cited}={}){
  assert.equal(typeof body.answer,'string',label);assert.ok(body.answer.trim(),`${label}: blank answer ${JSON.stringify(body).slice(0,300)}`)
  assert.notEqual(body.answered,false,label)
  const ranges=Object.entries(body.citations??{}),length=Array.from(body.answer).length
  if(cited===false){assert.match(body.answer,NO_RECORD,label);assert.equal(ranges.length,0,label);assert.equal(body.answer_decision,'limitation',label);return}
  assert.ok(ranges.length>0,`${label}: cited ${body.answer}`)
  for(const [id,spans] of ranges){
    for(const [a,b] of spans)assert.ok(Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&b>a&&b<=length,`${label}: ${id} ${a}-${b} inside the answer`)
    assert.ok((body.sources??[]).some(s=>s.cited===true&&id.startsWith(s.resource+'/')),`${label}: ${id} is a cited, listed source`)
  }
}
test.after(()=>{restore();daily.close()})

// Way 1 (most likely): the research loop fails (malformed or empty model turns, a provider error), the ordinary path's
// generation is blank twice over an empty retrieval, and no source row is left to quote.
for(const [name,turns] of [['empty model text',[calls(['search',{query:'housing affordability'}]),prose(''),prose(''),prose('')]],['provider errors',[throws,throws,throws]],['empty answer points',[calls(['search',{query:'housing'}]),calls(['answer',{points:[]}]),calls(['answer',{points:[]}]),calls(['answer',{points:[]}])]]])
  test(`route: research fails (${name}) and the fallback writes nothing over no records: the no-record answer, on JSON and stream`,async()=>{
    retrieved={}
    const json=await ask(turns,false),sse=await ask(turns,true)
    assert.equal(json.status,200);shown(json.body,'json',{cited:false});shown(sse.body,'stream',{cited:false})
    assert.equal(sse.body.answer,json.body.answer,'the stream ends with the same answer')
    if(name!=='provider errors')assert.match(json.body.answer,/^OPAX searched Hansard speeches and found/,'a search that ran is named')
  })

// Way 2: the fallback retrieved records but generated nothing, and none of their passages is long enough to quote.
test('route: retrieved records with no passage to quote are listed by title, speaker and date, each cited, on JSON and stream',async()=>{
  retrieved=unquotable
  try{
    const json=await ask([throws,throws,throws],false),sse=await ask([throws,throws,throws],true)
    for(const [label,body] of [['json',json.body],['stream',sse.body]]){
      shown(body,label)
      assert.equal(body.answer,'Here is what the record shows.\nJordan Sample, Housing Affordability, 20 March 2024.\nAlex Example, Help to Buy Bill 2023: Second Reading, 8 February 2024.',label)
      assert.deepEqual(Object.keys(body.citations).sort(),['2'.repeat(32)+'/t/body/0','3'.repeat(32)+'/t/body/0'],label)
    }
  }finally{retrieved={}}
})

// The boundary every route passes, on the payloads the other ways hand it.
const built=await build({stdin:{contents:"export {ensureAnswerText,withAnswerLanguage,RECORD_SUMMARY_LEAD,cacheableRoutedAnswer,cacheableAskAnswer} from './src/research-response';export {groundAnswerPayload} from './src/research-grounding';",resolveDir:new URL('../',import.meta.url).pathname,loader:'ts'},bundle:true,write:false,platform:'browser',format:'esm',logLevel:'silent'})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const boundary=async(payload,q=question)=>(await api.withAnswerLanguage(Response.json(payload),q)).json()
const fact={resource:'fact-1',slug:'',title:'Example Freight Pty Ltd',href:'https://opax.com.au/money/donor/example-freight',url:'https://opax.com.au/money/donor/example-freight',kind:'record',snippet:'Example Freight Pty Ltd: $2,681,740 in federal disclosed receipts in 2021-22.',cited:false}
const talk={resource:'2'.repeat(32),slug:'speech-920001',title:'Housing Affordability',href:'https://opax.com.au/doc/speech-920001',url:'https://opax.com.au/doc/speech-920001',kind:'speech',speaker:'Jordan Sample',date:'2024-03-20',snippet:'Hear, hear.',cited:false}
const receipt=(i,donor,party,period)=>({resource:'fact-'+i,slug:'',title:'Disclosed receipt',href:'https://opax.com.au/money/'+i,url:'https://opax.com.au/money/'+i,kind:'record',cited:true,
  snippet:`Disclosed receipt: ${donor} → ${party}, $50,000 in disclosed political receipts in ${period}.`,receipt:{source:donor,party,amount:50000,period}})

test('boundary: the money check removes every sentence over record facts; the cited fact rows are shown instead',async()=>{
  const answer='Beta Corp gave Example Party $50,000 in 2019-20.',q='Who gave Example Party $50,000 in 2019-20?'
  const payload={answer,answered:true,answer_decision:'answer',citations:{'fact-1/t/body/0':[[0,answer.length]],'fact-2/t/body/0':[[0,answer.length]]},sources:[receipt(1,'Gamma Ltd','Other Party','2015-16'),receipt(2,'Delta Ltd','Third Party','2012-13')]}
  assert.equal(api.groundAnswerPayload(payload,q).answer,'','the money check leaves nothing of this answer')
  const out=api.ensureAnswerText(api.groundAnswerPayload(payload,q),q)
  shown(out,'grounded then ensured');assert.match(out.answer,/Gamma Ltd → Other Party/)
})

test('boundary: writer facts outside the requested period; the limit line is followed by the facts found, cited',async()=>{
  const q='How much did Example Freight give in 2010?'
  const payload={answer:'',answered:true,answer_decision:'answer',citations:{},sources:[],research:{mode:'loop',rounds:2,trail:[{id:1,tool:'money_totals',round:1,label:'Totals',ms:1,ok:true}],sources:[],pre_writer_sources:[fact]}}
  const out=await boundary(payload,q)
  shown(out,'outside the period')
  assert.match(out.answer,/^OPAX cannot establish the requested answer for 2010-01-01 to 2010-12-31 from the selected records\.\n\nHere is what the record shows\.\nExample Freight Pty Ltd: \$2,681,740 in federal disclosed receipts in 2021-22\.$/)
})

test('boundary: record facts with no quotable passage (a money or pay tool row) are shown as the tool wrote them',async()=>{
  for(const q of [question,undefined]){
    const out=await boundary({answer:'',citations:{},sources:[fact]},q)
    shown(out,`fact rows ${q?'':'(no question)'}`);assert.match(out.answer,new RegExp('^'+api.RECORD_SUMMARY_LEAD.replace('.','\\.')+'\\n'))
    assert.deepEqual(out.sources.filter(s=>s.cited).map(s=>s.resource),['fact-1'])
  }
})

test('boundary: an evidence-only payload with blank text is written from its excerpts, cited',async()=>{
  const excerpt='The minister told the House that the housing accord would build new homes in every state over five years.'
  const out=await boundary({answer:'',answer_status:'evidence_only',evidence_excerpts:[{resource:talk.resource,text:excerpt}],citations:{},sources:[{...talk,snippet:''}]})
  shown(out,'evidence only');assert.match(out.answer,/Jordan Sample said “The minister told the House that the housing accord/)
  // Read as an ordinary cited answer: the web would otherwise print the quote as its notice and again as the card.
  assert.equal(out.answer_status,undefined);assert.equal(out.evidence_excerpts,undefined)
})

test('boundary: a typed limitation with blank text lists its records; a refusal with blank text is the no-record answer',async()=>{
  const limited=await boundary({answer:'',answer_decision:'limitation',citations:{},sources:[talk]})
  shown(limited,'limitation');assert.equal(limited.answer_decision,'limitation');assert.match(limited.answer,/Jordan Sample, Housing Affordability, 20 March 2024/)
  const refused=api.ensureAnswerText({answer:'',answer_decision:'refusal',citations:{},sources:[talk]},question)
  assert.match(refused.answer,NO_RECORD);assert.equal(refused.answer_decision,'refusal')
})

test('boundary: research sources with no source rows (a failed loop handed to the fallback) are listed, cited',async()=>{
  const out=await boundary({answer:'',citations:{},sources:[],research:{mode:'planner',rounds:1,trail:[{id:1,tool:'search',round:1,label:'Searching',ms:1,ok:true}],
    sources:[{title:'Housing Affordability',url:'https://opax.com.au/doc/speech-920001',kind:'speech',date:'2024-03-20',speaker:'Jordan Sample'}]}})
  shown(out,'research sources');assert.equal(out.answer,'Here is what the record shows.\nJordan Sample, Housing Affordability, 20 March 2024.')
  assert.equal(out.sources[0].resource,'research-1');assert.equal(out.sources[0].href,'https://opax.com.au/doc/speech-920001')
})

test('boundary: a streamed done event with blank text is filled before it reaches the reader; withheld deltas stay withheld',async()=>{
  const frames=['event: status\ndata: {"phase":"searching"}','event: delta\ndata: {"text":" "}','event: done\ndata: '+JSON.stringify({answer:'',citations:{},sources:[talk]})]
  const response=new Response(frames.join('\n\n')+'\n\n',{headers:{'content-type':'text/event-stream'}})
  const raw=await (await api.withAnswerLanguage(response,question)).text()
  const parser=new AskStream({stage(){},delta(){},retry(){}});parser.push(raw,true)
  shown(parser.result(),'stream done');assert.match(parser.result().answer,/Jordan Sample, Housing Affordability/)
})

test('boundary: nothing found anywhere names what was searched, from the research trail',async()=>{
  const trail=tools=>({mode:'loop',rounds:1,trail:tools.map((tool,id)=>({id,tool,round:1,label:tool,ms:1,ok:true})),sources:[]})
  const bare=await boundary({answer:'',citations:{},sources:[]})
  shown(bare,'bare',{cited:false});assert.match(bare.answer,/^OPAX searched Hansard speeches and OPAX’s public records and found/)
  const money=await boundary({answer:'',citations:{},sources:[],research:trail(['search','money_totals','member_votes'])})
  shown(money,'trail',{cited:false});assert.match(money.answer,/^OPAX searched Hansard speeches, donation and receipt records and recorded votes and found/)
  // Explicit non-answers (a voice caller's partial, an internal decline) and errors stay as sent.
  for(const payload of [{answered:false,reason:'partial',partial:true,answer:'',citations:{},sources:[]},{error:'The record is temporarily unavailable. Please try again.'}])
    assert.deepEqual(api.ensureAnswerText(payload,question),payload)
})

// The boundary's fallbacks are what a failed run had left: a week in the cache would replay them in place of a fresh
// try. Both store rules refuse them; the route stores run before the boundary writes them, and an answer is still kept.
const passage='Jordan Sample told the Senate the housing accord would build new homes in every state over the next five years.'
const pid=`${'4'.repeat(32)}/t/body/0-${passage.length}`
const answerable=Object.fromEntries([speech('4','speech-930001','Housing Accord','Jordan Sample','2024-05-14',passage)])
const answerText='Jordan Sample told the Senate the housing accord would build new homes in every state.'
for(const stream of [false,true])test(`cache (${stream?'stream':'JSON'}): neither fallback is stored for a week; an ordinary cited answer is`,async()=>{
  try{
    for(const [label,records,cited] of [['no record',{},false],['record summary',unquotable,true]]){
      retrieved=records;generated={answer:'',citations:{}};stored.length=0
      const run=await ask([throws,throws,throws],stream,{cache:true})
      shown(run.body,label,{cited});assert.ok(['no_record','record_summary'].includes(run.body.fallback),label)
      assert.deepEqual(stored,[],`${label}: nothing stored`)
    }
    retrieved=answerable;generated={answer:answerText,citations:{[pid]:[[0,Array.from(answerText).length]]}};stored.length=0
    const ordinary=await ask([throws,throws,throws],stream,{cache:true})
    shown(ordinary.body,'ordinary');assert.equal(ordinary.body.answer,answerText);assert.equal(ordinary.body.fallback,undefined)
    assert.ok(stored.some(s=>s.where==='edge'&&JSON.parse(s.body).answer===answerText),'the ordinary answer is stored')
  }finally{retrieved={};generated={answer:'',citations:{}};stored.length=0}
})

const cited={...talk,cited:true}
const fallbacks={
  'record summary':()=>api.ensureAnswerText({answer:'',citations:{},sources:[talk]},question),
  // A blank clarification lists no records: the no-record answer, from a payload whose source was marked cited.
  'no record':()=>api.ensureAnswerText({answer:'',answer_decision:'clarification',citations:{[talk.resource+'/t/body/0']:[[0,4]]},sources:[cited]},question),
  'limit then records':()=>api.ensureAnswerText({answer:'',answered:true,answer_decision:'answer',citations:{},sources:[],research:{mode:'loop',rounds:1,trail:[],sources:[],pre_writer_sources:[fact]}},'How much did Example Freight give in 2010?'),
}
for(const [label,make] of Object.entries(fallbacks))test(`cache rules: the routed and ordinary store rules refuse the ${label} fallback`,()=>{
  const payload=make()
  assert.equal(payload.fallback,label==='no record'?'no_record':'record_summary')
  if(label==='no record')assert.ok(payload.sources.every(s=>s.cited===false),'the no-record answer cites nothing, so no source stays marked cited')
  assert.equal(api.cacheableRoutedAnswer(payload,true),false,'routed');assert.equal(api.cacheableRoutedAnswer(payload,false),false,'routed, uncited allowed')
  assert.equal(api.cacheableAskAnswer(payload,false),false,'ordinary')
})
test('cache rules: an ordinary cited answer is still storable on both routes',()=>{
  const ordinary={answer:'Jordan Sample spoke on housing.',answer_decision:'answer',citations:{[talk.resource+'/t/body/0']:[[0,31]]},sources:[cited]}
  assert.equal(api.cacheableRoutedAnswer(ordinary,true),true);assert.equal(api.cacheableAskAnswer(ordinary,false),true)
})
