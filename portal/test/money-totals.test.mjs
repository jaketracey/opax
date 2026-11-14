import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
// MCP adds two fields that Ask's copy of a result does not carry: the record-text notice and a former-name note.
const mcpOnly = value => { if (!value || typeof value !== 'object' || Array.isArray(value)) return value; const { record_text_notice, deprecated, ...rest } = value; return rest; };

const built = await build({
  stdin: { contents: "export * from './src/tools/index';export { TOOL_SPECS, runTool } from './src/agentic-tools';export { communityMcp } from './src/community-mcp';export { inferPeriod, factSheet } from './src/agentic-ask';export { extractAskConstraints, constrainStep, guardToolPeriod } from './src/ask-constraints';export { writingFacts, renderFacts } from './src/research-writing';", resolveDir: new URL('../', import.meta.url).pathname },
  bundle: true, write: false, platform: 'node', format: 'esm', external: ['node:*'],
});
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Money unit tests must never call a public service.'); };
test.after(() => { globalThis.fetch = originalFetch; });

// Same node, edge and [AUD, receipt count] cells as public/graph/money.json.
// Party nodes cover the full cleaned register. Displayed donor edges cover only
// the graph's selected donors, so adding those edges is not a party total.
const node = (id, label, kind, byYear, extra = {}) => ({ id, label, kind, byYear,
  total: Object.values(byYear).reduce((sum, cell) => sum + cell[0], extra.undated?.[0] ?? 0),
  count: Object.values(byYear).reduce((sum, cell) => sum + cell[1], extra.undated?.[1] ?? 0), ...extra });
const edge = (source, target, byYear, extra = {}) => ({ source, target, byYear,
  total: Object.values(byYear).reduce((sum, cell) => sum + cell[0], 0),
  count: Object.values(byYear).reduce((sum, cell) => sum + cell[1], 0), ...extra });
