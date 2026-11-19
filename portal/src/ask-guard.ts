/**
 * Who may start a paid model call, and how much a day may spend on them.
 *
 * Why: from 17 Nov 2026 overseas desktop Chrome with no referrer (BD, UZ, ET, NG, VN, AE, BR) sent
 * 53, 134 and 127 web Asks a day against 2 to 21 before, each address under the per-minute limit.
 *
 * A paid request (POST /api/ask, /api/followups, /api/journey-story, /api/search-summary, and an
 * app's GET search summary) passes three checks in the Worker before it is routed (index.ts):
 *  1. the day's total, ASK_DAILY_USD, still has room for a call (one D1 read; any failure refuses);
 *  2. on the website only, a question carries a fresh Turnstile token or a signed pass from an
 *     earlier one, while TURNSTILE_SECRET_KEY is set (the apps never see a challenge);
 *  3. the address's questions and other paid requests today stay under ASK_ADDRESS_DAILY and
 *     ASK_ADDRESS_DAILY_EXTRAS. The key is an HMAC of the UTC day and the address under a Worker
 *     secret, so the address is never stored.
 * Then every model call reserves its ceiling from the same total and settles (kbFetch, research loop).
 * A refusal is the existing `rate-limited` shape: a 429 with an `error` sentence and Retry-After.
 */
import { askDailyBudget, type ResearchReservation } from './research-budget'
import { appUserAgent } from './reports-gate'

export interface AskGuardEnv {
  /** On unless exactly "off". Only the offline test harnesses set "off"; a deployed Worker never does. */
  ASK_GUARD?: string
  COMMUNITY_DB?: D1Database
  ASK_DAILY_USD?: string
  ASK_CALL_USD?: string
  ASK_ADDRESS_DAILY?: string
  ASK_ADDRESS_DAILY_EXTRAS?: string
  ASK_GUARD_SECRET?: string
  ARAG_KB_TOKEN?: string
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET_KEY?: string
}

export type AskGuardKind = 'ask' | 'followups' | 'extra'
export interface AskGuardResult { refused?: Response; pass?: string }

export const DAILY_LIMIT_MESSAGE = "Today's question limit has been reached. Search and every page still work. Please try your question again later."
export const CHECK_MESSAGE = 'Please reload the page to ask a question.'
/** The reader's signed pass, sent back on later questions and follow-ups. */
export const ASK_PASS_HEADER = 'x-opax-ask-pass'
/** A Turnstile token from the widget, for a question without a pass. */
export const TURNSTILE_HEADER = 'x-opax-turnstile'
/** Present on a challenge: the site key the page renders the widget with. */
export const ASK_CHECK_HEADER = 'x-opax-ask-check'
/** Which limit refused: daily (the day's total) or address. */
export const ASK_LIMIT_HEADER = 'x-opax-ask-limit'
export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export const DEFAULT_ASK_CALL_USD = 0.02
export const DEFAULT_ADDRESS_QUESTIONS = 40
export const DEFAULT_ADDRESS_EXTRAS = 120
export const PASS_SECONDS = 30 * 60
export const PASS_QUESTIONS = 20

const whole = (value: string | undefined, fallback: number) => {
  const n = value === undefined ? fallback : Number(value)
  return Number.isSafeInteger(n) && n >= 0 ? n : 0
}
/** The charge for one platform generation: a ceiling, since its real cost is not reported back. */
export function askCallUsd(env: Pick<AskGuardEnv, 'ASK_CALL_USD'>): number {
  const n = env.ASK_CALL_USD === undefined ? DEFAULT_ASK_CALL_USD : Number(env.ASK_CALL_USD)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ASK_CALL_USD
}
export const askGuardOn = (env: Pick<AskGuardEnv, 'ASK_GUARD'>) => env.ASK_GUARD !== 'off'
export const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10)
const untilUtcMidnight = (now: number) => Math.max(60, Math.ceil((Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate() + 1) - now) / 1000))

/** The paid routes this guard covers. A GET never starts a model call, except the installed apps'
 * search summary (every shipped build reads it by GET), which takes the same limits as a POST. */
export function askGuardKind(method: string, pathname: string, userAgent: string | null): AskGuardKind | null {
  if (method === 'POST' && pathname === '/api/ask') return 'ask'
  if (method === 'POST' && pathname === '/api/followups') return 'followups'
  if (method === 'POST' && pathname === '/api/journey-story') return 'extra'
  if (pathname === '/api/search-summary' && summaryMayGenerate(method, userAgent)) return 'extra'
  return null
}
export const summaryMayGenerate = (method: string, userAgent: string | null) => method === 'POST' || (method === 'GET' && appUserAgent(userAgent))

