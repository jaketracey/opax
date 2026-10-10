import { MONEY_GRAPHS, donorPrivacyIndex, donorNameWithheld, foldDonorName, type DonorPrivacyIndex } from '../public/donor-entity.js'
type DonorGraph = { nodes: { label: string; kind: string; aliases?: string[] | null; industry?: string | null }[] }

let memo: Promise<DonorPrivacyIndex> | null = null
/** The organisation/withheld donor names, read once per isolate (the assets are fixed per deployment). */
export function loadDonorIndex(assets: Fetcher): Promise<DonorPrivacyIndex> {
  memo ??= Promise.all(MONEY_GRAPHS.map(async path => {
    const response = await assets.fetch(new Request(`https://opax.com.au${path}`))
    if (!response.ok) throw new Error(`${path} ${response.status}`)
    return response.json() as Promise<DonorGraph>
  })).then(donorPrivacyIndex).catch(err => { memo = null; throw err })
  return memo
}

/** A donor page, card or link for this name withholds it; unreadable money data fails closed. */
export async function donorWithheld(assets: Fetcher, name: string): Promise<boolean> {
  const index = await loadDonorIndex(assets).catch(() => null)
  return !index || donorNameWithheld(index, name)
}

/** Whether a name from another register (a campaigner, a connection, a meeting) is a withheld donor's. */
export async function namesWithheldDonor(assets: Fetcher, name: string): Promise<boolean> {
  const index = await loadDonorIndex(assets).catch(() => null)
  return !index || index.withheld.has(foldDonorName(name))
}
