/** Routing identities from shipped title metadata, never model-generated summaries. */
export const STATUTE_TITLES_ASSET = '/ask-statute-titles.json'
const words = text => [...String(text).matchAll(/[\p{L}\p{N}]+/gu)].map(m => ({
  text: m[0], key: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length,
}))
export const normaliseStatuteTitle = title => words(title).filter(w => !/^\d{4}$/.test(w.key)).map(w => w.key).join(' ')
const jurisdictionNouns = new Set('election elections senator senators mla mlas government budget minister ministers electorate electorates division divisions parliament labor liberal greens results'.split(' '))
const positiveAct = (tokens, i, text) => {
  const current = tokens[i], before = tokens[i - 1], after = tokens[i + 1]
  const adjacent = (a, b) => !!a && !!b && /^\s+$/.test(text.slice(a.end, b.start))
  return current.text === 'ACT' && (
    adjacent(before, current) && (before.key === 'the' || ['for', 'in', 'from'].includes(before.key)) ||
    adjacent(current, after) && (jurisdictionNouns.has(after.key) ||
      after.key === 'legislative' && tokens[i + 2]?.key === 'assembly' && adjacent(after, tokens[i + 2]))
  )
}

export function territoryAfterStatutes(question, titles = null) {
  const tokens = words(question), spans = []
  if (titles !== null) {
    const dated = tokens.filter(w => !/^\d{4}$/.test(w.key))
    for (let i = 0; i < dated.length; i++) if (dated[i].key === 'act') {
      // Longest exact title first: the preceding 1–8 words plus Act.
      for (let n = Math.min(8, i); n >= 1; n--) {
        if (titles.has(dated.slice(i - n, i + 1).map(w => w.key).join(' '))) {
          spans.push([dated[i - n].start, dated[i].end])
          break
        }
      }
    }
  } else {
    // Only unavailable title data enables the old capitalized-title heuristic.
    // Positive territory syntax protects List ACT senators/elections here too.
    for (const m of question.matchAll(/\baustralian capital territory(?:\s+\([^)]*\))?\s+act\b(?:\s+\d{4})?/gi)) spans.push([m.index, m.index + m[0].length])
    for (const m of question.matchAll(/\b(?:\p{Lu}[\p{L}\p{N}'’()-]*\s+)+[Aa][Cc][Tt]\b/gu)) {
      const end = m.index + m[0].length, index = tokens.findIndex(w => w.end === end)
      if (index >= 0 && !positiveAct(tokens, index, question)) spans.push([m.index, end])
    }
    for (const m of question.matchAll(/\bact\s+\d{4}\b/gi)) {
      const index = tokens.findIndex(w => w.start === m.index)
      if (index >= 0 && !positiveAct(tokens, index, question)) spans.push([m.index, m.index + m[0].length])
    }
  }
  // Match offsets are UTF-16 offsets. Spaces preserve unrelated word boundaries.
  const clean = question.split('')
  for (const [start, end] of spans) for (let i = start; i < end; i++) clean[i] = ' '
  const text = clean.join(''), remaining = words(text)
  return /\baustralian capital territory\b/i.test(text) || /\bA\.C\.T\.(?=\W|$)/i.test(text) ||
    remaining.some((w, i) => w.key === 'act' && positiveAct(remaining, i, text))
}

export async function loadStatuteTitles(asset, signal, timeoutMs = 500) {
  let timer, abort
  const failed = new Promise(resolve => {
    timer = setTimeout(() => resolve(null), timeoutMs)
    abort = () => resolve(null)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })
  const data = Promise.resolve().then(() => asset(STATUTE_TITLES_ASSET)).then(value => {
    if (value?.schema !== 1 || !Array.isArray(value.titles) || !value.titles.length ||
      value.titles.some(t => typeof t !== 'string' || !t.endsWith(' act') || normaliseStatuteTitle(t) !== t)) return null
    return new Set(value.titles)
  }).catch(() => null)
  try { return await Promise.race([data, failed]) }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
}
