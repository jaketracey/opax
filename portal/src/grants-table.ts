import type {Page} from '../public/datatable.js'
import {grantsTableHTML} from '../public/grants-table.js'
import {tableApi} from './table-api'
import {tablePrivacyCheck} from './table-privacy'

/** Grants use the same D1 query and hash registry as the public table API. */
export async function grantsHTML(url: URL, env: {TABLE_DB: D1Database; ASSETS: Fetcher; CACHE_EPOCH?: string}): Promise<string> {
  const check = await tablePrivacyCheck(env.ASSETS)
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
    const empty = grantsTableHTML({rows: [], total: 0, page: 1, pageSize: 50, facets: {}}, url.searchParams, check, url)
    if (response.status === 400) return empty
    throw new Error('Grant table unavailable')
  }
  const page = await response.json() as Page
  return grantsTableHTML(page, url.searchParams, check, url)
}
