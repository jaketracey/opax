import { territoryAfterStatutes } from './ask-statute-titles.mjs'
import type { Period, NamedScope, PlanStep } from './agentic-ask'
import type { ToolResult } from './agentic-tools'
export interface AskConstraints {
  period: Period; dated: boolean; jurisdiction?: string; chamber?: string; party?: string
  people: string[]; locationState?: string; stateGovernment?: boolean; place?: string; superlative?: 'highest' | 'lowest'; trend: boolean
}
export function extractAskConstraints(question: string, period: Period, named: NamedScope, filters: Record<string, unknown> = {}, statuteTitles: ReadonlySet<string> | null = null): AskConstraints {
  const q = question.toLowerCase()
  const territory = territoryAfterStatutes(question, statuteTitles)
  const detected = String(filters.state || (/new south wales|\bnsw\b/.test(q) ? 'nsw' : /victoria|\bvic\b/.test(q) ? 'vic' : /queensland|\bqld\b/.test(q) ? 'qld' : /south australia|\bsa\b/.test(q) ? 'sa' : /western australia|\bwa\b/.test(q) ? 'wa' : /tasmania/.test(q) ? 'tas' : territory ? 'act' : /northern territory/.test(q) ? 'nt' : /federal|commonwealth/.test(q) ? 'federal' : '')) || undefined
  const jurisdiction = /\bfederal|commonwealth\b/.test(q) ? 'federal' : detected
  const locationState = detected && detected !== 'federal' ? detected : undefined
  const stateGovernment = /\b(?:state|queensland|qld|victorian?|nsw|south australian?) (?:government|grants?)\b/.test(q)
  const chamber = String(filters.chamber || (/\bsenat(?:e|ors?)\b/.test(q) ? 'senate' : /house of representatives/.test(q) ? 'representatives' : '')) || undefined
  const party = String(filters.party || (named.parties.length === 1 ? named.parties[0] : '')) || undefined
  const place = /\b(?:electorate|seat) of ([A-Z][\p{L}'-]*(?: [A-Z][\p{L}'-]*)*)/u.exec(question)?.[1]?.trim()
  return { period, dated: period.kind !== 'all' && !!(period.since || period.until), jurisdiction, chamber, party, people: named.people, locationState, stateGovernment, place,
    superlative: /\b(?:lowest|least|fewest|smallest|youngest)\b/.test(q) ? 'lowest' : /\b(?:highest|most|largest|biggest|oldest|top)\b/.test(q) ? 'highest' : undefined,
    trend: /\b(?:trend|since|over time|each year|by year|changed?|increas\w*|decreas\w*)\b/.test(q) }
}
/** Restrict model arguments using only parameters the tool actually supports. */
export function constrainStep(step: PlanStep, c: AskConstraints, properties: Record<string, unknown>): PlanStep {
  const a = { ...step.args }, has = (k: string) => Object.hasOwn(properties, k)
  if (c.dated) {
    for (const key of ['since', 'from_year', 'from']) if (has(key) && !c.period.since) delete a[key]
    for (const key of ['until', 'to_year', 'to']) if (has(key) && !c.period.until) delete a[key]
    if (has('since') && c.period.since) a.since = c.period.since
    if (has('until') && c.period.until) a.until = c.period.until
    if (has('from_year') && c.period.since) a.from_year = Number(c.period.since.slice(0, 4))
    if (has('to_year') && c.period.until) a.to_year = Number(c.period.until.slice(0, 4))
    if (has('from') && c.period.since) a.from = c.period.since.slice(0, 4)
    if (has('to') && c.period.until) a.to = c.period.until.slice(0, 4)
    if (has('as_of')) { delete a.as_of; if (!has('since')) a.as_of = c.period.until ?? c.period.since }
  }
  if (c.jurisdiction) {
    if (has('jurisdiction')) a.jurisdiction = step.tool === 'grants' && c.locationState && !c.stateGovernment ? 'federal' : c.jurisdiction
    if (has('jurisdiction') && has('state') && c.locationState && !(step.tool === 'grants' && c.stateGovernment)) a.state = c.locationState
    // A state location in a federal grant/electorate question is a location, not a different legislature.
    if (has('state') && !has('jurisdiction')) a.state = c.jurisdiction
  }
  if (c.chamber && has('chamber')) a.chamber = c.chamber
  if (c.people.length === 1 && has('person')) a.person = c.people[0]
  if (c.people.length > 1 && has('people')) a.people = c.people
  if (c.party && has('party')) a.party = c.party
  if (c.place && has('electorate') && !a.electorate) a.electorate = c.place
  if (c.superlative && has('order')) a.order = c.superlative === 'lowest' ? 'asc' : 'desc'
  return { ...step, args: a }
}
export interface Coverage { since: string | null; until: string | null; as_of: string | null; matched?: boolean; requested_since?: string; requested_until?: string; note?: string }
/** Unknown coverage stays unknown; never describe the requested window as observed data. */
export function resultCoverage(result: ToolResult, step: PlanStep): Coverage {
  const d = result.data ?? {}, known = d.coverage as Coverage | undefined
  if (known && ('since' in known || 'as_of' in known)) return known
  const f = (d.filter ?? {}) as Record<string, unknown>
  if (['count_speeches', 'speech_trend', 'member_votes', 'search', 'person_quotes'].includes(step.tool)) return {
    since: String(f.since ?? step.args.since ?? '') || null, until: String(f.until ?? step.args.until ?? '') || null, as_of: new Date().toISOString().slice(0, 10), note: 'Query window; corpus coverage may be incomplete.' }
  if (step.tool === 'electorates') return { since: '2021-01-01', until: '2021-12-31', as_of: '2021-08-10', note: '2021 Census; published geography.' }
  if (step.tool === 'grants' && (step.args.from_year || step.args.to_year)) return { since: step.args.from_year ? step.args.from_year + '-01-01' : null, until: step.args.to_year ? step.args.to_year + '-12-31' : null, as_of: null, note: 'Published grant awards, filtered by year; release date unavailable.' }
  return { since: null, until: null, as_of: null, note: 'Coverage dates unavailable; this lookup cannot establish a historical total or ranking.' }
}
export function periodMatches(c: AskConstraints, coverage: Coverage): boolean {
  if (!c.dated) return true
  if (coverage.matched === false) return false
  const within = (since?: string | null, until?: string | null) => !!(since || until) &&
    (!c.period.since || !!since && since >= c.period.since) && (!c.period.until || !!until && until <= c.period.until) &&
    (!c.period.until || !since || since <= c.period.until) && (!c.period.since || !until || until >= c.period.since)
  return within(coverage.since, coverage.until) &&
    (!(coverage.requested_since || coverage.requested_until) || within(coverage.requested_since, coverage.requested_until))
}
export function guardToolPeriod(result: ToolResult, step: PlanStep, c: AskConstraints): ToolResult {
  const coverage = resultCoverage(result, step)
  if (result.ok && !periodMatches(c, coverage)) {
    const message = `The requested period is ${c.period.since ?? 'the start of the record'} to ${c.period.until ?? 'the present'}. This tool covers ${coverage.since ?? 'an unknown start'} to ${coverage.until ?? 'an unknown end'}, as of ${coverage.as_of ?? 'an unknown date'}. ${coverage.note ?? ''} It cannot establish the answer for the requested period; no current figures have been substituted.`
    if (coverage.matched === false && ['parliamentary_pay', 'paid_answer'].includes(step.tool) && result.cite.every(c => !c.label.includes('$'))) return { ...result, coverage, data: { coverage, coverage_only: true } }
    return { ...result, coverage: { ...coverage, matched: false }, data: { coverage: { ...coverage, matched: false }, coverage_only: true }, cite: [{ kind: 'record', label: message, url: result.cite[0]?.url ?? 'https://opax.com.au/methods' }], notes: result.notes }
  }
  return { ...result, coverage }
}
