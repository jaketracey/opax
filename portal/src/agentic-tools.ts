import {donorDisclosure,returnReference,type DonorDisclosureRecord} from '../public/donor-disclosure.js'
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
import { askToolSpecs, getAskTool, validRegisteredArgs, TOOL_REGISTRY_VERSION } from './tools'
import type { ToolEnv } from './tools'
export const AGENTIC_TOOLS_VERSION = 'agentic-tools-13-bracketed-statutes/' + TOOL_REGISTRY_VERSION

export const TOPICS = [
  'gambling', 'financial-services', 'mining-energy', 'climate-environment', 'property-construction', 'housing', 'health',
  'media-communications', 'hospitality-alcohol', 'defence-security', 'agriculture', 'unions-workplace', 'immigration',
  'indigenous-affairs', 'tax-budget', 'education', 'welfare-social', 'integrity-democracy', 'infrastructure-transport',
  'justice-law', 'foreign-affairs',
] as const
export const STATES = ['federal', 'nsw', 'vic', 'sa', 'qld', 'act'] as const
export const CHAMBERS = ['representatives', 'senate', 'nsw_la', 'nsw_lc', 'vic_la', 'vic_lc', 'sa_ha', 'sa_lc', 'qld_la', 'act_la'] as const
const COMMITTEES = ['senate_committee', 'joint_committee', 'house_committee']
// Labels written by the sync only on federal and (partly) Queensland speeches.
const PARTY_LABELLED_STATES = new Set(['federal', 'qld'])
/** Parliamentary terms the planner may name. 48th: open-ended. */
export const TERMS: Record<string, [string, string | null]> = {
  '46th': ['2019-07-02', '2022-04-11'],
  '47th': ['2022-07-26', '2025-03-28'],
  '48th': ['2025-07-22', null],
}

