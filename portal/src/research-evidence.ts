import { originalContext, unsupportedQuotes, guardPositionAnswer, EVIDENCE_GAP_ANSWER } from './ask-evidence'
import { firstSpeechTurn, positionEvidence, positionPointSupported, isPositionEligibilityQuestion, positionEligibilityQuotes } from './position-evidence'
import { CAUSAL, extractNamedScope, type NamedScope } from './agentic-ask'
import type { Passage, QualitativeAnswer } from './research-types'

export interface AnswerCitation { id: string; quote: string; start: number; end: number }
export interface AnswerDraft { text: string; citations: AnswerCitation[] }
const normal = (text: string) => text.normalize('NFC').replace(/\s+/g, ' ').trim()
function unresolvedPersonQuestion(question: string): boolean {
  const subject = /\b(?:has|have|did|does|do)\s+([\p{L}'’-]+(?:\s+[\p{L}'’-]+){0,7})\s+(?:said|say|says|spoken|spoke|speak|propos\w*|argu\w*|voted?)\b/iu.exec(question)?.[1]
  const collective = /^(?:(?:the|all|these|those|australian|federal|state)\s+)*(?:records?|parliament|senate|house|committees?|government|opposition|members|mps|senators|politicians)$/i
  return !!subject && !collective.test(subject) || /\b(?:speeches|remarks|statements|votes)\s+(?:by|from|of)\s+(?!the\b|all\b)[\p{L}'’-]+/iu.test(question)
}

/** The same original-context, literal-quote and position gates used by Ask.
 * This boundary rejects a whole invalid draft; it never unquotes a misquote. */
export function verifyResearchAnswer(draft: AnswerDraft, passages: Map<string, Passage>, question: string, named: NamedScope, positionQuery?: string, roster?: unknown): QualitativeAnswer | null {
  // The numerical resolver's unknown-topic vocabulary also marks ordinary
  // prose as unresolved. Keep explicit person requests strict without using
  // that numerical vocabulary to reject every new qualitative subject.
  if (named.ambiguous || named.unresolved && (positionQuery || unresolvedPersonQuestion(question)) || !draft.text?.trim() || draft.text.length > 8000 || !Array.isArray(draft.citations) || !draft.citations.length || draft.citations.length > 12 || CAUSAL.test(draft.text)) return null
  const points = Array.from(draft.text), covered = new Set<number>(), used = new Map<string, Passage>()
  const citations: QualitativeAnswer['citations'] = {}
  const position = !!positionQuery || named.people.length > 0 || /\b(?:propos\w*|positions?|polic(?:y|ies)|supported|opposed)\b/i.test(question)
  const topic = positionQuery || question.replace(new RegExp(named.people.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') || '(?!)', 'gi'), '').replace(/\b(?:what|has|have|did|said|say|proposed|propose|position|on|about|in|parliament)\b/gi, '').trim()
  for (const citation of draft.citations) {
    const passage = passages.get(citation.id)
    if (!passage || !originalContext(citation.id) || typeof citation.quote !== 'string' || !citation.quote.trim() || citation.quote.length > 4000 ||
      !Number.isSafeInteger(citation.start) || !Number.isSafeInteger(citation.end) || citation.start < 0 || citation.end <= citation.start || citation.end > points.length) return null
    if (named.people.length && (!passage.speaker || !named.people.some(n => normal(n).toLowerCase() === normal(passage.speaker!).toLowerCase()))) return null
    const evidence = position ? firstSpeechTurn(passage.text) : passage.text
    if (!normal(evidence).includes(normal(citation.quote))) return null
    const claim = points.slice(citation.start, citation.end).join('')
    const claimNames = extractNamedScope(claim, roster, null), quoteNames = extractNamedScope(citation.quote, roster, null).people
    if (claimNames.ambiguous || claimNames.people.some(name => normal(name).toLowerCase() !== normal(passage.speaker ?? '').toLowerCase() && !quoteNames.includes(name))) return null
    if (unsupportedQuotes(claim, [citation.quote]).length) return null
    // Check short quotations too: the general Ask helper deliberately ignores
    // short spans, but a terminal research draft must keep every quote literal.
    for (const quote of claim.matchAll(/["“]([^"”\n]+)["”]|‘([^’\n]+)’|(?:^|[\s(])'([^'\n]+)'(?=$|[\s.,;:!?)])|(?:^|\n)>\s*([^\n]+)/g)) if (!normal(citation.quote).includes(normal(quote[1] || quote[2] || quote[3] || quote[4]))) return null
    if (position) {
      const guarded = guardPositionAnswer({ answer: claim, augmented_context: { paragraphs: { [passage.id]: { text: citation.quote } } } }, { query: topic, prompt: { system: 'You explain Australian politicians’ documented positions from primary records.' } })
      if (guarded.answer === EVIDENCE_GAP_ANSWER || !positionEvidence(citation.quote, topic)) return null
      if (isPositionEligibilityQuestion(question)) {
        if (!positionEligibilityQuotes(evidence, topic).some(quote => normal(citation.quote).includes(normal(quote))) || !normal(claim).includes(normal(citation.quote))) return null
      } else if (!positionPointSupported(claim, citation.quote, question, passage.date)) return null
    } else if (!positionPointSupported(claim, citation.quote, '', passage.date)) return null
    ;(citations[citation.id] ??= []).push([citation.start, citation.end])
    for (let i = citation.start; i < citation.end; i++) covered.add(i)
    used.set(passage.id, passage)
  }
  // No unbound factual sentences or a fabricated quote hidden outside ranges.
  if (points.some((point, i) => /[\p{L}\p{N}]/u.test(point) && !covered.has(i))) return null
  if (unsupportedQuotes(draft.text, [...used.values()].map(p => p.text)).length) return null
  if (named.people.some(name => ![...used.values()].some(p => normal(p.speaker ?? '').toLowerCase() === normal(name).toLowerCase()))) return null
  return { answer: draft.text, citations, sources: [...new Map([...used.values()].map(p => [p.resource, {
    resource: p.resource, slug: p.slug, title: p.title, href: p.url, url: p.url, snippet: p.text, cited: true,
    kind: p.kind, ...(p.date ? { date: p.date } : {}), ...(p.speaker ? { speaker: p.speaker } : {}),
  }])).values()] }
}
