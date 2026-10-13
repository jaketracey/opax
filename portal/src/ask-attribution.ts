import { extractNamedScope, normaliseQuestion } from './agentic-ask'
import { EVIDENCE_GAP_ANSWER } from './ask-evidence'
import { saDisplayPayload } from '../public/sa-hansard.js'

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// The export also has partial bylines ("Liddle", "David", "On"). They
// are aliases or transcription fragments, not additional roster identities.
const personRoster = (roster: unknown) => ({ people: ((roster as { people?: { name: string }[] } | null)?.people ?? []).filter(p => typeof p.name === 'string' && p.name.trim().split(/\s+/).length >= 2) })
export function personMentions(text: string, roster: unknown) {
  const people = personRoster(roster).people
  const mentions: { name: string; start: number; end: number }[] = []
  const folded = text.toLowerCase()
  const candidates = people.filter(p => typeof p.name === 'string' && folded.includes(p.name.split(' ').at(-1)!.toLowerCase()))
  for (const person of candidates) {
    // Full names take precedence over shared surnames. Lowercase short words
    // such as "li" are not prose person mentions unless capitalised.
    const expression = new RegExp(`(?<![\\p{L}\\p{N}])${escape(person.name)}(?![\\p{L}\\p{N}])`, 'giu')
    for (const match of text.matchAll(expression)) mentions.push({ name: person.name, start: match.index, end: match.index + match[0].length })
  }
  const fullNames = [...mentions]
  for (const person of candidates) {
    const surname = person.name.split(' ').at(-1)!
    if (surname.length < 2) continue
    const short = new RegExp(`(?<![\\p{L}\\p{N}])${escape(surname)}(?![\\p{L}\\p{N}])`, surname.length < 4 ? 'gu' : 'giu')
    for (const match of text.matchAll(short)) {
      // A surname alone is a name only when capitalised ("Small", "SMALL"); "small modular reactors" names nobody.
      if (!/^\p{Lu}/u.test(match[0])) continue
      if (!fullNames.some(m => match.index >= m.start && match.index + match[0].length <= m.end)) {
        mentions.push({ name: person.name, start: match.index, end: match.index + match[0].length })
      }
    }
  }
  return mentions.map(m => ({ ...m, start: Array.from(text.slice(0,m.start)).length, end: Array.from(text.slice(0,m.end)).length }))
}

/** Bind roster names, including possessive/unique surnames, to the speaker.
 * A name merely appearing in a quotation does not establish its authorship. */
export function claimMatchesSpeaker(claim: string, speaker: string | undefined | null, roster: unknown): boolean {
  // "the Gillard government" names a government, not a speaker; every person named in the claim still counts.
  const text = claim.replace(/(?<![\p{L}])\p{Lu}[\p{L}'’-]+(?:['’]s)?\s+(?:government|governments|ministry|era|years|administration|cabinet)\b/gu, 'the government')
  const scope = extractNamedScope(text, personRoster(roster), null)
  if (scope.ambiguous || scope.people.some(name => normaliseQuestion(name) !== normaliseQuestion(speaker ?? ''))) return false
  return personMentions(text, roster).every(m => normaliseQuestion(m.name) === normaliseQuestion(speaker ?? ''))
}

/** Footnote citations mark the end of a claim, often a single code point.
 * Check the paragraph leading to that marker, not just its final character. */
export function guardAnswerAttribution<T extends { answer: string; citations: Record<string, unknown>; sources: unknown[] }>(payload: T, roster: unknown): T {
  // The SA omission label is UI text, never evidence, even with full-text
  // permission. Remove it before storage as well as at the public boundary.
  payload = saDisplayPayload(payload, 'true')
  const points = Array.from(payload.answer)
  const bindings: { start: number; end: number; speaker?: string }[] = []
  const citationEnds = Object.values(payload.citations).flatMap(raw => Array.isArray(raw) ? raw.filter(range => Array.isArray(range) && Number.isSafeInteger(range[1])).map(range => range[1] as number) : [])
  const reject = (): T => ({ ...payload, answer: EVIDENCE_GAP_ANSWER, citations: {}, answer_status: 'evidence_gap',
    sources: payload.sources.map(raw => ({ ...raw as Record<string, unknown>, cited: false, answer_ranges: [] })) })
  for (const [id, rawRanges] of Object.entries(payload.citations)) {
    const source = payload.sources.find(raw => (raw as { resource?: string }).resource === id.split('/')[0]) as { kind?: string; speaker?: string } | undefined
    if (!source || !['speech', 'hansard'].includes(source.kind ?? '') || !Array.isArray(rawRanges)) continue
    for (const range of rawRanges) {
      if (!Array.isArray(range) || !Number.isSafeInteger(range[0]) || !Number.isSafeInteger(range[1])) continue
      let [start, end] = range as number[]
      if (end - start <= 2) {
        const prefix = points.slice(0, start).join(''), paragraph = Array.from(prefix.slice(0, prefix.lastIndexOf('\n') + 1)).length
        // A paragraph may compare speakers with separate footnotes. Each
        // marker owns the claim since the preceding marker in that paragraph.
        start = Math.max(paragraph, ...citationEnds.filter(previous => previous > paragraph && previous <= start))
      }
      if (!claimMatchesSpeaker(points.slice(start, end).join(''), source.speaker, roster)) return reject()
      bindings.push({ start, end, speaker: source.speaker })
    }
  }
  // An overview can name its subject in a heading or a cited aggregate/bill
  // paragraph. Its already-verified speech citations must unanimously name
  // that same subject; this never permits a second person or another speaker.
  const speakers = new Set(bindings.map(b => normaliseQuestion(b.speaker ?? '')).filter(Boolean))
  if (payload.sources.some(raw => ['speech','hansard'].includes((raw as { kind?: string }).kind ?? '')) && personMentions(payload.answer, roster).some(m =>
    !bindings.some(b => m.start >= b.start && m.end <= b.end && normaliseQuestion(m.name) === normaliseQuestion(b.speaker ?? '')) &&
    !(speakers.size === 1 && speakers.has(normaliseQuestion(m.name))))) return reject()
  return payload
}
