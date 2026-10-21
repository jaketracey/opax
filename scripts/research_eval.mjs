#!/usr/bin/env node
// Research-loop eval harness (briefs/research-loop-contract.md, evals lane).
//
// Runs portal/test/fixtures/research-evals.json (and, with --set gold|all, the agentic gold set)
// against an Ask server, grades every answer deterministically (scripts/research_eval_grade.mjs),
// records latency, tokens and estimated US$ cost (p50 / p95), and writes a JSON and a markdown
// report under portal/private/research-evals/ with old and new answers side by side.
//
//   node scripts/research_eval.mjs http://127.0.0.1:8962 --mode both --limit 13
//   node scripts/research_eval.mjs --fixture portal/test/fixtures/research-evals-canned.json --mode both   # offline
//
// Flags: --mode planner|loop|both (both) · --limit N (12, max 200) · --set research|gold|all|routing (research)
//        --route auto|ops|ask (auto) · --planner-base URL · --loop-base URL · --fixture FILE · --out DIR
//        --price-in / --price-out US$ per million tokens (0.44 / 1.32, the BYOK DeepSeek rate) · --timeout ms · --prod · --operator
//
// Hard limits: one request per question per mode, never a retry; --limit caps the questions; the run
// refuses opax.com.au unless --prod is passed; HTTPS or local http only; reserved ports 8910/8961 refused.
// --prod / --operator select the engine per request on /api/ask using the existing
// operator bearer guard and x-opax-research: old|loop. The secret is never reported.
// Local non-operator runs can still use separately configured fixture servers.
// Outside operator mode, auto = the bearer ops route (/api/ops/ask-gold, DAILY_POST_OPERATOR_SECRET) for gold rows and
// questions the route classifier accepts; /api/ask for ordinary questions. A 409 is recorded, not re-sent.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { gradeRow, usageOf, summarise, renderMarkdown, fold } from './research_eval_grade.mjs'

const here = dirname(fileURLToPath(import.meta.url))
export const ROOT = resolve(here, '..')
export const DEFAULT_LIMIT = 12, MAX_LIMIT = 200, DEFAULT_TIMEOUT_MS = 60_000
export const DEFAULT_PRICES = { input: 0.44, output: 1.32 }
export const PROD_HOSTS = /(^|\.)opax\.com\.au$/i
export const LEGACY_PERIOD = /\b(?:this term|last term|since|(?:19|20)\d{2}s?)\b/i

