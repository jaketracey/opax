#!/usr/bin/env node
// Five local-only receipt-wording probes, using the existing research eval harness.
import fs from 'node:fs'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {runEval} from './research_eval.mjs'


const root=fileURLToPath(new URL('../',import.meta.url))
const base=process.argv[2]??'http://127.0.0.1:8973'
const offline=base==='--offline'
if(!offline&&!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Receipt evals require a local server')
const out=process.argv[3]??root+'portal/private/ask-receipts-round5'
const questions=JSON.parse(fs.readFileSync(root+'portal/test/fixtures/ask-receipts-probes.json')).questions
const vars=offline?{}:Object.fromEntries(fs.readFileSync(root+'portal/.dev.vars','utf8').split('\n').map(l=>l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].replace(/^"|"$/g,'')]))
if(!offline&&!vars.DAILY_POST_OPERATOR_SECRET)throw Error('Local operator credential is missing')
fs.mkdirSync(out,{recursive:true})
const ledger=out+'/spend-ledger.json'
const spendCapUsd=0.50
const previous=fs.existsSync(ledger)?JSON.parse(fs.readFileSync(ledger)).spent_upper_estimate:0
if(!offline&&previous>=spendCapUsd)throw Error('The US$0.50 session eval cap has been reached')
// For the bounded local Worker, use its existing $10/million token reservation rule.
// Keep all earlier unknown-cost reservations; an errored request retains this ceiling too.
let requestReserveUsd=0.20
if(!offline){
 const config=JSON.parse(fs.readFileSync(root+'portal/research-local.wrangler.jsonc'))
 const tokens=Number(config.vars?.RESEARCH_LOOP_TOKENS)
 if(!Number.isInteger(tokens)||tokens<=0||tokens>20000)throw Error('Provider eval requires a local Worker token cap of at most 20000')
 requestReserveUsd=tokens*10/1e6
}
let fixture
if(offline){
 globalThis.fetch=()=>{throw Error('Offline receipt eval: network forbidden')}
 const {build}=createRequire(root+'portal/package.json')('esbuild')
 const bundled=await build({stdin:{contents:"export * from './src/research-calculated';export * from './src/ask-money-routing';",resolveDir:root+'portal'},bundle:true,write:false,format:'esm',platform:'node'})
 const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'))
 const deps={asset:async path=>JSON.parse(fs.readFileSync(root+'portal/public'+path)),origin:'https://example.invalid'}
 fixture=[]
 for(const q of questions){
  const result=await api.calculatedLookup('ranked_money',{}, {question:q.question},deps)
  const assets={fetch:async request=>Response.json(await deps.asset(new URL(request.url).pathname))}
  const routed=await api.federalPartyMoneyAnswer({question:q.question},assets)
  const payload=routed?api.publicPartyMoneyAnswer(routed):result.data.payload
  fixture.push({id:q.id,mode:'loop',payload})
 }
}
const {rows,report,summary}=await runEval({questions,fixture,requestReserveUsd,modes:['loop'],bases:{loop:base},baseHost:offline?'offline local assets':base,route:'ask',secret:vars.DAILY_POST_OPERATOR_SECRET,operator:true,prod:false,limit:5,spendCap:spendCapUsd-previous,timeoutMs:120000,
 onRow:async({rows,spent})=>{
  fs.writeFileSync(out+'/in-progress.json',JSON.stringify({rows,spent},null,2))
  if(!offline)fs.writeFileSync(ledger,JSON.stringify({spent_upper_estimate:previous+spent,cap_usd:spendCapUsd},null,2))
  const row=rows.at(-1);console.log(`${row.id}: ${row.error??row.grade?.overall??'unknown'}, cost so far $${spent.toFixed(6)}`)
 }})