const graph = {
  meta: { coverage: 'financial years 2016-17 to 2019-20', methodology: 'Top selected donors; party nodes include all cleaned receipts.', donor_nodes_by_total: 250 },
  nodes: [
    node('party:Labor', 'Labor', 'party', { 2016: [900, 2], 2017: [500, 5], 2018: [700, 7], 2019: [0, 1] }, { undated: [999999, 10] }),
    node('party:Liberal', 'Liberal', 'party', { 2017: [650, 3], 2018: [100, 2] }),
    node('party:Nationals', 'Nationals', 'party', { 2017: [600, 2], 2018: [200, 1] }),
    node('donor:alpha-holdings', 'Alpha Holdings', 'donor', { 2016: [10, 1], 2017: [300, 3], 2018: [100, 1] }, { aliases: ['Alpha Pty Ltd'], undated: [888888, 5] }),
    node('donor:beta-association', 'Beta Association', 'donor', { 2017: [250, 2], 2018: [300, 2] }),
    node('donor:gamma-example', 'Gamma Example', 'donor', { 2017: [400, 1] }),
    node('donor:older-disclosure', 'Older Disclosure', 'donor', { 2016: [90, 1] }),
    node('donor:zero-disclosure', 'Zero Disclosure', 'donor', { 2019: [0, 1] }),
    node('donor:smith-and-co', 'Smith & Co, Ltd', 'donor', { 2018: [1, 1] }),
    node('grantor:federal', 'Commonwealth grants', 'grantor', { 2017: [50000000, 5] }),
  ],
  edges: [
    edge('donor:alpha-holdings', 'party:Labor', { 2017: [120, 2], 2018: [100, 1] }),
    edge('donor:alpha-holdings', 'party:Liberal', { 2016: [10, 1], 2017: [180, 1] }),
    edge('donor:beta-association', 'party:Labor', { 2017: [200, 1], 2018: [250, 1] }),
    edge('donor:beta-association', 'party:Nationals', { 2017: [50, 1], 2018: [50, 1] }),
    edge('donor:gamma-example', 'party:Liberal', { 2017: [400, 1] }),
    edge('donor:older-disclosure', 'party:Labor', { 2016: [90, 1] }),
    edge('donor:zero-disclosure', 'party:Labor', { 2019: [0, 1] }),
    edge('donor:smith-and-co', 'party:Labor', { 2018: [1, 1] }),
    edge('grantor:federal', 'donor:alpha-holdings', { 2017: [50000000, 5] }, { grant: true }),
  ],
};
const env = { origin: 'https://opax.com.au', asset: async path => structuredClone(path === '/graph/money.json' ? graph : null) };
const call = args => api.callTool(env, 'money_totals', args);
const fy = value => String(value).replaceAll('–', '-');
function period(row, first, last = first) {
  assert.equal(typeof row.period, 'string');
  assert.ok(fy(row.period).includes(first), row.period);
  assert.ok(fy(row.period).includes(last), row.period);
}
function citation(result, index, total) {
  const cite = result.citations[index];
  assert.ok(cite, 'the aggregate has its own citation');
  assert.equal(cite.value, total);
  assert.ok(cite.text.includes(new Intl.NumberFormat('en-AU').format(total)), cite.text);
  assert.ok(fy(cite.text).includes(fy(result.rows[index].period)), cite.text);
  assert.doesNotMatch(cite.text, /\b\d{4}-\d{2}-\d{2}\b/);
  assert.match(cite.text, /1 July \d{4} to 30 June \d{4}/);
  assert.match(cite.url, /^https:\/\/opax\.com\.au\//);
}

test('party totals use the full party node, sum all requested FY cells and exclude undated money', async () => {
  const one = await call({ party: 'Labor', financial_year: '2017-18' });
  assert.equal(one.rows.length, 1);
  assert.equal(one.rows[0].party, 'Labor');
  assert.equal(one.rows[0].total_aud, 500);
  assert.equal(one.rows[0].receipts, 5);
  period(one.rows[0], '2017-18'); citation(one, 0, 500);
  const range = await call({ party: 'Labor', from_year: 2017, to_year: 2018 });
  assert.equal(range.rows.length, 1);
  assert.equal(range.rows[0].total_aud, 1200);
  assert.equal(range.rows[0].receipts, 12);
  period(range.rows[0], '2017-18', '2018-19'); citation(range, 0, 1200);
  assert.deepEqual((await call({ party: 'Labor', financial_year: '2017-2018' })).rows, one.rows);
});

test('party labels, aliases and IDs resolve to the same disclosed entity', async () => {
  const expected = (await call({ party: 'Nationals', financial_year: '2017-18' })).rows;
  for (const party of ['National Party', 'party:Nationals', 'nationals']) {
    assert.deepEqual((await call({ party, financial_year: '2017-18' })).rows, expected, party);
  }
  const donor = (await call({ donor: 'Alpha Holdings', financial_year: '2017-18' })).rows;
  for (const value of ['Alpha Pty Ltd', 'alpha-holdings', 'donor:alpha-holdings']) {
    assert.deepEqual((await call({ donor: value, financial_year: '2017-18' })).rows, donor, value);
  }
  assert.equal(donor[0].donor, 'Alpha Holdings');
  assert.equal(donor[0].total_aud, 300);
  assert.equal(donor[0].receipts, 3);
  for (const value of ['Smith & Co, Ltd', 'donor:smith-and-co']) {
    const punctuation = await call({ donor: value, financial_year: '2018-19' });
    assert.equal(punctuation.rows[0].donor, 'Smith & Co, Ltd');
    assert.equal(punctuation.rows[0].total_aud, 1);
  }
});

test('party and donor intersections sum matching flows rather than take the largest receipt', async () => {
  const out = await call({ party: 'Labor', donor: 'Alpha Pty Ltd', from_year: 2017, to_year: 2018 });
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].total_aud, 220);
  assert.equal(out.rows[0].receipts, 3);
  period(out.rows[0], '2017-18', '2018-19'); citation(out, 0, 220);
});

