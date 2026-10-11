// Output validation. A faithful port of validate_payload (scripts/codex_enrichment_loop.py)
// plus the guards in summary_workers._clean and the copied-opening check in
// summary_workers.cmd_submit. One record at a time: the per-rid prefix the
// Python validator adds to each complaint is dropped because the complaint
// goes straight back to the model that wrote it.
//
// A summary that fails any check is NEVER written to the knowledge box.

import { MAX_TOPIC_LABELS, TOPIC_SLUGS } from './topics.ts'
import { squash, wordCount } from './text.ts'
import historicNames from './historic-names.json' with { type: 'json' }

export interface SourceRecord {
  title?: string
  /** The clipped text the model was shown: the only place a figure may come from. */
  text: string
  /** Enables the historic-only capitalised-term provenance check. */
  historic?: boolean
  /** Full unit text for name provenance; figures still use the clipped model input. */
  nameText?: string
}

export const NAMES_PROBLEM = 'unsupported capitalised term; use only names that appear in the speech; describe private individuals by role'

/** Punctuation normalisation for both source support and capitalised terms. */
export const normaliseTermText = (s: string): string => s.normalize('NFKC')
  .replace(/[’‘ʼ`]/g, "'").replace(/[‐‑‒–—−]/g, '-')
  .replace(/\s+/gu, ' ').trim()

const TERM_WORD = /[\p{L}\p{M}\p{N}]+(?:['-][\p{L}\p{M}\p{N}]+)*/gu

/** Whole lexical terms; possessives and surrounding punctuation are grammatical. */
export const nameKey = (s: string): string =>
  (normaliseTermText(s).replace(/'s\b/gi, '').toLowerCase().match(TERM_WORD) ?? []).join(' ')

const ROSTER_NAMES = new Set(historicNames.names.split('\n').map(nameKey))

// Reviewed closed list. No electorates, gazetteer, portfolio vocabulary, street,
// geographic prefixes, institution suffixes or general acronym exemptions.
// Membership is for the ENTIRE candidate: "Government Zelara" is not Government.
export const NON_PERSON_TERMS = [
  'New South Wales', 'Victoria', 'Queensland', 'South Australia', 'Western Australia',
  'Tasmania', 'Northern Territory', 'Australian Capital Territory',
  'NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT',
  'Sydney', 'Melbourne', 'Brisbane', 'Adelaide', 'Perth', 'Hobart', 'Darwin', 'Canberra',
  'Parliament', 'House', 'Senate', 'Commonwealth', 'Australia', 'Australian',
  'Government', 'Opposition', 'Minister', 'Bill', 'Act', 'Committee', 'Department',
  'Treasurer', 'Speaker', 'President', 'Premier', 'Prime Minister', 'Deputy Prime Minister',
  'Deputy Treasurer', 'Mr Speaker', 'Madam Speaker', 'Mr President', 'Madam President',
  'Mr Deputy Speaker', 'Mr Deputy President',
  'Labor', 'Liberal', 'National', 'Greens', 'Australian Labor Party', 'Labor Party',
  'Liberal Party', 'National Party', 'Country Party', 'Australian Democrats',
  'Australian Greens', 'One Nation', 'Liberal National Party',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'Monday', 'Tuesday', 'Wednesday', 'Thursday',
  'Friday', 'Saturday', 'Sunday',
] as const
const NON_PERSON_KEYS = new Set(NON_PERSON_TERMS.map(nameKey))

// Only sentence-initial words get this exception, including the existing brief
// prompt's action verbs. A capitalised occurrence elsewhere still needs support.
const SENTENCE_OPENERS = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'it', 'its', 'he', 'she', 'they',
  'we', 'i', 'in', 'on', 'at', 'by', 'for', 'from', 'to', 'with', 'as', 'if', 'but',
  'and', 'or', 'there', 'their', 'his', 'her', 'our',
  'asked', 'argued', 'announced', 'moved', 'reported', 'paid', 'urged', 'called',
  'supported', 'opposed', 'said', 'noted', 'outlined', 'explained', 'warned',
  'welcomed', 'proposed', 'discussed', 'questioned', 'thanked', 'commended',
])
const CONNECTORS = new Set(['of', 'de', 'la', 'van'])
const CAPITAL_WORD = /^(?:[\p{Lu}\p{Lt}]|[\p{L}\p{M}]+['-][\p{Lu}\p{Lt}])/u
const JOIN = /^[\s'-]+$/u

/** Maximal capitalised terms; no attempt to distinguish people from places. */
export function capitalisedTerms(value: string): string[] {
  const text = normaliseTermText(value)
  const words = [...text.matchAll(TERM_WORD)]
  const terms: string[] = []
  const isCapital = (i: number): boolean => CAPITAL_WORD.test(words[i][0])
  const sentenceInitial = (i: number): boolean => {
    const start = i ? words[i - 1].index! + words[i - 1][0].length : 0
    const gap = text.slice(start, words[i].index!)
    return i === 0 || /[.!?]/u.test(gap)
  }
  for (let i = 0; i < words.length; i++) {
    if (!isCapital(i) || (sentenceInitial(i) && SENTENCE_OPENERS.has(words[i][0].toLowerCase()))) continue
    const start = words[i].index!
    let end = start + words[i][0].length
    // Connectors count only when followed by another capitalised word. The
    // entire run is checked, even if some of its words are individually allowed.
    while (i + 1 < words.length) {
      let next = i + 1
      let previousEnd = end
      while (next < words.length && CONNECTORS.has(words[next][0])) {
        if (!JOIN.test(text.slice(previousEnd, words[next].index!))) break
        previousEnd = words[next].index! + words[next][0].length
        next++
      }
      if (next >= words.length || !isCapital(next) || !JOIN.test(text.slice(previousEnd, words[next].index!))) break
      i = next
      end = words[i].index! + words[i][0].length
    }
    terms.push(text.slice(start, end))
  }
  return terms
}

/** Historic guard against novelty. Diagnostics never contain candidate text. */
export function hasNewPersonalName(summary: string, unitText: string): boolean {
  const source = ` ${nameKey(unitText)} `
  return capitalisedTerms(summary).some((term) => {
    const key = nameKey(term)
    return !source.includes(` ${key} `) && !ROSTER_NAMES.has(key) && !NON_PERSON_KEYS.has(key)
  })
}

// codex_enrichment_loop.validate_payload limits (stricter than summary_workers' 800).
export const MIN_CHARS = 40
export const MAX_CHARS = 600
export const MIN_WORDS = 8
export const MAX_WORDS = 80

/**
 * The bake-off's deterministic cleanup (scratchpad/bakeoff/final.py cleanup_summary and
 * clean_topics; it raised the valid rate about ten points without changing meaning).
 * Applied to model output BEFORE validation; the validator itself is unchanged.
 */

// final.py _PUNCT, in its order: non-breaking hyphens and dashes to "-", an em dash to " - ",
// the minus sign to "-", curly quotes to straight quotes, an ellipsis to "...", and
// no-break / narrow no-break / thin spaces to a plain space.
const PUNCT: Array<[string, string]> = [
  ['\u2011', '-'],
  ['\u2010', '-'],
  ['\u2012', '-'],
  ['\u2013', '-'],
  ['\u2014', ' - '],
  ['\u2212', '-'],
  ['\u2018', "'"],
  ['\u2019', "'"],
  ['\u201c', '"'],
  ['\u201d', '"'],
  ['\u2026', '...'],
  ['\u00a0', ' '],
  ['\u202f', ' '],
  ['\u2009', ' '],
]

/** final.py ascii_punct: non-ASCII punctuation to ASCII, then collapse runs of whitespace and trim. */
export function asciiPunct(s: string): string {
  let out = s
  for (const [from, to] of PUNCT) out = out.replaceAll(from, to)
  return out.replace(/\s{2,}/g, ' ').trim()
}

/**
 * final.py cleanup_summary: ASCII punctuation, and "N%" becomes "N per cent" (or "N percent")
 * only when the source says "N per cent" and does not say "N%": the validator counts "27%" and
 * "27" as different figures, so the model's percent sign would otherwise fail a faithful brief.
 */
export function cleanupSummary(summary: string, sourceText: string): string {
  const s = asciiPunct(summary)
  const low = sourceText.toLowerCase()
  return s.replace(/(\d[\d.,]*)\s?%/g, (whole, num: string) => {
    if (!sourceText.includes(`${num}%`) && low.includes(`${num} per cent`)) return `${num} per cent`
    if (!sourceText.includes(`${num}%`) && low.includes(`${num} percent`)) return `${num} percent`
    return whole
  })
}

// summary_workers._BAD_OPENERS, plus the "This release" opener the Codex prompt forbids.
const BAD_OPENERS = [
  'in this speech',
  'this speech',
  'in this release',
  'this release',
  'summary:',
  'the speaker says',
  'the member says',
  'the senator says',
]

const NON_ASCII_MARKS = ['—', '–', '‘', '’', '“', '”']
const NUMBER_PATTERN = /(?<![\d,])\d[\d,]*(?:\.\d+)?%?/g

const numbersIn = (s: string): string[] => Array.from(s.matchAll(NUMBER_PATTERN), (m) => m[0])
const stripCommas = (s: string): string => s.replaceAll(',', '')

/** Validate one brief against the text it was written from. Empty array = valid. */
export function validateSummary(value: unknown, item: SourceRecord): string[] {
  if (typeof value !== 'string') return ['brief is not a string']
  const problems: string[] = []
  if (item.historic && hasNewPersonalName(value, item.nameText ?? item.text)) problems.push(NAMES_PROBLEM)

  // --- codex_enrichment_loop.validate_payload ---
  const words = wordCount(value)
  if (words < MIN_WORDS || words > MAX_WORDS) {
    problems.push('use 8-80 words (short questions and procedural records may be concise)')
  }
  if (value.length > MAX_CHARS || value.length < MIN_CHARS) problems.push('use 40-600 characters')
  if (NON_ASCII_MARKS.some((mark) => value.includes(mark))) problems.push('use plain ASCII punctuation')

  // Not in the Python validator: a degenerate reply ("!!!!", "! ! ! ! ! ! ! !") can pass the word and
  // character counts, so require some actual words.
  if ((value.match(/[A-Za-z]{2,}/g) ?? []).length < 5) problems.push('not readable prose')

  const sourceText = (item.text ?? '').replaceAll('½', '.5').replaceAll('¼', '.25').replaceAll('¾', '.75')
  const speaker = (item.title ?? '').split(' — ', 1)[0].trim().toLowerCase()
  if (
    speaker &&
    speaker.split(/\s+/).filter(Boolean).length >= 2 &&
    value.toLowerCase().includes(speaker) &&
    !sourceText.toLowerCase().includes(speaker)
  ) {
    problems.push('do not name or infer the record speaker')
  }

  const sourceNumbers = new Set(numbersIn(sourceText).map(stripCommas))
  const flagged = new Set<string>()
  for (const number of numbersIn(value)) {
    if (!sourceNumbers.has(stripCommas(number)) && !flagged.has(number)) {
      flagged.add(number)
      problems.push(`figure ${number} is not present in the supplied text`)
    }
  }

  // --- summary_workers._clean ---
  const flat = squash(value)
  if (flat.includes('{context}') || (flat.includes('{') && flat.includes('}'))) problems.push('placeholder text')
  if (flat.length > 800) problems.push(`too long (${flat.length} chars)`)
  const lower = flat.toLowerCase()
  if (BAD_OPENERS.some((opener) => lower.startsWith(opener))) {
    problems.push("do not open with a framing phrase such as 'In this speech', 'This release' or 'The speaker says'")
  }
  if ((flat.match(/[.!?](\s|$)/g) ?? []).length > 4) problems.push('more than three sentences')

  // --- summary_workers.cmd_submit: a brief that is the speech's own opening was not written from reading ---
  const head = squash(item.text ?? '').slice(0, 240).toLowerCase()
  if (flat.length >= 60 && head.includes(lower.slice(0, 60))) problems.push("copies the speech's opening")

  return problems
}

export interface TopicsVerdict {
  topics: string[]
  problems: string[]
}

/**
 * final.py clean_topics / label_workers.cmd_submit: lowercase, DROP anything that is not a
 * slug from the taxonomy, de-duplicate, keep at most four. An empty result is a legitimate
 * verdict (procedural business, tributes, thin text): a list of only invalid slugs is
 * therefore an empty verdict, not a failure. Only a value that is not a list at all
 * (missing key, an object, a number) is rejected.
 */
export function validateTopics(value: unknown): TopicsVerdict {
  let raw: unknown[]
  if (Array.isArray(value)) raw = value
  else if (typeof value === 'string') raw = value.split(/[,;\n]+/)
  else if (value === null || value === undefined) return { topics: [], problems: ['topics is missing'] }
  else return { topics: [], problems: ['topics is not a list'] }

  const topics: string[] = []
  for (const entry of raw) {
    const slug = String(entry ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-')
    if (slug && TOPIC_SLUGS.includes(slug) && !topics.includes(slug)) topics.push(slug)
  }
  return { topics: topics.slice(0, MAX_TOPIC_LABELS), problems: [] }
}
