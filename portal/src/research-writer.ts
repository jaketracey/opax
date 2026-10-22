import { generateText } from 'ai'
import { proseFallback, verifyWrittenAnswer, writingPrompt, draftWrittenAnswer, type WritingInput } from './research-writing'
import { researchTurnReservationUsd } from './research-budget'
import { isResearchCreditError, researchCreditCooldown } from './research-credit'
import type { ResearchOptions } from './research-loop'
import {groundAnswerPayload} from './research-grounding'
import {auditPayload} from './research-claim-audit.mjs'
import {protectedDecision,donorRanking,answerDecision,canReconstructRanking} from './research-coherence.mjs'
import type { QualitativeAnswer, ResearchStats } from './research-types'

/** Same pinned model, provider, limiter, token ceiling, wall cap and D1 reservation as research. */
export function createAnswerWriter(options: ResearchOptions) {
  return async (input: WritingInput, stats: ResearchStats, signal: AbortSignal | undefined, remainingMs: number): Promise<QualitativeAnswer> => {
    let lastDraft:QualitativeAnswer|null=null
    const fallback=()=>{
      stats.coherence={...stats.coherence,fallback:true}
      if(lastDraft&&donorRanking(input.question,input.facts.map(f=>f.source),input.constraints).length&&!canReconstructRanking(lastDraft as unknown as Record<string,unknown>,input.question)){
        const checked=groundAnswerPayload(lastDraft as unknown as Record<string,unknown>,input.question) as unknown as QualitativeAnswer
        if(protectedDecision(checked))return {...checked,answer_decision:answerDecision(checked),coherence:{fallback:true}}
        const lead='A reliable donor ranking is not established here.',prefix=lead+'\n\n',offset=Array.from(prefix).length
        const citations=Object.fromEntries(Object.entries(checked.citations).map(([id,ranges])=>[id,ranges.map(([a,b])=>[a+offset,b+offset] as [number,number])]))
        return {...checked,answer:prefix+checked.answer,answer_decision:'limitation' as const,citations,coherence:{fallback:true}}
      }
      return {...proseFallback(input),coherence:{fallback:true}}
    }, credits=options.creditCooldown ?? researchCreditCooldown
    if (!input.facts.length || !options.model || signal?.aborted || remainingMs<250 || credits.blocked()) return fallback()
    const required=proseFallback(input),lead=required.answer.split('\n')[0]
    const headlineRequired=/highest|most|top|largest|biggest/i.test(input.question)&&!/cannot|not identified|do not identify/i.test(lead)
    const ownerFigure=(text:string)=>{
      const rate=/^([^:]+): (\$[\d,]+)/.exec(text)
      if(rate)return {owner:rate[1],amount:rate[2]}
      const donation=/^(.+?) gave (.+?) (\$[\d,]+)/.exec(text)
      return donation?{owner:donation[1],amount:donation[3],party:donation[2]}:null
    }
    const named=input.facts.filter(f=>{const pair=ownerFigure(f.text);return pair&&input.question.toLowerCase().includes(pair.owner.toLowerCase())&&(!pair.party||input.question.toLowerCase().includes(pair.party.toLowerCase()))})
    const recipientFacts=/\b(?:which|what) parties\b/i.test(input.question)?input.facts.flatMap(f=>{const m=/^Disclosed receipt:\s*(.+?)\s*→\s*(.+?)\s*—/.exec(f.text);return m?[{f,party:m[2]}]:[]}):[]
    const requiredIds=new Set([...recipientFacts.map(r=>r.f.id),...named.map(f=>f.id),...(headlineRequired?Object.entries(required.citations).filter(([,ranges])=>ranges.some(([a])=>a<lead.length)).flatMap(([id])=>input.facts.filter(f=>id===(f.evidenceId??f.source.resource+'/t/body/0')).map(f=>f.id)):[])])
    const recipients=recipientFacts.map(r=>r.party)
    const keepsHeadline=(answer:string)=>recipients.every(p=>answer.toLowerCase().includes(p.toLowerCase()))&&input.facts.filter(f=>requiredIds.has(f.id)).every(f=>{const pair=ownerFigure(f.text);return !pair||answer.includes(pair.owner)&&answer.includes(pair.amount)})
    let activeInput=input, prompt=writingPrompt(input)
    const startedWriting=Date.now()
    const inputReserve=Math.ceil(prompt.length/3)+1024, outputReserve=Math.min(1400,Math.min(160000,Number(options.tokens ?? 96000))-stats.tokens.input-stats.tokens.output-inputReserve)
    if (outputReserve<=0) return fallback()
    for(let pass=0;pass<2;pass++){
      if(credits.blocked())return fallback()
      if(pass&&remainingMs-(Date.now()-startedWriting)<250)return fallback()
      const currentPrompt=prompt
      if (outputReserve<=0) return fallback()
      try {if(await options.modelBudgetSpent())return fallback()}catch{return fallback()}
      if(signal?.aborted||stats.tokens.input+stats.tokens.output+Math.ceil(currentPrompt.length/3)+1024+outputReserve>Math.min(160000,Number(options.tokens??96000)))return fallback()
      const inPrice=options.inputPrice ?? 1, outPrice=options.outputPrice ?? 3
      let reservation;try {reservation=await options.dailyBudget.reserve(researchTurnReservationUsd(inputReserve,outputReserve,inPrice,outPrice))}catch{return fallback()}
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
        if(stats.tokens.input+stats.tokens.output>Math.min(160000,Number(options.tokens ?? 96000)))return fallback()
        let raw;try{raw=JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g,''))}catch{return fallback()}
        lastDraft=draftWrittenAnswer(raw,activeInput)
        const verified=verifyWrittenAnswer(raw,activeInput)
        if(!verified){if(pass===0&&remainingMs-(Date.now()-startedWriting)>=500){prompt=writingPrompt(input);continue}return fallback()}
        const audit=auditPayload(input.question,verified)
        const checked=groundAnswerPayload(verified as unknown as Record<string,unknown>,input.question) as unknown as QualitativeAnswer
        if(protectedDecision(verified))return checked
        const draft=Array.isArray(raw.sentences)?raw.sentences.map((s:{text?:string})=>s.text??'').join('\n\n'):''
        const dropped=Array.isArray(raw.sentences)&&raw.sentences.some((s:{text?:string})=>{const words=(s.text??'').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];return words.length>0&&words.filter((w:string)=>verified.answer.toLowerCase().includes(w)).length/words.length<0.8})
        if(pass===0&&(audit.findings.length||dropped||!keepsHeadline(checked.answer))&&remainingMs-(Date.now()-startedWriting)>=500){
          const used=new Set(checked.sources.filter(s=>s.cited).map(s=>s.resource))
          const surviving={...activeInput,facts:activeInput.facts.filter(f=>used.has(f.source.resource)||requiredIds.has(f.id))}
          if(surviving.facts.length){activeInput=surviving;prompt=writingPrompt(surviving);continue}
        }
        const stripped=Math.max(0,1-checked.answer.length/Math.max(1,draft.length))
        if(stripped>1/3||!keepsHeadline(checked.answer))return fallback()
        return checked
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
