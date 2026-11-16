// The withheld list. Its real contents are never in the repository: an entry, or an id that resolves to a
// document, can itself disclose that an order exists. Every test here supplies a FAKE entry through the private
// path (the store text handed to loadWithheld, or the Worker's OPAX_WITHHELD_JSON secret) and asserts two
// things for each consumer: nothing of the item gets out, and nothing that comes out (a row, a response, a
// log line, an error) names the item or says why. The tiers are covered by source-tiers.test.mjs, the Python
// consumers by tests/test_source_policy.py and the enrichment Worker by enrich/test/policy.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { importBundle } from './fixtures/import-bundle.mjs';
import { loadWorker, offline } from './worker-harness.mjs';
import { runPython, pythonSkip } from './helpers/python.mjs';
import { POLICY, NOTICE, MODES, REASONS, sourcePolicy, loadWithheld, withheldDigest, redactCommission, kbRefusal } from '../../parli/ingest/source_policy.mjs';
import { guardKbRequest, guardKbResponse, scrubKbPayload, guardToolResult, guardSearchRows, hiddenKbRead, withheldReady, dependsOnWithheld, withheldUnavailable } from '../src/source-policy.ts';
import { applySourcePolicy, slugPart } from '../../scripts/apply_source_policy.mjs';
import { catalogWithheld } from '../../scripts/build_search_catalog.mjs';
import { projectReports } from '../../scripts/build_report_catalog.mjs';

const PUBLIC = new URL('../public/', import.meta.url).pathname;
const json = path => JSON.parse(readFileSync(join(PUBLIC, path), 'utf8'));
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const TIERS = json('../../parli/ingest/source_policy.json');
const ROBODEBT = 'cth-robodebt';
const entry = (id, reason = 'legal_order', mode) => ({ ...id, reason, date: '2026-11-16', ...(mode ? { mode } : {}) });
const store = (...entries) => JSON.stringify({ schema: 1, withheld: entries });
const policyOf = (...entries) => sourcePolicy(TIERS, entries);
/** What may never appear in anything public: why an item is withheld, when, or that a reason exists. */
const REASON_WORDS = /legal_order|publisher_request|amended_pending|withdrawn|2026-11-16|legal order|\border\b(?! notes)|withheld|suppress/i;
const silent = (value, label) => assert.doesNotMatch(typeof value === 'string' ? value : JSON.stringify(value), REASON_WORDS, label);
const absent = (value, ids, label) => { const text = typeof value === 'string' ? value : JSON.stringify(value); for (const id of ids) assert.ok(!text.includes(id), `${label}: ${id}`); };
const savedFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = savedFetch; loadWithheld(''); });

// ---- the repository holds the shape and nothing else

test('the repository holds the tiers, the loader and an empty example; no entry, and no public wording per reason', () => {
  assert.deepEqual(Object.keys(TIERS), ['schema', 'sources']);
  assert.deepEqual(json('../../parli/ingest/withheld.example.json'), { schema: 1, withheld: [] });
  assert.deepEqual([POLICY.withheldCount, POLICY.withheldSources, POLICY.withheldDocuments], [0, [], []]);
  assert.deepEqual(MODES, ['list_only', 'hide']);
  assert.equal(NOTICE, "Not available on OPAX. Open the publisher's copy.");
  silent(NOTICE, 'the notice');
  // The loader exports nothing that words a reason, and the reason classes never reach a consumer.
  assert.doesNotMatch(source('../../parli/ingest/source_policy.mjs'), /Withheld at|subject to a legal order|LABELS/);
  for (const file of ['../src/source-policy.ts', '../src/tools/royal-commissions.ts', '../src/report-records.ts', '../../enrich/src/policy.ts', '../../scripts/apply_source_policy.mjs', '../../scripts/build_search_catalog.mjs', '../../scripts/build_report_catalog.mjs'])
    for (const reason of REASONS) assert.ok(!source(file).includes(reason), `${file} names ${reason}`);
});

const BAD_ENTRIES = [
  [{ source: 'fake-source', reason: 'publisher_request', date: '2026-11-16', note: 'why it is withheld' }],
  [{ source: 'fake-source', reason: 'because', date: '2026-11-16' }],
  [{ source: 'fake-source', reason: 'legal_order', date: '2026-02-30' }],
  [{ source: 'A source with words', reason: 'legal_order', date: '2026-11-16' }],
  [{ document: 'speech-424242', reason: 'legal_order', date: '2026-11-16', mode: 'redact' }],
  [entry({ source: 'fake-source' }), entry({ source: 'fake-source' })],
];
test('a store that cannot be read is refused, and the error never repeats it', () => {
  for (const raw of ['{not json', '{"schema":2,"withheld":[]}', '{"schema":1}', '{"schema":1,"withheld":{}}', ...BAD_ENTRIES.map(e => store(...e))]) {
    let message = '';
    assert.throws(() => loadWithheld(raw), error => { message = error.message; return /^source policy: /.test(message); }, raw.slice(0, 20));
    absent(message, ['fake-source', '424242', 'why it is', raw.slice(0, 12)], 'error message');
    assert.equal(withheldReady(raw), false);
  }
  // Nothing, or an empty string, is "nothing withheld"; a valid store is in force for every importer at once.
  for (const none of [undefined, null, '', '  ', store()]) { assert.equal(withheldReady(none), true); assert.equal(POLICY.withheldCount, 0); }
  assert.equal(withheldReady(store(entry({ document: 'speech-424242' }, 'legal_order', 'hide'))), true);
  assert.deepEqual(POLICY.withheld({ documents: ['speech-424242'] }), { mode: 'hide' }, 'only the mode leaves the loader');
  loadWithheld('');
});

test('the Python and JavaScript loaders give the same digest, which names nothing', { skip: pythonSkip([]) }, async () => {
  const stores = ['', store(), store(entry({ document: 'speech-424242' })), store(entry({ document: 'speech-424242' }, 'legal_order', 'list_only')),
    store(entry({ source: 'fake-source' }, 'withdrawn', 'hide'), entry({ document: 'integrity-report-fake-424242' }, 'amended_pending'))];
  const python = raw => runPython(['-m', 'parli.source_policy'], { env: { ...process.env, OPAX_WITHHELD_JSON: raw, OPAX_WITHHELD_FILE: '/nonexistent/withheld.json' } }).trim();
  const digests = [];
  for (const raw of stores) { const digest = await withheldDigest(raw); assert.equal(python(raw), digest, raw.slice(0, 40)); digests.push(digest); assert.match(digest, /^[0-9a-f]{16}$/); }
  assert.equal(digests[0], digests[1]);
  assert.equal(digests[2], digests[3], 'the default mode is the same entry');
  assert.equal(new Set(digests).size, 3);
});

// ---- the commission record: one neutral line, or nothing

