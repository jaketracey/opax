import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {interestHolder} from '../public/interest-holder.js';
import {interestTableData, interestTableConfig, registerTableHTML} from '../public/register-tables.js';

// The frozen declarations and their real validation/privacy helpers come from
// shipped iOS 1.1.3, eb6fd2dce. Do not substitute the current mobile decoders.
const compiled = await build({
  entryPoints: [new URL('./fixtures/ios-1.1.3/interest-decoders.ts', import.meta.url).pathname],
  bundle: true, write: false, format: 'esm', platform: 'browser',
});
const released = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const read = async name => JSON.parse(await readFile(new URL('../public/interests/' + name, import.meta.url), 'utf8'));
const index = await read('index.json');
const registers = await Promise.all(Object.keys(index.people).map(async id => [id, await read(id + '.json')]));
const recent = await read('recent.json');
const ties = await read('ties-by-donor.json');
const registerItems = register => Object.values(register.buckets).flatMap(b => b.items);

test('released iOS 1.1.3 decodes all 320 registers without losing bucket items', () => {
  const decodedIndex = released.decodeInterestIndex(index);
  assert.equal(Object.keys(decodedIndex.people).length, 320);
  assert.equal(registers.length, 320);
  for (const [id, register] of registers) {
    const decoded = released.decodeInterest(register);
    assert.equal(registerItems(decoded).length, registerItems(register).length, id);
    for (const row of registerItems(decoded)) assert.ok(row.holder.trim(), id);
    for (const tie of decoded.ties || []) assert.ok(tie.register.holder.trim(), id);
  }
});

function decodeRecentWithoutLoss(payload) {
  const decoded = released.decodeRecentInterests(payload);
  // The released rows decoder may quarantine a malformed row. Losing even one
  // declaration is a compatibility regression, so acceptance requires no loss.
  assert.equal(decoded.items.length, payload.items.length);
  return decoded;
}
function decodeDonorTiesWithoutLoss(payload) {
  const decoded = released.decodeInterestTies(payload);
  assert.deepEqual(Object.keys(decoded.donors), Object.keys(payload.donors));
  for (const [donor, rows] of Object.entries(payload.donors)) assert.equal(decoded.donors[donor].length, rows.length);
  return decoded;
}

test('released iOS 1.1.3 decodes every recent declaration and donor tie without quarantining rows', () => {
  const decodedRecent = decodeRecentWithoutLoss(recent);
  const decodedTies = decodeDonorTiesWithoutLoss(ties);
  assert.equal(decodedRecent.items.length, 300);
  assert.equal(Object.values(decodedTies.donors).flat().length, 272);
});

test('the pinned decoder still rejects the reviewed null regression in each of the four holder fields', () => {
  const register = structuredClone(registers[0][1]);
  registerItems(register)[0].holder = null;
  assert.throws(() => released.decodeInterest(register));

  const tied = structuredClone(registers.find(([, r]) => r.ties?.length)[1]);
  tied.ties[0].register.holder = null;
  assert.throws(() => released.decodeInterest(tied));

  const badRecent = structuredClone(recent);
  badRecent.items[0].holder = null;
  assert.throws(() => decodeRecentWithoutLoss(badRecent));

  const badTies = structuredClone(ties);
  Object.values(badTies.donors)[0][0].holder = null;
  assert.throws(() => decodeDonorTiesWithoutLoss(badTies));
});

test('all four compatible wire fields remain strings while web holders display as absent', () => {
  const groups = {
    buckets: registers.flatMap(([, r]) => registerItems(r)),
    person_ties: registers.flatMap(([, r]) => (r.ties || []).map(t => t.register)),
    recent: recent.items,
    donor_ties: Object.values(ties.donors).flat(),
  };
  const missing = {};
  for (const [group, items] of Object.entries(groups)) {
    missing[group] = 0;
    for (const row of items) {
      assert.equal(typeof row.holder, 'string', group);
      assert.ok(row.holder.trim(), group);
      if (row.holder === 'unspecified') {
        missing[group]++;
        assert.equal(interestHolder(row.holder), null);
      }
    }
  }
  assert.deepEqual(missing, {buckets: 3026, person_ties: 105, recent: 100, donor_ties: 105});
  for (const [, register] of registers) {
    const {rows} = interestTableData(register);
    const html = registerTableHTML(interestTableConfig(rows));
    assert.doesNotMatch(html, />\s*(?:unspecified|null)\s*</i);
    for (const row of rows.filter(r => r.holder === null)) assert.equal(row.holder_label, 'Not stated');
  }
});

test('regenerated web search snippets never expose the legacy missing-holder wire value', async () => {
  const readAsset = async name => JSON.parse(await readFile(new URL('../public/' + name, import.meta.url), 'utf8'));
  const manifest = await readAsset('search-catalog/manifest.json');
  const root = `search-catalog/${manifest.version}/`;
  const meta = await readAsset(root + 'meta-core.json');
  const kind = meta.kinds.indexOf('interest');
  assert.ok(kind >= 0);
  const shards = new Set(meta.kind.flatMap((k, i) => k === kind ? [Math.floor(i / manifest.recordShardSize)] : []));
  let checked = 0;
  for (const shard of shards) {
    const records = await readAsset(root + `records-${shard}.json`);
    for (const record of records.filter(row => row.kind === 'interest')) {
      assert.doesNotMatch(record.snippet, /\.\s*(?:unspecified|null)\s*\./i);
      checked++;
    }
  }
  assert.equal(checked, manifest.counts.interest);
});
