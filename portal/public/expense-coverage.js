/**
 * How much of a year IPEA has published, from the reporting quarters actually held (expenses.json
 * meta.reporting_periods, or an itemised file's quarters), never from today's date.
 *
 *   yearCoverage(['2026Q01', '2026Q02'], 2026).text        -> 'January to June 2026 (two quarters published)'
 *   yearCoverage(periods, '2025-26', { financial: true })  -> the July to June quarters
 *
 * A year with all four quarters says nothing extra: text is ''. Shared by the Worker's expenses tool and
 * the person page, so every figure for an unfinished year is described in the same words.
 */
const FIRST = ['January', 'April', 'July', 'October'], LAST = ['March', 'June', 'September', 'December']
const COUNT = ['no', 'one', 'two', 'three', 'four']

/** The four reporting quarters of a calendar year (2026) or a financial year ('2025-26' or its starting year). */
export function yearQuarters(year, financial = false) {
  const start = Number(String(year).slice(0, 4))
  if (!Number.isInteger(start)) return []
  const id = (y, q) => `${y}Q0${q}`
  return financial ? [id(start, 3), id(start, 4), id(start + 1, 1), id(start + 1, 2)] : [1, 2, 3, 4].map(q => id(start, q))
}

/** { quarters, complete, text }: the held quarters of the year, whether all four are, and the words for a partial year. */
export function yearCoverage(periods, year, { financial = false } = {}) {
  const held = new Set(Array.isArray(periods) ? periods : periods ? [...periods] : [])
  const expected = yearQuarters(year, financial)
  const quarters = expected.filter(id => held.has(id))
  const complete = expected.length === 4 && quarters.length === 4
  if (complete || !expected.length) return { quarters, complete, text: '' }
  if (!quarters.length) return { quarters, complete, text: 'no quarters published' }
  // Runs of consecutive held quarters, each named by its first and last month.
  const runs = []
  expected.forEach((id, i) => {
    if (!held.has(id)) return
    const last = runs.at(-1)
    if (last && last.end === i - 1) last.end = i
    else runs.push({ start: i, end: i })
  })
  const part = id => ({ year: id.slice(0, 4), q: Number(id.slice(-1)) - 1 })
  const spans = runs.map(run => {
    const a = part(expected[run.start]), b = part(expected[run.end])
    return a.year === b.year ? `${FIRST[a.q]} to ${LAST[b.q]} ${b.year}` : `${FIRST[a.q]} ${a.year} to ${LAST[b.q]} ${b.year}`
  })
  const span = spans.length > 1 ? `${spans.slice(0, -1).join(', ')} and ${spans.at(-1)}` : spans[0]
  return { quarters, complete, text: `${span} (${COUNT[quarters.length]} quarter${quarters.length === 1 ? '' : 's'} published)` }
}
