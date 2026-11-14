import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {readPartyPages, resolvePartyPage, partySlug} from '../public/party-page.js';
import {loadWorker, offline} from './worker-harness.mjs';

const pages = await readPartyPages(async path => JSON.parse(readFileSync(new URL('../public' + path, import.meta.url))));
// Every reviewed route from the handwritten table remains in the generated table.
const aliases = [
  ['alp', 'labor'],
  ['liberal-party-of-australia', 'liberal'],
  ['national-party-of-australia', 'nationals'],
  ['liberal-national-party-of-queensland', 'lnp'],
  ['queensland-greens', 'greens'],
  ['united-australia-party-clive-palmer', 'united-australia-party'],
  ['country-liberals-northern-territory', 'country-liberal-party'],
  ['democratic-labor-party-dlp', 'dlp'],
  ['democratic-labor-party', 'dlp'],
  ['independent-member', 'independent'],
  ['independent-members', 'independent'],
];

test('one generated sponsor alias table retains every earlier reviewed fallback', () => {
  const source = readFileSync(new URL('../public/party-page.js', import.meta.url), 'utf8');
  assert.equal((source.match(/^const SPONSOR_PARTY_ALIASES =/gm) || []).length, 1);
  const block = source.match(/sponsor-party-aliases:begin[\s\S]*?const SPONSOR_PARTY_ALIASES = (\{[\s\S]*?\n\});/);
  assert.ok(block, 'the comprehensive generated table is retained');
  const generated = JSON.parse(block[1]);
  for (const [alias, canonical] of aliases) {
    const value = Object.entries(generated).find(([label]) => partySlug(label) === alias)?.[1];
    assert.ok(value, alias);
    assert.equal(resolvePartyPage(value, pages)?.href, '/subject/party/' + canonical, alias);
  }
});

let worker, restore;
before(async () => {
  restore = offline();
  worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, new URL('../public/', import.meta.url).pathname);
});
after(() => restore?.());

for (const [alias, canonical] of aliases) {
  test(`${alias}: browser resolution and one-hop Worker 301 agree, preserving the query`, async () => {
    const target = '/subject/party/' + canonical;
    for (const prefix of ['/subject/party/', '/party/']) {
      const response = await worker.fetch(prefix + alias + '?tab=members&x=1', {redirect: 'manual'});
      assert.equal(response.status, 301);
      assert.equal(response.headers.get('location'), 'https://opax.com.au' + target + '?tab=members&x=1');
    }
    assert.equal(resolvePartyPage(alias, pages)?.href, target);
    const landed = await worker.fetch(target + '?tab=members&x=1', {redirect: 'manual'});
    assert.equal(landed.status, 200);
    assert.equal(landed.headers.get('location'), null);
  });
}

test('exact party page slugs and source aliases take priority over sponsor aliases in either source order', () => {
  const federal = {label: 'Greens', href: '/subject/party/greens', aliases: ['Greens']};
  const statePages = [
    {label: 'Queensland Greens', href: '/subject/party/queensland-greens', aliases: ['Queensland Greens']},
    {label: 'Fixture State Greens', href: '/subject/party/fixture-state-greens', aliases: ['Queensland Greens']},
  ];
  for (const state of statePages) for (const order of [[federal, state], [state, federal]]) {
    assert.equal(resolvePartyPage('queensland-greens', order), state);
    assert.equal(resolvePartyPage('Queensland Greens', order), state);
  }
  assert.equal(resolvePartyPage('queensland-greens', [federal]), federal, 'the sponsor alias remains a fallback');
});

test('browser navigation from an old sponsor slug replaces it with the canonical party route', async () => {
  for (const [alias, canonical] of [['alp', 'labor'], ['democratic-labor-party', 'dlp']]) {
    const result = await new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./helpers/directory-shell.mjs', import.meta.url), {
        execArgv: ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning'],
        workerData: {kind: 'party', path: '/subject/party/' + alias, selector: '#party-members', settleMs: 200},
      });
      let result;
      worker.once('message', value => { result = value; });
      worker.once('error', reject);
      worker.once('exit', () => result?.error ? reject(Error(result.error)) : resolve(result));
    });
    assert.deepEqual(result.errors.filter(error => !/getContext\(\) method/.test(error)), []);
    assert.equal(result.location, '/subject/party/' + canonical);
  }
});

test('every recognised sponsor label still resolves after normalisation; unknown parties stay unknown', () => {
  const source = readFileSync(new URL('../../scripts/export_bills.py', import.meta.url), 'utf8');
  const tokens = source.split('SPONSOR_PARTY_TOKENS = {')[1].split('\n}')[0];
  const entries = [...tokens.matchAll(/^\s*"([^"]+)": "([^"]+)"/gm)];
  assert.ok(entries.length >= 39);
  for (const [, alias, canonical] of entries) {
    const page = resolvePartyPage(partySlug(canonical), pages);
    assert.ok(page, canonical);
    assert.equal(resolvePartyPage(partySlug(alias), pages)?.href, page.href, alias);
    assert.equal(resolvePartyPage(alias, pages)?.href, page.href, alias);
  }
  assert.equal(resolvePartyPage('unrecognised-fixture-party', pages), null);
});

test('dated sponsor projections retain every reviewed published party, including held source labels', () => {
  const decisions = JSON.parse(readFileSync(new URL('./fixtures/dated-sponsor-parties.json', import.meta.url)));
  const index = JSON.parse(readFileSync(new URL('../public/bills/index.json', import.meta.url)));
  for (const expected of [...decisions.rows, ...decisions.fills]) {
    const row = index.bills.find(bill => bill.key === expected.key);
    const bill = JSON.parse(readFileSync(new URL('../public/bills/' + expected.key + '.json', import.meta.url)));
    assert.equal(row.sponsor_party, expected.published_party, expected.key);
    assert.equal(bill.sponsor_party, expected.published_party, expected.key);
    assert.ok(resolvePartyPage(partySlug(expected.published_party), pages), expected.published_party);
    if (expected.decision === 'held-for-review') assert.equal(bill.sponsor_party, expected.source_party, expected.key);
  }
});

test('malformed former source labels remain 404', async () => {
  for (const slug of ['34-alp-34', '34-australian-greens-34', '34-australian-labor-party-34',
    '34-independent-members-34', '34-liberal-national-party-of-queensland-34', '34-palmer-united-party-34',
    'australia-39-s-voice', 'derryn-hinch-39-s-justice-party', 'katter-39-s-australian-party',
    'liberal-party-candidate-for-the-federal-seat-of-makin-sa', 'pauline-hanson-39-s-one-nation',
    'independent-candidate-for-the-federal-seat-of-bass-tas', 'monarchist', 'xx']) {
    const response = await worker.fetch(`/subject/party/${slug}`, {redirect: 'manual'});
    assert.equal(response.status, 404, slug);
    assert.equal(response.headers.get('location'), null, slug);
  }
});
