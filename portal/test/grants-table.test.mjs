import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {grantsTableConfig, sanitizeGrantsState} from '../public/grants-table.js';
import {grantFixtureQuery, grantFixtureRows, queryGrantFixture, grantFixtureResponse} from '../src/grants-table-fixture.ts';

const config = grantsTableConfig();
const rows = [
  {id: '1', recipient: 'Fixture Community Council', program: 'Community facilities', agency: 'Fixture Department of Services', value: 25000.75, date: '2026-08-19', electorate: 'Example district', address: '42 Fixture Road'},
  {id: '2', recipient: 'Fixture Research Institute', program: 'Research grants', agency: 'Fixture Department of Health', value: 5000, date: '2025-01-01', electorate: 'Example district', address: '87 Sample Street'},
];

test('grants uses the frozen server contract with six columns and exact export', () => {
  assert.deepEqual(config.source, {endpoint: '/api/table/grants', params: {}});
  assert.equal(config.rows, undefined);assert.equal(config.privacy, 'donors');
  assert.deepEqual(config.columns.map(c => [c.key, c.type]), [['recipient', 'text'], ['program', 'category'], ['agency', 'category'], ['value', 'money'], ['date', 'date'], ['electorate', 'category']]);
  assert.equal(config.columns[0].primary, true);assert.equal(config.columns[3].bar, true);
  assert.equal(config.export.filename, 'grants.csv');
  assert.equal(config.primaryLink({...rows[0], jurisdiction: 'federal', recipientId: 'abn:00000000000'}), '/money/grants/federal/recipient/abn%3A00000000000');
  assert.equal(config.primaryLink({...rows[0], jurisdiction: 'federal', recipientId: 'person:withheld'}), null);
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
