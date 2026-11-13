/** Published identities only: supplier funding links and ABNs are explicit joins. */
import { receiptGraph, receiptScopeLabel } from '../../public/donor-disclosure.js'
import { clip, siteUrl } from './record-common'
import { boundedValue, object, publishedResult, records, sourceUrl, wordsMatch, type RecordRow } from './published-records'
import { readToolAsset, type ToolDefinition, type ToolEnv } from './types'

const NOTE = 'Published connections do not establish influence or misconduct. Contract values are awards, not payments. Evidence matches can be mentions rather than financial relationships.'
const PRIVATE = new Set(['person', 'individual', 'sole trader', 'aggregate', 'undisclosed'])
/** The AusTender keyword search for a contract notice number: the exporter's source-register link (contracts-grants-007). */
const noticeUrl = (c: RecordRow): string => {
  const id = String(c.id ?? '')
  if (c.link_scope === 'source_register' && /^CN[\w.-]+$/i.test(id)) return 'https://www.tenders.gov.au/Search/KeywordSearch?keyword=' + encodeURIComponent(id)
  return sourceUrl(c.url) ?? 'https://www.tenders.gov.au/'
}
const fileKey = (id: string) => { const i = id.indexOf(':'); return (i < 0 ? 'x' : id.slice(0, i)) + '-' + id.slice(i < 0 ? 0 : i + 1).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') }

async function grantRows(env: ToolEnv, abn: string, jurisdiction: string): Promise<RecordRow[]> {
  const index = object(await readToolAsset(env, `/graph/grants.${jurisdiction}.json`))
  if (!Array.isArray(index.recipients)) throw new Error('Grant index unavailable')
  const entry = records(index.recipients).find(r => r.id === 'abn:' + abn && !PRIVATE.has(String(r.k)))
  if (!entry) return []
  if (!Number.isInteger(entry.sh) || Number(entry.sh) < 0 || Number(entry.sh) >= 40) throw new Error('Invalid grant shard')
  const shard = object(await readToolAsset(env, `/grants/${jurisdiction}/shard-${String(entry.sh).padStart(2, '0')}.json`))
  const detail = object(shard[fileKey(String(entry.id))])
  if (detail.id !== entry.id) throw new Error('Grant profile unavailable')
  return records(detail.grants).map(g => ({ kind: 'grant', jurisdiction, recipient: detail.n, title: g.n ?? g.pr, amount_aud: g.v, financial_year: g.fy,
    agency: g.ag, programme: g.pr, source_url: sourceUrl(g.source_url) ?? (g.guid ? 'https://www.grants.gov.au/Ga/Show/' + encodeURIComponent(String(g.guid)) : jurisdiction === 'qld' ? 'https://www.data.qld.gov.au/dataset/b102c881-2c7f-484a-a8b6-b056fe318964' : 'https://www.grants.gov.au/'),
    source_scope: g.guid ? 'individual award' : 'source register or dataset',
    full_record_url: siteUrl(env, `/money/grants/${jurisdiction}/recipient/${encodeURIComponent(String(entry.id))}`),
    published_recipient_total_aud: detail.t, published_recipient_record_count: detail.c, listing_partial: Number(detail.c) > records(detail.grants).length }))
}
async function taxRows(env: ToolEnv, abn: string): Promise<RecordRow[]> {
  const [raw, index] = await Promise.all([readToolAsset(env, `/entities/tax-charity/${abn.slice(-2)}.json`), readToolAsset(env, '/entities/tax-charity/index.json')])
  const data = object(object(raw)[abn]), meta = object(object(index).meta), sources = object(meta.sources)
  if (!Object.keys(meta).length) throw new Error('Tax and charity metadata unavailable')
  const rows: RecordRow[] = []
  for (const r of records(data.t)) {
    const source = object(object(object(sources.ato).years)[String(r.y)])
    rows.push({ kind: 'corporate_tax', abn, name: data.tn, year: r.y, total_income_aud: r.inc ?? null, taxable_income_aud: r.tax ?? null, tax_payable_aud: r.pay ?? null,
      source_url: sourceUrl(source.record_url ?? source.dataset_url), source_scope: 'ATO published dataset; locate by ABN', snapshot: meta.data_as_of,
      caveat: object(meta.caveats).ato })
  }
  for (const r of records(data.a)) {
    const source = object(object(object(sources.ais).years)[String(r.y)])
    rows.push({ kind: 'charity_statement', abn, name: r.n ?? object(data.c).n ?? records(data.a)[0]?.n, year: r.y, reporting_end: r.to, revenue_aud: r.rev ?? null,
      government_revenue_aud: r.gov ?? null, donations_received_aud: r.don ?? null, expenses_aud: r.exp ?? null,
      source_url: sourceUrl(source.dataset_url), source_scope: 'ACNC published dataset; locate by ABN', snapshot: meta.data_as_of, caveat: object(meta.caveats).ais })
  }
  if (data.c) rows.push({ kind: 'charity_registration', abn, ...object(data.c), source_url: sourceUrl(object(sources.register).dataset_url), snapshot: meta.data_as_of, caveat: object(meta.caveats).register })
  return rows
}
function fact(row: RecordRow) {
  if (row.kind === 'corporate_tax') return `${row.name}, ABN ${row.abn}, ${row.year}: total income AUD ${row.total_income_aud ?? 'not published'}, taxable income AUD ${row.taxable_income_aud ?? 'not published'}, tax payable AUD ${row.tax_payable_aud ?? 'not published'}. Tax payable is not tax paid.`
  if (row.kind === 'charity_statement') return `${row.name}, ABN ${row.abn}, ${row.year}: charity revenue AUD ${row.revenue_aud ?? 'not published'}, government revenue AUD ${row.government_revenue_aud ?? 'not published'}, donations received AUD ${row.donations_received_aud ?? 'not published'}. These are charity finances, not political donations.`
  if (row.kind === 'receipt') return `${row.donor} to ${row.party}: AUD ${row.amount_aud} across ${row.records} disclosed receipt records (${row.first_year ?? '?'} to ${row.last_year ?? '?'}).${row.measure ? ` ${row.measure}.` : ''} An aggregate connection, not an individual donation.`
  if (row.kind === 'contract' || row.kind === 'grant') return `${row.title ?? row.id}: ${row.kind} value AUD ${row.amount_aud ?? 'not published'}${row.agency ? ', ' + row.agency : ''}${row.financial_year ? ', ' + row.financial_year : ''}. ${row.source_scope ?? ''}${row.counted_in_totals === false ? ` Not counted in the profile totals: ${clip(row.caveat, 600)}` : ''}`
  if (row.kind === 'evidence') return `${row.name}: ${row.predicate} (${row.date ?? 'undated'}, ${row.source_kind}). ${clip(row.excerpt, 700)}`
  return clip(`${row.name ?? row.n ?? row.id}: ${row.kind}; ${row.total_aud != null ? 'published contract value AUD ' + row.total_aud + ', ' + row.records + ' contracts' : row.abn ? 'ABN ' + row.abn : 'published profile'}.`, 900)
}

export const tool: ToolDefinition = {
  name: 'entity_profile',
  description: 'Find and open supplier, agency and audited connection profiles, or tax/charity records by ABN. Search with kind + query; copy record_id into a follow-up. section=contracts opens individual notices; receipts shows the supplier’s explicitly linked federal political receipt aggregates; grants joins by ABN to federal and Queensland awards; evidence opens audited mention excerpts; tax opens ATO/ACNC figures by ABN. offset pages each section. Join entities using published identity links or exact ABNs. source_scope distinguishes individual record links from dataset/register provenance. Listings can omit awards held in complete summaries; use grants for complete recipient totals. Tax payable is not tax paid, and charity donations received are not political donations.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    kind: { type: 'string', enum: ['supplier', 'agency', 'connection', 'tax_charity'] },
    query: { type: 'string', minLength: 2, maxLength: 200 },
    record_id: { type: 'string', pattern: '^(?:[sa]-[a-f0-9]{20}|[a-f0-9]{24}|[0-9]{11})$' },
    section: { type: 'string', enum: ['overview', 'contracts', 'receipts', 'grants', 'evidence', 'tax'] },
    limit: { type: 'integer', minimum: 1, maximum: 8 }, offset: { type: 'integer', minimum: 0, maximum: 100000 },
  }, required: ['kind'], examples: [{ kind: 'supplier', query: 'Thales' }, { kind: 'connection', query: 'Woollahra' }, { kind: 'tax_charity', record_id: '18151340608' }] },
  validate: args => !!args.query !== !!args.record_id && (args.kind !== 'tax_charity' || !!args.record_id) &&
    (!args.record_id || ({ supplier: /^s-[a-f0-9]{20}$/, agency: /^a-[a-f0-9]{20}$/, connection: /^[a-f0-9]{24}$/, tax_charity: /^\d{11}$/ }[String(args.kind)]?.test(String(args.record_id)) ?? false)) &&
    (args.record_id ? ({ supplier: ['overview', 'contracts', 'receipts', 'grants', 'tax'], agency: ['overview', 'contracts'], connection: ['overview', 'evidence', 'grants', 'tax'], tax_charity: ['overview', 'tax'] }[String(args.kind)]?.includes(String(args.section ?? 'overview')) ?? false) : !args.section || args.section === 'overview'),
  stepLabel: args => ({ label: 'Reading entity profile', arg: clip(args.query ?? args.record_id, 40) }),
  async handler(env, args) {
    const kind = String(args.kind), section = String(args.section ?? 'overview'), id = String(args.record_id ?? ''), limit = Number(args.limit) || 5, offset = Number(args.offset) || 0
    let rows: RecordRow[] = [], snapshot: unknown = null
    if (kind === 'tax_charity') rows = await taxRows(env, id)
    else {
      const path = kind === 'supplier' ? '/suppliers.json' : kind === 'agency' ? '/agencies.json' : '/evidence/index.json'
      const index = object(await readToolAsset(env, path)), list = index[kind === 'supplier' ? 'suppliers' : kind === 'agency' ? 'agencies' : 'entities']
      if (!Array.isArray(list)) throw new Error('Entity directory unavailable')
      snapshot = object(index.meta).generated_at ?? object(index.meta).generated ?? null
      const matches = records(list).filter(r => id ? r.id === id : wordsMatch(args.query, [r.name, r.abn, ...(Array.isArray(r.aliases) ? r.aliases : [])]))
      if (!id) rows = matches.map(r => ({ kind, record_id: r.id, name: r.name, abn: r.abn ?? null, total_aud: r.total, records: r.count ?? r.records,
        source_url: kind === 'connection' ? siteUrl(env, '/connections?' + new URLSearchParams({ entity: String(r.id) })) : 'https://www.tenders.gov.au/',
        source_scope: kind === 'connection' ? 'OPAX audited connection profile' : 'AusTender source register; profile total derived by OPAX',
        full_record_url: kind === 'connection' ? siteUrl(env, '/connections?entity=' + r.id) : siteUrl(env, `/subject/${kind}/${r.id}`),
        follow_up: { kind, record_id: r.id } }))
      else if (matches.length) {
        const entry = matches[0]
        const data = kind === 'supplier' ? object(object(object(await readToolAsset(env, `/suppliers/${id.slice(2, 4)}.json`)).profiles)[id]) : kind === 'agency' ? object(await readToolAsset(env, `/agencies/${id}.json`)) : object(object(object(await readToolAsset(env, `/evidence/${id.slice(0, 2)}.json`)).entries)[id])
        if (data.id !== id) throw new Error('Entity detail unavailable')
        const abn = String(entry.abn ?? data.abn ?? '')
        const full_record_url = kind === 'connection' ? siteUrl(env, '/connections?entity=' + id) : siteUrl(env, `/subject/${kind}/${id}`)
        if (section === 'tax') rows = /^\d{11}$/.test(abn) ? await taxRows(env, abn) : []
        else if (section === 'grants') {
          if (/^\d{11}$/.test(abn)) rows = (await Promise.all(['federal', 'qld'].map(j => grantRows(env, abn, j)))).flat()
        } else if (section === 'contracts') rows = [...records(data.contracts).map(c => ({ ...c, kind: 'contract', amount_aud: c.amount, source_url: noticeUrl(c), source_scope: c.link_scope ?? 'source register', full_record_url,
          published_profile_record_count: data.count, listing_partial: Number(data.count) > records(data.contracts).length })),
          // listed on the profile but left out of its totals, with the published reason (cancelled at source, or a value held for review)
          ...records(data.withheld).map(c => ({ ...c, kind: 'contract', amount_aud: c.amount, counted_in_totals: false, status: c.status, caveat: c.caveat,
            source_url: noticeUrl(c), source_scope: c.link_scope ?? 'source register', full_record_url }))]
        else if (section === 'evidence') rows = records(data.excerpts).map(e => ({ kind: 'evidence', name: data.name, predicate: e.predicate, date: e.date,
          excerpt: clip(e.text ?? object(e.details).excerpt, 900), source_kind: e.source_kind, source_id: e.source_id,
          source_url: sourceUrl(e.source_url) ?? (e.source_table === 'speeches' && /^\d+$/.test(String(e.source_id)) ? siteUrl(env, '/doc/speech-' + e.source_id) : full_record_url),
          source_scope: sourceUrl(e.source_url) ? 'original source' : 'OPAX evidence; original URL not recorded', full_record_url }))
        else if (section === 'receipts') {
          // Each flow read through its typed cells (each receipt once, from the party's own return), as on the donor page.
          const graph = object(receiptGraph(object(await readToolAsset(env, '/graph/money.json')) as { edges: unknown[] }))
          if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error('Funding graph unavailable')
          const nodes = new Map(records(graph.nodes).map(n => [String(n.id), n])), linked = new Set(records(data.donor_links).map(n => String(n.id)))
          // The receipt branch of the published graph grammar. Awards and grants cannot enter it.
          rows = records(graph.edges).filter(e => linked.has(String(e.source)) && nodes.get(String(e.source))?.kind === 'donor' &&
            nodes.get(String(e.target))?.kind === 'party' && !e.grant && !e.flow && typeof e.total === 'number' && Number.isFinite(e.total) && e.total > 0).map(e => {
            const donor = nodes.get(String(e.source))!, party = nodes.get(String(e.target))!
            return { kind: 'receipt', donor: donor.label, party: party.label, amount_aud: e.total, records: e.count, first_year: e.firstYear, last_year: e.lastYear,
              ...(e.typed ? { measure: receiptScopeLabel({ typed: true, firstYear: e.firstYear as number | null, lastYear: e.lastYear as number | null } as Parameters<typeof receiptScopeLabel>[0]) } : {}),
              source_url: sourceUrl(records(donor.returnReferences)[0]?.url) ?? 'https://transparency.aec.gov.au/', source_scope: 'published receipt aggregate; source return register', full_record_url }
          })
        } else rows = [{ kind, record_id: id, name: data.name, abn: /^\d{11}$/.test(abn) ? abn : null, total_aud: data.total, records: data.count ?? data.records,
          years: boundedValue(data.years), suppliers: records(data.suppliers).slice(0, 8).map(s => ({ record_id: s.id, name: s.name, total_aud: s.total, records: s.count })),
          agencies: records(data.agencies).slice(0, 8).map(a => ({ name: a.name, total_aud: a.total, records: a.count })),
          source_url: kind === 'connection' ? full_record_url : 'https://www.tenders.gov.au/', source_scope: kind === 'connection' ? 'OPAX audited evidence profile' : 'AusTender source register; profile aggregate derived by OPAX', full_record_url,
          available_sections: kind === 'supplier' ? ['contracts', 'receipts', 'grants', 'tax'] : kind === 'agency' ? ['contracts'] : ['evidence', 'grants', 'tax'],
          follow_up: { kind, record_id: id, section: kind === 'connection' ? 'evidence' : 'contracts' },
          listing_note: 'Detail sections contain published lists and can be partial. Missing identity links or entries do not establish zero activity.' }]
      }
    }
    const total = rows.length, picked: RecordRow[] = rows.slice(offset, offset + limit).map(r => ({ ...boundedValue(r, 1000) as RecordRow, summary: clip(fact(r), 1200) }))
    return publishedResult(picked, picked.map(r => ({ kind: 'record', url: sourceUrl(r.source_url) ?? String(r.full_record_url), text: String(r.summary) })), {
      total, offset, next_offset: offset + picked.length < total ? offset + picked.length : null, truncated: offset + picked.length < total,
      snapshot, notes: [NOTE, 'Joins use published supplier-to-funding IDs or exact ABNs. Names do not prove identity. Empty sections do not establish zero activity.', ...(total ? [] : ['No published profile or section row matches.'])],
    })
  },
}
