import { originalContext, unsupportedQuotes, guardPositionAnswer, EVIDENCE_GAP_ANSWER } from './ask-evidence'
import { firstSpeechTurn, positionEvidence, positionPointSupported, isPositionEligibilityQuestion, positionEligibilityQuotes } from './position-evidence'
import { CAUSAL, type NamedScope } from './agentic-ask'
import { claimMatchesSpeaker } from './ask-attribution'
import { withoutSaPlaceholder } from '../public/sa-hansard.js'
import type { Passage, QualitativeAnswer } from './research-types'

export interface AnswerCitation { id: string; quote: string; start: number; end: number }
export interface AnswerDraft { text: string; citations: AnswerCitation[] }
const normal = (text: string) => text.normalize('NFC').replace(/\s+/g, ' ').trim()
const TITLE = /^(?:Mr|Mrs|Ms|Miss|Dr|Prof|Senator|Minister|Treasurer|Premier|Member|Hon)\.?$/
const CLAIM_VERB = /\b(?:said|says|say|argued?|argues|supported?|supports|opposed?|opposes|voted?|votes|called|calls|proposed?|proposes|announced?|claimed?|claims|stated?|states|described?|describes|warned?|warns|critici[sz]ed?|backed|backs|rejected?|rejects|committed|promised?|promises|believes?|wants?|urged?|urges|is|was|were|are|has|had|have|will|would)\b/i
function unresolvedPersonQuestion(question: string): boolean {
  const subject = /\b(?:has|have|did|does|do)\s+([\p{L}'’-]+(?:\s+[\p{L}'’-]+){0,7})\s+(?:said|say|says|spoken|spoke|speak|propos\w*|argu\w*|voted?)\b/iu.exec(question)?.[1]
  const collective = /^(?:(?:the|all|these|those|australian|federal|state)\s+)*(?:records?|parliament|senate|house|committees?|government|opposition|members|mps|senators|politicians)$/i
  return !!subject && !collective.test(subject) || /\b(?:speeches|remarks|statements|votes)\s+(?:by|from|of)\s+(?!the\b|all\b)[\p{L}'’-]+/iu.test(question)
}

/** "unresolved" also marks unknown topic words; only an unresolved person slot (a name the roster could not
 * resolve, in "what has X said" grammar) blocks an answer about that person. */
