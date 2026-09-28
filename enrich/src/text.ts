// Picking and clipping the text a model is asked to read.

export const FIELD = 'da-summary-t-body'
/** summary_workers.TEXT_HEAD / TEXT_TAIL: only very long speeches are clipped. */
export const TEXT_HEAD = 12000
export const TEXT_TAIL = 1800

type TextField = { value?: { body?: string | null } | null } | null | undefined

/**
 * The record's own text: the LONGEST text field whose name does not contain
 * "summary". The machine brief `da-summary-t-body` sits beside the speech body
 * and must never be summarised (a worker handed the brief judges two sentences
 * and calls the speech thin). Same rule as label_workers.fetch_item and
 * summary_workers.fetch_item.
 */
export function pickText(texts: Record<string, TextField> | null | undefined): string {
  let body = ''
  for (const [name, field] of Object.entries(texts ?? {})) {
    if (String(name).toLowerCase().includes('summary')) continue
    const candidate = field?.value?.body ?? ''
    if (typeof candidate === 'string' && candidate.length > body.length) body = candidate
  }
  return body
}

/** The existing machine brief, trimmed ('' when none). */
export function existingSummary(texts: Record<string, TextField> | null | undefined): string {
  const body = texts?.[FIELD]?.value?.body
  return typeof body === 'string' ? body.trim() : ''
}

export const squash = (s: string): string => s.split(/\s+/).filter(Boolean).join(' ')

/** summary_workers.clip: collapse whitespace, keep the head and the tail of a very long text. */
export function clip(text: string): string {
  const flat = squash(text)
  if (flat.length <= TEXT_HEAD + TEXT_TAIL + 40) return flat
  return `${flat.slice(0, TEXT_HEAD)} [...] ${flat.slice(-TEXT_TAIL)}`
}

export const wordCount = (s: string): number => s.split(/\s+/).filter(Boolean).length
