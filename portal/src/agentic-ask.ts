import {ASK_EVIDENCE_RULES} from './ask-writing-rules'
import { extractAskConstraints, constrainStep, type AskConstraints } from './ask-constraints'
import {federalPartyMoneyAnswer,publicPartyMoneyAnswer} from './ask-money-routing'
import { routedPayAnswer } from './ask-pay-route'
import { researchPhaseWallMs } from './research-time'
import { ASK_HARD_WALL_MS, ASK_ANSWER_TARGET_MS, ASK_MAX_TOOL_CALLS, ASK_TOOL_WALL_MS, ASK_MAX_MODEL_USD, ASK_FALLBACK_RESERVE_USD, reserveQuestionTurn } from './ask-budgets'
import { researchTurnReservationUsd, unmeteredResearchBudget } from './research-budget'
import { resolvePartySubject } from './ask-party-subject'
import { receiptYearWindow } from './receipt-period'
import { exactRecordLookup, prependLookupCorrection } from './ask-exact-lookup'
import { isRecordCountQuestion } from './ask-scope-intent'
import { requestedPersonSlot } from './ask-person-slot'
import { resolvePersonName } from './person-name-matching'
import { serviceText, type ServicePeriod } from './person-service'
import { speechRankingGrain } from './ask-answer-grain'
/**
 * OPAX-owned Ask orchestration in the Worker
 * (docs/design/agentic-ask-2026-10.md). /api/ask uses AGENTIC_ASK_MODE;
 * it stays off unless the operator selects route or shadow.
 *
 * Route mode observes each batch of tool results before choosing the next
 * lookup or finishing. The original JSON planner remains a bounded fallback.
 *
 * Counts and rankings only ever come from tool results; selected figures are
 * rendered and checked against their source rows. `answered: false` with a reason
 * when no tool result supports an answer (the web-ask-no-answer contract).
 */
import { TOOL_SPECS, TOPICS, STATES, CHAMBERS, TERMS, runTool, validToolArgs, AGENTIC_TOOLS_VERSION, type ToolDeps, type ToolResult, type Cite, type RelatedCite } from './agentic-tools'
import { isElectorateDataQuestion, electoratePlan } from './agentic-tool-electorates'
import { getAskTool } from './tools'
import type { AnswerTally } from './research-evidence'
import { ResearchError, researchSources, type Research, type ResearchPayload, type QualitativeAnswer, type ReceiptFact, type ResearchResult } from './research-types'

import { writingFacts, appendWrittenPoints, proseFallback, ANSWER_WRITING_VERSION } from './research-writing'
import { leadWithModelAnswer, ACCOUNTABILITY_QUESTION } from './research-answer-shape'
import { whoBasis } from './research-who-lead'
import { researchPreviewGuard } from './research-generation'

export const AGENTIC_PROMPT_VERSION = `agentic-ask-11-topic-scope/${ANSWER_WRITING_VERSION}`
export const AGENTIC_BUDGET_MS = ASK_HARD_WALL_MS
export const AGENTIC_MAX_STEPS = ASK_MAX_TOOL_CALLS
/** Soft answer target; a missing fact or recovery may use the rest of the hard allowance. */
export const LOOP_ANSWER_TARGET_MS = ASK_ANSWER_TARGET_MS

export type Shape = 'ranking' | 'trend' | 'comparison' | 'money'
export { inferPeriod, type Period } from './ask-period'
import { inferPeriod, type Period } from './ask-period'
import { transcriptListingOnly } from './transcript-answer'
// ---------------------------------------------------------------- route classifier
/**
 * Route-only rollout: only these shapes take the agentic path; every other
 * question keeps today's Ask. Rules, not a model, so routing costs nothing and
 * can be tested. Ordered: a money join is also a ranking, so money wins.
 */
