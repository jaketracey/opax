import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { MockLanguageModelV4 } from 'ai/test';

// Only the published table adapter is replaced. Registry, Ask and MCP use the
// same division implementation, and every asset read stays in this process.
globalThis.__divisionTableRows = [];
globalThis.__divisionTableQueries = [];
const fakeTables = { name: 'division-table-fixture', setup(builder) {
  builder.onResolve({ filter: /^\.\.\/table-api$/ }, () => ({ path: 'division-table-fixture', namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: `
    export async function tableApi(request) {
      const url = new URL(request.url), params = Object.fromEntries(url.searchParams);
      globalThis.__divisionTableQueries.push({ dataset: url.pathname.split('/').at(-1), params });
      let rows = globalThis.__divisionTableRows;
      for (const [name, field] of [['f.date', 'date'], ['f.house', 'house'], ['f.jurisdiction', 'jurisdiction']]) {
        if (params[name]) rows = rows.filter(row => JSON.parse(params[name]).includes(row[field]));
      }
      const words = String(params.q ?? '').toLowerCase().split(/\\s+/).filter(Boolean);
      rows = rows.filter(row => words.every(word => row.title.toLowerCase().includes(word)));
      const total = rows.length;
      rows = rows.slice(0, Number(params.pageSize) || 200);
      return Response.json({ rows, total, page: 1, pageSize: rows.length, facets: {} });
    }
  ` }));
} };
const built = await build({
  stdin: { contents: "export { callTool, getTool, listTools, parseToolArgs } from './src/tools/index'; export { divisionModelRows } from './src/tools/division'; export { runTool, TOOL_SPECS, validToolArgs } from './src/agentic-tools'; export { factSheet, plannerPrompt, runAgentic, inferPeriod } from './src/agentic-ask'; export { createResearch } from './src/research-loop'; export { createResearchCreditCooldown } from './src/research-credit'; export { writingPrompt } from './src/research-writing'; export { communityMcp } from './src/community-mcp';", resolveDir: new URL('../', import.meta.url).pathname },
  bundle: true, write: false, platform: 'browser', format: 'esm', plugins: [fakeTables], external: ['node:*'],
});
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Division unit tests must never call the network or generation'); };
test.after(() => { globalThis.fetch = originalFetch; });

const member = (name, party, vote) => ({ name, party, vote, person_id: name.toLowerCase().replaceAll(' ', '_'), person_slug: name.toLowerCase().replaceAll(' ', '-') });
const members = [
  ...Array.from({ length: 5 }, (_, i) => member(`Labor Member ${i + 1}`, 'Labor', 'aye')),
  member('Labor Rebel', 'Labor', 'no'),
  ...Array.from({ length: 5 }, (_, i) => member(`Liberal Member ${i + 1}`, 'Liberal', 'no')),
  member('Liberal Rebel', 'Liberal', 'aye'),
  ...Array.from({ length: 3 }, (_, i) => member(`Greens Member ${i + 1}`, 'Greens', 'aye')),
  member('Greens Minority', 'Greens', 'no'),
  ...Array.from({ length: 3 }, (_, i) => member(`Greens Paired ${i + 1}`, 'Greens', 'paired')),
  ...Array.from({ length: 5 }, (_, i) => member(`Independent Member ${i + 1}`, 'Independent', 'aye')),
  member('Independent Minority', 'Independent', 'no'),
  ...Array.from({ length: 5 }, (_, i) => member(`Unlabelled Aye ${i + 1}`, null, 'aye')),
  member('Unlabelled No', null, 'no'),
  ...Array.from({ length: 3 }, (_, i) => member(`Unity Aye ${i + 1}`, 'Unity', 'aye')),
  ...Array.from({ length: 3 }, (_, i) => member(`Unity No ${i + 1}`, 'Unity', 'no')),
];
const bill = { key: 'au-federal-r12345', title: 'Harbour Infrastructure Bill 2025', url: '/bill/au-federal-r12345' };
function division(overrides = {}) {
  const row = { key: 'federal-senate-100', date: '2025-08-28', name: bill.title + ' - second reading', house: 'senate', jurisdiction: 'federal',
    result: 'affirmative', members: structuredClone(members), bills: [bill], ...overrides };
  row.slug = 'division-' + row.key;
  row.ayes ??= row.members.filter(m => m.vote === 'aye').length;
  row.noes ??= row.members.filter(m => m.vote === 'no').length;
  row.source_url = `https://theyvoteforyou.org.au/divisions/${row.house}/${row.date}/${row.key.split('-').at(-1)}`;
  row._meta = { schema: 1, source: 'parli.db-ext-divisions', member_count: row.members.length, named_member_count: row.members.length,
    recorded_vote_count: row.members.filter(m => ['aye', 'no'].includes(m.vote)).length, member_coverage: 'recorded', ...overrides._meta };
  return row;
}
function summary(row) {
  const parties = new Map();
  for (const m of row.members) {
    const party = m.party ?? 'Unknown';
    const votes = parties.get(party) ?? {};
    votes[m.vote] = (votes[m.vote] ?? 0) + 1;
    parties.set(party, votes);
  }
  // Published index rows deliberately have no title or house.
  return { key: row.key, slug: row.slug, date: row.date, bills: row.bills, member_count: row.members.length,
    named_member_count: row.members.length, recorded_vote_count: row._meta.recorded_vote_count,
    member_coverage: row._meta.member_coverage, recorded_ayes: row.ayes, recorded_noes: row.noes,
    party_tallies: [...parties].map(([party, votes]) => ({ party, votes })), source: 'parli.db-ext-divisions',
    unknown_party_count: row.members.filter(m => !m.party).length };
}
function fixture(divisions = [division()]) {
  const reads = [], assets = {
    '/divisions/index.json': { count: divisions.length, divisions: divisions.map(summary), coverage: { division_count: divisions.length } },
    '/bills/index.json': { count: 1, bills: [{ ...bill, divisions: divisions.length, jurisdiction: 'federal' }] },
    [`/bills/${bill.key}.json`]: { ...bill, jurisdiction: 'federal', divisions: divisions.map(d => ({ key: d.key, house: d.house, date: d.date, question: d.name, ayes: d.ayes, noes: d.noes, outcome: d.result, url: d.source_url })) },
    ...Object.fromEntries(divisions.map(d => [`/divisions/${d.slug}.json`, d])),
  };
  globalThis.__divisionTableRows = divisions.map(d => ({ id: d.key, key: d.key, slug: d.slug, date: d.date, house: d.house, chamber: d.house, jurisdiction: d.jurisdiction, title: d.name, name: d.name, ayes: d.ayes, noes: d.noes }));
  globalThis.__divisionTableQueries.length = 0;
  const asset = async path => { reads.push(path); return structuredClone(assets[path] ?? null); };
  const deps = { origin: 'https://opax.com.au', asset, kb: async () => { throw Error('Division tools must not search speeches'); }, toolEnv: { TABLE_DB: {} } };
  const env = { asset, TABLE_DB: {}, origin: 'https://opax.com.au' };
  return { divisions, assets, reads, asset, deps, env };
}

