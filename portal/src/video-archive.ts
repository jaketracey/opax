// /video/senate: every Senate upload OPAX links (public/video/senate.json, scripts/senate_video/),
// so videos outside the published sitting weeks are reachable too. Question Time and first
// speeches are the shared click-to-play card (public/video-card.js), grouped by year and month,
// newest first; the rest is a compact list of YouTube links, titled as the Senate published them.
// The kind filter is a plain link (?kind=), so it works without a script. Nothing on the page
// asks YouTube for anything until a card is pressed.
import { sourceLineHTML } from '../public/labels.js'
import { shortDate } from '../public/format.js'
import { videoCardHTML, watchUrl } from '../public/video-card.js'
import { escapeHtml as esc, type ReadAsset } from './seo-content'
import { hubShell, type HubFooterConfig, type Video } from './hubs'
import { trail } from './nav-model.mjs'

export const VIDEO_PATH = '/video/senate'
const CHANNEL = 'https://www.youtube.com/@AuSenate'
const YOUTUBE_TERMS = 'https://www.youtube.com/t/terms'
const NOTE = 'Question Time and senators’ first speeches, as published by the Senate Public Information Office on YouTube. The player loads only when you press play.'
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
/** What the page needs of a roster row: the name its link prints. */
interface Person { name: string; full?: string | null }

/** The filter's URL values, in chip order, and the data kind each one keeps. */
export const VIDEO_KINDS = [
  { param: 'question-time', kind: 'question_time', label: 'Question Time' },
  { param: 'first-speech', kind: 'first_speech', label: 'First speeches' },
  { param: 'other', kind: 'other', label: 'Other' },
] as const
type Kind = typeof VIDEO_KINDS[number]

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** The day a video files under: its sitting day from the title, else its upload day. */
const dayOf = (v: Video) => v.date || String(v.published || '').slice(0, 10)
const newestFirst = (a: Video, b: Video) => dayOf(b).localeCompare(dayOf(a)) || String(b.published || '').localeCompare(String(a.published || ''))
const href = (k: Kind | null) => k ? `${VIDEO_PATH}?kind=${k.param}` : VIDEO_PATH
const count = (n: number) => n.toLocaleString('en-AU')

/** Year, then month, newest first: [[year, [[month, rows]]]]. Rows without any date are left out. */
export function groupVideos(rows: readonly Video[]): [string, [string, Video[]][]][] {
  const years = new Map<string, Map<string, Video[]>>()
  for (const v of [...rows].sort(newestFirst)) {
    const day = dayOf(v)
    if (!/^\d{4}-\d{2}/.test(day)) continue
    const months = years.get(day.slice(0, 4)) ?? years.set(day.slice(0, 4), new Map()).get(day.slice(0, 4))!
    const month = day.slice(0, 7)
    months.get(month)?.push(v) ?? months.set(month, [v])
  }
  return [...years].map(([year, months]) => [year, [...months]])
}

/** A first speech matched to a roster row links that senator's page; the label is the roster's name. */
function personFor(v: Video, bySlug: ReadonlyMap<string, Person>) {
  if (v.kind !== 'first_speech' || !v.person_slug) return null
  const p = bySlug.get(v.person_slug)
  return { href: `/subject/person/${v.person_slug}`, label: p ? (p.full || p.name) : 'The senator’s page' }
}

