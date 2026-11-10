import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gradeRow } from '../../scripts/research_eval_grade.mjs'
import { parseArgs, guardGateBase, runGate, summariseGate, normaliseResults, diffResults, renderSummary } from '../../scripts/ask_eval_gate.mjs'

const source = JSON.parse(await readFile(new URL('../../scripts/ask_baseline/questions-v1.json', import.meta.url), 'utf8'))
const questions = ['politician.electorate', 'date.financial_year', 'negative.false_premise'].map(f => ({ set: 'file', ...source.questions.find(q => q.family === f) }))
const base = 'http://127.0.0.1:8963'
const opts = { base, questions, roster: [] }
const payload = q => ({ answer: q.expected.answer, sources: [], research: { cost_usd: 0.02 } })
const mockFetch = async (_url, init) => Response.json(payload(questions.find(q => q.question === JSON.parse(init.body).question)))
const withDir = async fn => {
  const out = await mkdtemp(join(tmpdir(), 'ask-gate-'))
  try { await fn(out) } finally { await rm(out, { recursive: true, force: true }) }
}

test('CLI accepts local or staging hosts, refuses production, and validates cost settings', () => {
  assert.equal(guardGateBase('https://staging.opax.com.au'), 'https://staging.opax.com.au')
  assert.equal(guardGateBase('https://example-staging.workers.dev'), 'https://example-staging.workers.dev')
  for (const url of ['https://opax.com.au', 'https://www.opax.com.au', 'https://OPAX.com.au', 'https://opax.com.au.', 'http://example.com', 'http://localhost:8910', 'https://secret@example.com', `${base}/api/ask`, `${base}/?secret=x`]) assert.throws(() => guardGateBase(url))
  const parsed = parseArgs([base, '--previous', 'old.json', '--operator', '--mode', 'planner', '--spend-cap', '0.5'])
  assert.equal(parsed.mode, 'planner')
  assert.equal(parsed.operator, true)
  assert.equal(parsed.spendCap, 0.5)
  assert.match(parsed.questionsFile, /questions-v1-gate150.json$/)
  assert.deepEqual(parseArgs(['--help']), { help: true })
  for (const args of [[], [base, '--prod'], [base, '--spend-cap', 'NaN'], [base, '--request-reserve', '-1'], [base, '--price-in', 'Infinity'], [base, '--timeout', '0'], [base, '--interval', '10001'], [base, '--mode', 'both'], [base, '--previous-mode', 'both'], [base, '--questions']]) assert.throws(() => parseArgs(args))
})

test('requests are serial and resume from saved IDs and costs after a spend stop', async () => withDir(async out => {
  let active = 0, maximum = 0
  const ids = []
  const fetchImpl = async (url, init) => {
    active++
    maximum = Math.max(maximum, active)
    const q = questions.find(q => q.question === JSON.parse(init.body).question)
    ids.push(q.id)
    assert.equal(String(url), base + '/api/ask')
    assert.equal(init.redirect, 'error')
    assert.equal(init.headers.authorization, 'Bearer test-secret')
    assert.equal(init.headers['x-opax-research'], 'loop')
    await Promise.resolve()
    active--
    return Response.json(payload(q))
  }
  const runOpts = { ...opts, out, fetchImpl, operator: true, secret: 'test-secret' }
  const first = await runGate({ ...runOpts, spendCap: 0.03 })
  assert.equal(first.rows.length, 2)
  assert.equal(first.spent, 0.04)
  assert.equal(first.stopped, 'spend_cap')
  const saved = JSON.parse(await readFile(join(out, 'in-progress.json'), 'utf8'))
  assert.equal(saved.spent, first.spent)
  assert.equal(saved.in_flight, null)
  assert.equal(saved.stopped, 'spend_cap')
  assert.ok(!(await readFile(join(out, 'in-progress.json'), 'utf8')).includes('test-secret'))
  const second = await runGate({ ...runOpts, spendCap: 0.1 })
  assert.equal(maximum, 1)
  assert.deepEqual(ids, questions.map(q => q.id))
  assert.equal(second.rows.length, 3)
  assert.equal(second.spent, 0.06)
  assert.equal(second.stopped, null)
  assert.deepEqual(second.rows.slice(0, 2), first.rows)
  for (const row of second.rows) assert.deepEqual(row.grade, gradeRow(questions.find(q => q.id === row.id), payload(questions.find(q => q.id === row.id))))
  const done = await runGate({ ...runOpts, spendCap: 0.1, fetchImpl: () => assert.fail('completed gate must not send requests') })
  assert.deepEqual(done.rows, second.rows)
  assert.deepEqual((await readdir(out)).sort(), ['in-progress.json', 'results.json'])
}))

