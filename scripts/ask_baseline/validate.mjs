#!/usr/bin/env node
// Offline validator for the Ask baseline set: schema, counts, check vocabulary, and ground truth.
//
//   node scripts/ask_baseline/validate.mjs            # validate questions-v1.json and the pilot
//   node scripts/ask_baseline/validate.mjs --json     # machine-readable report
//
// Every ground_truth_source reference must resolve in portal/public. A reference whose recorded value
// no longer matches is an error, unless it is marked volatile (a value a routine data refresh may
// change), in which case it is reported as drift. No network and no model calls.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ROOT, resolveRef } from './lib.mjs'
import { FAMILIES } from './generate.mjs'
import { runCheck } from '../research_eval_grade.mjs'

const DIR = resolve(ROOT, 'scripts/ask_baseline')
export const STRATA = ['named_politician', 'dates_periods', 'divisions_votes', 'bills', 'money', 'topics_trends', 'negative_adversarial']
export const PHRASINGS = ['plain', 'casual', 'typo', 'typo-name', 'short', 'long', 'compound']
const KINDS = ['answer', 'decline', 'correction']
const REGEX_FIELDS = { must_not: 'match', matches: 'match', fact: 'match' }

/** Check types the grader implements: probe runCheck with an empty context and reject "unknown check". */
function knownCheck(type) {
  const ctx = { answer: '', payload: {}, ev: { cited: [], entries: [] }, roster: [], names: { bound: [] }, figures: { figures: [] }, question: '' }
  try { return !/unknown check/.test(runCheck({ type, all: [], any: [], value: 0, iso: '2000-01-01', match: 'x', person: 'x', direction: 'aye' }, ctx).detail ?? '') } catch { return true }
}

export function loadSet(file = 'questions-v1.json') { return JSON.parse(readFileSync(resolve(DIR, file), 'utf8')) }

/** Validate the full set. Returns { errors: string[], drift: string[], counts }. */
export function validateSet(set, { values = true } = {}) {
  const errors = [], drift = [], qs = set.questions ?? []
  const err = (id, msg) => errors.push(`${id}: ${msg}`)
  const known = new Map()
  const familyOf = new Map(FAMILIES.map(([family, code, stratum, n, strength]) => [family, { code, stratum, n, strength }]))

  if (set.schema !== 1) err('set', `schema ${set.schema}, expected 1`)
  if (!set.snapshot) err('set', 'no snapshot version')
  if (qs.length !== 1000) err('set', `${qs.length} questions, expected 1000`)
  const ids = new Set(), texts = new Set()
  for (const q of qs) {
    const id = q.id ?? '(no id)'
    for (const k of ['id', 'family', 'kind', 'stratum', 'strata', 'question', 'phrasing', 'expected', 'must', 'ground_truth_source', 'check_strength', 'old_route']) if (q[k] == null) err(id, `missing ${k}`)
    if (ids.has(id)) err(id, 'duplicate id'); ids.add(id)
    const text = String(q.question ?? '').toLowerCase()
    if (texts.has(text)) err(id, 'duplicate question text'); texts.add(text)
    const fam = familyOf.get(q.family)
    if (!fam) { err(id, `unknown family ${q.family}`); continue }
    if (!id.startsWith(fam.code + '-')) err(id, `id does not start with ${fam.code}`)
    if (q.kind !== q.family) err(id, 'kind must equal family (the harness groups by kind)')
    if (q.stratum !== fam.stratum) err(id, `stratum ${q.stratum}, family says ${fam.stratum}`)
    if (q.old_route !== 'ordinary') err(id, "old_route must be 'ordinary' so the harness asks the public route")
    if (!PHRASINGS.includes(q.phrasing)) err(id, `unknown phrasing ${q.phrasing}`)
    if (!Array.isArray(q.strata) || !q.strata.includes(`phrasing:${q.phrasing}`)) err(id, 'strata lacks its phrasing tag')
    if (!['strict', 'loose'].includes(q.check_strength)) err(id, `check_strength ${q.check_strength}`)
    if (!KINDS.includes(q.expected?.kind)) err(id, `expected.kind ${q.expected?.kind}`)
    if (!String(q.expected?.answer ?? '').trim()) err(id, 'no expected answer')
    if (!String(q.question ?? '').trim() || q.question.length > 600) err(id, 'question empty or too long')
    if (/[—–]/.test(JSON.stringify({ ...q, ground_truth_source: null }))) err(id, 'em or en dash outside ground_truth_source')
    if (/\b(?:undefined|NaN)\b|\bnull\)/.test(q.question + ' ' + q.expected?.answer)) err(id, 'placeholder text (undefined, NaN or null) in question or answer')
    if (!Array.isArray(q.must) || !q.must.length) err(id, 'no must checks')
    const declines = (q.must ?? []).some((c) => c.type === 'decline')
    if ((q.expected?.kind === 'decline') !== declines) err(id, 'decline rows, and only they, carry a decline check')
    if (q.expected?.kind === 'answer' && !(q.must ?? []).some((c) => !['sources', 'must_not', 'constraint'].includes(c.type))) err(id, 'answer row with no content check')
    for (const c of q.must ?? []) {
      if (!known.has(c.type)) known.set(c.type, knownCheck(c.type))
      if (!known.get(c.type)) err(id, `check type ${c.type} is not implemented by the grader`)
      for (const re of [c[REGEX_FIELDS[c.type]], c.type === 'decline' ? c.or_match : null].filter(Boolean)) { try { new RegExp(re, c.flags ?? 'i') } catch (e) { err(id, `bad regex in ${c.type}: ${e.message}`) } }
      if (['mentions', 'terms'].includes(c.type) && !(c.any?.length || c.all?.length)) err(id, `${c.type} with no terms`)
      if (c.type === 'number' && !(c.all?.length || c.any?.length)) err(id, 'number with no values')
      if (c.type === 'amount' && !(Number.isFinite(c.value) || c.any?.length)) err(id, 'amount with no value')
      if (c.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(c.iso ?? c.any?.[0] ?? '')) err(id, 'date without an ISO value')
      if (c.type === 'vote' && !(c.person && ['aye', 'no'].includes(c.direction))) err(id, 'vote needs person and aye or no')
    }
    if (!Array.isArray(q.ground_truth_source) || !q.ground_truth_source.length) { err(id, 'no ground_truth_source'); continue }
    const anyVolatile = q.ground_truth_source.some((r) => r.volatile)
    if (anyVolatile !== q.strata.includes('volatile')) err(id, 'volatile tag and volatile references disagree')
    for (const ref of q.ground_truth_source) {
      if (!ref.file?.startsWith('portal/public/')) { err(id, `reference outside portal/public: ${ref.file}`); continue }
      const { value: _recorded, ...pathOnly } = ref
      const r = resolveRef(values ? ref : pathOnly)
      if (r.ok) continue
      if (r.value !== undefined && ref.volatile) drift.push(`${id}: ${r.error}`)
      else err(id, r.error)
    }
  }
  const counts = { family: {}, stratum: {}, phrasing: {}, check_strength: {}, expected: {} }
  for (const q of qs) { counts.family[q.family] = (counts.family[q.family] ?? 0) + 1; counts.stratum[q.stratum] = (counts.stratum[q.stratum] ?? 0) + 1; counts.phrasing[q.phrasing] = (counts.phrasing[q.phrasing] ?? 0) + 1; counts.check_strength[q.check_strength] = (counts.check_strength[q.check_strength] ?? 0) + 1; counts.expected[q.expected?.kind] = (counts.expected[q.expected?.kind] ?? 0) + 1 }
  for (const [family, { n }] of familyOf) if ((counts.family[family] ?? 0) !== n) err('set', `${family}: ${counts.family[family] ?? 0} rows, registry says ${n}`)
  for (const s of STRATA) if (!counts.stratum[s]) err('set', `stratum ${s} is empty`)
  return { errors, drift, counts }
}

