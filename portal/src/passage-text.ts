import { decodeHTMLStrict } from 'entities'
import roster from './passage-names.json' with {type:'json'}

const BLOCKS = new Set('p div br li ul ol h1 h2 h3 h4 h5 h6 tr table blockquote section article header footer dd dt dl pre hr'.split(' '))
const TAGS = new Set([...BLOCKS, ...'a abbr acronym address area audio b base bdi bdo big body button canvas caption center cite code col colgroup data datalist del details dfn dialog em embed fieldset figcaption figure font form head html i iframe img input ins kbd label legend link main map mark menu meta meter nav noscript object optgroup option output param picture progress q rp rt ruby s samp script select slot small source span strike strong style sub summary sup tbody td template textarea tfoot th thead time title track tt u var video wbr'.split(' ')])
const NAME_TOKENS = new Set([...roster.name_tokens, ...roster.surnames.map(name => name.toLowerCase())])
const INLINE = '\x00'
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const alternatives = (values: string[]) => values.map(escapeRegex).join('|')
// Projection arrays are longest first, so an overlapping longer roster name wins.
const first = [...new Set([...roster.full_names,...roster.honorifics].map(name=>name[0]))].sort().join('')
const NAMES = new RegExp(`(?=[${escapeRegex(first)}])(?<name>(?<full>${alternatives(roster.full_names)})|(?:${alternatives(roster.honorifics)}) (?:${alternatives(roster.surnames)}))(?<function>${alternatives(roster.function_words)})?`, 'gu')
const INTERJECTION = /(?<![\p{L}\p{M}\p{N}_])([\p{L}]+?)(interjecting|interjections|interjection)(?![\p{L}\p{M}\p{N}_])/giu
const word = (char: string) => /[\p{L}\p{M}\p{N}_]/u.test(char)

/** Only markers and complete roster names; never split general camel case. */
export function repairPassageJoins(value: string): {text: string; counts: Record<string, number>} {
  const counts = {interjection:0, before_name:0, after_name:0}
  let text = value.replace(INTERJECTION, (_match, left: string, marker: string) => {
    counts.interjection++
    return left + ' ' + marker
  })
  text = text.replace(NAMES, (...args) => {
    const match = args[0] as string, at = args[args.length-3] as number
    const groups = args[args.length-1] as {name:string; full?:string; function?:string}
    if (word(text.charAt(at+match.length))) return match
    if (groups.function && NAME_TOKENS.has((groups.name.split(' ').at(-1)! + groups.function).toLowerCase())) return match
    const before = text.charAt(at-1)
    const prefix = !!groups.full && /^[a-z]$/.test(before)
    // Other honorifics often introduce non-roster names, e.g. Ms Erin.
    const suffix = !!groups.function && (!!groups.full || groups.name.startsWith('Senator ')) && (prefix || !word(before))
    counts.before_name += Number(prefix)
    counts.after_name += Number(suffix)
    return (prefix ? ' ' : '') + groups.name + (suffix ? ' ' : '') + (groups.function || '')
  })
  return {text, counts}
}

/** Scan each candidate once, including unterminated tags and comments. */
function stripMarkup(text: string): string {
  const parts: string[] = []
  const head = /<\/?([a-z][a-z0-9]*)/giy
  let cursor = 0, copied = 0
  while (true) {
    const at = text.indexOf('<', cursor)
    if (at < 0) break
    let stop: number, replacement: string
    if (text.startsWith('<!--', at)) {
      const end = text.indexOf('-->', at + 4)
      if (end < 0) break
      stop = end + 3
      replacement = INLINE
    } else {
      head.lastIndex = at
      const match = head.exec(text)
      if (!match || !TAGS.has(match[1].toLowerCase())) { cursor = at + 1; continue }
      stop = head.lastIndex
      if (stop < text.length && !/[\s/>]/.test(text[stop])) { cursor = stop; continue }
      let quote = ''
      while (stop < text.length) {
        const char = text[stop]
        if (quote) { if (char === quote) quote = '' }
        else if (char === '"' || char === "'") quote = char
        else if (char === '<' || char === '>') break
        stop++
      }
      if (stop === text.length) break
      if (text[stop] === '<') { cursor = stop; continue }
      stop++
      replacement = BLOCKS.has(match[1].toLowerCase()) ? '\n' : INLINE
    }
    parts.push(text.slice(copied, at), replacement)
    copied = cursor = stop
  }
  parts.push(text.slice(copied))
  return parts.join('')
}

/** Display cleanup only; decode semicolon entities once after known markup. */
export function normalizePassage(value: string): string {
  let text = decodeHTMLStrict(stripMarkup(value))
    .replace(/([\p{L}\p{N}_])\x00+(?=[\p{L}\p{N}_])/gu, '$1 ').replaceAll(INLINE, '')
  text = repairPassageJoins(text).text
  return text.replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Window normalized text with UTF-16 offsets/cap, including cut markers. */
export function passageWindow(text: string, limit = 600, start = 0, end = text.length): string {
  if (limit <= 0) return ''
  start = Math.min(text.length, Math.max(0, start))
  end = Math.min(text.length, Math.max(0, end))
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
