import {MONEY_GRAPHS,withheldPhrases,namesWithheldPhrase,isOrganisationDonor} from '../public/donor-entity.js'

type Graph = {nodes: {id: string; label: string; kind: string; aliases?: string[] | null}[]}
type Policy = {safe: (text: string) => boolean; subjects: (...texts: unknown[]) => string[]}
const indices = new WeakMap<Fetcher, Promise<Policy>>()
const phrase = (value: unknown) => String(value).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
async function tablePolicy(assets: Fetcher): Promise<Policy> {
  let pending = indices.get(assets)
  if (!pending) {
    pending = Promise.all(MONEY_GRAPHS.map(async path => {
      const response = await assets.fetch(new Request(`https://opax.com.au${path}`))
      if (!response.ok) throw new Error('Privacy index unavailable')
      return response.json() as Promise<Graph>
    })).then(graphs => {
      const phrases = withheldPhrases(graphs, [])
      const byFirst = new Map<string, typeof phrases.withheld>()
      const identities = new Map<string, Set<string>>()
      for (const entry of phrases.withheld) {
        const first = entry[0].split(' ')[0]
        byFirst.set(first, [...(byFirst.get(first) || []), entry])
      }
      for (const node of graphs.flatMap(graph => graph.nodes).filter(node => node.kind === 'donor' && !isOrganisationDonor(node))) {
        for (const value of [node.label, ...(node.aliases || [])]) {
          const names = [value]
          const inverted = /^([^,]+),\s*([^,]+)$/.exec(value)
          if (inverted) names.push(`${inverted[2]} ${inverted[1]}`)
          for (const name of names) {
            const key = phrase(name)
            if (!identities.has(key)) identities.set(key, new Set())
            identities.get(key)!.add(node.id)
          }
        }
      }
      const candidates = (text: string) => [...new Set(phrase(`donor receipts ${text}`).split(' '))].flatMap(word => byFirst.get(word) || [])
      const safe = (text: string) => !namesWithheldPhrase({withheld: candidates(text)}, `donor receipts ${text}`)
      const subjects = (...texts: unknown[]) => [...new Set(texts.flatMap(value => {
        const text = String(value)
        return candidates(text).flatMap(entry => namesWithheldPhrase({withheld: [entry]}, `donor receipts ${text}`) ? [...(identities.get(entry[0]) || [])] : [])
      }))]
      return {safe, subjects}
    }).catch(() => {indices.delete(assets); return {safe: () => false, subjects: () => []}})
    indices.set(assets, pending)
  }
  return pending
}

/** Shared graph index; no office-holder exemptions in money tables. */
export async function tablePrivacyCheck(assets: Fetcher): Promise<(text: string) => boolean> {
  return (await tablePolicy(assets)).safe
}

/** Server-only identity counting for neutral totals. No identities enter payloads. */
export async function tablePrivacyGuard(assets: Fetcher): Promise<((...texts: unknown[]) => boolean) & {subjects: (...texts: unknown[]) => string[]}> {
  const policy = await tablePolicy(assets)
  return Object.assign((...texts: unknown[]) => texts.some(text => !policy.safe(String(text))), {subjects: policy.subjects})
}

/** Read-only validation; the response never includes input or index contents. */
export async function tablePrivacy(request: Request, assets: Fetcher): Promise<Response> {
  const headers = {'cache-control':'no-store', 'x-robots-tag':'noindex', 'content-type':'application/json'}
  if (request.method !== 'POST') return Response.json({safe:false}, {status:405, headers})
  try {
    const input = await request.text()
    const value: unknown = JSON.parse(input).text
    if (typeof value !== 'string') return Response.json({safe:false}, {status:400, headers})
    const check = await tablePrivacyCheck(assets)
    return Response.json({safe:check(value)}, {headers})
  } catch { return Response.json({safe:false}, {status:503, headers}) }
}
