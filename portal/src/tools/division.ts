/** Recorded divisions, using the same published index, detail files and table as the division pages. */
import { tokens, normalize } from '../catalog-query.mjs'
import { clip, fold, siteUrl, tableRows } from './record-common'
import { aggregateDivisions, isDivisionParty, resolveDivisionParty, type DivisionSummary } from './division-aggregates'
import { readToolAsset, type ToolArgs, type ToolDefinition, type ToolEnv, type ToolCitation } from './types'
import { policyVotes } from './division-policy'

interface Member { name: string; party?: string | null; vote: string }
interface BillLink { key: string; title?: string }
interface DivisionFile {
  key: string; slug?: string; name?: string; date: string; house?: string; jurisdiction?: string;
  result?: string; ayes?: number; noes?: number; source_url?: string; members?: Member[];
  bills?: BillLink[]; _meta?: { member_coverage?: string };
}
interface Bill { key: string; title: string; short_title?: string; aliases?: string[]; divisions?: { key: string }[] }
const ID_PATTERN = '^(division-)?(federal-(senate|representatives)|(nsw|vic|sa|qld|act|nt|wa|tas)-(la|lc|ha))-[a-z0-9-]+$'
const ID = new RegExp(ID_PATTERN)
const keyOf = (id: string) => id.replace(/^division-/, '')
const CHAMBERS: Record<string, string> = { senate: 'Senate', representatives: 'House of Representatives', nsw_la: 'NSW Legislative Assembly', nsw_lc: 'NSW Legislative Council', vic_la: 'Victorian Legislative Assembly', vic_lc: 'Victorian Legislative Council', qld_la: 'Queensland Legislative Assembly', sa_ha: 'South Australian House of Assembly', sa_lc: 'South Australian Legislative Council', act_la: 'ACT Legislative Assembly', nt_la: 'Northern Territory Legislative Assembly', wa_la: 'Western Australian Legislative Assembly', wa_lc: 'Western Australian Legislative Council', tas_ha: 'Tasmanian House of Assembly', tas_lc: 'Tasmanian Legislative Council' }
const chamberOf = (row: { key: string; house?: string }) => row.house ?? (row.key.startsWith('federal-') ? row.key.split('-')[1] : row.key.split('-').slice(0, 2).join('_'))
const chamberName = (chamber: string) => CHAMBERS[chamber] ?? chamber
const majority = (ayes: number, noes: number) => ayes === noes ? null : ayes > noes ? 'aye' as const : 'no' as const
const partyKey = (value: string) => fold(resolveDivisionParty(value, []))
const titleMatches = (name: string, query: string) => {
  const held = tokens(name)
  return tokens(query).every(word => held.some(token => token.startsWith(word)))
}
const validDate = (date: unknown) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
const count = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null
const originalUrl = (value: unknown) => typeof value === 'string' && /^https?:\/\//.test(value) ? value : null
const inScope = (row: { key: string; date?: string; house?: string }, args: ToolArgs) =>
  (!args.jurisdiction || args.jurisdiction === 'all' || row.key.startsWith(String(args.jurisdiction) + '-')) &&
  (!args.chamber || chamberOf(row) === args.chamber) && (!args.date || row.date?.slice(0, 10) === args.date) &&
  (!args.since || !!row.date && row.date.slice(0, 10) >= String(args.since)) && (!args.until || !!row.date && row.date.slice(0, 10) <= String(args.until))
export const DIVISION_NOTES = [
  'Crossing the floor means an aye or no against a strict party majority, for parties with at least five recorded aye/no votes. Independents, unknown parties, ties, paired and absent votes are excluded.',
  'Party affiliations are the published labels and may reflect a later affiliation rather than the affiliation on the division date. Calculated dissent is not independently verified historical floor crossing.',
]

