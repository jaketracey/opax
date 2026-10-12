#!/usr/bin/env node
// Operator-only gold runner. Works in route or shadow mode. Never calls /api/ask.
// To rescore saved fixtures offline: --fixture <JSON file of {id,payload} rows>.
import {readFile,writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {score} from './agentic_ask_score.mjs'
const args=process.argv.slice(2)
const opt=(key,fallback)=>{const i=args.indexOf('--'+key);return i<0?fallback:args[i+1]}
export async function runGold({questions,base,secret,fixture,fetchImpl=fetch}) {
  const rows=[]
  for(const q of questions){
    let payload
    if(fixture)payload=fixture.find(r=>r.id===q.id)?.payload
    else {
      // Legacy gold defines unstated periods as whole-record. Make it explicit;
      // current-period fixture evidence is checked separately in the route tests.
      const period=/\b(?:this term|last term|since|(?:19|20)\d{2})\b/i.test(q.question)?undefined:'all'
      const response=await fetchImpl(new URL('/api/ops/ask-gold',base),{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+secret},body:JSON.stringify({question:q.question,...(period?{period}:{} )}),signal:AbortSignal.timeout(45_000)})
      if(!response.ok)throw new Error(`Operator gold route returned HTTP ${response.status} for ${q.id}`)
      payload=await response.json()
    }
    if(!payload)throw new Error(`Missing fixture for ${q.id}`)
    rows.push({id:q.id,payload,score:score(q,payload.answer,payload.answered===true)})
  }
  return {total:rows.length,passed:rows.filter(r=>r.score.pass).length,rows}
}
async function main(){
 const gold=JSON.parse(await readFile(new URL('../portal/test/fixtures/agentic-ask-gold.json',import.meta.url),'utf8'))
 const fixtureFile=opt('fixture'),base=opt('base'),out=opt('out')
 if(!fixtureFile && !base)throw Error('Pass --base for the operator route, or --fixture for offline scoring.')
 const secret=process.env.DAILY_POST_OPERATOR_SECRET
 if(!fixtureFile && !secret)throw Error('DAILY_POST_OPERATOR_SECRET must be set in the environment.')
 if(base){const u=new URL(base);if(u.protocol!=='https:' && !(u.protocol==='http:' && ['127.0.0.1','localhost'].includes(u.hostname)))throw Error('Use HTTPS or a local fixture host.');if([8910,8961].includes(Number(u.port)))throw Error('Reserved fixture port.')}
 const fixture=fixtureFile?JSON.parse(await readFile(fixtureFile,'utf8')):undefined
 const result=await runGold({questions:gold.questions,base,secret,fixture})
 if(out)await writeFile(out,JSON.stringify(result,null,2)+'\n')
 console.log(JSON.stringify({total:result.total,passed:result.passed,failures:result.rows.filter(r=>!r.score.pass).map(r=>({id:r.id,checks:r.score.checks}))}))
 if(result.passed!==result.total)process.exitCode=1
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Gold run failed; check the operator mode, bearer secret and fixture.');process.exitCode=1})
