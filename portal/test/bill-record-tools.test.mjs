import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
// MCP adds two fields that Ask's copy of a result does not carry: the record-text notice and a former-name note.
const mcpOnly = value => { if (!value || typeof value !== 'object' || Array.isArray(value)) return value; const { record_text_notice, deprecated, ...rest } = value; return rest; };

// Discovery ranking is covered by the catalogue tests. These tests retain the
// real tool registry, Ask adapter, bill asset reader and authenticated MCP path.
const catalogueFixture = { name: 'bill-catalogue-fixture', setup(builder) {
  builder.onLoad({ filter: /\/catalog-search\.ts$/ }, () => ({ loader: 'js', contents: `
    export const CATALOG_KINDS = new Set(['bill', 'person']);
    export async function searchCatalog(url, assets) {
      const kind = url.searchParams.get('kind');
      const results = assets.catalogueRows.filter(row => kind === 'all' || row.kind === kind);
      return { results: structuredClone(results), total: results.length };
    }
  ` }));
} };
const compiled = await build({
  stdin: {
    contents: "export { callTool, askToolSpecs } from './src/tools/index'; export { communityMcp } from './src/community-mcp'; export { factSheet } from './src/agentic-ask';",
    resolveDir: new URL('../', import.meta.url).pathname,
  },
  bundle: true, write: false, platform: 'node', format: 'esm', plugins: [catalogueFixture],
});
const { callTool, askToolSpecs, communityMcp, factSheet } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Bill record unit tests must not make network requests'); };
test.after(() => { globalThis.fetch = originalFetch; });

const key = 'au-federal-r99991';
const title = 'Sample Estuary Protection Bill 2026';
const page = 'https://opax.com.au/bill/' + key;
const source = 'https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation/Bills_Search_Results/Result?bId=r99991';
const catalogueBill = { kind: 'bill', title, href: '/bill/' + key, slug: key, resource: key, snippet: 'A machine-written summary does not give lifecycle dates.', date: '2026-10-09', dateLabel: '2026' };
const stage = (name, date, house) => ({ stage: name, date, house, url: source });
const complete = {
  key, title, short_title: title, jurisdiction: 'federal', parliament: 48,
  introduced: '2026-07-14', originating_house: 'representatives',
  sponsor: 'Robin Example', sponsor_party: 'Labor', sponsor_person_id: 'person-fixture', portfolio: 'Environment',
  status: 'passed', status_as_of: '2026-10-09',
  key_dates: [
    stage('introduced', '2026-07-14', 'representatives'),
    stage('second_reading', '2026-07-15', 'representatives'),
    stage('third_reading', '2026-08-05', 'representatives'),
    stage('introduced', '2026-08-10', 'senate'),
    stage('second_reading', '2026-08-11', 'senate'),
    stage('third_reading', '2026-09-03', 'senate'),
    stage('passed', '2026-09-04', 'senate'),
    stage('royal_assent', '2026-09-08', 'senate'),
  ],
  acts: [{ title: 'Sample Estuary Protection Act 2026', frl_uri: 'https://www.legislation.gov.au/C2026A00071', assent_date: '2026-09-08', act_number: '71, 2026' }],
  sources: [{ kind: 'bill', url: source }],
};

const token = 'opax_' + 'B'.repeat(43);
const tokenHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(value => value.toString(16).padStart(2, '0')).join('');
function fixture(detail = complete, catalogueRows = [catalogueBill], details = { [key]: detail }) {
  const paths = [];
  const assets = {
    catalogueRows,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      paths.push(path);
      if (path === '/bills/index.json') return new Response('missing', { status: 404 });
      const selectedKey = /^\/bills\/(au-[a-z0-9-]+)\.json$/.exec(path)?.[1];
      assert.ok(selectedKey && Object.hasOwn(details, selectedKey), 'only the matched bill detail may be fetched');
      const selected = details[selectedKey];
      if (selected instanceof Response) return selected.clone();
      if (selected instanceof Error) throw selected;
      return selected === null ? new Response('missing', { status: 404 }) : Response.json(selected);
    },
  };
  const env = {
    COMMUNITY_ENABLED: 'true', COMMUNITY_ORIGIN: 'https://opax.com.au', ASSETS: assets,
    COMMUNITY_DB: { prepare(sql) {
      let args;
      return { bind(...values) { args = values; return this; }, async first() {
        if (sql.startsWith('SELECT m.')) return args[0] === tokenHash ? { id: 'fixture-member', key_id: 'fixture-key' } : null;
        if (sql.startsWith('INSERT INTO community_limits')) return { hits: 1 };
        throw Error('Unexpected fixture SQL');
      }, async run() { return { success: true }; } };
    } },
  };
  return { env, paths, async ask(args) {
    return askToolSpecs.find(tool => tool.name === 'find_records').run({
      toolEnv: env, origin: 'https://opax.com.au',
      asset: async path => { const response = await assets.fetch(new Request('https://fixture.test' + path)); return response.ok ? response.json() : null; },
      kb: async () => { throw Error('Bill lifecycle queries must not search speeches'); },
    }, args);
  }, async mcp(args) {
    const response = await communityMcp(new Request('https://fixture.test/mcp', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'find_records', arguments: args } }),
    }), env, async () => { throw Error('Bill registry queries must not make public API calls'); });
    assert.equal(response.status, 200);
    return (await response.json()).result;
  } };
}

