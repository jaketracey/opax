import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isOrganisationRecipient} from '../public/recipient-privacy.js';
import {grantsTableConfig, sanitizeGrantsState} from '../public/grants-table.js';
import {grantFixtureQuery, grantFixtureRows, queryGrantFixture, grantFixtureResponse, grantFixturePrivacy} from '../src/grants-table-fixture.ts';
import {offline, loadWorker} from './worker-harness.mjs';
import {dataTableHTML, toCSV} from '../public/datatable.js';

const config = grantsTableConfig();
const rows = [
  {id: '1', recipient: 'Fixture Community Council', recipientKind: 'council', program: 'Community facilities', agency: 'Fixture Department of Services', value: 25000.75, date: '2026-08-19', electorate: 'Example district', address: '42 Fixture Road'},
  {id: '2', recipient: 'Fixture Research Institute', recipientKind: 'company', program: 'Research grants', agency: 'Fixture Department of Health', value: 5000, date: '2025-01-01', electorate: 'Example district', address: '87 Sample Street'},
];

test('grants uses the frozen server contract with six columns and exact export', () => {
  assert.deepEqual(config.source, {endpoint: '/api/table/grants', params: {}});
  assert.equal(config.rows, undefined);assert.equal(config.privacy, 'donors');
  assert.deepEqual(config.columns.map(c => [c.key, c.type]), [['recipient', 'text'], ['program', 'category'], ['agency', 'category'], ['value', 'money'], ['date', 'date'], ['electorate', 'category']]);
  assert.equal(config.columns[0].primary, true);assert.equal(config.columns[3].bar, false);
  assert.equal(config.export.filename, 'grants.csv');
  assert.equal(config.primaryLink({...rows[0], jurisdiction: 'federal', recipientId: 'abn:00000000000', recipientAvailable: true}), '/money/grants/federal/recipient/abn%3A00000000000');
  assert.equal(config.primaryLink({...rows[0], jurisdiction: 'federal', recipientId: 'person:withheld'}), null);
  assert.equal(config.primaryLink({...rows[0], jurisdiction: 'federal', recipientId: 'abn:00000000000', recipientAvailable: false}), null);
});

test('recipient source types override organisation-looking labels and preserve positive controls', () => {
  const recipient = {n: 'fixture-recipient Pty Ltd', k: 'company', id: 'abn:00000000000'};
  for (const override of [{k: 'person'}, {k: 'individual'}, {k: 'sole trader'}, {kind: 'people'}, {k: 'sole proprietor'}, {abr: {etype: 'IND'}}, {abr: {type: 'Individual'}}, {abnType: 'Sole Trader'}, {id: 'person:fixture-recipient'}]) assert.equal(isOrganisationRecipient({...recipient, ...override}), false);
  assert.equal(isOrganisationRecipient(recipient), true);
  assert.equal(isOrganisationRecipient({n: 'fixture-recipient', k: 'company'}), true);
  assert.equal(isOrganisationRecipient({n: 'fixture-recipient', k: 'co-operative'}), true);
  assert.equal(isOrganisationRecipient({n: 'fixture-recipient', abr: {etype: 'PRV'}}), true);
  assert.equal(isOrganisationRecipient({n: 'fixture-recipient', k: 'other'}), false);
});

test('each facet keeps alternatives while respecting the search and all other filters', () => {
  const {page} = queryGrantFixture(rows, {filters: {program: [rows[0].program]}});
  assert.equal(page.total, 1);
  assert.deepEqual(page.facets.program.map(f => f.value), rows.map(r => r.program));
  assert.deepEqual(page.facets.agency, [{value: rows[0].agency, count: 1}]);
  const bounded = queryGrantFixture(rows, {filters: {value: {min: 20000}}}).page;
  assert.equal(bounded.total, 1);
  assert.deepEqual(bounded.facets.value, {min: 5000, max: 25000.75});
  assert.equal(queryGrantFixture(rows, {q: 'Research', filters: {program: [rows[0].program]}}).page.facets.program[0].value, rows[1].program);
});

test('grants search matches recipient, program and agency names, never an address or electorate', () => {
  for (const q of ['Council', 'facilities', 'Department of Health']) assert.equal(queryGrantFixture(rows, {q}).page.total, 1);
  for (const q of ['42 Fixture Road', '87 Sample Street', 'Example district', '2026-08-19', '25000']) assert.equal(queryGrantFixture(rows, {q}).page.total, 0);
});

test('grants filters, sorts and pages the full filtered set, with its facets', () => {
  const query = grantFixtureQuery(new URLSearchParams({'f.program': '["Community facilities"]', 'f.value': '{"min":20000}', sort: 'date:asc', page: '999', pageSize: '1'}));
  const {page, filtered} = queryGrantFixture(rows, query);
  assert.equal(page.total, 1);assert.equal(page.page, 1);assert.equal(page.rows[0].value, 25000.75);assert.equal(filtered.length, 1);
  assert.deepEqual(page.facets.program, [{value: 'Community facilities', count: 1}]);
  const second = queryGrantFixture(rows, {sort: {key: 'date', dir: 'asc'}, page: 2, pageSize: 1});
  assert.equal(second.page.rows[0].id, '1');assert.equal(second.filtered.length, 2);
  const malformed = grantFixtureQuery(new URLSearchParams({'f.program': 'broken', 'f.value': '{"min":"bad"}', pageSize: '100000', sort: 'address:desc'}));
  assert.equal(malformed.pageSize, 200);assert.equal(malformed.sort, undefined);assert.equal(malformed.filters, undefined);
});

