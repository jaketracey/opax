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
  /** The canonical wording of the selection, where one exists: the same
   *  figures must always produce the same sheet, whatever a reader typed. */
  question?: string
  /** What the rows are ranked by, in the words the answer uses. */
  ranked_by: string
  /** One sentence naming the register, the period and the size of the selection. */
  selection: string
  rows: { name: string; amount: string; records: string }[]
  /** Comparisons worked out here, so the model copies rather than calculates. */
  derived: string[]
  limits: string[]
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
    'Write the opening of an answer for a reader who asked about the figures below.',
    'A table of those figures follows what you write; you are introducing it, not replacing it.',
    '',
    ...(facts.question ? [`QUESTION: ${facts.question}`, ''] : []),
    `WHAT WAS COUNTED: ${facts.selection}`,
    `RANKED BY: ${facts.ranked_by}`,
    '',
    '--- THE FIGURES (the only numbers you may use, copied exactly) ---',
    ...facts.rows.map((row, i) => `${i + 1}. ${row.name} — ${row.amount} — ${row.records}`),
    ...facts.derived.map(line => `- ${line}`),
    '--- END THE FIGURES ---',
    '',
    'WHAT THESE RECORDS CANNOT SHOW:',
    ...facts.limits.map(line => `- ${line}`),
    '',
    'Write two or three sentences of plain prose, under 60 words in total, the way you would ' +
      'explain the table to someone reading over your shoulder. Name who is at the top and who ' +
      'is near them, say how close or far apart they are and what the rest of the field looks ' +
      'like, and close by saying in your own words one thing these records cannot establish.',
    '',
    'Every number you write must be copied from THE FIGURES above, character for character. ' +
      'Work nothing out: if a comparison is not given there, do not make it. Name no party, ' +
      'donor, industry or year that is not given there either. Do not describe the table as a ' +
      'table: never write "row", "listed here", "the figures show", "this selection" or "data". ' +
      'No headings, lists, links, bold or quotation marks. Australian English. Reply with the ' +
      'paragraph and nothing else.',
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
