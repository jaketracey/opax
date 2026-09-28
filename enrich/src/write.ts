// Writing validated results into the knowledge box. Every invariant lives here:
//
//  - A brief goes to the text field da-summary-t-body only if the resource has no
//    non-empty brief RIGHT NOW (re-read immediately before the write), unless forced.
//  - Topic labels are written as `existing minus labelset=="topic"` plus the new
//    labels, from a classifications list read immediately before the write. A list
//    that would drop any non-topic label is refused. An empty verdict writes nothing.
//  - A topic write is read back; if a non-topic label went missing it is repaired.

import { droppedNonTopicLabels, planTopicWrite, readClassifications, type Classification } from './classify.ts'
import type { KbApi } from './kb.ts'
import type { Outcome, TaskName } from './db.ts'
import { isSummaryTask } from './db.ts'

export interface WriteItem {
  task: TaskName
  force: boolean
  /** The brief text, or the topic slugs ([] = no-topic verdict). */
  value: string | string[]
}

export interface WriteOutcome {
  task: TaskName
  outcome: Outcome
  /** Something worth surfacing in the errors log without failing the row. */
  warning?: string
}

/** The write was refused because it could damage the resource (never retried). */
export class UnsafeWrite extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeWrite'
  }
}

export async function writeSummary(kb: KbApi, rid: string, item: WriteItem): Promise<WriteOutcome> {
  const body = typeof item.value === 'string' ? item.value.trim() : ''
  if (!body) throw new UnsafeWrite('refusing to write an empty brief')
  if (!item.force) {
    const existing = await kb.getSummaryBody(rid)
    if (existing) return { task: item.task, outcome: 'skipped-existing' }
  }
  await kb.patchSummary(rid, body)
  return { task: item.task, outcome: 'written' }
}

export async function writeTopics(kb: KbApi, rid: string, item: WriteItem): Promise<WriteOutcome> {
  const topics = Array.isArray(item.value) ? item.value : []
  // An empty verdict is recorded in D1 only; the box has nowhere to put "read, no topic".
  if (topics.length === 0) return { task: item.task, outcome: 'empty' }

  const basic = await kb.getBasic(rid)
  if (!basic) return { task: item.task, outcome: 'missing' }
  const before = readClassifications(basic)
  // Every OPAX resource carries a kind label. Without one the read is suspect
  // (partial response, wrong shape) and a write could wipe the real list.
  if (!before.some((c) => c.labelset === 'kind')) {
    throw new UnsafeWrite('refusing to write topics: the resource read back with no kind classification')
  }

  const plan = planTopicWrite(basic, topics, item.force)
  if (!plan.patch) return { task: item.task, outcome: 'skipped-existing' }
  const lost = droppedNonTopicLabels(before, plan.patch)
  if (lost.length) throw new UnsafeWrite(`refusing to write: the list would drop ${lost.map((c) => `${c.labelset}/${c.label}`).join(', ')}`)

  await kb.patchClassifications(rid, plan.patch)

  // Read it back; repair (once) if a non-topic label went missing.
  const after = await kb.getBasic(rid)
  const missing = after ? droppedNonTopicLabels(before, readClassifications(after)) : []
  if (missing.length) {
    await kb.patchClassifications(rid, plan.patch as Classification[])
    return {
      task: item.task,
      outcome: 'written',
      warning: `after the topic write these labels read back missing and were re-sent: ${missing.map((c) => `${c.labelset}/${c.label}`).join(', ')}`,
    }
  }
  return { task: item.task, outcome: 'written' }
}

/** Write each item; failures propagate (KbBackpressure, KbHttpError, UnsafeWrite) for the caller to place. */
export async function writeItem(kb: KbApi, rid: string, item: WriteItem): Promise<WriteOutcome> {
  return isSummaryTask(item.task) ? writeSummary(kb, rid, item) : writeTopics(kb, rid, item)
}