test('division is a shared registry tool with planner guidance distinct from member_votes', () => {
  const definition = api.getTool('division');
  assert.ok(definition);
  assert.deepEqual(api.TOOL_SPECS.find(t => t.name === 'division').input, definition.inputSchema);
  assert.ok(api.listTools().some(t => t.name === 'division'));
  assert.ok(api.plannerPrompt().user.includes(definition.description));
  assert.match(definition.description, /outcome|passed|defeated/i);
  assert.match(definition.description, /floor.cross|against.*party/i);
  assert.match(api.TOOL_SPECS.find(t => t.name === 'member_votes').description, /across|aggregate|multiple|title.search|keyword/i);
});

test('invalid selectors, dates and aggregate scope are rejected before reading data', async () => {
  const f = fixture();
  for (const args of [
    {}, { chamber: 'senate' }, { person: 'Labor Rebel' }, { date: '2025-02-30' }, { date: '2025-08' },
    { date: '2025-08-28', chamber: 'upper' }, { since: '2025-12-31', until: '2025-01-01' },
    { title: '   ' }, { division_id: '../federal-senate-100' }, { date: '2025-08-28', person: 'Name\n' },
    { date: '2025-08-28', limit: 0 }, { date: '2025-08-28', limit: 21 }, { date: '2025-08-28', limit: 1.5 },
    { date: '2025-08-28', unknown: true }, { date: '2025-08-28', operation: 'invented' },
    { operation: 'floor_crossing', party: 'Labor' }, { operation: 'floor_crossing', since: '2025-01-01', person: 'Labor Rebel' },
    { operation: 'party_agreement', since: '2025-01-01', party: 'Labor' },
  ]) {
    assert.throws(() => api.parseToolArgs('division', args), error => error.code === -32602, JSON.stringify(args));
    assert.equal(api.validToolArgs('division', args), false, JSON.stringify(args));
    await assert.rejects(api.callTool(f.env, 'division', args), error => error.code === -32602);
  }
  assert.equal(f.reads.length, 0);
});

