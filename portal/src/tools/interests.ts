/** Registers of members' interests (federal and Queensland) from the public register exports. */
import { personUrl } from '../../public/canonical-urls.js'
import { clip, fold, siteUrl } from './record-common'
import { ASK_CHAMBERS, canonicalChamber } from '../ask-chamber'
import { readToolAsset, type ToolCitation, type ToolDefinition, type ToolEnv } from './types'

const CATEGORIES = ['shareholdings', 'real_estate', 'directorships', 'trusts', 'gifts', 'travel', 'liabilities', 'memberships', 'other']
const HOLDER: Record<string, string> = { spouse: ' held by their spouse or partner', children: ' held by a dependent child' }
interface RegisterItem { holder?: string; description: string; kind?: string; date?: string; page?: number }
interface Register {
  name: string; jurisdiction: string; chamber: string; as_at?: string; statement_date?: string; source_url?: string
  buckets: Record<string, { count: number; items: RegisterItem[] }>
}
interface RegisterIndex { _by_name?: Record<string, string>; people?: Record<string, { name: string }> }
const categoryLabel = (category: string) => category === 'travel' ? 'sponsored travel or hospitality' : category.replaceAll('_', ' ')
const itemText = (item: RegisterItem) => `${item.description}${HOLDER[String(item.holder)] ?? ''}${item.kind === 'deletion' ? ' (removed' : item.kind === 'addition' ? ' (added' : ''}${['addition', 'deletion'].includes(item.kind ?? '') ? `${item.date ? ` ${item.date}` : ''})` : ''}`
const registerDate = (r: Register) => r.as_at?.trim() || r.statement_date?.trim() || null
const dated = (item: RegisterItem, r: Register) => item.date?.trim() || registerDate(r)
const inPeriod = (date: string | null, args: Record<string, unknown>) => !(args.since || args.until) || !!date && (!args.since || date >= String(args.since)) && (!args.until || date <= String(args.until))
const matchesRegister = (r: Register, args: Record<string, unknown>) => (!args.jurisdiction || args.jurisdiction === r.jurisdiction) && (!args.chamber || args.chamber === canonicalChamber(r.chamber))
const scopeLabel = (args: Record<string, unknown>) => [args.jurisdiction, args.chamber === 'representatives' ? 'House of Representatives' : args.chamber === 'senate' ? 'Senate' : args.chamber, args.category, args.since || args.until ? `from ${args.since ?? 'the start of the record'} to ${args.until ?? 'the present'}` : null].filter(Boolean).join(' ')

/** Prefer an expanded copy of the same declaration; retain different holders and alterations. */
export function mergeRegisterItems(items: RegisterItem[]): RegisterItem[] {
  const same = (a: RegisterItem, b: RegisterItem) => (a.holder ?? 'unspecified') === (b.holder ?? 'unspecified') &&
    (a.kind ?? 'statement') === (b.kind ?? 'statement') && a.date === b.date && a.page === b.page
  const contains = (a: string, b: string) => a === b || a.startsWith(b + ',') || a.startsWith(b + ';')
  return items.filter((item, i) => !items.some((other, j) => i !== j && same(item, other) &&
    contains(fold(other.description), fold(item.description)) && (fold(other.description).length > fold(item.description).length || j < i)))
}

