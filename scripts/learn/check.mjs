#!/usr/bin/env node
/**
 * Checks the Learn guide in content/learn: every fact marker has a fact, every fact has a source and a
 * short verbatim quote, every glossary link resolves, there are no em dashes, and each screen's
 * Flesch-Kincaid grade is reported (aim: 8 or under; a screen above that must say why in a
 * `<!-- grade: reason -->` comment). It also lists the facts still marked needs_aph_source.
 *
 *   node scripts/learn/check.mjs                 # report, exit 1 on errors
 *   node scripts/learn/check.mjs --json          # the same as JSON
 *   node scripts/learn/check.mjs --snapshots ~/opax-work/learn-sources
 *                                                # also check each quote against its saved snapshot
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const GRADE_TARGET = 8;
export const SCREEN_WORDS = [40, 90];
export const GLOSSARY_TERMS = [80, 120];
const QUOTE_WORDS = 25, SHORT_WORDS = 20;
const EM_DASH = /\u2014/;
// US spellings this guide should not use. "Labor" is a party name, so it is not here.
const US_SPELLING = /\b(?:(?:organiz|recogniz|analyz|realiz|color|behavior|center)\w*|(?:favor|honor|labor)(?!u)(?:s|ed|ing|able)\b|defense|licensing|program(?:s|med)?\b)/;

const words = (s) => s.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
const norm = (s) => String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

/** Syllables by vowel groups, with the usual silent-e and -ed/-es fixes. Digits count as one. */
export function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!w) return 0;
  if (/^[0-9]+$/.test(w)) return 1;
  if (w.length <= 3) return 1;
  const t = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, (m) => m[0]).replace(/^y/, '');
  const groups = t.match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Flesch-Kincaid grade of plain text: 0.39 (words/sentences) + 11.8 (syllables/words) - 15.59. */
export function fkGrade(text) {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => words(s).length);
  const ws = sentences.flatMap((s) => words(s).flatMap((w) => w.split('-')).filter((w) => /[A-Za-z0-9]/.test(w)));
  if (!ws.length) return { grade: 0, words: 0, sentences: 0 };
  const syl = ws.reduce((n, w) => n + syllables(w), 0);
  const grade = 0.39 * (ws.length / sentences.length) + 11.8 * (syl / ws.length) - 15.59;
  return { grade: Math.round(grade * 10) / 10, words: ws.length, sentences: sentences.length };
}

const GLOSSARY_LINK = /\{\{([^}|]+)(?:\|([^}]+))?\}\}/g;
const FACT = /\[\[f:([a-z0-9-]+)\]\]/g;

