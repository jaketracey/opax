// One sentence-boundary rule for Ask's passage excerpts, answer sentences and transcript quotes.
// A full stop ends a sentence only when whitespace (or the end of the text) follows, then an uppercase letter, an
// opening quote, or the end; and only when the word before it is not an abbreviation or an initial.
// So "1.2 million", "$3.4bn", "s. 44", "section 7.1", "Mr. Smith", "e.g. the", "R.A. Simms" and "J. Smith" stay whole.
const ABBREVIATION = /(?:^|[^\p{L}])(?:mr|mrs|ms|dr|prof|hon|sen|st|e\.g|i\.e|etc|approx|cf|vs|viz|al|jr|sr)$/iu
// "No.", "s." and "cl." are always followed by a number, which the next-character rule already keeps.
// A capital initial, alone or in a dotted run ("J", "R.A", "U.S").
const INITIAL = /(?:^|[^\p{L}])\p{Lu}(?:\.\p{Lu})*$/u

/** True when the [.!?] at `i` ends a sentence. */
export function sentenceEndAt(text, i) {
  const c = text[i]
  if (c !== '.' && c !== '!' && c !== '?') return false
  // Closing quotes and brackets belong to the sentence they close.
  let j = i + 1
  while (j < text.length && /["”’')\]]/.test(text[j])) j++
  if (j < text.length && !/\s/.test(text[j])) return false
  while (j < text.length && /\s/.test(text[j])) j++
  if (j < text.length && !/[\p{Lu}"“‘']/u.test(text[j])) return false
  if (c !== '.') return true
  const before = text.slice(Math.max(0, i - 12), i)
  return !ABBREVIATION.test(before) && !INITIAL.test(before)
}

/** Sentences of a text with their offsets; whitespace between sentences is dropped. */
export function sentenceSpans(value) {
  const text = String(value ?? ''), out = []
  let start = 0
  const push = end => {
    const raw = text.slice(start, end), lead = raw.length - raw.trimStart().length, part = raw.trim()
    if (part) out.push({ text: part, at: start + lead })
    start = end
  }
  for (let i = 0; i < text.length; i++) {
    if (!sentenceEndAt(text, i)) continue
    let end = i + 1
    while (end < text.length && /["”’')\]]/.test(text[end])) end++
    push(end)
    i = end - 1
  }
  push(text.length)
  return out
}
