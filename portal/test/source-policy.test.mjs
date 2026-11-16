// The source policy (parli/ingest/source_policy.json): the takedown list and the per-source use, honoured by
// every consumer in the Worker and the Node builds. Each consumer is bundled or called with a policy that has an
// entry added, and nothing of the closed record may come out. The published file holds no withheld entry.
// The Python consumers are covered by tests/test_source_policy.py, the enrichment Worker by enrich/test/policy.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { importBundle } from './fixtures/import-bundle.mjs';
import { loadWorker } from './worker-harness.mjs';
import { runPython, pythonSkip } from './helpers/python.mjs';
import { POLICY, LABELS, REASONS, sourcePolicy, redactCommission, kbRefusal } from '../../parli/ingest/source_policy.mjs';
import { guardKbRequest, guardKbResponse, scrubKbPayload, guardToolResult } from '../src/source-policy.ts';
import { applySourcePolicy } from '../../scripts/apply_source_policy.mjs';
import { catalogWithheld } from '../../scripts/build_search_catalog.mjs';
import { projectReports } from '../../scripts/build_report_catalog.mjs';

const PUBLIC = new URL('../public/', import.meta.url).pathname;
const json = path => JSON.parse(readFileSync(join(PUBLIC, path), 'utf8'));
const VIC = 'vic-major-infrastructure', ROBODEBT = 'cth-robodebt';
const entry = (id, reason = 'publisher_request') => ({ ...id, reason, date: '2026-11-16' });
const policyData = (withheld = [], use = json('../../parli/ingest/source_policy.json').use) => ({ schema: 1, use, withheld });
const policyOf = (withheld, use) => sourcePolicy(policyData(withheld, use));
/** Bundles read the policy from one file; a test swaps that file's contents. */
const withPolicy = data => ({ name: 'source-policy-fixture', setup(b) { b.onLoad({ filter: /source_policy\.json$/ }, () => ({ contents: JSON.stringify(data), loader: 'json' })); } });

const savedFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = savedFetch; });

// ---- the file and its two loaders

test('the published policy withholds nothing and lists the commission as documents only', () => {
  const file = json('../../parli/ingest/source_policy.json');
  assert.deepEqual(file.withheld, []);
  assert.deepEqual([POLICY.withheldSources, POLICY.withheldDocuments], [[], []]);
  assert.equal(POLICY.use(VIC), 'documents_only');
  assert.equal(POLICY.textAllowed({ documents: [`${VIC}/transcript-2026-11-09`] }), false);
  assert.deepEqual(Object.keys(LABELS), REASONS);
  assert.equal(LABELS.publisher_request, "Withheld at the publisher's request");
  assert.equal(LABELS.legal_order, 'Withheld: subject to a legal order');
});

const BAD = [
  { schema: 1, use: {} },
  { schema: 1, use: {}, withheld: [], notes: 'free text' },
  { schema: 1, use: { 'a-source': 'summarise' }, withheld: [] },
  { schema: 1, use: {}, withheld: [{ source: 'a-source', reason: 'publisher_request', date: '2026-11-16', note: 'why' }] },
  { schema: 1, use: {}, withheld: [{ source: 'a-source', reason: 'because', date: '2026-11-16' }] },
  { schema: 1, use: {}, withheld: [{ source: 'a-source', reason: 'legal_order', date: '2026-02-30' }] },
  { schema: 1, use: {}, withheld: [{ source: 'A source with words', reason: 'legal_order', date: '2026-11-16' }] },
  { schema: 1, use: {}, withheld: [entry({ source: 'a-source' }), entry({ source: 'a-source' })] },
];
test('a malformed policy is refused: an entry is an id, a reason class and a date, with no free text', () => {
  for (const bad of BAD) assert.throws(() => sourcePolicy(bad), /source policy/, JSON.stringify(bad));
});

