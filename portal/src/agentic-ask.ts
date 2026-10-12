/**
 * Design (i) of the agentic Ask spike: OPAX-owned orchestration in the Worker
 * (docs/design/agentic-ask-2026-10.md). Behind AGENTIC_ASK_ENABLED (off unless
 * set), POST /api/ask-agentic.
 *
 *   classify (rules, no model) -> plan (one model call, JSON) -> run tools
 *   (src/agentic-tools.ts, deterministic) -> compose (one model call over a fact
 *   sheet; every number checked against the facts, every number cited) ->
 *   template fallback when the prose fails a check.
 *
 * Counts and rankings only ever come from tool results. The model plans and
 * phrases; it never counts. `answered: false` with a reason when no tool result
 * supports an answer (the web-ask-no-answer contract).
 */
import { TOOL_SPECS, TOPICS, STATES, CHAMBERS, TERMS, runTool, AGENTIC_TOOLS_VERSION, type ToolDeps, type ToolResult, type Cite } from './agentic-tools'

export const AGENTIC_PROMPT_VERSION = 'agentic-ask-1'
export const AGENTIC_BUDGET_MS = 40_000
export const AGENTIC_MAX_STEPS = 6

export type Shape = 'ranking' | 'trend' | 'comparison' | 'money'
// ---------------------------------------------------------------- route classifier
/**
 * Route-only rollout: only these shapes take the agentic path; every other
 * question keeps today's Ask. Rules, not a model, so routing costs nothing and
 * can be tested. Ordered: a money join is also a ranking, so money wins.
 */
