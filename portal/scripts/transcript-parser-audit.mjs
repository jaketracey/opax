#!/usr/bin/env node
// Parser audit for the published hearing transcript text (public/transcripts): how sure the parser is of the
// speaker of each stretch of quotable text, per commission. No network, no model. Run from portal/:
//   node scripts/transcript-parser-audit.mjs            a markdown table and the unrecognised "<" line shapes
//   node scripts/transcript-parser-audit.mjs --json     the same as JSON
// Turns: every stretch of text between the marks on a page (speaker label, "Q.", "A.", "<" line).
//   confident: opens on that page under the transcript's own heading (a speaker label, or an "A." on a page with both
//     letters). Only these can carry a role, and none carries a name.
//   uncertain: opens on that page, but its speaker would have to be carried from elsewhere (a bare "Q.", a lone
//     letter, text after a "<" line). No role.
//   page-top: text running on from the page before. No role: nothing is carried across a page break.
// Excerpts: one search landing per page (the word in the middle of the page), the way the tool makes an excerpt.
// "<" lines: witness lines recognised, and shapes no pattern places (names masked), which the parser reads nothing from.
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url)
const built = await build({ stdin: { contents: "export {excerpt, pageTurns, speakerRoles, noteKind, tokens} from './src/tools/transcript-text'", resolveDir: root.pathname }, bundle: true, write: false, platform: 'neutral', format: 'esm', logLevel: 'silent' })
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))
const json = async path => JSON.parse(await readFile(new URL('public' + path, root), 'utf8'))

const KNOWN = new Set('THE WITNESS WITNESSES HEARING EXAMINATION BY VIA VIDEO-CONFERENCE AVL SWORN AFFIRMED CALLED RECALLED ON FORMER OATH AFFIRMATION WITHDREW RELEASED EXCUSED WAS WERE AT AM PM TRANSCRIPT OF VIDEO EVIDENCE EXHIBIT EXHIBITS TENDERED ADJOURNED RESUMED COMMENCED IN PUBLIC SESSION'.split(' '))
// A line's shape with every word that could be a name replaced, so the report names nobody.
const shape = line => line.trim().replace(/\[[^\]]*\]/g, '[time]').split(/(\s+|[,:.<])/).map(w => /^[\p{L}'’-]+$/u.test(w) ? (KNOWN.has(w.toUpperCase()) ? w.toUpperCase() : 'NAME') : w.replace(/\d+/g, '0')).join('').replace(/NAME(?:\s+NAME)+/g, 'NAME').replace(/\s+/g, ' ')

const index = await json('/transcripts/index.json'), out = {}
for (const row of index.docs) {
  if (row.quote_policy !== 'quote') continue
  const doc = await json(row.file), roleOf = api.speakerRoles(doc.pages)
  const c = out[row.commission] ??= { transcripts: 0, pages: 0, turns: { confident: 0, confident_with_role: 0, uncertain: 0, page_top: 0 }, characters: { confident: 0, uncertain: 0, page_top: 0 },
    excerpts: { total: 0, with_role: 0, no_role: 0, control_characters: 0 }, witness_lines: 0, unrecognised_lines: 0, unrecognised_shapes: {} }
  c.transcripts++
  for (const page of doc.pages) {
    if (typeof page.text !== 'string') continue
    c.pages++
    for (const t of api.pageTurns(page.text, roleOf)) {
      c.turns[t.basis]++; c.characters[t.basis] += t.length
      if (t.speaker_role) c.turns.confident_with_role++
    }
    for (const line of page.text.match(/^[ \t]*<[^\n]*$/gm) ?? []) {
      const kind = api.noteKind(line)
      if (kind === 'sworn') c.witness_lines++
      if (kind === 'unrecognised') { c.unrecognised_lines++; const s = shape(line); c.unrecognised_shapes[s] = (c.unrecognised_shapes[s] ?? 0) + 1 }
    }
    const words = api.tokens(page.text, new Set(index.stopwords ?? []))
    if (!words.length) continue
    const hit = api.excerpt(page.text, [words[Math.floor(words.length / 2)]], { roleOf })
    c.excerpts.total++; c.excerpts[hit.speaker_role ? 'with_role' : 'no_role']++
    if (/[\u0000-\u0008]/.test(hit.excerpt)) c.excerpts.control_characters++
    if ('speaker' in hit || 'speaker_label' in hit) throw Error(`${row.key}: an excerpt names a speaker`)
  }
}
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 2))
else {
  const n = v => v.toLocaleString('en-AU'), pct = (a, b) => b ? `${(100 * a / b).toFixed(1)}%` : 'n/a'
  console.log('| Commission | Transcripts | Pages | Confident turns | of which with a role | Uncertain turns | Page-top continuations | Excerpts (one a page) with a role | Witness lines read | Unrecognised "<" lines |')
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const [id, c] of Object.entries(out).sort()) {
    const all = c.turns.confident + c.turns.uncertain + c.turns.page_top
    console.log(`| ${id} | ${c.transcripts} | ${n(c.pages)} | ${n(c.turns.confident)} (${pct(c.turns.confident, all)}) | ${n(c.turns.confident_with_role)} | ${n(c.turns.uncertain)} (${pct(c.turns.uncertain, all)}) | ${n(c.turns.page_top)} (${pct(c.turns.page_top, all)}) | ${n(c.excerpts.with_role)} of ${n(c.excerpts.total)} (${pct(c.excerpts.with_role, c.excerpts.total)}) | ${n(c.witness_lines)} | ${n(c.unrecognised_lines)} |`)
  }
  console.log('\nShare of quotable text by characters (confident / uncertain / page-top):')
  for (const [id, c] of Object.entries(out).sort()) { const all = c.characters.confident + c.characters.uncertain + c.characters.page_top; console.log(`- ${id}: ${pct(c.characters.confident, all)} / ${pct(c.characters.uncertain, all)} / ${pct(c.characters.page_top, all)}`) }
  console.log('\nUnrecognised "<" line shapes (names masked; the parser reads nothing from these):')
  let any = false
  for (const [id, c] of Object.entries(out).sort()) for (const [s, count] of Object.entries(c.unrecognised_shapes).sort((a, b) => b[1] - a[1])) { any = true; console.log(`- ${id}: ${count} x \`${s}\``) }
  if (!any) console.log('- none')
  console.log(`\nControl characters in excerpts: ${Object.values(out).reduce((sum, c) => sum + c.excerpts.control_characters, 0)}. Excerpts naming a speaker: 0 (the script fails if one does).`)
}