const COMMISSION = () => { const c = structuredClone(json(`royal-commissions/commission-${ROBODEBT}.json`).commission); return { ...c, transcripts: c.transcripts.slice(0, 4), recommendations: c.recommendations.slice(0, 5) }; };
const LISTING = ['acquisition', 'cite', 'date', 'date_basis', 'files', 'key', 'kind', 'page_url', 'title', 'unavailable'];

test('list_only: a withheld document is its title, date, the one notice and the publisher page; the reason is nowhere', () => {
  const c = COMMISSION(), key = c.transcripts[0].key, pdf = c.transcripts[0].files[0].url;
  for (const reason of REASONS) {
    const out = redactCommission(c, policyOf(entry({ document: `${ROBODEBT}/${key}` }, reason)));
    const row = out.transcripts[0];
    assert.deepEqual(Object.keys(row).sort(), LISTING);
    assert.deepEqual([row.files, row.unavailable], [[], NOTICE], 'the same wording for every reason class');
    assert.ok(!JSON.stringify(out).includes(pdf), 'the file link, page count and hash are gone');
    silent({ ...out, notes: [], gaps: [], transcripts: [row], reports: [], recommendations: [] }, reason);
    assert.deepEqual(out.transcripts[1], c.transcripts[1]);
  }
});

test('hide: the document is not listed at all, and a hidden commission has no record', () => {
  const c = COMMISSION(), t = c.transcripts[0];
  const out = redactCommission(c, policyOf(entry({ document: `${ROBODEBT}/${t.key}` }, 'legal_order', 'hide')));
  assert.equal(out.transcripts.length, c.transcripts.length - 1);
  absent(out, [t.key, t.title, t.files[0].url, t.files[0].sha256], 'hidden transcript');
  assert.equal(redactCommission(c, policyOf(entry({ source: ROBODEBT }, 'legal_order', 'hide'))), null);
  const listed = redactCommission(c, policyOf(entry({ source: ROBODEBT })));
  for (const d of [...listed.reports, ...listed.transcripts]) assert.deepEqual(Object.keys(d).sort(), LISTING);
  assert.deepEqual([listed.recommendations, listed.court_context, listed.notes, listed.commissioners, listed.established, listed.unavailable], [[], [], [], [], null, NOTICE]);
  absent(listed, [c.recommendations[0].text, c.established.quote, '/transcripts/', '.pdf', 'sha256'], 'withheld source');
});

// ---- quoting tools, Ask and the MCP, with the list supplied the way the Worker receives it

