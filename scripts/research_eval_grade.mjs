// Deterministic grading for the research-loop eval (portal/test/fixtures/research-evals.json).
// Pure: no network, no credentials, no model. Shared by scripts/research_eval.mjs and its test.
//
// Every check is structural: figures and names in the answer are matched against the payload's
// facts and cited sources, quotations against the evidence text, citation keys against sources,
// and the per-question `must` list against the payload. Gold rows reuse agentic_ask_score.mjs.
import { score as goldScore } from './agentic_ask_score.mjs'

export const fold = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[‘’ʼ`]/g, "'").toLowerCase()
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const word = (s) => new RegExp(`\\b${esc(fold(s))}\\b`)
const cp = (text, idx) => Array.from(text.slice(0, idx)).length

/** A name counts by its full form, or by first and last name; a one-word name by word boundary. */
export function mentions(text, name) {
  const t = fold(text), n = fold(name).trim()
  if (!n) return false
  if (t.includes(n)) return true
  const parts = n.split(/\s+/).filter((p) => p.length > 1)
  if (parts.length <= 1) return word(parts[0] ?? n).test(t)
  return word(parts.at(-1)).test(t)
}
/** Plain numbers (commas removed), skipping footnote markers. */
export const plainNumbers = (text) => (String(text ?? '').replace(/https?:\/\/[^\s)]+/g, ' ').replace(/\b((?:19|20)\d{2})-\d{2}-\d{2}\b/g, '$1').replace(/\b((?:19|20)\d{2})[–-]\d{2}\b/g, '$1').replace(/\b\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+((?:19|20)\d{2})\b/gi, '$1').replace(/\[\d+\]/g, ' ').match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => Number(n.replace(/,/g, '')))
/** Dollar amounts as numbers ($12.3m, $12.3 million, $12,345,678). */
export function amounts(text) {
  const out = []
  for (const m of String(text ?? '').matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*(billion|bn|million|m\b|k\b|thousand)?/gi)) {
    let v = Number(m[1].replace(/,/g, '')); const u = (m[2] ?? '').toLowerCase()
    if (u === 'billion' || u === 'bn') v *= 1e9; else if (u === 'million' || u === 'm') v *= 1e6; else if (u === 'thousand' || u === 'k') v *= 1e3
    out.push({ v, rounded: Boolean(u) })
  }
  return out
}
const isYear = (n) => Number.isInteger(n) && n >= 1900 && n <= 2035
/** A figure worth tracing: not a year, and either ten or more or fractional. */
const traceable = (n) => !isYear(n) && (n >= 10 || !Number.isInteger(n))
const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol * Math.max(Math.abs(b), 1)

export const CAVEAT = /coverage|thin|gap|incomplete|missing|limited|understat|not (?:fully )?(?:covered|captured|complete)|only \d+ (?:federal )?(?:chamber )?speeches|record (?:holds|has) (?:few|only)|sparse/i
export const REFUSAL = /^\s*This selection does not establish|OPAX covers Australian parliament and public records|Please name the person, place, period|Please (?:name|specify|clarify|give (?:the )?full name)|I cannot provide private information|do not establish that money caused|I (?:can only|can't|cannot) (?:help|answer)|outside (?:OPAX|the scope)|^\s*(?:not enough data|the record (?:retrieved|does not|cannot)|i (?:couldn't|could not|can't|cannot) find|no (?:clear )?answer|it is not possible)|not enough data to answer|could(?:n't| not) find a clear answer|cannot be (?:determined|answered)|(?:ranking|answer|total|rate) cannot be established|is not possible to (?:determine|identify)|does not discuss/i
export const CAUSAL = /\b(?:bought|bribe\w*|in exchange for|because of (?:the|these|their) donations?|donations? (?:caused|influenced|explain\w*)|paid for (?:access|votes?|influence))\b|\b(?:donat\w*|money|funding)\b.*\b(?:influenc\w*|caus\w*|led to|resulted in|secured)\b/i
/** Sentences that deny causation are the required no-causation wording, not a breach. */
const DENIAL = /\bnot (?:evidence|proof)\b|\bno evidence\b|does not (?:prove|show|establish|mean|imply)|is not proof|cannot be (?:inferred|read)/i

/** Sentences (and semicolon clauses) with code-point offsets, so citation ranges can be matched. */
export function sentencesOf(text) {
  const t = String(text ?? '')
  const parts = []; let start = 0
  const re = /(?<=[.!?\]])\s+(?=[A-Z"“'(\[])|;\s+/g; let m
  while ((m = re.exec(t))) { parts.push([start, m.index]); start = m.index + m[0].length }
  parts.push([start, t.length])
  return parts.filter(([s, e]) => t.slice(s, e).trim()).map(([s, e]) => ({ text: t.slice(s, e), start: cp(t, s), end: cp(t, e) }))
}

/** Evidence the answer may draw on: sources (title + snippet), excerpts and research sources. */
export function evidenceOf(payload) {
  const sources = Array.isArray(payload?.sources) ? payload.sources.filter((s) => s && typeof s === 'object') : []
  const cited = sources.filter((s) => s.cited === true)
  const excerpts = Array.isArray(payload?.evidence_excerpts) ? payload.evidence_excerpts.filter((e) => e && typeof e.text === 'string') : []
  const researchSources = Array.isArray(payload?.research?.sources) ? payload.research.sources.filter((s) => s && typeof s === 'object') : []
  const entries = [
    ...sources.map((s) => ({ text: [s.title, s.snippet].filter((x) => typeof x === 'string' && x).join(' — '), source: s })),
    ...excerpts.map((e) => ({ text: e.text, source: null })),
  ]
  const texts = [...entries.map((e) => e.text), ...researchSources.map((s) => String(s.title ?? ''))].filter(Boolean)
  // Fact-style payloads carry the complete fact text; ordinary payloads carry 600-character windows.
  const complete = sources.length > 0 && sources.every((s) => /^fact-\d+$/.test(String(s.resource)) || s.resource === 'coverage')
  return { sources, cited, excerpts, researchSources, entries, texts, complete }
}

export function figureCheck(answer, question, ev, sentences, covered) {
  const evNumbers = new Set(ev.texts.flatMap(plainNumbers)), evAmounts = ev.texts.flatMap(amounts).map((a) => a.v)
  const qNumbers = new Set(plainNumbers(question))
  const bound = (value, rounded) => evNumbers.has(value) || qNumbers.has(value) || (rounded && evAmounts.some((v) => near(value, v))) || evAmounts.some((v) => near(v, value, 0.0005))
  const figures = []
  for (const s of sentences) {
    const seen = new Set()
    for (const { v, rounded } of amounts(s.text)) { seen.add(v); figures.push({ value: v, amount: true, bound: bound(v, rounded), cited: covered(s), sentence: s.text.trim() }) }
    for (const n of plainNumbers(s.text.replace(/\$\s?\d[\d,]*(?:\.\d+)?\s*(?:billion|bn|million|m\b|k\b|thousand)?/gi, ' '))) { if (!traceable(n) || seen.has(n)) continue; seen.add(n); figures.push({ value: n, amount: false, bound: bound(n, false), cited: covered(s), sentence: s.text.trim() }) }
  }
  const unbound = figures.filter((f) => !f.bound)
  return { figures, unbound, unbound_uncited: unbound.filter((f) => !f.cited) }
}

/** Roster names in the answer, split by whether a fact, cited source, research source or the question names them. */
export function nameCheck(answer, question, ev, roster) {
  const t = fold(answer)
  const speakers = ev.sources.map((s) => s.speaker).filter((x) => typeof x === 'string')
  const pool = fold([question, ...ev.texts, ...speakers].join('\n'))
  const found = [], bound = [], unbound = []
  for (const name of roster) {
    const n = fold(name)
    if (n.split(/\s+/).length < 2 || n.length < 6 || !mentions(answer, name)) continue
    const surname = n.split(/\s+/).at(-1)
    if (!t.includes(n) && !new RegExp(`(?<![\\p{L}])${esc(name.split(/\s+/).at(-1))}(?![\\p{L}])`, 'u').test(answer)) continue
    if (!t.includes(n) && roster.filter(other => fold(other).split(/\s+/).at(-1) === surname).length > 1) continue
    found.push(name); (mentions(pool, name) ? bound : unbound).push(name)
  }
  return { found, bound, unbound }
}

/** Quotations of 30+ characters and 6+ words must appear verbatim (ellipses allowed) in the evidence. */
export function quoteCheck(answer, texts) {
  const strip = (x) => fold(x).replace(/[^\p{L}\p{N}]/gu, '')
  const evidence = texts.map(strip)
  const quotes = [...String(answer ?? '').matchAll(/["“]([^"”\n]*)["”]/g)].map((m) => m[1]).filter((q) => q.length >= 30 && q.trim().split(/\s+/).length >= 6)
  const missing = quotes.filter((quote) => {
    const parts = quote.split(/\.{3}|…/).map(strip).filter(Boolean)
    return !evidence.some((text) => { let off = 0; return parts.every((p) => { const at = text.indexOf(p, off); if (at < 0) return false; off = at + p.length; return true }) })
  })
  return { total: quotes.length, found: quotes.length - missing.length, missing }
}

export function citationCheck(payload, answer, ev) {
  const citations = payload?.citations && typeof payload.citations === 'object' ? payload.citations : {}
  const byResource = new Map(ev.sources.map((s) => [String(s.resource), s]))
  const keys = Object.keys(citations)
  const unresolved = keys.filter((k) => { const s = byResource.get(k.split('/')[0]); return !s || s.cited !== true })
  const ranges = keys.flatMap((k) => Array.isArray(citations[k]) ? citations[k].filter((r) => Array.isArray(r) && r.length === 2 && r.every(Number.isFinite)) : [])
  const sentences = sentencesOf(answer)
  const covered = (s) => ranges.some(([a, b]) => a < s.end && b > s.start)
  const figureSentences = sentences.filter((s) => plainNumbers(s.text).some(traceable) || amounts(s.text).length)
  return { keys: keys.length, unresolved, ranges: ranges.length, cited_sources: ev.cited.length, figure_sentences: figureSentences.length, figure_sentences_cited: figureSentences.filter(covered).length, sentences, covered }
}

export function causalCheck(answer) {
  return sentencesOf(answer).filter((s) => CAUSAL.test(s.text) && !DENIAL.test(s.text)).map((s) => s.text.trim())
}

export function toolsCheck(expected, payload) {
  const trail = Array.isArray(payload?.research?.trail) ? payload.research.trail.map((t) => t?.tool).filter((t) => typeof t === 'string') : []
  const steps = Array.isArray(payload?.agentic?.steps) ? payload.agentic.steps.map((s) => s?.tool).filter((t) => typeof t === 'string') : []
  const used = trail.length ? trail : steps
  const mode = payload?.research?.mode ?? null, rounds = payload?.research?.rounds ?? null
  if (!Array.isArray(expected) || !expected.length) return { expected: [], used, status: 'n/a', mode, rounds }
  if (!used.length) return { expected, used, status: 'unknown', mode, rounds }
  const terminal = new Set(['finish', 'answer'])
  const want = used.some((t) => terminal.has(t)) ? expected : expected.filter((t) => !terminal.has(t))
  let i = 0; for (const t of used) if (t === want[i]) i++
  const status = i === want.length ? 'pass' : want.every((t) => used.includes(t)) ? 'partial' : 'fail'
  return { expected, used, status, mode, rounds }
}

const sourceSpeaker = (s, roster) => typeof s.speaker === 'string' && s.speaker ? s.speaker : roster.find((n) => n.split(/\s+/).length >= 2 && fold([s.title, s.snippet].join(' ')).includes(fold(n))) ?? null
const sourceYear = (s) => { const m = /^(\d{4})/.exec(String(s.date ?? '')); return m ? Number(m[1]) : null }

/** One `must` entry → { status: pass | fail | unknown | n/a, detail }. */
export function runCheck(c, ctx) {
  const { answer, payload, ev, roster, names } = ctx
  const t = answer
  switch (c.type) {
    case 'no_tool_echo': case 'no_duplicates': case 'direct_first_sentence': return {status:answerStyleChecks(ctx.question ?? '', t, ev)[c.type],detail:'answer-writing contract'}
    case 'mentions': {
      const all = (c.all ?? []).filter((n) => !mentions(t, n)), any = c.any ? c.any.some((n) => mentions(t, n)) : true
      return { status: !all.length && any ? 'pass' : 'fail', detail: all.length ? `missing: ${all.join(', ')}` : any ? 'named' : `none of: ${c.any.join(', ')}` }
    }
    case 'terms': {
      const hit = (c.any ?? []).filter((x) => fold(t).includes(fold(x)))
      return { status: hit.length ? 'pass' : 'fail', detail: hit.length ? `terms: ${hit.join(', ')}` : `none of: ${(c.any ?? []).join(', ')}` }
    }
    case 'fact': {
      const re = new RegExp(c.match, c.flags ?? '')
      const hits = ev.entries.filter((e) => re.test(e.text))
      const min = c.min ?? 1
      if (hits.length < min) return { status: 'fail', detail: `${hits.length}/${min} facts match` }
      if (c.figure_in_answer) {
        const have = new Set(ctx.figures.figures.map((f) => f.value))
        const nums = hits.flatMap((e) => plainNumbers(e.text)).filter(traceable)
        if (!nums.some((n) => have.has(n))) return { status: 'fail', detail: `${hits.length} facts match but none of their figures is in the answer` }
      }
      if (c.amount_in_answer) {
        const have = ctx.figures.figures.filter((f) => f.amount)
        const amts = hits.flatMap((e) => amounts(e.text)).map((a) => a.v)
        if (!amts.some((v) => have.some((f) => near(f.value, v)))) return { status: 'fail', detail: `${hits.length} facts match but none of their amounts is in the answer` }
      }
      return { status: 'pass', detail: `${hits.length} facts match` }
    }
    case 'years': {
      const ys = new Set(plainNumbers(t).filter((n) => isYear(n) && (c.from == null || n >= c.from) && (c.to == null || n <= c.to)))
      return { status: ys.size >= (c.min ?? 1) ? 'pass' : 'fail', detail: `${ys.size} distinct years` }
    }
    case 'names': {
      return { status: names.bound.length >= (c.min ?? 1) ? 'pass' : 'fail', detail: names.bound.length ? `bound names: ${names.bound.join(', ')}` : 'no bound roster name' }
    }
    case 'must_not': return { status: new RegExp(c.match, c.flags ?? 'i').test(t) ? 'fail' : 'pass', detail: 'forbidden answer content' }
    case 'constraint': {
      if (ctx.refusal && (ctx.expectedDecline || /Please (?:name|give|specify|clarify)/i.test(t))) return { status: 'pass', detail: 'clarification makes no period claim' }
      const years = (c.years ?? []).every(y => t.includes(String(y)))
      const forbidden = (c.must_not ?? []).some(x => new RegExp(x, 'i').test(t))
      const explicitLimit = /not (?:fully )?covered|cannot establish|records (?:start|cover)|does not (?:hold|date)|not.*available|cannot.*historical/i.test(t)
      const from = c.since ?? (c.years?.length ? String(Math.min(...c.years)) : null)
      const to = c.open_end ? null : c.until ?? (c.years?.length ? String(Math.max(...c.years)) : null)
      const dates = ev.cited.filter(s => s.kind === 'speech').map(s => String(s.date ?? ''))
      const outside = dates.some(d => !d || from && d.slice(0,4) < String(from).slice(0,4) || to && d.slice(0,4) > String(to).slice(0,4))
      return { status: !forbidden && !outside && (years || explicitLimit || c.open_end && dates.length > 0) ? 'pass' : 'fail', detail: forbidden ? 'substituted forbidden period' : outside ? 'source outside requested period' : c.open_end && dates.length ? 'dated evidence within open period' : 'period in answer or explicit coverage limit' }
    }
    case 'period': {
      const since = typeof payload?.period?.since === 'string' ? payload.period.since : null
      if (since) return { status: since.startsWith(c.since) ? 'pass' : 'fail', detail: `period.since ${since}` }
      const label = /counting speeches[^.]*\./i.exec(t)?.[0]
      if (label) return { status: label.includes(c.since) ? 'pass' : 'fail', detail: label }
      return { status: 'n/a', detail: 'no period in payload' }
    }
    case 'caveat': return { status: CAVEAT.test(t) ? 'pass' : 'fail', detail: CAVEAT.test(t) ? 'coverage caveat present' : 'no coverage caveat' }
    case 'sources': {
      let rows = ev.cited
      if (c.kind) rows = rows.filter((s) => s.kind === c.kind)
      if (c.speaker_any) rows = rows.filter((s) => { const sp = sourceSpeaker(s, roster); return c.speaker_any.some((n) => (sp && mentions(sp, n)) || mentions([s.title, s.snippet].join(' '), n)) })
      if (c.date_from) rows = rows.filter((s) => typeof s.date === 'string' && s.date >= c.date_from)
      const min = c.min ?? 1
      if (rows.length < min) return { status: 'fail', detail: `${rows.length}/${min} cited sources` }
      if (c.distinct_speakers_min) {
        const sp = new Set(rows.map((s) => sourceSpeaker(s, roster)).filter(Boolean).map(fold))
        if (sp.size < c.distinct_speakers_min) return { status: sp.size ? 'fail' : 'unknown', detail: `${sp.size} distinct speakers` }
      }
      if (c.years_span_min) {
        const ys = rows.map(sourceYear).filter((y) => y !== null)
        if (ys.length < 2) return { status: 'unknown', detail: 'sources carry no dates' }
        const span = Math.max(...ys) - Math.min(...ys)
        if (span < c.years_span_min) return { status: 'fail', detail: `cited sources span ${span} years` }
      }
      return { status: 'pass', detail: `${rows.length} cited sources` }
    }
    case 'source_parties': {
      const byName = new Map(roster.map((n) => [fold(n), null]))
      const partyOf = (s) => (typeof s.party === 'string' && s.party) || ctx.parties?.get(fold(sourceSpeaker(s, roster) ?? '')) || null
      const seen = ev.cited.map(partyOf).filter(Boolean)
      if (!seen.length) return { status: 'unknown', detail: byName.size ? 'no cited source carries a party' : 'no roster' }
      const missing = (c.groups ?? []).filter((g) => !seen.some((p) => g.includes(p)))
      return { status: missing.length ? 'fail' : 'pass', detail: missing.length ? `no cited speaker from: ${missing.map((g) => g.join('/')).join('; ')}` : `parties: ${[...new Set(seen)].join(', ')}` }
    }
    case 'decline': return { status: ctx.refusal ? 'pass' : 'fail', detail: ctx.refusal ? 'declined' : 'answered' }
    default: return { status: 'unknown', detail: `unknown check ${c.type}` }
  }
}

/** Answer-writing rubric, shared by the comparison and regression tests. */
export function answerStyleChecks(question, answer, evidence = evidenceOf({})) {
  const plain = String(answer).replace(/\[\d+\]/g, '')
  const sentences = plain.split(/(?<=[.!?])\s+|\n+/).map(s => s.replace(/^[-*•]\s*/, '').trim()).filter(Boolean)
  const normal = s => fold(s).replace(/[^a-z0-9]+/g, ' ').trim()
  const seen = new Set(), sets = new Set(); let duplicate = false
  for (const sentence of sentences) {
    const k = normal(sentence), nums = plainNumbers(sentence).filter(n => !isYear(n))
    const money=amounts(sentence).map(a=>a.v)
    const signature = money.length ? [...new Set(money)].sort((a,b)=>a-b).join('/') : nums.length ? [...new Set(nums)].sort((a,b)=>a-b).join('/') : ''
    if (seen.has(k) || signature && sets.has(signature)) duplicate = true
    seen.add(k); if(signature)sets.add(signature)
  }
  const coverage = sentences.filter(s => /^(?:Coverage:|OPAX.*(?:records|export)|Salary entitlements|These records)|\b(?:exclude[sd]? allowances|not allowances|records start|records cover|coverage (?:is|of))/i.test(s))
  const echo = /Coverage:|\ba year as [^\n]+, \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}; base|\|\s*(?:Rank|Parliamentarian|Party|Recipient)\s*\||base \$[\d,]+ plus \d+(?:\.\d+)?%/i.test(answer)
  const first = sentences[0] ?? '', amountsInAnswer = amounts(answer)
  const figureAsked = /\b(?:highest|lowest|most|least|largest|biggest|top|salary|paid|grants?|contracts?|median|population)\b|\bhow (?:many|much)\b/i.test(question)
  const firstAmount = !figureAsked || !amountsInAnswer.length || amounts(first).some(a => amountsInAnswer.some(b => a.v === b.v))
  const direct = first.length > 12 && !/^(?:Here|Based on|According to|Coverage:|The (?:data|records|tool|table|figures) show)/i.test(first) && !/^\|/.test(answer) && firstAmount && /\b(?:is|are|was|were|has|have|had|received|recorded|gave|got|led|leads?|made|said|argued|supported|opposed|cannot|covers?|holds?|does|do|ranked|topped|earned|paid|provides?|start|Please|I|OPAX)\b/i.test(first)
  return { no_tool_echo: echo ? 'fail' : 'pass', no_duplicates: duplicate || coverage.length > 1 ? 'fail' : 'pass', direct_first_sentence: direct ? 'pass' : 'fail' }
}

const axisOf = (counts) => counts.fail ? 'fail' : counts.partial ? 'partial' : 'pass'

/** Grade one payload against one question. `roster` is a list of names; `parties` maps folded name → party. */
export function gradeRow(q, payload, { roster = [], parties = new Map() } = {}) {
  const answer = String(payload?.answer ?? '')
  const answered = payload?.answered !== false && answer.trim().length > 0
  const refusal = !answered || REFUSAL.test(answer)
  const ev = evidenceOf(payload)
  const cit = citationCheck(payload, answer, ev)
  const figures = figureCheck(answer, q.question, ev, cit.sentences, cit.covered)
  const names = nameCheck(answer, q.question, ev, roster)
  const quotes = quoteCheck(answer, ev.texts)
  const causal = causalCheck(answer)
  const tools = toolsCheck(q.expected_tools, payload)
  const expectsDecline = q.expected?.kind === 'decline' || Boolean(q.expected?.unanswerable) || (q.must ?? []).some((c) => c.type === 'decline')
  const ctx = { question:q.question, answer, payload, ev, roster, parties, names, figures, refusal, expectedDecline: expectsDecline }
  const checks = (q.must ?? []).map((c) => ({ ...c, ...runCheck(c, ctx) }))
  const parts = [...new Set(checks.map((c) => c.part).filter(Boolean))]
  const coveredParts = parts.filter((p) => checks.filter((c) => c.part === p).every((c) => c.status === 'pass' || c.status === 'n/a'))
  const gold = q.gold ? goldScore(q, answer, payload?.answered === true) : null

  // Usefulness: the question is answered and every part has evidence behind it.
  let usefulness
  if (expectsDecline) usefulness = refusal ? 'pass' : 'fail'
  else if (refusal) usefulness = 'fail'
  else if (gold) usefulness = 'pass'
  else usefulness = !parts.length || coveredParts.length === parts.length ? 'pass' : coveredParts.length ? 'partial' : 'fail'

  // Citations: bound keys, cited figure sentences, verbatim quotations.
  let citations
  if (refusal) citations = 'n/a'
  else if (!cit.cited_sources || cit.unresolved.length || (ev.complete && quotes.missing.length)) citations = 'fail'
  else if (cit.figure_sentences_cited < cit.figure_sentences || quotes.missing.length) citations = 'partial'
  else citations = 'pass'

  // Correctness: must checks, nothing invented, no causal wording.
  const graded = checks.filter((c) => !['no_tool_echo','no_duplicates','direct_first_sentence'].includes(c.type) && (c.status === 'pass' || c.status === 'fail'))
  const passed = graded.filter((c) => c.status === 'pass').length
  const unknown = checks.filter((c) => c.status === 'unknown').length
  const invented = causal.length > 0 || figures.unbound_uncited.length > 0 || (ev.complete && (figures.unbound.length > 0 || names.unbound.length > 0))
  let correctness
  if (expectsDecline) correctness = refusal && !figures.unbound.length ? 'pass' : 'fail'
  else if (refusal) correctness = 'fail'
  else if (invented) correctness = 'fail'
  else if (gold) correctness = gold.pass ? 'pass' : Object.values(gold.checks).some((v) => v === true) ? 'partial' : 'fail'
  else if (graded.length && passed < graded.length / 2) correctness = 'fail'
  else if (figures.unbound.length || names.unbound.length || passed < graded.length || unknown) correctness = 'partial'
  else correctness = 'pass'

  const constraintChecks = checks.filter(c => ['constraint', 'period', 'must_not'].includes(c.type))
  const constraints = constraintChecks.some(c => c.status === 'fail') ? 'fail' : constraintChecks.length ? 'pass' : 'n/a'
  const decline = expectsDecline ? refusal ? 'pass' : 'fail' : refusal ? 'fail' : 'pass'
  const style = answerStyleChecks(q.question, answer, ev)
  if(expectsDecline && !answered)style.direct_first_sentence='n/a'
  const axes = { usefulness, citations, correctness, constraints, decline, ...style }
  const overall = axisOf({ fail: Object.values(axes).includes('fail'), partial: Object.values(axes).includes('partial') })
  const flags = [
    ...figures.unbound.map((f) => `unbound figure ${f.amount ? '$' : ''}${f.value}${f.cited ? '' : ' (uncited sentence)'}`),
    ...names.unbound.map((n) => `unbound name ${n}`),
    ...quotes.missing.map((m) => `quotation not in evidence: "${m.slice(0, 60)}…"`),
    ...causal.map((s) => `causal wording: ${s.slice(0, 80)}`),
    ...cit.unresolved.map((k) => `citation key without a cited source: ${k}`),
  ]
  if (!refusal && !cit.cited_sources) flags.push('no cited source')
  if (refusal && !expectsDecline) flags.push('refused or declined')
  return {
    overall, axes, answered, refusal, parts: { total: parts.length, covered: coveredParts.length, names: coveredParts },
    checks: checks.map(({ part, type, status, detail, why }) => ({ part: part ?? null, type, status, detail, why: why ?? null })),
    figures: { total: figures.figures.length, unbound: figures.unbound.map((f) => f.value), unbound_uncited: figures.unbound_uncited.map((f) => f.value) },
    names, quotes, citations: { keys: cit.keys, unresolved: cit.unresolved, cited_sources: cit.cited_sources, figure_sentences: cit.figure_sentences, figure_sentences_cited: cit.figure_sentences_cited },
    causal, tools, gold: gold ? { pass: gold.pass, checks: gold.checks } : null, evidence_complete: ev.complete, flags,
  }
}

/** Tokens and cost from the payload. Reported cost wins; else tokens × prices (US$ per million); else missing. */
export function usageOf(payload, prices = { input: 0.44, output: 1.32 }) {
  const objs = [payload?.research?.usage, payload?.usage, payload?.agentic?.usage, payload?.research?.tokens, payload?.tokens, payload?.agentic?.tokens].filter((u) => u && typeof u === 'object')
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null)
  let input = null, output = null, reported = null
  for (const u of objs) {
    input ??= num(u.input ?? u.input_tokens ?? u.prompt_tokens ?? u.inputTokens ?? u.promptTokens)
    output ??= num(u.output ?? u.output_tokens ?? u.completion_tokens ?? u.outputTokens ?? u.completionTokens)
    reported ??= num(u.cost_usd ?? u.cost ?? u.costUsd)
  }
  reported ??= num(payload?.research?.cost_usd ?? payload?.cost_usd ?? payload?.agentic?.cost_usd)
  const total = input !== null || output !== null ? (input ?? 0) + (output ?? 0) : null
  const cost = reported !== null ? reported : total !== null ? ((input ?? 0) * prices.input + (output ?? 0) * prices.output) / 1e6 : null
  return { input, output, total, cost_usd: cost, cost_source: reported !== null ? 'reported' : total !== null ? 'estimated' : 'missing' }
}

/** Nearest-rank percentile over finite values; null when empty. */
export function percentile(values, p) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  return v[Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1))]
}

const tally = (rows, pick) => { const c = { pass: 0, partial: 0, fail: 0 }; for (const r of rows) { const v = pick(r); if (v in c) c[v]++ } return c }

/** Per-mode summary: grade counts, latency, tokens and cost percentiles. */
export function summarise(rows) {
  const out = {}
  for (const mode of [...new Set(rows.map((r) => r.mode))]) {
    const all = rows.filter((r) => r.mode === mode), graded = all.filter((r) => r.grade)
    const ms = graded.map((r) => r.ms), tokens = graded.map((r) => r.usage?.total).filter((x) => x != null), cost = graded.map((r) => r.usage?.cost_usd).filter((x) => x != null)
    out[mode] = {
      n: all.length, graded: graded.length, errors: all.length - graded.length,
      overall: tally(graded, (r) => r.grade.overall),
      usefulness: tally(graded, (r) => r.grade.axes.usefulness), citations: tally(graded, (r) => r.grade.axes.citations), correctness: tally(graded, (r) => r.grade.axes.correctness),
      ...Object.fromEntries(['constraints','decline','no_tool_echo','no_duplicates','direct_first_sentence'].map(axis=>[axis,tally(graded,r=>r.grade.axes[axis])])),
      latency_ms: { p50: percentile(ms, 50), p95: percentile(ms, 95) },
      tokens: { p50: percentile(tokens, 50), p95: percentile(tokens, 95), reported: tokens.length },
      cost_usd: { mean: cost.length ? cost.reduce((a, b) => a + b, 0) / cost.length : null, p50: percentile(cost, 50), p95: percentile(cost, 95), reported: graded.filter((r) => r.usage?.cost_source === 'reported').length, estimated: graded.filter((r) => r.usage?.cost_source === 'estimated').length, missing: graded.filter((r) => !r.usage || r.usage.cost_source === 'missing').length },
      categories: Object.fromEntries([...new Set(all.map(r => r.kind))].map(category => { const rs = all.filter(r => r.kind === category); const costs = rs.map(r => r.usage?.cost_usd).filter(x => x != null); return [category, { n: rs.length, pass: rs.filter(r => r.grade?.overall === 'pass').length, partial: rs.filter(r => r.grade?.overall === 'partial').length, constraints_pass: rs.filter(r => r.grade?.axes.constraints === 'pass').length, decline_pass: rs.filter(r => r.grade?.axes.decline === 'pass').length, latency_ms: { p50: percentile(rs.map(r => r.ms), 50), p95: percentile(rs.map(r => r.ms), 95) }, cost_usd: { mean: costs.length ? costs.reduce((a,b) => a+b,0)/costs.length : null, p95: percentile(costs,95) } }] })),
      mode_mismatch: graded.filter((r) => r.grade.tools.mode && r.grade.tools.mode !== mode).length,
    }
  }
  return out
}

const fmtMs = (ms) => (ms == null ? '–' : `${(ms / 1000).toFixed(1)} s`)
const fmtUsd = (v) => (v == null ? '–' : `US$${v.toFixed(4)}`)
const fmtN = (v) => (v == null ? '–' : Number(v).toLocaleString('en-AU'))
const grades = (c) => `${c.pass}/${c.partial}/${c.fail}`
const clip = (s, n = 700) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t }

/** Markdown report: a per-mode summary, then each question with old and new side by side. */
export function renderMarkdown(report) {
  const L = []
  L.push(`# Research loop eval — ${report.generated}`, '')
  L.push(`Base: ${report.base_host ?? 'offline fixture'} · set: ${report.set} · modes: ${report.modes.join(', ')} · limit: ${report.limit} · questions: ${report.questions.length} · prices US$/M: in ${report.prices.input}, out ${report.prices.output}`, '')
  L.push('## Summary', '', '| mode | n | errors | overall P/p/F | usefulness | citations | correctness | p50 latency | p95 latency | p50 tokens | p95 tokens | mean cost | p50 cost | p95 cost | usage reported / estimated / missing |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const [mode, s] of Object.entries(report.summary)) L.push(`| ${mode} | ${s.n} | ${s.errors} | ${grades(s.overall)} | ${grades(s.usefulness)} | ${grades(s.citations)} | ${grades(s.correctness)} | ${fmtMs(s.latency_ms.p50)} | ${fmtMs(s.latency_ms.p95)} | ${fmtN(s.tokens.p50)} | ${fmtN(s.tokens.p95)} | ${fmtUsd(s.cost_usd.mean)} | ${fmtUsd(s.cost_usd.p50)} | ${fmtUsd(s.cost_usd.p95)} | ${s.cost_usd.reported} / ${s.cost_usd.estimated} / ${s.cost_usd.missing} |`)
  L.push('', '| mode | no tool echo P/p/F | no duplicates P/p/F | direct first sentence P/p/F | date checks P/p/F | declines P/p/F |', '|---|---|---|---|---|---|')
  for(const [mode,s] of Object.entries(report.summary))L.push(`| ${mode} | ${grades(s.no_tool_echo)} | ${grades(s.no_duplicates)} | ${grades(s.direct_first_sentence)} | ${grades(s.constraints)} | ${grades(s.decline)} |`)
  L.push('', 'P/p/F = pass / partial / fail counts. Grades are structural (facts, citations, quotations, invented figures and names); the judge reads the answers below for usefulness.', '')
  L.push('## Side by side', '')
  for (const q of report.questions) {
    L.push(`### ${q.id} · ${q.kind}${q.shape ? ' · ' + q.shape : ''}`, '', `**Q:** ${q.question}`, '')
    if (q.old_route) L.push(`Old route: ${q.old_route}. Expected tools: ${(q.expected_tools ?? []).join(' → ') || '–'}.`, '')
    const modes = report.modes
    const row = (m) => q.by_mode[m]
    const cell = (m, f, top = false) => { const r = row(m); return r ? (r.error ? (top ? `error: ${r.error}` : '–') : f(r)) : '–' }
    L.push(`| | ${modes.join(' | ')} |`, `|---|${modes.map(() => '---').join('|')}|`)
    L.push(`| overall | ${modes.map((m) => cell(m, (r) => r.grade.overall, true)).join(' | ')} |`)
    L.push(`| usefulness / citations / correctness | ${modes.map((m) => cell(m, (r) => `${r.grade.axes.usefulness} / ${r.grade.axes.citations} / ${r.grade.axes.correctness}`)).join(' | ')} |`)
    L.push(`| parts covered | ${modes.map((m) => cell(m, (r) => `${r.grade.parts.covered}/${r.grade.parts.total}${r.grade.parts.names.length ? ' (' + r.grade.parts.names.join(', ') + ')' : ''}`)).join(' | ')} |`)
    L.push(`| latency (server) | ${modes.map((m) => cell(m, (r) => `${fmtMs(r.ms)}${r.server_ms != null ? ' (' + fmtMs(r.server_ms) + ')' : ''}`)).join(' | ')} |`)
    L.push(`| tokens / cost | ${modes.map((m) => cell(m, (r) => `${fmtN(r.usage?.total)} / ${fmtUsd(r.usage?.cost_usd)} (${r.usage?.cost_source ?? 'missing'})`)).join(' | ')} |`)
    L.push(`| tools (mode, rounds) | ${modes.map((m) => cell(m, (r) => `${r.grade.tools.used.join(' → ') || '–'} → ${r.grade.tools.status}${r.grade.tools.mode ? ` (${r.grade.tools.mode}${r.grade.tools.rounds != null ? ', ' + r.grade.tools.rounds : ''})` : ''}`)).join(' | ')} |`)
    L.push(`| cited sources / quotes | ${modes.map((m) => cell(m, (r) => `${r.grade.citations.cited_sources} / ${r.grade.quotes.found}/${r.grade.quotes.total}`)).join(' | ')} |`)
    L.push(`| flags | ${modes.map((m) => cell(m, (r) => r.grade.flags.join('; ') || '–')).join(' | ')} |`, '')
    for (const m of modes) {
      const r = row(m); if (!r || r.error) continue
      L.push(`**${m} answer**`, '', `> ${clip(r.answer)}`, '')
      const failed = r.grade.checks.filter((c) => c.status !== 'pass')
      if (failed.length) L.push(`${m} checks not passed: ${failed.map((c) => `${c.part ? c.part + '/' : ''}${c.type} ${c.status} (${c.detail})`).join('; ')}`, '')
    }
    if (q.rubric) L.push(`Rubric — usefulness: ${q.rubric.usefulness} Citations: ${q.rubric.citations} Correctness: ${q.rubric.correctness}`, '')
    L.push('Judge: _old vs new, one line_', '')
  }
  return L.join('\n') + '\n'
}
