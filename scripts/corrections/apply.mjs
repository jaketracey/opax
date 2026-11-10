// Reviewed corrections for the node builders: the same file format and the same
// fail-loud rule as scripts/corrections/apply.py (read README.md in this folder).
//
// An entry changes a field only while the record still holds its reviewed `from`
// value. A missing record, or a field holding anything else, throws before anything
// is changed, so a fixed source or a changed record forces a fresh review instead
// of a silent overwrite.
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DIRECTORY = dirname(fileURLToPath(import.meta.url))
const FIELDS = ['id', 'field', 'from', 'to', 'evidence_url', 'evidence', 'finding', 'reviewed']
const DATASET = /^[a-z0-9][a-z0-9_-]{0,63}$/
const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/

export class CorrectionError extends Error {}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

function checkEntry(entry, where) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new CorrectionError(`${where}: an entry must be an object`)
  const missing = FIELDS.filter(f => !(f in entry))
  const extra = Object.keys(entry).filter(f => !FIELDS.includes(f)).sort()
  if (missing.length || extra.length) throw new CorrectionError(`${where}: missing fields ${JSON.stringify(missing)} or unknown fields ${JSON.stringify(extra)}`)
  for (const name of ['id', 'field', 'evidence_url', 'evidence', 'finding', 'reviewed']) {
    if (typeof entry[name] !== 'string' || !entry[name].trim()) throw new CorrectionError(`${where}: ${name} must be a non-empty string`)
  }
  if (!FIELD_PATH.test(entry.field)) throw new CorrectionError(`${where}: field ${JSON.stringify(entry.field)} is not a key or dotted path`)
  if (!/^https?:\/\/[^\s/]+\.[^\s]+$/.test(entry.evidence_url)) throw new CorrectionError(`${where}: evidence_url must be the original source's http(s) URL`)
  const day = /^(\d{4})-(\d\d)-(\d\d)$/.exec(entry.reviewed)
  const parsed = day ? new Date(`${entry.reviewed}T00:00:00Z`) : null
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== entry.reviewed) {
    throw new CorrectionError(`${where}: reviewed must be an ISO date (YYYY-MM-DD)`)
  }
  if (same(entry.from, entry.to)) throw new CorrectionError(`${where}: from and to are equal, so there is nothing to correct`)
}

export function pathFor(dataset, directory = DIRECTORY) {
  if (typeof dataset !== 'string' || !DATASET.test(dataset)) throw new CorrectionError(`invalid correction dataset name: ${JSON.stringify(dataset)}`)
  return join(directory, `${dataset}.json`)
}

/** The validated entries for `dataset`; [] when it has no correction file. */
export function load(dataset, directory = DIRECTORY) {
  const path = pathFor(dataset, directory)
  if (!existsSync(path)) return []
  let entries
  try { entries = JSON.parse(readFileSync(path, 'utf8')) } catch (e) { throw new CorrectionError(`${dataset}.json: not valid JSON (${e.message})`) }
  if (!Array.isArray(entries)) throw new CorrectionError(`${dataset}.json: must be a JSON list of correction entries`)
  const seen = new Set()
  entries.forEach((entry, n) => {
    checkEntry(entry, `${dataset}.json[${n}]`)
    const identity = `${entry.id}\u0000${entry.field}`
    if (seen.has(identity)) throw new CorrectionError(`${dataset}.json[${n}]: a second correction for ${entry.id} ${entry.field}`)
    seen.add(identity)
  })
  return entries
}

const get = (record, field) => {
  let value = record
  for (const part of field.split('.')) {
    if (!value || typeof value !== 'object' || !(part in value)) return null
    value = value[part]
  }
  return value
}

const set = (record, field, value) => {
  const parts = field.split('.')
  let target = record
  for (const part of parts.slice(0, -1)) {
    if (target[part] == null) target[part] = {}
    if (typeof target[part] !== 'object') throw new CorrectionError(`cannot set ${field}: ${part} is not an object`)
    target = target[part]
  }
  target[parts.at(-1)] = value
}

/**
 * Apply every entry to `records` (an array of objects keyed by `key`), all or none.
 * Returns the applied entries in file order.
 */
export function apply(dataset, records, entries, key = 'id') {
  if (!entries?.length) return []
  entries.forEach((entry, n) => checkEntry(entry, `${dataset}[${n}]`))
  const byId = new Map()
  for (const record of records) {
    const id = typeof key === 'function' ? key(record) : record?.[key]
    if (byId.has(id)) throw new CorrectionError(`two records share the id ${JSON.stringify(id)}`)
    byId.set(id, record)
  }
  const problems = []
  for (const entry of entries) {
    const record = byId.get(entry.id)
    if (!record || typeof record !== 'object') { problems.push(`${entry.id}: record not found (${entry.finding})`); continue }
    const current = get(record, entry.field)
    if (!same(current, entry.from)) {
      const state = same(current, entry.to) ? 'already holds the corrected value; remove the correction' : `now holds ${JSON.stringify(current)?.slice(0, 120)}`
      problems.push(`${entry.id} ${entry.field}: expected ${JSON.stringify(entry.from)?.slice(0, 120)} but it ${state} (${entry.finding})`)
    }
  }
  if (problems.length) throw new CorrectionError(`${problems.length} ${dataset} correction(s) need review: ${problems.join('; ')}`)
  for (const entry of entries) set(byId.get(entry.id), entry.field, entry.to)
  return [...entries]
}
