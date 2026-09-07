import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanEvent, beforeSend, safePath } from '../analytics/privacy.mjs';

test('queries, hash query parameters and unrecognized routes are not collected', () => {
  assert.equal(safePath('/search?q=private&speaker=someone#answer'), '/search');
  assert.equal(safePath('https://opax.com.au/#/ask?q=private'), '/ask');
  assert.equal(safePath('/private-input'), '/other');
  assert.deepEqual(cleanEvent('opax_view', { page_path: '/search?q=private', page_title: 'private', page_section: 'search' }), { page_path: '/search', page_section: 'search' });
});
test('event properties are allowlisted and SDK enrichment is sanitized', () => {
  assert.equal(cleanEvent('unexpected', { question: 'private' }), null);
  assert.deepEqual(cleanEvent('opax_ask_completed', { source_count: 3, answer: 'private', has_answer: true }), { source_count: 3, has_answer: true });
  const event = beforeSend({ properties: { $current_url: 'https://opax.com.au/search?q=private', $referrer: 'https://example.com/private', $initial_current_url: 'private', $set: { $initial_current_url: 'private' }, $title: 'private', query_length: 7, search_kind: 'speech' } });
  assert.equal(event.properties.$current_url, 'https://opax.com.au/search');
  assert.equal(event.properties.query_length, 7);
  assert.equal(event.properties.search_kind, 'speech');
  assert.ok(!JSON.stringify(event).includes('private'));
});
test('analytics loads before the shared event emitter, both deferred', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /src="\/analytics.js\?v=[^"]+" defer/);
  assert.match(html, /src="\/events.js\?v=[^"]+" defer/);
  assert.ok(html.indexOf('src="/analytics.js') < html.indexOf('src="/events.js'));
});

test('shared route emitter counts initial visit and back/forward once, without GTM', async () => {
  const { runInNewContext } = await import('node:vm');
  const listeners = new Map();
  const captured = [];
  const location = { href: 'https://opax.com.au/search?q=private', pathname: '/search', search: '?q=private' };
  const context = {
    window: {}, location, document: { title: 'private' },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    addEventListener: (event, handler) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(handler);
    },
    dispatchEvent: (event) => captured.push(event.detail),
  };
  runInNewContext(readFileSync(new URL('../public/events.js', import.meta.url), 'utf8'), context);
  for (const handler of listeners.get('DOMContentLoaded')) handler();
  for (const handler of listeners.get('opax:route')) handler();
  assert.equal(captured.length, 1);
  assert.equal(captured[0].properties.page_path, '/search');
  location.href = 'https://opax.com.au/money'; location.pathname = '/money'; location.search = '';
  for (const handler of listeners.get('opax:route')) handler();
  location.href = 'https://opax.com.au/search?q=private'; location.pathname = '/search'; location.search = '?q=private';
  for (const handler of listeners.get('popstate')) handler();
  for (const handler of listeners.get('opax:route')) handler();
  assert.equal(captured.length, 3);
  assert.ok(!JSON.stringify(captured).includes('private'));
});
