#!/usr/bin/env node
// Freeze a release gate from v1 without reading or regenerating the live corpus.
//   node scripts/ask_baseline/subset.mjs [--check]
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rngFrom } from './lib.mjs'

export const SEED = 'opax-ask-v1-gate150'
export const SIZE = 150
const here = dirname(fileURLToPath(import.meta.url))
export const SOURCE = resolve(here, 'questions-v1.json')
export const OUTPUT = resolve(here, 'questions-v1-gate150.json')

/** Proportional allocation, with a minimum per group and deterministic tie breaks. */
function allocate(groups, size, minimum) {
  const keys = [...groups.keys()].sort()
  const total = keys.reduce((n, k) => n + groups.get(k).length, 0)
  const counts = new Map(keys.map(k => [k, minimum(k)]))
  let used = [...counts.values()].reduce((a, b) => a + b, 0)
  if (used > size || size > total) throw new Error('Subset size cannot cover every family or exceeds the source size.')
  while (used < size) {
    const candidates = keys.filter(k => counts.get(k) < groups.get(k).length)
    candidates.sort((a, b) => (groups.get(b).length * size / total - counts.get(b)) - (groups.get(a).length * size / total - counts.get(a)))
    const k = candidates[0]
    counts.set(k, counts.get(k) + 1)
    used++
  }
  return counts
}

const groupBy = (rows, key) => {
  const groups = new Map()
  for (const q of rows) {
    if (!groups.has(q[key])) groups.set(q[key], [])
    groups.get(q[key]).push(q)
  }
  return groups
}

export function selectSubset(questions, { size = SIZE, seed = SEED } = {}) {
  if (!Array.isArray(questions) || !questions.length) throw new Error('Expected a non-empty questions array.')
  if (!Number.isInteger(size) || size < 1) throw new Error('Subset size must be a positive integer.')
  const ids = new Set(), familyStrata = new Map()
  for (const q of questions) {
    if (!q || !q.id || !q.question || !q.family || !q.stratum) throw new Error('Every question needs an id, question, family and stratum.')
    if (ids.has(q.id)) throw new Error(`Duplicate question id: ${q.id}`)
    ids.add(q.id)
    if (familyStrata.has(q.family) && familyStrata.get(q.family) !== q.stratum) throw new Error(`Family spans multiple strata: ${q.family}`)
    familyStrata.set(q.family, q.stratum)
  }
  const strata = groupBy(questions, 'stratum')
  const quotas = allocate(strata, size, s => new Set(strata.get(s).map(q => q.family)).size)
  const picked = []
  for (const s of [...strata.keys()].sort()) {
    const families = groupBy(strata.get(s), 'family')
    const familyQuotas = allocate(families, quotas.get(s), () => 1)
    for (const f of [...families.keys()].sort()) {
      const sorted = [...families.get(f)].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      picked.push(...rngFrom(`${seed}:${s}:${f}`).shuffle(sorted).slice(0, familyQuotas.get(f)))
    }
  }
  return rngFrom(seed).shuffle(picked)
}

export function buildSubset(source) {
  return {
    ...source,
    seed: SEED,
    parent_seed: source.seed,
    parent: 'questions-v1.json',
    generator: 'scripts/ask_baseline/subset.mjs',
    purpose: 'Fixed 150-question release gate: proportional strata, every family, including negatives; rows copied unchanged from v1.',
    questions: selectSubset(source.questions),
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.some(a => a !== '--check')) throw new Error('Usage: node scripts/ask_baseline/subset.mjs [--check]')
  const subset = buildSubset(JSON.parse(await readFile(SOURCE, 'utf8')))
  const json = JSON.stringify(subset, null, 1) + '\n'
  if (args.includes('--check')) {
    if (await readFile(OUTPUT, 'utf8') !== json) throw new Error('questions-v1-gate150.json differs from the fixed selection.')
  } else await writeFile(OUTPUT, json)
  const counts = key => Object.fromEntries([...groupBy(subset.questions, key)].map(([k, qs]) => [k, qs.length]))
  console.log(JSON.stringify({ output: OUTPUT, questions: subset.questions.length, strata: counts('stratum'), families: counts('family') }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exitCode = 1 })
}
