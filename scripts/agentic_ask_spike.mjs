#!/usr/bin/env node
// Scores the agentic Ask designs on the gold set (portal/test/fixtures/agentic-ask-gold.json)
// and writes portal/private/agentic-ask-spike/results.json (git-ignored).
//
//   node scripts/agentic_ask_spike.mjs i  [--port 8970] [--only R01,P01]   # design (i): local wrangler dev /api/ask-agentic
//   node scripts/agentic_ask_spike.mjs ii [--config opax-spike-agent-mcp]  # design (ii): KB agentic config over the /ask websocket
//   node scripts/agentic_ask_spike.mjs score                                 # rescore saved runs, print the table
//
// Never calls production Ask: (i) runs against a local `wrangler dev --local`, (ii)
// against the knowledge box with an opax-spike-* agentic config whose models are
// all the openai-compatible slot. Questions run one at a time so each question's
// OpenRouter spend can be read off the key's usage counter (production traffic
// shares the key; it was ~$0.2/day during the spike, noted in the results).
// Scoring is deterministic (names and numbers against the gold answers); no model judge.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { score as scorePublishedGold } from './agentic_ask_score.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GOLD = JSON.parse(fs.readFileSync(path.join(ROOT, 'portal/test/fixtures/agentic-ask-gold.json'), 'utf8'))
const OUT_DIR = path.join(ROOT, 'portal/private/agentic-ask-spike')
const OUT = path.join(OUT_DIR, 'results.json')
const args = process.argv.slice(2)
const mode = args[0]
const liveCLI = process.argv[1] && import.meta.url === `file://${process.argv[1]}` && (mode === 'i' || mode === 'ii')
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d }
const only = opt('only', '') ? new Set(opt('only', '').split(',')) : null
const CAP_USD = Number(opt('cap', '10'))
// DeepSeek first-party price on OpenRouter for deepseek-v4-pro-0813 (12 Oct 2026); peak windows double it.
const PRICE = { input: 0.66 / 1e6, output: 1.98 / 1e6, peak_multiplier: 2 }

const vars = Object.fromEntries((liveCLI ? fs.readFileSync(path.join(ROOT, 'portal/.dev.vars'), 'utf8') : '').split('\n')
  .filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
function orKey() {
  // The KB's BYOK OpenRouter key: read for its usage counter only, never printed.
  for (const f of [process.env.OPAX_OPENROUTER_ENV, path.join(ROOT, '.env'), '/Users/jake/Projects/opax/.claude/worktrees/arag-migration/.env']) {
    if (!f || !fs.existsSync(f)) continue
    const line = fs.readFileSync(f, 'utf8').split('\n').find((l) => l.startsWith('OPENROUTER_API_KEY='))
    if (line) return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
  }
  return null
}
const OR_KEY = liveCLI ? orKey() : null
async function orUsage() {
  if (!OR_KEY) return null
  try { const r = await fetch('https://openrouter.ai/api/v1/key', { headers: { authorization: `Bearer ${OR_KEY}` } }); return (await r.json()).data?.usage ?? null } catch { return null }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------- design (i)
async function runI(q, port) {
  const t0 = Date.now()
  const res = await fetch(`http://127.0.0.1:${port}/api/ask-agentic`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-opax-nocache': '1', 'cf-connecting-ip': '127.0.0.1' },
    body: JSON.stringify({ question: q.question, force: true }),
  })
  const ms = Date.now() - t0
  let body = null
  try { body = await res.json() } catch { body = { error: `status ${res.status}` } }
  return { status: res.status, ms, payload: body }
}

// ---------------------------------------------------------------- design (ii)
export function runII(q, config) {
  return new Promise((resolve) => {
    const url = `wss://aws-ap-southeast-2-1.rag.progress.cloud/api/v1/kb/${vars.ARAG_KB_ID}/ask?agentic_config_id=${encodeURIComponent(config)}`
    const t0 = Date.now(); const frames = []; let first = null
    const ws = new WebSocket(url, { headers: { 'x-nuclia-serviceaccount': `Bearer ${vars.ARAG_KB_TOKEN}`, 'x-show-consumption': 'true' } })
    const timer = setTimeout(() => { frames.push({ _t: (Date.now() - t0) / 1000, timeout: true }); try { ws.close() } catch {} }, 150_000)
    ws.onopen = () => ws.send(JSON.stringify({ question: q.question, operation: 0, headers: {} }))
    ws.onmessage = (ev) => {
      let d; try { d = JSON.parse(ev.data) } catch { d = { raw: String(ev.data).slice(0, 2000) } }
      d._t = (Date.now() - t0) / 1000
      if (first === null && (d.answer || d.streaming_response_chunk || d.possible_answer)) first = d._t
      frames.push(d)
      if (d.operation === 3 || d.operation === 4) ws.close(1000)
    }
    ws.onerror = (e) => frames.push({ _t: (Date.now() - t0) / 1000, wserror: String(e?.message || e?.type || e) })
    ws.onclose = () => { clearTimeout(timer); resolve({ ms: Date.now() - t0, first_answer_s: first, frames: JSON.parse(JSON.stringify(frames).replaceAll(vars.ARAG_KB_ID, '<KB>')) }) }
  })
}
export function summariseII(run) {
  const steps = run.frames.filter((f) => f.step).map((f) => f.step)
  const answerFrame = [...run.frames].reverse().find((f) => typeof f.answer === 'string' && f.answer)
  const toolCalls = steps.filter((s) => s.module === 'smart' && /Tool calls:/.test(s.value ?? ''))
  const calls = toolCalls.flatMap((s) => [...String(s.value).matchAll(/(\w+?)__([\w-]+?)\(/g)].map((m) => ({ fn: m[1], source: m[2] })))
  const mcpCalls = calls.filter((c) => /mcp/i.test(c.source))
  const errors = steps.filter((s) => s.error || /error|failed|exception/i.test(`${s.reason ?? ''} ${s.title ?? ''}`))
  const mcpErrors = errors.filter((s) => /mcp/i.test(`${s.agent_path ?? ''} ${s.title ?? ''} ${s.module ?? ''}`))
  const nuclia = steps.reduce((t, s) => ({ input: t.input + (Number(s.input_nuclia_tokens) || 0), output: t.output + (Number(s.output_nuclia_tokens) || 0) }), { input: 0, output: 0 })
  const external = steps.filter((s) => s.external_usage).map((s) => s.external_usage)
  const contexts = run.frames.filter((f) => f.context).map((f) => f.context)
  const evidenceText = [
    ...steps.map((s) => `${s.value ?? ''}`),
    ...contexts.flatMap((c) => [c.summary ?? '', ...(c.chunks ?? []).map((ch) => ch.text ?? ''), JSON.stringify(c.structured ?? ''), JSON.stringify(c.json_objects ?? '')]),
  ].join('\n')
  const exception = run.frames.find((f) => f.exception)?.exception ?? null
  return {
    answer: answerFrame?.answer ?? '', modules: [...new Set(steps.map((s) => s.module))], iterations: steps.filter((s) => /Reactive iteration|Plan|Execution iteration/.test(s.title ?? '')).length,
    tool_calls: calls, mcp_calls: mcpCalls.length, step_errors: errors.map((s) => `${s.title}: ${String(s.error ?? s.reason).slice(0, 160)}`), mcp_errors: mcpErrors.length,
    nuclia_tokens: nuclia, external_usage: external, contexts: contexts.length, exception: exception ? JSON.stringify(exception).slice(0, 400) : null,
    timeout: run.frames.some((f) => f.timeout), evidence_text: evidenceText,
  }
}

// ---------------------------------------------------------------- scoring
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
  if (e.kind === 'electorates') return scorePublishedGold(q, answer, answered)
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

// ---------------------------------------------------------------- main
const results = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { runs: {} }
const save = () => { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(results, null, 1) + '\n') }
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null }

