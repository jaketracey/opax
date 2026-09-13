/** One frozen edition per Melbourne day, independent delivery receipts per channel.
 * Claims are atomic in D1. An uncertain write is held for review, never blindly retried.
 */
import { composeDailyPost, envSources, melbourneDate, oauth1Header, postToX, xCredentials, type DailyPost, type DailyPostKind } from './daily-post'
import { OG_VERSION } from './og'

export const CHANNELS = ['x', 'facebook', 'instagram'] as const
export type Channel = typeof CHANNELS[number]
type SocialEnv = Pick<Env, 'ASSETS' | 'GENERATION_CACHE' | 'COMMUNITY_DB' | 'STAGING_API' | 'DAILY_POST_ENABLED' | 'X_API_KEY' | 'X_API_SECRET' | 'X_ACCESS_TOKEN' | 'X_ACCESS_TOKEN_SECRET' | 'X_ACCOUNT_ID' | 'X_USERNAME' | 'FACEBOOK_POST_ENABLED' | 'FACEBOOK_PAGE_ID' | 'FACEBOOK_PAGE_TOKEN' | 'INSTAGRAM_POST_ENABLED' | 'INSTAGRAM_ACCOUNT_ID' | 'INSTAGRAM_USERNAME' | 'INSTAGRAM_ACCESS_TOKEN' | 'META_API_VERSION'>
interface Receipt { channel: Channel; status: string; post_id: string | null; container_id: string | null; detail: string | null; updated_at: string }
const metaVersionReady = (env: SocialEnv) => /^v\d+\.0$/.test(env.META_API_VERSION ?? '')
const numericId = (value?: string): boolean => /^\d+$/.test(value ?? '')

export function readiness(env: SocialEnv): Record<Channel, { enabled: boolean; ready: boolean; reason: string }> {
  const configured = {
    x: !!(xCredentials(env) && numericId(env.X_ACCOUNT_ID) && /^[A-Za-z0-9_]{1,15}$/.test(env.X_USERNAME ?? '')),
    facebook: !!(metaVersionReady(env) && env.FACEBOOK_PAGE_TOKEN && numericId(env.FACEBOOK_PAGE_ID)),
    instagram: !!(metaVersionReady(env) && env.INSTAGRAM_ACCESS_TOKEN && numericId(env.INSTAGRAM_ACCOUNT_ID) && env.INSTAGRAM_USERNAME),
  }
  const enabled = { x: env.DAILY_POST_ENABLED === 'true', facebook: env.FACEBOOK_POST_ENABLED === 'true', instagram: env.INSTAGRAM_POST_ENABLED === 'true' }
  return Object.fromEntries(CHANNELS.map(channel => {
    const on = enabled[channel] && !env.STAGING_API
    return [channel, { enabled: on, ready: on && configured[channel], reason: env.STAGING_API ? 'staging' : !on ? 'disabled' : !configured[channel] ? 'account connection required' : 'configured; verified before publishing' }]
  })) as ReturnType<typeof readiness>
}

export function publicationCopy(post: DailyPost, channel: Channel): { text: string; link: string; image: string } {
  const link = new URL(post.url)
  if (link.origin !== 'https://opax.com.au') throw new Error('Publication requires an Opax source page')
  link.searchParams.set('utm_source', channel)
  link.searchParams.set('utm_medium', 'social')
  link.searchParams.set('utm_campaign', 'daily_record')
  link.searchParams.set('utm_content', post.date)
  const image = new URL(`https://opax.com.au/og${new URL(post.url).pathname}.jpg`)
  image.searchParams.set('v', OG_VERSION)
  const full = (post.caption || post.text).replace(post.url, '').trim()
  const text = channel === 'x' ? post.text.replace(post.url, link.toString())
    : channel === 'facebook' ? full.slice(0, 5000)
    : `${full.slice(0, 1850)}\n\nExplore ${post.title} at opax.com.au — link in bio.\n\n#AustralianParliament #PublicRecords #Opax`
  return { text, link: link.toString(), image: image.toString() }
}

/** Only controlled error codes go to logs/receipts. Never persist a provider body or token. */
async function api(url: string, token: string, fetchImpl: typeof fetch, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetchImpl(url, {
    method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000), redirect: 'error',
  })
  if (!res.ok) throw new Error(`Provider HTTP ${res.status}`)
  return await res.json() as Record<string, unknown>
}
function returnedId(body: Record<string, unknown>): string {
  if (typeof body.id !== 'string' || !/^[\d_]+$/.test(body.id)) throw new Error('Provider omitted post id')
  return body.id
}
function graphOrigin(env: SocialEnv): string {
  if (!/^v\d+\.0$/.test(env.META_API_VERSION ?? '')) throw new Error('Meta API version not configured')
  return `https://graph.facebook.com/${env.META_API_VERSION}`
}

