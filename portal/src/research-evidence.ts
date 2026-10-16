import { originalContext, unsupportedQuotes } from './ask-evidence'
import { firstSpeechTurn, positionEvidence, positionPointSupported, isPositionEligibilityQuestion, isPositionDetailQuestion, positionEligibilityQuotes } from './position-evidence'
import { CAUSAL, normaliseQuestion, type NamedScope } from './agentic-ask'
import { claimMatchesSpeaker, personMentions } from './ask-attribution'
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

// A claim that describes its speaker by party ("A Labor member said", "Coalition senators argued") must match the
// speaker's party on the day in the original record. Content about a party ("Labor's platform") is not a descriptor.
const PARTY_FAMILY: [RegExp, RegExp][] = [
  [/^(?:labor|alp)$/i, /\b(?:labor|labour|alp)\b/i],
  [/^liberals?$/i, /\b(?:liberal|lnp|country liberal|clp)\b/i],
  [/^(?:nationals?|national party)$/i, /\b(?:national|nationals|lnp|country party|npa)\b/i],
  [/^coalition$/i, /\b(?:liberal|national|nationals|lnp|country|clp|npa)\b/i],
  [/^greens?$/i, /\bgreens?\b/i],
  [/^democrats?$/i, /\bdemocrats?\b/i],
  [/^one nation$/i, /\bone nation\b/i],
  [/^independents?$/i, /\bindependent\b/i],
]
const PARTY_DESCRIPTOR = /(?:^|[.;:]\s+|\b(?:a|an|another|one|the|two|several|other|fellow)\s+)(labor|alp|liberals?|nationals?|national party|coalition|greens?|democrats?|one nation|independents?)\s+(?:members?|mps?|senators?|ministers?|speakers?|figures?|backbenchers?|frontbenchers?|spokesp\w+|representatives?|politicians?|leaders?|voices?)\b/gi
export function claimMatchesParty(claim: string, party: string | undefined): boolean {
  for (const match of claim.matchAll(PARTY_DESCRIPTOR)) {
    const family = PARTY_FAMILY.find(([name]) => name.test(match[1].trim()))?.[1]
    if (!family || !party || !family.test(party)) return false
  }
  return true
}

/** "unresolved" also marks unknown topic words; only an unresolved person slot (a name the roster could not
 * resolve, in "what has X said" grammar) blocks an answer about that person. */
