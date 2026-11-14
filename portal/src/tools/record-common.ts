/** Shared readers for the record tools: published tables (D1 via the table API) and site URLs. */
import { tableApi } from '../table-api'
import { readToolAsset, type ToolEnv, type ToolCitation } from './types'
import { billQuestionFocus } from '../research-record-answer'

export const fold = (s: unknown) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[‘’ʼ`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim()
export const aud = (n: unknown) => '$' + Math.round(Number(n)).toLocaleString('en-AU')
export const siteUrl = (env: ToolEnv, path: string) => new URL(path, env.origin ?? env.COMMUNITY_ORIGIN ?? 'https://opax.com.au').href
export const clip = (s: unknown, n: number) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** A citation date a reader can read, and one that survives clients that strip ISO dates from text
 *  (search-hubs-002): '2024-07-01' -> '1 July 2024', '2024-07' -> 'July 2024', 2024 -> '2024'.
 *  Anything else, null included, is ''. Structured fields keep the ISO value. */
export function readableDate(value: unknown): string {
  const text = String(value ?? '').trim()
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:T.*)?$/.exec(text)
  if (!m) return ''
  const [, year, month, day] = m, mi = Number(month) - 1
  if (!month) return year
  if (!(mi >= 0 && mi < 12)) return ''
  if (!day) return `${MONTHS[mi]} ${year}`
  const d = Number(day), date = new Date(Date.UTC(Number(year), mi, d))
  return date.getUTCMonth() === mi && date.getUTCDate() === d ? `${d} ${MONTHS[mi]} ${year}` : ''
}
/** A readable span naming only the ends the record holds: '1 July 2024 to 30 June 2025',
 *  'from 1 July 2024', 'to 30 June 2025', or '' when it holds neither (never 'null to null'). */
export function readableRange(from: unknown, to: unknown): string {
  const a = readableDate(from), b = readableDate(to)
  return a && b ? (a === b ? a : `${a} to ${b}`) : a ? `from ${a}` : b ? `to ${b}` : ''
}

export interface BillStage { stage: string; date: string | null; house: string | null; url: string | null; event_raw?: string }
export interface BillAct { title: string | null; frl_uri: string | null; assent_date: string | null; act_number: string | null }
export interface BillFields {
  key: string | null; lifecycle_available: boolean; introduced: string | null; originating_house: string | null
  key_dates: BillStage[]; passed_both_houses: true | null; passed_both_houses_date: string | null
  royal_assent: string | null; act_number: string | null; acts: BillAct[]
  sponsor: string | null; sponsors: string[]; sponsor_parties: (string | null)[]; sponsor_party: string | null; sponsor_person_id: string | null
  portfolio: string | null; status: string | null; status_as_of: string | null
  /** A dead bill's exact ending ("removed") and its words ("Removed from the Notice Paper"), only when the export names one. */
  ended?: string; ended_label?: string
}
const textField = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null
const dateField = (value: unknown): string | null => {
  const valueText = textField(value)
  if (!valueText || !/^\d{4}-\d{2}-\d{2}$/.test(valueText)) return null
  const date = new Date(valueText)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === valueText ? valueText : null
}
const objectField = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const objects = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(objectField).filter((item): item is Record<string, unknown> => !!item) : []
const firstDate = (dates: (string | null)[]) => dates.filter((date): date is string => !!date).sort()[0] ?? null
const sameDate = (dates: (string | null)[]) => { const unique = [...new Set(dates.filter((date): date is string => !!date))]; return unique.length === 1 ? unique[0] : null }

/** A dead bill's exact ending from a published bill file or index row ("removed",
 *  "Removed from the Notice Paper"); nothing when the export names none. */
export function billEnding(record: Record<string, unknown>): { ended?: string; ended_label?: string } {
  const ended = textField(record.ended), ended_label = textField(record.ended_label)
  return ended && ended_label ? { ended, ended_label } : {}
}

/** A catalog link selects only a published bill key, never an arbitrary asset path. */
export function billKey(href: string, slug: string): string | null {
  const key = /^\/bill\/([a-z0-9-]+)(?:[?#].*)?$/.exec(href)?.[1] ?? /^bill-(au-[a-z0-9-]+)$/.exec(slug)?.[1]
  return key && /^au-[a-z0-9-]{1,180}$/.test(key) ? key : null
}

/** Read the same lifecycle as the bill page; missing evidence stays missing. */
export async function billFields(env: ToolEnv, key: string | null): Promise<BillFields> {
  const empty: BillFields = { key, lifecycle_available: false, introduced: null, originating_house: null, key_dates: [], passed_both_houses: null, passed_both_houses_date: null,
    royal_assent: null, act_number: null, acts: [], sponsor: null, sponsors: [], sponsor_parties: [], sponsor_party: null, sponsor_person_id: null, portfolio: null, status: null, status_as_of: null }
  if (!key) return empty
  let doc: Record<string, unknown> | null
  try { doc = objectField(await readToolAsset(env, '/bills/' + key + '.json')) }
  catch { env.signal?.throwIfAborted(); return empty }
  if (!doc || doc.key !== key) return empty
  const key_dates = objects(doc.key_dates).flatMap(event => {
    const stage = textField(event.stage)
    return stage ? [{ stage, date: dateField(event.date), house: textField(event.house), url: textField(event.url), ...(textField(event.event_raw) ? { event_raw: textField(event.event_raw)! } : {}) }] : []
  })
  const acts = objects(doc.acts).map(act => ({ title: textField(act.title), frl_uri: textField(act.frl_uri), assent_date: dateField(act.assent_date), act_number: textField(act.act_number) }))
  const passed = key_dates.filter(event => ['passed', 'passed_both', 'passed_both_houses'].includes(event.stage))
  const actNumbers = [...new Set(acts.map(act => act.act_number).filter((number): number is string => !!number))]
  const portfolio = textField(doc.portfolio), privatePortfolio = !!portfolio && /^\(s\)/i.test(portfolio)
  const privateSponsors = privatePortfolio ? portfolio!.replace(/^\(s\)\s*/i, '') : null
  const sponsor = textField(doc.sponsor) ?? privateSponsors
  // Legacy private-member records explicitly put sponsors in the portfolio slot.
  const members = sponsor ? [...sponsor.matchAll(/([\p{Lu}][\p{Lu}'’\- ]*[\p{Lu}]),\s*([^,]+?),\s*(?:MP|Senator|Sen\.?)(?=\p{Lu}|$)/gu)] : []
  // The export lists every sponsor with their own party (bills-006); older files
  // carry only the first sponsor, or the private-member print above.
  const listed = Array.isArray(doc.sponsors) ? (doc.sponsors as unknown[]).flatMap(entry => {
    const row = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {}
    const name = textField(row.name)
    return name ? [{ name: sponsorName(name), party: textField(row.party) }] : []
  }) : []
  const sponsors = listed.length ? listed.map(entry => entry.name)
    : members.length ? members.map(member => sponsorName(member[1] + ', ' + member[2])) : sponsor ? [sponsorName(sponsor)] : []
  const sponsor_parties = listed.length ? listed.map(entry => entry.party) : sponsors.map((_, i) => i === 0 ? textField(doc.sponsor_party) : null)
  return { ...empty, lifecycle_available: true,
    introduced: dateField(doc.introduced) ?? firstDate(key_dates.filter(event => event.stage === 'introduced').map(event => event.date)),
    originating_house: textField(doc.originating_house), key_dates,
    passed_both_houses: passed.length || doc.passed_both_houses === true ? true : null,
    passed_both_houses_date: dateField(doc.passed_both_houses_date) ?? sameDate(passed.map(event => event.date)),
    royal_assent: dateField(doc.royal_assent) ?? dateField(doc.assent) ?? sameDate([...key_dates.filter(event => ['royal_assent', 'assent', 'assented'].includes(event.stage)).map(event => event.date), ...acts.map(act => act.assent_date)]),
    act_number: textField(doc.act_number) ?? (actNumbers.length === 1 ? actNumbers[0] : null), acts,
    sponsor, sponsors, sponsor_parties, sponsor_party: textField(doc.sponsor_party), sponsor_person_id: textField(doc.sponsor_person_id),
    portfolio: privatePortfolio ? null : portfolio, status: textField(doc.status), status_as_of: dateField(doc.status_as_of),
    ...billEnding(doc) }
}

const houseName = (house: string | null) => house === 'representatives' ? 'House of Representatives' : house === 'senate' ? 'Senate' : house
const displayDate = (date: string) => new Date(date + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const titleCaseName = (raw: string) => raw.toLocaleLowerCase('en-AU')
  .replace(/(^|[\s'’-])(\p{Ll})/gu, (_, separator: string, letter: string) => separator + letter.toLocaleUpperCase('en-AU'))
  .replace(/\bMc(\p{Ll})/gu, (_, letter: string) => 'Mc' + letter.toLocaleUpperCase('en-AU'))
const sponsorName = (raw: string) => {
  const parts = raw.split(',').map(part => part.trim()).filter(Boolean)
  if (parts.length < 2) return raw
  const suffix = parts.slice(2).filter(part => !/^(?:MP|Senator|Sen\.?)$/i.test(part)).join(' ')
  return [parts[1].replace(/^(?:(?:Sen|Senator|Hon|Dr|Mr|Mrs|Ms)\.?\s+)+/i, ''), titleCaseName(parts[0]), suffix].filter(Boolean).join(' ')
}
/** Citations become the writer's facts. Row fields alone never reach its fact sheet. */
export function billCitations(bill: BillFields, title: string, url: string, query: string): ToolCitation[] {
  if (!bill.lifecycle_available) return [{ kind: 'record', text: `OPAX lists ${title}, but its lifecycle record is unavailable.`, url }]
  const facts: { topic: string; text: string; url: string }[] = []
  const add = (topic: string, text: string, source = url) => facts.push({ topic, text, url: source })
  // An exposure draft is released for consultation, never introduced (bills-013).
  if (bill.introduced) add('introduced', bill.status === 'exposure_draft'
    ? `On ${displayDate(bill.introduced)}, the ${title} was released as an exposure draft for consultation.`
    : `On ${displayDate(bill.introduced)}, the ${title} was first introduced${bill.originating_house ? ' in the ' + houseName(bill.originating_house) : ''}.`)
  if (bill.royal_assent) add('assent', `On ${displayDate(bill.royal_assent)}, the ${title} received royal assent${bill.act_number ? ' as Act No. ' + bill.act_number : ''}.`)
  if (bill.passed_both_houses_date) add('passed', `On ${displayDate(bill.passed_both_houses_date)}, the ${title} passed both houses.`)
  else if (bill.passed_both_houses) add('passed', `The ${title} is recorded as having passed both houses; the record does not establish a passage date.`)
  if (bill.act_number && !bill.royal_assent) add('assent', `The ${title} became Act No. ${bill.act_number}.`)
  // Each sponsor with their own recorded party: one party after a list of
  // co-sponsors would attribute the first sponsor's party to all of them.
  const named = bill.sponsors.map((name, i) => {
    const party = bill.sponsor_parties[i] ?? (bill.sponsors.length === 1 ? bill.sponsor_party : null)
    return party ? `${name} (${party})` : name
  })
  if (named.length) add('sponsor', `${named.join('; ')} ${named.length === 1 ? 'is the recorded sponsor' : 'are the recorded sponsors'} of the ${title}.`)
  if (bill.status) add('status', `The ${title} has recorded status ${bill.status.replaceAll('_', ' ')}${bill.ended_label ? ` (${bill.ended_label})` : ''}${bill.status_as_of ? ' as at ' + displayDate(bill.status_as_of) : ''}.`)
  if (bill.portfolio && !/^\(s\)/i.test(bill.portfolio)) add('portfolio', `The ${title} is recorded under the ${bill.portfolio} portfolio.`)
  const stages: string[] = []
  for (const event of bill.key_dates) {
    if (!event.date) continue
    // Assent and passage rows inherit a table heading; it is not a chamber taking that action.
    const chamberStage = !['passed', 'passed_both', 'passed_both_houses', 'royal_assent', 'assent', 'assented'].includes(event.stage)
    stages.push(`${displayDate(event.date)}: ${event.stage.replaceAll('_', ' ')}${chamberStage && event.house ? ' (' + houseName(event.house) + ')' : ''}${event.event_raw ? ' [' + event.event_raw + ']' : ''}`)
  }
  if (stages.length) add('stage', `The ${title} has these recorded lifecycle stages: ${[...new Set(stages)].join('; ')}.`)
  for (const act of bill.acts) if (act.title) add('act', `The ${title} is linked to ${act.title}${act.act_number ? ' (Act No. ' + act.act_number + ')' : ''}${act.assent_date ? ', with royal assent on ' + displayDate(act.assent_date) : ''}.`, act.frl_uri ?? url)
  // Prefer the requested fact while retaining all lifecycle evidence for follow-up questions.
  const preferred = billQuestionFocus(query)
  if (preferred === 'assent' && !bill.royal_assent) add('assent', `OPAX's published bill record does not establish a royal assent date for the ${title}.`)
  if (preferred === 'sponsor' && !bill.sponsor) add('sponsor', `OPAX does not record a sponsor name for the ${title}.`)
  if (preferred === 'introduced' && !bill.introduced) add('introduced', `OPAX does not record an introduction date for the ${title}.`)
  facts.sort((a, b) => Number(b.topic === preferred) - Number(a.topic === preferred))
  return [...new Map(facts.map(fact => [fact.text + '\n' + fact.url, { kind: 'record' as const, text: fact.text, url: fact.url }])).values()]
}

export interface TablePage { rows: Record<string, unknown>[]; total: number; facets?: Record<string, unknown> }
/** One published-table query, in process, with the same grammar, filters and cache keys as /api/table. */
export async function tableRows(env: ToolEnv, dataset: string, params: Record<string, string | undefined>): Promise<TablePage> {
  if (!env.TABLE_DB) throw new Error('Published tables are unavailable.')
  env.signal?.throwIfAborted()
  const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''))
  const response = await tableApi(new Request('https://opax.com.au/api/table/' + dataset + '?' + query), { TABLE_DB: env.TABLE_DB, ...(env.ASSETS ? { ASSETS: env.ASSETS } : {}) })
  env.signal?.throwIfAborted()
  if (!response.ok) throw new Error('Published table query failed.')
  return await response.json() as TablePage
}
