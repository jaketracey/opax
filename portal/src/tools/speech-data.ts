import {donorAssociatedTo,donorDisclosure,otherReceiptsLine,publicFundingLine,receiptFigures,receiptGraph,receiptGraphScope,receiptSplit,returnReference,type DonorDisclosureRecord,type ReceiptSplit} from '../../public/donor-disclosure.js'
/**
 * Structured tools for Ask (docs/design/agentic-ask-2026-10.md).
 *
 * Every number these tools return comes from an index count or a published
 * export, never from a model:
 *  - speech counts: KB /catalog facets, which count every matching resource
 *    (checked 2026-10-12: the /u/o facet value equals the filtered catalog total
 *    for each speaker tried). Exact date windows use /search fulltext totals
 *    restricted to the speech body field, one row per speech. /search FACETS are
 *    never used for counts: they disagree with the totals on the same filter.
 *  - votes: portal/public/divisions/<slug>.json, found by KB title search.
 *  - money: published disclosure names and return references; only confident
 *    identity matches carry a profile link.
 * Each result carries `cite` (what a reader can open to check it), `query` (the
 * exact request) and `notes` (coverage limits the answer has to state).
 *
 * Used by the Worker orchestration (src/agentic-ask.ts). Design (ii) remains
 * parked in the design note. Structured-data modules are shared with MCP through the tools registry. No models.
 */
import type { ToolDeps, ToolResult, Cite, Json, ToolSpec } from '../agentic-tool-types'
import { readToolAsset, type ToolDefinition, type ToolEnv, type StructuredToolResult } from './types'
import { receiptYearWindow } from '../receipt-period'
import { lendingLines } from './declared-debts'
import { industryModifier } from '../receipt-copy'
import { resolvePersonName } from '../person-name-matching'
import { tool as memberDivisionTool } from './member-divisions'
import { tool as divisionTool } from './division'
import { tool as corpusTool } from './corpus-records'
import { validWindow } from './published-records'
import { personService } from '../person-service'
import { countedMember, type CountedMember } from '../ask-member-label'

export const TOPICS = [
  'gambling', 'financial-services', 'mining-energy', 'climate-environment', 'property-construction', 'housing', 'health',
  'media-communications', 'hospitality-alcohol', 'defence-security', 'agriculture', 'unions-workplace', 'immigration',
  'indigenous-affairs', 'tax-budget', 'education', 'welfare-social', 'integrity-democracy', 'infrastructure-transport',
  'justice-law', 'foreign-affairs',
] as const
export const STATES = ['federal', 'nsw', 'vic', 'sa', 'qld', 'act'] as const
export const CHAMBERS = ['representatives', 'federation', 'senate', 'nsw_la', 'nsw_lc', 'vic_la', 'vic_lc', 'sa_ha', 'sa_lc', 'qld_la', 'act_la'] as const
const COMMITTEES = ['senate_committee', 'joint_committee', 'house_committee']
// Labels written by the sync only on federal and (partly) Queensland speeches.
const PARTY_LABELLED_STATES = new Set(['federal', 'qld'])
import { TERMS } from '../ask-period'
export { TERMS } from '../ask-period'

// ---------------------------------------------------------------- filters
const label = (labelset: string, l: string) => ({ prop: 'label', labelset, label: l })
const SPEECH = label('kind', 'speech')
const NOT_WITNESS = { not: label('speaker_type', 'witness') }
const BODY = { prop: 'field', type: 'text', name: 'body' }
const CHAMBER_ONLY = { not: { or: COMMITTEES.map((c) => label('chamber', c)) } }
const COMMITTEE_ONLY = { or: COMMITTEES.map((c) => label('chamber', c)) }
const and = (c: unknown[]) => (c.length === 1 ? c[0] : { and: c })
const created = (since?: string | null, until?: string | null) => ({
  prop: 'created', ...(since ? { since: `${since}T00:00:00Z` } : {}), ...(until ? { until: `${until}T23:59:59Z` } : {}),
})
const U_O = '/u/o' // origin collaborators; the public alias /origin.collaborators facets nothing
const PARTY = '/classification.labels/party'
const DECADE = '/classification.labels/decade'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface SpeechFilter {
  topic?: string | null
  speaker?: string | null
  party?: string | null
  state?: string | null
  chamber?: string | null
  /** 'chamber' (default): chamber speeches; 'committee': committee-hearing turns; 'all': both. */
  venue?: 'chamber' | 'committee' | 'all' | null
  since?: string | null
  until?: string | null
  term?: string | null
}

function clean(f: SpeechFilter): { f: SpeechFilter; problems: string[] } {
  const problems: string[] = []
  const out: SpeechFilter = { venue: f.venue === 'committee' || f.venue === 'all' ? f.venue : 'chamber' }
  if (f.topic) { if ((TOPICS as readonly string[]).includes(f.topic)) out.topic = f.topic; else problems.push(`unknown topic "${f.topic}"; use one of ${TOPICS.join(', ')}`) }
  if (f.state) { if ((STATES as readonly string[]).includes(f.state)) out.state = f.state; else problems.push(`unknown state "${f.state}"`) }
  if (f.chamber) { if ((CHAMBERS as readonly string[]).includes(f.chamber)) out.chamber = f.chamber; else problems.push(`unknown chamber "${f.chamber}"`) }
  if (f.speaker) out.speaker = String(f.speaker).trim().replace(/\s+/g, ' ').slice(0, 120)
  if (f.party) out.party = String(f.party).trim().slice(0, 64)
  if (f.term) { const t = TERMS[f.term]; if (t) { out.since = t[0]; out.until = t[1] } else problems.push(`unknown term "${f.term}"`) }
  if (f.since) { if (DATE_RE.test(f.since)) out.since = f.since; else problems.push('since must be YYYY-MM-DD') }
  if (f.until) { if (DATE_RE.test(f.until)) out.until = f.until; else problems.push('until must be YYYY-MM-DD') }
  return { f: out, problems }
}
function clauses(f: SpeechFilter, members = true): unknown[] {
  const c: unknown[] = [SPEECH]
  if (members) c.push(NOT_WITNESS)
  c.push(f.venue === 'committee' ? COMMITTEE_ONLY : f.venue === 'all' ? null : CHAMBER_ONLY)
  if (f.topic) c.push(label('topic', f.topic))
  if (f.state) c.push(label('state', f.state))
  if (f.chamber) c.push(f.chamber === 'representatives'
    ? { or: ['representatives', 'federation'].map(c => label('chamber', c)) }
    : label('chamber', f.chamber))
  if (f.party) c.push(label('party', f.party))
  if (f.speaker) c.push({ prop: 'origin_collaborator', collaborator: f.speaker })
  return c.filter(Boolean)
}
const windowed = (f: SpeechFilter) => Boolean(f.since || f.until)
function decadesFor(since?: string | null, until?: string | null): string[] {
  const a = Number((since ?? '1990').slice(0, 3)), b = Number((until ?? '2029').slice(0, 3))
  return Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => `${a + i}0s`).filter((d) => d >= '1990s' && d <= '2020s')
}
const decadeClause = (f: SpeechFilter) => {
  const d = decadesFor(f.since, f.until)
  return d.length === 1 ? label('decade', d[0]) : { or: d.map((x) => label('decade', x)) }
}

