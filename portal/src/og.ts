// Open Graph cards: the element tree for one 1200x630 share image.
//
// Pure: no I/O, no wasm, no environment. The Worker (src/og-render.ts) and the
// build script (og/build.mjs) both hand this tree to satori, then resvg. What
// the card says comes from the same route metadata the <head> gets (index.ts,
// the SEO section), so a link preview can never disagree with its page.
//
// The register is the masthead's: navy ground, the gold map and pale stars as
// the lockup top-left, Merriweather for the one line that names the page, and
// the bronze rule the band ends on. Portraits are the only photograph; every
// other card carries the mark again as a hairline engraving, the site's idiom
// for decoration (see the wombat loader).

export const OG_WIDTH = 1200
export const OG_HEIGHT = 630

/** Bump when the drawing changes: it is folded into every og:image URL so the
 *  social crawlers (which cache by URL, some for weeks) fetch the new card. */
export const OG_VERSION = '4'

import { STORY_SAFE, STORY_SIZES, type StoryFormat, type StorySlide } from './story'

/** The faces the card sets, as served from /fonts/og/ (static instances of the
 *  same two OFL families the site self-hosts; satori cannot read a variable
 *  woff2, so these are the 400/600/700 cuts as woff). */
export const OG_FONT_FILES: { file: string; name: string; weight: 400 | 600 | 700; style: 'normal' | 'italic' }[] = [
  { file: 'merriweather-latin-400-normal.woff', name: 'Merriweather', weight: 400, style: 'normal' },
  { file: 'merriweather-latin-400-italic.woff', name: 'Merriweather', weight: 400, style: 'italic' },
  { file: 'public-sans-latin-400-normal.woff', name: 'Public Sans', weight: 400, style: 'normal' },
  { file: 'public-sans-latin-600-normal.woff', name: 'Public Sans', weight: 600, style: 'normal' },
  { file: 'public-sans-latin-700-normal.woff', name: 'Public Sans', weight: 700, style: 'normal' },
]

export interface OgCard {
  /** Small bronze label above the title: "Parliamentarian", "Report", "Ask". */
  kicker: string
  /** The one Merriweather line. Sized to fit; clipped only past three lines. */
  title: string
  /** A question or a motion is set in italic. */
  italic?: boolean
  /** Up to two Public Sans lines under the title. */
  lines: string[]
  /** A party colour drawn as a dot before the first line. */
  dot?: string | null
  /** A portrait as a data: URI (JPEG or PNG; satori cannot read WebP). */
  portrait?: string | null
  /** Licence line for a Commons portrait, set small under the picture. */
  credit?: string | null
  /** Home and fallback cards: the headline runs wider and larger. */
  wide?: boolean
  /** A source statistic takes the place of decorative art, or sits below a portrait. */
  stat?: { value: string; label: string }
}

// --- palette: style.css :root, the navy band's values --------------------------
const NAVY = '#142A43'
const WHITE = '#FFFFFF'
const SOFT = '#B7C6D9' // --on-navy-soft
const BRONZE_BRIGHT = '#D9A84A' // --bronze-bright, legible on navy
const BRONZE = '#A0761B' // --bronze, the rule the masthead ends on
const SERIF = 'Merriweather'
const SANS = 'Public Sans'

// --- the mark: index.html's .logo-mark paths, viewBox 0 0 176 160 ----------------
const LAND =
  'M108.6 23.0L113.3 31.2L116.6 37.9L124.0 48.0L132.9 58.7L134.0 66.4L128.5 80.9L125.7 90.4L117.5 95.3L111.9 93.6L104.1 92.4L97.8 84.9L93.3 83.6L82.3 74.2L65.5 80.3L52.6 83.9L46.2 81.8L47.8 75.4L45.3 67.0L42.0 60.5L44.2 49.4L52.6 45.8L62.1 40.2L64.4 36.4L69.0 32.0L73.3 30.1L78.7 32.8L81.8 27.0L84.6 24.4L89.9 26.1L95.8 26.5L94.9 29.1L92.6 32.6L96.2 35.4L100.6 36.6L104.7 39.2L106.6 33.1L106.9 27.4Z'
const TASSIE = 'M113.8 100.1L121.3 100.4L121.9 104.3L119.0 109.0L115.3 105.8Z'
const STARS = [
  'M 88.0 1.0 L 90.9 7.1 L 97.0 10.0 L 90.9 12.9 L 88.0 19.0 L 85.1 12.9 L 79.0 10.0 L 85.1 7.1 Z',
  'M 142.7 29.9 L 144.8 34.2 L 149.2 36.4 L 144.8 38.5 L 142.7 42.9 L 140.6 38.5 L 136.2 36.4 L 140.6 34.2 Z',
  'M 156.2 87.6 L 158.8 93.0 L 164.2 95.6 L 158.8 98.2 L 156.2 103.6 L 153.6 98.2 L 148.2 95.6 L 153.6 93.0 Z',
  'M 118.4 137.1 L 120.3 141.1 L 124.4 143.1 L 120.3 145.0 L 118.4 149.1 L 116.4 145.0 L 112.4 143.1 L 116.4 141.1 Z',
  'M 57.6 135.1 L 60.2 140.5 L 65.6 143.1 L 60.2 145.7 L 57.6 151.1 L 55.0 145.7 L 49.6 143.1 L 55.0 140.5 Z',
  'M 19.8 89.1 L 21.9 93.5 L 26.3 95.6 L 21.9 97.7 L 19.8 102.1 L 17.6 97.7 L 13.3 95.6 L 17.6 93.5 Z',
  'M 33.3 27.4 L 36.2 33.4 L 42.3 36.4 L 36.2 39.3 L 33.3 45.4 L 30.3 39.3 L 24.3 36.4 L 30.3 33.4 Z',
]

/** The solid lockup mark, as the masthead draws it. */
function markSvg(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 176 160" width="176" height="160">` +
    `<g transform="translate(0 14)" fill="${BRONZE_BRIGHT}"><path d="${LAND}"/><path d="${TASSIE}"/></g>` +
    `<g fill="${SOFT}">${STARS.map((d) => `<path d="${d}"/>`).join('')}</g></svg>`
  )
}

