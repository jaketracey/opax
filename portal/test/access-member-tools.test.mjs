import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
// MCP adds two fields that Ask's copy of a result does not carry: the record-text notice and a former-name note.
const mcpOnly = value => { if (!value || typeof value !== 'object' || Array.isArray(value)) return value; const { record_text_notice, deprecated, ...rest } = value; return rest; };

const built = await build({ stdin: { contents: "export {callTool, askToolSpecs, listTools, ToolInputError} from './src/tools/index'; export {communityMcp} from './src/community-mcp';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const savedFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Access/member unit tests must not make network requests'); };
test.after(() => { globalThis.fetch = savedFetch; });
const cache = new Map();
async function asset(path) {
  assert.match(path, /^\/[a-zA-Z0-9/_-]+\.json$/); assert.ok(!path.includes('..'));
  if (!cache.has(path)) cache.set(path, JSON.parse(await readFile(new URL('../public' + path, import.meta.url), 'utf8')));
  return cache.get(path);
}
const assets = { async fetch(req) { try { return Response.json(await asset(new URL(req.url).pathname)); } catch (e) { if (e.code === 'ENOENT') return new Response('missing', { status: 404 }); throw e; } } };
const env = { asset, ASSETS: assets, origin: 'https://opax.test' };
function cited(out, requireRows = true) {
  assert.equal(out.error, undefined, JSON.stringify(out));
  if (requireRows) assert.ok(out.rows.length, JSON.stringify(out));
  assert.ok(out.citations.length);
  for (const c of out.citations) { assert.match(c.url, /^https?:\/\//); assert.ok(c.text.length > 10); }
  assert.ok(Buffer.byteLength(JSON.stringify(out)) <= 14000);
}
async function invalid(name, args) {
  let reads = 0;
  await assert.rejects(() => api.callTool({ asset: async () => { reads++; throw Error('No reads for invalid input'); } }, name, args), e => e instanceof api.ToolInputError && e.code === -32602);
  assert.equal(reads, 0);
}

for (const [register, args] of [['meetings', { minister: 'Chris Minns' }], ['lobbyists', { client: 'Westpac' }], ['fits', { minister: 'Tony Abbott', status: 'current' }]]) {
  test('access ' + register + ': real row shapes, citations and stable detail IDs', async () => {
    const out = await api.callTool(env, 'access_registers', { register, ...args, limit: 2 }); cited(out);
    const row = out.rows[0], detail = await api.callTool(env, 'access_registers', row.follow_up); cited(detail);
    assert.equal(detail.rows[0].record_id, row.record_id);
    for (const field of ['minister', 'organisation', 'lobbyist', 'registrant', 'principal', 'date']) if (row[field] !== undefined) assert.equal(detail.rows[0][field], row[field]);
    if (register === 'fits') assert.match(out.citations[1].url, /^https:\/\/foreigninfluence\.ag\.gov\.au\/Profile\//);
    else { assert.equal(row.source_url, null); assert.match(row.source_status, /omitted/); assert.equal(out.citations[1].url, 'https://opax.test/access.json'); }
  });
  test('access ' + register + ': empty selection does not invent a register-wide zero', async () => {
    const out = await api.callTool(env, 'access_registers', { register, organisation: 'Zqx Unknown Organisation' });
    assert.equal(out.error, undefined); assert.deepEqual(out.rows, []); assert.equal(out.counts.retained_matches, 0); assert.match(out.notes.join(' '), /does not establish/);
  });
  test('access ' + register + ': invalid dates before any read', () => invalid('access_registers', { register, since: '2026-02-30' }));
}
test('minister counts distinguish all-time totals, dated samples and exact organisation labels', async () => {
  const all = await api.callTool(env, 'access_registers', { register: 'meetings', minister: 'Chris Minns' }); cited(all);
  assert.equal(all.published_totals.meetings, 965); assert.equal(all.published_totals.external_meetings, 918); assert.equal(all.counts.exact_count, null);
  const period = await api.callTool(env, 'access_registers', { register: 'meetings', minister: 'Chris Minns', since: '2026-04-01', until: '2026-06-30', jurisdiction: 'nsw' }); cited(period);
  assert.equal(period.published_totals, null); assert.equal(period.counts.exact_count, null); assert.equal(period.counts.complete_for_projection, false);
  assert.ok(period.rows.every(r => r.date >= '2026-04-01' && r.date <= '2026-06-30'));
  const pair = await api.callTool(env, 'access_registers', { register: 'meetings', minister: 'Chris Minns', organisation: 'Unions NSW' });
  assert.equal(pair.published_totals.meetings, 58); assert.equal(pair.counts.exact_count, null);
  const conflicting = await api.callTool(env, 'access_registers', { register: 'meetings', minister: 'Chris Minns', organisation: 'Unions NSW', client: 'Police Association NSW' });
  assert.equal(conflicting.published_totals, null);
  const alias = await api.callTool(env, 'access_registers', { register: 'meetings', minister: 'Minns', jurisdiction: 'nsw' }); cited(alias);
  assert.equal(alias.published_totals.minister, 'Chris Minns');
});
test('complete retained organisation profile supports a dated count, and detail keeps its identity', async () => {
  const out = await api.callTool(env, 'access_registers', { register: 'meetings', organisation: 'Westpac Banking Corporation', since: '2023-01-01', until: '2023-12-31', jurisdiction: 'nsw', limit: 1 }); cited(out);
  const raw = (await asset('/access.json')).donors['Westpac Banking Corporation'];
  const expected = raw.meetings.filter(r => r.date >= '2023-01-01' && r.date <= '2023-12-31' && r.jurisdiction === 'nsw').length;
  assert.equal(out.counts.exact_count, expected); assert.equal(out.counts.complete_for_projection, true); assert.equal(out.published_totals, null);
  const detail = await api.callTool(env, 'access_registers', out.rows[0].follow_up); cited(detail); assert.equal(detail.rows[0].minister, out.rows[0].minister); assert.equal(detail.rows[0].date, out.rows[0].date);
  if (out.next_offset !== null) { const next = await api.callTool(env, 'access_registers', { register: 'meetings', organisation: 'Westpac Banking Corporation', since: '2023-01-01', until: '2023-12-31', jurisdiction: 'nsw', limit: 1, offset: out.next_offset }); assert.notEqual(next.rows[0].record_id, out.rows[0].record_id); }
});
test('lobbyist, client, jurisdiction and registration-date filters preserve date uncertainty', async () => {
  const out = await api.callTool(env, 'access_registers', { register: 'lobbyists', client: 'Westpac', lobbyist: 'SEC Newgate', jurisdiction: 'federal' }); cited(out);
  assert.equal(out.rows[0].lobbyist, 'SEC Newgate Pty Limited'); assert.equal(out.counts.exact_count, 1);
  assert.match(out.rows[0].status_scope, /at least one/); assert.match(out.citations[1].text, /not every jurisdiction/);
  const dated = await api.callTool(env, 'access_registers', { register: 'lobbyists', client: 'Westpac', since: '2024-01-01', until: '2024-12-31' }); cited(dated);
  assert.equal(dated.counts.exact_count, null); assert.ok(dated.counts.date_unavailable > 0); assert.equal(dated.published_totals, null);
});
test('FITS interval overlap and deduplication count registration terms rather than names', async () => {
  const out = await api.callTool(env, 'access_registers', { register: 'fits', minister: 'Tony Abbott', since: '2024-01-01', until: '2024-12-31' }); cited(out);
  assert.ok(out.rows.some(r => r.from < '2024-01-01'));
  assert.equal(out.counts.exact_count, out.total);
  const duplicate = structuredClone(await asset('/fits.json'));
  duplicate.people['another alias'] = duplicate.people['tony abbott'];
  const fixture = { ...env, asset: async path => path === '/fits.json' ? duplicate : asset(path) };
  const a = await api.callTool(env, 'access_registers', { register: 'fits' }), b = await api.callTool(fixture, 'access_registers', { register: 'fits' });
  assert.equal(a.total, b.total);
});
test('access original entry URLs are used when supplied, never replaced with latest diary links', async () => {
  const data = structuredClone(await asset('/access.json'));
  data.ministers['chris minns'].recent[0].source_url = 'https://register.example/diary/entry-1';
  const out = await api.callTool({ ...env, asset: async () => data }, 'access_registers', { register: 'meetings', minister: 'Chris Minns', limit: 1 }); cited(out);
  assert.equal(out.rows[0].source_url, 'https://register.example/diary/entry-1'); assert.equal(out.citations[1].url, out.rows[0].source_url);
  await invalid('access_registers', { register: 'lobbyists', minister: 'Chris Minns' });
  await invalid('access_registers', { register: 'meetings', organisation: '   ' });
});

test('member division history: real party dissent, row IDs and original citations', async () => {
  const out = await api.callTool(env, 'member_divisions', { person: 'Christopher Back', chamber: 'senate', since: '2015-03-18', until: '2015-03-18', topic: 'Housing Affordability' }); cited(out);
  const row = out.rows.find(r => r.division_id === 'federal-senate-3719'); assert.ok(row);
  assert.equal(row.vote, 'aye'); assert.equal(row.party_majority, 'no'); assert.equal(row.against_party_majority, true);
  assert.ok(out.counts.against_party_majority >= 1); assert.equal(row.follow_up.tool, 'division'); assert.equal(row.follow_up.arguments.division_id, row.division_id);
  assert.equal(out.citations.find(c => c.kind === 'record').url, (await asset('/divisions/division-federal-senate-3719.json')).source_url);
});
test('member division pagination has disjoint segments, complete counts only after the full scan, and no skipped rows', async () => {
  const args = { person: 'David Shoebridge', chamber: 'senate', since: '2026-10-15', until: '2026-10-15', limit: 2, scan_limit: 12 };
  let out = await api.callTool(env, 'member_divisions', args), previous = 0, count = 0, sum = { aye: 0, no: 0, absent: 0 }, seen = new Set();
  assert.equal(out.counts_complete_for_scope, false); assert.ok(out.next_cursor);
  for (let i = 0; i < 40; i++) {
    cited(out, false); assert.equal(out.segment.start, previous); previous = out.segment.end;
    for (const row of out.rows) { assert.ok(!seen.has(row.division_id)); seen.add(row.division_id); count++; }
    for (const key of Object.keys(sum)) sum[key] += out.counts[key];
    if (!out.next_call) break;
    out = await api.callTool(env, 'member_divisions', out.next_call);
  }
  assert.equal(out.scan_complete, true); assert.equal(out.next_cursor, null);
  const index = await asset('/divisions/index.json'), expected = { aye: 0, no: 0, absent: 0 };
  for (const d of index.divisions.filter(d => d.date === '2026-10-15' && d.key.startsWith('federal-senate-'))) {
    const member = (await asset(`/divisions/division-${d.key}.json`)).members.find(m => m.person_id === 'tvfy_11010');
    if (member && Object.hasOwn(expected, member.vote)) expected[member.vote]++;
  }
  assert.deepEqual(sum, expected); assert.equal(count, expected.aye + expected.no + expected.absent);
});
test('member count mode and explicit absent/paired/unrecorded votes stay distinct', async () => {
  const original = await asset('/divisions/division-federal-senate-3719.json'), index = await asset('/divisions/index.json');
  const source = index.divisions.find(d => d.key === original.key);
  const detail = (id, vote) => { const d = structuredClone(original); d.key = 'federal-senate-fixture-' + id; const member = d.members.find(m => m.name === 'Christopher Back'); if (vote) member.vote = vote; else d.members = d.members.filter(m => m !== member); return d; };
  const files = [detail('1', 'absent'), detail('2', 'paired'), detail('3')];
  const smallIndex = { ...index, divisions: files.map(d => ({ ...source, key: d.key })) };
  const fixture = { ...env, asset: async path => path === '/divisions/index.json' ? smallIndex : path.startsWith('/divisions/') ? files.find(d => path === '/divisions/division-' + d.key + '.json') : asset(path) };
  const out = await api.callTool(fixture, 'member_divisions', { person: 'Christopher Back', operation: 'count' }); cited(out, false);
  assert.equal(out.rows.length, 0); assert.equal(out.counts.absent, 1); assert.equal(out.counts.paired, 1); assert.equal(out.counts.member_unrecorded, 1); assert.equal(out.counts.party_comparisons, 0); assert.equal(out.counts_complete_for_scope, true);
});
test('member history empty result and invalid input do not become absence claims', async () => {
  const out = await api.callTool(env, 'member_divisions', { person: 'David Shoebridge', since: '2026-10-15', until: '2026-10-15', topic: 'Zqx No Such Topic', scan_limit: 200 });
  assert.deepEqual(out.rows, []); assert.equal(out.counts.absent, 0); assert.equal(out.scan_complete, true);
  await invalid('member_divisions', { person: '../secrets' });
  await invalid('member_divisions', { person: 'David Shoebridge', since: '2026-02-30' });
  await invalid('member_divisions', { person: 'David Shoebridge', chamber: 'senate', jurisdiction: 'nsw' });
  const a = await api.callTool(env, 'member_divisions', { person: 'David Shoebridge', since: '2026-10-15', until: '2026-10-15', limit: 1 });
  await assert.rejects(() => api.callTool(env, 'member_divisions', { ...a.next_call, topic: 'housing' }), e => e.code === -32602);
});
test('exact bill linkage and unavailable division files never fall back to recent vote samples', async () => {
  const bill = (await asset('/bills/index.json')).bills.find(b => b.divisions > 0 && b.sponsor_person_id === '11010'); assert.ok(bill);
  const out = await api.callTool(env, 'member_divisions', { person: 'David Shoebridge', bill: bill.key, operation: 'count', scan_limit: 200 }); cited(out, false);
  assert.ok(out.scoped_divisions > 0); assert.ok(out.counts.aye + out.counts.no > 0);
  const missing = { ...env, asset: path => path.startsWith('/divisions/division-') ? Promise.resolve(null) : asset(path) };
  const failed = await api.callTool(missing, 'member_divisions', { person: 'Christopher Back', since: '2015-03-18', until: '2015-03-18' });
  assert.ok(failed.error); assert.deepEqual(failed.rows, []); assert.equal(failed.counts, undefined);
});

test('sponsored bills use the complete index with real status, dates, source citations and lifecycle follow-up', async () => {
  const out = await api.callTool(env, 'sponsored_bills', { person: 'Katy Gallagher', limit: 1 }); cited(out);
  assert.equal(out.count, 4); assert.equal(out.count_complete_for_index, true); assert.equal(out.rows[0].bill_id, 'au-federal-s1311');
  assert.equal(out.rows[0].introduced, '2021-08-04'); assert.equal(out.rows[0].status, 'lapsed'); assert.ok(out.sponsor_metadata_missing > 2000);
  const detail = await api.callTool(env, 'sponsored_bills', out.rows[0].follow_up); cited(detail); assert.ok(detail.rows[0].lifecycle.key_dates.length);
  assert.ok(out.rows[0].source_url); assert.equal(out.citations[1].url, out.rows[0].source_url);
});
test('sponsored bill counts exceed growth limits and pagination does not change them', async () => {
  const all = await api.callTool(env, 'sponsored_bills', { person: 'Sarah Hanson-Young', limit: 8 }); cited(all);
  assert.ok(all.count > 6); const next = await api.callTool(env, 'sponsored_bills', { person: 'Sarah Hanson-Young', limit: 8, offset: all.next_offset }); cited(next);
  assert.equal(next.count, all.count); assert.notEqual(next.rows[0].bill_id, all.rows[0].bill_id);
  const filtered = await api.callTool(env, 'sponsored_bills', { person: 'Katy Gallagher', since: '2020-01-01', until: '2022-12-31', status: 'lapsed', chamber: 'senate', query: 'Grants Reporting' }); cited(filtered);
  assert.equal(filtered.count, 1);
});
test('sponsored bills: empty selection and invalid identifiers', async () => {
  const out = await api.callTool(env, 'sponsored_bills', { person: 'Katy Gallagher', query: 'Zqx Unknown Bill' });
  assert.deepEqual(out.rows, []); assert.equal(out.count, 0); assert.match(out.notes.join(' '), /omit sponsor/);
  await invalid('sponsored_bills', { person: '../secrets' });
  await invalid('sponsored_bills', { person: 'Katy Gallagher', bill_id: '../../secret' });
  await invalid('sponsored_bills', { person: 'Katy Gallagher', since: '2026-02-30' });
});
test('a bill-ID/name contradiction cannot assign another member sponsorship', async () => {
  const raw = structuredClone(await asset('/bills/index.json'));
  for (const b of raw.bills.filter(b => b.sponsor_person_id === '10838')) b.sponsor = 'FARUQI, Sen Mehreen';
  const out = await api.callTool({ ...env, asset: path => path === '/bills/index.json' ? Promise.resolve(raw) : asset(path) }, 'sponsored_bills', { person: 'Katy Gallagher' });
  assert.equal(out.count, 0); assert.deepEqual(out.rows, []);
});
test('unknown member names and malformed access data cannot create zero facts', async () => {
  for (const name of ['member_divisions', 'sponsored_bills']) {
    const out = await api.callTool(env, name, { person: 'Zqx Unknown Person' });
    assert.deepEqual(out.rows, []); assert.equal(out.count, undefined); assert.equal(out.counts, undefined); assert.match(out.notes.join(' '), /unambiguous member/);
  }
  const data = structuredClone(await asset('/fits.json')); data.by_entity = [];
  const out = await api.callTool({ asset: async () => data }, 'access_registers', { register: 'fits' });
  assert.ok(out.error); assert.deepEqual(out.rows, []); assert.equal(out.counts, undefined);
});

test('all three tools are shared by authenticated MCP and Ask with matching schemas and structured data', async () => {
  const token = 'opax_' + 'B'.repeat(43), hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('hex');
  const mcpEnv = { COMMUNITY_ENABLED: 'true', COMMUNITY_ORIGIN: 'https://opax.test', ASSETS: assets,
    COMMUNITY_DB: { prepare(sql) { let args; return { bind(...v) { args = v; return this; }, async first() { if (sql.startsWith('SELECT m.')) return args[0] === hash ? { id: 'member', key_id: 'key' } : null; if (sql.startsWith('INSERT INTO community_limits')) return { hits: 1 }; throw Error('Unexpected SQL'); }, async run() { return { success: true }; } }; } } };
  const send = async (method, params) => (await api.communityMcp(new Request('https://opax.test/mcp', { method: 'POST', headers: { authorization: 'Bearer ' + token, accept: 'application/json, text/event-stream', 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }), mcpEnv, async () => { throw Error('No legacy tool calls'); })).json();
  const listed = (await send('tools/list', {})).result.tools;
  for (const [name, args] of [['access_registers', { register: 'fits', minister: 'Tony Abbott', limit: 1 }], ['member_divisions', { person: 'Christopher Back', since: '2015-03-18', until: '2015-03-18', topic: 'Housing Affordability' }], ['sponsored_bills', { person: 'Katy Gallagher', limit: 1 }]]) {
    // Listed only where it is a register of query_register; every one of them still answers by name.
    assert.equal(listed.find(t => t.name === 'query_register').inputSchema.properties.register.enum.includes(name), name === 'access_registers');
    const rpc = await send('tools/call', { name, arguments: args }); assert.equal(rpc.error, undefined, JSON.stringify(rpc));
    const ask = await api.askToolSpecs.find(t => t.name === name).run({ ...env, origin: 'https://opax.com.au' }, args);
    assert.deepEqual(mcpOnly(rpc.result.structuredContent), ask.data); cited(ask.data);
    assert.equal((await send('tools/call', { name, arguments: { extra: true } })).result.isError, true);
  }
});
test('an inverted FITS interval keeps the register dates and is matched on its activity dates', async () => {
  // Richardson Coutts / Etisalat Group: the register gives 2024-03-06 to 2023-12-31 (lodged after the
  // activity ended); its activity ran 2023-09-15 to 2023-12-31
  const reg = { registrant: 'RICHARDSON COUTTS PTY LTD', principal: 'Etisalat Group', country: 'United Arab Emirates',
    activities: ['General political lobbying'], from: '2024-03-06', to: '2023-12-31', status: 'ceased',
    url: 'https://foreigninfluence.ag.gov.au/Profile/4aa9150a-abe4-ee11-a9ab-0050569fe6ca?page=ForeignPrincipals',
    activity_from: '2023-09-15', activity_to: '2023-12-31', date_note: 'The register gives a commencement date later than the cease date.' };
  const data = structuredClone(await asset('/fits.json')); data.by_entity['richardson coutts'] = [reg];
  const fixture = { ...env, asset: async path => path === '/fits.json' ? data : asset(path) };
  const hit = await api.callTool(fixture, 'access_registers', { register: 'fits', organisation: 'Richardson Coutts', since: '2023-10-01', until: '2023-10-31' }); cited(hit);
  assert.equal(hit.rows[0].from, '2024-03-06'); assert.equal(hit.rows[0].to, '2023-12-31');
  assert.match(hit.citations.map(c => c.text).join(' '), /registered activities 15 September 2023 to 31 December 2023/);
  const miss = await api.callTool(fixture, 'access_registers', { register: 'fits', organisation: 'Richardson Coutts', since: '2024-06-01', until: '2024-06-30' });
  assert.equal(miss.rows.length, 0);
});
