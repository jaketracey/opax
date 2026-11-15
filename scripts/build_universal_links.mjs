#!/usr/bin/env node
/**
 * Build the universal-link table for the app and the Worker from one source:
 * docs/universal-links.json (the opax.com.au addresses the OPAX app opens).
 *
 *   node scripts/build_universal_links.mjs           # write every target present
 *   node scripts/build_universal_links.mjs --check   # exit 1 if a target is stale
 *
 * Targets (each is skipped when its package is not in this checkout, so the
 * script runs on main, which has no mobile/, and on the app branches, whose
 * portal/ may predate the association route):
 *   app   mobile/src/navigation/universal-links.generated.ts, the gate the
 *         app's link handler reads (mobile/src/navigation/universal-links.ts)
 *   web   portal/src/universal-links.generated.ts, served by the Worker as
 *         /.well-known/apple-app-site-association (portal/src/app-site-association.ts)
 *
 * The tests on both sides run `--check`, so the app and the association file
 * cannot claim different addresses.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const SOURCE = join(ROOT, 'docs', 'universal-links.json')
const APP_TS = join(ROOT, 'mobile', 'src', 'navigation', 'universal-links.generated.ts')
const WEB_TS = join(ROOT, 'portal', 'src', 'universal-links.generated.ts')
const WEB_CONSUMER = join(ROOT, 'portal', 'src', 'app-site-association.ts')

const PARTS = ['/', '?', '#']

export function loadSource(file = SOURCE) {
  const source = JSON.parse(readFileSync(file, 'utf8'))
  validate(source)
  return source
}

/** A pattern's parts only: the path, and the query and fragment when set. */
const pattern = (entry) => Object.fromEntries(PARTS.filter((part) => part in entry).map((part) => [part, entry[part]]))

