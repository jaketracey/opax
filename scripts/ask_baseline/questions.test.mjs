// Offline test for the Ask baseline set: schema, counts, check vocabulary and ground truth.
//   node --test scripts/ask_baseline/*.test.mjs
// Kept out of portal/test on purpose: value checks read the live corpus in portal/public, which the
// nightly refresh rewrites, and a drifted count must not block a deploy. No network, no model.
import test from 'node:test'
import assert from 'node:assert/strict'
import { loadSet, validateSet, validatePilot } from './validate.mjs'
import { generate, FAMILIES } from './generate.mjs'
import { walk, derive, resolveRef, rebels, rngFrom, spread, addTypos } from './lib.mjs'
import { gradeRow } from '../research_eval_grade.mjs'

const set = loadSet(), pilot = loadSet('questions-pilot50.json')
const clone = (x) => JSON.parse(JSON.stringify(x))

test('the set is 1,000 valid rows and every ground-truth reference resolves', () => {
  const { errors, drift, counts } = validateSet(set)
  assert.deepEqual(errors, [], errors.slice(0, 20).join('\n'))
  if (drift.length) console.log(`# ${drift.length} volatile references have drifted since the snapshot; regenerate when convenient`)
  assert.equal(set.questions.length, 1000)
  assert.equal(Object.values(counts.family).reduce((a, b) => a + b, 0), 1000)
})

test('strata land near the planned mix and every stratum and phrasing is represented', () => {
  const plan = { named_politician: 250, dates_periods: 150, divisions_votes: 120, bills: 100, money: 150, topics_trends: 100, negative_adversarial: 80 }
  const { counts } = validateSet(set, { values: false })
  for (const [s, n] of Object.entries(plan)) assert.ok(Math.abs(counts.stratum[s] - n) <= n * 0.15, `${s}: ${counts.stratum[s]} against a plan of ${n}`)
  for (const p of ['plain', 'casual', 'typo', 'short', 'long', 'compound']) assert.ok(counts.phrasing[p] >= 15 || (p === 'compound' && counts.phrasing[p] >= 10), `${p}: ${counts.phrasing[p]}`)
  const tags = set.questions.flatMap((q) => q.strata)
  for (const t of ['era:2000s', 'era:2010s', 'era:2020s', 'chamber:senate', 'chamber:representatives', 'jurisdiction:nsw', 'jurisdiction:vic', 'jurisdiction:qld', 'jurisdiction:sa']) assert.ok(tags.includes(t), `no row tagged ${t}`)
  assert.ok(set.questions.filter((q) => q.expected.kind === 'decline').length >= 50)
  assert.ok(set.questions.filter((q) => q.expected.kind === 'correction').length >= 10)
})

test('each expected answer passes its own checks (the checks and the truth agree)', () => {
  const failures = []
  for (const q of set.questions) {
    const speech = q.must.find((c) => c.type === 'sources' && (c.kind === 'speech' || c.speaker_any))
    const year = q.must.find((c) => c.type === 'constraint' && c.years)?.years?.[0]
    const source = { cited: true, kind: speech ? 'speech' : 'record', title: 'record', snippet: '', speaker: speech?.speaker_any?.[0], date: q.expected.values?.date ?? (year ? `${year}-06-30` : undefined) }
    const graded = gradeRow(q, { answered: true, answer: q.expected.answer, sources: [source] })
    for (const c of graded.checks.filter((c) => c.status === 'fail')) failures.push(`${q.id} ${c.type}: ${c.detail}`)
    if (graded.axes.decline !== 'pass') failures.push(`${q.id}: decline axis ${graded.axes.decline}`)
  }
  assert.deepEqual(failures, [], failures.slice(0, 20).join('\n'))
})

test('the pilot is 50 rows copied from the set, covering every family', () => {
  assert.deepEqual(validatePilot(pilot, set).errors, [])
  assert.equal(new Set(pilot.questions.map((q) => q.family)).size, FAMILIES.length)
})

test('generation is deterministic', () => {
  const a = generate(), b = generate()
  assert.equal(JSON.stringify(a), JSON.stringify(b))
  assert.equal(a.set.questions.length, 1000)
})

test('the validator catches a broken path, a wrong value and drift', () => {
  const broken = clone(set)
  broken.questions[0].ground_truth_source[0].path = ['people', { name: 'Nobody Atall' }, 'party']
  assert.ok(validateSet(broken).errors.some((e) => e.includes('path does not resolve')))

  const stable = clone(set), row = stable.questions.find((q) => q.ground_truth_source.every((r) => !r.volatile) && q.ground_truth_source.some((r) => typeof r.value === 'number'))
  row.ground_truth_source.find((r) => typeof r.value === 'number').value += 7
  assert.ok(validateSet(stable).errors.some((e) => e.startsWith(row.id) && e.includes('value mismatch')))

  const moving = clone(set), vrow = moving.questions.find((q) => q.ground_truth_source.some((r) => r.volatile && typeof r.value === 'number'))
  vrow.ground_truth_source.find((r) => r.volatile && typeof r.value === 'number').value += 7
  const res = validateSet(moving)
  assert.ok(!res.errors.some((e) => e.startsWith(vrow.id)), 'drift in a volatile value is not an error')
  assert.ok(res.drift.some((e) => e.startsWith(vrow.id)))

  const unknown = clone(set); unknown.questions[1].must.push({ type: 'telepathy' })
  assert.ok(validateSet(unknown, { values: false }).errors.some((e) => e.includes('telepathy')))
})

test('reference helpers: selectors, derivations and floor-crossers', () => {
  const data = { rows: [{ k: 'a', d: '2020-01-02', n: { x: 1 } }, { k: 'b', d: '2021-05-06', n: { x: 2 } }, { k: 'ab', d: '2021-07-01', n: { x: 2 } }] }
  assert.equal(walk(data, ['rows', { k: 'b' }, 'd']), '2021-05-06')
  assert.equal(walk(data, ['rows', { 'n.x': 2 }, 'k']), 'b')
  assert.equal(derive(data.rows, { op: 'count', prefix: { k: 'a' } }), 2)
  assert.equal(derive(data.rows, { op: 'count', range: { d: ['2021-01-01', null] } }), 2)
  assert.deepEqual(derive(data.rows, { op: 'values', field: 'k', where: { 'n.x': 2 } }), ['ab', 'b'])
  const members = [...Array(6)].map((_, i) => ({ name: `L${i}`, party: 'Labor', vote: i ? 'aye' : 'no' })).concat([{ name: 'I1', party: 'Independent', vote: 'no' }])
  assert.deepEqual(rebels(members).map((r) => r.name), ['L0'], 'one Labor member against five; independents never count')
  assert.equal(resolveRef({ file: 'portal/public/corpus.json', path: ['version'], value: set.snapshot }).ok, true)
})

test('phrasing helpers keep protected names intact and spread draws evenly', () => {
  const rng = rngFrom('t')
  const out = addTypos('How did Penny Wong vote on the Housing bill yesterday?', ['Penny Wong'], rng)
  assert.ok(out && out.includes('Penny Wong') && out !== 'How did Penny Wong vote on the Housing bill yesterday?')
  const picks = spread([...Array(30)].map((_, i) => ({ g: i % 3, i })), 9, (x) => x.g, rngFrom('s'))
  assert.deepEqual([0, 1, 2].map((g) => picks.filter((x) => x.g === g).length), [3, 3, 3])
})
