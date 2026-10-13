import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {grantsTableConfig} from '../public/grants-table.js';
import {isOrganisationRecipient} from '../src/table-recipient.mjs';
import {tableApi, TABLE_REGISTRY_FINGERPRINT} from '../src/table-api.ts';
import {tablePrivacyCheck} from '../src/table-privacy.ts';
import {tableRows} from '../../scripts/load_tables.mjs';
import {dataTableHTML, mountDataTable, toCSV} from '../public/datatable.js';
import {queryValues} from '../public/datatable-query.js';
import {tableHarness} from './datatable-harness.mjs';
import {tableDatabase} from './table-d1-harness.mjs';
import {loadWorker, offline} from './worker-harness.mjs';
import {grantsPrivateInputs} from './grants-table-inputs.mjs';

const root = new URL('../public/', import.meta.url);
const loaded = await tableRows(root.pathname, {moneyOnly: true});
const local = await tableDatabase({datasets: {grants: loaded.rows.grants}, policy: loaded.policy});
test.after(() => local.close());
const inputs = await grantsPrivateInputs();
const registry = JSON.parse(await readFile(new URL('table-private-identities.json', root), 'utf8'));
const safe = await tablePrivacyCheck({fetch: async () => Response.json(registry)});
const config = {...grantsTableConfig(), privacyCheck: safe};
const api = params => tableApi(new Request('https://local.invalid/api/table/grants?' + new URLSearchParams(params)), {TABLE_DB: local.db});
const clean = (value, surface) => assert.equal(loaded.policy.check(value), false, `${surface}: withheld hit count`);

// Synthetic fixtures only. Typed organisations deliberately need no label heuristic.
const rows = [
  {id: 'fixture-award-1', recipient: 'fixture-organisation-1', recipientKind: 'company', recipientABNType: 'PRV', program: 'Fixture facilities', agency: 'Fixture services', amount: 25000.75, start_date: '2026-08-19', electorate: 'Fixture district', description: '42 Fixture Road', jurisdiction: 'federal', recipientId: 'name:fixture-organisation-1', recipientAvailable: 1},
  {id: 'fixture-award-2', recipient: 'fixture-organisation-2', recipientKind: 'company', program: 'Fixture research', agency: 'Fixture services', amount: 5000, start_date: '2025-01-01', electorate: 'Fixture district', description: '87 Fixture Street', jurisdiction: 'federal', recipientId: 'name:fixture-organisation-2', recipientAvailable: 0},
];

test('grants uses main API fields and organisation type overrides in the real core', () => {
  assert.deepEqual(config.columns.map(c => c.key), ['recipient', 'program', 'agency', 'amount', 'start_date', 'electorate']);
  assert.deepEqual(config.defaultSort, {key: 'amount', dir: 'desc'});
  assert.equal(grantsTableConfig().privacyCheck, undefined, 'browser uses shared validation');
  assert.deepEqual(grantsTableConfig(new URLSearchParams({jur: 'qld'})).source.params, {'f.jurisdiction': '["qld"]'});
  assert.equal(config.primaryLink(rows[0]), '/money/grants/federal/recipient/name%3Afixture-organisation-1');
  assert.equal(config.primaryLink(rows[1]), null);
  const overrides = [{recipientKind: 'person'}, {recipientKind: 'sole trader'}, {recipientABNType: 'IND'}, {recipientId: 'person:fixture-private-id'}];
  const rejected = overrides.map((override, i) => ({...rows[0], ...override, recipient: `fixture-private-${i} Pty Ltd`}));
  for (const r of rejected) assert.equal(isOrganisationRecipient(r), false);
  for (const output of [dataTableHTML(config, {rows: [rows[0], ...rejected], total: 5, page: 1, pageSize: 50}), toCSV([rows[0], ...rejected], config)]) {
    assert.ok(output.includes(rows[0].recipient), 'organisation positive control');
    assert.ok(!output.includes('fixture-private'), 'type override reaches no public field');
  }
});