/** The register has its own member directory, including members absent from the speech roster. */
async function memberRegister(env: ToolEnv, args: Record<string, unknown>) {
  const index = await readToolAsset(env, '/interests/index.json') as RegisterIndex | null
  if (!index?._by_name || !index.people) return null
  const want = fold(args.person), words = want.split(' ')
  const exact = index._by_name[want]
  const candidates = exact ? [exact] : Object.entries(index.people).filter(([, p]) => words.every(w => fold(p.name).split(/[\s-]+/).includes(w))).map(([id]) => id)
  if (candidates.length !== 1) return { rows: [], citations: [], notes: [candidates.length ? 'Several register members match; use their full name.' : `No published register member matches "${clip(args.person, 80)}".`] }
  const id = candidates[0]
  if (!/^(?:\d+|aph_\d+|n-[a-z0-9-]+)$/.test(id)) throw new Error('Invalid register identifier')
  const register = await readToolAsset(env, `/interests/${id}.json`) as Register | null
  if (!register?.buckets) throw new Error('Member register unavailable')
  if (args.jurisdiction && args.jurisdiction !== register.jurisdiction) return { rows: [], citations: [], notes: [`The matching register for ${register.name} is ${register.jurisdiction === 'qld' ? 'Queensland' : 'federal'}, outside the requested jurisdiction. No declaration from it has been substituted.`] }
  if (!matchesRegister(register, args)) return { rows: [], citations: [], notes: [`The matching register for ${register.name} is outside the requested chamber. No declaration from it has been substituted.`] }
  const limit = Number(args.limit) || 20
  const query = typeof args.query === 'string' ? fold(args.query) : ''
  const href = register.source_url && /^https:\/\//.test(register.source_url) ? register.source_url : siteUrl(env, personUrl(register.name))
  const categories = Object.entries(register.buckets).filter(([category]) => !args.category || args.category === category)
  const summaries = categories.map(([category, bucket]) => ({ category, declared_entries: bucket.count, published_items: bucket.items.length,
    items: mergeRegisterItems(bucket.items).filter(item => (!query || fold(item.description).includes(query)) && inPeriod(dated(item, register), args)) }))
  const all = summaries.flatMap(s => s.items.map(item => ({ name: register.name, category: s.category, holder: item.holder ?? 'unspecified',
    description: item.description, kind: item.kind ?? 'statement', declaration_date: item.date ?? null,
    date: dated(item, register), register_date: registerDate(register), statement_date: register.statement_date || null,
    jurisdiction: register.jurisdiction, chamber: register.chamber, page: item.page ?? null,
    url: item.page ? `${href}#page=${item.page}` : href })))
  const rows = all.slice(0, limit)
  const filtered = !!(query || args.since || args.until)
  const citations: ToolCitation[] = summaries.filter(s => s.items.length || !filtered).map(s => {
    const shown = rows.filter(r => r.category === s.category)
    const merged = s.items.length < s.published_items && !filtered
    const listing = shown.map(r => itemText({ description: r.description, holder: r.holder, kind: r.kind, date: r.declaration_date ?? undefined })).join('; ')
    return { kind: 'record', url: href, text: merged && shown.length
      ? `${register.name} declared ${categoryLabel(s.category)}: ${listing} (${register.jurisdiction === 'qld' ? 'Queensland' : 'federal'} register of interests${registerDate(register) ? ` as at ${registerDate(register)}` : ''}${shown.length < s.items.length ? `; showing ${shown.length} of ${s.items.length} published items after combining overlapping descriptions` : ''}).`
      : `${register.name} declared ${filtered ? `${s.items.length} published matching` : s.declared_entries} ${categoryLabel(s.category)} entries${shown.length ? `: ${listing}` : ''} (${register.jurisdiction === 'qld' ? 'Queensland' : 'federal'} register of interests${registerDate(register) ? ` as at ${registerDate(register)}` : ''}${shown.length < (filtered ? s.items.length : s.declared_entries) ? `; showing ${shown.length} published items` : ''}).` }
  })
  const notes = ['Register entries include statements, additions and removals; an entry is not necessarily a current holding or evidence of a conflict of interest.']
  if (summaries.some(s => s.published_items < s.declared_entries)) notes.push('The public export contains a preview of each category. Declared entry counts come from the register; only the published items are listed here.')
  if (all.length > rows.length) notes.push(`Showing ${rows.length} of ${all.length} published items. Filter by category to see the remaining items.`)
  if (!all.length) notes.unshift(query ? 'No published item matches those words; unpublished preview items have not been searched.' : 'No entries in the requested category are published for this member.')
  if (!all.length && (args.since || args.until)) {
    const text = `The published register preview has no matching declaration rows for ${register.name}: ${scopeLabel(args)}. This preview cannot establish that no such interests were declared.`
    citations.push({ kind: 'record', url: href, text }); notes.unshift(text)
  }
  return { rows, total: filtered ? all.length : summaries.reduce((n, s) => n + s.declared_entries, 0), published_items: all.length,
    register_date: registerDate(register), statement_date: register.statement_date || null,
    ...(args.since || args.until ? { coverage: { since: args.since ?? null, until: args.until ?? null, as_of: null, note: 'Published register items, filtered by lodgement/alteration date or register as-at date.' } } : {}),
    categories: summaries.map(({ items, ...s }) => s), citations, notes }
}
/** Sitting federal ministers (Cabinet, outer ministry and assistant ministers) from the current pay roster. */
async function ministers(env: ToolEnv): Promise<string[]> {
  const pay = await readToolAsset(env, '/pay.json') as { current?: { name: string; post: string }[] } | null
  return (pay?.current ?? []).filter(c => /\b(?:Minister|Treasurer|Attorney-General)\b/.test(c.post) && !/\bShadow\b/.test(c.post)).map(c => c.name)
}