const SPEECH_WORDS = /\b(?:speech(?:es)?|speakers?|spoke|spoken|speak(?:s|ing)?|said|says|mention(?:s|ed)?|talk(?:s|ed|ing)?|debat(?:e|ed|es|ing)|discuss(?:ed|es|ing)?|raised?)\b/i
const MONEY_WORDS = /\b(?:donat\w*|donors?|funded|money)\b/i
const VOTE_WORDS = /\bvot(?:e|ed|es|ing)\b/i
const RANK_WORDS = /\b(?:most|least|more|fewest|top\s+(?:\d+|five|ten|three)|leading|biggest)\b/i
// "which Greens MPs", "which federal politicians": up to two words between which and the subject.
const RANK_SUBJECT = /\b(?:who|which\s+(?:[\w'’-]+\s+){0,2}(?:mps?|members?|senators?|politicians?|part(?:y|ies)|ministers?|states?|parliaments?))\b/i
const TREND_WORDS = /\b(?:more|less|fewer)\b.*\b(?:than|this term|last term|since|in the \d{4}s)\b|\b(?:changed?|trend|over time|which year|each year|by year|increase\w*|decrease\w*|risen|fallen|compared? with \d{4}|in \d{4} compared)\b/i
const COMPARE_WORDS = /\bcompare\b|\bversus\b|\bvs\.?\b|\bcompared with\b/i
export function classifyAgentic(question: string): { route: 'agentic' | 'ask'; shape: Shape | null; rule: string } {
  const q = normaliseQuestion(question)
  if (isElectorateDataQuestion(q)) return { route: 'agentic', shape: 'ranking', rule: 'electorate-data' }
  if (/\b(?:most recently|latest|last speech|knows? most)\b/.test(q)) return { route: 'ask', shape: null, rule: 'ordinary' }
  if (MONEY_WORDS.test(q) && SPEECH_WORDS.test(q) && /\bmost\b|\bhow much\b/.test(q)) return { route: 'agentic', shape: 'money', rule: 'money+speech' }
  if (VOTE_WORDS.test(q) && SPEECH_WORDS.test(q) && (COMPARE_WORDS.test(q) || /\bhow often\b|\bhow many\b/.test(q))) return { route: 'agentic', shape: 'comparison', rule: 'vote+speech' }
  if (isRecordCountQuestion(q) && /\bspeech(?:es|se)?\b/.test(q) && /\b(?:more|fewer)\b/.test(q)) return { route: 'agentic', shape: 'comparison', rule: 'speech-count-comparison' }
  if (COMPARE_WORDS.test(q) && /\bhow often\b|\bhow many\b/i.test(q)) return { route: 'agentic', shape: 'comparison', rule: 'compare-counts' }
  if (/\bhow many\b/i.test(q) && SPEECH_WORDS.test(q)) return { route: 'agentic', shape: 'trend', rule: 'how-many' }
  if (TREND_WORDS.test(q) && SPEECH_WORDS.test(q) && /\b(?:more|less|fewer|number|count|volume|how many|which year|over time|each year|by year|increase\w*|decrease\w*|risen|fallen)\b/.test(q)) return { route: 'agentic', shape: 'trend', rule: 'trend' }
  const volumeRank = /\b(?:most|least|fewest) (?:(?:chamber|federal|senate|parliamentary) )?speeches\b|\b(?:spoke|spoken|speaks?|mentioned|discussed|debated|talked)(?: \w+){0,4} (?:most|least)(?= (?:about|on|in|since|during|across|this|last|over|compared)\b|$)|\b(?:top (?:\d+|five|ten|three)|leading) speakers\b/.test(q)
  if (RANK_SUBJECT.test(q) && RANK_WORDS.test(q) && volumeRank) return { route: 'agentic', shape: 'ranking', rule: 'ranking' }
  return { route: 'ask', shape: null, rule: 'none' }
}

// ---------------------------------------------------------------- planner
export interface PlanStep { tool: string; args: Record<string, unknown>; label?: string }
export interface Plan { shape: Shape | 'unanswerable'; steps: PlanStep[]; reason?: string }
const TOPIC_RULES: [string, RegExp][] = [
  ['gambling', /gambl|betting|wagering|pokies|poker machines/], ['climate-environment', /climate|environment/],
  ['housing', /housing|homes|rental/], ['indigenous-affairs', /indigenous|aboriginal/], ['immigration', /immigra|migration/],
  ['tax-budget', /\btax\b|budget/], ['defence-security', /defen[cs]e|security/], ['mining-energy', /mining|energy/],
  ['integrity-democracy', /integrity|democracy|corruption/], ['health', /health/], ['agriculture', /agricultur|farming/],
  ['education', /education|schools/], ['financial-services', /bank|finance/], ['unions-workplace', /union|workplace/],
]
/** A bounded deterministic plan, including the timeout case from the spike. */
export function fallbackPlan(question: string): Plan | null {
  if (isElectorateDataQuestion(question)) return electoratePlan(question)
  const shape = classifyAgentic(question).shape
  if (!shape) return null
  const q = question.toLowerCase()
  const topics = [...new Set([...TOPIC_RULES.filter(([, re]) => re.test(q)).map(([topic]) => topic), ...TOPICS.filter(t => q.includes(t))])]
  const topic = topics.length === 1 ? topics[0] : undefined
  if (shape === 'comparison' && isRecordCountQuestion(q) && /\bspeech(?:es|se)?\b/.test(q)) {
    const parties = extractNamedScope(question, null, null).parties
    if (parties.length > 1 && (topic || !/\b(?:about|on|topic|subject)\b/.test(q))) return { shape, steps: parties.map(party => ({ tool: 'count_speeches', args: { party, group_by: 'none', ...(topic?{topic}:{}) } })) }
  }
  if (!topic) return null // never replace an unknown subject with overall counts
  const state = /\bnsw\b|new south wales/.test(q) ? 'nsw' : /victori|\bvic\b/.test(q) ? 'vic' : /\bact\b|legislative assembly/.test(q) ? 'act' : /queensland|\bqld\b/.test(q) ? 'qld' : /south australia|\bsa\b/.test(q) ? 'sa' : /federal|senat|representatives/.test(q) ? 'federal' : undefined
  const chamber = /senat/.test(q) ? 'senate' : /house of representatives/.test(q) ? 'representatives' : undefined
  const party = /\bgreens\b/.test(q) ? 'Greens' : /\blabor\b/.test(q) ? 'Labor' : /\bliberal\b/.test(q) ? 'Liberal' : undefined
  const base = { topic, ...(state ? { state } : {}), ...(chamber ? { chamber } : {}), ...(party ? { party } : {}) }
  const people = [...question.matchAll(/\b(?:[A-Z][a-z]+\s+){1,2}[A-Z][a-z]+(?:-[A-Z][a-z]+)?\b/g)].map(m => m[0]).filter(n => !/Parliament|Legislative|Assembly|House|Interactive|Gambling|Amendment|Reform|Bill|South|Wales/.test(n))
  if (shape === 'ranking') return { shape, steps: [{ tool: 'count_speeches', args: { ...base, group_by: /\bpart(?:y|ies)\b/.test(q) ? 'party' : 'speaker' } }] }
  if (shape === 'trend') {
    const years = [...q.matchAll(/\b((?:19|20)\d{2})(s)?\b/g)].map(m => Number(m[1]))
    if (/how many/.test(q) && !/compared|over time|each year|by year/.test(q)) return { shape, steps: [{ tool: 'count_speeches', args: { ...base, ...(people[0] ? { speaker: people[0] } : {}), group_by: 'none' } }] }
    return { shape, steps: [{ tool: 'speech_trend', args: { ...base, ...(people[0] ? { speaker: people[0] } : {}), by: /\d{4}s/.test(q) ? 'decade' : /term/.test(q) ? 'term' : 'year', ...(years.length ? { from_year: Math.min(...years), to_year: years.length > 1 ? Math.max(...years) : 2026 } : /which year/.test(q) ? { from_year: 1993 } : {}) } }] }
  }
  if (shape === 'comparison') {
    if (!people.length && !party) return null
    const steps: PlanStep[] = []
    for (const person of people.length ? people : [null]) {
      if (VOTE_WORDS.test(q)) steps.push({ tool: 'member_votes', args: { keyword: topic, ...(person ? { person } : { party }) } })
      steps.push({ tool: 'count_speeches', args: { ...base, ...(person ? { speaker: person } : {}), group_by: 'none' } })
    }
    return { shape, steps: steps.slice(0, AGENTIC_MAX_STEPS) }
  }
  const industry = topic === 'mining-energy' ? 'mining' : topic
  if (/each party/.test(q)) return { shape, steps: [{ tool: 'party_receipts', args: { industry } }, { tool: 'count_speeches', args: { ...base, group_by: 'party' } }] }
  if (/received|receive/.test(q)) return { shape, steps: [{ tool: 'party_receipts', args: { industry } }, { tool: 'count_speeches', args: { ...base, state: 'federal', party: '$1', group_by: 'none' } }] }
  if (/party of/.test(q)) return { shape, steps: [{ tool: 'count_speeches', args: { ...base, group_by: 'speaker' } }, { tool: 'find_people', args: { name: '$1' } }, { tool: 'party_receipts', args: { party: '$2.party' } }] }
  return { shape, steps: [{ tool: 'count_speeches', args: { ...base, group_by: 'party' } }, { tool: 'party_receipts', args: { party: '$1' } }] }
}
const toolCatalogue = () => TOOL_SPECS.map((t) => `- ${t.name}(${Object.keys((t.input.properties ?? {}) as object).join(', ')}): ${t.description}`).join('\n')
export function plannerPrompt(): { system: string; user: string } {
  const user = [
    'Plan the record lookups that answer the question below. The lookups produce every figure.',
    '',
    'Tools:',
    toolCatalogue(),
    '',
    `Topics: ${TOPICS.join(', ')}. States: ${STATES.join(', ')} (federal = Commonwealth parliament). Chambers: ${CHAMBERS.join(', ')}. Terms: ${Object.entries(TERMS).map(([k, [a, b]]) => `${k} ${a}..${b ?? 'now'}`).join('; ')}.`,
    'Rules:',
    '- Choose capabilities from their registry descriptions, including original speeches and releases, state legislation, finance datasets, entity profiles, access registers, member voting histories and sponsored bills. Follow returned detail and paging instructions. After an empty sample, run one wider lookup or a complete scoped count and report what it shows.',
    '- Electorate demographics -> electorates. Unqualified "median income" = median_income (personal AUD/week), using the personal-income field. Highest/oldest/most -> order desc; lowest/youngest -> asc. "In X" for a named seat -> operation lookup and electorate X. State parliament -> jurisdiction (e.g. vic); federal seats in a state -> jurisdiction federal + state (e.g. vic). Rank the available electorate profiles and report their coverage.',
    '- Any "how many", "number of" or "more or fewer than" question about divisions or bills -> count_records with record_type divisions or bills. Use the complete scoped count for totals. Set the requested jurisdiction and chamber. Select one date (YYYY-MM-DD), month (YYYY-MM), year, financial_year (YYYY-YY) or federal term (e.g. 44th), or use inclusive since/until dates. Use group_by year or month for trends and comparisons across periods; retain every requested group. For divisions on a named bill, pass bill. For bills introduced on a day, use date; add include_records true when their names are requested. For bill passage rates, request status and use the returned denominator and share, with its published denominator.',
    '- Map the subject to ONE topic label when it fits ("gambling reform" -> gambling, "climate change" -> climate-environment, "the budget" -> tax-budget).',
    '- "Who speaks most / top speakers" -> count_speeches with group_by speaker. "Which party" -> group_by party. Add state or chamber only when the question names a parliament or chamber; "senators" -> chamber senate; "MPs in federal parliament" -> state federal.',
    '- Dates: "since 2022" -> since 2022-01-01. "this term" -> term 48th, "last term" -> term 47th. A decade ("the 2010s") -> since 2010-01-01, until 2019-12-31.',
    '- An exact person, bill, division or date lookup must retain that identity and date. After an empty result, recover the exact identity or date with a distinct lookup. Check a claimed party, vote or bill status against the record before explaining its reasons.',
    '- Speech totals -> count_speeches. "Is X debated more / how has X changed / which year" about speeches -> speech_trend (by year, decade or term). Two named speech years -> speech_trend by year with from_year and to_year.',
    '- Select the dedicated capability described in the tool catalogue. For vote histories use the authoritative archive reader and follow its paging; count words using the same person, party and period. Compatibility aliases are for old clients.',
    '- One recorded division, its outcome, party vote, named member vote or floor crossers -> division, preserving exact date and chamber and passing title words, bill or division_id. Use lookup for who crossed the floor on one division and select its named dissenters, not the number of matching divisions. Outcome questions need the result and recorded ayes/noes, without floor-crossing commentary unless asked. A year in a bill title is not the division date. Floor crossing over a period -> division operation floor_crossing; party agreement -> operation party_agreement with party and other_party. member_votes only summarises a keyword sample across several divisions.',
    '- A later step can use an earlier result: "$1" is the top name from step 1 (a speaker or party), "$1.party" is that person\'s party. To get a speaker\'s party use find_people("$1") then "$2.party".',
    '- Money: summed federal receipts, rankings by total and annual receipt trends -> money_totals, with financial_year or FY starting years in from_year/to_year. party_receipts(party) lists donors to a party by donations (AEC Donation Received; other receipt types are separate labelled lines, described as other receipts); party_receipts(industry) gives an industry\'s totals by party. measure=all_types for money from, receipts or paid. Member expense totals -> member_expenses with the requested calendar or financial year. Industries: gambling, mining, fossil_fuels, finance, property, unions, health, hospitality, media, tech.',
    '- If the record cannot answer (party by state parliament other than federal or qld, a topic outside the list with no other route), set shape "unanswerable" and give the reason.',
    `- At most ${AGENTIC_MAX_STEPS} steps.`,
    '',
    'Reply with ONE JSON object and nothing else: {"shape": "ranking|trend|comparison|money|unanswerable", "steps": [{"tool": "...", "args": {...}, "label": "short progress label, e.g. Counting gambling speeches by speaker"}], "reason": "only when unanswerable"}',
    '',
    'Question: {question}',
  ].join('\n')
  return {
    system: ASK_EVIDENCE_RULES + 'You turn questions about the Australian parliamentary record into a JSON list of tool calls. Output JSON only.',
    // The platform treats the user prompt as a format template: escape every brace except {question}.
    user: user.replace(/[{}]/g, (b) => (b === '{' ? '{{' : '}}')).replace('{{question}}', '{question}'),
  }
}
export function parsePlan(text: string): Plan | null {
  const m = String(text ?? '').match(/\{[\s\S]*\}/)
  if (!m) return null
  let raw: { shape?: string; steps?: { tool?: string; args?: Record<string, unknown>; label?: string }[]; reason?: string }
  try { raw = JSON.parse(m[0]) } catch { return null }
  const shapes = ['ranking', 'trend', 'comparison', 'money', 'unanswerable']
  if (!raw || !shapes.includes(String(raw.shape))) return null
  const names = new Set(TOOL_SPECS.map((t) => t.name))
  if (raw.shape !== 'unanswerable' && (!Array.isArray(raw.steps) || raw.steps.length > AGENTIC_MAX_STEPS || raw.steps.some((s, i) => !s || !names.has(String(s.tool)) || !validToolArgs(String(s.tool), s.args) || Object.values(s.args!).some(v => typeof v === 'string' && /^\$/.test(v) && (!/^\$\d+(?:\.party)?$/.test(v) || Number(v.match(/\d+/)![0]) > i || Number(v.match(/\d+/)![0]) < 1))))) return null
  const steps = (Array.isArray(raw.steps) ? raw.steps : [])
    .filter((s) => s && names.has(String(s.tool)) && s.args && typeof s.args === 'object')
    .slice(0, AGENTIC_MAX_STEPS)
    .map((s) => ({ tool: String(s.tool), args: s.args as Record<string, unknown>, label: typeof s.label === 'string' ? s.label.slice(0, 80) : undefined }))
  if (raw.shape !== 'unanswerable' && !steps.length) return null
  return { shape: raw.shape as Plan['shape'], steps, reason: typeof raw.reason === 'string' ? raw.reason.slice(0, 300) : undefined }
}
/** "$1" / "$1.party" -> values from earlier results. Unresolvable references fail the step, never guess. */
export function resolveArgs(args: Record<string, unknown>, results: ToolResult[]): Record<string, unknown> | null {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) {
    if (typeof v !== 'string' || !/^\$\d+(?:\.party)?$/.test(v.trim())) { out[k] = v; continue }
    const [, n, field] = /^\$(\d+)(?:\.(party))?$/.exec(v.trim())!
    const r = results[Number(n) - 1]
    const d = (r?.data ?? {}) as { rows?: { name?: string; party?: string }[]; people?: { name?: string; party?: string | null }[] }
    const value = field === 'party' ? d.people?.[0]?.party ?? d.rows?.[0]?.party : d.rows?.[0]?.name ?? d.people?.[0]?.name ?? d.rows?.[0]?.party
    if (!value) return null
    out[k] = value
  }
  return out
}

// ---------------------------------------------------------------- bound facts
export interface Fact { id: number; text: string; cite: Cite; entities?: string[]
  member?: import('./ask-member-label').CountedMember
  /** Rows of one ranking or trend share a lead line ("Chamber speeches labelled gambling since 2015, by year") and render as short rows. */
  group?: string; row?: string
  /** Counting basis of a speech count (chamber, committee or all): one answer shows one basis. */
  basis?: string
  /** A disclosed receipt's owner, source, amount and period, carried past any change to the fact's wording. */
  receipt?: ReceiptFact }
const n = (value: number) => value.toLocaleString('en-AU')
/** The lead line for one count or trend result: what was counted, where, over which period, grouped how. */
export function countLead(filter: Record<string, unknown>, by: string): string {
  const venue = filter.venue === 'committee' ? 'Committee-hearing turns' : filter.venue === 'all' ? 'Speeches and committee turns' : 'Chamber speeches'
  const since = typeof filter.since === 'string' ? filter.since : '', until = typeof filter.until === 'string' ? filter.until : ''
  const day = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : d
  const year = (d: string, edge: string) => d.endsWith(edge) ? d.slice(0, 4) : day(d)
  const period = since && until ? (since.endsWith('-01-01') && until.endsWith('-12-31') ? ` in ${since.slice(0, 4)}${until.slice(0, 4) !== since.slice(0, 4) ? `–${until.slice(0, 4)}` : ''}` : ` from ${day(since)} to ${day(until)}`)
    : since ? ` since ${year(since, '-01-01')}` : until ? ` up to ${year(until, '-12-31')}` : ' across the whole record'
  const place = filter.state ? ` in ${filter.state === 'federal' ? 'federal parliament' : String(filter.state).toUpperCase()}` : ''
  return `${venue}${filter.topic ? ` labelled ${filter.topic}` : ''}${filter.speaker ? ` by ${filter.speaker}` : ''}${filter.party ? ` recorded under ${filter.party}` : ''}${place}${filter.chamber ? ` (${filter.chamber})` : ''}${period}${by ? `, by ${by}` : ''}`
}
/** Each template binds tool-row figures to their entity, metric and citation. */
export function factSheet(results: ToolResult[]): { facts: Fact[]; notes: string[] } {
  const facts: Fact[] = []
  const notes = new Set<string>()
  let entities: string[] = []
  const add = (text: string, cite: Cite, bound = entities, layout: Pick<Fact, 'group' | 'row' | 'basis' | 'receipt' | 'member'> = {}) => facts.push({ id: facts.length + 1, text, cite, entities: bound, ...layout })
  for (const r of results) {
    if (!r.ok) continue
    r.notes.forEach((n) => notes.add(n))
    const d = r.data as Record<string, unknown>
    const filter = (d.filter ?? {}) as Record<string, unknown>
    entities = [filter.speaker || d.person ? `person:${filter.speaker || d.person}` : '', filter.party || d.party ? `party:${filter.party || d.party}` : ''].filter(Boolean)
    if (d.coverage_only || d.calculated_answer || r.tool === 'person_overview') {
      r.cite.forEach(cite => add(cite.label, cite))
    } else if (getAskTool(r.tool)?.evidenceKind === 'passages') {
      // Original passages use citation IDs, never a second set of record-fact IDs.
      continue
    } else if (r.tool === 'member_votes' && d.counts_complete_for_scope && d.person && d.counts && r.cite[0]) {
      const counts = d.counts as Record<string, number>
      const divisions = counts.aye + counts.no + counts.paired + counts.absent + counts.other
      const related = (d.rows as Record<string, unknown>[]).map(row => ({ label: `${row.date}: ${row.title} (${row.vote === 'aye' || row.vote === 'no' ? 'voted ' : ''}${row.vote})`, url: String(row.url) }))
      if (divisions) add(`${d.person} voted in ${divisions} divisions with "${d.keyword}" in the title: aye ${counts.aye}, no ${counts.no}`, { ...r.cite[0], kind: 'record', related })
    } else if (r.tool === 'member_votes' && d.summary) {
      // Cached pre-registry vote payloads retain their labelled split and original supporting records.
      const s = d.summary as Record<string, number>, who = (d.person ?? d.party) as string
      if (!s.divisions || !r.cite[0]) continue
      const url = r.list ?? r.cite[0].url, related = r.cite.map(c => ({ label: c.label, url: c.url }))
      add(d.person ? `${who} voted in ${s.divisions} divisions with "${d.keyword}" in the title: aye ${s.aye}, no ${s.no}`
        : `${who} voted in ${s.divisions} divisions with "${d.keyword}" in the title: all aye in ${s.all_aye}, all no in ${s.all_no}, split in ${s.split}`, { kind: 'record', label: `Divisions with "${d.keyword}" in the title`, url, related })
    } else if (getAskTool(r.tool) && getAskTool(r.tool)?.askFactStyle !== 'legacy') {
      r.cite.forEach(cite => add(cite.label, cite))
    } else if (r.tool === 'count_speeches') {
      const rows = (d.rows as { name: string; count: number; member?: Fact['member'] }[] | undefined)
      if (d.committeeSupplement && rows?.length) rows.forEach((row, i) => add(`${row.name}: ${row.count} committee-hearing turns`, r.cite[i]))
      else if (rows?.length) rows.forEach((row, i) => add(`${row.name}: ${row.count} ${d.described}`, r.cite[i], [...entities, `${d.group_by === 'party' ? 'party' : 'person'}:${row.name}`],
        { group: countLead(filter, d.group_by === 'party' ? 'party' : 'speaker'), row: `${row.name}: ${n(row.count)}`, basis: String(filter.venue ?? 'chamber'), ...(row.member ? { member: row.member } : {}) }))
      else if (d.unanswerable) notes.add('The record cannot rank these speeches by party.')
      else if ((!Array.isArray(rows) || !['speaker', 'party'].includes(String(d.group_by))) && typeof d.total === 'number' && r.cite[0]) add(`${d.total} ${d.described}`, r.cite[0], entities, { basis: String(filter.venue ?? 'chamber') })
    } else if (r.tool === 'speech_trend') {
      ;(d.rows as { period: string; count: number; share: number; labelled: number }[]).forEach((row, i) =>
        add(`${row.period}: ${row.count} ${d.described}${row.labelled ? ` (${(row.share * 100).toFixed(1)}% of ${row.labelled} topic-labelled speeches)` : ''}`, r.cite[i], entities,
          { group: countLead(filter, String(d.by ?? 'year')) + (row.labelled ? ' (share of all topic-labelled speeches)' : ''), row: `${row.period}: ${n(row.count)}${row.labelled ? ` (${(row.share * 100).toFixed(1)}% of ${n(row.labelled)})` : ''}`, basis: String(filter.venue ?? 'chamber') }))
    } else if (r.tool === 'member_votes') {
      const s = d.summary as Record<string, number>
      const who = (d.person ?? d.party) as string
      if (!s.divisions || !r.cite[0]) { notes.add('The title search found no matching recorded divisions; it does not establish how the member or party voted.'); continue }
      // The count opens the list of divisions searched; each counted division is its own source row.
      const url = r.list ?? r.cite[0].url, related = r.cite.map(c => ({ label: c.label, url: c.url }))
      if (d.person) add(`${who} voted in ${s.divisions} divisions with "${d.keyword}" in the title: aye ${s.aye}, no ${s.no}`, { kind: 'record', label: `Divisions with "${d.keyword}" in the title`, url, related })
      else add(`${who} voted in ${s.divisions} divisions with "${d.keyword}" in the title: all aye in ${s.all_aye}, all no in ${s.all_no}, split in ${s.split}`, { kind: 'record', label: `Divisions with "${d.keyword}" in the title`, url, related })
    } else if (r.tool === 'party_receipts') {
      const years = (d.years as (number | null)[] | undefined) ?? [], fy = (year: number) => `${year}-${String(year + 1).slice(-2)}`
      const period = `${fy(years[0] ?? 1998)} to ${fy(years[1] ?? 2025)}`, industry = typeof d.industry === 'string' ? d.industry : undefined
      // What each row counts (party_receipts measure): donations (AEC Donation Received) or every receipt type.
      const donations = d.measure === 'donations', word = donations ? 'donations' : 'receipts'
      const measured = donations ? { measure: 'donations', measure_label: 'donations' } : d.measure === 'all_types' ? { measure: 'receipts_all', measure_label: 'all receipt types' } : {}
      if (d.party) {
        const rows = d.rows as { donor: string; associated_entity?: string; total_aud: number; return_reference?: string; industry?: string | null }[]
        rows.forEach((row, i) => add(`${d.party} disclosed $${row.total_aud.toLocaleString('en-AU')} in ${word} from ${row.donor}${row.associated_entity ? ` (${row.associated_entity})` : ''} (federal disclosures; financial years ${period})${row.return_reference ? " — "+row.return_reference : ""}`, r.cite[i + 1], entities,
          { receipt: { party: String(d.party), source: row.donor, amount: row.total_aud, period, jurisdiction: 'federal', ...measured, ...(row.associated_entity ? { associated: row.associated_entity } : {}), ...(row.industry ? { industry: row.industry } : {}), ...(industry ? { filter: industry } : {}) } }))
        // Labelled lines beside the ranking (aside): what the AEC does not class as donations, and public
        // funding. Each keeps its own citation and never enters a ranking (research-coherence donorRows).
        const other = (d.other_receipts as { donor: string; other_receipts_aud: number; subscriptions_aud: number; untyped_aud: number; line: string }[] | undefined) ?? []
        other.forEach((row, i) => { const cite = r.cite[rows.length + 1 + i]; if (cite) add(cite.label, cite, entities,
          { receipt: { party: String(d.party), source: row.donor, amount: row.other_receipts_aud + row.subscriptions_aud + row.untyped_aud, period, jurisdiction: 'federal', measure: 'other_receipts', measure_label: 'receipts the AEC does not class as donations', aside: cite.label } }) })
        const pf = (d.public_funding as { source: string; amount_aud: number; period: string }[] | undefined) ?? []
        pf.forEach((row, i) => { const cite = r.cite[rows.length + 1 + other.length + i]; if (cite) add(cite.label, cite, entities,
          { receipt: { party: String(d.party), source: row.source, amount: row.amount_aud, period: row.period || period, jurisdiction: 'federal', measure: 'public_funding', measure_label: 'public funding', aside: cite.label } }) })
        // A lending question's note and declared debts: what the returns say about loans, beside the ranking.
        const lending = (d.lending as string[] | undefined) ?? []
        lending.forEach((_line, i) => { const cite = r.cite[rows.length + 1 + other.length + pf.length + i]; if (cite) add(cite.label, cite, entities,
          { receipt: { party: String(d.party), source: `${d.party} returns`, amount: Number(cite.value) || 0, period, jurisdiction: 'federal', measure: 'declared_debts', measure_label: 'debts the returns declare', aside: cite.label } }) })
      } else {
        const rows = d.rows as { party: string; total_aud: number }[]
        rows.forEach((row, i) => add(`${row.party} disclosed $${row.total_aud.toLocaleString('en-AU')} in ${word} from ${d.industry} sources (federal disclosures; financial years ${period})`, r.cite[i], [`party:${row.party}`],
          { receipt: { party: row.party, source: `${d.industry} sources`, amount: row.total_aud, period, jurisdiction: 'federal', aggregate: true, ...measured, ...(industry ? { industry, filter: industry } : {}) } }))
        // A donations ranking's labelled lines: the industry's other receipts to each party, never ranked.
        const other = (d.other_receipts as { party: string; other_receipts_aud: number; subscriptions_aud: number; untyped_aud: number }[] | undefined) ?? []
        other.forEach((row, i) => { const cite = r.cite[rows.length + i]; if (cite) add(cite.label, cite, [`party:${row.party}`],
          { receipt: { party: row.party, source: `${d.industry} sources`, amount: row.other_receipts_aud + row.subscriptions_aud + row.untyped_aud, period, jurisdiction: 'federal', aggregate: true, measure: 'other_receipts', measure_label: 'receipts the AEC does not class as donations', aside: cite.label, ...(industry ? { industry, filter: industry } : {}) } }) })
      }
    } else if (r.tool === 'find_people') {
      const p = (d.people as { name: string; party: string | null; service?: ServicePeriod[] }[])[0]
      if (p) add(`${p.name}: ${p.party ?? 'party not recorded'}`, { ...r.cite[0], kind: 'person' })
      for (const period of p?.service ?? []) {
        const text = serviceText(p.name, period)
        add(text, { kind: 'record', label: text, url: period.url }, [`person:${p.name}`])
      }
    } else if (r.tool === 'find_quotes') {
      ;(d.passages as { title: string; text: string }[]).slice(0, 3).forEach((p, i) => add(`Passage from ${p.title}: "${p.text.slice(0, 400)}"`, { ...r.cite[i], kind: 'speech' }))
    }
  }
  return { facts, notes: [...notes] }
}
/** Where an answer's source rows lead: each result's whole-selection page, and each counted fact's own records. */
export interface SourceLinks { lists: string[]; related: Record<string, RelatedCite[]> }
export function sourceLinks(results: ToolResult[]): SourceLinks {
  const ok = results.filter(r => r.ok)
  const related: Record<string, RelatedCite[]> = {}
  for (const f of factSheet(ok).facts) if (f.cite?.related?.length) related[f.cite.url] = f.cite.related.slice(0, 12)
  return { lists: ok.flatMap(r => r.list ? [r.list] : []), related }
}
const NUMBER_WORD = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|billions?|trillions?|hundredth|thousandth|millionth|billionth|trillionth|half|halves|quarter|quarters|dozen|dozens|twice|thrice|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|\w+teenth|\w+tieth)\b/i
/** Connective prose from the planner sits beside the deterministic tool-row templates, which carry every figure: a
 * prose sentence with its own number would only repeat or contradict a row, so it is left out. */
export function verifyComposition(text: string, _facts: Fact[], _question = ''): { prose: string; cited: number[]; dropped: number } {
  const sentences = String(text ?? '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?\]])\s+(?=[A-Z"'(])/)
  const kept: string[] = []; let dropped = 0
  for (const sentence of sentences) {
    if (!sentence.trim()) continue
    if (/\p{N}/u.test(sentence) || NUMBER_WORD.test(sentence) || /^based on\b/i.test(sentence)) { dropped++; continue }
    kept.push(sentence)
  }
  return { prose: kept.join(' '), cited: [], dropped }
}
/** Every answer figure is bound to its entity and metric in factSheet. */
export function templateAnswer(facts: Fact[], notes: string[], grouped = false): string {
  // The planner path keeps its original sentence layout byte for byte.
  if (!grouped) return [facts.map((f) => `${f.text} [${f.id}]`).join('; ') + '.', ...notes.slice(0, 2)].join(' ')
  // Consecutive rows of one ranking or trend sit under their lead line, which states the basis and period once.
  const parts: string[] = []
  for (let i = 0; i < facts.length;) {
    const lead = facts[i].group
    if (!lead) { parts.push(`${facts[i].text} [${facts[i].id}].`); i++; continue }
    const rows: string[] = []
    for (; i < facts.length && facts[i].group === lead; i++) rows.push(`${facts[i].row} [${facts[i].id}]`)
    parts.push(`${lead}:\n${rows.join('; ')}.`)
  }
  return [parts.join('\n'), ...notes.slice(0, 2)].join(' ')
}
/** One counting basis per answer: chamber speeches by default, never a mix of chamber-only and all-venue rows. */
export function oneBasis(facts: Fact[]): Fact[] {
  const bases = new Set(facts.map(f => f.basis).filter(Boolean))
  if (bases.size < 2) return facts
  const keep = bases.has('chamber') ? 'chamber' : facts.find(f => f.basis)!.basis
  return facts.filter(f => !f.basis || f.basis === keep)
}

