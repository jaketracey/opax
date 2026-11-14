import { researchSentences } from './research-sentences'
import { unclosedQuoteOffset } from './research-claim-audit.mjs'
import { checkedAnswerPayload } from './research-response'
import { groundAnswerPayload } from './research-grounding'
import { answerStyleChecks } from './research-answer-style.mjs'
import { ACCOUNTABILITY_QUESTION, authorityLeadMayMove, settledAuthorityFinding, authorityFindingLead } from './research-answer-shape'
import type { QualitativeAnswer } from './research-types'
import { protectedDecision } from './research-coherence.mjs'

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
export function researchSentenceStream(question: string, send: (text: string) => Promise<void>) {
  let released = ''
  return {
    async preview(payload: QualitativeAnswer) {
      if (!payload.answer.trim() || !completeSentences(payload.answer) || protectedDecision(payload)) return
      const movingOpening=ACCOUNTABILITY_QUESTION.test(question)&&authorityLeadMayMove(payload)
      // Overview completion can add excerpts from source cards that the last point has not selected yet.
      if(payload.answer_scope?.people?.length===1&&/^what\b.*\b(?:said|say|spoken)\b/i.test(question))return
      // Match finish() and withAnswerLanguage(), including their second grounding pass.
      const grounded=groundAnswerPayload({ ...payload, research: { mode: 'loop' } }, question)
      if(!String(grounded.answer??'').trim())return
      const checked = checkedAnswerPayload(grounded, question,true)
      if (!stableResearchLead(checked, question)) return
      if(movingOpening&&!settledAuthorityFinding(checked,question))return
      // The promoted on-topic finding is settled. Its earlier context remains an affected tail until completion.
      const answer = movingOpening?researchSentences(String(checked.answer??''))[0].text:String(checked.answer ?? '')
      if (!answer.startsWith(released)) return // retain the affected tail until the whole-answer decision is made
      const next = answer.slice(released.length)
      if (next) {
        let cursor=0
        for(const part of researchSentences(next)){
          const end=part.at+part.text.length
          await send(next.slice(cursor,end));cursor=end
        }
        released = answer
      }
    },
    get released() { return released },
  }
}