function describe(f: SpeechFilter): string {
  const bits = [
    f.venue === 'committee' ? 'committee-hearing turns' : f.venue === 'all' ? 'speeches and committee turns' : 'chamber speeches',
    f.topic ? `labelled ${f.topic}` : '',
    f.speaker ? `by ${f.speaker}` : '',
    f.party ? `recorded under ${f.party}` : '',
    f.state ? `in ${f.state === 'federal' ? 'federal parliament' : f.state.toUpperCase()}` : '',
    f.chamber ? `(${f.chamber})` : '',
    f.since || f.until ? `${f.since ? `from ${f.since}` : ''}${f.until ? ` to ${f.until}` : ''}` : '',
  ]
  return bits.filter(Boolean).join(' ')
}
function searchUrl(origin: string, f: SpeechFilter): string {
  const p = new URLSearchParams({ kind: 'speech' })
  if (f.topic) p.set('topic', f.topic)
  if (f.speaker) p.set('speaker', f.speaker)
  if (f.party) p.set('party', f.party)
  if (f.state) p.set('state', f.state)
  if (f.chamber) p.set('chamber', f.chamber)
  if (f.since) p.set('since', f.since)
  if (f.until) p.set('until', f.until)
  p.set('venue', f.venue ?? 'chamber')
  // A citation opens all records in the counted scope, without adding a
  // second lexical topic constraint. Existing scoped speech search uses '*'.
  p.set('q', '*')
  p.set('mode', 'keyword')
  return `${origin}/search?${p}`
}

async function catalog(deps: ToolDeps, c: unknown[], faceted: string[] = []) {
  const body = { filter_expression: { resource: and(c) }, page_size: 0, ...(faceted.length ? { faceted } : {}) }
  const d = await deps.kb('/catalog', body) as { fulltext?: { total?: number; facets?: Record<string, Record<string, number>> } }
  if (!Number.isSafeInteger(d.fulltext?.total) || Number(d.fulltext?.total) < 0) throw new Error('catalog count unavailable')
  for (const values of Object.values(d.fulltext?.facets ?? {})) if (Object.values(values).some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error('facet counts unavailable')
  return { total: d.fulltext!.total!, facets: d.fulltext?.facets ?? {}, body }
}
async function searchTotal(deps: ToolDeps, c: unknown[]) {
  const body = { query: '', features: ['fulltext'], top_k: 1, filter_expression: { field: and([...c, BODY]) } }
  const d = await deps.kb('/search', body) as { fulltext?: { total?: number } }
  if (!Number.isSafeInteger(d.fulltext?.total) || Number(d.fulltext?.total) < 0) throw new Error('window count unavailable')
  return d.fulltext!.total!
}
/** Exact count for any filter: catalog when there is no date window, body-only /search totals when there is. */
async function countOne(deps: ToolDeps, f: SpeechFilter, members = true): Promise<number> {
  if (windowed(f)) return searchTotal(deps, [...clauses(f, members), created(f.since, f.until)])
  return (await catalog(deps, clauses(f, members))).total
}
const facetRows = (facet: Record<string, number> | undefined, prefix: string) => Object.entries(facet ?? {})
  .map(([k, n]) => ({ name: k.slice(prefix.length + 1), count: n }))
  .filter((r) => r.name)
  .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  // Workers allow six open upstream connections; four leaves room for the caller.
  const out = new Array<R>(items.length); let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } }))
  return out
}
function coverageNotes(f: SpeechFilter, groupBy?: string): string[] {
  const notes: string[] = []
  if (f.topic) notes.push('Topic counts cover labelled speeches, about 73% of the record: 89% of the 2020s, 91% of the 2010s, 63% of the 2000s and 22% of the 1990s, so older years are undercounted.')
  const fedWindow = (!f.state || f.state === 'federal') && (f.since ?? '0000') <= '2025-06-30' && (f.until ?? '9999') >= '2022-07-01'
  if (fedWindow) notes.push('The federal Hansard gap in 2023–24, within the thin mid-2022 to mid-2025 coverage, understates speeches in that period.')
  if (groupBy === 'party' && f.state && !PARTY_LABELLED_STATES.has(f.state)) notes.push(`Speeches from ${f.state.toUpperCase()} carry no party label in the record, so they cannot be counted by party.`)
  if (groupBy === 'party' && !f.state) notes.push('Only federal and some Queensland speeches carry a party label; state speeches are not counted by party.')
  if (groupBy === 'party' && f.state === 'qld') notes.push('Only about 27% of Queensland speeches carry a party label, so this party comparison is incomplete.')
  if (f.venue !== 'committee') notes.push('Counts are chamber speeches; committee-hearing turns are separate records and are not included.')
  if (groupBy === 'speaker') notes.push('Some state members are recorded by surname only, and some federal debate records group several speakers under one name.')
  return notes
}

