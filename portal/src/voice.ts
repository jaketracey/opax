import {body, CommunityError, digest, json, limit, member, now, requireMember, sameOrigin, text} from './community-core'
import {boundedJson, runVoiceTool, type PublicReader} from './voice-tools'

export const VOICE_ALLOWANCE_SECONDS = 600
const RESERVATION_SECONDS = 60
const MAX_MONTHLY_SECONDS = 40_000
const MAX_ACTIVE_SESSIONS = 2
const PROVIDER_ORIGIN = 'https://api.elevenlabs.io'

type Session = {
  id: string; member_id: string; state: string; reserved_seconds: number; charged_seconds: number
  created_at: number; expires_at: number; started_at: number | null; conversation_id: string | null
}
type VoiceConfig = {VOICE_ENABLED?: string; VOICE_AGENT_ID?: string; ELEVENLABS_API_KEY?: string; VOICE_TOOL_SECRET?: string; VOICE_MONTHLY_SECONDS?: string}
type VoiceEnv = Env & VoiceConfig
const configured = (env: VoiceEnv) => String(env.VOICE_ENABLED) === 'true' && !!env.VOICE_AGENT_ID && !!env.ELEVENLABS_API_KEY && (env.VOICE_TOOL_SECRET?.length ?? 0) >= 32
const monthStart = (timestamp: number) => {const d = new Date(timestamp * 1000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000}
const monthlyLimit = (env: VoiceEnv) => Math.max(0, Math.min(MAX_MONTHLY_SECONDS, Number.isFinite(Number(env.VOICE_MONTHLY_SECONDS)) ? Math.floor(Number(env.VOICE_MONTHLY_SECONDS)) : MAX_MONTHLY_SECONDS))

export async function expireVoiceSessions(env: VoiceEnv, timestamp = now()): Promise<void> {
  // No connection was ever claimed, so an unused reservation is safe to release.
  await env.COMMUNITY_DB.prepare("UPDATE voice_sessions SET state='cancelled',charged_seconds=0,closed_at=? WHERE state='reserved' AND expires_at<=?").bind(timestamp, timestamp).run()
  // Uncertain disconnects remain fully charged. Never trust a client claim that
  // the call ended, or give it another reservation while an old socket can run.
  await env.COMMUNITY_DB.prepare("UPDATE voice_sessions SET state='expired',closed_at=? WHERE state IN ('connecting','active') AND expires_at<=?").bind(timestamp, timestamp).run()
}

/** One SQLite write atomically checks member balance, monthly budget and locks. */
export async function reserveVoiceSession(env: VoiceEnv, memberId: string, timestamp = now()): Promise<Session | null> {
  const id = crypto.randomUUID()
  // Include the previous month's final twelve minutes conservatively: a
  // reservation made then can still be running across the billing boundary.
  return env.COMMUNITY_DB.prepare(`
    WITH balances AS (
      SELECT
        CASE WHEN EXISTS (SELECT 1 FROM voice_access WHERE member_id=? AND unlimited=1) THEN ?
          ELSE ? - COALESCE(SUM(CASE WHEN member_id=? THEN charged_seconds ELSE 0 END),0) END AS personal,
        ? - COALESCE(SUM(CASE WHEN created_at>=? THEN charged_seconds ELSE 0 END),0) AS monthly,
        COUNT(CASE WHEN state IN ('reserved','connecting','active') THEN 1 END) AS active
      FROM voice_sessions
    )
    INSERT INTO voice_sessions(id,member_id,state,reserved_seconds,charged_seconds,created_at,expires_at)
    SELECT ?,?,'reserved',MIN(personal,monthly),MIN(personal,monthly),?,? FROM balances
    WHERE personal>0 AND monthly>0 AND active<?
      AND NOT EXISTS (SELECT 1 FROM voice_sessions WHERE member_id=? AND state IN ('reserved','connecting','active'))
    RETURNING *
  `).bind(memberId, VOICE_ALLOWANCE_SECONDS, VOICE_ALLOWANCE_SECONDS, memberId, monthlyLimit(env), monthStart(timestamp) - VOICE_ALLOWANCE_SECONDS - RESERVATION_SECONDS - 60, id, memberId, timestamp, timestamp + RESERVATION_SECONDS, MAX_ACTIVE_SESSIONS, memberId).first<Session>()
}

export async function claimVoiceSession(env: VoiceEnv, memberId: string, id: string, timestamp = now()): Promise<Session | null> {
  return env.COMMUNITY_DB.prepare("UPDATE voice_sessions SET state='connecting',started_at=?,expires_at=?+reserved_seconds+30 WHERE id=? AND member_id=? AND state='reserved' AND expires_at>? RETURNING *").bind(timestamp, timestamp, id, memberId, timestamp).first<Session>()
}

/** Call only after the provider socket confirms closure. Idempotent and atomic. */
export async function reconcileVoiceSession(env: VoiceEnv, id: string, seconds: number, timestamp = now()): Promise<void> {
  if (!Number.isFinite(seconds) || seconds < 0) return
  await env.COMMUNITY_DB.prepare("UPDATE voice_sessions SET state='closed',charged_seconds=MIN(reserved_seconds,?),closed_at=? WHERE id=? AND state IN ('connecting','active')").bind(Math.ceil(seconds), timestamp, id).run()
}

async function releaseUnusedSession(env: VoiceEnv, id: string): Promise<void> {
  await env.COMMUNITY_DB.prepare("UPDATE voice_sessions SET state='cancelled',charged_seconds=0,closed_at=? WHERE id=? AND state IN ('reserved','connecting')").bind(now(), id).run()
}

async function voiceStatus(env: VoiceEnv, memberId: string | null) {
  if (!memberId) return {enabled: configured(env), signed_in: false, total_seconds: VOICE_ALLOWANCE_SECONDS, remaining_seconds: VOICE_ALLOWANCE_SECONDS, active_session: null}
  const access = await env.COMMUNITY_DB.prepare('SELECT unlimited FROM voice_access WHERE member_id=?').bind(memberId).first<{unlimited:number}>()
  const unlimited = access?.unlimited === 1
  const used = await env.COMMUNITY_DB.prepare('SELECT COALESCE(SUM(charged_seconds),0) AS seconds FROM voice_sessions WHERE member_id=?').bind(memberId).first<{seconds: number}>()
  const active = await env.COMMUNITY_DB.prepare("SELECT * FROM voice_sessions WHERE member_id=? AND state IN ('reserved','connecting','active')").bind(memberId).first<Session>()
  const reservedRemaining = active ? Math.max(0, active.reserved_seconds - (active.started_at == null ? 0 : now() - active.started_at)) : 0
  return {enabled: configured(env), signed_in: true, unlimited, total_seconds: unlimited ? null : VOICE_ALLOWANCE_SECONDS,
    remaining_seconds: unlimited ? (active ? reservedRemaining : VOICE_ALLOWANCE_SECONDS) : Math.max(0, VOICE_ALLOWANCE_SECONDS - (used?.seconds ?? 0)) + reservedRemaining,
    active_session: active ? {id: active.id, expires_at: active.expires_at, state: active.state} : null}
}

async function toolAuthorized(req: Request, env: VoiceEnv): Promise<void> {
  const supplied = req.headers.get('x-opax-voice-token') ?? ''
  if (!env.VOICE_TOOL_SECRET || supplied.length < 32 || supplied.length > 200) throw new CommunityError(401, 'Voice tool authentication is required.')
  // Digest both inputs to fixed length before a constant-time comparison.
  const a = new TextEncoder().encode(await digest(supplied)), b = new TextEncoder().encode(await digest(env.VOICE_TOOL_SECRET))
  if (!crypto.subtle.timingSafeEqual(a, b)) throw new CommunityError(401, 'Voice tool authentication is required.')
}

function validSessionId(value: unknown): string {
  const id = text(value, 36, 36, 'Session')
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)) throw new CommunityError(400, 'Invalid voice session.')
  return id
}

