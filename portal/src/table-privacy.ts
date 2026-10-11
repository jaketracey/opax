import {compileHashedIdentityCheck} from './table-identity-hashes.mjs'

const indices = new WeakMap<Fetcher, Promise<(text: string) => boolean>>()
/** Complete build-time registry: donor, recipient and supplier identities.
 * Only hashes are served; anonymised graphs cannot reconstruct this index. */
export async function tablePrivacyCheck(assets: Fetcher): Promise<(text: string) => boolean> {
  let pending = indices.get(assets)
  if (!pending) {
    pending = (async () => {
      const response = await assets.fetch(new Request('https://opax.com.au/table-private-identities.json'))
      if (!response.ok) throw new Error('Privacy index unavailable')
      const registry = await response.json() as {version:number;identities:{hash:string;words:number}[]}
      if(registry.version!==1)throw new Error('Privacy index unavailable')
      const blocked=compileHashedIdentityCheck(registry.identities)
      return (text: string) => !blocked(text)
    })().catch(() => {indices.delete(assets); return () => false})
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