function detailRow(env: ToolEnv, division: DivisionFile, args: ToolArgs) {
  const members = (division.members ?? []).map(m => ({ name: m.name, party: m.party || null, vote: m.vote }))
  const parties = [...new Set(members.flatMap(m => m.party ? [m.party] : []))].sort()
  const party_majorities = parties.map(party => {
    const votes = members.filter(m => m.party === party)
    const ayes = votes.filter(m => m.vote === 'aye').length, noes = votes.filter(m => m.vote === 'no').length
    return { party, ayes, noes, majority: isDivisionParty(party) ? majority(ayes, noes) : null }
  })
  const crossed_floor = members.flatMap(m => {
    const party = party_majorities.find(p => p.party === m.party)
    return party && party.ayes + party.noes >= 5 && party.majority && ['aye', 'no'].includes(m.vote) && m.vote !== party.majority
      ? [{ ...m, party_vote: party.majority }] : []
  }).sort((a, b) => a.name.localeCompare(b.name))
  const ayes = count(division.ayes), noes = count(division.noes)
  const outcome = division.result === 'affirmative' ? 'passed' : division.result === 'negative' ? 'defeated' : ayes !== null && noes !== null ? ayes > noes ? 'passed' : 'defeated' : null
  const unknown_party_members = members.filter(m => !m.party).length
  const totals_match = ayes !== null && noes !== null && members.filter(m => m.vote === 'aye').length === ayes && members.filter(m => m.vote === 'no').length === noes
  const coverage = { member_coverage: division._meta?.member_coverage ?? 'unavailable', complete: division._meta?.member_coverage === 'recorded' && totals_match, unknown_party_members }
  return {
    id: division.key, chamber: chamberOf(division), date: division.date.slice(0, 10), title: division.name ?? '', outcome, ayes, noes,
    members, party_majorities, crossed_floor, coverage,
    ...(args.person ? { person_votes: members.filter(m => fold(m.name) === fold(args.person)) } : {}),
    ...(args.party ? { party_votes: party_majorities.filter(p => partyKey(p.party) === partyKey(String(args.party))) } : {}),
    url: siteUrl(env, '/doc/division-' + division.key), source_url: originalUrl(division.source_url),
  }
}
type Row = ReturnType<typeof detailRow>
/** Keep every vote in model context without repeating object keys for an entire chamber. Wire results keep objects. */
export function divisionModelRows(rows: unknown): unknown {
  return Array.isArray(rows) ? rows.map(row => {
    if (!row || typeof row !== 'object' || !Array.isArray(row.members)) return row
    return { ...row, member_fields: ['name', 'party', 'vote'], members: row.members.map((m: Member) => [m.name, m.party, m.vote]) }
  }) : rows
}
function citation(row: Row, args: ToolArgs): ToolCitation {
  let text = `Division ${row.outcome ?? 'outcome not recorded'}${row.ayes === null || row.noes === null ? '' : `, ${row.ayes} ayes to ${row.noes} noes`}: ${row.title} (${chamberName(row.chamber)}, ${row.date}).`
  if (args.person) text += row.person_votes?.length ? ' ' + row.person_votes.map(m => `${m.name} (${m.party ?? 'party not recorded'}) ${m.vote === 'aye' || m.vote === 'no' ? 'voted ' : 'was recorded as '}${m.vote}.`).join(' ') : ` ${args.person} has no recorded vote in this division; this does not establish absence.`
  if (args.party) text += row.party_votes?.length ? ' ' + row.party_votes.map(p => `${p.party} ${p.majority ? 'voted ' + p.majority + (p.ayes && p.noes ? ' by majority' : '') : 'had no strict party majority'} (${p.ayes} ayes, ${p.noes} noes).`).join(' ') : ` ${args.party} has no party-labelled aye or no vote recorded in this division.`
  const rebels = args.party ? row.crossed_floor.filter(m => partyKey(String(m.party)) === partyKey(String(args.party))) : row.crossed_floor
  text += rebels.length ? ` Against their published party majority: ${rebels.map(m => `${m.name} (${m.party}) voted ${m.vote}, party majority ${m.party_vote}`).join('; ')}.` : ` No votes against an eligible party majority ${row.coverage.complete && !row.coverage.unknown_party_members ? 'were recorded' : 'were identified among the available party-labelled votes'}.`
  if (!row.coverage.complete) text += ' The member list is partial or unavailable.'
  return { kind: 'record', text, url: row.url }
}

