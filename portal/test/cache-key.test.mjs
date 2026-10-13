// Edge-cache keys ignore campaign tags and click ids, so a shared link does not
// turn every search into a fresh (rate-limited, upstream) MISS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cacheKeyParams } from '../src/cache-key.ts';

test('tracking parameters never reach a cache key; real filters and order-independence stay', () => {
  const plain = cacheKeyParams(new URLSearchParams('q=housing&kind=speech&state=vic'), ['nocache']);
  const tagged = cacheKeyParams(new URLSearchParams('utm_source=x&kind=speech&fbclid=abc&q=housing&gclid=1&state=vic&nocache=1&_=123&UTM_Medium=y'), ['nocache']);
  assert.equal(tagged, plain);
  assert.equal(plain, 'kind=speech&q=housing&state=vic');
  assert.notEqual(cacheKeyParams(new URLSearchParams('q=housing&party=Labor')), cacheKeyParams(new URLSearchParams('q=housing')));
  assert.equal(cacheKeyParams(new URLSearchParams('q=a&page=2&ref=x'), ['page']), 'q=a&ref=x');
});