const read = async path => JSON.parse(readFileSync(new URL('../public' + path, import.meta.url), 'utf8'));
test('fixture endpoint serves bounded pages and exports every filtered award with exact values', async () => {
  const request = new Request('https://fixture.test/api/table/grants?pageSize=1');
  const response = await grantFixtureResponse(request, new URL(request.url), read);
  assert.equal(response.status, 200);assert.equal(response.headers.get('x-opax-table-source'), 'fixture');
  const page = await response.json();assert.equal(page.rows.length, 1);assert.ok(page.total > 50);
  const {rows: all, withheld} = await grantFixtureRows(read);
  const {filtered} = queryGrantFixture(all, {}, withheld);
  const csvURL = new URL('https://fixture.test/api/table/grants?pageSize=1&format=csv');
  const csv = await (await grantFixtureResponse(new Request(csvURL), csvURL, read)).text();
  assert.equal(csv.trim().split(/\r?\n/).length, filtered.length + 1);
  assert.ok(csv.includes(String(filtered[0].value)));
  const clean = sanitizeGrantsState({q: '42 Fixture Road', filters: {recipient: ['withheld'], program: [page.rows[0].program]}}, page);
  assert.equal(clean.q, undefined);assert.equal(clean.filters.recipient, undefined);
  const failure = await grantFixtureResponse(request, new URL(request.url), async () => {throw Error('fixture unavailable');});
  assert.equal(failure.status, 503);assert.deepEqual(await failure.json(), {error: 'Grant records are temporarily unavailable.'});
});

test('every generated recipient link resolves to an existing organisation page', async () => {
  const restore = offline();
  try {
    const {fetch: worker} = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, new URL('../public/', import.meta.url).pathname);
    const {rows} = await grantFixtureRows(read);
    const links = [...new Set(rows.map(config.primaryLink).filter(Boolean))];
    assert.ok(links.length > 0);
    assert.ok(rows.some(row => !config.primaryLink(row)), 'unavailable destinations have no link');
    for (const [i, path] of links.entries()) assert.equal((await worker(path)).status, 200, `recipient destination ${i}`);
  } finally {restore();}
});

test('the core validation hook rejects recipient names independently of donor graphs', async () => {
  const index = await read('/graph/grants.federal.json');
  const names = index.recipients.filter(r => r.k === 'individual').map(r => r.n);
  const request = text => new Request('https://fixture.test/api/table/grants/privacy', {method: 'POST', body: JSON.stringify({text})});
  const rejected = await grantFixturePrivacy(request(names.join('\n')), read);
  assert.deepEqual(await rejected.json(), {safe: false});
  const {rows} = await grantFixtureRows(read);
  const accepted = await grantFixturePrivacy(request(rows.find(r => !r.aggregate).recipient), read);
  assert.deepEqual(await accepted.json(), {safe: true});
  const failed = await grantFixturePrivacy(request('fixture'), async () => {throw Error('unavailable');});
  assert.equal(failed.status, 503);assert.deepEqual(await failed.json(), {safe: false});
});

test('neutral recipient totals keep only counts and value in HTML and CSV', () => {
  const aggregate = {aggregate: {kind: 'individual-donors', subject: 'recipients', count: 3}, value: 1234.56, id: 'fixture-secret-row', recipient: 'fixture-secret-recipient Pty Ltd', program: 'fixture-secret-program', aliases: ['fixture-secret-alias']};
  const config = {...grantsTableConfig(), privacyCheck: () => true, primaryLink: () => '/fixture-secret-link'};
  const page = {rows: [aggregate], total: 1, page: 1, pageSize: 50};
  const csv = toCSV(page.rows, config), html = dataTableHTML(config, page);
  for (const text of [csv, html]) {
    assert.ok(text.includes('Recipients (3, names withheld)'));
    assert.ok(text.includes('1234.56'));
    assert.ok(!text.includes('fixture-secret'));
  }
});

test('the real core applies recipient types to HTML and CSV without label-only evidence', () => {
  const organisation = {id: 'fixture-organisation-award', recipient: 'fixture-organisation', recipientKind: 'company', recipientABNType: 'PRV', value: 10000, donor: {label: 'fixture-organisation'}};
  const privateRows = [{recipientKind: 'person'}, {recipientKind: 'sole trader'}, {recipientABNType: 'IND'}, {recipientKinds: ['company', 'person']}].map((override, i) => ({...organisation, id: `fixture-private-${i}`, recipient: `fixture-private-${i} Pty Ltd`, ...override}));
  const config = {...grantsTableConfig(), privacyCheck: () => true};
  for (const output of [toCSV([organisation, ...privateRows], config), dataTableHTML(config, {rows: [organisation, ...privateRows], total: 5, page: 1, pageSize: 50})]) {
    assert.ok(output.includes('fixture-organisation'));
    assert.ok(!output.includes('fixture-private'));
  }
});

test('value bars keep one full-result scale across server pages', () => {
  const publicRows = rows.map(row => ({...row, donor: {label: row.recipient}}));
  const config = {...grantsTableConfig(), privacyCheck: () => true};
  const html = [1, 2].map(page => dataTableHTML(config, queryGrantFixture(publicRows, {page, pageSize: 1}).page));
  const scales = html.map(text => text.match(/<small class="dt-scale">([^<]+)<\/small>/)?.[1]);
  assert.ok(scales[0]);assert.equal(scales[0], scales[1]);
  assert.ok(html[0].includes('--dt-bar:100%'));
  assert.ok(html[1].includes('--dt-bar:20%'));
});
