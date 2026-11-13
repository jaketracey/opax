// Ask offline replay (backlog 10): stored research payloads replayed through the current /api/ask pipeline.
// Each fixture in fixtures/ask-replay holds one question with what research saw when it was recorded: the model's
// turns (tool calls and text, in order), the knowledge-box and record-service responses, and the static assets the
// answer reads. Nothing reaches a model or the network. A replay fails when the answer comes back empty, as a
// limitation line alone, without the citations it had, or in a different API shape; the off-topic fixture must
// still decline. Private people and donors in the fixtures are invented; passages are attributed to invented members.
// Assets are trimmed copies of public/ data (scripts/ask_replay_assets.py), so a data refresh on main never moves a
// replay. Tools: ASK_REPLAY=<id> runs one fixture; ASK_REPLAY_DUMP=1 prints each answer and every request no fixture
// entry served (ASK_REPLAY_DUMP=prompts adds each model call's last message); ASK_REPLAY_DISCOVER=1 serves unrecorded
// assets from public/; ASK_REPLAY_SHAPES=print prints the shapes to paste into shapes.json after a deliberate change.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readdirSync,readFileSync} from 'node:fs'
import {MockLanguageModelV4} from 'ai/test'
import {loadWorker,offline} from './worker-harness.mjs'
import {budgetDatabase} from './fixtures/research-budget.mjs'
import {AskStream} from './fixtures/research-app-decoders.mjs'

const dir=new URL('./fixtures/ask-replay/',import.meta.url)
const shapes=JSON.parse(readFileSync(new URL('shapes.json',dir),'utf8'))
// Assets every recorded request read (a small roster, an empty bill index); a fixture's own assets override them.
const base=JSON.parse(readFileSync(new URL('base.json',dir),'utf8'))
const fixtures=readdirSync(dir).filter(f=>/^\d\d-.*\.json$/.test(f)).sort().map(f=>({file:f,...JSON.parse(readFileSync(new URL(f,dir),'utf8'))}))
  .filter(f=>!process.env.ASK_REPLAY||f.id===process.env.ASK_REPLAY)
const dump=!!process.env.ASK_REPLAY_DUMP

// ASK_REPLAY_DISCOVER=1 serves unrecorded assets from public/ and lists them, to see what a new fixture must hold.
const discover=process.env.ASK_REPLAY_DISCOVER==='1'
const restore=offline(),pending=[],ctx={waitUntil:p=>pending.push(p),passThroughOnException(){}}
const plugin={name:'replayed-model',setup(b){b.onResolve({filter:/^@openrouter\/ai-sdk-provider$/},()=>({path:'replay',namespace:'ask-replay'}));b.onLoad({filter:/.*/,namespace:'ask-replay'},()=>({contents:'export const createOpenRouter=()=>()=>globalThis.__researchModel;',loader:'js'}))}}
const h=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,new URL('../public',import.meta.url).pathname,ctx,{plugins:[plugin]})
const daily=budgetDatabase()
Object.assign(h.env,{OPENROUTER_API_KEY:'replay-placeholder',AGENTIC_ASK_MODE:'route',RESEARCH_LOOP:'route',AGENTIC_INPUT_USD_PER_MILLION:'0.66',AGENTIC_OUTPUT_USD_PER_MILLION:'1.98',
  COMMUNITY_DB:daily.db,ASK_LIMITER:{limit:async()=>({success:true})},MODEL_LIMITER:{limit:async()=>({success:true})}})
globalThis.caches={default:{match:async()=>undefined,put:async()=>{}}}
const realLog=console.log,realWarn=console.warn,realError=console.error

// The replayed request's world: only what the fixture recorded. Assets the fixture does not hold are missing, so
// tracked data files changing on main never move a replay.
let world
const realAssets=h.env.ASSETS
h.env.ASSETS={fetch:async req=>{
  const path=new URL(req.url).pathname,body=world.fixture.assets?.[path]??base.assets[path]
  if(body===undefined){world.unserved.push('asset '+path);return discover?realAssets.fetch(req):new Response('Missing',{status:404})}
  return Response.json(body)
}}
globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input)),body=String(init?.body??'')
  assert.ok(url.hostname.startsWith('offline.'),`replay reached for the network: ${url.href}`)
  const hit=(world.fixture.services??[]).find(s=>url.pathname.endsWith(s.path)&&(s.match??[]).every(m=>body.includes(m)))
  if(!hit){world.unserved.push(`service ${url.pathname} ${body.slice(0,160)}`);return Response.json({resources:{},fulltext:{total:0,facets:{}}})}
  return Response.json(hit.response)
}
const usage={inputTokens:{total:900,noCache:900,cacheRead:0,cacheWrite:0},outputTokens:{total:120,text:120,reasoning:0}}
const turn=t=>t.error?()=>{throw new Error(t.error)}:t.tool_calls
  ?{content:t.tool_calls.map((c,i)=>({type:'tool-call',toolName:c.name,toolCallId:c.id??`call-${i}`,input:JSON.stringify(c.args??{})})),finishReason:{unified:'tool-calls',raw:'tool_calls'},usage,warnings:[]}
  :{content:[{type:'text',text:typeof t.text==='string'?t.text:JSON.stringify(t.text)}],finishReason:{unified:'stop',raw:'stop'},usage,warnings:[]}

