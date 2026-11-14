// Ask never shows nothing when the model misbehaves (13 Nov 2026, found by the offline replay). A scripted model drives
// the real /api/ask route with no provider or network calls, in the replay's style: a research turn that answers in plain
// text instead of calling a tool, malformed tool arguments, and an answer writer that throws or times out. Each gives a
// non-empty, cited answer; a money ranking keeps its leader; and an empty answer never leaves the Worker: with nothing found
// it is a no-record answer naming what was searched.
// Names are invented (the passage speaker, donors); public office titles and the public pay data are real.
import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {StreamingResearchModel as MockLanguageModelV4} from './fixtures/research-scripted-model.mjs'
import {loadWorker,offline} from './worker-harness.mjs'
import {budgetDatabase} from './fixtures/research-budget.mjs'
import {AskStream} from './fixtures/research-app-decoders.mjs'

const restore=offline(),pending=[],ctx={waitUntil:p=>pending.push(p),passThroughOnException(){}}
const plugin={name:'scripted-model',setup(b){b.onResolve({filter:/^@openrouter\/ai-sdk-provider$/},()=>({path:'scripted',namespace:'ask-fallbacks'}));b.onLoad({filter:/.*/,namespace:'ask-fallbacks'},()=>({contents:'export const createOpenRouter=()=>()=>globalThis.__researchModel;',loader:'js'}))}}
const h=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,new URL('../public',import.meta.url).pathname,ctx,{plugins:[plugin]})
const daily=budgetDatabase()
Object.assign(h.env,{OPENROUTER_API_KEY:'test-only-placeholder',AGENTIC_ASK_MODE:'route',RESEARCH_LOOP:'route',AGENTIC_INPUT_USD_PER_MILLION:'0.66',AGENTIC_OUTPUT_USD_PER_MILLION:'1.98',SA_HANSARD_FULL_TEXT:'true',
  COMMUNITY_DB:daily.db,ASK_LIMITER:{limit:async()=>({success:true})},MODEL_LIMITER:{limit:async()=>({success:true})}})
globalThis.caches={default:{match:async()=>undefined,put:async()=>{}}}

// A Senate passage about the robodebt royal commission, attributed to an invented senator.
const rid='1'.repeat(32),passage='The royal commission found the robodebt scheme was a crude and cruel mechanism, neither fair nor legal, and that ministers were told it was unlawful.'
const pid=`${rid}/t/body/0-${passage.length}`,origin={created:'2023-07-10T00:00:00Z',collaborators:['Jordan Sample']}
const roster={people:[{name:'Jordan Sample',speeches:412,party:'Greens',states:['federal'],chambers:['senate'],first:2016,last:2026,current:true,party_now:'Greens',prints:['Sample']}]}
// A trimmed money graph: three invented donors to one party (two with a classified industry) and two parties.
const node=(id,label,kind,industry,byYear)=>({id,label,kind,industry,total:Object.values(byYear).reduce((n,[a])=>n+a,0),count:Object.values(byYear).reduce((n,[,c])=>n+c,0),firstYear:2021,lastYear:2023,byYear})
const money={meta:{generated:'2026-11-11'},nodes:[
  node('party:Liberal','Liberal','party','parties',{2021:[42811443,1141],2022:[25847707,556],2023:[19685459,621]}),
  node('party:Labor','Labor','party','parties',{2021:[30100000,900],2022:[20678165,480],2023:[18000000,500]}),
  node('donor:example freight pty ltd','Example Freight Pty Ltd','donor','other',{2021:[1587500,1],2022:[2681740,1],2023:[4990394,1]}),
  node('donor:sample banking group ltd','Sample Banking Group Ltd','donor','finance',{2021:[900000,12],2022:[1314270,16],2023:[1100000,14]}),
  node('donor:placeholder medical industries ltd','Placeholder Medical Industries Ltd','donor','pharmacy',{2021:[150000,8],2022:[235206,10],2023:[200000,9]})],
 edges:[['example freight pty ltd',{2021:[1587500,1],2022:[2681740,1],2023:[4990394,1]}],['sample banking group ltd',{2021:[900000,12],2022:[1314270,16],2023:[1100000,14]}],['placeholder medical industries ltd',{2021:[150000,8],2022:[235206,10],2023:[200000,9]}]]
  .map(([donor,byYear])=>({source:'donor:'+donor,target:'party:Liberal',total:Object.values(byYear).reduce((n,[a])=>n+a,0),count:Object.values(byYear).reduce((n,[,c])=>n+c,0),firstYear:2021,lastYear:2023,byYear}))}