const COMMISSION = () => {
  const c = structuredClone(json(`royal-commissions/commission-${ROBODEBT}.json`).commission);
  return { ...c, transcripts: c.transcripts.slice(0, 4), recommendations: c.recommendations.slice(0, 5) };
};
const POLICIES = () => {
  const c = COMMISSION(), key = c.transcripts[0].key;
  return {
    published: policyData(),
    'a withheld transcript': policyData([entry({ document: `${ROBODEBT}/${key}` })]),
    'a withheld report': policyData([entry({ document: `${ROBODEBT}/${c.reports[0].key}` }, 'amended_pending')]),
    'a withheld source': policyData([entry({ source: ROBODEBT }, 'legal_order')]),
    'search only': policyData([], { [ROBODEBT]: 'search_only' }),
    'documents only': policyData([], { [ROBODEBT]: 'documents_only' }),
    'a quotable report in a documents-only source': policyData([], { [ROBODEBT]: 'documents_only', [`${ROBODEBT}/${c.reports[0].key}`]: 'quotable' }),
  };
};

test('the Python and JavaScript loaders redact a commission identically', { skip: pythonSkip([]) }, () => {
  const input = JSON.stringify({ commission: COMMISSION(), policies: POLICIES(), bad: BAD });
  const out = JSON.parse(runPython(['-c', `
import json, sys
from parli import source_policy as sp
data = json.load(sys.stdin)
def refused(bad):
    try:
        sp.Policy(bad)
    except sp.PolicyError:
        return True
    return False
print(json.dumps({"redacted": {k: sp.redact_commission(data["commission"], sp.Policy(v)) for k, v in data["policies"].items()}, "refused": [refused(b) for b in data["bad"]]}))
`], { input, maxBuffer: 64 * 1024 * 1024 }));
  for (const [name, data] of Object.entries(POLICIES())) assert.deepEqual(redactCommission(COMMISSION(), sourcePolicy(data)), out.redacted[name], name);
  assert.deepEqual(out.refused, BAD.map(() => true));
});

// ---- the commission record: what a withheld document shows