test('bill discovery exposes the recorded lifecycle, sponsor, passage and Act details', async () => {
  const f = fixture();
  const result = await callTool(f.env, 'find_records', { query: title, kind: 'bill' });
  assert.equal(result.error, undefined);
  const row = result.rows[0];
  assert.equal(row.key, key);
  assert.equal(row.url, page);
  assert.equal(row.lifecycle_available, true);
  for (const field of ['introduced', 'originating_house', 'sponsor', 'sponsor_party', 'sponsor_person_id', 'portfolio', 'status', 'status_as_of']) assert.equal(row[field], complete[field], field);
  assert.deepEqual(row.key_dates, complete.key_dates);
  assert.equal(row.passed_both_houses, true);
  assert.equal(row.passed_both_houses_date, '2026-09-04');
  assert.equal(row.royal_assent, '2026-09-08');
  assert.equal(row.act_number, '71, 2026');
  assert.deepEqual(row.acts, complete.acts);
  assert.deepEqual(row.sponsors, ['Robin Example']);
  assert.deepEqual(f.paths, ['/bills/index.json', '/bills/' + key + '.json']);
  const evidence = result.citations.map(citation => citation.text).join('\n');
  for (const value of ['14 July 2026', '4 September 2026', '8 September 2026', 'Robin Example', '71, 2026']) assert.ok(evidence.includes(value), value + ' reaches the model as a cited fact');
  assert.match(evidence, /representatives|House of Representatives/i);
  assert.match(evidence, /senate/i);
  const assentFacts = result.citations.filter(citation => /royal assent/i.test(citation.text));
  assert.ok(assentFacts.length > 0);
  for (const citation of assentFacts) assert.doesNotMatch(citation.text, /in the Senate/i, 'an inherited table heading is not a chamber giving royal assent');
  assert.ok(result.citations.every(citation => [page, source, complete.acts[0].frl_uri].includes(citation.url)));
});

test('Ask and public MCP return the same lifecycle fields and date-first evidence', async () => {
  for (const [query, date, action] of [
    ['When was the Sample Estuary Protection Bill 2026 introduced?', 'On 14 July 2026', /introduc/i],
    ['When did the Sample Estuary Protection Bill 2026 receive royal assent?', 'On 8 September 2026', /royal assent/i],
  ]) {
    const f = fixture(), args = { query, kind: 'bill' };
    const ask = await f.ask(args), rpc = await f.mcp(args);
    assert.equal(ask.ok, true);
    assert.equal(rpc.isError, false);
    assert.deepEqual(mcpOnly(rpc.structuredContent), ask.data);
    assert.deepEqual(mcpOnly(JSON.parse(rpc.content[0].text)), ask.data);
    const first = factSheet([ask]).facts[0];
    assert.ok(first.text.startsWith(date), 'the requested date is the first cited answer fact');
    assert.match(first.text, action);
    assert.ok([page, source, complete.acts[0].frl_uri].includes(first.cite.url));
  }
});

test('status timestamps and one chamber third reading do not invent introduction, passage or assent', async () => {
  const detail = {
    key, title, status: 'passed', status_as_of: '2026-10-09',
    key_dates: [stage('third_reading', '2026-09-03', 'senate')], acts: [],
  };
  const result = await callTool(fixture(detail).env, 'find_records', { query: title, kind: 'bill' });
  const row = result.rows[0];
  assert.equal(row.lifecycle_available, true);
  for (const field of ['introduced', 'originating_house', 'passed_both_houses', 'passed_both_houses_date', 'royal_assent', 'act_number', 'sponsor', 'sponsor_party', 'sponsor_person_id', 'portfolio']) assert.equal(row[field], null, field + ' is unknown');
  assert.deepEqual(row.acts, []);
  assert.equal(row.status_as_of, '2026-10-09');
  assert.ok(!result.citations.some(citation => /2026-10-09.*(?:introduced|royal assent)|(?:introduced|royal assent).*2026-10-09/i.test(citation.text)));
});