/** Bound selection budgets each requested entity separately. A missing entity
 * is a failed answer, never an excuse to render only the other entity. */
export function selectAnswerFacts(facts: Fact[], scope: NamedScope, peakYear = false, cap = 8): Fact[] | null {
  const required = [...scope.people.map(n => `person:${n}`), ...scope.parties.map(n => `party:${n}`)]
  if (!required.length) return peakYear ? facts.slice().sort((a, b) => Number(b.cite.value ?? 0) - Number(a.cite.value ?? 0)).slice(0, 1) : facts.slice(0, cap)
  const selected = new Set<Fact>()
  for (const entity of required) {
    const bound = facts.filter(f => f.entities?.includes(entity))
    if (!bound.length) return null
    if (peakYear) bound.sort((a, b) => Number(b.cite.value ?? 0) - Number(a.cite.value ?? 0))
    bound.slice(0, peakYear ? 1 : cap).forEach(f => selected.add(f))
  }
  return facts.filter(f => selected.has(f))
}

// --------------------------------------------------------------- named scope
export interface NamedScope { people: string[]; parties: string[]; bills: string[]; ambiguous: boolean; unresolved: boolean; otherMatches?: string[]; resolvedQuestion?: string; partyClarification?: true; partyClarificationReason?: 'identity' | 'party' | 'form'; correctedParty?: true }
/** Exact roster/list matching, with a unique surname allowed. Longest names
 * win over surnames inside another full name. Never ask the model to identify
 * the entities it must retain. */
