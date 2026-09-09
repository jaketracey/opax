import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const source = app.slice(app.indexOf('function dailyEncyShuffle('), app.indexOf('// Sample the full portrait-backed'));
const shuffle = runInNewContext(`${source}; dailyEncyShuffle`, { Intl, Date });
const pool = Array.from({length: 80}, (_, i) => ({name: `Person ${i}`}));
const names = (date, items = pool) => Array.from(shuffle(items, p => p.name, new Date(date)), p => p.name);
test('daily cards are stable across refreshes and input ordering without mutating the pool', () => {
  const original = pool.slice();
  assert.deepEqual(names('2026-09-07T00:00:00Z'), names('2026-09-07T12:00:00Z', [...pool].reverse()));
  assert.deepEqual(pool, original);
  assert.equal(new Set(names('2026-09-07T00:00:00Z')).size, pool.length);
});
test('selection changes at Melbourne midnight rather than UTC midnight', () => {
  assert.notDeepEqual(names('2026-09-07T13:59:59Z').slice(0,8), names('2026-09-07T14:00:00Z').slice(0,8));
  assert.deepEqual(names('2026-09-07T23:59:59Z'), names('2026-09-08T00:00:00Z'));
  assert.notDeepEqual(names('2026-12-07T12:59:59Z'), names('2026-12-07T13:00:00Z'));
});
test('empty and single-entry pools remain usable', () => {
  assert.deepEqual(names('2026-09-07', []), []);
  assert.deepEqual(names('2026-09-07', [{name:'Only entry'}]), ['Only entry']);
});
