/**
 * Scan suffixes once rather than retrying an unanchored end-of-string regex. Compares UTF-16
 * code units, so a long run costs no per-character string or search.
 */
export function trimQuestionEnd(text, marks = '?!.') {
  let end = text.length
  while (end && trailingMark(marks, text.charCodeAt(end - 1))) end--
  return text.slice(0, end)
}

function trailingMark(marks, code) {
  for (let i = 0; i < marks.length; i++) if (marks.charCodeAt(i) === code) return true
  return false
}

/**
 * Shorten a trailing run of marks to its first and last mark. Parsers that trim with
 * trimQuestionEnd get the same result, and a check on the final mark still sees it, but a
 * 100,000-mark tail is scanned once here instead of copied by every normalise or regex pass.
 */
export function shortTrailingMarks(text, marks = '?!.') {
  const end = trimQuestionEnd(text, marks).length
  return text.length - end > 2 ? text.slice(0, end + 1) + text[text.length - 1] : text
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
