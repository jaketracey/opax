/** Commonwealth contracts (AusTender) by agency, supplier or subject: published agency profiles and the contracts table. */
import { aud, clip, fold, readableRange, siteUrl, tableRows } from './record-common'
import { readToolAsset, type ToolCitation, type ToolDefinition, type ToolEnv } from './types'

interface Agency { id: string; name: string; total: number; count: number; first_year?: number; last_year?: number }
interface AgencyProfile extends Agency { suppliers?: { id: string; name: string; total: number; count: number }[]; withheld?: { id: string; amount: number; agency?: string; status?: string; caveat?: string }[] }
interface Withheld { id: string; amount: number; agency?: string; status?: string; caveat?: string }
interface SupplierProfile { id: string; name: string; total: number; count: number; agencies?: { name: string; total: number; count: number }[]; first_year?: number | null; last_year?: number | null; withheld?: Withheld[] }
/** " (2019 to 2024)" for a recorded year span, nothing when the profile has no dated contract (search-hubs-003). */
const span = (first?: number | null, last?: number | null, sep = ' to ') => first && last ? ` (${first}${sep}${last})` : ''
/** Contracts a profile lists but leaves out of its totals, said in the source's terms (contracts-grants-001/004). */
const withheldNote = (name: string, rows?: Withheld[]) => rows?.length
  ? `${rows.length.toLocaleString('en-AU')} ${name} contract${rows.length === 1 ? ' is' : 's are'} listed but not counted in these totals: ${rows.slice(0, 3).map(r => `${r.id} (${aud(r.amount)}${r.agency ? ', ' + r.agency : ''}): ${clip(r.caveat ?? 'not counted', 400)}`).join(' ')}`
  : null
const NOTE = 'AusTender contract notices from Commonwealth agencies: values are contract values as published (including later amendments), not payments, and a supplier name follows the notice.'

