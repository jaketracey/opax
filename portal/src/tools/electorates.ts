/** Published electorate Census data only. No KB retrieval or model arithmetic. */
import type { Cite, ToolDeps, ToolResult } from '../agentic-tools'
import { readToolAsset, ToolInputError, type ToolDefinition, type ToolEnv } from './types'
import { validToolIdentifier, TOOL_IDENTIFIER_MAX_LENGTH } from './identifiers'

export const ELECTORATE_INDICATORS: Record<string, { label: string; unit: string }> = {
  median_income: { label: 'median personal income', unit: 'AUD/week' },
  median_household_income_weekly: { label: 'median household income', unit: 'AUD/week' },
  median_age: { label: 'median age', unit: 'years' },
  unemployment_rate: { label: 'unemployment rate', unit: '%' },
  rental_pct: { label: 'renting', unit: '%' },
  university_pct: { label: 'university qualification', unit: '%' },
  population: { label: 'population', unit: 'people' },
  average_household_size: { label: 'average household size', unit: 'people/household' },
  born_overseas_pct: { label: 'born overseas', unit: '%' },
  homeownership_pct: { label: 'home ownership', unit: '%' },
  indigenous_pct: { label: 'Aboriginal and Torres Strait Islander population', unit: '%' },
  labour_force_participation: { label: 'labour force participation', unit: '%' },
  median_mortgage_monthly: { label: 'median mortgage', unit: 'AUD/month' },
  median_rent_weekly: { label: 'median rent', unit: 'AUD/week' },
}
const JURISDICTIONS = ['federal', 'nsw', 'vic', 'qld', 'sa', 'wa', 'tas', 'act', 'nt', 'state', 'all']
const CHAMBERS = ['representatives', 'senate', 'nsw_la', 'nsw_lc', 'vic_la', 'vic_lc', 'qld_la', 'sa_ha', 'sa_lc', 'wa_la', 'wa_lc', 'tas_ha', 'tas_lc', 'act_la', 'nt_la']
const SOURCE = '2021 Census (ABS)'
const jurisdictionLabel = (value: string) => ({ federal: 'Federal', nsw: 'NSW', vic: 'Victoria', qld: 'Queensland', sa: 'South Australia', wa: 'Western Australia', tas: 'Tasmania', act: 'ACT', nt: 'Northern Territory', state: 'state parliaments', all: 'all jurisdictions' } as Record<string, string>)[value] ?? value
const chamberLabel = (value?: string) => !value ? 'all chambers' : value === 'representatives' ? 'House of Representatives' : value === 'senate' ? 'Senate' : value.endsWith('_lc') ? 'Legislative Council' : value.endsWith('_ha') ? 'House of Assembly' : 'Legislative Assembly'
const fold = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim()
const indicatorKey = (s: string) => {
  const key = fold(s).replace(/[ -]+/g, '_')
  const aliases: Record<string, string> = { median_personal_income: 'median_income', median_household_income: 'median_household_income_weekly', unemployment: 'unemployment_rate', renters: 'rental_pct' }
  return Object.hasOwn(aliases, key) ? aliases[key] : key
}

/** Speech retrieval retains its existing classifier, even when it mentions Census metrics. */
export function isElectorateDataQuestion(question: string): boolean {
  if (/\b(?:speech(?:es)?|remarks?|statements?|hansard|said|says|say|spoke|spoken|speak\w*|discuss\w*|debate\w*|mention\w*|quote\w*|talk\w*)\b/i.test(question)) return false
  const metric = /\b(?:median[ _](?:household[ _]|personal[ _])?(?:income|age|rent|mortgage)|unemployment(?:[ _]rate)?|renters?|renting|rental(?:[ _]pct)?|population|home[ _]?ownership|university(?:[ _]qualification)?|born overseas|indigenous(?:[ _]pct)?|household size|labour force participation|census|demographics?)\b/i.test(question)
  if (/\b(?:oldest|youngest)\b.*\belectorates?\b|\belectorates?\b.*\b(?:oldest|youngest)\b|\bmost renters\b/i.test(question)) return true
  return metric && (/\belectorates?\b|\b(?:lowest|highest|most|least|fewest|rank|compare|in|for|of)\b/i.test(question) || /\bmedian[ _](?:income|age)\b/i.test(question))
}

