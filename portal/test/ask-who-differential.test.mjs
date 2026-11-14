import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {build} from 'esbuild'
import {sentenceParts} from '../src/research-claim-audit.mjs'
import {cases} from './fixtures/ask-who-differential/cases.mjs'

// These outputs were captured from the pinned main source, with the same lockfile and offline boundary.
const baseline=JSON.parse(readFileSync(new URL('./fixtures/ask-who-differential/main.json',import.meta.url)))
const built=await build({stdin:{contents:"export {withAnswerLanguage} from './src/research-response'",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const realFetch=globalThis.fetch,rows=[]
globalThis.fetch=async()=>{throw Error('Who differential must remain offline')}
test.after(()=>{
 globalThis.fetch=realFetch
 if(process.env.ASK_WHO_DIFF_REPORT)writeFileSync(process.env.ASK_WHO_DIFF_REPORT,JSON.stringify({main:baseline.revision,rows},null,2)+'\n')
})
const missing='The cited sources do not name a person or office as responsible.'
const normal=s=>s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()
const first=p=>sentenceParts(p.answer).find(s=>s.text!==missing)
const kinds=(p,s,input)=>{
 if(!s)return []
 const from=Array.from(p.answer.slice(0,s.at)).length,until=from+Array.from(s.text).length
 return input.sources.filter(source=>Object.entries(p.citations).some(([id,ranges])=>(id===source.resource||id.startsWith(source.resource+'/'))&&ranges.some(([a,b])=>a<until&&b>from))).map(s=>s.kind)
}
test('who differential covers every case against a pinned main and five ordinary controls',()=>{
 assert.match(baseline.revision,/^[0-9a-f]{40}$/)
 assert.deepEqual(Object.keys(baseline.cases).sort(),cases.map(c=>c.id).sort())
 assert.equal(cases.filter(c=>c.ordinary).length,5)
})
for(const c of cases)test('main differential: '+c.id,async()=>{
 const main=baseline.cases[c.id],branch=await(await api.withAnswerLanguage(Response.json(c.input),c.question)).json()
 const mainFirst=first(main),branchFirst=first(branch),mainKinds=kinds(main,mainFirst,c.input),branchKinds=kinds(branch,branchFirst,c.input)
 const mainRecordFirst=mainKinds.includes('record')&&/\b(?:found|findings|concluded|approved|authorised|determined)\b/i.test(mainFirst.text)
 const lost=c.retain.filter(text=>!normal(branch.answer).includes(normal(text)))
 const row={id:c.id,group:c.group,mainKind:[...new Set(mainKinds)].sort().join('+')||'uncited',branchKind:[...new Set(branchKinds)].sort().join('+')||'uncited',addedMissing:!main.answer.includes(missing)&&branch.answer.includes(missing),lost,recordRegression:mainRecordFirst&&branchKinds.length>0&&branchKinds.every(k=>k==='speech'),recordFirst:!c.recordFirst||normal(branchFirst.text)===normal(c.recordFirst),ordinaryIdentical:!c.ordinary||branch.answer===main.answer,mainLead:mainFirst?.text,branchLead:branchFirst?.text}
 rows.push(row)
 assert.equal(row.addedMissing,false,'branch must not add a do-not-name line absent on main')
 assert.deepEqual(lost,[],'every distinct original statement must survive; duplicate findings use explicit shared-claim anchors')
 assert.equal(row.recordRegression,false,'a speech-only sentence cannot displace a record finding that led on main')
 assert.equal(row.recordFirst,true,'a record finding outranks criticism in a speech')
 assert.equal(row.ordinaryIdentical,true,'ordinary answers remain identical')
 for(const id of Object.keys(main.citations))assert.ok(branch.citations[id]?.length,'main citation survives: '+id)
 for(const ranges of Object.values(branch.citations))for(const [a,b]of ranges)assert.ok(a>=0&&b>a&&b<=Array.from(branch.answer).length,'valid citation range')
})