// Only the assets a question needs; pay figures come from the tracked public pay data.
const realAssets=h.env.ASSETS
h.env.ASSETS={fetch:async req=>{
  const path=new URL(req.url).pathname
  if(path==='/parliamentarians.json')return Response.json(roster)
  if(path==='/bills/index.json')return Response.json({bills:[]})
  if(path==='/graph/money.json')return Response.json(money)
  if(['/pay.json','/pay-offices.json'].includes(path))return realAssets.fetch(req)
  return new Response('Missing',{status:404})
}}
// The knowledge box: one searchable passage and its record; /ask (the ordinary path's generation) answers per script.
let kbAnswers=[],kbCalls=0
globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input)),body=String(init?.body??'')
  assert.ok(url.hostname.startsWith('offline.'),`no network: ${url.href}`)
  if(url.pathname.endsWith('/find'))return Response.json(/robodebt/i.test(body)?{resources:{[rid]:{slug:'speech-910001',title:'Royal Commission into the Robodebt Scheme',origin,extra:{metadata:{kind:'speech'}},fields:{body:{paragraphs:{[pid]:{text:passage}}}}}}}:{resources:{}})
  if(url.pathname.endsWith('/slug/speech-910001'))return Response.json({id:rid,title:'Royal Commission into the Robodebt Scheme',origin,extra:{metadata:{date:'2023-07-10',speaker:'Jordan Sample'}},data:{texts:{body:{value:{body:passage}}}},usermetadata:{classifications:[{labelset:'kind',label:'speech'}]}})
  if(url.pathname.endsWith('/ask')){kbCalls++;return Response.json(kbAnswers.shift()??{answer:''})}
  return Response.json({resources:{},fulltext:{total:0,facets:{}}})
}

const usage={inputTokens:{total:900,noCache:900,cacheRead:0,cacheWrite:0},outputTokens:{total:120,text:120,reasoning:0}}
const calls=(...list)=>({content:list.map(([name,args],i)=>({type:'tool-call',toolName:name,toolCallId:`call-${i}`,input:typeof args==='string'?args:JSON.stringify(args)})),finishReason:{unified:'tool-calls',raw:'tool_calls'},usage,warnings:[]})
const prose=text=>({content:[{type:'text',text}],finishReason:{unified:'stop',raw:'stop'},usage,warnings:[]})
const throws=()=>{throw new Error('provider unavailable')}
// A writer call that never returns: it ends only when the Worker's writing cap aborts it.
const stalls=({abortSignal})=>new Promise((_,reject)=>abortSignal?.addEventListener('abort',()=>reject(abortSignal.reason),{once:true}))
const script=turns=>{let n=0;return new MockLanguageModelV4({doGenerate:async options=>{const t=turns[n++];if(!t)throw new Error('no scripted turn left');return typeof t==='function'?t(options):t}})}

const decodeStream=raw=>{const parser=new AskStream({stage(){},delta(){},retry(){}});for(let i=0;i<raw.length;i+=23)parser.push(raw.slice(i,i+23));parser.push('',true);return parser.result()}
const ask=async(question,turns,{stream=false,input={kind:'speech'},kb=[]}={})=>{
  globalThis.__researchModel=script(turns);kbAnswers=[...kb];kbCalls=0
  const quiet=[console.log,console.warn,console.error];console.log=console.warn=console.error=()=>{}
  try{
    const response=await h.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json','x-opax-nocache':'1'},body:JSON.stringify({question,...input})})
    const raw=await response.text()
    while(pending.length)await Promise.all(pending.splice(0))
    return {status:response.status,body:stream?decodeStream(raw):JSON.parse(raw),model:globalThis.__researchModel,kbCalls}
  }finally{[console.log,console.warn,console.error]=quiet;daily.sqlite.exec('DELETE FROM research_daily_spend')}
}
/** Every answer: non-empty, answered, and each citation range inside the answer on a listed source. */
const answered=(body,label)=>{
  assert.equal(typeof body.answer,'string',label);assert.ok(body.answer.trim(),`empty answer: ${label}`)
  assert.notEqual(body.answered,false,label)
  const length=Array.from(body.answer).length
  for(const [id,ranges] of Object.entries(body.citations??{})){
    for(const [a,b] of ranges)assert.ok(a>=0&&b>a&&b<=length,`${id} ${a}-${b} inside the answer: ${label}`)
    assert.ok(body.sources.some(s=>id.split('/')[0]===s.resource),`${id} is a listed source: ${label}`)
  }
}
const cited=(body,prefix,label)=>assert.ok(Object.keys(body.citations??{}).some(id=>id.startsWith(prefix)),`cites ${prefix}: ${label} ${JSON.stringify(body.citations)}`)

