/** One frozen edition per Melbourne day, independent delivery receipts per channel.
 * Claims are atomic in D1. An uncertain write is held for review, never blindly retried.
 */
import { composeDailyPost, envSources, melbourneDate, oauth1Header, postToX, xCredentials, type DailyPost, type DailyPostKind } from './daily-post'
import { OG_VERSION } from './og'
import { STORY_VERSION, storyFrames, validStory } from './story'

/** Stories come last: the tray mirrors the day's feed post. */
export const CHANNELS = ['x', 'facebook', 'instagram', 'instagram_story', 'facebook_story'] as const
export type Channel = typeof CHANNELS[number]
type SocialEnv = Pick<Env, 'ASSETS' | 'GENERATION_CACHE' | 'COMMUNITY_DB' | 'STAGING_API' | 'DAILY_POST_ENABLED' | 'X_API_KEY' | 'X_API_SECRET' | 'X_ACCESS_TOKEN' | 'X_ACCESS_TOKEN_SECRET' | 'X_ACCOUNT_ID' | 'X_USERNAME' | 'FACEBOOK_POST_ENABLED' | 'FACEBOOK_PAGE_ID' | 'FACEBOOK_PAGE_TOKEN' | 'INSTAGRAM_POST_ENABLED' | 'INSTAGRAM_STORY_ENABLED' | 'FACEBOOK_STORY_ENABLED' | 'INSTAGRAM_ACCOUNT_ID' | 'INSTAGRAM_USERNAME' | 'INSTAGRAM_ACCESS_TOKEN' | 'META_API_VERSION'>
interface Receipt { channel: Channel; status: string; post_id: string | null; container_id: string | null; detail: string | null; progress?: string | null; updated_at: string }
/** A delivery made of several frames: the ids published so far, and the frame in flight with its container or photo. */
interface Progress { done: string[]; at: number | null; container: string | null }
const parseProgress = (raw: string | null | undefined): Progress => {
  try { const p = raw ? JSON.parse(raw) as Partial<Progress> : null; return { done: Array.isArray(p?.done) ? p!.done.filter((d): d is string => typeof d === 'string') : [], at: typeof p?.at === 'number' ? p.at : null, container: typeof p?.container === 'string' ? p.container : null } } catch { return { done: [], at: null, container: null } }
}
const isStoryChannel = (channel: Channel): boolean => channel === 'instagram_story' || channel === 'facebook_story'
const metaVersionReady = (env: SocialEnv) => /^v\d+\.0$/.test(env.META_API_VERSION ?? '')
const numericId = (value?: string): boolean => /^\d+$/.test(value ?? '')

export function readiness(env: SocialEnv): Record<Channel, { enabled: boolean; ready: boolean; reason: string }> {
  const configured = {
    x: !!(xCredentials(env) && numericId(env.X_ACCOUNT_ID) && /^[A-Za-z0-9_]{1,15}$/.test(env.X_USERNAME ?? '')),
    facebook: !!(metaVersionReady(env) && env.FACEBOOK_PAGE_TOKEN && numericId(env.FACEBOOK_PAGE_ID)),
    instagram: !!(metaVersionReady(env) && env.INSTAGRAM_ACCESS_TOKEN && numericId(env.INSTAGRAM_ACCOUNT_ID) && env.INSTAGRAM_USERNAME),
  }
  const stories = { instagram_story: configured.instagram, facebook_story: configured.facebook }
  const enabled = { x: env.DAILY_POST_ENABLED === 'true', facebook: env.FACEBOOK_POST_ENABLED === 'true', instagram: env.INSTAGRAM_POST_ENABLED === 'true', instagram_story: env.INSTAGRAM_STORY_ENABLED === 'true', facebook_story: env.FACEBOOK_STORY_ENABLED === 'true' }
  return Object.fromEntries(CHANNELS.map(channel => {
    const on = enabled[channel] && !env.STAGING_API
    const set = channel === 'instagram_story' || channel === 'facebook_story' ? stories[channel] : configured[channel]
    return [channel, { enabled: on, ready: on && set, reason: env.STAGING_API ? 'staging' : !on ? 'disabled' : !set ? 'account connection required' : 'configured; verified before publishing' }]
  })) as ReturnType<typeof readiness>
}

/**
 * What a channel posts. `slides` is present only for Instagram and Facebook and
 * only when the edition carries a valid story (story.ts): the carousel's
 * images in order, each drawn by /og/story/<date>/<n>.jpg from the frozen
 * edition. X keeps the single card; so does any edition stored before stories.
 */
