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

export function* statuteTitleSegments(text) {
  let start = 0
  const brackets = []
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '(' || char === '[') { brackets.push(char); continue }
    if (char === ')' || char === ']') {
      if (brackets.at(-1) === (char === ')' ? '(' : '[')) brackets.pop()
      continue
    }
    if (brackets.length) continue
    const boundary = '.?!;:,\r\n—–'.includes(char) || char === '-' && /\s/.test(text[i - 1] ?? '') && /\s/.test(text[i + 1] ?? '')
    if (!boundary) continue
    // A title's abbreviated Act. and its year belong to the same segment.
    if (char === '.' && /\bact$/i.test(text.slice(start, i)) && /^[ \t]*\d{4}\b/.test(text.slice(i + 1))) continue
    yield { text: text.slice(start, i), start }
    start = i + 1
  }
  yield { text: text.slice(start), start }
}

export function scopeAfterStatutes(question, titles = null) {
  const spans = []
  // The catalogue, rather than a fixed word limit, bounds exact title matches.
  const maxTitleWords = titles?.size ? Math.max(...Array.from(titles, title => title.split(' ').length)) : 0
  for (const { text, start } of statuteTitleSegments(question)) {
    const tokens = words(text), exclude = (from, to) => spans.push([start + from, start + to])
    if (titles !== null) {
      const dated = tokens.filter(w => !/^\d{4}$/.test(w.key))
      for (let i = 0; i < dated.length; i++) if (dated[i].key === 'act') {
        // Longest exact title first, entirely within this segment.
        for (let n = Math.min(maxTitleWords - 1, i); n >= 1; n--) {
          if (titles.has(dated.slice(i - n, i + 1).map(w => w.key).join(' '))) {
            exclude(dated[i - n].start, dated[i].end)
            break
          }
        }
      }
    }
    // Explicit statute syntax still counts when the catalogue lacks the title.
    for (const m of text.matchAll(/\baustralian capital territory(?:\s+\([^)]*\))?\s+act\b/gi)) exclude(m.index, m.index + m[0].length)
    for (const m of text.matchAll(/\b(?:\p{Lu}[\p{L}\p{N}'’()-]*\s+)+(?:\([^)]*\)\s+)?[Aa][Cc][Tt]\b/gu)) {
      const end = m.index + m[0].length, index = tokens.findIndex(w => w.end === end)
      const dated = /^\.?\s*\d{4}\b/.test(text.slice(end)), parenthesized = /\([^)]*\)/.test(m[0])
      // Undated capitalized phrases are a heuristic only when title data is unavailable.
      if ((titles === null || dated || parenthesized) && index >= 0 && (parenthesized || !positiveAct(tokens, index, text))) exclude(m.index, end)
    }
    for (const m of text.matchAll(/\bact\.?\s+\d{4}\b/gi)) {
      const index = tokens.findIndex(w => w.start === m.index)
      if (index >= 0 && !positiveAct(tokens, index, text)) exclude(m.index, m.index + m[0].length)
    }
  }
  // Match offsets are UTF-16 offsets. Spaces preserve unrelated word boundaries.
  const clean = question.split('')
  for (const [start, end] of spans) for (let i = start; i < end; i++) clean[i] = ' '
  const text = clean.join(''), remaining = words(text)
  const territory = /\baustralian capital territory\b/i.test(text) || /\bA\.C\.T\.(?=\W|$)/i.test(text) ||
    remaining.some((w, i) => w.key === 'act' && positiveAct(remaining, i, text))
  return { text, territory }
}

export function territoryAfterStatutes(question, titles = null) {
  return scopeAfterStatutes(question, titles).territory
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