// ---------------------------------------------------------------- count_speeches
/** At most this many window candidates are counted to prove a date-window ranking (about 3 s of totals at 4 at a time). */
const WINDOW_CANDIDATE_CAP = 120
export interface CountInput extends SpeechFilter { group_by?: 'speaker' | 'party' | 'none'; limit?: number }
export async function countSpeeches(deps: ToolDeps, input: CountInput): Promise<ToolResult> {
  const origin = deps.origin ?? 'https://opax.com.au'
  const { f, problems } = clean(input)
  if (problems.length) return { tool: 'count_speeches', ok: false, error: problems.join('; '), cite: [], notes: [] }
  const group = input.group_by === 'speaker' || input.group_by === 'party' ? input.group_by : 'none'
  const limit = Math.min(Math.max(Number(input.limit) || 5, 1), 15)
  const notes = coverageNotes(f, group)
  if (group === 'none') {
    const total = await countOne(deps, f)
    return { tool: 'count_speeches', ok: true, data: { total, filter: f, described: describe(f) }, cite: [{ kind: 'count', label: `${describe(f)}`, value: total, url: searchUrl(origin, f) }], query: { method: windowed(f) ? 'search-total' : 'catalog-total', filter: f }, notes }
  }
  if (group === 'party' && f.state && !PARTY_LABELLED_STATES.has(f.state)) {
    return { tool: 'count_speeches', ok: true, data: { total: await countOne(deps, f), rows: [], filter: f, described: describe(f), unanswerable: 'no_party_labels' }, cite: [], notes }
  }
  const facet = group === 'speaker' ? U_O : PARTY
  const base = clauses(f)
  let rows: { name: string; count: number }[]
  let exact = true
  let method: string
  if (!windowed(f)) {
    const c = await catalog(deps, base, [facet])
    rows = facetRows(c.facets[facet], facet)
    method = `catalog facet ${facet === U_O ? 'by speaker' : 'by party'} over every matching speech`
  } else {
    // Candidates from the decade facet, exact window counts per candidate.
    // A decade count bounds a window count from above, so the ranking is proven once the last listed row is at least
    // the next unchecked candidate's decade count. Count further candidates in batches until it is, up to a cap.
    let k = group === 'speaker' ? 30 : 20
    const c = await catalog(deps, [...base, decadeClause(f)], [facet])
    const cands = facetRows(c.facets[facet], facet)
    const count = (from: number, to: number) => pool(cands.slice(from, to), 4, async (r) => ({
      name: r.name,
      count: await countOne(deps, { ...f, ...(group === 'speaker' ? { speaker: r.name } : { party: r.name }) }),
    }))
    rows = await count(0, k)
    rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    while (k < Math.min(cands.length, WINDOW_CANDIDATE_CAP) && (rows[limit - 1]?.count ?? 0) < (cands[k]?.count ?? 0)) {
      const next = Math.min(cands.length, WINDOW_CANDIDATE_CAP, k + 30)
      rows.push(...await count(k, next)); k = next
      rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    }
    exact = (rows[limit - 1]?.count ?? 0) >= (cands[k]?.count ?? 0)
    method = `exact window counts for the top ${k} ${group === 'speaker' ? 'speakers' : 'parties'} by decade`
  }
  const total = await countOne(deps, f)
  const top: { name: string; count: number; member?: CountedMember }[] = rows.filter((r) => r.count > 0).slice(0, limit)
  if (group === 'speaker') {
    const roster = await deps.asset('/parliamentarians.json').catch(() => null)
    for (const row of top) {
      const member = countedMember(row.name, roster, f.chamber)
      if (member) row.member = member
    }
  }
  if (!exact) notes.push('The date-window candidate bound does not prove the complete ranking; these are counts for the leading decade candidates.')
  const cite: Cite[] = top.map((r) => ({
    kind: 'count', label: `${describe({ ...f, ...(group === 'speaker' ? { speaker: r.name } : { party: r.name }) })}`, value: r.count,
    url: searchUrl(origin, { ...f, ...(group === 'speaker' ? { speaker: r.name } : { party: r.name }) }),
  }))
  return {
    tool: 'count_speeches', ok: true,
    data: { total, rows: top, group_by: group, more: Math.max(0, rows.length - top.length), exact, method, filter: f, described: describe(f) },
    cite, query: { method, filter: f }, notes,
  }
}

