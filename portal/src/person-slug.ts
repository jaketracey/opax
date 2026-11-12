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
import { printSpeakers, splitSpeakers, type SpeechScope } from '../public/speech-attribution.js'
import { personNameKey } from '../public/party-page.js'

export function personSlug(name: string): string {
  return String(name ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’‘ʼ`.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** The roster lookup shared by redirects and the generated browser URL table. */
export function personIndex<T extends { name: string; speeches: number | null; full?: string; states?: string[]; speech_scope?: SpeechScope; prints?: string[] }>(people: readonly T[]) {
  const byName = new Map(people.map(p => [p.name, p]))
  const byFold = new Map<string, T>()
  for (const p of people) {
    const key = personNameKey(p.name), previous = byFold.get(key)
    if (!previous || (p.speeches ?? 0) > (previous.speeches ?? 0)) byFold.set(key, p)
  }
  // A folded surname print ("Shoebridge") reads as its person, so the old address forwards there.
  for (const p of people) for (const alias of [...splitSpeakers(p), ...printSpeakers(p)]) {
    const key = personNameKey(alias)
    if (!byFold.has(key)) byFold.set(key, p)
  }
  // byFold stays the speech identity (a speaker filter reads it); addresses also take the full names.
  const fullNames = fullNameAliases(people, byFold)
  const addresses = new Map([...byFold, ...fullNames])
  return { byName, byFold, fullNames, addresses, ...slugIndex(people) }
}

/**
 * A surname row's own full name ("Crisafulli", full "David Crisafulli") reads as that row, so a
 * register that names the member in full (a ministerial diary, the pay record) reaches the profile
 * (search-hubs-006, registers-003). Only where the full name is free: no row is printed under it
 * and no other row claims it. The alias adds no identity the roster does not already show, since
 * the profile is titled with that full name; but a surname row can hold several parliaments'
 * speeches (state-datasets-001), so callers that know the register's parliament check it against
 * the row's (fullNameMatches).
 */
export function fullNameAliases<T extends { name: string; full?: string; states?: string[] }>(people: readonly T[], taken: ReadonlyMap<string, T>): Map<string, T> {
  const claims = new Map<string, T[]>()
  for (const p of people) {
    if (!p.full || p.full === p.name) continue
    const key = personNameKey(p.full)
    if (!key || taken.has(key)) continue
    claims.set(key, [...(claims.get(key) || []), p])
  }
  return new Map([...claims].filter(([, rows]) => rows.length === 1).map(([key, rows]) => [key, rows[0]]))
}

/** True unless `name` reaches its row only through a full-name alias from another parliament. */
export function fullNameMatches<T extends { states?: string[] }>(index: { fullNames: ReadonlyMap<string, T> }, name: string, jurisdiction?: string | null): boolean {
  const row = index.fullNames.get(personNameKey(name))
  return !row || !jurisdiction || (row.states || []).includes(String(jurisdiction).toLowerCase())
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