type Json = Record<string, unknown>
export interface ToolDeps {
  /** Public bindings for registry handlers, including future D1 data tools. */
  toolEnv?: ToolEnv
  /** POST (body) or GET a KB path; resolves parsed JSON or throws. */
  kb: (path: string, body?: unknown) => Promise<Json>
  /** Read a public asset (e.g. /graph/money.json); resolves parsed JSON or null. */
  asset: (path: string) => Promise<unknown>
  origin?: string
  signal?: AbortSignal
  withSignal?: (signal: AbortSignal) => Pick<ToolDeps, 'kb' | 'asset'>
}
export interface Cite { kind: 'count' | 'record' | 'export'; label: string; url: string; value?: number | string }
export interface ToolResult { coverage?: import('./ask-constraints').Coverage; tool: string; ok: boolean; error?: string; data?: Json; cite: Cite[]; query?: unknown; notes: string[]; ms?: number }

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
  if (f.chamber) c.push(label('chamber', f.chamber))
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
  if (groupBy === 'speaker') notes.push('A speaker name can be a surname-only record for some state members. Some federal debate records hold more than one speaker under one name (a known source fault being repaired).')
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
  const top = rows.filter((r) => r.count > 0).slice(0, limit)
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
interface Person { name: string; speeches: number | null; party?: string; party_now?: string; states?: string[]; chambers?: string[]; first?: number; last?: number; pid?: string; current?: boolean }
const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[‘’ʼ`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim()
export async function findPeople(deps: ToolDeps, input: { name: string; limit?: number }): Promise<ToolResult> {
  const origin = deps.origin ?? 'https://opax.com.au'
  const q = fold(String(input.name ?? ''))
  if (q.length < 2) return { tool: 'find_people', ok: false, error: 'name is required', cite: [], notes: [] }
  const data = await deps.asset('/parliamentarians.json') as { people?: Person[] } | null
  const people = data?.people ?? []
  const words = q.split(' ')
  const hits = people
    .map((p) => ({ p, n: fold(p.name) }))
    .filter(({ n }) => n === q || words.every((w) => n.split(/[\s-]/).includes(w) || n.includes(w)))
    .sort((a, b) => Number(b.n === q) - Number(a.n === q) || (b.p.speeches ?? 0) - (a.p.speeches ?? 0))
    .slice(0, Math.min(Number(input.limit) || 5, 10))
    .map(({ p }) => ({ name: p.name, party: p.party_now ?? p.party ?? null, states: p.states ?? [], chambers: p.chambers ?? [], years: [p.first ?? null, p.last ?? null], current: p.current ?? null, speeches_indexed: p.speeches }))
  return {
    tool: 'find_people', ok: true, data: { people: hits },
    cite: hits.map((h) => ({ kind: 'record' as const, label: h.name, url: `${origin}/subject/person/${encodeURIComponent(h.name)}` })),
    notes: hits.length ? ['Use the name exactly as returned in speaker filters: it is the name the record indexes speeches under.'] : ['No person in the roster matches; the record may index them under a surname only.'],
  }
}

// ---------------------------------------------------------------- member_votes
interface DivisionMember { name: string; party?: string; vote: string }
interface DivisionFile { key: string; date: string; name?: string; house?: string; jurisdiction?: string; ayes?: number; noes?: number; members?: DivisionMember[]; bills?: { key?: string; title?: string }[] }
export async function memberVotes(deps: ToolDeps, input: { keyword: string; person?: string | null; party?: string | null; limit?: number; since?: string; until?: string }): Promise<ToolResult> {
  const origin = deps.origin ?? 'https://opax.com.au'
  const keyword = String(input.keyword ?? '').trim().slice(0, 80)
  if (keyword.length < 3) return { tool: 'member_votes', ok: false, error: 'keyword (a word from the bill or division name) is required', cite: [], notes: [] }
  if (!input.person && !input.party) return { tool: 'member_votes', ok: false, error: 'person or party is required', cite: [], notes: [] }
  const d = await deps.kb('/catalog', { query: keyword, filter_expression: { resource: label('kind', 'division') }, page_size: 100, show: ['basic'] }) as { resources?: Record<string, { slug?: string }> }
  const slugs = [...new Set(Object.values(d.resources ?? {}).map((r) => (r.slug ?? '').replace(/-p\d+$/, '')).filter((s) => /^division-[a-z0-9-]+$/.test(s)))].sort()
  const files = (await pool(slugs.slice(0, 80), 4, (s) => deps.asset(`/divisions/${s}.json`))) as (DivisionFile | null)[]
  const rows: Json[] = []
  for (const div of files) {
    if (!div?.key || !Array.isArray(div.members)) continue
    if (input.since && div.date < input.since || input.until && div.date.slice(0, 10) > input.until) continue
    if (input.person) {
      const m = div.members.find((x) => fold(x.name) === fold(String(input.person)))
      if (m) rows.push({ division: `division-${div.key}`, date: div.date, name: div.name, vote: m.vote, result: (div.ayes ?? 0) > (div.noes ?? 0) ? 'passed' : 'defeated' })
    } else {
      const ms = div.members.filter((x) => x.party === input.party)
      const aye = ms.filter((x) => x.vote === 'aye').length, no = ms.filter((x) => x.vote === 'no').length
      if (aye || no) rows.push({ division: `division-${div.key}`, date: div.date, name: div.name, aye, no, side: aye && no ? 'split' : aye ? 'aye' : 'no' })
    }
  }
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const tally = (k: string, v: string) => rows.filter((r) => r[k] === v).length
  const summary = input.person
    ? { divisions: rows.length, aye: tally('vote', 'aye'), no: tally('vote', 'no'), paired: tally('vote', 'paired') }
    : { divisions: rows.length, all_aye: tally('side', 'aye'), all_no: tally('side', 'no'), split: tally('side', 'split') }
  return {
    tool: 'member_votes', ok: true,
    data: { keyword, person: input.person ?? null, party: input.party ?? null, summary, rows: rows.slice(0, Math.min(Number(input.limit) || 40, 80)) },
    cite: rows.slice(0, 12).map((r) => ({ kind: 'record' as const, label: `${r.date}: ${r.name}`, url: `${origin}/doc/${r.division}` })),
    query: { kb: 'catalog title search, kind division', keyword, divisions_found: slugs.length },
    notes: ['Divisions are matched by a word in the division or bill title, so related divisions under other titles are missed.', 'A recorded vote is not a statement of reasons; read the speeches for those.'],
  }
}

// ---------------------------------------------------------------- party_donations
interface MoneyNode extends DonorDisclosureRecord { id: string; label: string; kind: string; industry?: string; aliases?: string[]; jurisdiction?: string; total?: number; byYear?: Record<string, [number, number]> }
interface MoneyEdge { source: string; target: string; total: number; count: number; byYear?: Record<string, [number, number]>; firstYear?: number; lastYear?: number }
async function money(deps: ToolDeps) {
  const g = await deps.asset('/graph/money.json') as { nodes: MoneyNode[]; edges: MoneyEdge[] } | null
  if (!g?.nodes) throw new Error('money graph unavailable')
  return g
}
// Disclosure names remain visible independently of resolver confidence.
function sumYears(e: MoneyEdge, from?: number, to?: number): [number, number] {
  if (!from && !to) return [e.total, e.count]
  let t = 0, c = 0
  for (const [y, [v, n]] of Object.entries(e.byYear ?? {})) { const yr = Number(y); if ((!from || yr >= from) && (!to || yr <= to)) { t += v; c += n } }
  return [t, c]
}
export async function partyDonations(deps: ToolDeps, input: { party?: string | null; industry?: string | null; from_year?: number; to_year?: number; limit?: number }): Promise<ToolResult> {
  const origin = deps.origin ?? 'https://opax.com.au'
  const g = await money(deps)
  const node = new Map(g.nodes.map((n) => [n.id, n]))
  const from = Number(input.from_year) || undefined, to = Number(input.to_year) || undefined
  const limit = Math.min(Number(input.limit) || 5, 15)
  const notes = ['Federal AEC donation returns, financial years 1998-99 to 2025-26, in the published selection of the 250 largest donors (so totals are lower bounds).', 'These are party receipts, not personal payments to politicians, and a donation is not evidence that it influenced any vote or speech.']
  if (input.party) {
    const pid = `party:${input.party}`
    if (!node.has(pid)) return { tool: 'party_donations', ok: false, error: `no party "${input.party}" in the money record; parties: ${g.nodes.filter((n) => n.kind === 'party').map((n) => n.label).join(', ')}`, cite: [], notes }
    const edges = g.edges.filter((e) => e.target === pid && node.get(e.source)?.kind === 'donor' && (!input.industry || node.get(e.source)?.industry === input.industry))
    const sized = edges.map((e) => ({ e, v: sumYears(e, from, to) })).filter((x) => x.v[0] > 0)
    const ranked = sized.sort((a,b)=>b.v[0]-a.v[0])
    const rows = ranked.slice(0,limit).map(({e,v})=>{
      const donor=node.get(e.source)!,view=donorDisclosure(donor)
      const reference=(donor.returnReferences || []).find(ref=>(!from || Number(String(ref.year).slice(0,4))>=from) && (!to || Number(String(ref.year).slice(0,4))<=to))
      return {donor:view.name,href:view.href,return_reference:reference ? returnReference(reference) : view.reference,industry:donor.industry ?? null,total_aud:v[0],receipts:v[1]}
    })
    return {
      tool: 'party_donations', ok: true,
      data: {party:input.party,industry:input.industry ?? null,years:[from ?? null,to ?? null],rows},
      cite: [{kind:'export',label:`Donations to ${input.party} (AEC returns)`,url:`${origin}/money/party/${encodeURIComponent(input.party)}`},...rows.map(r=>({kind:'export' as const,label:`${r.donor} to ${input.party} — ${r.return_reference}`,value:r.total_aud,url:r.href ? new URL(r.href,origin).href : 'https://transparency.aec.gov.au/'}))],
      query: { file: '/graph/money.json', party: input.party, industry: input.industry ?? null, from, to }, notes,
    }
  }
  if (input.industry) {
    const sums = new Map<string, [number, number]>()
    for (const e of g.edges) {
      const d = node.get(e.source)
      if (d?.kind !== 'donor' || d.industry !== input.industry || !e.target.startsWith('party:')) continue
      const v = sumYears(e, from, to), p = e.target.slice(6), s = sums.get(p) ?? [0, 0]
      sums.set(p, [s[0] + v[0], s[1] + v[1]])
    }
    const rows = [...sums].map(([party, [t, c]]) => ({ party, total_aud: t, receipts: c })).filter((r) => r.total_aud > 0).sort((a, b) => b.total_aud - a.total_aud)
    return {
      tool: 'party_donations', ok: true, data: { industry: input.industry, years: [from ?? null, to ?? null], rows },
      cite: rows.map((r) => ({ kind: 'export' as const, label: `${input.industry} donors to ${r.party}`, value: r.total_aud, url: `${origin}/money/party/${encodeURIComponent(r.party)}` })),
      query: { file: '/graph/money.json', industry: input.industry, from, to }, notes,
    }
  }
  return { tool: 'party_donations', ok: false, error: 'party or industry is required', cite: [], notes: [] }
}

// ---------------------------------------------------------------- find_quotes
export async function findQuotes(deps: ToolDeps, input: SpeechFilter & { query: string; limit?: number }): Promise<ToolResult> {
  const origin = deps.origin ?? 'https://opax.com.au'
  const { f, problems } = clean(input)
  if (problems.length) return { tool: 'find_quotes', ok: false, error: problems.join('; '), cite: [], notes: [] }
  const q = String(input.query ?? '').trim().slice(0, 300)
  if (q.length < 2) return { tool: 'find_quotes', ok: false, error: 'query is required', cite: [], notes: [] }
  const c = [...clauses(f, true), { not: { prop: 'field', type: 'generic' } }, { not: { prop: 'field', type: 'text', name: 'da-summary-t-body' } }]
  if (windowed(f)) c.push(created(f.since, f.until))
  const d = await deps.kb('/find', { query: q, top_k: 12, features: ['keyword', 'semantic'], reranker: 'predict', show: ['basic', 'origin'], filter_expression: { field: and(c) } }) as {
    resources?: Record<string, { slug?: string; title?: string; origin?: { collaborators?: string[]; created?: string }; fields?: Record<string, { paragraphs?: Record<string, { text?: string; score?: number }> }> }>
  }
  const passages: { slug: string; title: string; speaker: string | null; date: string | null; text: string }[] = []
  for (const r of Object.values(d.resources ?? {})) {
    for (const field of Object.values(r.fields ?? {})) for (const p of Object.values(field.paragraphs ?? {})) {
      if (!r.slug || !p.text) continue
      passages.push({ slug: r.slug, title: r.title ?? r.slug, speaker: r.origin?.collaborators?.[0] ?? null, date: r.origin?.created?.slice(0, 10) ?? null, text: p.text.replace(/\s+/g, ' ').trim().slice(0, 700) })
    }
  }
  const seen = new Set<string>()
  const picked = passages.filter((p) => (seen.has(p.slug) ? false : (seen.add(p.slug), true))).slice(0, Math.min(Number(input.limit) || 4, 8))
  return {
    tool: 'find_quotes', ok: true, data: { passages: picked },
    cite: picked.map((p) => ({ kind: 'record' as const, label: p.title, url: `${origin}/doc/${p.slug}` })),
    query: { endpoint: '/find', query: q, filter: f }, notes: ['Passages are a ranked sample, not every speech; never count them.'],
  }
}

// ---------------------------------------------------------------- registry
export interface ToolSpec { name: string; description: string; input: Json; run: (deps: ToolDeps, args: Json) => Promise<ToolResult> }
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
export const TOOL_SPECS: ToolSpec[] = [
  ...askToolSpecs,
  { name: 'count_speeches', description: 'Count speeches exactly, optionally ranked by speaker or party. Use for "who speaks most", "which party mentions X most", "how many speeches". Returns counts from the record index, the method, and coverage notes that must be stated.', input: { type: 'object', properties: { ...filterProps, group_by: { type: 'string', enum: ['speaker', 'party', 'none'] }, limit: { type: 'integer', minimum: 1, maximum: 15 } } }, run: (d, a) => countSpeeches(d, a as CountInput) },
  { name: 'speech_trend', description: 'Speech counts over time (by year, decade or federal term) with each period\'s share of topic-labelled speeches. Use for "is X debated more", "how has X changed".', input: { type: 'object', properties: { ...filterProps, by: { type: 'string', enum: ['year', 'decade', 'term'] }, from_year: { type: 'integer' }, to_year: { type: 'integer' } } }, run: (d, a) => speechTrend(d, a as TrendInput) },
  { name: 'find_people', description: 'Resolve a politician name to the name the record indexes speeches under, with party, parliaments and years.', input: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }, run: (d, a) => findPeople(d, a as unknown as { name: string }) },
  { name: 'member_votes', description: 'How a person or party voted in recorded divisions whose title contains a keyword (e.g. "gambling").', input: { type: 'object', properties: { keyword: { type: 'string' }, person: { type: 'string' }, party: { type: 'string' }, since: { type: 'string' }, until: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 80 } }, required: ['keyword'] }, run: (d, a) => memberVotes(d, a as unknown as { keyword: string }) },
  { name: 'party_donations', description: 'Largest disclosed donors to a federal party, or totals by party for one donor industry (e.g. gambling, mining). Names follow source disclosure spelling; uncertain identity matches have no profile link.', input: { type: 'object', properties: { party: { type: 'string' }, industry: { type: 'string' }, from_year: { type: 'integer' }, to_year: { type: 'integer' }, limit: { type: 'integer' } } }, run: (d, a) => partyDonations(d, a as { party?: string }) },
  { name: 'find_quotes', description: 'Find a few cited passages to quote or describe what was said. A ranked sample: never count them.', input: { type: 'object', properties: { ...filterProps, query: { type: 'string' }, limit: { type: 'integer' } }, required: ['query'] }, run: (d, a) => findQuotes(d, a as unknown as SpeechFilter & { query: string }) },
]
/** Schema-check model plans before any lookup. References are validated separately. */
export function validToolArgs(name: string, args: unknown): args is Json {
  return toolArgProblem(name, args) === null
}
/** The first invalid argument as a short repair hint for the model, or null when the arguments are valid. */
export function toolArgProblem(name: string, args: unknown): string | null {
  const registered = getAskTool(name)
  if (registered) return validRegisteredArgs(registered.name, args) ? null : 'arguments do not match the tool schema'
  const spec = TOOL_SPECS.find(t => t.name === name)
  if (!spec) return `unknown tool ${name}`
  if (!args || typeof args !== 'object' || Array.isArray(args)) return 'arguments must be an object'
  const a = args as Json
  const props = spec.input.properties as Record<string, { type: string; enum?: unknown[]; minimum?: number; maximum?: number }>
  for (const k of (spec.input.required ?? []) as string[]) if (typeof a[k] !== 'string' || !String(a[k]).trim()) return `${k} is required`
  for (const [k, v] of Object.entries(a)) {
    const p = props[k]
    if (!p) return `unknown argument ${k}`
    if (p.type === 'string' ? typeof v !== 'string' || !v.trim() : typeof v !== 'number' || !Number.isInteger(v)) return `${k} must be ${p.type === 'string' ? 'a non-empty string' : 'an integer'}`
    if (p.enum && !p.enum.includes(v)) return `${k} must be one of ${p.enum.join(', ')}`
    if (typeof v === 'number' && (v < (p.minimum ?? 0) || v > (p.maximum ?? 9999))) return `${k} must be between ${p.minimum ?? 0} and ${p.maximum ?? 9999}`
  }
  for (const k of ['since', 'until']) if (a[k] && (!DATE_RE.test(String(a[k])) || !Number.isFinite(Date.parse(String(a[k]))) || new Date(String(a[k])).toISOString().slice(0, 10) !== a[k])) return `${k} must be a real YYYY-MM-DD date`
  if (a.since && a.until && String(a.since) > String(a.until)) return 'since must not be after until'
  if (name === 'member_votes' && !a.person && !a.party) return 'member_votes needs person or party'
  if (name === 'member_votes' && String(a.keyword).length < 3) return 'keyword must be at least 3 characters'
  if (name === 'party_donations' && !a.party && !a.industry) return 'party_donations needs party or industry'
  return null
}
export async function runTool(deps: ToolDeps, name: string, args: Json): Promise<ToolResult> {
  const spec = TOOL_SPECS.find((t) => t.name === name)
  const t0 = Date.now()
  if (!spec) return { tool: name, ok: false, error: `unknown tool ${name}`, cite: [], notes: [] }
  if (!validToolArgs(name, args)) return { tool: name, ok: false, error: 'invalid tool arguments', cite: [], notes: [] }
  try { return { ...(await spec.run(deps, args ?? {})), ms: Date.now() - t0 } }
  catch (err) { return { tool: name, ok: false, error: String((err as Error)?.message ?? err).slice(0, 300), cite: [], notes: [], ms: Date.now() - t0 } }
}