/** Drop all client overrides, tool results, user IDs and dynamic variables. */
export function voiceClientEvent(raw: unknown, sessionId: string, seconds: number, initialized: boolean): {payload: string | null; initializes?: boolean} {
  if (typeof raw !== 'string' || raw.length > 192_000) throw new Error('Invalid voice message')
  const event: unknown = JSON.parse(raw)
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('Invalid voice message')
  const item = event as Record<string, unknown>
  if (item.type === 'conversation_initiation_client_data') {
    if (initialized) throw new Error('Session already started')
    return {initializes: true, payload: JSON.stringify({type: 'conversation_initiation_client_data', conversation_config_override: {conversation: {max_duration_seconds: seconds}}, dynamic_variables: {opax_session_id: sessionId}})}
  }
  if (!initialized) throw new Error('Start the conversation first')
  if (typeof item.user_audio_chunk === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(item.user_audio_chunk)) return {payload: JSON.stringify({user_audio_chunk: item.user_audio_chunk})}
  if (item.type === 'pong' && Number.isSafeInteger(item.event_id)) return {payload: JSON.stringify({type:'pong', event_id:item.event_id})}
  if (item.type === 'user_activity') return {payload: '{"type":"user_activity"}'}
  if ((item.type === 'user_message' || item.type === 'contextual_update') && typeof item.text === 'string' && item.text.length <= 2000) return {payload: JSON.stringify({type:item.type, text:item.text})}
  // Provider tools execute on the server. Client tool results cannot forge evidence.
  return {payload: null}
}

