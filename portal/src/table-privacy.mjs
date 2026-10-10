import {namesWithheldPhrase} from '../public/donor-entity.js'

const compiled = new WeakMap()
/** Select candidate phrases by their first word, then apply the shared privacy
 * policy unchanged. Large exports do not scan every donor for every record. */
export function tablePrivacyCheck(phrases) {
  const cached = compiled.get(phrases)
  if (cached) return cached
  const starts = new Map()
  for (const entry of phrases.withheld) {
    const first = entry[0].split(' ')[0]
    const entries = starts.get(first) || []
    entries.push(entry)
    starts.set(first, entries)
  }
  const check = (...texts) => {
    const candidates = new Set()
    for (const text of texts) {
      const words = String(text).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
      for (const word of new Set(words)) for (const entry of starts.get(word) || []) candidates.add(entry)
    }
    return candidates.size > 0 && namesWithheldPhrase({withheld: [...candidates]}, ...texts)
  }
  compiled.set(phrases, check)
  return check
}