export function extractNamedScope(question: string, roster: unknown, billList: unknown): NamedScope {
  const subject = resolvePartySubject(question, roster)
  if (subject.clarification) return { people: [], parties: [], bills: [], ambiguous: true, unresolved: true, partyClarification: true, partyClarificationReason: subject.reason }
  const resolvedQuestion = subject.question !== question ? subject.question : undefined
  question = subject.question
  const publicQuestion = question.replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g, ' ').replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\bquick\s+(?:check|question|one|note)\b/gi, ' ')
  const q = ` ${normaliseQuestion(publicQuestion)} `
  const mentions = (name: string) => !!name && q.includes(` ${normaliseQuestion(name)} `)
  const exported = (roster as { people?: { name: string; party?: string; party_now?: string; current?: boolean; speeches?: number }[] } | null)?.people ?? []
  // A bare indexed surname is an alias, not a full identity that may hide other people.
  const fullSurnames=new Set(exported.filter(p=>typeof p.name==='string'&&p.name.trim().includes(' ')).map(p=>normaliseQuestion(p.name).split(' ').at(-1)!))
  const records=exported.filter(p=>typeof p.name==='string'&&(p.name.trim().includes(' ')||!fullSurnames.has(normaliseQuestion(p.name))))
  const aliases: Record<string, string[]> = {
    Labor: ['Labor', 'Australian Labor Party', 'ALP'], Liberal: ['Liberal', 'Liberal Party'],
    Greens: ['Greens', 'Australian Greens'], Nationals: ['Nationals', 'National Party'],
    LNP: ['LNP', 'Liberal National Party'], 'One Nation': ['One Nation', 'PHON', "Pauline Hanson's One Nation"],
  }
  const knownPartyNames = new Set(Object.values(aliases).flat().map(normaliseQuestion))
  for (const p of records) for (const name of [p.party, p.party_now]) if (name && !knownPartyNames.has(normaliseQuestion(name))) aliases[name] ??= [name]
  const people: string[] = []
  // A lone surname is an ordinary word as often as a name ("nuclear power", "differ on"): when the
  // asker uses capitals at all, a one-word match must be capitalised as written in the roster.
  const cased = /\p{Lu}/u.test(publicQuestion)
  const capitalised = (word: string) => !cased || new RegExp(`(?<![\\p{L}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').test(publicQuestion)
  // Topic objects and geographic names are not people. A surname alias needs
  // an explicit title or person-subject grammar, rather than a capital letter.
  // Full roster names still match anywhere, including comparisons.
  const personalSurname = (surname: string) => {
    const escaped = surname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b(?:senator|sen|minister|mr|mrs|ms|miss|dr|mp) ${escaped}\\b|\\b${escaped} s\\b`, 'u').test(q) ||
      new RegExp(`\\b(?:has|have|did|does|would|might|was|is) ${escaped} (?:said|say|spoken|speak|made|make|voted|vote|paid|earn|support|oppose|propose)\\b`, 'u').test(q) ||
      new RegExp(`\\b(?:speeches|remarks|statements|votes) (?:by|from|of) ${escaped}(?: (?:about|on|in|since|until)| $)`, 'u').test(q)
  }
  let unmatched = q
  for (const party of [...new Set(Object.values(aliases).flat())].sort((a, b) => b.length-a.length)) unmatched = unmatched.split(` ${normaliseQuestion(party)} `).join(' ~ ')
  for (const p of records.filter(p => typeof p.name === 'string').sort((a, b) => b.name.length - a.name.length)) {
    const name = ` ${normaliseQuestion(p.name)} `
    if (!p.name.trim().includes(' ') && (!capitalised(p.name.trim()) || !personalSurname(normaliseQuestion(p.name)))) continue
    if (unmatched.includes(name)) { people.push(p.name); unmatched = unmatched.split(name).join(' ~ ') }
  }
  const ambiguous = false, otherMatches: string[] = []
  const remainder = unmatched
  const surnames = new Map<string, Set<string>>()
  for (const p of records) {
    if (typeof p.name !== 'string') continue
    const surname = normaliseQuestion(p.name).split(' ').at(-1)!
    if (surname.length < 4) continue
    if (!surnames.has(surname)) surnames.set(surname, new Set())
    surnames.get(surname)!.add(p.name)
  }
  const namePrefixes = new Set('d has have did does do what who why how when is was were are by from about on of for to with and or versus vs compare senator minister mr mrs ms dr the will can could should'.split(' '))
  for (const [surname, names] of surnames) if (remainder.includes(` ${surname} `) && capitalised([...names][0].trim().split(' ').at(-1)!) && personalSurname(surname)) {
    const before = remainder.slice(0, remainder.indexOf(` ${surname} `)).trim().split(' ').at(-1) ?? ''
    const given = [...names].some(name => normaliseQuestion(name).split(' ').slice(0, -1).includes(before))
    if (before && before !== '~' && !namePrefixes.has(before) && !given) continue
    // A surname several people share answers about the most likely one: a current office holder first, then the one
    // with the most records. The others are named under the answer so the reader can ask again.
    const likely = [...names].map(name => records.find(p => p.name === name)!).sort((a, b) => Number(!!b.current) - Number(!!a.current) || (b.speeches ?? 0) - (a.speeches ?? 0))
    people.push(likely[0].name); otherMatches.push(...likely.slice(1).map(p => p.name))
  }
  const parties = Object.entries(aliases).filter(([, names]) => names.some(mentions)).map(([name]) => name)
    .filter(name => name !== 'Liberal' || !mentions('Liberal National Party'))
  const bills = [...new Set(((billList as { bills?: { key: string; title?: string; short_title?: string }[] } | null)?.bills ?? [])
    .filter(b => [b.key, b.title, b.short_title, b.title?.replace(/\s+(?:19|20)\d{2}$/, '')].some(name => typeof name === 'string' && mentions(name))).map(b => b.key))]
  // Resolve names without relying on capitals. Mask known entities before
  // examining person grammar and remaining name-like token spans.
  const resolvedPeople = [...new Set(people)]
  const mask = (text: string, phrase: string) => text.split(` ${normaliseQuestion(phrase)} `).join(' ~ ')
  let unknown = resolvedPeople.reduce((text, name) => mask(text, name), q)
  for (const name of resolvedPeople) unknown = mask(unknown, name.split(' ').at(-1)!)
  for (const party of parties) for (const alias of [...aliases[party]].sort((a,b)=>b.length-a.length)) unknown = mask(unknown, alias)
  for (const bill of (billList as { bills?: { key: string; title?: string; short_title?: string }[] } | null)?.bills ?? [])
    if (bills.includes(bill.key)) for (const title of [bill.key, bill.title, bill.short_title]) if (title) unknown = mask(unknown, title)
  // Grammar also catches an unresolved single name: "has morgan made", "did
  // morgan say", "speeches by morgan", or "morgan's housing speeches".
  const words = '(?:[\\p{L}\\p{N}]+|~)(?: (?:[\\p{L}\\p{N}]+|~)){0,8}'
  const subjects = [...unknown.matchAll(new RegExp(`\\b(?:has|have|did|does|do) (${words}) (?:made|make|given|give|said|say|spoken|speak|voted|vote)\\b`, 'gu'))].map(m => m[1])
  const byNames = [...unknown.matchAll(new RegExp(`\\b(?:speeches|remarks|statements|votes) (?:by|from|of) (${words})`, 'gu'))]
    .map(m => m[1].split(/\b(?:about|on|in|since|until|from|across|over|each|per|are|were)\b/)[0].trim())
  const possessives = [...unknown.matchAll(new RegExp(`(${words}) s\\b`, 'gu'))].map(m => m[1])
  const quantity = (word: string) => /^\d+(?:st|nd|rd|th)?$/.test(word) || NUMBER_WORD.test(word)
  const groupWords = new Set('been mps members senators parties party parliament senate house committee committees government opposition speaker speakers year years decade decades term terms topic topics member senator mp politician politicians'.split(' '))
  const groupModifiers = new Set('the all these those which federal australian state current top leading most highest biggest ranked ranking'.split(' '))
  const collective = (span: string) => {
    const tokens = span.split(' ')
    return groupWords.has(tokens.at(-1)!) && tokens.slice(0, -1).every(word => groupModifiers.has(word) || quantity(word))
  }
  // Explicit person slots cannot be pardoned by the query-word vocabulary:
  // "has bill justice made" is still an unresolved person, even though both
  // words also have ordinary parliamentary meanings.
  const unresolvedGrammar = [...subjects, ...byNames, ...possessives].some(span => {
    const remaining = span.replace(/^(?:(?:how|many|of|the|compare)\s+)*/, '').replace(/~|\b(?:and|or|versus|vs)\b/g, ' ').replace(/\s+/g, ' ').trim()
    return remaining && !collective(remaining)
  })
  // These are parliamentary/query words, not guessed identities. Unknown
  // multi-word subjects conservatively stay on normal Ask as well.
  const ordinary = new Set(('please email me at call contact send my phone how many who which what where when why is are was were be been being has have had did does do made make making give given gave giving said say spoken spoke speak speaks speaking voted vote votes voting and or versus vs compared compare comparing than more most less least fewest often much the a an of for from by to in on about with into across over per each every all overall total number count counts counting rank ranking ranks top leading changed change changing grown growth debating debated debate discussed discuss mentions mention mentioned statements remarks speeches speech activity their his her its they them he she s senator senators mp mps member members minister ministers party parties parliament parliaments parliamentary chamber chambers committee committees hearing hearings house representatives legislative assembly council federal australian australia new south wales nsw victoria victorian vic queensland qld act sa current previous last this term terms record whole time year years yearly decade decades since until between through before after during now today recent recently reform reforms policy policies bill bills amendment amendments support affordability rental rentals assistance advertising ban bans labelled indexed recorded topic topics gambling housing climate environment change health mining energy coal welfare social financial services bank banks banking finance unions workplace education schools agriculture farming property construction immigration indigenous affairs tax budget media communications hospitality alcohol defence security integrity democracy infrastructure transport justice law foreign affairs fossil fuels donations donation donors donor money industry industries received receive receives receiving gave give giving donated contribute contributions paid funding raised same both similar different difference differences percentage percentages share shares coverage trend trends it that there led lead leads drove drive drives driven driving behind peak peaked peaks rose risen fell fallen up down').split(' '))
  // Quantifiers and rank descriptions (including normalized "twenty-one")
  // describe groups, not guessed people. Explicit person slots above still
  // require either a resolved roster identity or a complete collective phrase.
  const isUnknown = (word: string) => !ordinary.has(word) && !groupWords.has(word) && !groupModifiers.has(word) && !quantity(word) && !/^(?:19|20)\d{2}s?$/.test(word)
  const unresolvedSpan = unknown.split(/[^\p{L}\p{N} ]+/u).some(span => {
    let length = 0
    return span.trim().split(/\s+/).some(word => { length = isUnknown(word) ? length + 1 : 0; return length >= 2 })
  })
  return { people: resolvedPeople, parties, bills, ambiguous, unresolved: unresolvedGrammar || unresolvedSpan, ...(resolvedQuestion ? { resolvedQuestion } : {}), ...(otherMatches.length ? { otherMatches: [...new Set(otherMatches)].filter(name => !resolvedPeople.includes(name)) } : {}) }
}
/** Public roster resolution is bounded and precedes planning and cache reads. */
export async function resolveNamedScope(question: string, deps: ToolDeps, ms = 4_000, filters: Record<string, unknown> = {}): Promise<NamedScope> {
  return bounded(async signal => {
    const assets = deps.withSignal?.(signal) ?? deps
    const [roster, bills, interests] = await Promise.all([assets.asset('/parliamentarians.json'), assets.asset('/bills/index.json'), /\b(?:declare\w*|interests?|real estate|shareholdings|directorships)\b/i.test(question) ? assets.asset('/interests/index.json').catch(() => null) : null])
    const register = Object.values((interests as { people?: Record<string, { name: string }> } | null)?.people ?? {})
    const people = [...register, ...((roster as { people?: { name: string }[] } | null)?.people ?? [])]
    const combined = { people: [...new Map(people.map(p => [p.name, p])).values()] }
    signal.throwIfAborted()
    const slot = requestedPersonSlot(question)
    const resolution = slot ? resolvePersonName(slot, combined.people) : null
    const corrected = slot && resolution?.status === 'matched' ? question.replace(slot, resolution.candidates[0].person.name) : question
    const scope = extractNamedScope(corrected + (filters.speaker ? ` speeches by ${filters.speaker}` : ''), combined, bills)
    if (resolution?.status === 'matched') { scope.people = [resolution.candidates[0].person.name]; scope.ambiguous = false; scope.unresolved = false }
    if (corrected !== question) scope.resolvedQuestion = corrected
    if (!(bills as { bills?: unknown[] } | null)?.bills && /\bbill\b/i.test(question)) scope.unresolved = true
    return scope
  }, ms, deps.signal)
}
/** A named entity must constrain each applicable numerical lookup, and every
 * entity must occur in at least one such lookup. Merely resolving a name in a
 * find_people step does not constrain an overall count. Bill-scoped speech
 * counts are not supported by these tools, so defer those questions to Ask. */
