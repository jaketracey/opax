#!/usr/bin/env node
// Five local-only receipt-wording probes, using the existing research eval harness.
import fs from 'node:fs'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {runEval} from './research_eval.mjs'
import {unsafeReceiptWording} from '../portal/src/receipt-language.mjs'

const root=fileURLToPath(new URL('../',import.meta.url))
const base=process.argv[2]??'http://127.0.0.1:8973'
const offline=base==='--offline'
if(!offline&&!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Receipt evals require a local server')
const out=process.argv[3]??root+'portal/private/ask-receipts-round2'
const questions=JSON.parse(fs.readFileSync(root+'portal/test/fixtures/ask-receipts-probes.json')).questions
const vars=offline?{}:Object.fromEntries(fs.readFileSync(root+'portal/.dev.vars','utf8').split('\n').map(l=>l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].replace(/^"|"$/g,'')]))
if(!offline&&!vars.DAILY_POST_OPERATOR_SECRET)throw Error('Local operator credential is missing')
fs.mkdirSync(out,{recursive:true})
const ledger=out+'/spend-ledger.json'
const previous=fs.existsSync(ledger)?JSON.parse(fs.readFileSync(ledger)).spent_upper_estimate:0
if(!offline&&previous>=1)throw Error('The US$1.00 session eval cap has been reached')
// For the bounded local Worker, use its existing $10/million token reservation rule.
// Keep all earlier unknown-cost reservations; an errored request retains this ceiling too.
let requestReserveUsd=0.75
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
 const bundled=await build({stdin:{contents:"export * from './src/research-calculated';export * from './src/research-grounding';export * from './src/research-writing';export * from './src/agentic-ask';",resolveDir:root+'portal'},bundle:true,write:false,format:'esm',platform:'node'})
 const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'))
 const deps={asset:async path=>JSON.parse(fs.readFileSync(root+'portal/public'+path)),origin:'https://example.invalid'}
 fixture=[]
 for(const q of questions){
  const result=await api.calculatedLookup('ranked_money',{}, {question:q.question},deps)
  const sheet=api.factSheet([result]),facts=api.writingFacts(undefined,sheet.facts,sheet.notes)
  const draft=q.id==='RC05'?result.data.payload:api.proseFallback({question:q.question,period:{kind:'all',label:''},facts})
  const payload=api.groundAnswerPayload(draft,q.question)
  fixture.push({id:q.id,mode:'loop',payload})
 }
}
const {rows,report,summary}=await runEval({questions,fixture,requestReserveUsd,modes:['loop'],bases:{loop:base},baseHost:offline?'offline local assets':base,route:'ask',secret:vars.DAILY_POST_OPERATOR_SECRET,operator:true,prod:false,limit:5,spendCap:1-previous,timeoutMs:120000,
 onRow:async({rows,spent})=>{
  fs.writeFileSync(out+'/in-progress.json',JSON.stringify({rows,spent},null,2))
  if(!offline)fs.writeFileSync(ledger,JSON.stringify({spent_upper_estimate:previous+spent,cap_usd:1},null,2))
  const row=rows.at(-1);console.log(`${row.id}: ${row.error??row.grade?.overall??'unknown'}, cost so far $${spent.toFixed(6)}`)
 }})
for(const row of rows){
 const answer=row.answer??''
 row.receipt_wording={safe:row.id==='RC05'||!unsafeReceiptWording(answer),receipts_lead:row.id==='RC05'||/disclosed receipts/i.test(answer.split('\n')[0]),basis:row.id==='RC05'?/balances owed at 30 June/.test(answer):/not a donation ranking/.test(answer)}
}
const execution=offline?'Offline calculated research tool and final answer boundary; no model generation':'Local Worker with model provider, remote data blocked'
fs.writeFileSync(out+'/results.json',JSON.stringify({execution,rows,report,summary},null,2))
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
 cited.forEach((s,i)=>lines.push(`- [${i+1}] ${s.resource}: [${s.title??'Source'}](${s.url??s.href}) — ${s.snippet??''}`))
 lines.push('')
}
fs.writeFileSync(out+'/answers.md',lines.join('\n'))
console.log(JSON.stringify(summary))
if(rows.length!==5||rows.some(r=>r.error||!r.receipt_wording?.safe||!r.receipt_wording?.receipts_lead||!r.receipt_wording?.basis))process.exitCode=1
