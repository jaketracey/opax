/** Shared readers for the record tools: published tables (D1 via the table API) and site URLs. */
import { tableApi } from '../table-api'
import type { ToolEnv } from './types'

export const fold = (s: unknown) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[‘’ʼ`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim()
export const aud = (n: unknown) => '$' + Math.round(Number(n)).toLocaleString('en-AU')
export const siteUrl = (env: ToolEnv, path: string) => new URL(path, env.origin ?? env.COMMUNITY_ORIGIN ?? 'https://opax.com.au').href
export const clip = (s: unknown, n: number) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t }

export interface TablePage { rows: Record<string, unknown>[]; total: number; facets?: Record<string, unknown> }
/** One published-table query, in process, with the same grammar, filters and cache keys as /api/table. */
export async function tableRows(env: ToolEnv, dataset: string, params: Record<string, string | undefined>): Promise<TablePage> {
  if (!env.TABLE_DB) throw new Error('Published tables are unavailable.')
  env.signal?.throwIfAborted()
  const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''))
  const response = await tableApi(new Request('https://opax.com.au/api/table/' + dataset + '?' + query), { TABLE_DB: env.TABLE_DB, ...(env.ASSETS ? { ASSETS: env.ASSETS } : {}) })
  env.signal?.throwIfAborted()
  if (!response.ok) throw new Error('Published table query failed.')
  return await response.json() as TablePage
}
