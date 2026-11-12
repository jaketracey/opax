/** The last pass over an Ask answer's source rows, after grounding: every row the reader sees opens a page about
 * that source, and no row repeats the answer or carries internal checking text.
 * - A coverage row opens the page listing the whole selection it describes (the receipts map, the division search),
 *   else the methods page; never one record it happened to share a URL with.
 * - A counted fact (a member's votes) is followed by one row per counted record, each opening its own page.
 * - Titles lose pasted bare URLs; snippets lose repeated lines and the "Donor: … Financial years: …" line the
 *   writer's checks add to a receipt (it restates the answer's figure in machine form).
 * Rows are only added or tidied: every field keeps its type, so the app's decoding is unchanged. */
import type { SourceLinks } from './agentic-ask'

type Row = Record<string, unknown> & { resource?: string; title?: string; url?: string; href?: string; snippet?: string; cited?: boolean }

const COVERAGE = /^(?:Coverage of the selected records|Source coverage and methods)$/
const isCoverage = (s: Row) => s.resource === 'coverage' || /^coverage-/.test(String(s.resource ?? '')) || COVERAGE.test(String(s.title ?? ''))
/** "… — AEC annual return · 2003-04 · https://transparency.aec.gov.au/" -> "… — AEC annual return · 2003-04". */
export function withoutBareUrls(text: string): string {
  return text.replace(/\s*(?:·|—|-)?\s*https?:\/\/[^\s)]+/g, '').replace(/\s*·\s*$/, '').replace(/[ \t]{2,}/g, ' ').trim()
}
/** The checking line writingFacts appends to a receipt fact (research-writing.ts). */
const RECEIPT_CHECK_LINE = /^Donor: .+ — \$[\d,.]+\. Financial years: .+\.$/
export function cleanSnippet(snippet: string): string {
  const seen = new Set<string>(), lines: string[] = []
  for (const raw of snippet.split('\n')) {
    const line = withoutBareUrls(raw)
    const key = line.replace(/\s+/g, ' ').toLowerCase()
    if (!line || RECEIPT_CHECK_LINE.test(line) || seen.has(key)) continue
    seen.add(key); lines.push(line)
  }
  return lines.join('\n')
}

export function linkAskSources<T extends Record<string, unknown>>(payload: T, links: SourceLinks | undefined, origin = 'https://opax.com.au'): T {
  if (!Array.isArray(payload.sources) || !payload.sources.length) return payload
  const rows = (payload.sources as Row[]).filter(s => s && typeof s === 'object')
  const recordUrls = new Set(rows.filter(s => !isCoverage(s)).map(s => s.url))
  const moved = new Map<string, string>()
  const out: Row[] = []
  const have = new Set(rows.map(s => s.url))
  for (const s of rows) {
    const row: Row = { ...s }
    if (typeof row.title === 'string') row.title = withoutBareUrls(row.title) || row.title
    if (typeof row.snippet === 'string') row.snippet = cleanSnippet(row.snippet)
    if (isCoverage(row)) {
      const target = links?.lists[0] ?? (recordUrls.has(row.url) || !row.url ? `${origin}/methods` : row.url)
      if (target !== row.url && typeof row.url === 'string') moved.set(row.url, target)
      row.url = target; row.href = target
    }
    out.push(row)
    const own = links?.related[String(s.url)] ?? links?.related[String(s.href)]
    own?.forEach((r, i) => {
      if (have.has(r.url)) return
      have.add(r.url)
      out.push({ resource: `${s.resource}-record-${i + 1}`, slug: '', title: r.label, href: r.url, url: r.url, snippet: '', cited: s.cited === true, kind: 'record' })
    })
  }
  const research = payload.research as { sources?: { title?: string; url?: string }[] } | undefined
  const researchSources = research?.sources?.map(r => COVERAGE.test(String(r.title ?? '')) && r.url && moved.has(r.url) ? { ...r, url: moved.get(r.url)! } : r)
  return { ...payload, sources: out, ...(research && researchSources ? { research: { ...research, sources: researchSources } } : {}) }
}