/** The agency a phrase names: exact name first, then every word, preferring the largest buyer ("Defence" is the Department of Defence). */
export async function findAgency(env: ToolEnv, phrase: string): Promise<Agency | null> {
  const list = (await readToolAsset(env, '/agencies.json') as { agencies?: Agency[] } | null)?.agencies ?? []
  const want = fold(phrase).replace(/^the /, ''), words = want.split(' ').filter(w => !['the', 'of', 'department', 'dept', 'and'].includes(w))
  return list.find(a => fold(a.name) === want) ?? list.filter(a => words.length && words.every(w => fold(a.name).split(/[^a-z0-9']+/).includes(w))).sort((a, b) => b.total - a.total)[0] ?? null
}
const contractCite = (env: ToolEnv, r: Record<string, unknown>): ToolCitation => ({ kind: 'record', value: Number(r.amount),
  url: typeof r.url === 'string' && /^https:\/\//.test(r.url) ? r.url : siteUrl(env, `/subject/supplier/${r.supplier_id}`),
  text: `${r.supplier}: ${aud(r.amount)} contract "${clip(r.title, 90)}" with ${r.agency} (${[readableRange(r.start_date, r.end_date), `${r.procurement_method ?? 'method not recorded'} tender`, r.id].filter(Boolean).join(', ')})` })

export const tool: ToolDefinition = {
  name: 'contracts',
  description: 'Commonwealth government contracts (AusTender): who got a contract and supplier totals. With agency: the agency\'s contract total and its largest suppliers by total contract value. To find which department gives a supplier the most contracts, pass the supplier in supplier and choose group_by: agency. Returns buying agencies ranked by value or count, with ties. With supplier alone: totals, buying agencies and largest contracts. With query: the largest contracts matching the words. Contract values as published, not payments.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    agency: { type: 'string', minLength: 2, maxLength: 160, description: 'Buying agency, e.g. "Department of Defence" or "Defence".' },
    supplier: { type: 'string', minLength: 2, maxLength: 160, description: 'Supplier name, e.g. "Thales Australia".' },
    query: { type: 'string', minLength: 2, maxLength: 160, description: 'Words in the contract title, description, supplier or agency.' },
    group_by: { type: 'string', enum: ['agency', 'contract'], description: 'For a supplier, agency returns the complete published buying-agency aggregates.' },
    rank_by: { type: 'string', enum: ['value', 'count'], description: 'Agency ranking basis, default value. Use count for the number of contracts.' },
    limit: { type: 'integer', minimum: 1, maximum: 10, description: 'Rows (default 5).' },
  }, examples: [{ agency: 'Defence' }, { supplier: 'Thales Australia' }, { query: 'submarine maintenance' }, { agency: 'Department of Health', query: 'vaccine' }] },
  stepLabel: args => ({ label: 'Checking contracts', arg: clip(args.agency ?? args.supplier ?? args.query ?? '', 40) }),
  async handler(env, args) {
    const limit = Number(args.limit) || 5, citations: ToolCitation[] = [], rows: unknown[] = [], notes = [NOTE]
    const agencyName = typeof args.agency === 'string' ? args.agency : '', supplier = typeof args.supplier === 'string' ? args.supplier : '', query = typeof args.query === 'string' ? args.query : ''
    const agency = agencyName ? await findAgency(env, agencyName) : null
    if (agencyName && !agency) return { rows: [], citations: [], notes: [`No Commonwealth agency in the contract record matches "${clip(agencyName, 60)}".`, NOTE] }
    if (agency && !supplier && !query) {
      const profile = await readToolAsset(env, `/agencies/${agency.id}.json`) as AgencyProfile | null
      if (!profile || profile.id !== agency.id) return { rows: [], citations: [], notes: [], error: 'The agency contract profile is unavailable.' }
      citations.push({ kind: 'record', value: profile.total, url: siteUrl(env, `/subject/agency/${agency.id}`), text: `${profile.name}: ${aud(profile.total)} across ${profile.count.toLocaleString('en-AU')} published contracts${readableRange(profile.first_year, profile.last_year) ? ` (${readableRange(profile.first_year, profile.last_year)})` : ''}` })
      for (const s of (profile.suppliers ?? []).slice(0, limit)) {
        citations.push({ kind: 'record', value: s.total, url: siteUrl(env, `/subject/supplier/${s.id}`), text: `${s.name}: ${aud(s.total)} across ${s.count.toLocaleString('en-AU')} ${profile.name} contracts` })
        rows.push({ supplier: s.name, total_aud: Math.round(s.total), contracts: s.count })
      }
      const held = withheldNote(profile.name, profile.withheld)
      if (held) notes.push(held)
      return { rows, citations, notes }
    }
    if (supplier && !query && !agency) {
      const directory = await readToolAsset(env, '/suppliers.json') as { suppliers?: (SupplierProfile & { aliases?: string[]; agency_count?: number })[] } | null
      const match = directory?.suppliers?.find(r => [r.name, r.id, ...r.aliases ?? []].some(name => fold(name) === fold(supplier)))
      const found = match ? { rows: [match] } : await tableRows(env, 'suppliers', { q: supplier, sort: 'total:desc', pageSize: '3' })
      const top = found.rows.find(r => fold(r.name) === fold(supplier)) ?? found.rows[0]
      if (!top) return { rows: [], citations: [], notes: [`No supplier in the contract record matches "${clip(supplier, 60)}".`, NOTE] }
      const id = String(top.id)
      const profile = /^s-[a-f0-9]{20}$/.test(id) ? (await readToolAsset(env, `/suppliers/${id.slice(2, 4)}.json`) as { profiles?: Record<string, SupplierProfile> } | null)?.profiles?.[id] : undefined
      if (profile?.id === id && profile.agencies?.length) {
        const ranked = [...profile.agencies].sort((a, b) => args.rank_by === 'count' ? b.count - a.count || b.total - a.total : b.total - a.total || b.count - a.count)
        const leaders = ranked.filter(a => args.rank_by === 'count' ? a.count === ranked[0].count : a.total === ranked[0].total)
        const picked = [...new Set([...leaders, ...ranked.slice(0, limit)])]
        const countLeaders = profile.agencies.filter(a => a.count === Math.max(...profile.agencies!.map(a => a.count)))
        const href = siteUrl(env, `/subject/supplier/${id}`)
        const agencyCitations = [...new Set([...picked, ...countLeaders])].map(a => ({ kind: 'record' as const, value: a.total, url: href,
          text: `${a.name} awarded ${profile.name} ${aud(a.total)} across ${a.count.toLocaleString('en-AU')} Commonwealth contracts${leaders.includes(a) ? `, ${args.rank_by === 'count' ? 'the ' + (leaders.length > 1 ? 'joint ' : '') + 'highest contract count' : 'the largest total contract value'} for this supplier` : ''}${countLeaders.includes(a) && args.rank_by !== 'count' ? ', the ' + (countLeaders.length > 1 ? 'joint ' : '') + 'highest contract count for this supplier' : ''}${span(profile.first_year, profile.last_year)}.` }))
        const held = withheldNote(profile.name, profile.withheld)
        if (held) notes.push(held)
        if (args.group_by === 'agency' || !env.TABLE_DB) return { rows: picked.map(a => ({ agency: a.name, supplier: profile.name, total_aud: a.total, contracts: a.count })), citations: agencyCitations, notes: [...notes, 'Agency totals cover the published supplier profile; value rankings and contract-count rankings can differ.'], group_by: 'agency', rank_by: args.rank_by ?? 'value' }
        citations.push(...agencyCitations)
      } else if (profile?.id === id) {
        const held = withheldNote(profile.name, profile.withheld)
        if (held) notes.push(held)
      }
      citations.push({ kind: 'record', value: Number(top.total), url: siteUrl(env, `/subject/supplier/${top.id}`), text: `${top.name}: ${aud(top.total)} across ${Number(top.count).toLocaleString('en-AU')} Commonwealth contracts with ${top.agency_count} agencies${span(top.first_year as number | null, top.last_year as number | null, '–')}` })
      const contracts = await tableRows(env, 'contracts', { 'f.supplier_id': JSON.stringify([top.id]), sort: 'amount:desc', pageSize: String(limit) })
      for (const r of contracts.rows) { citations.push(contractCite(env, r)); rows.push({ supplier: r.supplier, amount_aud: r.amount, title: clip(r.title, 90), agency: r.agency, start: r.start_date }) }
      return { rows, citations, notes }
    }
    const page = await tableRows(env, 'contracts', { q: [query, supplier].filter(Boolean).join(' ') || undefined, ...(agency ? { 'f.agency': JSON.stringify([agency.name]) } : {}), sort: 'amount:desc', pageSize: String(limit) })
    for (const r of page.rows) { citations.push(contractCite(env, r)); rows.push({ supplier: r.supplier, amount_aud: r.amount, title: clip(r.title, 90), agency: r.agency, start: r.start_date }) }
    if (!rows.length) notes.unshift('No published contract matches.')
    return { rows, total: page.total, citations, notes }
  },
}