async function verifyAccount(channel: Channel, env: SocialEnv, fetchImpl: typeof fetch): Promise<void> {
  if (channel === 'x') {
    const url = 'https://api.x.com/2/users/me'
    const authorization = await oauth1Header('GET', url, xCredentials(env)!)
    const res = await fetchImpl(url, { headers: { authorization }, signal: AbortSignal.timeout(20000), redirect: 'error' })
    if (!res.ok) throw new Error(`X identity HTTP ${res.status}`)
    const body = await res.json() as { data?: { id?: string; username?: string } }
    if (body.data?.id !== env.X_ACCOUNT_ID || body.data?.username?.toLowerCase() !== env.X_USERNAME?.toLowerCase()) throw new Error('X account mismatch')
  } else if (channel === 'facebook') {
    const me = await api(`${graphOrigin(env)}/me?fields=id`, env.FACEBOOK_PAGE_TOKEN!, fetchImpl)
    if (me.id !== env.FACEBOOK_PAGE_ID) throw new Error('Facebook Page token mismatch')
  } else {
    const me = await api(`${graphOrigin(env)}/${env.INSTAGRAM_ACCOUNT_ID}?fields=id,username`, env.INSTAGRAM_ACCESS_TOKEN!, fetchImpl)
    if (me.id !== env.INSTAGRAM_ACCOUNT_ID || String(me.username).toLowerCase() !== env.INSTAGRAM_USERNAME?.toLowerCase()) throw new Error('Instagram account mismatch')
  }
}

export async function socialStatus(env: SocialEnv, date = melbourneDate()): Promise<unknown> {
  const deliveries = await env.COMMUNITY_DB.prepare('SELECT channel,status,post_id,detail,updated_at FROM social_deliveries WHERE edition_date=? ORDER BY channel').bind(date).all<Receipt>()
  return { date, schedule: '08:00 AEST / 09:00 AEDT; pending Instagram containers checked at +5 and +10 minutes', channels: readiness(env), deliveries: deliveries.results }
}

export async function previewPublication(env: SocialEnv, date: string, personTopics: (name: string) => Promise<Response>, kind?: DailyPostKind): Promise<DailyPost | null> {
  if (!kind) {
    const existing = await env.COMMUNITY_DB.prepare('SELECT post_json FROM social_editions WHERE date=?').bind(date).first<{ post_json: string }>()
    if (existing) return JSON.parse(existing.post_json) as DailyPost
  }
  const sources = envSources(env, personTopics)
  const since = new Date(Date.parse(date + 'T12:00:00Z') - 90 * 86400000).toISOString().slice(0, 10)
  const recent = await env.COMMUNITY_DB.prepare("SELECT DISTINCT e.subject FROM social_editions e JOIN social_deliveries d ON d.edition_date=e.date WHERE d.status='posted' AND e.date>=? AND e.date<? ORDER BY e.date DESC LIMIT 90").bind(since, date).all<{ subject: string }>()
  const legacyRecent = await sources.recent()
  return composeDailyPost(date, { ...sources, recent: async () => [...legacyRecent, ...recent.results.map(r => r.subject)] }, kind)
}

