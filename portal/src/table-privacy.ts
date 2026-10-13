import {compileHashedIdentityCheck} from './table-identity-hashes.mjs'
import {identityPhrase,publicationIdentityCheck} from './table-identities.mjs'

type Registry = {version:number;identities:{hash:string;words:number}[];strippedLengths:number[];donorIdentities?:{hash:string;words:number}[];donorStrippedLengths?:number[];recipientIdentities?:{hash:string;words:number}[];recipientStrippedLengths?:number[];withheldSuppliers?:string[];politicalSuppliers?:string[]}
type Policy = {safe:(text:string)=>boolean;recipients:(text:string)=>boolean;donors:(text:string)=>boolean;suppliers:Set<string>;political:Set<string>|null}
const indices = new WeakMap<Fetcher, Promise<Policy>>()
const readers = new WeakMap<Function, Fetcher>()
const readChecks = new WeakMap<Fetcher, Promise<(text: string) => boolean>>()
/** Adapt SSR's read boundary to the same complete hashed registry. */
export function tablePrivacyCheckFromRead(read: (path: string) => Promise<unknown>): Promise<(text: string) => boolean> {
  let assets = readers.get(read)
  if (!assets) {
    assets = {fetch: async (request: Request) => Response.json(await read(new URL(request.url).pathname))} as Fetcher
    readers.set(read, assets)
  }
  let pending = readChecks.get(assets)
  if (!pending) {
    pending = tablePrivacyCheck(assets).then(check => {
      // The shared index is immutable for this reader. Bound repeated row,
      // scalar and facet checks to this render without duplicating its policy.
      const results = new Map<string, boolean>()
      return text => {
        if (results.has(text)) return results.get(text)!
        const safe = check(text)
        if (results.size >= 256) results.clear()
        results.set(text, safe)
        return safe
      }
    })
    readChecks.set(assets, pending)
  }
  return pending
}
/** One build-time registry, with the complete query scope and recipient publication scope. */
async function tablePolicy(assets: Fetcher): Promise<Policy> {
  let pending = indices.get(assets)
  if (!pending) {
    pending = (async () => {
      const response = await assets.fetch(new Request('https://opax.com.au/table-private-identities.json'))
      if (!response.ok) throw new Error('Privacy index unavailable')
      const registry = await response.json() as Registry
      if(registry.version!==1 || !Array.isArray(registry.strippedLengths) || !registry.strippedLengths.length || registry.strippedLengths.some(n=>!Number.isSafeInteger(n)||n<4))throw new Error('Privacy index unavailable')
      const blocked=compileHashedIdentityCheck(registry.identities,registry.strippedLengths)
      const recipientIdentitiesBlocked=registry.recipientIdentities && registry.recipientStrippedLengths
        ? compileHashedIdentityCheck(registry.recipientIdentities,registry.recipientStrippedLengths) : () => true
      const agencyResponse=await assets.fetch(new Request('https://opax.com.au/agencies.json'))
      const agencyDirectory=agencyResponse.ok ? await agencyResponse.json() as {agencies?:{name:string}[]} : null
      const recipientBlocked=publicationIdentityCheck(recipientIdentitiesBlocked,agencyDirectory?.agencies?.map(agency=>agency.name) || [])
      const donorBlocked=registry.donorIdentities && registry.donorStrippedLengths ? compileHashedIdentityCheck(registry.donorIdentities,registry.donorStrippedLengths) : blocked
      return {donors:(text:string)=>!donorBlocked(text),safe:(text:string)=>!blocked(text),recipients:(text:string)=>!recipientBlocked(text),suppliers:new Set(registry.withheldSuppliers || []),political:Array.isArray(registry.politicalSuppliers) ? new Set(registry.politicalSuppliers) : null}
    })().catch(() => {indices.delete(assets); return {safe:()=>false,recipients:()=>false,donors:()=>false,suppliers:new Set<string>(),political:null}})
    indices.set(assets, pending)
  }
  return pending
}
export async function tablePrivacyCheck(assets: Fetcher): Promise<(text: string) => boolean> {
  return (await tablePolicy(assets)).safe
}
/** Recipient checks share the hashed registry; no source index is reconstructed at runtime. */
export async function tablePrivacyGuard(assets: Fetcher) {
  const policy=await tablePolicy(assets)
  return Object.assign((...texts:unknown[])=>texts.some(text=>!policy.safe(String(text))), {
    recipientCheck:policy.recipients, supplierPoliticalWithheld:(id:string)=>!policy.political || policy.political.has(id), supplierWithheld:(id:string)=>policy.suppliers.has(id),
    subjects:(...texts:unknown[])=>[...new Set(texts.filter(text=>!policy.recipients(String(text))).map(identityPhrase))],
  })
}
/** Read-only validation; the response never includes input or index contents. */
export async function tablePrivacy(request: Request, assets: Fetcher): Promise<Response> {
  const headers = {'cache-control':'no-store', 'x-robots-tag':'noindex', 'content-type':'application/json'}
  if (request.method !== 'POST') return Response.json({safe:false}, {status:405, headers})
  try {
    const input = JSON.parse(await request.text())
    if (typeof input.text !== 'string') return Response.json({safe:false}, {status:400, headers})
    const policy=await tablePolicy(assets)
    const subjectSafe=input.surface!=='political' || typeof input.subject==='string' && /^s-[a-f0-9]{20}$/.test(input.subject) && policy.political && !policy.political.has(input.subject)
    return Response.json({safe:Boolean(subjectSafe) && (input.surface==='data' ? policy.recipients : input.surface==='political' ? policy.donors : policy.safe)(input.text)}, {headers})
  } catch { return Response.json({safe:false}, {status:503, headers}) }
}