export function publicationCopy(post: DailyPost, channel: Channel): { text: string; link: string; image: string; slides?: string[]; frames?: number[] } {
  const link = new URL(post.url)
  if (link.origin !== 'https://opax.com.au') throw new Error('Publication requires an Opax source page')
  link.searchParams.set('utm_source', channel)
  link.searchParams.set('utm_medium', 'social')
  link.searchParams.set('utm_campaign', 'daily_record')
  link.searchParams.set('utm_content', post.date)
  const image = new URL(`https://opax.com.au/og${new URL(post.url).pathname}.jpg`)
  const award = new URL(post.url).searchParams.get('award')
  if (award) image.searchParams.set('award', award)
  image.searchParams.set('v', OG_VERSION)
  // Instagram's feed and grid are portrait; the landscape card is cropped there.
  if (channel === 'instagram') image.searchParams.set('format', 'portrait')
  const full = (post.caption || post.text).replace(post.url, '').trim()
  const text = channel === 'x' ? post.text.replace(post.url, link.toString())
    : channel === 'facebook' ? full.slice(0, 5000)
    : `${full.slice(0, 1850)}\n\nExplore ${post.title} at opax.com.au — link in bio.\n\n#AustralianParliament #PublicRecords #Opax`
  // A story channel posts a few of the slides as 9:16 frames (story.ts chooses which); the feed channels post them all at 4:5.
  const frames = isStoryChannel(channel) ? storyFrames(post.slides) : undefined
  const slides = frames
    ? frames.map(n => `https://opax.com.au/og/story/${post.date}/${n}.jpg?v=${OG_VERSION}.${STORY_VERSION}&format=story`)
    : channel !== 'x' && validStory(post.slides)
    ? post.slides.map((_, i) => `https://opax.com.au/og/story/${post.date}/${i + 1}.jpg?v=${OG_VERSION}.${STORY_VERSION}`)
    : undefined
  if (frames && !frames.length) return { text, link: link.toString(), image: image.toString() }
  return { text, link: link.toString(), image: image.toString(), ...(slides ? { slides } : {}), ...(frames ? { frames } : {}) }
}

