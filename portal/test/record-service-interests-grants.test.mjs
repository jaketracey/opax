import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { MockLanguageModelV4 } from 'ai/test';

const compiled = await build({ stdin: { contents: "export {findPeople} from './src/agentic-tools';export {factSheet,runAgentic,inferPeriod} from './src/agentic-ask';export {createResearch} from './src/research-loop';export {createResearchCreditCooldown} from './src/research-credit';export {personService} from './src/person-service';export {callTool,askToolSpecs,parseToolArgs} from './src/tools';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, format: 'esm', platform: 'browser' });
const api = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const cache = new Map();
async function published(path) {
  if (!cache.has(path)) cache.set(path, readFile(new URL('../public' + path, import.meta.url), 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; }));
  return structuredClone(await cache.get(path));
}
const env = { asset: published, origin: 'https://offline.test' };
const deps = { ...env, kb: async () => { throw Error('These lookups never search speeches'); } };
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Unit tests must not call a network service'); };
test.after(() => { globalThis.fetch = originalFetch; });

test('declared interests returns null holders for real retained declarations and old cached placeholders', async () => {
  const index = await published('/interests/index.json');
  let register, id;
  for (const key of Object.keys(index.people)) {
    const candidate = await published(`/interests/${key}.json`);
    if (Object.values(candidate.buckets).some(b => b.items.some(item => item.holder == null || item.holder === 'unspecified'))) { register = candidate; id = key; break; }
  }
  assert.ok(register);
  const asset = async path => path === '/interests/index.json' ? { _by_name: { [register.name.toLowerCase()]: id }, people: { [id]: { name: register.name } } }
    : path === `/interests/${id}.json` ? register : null;
  for (const holder of [null, 'unspecified']) {
    const item = Object.values(register.buckets).flatMap(b => b.items).find(item => item.holder == null || item.holder === 'unspecified');
    item.holder = holder;
    const result = await api.callTool({ ...env, asset }, 'declared_interests', { person: register.name, limit: 20 });
    assert.ok(result.rows.some(row => row.holder === null));
    assert.ok(!JSON.stringify(result).includes('unspecified'));
    const grouped = await api.callTool({ ...env, asset }, 'declared_interests', { limit: 20 });
    assert.ok(!JSON.stringify(grouped).includes('unspecified'));
  }
});

test('find_people exposes historical House service, independently of speech coverage, as citable writer facts', async () => {
  const out = await api.findPeople(deps, { name: 'Ralph Willis' });
  const person = out.data.people[0];
  assert.deepEqual(person.years, [1998, 1998]);
  assert.equal(person.service.length, 1);
  assert.deepEqual([person.service[0].chamber, person.service[0].electorate, person.service[0].start, person.service[0].end], ['representatives', 'Gellibrand', '1972-12-02', '1998-08-31']);
  const fact = api.factSheet([out]).facts.find(f => f.text.includes('2 December 1972'));
  assert.match(fact.text, /House of Representatives for Gellibrand from 2 December 1972 to 31 August 1998/);
  assert.match(fact.cite.url, /^https:\/\/offline.test\/subject\/electorate\//);
});

test('surname-first roster aliases retain service through their resolved person ID', async () => {
  const roster = await published('/parliamentarians.json');
  const person = roster.people.find(p => p.name === 'Ralph Willis');
  const manifest = await published('/electorates/manifest.json');
  const history = await published(manifest.people_url);
  const pid = history.people.find(p => p.name === person.name).legacy_person_id;
  assert.ok(pid);
  const out = await api.findPeople({ ...deps, asset: async path => path === '/parliamentarians.json' ? { people: [{ ...person, pid, name: 'Willis Ralph' }] } : published(path) }, { name: 'Willis Ralph' });
  assert.equal(out.data.match_status, 'matched');
  assert.equal(out.data.people[0].name, 'Willis Ralph');
  assert.deepEqual(out.data.people[0].service.map(p => [p.electorate, p.start, p.end]), [['Gellibrand', '1972-12-02', '1998-08-31']]);
});

test('the repaired Cunningham profile resolves its existing catalogue id to dated House service', async () => {
  const out = await api.findPeople(deps, { name: 'Stephen Martin' });
  const person = out.data.people[0];
  assert.equal(person.name, 'Stephen Martin');
  assert.equal(person.speeches_indexed, 299);
  assert.ok(person.service.some(p => p.chamber === 'representatives' && p.electorate === 'Cunningham'
    && p.start === '1996-04-30' && p.end === '2002-08-16'));
  assert.ok(!person.service.some(p => p.electorate === 'Reid'));
  const dickson = await api.findPeople(deps, { name: 'Anthony Charles Smith' });
  assert.ok(dickson.data.people[0].service.some(p => p.electorate === 'Dickson'
    && p.start === '1996-03-02' && p.end === '1998-10-03'));
});

test('a service fact from find_people survives the research answer selection and reaches the answer with its source', async () => {
  const reply = (name, input) => ({ content: [{ type: 'tool-call', toolName: name, toolCallId: name, input: JSON.stringify(input) }], finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } }, warnings: [] });
  const model = new MockLanguageModelV4({ doGenerate: [reply('find_people', { name: 'Ralph Willis' }), reply('answer', { facts: [2] })] });
  const failures = [];
  const research = api.createResearch({ model, modelBudgetSpent: async () => false, dailyBudget: { reserve: async () => ({ settle: async () => {} }) }, creditCooldown: api.createResearchCreditCooldown() });
  const question = 'Between which years did Ralph Willis represent Gellibrand?';
  const out = await api.runAgentic(question, { ...deps, generate: async () => ({ text: '{}' }), research, onResearchFailure: async failure => failures.push(failure) }, async () => {}, 40000, api.inferPeriod(question), {}, { people: ['Ralph Willis'], parties: [], bills: [], ambiguous: false, unresolved: false });
  assert.deepEqual(failures, []); assert.equal(out.answered, true);
  assert.match(out.answer, /^Ralph Willis served in the House of Representatives for Gellibrand from 2 December 1972 to 31 August 1998\./);
  assert.match(out.qualitative.sources[0].url, /^https:\/\/offline.test\/subject\/electorate\//);
});

test('Senate service uses Handbook from/to rather than a salary spell or a roster observation date', async () => {
  const out = await api.findPeople(deps, { name: 'Penny Wong' });
  const period = out.data.people[0].service.find(p => p.chamber === 'senate');
  assert.equal(period.start, '2002-07-01'); assert.equal(period.end, null); assert.equal(period.ongoing, true);
  assert.equal(period.electorate, 'South Australia'); assert.equal(period.as_of, '2026-10-19');
  assert.ok(api.factSheet([out]).facts.some(f => /1 July 2002/.test(f.text) && f.cite.url === 'https://handbook.aph.gov.au/'));
  const former = await api.findPeople(deps, { name: 'Patrick Dodson' });
  assert.deepEqual(former.data.people[0].service.map(p => [p.start, p.end, p.ongoing]), [['2016-04-28', '2024-01-26', false]]);
  for (const name of ['Michael Ronaldson', "Deborah O'Neill"]) {
    const member = await api.findPeople(deps, { name });
    assert.ok(!member.data.people[0].service.some(p => p.chamber === 'senate'), 'A clipped or cross-chamber career start is not a Senate start');
  }
});

test('service output preserves separate seats, chambers and interruptions without making observation dates into tenures', async () => {
  const assets = {
    '/electorates/manifest.json': { release_id: 'abc123', people_url: '/electorates/releases/abc123/people.json' },
    '/electorates/releases/abc123/people.json': { people: [{ name: 'Example Member', electorates: [
      { name: 'First Seat', chamber: 'representatives', jurisdiction: 'federal', as_of: '2026-09-01', periods: [{ start: '2001-11-10', end: '2007-10-17' }, { start: '2010-08-21', end: '2013-08-05' }] },
      { name: 'Second Seat', chamber: 'representatives', jurisdiction: 'federal', current: true, periods: [{ start: '2013-09-07', end: null }] },
      { name: 'State Seat', chamber: 'qld_la', jurisdiction: 'qld', current: true, as_of: '2026-09-01', periods: [] },
    ] }] },
  };
  const [service] = await api.personService({ ...deps, asset: async path => assets[path] ?? null }, [{ name: 'Example Member' }]);
  assert.deepEqual(service.map(p => [p.electorate, p.start, p.end]), [['First Seat', '2001-11-10', '2007-10-17'], ['First Seat', '2010-08-21', '2013-08-05'], ['Second Seat', '2013-09-07', null]]);
  assert.deepEqual(await api.personService({ ...deps, asset: async () => { throw Error('missing service assets'); } }, [{ name: 'Example Member' }]), [[]]);
});

test('declared_interests resolves Queensland members from the register directory without requiring speeches', async () => {
  const out = await api.callTool(env, 'declared_interests', { person: 'Bree James', category: 'real_estate' });
  assert.equal(out.error, undefined); assert.equal(out.total, 4); assert.equal(out.rows.length, 4);
  assert.match(out.rows[0].description, /Westcourt/);
  assert.ok(out.rows.every(r => r.name === 'Bree James' && r.jurisdiction === 'qld'));
  assert.ok(out.register_date); assert.ok(out.rows.every(r => r.register_date === out.register_date));
  assert.match(out.citations[0].text, /4 real estate entries.*Westcourt.*Manunda.*Brinsmead/);
  assert.match(out.citations[0].url, /parliament\.qld\.gov\.au/);
  const unknown = await api.callTool(env, 'declared_interests', { person: 'Unknown Madeup Member', category: 'real_estate' });
  assert.deepEqual(unknown.rows, []); assert.match(unknown.notes[0], /No published register member matches/);
});

test('interest category counts cover the register while item previews and their dates remain explicit', async () => {
  const out = await api.callTool(env, 'declared_interests', { person: 'Andrew McLachlan', category: 'shareholdings' });
  assert.equal(out.total, 25); assert.equal(out.rows.length, 6);
  assert.match(out.citations[0].text, /25 shareholdings entries.*GOLD FUND LIMITED/);
  assert.match(out.citations[0].text, /showing 6 published items/);
  assert.deepEqual(out.categories, [{ category: 'shareholdings', declared_entries: 25, published_items: 6 }]);
  const changes = await api.callTool(env, 'declared_interests', { person: 'Alison Penfold', category: 'real_estate' });
  const deletion = changes.rows.find(r => r.kind === 'deletion');
  assert.equal(deletion.declaration_date, '2025-12-12');
  assert.equal(deletion.register_date, '2026-09-09');
  assert.match(changes.citations[0].text, /removed 2025-12-12/);
  assert.ok(deletion.page); assert.match(deletion.url, /#page=/);
});

test('interest filters and row limits never turn preview counts into complete item counts', async () => {
  const out = await api.callTool(env, 'declared_interests', { person: 'Bree James', category: 'real_estate', limit: 1 });
  assert.equal(out.total, 4); assert.equal(out.rows.length, 1);
  assert.match(out.citations[0].text, /showing 1 published items/);
  const search = await api.callTool(env, 'declared_interests', { person: 'Bree James', category: 'real_estate', query: 'Westcourt' });
  assert.equal(search.rows.length, 1); assert.match(search.rows[0].description, /Westcourt/);
  assert.equal(search.categories[0].declared_entries, 4);
});

test('recipient totals include awards missing from the public detail list and do not depend on a display limit', async () => {
  const out = await api.callTool(env, 'grants', { operation: 'totals', recipient: 'WA Country Health Service', limit: 1 });
  assert.equal(out.error, undefined);
  assert.deepEqual([out.rows[0].total_aud, out.rows[0].record_count], [249030307, 151]);
  assert.equal(out.rows[0].complete, true);
  assert.match(out.citations[0].text, /received \$249,030,307 in published federal grant award values.*151 award records/);
  assert.match(out.citations[0].url, /\/money\/grants\/federal\/recipient\//);
  const partial = await api.callTool(env, 'grants', { recipient: 'WA Country Health Service', group_by: 'program' });
  assert.ok(partial.error); assert.match(partial.notes[0], /shortened/); assert.equal(partial.citations.length, 0);
});

test('Queensland totals count expenditure lines and accept long recipient names', async () => {
  const recipient = 'Nicole James & Andrea Juillerat Atf The James Family Trust & The Juilleratfamily Trust';
  const out = await api.callTool(env, 'grants', { recipient, jurisdiction: 'qld' });
  assert.equal(out.error, undefined);
  assert.deepEqual([out.rows[0].total_aud, out.rows[0].record_count, out.rows[0].from_financial_year, out.rows[0].to_financial_year], [1223278, 17, '2017-18', '2024-25']);
  assert.match(out.citations[0].text, /Queensland Government grant and assistance expenditure.*17 expenditure rows/);
  assert.match(out.notes[0], /not distinct awards/);
});

test('recipient totals can be filtered or grouped by complete financial-year aggregates', async () => {
  const args = { recipient: 'South Australian Department for Health and Wellbeing' };
  const out = await api.callTool(env, 'grants', { ...args, from_year: 2020, to_year: 2020 });
  assert.deepEqual([out.rows[0].total_aud, out.rows[0].record_count], [10449419, 3]);
  assert.equal(out.rows[0].from_financial_year, '2020-21');
  const by = await api.callTool(env, 'grants', { ...args, group_by: 'year', limit: 10 });
  // Settled years are pinned; a year a later GrantConnect load adds (2026-27 from the 11 November 2026 load) may follow.
  const settled = by.rows.filter(r => r.financial_year <= '2025-26');
  assert.deepEqual(settled.map(r => r.financial_year), ['2018-19', '2020-21', '2023-24']);
  assert.equal(settled.reduce((n, r) => n + r.total_aud, 0), 26830093);
  assert.ok(by.rows.every((r, i) => !i || by.rows[i - 1].financial_year < r.financial_year), 'years run in order');
  const none = await api.callTool(env, 'grants', { ...args, from_year: 2000, to_year: 2000 });
  assert.equal(none.coverage_only, true); assert.equal(none.coverage.matched, false);
  assert.deepEqual(none.rows, []); assert.equal(none.total_aud, undefined);
  assert.match(none.citations[0].text, /cannot establish a complete total/);
});

test('program and jurisdiction-year totals come from complete aggregates rather than top recipients or awards', async () => {
  const program = await api.callTool(env, 'grants', { program: 'GO6821' });
  assert.deepEqual([program.rows[0].total_aud, program.rows[0].record_count], [19099757999, 5962]);
  const by = await api.callTool(env, 'grants', { program: 'GO6821', group_by: 'year', from_year: 2020, to_year: 2020 });
  assert.deepEqual([by.rows[0].financial_year, by.rows[0].total_aud, by.rows[0].record_count], ['2020-21', 336012148, 297]);
  const whole = await api.callTool(env, 'grants', { group_by: 'year', from_year: 2024, to_year: 2024, jurisdiction: 'qld' });
  assert.deepEqual([whole.rows[0].financial_year, whole.rows[0].total_aud, whole.rows[0].record_count], ['2024-25', 13995985985, 30237]);
});

test('recipient and program intersections use full award lists or report that the complete total is unavailable', async () => {
  const out = await api.callTool(env, 'grants', { recipient: 'South Australian Department for Health and Wellbeing', program: 'National Program' });
  assert.equal(out.error, undefined);
  assert.deepEqual([out.rows[0].total_aud, out.rows[0].record_count], [23940165, 3]);
  await assert.rejects(() => api.callTool(env, 'grants', { recipient: 'WA Country Health Service', state: 'wa' }), /Invalid arguments/);
});

test('complete program totals are ranked by their sums; missing year fields and free-text filters cannot be silently dropped', async () => {
  const assets = {
    '/graph/grants.federal.json': { recipients: [{ id: 'abn:12345678901', n: 'Example Council', k: 'government', sh: 0 }], programs: [] },
    '/grants/federal/shard-00.json': { 'abn-12345678901': { t: 210, c: 3, more: 0, grants: [{ v: 90, pr: 'First' }, { v: 60, pr: 'Second', fy: '2024-25' }, { v: 60, pr: 'Second', fy: '2024-25' }] } },
  };
  const fixture = { ...env, asset: async path => structuredClone(assets[path] ?? null) };
  const out = await api.callTool(fixture, 'grants', { recipient: 'Example Council', group_by: 'program' });
  assert.deepEqual(out.rows.map(r => [r.program, r.total_aud]), [['Second', 120], ['First', 90]]);
  assert.match(out.citations[0].text, /Second: \$120/);
  const unknownYear = await api.callTool(fixture, 'grants', { recipient: 'Example Council', program: 'First', group_by: 'year' });
  assert.ok(unknownYear.error); assert.equal(unknownYear.citations.length, 0);
  const unsupportedQuery = await api.callTool(env, 'grants', { group_by: 'year', query: 'hospital' });
  assert.ok(unsupportedQuery.error); assert.equal(unsupportedQuery.citations.length, 0);
});

test('Ask and registry callers receive the same interest and grant totals with citations', async () => {
  for (const [name, args] of [['grants', { operation: 'totals', recipient: 'WA Country Health Service' }], ['declared_interests', { person: 'Bree James', category: 'real_estate' }]]) {
    const direct = await api.callTool(env, name, args);
    const ask = await api.askToolSpecs.find(t => t.name === name).run(deps, args);
    assert.deepEqual(ask.data, direct);
    assert.deepEqual(api.factSheet([ask]).facts.map(f => f.text), direct.citations.map(c => c.text));
  }
  assert.throws(() => api.parseToolArgs('grants', { operation: 'totals', each: 'grant' }));
  assert.throws(() => api.parseToolArgs('grants', { operation: 'largest', group_by: 'year' }));
});

test('grouped interests use the whole published directory, including aph identifiers, before limiting senators', async () => {
  const out = await api.callTool(env, 'declared_interests', { category: 'gifts', chamber: 'senate', since: '2026-01-01', until: '2026-12-31', limit: 20 });
  assert.equal(out.error, undefined);
  assert.ok(out.rows.length > 0);
  assert.ok(out.rows.every(r => r.chamber === 'senate'));
  assert.ok(out.rows.every(r => r.first.every(item => item.date >= '2026-01-01' && item.date <= '2026-12-31')));
  assert.ok(out.citations.every(c => !/register,\s*\)/.test(c.text)));
  assert.ok(JSON.stringify({ ...out, facts: out.citations.map(c => c.text) }).length <= 15500, 'leave room in the 16 KiB research result for adapter metadata');
});