test('one division returns outcome, tallies, member votes, party majorities and eligible rebels', async () => {
  const f = fixture();
  const data = await api.callTool(f.env, 'division', { division_id: 'federal-senate-100' });
  assert.equal(data.rows.length, 1);
  const row = data.rows[0];
  assert.equal(row.id, 'federal-senate-100');
  assert.equal(row.chamber, 'senate');
  assert.equal(row.date, '2025-08-28');
  assert.equal(row.title, bill.title + ' - second reading');
  assert.equal(row.outcome, 'passed');
  assert.equal(row.ayes, 22);
  assert.equal(row.noes, 12);
  assert.equal(row.members.length, members.length);
  assert.deepEqual(row.members.find(m => m.name === 'Labor Rebel'), { name: 'Labor Rebel', party: 'Labor', vote: 'no' });
  assert.deepEqual(row.party_majorities.find(p => p.party === 'Labor'), { party: 'Labor', ayes: 5, noes: 1, majority: 'aye' });
  assert.equal(row.party_majorities.find(p => p.party === 'Unity').majority, null);
  assert.deepEqual(row.crossed_floor.map(m => [m.name, m.party, m.vote, m.party_vote]).sort(), [
    ['Labor Rebel', 'Labor', 'no', 'aye'], ['Liberal Rebel', 'Liberal', 'aye', 'no'],
  ]);
  assert.equal(row.url, 'https://opax.com.au/doc/division-federal-senate-100');
  assert.equal(row.source_url, f.divisions[0].source_url);
  assert.equal(data.total, 1);
  assert.equal(data.has_more, false);
  assert.equal(row.coverage.complete, true);
  assert.equal(row.coverage.unknown_party_members, 6);
  assert.ok(data.citations.some(c => c.url === row.url));
  assert.equal(globalThis.__divisionTableQueries.length, 0, 'an exact id does not search D1');
  const slug = await api.callTool(f.env, 'division', { division_id: 'division-federal-senate-100' });
  assert.deepEqual(slug.rows, data.rows);
});

test('person and party selectors expose the selected vote without removing division context', async () => {
  const f = fixture();
  const args = { division_id: 'federal-senate-100', person: '  labor REBEL  ', party: 'labor' };
  const direct = await api.callTool(f.env, 'division', args);
  const ask = await api.runTool(f.deps, 'division', args);
  assert.equal(ask.ok, true);
  assert.deepEqual(ask.data, direct);
  assert.equal(direct.rows[0].members.length, members.length);
  assert.deepEqual(direct.rows[0].person_votes.map(m => [m.name, m.vote]), [['Labor Rebel', 'no']]);
  assert.deepEqual(direct.rows[0].party_votes.map(p => [p.party, p.ayes, p.noes]), [['Labor', 5, 1]]);
  const facts = api.factSheet([ask]).facts;
  assert.ok(facts.length);
  const text = facts.map(f => f.text).join(' ');
  assert.match(text, /Labor Rebel.*(?:voted )?no/i);
  assert.match(text, /passed/i);
  assert.match(text, /22\s+ayes|ayes\s*[:=]?\s*22/i);
  assert.match(text, /12\s+noes|noes\s*[:=]?\s*12/i);
  assert.ok(text.search(/passed/i) < text.indexOf('Labor Rebel'), 'outcome precedes the selected member vote');
  assert.ok(text.search(/22\s+ayes|ayes\s*[:=]?\s*22/i) < text.indexOf('Labor Rebel'), 'tallies precede the selected member vote');
  const prompt = JSON.parse(api.writingPrompt({ question: 'How did Labor Rebel vote in this division?', period: { kind: 'window', since: '2025-08-28', until: '2025-08-28', label: '28 August 2025' }, facts: [] }));
  assert.match(prompt.contract, /division.*passed.*defeated.*ayes\/noes first.*then.*person or party vote/i);
  assert.match(prompt.contract, /retain.*partial.member.list qualification/i);
  assert.match(prompt.contract, /Bill passage uses its separately documented lifecycle result/i);
});

test('the common Labor Party alias selects published Labor votes and dissenters', async () => {
  const f = fixture();
  const data = await api.callTool(f.env, 'division', { division_id: 'federal-senate-100', party: 'Labor Party' });
  assert.deepEqual(data.rows[0].party_votes, [{ party: 'Labor', ayes: 5, noes: 1, majority: 'aye' }]);
  assert.match(data.citations[0].text, /Labor voted aye by majority \(5 ayes, 1 noes\)/);
  assert.match(data.citations[0].text, /Labor Rebel \(Labor\) voted no, party majority aye/);
  assert.doesNotMatch(data.citations[0].text, /no party.labelled.*vote recorded/i);
});

test('the model receives every member vote in smaller tuples while canonical wire objects stay intact', async () => {
  const f = fixture();
  const data = await api.callTool(f.env, 'division', { division_id: 'federal-senate-100' });
  const original = structuredClone(data.rows);
  const modelRows = api.divisionModelRows(data.rows);
  assert.deepEqual(modelRows[0].member_fields, ['name', 'party', 'vote']);
  assert.deepEqual(modelRows[0].members, data.rows[0].members.map(m => [m.name, m.party, m.vote]));
  assert.equal(modelRows[0].members.length, members.length);
  assert.deepEqual(modelRows[0].party_majorities, data.rows[0].party_majorities);
  assert.deepEqual(modelRows[0].crossed_floor, data.rows[0].crossed_floor);
  assert.ok(Buffer.byteLength(JSON.stringify(modelRows)) < Buffer.byteLength(JSON.stringify(data.rows)));
  assert.deepEqual(data.rows, original);
  assert.equal(Array.isArray(data.rows[0].members[0]), false);
});

