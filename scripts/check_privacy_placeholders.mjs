#!/usr/bin/env node
// The privacy page (/privacy, #panel-privacy in portal/public/index.html) is
// public policy text. While it was drafted, every fact or decision the
// repository could not settle was left as a visible placeholder:
// <mark class="privacy-confirm" data-confirm="P…">. This check fails while any
// remain, so an unfinished policy cannot ship. It runs at the end of
// `npm run check` and before `npm run deploy` and `npm run deploy:staging`
// (the GitHub deploy workflow uses `npm run deploy`). See docs/PRIVACY.md.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PAGES = ['index.html']
const PUBLIC = new URL('../portal/public/', import.meta.url)

/** Placeholder IDs left in a page; comments are ignored, an unlabelled one is reported as "?". */
export function privacyPlaceholders(html) {
  const live = String(html).replace(/<!--[\s\S]*?-->/g, '')
  const tags = live.match(/<[a-z][^>]*>/gi) || []
  return tags
    .filter((tag) => /\sdata-confirm\s*=/i.test(tag) || /\sclass\s*=\s*"[^"]*\bprivacy-confirm\b/i.test(tag))
    .map((tag) => /\sdata-confirm\s*=\s*"([^"]*)"/i.exec(tag)?.[1] || '?')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const found = PAGES.flatMap((page) => privacyPlaceholders(readFileSync(new URL(page, PUBLIC), 'utf8')).map((id) => `${page} ${id}`))
  if (found.length) {
    console.error(`check_privacy_placeholders: the privacy page still has ${found.length} placeholder${found.length === 1 ? '' : 's'} to fill before it can ship:`)
    for (const line of found) console.error(`  ${line}`)
    console.error('Fill each one (docs/PRIVACY.md lists them), then remove its <mark class="privacy-confirm">.')
    process.exit(1)
  }
  console.log('check_privacy_placeholders: no placeholders left.')
}
