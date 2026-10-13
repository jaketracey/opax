/**
 * OPAX-owned Ask orchestration in the Worker
 * (docs/design/agentic-ask-2026-10.md). /api/ask uses AGENTIC_ASK_MODE;
 * it stays off unless the operator selects route or shadow.
 *
 *   classify (rules, no model) -> plan (one model call, JSON) -> run tools
 *   (src/agentic-tools.ts, deterministic) -> render bound tool-row templates.
 *   The model never writes answer text or figures.
 *
 * Counts and rankings only ever come from tool results. The model only plans;
 * it never counts or phrases numerical claims. `answered: false` with a reason
 * when no tool result supports an answer (the web-ask-no-answer contract).
 */
import { TOOL_SPECS, TOPICS, STATES, CHAMBERS, TERMS, runTool, validToolArgs, AGENTIC_TOOLS_VERSION, type ToolDeps, type ToolResult, type Cite } from './agentic-tools'
import { isElectorateDataQuestion, electoratePlan } from './agentic-tool-electorates'
import { getAskTool } from './tools'

export const AGENTIC_PROMPT_VERSION = 'agentic-ask-4'
export const AGENTIC_BUDGET_MS = 40_000
export const AGENTIC_MAX_STEPS = 6

export type Shape = 'ranking' | 'trend' | 'comparison' | 'money'
export interface Period { kind: 'current' | 'all' | 'window'; since?: string; until?: string; label: string }
export function inferPeriod(question: string, override?: unknown): Period {
  const q = question.toLowerCase()
  if (override === 'all' || /\b(?:whole record|all[ -]time|across the record)\b/.test(q)) return { kind: 'all', label: 'Counting speeches across the whole record.' }
  if (/\bthis term\b/.test(q) && /\blast term\b/.test(q)) return { kind: 'window', since: TERMS['47th'][0], label: 'Counting speeches in the current and previous parliaments, since July 2022.' }
  if (override === 'current' || /\b(?:this|current) (?:term|parliament)\b/.test(q)) return { kind: 'current', since: TERMS['48th'][0], label: 'Counting speeches in the current parliament since July 2025.' }
  if (/\blast (?:term|parliament)\b/.test(q)) return { kind: 'window', since: TERMS['47th'][0], until: TERMS['47th'][1]!, label: 'Counting speeches in the previous parliament, July 2022 to March 2025.' }
  // A year in a bill's title is not a request to restrict speech history.
  const years = [...q.replace(/\bbill\s+(?:19|20)\d{2}\b/g, 'bill').matchAll(/\b((?:19|20)\d{2})(s)?\b/g)]
  if (years.length) {
    const sorted = years.map(m => Number(m[1])).sort((a, b) => a - b)
    const since = `${sorted[0]}-01-01`
    const open = /\bsince\b/.test(q) && years.length === 1 && !years[0][2]
    const until = open ? undefined : `${sorted.at(-1)! + (years.at(-1)![2] ? 9 : 0)}-12-31`
    return { kind: 'window', since, until, label: `Counting speeches from ${since}${until ? ` to ${until}` : ' onwards'}.` }
  }
  if (/\b(?:is|are)\s+(?:\S+\s+){0,4}(?:making|speaking|debating|discussing|talking)\b|\b(?:speaks|says|mentions|debates|discusses)\b|\b(?:is|are)\s+(?:\S+\s+){0,3}(?:debated|discussed)\b/.test(q)) return { kind: 'current', since: TERMS['48th'][0], label: 'Counting speeches in the current parliament since July 2025.' }
  return { kind: 'all', label: 'Counting speeches across the whole record.' }
}
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
  if (/each party/.test(q)) return { shape, steps: [{ tool: 'party_donations', args: { industry } }, { tool: 'count_speeches', args: { ...base, group_by: 'party' } }] }
  if (/received|receive/.test(q)) return { shape, steps: [{ tool: 'party_donations', args: { industry } }, { tool: 'count_speeches', args: { ...base, state: 'federal', party: '$1', group_by: 'none' } }] }
  if (/party of/.test(q)) return { shape, steps: [{ tool: 'count_speeches', args: { ...base, group_by: 'speaker' } }, { tool: 'find_people', args: { name: '$1' } }, { tool: 'party_donations', args: { party: '$2.party' } }] }
  return { shape, steps: [{ tool: 'count_speeches', args: { ...base, group_by: 'party' } }, { tool: 'party_donations', args: { party: '$1' } }] }
}
const toolCatalogue = () => TOOL_SPECS.map((t) => `- ${t.name}(${Object.keys((t.input.properties ?? {}) as object).join(', ')}): ${t.description}`).join('\n')
export function plannerPrompt(): { system: string; user: string } {
  const user = [
    'Plan the record lookups that answer the question below. You do not answer it; the lookups produce every figure.',
    '',
    'Tools:',
    toolCatalogue(),
    '',
    `Topics: ${TOPICS.join(', ')}. States: ${STATES.join(', ')} (federal = Commonwealth parliament). Chambers: ${CHAMBERS.join(', ')}. Terms: ${Object.entries(TERMS).map(([k, [a, b]]) => `${k} ${a}..${b ?? 'now'}`).join('; ')}.`,
    'Rules:',
    '- Electorate demographics -> electorates only, never find_quotes or speech counts. Unqualified "median income" = median_income (personal AUD/week), NOT household income. Highest/oldest/most -> order desc; lowest/youngest -> asc. "In X" for a named seat -> operation lookup and electorate X. State parliament -> jurisdiction (e.g. vic); federal seats in a state -> jurisdiction federal + state (e.g. vic). Missing profiles cannot answer a ranking; never substitute speech figures.',
    '- Map the subject to ONE topic label when it fits ("gambling reform" -> gambling, "climate change" -> climate-environment, "the budget" -> tax-budget).',
    '- "Who speaks most / top speakers" -> count_speeches with group_by speaker. "Which party" -> group_by party. Add state or chamber only when the question names a parliament or chamber; "senators" -> chamber senate; "MPs in federal parliament" -> state federal.',
    '- Dates: "since 2022" -> since 2022-01-01. "this term" -> term 48th, "last term" -> term 47th. A decade ("the 2010s") -> since 2010-01-01, until 2019-12-31.',
    '- "Is X debated more / how has X changed / which year" -> speech_trend (by year, decade or term). Two named years -> speech_trend by year with from_year and to_year.',
    '- Votes versus words -> member_votes(keyword, person or party) AND count_speeches for the same person or party and topic (group_by none).',
    '- A later step can use an earlier result: "$1" is the top name from step 1 (a speaker or party), "$1.party" is that person\'s party. To get a speaker\'s party use find_people("$1") then "$2.party".',
    '- Money: party_donations(party) for donors to a party; party_donations(industry) for an industry\'s totals by party. Industries: gambling, mining, fossil_fuels, finance, property, unions, health, hospitality, media, tech.',
    '- If the record cannot answer (party by state parliament other than federal or qld, a topic outside the list with no other route), set shape "unanswerable" and give the reason.',
    `- At most ${AGENTIC_MAX_STEPS} steps.`,
    '',
    'Reply with ONE JSON object and nothing else: {"shape": "ranking|trend|comparison|money|unanswerable", "steps": [{"tool": "...", "args": {...}, "label": "short progress label, e.g. Counting gambling speeches by speaker"}], "reason": "only when unanswerable"}',
    '',
    'Question: {question}',
  ].join('\n')
  return {
    system: 'You turn questions about the Australian parliamentary record into a JSON list of tool calls. Output JSON only.',
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
export interface Fact { id: number; text: string; cite: Cite; entities?: string[] }
/** Each template binds tool-row figures to their entity, metric and citation. */
export function factSheet(results: ToolResult[]): { facts: Fact[]; notes: string[] } {
  const facts: Fact[] = []
  const notes = new Set<string>()
  let entities: string[] = []
  const add = (text: string, cite: Cite, bound = entities) => facts.push({ id: facts.length + 1, text, cite, entities: bound })
  for (const r of results) {
    if (!r.ok) continue
    r.notes.forEach((n) => notes.add(n))
    const d = r.data as Record<string, unknown>
    const filter = (d.filter ?? {}) as Record<string, unknown>
    entities = [filter.speaker || d.person ? `person:${filter.speaker || d.person}` : '', filter.party || d.party ? `party:${filter.party || d.party}` : ''].filter(Boolean)
    if (getAskTool(r.tool)) {
      r.cite.forEach(cite => add(cite.label, cite))
    } else if (r.tool === 'count_speeches') {
      const rows = (d.rows as { name: string; count: number }[] | undefined)
      if (d.committeeSupplement && rows?.length) rows.forEach((row, i) => add(`${row.name}: ${row.count} committee-hearing turns`, r.cite[i]))
      else if (rows?.length) rows.forEach((row, i) => add(`${row.name}: ${row.count} ${d.described}`, r.cite[i], [...entities, `${d.group_by === 'party' ? 'party' : 'person'}:${row.name}`]))
      else if (d.unanswerable) notes.add('The record cannot rank these speeches by party.')
      else if (!Array.isArray(rows) && typeof d.total === 'number' && r.cite[0]) add(`${d.total} ${d.described}`, r.cite[0])
    } else if (r.tool === 'speech_trend') {
      ;(d.rows as { period: string; count: number; share: number; labelled: number }[]).forEach((row, i) =>
        add(`${row.period}: ${row.count} ${d.described}${row.labelled ? ` (${(row.share * 100).toFixed(1)}% of ${row.labelled} topic-labelled speeches)` : ''}`, r.cite[i]))
    } else if (r.tool === 'member_votes') {
      const s = d.summary as Record<string, number>
      const who = (d.person ?? d.party) as string
      if (!s.divisions || !r.cite[0]) { notes.add('The title search found no matching recorded divisions; it does not establish how the member or party voted.'); continue }
      const url = r.cite[0].url
      if (d.person) add(`${who} voted in ${s.divisions} divisions with "${d.keyword}" in the title: aye ${s.aye}, no ${s.no}`, { kind: 'record', label: `Divisions with "${d.keyword}" in the title`, url })
      else add(`${who} in ${s.divisions} divisions with "${d.keyword}" in the title: all aye in ${s.all_aye}, all no in ${s.all_no}, split in ${s.split}`, { kind: 'record', label: `Divisions with "${d.keyword}" in the title`, url })
    } else if (r.tool === 'party_donations') {
      if (d.party) {
        ;(d.rows as { donor: string; total_aud: number; return_reference?:string }[]).forEach((row, i) => add(`${row.donor} gave ${d.party} $${row.total_aud.toLocaleString('en-AU')} (federal disclosures)${row.return_reference ? " — "+row.return_reference : ""}`, r.cite[i + 1]))
      } else (d.rows as { party: string; total_aud: number }[]).forEach((row, i) => add(`${d.industry} donors gave ${row.party} $${row.total_aud.toLocaleString('en-AU')} (federal disclosures)`, r.cite[i], [`party:${row.party}`]))
    } else if (r.tool === 'find_people') {
      const p = (d.people as { name: string; party: string | null }[])[0]
      if (p) add(`${p.name}: ${p.party ?? 'party not recorded'}`, r.cite[0])
    } else if (r.tool === 'find_quotes') {
      ;(d.passages as { title: string; text: string }[]).slice(0, 3).forEach((p, i) => add(`Passage from ${p.title}: "${p.text.slice(0, 400)}"`, r.cite[i]))
    }
  }
  return { facts, notes: [...notes] }
}
const NUMBER_WORD = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|billions?|trillions?|hundredth|thousandth|millionth|billionth|trillionth|half|halves|quarter|quarters|dozen|dozens|twice|thrice|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|\w+teenth|\w+tieth)\b/i
const CAUSAL = /\b(?:bought|bribe\w*|in exchange for|because of (?:the|these|their) donations?|donations? (?:caused|influenced|explain\w*)|paid for (?:access|votes?|influence))\b|\b(?:donat\w*|money|funding)\b.*\b(?:influenc\w*|caus\w*|led to|resulted in|secured)\b/i
/** Defensive boundary for any future connective prose. No model-authored
 * numeric characters or number words are accepted, including citation ids,
 * dates, percentages and money.
 * Only the deterministic renderer may introduce them. No placeholders are
 * supported: answers currently consist entirely of bound tool-row templates. */
export function verifyComposition(text: string, _facts: Fact[], _question = ''): { prose: string; cited: number[]; dropped: number } {
  const sentences = String(text ?? '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?\]])\s+(?=[A-Z"'(])/)
  const kept: string[] = []; let dropped = 0
  for (const sentence of sentences) {
    if (!sentence.trim()) continue
    if (/\p{N}/u.test(sentence) || NUMBER_WORD.test(sentence) || CAUSAL.test(sentence) || /^based on\b/i.test(sentence)) { dropped++; continue }
    kept.push(sentence)
  }
  return { prose: kept.join(' '), cited: [], dropped }
}
/** Every answer figure is bound to its entity and metric in factSheet. */
export function templateAnswer(facts: Fact[], notes: string[]): string {
  const lines = facts.map((f) => `${f.text} [${f.id}]`)
  return [lines.join('; ') + '.', ...notes.slice(0, 2)].join(' ')
}

