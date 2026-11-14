import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertNoPlaceholderStamps, moduleReferences } from '../../scripts/stamp_assets.mjs';

test('published assets contain no literal hash placeholders', () => {
  assertNoPlaceholderStamps();
});

test('the stamp guard finds placeholders in nested assets of any file type', t => {
  const dir = mkdtempSync(join(tmpdir(), 'opax-asset-placeholders-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'nested'));
  writeFileSync(join(dir, 'app.js'), 'import("/records.js?v=abc123");');
  writeFileSync(join(dir, 'nested', 'asset.data'), Buffer.from('\0/money-records.js?v=HASH\0'));
  assert.throws(() => assertNoPlaceholderStamps(dir), /literal \?v=HASH remains in public\/nested\/asset\.data/);
  writeFileSync(join(dir, 'nested', 'asset.data'), '/money-records.js?v=ia-ux-20260908-2');
  assert.doesNotThrow(() => assertNoPlaceholderStamps(dir));
});

// A module imported once with ?v= and once bare is evaluated twice in the
// browser: two copies of its state, and twice the download. /money once loaded
// money-records.js both ways. The listed modules already carry such a split on
// main and are tracked separately; a new split fails here.
const KNOWN_SPLITS = new Set(['format.js', 'wombat.js']);
function bareImportsOfVersionedModules(references) {
  const out = [];
  for (const [file, refs] of references) {
    const js = refs.filter(r => /\.m?js$/.test(r.from));
    if (!js.some(r => r.stamp)) continue;
    for (const r of js) if (r.stamp === null) out.push(`${r.from} imports ${file} bare`);
  }
  return out;
}

test('no module is imported bare by one module and versioned by another', () => {
  const splits = bareImportsOfVersionedModules([...moduleReferences()].filter(([file]) => !KNOWN_SPLITS.has(file)));
  assert.deepEqual(splits, []);
});

test('the split-identity check catches a bare import of a versioned module', () => {
  const refs = new Map([['money-records.js', [
    {from: 'map-research.js', stamp: 'ia-ux-20260908-2'},
    {from: 'money-connections.js', stamp: null},
  ]]]);
  assert.deepEqual(bareImportsOfVersionedModules(refs), ['money-connections.js imports money-records.js bare']);
  refs.get('money-records.js')[1].stamp = 'ia-ux-20260908-2';
  assert.deepEqual(bareImportsOfVersionedModules(refs), []);
});
