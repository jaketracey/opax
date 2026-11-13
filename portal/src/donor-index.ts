import {donorLookup, type DonorDisclosureRecord} from '../public/donor-disclosure.js'
import {foldDonorName} from '../public/donor-entity.js'
export type DonorRecordsIndex = Map<string,DonorDisclosureRecord[]>
let memo: Promise<Map<string,DonorDisclosureRecord>> | null = null
let recordsMemo: Promise<DonorDisclosureRecord[]> | null = null
let recordsIndexMemo: Promise<DonorRecordsIndex> | null = null
/** Deployment-fixed disclosure names and match evidence; no privacy matcher. */
export function loadDonorRecords(assets: Fetcher): Promise<DonorDisclosureRecord[]> {
  return recordsMemo ??= assets.fetch(new Request('https://opax.com.au/graph/donor-index.json'))
    .then(async response=>{
      if(!response.ok) throw new Error('Donor index unavailable')
      const data=await response.json() as {donors:DonorDisclosureRecord[]}
      if(!Array.isArray(data.donors)) throw new Error('Donor index malformed')
      return data.donors
    }).catch(error=>{recordsMemo=null;throw error})
}
export function loadDonorIndex(assets: Fetcher): Promise<Map<string,DonorDisclosureRecord>> {
  return memo ??= loadDonorRecords(assets).then(donorLookup).catch(error=>{memo=null;throw error})
}

/** Fold each published spelling once per isolate, retaining source order and
 * all collision records. Repeated aliases must not repeat a record. */
export function loadDonorRecordsIndex(assets: Fetcher): Promise<DonorRecordsIndex> {
  return recordsIndexMemo ??= loadDonorRecords(assets).then(records=>{
    const index: DonorRecordsIndex = new Map()
    for (const record of records) {
      const keys = new Set<string>()
      for (const name of [record.source_name,record.label,record.name,...record.aliases || [],...record.lookup_names || []]) {
        if (!name) continue
        const key = foldDonorName(name)
        if (keys.has(key)) continue
        keys.add(key)
        const matches = index.get(key)
        if (matches) matches.push(record)
        else index.set(key,[record])
      }
    }
    return index
  }).catch(error=>{recordsIndexMemo=null;throw error})
}

/** No per-request catalogue scan or identity merge; jurisdictions stay separate. */
export function donorRecordsForName(index: DonorRecordsIndex, name: string): DonorDisclosureRecord[] {
  return index.get(foldDonorName(name)) ?? []
}
