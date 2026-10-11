import {compileHashedIdentityCheck} from './table-identity-hashes.mjs'
import fingerprints from './table-privacy-fingerprints.json' with {type:'json'}

const indices = new WeakMap<Fetcher, Promise<(text: string) => boolean>>()
const readers = new WeakMap<(path:string)=>Promise<unknown>, Fetcher>()
/** Local/SSR readers use exactly the same hash-only registry guard as the worker. */
export function tablePrivacyCheckFrom(read:(path:string)=>Promise<unknown>):Promise<(text:string)=>boolean> {
  let assets=readers.get(read)
  if (!assets) {
    assets={fetch:async (request:Request)=>Response.json(await read(new URL(request.url).pathname))} as Fetcher
    readers.set(read,assets)
  }
  return tablePrivacyCheck(assets)
}
/** Complete build-time registry: donor, recipient and supplier identities.
 * Only hashes are served; anonymised graphs cannot reconstruct this index. */
export async function tablePrivacyCheck(assets: Fetcher): Promise<(text: string) => boolean> {
  let pending = indices.get(assets)
  if (!pending) {
    pending = (async () => {
      const response = await assets.fetch(new Request('https://opax.com.au/table-private-identities.json'))
      if (!response.ok) throw new Error('Privacy index unavailable')
      const registry = await response.json() as {version:number;identities:{hash:string;words:number}[];strippedLengths:number[]}
      if(registry.version!==1 || !Array.isArray(registry.strippedLengths) || !registry.strippedLengths.length || registry.strippedLengths.some(n=>!Number.isSafeInteger(n)||n<4))throw new Error('Privacy index unavailable')
      const quick=fingerprints.version===1 ? new Map(fingerprints.identities.map(entry=>[entry.hash,entry])) : null
      const entries=registry.identities.map(entry=>({...entry,...quick?.get(entry.hash)}))
      const blocked=compileHashedIdentityCheck(entries,registry.strippedLengths)
      const approved=new Map<string,number>();let approvedBytes=0
      return (text: string) => {
        if (approved.has(text)) {
          const bytes=approved.get(text)!
          approved.delete(text);approved.set(text,bytes)
          return true
        }
        if (blocked(text)) return false
        const bytes=text.length*2
        if (bytes<=262144) {
          while (approved.size>=65536 || approvedBytes+bytes>8388608) {
            const first=approved.keys().next().value!
            approvedBytes-=approved.get(first)!
            approved.delete(first)
          }
          approved.set(text,bytes);approvedBytes+=bytes
        }
        return true
      }
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