test('shared D1 grants supplies real organisation controls in API, HTML and CSV', async () => {
  assert.equal(local.manifest.privacyFingerprint, TABLE_REGISTRY_FINGERPRINT);
  assert.equal(loaded.rows.grants.filter(({row}) => row.recipientKind !== 'aggregate' && !isOrganisationRecipient(row)).length, 0, 'non-organisation public row count');
  const response = await api({pageSize: '50'}); assert.equal(response.status, 200);
  const page = await response.json(); assert.ok(page.total > 50); assert.equal(page.rows.length, 50);
  const organisation = page.rows.find(isOrganisationRecipient); assert.ok(organisation, 'organisation control exists');
  const html = dataTableHTML(config, page, new URL('https://local.invalid/money/grants'));
  assert.ok(html.includes(organisation.id), 'real organisation survives HTML hydration');
  const body = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)[1];
  const label = organisation.recipient.replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  assert.ok(body.includes(label), 'real organisation appears in visible HTML');
  assert.ok(html.includes('dt-scale'), 'shared column-wide scale'); clean(html, 'HTML');
  const csvResponse = await api({format: 'csv', 'f.recipientId': JSON.stringify([organisation.recipientId])}); assert.equal(csvResponse.status, 200);
  const csv = await csvResponse.text(); assert.ok(Number(csvResponse.headers.get('x-table-exported')) > 0);
  assert.ok(csv.includes(organisation.id), 'real organisation survives CSV');
  assert.ok(csv.includes(organisation.recipient.replaceAll('"', '""')), 'organisation name in D1 CSV');
  for (const line of csv.split('\r\n')) clean(line, 'CSV');
  assert.equal(loaded.policy.rowCheck(JSON.stringify(page)) || [...queryValues(page)].some(value => loaded.policy.rowCheck(value)), false, 'rows and facets: withheld field count');
});

test('D1 facets retain alternatives and search uses names only', async () => {
  const fixture = await tableDatabase({datasets: {grants: rows.map(row => ({row}))}, policy: loaded.policy});
  try {
    const fetch = params => tableApi(new Request('https://local.invalid/api/table/grants?' + new URLSearchParams(params)), {TABLE_DB: fixture.db});
    const page = await (await fetch({'f.program': JSON.stringify([rows[0].program])})).json();
    assert.equal(page.total, 1); assert.equal(page.facets.program.length, 2); assert.equal(page.facets.agency.length, 1);
    const url = new URL('https://local.invalid/money/grants?' + new URLSearchParams({'t.f.program': JSON.stringify([rows[0].program])}));
    const html = dataTableHTML(config, page, url); assert.ok(html.includes('data-panel="facet-program"'), 'multi-select stays available');
    const bounded = await (await fetch({'f.amount': '{"min":20000}'})).json();
    assert.deepEqual(bounded.facets.amount, {min: 5000, max: 25000.75});
    for (const q of ['fixture-organisation-1', 'facilities']) assert.equal((await (await fetch({q})).json()).total, 1);
    for (const q of ['42 Fixture Road', '87 Fixture Street', 'Fixture district', '2026-08-19', '25000']) assert.equal((await (await fetch({q})).json()).total, 0);
    const csv = await (await fetch({format: 'csv'})).text();
    for (const row of rows) assert.ok(csv.includes(row.id), 'fixture organisation CSV control');
  } finally {await fixture.close();}
});

test('merged-tree D1 rejects every donor, registration, recipient, variant and numeric probe before dataset SQL', async t => {
  assert.equal(inputs.labels.length, 666); assert.equal(inputs.identifiers.length, 81); assert.equal(inputs.recipients.length, 169);
  let probes = 0;
  const db = {prepare(sql) {assert.ok(!/FROM\s+table_grants(?:\b|_)/i.test(sql), 'rejected query reached dataset SQL'); return local.db.prepare(sql);}};
  for (const value of [...inputs.labels, ...inputs.identifiers, ...inputs.recipients, ...inputs.variants]) {
    for (const format of ['', 'csv']) {
      const params = new URLSearchParams({q: value, ...(format ? {format} : {})});
      const response = await tableApi(new Request('https://local.invalid/api/table/grants?' + params), {TABLE_DB: db});
      assert.equal(response.status, 200, 'probe status'); assert.equal(response.headers.get('content-location'), null);
      const text = await response.text(); clean(text, 'rejected response');
      if (format) assert.equal(response.headers.get('x-table-exported'), '0'); else assert.equal(JSON.parse(text).total, 0);
      probes++;
    }
  }
  for (const value of inputs.identifiers) for (const bound of ['min', 'max']) {
    const response = await tableApi(new Request('https://local.invalid/api/table/grants?' + new URLSearchParams({'f.amount': JSON.stringify({[bound]: Number(value)})})), {TABLE_DB: db});
    assert.equal(response.status, 200); assert.equal((await response.json()).total, 0); probes++;
  }
  t.diagnostic(JSON.stringify({donorInputs: 666,registrationInputs: 81,recipientInputs: 169,numericProbes: 162,totalProbes: probes,datasetReads: 0,withheldHits: 0}));
});

