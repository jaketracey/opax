import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const built = await build({ stdin: { contents: "export {callTool, listTools, ToolInputError, TOOL_REGISTRY_VERSION} from './src/tools/index'; export {runTool, TOOL_SPECS} from './src/agentic-tools';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const savedFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Royal commissions tool tests must not make network requests'); };
test.after(() => { globalThis.fetch = savedFetch; });
const cache = new Map();
async function asset(path) {
  assert.match(path, /^\/royal-commissions\/[a-z0-9-]+\.json$/);
  if (!cache.has(path)) cache.set(path, JSON.parse(await readFile(new URL('../public' + path, import.meta.url), 'utf8')));
  return cache.get(path);
}
const env = { asset, origin: 'https://opax.test' };
const index = JSON.parse(await readFile(new URL('../public/royal-commissions/index.json', import.meta.url), 'utf8'));
const fv = index.commissions.find(c => c.id === 'vic-family-violence');
function cited(out, requireRows = true) {
  assert.equal(out.error, undefined, JSON.stringify(out));
  if (requireRows) assert.ok(out.rows.length, JSON.stringify(out).slice(0, 500));
  assert.ok(out.citations.length);
  for (const c of out.citations) { assert.match(c.url, /^https:\/\//); assert.ok(c.text.length > 10); }
  assert.ok(Buffer.byteLength(JSON.stringify(out)) <= 14000);
}
const call = args => api.callTool(env, 'royal_commissions', args);
async function invalid(args) {
  let n = 0;
  await assert.rejects(() => api.callTool({ asset: async () => { n++; throw Error('No reads for invalid input'); } }, 'royal_commissions', args), e => e instanceof api.ToolInputError && e.code === -32602);
  assert.equal(n, 0);
}

test('registry lists royal_commissions under the bumped version', () => {
  assert.ok(Number(/^structured-tools-(\d+)-/.exec(api.TOOL_REGISTRY_VERSION)?.[1]) >= 12, api.TOOL_REGISTRY_VERSION);
  assert.ok(api.listTools().some(t => t.name === 'integrity_reports'));
  const tool = api.listTools().find(t => t.name === 'royal_commissions');
  assert.ok(tool); assert.ok(tool.inputSchema.examples.length >= 3);
  assert.ok(api.TOOL_SPECS.some(t => (t.name ?? t.function?.name) === 'royal_commissions'));
});

test('export shape: commissions carry cited reports, and every recommendation a page citation', async () => {
  assert.ok(index.commissions.length >= 8);
  assert.ok(index.meta.counts.recommendations >= 227);
  assert.ok(fv && fv.counts.recommendations === 227 && fv.counts.with_status > 200);
  for (const row of index.commissions) {
    const c = (await asset(row.file)).commission;
    assert.equal(c.id, row.id);
    for (const d of [...c.reports, ...c.responses, ...c.transcripts]) { assert.match(d.cite.url, /^https:\/\//); assert.ok(d.acquisition); }
    for (const r of c.recommendations) { assert.match(r.cite.url, /^https:\/\/.+\.pdf$/i); assert.ok(r.cite.page >= 1); assert.ok(r.text.length >= 20); }
    if (c.established) { assert.match(c.established.date, /^\d{4}-\d{2}-\d{2}$/); assert.ok(c.established.quote); }
  }
});

test('list: commissions by jurisdiction with counts and citations', async () => {
  const out = await call({ view: 'list', jurisdiction: 'Vic', limit: 8 }); cited(out);
  assert.ok(out.rows.every(r => r.jurisdiction === 'Victoria'));
  assert.ok(out.rows.some(r => r.id === 'vic-family-violence'));
});

test('house jurisdiction codes ("vic", "federal") are accepted as the dataset codes', async () => {
  const vic = await call({ view: 'list', jurisdiction: 'vic', limit: 8 }); cited(vic);
  assert.ok(vic.rows.every(r => r.jurisdiction === 'Victoria'));
  const cth = await call({ view: 'list', jurisdiction: 'federal', limit: 8 }); cited(cth);
  assert.ok(cth.rows.length && cth.rows.every(r => r.jurisdiction === 'Commonwealth'), JSON.stringify(cth.rows.map(r => r.jurisdiction)));
});

test('profile: one commission\'s reports, commissioners and responses, cited to the official copies', async () => {
  const out = await call({ view: 'profile', commission: 'family violence' }); cited(out);
  const row = out.rows[0];
  assert.equal(row.id, 'vic-family-violence');
  assert.ok(row.reports.length >= 1 && row.reports[0].page_url.startsWith('https://www.parliament.vic.gov.au/'));
  assert.ok(row.commissioners.length >= 1);
  assert.equal(row.recommendations, 227);
});

test('recommendations: words search returns verbatim text, page and published status', async () => {
  const out = await call({ view: 'recommendations', commission: 'vic-family-violence', words: 'information sharing', limit: 3 }); cited(out);
  for (const r of out.rows) { assert.match(r.text, /information.sharing/i); assert.ok(r.page >= 1); assert.match(r.source_url, /\.pdf$/); }
  assert.ok(out.total >= 3);
  const one = await call(out.rows[0].follow_up); cited(one);
  assert.equal(one.rows.length, 1); assert.equal(one.rows[0].number, out.rows[0].number);
  if (one.rows[0].status) { assert.ok(one.rows[0].status.as_published); assert.match(one.rows[0].status.source_url, /^https:\/\/www\.vic\.gov\.au\//); }
});

test('recommendations: an unknown status is null, never inferred', async () => {
  for (const row of index.commissions.filter(c => c.counts.recommendations && !c.counts.with_status)) {
    const out = await call({ view: 'recommendations', commission: row.id, limit: 2 }); cited(out);
    assert.ok(out.rows.every(r => r.status === null));
  }
});

test('compound numbers, manual supplements and inquiry types', async () => {
  const out = await call({ view: 'recommendations', commission: 'cth-robodebt', number: '23.1' }); cited(out);
  assert.equal(out.rows.length, 1); assert.equal(out.rows[0].number, '23.1');
  assert.match(out.rows[0].source_url, /^https:\/\/www\.royalcommission\.gov\.au\//);
  const prof = await call({ view: 'profile', commission: 'cth-robodebt' }); cited(prof);
  assert.match(prof.rows[0].reports[0].acquisition, /manual publisher download supplied by the OPAX maintainer/);
  const types = new Set(index.commissions.map(c => c.inquiry_type));
  for (const t of ['royal_commission', 'commission_of_inquiry', 'board_of_inquiry']) assert.ok(types.has(t));
});

test('a sitting commission lists hearing transcripts as documents, with no recommendations or findings', async () => {
  const out = await call({ view: 'profile', commission: 'vic-major-infrastructure' }); cited(out);
  const row = out.rows[0];
  assert.equal(row.reports.length, 0); assert.equal(row.recommendations, 0);
  assert.equal(row.transcripts.count, 2); assert.equal(row.transcripts.label, 'Hearing transcript: evidence, not findings');
  assert.deepEqual(row.transcripts.follow_up, { view: 'transcripts', commission: 'vic-major-infrastructure' });
  const listed = await call({ view: 'transcripts', commission: 'vic-major-infrastructure' }); cited(listed);
  assert.equal(listed.rows.length, 2);
  for (const t of listed.rows) { assert.ok(t.hearing); assert.equal(t.recommendations, undefined); assert.equal(t.label, 'Hearing transcript: evidence, not findings'); }
  assert.ok(row.reference_pages.some(p => p.url === 'https://www.rcimcp.vic.gov.au/hearing-block-1-9-20-november-2026'));
  assert.match(row.notes.join(' '), /evidence given to the commission, not findings/);
  assert.match(row.notes.join(' '), /Non-publication orders may be made/);
});

test('court rulings on a report travel with it, quoted from the official page', async () => {
  const out = await call({ view: 'profile', commission: 'act-criminal-justice' }); cited(out);
  const row = out.rows[0];
  assert.equal(row.inquiry_type, 'board of inquiry');
  const cc = row.reports[0].court_context;
  assert.equal(cc.length, 1); assert.match(cc[0].text, /Drumgold v Board of Inquiry & Ors \(No\. 3\)/);
  assert.equal(cc[0].source_url, 'https://www.act.gov.au/open/board-of-inquiry-into-the-criminal-justice-system');
  assert.ok(out.citations.some(c => /Court context/.test(c.text) && /Chapters 4, 5 and 6/.test(c.text)));
});

test('no match reports coverage instead of inventing a commission', async () => {
  const out = await call({ view: 'list', commission: 'zzzz nothing like this' }); cited(out, false);
  assert.equal(out.total, 0); assert.match(out.notes.join(' '), /not loaded|No royal commission/);
});

test('invalid input is rejected before any read', async () => {
  await invalid({ view: 'profile' });
  await invalid({ view: 'list', words: 'x y' });
  await invalid({ view: 'recommendations', number: '12' });
  await invalid({ view: 'nope' });
  await invalid({ view: 'recommendations', commission: 'family violence', number: 'twelve' });
  await invalid({ view: 'recommendations', commission: 'robodebt', number: '4.1.2' });
});

test('Ask and MCP run the same handler', async () => {
  const args = { view: 'recommendations', commission: 'vic-family-violence', number: '1' };
  const mcp = await call(args); cited(mcp);
  const ask = await api.runTool({ asset, kb: async () => { throw Error('no KB reads'); }, origin: 'https://opax.test', toolEnv: env }, 'royal_commissions', args);
  assert.equal(ask.ok, true, JSON.stringify(ask).slice(0, 400));
  assert.ok(ask.cite.length >= 2);
  assert.ok(JSON.stringify(ask.data).includes(mcp.rows[0].text.slice(0, 60)));
});

test('a commission with many transcripts keeps its profile within the payload limit and pages its transcripts', async () => {
  for (const id of ['cth-antisemitism', 'cth-robodebt', 'nsw-healthcare-funding']) {
    const out = await call({ view: 'profile', commission: id }); cited(out);
    assert.equal(out.truncated, undefined);
    assert.ok(out.rows[0].transcripts.count >= 47, id);
    assert.ok(out.rows[0].transcripts.newest.every(t => /^https:\/\//.test(t.pdf_url)));
  }
  const first = await call({ view: 'transcripts', commission: 'cth-robodebt', limit: 8 }); cited(first);
  assert.equal(first.total, 47); assert.equal(first.next_offset, 8);
  const dates = first.rows.map(r => r.date);
  assert.deepEqual(dates, [...dates].sort().reverse());
  const next = await call({ view: 'transcripts', commission: 'cth-robodebt', limit: 8, offset: 8 }); cited(next);
  assert.ok(next.rows.every(r => !first.rows.some(f => f.key === r.key)));
  for (const c of first.citations.slice(1)) assert.match(c.text, /Hearing transcript: evidence, not findings/);
  const march = await call({ view: 'transcripts', commission: 'cth-robodebt', words: '2023-03' }); cited(march);
  assert.ok(march.total >= 3 && march.rows.every(r => r.date.startsWith('2023-03')));
});

test('new inquiries load with their transcripts only, as listed documents', async () => {
  for (const id of ['nsw-healthcare-funding', 'qld-child-safety', 'sa-domestic-family-sexual-violence', 'tas-institutional-child-sexual-abuse', 'nt-hydraulic-fracturing']) {
    const c = (await asset(`/royal-commissions/commission-${id}.json`)).commission;
    assert.ok(c.transcripts.length >= 5, id); assert.equal(c.recommendations.length, 0);
    for (const t of c.transcripts) { assert.match(t.date, /^\d{4}-\d{2}-\d{2}$/); assert.equal(t.date_basis, 'stated'); assert.ok(t.date_quote); assert.ok(t.rights); assert.ok(!/\(PDF/.test(t.title), t.title); }
  }
});

test('transcripts view needs a commission and rejects recommendation filters', async () => {
  await invalid({ view: 'transcripts' });
  await invalid({ view: 'transcripts', commission: 'robodebt', number: '1' });
  await invalid({ view: 'transcripts', commission: 'robodebt', status: 'Implemented' });
});
