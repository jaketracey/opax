import { MONEY_GRAPHS, donorPrivacyIndex, donorNameWithheld, foldDonorName, withheldPhrases, namesWithheldPhrase, type DonorPrivacyIndex, type WithheldPhrases } from '../public/donor-entity.js'
export { withheldPhrases, namesWithheldPhrase }
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

/** The one reply to a question naming a withheld donor: fixed text, no model call. */
export const WITHHELD_DONOR_REPLY = "OPAX doesn't name individual donors. Party-level totals are on the party's page."

type PhraseGraph = { nodes: { label: string; kind: string; aliases?: string[] | null; industry?: string | null }[] }

let phrasesMemo: Promise<WithheldPhrases> | null = null
function loadWithheldPhrases(assets: Fetcher): Promise<WithheldPhrases> {
  const read = async <T>(path: string): Promise<T> => {
    const response = await assets.fetch(new Request(`https://opax.com.au${path}`))
    if (!response.ok) throw new Error(`${path} ${response.status}`)
    return response.json() as Promise<T>
  }
  phrasesMemo ??= Promise.all([
    Promise.all(MONEY_GRAPHS.map(path => read<PhraseGraph>(path))),
    read<{ people: { name: string; full?: string }[] }>('/parliamentarians.json'),
    read<{ ministers?: Record<string, { name: string }> }>('/access.json').catch((): { ministers?: Record<string, { name: string }> } => ({ ministers: {} })),
  ]).then(([graphs, roster, access]) => withheldPhrases(graphs, [
    ...roster.people.flatMap(p => [p.name, p.full ?? '']), ...Object.values(access.ministers ?? {}).map(m => m.name),
  ].filter(Boolean))).catch(err => { phrasesMemo = null; throw err })
  return phrasesMemo
}

/** Whether a question (and the reader's earlier turns) names a withheld donor.
 * Unreadable money data fails closed only for text that could name a donor at all. */
export async function questionNamesWithheldDonor(assets: Fetcher | undefined, ...texts: unknown[]): Promise<boolean> {
  // No assets binding at all (a unit harness): there is no published money data to name anyone from.
  if (!assets) return false
  const phrases = await loadWithheldPhrases(assets).catch(() => null)
  if (!phrases) return texts.some(t => String(t ?? '').trim().length > 0)
  return namesWithheldPhrase(phrases, ...texts)
}

/** A synchronous withheld-name check over the per-isolate phrases, for renderers that
 * test many texts (declared-interest entries). Fails closed when the export is unreadable. */
export async function withheldNameCheck(assets: Fetcher | undefined): Promise<(...texts: unknown[]) => boolean> {
  if (!assets) return () => false
  const phrases = await loadWithheldPhrases(assets).catch(() => null)
  return phrases ? (...texts) => namesWithheldPhrase(phrases, ...texts) : () => true
}
