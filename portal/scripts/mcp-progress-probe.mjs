#!/usr/bin/env node
// How many Progress knowledge-base queries each MCP tool call makes, measured on staging without an account.
//
//   node portal/scripts/mcp-progress-probe.mjs          prints the plan and sends nothing (the default)
//   node portal/scripts/mcp-progress-probe.mjs --run    runs it against https://staging.opax.com.au
//
// Running it spends Progress queries, so ask before you run it, and hold the staging lock while it runs.
// Bounds, enforced here by counting, not by estimate:
//  - staging only; at most one request a second; User-Agent opax-improve-audit; no account;
//  - at most 50 tool calls and 100 Progress queries in all. Staging reports each response's queries in
//    x-opax-progress (MCP_PROGRESS_REPORT, src/mcp-access.ts). Every call also sends x-opax-progress-budget
//    with what is left, so the Worker refuses a query that would pass 100 before making it. A response
//    without the report stops the run at once, since it could not be counted.
// Output: a table of tool, calls, queries per call (min, median, max), and the keyword retries counted
// apart from main searches. Raw rows go to MCP_PROBE_OUT (default: a file in the system temp folder).
import {writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const BASE='https://staging.opax.com.au'
const MAX_CALLS=50,MAX_QUERIES=100,GAP_MS=1000,AGENT='opax-improve-audit'
if(process.env.BASE&&process.env.BASE!==BASE){console.error(`This probe runs against ${BASE} only.`);process.exit(2)}
const run=process.argv.includes('--run')
const out=process.env.MCP_PROBE_OUT||join(tmpdir(),'mcp-progress-probe-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json')

// Tools that can reach the knowledge base (they are given its reader), in order, each with its own arguments.
// Each set is used once, so no call is answered from a cache another call filled. read_record takes slugs
// from search results. A register is called through query_register where that is listed (as a client would),
// otherwise by its own name; [names] lists a register's current name first and its earlier one after.
const PLAN=[
 ['search_records',[{query:'housing affordability',kind:'speech'},{query:'gambling advertising'},{query:'renewable energy target',kind:'press_release'},{query:'aged care workforce'},{query:'water buybacks murray darling',kind:'speech'}]],
 ['hansard_search',[{query:'negative gearing',chamber:'senate'},{speaker:'Andrew Wilkie',query:'poker machines'},{query:'childcare subsidy',since:'2024-01-01'},{speaker:'Penny Wong',query:'Pacific'},{query:'nuclear power',venue:'all'}]],
 ['member_profile',[{name:'Penny Wong'},{name:'Senator Lambie'},{electorate:'Grayndler',jurisdiction:'federal'},{slug:'anthony-albanese',detail:'full'}]],
 ['read_record',[]],
 [['corpus_records'],[{kind:'speech',query:'housing supply'},{kind:'press_release',query:'bushfire recovery'},{kind:'speech',query:'cost of living',speaker:'Jim Chalmers'}]],
 [['count_speeches'],[{topic:'housing'},{topic:'climate-environment',group_by:'party'}]],
 [['speech_trend'],[{topic:'immigration',by:'decade'}]],
 [['pay_calculator','paid_answer'],[{question:'What is the federal parliamentary base salary in 2025?'}]],
 [['money_rankings','ranked_money'],[{question:'Which federal parties have the largest disclosed receipt totals in 2023-24?'}]],
 // Given no reader, so these should make none: a check that nothing else reaches the knowledge base.
 ['find_connections',[{query:'Snowy Hydro'}]],
 ['corpus_coverage',[{}]],
 [['find_records'],[{query:'Qantas'}]],
]
const READS=3
const label=tool=>Array.isArray(tool)?tool[0]:tool

function plan(){
 console.log(`MCP Progress probe (${run?'running':'plan only; pass --run to send'})`)
 console.log(`  target ${BASE}, no account, User-Agent ${AGENT}, one request a second`)
 console.log(`  stops at ${MAX_CALLS} tool calls or ${MAX_QUERIES} Progress queries, counted from x-opax-progress`)
 for(const [tool,sets] of PLAN)console.log(`  ${label(tool)}${Array.isArray(tool)?' (register)':''}: ${tool==='read_record'?READS+' slugs from search results':sets.map(a=>JSON.stringify(a)).join(' ')}`)
 console.log(`  raw rows: ${out}`)
}
plan()
if(!run)process.exit(0)

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
let last=0,session=null,id=0,calls=0,queries=0
const rows=[]
async function rpc(method,params,budget){
 const wait=last+GAP_MS-Date.now();if(wait>0)await sleep(wait)
 last=Date.now()
 const headers={'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18','user-agent':AGENT}
 if(session)headers['mcp-session-id']=session
 if(budget!==undefined)headers['x-opax-progress-budget']=String(budget)
 const response=await fetch(BASE+'/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})})
 if(method==='initialize')session=response.headers.get('mcp-session-id')
 const report=response.headers.get('x-opax-progress')
 const text=await response.text()
 let body=null;try{body=JSON.parse(text)}catch{}
 return {status:response.status,report,body,text}
}
const parse=report=>{const m=/^find=(\d+), hedge=(\d+), other=(\d+)$/.exec(report??'');return m?{find:+m[1],hedge:+m[2],other:+m[3]}:null}
function stop(reason){console.log('Stopped: '+reason);finish();process.exit(1)}
async function call(tool,args,as=tool){
 if(calls>=MAX_CALLS||queries>=MAX_QUERIES)return null
 const left=MAX_QUERIES-queries
 const answer=await rpc('tools/call',{name:tool,arguments:args},left)
 calls++
 const used=parse(answer.report)
 if(!used)stop(`no x-opax-progress on a ${answer.status} for ${tool}; the run cannot be counted`)
 const total=used.find+used.hedge+used.other
 queries+=total
 const result=answer.body?.result,error=answer.body?.error
 const row={tool:as,via:tool,args,status:answer.status,...used,total,is_error:!!result?.isError,limited:error?.code===-32029?error.message:null}
 rows.push(row)
 console.log(`${String(calls).padStart(2)} ${as} ${JSON.stringify(args)}: ${answer.status} find=${used.find} hedge=${used.hedge} other=${used.other}${row.is_error?' (tool error)':''}${row.limited?' (limited: '+row.limited.slice(0,80)+')':''}  [${queries}/${MAX_QUERIES}]`)
 if(queries>MAX_QUERIES)stop('the query count passed the bound; this should be impossible with the budget header')
 if(row.limited)stop('a limit refused the call: '+row.limited)
 return result
}
const slugsFrom=result=>{
 try{const data=result?.structuredContent??JSON.parse(result?.content?.[0]?.text??'{}');return (data.results??[]).map(r=>r.slug).filter(s=>typeof s==='string'&&/^(?:speech|press)-/.test(s))}catch{return []}
}
const median=list=>{const s=[...list].sort((a,b)=>a-b),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2}
function finish(){
 const by=new Map()
 for(const row of rows){if(!by.has(row.tool))by.set(row.tool,[]);by.get(row.tool).push(row)}
 console.log('\n| Tool | Calls | Progress queries per call (min / median / max) | Main /find | Keyword retries | Other reads | Multiplier (mean) |')
 console.log('| --- | --- | --- | --- | --- | --- | --- |')
 for(const [tool,list] of by){
  const totals=list.map(r=>r.total),sum=k=>list.reduce((n,r)=>n+r[k],0)
  console.log(`| ${tool} | ${list.length} | ${Math.min(...totals)} / ${median(totals)} / ${Math.max(...totals)} | ${sum('find')} | ${sum('hedge')} | ${sum('other')} | ${(totals.reduce((a,b)=>a+b,0)/list.length).toFixed(2)} |`)
 }
 console.log(`\n${calls} tool calls, ${queries} Progress queries in all.`)
 writeFileSync(out,JSON.stringify({base:BASE,at:new Date().toISOString(),calls,queries,rows},null,1))
 console.log('Raw rows: '+out)
}

const init=await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:AGENT,version:'1'}})
if(init.status!==200||!session)stop(`initialize answered ${init.status}${session?'':' without a session id'}: ${init.text.slice(0,200)}`)
await rpc('notifications/initialized',{})
const listed=await rpc('tools/list',{})
const tools=listed.body?.result?.tools??[]
if(!tools.length)stop('tools/list returned no tools: '+listed.text.slice(0,200))
const names=new Set(tools.map(t=>t.name)),registers=names.has('query_register')
const slugs=[]
for(const [tool,sets] of PLAN){
 let name=tool,wrap=args=>args
 if(Array.isArray(tool)){
  // A register: through query_register by its current name, or directly by whichever name is listed.
  const direct=tool.find(n=>names.has(n))
  if(registers&&!direct){name='query_register';wrap=args=>({register:tool[0],arguments:args})}
  else if(direct)name=direct
  else{console.log(`(${tool[0]} is not listed here; skipped)`);continue}
 }else if(!names.has(tool)){console.log(`(${tool} is not listed here; skipped)`);continue}
 if(tool==='read_record'){for(const slug of slugs.slice(0,READS))await call(tool,{slug});continue}
 for(const args of sets){
  const result=await call(name,wrap(args),label(tool))
  if(tool==='search_records')slugs.push(...slugsFrom(result).filter(s=>!slugs.includes(s)))
 }
}
finish()