// ---------------------------------------------------------------- speech_trend
export interface TrendInput extends SpeechFilter { by?: 'year' | 'decade' | 'term'; from_year?: number; to_year?: number }
export async function speechTrend(deps: ToolDeps, input: TrendInput): Promise<ToolResult> {
  const origin = deps.origin ?? 'https://opax.com.au'
  const { f, problems } = clean(input)
  if (problems.length) return { tool: 'speech_trend', ok: false, error: problems.join('; '), cite: [], notes: [] }
  const by = input.by === 'decade' || input.by === 'term' ? input.by : 'year'
  let buckets: { period: string; since: string | null; until: string | null }[]
  if (by === 'decade') buckets = ['1990s', '2000s', '2010s', '2020s'].map((d) => ({ period: d, since: `${d.slice(0, 4)}-01-01`, until: `${Number(d.slice(0, 4)) + 9}-12-31` }))
  else if (by === 'term') buckets = Object.entries(TERMS).map(([k, [a, b]]) => ({ period: `${k} Parliament`, since: a, until: b }))
  else {
    const from = Math.max(1993, Math.min(2026, Number(input.from_year) || 2015)), to = Math.max(from, Math.min(2026, Number(input.to_year) || 2026))
    if (to - from > 33) return { tool: 'speech_trend', ok: false, error: 'at most 34 years', cite: [], notes: [] }
    buckets = Array.from({ length: to - from + 1 }, (_, i) => ({ period: String(from + i), since: `${from + i}-01-01`, until: `${from + i}-12-31` }))
  }
  buckets = buckets.filter(b => (!f.since || !b.until || b.until >= f.since) && (!f.until || !b.since || b.since <= f.until))
    .map(b => ({ ...b, since: f.since && (!b.since || f.since > b.since) ? f.since : b.since, until: f.until && (!b.until || f.until < b.until) ? f.until : b.until }))
  const labelled = { ...f, topic: null }
  let rows: { period: string; count: number; labelled: number; share: number }[]
  if (by === 'decade' && !windowed(f)) {
    const [c, l] = await Promise.all([
      catalog(deps, clauses(f), [DECADE]),
      catalog(deps, [...clauses(labelled), { prop: 'label', labelset: 'topic' }], [DECADE]),
    ])
    rows = buckets.map((b) => {
      const n = c.facets[DECADE]?.[`${DECADE}/${b.period}`] ?? 0, d = l.facets[DECADE]?.[`${DECADE}/${b.period}`] ?? 0
      return { period: b.period, count: n, labelled: d, share: d ? +(n / d).toFixed(4) : 0 }
    })
  } else {
    rows = await pool(buckets, 4, async (b) => {
      const w = { ...f, since: b.since, until: b.until }
      const [n, d] = await Promise.all([
        searchTotal(deps, [...clauses(w), created(b.since, b.until)]),
        f.topic ? searchTotal(deps, [...clauses({ ...w, topic: null }), { prop: 'label', labelset: 'topic' }, created(b.since, b.until)]) : Promise.resolve(0),
      ])
      return { period: b.period, count: n, labelled: d, share: d ? +(n / d).toFixed(4) : 0 }
    })
  }
  const notes = coverageNotes({ ...f, since: buckets[0]?.since ?? '1993-01-01', until: buckets.at(-1)?.until ?? null })
  notes.push('Share is the topic count over all topic-labelled speeches in the same period and place; it corrects for uneven coverage between periods.')
  const cite: Cite[] = rows.map((r, i) => ({ kind: 'count', label: `${describe(f)} in ${r.period}`, value: r.count, url: searchUrl(origin, { ...f, since: buckets[i].since, until: buckets[i].until }) }))
  return { tool: 'speech_trend', ok: true, data: { by, rows, filter: f, described: describe(f) }, cite, query: { by, filter: f }, notes }
}

