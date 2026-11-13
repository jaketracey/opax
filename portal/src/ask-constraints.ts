import { scopeAfterStatutes } from './ask-statute-titles.mjs'
import type { Period, NamedScope, PlanStep } from './agentic-ask'
import type { ToolResult } from './agentic-tools'
import { receiptYearWindow } from './receipt-period'
import { requestedBillTitle, billTitleMatches } from './bill-title'
import { recordIntentText, recordCountKind, billIntroductionListQuestion } from './ask-scope-intent'
import { speechRankingGrain, partyPolicyTopic } from './ask-answer-grain'
import { canonicalChamber, questionChamber } from './ask-chamber'
import { identityPerson } from './ask-followup'
import { agencyHeadRanking } from './ask-remuneration'
export interface AskConstraints {
  period: Period; dated: boolean; jurisdiction?: string; chamber?: string; party?: string
  people: string[]; locationState?: string; stateGovernment?: boolean; place?: string; superlative?: 'highest' | 'lowest'; trend: boolean
  actUnfiltered?: true
  resolved_question?: string
  recordKind?: 'bill' | 'division'
  exactBillTitle?: string
  contractSupplier?: string
  grantRecipient?: string
  recordCountKind?: 'bills' | 'divisions'
  listIntroductions?: true
  speechRankingGrain?: 'speaker' | 'party'
  industryRanking?: true
  policyVoteTopic?: string
  identityPerson?: string
  agencyHeadRanking?: true
  remunerationYear?: string
}
export function extractAskConstraints(question: string, period: Period, named: NamedScope, filters: Record<string, unknown> = {}, statuteTitles: ReadonlySet<string> | null = null): AskConstraints {
  question = named.resolvedQuestion ?? question
  const q = recordIntentText(question)
  const identity = identityPerson(question), headRanking = agencyHeadRanking(question) && !named.people.length
  const remuneration = {...(identity ? {identityPerson: identity} : {}), ...(headRanking ? {agencyHeadRanking: true as const, remunerationYear: question.slice(0,4000).match(/\b(?:19|20)\d{2}-\d{2}\b/)?.[0]} : {})}
  const { text, territory } = scopeAfterStatutes(question, statuteTitles), jurisdictionText = text.toLowerCase()
  const actUnfiltered = !statuteTitles?.size, state = actUnfiltered && filters.state === 'act' ? undefined : filters.state
  const detected = String(state || (/new south wales|\bnsw\b/.test(jurisdictionText) ? 'nsw' : /victoria|\bvic\b/.test(jurisdictionText) ? 'vic' : /queensland|\bqld\b/.test(jurisdictionText) ? 'qld' : /south australia|\bsa\b/.test(jurisdictionText) ? 'sa' : /western australia|\bwa\b/.test(jurisdictionText) ? 'wa' : /tasmania/.test(jurisdictionText) ? 'tas' : territory ? 'act' : /northern territory/.test(jurisdictionText) ? 'nt' : /federal|commonwealth/.test(jurisdictionText) ? 'federal' : '')) || undefined
  const jurisdiction = /\bfederal|commonwealth\b/.test(jurisdictionText) ? 'federal' : detected
  const locationState = detected && detected !== 'federal' ? detected : undefined
  const stateGovernment = /\b(?:state|queensland|qld|victorian?|nsw|south australian?) (?:government|grants?)\b/.test(jurisdictionText)
  const chamber = canonicalChamber(filters.chamber || questionChamber(q, jurisdiction)) || undefined
  const party = named.correctedParty ? undefined : String(filters.party || (named.parties.length === 1 ? named.parties[0] : '')) || undefined
  const place = /\b(?:electorate|seat) of ([A-Z][\p{L}'-]*(?: [A-Z][\p{L}'-]*)*)/u.exec(question)?.[1]?.trim()
  const contractSupplier = /\b(?:which|what)\s+(?:department|agency)\s+(?:gives?|awards?|awarded)\s+(.+?)\s+(?:(?:the\s+)?(?:most|more|largest)\s+)?contracts?\b/i.exec(question)?.[1]?.trim()
  const grantTotal = /\b(?:total|how much)\b/i.test(question) && !/\b(?:largest|biggest|single|individual)\s+(?:(?:federal|Commonwealth)\s+)?grant\b/i.test(question)
  const grantRecipient = grantTotal ? (/\bgrants?\s+to\s+(.+?)(?=[?!]|\.\s|\s+(?:in|during|since|from|between)\s+(?:\d|financial|FY)|$)/i.exec(question)?.[1] ?? /\bhow much has\s+(.+?)\s+(?:received|been awarded)\s+in\s+(?:(?:federal|Commonwealth|Queensland Government)\s+)?grants?\b/i.exec(question)?.[1])?.trim().replace(/\.$/,'') : undefined
  return { period, dated: period.kind !== 'all' && !!(period.since || period.until), jurisdiction, chamber, party, people: named.people, locationState, stateGovernment, place, ...(speechRankingGrain(question) ? { speechRankingGrain: speechRankingGrain(question) } : {}), ...(party && partyPolicyTopic(question) ? { policyVoteTopic: partyPolicyTopic(question) } : {}), ...(/\b(?:which|what) industries\b/i.test(question) && /\b(?:gave|give|donat\w*|fund\w*|receipts?)\b/i.test(question) ? { industryRanking: true as const } : {}), ...(contractSupplier?{contractSupplier}:{}), ...(grantRecipient?{grantRecipient}:{}), recordKind: /\b(?:divisions?|vot(?:e|ed|es|ing))\b/i.test(q) ? 'division' : /\b(?:bills?|legislation)\b/i.test(q) ? 'bill' : undefined, exactBillTitle: requestedBillTitle(question) ?? undefined, ...(recordCountKind(q) ? { recordCountKind: recordCountKind(q) } : {}), ...(billIntroductionListQuestion(q) ? { listIntroductions: true as const } : {}), ...(named.resolvedQuestion ? { resolved_question: named.resolvedQuestion } : {}), ...(actUnfiltered ? { actUnfiltered: true as const } : {}),
    superlative: /\b(?:lowest|least|fewest|smallest|youngest)\b/.test(q) ? 'lowest' : /\b(?:highest|most|largest|biggest|oldest|top)\b/.test(q) ? 'highest' : undefined,
    trend: /\b(?:trend|since|over time|each year|by year|changed?|increas\w*|decreas\w*)\b/.test(q), ...remuneration }
}
/** Restrict model arguments using only parameters the tool actually supports. */
export function constrainStep(step: PlanStep, c: AskConstraints, properties: Record<string, unknown>): PlanStep {
  const a = { ...step.args }, has = (k: string) => Object.hasOwn(properties, k) && !(step.tool === 'public_finances' && a.dataset !== 'vic_gifts' && ['chamber','since','until'].includes(k))
  if (c.identityPerson) {
    if (step.tool === 'find_people') a.name = c.identityPerson
    if (step.tool === 'find_records') a.query = c.identityPerson
    if (step.tool === 'annual_reports' && !a.record_id) { a.view = 'remuneration'; a.person = c.identityPerson }
  }
  if (c.agencyHeadRanking && step.tool === 'annual_reports' && !a.record_id) {
    a.view = 'agency_heads'
    for (const key of ['person','position','body','min_total','year']) delete a[key]
    if (c.remunerationYear) a.year = c.remunerationYear
  }
  if (step.tool === 'count_speeches' && c.speechRankingGrain && has('group_by')) {
    a.group_by = c.speechRankingGrain
    if (!c.people.length) delete a.speaker
    if (c.speechRankingGrain === 'speaker') {
      if (!c.jurisdiction) delete a.state
      if (!c.chamber) delete a.chamber
      if (!c.party) delete a.party
    }
  }
  if (step.tool === 'money_totals' && c.industryRanking && has('group_by')) { a.group_by = 'industry'; delete a.donor }
  if (step.tool === 'division' && c.policyVoteTopic && c.party) {
    a.operation = 'policy_votes'; a.title = c.policyVoteTopic
    for (const key of ['bill', 'person', 'division_id', 'other_party', 'date']) delete a[key]
  }
  if (step.tool === 'division' && a.operation === 'policy_votes') {
    if (!c.chamber) delete a.chamber
    if (!c.jurisdiction && has('jurisdiction')) a.jurisdiction = 'federal'
    if (!c.dated) for (const key of ['date', 'since', 'until']) delete a[key]
  }
  if (step.tool === 'count_records') {
    if (c.listIntroductions && a.record_type === 'bills') a.include_records = true
    if (c.recordCountKind === 'divisions' && c.exactBillTitle && has('bill')) {
      a.bill = c.exactBillTitle
      if (!c.dated) for (const key of ['date', 'month', 'year', 'since', 'until']) delete a[key]
    }
  }
  if (step.tool === 'contracts' && c.contractSupplier && has('supplier')) {
    a.supplier = c.contractSupplier
    const words=(s:string):string[]=>s.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[]
    if (typeof a.agency === 'string' && words(a.agency).length && words(a.agency).every(word=>words(c.contractSupplier!).includes(word))) delete a.agency
  }
  if (step.tool === 'grants' && c.grantRecipient && has('recipient')) {
    // A named total keeps the name the reader supplied, even when a planner
    // abbreviates it to a different recipient or falls back to an award list.
    a.recipient = c.grantRecipient
    delete a.query
    if (has('operation')) a.operation = 'totals'
  }
  if (c.actUnfiltered) for (const key of ['state', 'jurisdiction']) if (a[key] === 'act') delete a[key]
  // Exact detail IDs locate a source, rather than a filtered search. The returned rows still face scope checks.
  if (has('record_id') && typeof a.record_id === 'string' || has('bill_id') && typeof a.bill_id === 'string') return { ...step, args: a }
  // Count selectors are exclusive. Preserve individual periods in comparisons;
  // the result's query window is checked by guardToolPeriod after the lookup.
  const countPeriod = step.tool === 'count_records' && ['date', 'month', 'year', 'financial_year', 'term'].some(key => a[key] !== undefined)
  // A model sometimes invents 1 January as an exact division date for a bare
  // year. Retain the requested window so it can discover the actual date/id.
  if (step.tool === 'division' && c.dated && c.period.since !== c.period.until && a.date === c.period.since && c.period.since?.endsWith('-01-01') && !a.division_id) delete a.date
  const grantList = step.tool === 'grants' && (a.operation === 'largest' || !(a.recipient || a.program || a.group_by || a.operation === 'totals'))
  if (c.dated && !countPeriod) {
    for (const key of ['since', 'from_year', 'from']) if (has(key) && !c.period.since) delete a[key]
    for (const key of ['until', 'to_year', 'to']) if (has(key) && !c.period.until) delete a[key]
    if (has('since') && c.period.since && !grantList) a.since = c.period.since
    if (has('until') && c.period.until && !grantList) a.until = c.period.until
    if (has('from_year') && c.period.since) a.from_year = Number(c.period.since.slice(0, 4))
    if (has('to_year') && c.period.until) a.to_year = Number(c.period.until.slice(0, 4))
    if (['party_receipts', 'money_totals'].includes(step.tool)) {
      delete a.from_year; delete a.to_year
      const years = receiptYearWindow(c.period.since, c.period.until)
      if (!years.error) Object.assign(a, years)
    }
    if (has('from') && c.period.since) a.from = c.period.since.slice(0, 4)
    if (has('to') && c.period.until) a.to = c.period.until.slice(0, 4)
    if (has('as_of')) { delete a.as_of; if (!has('since')) a.as_of = c.period.until ?? c.period.since }
  }
  if (c.jurisdiction) {
    if (has('jurisdiction')) a.jurisdiction = step.tool === 'grants' && c.locationState && !c.stateGovernment ? 'federal' : c.jurisdiction
    if (has('jurisdiction') && has('state') && c.locationState && !(step.tool === 'grants' && (c.stateGovernment || a.recipient))) a.state = c.locationState
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
  if ((step.tool === 'division' && (!d.operation || d.operation === 'lookup') || Array.isArray(d.rows) && d.rows.every(row => typeof (row as Record<string, unknown>).excerpt === 'string')) && Array.isArray(d.rows) && d.rows.length) {
    const dates = d.rows.map(row => (row as Record<string, unknown>).date).filter((date): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)).sort()
    if (dates.length === d.rows.length) return { since: dates[0], until: dates.at(-1)!, as_of: null, note: 'Dates of the returned division records.' }
  }
  const donation=/Federal AEC donation returns, financial years ((?:19|20)\d{2})[–-]\d{2} to ((?:19|20)\d{2})[–-]\d{2}/i.exec(result.notes.join(' '))
  if(donation&&(!known?.since||!known?.until))return {...known,since:donation[1]+'-07-01',until:String(Number(donation[2])+1)+'-06-30',as_of:known?.as_of??null,note:result.notes[0]}
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
export const UNCONFIRMED_PERIOD = 'OPAX could not confirm that these records fall in the requested period, so check their dates.'
/** Discovery is ranked and may fall back to any word. Its rows must still match the requested record. */
export function guardExactLookupResult(result: ToolResult, c: AskConstraints): ToolResult {
  if (!result.ok || result.tool !== 'find_records' || !Array.isArray(result.data?.rows) || !(c.exactBillTitle || c.listIntroductions || c.recordKind === 'division' && c.dated)) return result
  const normal = (s: unknown) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const all = result.data.rows as Record<string, unknown>[]
  const rows = all.filter(r => {
    const linkedBill = c.recordCountKind === 'divisions' && c.exactBillTitle && r.kind === 'bill'
    if (c.recordKind && r.kind !== c.recordKind && !linkedBill) return false
    if (linkedBill && !billTitleMatches(r.title, c.exactBillTitle!)) return false
    if (c.listIntroductions && (typeof r.introduced !== 'string' || c.period.since && r.introduced < c.period.since || c.period.until && r.introduced > c.period.until || c.chamber && r.originating_house !== c.chamber)) return false
    if (c.recordKind === 'bill' && c.exactBillTitle && !billTitleMatches(r.title, c.exactBillTitle)) return false
    if (c.recordKind === 'division' && c.exactBillTitle && !normal(r.title).includes(normal(c.exactBillTitle))) return false
    if (c.recordKind === 'division' && c.dated && !linkedBill) {
      const date = /^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/.exec(String(r.period ?? ''))?.[1]
      if (!date || c.period.since && date < c.period.since || c.period.until && date > c.period.until) return false
    }
    return true
  })
  if (rows.length === all.length) return result
  const urls = new Set(rows.map(r => r.url))
  const cite = result.cite.filter(c => urls.has(c.url))
  const message = `OPAX has no matching ${c.recordKind ?? 'public'} record for the requested ${c.listIntroductions ? 'introduction date and originating chamber' : c.recordKind === 'division' ? 'date' : 'title'} in this lookup.`
  return { ...result, data: { ...result.data, rows, total: rows.length, ...(rows.length ? {} : { coverage_only: true }) }, cite: rows.length ? cite : [{ kind: 'record', label: message, url: c.recordKind === 'division' ? 'https://opax.com.au/divisions/index.json' : 'https://opax.com.au/bills' }], notes: rows.length ? result.notes : [] }
}
export function guardToolPeriod(result: ToolResult, step: PlanStep, c: AskConstraints): ToolResult {
  const coverage = resultCoverage(result, step)
  // Undated rows are not known to be wrong: they stand, marked, rather than becoming a refusal. A known mismatch is replaced below.
  if (result.ok && c.dated && !coverage.since && !coverage.until && !coverage.as_of && coverage.matched !== false) return { ...result, coverage, notes: [UNCONFIRMED_PERIOD, ...result.notes] }
  if (result.ok && !periodMatches(c, coverage)) {
    // The records stand with a one-line note on the period they cover; the model answers from them and says so.
    const bounds = coverage.since && coverage.until ? `cover ${coverage.since} to ${coverage.until}` : coverage.since ? `start on ${coverage.since}` : coverage.until ? `end on ${coverage.until}` : 'have no confirmed dates'
    const message = `The requested period is ${c.period.since ?? 'the start of the record'} to ${c.period.until ?? 'the present'}; these records ${bounds}.`
    return { ...result, coverage: { ...coverage, matched: false }, notes: [message, ...result.notes] }
  }
  return { ...result, coverage }
}