/** The pilot must be 50 rows drawn verbatim from the set and cover every family. */
export function validatePilot(pilot, set) {
  const errors = [], byId = new Map(set.questions.map((q) => [q.id, q]))
  if (pilot.questions?.length !== 50) errors.push(`pilot: ${pilot.questions?.length} rows, expected 50`)
  for (const q of pilot.questions ?? []) if (JSON.stringify(byId.get(q.id)) !== JSON.stringify(q)) errors.push(`pilot ${q.id}: not identical to the set row`)
  const missing = [...new Set(set.questions.map((q) => q.family))].filter((f) => !pilot.questions.some((q) => q.family === f))
  if (missing.length) errors.push(`pilot misses families: ${missing.join(', ')}`)
  if (new Set(pilot.questions.map((q) => q.id)).size !== pilot.questions.length) errors.push('pilot has duplicate ids')
  return { errors }
}

function main() {
  const set = loadSet(), pilot = loadSet('questions-pilot50.json')
  const full = validateSet(set), p = validatePilot(pilot, set)
  const errors = [...full.errors, ...p.errors]
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ errors, drift: full.drift, counts: full.counts }, null, 1)); process.exitCode = errors.length ? 1 : 0; return }
  console.log(`questions: ${set.questions.length} (snapshot ${set.snapshot}); pilot: ${pilot.questions.length}`)
  console.log('strata:', JSON.stringify(full.counts.stratum))
  console.log('phrasing:', JSON.stringify(full.counts.phrasing))
  console.log('check strength:', JSON.stringify(full.counts.check_strength), 'expected:', JSON.stringify(full.counts.expected))
  if (full.drift.length) { console.log(`\ndrift in volatile references (${full.drift.length}); regenerate when convenient:`); for (const x of full.drift.slice(0, 40)) console.log('  ' + x) }
  if (errors.length) { console.error(`\n${errors.length} errors:`); for (const x of errors.slice(0, 80)) console.error('  ' + x); process.exitCode = 1 } else console.log('\nOK: schema, counts, check types and every ground-truth reference resolve.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
