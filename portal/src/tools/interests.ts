/** Registers of members' interests (federal and Queensland) from the published interests table. */
import { personUrl } from '../../public/canonical-urls.js'
import { clip, fold, siteUrl, tableRows } from './record-common'
import { readToolAsset, type ToolCitation, type ToolDefinition, type ToolEnv } from './types'

const CATEGORIES = ['shareholdings', 'real_estate', 'directorships', 'trusts', 'gifts', 'travel', 'liabilities', 'memberships', 'other']
const LABEL: Record<string, string> = { shareholdings: 'a shareholding', real_estate: 'real estate', directorships: 'a directorship', trusts: 'a trust', gifts: 'a gift', travel: 'sponsored travel', liabilities: 'a liability', memberships: 'a membership', other: 'another interest' }
const HOLDER: Record<string, string> = { spouse: ' held by their spouse or partner', children: ' held by a dependent child' }
interface RegisterItem { holder?: string; description: string; kind?: string; date?: string; page?: number }
interface Register {
  name: string; jurisdiction: string; chamber: string; as_at?: string; statement_date?: string; source_url?: string
  buckets: Record<string, { count: number; items: RegisterItem[] }>
}
interface RegisterIndex { _by_name?: Record<string, string>; people?: Record<string, { name: string }> }
const categoryLabel = (category: string) => category === 'travel' ? 'sponsored travel or hospitality' : category.replaceAll('_', ' ')
const itemText = (item: RegisterItem) => `${item.description}${HOLDER[String(item.holder)] ?? ''}${item.kind === 'deletion' ? ' (removed' : item.kind === 'addition' ? ' (added' : ''}${['addition', 'deletion'].includes(item.kind ?? '') ? `${item.date ? ` ${item.date}` : ''})` : ''}`

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
  if (!/^(?:\d+|n-[a-z0-9-]+)$/.test(id)) throw new Error('Invalid register identifier')
  const register = await readToolAsset(env, `/interests/${id}.json`) as Register | null
  if (!register?.buckets) throw new Error('Member register unavailable')
  if (args.jurisdiction && args.jurisdiction !== register.jurisdiction) return { rows: [], citations: [], notes: [`The matching register for ${register.name} is ${register.jurisdiction === 'qld' ? 'Queensland' : 'federal'}, outside the requested jurisdiction. No declaration from it has been substituted.`] }
  const limit = Number(args.limit) || 20
  const query = typeof args.query === 'string' ? fold(args.query) : ''
  const href = register.source_url && /^https:\/\//.test(register.source_url) ? register.source_url : siteUrl(env, personUrl(register.name))
  const categories = Object.entries(register.buckets).filter(([category]) => !args.category || args.category === category)
  const summaries = categories.map(([category, bucket]) => ({ category, declared_entries: bucket.count, published_items: bucket.items.length,
    items: mergeRegisterItems(bucket.items).filter(item => !query || fold(item.description).includes(query)) }))
  const all = summaries.flatMap(s => s.items.map(item => ({ name: register.name, category: s.category, holder: item.holder ?? 'unspecified',
    description: item.description, kind: item.kind ?? 'statement', declaration_date: item.date ?? null,
    date: item.date ?? register.as_at ?? null, register_date: register.as_at ?? null, statement_date: register.statement_date ?? null,
    jurisdiction: register.jurisdiction, chamber: register.chamber, page: item.page ?? null,
    url: item.page ? `${href}#page=${item.page}` : href })))
  const rows = all.slice(0, limit)
  const citations: ToolCitation[] = summaries.filter(s => s.items.length || !query).map(s => {
    const shown = rows.filter(r => r.category === s.category)
    const merged = s.items.length < s.published_items && !query
    const listing = shown.map(r => itemText({ description: r.description, holder: r.holder, kind: r.kind, date: r.declaration_date ?? undefined })).join('; ')
    return { kind: 'record', url: href, text: merged && shown.length
      ? `${register.name} declared ${categoryLabel(s.category)}: ${listing} (${register.jurisdiction === 'qld' ? 'Queensland' : 'federal'} register of interests${register.as_at ? ` as at ${register.as_at}` : ''}${shown.length < s.items.length ? `; showing ${shown.length} of ${s.items.length} published items after combining overlapping descriptions` : ''}).`
      : `${register.name} declared ${query ? `${s.items.length} published matching` : s.declared_entries} ${categoryLabel(s.category)} entries${shown.length ? `: ${listing}` : ''} (${register.jurisdiction === 'qld' ? 'Queensland' : 'federal'} register of interests${register.as_at ? ` as at ${register.as_at}` : ''}${shown.length < (query ? s.items.length : s.declared_entries) ? `; showing ${shown.length} published items` : ''}).` }
  })
  const notes = ['Register entries include statements, additions and removals; an entry is not necessarily a current holding or evidence of a conflict of interest.']
  if (summaries.some(s => s.published_items < s.declared_entries)) notes.push('The public export contains a preview of each category. Declared entry counts come from the register; only the published items are listed here.')
  if (all.length > rows.length) notes.push(`Showing ${rows.length} of ${all.length} published items. Filter by category to see the remaining items.`)
  if (!all.length) notes.unshift(query ? 'No published item matches those words; unpublished preview items have not been searched.' : 'No entries in the requested category are published for this member.')
  return { rows, total: query ? all.length : summaries.reduce((n, s) => n + s.declared_entries, 0), published_items: all.length,
    register_date: register.as_at ?? null, statement_date: register.statement_date ?? null,
    categories: summaries.map(({ items, ...s }) => s), citations, notes }
}
/** Sitting federal ministers (Cabinet, outer ministry and assistant ministers) from the current pay roster. */
async function ministers(env: ToolEnv): Promise<string[]> {
  const pay = await readToolAsset(env, '/pay.json') as { current?: { name: string; post: string }[] } | null
  return (pay?.current ?? []).filter(c => /\b(?:Minister|Treasurer|Attorney-General)\b/.test(c.post) && !/\bShadow\b/.test(c.post)).map(c => c.name)
}
async function rosterName(env: ToolEnv, name: string): Promise<string | null> {
  const people = (await readToolAsset(env, '/parliamentarians.json') as { people?: { name: string; speeches?: number }[] } | null)?.people ?? []
  const want = fold(name), words = want.split(' ')
  return people.find(p => fold(p.name) === want)?.name ?? people.filter(p => words.every(w => fold(p.name).split(' ').includes(w))).sort((a, b) => (b.speeches ?? 0) - (a.speeches ?? 0))[0]?.name ?? null
}

