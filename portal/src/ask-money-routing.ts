import type {RecordQuestion} from './ask-records'
import {rankedMoneyAnswer, fundingResearchFollowUp} from './ask-money'
import {fundingContinuation, fundingUserTurns} from './ask-money-followup'
import {federalPartyRankingQuestion} from './ask-money-family'
export {federalPartyRankingQuestion} from './ask-money-family'

export type PartyMoneyAnswer=NonNullable<Awaited<ReturnType<typeof rankedMoneyAnswer>>>&{money_route:'federal-party-ranking-v1'}
/** Resolve before model selection, model prose, cache reads or paid overview. */
export async function federalPartyMoneyAnswer(input:RecordQuestion,assets:Fetcher):Promise<PartyMoneyAnswer|null> {
 if(input.state&&input.state!=='federal')return null
 const direct=federalPartyRankingQuestion(input.question??'')
 const prior=fundingUserTurns(input)
 if(!direct&&(!fundingContinuation(input.question??'')||!prior.some(q=>federalPartyRankingQuestion(q))))return null
 const context=Array.isArray(input.context)?input.context.map(turn=>turn&&typeof turn.text==='string'&&(turn.author==='user'||turn.author==='question')?{...turn,text:federalPartyRankingQuestion(turn.text)??turn.text}:turn):undefined
 let scoped:RecordQuestion={...input,kind:'all',context,question:direct??input.question}
 if(!direct){
  // Resolve the continuation's intent before interpreting its record filters.
  // A new speech question can carry a topic after a money question.
  const follow=await fundingResearchFollowUp({...scoped,speaker:undefined,chamber:undefined,topic:undefined},assets)
  if(!follow)return null
  const question='answer' in follow?follow.money_question:follow.question
  if(!question||!federalPartyRankingQuestion(question))return null
  if('answer' in follow&&!input.speaker&&!input.chamber&&!input.topic&&(!input.kind||['all','receipt','speech'].includes(input.kind)))return {...follow,money_route:'federal-party-ranking-v1'}
  scoped={...scoped,context:undefined,question}
 }
 if(input.speaker||input.chamber||input.topic||input.kind&&!['all','receipt','speech'].includes(input.kind))return {answer:'This is a federal party-receipt ranking. Clear the speaker, chamber, topic or other record filters to calculate it.',answer_status:'needs_scope',money_ranking:true,citations:{},sources:[],money_route:'federal-party-ranking-v1'}
 const payload=await rankedMoneyAnswer(scoped,assets)
 if(!payload)return null
 // Validate the party against the calculator's actual federal graph selection.
 return {...payload,money_route:'federal-party-ranking-v1'}
}
/** Internal overview facts never enter the emitted payload. No prose is edited. */
export function publicPartyMoneyAnswer(payload:PartyMoneyAnswer) {
 const {money_facts:_facts,...out}=payload as PartyMoneyAnswer&{money_facts?:unknown}
 return out
}
export function federalPartyMoneyResponse(payload:PartyMoneyAnswer,request:Request):Response {
 const out=publicPartyMoneyAnswer(payload),stream=new URL(request.url).searchParams.get('stream')==='1'||request.headers.get('accept')?.includes('text/event-stream')
 const headers={'x-opax-money-route':'federal-party-ranking-v1','cache-control':'no-store','x-opax-cache':'BYPASS'}
 return stream?new Response('event: done\ndata: '+JSON.stringify(out)+'\n\n',{headers:{...headers,'content-type':'text/event-stream'}}):Response.json(out,{headers})
}
