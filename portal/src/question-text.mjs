/** Scan suffixes once rather than retrying an unanchored end-of-string regex. */
export function trimQuestionEnd(text, marks = '?!.') {
  let end = text.length
  while (end && marks.includes(text[end - 1])) end--
  return text.slice(0, end)
}

export const questionSpaces = text => text.replace(/\s+/g, ' ').trim()

/** Keep the old same-line ordering without a repeated wildcard search. */
export function wordsInOrder(text, first, second) {
  return text.toLowerCase().split(/[\r\n\u2028\u2029]/).some(line => {
    const start = line.indexOf(first)
    return start !== -1 && line.indexOf(second, start + first.length) !== -1
  })
}

export function comparisonParts(question) {
  const text = trimQuestionEnd(question)
  if (!/^how do /i.test(text) || /[\r\n\u2028\u2029]/.test(text)) return null
  const join = / and /i.exec(text.slice(8))
  if (!join) return null
  const and = join.index + 8, relation = / differ on /i.exec(text.slice(and + 6))
  if (!relation) return null
  const differ = relation.index + and + 6
  if (differ + 11 >= text.length) return null
  return [text, text.slice(7, and), text.slice(and + 5, differ), text.slice(differ + 11)]
}
