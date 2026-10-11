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
  /** Enables the historic-only personal-name check. */
  historic?: boolean
  /** Full unit text for name provenance; figures still use the clipped model input. */
  nameText?: string
}

export const NAMES_PROBLEM = 'personal name is absent from the unit text and parliamentary roster; describe private individuals by role'

/** Punctuation/case differences and possessives do not turn a supported name into a new one. */
export const nameKey = (s: string): string => s.normalize('NFC').replace(/[’‘]/g, "'").replace(/[‐‑–]/g, '-')
  .replace(/'s\b/gi, '').replace(/(?<![\p{L}\p{N}])'|'(?![\p{L}\p{N}])/gu, ' ')
  .toLowerCase().replace(/[^\p{L}\p{N}'-]+/gu, ' ').trim()

const ROSTER_NAMES = new Set(historicNames.names.split('\n').map(nameKey))
const NON_PERSON_NAMES = new Set((historicNames.electorates + '\n' + [
  'New South Wales', 'New Zealand', 'Papua New Guinea', 'East Timor', 'South Africa', 'Sri Lanka',
  'United States', 'United Kingdom', 'Great Britain', 'Northern Ireland', 'Middle East', 'South East Asia',
  'South Australia', 'Western Australia', 'Northern Territory', 'Australian Capital Territory',
  'New York', 'Los Angeles', 'Hong Kong', 'South Korea', 'North Korea', 'Solomon Islands',
  'Gold Coast', 'Sunshine Coast', 'Alice Springs', 'Port Augusta', 'Port Lincoln', 'Port Moresby',
  'Torres Strait', 'Cape York', 'Bass Strait', 'Darling Downs', 'Broken Hill', 'Lord Howe',
  'Second Reading', 'First Reading', 'Third Reading', 'Question Time', 'Leave Granted',
  'General Business', 'Private Members', 'Public Interest', 'Social Security', 'Native Title',
  'Industrial Relations', 'Foreign Affairs', 'Defence Force', 'Armed Forces', 'Small Business',
  'Prime Minister', 'Deputy Prime Minister', 'Chief Minister', 'Deputy Speaker', 'Acting Speaker',
  'Deputy President', 'Acting President', 'Assistant Treasurer', 'Mr Speaker', 'Madam Speaker',
  'Mr President', 'Madam President', 'Mr Deputy Speaker', 'Mr Deputy President',
  'The Treasurer', 'The Speaker', 'The President', 'The Minister', 'The Commonwealth',
  'Treasurer', 'Speaker', 'President', 'Minister', 'Premier', 'Deputy Treasurer',
  'Australian Democrats', 'Australian Greens', 'One Nation', 'Liberal Nationals',
].join('\n')).split('\n').map(nameKey))

// Exemptions are whole phrases. Titled people never inherit institutional exemptions.
const OPENING_WORD = /^(?:The|A|An|Asked|Argued|Announced|Moved|Reported|Paid|Urged|Called|Supported|Opposed|Said|Noted|Outlined|Explained|Warned|Welcomed|Proposed|Discussed|Questioned|Thanked|Commended)\s+/i
const CAPITAL = String.raw`(?:\p{Lu}\.(?!\p{L})|\p{Lu}[\p{L}\p{M}]*(?:['’\-‐‑–][\p{L}\p{M}]+)*)(?:'s)?(?![\p{L}\p{M}\p{N}\-‐‑–]|['’][\p{L}\p{M}])`
const PARTICLES = String.raw`(?:(?:de|del|della|la|le|los|van|von|der|den|da|dos|du|al|bin)\s+)*`
const PERSON = String.raw`${PARTICLES}${CAPITAL}(?:\s+${PARTICLES}${CAPITAL}){0,5}`
const TITLE_WORDS = String.raw`(?:Deputy Prime Minister|Prime Minister|Mr|Mrs|Ms|Miss|Dr|Sir|Dame|Senator|Professor|Prof|Captain|Rev|Reverend|Minister|Treasurer|Premier|President|Speaker|Justice|General)`
const TITLE = `(?:${TITLE_WORDS.slice(3,-1).split('|').flatMap(word=>[word,word.toUpperCase()]).join('|')})`
const PORTFOLIO = String.raw`(?:Foreign|Home|Education|Training|Transport|Regional|Development|Industry|Science|Small|Business|Trade|Health|Resources|Energy|Agriculture|Primary|Environment|Arts|Tourism|Employment|Workplace|Relations|Defence|Finance|Immigration|Ethnic|Affairs|Veterans|Human|Services|Family|Families|Children|Justice|Police|Housing|Communications|Infrastructure|Indigenous|Aboriginal|Community|Sport|Recreation|Social|Security|Administrative|Water|Forestry|Fisheries|Conservation|Land|Labor|Industrial|Assistance|Aged|Care|Territories|Northern|Youth|Consumer|Multicultural|Customs|Local|Government|National|International|Cooperation|Public|Works)`
const PORTFOLIO_WORD = `(?:${PORTFOLIO}|${historicNames.portfolioWords.split('\n').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`
const OFFICE = /^(?:(?:Mr|Madam) (?:Deputy |Acting )?(?:Speaker|President)|(?:Deputy )?Prime Minister|the Treasurer)$/i
const ACRONYMS = new Set(['ABC', 'APRA', 'ATO', 'ASIC', 'ABS', 'CSIRO', 'RAN', 'RAAF', 'NATO', 'UN', 'UNESCO', 'WHO', 'OECD', 'ACT', 'NSW', 'MP', 'QC', 'KC', 'AO', 'AM', 'AC', 'OBE', 'CBE'])
const INSTITUTION_END = /^(?:[\p{L}'-]+\s+)*(?:act|bill|amendment|regulations?|treaty|convention|agreement|scheme|program|strategy|report|inquiry|commission|authority|council|association|services?|agency|party|government|parliament|assembly|tribunal|courts?|committee|university|bank|fund|union|college|hospital|centre|department|office|corporation|company|ltd|pty|board|road|street|islands?|bay|mountains?|sea|ocean|gulf|valley|lake|force|forces|navy|army|air force)$/iu
const GEOGRAPHIC_PREFIX = /^(?:port|cape|mount|mt|lake|river)\s+[\p{L}'-]+(?:\s+[\p{L}'-]+){0,4}$/iu
const ORGANISATION_PREFIX = /^(?:department|ministry|office) of (?:[\p{L}'-]+\s*)+$/iu

export interface NameCandidate { name: string; titled: boolean }

/** Recognise titled people, compound/uppercase names and surnames in personal positions. */
export function personalNameCandidates(text: string): NameCandidate[] {
  const candidates: NameCandidate[] = []
  const occupied: Array<[number, number]> = []
  const lawSpans = Array.from(text.matchAll(new RegExp(String.raw`\b${CAPITAL}(?:\s+(?:${CAPITAL}|and|of|the|for)|\s+\([^()\r\n]{1,120}\)){0,16}\s+(?:Act|Bill)\b`, 'gu')), (m): [number, number] => [m.index!, m.index! + m[0].length])
  const portfolioSpans = Array.from(text.matchAll(new RegExp(String.raw`\bMinister for ${PORTFOLIO_WORD}\b(?:\s+(?:${PORTFOLIO_WORD}|and|the)\b){0,12}`, 'giu')), (m): [number, number] => [m.index!, m.index! + m[0].length])
  const assistingSpans = Array.from(text.matchAll(/\bMinister Assisting the (?:Prime Minister|Treasurer|Minister)\b/g), (m): [number, number] => [m.index!, m.index! + m[0].length])
  // Titles are recognised first, independently of law and organisation words.
  for (const m of text.matchAll(new RegExp(String.raw`(?<![\p{L}\p{N}'’\-‐‑–])${TITLE}\.?\s+(${PERSON})`, 'gu'))) {
    if (assistingSpans.some(([a,b]) => m.index! >= a && m.index! + m[0].length <= b)) continue
    // Within a whole law title, Justice denotes a subject. Explicit personal
    // honorifics still count, even when the name contains institutional words.
    if (m[0].startsWith('Justice ') && lawSpans.some(([a,b]) => m.index! + m[0].length <= b && /^(?:Law|Criminal Law|Civil Law) and$/.test(text.slice(a,m.index!).trim()))) continue
    let name = m[1]
    const office = /^(?:Deputy |Acting )?(?:Speaker|President)\b/i.exec(name)
    if (office && /^(?:Mr|Madam)\b/i.test(m[0])) {
      const rest = name.slice(office[0].length).trim()
      if (!rest) { occupied.push([m.index!, m.index! + m[0].length]); continue }
      name = rest
    }
    candidates.push({ name, titled: true })
    occupied.push([m.index!, m.index! + m[0].length])
  }
  occupied.push(...lawSpans, ...portfolioSpans, ...assistingSpans)
  // Whole public offices, including multiword titles, are non-person spans.
  for (const m of text.matchAll(/\b(?:(?:Mr|Madam) (?:Deputy |Acting )?(?:Speaker|President)|(?:Deputy )?Prime Minister|the Treasurer)\b/g)) {
    occupied.push([m.index!, m.index! + m[0].length])
  }
  occupied.sort((a, b) => a[0] - b[0])
  const addFragments = (start: number, end: number): void => {
    const fragments: string[] = []
    for (const [a, b] of occupied) {
      if (b <= start || a >= end) continue
      if (a > start) fragments.push(text.slice(start, a))
      start = Math.min(end, b)
    }
    if (start < end) fragments.push(text.slice(start, end))
    for (const fragment of fragments) {
      const name = fragment.trim().replace(OPENING_WORD, '').replace(/\s+(?:MP|QC|KC|AO|AM|AC|OBE|CBE)$/, '')
      if (name.split(/\s+/).length >= 2) candidates.push({ name, titled: false })
    }
  }
  for (const m of text.matchAll(new RegExp(String.raw`(?<![\p{L}\p{N}\-‐‑–])${CAPITAL}(?:\s+(?:(?:and|of|the|for)\s+|${PARTICLES})${CAPITAL}){1,12}`, 'gu'))) {
    addFragments(m.index!, m.index! + m[0].length)
  }
  const inOccupied = (start: number, end: number): boolean => occupied.some(([a, b]) => start >= a && end <= b)
  for (const pattern of [
    String.raw`(?<![\p{L}\p{N}'’\-‐‑–])(${CAPITAL})\s+(?:said|argued|asked|announced|warned|proposed|urged|testified|supported|opposed|called|reported|told|wrote|was|has|had|is)\b`,
    String.raw`\b(?:[Tt]hanked|[Cc]ommended|[Cc]riticised|[Cc]riticized|[Cc]ongratulated|[Aa]sked|[Mm]et|[Nn]amed|[Cc]onsulted|[Pp]raised|[Tt]old|[Uu]rged|[Cc]alled on|[Ww]elcomed|[Rr]emembered|[Aa]cknowledged|[Ii]ntroduced|[Aa]ddressed|[Ee]ndorsed|[Mm]ourned|[Ss]ingled out)\s+(${PERSON})`,
    String.raw`\b(?:with|by|from|to)\s+(${PERSON})(?=\s+(?:to|for|who|said|argued|supported|opposed|about|on)\b|[,.])`,
    String.raw`(?<![\p{L}\p{N}'’\-‐‑–])(${CAPITAL})(?<=['’]s)\s+(?:speech|proposal|remarks|evidence|appointment|death|resignation|request)\b`,
  ]) {
    for (const m of text.matchAll(new RegExp(pattern, 'gu'))) {
      const start = m.index! + m[0].indexOf(m[1])
      if (!inOccupied(start, start + m[1].length)) candidates.push({ name: m[1], titled: false })
    }
  }
  return candidates
}

export function isNonPersonalReference(candidate: NameCandidate): boolean {
  if (candidate.titled) return false
  const key = nameKey(candidate.name)
  return NON_PERSON_NAMES.has(key) || OFFICE.test(candidate.name) || ACRONYMS.has(candidate.name)
    || INSTITUTION_END.test(key) || GEOGRAPHIC_PREFIX.test(key) || ORGANISATION_PREFIX.test(key)
    || /^royal (?:[\p{L}'-]+\s+)*(?:navy|army|air force|society|college|commission|hospital|institute)$/iu.test(key)
}

/** No names are included in diagnostics, logs or retry complaints. */
export function hasNewPersonalName(summary: string, unitText: string): boolean {
  const source = ` ${nameKey(unitText)} `
  return personalNameCandidates(summary).some((candidate) => {
    const key = nameKey(candidate.name)
    return !source.includes(` ${key} `) && !ROSTER_NAMES.has(key) && !isNonPersonalReference(candidate)
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
