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
 *
 * Speeches and divisions carry no bill label (parli/ingest/arag_sync.py, votes_state.py), so they
 * are reached by slug, and the platform rejects a whole request when one slug is not in the box.
 * The body therefore carries, under BILL_LABEL_ONLY, the filter to ask again with: the bill label
 * alone, which cannot be rejected and is still inside the bill (its text). Never the unscoped ask.
 * That answer has lost the bill record and every speech and division, so it is logged (key and
 * upstream status only) and not kept in the answer cache.
 *
 * A division with more than 100 named voters is published in parts for the platform's 100-name
 * limit (votes_ingest.py division_documents): part 1 is in scope by its slug and names the ayes;
 * the noes are in `division-<key>-p2`, which the bill file does not record and which could not be
 * named safely if it did. When retrieval returns such a division the other parts are rebuilt from
 * the Worker's own full-member file for that division (`/divisions/<slug>.json`) and given to the
 * model as records, so an answer about how a member voted has every vote (`divisionParts`).
 *
 * Not reached: speeches past the 24 a bill file lists.
 */
export interface BillScopeFile {
  title?: string
  short_title?: string
  speeches?: { slug?: string }[]
  divisions?: { key?: string }[]
}
export interface BillScope { key: string; title: string; slugs: string[] }

/** Symbol-keyed, so it is copied with the body on every retry and never serialised to the platform. */
export const BILL_LABEL_ONLY = Symbol.for('opax.ask.bill-label-only')
/** One object shared by a body and its retry copies; `fired` once the platform rejected the full filter. */
export interface BillLabelOnly { key: string; filter: Record<string, unknown>; fired?: boolean }

// au-federal-r7531, au-federal-alrc-1270, au-nsw-18524, au-federal-ed-<slug>-<year> (docs/BILLS-CONTRACT.md).
// Nothing else is read as a bill file: not `index`, the 1.9 MB list of every bill.
const KEY = /^au-[a-z]+-[a-z0-9][a-z0-9-]{0,110}$/
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
  const within = (clause: Record<string, unknown>) => ({ field: { and: [...(existing ? [existing] : []), clause] } })
  return {
    ...body,
    filter_expression: within(billScopeClause(scope)),
    [BILL_LABEL_ONLY]: { key: scope.key, filter: within({ prop: 'label', labelset: 'bill_key', label: scope.key }) } satisfies BillLabelOnly,
    ...(Array.isArray(body.rag_strategies) ? { rag_strategies: (body.rag_strategies as { name?: string }[]).filter(s => s?.name !== 'prequeries') } : {}),
    ...(prompt ? { prompt: { ...prompt, user: about + (prompt.user ?? '') } } : {}),
  }
}

/** True when a returned source is one of the bill's records (tests and callers that check a payload). */
export function inBillScope(source: { slug?: string | null; href?: string | null }, scope: BillScope): boolean {
  const slug = String(source.slug ?? '')
  const part = /^(division-.+)-p\d+$/.exec(slug)
  return scope.slugs.includes(slug) || !!part && scope.slugs.includes(part[1]) || slug.startsWith(`bill-text-${scope.key}-`) || String(source.href ?? '').split(/[?#]/)[0] === `/bill/${scope.key}`
}

/** A division's full-member file (/divisions/<slug>.json), as scripts export it and /api/resource reads it. */
export interface DivisionFile {
  key?: string; name?: string; question?: string; date?: string; house?: string; jurisdiction?: string
  ayes?: number; noes?: number; source_url?: string
  members?: { name?: string; vote?: string }[]
}
export interface DivisionPart {
  kind: 'division'; title: string; href: string; snippet: string; slug: string; resource: string
  state?: string; chamber?: string; date?: string; source: string; url?: string; record_id: string
}

// votes_ingest.py: MAX_COLLABORATORS and _chunk_side. A record's text reaches the model cut at 1,800
// characters (ask-records.ts recordContext), so a part's names are also kept under that.
const PART_NAMES = 100
const PART_CHARS = 1700
const chunkSide = (names: string[]): string[][] => {
  if (!names.length) return []
  const sorted = [...names].sort()
  const size = Math.ceil(sorted.length / Math.ceil(sorted.length / PART_NAMES))
  const groups: string[][] = []
  for (let i = 0; i < sorted.length; i += size) groups.push(sorted.slice(i, i + size))
  return groups.flatMap(fitPart)
}
/** Halved until the names fit the record text the model reads. */
function fitPart(group: string[]): string[][] {
  if (group.join(', ').length <= PART_CHARS - 400 || group.length < 2) return [group]
  const half = Math.ceil(group.length / 2)
  return [...fitPart(group.slice(0, half)), ...fitPart(group.slice(half))]
}

/**
 * The parts of a split division after the first, as the ingest splits them: the ayes (with pairs)
 * then the noes, each side in alphabetical groups. Empty for a division that is one record (100
 * named voters or fewer), whose single resource already names everyone.
 */
export function divisionParts(slug: string, file: DivisionFile | null | undefined): DivisionPart[] {
  const named = (file?.members ?? []).filter(m => typeof m?.name === 'string' && m.name.trim())
  if (new Set(named.map(m => m.name)).size <= PART_NAMES) return []
  const side = (...votes: string[]) => named.filter(m => votes.includes(String(m.vote))).map(m => m.name!.trim())
  const groups = [
    ...chunkSide(side('aye', 'paired')).map(names => ({ label: 'Ayes', total: file?.ayes, names })),
    ...chunkSide(side('no')).map(names => ({ label: 'Noes', total: file?.noes, names })),
  ]
  const title = String(file?.name || file?.question || 'Division').replace(/\s+/g, ' ').trim().slice(0, 180)
  return groups.slice(1).map((group, i) => {
    const part = i + 2
    return {
      kind: 'division' as const, slug: `${slug}-p${part}`, resource: '', href: `/doc/${slug}`,
      title: `${title} (part ${part} of ${groups.length})`,
      snippet: `Division${file?.date ? ` on ${file.date}` : ''}${file?.house ? `, ${file.house}` : ''}: ${title}. Part ${part} of ${groups.length} of this division's record; the other parts list the other voters. ` +
        `${group.label}${typeof group.total === 'number' ? ` ${group.total}` : ''}, ${group.names.length} named in this part: ${group.names.join(', ')}.`,
      ...(file?.jurisdiction ? { state: file.jurisdiction } : {}), ...(file?.house ? { chamber: file.house } : {}), ...(file?.date ? { date: file.date } : {}),
      source: 'Division record', ...(file?.source_url ? { url: file.source_url } : {}), record_id: `${slug}-p${part}`,
    }
  })
}
/** The scope's own division slugs among those a retrieval returned: the only divisions whose parts are added. */
export const returnedBillDivisions = (scope: BillScope, slugs: (string | null | undefined)[]): string[] =>
  [...new Set(slugs.filter((slug): slug is string => typeof slug === 'string' && slug.startsWith('division-') && scope.slugs.includes(slug)))]
