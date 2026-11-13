import { paidAnswer } from './ask-pay'
import type { ReportedHead } from './ask-pay-offices'
import type { RecordQuestion } from './ask-records'
import { callTool } from './tools'
import type { ToolEnv } from './tools/types'

/**
 * Route-mode Ask answers a pay question the calculator can take before any model turn, as the
 * ordinary Ask path always has: what a parliamentarian, a departmental secretary or a statutory
 * office holder is paid is set by the Remuneration Tribunal, and the calculator states it with the
 * instrument cited. What a body's annual report says was paid ("total remuneration in 2024-25")
 * is not a set rate; the calculator declines it and the research loop takes it to annual_reports.
 */
export async function routedPayAnswer(input: RecordQuestion, env: Pick<ToolEnv, 'asset' | 'origin' | 'signal'>): Promise<Record<string, unknown> | null> {
  if (!env.asset) return null
  const asset = env.asset
  const assets = { fetch: async (request: Request) => {
    const data = await asset(new URL(request.url).pathname)
    return data ? Response.json(data) : new Response('', { status: 404 })
  } } as unknown as Fetcher
  let payload = await paidAnswer(input, assets).catch(() => null) as Record<string, unknown> | null
  if (!payload) return null
  // "Highest paid agency head" can mean the set rate or what was paid: the rate leads, with the
  // highest figure the annual reports published beside it.
  if (payload.office_shape === 'head_ranking') {
    const reported = await topReportedHead(env).catch(() => null)
    if (reported) payload = await paidAnswer(input, assets, reported).catch(() => null) as Record<string, unknown> | null ?? payload
  }
  const origin = env.origin ?? 'https://opax.com.au'
  const sources = (Array.isArray(payload.sources) ? payload.sources : []) as Record<string, unknown>[]
  return { ...payload, answer_decision: 'answer',
    sources: sources.map(s => ({ ...s, slug: typeof s.slug === 'string' ? s.slug : '', url: new URL(String(s.url ?? s.href), origin).href })) }
}

/** The highest agency-head total remuneration in the latest settled reporting year. */
async function topReportedHead(env: Pick<ToolEnv, 'asset' | 'origin' | 'signal'>): Promise<ReportedHead | null> {
  const out = await callTool(env, 'annual_reports', { view: 'agency_heads', limit: 1 })
  const row = (out.rows as Record<string, unknown>[]).find(r => !r.historical && typeof r.total === 'number')
  if (!row || typeof row.name !== 'string' || typeof row.body !== 'string' || typeof row.year !== 'string') return null
  const url = [row.report_url, row.source_url, row.full_record_url].find((u): u is string => typeof u === 'string' && /^https?:/.test(u))
  if (!url) return null
  return { name: row.name, position: String(row.position ?? 'Agency head'), body: row.body, total: row.total as number, year: row.year, url }
}
