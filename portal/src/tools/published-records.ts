/** Bounded public-record helpers. Asset paths come from code or checked manifests. */
import { clip, fold } from './record-common'
import type { StructuredToolResult, ToolArgs, ToolCitation } from './types'

export type RecordRow = Record<string, unknown>
export const object = (v: unknown): RecordRow => v && typeof v === 'object' && !Array.isArray(v) ? v as RecordRow : {}
export const records = (v: unknown): RecordRow[] => Array.isArray(v) ? v.filter(r => r && typeof r === 'object' && !Array.isArray(r)) : []
export const sourceUrl = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  try { const url = new URL(v); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null } catch { return null }
}
export const wordsMatch = (query: unknown, values: unknown[]) => {
  const text = fold(values.filter(v => v != null).join(' ')).replace(/_/g, ' ')
  const words = fold(query).replace(/_/g, ' ').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  return words.every(word => text.includes(word))
}
export const validDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
export const validWindow = (args: ToolArgs) => (!args.since || validDate(args.since)) && (!args.until || validDate(args.until)) && (!args.since || !args.until || String(args.since) <= String(args.until))
export const inWindow = (v: unknown, args: ToolArgs) => (!args.since && !args.until) || typeof v === 'string' && validDate(v.slice(0, 10)) && (!args.since || v.slice(0, 10) >= String(args.since)) && (!args.until || v.slice(0, 10) <= String(args.until))
export const fiscalYearValid = (v: unknown) => !v || typeof v === 'string' && /^\d{4}-\d{2}$/.test(v) && String(Number(v.slice(0, 4)) + 1).slice(-2) === v.slice(-2)

/** Retain nulls and source markers. Omitted detail has an explicit full-record pointer. */
export function boundedValue(v: unknown, textLimit = 1000, depth = 0): unknown {
  if (typeof v === 'string') return clip(v, textLimit)
  if (v == null || typeof v !== 'object') return v
  if (depth >= 5) return '[Open full record for nested metadata]'
  if (Array.isArray(v)) return v.slice(0, 20).map(item => boundedValue(item, textLimit, depth + 1))
  return Object.fromEntries(Object.entries(v).slice(0, 50).map(([key, value]) => [key, boundedValue(value, textLimit, depth + 1)]))
}

/** Stay below Ask's 16 KiB tool-result cap, with room for its adapter and the page link added to every record set. */
export function publishedResult(rows: RecordRow[], citations: ToolCitation[], meta: Omit<StructuredToolResult, 'rows' | 'citations'>): StructuredToolResult {
  const picked = rows.slice(), cites = citations.slice()
  const result = () => ({ ...meta, rows: picked, citations: cites, ...(picked.length < rows.length ? { truncated: true, next_offset: Number(meta.offset ?? 0) + picked.length } : {}) })
  while (picked.length > 1 && new TextEncoder().encode(JSON.stringify(result())).length > 13_700) { picked.pop(); cites.pop() }
  if (new TextEncoder().encode(JSON.stringify(result())).length > 13_700) {
    const row = object(picked[0])
    return { rows: [], citations: [], notes: ['This record exceeds the tool payload limit. Open its full record.'], full_record_url: row.full_record_url ?? row.url ?? null, truncated: true }
  }
  return result() as StructuredToolResult
}