test('date and chamber constrain title matches before limiting and expose remaining matches', async () => {
  const f = fixture([
    division({ key: 'federal-representatives-99', house: 'representatives' }),
    division({ key: 'federal-senate-98', date: '2024-08-28' }),
    division(), division({ key: 'federal-senate-101', name: bill.title + ' - amendments' }),
    division({ key: 'federal-senate-102', name: 'Unrelated budget motion' }),
  ]);
  const data = await api.callTool(f.env, 'division', { date: '2025-08-28', chamber: 'senate', title: 'Harbour Infrastructure', limit: 1 });
  assert.equal(data.rows.length, 1);
  assert.equal(data.rows[0].date, '2025-08-28');
  assert.equal(data.rows[0].chamber, 'senate');
  assert.match(data.rows[0].title, /Harbour Infrastructure/);
  assert.equal(data.total, 2);
  assert.equal(data.has_more, true);
  assert.equal(globalThis.__divisionTableQueries.length, 0, 'date lookup filters the local published index');
});

test('title-only lookup uses the published divisions table and fetches its detail', async () => {
  const f = fixture([division(), division({ key: 'federal-senate-102', name: 'Unrelated budget motion' })]);
  const data = await api.callTool(f.env, 'division', { title: 'Harbour Infrastructure', chamber: 'senate' });
  assert.deepEqual(data.rows.map(r => r.id), ['federal-senate-100']);
  const query = globalThis.__divisionTableQueries[0];
  assert.equal(query.dataset, 'divisions');
  assert.equal(query.params.q, 'harbour infrastructure');
  assert.deepEqual(JSON.parse(query.params['f.house']), ['senate']);
  assert.deepEqual(JSON.parse(query.params['f.jurisdiction']), ['federal']);
  assert.ok(f.reads.includes('/divisions/division-federal-senate-100.json'));
});

test('bill key and bill name resolve linked division ids without a title search', async () => {
  const f = fixture([division(), division({ key: 'federal-senate-101', name: bill.title + ' - amendments' })]);
  for (const selector of [bill.key, bill.title]) {
    const data = await api.callTool(f.env, 'division', { bill: selector, limit: 20 });
    assert.equal(data.total, 2, selector);
    assert.deepEqual(data.rows.map(r => r.id).sort(), ['federal-senate-100', 'federal-senate-101']);
    const count = data.citations.find(c => c.kind === 'count');
    assert.equal(count.value, 2);
    assert.equal(count.url, 'https://opax.com.au/bill/' + bill.key);
  }
  assert.equal(globalThis.__divisionTableQueries.length, 0);
});

test('a state bill without a linked bill entry can still resolve its dated division title', async () => {
  const f = fixture([division({ key: 'nsw-lc-2025-08-28-1', house: 'nsw_lc', jurisdiction: 'nsw', name: 'Local Infrastructure Bill 2025 - second reading' })]);
  const data = await api.callTool(f.env, 'division', { bill: 'Local Infrastructure Bill 2025', date: '2025-08-28', chamber: 'nsw_lc' });
  assert.equal(data.rows[0].id, 'nsw-lc-2025-08-28-1');
  assert.equal(data.rows[0].outcome, 'passed');
  assert.match(data.notes.join(' '), /does not establish a complete linked-bill division count/);
  assert.equal(globalThis.__divisionTableQueries.length, 0);
});

test('ambiguous bill choices remain visible in the rows that Ask exposes to the model', async () => {
  const f = fixture();
  f.assets['/bills/index.json'].bills.push({ key: 'au-federal-r99999', title: 'Harbour Infrastructure Bill 2026' });
  const data = await api.callTool(f.env, 'division', { bill: 'Harbour Infrastructure' });
  assert.deepEqual(data.rows.map(row => row.bill_id), [bill.key, 'au-federal-r99999']);
  assert.match(data.notes.join(' '), /Several bills match/);
  assert.deepEqual(data.citations, []);
});

test('partial member coverage is labelled and cannot establish that no member crossed the floor', async () => {
  const f = fixture([division({ members: members.filter(m => !m.name.includes('Rebel')), _meta: { member_coverage: 'partial' } })]);
  const data = await api.callTool(f.env, 'division', { division_id: 'federal-senate-100' });
  assert.equal(data.rows.length, 1);
  assert.ok(data.rows[0].members.length);
  const text = JSON.stringify({ coverage: data.coverage, row: data.rows[0], notes: data.notes, citations: data.citations });
  assert.match(text, /partial|incomplete/i);
  assert.doesNotMatch(data.citations.map(c => c.text).join(' '), /(?:no|none|zero) (?:members? )?(?:crossed|floor.cross|rebels)/i);
});

test('an explicit published result takes precedence and missing tallies remain unknown', async () => {
  const recorded = fixture([division({ result: 'negative' })]);
  const data = await api.callTool(recorded.env, 'division', { division_id: 'federal-senate-100' });
  assert.equal(data.rows[0].outcome, 'defeated');
  const missing = fixture();
  const detail = missing.assets['/divisions/division-federal-senate-100.json'];
  delete detail.result;
  delete detail.ayes;
  delete detail.noes;
  const unknown = await api.callTool(missing.env, 'division', { division_id: 'federal-senate-100' });
  assert.equal(unknown.rows[0].outcome, null);
  assert.equal(unknown.rows[0].ayes, null);
  assert.equal(unknown.rows[0].noes, null);
  assert.doesNotMatch(unknown.citations[0].text, /(?:passed|defeated|0 ayes|0 noes)/i);
});