/** Bound selection budgets each requested entity separately. A missing entity
 * is a failed answer, never an excuse to render only the other entity. */
export function selectAnswerFacts(facts: Fact[], scope: NamedScope, peakYear = false): Fact[] | null {
  const required = [...scope.people.map(n => `person:${n}`), ...scope.parties.map(n => `party:${n}`)]
  if (!required.length) return peakYear ? facts.slice().sort((a, b) => Number(b.cite.value ?? 0) - Number(a.cite.value ?? 0)).slice(0, 1) : facts.slice(0, 8)
  const selected = new Set<Fact>()
  for (const entity of required) {
    const bound = facts.filter(f => f.entities?.includes(entity))
    if (!bound.length) return null
    if (peakYear) bound.sort((a, b) => Number(b.cite.value ?? 0) - Number(a.cite.value ?? 0))
    bound.slice(0, peakYear ? 1 : 8).forEach(f => selected.add(f))
  }
  return facts.filter(f => selected.has(f))
}

// --------------------------------------------------------------- named scope
export interface NamedScope { people: string[]; parties: string[]; bills: string[]; ambiguous: boolean; unresolved: boolean }
/** Exact roster/list matching, with a unique surname allowed. Longest names
 * win over surnames inside another full name. Never ask the model to identify
 * the entities it must retain. */