/** Isolated relay logic allows timer, replay and close-handshake regression tests. */
export function relayVoiceSockets(client: WebSocket, upstream: WebSocket, session: Session, onClosed: (seconds: number) => void, onConversation: (id: string) => void,
  clock: {time: () => number; schedule: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>; cancel: (id: ReturnType<typeof setTimeout>) => void} = {time: Date.now, schedule: setTimeout, cancel: clearTimeout},
  onClosing: (completion: Promise<void>) => void = () => {}) {
  const started = clock.time(), deadline = started + session.reserved_seconds * 1000
  let initialized = false, closing = false, reconciled = false, second = 0, messages = 0
  let transportClosed!: () => void
  const transportCompletion = new Promise<void>(resolve => {transportClosed = resolve})
  const close = (socket: WebSocket, code: number, reason: string) => {try {socket.close(code, reason)} catch {/* A socket may already have closed. */}}
  const stop = (code = 1000, reason = 'Voice conversation ended') => {
    if (closing) return
    closing = true
    clock.cancel(timer); clock.cancel(initTimer)
    // The browser disconnect otherwise ends the invocation before a remote
    // close acknowledgement arrives. Hold it briefly, without granting credit
    // if that acknowledgement never arrives.
    const closeTimer = clock.schedule(transportClosed, 20_000)
    onClosing(transportCompletion.finally(() => clock.cancel(closeTimer)))
    close(upstream, code, reason); close(client, code, reason)
  }
  const timer = clock.schedule(() => stop(1000, 'Your free voice time has finished'), session.reserved_seconds * 1000)
  const initTimer = clock.schedule(() => {if (!initialized) stop(1008, 'Voice connection timed out')}, 10_000)
  client.addEventListener('message', event => {
    if (closing) return
    if (clock.time() >= deadline) {stop(1000, 'Your free voice time has finished'); return}
    const currentSecond = Math.floor(clock.time() / 1000)
    if (second !== currentSecond) {second = currentSecond; messages = 0}
    if (++messages > 150) {stop(1008, 'Too many voice messages'); return}
    try {
      const normalized = voiceClientEvent(event.data, session.id, Math.max(1, Math.floor((deadline - clock.time()) / 1000)), initialized)
      if (normalized.initializes) {initialized = true; clock.cancel(initTimer)}
      if (normalized.payload) upstream.send(normalized.payload)
    } catch {stop(1008, 'Invalid voice message')}
  })
  upstream.addEventListener('message', event => {
    if (closing) return
    if (clock.time() >= deadline) {stop(1000, 'Your free voice time has finished'); return}
    if (typeof event.data !== 'string' || event.data.length > 1_000_000) {stop(1008, 'Invalid provider message'); return}
    try {
      const data = JSON.parse(event.data) as Record<string, unknown>
      if (data.type === 'conversation_initiation_metadata') {
        const meta = data.conversation_initiation_metadata_event as Record<string, unknown> | undefined
        if (typeof meta?.conversation_id === 'string' && /^conv_[\w-]{1,100}$/.test(meta.conversation_id)) onConversation(meta.conversation_id)
      }
      client.send(event.data)
    } catch {stop(1011, 'Voice provider connection failed')}
  })
  client.addEventListener('close', () => stop())
  client.addEventListener('error', () => stop(1011, 'Voice connection interrupted'))
  upstream.addEventListener('error', () => stop(1011, 'Voice provider connection interrupted'))
  upstream.addEventListener('close', event => {
    stop()
    // A network loss (1006 / unclean close) cannot prove the remote call ended.
    // Keep the reservation in that case until its provider-enforced deadline.
    if (!reconciled && event.wasClean && event.code !== 1006) {reconciled = true; onClosed(Math.max(0, (clock.time() - started) / 1000))}
    transportClosed()
  })
  return {stop}
}

