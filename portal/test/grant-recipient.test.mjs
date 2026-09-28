import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { grantRecipientUrl, fileKey } from '../public/grants.js';
import { recipientProgramMatches, recipientSourceUrl } from '../public/grant-recipient.js';

test('recipient links preserve jurisdiction and round-trip normalized names safely', () => {
  for (const id of ['abn:64062160614', "name:smith & sons (wa)", "person:anne o'brien"]) {
    const url = new URL(grantRecipientUrl('qld', id), 'https://opax.test');
    assert.equal(url.pathname.split('/')[3], 'qld');
    assert.equal(decodeURIComponent(url.pathname.split('/')[5]), id);
    assert.equal(url.search, '');
  }
});
test('program references preserve ambiguous catalog labels and ignore unexported programs', () => {
  const programs = [{id:'GO1',n:'Shared label',key:'go1'}, {id:'GO2',n:'Shared label',key:'go2'}, {id:'GO3',n:'Shared label'}];
  assert.deepEqual(recipientProgramMatches(programs, 'Shared label').map(p => p.id), ['GO1','GO2']);
  assert.deepEqual(recipientProgramMatches(programs, 'GO2').map(p => p.id), ['GO2']);
  assert.deepEqual(recipientProgramMatches(programs, 'Absent label'), []);
});
test('original award links and source dataset/search links remain distinct', () => {
  assert.equal(recipientSourceUrl('federal', {id:'GA1',guid:'guid-1'}), 'https://www.grants.gov.au/Ga/Show/guid-1');
  assert.equal(new URL(recipientSourceUrl('federal', {id:'GA1'})).searchParams.get('GaId'), 'GA1');
  assert.equal(recipientSourceUrl('qld', {id:'qld-1',guid:'ignored'}), 'https://www.data.qld.gov.au/dataset/b102c881-2c7f-484a-a8b6-b056fe318964');
});
test('recipient details resolve from the published catalog and shard', () => {
  // Sampled from whatever the last export listed (the largest, a middle one, the smallest, and Serendipity while
  // it is still listed), so a data refresh that re-ranks recipients cannot turn this red.
  const index = JSON.parse(readFileSync(new URL('../public/graph/grants.federal.json', import.meta.url)));
  const rows = index.recipients;
  assert.ok(rows.length > 100, 'the index lists recipients');
  const sample = [rows[0], rows[Math.floor(rows.length / 2)], rows[rows.length - 1],
    rows.find(row => row.id === 'abn:64062160614')].filter(Boolean);
  for (const entry of sample) {
    const shard = JSON.parse(readFileSync(new URL(`../public/grants/federal/shard-${String(entry.sh).padStart(2,'0')}.json`, import.meta.url)));
    const detail = shard[fileKey(entry.id)];
    assert.ok(detail, `no shard detail for ${entry.id}`);
    assert.equal(detail.id, entry.id); assert.equal(detail.n, entry.n);
    assert.equal(detail.grants.length + detail.more, detail.c, `${entry.id}: listed grants plus the rest add up to the count`);
    assert.ok(detail.grants.every(grant => grant.v >= 0 && (grant.guid === undefined || typeof grant.guid === 'string')));
  }
});
