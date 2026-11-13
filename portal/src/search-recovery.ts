import { normalize } from './catalog-query.mjs'

export interface RecoveryName {
  kind: 'person' | 'bill' | 'electorate'
  label: string
  href: string
  aliases?: string[]
}
export interface SearchSuggestion {
  kind: 'did_you_mean' | 'scope' | 'ask'
  label: string
  href: string
  /** Published entries in the collection, not matches for the query. */
  count?: number
}

// Bounded edit distance with adjacent transpositions (for example Wnog/Wong).
function distance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i), older = previous
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + Number(a[i - 1] !== b[j - 1]))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], older[j - 2] + 1)
    }
    if (Math.min(...row) > limit) return limit + 1
    older = previous; previous = row
  }
  return previous[b.length]
}

export function didYouMean(query: string, names: RecoveryName[]): SearchSuggestion[] {
  const q = normalize(query)
  if (q.length < 3 || q.length > 120) return []
  const limit = q.length < 5 ? 1 : 2
  const candidates = new Map<string, { row: RecoveryName; score: number }>()
  for (const row of names) {
    // Only the roster and published bill/place lists enter the generated file.
    // Reject unrelated kinds and destinations even if that file is malformed.
    if (!row || !['person', 'bill', 'electorate'].includes(row.kind) || typeof row.label !== 'string' || typeof row.href !== 'string') continue
    if (!(row.kind === 'person' ? /^\/subject\/person\/[^/?#]+$/
      : row.kind === 'electorate' ? /^\/subject\/electorate\/[^/?#]+$/ : /^\/(?:bill\/|register\/state-bills\?bill=)/).test(row.href)) continue
    for (const name of [row.label, ...(Array.isArray(row.aliases) ? row.aliases : [])]) {
      const key = normalize(name)
      if (!key || key === q) continue
      const prefix = q.length >= 4 && key.startsWith(q) && key.length - q.length <= 16
      const score = prefix ? 0.5 : distance(q, key, limit)
      if (score > limit) continue
      const prior = candidates.get(row.href)
      if (!prior || score < prior.score) candidates.set(row.href, { row, score })
    }
  }
  return [...candidates.values()].sort((a, b) => a.score - b.score || a.row.label.localeCompare(b.row.label, 'en-AU'))
    .slice(0, 3).map(({ row }) => ({ kind: 'did_you_mean', label: row.label, href: row.href }))
}

export function browseSuggestions(counts: Record<string, number> = {}): SearchSuggestion[] {
  return [
    { label: 'People', href: '/subject/person', count: counts.person },
    { label: 'Bills', href: '/bills', count: counts.bill },
    { label: 'Speeches', href: '/ask?view=search&q=*&kind=speech' },
    { label: 'Money', href: '/money' },
  ].map(row => ({ kind: 'scope', ...row }))
}

let loaded: { version: string; names: Promise<RecoveryName[]> } | undefined
/** No document search, Ask, external request or per-scope retrieval. */
export async function emptySearchSuggestions(query: string, assets: Fetcher, catalog?: { version: string; counts: Record<string, number> }): Promise<SearchSuggestion[]> {
  let names: RecoveryName[] = [], counts = catalog?.counts
  try {
    const manifest = catalog || await (await assets.fetch(new Request('https://opax.com.au/search-catalog/manifest.json'))).json() as { version: string; counts: Record<string, number> }
    counts = manifest.counts
    if (/^[a-f0-9]{16}$/.test(manifest.version) && normalize(query).length <= 120) {
      if (loaded?.version !== manifest.version) {
        const pending = assets.fetch(new Request(`https://opax.com.au/search-catalog/${manifest.version}/recovery-names.json`))
          .then(async response => { if (!response.ok) throw Error('Names unavailable'); return await response.json() as RecoveryName[] })
        loaded = { version: manifest.version, names: pending }
        pending.catch(() => { if (loaded?.names === pending) loaded = undefined })
      }
      names = await loaded.names
    }
  } catch { /* Browsing and an Ask draft remain available if names cannot be read. */ }
  return [
    ...didYouMean(query, Array.isArray(names) ? names : []),
    ...browseSuggestions(counts),
    ...(query.trim() === '*' ? [] : [{ kind: 'ask' as const, label: `Ask OPAX: ${query}`, href: '/ask?' + new URLSearchParams({ q: query, draft: '1' }) }]),
  ]
}