export function planRetainsNamedScope(plan: Plan, scope: NamedScope): boolean {
  if (scope.unresolved || scope.ambiguous || scope.bills.length) return false
  const numeric = plan.steps.filter(s => ['count_speeches', 'speech_trend', 'member_votes', 'party_receipts'].includes(s.tool))
  const person = (s: PlanStep) => s.args[s.tool === 'member_votes' ? 'person' : 'speaker']
  const lookups = plan.steps.filter(s => ['count_speeches', 'speech_trend', 'member_votes', 'find_quotes'].includes(s.tool))
  if (scope.people.length && (scope.people.some(name => !numeric.some(s => person(s) === name)) ||
    numeric.some(s => s.tool === 'party_receipts') ||
    lookups.some(s => !scope.people.includes(String(person(s)))) ||
    plan.steps.some(s => s.tool === 'find_people' && !scope.people.includes(String(s.args.name))))) return false
  if (scope.parties.length && (scope.parties.some(name => !numeric.some(s => s.args.party === name)) ||
    [...numeric, ...lookups].some(s => !scope.parties.includes(String(s.args.party))))) return false
  return true
}

// ---------------------------------------------------------------- orchestration
export type Progress = ((event: string, data: unknown) => Promise<void>) & {
  /** Internal checked sentence lane, present only for a fresh research SSE response. */
  answer?: import('./research-types').AnswerPreview
}
export interface AgenticDeps extends ToolDeps {
  modelPrices?: { input: number; output: number }
  /** A comparison run must never pay for a second old-path planner. */
  researchShadow?: boolean
  generate: (query: string, prompt: { system: string; user: string }, maxTokens: number, signal: AbortSignal) => Promise<{ text: string; tokens?: { input: number; output: number }; costUsd?: number }>
  research?: Research
  plannerTrail?: boolean
  onResearchFailure?: (error: ResearchError) => Promise<void>
  /** Labels and counts of a loop answer's repairs and drops, for monitoring. */
  onResearchAnswer?: (tally: AnswerTally) => Promise<void>
}
export interface StepEvent { id: number; label: string; arg?: string; state: 'running' | 'done' | 'failed' | 'error'; ms?: number; tool?: string; round?: number; results?: number }
export interface AgenticPayload {
  /** Internal: a shared surname was answered for the first name; the others are named under the answer. */
  other_matches?: string[]
  answered: boolean
  reason?: 'declined' | 'no_supported_claim' | 'grounding_failed'
  answer: string
  answer_source: 'model' | 'template' | 'none'
  shape: Plan['shape'] | null
  period: Period
  facts: { id: number; text: string; url: string; kind: string; value?: number | string; receipt?: ReceiptFact; entities?: string[]; member?: Fact['member'] }[]
  notes: string[]
  steps: { tool: string; args: unknown; ok: boolean; error?: string; ms?: number; label?: string }[]
  events: StepEvent[]
  timings: { plan_ms: number; tools_ms: number; compose_ms: number; total_ms: number }
  tokens: { input: number; output: number }
  cost_usd: number | null
  over_budget: boolean
  version: string
  research?: ResearchPayload
  qualitative?: QualitativeAnswer
  answer_scope?: QualitativeAnswer['answer_scope']
  passage_answer?: QualitativeAnswer
  chosen_facts?: number[]
  research_failure?: string
  /** Not sent: read by linkAskSources when the response is built. */
  source_links?: SourceLinks
}
/** Race as well as abort: a stub/provider ignoring cancellation cannot hold the route open. */
export async function bounded<T>(work: (signal: AbortSignal) => Promise<T>, ms: number, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let stop: () => void = () => {}
  const abort = new Promise<never>((_, reject) => {
    stop = () => { controller.abort(parent?.reason ?? new DOMException('Budget expired', 'TimeoutError')); reject(controller.signal.reason) }
    parent?.addEventListener('abort', stop, { once: true })
    timer = setTimeout(stop, Math.max(0, ms))
    if (parent?.aborted || ms <= 0) stop()
  })
  try { return await Promise.race([controller.signal.aborted ? Promise.reject(controller.signal.reason) : work(controller.signal), abort]) }
  finally { if (timer !== undefined) clearTimeout(timer); parent?.removeEventListener('abort', stop) }
}
export function periodPlan(plan: Plan, period: Period, filters: Record<string, unknown>, constraints?: AskConstraints): Plan {
  return { ...plan, steps: plan.steps.map(s => {
    if (constraints && ['declared_interests', 'find_records', 'public_finances'].includes(s.tool)) return constrainStep(s, constraints, TOOL_SPECS.find(t => t.name === s.tool)!.input.properties as Record<string, unknown>)
    // The question decides what a donor figure counts (A34), on the planner path as in the research loop.
    if (s.tool === 'party_receipts' && constraints?.receiptMeasure) s = { ...s, args: { ...s.args, measure: constraints.receiptMeasure } }
    if (s.tool === 'party_receipts' && constraints?.lending) s = { ...s, args: { ...s.args, lending: true } }
    if (s.tool === 'party_receipts' && (period.since || period.until)) {
      const { since: _s, until: _u, from_year: _f, to_year: _t, ...args } = s.args
      const years = receiptYearWindow(period.since, period.until)
      return { ...s, args: { ...args, ...(!years.error ? years : {}), ...(period.since ? { since: period.since } : {}), ...(period.until ? { until: period.until } : {}) } }
    }
    if (!['count_speeches', 'speech_trend', 'find_quotes', 'member_votes'].includes(s.tool)) return s
    const { since: _s, until: _u, term: _t, ...args } = s.args
    const scoped = s.tool === 'member_votes' ? { ...(filters.speaker ? { person: filters.speaker } : {}), ...(filters.party ? { party: filters.party } : {}) } : filters
    const years = s.tool === 'speech_trend' && (args.by ?? 'year') === 'year'
      ? { from_year: Number(period.since?.slice(0, 4)) || 1993, to_year: Number(period.until?.slice(0, 4)) || 2026 } : {}
    return { ...s, args: { ...args, ...scoped, ...years, ...(period.since ? { since: period.since } : {}), ...(period.until ? { until: period.until } : {}) } }
  }) }
}
/** Fixed labels and bounded plain arguments. The client escapes these as text. */
export function stepEvent(step: PlanStep, id: number, committee = false): StepEvent {
  const registered = getAskTool(step.tool)
  if (registered && registered.askFactStyle !== 'legacy') {
    const label = registered.stepLabel(step.args)
    return { id, ...label, ...(label.arg ? { arg: label.arg.replace(/[<>&"'\x00-\x1f]/g, '').slice(0, 40) } : {}), ...(committee ? { label: 'Checking committee hearings' } : {}), state: 'running' }
  }
  const a = step.args
  const label = committee || step.tool === 'count_speeches' && a.venue === 'committee' ? 'Checking committee hearings' : step.tool === 'count_speeches' ? a.group_by === 'speaker' ? 'Counting by speaker' : a.group_by === 'party' ? 'Counting by party' : 'Searching speeches' : ({ member_votes: 'Checking votes', party_receipts: 'Checking disclosed receipts', speech_trend: 'Comparing years', find_quotes: 'Searching speeches', find_people: 'Resolving a name', search: 'Searching the record', person_quotes: 'Reading their speeches', read_passage: 'Reading a passage', finish: 'Selecting record facts', answer: 'Checking the answer', decline: 'Checking record coverage' } as Record<string, string>)[step.tool]
  const moneyArgs = new Set(['Labor', 'Liberal', 'Greens', 'Nationals', 'LNP', 'Independent', 'One Nation', 'United Australia Party', 'gambling', 'mining', 'fossil_fuels', 'finance', 'property', 'unions', 'health', 'hospitality', 'media', 'tech'])
  const raw = step.tool === 'party_receipts' ? [a.party, a.industry].find(v => typeof v === 'string' && moneyArgs.has(v)) : a.keyword ?? a.party ?? a.industry ?? a.speaker ?? a.person ?? a.topic ?? a.query ?? a.name
  const arg = typeof raw === 'string' ? raw.replace(/[<>&"'\x00-\x1f]/g, '').slice(0, 40) : undefined
  return { id, label: label ?? 'Checking public records', ...(arg ? { arg } : {}), state: 'running' }
}
export function resultCount(result: ToolResult): number {
  for (const key of ['rows', 'passages', 'people', 'facts']) if (Array.isArray(result.data?.[key])) return (result.data![key] as unknown[]).length
  return result.ok ? result.cite.length : 0
}
export function researchTrail(events: StepEvent[], steps: AgenticPayload['steps']): ResearchPayload['trail'] {
  return events.map((event, i) => ({ id: event.id, tool: event.tool ?? steps[i]?.tool ?? 'search', round: event.round ?? 1, label: event.label,
    ...(event.arg ? { arg: event.arg } : {}), ...(event.results != null ? { results: event.results } : {}), ms: event.ms ?? 0, ok: event.state === 'done' }))
}
/** Loop failures retain the old planner, inside the original request deadline. */
/** `kind` is the reader's record filter: a speech-only search is not given a calculated pay answer. */
export async function runAgentic(question: string, deps: AgenticDeps, progress: Progress = async () => {}, budgetMs = AGENTIC_BUDGET_MS, period = inferPeriod(question), filters: Record<string, unknown> = {}, resolvedScope?: NamedScope, kind?: string): Promise<AgenticPayload> {
  const started = Date.now()
  const lookup = await bounded(signal => exactRecordLookup(question, { ...deps, signal, ...(deps.withSignal?.(signal) ?? {}) }, period, resolvedScope), Math.min(4_000, budgetMs), deps.signal).catch(() => null)
  const lookupPayload = (qualitative: QualitativeAnswer): AgenticPayload => ({ answered: true, answer: qualitative.answer, answer_source: 'template', shape: classifyAgentic(question).shape, period, facts: [], notes: [], steps: [], events: [], timings: { plan_ms: Date.now() - started, tools_ms: 0, compose_ms: 0, total_ms: Date.now() - started }, tokens: { input: 0, output: 0 }, cost_usd: 0, over_budget: false, version: AGENTIC_PROMPT_VERSION, qualitative: { ...qualitative, answer_scope: { period } }, answer_scope: { period }, research: { mode: 'loop', rounds: 0, trail: [], sources: qualitative.sources.map(s => ({ title: s.title, url: s.url, kind: s.kind })) } })
  if (lookup?.terminal) return lookupPayload(lookup.answer)
  if (lookup?.correctedParty) {
    try { resolvedScope ??= await resolveNamedScope(question, deps, Math.min(4_000, budgetMs), filters) }
    catch { return lookupPayload(lookup.answer) }
    resolvedScope = { ...resolvedScope, parties: [], correctedParty: true }
  }
  const completeLookup = (run: AgenticPayload) => {
    if (!lookup) return run
    if (!run.answered) return { ...run, answered: true, reason: undefined, answer: lookup.answer.answer, answer_source: 'template' as const, qualitative: lookup.answer }
    const qualitative = prependLookupCorrection(run.qualitative ?? { answer: run.answer, citations: {}, sources: [] }, lookup.answer)
    return { ...run, answer: qualitative.answer, qualitative, ...(run.research ? { research: { ...run.research, sources: qualitative.sources.map(s => ({ title: s.title, url: s.url, kind: s.kind })) } } : {}) }
  }
  const assets={fetch:async(request:Request)=>{const data=await deps.asset(new URL(request.url).pathname);return data?Response.json(data):new Response('',{status:404})}} as Fetcher
  const calculated=await federalPartyMoneyAnswer({...filters,question} as import('./ask-records').RecordQuestion,assets)
  if(calculated)return {answered:true,answer:calculated.answer,answer_source:'template',shape:'money',period,facts:[],notes:[],steps:[],events:[],timings:{plan_ms:0,tools_ms:0,compose_ms:0,total_ms:0},tokens:{input:0,output:0},cost_usd:0,over_budget:false,version:AGENTIC_PROMPT_VERSION,qualitative:publicPartyMoneyAnswer(calculated) as unknown as QualitativeAnswer}
  // A set rate (a parliamentarian, a departmental secretary, a statutory office) is calculated, not researched:
  // paid_answer answers first, as on the ordinary Ask path. Reported pay goes on to annual_reports in the loop.
  const paid=await routedPayAnswer({...filters,...(kind?{kind}:{}),question} as import('./ask-records').RecordQuestion,{asset:deps.asset,origin:deps.origin,signal:deps.signal}).catch(()=>null)
  if(paid){
    const ms=Date.now()-started,event:StepEvent={...stepEvent({tool:'paid_answer',args:{}},1),tool:'paid_answer',round:1,results:1,ms,state:'done'}
    return {answered:true,answer:String(paid.answer),answer_source:'template',shape:classifyAgentic(question).shape,period,facts:[],notes:[],steps:[{tool:'paid_answer',args:{},ok:true,ms}],events:[event],timings:{plan_ms:0,tools_ms:ms,compose_ms:0,total_ms:ms},tokens:{input:0,output:0},cost_usd:0,over_budget:false,version:AGENTIC_PROMPT_VERSION,qualitative:paid as unknown as QualitativeAnswer,
      research:{mode:'loop',rounds:0,trail:researchTrail([event],[{tool:'paid_answer',args:{},ok:true,ms}]),sources:(paid as unknown as QualitativeAnswer).sources.map(s=>({title:s.title,url:s.url,kind:s.kind}))}}
  }
  const reserveEnabled=!!deps.research?.write&&(deps.research.writingWallMs??budgetMs)>=1000
  const selectionLeft=()=>Math.max(1,(deps.research?.write?researchPhaseWallMs(Math.min(budgetMs,deps.research.writingWallMs??budgetMs)):budgetMs)-(Date.now()-started))
  const attempted: StepEvent[] = []
  const loopProgress: Progress = async (event, data) => {
    const step = (data as { step?: StepEvent })?.step
    if (step && step.state !== 'running') attempted.push(step)
    await progress(event, data)
  }
  // An exact-lookup correction is prepended after research; its opening cannot be streamed past.
  loopProgress.answer=lookup?undefined:progress.answer
  const writeRun = async (run: AgenticPayload) => {
    if (!run.answered || !deps.research?.write) return run
    if(run.qualitative?.answer_decision&&run.qualitative.answer_decision!=='answer')return run
    const chosen = new Set(run.chosen_facts ?? [])
    const facts: Fact[] = run.facts.filter(f => !chosen.size || chosen.has(f.id)).map(f => ({id:f.id,text:f.text,cite:{kind:f.kind as Fact['cite']['kind'],url:f.url,label:f.text,value:f.value},...(f.receipt?{receipt:f.receipt}:{}),...(f.entities?.length?{entities:f.entities}:{}),...(f.member?{member:f.member}:{})}))
    // Passage points have already been written and checked by the model; retain the 16 Oct loose-point contract.
    if (run.qualitative && !run.qualitative.sources.some(s=>!['speech','bill'].includes(s.kind))) return run
    const recordAnswer = run.qualitative && run.passage_answer ? {...run.qualitative,sources:run.qualitative.sources.filter(s=>!['speech','bill'].includes(s.kind))} : run.qualitative
    const sheet = writingFacts(recordAnswer, facts, run.notes)
    // A decline or an intentionally uncited 16 Oct point has no tool block to write from.
    if (!sheet.length) return run
    // A hearing transcript listing is answered in the tool's own lines (transcript-answer.ts).
    if (transcriptListingOnly(sheet)) return run
    await progress('status', {phase:'writing'})
    const stats = { reservedCostUsd:run.research?.reserved_cost_usd,rounds:run.research?.rounds ?? 0,tokens:{...run.tokens},costUsd:run.cost_usd ?? undefined,turns:run.research?.turns ? [...run.research.turns] : [] }
    if(run.research)run.research.pre_writer_sources=sheet.map(f=>({...f.source,snippet:f.text,...(f.coverage?{coverage:true}:{})}))
    const input={question,period,facts:sheet,constraints:run.qualitative?.answer_scope??run.answer_scope??{period,jurisdiction:typeof filters.state==='string'?filters.state:undefined,chamber:typeof filters.chamber==='string'?filters.chamber:undefined,party:typeof filters.party==='string'?filters.party:undefined}}
    const combine=(written:QualitativeAnswer)=>run.passage_answer?leadWithModelAnswer(appendWrittenPoints(written,run.passage_answer) as unknown as Record<string,unknown>,run.passage_answer,question) as unknown as QualitativeAnswer:written
    let active=true,checkedPartial:QualitativeAnswer|undefined
    // Everything this answer can cite: the writer's facts with their sources, and any model passage answer it extends.
    // A source's snippet, fact texts and title are read alone and joined, as written sources join them.
    const bySource=new Map<string,typeof sheet>()
    for(const f of sheet)bySource.set(f.source.resource,[...(bySource.get(f.source.resource)??[]),f])
    // Only a streamed answer previews, so only it reads the basis.
    const who=!lookup&&progress.answer&&ACCOUNTABILITY_QUESTION.test(question)?whoBasis([...bySource.values()].map(group=>({kind:group[0].source.kind,coverage:group.every(f=>f.coverage),texts:[group[0].source.snippet,...group.map(f=>f.text),group[0].source.title]}))
      .concat((run.passage_answer?.sources??[]).map(s=>({kind:s.kind,coverage:!!s.coverage,texts:[s.snippet,s.title]})))):undefined
    const previewCheck=researchPreviewGuard('compose')
    const preview:import('./research-types').AnswerPreview|undefined=lookup||!progress.answer?undefined:async(written,accept)=>{
      if(!active)return
      return previewCheck(async()=>{
        const combined=combine(written)
        const checked=await progress.answer!(who?{...combined,research:{...(combined as {research?:object}).research,who_basis:who}} as QualitativeAnswer:combined,accept)
        if(checked)checkedPartial=checked
        return checked
      })
    }
    const writingMs=Math.max(0,Math.min(8000,Math.min(budgetMs, deps.research.writingWallMs ?? budgetMs)-(Date.now()-started)))
    const written = await bounded(signal=>deps.research!.write!(input,stats,signal,writingMs,preview),writingMs,deps.signal).catch(()=>checkedPartial??proseFallback(input)).finally(()=>{active=false})
    const complete=combine(written)
    run.answer=complete.answer;run.qualitative=complete;run.answer_source='model'
    run.tokens=stats.tokens;run.cost_usd=stats.costUsd ?? run.cost_usd
    run.timings.compose_ms+=Date.now()-started-run.timings.total_ms;run.timings.total_ms=Date.now()-started
    if(run.research){run.research.reserved_cost_usd=stats.reservedCostUsd;run.research.turns=stats.turns;run.research.sources=complete.sources.map(s=>({title:s.title,url:s.url,kind:s.kind,...(s.date?{date:s.date}:{}),...(s.speaker?{speaker:s.speaker}:{})}))}
    return run
  }
  try {
    const primary=(signal?:AbortSignal)=>runAgenticAttempt(question,{...deps,signal},deps.research?loopProgress:progress,budgetMs,period,filters,resolvedScope,started)
    const run = await (reserveEnabled?bounded(primary,selectionLeft(),deps.signal):primary(deps.signal))
    if (deps.research && !isElectorateDataQuestion(question) && !run.answered) throw new ResearchError(run.reason === 'no_supported_claim' ? 'no_supported_claim' : 'grounding', { rounds: run.research?.rounds ?? 0, tokens: run.tokens, turns: run.research?.turns, ...(run.cost_usd != null ? { costUsd: run.cost_usd } : {}) })
    return otherMatchLine(completeLookup(await writeRun(run)))
  }
  catch (error) {
    if (!deps.research) throw error
    const failure = error instanceof ResearchError ? error : new ResearchError(deps.signal?.aborted ? 'aborted' : error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'error')
    await deps.onResearchFailure?.(failure)
    if (deps.signal?.aborted) throw error
    // Research already wrote from whatever it gathered (or from general knowledge) before throwing; past the spend cap
    // nothing more can be written, and the response says it is unanswered rather than showing a budget line.
    if (failure.reason === 'spend' || (failure.stats.reservedCostUsd ?? 0) + ASK_FALLBACK_RESERVE_USD > ASK_MAX_MODEL_USD) return { ...lookupPayload({ answer: '', citations: {}, sources: [] }), answered: false, reason: 'declined', answer_source: 'none', tokens: failure.stats.tokens, cost_usd: failure.stats.costUsd ?? null, events: attempted, research_failure: 'spend', research: { mode: 'loop', rounds: failure.stats.rounds, trail: researchTrail(attempted, []), sources: [], failure: 'spend', turns: failure.stats.turns, reserved_cost_usd: failure.stats.reservedCostUsd } }
    if (deps.researchShadow || failure.reason === 'timeout' || !classifyAgentic(question).shape) {
      const steps = attempted.map(event => ({ tool: event.tool ?? 'search', args: {}, ok: event.state === 'done', ms: event.ms ?? 0, label: event.label }))
      return completeLookup({ answered: false, reason: 'declined', answer: '', answer_source: 'none', shape: classifyAgentic(question).shape, period,
        facts: [], notes: [], steps, events: attempted, tokens: { ...failure.stats.tokens }, cost_usd: failure.stats.costUsd ?? null,
        over_budget: Date.now() - started >= budgetMs, version: `${AGENTIC_PROMPT_VERSION}/${AGENTIC_TOOLS_VERSION}`,
        timings: { plan_ms: Date.now() - started, tools_ms: 0, compose_ms: 0, total_ms: Date.now() - started },
        research: { mode: 'planner', rounds: failure.stats.rounds, trail: researchTrail(attempted, steps), sources: [], failure: failure.reason, ms: Date.now() - started, tokens: { ...failure.stats.tokens }, cost_usd: failure.stats.usageUnknown ? null : failure.stats.costUsd ?? 0, turns: failure.stats.turns, cached_input_by_turn: failure.stats.turns?.map(turn => turn.cached_input) }, research_failure: failure.reason })
    }
    const offset = attempted.length
    const shifted: Progress = async (event, data) => {
      const value = data as { step?: StepEvent }
      await progress(event, value?.step ? { ...value, step: { ...value.step, id: value.step.id + offset } } : data)
    }
    const fallbackSpend = { reservedCostUsd: failure.stats.reservedCostUsd }
    const generate: AgenticDeps['generate'] = async (query, prompt, maxTokens, signal) => {
      const input = Math.ceil(new TextEncoder().encode(JSON.stringify({ query, prompt })).length / 3) + 4096
      // The old planner has no provider receipt. Its conservative ceiling stays charged for writing admission.
      await reserveQuestionTurn(fallbackSpend, researchTurnReservationUsd(input, maxTokens, deps.modelPrices?.input, deps.modelPrices?.output), unmeteredResearchBudget)
      return deps.generate(query, prompt, maxTokens, signal)
    }
    const recover=(signal?:AbortSignal)=>runAgenticAttempt(question,{...deps,generate,signal,research:undefined,plannerTrail:true},shifted,Math.max(0,budgetMs-(Date.now()-started)),period,filters,resolvedScope,started)
    const fallback = await (reserveEnabled?bounded(recover,selectionLeft(),deps.signal):recover(deps.signal))
    fallback.events = fallback.events.map(e => ({ ...e, id: e.id + offset }))
    if (fallback.research) fallback.research.trail = fallback.research.trail.map(e => ({ ...e, id: e.id + offset }))
    if (fallback.research) Object.assign(fallback.research, { failure: failure.reason, reserved_cost_usd: fallbackSpend.reservedCostUsd, turns: failure.stats.turns, cached_input_by_turn: failure.stats.turns?.map(turn => turn.cached_input) })
    fallback.tokens.input += failure.stats.tokens.input; fallback.tokens.output += failure.stats.tokens.output
    if (failure.stats.costUsd != null) fallback.cost_usd = (fallback.cost_usd ?? 0) + failure.stats.costUsd
    fallback.timings.total_ms = Date.now() - started
    fallback.research_failure = failure.reason
    return otherMatchLine(completeLookup(await writeRun(fallback)))
  }
}
/** One line under an answer about a shared surname names the other people it could mean, so the reader can ask again. */
export function otherMatchLine(run: AgenticPayload): AgenticPayload {
  const { other_matches: others, ...rest } = run
  if (!others?.length || !rest.answered || !rest.answer.trim() || rest.qualitative?.answer_decision === 'refusal') return rest
  const line = `If you meant ${others.slice(0, 3).join(' or ')}, ask again with the full name.`
  const answer = rest.answer.trimEnd() + '\n\n' + line
  return { ...rest, answer, ...(rest.qualitative ? { qualitative: { ...rest.qualitative, answer: rest.qualitative.answer.trimEnd() + '\n\n' + line } } : {}) }
}
async function runAgenticAttempt(question: string, deps: AgenticDeps, progress: Progress, budgetMs: number, period: Period, filters: Record<string, unknown>, resolvedScope?: NamedScope, primaryStarted=Date.now()): Promise<AgenticPayload> {
  // Speculative extras (the early committee check) end with their attempt: a dropped or failed run leaves no lookup behind.
  const extras = new AbortController()
  try { return await attempt(question, deps, progress, budgetMs, period, filters, extras.signal, resolvedScope, primaryStarted) }
  finally { extras.abort() }
}
async function attempt(question: string, deps: AgenticDeps, progress: Progress, budgetMs: number, period: Period, filters: Record<string, unknown>, extras: AbortSignal, resolvedScope?: NamedScope,primaryStarted=Date.now()): Promise<AgenticPayload> {
  const electorateData = isElectorateDataQuestion(question)
  if (electorateData && !deps.research) period = { kind: 'all', label: 'Figures use published Census geography.' }
  const t0 = Date.now(), deadline = t0 + budgetMs
  const tokens = { input: 0, output: 0 }
  let cost: number | null = electorateData ? 0 : null
  const left = () => Math.max(0, deadline - Date.now())
  const timings = { plan_ms: 0, tools_ms: 0, compose_ms: 0, total_ms: 0 }
  const results: ToolResult[] = [], steps: AgenticPayload['steps'] = [], events: StepEvent[] = []
  let researched: ResearchResult | undefined
  let executionSignal = deps.signal
  let otherMatches: string[] = []
  const base = (over: Partial<AgenticPayload>): AgenticPayload => ({ ...(otherMatches.length ? { other_matches: otherMatches } : {}), answered: false, answer: '', answer_source: 'none', shape: classifyAgentic(question).shape, period, facts: [], notes: [], steps, events, tokens, cost_usd: cost, over_budget: !left(), version: `${AGENTIC_PROMPT_VERSION}/${AGENTIC_TOOLS_VERSION}`,
    ...(researched?.constraints?{answer_scope:researched.constraints}:{}),
    ...(deps.plannerTrail ? { research: { mode: 'planner', rounds: 1, trail: researchTrail(events, steps), sources: [] } as ResearchPayload } : {}),
    ...(researched ? { research: { mode: 'loop', rounds: researched.rounds, reserved_cost_usd:researched.reservedCostUsd, trail: researchTrail(events, steps), sources: [], turns: researched.turns, cached_input_by_turn: researched.turns?.map(turn => turn.cached_input) } as ResearchPayload } : {}),
    ...over, source_links: sourceLinks(results), timings: { ...timings, total_ms: Date.now() - t0 } })
  // The decade candidate proof supports leaders, not the least active member.
  if (!deps.research && !electorateData && /\b(?:least|fewest)\b/i.test(question)) return base({ reason: 'declined' })
  let named: NamedScope = { people: [], parties: [], bills: [], ambiguous: false, unresolved: false }
  if (!electorateData) {
    try { named = resolvedScope ?? await resolveNamedScope(question, deps, Math.min(4_000, left()), filters) }
    catch { return base({ reason: 'declined' }) }
    if(named.partyClarification){const answer=(named.partyClarificationReason==='form'?'Which party do you mean? Please name the party directly so I can check the records for your question.':named.partyClarificationReason==='identity'?"Which party do you mean? Please give the person's full name so I can identify their current party.":"Which party do you mean? This person's current roster affiliation does not identify a political party.");return base({answered:true,answer,answer_source:'template',cost_usd:0,research:{mode:'loop',rounds:0,trail:[],sources:[],turns:[],tokens:{input:0,output:0},cost_usd:0},qualitative:{answer,answer_decision:'clarification',citations:{},sources:[],answer_status:'uncited'}})}
    otherMatches = named.otherMatches ?? []
    if (!deps.research && (named.unresolved || named.ambiguous || named.bills.length)) return base({ reason: 'declined' })
  }
  const usage = (out: { tokens?: { input: number; output: number }; costUsd?: number }) => {
    if (out.tokens) { tokens.input += out.tokens.input; tokens.output += out.tokens.output }
    if (typeof out.costUsd === 'number') cost = (cost ?? 0) + out.costUsd
  }
  // Research turns may run several lookups at once: number each step when it starts, not when it lands.
  let begun = 0
  const execute = async (step: PlanStep, committee = false, custom?: (d: ToolDeps) => Promise<ToolResult>, round?: number, parentSignal = executionSignal): Promise<ToolResult> => {
    const turn = round ?? researched?.rounds
    begun = Math.max(begun, steps.length) + 1
    const event = { ...stepEvent(step, begun, committee), ...(turn ? { tool: step.tool, round: turn } : {}) }
    await progress('status', { phase: 'step', step: event })
    const started = Date.now()
    let r: ToolResult
    try {
      r = await bounded(async signal => {
        const scoped: ToolDeps = { ...deps, signal,
          kb: async (path, body) => { signal.throwIfAborted(); return deps.kb(path, body) },
          asset: async path => { signal.throwIfAborted(); return deps.asset(path) },
        }
        // Adapters use the scoped signal on fetch and body reads.
        if (deps.withSignal) Object.assign(scoped, deps.withSignal(signal))
        return custom ? custom(scoped) : runTool(scoped, step.tool, step.args)
      }, Math.min(ASK_TOOL_WALL_MS, Math.max(0, left() - 5_000)), parentSignal)
    } catch { r = { tool: step.tool, ok: false, error: 'lookup timed out or unavailable', cite: [], notes: [] } }
    const ms = Date.now() - started
    steps.push({ tool: step.tool, args: step.args, ok: r.ok, error: r.error, ms, label: event.label })
    const done: StepEvent = { ...event, state: r.ok ? 'done' : 'failed', ms, ...(turn && r.ok ? { results: resultCount(r) } : {}) }
    events.push(done); await progress('status', { phase: 'step', step: done })
    return r
  }
  // The planner keeps its committee supplement. Loop runs choose each lookup explicitly, inside their call cap.
  const eligibleRank = (s: PlanStep) => s.tool === 'count_speeches' && ['speaker', 'party'].includes(String(s.args.group_by)) && !s.args.speaker && (s.args.venue ?? 'chamber') === 'chamber' && (!s.args.state || s.args.state === 'federal')
  const committeeChecks = new Map<string, Promise<ToolResult>>()
  const committeeCheck = (step: PlanStep, ranked: ToolResult, round?: number) => {
    const key = JSON.stringify(step.args)
    let pending = committeeChecks.get(key)
    if (!pending) {
      const chamber = ranked.data?.rows as { name: string; count: number }[] | undefined
      const { chamber: _chamber, ...args } = step.args
      pending = execute({ tool: 'count_speeches', args }, true, async d => {
        const all = await runTool(d, 'count_speeches', { ...args, venue: 'all' })
        if (!all.ok || all.data?.exact === false) return { ...all, ok: false }
        const allRows = all.data?.rows as { name: string; count: number }[]
        if (allRows.map(r => r.name).join('|') === chamber?.map(r => r.name).join('|')) return { ...all, data: { unchanged: true } }
        const committee = await runTool(d, 'count_speeches', { ...args, venue: 'committee', limit: 3 })
        if (committee.ok) committee.data = { ...committee.data, committeeSupplement: true }
        return committee
      }, round, executionSignal ? AbortSignal.any([executionSignal, extras]) : extras)
      committeeChecks.set(key, pending)
    }
    return pending
  }
  let plan: Plan | null = electorateData ? electoratePlan(question) : null
  const used = new Set<number>()
  const usedOnly = <T,>(list: T[]) => researched && used.size ? list.filter((_, i) => used.has(i)) : list
  if (deps.research) {
    const rules = fallbackPlan(question)?.steps.find(s => ['count_speeches', 'speech_trend'].includes(s.tool))?.args ?? {}
    const explicit = Object.fromEntries(['state', 'chamber', 'party'].filter(k => rules[k] != null && (k !== 'party' || !named.correctedParty && named.parties.length <= 1)).map(k => [k, rules[k]]))
    researched = await bounded(signal => { executionSignal = signal; return deps.research!(question, {
      deps, period, named, signal, progress,selectionWallMs:(deps.research!.writingWallMs??budgetMs)>=1000?Math.max(1,researchPhaseWallMs(Math.min(budgetMs,deps.research!.writingWallMs??budgetMs))-(Date.now()-primaryStarted)-50):undefined,
      scope: step => periodPlan({ shape: classifyAgentic(question).shape ?? 'ranking', steps: [step] }, period, { ...explicit, ...filters }).steps[0],
      execute: (step, round, custom, signal) => execute(step, false, custom, round, signal),
    }) }, Math.max(0, left() - 4_000), deps.signal)
    executionSignal = deps.signal
    usage(researched)
    results.push(...researched.results)
    plan = { shape: classifyAgentic(question).shape ?? 'ranking', steps: researched.steps }
    // A loop answer is only the facts it selected: lookups it ran but did not use (another topic, an inexact
    // ranking) neither decline it nor count against it. Fact ids run across results in order.
    let id = 0
    researched.results.forEach((r, i) => { const n = factSheet([r]).facts.length; if (researched!.selected.some(s => s > id && s <= id + n)) used.add(i); id += n })
    if (researched.qualitative) {
      timings.plan_ms = Date.now() - t0
      if (researched.answer) await deps.onResearchAnswer?.(researched.answer).catch(() => {})
      await progress('status', { phase: 'writing' })
      return base({ answered: true, answer: researched.qualitative.answer, answer_source: 'model', qualitative: researched.qualitative, passage_answer:researched.points,
        research: { mode: 'loop', rounds: researched.rounds, reserved_cost_usd:researched.reservedCostUsd, trail: researchTrail(events, steps), turns: researched.turns, cached_input_by_turn: researched.turns?.map(turn => turn.cached_input), ...(researched.answer ? { answer_stats: researched.answer } : {}), sources: researched.qualitative.sources.map(s => ({ title: s.title, url: s.url, kind: s.kind, ...(s.date ? { date: s.date } : {}), ...(s.speaker ? { speaker: s.speaker } : {}) })) } })
    }
  }
  let plannerFailed = false
  try {
    if (!plan && !researched) {
      const out = await bounded(signal => deps.generate(question, plannerPrompt(), 700, signal), Math.min(15_000, left()), deps.signal)
      usage(out); plan = parsePlan(out.text)
    }
  } catch { plannerFailed = true }
  timings.plan_ms = Date.now() - t0
  const rulePlan = fallbackPlan(question)
  // Malformed output is a planner failure, not permission to substitute a
  // numerical answer. Timeout recovery is limited to a complete rule plan.
  if (!plan && !plannerFailed) return base({ reason: 'declined' })
  if (!rulePlan && !electorateData && !researched) return base({ reason: 'declined' })
  // A valid JSON plan must still answer the classified shape and retain its
  // subject. In particular, never replace topic counts with overall totals.
  const topic = rulePlan?.steps.find(s => s.args.topic)?.args.topic
  if (plan && plan.shape !== 'unanswerable' && (!researched || classifyAgentic(question).shape)) {
    const has = (tool: string) => plan!.steps.some(s => s.tool === tool)
    const group = /\bpart(?:y|ies)\b/i.test(question) ? 'party' : 'speaker'
    if (electorateData && plan.steps.some(s => s.tool !== 'electorates') || plan.shape === 'ranking' && !electorateData && !plan.steps.some(s => s.tool === 'count_speeches' && s.args.group_by === group) ||
        /\bwhich year\b.*\bmost\b/i.test(question) && !plan.steps.some(s => s.tool === 'speech_trend' && (s.args.by ?? 'year') === 'year') ||
        plan.shape === 'trend' && !has('count_speeches') && !has('speech_trend') ||
        plan.shape === 'money' && (!has('party_receipts') || !has('count_speeches')) ||
        plan.shape === 'comparison' && (!has('count_speeches') || VOTE_WORDS.test(question) && !['member_votes', 'member_divisions', 'division'].some(has))) plan = null
  }
  if (plan && plan.shape !== 'unanswerable' && ((!researched && plan.shape !== classifyAgentic(question).shape) || topic && usedOnly(plan.steps).filter(s => ['count_speeches', 'speech_trend'].includes(s.tool)).some(s => s.args.topic !== topic))) plan = null
  // Schema-valid but semantically incomplete plans also fall back to Ask.
  // Only a failed/timed-out planner may use the full subject-aware rule plan.
  if (!plan && plannerFailed) plan = rulePlan
  if (!left() || deps.signal?.aborted) return base({ reason: 'declined', over_budget: true })
  if (!plan) return base({ reason: 'declined' })
  if (plan.shape === 'unanswerable') return base({ reason: 'declined', notes: plan.reason ? [plan.reason] : [] })
  const ruleArgs = rulePlan?.steps.find(s => ['count_speeches', 'speech_trend'].includes(s.tool))?.args ?? {}
  const explicitScope = Object.fromEntries(['state', 'chamber', 'party'].filter(k => ruleArgs[k] != null && (k !== 'party' || named.parties.length <= 1)).map(k => [k, ruleArgs[k]]))
  if (!planRetainsNamedScope(plan, named)) return base({ reason: 'declined' })
  plan = periodPlan(plan, period, { ...explicitScope, ...filters }, extractAskConstraints(question, period, named, filters))
  if (!planRetainsNamedScope(plan, named)) return base({ reason: 'declined' })
  const tTools = Date.now()
  const donationLimitation = (r: ToolResult | undefined) => r?.tool === 'party_receipts' && r.ok && r.data?.coverage_only === true && r.coverage?.matched === false
  const coverageBlocked = new Set<number>()
  for (const step of researched ? [] : plan.steps) {
    if (left() < 8_000) break
    const args = resolveArgs(step.args, results)
    if (!args) {
      const unresolved = Object.entries(step.args).filter(([key, value]) => !resolveArgs({ [key]: value }, results))
      const limited = unresolved.length > 0 && unresolved.every(([, value]) => {
        const index = Number(String(value).match(/\d+/)![0]) - 1
        return donationLimitation(results[index]) || coverageBlocked.has(index)
      })
      if (limited) coverageBlocked.add(results.length)
      results.push({ tool: step.tool, ok: false, error: limited ? 'lookup depends on unsupported donation period' : 'unresolved earlier result', cite: [], notes: [] })
      continue
    }
    results.push(await execute({ ...step, args }))
  }
  // A failed join or partial comparison must never imply missing votes or money.
  const checkedResults = usedOnly(results.map((result, index) => ({ result, index }))).filter(({ index }) => !coverageBlocked.has(index)).map(({ result }) => result)
  if (results.length !== plan.steps.length || checkedResults.some(r => !r.ok || r.data?.exact === false ||
    r.tool === 'member_votes' && !(r.data?.rows as unknown[] | undefined)?.length ||
    r.tool === 'party_receipts' && !donationLimitation(r) && !(r.data?.rows as unknown[] | undefined)?.length)) return base({ reason: 'no_supported_claim', over_budget: left() < 8_000 })
  const limitedDonations = checkedResults.find(donationLimitation)
  if (limitedDonations) {
    // A partial FY is a known source limit, not an empty result. Keep it out of
    // numerical selection and writing so a companion count cannot imply a money comparison.
    const note = limitedDonations.coverage?.note ?? 'The donation records cannot establish totals for the requested period.'
    const answer = `${period.label} ${note} No donation totals have been substituted.`
    const url = limitedDonations.cite[0]?.url ?? 'https://opax.com.au/methods'
    const qualitative: QualitativeAnswer = { answer, answer_decision: 'limitation', answer_scope: { period },
      citations: { 'coverage/t/body/0': [[0, Array.from(answer).length]] },
      sources: [{ resource: 'coverage', slug: '', title: 'Donation record coverage', href: url, url, snippet: answer, cited: true, kind: 'record' }] }
    timings.tools_ms = Date.now() - tTools
    return base({ answered: true, answer, answer_source: 'template', qualitative, notes: [note] })
  }
  const rankIndex = plan.steps.findIndex((s, i) => eligibleRank(s) && (!researched || !used.size || used.has(i)))
  const committeeFacts: Fact[] = []
  if (!researched && rankIndex >= 0 && left() >= 8_000) {
    const step = plan.steps[rankIndex]
    const r = steps.length < AGENTIC_MAX_STEPS ? await committeeCheck(step, results[rankIndex]) : null
    if (r && r.ok && r.data?.committeeSupplement) {
      const more = factSheet([r]); results.push(r)
      committeeFacts.push(...more.facts)
    }
  }
  timings.tools_ms = Date.now() - tTools
  const { facts } = factSheet(results)
  const { notes } = factSheet(researched ? results.filter(r => !['search', 'read_passage'].includes(r.tool)) : results)
  const factOut = facts.map(f => ({ id: f.id, text: f.text, url: f.cite?.url ?? '', kind: f.cite?.kind ?? 'count', value: f.cite?.value, ...(f.receipt ? { receipt: f.receipt } : {}), ...(f.entities?.length ? { entities: f.entities } : {}), ...(f.member ? { member: f.member } : {}) }))
  if (!facts.length) return base({ reason: 'no_supported_claim', notes })
  await progress('status', { phase: 'writing' })
  const tCompose = Date.now()
  const mainFacts = facts.filter(f => !committeeFacts.some(c => c.text === f.text))
  const peakYear = /\bwhich year\b.*\bmost\b/i.test(question)
  if (peakYear) mainFacts.sort((a, b) => Number(b.cite.value ?? 0) - Number(a.cite.value ?? 0))
  // Select deterministically before the writing stage. Figures, metric labels,
  // entities and counting basis remain attached to their original tool rows.
  let chosen = oneBasis(researched ? mainFacts.filter(f => researched!.selected.includes(f.id)) : mainFacts)
  if (researched && speechRankingGrain(question) === 'speaker' && /\b(?:members|mps|senators|politicians|speakers)\b/i.test(question)) {
    // Selecting a member ranking selects its ranked cohort, including surname-only rows.
    // Complete only a selected lookup's exact scope and basis, never an unrelated exploratory count.
    const anchor = chosen.find(f => f.group?.endsWith(', by speaker') && f.entities?.some(e => e.startsWith('person:')))
    if (anchor) chosen = mainFacts.filter(f => f.group === anchor.group && f.basis === anchor.basis && f.entities?.some(e => e.startsWith('person:')))
  }
  // The loop's finish already bounds its own selection (30 ids): a year-by-year trend keeps every year it chose.
  const selected = electorateData ? chosen : selectAnswerFacts(chosen, named, peakYear, researched ? 30 : 8)
  if (!selected?.length) return base({ reason: 'no_supported_claim' })
  let answer = templateAnswer(selected, [], !!researched)
  if (committeeFacts.length) {
    const ids = facts.filter(f => committeeFacts.some(c => c.text === f.text))
    answer += researched ? '\nIncluding committee hearings: ' + ids.map(f => `${f.text.replace(' committee-hearing turns', '')} [${f.id}]`).join('; ') + '.'
      : ' Including committee hearings: ' + ids.map(f => `${f.text.replace(' committee-hearing turns', '')} [${f.id}]`).join(', ') + '.'
  }
  // These limits belong to the answer sentences; never a separate UI block. A loop answer's lead lines already state its period.
  if (researched) answer += notes.length ? '\n' + notes.join(' ') : ''
  else answer += ' ' + period.label + (notes.length ? ' ' + notes.join(' ') : '')
  timings.compose_ms = Date.now() - tCompose
  if (!left() || deps.signal?.aborted) return base({ reason: 'declined', over_budget: true })
  return base({ answered: true, answer, answer_source: 'template', facts: factOut, notes,
    ...(researched || deps.plannerTrail ? { chosen_facts: selected.map(f => f.id), research: { mode: researched ? 'loop' : 'planner', rounds: researched?.rounds ?? 1, reserved_cost_usd:researched?.reservedCostUsd, trail: researchTrail(events, steps), turns: researched?.turns, cached_input_by_turn: researched?.turns?.map(turn => turn.cached_input), sources: researchSources([...selected, ...facts.filter(f => committeeFacts.some(c => c.text === f.text))]) } } : {}) })
}
export function normaliseQuestion(question: string): string {
  return question.normalize('NFKC').toLowerCase().replace(/[‘’“”]/g, "'").replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim()
}
export async function questionHash(question: string): Promise<string> {
  return hashText(normaliseQuestion(question))
}
async function hashText(text: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('')
}
export async function agenticCacheKey(question: string, epoch: string, model: string, period = inferPeriod(question), toolsVersion = AGENTIC_TOOLS_VERSION, filters: Record<string, unknown> = {}, shape = classifyAgentic(question).shape, scope?: NamedScope): Promise<string> {
  if (scope?.unresolved || scope?.ambiguous) throw new Error('unresolved cache scope')
  const entities = { people: [...new Set(scope?.people ?? [])].sort(), parties: [...new Set(scope?.parties ?? [])].sort(), bills: [...new Set(scope?.bills ?? [])].sort() }
  // Invalid Census selectors must not share a key with validated names.
  const cacheQuestion = isElectorateDataQuestion(question) || shape === null && toolsVersion.includes('/loop/') ? question.normalize('NFKC').toLowerCase().trim() : normaliseQuestion(question)
  const hash = await hashText(JSON.stringify({ q: cacheQuestion, shape, period, entities, filters, epoch, model, v: AGENTIC_PROMPT_VERSION, t: toolsVersion }))
  return `https://cache.opax.internal/ask-agentic/${hash}`
}
