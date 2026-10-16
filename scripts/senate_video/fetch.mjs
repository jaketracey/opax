#!/usr/bin/env node
// Stage the Senate's YouTube uploads as portal/public/video/senate.json.
//
//   node scripts/senate_video/fetch.mjs              # feed (+ API page 1 when YOUTUBE_API_KEY is set), merge, write
//   node scripts/senate_video/fetch.mjs --dry-run    # fetch and report; write nothing
//   node scripts/senate_video/fetch.mjs --backfill   # with YOUTUBE_API_KEY: page the whole uploads playlist
//   node scripts/senate_video/fetch.mjs --feed-file x.xml   # read a saved feed instead of the network
//   node scripts/senate_video/fetch.mjs --save-feed x.xml   # keep the fetched feed's bytes (review, fixtures)
//
// Sources: the public Atom feed (latest 15) and, only with YOUTUBE_API_KEY, the Data API v3
// playlistItems list of the uploads playlist (1 quota unit per 50 videos). Nothing else:
// no channel HTML, no video bytes. One GET per source page, with OPAXBot's honest agent.
// The API key is sent as a query parameter and never printed.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { honestFetch, runSource } from '../lib/http.mjs'
import { FEED_URL, UPLOADS_PLAYLIST, parseFeed, parsePlaylistPage, mergeRows, handbookSenators, document } from './lib.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PUBLIC = join(ROOT, 'portal', 'public')
const arg = (name, fallback = null) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback }
const flag = name => process.argv.includes(name)
const readJson = async (path, fallback) => { try { return JSON.parse(await readFile(path, 'utf8')) } catch (e) { if (e.code === 'ENOENT') return fallback; throw e } }

async function feedItems() {
  const file = arg('--feed-file')
  const xml = file ? await readFile(file, 'utf8') : await (async () => {
    const response = await honestFetch(FEED_URL, { headers: { accept: 'application/atom+xml, application/xml;q=0.9' } })
    if (response.status !== 200) throw new Error(`feed answered HTTP ${response.status}`)
    return response.text()
  })()
  if (arg('--save-feed')) await writeFile(arg('--save-feed'), xml)
  const items = parseFeed(xml)
  if (!items.length) throw new Error('feed held no videos; staged file kept')
  return items
}

async function apiItems(key, maxPages) {
  const items = []
  let token = ''
  for (let page = 0; page < maxPages; page++) {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems')
    url.search = new URLSearchParams({ part: 'snippet,contentDetails', playlistId: UPLOADS_PLAYLIST, maxResults: '50', ...(token ? { pageToken: token } : {}), key }).toString()
    const response = await honestFetch(url, { expectedJson: true })
    // The status alone: the URL carries the key.
    if (response.status !== 200) throw new Error(`Data API playlistItems answered HTTP ${response.status}`)
    const body = await response.json()
    items.push(...parsePlaylistPage(body))
    token = body.nextPageToken || ''
    if (!token) break
  }
  return items
}

await runSource(async () => {
  const out = arg('--out', join(PUBLIC, 'video', 'senate.json'))
  const dry = flag('--dry-run')
  const key = process.env.YOUTUBE_API_KEY || ''
  const [roster, links, pay, staged] = await Promise.all([
    readJson(arg('--roster', join(PUBLIC, 'parliamentarians.json')), null),
    readJson(join(PUBLIC, 'profile-links.json'), { people: {} }),
    readJson(join(PUBLIC, 'pay.json'), {}),
    readJson(out, { videos: [] }),
  ])
  if (!roster?.people?.length) throw new Error('roster missing; nothing staged')
  const mpidOf = new Map(Object.entries(links.people || {}).map(([pid, v]) => [pid, v?.aphMpid]).filter(([, m]) => m))
  const context = { mpidOf, senators: handbookSenators(pay) }

  const items = await feedItems()
  const sources = [{ label: 'AuSenate YouTube feed', url: FEED_URL }]
  if (key) {
    const pages = flag('--backfill') ? Number(arg('--max-pages', 400)) : 1
    items.push(...await apiItems(key, pages))
    sources.push({ label: 'YouTube Data API v3 playlistItems (uploads)', url: `https://www.youtube.com/playlist?list=${UPLOADS_PLAYLIST}` })
  } else if (flag('--backfill')) console.error('senate_video: --backfill needs YOUTUBE_API_KEY; feed only')

  const before = new Set((staged.videos || []).map(r => r.id))
  const rows = mergeRows(staged.videos || [], items, roster.people, context)
  const added = rows.filter(r => !before.has(r.id))
  const doc = document(rows, new Date().toISOString().slice(0, 10), sources)
  const unmatched = rows.filter(r => r.kind === 'first_speech' && !r.person_slug).length
  console.log(`senate_video: ${rows.length} videos (${added.length} new): ${Object.entries(doc.meta.counts).map(([k, n]) => `${k} ${n}`).join(', ')}; first speeches unmatched ${unmatched}`)
  for (const r of added) console.log(`  + ${r.id} ${r.kind} ${r.date || 'undated'}${r.kind === 'first_speech' ? ` -> ${r.person_slug || 'no roster match'}` : ''}`)
  if (dry) { console.log('senate_video: dry run, nothing written'); return }
  // Same rows, same file: a night with nothing new leaves the bytes (and the date) alone.
  const same = JSON.stringify(staged.videos || []) === JSON.stringify(rows) && JSON.stringify(staged.meta?.sources) === JSON.stringify(sources)
  if (same) { console.log('senate_video: unchanged'); return }
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out + '.tmp', JSON.stringify(doc, null, 2) + '\n')
  await rename(out + '.tmp', out)
  console.log(`senate_video: wrote ${out}`)
})