export function electorateStep(args: Record<string, unknown>): { label: string; arg: string } {
  const key = indicatorKey(String(args.indicator ?? ''))
  const label = key === 'median_income' ? 'median income' : ELECTORATE_INDICATORS[key]?.label ?? 'demographics'
  return { label: 'Checking electorate data', arg: label.slice(0, 40) }
}

/** The common data questions have a bounded plan even when the planner is unavailable. */
export function electoratePlan(question: string): { shape: 'ranking' | 'unanswerable'; steps: { tool: string; args: Record<string, unknown> }[]; reason?: string } | null {
  if (!isElectorateDataQuestion(question)) return null
  const q = fold(question)
  if (/\b(?!2021\b)\d{4}\s+census\b/.test(q)) return { shape: 'unanswerable', steps: [], reason: 'Only published 2021 Census (ABS) demographic profiles are available.' }
  const metrics: [string, RegExp][] = [
    ['median_household_income_weekly', /median household income/], ['median_income', /median (?:personal )?income/],
    ['median_age', /median age|oldest|youngest/], ['unemployment_rate', /unemployment/], ['rental_pct', /renters|renting|rental/],
    ['median_rent_weekly', /median rent/], ['median_mortgage_monthly', /median mortgage/],
    ['university_pct', /university/], ['homeownership_pct', /home ?ownership/], ['born_overseas_pct', /born overseas/],
    ['indigenous_pct', /indigenous|aboriginal|torres strait/], ['average_household_size', /household size/], ['labour_force_participation', /labour force participation/], ['population', /population/],
  ]
  // Median rent is distinct from the renting percentage.
  const indicator = /median rent/.test(q) ? 'median_rent_weekly' : metrics.find(([, re]) => re.test(q))?.[0]
  if (!indicator) return null
  const ranked = /\b(?:lowest|highest|oldest|youngest|most|least|fewest|rank|top|bottom)\b/.test(q)
  const countWords = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']
  const countToken = q.match(/\b(?:top|bottom)\s+(?:the\s+)?(\S+)/)?.[1] ??
    (ranked ? q.match(/\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+(?:\w+\s+){0,4}electorates?\b/)?.[1] : undefined)
  const limit = countToken === undefined ? undefined : /^\d+$/.test(countToken) ? Number(countToken) : countWords.indexOf(countToken) + 1
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 20)) return { shape: 'unanswerable', steps: [], reason: 'Ask supports an explicit ranking count from 1 to 20 electorates, including ties at the cutoff.' }
  // Threshold/comparison wording needs the schema-aware planner; never ignore it.
  if (/\b(?:above|below|over|under|between|compare|than)\b/.test(q)) return null
  const states: [string, RegExp][] = [['nsw', /new south wales|\bnsw\b/], ['vic', /victoria\w*|\bvic\b/], ['qld', /queensland|\bqld\b/], ['sa', /south australia\w*|\bsa\b/], ['wa', /western australia\w*|\bwa\b/], ['tas', /tasmania\w*|\btas\b/], ['act', /australian capital territory|\bact\b/], ['nt', /northern territory|\bnt\b/]]
  const state = states.find(([, re]) => re.test(q))?.[0]
  const stateSeats = /\bstate\b|legislative|house of assembly/.test(q) && !/\bfederal\b/.test(q)
  if (stateSeats && !state) return null
  const jurisdiction = stateSeats ? state! : 'federal'
  const lower: Record<string, string> = { nsw: 'nsw_la', vic: 'vic_la', qld: 'qld_la', sa: 'sa_ha', wa: 'wa_la', tas: 'tas_ha', act: 'act_la', nt: 'nt_la' }
  const chamber = stateSeats ? /council|upper house/.test(q) ? `${state}_lc` : lower[state!] : /senate/.test(q) ? 'senate' : 'representatives'
  const location = (question.match(/\b(?:in|for)\s+(.+?)\s*[?.!]*$/i) ?? question.match(/\bof\s+(.+?)\s*[?.!]*$/i))?.[1]
    .replace(/\s*[?.!]+$/, '').replace(/^(?:the\s+)?(?:electorate|seat)(?:\s+of)?\s+/i, '').trim()
  if (!ranked && (!location || states.some(([, re]) => re.test(fold(location))))) return null
  return { shape: 'ranking', steps: [{ tool: 'electorates', args: {
    indicator, jurisdiction, chamber, ...(state && !stateSeats && ranked ? { state } : {}),
    ...(ranked ? { order: /highest|oldest|most|top/.test(q) ? 'desc' : 'asc', ...(limit === undefined ? {} : { limit }) } : { operation: 'lookup', electorate: location }),
    ...(/historical|abolished/.test(q) ? { status: 'historical' } : {}),
  } }] }
}

