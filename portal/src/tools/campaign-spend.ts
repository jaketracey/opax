/** Published campaign costs retain their source categories, GST basis and reporting periods. */
import { clip, fold } from './record-common'
import { readToolAsset, type StructuredToolResult, type ToolArgs, type ToolDefinition, type ToolEnv } from './types'

interface CampaignRow {
  id: string; campaign: string; entity: string; jurisdiction: string; financial_year: string
  record_kind: string; category: string; total_cents: number | null; unit: string; basis: string
  campaign_period?: string; source_url: string; source_locator: string
}
const plain = (value: string) => value.replace(/[—–]/g, '-').replace(/\s+/g, ' ').trim()
const campaignName = (value: string) => fold(value).replace(/\b(?:campaigns?|advertising|advertisements?|adverts?|ads?|expenditure)\b/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
const money = (cents: number) => '$' + (cents / 100).toLocaleString('en-AU', { maximumFractionDigits: 2 })

export async function campaignSpend(env: ToolEnv, args: ToolArgs): Promise<StructuredToolResult> {
  const data = await readToolAsset(env, '/gov-advertising/data.json') as { rows?: CampaignRow[]; generated_at?: string } | null
  if (!data?.rows) throw new Error('Campaign advertising register unavailable.')
  const name = campaignName(String(args.campaign ?? args.query ?? ''))
  const period = args.financial_year ? String(args.financial_year) : undefined
  const eligible = data.rows.filter(r => r.record_kind === 'campaign cost' && r.campaign && (!period || r.financial_year === period) &&
    (!args.jurisdiction || fold(r.jurisdiction) === fold(args.jurisdiction)) && (!args.entity || fold(r.entity) === fold(args.entity)) &&
    (!args.since || `${r.financial_year.slice(0, 4)}-07-01` >= String(args.since)) &&
    (!args.until || `${Number(r.financial_year.slice(0, 4)) + 1}-06-30` <= String(args.until)))
  const exact = eligible.filter(r => campaignName(r.campaign) === name)
  const matched = exact.length ? exact : eligible.filter(r => name && name.split(' ').every(word => campaignName(r.campaign).split(' ').includes(word)))
  const rows = matched.slice(0, 30).map(({ id, campaign, entity, jurisdiction, financial_year, record_kind, category, total_cents, unit, basis, campaign_period, source_url, source_locator }) =>
    ({ id, campaign, entity, jurisdiction, financial_year, record_kind, category, total_cents, unit, basis, campaign_period, source_url, source_locator }))
  return { rows, total: matched.length, citations: rows.map(r => ({ kind: 'record' as const, url: r.source_url,
    ...(typeof r.total_cents === 'number' && r.unit === 'AUD' ? { value: r.total_cents / 100 } : {}),
    text: typeof r.total_cents === 'number' && r.unit === 'AUD'
      ? `${plain(r.campaign)} for ${r.entity} recorded ${money(r.total_cents)} for ${r.category.toLowerCase()} in financial year ${r.financial_year} (${plain(r.basis)}${r.campaign_period ? '; campaign period ' + plain(r.campaign_period) : ''}).`
      : `The advertising register lists ${plain(r.campaign)} for ${r.entity} in financial year ${r.financial_year}, but records no amount for ${r.category.toLowerCase()}.` })),
    notes: matched.length ? ['Campaign figures are separate published cost categories. No combined campaign total is inferred from category rows.'] : ['No published campaign cost matches that name and reporting period.'],
    coverage: { since: rows.length ? `${rows.map(r => r.financial_year).sort()[0].slice(0, 4)}-07-01` : null,
      until: rows.length ? `${Number(rows.map(r => r.financial_year).sort().at(-1)!.slice(0, 4)) + 1}-06-30` : null, as_of: data.generated_at?.slice(0, 10) ?? null },
    truncated: matched.length > rows.length }
}

export const tool: ToolDefinition = {
  name: 'campaign_spend',
  description: 'Recorded government campaign advertising costs. Pass the campaign name and financial year, optionally advertiser and jurisdiction. Prefer exact campaign names over longer partial matches. Returns the published amount for each named cost category with GST basis and campaign period. Keep each published cost category separate and report its recorded amount or availability.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    campaign: { type: 'string', minLength: 2, maxLength: 200 }, entity: { type: 'string', minLength: 2, maxLength: 160 },
    financial_year: { type: 'string', pattern: '^\\d{4}-\\d{2}$' }, jurisdiction: { type: 'string', enum: ['vic', 'nsw', 'qld', 'sa', 'wa', 'tas', 'nt', 'act', 'federal'] },
    since: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, until: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  }, required: ['campaign'], examples: [{ campaign: '2018 recruitment', financial_year: '2017-18' }] },
  stepLabel: args => ({ label: 'Checking campaign spending', arg: clip(args.campaign, 40) }),
  handler: campaignSpend,
}
