// The Victorian major infrastructure royal commission is listed by its documents only: no built
// output holds an extract from its hearing transcripts. The five extracts once held are pinned by
// hash in held-extracts.mjs. The record keeps the facts in OPAX's own words, each with its page
// reference and link. The Worker's pages, report API, search and sitemap are checked in
// seo-render.test.mjs ("documents-only commission").
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { COMMISSION, SLUG, PINNED, QUOTATION, SHINGLES, assertNoExtract, heldExtracts, liftedRuns, pin, shingles, strings, textFields } from './held-extracts.mjs';
import { projectReports } from '../../scripts/build_report_catalog.mjs';
import { renderReport } from '../src/report-records.ts';

const pub = new URL('../public/', import.meta.url);
const json = path => JSON.parse(readFileSync(new URL(path.slice(1), pub), 'utf8'));
const built = await build({ stdin: { contents: "export {callTool} from './src/tools/index'; export {runTool} from './src/agentic-tools';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const savedFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('This test must not make network requests'); };
test.after(() => { globalThis.fetch = savedFetch; });
const asset = async path => { const file = new URL(path.slice(1), pub); if (!existsSync(file)) throw Error('Not built: ' + path); return JSON.parse(readFileSync(file, 'utf8')); };
const env = { asset, origin: 'https://opax.test' };
const record = json(`/royal-commissions/commission-${COMMISSION}.json`).commission;

test('the detector finds a pinned line inside other text, whatever its case, spacing or punctuation', () => {
  // A made-up line, pinned the same way as the five.
  const made = [pin('An example line that nobody said')];
  assert.equal(heldExtracts('{"note":"Before. AN EXAMPLE line, that nobody   said; after."}', made).length, 1);
  assert.equal(heldExtracts('An example line that nobody heard', made).length, 0);
  assert.equal(PINNED.length, 5);
  // A partial lift: five consecutive words of a pinned line, inside other words, are found; four are not.
  const runs = shingles('An example line that nobody said');
  assert.equal(runs.size, 2); assert.equal(SHINGLES.size, 22);
  assert.equal(liftedRuns('It was, he wrote, an example line that nobody could place.', runs).length, 1);
  assert.equal(liftedRuns('It was an example line that few could place.', runs).length, 0);
  for (const [text, quoted] of [["the commission's letters", false], ["the commissioners' names", false], ['OPAX\u2019s own words', false],
    ["said 'orders may be made'", true], ['said \u2018orders\u2019', true], ['\u201corders\u201d', true], ['\u00aborders\u00bb', true], ['a "b"', true]]) assert.equal(QUOTATION.test(text), quoted, text);
  assert.deepEqual(textFields({ a: [{ date_quote: 'x', quote: '', b: { excerpt: 'y' } }] }), ['/a[0]/date_quote', '/a[0]/b/excerpt']);
});

test('the published record has no extract, no quote, date line or excerpt field, and no quotation in a note', () => {
  assert.equal(record.use, 'documents_only');
  assertNoExtract(assert, record, 'the published record');
  const row = json('/royal-commissions/index.json').commissions.find(c => c.id === COMMISSION);
  assert.equal(row.use, 'documents_only');
  assertNoExtract(assert, row, 'the index row');
  assert.deepEqual(record.recommendations, []); assert.deepEqual(record.court_context, []);
  for (const t of record.transcripts) for (const k of ['date_quote', 'full_text']) assert.ok(!(k in t), `${t.key} has ${k}`);
  for (const p of record.commissioners) assert.ok(!('quote' in p));
  // No other commission's file, the index or the manifest holds one of the five either.
  for (const name of readdirSync(new URL('royal-commissions/', pub))) assert.deepEqual(heldExtracts(readFileSync(new URL('royal-commissions/' + name, pub), 'utf8')), [], name);
});

test('the facts stay in OPAX\'s own words, each with its page reference and link', () => {
  assert.deepEqual(record.transcripts.map(t => [t.date, t.date_basis, t.date_cite.page]), [['2026-11-09', 'stated', 1], ['2026-11-10', 'stated', 1]]);
  for (const t of record.transcripts) assert.match(t.date_cite.url, /^https:\/\/www\.rcimcp\.vic\.gov\.au\/.+\.pdf$/);
  const [person] = record.commissioners;
  assert.equal(person.name, 'The Honourable Chris Kourakis AC SC'); assert.equal(person.role, 'Commissioner');
  assert.equal(person.cite.page, 1); assert.match(person.cite.url, /^https:\/\/www\.rcimcp\.vic\.gov\.au\/.+\.pdf$/);
  const notes = record.notes.join(' ');
  assert.match(notes, /may make non-publication orders \(transcript of 9 November 2026, page 30: https:\/\/www\.rcimcp\.vic\.gov\.au\/\S+\.pdf\)/);
  assert.match(notes, /Its final report is due on or before 20 August 2027, according to the Commissioner at the hearing on 9 November 2026 \(transcript page 33: https:\/\/www\.rcimcp\.vic\.gov\.au\/\S+\.pdf\)/);
});

test('the royal_commissions tool (MCP and Ask) returns no extract in its list, profile or transcripts views', async () => {
  const calls = [{ view: 'list', commission: COMMISSION }, { view: 'list', jurisdiction: 'Vic' }, { view: 'profile', commission: COMMISSION },
    { view: 'transcripts', commission: COMMISSION }, { view: 'transcripts', commission: COMMISSION, words: 'non-publication orders' },
    { view: 'transcripts', commission: COMMISSION, words: 'final report' }, { view: 'recommendations', commission: COMMISSION }];
  for (const args of calls) {
    const label = 'royal_commissions ' + JSON.stringify(args);
    const mcp = await api.callTool(env, 'royal_commissions', args).catch(e => ({ error: String(e.message) }));
    assert.deepEqual(heldExtracts(JSON.stringify(mcp)), [], label);
    assert.deepEqual(liftedRuns(JSON.stringify(mcp)), [], label + ' shares a run of five words with a removed extract');
    // Rows about this commission: no field with a document's wording and no quotation anywhere in them.
    const rows = (mcp.rows ?? []).filter(r => [r.id, r.commission_id].includes(COMMISSION));
    if (args.commission && !args.words && args.view !== 'recommendations') assert.ok(rows.length, label + ' returned no row');
    assertNoExtract(assert, rows, label + ' rows');
    // Citation notes about this commission, the text Ask shows beside an answer: no quotation.
    const cites = (mcp.citations ?? []).filter(c => /rcimcp\.vic\.gov\.au|vic-major-infrastructure|Major Public and Civil Infrastructure/.test(c.url + ' ' + c.text));
    assert.deepEqual(cites.filter(c => QUOTATION.test(c.text)).map(c => c.text), [], label + ' citations');
    const ask = await api.runTool({ asset, kb: async () => { throw Error('no KB reads'); }, origin: 'https://opax.test', toolEnv: env }, 'royal_commissions', args);
    assert.deepEqual(heldExtracts(JSON.stringify(ask)), [], label + ' through Ask');
    assert.deepEqual(liftedRuns(JSON.stringify(ask)), [], label + ' through Ask shares a run of five words with a removed extract');
    if (args.commission && args.view !== 'recommendations') {
      assert.equal(ask.ok, true, label);
      assert.deepEqual(strings(ask.cite).filter(s => QUOTATION.test(s)), [], label + ' Ask citations');
    }
  }
  const profile = await api.callTool(env, 'royal_commissions', { view: 'profile', commission: COMMISSION });
  assert.deepEqual(profile.rows[0].commissioners.map(p => [p.name, p.page]), [['The Honourable Chris Kourakis AC SC', 1]]);
  assert.ok(profile.citations.some(c => /\(OPAX note\): Its final report is due on or before 20 August 2027/.test(c.text)));
});

test('the search catalogue entry and the report page built from the record hold no extract', async () => {
  const projected = (await projectReports(async path => json(path))).find(r => r.row.slug === SLUG);
  assert.ok(projected);
  assert.deepEqual(heldExtracts(JSON.stringify(projected)), []); assert.deepEqual(liftedRuns(JSON.stringify(projected)), []);
  assertNoExtract(assert, projected.detail.record, 'the report record');
  assert.deepEqual(textFields(projected.row).filter(p => p !== '/snippet'), []);
  // The catalogue snippet is the commission's name, not words from a transcript.
  assert.equal(projected.row.snippet, record.name);
  const html = renderReport(projected.detail);
  assert.deepEqual(heldExtracts(html), []); assert.deepEqual(liftedRuns(html), []);
  assert.ok(!/<q>|<blockquote|Printed as|Date as printed/.test(html), 'the page shows no quotation block');
  assert.ok(html.includes('The Honourable Chris Kourakis AC SC')); assert.ok(html.includes('20 August 2027'));
});

test('built files on disk (report records, search catalogue, transcript text) hold no extract', t => {
  const dirs = ['report-records', 'search-catalog', 'transcripts'].filter(d => existsSync(new URL(d + '/', pub)));
  if (!dirs.includes('report-records')) return t.skip('report-records is not built; run npm run build:search');
  const files = [];
  const walk = dir => { for (const name of readdirSync(dir)) { const p = dir + '/' + name; if (statSync(p).isDirectory()) walk(p); else if (/\.(json|txt|xml|html)$/.test(name)) files.push(p); } };
  for (const d of dirs) walk(fileURLToPath(new URL(d, pub)));
  assert.ok(files.some(f => f.endsWith(`/report-records/${SLUG}.json`)));
  // No transcript text is built for this commission.
  assert.deepEqual(files.filter(f => f.includes('/transcripts/' + COMMISSION)), []);
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    // The five all contain one of these words; a file without any of them is not hashed word by word.
    if (!/kourakis|10\.00\s*am|non-publication|letters patent/i.test(text)) continue;
    assert.deepEqual(heldExtracts(text), [], f);
  }
  assertNoExtract(assert, json(`/report-records/${SLUG}.json`).record, 'the built report record');
});

test('git grep finds none of the five in the tree', () => {
  // Every tracked text line with a word the five share is hashed in runs of words; nothing matches.
  const root = fileURLToPath(new URL('../../', import.meta.url));
  let out = '';
  try { out = execFileSync('git', ['grep', '-I', '-i', '-h', '-E', 'kourakis|10\\.00 ?am|non-publication|letters patent'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }); }
  catch (e) { if (e.status !== 1) throw e; }
  assert.ok(out.length > 0, 'the grep reads tracked files');
  assert.deepEqual(heldExtracts(out), []);
});