test('an Act assent date is evidence, but an FRL identifier does not invent an Act number', async () => {
  const detail = {
    key, title, status: 'passed', status_as_of: '2026-10-09', key_dates: [],
    acts: [{ title: 'Sample Estuary Protection Act 2026', frl_uri: 'https://www.legislation.gov.au/C2026A00071', assent_date: '2026-09-08' }],
  };
  const row = (await callTool(fixture(detail).env, 'find_records', { query: title, kind: 'bill' })).rows[0];
  assert.equal(row.royal_assent, '2026-09-08');
  assert.equal(row.act_number, null);
  assert.equal(row.acts[0].act_number, null);
});

test('explicit aggregate lifecycle fields are available even without stage or Act rows', async () => {
  const detail = {
    key, title, introduced: '2026-07-14', originating_house: 'representatives',
    passed_both_houses: true, passed_both_houses_date: '2026-09-04',
    royal_assent: '2026-09-08', act_number: '71, 2026', key_dates: [], acts: [],
  };
  const result = await callTool(fixture(detail).env, 'find_records', { query: title, kind: 'bill' });
  const row = result.rows[0];
  for (const field of ['introduced', 'originating_house', 'passed_both_houses', 'passed_both_houses_date', 'royal_assent', 'act_number']) assert.equal(row[field], detail[field], field);
  assert.deepEqual(row.key_dates, []);
  assert.deepEqual(row.acts, []);
  const evidence = result.citations.map(citation => citation.text).join('\n');
  assert.match(evidence, /4 September 2026.*passed both houses/);
  assert.match(evidence, /8 September 2026.*royal assent.*71, 2026/);
});

test('explicit passage without a date reaches the model without borrowing a status timestamp', async () => {
  const detail = { key, title, passed_both_houses: true, status: 'passed', status_as_of: '2026-10-09', key_dates: [], acts: [] };
  const result = await callTool(fixture(detail).env, 'find_records', { query: 'Has the Sample Estuary Protection Bill 2026 passed both houses?', kind: 'bill' });
  assert.equal(result.rows[0].passed_both_houses, true);
  assert.equal(result.rows[0].passed_both_houses_date, null);
  assert.match(result.citations[0].text, /passed both houses.*does not establish a passage date/);
  assert.doesNotMatch(result.citations[0].text, /9 October|2026-10-09/);
});

test('conflicting passage dates stay in the lifecycle but do not become a single passage date', async () => {
  const key_dates = [stage('passed', '2026-09-04', 'representatives'), stage('passed_both_houses', '2026-09-07', 'senate')];
  const detail = { key, title, status: 'passed', key_dates, acts: [] };
  const result = await callTool(fixture(detail).env, 'find_records', { query: 'When did the Sample Estuary Protection Bill 2026 pass both houses?', kind: 'bill' });
  assert.equal(result.rows[0].passed_both_houses, true);
  assert.equal(result.rows[0].passed_both_houses_date, null);
  assert.deepEqual(result.rows[0].key_dates, key_dates);
  assert.match(result.citations[0].text, /passed both houses.*does not establish a passage date/);
  assert.ok(!result.citations.some(citation => /^On .*passed both houses/.test(citation.text)));
});

test('raw uppercase comma-formatted sponsor names are preserved and become readable cited names', async () => {
  const detail = { ...complete, sponsor: 'EXAMPLE, Robin, MP' };
  const result = await callTool(fixture(detail).env, 'find_records', { query: 'Who sponsored the Sample Estuary Protection Bill 2026?', kind: 'bill' });
  assert.equal(result.rows[0].sponsor, 'EXAMPLE, Robin, MP');
  assert.match(result.citations[0].text, /^Robin Example \(Labor\).*recorded sponsor/);
  assert.doesNotMatch(result.citations[0].text, /EXAMPLE, Robin/);
});