test('a graceful stop saves the current row and resumes at the next question', async () => withDir(async out => {
  let stop = false
  const first = await runGate({ ...opts, out, fetchImpl: mockFetch, shouldStop: () => stop, onRow: () => { stop = true } })
  assert.equal(first.stopped, 'interrupted')
  assert.equal(first.rows.length, 1)
  const resumed = await runGate({ ...opts, out, fetchImpl: mockFetch })
  assert.equal(resumed.stopped, null)
  assert.equal(resumed.rows.length, 3)
}))

test('a hard kill cannot silently retry or forget the cost of an unsaved request', async () => withDir(async out => {
  await assert.rejects(runGate({ ...opts, out, fetchImpl: mockFetch, onRow: () => { throw new Error('simulated hard kill') } }), /hard kill/)
  const file = join(out, 'in-progress.json')
  const saved = JSON.parse(await readFile(file, 'utf8'))
  saved.in_flight = { id: questions[1].id }
  await writeFile(file, JSON.stringify(saved))
  const resumed = await runGate({ ...opts, out, spendCap: 0.5, fetchImpl: () => assert.fail('unknown in-flight spend exceeds the cap') })
  assert.equal(resumed.rows.length, 2)
  assert.equal(resumed.rows[1].id, questions[1].id)
  assert.match(resumed.rows[1].error, /interrupted/)
  assert.equal(resumed.spent, 0.77)
  assert.equal(resumed.summary.overall.errors, 1)
  assert.equal(resumed.stopped, 'spend_cap')
  const final = await runGate({ ...opts, out, spendCap: 2, fetchImpl: mockFetch })
  assert.equal(final.rows.length, 3)
  assert.equal(final.summary.overall.errors, 1)
}))

test('resume refuses changed questions, host, engine or accounting before sending requests', async () => withDir(async out => {
  await runGate({ ...opts, out, spendCap: 0.01, fetchImpl: mockFetch })
  const fetchImpl = () => assert.fail('incompatible checkpoint must not fetch')
  for (const changed of [
    { base: 'http://localhost:8963' }, { mode: 'planner' }, { operator: true, secret: 's' },
    { questions: [{ ...questions[0], must: [] }, ...questions.slice(1)] },
    { requestReserveUsd: 0.1 }, { prices: { input: 1, output: 3 } },
  ]) await assert.rejects(runGate({ ...opts, out, fetchImpl, ...changed }), /Checkpoint settings/)
  const file = join(out, 'in-progress.json'), saved = JSON.parse(await readFile(file, 'utf8'))
  saved.spent = 0
  await writeFile(file, JSON.stringify(saved))
  await assert.rejects(runGate({ ...opts, out, fetchImpl }), /spend does not match/)
}))

test('invalid questions and invalid previous results fail before spending', async () => withDir(async out => {
  const fetchImpl = () => assert.fail('invalid input must not fetch')
  await assert.rejects(runGate({ ...opts, out, fetchImpl, questions: [...questions, questions[0]] }), /Duplicate question/)
  await assert.rejects(runGate({ ...opts, out, fetchImpl, previous: { summary: {} } }), /Previous results/)
  await assert.rejects(runGate({ ...opts, out, fetchImpl, operator: true }), /SECRET/)
}))

const rows = [
  { id: 'a', family: 'politician.party', stratum: 'named_politician', grade: { overall: 'pass' } },
  { id: 'b', family: 'politician.party', stratum: 'named_politician', grade: { overall: 'fail' } },
  { id: 'c', family: 'negative.no_record', stratum: 'negative_adversarial', grade: { overall: 'partial' } },
  { id: 'new', family: 'negative.no_record', stratum: 'negative_adversarial', grade: { overall: 'pass' } },
  { id: 'error', family: 'negative.no_record', stratum: 'negative_adversarial', error: 'HTTP 503' },
]
// Same fields as .ops/plans/ask-v1/baseline-results.json; the full baseline has 1,000 rows.
const previous = [
  { id: 'a', family: 'politician.party', stratum: 'named_politician', question: 'Which party?', grade: 'partial', failed_checks: [], tools: ['find_people'], answer: 'Labor.' },
  { id: 'b', grade: 'pass' }, { id: 'c', grade: 'partial' }, { id: 'error', grade: 'pass' }, { id: 'not-in-gate', grade: 'fail' },
]

