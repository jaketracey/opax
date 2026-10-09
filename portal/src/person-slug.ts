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
import { splitSpeakers, type SpeechScope } from '../public/speech-attribution.js'
import { personNameKey } from '../public/canonical-urls.js'

export function personSlug(name: string): string {
  return String(name ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’‘ʼ`.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** The roster lookup shared by redirects and the generated browser URL table. */
export function personIndex<T extends { name: string; speeches: number | null; full?: string; speech_scope?: SpeechScope }>(people: readonly T[]) {
  const byName = new Map(people.map(p => [p.name, p]))
  const byFold = new Map<string, T>()
  for (const p of people) {
    const key = personNameKey(p.name), previous = byFold.get(key)
    if (!previous || (p.speeches ?? 0) > (previous.speeches ?? 0)) byFold.set(key, p)
  }
  for (const p of people) for (const alias of splitSpeakers(p)) {
    const key = personNameKey(alias)
    if (!byFold.has(key)) byFold.set(key, p)
  }
  return { byName, byFold, ...slugIndex(people) }
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
