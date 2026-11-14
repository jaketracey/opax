import { researchSentences } from './research-sentences'
import { unclosedQuoteOffset } from './research-claim-audit.mjs'
import { checkedAnswerPayload } from './research-response'
import { answerStyleChecks } from './research-answer-style.mjs'
import { ACCOUNTABILITY_QUESTION, authorityLeadMayMove, settledAuthorityFinding, authorityFindingLead } from './research-answer-shape'
import type { QualitativeAnswer } from './research-types'
import { protectedDecision } from './research-coherence.mjs'

/** A checkpoint contains only text already checked, with citation ranges clipped to that prefix. */
export function researchPrefix(payload:QualitativeAnswer,answer:string):QualitativeAnswer {
  if(answer===payload.answer)return payload
  const end=Array.from(answer).length
  const citations:QualitativeAnswer['citations']=Object.fromEntries(Object.entries(payload.citations).flatMap(([id,ranges])=>{
    const kept=ranges.flatMap(([a,b]):[number,number][]=>a<end?[[a,Math.min(b,end)]]:[])
    return kept.length?[[id,kept]]:[]
  }))
  return {...payload,answer,citations,sources:payload.sources.map(s=>({...s,cited:Object.keys(citations).some(id=>id===s.resource||id.startsWith(s.resource+'/'))}))}
}

export function interruptedResearchAnswer(payload:QualitativeAnswer,answer:string,deadline=true) {
  return {...researchPrefix(payload,answer),answered:true,answer_decision:'answer' as const,
    answer:answer+'\n\n'+(deadline?'The answer was cut short because it reached the time limit.':'The answer was cut short because it could not finish.')}
}

/** An incomplete/ambiguous boundary stays in the tail. In particular, the next token can turn a final full stop
 * into a decimal, initial or abbreviation. A complete structured sentence record supplies that lookahead. */
export function completeSentences(text: string): boolean {
  if (unclosedQuoteOffset(text) >= 0) return false
  const parts = researchSentences(text)
  return !!parts.length && parts.every(part => /[.!?]["”’')\]]*$/.test(part.text))
}

/** Ordering can inspect the tail, so release only once the lead cannot be displaced by another finding. */
export function stableResearchLead(payload: Record<string, unknown>, question: string): boolean {
  const answer = String(payload.answer ?? '')
  const first = researchSentences(answer)[0]?.text ?? ''
  if (!first || /^(?:It|They|Its|Their|Also|Other|Another|Further|However|Meanwhile)\b/.test(first)) return false
  if (ACCOUNTABILITY_QUESTION.test(question) && authorityLeadMayMove(payload)) return false
  // A late headline figure can move to the front. The writer separately checks its known primary before preview.
  return ACCOUNTABILITY_QUESTION.test(question)&&authorityFindingLead(payload) || answerStyleChecks(question, first, payload).direct_first_sentence === 'pass'
}

/** All state belongs to this response. The wire sees only checked text, never draft JSON or provider tokens. */
export function researchSentenceStream(question: string, send: (text: string,checked:QualitativeAnswer) => Promise<void>) {
  let released = ''
  let closed = false
  return {
    async preview(payload: QualitativeAnswer, accept?: (checked:QualitativeAnswer)=>boolean) {
      if (closed || !payload.answer.trim() || !completeSentences(payload.answer) || protectedDecision(payload)) return
      const movingOpening=ACCOUNTABILITY_QUESTION.test(question)&&authorityLeadMayMove(payload)
      // Overview excerpts are append-only and stay in the final tail; partial grounding checks the model points.
      // One grounding pass per new sentence record. Once released, the lead is fixed for later shaping.
      const checked = checkedAnswerPayload({ ...payload, research: { ...(payload as unknown as {research?:object}).research, mode: 'loop' } }, question,true,released)
      if (!String(checked.answer??'').trim() || !released&&!stableResearchLead(checked, question)) return
      if(movingOpening&&!settledAuthorityFinding(checked,question))return
      // The promoted on-topic finding is settled. Its earlier context remains an affected tail until completion.
      const answer = movingOpening?researchSentences(String(checked.answer??''))[0].text:String(checked.answer ?? '')
      if (!answer.startsWith(released)) return // retain the affected tail until the whole-answer decision is made
      const {research:_internal,...emitted}=checked
      const result=researchPrefix(emitted as unknown as QualitativeAnswer,answer)
      if(accept&&!accept(result))return
      const next = answer.slice(released.length)
      if (next) {
        let cursor=0
        for(const part of researchSentences(next)){
          if(closed)return
          const end=part.at+part.text.length
          await send(next.slice(cursor,end),researchPrefix(result,answer.slice(0,released.length+end)));cursor=end
        }
        released = answer
        return result
      }
    },
    close() { closed=true },
    get released() { return released },
  }
}