for(const row of rows){
 const answer=row.answer??''
 row.receipt_wording={safe:row.id==='RC05'||row.payload?.money_route==='federal-party-ranking-v1',receipts_lead:row.id==='RC05'||/disclosed receipts/i.test(answer.split('\n')[0]),basis:row.id==='RC05'?/balances owed at 30 June/.test(answer):/not a donation ranking/.test(answer)}
}
// The research prose rubric forbids tables. Keep its raw grades, and separately
// verify the deliberately different calculator contract against local data.
const graph=JSON.parse(fs.readFileSync(root+'portal/public/graph/money.json'))
for(const row of rows){
 const p=row.payload??{},gold=questions.find(q=>q.id===row.id)?.calculator_expected
 const checks={receipt_copy:Object.values(row.receipt_wording).every(Boolean)}
 if(gold){
  const lines=String(p.answer??'').split('\n'),table=lines.filter(line=>/^\| /.test(line)).slice(2)
  const edges=graph.edges.filter(e=>e.target==='party:'+gold.party&&(!e.flow||e.flow==='receipts')&&graph.nodes.some(n=>n.id===e.source&&n.kind==='donor'))
  const totals=new Map();for(const edge of edges){const v=totals.get(edge.source)??{amount:0,records:0};v.amount+=edge.total;v.records+=edge.count;totals.set(edge.source,v)}
  const leader=[...totals].sort((a,b)=>b[1].amount-a[1].amount)[0],node=graph.nodes.find(n=>n.id===leader?.[0])
  const money=n=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(n)
  checks.gold_leader=node?.label===gold.leader&&leader[1].amount===gold.amount_aud&&leader[1].records===gold.records
  checks.direct_lead=String(p.answer).split('\n')[0].includes(gold.leader+': '+money(gold.amount_aud))&&String(p.answer).split('\n')[0].includes(gold.records.toLocaleString('en-AU')+' records')
  checks.public_shape=p.money_route==='federal-party-ranking-v1'&&p.answer_status==='calculated'&&!('money_facts' in p)&&!('money_overview' in p)
  checks.full_table=table.length===gold.table_rows
  checks.table_values=table.every(line=>{const cells=line.split('|').slice(1,-1).map(s=>s.trim()),name=cells[0].replace(/^\[([^\]]+)\]\([^)]+\)$/,'$1'),n=graph.nodes.find(n=>n.label===name||n.source_name===name),value=totals.get(n?.id);return !!value&&cells[1]===money(value.amount)&&cells[2]===value.records.toLocaleString('en-AU')})
  checks.row_citations=table.every(line=>{const at=Array.from(String(p.answer).slice(0,String(p.answer).indexOf(line))).length,end=at+Array.from(line).length;return Object.entries(p.citations??{}).some(([id,ranges])=>ranges.some(([a,b])=>a<end&&b>at)&&p.sources?.some(s=>id===s.resource||id.startsWith(s.resource+'/')))})
 }else checks.debt_citation=p.sources?.some(s=>s.cited&&String(s.url??s.href).endsWith('/graph/aec-extras.json'))===true
 checks.valid_citations=Object.entries(p.citations??{}).every(([id,ranges])=>p.sources?.some(s=>id===s.resource||id.startsWith(s.resource+'/'))&&ranges.every(([a,b])=>a>=0&&b>a&&b<=Array.from(String(p.answer??'')).length))
 row.calculator_contract={overall:Object.values(checks).every(Boolean)?'pass':'fail',checks}
}
const calculator_summary={pass:rows.filter(r=>r.calculator_contract.overall==='pass').length,total:rows.length,raw_prose_pass:rows.filter(r=>r.grade?.overall==='pass').length}
const execution=offline?'Offline deterministic family routing and calculated debt-basis control; no model generation':'Local Worker with model provider, remote data blocked'
fs.writeFileSync(out+'/results.json',JSON.stringify({execution,rows,report,summary,calculator_summary},null,2))
const lines=['# Full local receipt eval answers','',execution,'']
for(const row of rows){
 const cited=(row.payload?.sources??[]).filter(s=>s.cited),marks=new Map()
 for(const [id,ranges]of Object.entries(row.payload?.citations??{})){
  const n=cited.findIndex(s=>id===s.resource||id.startsWith(s.resource+'/'))+1
  if(!n)continue
  for(const [,end]of ranges){if(!marks.has(end))marks.set(end,new Set());marks.get(end).add(n)}
 }
 const answer=Array.from(row.answer??row.error??'No answer.').map((c,i)=>c+(marks.has(i+1)?[...marks.get(i+1)].map(n=>`[${n}]`).join(''):'' )).join('')
 lines.push('## '+questions.find(q=>q.id===row.id).question,'',answer,'','Citations:','')
 cited.forEach((s,i)=>lines.push(`- [${i+1}] ${s.resource}: [${String(s.title??'Source').split('\n')[0].replace(/[\[\]*]/g,'').slice(0,200)}](${new URL(s.url??s.href,'https://opax.com.au').href})`))
 lines.push('')
}
fs.writeFileSync(out+'/answers.md',lines.join('\n'))
console.log(JSON.stringify(summary))
if(rows.length!==5||rows.some(r=>r.error||r.calculator_contract.overall!=='pass'))process.exitCode=1