test('a private-member sponsor label is not presented as a ministerial portfolio', async () => {
  const detail = { ...complete, sponsor: null, sponsor_party: null, portfolio: '(s) WILKIE, Andrew, MP' };
  const result = await callTool(fixture(detail).env, 'find_records', { query: title, kind: 'bill' });
  assert.ok(!result.citations.some(citation => /portfolio/i.test(citation.text)), 'the source column also holds private-member names');
});

test('private co-sponsors and Mc or Jnr names retain each member and their spelling', async () => {
  const raw = 'MCDONALD, Sam, MPEXAMPLE, Robin, MP';
  const detail = { ...complete, sponsor: null, sponsor_party: null, sponsor_person_id: null, portfolio: '(s) ' + raw };
  const coSponsored = await callTool(fixture(detail).env, 'find_records', { query: 'Who sponsored the Sample Estuary Protection Bill 2026?', kind: 'bill' });
  assert.equal(coSponsored.rows[0].portfolio, null);
  assert.equal(coSponsored.rows[0].sponsor, raw);
  assert.deepEqual(coSponsored.rows[0].sponsors, ['Sam McDonald', 'Robin Example']);
  assert.match(coSponsored.citations[0].text, /^Sam McDonald; Robin Example are the recorded sponsors/);
  const junior = await callTool(fixture({ ...detail, sponsor: 'EXAMPLE, Robin, Jnr, MP', portfolio: null }).env, 'find_records', { query: 'Who sponsored the Sample Estuary Protection Bill 2026?', kind: 'bill' });
  assert.equal(junior.rows[0].sponsor, 'EXAMPLE, Robin, Jnr, MP');
  assert.deepEqual(junior.rows[0].sponsors, ['Robin Example Jnr']);
  assert.match(junior.citations[0].text, /^Robin Example Jnr is the recorded sponsor/);
});

test('every listed sponsor carries their own recorded party, not the first sponsor party for all (bills-006)', async () => {
  const detail = { ...complete, sponsor: 'EXAMPLE, Robin, MP', sponsor_party: 'Labor', portfolio: null,
    sponsors: [{ name: 'EXAMPLE, Robin, MP', person_id: 'person-fixture', party: 'Labor' },
      { name: 'MCDONALD, Sam, MP', person_id: null, party: 'Greens' }, { name: 'OTHER, Alex, MP', person_id: null, party: null }] };
  const result = await callTool(fixture(detail).env, 'find_records', { query: 'Who sponsored the Sample Estuary Protection Bill 2026?', kind: 'bill' });
  assert.deepEqual(result.rows[0].sponsors, ['Robin Example', 'Sam McDonald', 'Alex Other']);
  assert.match(result.citations[0].text, /^Robin Example \(Labor\); Sam McDonald \(Greens\); Alex Other are the recorded sponsors/);
});

test('an exposure draft is released for consultation, not introduced (bills-013)', async () => {
  const detail = { ...complete, status: 'exposure_draft', originating_house: null, introduced: '2026-09-08', key_dates: [], acts: [] };
  const result = await callTool(fixture(detail).env, 'find_records', { query: title, kind: 'bill' });
  assert.ok(result.citations.some(c => /^On 8 September 2026, the .* was released as an exposure draft for consultation\.$/.test(c.text)));
  assert.ok(!result.citations.some(c => /was first introduced/.test(c.text)));
});

test('oversized multi-bill discovery retains complete returned lifecycles within the Ask result cap', async () => {
  const rows = [], details = {};
  for (let index = 0; index < 8; index++) {
    const selectedKey = 'au-federal-r' + (99991 + index);
    const selectedTitle = `Sample Estuary Protection and Coastal Restoration Amendment Bill (No. ${index + 1}) 2026`;
    rows.push({ ...catalogueBill, title: selectedTitle, href: '/bill/' + selectedKey, slug: selectedKey, resource: selectedKey });
    details[selectedKey] = { ...structuredClone(complete), key: selectedKey, title: selectedTitle,
      introduced: '2026-09-01', royal_assent: '2026-09-18', status_as_of: '2026-09-18',
      acts: [{ ...complete.acts[0], title: selectedTitle.replace('Bill', 'Act'), assent_date: '2026-09-18' }],
      key_dates: Array.from({ length: 18 }, (_, eventIndex) => stage(
        eventIndex === 17 ? 'royal_assent' : eventIndex === 16 ? 'passed' : [0, 9].includes(eventIndex) ? 'introduced' : [7, 15].includes(eventIndex) ? 'third_reading' : 'second_reading',
        '2026-09-' + String(eventIndex + 1).padStart(2, '0'),
        eventIndex < 9 ? 'representatives' : 'senate',
      )),
    };
  }
  const f = fixture(null, rows, details);
  const result = await callTool(f.env, 'find_records', { query: 'Sample Estuary', kind: 'bill' });
  assert.equal(result.error, undefined);
  assert.equal(result.total, 8, 'the catalogue total is preserved when whole hits are omitted');
  assert.equal(result.truncated, true);
  assert.ok(result.rows.length > 0 && result.rows.length < 8);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 16_384, 'the tool result can pass the research-loop JSON cap');
  assert.match(result.notes.join(' '), /narrow|truncat|limit|omit/i);
  for (const row of result.rows) {
    assert.equal(row.lifecycle_available, true);
    assert.deepEqual(row.key_dates, details[row.key].key_dates, 'returned bill stages must remain complete');
    assert.deepEqual(row.acts, details[row.key].acts);
    assert.ok(result.citations.some(citation => citation.text.includes(row.title)), 'every returned bill retains its cited evidence');
  }
});