test('baseline and research reports compare the same overlapping graded IDs', () => {
  const research = { questions: previous.map(r => ({ id: r.id, kind: r.family, by_mode: { loop: { id: r.id, mode: 'loop', grade: { overall: r.grade } }, planner: { id: r.id, mode: 'planner', grade: { overall: 'fail' } } } })) }
  const diff = diffResults(rows, previous)
  assert.deepEqual(diffResults(rows, research), diff)
  assert.equal(diff.n, 3)
  assert.equal(diff.improved, 1)
  assert.equal(diff.regressed, 1)
  assert.equal(diff.unchanged, 1)
  assert.equal(diff.missing_previous, 1)
  assert.equal(diff.current_errors, 1)
  assert.deepEqual(diff.before, { n: 3, pass: 1, partial: 2, fail: 0, errors: 0 })
  assert.deepEqual(diff.after, { n: 3, pass: 1, partial: 1, fail: 1, errors: 0 })
  assert.deepEqual(diff.delta, { pass: 0, partial: -1, fail: 1 })
  assert.equal(diff.by_family['politician.party'].n, 2)
  assert.equal(diff.by_stratum.negative_adversarial.unchanged, 1)
  assert.deepEqual(diff.changes.map(p => p.id), ['a', 'b'])
  assert.equal(diffResults(rows, research, 'planner').regressed, 0)
  assert.deepEqual(normaliseResults({ rows: [{ id: 'a', mode: 'loop', grade: { overall: 'pass' } }, { id: 'a', mode: 'planner', grade: { overall: 'fail' } }] }).map(r => r.grade), ['pass'])
  assert.throws(() => normaliseResults([...previous, previous[0]]), /Duplicate previous/)
})

test('printed summaries include grade counts and matched diffs by stratum and family', () => {
  const allQuestions = [...rows, { id: 'pending', stratum: 'money', family: 'money.pay' }]
  const summary = summariseGate(rows, allQuestions)
  assert.deepEqual(summary.overall, { n: 5, pass: 2, partial: 1, fail: 1, errors: 1 })
  assert.deepEqual(summary.by_family['money.pay'], { n: 0, pass: 0, partial: 0, fail: 0, errors: 0 })
  const text = renderSummary({ total_questions: 6, spent: 0.12, stopped: 'spend_cap', summary, diff: diffResults(rows, previous) })
  assert.match(text, /5\/6 attempted; 1 pending/)
  assert.match(text, /Stratum\tN\tpass\tpartial\tfail\terrors/)
  assert.match(text, /Family\tN\tpass\tpartial\tfail\terrors/)
  assert.match(text, /politician.party\t2\t1\t0\t1\t0/)
  assert.match(text, /Previous diff: 3 matching graded IDs; 1 improved, 1 regressed/)
  assert.match(text, /Family diff\tmatched\tpass delta/)
})

test('--model and --provider-sort send operator model headers and pin the checkpoint', async () => withDir(async out => {
  const parsed = parseArgs([base, '--operator', '--model', 'anthropic/claude-haiku-5.5', '--provider-sort', 'latency'])
  assert.equal(parsed.model, 'anthropic/claude-haiku-5.5')
  assert.equal(parsed.providerSort, 'latency')
  for (const args of [[base, '--model', 'anthropic/claude-haiku-5.5'], [base, '--operator', '--model', 'not a slug'], [base, '--operator', '--provider-sort', 'cheapest']]) assert.throws(() => parseArgs(args))
  const seen = []
  const fetchImpl = async (url, init) => { seen.push(init.headers); return mockFetch(url, init) }
  const runOpts = { ...opts, out, operator: true, secret: 'test-secret', model: 'anthropic/claude-haiku-5.5' }
  const report = await runGate({ ...runOpts, fetchImpl })
  assert.equal(report.config.model, 'anthropic/claude-haiku-5.5')
  assert.equal(seen.length, questions.length)
  for (const h of seen) { assert.equal(h['x-opax-research-model'], 'anthropic/claude-haiku-5.5'); assert.equal(h['x-opax-research'], 'loop'); assert.equal(h['x-opax-research-provider'], undefined) }
  await assert.rejects(runGate({ ...runOpts, model: 'deepseek/deepseek-v4-pro-0813', fetchImpl: () => assert.fail('changed model must not resume') }), /Checkpoint settings/)
}))
