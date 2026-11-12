import { generateText } from 'ai'
import {researchTrace} from './research-trace'
import { reserveQuestionTurn, ASK_DEFAULT_TOKENS, ASK_MAX_TOKENS } from './ask-budgets'
import { proseFallback, verifyWrittenAnswer, writingPrompt, draftWrittenAnswer, type WritingInput } from './research-writing'
import { researchTurnReservationUsd } from './research-budget'
import { isResearchCreditError, researchCreditCooldown } from './research-credit'
import type { ResearchOptions } from './research-loop'
import {groundAnswerPayload} from './research-grounding'
import {auditPayload} from './research-claim-audit.mjs'
import type { QualitativeAnswer, ResearchStats } from './research-types'
import {recordAnswerLines} from './research-record-answer'
import {moneyWritingInput,receiptWritingLines,completeMoneySelection} from './research-money-writing'

/** Same pinned model, provider, limiter, token ceiling, wall cap and D1 reservation as research. */
export function createAnswerWriter(options: ResearchOptions) {
  return async (input: WritingInput, stats: ResearchStats, signal: AbortSignal | undefined, remainingMs: number): Promise<QualitativeAnswer> => {
    input=moneyWritingInput(input)
    // Every check sees all the facts handed in, not just those a draft happened to cite.
    const found=input.facts.map(f=>({...f.source,snippet:f.text,...(f.coverage?{coverage:true}:{})}))
    const ground=(payload:QualitativeAnswer)=>{const {research:_found,...checked}=groundAnswerPayload({...payload,research:{pre_writer_sources:found}},input.question);return checked as unknown as QualitativeAnswer}
    // Exact record findings have a complete prose answer without a writing turn, unless that prose is only a limit.
    if(recordAnswerLines(input)||receiptWritingLines(input)||completeMoneySelection(input)){const exact=proseFallback(input);if(exact.answer_decision!=='limitation')return ground(exact)}
    let lastDraft:QualitativeAnswer|null=null
    // A stopped writer keeps what it wrote; with nothing written, the facts are rendered as recorded.
    const fallback=():QualitativeAnswer=>{
      stats.coherence={...stats.coherence,fallback:true}
      if(lastDraft&&lastDraft.answer.trim()){const checked=ground(lastDraft);return {...checked,coherence:{...checked.coherence,fallback:true}}}
      const facts=proseFallback(input)
      return ground({...facts,coherence:{...facts.coherence,fallback:true}})
    }, credits=options.creditCooldown ?? researchCreditCooldown
    if (!input.facts.length || !options.model || signal?.aborted || remainingMs<250 || credits.blocked()) return fallback()
    const activeInput=input
    let prompt=writingPrompt(input)
    const startedWriting=Date.now()
    const inputReserve=Math.ceil(prompt.length/3)+1024, outputReserve=Math.min(1400,Math.min(ASK_MAX_TOKENS,Number(options.tokens ?? ASK_DEFAULT_TOKENS))-stats.tokens.input-stats.tokens.output-inputReserve)
    if (outputReserve<=0) return fallback()
    for(let pass=0;pass<2;pass++){
      if(credits.blocked())return fallback()
      if(pass&&remainingMs-(Date.now()-startedWriting)<250)return fallback()
      const currentPrompt=prompt
      if (outputReserve<=0) return fallback()
      try {if(await options.modelBudgetSpent())return fallback()}catch{return fallback()}
      if(signal?.aborted||stats.tokens.input+stats.tokens.output+Math.ceil(currentPrompt.length/3)+1024+outputReserve>Math.min(ASK_MAX_TOKENS,Number(options.tokens??ASK_DEFAULT_TOKENS)))return fallback()
      const inPrice=options.inputPrice ?? 1, outPrice=options.outputPrice ?? 3
      let reservation;try {reservation=await reserveQuestionTurn(stats,researchTurnReservationUsd(inputReserve,outputReserve,inPrice,outPrice),options.dailyBudget)}catch{return fallback()}
      if(!reservation)return fallback()
      const controller=new AbortController(), abort=()=>controller.abort(signal?.reason)
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()
      const timer=setTimeout(()=>controller.abort(new DOMException('Answer writing wall cap','TimeoutError')),Math.min(8000,remainingMs-(Date.now()-startedWriting)))
      let receipt: number|undefined, turn: NonNullable<ResearchStats['turns']>[number]|undefined
      const started=Date.now()
      try {
        if(controller.signal.aborted||signal?.aborted||Date.now()-startedWriting>=remainingMs)return fallback()
        stats.coherence={...stats.coherence,writer_passes:pass+1,second_passes:pass}
        stats.usageUnknown=true
        turn={round:stats.rounds+1,input:null,output:null,cached_input:null,input_reserve:inputReserve,ms:0,cost_usd:null}
        ;(stats.turns ??=[]).push(turn)
        const stopped=new Promise<never>((_,reject)=>controller.signal.addEventListener('abort',()=>reject(controller.signal.reason),{once:true}))
        const result=await Promise.race([generateText({model:options.model,prompt:currentPrompt,maxRetries:0,maxOutputTokens:outputReserve,abortSignal:controller.signal}),stopped])
        stats.usageUnknown=false
        const inputTokens=result.usage.inputTokens ?? inputReserve, outputTokens=result.usage.outputTokens ?? outputReserve
        const meta=result.providerMetadata?.openrouter as {provider?:string;usage?:{cost?:number}}|undefined
        if(typeof meta?.usage?.cost==='number' && Number.isFinite(meta.usage.cost) && meta.usage.cost>=0)receipt=meta.usage.cost
        const cost=receipt ?? (inputTokens*inPrice+outputTokens*outPrice)/1e6
        stats.tokens.input+=inputTokens;stats.tokens.output+=outputTokens;stats.costUsd=(stats.costUsd??0)+cost
        Object.assign(turn,{input:inputTokens,output:outputTokens,cached_input:result.usage.inputTokenDetails?.cacheReadTokens??0,cost_usd:cost,provider:meta?.provider??'',ms:Date.now()-started})
        if(stats.tokens.input+stats.tokens.output>Math.min(ASK_MAX_TOKENS,Number(options.tokens ?? ASK_DEFAULT_TOKENS)))return fallback()
        let raw;try{raw=JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g,''))}catch{return fallback()}
        lastDraft=draftWrittenAnswer(raw,activeInput)
        const verified=verifyWrittenAnswer(raw,activeInput)
        researchTrace('writer.verify', {question:input.question,raw,verified})
        if(!verified){if(pass===0&&remainingMs-(Date.now()-startedWriting)>=500){prompt=writingPrompt(input);continue}return fallback()}
        researchTrace('writer.audit',{question:input.question,counts:auditPayload(input.question,verified).counts})
        return ground(verified)
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
    return fallback()
  }
}