/** A refusal in the shape every client already handles. Follow-ups are an extra that is never an error. */
export function limitResponse(kind: AskGuardKind, reason: 'daily' | 'address', now = Date.now()): Response {
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', [ASK_LIMIT_HEADER]: reason }
  if (kind === 'followups') return new Response(JSON.stringify({ questions: [] }), { headers })
  return new Response(JSON.stringify({ error: DAILY_LIMIT_MESSAGE }), { status: 429, headers: { ...headers, 'retry-after': String(untilUtcMidnight(now)) } })
}
function challengeResponse(kind: AskGuardKind, siteKey: string | undefined): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  if (siteKey) headers[ASK_CHECK_HEADER] = siteKey
  if (kind === 'followups') return new Response(JSON.stringify({ questions: [] }), { headers })
  return new Response(JSON.stringify({ error: CHECK_MESSAGE }), { status: 403, headers })
}

/** One paid call's charge against the day's total. Null when the day is spent or the ledger cannot be
 * reached: the caller does not make the call (fail closed). */
export async function reserveAskSpend(env: AskGuardEnv, usd = askCallUsd(env)): Promise<ResearchReservation | null> {
  if (!env.COMMUNITY_DB) return null
  try { return await askDailyBudget(env.COMMUNITY_DB, env.ASK_DAILY_USD).reserve(usd) }
  catch (error) {
    console.log(JSON.stringify({ level: 'warn', message: `ask spend ledger refused: ${String(error)}` }))
    return null
  }
}

export async function askGuard(request: Request, env: AskGuardEnv, kind: AskGuardKind, now = Date.now()): Promise<AskGuardResult> {
  const db = env.COMMUNITY_DB
  if (!db) return { refused: limitResponse(kind, 'daily', now) }
  try {
    if (!await askDailyBudget(db, env.ASK_DAILY_USD, () => now).available(askCallUsd(env))) return { refused: limitResponse(kind, 'daily', now) }
  } catch { return { refused: limitResponse(kind, 'daily', now) } }
  const address = request.headers.get('cf-connecting-ip')
  let pass: string | undefined
  if (env.TURNSTILE_SECRET_KEY && kind !== 'extra' && !appUserAgent(request.headers.get('user-agent'))) {
    const checked = await humanCheck(request, env, db, kind, address, now)
    if (checked.refused) return checked
    pass = checked.pass
  }
  // Cloudflare always sets the address on a reader's request; only in-Worker calls arrive without one.
  if (address && !await addressAdmitted(db, env, address, kind, now).catch(() => false)) return { refused: limitResponse(kind, 'address', now) }
  return { pass }
}

async function humanCheck(request: Request, env: AskGuardEnv, db: D1Database, kind: AskGuardKind, address: string | null, now: number): Promise<AskGuardResult> {
  const secret = env.ASK_GUARD_SECRET
  const presented = request.headers.get(ASK_PASS_HEADER)
  if (presented && secret) {
    const id = await readPass(presented, secret, now)
    // Follow-up chips ride on the question's pass without spending one of its questions.
    if (id && (kind === 'followups' || await usePass(db, id, now).catch(() => false))) return {}
  }
  if (kind === 'followups') return { refused: challengeResponse(kind, env.TURNSTILE_SITE_KEY) }
  const token = request.headers.get(TURNSTILE_HEADER)
  if (!token || !await siteverify(token, env.TURNSTILE_SECRET_KEY!, address)) return { refused: challengeResponse(kind, env.TURNSTILE_SITE_KEY) }
  // Without a pass key every question needs its own check; that is all a missing key costs.
  if (!secret) return {}
  return { pass: await issuePass(db, secret, now).catch(() => undefined) }
}

/** Cloudflare's server-side check: secret, token and the reader's address. A token verifies once;
 * presenting it again fails (timeout-or-duplicate), so a token is single use. */
export async function siteverify(token: string, secret: string, remoteip: string | null): Promise<boolean> {
  if (!token || token.length > 2048) return false
  const body = new URLSearchParams({ secret, response: token })
  if (remoteip) body.set('remoteip', remoteip)
  try {
    const res = await fetch(SITEVERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(5_000) })
    const out = await res.json().catch(() => null) as { success?: unknown } | null
    return res.ok && out?.success === true
  } catch { return false }
}