/** The same mark as a hairline engraving: bronze line, a breath of wash. */
function engravingSvg(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 180 164" width="180" height="164">` +
    `<g transform="translate(0 14)" fill="${BRONZE_BRIGHT}" fill-opacity="0.10" stroke="${BRONZE_BRIGHT}" stroke-width="1.1" stroke-linejoin="round">` +
    `<path d="${LAND}"/><path d="${TASSIE}"/></g>` +
    `<g fill="${SOFT}" fill-opacity="0.12" stroke="${SOFT}" stroke-width="0.9" stroke-linejoin="round">` +
    `${STARS.map((d) => `<path d="${d}"/>`).join('')}</g></svg>`
  )
}

const svgUri = (svg: string): string => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
const MARK_URI = svgUri(markSvg())
const ENGRAVING_URI = svgUri(engravingSvg())

// --- a React-shaped element without React ----------------------------------------
interface El { type: string; props: Record<string, unknown> & { children?: unknown } }
type Child = El | string | null | false | undefined

function h(type: string, props: Record<string, unknown> = {}, ...children: Child[]): El {
  const kids = children.filter((c) => c !== null && c !== false && c !== undefined)
  // satori reads an empty array as "several children" and demands display:flex.
  if (!kids.length) return { type, props }
  return { type, props: { ...props, children: kids.length === 1 ? kids[0] : kids } }
}

// --- fitting text ------------------------------------------------------------------
// satori wraps at the box width but never shrinks, so the size is chosen here
// from an estimate of the line count. The advances were measured off rendered
// cards: Merriweather averages about 0.49 em per character at these sizes
// (spaces included), Public Sans about 0.44. Both are estimated a little wide
// so a line that would just fit falls to the next size down rather than
// spilling past the edge.

function wrapLines(text: string, width: number, size: number, em: number): number {
  const perLine = Math.max(8, Math.floor(width / (size * em)))
  let lines = 1
  let used = 0
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const need = word.length + (used ? 1 : 0)
    if (used && used + need > perLine) {
      lines += 1
      used = Math.min(word.length, perLine)
    } else {
      used += need
    }
  }
  return lines
}

/** Trim on a word boundary until the text sets in `maxLines` at `size`. */
function clipToLines(text: string, width: number, size: number, em: number, maxLines: number): string {
  let t = text.trim()
  while (wrapLines(t, width, size, em) > maxLines && t.length > 12) {
    const cut = t.lastIndexOf(' ', t.length - 2)
    t = `${t.slice(0, cut > 0 ? cut : t.length - 8).replace(/[\s,;:.]+$/, '')}…`
  }
  return t
}

const SERIF_EM = 0.52
const SANS_EM = 0.47
const TITLE_SIZES = [84, 76, 68, 60, 54, 48, 42, 38]

/** The ladder of sizes a layout tries, and the size at or under which a third line is allowed. */
interface TitleFit { sizes: number[]; tripleAt: number }
const LANDSCAPE_FIT: TitleFit = { sizes: TITLE_SIZES, tripleAt: 54 }

/**
 * The largest size that sets the title in two lines; failing that, the largest
 * at or under `tripleAt` that sets it in three (a registered legal name, a
 * motion); and failing that, the smallest size with the text trimmed to three
 * lines.
 */
function fitTitle(text: string, width: number, maxSize: number, fit: TitleFit = LANDSCAPE_FIT): { size: number; text: string } {
  for (const size of fit.sizes) {
    if (size > maxSize) continue
    const lines = wrapLines(text, width, size, SERIF_EM)
    if (lines <= 2 || (size <= fit.tripleAt && lines <= 3)) return { size, text }
  }
  const size = fit.sizes[fit.sizes.length - 1]
  return { size, text: clipToLines(text, width, size, SERIF_EM, 3) }
}

/** House style has no em dashes; a summary or a motion may arrive with one. */
const plain = (s: string): string => s.replace(/\s*—\s*/g, ', ').replace(/\s+/g, ' ').trim()

// --- the card ------------------------------------------------------------------------

const PAD = 64
const PORTRAIT = 300