// ---------------------------------------------------------------- find_people
interface Person { name: string; speeches: number | null; roster_only?: boolean; party?: string; party_now?: string; states?: string[]; chambers?: string[]; first?: number; last?: number; pid?: string; current?: boolean; representation?: { electorate: string; jurisdiction: string; chamber: string; state?: string | null }[] }
const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[‘’ʼ`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim()
export async function findPeople(deps: ToolDeps, input: { name: string; limit?: number }): Promise<ToolResult> {
  const origin = deps.origin ?? 'https://opax.com.au'
  const name = String(input.name ?? '').trim()
  if (name.length < 2) return { tool: 'find_people', ok: false, error: 'name is required', cite: [], notes: [] }
  const data = await deps.asset('/parliamentarians.json') as { people?: Person[] } | null
  if (!Array.isArray(data?.people)) return { tool: 'find_people', ok: false, error: 'The parliamentary roster is unavailable.', cite: [], notes: [] }
  const resolution = resolvePersonName(name, data.people)
  const limit = Math.max(resolution.status === 'ambiguous' ? 2 : 1, Math.min(Math.floor(Number(input.limit)) || 5, 10))
  const candidates = resolution.candidates.slice(0, limit).map(({ person: p, confidence }) => ({ name: p.name, confidence, party: p.party_now ?? p.party ?? null, states: p.states ?? [], chambers: p.chambers ?? [], years: [p.first ?? null, p.last ?? null], current: p.current ?? null, speeches_indexed: p.roster_only ? null : p.speeches, representation: p.representation ?? [] }))
  // Existing callers use people[0] in subsequent filters. Only put a resolved
  // identity there, so an ambiguous lookup cannot silently select a stranger.
  const hits = resolution.status === 'matched' ? candidates.slice(0, 1) : []
  const resolved = resolution.status === 'matched' ? resolution.candidates[0].person : undefined
  // Keep the source ID for service joins and every chamber recorded by aliases of that identity.
  const service = await personService(deps, resolved ? [{ ...resolved, chambers: [...new Set(data.people
    .filter(p => p === resolved || resolved.pid && p.pid === resolved.pid).flatMap(p => p.chambers ?? []))] }] : [])
  const enriched = hits.map((person, i) => ({ ...person, service: service[i] }))
  const tied = candidates.filter(candidate => candidate.confidence === candidates[0]?.confidence)
  const clarification = resolution.status === 'ambiguous' ? `Which person do you mean: ${tied.map(p => `${p.name}${p.states.length ? ` (${p.states.join(', ')})` : ''}`).join(' or ')}?` : undefined
  return {
    tool: 'find_people', ok: true, data: { people: enriched, candidates, match_status: resolution.status, ...(clarification ? { clarification } : {}) }, query: { name },
    cite: hits.map((h) => ({ kind: 'record' as const, label: h.name, url: `${origin}/subject/person/${encodeURIComponent(h.name)}` })),
    notes: hits.length ? resolved?.roster_only ? ['Recorded parliamentary service identifies this person; no speech total is published for this profile.'] : ['Use the name exactly as returned in speaker filters: it is the name the record indexes speeches under.']
      : clarification ? ['Multiple real people match equally. Ask the clarification question before using a person in another tool.']
      : [`OPAX has no record of a parliamentarian named "${name}" in this roster. Do not substitute someone who matches only part of the supplied name.`],
  }
}

// ---------------------------------------------------------------- member_votes
/** Compatibility entry point. The authoritative archive readers also serve MCP. */
export async function memberVotes(deps: ToolDeps, input: { keyword: string; person?: string | null; party?: string | null; limit?: number; since?: string; until?: string }): Promise<ToolResult> {
  const env = { ...deps.toolEnv, asset: deps.asset, kb: deps.kb, origin: deps.origin, signal: deps.signal }
  const window = { ...(input.since ? { since: input.since } : {}), ...(input.until ? { until: input.until } : {}) }
  const data = input.person ? await memberDivisionTool.handler(env, { person: input.person, topic: input.keyword, ...window, limit: Math.min(input.limit ?? 8, 8) })
    : input.party ? await divisionTool.handler(env, { party: input.party, title: input.keyword, ...window, limit: Math.min(input.limit ?? 20, 20) })
    : { rows: [], citations: [], notes: [], error: 'person or party is required' }
  return { tool: 'member_votes', ok: !data.error, data: { ...data, keyword: input.keyword,
    ...(input.person && data.next_call ? { next_call: { tool: 'member_divisions', arguments: data.next_call } } : {}) }, cite: data.citations.map(c => ({ ...c, kind: c.kind ?? 'record', label: c.text })), notes: data.notes, ...(data.error ? { error: data.error } : {}) }
}

// ---------------------------------------------------------------- party_receipts
interface MoneyNode extends DonorDisclosureRecord { id: string; label: string; kind: string; industry?: string; aliases?: string[]; jurisdiction?: string; total?: number; byYear?: Record<string, [number, number]> }
interface MoneyEdge { source: string; target: string; total: number; count: number; byYear?: Record<string, [number, number]>; firstYear?: number; lastYear?: number; by_type?: Record<string, number>; by_type_year?: Record<string, Record<string, [number, number]>>; typeCells?: Record<string, Record<string, [number, number]>> | null; grant?: boolean; flow?: string }
interface MoneyGraph { nodes: MoneyNode[]; edges: MoneyEdge[] }
/** Each flow read through its typed cells (each receipt once, from the party's own return), as on the donor and party pages. */
async function money(deps: ToolDeps) {
  const raw = await deps.asset('/graph/money.json') as MoneyGraph | null
  const g = receiptGraph(raw)
  if (!raw || !g?.nodes) throw new Error('money graph unavailable')
  return { g, raw }
}
// Disclosure names remain visible independently of resolver confidence.
function sumYears(e: MoneyEdge, from?: number, to?: number): [number, number] {
  if (!from && !to) return [e.total, e.count]
  let t = 0, c = 0
  for (const [y, [v, n]] of Object.entries(e.byYear ?? {})) { const yr = Number(y); if ((!from || yr >= from) && (!to || yr <= to)) { t += v; c += n } }
  return [t, c]
}
/**
 * What a party_receipts row ranks (Jake's hub default, A34). "donations": the AEC's Donation
 * Received type only, for who gives, donates or funds; every other type is a labelled line
 * beside the ranking. "all_types": every receipt type, for money from, receipts and paid, with
 * each row's type breakdown. Public Funding is in neither: it is never a donor.
 */
export type ReceiptRankMeasure = 'donations' | 'all_types'
export const receiptRankMeasure = (value: unknown): ReceiptRankMeasure => value === 'all_types' ? 'all_types' : 'donations'
const round = (n: number) => Math.round(n * 100) / 100
const typeBreakdown = (s: ReceiptSplit) => ({ donations_aud: round(s.donations[0]), other_receipts_aud: round(s.other[0]), subscriptions_aud: round(s.subscriptions[0]), untyped_aud: round(s.untyped[0]) })
const fyLabel = (y: number) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`
export async function partyDonations(deps: ToolDeps, input: { party?: string | null; industry?: string | null; from_year?: number; to_year?: number; since?: string; until?: string; limit?: number; measure?: string | null; lending?: boolean | null }): Promise<ToolResult> {
  const origin = deps.origin ?? 'https://opax.com.au'
  const dated = !!(input.since || input.until), window = receiptYearWindow(input.since, input.until)
  if (window.error) {
    const coverage = { since: null, until: null, as_of: null, matched: false, requested_since: input.since, requested_until: input.until, note: window.error }
    return { tool: 'party_receipts', ok: true, data: { coverage, coverage_only: true }, coverage,
      cite: [{ kind: 'record', label: window.error, url: `${origin}/methods` }], notes: [window.error] }
  }
  const { g, raw } = await money(deps)
  // Without typed cells (a graph that predates receipt types) no figure can be split, so none is called donations.
  const typed = g.edges.some(e => e.typeCells)
  const measure: ReceiptRankMeasure | undefined = typed ? receiptRankMeasure(input.measure) : undefined
  const node = new Map(g.nodes.map((n) => [n.id, n]))
  const from = dated ? window.from_year : Number(input.from_year) || undefined, to = dated ? window.to_year : Number(input.to_year) || undefined
  // The receipts map filtered to this selection: /money/party/<party> was never a page.
  const mapUrl = (party?: string, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ jur: 'federal', type: 'receipts' })
    if (party) p.set('party', `party:${party}`)
    if (input.industry) p.set('industry', input.industry)
    if (from) p.set('from', String(from))
    if (to) p.set('to', String(to))
    for (const [k, v] of Object.entries(extra)) p.set(k, v)
    return `${origin}/money?${p}`
  }
  const limit = Math.min(Number(input.limit) || 5, 15)
  // A typed flow is split by AEC receipt type; a flow without typed cells (none on the federal graph) has no split and keeps its figure.
  const split = (e: MoneyEdge) => receiptSplit(e, from ?? null, to ?? null)
  const sized = (e: MoneyEdge): { v: [number, number]; s: ReceiptSplit | null } => {
    const s = split(e)
    if (!s) return { v: sumYears(e, from, to), s }
    return { v: measure === 'donations' ? s.donations : s.all, s }
  }
  const notes = ['Federal AEC disclosed receipts, financial years 1998-99 to 2025-26, in the published selection of the 250 largest donors (so totals are lower bounds).',
    measure === 'donations'
      ? 'Ranked by donations: receipts the party\'s return types as Donation Received. Other receipt types (other receipts, subscriptions and receipts with no type) are listed separately and are not called donations. OPAX does not match receipts to the debts a return declares, so no receipt is called a loan.'
      : !measure ? 'These totals cover every receipt type the records hold; this graph has no receipt-type breakdown.'
      : 'Ranked by all receipt types: donations, other receipts, subscriptions and receipts with no type. Each row gives its type breakdown; only Donation Received is a donation.',
    'Public funding is election funding, not a donation: it is never ranked as a donor.', 'Party-level totals in the published selection.']
  const scope = receiptGraphScope(g)
  if (scope) notes.push(`${scope}. Each receipt is counted once.`)
  const coverage = { since: `${Math.max(from ?? 1998, 1998)}-07-01`, until: `${Math.min(to ?? 2025, 2025) + 1}-06-30`, as_of: null,
    ...(input.since ? { requested_since: input.since } : {}), ...(input.until ? { requested_until: input.until } : {}), note: notes[0] }
  const measureLabel = measure === 'donations' ? 'donations' : 'receipts'
  // Public Funding on this party's returns, by payer: read from the raw cells, since no donor flow carries it.
  const publicFunding = (party: string) => raw.edges.flatMap(e => {
    if (e.grant || e.flow || e.target !== `party:${party}` || !e.by_type) return []
    const f = receiptFigures(e), years: number[] = []
    let amount = 0, receipts = 0
    for (const [slot, [d, n]] of Object.entries(f.publicFundingCells)) {
      const y = Number(slot)
      if ((from || to) && (!Number.isFinite(y) || from && y < from || to && y > to)) continue
      amount += d; receipts += n
      if (Number.isFinite(y)) years.push(y)
    }
    if (!receipts && !amount) return []
    const label = node.get(e.source)?.label ?? raw.nodes.find(n => n.id === e.source)?.label ?? e.source
    const period = years.length ? (Math.min(...years) === Math.max(...years) ? fyLabel(years[0]) : `${fyLabel(Math.min(...years))} to ${fyLabel(Math.max(...years))}`) : ''
    return [{ source: label, amount_aud: round(amount), receipts, period }]
  }).sort((a, b) => b.amount_aud - a.amount_aud)
  if (input.party) {
    const pid = `party:${input.party}`
    if (!node.has(pid)) return { tool: 'party_receipts', ok: false, error: `no party "${input.party}" in the money record; parties: ${g.nodes.filter((n) => n.kind === 'party').map((n) => n.label).join(', ')}`, cite: [], notes }
    const edges = g.edges.filter((e) => e.target === pid && node.get(e.source)?.kind === 'donor' && (!input.industry || node.get(e.source)?.industry === input.industry))
    const measured = edges.map((e) => ({ e, ...sized(e) }))
    const ranked = measured.filter((x) => x.v[0] > 0).sort((a,b)=>b.v[0]-a.v[0])
    const reference = (donor: MoneyNode) => (donor.returnReferences || []).find(ref=>(!from || Number(String(ref.year).slice(0,4))>=from) && (!to || Number(String(ref.year).slice(0,4))<=to))
    const rows = ranked.slice(0,limit).map(({e,v,s})=>{
      const donor=node.get(e.source)!,view=donorDisclosure(donor),ref=reference(donor)
      // An AEC associated entity of this party keeps its rank and carries the register's line (export rule 9).
      const associated=donorAssociatedTo(donor,input.party!)
      return {donor:view.name,...(associated?{associated_entity:associated}:{}),href:view.href,id:e.source,return_reference:ref ? returnReference(ref) : view.reference,industry:donor.industry ?? null,total_aud:v[0],receipts:v[1],
        ...(measure === 'all_types' && s ? { by_type: typeBreakdown(s) } : {})}
    })
    // Donations ranking: the sources an all-types ranking would have shown, with what they gave the
    // party that the AEC does not class as donations, each as its own labelled line.
    const ranks = new Set(rows.map(r => r.id))
    // The window asked for, or with none the years of the receipts the line describes.
    const span = (a: number, b: number) => a === b ? `financial year ${fyLabel(a)}` : `financial years ${fyLabel(a)} to ${fyLabel(b)}`
    const linePeriod = (s: ReceiptSplit) => from || to ? span(from ?? 1998, to ?? 2024) : s.otherYears[0] != null ? span(s.otherYears[0], s.otherYears[1]!) : ''
    const other = measure !== 'donations' ? [] : measured.filter(x => x.s && x.s.all[0] > 0).sort((a, b) => b.s!.all[0] - a.s!.all[0]).slice(0, limit)
      .filter(x => x.s!.all[0] - x.s!.donations[0] > 0).map(({ e, s }) => {
        const view = donorDisclosure(node.get(e.source)!)
        return { donor: view.name, href: view.href, id: e.source, other_receipts_aud: round(s!.other[0]), subscriptions_aud: round(s!.subscriptions[0]), untyped_aud: round(s!.untyped[0]),
          receipts: s!.other[1] + s!.subscriptions[1] + s!.untyped[1], in_ranking: ranks.has(e.source), line: otherReceiptsLine(view.name, input.party!, s, { also: ranks.has(e.source), period: linePeriod(s!) }) }
      })
    const pf = publicFunding(input.party)
    // A lending question: no receipt is a loan; the party's declared debts follow as their own lines.
    const lending = input.lending === true ? await lendingLines(deps.asset, input.party, origin) : []
    return {
      tool: 'party_receipts', ok: true,
      data: {party:input.party,industry:input.industry ?? null,years:[from ?? null,to ?? null],measure,rows:rows.map(({id:_id,...row})=>row),
        ...(other.length ? { other_receipts: other.map(({ id: _id, ...row }) => row) } : {}),
        ...(pf.length ? { public_funding: pf } : {}), ...(lending.length ? { lending: lending.map(l => l.label) } : {}), coverage},
      // A source with no public donor page opens the same map focused on it, never the AEC home page.
      cite: [{kind:'export',label:`Disclosed ${measureLabel} to ${input.party} (AEC returns)`,url:mapUrl(input.party, measure === 'donations' ? { receipt: 'donations' } : {})},
        ...rows.map(r=>({kind:'export' as const,label:`${r.donor}${r.associated_entity ? ` (${r.associated_entity})` : ''} to ${input.party} — ${r.return_reference}`,value:r.total_aud,url:r.href ? new URL(r.href,origin).href : mapUrl(input.party!,{focus:r.id})})),
        ...other.map(r=>({kind:'export' as const,label:r.line,value:round(r.other_receipts_aud+r.subscriptions_aud+r.untyped_aud),url:mapUrl(input.party!,{focus:r.id})})),
        ...pf.map(p=>({kind:'export' as const,label:publicFundingLine(p.source,input.party!,p.amount_aud,p.period),value:p.amount_aud,url:mapUrl(input.party!)})),
        ...lending.map(l=>({kind:'record' as const,label:l.label,...(l.value ? {value:l.value} : {}),url:l.url}))],
      list: mapUrl(input.party, measure === 'donations' ? { receipt: 'donations' } : {}),
      query: { file: '/graph/money.json', party: input.party, industry: input.industry ?? null, from, to, measure }, notes,
    }
  }
  if (input.industry) {
    const sums = new Map<string, [number, number]>()
    // Per party, the industry's receipts the AEC does not class as donations (for a donations ranking's lines).
    const rest = new Map<string, { other: [number, number]; subscriptions: [number, number]; untyped: [number, number]; years: number[] }>()
    const add = (a: [number, number], b: [number, number]) => { a[0] += b[0]; a[1] += b[1] }
    for (const e of g.edges) {
      const d = node.get(e.source)
      if (d?.kind !== 'donor' || d.industry !== input.industry || !e.target.startsWith('party:')) continue
      const { v, s: sp } = sized(e), p = e.target.slice(6), s = sums.get(p) ?? [0, 0]
      sums.set(p, [s[0] + v[0], s[1] + v[1]])
      if (measure === 'donations' && sp) {
        const r = rest.get(p) ?? { other: [0, 0], subscriptions: [0, 0], untyped: [0, 0], years: [] }
        add(r.other, sp.other); add(r.subscriptions, sp.subscriptions); add(r.untyped, sp.untyped)
        for (const y of sp.otherYears) if (y != null) r.years.push(y)
        rest.set(p, r)
      }
    }
    const rows = [...sums].map(([party, [t, c]]) => ({ party, total_aud: round(t), receipts: c })).filter((r) => r.total_aud > 0).sort((a, b) => b.total_aud - a.total_aud)
    const span = (a: number, b: number) => a === b ? `financial year ${fyLabel(a)}` : `financial years ${fyLabel(a)} to ${fyLabel(b)}`
    const sourcesName = `${industryModifier(input.industry)} sources`.replace(/^./, c => c.toUpperCase())
    const other = [...rest].map(([party, r]) => {
      const split: ReceiptSplit = { donations: [0, 0], other: r.other, subscriptions: r.subscriptions, untyped: r.untyped, all: [0, 0], publicFunding: [0, 0], otherYears: [null, null] }
      const period = from || to ? span(from ?? 1998, to ?? 2024) : r.years.length ? span(Math.min(...r.years), Math.max(...r.years)) : ''
      return { party, other_receipts_aud: round(r.other[0]), subscriptions_aud: round(r.subscriptions[0]), untyped_aud: round(r.untyped[0]),
        line: otherReceiptsLine(sourcesName, party, split, { also: sums.has(party) && (sums.get(party)![0] > 0), period }) }
    }).filter(r => r.line).sort((a, b) => (b.other_receipts_aud + b.subscriptions_aud + b.untyped_aud) - (a.other_receipts_aud + a.subscriptions_aud + a.untyped_aud)).slice(0, 5)
    return {
      tool: 'party_receipts', ok: true, data: { industry: input.industry, years: [from ?? null, to ?? null], measure, rows, ...(other.length ? { other_receipts: other } : {}), coverage },
      cite: [...rows.map((r) => ({ kind: 'export' as const, label: `${input.industry} ${measure === 'donations' ? 'donations' : 'receipt sources'} to ${r.party}`, value: r.total_aud, url: mapUrl(r.party, measure === 'donations' ? { receipt: 'donations' } : {}) })),
        ...other.map(r => ({ kind: 'export' as const, label: r.line, value: round(r.other_receipts_aud + r.subscriptions_aud + r.untyped_aud), url: mapUrl(r.party) }))],
      list: mapUrl(),
      query: { file: '/graph/money.json', industry: input.industry, from, to, measure }, notes,
    }
  }
  return { tool: 'party_receipts', ok: false, error: 'party or industry is required', cite: [], notes: [] }
}

