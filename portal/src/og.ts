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
export const OG_VERSION = '3'

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

/**
 * The largest size that sets the title in two lines; failing that, the largest
 * at or under 54 that sets it in three (a registered legal name, a motion); and
 * failing that, the smallest size with the text trimmed to three lines.
 */
function fitTitle(text: string, width: number, maxSize: number): { size: number; text: string } {
  for (const size of TITLE_SIZES) {
    if (size > maxSize) continue
    const lines = wrapLines(text, width, size, SERIF_EM)
    if (lines <= 2 || (size <= 54 && lines <= 3)) return { size, text }
  }
  const size = TITLE_SIZES[TITLE_SIZES.length - 1]
  return { size, text: clipToLines(text, width, size, SERIF_EM, 3) }
}

// --- the card ------------------------------------------------------------------------

const PAD = 64
const PORTRAIT = 300

export function cardTree(card: OgCard): El {
  const hasPortrait = Boolean(card.portrait)
  const gutter = hasPortrait ? 56 : 48
  const artWidth = hasPortrait ? PORTRAIT : 290
  const textWidth = OG_WIDTH - PAD * 2 - artWidth - gutter
  const titleMax = card.wide ? 76 : card.italic ? 62 : 72
  // House style has no em dashes; a summary or a motion may arrive with one.
  const plain = (s: string): string => s.replace(/\s*—\s*/g, ', ').replace(/\s+/g, ' ').trim()
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

  const art = hasPortrait
    ? h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', width: artWidth, marginLeft: gutter } },
        h(
          'div',
          { style: { display: 'flex', padding: 6, border: `1px solid rgba(217,168,74,0.7)`, borderRadius: 4 } },
          h('img', { src: card.portrait as string, width: PORTRAIT - 14, height: PORTRAIT - 14, style: { borderRadius: 2, objectFit: 'cover' } }),
        ),
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
        h('img', { src: ENGRAVING_URI, width: 270, height: 246, style: { opacity: 0.9 } }),
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

/** The home page and the card every failure falls back to. */
export function homeCard(): OgCard {
  return {
    kicker: '',
    title: 'Ask what your politicians actually said.',
    lines: ['Half a million Australian parliamentary speeches, the votes and the money behind them. Every answer cited to the official record.'],
    wide: true,
  }
}
