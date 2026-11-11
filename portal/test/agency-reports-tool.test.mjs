import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const built = await build({ stdin: { contents: "export {callTool, listTools, ToolInputError, TOOL_REGISTRY_VERSION} from './src/tools/index';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const savedFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Agency report tool tests must not make network requests'); };
test.after(() => { globalThis.fetch = savedFetch; });
const read = async path => JSON.parse(await readFile(new URL('../public' + path, import.meta.url), 'utf8'));
const cache = new Map();
async function asset(path) {
  assert.match(path, /^\/agency-reports\/[a-z0-9-]+\.json$/);
  if (!cache.has(path)) cache.set(path, await read(path));
  return cache.get(path);
}
const env = { asset, origin: 'https://opax.test' };
const index = await read('/agency-reports/index.json');
const factFiles = Object.fromEntries(await Promise.all(index.documents.filter(d => d.facts_file).map(d => d.facts_file).filter((v, i, a) => a.indexOf(v) === i).map(async f => [f, await read(f)])));
const allFacts = Object.values(factFiles).flatMap(f => f.facts);
const call = args => api.callTool(env, 'agency_reports', args);
function cited(out, requireRows = true) {
  assert.equal(out.error, undefined, JSON.stringify(out).slice(0, 500));
  if (requireRows) assert.ok(out.rows.length, JSON.stringify(out).slice(0, 500));
  assert.ok(out.citations.length);
  for (const c of out.citations) { assert.match(c.url, /^https:\/\//); assert.ok(c.text.length > 10); assert.doesNotMatch(c.text, /—/); }
  assert.ok(Buffer.byteLength(JSON.stringify(out)) <= 14000);
}
async function invalid(args) {
  let n = 0;
  await assert.rejects(() => api.callTool({ asset: async () => { n++; throw Error('No reads for invalid input'); } }, 'agency_reports', args), e => e instanceof api.ToolInputError && e.code === -32602);
  assert.equal(n, 0);
}

test('registry lists agency_reports under the bumped version', () => {
  assert.ok(Number(/^structured-tools-(\d+)-/.exec(api.TOOL_REGISTRY_VERSION)?.[1]) >= 15, api.TOOL_REGISTRY_VERSION);
  const tool = api.listTools().find(t => t.name === 'agency_reports');
  assert.ok(tool); assert.ok(tool.inputSchema.examples.length >= 3);
});

test('export shape: every figure has a page-anchored publisher link, a quote and a known metric', () => {
  assert.equal(index.meta.counts.documents, index.documents.length);
  assert.equal(index.meta.counts.facts, allFacts.length);
  const metrics = new Set(Object.keys(index.meta.metrics)), ids = new Set(index.documents.map(d => d.id));
  for (const f of allFacts) {
    assert.ok(metrics.has(f.metric), f.id); assert.ok(ids.has(f.report_id), f.id);
    assert.match(f.source_url, /^https:\/\/.+#page=\d+$/); assert.ok(f.quote && f.quote.length <= 320, f.id);
    assert.ok(f.quote.includes(String(f.value_as_published).trim().split(/\s+/)[0]) || f.value === null, f.id);
  }
  assert.equal(new Set(allFacts.map(f => f.id)).size, allFacts.length);
  for (const d of index.documents) {
    assert.match(d.source_url, /^https:\/\//);
    assert.equal(d.facts, allFacts.filter(f => f.report_id === d.id).length, d.id);
    assert.ok(['current', 'current_corrected', 'prior_edition', 'statutory_companion', 'statutory_return'].includes(d.edition), d.id);
    if (d.edition === 'prior_edition') assert.ok(d.edition_note, d.id);
    if (d.companion_of) assert.ok(ids.has(d.companion_of), d.id);
  }
});

test('Transparency Portal bodies carry operational figures only; integrity PDFs link to their integrity record', () => {
  const portal = new Set(index.documents.filter(d => d.portal_body_id).map(d => d.id));
  assert.ok(portal.size >= 3);
  const banned = new Set(['head_remuneration', 'named_remuneration', 'executive_band', 'executive_count', 'executive_remuneration_total', 'executive_average_remuneration', 'staff_fte', 'staff_headcount', 'total_expenses', 'total_income', 'employee_expenses', 'net_result', 'consultancy_total', 'consultancy']);
  for (const f of allFacts) if (portal.has(f.report_id)) assert.ok(!banned.has(f.metric), f.id);
  const linked = index.documents.filter(d => d.integrity_record);
  assert.ok(linked.length >= 3);
  for (const d of linked) assert.match(d.integrity_record.record_id, /^[a-z]+-[a-z0-9-]+$/);
});

test('facts for a named agency lead with pay and cite the PDF page', async () => {
  const out = await call({ view: 'facts', agency: 'Department of Premier and Cabinet', group: 'pay' });
  cited(out);
  assert.ok(out.rows.every(r => r.agency === 'Department of Premier and Cabinet'));
  assert.equal(out.rows[0].metric, 'head_remuneration');
  assert.match(out.citations[1].url, /#page=\d+$/);
  assert.match(out.citations[1].text, /page \d+, prints/);
});

test('an acronym with a jurisdiction prefix finds the agency', async () => {
  const out = await call({ view: 'documents', agency: 'NSW ICAC' });
  cited(out);
  assert.ok(out.rows.every(r => r.jurisdiction === 'NSW' && /Independent Commission Against Corruption/.test(r.agency)));
  const lecc = await call({ view: 'facts', agency: 'LECC', metric: 'head_remuneration' });
  cited(lecc);
  assert.ok(lecc.rows.every(r => r.agency === 'Law Enforcement Conduct Commission'));
});

test('a metric across a jurisdiction, and the no-match path names coverage', async () => {
  const out = await call({ view: 'facts', jurisdiction: 'vic', metric: 'staff_fte', limit: 10 });
  cited(out);
  assert.ok(out.rows.every(r => r.metric === 'staff_fte' && r.jurisdiction === 'Vic'));
  const none = await call({ view: 'facts', agency: 'Department of Silly Walks' });
  assert.deepEqual(none.rows, []); assert.match(none.notes.join(' '), /does not mean/);
});

test('editions, companions and unread scans are labelled', async () => {
  const docs = await call({ view: 'documents', agency: 'Independent Broad-based Anti-corruption Commission' });
  cited(docs);
  assert.equal(docs.rows[0].edition, 'prior_edition'); assert.ok(docs.rows[0].integrity_follow_up);
  const sa = await call({ view: 'documents', jurisdiction: 'SA' });
  assert.ok(sa.rows.some(r => r.companion_of)); assert.ok(sa.rows.some(r => r.companions));
});

test('figures read from a scan say so: OCR provenance on the row, the citation and the notes', async () => {
  const nt = await call({ view: 'documents', jurisdiction: 'NT' });
  cited(nt);
  assert.equal(nt.rows[0].status, 'read'); assert.equal(nt.rows[0].text_source, 'ocr');
  assert.match(nt.citations[1].text, /on-device OCR/);
  const facts = await call({ view: 'facts', jurisdiction: 'NT', metric: 'investigations_commenced' });
  cited(facts);
  assert.equal(facts.rows[0].extraction.method, 'ocr');
  assert.match(facts.citations[1].text, /scanned page, read by on-device OCR/);
  assert.match(facts.notes.join(' '), /from a scan/);
  const ai = await call({ view: 'facts', agency: 'NSW ICAC', query: 'assumed identity' });
  cited(ai);
  assert.ok(ai.rows.every(r => r.extraction && r.value === null));
});

test('coverage lists every jurisdiction held', async () => {
  const out = await call({ view: 'coverage' });
  cited(out);
  assert.deepEqual(out.rows.map(r => r.jurisdiction), Object.keys(index.meta.counts.by_jurisdiction));
});

test('consultancy rows keep the consultant and the figure as published', async () => {
  const out = await call({ view: 'facts', agency: 'Department of Energy, Environment and Climate Action', metric: 'consultancy', limit: 3 });
  cited(out);
  for (const r of out.rows) { assert.ok(r.counterparty); assert.ok(r.value_as_published); }
  assert.ok(out.total >= 100);
});

test('invalid input is refused before any read', async () => {
  await invalid({ view: 'documents', metric: 'staff_fte' });
  await invalid({ view: 'facts', metric: 'salary' });
  await invalid({ view: 'facts', year: '2025-2026' });
  await invalid({ view: 'nope' });
});
