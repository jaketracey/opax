/** What a reader gets when research on a hearing-evidence question ends without an accepted answer.
 * Never model prose from another engine: the older engine answers from unrelated passages and general knowledge,
 * and a hearing-evidence answer with no hearing source must not be shown. The reader gets the transcript excerpts
 * research did hold, quoted by code as recorded, or else one fixed line. */
import { hearingEvidenceQuestion, transcriptPassage } from './transcript-answer'
import { proseFallback, writingFacts } from './research-writing'
import { NO_SUPPORTED_ANSWER } from './research-evidence'
import { inferPeriod } from './ask-period'
import type { Fact } from './agentic-ask'

/** The one predicate: for which questions an answer with no accepted research may never fall to the older engine's
 * prose. Hearing-evidence questions today. Returning true here would apply it to every question. */
export const quotedOrNothing = (question: string): boolean => hearingEvidenceQuestion(question)

type Found = { title?: unknown; url?: unknown; snippet?: unknown }
export function hearingFallbackPayload(question: string, research: { sources?: unknown[] } | undefined): Record<string, unknown> {
  const held = ((research?.sources ?? []) as Found[]).flatMap(s => {
    const text = [s?.snippet, s?.title].find(v => typeof v === 'string' && transcriptPassage(v)) as string | undefined
    return text && typeof s.url === 'string' ? [{ text, url: s.url }] : []
  }).filter((s, i, all) => all.findIndex(o => o.text === s.text) === i).slice(0, 8)
  if (held.length) {
    const facts = writingFacts(undefined, held.map((s, i): Fact => ({ id: i + 1, text: s.text, cite: { kind: 'record', url: s.url, label: s.text } })))
    const quoted = proseFallback({ question, period: inferPeriod(question), facts })
    if (/[\p{L}\p{N}]/u.test(quoted.answer)) return { answered: true, ...quoted, answer_decision: 'answer', machine_written: false, followups: [], research }
  }
  return { answered: true, answer: NO_SUPPORTED_ANSWER, answer_decision: 'limitation', citations: {}, sources: [], machine_written: false, followups: [], research }
}
