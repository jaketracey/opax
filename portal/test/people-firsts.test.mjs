// Contract for /people/firsts.json (scripts/export_people_firsts.py): each
// roster person's first speech and first division in the record. The apps
// decode it with the rules below (mobile/src/api/people-firsts.ts on the app
// branch, whose own test reads a byte-identical copy of the sample); change
// both together, and only ever by adding optional fields.
//
// The sample is the export's output for its synthetic database
// (scripts/test_export_people_firsts.py holds the two equal). The published
// file is checked the same way once it exists, against the shipped roster.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const sampleText = read('./fixtures/people-firsts.sample.json')
const sample = JSON.parse(sampleText)
const roster = JSON.parse(read('../public/parliamentarians.json'))
const published = new URL('../public/people/firsts.json', import.meta.url)

// Same pattern as mobile/src/api/ids.ts rosterId (roster-pid-contract.test.mjs).
const ROSTER_ID = /^(?:\d+|(?:nsw|vic|qld|sa|wa|tas|act|nt|wragge|zenodo|aph)_[a-z0-9_]+)$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const SLUG = /^speech-\d+$/
const realDate = (v) => typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))
const https = (v) => {
  try {
    return typeof v === 'string' && new URL(v).protocol === 'https:'
  } catch {
    return false
  }
}

/** Every way a document breaks the contract; [] when it holds. */
function faults(doc) {
  const out = []
  const meta = doc.meta ?? {}
  if (meta.schema !== 1) out.push('meta.schema is not 1')
  if (!realDate(meta.generated)) out.push('meta.generated is not a date')
  if (!realDate(meta.speeches_since)) out.push('meta.speeches_since is not a date')
  for (const [k, v] of Object.entries(meta.divisions_since ?? {}))
    if (!realDate(v)) out.push(`meta.divisions_since.${k} is not a date`)
  if (typeof meta.sources?.speech !== 'string' || !meta.sources.speech) out.push('meta.sources.speech is missing')
  const labels = meta.sources?.divisions ?? {}
  const people = [
    ...Object.entries(doc.by_pid ?? {}).map(([k, v]) => [`by_pid.${k}`, v, ROSTER_ID.test(k)]),
    ...Object.entries(doc.by_name ?? {}).map(([k, v]) => [`by_name.${k}`, v, k.trim() === k && k.length > 0]),
  ]
  if (typeof doc.by_pid !== 'object' || typeof doc.by_name !== 'object') out.push('by_pid or by_name is missing')
  for (const [at, entry, keyed] of people) {
    if (!keyed) out.push(`${at}: the key is not a roster id or a name`)
    const { first_speech: speech, first_division: division } = entry
    if (!speech && !division) out.push(`${at}: holds neither fact`)
    if (speech && !(realDate(speech.date) && SLUG.test(speech.slug))) out.push(`${at}: first_speech`)
    if (speech && speech.date < meta.speeches_since) out.push(`${at}: first_speech is before the record starts`)
    if (division && !(realDate(division.date) && https(division.url))) out.push(`${at}: first_division`)
    if (division && typeof labels[division.source] !== 'string') out.push(`${at}: first_division has no named source`)
  }
  if (meta.people !== people.length) out.push('meta.people is not the number of entries')
  return out
}

test('the sample holds the contract', () => {
  assert.deepEqual(faults(sample), [])
  assert.ok(Object.keys(sample.by_pid).length && Object.keys(sample.by_name).length)
})

test('the contract refuses what the apps would refuse (revert guard)', () => {
  const broken = (edit) => {
    const doc = structuredClone(sample)
    edit(doc)
    return faults(doc)
  }
  const pid = Object.keys(sample.by_pid)[0]
  assert.notDeepEqual(broken((d) => { d.by_pid[pid].first_speech.slug = 'legal-12' }), [])
  assert.notDeepEqual(broken((d) => { d.by_pid[pid].first_speech.date = '12 Feb 2008' }), [])
  assert.notDeepEqual(broken((d) => { d.by_pid[pid].first_division.url = 'http://example.org/division' }), [])
  assert.notDeepEqual(broken((d) => { d.by_pid[pid].first_division.source = 'unnamed' }), [])
  assert.notDeepEqual(broken((d) => { d.by_pid.person_9c02d321caef54b2ba21a1f8 = d.by_pid[pid] }), [])
  assert.notDeepEqual(broken((d) => { d.by_pid[pid] = {} }), [])
  // Added fields are allowed: readers ignore what they do not know.
  assert.deepEqual(broken((d) => { d.by_pid[pid].first_question = { date: '2008-02-20' }; d.meta.extra = 1 }), [])
})

test('the sample the app branch decodes is this one', () => {
  // mobile/src/api/__tests__/people-firsts.test.ts pins the same digest.
  assert.equal(
    createHash('sha256').update(sampleText).digest('hex'),
    read('./fixtures/people-firsts.sample.sha256').trim(),
  )
})

test('no wording in the file ranks or compares people', () => {
  for (const text of [sampleText, existsSync(published) ? readFileSync(published, 'utf8') : ''])
    assert.doesNotMatch(text, /first ever|youngest|oldest|longest|\bmost\b|\brank/i)
})

test('the published file, once exported, holds the contract and names only shipped roster people', { skip: !existsSync(published) && 'not exported yet' }, () => {
  const doc = JSON.parse(readFileSync(published, 'utf8'))
  assert.deepEqual(faults(doc), [])
  const pids = new Set(roster.people.map((p) => p.pid).filter(Boolean))
  const unnamed = new Set(roster.people.filter((p) => !p.pid).map((p) => p.name))
  assert.deepEqual(Object.keys(doc.by_pid).filter((k) => !pids.has(k)), [])
  assert.deepEqual(Object.keys(doc.by_name).filter((k) => !unnamed.has(k)), [])
  assert.ok(Buffer.byteLength(JSON.stringify(doc)) < 350_000, 'the file stays small')
})