export const tool: ToolDefinition = {
  name: 'division',
  description: 'Look up a specific recorded federal or state division by exact date and chamber, title words, bill name/key or division_id. Use this for how a person or party voted in one division, its passed/defeated outcome, ayes/noes, party majorities and named floor crossers; use the division lookup for the single recorded vote. Returns full member lists with published party labels and source URLs. For outcomes, state the result and ayes/noes first. For who crossed the floor, use lookup and answer with the named members against their party majority, or state that none were recorded, retaining partial-list qualifications. Mention floor crossing only when asked. total is the number of matching divisions before row/byte limits, not the number or names of dissenters; a division outcome does not establish that the bill became law. operation floor_crossing counts member-votes against party majorities over date/since/until; party_agreement compares party and other_party over that period. Aggregates default to federal divisions unless a state chamber/jurisdiction is specified. Both aggregates use the published index, not a retrieved sample.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    operation: { type: 'string', enum: ['lookup', 'floor_crossing', 'party_agreement', 'policy_votes'], description: 'policy_votes aggregates a named party across every matching topic-title division, including linked bills and motions. Pass party and title (core policy words), not a single member or bill.' },
    chamber: { type: 'string', enum: Object.keys(CHAMBERS), description: 'Exact chamber, e.g. senate, representatives, nsw_lc, vic_la or qld_la.' },
    jurisdiction: { type: 'string', enum: ['all', 'federal', 'nsw', 'vic', 'qld', 'sa', 'act', 'nt', 'wa', 'tas'], description: 'Lookup defaults to all published divisions; aggregates default to federal.' },
    date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Exact division date, YYYY-MM-DD. Retain the exact day.' },
    title: { type: 'string', minLength: 2, maxLength: 300, description: 'Words from the division title, without the question, member name, chamber or date.' },
    bill: { type: 'string', minLength: 2, maxLength: 300, description: 'Bill name or published key. Uses the bill record\'s linked divisions.' },
    division_id: { type: 'string', pattern: ID_PATTERN, maxLength: 160 },
    person: { type: 'string', minLength: 2, maxLength: 120, description: 'Member name for a vote in the matching division, not a cross-division tally. Lookup only.' },
    party: { type: 'string', minLength: 2, maxLength: 120, description: 'Published party label; for agreement, the first party.' },
    other_party: { type: 'string', minLength: 2, maxLength: 120, description: 'Second party for party_agreement.' },
    since: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Inclusive period start, YYYY-MM-DD.' },
    until: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Inclusive period end, YYYY-MM-DD.' },
    limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Maximum detailed divisions, default 1. Response byte limits can return fewer; total is before limits.' },
  }, examples: [{ chamber: 'senate', date: '2015-03-18', title: 'Housing Affordability' }, { division_id: 'federal-senate-3719', person: 'Christopher Back' }, { operation: 'party_agreement', party: 'Liberal', other_party: 'Nationals', chamber: 'senate', since: '2010-01-01', until: '2010-12-31' }] },
  identifierFields: ['person', 'party', 'other_party'],
  validate(args) {
    if (!['division_id', 'date', 'title', 'bill', 'since', 'until'].some(key => typeof args[key] === 'string' && String(args[key]).trim())) return false
    if (['date', 'since', 'until'].some(key => args[key] !== undefined && !validDate(args[key]))) return false
    if (args.since && args.until && String(args.since) > String(args.until)) return false
    if (args.date && (args.since && String(args.date) < String(args.since) || args.until && String(args.date) > String(args.until))) return false
    if (args.title && !tokens(args.title).length || args.bill && !tokens(args.bill).length || args.division_id && !ID.test(String(args.division_id))) return false
    if (args.operation === 'policy_votes' && (!args.party || !args.title || args.person || args.bill || args.division_id || args.other_party)) return false
    if (args.operation && !['lookup', 'policy_votes'].includes(String(args.operation)) && (!args.date && !args.since && !args.until || args.person || args.title || args.division_id)) return false
    if (args.operation === 'party_agreement' && (!args.party || !args.other_party || partyKey(String(args.party)) === partyKey(String(args.other_party)))) return false
    return !args.other_party || args.operation === 'party_agreement'
  },
  stepLabel: args => ({ label: args.operation === 'policy_votes' ? 'Counting party votes on a policy' : args.operation === 'floor_crossing' ? 'Counting votes against party majorities' : args.operation === 'party_agreement' ? 'Comparing party votes' : 'Checking a recorded division', arg: clip(args.title ?? args.bill ?? args.division_id ?? args.date ?? '', 60) }),
  async handler(env, args) {
    const index = await readToolAsset(env, '/divisions/index.json') as { divisions?: DivisionSummary[] } | null
    if (!Array.isArray(index?.divisions)) throw new Error('Division index unavailable')
    let candidates = index.divisions.filter(d => ID.test(d.key) && inScope(d, args))
    if (args.operation && args.operation !== 'lookup' && !args.chamber && !args.jurisdiction) candidates = candidates.filter(d => d.key.startsWith('federal-'))
    if (args.operation === 'policy_votes') return policyVotes(env, args, candidates)
    if (args.division_id) candidates = candidates.filter(d => d.key === keyOf(String(args.division_id)))
    let bill: Bill | undefined, billTitleOnly = false
    if (args.bill) {
      const bills = await readToolAsset(env, '/bills/index.json') as { bills?: Bill[] } | null
      if (!Array.isArray(bills?.bills)) throw new Error('Bill index unavailable')
      const query = String(args.bill), exact = bills.bills.filter(b => b.key === query || [b.title, b.short_title, ...b.aliases ?? []].some(title => title && normalize(title) === normalize(query)))
      const matches = exact.length ? exact : bills.bills.filter(b => titleMatches(b.title, query))
      if (matches.length > 1) return { rows: matches.slice(0, 10).map(b => ({ bill_id: b.key, title: b.title })), total: matches.length, citations: [], notes: ['Several bills match; specify one of the bill keys or its full title before looking up divisions.'] }
      if (matches.length) {
        bill = await readToolAsset(env, `/bills/${matches[0].key}.json`) as Bill | undefined
        if (!Array.isArray(bill?.divisions)) throw new Error('Bill divisions unavailable')
        const ids = new Set(bill.divisions.map(d => d.key))
        candidates = candidates.filter(d => ids.has(d.key))
      } else {
        if (args.operation && args.operation !== 'lookup') return { rows: [], citations: [], notes: [], error: 'No linked bill entry matches. Aggregate by a date period and chamber, or find an exact bill key first.' }
        // State divisions can name bills that have no separate entry in the federal bill registry.
        args = { ...args, title: [args.bill, args.title].filter(Boolean).join(' ') }
        delete args.bill
        billTitleOnly = true
      }
    }
    if (args.operation === 'floor_crossing' || args.operation === 'party_agreement') return aggregateDivisions(env, args, candidates)
    let searchComplete = true
    // Exact dates use the division index before reading names, so a popular title cannot hide that day's vote.
    let named = new Map<string, string>()
    if (args.title && !args.date && !args.division_id && !args.bill) {
      const wanted = new Set(candidates.map(d => d.key))
      let seen = 0, available = Infinity
      for (let page = 1; seen < available && page <= 5; page++) {
        const jurisdiction = args.jurisdiction && args.jurisdiction !== 'all' ? args.jurisdiction : args.chamber ? ['senate', 'representatives'].includes(String(args.chamber)) ? 'federal' : String(args.chamber).split('_')[0] : undefined
        const result = await tableRows(env, 'divisions', { q: tokens(args.title).join(' '), ...(jurisdiction ? { 'f.jurisdiction': JSON.stringify([jurisdiction]) } : {}), ...(args.chamber ? { 'f.house': JSON.stringify([args.chamber]) } : {}), sort: 'date:desc', pageSize: '200', page: String(page) })
        available = result.total; seen += result.rows.length
        for (const row of result.rows) {
          const key = keyOf(String(row.id ?? '')), title = String(row.name ?? row.title ?? '')
          if (wanted.has(key) && titleMatches(title, String(args.title))) named.set(key, title)
        }
        if (!result.rows.length) break
      }
      searchComplete = seen >= available
      candidates = candidates.filter(d => named.has(d.key))
    }
    let loaded: DivisionFile[] = []
    // With exact date, id or bill, only that bounded selection needs detail reads to match title words.
    if (args.title && !named.size && (args.date || args.division_id || args.bill)) {
      for (let i = 0; i < candidates.length; i += 6) {
        const batch = await Promise.all(candidates.slice(i, i + 6).map(d => readToolAsset(env, `/divisions/division-${d.key}.json`) as Promise<DivisionFile | null>))
        if (batch.some(d => !d?.key)) throw new Error('Division detail unavailable')
        loaded.push(...batch.filter((d): d is DivisionFile => !!d && titleMatches(d.name ?? '', String(args.title)) && inScope(d, args)))
      }
      const ids = new Set(loaded.map(d => d.key)); candidates = candidates.filter(d => ids.has(d.key))
      named = new Map(loaded.map(d => [d.key, d.name ?? '']))
    }
    candidates.sort((a, b) => Number(normalize(named.get(b.key)) === normalize(args.title)) - Number(normalize(named.get(a.key)) === normalize(args.title)) || String(b.date).localeCompare(String(a.date)) || a.key.localeCompare(b.key))
    const total = candidates.length, rows: Row[] = [], citations: ToolCitation[] = []
    // offset and max_bytes are for other tools that page this lookup; neither is in the public schema.
    const offset = Number(args.offset) || 0, budget = Number(args.max_bytes) || 13_000
    for (const candidate of candidates.slice(offset, offset + (Number(args.limit) || 1))) {
      const detail = loaded.find(d => d.key === candidate.key) ?? await readToolAsset(env, `/divisions/division-${candidate.key}.json`) as DivisionFile | null
      if (!detail?.key || detail.key !== candidate.key || !inScope(detail, args)) throw new Error('Division detail unavailable or inconsistent')
      const row = detailRow(env, detail, args), cite = citation(row, args)
      if (rows.length && new TextEncoder().encode(JSON.stringify({ rows: [...rows, row], citations: [...citations, cite] })).length > budget) break
      rows.push(row); citations.push(cite)
    }
    if (bill) citations.push({ kind: 'count', text: `${bill.title}: ${total} matching recorded ${total === 1 ? 'division' : 'divisions'}${args.date ? ' on ' + args.date : ''}${args.since ? ' since ' + args.since : ''}${args.until ? ' until ' + args.until : ''}${args.chamber ? ' in the ' + chamberName(String(args.chamber)) : ''}${args.title ? ' with title words ' + String(args.title) : ''}.`, value: total, url: siteUrl(env, '/bill/' + bill.key) })
    if (!total) citations.push({ kind: 'record', text: `${searchComplete ? 'OPAX has no recorded division matching' : 'No matching recorded division was found in the bounded title search for'} ${[args.title, args.division_id, args.date, args.chamber, args.jurisdiction, args.since && 'since ' + args.since, args.until && 'until ' + args.until].filter(Boolean).join(', ')}${searchComplete ? '.' : '; more records may match. Narrow by exact date or bill.'}`, url: siteUrl(env, '/divisions/index.json') })
    return { rows, total, has_more: offset + rows.length < total || !searchComplete, search_complete: searchComplete, operation: 'lookup',
      ...(bill ? { bill: { id: bill.key, title: bill.title, linked_divisions: bill.divisions!.length } } : {}),
      citations, notes: [...DIVISION_NOTES, ...(billTitleOnly ? ['No separate linked bill entry matches. These divisions match the bill name in their titles; this does not establish a complete linked-bill division count.'] : []), ...(rows.length < total ? [`Showing ${rows.length} of ${total} matching divisions. Specify a division_id to select one unambiguously; do not present this row window as every vote.`] : []), ...(!searchComplete ? ['Title lookup reached its 1,000-record search window. total is a lower bound; narrow by exact date or bill.'] : []), ...(rows.some(r => !r.coverage.complete) ? ['Some member lists are partial or unavailable; missing members are not absent votes.'] : [])],
    }
  },
}