async function connect(req: Request, env: VoiceEnv, ctx: ExecutionContext, memberId: string): Promise<Response> {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({error:'Use the voice connection.'}, 426, {upgrade:'websocket'})
  const id = validSessionId(new URL(req.url).searchParams.get('session_id'))
  const session = await claimVoiceSession(env, memberId, id)
  if (!session) throw new CommunityError(409, 'This voice connection has already been used or expired.')
  // A single-use provider signature is held solely by this Worker. Even an
  // authenticated browser cannot connect around its allowance or replay it.
  let signed: Record<string, unknown>
  try {
    const url = PROVIDER_ORIGIN + '/v1/convai/conversation/get-signed-url?' + new URLSearchParams({agent_id: env.VOICE_AGENT_ID!, include_conversation_id:'true'})
    signed = await boundedJson(await fetch(url, {headers: {'xi-api-key':env.ELEVENLABS_API_KEY!}, signal: AbortSignal.timeout(10_000), redirect:'manual'}), 10_000)
  } catch {
    await releaseUnusedSession(env, id)
    throw new CommunityError(503, 'The voice assistant is temporarily unavailable. Your time has not been used.')
  }
  let providerUrl: URL
  try {providerUrl = new URL(String(signed.signed_url))} catch {await releaseUnusedSession(env,id); throw new CommunityError(503, 'The voice connection could not be prepared.')}
  if (providerUrl.protocol !== 'wss:' || providerUrl.hostname !== 'api.elevenlabs.io' || providerUrl.pathname !== '/v1/convai/conversation' || providerUrl.port) {
    await releaseUnusedSession(env, id)
    throw new CommunityError(503, 'The voice connection could not be prepared.')
  }
  const providerConversationId = providerUrl.searchParams.get('conversation_id')
  if (providerConversationId && /^conv_[\w-]{1,100}$/.test(providerConversationId)) {
    // Preserve the provider-issued identifier even if the network upgrade has
    // an uncertain outcome. The signature itself is never stored or returned.
    await env.COMMUNITY_DB.prepare("UPDATE voice_sessions SET conversation_id=? WHERE id=? AND state='connecting' AND conversation_id IS NULL").bind(providerConversationId, id).run()
  }
  providerUrl.protocol = 'https:'
  // If this network handshake has an uncertain outcome, retain the reservation.
  // Clear the handshake deadline after the upgrade: its abort signal must not
  // remain scheduled against a live conversation's underlying connection.
  const controller = new AbortController(), handshakeTimer = setTimeout(() => controller.abort(), 10_000)
  let response: Response
  try {
    response = await fetch(providerUrl, {headers: {Upgrade:'websocket', Origin:env.COMMUNITY_ORIGIN, 'Sec-WebSocket-Protocol':'convai'}, signal: controller.signal, redirect:'manual'})
  } finally {clearTimeout(handshakeTimer)}
  const upstream = response.webSocket
  if (!upstream) {await response.body?.cancel(); await releaseUnusedSession(env, id); throw new CommunityError(503, 'The voice provider is busy. Please try again shortly.')}
  const [browser, client] = Object.values(new WebSocketPair())
  const startedAt = now()
  try {
    await env.COMMUNITY_DB.prepare("UPDATE voice_sessions SET state='active',started_at=?,expires_at=? WHERE id=? AND state='connecting'").bind(startedAt, startedAt + session.reserved_seconds + 30, id).run()
  } catch {
    upstream.accept(); client.accept()
    upstream.close(1011, 'Session unavailable'); client.close(1011, 'Session unavailable')
    throw new CommunityError(503, 'The voice session could not be recorded.')
  }
  relayVoiceSockets(client, upstream, session,
    seconds => ctx.waitUntil(reconcileVoiceSession(env, id, seconds)),
    conversationId => ctx.waitUntil(env.COMMUNITY_DB.prepare("UPDATE voice_sessions SET conversation_id=? WHERE id=? AND conversation_id IS NULL").bind(conversationId, id).run().then(() => {})),
    undefined, completion => ctx.waitUntil(completion))
  // ElevenLabs can send metadata immediately on upgrade, before client init.
  // Complete database I/O and attach every listener before activating either
  // socket; otherwise that first event is lost during an awaited D1 write.
  client.accept(); upstream.accept()
  // The ElevenLabs browser SDK requests `convai`; omitting this negotiation
  // makes browsers reject an otherwise valid same-origin WebSocket upgrade.
  const protocols = req.headers.get('sec-websocket-protocol')?.split(',').map(value => value.trim()) ?? []
  return new Response(null, {status:101, webSocket:browser, headers:{'cache-control':'no-store','referrer-policy':'no-referrer', ...(protocols.includes('convai') ? {'sec-websocket-protocol':'convai'} : {})}})
}

