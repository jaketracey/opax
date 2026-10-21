import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { MockLanguageModelV4 } from 'ai/test';

// The published tables are D1; these fixtures replace the in-process table API and record each query.
const tableQueries = [];
globalThis.__recordTables = {};
const fakeTables = { name: 'fake-table-api', setup(b) {
  b.onResolve({ filter: /^\.\.\/table-api$/ }, () => ({ path: 'fake-table-api', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: `export async function tableApi(request) {
    const url = new URL(request.url), name = url.pathname.slice('/api/table/'.length), params = Object.fromEntries(url.searchParams)
    globalThis.__recordQueries.push({ name, params })
    const rows = (globalThis.__recordTables[name] ?? (() => []))(params)
    return Response.json({ rows, total: rows.length, page: 1, pageSize: rows.length, facets: {} })
  }` }));
} };
globalThis.__recordQueries = tableQueries;
async function load(contents, plugins = [], platform = 'browser') {
  const out = await build({ stdin: { contents, resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform, format: 'esm', plugins, external: ['node:*'] });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
}
const api = { ...await load("export * from './src/agentic-ask';export * from './src/research-loop';export * from './src/research-credit';export * from './src/agentic-tools';export * from './src/tools/index';", [fakeTables]),
  ...await load("export { communityMcp } from './src/community-mcp';", [fakeTables], 'node') };
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Record tool tests must never call production or generation'); };
test.after(() => { globalThis.fetch = originalFetch; });

// Invented people, agencies and suppliers only.
const assets = {
  '/pay.json': { meta: { as_of: '2026-10-04', sources: [{ id: 'mp-determination', url: 'https://www.remtribunal.gov.au/fixture' }] }, base: [{ amount: 200000 }],
    offices: { cabinet: { label: 'Cabinet Minister', kind: 'ministerial', pct: 72.5 }, treasurer: { label: 'Treasurer', kind: 'ministerial', pct: 87.5 } },
    current: [{ name: 'Robin Example', party: 'Labor', chamber: 'senate', post: 'Minister for Fixtures (Cabinet)', pct: 72.5, salary: 345000 },
      { name: 'Sam Sample', party: 'Labor', chamber: 'representatives', post: 'Assistant Minister for Tests', pct: 25, salary: 250000 },
      { name: 'Jo Shadow', party: 'Liberal', chamber: 'representatives', post: 'Shadow Minister for Fixtures', pct: 25, salary: 250000 },
      { name: 'Lee Backbench', party: 'Greens', chamber: 'senate', post: 'Senator', pct: 0, salary: 200000 }],
    names: { 'robin example': 'P1', 'sam sample': 'P2', 'lee backbench': 'P4' }, people: { P1: { name: 'Robin Example' }, P2: { name: 'Sam Sample' }, P4: { name: 'Lee Backbench' } } },
  '/parliamentarians.json': { people: [{ name: 'Robin Example', speeches: 10 }, { name: 'Sam Sample', speeches: 5 }, { name: 'Lee Backbench', speeches: 3 }] },
  '/agencies.json': { agencies: [{ id: 'a-00000000000000000001', name: 'Department of Fixtures', total: 9e9, count: 900 }, { id: 'a-00000000000000000002', name: 'Fixtures Review Commission', total: 1e6, count: 3 }] },
  '/agencies/a-00000000000000000001.json': { id: 'a-00000000000000000001', name: 'Department of Fixtures', total: 9e9, count: 900, first_year: 2013, last_year: 2026,
    suppliers: [{ id: 's-00000000000000000001', name: 'Example Shipyards Pty Ltd', total: 4e9, count: 12 }, { id: 's-00000000000000000002', name: 'Sample Systems Ltd', total: 2e9, count: 40 }] },
  '/electorates/manifest.json': { index_url: '/electorates/releases/abc123/index.json' },
  '/electorates/releases/abc123/index.json': { electorates: [{ name: 'Westfield', jurisdiction: 'federal', state_code: 'wa' }, { name: 'Coastline', jurisdiction: 'federal', state_code: 'wa' }, { name: 'Eastfield', jurisdiction: 'federal', state_code: 'nsw' }] },
};
const env = { TABLE_DB: {}, asset: async path => structuredClone(assets[path] ?? null), origin: 'https://opax.com.au' };
const tool = name => api.getTool(name);

test('pay: MP salaries come from the record; public servants\' pay is plainly not held, with the instrument OPAX lists', async () => {
  globalThis.__recordTables.instruments = params => /departmental secretaries/.test(params.q) ? [{ id: 'F2026L00746', title: 'Remuneration Tribunal (Departmental Secretaries) Determination 2026', registered: '2026-06-18' }] : [];
  const person = await tool('parliamentary_pay').handler(env, { person: 'Robin Example' });
  assert.match(person.citations[0].text, /^Robin Example \(Labor\): \$345,000 a year as Minister for Fixtures \(Cabinet\) \(base salary plus 72\.5%\), as at 2026-10-04$/);
  const office = await tool('parliamentary_pay').handler(env, { office: 'Treasurer' });
  assert.match(office.citations[0].text, /^Treasurer: \$375,000 a year \(base salary plus 87\.5%/);
  for (const office of ['Secretary of the Department of Defence', 'agency heads', 'Foreign Affairs secretaries']) {
    const out = await tool('parliamentary_pay').handler(env, { office });
    assert.match(out.citations[0].text, /^OPAX does not hold the pay of departmental secretaries, agency heads or other public servants\./, office);
    assert.match(out.citations[0].text, /annual report/);
    assert.equal(out.citations[1].url, 'https://opax.com.au/instrument/F2026L00746');
    assert.match(out.citations[1].text, /OPAX lists this instrument but not the amounts it sets/);
    assert.ok(!out.citations.some(c => /\$/.test(c.text)), 'no figure is offered for an office OPAX does not hold');
  }
  // A Parliamentary Secretary is an MP post, not a public servant.
  const parlsec = await tool('parliamentary_pay').handler(env, { office: 'Parliamentary Secretary' });
  assert.ok(!parlsec.citations.some(c => /does not hold/.test(c.text)));
});

test('contracts: an agency phrase resolves to the largest matching buyer and lists its biggest suppliers', async () => {
  const out = await tool('contracts').handler(env, { agency: 'Fixtures', limit: 2 });
  assert.deepEqual(out.citations.map(c => c.text), [
    'Department of Fixtures: $9,000,000,000 across 900 published contracts (2013–2026)',
    'Example Shipyards Pty Ltd: $4,000,000,000 across 12 Department of Fixtures contracts',
    'Sample Systems Ltd: $2,000,000,000 across 40 Department of Fixtures contracts']);
  assert.equal(out.citations[1].url, 'https://opax.com.au/subject/supplier/s-00000000000000000001');
  const none = await tool('contracts').handler(env, { agency: 'Invented Bureau' });
  assert.equal(none.citations.length, 0); assert.match(none.notes[0], /No Commonwealth agency/);
});

test('grants: a state filters by its federal electorates, one row per recipient, and individual recipients are not named', async () => {
  tableQueries.length = 0;
  globalThis.__recordTables.grants = () => [
    { id: 'GA1', title: 'Harbour works', recipient: 'Example Ports Ltd', recipientId: 'abn:1', recipientAvailable: 1, recipientKind: 'company', agency: 'Department of Fixtures', amount: 5e6, year: 2024, electorate: 'Westfield', jurisdiction: 'federal' },
    { id: 'GA2', title: 'Harbour works stage 2', recipient: 'Example Ports Ltd', recipientId: 'abn:1', recipientAvailable: 1, recipientKind: 'company', agency: 'Department of Fixtures', amount: 4e6, year: 2025, electorate: 'Westfield', jurisdiction: 'federal' },
    { id: 'GA3', title: 'Study award', recipient: 'Private Person', recipientId: 'person:x', recipientAvailable: 1, recipientKind: 'person', agency: 'Department of Fixtures', amount: 1e6, year: 2025, electorate: 'Coastline', jurisdiction: 'federal' }];
  const out = await tool('grants').handler(env, { state: 'wa' });
  const q = tableQueries.at(-1).params;
  assert.deepEqual(JSON.parse(q['f.electorate']).sort(), ['Coastline', 'Westfield']); assert.deepEqual(JSON.parse(q['f.jurisdiction']), ['federal']); assert.equal(q.sort, 'amount:desc');
  assert.equal(out.citations.length, 2);
  assert.match(out.citations[0].text, /^Example Ports Ltd: \$5,000,000 grant "Harbour works"/);
  assert.match(out.citations[1].text, /^An individual recipient: /); assert.ok(!JSON.stringify(out).includes('Private Person'));
  const every = await tool('grants').handler(env, { state: 'wa', each: 'grant' });
  assert.equal(every.citations.length, 3);
});

test('interests: ministers are the sitting ministers without shadows; several members are summarised one line each', async () => {
  tableQueries.length = 0;
  globalThis.__recordTables.interests = () => [
    { name: 'Robin Example', category: 'shareholdings', holder: 'self', description: 'Example Bank', date: '2026-05-01', jurisdiction: 'federal' },
    { name: 'Robin Example', category: 'shareholdings', holder: 'spouse', description: 'Sample Mining', date: '2026-05-01', jurisdiction: 'federal' },
    { name: 'Sam Sample', category: 'shareholdings', holder: 'self', description: 'Fixture Fund', date: '2026-04-01', jurisdiction: 'federal' }];
  const out = await tool('declared_interests').handler(env, { ministers: true, category: 'shareholdings' });
  const q = tableQueries.at(-1).params;
  assert.deepEqual(JSON.parse(q['f.name']), ['Robin Example', 'Sam Sample']); assert.deepEqual(JSON.parse(q['f.category']), ['shareholdings']);
  assert.deepEqual(out.citations.map(c => c.text), [
    'Robin Example declared 2 shareholdings: Example Bank; Sample Mining (spouse or partner) (federal register, 2026-05-01)',
    'Sam Sample declared 1 shareholdings: Fixture Fund (federal register, 2026-04-01)']);
  assert.match(out.notes[0], /not evidence of a conflict/);
});

test('every record tool is on MCP with its registry schema, and bad input is -32602 before any read', async () => {
  const token = 'opax_' + 'B'.repeat(43);
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(v => v.toString(16).padStart(2, '0')).join('');
  let reads = 0;
  const mcpEnv = { COMMUNITY_ENABLED: 'true', COMMUNITY_ORIGIN: 'https://opax.com.au', TABLE_DB: {},
    COMMUNITY_DB: { prepare(sql) { let args; return { bind(...v) { args = v; return this; }, async first() { if (sql.startsWith('SELECT m.')) return args[0] === hash ? { id: 'm', key_id: 'k' } : null; if (sql.startsWith('INSERT INTO community_limits')) return { hits: 1 }; throw Error('Unexpected SQL'); }, async run() { return { success: true }; } }; } },
    ASSETS: { async fetch(req) { reads++; const body = assets[new URL(req.url).pathname]; return body ? Response.json(body) : new Response('missing', { status: 404 }); } } };
  const send = async (method, params) => (await api.communityMcp(new Request('https://opax.com.au/mcp', { method: 'POST', headers: { authorization: 'Bearer ' + token, accept: 'application/json, text/event-stream', 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }), mcpEnv, async () => { throw Error('no public reads'); })).json();
  const listed = (await send('tools/list', {})).result.tools;
  for (const name of ['find_records', 'parliamentary_pay', 'contracts', 'grants', 'declared_interests']) {
    const entry = listed.find(t => t.name === name);
    assert.ok(entry, name); assert.equal(entry.description, tool(name).description); assert.equal(entry.annotations.readOnlyHint, true);
    // The same tool, same schema, is on the Ask loop.
    assert.deepEqual(api.TOOL_SPECS.find(t => t.name === name).input, tool(name).inputSchema);
  }
  for (const [name, args] of [['contracts', { limit: 99 }], ['grants', { state: 'western australia' }], ['declared_interests', { category: 'yachts' }], ['parliamentary_pay', { person: 'x'.repeat(200) }], ['find_records', {}], ['grants', { from_year: 2025, to_year: 2020 }]]) {
    const rpc = await send('tools/call', { name, arguments: args });
    assert.equal(rpc.error?.code, -32602, name + JSON.stringify(args));
  }
  assert.equal(reads, 0);
  const pay = await send('tools/call', { name: 'parliamentary_pay', arguments: { person: 'Robin Example' } });
  assert.match(pay.result.structuredContent.citations[0].text, /\$345,000 a year/);
});

// ---------------------------------------------------------------- loop answers with record facts
const call = (name, args, id = 'c') => ({ type: 'tool-call', toolName: name, toolCallId: id, input: JSON.stringify(args) });
const reply = calls => ({ content: calls, finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } }, warnings: [] });
const passageId = 'b'.repeat(32) + '/t/body/0-80', passageText = 'Robin Example said the fixture contracts must be published in full.';
function loop(question, responses, scope = { people: [], parties: [], bills: [], ambiguous: false, unresolved: false }) {
  const failures = [], m = new MockLanguageModelV4({ doGenerate: responses });
  const deps = { ...env, toolEnv: { TABLE_DB: {} }, asset: env.asset,
    kb: async path => path !== '/find' ? { fulltext: { total: 7, facets: {} } } : { resources: { ['b'.repeat(32)]: { slug: 'speech-1', title: 'Contracts debate', origin: { collaborators: ['Robin Example'] }, fields: { body: { paragraphs: { [passageId]: { text: passageText } } } } } } },
    generate: async () => ({ text: '{}' }), onResearchFailure: async e => failures.push(e),
    research: api.createResearch({ model: m, modelBudgetSpent: async () => false, dailyBudget: { reserve: async () => ({ settle: async () => {} }) }, creditCooldown: api.createResearchCreditCooldown(), readRecord: async () => ({ text: passageText, speaker: 'Robin Example' }) }) };
  return api.runAgentic(question, deps, async () => {}, 40_000, api.inferPeriod(question), {}, scope).then(out => ({ out, failures, m }));
}

test('a qualitative answer leads with record facts rendered from tool rows and cites each record, then the verified points', async () => {
  const { out, failures, m } = await loop('Which suppliers got the Department of Fixtures contracts, and what was said about them?', [
    reply([call('contracts', { agency: 'Department of Fixtures', limit: 2 }, 'a'), call('search', { query: 'fixture contracts' }, 'b')]),
    reply([call('answer', { facts: [2, 3, 2, 99], points: [{ claim: 'Robin Example said the contracts must be published in full.', id: passageId, quote: 'the fixture contracts must be published in full' }] }, 'c')])]);
  assert.deepEqual(failures, []); assert.equal(out.answered, true); assert.equal(out.research.mode, 'loop');
  const lines = out.answer.split('\n\n');
  assert.equal(lines[0], 'Example Shipyards Pty Ltd recorded $4,000,000,000 across 12 Department of Fixtures contracts.');
  assert.equal(lines[1], 'Sample Systems Ltd recorded $2,000,000,000 across 40 Department of Fixtures contracts.');
  const point=lines.find(line=>line.includes('Robin Example said'));
  assert.equal(point, '- Robin Example said the contracts must be published in full.');
  assert.match(out.answer, /published contract values/);
  assert.deepEqual(out.qualitative.citations['fact-2/t/body/0'], [[0, lines[0].length]]);
  const pointStart = Array.from(out.answer.slice(0,out.answer.indexOf(point)+2)).length;
  assert.deepEqual(out.qualitative.citations[passageId], [[pointStart, pointStart + Array.from(point.slice(2)).length]]);
  assert.equal(out.qualitative.sources.find(s => s.resource === 'fact-2').url, 'https://opax.com.au/subject/supplier/s-00000000000000000001');
  // Tool output shows each fact once, with global ids.
  assert.match(JSON.stringify(m.doGenerateCalls[1].prompt).replace(/\\"/g, '"'), /"id":2,"text":"Example Shipyards/);
});

test('record facts obey the named scope: an overall count is refused for a named person; an unresolved person blocks facts', async () => {
  const scope = { people: ['Robin Example'], parties: [], bills: [], ambiguous: false, unresolved: false };
  const named = await loop('What has Robin Example said about gambling, and how often?', [
    reply([call('count_speeches', { topic: 'gambling', group_by: 'none' }, 'a'), call('count_speeches', { topic: 'gambling', speaker: 'Robin Example', group_by: 'none' }, 'b')]),
    reply([call('answer', { facts: [1, 2] }, 'c')])], scope);
  assert.deepEqual(named.failures, []); assert.equal(named.out.answered, true);
  assert.equal(named.out.answer.split('\n')[0], 'There were 7 chamber speeches labelled gambling by Robin Example.');
  assert.ok(!named.out.answer.split('\n').includes('- 7 chamber speeches labelled gambling'));
  const unresolved = await loop('What has Pat Unknownname said about contracts?', [
    reply([call('parliamentary_pay', { person: 'Robin Example' }, 'a')]), reply([call('answer', { facts: [1] }, 'b')]), reply([call('answer', { facts: [1] }, 'c')])],
    { people: [], parties: [], bills: [], ambiguous: false, unresolved: true });
  assert.equal(unresolved.out.research.mode, 'planner'); assert.equal(unresolved.failures[0].reason, 'grounding');
});

test('finish outside the numerical shapes answers with record facts only', async () => {
  const { out, failures } = await loop('Which suppliers got the Department of Fixtures contracts?', [
    reply([call('contracts', { agency: 'Fixtures', limit: 1 }, 'a')]), reply([call('finish', { facts: [1, 2] }, 'b')])]);
  assert.deepEqual(failures, []); assert.equal(out.answered, true);
  assert.match(out.answer,/^Example Shipyards Pty Ltd recorded \$4,000,000,000/);assert.match(out.answer,/Department of Fixtures recorded \$9,000,000,000 across 900 published contracts \(2013–2026\)/);
});

test('person_quotes on MCP: one person\'s own speeches, newest first, one excerpt per speech, each checked in their own turn', async () => {
  const token = 'opax_' + 'C'.repeat(43);
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(v => v.toString(16).padStart(2, '0')).join('');
  const turn = 'We must cap poker machine losses at one dollar a spin, and the industry has fought every reform.';
  const records = { 'speech-1': { text: turn, speaker: 'Robin Example' }, 'speech-2': { text: 'Another member spoke first.\n\nRobin Example: ' + turn, speaker: 'Robin Example' }, 'speech-3': { text: turn, speaker: 'Casey Sample' } };
  const results = [
    { slug: 'speech-1', speaker: 'Robin Example', date: '2012-05-10', title: 'Gambling', party: 'Labor', snippet: '… cap poker machine losses at one dollar a spin …' },
    { slug: 'speech-1', speaker: 'Robin Example', date: '2012-05-10', title: 'Gambling', party: 'Labor', snippet: 'the industry has fought every reform' },
    { slug: 'speech-4', speaker: 'Robin Example', date: '2020-01-01', title: 'Gambling again', party: 'Labor', snippet: 'words that are not in the record at all here' },
    { slug: 'speech-3', speaker: 'Casey Sample', date: '2024-01-01', title: 'Other', party: 'Greens', snippet: 'cap poker machine losses at one dollar a spin' }];
  records['speech-4'] = { text: turn, speaker: 'Robin Example' };
  const reads = [];
  const mcpEnv = { COMMUNITY_ENABLED: 'true', COMMUNITY_ORIGIN: 'https://opax.com.au', TABLE_DB: {},
    COMMUNITY_DB: { prepare(sql) { let args; return { bind(...v) { args = v; return this; }, async first() { if (sql.startsWith('SELECT m.')) return args[0] === hash ? { id: 'm', key_id: 'k' } : null; if (sql.startsWith('INSERT INTO community_limits')) return { hits: 1 }; throw Error('Unexpected SQL'); }, async run() { return { success: true }; } }; } },
    ASSETS: { async fetch(req) { return new URL(req.url).pathname === '/parliamentarians.json' ? Response.json(assets['/parliamentarians.json']) : new Response('missing', { status: 404 }); } } };
  const readPublic = async path => { reads.push(path); if (path.startsWith('/api/search-all?')) return Response.json({ results }); const slug = decodeURIComponent(path.split('/').pop()); return records[slug] ? Response.json(records[slug]) : new Response('{}', { status: 404 }); };
  const rpc = await (await api.communityMcp(new Request('https://opax.com.au/mcp', { method: 'POST', headers: { authorization: 'Bearer ' + token, accept: 'application/json, text/event-stream', 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'person_quotes', arguments: { person: 'Robin Example', topic: 'poker machines' } } }) }), mcpEnv, readPublic)).json();
  const out = JSON.parse(rpc.result.content[0].text);
  assert.equal(out.person, 'Robin Example');
  assert.deepEqual(out.passages.map(p => [p.slug, p.excerpt]), [['speech-1', 'cap poker machine losses at one dollar a spin']]);
  assert.match(new URLSearchParams(reads[0].split('?')[1]).get('speaker'), /^Robin Example$/);
  assert.ok(!JSON.stringify(out).includes('Casey Sample'));
});