async function tools(raw) {
  const built = await build({ stdin: { contents: "export {callTool, askToolSpecs} from './src/tools/index'; export {textIndex, textMatches, pageHits} from './src/tools/transcript-text'; export {loadWithheld} from '../parli/ingest/source_policy.mjs'",
    resolveDir: new URL('../', import.meta.url).pathname, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  const api = await importBundle(built.outputFiles[0].text, 'source-policy-tools');
  api.loadWithheld(raw);
  return api;
}
const cache = new Map();
const asset = async path => { if (path.startsWith('/report-records/') && !existsSync(join(PUBLIC, path))) return null; if (!cache.has(path)) cache.set(path, json(path)); return cache.get(path); };
const env = { asset, origin: 'https://opax.test' };
/** A transcript the published policy quotes, and a word no other transcript holds. */
const SUBJECT = (() => {
  const ix = json('transcripts/index.json'), row = ix.docs.find(d => d.commission === ROBODEBT && d.quote_policy === 'quote');
  const doc = json(row.file.slice(1)), common = new Set(ix.common_terms);
  const shard = term => { let h = 0x811c9dc5; for (const byte of new TextEncoder().encode(term)) h = Math.imul(h ^ byte, 0x01000193) >>> 0; return String(h % ix.shards).padStart(2, '0'); };
  const word = Object.keys(doc.terms).find(t => /^[a-z]{7,}$/.test(t) && !common.has(t) && doc.terms[t].length === 1 && json(`transcripts/terms/${shard(t)}.json`)[t]?.length === 1);
  const page = doc.pages.find(p => p.n === doc.terms[word][0]);
  return { key: row.key, title: row.title, date: row.date, word, pdf: row.pdf_url, phrase: page.text.replace(/\s+/g, ' ').split(' ').slice(3, 9).join(' ') };
})();
const everyView = async (api, ask) => {
  const out = [];
  for (const args of [{ view: 'list', commission: ROBODEBT }, { view: 'profile', commission: ROBODEBT }, { view: 'transcripts', commission: ROBODEBT, limit: 8 }, { view: 'transcripts', commission: ROBODEBT, words: SUBJECT.word, limit: 8 },
    { view: 'recommendations', commission: ROBODEBT }, { view: 'transcripts', commission: ROBODEBT, words: SUBJECT.date, limit: 8 }]) out.push(await api.callTool(env, 'royal_commissions', args, ask));
  return out;
};

test('with nothing withheld the tool quotes the transcript (the control for the tests below)', async () => {
  const api = await tools('');
  const out = await api.callTool(env, 'royal_commissions', { view: 'transcripts', commission: ROBODEBT, words: SUBJECT.word, limit: 8 });
  assert.ok(out.rows.find(r => r.key === SUBJECT.key)?.text_matches?.hits[0].excerpt);
});

test('list_only transcript: the tool, the text search and Ask show the neutral row and no text; nothing says why', async () => {
  const api = await tools(store(entry({ document: `${ROBODEBT}/${SUBJECT.key}` })));
  const ix = await api.textIndex(env);
  assert.ok(!(await api.textMatches(env, ix, ROBODEBT, SUBJECT.word))?.keys.has(SUBJECT.key));
  assert.equal(await api.pageHits(env, ix, SUBJECT.key, [SUBJECT.word]), null);
  for (const ask of [false, true]) {
    const results = await everyView(api, ask);
    absent(results, [SUBJECT.pdf, SUBJECT.phrase], 'tool output');
    const rows = results.flatMap(r => r.rows).filter(r => r.key === SUBJECT.key);
    assert.ok(rows.length);
    for (const row of rows) assert.deepEqual(Object.keys(row).sort(), ['commission', 'commission_id', 'date', 'key', 'label', 'page_url', 'title', 'unavailable']);
    assert.equal(rows[0].unavailable, NOTICE);
    assert.ok(results.flatMap(r => r.citations).some(c => c.text.includes(NOTICE)));
    for (const r of results) for (const text of [...r.rows.filter(x => x.key === SUBJECT.key), ...r.citations.filter(c => c.text.includes(SUBJECT.title))]) silent({ ...text, label: '', text: String(text.text ?? '').replace(/Hearing transcript: evidence, not findings\.?/, '') }, 'row and citation');
  }
  const handed = await api.askToolSpecs.find(s => s.name === 'royal_commissions').run({ asset, origin: env.origin, toolEnv: {} }, { view: 'transcripts', commission: ROBODEBT, words: SUBJECT.word, limit: 8 });
  absent(handed, [SUBJECT.phrase, SUBJECT.pdf], 'what Ask is handed');
});

test('hide transcript: no row, count, citation or text mentions it', async () => {
  const api = await tools(store(entry({ document: `${ROBODEBT}/${SUBJECT.key}` }, 'legal_order', 'hide'))), open = await tools('');
  for (const ask of [false, true]) {
    const results = await everyView(api, ask);
    absent(results, [SUBJECT.key, SUBJECT.title, SUBJECT.pdf, SUBJECT.phrase, NOTICE], 'hidden transcript');
    assert.equal(results[1].rows[0].transcripts.count, (await everyView(open, ask))[1].rows[0].transcripts.count - 1);
    assert.deepEqual(results[5].rows, []);
  }
});

test('a withheld commission: neutral rows only in list_only; in hide it is not found, listed or counted', async () => {
  const c = json(`royal-commissions/commission-${ROBODEBT}.json`).commission;
  const listed = await tools(store(entry({ source: ROBODEBT })));
  assert.equal(await listed.textMatches(env, await listed.textIndex(env), ROBODEBT, SUBJECT.word), null);
  for (const ask of [false, true]) {
    const results = await everyView(listed, ask);
    absent(results, [c.recommendations[0].text.slice(0, 60), SUBJECT.phrase, '.pdf', "in the commission's own words", 'text_matches', 'text_url'], 'withheld source');
    const profile = results[1].rows[0];
    assert.deepEqual([profile.recommendations, profile.notes, profile.unavailable], [0, [], NOTICE]);
    assert.ok(results[2].rows.length && results[2].rows.every(r => r.unavailable === NOTICE && !r.pdf_url && !r.pages));
    assert.deepEqual(results[4].rows, []);
  }
  const hidden = await tools(store(entry({ source: ROBODEBT }, 'legal_order', 'hide')));
  const all = await hidden.callTool(env, 'royal_commissions', { view: 'list' }), open = await (await tools('')).callTool(env, 'royal_commissions', { view: 'list' });
  assert.equal(all.total, open.total - 1);
  for (const args of [{ view: 'list', limit: 8 }, { view: 'list', commission: ROBODEBT }, { view: 'profile', commission: 'robodebt' }, { view: 'transcripts', commission: ROBODEBT }, { view: 'recommendations', words: 'income averaging' }])
    absent(await hidden.callTool(env, 'royal_commissions', args), [ROBODEBT, c.name, SUBJECT.pdf], JSON.stringify(args));
});

// ---- any knowledge base resource by its id: speeches, releases, bill texts, anything

const resource = (slug, kind, label, extra = {}) => ({ id: createHash('md5').update(slug).digest('hex'), slug, title: `Title of ${slug}`, origin: { url: `https://publisher.example/${slug}`, source_id: 'opax-parli', collaborators: ['A Speaker'] },
  usermetadata: { classifications: [{ labelset: 'kind', label: kind }, { labelset: 'source', label }, { labelset: 'party', label: 'Party' }] },
  extra: { metadata: { date: '2026-11-09', person_id: '9', word_count: 400 } }, summary: 'SECRET SUMMARY',
  data: { texts: { body: { value: { body: 'SECRET BODY TEXT of the record.' } }, 'da-summary-t-body': { value: { body: 'SECRET BRIEF' } } } }, ...extra });
const KINDS = [['speech-424242', 'speech'], ['press-pmt-424242', 'press_release'], ['bill-text-au-federal-fake-424242', 'bill_text'], ['grant-site-evidence-ga424242', 'research_report']];

for (const [slug, kind] of KINDS) test(`a withheld ${kind} (${kind === 'speech' ? 'a non-transcript resource' : 'by its id'}): search, retrieval, a generated answer and a read`, async () => {
  const open = resource('speech-1', 'speech', 'nsw_hansard'), held = resource(slug, kind, 'openaustralia');
  for (const mode of MODES) {
    const policy = policyOf(entry({ document: slug }, 'legal_order', mode));
    for (const path of ['/find', '/search', '/catalog']) {
      const out = scrubKbPayload(path, { resources: { r1: open, r2: held }, best_matches: ['r1/t/body/0-10', 'r2/t/body/0-10'] }, policy);
      assert.deepEqual([Object.keys(out.resources), out.best_matches], [['r1'], ['r1/t/body/0-10']]);
      absent(out, [slug], path);
    }
    const asked = scrubKbPayload('/ask', { answer: 'An answer quoting SECRET BODY TEXT.', citations: { 'r2/t/body/0-10': [[0, 5]] }, retrieval_results: { resources: { r1: open, r2: held } } }, policy);
    assert.deepEqual([asked.answer, asked.citations], ['', {}]);
    absent(asked, [slug], '/ask');
    for (const path of ['/find', '/ask', '/search']) assert.deepEqual(guardKbRequest(path, { query: 'q' }, policy).body.filter_expression, { field: { not: { prop: 'resource', slug } } });
    const read = await guardKbResponse(`/slug/${slug}?show=basic&show=values`, Response.json(held), policy);
    const row = await read.json();
    if (mode === 'hide') {
      assert.deepEqual(row, { hidden: true });
      assert.equal(hiddenKbRead(`/slug/${slug}?show=basic`, policy).status, 404, 'a hidden record is not even asked for');
    } else {
      assert.deepEqual(Object.keys(row).sort(), ['extra', 'id', 'origin', 'slug', 'title', 'unavailable', 'usermetadata']);
      assert.equal(row.unavailable, NOTICE);
      absent(row, ['SECRET', 'A Speaker'], 'listing row');
      silent(row, 'listing row');
      assert.equal(guardKbRequest(`/slug/${slug}?show=basic&show=values&show=extracted&extracted=text`, undefined, policy).target, `/slug/${slug}?show=basic&show=origin&show=extra`, 'the text is never requested');
    }
  }
});

test('a withheld source: every resource carrying its label or origin id is closed, and queries exclude it', () => {
  const policy = policyOf(entry({ source: 'fake-source' }, 'publisher_request'));
  assert.deepEqual(kbRefusal(resource('speech-5', 'speech', 'fake-source'), policy), { mode: 'list_only' });
  assert.deepEqual(kbRefusal({ slug: 'speech-5', origin: { source_id: 'fake-source' } }, policy), { mode: 'list_only' });
  assert.equal(kbRefusal(resource('speech-5', 'speech', 'openaustralia'), policy), null);
  const nots = [{ not: { prop: 'label', labelset: 'source', label: 'fake-source' } }, { not: { prop: 'origin_source', id: 'fake-source' } }];
  assert.deepEqual(guardKbRequest('/catalog', { filter_expression: { resource: { prop: 'label', labelset: 'kind', label: 'speech' } } }, policy).body.filter_expression,
    { resource: { and: [{ prop: 'label', labelset: 'kind', label: 'speech' }, ...nots] } });
  const body = { query: 'q' };
  assert.equal(guardKbRequest('/find', body, policyOf()).body, body, 'with nothing withheld no query changes');
});

/** A report record from each dataset the reply calls "any document". */
const REPORTS = (() => {
  const integrity = json('integrity-reports/index.json').reports[0], agency = json('agency-reports/index.json').documents[0];
  const body = json('annual-reports/index.json').bodies.find(b => Object.values(b.reports ?? {}).some(r => r.url)), year = Object.entries(body.reports).find(([, r]) => r.url)[0];
  return { integrity: { slug: `integrity-report-${slugPart(integrity.id)}`, id: integrity.id, title: integrity.title }, agency: { slug: `agency-report-${slugPart(agency.id)}`, id: agency.id, title: agency.agency },
    annual: { slug: `annual-report-${slugPart(`${body.id}-${year}`)}`, id: body.id, year, title: body.reports[year].title } };
})();

test('a tool row, citation or search row naming a withheld record is left out or reduced to its title and the notice', () => {
  for (const mode of MODES) {
    const policy = policyOf(entry({ document: 'speech-424242' }, 'withdrawn', mode), entry({ document: REPORTS.integrity.slug }, 'legal_order', mode));
    const out = guardToolResult({ rows: [{ slug: 'speech-1', excerpt: 'kept' }, { record_id: 'speech-424242', title: 'A title', excerpt: 'SECRET', speaker: 'A Speaker' }],
      items: [{ id: REPORTS.integrity.id, title: REPORTS.integrity.title, findings: ['SECRET'] }, { id: 'another-report', title: 'kept' }],
      citations: [{ url: 'https://opax.test/doc/speech-1', text: 'kept' }, { url: 'https://opax.test/doc/speech-424242', text: 'SECRET' }, { url: `https://opax.test/report/${REPORTS.integrity.slug}`, text: 'SECRET' }], notes: [] }, policy);
    assert.deepEqual(out.citations, [{ url: 'https://opax.test/doc/speech-1', text: 'kept' }]);
    absent(out, ['SECRET', 'A Speaker'], mode);
    silent(out, mode);
    const search = guardSearchRows([{ kind: 'speech', slug: 'speech-424242', title: 'A title', href: '/doc/speech-424242', snippet: 'SECRET' }, { kind: 'report', title: REPORTS.integrity.title, href: `/report/${REPORTS.integrity.slug}`, slug: 'catalog-9', snippet: 'SECRET' }, { kind: 'speech', slug: 'speech-1', snippet: 'kept' }], policy);
    absent(search, ['SECRET'], mode);
    if (mode === 'hide') {
      assert.deepEqual([out.rows, out.items, search], [[{ slug: 'speech-1', excerpt: 'kept' }], [{ id: 'another-report', title: 'kept' }], [{ kind: 'speech', slug: 'speech-1', snippet: 'kept' }]]);
    } else {
      assert.deepEqual(out.rows[1], { record_id: 'speech-424242', title: 'A title', unavailable: NOTICE });
      assert.deepEqual(out.items[0], { id: REPORTS.integrity.id, title: REPORTS.integrity.title, unavailable: NOTICE });
      assert.deepEqual(search.map(r => r.snippet), [NOTICE, NOTICE, 'kept']);
    }
  }
  const untouched = { rows: [{ slug: 'speech-424242', excerpt: 'x' }], citations: [] };
  assert.equal(guardToolResult(untouched, policyOf()), untouched);
});

// ---- the Worker, with the list in its secret

async function withWorker(raw, run) {
  const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, PUBLIC);
  if (raw !== undefined) worker.env.OPAX_WITHHELD_JSON = raw;
  const restore = offline(), savedCaches = globalThis.caches, logs = [], saved = { log: console.log, warn: console.warn, error: console.error };
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
  for (const level of Object.keys(saved)) console[level] = (...args) => logs.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
  const asked = [];
  globalThis.fetch = async input => {
    const url = String(input.url ?? input), slug = /\/slug\/([^?]+)/.exec(url)?.[1];
    asked.push(url);
    return slug ? Response.json(resource(slug, 'speech', 'openaustralia')) : Response.json({ resources: {}, fulltext: { total: 0, facets: {} } });
  };
  try { return await run(worker, { logs, asked }); }
  finally { restore(); globalThis.caches = savedCaches; globalThis.fetch = savedFetch; Object.assign(console, saved); }
}

test('the resource API, which MCP read_record and the record page read: list_only is the neutral row; hide is a record that does not exist', async () => {
  assert.match(source('../src/community-mcp.ts'), /read_record[^\n]+\/api\/resource\//, 'read_record reads the resource API');
  const missing = await withWorker(undefined, async w => { globalThis.fetch = async () => Response.json({ detail: 'x' }, { status: 404 }); const r = await w.fetch('/api/resource/speech-999?nocache=1'); return [r.status, await r.text()]; });
  for (const [slug] of KINDS.slice(0, 3)) {
    await withWorker(store(entry({ document: slug })), async (w, { logs, asked }) => {
      const res = await w.fetch(`/api/resource/${slug}?nocache=1`), row = await res.json();
      assert.equal(res.status, 200);
      assert.deepEqual(Object.keys(row).sort(), ['labels', 'metadata', 'slug', 'speaker', 'speaker_attribution', 'summary', 'text', 'title', 'topics', 'unavailable', 'url']);
      assert.deepEqual([row.text, row.summary, row.speaker, row.topics, row.unavailable], ['', null, null, [], NOTICE]);
      assert.equal(row.url, `https://publisher.example/${slug}`);
      absent(row, ['SECRET', 'A Speaker'], slug); silent(row, slug);
      assert.ok(asked.length && asked.every(u => !/show=values|extracted/.test(u)), 'the text is never requested');
      absent(logs.join('\n'), [slug, '424242'], 'log lines'); silent(logs.join('\n'), 'log lines');
    });
    await withWorker(store(entry({ document: slug }, 'legal_order', 'hide')), async (w, { logs, asked }) => {
      const res = await w.fetch(`/api/resource/${slug}?nocache=1`);
      assert.deepEqual([res.status, await res.text()], missing, 'indistinguishable from a slug OPAX never held');
      assert.deepEqual(asked, [], 'and the knowledge base is not asked');
      absent(logs.join('\n'), [slug, '424242'], 'log lines'); silent(logs.join('\n'), 'log lines');
    });
  }
});

test('report records (integrity, agency and annual reports): the API and page give the neutral record, or not found when hidden', { skip: !existsSync(join(PUBLIC, 'report-records', `${REPORTS.integrity.slug}.json`)) && 'report records are not built' }, async () => {
  for (const report of Object.values(REPORTS)) {
    const open = await withWorker(undefined, async w => (await w.fetch(`/api/report/${report.slug}`)).json());
    assert.equal(open.slug, report.slug, 'the control: the record is served');
    await withWorker(store(entry({ document: report.slug }, 'amended_pending')), async (w, { logs }) => {
      const res = await w.fetch(`/api/report/${report.slug}`), body = await res.json();
      assert.equal(res.status, 200);
      assert.deepEqual([body.title, body.citation, body.snippet, body.caveats, body.record, body.facts, body.tables, body.headline, body.summary], [open.title, open.citation, NOTICE, [NOTICE], {}, [], [], null, undefined]);
      silent(body, report.slug);
      const page = await w.fetch(`/report/${report.slug}`);
      assert.equal(page.status, 200);
      // The whole page, shell included: no reason class, date or mention of an order.
      assert.doesNotMatch(await page.text(), /legal_order|publisher_request|amended_pending|2026-11-16|legal order|subject to an? order/i, 'page');
      absent(logs.join('\n'), [report.slug], 'log lines'); silent(logs.join('\n'), 'log lines');
    });
    await withWorker(store(entry({ document: report.slug }, 'legal_order', 'hide')), async (w, { logs }) => {
      const absentRecord = await w.fetch('/api/report/integrity-report-no-such-record');
      const res = await w.fetch(`/api/report/${report.slug}`);
      assert.deepEqual([res.status, await res.text()], [absentRecord.status, await absentRecord.text()]);
      assert.equal((await w.fetch(`/report/${report.slug}`)).status, (await w.fetch('/report/integrity-report-no-such-record')).status);
      absent(logs.join('\n'), [report.slug], 'log lines');
    });
  }
});

test('an unreadable store fails closed: record, search, Ask, MCP and report routes are refused with one plain message; other pages are served', async () => {
  for (const raw of ['{not json', store({ document: 'speech-424242', reason: 'legal_order', date: 'soon' })]) {
    await withWorker(raw, async (w, { logs, asked }) => {
      for (const [path, init] of [['/api/resource/speech-1'], ['/api/search-all?q=housing'], ['/api/search?q=housing'], ['/api/ask', { method: 'POST', body: '{"question":"What was said about housing?"}' }],
        ['/api/followups', { method: 'POST', body: '{}' }], ['/api/search-summary?q=housing'], ['/api/report/x'], ['/report/royal-commission-cth-robodebt'], ['/doc/speech-1'], ['/mcp', { method: 'POST', body: '{}' }], ['/official-reports']]) {
        const res = await w.fetch(path, init), body = await res.text();
        assert.equal(res.status, 503, path);
        assert.equal(res.headers.get('retry-after'), '300');
        assert.ok(body === 'OPAX is temporarily unavailable. Please try again shortly.' || body === '{"error":"OPAX is temporarily unavailable. Please try again shortly."}', path + ': ' + body.slice(0, 80));
        silent(body, path);
      }
      assert.deepEqual(asked, [], 'nothing is read from the knowledge base');
      for (const path of ['/', '/terms', '/privacy']) assert.equal((await w.fetch(path)).status, 200, path);
      absent(logs.join('\n'), ['424242', 'speech-424242', 'soon'], 'log lines'); silent(logs.join('\n'), 'log lines');
    });
  }
  assert.deepEqual(['/api/x', '/mcp', '/doc/speech-1', '/report/x', '/official-reports', '/', '/terms', '/vic-election-2026', '/royal-commissions/index.json'].map(dependsOnWithheld), [true, true, true, true, true, false, false, false, false]);
  silent(await withheldUnavailable('/api/x').text(), 'message');
  // No secret at all is "nothing withheld": the routes are served.
  await withWorker(undefined, async w => assert.equal((await w.fetch('/api/resource/speech-1?nocache=1')).status, 200));
});

// ---- four ways text used to get past the guard (security review P1-1), and what the client sends back

const RID = slug => createHash('md5').update(slug).digest('hex');
/** A Worker whose knowledge base holds a withheld speech and an open one, answering reads by rid or slug. */
async function withKb(raw, run) {
  return withWorker(raw, async (w, ctx) => {
    const sent = [];
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input.url ?? input)), path = url.pathname.replace(/^.*\/kb\/[^/]+/, '') + url.search;
      sent.push({ path, body: init?.body ? JSON.parse(init.body) : undefined });
      const rid = /^\/resource\/([0-9a-f]{32})/.exec(path)?.[1], slug = rid === RID('speech-424242') ? 'speech-424242' : 'speech-1';
      if (/^\/resource\/[0-9a-f]{32}\/text\//.test(path)) return Response.json({ value: { body: `SECRET BRIEF of ${slug}` } });
      if (rid) return Response.json(resource(slug, 'speech', 'openaustralia'));
      if (path.startsWith('/slug/')) return Response.json(resource(/\/slug\/([^?]+)/.exec(path)[1], 'speech', 'openaustralia'));
      return Response.json(path.startsWith('/ask') ? { answer: '', citations: {}, retrieval_results: { resources: {} } } : { resources: {}, fulltext: { total: 0, facets: {} } });
    };
    return run(w, { ...ctx, sent });
  });
}
const HELD = store(entry({ document: 'speech-424242' }));

test('/api/brief: the machine summary of a withheld record is not served by its rid, and the cache key carries the epoch', async () => {
  for (const mode of MODES) await withKb(store(entry({ document: 'speech-424242' }, 'legal_order', mode)), async (w, { sent, logs }) => {
    const keys = [];
    globalThis.caches = { default: { match: async key => { keys.push(key.url); return undefined; }, put: async () => {} } };
    const res = await w.fetch(`/api/brief?rids=${RID('speech-424242')},${RID('speech-1')}`), body = await res.json();
    assert.deepEqual(body.briefs, { [RID('speech-1')]: 'SECRET BRIEF of speech-1' });
    assert.ok(!sent.some(r => r.path.startsWith(`/resource/${RID('speech-424242')}/text/`)), 'the summary of the withheld record is never requested');
    assert.ok(keys.length && keys.every(k => k.includes(encodeURIComponent(w.env.CACHE_EPOCH))), 'an epoch bump retires cached briefs: ' + keys[0]);
    absent(logs.join('\n'), ['424242'], 'logs');
  });
  // With nothing withheld a brief costs one read, as before.
  await withKb(undefined, async (w, { sent }) => {
    assert.deepEqual(Object.keys((await (await w.fetch(`/api/brief?rids=${RID('speech-1')}`)).json()).briefs), [RID('speech-1')]);
    assert.equal(sent.length, 1);
  });
});

const ndjson = items => new Response(items.map(i => JSON.stringify({ item: i })).join('\n') + '\n', { headers: { 'content-type': 'application/x-ndjson' } });
test('a streamed answer that drew on a withheld resource is not passed on; an untouched stream passes byte for byte', async () => {
  const policy = policyOf(entry({ document: 'speech-424242' }));
  const held = resource('speech-424242', 'speech', 'openaustralia'), open = resource('speech-1', 'speech', 'nsw_hansard');
  const stream = resources => ndjson([{ type: 'retrieval', results: { resources, best_matches: Object.keys(resources).map(r => r + '/t/body/0-9') } }, { type: 'answer', text: 'The record says SECRET ' }, { type: 'answer', text: 'BODY TEXT.' },
    { type: 'citations', citations: { 'r2/t/body/0-9': [[0, 4]] } }, { type: 'status', code: '0' }]);
  const out = await guardKbResponse('/ask', stream({ r1: open, r2: held }), policy).text();
  const items = out.trim().split('\n').map(line => JSON.parse(line).item);
  absent(out, ['speech-424242', 'The record says', 'BODY TEXT.'], 'stream');
  assert.deepEqual(Object.keys(items.find(i => i.type === 'retrieval').results.resources), ['r1']);
  assert.ok(!items.some(i => i.type === 'answer' && i.text) && !items.some(i => i.type === 'citations' && Object.keys(i.citations).length));
  assert.ok(items.some(i => i.type === 'status'), 'the stream still ends as a stream');
  const clean = stream({ r1: open });
  assert.equal(await guardKbResponse('/ask', clean.clone(), policy).text(), await clean.text());
  // A line that cannot be parsed and names a closed id is dropped, never passed through.
  const broken = new Response('{"item":{"type":"answer","text":"about speech-424242"\n{"item":{"type":"status","code":"0"}}\n', { headers: { 'content-type': 'application/x-ndjson' } });
  absent(await guardKbResponse('/ask', broken, policy).text(), ['speech-424242'], 'broken line');
});

test('prequeries: a withheld resource named in prior_resources is not searched, and a response that used one is not passed on', async () => {
  const policy = policyOf(entry({ document: 'speech-424242' }));
  const held = resource('speech-424242', 'speech', 'openaustralia'), open = resource('speech-1', 'speech', 'nsw_hansard');
  const out = scrubKbPayload('/ask', { answer: 'An answer from SECRET BODY TEXT.', citations: { x: [[0, 2]] }, retrieval_results: { resources: { r1: open } },
    prequeries: { q1: { resources: { r2: held }, best_matches: ['r2/t/body/0-9'] }, q2: { resources: { r1: open }, best_matches: ['r1/t/body/0-9'] } } }, policy);
  assert.deepEqual([out.answer, out.citations, Object.keys(out.prequeries.q1.resources), out.prequeries.q1.best_matches, Object.keys(out.prequeries.q2.resources)], ['', {}, [], [], ['r1']]);
  absent(out, ['speech-424242'], 'prequeries');
  // The Worker checks the rids a client sends back before it builds any request.
  await withKb(HELD, async (w, { sent }) => {
    const context = [{ author: 'user', text: 'What was said about housing supply?' }, { author: 'answer', text: 'Members debated housing supply.' }];
    await w.fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'What did members say about rents in 2024?', context, prior_resources: [RID('speech-424242'), RID('speech-1')] }) });
    const asks = sent.filter(r => r.path === '/ask');
    assert.ok(asks.some(a => JSON.stringify(a.body).includes(RID('speech-1'))), 'the open record is still searched');
    for (const { body } of asks) assert.ok(!JSON.stringify(body.rag_strategies ?? []).includes(RID('speech-424242')), 'no prequery searches the withheld record');
  });
});