// ---------------------------------------------------------------- find_quotes
export async function findQuotes(deps: ToolDeps, input: SpeechFilter & { query: string; limit?: number }): Promise<ToolResult> {
  const { term: _term, state, speaker, ...rest } = input
  const window = input.term && TERMS[input.term] ? { since: TERMS[input.term][0], ...(TERMS[input.term][1] ? { until: TERMS[input.term][1] } : {}) } : {}
  const args = Object.fromEntries(Object.entries({ ...rest, ...window, kind: 'speech', ...(state ? { jurisdiction: state } : {}), ...(speaker ? { speaker } : {}), limit: Math.min(input.limit ?? 4, 5) }).filter(([, v]) => v != null))
  const data = await corpusTool.handler({ ...deps.toolEnv, asset: deps.asset, kb: deps.kb, origin: deps.origin, signal: deps.signal }, args)
  const passages = (data.rows as Record<string, unknown>[]).map(r => ({ slug: r.record_id, title: r.title, speaker: r.speaker, date: r.date, text: r.excerpt }))
  return { tool: 'find_quotes', ok: !data.error, data: { ...data, passages }, cite: data.citations.map(c => ({ ...c, kind: c.kind ?? 'record', label: c.text })), notes: data.notes, ...(data.error ? { error: data.error } : {}) }
}

