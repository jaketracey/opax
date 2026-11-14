import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { resource, speeches } from './fixtures/ask-person.mjs';

const compiled = await build({ stdin: { contents: "export {callTool, askToolSpecs, listTools, ToolInputError} from './src/tools/index'; export {communityMcp} from './src/community-mcp'; export {corpusKb} from './src/tools/corpus-records';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const savedFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Public record unit tests must not make network requests'); };
test.after(() => { globalThis.fetch = savedFetch; });
const cache = new Map();
async function asset(path) {
  assert.match(path, /^\/[a-zA-Z0-9./_-]+\.json$/);
  assert.ok(!path.includes('..'));
  if (!cache.has(path)) cache.set(path, JSON.parse(await readFile(new URL('../public' + path, import.meta.url), 'utf8')));
  return cache.get(path);
}
const assets = { async fetch(req) { try { return Response.json(await asset(new URL(req.url).pathname)); } catch (e) { if (e.code === 'ENOENT') return new Response('missing', { status: 404 }); throw e; } } };
const env = { asset, ASSETS: assets, origin: 'https://opax.test' };
function cited(out) {
  assert.equal(out.error, undefined, JSON.stringify(out));
  assert.ok(out.rows.length, JSON.stringify(out));
  assert.ok(out.citations.length >= out.rows.length);
  for (const c of out.citations) { assert.match(c.url, /^https?:\/\//); assert.ok(c.text.length > 10); }
  assert.ok(Buffer.byteLength(JSON.stringify(out)) <= 14000);
}
async function invalid(name, args) {
  let reads = 0;
  await assert.rejects(() => api.callTool({ asset: async () => { reads++; throw Error('No reads for invalid input'); }, kb: async () => { reads++; throw Error('No KB'); } }, name, args), e => e instanceof api.ToolInputError && e.code === -32602);
  assert.equal(reads, 0);
}

for (const [dataset, query] of [
  ['federal_budget', 'net debt'], ['sa_budget', 'operating balance'], ['tax_expenditures', 'election candidates'],
  ['government_finance', 'education'], ['advertising', 'campaign'], ['sa_grants', 'Aboriginal Legal Rights'], ['vic_gifts', 'Jacinta Allan'],
]) {
  test(dataset + ': real published rows, follow-up detail and original citations', async () => {
    const out = await api.callTool(env, 'public_finances', { dataset, query, limit: 2 });
    cited(out);
    for (const row of out.rows) assert.ok(!row.source_url.startsWith('https://opax.test'));
    const detail = await api.callTool(env, 'public_finances', out.rows[0].follow_up);
    cited(detail); assert.equal(detail.rows[0].record_id, out.rows[0].record_id);
    if (dataset === 'vic_gifts') { assert.equal(detail.rows[0].estimated_value, null); assert.equal(detail.rows[0].date, null); }
    if (dataset === 'sa_grants') assert.equal(detail.rows[0].amount, 19828);
    if (dataset === 'sa_budget') assert.match(detail.notes.join(' '), /2015-16/);
  });
  test(dataset + ': empty published selection', async () => {
    const out = await api.callTool(env, 'public_finances', { dataset, query: 'zqxunpublishedzz' });
    assert.equal(out.error, undefined); assert.deepEqual(out.rows, []); assert.deepEqual(out.citations, []); assert.match(out.notes.join(' '), /No published/);
  });
  test(dataset + ': invalid input before reads', () => invalid('public_finances', { dataset, financial_year: '2024-29' }));
}
test('public finance pagination, stale IDs, suppression markers and source-paper detail', async () => {
  const a = await api.callTool(env, 'public_finances', { dataset: 'sa_grants', limit: 1 });
  const b = await api.callTool(env, 'public_finances', { dataset: 'sa_grants', limit: 1, offset: a.next_offset });
  assert.notEqual(a.rows[0].record_id, b.rows[0].record_id);
  const stale = await api.callTool(env, 'public_finances', { dataset: 'sa_grants', record_id: 'v19990101000000-0' });
  assert.deepEqual(stale.rows, []);
  const raw = await asset('/tax-expenditures/data.json'), marker = raw.rows.find(r => r.value === null);
  const out = await api.callTool(env, 'public_finances', { dataset: 'tax_expenditures', query: marker.item_id, financial_year: marker.measure_year, limit: 8 });
  cited(out); assert.ok(out.rows.some(r => r.value === null && r.source_value === marker.source_value));
  const docs = await api.callTool(env, 'public_finances', { dataset: 'federal_budget', view: 'documents', limit: 1 });
  cited(docs); const detail = await api.callTool(env, 'public_finances', docs.rows[0].follow_up); cited(detail);
  await invalid('public_finances', { dataset: 'sa_budget', view: 'documents' });
});

for (const [kind, jurisdiction, query] of [['state_bill', 'act', 'Building and Construction'], ['state_bill', 'tas', 'Conversion Practices'], ['instrument', undefined, 'Housing Australia']]) {
  test('legislation ' + (jurisdiction ?? kind) + ': real metadata, stages and source citations', async () => {
    const out = await api.callTool(env, 'legislation', { kind, ...(jurisdiction ? { jurisdiction } : {}), query, limit: 1 });
    cited(out); const detail = await api.callTool(env, 'legislation', out.rows[0].follow_up); cited(detail);
    assert.equal(detail.rows[0].record_id, out.rows[0].record_id);
    if (kind === 'state_bill') { assert.ok(detail.rows[0].events.length); assert.equal(detail.rows[0].licence.text_allowed, false); assert.equal(detail.rows[0].text, undefined); }
    else { assert.equal(detail.rows[0].metadata_only, true); assert.ok(detail.rows[0].metadata.id); assert.match(detail.citations[0].url, /^https:\/\/www\.legislation\.gov\.au\//); }
  });
  test('legislation ' + (jurisdiction ?? kind) + ': empty result', async () => {
    const out = await api.callTool(env, 'legislation', { kind, ...(jurisdiction ? { jurisdiction } : {}), query: 'zqxunpublishedzz' });
    assert.equal(out.error, undefined); assert.deepEqual(out.rows, []); assert.deepEqual(out.citations, []);
  });
  test('legislation ' + (jurisdiction ?? kind) + ': invalid input', () => invalid('legislation', { kind, record_id: '../../private' }));
}
test('legislation rejects impossible dates and inconsistent record kinds', async () => {
  await invalid('legislation', { kind: 'state_bill', since: '2026-02-30' });
  await invalid('legislation', { kind: 'instrument', record_id: 'au-tas-2026-45' });
  const out = await api.callTool(env, 'legislation', { kind: 'instrument', since: '2026-01-01', until: '2026-12-31', limit: 1 });
  cited(out);
});

for (const [kind, query, record_id] of [['supplier', 'Thales'], ['agency', 'Defence'], ['connection', 'Woollahra'], ['tax_charity', undefined, '18151340608']]) {
  test('entity ' + kind + ': real profile and detail citations', async () => {
    const out = await api.callTool(env, 'entity_profile', { kind, ...(query ? { query } : { record_id }), limit: 1 });
    cited(out);
    if (query) { const detail = await api.callTool(env, 'entity_profile', out.rows[0].follow_up); cited(detail); assert.equal(detail.rows[0].record_id, out.rows[0].record_id); }
    else { assert.match(out.rows[0].kind, /corporate_tax/); assert.match(out.citations[0].url, /^https:\/\/data\.gov\.au\//); }
  });
  test('entity ' + kind + ': empty result', async () => {
    const out = await api.callTool(env, 'entity_profile', { kind, ...(kind === 'tax_charity' ? { record_id: '99999999999' } : { query: 'zqxunpublishedzz' }) });
    assert.equal(out.error, undefined); assert.deepEqual(out.rows, []);
  });
  test('entity ' + kind + ': invalid identifier', () => invalid('entity_profile', { kind, record_id: '../secrets' }));
}
test('supplier explicit funding links, contract section and connection evidence are paged and cited', async () => {
  const found = await api.callTool(env, 'entity_profile', { kind: 'supplier', query: 'Thales Australia Limited', limit: 1 });
  const record_id = found.rows[0].record_id;
  const receipts = await api.callTool(env, 'entity_profile', { kind: 'supplier', record_id, section: 'receipts', limit: 1 }); cited(receipts);
  assert.equal(receipts.rows[0].kind, 'receipt'); assert.match(receipts.citations[0].url, /aec\.gov\.au/);
  const contracts = await api.callTool(env, 'entity_profile', { kind: 'supplier', record_id, section: 'contracts', limit: 1 }); cited(contracts);
  assert.equal(contracts.rows[0].kind, 'contract'); assert.ok(contracts.rows[0].id.startsWith('CN'));
  const connection = await api.callTool(env, 'entity_profile', { kind: 'connection', record_id: '9711b04a397f288fa1502b1e', section: 'evidence', limit: 1 }); cited(connection);
  assert.match(connection.rows[0].excerpt, /Woollahra/); assert.equal(connection.next_offset, 1);
  const charity = await api.callTool(env, 'entity_profile', { kind: 'tax_charity', record_id: '12231938308' }); cited(charity);
  assert.ok(charity.rows.some(r => r.kind === 'charity_statement'));
});
test('connection profiles carry the day the connections run to, read from the published export', async () => {
  const meta = (await asset('/evidence/index.json')).meta;
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.parse(meta.generated_at));
  const found = await api.callTool(env, 'entity_profile', { kind: 'connection', query: 'Woollahra', limit: 1 });
  const evidence = await api.callTool(env, 'entity_profile', { kind: 'connection', record_id: '9711b04a397f288fa1502b1e', section: 'evidence', limit: 1 });
  for (const out of [found, evidence]) { assert.match(out.as_at, /^\d{4}-\d{2}-\d{2}$/); assert.equal(out.as_at, day); assert.equal(out.snapshot, meta.generated_at); }
  const supplier = await api.callTool(env, 'entity_profile', { kind: 'supplier', query: 'Thales', limit: 1 });
  assert.equal('as_at' in supplier, false, 'only connection profiles carry the connections date');
});
test('supplier grants join only on its published ABN, with original grant provenance', async () => {
  const directory = await asset('/suppliers.json'), grants = await asset('/graph/grants.federal.json');
  const recipients = new Set(grants.recipients.filter(r => !['person', 'individual', 'sole trader', 'aggregate', 'undisclosed'].includes(r.k)).map(r => r.id));
  const supplier = directory.suppliers.find(s => s.abn && recipients.has('abn:' + s.abn));
  assert.ok(supplier);
  const out = await api.callTool(env, 'entity_profile', { kind: 'supplier', record_id: supplier.id, section: 'grants', limit: 1 });
  cited(out); assert.equal(out.rows[0].kind, 'grant'); assert.ok(out.rows[0].source_scope); assert.ok(out.rows[0].full_record_url.includes(encodeURIComponent('abn:' + supplier.abn)));
});

const sourceText = 'Housing requires sustained public investment. I support building affordable homes and protecting renters.';
function corpusFixture({ kind = 'speech', text = sourceText, state = 'federal', chamber = 'senate', speaker_type, speaker = 'David Shoebridge', empty = false } = {}) {
  const r = resource({ ...speeches[0], slug: kind === 'speech' ? 'speech-1' : 'press-pmt-housing-2026', text, state, chamber, speaker, date: '2026-10-09' });
  r.usermetadata.classifications = r.usermetadata.classifications.filter(c => c.labelset !== 'kind');
  r.usermetadata.classifications.push({ labelset: 'kind', label: kind });
  if (speaker_type) r.usermetadata.classifications.push({ labelset: 'speaker_type', label: speaker_type });
  r.origin.url = state === 'sa' ? 'https://hansardsearch.parliament.sa.gov.au/fixture' : 'https://www.aph.gov.au/fixture-record';
  r.extra.metadata.person_id = speaker_type === 'witness' ? null : '11010';
  r.data.texts['da-summary-t-body'] = { value: { body: 'INVENTED MACHINE SUMMARY' } };
  const requests = [];
  return { requests, record: r, env: { ...env, kb: async (path, body) => { requests.push({ path, body }); return path === '/find' ? { resources: empty ? {} : { ['a'.repeat(32)]: r } } : r; } } };
}
for (const [label, options, args] of [
  ['Hansard', {}, { kind: 'speech', query: 'housing', speaker: 'David Shoebridge', since: '2026-10-01', until: '2026-10-10' }],
  ['release', { kind: 'press_release' }, { kind: 'press_release', query: 'housing' }],
  ['committee', { chamber: 'senate_committee', speaker_type: 'witness', speaker: 'Committee witness' }, { kind: 'speech', query: 'housing', venue: 'committee' }],
]) {
  test('corpus ' + label + ': checked original text, detail and citations', async () => {
    const fixture = corpusFixture(options), out = await api.callTool(fixture.env, 'corpus_records', args); cited(out);
    assert.equal(out.rows[0].excerpt, sourceText); assert.equal(out.rows[0].excerpt.includes('MACHINE'), false);
    assert.equal(out.citations[0].url, fixture.record.origin.url);
    const detail = await api.callTool(fixture.env, 'corpus_records', out.rows[0].follow_up); cited(detail);
    if (label === 'committee') assert.equal(out.rows[0].speaker, null);
    assert.ok(JSON.stringify(fixture.requests[0].body.filter_expression).includes('body'));
  });
  test('corpus ' + label + ': empty source selection', async () => {
    const fixture = corpusFixture({ ...options, empty: true }), out = await api.callTool(fixture.env, 'corpus_records', args);
    assert.equal(out.error, undefined); assert.deepEqual(out.rows, []); assert.deepEqual(out.citations, []);
  });
  test('corpus ' + label + ': invalid date before any read', () => invalid('corpus_records', { ...args, since: '2026-02-30' }));
}
test('corpus excludes another speaking turn, handles missing originals, and caps SA excerpts', async () => {
  const fixture = corpusFixture({ text: 'I acknowledge the chair.\n\nSenator Example: Housing policy is my concern.' });
  const out = await api.callTool(fixture.env, 'corpus_records', { kind: 'speech', query: 'housing', speaker: 'David Shoebridge' });
  assert.deepEqual(out.rows, []);
  const long = corpusFixture({ text: ('Housing investment helps renters and households. ').repeat(2000) });
  const detail = await api.callTool(long.env, 'corpus_records', { kind: 'speech', record_id: 'speech-1' }); cited(detail);
  assert.ok(detail.rows[0].next_text_offset > 0);
  const next = await api.callTool(long.env, 'corpus_records', { kind: 'speech', record_id: 'speech-1', text_offset: detail.rows[0].next_text_offset }); cited(next);
  assert.ok(next.rows[0].text_offset >= detail.rows[0].next_text_offset);
  const sa = corpusFixture({ state: 'sa', chamber: 'sa_lc', text: ('Housing investment helps renters and households. ').repeat(500) });
  const capped = await api.callTool(sa.env, 'corpus_records', { kind: 'speech', record_id: 'speech-1', text_offset: 4000 }); cited(capped);
  assert.ok(capped.rows[0].excerpt.split(/\s+/).length <= 120); assert.equal(capped.rows[0].next_text_offset, null); assert.equal(capped.rows[0].text_offset, 0);
  assert.match(capped.citations[0].url, /parliament\.sa\.gov\.au/);
});
test('unavailable originals and missing provenance are explicit, and unknown speakers cannot widen a search', async () => {
  const fixture = corpusFixture(), unavailable = { ...fixture.env, kb: async (path, body) => { if (path !== '/find') throw Error('Upstream down'); return fixture.env.kb(path, body); } };
  const failed = await api.callTool(unavailable, 'corpus_records', { kind: 'speech', query: 'housing' });
  assert.deepEqual(failed.rows, []); assert.equal(failed.partial, true);
  const detail = await api.callTool(unavailable, 'corpus_records', { kind: 'speech', record_id: 'speech-1' });
  assert.ok(detail.error); assert.deepEqual(detail.citations, []);
  fixture.record.origin.url = null;
  const noUrl = await api.callTool(fixture.env, 'corpus_records', { kind: 'speech', query: 'housing' }); cited(noUrl);
  assert.equal(noUrl.rows[0].source_url, null); assert.match(noUrl.rows[0].source_status, /not recorded/);
  const before = fixture.requests.length;
  const unknown = await api.callTool(fixture.env, 'corpus_records', { kind: 'speech', query: 'housing', speaker: 'Zqx Unknown Person' });
  assert.deepEqual(unknown.rows, []); assert.equal(fixture.requests.length, before);
  await invalid('corpus_records', { kind: 'speech', query: 'housing', text_offset: 0 });
});
test('unavailable and revoked public snapshots cannot become uncited facts', async () => {
  const missing = await api.callTool({ asset: async () => null }, 'public_finances', { dataset: 'sa_budget' });
  assert.ok(missing.error); assert.deepEqual(missing.rows, []); assert.deepEqual(missing.citations, []);
  const raw = structuredClone(await asset('/sa-grants/data.json'));
  for (const d of raw.documents) d.status = 'held';
  const held = await api.callTool({ asset: async () => raw }, 'public_finances', { dataset: 'sa_grants' });
  assert.deepEqual(held.rows, []); assert.deepEqual(held.citations, []);
});

test('shared data tools and moved Ask capabilities have identical schemas and payloads through authenticated MCP and Ask', async () => {
  const token = 'opax_' + 'B'.repeat(43), tokenHash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('hex');
  const fixture = corpusFixture();
  const readCorpus = fixture.env.kb;
  fixture.env.kb = async (path, body) => ['/catalog', '/search'].includes(path) ? { fulltext: { total: 4, facets: {} } } : readCorpus(path, body);
  const mcpEnv = { COMMUNITY_ENABLED: 'true', COMMUNITY_ORIGIN: 'https://opax.test', ASSETS: assets, ARAG_ZONE: 'test-zone', ARAG_KB_ID: 'fixture', ARAG_KB_TOKEN: 'fixture-token',
    COMMUNITY_DB: { prepare(sql) { let args; return { bind(...v) { args = v; return this; }, async first() { if (sql.startsWith('SELECT m.')) return args[0] === tokenHash ? { id: 'member', key_id: 'key' } : null; if (sql.startsWith('INSERT INTO community_limits')) return { hits: 1 }; throw Error('Unexpected SQL'); }, async run() { return { success: true }; } }; } } };
  const send = async (method, params) => (await api.communityMcp(new Request('https://opax.test/mcp', { method: 'POST', headers: { authorization: 'Bearer ' + token, accept: 'application/json, text/event-stream', 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }), mcpEnv, async () => { throw Error('Registry does not use legacy MCP tools'); })).json();
  const listed = (await send('tools/list', {})).result.tools;
  const mockFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /^https:\/\/test-zone\.rag\.progress\.cloud\//);
    assert.equal(new Headers(init.headers).get('x-nuclia-serviceaccount'), 'Bearer fixture-token');
    const path = new URL(url).pathname.includes('/slug/') ? '/slug/fixture' : '/' + new URL(url).pathname.split('/').at(-1);
    return Response.json(await fixture.env.kb(path, init.body ? JSON.parse(init.body) : undefined));
  };
  try {
    for (const [name, args] of [['legislation', { kind: 'state_bill', jurisdiction: 'tas', query: 'Conversion Practices', limit: 1 }], ['public_finances', { dataset: 'vic_gifts', entity: 'Jacinta Allan', limit: 1 }], ['entity_profile', { kind: 'tax_charity', record_id: '18151340608', limit: 1 }], ['corpus_records', { kind: 'speech', query: 'housing', limit: 1 }],
      ['count_speeches', { speaker: 'David Shoebridge', group_by: 'none' }], ['speech_trend', { from_year: 2025, to_year: 2026 }],
      ['find_people', { name: 'David Shoebridge' }], ['party_receipts', { party: 'Labor', limit: 2 }],
      ['find_quotes', { speaker: 'David Shoebridge', query: 'housing' }], ['member_votes', { person: 'David Shoebridge', keyword: 'housing' }],
      ['person_quotes', { person: 'David Shoebridge', topic: 'housing' }], ['search', { query: 'housing' }], ['read_passage', { record_id: 'speech-1' }], ['person_overview', { person: 'David Shoebridge' }],
      ['paid_answer', { question: 'What is the federal parliamentary base salary in 2025?' }], ['ranked_money', { question: 'Which federal parties have the largest disclosed receipt totals in 2024-25?' }],
    ]) {
      // Core tools are listed by name; these answer by name whether they are a query_register register or an unlisted earlier tool.
      assert.equal(listed.some(t => t.name === name), false, name);
      const rpc = await send('tools/call', { name, arguments: args });
      assert.equal(rpc.error, undefined, JSON.stringify(rpc));
      const ask = await api.askToolSpecs.find(t => t.name === name).run({ ...fixture.env, origin: 'https://opax.com.au' }, args);
      assert.deepEqual(rpc.result.structuredContent, ask.data, name);
      assert.equal(ask.ok, true, JSON.stringify(ask));
      assert.ok(Array.isArray(ask.data.rows));
      if (['legislation', 'public_finances', 'entity_profile', 'corpus_records'].includes(name)) cited(ask.data);
    }
    for (const name of ['legislation', 'public_finances', 'entity_profile', 'corpus_records']) assert.equal((await send('tools/call', { name, arguments: { unexpected: true } })).result.isError, true);
  } finally { globalThis.fetch = mockFetch; }
});
test('read-only KB adapter rejects arbitrary endpoints without a request', async () => {
  const kb = api.corpusKb({ ARAG_ZONE: 'test-zone', ARAG_KB_ID: 'fixture', ARAG_KB_TOKEN: 'fixture-token' });
  await assert.rejects(() => kb('/ask', { question: 'No generation' }), /Unsupported/);
  await assert.rejects(() => kb('/slug/../../secrets'), /Unsupported/);
});