test('party ranking uses full totals and applies the limit after aggregation', async () => {
  const ranked = await call({ financial_year: '2017-18', group_by: 'party', limit: 2 });
  assert.deepEqual(ranked.rows.map(row => [row.party, row.total_aud, row.receipts]), [['Liberal', 650, 3], ['Nationals', 600, 2]]);
  for (const [i, row] of ranked.rows.entries()) citation(ranked, i, row.total_aud);
  const one = await call({ financial_year: '2017-18', group_by: 'party', limit: 1 });
  assert.deepEqual(one.rows, ranked.rows.slice(0, 1));
});

test('donor ranking sums every party and keeps Commonwealth grant edges out', async () => {
  const out = await call({ financial_year: '2017-18', group_by: 'donor', limit: 2 });
  assert.deepEqual(out.rows.map(row => [row.donor, row.total_aud, row.receipts]), [['Gamma Example', 400, 1], ['Alpha Holdings', 300, 3]]);
  assert.ok(out.notes.some(note => /published donor selection/i.test(note)), 'global donor rankings disclose their selected-donor coverage');
  assert.ok(out.notes.every(note => !/Party aggregates cover all cleaned rows/i.test(note)), 'global donor rankings must not claim full party-aggregate coverage');
  const labor = await call({ party: 'Labor', financial_year: '2017-18', group_by: 'donor', limit: 1 });
  assert.deepEqual(labor.rows.map(row => [row.donor, row.total_aud, row.receipts]), [['Beta Association', 200, 1]]);
  const parties = await call({ donor: 'Alpha Holdings', financial_year: '2017-18', group_by: 'party', limit: 1 });
  assert.deepEqual(parties.rows.map(row => [row.party, row.total_aud, row.receipts]), [['Liberal', 180, 1]]);
});

test('annual series uses FY starting years, preserving each full period total', async () => {
  const out = await call({ party: 'Labor', from_year: 2017, to_year: 2018, group_by: 'year' });
  assert.equal(out.rows.length, 2);
  assert.deepEqual(out.rows.map(row => [row.total_aud, row.receipts]), [[500, 5], [700, 7]]);
  period(out.rows[0], '2017-18'); period(out.rows[1], '2018-19');
  assert.ok(out.rows.every(row => row.year !== undefined), 'series rows carry a year');
});

test('complete FY date boundaries agree with starting-year ranges', async () => {
  const args = { party: 'Labor', from_year: 2017, to_year: 2018 };
  const expected = await call(args);
  const bounded = await call({ party: 'Labor', since: '2017-07-01', until: '2019-06-30' });
  assert.deepEqual(bounded.rows, expected.rows);
  assert.deepEqual((await call({ ...args, since: '2017-07-01', until: '2019-06-30' })).rows, expected.rows);
});

const namedLabor = { people: [], parties: ['Labor'], bills: [], ambiguous: false, unresolved: false };
async function constrainedAnswer(question, planned = { party: 'Labor', financial_year: '2017-18' }) {
  const period = api.inferPeriod(question);
  const constraints = api.extractAskConstraints(question, period, namedLabor);
  const properties = api.getTool('money_totals').inputSchema.properties;
  const step = api.constrainStep({ tool: 'money_totals', args: planned }, constraints, properties);
  api.parseToolArgs('money_totals', step.args);
  const raw = await api.runTool({ ...env, kb: async () => { throw Error('No KB calls.'); } }, step.tool, step.args);
  assert.equal(raw.ok, true, 'a supported registry call must not create an invalid-argument retry');
  const guarded = api.guardToolPeriod(raw, step, constraints);
  const sheet = api.factSheet([guarded]);
  const facts = api.writingFacts(undefined, sheet.facts, sheet.notes);
  const lines = api.renderFacts({ question, period, constraints, facts });
  return { period, constraints, step, raw, guarded, sheet, facts, lines };
}