const filterProps: Json = {
  topic: { type: 'string', enum: [...TOPICS], description: 'OPAX topic label' },
  speaker: { type: 'string', description: 'speaker name exactly as find_people returns it' },
  party: { type: 'string', description: 'party label, e.g. Labor, Liberal, Greens, Nationals, LNP, Independent, One Nation' },
  state: { type: 'string', enum: [...STATES], description: 'parliament' },
  chamber: { type: 'string', enum: [...CHAMBERS] },
  venue: { type: 'string', enum: ['chamber', 'committee', 'all'], description: 'chamber speeches (default), committee-hearing turns, or both' },
  since: { type: 'string', description: 'YYYY-MM-DD, speech date' },
  until: { type: 'string', description: 'YYYY-MM-DD, speech date' },
  term: { type: 'string', enum: Object.keys(TERMS), description: 'federal parliament term' },
}
const dataSpecs: ToolSpec[] = [
  { name: 'count_speeches', description: 'Count speeches exactly, optionally ranked by speaker or party. Use for "who speaks most", "which party mentions X most", "how many speeches". Returns counts from the record index, the method, and coverage notes that must be stated.', input: { type: 'object', properties: { ...filterProps, group_by: { type: 'string', enum: ['speaker', 'party', 'none'] }, limit: { type: 'integer', minimum: 1, maximum: 15 } } }, run: (d, a) => countSpeeches(d, a as CountInput) },
  { name: 'speech_trend', description: 'Speech counts over time (by year, decade or federal term) with each period\'s share of topic-labelled speeches. Use for "is X debated more", "how has X changed".', input: { type: 'object', properties: { ...filterProps, by: { type: 'string', enum: ['year', 'decade', 'term'] }, from_year: { type: 'integer' }, to_year: { type: 'integer' } } }, run: (d, a) => speechTrend(d, a as TrendInput) },
  { name: 'find_people', description: 'Resolve a politician name, including typos, surname-first order, titles and common nicknames, to the indexed name, party, parliaments and years. Returns confidence-ranked candidates and one clear match in people. Equal matches require the returned clarification question; no_match means no person by that name is recorded. Dated service is returned per chamber and seat. Use service.start and service.end for first elected, entered, left or years served; years are speech coverage only. Empty service means dates are unavailable.', input: { type: 'object', properties: { name: { type: 'string', minLength: 2, maxLength: 120 } }, required: ['name'] }, run: (d, a) => findPeople(d, a as unknown as { name: string }) },
  { name: 'member_votes', description: 'Compatibility alias: delegates person histories to member_divisions and party title lookups to division. Prefer those dedicated tools and follow their continuation metadata. Follow the final cursor for a complete scanned history. For a specific division, its outcome, ayes/noes, a member\'s actual vote, party majorities or rebels, use division with exact date/chamber/title or division_id. Use division aggregate operations for period floor-crossing and party agreement.', input: { type: 'object', properties: { keyword: { type: 'string' }, person: { type: 'string' }, party: { type: 'string' }, since: { type: 'string' }, until: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 80 } }, required: ['keyword'] }, run: (d, a) => memberVotes(d, a as unknown as { keyword: string }) },
  { name: 'party_receipts', description: 'Donor breakdown of disclosed receipts to a federal party, or receipt totals by party for one source industry (e.g. gambling, mining). measure=donations (the default) ranks only AEC Donation Received, for who gives, donates, funds or is a donor; other receipt types come back as separate labelled lines (other_receipts), described as other receipts. measure=all_types ranks every receipt type with its breakdown, for money from, receipts or paid. Public funding is listed apart from donors. Use money_totals for a party or donor total, rankings by total, or annual receipt trends. Only complete financial years are supported; from_year/to_year are FY starting years. Names follow source disclosure spelling; uncertain identity matches have no profile link.', input: { type: 'object', properties: { party: { type: 'string' }, industry: { type: 'string' }, from_year: { type: 'integer' }, to_year: { type: 'integer' }, since: { type: 'string' }, until: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 15 }, measure: { type: 'string', enum: ['donations', 'all_types'] }, lending: { type: 'boolean', description: "Set true for a question about loans, lending, borrowing or debts: the answer adds what the party's own returns declare as debts, beside the receipts." } } }, run: (d, a) => partyDonations(d, a as { party?: string }) },
  { name: 'find_quotes', description: 'Compatibility alias for corpus_records with kind speech. Prefer corpus_records for original verified speech or release excerpts, detail and paging. A ranked sample of original excerpts; count with the complete speech-count tools.', input: { type: 'object', properties: { ...filterProps, query: { type: 'string', minLength: 2, maxLength: 250 }, limit: { type: 'integer', minimum: 1, maximum: 5 } }, required: ['query'] }, run: (d, a) => findQuotes(d, a as unknown as SpeechFilter & { query: string }) },
]