test('a missing or mismatched detail never invents a division outcome or a member vote', async () => {
  for (const detail of [null, { ...division(), key: 'federal-senate-999', slug: 'division-federal-senate-999' }]) {
    const f = fixture();
    f.assets['/divisions/division-federal-senate-100.json'] = detail;
    const data = await api.callTool(f.env, 'division', { division_id: 'federal-senate-100', person: 'Labor Rebel' });
    assert.deepEqual(data.rows, []);
    assert.deepEqual(data.citations, []);
    assert.match(JSON.stringify(data), /unavailable|missing|could not|not.*load/i);
  }
});

test('floor crossing aggregates count eligible minority member-votes from complete lists only', async () => {
  const f = fixture([
    division(), division({ key: 'federal-senate-101', date: '2025-09-01' }),
    division({ key: 'federal-senate-102', date: '2025-09-02', _meta: { member_coverage: 'partial' } }),
    division({ key: 'federal-senate-103', date: '2024-08-28' }),
    division({ key: 'federal-senate-104', date: '2025-09-03' }),
    division({ key: 'federal-representatives-105', house: 'representatives' }),
  ]);
  const data = await api.callTool(f.env, 'division', { operation: 'floor_crossing', chamber: 'senate', since: '2025-08-28', until: '2025-09-02' });
  assert.deepEqual(data.rows.map(r => [r.party, r.member_votes, r.divisions]).sort(), [['Labor', 2, 2], ['Liberal', 2, 2]]);
  assert.ok(data.citations.length);
  assert.match(data.notes.join(' '), /complete|full|recorded/i);
  assert.equal(f.reads.filter(p => p !== '/divisions/index.json').length, 0, 'period aggregate uses index party tallies only');
  const party = await api.callTool(f.env, 'division', { operation: 'floor_crossing', party: 'Labor', chamber: 'senate', since: '2025-08-28', until: '2025-09-02' });
  assert.deepEqual(party.rows.map(r => [r.party, r.member_votes]), [['Labor', 2]]);
});

test('a division marked as a repeat of another is counted once and office codes are never a party', async () => {
  const f = fixture([division(), division({ key: 'federal-senate-101', date: '2025-09-01' })]);
  f.assets['/divisions/index.json'].divisions.find(d => d.key === 'federal-senate-101').duplicate_of = 'federal-senate-100';
  const data = await api.callTool(f.env, 'division', { operation: 'floor_crossing', chamber: 'senate', since: '2025-08-28', until: '2025-09-01' });
  assert.deepEqual(data.rows.map(r => [r.party, r.member_votes, r.divisions]).sort(), [['Labor', 1, 1], ['Liberal', 1, 1]]);
  assert.equal(data.coverage.excluded_duplicate_divisions, 1);
  assert.match(data.notes.join(' '), /repeats of another published division/);
  for (const office of ['CWM', 'DPRES', 'dspk', 'Chair of Committees']) {
    const refused = await api.callTool(f.env, 'division', { operation: 'floor_crossing', party: office, chamber: 'senate', since: '2025-08-28', until: '2025-09-01' });
    assert.ok(refused.error, office);
  }
});

test('party agreement compares majorities, excludes ties and does not require five votes per party', async () => {
  const side = (party, vote) => Array.from({ length: 2 }, (_, i) => member(`${party} ${i}`, party, vote));
  const f = fixture([
    division({ key: 'federal-senate-100', members: [...side('Labor', 'aye'), ...side('Liberal', 'aye')] }),
    division({ key: 'federal-senate-101', members: [...side('Labor', 'aye'), ...side('Liberal', 'no')] }),
    division({ key: 'federal-senate-102', members: [member('Labor A', 'Labor', 'aye'), member('Labor B', 'Labor', 'no'), ...side('Liberal', 'no')] }),
    division({ key: 'federal-senate-103', members: side('Labor', 'aye') }),
  ]);
  const data = await api.callTool(f.env, 'division', { operation: 'party_agreement', party: 'Labor', other_party: 'Liberal', since: '2025-01-01', until: '2025-12-31' });
  assert.equal(data.rows.length, 1);
  assert.equal(data.rows[0].same, 1);
  assert.equal(data.rows[0].both, 2);
  assert.equal(data.rows[0].percentage, 50);
  assert.equal(data.summary.same, 1);
  assert.equal(data.summary.both, 2);
  assert.equal(f.reads.filter(p => p !== '/divisions/index.json').length, 0);
  assert.ok(data.citations.some(c => /1.*2/.test(c.text)));
});