function validate(source) {
  if (!/^[a-z0-9.-]+$/.test(source.host ?? '')) throw new Error('universal links: host')
  if (!/^[A-Za-z0-9.-]+$/.test(source.bundleId ?? '')) throw new Error('universal links: bundleId')
  const seen = new Set()
  for (const [list, extra] of [['exclude', ['why']], ['open', ['opens', 'examples']]]) {
    if (!Array.isArray(source[list]) || !source[list].length) throw new Error(`universal links: ${list} is empty`)
    for (const entry of source[list]) {
      const label = `universal links: ${list} ${JSON.stringify(pattern(entry))}`
      if (typeof entry['/'] !== 'string' || !/^[/*]/.test(entry['/'])) throw new Error(`${label}: path`)
      for (const key of Object.keys(entry)) if (![...PARTS, ...extra].includes(key)) throw new Error(`${label}: unknown key ${key}`)
      if ('?' in entry && (typeof entry['?'] !== 'object' || Object.values(entry['?']).some((value) => typeof value !== 'string'))) throw new Error(`${label}: query`)
      if ('#' in entry && typeof entry['#'] !== 'string') throw new Error(`${label}: fragment`)
      const id = JSON.stringify(pattern(entry))
      if (seen.has(id)) throw new Error(`${label}: listed twice`)
      seen.add(id)
      if (list === 'exclude' && !entry.why) throw new Error(`${label}: say why it stays on the web`)
      if (list === 'open') {
        if (!Array.isArray(entry.opens) || !entry.opens.length) throw new Error(`${label}: opens`)
        if (!entry.examples || !Object.keys(entry.examples).length) throw new Error(`${label}: an example`)
      }
    }
  }
}

/** Apple's wildcard match: `*` is any run of characters, `?` is exactly one. */
export function wildcard(glob, text) {
  const source = [...glob].map((c) => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[\\^$+.()|[\]{}]/g, '\\$&'))).join('')
  return new RegExp(`^${source}$`, 's').test(text)
}

/** The path as a reader would see it: percent-decoded, or null when it cannot be decoded. */
export function decodedPath(url) {
  try {
    return decodeURIComponent(url.pathname)
  } catch {
    return null
  }
}

/**
 * Whether one component matches an address. The path is compared decoded, so
 * "%70erson:" is "person:"; a path that cannot be decoded matches nothing.
 * A missing query item is the empty string.
 */
export function componentMatches(component, url) {
  const path = decodedPath(url)
  if (path === null || !wildcard(component['/'], path)) return false
  for (const [key, glob] of Object.entries(component['?'] ?? {})) if (!wildcard(glob, url.searchParams.get(key) ?? '')) return false
  if ('#' in component && !wildcard(component['#'], url.hash.slice(1))) return false
  return true
}

/** The open entry that claims an address, or null: excluded addresses first, then the first match. */
export function claimed(source, url) {
  if (decodedPath(url) === null) return null
  if (source.exclude.some((entry) => componentMatches(entry, url))) return null
  return source.open.find((entry) => componentMatches(entry, url)) ?? null
}

/** The association file's `components`: every exclusion, then every claim, in table order. */
export function components(source) {
  return [
    ...source.exclude.map((entry) => ({ ...pattern(entry), exclude: true, comment: entry.why })),
    ...source.open.map((entry) => pattern(entry)),
  ]
}

const HEADER = `// Generated by scripts/build_universal_links.mjs from docs/universal-links.json.
// Do not edit: change the JSON and run the script.
`
const literal = (value) => JSON.stringify(value, null, 2)

export function buildApp(source) {
  return `${HEADER}
/** The host whose links the app claims (applinks:<host> in app.config.ts). */
export const universalLinkHost = ${literal(source.host)};

/** Addresses that stay on the web, tested before any claim. */
export const universalLinkExcludes: readonly UniversalLinkPattern[] = ${literal(source.exclude.map(pattern))};

/** Addresses the app opens, each with the route patterns it may land on. */
export const universalLinkOpens: readonly (UniversalLinkPattern & {
  opens: readonly string[];
})[] = ${literal(source.open.map((entry) => ({ ...pattern(entry), opens: entry.opens })))};

export type UniversalLinkPattern = {
  '/': string;
  '?'?: Record<string, string>;
  '#'?: string;
};
`
}

export function buildWeb(source) {
  return `${HEADER}
/** The app's bundle identifier (ios.bundleIdentifier in mobile/app.config.ts). */
export const APP_BUNDLE_ID = ${literal(source.bundleId)}

/** The host the app claims: the association file is served on this host only. */
export const APP_LINK_HOST = ${literal(source.host)}

/** applinks components: exclusions first, then the addresses the app opens. */
export const APP_LINK_COMPONENTS: readonly AppLinkComponent[] = ${literal(components(source))}

export interface AppLinkComponent {
  '/': string
  '?'?: Record<string, string>
  '#'?: string
  exclude?: true
  comment?: string
}
`
}

export function targets(source = loadSource()) {
  const list = []
  if (existsSync(dirname(APP_TS))) list.push({ kind: 'app', file: APP_TS, content: () => buildApp(source) })
  if (existsSync(WEB_CONSUMER)) list.push({ kind: 'web', file: WEB_TS, content: () => buildWeb(source) })
  return list
}

function main(argv) {
  const check = argv.includes('--check')
  const chosen = targets()
  let stale = 0
  for (const target of chosen) {
    const content = target.content()
    const current = existsSync(target.file) ? readFileSync(target.file, 'utf8') : null
    if (current === content) continue
    stale += 1
    if (check) console.error(`stale: ${relative(ROOT, target.file)}`)
    else {
      writeFileSync(target.file, content)
      console.log(`wrote ${relative(ROOT, target.file)}`)
    }
  }
  if (check && stale) {
    console.error('run: node scripts/build_universal_links.mjs')
    process.exit(1)
  }
  if (check) console.log(`universal links up to date (${chosen.length} files)`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2))
