/** Runtime switches the project lead can flip without a deploy.
 *
 * transcript quotes only: hearing transcript evidence is never worded by a model; code quotes each selected excerpt.
 * OFF by default. Read from the KV namespace GENERATION_CACHE, key QUOTES_ONLY_KEY, value "on". Anything else, a
 * missing key or a failed read is off. The value is held for 30 seconds per isolate, so a flip takes effect within
 * that time. The answer cache key carries the state, so an answer written under one setting is never served under
 * the other.
 *
 * To turn it on in production (the project lead only; agents never write this key), from portal/:
 *   npx wrangler kv key put "flag:ask-transcript-quotes-only" on --binding GENERATION_CACHE --remote
 * and off again:
 *   npx wrangler kv key put "flag:ask-transcript-quotes-only" off --binding GENERATION_CACHE --remote
 *
 * A local Worker reads the variable ASK_TRANSCRIPT_QUOTES_ONLY first ("on" or "off"), so a local run never depends on,
 * or reads, the production key: add ASK_TRANSCRIPT_QUOTES_ONLY=on to portal/.dev.vars, or start wrangler dev with
 * --var ASK_TRANSCRIPT_QUOTES_ONLY:on. The variable is not set in wrangler.jsonc, so in production the KV key decides. */
export const QUOTES_ONLY_KEY = 'flag:ask-transcript-quotes-only'
const HOLD_MS = 30_000
type FlagEnv = { ASK_TRANSCRIPT_QUOTES_ONLY?: string; GENERATION_CACHE?: { get(key: string): Promise<string | null> } }
let held: { at: number; on: boolean } | undefined
const forced = (env: FlagEnv): boolean | undefined => env.ASK_TRANSCRIPT_QUOTES_ONLY === 'on' ? true : env.ASK_TRANSCRIPT_QUOTES_ONLY === 'off' ? false : undefined
/** Read the switch at the start of a request. */
export async function refreshTranscriptQuotesOnly(env: FlagEnv, now = Date.now()): Promise<boolean> {
  const local = forced(env)
  if (local !== undefined) return local
  if (held && now - held.at < HOLD_MS) return held.on
  let on = false
  try { on = (await env.GENERATION_CACHE?.get(QUOTES_ONLY_KEY)) === 'on' } catch { on = false }
  held = { at: now, on }
  return on
}
/** The state read at the start of this request (off until read). */
export const transcriptQuotesOnly = (env: FlagEnv): boolean => forced(env) ?? held?.on ?? false
/** For tests: forget the held value. */
export const forgetTranscriptQuotesOnly = (): void => { held = undefined }
