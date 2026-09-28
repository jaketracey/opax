// The live canary: write a handful of already-finished dry-run results into the box for
// real (no regeneration), reading the WHOLE resource before and after so the diff can prove
// nothing else moved. Reached only through the admin-protected POST /canary.
//
// Expected diff for a speech with a topic verdict and no existing brief: exactly
//   - new `topic` entries in usermetadata.classifications, and
//   - a new text field data.texts["da-summary-t-body"];
// every other path identical, apart from the volatile bookkeeping keys the platform bumps on any
// write (modified, last_seqid, last_account_seq, metadata.status), which are listed separately so they are seen.

import { finishRows, isSummaryTask, logError, type QueueRow, type RowUpdate } from './db.ts'
import { FIELD } from './text.ts'
import { KbBackpressure, KbHttpError, type KbApi } from './kb.ts'
import { UnsafeWrite, writeItem, type WriteOutcome } from './write.ts'

export const MAX_CANARY_RIDS = 10
const RID = /^[0-9a-f]{32}$/
const CLASSIFICATIONS = 'usermetadata.classifications'
// metadata.status flips PROCESSED -> PENDING while the platform reprocesses the new field, then back (seen in the
// 2026-09-28 canary); the others are stamped on any write.
const VOLATILE = new Set(['modified', 'last_seqid', 'last_account_seq', 'metadata.status'])

// ---------------------------------------------------------------- diff

type Flat = Map<string, unknown>

/** Flatten to path -> leaf. Arrays index by position, except classifications which are handled as a set. */
function flatten(value: unknown, path: string, out: Flat): void {
  if (path === CLASSIFICATIONS) return
  if (Array.isArray(value)) {
    if (value.length === 0) out.set(path, [])
    value.forEach((item, i) => flatten(item, `${path}[${i}]`, out))
  } else if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) out.set(path, {})
    for (const [k, v] of entries) flatten(v, path ? `${path}.${k}` : k, out)
  } else {
    out.set(path, value)
  }
}

const classKey = (c: { labelset?: unknown; label?: unknown; cancelled_by_user?: unknown }): string =>
  `${String(c.labelset)}/${String(c.label)}${c.cancelled_by_user === true ? ' (cancelled)' : ''}`

function classifications(resource: unknown): string[] {
  const raw = (resource as { usermetadata?: { classifications?: unknown[] } } | null)?.usermetadata?.classifications
  return Array.isArray(raw) ? raw.map((c) => classKey(c as Record<string, unknown>)) : []
}

const clipValue = (v: unknown): unknown => (typeof v === 'string' && v.length > 240 ? `${v.slice(0, 240)}... [${v.length} chars]` : v)

export interface ResourceDiff {
  classifications: { added: string[]; removed: string[] }
  added: Record<string, unknown>
  removed: Record<string, unknown>
  changed: Record<string, { before: unknown; after: unknown }>
  /** Paths that changed and are expected for a topic + brief write. */
  expected: string[]
  /** Bookkeeping the platform bumps on any write. */
  volatile: string[]
  /** Anything else that moved. The canary passes only when this is empty. */
  unexpected: string[]
}

export function diffResources(before: unknown, after: unknown): ResourceDiff {
  const a: Flat = new Map()
  const b: Flat = new Map()
  flatten(before, '', a)
  flatten(after, '', b)
  const diff: ResourceDiff = { classifications: { added: [], removed: [] }, added: {}, removed: {}, changed: {}, expected: [], volatile: [], unexpected: [] }

  const ca = classifications(before)
  const cb = classifications(after)
  diff.classifications.added = cb.filter((c) => !ca.includes(c))
  diff.classifications.removed = ca.filter((c) => !cb.includes(c))
  for (const c of diff.classifications.added) (c.startsWith('topic/') ? diff.expected : diff.unexpected).push(`${CLASSIFICATIONS} + ${c}`)
  for (const c of diff.classifications.removed) diff.unexpected.push(`${CLASSIFICATIONS} - ${c}`)

  const briefPrefix = `data.texts.${FIELD}`
  const isBrief = (path: string): boolean => path === briefPrefix || path.startsWith(`${briefPrefix}.`)
  const place = (path: string): void => {
    if (isBrief(path)) diff.expected.push(path)
    else if (VOLATILE.has(path)) diff.volatile.push(path)
    else diff.unexpected.push(path)
  }

  for (const [path, value] of b) {
    if (!a.has(path)) {
      diff.added[path] = clipValue(value)
      place(path)
    } else if (JSON.stringify(a.get(path)) !== JSON.stringify(value)) {
      diff.changed[path] = { before: clipValue(a.get(path)), after: clipValue(value) }
      place(path)
    }
  }
  for (const [path, value] of a) {
    if (!b.has(path)) {
      diff.removed[path] = clipValue(value)
      place(path)
    }
  }
  return diff
}

