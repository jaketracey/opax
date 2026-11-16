#!/usr/bin/env node
// Applies the source policy to the published files before a deploy, with no source requests and no PDFs.
//
// Two inputs. The tiers (parli/ingest/source_policy.json) are public, and what they change is committed:
// a commission below the quoting tiers carries no quotation or text pointer.
// (A commission's own `use` field is written by its build, parli/ingest/royal_commissions.py, and the registry
// and this policy are tested to agree.) The withheld list is private. It is read only from the OPAX_WITHHELD_JSON environment variable (the Deploy
// workflow's secret), never from a file, so a build on a developer's machine cannot write a withheld item's
// changes into the working tree by accident. What the list changes is deployed and never committed, and
// nothing printed here says what changed or how much.
//
//   royal-commissions/   a withheld document is one neutral line (title, date, the notice, the publisher's
//                        page), or is left out in hide mode; a hidden commission has no file and no index row
//   transcripts/         the text file, index row and postings of a withheld transcript are removed
//   integrity-reports/, agency-reports/, annual-reports/
//                        a withheld report (its report slug, e.g. integrity-report-<id>) keeps its title, date
//                        and publisher link with the notice, or is removed; its findings, facts and tables go
//
// Runs first in `npm run build:search`, so every later build (report records, search catalogue, crawl pages)
// reads files that already honour both. `--check` uses the tiers alone, writes nothing and exits 1 if a
// committed file would change.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { POLICY, NOTICE, loadWithheld, redactCommission } from '../parli/ingest/source_policy.mjs'