export function parseArgs(argv) {
  const opts = { mode: 'both', limit: DEFAULT_LIMIT, set: 'research', route: 'auto', prod: false, operator: false, prices: { ...DEFAULT_PRICES }, timeoutMs: DEFAULT_TIMEOUT_MS, out: resolve(ROOT, 'portal/private/research-evals') }
  const rest = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const val = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v }
    if (a === '--prod') opts.prod = true
    else if (a === '--baseline-loop') opts.baselineLoop = true
    else if (a === '--spend-cap') opts.spendCap = Number(val())
    else if (a === '--operator') opts.operator = true
    else if (a === '--mode') opts.mode = val()
    else if (a === '--limit') opts.limit = Number(val())
    else if (a === '--set') opts.set = val()
    else if (a === '--route') opts.route = val()
    else if (a === '--fixture') opts.fixture = resolve(val())
    else if (a === '--out') opts.out = resolve(val())
    else if (a === '--planner-base') opts.plannerBase = val()
    else if (a === '--loop-base') opts.loopBase = val()
    else if (a === '--price-in') opts.prices.input = Number(val())
    else if (a === '--price-out') opts.prices.output = Number(val())
    else if (a === '--timeout') opts.timeoutMs = Number(val())
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`)
    else rest.push(a)
  }
  if (rest.length > 1) throw new Error('Pass one base URL.')
  opts.base = rest[0]
  if (!['planner', 'loop', 'both'].includes(opts.mode)) throw new Error('--mode must be planner, loop or both.')
  if (!['research', 'gold', 'all', 'routing'].includes(opts.set)) throw new Error('--set must be research, gold or all.')
  if (!['auto', 'ops', 'ask'].includes(opts.route)) throw new Error('--route must be auto, ops or ask.')
  if (!Number.isInteger(opts.limit) || opts.limit < 1 || opts.limit > MAX_LIMIT) throw new Error(`--limit must be an integer from 1 to ${MAX_LIMIT}.`)
  if (opts.spendCap !== undefined && (!Number.isFinite(opts.spendCap) || opts.spendCap <= 0)) throw new Error('--spend-cap must be a positive US dollar amount.')
  if (!(opts.prices.input >= 0 && opts.prices.output >= 0)) throw new Error('Prices must be non-negative numbers.')
  if (!(opts.timeoutMs >= 1000 && opts.timeoutMs <= 120_000)) throw new Error('--timeout must be between 1000 and 120000 ms.')
  if (!opts.fixture && !opts.base) throw new Error('Pass a base URL, or --fixture for an offline run.')
  opts.modes = opts.mode === 'both' ? ['planner', 'loop'] : [opts.mode]
  return opts
}

/** HTTPS or local http only; reserved fixture ports refused; opax.com.au needs --prod. */
export function guardBase(base, { prod = false } = {}) {
  let u
  try { u = new URL(base) } catch { throw new Error('The base URL is not a URL.') }
  const local = u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)
  if (u.protocol !== 'https:' && !local) throw new Error('Use HTTPS or a local http host.')
  if ([8910, 8961].includes(Number(u.port))) throw new Error('Reserved fixture port.')
  if (PROD_HOSTS.test(u.hostname) && !prod) throw new Error('Refusing to run against production without --prod.')
  return u
}

export async function loadQuestions(set) {
  if (set === 'routing') return JSON.parse(await readFile(resolve(ROOT, 'portal/test/fixtures/ask-routing-evals.json'), 'utf8')).questions
  const list = []
  if (set !== 'gold') {
    const f = JSON.parse(await readFile(resolve(ROOT, 'portal/test/fixtures/research-evals.json'), 'utf8'))
    list.push(...f.questions.map((q) => ({ ...q, set: 'research' })))
  }
  if (set !== 'research') {
    const g = JSON.parse(await readFile(resolve(ROOT, 'portal/test/fixtures/agentic-ask-gold.json'), 'utf8'))
    list.push(...g.questions.map((q) => ({ ...q, set: 'gold', gold: true, kind: 'gold', shape: q.category, old_route: q.category === 'electorates' ? 'electorate-data' : q.category, expected_tools: [] })))
  }
  return list
}

export async function loadRoster(file = resolve(ROOT, 'portal/public/parliamentarians.json')) {
  const d = JSON.parse(await readFile(file, 'utf8'))
  const people = (Array.isArray(d) ? d : d.people ?? []).filter((p) => p && typeof p.name === 'string')
  return { roster: people.map((p) => p.name), parties: new Map(people.map((p) => [fold(p.name), p.party_now ?? p.party ?? null])) }
}

/** The one request a (question, mode) pair sends. */
export function requestFor(q, mode, { route = 'auto', secret, baselineLoop = false, operator = false, prod = false } = {}) {
  const override = operator || prod
  const ops = !override && (route === 'ops' || (route === 'auto' && Boolean(secret) && (q.gold === true || q.old_route !== 'ordinary')))
  const body = { question: q.question, ...(q.request ?? {}) }
  // Legacy gold defines unstated periods as whole-record (scripts/agentic_ask_shadow.mjs).
  if (q.gold && !LEGACY_PERIOD.test(q.question) && body.period === undefined) body.period = 'all'
  const headers = { 'content-type': 'application/json', accept: 'application/json', 'x-opax-nocache': '1' }
  if (override || ops) {
    if (!secret) throw new Error('DAILY_POST_OPERATOR_SECRET must be set for the ops route.')
    headers.authorization = 'Bearer ' + secret
  }
  if (override) headers['x-opax-research'] = mode === 'loop' || baselineLoop ? 'loop' : 'old'
  return { path: ops ? '/api/ops/ask-gold' : '/api/ask', body, headers }
}

/** Exactly one fetch. Any failure becomes an error row; nothing is re-sent. */
export async function runOne({ q, mode, base, route, secret, baselineLoop, operator, prod, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const { path, body, headers } = requestFor(q, mode, { route, secret, baselineLoop, operator, prod })
  const t0 = performance.now()
  const elapsed = () => Math.round(performance.now() - t0)
  try {
    const res = await fetchImpl(new URL(path, base), { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })
    const ms = elapsed()
    if (!res.ok) return { route: path, ms, error: `HTTP ${res.status}` }
    const payload = await res.json()
    return { route: path, ms, payload }
  } catch (e) {
    return { route: path, ms: elapsed(), error: e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : 'network' }
  }
}

export async function runEval(opts) {
  const { questions, modes, prices = DEFAULT_PRICES, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch, fixture, limit = DEFAULT_LIMIT, roster = [], parties = new Map() } = opts
  const picked = questions.slice(0, limit)
  const rows = []
  let spent = 0, stopped = null
  for (const q of picked) {
    for (const mode of modes) {
      if (!fixture && spent + 0.75 > (opts.spendCap ?? 14)) { stopped = 'spend_cap'; break }
      let r
      if (fixture) {
        const hit = fixture.find((x) => x.id === q.id && (x.mode ?? mode) === mode)
        r = hit ? { route: 'fixture', ms: hit.ms ?? 0, server_ms: hit.server_ms ?? null, payload: hit.payload, error: hit.error } : { route: 'fixture', ms: 0, error: 'missing fixture' }
      } else {
        r = await runOne({ q, mode, base: opts.bases[mode], route: opts.route, secret: opts.secret, baselineLoop: opts.baselineLoop, operator: opts.operator, prod: opts.prod, fetchImpl, timeoutMs })
      }
      const row = { id: q.id, set: q.set, kind: q.kind, mode, route: r.route, ms: r.ms, server_ms: r.server_ms ?? r.payload?.research?.ms ?? r.payload?.agentic?.ms ?? null }
      if (r.error || !r.payload || typeof r.payload !== 'object') row.error = r.error ?? 'empty payload'
      else {
        row.answer = String(r.payload.answer ?? '')
        row.usage = usageOf(r.payload, prices)
        row.grade = gradeRow(q, r.payload, { roster, parties })
        row.payload = r.payload
      }
      rows.push(row)
      spent += fixture ? 0 : row.usage?.cost_usd ?? 0.75
      await opts.onRow?.({ row, rows, spent })
    }
    if (stopped) break
  }
  const summary = summarise(rows)
  const report = {
    generated: new Date().toISOString(), spent_upper_estimate: spent, stopped, base_host: opts.baseHost ?? null, set: opts.set ?? 'research', modes, limit, prices, summary,
    questions: picked.map((q) => ({ id: q.id, kind: q.kind, shape: q.shape ?? null, question: q.question, old_route: q.old_route ?? null, expected_tools: q.expected_tools ?? [], rubric: q.rubric ?? null, by_mode: Object.fromEntries(modes.map((m) => [m, rows.find((r) => r.id === q.id && r.mode === m) ?? null])) })),
  }
  return { rows, summary, report }
}

export async function writeReports(report, outDir, stamp = report.generated.replace(/[:.]/g, '-')) {
  await mkdir(outDir, { recursive: true })
  const name = `${stamp}-${report.set}-${report.modes.join('+')}`
  const json = resolve(outDir, `${name}.json`), md = resolve(outDir, `${name}.md`)
  await writeFile(json, JSON.stringify(report, null, 2) + '\n')
  await writeFile(md, renderMarkdown(report))
  return { json, md }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  let fixture, bases = {}, baseHost = null
  if (opts.fixture) {
    const f = JSON.parse(await readFile(opts.fixture, 'utf8'))
    fixture = Array.isArray(f) ? f : Array.isArray(f.rows) ? f.rows : null
    if (!fixture) throw new Error('The fixture must be an array of {id, mode, payload} rows, or {rows: [...]}.')
  } else {
    const main = guardBase(opts.base, opts)
    bases.planner = guardBase(opts.plannerBase ?? opts.base, opts).href
    bases.loop = guardBase(opts.loopBase ?? opts.base, opts).href
    baseHost = main.host
  }
  const secret = process.env.DAILY_POST_OPERATOR_SECRET
  if (!fixture && (opts.route === 'ops' || opts.operator || opts.prod) && !secret) throw new Error('DAILY_POST_OPERATOR_SECRET must be set for operator evaluation.')
  const questions = await loadQuestions(opts.set)
  const { roster, parties } = await loadRoster()
  await mkdir(opts.out, { recursive: true })
  const onRow = async ({ row, rows, spent }) => { await writeFile(resolve(opts.out, 'in-progress.json'), JSON.stringify({ rows, spent }, null, 2)); console.log(JSON.stringify({ id: row.id, mode: row.mode, grade: row.grade?.overall, ms: row.ms, spent })) }
  const { report, summary } = await runEval({ onRow: fixture ? undefined : onRow, spendCap: opts.spendCap, baselineLoop: opts.baselineLoop, questions, modes: opts.modes, bases, baseHost, route: opts.route, secret, operator: opts.operator, prod: opts.prod, fixture, limit: opts.limit, prices: opts.prices, timeoutMs: opts.timeoutMs, roster, parties, set: opts.set })
  const written = await writeReports(report, opts.out)
  // Counts only on stdout: no question or answer text.
  const brief = Object.fromEntries(Object.entries(summary).map(([m, s]) => [m, { n: s.n, errors: s.errors, pass: s.overall.pass, partial: s.overall.partial, fail: s.overall.fail, p50_ms: s.latency_ms.p50, p95_ms: s.latency_ms.p95, mean_cost_usd: s.cost_usd.mean }]))
  console.log(JSON.stringify({ questions: report.questions.length, modes: opts.modes, summary: brief, written }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`Research eval did not run: ${e?.message ?? 'unknown error'}`); process.exitCode = 1 })
}