test('/search and a listing read with a query string: paragraph, full-text and sentence results of a withheld resource are removed', async () => {
  const policy = policyOf(entry({ document: 'speech-424242' }));
  const held = resource('speech-424242', 'speech', 'openaustralia'), open = resource('speech-1', 'speech', 'nsw_hansard');
  const results = { resources: { r1: open, r2: held }, paragraphs: { results: [{ rid: 'r1', text: 'kept' }, { rid: 'r2', text: 'SECRET PARAGRAPH' }] },
    fulltext: { results: [{ rid: 'r2', text: 'SECRET FULLTEXT' }, { rid: 'r1', text: 'kept' }] }, sentences: { results: [{ rid: 'r2', text: 'SECRET SENTENCE' }] } };
  const out = scrubKbPayload('/search', results, policy);
  assert.deepEqual([Object.keys(out.resources), out.paragraphs.results, out.fulltext.results, out.sentences.results], [['r1'], [{ rid: 'r1', text: 'kept' }], [{ rid: 'r1', text: 'kept' }], []]);
  absent(out, ['SECRET PARAGRAPH', 'SECRET FULLTEXT', 'SECRET SENTENCE', 'speech-424242'], '/search');
  // GET /catalog?… and /search?… carry their arguments in the path: they are checked like the POST forms.
  for (const target of ['/catalog?page_number=0&page_size=14&sort_field=created', '/search?query=x']) {
    const listed = await (await guardKbResponse(target, Response.json({ resources: { r1: open, r2: held } }), policy)).json();
    assert.deepEqual(Object.keys(listed.resources), ['r1'], target);
  }
});