export function extractNamedScope(question: string, roster: unknown, billList: unknown): NamedScope {
  const publicQuestion = question.replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g, ' ').replace(/https?:\/\/\S+/gi, ' ')
  const q = ` ${normaliseQuestion(publicQuestion)} `
  const mentions = (name: string) => !!name && q.includes(` ${normaliseQuestion(name)} `)
  const records = (roster as { people?: { name: string; party?: string; party_now?: string }[] } | null)?.people ?? []
  const people: string[] = []
  let unmatched = q
  for (const p of records.filter(p => typeof p.name === 'string').sort((a, b) => b.name.length - a.name.length)) {
    const name = ` ${normaliseQuestion(p.name)} `
    if (unmatched.includes(name)) { people.push(p.name); unmatched = unmatched.split(name).join(' ~ ') }
  }
  let ambiguous = false
  const remainder = unmatched
  const surnames = new Map<string, Set<string>>()
  for (const p of records) {
    if (typeof p.name !== 'string') continue
    const surname = normaliseQuestion(p.name).split(' ').at(-1)!
    if (surname.length < 4) continue
    if (!surnames.has(surname)) surnames.set(surname, new Set())
    surnames.get(surname)!.add(p.name)
  }
  for (const [surname, names] of surnames) if (remainder.includes(` ${surname} `)) {
    if (names.size === 1) people.push([...names][0]); else ambiguous = true
  }
  const aliases: Record<string, string[]> = {
    Labor: ['Labor', 'Australian Labor Party', 'ALP'], Liberal: ['Liberal', 'Liberal Party'],
    Greens: ['Greens', 'Australian Greens'], Nationals: ['Nationals', 'National Party'],
    LNP: ['LNP', 'Liberal National Party'], 'One Nation': ['One Nation'],
  }
  for (const p of records) for (const name of [p.party, p.party_now]) if (name) aliases[name] ??= [name]
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
  for (const party of parties) for (const alias of aliases[party]) unknown = mask(unknown, alias)
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
  const ordinary = new Set(('please email me at call contact send my phone how many who which what where when why is are was were be been being has have had did does do made make making give given gave giving said say spoken spoke speak speaks speaking voted vote votes voting and or versus vs compared compare comparing than more most less least fewest often much the a an of for from by to in on about with into across over per each every all overall total number count counts counting rank ranking ranks top leading changed change changing grown growth debating debated debate discussed discuss mentions mention mentioned statements remarks speeches speech activity their his her its they them he she s senator senators mp mps member members minister ministers party parties parliament parliaments parliamentary chamber chambers committee committees hearing hearings house representatives legislative assembly council federal australian australia new south wales nsw victoria victorian vic queensland qld act sa current previous last this term terms record whole time year years yearly decade decades since until between through before after during now today recent recently reform reforms policy policies bill bills amendment amendments support affordability rental rentals assistance advertising ban bans labelled indexed recorded topic topics gambling housing climate environment change health mining energy coal welfare social financial services bank banks banking finance unions workplace education schools agriculture farming property construction immigration indigenous affairs tax budget media communications hospitality alcohol defence security integrity democracy infrastructure transport justice law foreign affairs fossil fuels donations donation donors donor money industry industries received receive receives receiving gave give giving donated contribute contributions paid funding raised same both similar different difference differences percentage percentages share shares coverage trend trends').split(' '))
  // Quantifiers and rank descriptions (including normalized "twenty-one")
  // describe groups, not guessed people. Explicit person slots above still
  // require either a resolved roster identity or a complete collective phrase.
  const isUnknown = (word: string) => !ordinary.has(word) && !groupWords.has(word) && !groupModifiers.has(word) && !quantity(word) && !/^(?:19|20)\d{2}s?$/.test(word)
  const unresolvedSpan = unknown.split(/[^\p{L}\p{N} ]+/u).some(span => {
    let length = 0
    return span.trim().split(/\s+/).some(word => { length = isUnknown(word) ? length + 1 : 0; return length >= 2 })
  })
  return { people: resolvedPeople, parties, bills, ambiguous, unresolved: unresolvedGrammar || unresolvedSpan }
}
/** Public roster resolution is bounded and precedes planning and cache reads. */
export async function resolveNamedScope(question: string, deps: ToolDeps, ms = 4_000, filters: Record<string, unknown> = {}): Promise<NamedScope> {
  return bounded(async signal => {
    const assets = deps.withSignal?.(signal) ?? deps
    const [roster, bills] = await Promise.all([assets.asset('/parliamentarians.json'), assets.asset('/bills/index.json')])
    signal.throwIfAborted()
    const scope = extractNamedScope(question + (filters.speaker ? ` speeches by ${filters.speaker}` : ''), roster, bills)
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
  const numeric = plan.steps.filter(s => ['count_speeches', 'speech_trend', 'member_votes', 'party_donations'].includes(s.tool))
  const person = (s: PlanStep) => s.args[s.tool === 'member_votes' ? 'person' : 'speaker']
  const lookups = plan.steps.filter(s => ['count_speeches', 'speech_trend', 'member_votes', 'find_quotes'].includes(s.tool))
  if (scope.people.length && (scope.people.some(name => !numeric.some(s => person(s) === name)) ||
    numeric.some(s => s.tool === 'party_donations') ||
    lookups.some(s => !scope.people.includes(String(person(s)))) ||
    plan.steps.some(s => s.tool === 'find_people' && !scope.people.includes(String(s.args.name))))) return false
  if (scope.parties.length && (scope.parties.some(name => !numeric.some(s => s.args.party === name)) ||
    [...numeric, ...lookups].some(s => !scope.parties.includes(String(s.args.party))))) return false
  return true
}

// ---------------------------------------------------------------- orchestration
export type Progress = (event: string, data: unknown) => Promise<void>
export interface AgenticDeps extends ToolDeps {
  generate: (query: string, prompt: { system: string; user: string }, maxTokens: number, signal: AbortSignal) => Promise<{ text: string; tokens?: { input: number; output: number }; costUsd?: number }>
}
export interface StepEvent { id: number; label: string; arg?: string; state: 'running' | 'done' | 'failed'; ms?: number }
export interface AgenticPayload {
  answered: boolean
  reason?: 'declined' | 'no_supported_claim' | 'grounding_failed'
  answer: string
  answer_source: 'model' | 'template' | 'none'
  shape: Plan['shape'] | null
  period: Period
  facts: { id: number; text: string; url: string; kind: string; value?: number | string }[]
  notes: string[]
  steps: { tool: string; args: unknown; ok: boolean; error?: string; ms?: number; label?: string }[]
  events: StepEvent[]
  timings: { plan_ms: number; tools_ms: number; compose_ms: number; total_ms: number }
  tokens: { input: number; output: number }
  cost_usd: number | null
  over_budget: boolean
  version: string
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
function periodPlan(plan: Plan, period: Period, filters: Record<string, unknown>): Plan {
  return { ...plan, steps: plan.steps.map(s => {
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
  if (registered) return { id, ...registered.stepLabel(step.args), state: 'running' }
  const a = step.args
  const label = committee ? 'Checking committee hearings' : step.tool === 'count_speeches' ? a.group_by === 'speaker' ? 'Counting by speaker' : a.group_by === 'party' ? 'Counting by party' : 'Searching speeches' : ({ member_votes: 'Checking votes', party_donations: 'Checking donations', speech_trend: 'Comparing years', find_quotes: 'Searching speeches', find_people: 'Searching speeches' } as Record<string, string>)[step.tool]
  const moneyArgs = new Set(['Labor', 'Liberal', 'Greens', 'Nationals', 'LNP', 'Independent', 'One Nation', 'United Australia Party', 'gambling', 'mining', 'fossil_fuels', 'finance', 'property', 'unions', 'health', 'hospitality', 'media', 'tech'])
  const raw = step.tool === 'party_donations' ? [a.party, a.industry].find(v => typeof v === 'string' && moneyArgs.has(v)) : a.keyword ?? a.party ?? a.industry ?? a.speaker ?? a.topic ?? a.query ?? a.name
  const arg = typeof raw === 'string' ? raw.replace(/[<>&"'\x00-\x1f]/g, '').slice(0, 40) : undefined
  return { id, label, ...(arg ? { arg } : {}), state: 'running' }
}
export async function runAgentic(question: string, deps: AgenticDeps, progress: Progress = async () => {}, budgetMs = AGENTIC_BUDGET_MS, period = inferPeriod(question), filters: Record<string, unknown> = {}, resolvedScope?: NamedScope): Promise<AgenticPayload> {
  const electorateData = isElectorateDataQuestion(question)
  if (electorateData) period = { kind: 'all', label: 'Figures use published Census geography.' }
  const t0 = Date.now(), deadline = t0 + budgetMs
  const tokens = { input: 0, output: 0 }
  let cost: number | null = null
  const left = () => Math.max(0, deadline - Date.now())
  const timings = { plan_ms: 0, tools_ms: 0, compose_ms: 0, total_ms: 0 }
  const results: ToolResult[] = [], steps: AgenticPayload['steps'] = [], events: StepEvent[] = []
  const base = (over: Partial<AgenticPayload>): AgenticPayload => ({ answered: false, answer: '', answer_source: 'none', shape: classifyAgentic(question).shape, period, facts: [], notes: [], steps, events, tokens, cost_usd: cost, over_budget: !left(), version: `${AGENTIC_PROMPT_VERSION}/${AGENTIC_TOOLS_VERSION}`, ...over, timings: { ...timings, total_ms: Date.now() - t0 } })
  // The decade candidate proof supports leaders, not the least active member.
  if (!electorateData && /\b(?:least|fewest)\b/i.test(question)) return base({ reason: 'declined' })
  let named: NamedScope = { people: [], parties: [], bills: [], ambiguous: false, unresolved: false }
  if (!electorateData) {
    try { named = resolvedScope ?? await resolveNamedScope(question, deps, Math.min(4_000, left()), filters) }
    catch { return base({ reason: 'declined' }) }
    if (named.unresolved || named.ambiguous || named.bills.length) return base({ reason: 'declined' })
  }
  const usage = (out: { tokens?: { input: number; output: number }; costUsd?: number }) => {
    if (out.tokens) { tokens.input += out.tokens.input; tokens.output += out.tokens.output }
    if (typeof out.costUsd === 'number') cost = (cost ?? 0) + out.costUsd
  }
  let plan: Plan | null = electorateData ? electoratePlan(question) : null
  let plannerFailed = false
  try {
    if (!plan) {
      const out = await bounded(signal => deps.generate(question, plannerPrompt(), 700, signal), Math.min(15_000, left()), deps.signal)
      usage(out); plan = parsePlan(out.text)
    }
  } catch { plannerFailed = true }
  timings.plan_ms = Date.now() - t0
  const rulePlan = fallbackPlan(question)
  // Malformed output is a planner failure, not permission to substitute a
  // numerical answer. Timeout recovery is limited to a complete rule plan.
  if (!plan && !plannerFailed) return base({ reason: 'declined' })
  if (!rulePlan && !electorateData) return base({ reason: 'declined' })
  // A valid JSON plan must still answer the classified shape and retain its
  // subject. In particular, never replace topic counts with overall totals.
  const topic = rulePlan?.steps.find(s => s.args.topic)?.args.topic
  if (plan && plan.shape !== 'unanswerable') {
    const has = (tool: string) => plan!.steps.some(s => s.tool === tool)
    const group = /\bpart(?:y|ies)\b/i.test(question) ? 'party' : 'speaker'
    if (electorateData && plan.steps.some(s => s.tool !== 'electorates') || plan.shape === 'ranking' && !electorateData && !plan.steps.some(s => s.tool === 'count_speeches' && s.args.group_by === group) ||
        /\bwhich year\b.*\bmost\b/i.test(question) && !plan.steps.some(s => s.tool === 'speech_trend' && (s.args.by ?? 'year') === 'year') ||
        plan.shape === 'trend' && !has('count_speeches') && !has('speech_trend') ||
        plan.shape === 'money' && (!has('party_donations') || !has('count_speeches')) ||
        plan.shape === 'comparison' && (!has('count_speeches') || VOTE_WORDS.test(question) && !has('member_votes'))) plan = null
  }
  if (plan && plan.shape !== 'unanswerable' && (plan.shape !== classifyAgentic(question).shape || topic && plan.steps.filter(s => ['count_speeches', 'speech_trend'].includes(s.tool)).some(s => s.args.topic !== topic))) plan = null
  // Schema-valid but semantically incomplete plans also fall back to Ask.
  // Only a failed/timed-out planner may use the full subject-aware rule plan.
  if (!plan && plannerFailed) plan = rulePlan
  if (!left() || deps.signal?.aborted) return base({ reason: 'declined', over_budget: true })
  if (!plan) return base({ reason: 'declined' })
  if (plan.shape === 'unanswerable') return base({ reason: 'declined', notes: plan.reason ? [plan.reason] : [] })
  const ruleArgs = rulePlan?.steps.find(s => ['count_speeches', 'speech_trend'].includes(s.tool))?.args ?? {}
  const explicitScope = Object.fromEntries(['state', 'chamber', 'party'].filter(k => ruleArgs[k] != null && (k !== 'party' || named.parties.length <= 1)).map(k => [k, ruleArgs[k]]))
  if (!planRetainsNamedScope(plan, named)) return base({ reason: 'declined' })
  plan = periodPlan(plan, period, { ...explicitScope, ...filters })
  if (!planRetainsNamedScope(plan, named)) return base({ reason: 'declined' })
  const tTools = Date.now()
  const execute = async (step: PlanStep, committee = false, custom?: (d: ToolDeps) => Promise<ToolResult>): Promise<ToolResult> => {
    const event = stepEvent(step, events.length + 1, committee)
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
      }, Math.min(12_000, Math.max(0, left() - 5_000)), deps.signal)
    } catch { r = { tool: step.tool, ok: false, error: 'lookup timed out or unavailable', cite: [], notes: [] } }
    const ms = Date.now() - started
    steps.push({ tool: step.tool, args: step.args, ok: r.ok, error: r.error, ms, label: event.label })
    const done: StepEvent = { ...event, state: r.ok ? 'done' : 'failed', ms }
    events.push(done); await progress('status', { phase: 'step', step: done })
    return r
  }
  for (const step of plan.steps) {
    if (left() < 8_000) break
    const args = resolveArgs(step.args, results)
    if (!args) { results.push({ tool: step.tool, ok: false, error: 'unresolved earlier result', cite: [], notes: [] }); continue }
    results.push(await execute({ ...step, args }))
  }
  // A failed join or partial comparison must never imply missing votes or money.
  if (results.length !== plan.steps.length || results.some(r => !r.ok || r.data?.exact === false ||
    r.tool === 'member_votes' && !(r.data?.summary as { divisions?: number } | undefined)?.divisions ||
    r.tool === 'party_donations' && !(r.data?.rows as unknown[] | undefined)?.length)) return base({ reason: 'no_supported_claim', over_budget: left() < 8_000 })
  const rankIndex = plan.steps.findIndex(s => s.tool === 'count_speeches' && ['speaker', 'party'].includes(String(s.args.group_by)) && !s.args.speaker && (s.args.venue ?? 'chamber') === 'chamber' && (!s.args.state || s.args.state === 'federal'))
  const committeeFacts: Fact[] = []
  if (rankIndex >= 0 && steps.length < AGENTIC_MAX_STEPS && left() >= 8_000) {
    const step = plan.steps[rankIndex], chamber = results[rankIndex].data?.rows as { name: string; count: number }[] | undefined
    const { chamber: _chamber, ...args } = step.args
    const r = await execute({ tool: 'count_speeches', args }, true, async d => {
      const all = await runTool(d, 'count_speeches', { ...args, venue: 'all' })
      if (!all.ok || all.data?.exact === false) return { ...all, ok: false }
      const allRows = all.data?.rows as { name: string; count: number }[]
      if (allRows.map(r => r.name).join('|') === chamber?.map(r => r.name).join('|')) return { ...all, data: { unchanged: true } }
      const committee = await runTool(d, 'count_speeches', { ...args, venue: 'committee', limit: 3 })
      if (committee.ok) committee.data = { ...committee.data, committeeSupplement: true }
      return committee
    })
    if (r.ok && r.data?.committeeSupplement) {
      const more = factSheet([r]); results.push(r)
      committeeFacts.push(...more.facts)
    }
  }
  timings.tools_ms = Date.now() - tTools
  const { facts, notes } = factSheet(results)
  const factOut = facts.map(f => ({ id: f.id, text: f.text, url: f.cite?.url ?? '', kind: f.cite?.kind ?? 'count', value: f.cite?.value }))
  if (!facts.length) return base({ reason: 'no_supported_claim', notes })
  await progress('status', { phase: 'writing' })
  const tCompose = Date.now()
  const mainFacts = facts.filter(f => !committeeFacts.some(c => c.text === f.text))
  const peakYear = /\bwhich year\b.*\bmost\b/i.test(question)
  if (peakYear) mainFacts.sort((a, b) => Number(b.cite.value ?? 0) - Number(a.cite.value ?? 0))
  // No composer call: figures, metric labels, entities and citations are
  // rendered together from the tool rows, so swapping aye/no or party/year
  // values in model text can never affect an answer.
  const selected = electorateData ? mainFacts : selectAnswerFacts(mainFacts, named, peakYear)
  if (!selected?.length) return base({ reason: 'no_supported_claim' })
  let answer = templateAnswer(selected, [])
  if (committeeFacts.length) {
    const ids = facts.filter(f => committeeFacts.some(c => c.text === f.text))
    answer += ' Including committee hearings: ' + ids.map(f => `${f.text.replace(' committee-hearing turns', '')} [${f.id}]`).join(', ') + '.'
  }
  // These limits belong to the answer sentences; never a separate UI block.
  answer += ' ' + period.label + (notes.length ? ' ' + notes.join(' ') : '')
  timings.compose_ms = Date.now() - tCompose
  if (!left() || deps.signal?.aborted) return base({ reason: 'declined', over_budget: true })
  return base({ answered: true, answer, answer_source: 'template', facts: factOut, notes })
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
  const cacheQuestion = isElectorateDataQuestion(question) ? question.normalize('NFKC').toLowerCase().trim() : normaliseQuestion(question)
  const hash = await hashText(JSON.stringify({ q: cacheQuestion, shape, period, entities, filters, epoch, model, v: AGENTIC_PROMPT_VERSION, t: toolsVersion }))
  return `https://cache.opax.internal/ask-agentic/${hash}`
}
