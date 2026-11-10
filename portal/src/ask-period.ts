/** Date interpretation shared by Ask and public record calculators, without orchestration dependencies. */
/** Parliamentary terms the planner may name. 48th: open-ended. */
export const TERMS: Record<string, [string, string | null]> = {
  '46th': ['2019-07-02', '2022-04-11'],
  '47th': ['2022-07-26', '2025-03-28'],
  '48th': ['2025-07-22', null],
}

export interface Period { kind: 'current' | 'all' | 'window'; since?: string; until?: string; label: string }
/** Consume specific dates before bare years, so their years cannot widen the window. */
function periodTokens(text: string): { start: string; end: string; index: number }[] {
  const tokens: { start: string; end: string; index: number }[] = []
  const rejected: [number, number][] = []
  let remaining = text
  const scan = (pattern: RegExp, bounds: (m: RegExpMatchArray) => [string, string] | null, bareYears = false) => {
    remaining = remaining.replace(pattern, (...args) => {
      const index = args.at(-2) as number, m = args.slice(0, -2) as RegExpMatchArray
      if (!bareYears && rejected.some(([start, end]) => index < end && index + m[0].length > start)) return m[0]
      const value = bounds(m)
      // Rejected new syntax retains the existing year fallback; never erase it into all-time.
      if (!value) { rejected.push([index, index + m[0].length]); return m[0] }
      tokens.push({ start: value[0], end: value[1], index })
      return ' '.repeat(m[0].length)
    })
  }
  const date = (year: number, month: number, day: number): string | null => {
    const value = new Date(Date.UTC(year, month - 1, day))
    return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day ? value.toISOString().slice(0, 10) : null
  }
  // Preserve the existing ISO-date path; tool validation owns invalid ISO dates.
  scan(/\b((?:19|20)\d{2})-(\d{2})-(\d{2})\b/g, m => [m[0], m[0]])
  const financialYear = (year: number): [string, string] => [`${year}-07-01`, `${year + 1}-06-30`]
  scan(/\b(?:fy|financial[ -]years?)\s*(?:ending|ended)\s+((?:19|20)\d{2})\b/g, m => financialYear(Number(m[1]) - 1))
  scan(/\b(?:fy|financial[ -]years?)\s*((?:19|20)\d{2})(?:\s*[/–—‑-]\s*((?:19|20)\d{2}|\d{2}))?\b(?!\s*(?:\/\s*\d|[–—‑-]\s*\d{1,2}\b))/g, m => {
    const year = Number(m[1])
    return !m[2] || Number(m[2]) === (m[2].length === 2 ? (year + 1) % 100 : year + 1) ? financialYear(year) : null
  })
  // A short ending or slash denotes an FY; a full dashed pair remains a calendar-year range.
  scan(/\b((?:19|20)\d{2})\s*(?:[/–—‑-]\s*(\d{2})|\/\s*((?:19|20)\d{2}))\b(?!\s*(?:\/\s*\d|[–—‑-]\s*\d{1,2}\b))/g, m => {
    const year = Number(m[1]), end = m[2] || m[3]
    return Number(end) === (end.length === 2 ? (year + 1) % 100 : year + 1) ? financialYear(year) : null
  })
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  const month = '(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)'
  const dayBounds = (year: string, name: string, day: string): [string, string] | null => {
    const value = date(Number(year), months.indexOf(name.slice(0, 3)) + 1, Number(day))
    return value ? [value, value] : null
  }
  scan(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${month})\\.?\\s+((?:19|20)\\d{2})\\b`, 'g'), m => dayBounds(m[3], m[2], m[1]))
  scan(new RegExp(`\\b(${month})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+((?:19|20)\\d{2})\\b`, 'g'), m => dayBounds(m[3], m[1], m[2]))
  scan(new RegExp(`\\b(${month})\\.?\\s+((?:19|20)\\d{2})\\b`, 'g'), m => {
    const year = Number(m[2]), month = months.indexOf(m[1].slice(0, 3)) + 1
    return [date(year, month, 1)!, new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)]
  })
  scan(/\b((?:19|20)\d{2})(s)?\b/g, m => [`${m[1]}-01-01`, `${Number(m[1]) + (m[2] === 's' ? 9 : 0)}-12-31`], true)
  return tokens
}
export function inferPeriod(question: string, override?: unknown): Period {
  const q = question.toLowerCase()
  if (override === 'all' || /\b(?:whole record|all[ -]time|across the record)\b/.test(q)) return { kind: 'all', label: 'Counting speeches across the whole record.' }
  if (/\bthis term\b/.test(q) && /\blast term\b/.test(q)) return { kind: 'window', since: TERMS['47th'][0], label: 'Counting speeches in the current and previous parliaments, since July 2022.' }
  if (override === 'current' || /\b(?:this|current) (?:term|parliament)\b/.test(q)) return { kind: 'current', since: TERMS['48th'][0], label: 'Counting speeches in the current parliament since July 2025.' }
  if (/\blast (?:term|parliament)\b/.test(q)) return { kind: 'window', since: TERMS['47th'][0], until: TERMS['47th'][1]!, label: 'Counting speeches in the previous parliament, July 2022 to March 2025.' }
  // A bill/statute title's year is not a date filter on its debate history.
  const dated = q.replace(/\([^()]*\)(?=\s+(?:bill|act)\b)/g, '').replace(/\b(?:bill|act)(?:\s+\(no\.\s*\d+\))?\s+(?:19|20)\d{2}(?:[-–]\d{2,4})?(?:\s*\[(?:19|20)\d{2}\])?/g, '')
  const tokens = periodTokens(dated)
  if (tokens.length) {
    const shift = (date: string, days: number) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10)
    const bounds = tokens.map(({ start, end, index }) => {
      const operator = dated.slice(0, index).match(/\b(since|from|after|before|until|through|to)\s+(?:the\s+)?$/)?.[1]
      return { start: operator === 'after' ? shift(end, 1) : start, end: operator === 'before' ? shift(start, -1) : end, operator }
    })
    const starts = bounds.filter(b => !['before', 'until', 'through', 'to'].includes(b.operator ?? ''))
    const ends = bounds.filter(b => !['after', 'since', 'from'].includes(b.operator ?? ''))
    const since = starts.map(b => b.start).sort().at(0), until = ends.map(b => b.end).sort().at(-1)
    return { kind: 'window', ...(since ? { since } : {}), ...(until ? { until } : {}), label: `Records from ${since ?? 'the start of the record'} to ${until ?? 'the present'}.` }
  }
  if (/\b(?:is|are)\s+(?:\S+\s+){0,4}(?:making|speaking|debating|discussing|talking)\b|\b(?:speaks|says|mentions|debates|discusses)\b|\b(?:is|are)\s+(?:\S+\s+){0,3}(?:debated|discussed)\b/.test(q)) return { kind: 'current', since: TERMS['48th'][0], label: 'Counting speeches in the current parliament since July 2025.' }
  return { kind: 'all', label: 'Counting speeches across the whole record.' }
}