test('a response that cannot be parsed and names a closed id fails closed', async () => {
  const policy = policyOf(entry({ document: 'speech-424242' }));
  const res = guardKbResponse('/find', new Response('{"resources": {"r2": {"slug": "speech-424242", "text": "SECRET"', { headers: { 'content-type': 'application/json' } }), policy);
  const text = await res.text().catch(() => 'stream error');
  absent(text, ['speech-424242', 'SECRET'], 'unparseable response');
  // One that names nothing closed is passed through as it came.
  assert.equal(await guardKbResponse('/find', new Response('{"resources": {', { headers: { 'content-type': 'application/json' } }), policy).text(), '{"resources": {');
});

test('what the client sends back: an earlier answer that cited a withheld record, and a passage of one, never reach a request', async () => {
  await withKb(HELD, async (w, { sent }) => {
    const cited = slug => [{ resource: RID(slug), slug, title: `Title of ${slug}`, url: `https://opax.com.au/doc/${slug}`, snippet: 'CLIENT HELD TEXT of ' + slug, cited: true }];
    const context = [{ author: 'user', text: 'What did the first member say?' }, { author: 'answer', text: 'CLIENT HELD ANSWER one.', sources: cited('speech-424242') },
      { author: 'user', text: 'And the second?' }, { author: 'answer', text: 'An answer from the open record.', sources: cited('speech-1') }];
    await w.fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'and after that?', context }) });
    assert.ok(sent.some(r => r.path === '/ask'), 'a request was built');
    for (const { path, body } of sent.filter(r => r.body)) {
      // The retrieval filter names the record in order to exclude it; nothing else in the request may.
      absent({ ...body, filter_expression: undefined }, ['CLIENT HELD ANSWER', 'CLIENT HELD TEXT of speech-424242', 'speech-424242', RID('speech-424242')], path);
    }
    assert.ok(sent.some(r => JSON.stringify(r.body ?? '').includes('An answer from the open record.')), 'the open turn still travels');
    sent.length = 0;
    const passages = [{ slug: 'speech-424242', resource: RID('speech-424242'), title: 'A debate', text: 'CLIENT HELD PASSAGE. '.repeat(20), kind: 'speech', cited: true },
      { slug: 'speech-1', resource: RID('speech-1'), title: 'Another debate', text: 'Rents rose across the capital cities over the year, the member told the chamber. '.repeat(5), kind: 'speech', cited: true }];
    await w.fetch('/api/followups', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'What was said about rents?', answer: 'Members debated rents at length in the chamber.', passages }) });
    const asks = sent.filter(r => r.path === '/ask');
    assert.ok(asks.length >= 1);
    for (const { body } of asks) absent(body, ['CLIENT HELD PASSAGE'], 'follow-ups');
    assert.ok(asks.some(a => String(a.body.query).includes('Rents rose across the capital cities')));
  });
});

