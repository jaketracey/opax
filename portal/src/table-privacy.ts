import {compileHashedIdentityCheck,csvIdentityCheck} from './table-identity-hashes.mjs'

const indices = new WeakMap<Fetcher, Map<string, Promise<(text: string) => boolean>>>()
/** Complete build-time registry: donor, recipient and supplier identities.
 * Only hashes are served; anonymised graphs cannot reconstruct this index. */
export async function tablePrivacyCheck(assets: Fetcher, mode: 'query' | 'row' = 'query'): Promise<(text: string) => boolean> {
  let modes = indices.get(assets)
  if (!modes) indices.set(assets, modes = new Map())
  let pending = modes.get(mode)
  if (!pending) {
    pending = (async () => {
      const response = await assets.fetch(new Request('https://opax.com.au/table-private-identities.json'))
      if (!response.ok) throw new Error('Privacy index unavailable')
      const registry = await response.json() as {version:number;identities:{hash:string;words:number;compact:boolean;length:number;rolling:number}[];strippedLengths:number[]}
      if(registry.version!==2 || !Array.isArray(registry.identities) || registry.identities.some(e=>typeof e.compact!=='boolean'||!Number.isSafeInteger(e.length)||!Number.isSafeInteger(e.rolling)) || !Array.isArray(registry.strippedLengths) || !registry.strippedLengths.length || registry.strippedLengths.some(n=>!Number.isSafeInteger(n)||n<4))throw new Error('Privacy index unavailable')
      const blocked=compileHashedIdentityCheck(registry.identities,registry.strippedLengths,{mode})
      return (text: string) => !blocked(text)
    })().catch(() => {modes!.delete(mode); return () => false})
    modes.set(mode, pending)
  }
  return pending
}

/** Read-only validation; the response never includes input or index contents. */
export async function tablePrivacy(request: Request, assets: Fetcher): Promise<Response> {
  const headers = {'cache-control':'no-store', 'x-robots-tag':'noindex', 'content-type':'application/json'}
  if (request.method !== 'POST') return Response.json({safe:false}, {status:405, headers})
  try {
    const input = await request.text()
    const parsed = JSON.parse(input)
    const value: unknown = parsed.text
    if (parsed.mode != null && !['query','row','csv'].includes(parsed.mode)) return Response.json({safe:false}, {status:400, headers})
    if (typeof value !== 'string') return Response.json({safe:false}, {status:400, headers})
    const check = await tablePrivacyCheck(assets, parsed.mode === 'csv' ? 'row' : parsed.mode || 'query')
    return Response.json({safe:parsed.mode === 'csv' ? !csvIdentityCheck(value,field=>!check(field)) : check(value)}, {headers})
  } catch { return Response.json({safe:false}, {status:503, headers}) }
}
