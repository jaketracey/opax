import { readClassifications } from './classify.ts'
import type { KbResource } from './kb.ts'
import { clip } from './text.ts'

export const HISTORIC_SOURCE = 'hansard_hist'
export const HISTORIC_MIN_CHARS = 200

/** Only an active source/hansard_hist AND kind/speech label enables the backfill rules. */
export function isHistoricSpeech(resource: KbResource): boolean {
  const labels = readClassifications(resource).filter((c) => !c.cancelled_by_user)
  return labels.some((c) => c.labelset === 'source' && c.label === HISTORIC_SOURCE) &&
    labels.some((c) => c.labelset === 'kind' && c.label === 'speech')
}

/** Unicode characters, after the summariser's whitespace normalisation and clipping. */
export const summaryCharacters = (text: string): number => Array.from(clip(text)).length

export const skipHistoricShort = (historic: boolean, text: string): boolean =>
  historic && summaryCharacters(text) < HISTORIC_MIN_CHARS
