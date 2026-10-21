// Independent, offline claim audit. No inference, network requests or answer-as-evidence.
import {readFile,writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'
import {auditPayload} from '../portal/src/research-claim-audit.mjs'
export {auditPayload} from '../portal/src/research-claim-audit.mjs'
async function main(){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node scripts/research_eval_audit.mjs comparison.json audit.json')
 const {loadQuestions,loadRoster}=await import('./research_eval.mjs'),{roster}=await loadRoster(),questions=[...(await loadQuestions('routing')).slice(0,45),...JSON.parse(await readFile(new URL('../portal/test/fixtures/ask-routing-review-probes.json',import.meta.url),'utf8')).questions],byId=new Map(questions.map(q=>[q.id,q]))
 const comparison=JSON.parse(await readFile(input,'utf8')),sides=Array.isArray(comparison.rows)?{new:comparison.rows}:comparison.rows,audits={}
 for(const [side,rows]of Object.entries(sides))audits[side]=rows.map(row=>({id:row.id,...auditPayload(byId.get(row.id)?.question??row.question??'',row.payload??row,{roster})}))
 const summary=Object.fromEntries(Object.entries(audits).map(([side,rows])=>[side,{payloads:rows.length,claims:rows.reduce((s,r)=>s+r.counts.claims,0),unverified:rows.reduce((s,r)=>s+r.findings.length,0),affected:rows.filter(r=>r.findings.length).map(r=>r.id)}]))
 await writeFile(output,JSON.stringify({generated:new Date().toISOString(),input:resolve(input),summary,rows:audits},null,2)+'\n');console.log(JSON.stringify(summary))
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main()
