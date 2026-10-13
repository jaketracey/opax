import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildCrawl} from '../../scripts/build_crawl_catalog.mjs';
import {sanitiseDonorAsset} from '../../scripts/withhold_donor_assets.mjs';
import {withholdDonorText, containsWithheldLookupPhrase} from '../src/donor-sanitise.mjs';

test('bounded hash memo eviction preserves exact identities, phrases and organisation exemptions', () => {
  const hash = text => createHash('sha256').update(text).digest('hex');
  const registry = {
    ids: {[hash('donor:fixture-private')]: {id: 'donor:withheld-1'}},
    names: {[hash('fixture private person')]: {label: 'Donor 1 (name withheld)', exempt: false, sourceKnown: true}},
    phrases: [{hash: hash('fixture private person'), first: hash('fixture'), words: 3, replacement: 'Donor 1 (name withheld)'}],
    organisations: [hash('fixture private person pty ltd')],
    organisationPhrases: [{hash: hash('fixture private person pty ltd'), first: hash('fixture'), words: 5}],
    lookupPhrases: [{hash: hash('fixtureprivateperson'), length: 20}],
  };
  const inputs = ['donor:fixture-private', 'Fixture Private Person', 'Gift from Fixture Private Person.', 'Gift from Fixture Private Person Pty Ltd.'];
  const expected = ['donor:withheld-1', 'Donor 1 (name withheld)', 'Gift from Donor 1 (name withheld).', inputs[3]];
  assert.deepEqual(inputs.map(value => withholdDonorText(value, registry)), expected);
  for (let i = 0; i < 6000; i++) {
    const value = `Unrelated fixture string ${i}`;
    assert.equal(withholdDonorText(value, registry), value);
  }
  assert.deepEqual(inputs.map(value => withholdDonorText(value, registry)), expected);
  assert.equal(containsWithheldLookupPhrase('prefix-fixture private person-suffix', registry), true);
});

test('a final-only sweep cannot repair crawl fingerprints made from unsanitised source exports', async t => {
  const root = await mkdtemp(join(tmpdir(), 'opax-privacy-order-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const hash = text => createHash('sha256').update(text).digest('hex');
  const label = 'Fixture Private Person';
  const context = {
    hash, index: {organisations: new Set(), withheld: new Set(['fixture private person'])}, numbers: new Map(),
    registry: {ids: {}, names: {[hash(label.toLowerCase())]: {label: 'Donor 1 (name withheld)', exempt: false, sourceKnown: true}}, phrases: [], organisations: [], organisationPhrases: []},
  };
  const grantGraph = {meta: {generated: '2026-10-13', coverage: 'fixture'}, recipients: [], programs: []};
  const money = {meta: {generated: '2026-10-13'}, nodes: [], edges: []};
  const data = {
    'parliamentarians.json': {people: [], meta: {generated: '2026-10-13'}},
    'electorates/manifest.json': {index_url: '/electorates/index.json', people_url: '/electorates/people.json', generated: '2026-10-13'},
    'electorates/index.json': {electorates: []}, 'electorates/people.json': {people: []},
    'bills/index.json': {bills: [{key: 'fixture-bill'}], generated_at: '2026-10-13'},
    'bills/fixture-bill.json': {key: 'fixture-bill', title: label, introduced: '2026-10-13', divisions: []},
    'suppliers.json': {suppliers: []}, 'agencies.json': {agencies: []}, 'reports/index.json': {reports: []},
    'corpus.json': {version: '2026-10-13', expected_resources: 0, sources: []}, 'votes.json': {},
    'divisions/index.json': {divisions: []},
    'graph/grants.federal.json': grantGraph, 'graph/grants.qld.json': grantGraph,
    ...Object.fromEntries(['money.json', 'money.qld.json', 'money.vic.json', 'money.tas.json'].map(name => ['graph/' + name, money])),
  };
  const read = async path => {
    path = path.replace(/^\//, '');
    if (path in data) return data[path];
    throw Object.assign(new Error('Missing fixture'), {code: 'ENOENT'});
  };
  await buildCrawl(root, {read});
  const raw = JSON.parse(await readFile(join(root, 'crawl/indexnow.json'), 'utf8'));
  const finalOnly = sanitiseDonorAsset(raw, context);
  const rawFingerprint = finalOnly.entries.find(([path]) => path === '/bill/fixture-bill')[1];
  assert.equal(rawFingerprint, raw.entries.find(([path]) => path === '/bill/fixture-bill')[1]);
  data['bills/fixture-bill.json'] = sanitiseDonorAsset(data['bills/fixture-bill.json'], context);
  assert.equal(data['bills/fixture-bill.json'].title, 'Donor 1 (name withheld)');
  await buildCrawl(root, {read});
  const safe = JSON.parse(await readFile(join(root, 'crawl/indexnow.json'), 'utf8'));
  assert.notEqual(safe.entries.find(([path]) => path === '/bill/fixture-bill')[1], rawFingerprint);
});