const PUBLIC = fileURLToPath(new URL('../portal/public/', import.meta.url))
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
export const slugPart = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const pick = (row, names) => Object.fromEntries(names.filter(k => row[k] != null).map(k => [k, row[k]]))

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
  const has = rel => existsSync(join(root, rel))
  /** How a report is withheld, by its report slug; null when it is not. */
  const report = (type, id) => policy.withheld({ documents: [`${type}-${slugPart(id)}`] })

  // ---- royal commissions
  const rc = 'royal-commissions'
  if (has(`${rc}/index.json`)) {
    const rewritten = new Map(), hidden = new Set()
    for (const name of readdirSync(join(root, rc)).filter(n => /^commission-[a-z0-9-]+\.json$/.test(n)).sort()) {
      const file = read(join(root, rc, name)), commission = redactCommission(file.commission, policy)
      if (!commission) { hidden.add(file.commission.id); drop(`${rc}/${name}`); continue }
      const next = { ...file, commission }
      if (!same(file, next)) rewritten.set(name, put(`${rc}/${name}`, next))
    }
    const index = read(join(root, rc, 'index.json'))
    const rows = index.commissions.filter(row => !hidden.has(row.id)).map(row => policy.withheld({ sources: [row.id] }) ? { ...row, unavailable: NOTICE } : row)
    if (!same(rows, index.commissions)) rewritten.set('index.json', put(`${rc}/index.json`, { ...index, commissions: rows }))
    if ((rewritten.size || hidden.size) && has(`${rc}/manifest.json`)) {
      const manifest = read(join(root, rc, 'manifest.json'))
      for (const [name, data] of rewritten) manifest.files[name] = { sha256: createHash('sha256').update(data).digest('hex'), bytes: Buffer.byteLength(data) }
      for (const id of hidden) delete manifest.files[`commission-${id}.json`]
      put(`${rc}/manifest.json`, manifest)
    }
  }

  // ---- transcript text
  const tx = 'transcripts'
  if (has(`${tx}/index.json`)) {
    const index = read(join(root, tx, 'index.json'))
    const allowed = d => policy.listed(d.commission) && policy.can('narrative', { documents: [`${d.commission}/${d.key}`] })
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
  if (!policy.withheldCount) return changed

  // ---- integrity reports: the body files and the index's own list
  const integrity = 'integrity-reports'
  if (has(`${integrity}/index.json`)) {
    const listed = r => ({ ...pick(r, ['id', 'body', 'jurisdiction', 'title', 'report_type', 'type_as_published', 'date', 'date_basis', 'page_url']), unavailable: NOTICE })
    const apply = records => records.flatMap(r => { const entry = report('integrity-report', r.id); return !entry ? [r] : entry.mode === 'hide' ? [] : [listed(r)] })
    for (const name of readdirSync(join(root, integrity)).filter(n => /^reports-[a-z-]+\.json$/.test(n)).sort()) {
      const file = read(join(root, integrity, name)), records = apply(file.records ?? [])
      if (!same(records, file.records)) put(`${integrity}/${name}`, { ...file, records }, false)
    }
    const index = read(join(root, integrity, 'index.json'))
    if (Array.isArray(index.reports)) { const reports = apply(index.reports); if (!same(reports, index.reports)) put(`${integrity}/index.json`, { ...index, reports }, false) }
  }

  // ---- agency reports: the document list and each jurisdiction's facts
  const agency = 'agency-reports'
  if (has(`${agency}/index.json`)) {
    const index = read(join(root, agency, 'index.json')), closed = new Set()
    const documents = index.documents.flatMap(d => {
      const entry = report('agency-report', d.id)
      if (!entry) return [d]
      closed.add(d.id)
      return entry.mode === 'hide' ? [] : [{ ...pick(d, ['id', 'jurisdiction', 'agency', 'reporting_year', 'kind', 'catalogue_url', 'facts_file']), source_url: d.catalogue_url ?? d.source_url, unavailable: NOTICE }]
    })
    if (closed.size) {
      if (!same(documents, index.documents)) put(`${agency}/index.json`, { ...index, documents }, false)
      for (const name of readdirSync(join(root, agency)).filter(n => /^facts-[a-z]+\.json$/.test(n)).sort()) {
        const file = read(join(root, agency, name)), facts = (file.facts ?? []).filter(f => !closed.has(f.report_id))
        if (facts.length !== (file.facts ?? []).length) put(`${agency}/${name}`, { ...file, facts }, false)
      }
    }
  }

  // ---- annual reports: the body's entry for the year, its headline figures and its tables
  const annual = 'annual-reports'
  if (has(`${annual}/index.json`)) {
    const index = read(join(root, annual, 'index.json')), closed = new Set()
    const bodies = index.bodies.map(b => ({ ...b, reports: Object.fromEntries(Object.entries(b.reports ?? {}).flatMap(([year, r]) => {
      const entry = report('annual-report', `${b.id}-${year}`)
      if (!entry) return [[year, r]]
      closed.add(`${b.id}/${year}`)
      return entry.mode === 'hide' ? [] : [[year, { ...pick(r, ['title', 'published_on', 'portfolio', 'url']), unavailable: NOTICE }]]
    })) }))
    if (closed.size) {
      const headline = (index.headline ?? []).filter(h => !closed.has(`${h.body_id}/${h.year}`))
      if (!same([bodies, headline], [index.bodies, index.headline ?? []])) put(`${annual}/index.json`, { ...index, bodies, headline }, false)
      for (const name of readdirSync(join(root, annual)).filter(n => /^(?:remuneration|suppliers)-\d{4}-\d{2}\.json$/.test(n)).sort()) {
        const file = read(join(root, annual, name)), year = /(\d{4}-\d{2})\.json$/.exec(name)[1]
        const dead = new Set(Object.entries(file.tables ?? {}).filter(([, t]) => closed.has(`${t.body_id}/${year}`)).map(([id]) => id))
        if (dead.size) put(`${annual}/${name}`, { ...file, tables: Object.fromEntries(Object.entries(file.tables).filter(([id]) => !dead.has(id))), rows: file.rows.filter(r => !dead.has(r.table_id)) }, false)
      }
    }
  }
  return changed
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check')
  // A store that is set and cannot be read stops the build here, with a message that repeats none of it.
  if (!check) loadWithheld(process.env.OPAX_WITHHELD_JSON)
  const changed = applySourcePolicy({ check })
  if (check && changed.length) {
    console.error(`[apply_source_policy] ${changed.length} committed files do not carry the published tiers, e.g. ${changed.slice(0, 3).join(', ')}. Run: node scripts/apply_source_policy.mjs`)
    process.exit(1)
  }
  // Never a count or a path: with a withheld list in force, either would say something changed.
  console.log(`[apply_source_policy] ${check ? 'checked' : 'applied'}`)
}