const encoder = new TextEncoder()
const hmacKey = (secret: string, usage: ('sign' | 'verify')[]) => crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usage)
const hex = (bytes: ArrayBuffer | Uint8Array) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('')
const b64url = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4)), c => c.charCodeAt(0))
const passMessage = (id: string, expires: number) => encoder.encode(`opax-ask-pass.v1.${id}.${expires}`)
const PASS_SHAPE = /^([0-9a-f]{32})\.(\d{10})\.([A-Za-z0-9_-]{43})$/

/** A pass is `<id>.<expiry seconds>.<HMAC>`; its questions are counted in D1 under the id. */
export async function issuePass(db: D1Database, secret: string, now: number): Promise<string> {
  const id = hex(crypto.getRandomValues(new Uint8Array(16)))
  const expires = Math.floor(now / 1000) + PASS_SECONDS
  await db.prepare('INSERT INTO ask_pass_uses (pass_id, utc_day, uses) VALUES (?, ?, 1)').bind(id, utcDay(now)).run()
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret, ['sign']), passMessage(id, expires))
  return `${id}.${expires}.${b64url(sig)}`
}
/** The pass id when the signature is ours and the pass has not expired; otherwise null. */
export async function readPass(value: string, secret: string, now: number): Promise<string | null> {
  const m = PASS_SHAPE.exec(value)
  if (!m) return null
  const expires = Number(m[2]), at = Math.floor(now / 1000)
  if (expires <= at || expires > at + PASS_SECONDS) return null
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret, ['verify']), unb64url(m[3]), passMessage(m[1], expires))
  return ok ? m[1] : null
}
async function usePass(db: D1Database, id: string, now: number): Promise<boolean> {
  const row = await db.prepare(`INSERT INTO ask_pass_uses (pass_id, utc_day, uses) VALUES (?, ?, 1)
    ON CONFLICT(pass_id) DO UPDATE SET uses = uses + 1 WHERE uses < ? RETURNING uses`).bind(id, utcDay(now), PASS_QUESTIONS).first<{ uses: number }>()
  return !!row
}

/** HMAC-SHA-256 of the UTC day and the address under ASK_GUARD_SECRET (or, until that is set, the knowledge
 * box token, another Worker secret). Never the address itself, and never the same key on two days. */
export async function addressKey(env: Pick<AskGuardEnv, 'ASK_GUARD_SECRET' | 'ARAG_KB_TOKEN'>, address: string, now: number): Promise<string> {
  const secret = env.ASK_GUARD_SECRET || env.ARAG_KB_TOKEN
  if (!secret) throw new Error('no address key')
  return hex(await crypto.subtle.sign('HMAC', await hmacKey(secret, ['sign']), encoder.encode(`opax-ask-address.v1.${utcDay(now)}.${address}`)))
}
async function addressAdmitted(db: D1Database, env: AskGuardEnv, address: string, kind: AskGuardKind, now: number): Promise<boolean> {
  const column = kind === 'ask' ? 'questions' : 'extras'
  const cap = kind === 'ask' ? whole(env.ASK_ADDRESS_DAILY, DEFAULT_ADDRESS_QUESTIONS) : whole(env.ASK_ADDRESS_DAILY_EXTRAS, DEFAULT_ADDRESS_EXTRAS)
  if (cap < 1) return false
  const row = await db.prepare(`INSERT INTO ask_address_daily (utc_day, address_hash, ${column}) VALUES (?, ?, 1)
    ON CONFLICT(utc_day, address_hash) DO UPDATE SET ${column} = ${column} + 1 WHERE ${column} < ? RETURNING ${column} AS n`)
    .bind(utcDay(now), await addressKey(env, address, now), cap).first<{ n: number }>()
  return !!row
}

/** Rows from before yesterday (UTC) carry nothing a check reads; the five-minute cron removes them. */
export async function pruneAskGuard(db: D1Database, now = Date.now()): Promise<void> {
  const before = utcDay(now - 86_400_000)
  await db.batch([
    db.prepare('DELETE FROM ask_address_daily WHERE utc_day < ?').bind(before),
    db.prepare('DELETE FROM ask_pass_uses WHERE utc_day < ?').bind(before),
  ])
}
