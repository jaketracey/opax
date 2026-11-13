/** Discovery over the site-wide record catalog: which register holds a name or subject. No speeches. */
import { searchCatalog, CATALOG_KINDS, type CatalogRecord } from '../catalog-search'
import { tokens } from '../catalog-query.mjs'
import { billCitations, billFields, billKey, clip, siteUrl } from './record-common'
import type { ToolDefinition } from './types'
import { recipientTotal } from './grants'
import { campaignSpend } from './campaign-spend'
import { readToolAsset } from './types'
import { billTitleMatches, requestedBillTitle } from '../bill-title'
import { ASK_CHAMBERS } from '../ask-chamber'

const KINDS = [...CATALOG_KINDS].sort()
const LABEL: Record<string, string> = { pay: 'Parliamentary pay', receipt: 'Disclosed receipt', interest: 'Declared interest', expense: 'Parliamentary expenses', access: 'Lobbying access', 'audit report': 'Audit report' }

export const tool: ToolDefinition = {
  name: 'find_records',
  description: 'Discover which OPAX register holds a name or subject: people, parties, donors and disclosed receipts, grants, contracts, suppliers, agencies, federal bills, declared interests, parliamentary pay, expenses, lobbying access, reports and audit reports. Returns up to 8 typed hits. Federal bill hits include introduction, recorded stages, passage, royal assent, Act number and sponsor where recorded; answer date questions with the date first. Use legislation for ACT/Tasmania bills and federal instruments, public_finances for budget and state register cells, entity_profile for profile detail, and corpus_records for Hansard speeches, statements and committee passages. Use access_registers for filtered ministerial diaries, lobbyists and FITS, member_divisions for member voting history, sponsored_bills for a member\'s sponsorship list and count, annual_reports for Commonwealth entity annual report pay, staffing and spend, integrity_reports for integrity commission reports, and royal_commissions for royal commission reports, recommendations and their published status. Use the dedicated complete count for those totals.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    query: { type: 'string', minLength: 2, maxLength: 200, description: 'Names or subject words, e.g. "Thales Australia" or "Defence secretary pay".' },
    kind: { type: 'string', enum: KINDS, description: 'Optional: only this kind of record.' },
    jurisdiction: { type: 'string', enum: ['federal', 'qld', 'vic', 'nsw', 'sa', 'wa', 'tas', 'nt', 'act'], description: 'Only records from this government or parliament.' },
    chamber: { type: 'string', enum: ASK_CHAMBERS, description: 'Require this chamber.' },
    since: { type: 'string', format: 'date' }, until: { type: 'string', format: 'date' },
  }, required: ['query'], examples: [{ query: 'Thales Australia' }, { query: 'Penny Wong', kind: 'pay' }, { query: 'housing grants Perth', kind: 'grant' }] },
  stepLabel: args => ({ label: 'Finding records', arg: clip(args.query, 40) }),
  async handler(env, args) {
    if (!env.ASSETS) return { rows: [], citations: [], notes: [], error: 'The record catalog is unavailable.' }
    const query = String(args.query), kind = typeof args.kind === 'string' ? args.kind : 'all'
    if ((kind === 'all' || kind === 'register') && /\b(?:campaign|advertising|advert|recruitment)\b/i.test(query)) {
      try {
        const campaigns = await campaignSpend(env, { campaign: query, jurisdiction: args.jurisdiction })
        if (campaigns.rows.length) return campaigns
      } catch { env.signal?.throwIfAborted() }
    }
    const words = tokens(query).slice(0, 16)
    if (!words.length) return { rows: [], citations: [], notes: ['No searchable words in the query.'] }
    const url = new URL('https://opax.com.au/api/search-all?' + new URLSearchParams({ q: words.join(' '), kind }))
    if (typeof args.jurisdiction === 'string') url.searchParams.set('state', args.jurisdiction)
    for (const key of ['chamber', 'since', 'until']) if (typeof args[key] === 'string') url.searchParams.set(key, args[key] as string)
    // The ranked catalogue omits single-character tokens. Resolve explicit bill
    // titles and keys in the published index before numbers can be discarded.
    let exact: CatalogRecord[] = []
    if (['all', 'bill'].includes(kind) && (!args.jurisdiction || args.jurisdiction === 'federal')) {
      const title = requestedBillTitle(query) ?? query
      if (/\bbill\b/i.test(title) || /^au-[a-z0-9-]+$/.test(query)) {
        try {
          const index = await readToolAsset(env, '/bills/index.json') as { bills?: { key: string; title: string; short_title?: string; jurisdiction?: string }[] } | null
          exact = (index?.bills ?? []).filter(b => b.key === query || [b.title, b.short_title].some(t => billTitleMatches(t, title)))
            .map(b => ({ kind: 'bill', title: b.title, href: '/bill/' + b.key, slug: 'bill-' + b.key, resource: b.key, snippet: '', state: b.jurisdiction }))
        } catch { env.signal?.throwIfAborted() }
      }
    }
    let found = exact.length ? { results: exact, total: exact.length } : await searchCatalog(url, env.ASSETS, { perKind: 3 })
    // Every word must match first; then any longer word, so one unknown word does not hide the rest.
    if (!found.total) {
      const strong = words.filter((t: string) => t.length >= 4)
      if (strong.length) { url.searchParams.set('q', strong.join(' ')); found = await searchCatalog(url, env.ASSETS, { anyTerms: true, perKind: 3 }) }
    }
    const number = /\bno\.?\s*(\d+)\b/i.exec(query)?.[1]
    const hits = (found.results as CatalogRecord[]).filter(r => r.kind !== 'bill' || !number || /\bno\.?\s*(\d+)\b/i.exec(r.title)?.[1] === number).slice(0, 8)
    const enriched = await Promise.all(hits.map(async r => {
      const row = { kind: r.kind, title: r.kind === 'bill' ? r.title : clip(r.title, 120), summary: clip(r.snippet, 200), url: siteUrl(env, r.href || '/doc/' + r.slug), ...(r.dateLabel || r.date ? { period: r.dateLabel || r.date } : {}) }
      const recipient = r.kind === 'grant' && /across [\d,]+ grant records/.test(r.snippet) ? /^\/money\/grants\/(federal|qld)\/recipient\/([^?#]+)/.exec(r.href) : null
      if (recipient) {
        try {
          const total = await recipientTotal(env, { recipient: decodeURIComponent(recipient[2]), jurisdiction: recipient[1] })
          if (total.citations.length) return { row: { ...row, ...total.rows[0] as object }, citations: total.citations }
        } catch { env.signal?.throwIfAborted() }
      }
      if (r.kind !== 'bill') return { row, citations: [{ kind: 'record' as const, text: `${LABEL[r.kind] ?? r.kind[0].toUpperCase() + r.kind.slice(1)}: ${row.title}${row.summary ? ' — ' + row.summary : ''}`, url: row.url }] }
      const lifecycle = await billFields(env, billKey(r.href, r.slug))
      return { row: { ...row, ...lifecycle }, citations: billCitations(lifecycle, row.title, row.url, query) }
    }))
    let sizeLimited = false
    const result = () => ({
      rows: enriched.map(result => result.row), total: found.total, truncated: enriched.length < found.total,
      citations: [...enriched.flatMap(result => result.citations.slice(0, 1)), ...enriched.flatMap(result => result.citations.slice(1))],
      notes: [found.total ? 'Catalog hits are ranked matches, not complete totals; open the matching tool for figures.' : 'No catalog record matches these words.',
        ...(enriched.some(result => result.row.kind === 'bill') ? ['Bill lifecycle dates and sponsors come from the published bill records. Null fields are not recorded or unavailable; status_as_of is not an introduction, passage or assent date.'] : []),
        ...(sizeLimited ? ['Fewer ranked hits are shown to retain complete bill lifecycles. Narrow the query to a bill title for other matches.'] : [])],
    })
    // Leave room for the Ask adapter inside its 16 KiB result limit. Never cut a lifecycle in half.
    while (enriched.length > 1 && new TextEncoder().encode(JSON.stringify(result())).length > 14_000) {
      enriched.pop()
      sizeLimited = true
    }
    return result()
  },
}
