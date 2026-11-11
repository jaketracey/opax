/** Detect lost punctuation in a searched compound name without rewriting the source or inventing a quote. */
export function joinedSourceName(text: string, query: string): boolean {
  const compounds = [...query.matchAll(/(\p{L}{3,})[-–‑](\p{L}{3,})/gu)]
  const words = query.match(/\p{L}+/gu) ?? []
  const lower = text.toLocaleLowerCase('en-AU')
  const joined = (a: string, b: string) => lower.includes((a + b).toLocaleLowerCase('en-AU'))
  const names = words.filter(word => /^\p{Lu}\p{L}{2,}$/u.test(word))
  return compounds.some(([, a, b]) => joined(a,b)) || words.some((a,i) => /^\p{Lu}\p{L}{2,}$/u.test(a) && /^\p{Lu}\p{L}{2,}$/u.test(words[i+1] ?? '') && joined(a,words[i+1])) ||
    names.some(name => new RegExp(`\\b(?:(?:the|and|for|of|to|in|on|with)${name}|${name}(?:the|and|was|were|has|have|is|are))\\b`, 'iu').test(text))
}