const SPEECH_WORDS = /\b(?:speech(?:es)?|spoke|spoken|speak(?:s|ing)?|said|says|mention(?:s|ed)?|talk(?:s|ed|ing)?|debated?|discuss(?:ed|es)?|raised?)\b/i
const MONEY_WORDS = /\b(?:donat\w*|donors?|gave|giving|funded|money)\b/i
const VOTE_WORDS = /\bvot(?:e|ed|es|ing)\b/i
const RANK_WORDS = /\b(?:most|least|more|fewest|top\s+(?:\d+|five|ten|three)|leading|biggest)\b/i
// "which Greens MPs", "which federal politicians": up to two words between which and the subject.
const RANK_SUBJECT = /\b(?:who|which\s+(?:[\w'’-]+\s+){0,2}(?:mps?|members?|senators?|politicians?|part(?:y|ies)|ministers?|states?|parliaments?))\b/i
const TREND_WORDS = /\b(?:more|less|fewer)\b.*\b(?:than|this term|last term|since|in the \d{4}s)\b|\b(?:changed?|trend|over time|which year|each year|by year|increase\w*|decrease\w*|risen|fallen|compared? with \d{4}|in \d{4} compared)\b/i
const COMPARE_WORDS = /\bcompare\b|\bversus\b|\bvs\.?\b|\bcompared with\b/i
export function classifyAgentic(question: string): { route: 'agentic' | 'ask'; shape: Shape | null; rule: string } {
  const q = question.trim()
  if (MONEY_WORDS.test(q) && SPEECH_WORDS.test(q)) return { route: 'agentic', shape: 'money', rule: 'money+speech' }
  if (VOTE_WORDS.test(q) && SPEECH_WORDS.test(q)) return { route: 'agentic', shape: 'comparison', rule: 'vote+speech' }
  if (COMPARE_WORDS.test(q) && /\bhow often\b|\bhow many\b/i.test(q)) return { route: 'agentic', shape: 'comparison', rule: 'compare-counts' }
  if (/\bhow many\b/i.test(q) && SPEECH_WORDS.test(q)) return { route: 'agentic', shape: 'trend', rule: 'how-many' }
  if (TREND_WORDS.test(q) && SPEECH_WORDS.test(q)) return { route: 'agentic', shape: 'trend', rule: 'trend' }
  if (RANK_SUBJECT.test(q) && RANK_WORDS.test(q) && (SPEECH_WORDS.test(q) || /\babout\b|\bon\b/i.test(q))) return { route: 'agentic', shape: 'ranking', rule: 'ranking' }
  return { route: 'ask', shape: null, rule: 'none' }
}

// ---------------------------------------------------------------- planner
export interface PlanStep { tool: string; args: Record<string, unknown>; label?: string }
export interface Plan { shape: Shape | 'unanswerable'; steps: PlanStep[]; reason?: string }
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

// ---------------------------------------------------------------- facts + composer
export interface Fact { id: number; text: string; cite: Cite }
/** One line per citable figure, numbered: the only numbers the composer may use. */
export function factSheet(results: ToolResult[]): { facts: Fact[]; notes: string[] } {
  const facts: Fact[] = []
  const notes = new Set<string>()
  const add = (text: string, cite: Cite) => facts.push({ id: facts.length + 1, text, cite })
  for (const r of results) {
    if (!r.ok) continue
    r.notes.forEach((n) => notes.add(n))
    const d = r.data as Record<string, unknown>
    if (r.tool === 'count_speeches') {
      const rows = (d.rows as { name: string; count: number }[] | undefined)
      if (rows?.length) rows.forEach((row, i) => add(`${row.name}: ${row.count} ${d.described}`, r.cite[i]))
      else if (d.unanswerable) notes.add('The record cannot rank these speeches by party.')
      else if (typeof d.total === 'number' && r.cite[0]) add(`${d.total} ${d.described}`, r.cite[0])
    } else if (r.tool === 'speech_trend') {
      ;(d.rows as { period: string; count: number; share: number; labelled: number }[]).forEach((row, i) =>
        add(`${row.period}: ${row.count} ${d.described}${row.labelled ? ` (${(row.share * 100).toFixed(1)}% of ${row.labelled} topic-labelled speeches)` : ''}`, r.cite[i]))
    } else if (r.tool === 'member_votes') {
      const s = d.summary as Record<string, number>
      const who = (d.person ?? d.party) as string
      const url = r.cite[0]?.url ?? ''
      if (d.person) add(`${who} voted in ${s.divisions} divisions with "${d.keyword}" in the title: aye ${s.aye}, no ${s.no}`, { kind: 'record', label: `Divisions with "${d.keyword}" in the title`, url })
      else add(`${who} in ${s.divisions} divisions with "${d.keyword}" in the title: all aye in ${s.all_aye}, all no in ${s.all_no}, split in ${s.split}`, { kind: 'record', label: `Divisions with "${d.keyword}" in the title`, url })
    } else if (r.tool === 'party_donations') {
      if (d.party) {
        ;(d.rows as { donor: string; total_aud: number }[]).forEach((row, i) => add(`${row.donor} gave ${d.party} $${row.total_aud.toLocaleString('en-AU')} (federal disclosures)`, r.cite[i + 1]))
        const hidden = d.donors_not_named as { label: string; total_aud: number; donors: number }
        if (hidden?.donors) notes.add(`${hidden.label} gave $${hidden.total_aud.toLocaleString('en-AU')} in total and are not listed by name.`)
      } else (d.rows as { party: string; total_aud: number }[]).forEach((row, i) => add(`${d.industry} donors gave ${row.party} $${row.total_aud.toLocaleString('en-AU')} (federal disclosures)`, r.cite[i]))
    } else if (r.tool === 'find_people') {
      const p = (d.people as { name: string; party: string | null }[])[0]
      if (p) add(`${p.name}: ${p.party ?? 'party not recorded'}`, r.cite[0])
    } else if (r.tool === 'find_quotes') {
      ;(d.passages as { title: string; text: string }[]).slice(0, 3).forEach((p, i) => add(`Passage from ${p.title}: "${p.text.slice(0, 400)}"`, r.cite[i]))
    }
  }
  return { facts, notes: [...notes] }
}
export function composerPrompt(question: string, facts: Fact[], notes: string[]): { system: string; user: string } {
  const body = [
    `Question: ${question}`,
    '',
    'FACTS (numbered; the only figures you may use, copied exactly):',
    ...facts.map((f) => `[${f.id}] ${f.text}`),
    '',
    'LIMITS (state the ones that bear on the answer, in plain words):',
    ...notes.map((n) => `- ${n}`),
    '',
    'Write the answer in 2 to 5 sentences. Open with the direct answer. Every sentence that contains a figure ends with the fact number(s) it uses in square brackets, like [1] or [2][3]. Use only figures from FACTS; never add, total, average or round them unless the fact states the result. Name people and parties exactly as the facts do. ' +
    'Never say a donation caused, bought or influenced a vote or speech; recorded money and recorded words sit side by side, nothing more. Do not open with "Based on" or mention facts, data or tools. No headings, bullet points or links.',
  ].join('\n')
  return {
    system: 'You write short, exact answers about the Australian parliamentary record from a numbered fact sheet.',
    // No {context}: the composer must see the fact sheet and nothing retrieved beside it.
    user: body.replace(/[{}]/g, (b) => (b === '{' ? '{{' : '}}')),
  }
}
const NUMBER_TOKENS = (value: string): string[] =>
  (value.match(/\$?\d[\d,]*(?:\.\d+)?%?/g) ?? []).map((t) => t.replace(/[$,%]/g, '').replace(/\.0+$/, ''))
const CAUSAL = /\b(?:bought|bribe\w*|in exchange for|because of (?:the|these|their) donations?|donations? (?:caused|influenced|explain\w*)|paid for (?:access|votes?|influence))\b/i
/**
 * Keep a model sentence only if every number in it is a fact figure and it
 * cites a fact whose text holds that number. Returns the kept prose and the
 * fact ids it cites.
 */
export function verifyComposition(text: string, facts: Fact[], question = ''): { prose: string; cited: number[]; dropped: number } {
  const byId = new Map(facts.map((f) => [f.id, f]))
  const allowedQuestion = new Set(NUMBER_TOKENS(question))
  const sentences = String(text ?? '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?\]])\s+(?=[A-Z"'(])/)
  const kept: string[] = []; const cited = new Set<number>(); let dropped = 0
  for (const s of sentences) {
    if (!s.trim()) continue
    if (CAUSAL.test(s) || /^based on\b/i.test(s)) { dropped++; continue }
    const refs = [...s.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])).filter((n) => byId.has(n))
    const nums = NUMBER_TOKENS(s.replace(/\[\d+\]/g, '')).filter((n) => !allowedQuestion.has(n) && !/^(?:19|20)\d\d$/.test(n))
    const factNums = new Set(refs.flatMap((r) => NUMBER_TOKENS(byId.get(r)!.text)))
    if (nums.length && (!refs.length || nums.some((n) => !factNums.has(n)))) { dropped++; continue }
    refs.forEach((r) => cited.add(r))
    kept.push(s.trim())
  }
  return { prose: kept.join(' '), cited: [...cited], dropped }
}
/** The deterministic answer: used when the model is unavailable or its prose fails the checks. */
export function templateAnswer(facts: Fact[], notes: string[]): string {
  const lines = facts.slice(0, 8).map((f) => `${f.text} [${f.id}]`)
  return [lines.join('; ') + '.', ...notes.slice(0, 2)].join(' ')
}