/** Type skeleton of a value: object keys and value types, arrays by their first element. */
const shapeOf=v=>Array.isArray(v)?(v.length?[shapeOf(v[0])]:[]):v===null?'null':typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,shapeOf(v[k])])):typeof v
const shallow=v=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,Array.isArray(v[k])?'array':v[k]===null?'null':typeof v[k]])):shapeOf(v)
// Fields whose presence rests on timing or spend, not on the answer, are not pinned.
const volatile=new Set(['ms','tokens','cost_usd','turns','cached_input_by_turn','reserved_cost_usd'])
/** The API shape a client reads: every top-level field, a source entry, citations as id to [start, end] pairs, and
 * the research and agentic trail by their own keys (their contents vary with what research found). */
const apiShape=body=>Object.fromEntries(Object.keys(body).sort().map(k=>{
  const v=body[k]
  if(k==='citations')return [k,Object.keys(v).length?{'<passage id>':shapeOf(Object.values(v)[0])}:{}]
  if(k==='research'||k==='agentic')return [k,shallow(Object.fromEntries(Object.entries(v).filter(([f])=>!volatile.has(f))))]
  return [k,shapeOf(v)]
}))
/** A response that says only that the record could not answer. */
const LIMITATION=/\b(no (?:public |matching )?records?|not (?:find|found|identify|establish)|could not|cannot (?:answer|establish|find|say)|does not (?:establish|show|identify|hold)|do not (?:establish|show|identify|hold)|no (?:answer|information|passages?)|unable to|not enough (?:evidence|information)|outside (?:the |what )|only covers?)\b/i
const lines=answer=>answer.split(/\n+|(?<=[.!?])\s+(?=[A-Z“"])/).map(s=>s.replace(/^[-*•]\s*/,'').trim()).filter(Boolean)
const limitationOnly=answer=>{const ls=lines(answer);return !ls.length||ls.every(l=>LIMITATION.test(l))}

const ask=async(fixture,stream)=>{
  world={fixture,unserved:[]}
  globalThis.__researchModel=new MockLanguageModelV4({doGenerate:fixture.model.map(turn)})
  const logs=[];console.log=v=>logs.push(v);console.warn=console.error=()=>{}
  try{
    const response=await h.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json','x-opax-nocache':'1'},body:JSON.stringify({question:fixture.question,...fixture.input})})
    const raw=await response.text()
    while(pending.length)await Promise.all(pending.splice(0))
    return {response,raw,logs,model:globalThis.__researchModel,unserved:world.unserved}
  }finally{console.log=realLog;console.warn=realWarn;console.error=realError;daily.sqlite.exec('DELETE FROM research_daily_spend')}
}
const decodeStream=raw=>{const parser=new AskStream({stage(){},delta(){},retry(){}});for(let i=0;i<raw.length;i+=23)parser.push(raw.slice(i,i+23));parser.push('',true);return parser.result()}

test.after(()=>{restore();daily.close()})
test('every replay fixture is complete, holds no secret and has a pinned shape; the limitation check reads lines',()=>{
  assert.equal(fixtures.length>=10||!!process.env.ASK_REPLAY,true,'at least ten stored payloads')
  for(const f of fixtures){
    assert.ok(f.id&&f.question&&Array.isArray(f.model)&&f.expect,`${f.file} has id, question, model and expect`)
    assert.ok(shapes[f.id],`${f.id} has a pinned API shape in shapes.json`)
    assert.doesNotMatch(JSON.stringify(f),/sk-or-|Bearer |api[_-]?key|token"\s*:\s*"[A-Za-z0-9]{20}/i,`${f.id} holds no secret`)
  }
  assert.equal(limitationOnly(''),true)
  assert.equal(limitationOnly('OPAX could not find a public record that answers this question.'),true)
  assert.equal(limitationOnly('- The records do not establish who was responsible.\n- No passages matched.'),true)
  assert.equal(limitationOnly('Scott Morrison took the proposal to Cabinet. The records do not establish more.'),false)
})

for(const fixture of fixtures)test(`replay ${fixture.id}: ${fixture.question}`,async()=>{
  const {expect}=fixture
  const run=await ask(fixture,false),body=JSON.parse(run.raw)
  const context=()=>JSON.stringify({answer:body.answer,research:{mode:body.research?.mode,failure:body.research?.failure},unserved:run.unserved,logs:run.logs.filter(l=>/fallback|failure/.test(String(l))).slice(0,3)},null,1)
  if(dump)realLog(`\n=== ${fixture.id}\n${JSON.stringify({status:run.response.status,body:{...body,sources:body.sources?.length}},null,1)}\nunserved: ${JSON.stringify(run.unserved,null,1)}\nmodel calls: ${run.model.doGenerateCalls.length}`)
  if(process.env.ASK_REPLAY_DUMP==='prompts')run.model.doGenerateCalls.forEach((c,i)=>realLog(`--- call ${i+1} tools=${(c.tools??[]).length} choice=${JSON.stringify(c.toolChoice)}\n${JSON.stringify(c.prompt.at(-1)).slice(0,2500)}`))
  assert.equal(run.response.status,200)
  assert.equal(run.model.doGenerateCalls.length,fixture.model.length,`the pipeline used every recorded model turn and no more ${context()}`)

  // The answer is there, and says more than that the record could not answer.
  assert.equal(typeof body.answer,'string')
  assert.ok(body.answer.trim(),`empty answer ${context()}`)
  if(expect.decline){
    assert.match(body.answer,new RegExp(expect.decline,'i'),`the off-topic question still declines ${context()}`)
    assert.equal(body.answer_decision,'refusal',context())
    for(const name of expect.excludes??[])assert.doesNotMatch(body.answer,new RegExp(name,'i'),name)
  }else{
    assert.equal(limitationOnly(body.answer),false,`limitation-only answer ${context()}`)
    assert.ok(!['limitation','refusal'].includes(body.answer_decision),`answer_decision ${body.answer_decision} ${context()}`)
    if(expect.answered!==undefined)assert.equal(body.answered??true,expect.answered,context())
    for(const name of expect.includes??[])assert.match(body.answer,new RegExp(name),`answer keeps ${name} ${context()}`)
    for(const name of expect.excludes??[])assert.doesNotMatch(body.answer,new RegExp(name,'i'),name)
  }
  if(expect.mode)assert.equal(body.research?.mode,expect.mode,context())

  // Citations: every range lands inside the answer, every cited resource is a listed source.
  const ranges=Object.entries(body.citations??{}),length=Array.from(body.answer).length
  if(expect.citations){
    assert.ok(ranges.length>=expect.citations,`at least ${expect.citations} cited sources, got ${ranges.length} ${context()}`)
    for(const cited of expect.cited??[])assert.ok(ranges.some(([id])=>id.startsWith(cited)),`cites ${cited} ${context()}`)
  }
  for(const [id,spans] of ranges){
    assert.ok(spans.length,`${id} has a range`)
    for(const [a,b] of spans)assert.ok(Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&b>a&&b<=length,`${id} range ${a}-${b} inside the answer`)
    assert.ok(body.sources.some(s=>id.startsWith(s.resource)||s.href===id||id.startsWith(s.slug||'\0')),`${id} is a listed source`)
  }

  // The API shape is the one pinned for this fixture, on JSON and on the stream's final frame.
  const shape=apiShape(body)
  if(process.env.ASK_REPLAY_SHAPES==='print')realLog(JSON.stringify({[fixture.id]:shape}))
  else assert.deepEqual(shape,shapes[fixture.id],`${fixture.id} API shape changed; if deliberate, update fixtures/ask-replay/shapes.json`)
  if(expect.stream!==false){
    const streamed=await ask(fixture,true)
    assert.equal(streamed.response.status,200)
    assert.match(streamed.response.headers.get('content-type')??'',/text\/event-stream/)
    const final=decodeStream(streamed.raw)
    assert.equal(final.answer,body.answer,'the stream ends with the same answer')
    assert.deepEqual(final.citations,body.citations,'and the same citations')
  }
})
