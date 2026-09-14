/**
 * A daily edition told as an Instagram carousel: a run of 1080 × 1350 slides,
 * one fact each, opened by an approved photograph and closed by the source.
 *
 * The composer (daily-post.ts) writes the slides from the edition's own
 * records; the renderer (og.ts) draws them; social-publication.ts posts them
 * as one carousel. This file is the contract the three share, plus the
 * catalogue of photographs a person has approved for covers: the Worker never
 * posts a picture that is not in public/social/photos.json.
 */

/** A slide's kicker is short and uppercase on the card; the alt text is what Instagram reads out. */
interface SlideBase { kicker: string; title: string; alt: string }

export type StorySlide =
  /** The opening photograph, headline over its lower edge. `photo` is a catalogue id; `inset` a portrait id from /photos/jpg. */
  | (SlideBase & { type: 'cover'; line: string; photo: string | null; inset?: string | null; insetCredit?: string | null })
  /** The one figure the edition leads with. */
  | (SlideBase & { type: 'number'; lines: string[]; value: string; label: string })
  /** A framed photograph with a fact, or a quotation, beneath it. */
  | (SlideBase & { type: 'picture'; photo: string; quote?: string | null; lines: string[] })
  /** Horizontal bars, percentages already rounded. */
  | (SlideBase & { type: 'bars'; lines: string[]; items: { label: string; pct: number }[]; note?: string | null })
  /** A ledger: a short first column, a description, an amount. */
  | (SlideBase & { type: 'ledger'; lines: string[]; rows: { c1: string; c2: string; amount: string }[]; total?: { label: string; amount: string } | null; note?: string | null })
  /** Dated events down a hairline. */
  | (SlideBase & { type: 'timeline'; lines: string[]; events: { date: string; text: string }[] })
  /** One recorded division: the counts, the party split, a stacked bar. */
  | (SlideBase & { type: 'division'; ayes: number; noes: number; ayeParties: [string, number][]; noParties: [string, number][]; line: string })
  /** Numbered sentences, with the attribution that qualifies them. */
  | (SlideBase & { type: 'list'; items: string[]; note?: string | null })
  /** The closing slide: the sources, and the page the numbers live on, as the largest type. */
  | (SlideBase & { type: 'source'; rows: string[]; url: string; path: string })

export type StorySlideType = StorySlide['type']

/** Instagram allows ten items in a carousel; the story never uses fewer than three. */
export const STORY_MIN_SLIDES = 3
export const STORY_MAX_SLIDES = 10
/** Bump when a slide's drawing changes so cached renders are not reused. */
export const STORY_VERSION = 2

/** Where a slide is drawn: the feed carousel at 4:5, or a story frame at 9:16. */
export type StoryFormat = 'feed' | 'story'
export const STORY_SIZES: Record<StoryFormat, { width: number; height: number }> = {
  feed: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
}
/** Instagram's own controls cover about this much of a story's top and bottom; nothing that matters is drawn there. */
export const STORY_SAFE = 250
/** A story posts fewer frames than the carousel has slides: the tray is not the feed. */
export const STORY_FRAMES_MAX = 5

/**
 * The slides a story posts as story frames, as 1-based slide numbers: the
 * cover and the source always, and between them, kept in the run's own order,
 * the first number, the picture and the cross-reference (a ledger, or a second
 * number), then whatever else fits under `max`.
 */
export function storyFrames(slides: unknown, max = STORY_FRAMES_MAX): number[] {
  if (!validStory(slides)) return []
  const last = slides.length - 1
  const room = Math.max(0, Math.min(max, slides.length) - 2)
  const middle = slides.slice(1, last).map((slide, i) => ({ slide, n: i + 2 }))
  const picked: number[] = []
  const take = (type: StorySlideType) => {
    if (picked.length >= room) return
    const next = middle.find(m => m.slide.type === type && !picked.includes(m.n))
    if (next) picked.push(next.n)
  }
  for (const type of ['number', 'picture', 'ledger', 'number', 'division', 'bars', 'timeline', 'list'] as StorySlideType[]) take(type)
  return [1, ...picked.sort((a, b) => a - b), last + 1]
}

export interface StoryPhoto {
  /** Path under the static asset store, e.g. /social/photos/senate-chamber.jpg. */
  file: string
  width: number
  height: number
  description: string
  source_title: string
  page: string
  author: string
  licence: string
  licence_url?: string
  /** The line drawn on the slide and repeated in the caption. */
  credit: string
}

export interface PhotoCatalogue {
  version: number
  accepted_licences: string[]
  photos: Record<string, StoryPhoto>
  /** Photo ids by edition subject (`grant:GA34203`, `person:Bob Katter`, `bill:au-federal-r7513`, `topic:climate`). */
  subjects: Record<string, string[]>
  /** Photo ids by kind, most specific first: `bill:senate`, then `bill`; `politician`; `topic`; `grant`. */
  kinds: Record<string, string[]>
}

/** Only these licence families may be posted; the check is on the catalogue entry, not the file. */
export const ACCEPTED_LICENCE = /^(CC0|Public domain|CC BY(?:-SA)?(?: \d(?:\.\d)?)?(?: [A-Z]{2})?)$/i

export function photoAllowed(photo: StoryPhoto | undefined | null): photo is StoryPhoto {
  return !!photo && typeof photo.file === 'string' && /^\/social\/photos\/[a-z0-9-]+\.jpg$/.test(photo.file)
    && typeof photo.credit === 'string' && photo.credit.length > 0 && ACCEPTED_LICENCE.test(photo.licence ?? '')
}

/**
 * The approved photographs for an edition, most specific first: the subject's
 * own, then the kind's (a chamber for a bill, Parliament House for a person or
 * a topic). Entries that fail the licence check are dropped silently, so a bad
 * catalogue edit costs a cover, never a post.
 */
export function photosFor(catalogue: PhotoCatalogue | null | undefined, subject: string, kind: string, variant?: string | null): string[] {
  if (!catalogue || typeof catalogue !== 'object') return []
  const ids = [
    ...(catalogue.subjects?.[subject] ?? []),
    ...(variant ? catalogue.kinds?.[`${kind}:${variant}`] ?? [] : []),
    ...(catalogue.kinds?.[kind] ?? []),
  ]
  const seen = new Set<string>()
  return ids.filter(id => typeof id === 'string' && /^[a-z0-9-]+$/.test(id) && !seen.has(id) && (seen.add(id), photoAllowed(catalogue.photos?.[id])))
}

export function photoFor(catalogue: PhotoCatalogue | null | undefined, id: string | null | undefined): StoryPhoto | null {
  if (!id || !catalogue) return null
  const photo = catalogue.photos?.[id]
  return photoAllowed(photo) ? photo : null
}

/** A story is publishable only when every slide is well formed and within Instagram's bounds. */
export function validStory(slides: unknown): slides is StorySlide[] {
  if (!Array.isArray(slides) || slides.length < STORY_MIN_SLIDES || slides.length > STORY_MAX_SLIDES) return false
  if (slides[0]?.type !== 'cover' || slides[slides.length - 1]?.type !== 'source') return false
  return slides.every(s => s && typeof s === 'object' && typeof s.type === 'string' && typeof s.title === 'string' && s.title.length > 0 && typeof s.alt === 'string' && s.alt.length > 0)
}
