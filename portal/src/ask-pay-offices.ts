import type { CatalogRecord } from './catalog-search'
import { officeRate, officeSource, payOfficeRecord, payOfficeGeneralRecords, rankedOffices } from './pay-records.mjs'

/**
 * "Who is the highest paid agency head?" is answered by instrument, like a
 * parliamentarian's salary: the Remuneration Tribunal fixes what departmental
 * secretaries and full-time statutory office holders are paid, and sets the
 * bands for principal executive offices. /pay-offices.json
 * (scripts/build_pay_offices.py) holds those rates with their FRL ids and
 * clauses; this module answers from it without a model. ask-pay.ts calls it
 * first and supplies the parliamentary side of a comparison.
 */

export interface OfficeRow {
  id: string; office: string; body: string | null
  kind: 'secretary' | 'full_time_office' | 'statutory_office' | 'peo_band'; head: boolean
  amount: number | null; min: number | null; max: number | null; measure: string; classification: string | null
  source: string; clause: string; aliases: string[]; keys?: string[]; special?: string
  holder?: { name: string; amount?: number; text: string; source: string; clause: string; url: string; checked: string }
}
export interface OfficeData {
  meta: { as_of: string; checked: string; generated: string; measure: string; notes: string[]; not_covered: string[]
    sources: { id: string; frl_id: string; compilation_id: string; compilation_no: number; compilation_date: string; registered: string; title: string; url: string; publisher: string }[] }
  offices: OfficeRow[]
}
/** What ask-pay.ts found on the parliamentary side of a comparison. */
export interface ParliamentSide { label: string; phrase: string; holder?: string; salary: number; source: { title: string; url: string; publisher: string } }