export async function voiceRoute(req: Request, env: VoiceEnv, ctx: ExecutionContext, readPublic: PublicReader): Promise<Response> {
  try {
    const path = new URL(req.url).pathname.slice('/api/voice/'.length)
    if (path.startsWith('tools/')) {
      if (req.method !== 'POST') return json({error:'Use POST for voice tools.'},405,{allow:'POST'})
      if (!configured(env)) throw new CommunityError(503, 'Voice is currently unavailable.')
      await toolAuthorized(req, env)
      const args = await body(req, 8_000), sessionId = validSessionId(args.session_id)
      const session = await env.COMMUNITY_DB.prepare("SELECT v.id FROM voice_sessions v JOIN members m ON m.id=v.member_id WHERE v.id=? AND v.state='active' AND v.started_at+v.reserved_seconds>? AND m.disabled=0").bind(sessionId, now()).first()
      if (!session) throw new CommunityError(403, 'This voice session has ended.')
      await limit(env, 'voice-tool:' + sessionId, 30, 60)
      return json(await runVoiceTool(path.slice(6), args, env, readPublic))
    }
    if (String(env.COMMUNITY_ENABLED) !== 'true') throw new CommunityError(503, 'Community access is being prepared.')
    if (path === 'status' && req.method === 'GET') {
      const current = await member(req, env)
      if (current) await expireVoiceSessions(env)
      return json(await voiceStatus(env, current?.id ?? null))
    }
    sameOrigin(req, env)
    const current = await requireMember(req, env)
    if (path === 'start' && req.method === 'POST') {
      if (!configured(env)) throw new CommunityError(503, 'The voice assistant is being prepared. Please try again later.')
      await body(req, 2000)
      await limit(env, 'voice-start-member:' + current.id, 6, 60)
      await limit(env, 'voice-start-ip:' + (req.headers.get('cf-connecting-ip') ?? 'unknown'), 20, 60)
      await expireVoiceSessions(env)
      const session = await reserveVoiceSession(env, current.id)
      if (!session) {
        const status = await voiceStatus(env, current.id)
        if (status.active_session) throw new CommunityError(409, 'You already have a voice conversation open.')
        if (status.remaining_seconds <= 0) throw new CommunityError(403, 'You have used your ten free minutes of voice conversation.')
        throw new CommunityError(429, 'The voice assistant is at capacity. Please try again later.')
      }
      const url = new URL('/api/voice/connect', env.COMMUNITY_ORIGIN)
      url.protocol = 'wss:'; url.searchParams.set('session_id', session.id)
      return json({session_id:session.id, transport:'websocket', signed_url:url.href, remaining_seconds:session.reserved_seconds, expires_at:session.expires_at}, 201)
    }
    if (path === 'connect' && req.method === 'GET') {
      if (!configured(env)) throw new CommunityError(503, 'Voice is currently unavailable.')
      return await connect(req, env, ctx, current.id)
    }
    if (path === 'finish' && req.method === 'POST') {
      const input = await body(req, 1000), id = validSessionId(input.session_id)
      // The browser may cancel an unused reservation. An active socket must
      // actually close before any unused allowance can be returned.
      await env.COMMUNITY_DB.prepare("UPDATE voice_sessions SET state='cancelled',charged_seconds=0,closed_at=? WHERE id=? AND member_id=? AND state='reserved'").bind(now(),id,current.id).run()
      await expireVoiceSessions(env)
      return json(await voiceStatus(env, current.id))
    }
    return json({error:'Voice endpoint not found.'}, 404)
  } catch (error) {
    if (error instanceof CommunityError) return json({error:error.message}, error.status)
    return json({error:'The voice assistant is temporarily unavailable.'}, 503)
  }
}
