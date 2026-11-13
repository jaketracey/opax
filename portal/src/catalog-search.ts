import { normalize, tokens, bucket, questionSubject } from './catalog-query.mjs'
import { canonicalChamber } from './ask-chamber.ts'
export const CATALOG_KINDS = new Set(['person','party','donor','agency','supplier','receipt','contract','grant','bill','interest','expense','access','campaigner','report','pay','audit report','electorate','topic','instrument','division','sitting','estimates','video','page','register'])
export interface CatalogRecord {
  kind: string; title: string; href: string; snippet: string; slug: string; resource: string
  state?: string; chamber?: string; source_url?: string; speaker?: string;
  date?: string | null; dateLabel?: string; source?: string; url?: string; record_id?: string; score?: number; sort_date?: string
  /** The snippet carries model-written text (a bill's summary sentences). */
  machine?: boolean
  report_type?: 'royal_commission' | 'integrity_report' | 'annual_report' | 'agency_report'
  body?: string; jurisdiction?: string; year?: string | null
  citation?: { url: string; document: string; page?: number }
}
type Meta = [string, number, number, string, string, string, string, string?, string?]
/** meta-core.json: each record's kind (an index into `kinds`) and closing year, all an unfiltered search reads. */
interface MetaCore { kinds: string[]; kind: number[]; to: (number | null)[] }
/** The record fields a search needs: its kind, its sort year and whether it passes the request's filters. */
interface CatalogMeta { length: number; kind(id: number): string; year(id: number): number | null; matches(id: number): boolean }
// Filters that read more than a record's kind. Without any of them a search needs only
// meta-core.json (2 MB) rather than meta.json (13 MB, about 38 MB once parsed).
const FULL_META_FILTERS = ['state','party','speaker','topic','from','to','chamber','since','until']
interface Manifest { version: string; count: number; counts: Record<string,number>; coverage: string; recordShardSize: number; reportNames?: boolean }
// Bounded isolate cache: metadata plus at most eight token partitions. Record
// shards live only for their request, so browsing cannot grow memory forever.
const cached = new Map<string, Promise<unknown>>()
async function asset<T>(assets: Fetcher, path: string, keep=false): Promise<T> {
  if(keep && cached.has(path)) return cached.get(path) as Promise<T>
  const pending = (async()=>{
    const response=await assets.fetch(new Request('https://opax.com.au'+path))
    if(!response.ok) throw new Error('Search index unavailable')
    return await response.json() as T
  })()
  if(keep){
    while(cached.size>=10) { const victim=[...cached.keys()].find(k=>k.includes('/terms-')); if(!victim)break; cached.delete(victim) }
    cached.set(path,pending)
    pending.catch(()=>{if(cached.get(path)===pending)cached.delete(path)})
  }
  return pending
}
// A renamed party's former names fold to its current one (labels.js PARTY_RENAMES), as scripts/build_search_catalog.mjs files them.
function partyName(s:string){return normalize(s).replace(/australian labor party|australian labour party/g,'labor').replace(/liberal party of australia/g,'liberal').replace(/the nationals/g,'nationals').replace(/\bliberal democratic party\b|\bliberal democrats\b/g,'libertarian party')}
export function matchesCatalogFilters(meta: Meta, params: URLSearchParams): boolean {
  const [kind,from,to,states,parties,speakers,topics,chamber,date]=meta
  const has = (field:string, value:string) => ('|'+field+'|').includes('|'+value+'|')
  const selected=params.get('kind')||'all'
  if(selected!=='all' && selected!==kind)return false
  if(params.get('state') && !has(states, params.get('state')!))return false
  if(params.get('chamber') && canonicalChamber(chamber)!==params.get('chamber'))return false
  if(params.get('since') && (!date || date<params.get('since')!))return false
  if(params.get('until') && (!date || date>params.get('until')!))return false
  if(params.get('party') && !has(parties, partyName(params.get('party')!)))return false
  if(params.get('speaker') && !has(speakers, normalize(params.get('speaker'))))return false
  if(params.get('topic') && !has(topics, params.get('topic')!))return false
  if(params.get('from') && (!to || to<Number(params.get('from'))))return false
  if(params.get('to') && (!from || from>Number(params.get('to'))))return false
  return true
}
/** A catalogue search ranked but not yet read: the best IDs and what reading them needs. */
interface RankedCatalog { manifest: Manifest; base: string; meta: CatalogMeta; selected: [number, number][]; total: number; matched_query?: string }
// Ask uses union matching and a per-kind window so contracts cannot crowd out
// receipts or interests. The public search keeps its exact AND semantics.
async function rankCatalog(url: URL, assets: Fetcher, options: { anyTerms?: boolean; perKind?: number } = {}): Promise<RankedCatalog> {
  const exact = await rankCatalogTerms(url, assets, options)
  if (exact.total || options.anyTerms) return exact
  const subject = questionSubject(url.searchParams.get('q'))
  if (!subject) return exact
  const retry = new URL(url)
  retry.searchParams.set('q', subject)
  const found = await rankCatalogTerms(retry, assets, options)
  return found.total ? { ...found, matched_query: subject } : exact
}
async function rankCatalogTerms(url: URL, assets: Fetcher, options: { anyTerms?: boolean; perKind?: number }): Promise<RankedCatalog> {
  const terms=tokens(url.searchParams.get('q'))
  if(terms.length>16)throw new Error('Use up to 16 search words')
  const manifest=await asset<Manifest>(assets,'/search-catalog/manifest.json',true)
  if(!/^[a-f0-9]{16}$/.test(manifest.version))throw new Error('Invalid search index')
  const base='/search-catalog/'+manifest.version+'/'
  const params=url.searchParams
  const fullMeta=async():Promise<CatalogMeta>=>{
    const rows=await asset<Meta[]>(assets,base+'meta.json',true)
    return {length:rows.length,kind:id=>rows[id][0],year:id=>rows[id][2],matches:id=>matchesCatalogFilters(rows[id],params)}
  }
  const coreMeta=async():Promise<CatalogMeta>=>{
    const core=await asset<MetaCore>(assets,base+'meta-core.json',true).catch(()=>null)
    // A catalogue built before meta-core.json existed (or an unreadable copy) answers from meta.json as before.
    if(!core || !Array.isArray(core.kinds) || !Array.isArray(core.kind) || !Array.isArray(core.to) || core.kind.length!==core.to.length)return fullMeta()
    const selected=params.get('kind')||'all'
    return {length:core.kind.length,kind:id=>core.kinds[core.kind[id]],year:id=>core.to[id],matches:id=>selected==='all' || selected===core.kinds[core.kind[id]]}
  }
  const [meta,...partitions]=await Promise.all([
    FULL_META_FILTERS.some(key=>params.get(key)) ? fullMeta() : coreMeta(),
    ...terms.map(t=>asset<Record<string,number[]>>(assets,base+'terms-'+bucket(t)+'.json',true)),
  ]) as [CatalogMeta,...Record<string,number[]>[]]
  let scores: Float32Array | null = null
  for(let i=0;i<terms.length;i++){
    const term=terms[i], partition=partitions[i] as Record<string,number[]>
    const keys=i===terms.length-1 && term.length>=3?Object.keys(partition).filter(t=>t.startsWith(term)):Object.hasOwn(partition,term)?[term]:[]
    const hits=new Float32Array(meta.length)
    let count=0
    for(const key of keys) {
      const posting=partition[key]
      for(let n=0;n<posting.length;n+=2){
        const id=posting[n]
        if(scores && !options.anyTerms && !scores[id])continue
        if(!hits[id])count++
        hits[id]=Math.max(hits[id],posting[n+1]*(key===term?1:0.65))
      }
    }
    if(scores)for(let id=0;id<hits.length;id++)if(options.anyTerms || hits[id])hits[id]+=scores[id]
    scores=hits
    if(!count && !options.anyTerms)break
  }
  // A report named exactly by title, body or short name wins within its kind.
  // This small precomputed lookup is parsed once per isolate, like token partitions.
  if(scores && manifest.reportNames) {
    const names=await asset<Record<string,number[]>>(assets,base+'report-names.json',true)
    const key=[...terms].sort().join(' ')
    for(const id of Object.hasOwn(names,key) ? names[key] : [])if(scores[id] && meta.kind(id)==='report')scores[id]+=1000
  }
  // Keep only the best 200 IDs in a min-heap. Broad words must not allocate
  // hundreds of thousands of Map entries or result objects per request.
  const compare=(a:number,b:number)=>(scores![a]-scores![b])||b-a
  const heaps=new Map<string,number[]>()
  const limit=options.perKind ?? 200
  let total=0
  if(scores)for(let id=0;id<scores.length;id++){
    if(!scores[id]||!meta.matches(id))continue
    total++
    const group=options.perKind ? meta.kind(id) : 'all'
    if(!heaps.has(group))heaps.set(group,[])
    const heap=heaps.get(group)!
    if(heap.length<limit){
      heap.push(id);let child=heap.length-1
      while(child>0){const parent=(child-1)>>1;if(compare(heap[child],heap[parent])>=0)break;[heap[child],heap[parent]]=[heap[parent],heap[child]];child=parent}
    } else if(compare(id,heap[0])>0){
      heap[0]=id;let parent=0
      while(true){let child=parent*2+1;if(child>=heap.length)break;if(child+1<heap.length&&compare(heap[child+1],heap[child])<0)child++;if(compare(heap[parent],heap[child])<=0)break;[heap[parent],heap[child]]=[heap[child],heap[parent]];parent=child}
    }
  }
  const matches=[...heaps.values()].flat().sort((a,b)=>compare(b,a)).map(id=>[id,scores![id]] as [number, number])
  return {manifest,base,meta,selected:matches.slice(0,200),total}
}
/** The records for these IDs, read a shard at a time. Record shards live only for their request. */
async function readRecords(assets: Fetcher, ranked: RankedCatalog, ids: number[]): Promise<Map<number, CatalogRecord>> {
  const size=ranked.manifest.recordShardSize, shards=new Map<number,CatalogRecord[]>()
  const shardIds=[...new Set(ids.map(id=>Math.floor(id/size)))]
  // Bound concurrent asset reads, including the 200-row export request.
  for(let i=0;i<shardIds.length;i+=6)await Promise.all(shardIds.slice(i,i+6).map(async id=>shards.set(id,await asset<CatalogRecord[]>(assets,ranked.base+'records-'+id+'.json'))))
  return new Map(ids.map(id=>[id,shards.get(Math.floor(id/size))![id%size]]))
}
export async function searchCatalog(url: URL, assets: Fetcher, options: { anyTerms?: boolean; perKind?: number } = {}) {
  const ranked=await rankCatalog(url,assets,options)
  const {manifest,meta,selected,total}=ranked
  const read=await readRecords(assets,ranked,selected.map(([id])=>id))
  const records=selected.map(([id,score])=>({...read.get(id)!,score,sort_date:String(meta.year(id)||'')}))
  return {results:records,total,truncated:total>200,coverage:manifest.coverage,version:manifest.version,counts:manifest.counts,matched_query:ranked.matched_query}
}