export function cardTree(card: OgCard): El {
  const hasPortrait = Boolean(card.portrait)
  const gutter = hasPortrait ? 56 : 48
  const artWidth = hasPortrait ? PORTRAIT : card.wide ? 140 : 290
  const textWidth = OG_WIDTH - PAD * 2 - artWidth - gutter
  const titleMax = card.wide ? 76 : card.italic ? 62 : 72
  const title = fitTitle(plain(card.title), textWidth, titleMax)
  const given = card.lines.map(plain).filter(Boolean).slice(0, 2)
  const lineSize = title.size >= 60 ? 28 : 26

  // One fact line may run to three rows; two share the room, two rows each.
  const lines = given.map((l) => clipToLines(l, textWidth, lineSize, SANS_EM, given.length === 1 ? 3 : 2))

  const masthead = h(
    'div',
    { style: { display: 'flex', alignItems: 'center', padding: `40px ${PAD}px 0 ${PAD}px` } },
    h('img', { src: MARK_URI, width: 70, height: 64 }),
    h(
      'div',
      { style: { marginLeft: 22, fontFamily: SANS, fontSize: 24, fontWeight: 600, letterSpacing: '0.02em', color: SOFT } },
      'Open Parliamentary Accountability eXchange',
    ),
  )

  const rule = h('div', { style: { height: 1, margin: `24px ${PAD}px 0 ${PAD}px`, background: 'rgba(217,168,74,0.45)' } })

  const kicker = card.kicker
    ? h(
        'div',
        { style: { fontFamily: SANS, fontSize: 20, fontWeight: 700, letterSpacing: '0.14em', color: BRONZE_BRIGHT, textTransform: 'uppercase', marginBottom: 18 } },
        card.kicker,
      )
    : null

  const headline = h(
    'div',
    {
      style: {
        fontFamily: SERIF,
        fontSize: title.size,
        fontStyle: card.italic ? 'italic' : 'normal',
        fontWeight: 400,
        lineHeight: 1.16,
        letterSpacing: '-0.005em',
        color: WHITE,
        width: textWidth,
      },
    },
    title.text,
  )

  const factLines = lines.map((l, i) =>
    h(
      'div',
      { style: { display: 'flex', alignItems: 'flex-start', fontFamily: SANS, fontSize: lineSize, lineHeight: 1.4, color: SOFT, marginTop: i === 0 ? 24 : 6, width: textWidth } },
      // The dot sits on the first row's centre line, not the block's, so a
      // line that wraps keeps its dot beside the party name.
      i === 0 && card.dot
        ? h('div', { style: { width: 16, height: 16, borderRadius: 8, background: card.dot, marginRight: 14, marginTop: Math.round((lineSize * 1.4 - 16) / 2), flexShrink: 0 } })
        : null,
      h('div', { style: { display: 'flex', flex: 1 } }, l),
    ),
  )

  const text = h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', justifyContent: 'center', width: textWidth, flexShrink: 0 } },
    kicker,
    headline,
    ...factLines,
  )

  const statistic = card.stat ? h('div', { style: { display: 'flex', flexDirection: 'column', width: artWidth, marginTop: hasPortrait ? 16 : 0, textAlign: hasPortrait ? 'center' : 'left', alignItems: hasPortrait ? 'center' : 'flex-start' } },
    h('div', { style: { fontFamily: SANS, fontSize: card.stat.value.length > 12 ? 40 : 54, fontWeight: 700, color: BRONZE_BRIGHT, lineHeight: 1.15 } }, card.stat.value),
    h('div', { style: { fontFamily: SANS, fontSize: 22, color: SOFT, marginTop: 6, lineHeight: 1.35 } }, card.stat.label)) : null
  const photoSize = card.stat ? 220 : PORTRAIT - 14
  const art = hasPortrait
    ? h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', alignItems: card.stat ? 'center' : 'flex-end', justifyContent: 'center', width: artWidth, marginLeft: gutter } },
        h(
          'div',
          { style: { display: 'flex', padding: 6, border: `1px solid rgba(217,168,74,0.7)`, borderRadius: 4 } },
          h('img', { src: card.portrait as string, width: photoSize, height: photoSize, style: { borderRadius: 2, objectFit: 'cover' } }),
        ),
        statistic,
        card.credit
          ? h(
              'div',
              { style: { fontFamily: SANS, fontSize: 14, lineHeight: 1.35, color: SOFT, opacity: 0.85, marginTop: 10, width: PORTRAIT, textAlign: 'right' } },
              clipToLines(card.credit, PORTRAIT, 14, SANS_EM, 2),
            )
          : null,
      )
    : h(
        'div',
        { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: artWidth, marginLeft: gutter } },
        statistic || h('img', { src: ENGRAVING_URI, width: card.wide ? 140 : 270, height: card.wide ? 128 : 246, style: { opacity: 0.9 } }),
      )

  const body = h('div', { style: { display: 'flex', flex: 1, alignItems: 'center', padding: `0 ${PAD}px` } }, text, art)

  const footer = h(
    'div',
    { style: { display: 'flex', padding: `0 ${PAD}px 30px ${PAD}px` } },
    h('div', { style: { fontFamily: SANS, fontSize: 20, fontWeight: 700, letterSpacing: '0.16em', color: BRONZE_BRIGHT } }, 'OPAX.COM.AU'),
  )

  const bottomRule = h('div', { style: { height: 6, background: BRONZE } })

  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', width: OG_WIDTH, height: OG_HEIGHT, background: NAVY, color: WHITE, fontFamily: SANS } },
    masthead,
    rule,
    body,
    footer,
    bottomRule,
  )
}

// --- the portrait card, 1080 x 1350 -------------------------------------------------
//
// Instagram's feed and grid are portrait (4:5), and the landscape card dropped
// in there is cropped to its middle: half a title, no wordmark. This is the same
// card stood upright, in the same register: masthead and rule at the top, the
// wordmark footer and thick rule at the bottom, and between them the person's
// portrait large and centred when there is one, the headline set big enough to
// read as a grid thumbnail, and the statistic as the largest figure on the card.
// The engraving is drawn only when a card has neither a portrait nor a
// statistic to fill the room. Public Sans sets tabular figures by default, so
// the statistic's digits align without a feature setting satori cannot read.

export const PORTRAIT_WIDTH = 1080
export const PORTRAIT_HEIGHT = 1350

export type OgFormat = 'landscape' | 'portrait'

/** The format a request asked for: only the exact word `portrait` is honoured. */
export const ogFormat = (value: string | null | undefined): OgFormat => (value === 'portrait' ? 'portrait' : 'landscape')

const P_PAD = 72
const P_TEXT_WIDTH = PORTRAIT_WIDTH - P_PAD * 2
const P_TITLE_SIZES = [128, 116, 104, 92, 84, 76, 68, 60, 54]
const P_LINE_SIZE = 34
const P_RULE = 'rgba(217,168,74,0.45)'