async function main() {
  const questions = GOLD.questions.filter((q) => !only || only.has(q.id))
  if (mode === 'i' || mode === 'ii') {
    const label = mode === 'i' ? 'i' : `ii:${opt('config', 'opax-spike-agent-mcp')}`
    const run = results.runs[label] ?? { design: mode, started: new Date().toISOString(), rows: {} }
    results.runs[label] = run
    let spent = Object.values(run.rows).reduce((s, r) => s + (r.or_usd ?? 0), 0)
    for (const q of questions) {
      if (spent > CAP_USD) { console.error(`stopping: spike spend ${spent.toFixed(3)} passed the cap`); break }
      const before = await orUsage()
      let row
      if (mode === 'i') {
        const out = await runI(q, Number(opt('port', '8970')))
        const p = out.payload ?? {}
        const evidence = (p.facts ?? []).map((f) => f.text).join('\n') + '\n' + (p.notes ?? []).join('\n')
        row = { id: q.id, ms: out.ms, status: out.status, answered: p.answered === true, reason: p.reason ?? null, answer: p.answer ?? '', answer_source: p.answer_source, shape: p.shape, steps: p.steps, timings: p.timings,
          tokens: p.tokens, token_usd: p.tokens ? p.tokens.input * PRICE.input + p.tokens.output * PRICE.output : null, facts: p.facts, notes: p.notes,
          score: score(q, p.answer, p.answered === true), grounding: grounding(p.answer, evidence) }
      } else {
        const out = await runII(q, opt('config', 'opax-spike-agent-mcp'))
        const s = summariseII(out)
        row = { id: q.id, ms: out.ms, first_answer_s: out.first_answer_s, answered: Boolean(s.answer), answer: s.answer, modules: s.modules, iterations: s.iterations, tool_calls: s.tool_calls, mcp_calls: s.mcp_calls,
          step_errors: s.step_errors, mcp_errors: s.mcp_errors, nuclia_tokens: s.nuclia_tokens, external_usage: s.external_usage, exception: s.exception, timeout: s.timeout,
          score: score(q, s.answer, Boolean(s.answer)), grounding: grounding(s.answer, s.evidence_text), frames: out.frames.length }
        fs.mkdirSync(path.join(OUT_DIR, 'frames'), { recursive: true })
        fs.writeFileSync(path.join(OUT_DIR, 'frames', `${label.replace(/[:/]/g, '_')}-${q.id}.ndjson`), out.frames.map((f) => JSON.stringify(f)).join('\n') + '\n')
      }
      await sleep(Number(opt('settle', '20000'))) // OpenRouter's usage counter lags about 15 s (measured 12 Oct)
      const after = await orUsage()
      row.or_usd = before !== null && after !== null ? +(after - before).toFixed(6) : null
      spent += row.or_usd ?? row.token_usd ?? 0
      run.rows[q.id] = row
      run.updated = new Date().toISOString()
      save()
      console.error(`${q.id} ${(row.ms / 1000).toFixed(1)}s pass=${row.score.pass} $${row.or_usd ?? '?'} ${JSON.stringify(row.score.checks)} ${String(row.answer).slice(0, 140).replace(/\s+/g, ' ')}`)
    }
  }
  // Drift-aware rescoring: the record moves while enrichment labels speeches, so a count is
  // right if it matches any gold snapshot taken across the run (--gold2 <file>, repeatable).
  const golds = [GOLD, ...args.flatMap((x, i) => (x === '--gold2' ? [JSON.parse(fs.readFileSync(path.resolve(args[i + 1]), 'utf8'))] : []))]
  if (golds.length > 1 || mode === 'score') {
    for (const run of Object.values(results.runs)) for (const row of Object.values(run.rows)) {
      const tries = golds.map((g, i) => ({ i, s: score(g.questions.find((q) => q.id === row.id), row.answer, row.answered) }))
      const best = tries.find((t) => t.s.pass) ?? tries[0]
      row.score = { ...best.s, snapshot: best.i, snapshots_passed: tries.filter((t) => t.s.pass).map((t) => t.i) }
    }
    results.gold_snapshots = golds.map((g) => g.generated)
  }
  // Summary table, every run.
  const table = {}
  for (const [label, run] of Object.entries(results.runs)) {
    const rows = Object.values(run.rows)
    if (!rows.length) continue
    const ms = rows.map((r) => r.ms)
    const g = rows.reduce((t, r) => ({ figures: t.figures + r.grounding.figures, traced: t.traced + r.grounding.traced, fs: t.fs + r.grounding.figure_sentences, cited: t.cited + r.grounding.cited }), { figures: 0, traced: 0, fs: 0, cited: 0 })
    const usd = rows.map((r) => r.or_usd).filter((x) => typeof x === 'number')
    const byKind = {}
    for (const r of rows) { const k = r.score.kind; byKind[k] = byKind[k] ?? { pass: 0, n: 0 }; byKind[k].n++; if (r.score.pass) byKind[k].pass++ }
    table[label] = {
      questions: rows.length, pass: rows.filter((r) => r.score.pass).length, accuracy: +(rows.filter((r) => r.score.pass).length / rows.length).toFixed(3), by_kind: byKind,
      wrong_leader: rows.filter((r) => r.score.kind === 'ranking' && r.answered && r.score.checks.top1_named === false).length,
      p50_s: +(pct(ms, 0.5) / 1000).toFixed(1), p95_s: +(pct(ms, 0.95) / 1000).toFixed(1), over_45s: rows.filter((r) => r.ms > 45000).length,
      usd_per_question_or: usd.length ? +(usd.reduce((a, b) => a + b, 0) / usd.length).toFixed(5) : null,
      usd_per_question_tokens: rows.some((r) => r.token_usd != null) ? +(rows.reduce((a, r) => a + (r.token_usd ?? 0), 0) / rows.length).toFixed(5) : null,
      usd_total_or: usd.length ? +usd.reduce((a, b) => a + b, 0).toFixed(4) : null,
      arag_tokens: rows.reduce((t, r) => t + (r.nuclia_tokens ? r.nuclia_tokens.input + r.nuclia_tokens.output : 0), 0),
      figures_traced: `${g.traced}/${g.figures}`, figure_sentences_cited: `${g.cited}/${g.fs}`,
      tool_call_failures: rows.filter((r) => (r.step_errors ?? []).length || r.exception || r.timeout || (r.steps ?? []).some((s) => !s.ok)).length,
      mcp_calls: rows.reduce((a, r) => a + (r.mcp_calls ?? 0), 0), mcp_errors: rows.reduce((a, r) => a + (r.mcp_errors ?? 0), 0),
      answered: rows.filter((r) => r.answered).length,
      // A decline is an honest non-answer; a wrong answer states a result the gold contradicts.
      declined: rows.filter((r) => !r.answered || DECLINE.test(r.answer ?? '')).length,
      wrong_answers: rows.filter((r) => r.answered && !DECLINE.test(r.answer ?? '') && !r.score.pass).map((r) => r.id),
    }
  }
  results.table = table
  results.gold = { generated: GOLD.generated, questions: GOLD.questions.length }
  results.price = PRICE
  save()
  console.log(JSON.stringify(table, null, 1))
}
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) await main()
