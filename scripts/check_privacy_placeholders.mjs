#!/usr/bin/env node
// The privacy page (/privacy, #panel-privacy in portal/public/index.html) is
// public policy text. While it was drafted, every fact or decision the
// repository could not settle was left as a visible placeholder:
// <mark class="privacy-confirm" data-confirm="P…">[To confirm: …]</mark>. This
// check fails while any remain, so an unfinished policy cannot ship. It runs at
// the end of `npm run check` and first in `npm run deploy` and
// `npm run deploy:staging` (the GitHub deploy workflow uses `npm run deploy`).
// See docs/PRIVACY.md.
//
// It fails closed: besides placeholder elements in any attribute quoting, any
// other mention of the marker class or attribute, and any "[To confirm" or
// "[To decide" text left without its wrapper, counts as a placeholder ("?").
// Comments and <style> blocks are ignored.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PAGES = [fileURLToPath(new URL('../portal/public/index.html', import.meta.url))]
const COMMENTS = /<!--[\s\S]*?-->/g
const STYLES = /<style\b[\s\S]*?<\/style\s*>/gi
// A start tag whose attribute values may be double-quoted, single-quoted or bare.
const TAG = /<([a-z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/gi
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
const STRAY = /privacy-confirm|data-confirm|\[\s*to\s+(?:confirm|decide)\b/gi

function attributes(text) {
  const out = new Map()
  for (const m of text.matchAll(ATTR)) out.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '')
  return out
}

/** Placeholder IDs left in a page, in order; an unlabelled or stray one is "?". */
export function privacyPlaceholders(html) {
  const page = String(html).replace(COMMENTS, '').replace(STYLES, '')
  const lower = page.toLowerCase()
  const found = []
  let rest = '', last = 0
  for (const m of page.matchAll(TAG)) {
    if (m.index < last) continue // inside a placeholder already counted
    const attrs = attributes(m[2])
    const marked = attrs.has('data-confirm') || (attrs.get('class') || '').split(/\s+/).includes('privacy-confirm')
    if (!marked) continue
    found.push(attrs.get('data-confirm') || '?')
    // Drop the element and its text so its "[To confirm" is not counted twice.
    const close = lower.indexOf(`</${m[1].toLowerCase()}`, m.index + m[0].length)
    rest += page.slice(last, m.index)
    last = close === -1 ? page.length : close
  }
  rest += page.slice(last)
  for (const _ of rest.matchAll(STRAY)) found.push('?')
  return found
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.length > 2 ? process.argv.slice(2) : PAGES
  const found = files.flatMap((file) => privacyPlaceholders(readFileSync(file, 'utf8')).map((id) => `${file.split('/').pop()} ${id}`))
  if (found.length) {
    console.error(`check_privacy_placeholders: the privacy page still has ${found.length} placeholder${found.length === 1 ? '' : 's'} to fill before it can ship:`)
    for (const line of found) console.error(`  ${line}`)
    console.error('Fill each one (docs/PRIVACY.md lists them), then remove its <mark class="privacy-confirm">.')
    process.exit(1)
  }
  console.log('check_privacy_placeholders: no placeholders left.')
}
