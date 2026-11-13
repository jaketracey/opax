import {trimQuestionEnd, questionSpaces} from './question-text.mjs'
import type {RecordQuestion} from './ask-records'
import {rankedMoneyAnswer, fundingResearchFollowUp} from './ask-money'
import {fundingContinuation, fundingUserTurns} from './ask-money-followup'
import {federalPartyRankingQuestion,federalPartyRankingIntent,federalPartyRankingClarification,federalPartyRankingReading} from './ask-money-family'
import {industryMoneyAnswer} from './ask-money-industry'
export {federalPartyRankingQuestion,federalPartyRankingIntent} from './ask-money-family'

export type PartyMoneyAnswer=(NonNullable<Awaited<ReturnType<typeof rankedMoneyAnswer>>>|NonNullable<Awaited<ReturnType<typeof industryMoneyAnswer>>>)&{money_route:'federal-party-ranking-v1'}
/** Resolve before model selection, model prose, cache reads or paid overview. */
export async function federalPartyMoneyAnswer(input:RecordQuestion,assets:Fetcher):Promise<PartyMoneyAnswer|null> {
 const industry=await industryMoneyAnswer(input,assets)
 if(industry)return {...industry,money_route:'federal-party-ranking-v1'}
 if(input.state&&input.state!=='federal')return null
 const intent=federalPartyRankingIntent(input.question??'')
 if(intent?.uncertain&&intent.parties.length===1){
  // Calculated for the natural reading, which the answer states.
  const read=await rankedMoneyAnswer({...input,kind:'all'},assets)
  if(read)return {...read,money_route:'federal-party-ranking-v1'} as PartyMoneyAnswer
 }
 if(intent?.uncertain)return {...federalPartyRankingClarification(intent),money_route:'federal-party-ranking-v1'}
 const direct=intent?.question??null
 const prior=fundingUserTurns(input)
 if(!intent&&fundingContinuation(input.question??'')&&prior.length){
  const unresolved=federalPartyRankingIntent(prior[prior.length-1])
  if(unresolved?.uncertain&&unresolved.parties.length>1){
   const fragment=trimQuestionEnd(questionSpaces(input.question??'').replace(/^(?:and )?(?:(?:what|how) about )/i,'').replace(/^and /i,''))
   const party=federalPartyRankingIntent('Who funds '+fragment+'?')
   const period=/^(?:in|during|for|since|from|before|after|until|through|between)\s+(?:19|20)\d{2}(?:[–-]\d{2})?(?:\s+(?:to|and|through)\s+(?:19|20)\d{2}(?:[–-]\d{2})?)?$/i.test(fragment)
   if(party||period)return {...federalPartyRankingClarification(party??unresolved),money_route:'federal-party-ranking-v1'}
  }
 }
 // An earlier informal party ranking carries forward as the reading it was answered with.
 if(!direct&&(!fundingContinuation(input.question??'')||!prior.some(q=>federalPartyRankingReading(q))))return null
 const context=Array.isArray(input.context)?input.context.map(turn=>turn&&typeof turn.text==='string'&&(turn.author==='user'||turn.author==='question')?{...turn,text:federalPartyRankingReading(turn.text)??turn.text}:turn):undefined
 let scoped:RecordQuestion={...input,kind:'all',context,question:direct&&/\btop\s+10\b/i.test(input.question??'')?input.question:direct??input.question}
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