test('Ask constraints, the period guard and writer preserve a single financial-year party total', async () => {
  for (const question of ['How much did Labor receive in FY2017-18?', 'How much did Labor receive from 1 July 2017 to 30 June 2018?']) {
    const out = await constrainedAnswer(question);
    assert.deepEqual([out.period.since, out.period.until], ['2017-07-01', '2018-06-30']);
    assert.equal(out.step.args.from_year, 2017);
    assert.equal(out.step.args.to_year, 2017, 'June 2018 still belongs to the FY starting in 2017');
    assert.equal(out.guarded.data.coverage_only, undefined);
    assert.equal(out.guarded.data.rows[0].total_aud, 500);
    assert.deepEqual([out.guarded.coverage.since, out.guarded.coverage.until], ['2017-07-01', '2018-06-30']);
    assert.deepEqual([out.guarded.coverage.available_since, out.guarded.coverage.available_until], ['2016-07-01', '2020-06-30']);
    assert.equal(out.sheet.facts.length, 1);
    assert.match(out.sheet.facts[0].text, /\$500/);
    assert.match(fy(out.sheet.facts[0].text), /2017-18/);
    const money = out.facts.flatMap(fact => fact.atoms ?? []).find(atom => atom.unit === 'AUD' && atom.value === '500');
    assert.ok(money, 'the writer receives the verified monetary claim');
    assert.equal(money.entity, 'Labor', 'the monetary claim retains the party that received it');
    assert.equal(fy(money.period.label ?? ''), '2017-18');
    assert.ok(out.lines.length, 'the aggregate remains usable by the writer');
    const firstSentence = out.lines[0].text.split(/(?<=[.!?])\s+/)[0];
    assert.match(firstSentence, /Labor.*\$500/);
    assert.match(fy(firstSentence), /2017-18/);
    assert.doesNotMatch(firstSentence, /\$1,200|\$999,999|2018-19/);
  }
});

test('a range total retains its owner and both financial-year boundaries in writer claims', async () => {
  const out = await constrainedAnswer('How much did Labor receive from FY2017-18 to FY2018-19?', { party: 'Labor', from_year: 2017, to_year: 2018 });
  assert.equal(out.guarded.data.rows[0].total_aud, 1200);
  const money = out.facts.flatMap(fact => fact.atoms ?? []).find(atom => atom.unit === 'AUD' && atom.value === '1200');
  assert.ok(money);
  assert.equal(money.entity, 'Labor');
  assert.deepEqual([money.period.since, money.period.until], ['2017-07-01', '2019-06-30']);
  assert.match(out.lines[0].text, /\$1,200/);
  assert.match(fy(out.lines[0].text), /2017-18 to 2018-19/);
});

test('calendar-year requests reach the handler and writer as plain FY coverage limits', async () => {
  const out = await constrainedAnswer('How much did Labor receive in calendar year 2017?');
  assert.deepEqual([out.step.args.since, out.step.args.until], ['2017-01-01', '2017-12-31']);
  assert.equal(out.step.args.from_year, undefined);
  assert.equal(out.step.args.to_year, undefined);
  assert.equal(out.raw.data.coverage_only, true);
  assert.equal(out.guarded.data.coverage_only, true);
  assert.ok(out.sheet.facts.length);
  const factText = out.sheet.facts.map(fact => fact.text).join(' ');
  assert.match(factText, /financial year/i);
  assert.doesNotMatch(JSON.stringify(out.sheet), /total_aud|\$/);
  assert.doesNotMatch(out.lines.map(line => line.text).join(' '), /\$/);
});

test('periods outside published coverage do not turn partial data into an exact total', async () => {
  for (const args of [{ party: 'Labor', financial_year: '2020-21' }, { party: 'Labor', from_year: 2015, to_year: 2018 }]) {
    const out = await call(args);
    assert.deepEqual(out.rows, []);
    assert.ok(out.notes.some(note => /cover|available/i.test(note)), out.notes.join(' '));
    assert.ok(out.citations.every(cite => cite.value === undefined), 'a coverage citation must not carry an invented zero');
  }
});

test('lifetime totals include their undated rows and disclose that annual series exclude them', async () => {
  const out = await call({ donor: 'Alpha Holdings' });
  assert.equal(out.rows[0].total_aud, 889298);
  assert.equal(out.rows[0].receipts, 10);
  assert.ok(out.notes.some(note => /undated/i.test(note)), out.notes.join(' '));
  const years = await call({ donor: 'Alpha Holdings', group_by: 'year' });
  assert.equal(years.rows.reduce((sum, row) => sum + row.total_aud, 0), 410);
  assert.ok(out.notes.some(note => /select|250|coverage/i.test(note)), 'donor totals disclose the graph selection');
});

