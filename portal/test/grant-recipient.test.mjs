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
  assert.equal(recipientSourceUrl('qld', {id:'qld-1',guid:'ignored'}), 'https://www.data.qld.gov.au/dataset/queensland-government-investment-portal-expenditure');
});
test('the requested Serendipity detail resolves from the published catalog and shard', () => {
  const index = JSON.parse(readFileSync(new URL('../public/graph/grants.federal.json', import.meta.url)));
  const id = 'abn:64062160614'; const entry = index.recipients.find(row => row.id === id);
  assert.ok(entry);
  const shard = JSON.parse(readFileSync(new URL(`../public/grants/federal/shard-${String(entry.sh).padStart(2,'0')}.json`, import.meta.url)));
  const detail = shard[fileKey(id)];
  assert.equal(detail.id, id); assert.equal(detail.n, 'Serendipity (WA) Pty Ltd');
  assert.equal(detail.grants.length, detail.c); assert.equal(detail.more, 0);
  assert.ok(detail.grants.every(grant => grant.guid && grant.v >= 0));
});