export function unresolvedPersonAsked(question: string, named: NamedScope): boolean {
  if (!named.unresolved) return false
  const resolved = [...named.people, ...named.people.map(n => n.split(' ').at(-1)!), ...named.parties]
  const masked = resolved.reduce((q, name) => q.replace(new RegExp(`(?<![\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'giu'), 'members'), question)
  return unresolvedPersonQuestion(masked)
}
/** The same original-context, literal-quote and position gates used by Ask.
 * This boundary rejects a whole invalid draft; it never unquotes a misquote. */
export function verifyResearchAnswer(draft: AnswerDraft, passages: Map<string, Passage>, question: string, named: NamedScope, positionQuery?: string, roster?: unknown, why?: (reason: string) => void): QualitativeAnswer | null {
  const reject = (reason: string) => { why?.(reason); return null }
  if (typeof draft.text !== 'string' || withoutSaPlaceholder(draft.text) !== draft.text || draft.citations?.some(c => withoutSaPlaceholder(c.quote) !== c.quote)) return reject('sa_placeholder')
  // The numerical resolver's unknown-topic vocabulary also marks ordinary
  // prose as unresolved. Keep explicit person requests strict without using
  // that numerical vocabulary to reject every new qualitative subject.
  if (named.ambiguous) return reject('named_ambiguous')
  if (unresolvedPersonAsked(question, named)) return reject('named_unresolved')
  if (CAUSAL.test(draft.text)) return reject('causal_claim')
  if (!draft.text?.trim() || draft.text.length > 8000 || !Array.isArray(draft.citations) || !draft.citations.length || draft.citations.length > 12) return reject('shape')
  const points = Array.from(draft.text), covered = new Set<number>(), used = new Map<string, Passage>()
  const citations: QualitativeAnswer['citations'] = {}
  const position = !!positionQuery || named.people.length > 0 || /\b(?:propos\w*|positions?|polic(?:y|ies)|supported|opposed)\b/i.test(question)
  const topic = positionQuery || question.replace(new RegExp(named.people.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') || '(?!)', 'gi'), '').replace(/\b(?:what|has|have|did|said|say|proposed|propose|position|on|about|in|parliament)\b/gi, '').trim()
  for (const citation of draft.citations) {
    const passage = passages.get(citation.id)
    if (!passage || !originalContext(citation.id) || typeof citation.quote !== 'string' || !citation.quote.trim() || citation.quote.length > 4000 ||
      !Number.isSafeInteger(citation.start) || !Number.isSafeInteger(citation.end) || citation.start < 0 || citation.end <= citation.start || citation.end > points.length) return reject('citation_shape')
    if (named.people.length && (!passage.speaker || !named.people.some(n => normal(n).toLowerCase() === normal(passage.speaker!).toLowerCase()))) return reject(`speaker_not_named (${passage.speaker ?? 'no speaker'} vs ${named.people.join('/')})`)
    const evidence = position ? firstSpeechTurn(passage.text) : passage.text
    if (!normal(evidence).includes(normal(citation.quote))) return reject('quote_not_in_passage')
    const claim = points.slice(citation.start, citation.end).join('')
    if (!claimMatchesSpeaker(claim, passage.speaker, roster)) return reject('claim_speaker_mismatch')
    if (unsupportedQuotes(claim, [citation.quote]).length) return reject('claim_quote_unsupported')
    // Check short quotations too: the general Ask helper deliberately ignores
    // short spans, but a terminal research draft must keep every quote literal.
    for (const quote of claim.matchAll(/["“]([^"”\n]+)["”]|‘([^’\n]+)’|(?:^|[\s(])'([^'\n]+)'(?=$|[\s.,;:!?)])|(?:^|\n)>\s*([^\n]+)/g)) if (!normal(citation.quote).includes(normal(quote[1] || quote[2] || quote[3] || quote[4]))) return reject('claim_quote_not_literal')
    if (position) {
      // Topic relevance is judged on the cited speaking turn, not only the short quote ("pokies" quotes on a poker machine question).
      const guarded = guardPositionAnswer({ answer: claim, augmented_context: { paragraphs: { [passage.id]: { text: evidence } } } }, { query: topic, prompt: { system: 'You explain Australian politicians’ documented positions from primary records.' } })
      if (guarded.answer === EVIDENCE_GAP_ANSWER || !positionEvidence(evidence, topic)) return reject('position_evidence_gap')
      if (isPositionEligibilityQuestion(question)) {
        if (!positionEligibilityQuotes(evidence, topic).some(quote => normal(citation.quote).includes(normal(quote))) || !normal(claim).includes(normal(citation.quote))) return reject('position_eligibility')
      } else if (!positionPointSupported(claim, citation.quote, question, passage.date, evidence)) return reject('position_point_unsupported')
    } else if (!positionPointSupported(claim, citation.quote, '', passage.date, passage.text)) return reject('point_unsupported')
    ;(citations[citation.id] ??= []).push([citation.start, citation.end])
    for (let i = citation.start; i < citation.end; i++) covered.add(i)
    used.set(passage.id, passage)
  }
  // No unbound factual sentences or a fabricated quote hidden outside ranges.
  // Short connective text ("On housing:", "Overall,") may stand uncited: no digits, quotes, claim verbs or
  // sentence ending. An uncited sentence ("Uncited extra claim.") is still a claim.
  const gaps = points.map((point, i) => covered.has(i) ? '\u0000' : point).join('').split('\u0000').filter(gap => /[\p{L}\p{N}]/u.test(gap))
  if (gaps.some(gap => gap.length > 60 || /[\p{N}"“”‘’.!?;]/u.test(gap) || CLAIM_VERB.test(gap))) return reject('uncovered_text')
  if (unsupportedQuotes(draft.text, [...used.values()].map(p => p.text)).length) return reject('quote_outside_ranges')
  if (named.people.some(name => ![...used.values()].some(p => normal(p.speaker ?? '').toLowerCase() === normal(name).toLowerCase()))) return reject('named_person_uncited')
  return { answer: draft.text, citations, sources: [...new Map([...used.values()].map(p => [p.resource, {
    resource: p.resource, slug: p.slug, title: p.title, href: p.url, url: p.url, snippet: p.text, cited: true,
    kind: p.kind, ...(p.date ? { date: p.date } : {}), ...(p.speaker ? { speaker: p.speaker } : {}),
  }])).values()] }
}

export interface AnswerPoint { claim: string; id: string; quote: string }
/** Builds the answer from claim points: one line per point, offsets computed here rather than counted by the model. */
export function pointsDraft(points: AnswerPoint[]): AnswerDraft {
  let text = ''
  const citations: AnswerCitation[] = []
  for (const point of points) {
    if (text) text += '\n'
    text += '- '
    const start = Array.from(text).length
    text += point.claim
    citations.push({ id: point.id, quote: point.quote, start, end: Array.from(text).length })
  }
  return { text, citations }
}
/** Point-dropping verification: each point must pass alone, then the survivors must pass together.
 *  One unsupported point no longer sinks the whole answer. */
export function verifyResearchPoints(points: unknown, passages: Map<string, Passage>, question: string, named: NamedScope, positionQuery?: string, roster?: unknown, why?: (reason: string) => void): (QualitativeAnswer & { dropped: number }) | null {
  if (!Array.isArray(points) || !points.length || points.length > 12) return null
  const valid = points.filter((p): p is AnswerPoint => !!p && typeof p === 'object' && typeof p.claim === 'string' && typeof p.id === 'string' && typeof p.quote === 'string' &&
    !!p.claim.trim() && !/\n/.test(p.claim) && p.claim.length <= 1200 && !!p.quote.trim() && p.quote.length <= 4000)
  // When the question named the speaker, a bare or titled surname in a claim ("Wilkie supported", "Mr Wilkie")
  // is that speaker: write the full name so a reader is never left with an ambiguous surname.
  const fullName = (claim: string, speaker?: string) => {
    const full = speaker?.trim() ?? '', surname = full.split(/\s+/).at(-1) ?? ''
    if (!full.includes(' ') || !named.people.some(n => normal(n).toLowerCase() === normal(full).toLowerCase())) return claim
    const at = new RegExp(`(?<![\\p{L}])(\\p{Lu}[\\p{L}'’.-]*\\s+)?${surname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'gu')
    return claim.replace(at, (match, before?: string) => !before ? full : TITLE.test(before.trim()) ? full : match)
  }
  for (const point of valid) point.claim = fullName(point.claim, passages.get(point.id)?.speaker)
  const kept = valid.filter(point => {
    const speaker = passages.get(point.id)?.speaker
    // With several named people a point speaks for one of them; the whole-answer check below still requires all.
    const people = named.people.length > 1 ? named.people.filter(n => speaker && normal(n).toLowerCase() === normal(speaker).toLowerCase()) : named.people
    if (named.people.length > 1 && !people.length) { why?.(`point ${points.indexOf(point) + 1}: speaker_not_named`); return false }
    return !!verifyResearchAnswer(pointsDraft([{ ...point, claim: point.claim.trim() }]), passages, question, { ...named, people }, positionQuery, roster, reason => why?.(`point ${points.indexOf(point) + 1}: ${reason}`))
  }).map(point => ({ ...point, claim: point.claim.trim() }))
  if (valid.length < points.length) why?.(`${points.length - valid.length} malformed point(s)`)
  if (!kept.length) return null
  const answer = verifyResearchAnswer(pointsDraft(kept), passages, question, named, positionQuery, roster, reason => why?.(`answer: ${reason}`))
  return answer ? { ...answer, dropped: points.length - kept.length } : null
}