export const tool: ToolDefinition = {
  name: 'declared_interests',
  description: 'Registers of members\' interests (federal and Queensland). For a named member pass person and the requested category: returns declared items, holders, entry counts, register date and addition/removal dates. Covers register members even without speeches. Published items can be a preview; category counts cover the register. Filter across members by category, ministers or declaration words. A declaration is not evidence of a conflict.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    person: { type: 'string', minLength: 2, maxLength: 120, description: 'A member\'s name.' },
    jurisdiction: { type: 'string', enum: ['federal', 'qld'], description: 'Require this register jurisdiction; never substitute a different parliament.' },
    category: { type: 'string', enum: CATEGORIES },
    ministers: { type: 'boolean', description: 'Only sitting federal ministers (including assistant ministers).' },
    query: { type: 'string', minLength: 2, maxLength: 120, description: 'Words in the declaration, e.g. a company name.' },
    limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Rows: published items for one person (default 20), otherwise members (default 12). Use category to focus a member lookup.' },
  }, examples: [{ ministers: true, category: 'shareholdings' }, { person: 'Penny Wong' }, { query: 'Qantas', category: 'gifts' }] },
  stepLabel: args => ({ label: 'Checking declared interests', arg: clip(args.person ?? args.query ?? args.category ?? '', 40) }),
  async handler(env, args) {
    if (typeof args.person === 'string') {
      const register = await memberRegister(env, args)
      if (register) return register
    }
    const limit = Number(args.limit) || (typeof args.person === 'string' ? 8 : 12)
    let names: string[] | null = null
    if (typeof args.person === 'string') {
      const name = await rosterName(env, args.person)
      names = [name ?? args.person.trim()]
    } else if (args.ministers === true) names = await ministers(env)
    if (names && !names.length) return { rows: [], citations: [], notes: [], error: 'The current ministry is unavailable.' }
    // One person: their declarations. Several people (ministers, a category, a company): one line per member, so a
    // long register does not fill the answer with one name.
    const grouped = !(typeof args.person === 'string')
    const page = await tableRows(env, 'interests', { q: typeof args.query === 'string' ? args.query : undefined, ...(names ? { 'f.name': JSON.stringify(names) } : {}), ...(args.jurisdiction ? { 'f.jurisdiction': JSON.stringify([args.jurisdiction]) } : {}),
      ...(typeof args.category === 'string' ? { 'f.category': JSON.stringify([args.category]) } : {}), sort: 'name:asc', pageSize: grouped ? '200' : String(limit) })
    const href = (r: Record<string, unknown>) => personUrl(String(r.name)) === '/subject/person' ? (typeof r.url === 'string' && /^https:\/\//.test(r.url) ? r.url : siteUrl(env, '/subject/person')) : siteUrl(env, personUrl(String(r.name)))
    const register = (r: Record<string, unknown>) => `${r.jurisdiction === 'qld' ? 'Queensland' : 'federal'} register, ${r.date ?? 'date not recorded'}`
    const what = (r: Record<string, unknown>) => `${clip(r.description, 90)}${HOLDER[String(r.holder)] ? ` (${String(r.holder) === 'spouse' ? 'spouse or partner' : 'dependent child'})` : ''}`
    let citations: ToolCitation[], rows: unknown[]
    if (grouped) {
      const people = new Map<string, Record<string, unknown>[]>()
      for (const r of page.rows) people.set(String(r.name), [...(people.get(String(r.name)) ?? []), r])
      const members = [...people.values()].slice(0, limit)
      citations = members.map(list => ({ kind: 'record' as const, url: href(list[0]),
        text: `${list[0].name} declared ${list.length} ${typeof args.category === 'string' ? String(args.category).replace('_', ' ') : 'interests'}: ${list.slice(0, 3).map(what).join('; ')}${list.length > 3 ? `; and ${list.length - 3} more` : ''} (${register(list[0])})` }))
      rows = members.map(list => ({ name: list[0].name, declarations: list.length, first: list.slice(0, 3).map(r => ({ category: r.category, holder: r.holder, description: clip(r.description, 90) })) }))
    } else {
      citations = page.rows.map(r => ({ kind: 'record' as const, url: href(r), text: `${r.name} declared ${LABEL[String(r.category)] ?? String(r.category)}${HOLDER[String(r.holder)] ?? ''}: ${clip(r.description, 140)} (${register(r)})` }))
      rows = page.rows.map(r => ({ name: r.name, category: r.category, holder: r.holder, description: r.description, date: r.date, jurisdiction: r.jurisdiction }))
    }
    const notes = ['Registers of interests as published; a declaration is not evidence of a conflict of interest.']
    if (page.total > page.rows.length) notes.push(`${page.total.toLocaleString('en-AU')} matching declarations; the first ${page.rows.length} by member name are summarised.`)
    if (args.ministers === true) notes.push('Ministers are the sitting federal ministers and assistant ministers in the pay roster.')
    if (!citations.length) notes.unshift('No published declaration matches.')
    return { rows, total: page.total, citations, notes }
  },
}
