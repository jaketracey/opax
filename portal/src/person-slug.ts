/**
 * A person's address: /subject/person/tony-abbott, not /subject/person/Tony%20Abbott.
 *
 * The slug is a plain function of the name, so a link needs no lookup to be
 * written; reading one back does, because "matt-osullivan" cannot say where
 * its apostrophe went. The roster is that lookup. A name outside the roster
 * (under its five-speech floor, a witness, a spelling the record uses once)
 * keeps its name as its address, which is why the old form is still served.
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
 * Two spellings can fold to one slug ("A.J. Stoker", "Aj Stoker"). The fuller
 * entry takes it, as byFold already decides for twin spellings; the other
 * keeps its name as its address rather than landing on the wrong person.
 */
export function slugIndex<T extends { name: string; speeches: number }>(people: readonly T[]): SlugIndex<T> {
  const bySlug = new Map<string, T>()
  for (const p of people) {
    const slug = personSlug(p.name)
    if (!slug) continue
    const holder = bySlug.get(slug)
    if (!holder || p.speeches > holder.speeches) bySlug.set(slug, p)
  }
  const slugOf = new Map<string, string>()
  for (const [slug, p] of bySlug) slugOf.set(p.name, slug)
  return { bySlug, slugOf }
}
