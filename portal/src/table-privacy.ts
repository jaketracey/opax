import {compileHashedIdentityCheck} from './table-identity-hashes.mjs'
import {timedSync} from './server-timing.ts'

const indices = new WeakMap<Fetcher, Promise<(text: string) => boolean>>()
const readers = new WeakMap<Function, Fetcher>()
const readChecks = new WeakMap<Fetcher, Promise<(text: string) => boolean>>()
/** The shared index is immutable for a render. Bound repeated row, scalar and
 * facet checks of the same text to one hash pass without changing the policy. */
export function memoisedCheck(check: (text: string) => boolean): (text: string) => boolean {
  const results = new Map<string, boolean>()
  return text => {
    if (results.has(text)) return results.get(text)!
    const safe = check(text)
    if (results.size >= 256) results.clear()
    results.set(text, safe)
    return safe
  }
}
/** Adapt SSR's read boundary to the same complete hashed registry. */
export function tablePrivacyCheckFromRead(read: (path: string) => Promise<unknown>): Promise<(text: string) => boolean> {
  let assets = readers.get(read)
  if (!assets) {
    assets = {fetch: async (request: Request) => Response.json(await read(new URL(request.url).pathname))} as Fetcher
    readers.set(read, assets)
  }
  let pending = readChecks.get(assets)
  if (!pending) {
    pending = tablePrivacyCheck(assets).then(memoisedCheck)
    readChecks.set(assets, pending)
  }
  return pending
}
/** Complete build-time registry: donor, recipient and supplier identities.
 * Only hashes are served; anonymised graphs cannot reconstruct this index. */
export async function tablePrivacyCheck(assets: Fetcher): Promise<(text: string) => boolean> {
  let pending = indices.get(assets)
  if (!pending) {
    pending = (async () => {
      const response = await assets.fetch(new Request('https://opax.com.au/table-private-identities.json'))
      if (!response.ok) throw new Error('Privacy index unavailable')
      const registry = await response.json() as {version:number;identities:{hash:string;words:number}[];strippedLengths:number[];prefilter?:unknown}
      if(registry.version!==1 || !Array.isArray(registry.strippedLengths) || !registry.strippedLengths.length || registry.strippedLengths.some(n=>!Number.isSafeInteger(n)||n<4))throw new Error('Privacy index unavailable')
      const blocked=compileHashedIdentityCheck(registry.identities,registry.strippedLengths,registry.prefilter)
      return (text: string) => timedSync('privacy', () => !blocked(text))
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
