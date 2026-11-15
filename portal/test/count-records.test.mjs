import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
// MCP adds two fields that Ask's copy of a result does not carry: the record-text notice and a former-name note.
const mcpOnly = value => { if (!value || typeof value !== 'object' || Array.isArray(value)) return value; const { record_text_notice, deprecated, ...rest } = value; return rest; };

async function load(entry) {
  const built = await build({ entryPoints: [new URL(entry, import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
  return import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
}

const { callTool, parseToolArgs, listTools, askToolSpecs } = await load('../src/tools/index.ts');
const { communityMcp } = await load('../src/community-mcp.ts');
const GENERATED_AT = '2026-10-04T16:27:54+00:00';
const divisions = [
  ...Array.from({ length: 181 }, (_, i) => ({ key: `federal-representatives-leap-${i}`, date: '2024-02-29', bills: [] })),
  { key: 'federal-senate-leap-1', date: '2024-02-29', bills: [] },
  { key: 'federal-senate-leap-2', date: '2024-02-29', bills: [] },
  { key: 'federal-representatives-pre-leap', date: '2024-02-28', bills: [] },
  { key: 'federal-representatives-march', date: '2024-03-01', bills: [] },
  { key: 'federal-representatives-fy-last', date: '2024-06-30', bills: [] },
  { key: 'federal-representatives-fy-first', date: '2024-07-01', bills: [] },
  { key: 'federal-representatives-prior-fy-first', date: '2023-07-01', bills: [] },
  { key: 'federal-representatives-prior-fy-last', date: '2023-06-30', bills: [] },
  { key: 'federal-representatives-term-before', date: '2022-07-25', bills: [] },
  { key: 'federal-representatives-term-first', date: '2022-07-26', bills: [] },
  { key: 'federal-representatives-term-last', date: '2025-03-28', bills: [] },
  { key: 'federal-representatives-term-after', date: '2025-03-29', bills: [] },
  { key: 'federal-representatives-new-term', date: '2025-07-22', bills: [] },
  { key: 'federal-representatives-undated', date: null, bills: [] },
  { key: 'nsw-lc-leap', date: '2024-02-29', bills: [] },
  { key: 'nsw-la-leap', date: '2024-02-29', bills: [] },
  { key: 'vic-la-leap', date: '2024-02-29', bills: [] },
  { key: 'qld-la-leap', date: '2024-02-29', bills: [] },
];
const bills = [
  { key: 'au-federal-fixture', title: 'Exact Fixture Bill 2024', jurisdiction: 'federal', introduced: '2024-02-29', originating_house: 'representatives', parliament: 47, status: 'passed' },
  { key: 'au-federal-senate', title: 'Senate Fixture Bill 2024', jurisdiction: 'federal', introduced: '2024-02-29', originating_house: 'senate', parliament: 47, status: 'before_parliament' },
  { key: 'au-federal-draft', title: 'Exposure Fixture Bill 2024', jurisdiction: 'federal', introduced: '2024-02-29', originating_house: null, parliament: 47, status: 'exposure_draft' },
  { key: 'au-federal-lapsed', title: 'Lapsed Fixture Bill 2024', jurisdiction: 'federal', introduced: '2024-03-01', originating_house: 'representatives', parliament: 47, status: 'lapsed' },
  { key: 'au-federal-late-47', title: 'Late Registry Fixture Bill 2025', jurisdiction: 'federal', introduced: '2025-04-01', originating_house: 'representatives', parliament: 47, status: 'passed' },
  { key: 'au-federal-early-48', title: 'Early Registry Fixture Bill 2025', jurisdiction: 'federal', introduced: '2025-07-01', originating_house: 'representatives', parliament: 48, status: 'before_parliament' },
  { key: 'au-federal-undated', title: 'Undated Fixture Bill', jurisdiction: 'federal', introduced: null, originating_house: 'representatives', parliament: 47, status: 'before_parliament' },
];
const linkedDivisions = [
  { key: 'federal-representatives-leap-0', date: '2024-02-29', house: 'representatives' },
  { key: 'federal-senate-leap-1', date: '2024-02-29', house: 'senate' },
  { key: 'federal-representatives-fy-last', date: '2024-06-30', house: 'representatives' },
];

function fixture(overrides = {}) {
  const assets = {
    // The published divisions index has no generated_at field.
    '/divisions/index.json': { schema: 2, count: divisions.length, divisions },
    '/bills/index.json': { generated_at: GENERATED_AT, count: bills.length, meta: { mode: 'registry', parliament_floor: '1998-11-10' }, bills },
    '/bills/au-federal-fixture.json': { ...bills[0], divisions: linkedDivisions },
    ...overrides,
  };
  const reads = [];
  const asset = async path => {
    reads.push(path);
    assert.ok(Object.hasOwn(assets, path), `Unexpected asset read: ${path}`);
    return structuredClone(assets[path]);
  };
  const env = {
    origin: 'https://opax.test', asset,
    ASSETS: { async fetch(request) {
      const value = await asset(new URL(request.url).pathname);
      return value === null ? new Response('', { status: 404 }) : Response.json(value);
    } },
  };
  return { env, asset, reads };
}

async function count(args, f = fixture()) {
  return callTool(f.env, 'count_records', args);
}

test('the registry exposes one count schema shared by Ask and MCP', async () => {
  const listed = listTools().filter(tool => tool.name === 'count_records');
  assert.equal(listed.length, 1);
  const ask = askToolSpecs.find(tool => tool.name === 'count_records');
  assert.ok(ask);
  assert.deepEqual(ask.input, listed[0].inputSchema);
  assert.equal(ask.description, listed[0].description);
  assert.match(listed[0].description, /how many/i);
  assert.match(listed[0].description, /more|fewer/i);
  const f = fixture(), args = { record_type: 'divisions', date: '2024-02-29', chamber: 'senate' };
  const direct = await count(args, f);
  const adapted = await ask.run({ origin: 'https://opax.test', asset: f.asset, kb: async () => { throw Error('Counts must not search ranked records'); } }, args);
  const assetsOnly = await callTool({ origin: 'https://opax.test', ASSETS: f.env.ASSETS }, 'count_records', args);
  assert.equal(adapted.ok, true);
  assert.deepEqual(adapted.data, direct);
  assert.deepEqual(assetsOnly, direct);
  assert.ok(direct.citations.some(citation => citation.kind === 'count' && citation.value === 2));
});

test('the authenticated MCP endpoint lists and calls count_records with the same registry wire JSON', async () => {
  const f = fixture(), token = 'opax_' + 'A'.repeat(43);
  const tokenHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(value => value.toString(16).padStart(2, '0')).join('');
  const env = {
    COMMUNITY_ENABLED: 'true', COMMUNITY_ORIGIN: 'https://opax.test', ASSETS: f.env.ASSETS,
    COMMUNITY_DB: { prepare(sql) {
      let values;
      return {
        bind(...args) { values = args; return this; },
        async first() {
          if (sql.startsWith('SELECT m.')) {
            assert.equal(values[0], tokenHash);
            return { id: 'fixture-member', key_id: 'fixture-key' };
          }
          if (sql.startsWith('INSERT INTO community_limits')) return { hits: 1 };
          throw Error(`Unexpected fixture SQL: ${sql}`);
        },
        async run() {
          assert.ok(sql.startsWith('UPDATE mcp_keys SET last_used_at='));
          assert.equal(values[1], 'fixture-key');
          return { success: true };
        },
      };
    } },
  };
  async function rpc(method, params = {}) {
    const response = await communityMcp(new Request('https://opax.test/mcp', {
      method: 'POST', headers: { authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }), env, async () => { throw Error('Exact counts must not retrieve ranked public records'); });
    assert.equal(response.status, 200);
    return response.json();
  }
  const listed = (await rpc('tools/list')).result.tools.filter(tool => tool.name === 'query_register');
  assert.equal(listed.length, 1);
  assert.ok(listed[0].inputSchema.properties.register.enum.includes('count_records'));
  assert.equal(listed[0].annotations.readOnlyHint, true);
  assert.equal(f.reads.length, 0, 'listing tools reads no record assets');
  for (const args of [
    { record_type: 'divisions', chamber: 'senate', date: '2024-02-29' },
    { record_type: 'bills', month: '2024-02', status: 'passed' },
  ]) {
    const expected = await callTool({ origin: 'https://opax.com.au', ASSETS: f.env.ASSETS }, 'count_records', args);
    const result = (await rpc('tools/call', { name: 'count_records', arguments: args })).result;
    assert.equal(result.isError, false);
    assert.deepEqual(mcpOnly(result.structuredContent), expected);
    assert.deepEqual(mcpOnly(JSON.parse(result.content[0].text)), expected);
  }
});

test('counts read every published division, with anchored chamber and jurisdiction filters', async () => {
  const f = fixture();
  assert.equal((await count({ record_type: 'divisions', date: '2024-02-29' }, f)).total, 183);
  assert.equal((await count({ record_type: 'divisions', date: '2024-02-29', chamber: 'representatives' }, f)).total, 181);
  assert.equal((await count({ record_type: 'divisions', date: '2024-02-29', chamber: 'senate' }, f)).total, 2);
  assert.equal((await count({ record_type: 'divisions', date: '2024-02-29', jurisdiction: 'nsw' }, f)).total, 2);
  assert.equal((await count({ record_type: 'divisions', date: '2024-02-29', jurisdiction: 'nsw', chamber: 'nsw_lc' }, f)).total, 1);
  assert.equal((await count({ record_type: 'divisions', date: '2024-02-29', chamber: 'nsw_lc' }, f)).total, 1, 'a state chamber infers its jurisdiction');
  assert.equal((await count({ record_type: 'divisions', date: '2024-02-29', jurisdiction: 'vic', chamber: 'vic_la' }, f)).total, 1);
  assert.equal((await count({ record_type: 'divisions', date: '2024-02-29', jurisdiction: 'qld', chamber: 'qld_la' }, f)).total, 1);
  assert.ok(f.reads.every(path => path === '/divisions/index.json'));
});

test('day, leap month, year, financial year and inclusive ranges keep exact boundaries', async () => {
  for (const [period, expected] of [
    [{ date: '2024-02-29' }, 183],
    [{ month: '2024-02' }, 184],
    [{ year: 2024 }, 187],
    [{ financial_year: '2023-24' }, 187],
    [{ financial_year: '2023-2024' }, 187],
    [{ since: '2024-02-29', until: '2024-02-29' }, 183],
    [{ since: '2024-06-30', until: '2024-07-01' }, 2],
    [{ since: '2025-03-28' }, 3],
    [{ until: '2022-07-25' }, 1],
  ]) {
    const result = await count({ record_type: 'divisions', ...period });
    assert.equal(result.error, undefined, JSON.stringify(period));
    assert.equal(result.total, expected, JSON.stringify(period));
  }
});

test('grouped counts include zero buckets across the requested period', async () => {
  const months = await count({ record_type: 'divisions', since: '2024-02-01', until: '2024-04-30', group_by: 'month' });
  assert.equal(months.total, 185);
  assert.deepEqual(months.rows.map(row => [row.period, row.count]), [['2024-02', 184], ['2024-03', 1], ['2024-04', 0]]);
  const years = await count({ record_type: 'divisions', since: '2024-01-01', until: '2026-12-31', group_by: 'year' });
  assert.deepEqual(years.rows.map(row => [row.period, row.count]), [['2024', 187], ['2025', 3], ['2026', 0]]);
  assert.equal(years.rows.reduce((sum, row) => sum + row.count, 0), years.total);
  const billMonths = await count({ record_type: 'bills', since: '2024-02-01', until: '2024-04-30', group_by: 'month' });
  assert.equal(billMonths.total, 4);
  assert.deepEqual(billMonths.rows.map(row => [row.period, row.count]), [['2024-02', 3], ['2024-03', 1], ['2024-04', 0]]);
});

test('the 47th term counts divisions from first sitting through dissolution and bills by parliament metadata', async () => {
  const divisionResult = await count({ record_type: 'divisions', term: '47th' });
  assert.equal(divisionResult.total, 191);
  const result = await count({ record_type: 'bills', term: '47th' });
  assert.equal(result.total, 6, 'the parliament field retains undated bills and post-sitting registry dates');
  assert.equal((await count({ record_type: 'bills', term: '48th' })).total, 1);
});

test('snapshot and coverage distinguish build stamps, latest records and undated records', async () => {
  const divisionResult = await count({ record_type: 'divisions', date: '2024-02-29' });
  assert.deepEqual(divisionResult.snapshot, { generated_at: null, latest_record_date: '2025-07-22' });
  assert.equal(divisionResult.coverage.first_record_date, '2022-07-25');
  assert.equal(divisionResult.coverage.last_record_date, '2025-07-22');
  assert.equal(divisionResult.coverage.undated_records, 1);
  assert.equal(divisionResult.coverage.indexed_records, 195);
  assert.match(divisionResult.notes.join(' '), /build date is not published/i);
  assert.match(divisionResult.notes.join(' '), /1 records.*no usable date/i);
  assert.match(divisionResult.notes.join(' '), /not proof of complete parliamentary history/i);
  const billResult = await count({ record_type: 'bills' });
  assert.equal(billResult.total, 7, 'all-time counts retain undated published records');
  assert.deepEqual(billResult.snapshot, { generated_at: GENERATED_AT, latest_record_date: '2025-07-01' });
  assert.equal(billResult.coverage.undated_records, 1);
});

test('bill counts use originating house and retain exposure drafts with an explicit date note', async () => {
  const result = await count({ record_type: 'bills', date: '2024-02-29' });
  assert.equal(result.total, 3);
  assert.equal(result.snapshot.generated_at, GENERATED_AT);
  assert.match(result.notes.join(' '), /exposure draft/i);
  assert.match(result.notes.join(' '), /release date/i);
  assert.equal((await count({ record_type: 'bills', date: '2024-02-29', chamber: 'representatives' })).total, 1, 'an exposure draft has no originating chamber');
  assert.equal((await count({ record_type: 'bills', date: '2024-02-29', chamber: 'senate' })).total, 1);
});

test('status counts expose the unfiltered denominator and the share for the same period', async () => {
  const result = await count({ record_type: 'bills', date: '2024-02-29', status: 'passed' });
  assert.equal(result.total, 1);
  assert.equal(result.denominator, 3);
  assert.ok(Math.abs(result.share_percent - 100 / 3) < 0.01);
  const empty = await count({ record_type: 'bills', date: '2024-04-01', status: 'passed' });
  assert.equal(empty.total, 0);
  assert.equal(empty.denominator, 0);
  assert.equal(empty.share_percent, null);
});

test('including bill titles has a presentation cap while the total retains every matching bill', async () => {
  const manyBills = Array.from({ length: 61 }, (_, i) => ({ ...bills[0], key: `au-federal-many-${i}`, title: `Fixture Bill ${i}` }));
  const f = fixture({ '/bills/index.json': { generated_at: GENERATED_AT, count: manyBills.length, bills: manyBills } });
  const result = await count({ record_type: 'bills', date: '2024-02-29', include_records: true }, f);
  assert.equal(result.total, 61);
  assert.equal(result.records.length, 50);
  assert.ok(result.records.every(row => row.title && row.url.startsWith('https://opax.test/bill/')));
  assert.match(result.notes.join(' '), /50 of 61/);
  assert.ok(result.citations.some(citation => citation.kind === 'count' && citation.value === 61));
});

test('an exact bill title or key counts linked divisions using their own chamber and dates', async () => {
  for (const bill of ['au-federal-fixture', 'Exact Fixture Bill 2024']) {
    const f = fixture();
    assert.equal((await count({ record_type: 'divisions', bill }, f)).total, 3);
    assert.equal((await count({ record_type: 'divisions', bill, date: '2024-02-29' }, f)).total, 2);
    assert.equal((await count({ record_type: 'divisions', bill, chamber: 'senate' }, f)).total, 1);
    assert.ok(f.reads.includes('/bills/au-federal-fixture.json'));
  }
});

test('unknown or ambiguous bill titles and incomplete bill division links produce no invented count', async () => {
  const unknown = await count({ record_type: 'divisions', bill: 'Exact Fixture Bill' });
  assert.ok(unknown.error, 'partial titles must not select a ranked match');
  assert.equal(unknown.total, undefined);
  const ambiguousBills = [...bills, { ...bills[0], key: 'au-federal-duplicate-title' }];
  const ambiguous = await count({ record_type: 'divisions', bill: bills[0].title }, fixture({ '/bills/index.json': { count: ambiguousBills.length, bills: ambiguousBills } }));
  assert.ok(ambiguous.error);
  for (const detail of [null, { ...bills[0], key: 'au-federal-wrong', divisions: linkedDivisions }]) {
    const result = await count({ record_type: 'divisions', bill: bills[0].key }, fixture({ '/bills/au-federal-fixture.json': detail }));
    assert.ok(result.error);
    assert.notEqual(result.total, 0);
  }
  const indexedBills = [{ ...bills[0], divisions: 4 }];
  const incomplete = await count({ record_type: 'divisions', bill: bills[0].key }, fixture({ '/bills/index.json': { count: 1, bills: indexedBills } }));
  assert.ok(incomplete.error, 'published linked-division totals must match the detail export');
});

test('a genuine zero retains a numeric count and citation while unavailable catalogues fail closed', async () => {
  const zero = await count({ record_type: 'divisions', date: '2024-04-01' });
  assert.equal(zero.error, undefined);
  assert.equal(zero.total, 0);
  assert.ok(zero.citations.some(citation => citation.kind === 'count' && citation.value === 0));
  for (const record_type of ['divisions', 'bills']) {
    const path = `/${record_type}/index.json`;
    for (const value of [null, {}, { [record_type]: 'malformed', count: 99 }, { [record_type]: [], count: 1 }]) {
      const unavailable = await count({ record_type }, fixture({ [path]: value }));
      assert.ok(unavailable.error, `${record_type}: ${JSON.stringify(value)}`);
      assert.notEqual(unavailable.total, 0, 'unavailable must not be presented as no records');
      assert.ok(!unavailable.citations.some(citation => citation.kind === 'count'));
    }
    const empty = await count({ record_type }, fixture({ [path]: { [record_type]: [] } }));
    assert.equal(empty.error, undefined);
    assert.equal(empty.total, 0);
  }
});

test('invalid calendar dates, conflicting periods and unsupported selector combinations fail before reads', async () => {
  const f = fixture();
  const invalid = [
    {}, { record_type: 'speeches' }, { record_type: 'divisions', unknown: true },
    { date: '2023-02-29' }, { date: '2024-04-31' }, { date: '2024-2-29' }, { month: '2024-13' },
    { year: 2024.5 }, { financial_year: '2023-25' }, { financial_year: '2023-2025' },
    { since: '2024-03-01', until: '2024-02-29' }, { since: '2024-02-30' },
    { date: '2024-02-29', month: '2024-02' }, { year: 2024, since: '2024-02-01' },
    { term: '47th', until: '2024-12-31' }, { term: '49th' },
    { jurisdiction: 'nsw', term: '47th' }, { jurisdiction: 'federal', chamber: 'nsw_lc' },
    { record_type: 'divisions', status: 'passed' }, { record_type: 'divisions', include_records: true },
    { record_type: 'bills', status: 'invented' }, { group_by: 'day' },
  ];
  for (const input of invalid) {
    const args = Object.hasOwn(input, 'record_type') ? input : { record_type: 'divisions', ...input };
    // The empty object specifically exercises the required discriminator.
    const actual = Object.keys(input).length ? args : input;
    assert.throws(() => parseToolArgs('count_records', actual), error => error.code === -32602, JSON.stringify(actual));
    await assert.rejects(callTool(f.env, 'count_records', actual), error => error.code === -32602);
  }
  assert.deepEqual(f.reads, []);
});