const LISTING = ['acquisition', 'cite', 'date', 'date_basis', 'files', 'key', 'kind', 'page_url', 'title', 'withheld'];
test('a withheld document is a listing row: title, date, its label and the publisher page, nothing else', () => {
  const c = COMMISSION(), key = c.transcripts[0].key, pdf = c.transcripts[0].files[0].url;
  const out = redactCommission(c, policyOf([entry({ document: `${ROBODEBT}/${key}` })]));
  const row = out.transcripts[0];
  assert.deepEqual(Object.keys(row).sort(), LISTING);
  assert.deepEqual(row.files, []);
  assert.deepEqual(row.withheld, { reason: 'publisher_request', date: '2026-11-16', label: "Withheld at the publisher's request" });
  assert.match(row.page_url, /^https:\/\//);
  assert.ok(!JSON.stringify(out).includes(pdf), 'the file link, page count and hash are gone');
  assert.deepEqual(out.transcripts[1], c.transcripts[1]);
  assert.equal(out.recommendations.length, c.recommendations.length);
});

test('a withheld source keeps listing rows only: no recommendation, quotation, note, text pointer or file', () => {
  const c = COMMISSION(), out = redactCommission(c, policyOf([entry({ source: ROBODEBT }, 'legal_order')]));
  for (const d of [...out.reports, ...out.transcripts]) { assert.deepEqual(Object.keys(d).sort(), LISTING); assert.equal(d.withheld.label, 'Withheld: subject to a legal order'); }
  assert.deepEqual([out.recommendations, out.court_context, out.notes, out.commissioners, out.established], [[], [], [], [], null]);
  const text = JSON.stringify(out);
  for (const leaked of [c.recommendations[0].text, c.established.quote, '/transcripts/', '.pdf', 'sha256']) assert.ok(!text.includes(leaked), leaked);
});

for (const use of ['search_only', 'documents_only']) test(`a ${use} source carries no quotation, recommendation or text pointer`, () => {
  const out = redactCommission(COMMISSION(), policyOf([], { [ROBODEBT]: use }));
  assert.equal(out.use, use);
  assert.deepEqual(out.recommendations, []);
  for (const d of [...out.reports, ...out.transcripts]) { assert.equal(d.full_text, undefined); assert.equal(d.date_quote, undefined); assert.ok(d.files.length); }
  assert.equal(out.established.quote, undefined);
  assert.equal(out.established.date, COMMISSION().established.date);
});

// ---- quoting and excerpt tools: royal_commissions, transcript text, and what Ask is handed

async function tools(data) {
  const built = await build({ stdin: { contents: "export {callTool, askToolSpecs} from './src/tools/index'; export {textIndex, textMatches, pageHits} from './src/tools/transcript-text';", resolveDir: new URL('../', import.meta.url).pathname, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', write: false, plugins: [withPolicy(data)] });
  return importBundle(built.outputFiles[0].text, 'source-policy-tools');
}
const cache = new Map();
async function asset(path) {
  if (path.startsWith('/report-records/')) return existsSync(join(PUBLIC, path)) ? json(path) : null;
  if (!cache.has(path)) cache.set(path, json(path));
  return cache.get(path);
}
const env = { asset, origin: 'https://opax.test' };
/** A transcript the published policy quotes, and a word that finds it. */
const SUBJECT = (() => {
  const ix = json('transcripts/index.json'), row = ix.docs.find(d => d.commission === ROBODEBT && d.quote_policy === 'quote');
  const doc = json(row.file.slice(1)), common = new Set(ix.common_terms);
  // A word no other transcript holds, so the search result is this transcript alone.
  const shard = term => { let h = 0x811c9dc5; for (const byte of new TextEncoder().encode(term)) h = Math.imul(h ^ byte, 0x01000193) >>> 0; return String(h % ix.shards).padStart(2, '0'); };
  const word = Object.keys(doc.terms).find(t => /^[a-z]{7,}$/.test(t) && !common.has(t) && doc.terms[t].length === 1 && json(`transcripts/terms/${shard(t)}.json`)[t]?.length === 1);
  const page = doc.pages.find(p => p.n === doc.terms[word][0]);
  return { key: row.key, date: row.date, word, pdf: row.pdf_url, phrase: page.text.replace(/\s+/g, ' ').split(' ').slice(3, 9).join(' ') };
})();
const everyView = async (api, commission, ask) => {
  const out = [];
  for (const args of [{ view: 'list', commission }, { view: 'profile', commission }, { view: 'transcripts', commission, limit: 8 }, { view: 'transcripts', commission, words: SUBJECT.word, limit: 8 },
    { view: 'recommendations', commission }, { view: 'recommendations', commission, words: 'debt' }, { view: 'transcripts', commission, words: SUBJECT.date, limit: 8 }]) out.push(await api.callTool(env, 'royal_commissions', args, ask));
  return out;
};

test('with the published policy the tool quotes the transcript (the control for the tests below)', async () => {
  const api = await tools(policyData());
  const out = await api.callTool(env, 'royal_commissions', { view: 'transcripts', commission: ROBODEBT, words: SUBJECT.word, limit: 8 });
  const row = out.rows.find(r => r.key === SUBJECT.key);
  assert.ok(row?.text_matches?.hits[0].excerpt, JSON.stringify(out).slice(0, 400));
  assert.ok((await api.textMatches(env, await api.textIndex(env), ROBODEBT, SUBJECT.word)).keys.has(SUBJECT.key));
});

test('a withheld transcript: the tool, the text search and Ask show the listing row with its label and no text', async () => {
  const api = await tools(policyData([entry({ document: `${ROBODEBT}/${SUBJECT.key}` })]));
  const ix = await api.textIndex(env);
  assert.ok(!(await api.textMatches(env, ix, ROBODEBT, SUBJECT.word))?.keys.has(SUBJECT.key));
  assert.equal(await api.pageHits(env, ix, SUBJECT.key, [SUBJECT.word]), null);
  for (const ask of [false, true]) {
    const results = await everyView(api, ROBODEBT, ask), text = JSON.stringify(results);
    assert.ok(!text.includes(SUBJECT.pdf) && !text.includes(SUBJECT.phrase), 'no file link and no words of the transcript');
    const rows = results.flatMap(r => r.rows).filter(r => r.key === SUBJECT.key);
    assert.ok(rows.length);
    for (const row of rows) assert.deepEqual(Object.keys(row).sort(), ['commission', 'commission_id', 'date', 'key', 'label', 'page_url', 'title', 'withheld']);
    assert.equal(rows[0].withheld, "Withheld at the publisher's request");
    assert.ok(results.flatMap(r => r.citations).some(c => c.text.includes("Withheld at the publisher's request") && !/"/.test(c.text)));
  }
  // What Ask's writer is handed is the same citations: none carries the transcript's words.
  const spec = api.askToolSpecs.find(s => s.name === 'royal_commissions');
  const handed = await spec.run({ asset, origin: env.origin, toolEnv: {} }, { view: 'transcripts', commission: ROBODEBT, words: SUBJECT.word, limit: 8 });
  assert.ok(!JSON.stringify(handed).includes(SUBJECT.phrase) && !JSON.stringify(handed).includes(SUBJECT.pdf));
});

test('a withheld source: every view is listing rows and the label; no recommendation, finding, note or excerpt', async () => {
  const c = json(`royal-commissions/commission-${ROBODEBT}.json`).commission;
  const api = await tools(policyData([entry({ source: ROBODEBT }, 'legal_order')]));
  assert.equal(await api.textMatches(env, await api.textIndex(env), ROBODEBT, SUBJECT.word), null);
  for (const ask of [false, true]) {
    const results = await everyView(api, ROBODEBT, ask), text = JSON.stringify(results);
    for (const leaked of [c.recommendations[0].text.slice(0, 60), c.recommendations.at(-1).text.slice(0, 60), SUBJECT.phrase, '.pdf', "in the commission's own words", 'text_matches', 'text_url']) assert.ok(!text.includes(leaked), leaked);
    assert.ok(text.includes('Withheld: subject to a legal order'));
    const profile = results[1].rows[0];
    assert.deepEqual([profile.recommendations, profile.notes, profile.withheld], [0, [], 'Withheld: subject to a legal order']);
    assert.ok(results[2].rows.length && results[2].rows.every(r => r.withheld && !r.pdf_url && !r.pages));
    assert.deepEqual(results[4].rows, []);
  }
});

for (const use of ['search_only', 'documents_only']) test(`a ${use} source is never excerpted, quoted or handed to Ask as text`, async () => {
  const c = json(`royal-commissions/commission-${ROBODEBT}.json`).commission;
  const api = await tools(policyData([], { [ROBODEBT]: use }));
  const ix = await api.textIndex(env);
  assert.equal(await api.textMatches(env, ix, ROBODEBT, SUBJECT.word), null);
  assert.equal(await api.pageHits(env, ix, SUBJECT.key, [SUBJECT.word]), null);
  for (const ask of [false, true]) {
    const results = await everyView(api, ROBODEBT, ask), text = JSON.stringify(results);
    for (const leaked of [c.recommendations[0].text.slice(0, 60), SUBJECT.phrase, "in the commission's own words", 'text_matches', 'text_url', 'hearing turn']) assert.ok(!text.includes(leaked), leaked);
    assert.equal(results[1].rows[0].use, use);
    assert.ok(results[3].rows.every(r => !r.text_matches));
  }
});

// ---- the knowledge base boundary: Ask retrieval, search, the resource API and MCP read_record

const resource = (slug, source, extra = {}) => ({ id: slug.replace(/\D/g, '').padStart(32, '0'), slug, title: `Title of ${slug}`, origin: { url: `https://publisher.example/${slug}`, source_id: 'opax-parli', collaborators: ['A Speaker'] },
  usermetadata: { classifications: [{ labelset: 'kind', label: 'speech' }, { labelset: 'source', label: source }, { labelset: 'party', label: 'Party' }] },
  extra: { metadata: { date: '2026-11-09', person_id: '9', word_count: 400 } }, summary: 'SECRET SUMMARY',
  data: { texts: { body: { value: { body: 'SECRET BODY TEXT of the record.' } }, 'da-summary-t-body': { value: { body: 'SECRET BRIEF' } } } },
  fields: { '/t/body': { paragraphs: { p1: { text: 'SECRET PARAGRAPH' } } } }, ...extra });
const CLOSED = {
  'a withheld source': policyOf([entry({ source: 'vic_hansard' }, 'legal_order')]),
  'a withheld document': policyOf([entry({ document: 'speech-2' })]),
  'a search-only source': policyOf([], { vic_hansard: 'search_only' }),
  'a documents-only source': policyOf([], { vic_hansard: 'documents_only' }),
};
const found = () => ({ resources: { r1: resource('speech-1', 'nsw_hansard'), r2: resource('speech-2', 'vic_hansard') }, best_matches: ['r1/t/body/0-10', 'r2/t/body/0-10'] });

for (const [name, policy] of Object.entries(CLOSED)) {
  test(`${name}: a search or retrieval response loses the resource and its matches`, () => {
    for (const path of ['/find', '/search', '/catalog']) {
      const out = scrubKbPayload(path, found(), policy);
      assert.deepEqual(Object.keys(out.resources), ['r1']);
      assert.deepEqual(out.best_matches, ['r1/t/body/0-10']);
      assert.ok(!JSON.stringify(out).includes('speech-2'));
    }
  });

  test(`${name}: a generated answer that drew on the resource is not passed on`, () => {
    const out = scrubKbPayload('/ask', { answer: 'An answer quoting SECRET BODY TEXT.', citations: { 'r2/t/body/0-10': [[0, 5]] }, retrieval_results: found() }, policy);
    assert.equal(out.answer, '');
    assert.deepEqual(out.citations, {});
    assert.ok(!JSON.stringify(out).includes('speech-2') && !out.answer.includes('SECRET'));
    const open = scrubKbPayload('/ask', { answer: 'A fine answer.', retrieval_results: { resources: { r1: resource('speech-1', 'nsw_hansard') } } }, policy);
    assert.equal(open.answer, 'A fine answer.');
  });

  test(`${name}: a record read is a listing row, through the Worker's own response guard`, async () => {
    const res = await guardKbResponse('/slug/speech-2?show=basic&show=values', Response.json(resource('speech-2', 'vic_hansard')), policy);
    const row = await res.json();
    assert.deepEqual(Object.keys(row).sort(), ['extra', 'id', 'origin', 'slug', 'title', 'usermetadata', 'withheld']);
    assert.ok(!JSON.stringify(row).includes('SECRET') && !JSON.stringify(row).includes('A Speaker'));
    assert.deepEqual(row.origin, { url: 'https://publisher.example/speech-2', source_id: 'opax-parli' });
    assert.ok(row.withheld.label);
    const open = await (await guardKbResponse('/slug/speech-1?show=basic', Response.json(resource('speech-1', 'nsw_hansard')), policy)).json();
    assert.equal(open.data.texts.body.value.body, 'SECRET BODY TEXT of the record.');
  });
}

test('a query never asks for a withheld source or document, and a withheld read never asks for text', () => {
  const policy = policyOf([entry({ source: 'vic_hansard' }, 'legal_order'), entry({ document: 'speech-2' }), entry({ document: `${ROBODEBT}/day-1` })]);
  const nots = [{ not: { prop: 'label', labelset: 'source', label: 'vic_hansard' } }, { not: { prop: 'origin_source', id: 'vic_hansard' } }, { not: { prop: 'resource', slug: 'speech-2' } }];
  const kind = { prop: 'label', labelset: 'kind', label: 'speech' };
  for (const path of ['/find', '/ask', '/search']) {
    assert.deepEqual(guardKbRequest(path, { query: 'q', filter_expression: { field: kind } }, policy).body.filter_expression, { field: { and: [kind, ...nots] } });
    assert.deepEqual(guardKbRequest(path, { query: 'q' }, policy).body.filter_expression, { field: { and: nots } });
  }
  assert.deepEqual(guardKbRequest('/catalog', { filter_expression: { resource: kind } }, policy).body.filter_expression, { resource: { and: [kind, ...nots] } });
  assert.equal(guardKbRequest('/slug/speech-2?show=basic&show=values&show=extracted&extracted=text', undefined, policy).target, '/slug/speech-2?show=basic&show=origin&show=extra');
  assert.equal(guardKbRequest('/slug/speech-3?show=values', undefined, policy).target, '/slug/speech-3?show=values');
  // The published policy withholds nothing, so no query changes today.
  const body = { query: 'q', filter_expression: { field: kind } };
  assert.equal(guardKbRequest('/find', body).body, body);
});

test('a tool row or citation naming a withheld record is reduced to its title and label', () => {
  const policy = policyOf([entry({ document: 'speech-2' }, 'withdrawn')]);
  const out = guardToolResult({ rows: [{ slug: 'speech-1', excerpt: 'kept' }, { record_id: 'speech-2', title: 'A title', excerpt: 'SECRET', speaker: 'A Speaker' }],
    citations: [{ url: 'https://opax.test/doc/speech-1', text: 'kept' }, { url: 'https://opax.test/doc/speech-2', text: 'SECRET' }], notes: [] }, policy);
  assert.deepEqual(out.rows, [{ slug: 'speech-1', excerpt: 'kept' }, { record_id: 'speech-2', title: 'A title', withheld: 'Withheld: withdrawn by the publisher' }]);
  assert.deepEqual(out.citations, [{ url: 'https://opax.test/doc/speech-1', text: 'kept' }]);
});

test('the resource API, which MCP read_record and the record page read, serves a closed record as a listing row', async () => {
  assert.match(readFileSync(new URL('../src/community-mcp.ts', import.meta.url), 'utf8'), /read_record[^\n]+\/api\/resource\//, 'read_record reads the resource API');
  for (const [name, data] of Object.entries({ 'a withheld document': policyData([entry({ document: 'speech-2' })]), 'a withheld source': policyData([entry({ source: 'vic_hansard' }, 'legal_order')]),
    'a search-only source': policyData([], { vic_hansard: 'search_only' }) })) {
    const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, PUBLIC, { plugins: [withPolicy(data)] });
    globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
    const asked = [];
    globalThis.fetch = async input => { const url = String(input.url ?? input); asked.push(url); return Response.json(resource(/speech-\d/.exec(url)[0], 'vic_hansard')); };
    const res = await worker.fetch('/api/resource/speech-2?nocache=1');
    assert.equal(res.status, 200, name);
    const row = await res.json();
    assert.deepEqual(Object.keys(row).sort(), ['labels', 'metadata', 'slug', 'speaker', 'speaker_attribution', 'summary', 'text', 'title', 'topics', 'url', 'withheld'], name);
    assert.deepEqual([row.text, row.summary, row.speaker, row.topics, row.labels, row.metadata], ['', null, null, [], { kind: 'speech' }, { date: '2026-11-09' }], name);
    assert.equal(row.url, 'https://publisher.example/speech-2');
    assert.ok(row.withheld.label && !JSON.stringify(row).includes('SECRET'), name);
    if (name === 'a withheld document') assert.ok(asked.every(u => !/show=values|extracted/.test(u)), 'the text is never requested');
  }
});

// ---- the builds: published files, transcript text, the search catalogue and report records

test('the published files already honour the policy (what `npm run check` asserts)', () => {
  assert.deepEqual(applySourcePolicy({ check: true }), []);
});

test('applying a takedown rewrites the public record and removes the transcript text, index row and postings', () => {
  const root = mkdtempSync(join(tmpdir(), 'opax-policy-'));
  try {
    for (const dir of ['royal-commissions', 'transcripts']) cpSync(join(PUBLIC, dir), join(root, dir), { recursive: true });
    const read = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
    const before = read('transcripts/index.json'), row = before.docs.find(d => d.key === SUBJECT.key);
    const postings = () => readdirSync(join(root, 'transcripts/terms')).flatMap(n => Object.values(read('transcripts/terms/' + n))).flat();
    assert.ok(postings().includes(row.i));
    const policy = policyOf([entry({ document: `${ROBODEBT}/${SUBJECT.key}` }, 'legal_order')]);
    const changed = applySourcePolicy({ root, policy, check: true });
    assert.ok(changed.includes(row.file.slice(1)) && changed.includes(`royal-commissions/commission-${ROBODEBT}.json`));
    assert.ok(existsSync(join(root, row.file.slice(1))), '--check writes nothing');
    applySourcePolicy({ root, policy });
    assert.ok(!existsSync(join(root, row.file.slice(1))));
    const after = read('transcripts/index.json');
    assert.deepEqual(after.docs[row.i], { i: row.i, withheld: true });
    assert.equal(after.docs.length, before.docs.length);
    assert.ok(!postings().includes(row.i));
    assert.equal(after.commissions[ROBODEBT].counts.transcripts, before.commissions[ROBODEBT].counts.transcripts - 1);
    const c = read(`royal-commissions/commission-${ROBODEBT}.json`).commission, held = c.transcripts.find(t => t.key === SUBJECT.key);
    assert.deepEqual(Object.keys(held).sort(), LISTING);
    assert.equal(held.withheld.label, 'Withheld: subject to a legal order');
    const manifest = read('royal-commissions/manifest.json');
    for (const [name, f] of Object.entries(manifest.files)) assert.equal(createHash('sha256').update(readFileSync(join(root, 'royal-commissions', name))).digest('hex'), f.sha256, name);
    assert.deepEqual(applySourcePolicy({ root, policy, check: true }), [], 'applying twice changes nothing');
    // A whole source: its text directory and its index entry go too.
    applySourcePolicy({ root, policy: policyOf([entry({ source: ROBODEBT })]) });
    const gone = read('transcripts/index.json');
    assert.ok(!existsSync(join(root, 'transcripts', ROBODEBT)) && !(ROBODEBT in gone.commissions) && !gone.docs.some(d => d.commission === ROBODEBT));
    assert.equal(read('royal-commissions/index.json').commissions.find(r => r.id === ROBODEBT).withheld.reason, 'publisher_request');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the search catalogue keeps a withheld record as a title and label, with nothing searchable', () => {
  const policy = policyOf([entry({ document: 'bill-text-au-federal-example' }), entry({ source: ROBODEBT }, 'legal_order')]);
  assert.equal(catalogWithheld('bill-text:x', { slug: 'bill-text-au-federal-example' }, policy).label, "Withheld at the publisher's request");
  assert.equal(catalogWithheld(`official-report:royal-commission-${ROBODEBT}`, { slug: `royal-commission-${ROBODEBT}` }, policy).label, 'Withheld: subject to a legal order');
  assert.equal(catalogWithheld('person:Example', { slug: '' }, policy), null);
  assert.equal(catalogWithheld(`official-report:royal-commission-${VIC}`, { slug: `royal-commission-${VIC}` }), null);
  const source = readFileSync(new URL('../../scripts/build_search_catalog.mjs', import.meta.url), 'utf8');
  assert.match(source, /const held = catalogWithheld\(key, extra\);\s+if\(held\) \{ text=''; extra=\{[^\n]+withheld:held\.label\}; \}/, 'add() blanks the snippet, aliases and every other field');
});

test('a report record built from a withheld report has no summary, quotation or recommendation', async () => {
  const report = json(`royal-commissions/commission-${ROBODEBT}.json`).commission.reports[0];
  const policy = policyOf([entry({ document: `${ROBODEBT}/${report.key}` })]);
  const read = async path => { const data = json(path.slice(1)); return path === `/royal-commissions/commission-${ROBODEBT}.json` ? { ...data, commission: redactCommission(data.commission, policy) } : data; };
  const all = await projectReports(read), built = all.find(r => r.row.slug === `royal-commission-${ROBODEBT}`), open = (await projectReports(async path => json(path.slice(1)))).find(r => r.row.slug === `royal-commission-${ROBODEBT}`);
  assert.ok(open.detail.summary && open.detail.record.recommendations.length, 'the control: the published record has a summary and recommendations');
  assert.equal(built.detail.summary, undefined);
  assert.deepEqual(built.detail.record.recommendations, []);
  assert.equal(built.detail.record.reports[0].withheld.label, "Withheld at the publisher's request");
  // This report has no landing page and its commission no site on record, so the publisher link is the file's own address; nothing else of the file is kept.
  assert.deepEqual(built.detail.record.reports[0].files, []);
  assert.ok(!JSON.stringify(built.detail).includes(report.files[0].sha256));
});

// ---- item 1: nothing of this commission's transcripts is reachable

const QUOTES = /["“”]/;
const strings = (value, out = []) => { if (typeof value === 'string') out.push(value); else if (value && typeof value === 'object') for (const v of Object.values(value)) strings(v, out); return out; };

test('the tool, in Ask and in the MCP, returns only listing fields and OPAX-worded notes for the commission', async () => {
  const api = await tools(policyData());
  const c = json(`royal-commissions/commission-${VIC}.json`).commission;
  // Every string the record holds: titles, dates, links, the rights note and OPAX's notes. Anything else would be new text.
  const known = new Set(strings(c));
  for (const ask of [false, true]) {
    const results = await everyView(api, VIC, ask);
    for (const r of results) assert.equal(r.error, undefined);
    assert.equal(results[2].rows.length, 2);
    for (const row of results[2].rows) {
      assert.deepEqual(Object.keys(row).sort(), ['commission', 'commission_id', 'date', 'date_basis', 'hearing', 'key', 'label', 'order_notes', 'page_url', 'pages', 'pdf_url', 'publisher_redacted', 'rights', 'title']);
      for (const s of strings({ ...row, label: '', date_basis: '' })) assert.ok(known.has(s) || s === c.id || c.notes.some(n => n.startsWith(s.replace(/…$/, ''))), s);
    }
    assert.deepEqual(results[3].rows, [], 'a word search finds no text: none is indexed');
    assert.equal(results[1].rows[0].use, 'documents_only');
    assert.equal(results[1].rows[0].recommendations, 0);
    assert.deepEqual(results[1].rows[0].commissioners, [{ name: c.commissioners[0].name, role: 'Commissioner', source_url: c.commissioners[0].cite.url, page: 1 }]);
    const said = strings(results.map(r => ({ rows: r.rows, citations: r.citations })));
    for (const s of said) assert.ok(!QUOTES.test(s), 'no quotation: ' + s);
    assert.ok(!said.some(s => /text_matches|hearing turn|transcript page \S+ \(PDF page/.test(s)));
  }
});

test('no file under public holds text of the commission\'s transcripts', () => {
  const c = json(`royal-commissions/commission-${VIC}.json`).commission;
  assert.equal(c.use, 'documents_only');
  for (const s of strings(c)) assert.ok(!QUOTES.test(s), s);
  for (const t of c.transcripts) { assert.equal(t.date_quote, undefined); assert.equal(t.full_text, undefined); }
  assert.ok(c.commissioners.every(p => p.quote === undefined));
  const ix = json('transcripts/index.json');
  assert.ok(!(VIC in ix.commissions) && !ix.docs.some(d => d.commission === VIC) && !existsSync(join(PUBLIC, 'transcripts', VIC)));
  // Built outputs (present after `npm run build:release`): the report record and the search catalogue rows for the commission.
  const record = join(PUBLIC, 'report-records', `royal-commission-${VIC}.json`);
  if (existsSync(record)) {
    const detail = JSON.parse(readFileSync(record, 'utf8'));
    assert.equal(detail.summary, undefined);
    assert.deepEqual(detail.facts, []);
    assert.deepEqual(detail.record, c, 'the report record is the public record, unchanged');
    for (const s of strings({ ...detail, record: null, caveats: null })) assert.ok(!QUOTES.test(s), s);
  }
  const manifest = join(PUBLIC, 'search-catalog', 'manifest.json');
  const version = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).version : '', dir = join(PUBLIC, 'search-catalog', version);
  if (version && existsSync(dir)) {
    const rows = readdirSync(dir).filter(n => /^records-\d+\.json$/.test(n)).flatMap(n => { const shard = JSON.parse(readFileSync(join(dir, n), 'utf8')); return Array.isArray(shard) ? shard : shard.records; }).filter(r => r && (JSON.stringify(r).includes(VIC) || String(r.title).includes('Major Public and Civil Infrastructure')));
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0].title, rows[0].snippet, rows[0].href], [c.name, c.name, `/report/royal-commission-${VIC}`]);
  }
});

test('the knowledge base cannot hold the commission: every push path refuses it, and its use excludes it from model calls', () => {
  assert.ok(kbRefusal({ slug: 'any', usermetadata: { classifications: [{ labelset: 'source', label: VIC }] } }));
  assert.ok(kbRefusal({ slug: 'any', origin: { source_id: VIC } }));
  assert.equal(kbRefusal({ slug: 'speech-1', origin: { source_id: 'opax-parli' }, usermetadata: { classifications: [{ labelset: 'source', label: 'openaustralia' }] } }), null);
});
