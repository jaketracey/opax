import { test } from 'node:test';
import assert from 'node:assert/strict';
import { networkBlock, blockedAsns, DEFAULT_BLOCKED_ASNS } from '../src/network-block.ts';

function req(path, asn) {
  const r = new Request(`https://opax.com.au${path}`);
  if (asn !== undefined) Object.defineProperty(r, 'cf', { value: { asn } });
  return r;
}

test('the default list covers the Alibaba fleet and parses from the var', () => {
  assert.ok(blockedAsns({}).has(45102));
  assert.deepEqual([...blockedAsns({ BLOCKED_ASNS: ' 1, 2 ,x,0,-3 ' })], [1, 2]);
  assert.equal(DEFAULT_BLOCKED_ASNS.split(',').length, 3);
});

test('blocked network gets 403 on paid routes only', async () => {
  const blocked = networkBlock(req('/api/ask', 45102), {}, '/api/ask');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await blocked.json(), { error: 'forbidden', reason: 'network' });
  assert.equal(networkBlock(req('/og/money.png', 45102), {}, '/og/money.png')?.status, 403);
  assert.equal(networkBlock(req('/', 45102), {}, '/'), null, 'pages stay open');
  assert.equal(networkBlock(req('/bills/index.json', 45102), {}, '/bills/index.json'), null, 'static data stays open');
  assert.equal(networkBlock(req('/ingest/e/', 45102), {}, '/ingest/e/'), null);
});

test('other networks and requests without cf data pass through', () => {
  assert.equal(networkBlock(req('/api/ask', 1221), {}, '/api/ask'), null, 'Telstra');
  assert.equal(networkBlock(req('/api/ask'), {}, '/api/ask'), null, 'no cf object');
  assert.equal(networkBlock(req('/api/ask', 45102), { BLOCKED_ASNS: '' }, '/api/ask'), null, 'empty list disables the block');
});
