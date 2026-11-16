#!/usr/bin/env node
// Parser audit for the published hearing transcript text (public/transcripts): how sure the page makes the role of
// whoever holds each turn, per commission. No network, no model. Run from portal/:
//   node scripts/transcript-parser-audit.mjs            a markdown table
//   node scripts/transcript-parser-audit.mjs --json     the same as JSON
//   node scripts/transcript-parser-audit.mjs --sample   role-labelled excerpts to read against the page (see below)
// Turns are pageTurns' (src/tools/transcript-text.ts); roles are transcriptRoles' (src/tools/transcript-roles.ts).
//   confident: the turn has a role (a role-word heading, a heading the cover page gives a role, "HEADING: Q.", a
//     "Q." or "A." inside an examination seen on the same page).
//   uncertain: the turn opens on the page (a heading or a mark) and has no role; or it follows a "<" line.
//   page-top: text running on from the page before. Never a role.
// Excerpts: one search landing per page (the word in the middle of the page), as the tool makes an excerpt.
// "<" lines: counted as "EXAMINATION BY" lines and all others. No "<" line is parsed for a name or a kind.
// Possible label slips: a heading turn straight after another under the same heading (one may be an answer the
// publisher printed under the examiner's label). Both are left without a role. A slip between two different
// headings cannot be seen from the page and keeps its (wrong) role.
// Replies under a counsel heading: a turn of one to three words that reads as a witness's reply ("Yes.",
// "Correct."), under a heading with a counsel role, straight after a turn that ends in a question mark. Counsel
// answering the Commissioner looks the same, so these are counted, not changed.
// --sample prints, for a fixed spread of pages (always including the four NSW pages named in the review of
// PR #468), each role-labelled excerpt with the lines around it, for a person to read against the PDF page. It
// prints the transcript's own words, so its output is for reading and is not kept in the repo.
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url)
const built = await build({ stdin: { contents: "export {excerpt, pageTurns, tokens} from './src/tools/transcript-text'; export {transcriptRoles, answeredQuestion, mismarkedPages, SHORT_ANSWER_WORDS} from './src/tools/transcript-roles'", resolveDir: root.pathname }, bundle: true, write: false, platform: 'neutral', format: 'esm', logLevel: 'silent' })
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))
const json = async path => JSON.parse(await readFile(new URL('public' + path, root), 'utf8'))
const index = await json('/transcripts/index.json'), stop = new Set(index.stopwords ?? [])
// A short reply of the kind a witness gives ("Yes.", "Correct.", "I did.").
const REPLY = /^(?:yes|no|yeah|yep|correct|that's (?:right|correct)|that is (?:right|correct)|i (?:do|did|am|was|have|had)|mmm)\b/i
const REVIEW_PAGES = { 'transcript-2024-09-17-80b238a4a479': [48, 50], 'transcript-2024-02-26-fb62df0f0847': [45, 7] }

const out = {}, sample = []
for (const [d, row] of index.docs.entries()) {
  if (row.quote_policy !== 'quote') continue
  const doc = await json(row.file), roleFor = api.transcriptRoles(doc.pages, row.key), listed = api.mismarkedPages(row.key)
  const c = out[row.commission] ??= { transcripts: 0, pages: 0, turns: { confident: 0, uncertain: 0, page_top: 0 }, characters: { confident: 0, uncertain: 0, page_top: 0 }, roles: {},
    excerpts: { total: 0, with_role: 0, no_role: 0, empty: 0 }, notes: { examination: 0, other: 0 }, possible_label_slips: 0, replies_under_counsel: 0, named_headings_no_role: 0, short_answers: { total: 0, with_question: 0 }, same_mark_runs: 0, listed_pages: 0 }
  c.transcripts++
  for (const page of doc.pages) {
    if (typeof page.text !== 'string') continue
    c.pages++
    const parsed = { ...api.pageTurns(page.text, page.n), pdfPage: page.n }
    if (listed.has(page.n)) c.listed_pages++
    for (const [i, t] of parsed.turns.entries()) {
      if (t.opens === 'note') c.notes[/EXAMINATION BY/i.test(parsed.text.slice(t.from, t.start)) ? 'examination' : 'other']++
      if (t.opens === 'heading' && parsed.turns[i - 1]?.opens === 'heading' && parsed.turns[i - 1].heading === t.heading) c.possible_label_slips++
      // Two bare marks of the same letter running: the publisher's slip that a page shows. Neither has a role.
      if (t.opens === 'mark' && !t.heading && parsed.turns[i - 1]?.opens === 'mark' && !parsed.turns[i - 1].heading && parsed.turns[i - 1].mark === t.mark) c.same_mark_runs++
      if (t.end <= t.start) continue
      const role = roleFor(parsed, t), basis = role ? 'confident' : t.opens === 'page' ? 'page_top' : 'uncertain'
      c.turns[basis]++; c.characters[basis] += t.end - t.start
      if (role) c.roles[role] = (c.roles[role] ?? 0) + 1
      // A turn under a heading that is not a role word and has no role: mostly witnesses under their own names.
      if (!role && t.heading) c.named_headings_no_role++
      if (role === 'witness' && t.opens === 'mark' && parsed.text.slice(t.start, t.end).trim().split(/\s+/).length <= api.SHORT_ANSWER_WORDS) { c.short_answers.total++; if (api.answeredQuestion(parsed, t, roleFor, 280 - (t.end - t.start))) c.short_answers.with_question++ }
      const words = parsed.text.slice(t.start, t.end), prior = parsed.turns[i - 1]
      if (t.opens === 'heading' && /^(?:counsel|lawyer)/.test(role ?? '') && words.split(' ').length <= 3 && REPLY.test(words) && prior && /\?\s*$/.test(parsed.text.slice(prior.start, prior.end))) c.replies_under_counsel++
    }
    const words = api.tokens(page.text, stop)
    if (!words.length) continue
    const word = words[Math.floor(words.length / 2)], hit = api.excerpt(page.text, [word], page.n, roleFor)
    c.excerpts.total++
    if (!/[^.\s]/.test(hit.excerpt)) c.excerpts.empty++
    else c.excerpts[hit.speaker_role ? 'with_role' : 'no_role']++
    if (/[\u0000-\u0008]/.test(hit.excerpt)) throw Error(`${row.key} page ${page.n}: control character in an excerpt`)
    if (Object.keys(hit).some(k => k !== 'excerpt' && k !== 'speaker_role' && k !== 'question')) throw Error(`${row.key} page ${page.n}: an excerpt carries more than its words, a role and a one-line answer's question`)
    if (hit.question && (Object.keys(hit.question).some(k => k !== 'text' && k !== 'role') || (hit.excerpt + hit.question.text).length > 280)) throw Error(`${row.key} page ${page.n}: a question past the cap or with more than its words and a role`)
    const review = REVIEW_PAGES[row.key]?.includes(page.n)
    if (hit.speaker_role && (review || (d * 31 + page.n) % 61 === 0)) sample.push({ commission: row.commission, key: row.key, date: row.key.slice(11, 21), pdf_page: page.n, folio: page.folio, role: hit.speaker_role, excerpt: hit.excerpt, page: page.text, review })
    if (review && !hit.speaker_role) sample.push({ commission: row.commission, key: row.key, date: row.key.slice(11, 21), pdf_page: page.n, folio: page.folio, role: null, excerpt: hit.excerpt, page: page.text, review })
  }
}
if (process.argv.includes('--sample')) {
  for (const [n, s] of sample.entries()) {
    const flat = s.page.replace(/\s+/g, ' '), probe = s.excerpt.replace(/^\.\.\.|\.\.\.$/g, '').slice(0, 40), at = flat.indexOf(probe)
    console.log(`#${n + 1} ${s.commission} ${s.date} PDF page ${s.pdf_page} (page ${s.folio})${s.review ? ' [review page]' : ''} role: ${s.role ?? 'none'}`)
    console.log(`   before: ${flat.slice(Math.max(0, at - 260), at)}`)
    console.log(`   EXCERPT: ${s.excerpt}\n`)
  }
  console.log(`${sample.filter(s => s.role).length} role-labelled excerpts, ${sample.filter(s => !s.role).length} review-page excerpts with no role`)
} else if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 2))
else {
  const n = v => v.toLocaleString('en-AU'), pct = (a, b) => b ? `${(100 * a / b).toFixed(1)}%` : 'n/a'
  console.log('| Commission | Transcripts | Pages | Confident turns (a role) | Uncertain turns (no role) | Page-top continuations (no role) | Excerpts, one a page, with a role | "<" lines: examination / other | Possible label slips (no role given) | Replies under a counsel heading (counted only) |')
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const [id, c] of Object.entries(out).sort()) {
    const all = c.turns.confident + c.turns.uncertain + c.turns.page_top
    console.log(`| ${id} | ${c.transcripts} | ${n(c.pages)} | ${n(c.turns.confident)} (${pct(c.turns.confident, all)}) | ${n(c.turns.uncertain)} (${pct(c.turns.uncertain, all)}) | ${n(c.turns.page_top)} (${pct(c.turns.page_top, all)}) | ${n(c.excerpts.with_role)} of ${n(c.excerpts.total - c.excerpts.empty)} (${pct(c.excerpts.with_role, c.excerpts.total - c.excerpts.empty)}) | ${n(c.notes.examination)} / ${n(c.notes.other)} | ${n(c.possible_label_slips)} | ${n(c.replies_under_counsel)} |`)
  }
  console.log('\nConfident turns by role:')
  for (const [id, c] of Object.entries(out).sort()) console.log(`- ${id}: ${Object.entries(c.roles).sort((a, b) => b[1] - a[1]).map(([r, v]) => `${r} ${n(v)}`).join(', ')}`)
  console.log('\nPublisher mark slips. Same-mark runs (a bare "Q." straight after a bare "Q.", or "A." after "A."; neither turn has a role) and pages on the mis-marked list (no role on any turn). A wrong or missing mark in the middle of a line cannot be seen by any parser; a page found that way goes on the list:')
  for (const [id, c] of Object.entries(out).sort()) console.log(`- ${id}: ${n(c.same_mark_runs)} same-mark runs, ${n(c.listed_pages)} listed pages`)
  console.log('\nTurns under a person\'s heading with no role (quoted with "the transcript records"; mostly witnesses who speak under their own names):')
  for (const [id, c] of Object.entries(out).sort()) console.log(`- ${id}: ${n(c.named_headings_no_role)}`)
  console.log('\nOne-line answers (an "A." of at most six words), and how many come with the question straight before them on the page:')
  for (const [id, c] of Object.entries(out).sort()) console.log(`- ${id}: ${n(c.short_answers.with_question)} of ${n(c.short_answers.total)}`)
  console.log('\nShare of quotable text by characters (confident / uncertain / page-top):')
  for (const [id, c] of Object.entries(out).sort()) { const all = c.characters.confident + c.characters.uncertain + c.characters.page_top; console.log(`- ${id}: ${pct(c.characters.confident, all)} / ${pct(c.characters.uncertain, all)} / ${pct(c.characters.page_top, all)}`) }
  console.log('\nNo excerpt carries a control character or anything beyond its words, a role and, for a one-line answer, its question inside the 280-character cap (the script fails if one does).')
}