const token = 'opax_' + 'D'.repeat(43);
const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(v => v.toString(16).padStart(2, '0')).join('');
function mcpFixture(f) {
  const env = { COMMUNITY_ENABLED: 'true', COMMUNITY_ORIGIN: 'https://opax.com.au', TABLE_DB: {},
    COMMUNITY_DB: { prepare(sql) { let args; return {
      bind(...values) { args = values; return this; },
      async first() {
        if (sql.startsWith('SELECT m.')) return args[0] === hash ? { id: 'division-member', key_id: 'division-key' } : null;
        if (sql.startsWith('INSERT INTO community_limits')) return { hits: 1 };
        throw Error('Unexpected fixture SQL');
      }, async run() { return { success: true }; },
    }; } },
    ASSETS: { async fetch(req) { const body = await f.asset(new URL(req.url).pathname); return body ? Response.json(body) : new Response('missing', { status: 404 }); } },
  };
  return async (method, params = {}) => (await api.communityMcp(new Request('https://opax.com.au/mcp', {
    method: 'POST', headers: { authorization: 'Bearer ' + token, accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }), env, async () => { throw Error('MCP divisions must not retrieve speeches'); })).json();
}

test('MCP exposes the same division schema and returns exactly the Ask and registry data', async () => {
  const f = fixture(), send = mcpFixture(f);
  // division is a register of query_register, with its arguments in register_guide; it still answers by name.
  const tools = (await send('tools/list')).result.tools, dispatch = tools.find(t => t.name === 'query_register');
  assert.ok(dispatch.inputSchema.properties.register.enum.includes('division'));
  assert.equal(dispatch.annotations.readOnlyHint, true);
  const guide = (await send('tools/call', { name: 'register_guide', arguments: { register: 'division' } })).result.structuredContent;
  assert.deepEqual(Object.keys(guide.arguments.properties), Object.keys(api.getTool('division').inputSchema.properties));
  const args = { division_id: 'federal-senate-100', person: 'Labor Rebel' };
  const direct = await api.callTool(f.env, 'division', args);
  const ask = await api.runTool(f.deps, 'division', args);
  const rpc = await send('tools/call', { name: 'division', arguments: args });
  assert.equal(rpc.result.isError, false);
  assert.deepEqual(rpc.result.structuredContent, direct);
  assert.deepEqual(JSON.parse(rpc.result.content[0].text), ask.data);
  const reads = f.reads.length;
  assert.equal((await send('tools/call', { name: 'division', arguments: { date: '2025-02-30' } })).result.isError, true);
  assert.equal(f.reads.length, reads);
});

for (const id of ['federal-senate-9724', 'federal-representatives-565']) test(`published ${id}: real outcome, totals and member votes survive the registry`, async () => {
  const index = JSON.parse(await readFile(new URL('../public/divisions/index.json', import.meta.url), 'utf8'));
  const detail = JSON.parse(await readFile(new URL(`../public/divisions/division-${id}.json`, import.meta.url), 'utf8'));
  const assets = { '/divisions/index.json': { ...index, divisions: index.divisions.filter(d => d.key === id) }, [`/divisions/division-${id}.json`]: detail };
  const data = await api.callTool({ asset: async path => structuredClone(assets[path] ?? null) }, 'division', { division_id: id, person: detail.members[0].name });
  assert.equal(data.rows.length, 1);
  const row = data.rows[0];
  assert.equal(row.title, detail.name);
  assert.equal(row.chamber, detail.house);
  assert.equal(row.date, detail.date);
  assert.equal(row.ayes, detail.ayes);
  assert.equal(row.noes, detail.noes);
  assert.equal(row.outcome, detail.result === 'affirmative' ? 'passed' : 'defeated');
  assert.equal(row.members.length, detail.members.length);
  assert.equal(row.person_votes[0].vote, detail.members[0].vote);
  assert.equal(row.source_url, detail.source_url);
  if (detail._meta.member_coverage === 'partial') assert.match(JSON.stringify(data), /partial|incomplete/i);
});

test('a real NSW Legislative Council division resolves by id and exact date, title and chamber', async () => {
  const id = 'nsw-lc-2026-09-17-6';
  const index = JSON.parse(await readFile(new URL('../public/divisions/index.json', import.meta.url), 'utf8'));
  const detail = JSON.parse(await readFile(new URL(`../public/divisions/division-${id}.json`, import.meta.url), 'utf8'));
  const assets = { '/divisions/index.json': { ...index, divisions: index.divisions.filter(d => d.key === id) }, [`/divisions/division-${id}.json`]: detail };
  const env = { asset: async path => structuredClone(assets[path] ?? null) };
  for (const args of [{ division_id: id }, { date: '2026-09-17', title: 'Budget Estimates Transcript', chamber: 'nsw_lc' }]) {
    const data = await api.callTool(env, 'division', args);
    assert.equal(data.rows.length, 1);
    const row = data.rows[0];
    assert.equal(row.id, id);
    assert.equal(row.chamber, 'nsw_lc');
    assert.equal(row.date, '2026-09-17');
    assert.equal(row.title, detail.name);
    assert.equal(row.outcome, 'passed');
    assert.equal(row.ayes, 19);
    assert.equal(row.noes, 13);
    assert.equal(row.source_url, detail.source_url);
    assert.match(data.citations[0].text, /19 ayes to 13 noes/);
  }
});

test('the Ask loop answers a large real division from its facts without exceeding the model result limit', async t => {
  const id = 'federal-representatives-345', person = 'Alan Cadman';
  const index = JSON.parse(await readFile(new URL('../public/divisions/index.json', import.meta.url), 'utf8'));
  const detail = JSON.parse(await readFile(new URL(`../public/divisions/division-${id}.json`, import.meta.url), 'utf8'));
  const assets = {
    '/divisions/index.json': { ...index, divisions: index.divisions.filter(d => d.key === id) },
    [`/divisions/division-${id}.json`]: detail,
    '/parliamentarians.json': { people: detail.members.map(m => ({ name: m.name, party: m.party, person_id: m.person_id })) },
  };
  const asset = async path => structuredClone(assets[path] ?? null);
  const args = { division_id: id, person };
  const call = (toolName, input, toolCallId) => ({ type: 'tool-call', toolName, toolCallId, input: JSON.stringify(input) });
  const reply = content => ({ content, finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
    usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } }, warnings: [] });
  const model = new MockLanguageModelV4({ doGenerate: [reply([call('division', args, 'lookup')]), reply([call('answer', { facts: [1] }, 'selected-fact')])] });
  const failures = [];
  // This test covers selection and admission; the writer contract is checked above.
  const research = Object.assign(api.createResearch({ model, modelBudgetSpent: async () => false,
    dailyBudget: { reserve: async () => ({ settle: async () => {} }) }, creditCooldown: api.createResearchCreditCooldown() }), { write: undefined });
  const question = 'How did Alan Cadman vote in the House of Representatives division on the Prohibition of Human Cloning Bill on 6 December 2006?';
  const out = await api.runAgentic(question, { asset, origin: 'https://opax.com.au', research,
    kb: async () => { throw Error('A division answer must not search speeches'); },
    generate: async () => { throw Error('A division answer must use the mocked research loop'); },
    onResearchFailure: async error => failures.push(error),
  }, async () => {}, 40_000, api.inferPeriod(question), {}, { people: [person], parties: [], bills: [], ambiguous: false, unresolved: false });
  assert.deepEqual(failures.map(error => error.reason), []);
  assert.equal(out.answered, true);
  assert.equal(out.research.mode, 'loop');
  assert.equal(out.research_failure, undefined);
  assert.match(out.answer, /^[\s-]*Division passed, 80 ayes to 60 noes/);
  assert.match(out.answer, /Alan Cadman \(Liberal\) voted no/);
  assert.ok(out.answer.indexOf('80 ayes to 60 noes') < out.answer.indexOf('Alan Cadman'));
  assert.equal(model.doGenerateCalls.length, 2);
  const feedback = model.doGenerateCalls[1].prompt.filter(message => message.role === 'tool').flatMap(message => message.content).find(content => content.toolName === 'division');
  const shown = feedback.output.value;
  assert.deepEqual(shown.data.rows[0].member_fields, ['name', 'party', 'vote']);
  assert.equal(shown.data.rows[0].members.length, 144);
  assert.deepEqual(shown.data.rows[0].members, detail.members.map(m => [m.name, m.party || null, m.vote]));
  const modelBytes = Buffer.byteLength(JSON.stringify(shown));
  assert.ok(modelBytes <= 16_384);
  const canonical = await api.callTool({ asset }, 'division', args);
  assert.equal(Array.isArray(canonical.rows[0].members[0]), false);
  const objectBytes = Buffer.byteLength(JSON.stringify({ ...shown, data: { ...shown.data, rows: canonical.rows } }));
  assert.ok(modelBytes < objectBytes);
  t.diagnostic(`Complete 144-member feedback: ${modelBytes} bytes in model tuples, ${objectBytes} bytes with canonical objects; model result cap 16384 bytes.`);
});

