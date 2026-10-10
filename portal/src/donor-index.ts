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

/** The one reply to a question naming a withheld donor: fixed text, no model call. */
export const WITHHELD_DONOR_REPLY = "OPAX doesn't name individual donors. Party-level totals are on the party's page."

type PhraseGraph = { nodes: { label: string; kind: string; aliases?: string[] | null; industry?: string | null }[] }
/** Withheld phrases, each with the longer organisation names that contain it. */
interface WithheldPhrases { withheld: [string, string[]][] }
const phraseOf = (s: unknown) => String(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Normalised phrases for the query check: every withheld donor's label and aliases
 * ("Surname, Given" also as "Given Surname"). An occurrence inside a longer
 * organisation donor's name or alias ("<name> Holdings Pty Ltd") is that
 * organisation's, and does not count. A parliamentarian's or minister's name is
 * never treated as a withheld donor's: office holders who gave to their party are
 * named as office holders. */
export function withheldPhrases(graphs: PhraseGraph[], officeHolders: string[]): WithheldPhrases {
  const index = donorPrivacyIndex(graphs)
  const donors = graphs.flatMap(g => g.nodes.filter(n => n.kind === 'donor'))
  const names = (n: PhraseGraph['nodes'][number]) => [n.label, ...(Array.isArray(n.aliases) ? n.aliases : [])].filter((s): s is string => typeof s === 'string')
  const organisations = new Set(donors.filter(n => index.organisations.has(foldDonorName(n.label))).flatMap(names).map(phraseOf).filter(p => p.length > 1))
  const exempt = new Set([...officeHolders.map(phraseOf), ...organisations])
  const withheld = new Set<string>()
  for (const n of donors) if (index.withheld.has(foldDonorName(n.label))) for (const name of names(n)) {
    const inverted = /^([^,]+),\s*([^,]+)$/.exec(name)
    for (const p of [name, ...(inverted ? [`${inverted[2]} ${inverted[1]}`] : [])].map(phraseOf)) if (p.length > 1 && !exempt.has(p)) withheld.add(p)
  }
  const orgs = [...organisations]
  return { withheld: [...withheld].map(p => [p, orgs.filter(o => o.length > p.length && ` ${o} `.includes(` ${p} `))]) }
}

/** Whether any of these texts names a withheld donor (pure; see withheldPhrases). */
export function namesWithheldPhrase(phrases: WithheldPhrases, ...texts: unknown[]): boolean {
  for (const text of texts) {
    const q = ` ${phraseOf(text)} `
    if (q.length < 4) continue
    for (const [p, longer] of phrases.withheld) {
      const needle = ` ${p} `
      for (let at = q.indexOf(needle); at >= 0; at = q.indexOf(needle, at + 1)) {
        // Excused only when a longer organisation name covers this very occurrence.
        const covered = longer.some(o => { const span = ` ${o} `; for (let from = q.indexOf(span); from >= 0; from = q.indexOf(span, from + 1)) if (from <= at && from + span.length >= at + needle.length) return true; return false })
        if (!covered) return true
      }
    }
  }
  return false
}

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
  if (!phrases) return texts.some(t => phraseOf(t).length > 0)
  return namesWithheldPhrase(phrases, ...texts)
}