/** The route validator's integer-only speech schema does not apply to Census thresholds. */
export function validElectorateArgs(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const args = value as Record<string, unknown>
  if (typeof args.indicator !== 'string' || !Object.hasOwn(ELECTORATE_INDICATORS, indicatorKey(args.indicator))) return false
  const props = tool.inputSchema.properties as Record<string, { type: string; enum?: unknown[]; minimum?: number; maximum?: number }>
  if (args.operation === 'lookup' && (typeof args.electorate !== 'string' || !args.electorate.trim())) return false
  if (args.electorate !== undefined && !validToolIdentifier(args.electorate)) return false
  if (typeof args.min === 'number' && typeof args.max === 'number' && args.min > args.max) return false
  return Object.entries(args).every(([key, v]) => {
    const prop = props[key]
    if (!prop) return false
    if (prop.type === 'string') return typeof v === 'string' && !!v.trim() && (key === 'indicator' || !prop.enum || prop.enum.includes(v))
    return typeof v === 'number' && Number.isFinite(v) && (prop.type !== 'integer' || Number.isInteger(v)) && (prop.minimum === undefined || v >= prop.minimum) && (prop.maximum === undefined || v <= prop.maximum)
  })
}

interface Seat {
  electorate_id: string; slug: string; name: string; jurisdiction: string; chamber: string;
  state_code: string; status: string; url: string; detail_url: string; aliases?: string[];
}
interface Profile { year: number; indicators: Record<string, unknown>; note?: string; vintage?: string }
export interface ElectorateRow {
  name: string; electorate_id: string; jurisdiction: string; chamber: string; state_code: string;
  value: number; unit: string; url: string; source: string; rank?: number;
}
export interface ElectoratesInput {
  indicator: string;
  operation?: 'rank' | 'filter' | 'lookup';
  jurisdiction?: string;
  chamber?: string;
  /** Geographic state; separate from the parliament jurisdiction. */
  state?: string;
  electorate?: string;
  order?: 'asc' | 'desc';
  min?: number;
  max?: number;
  limit?: number;
  status?: 'current' | 'historical' | 'all';
}

const failure = (error: string): ToolResult => ({ tool: 'electorates', ok: false, error, cite: [], notes: [] })
async function asset<T>(deps: ToolDeps, path: string): Promise<T> {
  // Only the manifest and files in its published release are ever read.
  if (!/^\/electorates\/(?:manifest\.json|releases\/[a-f0-9]+\/(?:index|el_[a-f0-9]+)\.json)$/.test(path)) throw new Error('Invalid electorate asset path')
  const data = await deps.asset(path)
  if (!data || typeof data !== 'object') throw new Error(`Electorate asset unavailable: ${path}`)
  return data as T
}
async function seatIndex(deps: ToolDeps) {
  const manifest = await asset<{ index_url: string; release_id: string }>(deps, '/electorates/manifest.json')
  const base = `/electorates/releases/${manifest.release_id}/`
  if (manifest.index_url !== `${base}index.json`) throw new Error('Manifest index does not match its release')
  const index = await asset<{ electorates: Seat[] }>(deps, manifest.index_url)
  if (!Array.isArray(index.electorates)) throw new Error('Electorate index is invalid')
  return { manifest, base, index }
}
const matchesSeat = (seat: Seat, name: string) => [seat.name, seat.slug, seat.electorate_id, ...(seat.aliases ?? [])].some(v => fold(v) === fold(name))