test('no disclosure in a period stays distinct from a recorded zero', async () => {
  const absent = await call({ donor: 'Older Disclosure', financial_year: '2017-18' });
  assert.deepEqual(absent.rows, []);
  assert.ok(absent.notes.some(note => /no|not|missing|unavailable/i.test(note)), absent.notes.join(' '));
  for (const selector of [{ party: 'Unknown Party' }, { donor: 'Unknown Donor' }]) {
    const unknown = await call({ ...selector, financial_year: '2017-18' });
    assert.deepEqual(unknown.rows, []);
    assert.ok(unknown.notes.length);
  }
  const zero = await call({ donor: 'Zero Disclosure', financial_year: '2019-20' });
  assert.equal(zero.rows.length, 1);
  assert.equal(zero.rows[0].total_aud, 0);
  assert.equal(zero.rows[0].receipts, 1);
  citation(zero, 0, 0);
});

test('published Nationals and donor values reconcile to the real byYear cells', async () => {
  const published = JSON.parse(await readFile(new URL('../public/graph/money.json', import.meta.url), 'utf8'));
  const publishedEnv = { origin: env.origin, asset: async path => path === '/graph/money.json' ? structuredClone(published) : null };
  const party = published.nodes.find(row => row.id === 'party:Nationals');
  assert.ok(party?.byYear?.['2017'], 'published fixture contains the required financial year');
  const out = await api.callTool(publishedEnv, 'money_totals', { party: 'Nationals', financial_year: '2017-18' });
  assert.equal(out.rows[0].total_aud, party.byYear['2017'][0]);
  assert.equal(out.rows[0].receipts, party.byYear['2017'][1]);
  // A donor's figures are its typed cells (each receipt once, from the parties' own returns),
  // as on its donor page; its legacy byYear also holds its own declarations of the same gifts.
  const donor = published.nodes.find(row => row.kind === 'donor' && row.by_type_year?.['2017-18']);
  assert.ok(donor);
  const donated = await api.callTool(publishedEnv, 'money_totals', { donor: donor.label, from_year: 2017, to_year: 2018 });
  const typed = year => Object.values(donor.by_type_year[`${year}-${String(year + 1).slice(-2)}`] ?? {}).reduce((sum, cell) => sum + cell[0], 0);
  assert.equal(donated.rows[0].total_aud, typed(2017) + typed(2018));
});

