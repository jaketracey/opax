import { decodeHTML } from 'entities'
import roster from './passage-names.json' with {type:'json'}

const BLOCKS = new Set('p div br li ul ol h1 h2 h3 h4 h5 h6 tr table blockquote section article header footer dd dt dl pre hr'.split(' '))
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

/** Display cleanup only; decode entities once, after removing actual markup. */
export function normalizePassage(value: string): string {
  let text = decodeHTML(value.replace(/<!--[\s\S]*?-->/g, INLINE)
    .replace(/<\/?([a-z][\w:-]*)(?:\s+(?:[^<>"']|"[^"]*"|'[^']*')*)?\/?>/gi, (_tag, name: string) => BLOCKS.has(name.toLowerCase()) ? '\n' : INLINE))
    .replace(/([\p{L}\p{N}_])\x00+(?=[\p{L}\p{N}_])/gu, '$1 ').replaceAll(INLINE, '')
  text = repairPassageJoins(text).text
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