test.after(()=>{restore();daily.close()})

const robodebt='Who was responsible for robodebt?'
const search=['search',{query:'robodebt royal commission responsibility ministers'}]
const said='The Royal Commission into the Robodebt Scheme found that ministers and senior public servants were responsible for the unlawful scheme.'

test('a research turn that answers in plain text is the answer, with the passage research holds cited (JSON and SSE)',async()=>{
  for(const stream of [false,true]){
    const run=await ask(robodebt,[calls(search),prose(said)],{stream})
    assert.equal(run.status,200)
    answered(run.body,'prose after search')
    assert.ok(run.body.answer.startsWith('The cited sources do not name a person or office as responsible.\n\n'+said),run.body.answer)
    assert.match(run.body.answer,/Jordan Sample said “The royal commission found the robodebt scheme was a crude and cruel mechanism/)
    cited(run.body,rid,'prose after search')
    assert.equal(run.model.doGenerateCalls.length,2,'no extra model turn')
    assert.equal(run.body.research.mode,'loop')
  }
})

test('plain text before any lookup is answered from general knowledge, never left empty',async()=>{
  const text='Robodebt was the Online Compliance Intervention. The royal commission found that the ministers who approved and defended it, and senior public servants, were responsible.'
  const run=await ask(robodebt,[prose(text)])
  assert.equal(run.status,200);answered(run.body,'prose first')
  assert.equal(run.body.answer,'The cited sources do not name a person or office as responsible.\n\n'+text)
  assert.match(run.body.coverage?.note??'',/not reached/)
  assert.equal(run.model.doGenerateCalls.length,1)
})

const sampled={points:[{claim:said},{claim:'Jordan Sample told the Senate the commission found the scheme was "a crude and cruel mechanism, neither fair nor legal".',id:pid,quote:'a crude and cruel mechanism, neither fair nor legal'}]}
test('malformed arguments and a plan in prose: the plan gets feedback once and the next turn writes the cited answer',async()=>{
  const run=await ask(robodebt,[calls(search),calls(['answer','{"points": [{"claim": "unfinished']),prose('Let me check the report again.'),calls(['answer',sampled])])
  assert.equal(run.status,200);answered(run.body,'continued answer')
  assert.ok(run.body.answer.startsWith('The cited sources do not name a person or office as responsible.\n\n'+said),run.body.answer)
  cited(run.body,rid,'continued answer')
  // Research goes on in the same conversation, not in a separate final call.
  const last=run.model.doGenerateCalls.at(-1)
  assert.equal(last.toolChoice.type,'auto')
  assert.match(JSON.stringify(last.prompt.at(-1)),/no tool call and no answer object/)
  assert.equal(run.model.doGenerateCalls.length,4,'one re-ask, no more')
})

test('two plans in prose: research ends, and the one forced answer call writes the cited answer',async()=>{
  const run=await ask(robodebt,[calls(search),prose('Let me check the report again.'),prose('I will look at the commission findings next.'),calls(['answer',sampled])])
  assert.equal(run.status,200);answered(run.body,'forced answer')
  assert.ok(run.body.answer.startsWith('The cited sources do not name a person or office as responsible.\n\n'+said),run.body.answer)
  cited(run.body,rid,'forced answer')
  const last=run.model.doGenerateCalls.at(-1)
  assert.deepEqual(last.toolChoice,{type:'tool',toolName:'answer'},'the re-ask requires the answer tool')
  assert.equal(run.model.doGenerateCalls.length,4,'one feedback turn and one forced answer call, no more')
})