const token = 'opax_' + 'M'.repeat(43);
const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(value => value.toString(16).padStart(2, '0')).join('');
function mcpFixture() {
  const state = { reads: 0 };
  const mcpEnv = {
    COMMUNITY_ENABLED: 'true', COMMUNITY_ORIGIN: env.origin,
    COMMUNITY_DB: { prepare(sql) { let args; return {
      bind(...values) { args = values; return this; },
      async first() {
        if (sql.startsWith('SELECT m.')) return args[0] === hash ? { id: 'member', key_id: 'key' } : null;
        if (sql.startsWith('INSERT INTO community_limits')) return { hits: 1 };
        throw Error('Unexpected fixture SQL');
      }, async run() { return { success: true }; },
    }; } },
    ASSETS: { async fetch(request) {
      state.reads++;
      const data = await env.asset(new URL(request.url).pathname);
      return data ? Response.json(data) : new Response('missing', { status: 404 });
    } },
  };
  async function send(method, params = {}) {
    const response = await api.communityMcp(new Request(env.origin + '/mcp', {
      method: 'POST', headers: { authorization: 'Bearer ' + token, accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }), mcpEnv, async () => { throw Error('Money tools must not query speeches.'); });
    assert.equal(response.status, 200);
    return response.json();
  }
  return { state, send };
}

test('money_totals shares its schema and aggregate JSON between Ask and the public MCP', async () => {
  const f = mcpFixture(), tool = api.getTool('money_totals');
  assert.ok(tool);
  // money_receipts is the listed tool; money_totals, the calculator behind it, still answers by name.
  const listed = (await f.send('tools/list')).result.tools.map(row => row.name);
  assert.ok(listed.includes('money_receipts') && !listed.includes('money_totals'));
  assert.deepEqual(api.TOOL_SPECS.find(row => row.name === 'money_totals').input, tool.inputSchema);
  assert.equal(f.state.reads, 0);
  const args = { party: 'Labor', financial_year: '2017-18' };
  const ask = await api.runTool({ ...env, kb: async () => { throw Error('No KB calls.'); } }, 'money_totals', args);
  const rpc = await f.send('tools/call', { name: 'money_totals', arguments: args });
  assert.equal(ask.ok, true);
  assert.equal(rpc.result.isError, false);
  assert.deepEqual(mcpOnly(rpc.result.structuredContent), ask.data);
  assert.deepEqual(mcpOnly(JSON.parse(rpc.result.content[0].text)), ask.data);
});

test('invalid FY arguments fail as a tool error before reading money data', async () => {
  const f = mcpFixture();
  for (const args of [
    { financial_year: '2017' }, { financial_year: '2017-19' }, { financial_year: '2017-2019' },
    { financial_year: '2017-18', from_year: 2018 }, { from_year: 2018, to_year: 2017 },
    { from_year: 2017.5 }, { financial_year: '2017-18', group_by: 'receipt' },
    { financial_year: '2017-18', limit: 0 }, { financial_year: '2017-18', limit: 21 },
    { financial_year: '2017-18', unexpected: true }, { financial_year: '2017-18', party: '   ' },
    { financial_year: '2017-18', donor: '<script>bad</script>' },
  ]) {
    assert.throws(() => api.parseToolArgs('money_totals', args), error => error.code === -32602, JSON.stringify(args));
    const rpc = await f.send('tools/call', { name: 'money_totals', arguments: args });
    assert.equal(rpc.result?.isError, true, JSON.stringify(args));
  }
  assert.equal(f.state.reads, 0);
});

test('industry rankings sum all selected flows before limiting, preserving period and excluding non-industries', async () => {
  const data = structuredClone(graph)
  data.nodes.find(n => n.id === 'donor:alpha-holdings').industry = 'mining'
  data.nodes.find(n => n.id === 'donor:beta-association').industry = 'mining'
  data.nodes.find(n => n.id === 'donor:gamma-example').industry = 'property'
  data.nodes.find(n => n.id === 'donor:older-disclosure').industry = 'property'
  data.nodes.find(n => n.id === 'donor:beta-association').associatedTag = 'Associated entity of Liberal'
  data.nodes.find(n => n.id === 'donor:beta-association').associatedWith = [{party:'Liberal'}]
  data.edges.push(edge('donor:beta-association','party:Liberal',{2017:[9999,1]}))
  const env = { asset: async () => data, origin: 'https://opax.com.au' }
  const result = await api.callTool(env, 'money_totals', { party: 'Liberal', financial_year: '2017-18', group_by: 'industry' })
  assert.deepEqual(result.rows.map(r => [r.industry,r.total_aud]), [['property',400],['mining',180]])
  assert.match(result.citations[0].text, /^Property led the classified industry ranking/)
  assert.match(result.citations[0].text, /2017-18/)
  for (const cite of result.citations) {
    assert.match(cite.text, /1 July 2017 to 30 June 2018/)
    assert.doesNotMatch(cite.text, /\b\d{4}-\d{2}-\d{2}\b/)
  }
  assert.equal(new URL(result.citations[0].url).searchParams.get('industry'),'property')
  const labor = await api.callTool(env, 'money_totals', { party: 'Labor', from_year: 2017, to_year: 2018, group_by: 'industry', limit: 1 })
  assert.equal(labor.rows[0].total_aud,670)
  assert.match(labor.notes.join(' '), /not every AEC receipt/)
  data.nodes.find(n => n.id === 'donor:gamma-example').industry = 'individual'
  assert.equal((await api.callTool(env, 'money_totals', { party:'Liberal',financial_year:'2017-18',group_by:'industry' })).rows[0].industry,'mining')
})
