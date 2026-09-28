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

const CURLY: Array<[RegExp, string]> = [
  [/[\u2018\u2019]/g, "'"],
  [/[\u201c\u201d]/g, '"'],
  [/\u00a0/g, ' '],
  [/[\u2010\u2011\u2012]/g, '-'],
  [/\u2026/g, '...'],
  // A numeric range keeps a bare hyphen; any other dash becomes a spaced hyphen.
  [/(\d)\s*[\u2013\u2014]\s*(\d)/g, '$1-$2'],
  [/\s*[\u2013\u2014]\s*/g, ' - '],
]

/**
 * Typography only: curly quotes, dashes, ellipses and no-break spaces become their
 * plain-ASCII forms. The Python validator rejects these and lets the model rewrite;
 * small models copy "Portfolio Committee No. 5 \u2013 Justice" and "Government\u2019s" from
 * the record constantly (5 of the first 50 rejections in the 2026-09-28 dry run were
 * this alone, two quarantined). The check runs AFTER this rewrite, so a changed year
 * range ("2026\u201327" becomes "2026-27") still fails the figure check if 27 is not in
 * the text. Other non-ASCII characters (accented letters in names) are left alone, as
 * in the Python validator, which only rejects the six typographic marks above.
 */
export function normaliseTypography(s: string): string {
  let out = s
  for (const [pattern, replacement] of CURLY) out = out.replace(pattern, replacement)
  return out
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
 * label_workers.cmd_submit's cleaning: lowercase, keep only slugs from the
 * taxonomy, de-duplicate, keep at most four. An empty list is a legitimate
 * verdict (procedural business, tributes, thin text) and is accepted; a
 * non-empty list with NO valid slug is a vocabulary failure and is rejected.
 */
export function validateTopics(value: unknown): TopicsVerdict {
  let raw: unknown[]
  if (Array.isArray(value)) raw = value
  else if (typeof value === 'string') raw = value.split(/[,;\n]+/)
  else if (value === null || value === undefined) return { topics: [], problems: ['topics is missing'] }
  else return { topics: [], problems: ['topics is not a list'] }

  const topics: string[] = []
  let submitted = 0
  for (const entry of raw) {
    const slug = String(entry ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-')
    if (!slug) continue
    submitted += 1
    if (TOPIC_SLUGS.includes(slug) && !topics.includes(slug)) topics.push(slug)
  }
  if (submitted > 0 && topics.length === 0) {
    return { topics: [], problems: ['none of the topics is a slug from the taxonomy; use only the listed slugs, or [] for none'] }
  }
  return { topics: topics.slice(0, MAX_TOPIC_LABELS), problems: [] }
}
