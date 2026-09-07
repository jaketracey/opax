import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proxyPostHog } from '../src/posthog.ts';

test('proxy streams ingestion only to US PostHog and strips private headers', async () => {
  const original = globalThis.fetch;
  let call;
  globalThis.fetch = async (url, options) => {
    call = { url: String(url), ...options };
    return new Response('{"status":1}', { headers: { 'set-cookie': 'private=secret', 'content-type': 'application/json' } });
  };
  try {
    const response = await proxyPostHog(new Request('https://opax.com.au/ingest/i/v0/e/?ip=0', {
      method: 'POST', body: 'test', headers: { cookie: 'private=secret', authorization: 'Bearer secret', 'content-type': 'text/plain', origin: 'https://opax.com.au', referer: 'https://opax.com.au/search?q=private' },
    }));
    assert.equal(call.url, 'https://us.i.posthog.com/i/v0/e/?ip=0');
    assert.equal(call.headers.get('cookie'), null);
    assert.equal(call.headers.get('authorization'), null);
    assert.equal(call.headers.get('referer'), null);
    assert.equal(call.redirect, 'manual');
    assert.equal(await new Response(call.body).text(), 'test');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(await response.text(), '{"status":1}');
  } finally { globalThis.fetch = original; }
});
test('proxy rejects unknown routes, cross-site calls and unsupported methods', async () => {
  assert.equal((await proxyPostHog(new Request('https://opax.com.au/ingest/https://evil.test'))).status, 404);
  assert.equal((await proxyPostHog(new Request('https://opax.com.au/ingest/e/', { method: 'POST', headers: { origin: 'https://evil.test' } }))).status, 403);
  assert.equal((await proxyPostHog(new Request('https://opax.com.au/ingest/e/', { method: 'DELETE' }))).status, 405);
});
test('proxy uses asset host and never follows redirects', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.equal(String(url), 'https://us-assets.i.posthog.com/array/token/config');
      return new Response('config');
    };
    assert.equal((await proxyPostHog(new Request('https://opax.com.au/ingest/array/token/config'))).status, 200);
    globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: 'https://evil.test' } });
    assert.equal((await proxyPostHog(new Request('https://opax.com.au/ingest/e/'))).status, 502);
  } finally { globalThis.fetch = original; }
});
