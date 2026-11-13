// Hermetic local research-loop replay. Model output is deliberately adversarial;
// money amounts come from the published (typed) graph unless a caller asks for the untyped
// fallback; speech counts are seeded fixtures.
import {build} from 'esbuild'
import {moneyAsset,moneyAssets} from './money-graph-data.mjs'
import assert from 'node:assert/strict'
const root=new URL('../',import.meta.url).pathname
export async function localApi(){
 const b=await build({stdin:{contents:"export {runAgentic,verifyComposition} from './src/agentic-ask';export {agenticAskPayload} from './src/agentic-response';export {linkAskSources} from './src/ask-source-links';export {federalPartyMoneyAnswer} from './src/ask-money-routing';export {rankedMoneyAnswer} from './src/ask-money';export {industryMoneyIntent,industryMoneyAnswer} from './src/ask-money-industry';",resolveDir:root},bundle:true,write:false,platform:'node',format:'esm'})
 return import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))
}
export const asset=moneyAsset('typed')
export const assets=moneyAssets('typed')
const empty={people:[],parties:[],bills:[],ambiguous:false,unresolved:false}
export function replayAnswer(question){
 const topic=/mining/i.test(question)?'mining':/banks/i.test(question)?'finance':/union/i.test(question)?'unions':/tobacco/i.test(question)?'tobacco':'gambling'
 const speech=/talks about/i.test(question)
 const answer=speech?'Labor MPs gave the most speeches labelled gambling, with 682 chamber speeches, ahead of Liberal MPs with 617 and Justin Field with 87.':`Labor takes the most money from the ${topic} lobby, with 682 chamber speeches labelled ${topic}, ahead of the Liberal Party's 617 and Justin Field's 87.`
 const sources=[['Labor',682],['Liberal',617],['Justin Field',87]].map(([name,n],i)=>({resource:'replay-'+i,kind:'count',title:`${name}: ${n} chamber speeches labelled ${topic}`,snippet:`${name}: ${n} chamber speeches labelled ${topic}`,href:`/search?topic=${topic}`,url:`/search?topic=${topic}`,cited:true,slug:''}))
 return {answer,sources,citations:Object.fromEntries(sources.map(s=>[s.resource+'/t/body/0',[[0,Array.from(answer).length]]]))}
}
export async function localAsk(api,question,{filters={},onResearch=()=>{},money='typed'}={}){
 const qualitative=replayAnswer(question)
 const research=async(_q,ctx)=>{
  onResearch()
  const step={tool:'count_speeches',args:{topic:'gambling',group_by:'party'}}
  const result=await ctx.execute(step,1,async()=>({tool:'count_speeches',ok:true,data:{rows:[{name:'Labor',count:682},{name:'Liberal',count:617}],filter:{topic:'gambling'},described:'chamber speeches labelled gambling'},cite:qualitative.sources.map(s=>({kind:s.kind,label:s.title,url:s.url})),notes:[]}))
  return {qualitative,steps:[step],results:[result],selected:[1,2],rounds:1,tokens:{input:0,output:0},costUsd:0}
 }
 const deps={asset:moneyAsset(money),kb:async()=>({}),generate:async()=>{throw Error('No provider calls in local replay')},research}
 const run=await api.runAgentic(question,deps,undefined,40000,undefined,filters,empty)
 return api.linkAskSources(api.agenticAskPayload(run,question),run.source_links,'http://127.0.0.1:8963')
}
export const localFetch=api=>async(url,init)=>{
 assert.equal(new URL(url).origin,'http://127.0.0.1:8963')
 assert.equal(new URL(url).pathname,'/api/ask')
 return Response.json(await localAsk(api,JSON.parse(init.body).question))
}