const aud = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
const plain = (s: string) => s.replace(/[|\n\r\[\]*]/g, ' ').replace(/\s+/g, ' ').trim()
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const ask = (q: string) => '/ask?q=' + encodeURIComponent(q)
/** Must fold exactly as scripts/build_pay_offices.py fold() does: the aliases and keys are stored folded. */
export const foldOffice = (s: string) => s.replace(/[’']/g, '').replace(/&/g, ' and ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
/** A question, or an office title read against one: a possessive 's is dropped ("the Ombudsman's salary"),
 *  so a name followed by 's is still the name. Stored aliases and keys are matched as they are. */
const foldQuestion = (s: string) => foldOffice(s.replace(/(\w)['’]s\b/g, '$1'))
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Words that make a pay question about Commonwealth offices in general.
const GENERAL = /\b(?:agency\s+heads?|heads?\s+of\s+(?:an?\s+|the\s+)?(?:government\s+|commonwealth\s+|federal\s+)?(?:agenc(?:y|ies)|departments?|bodies)|(?:departmental|department)\s+secretar(?:y|ies)|secretar(?:y|ies)\s+of\s+(?:a\s+|the\s+)?departments?|(?:senior\s+)?public\s+servants?|bureaucrats?|mandarins?|statutory\s+(?:office(?:rs?|\s+holders?)?|officers?|appointees?)|(?:full[- ]time\s+)?public\s+office(?:\s+holders?)?|secretaries|principal\s+executive\s+offices?|PEO\s+(?:pay\s+)?bands?)\b/i
export const PARLIAMENTARY_SECRETARY = /\bparliamentary\s+secretar|\bassistant\s+ministers?\b/i
// What was said, or what a body's annual report shows, is not the instrument's rate.
const NOT_THE_RATE = /\b(?:say|said|says|speech(?:es)?|spoke|debate[ds]?|vot(?:e|ed|es|ing)|donat\w*|donors?|annual\s+reports?|actual(?:ly)?|reported|bonus(?:es)?)\b/i
const BANDS = /\bprincipal\s+executive\s+offices?\b|\bPEO\b/i

export function generalOfficeQuestion(question: string): boolean {
  return GENERAL.test(question) && !(PARLIAMENTARY_SECRETARY.test(question) && !/\bdepartment/i.test(question))
}

interface Hit { row: OfficeRow; start: number; end: number }

/** The offices a question names, longest match first, with where each was found
 *  in the folded question so the rest can be read for a parliamentary post. */
export function officesNamed(question: string, data: OfficeData): { rows: OfficeRow[]; rest: string } {
  const q = ` ${foldQuestion(question.slice(0, 4000))} `
  const hits: Hit[] = []
  const find = (phrase: string, rows: OfficeRow[] | (() => OfficeRow[])) => {
    if (!phrase) return
    const re = new RegExp(`(?<= )${escape(phrase)}(?= )`, 'g')
    for (const m of q.matchAll(re)) { const picked = typeof rows === 'function' ? rows() : rows; for (const row of picked) hits.push({ row, start: m.index!, end: m.index! + phrase.length }) }
  }
  // A secretary: "secretary" (or a department's head) beside a department's name.
  if (/secretar|head of/.test(q) && !PARLIAMENTARY_SECRETARY.test(question)) {
    for (const row of data.offices.filter(r => r.kind === 'secretary')) {
      for (const key of row.keys ?? []) {
        const k = escape(key)
        const re = new RegExp(`(?<= )(?:secretar(?:y|ys|ies) (?:of|to|for|at) (?:the )?(?:department (?:of|for) )?(?:the )?${k}(?: department)?|${k} (?:department )?secretar(?:y|ys|ies)|head of (?:the )?department of (?:the )?${k})(?= )`, 'g')
        for (const m of q.matchAll(re)) hits.push({ row, start: m.index!, end: m.index! + m[0].length })
      }
    }
  }
  const others = data.offices.filter(r => r.kind !== 'secretary' && r.kind !== 'peo_band')
  const bodies = new Map<string, OfficeRow[]>()
  for (const row of others) {
    find(foldQuestion(row.office), [row])
    if (row.body) bodies.set(row.body, [...bodies.get(row.body) ?? [], row])
    else for (const alias of row.aliases) find(alias, [row])
  }
  // A body named alone ("the ACCC", "head of Services Australia") means its head,
  // unless the question names a role in it ("deputy chair of APRA").
  for (const [body, rows] of bodies) {
    const pick = () => {
      const roles = rows.map(row => ({ row, role: foldQuestion(row.office.slice(0, row.office.indexOf(', '))) })).filter(({ role }) => q.includes(` ${role} `))
      if (roles.length) { const longest = Math.max(...roles.map(r => r.role.length)); return roles.filter(r => r.role.length === longest).map(r => r.row) }
      const heads = rows.filter(row => row.head)
      return (heads.length ? heads : rows).slice(0, 1)
    }
    for (const phrase of new Set([foldQuestion(body), ...rows.flatMap(row => row.aliases)])) find(phrase, pick)
  }
  hits.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start)
  const taken: Hit[] = [], rows: OfficeRow[] = []
  for (const hit of hits) {
    if (taken.some(t => t.row !== hit.row && hit.start < t.end && t.start < hit.end)) continue
    taken.push(hit)
    if (!rows.includes(hit.row)) rows.push(hit.row)
  }
  let rest = q
  for (const t of taken) rest = rest.slice(0, t.start) + ' '.repeat(t.end - t.start) + rest.slice(t.end)
  return { rows, rest: rest.replace(/\s+/g, ' ').trim() }
}

type Source = { resource: string; title: string; href: string; url: string; kind: string; snippet: string; cited: boolean; source?: string; dateLabel?: string; date?: string }

function builder(data: OfficeData) {
  let answer = ''
  const citations: Record<string, number[][]> = {}
  const sources: Source[] = []
  const cite = (title: string, href: string, snippet: string, publisher: string, offset = 0) => {
    const end = Array.from(answer).length - offset
    const again = sources.find(row => row.href === href)
    if (again) { citations[again.resource].push([end - 1, end]); if (!again.snippet.includes(plain(snippet))) again.snippet = plain(`${again.snippet} ${snippet}`).slice(0, 1800); return }
    const resource = `pay-${sources.length}`
    citations[resource] = [[end - 1, end]]
    sources.push({ resource, title, href, url: href, kind: 'pay', snippet: plain(snippet).slice(0, 1800), cited: true, source: publisher, dateLabel: `As at ${day(data.meta.as_of)}`, date: data.meta.as_of })
  }
  /** Cite the determination that sets a row's rate, with the row's own clause. */
  const instrument = (row: OfficeRow, offset = 0) => {
    const src = officeSource(data, row)
    if (src) cite(src.title, src.url, `${row.office}: ${officeRate(row)} a year in total remuneration${row.classification ? ` (${row.classification})` : ''}, ${row.clause}. ${src.frl_id}, compilation No. ${src.compilation_no} of ${day(src.compilation_date)}.`, src.publisher, offset)
  }
  return { add: (text: string) => { answer += text }, cite, instrument, text: () => answer, done: () => ({ answer, citations, sources }) }
}

const top = (row: OfficeRow) => row.amount ?? row.max ?? row.min ?? 0
const isRange = (row: OfficeRow) => row.amount == null
/** "is paid $533,550 a year" or "is paid between $932,120 and $983,910 a year". */
const paid = (row: OfficeRow) => row.amount != null ? `${aud(row.amount)} a year` : row.min != null && row.max != null ? `between ${aud(row.min)} and ${aud(row.max)} a year` : row.max != null ? `up to ${aud(row.max)} a year` : `from ${aud(row.min!)} a year`
/** An office as it reads in a sentence: "the Chair of the Australian Prudential Regulation Authority". */
function spoken(office: string): string {
  const comma = office.indexOf(', ')
  if (comma < 0 || /^Secretary\b/.test(office)) return office
  const role = office.slice(0, comma), body = office.slice(comma + 2)
  // "Services Australia", "Comcare", "Austrade" take no article; "the Bureau of Meteorology" does.
  const bare = /\bAustralia(?: New Zealand)?$|^[A-Z][a-z]+$/.test(body) && !/^(?:Australian|National|Office|Bureau|Department)\b/.test(body)
  return `${role} of ${bare ? '' : 'the '}${body}`
}
const the = (office: string) => `the ${spoken(office)}`
const The = (office: string) => `The ${spoken(office)}`

function measureNote(data: OfficeData): string {
  return `**Rates as at ${day(data.meta.as_of)}, set by the Remuneration Tribunal.** Each is total remuneration: the total cost of salary, benefits and the employer superannuation contribution, per year.`
}
function coverage(data: OfficeData): string {
  return `Coverage: Commonwealth departmental secretaries, full-time statutory offices and specified statutory offices, from the Tribunal’s current determinations on the Federal Register of Legislation (${data.meta.sources.map(s => s.frl_id).join(', ')}). Actual pay, including any performance pay, is reported in each body’s annual report. Not covered: ${data.meta.not_covered.join(' ')}`
}
function finish(b: ReturnType<typeof builder>, data: OfficeData, next: { label: string; href: string }[]) {
  b.add(`\n\n${coverage(data)}`)
  const asOf = data.meta.as_of
  return { ...b.done(), answer_status: 'calculated', pay_answer: true, money_context: measureNote(data), pay_next: next,
    coverage: { since: asOf, until: asOf, as_of: asOf, matched: true }, scope: { state: 'federal' } }
}

function table(b: ReturnType<typeof builder>, data: OfficeData, rows: OfficeRow[], numbered = true) {
  b.add(`\n\n|${numbered ? ' # |' : ''} Office | Level | Total remuneration a year |\n|${numbered ? ' ---: |' : ''} --- | --- | ---: |`)
  rows.forEach((row, i) => {
    b.add(`\n|${numbered ? ` ${i + 1} |` : ''} ${plain(row.office)} | ${plain(row.classification ?? '')} | ${officeRate(row)} |`)
    b.instrument(row, 2)
  })
}

const bandsLine = (data: OfficeData) => {
  const bands = data.offices.filter(r => r.kind === 'peo_band'), e = bands.find(b => b.min != null && b.max == null)
  return e ? ` Heads of bodies in the Principal Executive Office structure are paid within a band their employing body applies, and the top band (${e.classification!.replace('PEO ', '')}) starts at ${aud(e.min!)} with no upper limit, so some of them may be paid more.` : ''
}

function rankingAnswer(question: string, data: OfficeData) {
  const secretariesOnly = /secretar/i.test(question) && !/\bagenc|public\s+serv|statutory|bureaucrat|public\s+office|commissioner/i.test(question)
  const wide = /statutory|public\s+office/i.test(question)
  const pool = rankedOffices(data, (row: OfficeRow) => row.kind !== 'peo_band' && (secretariesOnly ? row.kind === 'secretary' : wide || row.head)) as OfficeRow[]
  const lowest = /\b(?:lowest|least)\b/i.test(question) && !/\bhighest\b/i.test(question)
  const rows = lowest ? [...pool].reverse() : pool
  const limit = Math.min(Math.max(Number(/\btop\s+(\d{1,2})\b/i.exec(question)?.[1]) || 10, 1), 30)
  const noun = secretariesOnly ? 'departmental secretary' : /public\s+serv|bureaucrat/i.test(question) ? 'public servant' : wide ? 'statutory office holder' : 'agency head'
  const first = rows[0]
  const b = builder(data)
  b.add(`**${The(plain(first.office))} is the ${lowest ? 'lowest' : 'highest'} paid ${noun}: ${paid(first)} in total remuneration.**`)
  b.instrument(first)
  const next = rows.slice(1, 3)
  if (next.length) b.add(` ${lowest ? 'Next lowest' : 'Next'} ${next.length === 1 ? 'is' : 'are'} ${next.map(row => `${the(plain(row.office))} (${officeRate(row)})`).join(' and ')}.`)
  const ranged = pool.filter(isRange)
  const levels = [...new Set(ranged.map(r => r.classification))].map((level, i) => { const r = ranged.find(x => x.classification === level)!; const n = ranged.filter(x => x.classification === level).length; return `${n}${i ? '' : ` ${n === 1 ? 'secretary' : 'secretaries'}`} at ${level} (${officeRate(r)})` })
  b.add(`\n\n${measureNote(data)} ${pool.length} ${secretariesOnly ? 'departmental secretaries' : wide ? 'offices' : 'heads of departments and agencies'} ranked by the top of their rate.`)
  if (levels.length) b.add(` The ${levels.join(' and ')} are each assigned to a pay point by the Secretary of the Department of the Prime Minister and Cabinet, so their rate is shown as the range.`)
  if (!secretariesOnly && !lowest) b.add(bandsLine(data))
  table(b, data, rows.slice(0, limit))
  return finish(b, data, [
    ...(secretariesOnly ? [{ label: 'Who is the highest paid agency head?', href: ask('Who is the highest paid agency head?') }] : [{ label: 'Top 10 highest paid departmental secretaries', href: ask('Top 10 highest paid departmental secretaries') }]),
    { label: 'Who is the highest paid politician?', href: ask('Who is the highest paid politician?') },
  ])
}

function holderLine(row: OfficeRow): string {
  if (!row.holder) return ''
  const h = row.holder
  return ` The determination names ${plain(h.name)} as the holder${h.amount && h.amount !== row.amount ? `, with a personal rate of ${aud(h.amount)} a year` : ''} (${h.clause}).`
}

function officeAnswer(row: OfficeRow, data: OfficeData) {
  const b = builder(data)
  const name = plain(row.office)
  b.add(`**${The(name)} is paid ${paid(row)} in total remuneration**${row.classification ? ` (${row.classification})` : ''}, as at ${day(data.meta.as_of)}.`)
  b.instrument(row)
  if (row.kind === 'secretary' && isRange(row)) b.add(` The Secretary of the Department of the Prime Minister and Cabinet assigns the office to one of the ${row.classification} pay points.`)
  b.add(holderLine(row))
  if (row.special && row.kind !== 'secretary' && !row.holder) b.add(` ${plain(row.special)}`)
  b.add(`\n\n${measureNote(data)}`)
  // The office beside its peers: its level for a secretary, its body otherwise.
  const peers = row.kind === 'secretary'
    ? rankedOffices(data, (r: OfficeRow) => r.kind === 'secretary' && (r.classification === row.classification || r.amount != null)) as OfficeRow[]
    : row.body ? rankedOffices(data, (r: OfficeRow) => r.body === row.body && r.kind !== 'peo_band') as OfficeRow[] : []
  if (peers.length > 1) table(b, data, peers.slice(0, 12), false)
  return finish(b, data, [
    { label: 'Who is the highest paid agency head?', href: ask('Who is the highest paid agency head?') },
    { label: 'Who is the highest paid politician?', href: ask('Who is the highest paid politician?') },
  ])
}

function compareOffices(rows: OfficeRow[], data: OfficeData) {
  const b = builder(data)
  const sorted = [...rows].sort((x, y) => top(y) - top(x)).slice(0, 6)
  const [a, c] = sorted
  const overlap = (isRange(a) || isRange(c)) && (a.min ?? a.amount ?? 0) <= (c.max ?? c.amount ?? 0)
  b.add(top(a) === top(c) && !isRange(a) && !isRange(c) ? `**${The(plain(a.office))} and ${the(plain(c.office))} are paid the same: ${paid(a)} in total remuneration.**`
    : overlap ? `**${The(plain(a.office))} is paid ${paid(a)} and ${the(plain(c.office))} ${paid(c)}, in total remuneration: the ranges overlap.**`
      : `**${The(plain(a.office))} is paid more: ${paid(a)} in total remuneration, against ${paid(c)} for ${the(plain(c.office))}.**`)
  b.instrument(a); b.instrument(c)
  b.add(`\n\n${measureNote(data)}`)
  table(b, data, sorted, false)
  return finish(b, data, [{ label: 'Who is the highest paid agency head?', href: ask('Who is the highest paid agency head?') }])
}

function compareWithParliament(row: OfficeRow, mp: ParliamentSide, data: OfficeData) {
  const b = builder(data)
  const office = plain(row.office), post = plain(mp.label), phrase = plain(mp.phrase)
  b.add(`**${The(office)}’s total remuneration is ${paid(row)}; ${phrase}’s salary is ${aud(mp.salary)} a year.**`)
  b.instrument(row)
  b.cite(mp.source.title, mp.source.url, `${post}${mp.holder ? ` (${mp.holder})` : ''}: ${aud(mp.salary)} a year in salary.`, mp.source.publisher)
  const more = top(row) > mp.salary
  const within = isRange(row) && (row.min ?? -Infinity) <= mp.salary && mp.salary <= (row.max ?? Infinity)
  if (within) b.add(` On these figures ${phrase}’s salary falls within the range for ${the(office)}.`)
  else b.add(` On these figures ${more ? the(office) : phrase} is paid ${aud(Math.abs((row.amount ?? (more ? row.min! : row.max!)) - mp.salary))} more a year${isRange(row) ? ', at the nearer end of the range' : ''}.`)
  b.add(` The two measure different things: total remuneration includes the employer superannuation contribution and benefits, while a parliamentarian’s salary does not include superannuation or the electorate allowance.`)
  b.add(`\n\n| Office | Holder | Measure | A year |\n| --- | --- | --- | ---: |`)
  b.add(`\n| ${post} | ${plain(mp.holder ?? '')} | salary | ${aud(mp.salary)} |`)
  b.cite(mp.source.title, mp.source.url, `${post}: ${aud(mp.salary)} a year.`, mp.source.publisher, 2)
  b.add(`\n| ${office} | ${plain(row.holder?.name ?? '')} | total remuneration | ${officeRate(row)} |`)
  b.instrument(row, 2)
  return finish(b, data, [
    { label: `What is ${the(office)} paid?`, href: ask(`What is ${the(office)} paid?`) },
    { label: 'Who is the highest paid politician?', href: ask('Who is the highest paid politician?') },
  ])
}

function bandsAnswer(data: OfficeData) {
  const b = builder(data)
  const bands = data.offices.filter(r => r.kind === 'peo_band')
  b.add(`**Principal Executive Offices are paid within ${bands.length} bands of total remuneration a year, from ${bands[0].classification!.replace('PEO ', '')} (${officeRate(bands[0])}) to ${bands[bands.length - 1].classification!.replace('PEO ', '')} (${officeRate(bands[bands.length - 1])}${bands[bands.length - 1].max == null ? ', with no upper limit' : ''}).**`)
  b.instrument(bands[0])
  b.add(` The employing body sets each holder’s pay within the band, and the Minister assigns each office to a band.`)
  b.add(`\n\n${measureNote(data)}`)
  table(b, data, bands, false)
  return finish(b, data, [{ label: 'Who is the highest paid agency head?', href: ask('Who is the highest paid agency head?') }])
}

export interface OfficeIntent { ranking: boolean; amount: boolean; compared: boolean; payWords: boolean }

/** A calculated answer about the offices the Tribunal pays, or null. `parliament`
 *  reads the rest of the question for a parliamentarian or post to compare with. */
export function officePayAnswer(question: string, data: OfficeData, intent: OfficeIntent, parliament: (rest: string) => ParliamentSide | null) {
  if (!intent.payWords || NOT_THE_RATE.test(question) || question.length > 4000) return null
  const { rows, rest } = officesNamed(question, data)
  const general = generalOfficeQuestion(question)
  if (!rows.length && !general) return null
  if (rows.length) {
    const mp = /\b(?:compare|compared|versus|vs|than|against|or|and|with)\b/i.test(question) ? parliament(rest) : null
    if (mp) return compareWithParliament(rows[0], mp, data)
    if (rows.length >= 2) return compareOffices(rows, data)
    return officeAnswer(rows[0], data)
  }
  if (BANDS.test(question) && !intent.ranking) return bandsAnswer(data)
  if (intent.ranking || intent.compared || intent.amount || /\btop\s+\d/i.test(question)) return rankingAnswer(question, data)
  return null
}

const asRecord = (row: { kind: string; title: string; href: string; snippet: string; extra: Record<string, unknown> }): CatalogRecord => ({
  kind: row.kind, title: row.title, href: row.href, snippet: row.snippet, slug: String(row.extra.slug), resource: '',
  dateLabel: String(row.extra.dateLabel ?? ''), source: String(row.extra.source ?? ''), url: String(row.extra.url ?? ''), record_id: String(row.extra.record_id ?? row.extra.slug),
})

/** Office pay records for the model: the offices named, then the rankings. */
export function officeEvidence(question: string, data: OfficeData | null): CatalogRecord[] {
  if (!data) return []
  if (NOT_THE_RATE.test(question) && !/\bpaid|salar|remuneration\b/i.test(question)) return []
  const { rows } = officesNamed(question, data)
  if (!rows.length && !generalOfficeQuestion(question)) return []
  return [...rows.slice(0, 4).map(row => payOfficeRecord(data, row)), ...payOfficeGeneralRecords(data)].map(asRecord)
}

let memo: Promise<OfficeData> | null = null
export function loadOffices(assets: Fetcher): Promise<OfficeData> {
  memo ??= assets.fetch(new Request('https://opax.com.au/pay-offices.json')).then(async (res) => {
    if (!res.ok) throw new Error('Office pay data unavailable')
    const data = await res.json() as OfficeData
    if (!Array.isArray(data?.offices) || !data.offices.length || !Array.isArray(data.meta?.sources)) throw new Error('Office pay data invalid')
    return data
  }).catch((err) => { memo = null; throw err })
  return memo
}