test('invalid and impossible ISO dates remain unknown throughout lifecycle evidence', async () => {
  const detail = {
    key, title, introduced: '2026-02-30', royal_assent: '2026-99-15',
    passed_both_houses_date: 'not a date', status: 'passed', status_as_of: '2026-13-01',
    key_dates: [stage('introduced', '2026-02-30', 'representatives'), stage('royal_assent', '2026-09-31', 'senate')],
    acts: [{ title: 'Sample Estuary Protection Act 2026', assent_date: '2026-00-05' }],
  };
  const result = await callTool(fixture(detail).env, 'find_records', { query: title, kind: 'bill' });
  const row = result.rows[0];
  for (const field of ['introduced', 'passed_both_houses_date', 'royal_assent', 'status_as_of']) assert.equal(row[field], null, field);
  assert.ok(row.key_dates.every(event => event.date === null));
  assert.equal(row.acts[0].assent_date, null);
  assert.doesNotMatch(result.citations.map(citation => citation.text).join('\n'), /2026-02-30|2026-99-15|2026-13-01|2026-09-31|2026-00-05|Invalid Date/);
});

test('missing, unreadable, failed or mismatched bill detail preserves the hit with explicit unknowns', async () => {
  for (const detail of [null, new Response('invalid JSON'), new Error('asset unavailable'), { ...complete, key: 'au-federal-rdifferent' }]) {
    const result = await callTool(fixture(detail).env, 'find_records', { query: title, kind: 'bill' });
    assert.equal(result.error, undefined);
    assert.equal(result.rows.length, 1);
    const row = result.rows[0];
    assert.equal(row.title, title);
    assert.equal(row.url, page);
    assert.equal(row.lifecycle_available, false);
    for (const field of ['introduced', 'originating_house', 'passed_both_houses', 'passed_both_houses_date', 'royal_assent', 'act_number', 'sponsor', 'sponsor_party', 'sponsor_person_id', 'portfolio', 'status', 'status_as_of']) assert.equal(row[field], null, field);
    assert.deepEqual(row.key_dates, []);
    assert.deepEqual(row.acts, []);
    assert.deepEqual(row.sponsors, []);
  }
});

test('non-bill catalogue rows remain discovery hits without bill lifecycle fields', async () => {
  const person = { kind: 'person', title: 'Robin Example', snippet: 'A member of parliament.', href: '/subject/person/robin-example', slug: 'robin-example', resource: 'person-fixture' };
  const f = fixture(complete, [person, catalogueBill]);
  const result = await callTool(f.env, 'find_records', { query: 'Sample Estuary' });
  assert.deepEqual(result.rows[0], { kind: 'person', title: person.title, summary: person.snippet, url: 'https://opax.com.au' + person.href });
  assert.equal(result.rows[1].introduced, complete.introduced);
  assert.deepEqual(f.paths, ['/bills/' + key + '.json']);
});

test('a malformed bill link cannot choose an asset outside the bill directory', async () => {
  const f = fixture(complete, [{ ...catalogueBill, href: '/bill/../../private', slug: '../../private' }]);
  const result = await callTool(f.env, 'find_records', { query: title, kind: 'bill' });
  assert.deepEqual(f.paths, ['/bills/index.json']);
  assert.equal(result.rows[0].lifecycle_available, false);
  assert.equal(result.rows[0].introduced, null);
});