export async function electorates(deps: ToolDeps, input: ElectoratesInput): Promise<ToolResult> {
  if (typeof input.indicator !== 'string') return failure('indicator is required')
  const indicator = indicatorKey(input.indicator)
  if (!Object.hasOwn(ELECTORATE_INDICATORS, indicator)) return failure(`Unknown indicator; use ${Object.keys(ELECTORATE_INDICATORS).join(', ')}`)
  const metric = ELECTORATE_INDICATORS[indicator]
  const jurisdiction = input.jurisdiction ?? 'federal'
  const chamber = input.chamber ?? (jurisdiction === 'federal' ? 'representatives' : undefined)
  const status = input.status ?? 'current'
  const operation = input.operation ?? (input.electorate ? 'lookup' : 'rank')
  const order = input.order ?? 'asc'
  if (!JURISDICTIONS.includes(jurisdiction)) return failure('Unknown jurisdiction')
  if (chamber && !CHAMBERS.includes(chamber)) return failure('Unknown chamber')
  if (input.state && !JURISDICTIONS.slice(1, 9).includes(input.state)) return failure('Unknown geographic state')
  if (!['current', 'historical', 'all'].includes(status)) return failure('Unknown electorate status')
  if (!['rank', 'filter', 'lookup'].includes(operation) || !['asc', 'desc'].includes(order)) return failure('Invalid operation or order')
  if (operation === 'lookup' && !input.electorate) return failure('electorate is required for lookup')
  if (input.electorate !== undefined && !validToolIdentifier(input.electorate)) throw new ToolInputError('electorates_rank')
  for (const key of ['min', 'max', 'limit'] as const) {
    if (input[key] !== undefined && (typeof input[key] !== 'number' || !Number.isFinite(input[key]))) return failure(`${key} must be a finite number`)
  }
  if (input.min !== undefined && input.max !== undefined && input.min > input.max) return failure('min exceeds max')
  const limit = input.limit ?? (operation === 'rank' ? 1 : 10)
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return failure('limit must be an integer from 1 to 50')

  const { manifest, base, index } = await seatIndex(deps)
  if (input.electorate && !index.electorates.some(s => matchesSeat(s, input.electorate!))) throw new ToolInputError('electorates_rank')
  const name = input.electorate ? fold(input.electorate) : null
  const seats = index.electorates.filter((s) =>
    (jurisdiction === 'all' || (jurisdiction === 'state' ? s.jurisdiction !== 'federal' : s.jurisdiction === jurisdiction)) &&
    (!chamber || s.chamber === chamber) && (!input.state || s.state_code === input.state) &&
    (status === 'all' || s.status === status) &&
    (!name || matchesSeat(s, name)))
  if (operation === 'lookup' && seats.length > 1) return {
    ...failure('Ambiguous electorate name; specify jurisdiction and chamber'),
    data: { candidates: seats.map((s) => ({ name: s.name, jurisdiction: s.jurisdiction, chamber: s.chamber, url: s.url })) },
  }
  const rows: ElectorateRow[] = []
  const missing: { name: string; jurisdiction: string; chamber: string; url: string; reason: string }[] = []
  const profileNotes = new Set<string>()
  let cursor = 0
  // A small pool avoids opening hundreds of asset requests simultaneously.
  await Promise.all(Array.from({ length: Math.min(4, seats.length) }, async () => {
    while (cursor < seats.length) {
      const s = seats[cursor++]
      if (!s.detail_url.startsWith(base) || !/^\/subject\/electorate\/[a-z0-9-]+$/.test(s.url)) throw new Error('Invalid electorate release or page URL')
      const detail = await asset<{ electorate_id: string; demographics: Profile[] }>(deps, s.detail_url)
      if (detail.electorate_id !== s.electorate_id || !Array.isArray(detail.demographics)) throw new Error('Invalid electorate detail')
      const profiles = detail.demographics.filter((p) => p.year === 2021)
      const values = profiles.map((p) => p.indicators?.[indicator])
      const value = values[0]
      const valid = values.length > 0 && values.every((v) => typeof v === 'number' && Number.isFinite(v) && v === value)
      const url = new URL(s.url, deps.origin ?? 'https://opax.com.au').href
      if (!valid) {
        missing.push({ name: s.name, jurisdiction: s.jurisdiction, chamber: s.chamber, url, reason: !profiles.length ? 'No 2021 Census profile' : values.some((v) => typeof v !== 'number' || !Number.isFinite(v)) ? 'Indicator missing or non-numeric' : 'Conflicting 2021 Census profiles' })
        continue
      }
      profiles.forEach((p) => { if (p.note) profileNotes.add(p.note) })
      rows.push({ name: s.name, electorate_id: s.electorate_id, jurisdiction: s.jurisdiction, chamber: s.chamber, state_code: s.state_code, value: value as number, unit: metric.unit, url, source: SOURCE })
    }
  }))
  const byName = (a: { name: string; jurisdiction: string; chamber: string }, b: { name: string; jurisdiction: string; chamber: string }) => a.name.localeCompare(b.name) || a.jurisdiction.localeCompare(b.jurisdiction) || a.chamber.localeCompare(b.chamber)
  const eligible = rows.filter((r) => (input.min === undefined || r.value >= input.min) && (input.max === undefined || r.value <= input.max))
    .sort((a, b) => (order === 'asc' ? a.value - b.value : b.value - a.value) || byName(a, b))
  if (operation === 'rank') eligible.forEach((r, i) => { r.rank = i && r.value === eligible[i - 1].value ? eligible[i - 1].rank : i + 1 })
  const cutoff = eligible[limit - 1]?.value
  const selected = eligible.filter((r, i) => i < limit || (operation !== 'lookup' && r.value === cutoff))
  const ties = operation !== 'lookup' ? [...new Set(selected.map((r) => r.value))].flatMap((value) => {
    const tied = selected.filter((r) => r.value === value)
    return tied.length > 1 ? [{ rank: tied[0].rank, value, names: tied.map((r) => r.name) }] : []
  }) : []
  const notes = [
    `Comparing ${status} electorates: ${jurisdictionLabel(jurisdiction)}, ${chamberLabel(chamber)}${input.state ? ` in ${jurisdictionLabel(input.state)}` : ''}.`,
    ...[...profileNotes].sort(),
  ]
  if (indicator === 'median_income') notes.push('Median income means personal weekly income; household weekly income is a separate indicator.')
  if (missing.length) notes.push(`${missing.length} of ${seats.length} matching electorates have no usable ${metric.label} value and are excluded; missing is not zero.`)
  if (ties.length) notes.push('Equal values are tied; all ties at the requested cutoff are included.')
  const unanswerable = !seats.length ? 'no_matching_electorate' : !rows.length ? 'no_demographic_data' : !eligible.length ? 'no_matching_values' : undefined
  if (unanswerable) notes.push(unanswerable === 'no_demographic_data' ? `No published ${SOURCE} ${metric.label} values are available for this scope; a ranking or figure cannot be given.` : 'No electorate values match the requested filters.')
  const cite: Cite[] = selected.map((r) => ({ kind: 'export', label: `${r.name} (${r.jurisdiction}, ${r.chamber}): ${metric.label} — ${SOURCE}`, value: r.value, url: r.url }))
  return {
    tool: 'electorates', ok: true,
    data: { indicator, label: metric.label, unit: metric.unit, source: SOURCE, operation, order, rows: selected, ties, missing: missing.sort(byName), matched: seats.length, available: rows.length, eligible: eligible.length, more: eligible.length - selected.length, unanswerable },
    cite, notes,
    query: { manifest: '/electorates/manifest.json', release_id: manifest.release_id, indicator, operation, jurisdiction, chamber, state: input.state, status, electorate: input.electorate, order, min: input.min, max: input.max, limit },
  }
}

