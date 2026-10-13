/** Government grants (GrantConnect federal awards; Queensland expenditure lines) from the published grants table. */
import { aud, clip, siteUrl, tableRows } from './record-common'
import { readToolAsset, type ToolCitation, type ToolDefinition, type ToolEnv } from './types'

const STATES = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt']
const PRIVATE_KINDS = new Set(['person', 'individual', 'sole trader'])
/** Federal electorates (current and abolished) in one state, as the grants table records them. */
async function stateSeats(env: ToolEnv, state: string): Promise<string[]> {
  const manifest = await readToolAsset(env, '/electorates/manifest.json') as { index_url?: string } | null
  if (!manifest?.index_url || !/^\/electorates\/releases\/[a-f0-9]+\/index\.json$/.test(manifest.index_url)) throw new Error('Electorate index unavailable.')
  const index = await readToolAsset(env, manifest.index_url) as { electorates?: { name: string; jurisdiction: string; state_code?: string }[] } | null
  return [...new Set((index?.electorates ?? []).filter(e => e.jurisdiction === 'federal' && e.state_code === state).map(e => e.name))]
}
const grantCite = (env: ToolEnv, r: Record<string, unknown>): ToolCitation => {
  const individual = PRIVATE_KINDS.has(String(r.recipientKind)) || String(r.id).startsWith('aggregate:')
  const who = individual ? 'An individual recipient' : String(r.recipient || 'Recipient not recorded')
  const page = !individual && r.recipientAvailable && typeof r.recipientId === 'string' ? siteUrl(env, `/money/grants/${r.jurisdiction}/recipient/${encodeURIComponent(r.recipientId)}`) : null
  return { kind: 'record', value: Number(r.amount), url: page ?? (typeof r.url === 'string' && /^https:\/\//.test(r.url) ? r.url : siteUrl(env, '/money/grants')),
    text: `${who}: ${aud(r.amount)} grant "${clip(r.title, 90)}" from ${r.agency || 'agency not recorded'} (${r.year ?? 'year not recorded'}${r.electorate ? `, ${r.electorate}` : ''}${r.jurisdiction === 'qld' ? ', Queensland' : ''})` }
}

export const tool: ToolDefinition = {
  name: 'grants',
  description: 'Government grants: who received the biggest grants, filtered by words (program, purpose, recipient or agency), state (federal electorates in that state), electorate or years. Federal awards from GrantConnect and Queensland expenditure lines. Published award values, not payments received.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    query: { type: 'string', minLength: 2, maxLength: 160, description: 'Words in the grant title, program, recipient, agency or description.' },
    state: { type: 'string', enum: STATES, description: 'Grants recorded against federal electorates in this state (wa = Western Australia).' },
    electorate: { type: 'string', minLength: 2, maxLength: 80, description: 'One federal electorate, e.g. "Perth".' },
    jurisdiction: { type: 'string', enum: ['federal', 'qld'], description: 'Grant source: federal (default for state or electorate filters) or Queensland government.' },
    from_year: { type: 'integer', minimum: 2000, maximum: 2030 }, to_year: { type: 'integer', minimum: 2000, maximum: 2030 },
    each: { type: 'string', enum: ['recipient', 'grant'], description: 'recipient (default): one row per recipient, its largest matching grant; grant: every grant, so one recipient can fill the list.' },
    limit: { type: 'integer', minimum: 1, maximum: 10, description: 'Rows (default 5), largest first.' },
  }, examples: [{ state: 'wa' }, { state: 'wa', each: 'grant', limit: 10 }, { query: 'community health', electorate: 'Perth' }, { query: 'University of Queensland', jurisdiction: 'qld' }] },
  validate: args => !(Number(args.from_year) > Number(args.to_year)),
  stepLabel: args => ({ label: 'Checking grants', arg: clip(args.query ?? args.electorate ?? args.state ?? '', 40) }),
  async handler(env, args) {
    const limit = Number(args.limit) || 5, perRecipient = args.each !== 'grant'
    const seats = typeof args.electorate === 'string' ? [args.electorate.trim()] : typeof args.state === 'string' ? await stateSeats(env, args.state) : null
    if (seats && !seats.length) return { rows: [], citations: [], notes: ['No federal electorates are recorded for that state.'] }
    const jurisdiction = typeof args.jurisdiction === 'string' ? args.jurisdiction : seats ? 'federal' : undefined
    const years = args.from_year || args.to_year ? JSON.stringify({ ...(args.from_year ? { min: args.from_year } : {}), ...(args.to_year ? { max: args.to_year } : {}) }) : undefined
    const page = await tableRows(env, 'grants', { q: typeof args.query === 'string' ? args.query : undefined, ...(seats ? { 'f.electorate': JSON.stringify(seats) } : {}),
      ...(jurisdiction ? { 'f.jurisdiction': JSON.stringify([jurisdiction]) } : {}), ...(years ? { 'f.year': years } : {}), sort: 'amount:desc', pageSize: String(perRecipient ? 200 : limit) })
    const seen = new Set<string>()
    const picked = page.rows.filter(r => { const key = String(r.recipientId || r.recipient || r.id); if (perRecipient && seen.has(key)) return false; seen.add(key); return true }).slice(0, limit)
    const citations = picked.map(r => grantCite(env, r))
    const rows = picked.map((r, i) => ({ recipient: citations[i].text.split(':')[0], amount_aud: r.amount, title: clip(r.title, 90), agency: r.agency, year: r.year, electorate: r.electorate || null, jurisdiction: r.jurisdiction }))
    const notes = ['Grant values are published award values (Queensland: annual expenditure lines), not payments received.']
    if (perRecipient) notes.push('One row per recipient: its largest matching grant, not its total.')
    if (seats && args.state) notes.push(`Located by the federal electorate recorded on each grant in ${String(args.state).toUpperCase()}; grants with no electorate are not included.`)
    if (!rows.length) notes.unshift('No published grant matches.')
    return { rows, total: page.total, citations, notes }
  },
}