test('SSR and initial hydration reject recipient identities absent from donor graphs and metadata injection', async t => {
  const donorValues = new Set(inputs.labels);
  const recipients = inputs.recipients.filter(value => !donorValues.has(value)); assert.ok(recipients.length > 0);
  const restore = offline();
  try {
    const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, root.pathname);
    worker.env.TABLE_DB = local.db;
    for (const value of [...recipients, ...inputs.labels.slice(0, 3), ...inputs.identifiers.slice(0, 3)]) {
      const query = new URLSearchParams({'t.q': value});
      const response = await worker.fetch('/money/grants?' + query); assert.equal(response.status, 200);
      const html = await response.text(); clean(html, 'Worker SSR'); assert.ok(html.includes('Showing 0–0 of 0'));
      const h = tableHarness('http://localhost/money/grants?' + query);
      h.win.fetch = async () => {throw new Error('rejected hydration reached dataset API');};
      const mounted = mountDataTable(h.root, {...grantsTableConfig(), privacyCheck: async text => safe(text)});
      await new Promise(setImmediate); clean(h.html(), 'hydration'); clean(h.win.location.href, 'URL state');
      assert.ok(h.html().includes('Showing 0–0 of 0')); assert.ok(!new URL(h.win.location.href).searchParams.has('t.q')); mounted.destroy();
      const malicious = {...rows[0], program: value};
      const injected = dataTableHTML(config, {rows: [malicious], total: 1, page: 1, pageSize: 50, facets: {program: [{value, count: 1}]}});
      clean(injected, 'facet and chip injection'); assert.ok(!injected.includes('data-show-constant='));
      assert.ok(toCSV([rows[0], malicious], config).includes(rows[0].recipient), 'mixed export positive control');
    }
    t.diagnostic(JSON.stringify({grantOnlyInputs: recipients.length, SSRHits: 0, hydrationHits: 0, derivedUIHits: 0}));
  } finally {restore();}
});

test('every shared API recipient link has an existing organisation profile', async () => {
  const restore = offline();
  try {
    const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, root.pathname);
    const byProfile = new Map(loaded.rows.grants.map(({row}) => [config.primaryLink(row), row])); byProfile.delete(null);
    assert.ok(byProfile.size > 0); assert.equal(config.primaryLink(rows[1]), null, 'missing profile control');
    const paths = [...byProfile.keys()];
    for (const jur of ['federal', 'qld']) {
      const index = JSON.parse(await readFile(new URL(`graph/grants.${jur}.json`, root), 'utf8'));
      const ids = new Set(index.recipients.map(r => r.id));
      for (const row of byProfile.values()) if (row.jurisdiction === jur) assert.ok(ids.has(row.recipientId), 'destination in profile index');
    }
    for (const path of paths.filter((_, i) => i % Math.max(1, Math.floor(paths.length / 40)) === 0)) assert.equal((await worker.fetch(path)).status, 200, 'recipient destination status');
  } finally {restore();}
});

test('neutral recipient aggregates strip identifying metadata while retaining exact totals', () => {
  const row = {aggregate: {kind: 'individual-donors', subject: 'recipients', count: 3}, amount: 1234.56, recipient: 'fixture-secret-recipient', program: 'fixture-secret-program', id: 'fixture-secret-id'};
  for (const value of [dataTableHTML(config, {rows: [row], total: 1, page: 1, pageSize: 50}), toCSV([row], config)]) {
    assert.ok(value.includes('Recipients not named (3)')); assert.ok(value.includes('1234.56')); assert.ok(!value.includes('fixture-secret'));
  }
});
