#!/usr/bin/env node
// Local saved-payload replay: only closed-family requests may change from the audit baseline.
import fs from 'node:fs'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
const root=fileURLToPath(new URL('../',import.meta.url)),{build}=createRequire(root+'portal/package.json')('esbuild')
const input=process.argv[2];if(!input)throw Error('Pass the saved 158-payload replay JSON')
const out=process.argv[3]??root+'portal/private/ask-receipts-round5',baseline=process.argv[4]??'3ed331fdf'
globalThis.fetch=()=>{throw Error('Receipt replay: network forbidden')}
async function moduleAt(sha){
 const plugins=sha?[{name:'baseline',setup(b){b.onLoad({filter:/\.(?:ts|mjs)$/},a=>a.path.startsWith(root+'portal/src/')?{contents:execFileSync('git',['show',sha+':'+a.path.slice(root.length)],{cwd:root,encoding:'utf8',maxBuffer:5e6}),loader:a.path.endsWith('.ts')?'ts':'js',resolveDir:a.path.slice(0,a.path.lastIndexOf('/'))}:undefined)}}]:[]
 const b=await build({stdin:{contents:"export * from './src/research-grounding';"+(!sha?"export * from './src/ask-money-routing';":''),resolveDir:root+'portal'},plugins,bundle:true,write:false,platform:'browser',format:'esm'})
 return import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))
}
const old=await moduleAt(baseline),now=await moduleAt(),saved=JSON.parse(fs.readFileSync(input)),rows=[],differences=[]
const assets={fetch:async request=>{const path=root+'portal/public'+new URL(request.url).pathname;return fs.existsSync(path)?Response.json(JSON.parse(fs.readFileSync(path))):new Response('',{status:404})}}
for(const [arm,data]of Object.entries(saved.results)){
 const threads=new Map()
 for(const [index,row]of data.rows.entries()){
  const question=row.payload.asked_as??(typeof row.question==='string'?row.question:row.question?.question)??row.turn?.standalone
  if(!question)throw Error('Missing question')
  const thread=/^FOLLOW-D\d+/.exec(row.id??'')?.[0],context=thread?threads.get(thread)??[]:[]
  const before=old.groundAnswerPayload(structuredClone(row.payload),question)
  const calculated=await now.federalPartyMoneyAnswer({question,context},assets)
  const after=calculated?now.publicPartyMoneyAnswer(calculated):now.groundAnswerPayload(structuredClone(row.payload),question)
  const changed=before.answer!==after.answer||JSON.stringify(before.citations)!==JSON.stringify(after.citations)
  const result={arm,position:index+1,id:row.id,family:!!calculated,changed,reason:calculated?'Replace the family response with the complete federal receipts calculator answer; no model prose.':'Keep audit-baseline non-family behaviour.'}
  if(changed)differences.push(result)
  rows.push({...result,question,context,before,after})
  if(thread)threads.set(thread,[...context,{author:'user',text:question}])
 }
}
const non_family_changes=rows.filter(r=>r.changed&&!r.family).map(r=>({arm:r.arm,id:r.id}))
const damaged_family_answers=rows.filter(r=>r.family&&r.after.answer_status==='calculated'&&(!r.after.answer.includes('| Donor | Disclosed receipts | Records |')||!r.after.answer.includes('not a donation ranking')||!Object.keys(r.after.citations??{}).length)).map(r=>({arm:r.arm,id:r.id}))
const summary={baseline,input,payloads:rows.length,family:rows.filter(r=>r.family).length,changed:differences.length,differences,non_family_changes,damaged_family_answers,network_requests:0,model_calls:0,spend_usd:0}
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/replay.json',JSON.stringify({summary,rows},null,2));fs.writeFileSync(out+'/replay-summary.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary))
if(rows.length!==158||non_family_changes.length||damaged_family_answers.length)process.exitCode=1