// ---------------------------------------------------------------- orchestration
export type Progress = (event: string, data: unknown) => Promise<void>
export interface AgenticDeps extends ToolDeps {
  /** One model call on the KB's openai-compatible slot; resolves the answer text. */
  generate: (query: string, prompt: { system: string; user: string }, maxTokens: number, signal: AbortSignal) => Promise<{ text: string; tokens?: { input: number; output: number } }>
}
export interface AgenticPayload {
  answered: boolean
  reason?: 'declined' | 'no_supported_claim' | 'grounding_failed' | 'over_budget'
  answer: string
  answer_source: 'model' | 'template' | 'none'
  shape: Plan['shape'] | null
  facts: { id: number; text: string; url: string; kind: string; value?: number | string }[]
  notes: string[]
  steps: { tool: string; args: unknown; ok: boolean; error?: string; ms?: number; label?: string }[]
  timings: { plan_ms: number; tools_ms: number; compose_ms: number; total_ms: number }
  tokens: { input: number; output: number }
  version: string
}
const stepLabel = (s: PlanStep) => s.label ?? ({
  count_speeches: 'Counting speeches', speech_trend: 'Counting speeches over time', find_people: 'Looking up the member',
  member_votes: 'Reading the division records', party_donations: 'Reading the donation returns', find_quotes: 'Finding passages to cite',
} as Record<string, string>)[s.tool] ?? 'Checking the record'