export async function runSocialPublication(env: SocialEnv, options: {
  now?: number; personTopics: (name: string) => Promise<Response>; fetchImpl?: typeof fetch
  /** Production resolves its own routes in-process, avoiding a recursive Worker fetch. */
  sourceResponse?: (url: string) => Promise<Response>
}): Promise<unknown> {
  const ready = readiness(env)
  const channels = CHANNELS.filter(c => ready[c].ready)
  if (!channels.length) return { status: 'skipped', channels: ready }
  const now = options.now ?? Date.now()
  const date = melbourneDate(now)
  const at = new Date(now).toISOString()
  const db = env.COMMUNITY_DB
  const fetchImpl = options.fetchImpl ?? fetch
  let edition = await db.prepare('SELECT post_json FROM social_editions WHERE date=?').bind(date).first<{ post_json: string }>()
  if (!edition) {
    const post = await previewPublication(env, date, options.personTopics)
    if (!post) return { status: 'skipped', reason: 'no unfeatured source records' }
    await db.prepare('INSERT OR IGNORE INTO social_editions(date,subject,post_json,created_at) VALUES(?,?,?,?)').bind(date, post.subject, JSON.stringify(post), at).run()
    edition = await db.prepare('SELECT post_json FROM social_editions WHERE date=?').bind(date).first<{ post_json: string }>()
  }
  if (!edition) throw new Error('Edition could not be stored')
  const post = JSON.parse(edition.post_json) as DailyPost
  const results: Record<string, string> = {}
  for (const channel of channels) {
    // Preserve the previous runner's sent receipts during rollout.
    if (channel === 'x' && await env.GENERATION_CACHE.get(`daily-post:sent:${date}`)) { results[channel] = 'already posted'; continue }
    let receipt = await db.prepare('SELECT * FROM social_deliveries WHERE edition_date=? AND channel=?').bind(date, channel).first<Receipt>()
    if (receipt && receipt.status !== 'preparing') { results[channel] = receipt.status; continue }
    const copy = publicationCopy(post, channel)
    let claimed = false
    let writeStarted = false
    try {
      await verifyAccount(channel, env, fetchImpl)
      if (!receipt) {
        // Preflight the actual linked page and image before any social write.
        for (const target of [post.url, copy.image]) {
          const res = options.sourceResponse ? await options.sourceResponse(target) : await fetchImpl(target, { method: 'HEAD', signal: AbortSignal.timeout(20000), redirect: 'error' })
          if (!res.ok || (target === copy.image && (!res.headers.get('content-type')?.startsWith('image/jpeg') || res.headers.get('x-opax-og') !== new URL(post.url).pathname))) throw new Error('Source page or matching image unavailable')
        }
        const claim = await db.prepare("INSERT OR IGNORE INTO social_deliveries(edition_date,channel,status,updated_at) VALUES(?,?,'sending',?)").bind(date, channel, at).run()
        if (!claim.meta.changes) { results[channel] = 'claimed by another run'; continue }
        claimed = true
      } else {
        const claim = await db.prepare("UPDATE social_deliveries SET status='sending',updated_at=? WHERE edition_date=? AND channel=? AND status='preparing'").bind(at, date, channel).run()
        if (!claim.meta.changes) { results[channel] = 'claimed by another run'; continue }
        claimed = true
      }
      let id: string
      if (channel === 'x') {
        writeStarted = true
        id = (await postToX(copy.text, xCredentials(env)!, fetchImpl)).id
      } else if (channel === 'facebook') {
        writeStarted = true
        id = returnedId(await api(`${graphOrigin(env)}/${env.FACEBOOK_PAGE_ID}/feed`, env.FACEBOOK_PAGE_TOKEN!, fetchImpl, { message: copy.text, link: copy.link }))
      } else {
        let container = receipt?.container_id
        if (!container) {
          writeStarted = true
          container = returnedId(await api(`${graphOrigin(env)}/${env.INSTAGRAM_ACCOUNT_ID}/media`, env.INSTAGRAM_ACCESS_TOKEN!, fetchImpl, { image_url: copy.image, caption: copy.text }))
          await db.prepare('UPDATE social_deliveries SET container_id=? WHERE edition_date=? AND channel=?').bind(container, date, channel).run()
          writeStarted = false // Container creation is not publication; it is now safely recorded.
        }
        const state = await api(`${graphOrigin(env)}/${container}?fields=status_code`, env.INSTAGRAM_ACCESS_TOKEN!, fetchImpl)
        if (state.status_code === 'IN_PROGRESS') {
          await db.prepare("UPDATE social_deliveries SET status='preparing',updated_at=? WHERE edition_date=? AND channel=?").bind(at, date, channel).run()
          results[channel] = 'preparing'; continue
        }
        if (state.status_code !== 'FINISHED') throw new Error('Instagram container not publishable')
        writeStarted = true
        id = returnedId(await api(`${graphOrigin(env)}/${env.INSTAGRAM_ACCOUNT_ID}/media_publish`, env.INSTAGRAM_ACCESS_TOKEN!, fetchImpl, { creation_id: container }))
      }
      await db.prepare("UPDATE social_deliveries SET status='posted',post_id=?,detail=NULL,updated_at=? WHERE edition_date=? AND channel=?").bind(id, at, date, channel).run()
      results[channel] = 'posted'
    } catch (error) {
      const known = error instanceof Error && /^(Provider HTTP \d+|Provider omitted post id|X (?:identity HTTP \d+|API HTTP \d+|account mismatch|did not return a post id)|Facebook Page token mismatch|Instagram (?:account mismatch|container not publishable)|Source page or matching image unavailable|Meta API version not configured)$/.test(error.message) ? error.message : 'Publication request failed'
      if (claimed) await db.prepare('UPDATE social_deliveries SET status=?,detail=?,updated_at=? WHERE edition_date=? AND channel=?').bind(writeStarted ? 'review_required' : 'failed', known, at, date, channel).run()
      // Preflight errors are recorded as well, so an operator can see the problem.
      else if (receipt) await db.prepare("UPDATE social_deliveries SET status='failed',detail=?,updated_at=? WHERE edition_date=? AND channel=? AND status='preparing'").bind(known, at, date, channel).run()
      else await db.prepare("INSERT OR IGNORE INTO social_deliveries(edition_date,channel,status,detail,updated_at) VALUES(?,?,'failed',?,?)").bind(date, channel, known, at).run()
      results[channel] = writeStarted ? 'review_required' : 'failed'
    }
  }
  return { date, subject: post.subject, channels: results }
}
