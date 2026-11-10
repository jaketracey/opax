import { aud, fold, siteUrl } from './record-common'
import { receiptYearWindow } from '../receipt-period'
import { readToolAsset, type StructuredToolResult, type ToolArgs, type ToolEnv } from './types'

type YearTotals = Record<string, [number, number]>
interface Entry { id: string; n: string; t: number; c: number; k?: string; sh?: number; key?: string; by?: (0 | [number, number])[]; y0?: string; y1?: string }
interface GrantIndex {
  meta?: { years?: string[]; generated?: string; counts?: { recipients?: number; recipients_listed?: number; programs_total?: number; programs_listed?: number } }
  recipients: Entry[]; programs: Entry[]; years?: Record<string, { t: number; c: number }>
}
interface Summary { t: number; c: number; y0?: string; y1?: string; by?: YearTotals; grants?: Award[]; more?: number }
interface Award { v: number; fy?: string; pr?: string; n?: string }
const PRIVATE = new Set(['person', 'individual', 'sole trader', 'aggregate'])
const tokens = (value: string) => fold(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
function matching(entries: Entry[], value?: string) {
  if (!value) return entries
  const want = tokens(value)
  const exact = entries.filter(e => fold(e.id) === fold(value) || tokens(e.n) === want)
  return exact.length ? exact : entries.filter(e => want.split(' ').every(word => tokens(e.n).split(' ').includes(word)))
}
const inYears = (year: string, args: ToolArgs) => (!args.from_year || Number(year.slice(0, 4)) >= Number(args.from_year)) && (!args.to_year || Number(year.slice(0, 4)) <= Number(args.to_year))
const yearly = (entry: Entry, index: GrantIndex): YearTotals | undefined => entry.by && index.meta?.years ? Object.fromEntries(index.meta.years.flatMap((year, i) => Array.isArray(entry.by![i]) ? [[year, entry.by![i]]] : [])) as YearTotals : undefined
const unavailable = (note: string): StructuredToolResult => ({ rows: [], citations: [], notes: [note], error: 'Complete totals for this selection are unavailable.' })

/** Use complete published aggregates. The table and detail award lists can omit smaller awards. */
export async function grantTotals(env: ToolEnv, args: ToolArgs): Promise<StructuredToolResult> {
  if (args.state || args.electorate) return unavailable('The published aggregates do not support complete totals filtered by electorate or state.')
  if (args.query && (args.recipient || args.program || args.group_by === 'year')) return unavailable('Use recipient or program to select a total. Free-text award filters cannot be applied to complete financial-year aggregates.')
  const jurisdiction = args.jurisdiction === 'qld' ? 'qld' : 'federal'
  const limitation = (text: string): StructuredToolResult => ({ rows: [], coverage_only: true,
    coverage: { since: null, until: null, as_of: null, matched: false, note: text },
    citations: [{ kind: 'record', text, url: siteUrl(env, `/money/grants?jur=${jurisdiction}`) }], notes: [text] })
  const dated = typeof args.since === 'string' || typeof args.until === 'string'
  const window = dated ? receiptYearWindow(args.since as string | undefined, args.until as string | undefined) : undefined
  if (window?.error) return limitation('Grant summaries are grouped by financial year (1 July to 30 June), so they cannot establish a total for the requested partial or calendar-year period.')
  const year = args.financial_year ? Number(String(args.financial_year).slice(0, 4)) : undefined
  // Exact dates take precedence over generic calendar-year arguments added by Ask.
  const from = dated ? window?.from_year : year ?? args.from_year
  const to = dated ? window?.to_year : year ?? args.to_year
  args = { ...args, from_year: from, to_year: to }
  const index = await readToolAsset(env, `/graph/grants.${jurisdiction}.json`) as GrantIndex | null
  if (!index || !Array.isArray(index.recipients) || !Array.isArray(index.programs)) throw new Error('Grant aggregates unavailable')
  const years = (index.meta?.years ?? []).map(y => Number(y.slice(0, 4))).sort((a, b) => a - b)
  const first = from === undefined ? years[0] : Number(from), last = to === undefined ? years.at(-1) : Number(to)
  if ((from !== undefined || to !== undefined) && years.length && (first! < years[0] || last! > years.at(-1)! || first! > last!)) return limitation('The published grant data cannot establish a complete total for the requested financial-year range.')
  if ((from !== undefined || to !== undefined) && years.length) for (let y = first!; y <= last!; y++) if (!years.includes(y)) return limitation(`The published grant data has no financial-year bucket for ${y}-${String(y + 1).slice(-2)}, so it cannot establish the requested total.`)
  const group = String(args.group_by ?? (args.program && !args.recipient ? 'program' : 'recipient'))
  const unit = jurisdiction === 'qld' ? 'expenditure lines' : 'grant awards'
  const basis = jurisdiction === 'qld' ? 'Annual Queensland expenditure lines, including grants, service agreements and other assistance. A multi-year agreement can have one line per financial year; counts are lines, not distinct awards.' : 'Published federal award values, including variations, not payments received.'
  const notes = [basis]
  const bounded = args.from_year !== undefined || args.to_year !== undefined
  const selectedYears = (by?: YearTotals) => Object.entries(by ?? {}).filter(([year]) => inYears(year, args)).sort(([a], [b]) => a.localeCompare(b))
  const rows: Record<string, unknown>[] = []
  const citations: StructuredToolResult['citations'] = []
  const add = (label: string, dimension: Record<string, unknown>, summary: Summary, url: string, by = summary.by) => {
    const years = selectedYears(by), total = bounded ? years.reduce((sum, [, pair]) => sum + pair[0], 0) : summary.t
    const count = bounded ? years.reduce((sum, [, pair]) => sum + pair[1], 0) : summary.c
    const first = years[0]?.[0] ?? (bounded ? null : summary.y0 ?? null), last = years.at(-1)?.[0] ?? (bounded ? null : summary.y1 ?? null)
    const period = first ? ` (financial years ${first}${last !== first ? ` to ${last}` : ''})` : ''
    rows.push({ ...dimension, jurisdiction, total_aud: total, record_count: count, count_unit: unit, from_financial_year: first, to_financial_year: last, by_year: Object.fromEntries(years), complete: true })
    citations.push({ kind: 'record', value: total, url, text: `${label}: ${aud(total)} across ${count.toLocaleString('en-AU')} ${jurisdiction === 'qld' ? 'Queensland ' : 'federal '}${unit}${period}.` })
  }
  const limit = Number(args.limit) || 5
  if (args.recipient) {
    const candidates = matching(index.recipients.filter(e => !PRIVATE.has(e.k ?? '')), String(args.recipient))
    if (candidates.length > 1) return { rows: candidates.slice(0, 10).map(e => ({ recipient: e.n, recipient_id: e.id })), citations: [], notes: ['Several recipients match; use the full recipient name or recipient ID.'] }
    const entry = candidates[0]
    if (!entry) return { rows: [], citations: [], notes: ['No published recipient matches. The recipient directory covers a selection of recipients, not every grant recipient.'] }
    if (!Number.isInteger(entry.sh) || entry.sh! < 0 || entry.sh! > 99) throw new Error('Invalid recipient shard')
    const shard = await readToolAsset(env, `/grants/${jurisdiction}/shard-${String(entry.sh).padStart(2, '0')}.json`) as Record<string, Summary> | null
    const summary = shard?.[entry.id.replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '').toLowerCase()]
    if (!summary) throw new Error('Recipient summary unavailable')
    const url = siteUrl(env, `/money/grants/${jurisdiction}/recipient/${encodeURIComponent(entry.id)}`)
    const dimension = { recipient: entry.n, recipient_id: entry.id }
    if (args.program || group === 'program') {
      if (summary.more || !summary.grants || summary.grants.length !== summary.c) return unavailable('The recipient award list is shortened. Its program summaries are partial, so they cannot establish a complete recipient total by program.')
      const programs = new Map<string, Summary>()
      const want = args.program ? tokens(String(args.program)) : null
      for (const award of summary.grants) {
        const program = award.pr || 'Program not recorded'
        if (want && tokens(program) !== want) continue
        const s = programs.get(program) ?? { t: 0, c: 0, by: {} }
        s.t += award.v; s.c++
        if (award.fy) { const pair = s.by![award.fy] ?? [0, 0]; pair[0] += award.v; pair[1]++; s.by![award.fy] = pair }
        programs.set(program, s)
      }
      if ((bounded || group === 'year') && [...programs.values()].some(s => Object.values(s.by!).reduce((n, pair) => n + pair[1], 0) !== s.c)) return unavailable('Some award financial years are missing; a complete year-filtered program total cannot be calculated.')
      for (const [program, s] of programs) {
        if (group === 'year') for (const [year, pair] of selectedYears(s.by)) add(`${entry.n}, ${program}, ${year}`, { ...dimension, program, financial_year: year }, { t: pair[0], c: pair[1], by: { [year]: pair } }, url)
        else add(`${entry.n}, ${program}`, { ...dimension, program }, s, url)
      }
    } else if (group === 'year') {
      if (!summary.by) return unavailable('No complete financial-year breakdown is published for this recipient.')
      for (const [year, pair] of selectedYears(summary.by)) add(`${entry.n}, ${year}`, { ...dimension, financial_year: year }, { t: pair[0], c: pair[1], by: { [year]: pair } }, url)
    } else {
      if (bounded && !summary.by) return unavailable('No complete financial-year breakdown is published for this recipient.')
      add(entry.n, dimension, summary, url)
    }
  } else if (group === 'program' || args.program) {
    const candidates = matching(index.programs, typeof args.program === 'string' ? args.program : typeof args.query === 'string' ? args.query : undefined)
    if (bounded && candidates.length > limit) return unavailable('Choose a program name or ID for a complete year-filtered program total. The catalogue has no complete program ranking by financial year.')
    const picked = candidates.sort((a, b) => b.t - a.t).slice(0, limit)
    for (const entry of picked) {
      let summary: Summary = { t: entry.t, c: entry.c, y0: entry.y0, y1: entry.y1 }
      if (bounded || group === 'year') {
        if (!entry.key || !/^[a-z0-9-]+$/.test(entry.key)) throw new Error('Invalid program key')
        summary = await readToolAsset(env, `/grants/${jurisdiction}/programs/${entry.key}.json`) as Summary
        if (!summary?.by) return unavailable('No complete financial-year breakdown is published for this program.')
      }
      const url = siteUrl(env, `/money/grants?${new URLSearchParams({ jur: jurisdiction, program: entry.id })}`)
      if (group === 'year') for (const [year, pair] of selectedYears(summary.by)) add(`${entry.n}, ${year}`, { program: entry.n, program_id: entry.id, financial_year: year }, { t: pair[0], c: pair[1], by: { [year]: pair } }, url)
      else add(entry.n, { program: entry.n, program_id: entry.id }, summary, url)
    }
    notes.push('Program coverage is limited to the exported program catalogue; a missing program is not evidence that no such program exists.')
  } else if (group === 'year') {
    if (!index.years) throw new Error('Jurisdiction year aggregates unavailable')
    for (const [year, s] of Object.entries(index.years).sort(([a], [b]) => a.localeCompare(b))) if (inYears(year, args)) add(`${jurisdiction === 'qld' ? 'Queensland' : 'Federal'} grants, ${year}`, { financial_year: year }, { ...s, by: { [year]: [s.t, s.c] } }, siteUrl(env, `/money/grants?jur=${jurisdiction}`))
  } else {
    const candidates = matching(index.recipients, typeof args.query === 'string' ? args.query : undefined)
    const totals = candidates.map(entry => {
      const by = yearly(entry, index)
      if (bounded && !by) throw new Error('Recipient year aggregates unavailable')
      return { entry, by, total: bounded ? selectedYears(by).reduce((sum, [, pair]) => sum + pair[0], 0) : entry.t }
    }).sort((a, b) => b.total - a.total).slice(0, limit)
    for (const { entry, by } of totals) {
      const privateRecipient = PRIVATE.has(entry.k ?? '') || entry.id.startsWith('aggregate:')
      const recipient = privateRecipient ? 'Undisclosed or individual recipients' : entry.n
      add(recipient, { recipient, ...(privateRecipient ? {} : { recipient_id: entry.id }) }, { t: entry.t, c: entry.c }, privateRecipient ? siteUrl(env, '/money/grants') : siteUrl(env, `/money/grants/${jurisdiction}/recipient/${encodeURIComponent(entry.id)}`), by)
    }
    notes.push('Recipient rankings cover the published recipient directory, which is a selection of recipients. Each listed recipient total covers all their recorded awards, including awards omitted from the detail list.')
  }
  const ordered = rows.map((row, i) => ({ row, citation: citations[i] })).sort((a, b) => group === 'year' ? String(a.row.financial_year).localeCompare(String(b.row.financial_year)) : Number(b.row.total_aud) - Number(a.row.total_aud))
  if (!rows.length) notes.unshift('No published grant aggregate matches this selection.')
  if (rows.length > limit) notes.push(`Showing ${limit} of ${rows.length} aggregate rows. Each row is a complete total; the displayed rows are not a complete breakdown.`)
  // Limit the displayed rows after calculating complete totals; limits never change a total.
  return { rows: ordered.slice(0, limit).map(item => item.row), total: rows.length, citations: ordered.slice(0, limit).map(item => item.citation), notes, group_by: group, jurisdiction, complete: true, truncated: rows.length > limit,
    coverage: { since: first === undefined ? null : `${first}-07-01`, until: last === undefined ? null : `${last + 1}-06-30`, as_of: index.meta?.generated?.slice(0, 10) ?? null, note: 'Complete published aggregates, grouped by financial year.' } }
}
