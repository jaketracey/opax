import {donorLookup, type DonorDisclosureRecord} from '../public/donor-disclosure.js'
let memo: Promise<Map<string,DonorDisclosureRecord>> | null = null
/** Deployment-fixed disclosure names and match evidence; no privacy matcher. */
export function loadDonorIndex(assets: Fetcher): Promise<Map<string,DonorDisclosureRecord>> {
  return memo ??= assets.fetch(new Request('https://opax.com.au/graph/donor-index.json'))
    .then(async response=>{
      if(!response.ok) throw new Error('Donor index unavailable')
      const data=await response.json() as {donors:DonorDisclosureRecord[]}
      if(!Array.isArray(data.donors)) throw new Error('Donor index malformed')
      return donorLookup(data.donors)
    }).catch(error=>{memo=null;throw error})
}