// ---- the builds: applied at deploy from the Actions secret, never committed, never logged

test('the committed files carry the public tiers only, and the build steps read the list from the environment, not from a file', () => {
  assert.deepEqual(applySourcePolicy({ check: true }), []);
  const apply = source('../../scripts/apply_source_policy.mjs'), catalogue = source('../../scripts/build_search_catalog.mjs');
  assert.match(apply, /if \(!check\) loadWithheld\(process\.env\.OPAX_WITHHELD_JSON\)/);
  assert.match(catalogue, /loadWithheld\(process\.env\.OPAX_WITHHELD_JSON\);/);
  for (const text of [apply, catalogue]) assert.doesNotMatch(text, /\.config\/opax|OPAX_WITHHELD_FILE/, 'a developer build cannot write a withheld item into the working tree');
  // What the apply step prints is the same whatever the list holds: no count and no path.
  assert.match(apply, /console\.log\(`\[apply_source_policy\] \$\{check \? 'checked' : 'applied'\}`\)/);
  assert.equal((apply.match(/console\.(?:log|error)\(/g) ?? []).length, 2);
});

test('the build commands: no store is nothing withheld; an unreadable one stops the build and prints none of it', () => {
  const run = (script, args, secret) => spawnSync(process.execPath, [new URL(script, import.meta.url).pathname, ...args],
    { encoding: 'utf8', env: { ...process.env, ...(secret === undefined ? { OPAX_WITHHELD_JSON: '' } : { OPAX_WITHHELD_JSON: secret }) } });
  for (const none of [undefined, '', store()]) {
    const applied = run('../../scripts/apply_source_policy.mjs', [], none);
    assert.deepEqual([applied.status, applied.stdout.trim(), applied.stderr], [0, '[apply_source_policy] applied', '']);
  }
  assert.deepEqual(applySourcePolicy({ check: true }), [], 'and the committed files are untouched');
  const bad = store({ document: 'speech-424242', reason: 'legal_order', date: 'soon' });
  for (const script of ['../../scripts/apply_source_policy.mjs', '../../scripts/build_search_catalog.mjs']) {
    const failed = run(script, [], bad);
    assert.notEqual(failed.status, 0, script);
    absent(failed.stdout + failed.stderr, ['424242', 'legal_order', 'soon'], script);
    assert.match(failed.stderr, /source policy: a withheld entry needs a known reason class, an ISO date and a known mode/);
  }
  // The Deploy overlay with no secret does nothing and says the one fixed line.
  const overlay = spawnSync('bash', [new URL('../../scripts/withheld_overlay.sh', import.meta.url).pathname, 'apply'], { encoding: 'utf8', cwd: new URL('../../', import.meta.url).pathname, env: { ...process.env, OPAX_WITHHELD_JSON: '' } });
  assert.deepEqual([overlay.status, overlay.stdout.trim()], [0, '[withheld_overlay] ready']);
});

test('applying the list at deploy: transcripts, commissions and the three report datasets, in both modes, with nothing left that names the item', () => {
  const root = mkdtempSync(join(tmpdir(), 'opax-policy-'));
  const copy = () => { for (const dir of ['royal-commissions', 'transcripts', 'integrity-reports', 'agency-reports', 'annual-reports']) { rmSync(join(root, dir), { recursive: true, force: true }); cpSync(join(PUBLIC, dir), join(root, dir), { recursive: true }); } };
  const read = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
  const everything = () => ['royal-commissions', 'integrity-reports', 'agency-reports', 'annual-reports'].flatMap(dir => readdirSync(join(root, dir)).map(n => readFileSync(join(root, dir, n), 'utf8'))).join('\n') + readFileSync(join(root, 'transcripts/index.json'), 'utf8');
  try {
    const ix = json('transcripts/index.json'), row = ix.docs.find(d => d.key === SUBJECT.key);
    const integrity = json('integrity-reports/index.json').reports.find(r => r.id === REPORTS.integrity.id);
    const entries = mode => [entry({ document: `${ROBODEBT}/${SUBJECT.key}` }, 'legal_order', mode), entry({ document: REPORTS.integrity.slug }, 'publisher_request', mode),
      entry({ document: REPORTS.agency.slug }, 'withdrawn', mode), entry({ document: REPORTS.annual.slug }, 'amended_pending', mode)];
    // list_only
    copy();
    // The published data mentions some of these words itself; applying the list must add none.
    const reasons = text => (text.match(/legal_order|publisher_request|amended_pending|"withdrawn"|2026-11-16/g) ?? []).length, baseline = reasons(everything());
    const postings = () => readdirSync(join(root, 'transcripts/terms')).flatMap(n => Object.values(read('transcripts/terms/' + n))).flat();
    assert.ok(postings().includes(row.i));
    const policy = policyOf(...entries('list_only'));
    assert.ok(applySourcePolicy({ root, policy, check: true }).includes(row.file.slice(1)) && existsSync(join(root, row.file.slice(1))), '--check writes nothing');
    applySourcePolicy({ root, policy });
    assert.ok(!existsSync(join(root, row.file.slice(1))) && !postings().includes(row.i));
    assert.deepEqual(read('transcripts/index.json').docs[row.i], { i: row.i, withheld: true });
    const held = read(`royal-commissions/commission-${ROBODEBT}.json`).commission.transcripts.find(t => t.key === SUBJECT.key);
    assert.deepEqual([Object.keys(held).sort(), held.unavailable], [LISTING, NOTICE]);
    const manifest = read('royal-commissions/manifest.json');
    for (const [name, f] of Object.entries(manifest.files)) assert.equal(createHash('sha256').update(readFileSync(join(root, 'royal-commissions', name))).digest('hex'), f.sha256, name);
    const report = read('integrity-reports/index.json').reports.find(r => r.id === REPORTS.integrity.id);
    assert.deepEqual([report.title, report.unavailable, report.findings, report.documents, report.summary, report.pdf_url], [integrity.title, NOTICE, undefined, undefined, undefined, undefined]);
    const bodyFile = readdirSync(join(root, 'integrity-reports')).filter(n => n.startsWith('reports-')).map(n => read('integrity-reports/' + n)).find(f => f.records.some(r => r.id === REPORTS.integrity.id));
    assert.equal(bodyFile.records.find(r => r.id === REPORTS.integrity.id).unavailable, NOTICE);
    const doc = read('agency-reports/index.json').documents.find(d => d.id === REPORTS.agency.id);
    assert.deepEqual([doc.unavailable, doc.sha256, doc.pages], [NOTICE, undefined, undefined]);
    assert.ok(!readdirSync(join(root, 'agency-reports')).filter(n => n.startsWith('facts-')).some(n => read('agency-reports/' + n).facts.some(f => f.report_id === REPORTS.agency.id)));
    const annual = read('annual-reports/index.json');
    assert.equal(annual.bodies.find(b => b.id === REPORTS.annual.id).reports[REPORTS.annual.year].unavailable, NOTICE);
    assert.ok(!annual.headline.some(h => h.body_id === REPORTS.annual.id && h.year === REPORTS.annual.year));
    for (const name of readdirSync(join(root, 'annual-reports')).filter(n => n.includes(REPORTS.annual.year) && /^(?:remuneration|suppliers)-/.test(n)))
      assert.ok(!Object.values(read('annual-reports/' + name).tables).some(t => t.body_id === REPORTS.annual.id), name);
    assert.deepEqual(applySourcePolicy({ root, policy, check: true }), [], 'applying twice changes nothing');
    assert.ok(reasons(everything()) <= baseline, 'no reason class or entry date was written into any applied file');
    // hide
    copy();
    // A whole commission, too: one with transcripts that no fixed caveat names.
    const rcIndex = json('royal-commissions/index.json'), fixed = JSON.stringify(rcIndex.meta);
    const whole = rcIndex.commissions.find(c => c.counts.transcripts && !fixed.includes(c.name) && c.id !== ROBODEBT);
    applySourcePolicy({ root, policy: policyOf(...entries('hide'), entry({ source: whole.id }, 'legal_order', 'hide')) });
    const after = everything();
    absent(after, [SUBJECT.key, SUBJECT.title, REPORTS.integrity.id, integrity.title, REPORTS.agency.id, whole.id, whole.name], 'hidden items');
    assert.ok(!(REPORTS.annual.year in read('annual-reports/index.json').bodies.find(b => b.id === REPORTS.annual.id).reports));
    assert.ok(!existsSync(join(root, `royal-commissions/commission-${whole.id}.json`)) && !existsSync(join(root, 'transcripts', whole.id)));
    assert.ok(!after.includes(NOTICE), 'a hidden item has no notice either');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the search catalogue and the report records: the neutral row, or no row', async () => {
  const report = json(`royal-commissions/commission-${ROBODEBT}.json`).commission.reports[0];
  assert.deepEqual(catalogWithheld('bill-text:x', { slug: 'bill-text-au-federal-fake-424242' }, policyOf(entry({ document: 'bill-text-au-federal-fake-424242' }))), { mode: 'list_only' });
  assert.deepEqual(catalogWithheld(`official-report:${REPORTS.integrity.slug}`, { slug: REPORTS.integrity.slug }, policyOf(entry({ document: REPORTS.integrity.slug }, 'legal_order', 'hide'))), { mode: 'hide' });
  assert.equal(catalogWithheld('person:Example', { slug: '' }, policyOf(entry({ document: 'speech-424242' }))), null);
  const add = /function add\([\s\S]*?\n}/.exec(source('../../scripts/build_search_catalog.mjs'))[0];
  assert.match(add, /if\(held\?\.mode==='hide'\) return;\n\s+if\(held\) \{ text=''; extra=\{snippet:NOTICE, [^\n]+unavailable:NOTICE\}; \}/, 'hide leaves the row out; list_only keeps the title with the notice and no searchable text');
  const read = async path => json(path.slice(1)), find = (all, slug) => all.find(r => r.row.slug === slug);
  const open = await projectReports(read);
  for (const item of [REPORTS.integrity, REPORTS.agency, REPORTS.annual, { slug: `royal-commission-${ROBODEBT}` }]) {
    const before = find(open, item.slug);
    assert.ok(before, 'the control: ' + item.slug);
    const listed = find(await projectReports(read, policyOf(entry({ document: item.slug }, 'withdrawn'))), item.slug);
    assert.deepEqual([listed.row.title, listed.row.snippet, listed.row.unavailable, listed.aliases, listed.detail.record, listed.detail.facts, listed.detail.tables, listed.detail.summary, listed.detail.caveats],
      [before.row.title, NOTICE, NOTICE, [], {}, [], [], undefined, [NOTICE]]);
    silent({ row: listed.row, detail: { ...listed.detail, publisher: null } }, item.slug);
    assert.equal(find(await projectReports(read, policyOf(entry({ document: item.slug }, 'legal_order', 'hide'))), item.slug), undefined);
  }
  // A withheld report inside a commission: its record has no summary, quotation or recommendation.
  const built = find(await projectReports(async path => { const data = json(path.slice(1)); return path === `/royal-commissions/commission-${ROBODEBT}.json` ? { ...data, commission: redactCommission(data.commission, policyOf(entry({ document: `${ROBODEBT}/${report.key}` }))) } : data; }), `royal-commission-${ROBODEBT}`);
  assert.deepEqual([built.detail.summary, built.detail.record.recommendations, built.detail.record.reports[0].unavailable, built.detail.record.reports[0].files], [undefined, [], NOTICE, []]);
});

test('the Deploy workflow applies the list after the tests and returns to the public build before anything is committed', () => {
  const workflow = source('../../.github/workflows/deploy.yml'), overlay = source('../../scripts/withheld_overlay.sh');
  const order = ['- name: Build all release assets', '- name: Test\n', '- name: Apply the withheld list', '- name: Deploy\n', '- name: Reload D1 tables', '- name: Return to the public build', '- name: Commit restamped assets back to main'].map(step => workflow.indexOf(step));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), order.join(','));
  assert.equal((workflow.match(/secrets\.OPAX_WITHHELD_JSON/g) ?? []).length, 1, 'only the apply step sees the secret; the tests never do');
  assert.match(workflow, /npx wrangler secret put OPAX_WITHHELD_JSON >\/dev\/null 2>&1/, 'the same value goes to the Worker in the same run');
  // The script prints one fixed line, hides every build log and restores the data it changed.
  assert.deepEqual([...overlay.matchAll(/^\s*echo "([^"]+)"/gm)].map(m => m[1]), ['::error::the release could not be prepared; nothing was deployed', '[withheld_overlay] ready', '[withheld_overlay] ready']);
  assert.match(overlay, /\) >\/dev\/null 2>&1; then/);
  assert.match(overlay, /git checkout -- "\$\{data\[@\]\}" >\/dev\/null 2>&1/);
  for (const dir of ['royal-commissions', 'transcripts', 'integrity-reports', 'agency-reports', 'annual-reports']) assert.ok(overlay.includes(`portal/public/${dir}`), dir);
  assert.doesNotMatch(source('../wrangler.jsonc'), /OPAX_WITHHELD_JSON"\s*:/, 'never a var: vars are public in the repository');
});
