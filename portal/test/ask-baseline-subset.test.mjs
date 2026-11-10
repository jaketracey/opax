import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { buildSubset, selectSubset, SOURCE, OUTPUT, SEED } from '../../scripts/ask_baseline/subset.mjs'

const source = JSON.parse(await readFile(SOURCE, 'utf8'))
const count = (rows, key) => rows.reduce((out, q) => ({ ...out, [q[key]]: (out[q[key]] ?? 0) + 1 }), {})

test('the frozen gate has 150 unchanged questions, every family, and proportional strata', async () => {
  const gate = JSON.parse(await readFile(OUTPUT, 'utf8'))
  assert.deepEqual(gate, buildSubset(source))
  assert.equal(gate.seed, SEED)
  assert.equal(gate.questions.length, 150)
  assert.equal(new Set(gate.questions.map(q => q.id)).size, 150)
  const originals = new Map(source.questions.map(q => [q.id, q]))
  for (const q of gate.questions) assert.deepEqual(q, originals.get(q.id))
  assert.deepEqual(Object.keys(count(gate.questions, 'family')).sort(), Object.keys(count(source.questions, 'family')).sort())
  const strata = count(gate.questions, 'stratum')
  for (const [s, n] of Object.entries(count(source.questions, 'stratum'))) assert.ok(Math.abs(strata[s] - n * 0.15) <= 1, `${s}: ${strata[s]}`)
  assert.equal(strata.negative_adversarial, 12)
  assert.equal(new Set(gate.questions.filter(q => q.stratum === 'negative_adversarial').map(q => q.family)).size, 6)
  assert.ok(gate.questions.some(q => q.expected.kind === 'decline'))
  assert.ok(gate.questions.some(q => q.expected.kind === 'correction'))
})

test('selection is deterministic, independent of source order, and does not mutate v1', () => {
  const before = structuredClone(source)
  const a = selectSubset(source.questions)
  assert.deepEqual(a, selectSubset([...source.questions].reverse()))
  assert.deepEqual(a, selectSubset(source.questions))
  assert.deepEqual(source, before)
})

test('selection rejects impossible sizes, duplicate IDs and inconsistent family strata', () => {
  for (const size of [1, 1001, 0, 1.5]) assert.throws(() => selectSubset(source.questions, { size }), /size/i)
  assert.throws(() => selectSubset([...source.questions, source.questions[0]]), /Duplicate/)
  assert.throws(() => selectSubset([{ ...source.questions[0], stratum: 'other' }, ...source.questions.slice(1)]), /multiple strata/)
  assert.throws(() => selectSubset([]), /non-empty/)
})

test('the subset CLI checks the frozen artifact from any working directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ask-subset-'))
  try {
    const script = resolve(new URL('../../scripts/ask_baseline/subset.mjs', import.meta.url).pathname)
    const { stdout } = await promisify(execFile)(process.execPath, [script, '--check'], { cwd: dir })
    assert.equal(JSON.parse(stdout).questions, 150)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