export function portraitTree(card: OgCard): El {
  const hasPortrait = Boolean(card.portrait)
  const centred = hasPortrait
  const align = centred ? 'center' : 'flex-start'
  const textAlign = centred ? 'center' : 'left'
  // A face takes the top of the card, so the headline under it is held to two
  // lines at the larger sizes; a card that is all type may run to three sooner.
  const titleMax = hasPortrait ? 104 : card.italic ? 84 : card.wide ? 116 : 128
  const title = fitTitle(plain(card.title), P_TEXT_WIDTH, titleMax, { sizes: P_TITLE_SIZES, tripleAt: hasPortrait ? 68 : 84 })
  const given = card.lines.map(plain).filter(Boolean).slice(0, hasPortrait ? 2 : 3)
  const rows = hasPortrait ? 2 : 3
  const lines = given.map((l) => clipToLines(l, P_TEXT_WIDTH, P_LINE_SIZE, SANS_EM, rows))

  const masthead = h(
    'div',
    { style: { display: 'flex', alignItems: 'center', padding: `56px ${P_PAD}px 0 ${P_PAD}px` } },
    h('img', { src: MARK_URI, width: 88, height: 80 }),
    h(
      'div',
      { style: { marginLeft: 26, fontFamily: SANS, fontSize: 28, fontWeight: 600, letterSpacing: '0.02em', color: SOFT } },
      'Open Parliamentary Accountability eXchange',
    ),
  )

  const rule = h('div', { style: { height: 1, margin: `28px ${P_PAD}px 0 ${P_PAD}px`, background: P_RULE } })

  const photoSize = card.stat ? 400 : 480
  const picture = hasPortrait
    ? h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: P_TEXT_WIDTH } },
        h(
          'div',
          { style: { display: 'flex', padding: 8, border: `1px solid rgba(217,168,74,0.7)`, borderRadius: 6 } },
          h('img', { src: card.portrait as string, width: photoSize, height: photoSize, style: { borderRadius: 3, objectFit: 'cover' } }),
        ),
        card.credit
          ? h(
              'div',
              { style: { fontFamily: SANS, fontSize: 18, lineHeight: 1.35, color: SOFT, opacity: 0.85, marginTop: 12, width: photoSize, textAlign: 'center' } },
              clipToLines(card.credit, photoSize, 18, SANS_EM, 2),
            )
          : null,
      )
    : null

  const kicker = card.kicker
    ? h(
        'div',
        { style: { fontFamily: SANS, fontSize: 26, fontWeight: 700, letterSpacing: '0.14em', color: BRONZE_BRIGHT, textTransform: 'uppercase', marginBottom: 18, textAlign } },
        card.kicker,
      )
    : null

  const headline = h(
    'div',
    {
      style: {
        fontFamily: SERIF,
        fontSize: title.size,
        fontStyle: card.italic ? 'italic' : 'normal',
        fontWeight: 400,
        lineHeight: 1.12,
        letterSpacing: '-0.005em',
        color: WHITE,
        width: P_TEXT_WIDTH,
        textAlign,
      },
    },
    title.text,
  )

  const factLines = lines.map((l, i) =>
    h(
      'div',
      { style: { display: 'flex', alignItems: 'flex-start', justifyContent: align, fontFamily: SANS, fontSize: P_LINE_SIZE, lineHeight: 1.4, color: SOFT, marginTop: i === 0 ? 28 : 8, width: P_TEXT_WIDTH } },
      i === 0 && card.dot
        ? h('div', { style: { width: 20, height: 20, borderRadius: 10, background: card.dot, marginRight: 16, marginTop: Math.round((P_LINE_SIZE * 1.4 - 20) / 2), flexShrink: 0 } })
        : null,
      h('div', { style: { display: 'flex', flexShrink: 1, textAlign } }, l),
    ),
  )

  const text = h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', alignItems: align, width: P_TEXT_WIDTH, marginTop: hasPortrait ? 36 : 0 } },
    kicker,
    headline,
    ...factLines,
  )

  // The statistic is the biggest figure on the card, under a short bronze hairline.
  const valueSize = hasPortrait ? 96 : card.stat && card.stat.value.length > 12 ? 84 : card.stat && card.stat.value.length > 8 ? 108 : 132
  const statistic = card.stat
    ? h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', alignItems: align, width: P_TEXT_WIDTH, marginTop: hasPortrait ? 32 : 48 } },
        h('div', { style: { width: 96, height: 1, background: P_RULE, marginBottom: hasPortrait ? 24 : 32 } }),
        h('div', { style: { fontFamily: SANS, fontSize: valueSize, fontWeight: 700, color: BRONZE_BRIGHT, lineHeight: 1.05, textAlign } }, card.stat.value),
        h('div', { style: { fontFamily: SANS, fontSize: hasPortrait ? 26 : 30, color: SOFT, marginTop: 10, lineHeight: 1.35, textAlign } }, card.stat.label),
      )
    : null

  const engraving = !hasPortrait && !card.stat
    ? h(
        'div',
        { style: { display: 'flex', justifyContent: 'flex-end', width: P_TEXT_WIDTH, marginTop: 56 } },
        h('img', { src: ENGRAVING_URI, width: 340, height: 310, style: { opacity: 0.9 } }),
      )
    : null

  // Centred in the room between the rules; clipped there rather than into the footer.
  const body = h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'center', justifyContent: 'center', padding: `0 ${P_PAD}px`, overflow: 'hidden' } },
    picture,
    text,
    statistic,
    engraving,
  )

  const footer = h(
    'div',
    { style: { display: 'flex', padding: `24px ${P_PAD}px 44px ${P_PAD}px` } },
    h('div', { style: { fontFamily: SANS, fontSize: 28, fontWeight: 700, letterSpacing: '0.16em', color: BRONZE_BRIGHT } }, 'OPAX.COM.AU'),
  )

  const bottomRule = h('div', { style: { height: 8, background: BRONZE } })

  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', width: PORTRAIT_WIDTH, height: PORTRAIT_HEIGHT, background: NAVY, color: WHITE, fontFamily: SANS } },
    masthead,
    rule,
    body,
    footer,
    bottomRule,
  )
}

/** The tree and canvas for a format: what every renderer hands to satori. */
export function ogLayout(format: OgFormat): { width: number; height: number; tree: (card: OgCard) => El } {
  return format === 'portrait'
    ? { width: PORTRAIT_WIDTH, height: PORTRAIT_HEIGHT, tree: portraitTree }
    : { width: OG_WIDTH, height: OG_HEIGHT, tree: cardTree }
}

// --- the story: a daily edition as a carousel ---------------------------------------
//
// Nine slide types (src/story.ts), all 1080x1350 and all in the portrait card's
// register: masthead and rule at the top, the wordmark footer and thick rule at
// the bottom. The cover is the one photograph; every other slide is type on
// navy, the way the portrait card is, so a carousel still reads as one account
// mid-swipe. Photographs arrive as data: URIs already read by the caller; a
// cover with none is drawn as the engraving card, so a story never fails for
// want of a picture.

/** Resolved pictures for one slide: data: URIs (JPEG or PNG), or null. */
export interface StoryImages {
  photo?: string | null
  /** The catalogue's credit line, drawn on the footer (cover) or under the frame (picture). */
  credit?: string | null
  inset?: string | null
  insetCredit?: string | null
  /** This slide's place in the run, drawn opposite the mark as "2 / 7". */
  index?: number | null
  total?: number | null
}

const S_TITLE_SIZES = [140, 128, 116, 104, 92, 84, 76, 68, 60]
const S_SOFT_RULE = 'rgba(183,198,217,0.18)'
const S_BRONZE_RULE = 'rgba(217,168,74,0.6)'
const S_BRONZE_RING = 'rgba(217,168,74,0.75)'
/** The cover's photograph runs this deep before its mask has feathered it into the navy. */
const S_PHOTO_BAND = 960

/**
 * The frame a slide is drawn in. The feed carousel is 1080 x 1350; a story
 * frame is 1080 x 1920 with Instagram's own controls over its top and bottom,
 * so the same drawing sits inside a band of safe room and only the cover's
 * photograph runs out under the controls.
 */