test('when the forced answer call also replies in prose, that prose is the answer',async()=>{
  const run=await ask(robodebt,[calls(search),prose('I will look at the commission report first.'),prose(said)])
  assert.equal(run.status,200);answered(run.body,'prose re-ask')
  assert.ok(run.body.answer.startsWith('The cited sources do not name a person or office as responsible.\n\n'+said),run.body.answer);cited(run.body,rid,'prose re-ask')
})

test('with no usable prose and no answer call, the passages research holds answer in their own words',async()=>{
  const run=await ask(robodebt,[calls(search),calls(['answer','not json']),prose('Let me search again.'),prose('<tool_call>{"name": "search"}</tool_call>')])
  assert.equal(run.status,200);answered(run.body,'passages only')
  assert.match(run.body.answer,/^The cited sources do not name a person or office as responsible\.\n\nOn 10 July 2023, Jordan Sample said “The royal commission found/)
  cited(run.body,rid,'passages only')
})

test('nothing found, written or retrieved: a no-record answer that says what was searched, never a blank one',async()=>{
  // Research fails before any lookup and the ordinary path generates nothing, twice (first ask and its lighter retry).
  const run=await ask(robodebt,[prose('Let me search the record.'),throws])
  assert.equal(run.status,200)
  assert.match(run.body.answer,/^OPAX searched Hansard speeches and OPAX’s public records and found no record that answers this question\. Try asking again with a member, party, bill or year named/,JSON.stringify(run.body).slice(0,400))
  assert.equal(run.body.answer_decision,'limitation');assert.notEqual(run.body.answered,false)
  assert.equal(run.kbCalls,2,'a blank generation gets one lighter retry')
})

test('the ordinary path: a blank generation is asked again once; retrieved records answer when both are blank',async()=>{
  const retrieved={resources:{[rid]:{slug:'speech-910001',title:'Royal Commission into the Robodebt Scheme',origin,extra:{metadata:{date:'2023-07-10'}},fields:{body:{paragraphs:{[pid]:{text:passage,score:0.9,score_type:'VECTOR'}}}}}}}
  const second='The royal commission found that ministers were told the scheme was unlawful.'
  const again=await ask(robodebt,[throws,throws],{kb:[{answer:'',retrieval_results:retrieved},{answer:second,retrieval_results:retrieved}]})
  assert.equal(again.status,200);answered(again.body,'retry')
  assert.match(again.body.answer,/ministers were told the scheme was unlawful/)
  assert.equal(again.kbCalls>=2,true)
  const listed=await ask(robodebt,[throws,throws],{kb:Array.from({length:6},()=>({answer:' ',retrieval_results:retrieved}))})
  assert.equal(listed.status,200);answered(listed.body,'records listed')
  assert.match(listed.body.answer,/Jordan Sample said “The royal commission found the robodebt scheme/)
  cited(listed.body,rid,'records listed')
})

// Money rankings when the writer call fails: the deterministic version names the leader first, with its amount.
const donorQuestion='Which donors gave the most to the Liberal Party in 2022-23?'
const donorTurns=writer=>[calls(['money_totals',{party:'Liberal',group_by:'donor',financial_year:'2022-23'}]),calls(['answer',{facts:[1,2,3]}]),writer]
const donorLead=body=>{
  const [first,second]=body.answer.split(/\n+/)
  assert.match(first,/^Example Freight Pty Ltd provided the most disclosed funding in financial year 2022-23, with \$2,681,740\.$/,body.answer)
  assert.match(second,/^The runners-up were Sample Banking Group Ltd with \$1,314,270, Placeholder Medical Industries Ltd with \$235,206\.$/,body.answer)
  for(const id of ['fact-1','fact-2','fact-3'])cited(body,id,'donor ranking')
  const lead=body.citations['fact-1/t/body/0']?.[0]
  assert.ok(lead&&lead[0]===0,'the leader sentence cites the leader record')
}