/** One ranked catalogue result before its record is read: enough to order it by relevance or date and count its year. */
export interface CatalogStub { id: number; kind: string; date?: string; sort_date: string; title?: undefined; href?: undefined; slug?: undefined }
/** dates.json stores a record's date as YYYYMMDD; 0 means it has none, -1 one that number cannot hold. */
const dateText = (value: number) => { const s=String(value); return s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8) }
/**
 * searchCatalog for a page of results. A broad word's best 200 records span 50 to 70 record
 * shards (about 5 MB); ordering and counting them needs only each record's date, which
 * dates.json holds, so `records` reads just the shards behind the rows a page shows.
 * Without a usable dates.json every selected record is read up front, as searchCatalog does.
 */
export async function searchCatalogPaged(url: URL, assets: Fetcher) {
  const ranked=await rankCatalog(url,assets)
  const {manifest,meta,selected,total}=ranked
  const ids=selected.map(([id])=>id)
  const dates=await asset<number[]>(assets,ranked.base+'dates.json',true).catch(()=>null)
  const usable=Array.isArray(dates) && dates.length===meta.length && ids.every(id=>Number.isInteger(dates[id]) && dates[id]>=0)
  const early=usable ? null : await readRecords(assets,ranked,ids)
  const stubs: CatalogStub[]=ids.map(id=>{
    const year=String(meta.year(id)||'')
    const date=early ? early.get(id)!.date ?? undefined : dates![id] ? dateText(dates![id]) : undefined
    return {id,kind:meta.kind(id),date:date || undefined,sort_date:date || year || ''}
  })
  const records=async(rows: number[])=>early ? new Map(rows.map(id=>[id,early.get(id)!])) : readRecords(assets,ranked,rows)
  return {stubs,records,total,truncated:total>200,coverage:manifest.coverage,version:manifest.version,counts:manifest.counts,matched_query:ranked.matched_query}
}
