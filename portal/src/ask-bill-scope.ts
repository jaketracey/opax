/**
 * Ask limited to one bill (`bill` on the /api/ask body, the key in /bill/<key>).
 *
 * The bill's records are, by how the knowledge box and the bill file tie them:
 *  - its text, every version: resources labelled `bill_key/<key>` (scripts/publish_bill_texts.py);
 *  - the bill record itself, slug `bill-<key>`: status, dates, sponsor and the summary written
 *    from the explanatory memorandum (scripts/publish_bills.py);
 *  - the speeches and divisions the bill file lists (`/bills/<key>.json`), by resource slug.
 * The filter is the union of those, joined to whatever else the request filters on, so retrieval
 * cannot return a record from outside the bill. Explanatory memoranda and Bills Digests are not
 * resources of their own; the memorandum reaches Ask only through the bill record's summary.
 */
export interface BillScopeFile {
  title?: string
  short_title?: string
  speeches?: { slug?: string }[]
  divisions?: { key?: string }[]
}
export interface BillScope { key: string; title: string; slugs: string[] }

const KEY = /^[a-z][a-z0-9-]{1,119}$/
const SLUG = /^[a-z][a-z0-9-]{1,199}$/

/** The request's bill key, or null: anything else is not a scope and the ask runs as usual. */
export const askBillKey = (value: unknown): string | null =>
  typeof value === 'string' && KEY.test(value.trim()) ? value.trim() : null

/** `file` is the bill's own file when it could be read; without it the text and the bill record still scope. */
export function billScope(key: string, file?: BillScopeFile | null): BillScope {
  const slugs = [
    `bill-${key}`,
    ...(file?.speeches ?? []).map(s => s?.slug ?? ''),
    ...(file?.divisions ?? []).map(d => d?.key ? `division-${d.key}` : ''),
  ].filter(slug => SLUG.test(slug))
  return { key, title: String(file?.short_title || file?.title || '').trim().slice(0, 300), slugs: [...new Set(slugs)] }
}

export const billScopeClause = (scope: BillScope): Record<string, unknown> => ({ or: [
  { prop: 'label', labelset: 'bill_key', label: scope.key },
  ...scope.slugs.map(slug => ({ prop: 'resource', slug })),
] })

/** The platform /ask body, searched inside the bill only. Pinned prior-record passes are dropped: they search by id, outside any filter. */
export function billScopedBody(body: Record<string, unknown>, scope: BillScope): Record<string, unknown> {
  const existing = (body.filter_expression as { field?: unknown } | undefined)?.field
  const prompt = body.prompt as { system?: string; user?: string } | undefined
  const about = `Every passage belongs to one bill${scope.title ? `, the ${scope.title}` : ''}: its text, its record and summary, and the speeches and divisions on it. “This bill” and “the bill” in the question mean that bill. `
  return {
    ...body,
    filter_expression: { field: { and: [...(existing ? [existing] : []), billScopeClause(scope)] } },
    ...(Array.isArray(body.rag_strategies) ? { rag_strategies: (body.rag_strategies as { name?: string }[]).filter(s => s?.name !== 'prequeries') } : {}),
    ...(prompt ? { prompt: { ...prompt, user: about + (prompt.user ?? '') } } : {}),
  }
}

/** True when a returned source is one of the bill's records (tests and callers that check a payload). */
export function inBillScope(source: { slug?: string | null; href?: string | null }, scope: BillScope): boolean {
  const slug = String(source.slug ?? '')
  return scope.slugs.includes(slug) || slug.startsWith(`bill-text-${scope.key}-`) || String(source.href ?? '').split(/[?#]/)[0] === `/bill/${scope.key}`
}