interface StoryGeometry { height: number; padTop: number; padBottom: number; band: number }
const STORY_GEOMETRY: Record<StoryFormat, StoryGeometry> = {
  feed: { height: STORY_SIZES.feed.height, padTop: 0, padBottom: 0, band: S_PHOTO_BAND },
  story: { height: STORY_SIZES.story.height, padTop: STORY_SAFE, padBottom: STORY_SAFE, band: S_PHOTO_BAND + STORY_SAFE },
}
const S_KICKER = 32
const S_LINE = 40
const S_NOTE = 30
/** The source slide's call to action stops short of the right edge, where the engraving sits. */
const S_CTA_WIDTH = P_TEXT_WIDTH - 250

/** House style, plus: the faces carry no arrow glyphs, so a path's arrows become middle dots. */
const storyText = (s: string): string => plain(String(s ?? '')).replace(/\s*(?:→|←|->|=>)\s*/g, ' · ')

/** The largest size that sets the title in `maxLines`; failing that, the smallest with the text trimmed. */
function fitStoryTitle(text: string, maxSize: number, maxLines: number): { size: number; text: string } {
  for (const size of S_TITLE_SIZES) {
    if (size > maxSize) continue
    if (wrapLines(text, P_TEXT_WIDTH, size, SERIF_EM) <= maxLines) return { size, text }
  }
  const size = S_TITLE_SIZES[S_TITLE_SIZES.length - 1]
  return { size, text: clipToLines(text, P_TEXT_WIDTH, size, SERIF_EM, maxLines) }
}

