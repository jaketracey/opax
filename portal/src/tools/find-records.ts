/** Discovery over the site-wide record catalog: which register holds a name or subject. No speeches. */
import { searchCatalog, CATALOG_KINDS, type CatalogRecord } from '../catalog-search'
import { tokens } from '../catalog-query.mjs'
import { clip, siteUrl } from './record-common'
import type { ToolDefinition } from './types'

const KINDS = [...CATALOG_KINDS].sort()
const LABEL: Record<string, string> = { pay: 'Parliamentary pay', receipt: 'Disclosed receipt', interest: 'Declared interest', expense: 'Parliamentary expenses', access: 'Lobbying access', 'audit report': 'Audit report' }

export const tool: ToolDefinition = {
  name: 'find_records',
  description: 'Discover which OPAX register holds a name or subject before fetching it: people, parties, donors and disclosed receipts, grants, contracts, suppliers, agencies, bills, declared interests, parliamentary pay, expenses, lobbying access, reports and audit reports. Returns up to 8 typed hits, each with its record link and a one-line summary. Hansard speeches are not in this catalog; use search for what was said.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    query: { type: 'string', minLength: 2, maxLength: 200, description: 'Names or subject words, e.g. "Thales Australia" or "Defence secretary pay".' },
    kind: { type: 'string', enum: KINDS, description: 'Optional: only this kind of record.' },
  }, required: ['query'], examples: [{ query: 'Thales Australia' }, { query: 'Penny Wong', kind: 'pay' }, { query: 'housing grants Perth', kind: 'grant' }] },
  stepLabel: args => ({ label: 'Finding records', arg: clip(args.query, 40) }),
  async handler(env, args) {
    if (!env.ASSETS) return { rows: [], citations: [], notes: [], error: 'The record catalog is unavailable.' }
    const query = String(args.query), kind = typeof args.kind === 'string' ? args.kind : 'all'
    const words = tokens(query).slice(0, 16)
    if (!words.length) return { rows: [], citations: [], notes: ['No searchable words in the query.'] }
    const url = new URL('https://opax.com.au/api/search-all?' + new URLSearchParams({ q: words.join(' '), kind }))
    let found = await searchCatalog(url, env.ASSETS, { perKind: 3 })
    // Every word must match first; then any longer word, so one unknown word does not hide the rest.
    if (!found.total) {
      const strong = words.filter((t: string) => t.length >= 4)
      if (strong.length) { url.searchParams.set('q', strong.join(' ')); found = await searchCatalog(url, env.ASSETS, { anyTerms: true, perKind: 3 }) }
    }
    const hits = (found.results as CatalogRecord[]).slice(0, 8)
    const rows = hits.map(r => ({ kind: r.kind, title: clip(r.title, 120), summary: clip(r.snippet, 200), url: siteUrl(env, r.href || '/doc/' + r.slug), ...(r.dateLabel || r.date ? { period: r.dateLabel || r.date } : {}) }))
    return {
      rows, total: found.total,
      citations: rows.map(r => ({ kind: 'record' as const, text: `${LABEL[r.kind] ?? r.kind[0].toUpperCase() + r.kind.slice(1)}: ${r.title}${r.summary ? ' — ' + r.summary : ''}`, url: r.url })),
      notes: [found.total ? 'Catalog hits are ranked matches, not complete totals; open the matching tool for figures.' : 'No catalog record matches these words.'],
    }
  },
}
