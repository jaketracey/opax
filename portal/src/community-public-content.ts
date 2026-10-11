import {sanitiseStoredDonors} from './donor-hashes.mjs'

/** Public discussion/list prose is separate from member identity and private chats. */
export function publicCommunityContent<T>(value: T): T {
  const prose = new Set(['title','body','description','note','path','source_path'])
  const visit = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(visit)
    if (!x || typeof x !== 'object') return x
    return Object.fromEntries(Object.entries(x).map(([key, field]) =>
      [key, prose.has(key) && typeof field === 'string' ? sanitiseStoredDonors(field) : visit(field)]))
  }
  return visit(value) as T
}