/** A small chevron for the cover's "Swipe" cue: the sans has no arrow glyph. */
const ARROW_URI = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M3 12h16M13 6l6 6-6 6" fill="none" stroke="${SOFT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`)

/** The mark alone on the left (on a story the name is the account, not the masthead) and the slide's place in the run on the right. */
function storyMasthead(images: StoryImages = {}): El {
  const counter = images.index && images.total && images.total > 1
    ? h('div', { style: { fontFamily: SERIF, fontSize: 44, lineHeight: 1, letterSpacing: '0.06em', color: SOFT, opacity: 0.85 } }, `${images.index} / ${images.total}`)
    : null
  return h(
    'div',
    { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `52px ${P_PAD}px 0 ${P_PAD}px` } },
    h('img', { src: MARK_URI, width: 110, height: 100 }),
    counter,
  )
}

/** A credit as the slide draws it: author and licence; the caption carries the "via Wikimedia Commons". */
const slideCredit = (credit: string): string => credit.replace(/,?\s*via Wikimedia Commons/gi, '')

const storyRule = (): El => h('div', { style: { height: 1, margin: `26px ${P_PAD}px 0 ${P_PAD}px`, background: P_RULE } })

function storyFooter(credit?: string | null, swipe = false): El {
  const right = credit || swipe
    ? h(
        'div',
        { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', maxWidth: 600 } },
        credit ? h('div', { style: { fontFamily: SANS, fontSize: 22, lineHeight: 1.3, color: SOFT, opacity: 0.85, textAlign: 'right' } }, clipToLines(slideCredit(storyText(credit)), 600, 22, SANS_EM, 2)) : null,
        swipe ? h('div', { style: { fontFamily: SANS, fontSize: 24, fontWeight: 600, color: SOFT, opacity: 0.9, marginLeft: credit ? 18 : 0 } }, credit ? '· Swipe' : 'Swipe') : null,
        swipe ? h('img', { src: ARROW_URI, width: 26, height: 26, style: { marginLeft: 8, opacity: 0.9 } }) : null,
      )
    : null
  return h(
    'div',
    { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: `24px ${P_PAD}px 52px ${P_PAD}px` } },
    h('div', { style: { fontFamily: SANS, fontSize: 34, fontWeight: 700, letterSpacing: '0.18em', color: BRONZE_BRIGHT } }, 'OPAX.COM.AU'),
    right,
  )
}

function storyKicker(text: string, centred = false): El | null {
  const t = storyText(text)
  return t ? h('div', { style: { fontFamily: SANS, fontSize: S_KICKER, fontWeight: 700, letterSpacing: '0.14em', color: BRONZE_BRIGHT, textTransform: 'uppercase', marginBottom: 22, textAlign: centred ? 'center' : 'left' } }, clipToLines(t, P_TEXT_WIDTH, S_KICKER, SANS_EM * 1.25, 1)) : null
}

function storyHeadline(text: string, maxSize: number, maxLines: number, centred = false, italic = false): El {
  const title = fitStoryTitle(storyText(text), maxSize, maxLines)
  return h('div', { style: { fontFamily: SERIF, fontSize: title.size, fontStyle: italic ? 'italic' : 'normal', fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.008em', color: WHITE, width: P_TEXT_WIDTH, textAlign: centred ? 'center' : 'left' } }, title.text)
}

/** Public Sans lines under a headline, each held to `rows` lines; the first stands `first` px clear of the headline. */
function storyLines(lines: string[], centred = false, rows = 3, first = 30, size = S_LINE): El[] {
  return lines.map(plain).filter(Boolean).slice(0, 3).map((l, i) =>
    h('div', { style: { display: 'flex', justifyContent: centred ? 'center' : 'flex-start', fontFamily: SANS, fontSize: size, lineHeight: 1.35, color: SOFT, marginTop: i === 0 ? first : 10, width: P_TEXT_WIDTH, textAlign: centred ? 'center' : 'left' } },
      clipToLines(l, P_TEXT_WIDTH, size, SANS_EM, rows)),
  )
}

function storyNote(text: string | null | undefined, centred = false): El | null {
  const t = text ? storyText(text) : ''
  return t ? h('div', { style: { fontFamily: SANS, fontSize: S_NOTE, lineHeight: 1.4, color: SOFT, opacity: 0.85, marginTop: 40, width: P_TEXT_WIDTH, textAlign: centred ? 'center' : 'left' } }, clipToLines(t, P_TEXT_WIDTH, S_NOTE, SANS_EM, 3)) : null
}

/** The engraving as a watermark in the lower right, behind the type. */
const storyEngraving = (width: number, opacity: number, g: StoryGeometry): El =>
  h('img', { src: ENGRAVING_URI, width, height: Math.round(width * 164 / 180), style: { position: 'absolute', right: P_PAD, bottom: 112 + g.padBottom, opacity } })

/** The body: the room between the rules, centred, clipped there rather than into the footer. */
function storyBody(children: (El | null)[], opts: { centred?: boolean; end?: boolean } = {}): El {
  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', flex: 1, alignItems: opts.centred ? 'center' : 'flex-start', justifyContent: opts.end ? 'flex-end' : 'center', padding: `0 ${P_PAD}px`, overflow: 'hidden' } },
    ...children,
  )
}

function storyFrame(g: StoryGeometry, children: (El | null)[]): El {
  return h('div', { style: { display: 'flex', flexDirection: 'column', width: PORTRAIT_WIDTH, height: g.height, paddingTop: g.padTop, paddingBottom: g.padBottom, background: NAVY, color: WHITE, fontFamily: SANS } }, ...children)
}

/** A portrait as a medallion: a circle inside a bronze hairline ring. */
function storyMedallion(src: string, size = 300): El {
  return h(
    'div',
    { style: { display: 'flex', padding: 10, border: `1px solid ${S_BRONZE_RING}`, borderRadius: size, background: 'rgba(20,42,67,0.55)', marginBottom: 40 } },
    h('img', { src, width: size, height: size, style: { borderRadius: size / 2, objectFit: 'cover' } }),
  )
}

function coverSlide(slide: Extract<StorySlide, { type: 'cover' }>, images: StoryImages, g: StoryGeometry): El {
  const photo = images.photo ?? null
  const inset = images.inset ? storyMedallion(images.inset) : null
  const credit = [images.photo ? images.credit : null, images.inset ? images.insetCredit : null].filter(Boolean).join(' · ')
  if (!photo) {
    // No approved photograph: the engraving card, as the portrait card draws it.
    return storyFrame(g, [
      storyMasthead(images),
      storyRule(),
      storyBody([
        inset,
        storyKicker(slide.kicker),
        storyHeadline(slide.title, 128, 2),
        ...storyLines([slide.line], false, 3),
        h('div', { style: { display: 'flex', justifyContent: 'flex-end', width: P_TEXT_WIDTH, marginTop: 56 } }, h('img', { src: ENGRAVING_URI, width: 520, height: 474, style: { opacity: 0.9 } })),
      ]),
      storyFooter(credit, g.padTop === 0), // a carousel is swiped; a story is tapped
    ])
  }
  // The photograph is masked, not framed: it feathers into the navy over its
  // lower third, and a wash keeps the mark legible over its top and tints the
  // whole toward the palette so any picture reads as one of ours.
  const band = h('img', {
    src: photo, width: PORTRAIT_WIDTH, height: g.band,
    style: { position: 'absolute', left: 0, top: 0, objectFit: 'cover', maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 56%, rgba(0,0,0,0) 100%)' },
  })
  const wash = h('div', { style: { position: 'absolute', left: 0, top: 0, width: PORTRAIT_WIDTH, height: g.band, backgroundImage: 'linear-gradient(to bottom, rgba(20,42,67,0.6) 0%, rgba(20,42,67,0.14) 24%, rgba(20,42,67,0.14) 58%, rgba(20,42,67,0.7) 100%)' } })
  return storyFrame(g, [
    band,
    wash,
    storyMasthead(images),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'flex-start', justifyContent: 'flex-end', padding: `0 ${P_PAD}px 24px ${P_PAD}px`, overflow: 'hidden' } },
      inset,
      storyKicker(slide.kicker),
      storyHeadline(slide.title, 140, 2),
      ...storyLines([slide.line], false, 3),
    ),
    storyFooter(credit, g.padTop === 0), // a carousel is swiped; a story is tapped
  ])
}

function numberSlide(slide: Extract<StorySlide, { type: 'number' }>, images: StoryImages, g: StoryGeometry): El {
  const value = storyText(slide.value)
  const valueSize = value.length > 12 ? 104 : value.length > 8 ? 132 : 176
  return storyFrame(g, [
    storyMasthead(images),
    storyRule(),
    storyEngraving(340, 0.28, g),
    storyBody([
      storyKicker(slide.kicker),
      storyHeadline(slide.title, 104, 3),
      ...storyLines(slide.lines, false, 3),
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: P_TEXT_WIDTH, marginTop: 52 } },
        h('div', { style: { width: 120, height: 1, background: P_RULE, marginBottom: 34 } }),
        h('div', { style: { fontFamily: SANS, fontSize: valueSize, fontWeight: 700, color: BRONZE_BRIGHT, lineHeight: 1.02, letterSpacing: '-0.01em' } }, value),
        h('div', { style: { fontFamily: SANS, fontSize: 36, color: SOFT, marginTop: 14, lineHeight: 1.35, width: P_TEXT_WIDTH - 330 } }, clipToLines(storyText(slide.label), P_TEXT_WIDTH - 330, 36, SANS_EM, 2)),
      ),
    ]),
    storyFooter(),
  ])
}

function pictureSlide(slide: Extract<StorySlide, { type: 'picture' }>, images: StoryImages, g: StoryGeometry): El {
  // The picture is an arch: a bronze hairline around a photograph whose top is a
  // half circle, the frame the engraving register would draw around a plate.
  const W = P_TEXT_WIDTH, H = 500, R = W / 2
  const frame = images.photo
    ? h(
        'div',
        { style: { display: 'flex', padding: 10, border: `1px solid ${S_BRONZE_RING}`, borderTopLeftRadius: R, borderTopRightRadius: R, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 } },
        h('img', { src: images.photo, width: W - 20, height: H - 20, style: { objectFit: 'cover', borderTopLeftRadius: R - 10, borderTopRightRadius: R - 10, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 } }),
      )
    : null
  const credit = images.photo && images.credit
    ? h('div', { style: { fontFamily: SANS, fontSize: 22, lineHeight: 1.35, color: SOFT, opacity: 0.85, marginTop: 14, marginBottom: 40, width: W, textAlign: 'center' } }, clipToLines(slideCredit(storyText(images.credit)), W, 22, SANS_EM, 1))
    : h('div', { style: { height: images.photo ? 40 : 0 } })
  const quote = slide.quote ? storyText(slide.quote) : ''
  return storyFrame(g, [
    storyMasthead(images),
    storyRule(),
    storyBody([
      frame,
      credit,
      storyKicker(slide.kicker, true),
      storyHeadline(slide.title, 76, 2, true),
      quote ? h('div', { style: { fontFamily: SERIF, fontStyle: 'italic', fontSize: 46, lineHeight: 1.3, color: WHITE, marginTop: 26, width: P_TEXT_WIDTH, textAlign: 'center' } }, clipToLines(quote, P_TEXT_WIDTH, 46, SERIF_EM, 3)) : null,
      ...storyLines(slide.lines, true, 2, 26, 36),
    ], { centred: true }),
    storyFooter(),
  ])
}

function barsSlide(slide: Extract<StorySlide, { type: 'bars' }>, images: StoryImages, g: StoryGeometry): El {
  const items = slide.items.slice(0, 5).map((it) => {
    const pct = Math.max(0, Math.min(100, Math.round(Number(it.pct) || 0)))
    return h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', width: P_TEXT_WIDTH, marginTop: 34 } },
      h(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: SANS, fontSize: 38, lineHeight: 1.2, color: WHITE } },
        h('div', { style: { display: 'flex', fontSize: 40 } }, clipToLines(storyText(it.label), 720, 40, SANS_EM, 1)),
        h('div', { style: { color: BRONZE_BRIGHT, fontWeight: 700, fontSize: 52 } }, `${pct}%`),
      ),
      h(
        'div',
        { style: { display: 'flex', height: 22, background: S_SOFT_RULE, marginTop: 16, width: P_TEXT_WIDTH } },
        h('div', { style: { height: 22, width: Math.round(P_TEXT_WIDTH * pct / 100), background: BRONZE_BRIGHT } }),
      ),
    )
  })
  return storyFrame(g, [
    storyMasthead(images),
    storyRule(),
    storyBody([
      storyKicker(slide.kicker),
      storyHeadline(slide.title, 92, 3),
      ...storyLines(slide.lines, false, 3),
      h('div', { style: { display: 'flex', flexDirection: 'column', width: P_TEXT_WIDTH, marginTop: 16 } }, ...items),
      storyNote(slide.note),
    ]),
    storyFooter(),
  ])
}

function ledgerSlide(slide: Extract<StorySlide, { type: 'ledger' }>, images: StoryImages, g: StoryGeometry): El {
  const C1 = 170, AMT = 260, GAP = 24, SIZE = 34
  const c2Width = P_TEXT_WIDTH - C1 - AMT - GAP * 2
  const rows = slide.rows.slice(0, 5).map((r) =>
    h(
      'div',
      { style: { display: 'flex', alignItems: 'flex-start', width: P_TEXT_WIDTH, paddingTop: 20, paddingBottom: 20, borderTop: `1px solid ${S_SOFT_RULE}`, fontFamily: SANS, fontSize: SIZE, lineHeight: 1.3 } },
      h('div', { style: { width: C1, color: BRONZE_BRIGHT, fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0 } }, clipToLines(storyText(r.c1), C1, SIZE, SANS_EM * 1.1, 1)),
      h('div', { style: { display: 'flex', width: c2Width, marginLeft: GAP, color: WHITE } }, clipToLines(storyText(r.c2), c2Width, SIZE, SANS_EM, 2)),
      h('div', { style: { width: AMT, marginLeft: GAP, color: WHITE, fontWeight: 700, textAlign: 'right', flexShrink: 0 } }, storyText(r.amount)),
    ),
  )
  const total = slide.total
    ? h(
        'div',
        { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', width: P_TEXT_WIDTH, paddingTop: 22, paddingBottom: 22, borderTop: `1px solid ${S_BRONZE_RULE}`, borderBottom: `1px solid ${S_BRONZE_RULE}`, fontFamily: SANS } },
        h('div', { style: { fontSize: SIZE, color: SOFT } }, clipToLines(storyText(slide.total.label), P_TEXT_WIDTH - AMT - GAP, SIZE, SANS_EM, 1)),
        h('div', { style: { fontSize: 44, color: BRONZE_BRIGHT, fontWeight: 700, textAlign: 'right' } }, storyText(slide.total.amount)),
      )
    : null
  return storyFrame(g, [
    storyMasthead(images),
    storyRule(),
    storyBody([
      storyKicker(slide.kicker),
      storyHeadline(slide.title, 92, 3),
      ...storyLines(slide.lines, false, 3),
      h('div', { style: { display: 'flex', flexDirection: 'column', width: P_TEXT_WIDTH, marginTop: 40 } }, ...rows, total),
      storyNote(slide.note),
    ]),
    storyFooter(),
  ])
}

function timelineSlide(slide: Extract<StorySlide, { type: 'timeline' }>, images: StoryImages, g: StoryGeometry): El {
  const events = slide.events.slice(0, 6).map((e) =>
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', paddingTop: 16, paddingBottom: 20, position: 'relative' } },
      h('div', { style: { position: 'absolute', left: -58, top: 30, width: 22, height: 22, borderRadius: 11, background: BRONZE_BRIGHT } }),
      h('div', { style: { fontFamily: SANS, fontSize: 28, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: BRONZE_BRIGHT, lineHeight: 1.2 } }, storyText(e.date)),
      h('div', { style: { fontFamily: SANS, fontSize: 38, lineHeight: 1.3, color: WHITE, marginTop: 6, width: P_TEXT_WIDTH - 64 } }, clipToLines(storyText(e.text), P_TEXT_WIDTH - 64, 38, SANS_EM, 2)),
    ),
  )
  return storyFrame(g, [
    storyMasthead(images),
    storyRule(),
    storyBody([
      storyKicker(slide.kicker),
      storyHeadline(slide.title, 104, 3),
      ...storyLines(slide.lines, false, 3),
      h('div', { style: { display: 'flex', flexDirection: 'column', marginTop: 44, marginLeft: 16, borderLeft: '2px solid rgba(217,168,74,0.5)', paddingLeft: 46 } }, ...events),
    ]),
    storyFooter(),
  ])
}

function divisionSlide(slide: Extract<StorySlide, { type: 'division' }>, images: StoryImages, g: StoryGeometry): El {
  const ayes = Math.max(0, Math.round(Number(slide.ayes) || 0))
  const noes = Math.max(0, Math.round(Number(slide.noes) || 0))
  const total = ayes + noes || 1
  const side = (n: number, label: string, parties: [string, number][], colour: string): El =>
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', width: (P_TEXT_WIDTH - 60) / 2 } },
      h('div', { style: { fontFamily: SANS, fontSize: 150, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.01em', color: colour } }, String(n)),
      h('div', { style: { fontFamily: SANS, fontSize: 28, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: SOFT, marginTop: 12, marginBottom: 24 } }, label),
      ...parties.slice(0, 5).map(([party, count]) =>
        h(
          'div',
          { style: { display: 'flex', justifyContent: 'space-between', fontFamily: SANS, fontSize: 36, lineHeight: 1.3, color: WHITE, paddingTop: 10, paddingBottom: 10, borderTop: `1px solid ${S_SOFT_RULE}` } },
          h('div', { style: { display: 'flex' } }, clipToLines(storyText(party), 300, 36, SANS_EM, 1)),
          h('div', { style: { color: SOFT } }, String(count)),
        ),
      ),
    )
  const ayeWidth = Math.round((P_TEXT_WIDTH - 4) * ayes / total)
  return storyFrame(g, [
    storyMasthead(images),
    storyRule(),
    storyBody([
      storyKicker(slide.kicker),
      storyHeadline(slide.title, 92, 3),
      h('div', { style: { display: 'flex', justifyContent: 'space-between', width: P_TEXT_WIDTH, marginTop: 44 } }, side(ayes, 'Ayes', slide.ayeParties, BRONZE_BRIGHT), side(noes, 'Noes', slide.noParties, SOFT)),
      h(
        'div',
        { style: { display: 'flex', height: 18, width: P_TEXT_WIDTH, marginTop: 40 } },
        h('div', { style: { width: ayeWidth, height: 18, background: BRONZE_BRIGHT } }),
        h('div', { style: { width: P_TEXT_WIDTH - 4 - ayeWidth, height: 18, marginLeft: 4, background: 'rgba(183,198,217,0.45)' } }),
      ),
      ...storyLines([slide.line], false, 2, 30, 36),
    ]),
    storyFooter(),
  ])
}

function listSlide(slide: Extract<StorySlide, { type: 'list' }>, images: StoryImages, g: StoryGeometry): El {
  const NUM = 96
  const items = slide.items.slice(0, 4).map((text, i) =>
    h(
      'div',
      { style: { display: 'flex', alignItems: 'flex-start', width: P_TEXT_WIDTH, paddingBottom: 30 } },
      h('div', { style: { width: NUM, flexShrink: 0, fontFamily: SERIF, fontSize: 64, lineHeight: 1.1, color: BRONZE_BRIGHT, marginTop: -6 } }, String(i + 1)),
      h('div', { style: { display: 'flex', width: P_TEXT_WIDTH - NUM, fontFamily: SANS, fontSize: 36, lineHeight: 1.3, color: WHITE } }, clipToLines(storyText(text), P_TEXT_WIDTH - NUM, 36, SANS_EM, 5)),
    ),
  )
  return storyFrame(g, [
    storyMasthead(images),
    storyRule(),
    storyBody([
      storyKicker(slide.kicker),
      storyHeadline(slide.title, 92, 3),
      h('div', { style: { display: 'flex', flexDirection: 'column', width: P_TEXT_WIDTH, marginTop: 40 } }, ...items),
      storyNote(slide.note),
    ]),
    storyFooter(),
  ])
}

function sourceSlide(slide: Extract<StorySlide, { type: 'source' }>, images: StoryImages, g: StoryGeometry): El {
  // The address is the largest type on the slide and must never break mid-path:
  // sized to one line on a bold-width estimate (0.6em a character), 40px at least.
  const url = storyText(slide.url)
  const urlSize = Math.max(40, Math.min(64, Math.floor(S_CTA_WIDTH / (Math.max(1, url.length) * 0.6))))
  const rows = slide.rows.slice(0, 4).map((r) =>
    h('div', { style: { display: 'flex', width: P_TEXT_WIDTH, fontFamily: SANS, fontSize: 34, lineHeight: 1.35, color: WHITE, paddingTop: 18, paddingBottom: 18, borderTop: `1px solid ${S_SOFT_RULE}` } }, clipToLines(storyText(r), P_TEXT_WIDTH, 34, SANS_EM, 2)),
  )
  return storyFrame(g, [
    storyMasthead(images),
    storyRule(),
    storyEngraving(240, 0.38, g),
    storyBody([
      storyKicker(slide.kicker),
      storyHeadline(slide.title, 92, 3),
      h('div', { style: { display: 'flex', flexDirection: 'column', width: P_TEXT_WIDTH, marginTop: 40 } }, ...rows),
      // The call to action stops short of the engraving's column, so the two never share a line.
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', width: S_CTA_WIDTH, marginTop: 52 } },
        h('div', { style: { width: 120, height: 1, background: P_RULE, marginBottom: 30 } }),
        h('div', { style: { fontFamily: SANS, fontSize: urlSize, fontWeight: 700, lineHeight: 1.1, letterSpacing: '0.01em', color: BRONZE_BRIGHT, width: S_CTA_WIDTH } }, url),
        h('div', { style: { fontFamily: SANS, fontSize: 34, lineHeight: 1.35, color: SOFT, marginTop: 14, width: S_CTA_WIDTH } }, clipToLines(storyText(slide.path), S_CTA_WIDTH, 34, SANS_EM, 2)),
      ),
    ]),
    storyFooter(),
  ])
}

/** The element tree for one slide of a story: 1080x1350 for the feed, 1080x1920 as a story frame. Alt text is never drawn. */
export function storySlideTree(slide: StorySlide, images: StoryImages = {}, format: StoryFormat = 'feed'): El {
  const g = STORY_GEOMETRY[format]
  switch (slide.type) {
    case 'cover': return coverSlide(slide, images, g)
    case 'number': return numberSlide(slide, images, g)
    case 'picture': return pictureSlide(slide, images, g)
    case 'bars': return barsSlide(slide, images, g)
    case 'ledger': return ledgerSlide(slide, images, g)
    case 'timeline': return timelineSlide(slide, images, g)
    case 'division': return divisionSlide(slide, images, g)
    case 'list': return listSlide(slide, images, g)
    case 'source': return sourceSlide(slide, images, g)
  }
}

/** The home page and the card every failure falls back to. */
export function homeCard(): OgCard {
  return {
    kicker: '',
    title: 'Ask what your politicians actually said.',
    lines: ['Half a million Australian parliamentary speeches, the votes and the money behind them. Every answer cited to the official record.'],
    wide: true,
  }
}
