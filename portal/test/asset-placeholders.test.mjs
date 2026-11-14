import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertNoPlaceholderStamps } from '../../scripts/stamp_assets.mjs';

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
