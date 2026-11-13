import {ASK_EVIDENCE_RULES} from './ask-writing-rules'
import type {ReceiptMeasure} from './voice-money'
import {RECEIPTS_WRITING_RULE} from './receipt-copy'
/**
 * A written opening for a calculated money answer.
 *
 * The figures underneath it are added up from the disclosed receipts and are
 * the authority; this paragraph only says what they show. So the model is
 * never asked to work anything out: it is handed a sheet of already-computed
 * facts and may use no number that is not on it. Every number it writes is
 * checked back against that sheet, and a paragraph that fails any check is
 * dropped rather than repaired - a calculated answer is never worse for
 * having asked, only sometimes plainer.
 */

export type MoneyFacts = {
  recipient_party?: string
  jurisdiction?: string
  /** The canonical wording of the selection, where one exists: the same
   *  figures must always produce the same sheet, whatever a reader typed. */
  question?: string
  /** What the rows are ranked by, in the words the answer uses. */
  ranked_by: string
  /** One sentence naming the register, the period and the size of the selection. */
  selection: string
  rows: { name: string; amount: string; records: string; measure_label?:string }[]
  /** Comparisons worked out here, so the model copies rather than calculates. */
  derived: string[]
  measure: ReceiptMeasure
  measure_label: string
}

const MAX_CHARS = 420
const MIN_CHARS = 60

/** A claim of influence is not something disclosure records can establish. */
const OVERREACH = /\b(?:bought|buying|bribe\w*|corrupt\w*|kickback\w*|in exchange for|paid for (?:access|influence|votes?)|proves?|proof that|caused|because of (?:these|the) donations)\b/i

/** The same digit-group reading the position verifier uses, so a figure written
 *  a different way than the sheet still has to be one of the sheet's. */
const numbers = (value: string): string[] =>
  (value.toLowerCase().match(/\d+(?:[,.]\d+)*%?|\b(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\b/g) || [])
    .map(token => (/^\d/.test(token) ? token.replace(/[,%]/g, '').replace(/\.0+$/, '') : token))

export function moneyOverviewPrompt(facts: MoneyFacts): string {
  return [
    ASK_EVIDENCE_RULES, RECEIPTS_WRITING_RULE,
    'Write a short paragraph following the calculator’s opening and introducing its ranked figures.',
    ...(facts.question ? [`Question: ${facts.question}`] : []),
    `What was counted: ${facts.selection}`,
    `Ranked by: ${facts.ranked_by}`,
    `Measure label: ${facts.measure_label??'disclosed receipts, all types'}`,
    '--- THE FIGURES (complete facts and calculated comparisons) ---',
    ...facts.rows.map((row,i)=>`${i+1}. ${row.name}; ${row.amount}; ${row.measure_label??facts.measure_label}; ${row.records}`),
    ...facts.derived,
    '--- END THE FIGURES ---',
    'THE FIGURES is the complete set, including every comparison already worked out. Use its names and numbers as written.',
    'Write as you would tell someone the result: who is first, by how much, and who follows. Close with a few words on what the figure counts, using the measure label.',
    'Use two or three sentences, under 60 words, in plain Australian English. Return a prose paragraph.',
  ].join('\n')
}

/**
 * The written opening, or '' if it failed a check. Fails closed on: a number
 * that is not on the sheet, markdown or a link, a claim disclosure records
 * cannot support, and anything outside the length the answer has room for.
 */
export function verifiedOverview(text: string, facts: MoneyFacts): string {
  const clean = String(text || '')
    .replace(/^\s*(?:overview|opening|answer)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (clean.length < MIN_CHARS || clean.length > MAX_CHARS) return ''
  if (/[|#*_`~\[\]<>]|https?:\/\//.test(clean)) return ''
  if (OVERREACH.test(clean)) return ''
  if (clean.split(/(?<=[.!?])\s+/).filter(Boolean).length > 4) return ''
  const allowed = new Set(numbers([facts.question || '', facts.selection, ...facts.rows.map(r => `${r.name} ${r.amount} ${r.records}`), ...facts.derived].join(' ')))
  if (numbers(clean).some(number => !allowed.has(number))) return ''
  return clean
}