// ---------------------------------------------------------------- the canary

export interface CanaryRidResult {
  rid: string
  status: 'written' | 'skipped' | 'error'
  reason?: string
  writes: Array<{ task: string; outcome: string; warning?: string }>
  diff?: ResourceDiff
  /** True when the diff shows only the expected changes. */
  clean?: boolean
  before?: unknown
  after?: unknown
}

export interface CanaryDeps {
  db: D1Database
  kb: KbApi
  now: () => number
  /** Pause between the write and the "after" read. */
  settle: (ms: number) => Promise<void>
}

export async function runCanary(d: CanaryDeps, rids: string[]): Promise<{ results: CanaryRidResult[]; allClean: boolean }> {
  const results: CanaryRidResult[] = []
  for (const rid of rids) {
    const result: CanaryRidResult = { rid, status: 'skipped', writes: [] }
    results.push(result)
    const { results: rows } = await d.db
      .prepare("SELECT * FROM queue WHERE rid = ? AND status = 'done' AND outcome IN ('dry', 'unwritten') AND result IS NOT NULL")
      .bind(rid)
      .all<QueueRow>()
    if (rows.length === 0) {
      result.reason = 'no finished dry-run result stored for this rid (only rows done in dry mode, or unwritten, can be canaried)'
      continue
    }
    try {
      const before = await d.kb.getEverything(rid)
      if (!before) {
        result.reason = 'resource not found in the knowledge box'
        continue
      }
      result.before = before

      const updates: RowUpdate[] = []
      for (const row of rows) {
        const value = isSummaryTask(row.task) ? (row.result as string) : (JSON.parse(row.result as string) as string[])
        // The very same write path as live mode: the existing-brief / existing-topics conditions are
        // re-checked NOW, the merge keeps every non-topic label, and the topic write is read back.
        const done: WriteOutcome = await writeItem(d.kb, rid, { task: row.task, force: row.force === 1, value })
        result.writes.push({ task: row.task, outcome: done.outcome, warning: done.warning })
        updates.push({ rid, task: row.task, status: 'done', outcome: done.outcome, lastError: done.warning ?? null })
      }
      await finishRows(d.db, updates, d.now())

      await d.settle(3000)
      const after = await d.kb.getEverything(rid)
      result.after = after
      result.diff = diffResources(before, after)
      result.clean = result.diff.unexpected.length === 0
      result.status = result.writes.some((w) => w.outcome === 'written') ? 'written' : 'skipped'
      if (!result.clean) await logError(d.db, d.now(), 'canary-diff', `unexpected changes on ${rid}: ${result.diff.unexpected.join('; ')}`, rid)
    } catch (err) {
      result.status = 'error'
      result.reason = `${(err as Error).name}: ${(err as Error).message}`.slice(0, 400)
      if (err instanceof KbBackpressure || err instanceof KbHttpError || err instanceof UnsafeWrite) {
        await logError(d.db, d.now(), 'canary', result.reason, rid)
      }
      if (err instanceof KbBackpressure) break // the box is pushing back: stop the whole canary
    }
  }
  return { results, allClean: results.every((r) => r.status !== 'error' && r.clean !== false) }
}

/** Validate a /canary body: at most ten distinct 32-hex rids. */
export function parseCanaryBody(body: unknown): { rids: string[] } | { error: string } {
  const rids = (body as { rids?: unknown } | null)?.rids
  if (!Array.isArray(rids) || rids.length === 0) return { error: 'body must be {"rids": [<1-10 resource ids>]}' }
  if (rids.length > MAX_CANARY_RIDS) return { error: `at most ${MAX_CANARY_RIDS} rids per canary` }
  if (!rids.every((r) => typeof r === 'string' && RID.test(r))) return { error: 'every rid must be a 32-character hex resource id' }
  return { rids: [...new Set(rids as string[])] }
}