/** Only controlled error codes go to logs/receipts. Never persist a provider body or token. */
async function api(url: string, token: string, fetchImpl: typeof fetch, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  // A Meta write that carries an image URL (a container, a photo upload) is
  // answered only after Meta has fetched and checked the image, which can take
  // well over twenty seconds; a read is quick. The cron has minutes, not seconds.
  const timeout = body ? META_WRITE_TIMEOUT : META_READ_TIMEOUT
  let res: Response
  try {
    res = await fetchImpl(url, {
      method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(timeout), redirect: 'manual',
    })
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) throw new Error('Provider timeout')
    throw error
  }
  if (!res.ok) throw new Error(`Provider HTTP ${res.status}`)
  return await res.json() as Record<string, unknown>
}
const META_READ_TIMEOUT = 20000
const META_WRITE_TIMEOUT = 90000
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
    // Workers' fetch has no redirect: 'error'; a redirect is refused by hand.
    const res = await fetchImpl(url, { headers: { authorization }, signal: AbortSignal.timeout(20000), redirect: 'manual' })
    if (!res.ok) throw new Error(`X identity HTTP ${res.status}`)
    const body = await res.json() as { data?: { id?: string; username?: string } }
    if (body.data?.id !== env.X_ACCOUNT_ID || body.data?.username?.toLowerCase() !== env.X_USERNAME?.toLowerCase()) throw new Error('X account mismatch')
  } else if (channel === 'facebook' || channel === 'facebook_story') {
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

export async function previewPublication(env: SocialEnv, date: string, personTopics: (name: string) => Promise<Response>, kind?: DailyPostKind, subject?: string): Promise<DailyPost | null> {
  if (!kind && !subject) {
    const existing = await env.COMMUNITY_DB.prepare('SELECT post_json FROM social_editions WHERE date=?').bind(date).first<{ post_json: string }>()
    if (existing) return JSON.parse(existing.post_json) as DailyPost
  }
  const sources = envSources(env, personTopics)
  const since = new Date(Date.parse(date + 'T12:00:00Z') - 90 * 86400000).toISOString().slice(0, 10)
  const recent = await env.COMMUNITY_DB.prepare("SELECT DISTINCT e.subject FROM social_editions e JOIN social_deliveries d ON d.edition_date=e.date WHERE d.status='posted' AND e.date>=? AND e.date<? ORDER BY e.date DESC LIMIT 90").bind(since, date).all<{ subject: string }>()
  const legacyRecent = await sources.recent()
  return composeDailyPost(date, { ...sources, recent: async () => [...legacyRecent, ...recent.results.map(r => r.subject)] }, kind, subject)
}

export async function runSocialPublication(env: SocialEnv, options: {
  now?: number; personTopics: (name: string) => Promise<Response>; fetchImpl?: typeof fetch
  /** Production resolves its own routes in-process, avoiding a recursive Worker fetch. */
  sourceResponse?: (url: string) => Promise<Response>
  /**
   * An operator's run: the journal date to post under (the cron uses today's),
   * a kind or a named subject to compose instead of the rotation, and the
   * channels to deliver to (default: every ready channel). The journal still
   * rules: an edition already stored under the date is reused, and a channel
   * already delivered for it is not posted again.
   */
  date?: string; kind?: DailyPostKind; subject?: string; channels?: Channel[]
}): Promise<unknown> {
  const ready = readiness(env)
  const channels = CHANNELS.filter(c => ready[c].ready && (!options.channels || options.channels.includes(c)))
  if (!channels.length) return { status: 'skipped', channels: ready }
  const now = options.now ?? Date.now()
  const date = options.date ?? melbourneDate(now)
  const at = new Date(now).toISOString()
  const db = env.COMMUNITY_DB
  const fetchImpl = options.fetchImpl ?? fetch
  let edition = await db.prepare('SELECT post_json FROM social_editions WHERE date=?').bind(date).first<{ post_json: string }>()
  if (!edition) {
    const post = await previewPublication(env, date, options.personTopics, options.kind, options.subject)
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
      if (isStoryChannel(channel) && !copy.frames?.length) { results[channel] = 'nothing to post'; continue }
      await verifyAccount(channel, env, fetchImpl)
      if (!receipt) {
        // Preflight the actual linked page and image, or every slide of a story, before any social write.
        const slides = copy.slides ?? []
        for (const target of [post.url, ...(slides.length ? slides : [copy.image])]) {
          const res = options.sourceResponse ? await options.sourceResponse(target) : await fetchImpl(target, { method: 'HEAD', signal: AbortSignal.timeout(20000), redirect: 'manual' })
          const k = slides.indexOf(target)
          if (k >= 0) {
            // A slide must be the frozen edition's own drawing, in the right frame, and the one the URL names.
            const n = copy.frames ? copy.frames[k] : k + 1
            const wantFormat = copy.frames ? 'story' : 'portrait'
            if (!res.ok || !res.headers.get('content-type')?.startsWith('image/jpeg') || res.headers.get('x-opax-story') !== `${post.date}/${n}` || res.headers.get('x-opax-format') !== wantFormat) throw new Error('Story slide unavailable')
            continue
          }
          if (!res.ok || (target === copy.image && (!res.headers.get('content-type')?.startsWith('image/jpeg') || res.headers.get('x-opax-og') !== new URL(post.url).pathname))) throw new Error('Source page or matching image unavailable')
          const award = new URL(post.url).searchParams.get('award')
          if (target === copy.image && award && res.headers.get('x-opax-award') !== award) throw new Error('Grant award image mismatch')
          // A portrait request answered with a landscape card (an older Worker, a fallback) must not reach Instagram.
          if (target === copy.image && new URL(copy.image).searchParams.get('format') === 'portrait' && res.headers.get('x-opax-format') !== 'portrait') throw new Error('Portrait image unavailable')
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
      if (isStoryChannel(channel)) {
        // Each frame is its own story: a container (or an unpublished photo) that is
        // recorded before it is published, so a resumed run picks up the frame in
        // flight and never repeats one already in the tray.
        const urls = copy.slides ?? []
        let progress = parseProgress(receipt?.progress)
        const saveProgress = async (p: Progress) => { await db.prepare('UPDATE social_deliveries SET progress=?,updated_at=? WHERE edition_date=? AND channel=?').bind(JSON.stringify(p), at, date, channel).run() }
        let waiting = false
        for (let k = progress.done.length; k < urls.length; k++) {
          const image_url = urls[k]
          let handle = progress.at === k ? progress.container : null
          if (channel === 'instagram_story') {
            if (!handle) {
              handle = returnedId(await api(`${graphOrigin(env)}/${env.INSTAGRAM_ACCOUNT_ID}/media`, env.INSTAGRAM_ACCESS_TOKEN!, fetchImpl, { media_type: 'STORIES', image_url }))
              progress = { ...progress, at: k, container: handle }
              await saveProgress(progress)
            }
            const state = await api(`${graphOrigin(env)}/${handle}?fields=status_code`, env.INSTAGRAM_ACCESS_TOKEN!, fetchImpl)
            if (state.status_code === 'IN_PROGRESS') { waiting = true; break }
            if (state.status_code !== 'FINISHED') throw new Error('Instagram container not publishable')
            writeStarted = true
            const published = returnedId(await api(`${graphOrigin(env)}/${env.INSTAGRAM_ACCOUNT_ID}/media_publish`, env.INSTAGRAM_ACCESS_TOKEN!, fetchImpl, { creation_id: handle }))
            progress = { done: [...progress.done, published], at: null, container: null }
            await saveProgress(progress)
            writeStarted = false
          } else {
            if (!handle) {
              handle = returnedId(await api(`${graphOrigin(env)}/${env.FACEBOOK_PAGE_ID}/photos`, env.FACEBOOK_PAGE_TOKEN!, fetchImpl, { url: image_url, published: false }))
              progress = { ...progress, at: k, container: handle }
              await saveProgress(progress)
            }
            writeStarted = true
            const story = await api(`${graphOrigin(env)}/${env.FACEBOOK_PAGE_ID}/photo_stories`, env.FACEBOOK_PAGE_TOKEN!, fetchImpl, { photo_id: handle })
            const published = typeof story.post_id === 'string' && /^[\d_]+$/.test(story.post_id) ? story.post_id : returnedId(story)
            progress = { done: [...progress.done, published], at: null, container: null }
            await saveProgress(progress)
            writeStarted = false
          }
        }
        if (waiting) {
          await db.prepare("UPDATE social_deliveries SET status='preparing',updated_at=? WHERE edition_date=? AND channel=?").bind(at, date, channel).run()
          results[channel] = 'preparing'; continue
        }
        id = progress.done.join(',')
      } else if (channel === 'x') {
        writeStarted = true
        id = (await postToX(copy.text, xCredentials(env)!, fetchImpl)).id
      } else if (channel === 'facebook') {
        if (copy.slides) {
          // A story is a multi-photo post: unpublished uploads, then one feed post that attaches them.
          // attached_media cannot be combined with link, so the link rides in the message.
          const attached: { media_fbid: string }[] = []
          for (const url of copy.slides) attached.push({ media_fbid: returnedId(await api(`${graphOrigin(env)}/${env.FACEBOOK_PAGE_ID}/photos`, env.FACEBOOK_PAGE_TOKEN!, fetchImpl, { url, published: false })) })
          writeStarted = true
          id = returnedId(await api(`${graphOrigin(env)}/${env.FACEBOOK_PAGE_ID}/feed`, env.FACEBOOK_PAGE_TOKEN!, fetchImpl, { message: `${copy.text}\n\n${copy.link}`, attached_media: attached }))
        } else {
          writeStarted = true
          id = returnedId(await api(`${graphOrigin(env)}/${env.FACEBOOK_PAGE_ID}/feed`, env.FACEBOOK_PAGE_TOKEN!, fetchImpl, { message: copy.text, link: copy.link }))
        }
      } else {
        let container = receipt?.container_id
        if (!container) {
          let body: Record<string, unknown> = { image_url: copy.image, caption: copy.text }
          if (copy.slides) {
            // A story is a carousel: one child container per slide (never published on its own),
            // then the parent that the journal records and later publishes.
            const children: string[] = []
            for (const [i, image_url] of copy.slides.entries()) {
              children.push(returnedId(await api(`${graphOrigin(env)}/${env.INSTAGRAM_ACCOUNT_ID}/media`, env.INSTAGRAM_ACCESS_TOKEN!, fetchImpl, { image_url, is_carousel_item: true, alt_text: post.slides![i].alt })))
            }
            body = { media_type: 'CAROUSEL', children: children.join(','), caption: copy.text }
          }
          writeStarted = true
          container = returnedId(await api(`${graphOrigin(env)}/${env.INSTAGRAM_ACCOUNT_ID}/media`, env.INSTAGRAM_ACCESS_TOKEN!, fetchImpl, body))
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
      // The journal keeps a bounded reason; the log keeps the message (never a token).
      console.error('daily-post', JSON.stringify({ channel, date, error: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : String(error).slice(0, 300) }))
      const known = error instanceof Error && /^(Provider HTTP \d+|Provider timeout|Provider omitted post id|X (?:identity HTTP \d+|API HTTP \d+|account mismatch|did not return a post id)|Facebook Page token mismatch|Instagram (?:account mismatch|container not publishable)|Source page or matching image unavailable|Grant award image mismatch|Portrait image unavailable|Story slide unavailable|Meta API version not configured)$/.test(error.message) ? error.message : 'Publication request failed'
      if (claimed) await db.prepare('UPDATE social_deliveries SET status=?,detail=?,updated_at=? WHERE edition_date=? AND channel=?').bind(writeStarted ? 'review_required' : 'failed', known, at, date, channel).run()
      // Preflight errors are recorded as well, so an operator can see the problem.
      else if (receipt) await db.prepare("UPDATE social_deliveries SET status='failed',detail=?,updated_at=? WHERE edition_date=? AND channel=? AND status='preparing'").bind(known, at, date, channel).run()
      else await db.prepare("INSERT OR IGNORE INTO social_deliveries(edition_date,channel,status,detail,updated_at) VALUES(?,?,'failed',?,?)").bind(date, channel, known, at).run()
      results[channel] = writeStarted ? 'review_required' : 'failed'
    }
  }
  return { date, subject: post.subject, channels: results }
}
