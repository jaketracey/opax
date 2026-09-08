import { normalize, tokens, bucket } from './catalog-query.mjs'
export const CATALOG_KINDS = new Set(['person','party','donor','supplier','receipt','contract','grant','bill','interest','expense','access','campaigner','report'])
export interface CatalogRecord {
  kind: string; title: string; href: string; snippet: string; slug: string; resource: string
  date?: string | null; dateLabel?: string; source?: string; url?: string; record_id?: string; score?: number; sort_date?: string
}
type Meta = [string, number, number, string, string, string, string]
interface Manifest { version: string; count: number; counts: Record<string,number>; coverage: string; recordShardSize: number }
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
function partyName(s:string){return normalize(s).replace(/australian labor party|australian labour party/g,'labor').replace(/liberal party of australia/g,'liberal').replace(/the nationals/g,'nationals')}
export function matchesCatalogFilters(meta: Meta, params: URLSearchParams): boolean {
  const [kind,from,to,states,parties,speakers,topics]=meta
  const has = (field:string, value:string) => ('|'+field+'|').includes('|'+value+'|')
  const selected=params.get('kind')||'all'
  if(selected!=='all' && selected!==kind)return false
  if(params.get('state') && !has(states, params.get('state')!))return false
  if(params.get('party') && !has(parties, partyName(params.get('party')!)))return false
  if(params.get('speaker') && !has(speakers, normalize(params.get('speaker'))))return false
  if(params.get('topic') && !has(topics, params.get('topic')!))return false
  if(params.get('from') && (!to || to<Number(params.get('from'))))return false
  if(params.get('to') && (!from || from>Number(params.get('to'))))return false
  return true
}
export async function searchCatalog(url: URL, assets: Fetcher) {
  const terms=tokens(url.searchParams.get('q'))
  if(terms.length>16)throw new Error('Use up to 16 search words')
  const manifest=await asset<Manifest>(assets,'/search-catalog/manifest.json',true)
  if(!/^[a-f0-9]{16}$/.test(manifest.version))throw new Error('Invalid search index')
  const base='/search-catalog/'+manifest.version+'/'
  const [metadata,...partitions]=await Promise.all([
    asset<Meta[]>(assets,base+'meta.json',true),
    ...terms.map(t=>asset<Record<string,number[]>>(assets,base+'terms-'+bucket(t)+'.json',true)),
  ])
  const meta=metadata as Meta[]
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
        if(scores && !scores[id])continue
        if(!hits[id])count++
        hits[id]=Math.max(hits[id],posting[n+1]*(key===term?1:0.65))
      }
    }
    if(scores)for(let id=0;id<hits.length;id++)if(hits[id])hits[id]+=scores[id]
    scores=hits
    if(!count)break
  }
  // Keep only the best 200 IDs in a min-heap. Broad words must not allocate
  // hundreds of thousands of Map entries or result objects per request.
  const newest=url.searchParams.get('sort')==='newest'
  const compare=(a:number,b:number)=>(newest?(meta[a][2]-meta[b][2]):0)||(scores![a]-scores![b])||b-a
  const heap:number[]=[]
  let total=0
  if(scores)for(let id=0;id<scores.length;id++){
    if(!scores[id]||!matchesCatalogFilters(meta[id],url.searchParams))continue
    total++
    if(heap.length<200){
      heap.push(id);let child=heap.length-1
      while(child>0){const parent=(child-1)>>1;if(compare(heap[child],heap[parent])>=0)break;[heap[child],heap[parent]]=[heap[parent],heap[child]];child=parent}
    } else if(compare(id,heap[0])>0){
      heap[0]=id;let parent=0
      while(true){let child=parent*2+1;if(child>=heap.length)break;if(child+1<heap.length&&compare(heap[child+1],heap[child])<0)child++;if(compare(heap[parent],heap[child])<=0)break;[heap[parent],heap[child]]=[heap[child],heap[parent]];parent=child}
    }
  }
  const matches=heap.sort((a,b)=>compare(b,a)).map(id=>[id,scores![id]])
  const selected=matches.slice(0,200), shards=new Map<number,CatalogRecord[]>()
  const shardIds=[...new Set(selected.map(([id])=>Math.floor(id/manifest.recordShardSize)))]
  // Bound concurrent asset reads, including the 200-row export request.
  for(let i=0;i<shardIds.length;i+=6)await Promise.all(shardIds.slice(i,i+6).map(async id=>shards.set(id,await asset<CatalogRecord[]>(assets,base+'records-'+id+'.json'))))
  const records=selected.map(([id,score])=>({...shards.get(Math.floor(id/manifest.recordShardSize))![id%manifest.recordShardSize],score,sort_date:String(meta[id][2]||'')}))
  return {results:records,total,truncated:total>200,coverage:manifest.coverage,version:manifest.version,counts:manifest.counts}
}