export function unresolvedPersonAsked(question: string, named: NamedScope): boolean {
  if (!named.unresolved) return false
  const resolved = [...named.people, ...named.people.map(n => n.split(' ').at(-1)!), ...named.parties]
  const masked = resolved.reduce((q, name) => q.replace(new RegExp(`(?<![\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'giu'), 'members'), question)
  return unresolvedPersonQuestion(masked)
}
// ---------------------------------------------------------------- repair helpers (deterministic, no model)
const STOP = new Set('the and for with from that this these those their there them they then than were what when where which while about after before between during into over under also more most less very would could should will shall have been being said says told such some other only just even much many each every said member members senator minister government opposition australia australian parliament house bill bills people year years time does done record records show shows tell know your there here whom whose speak spoke spoken talk talked'.split(' '))
const stem = (w: string) => w.slice(0, 6)
/** Content words of a text, folded and stemmed, for a topic or support overlap. */
export const contentWords = (text: string) => new Set((text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(w => w.length >= 4 && !STOP.has(w)).map(stem))
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter(w => b.has(w)).length
const words = (text: string) => [...text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu)].map(m => ({ w: m[0].toLowerCase().replace(/’/g, "'"), start: m.index!, end: m.index! + m[0].length }))
/** The exact passage text for the longest run of the needle's words found in order in the passage (at least
 * `min` words, or every word of a shorter needle); null when no such run exists. Case, punctuation and spacing
 * differences are absorbed; the returned span is always a verbatim substring of the passage. */
export function passageSpan(text: string, needle: string, min = 5): string | null {
  const hay = words(text), want = words(needle).map(x => x.w)
  if (!want.length || !hay.length) return null
  let best = 0, at = 0, prev = new Array(want.length + 1).fill(0)
  for (let i = 1; i <= hay.length; i++) {
    const row = new Array(want.length + 1).fill(0)
    for (let j = 1; j <= want.length; j++) if (hay[i - 1].w === want[j - 1]) { row[j] = prev[j - 1] + 1; if (row[j] > best) { best = row[j]; at = i - best } }
    prev = row
  }
  if (best < Math.min(min, want.length)) return null
  return text.slice(hay[at].start, hay[at + best - 1].end)
}
/** A short verbatim excerpt (at most `max` words) of the passage sentence that best matches the given words. */
export function passageExcerpt(text: string, about: string, max = 25): { text: string; score: number } | null {
  const target = contentWords(about)
  let best: { text: string; score: number } | null = null
  for (const m of text.matchAll(/[^.!?]+[.!?]?/g)) {
    const sentence = m[0].trim(), list = words(sentence)
    if (list.length < 4) continue
    let from = 0, score = -1
    for (let i = 0; i <= Math.max(0, list.length - max); i++) {
      const n = overlap(contentWords(list.slice(i, i + max).map(x => x.w).join(' ')), target)
      if (n > score) { score = n; from = i }
    }
    const span = list.length <= max ? sentence : sentence.slice(list[from].start, list[Math.min(list.length, from + max) - 1].end)
    if (!best || score > best.score) best = { text: span, score }
  }
  return best
}
const QUOTED = /["“]([^"”\n]+)["”]|‘([^’\n]+)’|(^|[\s(])'([^'\n]+)'(?=$|[\s.,;:!?)])/g
/** Quoted text in a claim stays quoted only when it is verbatim in the cited passage (re-cased to the passage);
 * otherwise its quotation marks go and it stands as paraphrase. */
export function repairQuotes(claim: string, evidence: string, note: (label: string) => void): string {
  return claim.replace(QUOTED, (match, dq?: string, sq?: string, lead?: string, aq?: string) => {
    const inner = dq ?? sq ?? aq ?? ''
    const exact = passageSpan(evidence, inner, Number.MAX_SAFE_INTEGER)
    if (exact && words(exact).length === words(inner).length) {
      if (exact !== inner) note('quote_recased')
      return `${lead ?? ''}“${exact}”`
    }
    note('unquoted')
    return `${lead ?? ''}${inner}`
  })
}
const STATEMENT = '(?:said|says|told|tells|stated|states|argued|argues|claimed|claims|warned|warns|described|describes|called|calls|asserted|insisted|declared|wrote|accused|urged|suggested|maintained|added|replied|responded|asked|criticised|criticized|attacked|rejected|welcomed|praised|framed|emphasised|emphasized|noted|cited|quoted|presented|introduced|moved|highlighted|stressed|defended|dismissed|questioned|condemned|raised|outlined|explained|announced|pledged|promised|expressed|acknowledged|conceded|labelled|labeled|branded|recalled|reported|backed|supported|opposed|proposed|argue|say|tell|claim|warn|describe|call|urge|insist)'
const SPEAKING = new RegExp(`^(?:['’]s)?(?:\\s*\\([^)]{0,60}\\))?(?:\\s*,[^,]{0,80},)?\\s+(?:also\\s+|then\\s+|later\\s+|again\\s+|repeatedly\\s+|has\\s+|had\\s+|have\\s+)?${STATEMENT}\\b|^\\s*:\\s*["“‘]`, 'i')
// "X's words were “…”": a possessive puts quoted words in X's mouth; without a quotation it only names X's view.
const POSSESSED_WORDS = /^['’]s\s+(?:own\s+)?(?:words|remarks|statement|claim|comments?|argument|speech|quote|phrase)\b/i
const ATTRIBUTED = new RegExp(`\\b(?:${STATEMENT}|alleged|contended|according to)\\b`, 'i')
const LEAD_IN = /^(?:\s*(?:in|on|at|during)\s[^,]{1,40},?)?\s*(?:(?:labor|liberal|coalition|greens?|nationals?|national|lnp|one nation|democrats?|independent)(?:['’]s)?\s+(?:mp\s+|member\s+|senator\s+|minister\s+|leader\s+)?)?(?:(?:mr|mrs|ms|miss|dr|senator|minister|prime minister|treasurer|the hon\.?)\s+)?$/i
/** Others may be what a claim is about ("criticised Peter Dutton's plan"); no one but the cited speaker may be the
 * one speaking ("Peter Dutton said", "Peter Dutton: “…”", "Peter Dutton's words"). */
export function claimAttributionOk(claim: string, speaker: string | undefined, roster: unknown): boolean {
  if (claimMatchesSpeaker(claim, speaker, roster)) return true
  const chars = Array.from(claim), self = normaliseQuestion(speaker ?? '')
  const quoted = /["“][^"”\n]+["”]|‘[^’\n]+’/.test(claim)
  // The cited speaker's own full name ("Louis Stuart Lieberman") may hold a surname another roster member shares.
  const own: [number, number][] = []
  if (speaker?.trim()) for (const m of claim.matchAll(new RegExp(speaker.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu'))) own.push([Array.from(claim.slice(0, m.index)).length, Array.from(claim.slice(0, m.index + m[0].length)).length])
  return personMentions(claim, roster).filter(m => !own.some(([a, b]) => m.start >= a && m.end <= b)).every(m => normaliseQuestion(m.name) === self && !!self || !SPEAKING.test(chars.slice(m.end).join('')) && !(quoted && POSSESSED_WORDS.test(chars.slice(m.end).join(''))))
}
/** The claim's speaking subject is rewritten to the cited passage's speaker. Quoted words put in another named
 * person's mouth are not rewritten: the point is dropped. */
export function repairAttribution(claim: string, speaker: string | undefined, roster: unknown, note: (label: string) => void): string | null {
  if (claimAttributionOk(claim, speaker, roster)) return claim
  const self = normaliseQuestion(speaker ?? '')
  const others = personMentions(claim, roster).filter(m => normaliseQuestion(m.name) !== self).sort((a, b) => a.start - b.start)
  const chars = Array.from(claim), lead = others[0]
  const prefix = lead ? chars.slice(0, lead.start).join('') : ''
  if (!lead || !LEAD_IN.test(prefix) || !SPEAKING.test(chars.slice(lead.end).join('')) || /["“][^"”\n]+["”]|‘[^’\n]+’/.test(claim)) return null
  // Party and title words before the old name described the old speaker; the record names the new one in full.
  const lead_in = prefix.replace(/(?:(?:labor|liberal|coalition|greens?|nationals?|national|lnp|one nation|democrats?|independent)(?:['’]s)?\s+(?:mp\s+|member\s+|senator\s+|minister\s+|leader\s+)?)?(?:(?:mr|mrs|ms|miss|dr|senator|minister|prime minister|treasurer|the hon\.?)\s+)?$/i, '')
  const name = speaker?.trim() || (lead_in.trim() ? 'a speaker' : 'A speaker')
  const rewritten = lead_in + name + chars.slice(lead.end).join('').replace(/^['’]s\b/, '’s')
  if (!claimAttributionOk(rewritten, speaker, roster)) return null
  note('speaker_rewritten')
  return rewritten
}
/** A party descriptor that does not match the speaker's party on the day becomes the speaker's name; a plural one
 * ("Labor MPs") cannot be rewritten and drops the point. */
export function repairParty(claim: string, speaker: string | undefined, party: string | undefined, note: (label: string) => void): string | null {
  if (claimMatchesParty(claim, party)) return claim
  let failed = false
  const out = claim.replace(new RegExp(PARTY_DESCRIPTOR.source, 'gi'), (match: string, _party: string, offset: number) => {
    if (claimMatchesParty(match, party)) return match
    const lead = /^[.;:]\s+/.exec(match)?.[0] ?? ''
    if (/s$/i.test(match.trim().split(/\s+/).at(-1) ?? '')) { failed = true; return match }
    return lead + (speaker?.trim() || (offset === 0 || lead ? 'A speaker' : 'a speaker'))
  })
  if (failed || !claimMatchesParty(out, party)) return null
  note('party_rewritten')
  return out
}
const lowerFirst = (text: string) => /^\p{Lu}\p{Ll}/u.test(text) && !/^(?:I|Australia\w*|Labor|Liberal|Greens?|Nationals?|Coalition|Parliament|Senate|Commonwealth)\b/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text
/** A causal statement stands only as what someone said. */
function causalUnattributed(line: string): boolean {
  const hit = CAUSAL.exec(line)
  return !!hit && !ATTRIBUTED.test(line.slice(0, hit.index))
}
export function repairCausal(claim: string, speaker: string | undefined, note: (label: string) => void): string | null {
  if (!causalUnattributed(claim)) return claim
  if (!speaker?.trim()) return null
  const lead = /^\s*(?:in|on|at|during)\s[^,]{1,40},\s*/i.exec(claim)?.[0] ?? ''
  note('causal_attributed')
  return `${lead}${speaker.trim()} said ${lowerFirst(claim.slice(lead.length).replace(/^\s+/, ''))}`
}

/** points_kept counts cited points; points_uncited the points kept without a citation, by the soft check each
 * failed (uncited). salvaged names the loop stop an answer was rescued from. */
/** Every quotation mark goes: the words stand as paraphrase. */
export const unquoted = (claim: string) => claim.replace(QUOTED, (_m, dq?: string, sq?: string, lead?: string, aq?: string) => `${lead ?? ''}${dq ?? sq ?? aq ?? ''}`)
/** Quotation marks outside a matched pair (a truncated claim) go too: no stray mark reads as a quotation. */
const strayQuotesOut = (claim: string) => {
  let out = '', last = 0
  for (const m of claim.matchAll(QUOTED)) { out += claim.slice(last, m.index).replace(/["“”]/g, '') + m[0]; last = m.index! + m[0].length }
  return (out + claim.slice(last).replace(/["“”]/g, '')).replace(/\s{2,}/g, ' ').trim()
}
/** An unsupported figure comes out where that is a clean cut: a parenthetical holding it, or the trailing clauses
 * (after a comma, semicolon or dash) that carry it, leaving a sentence of five words or more. Null when no such cut
 * leaves a supported claim: the point is dropped. */
export function withoutUnsupportedFigures(claim: string, supported: (text: string) => boolean): string | null {
  if (supported(claim)) return claim
  const tidy = (text: string) => text.replace(/\s+([,.;:])/g, '$1').replace(/\s{2,}/g, ' ').trim()
  let out = tidy(claim.replace(/\s*\(([^()\n]*)\)/g, (match, inner: string) => supported(inner) ? match : ''))
  if (supported(out)) return out
  const parts = out.split(/(?=,\s|;\s|\s[–—-]\s)/)
  for (let k = parts.length - 1; k >= 1; k--) {
    const head = tidy(parts.slice(0, k).join('')).replace(/[,;:\s–—-]+$/, '')
    if (words(head).length >= 5 && supported(head)) return /[.!?]$/.test(head) ? head : head + '.'
  }
  return null
}

export interface AnswerTally { points_in: number; points_kept: number; points_uncited: number; repairs: Record<string, number>; drops: Record<string, number>; uncited: Record<string, number>; mode?: 'points' | 'record_list' | 'facts' | 'uncited'; salvaged?: string }
export const emptyTally = (): AnswerTally => ({ points_in: 0, points_kept: 0, points_uncited: 0, repairs: {}, drops: {}, uncited: {} })
const bump = (bag: Record<string, number>, label: string) => { bag[label] = (bag[label] ?? 0) + 1 }

/** The floor every cited answer meets: citations to retrieved passages in their original speaking turn, quote
 * marks only around verbatim passage text, no words in another named person's mouth, figures only from the
 * cited passage, no unattributed causal claim, and each point on the question's topic. Repairs happen before
 * this, in verifyResearchPoints; this boundary rejects what is still invalid and never rewrites. */
export function verifyResearchAnswer(draft: AnswerDraft, passages: Map<string, Passage>, question: string, named: NamedScope, positionQuery?: string, roster?: unknown, why?: (reason: string) => void): QualitativeAnswer | null {
  const reject = (reason: string) => { why?.(reason); return null }
  if (typeof draft.text !== 'string' || withoutSaPlaceholder(draft.text) !== draft.text || draft.citations?.some(c => withoutSaPlaceholder(c.quote) !== c.quote)) return reject('sa_placeholder')
  // The numerical resolver's unknown-topic vocabulary also marks ordinary
  // prose as unresolved. Keep explicit person requests strict without using
  // that numerical vocabulary to reject every new qualitative subject.
  if (named.ambiguous) return reject('named_ambiguous')
  if (unresolvedPersonAsked(question, named)) return reject('named_unresolved')
  if (draft.text.split('\n').some(causalUnattributed)) return reject('causal_claim')
  if (!draft.text?.trim() || draft.text.length > 8000 || !Array.isArray(draft.citations) || !draft.citations.length || draft.citations.length > 12) return reject('shape')
  const points = Array.from(draft.text), covered = new Set<number>(), used = new Map<string, Passage>()
  const citations: QualitativeAnswer['citations'] = {}
  const position = !!positionQuery || named.people.length > 0 || /\b(?:propos\w*|positions?|polic(?:y|ies)|supported|opposed)\b/i.test(question)
  const topic = positionQuery || question.replace(new RegExp(named.people.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') || '(?!)', 'gi'), '').replace(/\b(?:what|has|have|did|said|say|proposed|propose|position|on|about|in|parliament)\b/gi, '').trim()
  const topicWords = contentWords(topic)
  for (const citation of draft.citations) {
    const passage = passages.get(citation.id)
    if (!passage || !originalContext(citation.id) || typeof citation.quote !== 'string' || !citation.quote.trim() || citation.quote.length > 4000 ||
      !Number.isSafeInteger(citation.start) || !Number.isSafeInteger(citation.end) || citation.start < 0 || citation.end <= citation.start || citation.end > points.length) return reject('citation_shape')
    if (named.people.length && (!passage.speaker || !named.people.some(n => normal(n).toLowerCase() === normal(passage.speaker!).toLowerCase()))) return reject(`speaker_not_named (${passage.speaker ?? 'no speaker'} vs ${named.people.join('/')})`)
    const evidence = position ? firstSpeechTurn(passage.text) : passage.text
    if (!normal(evidence).includes(normal(citation.quote))) return reject('quote_not_in_passage')
    const claim = points.slice(citation.start, citation.end).join('')
    if (!claimAttributionOk(claim, passage.speaker, roster)) return reject('claim_speaker_mismatch')
    if (!claimMatchesParty(claim, passage.party)) return reject('claim_party_mismatch')
    if (unsupportedQuotes(claim, [evidence]).length) return reject('claim_quote_unsupported')
    // Every quotation, however short, is verbatim in the cited speaking turn.
    for (const quote of claim.matchAll(/["“]([^"”\n]+)["”]|‘([^’\n]+)’|(?:^|[\s(])'([^'\n]+)'(?=$|[\s.,;:!?)])|(?:^|\n)>\s*([^\n]+)/g)) if (!normal(evidence).includes(normal(quote[1] || quote[2] || quote[3] || quote[4]))) return reject('claim_quote_not_literal')
    if (position && isPositionEligibilityQuestion(question)) {
      if (!positionEligibilityQuotes(evidence, topic).some(quote => normal(citation.quote).includes(normal(quote))) || !normal(claim).includes(normal(citation.quote))) return reject('position_eligibility')
    }
    // Figures only from the cited passage (its own year as a date phrase is allowed).
    if (!positionPointSupported(claim, evidence, '', passage.date, passage.text)) return reject('figure_unsupported')
    // On topic: the claim restates the passage (two content words, or all of a short claim) and the passage is
    // about the question (topic words in it, the position topic check, or found by a search for those words).
    const claimWords = contentWords(claim), evidenceWords = contentWords(evidence)
    if (overlap(claimWords, evidenceWords) < Math.min(2, claimWords.size)) return reject('point_unsupported')
    if (topicWords.size && !overlap(topicWords, evidenceWords) && !(passage.query && overlap(topicWords, contentWords(passage.query))) && !(position && positionEvidence(evidence, topic))) return reject('off_topic')
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
  // A comparison of named people may answer with what the record holds for some of them, never none.
  if (named.people.length && !named.people.some(name => [...used.values()].some(p => normal(p.speaker ?? '').toLowerCase() === normal(name).toLowerCase()))) return reject('named_person_uncited')
  return { answer: draft.text, citations, sources: sourcesOf([...used.values()]) }
}
const sourcesOf = (used: Passage[], cited = true): QualitativeAnswer['sources'] => [...new Map(used.map(p => [p.resource, {
  resource: p.resource, slug: p.slug, title: p.title, href: p.url, url: p.url, snippet: p.text, cited,
  kind: p.kind, ...(p.date ? { date: p.date } : {}), ...(p.speaker ? { speaker: p.speaker } : {}),
}])).values()]

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
/** A question about a person the roster cannot pin down (ambiguous, or unresolved in "what has X said" grammar)
 * is declined outright: an answer about the wrong person is worse than none. */
export function namedDecline(question: string, named: NamedScope): 'named_ambiguous' | 'named_unresolved' | null {
  return named.ambiguous ? 'named_ambiguous' : unresolvedPersonAsked(question, named) ? 'named_unresolved' : null
}
/** Jake's standing lines: these drop the point whatever else it has going for it. Every other failed check is
 * soft: the point stays, unquoted where its quotation is not verbatim, and uncited. */
const HARD = new Set(['sa_placeholder', 'named_ambiguous', 'named_unresolved', 'causal_claim', 'speaker_not_named', 'claim_speaker_mismatch'])

/** Repair, then verify: each point is mended in code where it can be (quote marks, quote span, speaker, party,
 * causal wording, an unsupported figure) and checked against its passage. A point that passes is cited; one that
 * fails only a soft check (a misquote, weak overlap, the topic, a party descriptor) stays as an uncited line after
 * the cited ones; one that crosses a hard line is dropped. Null only when no point is left. */
export function verifyResearchPoints(points: unknown, passages: Map<string, Passage>, question: string, named: NamedScope, positionQuery?: string, roster?: unknown, why?: (reason: string) => void, tally: AnswerTally = emptyTally()): (QualitativeAnswer & { dropped: number }) | null {
  if (!Array.isArray(points) || !points.length || points.length > 12) return null
  tally.points_in += points.length
  const decline = namedDecline(question, named)
  if (decline) { why?.(`answer: ${decline}`); bump(tally.drops, decline); return null }
  const valid = points.filter((p): p is AnswerPoint => !!p && typeof p === 'object' && typeof p.claim === 'string' && typeof p.id === 'string' && typeof p.quote === 'string' &&
    !!p.claim.trim() && !/\n/.test(p.claim) && p.claim.length <= 1200 && !!p.quote.trim() && p.quote.length <= 4000)
  if (valid.length < points.length) { why?.(`${points.length - valid.length} malformed point(s)`); for (let i = valid.length; i < points.length; i++) bump(tally.drops, 'malformed') }
  const position = !!positionQuery || named.people.length > 0 || /\b(?:propos\w*|positions?|polic(?:y|ies)|supported|opposed)\b/i.test(question)
  const isNamed = (list: string[], speaker?: string) => !!speaker && list.some(n => normal(n).toLowerCase() === normal(speaker).toLowerCase())
  // When the question named the speaker, a bare or titled surname in a claim ("Wilkie supported", "Mr Wilkie")
  // is that speaker: write the full name so a reader is never left with an ambiguous surname.
  const fullName = (claim: string, speaker?: string) => {
    const full = speaker?.trim() ?? '', surname = full.split(/\s+/).at(-1) ?? ''
    if (!full.includes(' ') || !isNamed(named.people, full)) return claim
    const at = new RegExp(`(?<![\\p{L}])(\\p{Lu}[\\p{L}'’.-]*\\s+)?${surname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'gu')
    return claim.replace(at, (match, before?: string) => !before ? full : TITLE.test(before.trim()) ? full : match)
  }
  const kept: AnswerPoint[] = [], loose: { claim: string; passage: Passage }[] = [], seen = new Set<string>()
  valid.forEach(raw => {
    const n = points.indexOf(raw) + 1, done: string[] = []
    const note = (label: string) => done.push(label)
    const drop = (label: string) => { why?.(`point ${n}: ${label}`); bump(tally.drops, label); return undefined }
    let passage = passages.get(raw.id), id = raw.id
    if (!passage || !originalContext(raw.id)) {
      // A garbled id: the one verified passage that holds the quote verbatim.
      const holders = raw.quote.trim().length >= 20 ? [...passages.values()].filter(p => originalContext(p.id) && normal(p.text).includes(normal(raw.quote))) : []
      if (holders.length !== 1) return drop('unknown_passage')
      passage = holders[0]; id = passage.id; note('passage_reselected')
    }
    const speaker = passage.speaker
    // With several named people a point speaks for one of them; the whole-answer check below still requires one.
    const people = named.people.length > 1 ? named.people.filter(p => isNamed([p], speaker)) : named.people
    if (named.people.length > 1 && !people.length) return drop('speaker_not_named')
    const evidence = position ? firstSpeechTurn(passage.text) : passage.text
    let claim: string | null = fullName(raw.claim.trim(), speaker), quote = raw.quote, soft: string | undefined
    // The citation quote: verbatim as given, else the passage's own words for the longest run it shares (five words
    // or more), else the passage sentence that best matches the claim. With none, the point can only stand uncited.
    if (!normal(evidence).includes(normal(quote))) {
      const span = passageSpan(evidence, quote), excerpt = span ? null : passageExcerpt(evidence, claim)
      if (span) { quote = span; note('quote_respanned') }
      else if (excerpt && excerpt.score >= 1) { quote = excerpt.text; note('quote_reselected') }
      else soft = 'quote_not_in_passage'
    }
    claim = repairQuotes(claim, evidence, note)
    claim = repairCausal(claim, speaker, note)
    if (claim === null) return drop('causal_claim')
    claim = repairAttribution(claim, speaker, roster, note)
    if (claim === null) return drop('claim_speaker_mismatch')
    const party = repairParty(claim, speaker, passage.party, note)
    if (party === null) soft ??= 'claim_party_mismatch'
    else claim = party
    // A point repeating one already kept from the same passage adds nothing.
    const key = id + '\u0000' + normal(claim).toLowerCase()
    if (seen.has(key)) return drop('duplicate')
    const strict = (text: string) => {
      const reasons: string[] = []
      return verifyResearchAnswer(pointsDraft([{ claim: text, id, quote }]), passages, question, { ...named, people }, positionQuery, roster, reason => reasons.push(reason)) ? undefined : reasons[0]?.replace(/ \(.*$/, '') ?? 'unsupported'
    }
    const figures = (text: string) => positionPointSupported(text, evidence, '', passage!.date, passage!.text)
    let failed = soft ? undefined : strict(claim)
    // A misquote becomes paraphrase; an unsupported figure comes out where that is a clean cut.
    if (failed === 'claim_quote_unsupported' || failed === 'claim_quote_not_literal') { claim = unquoted(claim); note('unquoted'); failed = strict(claim) }
    if (failed === 'figure_unsupported') {
      const cut = withoutUnsupportedFigures(claim, figures)
      if (!cut) return drop('figure_unsupported')
      claim = cut; note('figure_removed'); failed = strict(claim)
    }
    if (failed && HARD.has(failed)) return drop(failed)
    soft ??= failed
    seen.add(key)
    for (const label of done) bump(tally.repairs, label)
    if (!soft) { kept.push({ claim, id, quote }); return }
    // An uncited point still meets every hard line on its own, and states no figure its passage lacks.
    claim = strayQuotesOut(claim)
    if (!/[\p{L}\p{N}]/u.test(claim)) return drop('shape')
    if (withoutSaPlaceholder(claim) !== claim) return drop('sa_placeholder')
    if (named.people.length && !isNamed(people, speaker)) return drop('speaker_not_named')
    if (causalUnattributed(claim)) return drop('causal_claim')
    if (!claimAttributionOk(claim, speaker, roster)) return drop('claim_speaker_mismatch')
    const cut = withoutUnsupportedFigures(claim, figures)
    if (!cut) return drop('figure_unsupported')
    if (cut !== claim) bump(tally.repairs, 'figure_removed')
    why?.(`point ${n}: uncited (${soft})`)
    bump(tally.uncited, soft)
    loose.push({ claim: cut, passage })
  })
  if (!kept.length && !loose.length) return null
  // The cited points must pass together; if they cannot, they stand uncited with the rest.
  let answer = kept.length ? verifyResearchAnswer(pointsDraft(kept), passages, question, named, positionQuery, roster, reason => why?.(`answer: ${reason}`)) : null
  if (kept.length && !answer) {
    bump(tally.drops, 'answer_level')
    loose.unshift(...kept.map(k => ({ claim: k.claim, passage: passages.get(k.id)! })))
    kept.length = 0
  }
  if (!loose.length) {
    tally.points_kept += kept.length
    tally.mode = 'points'
    return { ...answer!, dropped: points.length - kept.length }
  }
  answer ??= { answer: '', citations: {}, sources: [] }
  let text = answer.answer
  for (const { claim } of loose) text += (text ? '\n' : '') + '- ' + claim
  const cited = new Set(answer.sources.map(s => s.resource))
  tally.points_kept += kept.length
  tally.points_uncited += loose.length
  tally.mode = kept.length ? 'points' : 'uncited'
  return { answer: text, citations: answer.citations, sources: [...answer.sources, ...sourcesOf(loose.map(l => l.passage).filter(p => !cited.has(p.resource)), false)],
    answer_status: kept.length ? 'partly_cited' : 'uncited', dropped: points.length - kept.length - loose.length }
}

/** Nothing the model wrote survived, but verified passages were found: answer with the best two or three of them,
 * each a verbatim excerpt with its speaker and date, rather than falling back to the old engine. */
export function recordPassagesAnswer(passages: Map<string, Passage>, question: string, named: NamedScope, positionQuery?: string, limit = 3): QualitativeAnswer | null {
  if (named.ambiguous || unresolvedPersonAsked(question, named)) return null
  const position = !!positionQuery || named.people.length > 0 || /\b(?:propos\w*|positions?|polic(?:y|ies)|supported|opposed)\b/i.test(question)
  const topic = positionQuery || question
  const topicWords = contentWords(topic)
  const candidates = [...passages.values()].filter(p => originalContext(p.id) && withoutSaPlaceholder(p.text) === p.text &&
    (!named.people.length || !!p.speaker && named.people.some(n => normal(n).toLowerCase() === normal(p.speaker!).toLowerCase())))
    .map(p => { const evidence = position ? firstSpeechTurn(p.text) : p.text, excerpt = passageExcerpt(evidence, topic); return { p, excerpt, score: (excerpt?.score ?? 0) + overlap(topicWords, contentWords(evidence)) } })
    .filter(c => c.excerpt && c.excerpt.text.length >= 20 && c.score > 0 && !/["“”]/.test(c.excerpt.text))
    .sort((a, b) => b.score - a.score || String(b.p.date ?? '').localeCompare(String(a.p.date ?? '')))
  const chosen: typeof candidates = []
  for (const c of candidates) if (chosen.length < limit && !chosen.some(x => x.p.slug === c.p.slug)) chosen.push(c)
  if (!chosen.length) return null
  let text = 'What the record says:'
  const citations: QualitativeAnswer['citations'] = {}
  for (const { p, excerpt } of chosen) {
    text += '\n- '
    const start = Array.from(text).length
    text += `${p.date ? `In ${p.date.slice(0, 4)}, ` : ''}${p.speaker ?? 'a speaker'}${p.party ? ` (${p.party})` : ''} said: “${excerpt!.text}”`
    ;(citations[p.id] ??= []).push([start, Array.from(text).length])
  }
  return { answer: text, citations, sources: sourcesOf(chosen.map(c => c.p)) }
}

/** The named-politician position path's draft when no point passed its checks (16 Oct): each point the model wrote
 * stands as an uncited line, unquoted unless verbatim and without figures its passages lack, unless it crosses a
 * hard line (another named person speaking, unattributed causation, the SA placeholder). Null when none is left. */
export function loosePositionPoints(drafted: { text: string; citations: { id: string; quote: string }[] }[], sources: { id: string; snippet: string; date?: string }[], speaker: string, question: string, roster: unknown): { text: string; ids: string[] }[] | null {
  const out: { text: string; ids: string[] }[] = []
  for (const point of drafted.slice(0, 4)) {
    const ids = point.citations.map(c => c.id), own = sources.filter(s => ids.includes(s.id)), cited = own.length ? own : sources
    // A detail follow-up (a cap, a cost, a duration) keeps each figure inside the point's own verbatim excerpt, as
    // on the verified path: a neighbouring sentence's figure cannot support it. Otherwise any of its passages may.
    const quotes = point.citations.filter(c => own.some(s => s.id === c.id && normal(s.snippet).includes(normal(c.quote)))).map(c => c.quote)
    const evidence = isPositionDetailQuestion(question) && quotes.length ? quotes.join('\n') : cited.map(s => s.snippet).join('\n')
    let text: string | null = strayQuotesOut(repairQuotes(point.text.replace(/\s+/g, ' ').trim(), evidence, () => {}))
    if (!/[\p{L}\p{N}]/u.test(text) || withoutSaPlaceholder(text) !== text) continue
    text = repairCausal(text, speaker, () => {})
    if (text === null) continue
    text = repairAttribution(text, speaker, roster, () => {})
    if (text === null) continue
    text = withoutUnsupportedFigures(text, t => positionPointSupported(t, evidence, question, cited[0]?.date ?? ''))
    if (text === null) continue
    if (!out.some(p => normal(p.text).toLowerCase() === normal(text!).toLowerCase())) out.push({ text, ids: own.map(s => s.id) })
  }
  return out.length ? out : null
}
