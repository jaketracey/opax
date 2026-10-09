/**
 * A person's address: /subject/person/tony-abbott, not /subject/person/Tony%20Abbott.
 *
 * The slug is a plain function of the name. Distinct roster rows whose names
 * fold to the same slug receive a deterministic suffix; reading it back uses
 * the roster lookup. All emitted addresses are slugs.
 *
 * public/app.js carries a copy of personSlug(); test/person-slug.test.mjs
 * holds the two to the same answers.
 */
export function personSlug(name: string): string {
  return String(name ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’‘ʼ`.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export interface SlugIndex<T> { bySlug: Map<string, T>; slugOf: Map<string, string> }

/**
 * The fuller row holds the base slug. Other rows retain their own identity
 * under a stable name-derived suffix, without an ambiguous name URL.
 */
export function slugIndex<T extends { name: string; speeches: number | null }>(people: readonly T[]): SlugIndex<T> {
  const bySlug = new Map<string, T>()
  for (const p of people) {
    const slug = personSlug(p.name)
    if (!slug) continue
    const holder = bySlug.get(slug)
    if (!holder || (p.speeches ?? 0) > (holder.speeches ?? 0)) bySlug.set(slug, p)
  }
  const slugOf = new Map<string, string>()
  for (const [slug, p] of bySlug) slugOf.set(p.name, slug)
  for(const p of people) {
    const base=personSlug(p.name)
    if(!base || slugOf.has(p.name)) continue
    // Distinct exported rows keep distinct addresses. No ambiguous name URL.
    const suffix=Array.from(p.name).map(c=>c.codePointAt(0)!.toString(16)).join('')
    const slug=`${base}-${suffix}`
    bySlug.set(slug,p)
    slugOf.set(p.name,slug)
  }
  return { bySlug, slugOf }
}
