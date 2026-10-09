import { decodeHTML } from 'entities'

const BLOCKS = new Set('p div br li ul ol h1 h2 h3 h4 h5 h6 tr table blockquote section article header footer dd dt dl pre hr'.split(' '))
const INLINE = '\x00'

/** Display cleanup only; decode entities once, after removing actual markup. */
export function normalizePassage(value: string): string {
  let text = decodeHTML(value.replace(/<!--[\s\S]*?-->/g, INLINE)
    .replace(/<\/?([a-z][\w:-]*)(?:\s+(?:[^<>"']|"[^"]*"|'[^']*')*)?\/?>/gi, (_tag, name: string) => BLOCKS.has(name.toLowerCase()) ? '\n' : INLINE))
    .replace(/([\p{L}\p{N}_])\x00+(?=[\p{L}\p{N}_])/gu, '$1 ').replaceAll(INLINE, '')
  // Audited joins already stored by the historical get_text(strip=True) scrape.
  text = text.replace(/\b(Opposition senators)(?=interjecting\b)/g, '$1 ')
    .replace(/\b(Senator Allison)(?=until\b)/g, '$1 ')
    .replace(/\b(whistleblowers)(?=Andrew Wilkie\b)/g, '$1 ')
    .replace(/\b([Ww]hen)(Malcolm Turnbull|Joe Hockey)was\b/g, '$1 $2 was')
  return text.replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Window already-normalized text; the cap includes any cut markers. */
export function passageWindow(text: string, limit = 600, start = 0, end = text.length): string {
  if (limit <= 0) return ''
  start = Math.min(text.length, Math.max(0, start))
  while (start > 0 && !/\s/.test(text[start - 1])) start--
  while (start < text.length && /\s/.test(text[start])) start++
  const prefix = text.slice(0, start).trim() ? '… ' : ''
  let stop = Math.min(text.length, end, start + Math.max(0, limit - prefix.length))
  const suffix = text.slice(stop).trim() ? ' …' : ''
  stop = Math.min(stop, start + Math.max(0, limit - prefix.length - suffix.length))
  while (stop > start && stop < text.length && !/\s/.test(text[stop]) && !/\s/.test(text[stop - 1])) stop--
  const body = text.slice(start, stop).trim()
  return body ? (prefix + body + suffix).trim() : text.trim() ? '…' : ''
}
