// A money question the industry route cannot calculate steps aside for the Ask agent and its money tools,
// instead of answering with a pointer to the money map. Hermetic: the published graphs, a mock model, no live calls.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {build} from 'esbuild'
import {MockLanguageModelV4} from 'ai/test'
import {localApi,localAsk,assets} from './ask-lobby-money-harness.mjs'

const built=await build({stdin:{contents:"export {runAgentic,inferPeriod} from './src/agentic-ask';export {createResearch} from './src/research-loop';export {createResearchCreditCooldown} from './src/research-credit';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'browser',format:'esm',external:['node:*']})
const loop=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const api=await localApi()
const asset=async path=>{try{return JSON.parse(await readFile(new URL('../public'+path,import.meta.url),'utf8'))}catch{return null}}
const emptyScope={people:[],parties:[],bills:[],ambiguous:false,unresolved:false}
const reply=calls=>({content:calls,finishReason:{unified:'tool-calls',raw:'tool_calls'},usage:{inputTokens:{total:10,noCache:10,cacheRead:0,cacheWrite:0},outputTokens:{total:5,text:5,reasoning:0}},warnings:[]})
const call=(id,name,args)=>({type:'tool-call',toolName:name,toolCallId:id,input:JSON.stringify(args)})
// The model looks the money up with money_totals, then stops; what matters is that the agent ran with its money tools.
function agent(args){
 let turn=0
 const model=new MockLanguageModelV4({doGenerate:async()=>reply([++turn===1?call('t1','money_totals',args):call('t2','decline',{reason:'out_of_scope'})])})
 const research=Object.assign(loop.createResearch({inputPrice:0.1,outputPrice:0.3,model,modelBudgetSpent:async()=>false,dailyBudget:{reserve:async()=>({settle:async()=>{}})},creditCooldown:loop.createResearchCreditCooldown()}),{write:undefined})
 const deps={asset,origin:'https://opax.com.au',kb:async()=>({}),generate:async()=>{throw new Error('the old planner must not run')},research,onResearchFailure:async()=>{}}
 return {model,run:q=>loop.runAgentic(q,deps,async()=>{},40_000,loop.inferPeriod(q),{},emptyScope)}
}
const toolNames=call=>(call.tools??[]).map(t=>t.name)
const gaps=/money records are unavailable|groups money-map sources into|Choose a recipient party in the \[money map\]|so the calculation covers the whole question/

const fallthrough=[
 // "NSW" reads as a jurisdiction without a receipt graph; the federal record is the donor "Clubs NSW".
 ['How much has Clubs NSW donated to political parties?',{donor:'Clubs NSW',measure:'donations'}],
 // The trailing "donations" reads a party-receipts question as an industry with no grouping.
 ['How much did the Liberal Party receive in donations in 2023-24?',{party:'Liberal Party',financial_year:'2023-24',measure:'donations'}],
]
for(const [question,args] of fallthrough)test('an uncalculated money question steps aside for the agent: '+question,async()=>{
 assert.ok(api.industryMoneyIntent(question),'the industry wording still matches')
 assert.equal(await api.industryMoneyAnswer({question},assets),null)
 assert.equal(await api.federalPartyMoneyAnswer({question},assets),null)
 let researched=false
 const out=await localAsk(api,question,{onResearch:()=>{researched=true}})
 assert.equal(researched,true,'the agent path runs');assert.doesNotMatch(out.answer,gaps)
 const f=agent(args),run=await f.run(question)
 assert.ok(f.model.doGenerateCalls.length>=1,'the model is asked')
 assert.ok(toolNames(f.model.doGenerateCalls[0]).includes('money_totals'),'the agent has its money tools')
 const step=run.steps.find(s=>s.tool==='money_totals')
 assert.ok(step?.ok,'money_totals answers the named '+(args.donor?'donor':'party'))
 assert.doesNotMatch(run.answer??'',gaps)
})

test('a real industry question keeps its calculated ranking before any model turn',async()=>{
 const question='Who got donations from the gambling industry?'
 const p=await api.industryMoneyAnswer({question},assets)
 assert.equal(p.answer_status,'calculated');assert.match(p.answer,/^\*\*Liberal\*\* leads parties receiving money from gambling-linked sources/)
 const f=agent({donor:'unused'}),run=await f.run(question)
 assert.equal(f.model.doGenerateCalls.length,0)
 assert.match(run.answer,/gambling-linked sources/)
})

test('a filter the reader set still asks for receipt records',async()=>{
 const p=await api.industryMoneyAnswer({question:'How much did the Liberal Party receive in donations in 2023-24?',topic:'gambling'},assets)
 assert.equal(p.answer_status,'needs_scope');assert.match(p.answer,/^Choose receipt records and clear the speaker, chamber and topic filters/)
})