export function renderSenateVideo(data: { meta?: { updated?: string }; videos?: Video[] } | null, kindParam: string | null, bySlug: ReadonlyMap<string, Person> = new Map(), footer: HubFooterConfig = {}) {
  const all = (Array.isArray(data?.videos) ? data!.videos : []).filter(v => v?.chamber === 'senate' && VIDEO_ID.test(v.id))
  const of = (k: Kind) => all.filter(v => v.kind === k.kind)
  // An unknown ?kind= shows everything; the canonical is the bare page either way.
  const chosen = VIDEO_KINDS.find(k => k.param === kindParam) ?? null
  const shown = chosen ? of(chosen) : all
  const cards = shown.filter(v => v.kind === 'question_time' || v.kind === 'first_speech')
  const others = shown.filter(v => v.kind === 'other').sort(newestFirst)
  const years = groupVideos(cards)

  const title = 'Senate video'
  const description = NOTE
  const source = sourceLineHTML({ updated: data?.meta?.updated || '', source: 'AuSenate YouTube channel',
    originals: [{ href: CHANNEL, label: 'AuSenate: The Senate Public Information Office' }, { href: YOUTUBE_TERMS, label: 'YouTube Terms of Service' }],
    notes: ['OPAX links and embeds the Senate’s own uploads, whole and as the Senate titled them. It never downloads, clips or re-hosts them. Playback is YouTube’s player, under YouTube’s terms; for the words spoken, the Hansard record is the source.'] })
  let body = `<div class="ui-page-head"><h1>${esc(title)}</h1><p class="ui-lede">${esc(NOTE)}</p>${source}</div>`

  // Chips: All, then each kind that has rows. The chosen one is marked current.
  const chips = [{ k: null as Kind | null, label: 'All', n: all.length }, ...VIDEO_KINDS.map(k => ({ k, label: k.label, n: of(k).length })).filter(c => c.n)]
  if (all.length) body += `<nav class="video-kinds" aria-label="Show"><ul role="list">${chips.map(c =>
    `<li><a class="ui-chip" href="${esc(href(c.k))}"${c.k === chosen ? ' aria-current="true"' : ''}>${esc(c.label)} <span class="video-kind-count">${count(c.n)}</span></a></li>`).join('')}</ul></nav>`

  // Jump links: one per year on the page, and the list of other videos.
  const jumps = [...years.map(([y]) => ({ id: `y${y}`, label: y })), ...(others.length && cards.length ? [{ id: 'other-video', label: 'Other Senate videos' }] : [])]
  if (jumps.length > 1) body += `<nav class="hub-jump" aria-label="Years"><ul class="hub-jump-list">${jumps.map(j => `<li><a href="#${j.id}">${esc(j.label)}</a></li>`).join('')}</ul></nav>`

  for (const [year, months] of years) {
    body += `<section class="ui-section video-year" id="y${year}"><h2 class="ui-section-title">${year}</h2>`
    for (const [month, rows] of months) {
      body += `<h3 class="ui-subsection-title" id="m${month}">${MONTHS[Number(month.slice(5, 7)) - 1]} ${year}</h3>`
        + `<div class="video-cards">${rows.map(v => videoCardHTML(v, { person: personFor(v, bySlug) })).join('')}</div>`
    }
    body += '</section>'
  }
  if (others.length) body += `<section class="ui-section" id="other-video"><h2 class="ui-section-title">Other Senate videos</h2>`
    + `<p class="video-others-note">“60 seconds in the Senate”, lectures, valedictories and explainers. Each opens on YouTube.</p>`
    + `<ul class="ui-list video-others" role="list">${others.map(v => `<li><p class="ui-row-title"><a href="${esc(watchUrl(v.id))}" rel="noopener">${esc(v.title)}</a></p>`
      + `<p class="ui-row-meta">${esc([dayOf(v) ? shortDate(dayOf(v)) : '', 'YouTube'].filter(Boolean).join(' · '))}</p></li>`).join('')}</ul></section>`
  if (!cards.length && !others.length) body += `<p class="video-empty">${all.length ? 'No videos of this kind yet.' : 'No Senate videos are published here yet.'} <a href="${VIDEO_PATH}">All Senate video</a></p>`

  const pageTitle = chosen ? `${title}: ${chosen.label}` : title
  return { title: pageTitle, description, html: hubShell(body, footer, trail(VIDEO_PATH)), jsonLd: null, status: 200 }
}

export async function senateVideoPage(read: ReadAsset, kindParam: string | null, bySlug: ReadonlyMap<string, Person> = new Map(), footer: HubFooterConfig = {}) {
  const data = await read<{ meta?: { updated?: string }; videos?: Video[] }>('/video/senate.json').catch(() => null)
  return renderSenateVideo(data, kindParam, bySlug, footer)
}
