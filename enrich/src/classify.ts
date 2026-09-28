// Topic classifications and the merge that must never drop a non-topic label.
//
// A resource's classifications live in `usermetadata.classifications` next to
// the labelsets the whole site filters on (kind, source, state, party, chamber,
// decade, ...). PATCHing usermetadata.classifications REPLACES the list, so a
// topic write is always `existing minus labelset=="topic"` plus the new topic
// labels: exactly label_workers.cmd_submit's merge.

export interface Classification {
  labelset: string
  label: string
  cancelled_by_user?: boolean
}

interface RawClassification {
  labelset?: unknown
  label?: unknown
  cancelled_by_user?: unknown
}

/** The classifications a resource carries, as {labelset,label} pairs (a cancelled one keeps its flag). */
export function readClassifications(resource: unknown): Classification[] {
  const raw = (resource as { usermetadata?: { classifications?: RawClassification[] } } | null)?.usermetadata?.classifications
  if (!Array.isArray(raw)) return []
  const out: Classification[] = []
  for (const c of raw) {
    if (!c || typeof c.labelset !== 'string' || typeof c.label !== 'string' || !c.labelset || !c.label) continue
    const entry: Classification = { labelset: c.labelset, label: c.label }
    // label_workers drops the flag (a cancelled label would come back to life);
    // keeping a true flag leaves the resource exactly as the box has it.
    if (c.cancelled_by_user === true) entry.cancelled_by_user = true
    out.push(entry)
  }
  return out
}

/**
 * Whether the resource already has topic labels: an active user classification,
 * or a platform-labeler result in computedmetadata.field_classifications
 * (labels the platform's own labeler wrote live at the field level).
 */
export function hasTopicLabels(resource: unknown): boolean {
  if (readClassifications(resource).some((c) => c.labelset === 'topic' && !c.cancelled_by_user)) return true
  const fields = (resource as { computedmetadata?: { field_classifications?: Array<{ classifications?: RawClassification[] }> } } | null)
    ?.computedmetadata?.field_classifications
  if (!Array.isArray(fields)) return false
  return fields.some((f) => Array.isArray(f?.classifications) && f.classifications.some((c) => c?.labelset === 'topic'))
}

/**
 * The list to PATCH: every existing non-topic classification, then the new
 * topic labels. Existing topic entries are replaced by the new verdict.
 */
export function mergeTopicClassifications(existing: readonly Classification[], topics: readonly string[]): Classification[] {
  const kept = existing.filter((c) => c.labelset !== 'topic')
  return [...kept, ...topics.map((label) => ({ labelset: 'topic', label }))]
}

export interface TopicWritePlan {
  /** The full classifications list to PATCH, or null when nothing is to be written. */
  patch: Classification[] | null
  reason: 'write' | 'empty-verdict' | 'already-labelled'
}

/**
 * Decide whether and what to write for a topic verdict.
 *  - An empty verdict writes NOTHING (D1 is the ledger of what was read; the box records no "no topic" marker).
 *  - A resource that already has topic labels is left alone unless `force`.
 */
export function planTopicWrite(resource: unknown, topics: readonly string[], force: boolean): TopicWritePlan {
  if (topics.length === 0) return { patch: null, reason: 'empty-verdict' }
  if (!force && hasTopicLabels(resource)) return { patch: null, reason: 'already-labelled' }
  return { patch: mergeTopicClassifications(readClassifications(resource), topics), reason: 'write' }
}

/** Safety net: every non-topic classification in `before` must still be in `after`. Returns the ones that went missing. */
export function droppedNonTopicLabels(before: readonly Classification[], after: readonly Classification[]): Classification[] {
  const has = new Set(after.map((c) => `${c.labelset}\u0000${c.label}`))
  return before.filter((c) => c.labelset !== 'topic' && !has.has(`${c.labelset}\u0000${c.label}`))
}