/** The fact text keeps units, provenance and any tied rank attached to its figure. */
export function electorateFacts(result: ToolResult): { text: string; cite: Cite }[] {
  const data = result.data as { rows: ElectorateRow[]; label: string }
  return data.rows.map((r, i) => {
    const figure = r.unit === 'AUD/week' ? `$${r.value} per week` : r.unit === 'AUD/month' ? `$${r.value} per month` : r.unit === '%' ? `${r.value}%` : `${r.value} ${r.unit === 'people/household' ? 'people per household' : r.unit}`
    return { text: `${r.name} (${jurisdictionLabel(r.jurisdiction)}, ${chamberLabel(r.chamber)}): ${data.label} ${figure} (${SOURCE})`, cite: result.cite[i] }
  })
}

export const tool: ToolDefinition = {
  name: 'electorates_rank',
  askName: 'electorates', // Preserve the route lane's existing plans while using one handler/schema.
  description: 'Rank, filter or look up current federal or state electorate demographics from the published 2021 Census (ABS), including income, unemployment and median age. Figures cite electorate pages; all cutoff ties are included and missing profiles are explicitly excluded.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    indicator: { type: 'string', enum: Object.keys(ELECTORATE_INDICATORS), description: 'median_income is personal AUD/week; household income is a separate indicator.' },
    operation: { type: 'string', enum: ['rank', 'filter', 'lookup'], description: 'Defaults to lookup when electorate is supplied, otherwise rank.' },
    jurisdiction: { type: 'string', enum: JURISDICTIONS, description: 'Defaults to federal. vic means Victorian state seats.' },
    chamber: { type: 'string', enum: CHAMBERS, description: 'Defaults to representatives for federal seats.' },
    state: { type: 'string', enum: JURISDICTIONS.slice(1, 9), description: 'Geographic state: federal + state=vic selects federal seats in Victoria.' },
    electorate: { type: 'string', minLength: 1, maxLength: TOOL_IDENTIFIER_MAX_LENGTH, description: 'Exact published electorate name, slug or ID. Letters, numbers, spaces, dots, apostrophes, parentheses, underscores and hyphens only. Required for lookup.' },
    order: { type: 'string', enum: ['asc', 'desc'], description: 'asc for lowest/youngest (default), desc for highest/oldest/most.' },
    min: { type: 'number', description: 'Inclusive minimum value.' }, max: { type: 'number', description: 'Inclusive maximum value; must be at least min.' },
    limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Defaults to 1; includes every tie at the cutoff.' },
    status: { type: 'string', enum: ['current', 'historical', 'all'], description: 'Defaults to current.' },
  }, required: ['indicator'], examples: [
    { indicator: 'median_income', order: 'asc' },
    { indicator: 'unemployment_rate', order: 'desc', jurisdiction: 'federal' },
    { indicator: 'median_age', operation: 'lookup', electorate: 'Corangamite' },
    { indicator: 'median_income', jurisdiction: 'vic', chamber: 'vic_la', order: 'asc' },
  ] },
  validate: validElectorateArgs,
  identifierFields: ['electorate'],
  async validateKnown(env, args) {
    if (!args.electorate) return true
    let index: { electorates: Seat[] }
    try { ({ index } = await seatIndex({ asset: path => readToolAsset(env, path), kb: async () => { throw new Error('No speeches') } })) }
    catch { return true } // An unavailable catalog is an operational failure, never evidence of an unknown name.
    return index.electorates.some(s => matchesSeat(s, args.electorate as string))
  },
  stepLabel: electorateStep,
  async handler(env: ToolEnv, args) {
    if (!validElectorateArgs(args)) throw new ToolInputError('electorates_rank')
    let result: ToolResult
    try {
      result = await electorates({
        asset: path => readToolAsset(env, path), origin: env.origin ?? env.COMMUNITY_ORIGIN,
        signal: env.signal, kb: async () => { throw new Error('Electorates never searches speeches') },
      }, { ...args, indicator: args.indicator as string })
    } catch (error) {
      if (error instanceof ToolInputError) throw error
      return { rows: [], citations: [], notes: [], error: 'Electorate asset unavailable.' }
    }
    if (!result.ok) return { rows: [], citations: [], notes: result.notes, error: result.error ?? 'Electorate data unavailable.' }
    const data = result.data!
    return { ...data, rows: Array.isArray(data.rows) ? data.rows : [],
      citations: electorateFacts(result).map(f => ({ text: f.text, url: f.cite.url, value: f.cite.value, kind: f.cite.kind })),
      notes: result.notes, query: result.query,
    }
  },
}
