// Output validation. A faithful port of validate_payload (scripts/codex_enrichment_loop.py)
// plus the guards in summary_workers._clean and the copied-opening check in
// summary_workers.cmd_submit. One record at a time: the per-rid prefix the
// Python validator adds to each complaint is dropped because the complaint
// goes straight back to the model that wrote it.
//
// A summary that fails any check is NEVER written to the knowledge box.

import { MAX_TOPIC_LABELS, TOPIC_SLUGS } from './topics.ts'
import { squash, wordCount } from './text.ts'

export interface SourceRecord {
  title?: string
  /** The clipped text the model was shown: the only place a figure may come from. */
  text: string
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
