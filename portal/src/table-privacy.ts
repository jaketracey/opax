import {compileHashedIdentityCheck,csvIdentityCheck} from './table-identity-hashes.mjs'
import {timedSync} from './server-timing.ts'

const indices = new WeakMap<Fetcher, Map<string, Promise<(text: string) => boolean>>>()
const readers = new WeakMap<(path:string)=>Promise<unknown>, Fetcher>()
const readChecks = new WeakMap<(path:string)=>Promise<unknown>, Promise<(text:string)=>boolean>>()
export function memoisedCheck(check:(text:string)=>boolean):(text:string)=>boolean {
  const results=new Map<string,boolean>()
  return text=>{
    if(results.has(text))return results.get(text)!
    const safe=check(text)
    if(results.size>=256)results.clear()
    results.set(text,safe)
    return safe
  }
}
/** Cache repeated reader checks against the same strict shared query guard. */
export function tablePrivacyCheckFromRead(read:(path:string)=>Promise<unknown>):Promise<(text:string)=>boolean> {
  let pending=readChecks.get(read)
  if (!pending) {
    pending=tablePrivacyCheckFrom(read).then(memoisedCheck)
    readChecks.set(read,pending)
  }
  return pending
}
/** Readers use the same complete registry and query/row policy as the worker. */
export function tablePrivacyCheckFrom(read:(path:string)=>Promise<unknown>, mode: 'query' | 'row' = 'query'):Promise<(text:string)=>boolean> {
  let assets=readers.get(read)
  if (!assets) {
    assets={fetch:async (request:Request)=>Response.json(await read(new URL(request.url).pathname))} as Fetcher
    readers.set(read,assets)
  }
  return tablePrivacyCheck(assets,mode)
}
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
      const registry = await response.json() as {version:number;identities:{hash:string;words:number;compact:boolean;length:number;rolling:number;row:false|'token'|'field'}[];strippedLengths:number[]}
      if(registry.version!==3 || !Array.isArray(registry.identities) || registry.identities.some(e=>typeof e.compact!=='boolean'||!Number.isSafeInteger(e.length)||!Number.isSafeInteger(e.rolling)||![false,'token','field'].includes(e.row)) || !Array.isArray(registry.strippedLengths) || !registry.strippedLengths.length || registry.strippedLengths.some(n=>!Number.isSafeInteger(n)||n<4))throw new Error('Privacy index unavailable')
      const blocked=compileHashedIdentityCheck(registry.identities,registry.strippedLengths,{mode})
      return (text: string) => timedSync('privacy',()=>!blocked(text))
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
    if(parsed.mode==='row'&&Array.isArray(parsed.texts)){
      if(!parsed.texts.length||parsed.texts.some((v:unknown)=>typeof v!=='string'))return Response.json({safe:false},{status:400,headers})
      const check=await tablePrivacyCheck(assets,'row')
      return Response.json({safe:parsed.texts.every(check)},{headers})
    }
    if (typeof value !== 'string') return Response.json({safe:false}, {status:400, headers})
    const check = await tablePrivacyCheck(assets, parsed.mode === 'csv' ? 'row' : parsed.mode || 'query')
    return Response.json({safe:parsed.mode === 'csv' ? !csvIdentityCheck(value,field=>!check(field)) : check(value)}, {headers})
  } catch { return Response.json({safe:false}, {status:503, headers}) }
}