/** A screen's reading text: no heading, markers, comments or link syntax. Glossary links read as their text. */
export function screenText(body) {
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n').filter((l) => !/^#{1,6}\s/.test(l)).join('\n')
    .replace(FACT, '')
    .replace(GLOSSARY_LINK, (_, shown) => shown)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function parseChapter(file) {
  const raw = readFileSync(file, 'utf8');
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (!m) throw new Error(`${basename(file)}: no frontmatter`);
  const meta = Object.fromEntries(m[1].split('\n').filter(Boolean).map((l) => {
    const i = l.indexOf(':');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }));
  const screens = m[2].split(/^---screen---$/m).map((body, i) => {
    const heading = /^##\s+(.+)$/m.exec(body)?.[1]?.trim() || '';
    const reason = /<!--\s*grade:\s*([\s\S]*?)-->/.exec(body)?.[1]?.trim() || '';
    const text = screenText(body);
    return { index: i + 1, heading, body, text, reason, ...fkGrade(text) };
  });
  return { file: basename(file), meta, raw, screens };
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

function snapshotText(src, snapshots, root) {
  // Same order as the build: a saved text, then the repo file the quote was taken from, then the page.
  if (src.snapshot_text) return readFileSync(join(snapshots, src.snapshot_text), 'utf8');
  if (src.repo_path) {
    const p = join(root, src.repo_path);
    if (statSync(p).isDirectory()) return readdirSync(p).filter((f) => f.endsWith('.json')).sort().map((f) => readFileSync(join(p, f), 'utf8')).join('');
    return readFileSync(p, 'utf8');
  }
  if (src.snapshot) {
    const p = join(snapshots, 'text', basename(src.snapshot).replace(/\.[a-z]+$/, '') + '.txt');
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
  }
  return null;
}

export function runCheck({ root = ROOT, snapshots = null } = {}) {
  const dir = join(root, 'content/learn');
  const errors = [], warnings = [];
  const facts = readJson(join(dir, 'facts.json')).facts;
  const sources = readJson(join(dir, 'sources.json')).sources;
  const glossary = readJson(join(dir, 'glossary.json')).terms;
  const examples = readJson(join(dir, 'examples.json')).examples;
  const chapters = readdirSync(join(dir, 'chapters')).filter((f) => f.endsWith('.md')).sort().map((f) => parseChapter(join(dir, 'chapters', f)));

  const factById = new Map(facts.map((f) => [f.id, f]));
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const termKey = new Map();
  for (const g of glossary) for (const k of [g.slug, g.term]) termKey.set(k.toLowerCase(), g);
  const chapterSlugs = new Set(chapters.map((c) => c.meta.slug));
  const exampleByUrl = new Map(examples.map((x) => [x.url, x]));
  const used = new Set();

  if (factById.size !== facts.length) errors.push('facts.json: duplicate fact ids');
  if (glossary.length < GLOSSARY_TERMS[0] || glossary.length > GLOSSARY_TERMS[1]) errors.push(`glossary.json: ${glossary.length} terms, expected ${GLOSSARY_TERMS[0]} to ${GLOSSARY_TERMS[1]}`);
  if (new Set(glossary.map((g) => g.slug)).size !== glossary.length) errors.push('glossary.json: duplicate slugs');

  // Facts: a source, a short quote, and the same quote filed under the source.
  const filed = new Set(sources.flatMap((s) => (s.quotes || []).map((q) => `${q.fact}\u0000${norm(q.quote)}`)));
  for (const f of facts) {
    if (!f.claim) errors.push(`fact ${f.id}: no claim`);
    if (!['sourced', 'needs_aph_source'].includes(f.status)) errors.push(`fact ${f.id}: unknown status ${f.status}`);
    if (!f.quotes?.length) errors.push(`fact ${f.id}: no source quote`);
    for (const q of f.quotes || []) {
      const src = sourceById.get(q.source);
      if (!src) { errors.push(`fact ${f.id}: unknown source ${q.source}`); continue; }
      if (!q.quote?.trim()) errors.push(`fact ${f.id}: empty quote`);
      if (words(q.quote).length > QUOTE_WORDS) errors.push(`fact ${f.id}: quote is ${words(q.quote).length} words (max ${QUOTE_WORDS})`);
      if (!filed.has(`${f.id}\u0000${norm(q.quote)}`)) errors.push(`fact ${f.id}: quote not filed under ${q.source} in sources.json`);
    }
  }
  for (const s of sources) {
    for (const k of ['id', 'publisher', 'title', 'url', 'retrieved']) if (!s[k]) errors.push(`source ${s.id || '?'}: no ${k}`);
    if (snapshots) {
      const text = snapshotText(s, snapshots, root);
      if (text == null) { warnings.push(`source ${s.id}: no snapshot found to verify quotes`); continue; }
      const hay = norm(text);
      for (const q of s.quotes || []) if (!hay.includes(norm(q.quote))) errors.push(`source ${s.id}: quote for ${q.fact} not found in snapshot: ${q.quote}`);
    }
  }

  const resolveLink = (target, where) => {
    const g = termKey.get(target.trim().toLowerCase());
    if (!g) errors.push(`${where}: glossary link {{${target}}} does not resolve`);
    return g;
  };
  const scanText = (text, where) => {
    if (EM_DASH.test(text)) errors.push(`${where}: contains an em dash`);
    const us = US_SPELLING.exec(text);
    if (us) errors.push(`${where}: US spelling "${us[0]}"`);
  };

  // Chapters.
  const report = [];
  for (const c of chapters) {
    for (const k of ['slug', 'title', 'order', 'summary']) if (!c.meta[k]) errors.push(`${c.file}: frontmatter has no ${k}`);
    scanText(c.raw, c.file);
    const last = c.screens.at(-1);
    if (last?.heading !== 'See it in OPAX') errors.push(`${c.file}: last screen is not "See it in OPAX"`);
    for (const s of c.screens) {
      const where = `${c.file} screen ${s.index} (${s.heading || 'no heading'})`;
      if (!s.heading) errors.push(`${where}: no ## heading`);
      for (const [, id] of s.body.matchAll(FACT)) {
        used.add(id);
        if (!factById.has(id)) errors.push(`${where}: fact marker [[f:${id}]] has no fact`);
      }
      for (const [, shown, target] of s.body.matchAll(GLOSSARY_LINK)) resolveLink(target ?? shown, where);
      for (const [, url] of s.body.matchAll(/\]\((https?:\/\/[^)]+)\)/g)) {
        if (!/^https:\/\/opax\.com\.au\//.test(url)) errors.push(`${where}: link is not on opax.com.au: ${url}`);
        const x = exampleByUrl.get(url);
        if (!x) errors.push(`${where}: ${url} is not in examples.json`);
        else if (x.checked?.status !== 200) errors.push(`${where}: ${url} last check was ${x.checked?.status}`);
      }
      const isSeeIt = s.heading === 'See it in OPAX';
      if (s.grade > GRADE_TARGET && !s.reason) errors.push(`${where}: grade ${s.grade} is over ${GRADE_TARGET} with no <!-- grade: reason -->`);
      if (!isSeeIt && (s.words < SCREEN_WORDS[0] || s.words > SCREEN_WORDS[1])) warnings.push(`${where}: ${s.words} words (aim ${SCREEN_WORDS[0]} to ${SCREEN_WORDS[1]})`);
    }
    const body = c.screens;
    report.push({
      chapter: c.meta.slug, file: c.file, title: c.meta.title, screens: body.length,
      words: body.reduce((n, s) => n + s.words, 0),
      maxGrade: Math.max(...body.map((s) => s.grade)),
      overTarget: body.filter((s) => s.grade > GRADE_TARGET).map((s) => ({ screen: s.index, heading: s.heading, grade: s.grade, reason: s.reason })),
      grades: body.map((s) => ({ screen: s.index, heading: s.heading, words: s.words, grade: s.grade })),
    });
  }

  // Glossary.
  for (const g of glossary) {
    const where = `glossary ${g.slug}`;
    for (const k of ['term', 'slug', 'short', 'more', 'chapter']) if (!g[k]) errors.push(`${where}: no ${k}`);
    if (!/^[a-z0-9-]+$/.test(g.slug || '')) errors.push(`${where}: slug is not kebab-case`);
    if (words(g.short || '').length > SHORT_WORDS) errors.push(`${where}: short is ${words(g.short).length} words (max ${SHORT_WORDS})`);
    const n = (g.more || '').split(/(?<=[.!?])\s+/).filter(Boolean).length;
    if (n < 2 || n > 4) errors.push(`${where}: more has ${n} sentences (2 to 4)`);
    if (!chapterSlugs.has(g.chapter)) errors.push(`${where}: unknown chapter ${g.chapter}`);
    if (!g.sources?.length) errors.push(`${where}: no sources`);
    for (const s of g.sources || []) if (!sourceById.has(s)) errors.push(`${where}: unknown source ${s}`);
    if (!g.facts?.length) errors.push(`${where}: no facts`);
    for (const id of g.facts || []) { used.add(id); if (!factById.has(id)) errors.push(`${where}: unknown fact ${id}`); }
    for (const s of g.see_also || []) resolveLink(s, where);
    if (g.example && !exampleByUrl.has(g.example.url)) errors.push(`${where}: example ${g.example.url} is not in examples.json`);
    scanText(`${g.term} ${g.short} ${g.more} ${g.example?.label || ''}`, where);
  }
  for (const f of facts) if (!used.has(f.id)) errors.push(`fact ${f.id}: not used by any chapter or glossary term`);
  scanText(readFileSync(join(dir, 'facts.json'), 'utf8'), 'facts.json');
  scanText(readFileSync(join(dir, 'examples.json'), 'utf8'), 'examples.json');

  const needsAph = facts.filter((f) => f.status === 'needs_aph_source').map((f) => ({ id: f.id, claim: f.claim, note: f.note || '' }));
  return { errors, warnings, report, needsAph, counts: { facts: facts.length, sources: sources.length, glossary: glossary.length, examples: examples.length } };
}

function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--snapshots');
  const snapshots = at >= 0 ? resolve(args[at + 1].replace(/^~/, process.env.HOME || '~')) : null;
  const out = runCheck({ snapshots });
  if (args.includes('--json')) { console.log(JSON.stringify(out, null, 1)); process.exit(out.errors.length ? 1 : 0); }
  for (const r of out.report) {
    console.log(`${r.file}: ${r.screens} screens, ${r.words} words, max grade ${r.maxGrade}`);
    for (const g of r.grades) console.log(`  ${String(g.screen).padStart(2)}. ${g.heading.padEnd(40)} ${String(g.words).padStart(3)} words  grade ${g.grade}`);
    for (const o of r.overTarget) console.log(`  over ${GRADE_TARGET}: screen ${o.screen} (${o.heading}) ${o.grade}: ${o.reason}`);
  }
  console.log(`\n${out.counts.facts} facts, ${out.counts.sources} sources, ${out.counts.glossary} glossary terms, ${out.counts.examples} examples`);
  if (out.needsAph.length) {
    console.log(`\nneeds_aph_source (${out.needsAph.length}):`);
    for (const f of out.needsAph) console.log(`  ${f.id}: ${f.claim}${f.note ? `\n    ${f.note}` : ''}`);
  }
  if (out.warnings.length) console.log(`\nwarnings (${out.warnings.length}):\n  ${out.warnings.join('\n  ')}`);
  if (out.errors.length) { console.error(`\nerrors (${out.errors.length}):\n  ${out.errors.join('\n  ')}`); process.exit(1); }
  console.log('\nok');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
