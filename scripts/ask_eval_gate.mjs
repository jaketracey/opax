#!/usr/bin/env node
// Serial Ask release gate. Uses the existing research grader without altering checks.
//   node scripts/ask_eval_gate.mjs http://127.0.0.1:8962 --out portal/private/gate-change-1
//   node scripts/ask_eval_gate.mjs https://staging.opax.com.au --operator \
//     --previous /path/to/baseline-results.json --out portal/private/gate-change-1
// Repeat the same command to resume. Use a new --out directory for a fresh run.
// SIGINT/SIGTERM finish and save the current request, then stop. An unsaved request
// after a hard kill is recorded as an error and charged the reserve, without a retry.
// The spend cap stops further requests once reached; one request can cross it.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ROOT, DEFAULT_PRICES, DEFAULT_TIMEOUT_MS, PROD_HOSTS, guardBase, loadQuestionsFile, loadRoster, runEval, spendOf } from './research_eval.mjs'

const GRADES = ['pass', 'partial', 'fail']
const HELP = `Usage: node scripts/ask_eval_gate.mjs HOST [options]
  --questions FILE       Default: scripts/ask_baseline/questions-v1-gate150.json
  --out DIR              Default: portal/private/ask-eval-gate; same DIR resumes
  --previous FILE        Baseline array, gate results, or research_eval report
  --previous-mode MODE   Research report mode to compare (default: current mode)
  --mode loop|planner    Default: loop; --operator selects the engine on the host
  --operator             Use DAILY_POST_OPERATOR_SECRET on /api/ask
  --spend-cap USD        Default: 14; reported cost, then estimates if missing
  --request-reserve USD  Default: 0.75; charge for responses with unknown cost
  --timeout MS          Default: 60000 (1000 to 120000)
  --interval MS         Delay between requests (0 to 10000, default: 0)
  --price-in USD        Input US$/million tokens for estimates (default: 0.44)
  --price-out USD       Output US$/million tokens for estimates (default: 1.32)
  --model SLUG          With --operator: x-opax-research-model, one of the host's
                        RESEARCH_LOOP_MODEL_ALLOW slugs (default: the host's model)
  --provider-sort SORT  With --operator: x-opax-research-provider, throughput|latency|price
Local HTTP or staging HTTPS only. Production is refused, including redirects.
Results: results.json; atomic checkpoint: in-progress.json. Completed IDs are
never retried. Resume requires the same host, mode, operator setting, questions
and cost settings; the spend cap may be increased. Use a new DIR for a new gate.
The cap can be exceeded by the last serial request. Errors are reported separately
from grades. No pass threshold is imposed. Exit 2 means the run is incomplete.
`

/** Allow staging.opax.com.au without opening the production escape hatch. */
export function guardGateBase(base) {
  const url = guardBase(base, { prod: true })
  const hostname = url.hostname.replace(/\.$/, '')
  if (PROD_HOSTS.test(hostname) && hostname !== 'staging.opax.com.au') throw new Error('Production hosts are refused by the Ask gate.')
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Pass a host URL without credentials, path, query or fragment.')
  return url.origin
}

