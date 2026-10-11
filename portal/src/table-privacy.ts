import {loadTableIdentityIndex} from './table-identities.mjs'

const indices = new WeakMap<Fetcher, Promise<(text: string) => boolean>>()
const readers = new WeakMap<Function, Fetcher>()
/** SSR renderers share the same index through their disk/ASSETS read boundary. */
export function tablePrivacyCheckFromRead(read: (path: string) => Promise<unknown>): Promise<(text: string) => boolean> {
  let assets = readers.get(read)
  if (!assets) {
    assets = {fetch: async (request: Request) => Response.json(await read(new URL(request.url).pathname))} as Fetcher
    readers.set(read, assets)
  }
  return tablePrivacyCheck(assets)
}
/** Shared graph index, independent of client rows. In donor tables there are no
 * office-holder exemptions: a donor search must not reflect a withheld name. */
export async function tablePrivacyCheck(assets: Fetcher): Promise<(text: string) => boolean> {
  let pending = indices.get(assets)
  if (!pending) {
    pending = loadTableIdentityIndex(async path => {
      const response = await assets.fetch(new Request(`https://opax.com.au${path}`))
      if (!response.ok) throw new Error('Privacy index unavailable')
      return response.json()
    }).then(index => {
      return (text: string) => !index.check(text)
    }).catch(() => {indices.delete(assets); return () => false})
    indices.set(assets, pending)
  }
  return pending
}

/** Read-only validation; the response never includes input or index contents. */
export async function tablePrivacy(request: Request, assets: Fetcher): Promise<Response> {
  const headers = {'cache-control':'no-store', 'x-robots-tag':'noindex', 'content-type':'application/json'}
  if (request.method !== 'POST') return Response.json({safe:false}, {status:405, headers})
  try {
    const input = await request.text()
    const value: unknown = JSON.parse(input).text
    if (typeof value !== 'string') return Response.json({safe:false}, {status:400, headers})
    const check = await tablePrivacyCheck(assets)
    return Response.json({safe:check(value)}, {headers})
  } catch { return Response.json({safe:false}, {status:503, headers}) }
}
