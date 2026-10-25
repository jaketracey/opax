#!/usr/bin/env node
// Replay the saved research corpus without network calls or model calls.
import fs from 'node:fs'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(root+'portal/package.json')
const {build}=require('esbuild')
const input=process.argv[2]
if(!input)throw Error('Pass the existing saved 158-payload replay JSON')
const out=process.argv[3]??root+'portal/private/ask-receipts-round3'
const baseline=process.argv[4]??'e234e96f144d99605baca2d4ca5b8ac6e9f00437'
globalThis.fetch=()=>{throw Error('Receipt replay: network forbidden')}
async function moduleAt(sha){
 const plugins=sha?[{name:'baseline',setup(b){b.onLoad({filter:/\.(?:ts|mjs)$/},a=>{
  if(!a.path.startsWith(root+'portal/src/'))return
  return {contents:execFileSync('git',['show',sha+':'+a.path.slice(root.length)],{cwd:root,encoding:'utf8',maxBuffer:5e6}),loader:a.path.endsWith('.ts')?'ts':'js',resolveDir:a.path.slice(0,a.path.lastIndexOf('/'))}
 })}}]:[]
 const result=await build({stdin:{contents:"export * from './src/research-grounding';export * from './src/receipt-language.mjs';export * from './src/research-receipts';",resolveDir:root+'portal'},plugins,bundle:true,write:false,platform:'browser',format:'esm'})
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))
}
// The new helper is deliberately not part of the baseline entry point.
async function oldModule(){
 const result=await build({stdin:{contents:"export * from './src/research-grounding';",resolveDir:root+'portal'},plugins:[{name:'baseline',setup(b){b.onLoad({filter:/\.(?:ts|mjs)$/},a=>a.path.startsWith(root+'portal/src/')?{contents:execFileSync('git',['show',baseline+':'+a.path.slice(root.length)],{cwd:root,encoding:'utf8',maxBuffer:5e6}),loader:a.path.endsWith('.ts')?'ts':'js',resolveDir:a.path.slice(0,a.path.lastIndexOf('/'))}:undefined)}}],bundle:true,write:false,platform:'browser',format:'esm'})
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))
}
const old=await oldModule(),now=await moduleAt(),saved=JSON.parse(fs.readFileSync(input)),rows=[],differences=[]
const amounts=text=>(String(text).match(/\$[\d,]+(?:\.\d+)?(?:[ \u00a0]*(?:million|billion|thousand|bn|[mkb])\b)?/gi)??[]).map(s=>s.replaceAll(',','')).sort()
const numbers=text=>(String(text).match(/\d[\d,]*(?:\.\d+)?/g)??[]).map(s=>s.replaceAll(',','')).sort()
for(const [arm,data]of Object.entries(saved.results))for(const [index,row]of data.rows.entries()){
 const question=row.payload.asked_as??(typeof row.question==='string'?row.question:row.question?.question)??row.turn?.standalone
 if(!question)throw Error('Missing question')
 const before=old.groundAnswerPayload(structuredClone(row.payload),question),after=now.groundAnswerPayload(structuredClone(row.payload),question)
 const changed=before.answer!==after.answer||JSON.stringify(before.citations)!==JSON.stringify(after.citations)
 const same_numbers=JSON.stringify(numbers(before.answer))===JSON.stringify(numbers(after.answer))
 const same_amounts=JSON.stringify(amounts(before.answer))===JSON.stringify(amounts(after.answer))
 const money=before.sources?.some(now.receiptSource)||after.sources?.some(now.receiptSource)
 const oldAgain=old.groundAnswerPayload(structuredClone(before),question)
 const baseline_idempotent=before.answer===oldAgain.answer&&JSON.stringify(before.citations)===JSON.stringify(oldAgain.citations)
 const again=now.groundAnswerPayload(structuredClone(after),question)
 const idempotent=after.answer===again.answer&&JSON.stringify(after.citations)===JSON.stringify(again.citations)
 const unsafe=now.receiptWordingFindings(after).length>0
 const grammar=now.receiptGrammarFindings(after.answer)
 const result={arm,position:index+1,id:row.id,changed,same_numbers,same_amounts,money:!!money,idempotent,baseline_idempotent,unsafe:!!unsafe,grammar}
 if(changed){
  const why=[]
  if(/receipts to the most|in disclosed receipts (?:million|billion|thousand)/i.test(before.answer))why.push('replace a garbled migration with a complete receipt sentence')
  if(/\b(?:gave|given|gives|donat\w*|funded|funding|funds)\b/i.test(before.answer.replaceAll(now.FEDERAL_RECEIPTS_NOTE,'')))why.push('remove gift or funding framing')
  if(/\bdonors?\b/i.test(before.answer))why.push('label the ranking and its sources as receipts')
  if(/,,|(?:^|\n)and [^\n]+\$/.test(before.answer))why.push('repair punctuation or a dangling sentence')
  if(!before.answer.includes(now.FEDERAL_RECEIPTS_NOTE)&&after.answer.includes(now.FEDERAL_RECEIPTS_NOTE))why.push('state the mixed-receipts limitation')
  differences.push({...result,reason:why.join('; ')||'correct receipt-source wording and move its citations'})
 }
 rows.push({...result,question,before,after})
}
const summary={baseline,input,payloads:rows.length,changed: differences.length,differences,number_changes:rows.filter(r=>!r.same_numbers).map(r=>({arm:r.arm,id:r.id})),non_money_changes:rows.filter(r=>r.changed&&!r.money).map(r=>({arm:r.arm,id:r.id})),not_idempotent:rows.filter(r=>!r.idempotent).map(r=>({arm:r.arm,id:r.id})),new_idempotence_failures:rows.filter(r=>!r.idempotent&&r.baseline_idempotent).map(r=>({arm:r.arm,id:r.id})),unsafe:rows.filter(r=>r.unsafe).map(r=>({arm:r.arm,id:r.id})),grammar_failures:rows.filter(r=>r.money&&r.grammar.length).map(r=>({arm:r.arm,id:r.id,findings:r.grammar})),amount_changes:rows.filter(r=>!r.same_amounts).map(r=>({arm:r.arm,id:r.id})),network_requests:0,model_calls:0,spend_usd:0}
const original46=JSON.parse(fs.readFileSync(root+'docs/evidence/ask-receipts-wording-2026-10-25/replay-summary.json')).differences.map(d=>rows.find(r=>r.arm===d.arm&&r.id===d.id))
if(original46.length!==46||original46.some(r=>!r))throw Error('The complete original 46-answer selection is required')
summary.original_46_checked=original46.length
summary.original_46_grammar_failures=original46.filter(r=>r.grammar.length).map(r=>({arm:r.arm,id:r.id,findings:r.grammar}))
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/replay.json',JSON.stringify({summary,rows},null,2));fs.writeFileSync(out+'/replay-summary.json',JSON.stringify(summary,null,2)+'\n')
console.log(JSON.stringify(summary))
if(rows.length!==158||summary.number_changes.length||summary.amount_changes.length||summary.original_46_grammar_failures.length||summary.non_money_changes.length||summary.new_idempotence_failures.length||summary.unsafe.length||summary.grammar_failures.length)process.exitCode=1
