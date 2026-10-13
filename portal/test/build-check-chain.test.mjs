import test from 'node:test';
import assert from 'node:assert/strict';
import {checksAfterTypes} from '../../scripts/check_built.mjs';

test('built checks retain every downstream validation as the ordinary check script changes', () => {
  for (const remaining of ['tsc --noEmit && node fixture-validation.mjs', 'node fixture-first.mjs && node fixture-second.mjs']) {
    assert.equal(checksAfterTypes('wrangler types && ' + remaining), remaining);
  }
});

test('built checks reject an unknown type-generation recipe or an empty validation chain', () => {
  for (const command of ['', undefined, 'tsc --noEmit', 'wrangler types && ', 'npm run unexpected && tsc --noEmit']) {
    assert.throws(() => checksAfterTypes(command), /requires check to start/);
  }
});
