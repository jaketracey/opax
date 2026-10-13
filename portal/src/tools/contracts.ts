/** Commonwealth contracts (AusTender) by agency, supplier or subject: published agency profiles and the contracts table. */
import { aud, clip, fold, siteUrl, tableRows } from './record-common'
import { readToolAsset, type ToolCitation, type ToolDefinition, type ToolEnv } from './types'

interface Agency { id: string; name: string; total: number; count: number; first_year?: number; last_year?: number }
interface AgencyProfile extends Agency { suppliers?: { id: string; name: string; total: number; count: number }[] }
const NOTE = 'AusTender contract notices from Commonwealth agencies: values are contract values as published (including later amendments), not payments, and a supplier name follows the notice.'

/** The agency a phrase names: exact name first, then every word, preferring the largest buyer ("Defence" is the Department of Defence). */
export async function findAgency(env: ToolEnv, phrase: string): Promise<Agency | null> {
  const list = (await readToolAsset(env, '/agencies.json') as { agencies?: Agency[] } | null)?.agencies ?? []
  const want = fold(phrase).replace(/^the /, ''), words = want.split(' ').filter(w => !['the', 'of', 'department', 'dept', 'and'].includes(w))
  return list.find(a => fold(a.name) === want) ?? list.filter(a => words.length && words.every(w => fold(a.name).split(/[^a-z0-9']+/).includes(w))).sort((a, b) => b.total - a.total)[0] ?? null
}
const contractCite = (env: ToolEnv, r: Record<string, unknown>): ToolCitation => ({ kind: 'record', value: Number(r.amount),
  url: typeof r.url === 'string' && /^https:\/\//.test(r.url) ? r.url : siteUrl(env, `/subject/supplier/${r.supplier_id}`),
  text: `${r.supplier}: ${aud(r.amount)} contract "${clip(r.title, 90)}" with ${r.agency} (${r.start_date ?? 'start not recorded'} to ${r.end_date ?? 'end not recorded'}, ${r.procurement_method ?? 'method not recorded'} tender, ${r.id})` })

export const tool: ToolDefinition = {
  name: 'contracts',
  description: 'Commonwealth government contracts (AusTender): who got a contract and supplier totals. With agency: the agency\'s contract total and its largest suppliers by total contract value. With supplier: that supplier\'s totals and largest contracts. With query: the largest contracts matching the words. Contract values as published, not payments.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    agency: { type: 'string', minLength: 2, maxLength: 160, description: 'Buying agency, e.g. "Department of Defence" or "Defence".' },
    supplier: { type: 'string', minLength: 2, maxLength: 160, description: 'Supplier name, e.g. "Thales Australia".' },
    query: { type: 'string', minLength: 2, maxLength: 160, description: 'Words in the contract title, description, supplier or agency.' },
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
      citations.push({ kind: 'record', value: profile.total, url: siteUrl(env, `/subject/agency/${agency.id}`), text: `${profile.name}: ${aud(profile.total)} across ${profile.count.toLocaleString('en-AU')} published contracts${profile.first_year ? ` (${profile.first_year}–${profile.last_year})` : ''}` })
      for (const s of (profile.suppliers ?? []).slice(0, limit)) {
        citations.push({ kind: 'record', value: s.total, url: siteUrl(env, `/subject/supplier/${s.id}`), text: `${s.name}: ${aud(s.total)} across ${s.count.toLocaleString('en-AU')} ${profile.name} contracts` })
        rows.push({ supplier: s.name, total_aud: Math.round(s.total), contracts: s.count })
      }
      return { rows, citations, notes }
    }
    if (supplier && !query && !agency) {
      const found = await tableRows(env, 'suppliers', { q: supplier, sort: 'total:desc', pageSize: '3' })
      const top = found.rows.find(r => fold(r.name) === fold(supplier)) ?? found.rows[0]
      if (!top) return { rows: [], citations: [], notes: [`No supplier in the contract record matches "${clip(supplier, 60)}".`, NOTE] }
      citations.push({ kind: 'record', value: Number(top.total), url: siteUrl(env, `/subject/supplier/${top.id}`), text: `${top.name}: ${aud(top.total)} across ${Number(top.count).toLocaleString('en-AU')} Commonwealth contracts with ${top.agency_count} agencies (${top.first_year}–${top.last_year})` })
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
