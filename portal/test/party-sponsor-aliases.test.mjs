import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {loadWorker, offline} from './worker-harness.mjs';

const aliases = [
  ['alp', 'labor'],
  ['country-liberals-northern-territory', 'country-liberal-party'],
  ['democratic-labor-party-dlp', 'dlp'],
  ['independent-member', 'independent'],
  ['independent-members', 'independent'],
  ['liberal-national-party-of-queensland', 'lnp'],
  ['liberal-party-of-australia', 'liberal'],
  ['queensland-greens', 'greens'],
  ['united-australia-party-clive-palmer', 'united-australia-party'],
];
let worker, restore;
before(async () => {
  restore = offline();
  worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname,
    new URL('../public/', import.meta.url).pathname);
});
after(() => restore?.());

for (const [alias, canonical] of aliases) test(`${alias} forwards permanently to ${canonical} in one hop`, async () => {
  const response = await worker.fetch(`/subject/party/${alias}?tab=members`, {redirect: 'manual'});
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), `https://opax.com.au/subject/party/${canonical}?tab=members`);
  const destination = await worker.fetch(`/subject/party/${canonical}?tab=members`, {redirect: 'manual'});
  assert.equal(destination.status, 200);
});

test('the full DLP name in dated records forwards to its existing canonical party page', async () => {
  const response = await worker.fetch('/subject/party/democratic-labor-party', {redirect: 'manual'});
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), 'https://opax.com.au/subject/party/dlp');
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
