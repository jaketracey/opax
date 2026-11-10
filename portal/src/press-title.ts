// PM Transcripts titles as published (speeches-press-005).
//
// The PM Transcripts API returns each title already entity-encoded inside CDATA
// (<title><![CDATA[Doorstop - The Royal Children&#039;s Hospital]]></title>), and the
// fetcher stored it as given until 10 Nov 2026, so 493 published press-pmt resources carry
// "&#039;", "&amp;" and "&quot;" in their title, headline and the headline line of their
// body. The fetcher now unescapes (parli/ingest/words_press_releases.py); this decodes the
// resources already in the knowledge box at read time, so they are fixed without a KB
// rewrite. Only press-pmt records, the one source that encodes (the other sources' titles
// hold no entities), and one pass: an encoded ampersand decodes once, never twice.

const PMT_SLUG = /^press-pmt-[a-z0-9-]+$/
const ENTITY = /&(#\d{1,7}|#x[0-9a-f]{1,6}|amp|quot|apos|lt|gt|nbsp);/gi
const NAMED: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }

/** One pass of HTML entity decoding over a title-like string. */
export function decodeTitleEntities(text: string): string {
  return text.replace(ENTITY, (whole, body: string) => {
    const key = body.toLowerCase()
    if (key in NAMED) return NAMED[key]
    const code = key.startsWith('#x') ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10)
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole
  })
}

/** A press-pmt record's title, decoded; any other record's title unchanged. */
export function pressTitle(slug: string, title: string): string
export function pressTitle(slug: string, title: string | null | undefined): string | null | undefined
export function pressTitle(slug: string, title: string | null | undefined): string | null | undefined {
  return typeof title === 'string' && PMT_SLUG.test(slug) && title.includes('&') ? decodeTitleEntities(title) : title
}

/**
 * The same repair for a press-pmt record's headline and body text. The sync made the
 * headline the body's first line, so only a leading copy of the encoded headline is
 * decoded; the transcript itself is clean and is left byte for byte.
 */
export function pressHeadlineAndText(slug: string, headline: unknown, text: string): { headline: unknown; text: string } {
  if (!PMT_SLUG.test(slug) || typeof headline !== 'string' || !headline.includes('&')) return { headline, text }
  const decoded = decodeTitleEntities(headline)
  return { headline: decoded, text: text.startsWith(headline) ? decoded + text.slice(headline.length) : text }
}