test('writer throws: a donor ranking names the top donor first with the amount, then the runners-up, cited (JSON and SSE)',async()=>{
  for(const stream of [false,true]){
    const run=await ask(donorQuestion,donorTurns(throws),{stream})
    assert.equal(run.status,200);answered(run.body,'writer throws');donorLead(run.body)
    assert.equal(run.model.doGenerateCalls.length,3)
  }
})

test('writer throws: a ranking over several financial years keeps its leader, with the range its record gives',async()=>{
  const run=await ask('Which donors gave the most to the Liberal Party from 2021-22 to 2023-24?',[calls(['money_totals',{party:'Liberal',group_by:'donor',from_year:2021,to_year:2023}]),calls(['answer',{facts:[1,2,3]}]),throws])
  assert.equal(run.status,200);answered(run.body,'range ranking')
  const [first,second]=run.body.answer.split(/\n+/)
  assert.match(first,/^Example Freight Pty Ltd provided the most disclosed funding in financial years 2021-22 to 2023-24, with \$9,259,634\.$/,run.body.answer)
  assert.match(second,/^The runners-up were Sample Banking Group Ltd with \$3,314,270, Placeholder Medical Industries Ltd with \$585,206\.$/,run.body.answer)
  cited(run.body,'fact-1','range ranking')
})

test('writer timeout: the same ranking, leader first, inside the writing cap',async()=>{
  const previous=h.env.RESEARCH_LOOP_MS;h.env.RESEARCH_LOOP_MS='3000'
  try{
    const started=Date.now(),run=await ask(donorQuestion,donorTurns(stalls))
    assert.equal(run.status,200);answered(run.body,'writer timeout');donorLead(run.body)
    assert.ok(Date.now()-started<8000,'the writer cap ended the stalled call')
  }finally{h.env.RESEARCH_LOOP_MS=previous}
})

test('writer throws: a party-money ranking leads with the top party and its amount',async()=>{
  const run=await ask('Which party received the most money in 2022-23?',[calls(['money_totals',{group_by:'party',financial_year:'2022-23'}]),calls(['answer',{facts:[1,2]}]),throws])
  assert.equal(run.status,200);answered(run.body,'party ranking')
  const [first,second]=run.body.answer.split(/\n+/)
  assert.match(first,/^Liberal received the most disclosed funding in financial year 2022-23, with \$25,847,707\.$/,run.body.answer)
  assert.match(second,/^The runner-up was Labor with \$20,678,165\.$/,run.body.answer)
  cited(run.body,'fact-1','party ranking');cited(run.body,'fact-2','party ranking')
})

test('writer throws: an industry-money ranking leads with the top industry and its amount',async()=>{
  const run=await ask('Which industries gave the most to the Liberal Party in 2022-23?',[calls(['money_totals',{party:'Liberal',group_by:'industry',financial_year:'2022-23'}]),calls(['answer',{facts:[1,2]}]),throws])
  assert.equal(run.status,200);answered(run.body,'industry ranking')
  const [first]=run.body.answer.split(/\n+/)
  assert.match(first,/^Finance led the classified industry ranking, with \$1,314,270 in federal disclosed receipts to the Liberal Party in financial year 2022-23/,run.body.answer)
  assert.match(run.body.answer,/Pharmacy .*\$235,206/)
  cited(run.body,'fact-1','industry ranking');cited(run.body,'fact-2','industry ranking')
})

// Pay (row 56 covers route mode): with the writer failing, and on the ordinary path, the salary reads as a full sentence.
test('pay reads as a full sentence when the writer fails and on the ordinary path, never "Base salary $X (section 7)." alone',async()=>{
  const question='How much is a federal backbencher paid?'
  const loop=await ask(question,[calls(['paid_answer',{}]),calls(['answer',{facts:[1]}]),throws])
  assert.equal(loop.status,200);answered(loop.body,'pay writer throws')
  assert.match(loop.body.answer,/^A federal backbencher’s base salary is \$[\d,]+ a year/,loop.body.answer)
  assert.doesNotMatch(loop.body.answer.trim(),/^Base salary \$[\d,]+ \(section \d+\)\.$/)
  const previous=[h.env.AGENTIC_ASK_MODE,h.env.RESEARCH_LOOP];h.env.AGENTIC_ASK_MODE='off';h.env.RESEARCH_LOOP='off'
  try{
    const ordinary=await ask(question,[],{input:{}})
    assert.equal(ordinary.status,200);answered(ordinary.body,'ordinary pay')
    assert.match(ordinary.body.answer,/^\*\*A federal backbencher’s base salary is \$[\d,]+ a year\*\*, for senators and members alike/,ordinary.body.answer)
    assert.equal(ordinary.model.doGenerateCalls.length,0)
  }finally{[h.env.AGENTIC_ASK_MODE,h.env.RESEARCH_LOOP]=previous}
})

