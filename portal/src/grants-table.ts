import type {Page} from '../public/datatable.js'
import {grantsTableHTML} from '../public/grants-table.js'
import {saGrantsReader,saGrantsRows} from './sa-grants'
import {tableApi} from './table-api'

/** Grants use the same D1 query contract as the public table API. */
export async function grantsHTML(url: URL, env: {TABLE_DB: D1Database; ASSETS: Fetcher; CACHE_EPOCH?: string}): Promise<string> {
  const endpoint = new URL('/api/table/grants', url)
  endpoint.search = url.search
  // The page's jurisdiction selector maps to the API's category-array filter.
  const jur = endpoint.searchParams.get('jur')
  if (jur && ['federal', 'qld'].includes(jur)) {
    endpoint.searchParams.delete('jur')
    const prefix = [...endpoint.searchParams.keys()].some(key => key.startsWith('t.')) ? 't.' : ''
    endpoint.searchParams.set(`${prefix}f.jurisdiction`, JSON.stringify([jur]))
  }
  const response = await tableApi(new Request(endpoint), env)
  if (!response.ok) {
    // Still scrub request-derived state if D1 is unavailable or rejects grammar.
    const empty = grantsTableHTML({rows: [], total: 0, page: 1, pageSize: 50, facets: {}}, url.searchParams, url)
    if (response.status === 400) return empty
    throw new Error('Grant table unavailable')
  }
  const page = await response.json() as Page
  const historical=await saGrantsReader(env.ASSETS)().catch(()=>null)
  const link=historical&&saGrantsRows(historical).length?'<p><a href="/register/sa-grants">South Australian historical grants, 2016–17 and 2017–18</a></p>':''
  return grantsTableHTML(page, url.searchParams, url)+link
}
