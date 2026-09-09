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


function browserHarness(dnt = '0') {
  const listeners = new Map(), measured = [], scripts = [];
  const location = { hostname: 'opax.com.au', href: 'https://opax.com.au/search?q=private', pathname: '/search', search: '?q=private' };
  const context = {
    URL, navigator: { doNotTrack: dnt }, window: {}, location,
    document: { title: 'private', createElement: () => ({}), head: { appendChild: node => scripts.push(node) } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    addEventListener: (event, handler) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(handler);
    },
    dispatchEvent: event => {
      if (event.type === 'opax:measured') measured.push(event.detail);
      for (const handler of listeners.get(event.type) || []) handler(event);
    },
  };
  context.window.location = location;
  const emit = (type, detail) => context.dispatchEvent({ type, detail });
  return { context, location, measured, scripts, emit };
}

test('route views are deduplicated and outcomes reach both destinations through one boundary', async () => {
  const { runInNewContext } = await import('node:vm');
  const { context, location, measured, emit } = browserHarness();
  runInNewContext(readFileSync(new URL('../public/events.js', import.meta.url), 'utf8'), context);
  emit('DOMContentLoaded'); emit('opax:route');
  assert.equal(measured.length, 1);
  assert.equal(measured[0].properties.page_path, '/search');
  // Changing a map focus, filter, or search query is an interaction, not another page.
  location.href = 'https://opax.com.au/search?q=another'; location.search = '?q=another';
  emit('opax:route');
  assert.equal(measured.length, 1);
  location.href = 'https://opax.com.au/money'; location.pathname = '/money'; location.search = '';
  emit('opax:route');
  location.href = 'https://opax.com.au/search?q=private'; location.pathname = '/search'; location.search = '?q=private';
  emit('popstate'); emit('opax:route');
  assert.equal(measured.length, 3);
  emit('opax:analytics', {event:'opax_ask_completed',properties:{duration_ms:100,source_count:3,answer:'private'}});
  assert.equal(measured.length, 4);
  assert.equal(context.window.dataLayer.length, 4);
  assert.equal(context.window.dataLayer[3].opax.source_count, 3);
  assert.equal(context.window.dataLayer[3].opax.page_section, 'search');
  assert.ok(!JSON.stringify([measured,context.window.dataLayer]).includes('private'));
  emit('opax:analytics', {event:'unknown',properties:{question:'private'}});
  assert.equal(measured.length, 4);
});

test('GA replays early events once, tracks future events once, and strips private context', async () => {
  const { runInNewContext } = await import('node:vm');
  const { context, emit, scripts } = browserHarness();
  const events = readFileSync(new URL('../public/events.js', import.meta.url), 'utf8');
  const ga = readFileSync(new URL('../public/ga.js', import.meta.url), 'utf8');
  runInNewContext(events, context);
  emit('opax:analytics', {event:'opax_search_completed',properties:{result_count:12,query:'private'}});
  runInNewContext(ga, context); runInNewContext(ga, context);
  emit('opax:analytics', {event:'opax_journey',properties:{action:'played',lens:'industry',step:1,step_count:4,recipient:'private'}});
  const sent = context.window.dataLayer.filter(item => item[0] === 'event');
  assert.deepEqual(Array.from(sent, item => item[1]), ['page_view','opax_search_completed','opax_journey']);
  assert.equal(scripts.length, 1);
  assert.equal(context.window.opaxAnalyticsPending, null);
  assert.ok(!JSON.stringify(sent).includes('private'));
  assert.equal(sent[0][2].page_location, 'https://opax.com.au/search');
  assert.equal(sent[2][2].lens, 'industry');
  const settings = context.window.dataLayer.find(item => item[0] === 'set')[1];
  assert.equal(settings.send_page_view, false);
  assert.equal(settings.allow_google_signals, false);
});

test('Do Not Track prevents buffering, dataLayer events and GA loading', async () => {
  const { runInNewContext } = await import('node:vm');
  const { context, emit, measured, scripts } = browserHarness('1');
  for (const file of ['events','ga','gtm']) runInNewContext(readFileSync(new URL(`../public/${file}.js`, import.meta.url), 'utf8'), context);
  emit('opax:analytics', {event:'opax_ask_completed',properties:{source_count:3}});
  assert.equal(measured.length, 0);
  assert.equal(scripts.length, 0);
  assert.equal(context.window.dataLayer, undefined);
});

test('footer partners have explicit referral UTMs and fixed tracking identifiers', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const partner of ['progress_agentic_rag','corpuskit']) {
    assert.match(html, new RegExp('utm_source=opax&amp;utm_medium=referral&amp;utm_campaign=powered_by&amp;utm_content=footer" data-analytics-partner="'+partner+'"'));
  }
  assert.deepEqual(cleanEvent('opax_outbound', {host:'corpuskit.org',partner:'corpuskit',placement:'footer',url:'private'}), {host:'corpuskit.org',partner:'corpuskit',placement:'footer'});
});

 test('PostHog receives the same sanitized lifecycle and context as GA', async () => {
  const { runInNewContext } = await import('node:vm');
  const { context, emit } = browserHarness();
  const captured = [];
  context.cleanEvent = cleanEvent; context.beforeSend = beforeSend;
  context.posthog = { init(){}, capture:(event,properties)=>captured.push({event,properties}) };
  const adapter = readFileSync(new URL('../analytics/index.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm,'');
  runInNewContext(adapter, context);
  runInNewContext(readFileSync(new URL('../public/events.js', import.meta.url), 'utf8'), context);
  runInNewContext(readFileSync(new URL('../public/ga.js', import.meta.url), 'utf8'), context);
  emit('opax:analytics', {event:'opax_ask_failed',properties:{duration_ms:100,cancelled:true,error:'private'}});
  emit('opax:analytics', {event:'opax_outbound',properties:{host:'corpuskit.org',partner:'corpuskit',placement:'footer'}});
  assert.deepEqual(captured.map(e=>e.event), ['$pageview','opax_ask_failed','opax_outbound']);
  assert.ok(!JSON.stringify(captured).includes('private'));
  const ga = context.window.dataLayer.filter(e=>e[0]==='event');
  for (const key of ['host','partner','placement','page_section']) assert.equal(captured[2].properties[key], ga[2][2][key]);
});