export function parseArgs(argv) {
  const opts = {
    questionsFile: resolve(ROOT, 'scripts/ask_baseline/questions-v1-gate150.json'),
    out: resolve(ROOT, 'portal/private/ask-eval-gate'), mode: 'loop', operator: false,
    spendCap: 14, requestReserveUsd: 0.75, timeoutMs: DEFAULT_TIMEOUT_MS, intervalMs: 0,
    prices: { ...DEFAULT_PRICES },
  }
  const rest = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const value = () => {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value.`)
      return v
    }
    if (a === '--help' || a === '-h') return { help: true }
    if (a === '--operator') opts.operator = true
    else if (a === '--questions') opts.questionsFile = resolve(value())
    else if (a === '--out') opts.out = resolve(value())
    else if (a === '--previous') opts.previousFile = resolve(value())
    else if (a === '--mode') opts.mode = value()
    else if (a === '--previous-mode') opts.previousMode = value()
    else if (a === '--spend-cap') opts.spendCap = Number(value())
    else if (a === '--request-reserve') opts.requestReserveUsd = Number(value())
    else if (a === '--timeout') opts.timeoutMs = Number(value())
    else if (a === '--interval') opts.intervalMs = Number(value())
    else if (a === '--price-in') opts.prices.input = Number(value())
    else if (a === '--price-out') opts.prices.output = Number(value())
    else if (a === '--model') opts.model = value()
    else if (a === '--provider-sort') opts.providerSort = value()
    else if (a.startsWith('-')) throw new Error(`Unknown flag ${a}`)
    else rest.push(a)
  }
  if (rest.length !== 1) throw new Error('Pass one local or staging host URL. Use --help for options.')
  opts.base = guardGateBase(rest[0])
  validateOptions(opts)
  return opts
}

function validateOptions(opts) {
  if (!['loop', 'planner'].includes(opts.mode)) throw new Error('--mode must be loop or planner.')
  if (opts.previousMode !== undefined && !['loop', 'planner'].includes(opts.previousMode)) throw new Error('--previous-mode must be loop or planner.')
  for (const [name, n] of [['spend-cap', opts.spendCap], ['request-reserve', opts.requestReserveUsd]]) {
    if (!Number.isFinite(n) || n <= 0) throw new Error(`--${name} must be a positive US dollar amount.`)
  }
  if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs < 1000 || opts.timeoutMs > 120000) throw new Error('--timeout must be between 1000 and 120000 ms.')
  if (!Number.isFinite(opts.intervalMs) || opts.intervalMs < 0 || opts.intervalMs > 10000) throw new Error('--interval must be between 0 and 10000 ms.')
  if (Object.values(opts.prices).some(n => !Number.isFinite(n) || n < 0)) throw new Error('Prices must be finite non-negative numbers.')
  if (opts.model !== undefined && !/^[a-z0-9._-]+\/[a-z0-9._:-]+$/i.test(opts.model)) throw new Error('--model must be a model slug such as anthropic/claude-haiku-5.5.')
  if (opts.providerSort !== undefined && !['throughput', 'latency', 'price'].includes(opts.providerSort)) throw new Error('--provider-sort must be throughput, latency or price.')
  if ((opts.model !== undefined || opts.providerSort !== undefined) && !opts.operator) throw new Error('--model and --provider-sort need --operator.')
}

/** Per-request model selection headers. The host honours them only for operator evals and allowlisted slugs. */
export function modelHeaders({ model, providerSort } = {}) {
  return { ...(model ? { 'x-opax-research-model': model } : {}), ...(providerSort ? { 'x-opax-research-provider': providerSort } : {}) }
}

const gradeOf = row => typeof row?.grade === 'string' ? row.grade : row?.grade?.overall
const tally = rows => ({
  n: rows.length,
  ...Object.fromEntries(GRADES.map(g => [g, rows.filter(r => gradeOf(r) === g && !r.error).length])),
  errors: rows.filter(r => r.error || !GRADES.includes(gradeOf(r))).length,
})

export function summariseGate(rows, questions) {
  const groups = key => Object.fromEntries([...new Set(questions.map(q => q[key] ?? 'unclassified'))].sort().map(k => [k, tally(rows.filter(r => (r[key] ?? 'unclassified') === k))]))
  return { overall: tally(rows), by_stratum: groups('stratum'), by_family: groups('family') }
}

/** Accept the saved prod baseline, gate results and either mode of a research report. */
export function normaliseResults(data, mode = 'loop') {
  let rows
  if (Array.isArray(data)) rows = data
  else if (Array.isArray(data?.rows)) rows = data.rows
  else if (Array.isArray(data?.questions)) rows = data.questions.flatMap(q => {
    if (!q.by_mode) return [q]
    const r = q.by_mode[mode]
    return r ? [{ ...q, ...r, id: q.id }] : []
  })
  else throw new Error('Previous results must be a baseline array, {rows}, or a research_eval report.')
  const seen = new Set(), out = []
  for (const row of rows) {
    if (row.mode && row.mode !== mode) continue
    if (typeof row.id !== 'string') throw new Error('A previous result has no question id.')
    if (seen.has(row.id)) throw new Error(`Duplicate previous result: ${row.id} (${mode})`)
    seen.add(row.id)
    if (!row.error && GRADES.includes(gradeOf(row))) out.push({ ...row, grade: gradeOf(row) })
  }
  return out
}

function diffCounts(pairs) {
  const before = tally(pairs.map(p => ({ grade: p.before }))), after = tally(pairs.map(p => ({ grade: p.after })))
  return {
    n: pairs.length, before, after,
    delta: Object.fromEntries(GRADES.map(g => [g, after[g] - before[g]])),
    improved: pairs.filter(p => GRADES.indexOf(p.after) < GRADES.indexOf(p.before)).length,
    regressed: pairs.filter(p => GRADES.indexOf(p.after) > GRADES.indexOf(p.before)).length,
    unchanged: pairs.filter(p => p.after === p.before).length,
  }
}

export function diffResults(rows, previous, mode = 'loop') {
  const prior = new Map(normaliseResults(previous, mode).map(r => [r.id, r]))
  const graded = rows.filter(r => !r.error && GRADES.includes(gradeOf(r)))
  const pairs = graded.filter(r => prior.has(r.id)).map(r => ({ id: r.id, stratum: r.stratum ?? 'unclassified', family: r.family ?? 'unclassified', before: prior.get(r.id).grade, after: gradeOf(r) }))
  const groups = key => Object.fromEntries([...new Set(pairs.map(p => p[key]))].sort().map(k => [k, diffCounts(pairs.filter(p => p[key] === k))]))
  return {
    ...diffCounts(pairs), missing_previous: graded.length - pairs.length,
    current_errors: rows.length - graded.length,
    by_stratum: groups('stratum'), by_family: groups('family'),
    changes: pairs.filter(p => p.before !== p.after),
  }
}

const signed = n => `${n > 0 ? '+' : ''}${n}`
export function renderSummary(report) {
  const { summary, diff } = report
  const lines = [`${summary.overall.n}/${report.total_questions} attempted; ${report.total_questions - summary.overall.n} pending; stopped: ${report.stopped ?? 'complete'}; spend US$${report.spent.toFixed(4)}`, '']
  const table = (label, groups) => {
    lines.push(`${label}\tN\tpass\tpartial\tfail\terrors`)
    for (const [k, c] of Object.entries(groups)) lines.push([k, c.n, c.pass, c.partial, c.fail, c.errors].join('\t'))
    lines.push('')
  }
  table('Overall', { all: summary.overall })
  table('Stratum', summary.by_stratum)
  table('Family', summary.by_family)
  if (diff) {
    lines.push(`Previous diff: ${diff.n} matching graded IDs; ${diff.improved} improved, ${diff.regressed} regressed, ${diff.unchanged} unchanged; ${diff.missing_previous} without a previous grade; ${diff.current_errors} current errors excluded.`, '')
    for (const [label, groups] of [['Overall', { all: diff }], ['Stratum', diff.by_stratum], ['Family', diff.by_family]]) {
      lines.push(`${label} diff\tmatched\tpass delta\tpartial delta\tfail delta\timproved\tregressed`)
      for (const [k, c] of Object.entries(groups)) lines.push([k, c.n, ...GRADES.map(g => signed(c.delta[g])), c.improved, c.regressed].join('\t'))
      lines.push('')
    }
  }
  return lines.join('\n')
}

async function readCheckpoint(file) {
  try { return JSON.parse(await readFile(file, 'utf8')) }
  catch (e) { if (e.code === 'ENOENT') return null; throw e }
}

async function writeJson(file, value) {
  await writeFile(file + '.tmp', JSON.stringify(value, null, 2) + '\n')
  await rename(file + '.tmp', file)
}

export async function runGate(options) {
  const opts = { mode: 'loop', operator: false, prices: { ...DEFAULT_PRICES }, spendCap: 14, requestReserveUsd: 0.75, timeoutMs: DEFAULT_TIMEOUT_MS, intervalMs: 0, ...options }
  validateOptions(opts)
  const base = guardGateBase(opts.base), questions = opts.questions
  if (!Array.isArray(questions) || !questions.length) throw new Error('The gate needs a non-empty questions file.')
  const byId = new Map()
  for (const q of questions) {
    if (typeof q?.id !== 'string' || !q.id || typeof q.question !== 'string' || !q.question.trim()) throw new Error('Every question needs an id and question text.')
    if (byId.has(q.id)) throw new Error(`Duplicate question id: ${q.id}`)
    byId.set(q.id, q)
  }
  if (opts.operator && !opts.secret) throw new Error('DAILY_POST_OPERATOR_SECRET must be set for --operator.')
  // Validate a comparison before spending anything. Compare only matching IDs later.
  if (opts.previous !== undefined) normaliseResults(opts.previous, opts.previousMode ?? opts.mode)
  const config = {
    base, mode: opts.mode, operator: opts.operator,
    questions_sha256: createHash('sha256').update(JSON.stringify(questions)).digest('hex'),
    prices: opts.prices, request_reserve_usd: opts.requestReserveUsd,
    // Only present when set, so checkpoints written before these flags still resume.
    ...(opts.model ? { model: opts.model } : {}), ...(opts.providerSort ? { provider_sort: opts.providerSort } : {}),
  }
  const out = resolve(opts.out), checkpointFile = resolve(out, 'in-progress.json')
  const saved = await readCheckpoint(checkpointFile)
  if (saved && (saved.schema !== 1 || JSON.stringify(saved.config) !== JSON.stringify(config))) throw new Error('Checkpoint settings or questions differ. Use the original settings or a new --out directory.')
  const rows = saved?.rows ?? []
  if (!Array.isArray(rows)) throw new Error('Checkpoint rows must be an array.')
  const completed = new Set()
  for (const row of rows) {
    if (!byId.has(row.id) || row.mode !== opts.mode || completed.has(row.id)) throw new Error('Checkpoint contains an unknown, duplicate or mismatched row.')
    completed.add(row.id)
  }
  let spent = rows.reduce((n, row) => n + spendOf(row.usage, opts.requestReserveUsd), 0)
  if (saved && saved.spent !== spent) throw new Error('Checkpoint spend does not match its rows.')
  if (saved?.in_flight) {
    const q = byId.get(saved.in_flight.id)
    if (!q || completed.has(q.id)) throw new Error('Checkpoint has an invalid in-flight question.')
    rows.push({ id: q.id, mode: opts.mode, kind: q.kind, family: q.family, stratum: q.stratum, error: 'interrupted before response was saved', ms: 0 })
    completed.add(q.id)
    spent += opts.requestReserveUsd
  }
  await mkdir(out, { recursive: true })
  const generated = saved?.generated ?? new Date().toISOString()
  const checkpoint = async (in_flight = null, stopped = null) => writeJson(checkpointFile, { schema: 1, config, generated, updated: new Date().toISOString(), rows, spent, in_flight, stopped })
  await checkpoint()
  const { roster, parties } = opts.roster ? { roster: opts.roster, parties: opts.parties ?? new Map() } : await loadRoster()
  const pending = questions.filter(q => !completed.has(q.id)), extraHeaders = modelHeaders(opts)
  let stopped = null
  for (const q of pending) {
    if (opts.shouldStop?.()) { stopped = 'interrupted'; break }
    if (spent >= opts.spendCap) { stopped = 'spend_cap'; break }
    await checkpoint({ id: q.id })
    const fetchImpl = opts.fetchImpl ?? fetch
    const result = await runEval({
      questions: [q], modes: [opts.mode], limit: 1, bases: { [opts.mode]: base },
      route: 'ask', operator: opts.operator, secret: opts.secret,
      prices: opts.prices, requestReserveUsd: opts.requestReserveUsd, timeoutMs: opts.timeoutMs, roster, parties,
      // Redirects cannot move a staging evaluation onto production.
      fetchImpl: (url, init) => fetchImpl(url, { ...init, headers: { ...init?.headers, ...extraHeaders }, redirect: 'error' }),
    })
    const row = { ...result.rows[0], family: q.family, stratum: q.stratum, question: q.question }
    rows.push(row)
    spent += result.report.spent_usd
    await checkpoint()
    await opts.onRow?.({ row, rows, spent })
    if (opts.intervalMs && q !== pending.at(-1) && !opts.shouldStop?.() && spent < opts.spendCap) await new Promise(resolve => setTimeout(resolve, opts.intervalMs))
  }
  await checkpoint(null, stopped)
  const report = {
    schema: 1, config, generated, updated: new Date().toISOString(), questions_file: opts.questionsFile ?? null,
    total_questions: questions.length, spent, stopped, rows, summary: summariseGate(rows, questions),
    diff: opts.previous === undefined ? null : diffResults(rows, opts.previous, opts.previousMode ?? opts.mode),
  }
  await writeJson(resolve(out, 'results.json'), report)
  return report
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) { console.log(HELP); return }
  const questions = await loadQuestionsFile(opts.questionsFile)
  const previous = opts.previousFile ? JSON.parse(await readFile(opts.previousFile, 'utf8')) : undefined
  let interrupted = false
  const stop = () => { interrupted = true }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  try {
    const report = await runGate({ ...opts, questions, previous, secret: process.env.DAILY_POST_OPERATOR_SECRET, shouldStop: () => interrupted,
      onRow: ({ row, spent }) => console.log(JSON.stringify({ id: row.id, grade: row.grade?.overall ?? null, error: row.error ?? null, ms: row.ms, spent })),
    })
    console.log(renderSummary(report))
    console.log(`Results: ${resolve(opts.out, 'results.json')}`)
    if (report.stopped) process.exitCode = 2
  } finally {
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(`Ask gate did not finish: ${e.message}`); process.exitCode = 1 })
}
