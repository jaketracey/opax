import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const built = await build({ stdin: { contents: "export {callTool, listTools, ToolInputError, TOOL_REGISTRY_VERSION} from './src/tools/index';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const savedFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Annual report tool tests must not make network requests'); };
test.after(() => { globalThis.fetch = savedFetch; });
const cache = new Map();
const reads = [];
async function asset(path) {
  assert.match(path, /^\/annual-reports\/[a-z0-9-]+\.json$/); reads.push(path);
  if (!cache.has(path)) cache.set(path, JSON.parse(await readFile(new URL('../public' + path, import.meta.url), 'utf8')));
  return cache.get(path);
}
const env = { asset, origin: 'https://opax.test' };
const index = JSON.parse(await readFile(new URL('../public/annual-reports/index.json', import.meta.url), 'utf8'));
const years = index.meta.counts.years;
const latest = years.at(-1), settled = years.at(-2);
function cited(out, requireRows = true) {
  assert.equal(out.error, undefined, JSON.stringify(out));
  if (requireRows) assert.ok(out.rows.length, JSON.stringify(out).slice(0, 500));
  assert.ok(out.citations.length);
  for (const c of out.citations) { assert.match(c.url, /^https:\/\//); assert.ok(c.text.length > 10); }
  assert.ok(Buffer.byteLength(JSON.stringify(out)) <= 14000);
}
const call = args => api.callTool(env, 'annual_reports', args);
async function invalid(args) {
  let n = 0;
  await assert.rejects(() => api.callTool({ asset: async () => { n++; throw Error('No reads for invalid input'); } }, 'annual_reports', args), e => e instanceof api.ToolInputError && e.code === -32602);
  assert.equal(n, 0);
}

test('registry lists annual_reports under the bumped version', () => {
  assert.match(api.TOOL_REGISTRY_VERSION, /annual-reports/);
  const tool = api.listTools().find(t => t.name === 'annual_reports');
  assert.ok(tool); assert.ok(tool.inputSchema.examples.length >= 3);
});

test('export shape: every KMP row resolves to a table with a body, licence and source codename', () => {
  assert.ok(index.bodies.length > 150); assert.ok(index.meta.counts.kmp_rows > 4000);
  for (const b of index.bodies) assert.ok(['NCE', 'CCE', 'CC'].includes(b.type) || b.id.startsWith('legacy_') && b.type === null, b.name);
  assert.ok(index.meta.counts.coverage.remuneration.includes('2018-19') && index.meta.counts.coverage.headline[0] === '2022-23');
});

test('remuneration: a department\'s key management personnel, highest first, with citations and detail', async () => {
  const out = await call({ view: 'remuneration', body: 'Department of Finance', year: settled, limit: 3 }); cited(out);
  assert.ok(out.rows.every(r => r.kind === 'kmp' && r.body === 'Department of Finance' && r.year === settled));
  for (let i = 1; i < out.rows.length; i++) assert.ok(out.rows[i - 1].total >= out.rows[i].total);
  const row = out.rows[0];
  for (const k of ['name', 'position', 'base_salary', 'superannuation', 'total', 'source_url', 'licence']) assert.ok(row[k] !== undefined, k);
  assert.match(row.source_url, /^https:\/\/previewapi\.transparency\.gov\.au\/delivery\/items\?system\.codename=[a-z0-9_]+&depth=1$/);
  assert.match(out.citations[1].text, /total remuneration \$[\d,]+/);
  const detail = await call(row.follow_up); cited(detail);
  assert.equal(detail.rows[0].record_id, row.record_id); assert.equal(detail.rows[0].total, row.total);
  assert.ok(Array.isArray(detail.rows[0].caveats));
});

test('remuneration: person search spans years and bodies; table total lines are never people', async () => {
  const out = await call({ view: 'remuneration', position: 'Chief Executive', min_total: 1000000, year: settled, limit: 8 }); cited(out);
  assert.ok(out.rows.every(r => r.total >= 1000000 && /chief executive/i.test(r.position)));
  const totals = await call({ view: 'remuneration', person: 'Total', year: settled, limit: 8 });
  assert.ok(totals.rows.every(r => !/^\s*totals?\b/i.test(r.name)));
});

test('bands: senior executive and highly paid bands carry counts and averages, not people', async () => {
  const out = await call({ view: 'bands', body: 'Department of Finance', year: settled, band_kind: 'senior_executives', limit: 3 }); cited(out);
  assert.ok(out.rows.every(r => r.kind === 'senior_executive_band' && typeof r.band === 'string' && 'count' in r));
  assert.match(out.notes.join(' '), /average/);
});

test('profile and compare: headline figures with units, and suspected scale errors left out of rankings', async () => {
  const profile = await call({ view: 'profile', body: 'Productivity Commission' }); cited(profile);
  assert.ok(profile.rows.every(r => r.body === 'Productivity Commission'));
  const flaggedRow = index.headline.find(h => h.consultancy?.scale_check && h.year === settled);
  const compare = await call({ view: 'compare', metric: 'consultancy_spend', year: settled, limit: 8 }); cited(compare);
  for (let i = 1; i < compare.rows.length; i++) assert.ok(compare.rows[i - 1].value >= compare.rows[i].value);
  assert.equal(compare.rows[0].unit, "$'000 GST inclusive");
  if (flaggedRow) {
    assert.ok(!compare.rows.some(r => r.record_id === flaggedRow.record_id));
    assert.match(compare.notes.join(' '), /dollars entered in a thousands-of-dollars field/);
  }
  const defaulted = await call({ view: 'compare', metric: 'ongoing_staff' }); cited(defaulted);
  assert.equal(defaulted.rows[0].year, settled);
});

test('suppliers: organisations paid, by ABN, with the unit stated', async () => {
  const out = await call({ view: 'suppliers', organisation: 'Deloitte', year: settled, limit: 3 }); cited(out);
  assert.ok(out.rows.every(r => /deloitte/i.test(r.organisation) && r.unit === "$'000 GST inclusive"));
  const abn = out.rows.find(r => r.abn)?.abn;
  if (abn) { const byAbn = await call({ view: 'suppliers', abn, year: settled, limit: 2 }); cited(byAbn); assert.ok(byAbn.rows.every(r => r.abn === abn)); }
});

test('empty results never claim absence', async () => {
  const none = await call({ view: 'remuneration', person: 'Zqxv Nobody', year: latest });
  assert.equal(none.error, undefined); assert.deepEqual(none.rows, []); assert.match(none.notes.join(' '), /does not establish/);
  const state = await call({ view: 'profile', body: 'Victoria Police' });
  assert.deepEqual(state.rows, []); assert.match(state.notes.join(' '), /State and territory agencies are not covered/);
  const old = await call({ view: 'remuneration', year: '2015-16' });
  assert.deepEqual(old.rows, []); assert.match(old.notes.join(' '), /no annual report data before 2018-19/);
  const noSuppliers = await call({ view: 'suppliers', organisation: 'Deloitte', year: '2019-20' });
  assert.deepEqual(noSuppliers.rows, []); assert.match(noSuppliers.notes.join(' '), /covered for 2020-21 to/);
  const noHeadline = await call({ view: 'profile', body: 'Department of Finance', year: '2019-20' });
  assert.deepEqual(noHeadline.rows, []); assert.match(noHeadline.notes.join(' '), /Headline figures .* 2022-23 to/);
});

test('older years come from the Portal data files, cited to the file and row, in each file\'s own unit', async () => {
  const out = await call({ view: 'remuneration', body: 'Department of Finance', year: '2020-21', limit: 2 }); cited(out);
  const row = out.rows[0];
  assert.match(row.source_url, /^https:\/\/previewapi\.transparency\.gov\.au\/delivery\/assets\/.+\.zip$/);
  assert.match(row.source_file, /key management personnel/i); assert.ok(Number.isInteger(row.source_row) && row.source_row > 2);
  assert.match(out.citations[1].text, /data file ".+", row \d+/);
  const detail = await call(row.follow_up); cited(detail); assert.equal(detail.rows[0].record_id, row.record_id); assert.equal(detail.rows[0].total, row.total);
  const dollars = await call({ view: 'suppliers', organisation: 'KPMG', year: '2020-21', limit: 2 }); cited(dollars);
  assert.ok(dollars.rows.every(r => r.unit === 'dollars GST inclusive' && 'expenditure_dollars' in r && !('expenditure_thousands' in r)));
  const thousands = await call({ view: 'suppliers', organisation: 'KPMG', year: '2021-22', limit: 2 }); cited(thousands);
  assert.ok(thousands.rows.every(r => r.unit === "$'000 GST inclusive" && 'expenditure_thousands' in r));
  const bands = await call({ view: 'bands', body: 'Department of Finance', year: '2018-19', band_kind: 'senior_executives', limit: 2 }); cited(bands);
  assert.ok(bands.rows.every(r => r.kind === 'senior_executive_band' && r.source_column > 1));
});

test('invalid inputs are refused before any read', async () => {
  await invalid({ view: 'remuneration', year: '2024-26' });
  await invalid({ view: 'compare' });
  await invalid({ view: 'profile' });
  await invalid({ view: 'suppliers', person: 'Jenny Wilkinson' });
  await invalid({ view: 'remuneration', record_id: 'tp-2024-25-21a3e6af359847f5a2f1026b58cf5f09', body: 'Finance' });
  await invalid({ view: 'remuneration', record_id: 'not-an-id' });
});

test('Ask and MCP return the same rows and citations for the same arguments', async () => {
  const ask = await build({ entryPoints: [new URL('../src/agentic-tools.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
  const { runTool, TOOL_SPECS } = await import('data:text/javascript;base64,' + Buffer.from(ask.outputFiles[0].text).toString('base64'));
  assert.ok(TOOL_SPECS.some(t => t.name === 'annual_reports'));
  for (const args of [
    { view: 'remuneration', body: 'Department of Finance', year: settled, limit: 2 },
    { view: 'compare', metric: 'total_expenses', year: settled, limit: 3 },
    { view: 'suppliers', organisation: 'KPMG', year: settled, limit: 2 },
  ]) {
    const mcp = await call(args);
    const viaAsk = await runTool({ ...env, kb: async () => { throw Error('No KB'); } }, 'annual_reports', args);
    assert.equal(viaAsk.ok, true, JSON.stringify(viaAsk).slice(0, 300));
    assert.deepEqual(viaAsk.data.rows.map(r => r.record_id), mcp.rows.map(r => r.record_id));
    assert.deepEqual([...new Set(viaAsk.cite.map(c => c.url))].sort(), [...new Set(mcp.citations.map(c => c.url))].sort());
  }
  const bad = await runTool({ ...env, kb: async () => { throw Error('No KB'); } }, 'annual_reports', { view: 'compare' });
  assert.equal(bad.ok, false);
});