export const tool: ToolDefinition = {
  name: 'declared_interests',
  description: 'Public federal/Queensland interests registers. Filter person, category, chamber, since/until, ministers or declaration words. Dates are lodgement/alteration dates or the stated register date, not gift receipt dates. Published items may be previews. A declaration does not establish a conflict.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    person: { type: 'string', minLength: 2, maxLength: 120, description: 'A member\'s name.' },
    jurisdiction: { type: 'string', enum: ['federal', 'qld', 'nsw', 'vic', 'sa', 'wa', 'tas', 'nt', 'act'], description: 'Require this parliament.' },
    chamber: { type: 'string', enum: ASK_CHAMBERS },
    since: { type: 'string', format: 'date' }, until: { type: 'string', format: 'date' },
    category: { type: 'string', enum: CATEGORIES },
    ministers: { type: 'boolean', description: 'Only sitting federal ministers (including assistant ministers).' },
    query: { type: 'string', minLength: 2, maxLength: 120, description: 'Words in the declaration, e.g. a company name.' },
    limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Maximum items for one person, otherwise members.' },
  }, examples: [{ ministers: true, category: 'shareholdings' }, { person: 'Penny Wong' }, { query: 'Qantas', category: 'gifts' }] },
  validate: args => !args.since || !args.until || String(args.since) <= String(args.until),
  stepLabel: args => ({ label: 'Checking declared interests', arg: clip(args.person ?? args.query ?? args.category ?? '', 40) }),
  async handler(env, args) {
    if (typeof args.person === 'string') {
      const register = await memberRegister(env, args)
      if (register) return register
    }
    const limit = Number(args.limit) || 12
    const names = args.ministers === true ? await ministers(env) : null
    if (names && !names.length) return { rows: [], citations: [], notes: [], error: 'The current ministry is unavailable.' }
    const index = await readToolAsset(env, '/interests/index.json') as RegisterIndex | null
    if (!index?.people) throw new Error('Register directory unavailable')
    // Use the same dated public registers as the member lookup. The older table projection can have
    // empty statement dates and omits the register date; filtering it first loses otherwise dated rows.
    const registers = await Promise.all(Object.keys(index.people).map(async id => {
      if (!/^(?:\d+|aph_\d+|n-[a-z0-9-]+)$/.test(id)) throw new Error('Invalid register identifier')
      const register = await readToolAsset(env, `/interests/${id}.json`) as Register | null
      if (!register?.buckets) throw new Error('Member register unavailable')
      return register
    }))
    const query = typeof args.query === 'string' ? fold(args.query) : ''
    const matched = registers.filter(r => matchesRegister(r, args) && (!names || names.some(n => fold(n) === fold(r.name))))
      .sort((a, b) => a.name.localeCompare(b.name, 'en-AU'))
    const members = matched.flatMap(register => {
      const items = Object.entries(register.buckets).filter(([category]) => !args.category || category === args.category)
        .flatMap(([category, bucket]) => mergeRegisterItems(bucket.items).filter(item => (!query || fold(item.description).includes(query)) && inPeriod(dated(item, register), args))
          .map(item => ({ category, ...item, date: dated(item, register), date_basis: item.date?.trim() ? 'lodgement or alteration' : 'register as at' })))
      return items.length ? [{ register, items }] : []
    })
    const selected = members.slice(0, limit)
    const cite = ({ register, items }: typeof members[number]): ToolCitation => {
      const dates = [...new Set(items.map(item => item.date).filter(Boolean))].sort()
      const period = dates.length ? `, ${dates.length === 1 ? dates[0] : `${dates[0]} to ${dates.at(-1)}`}` : ''
      const requested = args.since && args.until && String(args.since).endsWith('-01-01') && String(args.until) === String(args.since).slice(0, 4) + '-12-31' ? ` for calendar year ${String(args.since).slice(0, 4)}` : args.since || args.until ? ` from ${args.since ?? 'the start of the record'} to ${args.until ?? 'the present'}` : ''
      const listing = items.slice(0, 3).map(item => `${itemText({ ...item, date: item.date ?? undefined })}${item.date ? ` [${item.date_basis}: ${item.date}]` : ''}`).join('; ')
      const chamber = canonicalChamber(register.chamber) === 'representatives' ? 'House of Representatives' : canonicalChamber(register.chamber) === 'senate' ? 'Senate' : register.chamber
      return { kind: 'record', url: register.source_url || siteUrl(env, personUrl(register.name)),
        text: `${register.name} (${chamber}) declared ${typeof args.category === 'string' ? String(args.category).replaceAll('_', ' ') : 'interests'}${requested}: ${listing}${items.length > 3 ? '; other published preview items are not shown here' : ''} (${register.jurisdiction === 'qld' ? 'Queensland' : 'federal'} register${period}).` }
    }
    // The model also receives the citation texts as facts; leave room for both copies and adapter metadata.
    while (selected.length > 1 && new TextEncoder().encode(JSON.stringify(selected.map(m => ({ name: m.register.name, first: m.items.slice(0, 3), citation: cite(m).text, fact: cite(m).text })))).length > 11_000) selected.pop()
    const citations: ToolCitation[] = selected.map(cite)
    const notes = ['Registers of interests as published; a declaration is not evidence of a conflict of interest.',
      'Published items are previews, not complete registers. Dates are lodgement or alteration dates where recorded, otherwise the register as-at date; they do not establish when a gift was received.']
    if (members.length > selected.length) notes.push(`Showing ${selected.length} of ${members.length} members with matching published items, by member name.`)
    if (args.ministers === true) notes.push('Ministers are the sitting federal ministers and assistant ministers in the pay roster.')
    if (args.since || args.until) notes.push(`Requested register period: ${scopeLabel(args)}. Undated items are excluded.`)
    if (!members.length) {
      const text = `The published register preview has no matching declaration rows for ${scopeLabel(args) || 'the requested scope'}. This preview cannot establish that no such interests were declared.`
      citations.push({ kind: 'record', url: siteUrl(env, '/interests/index.json'), text })
      notes.unshift(text)
    }
    return { rows: selected.map(({ register: r, items }) => ({ name: r.name, chamber: canonicalChamber(r.chamber), jurisdiction: r.jurisdiction,
      register_date: registerDate(r), declarations: items.length, first: items.slice(0, 3) })),
      total: members.reduce((n, m) => n + m.items.length, 0), citations, notes,
      ...(args.since || args.until ? { coverage: { since: args.since ?? null, until: args.until ?? null, as_of: null, note: 'Published register preview items, filtered by lodgement/alteration date or register as-at date, not a complete register total.' } } : {}) }
  },
}