const depsFor = (env: ToolEnv): ToolDeps => ({ asset: path => readToolAsset(env, path), kb: env.kb ?? (async () => { throw new Error('Corpus reader unavailable') }), origin: env.origin ?? env.COMMUNITY_ORIGIN, signal: env.signal, toolEnv: env })
/** Canonical shared data results; Ask keeps its established fact layout through registry metadata. */
export const speechDataTools: ToolDefinition[] = dataSpecs.map(spec => ({
  name: spec.name, description: spec.description,
  inputSchema: { ...spec.input, type: 'object', additionalProperties: false, examples: [] } as ToolDefinition['inputSchema'],
  validate: args => validWindow(args) && (spec.name !== 'member_votes' || !!(args.person || args.party)),
  evidenceKind: spec.name === 'find_quotes' ? 'passages' : undefined,
  askFactStyle: ['count_speeches', 'speech_trend', 'find_people', 'party_receipts'].includes(spec.name) ? 'legacy' : undefined,
  stepLabel: args => ({ label: ({ count_speeches: args.venue === 'committee' ? 'Checking committee hearings' : args.group_by === 'speaker' ? 'Counting by speaker' : args.group_by === 'party' ? 'Counting by party' : 'Searching speeches', speech_trend: 'Comparing years', find_people: 'Resolving a name', party_receipts: 'Checking disclosed receipts', member_votes: 'Checking votes', find_quotes: 'Reading source passages' } as Record<string, string>)[spec.name], arg: String(args.keyword ?? args.name ?? args.speaker ?? args.person ?? args.party ?? args.topic ?? args.query ?? '').slice(0, 40) }),
  async handler(env, args) {
    const r = await spec.run(depsFor(env), args), data = r.data ?? {}
    return { ...data, rows: Array.isArray(data.rows) ? data.rows : Array.isArray(data.people) ? data.people : [], citations: r.cite.map(c => ({ ...c, kind: c.kind === 'person' || c.kind === 'speech' ? 'record' as const : c.kind, text: c.label })), notes: r.notes, query: r.query, ...(r.error ? { error: r.error } : {}), ...(r.list ? { list: r.list } : {}) } as StructuredToolResult
  },
}))