export async function runAgentic(question: string, deps: AgenticDeps, progress: Progress = async () => {}, budgetMs = AGENTIC_BUDGET_MS): Promise<AgenticPayload> {
  const t0 = Date.now()
  const deadline = t0 + budgetMs
  const tokens = { input: 0, output: 0 }
  const left = () => Math.max(0, deadline - Date.now())
  const timings = { plan_ms: 0, tools_ms: 0, compose_ms: 0, total_ms: 0 }
  const base = (over: Partial<AgenticPayload>): AgenticPayload => ({
    answered: false, answer: '', answer_source: 'none', shape: null, facts: [], notes: [], steps: [], tokens, version: `${AGENTIC_PROMPT_VERSION}/${AGENTIC_TOOLS_VERSION}`,
    ...over, timings: { ...timings, total_ms: Date.now() - t0 },
  })
  await progress('status', { phase: 'planning' })
  let plan: Plan | null = null
  try {
    const out = await deps.generate(question, plannerPrompt(), 700, AbortSignal.timeout(Math.min(15_000, left())))
    if (out.tokens) { tokens.input += out.tokens.input; tokens.output += out.tokens.output }
    plan = parsePlan(out.text)
  } catch { plan = null }
  timings.plan_ms = Date.now() - t0
  if (!plan) return base({ reason: 'declined' })
  if (plan.shape === 'unanswerable') return base({ reason: 'declined', shape: plan.shape, notes: plan.reason ? [plan.reason] : [] })
  await progress('status', { phase: 'plan', steps: plan.steps.map((s, i) => ({ id: i + 1, tool: s.tool, label: stepLabel(s) })) })
  const results: ToolResult[] = []
  const steps: AgenticPayload['steps'] = []
  const tTools = Date.now()
  for (const [i, step] of plan.steps.entries()) {
    if (left() < 8_000) break // keep room to write
    const args = resolveArgs(step.args, results)
    await progress('status', { phase: 'step', step: { id: i + 1, tool: step.tool, label: stepLabel(step), state: 'running' } })
    const r = args ? await runTool(deps, step.tool, args) : { tool: step.tool, ok: false, error: 'an earlier step returned nothing to use', cite: [], notes: [] } as ToolResult
    results.push(r)
    steps.push({ tool: step.tool, args: args ?? step.args, ok: r.ok, error: r.error, ms: r.ms, label: stepLabel(step) })
    await progress('status', { phase: 'step', step: { id: i + 1, tool: step.tool, label: stepLabel(step), state: r.ok ? 'done' : 'error', ms: r.ms } })
  }
  timings.tools_ms = Date.now() - tTools
  const { facts, notes } = factSheet(results)
  const factOut = facts.map((f) => ({ id: f.id, text: f.text, url: f.cite?.url ?? '', kind: f.cite?.kind ?? 'count', value: f.cite?.value }))
  if (!facts.length) return base({ reason: 'no_supported_claim', shape: plan.shape, notes, steps })
  await progress('status', { phase: 'writing' })
  const tCompose = Date.now()
  let answer = '', source: AgenticPayload['answer_source'] = 'template', cited: number[] = []
  if (left() > 5_000) {
    try {
      const out = await deps.generate(question, composerPrompt(question, facts, notes), 600, AbortSignal.timeout(Math.min(20_000, left())))
      if (out.tokens) { tokens.input += out.tokens.input; tokens.output += out.tokens.output }
      const v = verifyComposition(out.text, facts, question)
      if (v.prose && v.cited.length) { answer = v.prose; cited = v.cited; source = 'model' }
    } catch { /* template below */ }
  }
  if (!answer) { answer = templateAnswer(facts, notes); cited = facts.slice(0, 8).map((f) => f.id) }
  timings.compose_ms = Date.now() - tCompose
  return base({ answered: true, answer, answer_source: source, shape: plan.shape, facts: factOut.filter((f) => cited.includes(f.id) || source === 'template'), notes, steps })
}

/** Cache key: the normalised question, the corpus epoch, the model pin and the pipeline versions. */
export async function agenticCacheKey(question: string, epoch: string, model: string): Promise<string> {
  const norm = question.normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim()
  const data = new TextEncoder().encode(JSON.stringify({ q: norm, epoch, model, v: AGENTIC_PROMPT_VERSION, t: AGENTIC_TOOLS_VERSION }))
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `https://cache.opax.internal/ask-agentic/${hash}`
}
