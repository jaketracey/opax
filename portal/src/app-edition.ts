/** W13: the journal is the sole source. Runtime imports must stay pure. */
import {appJson, appRead, melbourneDay, readOnly, validDate, APP_CACHE} from './app-http'
import type {DailyPost} from './daily-post'

type EditionEnv = Pick<Env, 'COMMUNITY_DB'>
type EditionRow = {date: string; subject: string; post_json: string; created_at: string}

function storedEdition(row: EditionRow): DailyPost {
  const post = JSON.parse(row.post_json) as DailyPost
  if (!post || post.date !== row.date || post.subject !== row.subject
    || !['politician','bill','grant','topic','program','largest'].includes(post.kind)
    || ![post.subject,post.title,post.text,post.url].every(s => typeof s === 'string' && s.length > 0)
    || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) throw new Error('Invalid edition')
  const link = new URL(post.url)
  if (link.origin !== 'https://opax.com.au' || link.username || link.password
    || !/^\/(?:subject\/person\/|bill\/|money\/grants(?:\/|$)|reports\/)/.test(link.pathname)) throw new Error('Invalid edition link')
  if (post.caption !== undefined && typeof post.caption !== 'string') throw new Error('Invalid caption')
  if (post.slides !== undefined && (!Array.isArray(post.slides) || post.slides.length < 3 || post.slides.length > 10
    || post.slides[0]?.type !== 'cover' || post.slides.at(-1)?.type !== 'source'
    || !post.slides.every(s => s && ['cover','number','picture','bars','ledger','timeline','division','list','source'].includes(s.type)
      && [s.kicker,s.title,s.alt].every(v => typeof v === 'string')))) throw new Error('Invalid slides')
  // Preserve frozen copy and its attribution; never add image URLs or live data.
  return {date:post.date, kind:post.kind, subject:post.subject, title:post.title, text:post.text, url:post.url,
    ...(post.caption !== undefined ? {caption:post.caption} : {}), ...(post.slides !== undefined ? {slides:post.slides} : {})}
}

export async function appEdition(req: Request, env: EditionEnv, at = Date.now()): Promise<Response> {
  const method = readOnly(req)
  if (method) return method
  const url = new URL(req.url)
  const value = url.pathname.slice('/api/app/v1/edition/'.length)
  if (url.search) return appJson(req, {error:'invalid_query'}, 400)
  const today = melbourneDay(at)
  const date = value === 'today' ? today : value
  if (!validDate(date)) return appJson(req, {error:'invalid_date'}, 400)
  const missing = () => appJson(req, {error:'edition_not_published', date}, 404, {'cache-control':'public, max-age=60, must-revalidate'})
  if (date > today) return missing()
  try {
    // An edition is frozen before delivery. Only an accepted, journalled post
    // makes it public here; preparing/failed/uncertain editions remain absent.
    const row = await env.COMMUNITY_DB.prepare(`SELECT e.date,e.subject,e.post_json,e.created_at FROM social_editions e
      WHERE e.date=? AND EXISTS (SELECT 1 FROM social_deliveries d
        WHERE d.edition_date=e.date AND d.status='posted' AND d.post_id IS NOT NULL AND d.post_id!='')`)
      .bind(date).first<EditionRow>()
    if (!row) return missing()
    return await appRead(req, {schema_version:1, date, created_at:row.created_at, edition:storedEdition(row)},
      value === 'today' ? APP_CACHE : 'public, max-age=86400, must-revalidate')
  } catch {
    return appJson(req, {error:'edition_unavailable'}, 503, {'retry-after':'60'})
  }
}
