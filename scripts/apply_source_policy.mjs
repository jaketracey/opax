#!/usr/bin/env node
// Applies the source policy (parli/ingest/source_policy.json) to the published files, with no source
// requests and no PDFs: the step a takedown needs before a deploy.
//
//   portal/public/royal-commissions/   a withheld document becomes a listing row (title, date, its label and
//                                      the publisher's page); a document that is not quotable carries no
//                                      quotation; each listed commission states its `use`
//   portal/public/transcripts/         the text file, index row and postings of a transcript that is withheld
//                                      or not quotable are removed
//
// Runs first in `npm run build:search`, so every later build (report records, search catalogue, crawl pages)
// reads files that already honour the list. `--check` writes nothing and exits 1 if a file would change.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { POLICY, redactCommission } from '../parli/ingest/source_policy.mjs'

const PUBLIC = fileURLToPath(new URL('../portal/public/', import.meta.url))
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** Returns the files that changed (or, with check, would change), relative to `root`. */
export function applySourcePolicy({ root = PUBLIC, policy = POLICY, check = false } = {}) {
  const changed = []
  const put = (rel, value, newline = true) => {
    changed.push(rel)
    const data = JSON.stringify(value) + (newline ? '\n' : '')
    if (!check) writeFileSync(join(root, rel), data)
    return data
  }
  const drop = rel => { changed.push(rel); if (!check) rmSync(join(root, rel), { recursive: true, force: true }) }

  // ---- royal commissions
  const rc = 'royal-commissions'
  if (existsSync(join(root, rc, 'index.json'))) {
    const rewritten = new Map()
    for (const name of readdirSync(join(root, rc)).filter(n => /^commission-[a-z0-9-]+\.json$/.test(n)).sort()) {
      const file = read(join(root, rc, name)), next = { ...file, commission: redactCommission(file.commission, policy) }
      if (!same(file, next)) rewritten.set(name, put(`${rc}/${name}`, next))
    }
    const index = read(join(root, rc, 'index.json'))
    const rows = index.commissions.map(row => {
      const { use: _use, withheld: _withheld, ...rest } = row, entry = policy.withheld({ sources: [row.id] })
      return { ...rest, ...(policy.listed(row.id) ? { use: policy.use(row.id) } : {}), ...(entry ? { withheld: entry } : {}) }
    })
    if (!same(rows, index.commissions)) rewritten.set('index.json', put(`${rc}/index.json`, { ...index, commissions: rows }))
    if (rewritten.size && existsSync(join(root, rc, 'manifest.json'))) {
      const manifest = read(join(root, rc, 'manifest.json'))
      for (const [name, data] of rewritten) manifest.files[name] = { sha256: createHash('sha256').update(data).digest('hex'), bytes: Buffer.byteLength(data) }
      put(`${rc}/manifest.json`, manifest)
    }
  }

  // ---- transcript text
  const tx = 'transcripts'
  if (existsSync(join(root, tx, 'index.json'))) {
    const index = read(join(root, tx, 'index.json'))
    const allowed = d => policy.listed(d.commission) && policy.textAllowed({ documents: [`${d.commission}/${d.key}`] })
    const gone = index.docs.filter(d => !d.withheld && !allowed(d))
    if (gone.length) {
      const dead = new Set(gone.map(d => d.i))
      for (const d of gone) drop(d.file.replace(/^\//, ''))
      // Positions are what the postings name, so a removed transcript leaves an empty row behind.
      index.docs = index.docs.map(d => dead.has(d.i) ? { i: d.i, withheld: true } : d)
      for (const [id, c] of Object.entries(index.commissions)) {
        const left = index.docs.filter(d => d.commission === id)
        if (!left.length) { delete index.commissions[id]; drop(`${tx}/${id}`); continue }
        c.counts = { transcripts: left.length, quote: left.filter(d => d.quote_policy === 'quote').length, no_quotes: left.filter(d => d.quote_policy === 'no_quotes').length }
      }
      for (const name of readdirSync(join(root, tx, 'terms')).filter(n => n.endsWith('.json')).sort()) {
        const shard = read(join(root, tx, 'terms', name)), next = {}
        for (const [term, docs] of Object.entries(shard)) {
          const kept = docs.filter(i => !dead.has(i))
          if (kept.length) next[term] = kept
        }
        if (!same(shard, next)) put(`${tx}/terms/${name}`, next, false)
      }
      put(`${tx}/index.json`, index, false)
    }
  }
  return changed
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check')
  const changed = applySourcePolicy({ check })
  if (check && changed.length) {
    console.error(`[apply_source_policy] ${changed.length} published files do not honour the source policy, e.g. ${changed.slice(0, 3).join(', ')}. Run: node scripts/apply_source_policy.mjs`)
    process.exit(1)
  }
  console.log(`[apply_source_policy] ${check ? 'checked' : 'applied'}: ${changed.length} files ${check ? 'would change' : 'changed'}`)
}
