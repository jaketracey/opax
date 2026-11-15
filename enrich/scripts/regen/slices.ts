// The 5b-cheap slices, in run order, and the per-row filter each one enforces in code. The rid files only
// propose rows: a row outside its slice's filter is skipped before anything is spent.
import { readClassifications } from '../../src/classify.ts'
import { HISTORIC_SOURCE } from '../../src/historic.ts'
import type { KbResource } from '../../src/kb.ts'
import { pickText, wordCount } from '../../src/text.ts'

export const SLICES = {
  /** The 1998-2000 Workers AI briefs (zenodo source; titles carry no debate heading). */
  zenodo: { order: 1, variants: ['b'] as const },
  /** Committee witness turns whose brief a free regex flags (asker verb, opens Moved, or the committee speaking). */
  witness: { order: 2, variants: ['role', 'b'] as const },
  /** The remaining gpt-oss escalations, if the cap leaves room. */
  gptoss: { order: 3, variants: ['b'] as const },
} as const
export type SliceName = keyof typeof SLICES

/** Each slice owns one band of `seq`, so a slice can never run before an earlier one (see store.nextPending). */
export const SEQ_BAND = 10_000_000
export const seqBase = (slice: SliceName): number => SLICES[slice].order * SEQ_BAND

/** Turns under this many words are hidden from display (portal short-turn rule), so never regenerated. */
export const SHORT_TURN_WORDS = 80

const ASKER = '(asked|questioned|queried|sought|pressed)'
const ASK_OPEN = new RegExp(`^\\W*${ASKER}\\b`, 'i')
const ASK = new RegExp(`\\b${ASKER}\\b`, 'i')
const COMMITTEE = /\b(the )?committee (stated|said|says|moved|noted|agreed|resolved|confirmed|explained|indicated|clarified|acknowledged|argued|announced|reported|asked|questioned|sought|pressed)\b/i
const MOVED = /^\W*(moved|seconded)\b/i

/** The witness-brief filter from the 5b-cheap costing (5b/cheap/filter.py), unchanged. */
export function witnessHit(brief: string | null | undefined): string | null {
  const b = brief ?? ''
  if (ASK_OPEN.test(b)) return 'opens-asker'
  if (COMMITTEE.test(b)) return 'committee-attribution'
  if (MOVED.test(b)) return 'moved'
  if (ASK.test(b)) return 'contains-asker'
  return null
}

/** The year of the record: zenodo titles end with the sitting date (YYYY-MM-DD). */
export const titleYear = (title: string | undefined): number | null => {
  const m = /(\d{4})-\d{2}-\d{2}\s*$/.exec(title ?? '')
  return m ? Number(m[1]) : null
}

/**
 * Why this row is outside its slice, or null when it belongs. Common to every slice: a speech (kind/speech),
 * not hansard_hist, at least SHORT_TURN_WORDS words.
 */
export function outsideSlice(slice: string, row: { variant: string; old_result: string; old_model: string | null }, resource: KbResource): string | null {
  if (!Object.hasOwn(SLICES, slice)) return `unknown slice '${slice}'`
  if (!(SLICES[slice as SliceName].variants as readonly string[]).includes(row.variant)) return `variant ${row.variant} is not allowed in this slice`
  const labels = readClassifications(resource).filter((c) => !c.cancelled_by_user)
  const has = (labelset: string, label: string) => labels.some((c) => c.labelset === labelset && c.label === label)
  if (!has('kind', 'speech')) return 'not kind/speech'
  if (has('source', HISTORIC_SOURCE)) return `source/${HISTORIC_SOURCE} is excluded`
  const words = wordCount(pickText(resource.data?.texts))
  if (words < SHORT_TURN_WORDS) return `short turn (${words} words, under ${SHORT_TURN_WORDS})`
  if (slice === 'zenodo') {
    if (!has('source', 'zenodo')) return 'not source/zenodo'
    const year = titleYear(resource.title)
    if (year === null || year < 1998 || year > 2000) return `title year ${year ?? 'missing'} is outside 1998-2000`
  } else if (slice === 'witness') {
    if (!has('speaker_type', 'witness')) return 'not speaker_type/witness'
    if (!witnessHit(row.old_result)) return 'the old brief does not match the witness filter'
  } else if (slice === 'gptoss') {
    if (!(row.old_model ?? '').startsWith('@cf/openai/gpt-oss')) return `old model ${row.old_model} is not a gpt-oss escalation`
  }
  return null
}
