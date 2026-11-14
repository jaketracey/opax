/** Public MCP: federal disclosed receipts. Every figure and sentence comes from money_totals, the calculator Ask uses. */
import { tool as moneyTotals } from './money-totals'
import { clip, siteUrl } from './record-common'
import { object, records } from './published-records'
import { cursorProp, detailProp, full, limitProp, badCursor, outputSchema, readCursor, result, writeCursor } from './mcp-common'
import { ToolInputError, type ToolCitation, type ToolDefinition } from './types'

const GROUPS: Record<string, string | undefined> = { total: undefined, top_donors: 'donor', top_recipients: 'party', by_year: 'year', by_industry: 'industry' }
const MEASURE_LABELS = {
  all_receipts: 'disclosed receipts, all receipt types (donations, other receipts, subscriptions and receipts with no type). Not all of this is donations.',
  donations_only: 'donations only: receipts the party\'s own return types as Donation Received.',
}
const line = { type: 'object', properties: { statement: { type: 'string' }, amount_aud: { type: ['number', 'null'] }, url: { type: 'string' } }, required: ['statement', 'url'] }

export const moneyReceipts: ToolDefinition = {
  name: 'money_receipts', title: 'Political receipts and donors', mcpOnly: true,
  description: 'Money disclosed to federal parties in AEC returns: a party\'s or donor\'s total, a party\'s largest sources (view top_donors), where a donor\'s money went (top_recipients), yearly totals (by_year) or industry totals (by_industry), for a year, a range or all years. These are receipts, not donations: they include other receipts and subscriptions and may include loans. measure=donations_only counts only what the AEC types as Donation Received. Quote each figure with the scope in its statement. Rankings cover the largest donors OPAX publishes, not every donor.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    party: { type: 'string', minLength: 2, maxLength: 200, description: 'Recipient party, e.g. Labor, Liberal, Nationals, Greens, One Nation.' },
    donor: { type: 'string', minLength: 2, maxLength: 200, description: 'Donor or source name as disclosed, e.g. "Mineralogy Pty Ltd".' },
    view: { type: 'string', enum: Object.keys(GROUPS), description: 'total (default with a party or donor), top_donors, top_recipients, by_year or by_industry.' },
    financial_year: { type: 'string', pattern: '^(19|20)[0-9]{2}-([0-9]{2}|(19|20)[0-9]{2})$', description: 'One financial year, e.g. 2023-24.' },
    from_year: { type: 'integer', minimum: 1990, maximum: 2099, description: 'First financial year, by starting year (2019 means 2019-20).' },
    to_year: { type: 'integer', minimum: 1990, maximum: 2099, description: 'Last financial year, by starting year.' },
    measure: { type: 'string', enum: Object.keys(MEASURE_LABELS), description: 'all_receipts (default) or donations_only. Party totals always cover all receipt types.' },
    lending: { type: 'boolean', description: 'With a party: also list the debts the party\'s own returns declare. No receipt is labelled a loan.' },
    detail: detailProp('the counting basis, coverage dates and receipts only the donor declared.'),
    limit: limitProp(25, 10), cursor: cursorProp,
  }, examples: [{ party: 'Labor', view: 'top_donors', financial_year: '2023-24' }, { donor: 'Mineralogy Pty Ltd', view: 'top_recipients' }, { party: 'Greens', view: 'by_year', from_year: 2019 }, { view: 'top_donors', financial_year: '2022-23', measure: 'donations_only' }] },
  outputSchema: outputSchema({ properties: {
    party: { type: 'string', description: 'Recipient party.' }, donor: { type: 'string', description: 'Source name as disclosed.' },
    associated_entity: { type: 'string', description: 'The AEC register lists this source as an associated entity of the recipient party.' },
    industry: { type: 'string', description: 'OPAX classification, not an AEC category.' }, year: { type: 'integer', description: 'Financial year, by starting year.' },
    amount_aud: { type: 'number' }, receipts: { type: 'integer', description: 'Number of receipt lines.' }, period: { type: 'string', description: 'Financial year or range the amount covers.' },
    statement: { type: 'string', description: 'The figure with its source, recipient, period, measure and scope. Quote figures in these terms.' },
    url: { type: 'string', description: 'OPAX money page showing this figure.' },
  }, required: ['amount_aud', 'period', 'statement', 'url'] }, {
    measure: { type: 'string', enum: Object.keys(MEASURE_LABELS) }, measure_label: { type: 'string', description: 'What the amounts count. Use this wording.' },
    period: { type: ['string', 'null'] }, as_at: { type: ['string', 'null'], description: 'When the receipts export was generated.' },
    other_lines: { type: 'array', items: line, description: 'Amounts kept apart from the ranking: receipts that are not donations, declared debts, and flows only the donor declared.' },
    coverage: { type: 'object', description: 'detail=full: requested and available financial-year boundaries.' },
    donor_declared: { type: 'array', items: { type: 'object' }, description: 'detail=full: flows the donor declared that no party return lists; not counted in amounts.' },
  }),
  identifierFields: ['party', 'donor'],
  validate: args => (args.from_year === undefined || args.to_year === undefined || Number(args.from_year) <= Number(args.to_year)) && !(args.financial_year && (args.from_year !== undefined || args.to_year !== undefined)) &&
    ((args.view ?? 'total') !== 'total' || !!(args.party || args.donor)) && !(args.view === 'by_industry' && args.donor),
  stepLabel: args => ({ label: 'Reading disclosed receipts', arg: clip(args.party ?? args.donor ?? args.financial_year ?? '', 40) }),
  async handler(env, args) {
    const state = readCursor('money_receipts', args), offset = state ? Number(state.o) : 0
    if (!Number.isSafeInteger(offset) || offset < 0) throw badCursor('money_receipts')
    const size = Number(args.limit) || 10, view = String(args.view ?? 'total'), wanted = args.measure === 'donations_only' ? 'donations_only' : 'all_receipts'
    const data = await moneyTotals.handler(env, { ...Object.fromEntries(['party', 'donor', 'financial_year', 'from_year', 'to_year', 'lending'].filter(key => args[key] !== undefined).map(key => [key, args[key]])),
      ...(GROUPS[view] ? { group_by: GROUPS[view] } : {}), measure: wanted === 'donations_only' ? 'donations' : 'all_types', limit: offset + size })
    if (data.error) throw new Error(String(data.error))
    const rows = records(data.rows), cites = data.citations as ToolCitation[], coverage = object(data.coverage)
    // The calculator returns one sentence per ranked row, in order, then the lines it keeps apart.
    const window = rows.slice(offset, offset + size), total = Number(data.matched ?? rows.length), end = offset + window.length
    const items = window.map((row, i) => {
      const cite = cites[offset + i], { total_aud, ...rest } = row
      return { ...rest, amount_aud: total_aud, statement: cite.text, url: cite.url }
    })
    const apart = cites.slice(rows.length).map(cite => ({ statement: cite.text, amount_aud: typeof cite.value === 'number' ? cite.value : null, url: cite.url }))
    // A donor with only non-donation receipts, or a period outside coverage, has no ranked rows: its lines still answer.
    const other_lines = rows.length ? apart : data.coverage_only === true && !data.donor_declared ? [] : cites.map(cite => ({ statement: cite.text, amount_aud: typeof cite.value === 'number' ? cite.value : null, url: cite.url }))
    // Party aggregates have no type split, so they are never labelled donations.
    const measure = data.measure === 'donations' ? 'donations_only' : 'all_receipts'
    return result({ items, total: rows.length ? total : 0, next_cursor: window.length && end < total ? writeCursor('money_receipts', args, { o: end }) : null,
      url: siteUrl(env, '/money?jur=federal&type=receipts'), measure, measure_label: MEASURE_LABELS[measure], period: typeof data.period === 'string' ? data.period : null, as_at: coverage.as_of ?? null,
      other_lines, ...(full(args) ? { coverage, ...(data.donor_declared ? { donor_declared: data.donor_declared } : {}) } : {}),
      notes: [...(wanted === 'donations_only' && measure !== 'donations_only' ? ['A donations-only figure is not available for this selection: the amounts are all receipt types.'] : []), ...data.notes as string[]] })
  },
}
