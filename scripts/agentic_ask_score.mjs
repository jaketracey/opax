// Deterministic gold scoring only. No network, credentials or model calls.
const fold = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[‘’ʼ`]/g, "'").toLowerCase()
/** A name counts as mentioned by its full form, or by first and last name, or (a one-word record name) by that word. */
function mentions(text, name) {
  const t = fold(text), n = fold(name).trim()
  if (!n) return false
  if (t.includes(n)) return true
  const parts = n.split(/\s+/).filter((p) => p.length > 1)
  if (parts.length === 1) return new RegExp(`\\b${parts[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t)
  const last = parts.at(-1), firstName = parts[0]
  return new RegExp(`\\b${firstName}\\b`).test(t) && new RegExp(`\\b${last.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t)
}
const firstIndex = (text, name) => {
  const t = fold(text), parts = fold(name).split(/\s+/)
  const i = t.indexOf(fold(name)); if (i >= 0) return i
  const j = t.search(new RegExp(`\\b${parts.at(-1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)); return j < 0 ? Infinity : j
}
/** Plain numbers in the text (commas removed), skipping footnote markers. */
const plainNumbers = (text) => (String(text).replace(/\[\d+\]/g, ' ').match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => Number(n.replace(/,/g, '')))
/** Dollar amounts in the text, as numbers ($12.3m, $12.3 million, $12,345,678). */
function amounts(text) {
  const out = []
  for (const m of String(text).matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*(billion|bn|million|m\b|k\b|thousand)?/gi)) {
    let v = Number(m[1].replace(/,/g, '')); const u = (m[2] ?? '').toLowerCase()
    if (u === 'billion' || u === 'bn') v *= 1e9; else if (u === 'million' || u === 'm') v *= 1e6; else if (u === 'thousand' || u === 'k') v *= 1e3
    out.push({ v, rounded: Boolean(u) })
  }
  return out
}
const hasAmount = (text, expected) => amounts(text).some(({ v, rounded }) => (rounded ? Math.abs(v - expected) / expected <= 0.05 : Math.abs(v - expected) < 1))
const hasNumber = (text, n) => plainNumbers(text).includes(n)
const CAVEAT = /coverage|thin|gap|incomplete|missing|limited|understat|not (?:fully )?(?:covered|captured|complete)|only \d+ (?:federal )?(?:chamber )?speeches|record (?:holds|has) (?:few|only)|sparse/i
const DECLINE = /^\s*(?:not enough data|it is not possible|the record (?:does not|cannot)|no )|not enough data to answer|cannot be (?:determined|answered)|isn't possible to determine|not possible to (?:determine|identify)/i
const LIMIT = /not enough data|no party label|not labell?ed|cannot|can't|can not|does not (?:record|carry|hold)|doesn't (?:record|carry|hold)|not recorded|unable|isn't possible|is not possible|no party (?:information|data)/i

export function score(q, answer, answered = true) {
  const e = q.expected
  const text = String(answer ?? '')
  const r = { id: q.id, kind: e.kind, pass: false, checks: {} }
  if (e.kind === 'electorates') {
    if (e.unanswerable) {
      r.checks = { declined: !answered || /cannot|no published|unavailable/i.test(text), no_invented_figure: !/\$\s*\d|\b\d+(?:\.\d+)?\s*(?:AUD\/week\b|%|years\b)/.test(text) }
      r.pass = r.checks.declined && r.checks.no_invented_figure
    } else {
      r.checks = { answered, values: e.rows.every((row) => mentions(text, row.name) && hasNumber(text, row.value)), census: /2021 Census \(ABS\)/i.test(text), units: e.unit === 'AUD/week' ? /AUD\/week|\$[\d,]+.*(?:week|weekly)/i.test(text) : text.includes(e.unit) }
      r.pass = Object.values(r.checks).every(Boolean)
    }
    return r
  }
  if (e.kind === 'decline') {
    const partyCount = /\b(?:Labor|Liberal|Nationals|Greens|One Nation|Independent)\b[^.]{0,40}\b\d{2,}\b/.test(text)
    r.checks = { declined: !answered || LIMIT.test(text), no_party_count: !partyCount }
    r.pass = r.checks.declined && r.checks.no_party_count
    return r
  }
  if (!answered || !text.trim()) { r.checks = { answered: false }; return r }
  if (e.kind === 'ranking') {
    const top = e.top ?? []
    const t1 = top[0]
    // Ties: any name sharing the leader's count may lead.
    const leaders = top.filter((x) => x.count === t1?.count)
    const firstNamed = [...top].sort((a, b) => firstIndex(text, a.name) - firstIndex(text, b.name))[0]
    const n = e.top_n ?? 3
    const boundary = top[Math.min(n, top.length) - 1]?.count
    const want = top.filter((x, i) => i < n || x.count === boundary)
    const hit = want.filter((x) => mentions(text, x.name)).length
    r.checks = {
      top1_named: leaders.some((x) => mentions(text, x.name)),
      top1_first: leaders.some((x) => x.name === firstNamed?.name) && Number.isFinite(firstIndex(text, firstNamed.name)),
      top1_count: leaders.some((x) => hasNumber(text, x.count)),
      topn_names: `${Math.min(hit, n)}/${n}`,
      caveat: e.coverage_caveat ? CAVEAT.test(text) : undefined,
    }
    r.pass = r.checks.top1_named && r.checks.top1_first && r.checks.top1_count && Math.min(hit, n) >= Math.min(2, n) && (!e.coverage_caveat || r.checks.caveat)
    return r
  }
  const nums = (e.numbers ?? []).filter((x) => typeof x === 'number')
  const numHits = nums.filter((x) => hasNumber(text, x)).length
  const names = e.names ?? []
  const nameHits = names.filter((x) => mentions(text, x)).length
  r.checks = { numbers: `${numHits}/${nums.length}`, names: `${nameHits}/${names.length}` }
  let ok = numHits === nums.length && nameHits === names.length
  if (e.years_expected) { r.checks.years = e.years_expected.every((y) => hasNumber(text, y)); ok = ok && r.checks.years }
  if (e.kind === 'money') {
    const donors = e.donors?.top ?? []
    if (donors.length) { r.checks.top_donor = mentions(text, donors[0].name); r.checks.top_donor_amount = hasAmount(text, donors[0].total_aud); ok = ok && r.checks.top_donor && r.checks.top_donor_amount }
    if (e.amounts?.length) { r.checks.amounts = e.amounts.filter((a) => hasAmount(text, a)).length + '/' + e.amounts.length; ok = ok && e.amounts.every((a) => hasAmount(text, a)) }
  }
  if (e.coverage_caveat) { r.checks.caveat = CAVEAT.test(text); ok = ok && r.checks.caveat }
  r.pass = ok
  return r
}
/** Grounding: every figure in the answer appears in the tool output, and every sentence with a figure carries a citation. */
export function grounding(answer, evidence) {
  const text = String(answer ?? '')
  const sentences = text.split(/(?<=[.!?])\s+/)
  const ev = new Set([...plainNumbers(evidence), ...amounts(evidence).map((a) => Math.round(a.v))])
  let figures = 0, traced = 0, figureSentences = 0, cited = 0
  for (const s of sentences) {
    const nums = plainNumbers(s).filter((n) => !(n >= 1900 && n <= 2030 && Number.isInteger(n)) && !(n < 10 && Number.isInteger(n)))
    const amts = amounts(s)
    if (!nums.length && !amts.length) continue
    figureSentences++
    if (/\[\d+\]|\[\^?\d+\]|block-[A-Z]{2}/.test(s)) cited++
    for (const n of nums) { figures++; if (ev.has(n) || [...ev].some((x) => amts.some((a) => a.rounded && Math.abs(x - a.v) / Math.max(x, 1) <= 0.05))) traced++ }
  }
  return { figures, traced, figure_sentences: figureSentences, cited }
}
