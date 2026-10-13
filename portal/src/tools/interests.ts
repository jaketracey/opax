/** Registers of members' interests (federal and Queensland) from the published interests table. */
import { personUrl } from '../../public/canonical-urls.js'
import { clip, fold, siteUrl, tableRows } from './record-common'
import { readToolAsset, type ToolCitation, type ToolDefinition, type ToolEnv } from './types'

const CATEGORIES = ['shareholdings', 'real_estate', 'directorships', 'trusts', 'gifts', 'travel', 'liabilities', 'memberships', 'other']
const LABEL: Record<string, string> = { shareholdings: 'a shareholding', real_estate: 'real estate', directorships: 'a directorship', trusts: 'a trust', gifts: 'a gift', travel: 'sponsored travel', liabilities: 'a liability', memberships: 'a membership', other: 'another interest' }
const HOLDER: Record<string, string> = { spouse: ' held by their spouse or partner', children: ' held by a dependent child' }
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
  description: 'Registers of members\' interests (federal parliament and Queensland): declared shareholdings, real estate, directorships, trusts, gifts, sponsored travel, liabilities and memberships. Filter by person, by category, to sitting federal ministers, or by words in the declaration. A declaration is not evidence of a conflict.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    person: { type: 'string', minLength: 2, maxLength: 120, description: 'A member\'s name.' },
    category: { type: 'string', enum: CATEGORIES },
    ministers: { type: 'boolean', description: 'Only sitting federal ministers (including assistant ministers).' },
    query: { type: 'string', minLength: 2, maxLength: 120, description: 'Words in the declaration, e.g. a company name.' },
    limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Rows: declarations for one person (default 8), otherwise members (default 12).' },
  }, examples: [{ ministers: true, category: 'shareholdings' }, { person: 'Penny Wong' }, { query: 'Qantas', category: 'gifts' }] },
  stepLabel: args => ({ label: 'Checking declared interests', arg: clip(args.person ?? args.query ?? args.category ?? '', 40) }),
  async handler(env, args) {
    const limit = Number(args.limit) || (typeof args.person === 'string' ? 8 : 12)
    let names: string[] | null = null
    if (typeof args.person === 'string') {
      const name = await rosterName(env, args.person)
      if (!name) return { rows: [], citations: [], notes: [`No member named "${clip(args.person, 60)}" is in the roster.`] }
      names = [name]
    } else if (args.ministers === true) names = await ministers(env)
    if (names && !names.length) return { rows: [], citations: [], notes: [], error: 'The current ministry is unavailable.' }
    // One person: their declarations. Several people (ministers, a category, a company): one line per member, so a
    // long register does not fill the answer with one name.
    const grouped = !(typeof args.person === 'string')
    const page = await tableRows(env, 'interests', { q: typeof args.query === 'string' ? args.query : undefined, ...(names ? { 'f.name': JSON.stringify(names) } : {}),
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
      rows = page.rows.map(r => ({ name: r.name, category: r.category, holder: r.holder, description: clip(r.description, 140), date: r.date, jurisdiction: r.jurisdiction }))
    }
    const notes = ['Registers of interests as published; a declaration is not evidence of a conflict of interest.']
    if (page.total > page.rows.length) notes.push(`${page.total.toLocaleString('en-AU')} matching declarations; the first ${page.rows.length} by member name are summarised.`)
    if (args.ministers === true) notes.push('Ministers are the sitting federal ministers and assistant ministers in the pay roster.')
    if (!citations.length) notes.unshift('No published declaration matches.')
    return { rows, total: page.total, citations, notes }
  },
}
