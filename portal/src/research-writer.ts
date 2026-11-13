import { generateText } from 'ai'
import {researchTrace} from './research-trace'
import { reserveQuestionTurn, ASK_DEFAULT_TOKENS, ASK_MAX_TOKENS } from './ask-budgets'
import { proseFallback, verifyWrittenAnswer, writingPrompt, draftWrittenAnswer, type WritingInput } from './research-writing'
const VOTE_METRICS=new Set(['aye','no','all_aye','all_no','split'])
import { researchTurnReservationUsd } from './research-budget'
import { isResearchCreditError, researchCreditCooldown } from './research-credit'
import type { ResearchOptions } from './research-loop'
import {groundAnswerPayload} from './research-grounding'
import {withRecordedChambers} from './ask-chamber-phrases'
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
    // A chamber named for a cited speaker is the one their source records (ask-chamber-phrases.ts).
    const ground=(payload:QualitativeAnswer)=>{const {research:_found,...checked}=groundAnswerPayload({...withRecordedChambers(payload),research:{pre_writer_sources:found}},input.question);return checked as unknown as QualitativeAnswer}
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
    const required=proseFallback(input),lead=required.answer.split('\n')[0]
    const headlineRequired=/highest|most|top|largest|biggest|how much/i.test(input.question)&&!/cannot|not identified|do not identify/i.test(lead)
    const ownerFigure=(fact:WritingInput['facts'][number])=>{
      const receipt=fact.source.receipt
      if(receipt)return {owner:receipt.source,amount:'$'+receipt.amount.toLocaleString('en-AU'),party:receipt.party}
      const rate=/^([^:]+): (\$[\d,]+)/.exec(fact.text) ?? /^(.+?) (?:received|provided) (\$[\d,]+)/.exec(fact.text)
      return rate?{owner:rate[1],amount:rate[2]}:null
    }
    const named=input.facts.filter(f=>{const pair=ownerFigure(f);return pair&&input.question.toLowerCase().includes(pair.owner.toLowerCase())&&(!pair.party||input.question.toLowerCase().includes(pair.party.toLowerCase()))})
    const recipientFacts=/\b(?:which|what) parties\b/i.test(input.question)?input.facts.flatMap(f=>{const m=/^Disclosed receipt:\s*(.+?)\s*→\s*(.+?)\s*—/.exec(f.text);return m?[{f,party:m[2]}]:[]}):[]
    const requiredIds=new Set([...recipientFacts.map(r=>r.f.id),...named.map(f=>f.id),...(headlineRequired?Object.entries(required.citations).filter(([,ranges])=>ranges.some(([a])=>a<lead.length)).flatMap(([id])=>input.facts.filter(f=>id===(f.evidenceId??f.source.resource+'/t/body/0')).map(f=>f.id)):[])])
    const recipients=recipientFacts.map(r=>r.party)
    const keepsHeadline=(answer:string)=>recipients.every(p=>answer.toLowerCase().includes(p.toLowerCase()))&&input.facts.filter(f=>requiredIds.has(f.id)).every(f=>{const pair=ownerFigure(f);return !pair||answer.includes(pair.owner)&&answer.includes(pair.amount)})
    // A recorded vote count keeps its split: "aye 6, no 7" is the answer to how someone voted, and a writer
    // sentence that words it differently ("6 aye and 7 no") loses it to the figure checks.
    const voteFacts=input.facts.filter(f=>!f.coverage&&(f.atoms??[]).some(a=>VOTE_METRICS.has(a.metric)))
    const keepsVotes=(answer:string)=>voteFacts.every(f=>(f.atoms??[]).filter(a=>VOTE_METRICS.has(a.metric)).every(a=>new RegExp(`\\b${a.metric.replace('_',' ')} (?:in )?${a.value}\\b`,'i').test(answer)))
    if(voteFacts.length&&keepsVotes(required.answer))voteFacts.forEach(f=>requiredIds.add(f.id))
    // The writer's draft keeps the requested dollar figure and the aye/no split; one that drops them gives way to the
    // facts-only version, which carries them. That protects content and never swaps in a limitation.
    const keepsAll=(payload:QualitativeAnswer)=>keepsHeadline(payload.answer)&&(!voteFacts.length||!keepsVotes(required.answer)||keepsVotes(payload.answer))
    const withRequired=(checked:QualitativeAnswer)=>required.answer_decision==='limitation'||keepsAll(checked)?checked:ground(required)
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
        return withRequired(ground(verified))
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
