import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const built = await build({ stdin: { contents: "export {callTool, listTools, ToolInputError, TOOL_REGISTRY_VERSION} from './src/tools/index';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const savedFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Integrity report tool tests must not make network requests'); };
test.after(() => { globalThis.fetch = savedFetch; });
const cache = new Map();
async function asset(path) {
  assert.match(path, /^\/integrity-reports\/[a-z0-9-]+\.json$/);
  if (!cache.has(path)) cache.set(path, JSON.parse(await readFile(new URL('../public' + path, import.meta.url), 'utf8')));
  return cache.get(path);
}
const env = { asset, origin: 'https://opax.test' };
const index = JSON.parse(await readFile(new URL('../public/integrity-reports/index.json', import.meta.url), 'utf8'));
const loaded = index.bodies.filter(b => b.status === 'loaded');
const files = Object.fromEntries(await Promise.all(loaded.map(async b => [b.code, JSON.parse(await readFile(new URL('../public' + b.file, import.meta.url), 'utf8'))])));
const call = args => api.callTool(env, 'integrity_reports', args);
function cited(out, requireRows = true) {
  assert.equal(out.error, undefined, JSON.stringify(out).slice(0, 500));
  if (requireRows) assert.ok(out.rows.length, JSON.stringify(out).slice(0, 500));
  assert.ok(out.citations.length);
  for (const c of out.citations) { assert.match(c.url, /^https:\/\//); assert.ok(c.text.length > 10); }
  assert.ok(Buffer.byteLength(JSON.stringify(out)) <= 14000);
  assert.ok(out.notes.some(n => /not findings|not a finding|not extracted|coverage|Counts are/.test(n)) || out.view === 'bodies');
}
async function invalid(args) {
  let n = 0;
  await assert.rejects(() => api.callTool({ asset: async () => { n++; throw Error('No reads for invalid input'); } }, 'integrity_reports', args), e => e instanceof api.ToolInputError && e.code === -32602);
  assert.equal(n, 0);
}
const withFindings = Object.values(files).flatMap(f => f.records).filter(r => r.findings.length);
const withRecs = Object.values(files).flatMap(f => f.records).filter(r => r.recommendations.length);

test('registry lists integrity_reports under the bumped version', () => {
  assert.ok(Number(/^structured-tools-(\d+)-/.exec(api.TOOL_REGISTRY_VERSION)?.[1]) >= 11, api.TOOL_REGISTRY_VERSION);
  const tool = api.listTools().find(t => t.name === 'integrity_reports');
  assert.ok(tool); assert.ok(tool.inputSchema.examples.length >= 3);
});

test('export shape: bodies, citations on every item, labels on every finding, gaps documented', () => {
  assert.ok(loaded.length >= 5, 'at least five commissions loaded');
  for (const b of index.bodies) {
    if (b.status === 'gap') { assert.ok(b.gaps.length && !b.file, b.code); continue; }
    const recs = files[b.code].records;
    assert.equal(recs.length, b.counts.records, b.code);
    for (const r of recs) {
      assert.match(r.page_url, /^https:\/\//);
      assert.ok(['investigation_report', 'special_report', 'public_inquiry_report', 'prevention_research_report', 'statement', 'other'].includes(r.report_type));
      if (r.findings.length) assert.equal(r.findings_status, 'extracted');
      for (const f of r.findings) { assert.ok(f.label && f.text, r.id); assert.match(f.cite.url, /^https:\/\//); assert.ok(f.cite.document); }
      for (const x of r.recommendations) { assert.ok(x.text, r.id); assert.match(x.cite.url, /^https:\/\//); }
      for (const s of r.subjects) assert.ok(['body', 'public_role'].includes(s.kind));
    }
  }
  assert.ok(index.bodies.some(b => b.code === 'nacc'), 'NACC is listed');
  const ids = index.reports.map(r => r.id); assert.equal(new Set(ids).size, ids.length);
  assert.ok(withFindings.length > 20 && withRecs.length > 50);
});

test('bodies: coverage and gaps by commission', async () => {
  const out = await call({ view: 'bodies', limit: 8 }); cited(out);
  assert.ok(out.rows.every(r => r.status === 'loaded' || r.gaps.length));
  const nacc = await call({ view: 'bodies', body: 'NACC' }); cited(nacc);
  assert.equal(nacc.rows[0].jurisdiction, 'Cth');
  assert.equal(nacc.rows[0].reports.length, 8);
  assert.deepEqual(nacc.rows[0].reports.find(r => r.operation === 'Operation Myrtleford').period.value, '2026-03');
  const nsw = await call({ view: 'bodies', body: 'NSW ICAC' }); cited(nsw);
  assert.equal(nsw.rows[0].reports, undefined);
});

test('WA opinions stated with a closing colon carry the matters that complete them', async () => {
  const wa = files.wa_ccc.records.flatMap(r => r.findings ?? []);
  assert.deepEqual(wa.filter(f => /:$/.test(f.text)).map(f => f.text), []);
  const blaine = wa.find(f => /on two matters:/.test(f.text));
  assert.match(blaine.text, /two matters: 1\. DSS Blaine's misuse of a State asset, a motor vehicle, in breach of policy; and 2\. DSS Blaine's repeated disclosure of confidential information\.$/);
  assert.equal(blaine.cite.page, 11);
});

test('reports: body and date filters, newest first, follow-up opens the full record', async () => {
  const body = loaded[0];
  const out = await call({ view: 'reports', body: body.short, limit: 4 }); cited(out);
  assert.ok(out.rows.every(r => r.body === body.short));
  const when = r => String(r.date ?? r.period?.value ?? '');
  for (let i = 1; i < out.rows.length; i++) assert.ok(when(out.rows[i - 1]) >= when(out.rows[i]));
  const detail = await call(out.rows[0].follow_up); cited(detail);
  assert.equal(detail.rows[0].record_id, out.rows[0].record_id);
  const since = await call({ view: 'reports', jurisdiction: body.jurisdiction, since: '2020-01-01', limit: 8 }); cited(since, false);
  // an undated report matches by the month or year its source gives, and says so
  assert.ok(since.rows.every(r => (r.date ?? r.period?.value) >= '2020' && (r.date ?? r.period?.value) && r.jurisdiction === body.jurisdiction));
  if (since.rows.some(r => !r.date)) assert.ok(since.notes.some(n => /month or year/.test(n)));
});

test('report: findings are quoted with label, kind and page citation; parts page through long lists', async () => {
  const r = withFindings[0];
  const out = await call({ view: 'report', record_id: r.id, part: 'findings', limit: 3 }); cited(out);
  const row = out.rows[0];
  assert.equal(row.part_total, r.findings.length);
  assert.equal(row.findings[0].text.slice(0, 40), r.findings[0].text.slice(0, 40));
  assert.equal(row.findings[0].label, r.findings[0].label);
  assert.match(out.citations[1].text, /\[(finding|opinion|no_finding|prosecution_statement|other)\]/);
  const rec = withRecs[0];
  const recs = await call({ view: 'report', record_id: rec.id, part: 'recommendations', limit: 2 }); cited(recs);
  assert.equal(recs.rows[0].part_total, rec.recommendations.length);
  if (rec.recommendations.length > 2) assert.equal(recs.rows[0].part_next_offset, 2);
});

test('report: a not-extracted list is reported as unknown, never as empty', async () => {
  const r = Object.values(files).flatMap(f => f.records).find(x => x.findings_status === 'not_extracted');
  if (!r) return;
  const out = await call({ view: 'report', record_id: r.id, part: 'findings' }); cited(out);
  assert.ok(out.notes.some(n => /unknown, not absent/.test(n)));
});

test('findings: search by kind and words across commissions, each a verbatim cited quote', async () => {
  const f = withFindings.find(r => r.findings.some(x => x.kind === 'finding' || x.kind === 'opinion'));
  const kind = f.findings.find(x => x.kind === 'finding' || x.kind === 'opinion').kind;
  const out = await call({ view: 'findings', body: f.body, finding_kind: kind, limit: 3 }); cited(out);
  assert.ok(out.rows.every(r => r.kind === kind));
  const all = files[f.body].records.flatMap(r => r.findings.filter(x => x.kind === kind).map(x => x.text.slice(0, 40)));
  for (const row of out.rows) assert.ok(all.includes(row.text.slice(0, 40)));
  assert.ok(out.notes.some(n => /statutory terms/.test(n)));
});

test('recommendations: words search returns only matching recommendation text', async () => {
  const out = await call({ view: 'recommendations', query: 'conflicts of interest', limit: 5 }); cited(out);
  assert.ok(out.rows.every(r => /conflict/i.test(r.text) && /interest/i.test(r.text)));
});

test('gap body: an empty answer says the commission is not loaded', async () => {
  if (!index.bodies.some(b => b.code === 'nacc' && b.status === 'gap')) return;
  const out = await call({ view: 'reports', body: 'NACC' });
  assert.equal(out.rows.length, 0); assert.ok(out.notes.some(n => /source gap/.test(n)));
});

test('manual publisher download: rows carry their acquisition and the partial-coverage note', async () => {
  const manual = Object.values(files).flatMap(f => f.records).filter(r => r.acquisition);
  if (!manual.length) return;
  for (const r of manual) { assert.match(r.acquisition, /manual publisher download/); assert.ok(r.documents.every(d => d.acquisition && d.sha256 && /^https:\/\//.test(d.url))); }
  const out = await call({ view: 'reports', body: manual[0].body, limit: 3 }); cited(out);
  assert.ok(out.rows.some(r => r.acquisition)); assert.ok(out.notes.some(n => /downloaded by hand/.test(n)));
  const none = manual.find(r => r.recommendations_status === 'stated_none');
  if (none) { const d = await call({ view: 'report', record_id: none.id, part: 'recommendations' }); cited(d); assert.ok(d.notes.some(n => /states it has no recommendations/.test(n))); }
  const annual = manual.filter(r => /annual report/i.test(r.title));
  for (const r of annual) { assert.equal(r.report_type, 'other'); assert.equal(r.findings.length, 0); }
});

test('unknown record id and unmatched body answer with coverage, not an error', async () => {
  const out = await call({ view: 'report', record_id: 'nsw-icac-1900-01-01-none' }); cited(out, false);
  const none = await call({ view: 'reports', body: 'Ruritania Commission' }); cited(none, false);
});

test('a named report carries its own findings and recommendations, within the payload limit', async () => {
  for (const r of [...withFindings, ...withRecs].slice(0, 40)) {
    const out = await call({ view: 'reports', operation: r.operation ?? undefined, query: r.operation ? undefined : r.title.split(/\s+/).slice(0, 6).join(' '), body: r.body });
    cited(out);
    const row = out.rows.find(x => x.record_id === r.id);
    if (!row || out.total > 2) continue;
    assert.ok(row.findings.length || row.recommendations.length, r.id);
    for (const it of [...row.findings, ...row.recommendations]) assert.ok(out.citations.some(c => c.text.includes(it.text.slice(0, 60))), r.id);
    if (r.findings.length) assert.equal(row.findings[0].label, r.findings[0].label);
  }
  const karamu = await call({ view: 'reports', query: 'Karamu' });
  cited(karamu);
  assert.equal(karamu.rows[0].record_id, 'tas-ic-2025-12-02-karamu');
  assert.ok(karamu.rows[0].findings.length >= 1 && karamu.notes.some(n => /More items/.test(n)));
});

test('record_id with view=findings or recommendations opens that report', async () => {
  const r = withRecs[0];
  const out = await call({ view: 'recommendations', record_id: r.id });
  cited(out);
  assert.equal(out.view, 'report');
  assert.equal(out.part, 'recommendations');
  assert.equal(out.rows[0].recommendations[0].text.slice(0, 80), r.recommendations[0].text.slice(0, 80));
});

test('IBAC: house code "vic" is accepted; Sandon carries the Government progress report as a response, not an IBAC report', async () => {
  const out = await call({ view: 'reports', operation: 'Operation Sandon', jurisdiction: 'vic' }); cited(out);
  assert.equal(out.rows.length, 1); assert.equal(out.rows[0].body, 'IBAC'); assert.equal(out.rows[0].report_type, 'special_report');
  assert.equal(out.rows[0].counts.responses, 1); assert.equal(out.rows[0].findings_status, 'not_extracted');
  const resp = await call({ view: 'report', record_id: out.rows[0].record_id, part: 'responses' }); cited(resp, false);
  assert.match(JSON.stringify(resp), /progress_report/); assert.match(JSON.stringify(resp), /manual publisher download/);
  assert.ok(resp.citations.some(c => /^Victorian Government published progress report/.test(c.text)), JSON.stringify(resp.citations));
});

test('invalid input is rejected before any read', async () => {
  await invalid({ view: 'report' });
  await invalid({ view: 'reports', record_id: 'nsw-icac-x' });
  await invalid({ view: 'bodies', record_id: 'nsw-icac-x' });
  await invalid({ view: 'reports', finding_kind: 'finding' });
  await invalid({ view: 'findings', since: '2024-05-01', until: '2023-01-01' });
  await invalid({ view: 'reports', report_type: 'media_release' });
  await invalid({ view: 'bodies', query: 'x y' });
});