// The boundary every /api/ask response passes (withAnswerLanguage → ensureAnswerText), on stored payloads.
const built=await build({stdin:{contents:"export {ensureAnswerText} from './src/research-response';export {usableProse,modelProse} from './src/research-text-answer';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const source={resource:rid,slug:'speech-910001',title:'Royal Commission into the Robodebt Scheme',href:'https://opax.com.au/doc/speech-910001',url:'https://opax.com.au/doc/speech-910001',snippet:passage,kind:'speech',speaker:'Jordan Sample',date:'2023-07-10',cited:false}

test('boundary: an empty answer is written from the records it lists, else their record lines, else a no-record answer; explicit non-answers stay',()=>{
  const listed=api.ensureAnswerText({answer:'',citations:{},sources:[source]},robodebt)
  // The display step after this boundary drops a lone list marker (the route tests above see the clean line).
  assert.match(listed.answer,/^(?:- )?On 10 July 2023, Jordan Sample said “The royal commission found/)
  assert.ok(Object.keys(listed.citations).some(id=>id.startsWith(rid)));assert.equal(listed.sources[0].cited,true)
  // A record fact is not listed as a quotation: it is shown as the tool's own line, cited, under a plain lead.
  const fact={...source,resource:'fact-1',kind:'record',snippet:'Example Freight Pty Ltd: $2,681,740 in federal disclosed receipts.'}
  const summary=api.ensureAnswerText({answer:'',citations:{},sources:[fact]})
  assert.equal(summary.answer,'Here is what the record shows.\n- Example Freight Pty Ltd: $2,681,740 in federal disclosed receipts.')
  assert.deepEqual(summary.citations,{'fact-1/t/body/0':[[33,99]]});assert.equal(summary.sources[0].cited,true);assert.equal(summary.answered,true)
  // Nothing found at all: what was searched, and what to ask next.
  const none=api.ensureAnswerText({answer:'',citations:{},sources:[]},robodebt)
  assert.match(none.answer,/^OPAX searched Hansard speeches and OPAX’s public records and found no record that answers this question\./);assert.equal(none.answer_decision,'limitation')
  // A response that claimed an answer keeps the existing contract: one plain line on what the records could not establish.
  const claimed=api.ensureAnswerText({answered:true,answer_decision:'answer',answer:'  ',citations:{},sources:[]},robodebt)
  assert.ok(claimed.answer.trim());assert.notEqual(claimed.answer_decision,'answer')
  for(const payload of [{answered:false,reason:'no_supported_claim',answer:'',citations:{},sources:[]},{answered:false,reason:'partial',partial:true,answer:'',citations:{},sources:[{...source,snippet:''}]}])
    assert.deepEqual(api.ensureAnswerText(payload,robodebt),payload)
})

test('prose is used only when it reads as an answer',()=>{
  assert.equal(api.usableProse(said),said)
  for(const text of ['Let me search the record for robodebt.','I will look at the report.','<tool_call>{"name":"search"}</tool_call>','{"points":[]}','```json\n{"facts":[1]}\n```','I have enough verified passages from different speeches and dates. {"points":[{"claim":"Robodebt was unlawful.","id":"r1"','Sorry, I cannot answer that.','The records do not establish who was responsible.','Robodebt.',''])
    assert.equal(api.usableProse(text),null,text)
  assert.equal(api.usableProse('<think>plan the search</think>'+said),said)
  assert.equal(api.modelProse([{type:'reasoning',text:'hidden'},{type:'text',text:'A '},{type:'text',text:'B'}]),'A B')
})
