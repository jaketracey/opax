import { saDisplayPayload } from '../public/sa-hansard.js'

/** The SA omission label is UI text, never evidence, even with full-text permission. It comes off before storage as
 * well as at the public boundary. Attribution is not checked here: the answer stands as written. */
export function withoutSaLabel<T extends { answer: string; citations: Record<string, unknown>; sources: unknown[] }>(payload: T): T {
  return saDisplayPayload(payload, 'true')
}
