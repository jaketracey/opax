/** What a reader gets when research on a hearing-evidence question ends without an accepted answer.
 * Never model prose from another engine: the older engine answers from unrelated passages and general knowledge,
 * and a hearing-evidence answer with no hearing source must not be shown. The reader gets the transcript excerpts
 * research did hold, quoted by code as recorded, or else one fixed line. */
import { hearingEvidenceQuestion, transcriptPassage, TRANSCRIPT_LABEL, parliamentaryQuestion, hearingWorded, namesRegisteredCommission, NO_PASSAGE_FOUND } from './transcript-answer'
export { namesRegisteredCommission }
import { proseFallback, writingFacts } from './research-writing'
import { NO_SUPPORTED_ANSWER } from './research-evidence'
import { inferPeriod } from './ask-period'
import type { Fact } from './agentic-ask'

/** The one predicate: for which failed runs the answer may never fall to the older engine's prose. Returning true here
 * would apply it to every question. Today, any of:
 *  (a) the question is worded as a hearing-evidence question (hearingEvidenceQuestion, which is false for a
 *      parliamentary inquiry that names no commission);
 *  (b) the run searched hearing transcripts (a royal_commissions transcripts lookup, recorded as held_transcripts,
 *      empty when nothing quotable came back) or holds a source with the hearing transcript label. A list, a profile,
 *      a recommendations lookup or an integrity report is not enough;
 *  (c) the question names a royal commission, a special commission or commission of inquiry, or a board of inquiry;
 *  (d) the question names a registered commission or inquiry by its name or an alias (commission-names.json, built
 *      from the registry, so a newly registered one is covered with no change here).
 * (c) and (d) are for a run that failed before any tool was called. A question that names Parliament or one of its
 * bodies (Senate, House of Representatives, Parliament, parliamentary, committee, estimates, Hansard) is a Hansard
 * question and falls back as on main: (d) never applies to it, and (c) only when it also uses a word for a hearing
 * or its evidence ("what did the Royal Commission hear ..., and what was said in Parliament"). So "Did a party
 * promise a royal commission in Parliament?" and "the Senate inquiry into healthcare funding" are not covered. The
 * bare words "inquiry", "Senate inquiry" or "inquiry into" are never enough. */
const NAMES_A_COMMISSION = /\broyal commission\b|\b(?:special )?commission of inquiry\b|\bboard of inquiry\b/i
type Run = { sources?: unknown[]; trail?: unknown[] } | undefined
export function quotedOrNothing(question: string, research?: Run): boolean {
  if (hearingEvidenceQuestion(question)) return true
  const parliamentary = parliamentaryQuestion(question)
  if (NAMES_A_COMMISSION.test(question) && (!parliamentary || hearingWorded(question))) return true
  if (!parliamentary && namesRegisteredCommission(question)) return true
  if (Array.isArray((research as { held_transcripts?: unknown })?.held_transcripts)) return true
  return ((research?.sources ?? []) as Found[]).some(s => `${String(s?.snippet ?? '')} ${String(s?.title ?? '')}`.includes(TRANSCRIPT_LABEL))
}

type Found = { title?: unknown; url?: unknown; snippet?: unknown }
export function hearingFallbackPayload(question: string, found: { sources?: unknown[]; held_transcripts?: unknown } | undefined, quotesOnly = false): Record<string, unknown> {
  // Neither engine wrote this answer, so the run is recorded under its own mode, with the loop's failure reason.
  const { held_transcripts: _held, ...record } = found ?? {}
  const research = { rounds: 0, trail: [], sources: [], ...record, mode: 'hearing_fallback', ...(quotesOnly ? { transcript_quotes_only: true } : {}) }
  // The excerpts the stopped run held (research-loop.ts keepHeld), then any transcript source its record lists.
  const kept = (Array.isArray(found?.held_transcripts) ? found.held_transcripts : []) as { text?: unknown; url?: unknown }[]
  const held = [...kept.map((k): Found => ({ snippet: k?.text, url: k?.url })), ...((research?.sources ?? []) as Found[])].flatMap(s => {
    const text = [s?.snippet, s?.title].find(v => typeof v === 'string' && transcriptPassage(v)) as string | undefined
    return text && typeof s.url === 'string' ? [{ text, url: s.url }] : []
  }).filter((s, i, all) => all.findIndex(o => o.text === s.text) === i).slice(0, 8)
  // Excerpts are quoted only for a question about a hearing or its evidence. For any other question (what a
  // commission recommended, say) excerpts that happened to be held are not an answer to it: the fixed line.
  if (held.length && (hearingEvidenceQuestion(question) || hearingWorded(question))) {
    const facts = writingFacts(undefined, held.map((s, i): Fact => ({ id: i + 1, text: s.text, cite: { kind: 'record', url: s.url, label: s.text } })))
    const quoted = proseFallback({ question, period: inferPeriod(question), facts, ...(quotesOnly ? { quotesOnly: true } : {}) })
    if (/[\p{L}\p{N}]/u.test(quoted.answer)) return { answered: true, ...quoted, answer_decision: 'answer', machine_written: false, followups: [], research }
  }
  // With the quotes-only switch on, a run that searched the transcripts and holds nothing says so in the fixed words.
  const searchedNothing = quotesOnly && Array.isArray(found?.held_transcripts) && !held.length
  return { answered: true, answer: searchedNothing ? NO_PASSAGE_FOUND : NO_SUPPORTED_ANSWER, answer_decision: 'limitation', citations: {}, sources: [], machine_written: false, followups: [], research }
}