test('policy voting aggregates the full union of bill and motion matches, not the representative row limit', async () => {
  const greens = vote => [member('Greens Example', 'Greens', vote)]
  const rows = [
    division({key:'federal-senate-501',date:'2022-09-08',name:'Climate Change Bill 2022 - Second Reading',bills:[{...bill,title:'Climate Change Bill 2022'}],members:greens('aye')}),
    division({key:'federal-senate-502',date:'2022-09-08',name:'Climate Change Bill 2022 - Opposition amendment',bills:[],members:greens('no')}),
    division({key:'federal-senate-503',date:'2019-12-02',name:'Motions — Climate change',bills:[],members:greens('no')}),
    division({key:'federal-senate-504',date:'2011-11-08',name:'Clean Energy Bill 2011 - Second Reading',bills:[],members:greens('aye')}),
    division({key:'federal-senate-505',date:'2024-01-01',name:'Housing motion',bills:[],members:greens('aye')}),
    division({key:'federal-senate-506',date:'2023-01-01',name:'Carbon motion',bills:[],members:[member('A','Greens','aye'),member('B','Greens','no')]}),
    division({key:'federal-senate-507',date:'2023-02-01',name:'Emissions motion',bills:[],members:[member('Other','Labor','aye')]}),
  ]
  const f=fixture(rows)
  const result=await api.callTool(f.env,'division',{operation:'policy_votes',party:'Greens',title:'climate',limit:1})
  assert.equal(result.total,6)
  assert.deepEqual(result.summary,{divisions:6,aye:2,no:2,tied:1,unrecorded:1,split:1,partial:0})
  assert.equal(result.by_kind.find(r=>r.category==='bill').divisions,3)
  assert.equal(result.by_kind.find(r=>r.category==='motion').divisions,3)
  assert.ok(result.rows.length>1)
  assert.ok(result.rows.some(r=>r.title==='Motions — Climate change'),'the record retains its title punctuation')
  assert.ok(result.citations.every(c=>!c.text.includes('—')),'answer prose uses no em dashes')
  assert.ok(result.citations.some(c=>c.text==='On 2 December 2019, Greens senators voted 0 ayes and 1 no on Motions - Climate change.'))
  assert.match(result.citations[0].text,/^Across 6 matching divisions on climate from 8 November 2011 to 1 February 2023, a majority of Greens members voted aye in 2 and no in 2; 1 had a tied aye\/no vote; 1 had no party-labelled vote\./)
  assert.ok(result.citations.every(c=>!(/\b\d{4}-\d{2}-\d{2}\b/).test(c.text)))
  assert.ok(result.citations[0].related.length>=4)
  assert.ok(result.citations.some(c=>c.text.includes('Clean Energy Bill 2011')))
  assert.match(result.notes.join(' '),/not support for or opposition/)
  assert.match(result.citations[0].text,/An aye or no is the side of the specific question, not support for or opposition to the policy\./)
  const scoped=await api.callTool(f.env,'division',{operation:'policy_votes',party:'Greens',title:'climate',since:'2022-01-01',until:'2022-12-31'})
  assert.equal(scoped.total,2)
  f.assets['/divisions/index.json'].divisions.find(d=>d.key==='federal-senate-502').duplicate_of='federal-senate-501'
  assert.equal((await api.callTool(f.env,'division',{operation:'policy_votes',party:'Greens',title:'climate'})).total,5)
})

