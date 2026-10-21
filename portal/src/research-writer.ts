import { generateText } from 'ai'
import { proseFallback, verifyWrittenAnswer, writingPrompt, type WritingInput } from './research-writing'
import { researchTurnReservationUsd } from './research-budget'
import { isResearchCreditError, researchCreditCooldown } from './research-credit'
import type { ResearchOptions } from './research-loop'
import type { QualitativeAnswer, ResearchStats } from './research-types'

/** Same pinned model, provider, limiter, token ceiling, wall cap and D1 reservation as research. */
export function createAnswerWriter(options: ResearchOptions) {
  return async (input: WritingInput, stats: ResearchStats, signal: AbortSignal | undefined, remainingMs: number): Promise<QualitativeAnswer> => {
    const fallback=()=>proseFallback(input), credits=options.creditCooldown ?? researchCreditCooldown
    if (!input.facts.length || !options.model || signal?.aborted || remainingMs<250 || credits.blocked()) return fallback()
    const prompt=writingPrompt(input), inputReserve=Math.ceil(prompt.length/3)+1024, outputReserve=Math.min(1400,Math.min(160000,Number(options.tokens ?? 96000))-stats.tokens.input-stats.tokens.output-inputReserve)
    if (outputReserve<=0) return fallback()
    try {if(await options.modelBudgetSpent())return fallback()}catch{return fallback()}
    if(signal?.aborted)return fallback()
    const inPrice=options.inputPrice ?? 1, outPrice=options.outputPrice ?? 3
    let reservation;try {reservation=await options.dailyBudget.reserve(researchTurnReservationUsd(inputReserve,outputReserve,inPrice,outPrice))}catch{return fallback()}
    if(!reservation)return fallback()
    const controller=new AbortController(), abort=()=>controller.abort(signal?.reason)
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()
    const timer=setTimeout(()=>controller.abort(new DOMException('Answer writing wall cap','TimeoutError')),Math.min(8000,remainingMs))
    let receipt: number|undefined, turn: NonNullable<ResearchStats['turns']>[number]|undefined
    const started=Date.now()
    try {
      stats.usageUnknown=true
      turn={round:stats.rounds+1,input:null,output:null,cached_input:null,input_reserve:inputReserve,ms:0,cost_usd:null}
      ;(stats.turns ??=[]).push(turn)
      const stopped=new Promise<never>((_,reject)=>controller.signal.addEventListener('abort',()=>reject(controller.signal.reason),{once:true}))
      const result=await Promise.race([generateText({model:options.model,prompt,maxRetries:0,maxOutputTokens:outputReserve,abortSignal:controller.signal}),stopped])
      stats.usageUnknown=false
      const inputTokens=result.usage.inputTokens ?? inputReserve, outputTokens=result.usage.outputTokens ?? outputReserve
      const meta=result.providerMetadata?.openrouter as {provider?:string;usage?:{cost?:number}}|undefined
      if(typeof meta?.usage?.cost==='number' && Number.isFinite(meta.usage.cost) && meta.usage.cost>=0)receipt=meta.usage.cost
      const cost=receipt ?? (inputTokens*inPrice+outputTokens*outPrice)/1e6
      stats.tokens.input+=inputTokens;stats.tokens.output+=outputTokens;stats.costUsd=(stats.costUsd??0)+cost
      Object.assign(turn,{input:inputTokens,output:outputTokens,cached_input:result.usage.inputTokenDetails?.cacheReadTokens??0,cost_usd:cost,provider:meta?.provider??'',ms:Date.now()-started})
      if(stats.tokens.input+stats.tokens.output>Math.min(160000,Number(options.tokens ?? 96000)))return fallback()
      let raw;try{raw=JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g,''))}catch{return fallback()}
      return verifyWrittenAnswer(raw,input) ?? fallback()
    }catch(error){
      if(isResearchCreditError(error)){credits.exhaust();receipt=0;stats.usageUnknown=false;if(turn)Object.assign(turn,{input:0,output:0,cost_usd:0})}
      return fallback()
    }finally{
      if(turn)turn.ms=Date.now()-started
      clearTimeout(timer);signal?.removeEventListener('abort',abort)
      const cleanup=reservation.settle(receipt).catch(()=>{})
      if(options.cleanup)options.cleanup(cleanup)
      else await cleanup
      stats.cachedByTurn=stats.turns?.map(t=>t.cached_input);options.onUsage?.(stats)
    }
  }
}
