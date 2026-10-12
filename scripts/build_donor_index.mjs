#!/usr/bin/env node
/**
 * public/graph/donor-index.json: the browser's donor privacy index, computed
 * here once from the four published money graphs instead of in every reader's
 * browser. The app's first render waits for this index (app.js donorViewReady),
 * and computing it client-side meant downloading and parsing every money graph
 * (~200 KB br, ~1 MB of JSON) before any page could draw, including pages that
 * name no donor.
 *
 * The file is exactly donorPrivacyIndex(MONEY_GRAPHS) over the published,
 * already-withheld graphs, so donorNameWithheld answers as before. It runs after
 * withhold_donor_assets.mjs (npm run build:privacy). As a guard against running
 * it on unwithheld graphs, it refuses to write unless every withheld label is an
 * anonymous "Donor N (name withheld)" placeholder: no individual's name can reach
 * this file.
 *
 *   node scripts/build_donor_index.mjs           # write
 *   node scripts/build_donor_index.mjs --check   # exit 1 if stale
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MONEY_GRAPHS, donorPrivacyIndex } from '../portal/public/donor-entity.js'

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'portal', 'public')
export const DONOR_INDEX = '/graph/donor-index.json'
const PLACEHOLDER = /^donor \d+ \(name withheld\)$/

/** The index as published: sorted folded labels. Throws on any named withheld label. */
export function donorIndexFile(publicRoot = PUBLIC) {
  const graphs = MONEY_GRAPHS.map((p) => JSON.parse(readFileSync(join(publicRoot, p), 'utf8')))
  const index = donorPrivacyIndex(graphs)
  const named = [...index.withheld].filter((label) => !PLACEHOLDER.test(label))
  if (named.length) throw new Error(`build_donor_index: ${named.length} withheld donor label(s) are not anonymised; run withhold_donor_assets.mjs first. Nothing written.`)
  return { organisations: [...index.organisations].sort(), withheld: [...index.withheld].sort() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = JSON.stringify(donorIndexFile()) + '\n'
  const path = join(PUBLIC, DONOR_INDEX)
  const before = (() => { try { return readFileSync(path, 'utf8') } catch { return '' } })()
  if (process.argv.includes('--check')) {
    if (before !== text) { console.error('build_donor_index: public/graph/donor-index.json is stale — run node scripts/build_donor_index.mjs.'); process.exit(1) }
    console.log('build_donor_index: current.')
  } else if (before !== text) {
    writeFileSync(path, text)
    console.log('build_donor_index: written.')
  } else console.log('build_donor_index: already current.')
}
