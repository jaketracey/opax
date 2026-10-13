import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { computeElectorateGold } from '../../scripts/agentic_ask_electorates_gold.mjs';

async function load(entry, plugins = []) {
  const out = await build({ entryPoints: [new URL(entry, import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm', plugins });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
}
const { communityMcp } = await load('../src/community-mcp.ts');
const { tools, listTools, getTool, parseToolArgs, callTool, validToolIdentifier } = await load('../src/tools/index.ts');
const { runTool, TOOL_SPECS, validToolArgs } = await load('../src/agentic-tools.ts');
const { runAgentic, fallbackPlan, plannerPrompt } = await load('../src/agentic-ask.ts');
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Contract tests must never call production or generation'); };
test.after(() => { globalThis.fetch = originalFetch; });
const token = 'opax_' + 'A'.repeat(43);
const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(v => v.toString(16).padStart(2, '0')).join('');
const published = new Map();
async function asset(path) {
  assert.match(path, /^\/electorates\/(?:manifest\.json|releases\/[a-f0-9]+\/(?:index|el_[a-f0-9]+)\.json)$/);
  if (!published.has(path)) published.set(path, JSON.parse(await readFile(new URL('../public' + path, import.meta.url), 'utf8')));
  return structuredClone(published.get(path));
}
function fixture() {
  const state = { reads: 0, publicReads: 0, hits: 0, authorized: true };
  const env = {
    COMMUNITY_ENABLED: 'true', COMMUNITY_ORIGIN: 'https://opax.com.au',
    COMMUNITY_DB: { prepare(sql) {
      let args;
      return { bind(...values) { args = values; return this; },
        async first() {
          if (sql.startsWith('SELECT m.')) return state.authorized && args[0] === hash ? { id: 'fixture-member', key_id: 'fixture-key' } : null;
          if (sql.startsWith('INSERT INTO community_limits')) return { hits: ++state.hits };
          throw Error('Unexpected fixture SQL');
        }, async run() { return { success: true }; },
      };
    } },
    ASSETS: { async fetch(req) { state.reads++; return Response.json(await asset(new URL(req.url).pathname)); } },
  };
  async function send(method, params = {}, { headers = {}, payload } = {}) {
    return communityMcp(new Request('https://opax.com.au/mcp', {
      method: 'POST', headers: { authorization: 'Bearer ' + token, accept: 'application/json, text/event-stream', 'content-type': 'application/json', ...headers },
      body: payload ?? JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }), env, async () => { state.publicReads++; throw Error('Electorate calls must not retrieve speeches'); });
  }
  return { env, state, send };
}

test('MCP lists the registry schemas with examples beside all six existing tools', async () => {
  const f = fixture(), response = await f.send('tools/list');
  assert.equal(response.status, 200);
  const listed = (await response.json()).result.tools;
  assert.deepEqual(listed.map(t => t.name).sort(), ['contracts', 'corpus_coverage', 'declared_interests', 'electorates_rank', 'find_connections', 'find_records', 'grants', 'parliamentary_pay', 'person_quotes', 'read_grant_program', 'read_grant_recipient', 'read_record', 'search_records']);
  const entry = listed.find(t => t.name === 'electorates_rank'), expected = listTools()[0];
  assert.equal(entry.description, expected.description);
  const { $schema, ...schema } = entry.inputSchema;
  assert.deepEqual(schema, expected.inputSchema);
  assert.equal(entry.annotations.readOnlyHint, true);
  assert.equal(f.state.reads, 0);
  assert.equal(tools.length, 6);
  assert.deepEqual(TOOL_SPECS.find(t => t.name === 'electorates').input, getTool('electorates_rank').inputSchema);
  assert.ok(plannerPrompt().user.includes(getTool('electorates_rank').description));
});

test('bad registry input returns JSON-RPC -32602 before any asset read', async () => {
  const f = fixture();
  for (const args of [{}, { indicator: 'invented' }, { indicator: 'median_age', limit: 0 }, { indicator: 'median_age', limit: 1.5 },
    { indicator: 'median_age', operation: 'lookup' }, { indicator: 'median_income', min: 700, max: 500 },
    { indicator: 'median_income', unknown: true }, { indicator: 'median_age', electorate: '   ' },
    ...['<script>alert(1)</script>', '../Fowler', 'Fowler\n', 'Fowler\u0000', 'A'.repeat(201)].map(electorate => ({ indicator: 'median_age', electorate })), []]) {
    const response = await f.send('tools/call', { name: 'electorates_rank', arguments: args });
    assert.equal(response.status, 200);
    const rpc = await response.json();
    assert.equal(rpc.error.code, -32602, JSON.stringify(args));
    assert.equal(rpc.result, undefined);
    assert.equal(validToolArgs('electorates', args), false);
    assert.throws(() => parseToolArgs('electorates_rank', args), error => error.code === -32602);
  }
  assert.equal(f.state.reads, 0);
});

test('the shared identifier validator accepts names, slugs and IDs and rejects markup and controls', () => {
  for (const name of ['Fowler', '  SAMPLE BAY  ', "O’Connor", 'St. George', 'Île Example', 'federal-representatives-nsw-fowler', 'el_c0ffee']) assert.equal(validToolIdentifier(name), true, name);
  for (const name of ['<script>alert(1)</script>', '../Fowler', 'Fowler\n', 'Fowler\t', 'Fowler\u0000', 'A'.repeat(201), '', '   ']) assert.equal(validToolIdentifier(name), false, name);
});

test('every registry module gets automatic name/slug/ID checks plus declared selectors, without restricting free text', async () => {
  const registry = await load('../src/tools/index.ts', [{ name: 'fixture-registry-module', setup(builder) {
    builder.onLoad({ filter: /\/src\/tools\/electorates\.ts$/ }, () => ({ loader: 'ts', contents: `
      export const tool = { name: 'fixture_select', description: 'Fixture selector contract',
        inputSchema: { type: 'object', additionalProperties: false, properties: {
          name: { type: 'string' }, slug: { type: 'string' }, record_id: { type: 'string' },
          electorate: { type: 'string' }, query: { type: 'string' }
        }, examples: [] }, identifierFields: ['electorate'], stepLabel: () => ({ label: 'Fixture' }),
        handler: async () => ({ rows: [], citations: [], notes: [] }) };
    ` }));
  } }]);
  for (const field of ['name', 'slug', 'record_id', 'electorate']) {
    assert.equal(registry.parseToolArgs('fixture_select', { [field]: 'O’Connor_el-123' })[field], 'O’Connor_el-123');
    for (const value of ['<script>alert(1)</script>', 'A'.repeat(201), 'Fowler\n']) {
      assert.throws(() => registry.parseToolArgs('fixture_select', { [field]: value }), error => error.code === -32602, field);
    }
  }
  assert.equal(registry.parseToolArgs('fixture_select', { query: '<script>quoted source text</script>' }).query, '<script>quoted source text</script>');
});

test('unknown published electorate names, slugs and IDs return -32602 on MCP and a failed Ask step', async () => {
  const f = fixture();
  for (const electorate of ['Unknown Electorate', 'federal-representatives-nsw-invented', 'el_doesnotexist']) {
    const args = { indicator: 'median_age', operation: 'lookup', electorate };
    const rpc = await (await f.send('tools/call', { name: 'electorates_rank', arguments: args })).json();
    assert.equal(rpc.error.code, -32602, electorate);
    assert.equal(rpc.result, undefined);
    assert.ok(!JSON.stringify(rpc).includes(electorate));
    await assert.rejects(callTool(f.env, 'electorates_rank', args), error => error.code === -32602);
    const ask = await runTool({ asset, kb: async () => { throw Error('No KB'); } }, 'electorates', args);
    assert.equal(ask.ok, false);
    assert.equal(ask.query, undefined);
  }
  const manifest = await asset('/electorates/manifest.json'), index = await asset(manifest.index_url);
  const seat = index.electorates.find(s => s.name === 'Fowler' && s.status === 'current' && s.jurisdiction === 'federal');
  for (const electorate of [seat.name, seat.slug, seat.electorate_id]) {
    const rpc = await (await f.send('tools/call', { name: 'electorates_rank', arguments: { indicator: 'median_income', electorate } })).json();
    assert.equal(rpc.result.structuredContent.rows[0].value, 521);
  }
});

for (const q of computeElectorateGold()) test(q.id + ': Ask tool step and MCP return identical gold data', async () => {
  const f = fixture(), plan = fallbackPlan(q.question), step = plan.steps[0];
  const deps = { origin: f.env.COMMUNITY_ORIGIN, asset, kb: async () => { throw Error('No KB calls allowed'); } };
  const ask = await runTool(deps, step.tool, step.args);
  const response = await f.send('tools/call', { name: 'electorates_rank', arguments: step.args });
  assert.equal(response.status, 200);
  const rpc = await response.json();
  assert.equal(rpc.result.isError, false);
  assert.deepEqual(rpc.result.structuredContent, ask.data);
  assert.deepEqual(JSON.parse(rpc.result.content[0].text), ask.data);
  assert.deepEqual(await callTool(f.env, 'electorates_rank', step.args), ask.data);
  const data = rpc.result.structuredContent;
  assert.equal(data.available, q.expected.available);
  assert.equal(data.matched, q.expected.matched);
  assert.deepEqual(data.rows.map(r => [r.name, r.value, r.unit, r.url]), q.expected.rows.map(r => [r.name, r.value, r.unit, r.url]));
  for (const [i, row] of data.rows.entries()) {
    assert.equal(data.citations[i].url, row.url);
    assert.equal(data.citations[i].value, row.value);
    assert.match(data.citations[i].text, /2021 Census \(ABS\)/);
  }
  const run = await runAgentic(q.question, { ...deps, generate: async () => { throw Error('Gold must never generate'); } });
  assert.equal(run.answered, !!q.expected.rows.length);
  assert.equal(run.events[0].label, 'Checking electorate data');
  assert.equal(f.state.publicReads, 0);
});

test('registry calls retain MCP auth, origin, rate and body-size protections', async () => {
  const f = fixture(), params = { name: 'electorates_rank', arguments: { indicator: 'median_income' } };
  assert.equal((await f.send('tools/call', params, { headers: { authorization: '' } })).status, 401);
  assert.equal((await f.send('tools/list', {}, { headers: { origin: 'https://evil.test' } })).status, 403);
  f.state.authorized = false;
  assert.equal((await f.send('tools/call', params)).status, 401);
  f.state.authorized = true;
  assert.equal((await f.send('tools/call', params, { payload: JSON.stringify({ padding: 'x'.repeat(17000) }) })).status, 413);
  f.state.hits = 60;
  assert.equal((await f.send('tools/call', params)).status, 429);
  assert.equal(f.state.reads, 0);
});

test('staging MCP citations use the same canonical pages as the Ask tool step', async () => {
  const f = fixture();
  f.env.COMMUNITY_ORIGIN = 'https://staging.opax.com.au';
  const args = { indicator: 'median_age', operation: 'lookup', electorate: 'Corangamite' };
  const ask = await runTool({ origin: 'https://opax.com.au', asset, kb: async () => { throw Error('No KB'); } }, 'electorates', args);
  const response = await f.send('tools/call', { name: 'electorates_rank', arguments: args });
  assert.deepEqual((await response.json()).result.structuredContent, ask.data);
});
