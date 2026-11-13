import {donorLookup, type DonorDisclosureRecord} from '../public/donor-disclosure.js'
let memo: Promise<Map<string,DonorDisclosureRecord>> | null = null
let recordsMemo: Promise<DonorDisclosureRecord[]> | null = null
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