test('policy vote prose omits zero categories and empty breakdowns, keeping zero ayes or noes in representative votes', async () => {
  for (const [votes, wording, representativeVotes] of [
    [[member('A','Greens','aye')], 'a majority of Greens members voted aye in 1', '1 aye and 0 noes'],
    [[member('A','Greens','no')], 'a majority of Greens members voted no in 1', '0 ayes and 1 no'],
    [[member('A','Greens','aye'),member('B','Greens','no')], '1 had a tied aye/no vote', '1 aye and 1 no'],
    [[member('A','Labor','aye')], '1 had no party-labelled vote', '0 ayes and 0 noes'],
  ]) {
    const f = fixture([division({key:'federal-senate-701',date:'2024-05-16',name:'Climate Bill — Second Reading',members:votes})])
    const result = await api.callTool(f.env,'division',{operation:'policy_votes',party:'Greens',title:'climate'})
    assert.equal(result.citations[0].text, `Across 1 matching division on climate from 16 May 2024 to 16 May 2024, ${wording}. An aye or no is the side of the specific question, not support for or opposition to the policy.`)
    assert.equal(result.citations.filter(c=>c.kind==='count').length,2, 'empty motion category is omitted')
    assert.doesNotMatch(result.citations.filter(c=>c.kind==='count').map(c=>c.text).join(' '), /\bin 0\b|\b0 had\b|\b0 matching\b|\d{4}-\d{2}-\d{2}/)
    assert.doesNotMatch(result.notes.join(' '), /\b0 divisions\b|\b0 had\b/)
    const representative = result.citations.find(c=>c.kind==='record')
    assert.equal(representative.text, `On 16 May 2024, Greens senators voted ${representativeVotes} on Climate Bill - Second Reading.`)
  }
})

test('policy representative prose distinguishes House members and preserves the full division title', async () => {
  const title = 'Climate Change Bill 2026 - Consideration in Detail - Climate and First Nations'
  const f = fixture([division({key:'federal-representatives-702',house:'representatives',date:'2026-03-11',name:title,members:[member('A','Greens','aye')]})])
  const result = await api.callTool(f.env,'division',{operation:'policy_votes',party:'Greens',title:'climate',since:'2026-01-01',until:'2026-04-30'})
  assert.match(result.citations[0].text,/from 1 January 2026 to 30 April 2026/)
  assert.equal(result.citations.find(c=>c.kind==='record').text, `On 11 March 2026, Greens members voted 1 aye and 0 noes on ${title}.`)
  assert.equal(result.rows[0].date,'2026-03-11', 'structured dates keep their canonical form')
})
